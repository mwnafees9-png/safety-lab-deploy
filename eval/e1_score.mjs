// E1 — condition-wording stability scorer (31 Aug 2026).
// Input: the rig export { draws: [{tag:'A1'|'A2'|'B1'|'B2', rows:[FCIM rows]}] }.
// Metric: same-arm EXACT-TEXT jaccard over normalized condition strings —
// deliberately the "broken ruler" F1b demoted for content matching, because
// here PHRASING ITSELF is the measurand.
// Gate (EXPORT_RUN E1): jac(B) - jac(A) >= 0.15 absolute, AND mean count(B)
// within +-15% of mean count(A), AND mergedish(B) <= mergedish(A).
import fs from 'fs';
const f = process.argv[2];
if (!f) { console.error('usage: node eval/e1_score.mjs <e1_export.json>'); process.exit(2); }
const d = JSON.parse(fs.readFileSync(f, 'utf8'));
const draws = {};
for (const dr of d.draws) draws[dr.tag] = dr;
const norm = s => String(s || '').toLowerCase().replace(/[—–—–\-]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const conds = dr => {
  const out = [];
  for (const r of dr.rows) {
    for (const k of ['tlDesc', 'plDesc', 'mDesc']) if (r[k] && String(r[k]).trim()) out.push(String(r[k]).trim());
    for (const k of ['plExtra', 'mExtra']) for (const e of (Array.isArray(r[k]) ? r[k] : [])) if (e && e.desc) out.push(String(e.desc).trim());
  }
  return out;
};
const LOSSFORMS = [/\bcomplete loss of\b/, /\bpartial loss of\b/, /\berroneous\b/, /\buncommanded\b/, /\binadvertent\b/, /\bundetected\b/];
const lossformHits = t => LOSSFORMS.filter(re => re.test(norm(t))).length;
const canonicalRate = list => list.length ? list.filter(t => lossformHits(t) >= 1).length / list.length : 0;
// merged = TWO loss-form-bearing clauses joined by a conjunction (the FCIM
// spec's merged-phrase rule). NOT the qualifier grammar: "Erroneous X —
// undetected" is ONE condition on the crew-Unaware row — the first cut of this
// metric counted loss-form words and flagged all 25 of arm C's sanctioned
// qualifiers as merges (31 Aug, caught by reading the flagged texts verbatim).
const LFWORD = /(complete loss|partial loss|erroneous|uncommanded|inadvertent|undetected)/;
const mergedish = list => list.filter(t => {
  const n = norm(t);
  if (/\b(and also|as well as|combined with)\b/.test(n)) return true;
  return n.split(/\b(?:and|plus|with)\b/).filter(part => LFWORD.test(part)).length >= 2;
}).length;
const jac = (a, b) => {
  const A = new Set(a.map(norm)), B = new Set(b.map(norm));
  const inter = [...A].filter(x => B.has(x)).length;
  const uni = new Set([...A, ...B]).size;
  return uni ? inter / uni : 0;
};
const arm = (t1, t2) => {
  const c1 = conds(draws[t1]), c2 = conds(draws[t2]);
  return { jaccard: +jac(c1, c2).toFixed(3), counts: [c1.length, c2.length], rows: [draws[t1].rows.length, draws[t2].rows.length],
           canonicalRate: [+canonicalRate(c1).toFixed(3), +canonicalRate(c2).toFixed(3)], mergedish: [mergedish(c1), mergedish(c2)] };
};
const A = arm('A1', 'A2');
const out = { armA: A };
let anyPass = false;
for (const [name, t1, t2] of [['armB', 'B1', 'B2'], ['armC', 'C1', 'C2']]) {
  if (!draws[t1] || !draws[t2]) continue;
  const X = arm(t1, t2);
  const meanA = (A.counts[0] + A.counts[1]) / 2, meanX = (X.counts[0] + X.counts[1]) / 2;
  const delta = +(X.jaccard - A.jaccard).toFixed(3);
  const countOk = Math.abs(meanX - meanA) / meanA <= 0.15;
  const mergedOk = Math.max(...X.mergedish) <= Math.max(...A.mergedish);
  const pass = delta >= 0.15 && countOk && mergedOk;
  out[name] = X;
  out[name + '_verdict'] = { delta, countRatio: +(meanX / meanA).toFixed(3), countOk, mergedOk, GATE: pass ? 'PASS' : 'FAIL' };
  if (pass) anyPass = true;
}
console.log(JSON.stringify(out, null, 1));
process.exit(anyPass ? 0 : 1);
