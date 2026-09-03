#!/usr/bin/env node
/*
 * Regression tests for Backlog #1b — AI-assumption citations + walkthrough.
 *
 * Loads the REAL site/ai_badges.js headlessly and locks:
 *   [1] verifyCitations — verbatim quote matching against source-document text:
 *       exact hit, whitespace/smart-quote normalization, miss (flagged), missing
 *       document, blank doc name (search-all, honestly labeled), too-short quote.
 *   [2] assumptionConfidence — the pill verdict: L2 all-verified, L1 partial,
 *       L0 uncited / legacy; Open→red, Confirmed+L2→green, Confirmed<L2→amber,
 *       Rejected→null.
 *
 * Run:  node tests/regression_ai_citations.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

globalThis.window = globalThis;
eval(fs.readFileSync(path.join(__dirname, '..', 'site', 'ai_badges.js'), 'utf8'));
const AB = globalThis.AiBadges;
check('verifyCitations + assumptionConfidence exported', typeof AB.verifyCitations === 'function' && typeof AB.assumptionConfidence === 'function');

console.log('\n[1] verifyCitations — the core checks, the AI never self-certifies');
const DOCS = [
  { name: 'K350 SDD Rev C.docx', text: 'The elevator actuation system comprises two independent electro-mechanical actuators, each powered from a separate 28 VDC bus. Battery thermal management is safety-critical on this platform.' },
  { name: 'Flight Manual.pdf', text: 'In the event of a single actuator failure, the remaining actuator provides full pitch authority throughout the envelope.' },
];

const exact = AB.verifyCitations([{ doc: 'K350 SDD Rev C.docx', quote: 'two independent electro-mechanical actuators', where: '§4.2' }], DOCS);
check('verbatim quote in the named doc → verified ✓', exact[0].verified === true && exact[0].docFound === true, JSON.stringify(exact[0]));

const smart = AB.verifyCitations([{ doc: 'K350 SDD', quote: 'each  powered from a\nseparate 28 VDC bus' }], DOCS);
check('whitespace-mangled quote + partial doc name → still verified (normalized)', smart[0].verified === true && smart[0].docFound === true, JSON.stringify(smart[0]));

const fabricated = AB.verifyCitations([{ doc: 'K350 SDD Rev C.docx', quote: 'the actuators share a common power supply' }], DOCS);
check('fabricated quote → NOT verified, doc found (✗ quote not in document)', fabricated[0].verified === false && fabricated[0].docFound === true, JSON.stringify(fabricated[0]));

const wrongDoc = AB.verifyCitations([{ doc: 'Nonexistent ICD.pdf', quote: 'remaining actuator provides full pitch authority' }], DOCS);
check('wrong doc name but quote exists elsewhere → verified with matchedDoc recorded', wrongDoc[0].verified === true && wrongDoc[0].docFound === false && wrongDoc[0].matchedDoc === 'Flight Manual.pdf', JSON.stringify(wrongDoc[0]));

const blankDoc = AB.verifyCitations([{ doc: '', quote: 'Battery thermal management is safety-critical' }], DOCS);
check('blank doc name → search all docs, verified with matchedDoc', blankDoc[0].verified === true && blankDoc[0].matchedDoc === 'K350 SDD Rev C.docx', JSON.stringify(blankDoc[0]));

const tooShort = AB.verifyCitations([{ doc: 'K350 SDD Rev C.docx', quote: 'the' }], DOCS);
check('quote too short to be evidence (<8 chars) → never verified', tooShort[0].verified === false);

const noDocs = AB.verifyCitations([{ doc: 'K350 SDD Rev C.docx', quote: 'two independent electro-mechanical actuators' }], []);
check('no source docs on file → unverified, doc not found', noDocs[0].verified === false && noDocs[0].docFound === false);

console.log('\n[2] assumptionConfidence — pill verdicts');
const v = q => AB.verifyCitations([{ doc: 'K350 SDD Rev C.docx', quote: q }], DOCS);
const openCited = AB.assumptionConfidence({ status: 'Open', basis: 'cited', citations: v('two independent electro-mechanical actuators'), rationale: 'r' });
check('Open + all citations verified → RED (unconfirmed) but grade L2', openCited.tier === 'red' && openCited.grade === 'L2', JSON.stringify(openCited));
const confL2 = AB.assumptionConfidence({ status: 'Confirmed', basis: 'cited', citations: v('two independent electro-mechanical actuators'), rationale: 'r' });
check('Confirmed + L2 → GREEN', confL2.tier === 'green' && confL2.grade === 'L2');
const confPartial = AB.assumptionConfidence({ status: 'Confirmed', basis: 'cited', citations: v('two independent electro-mechanical actuators').concat(v('a fabricated claim about hydraulics')), rationale: 'r' });
check('Confirmed + partially verified citations → AMBER L1', confPartial.tier === 'amber' && confPartial.grade === 'L1', JSON.stringify(confPartial));
const uncited = AB.assumptionConfidence({ status: 'Confirmed', basis: 'uncited', citations: [], rationale: 'r', ifWrong: 'x' });
check('Confirmed but UNCITED → AMBER L0 (model prior, engineer-vouched only)', uncited.tier === 'amber' && uncited.grade === 'L0', JSON.stringify(uncited));
const legacy = AB.assumptionConfidence({ status: 'Open', text: 'old row' });
check('legacy row (pre-capture) → L0 with the re-run hint in the why', legacy.grade === 'L0' && legacy.why.some(w => /re-run/.test(w)), JSON.stringify(legacy));
check('Rejected → null (struck, dispositioned)', AB.assumptionConfidence({ status: 'Rejected', citations: [] }) === null);
check('why states the core verifies, never the AI', confL2.why.some(w => /never certifies its own quotes/.test(w)));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
