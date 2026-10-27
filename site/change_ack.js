// change_ack.js - v3.4 - 27 Oct 2026 - system and background work are measured from where the project really is: a change whose
//   autosave write is still queued is taken into the "before" first (_freshBeforeSystem), so a sweep in that moment is never handed the
//   person's change (Discard all re-applied it). See tests/regression_bg_changes_20261027.test.js
// ============================================================================
// change_ack.js - v3.0 - 24 Oct 2026 - THE QUIET BAR (Waqas: "replace the confirm changes pop-up with a quiet bar").
//   · Leaving a page or view, switching tree, system, tab or diagram, and pressing Next or Continue open NOTHING.
//   · A small bar (#sl-ack-bar, bottom centre) says how many changes wait, with a Review button.
//   · The review opens only when the person asks (Review, the top bar), saves, closes or reloads, opens or
//     switches project, restores, signs out, or exports (an export holds only confirmed work).
//   · The review gives each change its context: what it is, where it is, every field with its old and new
//     value, and who changed it when. Confirm all records who and when in the journal, as before.
//   Everything below about the collection, saving and the journal is unchanged; the v2.0 list of moments
//   that opened the dialog, (a) and (b), is replaced by the list above.
// ============================================================================
// change_ack.js - v2.0 - 16 Oct 2026 - CHANGES ARE COLLECTED, THEN CONFIRMED ONCE.
//
// THE RULE (owner, confirmed 16 Oct 2026; the same rule as Sys Lab):
//   · While the person works, nothing pops up. Every change they make (an edit, a row added, an AI
//     review Apply, a box moved, an Undo or Redo, a delete after its own "are you sure") goes into
//     ONE collection. The top bar says "N changes to confirm"; clicking it opens the dialog early.
//   · ONE dialog lists everything changed, grouped by kind, in plain words, with what it touches.
//     It opens only when the person
//       (a) leaves the page or view: another page or tab, another fault tree, another system or a
//           system's tabs, another bow-tie or block diagram, closing a walkthrough;
//       (b) presses Next or Continue in any multi-step flow (wizards, the guided particular risk
//           flows, walkthroughs), or an Export / Download button;
//       (c) opens, creates or imports another project, loads a demo, restores a version, signs out,
//           saves or exports a copy ("Confirm all and export" or Keep working), presses Save
//           (Ctrl+S, the top bar), or closes or reloads the window (the browser's own prompt is the
//           last resort; whatever was waiting comes back after a reload or a crash and is offered
//           again).
//   · Buttons: Confirm all, Undo last change, Discard all, Keep working (Escape = Keep working: the
//     dialog closes, the person stays where they are, nothing is lost).
//   · Every change is still confirmed before it counts: nothing waiting is saved to the cloud,
//     shared with teammates or written to the journal as confirmed. Views show it at once; the
//     records, exports and the journal use what was confirmed.
//   · Exceptions: a destructive delete keeps its own "are you sure" and then joins the collection;
//     an AI review "Apply" joins the collection (the review window is the check on the AI content).
//   · One collector: moves and Undo / Redo, collected separately since v1.1, are steps of the same
//     collection. An Undo (Ctrl+Z) that lands exactly on the state before the last step waiting takes
//     that step out (there is nothing left of it to confirm).
//
// What the collection keeps: the confirmed project (the state before the first change waiting), one
// step per change (with the state just before it, for Undo last change), and the background changes
// nobody made meanwhile (they count as confirmed: Discard all keeps them). The dialog lists the
// difference between the confirmed project and the project on screen, so a value changed and changed
// back is not listed, and a collection with nothing left in it ends by itself.
//
// API (window.SLChangeAck): ask(opts) opens the one dialog and resolves 'none' | 'confirmed' |
// 'discarded' | 'keep'; count() is the number the top bar shows; collectNow() puts an open change into
// the collection; batch() / begin() / end() group work into one change; deferred() marks a move or an
// undo; acceptedSnapshot() is the confirmed project while something waits; reopen() puts changes a
// crash left back into the collection. save_state.js routes Save, the leave and project guards, the
// export gates and the window close through ask(). The desktop shell's close guard calls
// window.__slabRequestClose() (save_state.js) and may read window.__slabPendingCount().
// Tests: tests/regression_change_collect_20261016.test.js (unit), tests/regression_change_collect_ui_20261016.test.js
// (browser), and the updated 13-15 Oct suites.
//
// change_ack.js - v1.3 - 16 Oct 2026 (AI Assistant page): AI inputs (source documents) are compared by id,
// name, size, controlled flag and text hash (never the text), and each added, removed or changed document
// is one named line in the dialog ("AI inputs: Propulsion SDD.pdf removed"), not "Source documents changed".
// change_ack.js - v1.2 - 13 Oct 2026 (late): an acknowledged change is SAVED at once (save_state.js v2.0
// AutoSave); acceptedSnapshot(), SLRecords.applyToObject and reopen() were added for that.
// change_ack.js - v1.1 - 13 Oct 2026 (night): moves and Undo / Redo were collected and asked about on leaving
// the view while content edits still asked per gesture. Replaced by v2.0: everything is collected.
// change_ack.js - v1.0 - 13 Oct 2026 - every change asked for acknowledgement after it was made. Replaced by v2.0.
//
// THE FUNNEL. Every edit in this app already ends in scheduleAutosave() (R18: the one
// "the project changed" call; save_watch.js catches a writer that forgets within a second).
// scheduleAutosave calls SLChangeAck.noteChange(), so EVERY change reaches this module
// without any writer having to know about it. What the module does with it:
//
//   1. remembers the project as it was just before the change. That copy is free: it is the last
//      autosave payload (helpers_modules._writeAutosave hands it to stash()), taken at the end of
//      the previous change;
//   2. waits for the change to be FINISHED: 450 ms of quiet, no mouse button held (a drag is one
//      change), and not while the person is still typing (a typed word is one change). A
//      synchronous burst (an AI accept writing 40 rows) is one change; begin()/end() and batch()
//      group longer work (a generator, an async AI apply, a diagram drag) into one;
//   3. works out WHAT CHANGED, row by row, fault tree node by node and setting by setting
//      (SLRecords below: the same row keys the live sync uses), in plain words;
//   4. puts it into the collection (no dialog) and pushes one undo step, so Undo still works;
//   5. when the dialog opens, works out WHAT IT TOUCHES downstream with the existing trace
//      machinery: the golden thread graph (_gtvBuildGraph) for failure conditions, fault trees and
//      common cause rows, and the modification impact closure (modImpact, mod_impact.js) for
//      functions, systems and items, including the handed-off assessments the change will reopen;
//   6. records the decision in the project journal (who, when, what, what it touches).
//
// WHAT IS NOT COLLECTED. Loads, live-sync merges and restores run as SYSTEM changes (system(),
// __crdtApply, _restoreSnap). The app's own bookkeeping (the journal, the activity log, empty
// settings created on first use, recomputed numbers held in underscore fields) is shown to nobody:
// a change made of nothing else is AUTOMATIC. A change nobody started (no keyboard or mouse input in
// the last 3 s, no open group) and that carries no AI-drafted rows is also automatic: the background
// sweeps (seeded MF&MS trees, proposal stores) derive it from the model again whenever it is needed.
//
// SAVING (save_state.js v3.0): Confirm all saves at once (this device, the live sync and the cloud
// copy). What waits is kept on this device only, marked as not confirmed, so a crash or a reload can
// offer it back; it is never uploaded, shared or written to the disk copy or the recovery ring.
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
    // A source document (AI input) as the funnel compares it: its id, name, size, controlled flag and
    // text hash, never the text itself (one real project holds 2.26 MB of documents). 16 Oct 2026: the
    // AI Assistant page's writes (remove, controlled, import replace) are each seen and named.
    function _docKey(d) { return d ? { id: String(d.id || ''), name: String(d.name || d.fileName || d.title || ''), chars: String(d.text || '').length, controlled: !!d.controlled, sha: d.sha256 || null } : null; }
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
            om.set(n, n === 'projectSourceDocs' ? _S((Array.isArray(src[n]) ? src[n] : []).map(_docKey)) : _S(src[n]));
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
    // 26 Oct 2026 (fcim_na.js): the FCIM cells and their "not applicable" fields, named in words in the review
    [['tl', 'total loss'], ['pl', 'partial loss'], ['m', 'malfunction']].forEach(function (c) {
        var s = c[0], w = c[1];
        FIELD[s + 'Id'] = w + ' ID'; FIELD[s + 'Desc'] = w;
        FIELD[s + 'Na'] = w + ': does not apply, because'; FIELD[s + 'NaBy'] = w + ': marked not applicable by'; FIELD[s + 'NaAt'] = w + ': marked not applicable at';
        FIELD[s + 'NaPrevId'] = w + ': ID of the failure condition it held'; FIELD[s + 'NaPrevDesc'] = w + ': the failure condition it held'; FIELD[s + 'NaPrevExtra'] = w + ': the other conditions it held';
        FIELD[s + 'NaParked'] = w + ': FHA rows set aside'; FIELD[s + 'NaKeep'] = w + ': FHA rows kept by choice';
    });
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
    // 14 Oct 2026: particular risk records named in plain words, with the item that changed
    var PRA_PC = { sysLabPhysical: 'Sys Lab physical architecture and its equipment mapping', praRotors: 'Rotor burst values', praTires: 'Tire burst values', praBirds: 'Bird strike values', praVolumes: 'Particular risk volume', praLightning: 'Lightning zones', praLightningFlow: 'Lightning values', praLightningSkin: 'Lightning zones on the skin', praSkinParts: 'External skin parts', praSources: 'Fire, fluid leak and ice sources', praWriteups: 'Accepted AI write-ups', cadLinks: 'CAD equipment links', cadModels: 'CAD model revision', cadReviews: 'CAD review' };
    var PRA_SEQ = { praRotorSeq: 1, praTireSeq: 1, praBirdSeq: 1, praVolumeSeq: 1, praSourceSeq: 1, cadSeq: 1, cadReviewSeq: 1 };   // counters: booked silently
    function _praLabel(k, a, b) {
        var base = PRA_PC[k]; if (!base) return null;
        if (Array.isArray(a) || Array.isArray(b)) {
            var A = Array.isArray(a) ? a : [], B = Array.isArray(b) ? b : [], byId = {}, names = [];
            A.forEach(function (x) { if (x && x.id != null) byId[x.id] = JSON.stringify(x); });
            B.forEach(function (x) { if (x && x.id != null && byId[x.id] !== JSON.stringify(x)) names.push(x.label || x.id); });
            A.forEach(function (x) { if (x && x.id != null && !B.some(function (y) { return y && y.id === x.id; })) names.push((x.label || x.id) + ' (removed)'); });
            return names.length ? base + ' for ' + names.slice(0, 3).join(', ') + (names.length > 3 ? ' and ' + (names.length - 3) + ' more' : '') : base;
        }
        return base;
    }
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
                // 27 Oct 2026: the third cause of the change test failing now and then ("Review your 113 changes" after a Redo).
                // A tree's target (targetP, targetBasis) and its auto-tree record are computed by the app (fc_auto_trees.js
                // from the FHA and the aircraft tree; verify_sync.js copies a target to the verification twin). A Redo or Undo
                // restores a whole snapshot, taken before or after the app last settled them, so they moved with it and were
                // listed as the person's. Computed, unless the person set the target by hand (targetManual).
                var shellComputed = { targetBasis: 1, autoFcTree: 1 };
                if (!pg.targetManual || pg.verifies != null) shellComputed.targetP = 1;
                if (e.op === 'changed') { var fs = _fields(a, b, shellComputed); fs.fields = fs.fields.filter(function (x) { return x.field !== '__hasTree'; }); it.fields = fs.fields; it.derived = !fs.fields.length; }
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
            if (e.space === 'other' && e.key === 'projectSourceDocs') {
                // one line per document added, removed or changed, by name
                var A0 = Array.isArray(a) ? a.filter(Boolean) : [], B0 = Array.isArray(b) ? b.filter(Boolean) : [], n0 = items.length;
                var byId = function (L) { var m = {}; L.forEach(function (d) { m[d.id] = d; }); return m; }, MA = byId(A0), MB = byId(B0);
                B0.forEach(function (d) { if (!MA[d.id]) items.push({ op: 'added', space: e.space, key: e.key, area: 'AI inputs', label: d.name || 'document', fields: [], book: false, derived: false }); });
                A0.forEach(function (d) { if (!MB[d.id]) items.push({ op: 'removed', space: e.space, key: e.key, area: 'AI inputs', label: d.name || 'document', fields: [], book: false, derived: false }); });
                B0.forEach(function (d) {
                    var o = MA[d.id]; if (!o || _S(o) === _S(d)) return;
                    var fs0 = [];
                    if (o.name !== d.name) fs0.push({ field: 'name', name: 'name', was: _val(o.name), now: _val(d.name) });
                    if (o.controlled !== d.controlled) fs0.push({ field: 'controlled', name: 'controlled', was: o.controlled ? 'yes' : 'no', now: d.controlled ? 'yes' : 'no' });
                    if (o.chars !== d.chars || (o.sha && d.sha && o.sha !== d.sha)) fs0.push({ field: 'text', name: 'text', was: o.chars.toLocaleString() + ' characters', now: d.chars.toLocaleString() + ' characters' + (o.chars === d.chars ? ', different content' : '') });
                    items.push({ op: 'changed', space: e.space, key: e.key, area: 'AI inputs', label: d.name || 'document', fields: fs0, book: false, derived: !fs0.length });
                });
                if (items.length > n0) return;
            }
            if (e.space === 'other') {
                it.area = 'Project'; it.label = OTHER_LABEL[e.key] || _human(e.key);
                if (e.op === 'added' && _empty(b)) it.book = true;
                else if (e.op === 'changed' && _empty(a) && _empty(b)) it.derived = true;
                items.push(it); return;
            }
            if (e.space === 'pc') {
                it.area = 'Project settings'; it.label = _praLabel(e.key, a, b) || _human(e.key); it.ref = { kind: 'setting', key: e.key };
                if (PRA_PC[e.key]) it.area = /^cad/.test(e.key) ? 'CAD model' : 'Particular risks';
                if (BOOK_PC[e.key] || PRA_SEQ[e.key] || e.key.charAt(0) === '_') it.book = true;
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
    // The funnel and THE COLLECTION (v2.0, 16 Oct 2026): one collector for every kind of change.
    // =======================================================================
    var _sysDepth = 0, _restoreDepth = 0, _stash = null, _lastInputAt = 0, _pointerDown = false, _enterAt = 0, _lastKeyAt = 0;
    var _win = null, _seq = 0, _groups = {}, _groupSeq = 0, _timer = null, _notes = [];
    var _rc = null;   // { key: the stash string the records describe, R: those records }
    // _noteSeq counts every change noteChange sees; _stashSeq is the count the stash was taken at.
    // A stash older than the last change means the write for it is still queued (one microtask).
    var _noteSeq = 0, _stashSeq = 0;
    // The collection: null, or
    //   { id, at, baseline: the confirmed project (a snapshot string) before the first change waiting,
    //     noRevert: the baseline was taken after the first change (Discard all cannot be offered),
    //     undoMark: the app undo depth when it began,
    //     steps: [{ kind: 'change' | 'move' | 'undo' | 'redo', label, before: the project just before
    //               this step (null: it cannot be taken back here), undoMark, onRevert: [], at, count, ai }],
    //     autoD: [{ D, n }]: background changes nobody made while it waited (they count as confirmed;
    //            n = how many steps there were when it came),
    //     ver: bumped on every step added or taken back, baseR: records of the confirmed project,
    //     acc: the confirmed project as a snapshot string (cached), net: what the dialog lists }
    var _col = null, _deferDepth = 0, _deferInfo = null, _lastDeferredAt = 0;
    var _askState = null;        // the one confirmation dialog while it is open
    var _stats = { noted: 0, system: 0, automatic: 0, collected: 0, confirmed: 0, discarded: 0, undoneLast: 0, kept: 0, canceled: 0, prompts: 0, nothing: 0, deferred: 0 };
    var _testAnswer = null;      // tests only: answers the dialog without a click (see _setTestAnswer)

    function _snapNow() {
        try { var s = (typeof W._snapshotProject === 'function') ? W._snapshotProject() : (typeof _snapshotProject === 'function' ? _snapshotProject() : null); return s ? JSON.stringify(s) : null; } catch (_) { return null; }
    }
    // helpers_modules._writeAutosave hands every serialized payload here: the state at the end of
    // the last change, which is the state just BEFORE the next one.
    function stash(payload) { if (typeof payload === 'string') { _stash = payload; _stashSeq = _noteSeq; } }
    function _ensureStash() { if (_stash == null && !_win) { _stash = _snapNow(); _stashSeq = _noteSeq; } }
    // The write for the last change is still queued: take the state now, so what is decided next is
    // measured from where the project really is.
    function _freshStash() { if (_stash != null && _stashSeq < _noteSeq) { var s = _snapNow(); if (s) { _stash = s; _stashSeq = _noteSeq; } } }
    // 27 Oct 2026: the second cause of regression_change_ack_ui's "Discard all" failing now and then. A Redo (or any
    // change) writes its autosave a moment later; a background sweep that ran in that moment was measured from the
    // state BEFORE the Redo, so the Redo was counted as the sweep's (background, "counts as confirmed") and Discard all,
    // which re-applies background work, put the Redo straight back. Before system or background work starts, bring
    // the "before" up to date if the last change's write is still queued (_freshStash). Outermost call only, and never
    // while a change is being measured.
    function _freshBeforeSystem() { try { if (_sysDepth === 0 && !_win && _restoreDepth === 0) _freshStash(); } catch (_) {} }
    function system(fn) { _freshBeforeSystem(); _sysDepth++; try { return fn(); } finally { _sysDepth--; } }
    // 25 Oct 2026: background work on a timer (the verification-tree and failure-condition-tree sweeps).
    // It runs as a system change, is decided at once (never left open for a Review to list), and the
    // "before" of the next change is taken right after it: the autosave write that would carry it is
    // still queued, so without this the person's next edit was measured from before the sweep and the
    // sweep's new trees were listed as theirs.
    function background(fn) {
        var r = system(fn);   // 27 Oct 2026: system() brings the "before" up to date first
        try { if (_win && _win.system) { _win.background = true; _resolve(true); } } catch (_) {}
        try { if (!_win && _restoreDepth === 0) { var s = _snapNow(); if (s) { _stash = s; _stashSeq = _noteSeq; } } } catch (_) {}
        return r;
    }
    // this module's own writes (Discard all, Undo last change, the journal entry): system changes that
    // are never recorded as background work of the collection
    var _ownDepth = 0;
    function _own(fn) { _ownDepth++; _sysDepth++; try { return fn(); } finally { _sysDepth--; _ownDepth--; } }
    // A system change made outside any save call (a migration run while drawing a view) becomes
    // the new "before" at once, so the next change the person makes is measured from it.
    function absorb() { if (_win || _sysDepth > 0) return; system(function () { try { if (typeof W.scheduleAutosave === 'function') W.scheduleAutosave(); } catch (_) {} }); }
    function systemAsync(fn) {
        _freshBeforeSystem();   // 27 Oct 2026
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
    function _event(detail) { try { if (typeof CustomEvent === 'function' && W.dispatchEvent) W.dispatchEvent(new CustomEvent('sl:change-ack', { detail: detail })); } catch (_) {} _bar(); }
    // ---- the quiet bar (24 Oct 2026, Waqas): nothing opens while the person works; a small bar says how many
    // changes wait, with Review. It is gone when nothing waits and while the review itself is open.
    function _bar() {
        if (typeof document === 'undefined' || !document.body) return;
        var n = count(), el = document.getElementById('sl-ack-bar');
        if (!el) {
            if (!n) return;
            _injectStyle();
            el = document.createElement('div'); el.id = 'sl-ack-bar'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
            el.innerHTML = '<span class="dot" aria-hidden="true"></span><span class="txt"></span><button type="button" class="sl-ack-review">Review</button>';
            el.querySelector('button').addEventListener('click', function () { ask({ reason: 'early' }); });
            document.body.appendChild(el);
        }
        var on = n > 0 && !_askState;
        el.classList.toggle('on', on);
        if (on) el.querySelector('.txt').textContent = n + (n === 1 ? ' change' : ' changes') + ' waiting to be confirmed';
    }

    // scheduleAutosave calls this for every change it accepts. Returns what it decided.
    var _lastNotedAt = 0;
    function noteChange() {
        _stats.noted++; _lastNotedAt = _now(); _noteSeq++;
        if (_sysDepth > 0) {
            _stats.system++;
            // A system change while changes wait (a migration as a view draws, the seed sweep): it is not
            // the person's, so it is measured on its own and counts as confirmed (Discard all keeps it)
            if (_col && !_win && _ownDepth === 0 && _restoreDepth === 0 && _stash != null) {
                _win = { id: ++_seq, at: _now(), lastAt: _now(), baseline: _stash, noRevert: false, user: false, system: true, labels: [], notes: [], onRevert: [], sources: {}, undoMark: _undoDepth() };
                _schedule();
            } else if (_win && _win.system) { _win.lastAt = _now(); _schedule(); }
            return 'system';
        }
        if (_deferDepth > 0) return _noteDeferred(_deferInfo || {});
        var groupOpen = _openGroupList().length > 0;
        var userish = groupOpen || (_lastInputAt > 0 && (_now() - _lastInputAt) < USER_WINDOW_MS);
        if (!_win) {
            var base = _stash;
            if (base == null && !userish) { _stats.automatic++; return 'automatic'; }   // nothing to compare against and nobody asked (right after a load)
            var noRevert = false;
            if (base == null) { base = _snapNow(); noRevert = true; }
            _win = { id: ++_seq, at: _now(), lastAt: _now(), baseline: base, noRevert: noRevert, user: userish, labels: [], notes: _notes.splice(0), onRevert: [], sources: {}, undoMark: _undoMarkFor(base) };
            _openGroupList().forEach(_attachGroup);
            var S0 = _save(); if (S0 && S0._ackOpened) { try { S0._ackOpened(_win); } catch (_) {} }
        } else if (userish && _win.system) {
            // the person edits while a system change is still being measured: the system change ends at
            // the state written after it (the stash), and the person's edit is its own change from there.
            // Written in the same instant (no stash between them): they cannot be told apart, so the
            // whole of it is the person's to confirm (never the other way round).
            var sw = _win;
            if (_stash != null && _stashSeq === _noteSeq - 1 && _stash !== sw.baseline) {
                if (_timer) { clearTimeout(_timer); _timer = null; }
                try { var Ds = diff(records(_P(sw.baseline) || {}), records(_P(_stash) || {})); if (_col && Ds.length) _addAuto(Ds); } catch (_) {}
                _rc = null; _stats.automatic++; _close(sw, 'automatic');
                _win = { id: ++_seq, at: _now(), lastAt: _now(), baseline: _stash, noRevert: false, user: true, labels: [], notes: _notes.splice(0), onRevert: [], sources: {}, undoMark: _undoMarkFor(_stash) };
                _openGroupList().forEach(_attachGroup);
            } else { sw.system = false; sw.user = true; }
        } else if (userish) _win.user = true;
        _win.lastAt = _now();
        try { _win.focusEl = (typeof document !== 'undefined') ? document.activeElement : null; } catch (_) {}
        _schedule();
        return 'noted';
    }

    // ---- the collection ------------------------------------------------------
    function _openCol(baseline, noRevert, undoMark) {
        _col = { id: ++_seq, at: _now(), baseline: baseline, noRevert: !!noRevert, undoMark: undoMark, steps: [], autoD: [], ver: 0, baseR: null, acc: null, net: null, when: {} };
        return _col;
    }
    function _baseRecords() {
        if (!_col) return null;
        if (!_col.baseR) _col.baseR = records(_P(acceptedSnapshot()) || {});
        return _col.baseR;
    }
    // Lay a diff onto records directly (cheap, exact: the diff carries the record strings).
    function _patchRecords(R, D) {
        (D || []).forEach(function (e) {
            if (e.op === 'reordered') return;
            var sp = R[e.space] || (R[e.space] = { map: new Map(), order: [], key: null });
            if (e.op === 'removed') { if (sp.map.has(e.key)) { sp.map.delete(e.key); sp.order = sp.order.filter(function (k) { return k !== e.key; }); } }
            else { if (!sp.map.has(e.key)) sp.order.push(e.key); sp.map.set(e.key, e.b); }
        });
    }
    // Shape positions on diagrams (diagram_editor.js POS_KEYS, and the fault tree layout fields): a
    // record that differs only in these is a move, listed by its move line, not as a changed record.
    var POS_DEEP = { x: 1, y: 1, w: 1, h: 1, x0: 1, y0: 1, points: 1, waypoints: 1, route: 1, bends: 1, descBoxHeight: 1 };
    function _noPos(v) {
        if (Array.isArray(v)) return v.map(_noPos);
        if (v && typeof v === 'object') { var o = {}; Object.keys(v).sort().forEach(function (k) { if (!POS_DEEP[k]) o[k] = _noPos(v[k]); }); return o; }
        return v;
    }
    // does any shape position differ between two versions of a record (at any depth)?
    function _posDiff(a, b) {
        if (Array.isArray(a) && Array.isArray(b)) { for (var i = 0; i < Math.min(a.length, b.length); i++) if (_posDiff(a[i], b[i])) return true; return false; }
        if (a && b && typeof a === 'object' && typeof b === 'object') {
            var ks = {}; Object.keys(a).concat(Object.keys(b)).forEach(function (k) { ks[k] = 1; });
            return Object.keys(ks).some(function (k) { return POS_DEEP[k] ? _S(a[k]) !== _S(b[k]) : _posDiff(a[k], b[k]); });
        }
        return false;
    }
    function _positionsOnly(e) { try { return _S(_noPos(_P(e.a))) === _S(_noPos(_P(e.b))); } catch (_) { return false; } }
    // what the collection lists: everything that differs from the confirmed project, in plain words
    function _netFrom(Rb) {
        var D = diff(_baseRecords(), Rb), items = describe(D), byKey = {};
        D.forEach(function (e) { byKey[e.space + '|' + e.key] = e; });
        _fold(items);
        items.forEach(function (i) { if (i.op === 'changed' && i.space && !i.derived && !i.book) { var e = byKey[i.space + '|' + i.key]; if (e && e.a != null && e.b != null && _positionsOnly(e)) i.layout = true; } });
        var shown = items.filter(function (i) { return !i.book && !i.derived && !i.view && !i.folded && !i.layout; });
        return { D: D, items: items, shown: shown };
    }
    function _updateNet(Rb) {
        if (!_col) return;
        try { _col.net = _netFrom(Rb || records(_live())); } catch (e) { _col.net = null; try { console.warn('[change-ack] list failed', e); } catch (_) {} return; }
        // nothing is left to confirm (a value changed and changed back): the collection ends quietly
        if (!_col.net.shown.length && !_col.steps.some(function (s) { return s.kind !== 'change'; })) _endCol('nothing');
    }
    var _netTimer = null;
    function _netLater() { if (_netTimer) clearTimeout(_netTimer); _netTimer = setTimeout(function () { _netTimer = null; if (_col && !_win) { _updateNet(); _event({ decision: 'collected', count: count(), collected: true }); } }, 400); }
    function _addAuto(D) {
        if (!_col || !D || !D.length) return;
        _col.autoD.push({ D: D, n: _col.steps.length });
        if (_col.baseR) _patchRecords(_col.baseR, D);
        _col.acc = null;
    }
    // A change made by the person goes into the collection as one step.
    function _collect(w, items, shown, D, Rb) {
        if (!_col) _openCol(w.baseline, w.noRevert, w.undoMark);
        var labels = w.labels.filter(Boolean), notes = (w.notes || []).map(function (n) { return n.summary; }).filter(Boolean);
        var label = labels.length ? labels.join(', ') : (notes[0] || summarize(shown, 1));
        _col.steps.push({ kind: 'change', label: _clip(label, 140), before: w.noRevert ? null : w.baseline, undoMark: w.undoMark, onRevert: w.onRevert.slice(), at: _now(), count: shown.length, ai: shown.some(function (i) { return i.ai; }) });
        _col.ver++; _stats.collected++;
        // 24 Oct 2026: who changed each record and when (first and last time in this collection), for the review list
        var t = _now(), by = _who();
        (shown || []).forEach(function (i) { if (!i || !i.space) return; var k = i.space + '|' + i.key, w0 = _col.when[k]; _col.when[k] = { first: w0 ? w0.first : t, last: t, by: by }; });
        // one undo step (Ctrl+Z) per collected change, as before: Undo takes it back, and an Undo that
        // lands exactly on the state before the last step waiting simply takes that step out
        try { if (typeof W._slUndoPushSnap === 'function' && w.baseline && !w.noRevert) W._slUndoPushSnap(_clip(summarize(items, 1), 60) || 'change', w.baseline, w.undoMark); } catch (_) {}
        _updateNet(Rb);
    }
    // A move, an undo or a redo: a step of its own.
    function _noteDeferred(info) {
        _stats.deferred++;
        var kind = info.kind || 'move';
        // a move nobody made (no keyboard or mouse input in the last 3 s, no open group): the app
        // placing shapes by itself, not something to confirm
        if (kind === 'move' && !_openGroupList().length && !(_lastInputAt > 0 && (_now() - _lastInputAt) < USER_WINDOW_MS)) { _stats.automatic++; return 'automatic'; }
        if (_win) { _win.lastAt = _now(); return 'noted'; }   // inside a content change already open: it goes with it
        // Undo (Ctrl+Z) back to exactly the state before the last step waiting: that step is taken
        // out of the collection (it is undone, there is nothing left of it to confirm)
        if (kind === 'undo' && _col && typeof info.snap === 'string') {
            var last = _col.steps[_col.steps.length - 1];
            if (last && last.before != null && last.before === info.snap) { _takeOutLast(false, info.snap); _lastDeferredAt = _now(); return 'undone'; }
        }
        if (!_col) {
            var base = _stash; if (base == null) base = _snapNow();
            _openCol(base, false, _undoDepth());
            var S0 = _save(); if (S0 && S0._ackOpened) { try { S0._ackOpened(_col); } catch (_) {} }
        }
        var label = info.label || (kind === 'move' ? 'Moved a shape' : 'Undo');
        var lastS = _col.steps[_col.steps.length - 1];
        if (lastS && lastS.kind === kind && lastS.label === label && kind === 'move') lastS.count = (lastS.count || 1) + 1;   // nudging the same box ten times is one line
        else { _col.steps.push({ kind: kind, label: label, before: _stash, undoMark: _undoDepth(), onRevert: [], at: _now(), count: 1 }); _col.ver++; }
        _lastDeferredAt = _now();
        _netLater();
        _event({ decision: 'collected', count: count(), collected: true });
        return 'deferred';
    }
    function deferred(info, fn) {
        // a change still open when a move or an undo starts goes into the collection first, measured
        // before it, so the two never mix
        if (_win) { try { _resolve(true); } catch (_) {} }
        _freshStash();
        _deferDepth++; var prev = _deferInfo; _deferInfo = info || {};
        try { return fn(); }
        finally {
            _deferDepth--; _deferInfo = prev;
            // 27 Oct 2026: the last cause of "Discard all" failing now and then. A Redo (or a move) is a step whose autosave
            // write lands a moment later; any change in that moment that was not the person's (a view's own bookkeeping
            // as it drew) was measured from BEFORE the Redo, took the Redo with it as "background" and Discard all, which
            // keeps background work, put the Redo back. The step is in the collection now: take the state right after it
            // as the "before" of whatever comes next.
            try { if (_deferDepth === 0 && !_win && _restoreDepth === 0) { var sNow = _snapNow(); if (sNow) { _stash = sNow; _stashSeq = _noteSeq; } } } catch (_) {}
        }
    }
    // Lay one background change back on top (synced stores by record; the other stores whole,
    // through their declared accessor).
    function _applyContent(D) {
        D = (D || []).filter(function (e) { return !(e.space === 'pc' && (BOOK_PC[e.key] || String(e.key).charAt(0) === '_')); });   // never roll the journal or logs back
        applyToModel(D);
        (D || []).forEach(function (e) {
            if (e.space !== 'other' || e.key === 'projectSourceDocs') return;
            try { var st = W.SLStores && W.SLStores.byKey && W.SLStores.byKey(e.key); if (st && st.set) st.set(e.op === 'removed' ? undefined : _P(e.b)); } catch (_) {}
        });
    }
    // Take the last step back (the dialog's Undo last change, or Ctrl+Z landing on its "before").
    // restore: put the project back to the state before it (false: the app's Undo already did).
    // fromSnap: the snapshot the app's Undo restored (Ctrl+Z), when restore is false.
    function _takeOutLast(restore, fromSnap) {
        var c = _col; if (!c) return false;
        var k = c.steps.length - 1, s = c.steps[k]; if (!s) return false;
        if (restore && s.before == null) return false;
        c.steps.pop(); c.ver++; _rc = null;
        var later = c.autoD.filter(function (a) { return a.n > k; });
        _own(function () {
            if (restore) revertTo(s.before, s.undoMark);
            if (later.length) { later.forEach(function (a) { try { _applyContent(a.D); } catch (_) {} }); try { if (typeof W.scheduleAutosave === 'function') W.scheduleAutosave(); } catch (_) {} }
        });
        // Restoring a snapshot rewrites a little of it (the app normalizes the rows it loads). That is the
        // app's own work, not the person's: it is measured and counted as confirmed, so the list shows only
        // the steps still waiting.
        try {
            var exp = _P(restore ? s.before : (fromSnap || s.before));
            if (exp) {
                later.forEach(function (a) { exp = applyToObject(exp, (a.D || []).filter(function (e) { return !(e.space === 'pc' && (BOOK_PC[e.key] || String(e.key).charAt(0) === '_')); })); });
                var Dn = diff(records(exp), records(_live())).filter(function (e) { return e.op !== 'reordered'; });
                if (Dn.length) _addAuto(Dn);
            }
        } catch (_) {}
        s.onRevert.forEach(function (f) { try { f(); } catch (_) {} });
        _stats.undoneLast++;
        if (!c.steps.length) { _endCol('emptied'); return true; }
        _updateNet();
        _event({ decision: 'collected', count: count(), collected: true });
        return true;
    }
    function _endCol(why) {
        var c = _col; if (!c) return;
        _col = null; _rc = null;
        var S = _save();
        try { if (S && S._ackClosed) S._ackClosed({ baseline: c.baseline }, why === 'confirmed' ? 'kept' : (why === 'nothing' ? 'automatic' : 'canceled')); } catch (_) {}
        _event({ decision: why === 'confirmed' ? 'kept' : (why === 'nothing' ? 'nothing' : 'canceled'), id: c.id, count: 0, collected: true });
    }
    function _lines(c) {
        c = c || _col; if (!c) return [];
        var out = (c.net ? c.net.shown : []).slice();
        c.steps.forEach(function (s) { if (s.kind !== 'change' || !c.net) out.push({ step: s }); });   // no list worked out (it failed): one line per change
        return out;
    }
    // How many lines the one dialog lists (what the top bar counts). A change still being made (typing, a
    // drag) is counted once it is finished; leaving, closing and every guard put it in first, so nothing
    // is missed, and a view's own bookkeeping write after a click never shows as a change for a moment.
    function count() { return _col ? _lines().length : 0; }
    function _summaryText(c) {
        var ls = _lines(c), verbs = { added: 'Added', changed: 'Changed', removed: 'Removed', reordered: 'Reordered' };
        var parts = ls.slice(0, 4).map(function (i) {
            if (i.step) return (i.step.kind === 'move' ? 'Moved: ' : (i.step.kind === 'redo' ? 'Redone: ' : 'Undone: ')) + i.step.label + (i.step.count > 1 ? ' (x' + i.step.count + ')' : '');
            return verbs[i.op] + ' ' + i.area + ': ' + i.label + ((i.fields && i.fields.length) ? ' (' + i.fields.slice(0, 3).map(function (x) { return x.name; }).join(', ') + ')' : '');
        });
        if (ls.length > 4) parts.push('and ' + (ls.length - 4) + ' more');
        return parts.join('; ');
    }
    function _confirmAll(impactCount) {
        var c = _col; if (!c) return;
        var n = _lines(c).length, text = _summaryText(c);
        _stats.confirmed++; _stats.kept++;
        _jr('change-ack', _who() + ' confirmed ' + n + ' change' + (n === 1 ? '' : 's') + ': ' + text + (impactCount ? ' (touches ' + impactCount + ')' : ''));
        _endCol('confirmed');
    }
    function _discardAll() {
        var c = _col; if (!c) return false;
        if (c.noRevert) return false;
        var n = _lines(c).length, text = _summaryText(c);
        _rc = null;
        _own(function () {
            revertTo(c.baseline, c.undoMark);
            // background changes made while it waited are not the person's: they stay
            if (c.autoD.length) { c.autoD.forEach(function (a) { try { _applyContent(a.D); } catch (_) {} }); try { if (typeof W.scheduleAutosave === 'function') W.scheduleAutosave(); } catch (_) {} }
        });
        c.steps.slice().reverse().forEach(function (s) { s.onRevert.forEach(function (f) { try { f(); } catch (_) {} }); });
        _stats.discarded++; _stats.canceled++;
        _jr('change-cancel', _who() + ' discarded ' + n + ' change' + (n === 1 ? '' : 's') + ': ' + text);
        _endCol('discarded');
        return true;
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
    // Typing: focus in an editable element (input, textarea, select, contenteditable) and a keystroke or
    // input in the last TYPING_PAUSE_MS (Enter ends it). 16 Oct 2026: nothing opens over the person any
    // more; what typing still decides is where one change ends, so a typed word is one change in the
    // collection (and one Undo last change), not one per pause between letters.
    var TYPING_PAUSE_MS = 1500, NON_TEXT_INPUT = { button: 1, submit: 1, reset: 1, checkbox: 1, radio: 1, hidden: 1, range: 1, color: 1, file: 1, image: 1 };
    function _isEditable(el) {
        if (!el || !el.tagName) return false;
        if (el.isContentEditable) return true;
        if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
        return el.tagName === 'INPUT' && !NON_TEXT_INPUT[String(el.type || 'text').toLowerCase()];
    }
    function _typingNow() {
        try { if (!_isEditable(document.activeElement)) return false; if (_enterAt >= _lastKeyAt) return false; return (_now() - _lastKeyAt) < TYPING_PAUSE_MS; } catch (_) { return false; }
    }
    function _pauseLeft() { return Math.max(60, TYPING_PAUSE_MS - (_now() - _lastKeyAt) + 30); }
    // Is the open change finished? Then it goes into the collection (no dialog).
    function _try(force) {
        _timer = null;
        if (!_win) return;
        if (!force) {
            if (_openGroupList().length) return;            // end() retries
            if (_win.user && _pointerDown) return;           // pointerup retries
            if (_win.user && _typingNow()) { _schedule(_pauseLeft()); return; }   // still typing: one word is one change
            if ((_now() - _win.lastAt) < QUIET_MS - 20) { _schedule(QUIET_MS); return; }
            // (v1.x waited while another modal was on screen so two dialogs never stacked; collecting opens
            // nothing, so an edit made in an editing form is counted in the top bar as soon as it is finished)
        }
        _resolve(force === true);
    }

    function _who() {
        try { var s = (typeof _supabaseSession !== 'undefined') ? _supabaseSession : null; if (s && s.user && s.user.email) return s.user.email; } catch (_) {}
        try { if (typeof W._wsUser === 'function') { var u = W._wsUser(); if (u && u.email) return u.email; } } catch (_) {}
        return 'Not signed in';
    }
    // The journal entry is the app's own bookkeeping: written as a system change, never a change to confirm.
    function _jr(kind, msg) { try { if (typeof W.jrnl === 'function') _own(function () { W.jrnl(kind, msg); }); } catch (_) {} }

    // a tree added or removed whole is one line ("with 480 nodes"), not 480 lines
    function _fold(items) {
        var whole = {};
        // 25 Oct 2026: a verification tree follows its top-down tree (mirror_modes.js, verify_sync.js). The same
        // edit echoed onto the twin node (same logical id, same fields, same new values) is part of the person's
        // one change, not a second one: it is folded into the source line.
        try {
            var ver = {};
            (_live().ftaPages || []).forEach(function (p) { if (p && p.id != null && p.verifies != null) ver[String(p.id)] = String(p.verifies); });
            var src = {};
            var sig = function (i) { return (i.fields || []).map(function (f) { return f.field + '=' + _S(f.now); }).join('|'); };
            items.forEach(function (i) { if (i.space === 'fta:node' && i.ref && i.ref.logicalId && !ver[String(i.ref.pageId)]) src[String(i.ref.pageId) + '|' + i.ref.logicalId + '|' + i.op] = sig(i); });
            items.forEach(function (i) {
                if (i.space !== 'fta:node' || !i.ref || !i.ref.logicalId) return;
                var vs = ver[String(i.ref.pageId)]; if (!vs) return;
                var k = vs + '|' + i.ref.logicalId + '|' + i.op;
                if (src[k] !== undefined && (i.op !== 'changed' || src[k] === sig(i))) i.folded = true;
            });
        } catch (_) {}
        items.forEach(function (i) { if (i.space === 'fta:shell' && (i.op === 'added' || i.op === 'removed') && i.ref) { whole[String(i.ref.pageId) + '|' + i.op] = i; i.nodes = 0; } });
        items.forEach(function (i) { if (i.space === 'fta:node' && i.ref && whole[String(i.ref.pageId) + '|' + i.op]) { whole[String(i.ref.pageId) + '|' + i.op].nodes++; i.folded = true; } });
        Object.keys(whole).forEach(function (k) { var pg = whole[k]; if (pg.nodes && pg.label.indexOf(' (with ') < 0) pg.label += ' (with ' + pg.nodes + ' node' + (pg.nodes === 1 ? '' : 's') + ')'; });
    }
    // Look at the open change and decide: nothing, automatic (a background change nobody made), or
    // the person's change, which goes into the collection.
    function _resolve(forced) {
        var w = _win; if (!w) return 'none';
        if (_timer) { clearTimeout(_timer); _timer = null; }
        _freshStash();
        var items = [], D = [], Rb = null;
        try {
            // The "before" records are usually the "after" records of the previous decision (the
            // stash string is the same object): reusing them halves the cost on a large project
            // (measured: 100k fault tree nodes, 690 ms -> under 300 ms per decision).
            var Ra = (_rc && _rc.key === w.baseline) ? _rc.R : records(_P(w.baseline) || {});
            Rb = records(_live());
            D = diff(Ra, Rb); items = describe(D);
            _rc = (_stash != null && _stashSeq === _noteSeq) ? { key: _stash, R: Rb } : null;
        } catch (e) { _rc = null; try { console.warn('[change-ack] diff failed', e); } catch (_) {} }
        _fold(items);
        var shown = items.filter(function (i) { return !i.book && !i.derived && !i.view && !i.folded; });
        var ai = items.some(function (i) { return i.ai; });
        w.items = items; w.D = D;
        if (!D.length) { _stats.nothing++; return _close(w, 'nothing'); }
        if (!shown.length || w.system || (!w.user && !ai)) {
            _stats.automatic++;
            if (_col) _addAuto(D);   // counts as confirmed: Discard all keeps it, the confirmed copy carries it
            return _close(w, 'automatic');
        }
        _collect(w, items, shown, D, Rb);
        return _close(w, 'collected');
    }
    function _close(w, decision) {
        if (_win === w) _win = null;
        var S = _save();
        try { if (S && S._ackClosed) S._ackClosed(w, decision); } catch (_) {}
        _event({ decision: decision, id: w.id, summary: w.items ? summarize(w.items, 3) : '', count: count(), collected: decision === 'collected' });
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
        _stash = snapStr; _stashSeq = _noteSeq;
        return true;
    }
    // The project journal is append-only and hash-chained: a restore (Discard, Undo) must never take
    // entries back out of it, or the record of a decision would vanish with the change it records.
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
    // Put the open change into the collection now (no waiting for the quiet period or for typing).
    function collectNow() { if (_win) { try { _resolve(true); } catch (e) { try { console.warn('[change-ack] collect failed', e); } catch (_) {} } } return !!_col; }
    // Close everything waiting without asking: revert it (opts.revert) or keep it on screen as it is.
    function drop(opts) {
        if (_win) { if (_timer) { clearTimeout(_timer); _timer = null; } var w = _win; if (opts && opts.revert && w.baseline && !w.noRevert && !_col) revertTo(w.baseline, w.undoMark); _close(w, (opts && opts.revert) ? 'canceled' : 'dropped'); }
        if (_col) { var c = _col; if (opts && opts.revert && !c.noRevert) _own(function () { revertTo(c.baseline, c.undoMark); }); _col = null; _endColSilently(c); }
        _closeDialog('none');
        return true;
    }
    function _endColSilently(c) { var S = _save(); try { if (S && S._ackClosed) S._ackClosed({ baseline: c.baseline }, 'canceled'); } catch (_) {} _event({ decision: 'canceled', id: c.id, count: 0, collected: true }); }
    // A project was loaded or replaced: nothing open, nothing to compare against, and the click
    // that started the load is not a reason to collect what the load wrote.
    function settle() {
        _win = null;
        if (_timer) { clearTimeout(_timer); _timer = null; }
        _col = null; _closeDialog('none');
        _stash = null; _stashSeq = _noteSeq; _lastInputAt = 0; _notes = []; _rc = null;
        setTimeout(function () { try { if (_stash == null && !_win) { if (typeof requestIdleCallback === 'function') requestIdleCallback(_ensureStash, { timeout: 2000 }); else _ensureStash(); } } catch (_) {} }, 1200);
    }

    // The project as CONFIRMED so far, as a snapshot string: nothing that still waits to be confirmed.
    // null = nothing waits, so the live project is the confirmed one. While changes are collected it is
    // the state before the first of them with the background changes made since laid on top (exactly
    // what Discard all would leave on screen). Its journal is the confirmed journal: what modules wrote
    // to the journal about changes still waiting is confirmed with them.
    function acceptedSnapshot() {
        if (_col) {
            if (_col.acc != null) return _col.acc;
            if (!_col.autoD.length) return (_col.acc = _col.baseline);
            var o = _P(_col.baseline); if (!o) return null;
            _col.autoD.forEach(function (a) { o = applyToObject(o, (a.D || []).filter(function (e) { return !(e.space === 'pc' && (BOOK_PC[e.key] || String(e.key).charAt(0) === '_')); })); });
            return (_col.acc = _S(o));
        }
        if (_win && !_win.noRevert) return _win.baseline;
        return null;
    }
    // A crash or a reload left changes nobody confirmed (the autosave on this device holds them): they
    // go back into the collection, measured from the confirmed copy saved with them, and are offered
    // back (save_state.js recovered() opens the dialog). Confirm all saves them; Discard all returns to
    // what was confirmed; Keep working leaves them waiting in the top bar.
    // restored (optional): the project exactly as the crash left it, as restored. Then only what
    // differs between the confirmed copy and THAT is listed: the app's own writes since the restore
    // (views drawn, settings created on first use) are measured out, by laying the reverse of the
    // waiting changes onto the project as it is now.
    // Returns true (collected), false (nothing was waiting) or 'busy' (the dialog is open, or the app is
    // still writing as it starts up: try again shortly, so start-up writes are never mixed in).
    // force: the last try; whatever the person started meanwhile stays on top as its own steps.
    function reopen(acceptedStr, label, restored, force) {
        if (!acceptedStr) return false;
        if (_askState) return 'busy';
        if (!force && !_col && (_win || (_now() - _lastNotedAt) < 2500)) return 'busy';
        collectNow();
        var base = acceptedStr;
        if (restored && typeof restored === 'object') {
            try {
                var D0 = diff(records(_P(acceptedStr) || {}), records(restored)).filter(function (e) { return e.op !== 'reordered'; });
                if (!D0.length) return false;   // nothing was waiting after all
                var back = D0.map(function (e) { return { space: e.space, key: e.key, op: e.op === 'added' ? 'removed' : (e.op === 'removed' ? 'added' : 'changed'), a: e.b, b: e.a }; });
                var cur = _P(_col ? _col.baseline : _snapNow()); if (cur) base = _S(applyToObject(cur, back));
            } catch (_) { base = acceptedStr; }
        }
        _rc = null;
        var before = _col ? _col.baseline : _snapNow();
        var Dr;
        try { Dr = diff(records(_P(base) || {}), records(_P(before) || {})); } catch (_) { Dr = []; }
        if (!Dr.length) return false;
        var it = describe(Dr); _fold(it);
        var vis = it.filter(function (i) { return !i.book && !i.derived && !i.view && !i.folded; });
        // nothing the person made, not even a shape moved (only the journal, settings created on first use,
        // recomputed numbers): there is nothing to offer back
        if (!vis.length) {
            var moved = Dr.some(function (e) { return e.op === 'changed' && !(e.space === 'pc' && (BOOK_PC[e.key] || String(e.key).charAt(0) === '_')) && _posDiff(_P(e.a), _P(e.b)); });
            if (!moved) return false;
        }
        var step = vis.length
            ? { kind: 'change', label: label || 'Changes from your last session that were not confirmed', before: base, undoMark: 0, onRevert: [], at: _now(), count: vis.length, reopened: true }
            : { kind: 'move', label: 'Shapes moved on diagrams in your last session', before: base, undoMark: 0, onRevert: [], at: _now(), count: 1, reopened: true };
        if (_col) {
            _col.baseline = base; _col.baseR = null; _col.acc = null; _col.noRevert = false; _col.undoMark = 0;
            _col.steps.unshift(step); _col.autoD.forEach(function (a) { a.n++; }); _col.ver++;
            if (_col.steps[1] && _col.steps[1].before == null) _col.steps[1].before = before;
        } else {
            _openCol(base, false, 0); _col.steps.push(step); _col.ver++;
            var S0 = _save(); if (S0 && S0._ackOpened) { try { S0._ackOpened(_col); } catch (_) {} }
        }
        _updateNet();
        _event({ decision: 'collected', count: count(), collected: true, reopened: true });
        return !!_col;
    }

    // ---- public grouping ---------------------------------------------------
    function begin(label, opts) { var t = 'g' + (++_groupSeq); _groups[t] = { label: label || '', opts: opts || {} }; if (_win) _attachGroup(_groups[t]); return t; }
    function end(token) { var g = _groups[token]; if (!g) return; delete _groups[token]; if (_win) _attachGroup(g); if (_win) _schedule(); }
    // batch(): one change for a piece of work (a generator, an async AI apply). It resolves as soon as
    // the work is in the collection: { acknowledged: true (in place, waiting to be confirmed with the
    // rest), collected, result }. Taking it back is Undo last change or Discard all in the dialog,
    // which also run opts.onRevert.
    function batch(label, fn, opts) {
        var t = begin(label, opts);
        var finish = function (res) {
            end(t);
            if (_win && !_openGroupList().length) _resolve(true);
            return { acknowledged: true, collected: !!_col, result: res };
        };
        try { var r = fn(); if (r && typeof r.then === 'function') return r.then(function (v) { return finish(v); }, function (e) { end(t); throw e; }); return Promise.resolve(finish(r)); }
        catch (e) { end(t); return Promise.reject(e); }
    }
    function describeChange(info) { if (!info) return; if (_col && !_win && (_now() - _lastDeferredAt) < 100) return; var note = { summary: info.summary || '', refs: info.refs || [] }; if (_win) _win.notes.push(note); else { _notes.push(note); if (_notes.length > 20) _notes.shift(); } }

    // ---- THE ONE DIALOG ----------------------------------------------------------
    // ask(opts): open the one confirmation for everything collected. Resolves 'none' (nothing was
    // waiting), 'confirmed', 'discarded' (Discard all, or Undo last change took the last one back) or
    // 'keep' (Keep working: the dialog closes, everything stays waiting, the caller does not go on).
    // opts.reason: 'leave' | 'step' | 'project' | 'export' | 'save' | 'close' | 'early' | 'recovered';
    // opts.action: what the person was doing, in words ("open another project"); opts.exportLabel.
    // A second ask while the dialog is open shares its answer.
    function ask(opts) {
        opts = opts || {};
        if (_askState) return _askState.promise;
        collectNow();
        if (!_col) return Promise.resolve('none');
        var st = { opts: opts, note: '' };
        st.promise = new Promise(function (res) { st.resolve = res; });
        _askState = st; _stats.prompts++;
        _event({ decision: 'asking', count: count(), collected: true });
        if (_testAnswer) { setTimeout(function () { _testDecide(st); }, 0); return st.promise; }
        if (typeof document === 'undefined' || !document.body) { setTimeout(function () { _finishAsk(st, 'keep'); }, 0); return st.promise; }
        _renderDialog(st);
        return st.promise;
    }
    function _testDecide(st) {
        var a = _testAnswer;
        if (a === 'keep' || a === 'confirm') return _choose(st, 'confirm');
        if (a === 'cancel' || a === 'discard') return _choose(st, 'discard');
        if (a === 'undo') { _choose(st, 'undo'); if (_askState === st) _finishAsk(st, 'keep'); return; }
        _choose(st, 'working');
    }
    function _finishAsk(st, result) {
        if (_askState !== st) return;
        _askState = null;
        if (st.ov) { var ov = st.ov; st.ov = null; try { document.removeEventListener('keydown', st.onKey, true); } catch (_) {} ov.classList.remove('show'); setTimeout(function () { try { ov.remove(); } catch (_) {} }, 180); try { if (st.prevFocus && st.prevFocus.focus && document.contains(st.prevFocus)) st.prevFocus.focus(); } catch (_) {} }
        _event({ decision: 'answered', answer: result, count: count(), collected: true });
        try { st.resolve(result); } catch (_) {}
    }
    function _closeDialog(result) { if (_askState) _finishAsk(_askState, result); }
    function _choose(st, choice) {
        if (_askState !== st) return;
        if (choice === 'working') return _finishAsk(st, 'keep');
        // a change still open (a background job writing as the person answers) joins the list first;
        // if the list grew since it was drawn, it is drawn again: nothing is confirmed unseen
        collectNow();
        if (!_col) return _finishAsk(st, 'discarded');
        if (choice === 'confirm') {
            if (st.ov && st.shownVer !== _col.ver) { st.note = 'More changes came in while this was open. Check them, then confirm.'; _renderDialog(st); return; }
            _confirmAll(st.impactCount || 0);
            return _finishAsk(st, 'confirmed');
        }
        if (choice === 'discard') {
            if (!_discardAll()) { st.note = 'These changes were already in place before a copy could be taken, so they cannot be discarded here. Use Undo instead.'; if (st.ov) _renderDialog(st); else _finishAsk(st, 'keep'); return; }
            return _finishAsk(st, 'discarded');
        }
        if (choice === 'undo') {
            if (!_takeOutLast(true)) { st.note = 'The last change cannot be taken back here. Use Undo instead.'; if (st.ov) _renderDialog(st); return; }
            if (!_col) return _finishAsk(st, 'discarded');
            st.note = '';
            if (st.ov) _renderDialog(st);
        }
    }

    function _injectStyle() {
        if (typeof document === 'undefined' || document.getElementById('sl-ack-style')) return;
        var st = document.createElement('style'); st.id = 'sl-ack-style';
        // near-black text everywhere: no gray text in this dialog (house rule)
        var INK = 'var(--color-text,#1d1d1f)';
        st.textContent = '#sl-ack-overlay{z-index:2147483642}'
            + '.sl-ack-card{max-width:660px;width:94%;max-height:88vh;display:flex;flex-direction:column;color:' + INK + '}'
            + '.sl-ack-card .sl-dialog-msg,.sl-ack-card .sl-dialog-title{color:' + INK + '}'
            + '.sl-ack-body{overflow:auto;margin-top:6px;padding-right:4px;flex:1 1 auto;min-height:0}.sl-ack-card .sl-dialog-actions{flex:0 0 auto;flex-wrap:wrap;gap:8px}'
            + '.sl-ack-h{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:' + INK + ';margin:14px 0 6px}'
            + '.sl-ack-gh{font-size:13px;font-weight:700;color:' + INK + ';margin:10px 0 2px}'
            + '.sl-ack-list{list-style:none;margin:0;padding:0;font-size:13px;color:' + INK + '}'
            + '.sl-ack-list li{padding:6px 0;border-bottom:1px solid var(--color-border-hair,#e3e6ea)}'
            + '.sl-ack-op{display:inline-block;min-width:66px;font-size:11px;font-weight:700;padding:1px 7px;border-radius:999px;margin-right:6px;text-align:center;background:var(--color-surface-2,#f3f4f6);color:' + INK + '}'
            + '.sl-ack-op.added{color:#0B6B33}.sl-ack-op.removed{color:#B01E18}.sl-ack-op.changed{color:#1F55B8}.sl-ack-op.reordered,.sl-ack-op.moved,.sl-ack-op.undone,.sl-ack-op.redone{color:' + INK + '}'
            + '.sl-ack-f{font-size:12.5px;color:' + INK + ';margin:3px 0 0 74px}'
            + '.sl-ack-was{text-decoration:line-through}'
            + '.sl-ack-g{margin:4px 0 8px}.sl-ack-gt{font-size:12.5px;font-weight:700;color:' + INK + '}'
            + '.sl-ack-g ul{margin:2px 0 0 0;padding-left:18px;font-size:12.5px;color:' + INK + '}'
            + '.sl-ack-why,.sl-ack-last,.sl-ack-foot{color:' + INK + '}'
            + '.sl-ack-last{font-size:12.5px;margin-top:8px}'
            + '.sl-ack-note{font-size:13px;font-weight:600;color:#8A4B00;margin-top:8px}'
            + '.sl-ack-foot{font-size:12.5px;margin-top:12px}'
            + '.sl-ack-ai{font-size:11px;font-weight:700;color:#5E2A86;margin-left:6px}'
            + '.sl-ack-meta{font-size:12px;color:' + INK + ';margin:3px 0 0 74px}'
            + '.sl-ack-ft{margin:5px 0 0 74px;border-collapse:collapse;font-size:12.5px;color:' + INK + '}'
            + '.sl-ack-ft th{text-align:left;font-weight:700;padding:2px 10px 2px 0;font-size:11.5px}'
            + '.sl-ack-ft td{padding:2px 10px 2px 0;vertical-align:top;max-width:240px;word-break:break-word}'
            // the quiet bar (24 Oct 2026): what waits, and one button to review it; it never covers the page
            + '#sl-ack-bar{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:1850;display:none;align-items:center;gap:12px;padding:7px 8px 7px 14px;border-radius:999px;background:var(--color-surface-1,#fff);border:1px solid var(--color-border-strong,#c9ced6);box-shadow:0 4px 16px rgba(0,0,0,.12);font-size:13px;color:' + INK + '}'
            + '#sl-ack-bar.on{display:flex}#sl-ack-bar .dot{width:8px;height:8px;border-radius:50%;background:#C88A00;flex:none}'
            + '#sl-ack-bar button{font-size:12.5px;font-weight:700;padding:5px 14px;border-radius:999px;border:1px solid var(--color-accent,#2E6BD6);background:var(--color-accent,#2E6BD6);color:#fff;cursor:pointer}'
            + '.sl-choice-card{max-width:500px}';
        (document.head || document.documentElement).appendChild(st);
    }
    function _clock(t) { try { return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (_) { return ''; } }
    function _whenText(w) {
        if (!w) return '';
        var a = _clock(w.first), b = _clock(w.last);
        return (w.by ? w.by + ', ' : '') + (a === b ? 'at ' + a : 'between ' + a + ' and ' + b);
    }
    // 24 Oct 2026: each line says what it is, where it is, every field that changed (old and new), and who
    // changed it when
    var SHOW_FIELDS = 8;
    function _itemHtml(i, c) {
        if (i.step) {
            var s = i.step, v = { move: ['moved', 'Moved'], undo: ['undone', 'Undone'], redo: ['redone', 'Redone'], change: ['changed', 'Changed'] }[s.kind] || ['moved', 'Moved'];
            return '<li><span class="sl-ack-op ' + v[0] + '">' + v[1] + '</span>' + _esc(s.label) + (s.count > 1 ? ' (' + s.count + ' times)' : '')
                + (s.at ? '<div class="sl-ack-meta">' + _esc(_whenText({ first: s.at, last: s.at, by: _who() })) + '</div>' : '') + '</li>';
        }
        var verbs = { added: 'Added', changed: 'Changed', removed: 'Removed', reordered: 'Reordered' };
        var h = '<li><span class="sl-ack-op ' + i.op + '">' + verbs[i.op] + '</span><b>' + _esc(i.label) + '</b>' + (i.ai ? '<span class="sl-ack-ai">AI drafted</span>' : '');
        h += '<div class="sl-ack-meta">In ' + _esc(i.area || 'the project') + (c && c.when && c.when[i.space + '|' + i.key] ? ' · ' + _esc(_whenText(c.when[i.space + '|' + i.key])) : '') + '</div>';
        var F = i.fields || [];
        if (i.op === 'changed' && F.length) h += '<table class="sl-ack-ft"><thead><tr><th>Field</th><th>Was</th><th>Now</th></tr></thead><tbody>'
            + F.slice(0, SHOW_FIELDS).map(function (f) { return '<tr><td>' + _esc(f.name) + '</td><td class="sl-ack-was">' + _esc(f.was) + '</td><td><b>' + _esc(f.now) + '</b></td></tr>'; }).join('')
            + '</tbody></table>';
        else F.slice(0, SHOW_FIELDS).forEach(function (f) { h += '<div class="sl-ack-f">' + _esc(f.name) + ': <b>' + _esc(i.op === 'removed' ? f.was : f.now) + '</b></div>'; });
        if (F.length > SHOW_FIELDS) h += '<div class="sl-ack-f">and ' + (F.length - SHOW_FIELDS) + ' more fields</div>';
        return h + '</li>';
    }
    // grouped by kind: one heading per area ("Aircraft FHA", "Fault tree · PSSA pitch"), then the
    // moves on diagrams, then Undo and Redo
    function _groupsHtml(lines) {
        var order = [], by = {}, shown = 0, MAXG = 8, MAX = 40, left = 0;
        lines.forEach(function (i) {
            var g = i.step ? (i.step.kind === 'move' ? 'Moves on diagrams' : (i.step.kind === 'change' ? 'Changes' : 'Undo and Redo')) : (i.area || 'Project');
            if (!by[g]) { by[g] = []; order.push(g); }
            by[g].push(i);
        });
        order.sort(function (a, b) { var r = function (x) { return x === 'Moves on diagrams' ? 1 : (x === 'Undo and Redo' ? 2 : 0); }; return r(a) - r(b); });
        var h = '';
        order.forEach(function (g) {
            var L = by[g];
            h += '<div class="sl-ack-grp"><div class="sl-ack-gh">' + _esc(g) + ' (' + L.length + ')</div><ul class="sl-ack-list">';
            L.forEach(function (i, k) { if (k < MAXG && shown < MAX) { h += _itemHtml(i, _col); shown++; } else left++; });
            if (L.length > MAXG && shown < MAX) h += '<li>and ' + (L.length - Math.min(L.length, MAXG)) + ' more here</li>';
            h += '</ul></div>';
        });
        if (shown >= MAX && left) h += '<div class="sl-ack-why">and ' + left + ' more</div>';
        return h;
    }
    function _impactHtml(r) {
        if (!r || !r.groups.length) return '<div class="sl-dialog-msg">Nothing else is traced to these changes.</div>';
        var h = '';
        r.groups.forEach(function (g) {
            h += '<div class="sl-ack-g"><div class="sl-ack-gt">' + _esc(g.title) + ' (' + g.entries.length + ')</div><ul>';
            g.entries.slice(0, 8).forEach(function (e) { h += '<li>' + _esc(e.label) + ' <span class="sl-ack-why">(' + _esc(e.why) + ')</span></li>'; });
            if (g.entries.length > 8) h += '<li class="sl-ack-why">and ' + (g.entries.length - 8) + ' more</li>';
            h += '</ul></div>';
        });
        if (r.truncated) h += '<div class="sl-ack-why">This project is very large: the list above stopped after ' + Math.round(r.ms / 100) / 10 + ' s and may not be complete.</div>';
        return h;
    }
    var LEAD = {
        leave: function (a) { return 'Before you ' + (a || 'leave this page') + ', check what you changed.'; },
        step: function (a) { return 'Before you ' + (a || 'go to the next step') + ', check what you changed.'; },
        project: function (a) { return 'Before you ' + (a || 'open another project') + ', check what you changed.'; },
        export: function (a) { return 'Before you ' + (a || 'export') + ', check what you changed. The export holds only confirmed work.'; },
        save: function () { return 'Check what you changed.'; },
        close: function () { return 'Before you close the window, check what you changed.'; },
        early: function () { return 'Here is everything you changed and have not confirmed yet.'; },
        recovered: function () { return 'These changes from your last session were never confirmed. They are back on screen.'; }
    };
    function _renderDialog(st) {
        _injectStyle();
        var c = _col; if (!c) return;
        var lines = _lines(c), n = lines.length, o = st.opts || {}, exp = o.reason === 'export';
        var lead = (exp && o.exportKind === 'cloud') ? 'Before you ' + (o.action || 'save the project to the cloud') + ', check what you changed. Only confirmed work is saved.'
            : (exp && o.exportKind === 'copy') ? 'Before you ' + (o.action || 'save a copy') + ', check what you changed. The copy holds only confirmed work.'
            : (LEAD[o.reason] || LEAD.early)(o.action);
        lead += ' Nothing you change counts until you confirm it. Confirm all saves it and shares it with your team.';
        var last = c.steps[c.steps.length - 1];
        var lastTxt = last ? (last.kind === 'move' ? 'Moved: ' : (last.kind === 'undo' ? 'Undone: ' : (last.kind === 'redo' ? 'Redone: ' : ''))) + last.label : '';
        var canUndo = !!(last && last.before != null), canDiscard = !c.noRevert;
        var html = '<div class="sl-dialog-card sl-ack-card" role="dialog" aria-modal="true" aria-labelledby="sl-ack-title" aria-describedby="sl-ack-lead">'
            + '<h3 class="sl-dialog-title" id="sl-ack-title">' + (n === 1 ? 'Review your change' : 'Review your ' + n + ' changes') + '</h3>'
            + '<div class="sl-dialog-msg" id="sl-ack-lead">' + _esc(lead) + '</div>'
            + (st.note ? '<div class="sl-ack-note" role="alert">' + _esc(st.note) + '</div>' : '')
            + (!exp && lastTxt ? '<div class="sl-ack-last" id="sl-ack-last"><b>Last change</b> (what Undo last change takes back): ' + _esc(lastTxt) + '</div>' : '')
            + '<div class="sl-ack-body"><div class="sl-ack-h">What you changed</div><div id="sl-ack-items">' + _groupsHtml(lines) + '</div>'
            + '<div class="sl-ack-h">What it touches</div><div id="sl-ack-impact" class="sl-dialog-msg">Working out what this touches…</div>'
            + '</div>'
            + '<div class="sl-ack-foot">' + (exp
                ? (o.exportKind === 'cloud' ? 'Confirm all and save: your changes are confirmed, then the project is saved to the cloud. Keep working: nothing is saved and nothing is lost.'
                   : o.exportKind === 'copy' ? 'Confirm all and save a copy: your changes are confirmed, then the copy is saved. Keep working: nothing is saved and nothing is lost.'
                   : 'Confirm all and export: your changes are saved and shared, then the export runs. Keep working: nothing is exported and nothing is lost.')
                : 'Confirm all: saved and shared, with your name and the time in the project journal. Undo last change: takes back only the last one. Discard all: puts the project back as it was before these changes. Keep working: closes this and you stay where you are; nothing is lost.') + '</div>'
            + '<div class="sl-dialog-actions">'
            // data-modal-close: Keep working is this dialog's exit, so the app's generic close (x) is not added
            + '<button type="button" class="sl-dialog-cancel sl-ack-working" data-ack="working" data-modal-close="1">Keep working</button>'
            + (exp ? '' : '<button type="button" class="sl-dialog-cancel sl-ack-discard" data-ack="discard"' + (canDiscard ? '' : ' disabled title="These changes cannot be discarded here; use Undo"') + '>Discard all</button>'
                + '<button type="button" class="sl-dialog-cancel sl-ack-undo" data-ack="undo"' + (canUndo ? '' : ' disabled title="The last change cannot be taken back here; use Undo"') + '>Undo last change</button>')
            + '<button type="button" class="sl-dialog-ok sl-ack-confirm sl-ack-keep" data-ack="confirm">' + (exp ? _esc(o.exportLabel || 'Confirm all and export') : 'Confirm all') + '</button>'
            + '</div></div>';
        var ov = st.ov;
        if (!ov) {
            try { st.prevFocus = document.activeElement; } catch (_) {}
            ov = document.createElement('div'); ov.id = 'sl-ack-overlay'; ov.className = 'modal-overlay sl-ack-overlay';
            document.body.appendChild(ov); ov.style.display = 'flex';
            requestAnimationFrame(function () { ov.classList.add('show'); });
            st.ov = ov;
            st.onKey = function (e) {
                if (_askState !== st) return;
                if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); _choose(st, 'working'); }   // Escape = Keep working: nothing lost
                else if (e.key === 'Enter') { var f = document.activeElement, a = f && f.getAttribute && f.getAttribute('data-ack'); e.preventDefault(); e.stopImmediatePropagation(); if (a && !f.disabled) _choose(st, a); else _choose(st, 'confirm'); }
                else if (e.key === 'Tab') { var bs = ov.querySelectorAll('button:not([disabled])'); if (bs.length) { var i = Array.prototype.indexOf.call(bs, document.activeElement); e.preventDefault(); bs[(i + (e.shiftKey ? bs.length - 1 : 1) + bs.length) % bs.length].focus(); } }
            };
            document.addEventListener('keydown', st.onKey, true);
            ov.addEventListener('click', function (e) { var b = e.target && e.target.closest && e.target.closest('button[data-ack]'); if (b && !b.disabled) _choose(st, b.getAttribute('data-ack')); });
        }
        ov.innerHTML = html;
        st.shownVer = c.ver;
        setTimeout(function () { var b = ov.querySelector('.sl-ack-confirm'); if (b && _askState === st) b.focus(); }, 40);
        // the impact walk runs after the dialog is on screen, so a big project never delays it
        var shownItems = (c.net ? c.net.shown : []).slice(), ver = c.ver;
        setTimeout(function () {
            if (_askState !== st || !_col || _col.ver !== ver) return;
            var r = null; try { r = impact(shownItems); } catch (_) { r = null; }
            st.impactCount = r ? r.count : 0;
            var el = ov.querySelector('#sl-ack-impact'); if (el) el.innerHTML = r ? _impactHtml(r) : 'The trace could not be worked out for these changes.';
        }, 30);
    }

    // ---- input tracking: was this change made by the person? -----------------
    if (typeof document !== 'undefined' && document.addEventListener) {
        var mark = function (e) { if (e && e.isTrusted === false) return; _lastInputAt = _now(); };
        ['keydown', 'paste', 'drop', 'input', 'change', 'click'].forEach(function (t) { document.addEventListener(t, mark, true); });
        var key = function (e) { if (e && e.isTrusted === false) return; _lastKeyAt = _now(); };
        document.addEventListener('keydown', key, true); document.addEventListener('input', key, true);
        document.addEventListener('pointerdown', function (e) { mark(e); if (!(e.target && e.target.closest && e.target.closest('#sl-ack-overlay, #sl-choice-overlay'))) _pointerDown = true; }, true);
        var up = function () { if (!_pointerDown) return; _pointerDown = false; if (_win) _schedule(); };
        W.addEventListener && W.addEventListener('pointerup', up, true);
        W.addEventListener && W.addEventListener('pointercancel', up, true);
        W.addEventListener && W.addEventListener('blur', up);
        document.addEventListener('focusout', function () { if (_win) _schedule(60); }, true);
        document.addEventListener('keyup', function (e) { if (e.key === 'Enter' && _win) { _enterAt = _now(); _schedule(60); } }, true);
        // The seed sweep (idp_seed_trees.js) keeps the MF&MS seed trees in step with the
        // interdependence table on its own: what it writes is derived, never the person's change.
        var wrapIdp = function () {
            try {
                var I = W.SL_IDP; if (!I || typeof I.tick !== 'function' || I.tick._ackSystem) return;
                var t0 = I.tick; I.tick = function () { var a = arguments, self = this; return system(function () { return t0.apply(self, a); }); }; I.tick._ackSystem = true;
            } catch (_) {}
        };
        W.addEventListener && W.addEventListener('load', wrapIdp);
        // 24 Oct 2026 (v3.0, Waqas): leaving a page or view, switching tree, system, tab or diagram, and pressing
        // Next / Continue open NOTHING. What waits stays in the quiet bar until the person reviews it, saves or
        // closes. (v2.0 opened the dialog on every one of those moves.)
        // ---- Export / Download buttons. An export holds only confirmed work, so a click on one while changes
        // wait is held, the review opens, and after Confirm all (or Discard all) the same control is clicked
        // again. Keep working: nothing is exported and nothing is lost. Declared: data-sl-step="export";
        // data-sl-step="none" opts a button out. Known: the particular risk report exports.
        var EXPORT_SEL = '[data-pra-act$="report-export"],[data-pra-act$="report-print"]';
        var _bypass = false;
        var _isExport = function (el) {
            if (!el || el.disabled || el.closest('#sl-ack-overlay, #sl-choice-overlay, #sl-dialog-overlay, #sl-ack-bar')) return false;
            var d = el.getAttribute('data-sl-step');
            if (d) return d === 'export';
            try { if (el.matches(EXPORT_SEL)) return true; } catch (_) {}
            var t = String(el.textContent || el.value || '').replace(/\s+/g, ' ').trim();
            if (!t || t.length > 48) return false;
            return /^(\W\s*)?(Export|Download)(\s|$|[^A-Za-z])/i.test(t);
        };
        W.addEventListener && W.addEventListener('click', function (e) {
            if (_bypass || (!_win && !_col) || _askState || _sysDepth > 0) return;
            var el = e.target && e.target.closest && e.target.closest('button, [role="button"], input[type="button"], input[type="submit"], a[href]');
            if (!_isExport(el)) return;
            if (!collectNow()) return;
            e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation();
            ask({ reason: 'export', action: 'export' }).then(function (r) {
                if (r === 'keep' || !document.contains(el)) return;
                _bypass = true; try { el.click(); } finally { _bypass = false; }
            });
        }, true);
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
        noteChange: noteChange, stash: stash, keepJournal: keepJournal, sameContent: sameContent, system: system, background: background, systemAsync: systemAsync, restoring: restoring,
        begin: begin, end: end, batch: batch, describe: describeChange, drop: drop, settle: settle, revertTo: revertTo,
        // the one dialog and the collection
        ask: ask, collectNow: collectNow, count: count,
        // flush(): Save and the guards; true = nothing left waiting (confirmed or discarded), false = Keep
        // working. flush({ changeOnly: true }): only put the open change into the collection, ask nothing.
        flush: function (opts) { if (opts && opts.changeOnly) { collectNow(); return Promise.resolve(true); } return ask({ reason: (opts && opts.reason) || 'save' }).then(function (r) { return r !== 'keep'; }); },
        flushDeferred: function () { return ask({ reason: 'leave' }).then(function (r) { return r !== 'keep'; }); },
        pending: function () { return !!_win || !!_col; },
        // something the PERSON made waits (an open change of theirs, or the collection): what closing the
        // window, opening another project and the top bar care about. A background write is decided on
        // its own in 450 ms.
        pendingUser: function () { return !!(_win && _win.user) || !!_col; },
        deferred: deferred, acceptedSnapshot: acceptedSnapshot, reopen: reopen,
        collected: function () { return _col ? _col.steps.map(function (s) { return { kind: s.kind, label: s.label, count: s.count || 1 }; }) : []; },
        lines: function () { return _lines().map(function (i) { return i.step ? { kind: i.step.kind, label: i.step.label, count: i.step.count || 1 } : { kind: 'change', op: i.op, area: i.area, label: i.label, ai: !!i.ai, fields: (i.fields || []).map(function (f) { return { name: f.name, was: f.was, now: f.now }; }) }; }); },
        // the person is mid-gesture or mid-typing: a rebase (which re-renders) waits
        busy: function () { try { return _pointerDown || (_isText(document.activeElement) && (_now() - _lastInputAt) < 4000); } catch (_) { return false; } },
        status: function () { return { open: !!_win, timer: !!_timer, openFor: _win ? _now() - _win.at : 0, quietFor: _win ? _now() - _win.lastAt : 0, prompting: !!_askState, asking: !!_askState, collecting: !!_col, collectPrompting: !!_askState, user: !!(_win && _win.user), groups: _openGroupList().length, stashed: _stash != null, steps: _col ? _col.steps.length : 0, count: count(), stats: JSON.parse(JSON.stringify(_stats)) }; },
        // tests only: 'confirm' (or the old 'keep'), 'discard' (or 'cancel'), 'undo', 'working'
        _setTestAnswer: function (a) { _testAnswer = a || null; },
        typing: function () { return _typingNow(); }, TYPING_PAUSE_MS: TYPING_PAUSE_MS,
        _markInput: function () { _lastInputAt = _now(); },
        _stashValue: function () { return _stash; },
        QUIET_MS: QUIET_MS, USER_WINDOW_MS: USER_WINDOW_MS
    };
    W.SLChangeAck = api;
    W.SLRecords = SLRecords;
    if (typeof module !== 'undefined' && module.exports) module.exports = { SLChangeAck: api, SLRecords: SLRecords };
})();
