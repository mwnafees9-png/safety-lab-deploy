// 13 Sep 2026 (R19 step 3): native alert/confirm/prompt replaced by the app's own dialogs (slAlert/slConfirm/slPrompt) and typed toasts; see tests/regression_native_dialogs.test.js
// ============================================================================
// program_plan.js — v1.1 — THE PLAN DRIVES THE NAV.
//
// The Safety Program Plan stops being a record and becomes the driver: every
// analysis LANE in the catalogue below has a switch in the plan, and the
// sidebar renders from it. A lane that isn't in your program isn't in your
// nav. The SSPP and the tool state cannot diverge, because the nav is a
// projection of the plan.
//
// DOCTRINE:
//   · Data is NEVER deleted on deselect — the tab hides, the stores stay,
//     re-enabling restores everything. Reversible, always.
//   · Turning OFF a lane your certification basis EXPECTS while it holds
//     authored data is a signed tailoring opt-out: rationale + signature,
//     recorded to projectConfig.safetyProgramPlan.tailoredLanes. A silent
//     deselection is a hole, not a decision — the core THROWS without both.
//   · Grandfathering: projects saved before this module have no scope
//     record. They get every legacy lane ON and every opt-in lane OFF —
//     nothing vanishes from under a returning user.
//   · New projects derive their default program from the certification
//     basis (the intake wizard records it; initScope applies it).
//   · v0.1 gates eight lanes (FTA, Markov, Event Trees, PRA, ZSA, CMA, HFA,
//     STPA). The spine (functions, FHA, requirements, assumptions) and all
//     infrastructure tabs are NOT gated — a program without hazard
//     identification isn't a program. Additive: the catalogue grows.
//
// Display-lane + author split: applyNav()/renderScopeSection() only touch
// DOM visibility; ALL plan writes go through setLane()/initScope() (the
// author adapter of this module), which schedule autosave.
// Persistence rides projectConfig.safetyProgramPlan (already in the project
// payload) — no new top-level store.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _pc() { return (typeof projectConfig !== 'undefined' && projectConfig) ? projectConfig : null; }
    function _len(x) { return Array.isArray(x) ? x.length : 0; }

    // ------------------------------------------------------------ the catalogue
    // expected: which certification bases preselect the lane for NEW projects.
    // optIn lanes default OFF everywhere (and OFF under grandfathering) — they
    // enter a program only by explicit selection on the SPP page.
    const BASES = ['Part 25', 'Part 23', 'Part 27', 'Part 29', 'sc-vtol', 'Part 33', 'Part 450', 'Part 107', 'specific-sora'];
    // group: 'safety' | 'ram' | 'hf' — the Program Planning page renders one
    // section per group. RAM lanes COMPOSE with the existing tier gating
    // (ram-proplus): plan-off hides; plan-on restores whatever the tier had.
    const GROUPS = [
        { id: 'safety', label: 'Safety analyses' },
        { id: 'ram',    label: 'RAM — reliability & maintainability' },
        { id: 'hf',     label: 'Human factors' },
        // AI/ML learning assurance is its own axis, not a safety sub-lane: it
        // assures somebody else's ML constituent rather than analysing our own
        // failure conditions. Opt-in and off by default — no certification basis
        // yet requires it, and ARP6983 / ED-324 is not an accepted means of
        // compliance on its own.
        { id: 'ml',     label: 'AI/ML learning assurance' }
    ];
    // ---------------------------------------------------------------------------
    // APPENDIX LETTERS — CORRECTED 1 Aug 2026 against SAE ARP4761A (2023) itself.
    //
    // Six lanes carried the appendix letters from ARP4761 (1996) while labelling
    // themselves 4761A. They were correct for the superseded revision and were
    // never moved when the lane names were updated, so the product was citing a
    // withdrawn document under the current one's name. What A actually says:
    //
    //     A AFHA   B PASA   C SFHA   D PSSA   E SSA    F ASA
    //     G FTA    H DD     I MA     J FMEA   K ZSA    L PRA
    //     M CMA    N MBSA   O CEA    P FDAL/IDAL       Q worked example
    //
    // So FTA moved D→G, Markov D.7→I, PRA I→L, ZSA H→K, and CMA was citing K/M
    // where K is now Zonal. Event trees are not in 4761A at all — the string
    // "event tree" appears zero times in the document — so that lane no longer
    // claims a clause it cannot have.
    //
    // These strings are user-visible: they render on the Program Planning page
    // and print into the SSPP. A wrong clause reference in a certification
    // artifact is not cosmetic — a reviewer follows it and finds Preliminary
    // System Safety Assessment where they were promised Fault Tree Analysis.
    //
    // regression_standards_citations.test.js pins the whole map.
    // ---------------------------------------------------------------------------
    const CATALOGUE = [
        { id: 'fta',    group: 'safety', name: 'Fault Tree Analysis (FTA / BDD-exact)', std: 'ARP4761A App G',
          snav: ['snav-fta'],    tabs: ['fta'],
          expected: ['Part 25', 'Part 23', 'Part 27', 'Part 29', 'sc-vtol', 'Part 33'] },
        // 23 Aug 2026 — Markov & Event Trees reclassified to the R&M lane
        // (Waqas: "RAM to contain markov and anything reliability related").
        // 23 Aug 2026 (3) — the tree family became TABS under Fault Trees
        // (prove_tabs.js, render-gated per lane); no rail rows to hide.
        { id: 'markov', group: 'ram', name: 'Markov attachments', std: 'ARP4761A App I',
          snav: [], tabs: ['markov'], expected: [] },
        { id: 'eta',    group: 'ram', name: 'Event Trees', std: 'Event tree analysis — NOT an ARP4761A method',
          snav: [],    tabs: ['eta'], expected: [] },
        { id: 'pra',    group: 'safety', name: 'CCA · Particular Risks Analysis', std: 'ARP4761A App L',
          snav: ['snav-pra'],    tabs: ['pra'],
          expected: ['Part 25', 'Part 23', 'Part 27', 'Part 29', 'sc-vtol', 'Part 33'] },
        { id: 'zsa',    group: 'safety', name: 'CCA · Zonal Safety Analysis', std: 'ARP4761A App K',
          snav: ['snav-zsa'],    tabs: ['zsa'],
          expected: ['Part 25', 'Part 23', 'Part 27', 'Part 29', 'sc-vtol', 'Part 33'] },
        { id: 'cma',    group: 'safety', name: 'CCA · Common Mode Analysis', std: 'ARP4761A App M',
          snav: ['snav-cma'],    tabs: ['cma'],
          expected: ['Part 25', 'Part 23', 'Part 27', 'Part 29', 'sc-vtol', 'Part 33'] },
        // 23 Aug 2026 — CEA gated (Waqas: "default off in the program planning and
        // hidden"). Was ungated (always visible) since birth; now the same opt-in
        // mechanic as STPA: off under every basis, off under grandfathering,
        // declared on the plan page. Authored cascade data is hidden, not harmed.
        { id: 'cea',    group: 'safety', name: 'Cascading effects & fault injection', std: 'fault propagation — CCA-adjacent',
          snav: ['snav-cea'],    tabs: ['cea'], optIn: true, expected: [] },
        { id: 'stpa',   group: 'safety', name: 'STPA — system lane (interaction hazards)', std: 'SAE J3307 · complements ARP4761A',   // 8 Aug 2026: was 'STPA Handbook' — engine, KB and papers all cite J3307; one provenance story
          snav: ['snav-stpa'],   tabs: ['stpa'], optIn: true, expected: [] },
        // ---- RAM (composes with the ram-proplus tier gating) ----------------
        { id: 'ram-reliability', group: 'ram', name: 'Reliability engineering (prediction · FRACAS · RBD · life data · allocation)', std: 'MIL-HDBK-217F · Weibull · Crow-AMSAA',
          snav: ['snav-ram-rel', 'snav-ram-predict', 'snav-ram-rbd', 'snav-ram-weibull', 'snav-ram-growth', 'snav-ram-alloc', 'snav-ram-tol', 'snav-rbd-mc', 'snav-rel-frameworks'],
          tabs: ['ram-rel', 'ram-predict', 'ram-rbd', 'ram-weibull', 'ram-growth', 'ram-alloc', 'ram-tol', 'rbd-mc', 'rel-frameworks'], expected: [] },
        { id: 'ram-swrel', group: 'ram', name: 'Software reliability', std: 'IEEE 1633 lineage',
          snav: ['snav-swrel'], tabs: ['swrel'], expected: [] },
        { id: 'ram-sneak', group: 'ram', name: 'Sneak circuit analysis', std: 'NAVSO P-3634 lineage',
          snav: ['snav-sneak'], tabs: ['sneak'], expected: [] },
        { id: 'ram-lcc', group: 'ram', name: 'Life-cycle cost', std: 'program economics',
          snav: ['snav-lcc'], tabs: ['lcc'], expected: [] },
        { id: 'ram-mx', group: 'ram', name: 'Maintainability (MTTR/MDT · PM optimization · testability)', std: 'MIL-HDBK-472 lineage',
          snav: ['snav-ram-mx', 'snav-ram-pmopt', 'snav-ram-test'], tabs: ['ram-mx', 'ram-pmopt', 'ram-test'], expected: [] },
        { id: 'ram-msg3', group: 'ram', name: 'MSG-3 scheduled maintenance (systems · structures · zonal · L/HIRF)', std: 'MSG-3 Vol 1/2',
          snav: ['snav-ram-msg3', 'snav-msg3x'], tabs: ['ram-msg3', 'msg3x'], expected: [] },
        { id: 'ram-mmel', group: 'ram', name: 'Dispatch relief (MMEL / TLD)', std: 'MMEL policy · CS-MMEL',
          snav: ['snav-mmel'], tabs: ['mmel'], expected: [] },
        // ---- Human factors ---------------------------------------------------
        { id: 'mlas',   group: 'ml', name: 'AI/ML learning assurance (MLC · ODD · data management)',
          std: 'ARP6983 / ED-324 (SAE G-34 · EUROCAE WG-114)',
          snav: ['snav-mlas'], tabs: ['mlas'], optIn: true, expected: [] },
        // 30 Aug 2026 — label refreshed for the HF lane expansion (Waqas: "human
        // factors is not just about assumptions"): the lane now spans its own
        // analyses; the typed-assumption register is the bridge into the
        // safety argument, one angle among them.
        { id: 'hfa',    group: 'hf', name: 'Human Factors Analysis (allocation · error analysis · alerting · task ledger · ergonomics · typed-assumption bridge)', std: 'HIDH · CS 25.1302 · 25.1322 · NUREG/CR-1278 · ISO 9241',
          snav: ['snav-hfa'],    tabs: ['hfa'],
          expected: ['Part 25', 'sc-vtol'] },
        // ---- Sub-analyses (phase 1): gate independently; hidden WITH their parent lane.
        //      subLane:true => defaults ON (these were always-shown before gating).
        { id: 'bowtie',   group: 'safety', parent: 'fta',    subLane: true, name: 'Bow-Tie (barrier view)', std: 'barrier analysis · compiled from the fault/event tree',
          snav: [],   tabs: ['bowtie'],   expected: [] },   // 23 Aug (3): a Fault-trees TAB now
        { id: 'routing',  group: 'safety', parent: 'zsa',    subLane: true, name: 'Routing / Zone-Spanning', std: 'ZSA sub-analysis',
          snav: [],  tabs: ['routing'],  expected: [] },   // 26 Aug: a ZSA TAB now (CCA consolidation)
        { id: 'hfa-task', group: 'hf',     parent: 'hfa',    subLane: true, name: 'Task Analysis', std: 'HFA sub-analysis',
          snav: ['snav-hfa-task'], tabs: ['hfa-task'], expected: [] },
        { id: 'hfa-ergo', group: 'hf',     parent: 'hfa',    subLane: true, name: 'Ergonomics', std: 'HFA sub-analysis',
          snav: ['snav-hfa-ergo'], tabs: ['hfa-ergo'], expected: [] },
        // 30 Aug 2026 — HF's own analyses (hf_analyses.js) join the plan record
        // as hfa sub-lanes: default ON, gate independently, hide with the parent.
        { id: 'hfa-tid',    group: 'hf', parent: 'hfa', subLane: true, name: 'Task Identification', std: 'HFA sub-analysis — task enumeration from the operating procedures',
          snav: ['snav-hfa-tid'],    tabs: ['hfa-tid'],    expected: [] },
        { id: 'hfa-alloc',  group: 'hf', parent: 'hfa', subLane: true, name: 'Function Allocation', std: 'HFA sub-analysis — crew / automation / shared',
          snav: ['snav-hfa-alloc'],  tabs: ['hfa-alloc'],  expected: [] },
        { id: 'hfa-hea',    group: 'hf', parent: 'hfa', subLane: true, name: 'Human Error Analysis', std: 'HFA sub-analysis — NUREG/CR-1278 discrete error modes',
          snav: ['snav-hfa-hea'],    tabs: ['hfa-hea'],    expected: [] },
        { id: 'hfa-alerts', group: 'hf', parent: 'hfa', subLane: true, name: 'Crew Alerting', std: 'HFA sub-analysis — 25.1322 inventory',
          snav: ['snav-hfa-alerts'], tabs: ['hfa-alerts'], expected: [] },
        { id: 'hfa-cd',     group: 'hf', parent: 'hfa', subLane: true, name: 'Controls & Displays', std: 'HFA sub-analysis — §25.1302 / AC 25.1302-1 controls & displays evaluation',
          snav: ['snav-hfa-cd'],     tabs: ['hfa-cd'],     expected: [] },
        { id: 'hfa-sa',     group: 'hf', parent: 'hfa', subLane: true, name: 'Situation Awareness', std: 'HFA sub-analysis — §25.1302(a) / AC 25.1302-1 situation-awareness assessment',
          snav: ['snav-hfa-sa'],     tabs: ['hfa-sa'],     expected: [] },

        { id: 'hfa-mfc',    group: 'hf', parent: 'hfa', subLane: true, name: 'Minimum Flight Crew', std: 'HFA sub-analysis — §25.1523 / Appendix D workload determination',
          snav: ['snav-hfa-mfc'],    tabs: ['hfa-mfc'],    expected: [] },
        { id: 'ram-lora', group: 'ram',    parent: 'ram-mx', subLane: true, name: 'LORA — Level of Repair', std: 'maintainability sub-analysis',
          snav: ['snav-ram-lora'], tabs: ['ram-lora'], expected: [] },
        // ---- Phase-1 follow-up: the four deferred sub-analyses, now placed. ----
        { id: 'ccmr',     group: 'safety', parent: 'fta',    subLane: true, name: 'Latent failures (CCMR)', std: 'candidate cert-maintenance · latent-failure sweep on the trees',
          snav: ['snav-ccmr'],     tabs: ['ccmr'],     expected: [] },
        // NAMING: 'ffmea' / 'ppfmea', not 'fmea-func' / 'fmea-pp'. A catalogue lane
        // id may not contain fha / func / req / asm — regression_program_plan
        // enforces that the SPINE (aircraft functions, FHA, requirements,
        // assumptions) can never become a gateable lane. 'fmea-func' tripped it by
        // substring rather than by meaning, and the right response to a blunt
        // guard protecting something that important is to move, not to file it
        // down. FFMEA and PPFMEA are the field's own abbreviations anyway.
        // FMEA was never in this catalogue — it lived only on the spine, so a
        // programme could not say WHICH FMEA it was doing. ARP4761A App J defines
        // two, with different worksheets (Table J1 functional, Table J2
        // piece-part) and different reasons for existing, so they are two lanes.
        //
        // Functional is basis-expected: J.3.2 says functional FMEAs are typically
        // performed to support the safety analysis effort.
        //
        // Piece-part is OPT-IN, and that default comes from the standard rather
        // than from us: J.3.2 says piece-part FMEAs are performed as necessary to
        // refine a failure rate, typically when the more conservative functional
        // rates will not let the system meet the FTA probability budget. A
        // programme that has not hit that wall has no reason to be doing one, and
        // opt-in is exactly how this catalogue expresses "only when you need it".
        { id: 'ffmea', group: 'safety', name: 'Functional FMEA', std: 'ARP4761A App J · Table J1',
          snav: ['snav-fmea'], tabs: ['fmea'],
          expected: ['Part 25', 'Part 23', 'Part 27', 'Part 29', 'sc-vtol', 'Part 33'] },
        { id: 'ppfmea',   group: 'safety', name: 'Piece-Part (Hardware) FMEA', std: 'ARP4761A App J · Table J2',
          snav: ['snav-fmea'], tabs: ['fmea'], optIn: true, expected: [] },
        { id: 'fmes',     group: 'safety', parent: 'fta',    subLane: true, name: 'Failure Modes Summary (FMES)', std: 'failure-mode rollup feeding the trees',
          // 23 Aug 2026 — the FMES rail row is gone (it lives in each system
          // folder now); the lane still gates the fmes TAB.
          snav: [],     tabs: ['fmes'],     expected: [] },
        { id: 'ipledger', group: 'safety', parent: 'cma',    subLane: true, name: 'Independence Principle Ledger', std: 'independence claims · common-mode verification',
          snav: [], tabs: ['ipledger'], expected: [] },   // 26 Aug: a CMA TAB now (CCA consolidation)
        // SORA: a standalone compliance thread (no analysis parent).
        // 23 Aug 2026 — BASIS-TIED (Waqas: "sora thread should be hidden, only
        // visible when using sora"). basisLane => shown exactly when the
        // program's certification basis is in `expected`; a signed tailoring can
        // still remove it there. The old subLane era materialized sora:true into
        // every scope record — basisLane deliberately ignores a stale true, so
        // no record can resurrect the thread on a non-SORA basis.
        { id: 'sora',     group: 'safety', basisLane: true, name: 'SORA Thread (operational risk)', std: 'JARUS SORA · UAS / vtol operations',
          // 23 Aug 2026 (2) — the Prove group moved to the strip; the SORA
          // pill is render-gated there (gateLane), so no rail row to hide.
          snav: [], tabs: ['sora-thread'], expected: ['Part 107', 'specific-sora'] }
    ];
    const _byId = {}; CATALOGUE.forEach(l => { _byId[l.id] = l; });
    const _byTab = {}; CATALOGUE.forEach(l => l.tabs.forEach(t => { _byTab[t] = l; }));

    // --------------------------------------------------------------- data counts
    // Honest counts per lane — what would be "stranded" (never deleted, just
    // hidden) if the lane left the program. All reads defensive: this module
    // must load in any order and in node.
    function laneData(id) {
        try {
            switch (id) {
                case 'fta':    return (typeof ftaPages !== 'undefined' ? (ftaPages || []) : []).filter(p => p && p.root).length;
                case 'markov': { const pc = _pc(); return pc ? _len(pc.markovModels) : 0; }
                case 'eta':    return (typeof etaData !== 'undefined') ? _len(etaData) : 0;
                case 'pra':    return (typeof praData !== 'undefined') ? _len(praData) : 0;
                case 'zsa':    return (typeof zsaData !== 'undefined') ? _len(zsaData) : 0;
                case 'cma':    return (typeof cmaData !== 'undefined') ? _len(cmaData) : 0;
                case 'hfa':    return (typeof HF_ASSUMPTIONS !== 'undefined' && HF_ASSUMPTIONS.asmAllTyped)
                                    ? HF_ASSUMPTIONS.asmAllTyped().filter(a => a && a.type).length : 0;
                case 'stpa':   { const d = (typeof stpaData !== 'undefined' && stpaData) ? stpaData : null;
                                 if (!d) return 0;
                                 const cs = d.cs || {};
                                 return _len(cs.controllers) + _len(cs.processes) + _len(cs.actions) +
                                        _len(cs.feedbacks) + Object.keys(d.dispositions || {}).length; }
                // ---- RAM ---------------------------------------------------
                // Added 1 Aug 2026. Seventeen lanes fell through to `default: 0`,
                // so the Program Planning page and the SSPP report both told an
                // engineer that turning off MSG-3 would strand nothing while
                // forty MSIs sat in the store. The data was never at risk — it
                // is never deleted — but the SENTENCE was false, and a tailoring
                // decision made against a false count is not a decision.
                case 'ram-reliability': {
                    const pc = _pc(); if (!pc) return 0;
                    const r = pc.ram || {}, ra = pc.relAnalytics || {}, td = pc.tolDerate || {}, fw = pc.relFw || {};
                    return _len(r.field) + _len((r.predict || {}).rows) + _len((pc.rbd || {}).models) +
                           _len(ra.lifeData) + _len(ra.growth) + _len(ra.spares) + (ra.alloc ? 1 : 0) +
                           _len(td.stacks) + _len(td.derate) + _len((pc.rbdMc || {}).cases) +
                           _len(fw.entries) + _len(fw.accel);
                }
                // ram.tasks is the maintainability store; ram-lora owns mxAnalytics.lora.
                // Kept disjoint on purpose — a shared term would double-count the
                // sub-lane into its parent and inflate both.
                case 'ram-mx':    { const pc = _pc(); return pc ? _len((pc.ram || {}).tasks) : 0; }
                case 'ram-lora':  { const pc = _pc(); return pc ? _len((pc.mxAnalytics || {}).lora) : 0; }
                case 'ram-swrel': { const pc = _pc(); return pc ? _len((pc.swrel || {}).cscis) : 0; }
                case 'ram-lcc':   { const pc = _pc(); return pc ? _len((pc.lcc || {}).items) : 0; }
                case 'ram-mmel':  { const pc = _pc(); return pc ? _len((pc.mmel || {}).items) : 0; }
                case 'ram-msg3':  {
                    const pc = _pc(); if (!pc) return 0;
                    const x = pc.msg3x || {};
                    return _len((pc.msg3 || {}).msis) + _len(x.ssis) + _len(x.lhirf) +
                           Object.keys(x.zonesDone || {}).length;
                }
                // The sneak CANDIDATES are mined from interfaces and resources —
                // only the dispositions are authored, so only they are counted.
                case 'ram-sneak': { const pc = _pc(); return pc ? Object.keys((pc.sneak || {}).dispositions || {}).length : 0; }
                // ---- the rest ----------------------------------------------
                case 'routing':   return (typeof routingData !== 'undefined') ? _len(routingData) : 0;
                case 'bowtie':    { const pc = _pc(); return pc ? _len(pc.bowties) : 0; }
                case 'sora':      { const pc = _pc(); return (pc && pc.sora && typeof pc.sora === 'object') ? 1 : 0; }
                case 'mlas':      {
                    const d = (typeof mlData !== 'undefined' && mlData) ? mlData : null;
                    if (!d) return 0;
                    // capture[] is the AI correction buffer, not authored content.
                    return _len(d.constituents) + _len(d.odd) + _len(d.datasets) + _len(d.monitors);
                }
                case 'hfa-task':  return (typeof HF_ASSUMPTIONS !== 'undefined' && HF_ASSUMPTIONS.asmAllTyped)
                                    ? HF_ASSUMPTIONS.asmAllTyped().filter(a => a && a.type === 'hf' && a.hf &&
                                        (a.hf.taskTimeS != null || a.hf.responsePhase || a.hf.crewmember)).length : 0;
                // DERIVED LANES RETURN 0 ON PURPOSE — and it is not a gap.
                //
                // laneData answers exactly one question: how much authored work
                // would be STRANDED if this lane left the program. CCMR, FMES and
                // the Independence Ledger author nothing — they are recomputed on
                // every read from the fault trees and the FMEA rows. Turning them
                // off strands nothing, so 0 is the true answer and the tailoring
                // sign-off gate correctly does not fire.
                //
                // Their OUTPUT is still worth showing, and next_step.js shows it —
                // but under its own heading, because output is not work in
                // progress and must never be counted as evidence that a lane has
                // been started. hfa-ergo has no store at all: it is a live ISO
                // 9241 calculator whose inputs are transient DOM fields.
                case 'ccmr': case 'fmes': case 'ipledger': case 'hfa-ergo': return 0;
                default: return 0;
            }
        } catch (_) { return 0; }
    }

    // ------------------------------------------------------------------ the plan
    function _store() {
        const pc = _pc();
        if (!pc) return null;
        if (!pc.safetyProgramPlan) pc.safetyProgramPlan = { slots: {}, notes: '' };
        return pc.safetyProgramPlan;
    }
    function scope() {
        const s = _store();
        return (s && s.scope && typeof s.scope === 'object') ? s.scope : null;
    }
    function tailoring() {
        const s = _store();
        return (s && Array.isArray(s.tailoredLanes)) ? s.tailoredLanes : [];
    }
    // Basis strings arrive in two dialects: the wizard writes 'Part 23' while
    // live project files carry 'part-23' (the K350 showcase taught us this the
    // hard way). Normalize BOTH into the catalogue's canonical form — an
    // unrecognized basis passes through unchanged and simply matches nothing.
    const _BASIS_CANON = { part25: 'Part 25', part23: 'Part 23', part27: 'Part 27', part29: 'Part 29',
        scvtol: 'sc-vtol', part33: 'Part 33', part450: 'Part 450', part107: 'Part 107', specificsora: 'specific-sora' };
    function _normBasis(b) {
        const k = String(b || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return _BASIS_CANON[k] || String(b || '');
    }
    function basisNow() {
        const pc = _pc();
        return _normBasis((pc && pc.regulation) ? pc.regulation : 'Part 25');
    }
    function isExpected(id, basis) {
        const l = _byId[id];
        return !!(l && l.expected.indexOf(_normBasis(basis) || basisNow()) >= 0);
    }
    function defaultsFor(basis) {
        const b = _normBasis(basis);
        const out = {};
        CATALOGUE.forEach(l => { out[l.id] = l.basisLane ? (l.expected.indexOf(b) >= 0) : l.subLane ? true : (l.optIn ? false : (l.expected.indexOf(b) >= 0)); });
        return out;
    }
    // Grandfather rule: no scope record → every legacy lane ON, opt-in lanes OFF.
    function laneOn(id) {
        const l = _byId[id];
        if (!l) return true;                    // unknown tab — never gate what we don't own
        const s = scope();
        // Basis-tied lanes (SORA): the certification basis decides. An explicit
        // signed s[id]===false still tailors it out ON a SORA basis; a stale
        // s[id]===true from the subLane era never shows it on any other basis.
        if (l.basisLane) return isExpected(id) && (!s || s[id] !== false);
        if (!s) return !l.optIn;
        return s[id] !== false && (s[id] === true || !l.optIn);
    }

    // ------------------------------------------------------- author adapter
    // The ONLY writes this module makes. Refusal over repair: a basis-expected
    // lane with authored data does not leave the program without rationale +
    // signature — the throw IS the feature.
    function _save() {
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
    }
    function initScope(basis) {
        const s = _store();
        if (!s) throw new Error('program plan: no projectConfig to write to');
        s.scope = defaultsFor(basis || basisNow());
        if (!Array.isArray(s.tailoredLanes)) s.tailoredLanes = [];
        _save();
        applyNav();
        return s.scope;
    }
    function _ensureScope() {
        const s = _store();
        if (!s) throw new Error('program plan: no projectConfig to write to');
        if (!s.scope || typeof s.scope !== 'object') {
            // Materialize the grandfather rule the first time anyone edits scope.
            s.scope = {};
            CATALOGUE.forEach(l => { s.scope[l.id] = !l.optIn; });
        }
        if (!Array.isArray(s.tailoredLanes)) s.tailoredLanes = [];
        return s;
    }
    function setLane(id, on, opts) {
        const l = _byId[id];
        if (!l) throw new Error('program plan: unknown lane "' + id + '"');
        opts = opts || {};
        const s = _ensureScope();
        if (on) {
            s.scope[id] = true;
            // Re-enabling clears the lane's tailoring entry to history (kept, flagged).
            s.tailoredLanes.forEach(t => { if (t.laneId === id && !t.cleared) t.cleared = true; });
        } else {
            const needsSignoff = isExpected(id) && laneData(id) > 0;
            if (needsSignoff) {
                const rat = String(opts.rationale || '').trim();
                const sig = String(opts.sig || '').trim();
                if (rat.length < 10 || !sig) {
                    throw new Error('program plan: "' + l.name + '" is expected under ' + basisNow() +
                        ' and holds ' + laneData(id) + ' authored item(s) — removing it needs a rationale (≥10 chars) and a signature. ' +
                        'A silent deselection is a hole, not a decision.');
                }
                s.tailoredLanes.push({ laneId: id, rationale: rat, sig: sig, at: new Date().toISOString(), basis: basisNow() });
            }
            s.scope[id] = false;   // data untouched — hidden, not harmed
        }
        _save();
        applyNav();
        return s.scope[id];
    }

    // ------------------------------------------------------------- display lane
    // Save-and-restore hiding: when the plan hides an item we remember what its
    // display WAS (the RAM items are also tier-gated via ram-proplus, and a
    // plan-ON must never un-hide what the tier hides). Our marker rides
    // data-pp-hidden; restore puts back the exact previous inline value.
    function applyNav() {
        if (typeof document === 'undefined') return;
        CATALOGUE.forEach(l => {
            const on = laneOn(l.id) && (!l.parent || laneOn(l.parent));
            l.snav.forEach(sid => {
                const el = document.getElementById(sid);
                if (!el) return;
                // snav-fta is a <summary> — hide its whole <details> group so the
                // subtree (page list) goes with it.
                const target = (el.tagName === 'SUMMARY' && el.parentElement) ? el.parentElement : el;
                if (on) {
                    if (target.dataset.ppHidden === '1') {
                        target.style.display = target.dataset.ppPrev || '';
                        delete target.dataset.ppHidden;
                        delete target.dataset.ppPrev;
                    }
                } else if (target.dataset.ppHidden !== '1') {
                    target.dataset.ppPrev = target.style.display || '';
                    target.dataset.ppHidden = '1';
                    target.style.display = 'none';
                }
            });
        });
        _sweepEmptyCategories();
    }

    // A category whose every item is hidden must hide WITH its items — an
    // empty expandable header is a hole, not a menu (found live 20 Jul:
    // "System lane" holds only STPA, which is opt-in-off by default, leaving
    // an empty dropdown). Same save/restore discipline as the items: display
    // is stashed, never blanked, and the header returns the moment any lane
    // in it comes back. Covers ANY hiding mechanism (plan, tier) because it
    // reads computed item display, not our own bookkeeping.
    function _sweepEmptyCategories() {
        try {
            document.querySelectorAll('details.asb-cat').forEach(cat => {
                const items = cat.querySelectorAll('.asb-item');
                if (!items.length) return;
                const allHidden = [...items].every(i => i.style.display === 'none');
                if (allHidden) {
                    if (cat.dataset.ppcatHidden !== '1') {
                        cat.dataset.ppcatPrev = cat.style.display || '';
                        cat.dataset.ppcatHidden = '1';
                        cat.style.display = 'none';
                    }
                } else if (cat.dataset.ppcatHidden === '1') {
                    cat.style.display = cat.dataset.ppcatPrev || '';
                    delete cat.dataset.ppcatHidden;
                    delete cat.dataset.ppcatPrev;
                }
            });
        } catch (_) {}
    }

    function _guardTab(tabId) {
        const l = _byTab[tabId];
        if (l && !laneOn(l.id)) {
            try {
                if (typeof showToast === 'function')
                    showToast('"' + l.name + '" isn’t in this program’s plan — flip it on here to use it. Nothing was deleted.', 'info', 5200);
            } catch (_) {}
            return 'spp';    // land on the plan page: the switch is right there
        }
        return tabId;
    }

    // ------------------------------------------------------- SPP page section
    // v0.4 — mockup-parity skin: slider toggles, the SPINE row shown locked,
    // pill badges. Same machinery underneath; only the clothes changed.
    function _slider(on, locked, onclick) {
        const bg = locked ? 'var(--color-text-primary); opacity:.45; cursor:not-allowed;'
                 : on ? '#1D9E75; cursor:pointer;' : 'var(--color-border-strong); cursor:pointer;';
        const knobLeft = (on || locked) ? '18px' : '2px';
        return '<span role="switch" aria-checked="' + (on || locked) + '"' + (locked ? ' title="program spine — always on"' : '') +
            (onclick && !locked ? ' onclick="' + onclick + '"' : '') +
            ' style="position:relative; display:inline-block; width:36px; height:20px; border-radius:999px; vertical-align:middle; transition:background .18s; background:' + bg + '">' +
            '<span style="position:absolute; top:2px; left:' + knobLeft + '; width:16px; height:16px; border-radius:50%; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.25); transition:left .18s;"></span></span>';
    }
    function _spineData() {
        let n = 0;
        try { n += ((typeof acFhaData !== 'undefined' ? acFhaData : []) || []).length; } catch (_) {}
        try { ((typeof systemsData !== 'undefined' ? systemsData : []) || []).forEach(s => { n += ((s && s.fha) || []).length; }); } catch (_) {}
        return n;
    }
    function renderScopeSection() {
        if (typeof document === 'undefined') return;
        const view = document.getElementById('view-spp');
        if (!view) return;
        let host = document.getElementById('pp-scope-host');
        if (!host) {
            host = document.createElement('div');
            host.id = 'pp-scope-host';
            view.appendChild(host);
        }
        const basis = basisNow();
        const grand = !scope();
        const spineN = _spineData();
        const spineRow = '<tr>' +
            '<td><b>FHA — aircraft &amp; system</b><br><span style="font-size:11px; color:var(--color-text-tertiary);">ARP4761A §3 / App A · the spine — a program without hazard identification isn’t a program</span></td>' +
            '<td><span class="u-mono" style="font-size:10px; font-weight:700; color:var(--color-surface-1); background:var(--color-text-primary); border-radius:999px; padding:2px 9px;">SPINE</span></td>' +
            '<td class="u-mono" style="font-size:11.5px;' + (spineN ? '' : ' color:var(--color-text-tertiary);') + '">' + (spineN ? spineN + ' authored item' + (spineN === 1 ? '' : 's') : 'no data yet') + '</td>' +
            '<td style="text-align:right;">' + _slider(true, true, null) + '</td></tr>';
        const groupHeader = (label) =>
            '<tr><td colspan="4" style="padding:10px 6px 4px; font-size:10px; font-weight:700; letter-spacing:.1em; color:var(--color-text-tertiary); border-bottom:1px solid var(--color-border-strong);">' + _esc(label.toUpperCase()) + '</td></tr>';
        const laneRow = (l) => {
            const on = laneOn(l.id);
            const exp = isExpected(l.id, basis);
            const n = laneData(l.id);
            const tailored = tailoring().some(t => t.laneId === l.id && !t.cleared);
            const badge = l.optIn
                ? '<span class="u-mono" style="font-size:10px; font-weight:700; color:#6D28D9; border:1px solid #6D28D955; background:#6D28D912; border-radius:999px; padding:2px 9px;">OPT-IN · SYSTEM LANE</span>'
                : exp
                    ? '<span class="u-mono" style="font-size:10px; font-weight:700; color:var(--color-text-primary); border:1px solid var(--color-border-strong); background:var(--color-surface-2); border-radius:999px; padding:2px 9px;">EXPECTED — ' + _esc(basis.toUpperCase()) + '</span>'
                    : '<span class="u-mono" style="font-size:10px; color:var(--color-text-tertiary); border:1px solid var(--color-border); border-radius:999px; padding:2px 9px;">OPTIONAL</span>';
            const tailBadge = tailored
                ? ' <span class="u-mono" style="font-size:10px; font-weight:700; color:#B7791F; border:1px solid #B7791F55; background:#B7791F12; border-radius:999px; padding:2px 9px;">TAILORED OUT · SIGNED</span>' : '';
            return '<tr>' +
                '<td' + (l.parent ? ' style="padding-left:30px;"' : '') + '><b>' + (l.parent ? '↳ ' : '') + _esc(l.name) + '</b><br><span style="font-size:11px; color:var(--color-text-tertiary);">' + _esc(l.std) + ' · tabs: ' + l.tabs.map(_esc).join(', ') + '</span></td>' +
                '<td>' + badge + tailBadge + '</td>' +
                '<td class="u-mono" style="font-size:11.5px;' + (n ? '' : ' color:var(--color-text-tertiary);') + '">' +
                    (n ? n + ' item' + (n === 1 ? '' : 's') + ' — retained even if off' : 'no data yet') + '</td>' +
                '<td style="text-align:right; white-space:nowrap;">' +
                    _slider(on, false, 'PROGRAM_PLAN._uiToggle(\'' + l.id + '\')') + '</td></tr>';
        };
        const rows = GROUPS.map(g =>
            groupHeader(g.label) + CATALOGUE.filter(l => l.group === g.id && !l.parent).map(l =>
                laneRow(l) + CATALOGUE.filter(sl => sl.parent === l.id).map(laneRow).join('')
            ).join('')).join('');
        const tail = tailoring().filter(t => !t.cleared);
        host.innerHTML =
            '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-top:18px;">' +
            '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary); display:flex; justify-content:space-between; align-items:center; gap:10px;">' +
            '<b>Program scope — the plan drives the nav</b>' +
            '<span class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary);">defaults derived from cert basis: <b>' + _esc(basis) + '</b>' +
            (grand ? ' · legacy project — all lanes grandfathered ON' : '') + '</span></div>' +
            '<div style="padding:6px 14px 2px; font-size:12px; color:var(--color-text-secondary); ">A lane that’s off leaves the sidebar — its data is <b>retained untouched</b> and one flip brings it back. Removing a basis-expected lane that holds work requires a signed tailoring rationale, recorded below.</div>' +
            '<div style="overflow-x:auto; padding:0 14px 12px;"><table class="data-table" style="width:100%; font-size:12px;">' +
            '<thead><tr><th>Lane · objective</th><th>Basis posture</th><th>Data</th><th style="text-align:right;">In program</th></tr></thead>' +
            '<tbody>' + groupHeader('Program spine — always on') + spineRow + rows + '</tbody></table></div>' +
            '<div style="padding:0 14px 12px;"><b style="font-size:12px;">Tailoring register</b>' +
            (tail.length ? tail.map(t =>
                '<div style="font-size:12px; padding:6px 0; border-top:1px dashed var(--color-border);">' +
                '<b>' + _esc((_byId[t.laneId] || {}).name || t.laneId) + '</b> — removed from program under ' + _esc(t.basis || '') +
                '<br><span style="color:var(--color-text-secondary);">“' + _esc(t.rationale) + '”</span>' +
                '<br><span class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary);">signed ' + _esc(t.sig) + ' · ' + _esc(String(t.at || '').slice(0, 10)) + ' · data retained · reversible</span></div>').join('')
              : '<div style="font-size:11.5px; color:var(--color-text-tertiary); padding-top:4px;">No tailoring recorded — no signed opt-outs on this program.</div>') +
            '</div></div>';
    }

    // UI toggle path — collects the signed rationale when the core demands it.
    function _uiToggle(id) {
        const l = _byId[id];
        if (!l) return;
        const turningOff = laneOn(id);
        const finish = function () { renderScopeSection(); };
        if (!turningOff) { setLane(id, true); finish(); return; }
        const needsSignoff = isExpected(id) && laneData(id) > 0;
        if (!needsSignoff) { setLane(id, false); finish(); return; }
        Promise.resolve(slPrompt('Tailoring opt-out: "' + l.name + '" is expected under ' + basisNow() +
                ' and holds ' + laneData(id) + ' item(s).\n\nWhy is this lane out of scope for this program? (≥10 characters)', '',
                { title: 'Signed tailoring opt-out', okText: 'Continue' }))
            .then(function (rat) {
                if (rat == null || String(rat).trim().length < 10) {
                    if (typeof showToast === 'function') showToast('Kept in program — a tailoring opt-out needs a real rationale.', 'info', 4200);
                    return null;
                }
                return Promise.resolve(slPrompt('Signature, name and role (e.g., W. Nafees, Head of Safety):', '',
                        { title: 'Sign the tailoring record', okText: 'Sign & remove' }))
                    .then(function (sig) {
                        if (sig == null || !String(sig).trim()) {
                            if (typeof showToast === 'function') showToast('Kept in program — unsigned tailoring doesn’t count.', 'info', 4200);
                            return null;
                        }
                        setLane(id, false, { rationale: String(rat).trim(), sig: String(sig).trim() });
                        if (typeof showToast === 'function') showToast('"' + l.name + '" tailored out — signed, recorded, reversible. Data retained.', 'success', 5200);
                        return true;
                    });
            })
            .then(finish)
            .catch(function () { finish(); });
    }

    // ------------------------------------------------- intake wizard section
    // Renders the lane checklist into the New Project wizard (host div), driven
    // by the chosen basis. Display + input collection only — npwCreate reads
    // the boxes and routes every write through initScope/setLane as always.
    function renderWizardScope(hostId, basis) {
        if (typeof document === 'undefined') return;
        const host = document.getElementById(hostId);
        if (!host) return;
        const d = defaultsFor(basis);
        host.innerHTML = CATALOGUE.map(l => {
            const exp = l.expected.indexOf(_normBasis(basis)) >= 0;
            const chip = l.optIn
                ? '<span class="u-mono" style="font-size:9.5px; font-weight:700; color:#6D28D9; border:1px solid #6D28D955; border-radius:4px; padding:1px 6px;">OPT-IN SYSTEM LANE</span>'
                : exp ? '<span class="u-mono" style="font-size:9.5px; font-weight:700; border:1px solid var(--color-border-strong); border-radius:4px; padding:1px 6px;">EXPECTED</span>'
                      : '<span class="u-mono" style="font-size:9.5px; color:var(--color-text-tertiary); border:1px solid var(--color-border); border-radius:4px; padding:1px 6px;">OPTIONAL</span>';
            return '<label style="display:flex; align-items:center; gap:9px; padding:5px 2px; border-bottom:1px dashed var(--color-border); cursor:pointer; font-size:12.5px;">' +
                '<input type="checkbox" class="npw-lane" data-lane="' + _esc(l.id) + '"' + (d[l.id] ? ' checked' : '') + '>' +
                '<span style="flex:1;">' + _esc(l.name) + ' <span style="font-size:10.5px; color:var(--color-text-tertiary);">' + _esc(l.std) + '</span></span>' + chip + '</label>';
        }).join('') +
        '<div style="font-size:10.5px; color:var(--color-text-tertiary); padding-top:5px;">Deselecting an EXPECTED lane later, once it holds work, requires a signed tailoring rationale. Everything here is changeable on the Safety Program Plan page.</div>';
    }
    // Applies the wizard's checklist over the basis defaults. `sel` is a
    // { laneId: bool } map captured BEFORE the modal closes (the caller reads
    // the boxes; we never assume they still exist). New project = no data
    // anywhere, so every setLane here is free and unsigned.
    function applyWizardScope(basis, sel) {
        initScope(basis);
        if (!sel || typeof sel !== 'object') return;
        Object.keys(sel).forEach(id => { try { setLane(id, !!sel[id]); } catch (_) {} });
    }

    // ------------------------------------------------------------------ wiring
    function _wireUp() {
        if (typeof window === 'undefined' || typeof document === 'undefined') return;
        if (typeof window.switchTab === 'function' && !window.switchTab._ppWrapped) {
            const orig = window.switchTab;
            const wrapped = function (tabId) {
                const routed = _guardTab(tabId);
                const r = orig.call(this, routed);
                try {
                    if (routed === 'spp') setTimeout(function () {
                        renderScopeSection();
                        try { renderSystemPlans(); } catch (_) {}
                        // A11. Rendered on every visit rather than once, because it
                        // reads live project state — a cached recommendation is a
                        // recommendation about a project you no longer have.
                        try { if (typeof window.renderNextStep === 'function') window.renderNextStep('next-step-host'); } catch (_) {}
                    }, 0);
                    applyNav();
                } catch (_) {}
                return r;
            };
            wrapped._ppWrapped = true;
            window.switchTab = wrapped;
            applyNav();
        } else if (typeof window.addEventListener === 'function') {
            window.addEventListener('DOMContentLoaded', function () { setTimeout(_wireUp, 500); });
        }
    }
    _wireUp();

    // ================= Per-system program plans (phase 2) =================
    // Each system carries its own analysis scope (top-level Safety · RAM · HFA lanes),
    // captured when the system is added (defaulted from the aircraft scope) and versioned:
    // initial = baseline (Rev A); each change = a revision with a diff, author, timestamp,
    // and rationale. Rides the project snapshot/autosave, same as the aircraft scope.
    // Implementation-agnostic: NO DAL — that stays with configuration management.
    function _ppNow() { try { return new Date().toISOString(); } catch (_) { return ''; } }
    function _ppActor() {
        try { if (typeof _signoffReviewerName === 'function') return _signoffReviewerName() || ''; } catch (_) {}
        try { if (typeof _acceptedByLabel === 'function') return _acceptedByLabel() || ''; } catch (_) {}
        return '';
    }
    function _sysPlans() {
        const st = _store(); if (!st) return null;
        if (!st.systemPlans || typeof st.systemPlans !== 'object') st.systemPlans = {};
        return st.systemPlans;
    }
    function planLanes() { return CATALOGUE.filter(l => !l.parent); }   // per-system scope = top-level lanes
    function _revLabel(n) { let out = ''; n = n | 0; do { out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26) - 1; } while (n >= 0); return out; }
    function systemPlan(sysId) { const sp = _sysPlans(); return sp ? (sp[sysId] || null) : null; }
    // Effective lane state for a system: its own plan value, else inherit the aircraft scope.
    function systemLaneOn(sysId, laneId) {
        const pl = systemPlan(sysId);
        if (pl && pl.lanes && Object.prototype.hasOwnProperty.call(pl.lanes, laneId)) return pl.lanes[laneId] !== false;
        return laneOn(laneId);
    }
    function initSystemPlan(sysId, lanes, opts) {
        const sp = _sysPlans(); if (!sp) return null;
        opts = opts || {};
        const chosen = {};
        planLanes().forEach(l => { chosen[l.id] = (lanes && Object.prototype.hasOwnProperty.call(lanes, l.id)) ? !!lanes[l.id] : laneOn(l.id); });
        const onIds = Object.keys(chosen).filter(k => chosen[k]);
        sp[sysId] = {
            lanes: chosen,
            baseline: { rev: 'A', at: _ppNow(), by: _ppActor() },
            history: [{ rev: 'A', at: _ppNow(), by: _ppActor(), baseline: true,
                        diff: { added: onIds, removed: [] },
                        rationale: opts.rationale || 'Initial plan on add — inherited from the aircraft scope.' }]
        };
        _save();
        return sp[sysId];
    }
    function setSystemLane(sysId, laneId, on, opts) {
        const sp = _sysPlans(); if (!sp) return;
        opts = opts || {};
        if (!sp[sysId]) initSystemPlan(sysId, null);
        const pl = sp[sysId];
        const was = pl.lanes[laneId] !== false;
        if (was === !!on) return pl.lanes[laneId];
        const signedNeeded = !on && isExpected(laneId);
        if (signedNeeded) {
            const rat = String(opts.rationale || '').trim(), sig = String(opts.sig || '').trim();
            if (rat.length < 10 || !sig) {
                throw new Error('program plan: "' + ((_byId[laneId] || {}).name || laneId) + '" is expected under ' + basisNow() +
                    ' — removing it from this system needs a rationale (≥10 chars) and a signature.');
            }
        }
        pl.lanes[laneId] = !!on;
        const rev = _revLabel((pl.history || []).length);
        pl.history = (pl.history || []).concat([{
            rev: rev, at: _ppNow(), by: (opts.sig || _ppActor()),
            diff: on ? { added: [laneId], removed: [] } : { added: [], removed: [laneId] },
            rationale: opts.rationale || (on ? 'Added lane.' : 'Removed lane.'),
            signed: signedNeeded || undefined }]);
        _save();
        return pl.lanes[laneId];
    }

    // ---- per-system plan rendering (phase 2) ----
    function _laneShort(l) {
        const SHORT = { fta:'FTA', markov:'Markov', eta:'ETA', pra:'PRA', zsa:'ZSA', cma:'CMA', stpa:'STPA',
            'ram-reliability':'Reliability', 'ram-swrel':'SW-Rel', 'ram-sneak':'Sneak', 'ram-lcc':'LCC',
            'ram-mx':'Maint.', 'ram-msg3':'MSG-3', 'ram-mmel':'MMEL', hfa:'HFA', sora:'SORA' };
        if (l && SHORT[l.id]) return SHORT[l.id];
        const n = (l && l.name) || (l && l.id) || ''; const m = n.match(/\(([A-Z][A-Za-z0-9-]{1,7})[)\s\/·]/); if (m) return m[1]; return n.split(/[\s(]/)[0];
    }
    function renderPlanHistory(pl) {
        return (pl.history || []).slice().reverse().map(function (h) {
            const add = ((h.diff && h.diff.added) || []).map(function (id) { return '<span style="font-family:var(--u-mono,monospace);font-size:10px;color:#1D7A57;border:1px solid #1D9E7555;background:#1D9E7512;border-radius:999px;padding:1px 7px;">+ ' + _esc(_laneShort(_byId[id] || { name: id })) + '</span>'; }).join(' ');
            const rem = ((h.diff && h.diff.removed) || []).map(function (id) { return '<span style="font-family:var(--u-mono,monospace);font-size:10px;color:#B7791F;border:1px solid #B7791F55;background:#B7791F12;border-radius:999px;padding:1px 7px;">− ' + _esc(_laneShort(_byId[id] || { name: id })) + '</span>'; }).join(' ');
            const base = h.baseline ? '<span style="font-family:var(--u-mono,monospace);font-size:10px;color:var(--color-surface-1);background:var(--color-text-primary);border-radius:999px;padding:1px 7px;">BASELINE</span> ' : '';
            return '<div style="display:flex;gap:12px;padding:7px 2px;border-top:1px solid var(--color-border-hair);font-size:11.5px;">' +
                '<span style="font-family:var(--u-mono,monospace);font-weight:700;min-width:44px;">Rev ' + _esc(h.rev) + '</span>' +
                '<span style="flex:1;">' + base + add + ' ' + rem + '<br><span style="color:var(--color-text-secondary);">' + _esc(h.rationale || '') + (h.signed ? ' <b>signed</b>' : '') + '</span></span>' +
                '<span style="font-family:var(--u-mono,monospace);font-size:10px;color:var(--color-text-tertiary);text-align:right;min-width:130px;">' + _esc(h.by || '') + '<br>' + _esc(String(h.at || '').slice(0, 10)) + '</span></div>';
        }).join('');
    }
    function renderSystemPlans() {
        if (typeof document === 'undefined') return;
        const view = document.getElementById('view-spp'); if (!view) return;
        let host = document.getElementById('pp-systems-host');
        if (!host) { host = document.createElement('div'); host.id = 'pp-systems-host'; view.appendChild(host); }
        const systems = (typeof systemsData !== 'undefined' && systemsData) ? systemsData : [];
        const lanes = planLanes();
        const chip = function (sysId, l) {
            const on = systemLaneOn(sysId, l.id);
            return '<span onclick="try{PROGRAM_PLAN._sysToggle(\'' + _esc(sysId) + '\',\'' + l.id + '\')}catch(e){}" title="' + _esc(l.name) + ' — click to toggle for this system" style="cursor:pointer;font-family:var(--u-mono,monospace);font-size:10.5px;padding:3px 9px;border-radius:999px;border:1px solid var(--color-border-strong);' + (on ? 'background:var(--color-surface-2);color:var(--color-text-primary);' : 'opacity:.35;text-decoration:line-through;border-style:dashed;') + '">' + _esc(_laneShort(l)) + '</span>';
        };
        const card = function (sys) {
            // One lean row. The chip grid and the history accordion moved into
            // openSystemPlanModal() — this page is the AIRCRAFT plan, and it used
            // to grow without bound as systems were added.
            const pl = systemPlan(sys.id);
            const rev = pl ? ((pl.history && pl.history.length) ? pl.history[pl.history.length - 1].rev : (pl.baseline && pl.baseline.rev)) : null;
            const total = CATALOGUE.length;
            const on = CATALOGUE.filter(function (l) { return systemLaneOn(sys.id, l.id); }).length;
            return '<div style="display:flex;align-items:center;gap:12px;padding:9px 14px;border-bottom:1px solid var(--color-border-hair);">' +
                '<b style="font-size:13px;flex:1;min-width:0;">' + _esc(sys.name) + '</b>' +
                '<span style="font-family:var(--u-mono,monospace);font-size:10.5px;color:var(--color-text-tertiary);white-space:nowrap;">' +
                    on + ' of ' + total + ' analyses · ' + (rev ? ('Rev ' + _esc(rev)) : 'inheriting') + '</span>' +
                '<button class="ckpt-m-btn" style="font-size:11.5px;padding:3px 11px;" ' +
                    'onclick="try{PROGRAM_PLAN.openSystemPlanModal(\'' + _esc(sys.id) + '\')}catch(e){}">Scope ›</button>' +
            '</div>';
        };
        const body = systems.length ? systems.map(card).join('') : '<div style="padding:14px;font-size:12px;color:var(--color-text-tertiary);">No systems yet — add a system and its per-system plan is captured here.</div>';
        host.innerHTML = '<div style="border:1px solid var(--color-border-strong);background:var(--color-surface-1);margin-top:18px;">' +
            '<div style="padding:9px 14px;border-bottom:2px solid var(--color-text-primary);display:flex;justify-content:space-between;align-items:center;"><b style="font-size:13.5px;">Per-system plans</b><span style="font-family:var(--u-mono,monospace);font-size:10.5px;color:var(--color-text-tertiary);">' + systems.length + ' system' + (systems.length === 1 ? '' : 's') + ' · each scoped for Safety · RAM · HFA</span></div>' +
            '<div style="padding:6px 14px 2px;font-size:12px;color:var(--color-text-secondary);">Each system carries its own analysis scope. Open <b>Scope</b> to set it — every analysis including the sub-lanes, with the tailoring record kept per system. Anything left unset inherits the aircraft scope above; dropping a basis-expected lane needs a signed rationale.</div>' +
            body + '</div>';
    }

    // ======================================================================
    // Per-system plan MODAL — every analysis, in the system's own surface.
    //
    // WHY THIS EXISTS. renderSystemPlans() used to print a card per system on
    // the Program Planning page: a chip grid plus a version-history accordion,
    // for every system in the programme. That page is the AIRCRAFT plan, and it
    // grew without bound as systems were added — by ten systems it was mostly
    // other systems' scope. The per-system decision belongs to the system.
    //
    // It also only ever offered planLanes() — the 15 top-level lanes. The
    // sub-lanes (Bow-Tie, Routing, CCMR, FMES, Independence Ledger, Task
    // Analysis, Ergonomics, LORA, SORA) were never selectable per system at
    // all, so a system inherited them silently from the aircraft scope with no
    // way to see or tailor them. This modal covers ALL of them.
    //
    // Every write still goes through setSystemLane(), so the revision history,
    // the diff, the author and the signed tailoring opt-out are unchanged —
    // this is a new surface on existing machinery, not a new mechanism.
    // ======================================================================
    const PLAN_MODAL_ID = 'pp-sys-plan-modal';

    function allPlanLanes() { return CATALOGUE.slice(); }
    function _childrenOf(id) { return CATALOGUE.filter(function (l) { return l.parent === id; }); }
    function _topLanes() { return CATALOGUE.filter(function (l) { return !l.parent; }); }

    function closeSystemPlanModal() {
        const el = document.getElementById(PLAN_MODAL_ID);
        if (el) { try { el.remove(); } catch (_) { if (el.parentNode) el.parentNode.removeChild(el); } }
    }

    function _planRow(sysId, l, depth) {
        const on = systemLaneOn(sysId, l.id);
        const exp = isExpected(l.id);
        // A sub-lane cannot be in scope when its parent is out — showing it as
        // togglable would promise something the gate will not honour.
        const parentOff = l.parent ? !systemLaneOn(sysId, l.parent) : false;
        const dis = parentOff ? ' opacity:.45; pointer-events:none;' : '';
        return '<label style="display:flex;align-items:flex-start;gap:9px;padding:6px 10px 6px ' + (10 + depth * 22) + 'px;' +
                   'border-top:1px solid var(--color-border-hair); cursor:pointer; text-transform:none;' + dis + '">' +
            '<input type="checkbox" data-lane="' + _esc(l.id) + '"' + (on ? ' checked' : '') + (parentOff ? ' disabled' : '') +
                   ' style="margin-top:2px; flex:none;">' +
            '<span style="flex:1; min-width:0;">' +
                '<span style="font-size:12.5px; font-weight:600;">' + _esc(l.name) + '</span>' +
                (exp ? ' <span title="Expected under ' + _esc(basisNow()) + ' — removing it needs a signed rationale" ' +
                       'style="font-family:var(--u-mono,monospace);font-size:9.5px;color:#8A5A00;border:1px solid #E0A53A;border-radius:999px;padding:0 6px;">expected</span>' : '') +
                (l.optIn ? ' <span style="font-family:var(--u-mono,monospace);font-size:9.5px;color:var(--color-text-tertiary);border:1px solid var(--color-border-thin);border-radius:999px;padding:0 6px;">opt-in</span>' : '') +
                (l.std ? '<br><span style="font-size:10.5px;color:var(--color-text-tertiary);font-family:var(--u-mono,monospace);">' + _esc(l.std) + '</span>' : '') +
                (parentOff ? '<br><span style="font-size:10.5px;color:var(--color-text-tertiary);">parent lane is out of scope for this system</span>' : '') +
            '</span></label>';
    }

    function openSystemPlanModal(sysId) {
        if (typeof document === 'undefined') return;
        const systems = (typeof systemsData !== 'undefined' && systemsData) ? systemsData : [];
        const sys = systems.filter(function (x) { return x.id === sysId; })[0];
        if (!sys) return;
        if (!systemPlan(sysId)) initSystemPlan(sysId, null);
        closeSystemPlanModal();

        const pl = systemPlan(sysId);
        const rev = pl ? ((pl.history && pl.history.length) ? pl.history[pl.history.length - 1].rev : (pl.baseline && pl.baseline.rev)) : null;

        let body = '';
        GROUPS.forEach(function (g) {
            const tops = _topLanes().filter(function (l) { return l.group === g.id; });
            if (!tops.length) return;
            body += '<div style="margin-top:12px;"><div style="font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;' +
                    'font-weight:800;color:var(--color-text-tertiary);padding:0 10px 4px;">' + _esc(g.name || g.id) + '</div>';
            tops.forEach(function (l) {
                body += _planRow(sysId, l, 0);
                _childrenOf(l.id).forEach(function (c) { body += _planRow(sysId, c, 1); });
            });
            body += '</div>';
        });
        // sub-lanes whose parent sits in another group (or none) still need a home
        const orphans = CATALOGUE.filter(function (l) { return l.parent && !_byId[l.parent]; });
        orphans.forEach(function (l) { body += _planRow(sysId, l, 0); });

        const ov = document.createElement('div');
        ov.id = PLAN_MODAL_ID;
        ov.style.cssText = 'position:fixed;inset:0;z-index:2147483605;display:flex;align-items:center;justify-content:center;' +
            'background:rgba(8,12,20,.5);padding:24px;';
        ov.innerHTML =
            '<div style="background:var(--color-surface-1);border:1px solid var(--color-border-strong);border-radius:var(--r-md,8px);' +
                 'width:min(680px,96vw);max-height:88vh;display:flex;flex-direction:column;box-shadow:0 18px 60px rgba(8,12,20,.35);">' +
              '<div style="padding:12px 16px;border-bottom:2px solid var(--color-text-primary);display:flex;align-items:baseline;gap:10px;">' +
                '<b style="font-size:14px;">Analysis scope — ' + _esc(sys.name) + '</b>' +
                '<span style="font-family:var(--u-mono,monospace);font-size:10.5px;color:var(--color-text-tertiary);">' +
                  (rev ? ('Plan Rev ' + _esc(rev)) : 'inheriting aircraft scope') + ' · basis ' + _esc(basisNow()) + '</span>' +
              '</div>' +
              '<div style="padding:8px 14px 4px;font-size:12px;color:var(--color-text-secondary);">' +
                'What this system is actually assessed for. Unticking a lane marked <b>expected</b> is a tailoring decision — ' +
                'it asks for a rationale and a signature, and is recorded as a revision.' +
              '</div>' +
              '<div id="pp-plan-scroll" style="overflow:auto;flex:1;padding:0 4px 10px;">' + body + '</div>' +
              (pl && pl.history && pl.history.length
                ? '<details style="border-top:1px solid var(--color-border-hair);padding:8px 16px;">' +
                    '<summary style="cursor:pointer;font-size:11.5px;color:var(--color-accent);">Version history (' + pl.history.length + ')</summary>' +
                    renderPlanHistory(pl) + '</details>' : '') +
              '<div style="padding:11px 16px;border-top:1px solid var(--color-border-hair);display:flex;justify-content:flex-end;gap:8px;">' +
                '<button class="ckpt-m-btn" onclick="try{PROGRAM_PLAN.closeSystemPlanModal()}catch(e){}">Done</button>' +
              '</div>' +
            '</div>';
        document.body.appendChild(ov);

        ov.addEventListener('click', function (ev) { if (ev.target === ov) closeSystemPlanModal(); });
        ov.querySelectorAll('input[data-lane]').forEach(function (cb) {
            cb.addEventListener('change', function () {
                const laneId = cb.getAttribute('data-lane');
                const want = cb.checked;
                // Revert optimistically-flipped state until the write actually lands,
                // so a refused tailoring opt-out never leaves the box looking applied.
                cb.checked = !want;
                Promise.resolve(_sysToggle(sysId, laneId, { silent: true }))
                    .then(function () { openSystemPlanModal(sysId); })
                    .catch(function () { openSystemPlanModal(sysId); });
            });
        });
    }

    function _sysToggle(sysId, laneId, opts) {
        opts = opts || {};
        const turningOff = systemLaneOn(sysId, laneId);
        // Returns a promise so the modal can re-render only once the write has
        // actually landed — a refused opt-out must not leave a ticked box behind.
        const finish = function () { try { renderSystemPlans(); } catch (_) {} try { if (opts.after) opts.after(); } catch (_) {} };
        if (!turningOff) { setSystemLane(sysId, laneId, true); finish(); return Promise.resolve(true); }
        if (!isExpected(laneId)) { setSystemLane(sysId, laneId, false); finish(); return Promise.resolve(true); }
        const lane = _byId[laneId] || {};
        return Promise.resolve(slPrompt('Tailoring opt-out: "' + (lane.name || laneId) + '" is expected under ' + basisNow() + '.\n\nWhy is it out of scope for THIS system? (>=10 characters)', '', { title: 'Signed tailoring opt-out', okText: 'Continue' }))
            .then(function (rat) {
                if (rat == null || String(rat).trim().length < 10) { if (typeof showToast === 'function') showToast('Kept in the system plan — a tailoring opt-out needs a real rationale.', 'info', 4200); return; }
                return Promise.resolve(slPrompt('Signature, name and role (e.g., W. Nafees, Head of Safety):', '', { title: 'Sign the tailoring record', okText: 'Sign & remove' })).then(function (sig) {
                    if (sig == null || !String(sig).trim()) { if (typeof showToast === 'function') showToast('Kept — unsigned tailoring does not count.', 'info', 4200); return; }
                    setSystemLane(sysId, laneId, false, { rationale: String(rat).trim(), sig: String(sig).trim() });
                    if (typeof showToast === 'function') showToast('"' + (lane.name || laneId) + '" tailored out of this system — signed, recorded, reversible.', 'success', 5000);
                    finish();
                });
            });
    }

    // ---- per-system scope banner, shown atop a system's workspace (phase 2) ----
    function renderSystemWorkspaceBanner(sysId) {
        if (typeof document === 'undefined') return;
        const host = document.getElementById('ws-plan-banner'); if (!host) return;
        if (!sysId) { host.innerHTML = ''; return; }
        const lanes = planLanes();
        const pl = systemPlan(sysId);
        const rev = pl ? ((pl.history && pl.history.length) ? pl.history[pl.history.length - 1].rev : (pl.baseline && pl.baseline.rev)) : null;
        const chips = lanes.map(function (l) {
            const on = systemLaneOn(sysId, l.id);
            return '<span title="' + _esc(l.name) + '" style="font-family:var(--u-mono,monospace);font-size:10px;padding:2px 8px;border-radius:999px;border:1px solid var(--color-border-strong);' + (on ? 'background:var(--color-surface-2);color:var(--color-text-primary);' : 'opacity:.32;text-decoration:line-through;border-style:dashed;') + '">' + _esc(_laneShort(l)) + '</span>';
        }).join(' ');
        host.innerHTML = '<div style="border:1px solid var(--color-border-thin);background:var(--color-surface-1);padding:9px 12px;margin-bottom:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
            '<b style="font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--color-text-tertiary);">Analysis scope</b>' +
            '<div style="display:flex;flex-wrap:wrap;gap:5px;flex:1;">' + chips + '</div>' +
            '<span style="font-family:var(--u-mono,monospace);font-size:10px;color:var(--color-text-tertiary);">' + (rev ? ('Plan Rev ' + _esc(rev)) : 'inheriting aircraft scope') + '</span>' +
            '<a onclick="try{PROGRAM_PLAN.openSystemPlanModal(\'' + _esc(sysId) + '\')}catch(e){}" style="font-size:11px;color:var(--color-accent);cursor:pointer;white-space:nowrap;">Edit scope ›</a></div>';
    }

    // Which lanes produce output without authoring anything. Exported rather than
    // re-derived by consumers: two modules disagreeing about whether FMES is real
    // work is exactly how a plan starts lying.
    const DERIVED = { ccmr: true, fmes: true, ipledger: true };
    const NO_STORE = { 'hfa-ergo': true };

    const API = { CATALOGUE, GROUPS, BASES, DERIVED, NO_STORE, defaultsFor, scope, laneOn, setLane, initScope, laneData,
                  isExpected, tailoring, applyNav, renderScopeSection, renderWizardScope,
                  applyWizardScope, _uiToggle, _guardTab, basisNow,
                  systemPlan, systemLaneOn, initSystemPlan, setSystemLane, planLanes,
                  renderSystemPlans, _sysToggle, renderSystemWorkspaceBanner,
                  allPlanLanes, openSystemPlanModal, closeSystemPlanModal };
    if (typeof window !== 'undefined') window.PROGRAM_PLAN = API;
    if (typeof module !== 'undefined') module.exports = API;
})();
