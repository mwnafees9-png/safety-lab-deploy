#!/usr/bin/env node
/*
 * Regression — YNWA easter egg (ynwa.js).
 *   A cosmetic overlay triggered by typing "ynwa". Verifies it is self-contained
 *   and failsafe: touches no engine/data/report, doesn't hijack real typing,
 *   ships the Anya & Emma (ANEM) dedication, and is wired into index.html.
 * Run: node tests/regression_ynwa.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const y = S('ynwa.js');
check('exposes a manual trigger window.__ynwa', /window\.__ynwa\s*=/.test(y));
check('idempotent wiring guard', /__ynwaWired/.test(y));
check('trigger sequence is "ynwa"', /var\s+SEQ\s*=\s*'ynwa'/.test(y));
check('keydown detector does not hijack real typing in inputs/textareas/contentEditable',
  /INPUT/.test(y) && /TEXTAREA/.test(y) && /isContentEditable/.test(y));
check('also fires on typing the exact "ynwa" token into a field (input listener)',
  /addEventListener\('input'/.test(y) && /ynwa\$/i.test(y));
check('field trigger only matches the standalone token (word-boundary anchored)',
  /\(\^\|\[\^a-z\]\)ynwa\$/.test(y));
check('has a cooldown so it cannot spam', /_cooling/.test(y));
check('carries the ANEM dedication (Anya & Emma)', /Anya\s*&(amp;)?\s*Emma/.test(y));
check('the dedication is on the scarf sub-line (not a toast)',
  /class="sl-ynwa-sub">Anya/.test(y));
check('no toast layer remains', !/showToast/.test(y));
check('shows the motto phrase', /Never Walk Alone/.test(y));
check('reproduces no lyrics beyond the motto (no full verse markers)',
  !/when you walk through a storm/i.test(y));
check('no club crest/trademark image embedded', !/liverpool|lfc|liverbird/i.test(y));
check('failsafe — swallows its own errors', /catch\s*\(e\)/.test(y) && /never let the egg break/i.test(y));
check('outside the qualified boundary — touches no engine/data/report',
  !/macCompileAll|calculateAllProbabilities|AutoReq|_applyProjectData|renderDocx|snapshotProject/.test(y));

const idx = S('index.html');
check('index.html loads ynwa.js (deferred)', /ynwa\.js\?v=/.test(idx) && /ynwa\.js\?v=[^"]*"\s+defer/.test(idx));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
