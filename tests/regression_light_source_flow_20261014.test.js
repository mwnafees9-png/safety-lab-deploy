#!/usr/bin/env node
/* Regression: lightning and fire / fluid / ice guided flows (site/pra_models.js), 14 Oct 2026. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const SRC = read('pra_models.js');
const box = (x0, x1, y0, y1, z0, z1) => ({ min: [x0, y0, z0], max: [x1, y1, z1] });
const leaf = (id, s) => ({ id, type: 'basic', displayId: id, name: id, probability: 1e-5, identity: { kind: 'item', systemId: s } });
function scenario(src) {
    const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, Int32Array, setTimeout: () => 0, scheduleAutosave: () => {},
        projectConfig: {}, systemsData: [{ id: 'FCC1', name: 'FCC 1' }, { id: 'FCC2', name: 'FCC 2' }], acFhaData: [{ internalId: 1, fcId: 'FC-001', fcDesc: 'Loss of pitch control', severity: 'Catastrophic' }],
        ftaPages: [{ id: 'T1', name: 'x', linkedFhaIds: [1], root: { id: 'G1', type: 'gate', gateType: 'AND', displayId: 'FC-001', name: 'x', children: [leaf('B1', 'FCC1'), leaf('B2', 'FCC2')] } }] };
    sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
    ['zonal_model.js', 'fta_engine.js', 'cad_zonal.js', 'pra_refs_data.js'].forEach(f => vm.runInContext(read(f), sb));
    vm.runInContext(src || SRC, sb);
    const C = sb.SLCadZonal, M = sb.SLPraModels, R = {};
    const m = C.addCadModel({ fileName: 'l.step', sha256: 'l', revision: 'A', units: 'mm', parts: [
        { pid: 'nose', name: 'Nose radome', path: ['A'], bbox: box(0, 1500, -1000, 1000, -1000, 1000) },
        { pid: 'fus', name: 'Fuselage', path: ['A'], bbox: box(1500, 18000, -1000, 1000, -1000, 1000) },
        { pid: 'fin', name: 'Fin', path: ['A'], bbox: box(17000, 18500, -100, 100, 1000, 5000) },
        { pid: 'fcc1', name: 'FCC-1', path: ['A'], bbox: box(9700, 10000, -600, -300, -100, 100) },
        { pid: 'fcc2', name: 'FCC-2', path: ['A'], bbox: box(9700, 10000, 300, 600, -100, 100) },
        { pid: 'pump', name: 'Fuel pump', path: ['A'], bbox: box(9500, 9600, -100, 100, -100, 100) },
        { pid: 'nac', name: 'ENG_NACELLE_L', path: ['A'], bbox: box(9000, 10500, -4300, -3700, -300, 300) },
        { pid: 'tc', name: 'Tail cone', path: ['A'], bbox: box(18000, 19500, -300, 300, -300, 300) }] }).model;
    C.confirmLink(m.id, 'fcc1', 'FCC1', 'W'); C.confirmLink(m.id, 'fcc2', 'FCC2', 'W');
    R.s1 = M.lightningStep1(m.id, { forward: [-1, 0, 0] });
    R.locked = M.lightningReport(m.id, '1A');
    M.saveLightningFlow(m.id, { band: 500, forward: [-1, 0, 0] }, 'W. Engineer');
    M.confirmField('lightning', m.id, 'extremities', 'W. Engineer'); M.confirmField('lightning', m.id, 'band', 'W. Engineer');
    R.noZones = M.lightningReport(m.id, '1A');
    const pz = M.proposeLightningZones(m.id, { forward: [-1, 0, 0], band: 500 });
    M.confirmLightningZones(m.id, pz.parts, 'W. Engineer', { at: '2026-10-14T00:00:00Z' });
    R.zoneOf = Object.fromEntries(pz.parts.map(p => [p.pid, p.zone]));
    R.rep = M.lightningReport(m.id, R.zoneOf.fcc1);
    M.setLightningWaveform(m.id, R.zoneOf.fcc1, 'Test: 200 kA component A (engineer test value)', 'W. Engineer');
    R.rep2 = M.lightningReport(m.id, R.zoneOf.fcc1);
    R.srcBad = M.saveSource({ cadId: m.id, type: 'fire', pids: ['pump'] }, 'W. Engineer');
    R.src = M.saveSource({ id: 's1', cadId: m.id, type: 'flammableFluid', pids: ['pump'], marginMm: 500 }, 'W. Engineer', { at: '2026-10-14T00:00:00Z' });
    R.srcRep = M.sourceReport('s1');
    R.why = M.whyNotReached(['FCC1']);
    R.rep1B = null;
    R.ext = M.externalParts(m.id);
    R.skinP = M.proposeSkinZones(m.id, { forward: [-1, 0, 0], band: 500 });
    R.skinNo = M.confirmSkinZones(m.id, R.skinP.parts, '');
    M.confirmSkinZones(m.id, R.skinP.parts, 'W. Engineer', { at: '2026-10-14T00:00:00Z', portions: R.skinP.portions });
    R.z3a = M.skinZoneReport(m.id, R.skinP.parts.find(p => p.pid === 'fus').zone);
    M.setSkinDepth(m.id, 1500, 'W. Engineer');
    R.fusZone = R.skinP.parts.find(p => p.pid === 'fus').zone;
    R.z3 = M.skinZoneReport(m.id, R.fusZone);
    R.rep1A = M.skinZoneReport(m.id, '1A');
    R.editNoWhy = M.editSkinZone(m.id, 'fin', '1A', '', 'W. Engineer');
    R.edit = M.editSkinZone(m.id, 'fin', '1A', 'Fin tip extends forward of the nose band in this layout.', 'W. Engineer', { at: '2026-10-14T00:01:00Z' });
    return { M, R };
}
const { R } = scenario();
function M_rep_portion(R) { const r = R.rep1A; return r && r.directPortions.some(q => q.pid === 'nose' && q.portion === 'forward 500 mm'); }
check('lightning Step 1: extremities proposed from the CAD (nose forward, fin up)', R.s1.ok && R.s1.extremities.some(e => e.pid === 'nose') && R.s1.extremities.some(e => e.pid === 'fin'), JSON.stringify(R.s1.extremities));
check('lightning: reports refuse before Step 1 and before the zone assignment is confirmed', !R.locked.ok && !R.noZones.ok);
check('lightning report: parts and equipment in the zone, both computers, Catastrophic, shared exposure', R.rep.ok && R.rep.parts.includes('fcc1') && R.rep.parts.includes('fcc2') && R.rep.worst === 'Catastrophic' && R.rep.shared.length === 1, JSON.stringify(R.rep).slice(0, 300));
check('lightning report: zone definition unverified (ARP5414 not in the knowledge base); waveform missing until entered, then labeled engineer input; 25.581 quoted', R.rep.definition.source === 'unverified' && R.rep.waveform.source === 'missing' && R.rep2.waveform.source === 'engineer' && /not from a cited standard/.test(R.rep2.waveform.note) && R.rep.refs.some(r => r.section === '25.581'));
check('source: needs type, parts and margin; the margin is labeled engineer input', !R.srcBad.ok && R.src.ok && R.srcRep.margin.source === 'engineer');
check('source report: parts inside the region around the fuel pump (both computers within 500 mm), Catastrophic; no rule cited', R.srcRep.partsInside.includes('fcc1') && R.srcRep.partsInside.includes('fcc2') && R.srcRep.worst === 'Catastrophic' && R.srcRep.refs.length === 0 && /No rule text/.test(R.srcRep.ruleNote), JSON.stringify(R.srcRep.partsInside));
check('none reached is explained: FC-001 needs 1 more failure besides FCC 1, naming FCC 2', R.why.length === 1 && /^FC-001 .*needs 1 more failure besides FCC 1: also FCC 2/.test(R.why[0]), JSON.stringify(R.why));
check('skin: external parts only (nose, fuselage, fin), the computers and pump inside are not skin', ['nose', 'fus', 'fin'].every(p => R.ext.includes(p)) && !R.ext.includes('fcc1') && !R.ext.includes('pump'), JSON.stringify(R.ext));
check('skin zones proposed by the stated rule, unverified until confirmed; confirmation needs a name', R.skinP.parts.every(p => p.status === 'proposed') && /Geometry rule \(stated, not ARP5414\)/.test(R.skinP.rule) && !R.skinNo.ok);
check('skin report: direct = skin parts in the zone; no indirect list until the depth is entered (labeled missing)', R.z3a.direct.includes('fus') && R.z3a.indirect.length === 0 && R.z3a.depthMm.source === 'missing');
check('skin report: with a depth, internal equipment behind the skin listed under indirect effects, Catastrophic, shared exposure, wiring note, definition unverified, 25.581', R.z3.indirect.some(x => x.pid === 'fcc1') && R.z3.indirect.some(x => x.pid === 'fcc2') && R.z3.worst === 'Catastrophic' && R.z3.shared.length === 1 && /Wiring is not in the CAD model/.test(R.z3.wiringNote) && R.z3.definition.source === 'unverified' && R.z3.refs.some(r => r.section === '25.581'), JSON.stringify(R.z3.indirect));
check('nacelle front proposed 1A and tailcone 1B, each with its reason', R.skinP.parts.find(p => p.pid === 'nac').zone === '1A' && /nacelle/.test(R.skinP.parts.find(p => p.pid === 'nac').why) && R.skinP.parts.find(p => p.pid === 'tc').zone === '1B', JSON.stringify(R.skinP.parts.filter(p => p.pid === 'nac' || p.pid === 'tc')));
check('a long part is split: the nose radome forward 500 mm is 1A and its remainder 2A (swept aft); the tail cone at the aft extreme is 1B whole; the fuselage is not 1B as a whole', R.skinP.portions.some(q => q.pid === 'nose' && q.zone === '1A' && q.portion === 'forward 500 mm' && q.box.max[0] - q.box.min[0] === 500) && R.skinP.portions.some(q => q.pid === 'nose' && q.zone === '2A' && q.portion === 'remainder') && R.skinP.portions.some(q => q.pid === 'tc' && q.zone === '1B') && !R.skinP.portions.some(q => q.pid === 'fus' && q.zone === '1B' && q.portion === 'whole part'), JSON.stringify(R.skinP.portions.filter(q => q.pid === 'fus' || q.pid === 'nose').map(q => [q.pid, q.zone, q.portion])));
check('the 1A report lists the portion ("Nose radome (forward 500 mm)" style)', M_rep_portion(R));
check('skin zone edit needs a reason and is recorded', !R.editNoWhy.ok && R.edit.ok);
const mut = (name, from, to, test) => { if (SRC.indexOf(from) < 0) { check('anchor present: ' + name, false); return; } let red = false; try { red = !test(scenario(SRC.replace(from, to)).R); } catch (e) { red = true; } check('mutation goes red: ' + name, red); };
mut('internal parts counted as skin', 'if (skinSet[pid]) return; if (!linked[pid] && skinProd[_prodKey(p)]) return;', '', r => !r.z3.indirect.some(x => x.pid === 'fus'));
mut('margin ignored', 'B.min[j] -= r.marginMm; B.max[j] += r.marginMm;', '', r => r.srcRep.partsInside.includes('fcc1'));
check('no em dash', SRC.indexOf(String.fromCharCode(0x2014)) < 0);
// skin by rays against triangles: a closed fuselage hides the computers; an open one (side walls only) does not, and is flagged
{
    const tri = b => { const c = [0, 1, 2, 3, 4, 5, 6, 7].map(k => [k & 1 ? b.max[0] : b.min[0], k & 2 ? b.max[1] : b.min[1], k & 4 ? b.max[2] : b.min[2]]); const F = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]], out = []; F.forEach(f => { [[f[0], f[1], f[2]], [f[0], f[2], f[3]]].forEach(t => t.forEach(i => out.push(...c[i]))); }); return out; };
    const run = open => { const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, Int32Array, setTimeout: () => 0, scheduleAutosave: () => {}, projectConfig: {}, systemsData: [{ id: 'FCC1', name: 'FCC 1' }], acFhaData: [], ftaPages: [] };
        sb.window = sb; sb.globalThis = sb; vm.createContext(sb); ['zonal_model.js', 'fta_engine.js', 'cad_zonal.js', 'pra_refs_data.js', 'pra_models.js'].forEach(f => vm.runInContext(read(f), sb));
        const C = sb.SLCadZonal, M = sb.SLPraModels;
        const parts = open ? [{ pid: 'wl', name: 'Side wall L', bbox: box(0, 6000, -1000, -900, -1000, 1000) }, { pid: 'wr', name: 'Side wall R', bbox: box(0, 6000, 900, 1000, -1000, 1000) }] : [{ pid: 'fus', name: 'Fuselage', bbox: box(0, 6000, -1000, 1000, -1000, 1000) }];
        parts.push({ pid: 'fcc', name: 'FCC', bbox: box(2500, 3000, -200, 200, -100, 100) });
        const m = C.addCadModel({ fileName: 'r.step', sha256: 'r' + open, revision: 'A', units: 'mm', parts: parts.map(p => Object.assign({ path: ['A'] }, p)) }).model; C.confirmLink(m.id, 'fcc', 'FCC1', 'W');
        const T = {}; parts.forEach(p => { T[p.pid] = tri(p.bbox); }); M.setTriangleSource(pid => T[pid]);
        const pr = M.proposeSkin(m.id); const no = M.confirmSkinParts(m.id, pr.parts, pr.method, ''); M.confirmSkinParts(m.id, pr.parts, pr.method, 'W. Engineer');
        const e1 = M.editSkinParts(m.id, 'fcc', false, '', 'W. Engineer'), e2 = open ? M.editSkinParts(m.id, 'fcc', false, 'Open fixture: the computer is internal in the real aircraft.', 'W. Engineer') : null;
        return { pr, no, e1, e2, after: M.skinParts(m.id) }; };
    const closed = run(false), open = run(true);
    check('skin by rays: closed fuselage is skin, the computer inside is not, method stated (14 directions)', closed.pr.parts.join() === 'fus' && /rays against the part triangles: 14 directions/.test(closed.pr.method) && closed.pr.warning === null, JSON.stringify(closed.pr));
    check('open fuselage: the computer is hit from above, so linked equipment is proposed as skin and flagged', open.pr.parts.includes('fcc') && /linked equipment proposed as skin: check the model is closed/.test(open.pr.warning), JSON.stringify(open.pr));
    check('skin list: confirmation needs a name; an edit needs a reason and is recorded', !open.no.ok && !open.e1.ok && open.e2.ok && !open.after.pids.includes('fcc') && open.after.edits.length === 1);
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
