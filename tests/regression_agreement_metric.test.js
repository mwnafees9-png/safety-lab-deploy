// regression_agreement_metric.test.js — HF-4: inter-coder agreement as a first-class metric.
//
// WHY. Any classification feature we ship inherits HFACS's best-documented weakness —
// two trained analysts routinely code the same event differently. The literature manages
// that by consensus reconciliation, which hides the disagreement. This measures it.
//
// THE THREE RULES THIS FILE ENFORCES, each of which the product has already been burned by:
//
//   1. ID-MATCHED ONLY. eval/EXPORT_RUN.md published severity clsAgree 0.474 and called
//      class instability a headline defect; on id-matched identical conditions the same
//      model scored 0.947. The old number was an artifact of signature matching comparing
//      DIFFERENT conditions. There is no signature fallback here, and rows that cannot be
//      matched are counted, because an agreement number over an unknown denominator is
//      the defect rather than the measurement.
//
//   2. ABSTENTION IS A CODE. E2 is product doctrine: the 60-70% severity abstention is
//      load-bearing — the model declines exactly the rows its judgment is unstable on.
//      Two draws that both abstain AGREE about declining. One that abstains against one
//      that commits is a COMMITMENT difference on its own axis, so a candidate cannot buy
//      agreement by filling the column. That separation is the shape that rejected E2.
//
//   3. KAPPA ALONGSIDE RAW. Raw agreement on a skewed taxonomy flatters itself. The
//      executed case below scores 1.000 raw and kappa null — two coders who both used one
//      identical category agree about nothing, and reporting 1.000 alone would be a lie.
//
// Mutation-proved by exit code: harmonising the disagreements must move the metric, and
// folding abstention into agreement must go red.

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const core = fs.readFileSync(path.join(ROOT, 'site/eval_core.js'), 'utf8');
const C = require(path.join(ROOT, 'site/eval_core.js'));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (extra ? ('\n       ' + extra) : '')); }
}
console.log('\nregression_agreement_metric — id-matched categorical agreement, with kappa\n');

// ------------------------------------------------------------- doctrine
ok('the family is exported', typeof C.agreementOn === 'function' && typeof C.agreementTwoLevel === 'function');
ok('the ruler lesson is recorded with its numbers', /published severity clsAgree 0\.474[\s\S]{0,200}scored 0\.947/.test(core));
ok('id-matching is stated as structural, not a default', /no signature fallback, no semantic pairing, no\s*\n\s*\/\/ exceptions/.test(core));
ok('abstention doctrine is recorded', /ABSTENTION IS A CODE, NOT A DISAGREEMENT/.test(core));
ok('the E2 shape is named', /That is the shape that rejected E2/.test(core));
ok('why kappa is reported alongside raw is recorded', /Raw agreement on a skewed taxonomy flatters itself/.test(core));
ok('the undefined-kappa case is handled honestly', /Kappa is UNDEFINED there, not 1 and not 0/.test(core));

// ============================================================== EXECUTED
const A = C.agreementOn;

// ---- 1. the basic count, and abstention kept off the agreement axis --------
{
    const g = [{ id: 1, code: 'A' }, { id: 2, code: 'B' }, { id: 3, code: 'A' }, { id: 4, code: null }, { id: 5, code: 'A' }];
    const d = [{ id: 1, code: 'A' }, { id: 2, code: 'A' }, { id: 3, code: 'A' }, { id: 4, code: null }, { id: 5, code: null }];
    const r = A(g, d);
    ok('agreement counts only pairs where BOTH committed', r.bothCommitted === 3 && r.agreed === 2 && r.agreement === 0.667);
    ok('a both-abstained pair is agreement about declining, counted on its own', r.bothAbstained === 1);
    ok('one-committed-one-abstained is a COMMITMENT difference, not a disagreement', r.commitmentDiff === 1 && r.commitmentDelta === 0.2);
    ok('the abstained pairs are absent from the agreement denominator', r.bothCommitted === 3);
    ok('kappa corrects the skew: 0.667 raw becomes 0 once chance is removed', r.kappa === 0,
        'raw ' + r.agreement + ' kappa ' + r.kappa);
    ok('the match basis is declared', r.matchBasis === 'id');
}

// ---- 2. perfect agreement across two categories --------------------------
{
    const g = [{ id: 1, code: 'A' }, { id: 2, code: 'B' }, { id: 3, code: 'A' }, { id: 4, code: 'B' }];
    const r = A(g, g.map(x => ({ id: x.id, code: x.code })));
    ok('identical coding scores 1.000 raw', r.agreement === 1);
    ok('and kappa 1 when more than one category is in play', r.kappa === 1);
}

// ---- 3. the degenerate case kappa must refuse to score -------------------
{
    const g = [{ id: 1, code: 'A' }, { id: 2, code: 'A' }, { id: 3, code: 'A' }];
    const r = A(g, [{ id: 1, code: 'A' }, { id: 2, code: 'A' }, { id: 3, code: 'A' }]);
    ok('one identical category on both sides: raw is 1.000', r.agreement === 1);
    ok('...and kappa is NULL, not 1 — chance agreement is total', r.kappa === null);
    ok('...with the reason stated rather than a bare null', /single identical category/.test(r.kappaNote));
}

// ---- 4. the denominator's honesty ----------------------------------------
{
    const g = [{ id: 1, code: 'A' }, { id: 2, code: 'A' }, { id: 9, code: 'B' }];
    const d = [{ id: 1, code: 'A' }, { id: 7, code: 'A' }];
    const r = A(g, d);
    ok('a golden row the candidate never produced is counted as unmatched', r.unmatchedGolden === 2);
    ok('a candidate row with no golden counterpart is counted too', r.unmatchedCandidate === 1);
    ok('unmatched rows never enter the agreement denominator', r.bothCommitted === 1 && r.agreement === 1);
    const noId = A([{ code: 'A' }], [{ code: 'A' }]);
    ok('rows carrying no id at all are never scored', noId.bothCommitted === 0 && noId.agreement === null);
}

// ---- 5. two levels, reported separately -----------------------------------
{
    const g = [{ id: 1, level: 'unsafe acts', category: 'skill-based error' },
               { id: 2, level: 'unsafe acts', category: 'decision error' },
               { id: 3, level: 'preconditions', category: 'adverse mental state' }];
    const d = [{ id: 1, level: 'unsafe acts', category: 'decision error' },
               { id: 2, level: 'unsafe acts', category: 'decision error' },
               { id: 3, level: 'preconditions', category: 'adverse mental state' }];
    const r = C.agreementTwoLevel(g, d);
    ok('level agreement is perfect here', r.level.agreement === 1);
    ok('category agreement is lower, and reported SEPARATELY', r.category.agreement === 0.667);
    ok('the easy half never carries the hard one — no blended number is returned',
        r.level.agreement !== r.category.agreement && !('agreement' in r));
}

// ---- 6. a candidate cannot buy agreement by abstaining less ---------------
// The E2 shape: a candidate that fills the column raises commitmentDelta, and its raw
// agreement is computed over the pairs it newly committed on — it cannot hide.
{
    const g = [{ id: 1, code: null }, { id: 2, code: null }, { id: 3, code: 'A' }];
    const shy = A(g, [{ id: 1, code: null }, { id: 2, code: null }, { id: 3, code: 'A' }]);
    const filler = A(g, [{ id: 1, code: 'B' }, { id: 2, code: 'C' }, { id: 3, code: 'A' }]);
    ok('a matching-abstention draw shows no commitment difference', shy.commitmentDiff === 0);
    ok('a column-filling draw is visible on the commitment axis', filler.commitmentDiff === 2 && filler.commitmentDelta > 0.6);
    ok('and filling does NOT inflate its agreement number', filler.agreement === 1 && filler.bothCommitted === 1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
