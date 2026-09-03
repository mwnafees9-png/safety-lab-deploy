// tests/regression_e2_commitment.test.js — pins the E2 commitment finding and the
// gate that produced it (31 Aug 2026).
//
// WHY THIS FILE EXISTS. E2 asked whether the FHA lane's 60-70% severity abstention
// is a defect. The answer measured on identical conditions was NO: the rows the
// model declines are exactly the rows its judgment is unstable on, and a skill-text
// rule (fha.draft v3 "commitment test") that pushed it to commit anyway converted
// abstentions into coin flips — committedAgreement 0.947 -> 0.655. The candidate was
// REJECTED. This test stops a future session from "fixing" the abstention rate
// without re-running the experiment, and pins the scorer's two independent gates.
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const RIG = path.join(ROOT, 'eval', 'runs', 'e2_commitment_rig.json');
const SCORER = path.join(ROOT, 'eval', 'e2_score.mjs');

const score = (file) => {
  try { return { out: JSON.parse(execFileSync('node', [SCORER, file], { encoding: 'utf8' })), code: 0 }; }
  catch (e) { return { out: JSON.parse(e.stdout || '{}'), code: e.status }; }
};
const idOf = r => String((r && (r.fcId || r.sourceCondId)) || '').trim();
const sev = r => String((r && r.severity) || '').trim();

let checks = 0, fails = 0;
const check = (name, cond) => { checks++; if (!cond) { fails++; console.log('  FAIL ' + name); } else console.log('  PASS ' + name); };

test('E2 — severity commitment: the rejected v3 rule and its gate', () => {
  console.log('[e2] the rig fixture');
  check('rig export is on disk', fs.existsSync(RIG));
  const rig = JSON.parse(fs.readFileSync(RIG, 'utf8'));
  const D = {}; rig.draws.forEach(d => D[d.tag] = d);
  check('four draws: A1 A2 B1 B2', ['A1','A2','B1','B2'].every(t => D[t]));
  check('every draw is 69 rows (FCIM held FIXED — that is the design)', rig.draws.every(d => d.rows.length === 69));
  check('meta records the fixed-FCIM design', /FIXED/i.test(rig.meta.design || ''));
  check('meta records the v3 body hash actually run', rig.meta.v3BodyHash === '9c7a931c');
  check('meta carries the stamp caveat (stampFor was not wrapped)', /stamp is not evidence/i.test(rig.meta.stampCaveat || ''));
  const ids = new Set(D.A1.rows.map(idOf));
  check('pairs are exact by condition id, not inferred', ids.size === 69 && D.B1.rows.every(r => ids.has(idOf(r))));

  console.log('[e2] the finding');
  const { out, code } = score(RIG);
  check('scorer exits 1 on the real v3 run (candidate REJECTED)', code === 1);
  check('arm A committed-agreement is high (0.947)', out.armA.committedAgreement === 0.947);
  check('arm B committed-agreement COLLAPSED (0.655)', out.armB.committedAgreement === 0.655);
  check('arm B abstained LESS than arm A (the rule did what it said)', out.verdict.abstentionMeanB < out.verdict.abstentionMeanA);
  check('...and got WORSE anyway — flips rose, not fell', out.verdict.flipRelativeDrop < 0);
  check('69/69 matched in both arms', out.armA.matched === 69 && out.armB.matched === 69);

  console.log('[e2] the abstention rows are the unstable rows — the load-bearing claim');
  const m = t => { const o = {}; D[t].rows.forEach(r => { const k = idOf(r); if (k && !o[k]) o[k] = r; }); return o; };
  const A1 = m('A1'), A2 = m('A2'), B1 = m('B1'), B2 = m('B2');
  let newly = 0, newlyAgree = 0;
  Object.keys(A1).forEach(k => {
    if (!A2[k] || !B1[k] || !B2[k]) return;
    if (!sev(A1[k]) && !sev(A2[k]) && sev(B1[k]) && sev(B2[k])) { newly++; if (sev(B1[k]) === sev(B2[k])) newlyAgree++; }
  });
  check('v3 newly committed rows arm A had declined twice', newly === 11);
  check('on those rows the two v3 draws agreed barely half the time', newlyAgree === 6);
  check('i.e. forced commitment lands near a coin flip (<=0.6)', (newlyAgree / newly) <= 0.6);
  check('while genuinely-committed rows agree ~19/20', out.armA.agreeCommitted === 18 && out.armA.committedDisagreements === 1);

  console.log('[e2] BOTH gates bite independently (mutation-proved by exit code)');
  const mutate = (fn) => { const c = JSON.parse(fs.readFileSync(RIG, 'utf8')); fn(c); const p = path.join(require('os').tmpdir(), 'e2_mut_' + Math.random().toString(36).slice(2) + '.json'); fs.writeFileSync(p, JSON.stringify(c)); return p; };
  const idx = (c, t) => { const o = {}; c.draws.find(d => d.tag === t).rows.forEach(r => { const k = idOf(r); if (k && !o[k]) o[k] = r; }); return o; };
  const p1 = mutate(c => { const b1 = idx(c,'B1'), b2 = idx(c,'B2');
    Object.keys(b1).forEach(k => { const a = sev(b1[k]), b = b2[k] ? sev(b2[k]) : ''; if ((a && !b) || (!a && b)) { b1[k].severity = ''; if (b2[k]) b2[k].severity = ''; } }); });
  const r1 = score(p1);
  check('flips fully neutralised but disagreements left -> still FAIL (agreement guard bites)', r1.code === 1 && r1.out.verdict.gates.flipsDown40pct === true && r1.out.verdict.gates.agreementNotWorse === false);
  const p2 = mutate(c => { const b1 = idx(c,'B1'), b2 = idx(c,'B2');
    Object.keys(b1).forEach(k => { const a = sev(b1[k]), b = b2[k] ? sev(b2[k]) : ''; if (a && b && a !== b) b2[k].severity = a; }); });
  const r2 = score(p2);
  check('disagreements harmonised but flips left -> still FAIL (flip guard bites)', r2.code === 1 && r2.out.verdict.gates.agreementNotWorse === true && r2.out.verdict.gates.flipsDown40pct === false);
  try { fs.unlinkSync(p1); fs.unlinkSync(p2); } catch (_) {}

  console.log('[e2] the shipped skill body is UNCHANGED — v3 was rejected, not quietly kept');
  global.window = {};
  eval(fs.readFileSync(path.join(ROOT, 'site', 'ai_skills.js'), 'utf8'));
  const body = global.window.SLABSkills.bodyFor('fha.populate', '');
  check('fha.draft carries NO commitment-test text', !/COMMITMENT TEST/i.test(body));
  check('fha.draft carries NO borderline clause', !/BORDERLINE IS NOT A REASON/i.test(body));
  // 2 Sep 2026 - the SHIPPED stamp is now v3#a7a83971 (definition quoting). The rejected
  // E2 forced-commitment take was ALSO called v3 in this narrative; the two checks
  // above are what prove it never landed (no commitment test, no borderline clause).
  // 3 Sep 2026 - v5#d9c0a41a: THREE EFFECT AXES (v4) plus ONE CREDITED OUTCOME and
  // the joint top step (v5). The two checks above still prove the rejected E2
  // forced-commitment take never landed - v5 adds no commitment test either.
  // 3 Sep 2026 (evening) - v6#c190bc76: Waqas's phase rule + JUDGEMENT OVER ABSTENTION.
  // This REVERSES the abstention policy the E2 rig defended, and the E2 evidence is
  // exactly why the reversal is shaped the way it is: forced commitment landed near a
  // coin flip on the rows it forced (checks above). v6 does NOT force commitment - it
  // asks for a judgement that is FLAGGED on the row (judgementCall), explained
  // (judgementNote), filed as an assumption, and shown before accept. The two checks
  // above still prove the rejected E2 text never landed. A campaign scoring v6 must
  // score judgement rows SEPARATELY from grounded ones, because E2 says they agree less.
  check('fha.draft stamps the shipped v6#c190bc76 (phase rule + flagged judgement), not the rejected E2 take', global.window.SLABSkills.stampFor('fha.populate', '') === 'fha.draft@v6#c190bc76', global.window.SLABSkills.stampFor('fha.populate', ''));
  check('the abstention clause is replaced by FLAGGED judgement, never by silent commitment',
    !/leave severity EMPTY rather than reaching for a plausible value/.test(body) && /WHEN THE INFORMATION IS THIN, JUDGE - DO NOT ABSTAIN/.test(body) && /judgementCall: true and a judgementNote/.test(body));

  console.log(fails ? ('# FAILED — ' + fails + ' check(s)') : ('# ' + checks + ' passed, 0 failed'));
  assert.strictEqual(fails, 0);
});
