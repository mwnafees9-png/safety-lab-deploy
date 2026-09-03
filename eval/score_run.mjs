#!/usr/bin/env node
// eval/score_run.mjs — AI repeatability scorer (CLI).
//   F1  first cut 2026-08-29: semantic matching by normalized text.
//   F1b 2026-08-30: topic|failure-mode matching (see EXPORT_RUN.md).
//   30 Aug 2026 (in-app hooks): ALL scoring logic moved VERBATIM to
//   site/eval_core.js so the same instrument scores runs from this CLI and
//   from inside the product (window.SLABEvalCore → runRepeatabilityCheck).
//   This file is now a thin shell: load files, call the core, print, exit.
//   The identity + mutation proofs in regression_ai_repeatability.test.js run
//   through this CLI and therefore through the shared core.
//
// Usage:
//   node eval/score_run.mjs <golden.json> <candidate.json> [--json] [--lax]
//
// Exit codes: 0 = all thresholds met · 1 = at least one metric failed
// (2 = usage/load error). --lax reports without failing.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const core = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'site', 'eval_core.js'));

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter(a => a.startsWith('--')));
if (args.length < 2) {
  console.error('usage: node eval/score_run.mjs <golden.json> <candidate.json> [--json] [--lax]');
  process.exit(2);
}

let golden, cand;
try {
  golden = JSON.parse(readFileSync(args[0], 'utf8'));
  cand = JSON.parse(readFileSync(args[1], 'utf8'));
} catch (e) {
  console.error('load failed: ' + e.message);
  process.exit(2);
}

const r = core.scoreRun(golden, cand);
const report = { golden: args[0], candidate: args[1], ...r };

if (flags.has('--json')) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`repeatability: ${report.verdict}  (matched ${report.matchedFhaRows}/${report.goldenFhaRows} FHA rows — ${report.matchedByText} by text, ${report.matchedFhaRows - report.matchedByText} by topic|mode)`);
  for (const [k, m] of Object.entries(report.metrics)) {
    const v = m.value !== undefined ? m.value : `${m.golden} -> ${m.candidate}`;
    const tag = m.informational ? 'info' : (m.pass ? 'ok  ' : 'FAIL');
    console.log(`  ${tag} ${k}: ${v}`);
  }
  if (report.skippedLanes && report.skippedLanes.length)
    console.log('  lanes skipped (no comparable data): ' + report.skippedLanes.join('; '));
}
process.exit(report.failures.length && !flags.has('--lax') ? 1 : 0);
