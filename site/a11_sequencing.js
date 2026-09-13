// 13 Sep 2026 (R19 step 2): every fire-and-forget promise chain in this file now ends in .catch → SLErrorWatch.report(e, module), so a failure is recorded and told to the person instead of dying in the console.
// ============================================================================
// a11_sequencing.js — A11: agentic sequencing over the ARP4761A workflow.
//
// "Most agents must infer a plan — ours is defined by the standard, so
//  hard-code it and let the model do the steps." (A-series board, A11)
//
// ORCHESTRATION ONLY. This module adds ZERO write paths and ZERO new AI
// capabilities: every step invokes the SAME launcher lane (same run fn, same
// review panel, same accept gate, same provenance) the engineer could click
// by hand. The plan is DATA — the model never re-plans, reorders, or skips;
// only the deterministic state functions do.
//
// Doctrine: steps whose lanes are ADVISORY by ruling (req.recommend,
// comment dispositions, doc review, tree review, HF credit) carry no
// doneWhen and are NEVER auto-advanced — they are offered, the engineer
// decides. Auto-advance runs only store-verifiable drafting steps, and stops
// on: lane rejection/insufficiency, hard invariant failures, a dirty rename
// desk (stale upstream), or a step whose doneWhen does not flip (the
// engineer dismissed the panel — respect it).
// ============================================================================
(function () {
    'use strict';

    // Store access is by BARE IDENTIFIER, not window[name]: the app's stores are
    // top-level let/const declarations (global lexical scope, shared across
    // classic scripts) and do NOT appear on window. Caught live on HL-1 —
    // 46 FCIM rows read as "ready" because window.acFcimData was undefined.
    const _READ = {
        acFunctionsData: function () { try { return acFunctionsData; } catch (_) { return undefined; } },
        acFcimData:      function () { try { return acFcimData; } catch (_) { return undefined; } },
        acFhaData:       function () { try { return acFhaData; } catch (_) { return undefined; } },
        praData:         function () { try { return praData; } catch (_) { return undefined; } },
        zsaData:         function () { try { return zsaData; } catch (_) { return undefined; } },
        cmaData:         function () { try { return cmaData; } catch (_) { return undefined; } },
        fmeaData:        function () { try { return fmeaData; } catch (_) { return undefined; } },
        ftaPages:        function () { try { return ftaPages; } catch (_) { return undefined; } }
    };
    function _g(name) {
        try { if (_READ[name]) { const v = _READ[name](); if (v !== undefined) return v; } } catch (_) {}
        try { return window[name]; } catch (_) { return undefined; }
    }
    function _arr(name) { const v = _g(name); return Array.isArray(v) ? v : []; }
    function _ai() { return (typeof window !== 'undefined' && window.SafetyLabAI) || null; }

    // ---- plan scoping (Program Planning is the authority) -------------------
    // Unknown/unlisted lanes are treated as COMMITTED — the safe direction:
    // never hide a standard step because a catalogue id drifted.
    function _laneOn(laneId) {
        if (!laneId) return true;
        try {
            const PP = window.PROGRAM_PLAN;
            if (!PP || typeof PP.laneOn !== 'function' || !Array.isArray(PP.CATALOGUE)) return true;
            const known = PP.CATALOGUE.some(function (l) { return (l.id || l.key) === laneId; });
            if (!known) return true;
            return !!PP.laneOn(laneId);
        } catch (_) { return true; }
    }

    // ---- THE SEQUENCE — hard-coded from the standard, data not model output --
    // launcherLabel binds each step to its lane by the launcher's own label
    // (the single source of truth exposed via SafetyLabAI.launcherActions()).
    // doneWhen reads STORES, never flags. null doneWhen = advisory step.
    const SEQUENCE = [
        { id: 'functions', label: 'Functional decomposition', std: 'ARP4754B §4 / 4761A §A.2', launcherLabel: 'Decompose architecture → functions',
          doneWhen: function () { return _arr('acFunctionsData').length > 0; } },
        { id: 'fcim', label: 'FCIM — failure condition identification', std: 'ARP4761A §A.3 / Table A3', launcherLabel: 'Generate FCIM',
          doneWhen: function () { return _arr('acFcimData').length > 0; } },
        { id: 'afha', label: 'Aircraft FHA', std: 'ARP4761A §A.4 / Table A5', launcherLabel: 'Draft FHA',
          doneWhen: function () { return _arr('acFhaData').length > 0; } },
        { id: 'trees', label: 'Fault trees (PASA allocation)', std: 'ARP4761A App D / §5', launcherLabel: 'Synthesize fault trees',
          doneWhen: function () { const p = _g('ftaPages'); return Array.isArray(p) && p.some(function (x) { return x && x.root; }); } },
        { id: 'treeReview', label: 'Tree consistency review', std: 'advisory', launcherLabel: 'Review fault trees', doneWhen: null },
        { id: 'requirements', label: 'Requirement recommendations', std: 'ARP4754B §5.3.1 — advisory, comments only', launcherLabel: 'Recommend requirements', doneWhen: null },
        { id: 'pra', label: 'Particular Risk Analysis', std: 'ARP4761A App L', laneId: 'pra', launcherLabel: 'Particular Risk Analysis (PRA)',
          doneWhen: function () { return _arr('praData').length > 0; } },
        { id: 'zsa', label: 'Zonal Safety Analysis', std: 'ARP4761A App K', laneId: 'zsa', launcherLabel: 'Zonal Safety Analysis (ZSA)',
          doneWhen: function () { return _arr('zsaData').length > 0; } },
        { id: 'cma', label: 'Common Mode Analysis', std: 'ARP4761A App M', laneId: 'cma', launcherLabel: 'Common Mode Analysis (CMA)',
          doneWhen: function () { return _arr('cmaData').length > 0; } },
        { id: 'fmea', label: 'FMEA feeders', std: 'ARP4761A App F/G', laneId: 'fmea', launcherLabel: 'FMEA — by system',
          doneWhen: function () { return _arr('fmeaData').length > 0; } },
        { id: 'hf', label: 'Human-factors crew credit', std: 'advisory — assumption register', launcherLabel: 'Human Factors — register crew credit', doneWhen: null },
        { id: 'comments', label: 'Open-comment dispositions', std: 'advisory — replies only, you resolve', launcherLabel: 'Draft comment dispositions', doneWhen: null,
          appliesWhen: function () { try { const R = (typeof Review !== 'undefined') ? Review : window.Review; return !!(R && R.allOpen && R.allOpen().length > 0); } catch (_) { return false; } } },
        { id: 'docReview', label: 'Compliance-document review', std: 'advisory — findings as comments', launcherLabel: 'Review compliance document', doneWhen: null }
    ];

    // ---- state ---------------------------------------------------------------
    function _cfg() {
        const pc = (typeof projectConfig !== 'undefined' && projectConfig) || {};
        if (!pc.a11 || typeof pc.a11 !== 'object') { try { pc.a11 = {}; } catch (_) { return {}; } }
        return pc.a11;
    }

    function _renameDeskDirty() {
        try {
            if (typeof window.rgScan !== 'function') return false;
            const r = window.rgScan() || {};
            return ((r.renames || []).length + (r.deletions || []).length) > 0;
        } catch (_) { return false; }
    }
    function _hardInvariantFails() {
        try {
            if (typeof window.invRun !== 'function') return 0;
            const r = window.invRun() || {};
            return r.hardFails || 0;
        } catch (_) { return 0; }
    }

    // Per-step status — pure, store-driven, no memory of "having been run".
    function stateOf(step) {
        const applies = step.appliesWhen ? !!step.appliesWhen() : _laneOn(step.laneId);
        if (!applies) return step.appliesWhen ? 'not-applicable' : 'skipped-not-in-plan';
        if (!step.doneWhen) return 'advisory';
        return step.doneWhen() ? 'done' : 'ready';
    }

    function _findAction(label) {
        const ai = _ai();
        if (!ai || typeof ai.launcherActions !== 'function') return null;
        return (ai.launcherActions() || []).find(function (a) { return a && a.label === label; }) || null;
    }

    // ---- run + auto-advance --------------------------------------------------
    let _pollTimer = null, _running = null;
    function _stopPolling() { if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; } _running = null; }

    function _note(msg, kind) {
        try { const el = document.getElementById('a11-note'); if (el) { el.textContent = msg; el.dataset.kind = kind || 'info'; } } catch (_) {}
        try { if (typeof showToast === 'function') showToast(msg, kind === 'stop' ? 'warning' : 'info', 4500); } catch (_) {}
    }

    function runStep(step) {
        if (_renameDeskDirty()) { _note('Blocked: the rename desk has unresolved renames/deletions — resolve those before running lanes over stale references.', 'stop'); return Promise.resolve(false); }
        const action = _findAction(step.launcherLabel);
        if (!action) { _note('Lane "' + step.launcherLabel + '" is not available (AI module not loaded?).', 'stop'); return Promise.resolve(false); }
        _note('Running: ' + step.label + ' — the lane opens its own review panel; nothing lands without your Accept.');
        _running = step.id;
        return Promise.resolve().then(action.run).then(function () {
            _render();
            return true;
        }).catch(function (e) {
            _stopPolling();
            _note('Stopped at "' + step.label + '": ' + ((e && e.message) || e), 'stop');
            _render();
            return false;
        });
    }

    function _nextAutoStep() {
        // first non-advisory, applicable, not-done step, in standard order
        for (let i = 0; i < SEQUENCE.length; i++) {
            const st = stateOf(SEQUENCE[i]);
            if (st === 'ready') return SEQUENCE[i];
        }
        return null;
    }

    function _autoAdvance() {
        const step = _nextAutoStep();
        if (!step) { _stopPolling(); _note('Auto-advance: no drafting steps remaining — advisory steps are yours to run at will.', 'info'); _render(); return; }
        const hard = _hardInvariantFails();
        if (hard > 0) { _stopPolling(); _note('Auto-advance stopped: ' + hard + ' hard invariant failure(s) — resolve before drafting further downstream.', 'stop'); return; }
        runStep(step).then(function (ok) {
            if (!ok) return;
            // poll the STORE for the accept landing; the panel stays the source of truth
            let waited = 0;
            _stopPolling();
            _pollTimer = setInterval(function () {
                waited += 2500;
                if (!document.getElementById('a11-desk')) { _stopPolling(); return; }   // desk closed → stop
                if (step.doneWhen && step.doneWhen()) {
                    _stopPolling(); _render();
                    if (_cfg().auto) _autoAdvance();
                } else if (waited >= 180000) {
                    _stopPolling();
                    _note('Auto-advance paused at "' + step.label + '" — the step has not landed in the model (panel dismissed or still open). Your move.', 'stop');
                    _render();
                }
            }, 2500);
        }).catch(function (e) { if (window.SLErrorWatch) SLErrorWatch.report(e, 'a11_sequencing'); });
    }

    // ---- desk UI -------------------------------------------------------------
    const CHIP = {
        'done': ['DONE', '#0b8043'], 'ready': ['READY', '#0a58c2'], 'advisory': ['ADVISORY', '#8a6d00'],
        'skipped-not-in-plan': ['NOT IN PLAN', '#6b7280'], 'not-applicable': ['N/A', '#6b7280']
    };

    function _render() {
        const host = document.getElementById('a11-steps');
        if (!host) return;
        host.innerHTML = SEQUENCE.map(function (s) {
            const st = stateOf(s);
            const chip = CHIP[st] || [st, '#6b7280'];
            const runnable = (st === 'ready' || st === 'advisory');
            return '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid #e7eaf1;' + (_running === s.id ? 'background:#f2f6ff;' : '') + '">'
                + '<span style="font-size:10.5px;font-weight:800;letter-spacing:.04em;color:#fff;background:' + chip[1] + ';border-radius:999px;padding:2px 9px;flex:none;">' + chip[0] + '</span>'
                + '<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:600;">' + s.label + '</div>'
                + '<div style="font-size:11px;color:var(--color-text-primary);">' + s.std + '</div></div>'
                + (runnable ? '<button data-a11-run="' + s.id + '" style="font:inherit;font-size:12px;font-weight:600;border:1px solid var(--color-border-hair);background:#fff;border-radius:8px;padding:5px 12px;cursor:pointer;flex:none;">Run</button>' : '')
                + '</div>';
        }).join('');
    }

    function open() {
        if (document.getElementById('a11-desk')) { close(); return; }
        const dirty = _renameDeskDirty();
        const ov = document.createElement('div');
        ov.id = 'a11-desk';
        ov.style.cssText = 'position:fixed;inset:0;z-index:9400;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(6,8,12,.55);font-family:inherit;';
        ov.innerHTML = '<div style="background:#fff;color:#181b22;width:100%;max-width:640px;max-height:88vh;border-radius:14px;box-shadow:0 24px 64px rgba(0,0,0,.4);display:flex;flex-direction:column;overflow:hidden;">'
            + '<div style="padding:16px 20px 12px;border-bottom:1px solid #e7eaf1;display:flex;align-items:center;gap:12px;">'
            + '<div style="flex:1;"><div style="font-size:16px;font-weight:700;">Run the ARP4761A workflow</div>'
            + '<div style="font-size:11.5px;color:var(--color-text-primary);margin-top:2px;">The sequence is the standard’s, not the model’s. Every step lands in its own review panel — nothing enters the model without your Accept.</div></div>'
            + '<label style="display:flex;align-items:center;gap:6px;font-size:12px;flex:none;cursor:pointer;"><input type="checkbox" id="a11-auto"' + (_cfg().auto ? ' checked' : '') + '>Auto-advance</label>'
            + '<button id="a11-x" style="border:none;background:transparent;font-size:22px;line-height:1;cursor:pointer;color:var(--color-text-primary);flex:none;">×</button></div>'
            + '<div id="a11-note" style="padding:7px 20px;font-size:12px;color:var(--color-text-primary);border-bottom:1px solid #e7eaf1;' + (dirty ? 'color:#8E2A2A;font-weight:600;' : '') + '">'
            + (dirty ? 'Rename desk has unresolved entries — lanes are blocked until you resolve them (stale references).' : 'Statuses read the live model — a step is DONE when its artifacts exist, never because it was “run”.') + '</div>'
            + '<div id="a11-steps" style="overflow-y:auto;"></div>'
            + '<div style="padding:12px 20px;border-top:1px solid #e7eaf1;display:flex;justify-content:flex-end;gap:10px;background:#f7f8fb;">'
            + '<button id="a11-next" style="font:inherit;font-size:13px;font-weight:700;border:none;border-radius:9px;padding:8px 18px;cursor:pointer;background:#0a58c2;color:#fff;">Run next step</button></div></div>';
        document.body.appendChild(ov);
        _render();
        ov.addEventListener('click', function (e) {
            if (e.target === ov) { close(); return; }
            const runId = e.target && e.target.getAttribute && e.target.getAttribute('data-a11-run');
            if (runId) { const step = SEQUENCE.find(function (s) { return s.id === runId; }); if (step) runStep(step); }
        });
        document.getElementById('a11-x').onclick = close;
        document.getElementById('a11-auto').onchange = function (e) { _cfg().auto = !!e.target.checked; try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} };
        document.getElementById('a11-next').onclick = function () { _autoAdvance(); };
    }

    function close() {
        _stopPolling();
        const el = document.getElementById('a11-desk');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    window.A11_DESK = {
        open: open, close: close,
        // test hooks — pure reads, no UI
        _seq: SEQUENCE, _stateOf: stateOf, _laneOn: _laneOn, _nextAutoStep: _nextAutoStep,
        _renameDeskDirty: _renameDeskDirty, _hardInvariantFails: _hardInvariantFails
    };
})();
