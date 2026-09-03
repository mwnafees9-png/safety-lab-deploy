// ============================================================================
// hf_assumptions.js — v0.8 — HF-1/HF-4: typed assumptions + the HF lane.
//
// Extends the A1 assumption moat (assumption_moat.js): assumptions are already
// first-class records (asmId, statement, state, lifecycle) with a where-used
// resolver and INV-13/14/15. This module adds the typed-assumption doctrine on
// those SAME records — no new store, no duplicate citizenry:
//
//   TYPE — each assumption may carry a `type` (schema enum, config_data.js):
//   Human Factors, Design, Regulatory, Operational, Maintenance,
//   Environmental, Software (DO-178C), Hardware (DO-254), Reliability data.
//   Untyped assumptions remain fully legal — the field is additive.
//
//   TWO-LANE POSTURE — optional `credited` / `uncredited` fields on the
//   record. The governing rule is a COMPUTED read: effectivePosture() returns
//   the credited lane ONLY when the assumption is validated; every other
//   state reads the uncredited (conservative) lane. v0.4: the PRODUCTION
//   state vocabulary is Proposed/Validated/Verified — Verified is validation
//   plus verification, so BOTH Validated and Verified read the credited lane
//   (isValidated()). Proposed/Open/Invalidated/Closed all read conservative.
//
//   HFA LANE — assumptions typed Human Factors expose computed HFA items
//   (direction: recovery / non-recovery / workload) pointing at the
//   validation work the type demands. Computed, not stored. v0.4: hf task
//   metadata may carry `channels` (HIDH sensory/response channels — visual,
//   auditory, cognitive, psychomotor, verbal); display metadata today,
//   per-channel co-activation arithmetic is a later increment.
//
//   THE CHECKS (invRegister when present; directly callable always):
//     INV-16 (hard)     — a Cat/Haz claim rests on a typed assumption
//                         carrying a credited/uncredited pair that is not
//                         validated: the page shows the credited number but
//                         the uncredited lane is what holds.
//     INV-17 (advisory) — phase workload saturation: per-crewmember,
//                         per-phase time-sum of HF crew-task assumptions vs
//                         the 80% time-occupancy red line (HIDH §5.7.5.1,
//                         Parks & Boucek 1989, p.229) under DECLARED
//                         co-activation sets. Ledger arithmetic — no solver,
//                         no pilot model, no simulation. Runs only where a
//                         phase declares a response window; silent otherwise.
//
//   PRODUCTION PHASES (v0.4) — flightPhasesData rows are
//   { phase, altFrom…, duration, durationUnit } plus an OPTIONAL authored
//   `windowS` (HF response window, seconds — authored on the Flight Phases
//   tab). phasesNormalized() maps them to { id, name, windowS }; the phase
//   DURATION is exposure, never a response window — INV-17 refuses to infer
//   one from the other. Phase matching is case-insensitive.
//
// Grounding data (cited, applicability-tagged):
//   hf_reference_data.js — 298 HIDH presets (NASA/SP-2010-3407 Rev 1),
//   lazy-loaded by the HFA view's reference drawer.
//   Presets SEED estimates; they never fill a field. Two-lane throughout.
// ============================================================================
(function () {
    'use strict';

    // ------------------------------------------------------------ type pack
    // ids are stable; `label` matches the schema enum in config_data.js.
    const ASM_TYPES = [
        { id: 'hf', label: 'Human Factors',    verifies: 'HFA — task analysis · sim · workload' },
        { id: 'dz', label: 'Design',           verifies: 'analysis · CMA · test' },
        { id: 'rg', label: 'Regulatory',       verifies: 'MoC · issue paper' },
        { id: 'op', label: 'Operational',      verifies: 'ops substantiation · MEL' },
        { id: 'mx', label: 'Maintenance',      verifies: 'maintenance program (MSG-3)' },
        { id: 'en', label: 'Environmental',    verifies: 'environmental qualification' },
        { id: 'sw', label: 'Software',         verifies: 'DO-178C / DO-330' },
        { id: 'hw', label: 'Hardware',         verifies: 'DO-254' },
        { id: 'rd', label: 'Reliability data', verifies: 'data substantiation' }
    ];
    const TYPE_BY_LABEL = {};
    ASM_TYPES.forEach(t => { TYPE_BY_LABEL[t.label.toLowerCase()] = t.id; TYPE_BY_LABEL[t.id] = t.id; });
    // HIDH §5.7.5.1 (Parks & Boucek 1989), p.229 — cited constant, not invented.
    const TIME_OCCUPANCY_RED_LINE = 0.80;
    // Crew workload channels — a DELIBERATE SIMPLIFICATION, and labelled as one
    // after reading the source on 1 Aug 2026.
    //
    // The comment here used to read "HIDH sensory/response channels (§5.7,
    // workload channel decomposition)", which overclaimed. HIDH §5.7.4.2.3 names
    // seven resource channels, and they are not these five: IMPRINT's are visual,
    // auditory, TACTILE, cognitive, FINE MOTOR, GROSS MOTOR and VOICE RESPONSE.
    // This pack collapses fine/gross motor into "psychomotor", renames voice
    // response to "verbal", and omits tactile entirely.
    //
    // The five are kept — projects already carry authored values on them and a
    // migration would rewrite analyst judgements — but the citation is corrected,
    // because a five-item list presented as HIDH's seven is a claim the handbook
    // does not support. Anyone widening this later wants §5.7.4.2.3 (p.226) and a
    // data migration, not a one-line edit.
    const HF_CHANNELS = ['visual', 'auditory', 'cognitive', 'psychomotor', 'verbal'];

    // --------------------------------------------------------- store access
    // Same tolerant-global pattern as assumption_moat.js — read-only.
    function _acAsm()  { return (typeof acAssumptionsData !== 'undefined' ? acAssumptionsData : []) || []; }
    function _sysList(){ return (typeof systemsData !== 'undefined' ? systemsData : []) || []; }
    function _phases() { return (typeof flightPhasesData !== 'undefined' ? flightPhasesData : []) || []; }

    function _normType(v) {
        if (!v) return null;
        return TYPE_BY_LABEL[String(v).toLowerCase()] || null;
    }
    // Production vocabulary: Proposed → Validated → Verified. Verified is
    // validation PLUS verification — both read the credited lane.
    function isValidated(state) { return state === 'Validated' || state === 'Verified'; }
    function _list(v) {
        if (Array.isArray(v)) return v.filter(Boolean);
        return String(v == null ? '' : v).split(',').map(s => s.trim()).filter(Boolean);
    }
    function _normHf(h) {
        if (!h) return null;
        return {
            direction: h.direction ? String(h.direction).toLowerCase() : 'recovery',
            responsePhase: h.responsePhase || null,
            crewmember: h.crewmember || null,
            taskTimeS: (h.taskTimeS != null && h.taskTimeS !== '' && !isNaN(+h.taskTimeS)) ? +h.taskTimeS : null,
            taskTimeBasis: h.taskTimeBasis || null,
            // workloadBand was MISSING here until 1 Aug 2026. The panel authored it,
            // setHf persisted it onto the raw record, and this projection then threw
            // it away — so the band select always rendered unselected, the read-only
            // cell always showed a dash, and INV-HFW silently fell back to guessing a
            // band from the crew-effect PROSE while an authored one sat in the file.
            // A field that is captured and then dropped is worse than one that was
            // never offered: the analyst believes the judgement was recorded.
            workloadBand: h.workloadBand || null,
            coActivation: _list(h.coActivation),
            channels: _list(h.channels)
        };
    }

    function asmAllTyped() {
        const out = [];
        const push = (a, scope) => a && out.push({
            asmId: a.asmId,
            text: a.statement || a.text || '',
            state: a.state || 'Open',
            scope,
            type: _normType(a.type),
            typeLabel: a.type || null,
            credited: a.credited != null && a.credited !== '' ? a.credited : null,
            uncredited: a.uncredited != null && a.uncredited !== '' ? a.uncredited : null,
            hf: _normHf(a.hf)   // { direction, responsePhase, crewmember, taskTimeS, taskTimeBasis, coActivation[], channels[] }
        });
        _acAsm().forEach(a => push(a, 'Aircraft'));
        _sysList().forEach(s => (s.asm || []).forEach(a => push(a, s.name || s.id)));
        return out;
    }

    // ------------------------------------------------- the governing rule
    // Credited posture holds ONLY when validated (Validated | Verified).
    // Everything else reads the conservative lane. Computed, never stored.
    function effectivePosture(a) {
        if (!a) return null;
        return isValidated(a.state) ? (a.credited != null ? a.credited : null)
                                    : (a.uncredited != null ? a.uncredited : null);
    }

    // ------------------------------------------------- production phases
    // Maps whatever the phases store holds to { id, name, windowS }.
    // Dev/test rows already carry { id, windowS }; production rows carry
    // { phase, duration, durationUnit, windowS? }. The DURATION is exposure —
    // it is NEVER read as a response window. windowS is authored, in seconds.
    function phasesNormalized() {
        return _phases().map(p => {
            const id = (p.id != null && p.id !== '') ? p.id : (p.phase || '');
            const w = (p.windowS != null && p.windowS !== '') ? +p.windowS : NaN;
            return { id: id, name: p.name || p.phase || String(id),
                     windowS: (!isNaN(w) && w > 0) ? w : 0 };
        }).filter(p => p.id !== '');
    }
    function _phaseKey(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

    // ------------------------------------------------------------ HFA lane
    function hfaItems() {
        const items = [];
        asmAllTyped().filter(a => a.type === 'hf').forEach(a => {
            const dir = (a.hf && a.hf.direction) || 'recovery';
            const base = { asmId: a.asmId, state: a.state, direction: dir,
                           channels: (a.hf && a.hf.channels) || [],
                           closed: isValidated(a.state) };
            if (dir === 'recovery')
                items.push(Object.assign({ hfaId: 'HFA-' + a.asmId + '-R',
                    work: 'Verify crew action: ' + a.text,
                    method: 'task analysis + time measurement' }, base));
            else if (dir === 'non-recovery')
                items.push(Object.assign({ hfaId: 'HFA-' + a.asmId + '-N',
                    work: 'Challenge pessimism: is "' + a.text + '" actually recoverable?',
                    method: 'task analysis + recovery study' }, base));
            else if (dir === 'workload')
                items.push(Object.assign({ hfaId: 'HFA-' + a.asmId + '-W',
                    work: 'Substantiate task time & allocation: ' + a.text,
                    method: 'workload assessment (HIDH §5.7)' }, base));
            // PREVENTION WAS MISSING UNTIL 1 Aug 2026, and the chain had no else.
            //
            // A prevention-direction assumption credits the crew with stopping the
            // failure condition ARISING — a loadmaster checking a load sheet, a PM
            // checking a door latch — rather than recovering from it once it has.
            // It is a credited safety task like any other, and the shipped Aeolus
            // HL-1 showcase authors three of them. Measured on that demo: six
            // HF-typed assumptions, THREE validation items. The three with
            // direction 'prevention' fell off the end of the if/else chain and
            // produced nothing at all — no work item, no method, no trace. The HFA
            // lane simply showed a shorter list, which looks like a shorter list.
            else if (dir === 'prevention')
                items.push(Object.assign({ hfaId: 'HFA-' + a.asmId + '-P',
                    work: 'Substantiate that the crew reliably performs the preventive task: ' + a.text,
                    method: 'task analysis + procedure & training substantiation' }, base));
            // NO SILENT DROP. An unrecognised direction is a data problem, and the
            // one thing it must not do is disappear: the assumption is still a
            // credited crew task and still owes validation work.
            else
                items.push(Object.assign({ hfaId: 'HFA-' + a.asmId + '-X',
                    work: 'Classify this crew credit, then substantiate it: ' + a.text,
                    method: 'direction "' + dir + '" is not one of prevention / recovery / non-recovery / workload — set it on the assumption',
                    unclassified: true }, base));
        });
        return items;
    }

    // --------------------------------------------------------------- INV-16
    function inv16() {
        const byId = new Map(asmAllTyped().map(a => [a.asmId, a]));
        const fails = [];
        const scan = (fhaRows, scope) => (fhaRows || []).forEach(f => {
            if (!f || !/^(Catastrophic|Hazardous)$/i.test(f.severity || '')) return;
            (f.assumptionIds || []).forEach(id => {
                const a = byId.get(id);
                if (a && a.type && a.credited != null && a.uncredited != null && !isValidated(a.state))
                    fails.push({ scope, fcId: f.fcId || '', severity: f.severity,
                        asmId: id, holds: effectivePosture(a),
                        detail: scope + ' FC ' + (f.fcId || '') + ' [' + f.severity + '] rests on ' + id +
                                ' (' + a.state + ') — effective posture: ' + effectivePosture(a) });
            });
        });
        scan((typeof acFhaData !== 'undefined' ? acFhaData : []), 'Aircraft');
        _sysList().forEach(s => scan(s.fha, s.name || s.id));
        return { checked: byId.size, fails };
    }

    // --------------------------------------------------------------- INV-17
    function inv17() {
        const findings = [];
        const tasks = asmAllTyped().filter(a =>
            a.type === 'hf' && a.hf && a.hf.taskTimeS != null && a.hf.responsePhase && a.hf.crewmember);
        phasesNormalized().forEach(ph => {
            const win = ph.windowS || 0;
            if (!win) return;
            // 3 Sep 2026 — a credited task may span phases ("Takeoff, Climb") or say "All
            // phases"; it loads every phase it names (the conservative reading).
            const inPhase = tasks.filter(t => {
                const keys = String(t.hf.responsePhase).split(',').map(_phaseKey).filter(Boolean);
                return keys.includes('all phases') || keys.includes(_phaseKey(ph.id)) || keys.includes(_phaseKey(ph.name));
            });
            const crews = [...new Set(inPhase.map(t => t.hf.crewmember))];
            crews.forEach(cm => {
                const mine = inPhase.filter(t => t.hf.crewmember === cm);
                const scenarios = new Map([['baseline', mine.filter(t => (t.hf.coActivation || []).includes('always'))]]);
                mine.forEach(t => (t.hf.coActivation || []).forEach(s => {
                    if (s === 'always' || scenarios.has(s)) return;
                    scenarios.set(s, mine.filter(x => (x.hf.coActivation || []).includes(s) ||
                                                      (x.hf.coActivation || []).includes('always')));
                }));
                scenarios.forEach((set, scenario) => {
                    if (!set.length) return;
                    const demandS = set.reduce((s, t) => s + t.hf.taskTimeS, 0);
                    const u = demandS / win;
                    if (u > TIME_OCCUPANCY_RED_LINE) findings.push({
                        phase: ph.id, crewmember: cm, scenario, demandS, windowS: win,
                        utilization: +u.toFixed(2), redLine: TIME_OCCUPANCY_RED_LINE,
                        basis: 'HIDH §5.7.5.1 (Parks & Boucek 1989), p.229 — 80% time occupancy',
                        tasks: set.map(t => t.asmId),
                        exits: ['prove the tasks fit (HFA evidence)',
                                'offload a task (re-allocate / automate)',
                                'verify the co-activation assumption']
                    });
                });
            });
        });
        return { checked: tasks.length, findings };
    }

    // -------------------------------------------------- invariant registry
    // FIXED 20 Jul 2026: both of these were DEAD — they used `kind:`/`title:`
    // where invRegister requires `sev:`/`name:`, so the validator rejected them
    // and neither ever registered; they ALSO collided with the working INV-16
    // (MBSA schema) and INV-17 (CMA ownership). Renumbered to free ids INV-35/36
    // and given the correct field names. See regression_invariant_registry.
    if (typeof invRegister === 'function') {
        invRegister({ id: 'INV-35', sev: 'hard',
            name: 'HF: no credited posture rests on an unvalidated assumption',
            run: () => { const r = inv16(); return { checked: r.checked, fails: r.fails.map(f => f.detail) }; } });
        invRegister({ id: 'INV-36', sev: 'advisory',
            name: 'HF: phase workload within the 80% saturation red line (HIDH §5.7.5.1)',
            run: () => { const r = inv17(); return { checked: r.checked, fails: r.findings.map(f =>
                f.phase + ' · ' + f.crewmember + ' · ' + f.scenario + ': ' + f.demandS + 's/' + f.windowS + 's (' +
                Math.round(f.utilization * 100) + '%)') }; } });
    }

    // ------------------------------------------------------------- exports
    const API = { ASM_TYPES, TIME_OCCUPANCY_RED_LINE, HF_CHANNELS, asmAllTyped, effectivePosture,
                  isValidated, phasesNormalized, hfaItems, inv16, inv17 };
    if (typeof window !== 'undefined') window.HF_ASSUMPTIONS = API;
    if (typeof module !== 'undefined') module.exports = API;
})();
