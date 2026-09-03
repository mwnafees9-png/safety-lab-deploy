/*
 * tests/regression_methods_kb.test.js — quantitative-method KB chunks added to the FTA
 * lane (source kb/fta_kb_chunks.json, shipped as fta_kb_data.js / window.SL_FTA_KB).
 * Waqas, 1 Sep 2026: "methodology refs (NUREG-0492 / NASA)". These let ANEM EXPLAIN the
 * quantitative methods the SOLVER already computes (importance measures, CCF, uncertainty)
 * grounded in the public-domain source documents. The strongest guard here is that the KB's
 * CCF formula matches the ENGINE's actual MGL formula — the AI must not describe a method
 * differently from what the tool computes. Executes the real generated asset in a VM.
 * Run: node tests/regression_methods_kb.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };

// load the generated FTA KB (assigns window.SL_FTA_KB; no node export) via a VM sandbox
const sb = { window: {} }; vm.createContext(sb); vm.runInContext(read('fta_kb_data.js'), sb);
const chunks = sb.window.SL_FTA_KB.chunks;
const byId = id => chunks.find(c => c.id === id) || {};
const txt = id => byId(id).text || '';
const src = id => byId(id).source || '';

const NEW = ['imp-01', 'imp-02', 'imp-03', 'imp-04', 'ccfparam-01', 'uncert-01', 'pra-01'];
check('all 7 methodology chunks present', NEW.every(i => byId(i).id), 'missing ' + NEW.filter(i => !byId(i).id).join(','));

// correct source attribution — no wrong document numbers
check('NUREG-0492 chunks sourced NRC-NUREG-0492 (cut sets, Birnbaum, Fussell-Vesely)',
    ['imp-01', 'imp-02', 'imp-03'].every(i => src(i) === 'NRC-NUREG-0492'));
check('PRA-guide chunks sourced NASA-SP-2011-3421 (RAW/RRW, CCF params, uncertainty, PRA)',
    ['imp-04', 'ccfparam-01', 'uncert-01', 'pra-01'].every(i => src(i) === 'NASA-SP-2011-3421'));

// verbatim-correct document identities (guards against citing a wrong doc)
check('NUREG-0492 identity correct (Fault Tree Handbook, NRC, January 1981)',
    /Fault Tree Handbook, U\.S\. NRC, January 1981/.test(txt('imp-01')));
check('NASA/SP-2011-3421 identity correct (PRA Procedures Guide, 2nd ed., December 2011)',
    /Probabilistic Risk Assessment Procedures Guide for NASA Managers and Practitioners, 2nd ed\., December 2011/.test(txt('imp-04')));

// method content correct
check('Birnbaum = marginal dQ_top/dq_i, independent of q_i', /dQ_top\/dq_i/.test(txt('imp-02')) && /does not itself depend on q_i/.test(txt('imp-02')));
check('Fussell-Vesely = fractional contribution via cut sets containing i', /union of all minimal cut sets that contain i/.test(txt('imp-03')));
check('RAW = Q(i=1)/Q_top and RRW = Q_top/Q(i=0)', /Q\(q_i=1\)\/Q_top/.test(txt('imp-04')) && /Q_top\/Q\(q_i=0\)/.test(txt('imp-04')));
check('uncertainty: lognormal + error factor + mean exceeds point estimate', /error factor EF/.test(txt('uncert-01')) && /mean top-event probability exceeds the point estimate/i.test(txt('uncert-01')));

// THE key cross-check: KB CCF formula matches the ENGINE's actual MGL formula
{
    const eng = read('fta_quant_modules.js').replace(/\s+/g, '');
    const kb = txt('ccfparam-01').replace(/\s+/g, '');
    // engine tiers: p = q * beta * (1 - gamma); q*beta*gamma*(1-delta); q*beta*gamma*delta
    const engHasT2 = eng.indexOf('q*beta*(1-gamma)') !== -1;
    const engHasT3 = eng.indexOf('q*beta*gamma*(1-delta)') !== -1;
    const kbHasT2 = kb.indexOf('q*beta*(1-gamma)') !== -1;
    const kbHasT3 = kb.indexOf('q*beta*gamma*(1-delta)') !== -1;
    check('engine implements the MGL tier formulas the KB describes', engHasT2 && engHasT3, 'eng t2=' + engHasT2 + ' t3=' + engHasT3);
    check('KB CCF chunk states the SAME MGL tier formulas as the engine', kbHasT2 && kbHasT3 && /reduces MGL to the beta-factor model/.test(txt('ccfparam-01')));
}

// engine actually computes the named importance measures the KB explains
{
    const q = read('fta_quant_modules.js');
    check('engine computes Birnbaum, Fussell-Vesely, RAW and RRW (KB is not describing a phantom feature)',
        /Birnbaum/i.test(q) && /Fussell-Vesely/i.test(q) && /RAW/.test(q) && /RRW/.test(q));
}

// no fabricated "shall"/normative-clause reproduction; these are authored summaries
check('methodology chunks are authored summaries (public-domain sources; no reproduced normative clause markers)',
    NEW.every(i => !/\bshall\b/i.test(txt(i))));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
