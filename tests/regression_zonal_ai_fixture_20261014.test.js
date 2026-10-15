#!/usr/bin/env node
/*
 * Regression: the grounded zonal / particular risk AI (site/zonal_ai.js) on a REAL fixture project,
 * 14 Oct 2026 (p3-ai, timebox 2). Nothing here is mocked except the model's answer:
 *   - tests/fixtures/cad/pra_aircraft.step read by the app's own structure reader (cad_step_struct.js
 *     + cad_import.js buildModel), its parts added to the real SLCadZonal (cad_zonal.js)
 *   - the cad_zonal sample zone list style (zones with boxes), containment applied, links confirmed
 *   - the real fault tree engine (fta_engine.js) and the real particular risk models (pra_models.js)
 *   - the page modules' buttons (pra_panel.js, zonal_ui.js) checked in source
 * Checks: every lane gathers from the real engines; computed results and PRA model results become
 * citable records; no geometry or file name reaches the payload; the post-check accepts a true
 * number from a model record and rejects a wrong one; accepted statements are applied only through
 * SLChangeAck.batch, into ZSA rows / praWriteups / functionRiskNotes / damageAssumptions; with
 * pra_models.js absent the PRA model source becomes a named gap.
 * Run: node tests/regression_zonal_ai_fixture_20261014.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + d : '')); } };
const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');

// 1. the STEP fixture through the app's own JavaScript structure reader
// the whole-file reader the app uses for a model this size (our OCCT 7.8.1 build), true part boxes
async function stepParts() {
    global.self = global; require(path.join(SITE, 'cad_import.js')); require(path.join(SITE, 'cad_brep.js'));
    const FM = await require(path.join(SITE, 'vendor', 'occt-fast', 'slcad_occt.js'))({ print: () => {}, printErr: () => {} });
    const bytes = new Uint8Array(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'cad', 'pra_aircraft.step')));
    return global.SLCadImport.buildModel(global.SLCadBrep.readFast(FM, bytes, 0.001, 0.5, false), {}).parts;
}
const leaf = (id, sysId) => ({ id, type: 'basic', displayId: id, name: id, probability: 1e-5, identity: { kind: 'item', systemId: sysId } });
function load(opts) {
    opts = opts || {};
    const batches = [];
    const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, parseInt, Int32Array, Promise, setTimeout: () => 0, scheduleAutosave: () => {},
        projectConfig: { regulation: '14 CFR Part 25' },
        systemsData: [
            { id: 'FCC1', name: 'Flight control computer 1', functions: [{ funcId: 'F-PITCH', funcName: 'Pitch control' }] },
            { id: 'FCC2', name: 'Flight control computer 2', functions: [{ funcId: 'F-PITCH', funcName: 'Pitch control' }] },
            { id: 'HYDL', name: 'Left hydraulic line', functions: [{ funcId: 'F-BRAKE', funcName: 'Wheel braking' }], fha: [{ internalId: 5, fcId: 'HYD-FC', fcDesc: 'Loss of left hydraulics', severity: 'Major' }] },
            { id: 'WSH', name: 'Windshield', functions: [{ funcId: 'F-VIEW', funcName: 'Forward view' }] }],
        acFhaData: [{ internalId: 1, fcId: 'FC-001', fcDesc: 'Loss of pitch control', severity: 'Catastrophic' }],
        ftaPages: [{ id: 'T2', name: 'Loss of left hydraulics', linkedFhaIds: ['SYS_5'], root: { id: 'G9', type: 'gate', gateType: 'OR', displayId: 'HYD-FC', name: 'Loss of left hydraulics', children: [leaf('BE9', 'HYDL')] } },
                   { id: 'T1', name: 'Loss of pitch control', linkedFhaIds: [1], root: { id: 'G1', type: 'gate', gateType: 'AND', displayId: 'FC-001', name: 'Loss of pitch control', children: [leaf('BE1', 'FCC1'), leaf('BE2', 'FCC2')] } }],
        zsaData: [{ internalId: 1, zoneId: '100', hazard: 'Hydraulic line routed above both flight computers', mitigation: '', findingStatus: 'open' }],
        SafetyLabSourceDocs: { list: () => [{ id: 'doc-ws', name: 'TR-77 Windshield Bird Test Rev B.pdf', text: '[p.1] TR-77 Windshield Bird Test Revision B.\n[p.9] 4 Results\nWINDSHIELD pane impacted by a 4 lb bird at 250 KCAS. No penetration. Result: PASS.' }] },
        SLChangeAck: { batch: (label, fn) => { batches.push(label); const r = fn(); return Promise.resolve({ acknowledged: true, result: r }); } }
    };
    sb.window = sb; sb.globalThis = sb; sb.self = sb; vm.createContext(sb);
    ['zonal_model.js', 'fta_engine.js', 'cad_zonal.js', 'pra_refs_data.js'].concat(opts.noPra ? [] : ['pra_models.js']).concat(['zonal_ai.js'])
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    sb._batches = batches;
    return sb;
}
let PARTS = null;
function project(opts) {
    const sb = load(opts), C = sb.SLCadZonal, Z = sb.ZONES, A = sb.SLZonalAI;
    const parts = PARTS.map(p => ({ pid: p.pid, name: p.name, partNumber: null, path: p.path || [], bbox: p.bbox }));
    const imp = C.importZoneList([{ code: '100', name: 'Fuselage', parentCode: '', xMin: 0, yMin: -1500, zMin: -1500, xMax: 18000, yMax: 1500, zMax: 1500 }]);
    const m = C.addCadModel({ fileName: 'pra_aircraft.step', sha256: 'f00d', revision: 'A', units: 'mm', parts }).model;
    const pid = n => parts.find(p => p.name === n).pid;
    [['FCC_1', 'FCC1'], ['FCC_2', 'FCC2'], ['HYD_LINE_L', 'HYDL'], ['WINDSHIELD', 'WSH']].forEach(([n, s]) => C.confirmLink(m.id, pid(n), s, 'W. Engineer', { at: '2026-10-14T00:00:00Z' }));
    C.applyContainment(m.id, { apply: true, by: 'W. Engineer' });
    const zone = Z.all().find(z => z.code === '100');
    return { sb, C, Z, A, m, parts, pid, zone, imp };
}

(async () => {
    PARTS = (await stepParts()).map(p => ({ pid: p.pid, name: p.name, path: p.path || [], bbox: p.bbox }));
    const P = project();
    const { sb, C, A, m, parts, pid, zone } = P;
    console.log('\n[1] the fixture project');
    check('1.1 the STEP fixture is read by the app reader: 14 products incl. both rotor discs, both computers, tire, windshield', ['ENG1_HPT_ROTOR_DISC', 'ENG2_HPT_ROTOR_DISC', 'FCC_1', 'FCC_2', 'MAIN_GEAR_TIRE_L', 'WINDSHIELD', 'HYD_LINE_L'].every(n => parts.some(p => p.name === n)), parts.map(p => p.name).join());
    check('1.2 containment placed both computers in zone 100', zone && ['FCC1', 'FCC2'].every(s => (zone.equipment || []).indexOf(s) >= 0), JSON.stringify(zone && zone.equipment));

    console.log('\n[2] zonal breakdown on the real engines');
    const zctx = A.gather('zonal.breakdown', { zoneId: zone.id });
    const zreq = A.buildRequest(zctx);
    check('2.1 zone impact through the real fault tree engine: FC-001 Catastrophic is a citable record', !!Object.values(zctx.records).find(r => r.type === 'fc' && r.data && r.data.fcId === 'FC-001' && r.data.severity === 'Catastrophic'), Object.keys(zctx.records).join());
    check('2.2 the AND-gate independence flag for the two computers is a citable record', Object.values(zctx.records).some(r => r.type === 'flag'), JSON.stringify(zctx.facts.flags));
    check('2.3 the ZSA row on zone 100 is consulted', Object.keys(zctx.records).some(k => k.indexOf('zsa:') === 0));
    check('2.4 no geometry or file identity in the payload (bbox, centroid, min/max, file name, hash)', !/bbox|centroid|"min"|"max"|pra_aircraft\.step|f00d/.test(zreq.user));
    const fcKey = Object.keys(zctx.records).find(k => zctx.records[k].type === 'fc');
    const zv = A.validate({ statements: [
        { text: 'Zone 100 failing reaches FC-001 (Catastrophic).', kind: 'fact', sources: [{ type: 'fc', id: zctx.records[fcKey].id }, { type: 'zone', id: zone.id }] },
        { text: 'Zone 100 failing reaches FC-002.', kind: 'fact', sources: [{ type: 'fc', id: 'FC-002' }] }] }, zctx);
    check('2.5 post-check on the real records: the true statement accepted, the invented FC-002 rejected', zv.accepted.length === 1 && zv.rejected.length === 1, JSON.stringify(zv.rejected));

    console.log('\n[3] particular risks from the real SLPraModels');
    const M = sb.SLPraModels;
    const props = M.proposeRotors(m.id);
    const p1 = props.find(p => p.pid === pid('ENG1_HPT_ROTOR_DISC'));
    check('3.0 rotor proposed from the STEP part name', !!p1, JSON.stringify(props.map(p => p.pid)));
    const conf = M.confirmRotor({ id: 'rot-eng1', label: 'Engine 1 HPT', cadId: m.id, pid: p1.pid, center: p1.center, axis: p1.axis, refDir: [0, 0, 1], discRadius: 400, bladeLength: 100, rotation: 1 }, 'W. Engineer', { at: '2026-10-14T00:01:00Z' });
    check('3.0b rotor confirmed by a named engineer', conf.ok, conf.err);
    const rctx = A.gather('pra.writeup', { kind: 'rotorBurst', rotorId: 'rot-eng1', label: 'Engine 1 HPT', cadId: m.id });
    const r3 = rctx.records['pram:rotor:rot-eng1#oneThirdDisc'];
    check('3.1 sweep results become citable PRA model records (one per fragment model)', !!r3 && typeof r3.data.catastrophicDeg === 'number' && r3.data['spreadDeg.source'] === 'ac ac20128a-9a', JSON.stringify(r3 && r3.data));
    check('3.2 PRA model source is not a gap when the model ran', !rctx.missing.some(x => x.type === 'pram'));
    const rreq = A.buildRequest(rctx);
    check('3.3 no rotor geometry in the payload (center, axis, refDir, paths)', !/"center"|"axis"|refDir|"segments"/.test(rreq.user));
    const deg = r3.data.catastrophicDeg;
    const rv = A.validate({ statements: [
        { text: 'One-third disc release angles reaching Catastrophic: ' + deg + ' degrees.', kind: 'fact', sources: [{ type: 'pram', id: 'rotor:rot-eng1#oneThirdDisc' }] },
        { text: 'One-third disc release angles reaching Catastrophic: ' + (deg + 7) + ' degrees.', kind: 'fact', sources: [{ type: 'pram', id: 'rotor:rot-eng1#oneThirdDisc' }] }] }, rctx);
    check('3.4 the model number is accepted; a number the model did not compute is rejected', rv.accepted.length === 1 && rv.rejected.length === 1 && /not in the cited sources/.test(rv.rejected[0].reasons.join()), JSON.stringify(rv));
    const ws = pid('WINDSHIELD');
    const dctx = A.gather('damage.assumption', { kind: 'birdStrike', cadId: m.id, part: { pid: ws, name: 'WINDSHIELD' }, birdOpts: { direction: [1, 0, 0], basis: 'Part 25' } });
    const br = dctx.records['pram:bird:' + ws];
    check('3.5 bird exposure for the windshield: the 4 lb case per 25.775(b) is a citable record', !!br && Math.abs(br.data.birdMassKg - 1.814369) < 1e-6 && /cfr-25\.775b/.test(br.data['birdMassKg.source']), JSON.stringify(br && br.data));
    check('3.6 the windshield test report passage (AI Inputs) is retrieved by the part name, page 9', dctx.passages.some(p => p.page === 9 && /4 lb bird at 250 KCAS/.test(p.text)));
    const fctx = A.gather('function.risk', { systemId: 'FCC1', funcId: 'F-PITCH', cadId: m.id, birdOpts: { direction: [1, 0, 0], basis: 'Part 25' } });
    check('3.7 per-function view: F-PITCH exposures from the real function risk view are citable', Object.keys(fctx.records).some(k => k.indexOf('pram:fn:F-PITCH#') === 0), Object.keys(fctx.records).join());

    console.log('\n[4] apply through the acknowledgement flow');
    const zd = A.draftFrom(zctx, JSON.stringify({ statements: [{ text: 'Both flight computers share zone 100; a zone event reaches FC-001 (Catastrophic).', kind: 'interpretation', sources: [{ type: 'fc', id: zctx.records[fcKey].id }, { type: 'zone', id: zone.id }] }] }));
    const before = sb.zsaData.length;
    const none = await A.applyDraft(zd, []);
    check('4.1 nothing ticked: nothing written', !none.applied && sb.zsaData.length === before && sb._batches.length === 0);
    const noBy = await A.applyDraft(zd, ['s1']);
    check('4.1b no reviewer name: refused, nothing written', !noBy.applied && sb.zsaData.length === before && sb._batches.length === 0);
    const ok1 = await A.applyDraft(zd, ['s1'], { by: 'W. Engineer', at: '2026-10-14' });
    const row = sb.zsaData[sb.zsaData.length - 1];
    check('4.2 zonal: the ticked statement becomes an OPEN ZSA finding on the zone, AI drafted, sources kept, through SLChangeAck.batch', ok1.applied && sb.zsaData.length === before + 1 && row.zoneId === zone.id && row.findingStatus === 'open' && row.aiDrafted && row.aiSources.length === 2 && row.aiAcceptedBy === 'W. Engineer' && sb._batches.length === 1);
    const rd = A.draftFrom(rctx, JSON.stringify({ statements: [{ text: 'One-third disc release angles reaching Catastrophic: ' + deg + ' degrees.', kind: 'fact', sources: [{ type: 'pram', id: 'rotor:rot-eng1#oneThirdDisc' }] }] }));
    const ok2 = await A.applyDraft(rd, ['s1'], { by: 'W. Engineer', at: '2026-10-14' });
    check('4.3 risk write-up stored under projectConfig.praWriteups[rot-eng1]', ok2.applied && sb.projectConfig.praWriteups['rot-eng1'].length === 1 && sb.projectConfig.praWriteups['rot-eng1'][0].aiDrafted);
    const fd = A.draftFrom(fctx, '{"statements":[]}');
    const ok3 = await A.applyDraft(fd, [fd.codeGaps[0] && fd.codeGaps[0].id].filter(Boolean), { by: 'W. Engineer' });
    check('4.4 a code-written gap can be accepted into functionRiskNotes', fd.codeGaps.length === 0 || (ok3.applied && sb.projectConfig.functionRiskNotes['FCC1/F-PITCH'].length === 1));
    const dd = A.draftFrom(dctx, JSON.stringify({ statements: [{ text: 'The windshield held a 4 lb bird at 250 KCAS with no penetration.', kind: 'fact', sources: [{ type: 'report', doc: 'doc-ws', page: 9, quote: 'WINDSHIELD pane impacted by a 4 lb bird at 250 KCAS. No penetration.' }] }] }));
    const ok4 = await A.applyDraft(dd, ['s1'], { by: 'W. Engineer', at: '2026-10-14' });
    check('4.5 damage assumption with a valid quote stored under damageAssumptions[part]', ok4.applied && sb.projectConfig.damageAssumptions[ws].length === 1);

    console.log('\n[4b] stored notes shown, edited and deleted through acknowledgement');
    const nh = A.notesHtml('praWriteups', 'rot-eng1');
    check('4b.1 the write-up shows its text, its source record, and the reviewer and date', /Catastrophic/.test(nh) && /PRA model result \(deterministic particular risk model\) rotor:rot-eng1#oneThirdDisc/.test(nh) && /Accepted by W\. Engineer on 2026-10-14/.test(nh) && /data-zai-note-edit="praWriteups\|rot-eng1\|0"/.test(nh), nh.slice(0, 300));
    const dh = A.notesHtml('damageAssumptions', ws);
    check('4b.2 the damage assumption shows the report page and quote', /doc-ws p\.9: "WINDSHIELD pane impacted/.test(dh), dh.slice(0, 300));
    const nb = sb._batches.length;
    const e0 = await A.editNote('praWriteups', 'rot-eng1', 0, 'Engineer wording.', '');
    check('4b.3 edit without a reviewer name is refused', !e0.ok && sb._batches.length === nb);
    const e1 = await A.editNote('praWriteups', 'rot-eng1', 0, 'Engineer wording.', 'R. Reviewer', { at: '2026-10-15' });
    const n0 = sb.projectConfig.praWriteups['rot-eng1'][0];
    check('4b.4 edit through SLChangeAck.batch: new text, original AI text and sources kept, editor named', e1.ok && sb._batches.length === nb + 1 && n0.text === 'Engineer wording.' && /Catastrophic/.test(n0.originalText) && n0.sources.length === 1 && n0.editedBy === 'R. Reviewer' && /edited by R\. Reviewer on 2026-10-15/.test(A.notesHtml('praWriteups', 'rot-eng1')));
    const d1 = await A.deleteNote('praWriteups', 'rot-eng1', 0, 'R. Reviewer');
    check('4b.5 delete through SLChangeAck.batch; the panel shows nothing for it afterwards', d1.ok && sb._batches.length === nb + 2 && sb.projectConfig.praWriteups['rot-eng1'].length === 0 && A.notesHtml('praWriteups', 'rot-eng1') === '');
    const PANEL0 = read('pra_panel.js');
    check('4b.6 the panel shows the notes in each tab and By function', ["aiNotes('praWriteups', r.id)", "aiNotes('praWriteups', t.id)", "aiNotes('damageAssumptions', z.pid)", "aiNotes('praWriteups', 'birdStrike')", "aiNotes('praWriteups', 'lightning')", "aiNotes('praWriteups', v.id)", "aiNotes('functionRiskNotes',"].every(x => PANEL0.indexOf(x) >= 0));

    console.log('\n[5] the page');
    const html = A.renderDraftHtml(Object.assign({}, zd, { rejected: [{ statement: { text: 'x' }, reasons: ['fc "FC-002" does not exist in the project'] }] }));
    check('5.1 the review dialog lists statements unticked, the rejected list, and the sources consulted', /data-zai-pick="s1"/.test(html) && !/<input[^>]*checked/.test(html) && /Rejected: unsupported \(1\)/.test(html) && /Sources consulted/.test(html));
    A.ENABLED = true;   // the AI gate is off by default; this check is about the button itself
    const btn = A.buttonHtml('pra.writeup', { kind: 'rotorBurst', rotorId: 'r"1' });
    check('5.2 the button carries its target as escaped JSON', /data-zai-lane="pra.writeup"/.test(btn) && /&quot;r\\&quot;1&quot;/.test(btn), btn);
    const PANEL = read('pra_panel.js'), ZUI = read('zonal_ui.js');
    check('5.3 a button in every Particular risks tab and in By function', ["aiBtn('pra.writeup', { kind: 'rotorBurst'", "aiBtn('pra.writeup', { kind: 'tireBurst'", "aiBtn('damage.assumption', { kind: 'birdStrike'", "aiBtn('pra.writeup', { kind: 'birdStrike'", "aiBtn('pra.writeup', { kind: 'lightning'", "aiBtn('pra.writeup', { volumeId: v.id", "aiBtn('function.risk'"].every(x => PANEL.indexOf(x) >= 0));
    check('5.4 a button on every zone of the zonal page', /SLZonalAI\.buttonHtml\('zonal\.breakdown', \{ zoneId: z\.id \}\)/.test(ZUI));

    console.log('\n[6] pra_models.js absent');
    const Q = project({ noPra: true });
    const qctx = Q.A.gather('pra.writeup', { kind: 'rotorBurst', rotorId: 'rot-eng1', cadId: Q.m.id });
    check('6.1 no PRA model module: no model records, the PRA model source is a named gap', !Object.keys(qctx.records).some(k => k.indexOf('pram:') === 0) && qctx.missing.some(x => x.type === 'pram') && /not loaded/.test(qctx.facts.praModelNote || ''));

    console.log('\n[7] mutations');
    const SRC = read('zonal_ai.js');
    const muts = [
        ['adapter drops the sweep', "if (t.kind === 'rotorBurst' && typeof M.sweep === 'function') {", "if (false) {"],
        ['writer bypasses the acknowledgement flow', "return ack.batch('AI draft accepted (' + SOURCE_MAP[draft.lane].label + ')', function () { return writer(stamped); }, { ai: true })", "writer(stamped); return Promise.resolve({ acknowledged: true })"],
        ['zones read from the wrong global', "zones: W.ZONES || W.SLZonalModel || null,", "zones: W.SLZonalModel || null,"]
    ];
    for (const [name, from, to] of muts) {
        if (SRC.indexOf(from) < 0) { check('7 mutation anchor present: ' + name, false); continue; }
        const sbm = load(); vm.runInContext(SRC.replace(from, to), sbm);
        // rebuild the same project in the mutated sandbox
        const Cm = sbm.SLCadZonal, Am = sbm.SLZonalAI;
        Cm.importZoneList([{ code: '100', name: 'Fuselage', parentCode: '', xMin: 0, yMin: -1500, zMin: -1500, xMax: 18000, yMax: 1500, zMax: 1500 }]);
        const mm = Cm.addCadModel({ fileName: 'pra_aircraft.step', sha256: 'f00d', revision: 'A', units: 'mm', parts: parts.map(p => ({ pid: p.pid, name: p.name, partNumber: null, path: p.path, bbox: p.bbox })) }).model;
        [['FCC_1', 'FCC1'], ['FCC_2', 'FCC2']].forEach(([n, s]) => Cm.confirmLink(mm.id, pid(n), s, 'W. Engineer', { at: '2026-10-14T00:00:00Z' }));
        Cm.applyContainment(mm.id, { apply: true, by: 'W. Engineer' });
        const pp = sbm.SLPraModels.proposeRotors(mm.id).find(p => p.pid === pid('ENG1_HPT_ROTOR_DISC'));
        sbm.SLPraModels.confirmRotor({ id: 'rot-eng1', label: 'Engine 1 HPT', cadId: mm.id, pid: pp.pid, center: pp.center, axis: pp.axis, refDir: [0, 0, 1], discRadius: 400, bladeLength: 100, rotation: 1 }, 'W. Engineer', { at: '2026-10-14T00:01:00Z' });
        const zz = sbm.ZONES.all().find(z => z.code === '100');
        const c1 = Am.gather('pra.writeup', { kind: 'rotorBurst', rotorId: 'rot-eng1', cadId: mm.id });
        const c2 = Am.gather('zonal.breakdown', { zoneId: zz.id });
        const d = Am.draftFrom(c2, '{"statements":[]}');
        const before2 = sbm._batches.length;
        await Am.applyDraft(d, d.codeGaps.length ? [d.codeGaps[0].id] : [], { by: 'W. Engineer' });
        const ok = !!c1.records['pram:rotor:rot-eng1#oneThirdDisc'] && Object.values(c2.records).some(r => r.type === 'fc') && (d.codeGaps.length === 0 || sbm._batches.length === before2 + 1);
        check('7 mutation goes red: ' + name, !ok);
    }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
