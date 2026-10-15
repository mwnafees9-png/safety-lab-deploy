#!/usr/bin/env node
/*
 * Regression: grounded AI for zonal and particular risk work (site/zonal_ai.js, SLZonalAI), 14 Oct 2026.
 * Founder rulings: never fabricate; every statement points to a real record or report passage;
 * reports come through the existing AI Inputs; gaps name where the information should come from;
 * nothing applied without the engineer's acceptance. Written from those rulings:
 *   A validator: fabricated id rejected; misquote rejected; quote on the wrong page rejected;
 *     gap without a named source rejected; fact without source rejected; number not in source rejected
 *   B lane payloads: no geometry (bbox, centroid, shape), no file name / hash, no whole document
 *   C retrieval determinism (twice, and with documents in reverse order)
 *   D apply only through SLChangeAck.batch and only accepted ids
 *   E PRA model adapter tolerates the module being absent or throwing
 *   F eval: handwritten reference scores clean, adversarial scores dirty
 *   G mutations: each break must turn a check red
 *   H wiring: script tag after cad_zonal.js, no eval, no em dash
 * Run: node tests/regression_zonal_ai_20261014.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + d : '')); } };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'site', 'zonal_ai.js'), 'utf8');
const IDX = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');
const F = require('../eval/zonal_ai/fixtures.js');
const EM = String.fromCharCode(0x2014);

function load(src) { const sb = { module: { exports: {} }, console }; sb.globalThis = sb; vm.runInNewContext(src, sb); return sb.module.exports; }

// a richer project for the zonal lane: zone, equipment, functions, FC, ZSA, flag, plus CAD
// geometry the lane must never pass on
function zEnv(Z, extra) {
    const zones = { 'z-211': { id: 'z-211', code: '211', name: 'Avionics bay', equipment: ['sys-fcc1', 'sys-fcc2'], volume: { kind: 'box', min: [0, 0, 0], max: [1, 1, 1] } } };
    return Object.assign(F.env(), {
        zones: { get: id => zones[id] || null, children: () => [], all: () => Object.values(zones) },
        systems: () => [
            { id: 'sys-fcc1', name: 'FCC-1', partNumber: 'PN-FCC-100', functions: [{ funcId: 'F1', funcName: 'Pitch control' }] },
            { id: 'sys-fcc2', name: 'FCC-2', partNumber: 'PN-FCC-200', functions: [{ funcId: 'F1', funcName: 'Pitch control' }] }],
        zsa: () => [{ id: 'zsa-7', zoneId: 'z-211', finding: 'Hydraulic line above FCC rack', mitigation: 'Drip shield', findingStatus: 'open' }],
        cad: Object.assign({}, F.env().cad, {
            zoneImpact: id => id === 'z-211' ? { equipment: [{ sysId: 'sys-fcc1', name: 'FCC-1' }, { sysId: 'sys-fcc2', name: 'FCC-2' }],
                conditions: [{ id: 'fc-12', fcId: 'FC-12', desc: 'Loss of pitch control', severity: 'Catastrophic' }], trees: [{ pageId: 'ft-3', name: 'Loss of pitch', reached: true, additional: 0 }], worst: 'Catastrophic',
                bbox: { min: [1, 2, 3], max: [4, 5, 6] }, centroid: [9, 9, 9] } : null,
            independenceFlags: () => [{ id: 'flag-1', kind: 'sameZone', level: 'violation', gate: { id: 'g-and', displayId: 'G-AND-1', name: 'Both FCC lost', gateType: 'AND' }, zone: { id: 'z-211', code: '211' }, equipment: [{ sysId: 'sys-fcc1' }, { sysId: 'sys-fcc2' }], centroid: [1, 1, 1], parts: [{ pid: 'p1', bbox: { min: [0, 0, 0], max: [1, 1, 1] } }] }]
        }),
        docs: () => F.DOCS.concat([{ id: 'doc-zsa', name: 'Avionics bay installation review.pdf', text: '[p.3] Zone 211 inspection: FCC-1 and FCC-2 are mounted 140 mm apart on the same rack. Hydraulic line H-4 runs above the rack.' }])
    }, extra || {});
}

function suite(Z, tag) {
    const ok = [];
    const T = (n, c, d) => { ok.push(!!c); check(tag + n, c, d); };
    const ctx = Z.gather('damage.assumption', F.CASES[0].target, F.env());
    const V = st => Z.validate({ statements: [st] }, ctx);
    const good = { text: 'PN-NF-410 held a 4 lb bird at 250 KCAS.', kind: 'fact', sources: [{ type: 'report', doc: 'doc-bird', page: 12, quote: 'panel PN-NF-410 was impacted by a 4 lb bird at 250 KCAS (Vc)' }] };
    // A
    T('A1 a correct, quoted fact is accepted', V(good).accepted.length === 1, JSON.stringify(V(good).rejected));
    T('A2 a fabricated record id is rejected', V({ text: 'Severity is Catastrophic.', kind: 'fact', sources: [{ type: 'fc', id: 'FC-404' }] }).rejected.length === 1);
    T('A3 a misquote is rejected', V(Object.assign({}, good, { sources: [{ type: 'report', doc: 'doc-bird', page: 12, quote: 'panel PN-NF-410 was impacted by a 4 lb bird at 260 KCAS (Vc)' }] })).rejected.length === 1);
    const wrongPage = V(Object.assign({}, good, { sources: [{ type: 'report', doc: 'doc-bird', page: 13, quote: 'panel PN-NF-410 was impacted by a 4 lb bird at 250 KCAS (Vc)' }] }));
    T('A4 a real quote cited on the wrong page is rejected', wrongPage.rejected.length === 1 && /not on page 13|no passage/.test(wrongPage.rejected[0].reasons.join(' ')), JSON.stringify(wrongPage.rejected));
    T('A5 a gap that does not name its missing source is rejected', V({ text: 'Unknown.', kind: 'gap', sources: [] }).rejected.length === 1);
    T('A6 a gap naming its source is accepted', V({ text: 'No model result.', kind: 'gap', sources: [], missing: { type: 'pram', where: 'PRA model for the nose volume' } }).accepted.length === 1);
    T('A7 a fact with no source is rejected', V({ text: 'The panel is fine.', kind: 'fact', sources: [] }).rejected.length === 1);
    T('A8 a number not in the quote (8 lb) is rejected', V(Object.assign({}, good, { text: 'PN-NF-410 held an 8 lb bird at 250 KCAS.' })).rejected.length === 1);
    T('A9 rejected statements are listed as "rejected: unsupported"', (V({ text: 'x', kind: 'fact', sources: [] }).rejected[0] || {}).label === 'rejected: unsupported');
    T('A10 whitespace in a quote is normalized', V(Object.assign({}, good, { sources: [{ type: 'report', doc: 'doc-bird', page: 12, quote: 'panel  PN-NF-410 was\nimpacted by a 4 lb bird at  250 KCAS' }] })).accepted.length === 1);
    T('A11 a real record id is accepted', V({ text: 'The part is the nose fairing panel.', kind: 'fact', sources: [{ type: 'part', id: 'p-nf410' }] }).accepted.length === 1);
    T('A12 a quote from a passage not passed to the model is rejected', V(Object.assign({}, good, { sources: [{ type: 'report', doc: 'doc-light', page: 4, quote: 'tested with a 200 kA Component A waveform' }] })).rejected.length === 1);
    T('A13 an unparseable answer yields no statements and a parse error', (() => { const r = Z.validate('not json', ctx); return r.accepted.length === 0 && !!r.parseError; })());
    // B
    const zctx = Z.gather('zonal.breakdown', { zoneId: 'z-211' }, zEnv(Z));
    const req = Z.buildRequest(zctx);
    T('B1 zonal payload carries the computed impact (FC-12, Catastrophic) and the flag and ZSA record', /FC-12/.test(req.user) && /Catastrophic/.test(req.user) && /flag-1/.test(req.user) && /zsa-7/.test(req.user));
    T('B2 zonal payload carries no geometry (bbox, centroid, min/max, volume shape)', !/bbox|centroid|"min"|"max"|"volume":\{/.test(req.user), req.user.slice(0, 300));
    T('B3 zonal payload passes the installation review passage (zone 211)', /140 mm apart/.test(req.user));
    T('B4 no whole document: the stress analysis on the nose (unrelated to zone 211) is not passed', !/MS = \+0\.12/.test(req.user));
    T('B5 no file content beyond passages: passages are under 1000 characters', zctx.passages.every(p => p.text.length < 1000));
    const dctx = Z.gather('damage.assumption', F.CASES[0].target, F.env());
    const dreq = Z.buildRequest(dctx);
    T('B6 damage payload cites part number and passages, no sha / fileName fields', /PN-NF-410/.test(dreq.user) && !/sha256|fileName/.test(dreq.user));
    T('B7 code-written gaps name where missing sources come from (pram)', dctx.missing.some(m => m.type === 'pram' && /PRA model/.test(m.where)));
    T('B8 the system prompt carries the output contract and the never-invent rule', /"statements"/.test(req.system) && /Never write anything you cannot cite/.test(req.system));
    T('B9 the cover passage of a cited report comes along (revision, superseded notice)', dctx.passages.some(p => p.docId === 'doc-bird-old' && p.page === 1));
    // C
    const a = JSON.stringify(Z.gather('damage.assumption', F.CASES[1].target, F.env()).passages);
    const b = JSON.stringify(Z.gather('damage.assumption', F.CASES[1].target, F.env()).passages);
    const rev = JSON.stringify(Z.gather('damage.assumption', F.CASES[1].target, F.env({ docs: () => F.DOCS.slice().reverse() })).passages);
    T('C1 retrieval is deterministic (twice equal, and with documents reversed)', a === b && a === rev);
    T('C2 identifiers match as whole tokens (PN-NF-41 does not hit PN-NF-410)', Z.retrieve(Z.passages(F.DOCS[0]), { ids: ['PN-NF-41'], topic: [] }).length === 0);
    T('C3 PDF pages and Word sections become anchors', Z.passages(F.DOCS[0]).some(p => p.page === 12) && Z.passages(F.DOCS[4]).some(p => p.section && /6\.2/.test(p.section)));
    T('C4 revision is read from the report', Z.passages(F.DOCS[1])[0].revision === 'A' && Z.passages(F.DOCS[0])[0].revision === 'C');
    const allP = [].concat(...F.DOCS.map(d => Z.passages(d)));
    const q = { ids: ['PN-NF-411'], topic: Z.TOPIC.birdStrike };
    const r1 = Z.retrieve(allP, q).map(p => p.pid).join(','), r2 = Z.retrieve(allP.slice().reverse(), q).map(p => p.pid).join(',');
    T('C5 retrieval order does not depend on input order (fixed tie break)', r1 === r2, r1 + ' vs ' + r2);
    return ok;
}

console.log('\n[A-C] validator, payloads, retrieval');
const Z = require('../site/zonal_ai.js');
suite(Z, '');

console.log('\n[D] apply only through the acknowledgement flow');
(async () => {
    const draft = Z.draftFrom(Z.gather('damage.assumption', F.CASES[0].target, F.env()), JSON.stringify({ statements: [{ text: 'No model result.', kind: 'gap', sources: [], missing: { type: 'pram', where: 'PRA model' } }] }));
    let wrote = null, batched = 0;
    const ack = { batch: (label, fn) => { batched++; return Promise.resolve({ acknowledged: true, result: fn() }); } };
    const none = await Z.applyAccepted(draft, [], s => { wrote = s; }, { env: F.env({ changeAck: ack }) });
    check('D1 nothing accepted: nothing written', !none.applied && wrote === null && batched === 0);
    const noAck = await Z.applyAccepted(draft, ['s1'], s => { wrote = s; }, { env: F.env({ changeAck: null }), by: 'W. Engineer' });
    const noName = await Z.applyAccepted(draft, ['s1'], s => { wrote = s; }, { env: F.env({ changeAck: ack }) });
    check('D2b no reviewer name: nothing written', !noName.applied && wrote === null && batched === 0 && /name/.test(noName.reason));
    check('D2 no acknowledgement flow loaded: nothing written', !noAck.applied && wrote === null);
    const yes = await Z.applyAccepted(draft, ['s1'], s => { wrote = s; return 1; }, { env: F.env({ changeAck: ack }), by: 'W. Engineer', at: '2026-10-14' });
    check('D3 accepted ids written once inside SLChangeAck.batch, marked AI drafted, reviewer and date stamped', yes.applied && batched === 1 && wrote.length === 1 && wrote[0].aiDrafted === true && wrote[0].acceptedBy === 'W. Engineer' && wrote[0].acceptedOn === '2026-10-14');

    console.log('\n[E] PRA model adapter');
    check('E1 module absent: empty', Z.praModelResults({ praModels: null }, 'v').length === 0);
    check('E2 module throwing: empty', Z.praModelResults({ praModels: { resultsFor: () => { throw new Error('x'); } } }, 'v').length === 0);
    const pr = Z.praModelResults({ praModels: { resultsFor: v => ({ id: 'm1', label: 'Bird energy', values: { energyJ: 52000, centroid: [1, 2] } }) } }, 'v');
    check('E3 results kept as scalars only (no arrays such as geometry)', pr.length === 1 && pr[0].values.energyJ === 52000 && !('centroid' in pr[0].values));
    const penv = F.env({ praModels: { resultsFor: v => [{ id: 'm1', label: 'Bird energy', values: { energyJ: 52000 } }] } });
    const pctx = Z.gather('pra.writeup', { volumeId: 'risk-bird-nose' }, penv);
    check('E4 a PRA model result becomes a citable record and is no longer a gap', !!pctx.records['pram:m1'] && !pctx.missing.some(m => m.type === 'pram'));

    console.log('\n[F] eval harness (offline, recorded outputs)');
    const { score } = require('../eval/zonal_ai/score.js');
    const good = score(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'eval', 'zonal_ai', 'recorded', 'reference_handwritten_2026-10-14.json'), 'utf8')));
    const bad = score(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'eval', 'zonal_ai', 'recorded', 'adversarial_handwritten_2026-10-14.json'), 'utf8')));
    check('F1 reference answers: citation validity 100%, correctness 100%, hallucination 0%, gaps 100%', good.citationValidity === 1 && good.correctness === 1 && good.hallucination === 0 && good.gapDetection === 1, JSON.stringify([good.citationValidity, good.correctness, good.hallucination, good.gapDetection]));
    check('F2 adversarial answers: correctness 0%, hallucination 100%', bad.correctness === 0 && bad.hallucination === 1);
    check('F3 the scorer catches a semantic trap the validator lets through (13.8 kJ PASS)', bad.rows.find(r => r.id === 'rotor-shield').trapHits.length === 1);
    check('F4 recorded files say they are handwritten, not a model run', good.source === 'handwritten' && bad.source === 'handwritten');

    console.log('\n[G] mutations (each must turn the suite red)');
    const muts = [
        ['record id lookup always true', "var r = ctx.records[type + ':' + _s(src.id)];", "var r = ctx.records[type + ':' + _s(src.id)] || { id: '', label: '', data: {} };"],
        ['quote check skipped', 'var hit = onPage.filter(function (p) { return _norm(p.text).indexOf(quote) >= 0; })[0];', 'var hit = onPage[0];'],
        ['page check skipped', 'var onPage = inDoc.filter(function (p) { return (p.page == null ? null : p.page) === (isNaN(page) ? null : page); });', 'var onPage = inDoc;'],
        ['gap source check skipped', "if (!(SOURCE_TYPES[_s(m.type)]) || _norm(m.where).length < 4) reasons.push", "if (false) reasons.push"],
        ['fact without source allowed', "if ((kind === 'fact' || kind === 'interpretation') && !valid.length) reasons.push(kind + ' with no valid source');", ''],
        ['number check off', 'if (bad.length && valid.length) reasons.push', 'if (false) reasons.push'],
        ['whole-token matching off', "return new RegExp('(^|[^a-z0-9])' + esc + '($|[^a-z0-9])').test(hay);", 'return hay.indexOf(p) >= 0;'],
        ['retrieval tie break dropped', "|| _cmp(a.p.docName, b.p.docName) || ((a.p.page || 0) - (b.p.page || 0)) || _cmp(a.p.docId, b.p.docId) || (parseInt(a.p.pid.split('#').pop(), 10) - parseInt(b.p.pid.split('#').pop(), 10))", ''],
        ['impact geometry leaks', "worst: im.worst || null\n            };", "worst: im.worst || null, bbox: im.bbox\n            };"]
    ];
    muts.forEach(([name, from, to]) => {
        if (SRC.indexOf(from) < 0) { check('G mutation anchor present: ' + name, false); return; }
        let M; try { M = load(SRC.replace(from, to)); } catch (e) { check('G mutation loads: ' + name, false, e.message); return; }
        const save = [pass, fail]; const log = console.log; console.log = () => {};
        let res; try { res = suite(M, 'mut '); } finally { console.log = log; }
        pass = save[0]; fail = save[1];
        check('G mutation goes red: ' + name, res.some(x => !x));
    });

    console.log('\n[H] wiring');
    const iZ = IDX.indexOf('<script src="zonal_ai.js'), iC = IDX.indexOf('<script src="cad_zonal.js');
    check('H1 index.html loads zonal_ai.js once, after cad_zonal.js', iZ > iC && iC > 0 && (IDX.match(/<script src="zonal_ai\.js\?v=1\.2" defer><\/script>/g) || []).length === 1);
    check('H2 no eval / new Function in the module', !/\beval\s*\(|new Function/.test(SRC));
    const evalFiles = ['fixtures.js', 'score.js', 'run_live.js', 'make_handwritten.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'eval', 'zonal_ai', f), 'utf8'));
    check('H3 no em dash in the module, its prompts or the eval', SRC.indexOf(EM) < 0 && evalFiles.every(t => t.indexOf(EM) < 0));
    check('H4 exports', typeof Z.validate === 'function' && typeof Z.gather === 'function' && Object.keys(Z.SOURCE_MAP).length === 4);

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
