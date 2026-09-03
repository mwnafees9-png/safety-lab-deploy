#!/usr/bin/env node
// eval/sev_report.mjs — severity-commitment disagreement report (31 Aug 2026).
//
// THE AXIS. Severity/Cat-commitment variance owns every red metric in the
// full-lane pair (fha agreement 0.421, fta 17/28, cma 35/48). The scorer
// already matches rows semantically (eval_core.pairFhaRows) but only emits
// RATES — an engineer attacking the axis needs to see WHICH conditions flip.
// This report lists, per matched pair: commit<->commit disagreements,
// commitment flips (one side committed, the other abstained), Catastrophic
// membership flips (the FTA-scope driver), and unmatched rows. A report, not
// a gate: exit 0 always ("--json" for machine use).
//
// Usage: node eval/sev_report.mjs <runA.json> <runB.json> [--json]
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const core = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'site', 'eval_core.js'));

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter(a => a.startsWith('--')));
if (args.length < 2) { console.error('usage: node eval/sev_report.mjs <runA.json> <runB.json> [--json]'); process.exit(2); }
const A = core.normalizeRun(JSON.parse(readFileSync(args[0], 'utf8')));
const B = core.normalizeRun(JSON.parse(readFileSync(args[1], 'utf8')));
const { pairs, gTotal } = core.pairFhaRows(A, B);

const sev = r => String((r && r.severity) || '').trim();
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const row = (r) => ({ fcId: r.fcId || '', severity: sev(r) || '(abstained)', sevBasis: r.sevBasis || '', fcDesc: clip(r.fcDesc, 90) });

const disagreements = [], flips = [], catFlips = [], agreeCommitted = [], agreeAbstained = [];
for (const [g, c, how] of pairs) {
  const a = sev(g.r), b = sev(c.r);
  // Match quality matters: 'text' pairs are the SAME condition verbatim —
  // any disagreement there is pure judgment variance. 'signature' pairs are
  // topic|mode approximations across differently-worded condition sets —
  // disagreement there conflates condition-identity variance with judgment.
  const entry = { how, a: row(g.r), b: row(c.r) };
  if (a && b) {
    if (a === b) agreeCommitted.push(entry);
    else disagreements.push(entry);
  } else if (a || b) flips.push(entry);
  else agreeAbstained.push(entry);
  if ((a === 'Catastrophic') !== (b === 'Catastrophic')) catFlips.push(entry);
}
const aMatched = new Set(pairs.map(([g]) => g.r)), bMatched = new Set(pairs.map(([, c]) => c.r));
const unmatchedA = A.fha.filter(r => !aMatched.has(r)).map(row);
const unmatchedB = B.fha.filter(r => !bMatched.has(r)).map(row);

const textPairs = pairs.filter(p => p[2] === 'text').length;
const byHow = (list) => ({ text: list.filter(e => e.how === 'text').length, signature: list.filter(e => e.how === 'signature').length });
const report = {
  runs: { a: args[0], b: args[1] },
  totals: { aRows: A.fha.length, bRows: B.fha.length, matched: pairs.length, textPairs,
    disagreementsByMatch: byHow(disagreements), flipsByMatch: byHow(flips), catFlipsByMatch: byHow(catFlips),
    agreeCommitted: agreeCommitted.length, agreeAbstained: agreeAbstained.length,
    committedDisagreements: disagreements.length, commitmentFlips: flips.length,
    catMembershipFlips: catFlips.length, unmatchedA: unmatchedA.length, unmatchedB: unmatchedB.length },
  committedDisagreements: disagreements, commitmentFlips: flips, catMembershipFlips: catFlips,
  unmatchedA, unmatchedB,
};
if (flags.has('--json')) { console.log(JSON.stringify(report, null, 1)); process.exit(0); }
const t = report.totals;
console.log(`sev-report: ${t.matched}/${t.aRows} matched (${t.textPairs} exact-text) · agree ${t.agreeCommitted} committed + ${t.agreeAbstained} abstained · ${t.committedDisagreements} class disagreements (${t.disagreementsByMatch.text} on exact-text pairs) · ${t.commitmentFlips} commitment flips (${t.flipsByMatch.text} exact-text) · ${t.catMembershipFlips} CAT flips (${t.catFlipsByMatch.text} exact-text)`);
console.log('NOTE: signature-matched entries conflate condition-identity variance with judgment variance — the exact-text columns are the clean judgment signal.');
const show = (title, list, f) => { if (!list.length) return; console.log('\n' + title + ' (' + list.length + ')'); list.forEach(e => console.log('  ' + f(e))); };
show('CAT MEMBERSHIP FLIPS — these drive FTA/CMA scope', catFlips,
  e => `[${e.how === 'text' ? 'TEXT' : 'sig '}] ${e.a.fcId} ${e.a.severity}${e.a.sevBasis ? '[' + e.a.sevBasis + ']' : ''} <> ${e.b.fcId} ${e.b.severity}${e.b.sevBasis ? '[' + e.b.sevBasis + ']' : ''} — ${e.a.fcDesc}`);
show('COMMITTED CLASS DISAGREEMENTS', disagreements.filter(e => !catFlips.includes(e)),
  e => `[${e.how === 'text' ? 'TEXT' : 'sig '}] ${e.a.fcId} ${e.a.severity}[${e.a.sevBasis}] <> ${e.b.severity}[${e.b.sevBasis}] — ${e.a.fcDesc}`);
show('COMMITMENT FLIPS (committed <> abstained)', flips.filter(e => !catFlips.includes(e)),
  e => `[${e.how === 'text' ? 'TEXT' : 'sig '}] ${e.a.fcId} ${e.a.severity} <> ${e.b.severity} — ${e.a.fcDesc}`);
process.exit(0);
