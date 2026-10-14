// ============================================================================
// change_ack.js - v1.2 - 13 Oct 2026 (late, Waqas: "when a user saves a choice/change it should be
// autosaving"): an acknowledged change is SAVED at once (save_state.js v2.0 AutoSave). Added for
// that: acceptedSnapshot() (the project as accepted so far: everything acknowledged, nothing still
// waiting, the state AutoSave writes while moves or undos are still collected), SLRecords.applyToObject
// (a diff laid onto a snapshot without touching the live model) and reopen() (changes a crash left
// unacknowledged are asked about again on the next open). The dialogs say the change saves.
// change_ack.js - v1.1 - 13 Oct 2026 (night, Waqas rulings 1 and 2): moving a box on a diagram
// (a change that only moves or resizes) and Undo / Redo inside diagrams and the fault tree no
// longer ask per action. They are COLLECTED (deferred()) and acknowledged together, in one list,
// when the person leaves the view (switching tab or fault tree, opening another project, Save,
// closing): Acknowledge keeps them, Cancel puts back only them (content changes acknowledged in
// between are laid back on top). Content edits still ask per gesture.
// change_ack.js - v1.0 - 13 Oct 2026 - every change asks for acknowledgement.
//
// WAQAS, 12 OCT (hand testing, ruling 2, "option B: literally every change"): every change
// shows what changes and what it touches, and the engineer acknowledges it or cancels it
// (Cancel puts it back). Undo still works.
//
// THE FUNNEL. Every edit in this app already ends in scheduleAutosave() (R18: the one
// "the project changed" call; save_watch.js catches a writer that forgets within a second).
// scheduleAutosave calls SLChangeAck.noteChange(), so EVERY change reaches this module
// without any writer having to know about it. What the module does with it:
//
//   1. remembers the project as it was just before the first unacknowledged change. That
//      copy is free: it is the last autosave payload (helpers_modules._writeAutosave hands it
//      to stash()), taken at the end of the previous change;
//   2. waits for the change to be FINISHED: 450 ms of quiet, no mouse button held (a drag is
//      one change), and not while the engineer is still typing in the field that changed (a
//      field is one change, committed when focus leaves it or Enter is pressed). A synchronous
//      burst (an AI accept writing 40 rows) is one change; begin()/end() and batch() group
//      longer work (a generator, an async AI apply, a diagram drag) into one;
//   3. works out WHAT CHANGED, row by row, fault tree node by node and setting by setting
//      (SLRecords below: the same row keys the live sync uses), in plain words;
//   4. works out WHAT IT TOUCHES downstream with the existing trace machinery: the golden
//      thread graph (_gtvBuildGraph) for failure conditions, fault trees and common cause
//      rows, and the modification impact closure (modImpact, mod_impact.js) for functions,
//      systems and items, including the handed-off assessments the change will reopen;
//   5. asks, in one house dialog: Acknowledge, or Cancel change. Cancel restores the copy
//      from step 1 (the same restore Undo uses) and re-renders. Acknowledge pushes that copy
//      onto the undo stack, so Undo takes back exactly one acknowledged change;
//   6. records the decision in the project journal (who, when, what, what it touches).
//
// WHAT IS NOT ASKED. Loads, live-sync merges, undo/redo and restores run as SYSTEM changes
// (system(), __crdtApply, _restoreSnap). The app's own bookkeeping (the journal, the activity
// log, empty settings created on first use, recomputed numbers held in underscore fields) is
// shown to nobody: a change made of nothing else is AUTOMATIC. A change nobody started (no
// keyboard or mouse input in the last 3 s, no open group) and that carries no AI-drafted
// rows is also automatic: the background sweeps (seeded MF&MS trees, proposal stores) derive
// it from the model again whenever it is needed, so asking about it would only teach people
// to click without reading.
//
// SAVING (save_state.js v2.0): an acknowledged change is saved at once (this device, the live
// sync and the cloud copy); only what still waits for an acknowledgement is unsaved.
//
// API: see scratchpad CHANGE_ACK_API.md and window.SLChangeAck at the bottom.
// Tests: tests/regression_change_ack_20261013b.test.js (unit, vm) and
//        tests/regression_change_ack_ui_20261013b.test.js (browser).
// ============================================================================
(function () {
    'use strict';
    var W = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);

    var QUIET_MS = 450;          // a change is finished after this much quiet
    var USER_WINDOW_MS = 3000;   // a change this soon after keyboard or mouse input was made by the person
    var IMPACT_BUDGET_MS = 1500; // the impact walk stops here on a huge project and says so
    var SHOW_ITEMS = 14;         // rows listed before "and N more"

    function _now() { return Date.now(); }
    function _S(v) { try { var s = JSON.stringify(v === undefined ? null : v); return s === undefined ? 'null' : s; } catch (_) { return '"!"'; } }
    function _P(s) { try { return s == null ? undefined : JSON.parse(s); } catch (_) { return undefined; } }
    function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _clip(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

    // =======================================================================
    // SLRecords: the project as keyed records, the diff between two of them, and applying a diff
    // onto the live model. Same keys as crdt_sync.js, so a record here is a record there.
    // =======================================================================
    var KEYS = { acFunctionsData: 'subId', acFhaData: 'internalId', acReqData: 'internalId', acAssumptionsData: 'asmId', praData: 'internalId', zsaData: 'internalId', cmaData: 'internalId', fmeaData: 'internalId', acFcimData: 'internalId', routingData: 'internalId', resourcesData: 'internalId', itemsData: 'internalId', flightPhasesData: 'phase', systemsData: 'id' };
    var COLS = Object.keys(KEYS);
    var WHOLE = ['mlData', 'projectName', 'stpaData'];
    // Project stores outside the live sync that are still the person's work. Left out on purpose:
    // the view position (activeSystemId, activeFTAPageId), id counters, review comments and
    // approvals (their own signed audit trail, like the journal) and ftaConfig (it mirrors the
    // open tree's settings as trees are opened; the tree's own record carries an edit).
    var OTHER = ['acExtractedFCs', 'aiAssumptions', 'projectBaselines', 'autoReqTemplateOverrides', 'projectReportEdits', 'projectTemplates', 'projectSourceDocs'];
    var OTHER_LABEL = { acExtractedFCs: 'Extracted failure conditions', aiAssumptions: 'AI assumptions', projectBaselines: 'Baselines', autoReqTemplateOverrides: 'Requirement templates', projectReportEdits: 'Report text', projectTemplates: 'Project templates', projectSourceDocs: 'Source documents' };
    function _keys() { try { if (W.SafetyLabCRDT && typeof W.SafetyLabCRDT.keys === 'function') { var k = W.SafetyLabCRDT.keys(); if (k && k.acFhaData) return k; } } catch (_) {} return KEYS; }

    // Fault-tree pages as page shells + one record per node (the crdt_sync decomposition; its own
    // copy is used when the sync module is loaded, so the two can never disagree).
    function _strip(n) { var o = {}; for (var k in n) { if (k === 'children' || k === '_children') continue; if (Object.prototype.hasOwnProperty.call(n, k)) o[k] = n[k]; } return o; }
    function _decompose(pages) {
        try { if (W.SafetyLabCRDT && W.SafetyLabCRDT._fta && W.SafetyLabCRDT._fta.decompose) return W.SafetyLabCRDT._fta.decompose(pages); } catch (_) {}
        var shells = [], nodes = [];
        (pages || []).forEach(function (pg) {
            if (!pg || pg.id == null || pg.id === '') return;
            var sh = {}; for (var k in pg) { if (k === 'root') continue; if (Object.prototype.hasOwnProperty.call(pg, k)) sh[k] = pg[k]; }
            sh.__hasTree = (pg.root != null); shells.push(sh);
            if (pg.root == null) return;
            (function walk(n, parentId, order) {
                if (!n || n.id == null || n.id === '') return;
                var kids = Array.isArray(n.children) ? n.children : null, collapsed = false;
                if (!kids && Array.isArray(n._children)) { kids = n._children; collapsed = true; }
                nodes.push({ nodeKey: String(pg.id) + ':' + String(n.id), pageId: pg.id, nodeId: n.id, parentId: (parentId == null ? null : parentId), order: order, kidsCollapsed: collapsed, node: _strip(n) });
                (kids || []).forEach(function (c, i) { walk(c, n.id, i); });
            })(pg.root, null, 0);
        });
        return { shells: shells, nodes: nodes };
    }
    function _keyed(arr, kf) {
        var map = new Map(), order = [];
        (arr || []).forEach(function (it, i) {
            var k = (it && it[kf] != null && it[kf] !== '') ? String(it[kf]) : ('#' + i);   // keyless rows are diffed by position (the sync never carries them)
            if (map.has(k)) return;
            map.set(k, _S(it)); order.push(k);
        });
        return { map: map, order: order, key: kf };
    }
    // records(src): src is the live model (_live()) or a parsed snapshot; both have the store names.
    function records(src) {
        var R = {}, K = _keys();
        src = src || {};
        COLS.forEach(function (name) { if (Array.isArray(src[name])) R['col:' + name] = _keyed(src[name], K[name] || KEYS[name]); });
        if (Array.isArray(src.ftaPages)) {
            var d = _decompose(src.ftaPages);
            R['fta:shell'] = _keyed(d.shells, 'id');
            R['fta:node'] = _keyed(d.nodes, 'nodeKey');
        }
        var wm = new Map(), wo = [];
        WHOLE.forEach(function (n) { if (Object.prototype.hasOwnProperty.call(src, n) && src[n] !== undefined) { wm.set(n, _S(src[n])); wo.push(n); } });
        R.whole = { map: wm, order: wo, key: null };
        var pc = src.projectConfig, pm = new Map(), po = [];
        if (pc && typeof pc === 'object') Object.keys(pc).forEach(function (k) { if (pc[k] === undefined) return; pm.set(k, _S(pc[k])); po.push(k); });
        R.pc = { map: pm, order: po, key: null };
        // the stores the live sync does not carry: compared whole (they are small), never rebased
        var om = new Map(), oo = [];
        OTHER.forEach(function (n) {
            if (!Object.prototype.hasOwnProperty.call(src, n) || src[n] === undefined) return;
            om.set(n, n === 'projectSourceDocs' ? _S((Array.isArray(src[n]) ? src[n] : []).map(function (d) { return d ? String(d.id || '') + '|' + String(d.name || d.fileName || d.title || '') : ''; })) : _S(src[n]));
            oo.push(n);
        });
        R.other = { map: om, order: oo, key: null };
        return R;
    }
    var EMPTY_SPACE = { map: new Map(), order: [] };
    function diff(A, B) {
        var out = [], seen = {};
        Object.keys(A || {}).concat(Object.keys(B || {})).forEach(function (s) {
            if (seen[s]) return; seen[s] = 1;
            var a = (A && A[s]) || EMPTY_SPACE, b = (B && B[s]) || EMPTY_SPACE;
            b.order.forEach(function (k) {
                var av = a.map.get(k), bv = b.map.get(k);
                if (av === undefined) out.push({ space: s, key: k, op: 'added', a: null, b: bv });
                else if (av !== bv) out.push({ space: s, key: k, op: 'changed', a: av, b: bv });
            });
            a.order.forEach(function (k) { if (!b.map.has(k)) out.push({ space: s, key: k, op: 'removed', a: a.map.get(k), b: null }); });
            if (s.indexOf('col:') === 0) {     // rows moved without changing (a table re-sort by hand)
                var bk = b.order.filter(function (k) { return a.map.has(k); }), ak = a.order.filter(function (k) { return b.map.has(k); });
                for (var i = 0; i < ak.length; i++) if (ak[i] !== bk[i]) { out.push({ space: s, key: '(order)', op: 'reordered', a: null, b: null }); break; }
            }
        });
        return out;
    }
    // Apply a diff onto the LIVE model (the rebase: what the doc holds now, plus this person's
    // unsaved records). Builds a partial for __crdtApply, which merges in place (references held
    // by editors survive) and re-renders. Only the spaces the diff touches are included.
    function applyToModel(D, live) {
        live = live || _live();
        var partial = {}, touched = {};
        (D || []).forEach(function (e) { if (e.op !== 'reordered' && String(e.key).charAt(0) !== '#') touched[e.space] = true; });
        var setDel = function (sp, space) {
            (D || []).forEach(function (e) {
                if (e.space !== space || e.op === 'reordered' || String(e.key).charAt(0) === '#') return;
                if (e.op === 'removed') { if (sp.map.has(e.key)) { sp.map.delete(e.key); sp.order = sp.order.filter(function (k) { return k !== e.key; }); } }
                else { if (!sp.map.has(e.key)) sp.order.push(e.key); sp.map.set(e.key, e.b); }
            });
            return sp.order.map(function (k) { return _P(sp.map.get(k)); }).filter(function (x) { return x !== undefined; });
        };
        var K = _keys();
        COLS.forEach(function (name) {
            if (!touched['col:' + name]) return;
            partial[name] = setDel(_keyed(live[name] || [], K[name] || KEYS[name]), 'col:' + name);
        });
        if (touched['fta:shell'] || touched['fta:node']) {
            var d = _decompose(live.ftaPages || []);
            var shells = setDel(_keyed(d.shells, 'id'), 'fta:shell'), nodes = setDel(_keyed(d.nodes, 'nodeKey'), 'fta:node');
            var rec = (W.SafetyLabCRDT && W.SafetyLabCRDT._fta && W.SafetyLabCRDT._fta.recompose) ? W.SafetyLabCRDT._fta.recompose : null;
            if (rec) partial.ftaPages = rec(shells, nodes);
        }
        if (touched.whole) (D || []).forEach(function (e) { if (e.space === 'whole' && e.op !== 'removed') partial[e.key] = _P(e.b); });
        if (touched.pc) {
            var pc = _P(_S(live.projectConfig || {})) || {};
            (D || []).forEach(function (e) { if (e.space !== 'pc') return; if (e.op === 'removed') delete pc[e.key]; else pc[e.key] = _P(e.b); });
            partial.projectConfig = pc;
        }
        if (Object.keys(partial).length && typeof W.__crdtApply === 'function') system(function () { W.__crdtApply(partial); });
        return partial;
    }
    // The same diff laid onto a SNAPSHOT (a parsed project), never the live model: returns a new
    // object (the stores the diff does not touch are shared with obj, unchanged). AutoSave uses it
    // to write the accepted project while moves or undos are still waiting. Fault trees are put
    // back together with the live sync's own recompose; without it (the sync module not loaded)
    // a touched tree is taken whole from the live model, which then also carries its waiting moves.
    function applyToObject(obj, D) {
        obj = obj || {};
        var out = {}, touched = {}, K = _keys();
        Object.keys(obj).forEach(function (k) { out[k] = obj[k]; });
        (D || []).forEach(function (e) { if (e.op !== 'reordered' && String(e.key).charAt(0) !== '#') touched[e.space] = true; });
        var setDel = function (sp, space) {
            (D || []).forEach(function (e) {
                if (e.space !== space || e.op === 'reordered' || String(e.key).charAt(0) === '#') return;
                if (e.op === 'removed') { if (sp.map.has(e.key)) { sp.map.delete(e.key); sp.order = sp.order.filter(function (k) { return k !== e.key; }); } }
                else { if (!sp.map.has(e.key)) sp.order.push(e.key); sp.map.set(e.key, e.b); }
            });
            return sp.order.map(function (k) { return _P(sp.map.get(k)); }).filter(function (x) { return x !== undefined; });
        };
        COLS.forEach(function (name) { if (touched['col:' + name]) out[name] = setDel(_keyed(obj[name] || [], K[name] || KEYS[name]), 'col:' + name); });
        if (touched['fta:shell'] || touched['fta:node']) {
            var rec = (W.SafetyLabCRDT && W.SafetyLabCRDT._fta && W.SafetyLabCRDT._fta.recompose) ? W.SafetyLabCRDT._fta.recompose : null;
            if (rec) {
                var d = _decompose(obj.ftaPages || []);
                out.ftaPages = rec(setDel(_keyed(d.shells, 'id'), 'fta:shell'), setDel(_keyed(d.nodes, 'nodeKey'), 'fta:node'));
            } else { var lv = _live(); if (lv.ftaPages) out.ftaPages = _P(_S(lv.ftaPages)); }
        }
        (D || []).forEach(function (e) {
            if (e.space === 'whole') { if (e.op === 'removed') delete out[e.key]; else out[e.key] = _P(e.b); }
            else if (e.space === 'other') {
                if (e.key === 'projectSourceDocs') { var l2 = _live(); out.projectSourceDocs = l2.projectSourceDocs; }   // compared by id and name only: the live list is the record
                else if (e.op === 'removed') delete out[e.key]; else out[e.key] = _P(e.b);
            }
        });
        if (touched.pc) {
            var pc = _P(_S(obj.projectConfig || {})) || {};
            (D || []).forEach(function (e) { if (e.space !== 'pc') return; if (e.op === 'removed') delete pc[e.key]; else pc[e.key] = _P(e.b); });
            out.projectConfig = pc;
        }
        return out;
    }

    // The live model, by direct reference (classic scripts share one global lexical scope; the
    // production CSP forbids eval, so every store is named here, guarded by typeof).
    function _live() {
        var o = {};
        try { if (typeof acFunctionsData !== 'undefined') o.acFunctionsData = acFunctionsData; } catch (_) {}
        try { if (typeof acFhaData !== 'undefined') o.acFhaData = acFhaData; } catch (_) {}
        try { if (typeof acReqData !== 'undefined') o.acReqData = acReqData; } catch (_) {}
        try { if (typeof acAssumptionsData !== 'undefined') o.acAssumptionsData = acAssumptionsData; } catch (_) {}
        try { if (typeof praData !== 'undefined') o.praData = praData; } catch (_) {}
        try { if (typeof zsaData !== 'undefined') o.zsaData = zsaData; } catch (_) {}
        try { if (typeof cmaData !== 'undefined') o.cmaData = cmaData; } catch (_) {}
        try { if (typeof fmeaData !== 'undefined') o.fmeaData = fmeaData; } catch (_) {}
        try { if (typeof acFcimData !== 'undefined') o.acFcimData = acFcimData; } catch (_) {}
        try { if (typeof routingData !== 'undefined') o.routingData = routingData; } catch (_) {}
        try { if (typeof resourcesData !== 'undefined') o.resourcesData = resourcesData; } catch (_) {}
        try { if (typeof itemsData !== 'undefined') o.itemsData = itemsData; } catch (_) {}
        try { if (typeof flightPhasesData !== 'undefined') o.flightPhasesData = flightPhasesData; } catch (_) {}
        try { if (typeof systemsData !== 'undefined') o.systemsData = systemsData; } catch (_) {}
        try { if (typeof ftaPages !== 'undefined') o.ftaPages = ftaPages; } catch (_) {}
        try { if (typeof projectConfig !== 'undefined') o.projectConfig = projectConfig; } catch (_) {}
        try { if (typeof mlData !== 'undefined') o.mlData = mlData; } catch (_) {}
        try { if (typeof projectName !== 'undefined') o.projectName = projectName; } catch (_) {}
        try { if (typeof stpaData !== 'undefined') o.stpaData = stpaData; } catch (_) {}
        try { if (typeof acExtractedFCs !== 'undefined') o.acExtractedFCs = acExtractedFCs; } catch (_) {}
        try { if (typeof aiAssumptions !== 'undefined') o.aiAssumptions = aiAssumptions; } catch (_) {}
        try { if (typeof projectBaselines !== 'undefined') o.projectBaselines = projectBaselines; } catch (_) {}
        try { if (typeof autoReqTemplateOverrides !== 'undefined') o.autoReqTemplateOverrides = autoReqTemplateOverrides; } catch (_) {}
        try { if (typeof projectReportEdits !== 'undefined') o.projectReportEdits = projectReportEdits; } catch (_) {}
        try { if (typeof projectTemplates !== 'undefined') o.projectTemplates = projectTemplates; } catch (_) {}
        try { if (typeof projectSourceDocs !== 'undefined') o.projectSourceDocs = projectSourceDocs; } catch (_) {}
        return o;
    }

    // =======================================================================
    // Plain words: what a diff entry is, in the engineer's language.
    // =======================================================================
    var AREA = { acFunctionsData: 'Aircraft functions', acFhaData: 'Aircraft FHA', acReqData: 'Aircraft requirements', acAssumptionsData: 'Assumptions', praData: 'Particular risk analysis', zsaData: 'Zonal safety analysis', cmaData: 'Common mode analysis', fmeaData: 'FMEA', acFcimData: 'Aircraft FCIM', routingData: 'Routing', resourcesData: 'Resources', itemsData: 'Items', flightPhasesData: 'Flight phases', systemsData: 'Systems' };
    var REFKIND = { acFunctionsData: 'acFunc', acFhaData: 'acFha', acReqData: 'acReq', cmaData: 'cma', itemsData: 'item', systemsData: 'system' };
    var FIELD = { fcDesc: 'description', fcId: 'ID', severity: 'severity', probability: 'probability', name: 'name', text: 'text', verifStatus: 'verification status', verifMethod: 'verification method', verifEvidence: 'verification evidence', type: 'type', gateType: 'gate type', allocatedDAL: 'DAL', dal: 'DAL', subName: 'function name', funcName: 'function name', subDef: 'definition', funcDef: 'definition', phases: 'flight phases', effAc: 'effect on the aircraft', effCrew: 'effect on the crew', effPax: 'effect on occupants', lambda: 'failure rate', rate: 'failure rate', exposureTime: 'exposure time', rat: 'rationale', traceId: 'trace', traceIds: 'traces', linkedFhaIds: 'linked failure conditions', linkedFhaId: 'linked failure condition', targetP: 'target probability', comments: 'comments', subject: 'subject', claim: 'claim', mitigation: 'mitigation', status: 'status', mode: 'failure mode', part: 'part', level: 'level', parentId: 'position in the tree', order: 'position in the tree', kidsCollapsed: 'collapsed', description: 'description', desc: 'description', threat: 'threat', title: 'title', role: 'role' };
    // Settings the app keeps for itself: never shown as a change, and a change made only of
    // these is automatic.
    var BOOK_PC = { journal: 1, changeLog: 1, acWorkspace: 1, aiAuditLog: 1, aiDraftLog: 1, aiDraftCounter: 1, cmaDecisionTag: 1, staleBaselines: 1, uiState: 1, lastOpened: 1, lastPlace: 1, invariantsLast: 1, cmaDecisionLog: 1 };   // cmaDecisionLog: each entry IS a recorded decision (cma_live.js), answered in its own dialog
    // Fields the app computes or lays out as it draws (measured 13 Oct 2026 by opening every tab
    // and every fault tree of the K350 sample with no edit): never the person's change.
    // Settings a view creates with default content the first time it opens (the program plan
    // page). Created = initialization; any later change to them is shown.
    var INIT_PC = { toolchain: 1, safetyProgramPlan: 1 };
    var LAYOUT_FIELDS = { descBoxHeight: 1, x: 1, y: 1, x0: 1, y0: 1 };
    // Fields the app fills in the first time it needs them (empty -> a value): an initialization,
    // not an edit. A change from one value to another is still shown.
    var INIT_FIELDS = { weight: 1, targetP: 1, descBoxHeight: 1, analysis: 1, allocatedDAL: 1, lambda: 1, inputValue: 1, exposureTime: 1 };
    // The node drawer writes every field of its form into the node on the first keystroke, so a
    // field that was absent arrives holding the form's default. Absent and the default mean the
    // same thing to the engines: that is not a change.
    var DEFAULTS = { lambdaEF: 1, repairModel: 'unmaintained', exposureMode: 'continuous', inputMode: 'probability' };
    function _human(k) { return FIELD[k] || String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase(); }
    function _derivedField(k) { return String(k).charAt(0) === '_'; }
    function _empty(v) {
        if (v == null || v === '' || v === false || v === 0) return true;
        if (Array.isArray(v)) return v.every(_empty);
        if (typeof v === 'object') return Object.keys(v).every(function (k) { return _empty(v[k]); });
        return false;
    }
    function _val(v) {
        if (v === undefined || v === null || v === '') return 'empty';
        if (typeof v === 'number') return (v !== 0 && Math.abs(v) < 1e-3) ? v.toExponential(2) : String(Math.round(v * 1e6) / 1e6);
        if (Array.isArray(v)) return _clip(v.map(function (x) { return (x && typeof x === 'object') ? (x.name || x.id || '[item]') : String(x); }).join(', '), 60) || 'empty';
        if (typeof v === 'object') return _clip(_S(v), 60);
        return _clip(v, 60);
    }
    // Two long texts that differ in a few words: show the words that changed, with a little of
    // what surrounds them, instead of two identical-looking first lines.
    function _textPair(a, b) {
        var p = 0, n = Math.min(a.length, b.length);
        while (p < n && a.charAt(p) === b.charAt(p)) p++;
        var sfx = 0;
        while (sfx < n - p && a.charAt(a.length - 1 - sfx) === b.charAt(b.length - 1 - sfx)) sfx++;
        var C = 18, from = Math.max(0, p - C);
        var cut = function (t) { var mid = t.slice(from, t.length - sfx + Math.min(C, sfx)); return (from > 0 ? '\u2026' : '') + _clip(mid, 70) + ((t.length - sfx + Math.min(C, sfx)) < t.length ? '\u2026' : ''); };
        return [cut(a) || 'empty', cut(b) || 'empty'];
    }
    function _rowLabel(name, r) {
        if (!r || typeof r !== 'object') return '';
        var id = r.fcId || r.displayId || r.itemId || r.cmaId || r.praId || r.zoneId || r.fmeaId || r.asmId || r.subId || r.funcId || r.phase || r.traceId || r.id || '';
        if (name === 'acReqData' || name === 'req') id = r.id || r.traceId || ('REQ-' + (r.internalId != null ? r.internalId : ''));
        if (name === 'systemsData') return r.name || r.id || 'a system';
        var text = r.name || r.fcDesc || r.subName || r.funcName || r.text || r.subject || r.desc || r.threat || r.part || r.title || r.description || '';
        return _clip((id ? id + ' ' : '') + text, 80) || (name ? AREA[name] || name : 'a row');
    }
    function _isAi(r) {
        if (!r || typeof r !== 'object') return false;
        return !!(r.aiModel || r.aiDraftId || r.aiDrafted || r.aiSource || r.aiChatEdited === true || (r.reqSource && r.reqSource.aiModel) || (r.aiEdited === true && r.aiEditedAt) || (r.node && _isAi(r.node)));
    }
    // Field-level comparison of two row objects: meaningful fields, and whether only derived
    // (underscore) fields moved.
    function _fields(a, b, computed) {
        var out = [], derived = 0, ks = {};
        Object.keys(a || {}).concat(Object.keys(b || {})).forEach(function (k) { ks[k] = 1; });
        Object.keys(ks).forEach(function (k) {
            var av = a ? a[k] : undefined, bv = b ? b[k] : undefined;
            if (_S(av) === _S(bv)) return;
            if (_derivedField(k) || LAYOUT_FIELDS[k] || (computed && computed[k])) { derived++; return; }
            if (INIT_FIELDS[k] && (av === undefined || av === null || av === '')) { derived++; return; }
            if ((av === undefined || av === null) && _empty(bv)) { derived++; return; }   // an empty container created on first use
            if ((av === undefined || av === null) && Object.prototype.hasOwnProperty.call(DEFAULTS, k) && DEFAULTS[k] === bv) { derived++; return; }
            if (typeof av === 'string' && typeof bv === 'string' && (av.length > 60 || bv.length > 60)) { var tp = _textPair(av, bv); out.push({ field: k, name: _human(k), was: tp[0], now: tp[1] }); return; }
            out.push({ field: k, name: _human(k), was: _val(av), now: _val(bv) });
        });
        return { fields: out, derived: derived };
    }
    var NESTED = { functions: 'functions', fha: 'FHA', req: 'requirements', asm: 'assumptions', fcim: 'FCIM', extractedFCs: 'extracted failure conditions' };
    function _nestedKey(r, i) { return r ? String(r.internalId != null ? r.internalId : (r.funcId || r.asmId || r.id || r.subId || ('#' + i))) : ('#' + i); }
    // describe(entries) -> plain-words items: { area, op, label, fields, ref, book, derived, ai }
    function describe(D, ctx) {
        var items = [];
        var pageName = {}, pageMode = {};
        try { (_live().ftaPages || []).forEach(function (p) { if (p && p.id != null) { pageName[String(p.id)] = p.name || ('Tree ' + p.id); pageMode[String(p.id)] = (p.verifies || p.mode === 'bottom-up') ? 'quant' : 'alloc'; } }); } catch (_) {}
        (D || []).forEach(function (e) {
            var a = _P(e.a), b = _P(e.b), it = { op: e.op, space: e.space, key: e.key, ai: _isAi(b), book: false, derived: false, fields: [] };
            if (e.op === 'reordered') { it.area = AREA[e.space.slice(4)] || e.space; it.label = 'rows moved'; it.op = 'reordered'; items.push(it); return; }
            if (e.space.indexOf('col:') === 0) {
                var name = e.space.slice(4);
                it.area = AREA[name] || name;
                it.label = _rowLabel(name, b || a);
                var row = b || a || {};
                if (REFKIND[name]) it.ref = { kind: REFKIND[name], id: (name === 'acFunctionsData' ? row.subId : (name === 'systemsData' ? row.id : row.internalId)), subId: row.subId || (Array.isArray(row.subIds) ? row.subIds[0] : null) };
                if (name === 'acReqData') it.ref = { kind: 'acReq', id: row.internalId, label: it.label, status: row.verifStatus };
                if (name === 'acFhaData') it.ref = { kind: 'acFha', id: row.internalId, subId: row.subId, label: it.label };
                if (e.op === 'changed' && name === 'systemsData') {
                    // drill into the system's own tables so "Systems: Hydraulics changed" says which row
                    var f0 = _fields(a, b), sub = [];
                    f0.fields.forEach(function (f) {
                        if (!NESTED[f.field]) { sub.push(f); return; }
                        var A = _keyedObj(a[f.field]), B = _keyedObj(b[f.field]);
                        B.order.forEach(function (k) {
                            var x = A.map[k], y = B.map[k];
                            if (x === undefined) items.push({ area: (b.name || b.id) + ' · ' + NESTED[f.field], op: 'added', label: _rowLabel(f.field === 'req' ? 'req' : '', y), fields: [], ai: _isAi(y), ref: _sysRef(f.field, b, y) });
                            else if (_S(x) !== _S(y)) { var ff = _fields(x, y); items.push({ area: (b.name || b.id) + ' · ' + NESTED[f.field], op: 'changed', label: _rowLabel(f.field === 'req' ? 'req' : '', y), fields: ff.fields, derived: !ff.fields.length, ai: _isAi(y), ref: _sysRef(f.field, b, y) }); }
                        });
                        A.order.forEach(function (k) { if (B.map[k] === undefined) items.push({ area: (b.name || b.id) + ' · ' + NESTED[f.field], op: 'removed', label: _rowLabel(f.field === 'req' ? 'req' : '', A.map[k]), fields: [], ref: _sysRef(f.field, b, A.map[k]) }); });
                    });
                    if (!sub.length && !f0.derived) return;     // the nested rows carry it
                    it.fields = sub; it.derived = !sub.length;
                    items.push(it); return;
                }
                if (e.op === 'changed') { var f = _fields(a, b); it.fields = f.fields; it.derived = !f.fields.length; }
                items.push(it); return;
            }
            if (e.space === 'fta:shell') {
                var pg = b || a || {};
                it.area = 'Fault trees'; it.label = pg.name || ('Tree ' + pg.id); it.ref = { kind: 'ftaPage', pageId: pg.id };
                if (e.op === 'changed') { var fs = _fields(a, b); fs.fields = fs.fields.filter(function (x) { return x.field !== '__hasTree'; }); it.fields = fs.fields; it.derived = !fs.fields.length; }
                if (_autoPage(pg.id)) it.derived = true;   // kept by the background seed sweep (idp_seed_trees.js), rebuilt from the interdependence table
                items.push(it); return;
            }
            if (e.space === 'fta:node') {
                var rec = b || a || {}, n = rec.node || {};
                it.area = 'Fault tree · ' + (pageName[String(rec.pageId)] || ('Tree ' + rec.pageId));
                it.label = _clip((n.displayId ? n.displayId + ' ' : '') + (n.name || n.description || (n.type || 'node')), 80);
                it.ref = { kind: 'ftaNode', pageId: rec.pageId, nodeId: rec.nodeId, logicalId: n.logicalId };
                if (_autoPage(rec.pageId)) { it.derived = true; items.push(it); return; }
                if (e.op === 'changed') {
                    // a gate's probability is computed from its inputs, and on a top-down page every
                    // node's probability is the budget the allocation hands it: both are results
                    var pmode = pageMode[String(rec.pageId)], isGate = (n.type === 'gate' || n.type === 'top' || !!n.gateType);
                    var computed = (isGate || pmode === 'alloc') ? { probability: 1 } : null;
                    var fn = _fields(a && a.node, b && b.node, computed), moved = (a && b && (a.parentId !== b.parentId || a.order !== b.order));
                    it.fields = fn.fields;
                    if (moved) it.fields.push({ field: 'parentId', name: 'position in the tree', was: 'before', now: 'moved' });
                    if (a && b && a.kidsCollapsed !== b.kidsCollapsed && !fn.fields.length && !moved) { it.view = true; }
                    it.derived = !it.fields.length;
                }
                items.push(it); return;
            }
            if (e.space === 'whole') {
                it.area = 'Project'; it.label = e.key === 'projectName' ? 'Project name' : (e.key === 'mlData' ? 'Markov models' : (e.key === 'stpaData' ? 'STPA analysis' : _human(e.key)));
                if (e.key === 'projectName') it.fields = [{ field: 'projectName', name: 'name', was: _val(a), now: _val(b) }];
                items.push(it); return;
            }
            if (e.space === 'other') {
                it.area = 'Project'; it.label = OTHER_LABEL[e.key] || _human(e.key);
                if (e.op === 'added' && _empty(b)) it.book = true;
                else if (e.op === 'changed' && _empty(a) && _empty(b)) it.derived = true;
                items.push(it); return;
            }
            if (e.space === 'pc') {
                it.area = 'Project settings'; it.label = _human(e.key); it.ref = { kind: 'setting', key: e.key };
                if (BOOK_PC[e.key] || e.key.charAt(0) === '_') it.book = true;
                else if (e.op === 'added' && (_empty(b) || INIT_PC[e.key])) it.book = true;   // a store created on first use (empty, or the plan's default)
                else if (e.op === 'changed' && a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) {
                    var fp = _fields(a, b); it.fields = fp.fields.slice(0, 6); it.derived = !fp.fields.length;
                }
                items.push(it); return;
            }
        });
        return items;
    }
    function _autoPage(id) { return String(id == null ? '' : id).indexOf('idp-pg-') === 0; }
    function _keyedObj(arr) { var map = {}, order = []; (Array.isArray(arr) ? arr : []).forEach(function (r, i) { var k = _nestedKey(r, i); if (map[k] !== undefined) return; map[k] = r; order.push(k); }); return { map: map, order: order }; }
    function _sysRef(field, sys, row) {
        if (!row) return null;
        if (field === 'fha') return { kind: 'sysFha', id: row.internalId, subId: row.subId, systemId: sys.id, label: _rowLabel('', row) };
        if (field === 'req') return { kind: 'sysReq', id: row.internalId, systemId: sys.id, label: _rowLabel('req', row), status: row.verifStatus };
        if (field === 'functions') return { kind: 'system', id: sys.id };
        return { kind: 'system', id: sys.id };
    }
    function summarize(items, max) {
        var vis = items.filter(function (i) { return !i.book && !i.derived && !i.view; });
        var verbs = { added: 'Added', changed: 'Changed', removed: 'Removed', reordered: 'Reordered' };
        var parts = vis.slice(0, max || 4).map(function (i) {
            var f = (i.fields && i.fields.length) ? ' (' + i.fields.slice(0, 3).map(function (x) { return x.name; }).join(', ') + ')' : '';
            return verbs[i.op] + ' ' + i.area + ': ' + i.label + f;
        });
        if (vis.length > (max || 4)) parts.push('and ' + (vis.length - (max || 4)) + ' more');
        return parts.join('; ');
    }

    // =======================================================================
    // What it touches: the golden thread graph and the modification impact closure.
    // =======================================================================
    var KIND_TITLE = { func: 'Functions', sys: 'Systems', stpa: 'STPA', fc: 'Failure conditions', fta: 'Fault trees', cca: 'Common cause analyses', ip: 'Independence principles', req: 'Requirements', vv: 'Verification', ram: 'Reliability and maintainability', hf: 'Human factors' };
    function _graphFn() { try { if (typeof W._gtvBuildGraph === 'function') return W._gtvBuildGraph; } catch (_) {} try { if (typeof _gtvBuildGraph === 'function') return _gtvBuildGraph; } catch (_) {} return null; }
    function impact(items, budgetMs) {
        var t0 = _now(), budget = budgetMs || IMPACT_BUDGET_MS, groups = {}, order = [], truncated = false, starts = [];
        var add = function (title, key, label, why) {
            if (!groups[title]) { groups[title] = { title: title, map: {}, entries: [] }; order.push(title); }
            if (groups[title].map[key]) return;
            groups[title].map[key] = 1; groups[title].entries.push({ label: label, why: why });
        };
        var live = _live(), pages = live.ftaPages || [];
        var fhaById = function (id) {
            var hit = null;
            (live.acFhaData || []).some(function (f) { if (String(f.internalId) === String(id)) { hit = { row: f, domain: 'AC' }; return true; } return false; });
            if (!hit) (live.systemsData || []).some(function (s) { return (s.fha || []).some(function (f) { if (String(f.internalId) === String(id)) { hit = { row: f, domain: 'SYS' }; return true; } return false; }); });
            return hit;
        };
        var modScopes = { systems: [], subIds: [], itemIds: [] };
        (items || []).forEach(function (i) {
            if (i.book || i.derived || i.view || !i.ref) return;
            var r = i.ref;
            if (r.kind === 'acFha' || r.kind === 'sysFha') starts.push({ key: 'fc:' + (r.kind === 'acFha' ? 'AC' : 'SYS') + ':' + r.id, scope: r.subId || null, label: i.label });
            else if (r.kind === 'acFunc') { if (r.id) modScopes.subIds.push(r.id); starts.push({ key: 'func:' + r.id, scope: r.id, label: i.label }); }
            else if (r.kind === 'system' && r.id) modScopes.systems.push(r.id);
            else if (r.kind === 'item' && i.ref.id != null) { var itm = (live.itemsData || []).find(function (x) { return String(x.internalId) === String(r.id); }); if (itm && itm.itemId) modScopes.itemIds.push(itm.itemId); }
            else if (r.kind === 'acReq' || r.kind === 'sysReq') add('Verification', 'req:' + r.id, (r.label || i.label) + ' verification', 'its status is ' + (r.status || 'Planned') + '; a changed requirement needs its verification checked again');
            else if (r.kind === 'ftaNode' || r.kind === 'ftaPage') {
                var pg = pages.find(function (p) { return p && String(p.id) === String(r.pageId); });
                if (!pg) return;
                var ids = (Array.isArray(pg.linkedFhaIds) && pg.linkedFhaIds.length) ? pg.linkedFhaIds : (pg.linkedFhaId != null ? [pg.linkedFhaId] : []);
                if (!ids.length) add('Fault trees', 'fta:' + pg.id, pg.name || ('Tree ' + pg.id), 'its top event result changes (the tree is not linked to a failure condition yet)');
                ids.forEach(function (fid) {
                    var h = fhaById(fid);
                    if (h) add('Failure conditions', 'fc:' + fid, _rowLabel('', h.row), 'its probability comes from the tree ' + (pg.name || pg.id));
                    starts.push({ key: 'fta:' + pg.id, scope: h ? h.row.subId : null, label: pg.name });
                });
                if (r.kind === 'ftaNode' && r.logicalId != null) {      // the same event used on other trees
                    var nodesSeen = 0;
                    pages.forEach(function (p) {
                        if (!p || !p.root || String(p.id) === String(pg.id) || truncated) return;
                        (function walk(n) {
                            if (!n || truncated) return;
                            if (++nodesSeen > 200000 || _now() - t0 > budget) { truncated = true; return; }
                            if (n.logicalId != null && String(n.logicalId) === String(r.logicalId)) add('Fault trees', 'fta:' + p.id, p.name || ('Tree ' + p.id), 'uses the same event (' + i.label + ')');
                            (n.children || n._children || []).forEach(walk);
                        })(p.root);
                    });
                }
            } else if (r.kind === 'cma') {
                var row = (live.cmaData || []).find(function (c) { return String(c.internalId) === String(r.id); });
                (row && row.linkedGateIds || []).forEach(function (g) {
                    var pid = String(g).split(':')[0], p = pages.find(function (x) { return x && String(x.id) === pid; });
                    if (p) add('Fault trees', 'fta:' + p.id, p.name || ('Tree ' + p.id), 'an AND gate on it relies on this common mode analysis for independence');
                });
            }
        });
        // golden thread: downstream of each changed node, one graph per function scope
        var G = _graphFn(), cache = {};
        if (G) starts.forEach(function (st) {
            if (truncated) return;
            if (_now() - t0 > budget) { truncated = true; return; }
            var ck = st.scope || '*';
            if (!cache[ck]) {
                try {
                    var g = G(st.scope ? { functionSubId: st.scope } : {}), by = {}, nodes = {};
                    (g.nodes || []).forEach(function (n) { nodes[n.key] = n; });
                    (g.links || []).forEach(function (l) { (by[l.s] = by[l.s] || []).push(l.t); });
                    cache[ck] = { by: by, nodes: nodes };
                } catch (_) { cache[ck] = { by: {}, nodes: {} }; }
            }
            var C = cache[ck], seen = {}, q = [{ k: st.key, d: 0 }];
            seen[st.key] = 1;
            while (q.length) {
                var cur = q.shift();
                (C.by[cur.k] || []).forEach(function (t) {
                    if (seen[t]) return; seen[t] = 1;
                    var n = C.nodes[t]; if (!n) return;
                    if (n.kind === 'sys' && n.id === '_aircraft') return;
                    add(KIND_TITLE[n.kind] || n.kind, n.key, n.label + (n.sub && n.kind !== 'vv' ? ' · ' + n.sub : ''), cur.d === 0 ? ('traces from ' + st.label) : ('through ' + ((C.nodes[cur.k] || {}).label || cur.k)));
                    q.push({ k: t, d: cur.d + 1 });
                });
            }
        });
        // functions, systems and items: the modification impact closure (it also names the
        // handed-off assessments that will reopen)
        if ((modScopes.systems.length || modScopes.subIds.length || modScopes.itemIds.length) && typeof W.modImpact === 'function' && !truncated) {
            try {
                var m = W.modImpact(modScopes);
                (m.fcs || []).forEach(function (x) { var h = fhaById(x.id); add('Failure conditions', 'fc:' + x.id, h ? _rowLabel('', h.row) : String(x.id), x.why); });
                (m.pages || []).forEach(function (x) { var p = pages.find(function (pp) { return pp && String(pp.id) === String(x.id); }); add('Fault trees', 'fta:' + x.id, p ? (p.name || p.id) : x.id, x.why); });
                (m.reqs || []).forEach(function (x) { add('Requirements', 'req:' + x.id, x.id, x.why); });
                (m.cca || []).forEach(function (x) { add('Common cause analyses', 'cca:' + x.id, x.id, x.why); });
                (m.gates || []).forEach(function (gt) { if (gt.willReopen) add('Assessments that will reopen', 'gate:' + gt.assessment, gt.assessment, 'handed off; this change reopens it'); });
            } catch (_) {}
        }
        return { groups: order.map(function (t) { return { title: t, entries: groups[t].entries }; }), truncated: truncated, ms: _now() - t0, count: order.reduce(function (s, t) { return s + groups[t].entries.length; }, 0) };
    }

    // =======================================================================
    // The funnel.
    // =======================================================================
    var _sysDepth = 0, _restoreDepth = 0, _stash = null, _lastInputAt = 0, _pointerDown = false, _enterAt = 0, _lastKeyAt = 0, _lastKeyEl = null;
    var _win = null, _seq = 0, _groups = {}, _groupSeq = 0, _prompting = false, _timer = null, _waiters = [], _notes = [];
    var _rc = null;   // { key: the stash string the records describe, R: those records }
    // The collected (deferred) changes: { id, baseline: the state before the first of them,
    // items: [{ kind: 'move' | 'undo' | 'redo', label }], contentD: [diffs of the content changes
    // acknowledged since, oldest first], undoMark }
    var _bucket = null, _deferDepth = 0, _deferInfo = null, _bucketPrompting = false, _bucketWaiters = [], _lastDeferredAt = 0;
    var _stats = { noted: 0, system: 0, automatic: 0, kept: 0, canceled: 0, prompts: 0, nothing: 0 };
    var _testAnswer = null;      // tests only: 'keep' | 'cancel' answers the dialog without a click

    function _snapNow() {
        try { var s = (typeof W._snapshotProject === 'function') ? W._snapshotProject() : (typeof _snapshotProject === 'function' ? _snapshotProject() : null); return s ? JSON.stringify(s) : null; } catch (_) { return null; }
    }
    // helpers_modules._writeAutosave hands every serialized payload here: the state at the end of
    // the last change, which is the state just BEFORE the next one.
    function stash(payload) { if (typeof payload === 'string') _stash = payload; }
    function _ensureStash() { if (_stash == null && !_win) _stash = _snapNow(); }
    function system(fn) { _sysDepth++; try { return fn(); } finally { _sysDepth--; } }
    // A system change made outside any save call (a migration run while drawing a view) becomes
    // the new "before" at once, so the next change the person makes is measured from it.
    function absorb() { if (_win || _sysDepth > 0) return; system(function () { try { if (typeof W.scheduleAutosave === 'function') W.scheduleAutosave(); } catch (_) {} }); }
    function systemAsync(fn) {
        _sysDepth++;
        var done = function () { _sysDepth = Math.max(0, _sysDepth - 1); };
        try { var r = fn(); if (r && typeof r.then === 'function') { r.then(done, done); return r; } done(); return r; }
        catch (e) { done(); throw e; }
    }
    function restoring() { return _restoreDepth > 0; }
    function _openGroupList() { return Object.keys(_groups).map(function (k) { return _groups[k]; }); }
    function _undoDepth() { try { return (typeof W._slUndoDepth === 'function') ? W._slUndoDepth() : null; } catch (_) { return null; } }
    // Where this change's undo steps begin. A wrapped action (data_ops_modules _UNDO_TARGETS)
    // pushes its own step just BEFORE it writes, so a top step holding exactly the state before
    // the change belongs to this change too.
    function _undoMarkFor(baseline) {
        var d = _undoDepth(); if (d == null || !d) return d;
        try { if (typeof W._slUndoTopSnap === 'function' && W._slUndoTopSnap() === baseline) return d - 1; } catch (_) {}
        return d;
    }
    function _save() { try { return W.SLSaveState || null; } catch (_) { return null; } }

    // scheduleAutosave calls this for every change it accepts. Returns what it decided.
    var _lastNotedAt = 0;
    function noteChange() {
        _stats.noted++; _lastNotedAt = _now();
        if (_sysDepth > 0) { _stats.system++; return 'system'; }
        if (_deferDepth > 0) return _noteDeferred(_deferInfo || {});
        var groupOpen = _openGroupList().length > 0;
        var userish = groupOpen || (_lastInputAt > 0 && (_now() - _lastInputAt) < USER_WINDOW_MS);
        if (_prompting && _win) { _win.late = true; return 'late'; }
        if (!_win) {
            var base = _stash;
            if (base == null && !userish) { _stats.automatic++; return 'automatic'; }   // nothing to compare against and nobody asked (right after a load)
            var noRevert = false;
            if (base == null) { base = _snapNow(); noRevert = true; }
            _win = { id: ++_seq, at: _now(), lastAt: _now(), baseline: base, noRevert: noRevert, user: userish, labels: [], notes: _notes.splice(0), onRevert: [], sources: {}, undoMark: _undoMarkFor(base), late: false };
            _openGroupList().forEach(_attachGroup);
            var S0 = _save(); if (S0 && S0._ackOpened) { try { S0._ackOpened(_win); } catch (_) {} }
        } else if (userish) _win.user = true;
        _win.lastAt = _now();
        try { _win.focusEl = (typeof document !== 'undefined') ? document.activeElement : null; } catch (_) {}
        _schedule();
        return 'noted';
    }
    // A move or an undo/redo: into the collection, asked about when the person leaves the view.
    function _noteDeferred(info) {
        _stats.deferred = (_stats.deferred || 0) + 1;
        // a move nobody made (no keyboard or mouse input in the last 3 s, no open group): the app
        // placing shapes by itself, not something to ask about
        if ((info.kind || 'move') === 'move' && !_openGroupList().length && !(_lastInputAt > 0 && (_now() - _lastInputAt) < USER_WINDOW_MS)) { _stats.automatic++; return 'automatic'; }
        if (_win && !_prompting) { _win.lastAt = _now(); return 'noted'; }   // inside a content change already open: it goes with it
        if (!_bucket) {
            var base = _stash; if (base == null) base = _snapNow();
            _bucket = { id: ++_seq, at: _now(), baseline: base, items: [], contentD: [], undoMark: _undoDepth() };
            var S0 = _save(); if (S0 && S0._ackOpened) { try { S0._ackOpened(_bucket); } catch (_) {} }
        }
        var kind = info.kind || 'move', label = info.label || (kind === 'move' ? 'Moved a shape' : 'Undo');
        var last = _bucket.items[_bucket.items.length - 1];
        if (last && last.kind === kind && last.label === label && kind === 'move') last.count = (last.count || 1) + 1;   // nudging the same box ten times is one line
        else _bucket.items.push({ kind: kind, label: label, at: _now() });
        _lastDeferredAt = _now();
        return 'deferred';
    }
    function deferred(info, fn) {
        // a change still open when a move or an undo starts is decided first, measured before it, so
        // the two never mix (a background write closes at once; a person's edit is asked as usual)
        if (_win && !_prompting) { if (_timer) { clearTimeout(_timer); _timer = null; } try { _resolve(false); } catch (_) {} }
        _deferDepth++; var prev = _deferInfo; _deferInfo = info || {}; try { return fn(); } finally { _deferDepth--; _deferInfo = prev; } }
    // Ask about the collected changes now (leaving the view, Save, a guard). true = nothing left.
    function flushDeferred() {
        if (!_bucket) return Promise.resolve(true);
        var p = new Promise(function (res) { _bucketWaiters.push(res); });
        if (!_bucketPrompting) _resolveBucket();
        return p;
    }
    function _resolveBucket() {
        var b = _bucket; if (!b) return;
        if (_win || _otherDialog()) { setTimeout(_resolveBucket, 300); if (_win && !_prompting) _try(true); return; }   // a content change first, then the collection
        _bucketPrompting = true; _stats.prompts++;
        var n = b.items.reduce(function (t, i) { return t + (i.count || 1); }, 0);
        _bucketDialog(b, n).then(function (choice) {
            var labels = b.items.map(function (i) { return (i.kind === 'move' ? 'Moved: ' : (i.kind === 'redo' ? 'Redone: ' : 'Undone: ')) + i.label + (i.count > 1 ? ' (x' + i.count + ')' : ''); });
            if (choice === 'cancel') {
                _stats.canceled++;
                _rc = null;
                // back to before the first collected change, then the content changes acknowledged
                // since are laid back on top: only the collected changes go
                var later = b.contentD.slice();
                revertTo(b.baseline, b.undoMark);
                later.forEach(function (D) { try { _applyContent(D); } catch (_) {} });
                try { if (later.length && typeof W.scheduleAutosave === 'function') system(function () { W.scheduleAutosave(); }); } catch (_) {}
                _jr('change-cancel', _who() + ' canceled ' + n + ' collected change' + (n === 1 ? '' : 's') + ': ' + labels.join('; '));
            } else {
                _stats.kept++;
                _jr('change-ack', _who() + ' acknowledged ' + n + ' collected change' + (n === 1 ? '' : 's') + ': ' + labels.join('; '));
            }
            _bucket = null; _bucketPrompting = false;
            var S = _save();
            try { if (S && S._ackClosed) S._ackClosed({ baseline: b.baseline, summaryText: labels.slice(0, 3).join('; ') }, choice === 'cancel' ? 'canceled' : 'kept'); } catch (_) {}
            try { if (typeof CustomEvent === 'function' && W.dispatchEvent) W.dispatchEvent(new CustomEvent('sl:change-ack', { detail: { decision: choice === 'cancel' ? 'canceled' : 'kept', id: b.id, summary: labels.join('; '), count: n, collected: true } })); } catch (_) {}
            var ws = _bucketWaiters.splice(0); ws.forEach(function (f) { try { f(choice !== 'cancel'); } catch (_) {} });
        });
    }
    // Lay one acknowledged content change back on top (synced stores by record; the other stores
    // whole, through their declared accessor).
    function _applyContent(D) {
        D = (D || []).filter(function (e) { return !(e.space === 'pc' && (BOOK_PC[e.key] || String(e.key).charAt(0) === '_')); });   // never roll the journal or logs back
        applyToModel(D);
        (D || []).forEach(function (e) {
            if (e.space !== 'other' || e.key === 'projectSourceDocs') return;
            try { var st = W.SLStores && W.SLStores.byKey && W.SLStores.byKey(e.key); if (st && st.set) st.set(e.op === 'removed' ? undefined : _P(e.b)); } catch (_) {}
        });
    }
    function _bucketDialog(b, n) {
        return new Promise(function (resolve) {
            if (_testAnswer) { var ta = _testAnswer; setTimeout(function () { resolve(ta); }, 0); return; }
            if (typeof document === 'undefined' || !document.body) { resolve('keep'); return; }
            _injectStyle();
            var ov = document.createElement('div');
            ov.id = 'sl-ack-overlay'; ov.className = 'modal-overlay sl-ack-overlay sl-ack-collected';
            var verb = { move: 'Moved', undo: 'Undone', redo: 'Redone' };
            var rows = b.items.map(function (i) { return '<li><span class="sl-ack-op ' + (i.kind === 'move' ? 'changed' : 'reordered') + '">' + verb[i.kind || 'move'] + '</span>' + _esc(i.label) + (i.count > 1 ? ' <span class="sl-ack-why">(' + i.count + ' times)</span>' : '') + '</li>'; }).join('');
            ov.innerHTML = '<div class="sl-dialog-card sl-ack-card" role="dialog" aria-modal="true" aria-labelledby="sl-ack-title">'
                + '<h3 class="sl-dialog-title" id="sl-ack-title">' + (n === 1 ? 'Acknowledge the move or undo you made here' : 'Acknowledge the ' + n + ' moves and undos you made here') + '</h3>'
                + '<div class="sl-dialog-msg">Moving shapes and Undo / Redo are collected while you work and checked here, together, before you leave this view.</div>'
                + '<div class="sl-ack-body"><div class="sl-ack-h">What moved or was undone</div><ul class="sl-ack-list" id="sl-ack-items">' + rows + '</ul></div>'
                + '<div class="sl-ack-foot">Acknowledge saves them at once. Your name and the time go in the project journal. Cancel puts back only these; the edits you acknowledged in between stay.</div>'
                + '<div class="sl-dialog-actions"><button type="button" class="sl-dialog-cancel sl-ack-cancel">Cancel</button><button type="button" class="sl-dialog-ok sl-ack-keep">Acknowledge</button></div></div>';
            document.body.appendChild(ov); ov.style.display = 'flex';
            requestAnimationFrame(function () { ov.classList.add('show'); });
            var done = false;
            function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); } else if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); finish('keep'); } }
            function finish(c) { if (done) return; done = true; document.removeEventListener('keydown', onKey, true); ov.classList.remove('show'); setTimeout(function () { try { ov.remove(); } catch (_) {} }, 180); resolve(c); }
            ov.querySelector('.sl-ack-keep').addEventListener('click', function () { finish('keep'); });
            ov.querySelector('.sl-ack-cancel').addEventListener('click', function () { finish('cancel'); });
            document.addEventListener('keydown', onKey, true);
            setTimeout(function () { var k = ov.querySelector('.sl-ack-keep'); if (k) k.focus(); }, 40);
        });
    }
    function _attachGroup(g) {
        if (!_win || !g) return;
        if (g.label && _win.labels.indexOf(g.label) < 0) _win.labels.push(g.label);
        if (g.opts && typeof g.opts.onRevert === 'function' && _win.onRevert.indexOf(g.opts.onRevert) < 0) _win.onRevert.push(g.opts.onRevert);
        if (g.opts && g.opts.source) _win.sources[g.opts.source] = true;
        _win.user = true;
    }
    function _schedule(ms) { if (_timer) clearTimeout(_timer); _timer = setTimeout(_try, ms == null ? QUIET_MS : ms); }
    function _isText(el) {
        if (!el || !el.tagName) return false;
        if (el.isContentEditable) return true;
        if (el.tagName === 'TEXTAREA') return true;
        if (el.tagName !== 'INPUT') return false;
        var t = String(el.type || 'text').toLowerCase();
        return ['text', 'number', 'search', 'email', 'url', 'tel', 'password', ''].indexOf(t) >= 0;
    }
    // Still typing in the field that changed: focus is in it, the last keystroke went into it,
    // Enter has not been pressed since the change, and it was less than 8 s ago (someone who
    // stops typing and sits in the field is asked anyway).
    var TYPING_IDLE_MS = 8000;
    function _stillTyping() {
        try {
            var a = document.activeElement;
            if (!_isText(a) || a !== _win.focusEl || a !== _lastKeyEl) return false;
            if (_enterAt > _win.lastAt - 50) return false;
            if ((_now() - _lastKeyAt) > TYPING_IDLE_MS) return false;
            return true;
        } catch (_) { return false; }
    }
    function _otherDialog() {
        var vis = function (el) { try { if (!el) return false; var cs = getComputedStyle(el), r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; } catch (_) { return false; } };
        var dq = 0;
        try { if (typeof W._slDialogQueue === 'function') dq = W._slDialogQueue(); else if (typeof _slDialogQueue === 'function') dq = _slDialogQueue(); } catch (_) {}
        if (dq > 0 && (typeof document === 'undefined' || vis(document.getElementById('sl-dialog-overlay')))) return true;   // a house dialog the person can see
        try { if (W.SLChoice && W.SLChoice.open()) return true; } catch (_) {}
        // any other modal on screen (the live common cause prompt, an editing form, the welcome
        // card): the person finishes there first, then sees one acknowledgement for the result
        try {
            var ovs = document.querySelectorAll('.modal-overlay.show');
            for (var i = 0; i < ovs.length; i++) {
                var o = ovs[i]; if (o.id === 'sl-ack-overlay' || o.style.display === 'none') continue;
                var cs = getComputedStyle(o), r = o.getBoundingClientRect();
                if (cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0) return true;   // only a modal the person can actually see
            }
        } catch (_) {}
        return false;
    }
    function _try(force) {
        _timer = null;
        if (!_win || _prompting) return;
        if (!force) {
            if (_openGroupList().length) return;            // end() retries
            if (_win.user && _pointerDown) return;           // pointerup retries
            if (_win.user && _stillTyping()) { _schedule(TYPING_IDLE_MS); return; }   // focusout / Enter retries sooner
            if ((_now() - _win.lastAt) < QUIET_MS - 20) { _schedule(QUIET_MS); return; }
        }
        if (_otherDialog()) { _schedule(400); return; }
        _resolve(force === true);
    }

    function _who() {
        try { var s = (typeof _supabaseSession !== 'undefined') ? _supabaseSession : null; if (s && s.user && s.user.email) return s.user.email; } catch (_) {}
        try { if (typeof W._wsUser === 'function') { var u = W._wsUser(); if (u && u.email) return u.email; } } catch (_) {}
        return 'Not signed in';
    }
    function _jr(kind, msg) { try { if (typeof W.jrnl === 'function') W.jrnl(kind, msg); } catch (_) {} }

    // Look at the open change and decide: nothing, automatic, or ask.
    function _resolve(forced) {
        var w = _win; if (!w) return;
        _prompting = true;
        var items = [], D = [], Rb = null;
        try {
            // The "before" records are usually the "after" records of the previous decision (the
            // stash string is the same object): reusing them halves the cost on a large project
            // (measured: 100k fault tree nodes, 690 ms -> under 300 ms per acknowledgement).
            var Ra = (_rc && _rc.key === w.baseline) ? _rc.R : records(_P(w.baseline) || {});
            Rb = records(_live());
            D = diff(Ra, Rb); items = describe(D);
            if (_stash != null) _rc = { key: _stash, R: Rb };
        } catch (e) { _rc = null; try { console.warn('[change-ack] diff failed', e); } catch (_) {} }
        // a tree added or removed whole is one line ("with 480 nodes"), not 480 lines
        var whole = {};
        items.forEach(function (i) { if (i.space === 'fta:shell' && (i.op === 'added' || i.op === 'removed') && i.ref) { whole[String(i.ref.pageId) + '|' + i.op] = i; i.nodes = 0; } });
        items.forEach(function (i) { if (i.space === 'fta:node' && i.ref && whole[String(i.ref.pageId) + '|' + i.op]) { whole[String(i.ref.pageId) + '|' + i.op].nodes++; i.folded = true; } });
        Object.keys(whole).forEach(function (k) { var pg = whole[k]; if (pg.nodes) pg.label += ' (with ' + pg.nodes + ' node' + (pg.nodes === 1 ? '' : 's') + ')'; });
        var shown = items.filter(function (i) { return !i.book && !i.derived && !i.view && !i.folded; });
        if (w.reopened && !shown.length) shown = items.filter(function (i) { return !i.book && !i.folded; });   // a crash left moves: they still need their acknowledgement
        var ai = items.some(function (i) { return i.ai; });
        w.items = items; w.D = D;
        if (!D.length) { _stats.nothing++; return _close(w, 'nothing'); }
        if (!shown.length || (!w.user && !ai)) {
            _stats.automatic++;
            if (_bucket && D.length) _bucket.contentD.push(D);   // accepted on its own: Cancel on collected moves keeps it, and the accepted state carries it
            return _close(w, 'automatic');
        }   // forced (Save, a guard) skips the waiting, never the question of whether anyone made it
        _stats.prompts++;
        w.shownSnap = _stash;     // the state the dialog describes (the last write happened before the quiet period ended)
        _dialog(w, shown).then(function (choice) {
            if (choice === 'dismiss' || _win !== w) return;      // closed from outside (a load, Don't Save): already handled
            if (choice === 'keep') {
                _stats.kept++;
                try { if (typeof W._slUndoPushSnap === 'function' && w.baseline && !w.noRevert) W._slUndoPushSnap(_clip(summarize(items, 1), 60) || 'change', w.baseline, w.undoMark); } catch (_) {}
                _jr('change-ack', _who() + ' acknowledged: ' + summarize(items, 3) + (w.impactCount ? ' (touches ' + w.impactCount + ')' : ''));
                if (_bucket && w.D) _bucket.contentD.push(w.D);
                _close(w, 'kept');
            } else {
                _stats.canceled++;
                _rc = null;
                revertTo(w.baseline, w.undoMark);
                _jr('change-cancel', _who() + ' canceled: ' + summarize(items, 3));
                w.onRevert.forEach(function (f) { try { f(); } catch (_) {} });
                _close(w, 'canceled');
            }
        });
    }
    function _close(w, decision) {
        _prompting = false;
        if (_win === w) _win = null;
        var S = _save();
        try { if (S && S._ackClosed) S._ackClosed(w, decision); } catch (_) {}
        try { if (typeof CustomEvent === 'function' && W.dispatchEvent) W.dispatchEvent(new CustomEvent('sl:change-ack', { detail: { decision: decision, id: w.id, summary: w.items ? summarize(w.items, 3) : '', count: w.items ? w.items.filter(function (i) { return !i.book && !i.derived; }).length : 0 } })); } catch (_) {}
        var ws = _waiters.splice(0); ws.forEach(function (f) { try { f(decision); } catch (_) {} });
        // a change that arrived while the dialog was open is its own change, measured from the
        // state the dialog showed (Keep) or from the restored state (Cancel: it was undone too)
        if (w.late && decision === 'kept' && w.shownSnap) { _stash = w.shownSnap; noteChange(); }
        return decision;
    }
    // Put the project back exactly as it was (the Undo path), as a system change, and drop the
    // undo steps the reverted change pushed.
    function revertTo(snapStr, undoMark) {
        if (!snapStr) return false;
        var data = _P(snapStr); if (!data) return false;
        _restoreDepth++; _sysDepth++;
        try {
            keepJournal(function () { if (typeof W._applyProjectData === 'function') W._applyProjectData(data); });
            try { if (undoMark != null && typeof W._slUndoTruncate === 'function') W._slUndoTruncate(undoMark); } catch (_) {}
            try { if (typeof W.scheduleAutosave === 'function') W.scheduleAutosave(); } catch (_) {}
        } finally { _restoreDepth--; _sysDepth--; }
        _stash = snapStr;
        return true;
    }
    // The project journal is append-only and hash-chained: a restore (Cancel, Undo, Don't Save)
    // must never take entries back out of it, or the record of the acknowledgement would vanish
    // with the change it acknowledged.
    function keepJournal(fn) {
        var before = null;
        try { if (typeof projectConfig !== 'undefined' && projectConfig && projectConfig.journal && Array.isArray(projectConfig.journal.entries)) before = projectConfig.journal; } catch (_) {}
        var r = fn();
        try {
            if (before && typeof projectConfig !== 'undefined' && projectConfig) {
                var now = projectConfig.journal;
                var nLen = (now && Array.isArray(now.entries)) ? now.entries.length : -1;
                var lastB = before.entries.length ? before.entries[before.entries.length - 1].seq : 0;
                var lastN = (nLen > 0) ? now.entries[nLen - 1].seq : 0;
                if (lastB >= lastN) projectConfig.journal = before;
            }
        } catch (_) {}
        return r;
    }
    // Same project apart from the app's bookkeeping? (Undo back to the saved version.)
    function sameContent(snapStr) {
        try { var it = describe(diff(records(_P(snapStr) || {}), records(_live()))); return !it.some(function (i) { return !i.book && !i.derived && !i.view; }); } catch (_) { return false; }
    }
    // Close the open change without asking (Don't Save, a load): revert it or keep it as it is.
    function drop(opts) {
        if (_bucket && !_win) {   // Don't Save: the collected changes go with the rest (save_state restores the saved version)
            var b = _bucket; _bucket = null;
            if (opts && opts.revert && b.baseline) revertTo(b.baseline, b.undoMark);
            var bw = _bucketWaiters.splice(0); bw.forEach(function (f) { try { f(!(opts && opts.revert)); } catch (_) {} });
            return true;
        }
        var w = _win; if (!w) return false;
        if (_timer) { clearTimeout(_timer); _timer = null; }
        if (opts && opts.revert && w.baseline && !w.noRevert) revertTo(w.baseline, w.undoMark);
        _hideDialog();
        _close(w, (opts && opts.revert) ? 'canceled' : 'dropped');
        if (_bucket) { _bucket = null; var bw2 = _bucketWaiters.splice(0); bw2.forEach(function (f) { try { f(true); } catch (_) {} }); }   // the caller restores the saved version
        return true;
    }
    // A project was loaded or replaced: nothing open, nothing to compare against, and the click
    // that started the load is not a reason to ask about what the load wrote.
    function settle() {
        if (_win) { _hideDialog(); var w = _win; _win = null; _prompting = false; var ws = _waiters.splice(0); ws.forEach(function (f) { try { f('dropped'); } catch (_) {} }); void w; }
        if (_timer) { clearTimeout(_timer); _timer = null; }
        _stash = null; _lastInputAt = 0; _notes = [];
        if (_bucket) { _bucket = null; var bw = _bucketWaiters.splice(0); bw.forEach(function (f) { try { f(true); } catch (_) {} }); }
        setTimeout(function () { try { if (_stash == null && !_win) { if (typeof requestIdleCallback === 'function') requestIdleCallback(_ensureStash, { timeout: 2000 }); else _ensureStash(); } } catch (_) {} }, 1200);
    }

    // The project as ACCEPTED so far, as a snapshot string: every acknowledged change, nothing that
    // still waits for an acknowledgement. null = nothing waits, so the live project is the accepted
    // one. While moves or undos are collected it is the state before the first of them with the
    // content changes acknowledged since laid back on top (exactly what Cancel on the collection
    // would leave on screen). While a content change is open it is the state before that change.
    function acceptedSnapshot() {
        if (_bucket) {
            if (!_bucket.contentD.length) return _bucket.baseline;
            var o = _P(_bucket.baseline); if (!o) return null;
            var journal = null;
            try { var lv = _live(); if (lv.projectConfig && lv.projectConfig.journal) journal = lv.projectConfig.journal; } catch (_) {}
            _bucket.contentD.forEach(function (D) { o = applyToObject(o, (D || []).filter(function (e) { return !(e.space === 'pc' && (BOOK_PC[e.key] || String(e.key).charAt(0) === '_')); })); });
            if (journal) { o.projectConfig = o.projectConfig || {}; o.projectConfig.journal = journal; }   // the record of every acknowledgement goes with it
            return _S(o);
        }
        if (_win && !_win.noRevert) return _win.baseline;
        return null;
    }
    // A crash left changes nobody acknowledged (the autosave on this device holds them): ask about
    // them now, measured from the accepted state saved with them. Acknowledge saves them; Cancel
    // puts the project back to what was accepted.
    // restored (optional): the project exactly as the crash left it, as restored. Then only what
    // differs between the accepted copy and THAT is asked about: the app's own writes since the
    // restore (views drawn, settings created on first use) are measured out, by laying the reverse
    // of the waiting changes onto the project as it is now.
    // Returns true (asked), false (nothing to ask) or 'busy' (another change is being decided: try
    // again shortly, so the app's own start-up writes are never mixed into this question).
    function reopen(acceptedStr, label, restored) {
        if (!acceptedStr) return false;
        // a change being decided, another dialog on screen, or the app still writing as it starts up
        // (views drawing, first-use settings): right after, so none of that is mixed into this question
        if (_bucket || _prompting || _win || _otherDialog() || (_now() - _lastNotedAt) < 2500) return 'busy';
        var base = acceptedStr;
        if (restored && typeof restored === 'object') {
            try {
                var D = diff(records(_P(acceptedStr) || {}), records(restored)).filter(function (e) { return e.op !== 'reordered'; });
                if (!D.length) return false;   // nothing was waiting after all
                var back = D.map(function (e) { return { space: e.space, key: e.key, op: e.op === 'added' ? 'removed' : (e.op === 'removed' ? 'added' : 'changed'), a: e.b, b: e.a }; });
                var now = _P(_snapNow()); if (now) base = _S(applyToObject(now, back));
            } catch (_) { base = acceptedStr; }
        }
        _rc = null;
        _stash = base;
        var t = begin(label || 'Changes from your last session that were not acknowledged');
        noteChange();
        if (_win) _win.reopened = true;   // asked even when all it holds is moved shapes (positions)
        end(t);
        return !!_win;
    }

    // ---- public grouping ---------------------------------------------------
    function begin(label, opts) { var t = 'g' + (++_groupSeq); _groups[t] = { label: label || '', opts: opts || {} }; if (_win) _attachGroup(_groups[t]); return t; }
    function end(token) { var g = _groups[token]; if (!g) return; delete _groups[token]; if (_win) _attachGroup(g); if (_win) _schedule(); }
    function waitDecision() { return new Promise(function (res) { if (!_win) return res('none'); _waiters.push(res); }); }
    function batch(label, fn, opts) {
        var t = begin(label, opts);
        var finish = function (res) { end(t); if (!_win) return { acknowledged: true, result: res }; return waitDecision().then(function (d) { return { acknowledged: d !== 'canceled', result: res }; }); };
        try { var r = fn(); if (r && typeof r.then === 'function') return r.then(function (v) { return finish(v); }, function (e) { end(t); throw e; }); return Promise.resolve(finish(r)); }
        catch (e) { end(t); return Promise.reject(e); }
    }
    function describeChange(info) { if (!info) return; if (_bucket && !_win && (_now() - _lastDeferredAt) < 100) return; var note = { summary: info.summary || '', refs: info.refs || [] }; if (_win) _win.notes.push(note); else { _notes.push(note); if (_notes.length > 20) _notes.shift(); } }
    // Ask now if something is waiting. true = nothing left unacknowledged. opts.changeOnly: only the
    // open content change, the collected moves and undos keep waiting (they are asked on leaving).
    function flush(opts) {
        var only = !!(opts && opts.changeOnly);
        if (!_win) return only ? Promise.resolve(true) : flushDeferred();
        var p = waitDecision().then(function (d) { return d !== 'canceled'; });
        if (!_prompting) { _groups = {}; _try(true); }
        return only ? p : p.then(function (ok) { return flushDeferred().then(function (ok2) { return ok && ok2; }); });
    }

    // ---- the dialog ----------------------------------------------------------
    function _injectStyle() {
        if (typeof document === 'undefined' || document.getElementById('sl-ack-style')) return;
        var st = document.createElement('style'); st.id = 'sl-ack-style';
        st.textContent = '.sl-ack-card{max-width:620px;width:94%;max-height:86vh;display:flex;flex-direction:column}'
            + '.sl-ack-body{overflow:auto;margin-top:6px;padding-right:4px}'
            + '.sl-ack-h{font-size:12px;font-weight:650;text-transform:uppercase;letter-spacing:.04em;color:var(--color-text-tertiary,#6b7280);margin:14px 0 6px}'
            + '.sl-ack-list{list-style:none;margin:0;padding:0;font-size:13px}'
            + '.sl-ack-list li{padding:6px 0;border-bottom:1px solid var(--color-border-hair,#eef0f3)}'
            + '.sl-ack-op{display:inline-block;min-width:66px;font-size:11px;font-weight:650;padding:1px 7px;border-radius:999px;margin-right:6px;text-align:center;background:var(--color-surface-2,#f3f4f6)}'
            + '.sl-ack-op.added{color:#0E7A3C}.sl-ack-op.removed{color:#C0231D}.sl-ack-op.changed{color:#2E6BD6}.sl-ack-op.reordered{color:#6b7280}'
            + '.sl-ack-area{color:var(--color-text-tertiary,#6b7280);font-size:12px}'
            + '.sl-ack-f{font-size:12px;color:var(--color-text-secondary,#374151);margin:3px 0 0 74px}'
            + '.sl-ack-was{text-decoration:line-through;opacity:.7}'
            + '.sl-ack-g{margin:4px 0 8px}.sl-ack-gt{font-size:12.5px;font-weight:600}'
            + '.sl-ack-g ul{margin:2px 0 0 0;padding-left:18px;font-size:12.5px}'
            + '.sl-ack-why{color:var(--color-text-tertiary,#6b7280)}'
            + '.sl-ack-foot{font-size:12px;color:var(--color-text-tertiary,#6b7280);margin-top:12px}'
            + '.sl-ack-ai{font-size:11px;font-weight:650;color:#7A3EA8;margin-left:6px}'
            + '.sl-choice-card{max-width:500px}';
        (document.head || document.documentElement).appendChild(st);
    }
    var _dlgEl = null;
    function _hideDialog() { if (_dlgEl) { try { _dlgEl._finish && _dlgEl._finish(null); } catch (_) {} } }
    function _itemHtml(i) {
        var verbs = { added: 'Added', changed: 'Changed', removed: 'Removed', reordered: 'Reordered' };
        var h = '<li><span class="sl-ack-op ' + i.op + '">' + verbs[i.op] + '</span><span class="sl-ack-area">' + _esc(i.area) + ':</span> ' + _esc(i.label) + (i.ai ? '<span class="sl-ack-ai">AI drafted</span>' : '');
        (i.fields || []).slice(0, 5).forEach(function (f) { h += '<div class="sl-ack-f">' + _esc(f.name) + ': <span class="sl-ack-was">' + _esc(f.was) + '</span> → <b>' + _esc(f.now) + '</b></div>'; });
        if ((i.fields || []).length > 5) h += '<div class="sl-ack-f">and ' + (i.fields.length - 5) + ' more fields</div>';
        return h + '</li>';
    }
    function _impactHtml(r) {
        if (!r || !r.groups.length) return '<div class="sl-dialog-msg">Nothing downstream is traced to this change.</div>';
        var h = '';
        r.groups.forEach(function (g) {
            h += '<div class="sl-ack-g"><div class="sl-ack-gt">' + _esc(g.title) + ' (' + g.entries.length + ')</div><ul>';
            g.entries.slice(0, 8).forEach(function (e) { h += '<li>' + _esc(e.label) + ' <span class="sl-ack-why">' + _esc(e.why) + '</span></li>'; });
            if (g.entries.length > 8) h += '<li class="sl-ack-why">and ' + (g.entries.length - 8) + ' more</li>';
            h += '</ul></div>';
        });
        if (r.truncated) h += '<div class="sl-ack-why">This project is very large: the list above stopped after ' + Math.round(r.ms / 100) / 10 + ' s and may not be complete.</div>';
        return h;
    }
    function _dialog(w, shown) {
        return new Promise(function (resolve) {
            if (_testAnswer) { var ta = _testAnswer; setTimeout(function () { resolve(ta); }, 0); try { w.impact = impact(shown); w.impactCount = w.impact.count; } catch (_) {} return; }
            if (typeof document === 'undefined' || !document.body) { resolve('keep'); return; }
            _injectStyle();
            var ov = document.createElement('div');
            ov.id = 'sl-ack-overlay'; ov.className = 'modal-overlay sl-ack-overlay';
            var labels = w.labels.filter(Boolean), notes = (w.notes || []).map(function (n) { return n.summary; }).filter(Boolean);
            var head = labels.length ? labels.join(', ') : (notes[0] || '');
            var title = shown.length === 1 ? 'Acknowledge this change' : ('Acknowledge these ' + shown.length + ' changes');
            var lead = (head ? _esc(head) + '. ' : '') + 'Check what changes and what it touches, then acknowledge it or cancel it.';
            if (w.noRevert) lead += ' This change was already in place before a copy could be taken, so use Undo to take it back.';
            ov.innerHTML = '<div class="sl-dialog-card sl-ack-card" role="dialog" aria-modal="true" aria-labelledby="sl-ack-title">'
                + '<h3 class="sl-dialog-title" id="sl-ack-title">' + _esc(title) + '</h3>'
                + '<div class="sl-dialog-msg">' + lead + '</div>'
                + '<div class="sl-ack-body"><div class="sl-ack-h">What changes</div><ul class="sl-ack-list" id="sl-ack-items">'
                + shown.slice(0, SHOW_ITEMS).map(_itemHtml).join('')
                + (shown.length > SHOW_ITEMS ? '<li class="sl-ack-why">and ' + (shown.length - SHOW_ITEMS) + ' more</li>' : '')
                + '</ul><div class="sl-ack-h">What it touches</div><div id="sl-ack-impact" class="sl-dialog-msg">Working out what this touches…</div></div>'
                + '<div class="sl-ack-foot">Acknowledge saves it at once. Your name and the time go in the project journal. Cancel change puts the project back exactly as it was before this change.</div>'
                + '<div class="sl-dialog-actions"><button type="button" class="sl-dialog-cancel sl-ack-cancel"' + (w.noRevert ? ' disabled title="Use Undo for this one"' : '') + '>Cancel change</button><button type="button" class="sl-dialog-ok sl-ack-keep">Acknowledge</button></div>'
                + '</div>';
            document.body.appendChild(ov);
            ov.style.display = 'flex';
            requestAnimationFrame(function () { ov.classList.add('show'); });
            var prevFocus = null; try { prevFocus = document.activeElement; } catch (_) {}
            var done = false;
            function onKey(e) {
                if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); }   // a decision is needed: Escape does nothing
                else if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); finish('keep'); }
                else if (e.key === 'Tab') { /* focus stays inside the two buttons */ var bs = ov.querySelectorAll('button:not([disabled])'); if (bs.length) { var i = Array.prototype.indexOf.call(bs, document.activeElement); e.preventDefault(); bs[(i + (e.shiftKey ? bs.length - 1 : 1)) % bs.length].focus(); } }
            }
            function finish(choice) {
                if (done) return; done = true; _dlgEl = null;
                document.removeEventListener('keydown', onKey, true);
                ov.classList.remove('show');
                setTimeout(function () { try { ov.remove(); } catch (_) {} }, 180);
                try { if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus(); } catch (_) {}
                resolve(choice || 'keep');
            }
            ov._finish = function () { finish('dismiss'); };
            _dlgEl = ov;
            ov.querySelector('.sl-ack-keep').addEventListener('click', function () { finish('keep'); });
            var cb = ov.querySelector('.sl-ack-cancel'); if (cb) cb.addEventListener('click', function () { if (!w.noRevert) finish('cancel'); });
            document.addEventListener('keydown', onKey, true);
            setTimeout(function () { var b = ov.querySelector('.sl-ack-keep'); if (b) b.focus(); }, 40);
            // the impact walk runs after the dialog is on screen, so a big project never delays it
            setTimeout(function () {
                var r = null; try { r = impact(shown); } catch (_) { r = null; }
                w.impact = r; w.impactCount = r ? r.count : 0;
                var el = ov.querySelector('#sl-ack-impact'); if (el) el.innerHTML = r ? _impactHtml(r) : 'The trace could not be worked out for this change.';
            }, 30);
        });
    }

    // ---- input tracking: was this change made by the person? -----------------
    if (typeof document !== 'undefined' && document.addEventListener) {
        var mark = function (e) { if (e && e.isTrusted === false) return; _lastInputAt = _now(); };
        ['keydown', 'paste', 'drop', 'input', 'change', 'click'].forEach(function (t) { document.addEventListener(t, mark, true); });
        var key = function (e) { if (e && e.isTrusted === false) return; _lastKeyAt = _now(); _lastKeyEl = e.target || null; };
        document.addEventListener('keydown', key, true); document.addEventListener('input', key, true);
        document.addEventListener('pointerdown', function (e) { mark(e); if (!(e.target && e.target.closest && e.target.closest('#sl-ack-overlay, #sl-choice-overlay'))) _pointerDown = true; }, true);
        var up = function () { if (!_pointerDown) return; _pointerDown = false; if (_win) _schedule(); };
        W.addEventListener && W.addEventListener('pointerup', up, true);
        W.addEventListener && W.addEventListener('pointercancel', up, true);
        W.addEventListener && W.addEventListener('blur', up);
        document.addEventListener('focusout', function () { if (_win && !_prompting) _schedule(60); }, true);
        document.addEventListener('keyup', function (e) { if (e.key === 'Enter' && _win && !_prompting) { _enterAt = _now(); _schedule(60); } }, true);
        // The seed sweep (idp_seed_trees.js) keeps the MF&MS seed trees in step with the
        // interdependence table on its own: what it writes is derived, never the person's change.
        var wrapIdp = function () {
            try {
                var I = W.SL_IDP; if (!I || typeof I.tick !== 'function' || I.tick._ackSystem) return;
                var t0 = I.tick; I.tick = function () { var a = arguments, self = this; return system(function () { return t0.apply(self, a); }); }; I.tick._ackSystem = true;
            } catch (_) {}
        };
        W.addEventListener && W.addEventListener('load', wrapIdp);
        // Leaving a view (another tab, another fault tree) is when the collected moves and undos
        // are asked about. Nothing collected: the call goes straight through, unchanged.
        var _sameView = function (name, target) {
            try {
                if (name === 'openFTAPageById') return (typeof activeFTAPageId !== 'undefined') && String(activeFTAPageId) === String(target);
                var t = document.getElementById('view-' + target);
                return !!(t && t.style.display !== 'none' && getComputedStyle(t).display !== 'none');
            } catch (_) { return false; }
        };
        var wrapLeave = function () {
            ['switchTab', 'openFTAPageById'].forEach(function (name) {
                try {
                    var f = W[name]; if (typeof f !== 'function' || f._ackLeave) return;
                    var g = function () {
                        var self = this, a = arguments;
                        // only a real move to another view by the person: not a re-render that reopens the
                        // same tab or tree, and not one a restore or an undo makes on its own
                        if (!_bucket || _sysDepth > 0 || _deferDepth > 0 || _sameView(name, a[0])) return f.apply(self, a);
                        return flushDeferred().then(function () { return f.apply(self, a); });
                    };
                    g._ackLeave = true;
                    try { if (W.SLWrap) W.SLWrap.preserve(f, g); } catch (_) {}
                    W[name] = g;
                } catch (_) {}
            });
        };
        W.addEventListener && W.addEventListener('load', function () { wrapLeave(); var k = 0, iv = setInterval(function () { wrapLeave(); if (++k >= 20) clearInterval(iv); }, 500); });
        // The requirement-type migration (req_taxonomy.js) runs while the V&V view draws: an old
        // label rewritten to the ARP4754B class is the app's own upkeep, not an edit.
        var wrapRt = function () {
            try {
                var RT = W.ReqTaxonomy; if (!RT || typeof RT.migrateAll !== 'function' || RT.migrateAll._ackSystem) return;
                var m0 = RT.migrateAll; RT.migrateAll = function (rows) { var r = system(function () { return m0(rows); }); if (r && r.changed) absorb(); return r; }; RT.migrateAll._ackSystem = true;
            } catch (_) {}
        };
        W.addEventListener && W.addEventListener('load', wrapRt);
        W.addEventListener && W.addEventListener('load', function () { setTimeout(function () { try { if (typeof requestIdleCallback === 'function') requestIdleCallback(_ensureStash, { timeout: 3000 }); else _ensureStash(); } catch (_) {} }, 2500); });
    }

    var SLRecords = { records: records, diff: diff, describe: describe, summarize: summarize, applyToModel: applyToModel, applyToObject: applyToObject, live: _live, impact: impact };
    var api = {
        noteChange: noteChange, stash: stash, keepJournal: keepJournal, sameContent: sameContent, system: system, systemAsync: systemAsync, restoring: restoring,
        begin: begin, end: end, batch: batch, describe: describeChange, flush: flush, drop: drop, settle: settle, revertTo: revertTo,
        pending: function () { return !!_win || !!_bucket; },
        deferred: deferred, flushDeferred: flushDeferred, acceptedSnapshot: acceptedSnapshot, reopen: reopen,
        collected: function () { return _bucket ? _bucket.items.map(function (i) { return { kind: i.kind, label: i.label, count: i.count || 1 }; }) : []; },
        // an open change somebody MADE (input, a group, a batch): what Save / Don't Save / Cancel
        // and closing the window care about. A background write is decided on its own in 450 ms.
        pendingUser: function () { return !!(_win && _win.user) || !!_bucket; },
        // the person is mid-gesture or mid-typing: a rebase (which re-renders) waits
        busy: function () { try { return _pointerDown || (_isText(document.activeElement) && (_now() - _lastInputAt) < 4000); } catch (_) { return false; } },
        status: function () { return { open: !!_win, prompting: _prompting, collecting: !!_bucket, collectPrompting: _bucketPrompting, user: !!(_win && _win.user), groups: _openGroupList().length, stashed: _stash != null, stats: JSON.parse(JSON.stringify(_stats)) }; },
        _setTestAnswer: function (a) { _testAnswer = a || null; },
        _markInput: function () { _lastInputAt = _now(); },
        _stashValue: function () { return _stash; },
        QUIET_MS: QUIET_MS, USER_WINDOW_MS: USER_WINDOW_MS
    };
    W.SLChangeAck = api;
    W.SLRecords = SLRecords;
    if (typeof module !== 'undefined' && module.exports) module.exports = { SLChangeAck: api, SLRecords: SLRecords };
})();
