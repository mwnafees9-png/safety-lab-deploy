// ============================================================================
// ai_audit.js — v1.1 — the audit trail behind every AI draft
// (23 Sep 2026, standards gap G10; EASA AI concept paper Issue 03, NIST AI RMF).
//
// POSITION (Waqas, 23 Sep 2026): Safety Lab's AI is ADVISORY ONLY. It proposes;
// an engineer reviews and accepts every item; no certification credit is
// claimed for its output, so no tool qualification is claimed either. What a
// reviewer then needs is to reconstruct, for any AI-drafted artifact:
//   which model and which prompt version drafted it, from which input, what it
//   originally said, every change the engineer made, and what it says now.
//
// WHAT THIS MODULE RECORDS
//   1. CALL LOG — projectConfig.aiDraftLog: one entry per AI call (Provider.
//      complete calls recordCall): id AIC-000001…, feature, model, prompt
//      version (the skill stamp id@vN#hash), time, a fingerprint + size of the
//      exact input (system prompt + messages) and of the raw output, the
//      outcome (ok / insufficient / error). The raw output TEXT is kept for the
//      most recent KEEP_TEXT calls; older entries keep only its fingerprint,
//      so the project file cannot grow without bound. Inputs are fingerprinted,
//      never copied (the source document is already in the project).
//   2. PER ARTIFACT — on every AI row the sweep keeps:
//        aiCallId    the logged call that drafted it (same feature, latest call
//                    at or before the row's aiAt)
//        aiOriginal  the row's text as the AI drafted it (first time seen)
//        aiEdits     every later change: [{at, by, diff:[{field,from,to}]}]
//        aiSeen      fingerprint of the text last seen
//      The sweep compares rows to what it last saw, so an edit through ANY path
//      (worksheet form, FHA editor, chat, import) is recorded the same way.
//      Rows drafted before this module have no original: they are reported as
//      "drafted before the audit trail", never back-filled as if original.
// Level 1B is enforced elsewhere and only surfaced here: an accepted AI row
// stays "unreviewed" (red badge, blocks hand-off) until an engineer edits it
// or a reviewer approves it (ai_badges.js).
// See tests/regression_ai_audit.test.js.
// ============================================================================
(function (root) {
    'use strict';

    var KEEP_TEXT = 30;        // raw output text kept for the most recent calls
    var MAX_LOG = 5000;        // entries kept; older ones are counted, not silently lost
    var FIELD_CAP = 4000;      // characters kept per field in an original / diff

    function _fnv(s) {
        var h = 0x811c9dc5; s = String(s == null ? '' : s);
        for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
        return ('0000000' + h.toString(16)).slice(-8);
    }
    function _pc() { try { return (typeof projectConfig !== 'undefined' && projectConfig) ? projectConfig : null; } catch (_) { return null; } }
    // v1.1 (23 Sep 2026): the log lives in projectConfig.aiDraftLog. v1.0 wrote to
    // projectConfig.aiAuditLog, which core_modules.js's COST log already owns (capped at 500,
    // shown in AI Settings): the two collided. On first use, any AIC-… entries found there
    // are moved here, in order, and the counter resumes after the highest id.
    function _log() {
        var pc = _pc(); if (!pc) return null;
        if (!Array.isArray(pc.aiDraftLog)) pc.aiDraftLog = [];
        if (Array.isArray(pc.aiAuditLog) && pc.aiAuditLog.some(function (e) { return e && /^AIC-\d+$/.test(e.id || ''); })) {
            var mine = pc.aiAuditLog.filter(function (e) { return e && /^AIC-\d+$/.test(e.id || ''); });
            pc.aiAuditLog = pc.aiAuditLog.filter(function (e) { return !(e && /^AIC-\d+$/.test(e.id || '')); });
            var have = {}; pc.aiDraftLog.forEach(function (e) { have[e.id] = 1; });
            mine.forEach(function (e) { if (!have[e.id]) pc.aiDraftLog.push(e); });
            pc.aiDraftLog.sort(function (a, b) { return parseInt(a.id.slice(4), 10) - parseInt(b.id.slice(4), 10); });
            var top = pc.aiDraftLog.reduce(function (m, e) { return Math.max(m, parseInt(String(e.id).slice(4), 10) || 0); }, 0);
            pc.aiDraftCounter = Math.max(pc.aiDraftCounter || 0, pc.aiAuditCounter || 0, top);
            delete pc.aiAuditCounter;
        }
        return pc.aiDraftLog;
    }
    function _me() { try { var m = root.SLAvatar && root.SLAvatar.me && root.SLAvatar.me(); return (m && m.name) || ''; } catch (_) { return ''; } }
    function _nowIso() { return new Date().toISOString(); }

    // ---- 1. the call log ------------------------------------------------------------------
    function recordCall(info) {
        try {
            info = info || {};
            var log = _log(); if (!log) return null;
            var pc = _pc();
            pc.aiDraftCounter = (pc.aiDraftCounter || 0) + 1;
            var input = JSON.stringify({ system: info.system || '', messages: info.messages || [] });
            var text = String(info.text == null ? '' : info.text);
            var e = {
                id: 'AIC-' + String(pc.aiDraftCounter).padStart(6, '0'),
                feature: String(info.feature || ''), purpose: info.purpose || null, model: info.model || null, skill: info.skill || null,
                at: _nowIso(), inputHash: _fnv(input), inputChars: input.length,
                outputHash: _fnv(text), outputChars: text.length, output: text,
                stopReason: info.stopReason || null, outcome: info.outcome || 'ok'
            };
            if (info.error) e.error = String(info.error).slice(0, 300);
            log.push(e);
            // keep the raw text only for the most recent KEEP_TEXT calls
            for (var i = log.length - KEEP_TEXT - 1; i >= 0; i--) { if (log[i].output == null) break; delete log[i].output; log[i].outputTrimmed = true; }
            if (log.length > MAX_LOG) { var n = log.length - MAX_LOG; log.splice(0, n); pc.aiDraftDropped = (pc.aiDraftDropped || 0) + n; }
            try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {}
            return e.id;
        } catch (_) { return null; }
    }
    function call(id) { var log = _log() || []; for (var i = log.length - 1; i >= 0; i--) if (log[i].id === id) return log[i]; return null; }
    // The unified batch completes as 'chat.edit' and names its target in cfg.analysis
    // (recorded as the call's purpose); a few purposes stamp rows under other names.
    var PURPOSE_ALIAS = { fha: ['fha.populate', 'sfha.populate'] };
    function _callServes(e, f) {
        var keys = [e.feature, e.purpose].filter(Boolean);
        return keys.some(function (k) { return k === f || (PURPOSE_ALIAS[k] || []).indexOf(f) !== -1 || (f.slice(-1) === '.' && k.indexOf(f) === 0); });
    }
    // The call that drafted a row: serves the row's feature, succeeded, at or before
    // the row's aiAt (5 s tolerance), latest such.
    function matchCall(row) {
        var log = _log() || []; if (!row || !row.aiFeature) return null;
        var f = String(row.aiFeature), t = Date.parse(row.aiAt || '') || Infinity;
        for (var i = log.length - 1; i >= 0; i--) {
            var e = log[i];
            if (e.outcome !== 'ok' || !_callServes(e, f)) continue;
            if ((Date.parse(e.at) || 0) <= t + 5000) return e.id;
        }
        return null;
    }

    // ---- 2. per-artifact original + edits ---------------------------------------------------
    // Fields that are not the artifact's content: provenance, ids, flags and anything
    // the app computes by itself (it must never show up as an "engineer edit").
    var _SKIP = /^(ai[A-Z].*|internalId|humanEdited|humanEditedAt|_.*|.*(At|Cache|Computed|Derived|Stale)|updated.*|lastModified|rev|revision|seq)$/;
    // A fault tree's content is its structure (not the numbers the engine recomputes).
    function _treeShape(n) {
        if (!n || typeof n !== 'object') return '';
        return [n.id, n.type, n.gateType || '', n.name || '', n.displayId || ''].join('|') + '(' + (n.children || n._children || []).map(_treeShape).join(',') + ')';
    }
    function fields(row) {
        var out = {};
        if (row && row.root && typeof row.root === 'object') out.treeStructure = _fnv(_treeShape(row.root));
        Object.keys(row || {}).sort().forEach(function (k) {
            if (_SKIP.test(k)) return;
            var v = row[k];
            if (typeof v === 'string') out[k] = v.trim().slice(0, FIELD_CAP);
            else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
            else if (Array.isArray(v) && v.every(function (x) { return typeof x === 'string' || typeof x === 'number'; })) out[k] = v.join(', ').slice(0, FIELD_CAP);
        });
        return out;
    }
    function _hash(f) { return _fnv(JSON.stringify(f)); }
    // What the row looked like after the last recorded edit.
    function replay(row) {
        var cur = Object.assign({}, (row && row.aiOriginal) || {});
        ((row && row.aiEdits) || []).forEach(function (ed) { (ed.diff || []).forEach(function (d) { if (d.to === null) delete cur[d.field]; else cur[d.field] = d.to; }); });
        return cur;
    }
    // Inspect one AI row; returns 'new' | 'edit' | null (unchanged / not AI).
    // opts.local: the change was made in THIS session (signed with this user);
    // otherwise it arrived by sync or a load, and is recorded without a name.
    function observe(row, opts) {
        opts = opts || {};
        if (!row || row.aiGenerated !== true) return null;
        var f = fields(row), h = _hash(f);
        if (!row.aiOriginal) {
            // First sight. A row stamped before this module existed (no call can be
            // matched and it is older than the log) is marked as such, not treated
            // as a fresh original.
            // A row with no matching logged call was drafted before the audit trail
            // existed: what we keep is its text WHEN FIRST SEEN, labelled as such.
            row.aiCallId = matchCall(row);
            if (!row.aiCallId) { row.aiPreAudit = true; row.aiFirstSeen = _nowIso(); }
            row.aiOriginal = f; row.aiSeen = h;
            return 'new';
        }
        if (row.aiSeen === h) return null;
        var last = replay(row), diff = [];
        var keys = {}; Object.keys(last).forEach(function (k) { keys[k] = 1; }); Object.keys(f).forEach(function (k) { keys[k] = 1; });
        Object.keys(keys).sort().forEach(function (k) {
            var a = (k in last) ? last[k] : null, b = (k in f) ? f[k] : null;
            if (a !== b) diff.push({ field: k, from: a, to: b });
        });
        row.aiSeen = h;
        if (!diff.length) return null;
        if (!Array.isArray(row.aiEdits)) row.aiEdits = [];
        row.aiEdits.push(opts.local ? { at: _nowIso(), by: _me(), via: 'edit', diff: diff } : { at: _nowIso(), by: '', via: 'sync or load', diff: diff });
        return 'edit';
    }

    // Every AI row in the project, with where it lives.
    function aiRows() {
        var out = [];
        var add = function (arr, where) { (Array.isArray(arr) ? arr : []).forEach(function (r) { if (r && r.aiGenerated === true) out.push({ row: r, where: where }); }); };
        var g = function (name) { try { return root[name]; } catch (_) { return null; } };
        try { add(typeof acFunctionsData !== 'undefined' ? acFunctionsData : null, 'AC functions'); } catch (_) {}
        try { add(typeof acFcimData !== 'undefined' ? acFcimData : null, 'AC FCIM'); } catch (_) {}
        try { add(typeof acFhaData !== 'undefined' ? acFhaData : null, 'AFHA'); } catch (_) {}
        try { add(typeof acReqData !== 'undefined' ? acReqData : null, 'AC requirements'); } catch (_) {}
        try { add(typeof acAssumptionsData !== 'undefined' ? acAssumptionsData : null, 'AC assumptions'); } catch (_) {}
        try { add(typeof praData !== 'undefined' ? praData : null, 'PRA'); } catch (_) {}
        try { add(typeof zsaData !== 'undefined' ? zsaData : null, 'ZSA'); } catch (_) {}
        try { add(typeof cmaData !== 'undefined' ? cmaData : null, 'CMA'); } catch (_) {}
        try { add(typeof fmeaData !== 'undefined' ? fmeaData : null, 'FMEA'); } catch (_) {}
        try { add(typeof resourcesData !== 'undefined' ? resourcesData : null, 'Resources'); } catch (_) {}
        try { add(typeof ftaPages !== 'undefined' ? ftaPages : null, 'Fault trees'); } catch (_) {}
        try {
            (typeof systemsData !== 'undefined' && Array.isArray(systemsData) ? systemsData : []).forEach(function (s) {
                var n = s && (s.name || s.id);
                ['functions', 'fcim', 'fha', 'req', 'asm'].forEach(function (k) { add(s && s[k], n + ' · ' + k); });
            });
        } catch (_) {}
        try { var HA = g('HF_ANALYSES'); if (HA && typeof HA.aiRows === 'function') HA.aiRows().forEach(function (e) { if (e && e.row && e.row.aiGenerated === true) out.push({ row: e.row, where: 'HF · ' + e.lane }); }); } catch (_) {}
        return out;
    }
    // One pass over every AI row. Returns counts; saves when anything changed.
    var _inSweep = false;
    function sweep(opts) {
        var n = { rows: 0, fresh: 0, edited: 0 };
        if (_inSweep) return n;
        _inSweep = true;
        try {
            aiRows().forEach(function (x) { n.rows++; var r = observe(x.row, opts); if (r === 'new') n.fresh++; else if (r === 'edit') n.edited++; });
            if ((n.fresh || n.edited) && typeof root.scheduleAutosave === 'function') { try { root.scheduleAutosave(); } catch (_) {} }
        } finally { _inSweep = false; }
        return n;
    }

    // ---- decisions on drafts (over-reliance measure) -------------------------------------------
    // projectConfig.aiDecisions[panel] = { label, accepted, edited, dismissed, bulkAccepted, bulkDismissed }
    // counted in the review panels (ai_assistant.js _makeReviewPanel). 'edited' = changed in the
    // panel before accepting. Bulk = "Accept all" / "Dismiss all".
    function noteDecision(panel, act, bulk, n, label) {
        try {
            var pc = _pc(); if (!pc) return;
            if (!pc.aiDecisions || typeof pc.aiDecisions !== 'object') pc.aiDecisions = {};
            var k = String(panel || 'unknown');
            var d = pc.aiDecisions[k] || (pc.aiDecisions[k] = { label: '', accepted: 0, edited: 0, dismissed: 0, bulkAccepted: 0, bulkDismissed: 0 });
            if (label) d.label = String(label).replace(/^[^A-Za-z0-9]+/, '').slice(0, 80);
            n = Math.max(1, n | 0);
            if (act === 'accept') { d.accepted += n; if (bulk) d.bulkAccepted += n; }
            else if (act === 'edit') d.edited += n;
            else if (act === 'dismiss') { d.dismissed += n; if (bulk) d.bulkDismissed += n; }
        } catch (_) {}
    }
    // How much the engineers lean on the AI: at the panel (changed or rejected before
    // accepting; accepted in bulk) and after it (accepted items edited later; accepted items
    // never reviewed at all). Rates are null when there is nothing to divide.
    function reliance() {
        var pc = _pc() || {}, dec = pc.aiDecisions || {};
        var panels = Object.keys(dec).map(function (k) {
            var d = dec[k], shown = d.accepted + d.edited + d.dismissed;
            return { panel: k, label: d.label || k, shown: shown, accepted: d.accepted, edited: d.edited, dismissed: d.dismissed,
                bulkAccepted: d.bulkAccepted, overrideRate: shown ? (d.edited + d.dismissed) / shown : null };
        });
        var t = panels.reduce(function (a, p) { a.shown += p.shown; a.changed += p.edited + p.dismissed; a.bulk += p.bulkAccepted; a.accepted += p.accepted + p.edited; return a; }, { shown: 0, changed: 0, bulk: 0, accepted: 0 });
        var rows = aiRows().map(function (x) { return x.row; });
        var editedAfter = rows.filter(function (r) { return (r.aiEdits || []).length > 0 || r.humanEdited === true; }).length;
        var unreviewed = rows.filter(function (r) {
            try { if (root.AiBadges && typeof root.AiBadges.confidence === 'function') { var c = root.AiBadges.confidence(r); if (c && typeof c.reviewed === 'boolean') return !c.reviewed; } } catch (_) {}
            return r.humanEdited !== true;
        }).length;
        return {
            panels: panels,
            drafted: t.shown, changedOrRejected: t.changed, overrideRate: t.shown ? t.changed / t.shown : null,
            bulkAccepted: t.bulk, bulkShare: t.accepted ? t.bulk / t.accepted : null,
            aiItems: rows.length, editedAfterAccept: editedAfter, neverReviewed: unreviewed
        };
    }
    function relianceLine() {
        var r = reliance(), pct = function (x) { return x == null ? '—' : Math.round(x * 100) + '%'; };
        if (!r.drafted && !r.aiItems) return 'No AI drafts decided in this project yet.';
        return 'Engineers changed or rejected ' + pct(r.overrideRate) + ' of ' + r.drafted + ' AI-drafted item(s) at review · ' +
            pct(r.bulkShare) + ' of accepted items came in by "Accept all" · ' + r.editedAfterAccept + ' of ' + r.aiItems + ' AI item(s) edited after acceptance · ' +
            r.neverReviewed + ' never reviewed (these block the hand-off gate).';
    }

    // ---- reporting ----------------------------------------------------------------------------
    function summary(row) {
        if (!row || row.aiGenerated !== true) return null;
        var c = row.aiCallId ? call(row.aiCallId) : null;
        return {
            callId: row.aiCallId || null, model: (c && c.model) || row.aiModel || null,
            prompt: (c && c.skill) || row.aiSkill || null, input: c ? (c.inputHash + ' · ' + c.inputChars + ' chars') : null,
            draftedAt: row.aiAt || (c && c.at) || null, edits: (row.aiEdits || []).length,
            lastEdit: (row.aiEdits && row.aiEdits.length) ? row.aiEdits[row.aiEdits.length - 1] : null,
            unchanged: !!row.aiOriginal && _hash(fields(row)) === _hash(row.aiOriginal),
            preAudit: !!row.aiPreAudit || !row.aiOriginal, firstSeen: row.aiFirstSeen || null
        };
    }
    function _e(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function cardLine(row) {
        var s = summary(row); if (!s) return '';
        if (s.preAudit) return '<div class="aifh-meta" style="font-size:11px;">Drafted before the audit trail: no call record; text kept as first seen' + (row.aiFirstSeen ? ' on ' + _e(String(row.aiFirstSeen).slice(0, 10)) : '') + (s.edits ? ' · ' + s.edits + ' edit(s) recorded since' : '') + '</div>';
        return '<div class="aifh-meta" style="font-size:11px;">' +
            (s.callId ? _e(s.callId) : 'call not matched') + ' · prompt ' + _e(s.prompt || 'unrecorded') + (s.input ? ' · input ' + _e(s.input) : '') +
            ' · ' + (s.edits ? s.edits + ' engineer edit(s)' + (s.lastEdit ? (s.lastEdit.by ? ', last by ' + _e(s.lastEdit.by) : ', last via ' + _e(s.lastEdit.via || 'sync or load')) : '') : (s.unchanged ? 'unchanged since drafted' : 'no edits recorded')) + '</div>';
    }
    function csv() {
        var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
        var head = ['Where', 'Artifact', 'Feature', 'AI call', 'Model', 'Prompt version', 'Input fingerprint', 'Drafted at', 'Engineer edits', 'Last edit by', 'Original (as drafted)', 'Current'];
        var lines = [head.map(q).join(',')];
        aiRows().forEach(function (x) {
            var r = x.row, s = summary(r) || {};
            var label = r.fcId || r.subId || r.funcId || r.praId || r.zoneId || r.cmaId || r.resId || r.traceId || r.asmId || r.name || r.id || r.internalId || '';
            var flat = function (o) { return Object.keys(o || {}).map(function (k) { return k + '=' + o[k]; }).join(' | '); };
            lines.push([x.where, label, r.aiFeature, s.callId, s.model, s.prompt, s.input, s.draftedAt, s.edits, s.lastEdit ? s.lastEdit.by : '',
                s.preAudit ? '(drafted before the audit trail; as first seen' + (s.firstSeen ? ' ' + String(s.firstSeen).slice(0, 10) : '') + ') ' + flat(r.aiOriginal) : flat(r.aiOriginal), flat(fields(r))].map(q).join(','));
        });
        return lines.join('\n');
    }
    function callsCsv() {
        var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
        var head = ['AI call', 'Feature', 'Purpose', 'Model', 'Prompt version', 'At', 'Input fingerprint', 'Input chars', 'Output fingerprint', 'Output chars', 'Outcome', 'Raw output kept'];
        return [head.map(q).join(',')].concat((_log() || []).map(function (e) {
            return [e.id, e.feature, e.purpose, e.model, e.skill, e.at, e.inputHash, e.inputChars, e.outputHash, e.outputChars, e.outcome, e.output != null ? 'yes' : 'fingerprint only'].map(q).join(',');
        })).join('\n');
    }

    // ---- when to sweep -------------------------------------------------------------------------
    // LOCAL edits: every edit reaches scheduleAutosave. A wrapper queues a local sweep at 0 ms —
    // after the edit, before sync pushes it (~350 ms) — so the edit is recorded here, signed by
    // this user, and travels with the row. Nothing is added to the edit's own synchronous path.
    // SYNC / LOAD: a 3 s timer (on data-change generation) catches what arrived from elsewhere;
    // anything it finds unrecorded is logged without a name ('sync or load').
    var _lastGen = -1, _timer = null, _pendingLocal = null, _hooked = false;
    function _gen() { var dc = root.SLDataChange; return dc && typeof dc.gen === 'function' ? dc.gen() : null; }
    function _hookSave() {
        if (_hooked || typeof root.scheduleAutosave !== 'function') return;
        _hooked = true;
        var orig = root.scheduleAutosave;
        var wrapped = function () {
            if (!_inSweep && !_pendingLocal && typeof setTimeout === 'function') {
                _pendingLocal = setTimeout(function () { _pendingLocal = null; try { sweep({ local: true }); _lastGen = _gen(); } catch (_) {} }, 0);
            }
            return orig.apply(this, arguments);
        };
        Object.keys(orig).forEach(function (k) { try { if (!(k in wrapped)) wrapped[k] = orig[k]; } catch (_) {} });
        wrapped._aiAuditWrapped = true;
        root.scheduleAutosave = wrapped;
    }
    function tick() {
        try {
            _hookSave();
            var g = _gen();
            if (g !== null && g === _lastGen) return null;
            var r = sweep({ local: false });
            _lastGen = _gen();   // read AFTER, so our own save does not re-trigger
            return r;
        } catch (_) { return null; }
    }
    try { if (typeof setInterval === 'function' && root.document && !root.SL_AI_AUDIT_OFF) { _timer = setInterval(tick, 3000); setTimeout(_hookSave, 0); } } catch (_) {}

    var api = { KEEP_TEXT: KEEP_TEXT, MAX_LOG: MAX_LOG, recordCall: recordCall, call: call, matchCall: matchCall,
        fields: fields, replay: replay, observe: observe, aiRows: aiRows, sweep: sweep, tick: tick, hookSave: _hookSave,
        summary: summary, cardLine: cardLine, csv: csv, callsCsv: callsCsv, fingerprint: _fnv,
        noteDecision: noteDecision, reliance: reliance, relianceLine: relianceLine };
    try { root.SLAiAudit = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
