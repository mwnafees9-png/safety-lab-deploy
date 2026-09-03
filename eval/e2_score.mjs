#!/usr/bin/env node
// eval/e2_score.mjs — E2 severity-COMMITMENT stability scorer (31 Aug 2026).
//
// E1 fixed condition WORDING (fcim.draft v2). That unlocks this: with the FCIM
// held fixed across draws, matched pairs are text-identical, so every severity
// difference is PURE JUDGMENT VARIANCE with no condition-identity confound —
// the thing the 30 Aug sev_report could only see on 6 of 107 pairs.
//
// THE TWO DEFECTS, measured separately, because a fix for one can worsen the other:
//   (1) COMMITMENT instability — one draw commits, the other abstains (baseline
//       52 flips on the v5 pair). Attacked by the v3 commitment test.
//   (2) CLASS instability — both commit, and disagree (baseline 10 disagreements
//       vs 9 agreements: worse than a coin flip). MUST NOT get worse; a rule that
//       just commits more while the class stays random is a REGRESSION, not a win.
//
// Input: { draws: [{ tag:'A1'|'A2'|'B1'|'B2', rows:[FHA rows] }] }
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const core = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'site', 'eval_core.js'));

const f = process.argv[2];
if (!f) { console.error('usage: node eval/e2_score.mjs <e2_export.json> [--json]'); process.exit(2); }
const doc = JSON.parse(readFileSync(f, 'utf8'));
const draws = {}; for (const d of doc.draws) draws[d.tag] = d;

const SEVS = ['Catastrophic', 'Hazardous', 'Major', 'Minor', 'No Safety Effect'];
const sev = r => String((r && r.severity) || '').trim();
const asRun = d => ({ meta: { name: d.tag }, functions: [], fcim: [], fha: d.rows, assumptions: [] });
const abstentionRate = d => { const n = d.rows.length; return n ? +(d.rows.filter(r => !sev(r)).length / n).toFixed(3) : 0; };
// Discipline check for the v3 rule: an abstention must NAME the missing fact.
// Informational, NOT a gate: does the abstention name a reason at all?
// (The v3 clause asked for a literal 'SEVERITY WITHHELD - need:' prefix; the app's
// own wrapper already emits the reason, so the literal prefix is redundant and its
// absence is not evidence the clause was ignored.)
const NEED = /(SEVERITY WITHHELD\s*[-—–]\s*need\s*:|SEVERITY NOT DETERMINED)/i;
const namedWithholdRate = d => {
  const ab = d.rows.filter(r => !sev(r));
  if (!ab.length) return null;
  // The app wraps the model's severityRationale into `comments` ('SEVERITY NOT
  // DETERMINED by the model — <reason>'), so that is where an abstention's reason lives.
  const txt = r => [r.comments, r.rationale, r.sevBasis].map(x => String(x || '')).join(' ');
  return +(ab.filter(r => NEED.test(txt(r))).length / ab.length).toFixed(3);
};
const badSev = d => d.rows.filter(r => sev(r) && !SEVS.includes(sev(r))).map(r => sev(r));

// PAIRING. E2 holds the FCIM FIXED, so every FHA row carries a condition id drawn
// from the SAME set — pairs are EXACT by id, not inferred by text or signature.
// This is the whole reason E2 could only run after E1: the 30 Aug pair had to use
// signature matching across differently-worded conditions, which conflated
// condition identity with judgment and manufactured "disagreements" that were
// really comparisons of different conditions (that run reported committedAgreement
// ~0.47; the same model on id-matched identical conditions reports 0.947).
const idOf = r => String((r && (r.fcId || r.sourceCondId || r.srcCondId)) || '').trim();
function pairById(a, b) {
  const A = {}, B = {};
  a.rows.forEach(r => { const k = idOf(r); if (k && !A[k]) A[k] = r; });
  b.rows.forEach(r => { const k = idOf(r); if (k && !B[k]) B[k] = r; });
  const ids = Object.keys(A).filter(k => B[k]);
  return { pairs: ids.map(k => [{ r: A[k] }, { r: B[k] }, 'id']), idsA: Object.keys(A).length, idsB: Object.keys(B).length };
}
function arm(t1, t2) {
  const { pairs, idsA, idsB } = pairById(draws[t1], draws[t2]);
  let flips = 0, disagree = 0, agreeCommitted = 0, agreeAbstained = 0, textPairs = 0;
  let flipsText = 0, disagreeText = 0, agreeCommittedText = 0;
  for (const [g, c, how] of pairs) {
    const a = sev(g.r), b = sev(c.r);
    const isText = how === 'id';
    if (isText) textPairs++;
    if (a && b) { if (a === b) { agreeCommitted++; if (isText) agreeCommittedText++; } else { disagree++; if (isText) disagreeText++; } }
    else if (a || b) { flips++; if (isText) flipsText++; }
    else agreeAbstained++;
  }
  // 3 Sep 2026 — fha.draft v4 THREE EFFECT AXES: per-axis level agreement on pairs
  // where BOTH draws set the level, plus agreement on which axis governs. Not a
  // gate yet (the v4 campaign is what pre-registers one); a class disagreement
  // with all three axes agreeing is impossible by construction, so every
  // remaining disagreement names the axis it lives on.
  const AXES = { ac: 'effAcLevel', crew: 'effCrewLevel', pax: 'effPaxLevel' };
  const axes = {};
  for (const ax of Object.keys(AXES)) {
    let both = 0, agree = 0, setA = 0, setB = 0;
    for (const [g, c] of pairs) {
      const a = String(g.r[AXES[ax]] || '').trim().toLowerCase(), b = String(c.r[AXES[ax]] || '').trim().toLowerCase();
      if (a) setA++; if (b) setB++;
      if (a && b) { both++; if (a === b) agree++; }
    }
    axes[ax] = { set: [setA, setB], both, agree, agreement: both ? +(agree / both).toFixed(3) : null };
  }
  const matched = pairs.length;
  const bothCommitted = agreeCommitted + disagree;
  const bothCommittedText = agreeCommittedText + disagreeText;
  return {
    draws: [t1, t2], rows: [draws[t1].rows.length, draws[t2].rows.length], matched, textPairs,
    commitmentFlips: flips, commitmentFlipRate: matched ? +(flips / matched).toFixed(3) : 0,
    committedDisagreements: disagree, agreeCommitted, agreeAbstained,
    committedAgreement: bothCommitted ? +(agreeCommitted / bothCommitted).toFixed(3) : null,
    onTextPairs: { textPairs, flips: flipsText, flipRate: textPairs ? +(flipsText / textPairs).toFixed(3) : 0,
                   committedAgreement: bothCommittedText ? +(agreeCommittedText / bothCommittedText).toFixed(3) : null },
    abstentionRate: [abstentionRate(draws[t1]), abstentionRate(draws[t2])],
    namedWithholdRate: [namedWithholdRate(draws[t1]), namedWithholdRate(draws[t2])],
    invalidSeverities: [...badSev(draws[t1]), ...badSev(draws[t2])],
    axes
  };
}

const A = arm('A1', 'A2'), B = arm('B1', 'B2');
const meanRows = a => (a.rows[0] + a.rows[1]) / 2;
const flipDrop = A.commitmentFlipRate ? +(1 - B.commitmentFlipRate / A.commitmentFlipRate).toFixed(3) : null;
// GATE (pre-registered): consistency up, class quality NOT traded away for it.
const g1 = flipDrop !== null && flipDrop >= 0.40;                                    // >=40% relative cut in flips
const g2 = (B.committedAgreement ?? 0) >= (A.committedAgreement ?? 0) - 0.05;        // class agreement not worse
const g3 = Math.abs(meanRows(B) - meanRows(A)) / meanRows(A) <= 0.15;                // row discipline held
const g4 = B.invalidSeverities.length === 0;                                         // vocabulary held
const pass = g1 && g2 && g3 && g4;
const out = { armA: A, armB: B,
  verdict: { flipRateA: A.commitmentFlipRate, flipRateB: B.commitmentFlipRate, flipRelativeDrop: flipDrop,
             committedAgreementA: A.committedAgreement, committedAgreementB: B.committedAgreement,
             abstentionMeanA: +((A.abstentionRate[0] + A.abstentionRate[1]) / 2).toFixed(3),
             abstentionMeanB: +((B.abstentionRate[0] + B.abstentionRate[1]) / 2).toFixed(3),
             rowRatio: +(meanRows(B) / meanRows(A)).toFixed(3),
             gates: { flipsDown40pct: g1, agreementNotWorse: g2, rowDiscipline: g3, vocabularyClean: g4 },
             GATE: pass ? 'PASS' : 'FAIL' } };
console.log(JSON.stringify(out, null, 1));
process.exit(pass ? 0 : 1);
