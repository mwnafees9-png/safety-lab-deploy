#!/usr/bin/env node
/*
 * Regression — a requirement's TYPE means one thing.
 *
 * WHAT WAS WRONG (1 Aug 2026). Four vocabularies shared the `type` field on a
 * requirement row, and no two of them agreed:
 *
 *   the entry FORM offered ...... Design Assurance · Probabilistic · Independence
 *   the GENERATORS wrote ........ Probabilistic · Design Assurance · Independence · Maintenance
 *   the FILTER chips matched .... Safety · Functional · Performance
 *   demos / bowtie / importers .. Safety · Architecture · Monitor · Functional ·
 *                                 Human Factors · Qualification · Installation ·
 *                                 Derived · Quantitative
 *
 * The form and the filter shared ZERO values, so a user could not hand-author a
 * requirement that any Type filter would match. Measured by execution on the
 * shipped Kestrel RJ showcase — 57 requirements, 11 distinct type values:
 *
 *   Type: Safety ......... 0 of 57      Level: High-level ... 0 of 57
 *   Type: Performance .... 0 of 57      Level: Derived ...... 0 of 57
 *   Type: Functional ..... 2 of 57
 *
 * Four of the five chips returned an empty list on the flagship demo. An empty
 * list reads as "you have none of those" — never as "this filter cannot match
 * anything you own". That is the same silent-disagreement shape as the three
 * flight-phase vocabularies, on a different field.
 *
 * `level` had it too: the form offered L1–L4, generators emitted L1–L3, the chips
 * matched High-level / Derived. vv_validation.js already carried a workaround for
 * half of it (`level === 'Derived' || r.derivationType`), which is the tell that
 * this had been hit before and patched at one call site instead of fixed.
 *
 * WHAT IS TRUE NOW. Two orthogonal things were sharing one field, so the field was
 * split: `type` is the ARP4754B §5.3.1 class, `analysis` is which analysis produced
 * it, `level` is L1/L2/L3. "Probabilistic" was never a peer of "Safety" — a
 * probabilistic requirement IS a safety requirement, derived from the FHA.
 *
 * The filter chips are now built from the taxonomy UNION the values actually in the
 * project, which closes both directions at once: a chip cannot exist unless
 * something matches it, and a stored value cannot become unreachable.
 *
 * STANDARDS BASIS: ARP4754B §5.3.1 "Classes of Requirements", §5.3.1.1–§5.3.1.11,
 * read from source. Clause numbers and titles only — SAE material is licensed and
 * no clause prose is stored in this repo.
 *
 * Run: node tests/regression_req_taxonomy.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const T = require(path.join(SITE, 'req_taxonomy.js'));
const asr = S('assurance_modules.js'), help = S('helpers_modules.js'),
      html = S('index.html'), lab = S('safety_lab.js');

// ---------------------------------------------------------------------------
console.log('\n[taxonomy] the classes are ARP4754B §5.3.1, in order');
{
    const want = [
        ['Safety', 'ARP4754B §5.3.1.1'], ['Functional', 'ARP4754B §5.3.1.2'],
        ['Customer', 'ARP4754B §5.3.1.3'], ['Operational', 'ARP4754B §5.3.1.4'],
        ['Performance', 'ARP4754B §5.3.1.5'], ['Physical and Installation', 'ARP4754B §5.3.1.6'],
        ['Maintainability', 'ARP4754B §5.3.1.7'], ['Interface', 'ARP4754B §5.3.1.8'],
        ['Certification', 'ARP4754B §5.3.1.9'], ['Derived', 'ARP4754B §5.3.1.10'],
        ['Re-Use', 'ARP4754B §5.3.1.11']
    ];
    check('all eleven classes, correctly numbered',
        JSON.stringify(T.REQ_CLASSES.map(c => [c.label, c.clause])) === JSON.stringify(want),
        JSON.stringify(T.REQ_CLASSES.map(c => c.label)));
    check('§5.3.1.7 is Maintainability, not "fault isolation"',
        T.clauseFor('Maintainability') === 'ARP4754B §5.3.1.7',
        'the open-items card had this as fault isolation — isolation is content INSIDE the clause, not its title');
    check('the clause lookup is case-insensitive and total',
        T.clauseFor('operational') === 'ARP4754B §5.3.1.4' && T.clauseFor('nonsense') === '');
    check('no clause PROSE was copied in with the titles',
        !/shall be|should be identified and recorded|constitute the bulk/.test(S('req_taxonomy.js')),
        'clause numbers and titles are fine; reproducing the paragraph is not');
}

// ---------------------------------------------------------------------------
console.log('\n[taxonomy] the migration is conservative and idempotent');
{
    const rows = [
        { type: 'Probabilistic' }, { type: 'Independence' }, { type: 'Design Assurance' },
        { type: 'Quantitative' }, { type: 'Maintenance' }, { type: 'Human Factors' },
        { type: 'Installation' }, { type: 'Functional' }, { type: 'Derived' },
        { type: 'Architecture' }, { type: 'Monitor' }, { type: 'Qualification' }
    ];
    const r1 = T.migrateAll(rows);
    check('the generator vocabulary maps onto §5.3.1 classes',
        rows[0].type === 'Safety' && rows[1].type === 'Safety' && rows[2].type === 'Safety' &&
        rows[4].type === 'Maintainability');
    check('…and the analysis that produced it is preserved, not discarded',
        rows[0].analysis === 'Probabilistic' && rows[1].analysis === 'Independence' &&
        rows[2].analysis === 'Design Assurance' && rows[4].analysis === 'Maintenance',
        'the split must not lose information — that is what makes it reversible');
    check('Human Factors becomes Operational, which is the standard\'s own word for it',
        rows[5].type === 'Operational' && rows[5].analysis === 'Human Factors');
    check('values already in the taxonomy are left alone',
        rows[7].type === 'Functional' && rows[8].type === 'Derived');
    check('AMBIGUOUS values are NOT guessed at',
        rows[9].type === 'Architecture' && rows[10].type === 'Monitor' && rows[11].type === 'Qualification',
        'a migration that guesses at an engineer\'s meaning causes the same class of bug, less visibly');
    check('…and they are reported rather than silently skipped',
        r1.unmapped.Architecture === 1 && r1.unmapped.Monitor === 1 && r1.unmapped.Qualification === 1);
    check('each ambiguous value records WHY it is ambiguous',
        Object.keys(T.AMBIGUOUS_LEGACY).length === 3 &&
        /§5\.3\.1\.\d/.test(T.AMBIGUOUS_LEGACY.architecture) &&
        T.isAmbiguousLegacy('Monitor'));
    const r2 = T.migrateAll(rows);
    check('running it again changes nothing',
        r2.changed === 0, 'it runs on every requirements render — a non-idempotent migration would churn forever');
    check('an already-split row is not re-migrated',
        (function () { const r = { type: 'Safety', analysis: 'Independence' };
            T.migrateRow(r); return r.type === 'Safety' && r.analysis === 'Independence'; })());
    check('nothing throws on rubbish',
        (function () { [null, undefined, {}, { type: '' }, { type: 42 }].forEach(x => T.migrateRow(x)); return true; })());
}

// ---------------------------------------------------------------------------
console.log('\n[taxonomy] chips come from the data, so neither failure can recur');
{
    const rows = [{ type: 'Safety' }, { type: 'Safety' }, { type: 'Operational' }, { type: 'Architecture' }];
    const chips = T.chipsFor(rows, 'type');
    check('a chip exists only where something matches it',
        chips.every(c => rows.filter(r => r.type === c.value).length === c.count),
        'this is the half that was broken: four chips matched zero rows');
    check('every stored value gets a chip, including ones the taxonomy does not know',
        chips.map(c => c.value).sort().join('|') === 'Architecture|Operational|Safety',
        'this is the other half: a value with no chip is unreachable');
    check('unknown values are flagged rather than blended in',
        chips.find(c => c.value === 'Architecture').known === false &&
        chips.find(c => c.value === 'Safety').known === true);
    check('a class nobody uses gets no chip',
        !chips.some(c => c.value === 'Certification'));
    check('known classes come first, in taxonomy order',
        chips[0].value === 'Safety' && chips[1].value === 'Operational' && chips[2].value === 'Architecture');
    check('it works on level and analysis too',
        T.chipsFor([{ level: 'L1' }, { level: 'L9' }], 'level').map(c => c.value + ':' + c.known).join(',') === 'L1:true,L9:false');
}

// ---------------------------------------------------------------------------
console.log('\n[taxonomy] the generators emit the class AND the analysis');
{
    // Counted 18 when the split shipped; the HF operational lane added 3. A magic
    // number would go stale on every new generator, so assert the INVARIANT: no
    // generator site may write a class without also writing its provenance.
    {
        const withBoth = (asr.match(/level: 'L[123]', type: '[A-Za-z ]+', analysis: '[A-Za-z ]+',/g) || []).length;
        const anyType  = (asr.match(/level: 'L[123]', type: '[A-Za-z ]+',/g) || []).length;
        check('every generator site carries BOTH type and analysis',
            withBoth === anyType && withBoth >= 18,
            withBoth + ' of ' + anyType + ' sites — a site with a class and no provenance loses which analysis produced it');
    }
    check('no generator still writes the analysis vocabulary into type',
        !/type: '(Probabilistic|Design Assurance|Independence|Maintenance)'/.test(asr));
    check('the HF operational lane is Operational class / Human Factors analysis',
        (asr.match(/type: 'Operational', analysis: 'Human Factors'/g) || []).length === 3,
        'Human Factors was one of the types with zero generators');
    check('the FTA interval generator is Maintainability, not Safety',
        /type: 'Maintainability', analysis: 'Maintenance'/.test(asr));
    check('independence, DAL and probability requirements are all Safety class',
        (asr.match(/type: 'Safety', analysis: 'Independence'/g) || []).length === 10 &&
        (asr.match(/type: 'Safety', analysis: 'Design Assurance'/g) || []).length === 4 &&
        // A3 (22 Aug 2026) added the collapsed provider-resource L3 — a third
        // Safety/Probabilistic emitter (the consumer side is Interface class).
        (asr.match(/type: 'Safety', analysis: 'Probabilistic'/g) || []).length === 3);
    check('a regenerate carries the analysis forward with the type',
        /prev\.type = next\.type;\s*\n\s*prev\.analysis = next\.analysis;/.test(asr),
        'updating the class and stranding the provenance on the old value would be worse than not splitting');
    check('the reason is recorded where the next reader will be',
        /"Probabilistic" was never a peer of\s*\n\/\/ "Safety"/.test(asr));
}

// ---------------------------------------------------------------------------
console.log('\n[taxonomy] the form can now author something the filter can find');
{
    ['ac', 'sys'].forEach(sc => {
        check(sc + ' form offers the §5.3.1 classes',
            new RegExp('id="' + sc + '-req-type">(<option>(Safety|Functional|Customer|Operational|Performance|Physical and Installation|Maintainability|Interface|Certification|Derived|Re-Use)</option>){11}').test(html));
        check(sc + ' form has its own analysis field',
            new RegExp('id="' + sc + '-req-analysis"').test(html));
        check(sc + ' form no longer offers L4',
            !new RegExp('id="' + sc + '-req-level"[^>]*><option>L1</option><option>L2</option><option>L3</option><option>L4</option>').test(html),
            'nothing else in the product recognised L4');
    });
    check('the analysis field is wired through the form plumbing',
        (lab.match(/analysis: '(ac|sys)-req-analysis'/g) || []).length === 2 &&
        (lab.match(/'(ac|sys)-req-analysis'/g) || []).length === 4,
        'a select nobody reads is worse than no select');
    check('req_taxonomy.js loads BEFORE assurance_modules.js',
        html.indexOf('req_taxonomy.js?v=') > 0 &&
        html.indexOf('req_taxonomy.js?v=') < html.indexOf('assurance_modules.js?v='));
}

// ---------------------------------------------------------------------------
console.log('\n[taxonomy] the migration runs where it can actually persist');
{
    check('the source arrays are migrated, not the spread copies',
        /_vvMigrateReqTaxonomy\(acReqData \|\| \[\]\);/.test(help) &&
        /\(systemsData \|\| \[\]\)\.forEach\(s => _vvMigrateReqTaxonomy\(s\.req \|\| \[\]\)\);/.test(help),
        'the collector spreads every row — migrating its output would rewrite throwaways and never persist');
    check('…and the trap is written down',
        /migrating the returned list would rewrite throwaways/.test(help));
    check('it sits at the single point every requirements view funnels through',
        help.indexOf('function _vvMigrateReqTaxonomy') < help.indexOf('function _vvAllRequirements'),
        'a migration wired into two of the three load paths is the reachability failure this codebase keeps rediscovering');
    check('the hardcoded chip lists are gone',
        !/_chip\('Safety', 'type', 'Safety'/.test(help) &&
        !/_chip\('High', 'level', 'High-level'/.test(help));
    check('the analysis filter actually applies',
        /f\.analysis && f\.analysis !== 'any'/.test(help),
        'a chip that filters nothing is how this started');
    check('the provenance stays visible in its own column',
        (help.match(/esc\(r\.analysis \|\| ''\)/g) || []).length === 2 &&
        (help.match(/Which analysis produced this requirement/g) || []).length === 2);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
