#!/usr/bin/env node
/*
 * regression_ram_determinism.test.js — Phase 4 of the consistency campaign: RAM.
 *
 * WHY A DIFFERENT CAMPAIGN. The AI-consistency programme measures model repeatability:
 * two draws, same config, scored against a golden. RAM's NUMERIC lanes are computed and
 * authored, not generated — a MIL-HDBK-217F parts count, a CTMC solution, a closed-form
 * availability, a seeded Monte Carlo. Running a repeatability campaign against a
 * deterministic calculator would produce a meaningless 1.000 and prove nothing. So for
 * RAM the consistency question is three different questions, each provable by exit code:
 *
 *   (a) DETERMINISM — identical inputs produce byte-identical numbers, run to run and
 *       reload to reload. Censused 2 Sep 2026: no RAM calculator reads Math.random, Date
 *       or performance.now inside a computation; the only RNG in the family is rbd_mc's
 *       mulberry32, which is SEEDED (default 42) so a result is reproducible by design.
 *       Date and Math.random appear in the RAM modules only to mint record ids and to
 *       default a form's month field. This file proves (a) by RUNNING each calculator
 *       twice on deep-cloned inputs and comparing the JSON, and pins the census with a
 *       per-function purity check that a mutation can trip.
 *
 *   (b) THE FIDELITY RULE — the AI never authors a reliability number. ram_ai.js drafts
 *       PROSE ONLY (FRACAS narrative, MSG-3 rationale) under _NUM_BAN. The prompt ban was
 *       already pinned; what was not pinned is the ACCEPT PATH: if a model ignores the ban
 *       and returns a number anyway, does anything reach a numeric field? This file feeds
 *       a hostile response carrying mtbf/lambda/hours/failures keys and proves the record's
 *       numeric fields are byte-identical after accept. A prompt is a request; the accept
 *       filter is the guarantee.
 *
 *   (c) TRACEABILITY — every 217F prediction row carries the handbook citation it was
 *       computed from, so a number can be walked back to a page. Pinned on the data and
 *       on the computed row.
 *
 * Correction to the census that framed this campaign: it said "there is no RAM AI
 * drafter". There is — ram_ai.js — and it is prose-only by construction. The numeric
 * framing stands; the two prose features join the skill registry in this same increment.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const S = f => fs.readFileSync(path.join(ROOT, 'site', f), 'utf8');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const clone = o => JSON.parse(JSON.stringify(o));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('\nregression_ram_determinism — computed, not generated\n');

// ============================================================ (a) DETERMINISM
console.log('[a] identical inputs -> identical numbers, executed');

// --- MIL-HDBK-217F parts count ---------------------------------------------
{
    const DATA = require(path.join(ROOT, 'site/ram_predict_data.js'));
    global.window = { RAM_PREDICT_DATA: DATA };
    delete require.cache[require.resolve(path.join(ROOT, 'site/ram_predict.js'))];
    const RP = require(path.join(ROOT, 'site/ram_predict.js'));
    const rows = [{ cat: 'diode-gp', qty: 10, quality: 'JANTX' }, { cat: 'res-film', qty: 100, quality: 'R' }, { cat: 'cap-ceramic', qty: 20, quality: 'M' }];
    const r1 = RP.predict(clone(rows), 'AUF'), r2 = RP.predict(clone(rows), 'AUF');
    check('217F parts count: two runs on cloned inputs are byte-identical', same(r1, r2));
    // a fresh module instance, not just a second call — no hidden state survives reload
    delete require.cache[require.resolve(path.join(ROOT, 'site/ram_predict.js'))];
    const RP2 = require(path.join(ROOT, 'site/ram_predict.js'));
    check('217F parts count: a reloaded module gives the same bytes', same(r1, RP2.predict(clone(rows), 'AUF')));
    check('217F: changing an input changes the output (the comparison is not vacuous)', !same(r1, RP.predict(clone(rows), 'GB')));
}

// --- MIL-HDBK-217F stress model --------------------------------------------
{
    delete require.cache[require.resolve(path.join(ROOT, 'site/mil217f_stress.js'))];
    const M = require(path.join(ROOT, 'site/mil217f_stress.js'));
    const GOOD = { kind: 'microprocessor', tech: 'mos', bits: 16, eaTech: 'mos', tjC: 85, pkg: 'dip-hermetic', pins: 40, env: 'AIC', quality: 'B', yearsInProduction: 4 };
    const s1 = M.computeStress217F(clone(GOOD)), s2 = M.computeStress217F(clone(GOOD));
    check('217F stress: two runs are byte-identical', same(s1, s2));
    check('217F stress: a different junction temperature moves the number', !same(s1, M.computeStress217F(Object.assign(clone(GOOD), { tjC: 110 }))));
}

// --- CTMC (transient + steady state) ---------------------------------------
{
    globalThis.window = globalThis;
    globalThis.esc = s => String(s);
    globalThis.ftaConfig = { exposureTime: 10 };
    globalThis.projectConfig = { markovModels: [] };
    globalThis.acFhaData = []; globalThis.systemsData = []; globalThis.flightPhasesData = [];
    globalThis.getAllSysFha = () => [];
    (0, eval)(['engine_modules.js', 'fta_quant_modules.js', 'markov_ctmc.js'].map(f => S(f)).join('\n;\n'));
    const REP = (lam, mu) => ({ states: [{ name: 'Up' }, { name: 'Down', isFailed: true }],
        transitions: [{ from: 'Up', to: 'Down', rate: lam }].concat(mu ? [{ from: 'Down', to: 'Up', rate: mu }] : []) });
    const t1 = globalThis.solveMarkovTransient(REP(2.4e-5, 0.5), 5000), t2 = globalThis.solveMarkovTransient(REP(2.4e-5, 0.5), 5000);
    check('CTMC transient: two solutions are byte-identical', same(t1, t2));
    const ss1 = globalThis.solveMarkovModel(REP(2.4e-5, 0.5)), ss2 = globalThis.solveMarkovModel(REP(2.4e-5, 0.5));
    check('CTMC steady state: two solutions are byte-identical', same(ss1, ss2));
}

// --- closed-form availability ---------------------------------------------
{
    eval(S('avail_closedform.js'));
    const ACF = globalThis.AvailClosedForm;
    const a1 = ACF.itemA(1e-4, 8), a2 = ACF.itemA(1e-4, 8);
    check('closed-form item availability is identical run to run', a1 === a2 && typeof a1 === 'number');
    check('series/parallel structure availability is identical run to run',
        same(ACF.seriesA([0.999, 0.998, 0.9995]), ACF.seriesA([0.999, 0.998, 0.9995])) &&
        same(ACF.parallelQ([1e-3, 2e-3]), ACF.parallelQ([1e-3, 2e-3])));
}

// --- seeded Monte Carlo -----------------------------------------------------
{
    const src = S('rbd_mc.js');
    check('rbd_mc declares its PRNG is seeded for reproducibility', /SEEDED runs \(mulberry32 PRNG\) so every result is reproducible/.test(src));
    check('rbd_mc defaults the seed rather than drawing one from the clock', /mulberry32\(seed == null \? 42 : seed\)/.test(src));
    // The PRNG is the one place a Monte Carlo could become non-deterministic, so it is
    // exercised directly: mulberry32 is self-contained (no model helpers), and the whole
    // determinism claim rests on it. Same seed -> identical stream; different seed ->
    // different. mcRun's own reproducibility rides on this plus the seed-defaulting above,
    // and its end-to-end determinism is proved live on the deployed build, not by lifting
    // its model-shaped helpers (_survive et al.) out of context here.
    const m32 = (src.match(/function mulberry32\(seed\) \{[\s\S]*?\n    \}/) || [''])[0];
    check('mulberry32 lifted for execution', m32.length > 100);
    let prng = null;
    try { prng = new Function(m32 + '\nreturn mulberry32;')(); } catch (e) { check('mulberry32 builds', false, e.message); }
    if (prng) {
        const draw = (seed, n) => { const r = prng(seed); const out = []; for (let i = 0; i < n; i++) out.push(r()); return out; };
        check('the seeded PRNG gives an identical stream for the same seed', same(draw(42, 20), draw(42, 20)));
        check('a different seed gives a different stream (the seed is live)', !same(draw(42, 20), draw(43, 20)));
        check('the stream is real numbers in [0,1)', draw(42, 20).every(x => typeof x === 'number' && x >= 0 && x < 1));
    }
}

// --- purity census, per computational function ------------------------------
// Whole-file counts include id minting and form defaults, which is fine. The functions
// that COMPUTE must be clean, and this is what a mutation trips.
console.log('\n[a2] purity census — no clock, no RNG, inside any calculator');
{
    const IMPURE = /Math\.random|Date\.now|new Date|performance\.now/;
    const fnBody = (src, name) => (src.match(new RegExp('function ' + name + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n    \\}')) || [''])[0];
    const CALCS = [
        ['ram_predict.js', ['predict', 'compute', 'drift']],
        ['mil217f_stress.js', ['computeStress217F', 'piT', 'piL']],
        ['markov_ctmc.js', ['solveMarkovTransient', '_buildQ', 'validateMarkovModel']],
        ['avail_closedform.js', ['itemA', 'itemAFromMttr', 'seriesA', 'parallelQ', 'seriesQApprox', 'structureQ']],
        ['rbd_mc.js', ['mcRun']],
        ['ram_modules.js', ['_availOf', '_ramPredictionRows', 'ramDispatchStats', 'ramThreadEvidence']]
    ];
    CALCS.forEach(([file, fns]) => {
        const src = S(file);
        fns.forEach(fn => {
            const body = fnBody(src, fn);
            check(file + ' :: ' + fn + ' located', body.length > 40);
            check(file + ' :: ' + fn + ' reads no clock and no RNG', body.length > 40 && !IMPURE.test(body));
        });
    });
}

// ============================================================ (b) FIDELITY
console.log('\n[b] the AI never authors a number — the ACCEPT path, under a hostile model');
// The accept-path proof drives the real modal, so it needs a DOM. jsdom is on the wall
// mirror but not every environment; where it is absent this section SKIPS (loudly), and
// the determinism/traceability/registry checks above and the registry checks below still
// run and still gate. The prompt-side ban is also pinned DOM-free in regression_ram_ai.
let JSDOM = null;
try { JSDOM = require('jsdom').JSDOM; } catch (_) { try { JSDOM = require('/tmp/jsdom-env/node_modules/jsdom').JSDOM; } catch (_) {} }
(async () => {
  if (!JSDOM) {
    console.log('  SKIP  [b] accept-path fidelity — jsdom unavailable here (runs on the wall mirror)');
  } else {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="ram-rel-host"></div><div id="ram-msg3-host"></div></body></html>');
    global.window = dom.window; global.document = dom.window.document;
    global.showToast = () => {};
    global.projectConfig = { msg3: { msis: [] } };
    global.commitSaveChanges = () => {};
    (0, eval)(S('ai_badges.js'));
    const FIELD = [{ id: 'FRC-1', beRef: 'BE-100', windowMonths: 6, hours: 1200, failures: 2, observedMtbf: 600, by: 'W' }];
    const numericBefore = clone({ windowMonths: FIELD[0].windowMonths, hours: FIELD[0].hours, failures: FIELD[0].failures, observedMtbf: FIELD[0].observedMtbf });
    dom.window._ramStore = () => ({ tasks: [], field: FIELD, dispatch: { targets: [], records: [] } });
    dom.window.ramFieldRows = () => [{ f: FIELD[0], predicted: 5000, lcb: 800, verdict: 'finding', point: null }];
    dom.window.slLoadAI = () => Promise.resolve();
    let sys = '';
    // A HOSTILE model: ignores the ban, returns numbers in every shape it can think of.
    dom.window.SafetyLabAI = { complete: req => { sys = req.system || ''; return Promise.resolve({ model: 'hostile', text: JSON.stringify({
        narrative: 'MTBF is 4321 h and the failure rate is 2.3e-4/h.',
        action: 'Set the interval to 500 h.',
        mtbf: 4321, lambda: 2.3e-4, hours: 99999, failures: 0, observedMtbf: 1, windowMonths: 99, predictedMtbfH: 1, interval: 500,
        assumptions: []
    }) }); } };
    dom.window.SafetyLabAiAssumptions = { add: e => e };
    dom.window.AiFidelity = { recordProvenance: () => {} };
    (0, eval)(S('ram_ai.js'));

    await dom.window.ramAiFracas('FRC-1');
    check('the number ban rode the prompt', /Never propose, alter, or estimate any number/.test(sys));
    const acc = dom.window.document.querySelector('#ram-ai-modal button[data-accept], #ram-ai-modal .ram-ai-accept, #ram-ai-modal button');
    let accepted = false;
    try {
        const btns = [...dom.window.document.querySelectorAll('#ram-ai-modal button')];
        const b = btns.find(x => /accept/i.test(x.textContent)) || acc;
        if (b) { b.click(); accepted = true; }
    } catch (_) {}
    check('accept was exercised', accepted);
    const numericAfter = { windowMonths: FIELD[0].windowMonths, hours: FIELD[0].hours, failures: FIELD[0].failures, observedMtbf: FIELD[0].observedMtbf };
    check('every numeric field on the record is byte-identical after accepting a hostile draft', same(numericBefore, numericAfter), JSON.stringify(numericAfter));
    check('no numeric key the model invented landed on the record',
        ['mtbf', 'lambda', 'predictedMtbfH', 'interval'].every(k => !(k in FIELD[0])), Object.keys(FIELD[0]).join(','));
    check('only the two prose fields were written', typeof FIELD[0].narrative === 'string' && typeof FIELD[0].action === 'string');
    // The allow-list is the accept path's censused write set (ram_ai.js): the two prose
    // fields, an empty actionBy placeholder, and provenance. Anything else landing here
    // is a numeric key that got through.
    check('the write set is prose + provenance and nothing else',
        Object.keys(FIELD[0]).every(k => ['id', 'beRef', 'windowMonths', 'hours', 'failures', 'observedMtbf', 'by', 'narrative', 'action', 'actionBy',
            'aiGenerated', 'aiFeature', 'aiModel', 'aiAt', 'aiSkill', 'humanEdited', 'humanEditedAt'].indexOf(k) >= 0), Object.keys(FIELD[0]).join(','));
  }

    // ======================================================== (c) TRACEABILITY
    console.log('\n[c] every predicted number walks back to a handbook page');
    {
        const DATA = require(path.join(ROOT, 'site/ram_predict_data.js'));
        const cats = Object.keys(DATA.categories || DATA.CATEGORIES || DATA);
        const catObj = DATA.categories || DATA.CATEGORIES || DATA;
        const uncited = cats.filter(k => { const c = catObj[k]; return c && typeof c === 'object' && ('lambdaG' in c || 'lg' in c || 'piQ' in c) && !(c.page || c.cite || c.source || c.ref); });
        check('every 217F category in the data carries a page citation', uncited.length === 0, 'uncited: ' + uncited.slice(0, 5).join(','));
        global.window = { RAM_PREDICT_DATA: DATA };
        delete require.cache[require.resolve(path.join(ROOT, 'site/ram_predict.js'))];
        const RP = require(path.join(ROOT, 'site/ram_predict.js'));
        const r = RP.predict([{ cat: 'diode-gp', qty: 10, quality: 'JANTX' }], 'AIC');
        const row = r.rows && r.rows[0];
        const cited = row && (row.page || row.cite || row.source || row.basis || (r.basis && /217F/.test(String(r.basis))));
        check('a computed prediction row (or its result) carries its handbook basis', !!cited, JSON.stringify(row).slice(0, 200));
    }

    // ======================================================== the registry
    console.log('\n[d] the two RAM prose features join the versioned-skill discipline');
    {
        const sk = S('ai_skills.js');
        check('ram.fracas.draft registered', /'ram\.fracas\.draft': 1/.test(sk) && /"ram\.fracas\.draft": "ram\.fracas\.draft"/.test(sk));
        check('ram.msg3.rationale registered', /'ram\.msg3\.rationale': 1/.test(sk) && /"ram\.msg3\.rationale": "ram\.msg3\.rationale"/.test(sk));
        const ra = S('ram_ai.js');
        check('ram_ai serves the registered body with its inline text as fallback',
            /_skillBody\('ram\.fracas\.draft', _SPEC_FRACAS\)/.test(ra) && /_skillBody\('ram\.msg3\.rationale', _SPEC_MSG3\)/.test(ra));
        check('ram_ai stamps the record with the skill', /aiSkill = _skillStamp\('ram\.fracas\.draft'\)/.test(ra) && /aiSkill = _skillStamp\('ram\.msg3\.rationale'\)/.test(ra));
        // BYTE PARITY, executed: compose ram_ai's inline bodies exactly as the module does
        // and compare them to what the registry serves. A registry-only edit goes red here.
        const nb = ra.match(/const _NUM_BAN = ('[^\n]*');/)[1];
        const ac = ra.match(/const _ASM_CLAUSE = ('[^\n]*');/)[1];
        const fr = ra.match(/const _SPEC_FRACAS = ([\s\S]*?);\n    const _SPEC_MSG3/)[1];
        const ms = ra.match(/const _SPEC_MSG3 = ([\s\S]*?);\n    function _skillBody/)[1];
        const inline = new Function('const _NUM_BAN=' + nb + ';const _ASM_CLAUSE=' + ac + ';return [' + fr + ',' + ms + '];')();
        global.window = {};
        delete require.cache[require.resolve(path.join(ROOT, 'site/ai_skills.js'))];
        require(path.join(ROOT, 'site/ai_skills.js'));
        const SK = global.window.SLABSkills;
        check('registry body === inline body, byte for byte (fracas)', SK.bodyFor('ram.fracas.draft') === inline[0]);
        check('registry body === inline body, byte for byte (msg3)', SK.bodyFor('ram.msg3.rationale') === inline[1]);
        check('the number ban is INSIDE both registered bodies, so dropping it moves the hash',
            /Never propose, alter, or estimate any number/.test(SK.bodyFor('ram.fracas.draft')) && /Never propose, alter, or estimate any number/.test(SK.bodyFor('ram.msg3.rationale')));
    }

    console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
    process.exit(fail ? 1 : 0);
})();
