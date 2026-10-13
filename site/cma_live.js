// 13 Oct 2026 (fix G): SEQ joins the AND family for the live common cause check. See tests/regression_fta_handbuild_20261013b.test.js
/* ============================================================================
 * cma_live.js, v1.0, 13 Oct 2026 (fix 6 part B): LIVE common cause detection and a
 * FORCED decision for every suspect.
 * ----------------------------------------------------------------------------
 * Waqas's ruling (13 Oct 2026): suspected common causes are detected live, not on a button.
 * Each suspect (a common cause group, a shared or repeated event across the branches of a
 * redundancy, a shared resource across redundant branches) is flagged the moment it is
 * detected with a prompt that must be answered, Accept or Ignore, before editing carries on,
 * for human-built, tool-generated and AI-drafted trees alike. Ignore needs a written reason.
 * Every decision is recorded with who, when and why. A suspect that reappears in a new place
 * asks again. Accept makes an open common mode analysis (CMA) finding linked to the coupled AND
 * gates, so allocateDAL marks them compromised, the DAL reduction is withdrawn and a common cause
 * term is required. Common cause stays out of the single-failure list (it is caught at the AND
 * gate's independence requirement).
 *
 * WHAT WAS THERE: autoDetectCommonModes (support_modules.js, Phase 57) ran only when someone
 * pressed "Auto-detect from fault trees" and staged SUGGESTED rows that changed nothing until a
 * person clicked Accept; nothing was recorded about who dismissed what, or why.
 *
 * HOW IT WORKS
 *   Triggers   onModelChange(source): scheduleAutosave (every local edit: a person, a tool, an
 *              AI draft or an applied AI proposal, an import, a paste), the end of
 *              _applyProjectData and _restoreProjectSnapshot (open, import, recovery, undo).
 *              Debounced (700 ms after an edit, 1200 ms after a load); one walk of the trees.
 *   Detection  detectSuspects(): one pass over every page plus a memoized "which suspects lie
 *              below this node" pass (transfers followed) that finds the AND-family and voting
 *              gates whose different inputs share a suspect: the gates whose independence the
 *              common cause defeats. Shared resources reuse support_modules'
 *              _sharedResourceCouplings (Phase 58).
 *   Decided?   A suspect is decided when the latest decision for its key covers every current
 *              location, member and coupled AND gate (a new gate, page, member or coupling asks again) AND, for Accept, the
 *              CMA finding it created still exists (deleting the finding without a decision
 *              asks again). A CMA row accepted under the old button flow (autoKey, not
 *              suggested) counts as an accept covering its linked gates.
 *   Prompt     one modal for every pending suspect, a decision per item, Ignore needs a reason.
 *              No close button, Escape and outside clicks do nothing, keys outside it are
 *              swallowed, a removed overlay is put back, and it re-opens on the next change
 *              while anything is pending.
 *   Log        projectConfig.cmaDecisionLog: append-only entries { id, key, kind, subject,
 *              locations, members, coupledGates, decision, reason, by {name, email}, at, via,
 *              cmaInternalId, cmaId }. projectConfig is saved, exported and cloud-synced with
 *              the project; crdt_sync merges this log append-only (PC_LOGS), so two teammates'
 *              decisions both survive. Shown on the CMA page with CSV download.
 *   Automation setAutomation({ actor, decide(suspect) -> { decision, reason } }) or
 *              window.__SL_CMA_AUTOMATION: tests and scripted builds record a decision without
 *              a modal (via: 'automation'). A showcase load (window.__slDemoLoadedAt within
 *              20 s) is recorded by the showcase loader as Ignore with a reason saying no
 *              engineer reviewed it; Reconsider on the log re-opens the prompt for it.
 * ==========================================================================*/
(function (root) {
    'use strict';
    var VERSION = '1.0';
    var DEBOUNCE_EDIT_MS = 700, DEBOUNCE_LOAD_MS = 1200, DEMO_WINDOW_MS = 20000;
    var AND_FAMILY = { AND: 1, INHIBIT: 1, PAND: 1, SPARE: 1, SEQ: 1, VOTING: 1 };   // 13 Oct 2026 (fix G): SEQ

    // ---------------------------------------------------------------- model access (guarded)
    function _pages() { try { return (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) ? ftaPages : []; } catch (_) { return []; } }
    function _cma() {
        try { if (typeof cmaData !== 'undefined') { if (!Array.isArray(cmaData)) cmaData = []; return cmaData; } } catch (_) {}
        if (!Array.isArray(root.cmaData)) root.cmaData = [];
        return root.cmaData;
    }
    function _pc() {
        try { if (typeof projectConfig !== 'undefined') { if (!projectConfig || typeof projectConfig !== 'object') projectConfig = {}; return projectConfig; } } catch (_) {}
        if (!root.projectConfig || typeof root.projectConfig !== 'object') root.projectConfig = {};
        return root.projectConfig;
    }
    function _log() { var pc = _pc(); if (!Array.isArray(pc.cmaDecisionLog)) pc.cmaDecisionLog = []; return pc.cmaDecisionLog; }
    function _report(e) { try { if (root.SLErrorWatch) root.SLErrorWatch.report(e, 'cma_live'); } catch (_) {} }
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function _lid(n) { return String(n && n.logicalId != null ? n.logicalId : (n && n.id)); }
    function _kids(n) { return (n && (n.children || n._children)) || []; }
    function _label(n) { return (n && (n.name || n.displayId)) || ('node ' + (n && n.id)); }

    // ---------------------------------------------------------------- identity
    function whoAmI() {
        try { var me = root.SLAvatar && typeof root.SLAvatar.me === 'function' ? root.SLAvatar.me() : null; if (me && me.email) return { name: me.name || me.email, email: me.email }; } catch (_) {}
        try { var s = root._supabaseSession, u = s && s.user; if (u && u.email) return { name: (u.user_metadata && u.user_metadata.full_name) || u.email, email: String(u.email).toLowerCase() }; } catch (_) {}
        try { if (typeof Review !== 'undefined' && Review && typeof Review.getReviewerName === 'function') { var r = Review.getReviewerName(); if (r) return { name: r, email: '' }; } } catch (_) {}
        return { name: 'Not signed in', email: '' };
    }

    // ---------------------------------------------------------------- detection
    // Returns suspects: { key, kind, subject, members[], memberLabels[], locations[], coupledGates[],
    // locationLabels{}, group, beta, gamma, delta, resource, sharedSubIds }.
    function detectSuspects() {
        var pages = _pages();
        var pageById = new Map();
        pages.forEach(function (p) { if (p && p.id != null) pageById.set(String(p.id), p); });
        var labels = {};
        function gateKey(page, gate) { var k = String(page.id) + ':' + String(gate.id); if (!labels[k]) labels[k] = (page.name || ('Page ' + page.id)) + ' > ' + (gate.displayId || ('gate ' + gate.id)) + (gate.name ? ' (' + gate.name + ')' : '') + (gate.gateType ? ' [' + gate.gateType + ']' : ''); return k; }
        var groups = new Map();      // group -> { members: Map lid -> label, locs: Set, beta, gamma, delta }
        var byLid = new Map();       // lid -> { label, locs: Set, count }
        var nodePage = new Map();    // gate node -> page (for coupled-gate keys)
        var byPage = new Map();      // transferred-in page id -> { locs: Set, count } (a whole branch reused)
        // Pass 1: every page's own tree (transfers not followed: each node is counted where it lives).
        pages.forEach(function (page) {
            if (!page || !page.root) return;
            (function walk(n, parent, seen) {
                if (!n || seen.has(n)) return; seen.add(n);
                if (n.type !== 'gate') {
                    var lid = _lid(n);
                    var loc = parent ? gateKey(page, parent) : (String(page.id) + ':' + String(n.id));
                    if (!parent) labels[loc] = (page.name || ('Page ' + page.id)) + ' > ' + _label(n);
                    if (n.ccfGroup) {
                        var g = String(n.ccfGroup);
                        if (!groups.has(g)) groups.set(g, { members: new Map(), locs: new Set(), beta: n.beta || 0, gamma: n.gamma || 0, delta: n.delta || 0 });
                        var G = groups.get(g); G.members.set(lid, _label(n)); G.locs.add(loc);
                    }
                    if (!byLid.has(lid)) byLid.set(lid, { label: _label(n), locs: new Set(), count: 0 });
                    var L = byLid.get(lid); L.count++; L.locs.add(loc);
                    return;
                }
                nodePage.set(n, page);
                if (n.gateType === 'TRANSFER' || n.transferOutTo) {
                    var tp = String(n.transferOutTo || n.linkedPageId || '');
                    if (tp && pageById.has(tp)) {
                        if (!byPage.has(tp)) byPage.set(tp, { locs: new Set(), count: 0 });
                        var TP = byPage.get(tp); TP.count++; TP.locs.add(parent ? gateKey(page, parent) : (String(page.id) + ':' + String(n.id)));
                    }
                }
                _kids(n).forEach(function (c) { walk(c, n, seen); });
            })(page.root, null, new Set());
        });
        // Tokens that can couple: a group, or a logical event used in two or more places.
        var tokenOf = function (n) {
            var t = null;
            if (n.ccfGroup) t = ['G:' + String(n.ccfGroup)];
            var L = byLid.get(_lid(n));
            if (L && L.count >= 2) t = (t || []).concat(['L:' + _lid(n)]);
            return t;
        };
        // Pass 2: tokens below each node (transfers followed, memoized), and the AND-family /
        // voting gates where a token sits under two or more different inputs.
        var EMPTY = [];
        var memo = new Map(), inProgress = new Set();
        var coupled = new Map();     // token -> Set(gateKey)
        function below(n) {
            if (!n) return EMPTY;
            if (memo.has(n)) return memo.get(n);
            if (inProgress.has(n)) return EMPTY;
            inProgress.add(n);
            var out = EMPTY;
            if (n.type !== 'gate') { out = tokenOf(n) || EMPTY; }
            else if (n.gateType === 'TRANSFER' || n.transferOutTo) {
                var tpid = String(n.transferOutTo || n.linkedPageId), lp = pageById.get(tpid);
                out = (lp && lp.root) ? below(lp.root) : EMPTY;
                var TPo = byPage.get(tpid);
                if (TPo && TPo.count >= 2) out = out.concat(['P:' + tpid]);   // the same branch transferred into two places
            } else {
                var kids = _kids(n), sets = [], union = null;
                for (var i = 0; i < kids.length; i++) {
                    var s = below(kids[i]);
                    sets.push(s);
                    if (s.length) { if (!union) union = new Set(); s.forEach(function (t) { union.add(t); }); }
                }
                if (union) out = Array.from(union);
                if (AND_FAMILY[n.gateType] && union && kids.length >= 2) {
                    var count = new Map();
                    sets.forEach(function (s) { s.forEach(function (t) { count.set(t, (count.get(t) || 0) + 1); }); });
                    var page = nodePage.get(n);
                    count.forEach(function (c, t) {
                        if (c < 2 || !page) return;
                        if (!coupled.has(t)) coupled.set(t, new Set());
                        coupled.get(t).add(gateKey(page, n));
                    });
                }
            }
            inProgress.delete(n);
            memo.set(n, out);
            return out;
        }
        pages.forEach(function (p) { if (p && p.root) below(p.root); });
        // Visit every gate too (a gate only reachable as a page root of a cycle is still covered).
        nodePage.forEach(function (_, gate) { below(gate); });

        var out = [];
        var sortU = function (a) { return Array.from(new Set(a)).sort(); };
        groups.forEach(function (G, g) {
            var members = sortU(Array.from(G.members.keys()));
            out.push({
                key: 'ccf:' + g, kind: 'ccf-group', group: g, beta: G.beta, gamma: G.gamma, delta: G.delta,
                subject: 'CCF group: ' + g,
                members: members, memberLabels: members.map(function (m) { return G.members.get(m); }),
                locations: sortU(Array.from(G.locs)), coupledGates: sortU(Array.from(coupled.get('G:' + g) || []))
            });
        });
        byLid.forEach(function (L, lid) {
            if (L.count < 2) return;
            var cg = coupled.get('L:' + lid);
            if (!cg || !cg.size) return;          // repeated, but no redundancy depends on it: not a common cause
            out.push({
                key: 'shared:' + lid, kind: 'shared-event', lid: lid,
                subject: 'Shared component: ' + L.label,
                members: [lid], memberLabels: [L.label],
                locations: sortU(Array.from(L.locs)), coupledGates: sortU(Array.from(cg))
            });
        });
        byPage.forEach(function (TP, pid) {
            if (TP.count < 2) return;
            var cg = coupled.get('P:' + pid);
            if (!cg || !cg.size) return;
            var pg = pageById.get(pid), nm = (pg && pg.name) || ('page ' + pid);
            out.push({
                key: 'shared-page:' + pid, kind: 'shared-event', lid: 'page ' + pid,
                subject: 'Shared branch (transfer): ' + nm,
                members: ['page:' + pid], memberLabels: [nm],
                locations: sortU(Array.from(TP.locs)), coupledGates: sortU(Array.from(cg))
            });
        });
        // Shared resources across redundant branches (Phase 58 logic, raw couplings).
        try {
            var res = (typeof _sharedResourceCouplings === 'function') ? _sharedResourceCouplings() : [];
            res.forEach(function (f) {
                var k = gateKey(f.page, f.gate);
                var resId = f.resource.resId || f.resource.internalId;
                out.push({
                    key: 'resource:' + resId + ':' + f.page.id + ':' + f.gate.id, kind: 'shared-resource',
                    resource: { id: resId, name: f.resource.name }, sharedSubIds: (f.sharedSubIds || []).slice().sort(),
                    subject: 'Shared resource: ' + f.resource.name,
                    members: (f.sharedSubIds || []).map(String).sort(), memberLabels: (f.sharedSubIdNames || f.sharedSubIds || []).map(String),
                    locations: [k], coupledGates: [k], gateType: f.gate.gateType, gateLabel: f.gate.name || f.gate.displayId || 'AND gate'
                });
            });
        } catch (e) { _report(e); }
        out.forEach(function (s) { s.locationLabels = {}; s.locations.concat(s.coupledGates).forEach(function (k) { s.locationLabels[k] = labels[k] || k; }); });
        out.sort(function (a, b) { return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0); });
        return out;
    }

    // ---------------------------------------------------------------- decision state
    function _subset(a, b) { var B = new Set(b || []); for (var i = 0; i < (a || []).length; i++) if (!B.has(a[i])) return false; return true; }
    function _rowFor(key) { var rows = _cma(); for (var i = rows.length - 1; i >= 0; i--) if (rows[i] && rows[i].autoKey === key) return rows[i]; return null; }
    function latestDecision(key) { var log = _log(); for (var i = log.length - 1; i >= 0; i--) if (log[i] && log[i].key === key) return log[i]; return null; }
    var _reconsider = new Set();     // keys a person asked to decide again (from the log)
    // Why a suspect needs a decision now: null when it does not.
    function needsDecision(s) {
        if (_reconsider.has(s.key)) return { why: 'reconsider', prev: latestDecision(s.key) };
        var d = latestDecision(s.key);
        if (d) {
            var covered = _subset(s.locations, d.locations) && _subset(s.members, d.members) && _subset(s.coupledGates, d.coupledGates);   // a new gate it sits in, a new member, or a new AND gate it now couples
            if (!covered) return { why: 'new-location', prev: d };
            if (d.decision === 'accept') {
                var row = _rowFor(s.key);
                if (!row || row.suggested) return { why: 'finding-removed', prev: d };
            }
            return null;
        }
        var legacy = _rowFor(s.key);
        if (legacy && !legacy.suggested) {
            var linked = (legacy.linkedGateIds || []).map(String);
            if (_subset(s.locations, linked) || _subset(s.coupledGates, linked)) return null;
            return { why: 'new-location', prev: { decision: 'accept', legacy: true, locations: linked, by: { name: 'an earlier review' }, at: '' } };
        }
        return { why: 'new' };
    }

    // ---------------------------------------------------------------- recording a decision
    var _journal = [];               // this session's entries, re-appended after an undo drops them
    function _newId() { return 'CMAD-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
    function _mintCmaId() {
        var max = 0;
        _cma().forEach(function (r) { var m = /^CMA-(\d+)$/.exec(String((r && r.cmaId) || '')); if (m) max = Math.max(max, parseInt(m[1], 10)); });
        return 'CMA-' + String(max + 1).padStart(3, '0');
    }
    function _rowId() { try { if (typeof newRowId === 'function') return newRowId(); } catch (_) {} return Date.now().toString() + Math.random().toString(36).slice(2, 7); }
    function _rowTemplate(s) {
        var linked = s.coupledGates.length ? s.coupledGates.slice() : s.locations.slice();
        var where = linked.map(function (k) { return s.locationLabels[k] || k; }).join('; ');
        var base = { internalId: _rowId(), cmaId: _mintCmaId(), subject: s.subject, modes: [], linkedGateIds: linked, mitigation: '', status: 'Open', scope: 'aircraft', owningSystemId: '', autoSource: s.kind, autoKey: s.key };
        if (s.kind === 'ccf-group') {
            // The group's parameters as the engine resolves them (fix 3: any member order, named as
            // the model they are: beta factor, or MGL with gamma/delta, blank = 1).
            var gp = null;
            try { gp = (typeof ccfReadGroupParams === 'function') ? ccfReadGroupParams(s.group, null) : null; } catch (_) { gp = null; }
            var ptxt = (gp && gp.model === 'mgl')
                ? 'MGL: beta=' + gp.beta + ', gamma=' + (gp.gamma == null ? 1 : gp.gamma) + ', delta=' + (gp.delta == null ? 1 : gp.delta)
                : 'beta factor: beta=' + ((gp && gp.beta) || s.beta);
            base.claim = 'Redundant items in CCF group "' + s.group + '" are not fully independent: a shared cause can fail them together (' + ptxt + ').';
            base.findings = 'Detected live from fault-tree CCF group "' + s.group + '": ' + s.members.length + ' member(s): ' + s.memberLabels.join(', ') + '. Independence it defeats: ' + (where || 'no AND gate yet') + '. Classify the common-cause mode(s) and record the independence / separation argument that justifies beta.';
        } else if (s.kind === 'shared-event') {
            base.claim = 'A single component ("' + s.memberLabels[0] + '") appears under more than one input of a redundancy: its single failure defeats the redundancy it spans.';
            base.findings = 'Detected live: shared/repeated event "' + s.memberLabels[0] + '" (logical ID ' + s.lid + ') used in ' + s.locations.length + ' location(s); it couples ' + where + '. Confirm whether this single resource is intended to feed multiple redundant paths, and capture the justification or design change.';
        } else {
            base.modes = ['shared-resource'];
            base.claim = 'Independence of the channels under ' + s.gateLabel + ' is defeated by loss of the common resource "' + s.resource.name + '".';
            base.findings = 'Channels under this ' + (s.gateType || 'AND') + ' gate both depend on resource "' + s.resource.name + '" (consumed by ' + (s.memberLabels.join(', ') || 'multiple functions') + '); a single loss of that resource defeats the independence this gate assumes.';
        }
        return base;
    }
    function _applyAccept(s, entry) {
        var row = _rowFor(s.key);
        var linked = s.coupledGates.length ? s.coupledGates : s.locations;
        if (row) {
            var had = (row.linkedGateIds || []).map(String), add = linked.filter(function (k) { return had.indexOf(k) < 0; });
            row.linkedGateIds = had.concat(add);
            if (row.suggested) delete row.suggested;
            if (row.status === 'Mitigated' || row.status === 'Closed \u2014 Accepted') {
                row.status = 'Open';
                row.findings = (row.findings ? row.findings + ' ' : '') + 'Reopened ' + entry.at.slice(0, 10) + ': the common cause now also couples ' + add.map(function (k) { return s.locationLabels[k] || k; }).join('; ') + '.';
            }
            if (!row.findings || !String(row.findings).trim()) row.findings = _rowTemplate(s).findings;
            row.decisionId = entry.id;
        } else {
            row = _rowTemplate(s);
            row.decisionId = entry.id;
            _cma().push(row);
        }
        entry.cmaInternalId = row.internalId; entry.cmaId = row.cmaId;
    }
    function _applyIgnore(s) {
        var rows = _cma();
        for (var i = rows.length - 1; i >= 0; i--) if (rows[i] && rows[i].autoKey === s.key && rows[i].suggested) rows.splice(i, 1);   // the old staged suggestion goes, as Dismiss did
    }
    // decide(suspect, 'accept'|'ignore', reason, opts{ via, by }) -> the log entry.
    function decide(s, decision, reason, opts) {
        opts = opts || {};
        decision = decision === 'accept' ? 'accept' : (decision === 'ignore' ? 'ignore' : null);
        if (!decision) throw new Error('cma_live: decision must be accept or ignore');
        reason = String(reason == null ? '' : reason).trim();
        if (decision === 'ignore' && !reason) throw new Error('cma_live: Ignore needs a written reason');
        var by = opts.by || whoAmI();
        var need = needsDecision(s) || {};
        var entry = {
            id: _newId(), key: s.key, kind: s.kind, subject: s.subject,
            locations: s.locations.slice(), locationLabels: s.locations.map(function (k) { return s.locationLabels[k] || k; }),
            coupledGates: s.coupledGates.slice(), members: s.members.slice(), memberLabels: (s.memberLabels || []).slice(),
            decision: decision, reason: reason || 'Accepted as a common cause; an open CMA finding was created.',
            by: { name: String(by.name || ''), email: String(by.email || '') }, at: new Date().toISOString(),
            via: opts.via || 'prompt', trigger: need.why || 'new'
        };
        if (opts.onBehalfOf) entry.onBehalfOf = opts.onBehalfOf;
        if (need.prev && need.prev.id) entry.supersedes = need.prev.id;
        if (decision === 'accept') _applyAccept(s, entry); else _applyIgnore(s);
        var pc = _pc();
        if (!pc.cmaDecisionTag) pc.cmaDecisionTag = 'cmad-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        _log().push(entry);
        _journal.push({ tag: pc.cmaDecisionTag, entry: entry });
        _reconsider.delete(s.key);
        return entry;
    }
    // After an undo or reload of the SAME project (same tag) drops entries this session wrote,
    // put them back: the record that a decision was made is never undone. Whether the suspect is
    // still decided follows from the model (an undone accept has no finding, so it asks again).
    function _restoreJournal() {
        var pc = _pc(); if (!pc.cmaDecisionTag || !_journal.length) return 0;
        var log = _log(), have = new Set(log.map(function (e) { return e && e.id; })), n = 0;
        _journal.forEach(function (j) { if (j.tag === pc.cmaDecisionTag && !have.has(j.entry.id)) { log.push(j.entry); n++; } });
        if (n) log.sort(function (a, b) { return String(a.at || '').localeCompare(String(b.at || '')); });
        return n;
    }

    // ---------------------------------------------------------------- the check
    var _timer = null, _sources = {}, _pending = new Map(), _automation = null, _lastUserInputAt = 0, _checking = false;
    // A person's own input since a showcase load means the next suspects are theirs to decide.
    try { if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') { ['pointerdown', 'keydown'].forEach(function (ev) { document.addEventListener(ev, function (e) { if (e && e.isTrusted !== false && !(_ov && _ov.contains && _ov.contains(e.target))) _lastUserInputAt = Date.now(); }, true); }); } } catch (_) {}
    function _activeAutomation(sources) {
        if (_automation) return _automation;
        if (root.__SL_CMA_AUTOMATION && typeof root.__SL_CMA_AUTOMATION.decide === 'function') return root.__SL_CMA_AUTOMATION;
        try {
            var at = root.__slDemoLoadedAt;
            if (at && (Date.now() - at) < DEMO_WINDOW_MS && !(_lastUserInputAt > at)) return DEMO_POLICY;
        } catch (_) {}
        return null;
    }
    var DEMO_POLICY = {
        actor: 'Showcase loader (automation)',
        decide: function () { return { decision: 'ignore', reason: 'Showcase project built programmatically by the demo loader; no engineer has reviewed this suspect. Use Reconsider in the CMA decision log to decide it.' }; }
    };
    function onModelChange(source) {
        try {
            _sources[source || 'edit'] = 1;
            if (_timer) clearTimeout(_timer);
            var ms = _sources.load ? DEBOUNCE_LOAD_MS : DEBOUNCE_EDIT_MS;
            _timer = setTimeout(function () { _timer = null; checkNow(); }, ms);
        } catch (e) { _report(e); }
    }
    // Run detection now. Returns { suspects, pending, decidedByAutomation }.
    function checkNow(opts) {
        opts = opts || {};
        if (_checking) return null;
        _checking = true;
        var sources = _sources; _sources = {};
        try {
            if (sources.load) _restoreJournal();
            var suspects = detectSuspects();
            var fresh = [];
            suspects.forEach(function (s) { var need = needsDecision(s); if (need) { s.need = need; fresh.push(s); } });
            // Pending items that no longer exist (their tree changed) drop out of the prompt.
            var liveKeys = new Set(fresh.map(function (s) { return s.key; }));
            Array.from(_pending.keys()).forEach(function (k) { if (!liveKeys.has(k)) _pending.delete(k); });
            fresh.forEach(function (s) { _pending.set(s.key, s); });
            var auto = _activeAutomation(sources), done = [];
            if (auto && _pending.size) {
                var me = whoAmI();
                Array.from(_pending.values()).forEach(function (s) {
                    if (auto === DEMO_POLICY && _reconsider.has(s.key)) return;   // a person asked to decide this one
                    var r = auto.decide(s) || {};
                    try {
                        done.push(decide(s, r.decision, r.reason, { via: 'automation', by: { name: auto.actor || 'Automation', email: '' }, onBehalfOf: me }));
                        _pending.delete(s.key);
                    } catch (e) { _report(e); }
                });
                if (done.length) _afterDecisions();
            }
            if (_pending.size) _showModal(); else _hideModal();
            return { suspects: suspects, pending: Array.from(_pending.values()), decidedByAutomation: done };
        } catch (e) { _report(e); return null; }
        finally { _checking = false; }
    }
    function _afterDecisions() {
        try { if (typeof propagateDalAllRoots === 'function') propagateDalAllRoots(); } catch (e) { _report(e); }
        try { if (typeof renderCMA === 'function') renderCMA(); else renderLogPanel(); } catch (e) { _report(e); }
        try { if (typeof updateD3 === 'function') updateD3(); } catch (_) {}
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (e) { _report(e); }
    }

    // ---------------------------------------------------------------- the modal
    var _choices = {};               // key -> { decision, reason }
    var _ov = null, _observer = null, _keyGuard = null, _focusGuard = null;
    function _doc() { try { return (typeof document !== 'undefined' && document && document.body && typeof document.createElement === 'function') ? document : null; } catch (_) { return null; } }
    function _kindLabel(k) { return k === 'ccf-group' ? 'Common cause group' : (k === 'shared-event' ? 'Shared event across redundant branches' : 'Shared resource across redundant branches'); }
    function _itemHtml(s, i) {
        var c = _choices[s.key] || {};
        var where = s.locations.map(function (k) { return '<li>' + _esc(s.locationLabels[k] || k) + '</li>'; }).join('');
        var coupled = s.coupledGates.length
            ? s.coupledGates.map(function (k) { return _esc(s.locationLabels[k] || k); }).join('; ')
            : 'no AND gate couples it yet; the finding links its locations';
        var prev = '';
        if (s.need && s.need.prev && s.need.why !== 'new') {
            var p = s.need.prev;
            var newLocs = s.locations.filter(function (k) { return (p.locations || []).indexOf(k) < 0; });
            prev = '<div class="cmal-prev" style="font-size:12px; background:rgba(245,158,11,.14); border-radius:4px; padding:4px 8px; margin:0 0 6px 0;">' + (s.need.why === 'finding-removed'
                ? 'Accepted earlier, but its CMA finding is gone. Decide it again.'
                : (s.need.why === 'reconsider' ? 'Reopened from the decision log.' : 'Decided earlier (' + _esc(p.decision === 'ignore' ? 'Ignored' : 'Accepted') + (p.by && p.by.name ? ' by ' + _esc(p.by.name) : '') + (p.at ? ', ' + _esc(String(p.at).slice(0, 10)) : '') + (p.reason && p.decision === 'ignore' ? ': "' + _esc(p.reason) + '"' : '') + '). It now appears in a new place' + (newLocs.length ? ': ' + newLocs.map(function (k) { return _esc(s.locationLabels[k] || k); }).join('; ') : ' (new members)') + '.')) + '</div>';
        }
        var name = 'cmal-d-' + i;
        return '<div class="cmal-item" data-key="' + _esc(s.key) + '" style="border:1px solid var(--color-border-hair, #d0d5dd); border-left:4px solid #b91c1c; border-radius:6px; padding:10px 12px; margin:0 0 10px 0; background:var(--color-surface-2, #f8fafc);">'
            + '<div style="font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:#b91c1c;">' + _esc(_kindLabel(s.kind)) + '</div>'
            + '<div style="font-weight:600; margin:2px 0 4px 0;">' + _esc(s.subject) + (s.memberLabels && s.memberLabels.length && s.kind !== 'shared-event' ? ' <span style="font-weight:400;">(' + _esc(s.memberLabels.join(', ')) + ')</span>' : '') + '</div>'
            + prev
            + '<div style="font-size:12px;">Found at:<ul style="margin:2px 0 4px 18px; padding:0;">' + where + '</ul></div>'
            + '<div style="font-size:12px; margin-bottom:6px;">Independence it defeats: <strong>' + coupled + '</strong></div>'
            + '<div style="display:flex; gap:16px; flex-wrap:wrap; font-size:13px;">'
            + '<label style="display:flex; gap:6px; align-items:center; text-transform:none; letter-spacing:0;"><input type="radio" name="' + name + '" value="accept"' + (c.decision === 'accept' ? ' checked' : '') + '> <strong>Accept</strong>: open a CMA finding; the coupled AND gates lose their DAL reduction and need a common cause term</label>'
            + '<label style="display:flex; gap:6px; align-items:center; text-transform:none; letter-spacing:0;"><input type="radio" name="' + name + '" value="ignore"' + (c.decision === 'ignore' ? ' checked' : '') + '> <strong>Ignore</strong>: not a common cause (reason required)</label>'
            + '</div>'
            + '<textarea class="cmal-reason" rows="2" placeholder="' + (c.decision === 'ignore' ? 'Why is this not a common cause? (required)' : 'Note (optional for Accept, required for Ignore)') + '" style="width:100%; margin-top:6px; box-sizing:border-box;">' + _esc(c.reason || '') + '</textarea>'
            + '</div>';
    }
    function _complete() {
        var n = 0;
        _pending.forEach(function (s) { var c = _choices[s.key]; if (c && (c.decision === 'accept' || (c.decision === 'ignore' && String(c.reason || '').trim()))) n++; });
        return n;
    }
    function _renderModal() {
        if (!_ov) return;
        var items = Array.from(_pending.values());
        var n = _complete();
        var card = _ov.querySelector('.cmal-card');
        var scroll = card ? card.querySelector('.cmal-list') : null, top = scroll ? scroll.scrollTop : 0;
        _ov.innerHTML = '<div class="sl-dialog-card cmal-card" role="alertdialog" aria-modal="true" aria-labelledby="cmal-title" style="max-width:760px; width:94vw; max-height:88vh; display:flex; flex-direction:column;">'
            + '<h3 class="sl-dialog-title" id="cmal-title">' + (items.length === 1 ? 'Suspected common cause detected' : items.length + ' suspected common causes detected') + '</h3>'
            + '<div class="sl-dialog-msg" style="margin-bottom:8px;">The fault trees just changed and ' + (items.length === 1 ? 'this item looks' : 'these items look') + ' like a common cause that can defeat a redundancy. Decide each one before editing continues. Every decision is recorded with your name, the time and the reason (CMA page, decision log).</div>'
            + '<div class="cmal-list" style="overflow:auto; flex:1 1 auto; padding-right:4px;">' + items.map(_itemHtml).join('') + '</div>'
            + '<div class="sl-dialog-actions" style="align-items:center;"><span class="cmal-count" style="margin-right:auto; font-size:12px;">' + n + ' of ' + items.length + ' decided</span>'
            + '<button type="button" class="sl-dialog-ok cmal-submit"' + (n === items.length ? '' : ' disabled') + '>Record ' + (items.length === 1 ? 'decision' : items.length + ' decisions') + '</button></div>'
            + '</div>';
        var ns = _ov.querySelector('.cmal-list'); if (ns) ns.scrollTop = top;
    }
    function _onInput(e) {
        var t = e.target, item = t && t.closest ? t.closest('.cmal-item') : null;
        if (!item) return;
        var key = item.getAttribute('data-key'), c = _choices[key] || (_choices[key] = {});
        if (t.type === 'radio') {
            c.decision = t.value;
            var ta = item.querySelector('.cmal-reason'); if (ta) ta.placeholder = c.decision === 'ignore' ? 'Why is this not a common cause? (required)' : 'Note (optional for Accept, required for Ignore)';
            if (c.decision === 'ignore' && ta) setTimeout(function () { try { ta.focus(); } catch (_) {} }, 0);
        } else if (t.classList && t.classList.contains('cmal-reason')) c.reason = t.value;
        var n = _complete(), btn = _ov.querySelector('.cmal-submit'), cnt = _ov.querySelector('.cmal-count');
        if (btn) btn.disabled = n !== _pending.size;
        if (cnt) cnt.textContent = n + ' of ' + _pending.size + ' decided';
    }
    function submitModal() {
        if (_complete() !== _pending.size) return false;
        var me = whoAmI(), done = 0;
        Array.from(_pending.values()).forEach(function (s) {
            var c = _choices[s.key];
            try { decide(s, c.decision, c.reason, { via: 'prompt', by: me }); _pending.delete(s.key); delete _choices[s.key]; done++; } catch (e) { _report(e); }
        });
        if (done) _afterDecisions();
        if (_pending.size) { _renderModal(); _renderedSig = _pendingSig(); } else _hideModal();
        try { if (done && typeof showToast === 'function') showToast(done + ' common cause decision' + (done === 1 ? '' : 's') + ' recorded.', 'success', 3000); } catch (_) {}
        return true;
    }
    // The sign-in gate and the EULA come first: the prompt waits behind them and retries.
    var _gateRetry = null;
    function _gateOpen(d) {
        try {
            var ids = ['sl-auth-gate', 'sl-eula-overlay'];
            for (var i = 0; i < ids.length; i++) {
                var el = d.getElementById(ids[i]);
                if (el && el.isConnected !== false && (typeof getComputedStyle !== 'function' || getComputedStyle(el).display !== 'none') && el.offsetParent !== null) return true;
            }
        } catch (_) {}
        return false;
    }
    var _renderedSig = '';
    function _pendingSig() { return Array.from(_pending.values()).map(function (s) { return s.key + '|' + ((s.need && s.need.why) || '') + '|' + s.locations.join(',') + '|' + s.members.join(','); }).join(';'); }
    function _showModal() {
        var d = _doc(); if (!d) return;
        if (_gateOpen(d)) {
            if (!_gateRetry) _gateRetry = setTimeout(function () { _gateRetry = null; if (_pending.size) _showModal(); }, 2000);
            return;
        }
        if (!_ov) {
            _ov = d.createElement('div');
            _ov.id = 'cma-live-overlay';
            _ov.className = 'modal-overlay show';
            _ov.setAttribute('role', 'presentation');
            _ov.style.cssText = 'display:flex; position:fixed; inset:0; z-index:2147483000; align-items:center; justify-content:center; background:rgba(15,23,42,.55);';
            _ov.addEventListener('click', function (e) {
                var t = e.target;
                if (t && t.classList && t.classList.contains('cmal-submit')) { submitModal(); return; }
                if (t === _ov) { e.preventDefault(); e.stopPropagation(); }        // an outside click does not close it
            }, true);
            _ov.addEventListener('change', _onInput, true);
            _ov.addEventListener('input', _onInput, true);
        }
        var fresh = !_ov.parentNode;
        if (fresh) d.body.appendChild(_ov);
        // Re-render only when the set of suspects changed, so a check that runs while someone is
        // typing a reason does not take the cursor away (choices are kept either way).
        var sig = _pendingSig();
        if (fresh || sig !== _renderedSig) { _renderModal(); _renderedSig = sig; }
        if (!_focusGuard) {
            _focusGuard = function (e) { if (_ov && _ov.parentNode && e.target && !_ov.contains(e.target)) { var f = _ov.querySelector('input,textarea,button'); if (f) try { f.focus(); } catch (_) {} } };
            try { d.addEventListener('focusin', _focusGuard, true); } catch (_) {}
        }
        if (!_keyGuard) {
            _keyGuard = function (e) {
                if (!_ov || !_ov.parentNode) return;
                var inside = _ov.contains(e.target);
                if (e.key === 'Escape' || !inside) { e.preventDefault(); e.stopImmediatePropagation(); if (!inside) { var f = _ov.querySelector('input,textarea,button'); if (f) try { f.focus(); } catch (_) {} } }
            };
            try { d.addEventListener('keydown', _keyGuard, true); } catch (_) {}
        }
        if (!_observer && typeof MutationObserver === 'function') {
            _observer = new MutationObserver(function () { if (_pending.size && _ov && !_ov.parentNode) { try { d.body.appendChild(_ov); _renderModal(); _renderedSig = _pendingSig(); } catch (_) {} } });
            try { _observer.observe(d.body, { childList: true }); } catch (_) {}
        }
        try { var first = _ov.querySelector('input[type=radio]'); if (first && !_ov.contains(d.activeElement)) first.focus(); } catch (_) {}
    }
    function _hideModal() {
        _renderedSig = '';
        if (_ov && _ov.parentNode) { try { _ov.parentNode.removeChild(_ov); } catch (_) {} }
        if (_keyGuard) { try { document.removeEventListener('keydown', _keyGuard, true); } catch (_) {} _keyGuard = null; }
        if (_focusGuard) { try { document.removeEventListener('focusin', _focusGuard, true); } catch (_) {} _focusGuard = null; }
    }

    // ---------------------------------------------------------------- automation
    function setAutomation(policy) {
        if (policy && typeof policy.decide !== 'function') throw new Error('cma_live: automation needs decide(suspect)');
        _automation = policy || null;
        if (_automation && _pending.size) checkNow();
    }
    // Run fn with an automation policy in force, then check once (synchronously) so the
    // trees fn built are decided before the policy is lifted.
    function withAutomation(policy, fn) {
        var prev = _automation; _automation = policy;
        try { var r = fn(); checkNow(); return r; } finally { _automation = prev; }
    }

    // ---------------------------------------------------------------- the log on the CMA page
    function reconsider(key) {
        _reconsider.add(String(key));
        _sources.edit = 1;
        return checkNow();
    }
    function logCsvRows() {
        return _log().map(function (e) {
            return [e.at, (e.by && e.by.name) || '', (e.by && e.by.email) || '', e.decision === 'accept' ? 'Accept' : 'Ignore', e.via || '', e.kind || '', e.subject || '', e.key || '',
                (e.locationLabels || e.locations || []).join(' | '), (e.memberLabels || e.members || []).join(' | '), e.reason || '', e.cmaId || '', e.id || '', (e.onBehalfOf && e.onBehalfOf.name) || ''];
        });
    }
    var CSV_HEADERS = ['When (UTC)', 'Who', 'Email', 'Decision', 'Via', 'Kind', 'Suspect', 'Key', 'Locations', 'Members', 'Why', 'CMA finding', 'Entry ID', 'On behalf of'];
    function downloadLog() {
        try {
            if (typeof downloadCSV === 'function') return downloadCSV('CMA_Decision_Log.csv', CSV_HEADERS, logCsvRows());
        } catch (e) { _report(e); }
    }
    var _showAll = false;
    function renderLogPanel() {
        var d = _doc(); if (!d) return;
        var host = d.getElementById('cma-decision-log');
        if (!host) return;
        var log = _log().slice().reverse();
        var latestByKey = {};
        _log().forEach(function (e) { if (e && e.key) latestByKey[e.key] = e; });
        var shown = _showAll ? log : log.slice(0, 50);
        var rows = shown.map(function (e) {
            var latest = latestByKey[e.key] === e;
            return '<tr>'
                + '<td style="white-space:nowrap;">' + _esc(String(e.at || '').replace('T', ' ').slice(0, 16)) + '</td>'
                + '<td>' + _esc((e.by && e.by.name) || '') + (e.by && e.by.email ? '<div style="font-size:11px; opacity:.75;">' + _esc(e.by.email) + '</div>' : '') + (e.via === 'automation' ? '<div style="font-size:11px; opacity:.75;">automation' + (e.onBehalfOf && e.onBehalfOf.name ? ', session of ' + _esc(e.onBehalfOf.name) : '') + '</div>' : '') + '</td>'
                + '<td><strong style="color:' + (e.decision === 'accept' ? '#b91c1c' : 'inherit') + ';">' + (e.decision === 'accept' ? 'Accept' : 'Ignore') + '</strong>' + (e.cmaId ? '<div style="font-size:11px;">' + _esc(e.cmaId) + '</div>' : '') + '</td>'
                + '<td>' + _esc(e.subject || e.key) + '<div style="font-size:11px; opacity:.75;">' + _esc(_kindLabel(e.kind)) + '</div></td>'
                + '<td style="font-size:12px;">' + (e.locationLabels || e.locations || []).map(_esc).join('<br>') + '</td>'
                + '<td>' + _esc(e.reason || '') + '</td>'
                + '<td>' + (latest && e.decision === 'ignore' ? '<button type="button" class="action-btn" onclick="SLCmaLive.reconsider(\'' + _esc(String(e.key).replace(/\\/g, '\\\\').replace(/'/g, "\\'")) + '\')">Reconsider</button>' : '') + '</td>'
                + '</tr>';
        }).join('');
        var pend = _pending.size;
        host.innerHTML = '<div style="display:flex; align-items:center; gap:12px; margin:18px 0 6px 0; flex-wrap:wrap;">'
            + '<h4 style="margin:0;">Common cause decision log</h4>'
            + '<span style="font-size:12px; color:var(--color-text-secondary);">Suspects are detected live as the fault trees change; each one is decided (Accept or Ignore, with a reason) and recorded here.</span>'
            + (pend ? '<button type="button" class="action-btn btn-red" onclick="SLCmaLive.checkNow()">' + pend + ' pending: decide now</button>' : '')
            + '<button type="button" class="action-btn" style="margin-left:auto;" onclick="SLCmaLive.downloadLog()"' + (log.length ? '' : ' disabled') + '>Download CSV</button>'
            + '</div>'
            + (log.length
                ? '<div style="overflow-x:auto;"><table class="cma-decision-table"><thead><tr><th>When (UTC)</th><th>Who</th><th>Decision</th><th>Suspect</th><th>Locations</th><th>Why</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
                  + (log.length > shown.length ? '<div style="margin-top:6px;"><button type="button" class="action-btn" onclick="SLCmaLive._toggleAll()">Show all ' + log.length + ' entries</button></div>' : '')
                : '<div style="font-size:12px; color:var(--color-text-secondary);">No decisions recorded yet.</div>');
    }

    var api = {
        VERSION: VERSION,
        detectSuspects: detectSuspects,
        needsDecision: needsDecision,
        latestDecision: latestDecision,
        decide: decide,
        onModelChange: onModelChange,
        checkNow: checkNow,
        submitModal: submitModal,
        setAutomation: setAutomation,
        withAutomation: withAutomation,
        reconsider: reconsider,
        pending: function () { return Array.from(_pending.values()); },
        setChoice: function (key, decision, reason) { _choices[key] = { decision: decision, reason: reason }; if (_ov) _renderModal(); },
        whoAmI: whoAmI,
        renderLogPanel: renderLogPanel,
        downloadLog: downloadLog,
        logCsvRows: logCsvRows,
        CSV_HEADERS: CSV_HEADERS,
        _toggleAll: function () { _showAll = !_showAll; renderLogPanel(); },
        _reset: function () { _pending.clear(); _choices = {}; _reconsider.clear(); _journal = []; _automation = null; _sources = {}; if (_timer) { clearTimeout(_timer); _timer = null; } _hideModal(); _lastUserInputAt = 0; },
        _overlay: function () { return _ov; }
    };
    root.SLCmaLive = api;
})(typeof window !== 'undefined' ? window : globalThis);
