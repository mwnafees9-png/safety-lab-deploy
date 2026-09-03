// ============================================================================
// ram_predict_data.js — v0.1 — MIL-HDBK-217F Notice 2 parts-count data.
//
// PROVENANCE: transcribed 20 Jul 2026 from a staged copy of MIL-HDBK-217F
// Notice 2 (28 Feb 1995), Appendix A "Parts Count", pages A-5 through A-11
// (scanned IHS copy; tables read from 300-dpi page renders, smallest-print
// rows zoom-verified). MIL-HDBK-217F is a public-domain US-government
// handbook — values may be stored verbatim, unlike licensed spines.
//
// λg = generic failure rate, FAILURES PER 10^6 HOURS, per use environment.
// πQ = part quality factor per family (the handbook's own tables:
//   discrete semiconductors p. A-6 · resistors p. A-7 · capacitors p. A-8 ·
//   sections 11–22 devices p. A-11).
//
// Curated v0.1 set: discrete semiconductors, resistors, capacitors,
// transformers, relays, switches, breakers, connectors — the parts an
// aircraft LRU is made of. Microcircuits are DEFERRED to v0.2 (their parts
// count composes πQ·πL learning factor, p. A-1/A-4 — not encoded until that
// is done properly). A missing env value (relay/breaker in cannon-launch,
// marked '*' in the handbook) is simply absent here: the engine refuses,
// "No value, no guess."
// ============================================================================
(function () {
    'use strict';

    // Environment codes, handbook order (p. A-2 header et seq.)
    const ENVIRONMENTS = {
        GB: 'Ground, Benign', GF: 'Ground, Fixed', GM: 'Ground, Mobile',
        NS: 'Naval, Sheltered', NU: 'Naval, Unsheltered',
        AIC: 'Airborne, Inhabited Cargo', AIF: 'Airborne, Inhabited Fighter',
        AUC: 'Airborne, Uninhabited Cargo', AUF: 'Airborne, Uninhabited Fighter',
        ARW: 'Airborne, Rotary Wing', SF: 'Space, Flight',
        MF: 'Missile, Flight', ML: 'Missile, Launch', CL: 'Cannon, Launch'
    };
    const ORDER = ['GB', 'GF', 'GM', 'NS', 'NU', 'AIC', 'AIF', 'AUC', 'AUF', 'ARW', 'SF', 'MF', 'ML', 'CL'];
    const L = vals => { const o = {}; ORDER.forEach((e, i) => { if (vals[i] != null) o[e] = vals[i]; }); return o; };

    // πQ families (handbook's own quality tables)
    const PQ_DISCRETE = { 'JANTXV': 0.70, 'JANTX': 1.0, 'JAN': 2.4, 'Lower': 5.5, 'Plastic': 8.0 };   // p. A-6 (non-RF devices row)
    const PQ_RESISTOR = { 'S': 0.030, 'R': 0.10, 'P': 0.30, 'M': 1.0, 'MIL-SPEC': 3.0, 'Lower': 10 }; // p. A-7
    const PQ_CAPACITOR = { 'D': 0.001, 'C': 0.01, 'S': 0.030, 'B': 0.030, 'R': 0.10, 'P': 0.30, 'M': 1.0, 'L': 1.5, 'MIL-SPEC': 3.0, 'Lower': 10 }; // p. A-8
    const PQ_INDUCTIVE = { 'MIL-SPEC': 1.0, 'Non-MIL': 3.0 };            // p. A-11 (ER .25 applies only to MIL-C-39010 coils — not offered for transformers)
    const PQ_RELAY = { 'ER': 0.60, 'MIL-SPEC': 1.5, 'Non-MIL': 2.9 };    // p. A-11
    const PQ_SWITCH = { 'MIL-SPEC': 1.0, 'Non-MIL': 2.0 };               // p. A-11
    const PQ_BREAKER = { 'MIL-SPEC': 1.0, 'Non-MIL': 8.4 };              // p. A-11
    const PQ_CONNECTOR = { 'MIL-SPEC': 1.0, 'Non-MIL': 2.0 };            // p. A-11

    const A5 = 'MIL-HDBK-217F N2 App A p. A-5';
    const A7 = 'MIL-HDBK-217F N2 App A p. A-7';
    const A8 = 'MIL-HDBK-217F N2 App A p. A-8';
    const A9 = 'MIL-HDBK-217F N2 App A p. A-9';

    const CATEGORIES = {
        // ---- diodes (§6.1), p. A-5 -------------------------------------------
        'diode-gp':        { name: 'Diode, general purpose analog', section: '6.1', cite: A5, piQ: PQ_DISCRETE, defaultQuality: 'JANTX',
            lambdaG: L([0.0036, 0.028, 0.049, 0.043, 0.10, 0.092, 0.21, 0.20, 0.44, 0.17, 0.0018, 0.076, 0.23, 1.5]) },
        'diode-switching': { name: 'Diode, switching', section: '6.1', cite: A5, piQ: PQ_DISCRETE, defaultQuality: 'JANTX',
            lambdaG: L([0.00094, 0.0075, 0.013, 0.011, 0.027, 0.024, 0.054, 0.054, 0.12, 0.045, 0.00047, 0.020, 0.060, 0.40]) },
        'diode-rectifier': { name: 'Diode, power rectifier / Schottky', section: '6.1', cite: A5, piQ: PQ_DISCRETE, defaultQuality: 'JANTX',
            lambdaG: L([0.0028, 0.022, 0.039, 0.034, 0.082, 0.073, 0.16, 0.16, 0.35, 0.13, 0.0014, 0.060, 0.18, 1.2]) },
        'diode-transient': { name: 'Diode, transient suppressor / varistor', section: '6.1', cite: A5, piQ: PQ_DISCRETE, defaultQuality: 'JANTX',
            lambdaG: L([0.0029, 0.023, 0.040, 0.035, 0.084, 0.075, 0.17, 0.17, 0.36, 0.14, 0.0015, 0.062, 0.18, 1.2]) },
        'diode-zener':     { name: 'Diode, voltage reference / zener', section: '6.1', cite: A5, piQ: PQ_DISCRETE, defaultQuality: 'JANTX',
            lambdaG: L([0.0033, 0.024, 0.039, 0.035, 0.082, 0.066, 0.15, 0.13, 0.27, 0.12, 0.0016, 0.060, 0.16, 1.3]) },
        // ---- transistors (§6.3–6.4), p. A-5 ----------------------------------
        'xstr-npn':   { name: 'Transistor, NPN/PNP (f < 200 MHz)', section: '6.3', cite: A5, piQ: PQ_DISCRETE, defaultQuality: 'JANTX',
            lambdaG: L([0.00015, 0.0011, 0.0017, 0.0017, 0.0037, 0.0030, 0.0067, 0.0060, 0.013, 0.0056, 0.000073, 0.0027, 0.0074, 0.056]) },
        'xstr-power': { name: 'Transistor, power NPN/PNP (f < 200 MHz)', section: '6.3', cite: A5, piQ: PQ_DISCRETE, defaultQuality: 'JANTX',
            lambdaG: L([0.0057, 0.042, 0.069, 0.063, 0.15, 0.12, 0.26, 0.23, 0.50, 0.22, 0.0029, 0.11, 0.29, 2.2]) },
        'xstr-fet':   { name: 'Transistor, Si FET (f ≤ 400 MHz)', section: '6.4', cite: A5, piQ: PQ_DISCRETE, defaultQuality: 'JANTX',
            lambdaG: L([0.014, 0.099, 0.16, 0.15, 0.34, 0.28, 0.62, 0.53, 1.1, 0.51, 0.0069, 0.25, 0.68, 5.3]) },
        // ---- resistors (§9.1), p. A-7 ----------------------------------------
        'res-comp':   { name: 'Resistor, composition (RCR)', section: '9.1', cite: A7, piQ: PQ_RESISTOR, defaultQuality: 'M',
            lambdaG: L([0.0022, 0.011, 0.051, 0.034, 0.13, 0.071, 0.091, 0.17, 0.23, 0.25, 0.0011, 0.12, 0.34, 4.9]) },
        'res-film':   { name: 'Resistor, film insulated (RLR)', section: '9.1', cite: A7, piQ: PQ_RESISTOR, defaultQuality: 'M',
            lambdaG: L([0.0037, 0.016, 0.070, 0.050, 0.18, 0.080, 0.11, 0.16, 0.22, 0.29, 0.0018, 0.16, 0.40, 7.0]) },
        'res-ww-acc': { name: 'Resistor, wirewound accurate (RBR)', section: '9.1', cite: A7, piQ: PQ_RESISTOR, defaultQuality: 'M',
            lambdaG: L([0.0024, 0.010, 0.044, 0.031, 0.11, 0.054, 0.069, 0.11, 0.15, 0.19, 0.0012, 0.10, 0.26, 4.5]) },
        'res-ww-pwr': { name: 'Resistor, wirewound power (RWR)', section: '9.1', cite: A7, piQ: PQ_RESISTOR, defaultQuality: 'M',
            lambdaG: L([0.0085, 0.038, 0.16, 0.11, 0.41, 0.19, 0.25, 0.38, 0.52, 0.68, 0.0043, 0.36, 0.94, 16]) },
        // ---- capacitors (§10.1), p. A-8 --------------------------------------
        'cap-ceramic': { name: 'Capacitor, ceramic general purpose (CK)', section: '10.1', cite: A8, piQ: PQ_CAPACITOR, defaultQuality: 'M',
            lambdaG: L([0.0017, 0.026, 0.064, 0.018, 0.048, 0.057, 0.071, 0.20, 0.24, 0.19, 0.00086, 0.064, 0.24, 1.5]) },
        'cap-tant':    { name: 'Capacitor, solid tantalum (CSR)', section: '10.1', cite: A8, piQ: PQ_CAPACITOR, defaultQuality: 'M',
            lambdaG: L([0.0014, 0.017, 0.037, 0.012, 0.027, 0.026, 0.032, 0.068, 0.082, 0.087, 0.00070, 0.037, 0.11, 0.96]) },
        'cap-alum':    { name: 'Capacitor, aluminum oxide (CU/CUR)', section: '10.1', cite: A8, piQ: PQ_CAPACITOR, defaultQuality: 'M',
            lambdaG: L([0.0013, 0.019, 0.047, 0.014, 0.036, 0.042, 0.052, 0.15, 0.18, 0.14, 0.00063, 0.047, 0.17, 1.1]) },
        'cap-mica':    { name: 'Capacitor, mica dipped (CM)', section: '10.1', cite: A8, piQ: PQ_CAPACITOR, defaultQuality: 'M',
            lambdaG: L([0.00057, 0.0088, 0.022, 0.0062, 0.016, 0.019, 0.024, 0.069, 0.082, 0.064, 0.00029, 0.022, 0.080, 0.50]) },
        // ---- inductive devices (§11.1), p. A-9 -------------------------------
        'xfmr-power': { name: 'Transformer, power', section: '11.1', cite: A9, piQ: PQ_INDUCTIVE, defaultQuality: 'MIL-SPEC',
            lambdaG: L([0.053, 0.36, 0.77, 0.30, 1.0, 0.44, 0.58, 0.60, 0.77, 1.7, 0.026, 0.83, 2.5, 37]) },
        'xfmr-audio': { name: 'Transformer, audio', section: '11.1', cite: A9, piQ: PQ_INDUCTIVE, defaultQuality: 'MIL-SPEC',
            lambdaG: L([0.015, 0.10, 0.22, 0.086, 0.29, 0.12, 0.17, 0.17, 0.22, 0.50, 0.0075, 0.24, 0.70, 10]) },
        // ---- relays / switches / breakers (§13–14), p. A-9 -------------------
        'relay-gp': { name: 'Relay, general purpose (balanced armature)', section: '13.1', cite: A9, piQ: PQ_RELAY, defaultQuality: 'MIL-SPEC',
            lambdaG: L([0.049, 0.12, 1.0, 0.50, 1.9, 0.60, 0.77, 1.3, 1.4, 3.9, 0.025, 1.7, 5.7, null]) },   // CL marked '*' in handbook
        'switch-toggle': { name: 'Switch, toggle', section: '14.1', cite: A9, piQ: PQ_SWITCH, defaultQuality: 'MIL-SPEC',
            lambdaG: L([0.10, 0.30, 1.8, 0.80, 2.9, 1.0, 1.8, 1.3, 2.2, 4.6, 0.050, 2.5, 6.7, 32]) },
        'breaker': { name: 'Circuit breaker (all)', section: '14.2', cite: A9, piQ: PQ_BREAKER, defaultQuality: 'MIL-SPEC',
            lambdaG: L([0.68, 1.4, 10, 5.4, 18, 4.8, 6.1, 7.5, 8.2, 31, 0.34, 17, 45, null]) },              // CL marked '*' in handbook
        // ---- connectors (§15.1), p. A-9 --------------------------------------
        'conn-circ': { name: 'Connector, circular', section: '15.1', cite: A9, piQ: PQ_CONNECTOR, defaultQuality: 'MIL-SPEC',
            lambdaG: L([0.0011, 0.0013, 0.011, 0.0065, 0.018, 0.0049, 0.0082, 0.016, 0.025, 0.031, 0.00055, 0.014, 0.044, 0.64]) },
        'conn-rect': { name: 'Connector, rectangular', section: '15.1', cite: A9, piQ: PQ_CONNECTOR, defaultQuality: 'MIL-SPEC',
            lambdaG: L([0.023, 0.060, 0.52, 0.30, 0.84, 0.23, 0.38, 0.75, 1.1, 1.4, 0.011, 0.65, 2.0, 29]) },
        'conn-pcb':  { name: 'Connector, PCB card edge', section: '15.1', cite: A9, piQ: PQ_CONNECTOR, defaultQuality: 'MIL-SPEC',
            lambdaG: L([0.044, 0.052, 0.45, 0.26, 0.73, 0.20, 0.33, 0.65, 0.98, 1.3, 0.022, 0.56, 1.8, 25]) }
    };

    const DATA = {
        meta: {
            source: 'MIL-HDBK-217F Notice 2 (28 Feb 1995), Appendix A Parts Count, pp. A-5..A-11; transcribed from staged handbook 20 Jul 2026',
            unit: 'failures per 10^6 hours',
            deferred: 'Microcircuits (πQ·πL composition, pp. A-1..A-4) deferred to v0.2 — not encoded until the learning factor is handled properly.'
        },
        environments: ENVIRONMENTS,
        categories: CATEGORIES
    };

    if (typeof window !== 'undefined') window.RAM_PREDICT_DATA = DATA;
    if (typeof module !== 'undefined') module.exports = DATA;
})();
