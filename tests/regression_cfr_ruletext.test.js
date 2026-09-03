/*
 * tests/regression_cfr_ruletext.test.js — verbatim 14 CFR rule-text lane
 * (site/cfr_ruletext_kb_data.js, window.SL_CFRTEXT_KB). Waqas, 1 Sep 2026:
 * "full CFR rule text." Scope is the system-safety / equipment / general-airworthiness
 * sections a safety assessment cites (Part 25 Subpart F + control systems; Part 23 A64
 * §23.2500-series), NOT the whole rulebook. Pins the section set, id scheme, the
 * public-domain SOURCE posture (verbatim OK), verbatim fidelity of the crown-jewel
 * sections, purity, and the retriever/loader/bot wiring. Executes the real module.
 * Run: node tests/regression_cfr_ruletext.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };

const KB = require(path.join(SITE, 'cfr_ruletext_kb_data.js'));
const ksrc = read('cfr_ruletext_kb_data.js');
const chunks = KB.chunks;
const byId = id => chunks.find(c => c.id === id);
const txt = id => (byId(id) || {}).text || '';

check('19 chunks (1 lane intro + 18 rule sections)', chunks.length === 19, 'got ' + chunks.length);
check('browser global SL_CFRTEXT_KB v1 + node export', /window\.SL_CFRTEXT_KB = \{ version: 1, method: 'lexical'/.test(ksrc) && KB.version === 1 && Array.isArray(chunks));
check('ids: cfr-lane-00 + cfr-25-* / cfr-23-*, unique', (function () {
    const ids = chunks.map(c => c.id);
    return new Set(ids).size === ids.length && ids[0] === 'cfr-lane-00' && ids.slice(1).every(i => /^cfr-2[35]-/.test(i));
})());

// Part 25 systems/equipment + control; Part 23 A64 §23.2500-series
{
    const p25 = ['cfr-25-671','cfr-25-1301','cfr-25-1302','cfr-25-1309','cfr-25-1316','cfr-25-1322','cfr-25-1329','cfr-25-1351'];
    const p23 = ['cfr-23-2500','cfr-23-2505','cfr-23-2510','cfr-23-2515','cfr-23-2520','cfr-23-2525','cfr-23-2530','cfr-23-2600','cfr-23-2605','cfr-23-2620'];
    check('8 Part 25 sections present', p25.every(byId), 'missing ' + p25.filter(i => !byId(i)).join(','));
    check('10 Part 23 A64 sections present', p23.every(byId), 'missing ' + p23.filter(i => !byId(i)).join(','));
}

// public-domain posture keyed on SOURCE — every non-intro chunk source begins "14 CFR "
check('every section chunk source begins "14 CFR " (public-domain guard key)', chunks.every(c => /^14 CFR /.test(String(c.source))));
check('module header declares 14 CFR public domain + the deliberate scope cut', /work of the US Government — PUBLIC DOMAIN/.test(ksrc) && /NOT the entire/.test(ksrc));

// verbatim fidelity — exact clauses that MUST survive byte-for-byte (guards against paraphrase/corruption)
check('§25.1309 verbatim: applicability + the Part 33/35 carve-outs',
    /apply to any equipment or system as installed on the airplane/.test(txt('cfr-25-1309')) &&
    /uncontained engine rotor failure, engine case rupture, or engine case burn-through/.test(txt('cfr-25-1309')) &&
    /propeller debris release failures addressed by § 25\.905\(d\) and part 35/.test(txt('cfr-25-1309')));
check('§23.2510 verbatim: inverse-relationship + the three objectives',
    /logical and acceptable inverse relationship between the average probability and the severity/.test(txt('cfr-23-2510')) &&
    /Each catastrophic failure condition is extremely improbable/.test(txt('cfr-23-2510')) &&
    /Each hazardous failure condition is extremely remote/.test(txt('cfr-23-2510')) &&
    /Each major failure condition is remote/.test(txt('cfr-23-2510')));
check('§23.2525 verbatim: system power generation/storage/distribution single-failure clause',
    /System power generation, storage, and distribution/.test(txt('cfr-23-2525')) &&
    /no single failure or malfunction of any one power supply/.test(txt('cfr-23-2525')) &&
    /continued safe flight and landing/.test(txt('cfr-23-2525')));

// modern recodified text uses "must", never "shall"; pure data module
check('no "shall" anywhere (modern recodified 14 CFR uses "must")', (ksrc.match(/\bshall\b/gi) || []).length === 0);
check('module is pure data: no RNG/Date/eval/DOM', !/Math\.random|new Date|Date\.now|document\.|\(0, eval\)|new Function/.test(ksrc));

// retriever + loader + bot wiring
check('ai_assistant._ftaKbChunks concats SL_CFRTEXT_KB', /window\.SL_CFRTEXT_KB && Array\.isArray\(window\.SL_CFRTEXT_KB\.chunks\)/.test(read('ai_assistant.js')) && /if \(cfrtext\.length\) out = out\.concat\(cfrtext\)/.test(read('ai_assistant.js')));
check('ai_loader.js lists cfr_ruletext_kb_data.js', /cfr_ruletext_kb_data\.js\?v=/.test(read('ai_loader.js')));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
