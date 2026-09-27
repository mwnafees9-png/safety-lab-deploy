#!/usr/bin/env node
/*
 * Regression — per-item zonal threats (27 Sep 2026, OPEN_ITEMS Q10; ARP4761A App K).
 *
 *   G1  the record: emits per threat per state, susceptible per threat, note; unknown
 *       threats and states refused; a record normalizes to the five threats; has()
 *   G2  geometry on the real zonal_model.js: adjacent = parent, children, siblings
 *       (roots are siblings of roots); a substantiated barrier blocks, an
 *       unsubstantiated one does not
 *   G3  findings: co-location in one zone (normal = permanent exposure, abnormal /
 *       failed = failure sequence), the emitter is never its own victim; carry-over
 *       from an adjacent zone with no substantiated barrier, none with one, none from
 *       a non-adjacent zone; a susceptible item with no emitter anywhere is quiet;
 *       unrecorded placed items are listed; INV-65 counts placed items and names both
 *   G4  the page section: one editor per placed item with the fifteen emit boxes and
 *       five susceptible boxes, "no record yet" marker, findings list with the two
 *       kinds, the section appended to the page wrapper and replaced on re-render;
 *       the zonal page renderer is wrapped once
 *   G5  wiring: loaded right after pra_framing.js, no eval, module exports
 * Run: node tests/regression_zonal_threats.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const SRC = read('zonal_threats.js'), ZM = read('zonal_model.js'), IDX = read('index.html');

function load(model) {
    const sb = Object.assign({ console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, setTimeout: () => 0, scheduleAutosave: () => { sb._saved = (sb._saved || 0) + 1; } }, model);
    sb.window = sb; sb.globalThis = sb; sb.self = sb;
    vm.createContext(sb);
    vm.runInContext(ZM, sb, { filename: 'zonal_model.js' });
    vm.runInContext(SRC, sb, { filename: 'zonal_threats.js' });
    return sb;
}
// A small aircraft: 100 fuselage (110 avionics bay, 120 hyd bay), 500 wing; hyd pump P in 120, computer C in 110, battery B in 500, sensor S in 110.
function world() {
    const sb = load({ projectConfig: {}, systemsData: [{ id: 'P', name: 'Hydraulic pump' }, { id: 'C', name: 'Flight computer' }, { id: 'B', name: 'Battery' }, { id: 'S', name: 'Air data sensor' }] });
    const Z = sb.ZONES;
    const z100 = Z.addZone({ code: '100', name: 'Fuselage' }).zone, z110 = Z.addZone({ code: '110', name: 'Avionics bay', parentId: z100.id }).zone, z120 = Z.addZone({ code: '120', name: 'Hydraulic bay', parentId: z100.id }).zone, z500 = Z.addZone({ code: '500', name: 'Wing' }).zone;
    Z.assign(z120.id, 'P'); Z.assign(z110.id, 'C'); Z.assign(z110.id, 'S'); Z.assign(z500.id, 'B');
    return { sb, T: sb.SLZonalThreats, Z, z100, z110, z120, z500 };
}

// ---- G1 record ---------------------------------------------------------------------
{
    const { sb, T } = world();
    check('G1: an empty record normalizes to the five threats with nothing set', JSON.stringify(T.record('P')) === JSON.stringify({ emits: { heat: [], fluid: [], debris: [], emi: [], vibration: [] }, susceptible: [], note: '' }) && !T.has('P'));
    check('G1: setEmit adds and removes a state, keeps state order, autosaves', T.setEmit('P', 'fluid', 'failed', true) && T.setEmit('P', 'fluid', 'normal', true) && T.record('P').emits.fluid.join(',') === 'normal,failed' && T.setEmit('P', 'fluid', 'normal', false) && T.record('P').emits.fluid.join(',') === 'failed' && sb._saved === 3 && T.has('P'));
    check('G1: setSusceptible adds and removes, in threat order', T.setSusceptible('C', 'emi', true) && T.setSusceptible('C', 'fluid', true) && T.record('C').susceptible.join(',') === 'fluid,emi' && T.setSusceptible('C', 'emi', false) && T.record('C').susceptible.join(',') === 'fluid');
    check('G1: unknown threats, states and items are refused', !T.setEmit('P', 'noise', 'normal', true) && !T.setEmit('P', 'heat', 'sometimes', true) && !T.setSusceptible('P', 'noise', true) && !T.setEmit('', 'heat', 'normal', true));
    check('G1: the note is kept; junk in the store is dropped on read', T.setNote('P', 'drip shield fitted') && T.record('P').note === 'drip shield fitted' && (sb.projectConfig.zoneThreats.P.emits.heat = ['normal', 'bogus'], sb.projectConfig.zoneThreats.P.susceptible = ['heat', 'noise'], T.record('P').emits.heat.join(',') === 'normal' && T.record('P').susceptible.join(',') === 'heat'));
}

// ---- G2 geometry ---------------------------------------------------------------------
{
    const { T, Z, z100, z110, z120, z500 } = world();
    const ids = zid => T.adjacent(zid).map(z => z.code).sort().join(',');
    check('G2: adjacent = parent, children and siblings', ids(z110.id) === '100,120' && ids(z100.id) === '110,120,500' && ids(z500.id) === '100');
    check('G2: an unknown zone has no neighbors', T.adjacent('nope').length === 0);
    Z.addBarrier(z110.id, z120.id, 'firewall', false);
    check('G2: an unsubstantiated barrier does not block', !T.blocked(z110.id, z120.id));
    Z.setBarrierSubstantiated(Z.barriers()[0].id, true);
    check('G2: a substantiated barrier blocks, both ways', T.blocked(z110.id, z120.id) && T.blocked(z120.id, z110.id) && !T.blocked(z110.id, z100.id));
}

// ---- G3 findings ----------------------------------------------------------------------
{
    const w = world(); const { T, Z, z110, z120, z500 } = w;
    const kinds = () => T.findings().map(f => f.kind + ':' + f.threat + ':' + f.emitter + '>' + f.victim + ':' + f.sev).sort().join(' ');
    check('G3: nothing recorded, nothing found; every placed item is unrecorded', T.findings().length === 0 && T.unrecorded().length === 4);
    // co-location: S susceptible to EMI, C emits EMI in normal operation, same zone
    T.setSusceptible('S', 'emi', true); T.setEmit('C', 'emi', 'normal', true);
    check('G3: co-location, emitted in normal operation, is a permanent exposure (gap)', kinds() === 'co-located:emi:C>S:gap' && /Avionics bay: Air data sensor is susceptible to emi and shares the zone with Flight computer, which emits it in normal operation/.test(T.findings()[0].text));
    T.setEmit('C', 'emi', 'normal', false); T.setEmit('C', 'emi', 'failed', true);
    check('G3: emitted only when it fails is a failure sequence to assess (warn)', kinds() === 'co-located:emi:C>S:warn' && /when it fails/.test(T.findings()[0].text));
    // the emitter is never its own victim
    T.setSusceptible('C', 'emi', true);
    check('G3: an item that emits and is susceptible to the same threat is not its own finding', kinds() === 'co-located:emi:C>S:warn');
    T.setSusceptible('C', 'emi', false); T.setSusceptible('S', 'emi', false); T.setEmit('C', 'emi', 'failed', false);
    // carry-over: P emits fluid when failed in 120; C susceptible to fluid in 110 (sibling), no barrier
    T.setEmit('P', 'fluid', 'failed', true); T.setSusceptible('C', 'fluid', true);
    check('G3: carry-over from an adjacent zone with no substantiated barrier', kinds() === 'carry-over:fluid:P>C:warn' && /adjacent zone 120 Hydraulic bay emits it when it fails and no substantiated barrier/.test(T.findings()[0].text));
    const bar = Z.addBarrier(z110.id, z120.id, 'drip shield', false).barrier;
    check('G3: an unsubstantiated barrier changes nothing', kinds() === 'carry-over:fluid:P>C:warn');
    Z.setBarrierSubstantiated(bar.id, true);
    check('G3: a substantiated barrier stops the carry-over', T.findings().length === 0);
    Z.removeBarrier(bar.id);
    // non-adjacent: B in the wing emits heat in normal operation; C in 110 susceptible to heat; 500 is not adjacent to 110
    T.setEmit('B', 'heat', 'normal', true); T.setSusceptible('C', 'heat', true);
    check('G3: a non-adjacent zone does not carry over', kinds() === 'carry-over:fluid:P>C:warn');
    // move the battery next door and it does
    Z.assign(z120.id, 'B');
    check('G3: moving the emitter into an adjacent zone makes it carry over', kinds() === 'carry-over:fluid:P>C:warn carry-over:heat:B>C:gap');
    // a susceptible item with no emitter anywhere is quiet
    T.setSusceptible('S', 'debris', true);
    check('G3: susceptibility with no emitter anywhere is quiet', kinds() === 'carry-over:fluid:P>C:warn carry-over:heat:B>C:gap');
    const inv = T.INV.run();
    check('G3: INV-65 counts placed items and names findings and unrecorded items', T.INV.id === 'INV-65' && T.INV.sev === 'advisory' && inv.checked === 4 && inv.failCount === 2 && inv.fails.some(t => /Hydraulic pump in adjacent zone/.test(t)) && inv.fails.some(t => /Battery in adjacent zone/.test(t)) && T.unrecorded().length === 0, JSON.stringify(inv));
    check('G3: zoneProfile lists emitters with states and susceptible items', T.zoneProfile(z120.id).emitted.fluid[0].item === 'P' && T.zoneProfile(z120.id).emitted.heat[0].states.join() === 'normal' && T.zoneProfile(z110.id).susceptible.fluid.join() === 'C' && T.zoneProfile('nope') === null);
}

// ---- G4 the page section ----------------------------------------------------------------
{
    const w = world(); const { sb, T } = w;
    T.setEmit('P', 'fluid', 'failed', true); T.setSusceptible('C', 'fluid', true);
    const ed = T.itemEditorHtml('P');
    check('G4: an item editor has fifteen emit boxes, five susceptible boxes, the note, and the set ones checked', (ed.match(/setEmit\('P'/g) || []).length === 15 && (ed.match(/setSusceptible\('P'/g) || []).length === 5 && /setNote\('P'/.test(ed) && /'fluid','failed',this\.checked\)[^>]*>/.test(ed) && (ed.match(/ checked/g) || []).length === 1 && !/no record yet/.test(ed));
    check('G4: an unrecorded item is marked', /no record yet/.test(T.itemEditorHtml('S')));
    check('G4: INV-65 lists the unrecorded placed items beside the findings', T.INV.run().failCount === 3 && T.INV.run().fails.filter(t => /no threat record/.test(t)).length === 2);
    const sec = T.sectionHtml();
    check('G4: the section lists every zone with equipment, the findings with their kind, and the unrecorded items', /110 Avionics bay/.test(sec) && /120 Hydraulic bay/.test(sec) && /500 Wing/.test(sec) && /Carries over<\/b>/.test(sec) && /Findings: 1 \(0 permanent exposures, 1 failure sequence to assess\)/.test(sec) && /2 placed items with no threat record yet: Battery, Air data sensor|2 placed items with no threat record yet: Air data sensor, Battery/.test(sec));
    // fake page
    const els = {}; let wrapperHtml = '';
    const wrapper = { insertAdjacentHTML: (_, h) => { wrapperHtml += h; } };
    const host = { id: 'view-zonal', firstElementChild: wrapper };
    els['view-zonal'] = host;
    sb.document = { getElementById: id => els[id] || null };
    check('G4: the section is appended to the page wrapper', T.renderSection() === true && /id="zt-section"/.test(wrapperHtml));
    let replaced = '';
    els['zt-section'] = { set outerHTML(h) { replaced = h; } };
    check('G4: on re-render the existing section is replaced in place', T.renderSection() === true && /id="zt-section"/.test(replaced) && wrapperHtml.indexOf('zt-section') === wrapperHtml.lastIndexOf('zt-section'));
    // 1.1: the page observer. A re-render that wipes the section brings it back on the next tick.
    let cb = null; sb.MutationObserver = function (f) { cb = f; this.observe = () => {}; };
    sb.setTimeout = f => { f(); return 0; };
    check('G4: the page is watched once', T._observe() === true && T._observe() === false);
    delete els['zt-section']; wrapperHtml = '';
    cb([]);
    check('G4: a re-render that dropped the section gets it back', /id="zt-section"/.test(wrapperHtml));
    els['zt-section'] = { set outerHTML(h) { replaced = h; } }; wrapperHtml = '';
    cb([]);
    check('G4: a render that kept the section is left alone', wrapperHtml === '');
    let n = 0; sb._renderZonalPage = () => { n++; };
    check('G4: the zonal page renderer is wrapped once and still runs', T._wrapRender() === true && T._wrapRender() === false && (sb._renderZonalPage(), n === 1));
}

// ---- G5 wiring ---------------------------------------------------------------------------
{
    check('G5: zonal_threats.js is loaded right after pra_framing.js', /pra_framing\.js\?v=[\d.]+" defer><\/script>\s*(<!--[^>]*-->\s*)?<script src="zonal_threats\.js\?v=[\d.]+" defer><\/script>/.test(IDX));
    check('G5: no eval or Function constructor', !/\beval\s*\(/.test(SRC) && !/new Function\s*\(/.test(SRC));
    check('G5: module exports the API', /module\.exports = api/.test(SRC) && /root\.SLZonalThreats = api/.test(SRC));
    check('G5: the five threats and three states are the vocabulary', load({ projectConfig: {}, systemsData: [] }).SLZonalThreats.THREATS.map(t => t.id).join() === 'heat,fluid,debris,emi,vibration' && load({ projectConfig: {}, systemsData: [] }).SLZonalThreats.STATES.join() === 'normal,abnormal,failed');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
