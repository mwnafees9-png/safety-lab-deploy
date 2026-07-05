// spine/en50126.js — THE STANDARD AS DATA (Constitution rule 3).
// Everything rail-specific lives here: lifecycle, risk matrix, THR→SIL,
// checklist objectives, palette. FuSa Lab = a sibling file, zero core edits.

export const spine = {
    id: 'en50126',
    productName: 'RAMS Lab',
    tagline: 'EN 50126 · 50128 · 50129 · CSM-RA',

    lifecycle: [
        { id: 'ph1_3', label: 'PH 1–3', name: 'Concept & Risk Policy' },
        { id: 'ph4', label: 'PH 4', name: 'System Definition + PHA' },
        { id: 'ph5', label: 'PH 5', name: 'Risk Assessment · THR' },
        { id: 'ph6', label: 'PH 6', name: 'Requirements & SIL' },
        { id: 'ph7_8', label: 'PH 7–8', name: 'Design & Verification' },
        { id: 'ph9_12', label: 'PH 9–12', name: 'Safety Case & Acceptance' },
    ],

    // Frequency × severity → risk category. This is the EXPLICIT example
    // calibration published in EN 50126-1 (risk evaluation example) — encoded
    // as data, not a scoring formula, because calibration is a project act
    // under CSM-RA: replace this table per project, never bend a heuristic.
    frequencies: ['Incredible', 'Improbable', 'Remote', 'Occasional', 'Probable', 'Frequent'],
    severities: ['Insignificant', 'Marginal', 'Critical', 'Catastrophic'],
    riskMatrix: {
        categories: ['Negligible', 'Tolerable', 'Undesirable', 'Intolerable'],
        // rows = frequency (ascending, Incredible→Frequent); cols = severity
        table: [
            ['Negligible', 'Negligible', 'Negligible', 'Negligible'],   // Incredible
            ['Negligible', 'Negligible', 'Tolerable',  'Tolerable'],    // Improbable
            ['Negligible', 'Tolerable',  'Undesirable','Undesirable'],  // Remote
            ['Tolerable',  'Undesirable','Undesirable','Intolerable'],  // Occasional
            ['Tolerable',  'Undesirable','Intolerable','Intolerable'],  // Probable
            ['Undesirable','Intolerable','Intolerable','Intolerable'],  // Frequent
        ],
        cell(freqIdx, sevIdx) {
            const row = this.table[freqIdx];
            return (row && row[sevIdx]) || 'Negligible';
        },
    },

    // EN 50129 Table A.1 (THR per hazardous failure mode, per hour → SIL).
    // Ranges are closed below, OPEN above: 1e-9 ≤ THR < 1e-8 → SIL 4, so a
    // THR of exactly 1e-8 belongs to SIL 3. THR below 1e-9 stays SIL 4 (the
    // standard defines no process beyond SIL 4 — tighter targets are met by
    // architecture, not by a higher SIL).
    silFromThr(thr) {
        if (!(thr > 0)) return null;
        if (thr < 1e-8) return 4;
        if (thr < 1e-7) return 3;
        if (thr < 1e-6) return 2;
        if (thr < 1e-5) return 1;
        return 0;
    },

    riskAcceptancePrinciples: ['Code of Practice', 'Reference System', 'Explicit Risk Estimation'],

    hazardStates: ['open', 'controlled', 'transferred', 'closed'],
    sracStates: ['open', 'exported', 'accepted', 'verified'],

    safetyCaseParts: [
        { id: 'p1', name: 'Definition of System' },
        { id: 'p2', name: 'Quality Management Report' },
        { id: 'p3', name: 'Safety Management Report' },
        { id: 'p4', name: 'Technical Safety Report' },
        { id: 'p5', name: 'Related Safety Cases' },
        { id: 'p6', name: 'Conclusion' },
    ],

    // Phase-gate checklists (ISA gates). kind 'auto' items are evaluated by the
    // dashboard against live state; 'attest' items are signed acts.
    checklists: {
        ph4: [
            { id: 'sysdef', kind: 'auto', label: 'System definition and boundary recorded', eval: s => !!(s.systemDef.description && s.systemDef.boundary) },
            { id: 'pha', kind: 'auto', label: 'Every hazard classified on the risk matrix', eval: s => s.hazards.length > 0 && s.hazards.every(h => h.frequency != null && h.severity != null) },
            { id: 'rap', kind: 'auto', label: 'Risk-acceptance principle chosen per hazard', eval: s => s.hazards.every(h => !!h.principle) },
            { id: 'rev', kind: 'attest', label: 'PHA review held (multi-disciplinary)' },
        ],
        ph5: [
            { id: 'thr', kind: 'auto', label: 'THR set for every non-negligible hazard', eval: s => s.hazards.filter(h => h.category !== 'Negligible').every(h => h.thr > 0) },
            { id: 'app', kind: 'auto', label: 'THR apportioned to subsystems', eval: s => s.thr.length > 0 },
            { id: 'isa', kind: 'attest', label: 'ISA agreement on risk assessment basis' },
        ],
        ph6: [
            { id: 'sil', kind: 'auto', label: 'SIL allocated wherever a THR demands one', eval: s => s.hazards.filter(h => h.thr > 0).every(h => h.sil != null) },
            { id: 'srac', kind: 'auto', label: 'SRACs exported for external conditions', eval: s => s.sracs.length > 0 },
            { id: 'acc', kind: 'attest', label: 'Requirements accepted by design authority' },
        ],
    },

    // Ink-on-paper identity: monochrome EXCEPT risk & SIL, which keep color.
    palette: {
        risk: { Intolerable: '#8E2A2A', Undesirable: '#9A6200', Tolerable: '#1D6E3E', Negligible: '#3D5A80' },
        sil: { 4: '#8E2A2A', 3: '#9A6200', 2: '#1D6E3E', 1: '#3D5A80', 0: '#5B4FA8' },
    },
};
