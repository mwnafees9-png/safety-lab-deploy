/*
 * tests/regression_ac_library.test.js — the FAA Part 23 & 25 Advisory Circular library
 * (site/ac_library_kb_data.js). Waqas, 1 Sep 2026: "I want all the ACs in there."
 *
 * Pins the count and id scheme, the public-domain posture (US Gov works — verbatim OK),
 * that every chunk names an AC number + a 14 CFR section it advises on, that the
 * §1309-family ACs are NOT duplicated here (they live in the cert-standards lane), and
 * that the pre-Amendment-64 Part 23 guides are flagged. Executes the real module.
 * Run: node tests/regression_ac_library.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };

const KB = require(path.join(SITE, 'ac_library_kb_data.js'));
const ksrc = read('ac_library_kb_data.js');
const chunks = KB.chunks;
const ALL = chunks.map(c => c.text).join('\n');

check('42 chunks (1 lane intro + 41 ACs)', chunks.length === 42, 'got ' + chunks.length);
check('ids unique; one ac-lane-00 + 41 ac-23/25-* ids', (function () {
    const ids = chunks.map(c => c.id);
    return new Set(ids).size === ids.length && ids[0] === 'ac-lane-00' && ids.slice(1).every(i => /^ac-2[35]-/.test(i));
})());
check('every AC chunk names an AC number and a 14 CFR section it advises on', chunks.slice(1).every(c => /FAA AC [0-9]/.test(c.text) && /14 CFR (§|part)/.test(c.text)));
check('every AC chunk carries the public-domain / not-mandatory disclaimer', chunks.slice(1).every(c => /public domain and describes an acceptable means, but not the only means/.test(c.text)));
check('the module declares FAA ACs public domain and the pre-Amdt-64 caveat', /works of the US Government — PUBLIC DOMAIN/.test(ksrc) && /Amendment 64 \(2017\) restructured/.test(ksrc));
check('the browser global is SL_ACLIB_KB with version + chunks', /window\.SL_ACLIB_KB = \{ version: 1, method: 'lexical'/.test(ksrc) && Array.isArray(chunks));

// count Part 25 vs Part 23 ACs present
{
    const p25 = chunks.filter(c => /^ac-25-/.test(c.id)).length;
    const p23 = chunks.filter(c => /^ac-23-/.test(c.id)).length;
    check('23 Part 25 ACs + 18 Part 23 ACs present', p25 === 23 && p23 === 18, 'p25=' + p25 + ' p23=' + p23);
}

// the §1309-family ACs must NOT be duplicated here (avoid two sources of truth)
// scoped to the AC entry chunks (slice 1); the lane-intro chunk legitimately POINTS to
// the §1309-family ACs as living in the cert-standards lane.
check('no §1309-family AC has its own entry chunk here (they live in cert-standards)',
    !chunks.slice(1).some(c => /FAA AC (25\.1309-1[AB]|23\.1309-1E|20-174|20-115D|20-152A|33\.75-1A|27-1B|29-2C)/.test(c.text)));

// key safety ACs are present and tagged
{
    const safety = ['ac-25-16', 'ac-25-11b', 'ac-25-9a', 'ac-25-27a', 'ac-25-19a', 'ac-25-22', 'ac-25-24', 'ac-23-17c', 'ac-23-16a', 'ac-23-13a'];
    const missing = safety.filter(id => !chunks.find(c => c.id === id));
    check('the safety-relevant ACs are present (electrical fire, displays, smoke, EZAP, CMR, mechanical, engine imbalance, P23 systems/powerplant/structure)', missing.length === 0, 'missing: ' + missing.join(', '));
    check('safety ACs carry the "System-safety-relevant" tag', safety.every(id => /System-safety-relevant/.test(chunks.find(c => c.id === id).text)));
}

// pre-Amdt-64 Part 23 guides flagged
check('pre-Amdt-64 Part 23 guides carry the restructure caveat (23-8C, 23-17C, 23-16A)',
    ['ac-23-8c', 'ac-23-17c', 'ac-23-16a'].every(id => /Pre-Amendment-64|pre-Amdt-64|Amdt-64/i.test(chunks.find(c => c.id === id).text)));

// no RNG/Date/eval — deterministic data module
check('module is pure data: no RNG/Date/eval/DOM', !/Math\.random|new Date|Date\.now|document\.|\(0, eval\)|new Function/.test(ksrc));

// retriever wiring: ai_assistant concats SL_ACLIB_KB, loader lists it, bot builder includes it
check('ai_assistant._ftaKbChunks concats SL_ACLIB_KB', /window\.SL_ACLIB_KB && Array\.isArray\(window\.SL_ACLIB_KB\.chunks\)/.test(read('ai_assistant.js')) && /if \(aclib\.length\) out = out\.concat\(aclib\)/.test(read('ai_assistant.js')));
check('ai_loader.js lists ac_library_kb_data.js', /ac_library_kb_data\.js\?v=/.test(read('ai_loader.js')));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
