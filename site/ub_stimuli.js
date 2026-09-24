// ============================================================================
// ub_stimuli.js — v1.0 — Looking for unintended behavior at integration
// (23 Sep 2026, standards gap G6; SAE ARP4754B §4.6.4).
//
// WHAT THIS IS (our words): testing that the integrated systems do what the
// requirements say is not enough; the project also needs a plan for finding
// behavior nobody asked for. That plan is a stated strategy plus a list of
// stimuli (inputs and conditions the integrated aircraft or system is put
// through), each with what should happen, what was seen, and whether anything
// unintended turned up. The standard's own text is authoritative.
//
// THE PIECES HERE:
//   1. a STRATEGY — how the project looks for unintended behavior, why that is
//      enough, and who owns it;
//   2. STIMULI (STIM-n) — kind (abnormal input, failure injection, boundary or
//      timing, mode transition, combined failures), target (the aircraft or a
//      system), the stimulus, and the pass criteria;
//      SUGGESTIONS are read from the project's own model — basic events in the
//      fault trees of Catastrophic / Hazardous failure conditions (failure
//      injection), flight phase changes (mode transition) and FCIM functions
//      (combined failures) — and nothing is added until the engineer accepts it;
//   3. RESULTS — run date, what was observed, unintended behavior none / found,
//      the evidence, and a problem report when something was found;
//   4. the results join the VERIFICATION MATRIX in every report.
// Store: projectConfig.ubStrategy = { approach, rationale, owner };
//   projectConfig.ubStimuli = [{ id 'STIM-1', kind, target, text, expected,
//   source, status 'planned'|'run', runDate, observed, unintended
//   'open'|'none'|'found', evidence, prRef }]; projectConfig.ubCounter;
//   projectConfig.ubDismissed = [source keys the engineer turned down].
// INV-56 (advisory, read-only) lists what is missing.
// See tests/regression_ub_stimuli.test.js.
// ============================================================================
(function (root) {
    'use strict';

    var KINDS = [
        { v: 'abnormal-input', label: 'Abnormal input' },
        { v: 'failure-injection', label: 'Failure injection' },
        { v: 'boundary-timing', label: 'Boundary or timing' },
        { v: 'mode-transition', label: 'Mode transition' },
        { v: 'combined', label: 'Combined failures' }
    ];
    var RESULT = [{ v: 'open', label: 'Not assessed' }, { v: 'none', label: 'None seen' }, { v: 'found', label: 'Unintended behavior found' }];
    var SEVERE = { 'Catastrophic': 1, 'Hazardous': 1 };
    var MAX_SUGGEST = 60;

    function _pc() { try { return (typeof projectConfig !== 'undefined' && projectConfig) ? projectConfig : (root.projectConfig || null); } catch (_) { return root.projectConfig || null; } }
    // Page globals are lexical (let) bindings, not window properties: read each one by name.
    function _arr(name) {
        var v;
        try {
            if (name === 'acFhaData') v = (typeof acFhaData !== 'undefined') ? acFhaData : undefined;
            else if (name === 'acFcimData') v = (typeof acFcimData !== 'undefined') ? acFcimData : undefined;
            else if (name === 'systemsData') v = (typeof systemsData !== 'undefined') ? systemsData : undefined;
            else if (name === 'ftaPages') v = (typeof ftaPages !== 'undefined') ? ftaPages : undefined;
            else if (name === 'flightPhasesData') v = (typeof flightPhasesData !== 'undefined') ? flightPhasesData : undefined;
        } catch (_) {}
        if (Array.isArray(v)) return v;
        return Array.isArray(root[name]) ? root[name] : [];
    }
    function _defaultStrategy() { return { approach: '', rationale: '', owner: '' }; }
    function strategy() { var pc = _pc(); if (!pc) return {}; if (!pc.ubStrategy || typeof pc.ubStrategy !== 'object') pc.ubStrategy = _defaultStrategy(); return pc.ubStrategy; }
    function store() { var pc = _pc(); if (!pc) return []; if (!Array.isArray(pc.ubStimuli)) pc.ubStimuli = []; return pc.ubStimuli; }
    function _dismissed() { var pc = _pc(); if (!pc) return []; if (!Array.isArray(pc.ubDismissed)) pc.ubDismissed = []; return pc.ubDismissed; }
    // Read-only views for the checks and reports: they must never write to the project.
    function _peekStrategy() { var pc = _pc(); return (pc && pc.ubStrategy && typeof pc.ubStrategy === 'object') ? pc.ubStrategy : _defaultStrategy(); }
    function _peekStore() { var pc = _pc(); return (pc && Array.isArray(pc.ubStimuli)) ? pc.ubStimuli : []; }
    function _peekDismissed() { var pc = _pc(); return (pc && Array.isArray(pc.ubDismissed)) ? pc.ubDismissed : []; }
    function get(id) { return _peekStore().find(function (s) { return s.id === id; }) || null; }
    function kindLabel(k) { return (KINDS.find(function (x) { return x.v === k; }) || {}).label || k || ''; }
    function targetName(t) {
        if (!t || t === 'aircraft') return 'Aircraft';
        var s = _arr('systemsData').find(function (x) { return x && String(x.id) === String(t); });
        return s ? (s.name || String(s.id)) : String(t);
    }
    function _prs() { var pc = _pc(); return (pc && Array.isArray(pc.problemReports)) ? pc.problemReports : []; }

    // ---- suggestions from the model -------------------------------------------------------------
    function _allFcs() {
        var out = _arr('acFhaData').map(function (f) { return { f: f, target: 'aircraft' }; });
        _arr('systemsData').forEach(function (s) { if (s && Array.isArray(s.fha)) s.fha.forEach(function (f) { out.push({ f: f, target: s.id }); }); });
        return out.filter(function (x) { return x.f; });
    }
    function suggestions() {
        var out = [], seen = {}, taken = {};
        _peekStore().forEach(function (s) { if (s.source) taken[s.source] = 1; });
        _peekDismissed().forEach(function (k) { taken[k] = 1; });
        function add(s) { if (!taken[s.source] && !seen[s.source]) { seen[s.source] = 1; out.push(s); } }
        // 1. failure injection: basic events under trees for Catastrophic / Hazardous FCs
        var fcs = _allFcs();
        _arr('ftaPages').forEach(function (p) {
            if (!p || !p.root) return;
            var ids = [].concat(p.linkedFhaIds || [], p.linkedFhaId != null && p.linkedFhaId !== '' ? [p.linkedFhaId] : []).map(String);
            var hit = fcs.find(function (x) { return ids.indexOf(String(x.f.internalId)) >= 0 && SEVERE[x.f.severity]; });
            if (!hit) return;
            (function walk(n) {
                if (!n) return;
                if (n.type === 'basic' && n.name) {
                    var key = 'fta:' + (n.logicalId || n.id || n.name);
                    add({ source: key, kind: 'failure-injection', target: hit.target,
                        text: 'Inject "' + n.name + '" on the integrated ' + (hit.target === 'aircraft' ? 'aircraft' : 'system') + ', alone and in each flight phase where it matters',
                        expected: 'Only the effects the analysis of ' + (hit.f.fcId || 'the failure condition') + ' predicts; no other function degrades, no misleading indication' });
                }
                (n.children || n._children || []).forEach(walk);
            })(p.root);
        });
        // 2. mode transitions: consecutive flight phases
        var ph = _arr('flightPhasesData').map(function (x) { return x && x.phase; }).filter(Boolean);
        for (var i = 0; i + 1 < ph.length; i++) {
            add({ source: 'phase:' + ph[i] + '>' + ph[i + 1], kind: 'mode-transition', target: 'aircraft',
                text: 'Transition ' + ph[i] + ' → ' + ph[i + 1] + ' with systems in normal and degraded modes, including an interrupted or repeated transition',
                expected: 'Every system follows the transition; no mode is left latched, no alert is lost or spurious' });
        }
        // 3. combined failures: each FCIM function
        var subs = {};
        _arr('acFcimData').forEach(function (r) { if (r && r.subId && !subs[r.subId]) subs[r.subId] = r; });
        Object.keys(subs).forEach(function (sub) {
            var r = subs[sub];
            add({ source: 'fcim:' + sub, kind: 'combined', target: 'aircraft',
                text: 'Fail ' + sub + (r.tlDesc ? ' ("' + r.tlDesc + '")' : '') + ' together with the other failures it is paired with in the FCIM, with the crew aware and unaware',
                expected: 'Combined effects no worse than the FCIM classification' });
        });
        return out.slice(0, MAX_SUGGEST);
    }

    // ---- recording ------------------------------------------------------------------------------
    function _nextId() { var pc = _pc(); pc.ubCounter = (pc.ubCounter || 0) + 1; return 'STIM-' + pc.ubCounter; }
    function add(fields) {
        if (!_pc()) return null;
        var f = fields || {};
        var s = { id: _nextId(), kind: f.kind || '', target: f.target || 'aircraft', text: String(f.text || '').trim(), expected: String(f.expected || '').trim(),
            source: f.source || 'manual', status: 'planned', runDate: '', observed: '', unintended: 'open', evidence: '', prRef: '' };
        store().push(s);
        return s;
    }
    function accept(sug) { return sug ? add(sug) : null; }
    function dismiss(sug) { if (!sug || !sug.source) return false; var d = _dismissed(); if (d.indexOf(sug.source) < 0) d.push(sug.source); return true; }

    // ---- findings (INV-56) ----------------------------------------------------------------------
    function findings() {
        var out = [], st = _peekStrategy(), list = _peekStore();
        var hasWork = _arr('systemsData').length > 0 || _arr('acFhaData').length > 0;
        if (!hasWork && !list.length) return out;
        if (!String(st.approach || '').trim()) out.push({ kind: 'no-strategy', text: 'No strategy recorded for finding unintended behavior at integration' });
        else if (!String(st.rationale || '').trim()) out.push({ kind: 'no-rationale', text: 'The unintended-behavior strategy does not say why it is enough' });
        if (!list.length) out.push({ kind: 'no-stimuli', text: 'No integration stimuli listed' });
        var sug = suggestions().length;
        if (sug) out.push({ kind: 'suggestions', text: sug + ' suggested stimul' + (sug === 1 ? 'us' : 'i') + ' from the model not yet accepted or turned down' });
        list.forEach(function (s) {
            var tag = s.id + ' (' + targetName(s.target) + ')';
            if (!s.kind) out.push({ kind: 'no-kind', s: s, text: tag + ': no stimulus kind' });
            if (!String(s.text || '').trim()) out.push({ kind: 'no-text', s: s, text: tag + ': no stimulus described' });
            if (!String(s.expected || '').trim()) out.push({ kind: 'no-expected', s: s, text: tag + ': no pass criteria (what should and should not happen)' });
            if (s.status !== 'run') { out.push({ kind: 'not-run', s: s, text: tag + ': planned, not yet run' }); return; }
            if (!s.runDate) out.push({ kind: 'no-date', s: s, text: tag + ': run with no date' });
            if (!String(s.observed || '').trim()) out.push({ kind: 'no-observed', s: s, text: tag + ': run with nothing recorded as observed' });
            if (!String(s.evidence || '').trim()) out.push({ kind: 'no-evidence', s: s, text: tag + ': run with no evidence reference' });
            if (s.unintended !== 'none' && s.unintended !== 'found') out.push({ kind: 'not-assessed', s: s, text: tag + ': run, but not assessed for unintended behavior' });
            if (s.unintended === 'found' && !String(s.prRef || '').trim()) out.push({ kind: 'found-no-pr', s: s, text: tag + ': unintended behavior found with no problem report' });
            if (s.prRef && !_prs().some(function (p) { return p.id === s.prRef; })) out.push({ kind: 'pr-dangling', s: s, text: tag + ': problem report ' + s.prRef + ' does not exist' });
        });
        return out;
    }
    function summary() {
        var list = _peekStore();
        return {
            strategy: !!String(_peekStrategy().approach || '').trim(),
            stimuli: list.length,
            run: list.filter(function (s) { return s.status === 'run'; }).length,
            found: list.filter(function (s) { return s.status === 'run' && s.unintended === 'found'; }).length,
            problems: findings().length
        };
    }
    var INV = {
        id: 'INV-56', sev: 'advisory',
        name: 'Integration testing looks for unintended behavior: a stated strategy, a list of stimuli with pass criteria, and each result recorded with evidence (ARP4754B §4.6.4)',
        run: function () { var f = findings(); return { checked: _peekStore().length, fails: f.slice(0, 20).map(function (x) { return x.text; }), failCount: f.length }; }
    };
    (function reg(tries) {
        if (typeof root.invRegister === 'function') { try { root.invRegister(INV); } catch (_) {} return; }
        if (tries > 0 && typeof setTimeout === 'function') setTimeout(function () { reg(tries - 1); }, 50);
    })(40);

    // ---- the verification matrix rows (reports) -------------------------------------------------
    // Same columns as the requirement rows, so every report that carries the matrix carries these.
    function verificationRows(sysId) {
        return _peekStore().filter(function (s) { return sysId == null || String(s.target) === String(sysId); }).map(function (s) {
            var concl;
            if (s.status !== 'run') concl = 'Pending (planned)';
            else if (s.unintended === 'none') concl = 'Pass: no unintended behavior seen' + (s.runDate ? ' (' + s.runDate + ')' : '');
            else if (s.unintended === 'found') concl = 'Unintended behavior found' + (s.prRef ? ': ' + s.prRef : ': no problem report yet') + (s.observed ? ' (' + s.observed + ')' : '');
            else concl = 'Run, not yet assessed';
            return {
                'Requirement': 'Integration stimulus ' + s.id + ' — ' + (s.text || '') + (s.expected ? ' [pass criteria: ' + s.expected + ']' : ''),
                'Associated function': targetName(s.target),
                'Verification method(s) applied': 'Test: integration, looking for unintended behavior (' + kindLabel(s.kind) + ')',
                'Verification procedure & results reference(s)': s.evidence || '',
                'Verification conclusion (pass/fail, coverage)': concl
            };
        });
    }

    // ---- export ---------------------------------------------------------------------------------
    function exportCsv() {
        var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
        var st = _peekStrategy();
        var rows = [
            [q('Strategy'), q(st.approach), q('Why it is enough'), q(st.rationale), q('Owner'), q(st.owner)].join(','),
            ['Stimulus', 'Kind', 'Target', 'Stimulus', 'Pass criteria', 'Source', 'Status', 'Run date', 'Observed', 'Unintended behavior', 'Evidence', 'Problem report'].map(q).join(',')
        ];
        _peekStore().forEach(function (s) { rows.push([s.id, kindLabel(s.kind), targetName(s.target), s.text, s.expected, s.source, s.status, s.runDate, s.observed, s.unintended, s.evidence, s.prRef].map(q).join(',')); });
        return rows.join('\n');
    }
    function download() {
        try {
            var name = ((typeof projectName !== 'undefined' && projectName) || 'project').replace(/[^\w-]+/g, '_');
            var blob = new Blob(['﻿' + exportCsv()], { type: 'text/csv;charset=utf-8' });
            var el = root.document.createElement('a');
            el.href = URL.createObjectURL(blob); el.download = name + '_integration_stimuli.csv';
            root.document.body.appendChild(el); el.click();
            setTimeout(function () { URL.revokeObjectURL(el.href); el.remove(); }, 800);
        } catch (e) { try { root.slAlert && root.slAlert('Export failed: ' + e.message, { title: 'Integration stimuli' }); } catch (_) {} }
    }

    // ---- editor (a draft copy: Cancel changes nothing) ------------------------------------------
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function _opts(list, sel, ph) { return (ph ? '<option value="">' + _esc(ph) + '</option>' : '') + list.map(function (o) { return '<option value="' + _esc(o.v) + '"' + (String(o.v) === String(sel) ? ' selected' : '') + '>' + _esc(o.label) + '</option>'; }).join(''); }
    function _targets() { return [{ v: 'aircraft', label: 'Aircraft' }].concat(_arr('systemsData').filter(Boolean).map(function (s) { return { v: String(s.id), label: s.name || String(s.id) }; })); }
    var _draft = null;
    function _card(s) {
        var inp = function (f, ph, type) { return '<input type="' + (type || 'text') + '" data-f="' + f + '" value="' + _esc(s[f] || '') + '" placeholder="' + _esc(ph || '') + '" style="width:100%;">'; };
        return '<div class="ubs-card" data-id="' + _esc(s.id) + '" style="border:1px solid var(--color-border-hair);border-radius:8px;padding:10px 12px;margin-bottom:10px;">' +
            '<div style="display:flex;gap:8px;align-items:center;"><b>' + _esc(s.id) + '</b><span style="font-size:11px;color:var(--color-text-tertiary);">' + _esc(s.source) + '</span></div>' +
            '<div class="grid-3-col" style="gap:8px;margin-top:6px;">' +
            '<div><label>Kind</label><select data-f="kind" style="width:100%;">' + _opts(KINDS, s.kind, 'Choose…') + '</select></div>' +
            '<div><label>Target</label><select data-f="target" style="width:100%;">' + _opts(_targets(), s.target) + '</select></div>' +
            '<div><label>Status</label><select data-f="status" style="width:100%;">' + _opts([{ v: 'planned', label: 'Planned' }, { v: 'run', label: 'Run' }], s.status) + '</select></div>' +
            '<div style="grid-column:span 3;"><label>Stimulus</label>' + inp('text', 'What the integrated aircraft or system is put through') + '</div>' +
            '<div style="grid-column:span 3;"><label>Pass criteria</label>' + inp('expected', 'What should happen, and what must not') + '</div>' +
            '<div><label>Run date</label>' + inp('runDate', '', 'date') + '</div>' +
            '<div><label>Unintended behavior</label><select data-f="unintended" style="width:100%;">' + _opts(RESULT, s.unintended) + '</select></div>' +
            '<div><label>Problem report</label>' + inp('prRef', 'e.g. PR-004') + '</div>' +
            '<div style="grid-column:span 2;"><label>Observed</label>' + inp('observed', 'What actually happened') + '</div>' +
            '<div><label>Evidence</label>' + inp('evidence', 'Test report / rig log ref') + '</div></div></div>';
    }
    function modalHtml() {
        var st = strategy(), sug = suggestions();
        return '<div class="ckpt-modal" role="dialog" aria-modal="true" style="max-width:960px;">' +
            '<div class="ckpt-m-head"><span class="ckpt-designation">ARP4754B §4.6.4</span><span class="ckpt-m-name">Integration: looking for unintended behavior</span><button class="ckpt-m-close" onclick="SLStimuli.close()" aria-label="Close">×</button></div>' +
            '<div style="padding:14px 18px;max-height:70vh;overflow:auto;">' +
            '<p style="font-size:12px;color:var(--color-text-secondary);">Showing the systems meet their requirements does not show they do nothing else. Record how the project looks for behavior nobody asked for, the stimuli it uses, and what each one turned up. Results appear in the verification matrix of every report.</p>' +
            '<div class="ckpt-m-sec">Strategy</div>' +
            '<div class="grid-3-col ubs-strategy" style="gap:8px;">' +
            '<div style="grid-column:span 2;"><label>Approach</label><input type="text" data-p="approach" value="' + _esc(st.approach) + '" placeholder="e.g. rig and flight test with failure injection and mode sweeps" style="width:100%;"></div>' +
            '<div><label>Owner</label><input type="text" data-p="owner" value="' + _esc(st.owner) + '" style="width:100%;"></div>' +
            '<div style="grid-column:span 3;"><label>Why it is enough</label><input type="text" data-p="rationale" value="' + _esc(st.rationale) + '" placeholder="Coverage argument: which interfaces, modes and failures, and why" style="width:100%;"></div></div>' +
            '<div class="ckpt-m-sec" style="margin-top:12px;">Suggested from the model</div>' +
            (sug.length ? sug.map(function (x, i) {
                return '<div style="display:flex;gap:8px;align-items:center;font-size:12px;padding:4px 0;"><span style="min-width:120px;">' + _esc(kindLabel(x.kind)) + '</span><span>' + _esc(x.text) + '</span>' +
                    '<button type="button" class="ckpt-m-btn" style="margin-left:auto;font-size:11px;" onclick="SLStimuli._accept(' + i + ')">Add</button>' +
                    '<button type="button" class="ckpt-m-btn" style="font-size:11px;" onclick="SLStimuli._dismiss(' + i + ')">Not needed</button></div>';
            }).join('') : '<p style="font-size:12px;color:var(--color-text-tertiary);">No new suggestions.</p>') +
            '<div class="ckpt-m-sec" style="margin-top:12px;display:flex;align-items:center;">Stimuli<button type="button" class="btn-cyan" style="margin-left:auto;font-size:12px;" onclick="SLStimuli._addManual()">+ Add stimulus</button></div>' +
            (store().length ? store().map(_card).join('') : '<p style="font-size:12px;color:var(--color-text-tertiary);">None yet.</p>') +
            '</div><div class="ckpt-m-foot"><span class="ckpt-m-outputs">Gaps show in the invariant check (INV-56) and on the Appendix A matrix (A5-4).</span>' +
            '<span class="ckpt-m-actions"><button class="ckpt-m-btn" onclick="SLStimuli.close()">Cancel</button><button class="ckpt-m-btn ckpt-m-btn-primary" onclick="SLStimuli._save()">Save</button></span></div></div>';
    }
    function _withDraft(fn) {
        var pc = _pc(); var real = { s: pc.ubStimuli, st: pc.ubStrategy, c: pc.ubCounter, d: pc.ubDismissed };
        pc.ubStimuli = _draft.stimuli; pc.ubStrategy = _draft.strategy; pc.ubCounter = _draft.counter; pc.ubDismissed = _draft.dismissed;
        try { return fn(); } finally { _draft.counter = pc.ubCounter; pc.ubStimuli = real.s; pc.ubStrategy = real.st; pc.ubCounter = real.c; pc.ubDismissed = real.d; }
    }
    function open() {
        if (!root.document || !_pc()) return;
        close();
        var pc = _pc();
        _draft = {
            stimuli: JSON.parse(JSON.stringify(_peekStore())),
            strategy: JSON.parse(JSON.stringify(_peekStrategy())),
            dismissed: _peekDismissed().slice(),
            counter: pc.ubCounter || 0
        };
        var ov = root.document.createElement('div'); ov.id = 'ubs-overlay';
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;z-index:9000;';
        ov.innerHTML = _withDraft(modalHtml);
        root.document.body.appendChild(ov);
    }
    function close() { try { var o = root.document && root.document.getElementById('ubs-overlay'); if (o) o.remove(); } catch (_) {} _draft = null; }
    function _collect() {
        var ov = root.document && root.document.getElementById('ubs-overlay'); if (!ov || !_draft) return;
        Array.prototype.forEach.call(ov.querySelectorAll('.ubs-strategy [data-p]'), function (el) { _draft.strategy[el.getAttribute('data-p')] = String(el.value || '').trim(); });
        _draft.stimuli.forEach(function (s) {
            var box = ov.querySelector('.ubs-card[data-id="' + s.id + '"]'); if (!box) return;
            Array.prototype.forEach.call(box.querySelectorAll('[data-f]'), function (el) { s[el.getAttribute('data-f')] = String(el.value || '').trim(); });
        });
    }
    function _rerender() { var ov = root.document && root.document.getElementById('ubs-overlay'); if (ov && _draft) ov.innerHTML = _withDraft(modalHtml); }

    var api = {
        KINDS: KINDS, strategy: strategy, store: store, get: get, suggestions: suggestions, add: add, accept: accept, dismiss: dismiss,
        findings: findings, summary: summary, INV: INV, verificationRows: verificationRows, exportCsv: exportCsv, download: download,
        targetName: targetName, open: open, close: close, modalHtml: modalHtml,
        _accept: function (i) { if (!_draft) return; _collect(); _withDraft(function () { accept(suggestions()[i]); }); _rerender(); },
        _dismiss: function (i) { if (!_draft) return; _collect(); _withDraft(function () { dismiss(suggestions()[i]); }); _rerender(); },
        _addManual: function () { if (!_draft) return; _collect(); _withDraft(function () { add({}); }); _rerender(); },
        _save: function () {
            if (!_draft) return; _collect();
            var pc = _pc(); pc.ubStimuli = _draft.stimuli; pc.ubStrategy = _draft.strategy; pc.ubCounter = _draft.counter; pc.ubDismissed = _draft.dismissed;
            try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {}
            close();
        },
        _draftFor: function () { return _draft; }
    };
    try { root.SLStimuli = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
