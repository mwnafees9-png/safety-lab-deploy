// ============================================================================
// beta_scoring.js — v1.0 — CMA-β: deterministic β (CCF) recommendation from a
// scored defense checklist. BORN MODULAR: new file, pure function, no DOM.
//
// NOT in ARP4761A (its β mentions are Weibull shape factors). Method synthesised
// from two public sources, in our own words / our own weights:
//   · IEC 61508-6 Annex D — scored-checklist β method; β anchors ~0.5–5% for
//     programmable logic and ~1–10% for sensors/final elements. (Copyrighted —
//     method + category set only; we do NOT reproduce Tables D.1–D.5; weights
//     below are our own, tunable against project data.)
//   · NUREG/CR-4780 / NUREG/CR-5485 (US NRC, public domain) — β and partial-β:
//     β decomposes into per-defense factors combined MULTIPLICATIVELY, so each
//     strong defence lowers β; industry β≈0.1 with ordinary defences, ≈0.01
//     best-case floor, up to ~0.25 for poorly defended groups.
//
// Determinism: the checklist answers are AUTHORED (engineer judgement); this
// function is a transparent, auditable mapping from those answers to a β — same
// authored-input / computed-output pattern as the physical cross-check.
// ============================================================================
(function () {
    'use strict';
    var ROOT = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);

    // Defense categories (union of IEC Annex D + NUREG cause-defense). Weights are
    // our own convention: separation + diversity dominate (the literature is explicit
    // that redundancy without both does not earn a low β). Weights sum to 1.
    var CATS = [
        { key: 'separation',  weight: 0.22, label: 'Physical separation / segregation',      desc: 'Distance, barriers, separate routing/power between the redundant members.' },
        { key: 'diversity',   weight: 0.22, label: 'Diversity of technology / design',        desc: 'Different technologies, designs, vendors, or media between members.' },
        { key: 'complexity',  weight: 0.12, label: 'Simplicity, maturity & field experience', desc: 'Simple, field-proven, operationally mature design.' },
        { key: 'analysis',    weight: 0.12, label: 'CCF analysis & field-data feedback',       desc: 'FMEA/CCF analyses performed; field failures reviewed and fed back.' },
        { key: 'procedures',  weight: 0.10, label: 'Procedures & human interface',             desc: 'Maintenance/operation procedures and staggered testing that reduce shared human error.' },
        { key: 'competence',  weight: 0.08, label: 'Competence / training / safety culture',   desc: 'Staff qualification and organisational rigour.' },
        { key: 'envControl',  weight: 0.07, label: 'Environmental control (in service)',       desc: 'Control of temperature, power quality, EMI in operation.' },
        { key: 'envTesting',  weight: 0.07, label: 'Environmental testing (development)',       desc: 'Qualification testing against environmental stressors.' }
    ];
    // device anchor bands (mirror IEC): programmable logic vs field hardware; generic = wide.
    var BANDS = { logic: { low: 0.005, high: 0.05 }, field: { low: 0.01, high: 0.10 }, generic: { low: 0.01, high: 0.25 } };

    function _clamp01(v) { return Math.max(0, Math.min(1, isFinite(v) ? v : 0)); }

    function recommendBeta(input) {
        input = input || {};
        var d = input.defenses || {};
        var band = BANDS[input.deviceType] || BANDS.field;
        var S = 0, wsum = 0;
        CATS.forEach(function (c) { var v = _clamp01(c.key in d ? d[c.key] : 0); S += c.weight * v; wsum += c.weight; });
        S = wsum ? S / wsum : 0;
        // geometric interpolation across the band — matches the multiplicative partial-β logic
        var beta = band.low * Math.pow(band.high / band.low, 1 - S);
        // separation + diversity gate: cannot reach the low end without BOTH credited
        var sep = _clamp01(d.separation || 0), div = _clamp01(d.diversity || 0);
        var gateFloor = band.low * Math.pow(band.high / band.low, 0.5); // geometric mid of band
        var gated = false;
        if (Math.min(sep, div) < 0.5 && beta < gateFloor) { beta = gateFloor; gated = true; }
        return {
            beta: Number(beta.toPrecision(2)),
            betaPct: Number((beta * 100).toPrecision(2)),
            deviceType: input.deviceType || 'field',
            band: band, score: Number(S.toFixed(3)), gated: gated,
            rationale: _rationale(d, gated)
        };
    }

    function _rationale(d, gated) {
        var strong = [], weak = [];
        CATS.forEach(function (c) { var v = _clamp01(d[c.key]); if (v >= 0.7) strong.push(c.label); else if (v <= 0.3) weak.push(c.label); });
        var parts = [];
        if (strong.length) parts.push('Strong: ' + strong.join(', ') + '.');
        if (weak.length) parts.push('Weak/absent: ' + weak.join(', ') + '.');
        if (gated) parts.push('β floored: separation and diversity not both credited — a low β is not defensible without both (NUREG/CR-4780).');
        return parts.join(' ') || 'No defences credited — β anchored near the band ceiling.';
    }

    function defenseCategories() { return CATS.map(function (c) { return { key: c.key, weight: c.weight, label: c.label, desc: c.desc }; }); }
    function bands() { return JSON.parse(JSON.stringify(BANDS)); }

    ROOT.BETA_SCORING = { SCHEMA: 'beta-scoring-1', recommendBeta: recommendBeta, defenseCategories: defenseCategories, bands: bands };
})();
