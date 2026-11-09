/* cma_flow.js v1.3 (31 Oct 2026; 8 Nov 2026): the Common Mode Analysis in four steps (customer checklist item 1).
 *
 * v1.3 (8 Nov 2026, Waqas: no duplicates anywhere): a gate already linked by a CMA logged before the four steps counts
 * as taken too (cmaForGate asks no_dupes.js cmaOwner), so a new CMA, Add gate and "Review in CMA" never make a second
 * CMA for it. Live detection on such a gate adopts that earlier CMA into the steps and adds its concern there; the row
 * live detection itself made for the same finding keeps its own path in cma_live.js.
 *
 * One CMA per set of gates, done in four steps, with a status that means something:
 *   1. What must be independent: the AND gates whose inputs are claimed independent (the critical gates, the ones a
 *      DAL reduction rests on, come first), and the independence claim in words.
 *   2. The common mode questionnaire: ARP4761A Appendix M Table M1, every category answered No, Concern or N/A with
 *      why. A Concern opens a row in step 3.
 *   3. Concerns and mitigations: each concern is mitigated (backed by a requirement or evidence) or accepted (with the
 *      reason). A mitigation becomes a generated requirement with one button ("Raise requirement").
 *   4. Close out: the checks, and the signature.
 * Status (derived, never typed):
 *   Open             gates picked, nothing answered yet
 *   In Progress      a category or a concern is still open: the gates' DAL reduction is held back
 *   Mitigated        every category answered, every concern mitigated or accepted, the claim written: the reduction
 *                    is given back (support_modules allocateDAL reads substantiatedGateIds)
 *   Closed — Accepted reviewed and signed. A change to the gates afterwards reopens it.
 * Live common-cause detection (cma_live.js) adds its finding to the CMA that already covers those gates, as a concern
 * that defeats the claim until it is mitigated, never as a second row for the same gates.
 * ANEM drafts (suggested gates, the claim, open answers, mitigations, the summary); each draft waits for Accept. ANEM
 * never sets a number (no beta, no rate).
 * A CMA row keeps every field the rest of the app reads (linkedGateIds, claim, status, findings, mitigation), written
 * from the four steps on every change; the steps live in row.flow.
 */
(function (root) {
    'use strict';
    var VERSION = '1.3';
    var CLOSED = 'Closed — Accepted';
    function _g(n) {
        try { var E = root.SLEnv; if (E && typeof E.get === 'function') { var v = E.get(n); if (v !== undefined) return v; } } catch (_) {}
        try { return root[n]; } catch (_) { return undefined; }
    }
    function S(v) { return String(v == null ? '' : v); }
    function E(v) { return S(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _cma() { try { if (typeof cmaData !== 'undefined' && Array.isArray(cmaData)) return cmaData; } catch (_) {} return root.cmaData || []; }
    function _pages() { var p = _g('ftaPages'); return Array.isArray(p) ? p.filter(function (p) { return !(p && p.integrated && p.integrated.sourcePageId != null); }) : []; }   // 1 Nov 2026 (item 42): an integrated tree is a view of its sources, never counted again (fta_integrated.js)
    function _kids(n) { return (n && (n.children || n._children)) || []; }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }
    function _toast(m, k, ms) { try { if (typeof showToast === 'function') showToast(m, k || 'info', ms || 3500); } catch (_) {} }
    function _jr(k, m) { try { if (typeof root.jrnl === 'function') root.jrnl(k, m); } catch (_) {} }
    function _rowId() { try { if (typeof newRowId === 'function') return newRowId(); } catch (_) {} return 'cmaf-' + Date.now() + Math.random().toString(36).slice(2, 6); }
    var AND_FAMILY = { AND: 1, INHIBIT: 1, PAND: 1, SPARE: 1, SEQ: 1, VOTING: 1 };

    // ---- the categories (ARP4761A App M Table M1, tailored by the project: cma_walkthrough.js) -----------------
    function categories() {
        try { if (root.SLCmaWalk && typeof root.SLCmaWalk.m1 === 'function') return root.SLCmaWalk.m1(); } catch (_) {}
        return [];
    }
    function _catList() { var out = []; categories().forEach(function (g) { (g.items || []).forEach(function (it) { out.push({ id: it[0], label: it[1], group: g.g }); }); }); return out; }

    // ---- the gates -------------------------------------------------------------------------------------------
    function _findNode(n, id) { if (!n) return null; if (String(n.id) === String(id)) return n; var k = _kids(n); for (var i = 0; i < k.length; i++) { var h = _findNode(k[i], id); if (h) return h; } return null; }
    function gateOf(key) {
        var k = S(key), cut = k.lastIndexOf(':'); if (cut < 0) return null;
        var pid = k.slice(0, cut), nid = k.slice(cut + 1);
        var page = _pages().find(function (p) { return p && String(p.id) === pid; }) || null;
        var node = page ? _findNode(page.root, nid) : null;
        return node ? { key: k, page: page, node: node } : null;
    }
    function gateFp(key) {
        var g = gateOf(key); if (!g) return 'gone';
        return S(g.node.gateType) + '|' + _kids(g.node).map(function (c) { return S(c.logicalId != null ? c.logicalId : c.id); }).sort().join(',');
    }
    function gateLabel(key) {
        var g = gateOf(key); if (!g) return S(key) + ' (no longer in the trees)';
        var n = g.node; return S(n.displayId || ('G-' + n.id)) + ' ' + S(n.gateType || 'AND') + (n.name ? ' · ' + S(n.name) : '') + ' · ' + S(g.page.name || g.page.id);
    }
    function gateMembers(key) { var g = gateOf(key); return g ? _kids(g.node).map(function (c) { return S(c.name || c.displayId || c.id); }) : []; }
    // every AND-family gate with two or more inputs, critical first (critical_gates.js)
    function allGates() {
        var crit = {};
        try { if (root.SLCriticalGates) root.SLCriticalGates.analyzeAll().forEach(function (r) { (r.gates || []).forEach(function (x) { if (x.critical) crit[x.key] = true; }); }); } catch (_) {}
        var out = [];
        _pages().forEach(function (p) {
            if (!p || !p.root) return;
            (function w(n) {
                if (!n) return;
                if (n.type === 'gate' && AND_FAMILY[String(n.gateType || '').toUpperCase()] && _kids(n).length >= 2) { var k = p.id + ':' + n.id; out.push({ key: k, critical: !!crit[k], page: p, node: n }); }
                _kids(n).forEach(w);
            })(p.root);
        });
        out.sort(function (a, b) { return (b.critical ? 1 : 0) - (a.critical ? 1 : 0); });
        return out;
    }
    // the four-step CMA a gate is in (one CMA per set of gates)
    // v1.3: an earlier CMA (no steps yet) that links the gate counts too; a four-step CMA wins when both do
    function cmaForGate(key) {
        try { var N = root.SLNoDupes; if (N && typeof N.cmaOwner === 'function') return N.cmaOwner(_cma(), key); } catch (_) {}
        var k = S(key), live = _cma().filter(function (c) { return c && !c.suggested; });
        return live.find(function (c) { return c.flow && (c.flow.gates || []).map(String).indexOf(k) >= 0; }) || live.find(function (c) { return !c.flow && (c.linkedGateIds || []).map(String).indexOf(k) >= 0; }) || null;
    }

    // ---- the row ---------------------------------------------------------------------------------------------
    function _blank() { return { v: 1, step: 1, gates: [], claim: '', answers: {}, concerns: [], gateFp: {}, signedBy: '', signedAt: '', summary: '', drafts: {} }; }
    function _nextId() {
        var mx = 0; _cma().forEach(function (c) { var m = /^CMA-(\d+)$/.exec(S(c && c.cmaId)); if (m) mx = Math.max(mx, +m[1]); });
        return 'CMA-' + String(mx + 1).padStart(3, '0');
    }
    function _nextConcernId(f) { var mx = 0; (f.concerns || []).forEach(function (c) { var m = /^C-(\d+)$/.exec(S(c.id)); if (m) mx = Math.max(mx, +m[1]); }); return 'C-' + (mx + 1); }
    function create(gateKeys, opts) {
        opts = opts || {};
        var f = _blank();
        (gateKeys || []).forEach(function (k) { if (gateOf(k) && !cmaForGate(k) && f.gates.indexOf(S(k)) < 0) f.gates.push(S(k)); });
        var row = { internalId: _rowId(), cmaId: _nextId(), subject: opts.subject || '', claim: '', status: 'Open', findings: '', mitigation: '', references: '', modes: [],
                    linkedGateIds: [], scope: opts.systemId ? 'system' : 'aircraft', owningSystemId: opts.systemId || '', flow: f };
        try { if (root.SLLevelView && root.SLLevelView.stamp) root.SLLevelView.stamp('cma', row); } catch (_) {}
        if (!row.subject) row.subject = f.gates.length ? ('Independence of ' + gateMembers(f.gates[0]).slice(0, 2).join(' and ')) : 'New common mode analysis';
        _cma().push(row);
        sync(row);
        _jr('cma-created', row.cmaId + ' "' + row.subject + '" started (four steps)' + (f.gates.length ? ' on ' + f.gates.map(gateLabel).join('; ') : ''));
        return row;
    }
    // a CMA logged before the four steps: its gates, claim and findings carried over once
    function adopt(row) {
        if (!row || row.flow) return row;
        var f = _blank();
        (row.linkedGateIds || []).forEach(function (k) { if (f.gates.indexOf(S(k)) < 0) f.gates.push(S(k)); });
        f.claim = S(row.claim);
        if (S(row.findings).trim()) f.concerns.push({ id: 'C-1', text: S(row.findings).trim(), effect: '', mitigation: S(row.mitigation).trim(), backedBy: S(row.references).trim(), status: (row.status === 'Mitigated' || row.status === CLOSED) && S(row.mitigation).trim() ? 'Mitigated' : 'Open', from: 'carried over', defeats: true });
        row.flow = f;
        if (row.status === CLOSED) { f.signedBy = 'carried over from the earlier entry'; f.signedAt = new Date().toISOString(); }
        sync(row);
        _jr('cma-adopted', (row.cmaId || 'CMA') + ' moved to the four steps; its gates, claim and findings carried over');
        return row;
    }

    // ---- status ------------------------------------------------------------------------------------------------
    function progress(row) {
        var f = (row && row.flow) || _blank(), cats = _catList();
        var answered = cats.filter(function (c) { var a = f.answers[c.id]; return a && (a.a === 'no' || a.a === 'na' || a.a === 'concern') && S(a.why).trim(); }).length;
        var open = (f.concerns || []).filter(function (c) { return !_concernDone(c); });
        var changed = (f.gates || []).filter(function (k) { return f.gateFp[k] && f.gateFp[k] !== gateFp(k); });
        return { gates: (f.gates || []).length, critical: 0,
                 claim: !!S(f.claim).trim(), cats: cats.length, answered: answered, concerns: (f.concerns || []).length, open: open.length, changed: changed };
    }
    // the page also says how many of its gates are critical (the exact re-calculation, so only when it is on screen)
    function _criticalCount(row) { var crit = {}; allGates().forEach(function (g) { if (g.critical) crit[g.key] = 1; }); return ((row.flow && row.flow.gates) || []).filter(function (k) { return crit[k]; }).length; }
    function _concernDone(c) {
        if (!c) return true;
        if (c.status === 'Mitigated') return !!(S(c.mitigation).trim() && (S(c.backedBy).trim() || c.raise));
        if (c.status === 'Accepted') return !!S(c.acceptWhy).trim();
        return false;
    }
    function statusOf(row) {
        if (!row || !row.flow) return (row && row.status) || 'Open';
        var p = progress(row), f = row.flow;
        if (!p.gates) return 'Open';
        var complete = p.claim && p.cats > 0 && p.answered === p.cats && p.open === 0;
        if (complete && f.signedBy && !p.changed.length) return CLOSED;
        if (complete && !p.changed.length) return 'Mitigated';
        if (!p.answered && !p.concerns && !p.claim) return 'Open';
        return 'In Progress';
    }
    // the app's fields, written from the four steps
    function sync(row) {
        if (!row || !row.flow) return row;
        var f = row.flow, was = row.status;
        f.gates = (f.gates || []).filter(function (k, i, a) { return a.indexOf(k) === i; });
        row.linkedGateIds = f.gates.slice();
        row.claim = S(f.claim);
        row.modes = [];
        // only a concern that defeats the claim (a live finding, or one the engineer marks so) counts as an open common
        // mode for the rest of the app (it compromises the gates); an open question only holds the reduction back
        row.findings = (f.concerns || []).filter(function (c) { return !_concernDone(c) && c.defeats; }).map(function (c) { return c.id + ': ' + S(c.text); }).join(' ');
        row.mitigation = (f.concerns || []).filter(_concernDone).map(function (c) { return c.id + ': ' + (c.status === 'Accepted' ? 'accepted: ' + S(c.acceptWhy) : S(c.mitigation)) + (c.backedBy ? ' (' + S(c.backedBy) + ')' : ''); }).join(' ');
        var p = progress(row);
        if (p.changed.length && f.signedBy) { _jr('cma-reopened', row.cmaId + ' reopened: ' + p.changed.map(gateLabel).join('; ') + ' changed after it was signed by ' + f.signedBy); f.signedBy = ''; f.signedAt = ''; }
        var st = statusOf(row);
        if (st === 'Mitigated' && was !== 'Mitigated' && was !== CLOSED) { f.gateFp = {}; f.gates.forEach(function (k) { f.gateFp[k] = gateFp(k); }); }
        if (st === 'Mitigated' || st === CLOSED) { f.gates.forEach(function (k) { if (!f.gateFp[k]) f.gateFp[k] = gateFp(k); }); }
        if (st !== 'Mitigated' && st !== CLOSED && !p.changed.length) f.gateFp = {};
        row.status = statusOf(row);
        return row;
    }
    function syncAll() { _cma().forEach(function (c) { if (c && c.flow) sync(c); }); }
    // a four-step CMA that is mitigated or closed, with its gates as they were, substantiates their independence
    function substantiates(row) { if (!row || !row.flow) return false; var st = statusOf(row); return (st === 'Mitigated' || st === CLOSED) && !progress(row).changed.length; }
    var _subCache = { gen: null, set: null };
    function substantiatedGateIds() {
        var g = null; try { g = root.SLDataChange && typeof root.SLDataChange.gen === 'function' ? root.SLDataChange.gen() : null; } catch (_) {}
        if (g != null && _subCache.gen === g && _subCache.set) return _subCache.set;
        var set = _substantiatedGateIds(); _subCache = { gen: g, set: set }; return set;
    }
    function _substantiatedGateIds() {
        var set = new Set();
        _cma().forEach(function (c) { if (substantiates(c)) c.flow.gates.forEach(function (k) { var s = S(k); set.add(s.slice(s.lastIndexOf(':') + 1)); }); });
        return set;
    }
    function substantiatedBy(nodeId) { var hit = null; _cma().some(function (c) { if (substantiates(c) && c.flow.gates.some(function (k) { return S(k).slice(S(k).lastIndexOf(':') + 1) === S(nodeId); })) { hit = c; return true; } return false; }); return hit; }
    function _changed(row, what) { sync(row); _subCache = { gen: null, set: null }; _save(); try { if (typeof propagateDalAllRoots === 'function') propagateDalAllRoots(); } catch (_) {} try { if (root.SLDataChange && root.SLDataChange.bump) root.SLDataChange.bump(); } catch (_) {} if (what) _jr('cma-edited', row.cmaId + ': ' + what); }

    // ---- the actions -------------------------------------------------------------------------------------------
    function _row(id) { return _cma().find(function (c) { return c && String(c.internalId) === String(id); }) || null; }
    function addGate(id, key) {
        var r = _row(id); if (!r || !r.flow) return { ok: false, why: 'no such CMA' };
        var other = cmaForGate(key); if (other && other !== r) return { ok: false, why: gateLabel(key) + ' is already in ' + other.cmaId + ' (one CMA per set of gates)' };
        if (!gateOf(key)) return { ok: false, why: 'that gate is not in the trees' };
        if (r.flow.gates.indexOf(S(key)) < 0) r.flow.gates.push(S(key));
        _changed(r, 'gate ' + gateLabel(key) + ' added'); return { ok: true };
    }
    function removeGate(id, key) { var r = _row(id); if (!r || !r.flow) return; r.flow.gates = r.flow.gates.filter(function (k) { return k !== S(key); }); delete r.flow.gateFp[S(key)]; _changed(r, 'gate ' + gateLabel(key) + ' removed'); }
    function setClaim(id, text) { var r = _row(id); if (!r || !r.flow) return; r.flow.claim = S(text).trim(); _changed(r, 'independence claim written'); }
    function answer(id, catId, a, why) {
        var r = _row(id); if (!r || !r.flow) return;
        var f = r.flow, cat = _catList().find(function (c) { return c.id === catId; });
        var prev = f.answers[catId] || {};
        f.answers[catId] = { a: a, why: S(why != null ? why : prev.why).trim(), concernId: prev.concernId || '' };
        if (a === 'concern' && !prev.concernId) {
            var cid = _nextConcernId(f);
            f.concerns.push({ id: cid, text: (cat ? cat.label : catId) + ': ' + (S(why).trim() || 'to be described'), effect: '', mitigation: '', backedBy: '', status: 'Open', from: 'questionnaire ' + catId, defeats: false });
            f.answers[catId].concernId = cid;
        }
        if (a !== 'concern' && prev.concernId) {
            var c = f.concerns.find(function (x) { return x.id === prev.concernId; });
            if (c && c.status === 'Open' && !S(c.mitigation).trim()) f.concerns = f.concerns.filter(function (x) { return x !== c; });
            f.answers[catId].concernId = '';
        }
        _changed(r, (cat ? cat.label : catId) + ' answered ' + a);
    }
    function addConcern(id, c) {
        var r = _row(id); if (!r || !r.flow) return null;
        var x = { id: _nextConcernId(r.flow), text: S(c && c.text).trim(), effect: S(c && c.effect).trim(), mitigation: '', backedBy: '', status: 'Open', from: S((c && c.from) || 'added by hand'), defeats: !!(c && c.defeats), liveKey: (c && c.liveKey) || undefined };
        if (!x.text) return null;
        r.flow.concerns.push(x); _changed(r, 'concern ' + x.id + ' added'); return x;
    }
    function setConcern(id, cid, fields) {
        var r = _row(id); if (!r || !r.flow) return { ok: false };
        var c = r.flow.concerns.find(function (x) { return x.id === cid; }); if (!c) return { ok: false, why: 'no concern ' + cid };
        ['text', 'effect', 'mitigation', 'backedBy', 'acceptWhy'].forEach(function (k) { if (fields[k] != null) c[k] = S(fields[k]).trim(); });
        if (fields.defeats != null) c.defeats = !!fields.defeats;
        if (fields.status) {
            if (fields.status === 'Mitigated' && !(S(c.mitigation).trim() && (S(c.backedBy).trim() || c.raise))) return { ok: false, why: 'a mitigated concern needs its mitigation and what backs it (a requirement or evidence)' };
            if (fields.status === 'Accepted' && !S(c.acceptWhy).trim()) return { ok: false, why: 'an accepted concern needs the reason it is acceptable' };
            c.status = fields.status;
        }
        _changed(r, 'concern ' + cid + ' ' + (fields.status ? fields.status.toLowerCase() : 'edited')); return { ok: true };
    }
    // the mitigation becomes a generated requirement (assurance_modules: generator cma-concern), worded by the engineer
    function raiseRequirement(id, cid, text) {
        var r = _row(id); if (!r || !r.flow) return { ok: false };
        var c = r.flow.concerns.find(function (x) { return x.id === cid; }); if (!c) return { ok: false, why: 'no concern ' + cid };
        var t = S(text).trim();
        if (!/\bshall\b/i.test(t)) return { ok: false, why: 'a requirement says what shall be done ("The design shall ...")' };
        if (!S(c.mitigation).trim()) c.mitigation = t;
        c.raise = true; c.reqText = t; c.backedBy = c.backedBy || 'generated requirement';
        c.status = 'Mitigated';
        _changed(r, 'concern ' + cid + ' backed by a generated requirement');
        try { if (typeof AutoReq !== 'undefined' && AutoReq.recomputeFlags) { AutoReq.recomputeFlags('ac'); (_g('systemsData') || []).forEach(function (sy) { if (sy && sy.id) AutoReq.recomputeFlags('sys-' + sy.id); }); } } catch (_) {}
        return { ok: true };
    }
    function removeConcern(id, cid) {
        var r = _row(id); if (!r || !r.flow) return;
        var c = r.flow.concerns.find(function (x) { return x.id === cid; }); if (!c) return;
        if (c.liveKey) return { ok: false, why: 'a concern from live detection is closed by mitigating or accepting it' };
        r.flow.concerns = r.flow.concerns.filter(function (x) { return x !== c; });
        Object.keys(r.flow.answers).forEach(function (k) { if (r.flow.answers[k].concernId === cid) r.flow.answers[k].concernId = ''; });
        _changed(r, 'concern ' + cid + ' removed'); return { ok: true };
    }
    function sign(id, by) {
        var r = _row(id); if (!r || !r.flow) return { ok: false };
        if (statusOf(r) !== 'Mitigated') return { ok: false, why: 'only a mitigated CMA can be signed: ' + _blockers(r).join('; ') };
        if (!S(by).trim()) return { ok: false, why: 'sign with your name' };
        r.flow.signedBy = S(by).trim(); r.flow.signedAt = new Date().toISOString();
        _changed(r, 'reviewed and signed by ' + r.flow.signedBy); return { ok: true };
    }
    function reopen(id, why) { var r = _row(id); if (!r || !r.flow) return; r.flow.signedBy = ''; r.flow.signedAt = ''; _changed(r, 'reopened' + (why ? ': ' + why : '')); }
    function _blockers(r) {
        var p = progress(r), out = [];
        if (!p.gates) out.push('no gates picked');
        if (!p.claim) out.push('the independence claim is not written');
        if (p.answered < p.cats) out.push((p.cats - p.answered) + ' of ' + p.cats + ' categories not answered');
        if (p.open) out.push(p.open + ' concern' + (p.open === 1 ? '' : 's') + ' still open');
        if (p.changed.length) out.push(p.changed.length + ' gate' + (p.changed.length === 1 ? '' : 's') + ' changed since it was mitigated');
        return out;
    }
    // live detection: a finding on gates a four-step CMA covers becomes a concern there (cma_live.js asks)
    function takeLiveFinding(s) {
        var gates = (s && (s.coupledGates && s.coupledGates.length ? s.coupledGates : s.locations)) || [];
        var r = null; gates.some(function (k) { r = cmaForGate(k); return !!r; });
        if (!r) return null;
        // v1.3: the row live detection made for this same finding keeps its own path (cma_live.js); any other earlier
        // CMA on these gates is brought into the steps and takes the finding as a concern, never a second row
        if (!r.flow) { if (r.autoKey && String(r.autoKey) === String(s.key)) return null; adopt(r); }
        var have = r.flow.concerns.find(function (c) { return c.liveKey === s.key; });
        if (have) { if (have.status !== 'Open') { have.status = 'Open'; _changed(r, 'concern ' + have.id + ' reopened by live detection'); } return r; }
        addConcern(r.internalId, { text: S(s.subject || s.title || 'Common cause found by live detection') + (s.members && s.members.length ? ': ' + s.members.slice(0, 4).join(', ') : ''), effect: 'Defeats the independence of ' + gates.filter(function (k) { return r.flow.gates.indexOf(k) >= 0; }).map(gateLabel).join('; '), from: 'live detection', defeats: true, liveKey: s.key });
        return r;
    }

    // ---- the page --------------------------------------------------------------------------------------------
    var _open = null, _step = 1, _gateFilter = 'critical';
    var BTN = 'font:inherit;font-size:12.5px;font-weight:600;padding:6px 12px;border-radius:8px;border:1px solid var(--color-border-strong,#c7cbd1);background:var(--color-surface-1,#fff);color:inherit;cursor:pointer;min-height:32px;';
    var BTN_P = BTN + 'background:#1A6EF2;border-color:#1A6EF2;color:#fff;';
    var BTN_AI = BTN + 'border-color:#6B4FD8;color:#4B33B0;';
    function _pill(st) {
        var c = st === CLOSED || st === 'Mitigated' || st === 'Accepted' ? 'background:rgba(31,122,51,.12);color:#1F6B30' : st === 'In Progress' ? 'background:rgba(26,110,242,.12);color:#0A4FB8' : 'background:rgba(178,106,0,.13);color:#7A4800';
        return '<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;' + c + '">' + E(st) + '</span>';
    }
    function _host() { return root.document && root.document.getElementById('cma-flow-host'); }
    function render() {
        var h = _host(); if (!h) return;
        var r = _open ? _row(_open) : null;
        if (!r || !r.flow) { _open = null; h.innerHTML = _listHtml(); return; }
        h.innerHTML = _editorHtml(r);
    }
    function _listHtml() {
        var rows = _cma().filter(function (c) { return c && c.flow; });
        return '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:6px 0 12px;">' +
            '<button type="button" style="' + BTN_P + '" onclick="SLCmaFlow.ui.create()">+ New CMA</button>' +
            '<button type="button" data-cma-check-now="1" style="' + BTN + '" onclick="autoDetectCommonModes()" title="Common causes in the fault trees (CCF groups, shared events, shared resources) are found live as the trees change, and each one must be decided. This runs the same check now.">Check common causes now</button>' +
            '<span style="font-size:12.5px;color:var(--color-text-secondary);">One CMA per set of independence gates, in four steps: the gates and the claim, the Appendix M questionnaire, the concerns and their mitigations, and the close out. ' + (rows.length ? 'Open any CMA in the table below to work on it.' : 'Entries logged before the four steps open in them too, with their gates, claim and findings carried over.') + '</span></div>';
    }
    function _steps(r) {
        var p = progress(r), st = statusOf(r); p.critical = _criticalCount(r);
        var subs = [p.gates + ' gate' + (p.gates === 1 ? '' : 's') + (p.critical ? ', ' + p.critical + ' critical' : '') + (p.claim ? '' : ', claim not written'),
                    p.answered + ' of ' + p.cats + ' answered',
                    p.concerns ? (p.concerns + ' concern' + (p.concerns === 1 ? '' : 's') + (p.open ? ', ' + p.open + ' open' : ', all closed')) : 'no concerns yet',
                    st === CLOSED ? 'Signed by ' + r.flow.signedBy : (st === 'Mitigated' ? 'Ready to sign' : 'Needs every step done')];
        var done = [p.gates > 0 && p.claim, p.cats > 0 && p.answered === p.cats, p.concerns === 0 ? p.answered === p.cats : p.open === 0, st === CLOSED];
        var titles = ['What must be independent', 'Common mode questionnaire', 'Concerns and mitigations', 'Close out'];   // the number is in the circle
        return titles.map(function (t, i) {
            var on = _step === i + 1;
            return '<button type="button" data-cma-step="' + (i + 1) + '" onclick="SLCmaFlow.ui.step(' + (i + 1) + ')" style="font:inherit;text-align:left;width:100%;display:flex;justify-content:flex-start;gap:10px;align-items:flex-start;margin:0 0 2px;padding:10px 12px;border-radius:8px;border:1px solid ' + (on ? 'rgba(26,110,242,.35)' : 'transparent') + ';background:' + (on ? 'rgba(26,110,242,.09)' : 'transparent') + ';cursor:pointer;color:inherit;">' +
                '<span style="width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex:none;' + (on ? 'background:#1A6EF2;color:#fff' : (done[i] ? 'background:#1F7A33;color:#fff' : 'background:#ECECEA;color:#101216')) + '">' + (done[i] && !on ? '✓' : (i + 1)) + '</span>' +
                '<span><span style="display:block;font-weight:600;font-size:13px;">' + E(t) + '</span><span style="display:block;font-size:12px;color:var(--color-text-secondary);">' + E(subs[i]) + '</span></span></button>';
        }).join('');
    }
    function _editorHtml(r) {
        var st = statusOf(r);
        var hold = (st === 'Mitigated' || st === CLOSED) ? 'The gates’ DAL reduction is given back.' : 'The gates’ DAL reduction is held back until this CMA is mitigated.';
        return '<div class="controls" data-cma-flow="' + E(r.internalId) + '" style="padding:16px 18px;border-left-color:#1A6EF2;">' +
            '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">' +
              '<button type="button" style="' + BTN + '" onclick="SLCmaFlow.ui.close()">← All CMAs</button>' +
              '<span style="font-family:var(--font-mono);font-size:12.5px;">' + E(r.cmaId) + '</span>' +
              '<input type="text" value="' + E(r.subject) + '" aria-label="CMA subject" onchange="SLCmaFlow.ui.subject(this.value)" style="flex:1;min-width:240px;margin:0;font-weight:700;font-size:15px;">' +
              _pill(st) + '<span style="font-size:12px;color:var(--color-text-secondary);">' + E(hold) + '</span>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:260px minmax(0,1fr);gap:16px;align-items:start;">' +
              '<div>' + _steps(r) + '<div style="margin-top:12px;font-size:11.5px;color:var(--color-text-secondary);line-height:1.5;"><b>Open</b>: gates picked, nothing answered.<br><b>In progress</b>: a category or concern is open; the reduction is held back.<br><b>Mitigated</b>: every concern mitigated or accepted; the reduction is given back.<br><b>Closed, accepted</b>: reviewed and signed; a change to the gates reopens it.</div></div>' +
              '<div data-cma-step-body="' + _step + '">' + [_step1, _step2, _step3, _step4][_step - 1](r) + '</div>' +
            '</div></div>';
    }
    function _draftBox(kind, inner) { return '<div data-cma-draft="' + kind + '" style="background:rgba(107,79,216,.05);outline:1.5px dashed rgba(107,79,216,.55);outline-offset:-2px;border-radius:8px;padding:10px 12px;margin:8px 0;">' + inner + '</div>'; }
    function _aiPill() { return '<span style="display:inline-block;padding:1px 7px;border-radius:999px;font-size:11px;font-weight:700;background:rgba(107,79,216,.12);color:#4B33B0;">ANEM</span> '; }
    function _step1(r) {
        var f = r.flow, all = allGates(), d = f.drafts || {};
        var shown = all.filter(function (g) { return _gateFilter === 'all' || g.critical; });
        var sugg = (d.gates || []).filter(function (x) { return f.gates.indexOf(x.key) < 0 && gateOf(x.key); });
        var row = function (g, why) {
            var inThis = f.gates.indexOf(g.key) >= 0, other = !inThis && cmaForGate(g.key);
            return '<tr data-cma-gate="' + E(g.key) + '"><td>' + E(gateLabel(g.key)) + (why ? '<div style="font-size:11.5px;color:#4B33B0;">' + _aiPill() + E(why) + '</div>' : '') + '</td>' +
                '<td>' + (g.critical ? '<span style="font-size:11px;font-weight:700;padding:1px 7px;border-radius:999px;background:#14171C;color:#fff;">Critical</span>' : '') + '</td>' +
                '<td style="white-space:nowrap;">' + (inThis ? '<span style="font-size:12px;color:#1F6B30;font-weight:600;">Added</span>' : other ? '<span style="font-size:12px;color:var(--color-text-secondary);">in ' + E(other.cmaId) + '</span>' : '<button type="button" style="' + BTN + '" onclick="SLCmaFlow.ui.addGate(\'' + E(g.key) + '\')">Add</button>') +
                (why && !inThis ? ' <button type="button" style="' + BTN + 'border-color:transparent;" onclick="SLCmaFlow.ui.dropSuggestion(\'' + E(g.key) + '\')">Not this one</button>' : '') + '</td></tr>';
        };
        var claimDraft = d.claim ? _draftBox('claim', _aiPill() + E(d.claim.text) + (d.claim.from ? '<div style="font-size:11.5px;color:var(--color-text-secondary);margin-top:4px;">' + E(d.claim.from) + '</div>' : '') +
            '<div style="margin-top:8px;display:flex;gap:6px;"><button type="button" style="' + BTN_P + '" onclick="SLCmaFlow.ui.acceptClaim()">Accept</button><button type="button" style="' + BTN + '" onclick="SLCmaFlow.ui.discard(\'claim\')">Discard</button></div>') : '';
        return '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;"><h4 style="margin:0;">1. What must be independent</h4>' +
              '<button type="button" style="' + BTN_AI + '" data-cma-ai="gates" onclick="SLCmaFlow.ui.ai(\'gates\')">✨ Suggest gates with ANEM</button></div>' +
            '<p style="font-size:12.5px;color:var(--color-text-secondary);margin:6px 0 10px;">Pick the AND gates whose inputs are claimed independent. Critical gates (the ones a DAL reduction rests on) come first.</p>' +
            '<div style="display:flex;gap:0;margin-bottom:8px;"><button type="button" style="' + BTN + (_gateFilter === 'critical' ? 'background:#14171C;color:#fff;border-color:#14171C;' : '') + 'border-radius:8px 0 0 8px;" onclick="SLCmaFlow.ui.filter(\'critical\')">Critical</button><button type="button" style="' + BTN + (_gateFilter === 'all' ? 'background:#14171C;color:#fff;border-color:#14171C;' : '') + 'border-radius:0 8px 8px 0;" onclick="SLCmaFlow.ui.filter(\'all\')">All AND gates (' + all.length + ')</button></div>' +
            '<table class="data-table" style="width:100%;font-size:12.5px;"><tbody>' +
              sugg.map(function (x) { var g = all.find(function (y) { return y.key === x.key; }) || { key: x.key, critical: false }; return row(g, x.why || 'suggested'); }).join('') +
              (shown.length ? shown.filter(function (g) { return !sugg.some(function (x) { return x.key === g.key; }); }).map(function (g) { return row(g); }).join('') : '<tr><td colspan="3" style="color:var(--color-text-secondary);">' + (all.length ? 'No critical gates. Show all AND gates to pick one.' : 'No AND gates in the trees yet: develop the trees, then pick the gates whose inputs are claimed independent.') + '</td></tr>') +
            '</tbody></table>' +
            '<h4 style="margin:16px 0 6px;">Gates in this CMA (' + f.gates.length + ')</h4>' +
            (f.gates.length ? f.gates.map(function (k) { return '<div data-cma-ingate="' + E(k) + '" style="display:flex;gap:8px;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--color-border-hair,#eee);font-size:12.5px;"><span><b>' + E(gateLabel(k)) + '</b><br><span style="color:var(--color-text-secondary);">' + E(gateMembers(k).join(' · ')) + '</span></span><span style="white-space:nowrap;"><button type="button" style="' + BTN + '" onclick="SLCmaFlow.ui.openTree(\'' + E(k) + '\')">Open in tree</button> <button type="button" style="' + BTN + 'color:#A11F16;" onclick="SLCmaFlow.ui.removeGate(\'' + E(k) + '\')">Remove</button></span></div>'; }).join('') : '<div style="font-size:12.5px;color:var(--color-text-secondary);">None yet.</div>') +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin:16px 0 6px;gap:8px;flex-wrap:wrap;"><h4 style="margin:0;">Independence claim</h4><button type="button" style="' + BTN_AI + '" data-cma-ai="claim" onclick="SLCmaFlow.ui.ai(\'claim\')">✨ Draft with ANEM</button></div>' +
            claimDraft +
            '<textarea rows="3" aria-label="Independence claim" onchange="SLCmaFlow.ui.claim(this.value)" placeholder="The inputs of ... share no cause that defeats both." style="width:100%;box-sizing:border-box;">' + E(f.claim) + '</textarea>' +
            '<div style="display:flex;justify-content:flex-end;margin-top:12px;"><button type="button" style="' + BTN_P + '" onclick="SLCmaFlow.ui.step(2)">Next: questionnaire</button></div>';
    }
    function _step2(r) {
        var f = r.flow, groups = categories(), d = (f.drafts || {}).answers || {};
        var nDraft = Object.keys(d).filter(function (k) { return !(f.answers[k] && f.answers[k].a); }).length;
        var html = '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;"><h4 style="margin:0;">2. Common mode questionnaire</h4><span style="display:flex;gap:6px;">' +
            (nDraft ? '<button type="button" style="' + BTN_P + '" onclick="SLCmaFlow.ui.acceptAllAnswers()">Accept all ' + nDraft + ' ANEM answers</button>' : '') +
            '<button type="button" style="' + BTN_AI + '" data-cma-ai="answers" onclick="SLCmaFlow.ui.ai(\'answers\')">✨ Draft the open answers with ANEM</button></span></div>' +
            '<p style="font-size:12.5px;color:var(--color-text-secondary);margin:6px 0 10px;">ARP4761A Appendix M, Table M1, right here. Every category needs an answer and why. "Concern" opens a row in step 3. ANEM reads the architecture, zones and item list; each answer it drafts waits for you.</p>';
        groups.forEach(function (g) {
            var items = g.items || [];
            var n = items.filter(function (it) { var a = f.answers[it[0]]; return a && a.a && S(a.why).trim(); }).length;
            html += '<h5 style="margin:12px 0 4px;font-size:13px;">' + E(g.g) + ' <span style="font-weight:400;color:var(--color-text-secondary);">' + n + '/' + items.length + '</span></h5><table class="data-table" style="width:100%;font-size:12.5px;"><tbody>';
            items.forEach(function (it) {
                var id = it[0], a = f.answers[id] || {}, dr = d[id];
                var showDraft = dr && !a.a;
                var seg = function (v, lab) { var on = a.a === v; return '<button type="button" data-cma-ans="' + id + ':' + v + '" style="' + BTN + 'min-height:28px;padding:3px 9px;' + (on ? 'background:#14171C;color:#fff;border-color:#14171C;' : '') + '" onclick="SLCmaFlow.ui.answer(\'' + id + '\',\'' + v + '\')">' + lab + '</button>'; };
                html += '<tr data-cma-cat="' + id + '"' + (showDraft ? ' style="background:rgba(107,79,216,.05);outline:1.5px dashed rgba(107,79,216,.55);outline-offset:-2px;"' : '') + '><td style="width:34%;">' + E(it[1]) + '</td>' +
                    '<td style="white-space:nowrap;width:170px;">' + (showDraft ? _aiPill() + '<b>' + E({ no: 'No', concern: 'Concern', na: 'N/A' }[dr.a] || dr.a) + '</b>' : seg('no', 'No') + ' ' + seg('concern', 'Concern') + ' ' + seg('na', 'N/A')) + '</td>' +
                    '<td>' + (showDraft ? E(dr.why) + '<div style="margin-top:6px;display:flex;gap:6px;"><button type="button" style="' + BTN_P + 'min-height:28px;padding:3px 10px;" onclick="SLCmaFlow.ui.acceptAnswer(\'' + id + '\')">Accept</button><button type="button" style="' + BTN + 'min-height:28px;padding:3px 10px;" onclick="SLCmaFlow.ui.discardAnswer(\'' + id + '\')">Discard</button></div>'
                        : '<input type="text" value="' + E(a.why) + '" placeholder="' + (a.a ? 'Why (needed before this CMA can close)' : 'Answer, then say why') + '" aria-label="Why" onchange="SLCmaFlow.ui.why(\'' + id + '\', this.value)" style="width:100%;box-sizing:border-box;margin:0;">' + (a.concernId ? '<div style="font-size:11.5px;color:var(--color-text-secondary);">→ ' + E(a.concernId) + '</div>' : '')) + '</td></tr>';
            });
            html += '</tbody></table>';
        });
        return html + '<div style="display:flex;justify-content:space-between;margin-top:12px;"><button type="button" style="' + BTN + '" onclick="SLCmaFlow.ui.step(1)">Back</button><button type="button" style="' + BTN_P + '" onclick="SLCmaFlow.ui.step(3)">Next: concerns</button></div>';
    }
    function _step3(r) {
        var f = r.flow, d = (f.drafts || {}).mitigations || {};
        var html = '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;"><h4 style="margin:0;">3. Concerns and mitigations</h4><span style="display:flex;gap:6px;"><button type="button" style="' + BTN_AI + '" data-cma-ai="mitigations" onclick="SLCmaFlow.ui.ai(\'mitigations\')">✨ Draft mitigations with ANEM</button><button type="button" style="' + BTN + '" onclick="SLCmaFlow.ui.addConcern()">Add a concern</button></span></div>' +
            '<p style="font-size:12.5px;color:var(--color-text-secondary);margin:6px 0 10px;">Each "Concern" answer and each live-detection finding is a row here. Close each one: mitigated (backed by a requirement or evidence) or accepted (with the reason). A mitigation becomes a requirement with one button.</p>' +
            '<table class="data-table" style="width:100%;font-size:12.5px;"><thead><tr><th>ID</th><th>Concern</th><th>Effect on the claim</th><th>Mitigation</th><th>Backed by</th><th>Status</th><th></th></tr></thead><tbody>';
        if (!f.concerns.length) html += '<tr><td colspan="7" style="color:var(--color-text-secondary);">No concerns. A "Concern" answer in step 2, a live-detection finding, or Add a concern puts one here.</td></tr>';
        f.concerns.forEach(function (c) {
            var dr = d[c.id], done = _concernDone(c);
            var stTxt = done ? c.status : (dr ? 'ANEM draft' : 'Open');
            html += '<tr data-cma-concern="' + E(c.id) + '"' + (dr && !done ? ' style="background:rgba(107,79,216,.05);outline:1.5px dashed rgba(107,79,216,.55);outline-offset:-2px;"' : '') + '><td class="u-mono">' + E(c.id) + '</td>' +
                '<td>' + E(c.text) + '<div style="font-size:11px;color:var(--color-text-secondary);">' + E(c.from || '') + (c.defeats ? ' · defeats the claim until closed' : '') + '</div></td>' +
                '<td>' + E(c.effect || '') + '</td>' +
                '<td>' + (dr && !done ? _aiPill() + E(dr.mitigation) : E(c.status === 'Accepted' ? 'Accepted: ' + (c.acceptWhy || '') : (c.mitigation || (done ? '' : '[mitigation needed]')))) + '</td>' +
                '<td>' + E(c.raise ? 'Generated requirement: ' + (c.reqText || '') : (c.backedBy || '')) + '</td>' +
                '<td>' + _pill(stTxt) + '</td>' +
                '<td style="white-space:nowrap;">' + (dr && !done
                    ? '<button type="button" style="' + BTN_P + '" onclick="SLCmaFlow.ui.acceptMitigation(\'' + E(c.id) + '\')">Accept</button> <button type="button" style="' + BTN + '" onclick="SLCmaFlow.ui.discardMitigation(\'' + E(c.id) + '\')">Discard</button>'
                    : (done ? '<button type="button" style="' + BTN + '" onclick="SLCmaFlow.ui.reopenConcern(\'' + E(c.id) + '\')">Reopen</button>'
                        : '<button type="button" style="' + BTN + '" onclick="SLCmaFlow.ui.writeMitigation(\'' + E(c.id) + '\')">Write mitigation</button> <button type="button" style="' + BTN + '" onclick="SLCmaFlow.ui.raise(\'' + E(c.id) + '\')">Raise requirement</button> <button type="button" style="' + BTN + '" onclick="SLCmaFlow.ui.evidence(\'' + E(c.id) + '\')">Evidence</button> <button type="button" style="' + BTN + '" onclick="SLCmaFlow.ui.accept(\'' + E(c.id) + '\')">Accept</button>' + (c.liveKey ? '' : ' <button type="button" style="' + BTN + 'color:#A11F16;border-color:transparent;" onclick="SLCmaFlow.ui.removeConcern(\'' + E(c.id) + '\')">Remove</button>'))) + '</td></tr>';
        });
        return html + '</tbody></table><div style="display:flex;justify-content:space-between;margin-top:12px;"><button type="button" style="' + BTN + '" onclick="SLCmaFlow.ui.step(2)">Back</button><button type="button" style="' + BTN_P + '" onclick="SLCmaFlow.ui.step(4)">Next: close out</button></div>';
    }
    function _step4(r) {
        var p = progress(r), st = statusOf(r), f = r.flow, d = f.drafts || {};
        var line = function (ok, label, txt) { return '<div style="display:flex;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid var(--color-border-hair,#eee);font-size:13px;"><span style="font-weight:700;color:' + (ok ? '#1F6B30' : '#7A4800') + ';min-width:46px;">' + (ok ? 'Done' : 'Open') + '</span><b style="min-width:120px;">' + E(label) + '</b><span>' + E(txt) + '</span></div>'; };
        return '<h4 style="margin:0 0 8px;">4. Close out</h4>' +
            line(p.gates > 0 && p.claim, 'Gates and claim', p.gates + ' gate' + (p.gates === 1 ? '' : 's') + (p.claim ? ', claim written' : ', claim not written')) +
            line(p.cats > 0 && p.answered === p.cats, 'Questionnaire', p.answered + ' of ' + p.cats + ' answered') +
            line(p.open === 0, 'Concerns', p.concerns ? (p.open ? p.open + ' of ' + p.concerns + ' still open' : 'all ' + p.concerns + ' mitigated or accepted') : 'none raised') +
            (p.changed.length ? line(false, 'Gates changed', p.changed.map(gateLabel).join('; ') + ' changed since it was mitigated') : '') +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin:14px 0 6px;gap:8px;flex-wrap:wrap;"><h4 style="margin:0;">Summary</h4><button type="button" style="' + BTN_AI + '" data-cma-ai="summary" onclick="SLCmaFlow.ui.ai(\'summary\')">✨ Draft the CMA summary with ANEM</button></div>' +
            (d.summary ? _draftBox('summary', _aiPill() + E(d.summary.text) + '<div style="margin-top:8px;display:flex;gap:6px;"><button type="button" style="' + BTN_P + '" onclick="SLCmaFlow.ui.acceptSummary()">Accept</button><button type="button" style="' + BTN + '" onclick="SLCmaFlow.ui.discard(\'summary\')">Discard</button></div>') : '') +
            '<textarea rows="4" aria-label="CMA summary" onchange="SLCmaFlow.ui.summary(this.value)" style="width:100%;box-sizing:border-box;">' + E(f.summary) + '</textarea>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:8px;flex-wrap:wrap;"><button type="button" style="' + BTN + '" onclick="SLCmaFlow.ui.step(3)">Back</button>' +
            (st === CLOSED ? '<span style="font-size:13px;">Signed by <b>' + E(f.signedBy) + '</b>, ' + E(S(f.signedAt).slice(0, 10)) + ' <button type="button" style="' + BTN + '" onclick="SLCmaFlow.ui.reopen()">Reopen</button></span>'
                : '<span style="display:flex;gap:8px;align-items:center;"><span style="font-size:12px;color:var(--color-text-secondary);">' + E(st === 'Mitigated' ? 'Every step is done.' : _blockers(r).join('; ')) + '</span><button type="button" data-cma-sign="1" style="' + BTN_P + (st === 'Mitigated' ? '' : 'opacity:.45;cursor:not-allowed;') + '" ' + (st === 'Mitigated' ? '' : 'disabled ') + 'onclick="SLCmaFlow.ui.sign()">Sign and close</button></span>') + '</div>';
    }

    // ---- the page's buttons ---------------------------------------------------------------------------------------
    function _ask(msg, def) { try { if (typeof slPrompt === 'function') return slPrompt(msg, def || ''); } catch (_) {} return Promise.resolve(root.prompt ? root.prompt(msg, def || '') : null); }
    function _cur() { return _open ? _row(_open) : null; }
    function _after() { render(); try { if (typeof renderCMA === 'function') renderCMA(); } catch (_) {} }
    function _askFail(e) { _toast('That did not save: ' + ((e && e.message) || e), 'warning', 6000); }
    var ui = {
        open: function (id) { var r = _row(id); if (!r) return; if (!r.flow) adopt(r); _open = r.internalId; _step = r.flow.step || 1; render(); try { var h = _host(); if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {} },
        create: function (gateKeys) { var r = create(gateKeys || []); _open = r.internalId; _step = 1; _save(); _after(); return r; },
        close: function () { _open = null; render(); },
        step: function (n) { var r = _cur(); _step = n; if (r) r.flow.step = n; render(); },
        subject: function (v) { var r = _cur(); if (r) { r.subject = S(v).trim() || r.subject; _changed(r, 'subject changed'); _after(); } },
        filter: function (v) { _gateFilter = v; render(); },
        addGate: function (k) { var r = _cur(); if (!r) return; var res = addGate(r.internalId, k); if (!res.ok) _toast(res.why, 'warning'); if (r.flow.drafts.gates) r.flow.drafts.gates = r.flow.drafts.gates.filter(function (x) { return x.key !== k; }); _after(); },
        removeGate: function (k) { var r = _cur(); if (r) { removeGate(r.internalId, k); _after(); } },
        dropSuggestion: function (k) { var r = _cur(); if (r && r.flow.drafts.gates) { r.flow.drafts.gates = r.flow.drafts.gates.filter(function (x) { return x.key !== k; }); render(); } },
        openTree: function (k) { var g = gateOf(k); if (g && typeof root.jumpToArtifact === 'function') root.jumpToArtifact({ kind: 'ftaNode', id: g.node.id, tab: 'fta' }); },
        claim: function (v) { var r = _cur(); if (r) { setClaim(r.internalId, v); _after(); } },
        acceptClaim: function () { var r = _cur(); if (r && r.flow.drafts.claim) { setClaim(r.internalId, r.flow.drafts.claim.text); delete r.flow.drafts.claim; _after(); } },
        discard: function (k) { var r = _cur(); if (r) { delete r.flow.drafts[k]; render(); } },
        answer: function (id, a) { var r = _cur(); if (!r) return; var prev = r.flow.answers[id] || {}; answer(r.internalId, id, a, prev.why || ''); _after(); },
        why: function (id, v) { var r = _cur(); if (!r) return; var prev = r.flow.answers[id] || {}; if (!prev.a) { _toast('Pick No, Concern or N/A first.', 'info'); render(); return; } answer(r.internalId, id, prev.a, v); var a = r.flow.answers[id]; if (a.concernId) { var c = r.flow.concerns.find(function (x) { return x.id === a.concernId; }); var cat = _catList().find(function (x) { return x.id === id; }); if (c && c.status === 'Open') { c.text = (cat ? cat.label : id) + ': ' + S(v).trim(); sync(r); } } _after(); },
        acceptAnswer: function (id) { var r = _cur(); if (!r) return; var d = (r.flow.drafts.answers || {})[id]; if (!d) return; answer(r.internalId, id, d.a, d.why); delete r.flow.drafts.answers[id]; _after(); },
        discardAnswer: function (id) { var r = _cur(); if (r && r.flow.drafts.answers) { delete r.flow.drafts.answers[id]; render(); } },
        acceptAllAnswers: function () { var r = _cur(); if (!r) return; var d = r.flow.drafts.answers || {}; Object.keys(d).forEach(function (id) { if (!(r.flow.answers[id] && r.flow.answers[id].a)) answer(r.internalId, id, d[id].a, d[id].why); }); r.flow.drafts.answers = {}; _after(); },
        addConcern: function () { var r = _cur(); if (!r) return; _ask('The concern: what could fail more than one of the independent inputs?', '').then(function (t) { if (!S(t).trim()) return; return _ask('Its effect on the claim (optional):', '').then(function (e) { addConcern(r.internalId, { text: t, effect: e || '', from: 'added by hand' }); _after(); }); }).catch(_askFail); },
        writeMitigation: function (cid) { var r = _cur(); if (!r) return; var c = r.flow.concerns.find(function (x) { return x.id === cid; }); _ask('Mitigation for ' + cid + ':', c ? c.mitigation : '').then(function (t) { if (t == null) return; setConcern(r.internalId, cid, { mitigation: t }); _after(); }).catch(_askFail); },
        raise: function (cid) { var r = _cur(); if (!r) return; var c = r.flow.concerns.find(function (x) { return x.id === cid; }); var def = c && S(c.mitigation).trim() ? (/\bshall\b/i.test(c.mitigation) ? c.mitigation : 'The design shall ' + S(c.mitigation).replace(/^\s*[A-Z]/, function (m) { return m.toLowerCase(); })) : 'The design shall '; _ask('The requirement this mitigation becomes (it is generated from this CMA and traced to its gates):', def).then(function (t) { if (t == null) return; var res = raiseRequirement(r.internalId, cid, t); if (!res.ok) _toast(res.why, 'warning'); _after(); }).catch(_askFail); },
        evidence: function (cid) { var r = _cur(); if (!r) return; var c = r.flow.concerns.find(function (x) { return x.id === cid; }); if (!c || !S(c.mitigation).trim()) { _toast('Write the mitigation first, then the evidence that backs it.', 'info'); return; } _ask('The evidence that backs the mitigation (a test, analysis or document reference):', c.backedBy || '').then(function (t) { if (!S(t).trim()) return; setConcern(r.internalId, cid, { backedBy: t }); var res = setConcern(r.internalId, cid, { status: 'Mitigated' }); if (!res.ok) _toast(res.why, 'warning'); _after(); }).catch(_askFail); },
        accept: function (cid) { var r = _cur(); if (!r) return; _ask('Why this concern is acceptable as it stands (it is recorded with your acceptance):', '').then(function (t) { if (!S(t).trim()) return; setConcern(r.internalId, cid, { acceptWhy: t }); setConcern(r.internalId, cid, { status: 'Accepted' }); _after(); }).catch(_askFail); },
        reopenConcern: function (cid) { var r = _cur(); if (!r) return; var c = r.flow.concerns.find(function (x) { return x.id === cid; }); if (c) { c.status = 'Open'; c.raise = false; _changed(r, 'concern ' + cid + ' reopened'); _after(); } },
        removeConcern: function (cid) { var r = _cur(); if (!r) return; var res = removeConcern(r.internalId, cid); if (res && !res.ok) _toast(res.why, 'warning'); _after(); },
        acceptMitigation: function (cid) { var r = _cur(); if (!r) return; var d = (r.flow.drafts.mitigations || {})[cid]; if (!d) return; setConcern(r.internalId, cid, { mitigation: d.mitigation, effect: d.effect || undefined }); delete r.flow.drafts.mitigations[cid]; _toast(cid + ': the mitigation is in. Back it with a requirement or evidence to close it.', 'info'); _after(); },
        discardMitigation: function (cid) { var r = _cur(); if (r && r.flow.drafts.mitigations) { delete r.flow.drafts.mitigations[cid]; render(); } },
        summary: function (v) { var r = _cur(); if (r) { r.flow.summary = S(v).trim(); _changed(r, 'summary written'); } },
        acceptSummary: function () { var r = _cur(); if (r && r.flow.drafts.summary) { r.flow.summary = r.flow.drafts.summary.text; delete r.flow.drafts.summary; _changed(r, 'summary written'); render(); } },
        sign: function () { var r = _cur(); if (!r) return; var def = ''; try { if (typeof _signoffReviewerName === 'function') def = _signoffReviewerName() || ''; } catch (_) {} _ask('Reviewed: sign with your name to close ' + r.cmaId + '.', def).then(function (t) { if (!S(t).trim()) return; var res = sign(r.internalId, t); if (!res.ok) _toast(res.why, 'warning'); _after(); }).catch(_askFail); },
        reopen: function () { var r = _cur(); if (!r) return; _ask('Why is ' + r.cmaId + ' reopened?', '').then(function (t) { if (t == null) return; reopen(r.internalId, t); _after(); }).catch(_askFail); },
        ai: function (kind) {
            var r = _cur(); if (!r) return;
            var A = root.SafetyLabAI;
            var go = function () { return root.SafetyLabAI.cmaFlowDraft(kind, r.internalId).then(function (res) { if (res && res.ok) { render(); _toast(res.summary || 'ANEM drafted it: review below.', 'info'); } else if (res && res.why) _toast(res.why, 'warning', 6000); }); };
            if (A && typeof A.cmaFlowDraft === 'function') return go();
            if (typeof root.slLoadAI === 'function') return Promise.resolve(root.slLoadAI()).then(function () { if (root.SafetyLabAI && root.SafetyLabAI.cmaFlowDraft) return go(); _toast('ANEM is not available here.', 'warning'); });
            _toast('ANEM is not available here.', 'warning');
        }
    };
    function opened() { return _open; }

    var api = { VERSION: VERSION, CLOSED: CLOSED, categories: categories, allGates: allGates, gateOf: gateOf, gateLabel: gateLabel, gateMembers: gateMembers, gateFp: gateFp, cmaForGate: cmaForGate,
                create: create, adopt: adopt, progress: progress, statusOf: statusOf, sync: sync, syncAll: syncAll, substantiates: substantiates, substantiatedGateIds: substantiatedGateIds, substantiatedBy: substantiatedBy,
                addGate: addGate, removeGate: removeGate, setClaim: setClaim, answer: answer, addConcern: addConcern, setConcern: setConcern, raiseRequirement: raiseRequirement, removeConcern: removeConcern,
                sign: sign, reopen: reopen, blockers: _blockers, takeLiveFinding: takeLiveFinding, render: render, ui: ui, opened: opened };
    // ---- wiring into the CMA page and its neighbours ------------------------------------------------------------
    function _wire() {
        if (typeof root.document === 'undefined') return;
        // Edit on a CMA row opens it in the four steps (an entry logged before them is carried over first)
        if (typeof root.editCMA === 'function' && !root.editCMA._cmaFlow) {
            var legacy = root.editCMA;
            root.editCMA = function (iId) { try { ui.open(iId); } catch (e) { legacy(iId); } };
            root.editCMA._cmaFlow = true; api.legacyEdit = legacy;
        }
        // the page shows the four steps above the table
        if (typeof root.renderCMA === 'function' && !root.renderCMA._cmaFlow) {
            var rc = root.renderCMA;
            root.renderCMA = function () { var out = rc.apply(this, arguments); try { syncAll(); render(); } catch (_) {} return out; };
            root.renderCMA._cmaFlow = true;
        }
        // "Review in CMA" on a critical gate opens the CMA that already has it, or starts one with it
        if (root.SLCriticalGates && !root.SLCriticalGates._cmaFlow) {
            root.SLCriticalGates.startReview = function (key) {
                var have = cmaForGate(key);
                try { if (typeof switchTab === 'function') switchTab('cma'); } catch (_) {}
                if (have) ui.open(have.internalId); else ui.create([key]);
            };
            root.SLCriticalGates._cmaFlow = true;
        }
    }
    _wire();
    if (typeof root.addEventListener === 'function') root.addEventListener('load', function () { _wire(); try { syncAll(); render(); } catch (_) {} });
    try { root.SLCmaFlow = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
