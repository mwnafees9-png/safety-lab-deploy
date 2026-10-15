#!/usr/bin/env node
/*
 * Regression (15 Oct 2026): the live engine hands the zonal AI parts as { pid, how } (riskImpact) and AI buttons
 * used to pass { pid, name } only, so the AI never saw part numbers. gather() now fills name and part number from
 * the CAD model's part list. Checks: the 7 eval requests built through a live-like env (riskImpact parts are
 * { pid, how }, targets without partNumber, names and numbers only in partsOf) are byte-identical to the
 * fixture-built ones; mutation: without the fill, part numbers are missing; pra_panel targets carry partNumber,
 * and the lightning and fire/leak/ice reports draw a damage assumption button per part behind ENABLED.
 * Run: node tests/regression_zonal_ai_partmeta_20261015.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + d : '')); } };
const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, 'site');
const Z = require(path.join(SITE, 'zonal_ai.js'));
const F = require(path.join(ROOT, 'eval', 'zonal_ai', 'fixtures.js'));

const ALL = { 'p-nf410': ['Nose fairing panel', 'PN-NF-410'], 'p-nf411': ['Nose fairing panel RH', 'PN-NF-411'], 'p-nf412': ['Nose fairing panel LH', 'PN-NF-412'],
              'p-rs220': ['APU fragment shield', 'PN-RS-220'], 'p-wt300': ['Wing tip fairing', 'PN-WT-300'], 'p-hydline': ['Brake hydraulic line', 'PN-HL-77'] };
function liveEnv() {
    const e = F.env(), fx = e.cad;
    const strip = id => { const r = fx.riskImpact(id); return Object.assign({}, r, { parts: r.parts.map(p => ({ pid: p.pid, how: 'centroid' })) }); };
    e.cad = { riskVolume: fx.riskVolume, riskImpact: strip, zoneImpact: fx.zoneImpact, independenceFlags: fx.independenceFlags,
              latestCadId: () => 'cad-1', model: id => (id === 'cad-1' ? { id } : null),
              partsOf: () => Object.keys(ALL).map(pid => ({ pid, name: ALL[pid][0], partNumber: ALL[pid][1] })) };
    return e;
}
const liveTarget = t => (t.part ? Object.assign({}, t, { part: { pid: t.part.pid, name: t.part.name } }) : t);
const build = (c, env, t) => JSON.stringify(Z.buildRequest(Z.gather(c.lane, t, env)));

F.CASES.forEach(c => {
    const a = build(c, F.env(), c.target), b = build(c, liveEnv(), liveTarget(c.target));
    let diff = ''; if (a !== b) { let i = 0; while (a[i] === b[i]) i++; diff = 'first difference at ' + i + ': fixture "' + a.slice(i - 40, i + 60) + '" live "' + b.slice(i - 40, i + 60) + '"'; }
    check('case ' + c.id + ': request built through the live-like path is byte-identical to the fixture-built one', a === b, diff);
});
// names and part numbers exactly as the fixture has them
{
    const req = Z.buildRequest(Z.gather('damage.assumption', liveTarget(F.CASES[1].target), liveEnv())).user;
    check('live-like bird-411: both parts in the volume carry name and part number', /Nose fairing panel RH/.test(req) && /PN-NF-411/.test(req) && /PN-NF-410/.test(req));
    const g = Z.gather('pra.writeup', { kind: 'rotorBurst', rotorId: 'r1', label: 'APU rotor', part: { pid: 'p-rs220' } }, liveEnv());
    check('a write-up target part (rotor / tire) is recorded with its name and part number from the model', JSON.stringify(g).indexOf('PN-RS-220') >= 0 && JSON.stringify(g).indexOf('APU fragment shield') >= 0);
}
// mutation: an env whose model has no part list leaves the live-like request without part numbers (proves the fill is what supplies them)
{
    const e = liveEnv(); e.cad.partsOf = () => [];
    const pi = Z.gather('pra.writeup', F.CASES[3].target, e).facts.partsInside, pl = Z.gather('pra.writeup', F.CASES[3].target, liveEnv()).facts.partsInside;
    check('mutation: without the model part list the live-like rotor parts inside have no name or part number; with it they match the fixture', JSON.stringify(pi) === JSON.stringify([{ pid: 'p-rs220', name: '', partNumber: null }]) && JSON.stringify(pl) === JSON.stringify([{ pid: 'p-rs220', name: 'APU fragment shield', partNumber: 'PN-RS-220' }]), JSON.stringify(pi) + ' / ' + JSON.stringify(pl));
}
// pra_panel.js in source
{
    const P = fs.readFileSync(path.join(SITE, 'pra_panel.js'), 'utf8');
    check('bird zone damage assumption target is aiPart (pid, name, partNumber)', /aiBtn\('damage\.assumption', \{ kind: 'birdStrike', cadId: cadId\(\), part: aiPart\(z\.pid, z\.name\) \}\)/.test(P));
    check('rotor and tire write-up targets carry the part', /rotorId: r\.id, label: r\.label, cadId: cadId\(\), part: r\.pid != null \? aiPart\(r\.pid\)/.test(P) && /tireId: t\.id, label: t\.label, cadId: cadId\(\), part: t\.pid != null \? aiPart\(t\.pid\)/.test(P));
    check('lightning confirmed zones: a damage assumption button per part', /aiPartList\('damage\.assumption', saved\.parts\.map/.test(P));
    check('fire, leak, ice regions: a damage assumption button per part inside', /aiPartList\('damage\.assumption', \(function \(\) \{ try \{ return c\.partsInVolume\(v\.id/.test(P));
    check('per-part buttons are drawn only when SLZonalAI.ENABLED', /function aiPartList\(lane, pids, mk\) \{ if \(!aiOn\(\)/.test(P) && /function aiOn\(\) \{ return !!\(window\.SLZonalAI && window\.SLZonalAI\.ENABLED\); \}/.test(P));
    check('aiPart reads name and part number from the CAD model part list', /function aiPart\(pid, name\) \{ var q = null; try \{ q = C\(\)\.partsOf\(C\(\)\.model\(cadId\(\)\)\)/.test(P));
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
