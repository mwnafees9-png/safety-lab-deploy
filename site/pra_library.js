// ============================================================================
// pra_library.js — v1.0 — PRA-A: the standard particular-risk candidate library.
// BORN MODULAR: pure data + logic, no DOM.
//
// The SET of particular risks to consider is a known checklist driven by cert
// basis + configuration (ARP4761A Appendix L; AMC 25.1309 and the FAA
// particular-risk ACs). This library is the deterministic CANDIDATE set — it
// does NOT decide applicability (that's engineering judgement, dispositioned
// per row with an N/A reason). Each risk carries the CONDITION that triggers it
// (e.g. turbine engine, retractable gear) and a footprint hint. Cert-basis
// mainly scales DEPTH/rigor (Part 23 class I→IV, Part 25); it does not remove
// risks — configuration does.
//
// Labels/descriptions paraphrased (facts/methodology). Sources cited per risk.
// ============================================================================
(function () {
    'use strict';
    var ROOT = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);

    // id, name, condition (applicability trigger), footprint (authoring hint), src
    var CATALOG = [
        { id: 'rotor-burst',   name: 'Uncontained engine / rotor burst', condition: 'Turbine engine or APU', footprint: '±3° / ±5° / ±15° debris trajectory bands across zones in the rotor plane', src: 'ARP4761A App L; AC 20-128A' },
        { id: 'fan-blade-off', name: 'Fan / compressor blade release',   condition: 'Turbine engine',        footprint: 'Blade-off trajectory + downstream zones', src: 'AC 20-128A' },
        { id: 'tyre-burst',    name: 'Tyre / wheel burst & tread throw',  condition: 'Any landing gear',      footprint: 'Gear bay + tyre-throw envelope (radial + tangential)', src: 'AC 25.734; ARP4761A App L' },
        { id: 'wheel-brake',   name: 'Wheel / brake overheat or fire',    condition: 'Wheel brakes',          footprint: 'Gear bay and adjacent zones', src: 'AMC 25.1309' },
        { id: 'bird-strike',   name: 'Bird strike',                       condition: 'Forward-facing structure / windshield / inlets / leading edges', footprint: 'Frontal impact zones', src: '14 CFR/CS 25.631; ARP4761A App L' },
        { id: 'lightning',     name: 'Lightning strike',                  condition: 'All aircraft',          footprint: 'Attachment zones + conductive paths / EWIS', src: 'AC 20-136B; SAE ARP5577' },
        { id: 'hirf',          name: 'HIRF (high-intensity radiated fields)', condition: 'Any critical electronics', footprint: 'All zones housing susceptible avionics', src: 'AC 20-158A' },
        { id: 'fire-overheat', name: 'Engine / APU fire or overheat',     condition: 'Engine / APU / designated fire zones', footprint: 'Fire zone + adjacent zones across firewalls', src: 'AMC 25.1309; 14 CFR/CS 25.1181' },
        { id: 'ice-hail',      name: 'Ice / hail',                        condition: 'Exposed surfaces / inlets / probes', footprint: 'Exposed leading edges, inlets, sensors', src: 'ARP4761A App L' },
        { id: 'fluid-leak',    name: 'Flammable fluid leakage',           condition: 'Fuel / hydraulic / oil zones', footprint: 'Leak-path zones toward ignition sources', src: 'AMC 25.1309' },
        { id: 'hp-burst',      name: 'High-pressure vessel / bottle burst', condition: 'Pneumatic / oxygen / accumulator', footprint: 'Fragment envelope around the vessel', src: 'ARP4761A App L' },
        { id: 'flailing-shaft',name: 'Rotating-part / shaft failure (non-engine)', condition: 'High-energy rotating equipment', footprint: 'Flail radius + debris zones', src: 'ARP4761A App L' },
        { id: 'gear-up',       name: 'Gear-up / abnormal landing',        condition: 'Retractable or fixed gear', footprint: 'Underside structure & housed equipment', src: 'ARP4761A App L' },
        { id: 'fuel-ignition', name: 'Fuel tank ignition',               condition: 'Fuel tanks',            footprint: 'Fuel tanks + adjacent ignition-source zones', src: '14 CFR/CS 25.981; SFAR 88' },
        { id: 'water-ingress', name: 'Fluid / water ingress',            condition: 'Galley / lav / drainage paths', footprint: 'Wetted zones + drainage migration paths', src: 'ARP4761A App L §K.4.5.2' }
    ];

    // Cert-basis rigor note (depth scales; the SET is config-driven, not removed by basis).
    function rigorNote(certBasis) {
        var cb = String(certBasis || '');
        if (/Part 25|SC-VTOL Enhanced|SC-VTOL Basic 3|Part 29|Part 27 IV/.test(cb)) return 'Full transport-level rigor; assess every credible particular risk in depth.';
        if (/Part 23 IV/.test(cb)) return 'Commuter (Class IV) — near transport rigor.';
        if (/Part 23 III|Part 27 III|Part 27$/.test(cb)) return 'Class III — moderate rigor; scale depth to complexity.';
        if (/Part 27 (I|II)\b/.test(cb)) return 'Part 27 Class I/II — reduced rigor; rotorcraft-specific risks (rotor/drive, resonance) still in.';
        if (/SC-VTOL Basic 2/.test(cb)) return 'Basic 2 (2–6 pax) — moderate rigor (Cat 1e-8 / FDAL B); scale depth to complexity.';
        if (/Part 23 (I|II)\b/.test(cb) || /SC-VTOL Basic/.test(cb)) return 'Lower class / Basic 1 — reduced rigor; include only risks credible for this configuration.';
        return 'Scale rigor to cert basis and configuration.';
    }

    function catalog() { return CATALOG.map(function (r) { return Object.assign({}, r); }); }
    function get(id) { var r = CATALOG.find(function (x) { return x.id === id; }); return r ? Object.assign({}, r) : null; }

    // Candidate set for a cert basis: the full catalog (config decides applicability),
    // each annotated with its condition + a suggested disposition of 'candidate'.
    function candidates(certBasis) {
        return { rigor: rigorNote(certBasis), items: catalog().map(function (r) { return Object.assign({ disposition: 'candidate' }, r); }) };
    }

    ROOT.PRA_LIBRARY = { SCHEMA: 'pra-lib-1', catalog: catalog, get: get, candidates: candidates, rigorNote: rigorNote };
})();
