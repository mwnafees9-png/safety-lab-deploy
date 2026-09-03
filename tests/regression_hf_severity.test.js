#!/usr/bin/env node
/*
 * Regression — INV-HFW crew-workload ↔ FHA-severity check (hf_severity_check.js)
 * plus the HF register workload-band capture (hf_register_panel.js).
 *
 * Verifies the divergence logic (band→severity map, material-gap threshold,
 * FCIM awareness context, advisory-only), that it registers into the invariants
 * sweep, and that the HF task ledger captures a structured workload band via the
 * existing setHf data-f channel.
 * Run: node tests/regression_hf_severity.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const m = S('hf_severity_check.js');
check('maps workload bands to 25.1309 severities (slight→Minor … excessive→Hazardous)',
  /slight:\s*'Minor'/.test(m) && /significant:\s*'Major'/.test(m) && /excessive:\s*'Hazardous'/.test(m));
check('flags only a material gap (≥2 bands), staying low-noise', /GAP\s*=\s*2/.test(m) && /gap < GAP/.test(m));
check('reads the structured workload band from linked HF assumptions',
  /assumptionIds/.test(m) && /a\.hf\.workloadBand/.test(m) && /type === 'hf'/.test(m));
check('falls back to a conservative crew-effect text read', /_bandFromText/.test(m) && /effCrew/.test(m));
check('surfaces FCIM crew awareness as context', /_awarenessForFc/.test(m) && /tlId|plId|mId/.test(m));
check('offers the two dispositions (verify severity / update effect)',
  /Verify the severity|update the crew effect/i.test(m));
check('registers as an advisory invariant INV-HFW into the sweep',
  /invRegister/.test(m) && /id:\s*'INV-HFW'/.test(m) && /sev:\s*'advisory'/.test(m));
check('retries registration if invariants.js loads later', /setInterval/.test(m) && /_register\(\)/.test(m));
check('defensive — never throws (guarded accessors)', /try\s*{/.test(m) && /catch\s*\(_\)/.test(m));
check('exposes HFSeverityCheck for tests / future FHA-row badge', /window\.HFSeverityCheck/.test(m));

const p = S('hf_register_panel.js');
check('HF task ledger captures a structured workload band', /data-f="workloadBand"/.test(p));
check('band options are the 25.1309 set', /'none', 'slight', 'significant', 'excessive', 'incapacitating'/.test(p));
check('workload column added to the ledger header', /<th[^>]*>Workload<\/th>/.test(p) || /Workload<\/th>/.test(p));

const idx = S('index.html');
check('index.html loads hf_severity_check.js', /hf_severity_check\.js\?v=/.test(idx));
// 30 Aug 2026 — superseded in place: this was a LITERAL pin (=0.7) — exactly
// what rule 12 forbids; it broke on the export-parity bump for the wrong
// reason. Floor from here on.
check('hf_register_panel version floor >= 0.8', (function () { const m = idx.match(/hf_register_panel\.js\?v=([\d.]+)/); return !!m && parseFloat(m[1]) >= 0.8; })());

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
