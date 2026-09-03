// ============================================================================
// cma_walkthrough.js — v1.1 — CMA-B: guided CMA questionnaire (ARP4761A
// Appendix M, Table M1 — 37 common-cause categories in 7 groups) + a β (CCF)
// recommendation via BETA_SCORING. BORN MODULAR: modal, writes cmaData concern
// rows; stores the assessment (dispositions + defenses + β) on
// projectConfig.cmaWalk[context].
//
// Flow: (1) walk the Table M1 questionnaire, dispositioning each category
// N/A · Concern · Mitigated; (2) score the 8 defense categories
// (None/Partial/Strong) + device type; (3) read the recommended β (deterministic,
// from beta_scoring.js) with rationale + separation/diversity gate; (4) save —
// concern rows land in cmaData (concern → effect → mitigation, Table M2 shape),
// the β is stored for the CCF group.
//
// v1.1 (4 Aug 2026, App M deep-read build — Waqas's rulings in HANDOFF §1b):
//  · PER-PRINCIPLE PASSES (M.3.2.1.3): ctx 'ip:<principle.key>' runs the
//    questionnaire against ONE Independence Principle (Table M2's own shape);
//    concern rows carry the principle tag + the principle's gate ids, so the
//    IP ledger's state machine acts on them — for principles from EVERY
//    source, not just gates. Launch: cmaWalkthroughIp(key) from the ledger.
//  · PHASE AXIS (M.3.2.2 / M.3.3.2): Development vs Verification (ASA
//    checklist) mode; the verification pass shows the development disposition
//    beside each item (the questionnaire "becomes a final ASA checklist");
//    top-level `disp` REMAINS the development pass (legacy state untouched),
//    verification dispositions live in `verDisp`; concern rows carry
//    cmaPhase ('development'|'verification'; ABSENT = legacy development).
//  · TAILORING (M.3.1 / M.3.2.1.2): project-specific categories added and
//    generic ones removed, each with a REQUIRED rationale, on
//    projectConfig.cmaTailor; the rendered questionnaire = generic ∪ added −
//    removed. Table M1 is explicitly not exhaustive; now the tool isn't either.
//  · System level rides the same ctx plumbing ('sys-<id>'), per M.3.3.
//
// Category labels paraphrased from Table M1 (facts/methodology). Source: SAE
// ARP4761A Appendix M (§M.3.1 / Table M1, §M.3.2.1.3 / Table M2, §M.3.2.2).
// ============================================================================
(function () {
    'use strict';
    function _esc(s) { if (typeof esc === 'function') return esc(s); return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _pc() { return (typeof projectConfig !== 'undefined' && projectConfig) ? projectConfig : (window.projectConfig || {}); }
    function _cma() { if (typeof cmaData === 'undefined') { window.cmaData = window.cmaData || []; return window.cmaData; } return cmaData; }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} try { if (typeof renderCMA === 'function') renderCMA(); } catch (_) {} }
    function _rowId() { return (typeof newRowId === 'function') ? newRowId() : ('cw-' + Date.now() + Math.random().toString(36).slice(2, 6)); }
    function _aid() { return (typeof _newAnalysisId === 'function') ? _newAnalysisId('CMA') : ('CMA-' + Math.floor(Math.random() * 9000 + 1000)); }

    var M1 = [
        { g: 'Common resource', items: [
            ['cr-egen', 'Electrical power — generation'], ['cr-edist', 'Electrical power — distribution'],
            ['cr-hgen', 'Hydraulic — generation'], ['cr-hdist', 'Hydraulic — supply / distribution'],
            ['cr-pneu', 'Pneumatic — pressure / vacuum / piping'], ['cr-net', 'Networks'], ['cr-if', 'Interfaces (connectors / routes)'],
            ['cr-proc', 'Processing (compute / devices)'], ['cr-data', 'Data (missing / erroneous / corrupt)'],
            ['cr-store', 'Data storage'], ['cr-db', 'Databases / libraries'], ['cr-sensor', 'Sensors (shared control + monitor)'],
            ['cr-add', 'Additional common resources (per PASA)'] ] },
        { g: 'Development / design', items: [
            ['dv-spec', 'Specification / requirements'], ['dv-sw', 'Software development'], ['dv-hw', 'Hardware development'],
            ['dv-fw', 'Firmware development'], ['dv-tool', 'Tools (CAD / MBSE / RM)'], ['dv-proc', 'Processes / independence'] ] },
        { g: 'Implementation', items: [
            ['im-issue', 'Implementation issues / new technology'], ['im-bay', 'Installation — equipment bays'],
            ['im-cond', 'Installation — environmental conditioning'], ['im-incorrect', 'Equipment installed incorrectly'],
            ['im-part', 'Physical partitioning (barrier failure)'] ] },
        { g: 'Environment', items: [
            ['en-mech', 'Mechanical & thermal'], ['en-em', 'Electromagnetic (EMI / HIRF)'], ['en-chem', 'Chemical (corrosion)'], ['en-bio', 'Miscellaneous (biological)'] ] },
        { g: 'Manufacturing', items: [
            ['mf-mfr', 'Common manufacturer'], ['mf-proc', 'Manufacturing procedures'], ['mf-process', 'Manufacturing process / control'], ['mf-tool', 'Manufacturing tools'] ] },
        { g: 'Operation', items: [ ['op-staff', 'Operations staff'], ['op-proc', 'Operating procedures'] ] },
        { g: 'Maintenance', items: [ ['mt-staff', 'Maintenance staff'], ['mt-proc', 'Maintenance / calibration procedures'], ['mt-loc', 'Location (install / maint interaction)'] ] }
    ];

    function _state(ctx) {
        var pc = _pc(); if (!pc.cmaWalk) pc.cmaWalk = {};
        if (!pc.cmaWalk[ctx]) pc.cmaWalk[ctx] = { disp: {}, defenses: {}, deviceType: 'field', beta: null };
        var s = pc.cmaWalk[ctx];
        // v1.1 lazily-added fields — legacy stored assessments gain them on read.
        if (!s.verDisp) s.verDisp = {};          // verification-phase dispositions (M.3.2.2)
        if (!s.phase) s.phase = 'dev';           // current modal view: 'dev' | 'ver'
        return s;
    }
    // ---- M.3.1 tailoring: generic ∪ added − removed, rationale required ------
    function _tailor() {
        var pc = _pc(); if (!pc.cmaTailor) pc.cmaTailor = { added: [], removed: {} };
        if (!Array.isArray(pc.cmaTailor.added)) pc.cmaTailor.added = [];
        if (!pc.cmaTailor.removed) pc.cmaTailor.removed = {};
        return pc.cmaTailor;
    }
    function _m1Effective() {
        var t = _tailor();
        var groups = M1.map(function (g) {
            return { g: g.g, items: g.items.filter(function (it) { return !t.removed[it[0]]; }).slice() };
        });
        (t.added || []).forEach(function (a) {
            if (!a || !a.id) return;
            var grp = null;
            for (var i = 0; i < groups.length; i++) if (groups[i].g === a.group) { grp = groups[i]; break; }
            if (!grp) {
                for (var j = 0; j < groups.length; j++) if (groups[j].g === 'Project-specific') { grp = groups[j]; break; }
                if (!grp) { grp = { g: 'Project-specific', items: [] }; groups.push(grp); }
            }
            grp.items.push([a.id, a.label || a.id]);
        });
        return groups.filter(function (g) { return g.items.length; });
    }
    function _label(itemId) {
        for (var i = 0; i < M1.length; i++) for (var j = 0; j < M1[i].items.length; j++) if (M1[i].items[j][0] === itemId) return M1[i].items[j][1];
        var a = _tailor().added.filter(function (x) { return x && x.id === itemId; })[0];
        return a ? (a.label || itemId) : itemId;
    }
    // ---- per-principle plumbing (M.3.2.1.3) ----------------------------------
    function _ipFor(ctx) {
        if (String(ctx).indexOf('ip:') !== 0) return null;
        try {
            if (typeof ipLedger !== 'function') return null;
            var key = String(ctx).slice(3);
            return ipLedger().filter(function (p) { return p && p.key === key; })[0] || null;
        } catch (_) { return null; }
    }
    function _ipMembers(ip) { return ip ? ip.members.map(function (m) { return m.label; }).join(' ⊥ ') : ''; }

    window._cmaSetDisp = function (ctx, id, v) {
        var s = _state(ctx);
        // Phase-aware (M.3.2.2): the verification pass never overwrites the
        // development record — it is its own set of dispositions.
        (s.phase === 'ver' ? s.verDisp : s.disp)[id] = v;
        _save(); _renderModal(ctx);
    };
    window._cmaSetPhase = function (ctx, phase) { _state(ctx).phase = (phase === 'ver' ? 'ver' : 'dev'); _save(); _renderModal(ctx); };
    // ---- tailoring handlers (rationale REQUIRED both directions) -------------
    window._cmaTailorAdd = function (ctx) {
        var lab = document.getElementById('cma-tl-label'), grp = document.getElementById('cma-tl-group'), rat = document.getElementById('cma-tl-rat');
        var label = lab && String(lab.value || '').trim(), group = grp && String(grp.value || '').trim(), rationale = rat && String(rat.value || '').trim();
        if (!label || !rationale) { try { if (typeof showToast === 'function') showToast('A project-specific category needs a label AND a tailoring rationale (M.3.1).', 'warning', 4200); } catch (_) {} return; }
        var t = _tailor();
        var id = 'pj-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
        if (_label(id) !== id || t.added.some(function (a) { return a.id === id; })) { try { if (typeof showToast === 'function') showToast('A category with that name already exists.', 'warning', 3600); } catch (_) {} return; }
        t.added.push({ id: id, group: group || 'Project-specific', label: label, rationale: rationale, at: new Date().toISOString() });
        _save(); _renderModal(ctx);
    };
    window._cmaTailorRemove = function (ctx) {
        var sel = document.getElementById('cma-tl-remove'), rat = document.getElementById('cma-tl-remove-rat');
        var id = sel && String(sel.value || ''), rationale = rat && String(rat.value || '').trim();
        if (!id) return;
        if (!rationale) { try { if (typeof showToast === 'function') showToast('Removing a generic Table M1 category needs a tailoring rationale (M.3.1).', 'warning', 4200); } catch (_) {} return; }
        var t = _tailor();
        // Project-specific categories delete outright; generic ones are recorded
        // as removed-with-rationale so the tailoring is auditable.
        var addedIdx = -1;
        t.added.forEach(function (a, i) { if (a.id === id) addedIdx = i; });
        if (addedIdx >= 0) t.added.splice(addedIdx, 1);
        else t.removed[id] = { rationale: rationale, at: new Date().toISOString() };
        _save(); _renderModal(ctx);
    };
    window._cmaTailorRestore = function (ctx, id) { delete _tailor().removed[id]; _save(); _renderModal(ctx); };
    window._cmaSetDefense = function (ctx, key, v) { _state(ctx).defenses[key] = v; _recompute(ctx); _renderModal(ctx); };
    window._cmaSetDevice = function (ctx, v) { _state(ctx).deviceType = v; _recompute(ctx); _renderModal(ctx); };
    function _recompute(ctx) {
        var s = _state(ctx);
        if (!window.BETA_SCORING) return;
        s.betaResult = window.BETA_SCORING.recommendBeta({ deviceType: s.deviceType, defenses: s.defenses });
        s.beta = s.betaResult.beta;
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
    }
    window._cmaSaveWalk = function (ctx) {
        var s = _state(ctx);
        // Materialise concern rows into cmaData for the CURRENT phase —
        // idempotent by cmaCategory + context + phase. Legacy rows carry no
        // cmaPhase; every read treats ABSENT as 'development' (no migration).
        var cd = _cma();
        var phase = (s.phase === 'ver') ? 'verification' : 'development';
        var dispSet = (s.phase === 'ver') ? s.verDisp : s.disp;
        var ip = _ipFor(ctx);
        var scope = 'aircraft', owning = '';
        if (String(ctx).indexOf('sys-') === 0) { scope = 'system'; owning = String(ctx).slice(4); }
        Object.keys(dispSet).forEach(function (id) {
            var v = dispSet[id];
            var existing = cd.find(function (r) { return r && r.origin === 'cma-walkthrough' && r.cmaCategory === id && r.cmaContext === ctx && ((r.cmaPhase || 'development') === phase); });
            if (v === 'concern') {
                if (!existing) cd.push({ internalId: _rowId(), cmaId: _aid(), origin: 'cma-walkthrough', cmaCategory: id, cmaContext: ctx, cmaPhase: phase,
                    subject: 'CMA concern — ' + _label(id) + (ip ? ' — ' + _ipMembers(ip) : ''),
                    claim: ip
                        ? 'Common-cause category "' + _label(id) + '" may defeat the Independence Principle ' + _ipMembers(ip) + '.'
                        : 'Common-cause category "' + _label(id) + '" may defeat independence for ' + ctx + '.',
                    findings: 'Identified as a common-cause concern in the ' + (phase === 'verification' ? 'verification-phase (ASA checklist)' : 'development-phase') + ' CMA questionnaire (ARP4761A Table M1' + (ip ? ', per-principle pass — Table M2' : '') + ').',
                    mitigation: '',
                    status: 'Open', scope: scope, owningSystemId: owning,
                    // Per-IP rows carry the principle's gate ids so the ledger's
                    // ORIGINAL evidence join also sees them; the cmaContext tag
                    // is what reaches gate-less principles (cutset/bow-tie/…).
                    linkedGateIds: ip ? (ip.gateGids || []).slice() : [], computed: false });
            } else if (existing) { // downgraded from concern -> remove (this phase's row only)
                var i = cd.indexOf(existing); if (i >= 0) cd.splice(i, 1);
            }
        });
        _recompute(ctx); _save(); _renderModal(ctx);
        try { if (typeof showToast === 'function') showToast('CMA assessment saved (' + (phase === 'verification' ? 'verification/ASA' : 'development') + ' phase). Recommended β = ' + (s.betaResult ? (s.betaResult.betaPct + '%') : '—') + '.', 'success', 4200); } catch (_) {}
    };
    window._cmaCloseWalk = function () { var m = document.getElementById('cma-wt-modal'); if (m) m.remove(); };

    function _dispBtns(ctx, id) {
        var s = _state(ctx);
        var ver = s.phase === 'ver';
        var cur = (ver ? s.verDisp : s.disp)[id] || 'na';
        var opt = [['na', 'N/A', '#8a8a8a'], ['concern', 'Concern', '#8E2A2A'], ['mitigated', 'Mitigated', '#1E7A34']];
        // Verification mode shows the development answer beside the buttons —
        // M.3.2.2.3: the dev questionnaire, reviewed, "becomes a final ASA
        // checklist"; the analyst re-answers against the AS-BUILT.
        var devChip = '';
        if (ver) {
            var d = s.disp[id];
            devChip = '<span style="font-size:9.5px;color:#8a8a8a;border:1px dashed #C9D2E0;border-radius:5px;padding:0 5px;margin-right:2px;" title="development-phase disposition">dev: ' + (d === 'concern' ? 'Concern' : d === 'mitigated' ? 'Mitigated' : 'N/A') + '</span>';
        }
        return devChip + opt.map(function (o) {
            var on = cur === o[0];
            return '<button onclick="_cmaSetDisp(\'' + ctx + '\',\'' + id + '\',\'' + o[0] + '\')" style="font-size:10px;padding:1px 7px;border:1px solid ' + o[2] + ';border-radius:5px;cursor:pointer;margin-left:3px;' +
                (on ? ('background:' + o[2] + ';color:#fff;') : ('background:transparent;color:' + o[2] + ';')) + '">' + o[1] + '</button>';
        }).join('');
    }
    function _defenseBtns(ctx, key) {
        var cur = _state(ctx).defenses[key];
        var opt = [[0, 'None'], [0.5, 'Partial'], [1, 'Strong']];
        return opt.map(function (o) {
            var on = cur === o[0];
            return '<button onclick="_cmaSetDefense(\'' + ctx + '\',\'' + key + '\',' + o[0] + ')" style="font-size:10px;padding:1px 8px;border:1px solid #007AFF;border-radius:5px;cursor:pointer;margin-left:3px;' +
                (on ? 'background:#007AFF;color:#fff;' : 'background:transparent;color:#007AFF;') + '">' + o[1] + '</button>';
        }).join('');
    }

    function _renderModal(ctx) {
        var m = document.getElementById('cma-wt-modal'); if (!m) return;
        var s = _state(ctx);
        var ip = _ipFor(ctx);
        var ver = s.phase === 'ver';
        var q = _m1Effective().map(function (grp) {
            return '<div style="margin-top:8px;"><div style="font-weight:700;font-size:12px;color:#0B2545;border-bottom:1px solid #EEF2F8;padding-bottom:2px;">' + _esc(grp.g) + '</div>' +
                grp.items.map(function (it) {
                    return '<div style="display:flex;align-items:center;gap:6px;font-size:11.5px;padding:3px 0;">' +
                        '<span>' + _esc(it[1]) + '</span><span style="margin-left:auto;white-space:nowrap;">' + _dispBtns(ctx, it[0]) + '</span></div>';
                }).join('') + '</div>';
        }).join('');
        var defs = (window.BETA_SCORING ? window.BETA_SCORING.defenseCategories() : []).map(function (c) {
            return '<div style="display:flex;align-items:center;gap:6px;font-size:11.5px;padding:3px 0;" title="' + _esc(c.desc) + '">' +
                '<span>' + _esc(c.label) + '</span><span style="margin-left:auto;white-space:nowrap;">' + _defenseBtns(ctx, c.key) + '</span></div>';
        }).join('');
        var dev = ['logic', 'field', 'generic'].map(function (d) {
            var on = (s.deviceType || 'field') === d;
            return '<button onclick="_cmaSetDevice(\'' + ctx + '\',\'' + d + '\')" style="font-size:10px;padding:1px 8px;border:1px solid #0B2545;border-radius:5px;cursor:pointer;margin-left:3px;' + (on ? 'background:#0B2545;color:#fff;' : 'background:transparent;color:#0B2545;') + '">' + d + '</button>';
        }).join('');
        var br = s.betaResult;
        var betaBox = br
            ? '<div style="font-size:12.5px;"><span style="font-size:20px;font-weight:800;color:' + (br.gated ? '#8E2A2A' : '#0B2545') + ';">β = ' + br.betaPct + '%</span>' +
              ' <span style="color:#55555C;">(' + br.deviceType + ' band, defense score ' + Math.round(br.score * 100) + '%' + (br.gated ? ', gated' : '') + ')</span>' +
              '<div style="font-size:11px;color:#55555C;margin-top:3px;">' + _esc(br.rationale) + '</div></div>'
            : '<div style="font-size:12px;color:#8a8a8a;">Score the defenses to get a recommended β.</div>';
        var dispSet = ver ? s.verDisp : s.disp;
        var concerns = Object.keys(dispSet).filter(function (k) { return dispSet[k] === 'concern'; }).length;
        // Phase toggle (M.3.2.2) — the verification pass is the ASA checklist.
        var phaseBar = '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">' +
            ['dev', 'ver'].map(function (ph) {
                var on = (s.phase || 'dev') === ph;
                var lab = ph === 'dev' ? 'Development (PASA/PSSA)' : 'Verification — ASA checklist';
                return '<button onclick="_cmaSetPhase(\'' + ctx + '\',\'' + ph + '\')" style="font-size:10.5px;padding:2px 10px;border:1px solid #0B2545;border-radius:6px;cursor:pointer;' + (on ? 'background:#0B2545;color:#fff;' : 'background:transparent;color:#0B2545;') + '">' + lab + '</button>';
            }).join('') +
            (ver ? '<span style="font-size:10.5px;color:#55555C;">as-built examination — dev answers shown for review (M.3.2.2.3)</span>' : '') + '</div>';
        // Per-principle banner (M.3.2.1.3 / Table M2).
        var ipBar = ip
            ? '<div style="font-size:11.5px;padding:6px 9px;border:1px solid #C9D2E0;border-radius:7px;background:#F4F7FB;margin-bottom:6px;"><b>Independence Principle under analysis:</b> <span class="u-mono">' + _esc(_ipMembers(ip)) + '</span> — one questionnaire pass per principle (Table M2); concerns saved here trace to this principle in the IP ledger.</div>'
            : '';
        // Tailoring section (M.3.1) — rationale required both directions.
        var t = _tailor();
        var removedIds = Object.keys(t.removed);
        var groupOpts = M1.map(function (g) { return '<option>' + _esc(g.g) + '</option>'; }).join('') + '<option>Project-specific</option>';
        var removable = _m1Effective().reduce(function (acc, g) { return acc.concat(g.items); }, []).map(function (it) { return '<option value="' + _esc(it[0]) + '">' + _esc(it[1]) + '</option>'; }).join('');
        var tailorBox =
            '<details style="margin-top:10px;"><summary style="font-size:11.5px;color:#0B2545;cursor:pointer;font-weight:700;">Tailor the questionnaire (M.3.1 — ' + t.added.length + ' added · ' + removedIds.length + ' removed)</summary>' +
            '<div style="font-size:11px;padding:6px 2px;">Table M1 is explicitly not exhaustive. Additions and removals need a recorded rationale.</div>' +
            '<div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;font-size:11px;padding:3px 0;">' +
              '<input id="cma-tl-label" placeholder="new category label" style="flex:1;min-width:130px;font-size:11px;padding:2px 6px;border:1px solid #C9D2E0;border-radius:5px;">' +
              '<select id="cma-tl-group" style="font-size:11px;padding:2px 4px;border:1px solid #C9D2E0;border-radius:5px;">' + groupOpts + '</select>' +
              '<input id="cma-tl-rat" placeholder="tailoring rationale (required)" style="flex:1.4;min-width:150px;font-size:11px;padding:2px 6px;border:1px solid #C9D2E0;border-radius:5px;">' +
              '<button onclick="_cmaTailorAdd(\'' + ctx + '\')" style="font-size:10.5px;padding:2px 10px;border:1px solid #007AFF;border-radius:5px;background:transparent;color:#007AFF;cursor:pointer;">Add</button></div>' +
            '<div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;font-size:11px;padding:3px 0;">' +
              '<select id="cma-tl-remove" style="flex:1;min-width:140px;font-size:11px;padding:2px 4px;border:1px solid #C9D2E0;border-radius:5px;">' + removable + '</select>' +
              '<input id="cma-tl-remove-rat" placeholder="removal rationale (required)" style="flex:1.4;min-width:150px;font-size:11px;padding:2px 6px;border:1px solid #C9D2E0;border-radius:5px;">' +
              '<button onclick="_cmaTailorRemove(\'' + ctx + '\')" style="font-size:10.5px;padding:2px 10px;border:1px solid #8E2A2A;border-radius:5px;background:transparent;color:#8E2A2A;cursor:pointer;">Remove</button></div>' +
            (removedIds.length ? '<div style="font-size:10.5px;color:#55555C;padding:3px 0;">Tailored out: ' + removedIds.map(function (id) {
                return '<span style="border:1px solid #E4E9F1;border-radius:5px;padding:0 5px;margin-right:4px;" title="' + _esc((t.removed[id] || {}).rationale || '') + '">' + _esc(_label(id)) + ' <a style="cursor:pointer;color:#007AFF;" onclick="_cmaTailorRestore(\'' + ctx + '\',\'' + id + '\')">restore</a></span>';
            }).join('') + '</div>' : '') +
            '</details>';
        m.querySelector('#cma-wt-body').innerHTML =
            phaseBar + ipBar +
            '<div style="font-weight:700;color:#0B2545;font-size:12.5px;">1 · Common-cause questionnaire (Table M1' + (ver ? ' as ASA checklist' : '') + ' — ' + concerns + ' concern' + (concerns === 1 ? '' : 's') + ')</div>' + q + tailorBox +
            '<div style="margin-top:14px;font-weight:700;color:#0B2545;font-size:12.5px;">2 · Defense posture → β</div>' +
            '<div style="display:flex;align-items:center;gap:6px;font-size:11.5px;padding:3px 0;"><span>Device type</span><span style="margin-left:auto;">' + dev + '</span></div>' + defs +
            '<div style="margin-top:10px;padding:10px;border:1px solid #D8DEE9;border-radius:8px;background:#F7F9FC;">' +
              '<div style="font-weight:700;color:#0B2545;font-size:12px;margin-bottom:4px;">Recommended β (CCF)</div>' + betaBox + '</div>' +
            '<div style="margin-top:10px;text-align:right;"><button onclick="_cmaSaveWalk(\'' + ctx + '\')" style="font-size:12px;padding:5px 14px;border:1px solid #007AFF;border-radius:6px;background:#007AFF;color:#fff;cursor:pointer;">Save assessment</button></div>';
    }

    window.cmaWalkthrough = function (ctx, label) {
        ctx = ctx || 'aircraft';
        window._cmaCloseWalk();
        var ov = document.createElement('div'); ov.id = 'cma-wt-modal';
        ov.style.cssText = 'position:fixed;inset:0;z-index:2147483601;display:flex;align-items:center;justify-content:center;background:rgba(8,12,20,.5);padding:24px;';
        ov.innerHTML = '<div style="background:#fff;color:#202024;border-radius:14px;max-width:660px;width:100%;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.32);">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid #EEF2F8;">' +
              '<div><div style="font-weight:700;color:#0B2545;">CMA walkthrough — ' + _esc(label || ctx) + '</div>' +
              '<div style="font-size:11.5px;color:#55555C;">ARP4761A Appendix M — 37-category questionnaire → recommended β (IEC 61508-6 / NUREG).</div></div>' +
              '<button onclick="_cmaCloseWalk()" style="border:none;background:transparent;font-size:22px;cursor:pointer;color:#888;">&times;</button></div>' +
            '<div id="cma-wt-body" style="padding:12px 18px;overflow:auto;"></div></div>';
        ov.addEventListener('mousedown', function (e) { if (e.target === ov) ov.remove(); });
        document.body.appendChild(ov);
        _recompute(ctx); _renderModal(ctx);
    };

    // Per-principle launcher (M.3.2.1.3) — called from the IP ledger page.
    window.cmaWalkthroughIp = function (key) {
        var ctx = 'ip:' + key;
        var ip = _ipFor(ctx);
        window.cmaWalkthrough(ctx, ip ? ('Principle ' + _ipMembers(ip)) : ('Principle ' + key));
    };
    // System-level launcher (M.3.3) — same code path, system ctx.
    window.cmaWalkthroughSys = function (sysId) {
        var s = null;
        try { s = (typeof systemsData !== 'undefined' ? systemsData : []).filter(function (x) { return x && x.id === sysId; })[0]; } catch (_) {}
        window.cmaWalkthrough('sys-' + sysId, (s && s.name ? s.name : sysId) + ' (system level)');
    };
})();
