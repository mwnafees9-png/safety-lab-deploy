// ============================================================================
// hf_register_panel.js — v0.5 — HF-2/HF-3/HF-4 + HF-5 (ISO 9241 spine card
// and the Fitts' Law seed calculator — coefficients must be CITED; results
// are seeds, they never fill a ledger field) + HF-6 (seven-factor taxonomy
// legend; classification authored on STPA causal factors, HFACS stays the
// deep taxonomy). Original scope v0.4: typed-assumption surfacing,
// the HFA view, and the PRODUCTION AUTHORING LANE.
//
// The program register (A1 moat) gains the typed lanes from hf_assumptions.js:
// type chips · credited ⇄ uncredited postures with the EFFECTIVE lane
// highlighted per the governing rule · the computed HFA column · INV-35/36 (the HF credit and phase-workload checks; INV-16/17 are MBSA / CMA)
// findings · the phase strip (renders only when a phase declares a window).
//
// AUTHORING (v0.4) — the hand-built assumption tables never rendered the
// typed lanes, so this panel is now the sanctioned authoring surface for
// them. ALL writes route through ONE adapter (_productionAuthor): it finds
// the live row by asmId, mutates in place exactly like the app's own
// update* helpers, schedules autosave, and re-syncs the underlying tables.
// The renderers themselves stay display-lane — they never touch a store;
// every mutation site lives inside the adapter, reached via author.* hooks.
// Dev/standalone hosts may still pass their own author (same interface).
//
// Task analysis (HF-3a/HF-4): the phase-scoped crew-task ledger — every
// HF-typed assumption becomes a row with inline authoring for direction,
// crew, response phase, task time (+ cited basis), declared co-activation,
// and HIDH channel tags. The phase-workload check (INV-36) sums exactly this ledger against the 80%
// red line. Reference presets live in the HIDH drawer (lazy-loaded,
// read-only, click-to-copy): presets SEED estimates, they never fill a field.
//
// Namespace: hfr-*. Styling: site tokens (CSS variables + data-table),
// matching assumption_moat.js — no stylesheet of its own.
// ============================================================================
(function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function API() { return (typeof HF_ASSUMPTIONS !== 'undefined') ? HF_ASSUMPTIONS : null; }

    const TYPE_COLOR = { hf: '#7A3EA8', dz: '#0E5A8A', rg: '#8E2A2A', op: '#1E6B4F',
        mx: '#8A5B0E', en: '#3F6212', sw: '#4A4A8A', hw: '#6B3F14', rd: '#116673' };

    function chip(text, color) {
        return '<span class="hfr-chip u-mono" style="font-size:10px; font-weight:700; color:' + color +
               '; border:1px solid ' + color + '33; background:' + color + '14; border-radius:5px; padding:2px 6px; white-space:nowrap;">' + esc(text) + '</span>';
    }
    const IN_STYLE = 'style="width:100%; min-width:56px; font:inherit; font-size:11px; padding:3px 5px; ' +
        'border:1px solid var(--color-border-strong); background:var(--color-surface-2); color:inherit; border-radius:4px;"';

    // ------------------------------------------- the production author adapter
    // The ONLY place this module mutates state. Mirrors the app's own update*
    // helpers: find the live row, assign in place, schedule autosave, re-sync
    // the hand-built tables that show the same records.
    function _findRow(id) {
        const ac = (typeof acAssumptionsData !== 'undefined' ? acAssumptionsData : []) || [];
        let r = ac.find(a => a && a.asmId === id);
        if (r) return r;
        const sysL = (typeof systemsData !== 'undefined' ? systemsData : []) || [];
        for (let i = 0; i < sysL.length; i++) {
            const x = ((sysL[i] && sysL[i].asm) || []).find(a => a && a.asmId === id);
            if (x) return x;
        }
        return null;
    }
    function _authorSave() {
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        try { if (typeof renderACAssumptions === 'function') renderACAssumptions(); } catch (_) {}
        try { if (typeof renderSysAssumptions === 'function') renderSysAssumptions(); } catch (_) {}
    }
    function _productionAuthor() {
        return {
            setType:    function (id, label) { const r = _findRow(id); if (r) { r.type = label; _authorSave(); } },
            setState:   function (id, state) { const r = _findRow(id); if (r) { r.state = state; _authorSave(); } },
            setPosture: function (id, lane, val) { const r = _findRow(id); if (r && (lane === 'credited' || lane === 'uncredited')) { r[lane] = val; _authorSave(); } },
            setHf:      function (id, patch) { const r = _findRow(id); if (r) { r.hf = Object.assign({}, r.hf || {}, patch || {}); _authorSave(); } }
        };
    }

    function _phasesNorm(hf) {
        return (hf && typeof hf.phasesNormalized === 'function') ? hf.phasesNormalized() : [];
    }

    function render(opts) {
        opts = opts || {};
        const hf = API();
        if (!hf) return;
        const mount = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
        if (!mount) return;
        const author = opts.author || null;
        const rerender = typeof opts.rerender === 'function' ? opts.rerender : function () { render(opts); };

        const all = hf.asmAllTyped();
        const typedRows = all.filter(a => a.type || a.credited != null || a.uncredited != null);
        // With an author present the register is the authoring surface — every
        // record appears, so an untyped assumption can be typed right here.
        const rows = author ? all : typedRows;
        const items = hf.hfaItems();
        const byAsm = new Map(items.map(i => [i.asmId, i]));
        const r16 = hf.inv16();
        const r17 = hf.inv17();
        const failSet = new Set(r16.fails.map(f => f.asmId));
        const phases = _phasesNorm(hf);

        const hfCount = all.filter(a => a.type === 'hf').length;
        const headline = typedRows.length + ' typed · ' + hfCount + ' human factors · ' +
            r16.fails.length + ' posture finding' + (r16.fails.length === 1 ? '' : 's') +
            (r17.findings.length ? ' · ' + r17.findings.length + ' saturation' : '');

        let html =
            '<div class="hfr-panel" style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-bottom:18px;">' +
            '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary); display:flex; justify-content:space-between; align-items:center;">' +
            '<b>Typed assumptions — the posture that actually holds</b>' +
            // 30 Aug 2026 - export parity batch 2b
            '<button class="btn-cyan" style="font-size:11px;" onclick="exportData(&quot;HF_Register&quot;, &quot;csv&quot;)" title="Export the typed-assumption register (both lanes + effective posture) as CSV">&#8595; Export CSV</button>' +
            '<span class="u-mono" style="font-size:11px; font-weight:700;' + (r16.fails.length ? ' color:#8E2A2A;' : '') + '">' + esc(headline) + '</span></div>' +
            '<p style="font-size:12px; color:var(--color-text-secondary); padding:8px 14px 4px;">' +
            'Each typed assumption carries two lanes — the credited posture and the conservative one. The credited lane holds ' +
            '<b>only while the assumption is Validated or Verified</b>; anything else and the page reads the uncredited lane. Human-factors ' +
            'types expose their HFA work item. the unvalidated-credit check names every Catastrophic/Hazardous claim standing on a credit that has not been validated; the phase-workload check sums ' +
            'crew task time per phase against the 80% red line (HIDH §5.7.5.1, Parks &amp; Boucek 1989).</p>';

        // ---- phase strip (only when a phase declares a response window) ----
        const winPhases = phases.filter(p => p.windowS);
        if (winPhases.length) {
            html += '<div class="hfr-phases" style="display:flex; gap:8px; flex-wrap:wrap; padding:6px 14px 2px;">' +
                winPhases.map(ph => {
                    const key = String(ph.id).toLowerCase();
                    const tasks = all.filter(a => a.type === 'hf' && a.hf && String(a.hf.responsePhase || '').toLowerCase() === key);
                    const open = tasks.filter(a => !hf.isValidated(a.state)).length;
                    const sat = r17.findings.filter(f => f.phase === ph.id);
                    const col = sat.length ? '#8E2A2A' : (tasks.length && !open ? '#1D9E75' : 'var(--color-text-tertiary)');
                    const meta = sat.length
                        ? sat.map(s => s.crewmember + ' ' + s.demandS + 's/' + s.windowS + 's (' + s.scenario + ')').join(' · ')
                        : (tasks.length ? tasks.length + ' task' + (tasks.length > 1 ? 's' : '') + ' · ' + open + ' open' : '—');
                    return '<div class="hfr-ph" style="flex:1; min-width:96px; border:1px solid ' + (sat.length ? '#8E2A2A' : 'var(--color-border-strong)') +
                        '; padding:6px 8px; text-align:center;"><b style="font-size:11px; color:' + col + ';">' + esc(ph.name || ph.id) +
                        '</b><div class="u-mono" style="font-size:9.5px; color:' + col + ';">' + esc(meta) + '</div></div>';
                }).join('') + '</div>';
        }

        // ---- register table ----
        html += '<div style="overflow-x:auto; padding:0 14px 12px;"><table class="data-table hfr-table" style="width:100%; font-size:12px;">' +
            '<thead><tr><th>Assumption</th><th>Type</th><th>Credited ⇄ uncredited</th><th>Holds now</th><th>HFA</th><th>State</th>' +
            (author ? '<th></th>' : '') + '</tr></thead><tbody>';
        rows.forEach(a => {
            const validated = hf.isValidated(a.state);
            const eff = hf.effectivePosture(a);
            const t = hf.ASM_TYPES.find(x => x.id === a.type);
            const typeCell = a.type ? chip(t ? t.label : a.typeLabel, TYPE_COLOR[a.type] || '#555') :
                (author ? '<select class="hfr-typesel" data-asm="' + esc(a.asmId) + '" ' + IN_STYLE + '><option value="">— type —</option>' +
                    hf.ASM_TYPES.map(x => '<option value="' + x.label + '">' + esc(x.label) + '</option>').join('') + '</select>'
                    : '<span style="color:var(--color-text-tertiary);">—</span>');
            const lanes = author
                ? '<span style="display:flex; gap:4px; align-items:center;">' +
                  '<input class="hfr-lane-in" data-asm="' + esc(a.asmId) + '" data-lane="credited" value="' + esc(a.credited == null ? '' : a.credited) + '" placeholder="credited" title="The posture the analysis credits while the assumption is validated" ' + IN_STYLE + '>' +
                  '<span style="color:var(--color-text-tertiary);">⇄</span>' +
                  '<input class="hfr-lane-in" data-asm="' + esc(a.asmId) + '" data-lane="uncredited" value="' + esc(a.uncredited == null ? '' : a.uncredited) + '" placeholder="uncredited" title="The conservative posture that holds until then" ' + IN_STYLE + '></span>'
                : ((a.credited != null || a.uncredited != null)
                    ? '<span class="hfr-lane hfr-cr" style="opacity:' + (validated ? '1' : '.45') + '; color:#1D9E75; font-weight:700;">' + esc(a.credited == null ? '—' : a.credited) + '</span>' +
                      '<span style="color:var(--color-text-tertiary);"> ⇄ </span>' +
                      '<span class="hfr-lane hfr-uc" style="opacity:' + (!validated ? '1' : '.45') + '; color:#8E2A2A; font-weight:700;">' + esc(a.uncredited == null ? '—' : a.uncredited) + '</span>'
                    : '<span style="color:var(--color-text-tertiary);">—</span>');
            const it = byAsm.get(a.asmId);
            const stateCol = validated ? '#1D9E75' : (a.state === 'Invalidated' ? '#8E2A2A' : '#B7791F');
            html += '<tr' + (failSet.has(a.asmId) ? ' class="hfr-row-fail" style="background:rgba(142,42,42,.05);"' : '') + '>' +
                '<td><span class="u-mono" style="font-weight:700; white-space:nowrap;">' + esc(a.asmId) + '</span> ' + esc(a.text) +
                    ' <span style="color:var(--color-text-tertiary); font-size:11px;">(' + esc(a.scope) + ')</span></td>' +
                '<td>' + typeCell + '</td>' +
                '<td class="u-mono" style="font-size:11px;' + (author ? '' : ' white-space:nowrap;') + '">' + lanes + '</td>' +
                '<td class="u-mono" style="font-size:11px; font-weight:700; color:' + (validated ? '#1D9E75' : '#8E2A2A') + ';">' + esc(eff == null ? '—' : eff) + '</td>' +
                '<td>' + (it ? '<span class="hfr-hfa u-mono" style="font-size:10.5px; color:' + (it.closed ? '#1D9E75' : '#7A3EA8') + ';" title="' + esc(it.work + ' · ' + it.method) + '">' +
                    esc(it.hfaId) + ' · ' + esc(it.direction) + (it.closed ? ' ✓' : '') + '</span>' : '<span style="color:var(--color-text-tertiary);">—</span>') + '</td>' +
                '<td><span class="u-mono" style="font-size:10.5px; font-weight:700; color:' + stateCol + ';">' + esc(a.state.toUpperCase()) + '</span></td>' +
                (author ? '<td>' + (!validated
                    ? '<button class="hfr-btn" data-validate="' + esc(a.asmId) + '" title="Validation credit requires evidence — set Validated only when the artifact exists">Validate</button>'
                    : '<button class="hfr-btn" data-invalidate="' + esc(a.asmId) + '">Invalidate</button>') + '</td>' : '') +
                '</tr>';
        });
        if (!rows.length)
            html += '<tr><td colspan="7" style="color:var(--color-text-tertiary); font-size:12px;">No assumptions yet — author them on the assumptions pages; type them (and set the credited / uncredited postures) here.</td></tr>';
        html += '</tbody></table>';

        // ---- findings ----
        if (r16.fails.length || r17.findings.length) {
            html += '<div class="hfr-findings" style="padding:0 2px;">';
            r16.fails.forEach(f => {
                html += '<p style="font-size:11.5px; color:#8E2A2A; font-weight:600; margin:4px 0;">⚠ Unvalidated credit · ' + esc(f.detail) + '</p>';
            });
            r17.findings.forEach(f => {
                html += '<div style="font-size:11.5px; color:#B7791F; margin:6px 0;"><b>Phase workload over the red line · ' + esc(f.phase) + ' · ' + esc(f.crewmember) +
                    ' · ' + esc(f.scenario) + '</b>: ' + f.demandS + ' s demanded in a ' + f.windowS + ' s window (' +
                    Math.round(f.utilization * 100) + '% &gt; ' + Math.round(f.redLine * 100) + '% — ' + esc(f.basis) + ') · set: ' +
                    f.tasks.map(esc).join(', ') + '<br>Exits: ' + f.exits.map(esc).join(' · ') + '. Three exits. No “mark as reviewed.”</div>';
            });
            html += '</div>';
        }
        html += '</div>';
        mount.innerHTML = html;

        // ---- authoring affordances — every write routes through author.* ----
        if (author) {
            mount.querySelectorAll('.hfr-typesel').forEach(sel => sel.addEventListener('change', () => {
                if (sel.value && typeof author.setType === 'function') { author.setType(sel.dataset.asm, sel.value); rerender(); }
            }));
            mount.querySelectorAll('.hfr-lane-in').forEach(inp => inp.addEventListener('change', () => {
                if (typeof author.setPosture === 'function') { author.setPosture(inp.dataset.asm, inp.dataset.lane, inp.value.trim()); rerender(); }
            }));
            mount.querySelectorAll('[data-validate]').forEach(b => b.addEventListener('click', () => {
                if (typeof author.setState === 'function') { author.setState(b.dataset.validate, 'Validated'); rerender(); }
            }));
            mount.querySelectorAll('[data-invalidate]').forEach(b => b.addEventListener('click', () => {
                if (typeof author.setState === 'function') { author.setState(b.dataset.invalidate, 'Invalidated'); rerender(); }
            }));
        }
    }

    // ------------------------------------------- task analysis (HF-3a/HF-4)
    // The phase-scoped crew-task ledger: every HF-typed assumption is a
    // task-analysis row — direction, crew, response phase, elicited task time
    // with its cited basis, declared co-activation, HIDH channel tags. INV-36
    // sums exactly this ledger against the 80% red line. The ROWS are the
    // live assumption records; the LEDGER is computed — never stored.
    function taskAnalysisPanel(hf, author) {
        const all = hf.asmAllTyped().filter(a => a.type === 'hf');
        // Read-only hosts show only rows carrying task data; an authoring host
        // shows every HF row so task data can be authored right here.
        const tasks = author ? all : all.filter(a => a.hf &&
            (a.hf.taskTimeS != null || a.hf.responsePhase || a.hf.crewmember));
        const r17 = hf.inv17();
        const satIds = new Set(r17.findings.flatMap(f => f.tasks));
        const phases = _phasesNorm(hf);
        const chans = hf.HF_CHANNELS || [];
        const dirOpts = ['recovery', 'non-recovery', 'workload'];
        let html =
            '<div class="hfr-ta-panel" style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-bottom:18px;">' +
            '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary); display:flex; justify-content:space-between; align-items:center;">' +
            '<b>Task analysis — phase-scoped crew task ledger</b>' +
            '<span class="u-mono" style="font-size:11px; font-weight:700;' + (r17.findings.length ? ' color:#8E2A2A;' : '') + '">' +
            tasks.length + ' task' + (tasks.length === 1 ? '' : 's') +
            (r17.findings.length ? ' · ' + r17.findings.length + ' saturation finding' + (r17.findings.length === 1 ? '' : 's') : '') + '</span></div>' +
            '<p style="font-size:12px; color:var(--color-text-secondary); padding:8px 14px 4px;">' +
            'Every crew action the safety case credits, scoped to the phase of the <b>response</b>, per crewmember, ' +
            'with its elicited task time and declared co-activation. the phase-workload check sums this ledger per phase against the ' +
            '80% time-occupancy red line (HIDH §5.7.5.1, Parks &amp; Boucek 1989). Task times are elicited — reference ' +
            'presets seed estimates, they never fill a field. Channels are the HIDH sensory/response lanes the task loads.' +
            (author && !phases.some(p => p.windowS)
                ? ' <b style="color:#B7791F;">No phase declares a crew response window yet — the phase-workload check stays silent. Set windows on the Flight Phases tab.</b>' : '') + '</p>' +
            '<div style="overflow-x:auto; padding:0 14px 12px;"><table class="data-table hfr-ta-table" style="width:100%; font-size:12px;">' +
            '<thead><tr><th>Task (credited crew action)</th><th>Direction</th><th title="Crew workload for this failure condition, per AC 25.1309 bands. Cross-checked against the FHA severity by the workload-versus-severity check.">Workload</th><th>Crew</th><th>Response phase</th><th>Task time</th><th>Time basis</th><th>Co-activation</th><th>Channels</th><th>State</th></tr></thead><tbody>' +
            (tasks.length ? tasks.map(a => {
                const h = a.hf || {};
                const sat = satIds.has(a.asmId);
                const chCell = author
                    ? chans.map(c => {
                        const on = (h.channels || []).indexOf(c) !== -1;
                        return '<span class="hfr-ch-chip u-mono" data-asm="' + esc(a.asmId) + '" data-ch="' + esc(c) + '" role="button" tabindex="0" ' +
                            'style="cursor:pointer; font-size:9px; font-weight:700; border-radius:5px; padding:2px 5px; margin:1px; display:inline-block; ' +
                            'border:1px solid ' + (on ? '#7A3EA8' : 'var(--color-border-strong)') + '; color:' + (on ? '#7A3EA8' : 'var(--color-text-tertiary)') + '; background:' + (on ? '#7A3EA814' : 'transparent') + ';">' +
                            esc(c.slice(0, 3).toUpperCase()) + '</span>';
                      }).join('')
                    : ((h.channels || []).length ? (h.channels || []).map(c => chip(c, '#7A3EA8')).join(' ') : '<span style="color:var(--color-text-tertiary);">—</span>');
                if (author) {
                    const phOpts = '<option value="">—</option>' + phases.map(p =>
                        '<option value="' + esc(p.id) + '"' + (String(h.responsePhase || '').toLowerCase() === String(p.id).toLowerCase() ? ' selected' : '') + '>' +
                        esc(p.name) + (p.windowS ? ' (' + p.windowS + 's)' : '') + '</option>').join('') +
                        (h.responsePhase && !phases.some(p => String(p.id).toLowerCase() === String(h.responsePhase).toLowerCase())
                            ? '<option value="' + esc(h.responsePhase) + '" selected>' + esc(h.responsePhase) + ' (not a phase)</option>' : '');
                    return '<tr' + (sat ? ' style="background:rgba(142,42,42,.05);"' : '') + '>' +
                        '<td><span class="u-mono" style="font-weight:700; white-space:nowrap;">' + esc(a.asmId) + '</span> ' + esc(a.text) + '</td>' +
                        '<td><select class="hfr-ta-in" data-asm="' + esc(a.asmId) + '" data-f="direction" ' + IN_STYLE + '>' +
                            dirOpts.map(d => '<option value="' + d + '"' + ((h.direction || 'recovery') === d ? ' selected' : '') + '>' + d + '</option>').join('') + '</select></td>' +
                        '<td><select class="hfr-ta-in" data-asm="' + esc(a.asmId) + '" data-f="workloadBand" title="Crew workload band (AC 25.1309). The workload-versus-severity check flags a mismatch with the FHA severity." ' + IN_STYLE + '>' +
                            ['', 'none', 'slight', 'significant', 'excessive', 'incapacitating'].map(w => '<option value="' + w + '"' + ((h.workloadBand || '') === w ? ' selected' : '') + '>' + (w || '—') + '</option>').join('') + '</select></td>' +
                        '<td><input class="hfr-ta-in" data-asm="' + esc(a.asmId) + '" data-f="crewmember" value="' + esc(h.crewmember || '') + '" placeholder="PF / PM" size="4" ' + IN_STYLE + '></td>' +
                        '<td><select class="hfr-ta-in" data-asm="' + esc(a.asmId) + '" data-f="responsePhase" ' + IN_STYLE + '>' + phOpts + '</select></td>' +
                        '<td><input class="hfr-ta-in" data-asm="' + esc(a.asmId) + '" data-f="taskTimeS" type="number" min="0" step="1" value="' + (h.taskTimeS != null ? esc(h.taskTimeS) : '') + '" placeholder="s" ' + IN_STYLE + '></td>' +
                        '<td><input class="hfr-ta-in" data-asm="' + esc(a.asmId) + '" data-f="taskTimeBasis" value="' + esc(h.taskTimeBasis || '') + '" placeholder="elicited / cited basis" title="Where this number comes from — a measurement campaign, sim session, or a cited HIDH preset you accepted" ' + IN_STYLE + '></td>' +
                        '<td><input class="hfr-ta-in" data-asm="' + esc(a.asmId) + '" data-f="coActivation" value="' + esc((h.coActivation || []).join(', ')) + '" placeholder="always, S1…" title="Declared co-activation sets — concurrency is an assumption, never a solver" ' + IN_STYLE + '></td>' +
                        '<td style="white-space:nowrap;">' + chCell + '</td>' +
                        '<td><span class="u-mono" style="font-size:10.5px; font-weight:700; color:' + (hf.isValidated(a.state) ? '#1D9E75' : '#B7791F') + ';">' + esc(a.state.toUpperCase()) + '</span></td></tr>';
                }
                return '<tr' + (sat ? ' style="background:rgba(142,42,42,.05);"' : '') + '>' +
                    '<td><span class="u-mono" style="font-weight:700; white-space:nowrap;">' + esc(a.asmId) + '</span> ' + esc(a.text) + '</td>' +
                    '<td class="u-mono">' + esc(h.direction || 'recovery') + '</td>' +
                    '<td class="u-mono">' + esc(h.workloadBand || '—') + '</td>' +
                    '<td class="u-mono" style="font-weight:700;">' + esc(h.crewmember || '—') + '</td>' +
                    '<td class="u-mono">' + esc(h.responsePhase || '—') + '</td>' +
                    '<td class="u-mono"' + (h.taskTimeBasis ? ' title="' + esc(h.taskTimeBasis) + '"' : '') + '>' +
                        (h.taskTimeS != null ? h.taskTimeS + ' s' + (h.taskTimeBasis ? ' <span style="color:var(--color-text-tertiary);">ⓘ</span>' : '') : '—') + '</td>' +
                    '<td class="u-mono" style="font-size:11px;">' + esc(h.taskTimeBasis || '—') + '</td>' +
                    '<td class="u-mono" style="font-size:11px;">' + esc((h.coActivation || []).join(', ') || '—') + '</td>' +
                    '<td>' + chCell + '</td>' +
                    '<td><span class="u-mono" style="font-size:10.5px; font-weight:700; color:' + (hf.isValidated(a.state) ? '#1D9E75' : '#B7791F') + ';">' + esc(a.state.toUpperCase()) + '</span></td></tr>';
            }).join('')
              : '<tr><td colspan="10" style="color:var(--color-text-tertiary); font-size:12px;">No crew tasks yet — type an assumption <b>Human Factors</b> and its task row appears here for authoring.</td></tr>') +
            '</tbody></table>' +
            (r17.findings.length ? r17.findings.map(f =>
                '<p style="font-size:11.5px; color:#8E2A2A; font-weight:600; margin:6px 0;">⚠ Phase workload over the red line · ' + esc(f.phase) + ' · ' + esc(f.crewmember) + ' · ' + esc(f.scenario) + ': ' +
                f.demandS + ' s / ' + f.windowS + ' s (' + Math.round(f.utilization * 100) + '%) — exits: ' + f.exits.map(esc).join(' · ') + '</p>').join('') : '') +
            '</div></div>';
        return html;
    }
    function wireTaskPanel(root, hf, author, rerender) {
        if (!root || !author) return;
        root.querySelectorAll('.hfr-ta-in').forEach(el => el.addEventListener('change', () => {
            const f = el.dataset.f;
            let v = el.value;
            if (f === 'taskTimeS') v = (v === '' ? null : +v);
            if (f === 'coActivation') v = String(v).split(',').map(s => s.trim()).filter(Boolean);
            const patch = {}; patch[f] = v;
            if (typeof author.setHf === 'function') { author.setHf(el.dataset.asm, patch); rerender(); }
        }));
        root.querySelectorAll('.hfr-ch-chip').forEach(el => {
            const toggle = () => {
                const a = hf.asmAllTyped().find(x => x.asmId === el.dataset.asm);
                const cur = (a && a.hf && a.hf.channels) ? a.hf.channels.slice() : [];
                const i = cur.indexOf(el.dataset.ch);
                if (i === -1) cur.push(el.dataset.ch); else cur.splice(i, 1);
                if (typeof author.setHf === 'function') { author.setHf(el.dataset.asm, { channels: cur }); rerender(); }
            };
            el.addEventListener('click', toggle);
            el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
        });
    }

    // ----------------------------------------------- HIDH reference drawer
    // 298 cited presets (NASA/SP-2010-3407 Rev 1), lazy-loaded on first open.
    // READ-ONLY — search, cite, click-to-copy. Presets seed estimates; they
    // never fill a field: the only way a value reaches a record is the
    // engineer pasting it into the basis/time fields above, on purpose.
    const APPLIC_COLOR = { aircraft: '#1E6B4F', general: '#0E5A8A', spaceflight: '#8A5B0E' };
    let _refFilter = { q: '', applic: { aircraft: true, general: true, spaceflight: false } };
    function _refData() { return (typeof HF_REFERENCE_PRESETS !== 'undefined') ? HF_REFERENCE_PRESETS
        : (typeof window !== 'undefined' && window.HF_REFERENCE_PRESETS) || null; }
    function _refLoad(cb) {
        if (_refData()) { cb(); return; }
        if (typeof document === 'undefined') return;
        if (document.getElementById('hfr-ref-script')) return;   // already in flight
        const s = document.createElement('script');
        s.id = 'hfr-ref-script';
        s.src = 'hf_reference_data.js?v=1.1';
        s.onload = cb;
        s.onerror = function () { const b = document.getElementById('hfr-ref-body');
            if (b) b.innerHTML = '<p style="color:#8E2A2A; font-size:12px; padding:8px 14px;">Could not load the reference library.</p>'; };
        document.head.appendChild(s);
    }
    function refDrawerShell() {
        return '<details class="hfr-ref-drawer" style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-bottom:18px;">' +
            '<summary style="padding:9px 14px; cursor:pointer; border-bottom:1px solid var(--color-border-strong);"><b>HIDH reference presets</b> ' +
            '<span class="u-mono" style="font-size:11px; color:var(--color-text-secondary);">298 cited values · NASA/SP-2010-3407 Rev 1 · seed, never fill</span></summary>' +
            '<div id="hfr-ref-body"><p style="font-size:12px; color:var(--color-text-secondary); padding:10px 14px;">Loading the reference library…</p></div>' +
            '</details>';
    }
    function _refRender() {
        const body = document.getElementById('hfr-ref-body');
        const data = _refData();
        if (!body || !data) return;
        const q = _refFilter.q.toLowerCase();
        const keys = Object.keys(data).filter(k => {
            const e = data[k];
            if (!_refFilter.applic[e.applicability]) return false;
            if (!q) return true;
            return (e.name + ' ' + (e.group || '') + ' ' + (e.section || '') + ' ' + (e.source || '')).toLowerCase().indexOf(q) !== -1;
        });
        const CAP = 50;
        const shown = keys.slice(0, CAP);
        let html =
            '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:10px 14px 4px;">' +
            '<input id="hfr-ref-q" value="' + esc(_refFilter.q) + '" placeholder="Search 298 presets — reaction time, reach, luminance…" ' +
                'style="flex:1; min-width:200px; font:inherit; font-size:12px; padding:6px 9px; border:1px solid var(--color-border-strong); background:var(--color-surface-2); color:inherit; border-radius:5px;">' +
            ['aircraft', 'general', 'spaceflight'].map(ap =>
                '<span class="hfr-ref-ap u-mono" data-ap="' + ap + '" role="button" tabindex="0" style="cursor:pointer; font-size:10px; font-weight:700; border-radius:5px; padding:3px 8px; ' +
                'border:1px solid ' + (_refFilter.applic[ap] ? APPLIC_COLOR[ap] : 'var(--color-border-strong)') + '; color:' + (_refFilter.applic[ap] ? APPLIC_COLOR[ap] : 'var(--color-text-tertiary)') + ';">' +
                ap.toUpperCase() + '</span>').join('') + '</div>' +
            '<p style="font-size:11px; color:var(--color-text-secondary); padding:2px 14px 4px;">Every value is cited to its printed HIDH page — hover a row for the verbatim source fragment. ' +
            '<b>Copy</b> puts “value — source, page” on the clipboard; paste it into a task-time or basis field above if you accept it. A preset never flips anything to Validated.</p>' +
            '<div style="overflow-x:auto; padding:0 14px 12px;"><table class="data-table hfr-ref-table" style="width:100%; font-size:11.5px;">' +
            '<thead><tr><th>Preset</th><th>Value</th><th>Applies</th><th>Source</th><th></th></tr></thead><tbody>';
        shown.forEach(k => {
            const e = data[k];
            html += '<tr title="' + esc(e.quote || '') + '">' +
                '<td>' + esc(e.name) + '<div style="font-size:10px; color:var(--color-text-tertiary);">' + esc(e.group || '') + '</div></td>' +
                '<td class="u-mono" style="white-space:nowrap; font-weight:700;">' + esc(e.value != null ? e.value : '—') + ' <span style="font-weight:400; color:var(--color-text-secondary);">' + esc(e.unit || '') + '</span></td>' +
                '<td>' + chip(e.applicability, APPLIC_COLOR[e.applicability] || '#555') + '</td>' +
                '<td class="u-mono" style="font-size:10.5px;">' + esc(e.source || '') + ' · p.' + esc(e.page) + '</td>' +
                '<td><button class="hfr-ref-copy" data-k="' + esc(k) + '" style="font-size:10.5px; cursor:pointer;">Copy</button></td></tr>';
        });
        if (!shown.length) html += '<tr><td colspan="5" style="color:var(--color-text-tertiary); font-size:12px;">No presets match.</td></tr>';
        html += '</tbody></table>' +
            (keys.length > CAP ? '<p class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary); margin:4px 0;">' + (keys.length - CAP) + ' more match — refine the search.</p>' : '') +
            '</div>';
        body.innerHTML = html;
        const qIn = document.getElementById('hfr-ref-q');
        if (qIn) {
            qIn.addEventListener('input', () => { _refFilter.q = qIn.value;
                clearTimeout(_refRender._t); _refRender._t = setTimeout(() => { const p = qIn.selectionStart; _refRender();
                    const q2 = document.getElementById('hfr-ref-q'); if (q2) { q2.focus(); try { q2.setSelectionRange(p, p); } catch (_) {} } }, 250); });
        }
        body.querySelectorAll('.hfr-ref-ap').forEach(el => el.addEventListener('click', () => {
            _refFilter.applic[el.dataset.ap] = !_refFilter.applic[el.dataset.ap]; _refRender();
        }));
        body.querySelectorAll('.hfr-ref-copy').forEach(el => el.addEventListener('click', () => {
            const e = data[el.dataset.k];
            if (!e) return;
            const txt = (e.value != null ? e.value + ' ' : '') + (e.unit || '') + ' — ' + (e.source || '') + ', p.' + e.page;
            try { navigator.clipboard.writeText(txt); } catch (_) {}
            el.textContent = 'Copied'; setTimeout(() => { el.textContent = 'Copy'; }, 1200);
        }));
    }
    function wireRefDrawer(root) {
        const d = root && root.querySelector ? root.querySelector('.hfr-ref-drawer') : null;
        if (!d) return;
        d.addEventListener('toggle', () => { if (d.open) _refLoad(_refRender); });
    }

    // -------------------------------------------- HF-5/HF-6: the ergo card
    // ISO 9241 spine (cite & point), the Fitts seed calculator, and the
    // seven-factor legend. Display-lane: computes on demand, writes nothing.
    function ergoCard() {
        if (typeof HF_ERGO === 'undefined') return '';
        const IN = 'style="width:110px; font:inherit; font-size:11px; padding:3px 6px; border:1px solid var(--color-border-strong); background:var(--color-surface-2); color:inherit; border-radius:4px;"';
        const parts = HF_ERGO.ISO_9241.parts.map(p =>
            '<span class="u-mono" style="font-size:10px; border:1px solid var(--color-border); border-radius:4px; padding:1px 6px; margin-right:5px; white-space:nowrap;" title="' + esc(p.title) + '">' + esc(p.designation) + '</span>').join('');
        const legend = HF_ERGO.FACTOR_CLASSES.map(c => chip(c.label, c.color)).join(' ');
        return '<div class="hfr-ergo-panel" style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-bottom:18px;">' +
            '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary);"><b>Ergonomics — ISO 9241 spine · Fitts seeds · the seven-factor lens</b></div>' +
            '<div style="padding:10px 14px; font-size:12px;">' +
            '<div style="margin-bottom:8px;">' + parts + '<span style="font-size:11px; color:var(--color-text-tertiary);"> — designations cited, text never stored; the licensed documents govern.</span></div>' +
            '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:10px 0 4px;">' +
            '<b style="font-size:11.5px;">Fitts seed:</b>' +
            '<input id="hfr-fitts-d" ' + IN + ' placeholder="D — distance (mm)">' +
            '<input id="hfr-fitts-w" ' + IN + ' placeholder="W — target width (mm)">' +
            '<input id="hfr-fitts-a" ' + IN + ' placeholder="a (ms) — cited">' +
            '<input id="hfr-fitts-b" ' + IN + ' placeholder="b (ms/bit) — cited">' +
            '<input id="hfr-fitts-basis" style="flex:1; min-width:200px; font:inherit; font-size:11px; padding:3px 6px; border:1px solid var(--color-border-strong); background:var(--color-surface-2); color:inherit; border-radius:4px;" placeholder="coefficient basis — your ISO 9241-9 trials, or a source you can defend">' +
            '<button class="u-mono" style="font-size:10.5px; font-weight:700; cursor:pointer; border:1px solid var(--color-text-primary); background:var(--color-surface-2); border-radius:5px; padding:3px 10px;" onclick="HF_REGISTER_PANEL.fittsCompute()">compute</button></div>' +
            '<div id="hfr-fitts-out" style="font-size:11.5px; color:var(--color-text-secondary); min-height:16px;">MT = a + b·log2(D/W + 1) — the formula ships; the coefficients are EMPIRICAL and must be cited. The result is a SEED for the task ledger; it never fills a field by itself.</div>' +
            '<div style="margin-top:10px; border-top:1px dashed var(--color-border); padding-top:8px;"><b style="font-size:11.5px;">Seven-factor lens</b> <span style="font-size:11px; color:var(--color-text-tertiary);">(classify STPA causal factors; HFACS nanocodes stay the deep taxonomy — one class per factor, no double-modelling)</span><br>' +
            '<div style="margin-top:4px; display:flex; gap:5px; flex-wrap:wrap;">' + legend + '</div></div>' +
            '</div></div>';
    }
    function fittsCompute() {
        const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
        const out = document.getElementById('hfr-fitts-out');
        if (!out || typeof HF_ERGO === 'undefined') return;
        try {
            const r = HF_ERGO.fitts({ dMm: g('hfr-fitts-d'), wMm: g('hfr-fitts-w'), aMs: g('hfr-fitts-a'), bMs: g('hfr-fitts-b'), basis: g('hfr-fitts-basis') });
            out.innerHTML = '<b style="color:var(--color-text-primary);">MT = ' + r.mtMs.toFixed(0) + ' ms</b> · ID = ' + r.idBits.toFixed(2) + ' bits · ' +
                '<span class="u-mono" style="font-size:10.5px;">seed basis: Fitts (a=' + r.aMs + ' ms, b=' + r.bMs + ' ms/bit — ' + esc(r.basis) + ')</span>' +
                ' <span style="color:var(--color-text-tertiary);">— carry it into the task ledger with this basis; the seed never fills the field itself.</span>';
        } catch (e) {
            out.innerHTML = '<span style="color:#B7791F;">' + esc(e.message) + '</span>';
        }
    }

    // ------------------------------------------------------- the HFA view
    // Analyze → Human factors → Human Factors Analysis (HFA). Own tab
    // (view-hfa, switchTab 'hfa'): the HFA work-items lane — every item
    // computed from an HF-typed assumption — the task ledger (authoring),
    // the HIDH reference drawer, and the typed register beneath.
    //
    // v0.9 (30 Aug 2026, "far more intuitive"): orientation strip added —
    // teach on empty, collapse to a slim action row once typed rows exist.
    // v1.0 (30 Aug 2026, Waqas: "human factors is not just about assumptions,
    // that is one angle linking it to the safety analyses"): REFRAMED. The
    // strip is now the HF LANE MAP — the analyses that exist before anything
    // is credited (allocation, task analysis, error analysis, alerting,
    // ergonomics) — and this page is presented as what it is: the BRIDGE
    // where those conclusions get credited into FHA severities and trees.
    // Display-lane only: links and the guarded AI entry, never a store write.
    function _hfaOrientation(hf) {
        const all = hf.asmAllTyped();
        const anyTyped = all.some(a => a.type || a.credited != null || a.uncredited != null);
        const aiBtn = '<button class="btn-cyan" style="font-size:11px;" ' +
            'onclick="try{if(window.SafetyLabAI&&window.SafetyLabAI.draftHfAssumptions){window.SafetyLabAI.draftHfAssumptions();}}catch(_){}" ' +
            'title="Scans your failure conditions for ones that already rely on crew action with no Human Factors assumption on the register — and drafts the missing assumptions for your review">' +
            '&#10024; Find unregistered crew credit</button>';
        if (anyTyped) {
            return '<div class="hfr-orient-slim" style="display:flex; gap:14px; align-items:center; flex-wrap:wrap; margin-bottom:14px;">' + aiBtn + '</div>';
        }
        const ROW = 'style="flex:1 1 190px; min-width:190px;"';
        const lane = function (tab, name, what) {
            return '<div class="hfr-lane" ' + ROW + '><a href="#" onclick="try{switchTab(\'' + tab + '\')}catch(_){};return false;" style="font-size:12px; font-weight:700;">' + name + '</a>' +
                '<div style="font-size:11.5px; color:var(--color-text-secondary); margin-top:3px; line-height:1.5;">' + what + '</div></div>';
        };
        return '<div class="hfr-orient" style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); border-radius:6px; padding:16px 20px; margin-bottom:16px; ">' +
            '<b style="font-size:13px;">Human factors is its own analysis lane. This page is the bridge &mdash; where its conclusions get credited into the safety argument.</b>' +
            '<div style="display:flex; gap:18px; flex-wrap:wrap; margin-top:12px;">' +
            lane('hfa-alloc', 'Function Allocation', 'Who does what &mdash; crew, automation, or shared &mdash; decided per sub-function against the live Functions lane.') +
            lane('hfa-task', 'Task Analysis', 'What the crew must actually do, phase by phase, timed against the 80% workload red line.') +
            lane('hfa-hea', 'Human Error Analysis', 'What they can get wrong &mdash; the crew-task FMEA: error modes, detection, recovery.') +
            lane('hfa-alerts', 'Crew Alerting', 'The warnings, cautions and advisories those analyses lean on, and which conditions cite them.') +
            lane('hfa-ergo', 'Ergonomics', 'The interface itself: ISO 9241 spine, Fitts seed calculator, the seven-factor lens.') +
            '</div>' +
            '<div style="margin-top:14px; border-top:1px dashed var(--color-border); padding-top:12px;">' +
            '<b style="font-size:12px;">The bridge (this page):</b> ' +
            '<span style="font-size:11.5px; color:var(--color-text-secondary); line-height:1.5;">when the work above supports crediting the crew, state it as a typed assumption carrying <b>two numbers</b> &mdash; the credited value and the conservative one. The conservative lane holds until the assumption is <b>Validated</b>; then the credit takes effect everywhere it is used. Each HF assumption exposes one work item below.</span>' +
            '<div style="display:flex; gap:14px; align-items:center; flex-wrap:wrap; margin-top:10px;">' + aiBtn + '</div>' +
            '</div></div>';
    }

    function renderHfa() {
        const view = document.getElementById('view-hfa');
        const hf = API();
        if (!view || !hf) return;
        const author = _productionAuthor();
        const items = hf.hfaItems();
        const open = items.filter(i => !i.closed).length;
        const DIR_COLOR = { recovery: '#1E6B4F', 'non-recovery': '#8E2A2A', workload: '#7A3EA8' };
        let html =
            '<div class="header-with-export"><h3>Human Factors Analysis (HFA)</h3>' + _hfDataActions('HF_Register') + '</div>' +
            '<p style="font-size:12.5px; color:var(--color-text-secondary); ">' +
            'The HFA lane is computed from the assumption register: every assumption typed ' +
            '<b>Human Factors</b> exposes exactly one work item here — verify the crew-action credit, ' +
            'challenge the assumed non-recovery, or substantiate the workload allocation. Items close when ' +
            'their assumption reaches <b>Validated</b>; there is no separate HFA store to drift. ' +
            'Grounded in NASA/SP-2010-3407 (HIDH) and NASA-HDBK-8709.25 (NASAHFACS).</p>' +
            _hfaOrientation(hf) +
            '<div class="hfr-hfa-panel" style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-bottom:18px;">' +
            '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary); display:flex; justify-content:space-between; align-items:center;">' +
            '<b>HFA work items — computed, never stored</b>' +
            '<span class="u-mono" style="font-size:11px; font-weight:700;' + (open ? ' color:#B7791F;' : '') + '">' +
            items.length + ' item' + (items.length === 1 ? '' : 's') + ' · ' + open + ' open</span></div>' +
            '<div style="overflow-x:auto; padding:0 14px 12px;"><table class="data-table hfr-hfa-table" style="width:100%; font-size:12px;">' +
            '<thead><tr><th>HFA item</th><th>Direction</th><th>Work</th><th>Method</th><th>Assumption</th><th>Status</th></tr></thead><tbody>' +
            (items.length ? items.map(i =>
                '<tr><td class="u-mono" style="font-weight:700; white-space:nowrap;">' + esc(i.hfaId) + '</td>' +
                '<td><span class="u-mono" style="font-size:10px; font-weight:700; color:' + (DIR_COLOR[i.direction] || '#555') + ';">' + esc(i.direction.toUpperCase()) + '</span></td>' +
                '<td>' + esc(i.work) + '</td>' +
                '<td style="font-size:11.5px; color:var(--color-text-secondary);">' + esc(i.method) + '</td>' +
                '<td class="u-mono" style="white-space:nowrap;">' + esc(i.asmId) + '</td>' +
                '<td><span class="u-mono" style="font-size:10.5px; font-weight:700; color:' + (i.closed ? '#1D9E75' : '#B7791F') + ';">' + (i.closed ? 'CLOSED' : 'OPEN') + '</span></td></tr>').join('')
              : '<tr><td colspan="6" style="color:var(--color-text-tertiary); font-size:12px;">No HFA items yet — type an assumption <b>Human Factors</b> (below, or on the assumptions pages), or use <b>Find unregistered crew credit</b> above, and its work item appears here.</td></tr>') +
            '</tbody></table></div></div>' +
            refDrawerShell() +
            '<div id="hfa-register-host"></div>';
        view.innerHTML = html;
        wireRefDrawer(view);
        render({ mount: document.getElementById('hfa-register-host'), author: author, rerender: renderHfa });
    }

    // Task Analysis — its own tab (view-hfa-task): the phase-scoped crew-task
    // ledger (HF-3a/HF-4). Authoring re-renders this view only.
    // v1.1 (30 Aug 2026, Waqas: "there is no interface to add tasks", then
    // "it does not start with just an assumption") — task analysis is a
    // PRIMARY analysis: authored crew-task rows come FIRST (HF_ANALYSES owns
    // the store, projectConfig.hf.tasks.rows), and crediting one into the
    // typed-assumption register is a promotion, not a birth. The credited
    // ledger (taskAnalysisPanel) renders BELOW the authored tasks.
    function renderHfaTask() {
        const view = document.getElementById('view-hfa-task');
        const hf = API();
        if (!view || !hf) return;
        const author = _productionAuthor();
        view.innerHTML =
            '<div class="header-with-export"><h3>Task Analysis</h3>' + _hfDataActions('HF_Tasks', ['<div onclick="exportData(&quot;HF_Register&quot;, &quot;csv&quot;)">Export credited ledger CSV</div>']) + '</div>' +
            '<p style="font-size:12.5px; color:var(--color-text-secondary); ">' +
            'Phase-scoped crew-task ledger: direction, crewmember, response phase and time, ' +
            'and the five HIDH channel loads per task. Feeds the phase-workload check — the 80% occupancy red line.</p>' +
            '' +
            '<div id="hfa-tasks-host"></div>' +
            '<div style="margin:14px 0 6px;"><b style="font-size:12.5px;">Credited tasks — the register ledger</b> <span class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary);">tasks the safety argument credits, as HF-typed assumptions; the phase-workload check sums these</span></div>' +
            taskAnalysisPanel(hf, author);
        try { if (window.HF_ANALYSES && typeof window.HF_ANALYSES.renderTasks === 'function') window.HF_ANALYSES.renderTasks(); } catch (_) {}
        wireTaskPanel(view, hf, author, renderHfaTask);
    }
    // v1.1 — uniform Data Actions (Waqas: "data actions ... the same for all
    // analysis, same as FHAs"): the same tab-dropdown the FHA header carries,
    // listing only actions that EXIST for the lane (no dead menu items).
    function _hfDataActions(exportKey, extra) {
        const items = ['<div onclick="exportData(\'' + exportKey + '\', \'csv\')">Export CSV</div>'].concat(extra || []);
        return '<div class="tab-dropdown"><button class="tab-dropbtn">Data Actions &#9662;</button>' +
            '<div class="tab-dropdown-content">' + items.join('') + '</div></div>';
    }

    // Ergonomics — its own tab (view-hfa-ergo): the ISO 9241 spine (cite &
    // point), the Fitts seed calculator, and the seven-factor lens.
    function renderHfaErgo() {
        const view = document.getElementById('view-hfa-ergo');
        if (!view) return;
        view.innerHTML =
            '<div class="header-with-export"><h3>Ergonomics</h3>' + _hfDataActions('HF_Ergo') + '</div>' +
            '<p style="font-size:12.5px; color:var(--color-text-secondary); ">' +
            'ISO 9241 spine (cite &amp; point), the Fitts seed calculator, the seven-factor lens — and the ' +
            'evaluation register: the findings you author against those criteria.</p>' +
            '' +
            '<div id="hfa-ergo-register-host"></div>' +
            ergoCard();
        // v1.1 — the evaluation register (authored rows) renders from
        // HF_ANALYSES so its store discipline matches the other HF analyses.
        try { if (window.HF_ANALYSES && typeof window.HF_ANALYSES.renderErgo === 'function') window.HF_ANALYSES.renderErgo(); } catch (_) {}
    }

    // ---------------------------------------------- production self-mount
    // Same pattern as the moat: host div on the aircraft assumptions view,
    // re-render on tab switch. v0.4: the production author adapter rides
    // along — the panel IS the authoring surface for the typed lanes.
    function renderProduction() {
        const view = document.getElementById('view-ac-asm');
        if (!view) return;
        // 4 Sep 2026 (Waqas) — same ruling as the moat: the typed-assumptions panel sat
        // above the working Assumptions Log and buried it. It now lives BELOW the log,
        // folded shut, after the program register fold.
        let fold = document.getElementById('hfr-register-fold');
        let host = document.getElementById('hfr-register-host');
        if (!fold) {
            fold = document.createElement('details');
            fold.id = 'hfr-register-fold';
            fold.style.cssText = 'margin-top:12px;';
            const sum = document.createElement('summary');
            sum.id = 'hfr-register-fold-summary';
            sum.style.cssText = 'cursor:pointer;font-weight:700;padding:8px 0;';
            sum.textContent = 'Typed assumptions — credited ⇄ uncredited posture';
            fold.appendChild(sum);
            host = document.createElement('div');
            host.id = 'hfr-register-host';
            fold.appendChild(host);
            view.appendChild(fold);
        } else if (!host) {
            host = document.createElement('div');
            host.id = 'hfr-register-host';
            fold.appendChild(host);
        }
        render({ mount: host, author: _productionAuthor(), rerender: renderProduction });
    }
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        (function wrap() {
            if (typeof window.switchTab === 'function' && !window.switchTab._hfrWrapped) {
                const orig = window.switchTab;
                const wrapped = function (tabId) {
                    const r = orig.apply(this, arguments);
                    try { if (tabId === 'ac-asm' || String(tabId).indexOf('asm') !== -1) setTimeout(renderProduction, 0); if (tabId === 'hfa') setTimeout(renderHfa, 0); if (tabId === 'hfa-task') setTimeout(renderHfaTask, 0); if (tabId === 'hfa-ergo') setTimeout(renderHfaErgo, 0); } catch (_) {}
                    return r;
                };
                wrapped._hfrWrapped = true;
                window.switchTab = wrapped;
            } else if (typeof window.addEventListener === 'function') {
                window.addEventListener('DOMContentLoaded', () => setTimeout(wrap, 500));
            }
        })();
    }

    const PANEL = { render, renderProduction, renderHfa, renderHfaTask, renderHfaErgo, fittsCompute };
    if (typeof window !== 'undefined') window.HF_REGISTER_PANEL = PANEL;
    if (typeof module !== 'undefined') module.exports = PANEL;
})();
