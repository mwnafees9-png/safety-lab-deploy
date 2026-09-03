#!/usr/bin/env node
/*
 * Regression — the coverage checklist reads titles the way documents write them.
 *
 * Two gaps, both found LIVE while building the Halcyon SDD fixture (31 Aug):
 *   G1  An em-dash (or en-dash / apostrophe) inside a section title made the
 *       WHOLE section invisible to _decompSectionChecklist — "6.2 Hull — Forward
 *       Compartment (HULL)" simply vanished from the denominator, so the
 *       coverage banner said 14 of 16 with two systems silently absent from
 *       BOTH sides of the fraction. A checker whose denominator quietly shrinks
 *       is the exact failure it exists to catch.
 *   G2  A system code carrying a digit — (HYD2), (ECS1) — failed the
 *       [A-Z]{2,5} code match, so mirrored chapters for that system did not
 *       group and its title keyed on prose instead.
 *
 * Executed against the REAL _decompSectionChecklist extracted from
 * ai_assistant.js and the REAL spec_index.js loaded whole in a vm — never a
 * re-implementation. spec_index shares both regex shapes (CHAPTER_RE,
 * SECTION_RE, the code cut), so it is proven here too.
 *
 * Run: node tests/regression_decomp_checklist_titles.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');

// ---- extract the real checklist fn (+ the nonfunc filter it closes over) ----
const fnम = ai.match(/function _decompSectionChecklist\(srcText\) \{[\s\S]*?\n    \}/);
const nf = ai.match(/var _DECOMP_NONFUNC = .*;/);
if (!fnम || !nf) { console.log('  FAIL  parser not extractable'); process.exit(1); }
const ctx = vm.createContext({});
vm.runInContext(nf[0] + '\n' + fnम[0] + '\n', ctx);
const checklist = (txt) => vm.runInContext('_decompSectionChecklist', ctx)(txt);

const SDD = [
  '3.1 Flight Control System (FCS)   The aircraft shall...',
  '3.2 Hull — Forward Compartment (HULL)   Pressure boundary...',
  '3.3 Hydraulic System 2 (HYD2)   Secondary hydraulics...',
  "3.4 Pilot's Oxygen Supply (POX)   Emergency oxygen...",
  '3.5 Energy Storage – Battery (BATT)   Main battery...',
  '4.1 Flight Control System (FCS)   Failure modes...',
  '4.2 Hull — Forward Compartment (HULL)   Failure modes...',
  '4.3 Hydraulic System 2 (HYD2)   Failure modes...',
  '5.1 Document Overview   not a system',
].join('\n');

const groups = checklist(SDD);
const byTitle = {};
groups.forEach(g => { byTitle[g.title] = g; });

// G1 — dash + apostrophe titles exist in the denominator
check('G1a em-dash title is parsed', !!byTitle['Hull — Forward Compartment (HULL)'],
  'got: ' + groups.map(g => g.title).join(' | '));
check('G1b en-dash title is parsed', !!byTitle['Energy Storage – Battery (BATT)']);
check("G1c apostrophe title is parsed", !!byTitle["Pilot's Oxygen Supply (POX)"]);

// G2 — digit-bearing code still cuts the title and groups mirrored chapters
const hyd = byTitle['Hydraulic System 2 (HYD2)'];
check('G2a digit code (HYD2) title cut at the parenthetical', !!hyd);
check('G2b digit code groups its mirrored chapters (3.3 + 4.3)',
  !!hyd && hyd.secs.indexOf('3.3') >= 0 && hyd.secs.indexOf('4.3') >= 0,
  hyd ? hyd.secs.join(',') : 'group missing');
// G2c — the code KEY itself, isolated from the title-key fallback: mirrored
// chapters that word the title DIFFERENTLY only group through the code, so a
// digit-bearing code must key the group (this is what a reverted code regex
// silently breaks while G2b still passes on identical titles).
(function () {
  const g2 = checklist('3.6 Battery System 1 (BAT1)   Cells...\n4.6 Battery 1 Failure Modes (BAT1)   FMEA...\n');
  check('G2c differently-worded mirrors group through the digit code',
    g2.length === 1 && g2[0].secs.indexOf('3.6') >= 0 && g2[0].secs.indexOf('4.6') >= 0,
    JSON.stringify(g2.map(g => [g.title, g.secs])));
})();

// the original behavior must survive the widening
check('plain title still parsed and grouped across chapters',
  !!byTitle['Flight Control System (FCS)'] && byTitle['Flight Control System (FCS)'].secs.length === 2);
check('non-functional sections still filtered', !byTitle['Document Overview']
  && groups.length === 5, 'groups: ' + groups.length);

// ---- spec_index shares the shapes: load the real module, feed the same SDD --
const specSrc = fs.readFileSync(path.join(SITE, 'spec_index.js'), 'utf8');
const wctx = vm.createContext({ window: {}, console: console });
vm.runInContext(specSrc, wctx);
const idx = vm.runInContext('window.SLABSpecIndex', wctx);
const doc = '1 Overview   intro text\n3 Systems   the systems chapter\n' + SDD + '\n';
const parsed = idx && idx.build ? idx.build(doc) : null;
if (parsed && parsed.chapters) {
  const ch3 = parsed.chapters.find(c => c.num === 3);
  const codes = ch3 ? (ch3.codes || []).map(c => c.code) : [];
  check('spec_index sees the em-dash section code (HULL)', codes.indexOf('HULL') >= 0, codes.join(','));
  check('spec_index sees the digit code (HYD2)', codes.indexOf('HYD2') >= 0, codes.join(','));
} else {
  check('spec_index build() reachable for the twin proof', false, 'window.SLABSpecIndex.build missing or shape changed: ' + JSON.stringify(parsed && Object.keys(parsed)));
}

// G3 — the coded-document noise rule: with 3+ coded groups, an uncoded
// single-section stray (a figure legend's numbered line) is dropped; in an
// UNCODED document nothing is dropped (title-key mode untouched).
(function () {
  const noisy = SDD + '\n2.2 Signal / data  — legend line, not a system\n';
  const g3 = checklist(noisy);
  check('G3a legend stray dropped in a coded document',
    !g3.some(g => /signal/i.test(g.title)) && g3.length === 5,
    JSON.stringify(g3.map(g => g.title)));
  const uncoded = '3.1 Braking   text\n3.2 Steering   text\n3.3 Signal / data  standalone\n';
  const g3b = checklist(uncoded);
  check('G3b uncoded document keeps every section',
    g3b.length === 3, JSON.stringify(g3b.map(g => g.title)));
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
