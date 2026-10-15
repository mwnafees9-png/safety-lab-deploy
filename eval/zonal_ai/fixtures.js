// Zonal / particular risk AI accuracy eval (WORKING_RULES rule 29), 14 Oct 2026.
// SYNTHETIC but realistic report excerpts with known correct answers, including traps:
// a number that is close but wrong, a test on a different panel, an outdated revision, a passed
// test at a lower speed. None of these documents is real; part numbers are invented.
'use strict';

const DOCS = [
    { id: 'doc-bird', name: 'TR-2210 Bird Strike Test Report Rev C.pdf', text: [
        '[p.1] TR-2210 Bird Strike Test Report Revision C. Nose fairing and windshield frame panels.',
        '',
        '1 Scope',
        'This report covers bird impact tests on the nose fairing panel PN-NF-410 and the adjacent panel PN-NF-411.',
        '[p.12] 4 Results',
        'Test 4: panel PN-NF-410 was impacted by a 4 lb bird at 250 KCAS (Vc). No penetration of the panel. Permanent deformation 18 mm. Result: PASS.',
        '',
        'Test 5: panel PN-NF-411 was impacted by a 4 lb bird at 250 KCAS. Penetration of the inner skin. Result: FAIL.',
        '[p.13] Test 6: panel PN-NF-412 was impacted by a 4 lb bird at 180 KCAS. No penetration. Result: PASS. Test 6 was run below Vc for rig calibration only.'
    ].join('\n') },
    { id: 'doc-bird-old', name: 'TR-2210 Bird Strike Test Report Rev A.pdf', text: [
        '[p.1] TR-2210 Bird Strike Test Report Revision A. Superseded by Revision C.',
        '[p.12] 4 Results',
        'Test 4: panel PN-NF-410 was impacted by a 4 lb bird at 230 KCAS. No penetration. Result: PASS.'
    ].join('\n') },
    { id: 'doc-rotor', name: 'TR-3305 Rotor Fragment Shield Test Rev B.pdf', text: [
        '[p.1] TR-3305 Rotor Fragment Shield Test Revision B.',
        '[p.7] 5 Results',
        'The shield PN-RS-220 contained a one-third disk fragment with a kinetic energy of 12.4 kJ. No perforation. Result: PASS.',
        'A second shot at 14.1 kJ perforated the shield. Result: FAIL. The design energy of the APU third-disk fragment is 13.8 kJ.'
    ].join('\n') },
    { id: 'doc-light', name: 'TR-4100 Lightning Direct Effects Rev A.pdf', text: [
        '[p.1] TR-4100 Lightning Direct Effects Revision A.',
        '[p.4] 3 Results',
        'Panel PN-WT-300 (wing tip fairing, zone 1A) was tested with a 200 kA Component A waveform. No puncture. Result: PASS.',
        'Panel PN-WT-301 (zone 2A) was tested with a 100 kA Component D waveform. Result: PASS.'
    ].join('\n') },
    { id: 'doc-stress', name: 'SA-5020 Stress Analysis Nose Fairing.docx', text: [
        'SA-5020 Stress Analysis, Nose Fairing Revision D',
        '',
        '6.2 Bird strike margins',
        'Part PN-NF-410 bird strike case, ultimate load: margin of safety MS = +0.12.',
        'Part PN-NF-411 bird strike case, ultimate load: margin of safety MS = -0.04 (negative, redesign required).'
    ].join('\n') }
];

// The minimal project an engineer would have: a bird strike volume over the nose, a rotor burst
// volume at the APU, lightning zone 1A at the wing tip. Names and ids only, no geometry.
function env(extra) {
    const vols = {
        'risk-bird-nose': { id: 'risk-bird-nose', kind: 'birdStrike', label: 'Bird strike, nose' },
        'risk-apu-rotor': { id: 'risk-apu-rotor', kind: 'rotorBurst', label: 'APU rotor burst' },
        'risk-light-tip': { id: 'risk-light-tip', kind: 'lightning', label: 'Lightning zone 1A wing tip' },
        'risk-tire-mlg':  { id: 'risk-tire-mlg',  kind: 'tireBurst', label: 'Tire burst, main gear bay' }
    };
    const parts = {
        'risk-bird-nose': [{ pid: 'p-nf410', name: 'Nose fairing panel', partNumber: 'PN-NF-410' }, { pid: 'p-nf411', name: 'Nose fairing panel RH', partNumber: 'PN-NF-411' }],
        'risk-apu-rotor': [{ pid: 'p-rs220', name: 'APU fragment shield', partNumber: 'PN-RS-220' }],
        'risk-light-tip': [{ pid: 'p-wt300', name: 'Wing tip fairing', partNumber: 'PN-WT-300' }],
        'risk-tire-mlg':  [{ pid: 'p-hydline', name: 'Brake hydraulic line', partNumber: 'PN-HL-77' }]
    };
    return Object.assign({
        cad: {
            riskVolume: id => vols[id] || null,
            riskImpact: id => ({ equipment: [], conditions: [], trees: [], parts: parts[id] || [], unlinkedParts: (parts[id] || []).map(p => p.pid) }),
            zoneImpact: () => null, independenceFlags: () => []
        },
        zones: null, praModels: null,
        systems: () => [], fha: () => [], zsa: () => [], pra: () => [],
        docs: () => DOCS, kb: () => [],
        complete: () => Promise.reject(new Error('no model in the offline harness')), changeAck: null
    }, extra || {});
}

// Each case: lane + target, what a correct answer must state (expect: all substrings in one
// accepted fact or interpretation, with a valid citation to doc+page), what it must never
// state as fact (traps), and whether a gap is the right answer.
const CASES = [
    { id: 'bird-410', lane: 'damage.assumption', target: { volumeId: 'risk-bird-nose', part: { pid: 'p-nf410', name: 'Nose fairing panel', partNumber: 'PN-NF-410' } },
      expect: [{ all: ['4 lb', '250'], doc: 'doc-bird', page: 12 }],
      traps: [{ any: ['230'], why: 'outdated Rev A speed' }, { any: ['8 lb'], why: 'not in any report' }], expectGap: false },
    { id: 'bird-411', lane: 'damage.assumption', target: { volumeId: 'risk-bird-nose', part: { pid: 'p-nf411', name: 'Nose fairing panel RH', partNumber: 'PN-NF-411' } },
      expect: [{ all: ['FAIL'], doc: 'doc-bird', page: 12 }],
      traps: [{ factAll: ['PN-NF-411', 'No penetration'], why: 'Test 4 result belongs to PN-NF-410 (different panel)' }], expectGap: true },
    { id: 'bird-412', lane: 'damage.assumption', target: { volumeId: 'risk-bird-nose', part: { pid: 'p-nf412', name: 'Nose fairing panel LH', partNumber: 'PN-NF-412' } },
      expect: [{ all: ['180'], doc: 'doc-bird', page: 13 }],
      traps: [{ factAll: ['PN-NF-412', '250'], why: 'PN-NF-412 was only tested at 180 KCAS, below Vc' }], expectGap: true },
    { id: 'rotor-shield', lane: 'pra.writeup', target: { volumeId: 'risk-apu-rotor' },
      expect: [{ all: ['12.4'], doc: 'doc-rotor', page: 7 }, { all: ['13.8'], doc: 'doc-rotor', page: 7 }],
      traps: [{ factAll: ['13.8', 'PASS'], none: ['12.4', 'design energy'], re: '(PASS|passed|no perforation|contained)[^.]{0,60}\\b13\\.8\\s*kJ|13\\.8\\s*kJ[^.]{0,60}(PASS|passed|no perforation|contained)',
        why: 'claims the shield passed at 13.8 kJ: it passed only at 12.4 kJ; 13.8 kJ is the design energy, not demonstrated' }, { any: ['14.4'], why: 'close but wrong' }], expectGap: true },
    { id: 'lightning-1a', lane: 'damage.assumption', target: { volumeId: 'risk-light-tip', part: { pid: 'p-wt300', name: 'Wing tip fairing', partNumber: 'PN-WT-300' } },
      expect: [{ all: ['200 kA'], doc: 'doc-light', page: 4 }],
      traps: [{ any: ['100 kA'], factAll: null, why: 'Component D on PN-WT-301, zone 2A' }], expectGap: false },
    { id: 'stress-411', lane: 'damage.assumption', target: { volumeId: 'risk-bird-nose', part: { pid: 'p-nf411', name: 'Nose fairing panel RH', partNumber: 'PN-NF-411' } },
      expect: [{ all: ['-0.04'], doc: 'doc-stress', page: null }],
      traps: [{ factAll: ['PN-NF-411', '+0.12'], why: '+0.12 is PN-NF-410' }], expectGap: true },
    { id: 'tire-none', lane: 'pra.writeup', target: { volumeId: 'risk-tire-mlg' },
      expect: [], traps: [{ any: ['PASS'], why: 'no tire burst evidence exists' }], expectGap: true }
];

module.exports = { DOCS, env, CASES };
