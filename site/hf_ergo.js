// ============================================================================
// hf_ergo.js — v0.1 — HF-5/HF-6: the ergonomics spine + Fitts' Law + the
// seven-factor human-performance taxonomy.
//
// HF-5 · ISO 9241 joins the standards spine the house way: designation +
//        title + role, cite-and-point — licensed text NEVER stored. And
//        Fitts' Law becomes a deterministic calculator:
//            MT = a + b · log2(D/W + 1)        (Shannon formulation,
//                                               ISO 9241-9 protocol lineage)
//        The FORMULA is physics-of-the-literature and ships. The a/b
//        COEFFICIENTS are empirical — device- and posture-specific — so the
//        calculator REQUIRES cited values (from your own trials per the
//        ISO 9241-9 protocol, or a source you can defend). No uncited
//        defaults: a borrowed coefficient without a citation is a guess
//        wearing a suit. Results are SEEDS for the crew-task ledger — they
//        never fill a field by themselves (HIDH-drawer rule, unchanged).
//
// HF-6 · The seven factor classes that shape human performance —
//        physiological · psychological · cognitive · environmental ·
//        organizational · technological · procedural — as a typed taxonomy
//        for STPA causal factors and HF-typed assumptions. Classification
//        is display-lane data authored by the analyst; nothing infers it.
//        NASAHFACS nanocodes remain the deep taxonomy — these seven are the
//        coarse lens, and we deliberately do NOT double-model: a causal
//        factor carries at most one class here, with HFACS detail living on
//        the assumption record where it belongs.
//
// Display-lane: computes and describes; never writes stores. No AI here.
// ============================================================================
(function () {
    'use strict';

    // ---- the spine entries (metadata only — cite & point) -------------------
    const ISO_9241 = {
        family: 'ISO 9241 — Ergonomics of human-system interaction',
        role: 'Usability, human-centered design, and efficient interaction for the crew-facing surfaces of the aircraft and its ground stations. Referenced by HF-typed assumptions and the HFA lane; text never stored — cite the designation and point at the licensed document.',
        parts: [
            { designation: 'ISO 9241-110', title: 'Interaction principles' },
            { designation: 'ISO 9241-112', title: 'Principles for the presentation of information' },
            { designation: 'ISO 9241-210', title: 'Human-centered design for interactive systems' },
            { designation: 'ISO 9241-9',   title: 'Requirements for non-keyboard input devices (Fitts protocol lineage; superseded editions remain the multidirectional-tapping reference)' }
        ]
    };

    // ---- HF-6 · the seven factor classes ------------------------------------
    const FACTOR_CLASSES = [
        { id: 'physiological',  label: 'Physiological',  hint: 'fatigue, circadian disruption, hypoxia, hydration, illness',    color: '#8E2A2A' },
        { id: 'psychological',  label: 'Psychological',  hint: 'stress, anxiety, complacency, motivation',                      color: '#7A3EA8' },
        { id: 'cognitive',      label: 'Cognitive',      hint: 'workload, attention tunneling, memory limitations',             color: '#0E5A8A' },
        { id: 'environmental',  label: 'Environmental',  hint: 'weather, visibility, noise, turbulence, time pressure',         color: '#1E6B4F' },
        { id: 'organizational', label: 'Organizational', hint: 'culture, leadership, communication, resourcing',                color: '#B7791F' },
        { id: 'technological',  label: 'Technological',  hint: 'automation surprises, interface design, information overload',  color: '#4A4A8A' },
        { id: 'procedural',     label: 'Procedural',     hint: 'complex procedures, rule violations, inadequate training',      color: '#6B3F14' }
    ];
    const _classById = {};
    FACTOR_CLASSES.forEach(c => { _classById[c.id] = c; });

    function factorClass(id) { return _classById[String(id || '').toLowerCase()] || null; }
    function isFactorClass(id) { return !!factorClass(id); }

    // Distribution of authored factor classes across a set of causal factors —
    // the coarse lens: does this program's hazard picture lean organizational,
    // or cognitive, or is it mostly unclassified (which is also information)?
    function classDistribution(causalFactors) {
        const dist = {}; let unclassified = 0;
        (causalFactors || []).forEach(cf => {
            const c = cf && factorClass(cf.factorClass);
            if (c) dist[c.id] = (dist[c.id] || 0) + 1; else unclassified++;
        });
        return { dist, unclassified, total: (causalFactors || []).length };
    }

    // ---- HF-5 · Fitts' Law ---------------------------------------------------
    // fitts({ dMm, wMm, aMs, bMs, basis }) →
    //   { mtMs, idBits, dMm, wMm, aMs, bMs, basis, formula }
    // Refusal over repair: geometry must be physical; coefficients must be
    // cited. The result is a SEED — pair it with the task ledger's own basis
    // field when you carry it over ('Fitts: a=…, b=… (…basis…)').
    function fitts(input) {
        if (!input) throw new Error('hf_ergo: input required — { dMm, wMm, aMs, bMs, basis }');
        const d = +input.dMm, w = +input.wMm, a = +input.aMs, b = +input.bMs;
        if (!(d > 0)) throw new Error('hf_ergo: movement distance dMm must be > 0 — Fitts without a distance is not a task');
        if (!(w > 0)) throw new Error('hf_ergo: target width wMm must be > 0 — a zero-width target has infinite difficulty, which is the formula telling you the control is undesignable');
        if (!isFinite(a) || !isFinite(b) || input.aMs == null || input.bMs == null)
            throw new Error('hf_ergo: coefficients aMs and bMs are required — they are EMPIRICAL (device- and posture-specific). Measure them per the ISO 9241-9 multidirectional-tapping protocol, or cite a source you can defend.');
        if (!(b > 0)) throw new Error('hf_ergo: bMs must be > 0 — a non-positive slope says harder targets are hit faster, which no cited dataset supports');
        const basis = String(input.basis || '').trim();
        if (basis.length < 8) throw new Error('hf_ergo: a citation basis for the coefficients is required (≥8 chars) — an uncited coefficient is a guess wearing a suit');
        const idBits = Math.log2(d / w + 1);
        const mtMs = a + b * idBits;
        return {
            mtMs: mtMs, idBits: idBits, dMm: d, wMm: w, aMs: a, bMs: b, basis: basis,
            formula: 'MT = a + b·log2(D/W + 1) (Shannon formulation; ISO 9241-9 protocol lineage)',
            seedNote: 'This is a SEED for the crew-task ledger — carry it over with its basis; it never fills a field by itself.'
        };
    }

    const API = { ISO_9241, FACTOR_CLASSES, factorClass, isFactorClass, classDistribution, fitts };
    if (typeof window !== 'undefined') window.HF_ERGO = API;
    if (typeof module !== 'undefined') module.exports = API;
})();
