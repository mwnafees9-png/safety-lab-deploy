#!/usr/bin/env node
/*
 * Regression: one zone identity, zones-3 (19 Oct 2026, build 7 step 1).
 *
 * THE REQUIREMENT (Waqas, 19 Oct 2026, "go ahead and do it"): before the ZSA builds itself, fix the base. Safety Lab
 * named a zone two ways: rows typed a zone CODE (zsaData.zoneId, praData.affectedZones, routingData.routesThroughZones,
 * itemsData.zoneId) while the zone model, CAD containment and the independence checks used model ids, the PRA canvas
 * kept both (praData.zones beside affectedZones) and the ZSA walkthrough wrote a model id into zoneId. Now the zone
 * model is the one register and the zone code is the identity everywhere; every project upgrades when it loads,
 * losing nothing, and it is checked on every demo project Safety Lab ships.
 *
 *   A  the register: resolve by code (any case and spacing) or id, one code per zone, recode everywhere
 *   B  reconcile on a messy project: ids become codes, spellings become the zone's, unknown codes become zones,
 *      the PRA canvas list folds into affectedZones, lists keep a zone once, what cannot be decided is reported
 *   C  every demo project: the upgrade loses nothing, touches nothing else, and a second run changes nothing
 *   D  the readers and writers: the PRA canvas, the cross-check, the walkthrough, the list import, the load paths
 *      and the change funnel
 *   M  mutations
 *
 * Run: node tests/regression_zones3_20261019.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ': ' + String(d).slice(0, 400) : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const J = x => JSON.stringify(x);
const clone = o => JSON.parse(J(o));
const ZM = S('zonal_model.js');
const DEMOS = require('./lib/demo_projects_all.js');

function load(data, src) {
  data = data || {}; data.projectConfig = data.projectConfig || {};
  const sb = { projectConfig: data.projectConfig, zsaData: data.zsaData || (data.zsaData = []), praData: data.praData || (data.praData = []), routingData: data.routingData || (data.routingData = []), itemsData: data.itemsData || (data.itemsData = []), systemsData: data.systemsData || [], console, Math, JSON, Object, Array, String, Date };
  sb.window = sb; sb.globalThis = sb; vm.createContext(sb); vm.runInContext(src || ZM, sb, { filename: 'zonal_model.js' });
  return { Z: sb.ZONES, sb, data };
}
function messy() {
  return {
    projectConfig: { zonesSchema: 'zones-2', zoneSeq: 3, zones: [
      { id: 'z-1', code: '211', name: 'Forward avionics bay', parentId: null, equipment: [], volume: null, source: 'manual', cadRef: null },
      { id: 'z-2', code: 'Z-MLGW', name: 'Main gear wheel well', parentId: null, equipment: [], volume: null, source: 'manual', cadRef: null },
      { id: 'z-3', code: 'Z-NACL', name: 'Left nacelle', parentId: null, equipment: [], volume: null, source: 'manual', cadRef: null }] },
    zsaData: [
      { internalId: 1, zoneId: 'z-1', desc: 'walkthrough wrote the model id', origin: 'walkthrough' },
      { internalId: 2, zoneId: ' z-mlgw ', desc: 'typed in another case' },
      { internalId: 3, zoneId: 'Z-TAIL', desc: 'Tail cone', zoneName: 'Empennage tail cone' },
      { internalId: 4, zoneId: '', desc: 'no zone yet' }],
    praData: [
      { internalId: 10, praId: 'PRA-1', origin: 'pra-canvas', zones: ['z-3', 'z-2'], affectedZones: ['Z-NACL'] },
      { internalId: 11, praId: 'PRA-2', affectedZones: ['Z-MLGW', 'z-mlgw', 'Z-HOLD'] }],
    routingData: [{ internalId: 20, routingId: 'RT-1', routesThroughZones: ['z-2', 'Z-NACL'] }],
    itemsData: [{ internalId: 30, itemId: 'ITM-1', zoneId: '211' }]
  };
}

// ===================================================================== A
console.log('[A] the register');
{
  const { Z } = load(messy());
  check('resolve by code ignoring case and spacing, or by model id', Z.resolve(' 211 ').id === 'z-1' && Z.resolve('z-mlgw').id === 'z-2' && Z.resolve('z-3').code === 'Z-NACL' && Z.resolve('nope') === null && Z.resolve('') === null);
  check('codeOf and sameZone across the two spellings', Z.codeOf('z-2') === 'Z-MLGW' && Z.sameZone('z-2', 'Z-mlgw') && !Z.sameZone('z-1', 'z-2'));
  const dup = Z.addZone({ code: 'z-nacl', name: 'again' });
  check('a code another zone carries is refused, with the zone named', dup.ok === false && /already has the code Z-NACL/.test(dup.err) && Z.all().length === 3);
  check('the current schema is zones-3', Z.SCHEMA === 'zones-3' && Z.SCHEMAS.indexOf('zones-3') >= 0);
}
{
  const d = messy(), { Z } = load(d);
  Z.upgrade({ at: 'T' });
  const r = Z.recode('z-2', 'MLG-W');
  check('recode renames the zone and every row that names it, in one step', r.ok && r.references === 4 && d.praData[0].affectedZones[1] === 'MLG-W' && d.zsaData[1].zoneId === 'MLG-W' && d.praData[1].affectedZones[0] === 'MLG-W' && d.routingData[0].routesThroughZones[0] === 'MLG-W' && Z.get('z-2').code === 'MLG-W', J(r) + J(d.praData[1]));
  const r2 = Z.recode('z-1', 'z-nacl');
  check('recode refuses a code another zone has and changes nothing', r2.ok === false && Z.get('z-1').code === '211' && d.itemsData[0].zoneId === '211');
  check('migrate never takes a zones-3 project back to zones-2', (Z.migrate(), Z.schemaOf() === 'zones-3'));
}

// ===================================================================== B
console.log('\n[B] reconcile on a messy project');
{
  const d = messy(), { Z } = load(d);
  const r = Z.upgrade({ at: '2026-10-19T00:00:00Z' });
  check('a model id in a code field becomes that zone\'s code', d.zsaData[0].zoneId === '211' && d.routingData[0].routesThroughZones[0] === 'Z-MLGW' && r.converted.length === 2, J(r.converted));
  check('a code spelled differently becomes the zone\'s own spelling', d.zsaData[1].zoneId === 'Z-MLGW' && r.respelled.some(x => x.from === ' z-mlgw '));
  check('a code no zone carries becomes a zone, named from its row, marked as made from a reference', !!Z.byCode('Z-TAIL') && Z.byCode('Z-TAIL').name === 'Empennage tail cone' && Z.byCode('Z-TAIL').origin === 'reference' && Z.byCode('Z-TAIL').source === 'manual' && !!Z.byCode('Z-HOLD'));
  check('the PRA canvas\'s id list folds into affectedZones as codes, then goes', d.praData[0].affectedZones.join() === 'Z-NACL,Z-MLGW' && !('zones' in d.praData[0]) && r.prazones === 1, J(d.praData[0]));
  check('a list naming one zone twice keeps it once', d.praData[1].affectedZones.join() === 'Z-MLGW,Z-HOLD' && r.dropped.length === 1, J(d.praData[1]));
  check('an empty zone field stays empty (nothing invented)', d.zsaData[3].zoneId === '' && Z.all().length === 5);
  check('every reference now resolves; validate is clean', Z.danglingReferences().length === 0 && Z.validate().ok, J(Z.validate().issues));
  check('the upgrade is logged with what it changed', d.projectConfig.zoneUpgradeLog.length === 1 && d.projectConfig.zoneUpgradeLog[0].created.length === 2 && d.projectConfig.zonesSchema === 'zones-3');
  const snap = J(d), again = Z.upgrade({ at: 'later' });
  check('a second upgrade changes nothing and logs nothing', again.changed === 0 && J(d) === snap);
}
{
  const d = messy(); d.projectConfig.zones.push({ id: 'z-9', code: 'z-nacl ', name: 'A second nacelle zone', parentId: null, equipment: [] }, { id: 'z-10', code: '', name: 'No code', parentId: null, equipment: [] });
  d.zsaData.push({ internalId: 5, zoneId: 'Z-NACL', desc: 'ambiguous' });
  const { Z } = load(d); const r = Z.upgrade({ at: 'T' });
  check('two zones sharing a code: reported, and rows naming it are left exactly as they are', r.blocked.some(b => /share the code "z-nacl"/.test(b)) && d.zsaData[4].zoneId === 'Z-NACL' && d.routingData[0].routesThroughZones[1] === 'Z-NACL');
  check('a zone with no code is reported, not given one', r.blocked.some(b => /z-10 \(No code\) has no code/.test(b)) && Z.get('z-10').code === '');
  check('validate names the shared code', !Z.validate().ok && Z.validate().issues.some(i => /Duplicate zone code: z-nacl/.test(i)));
}
{
  const d = messy(), { Z } = load(d); Z.upgrade({ at: 'T' });
  d.zsaData.push({ internalId: 6, zoneId: 'Z-NEW', desc: 'added after the upgrade' });
  check('a row added later naming an unknown zone is a validate issue until reconciled', Z.validate().issues.some(i => /names zone "Z-NEW", which is not in the zone model/.test(i)));
  Z.reconcile();
  check('reconcile (the change funnel runs it) registers it', !!Z.byCode('Z-NEW') && Z.validate().ok);
}

// ===================================================================== C
console.log('\n[C] every demo project Safety Lab ships');
{
  const REF = { zsaData: ['zoneId', false], praData: ['affectedZones', true], routingData: ['routesThroughZones', true], itemsData: ['zoneId', false] };
  const all = DEMOS.all();
  check('every demo project builds headless (' + all.length + ')', all.length >= 8 && all.every(p => !p.error), J(all.filter(p => p.error).map(p => p.key + ': ' + p.error)));
  all.filter(p => !p.error).forEach(p => {
    const before = clone(p.data), { Z, data } = load(p.data);
    const zonesBefore = clone((before.projectConfig && before.projectConfig.zones) || []);
    const rep = Z.upgrade({ at: 'T' });
    // 1. every reference that was there still names the same zone
    let lost = [];
    Object.keys(REF).forEach(store => {
      const [field, list] = REF[store];
      (before[store] || []).forEach((row, i) => {
        if (!row) return; const after = data[store][i];
        const vals = list ? (Array.isArray(row[field]) ? row[field] : []) : [row[field]];
        vals.forEach(v => {
          if (v == null || !String(v).trim()) return;
          const z = Z.resolve(v);
          const same = z && (Z.normCode(z.code) === Z.normCode(v) || z.id === String(v).trim());
          const kept = list ? (after[field] || []).some(x => Z.resolve(x) === z) : Z.resolve(after[field]) === z;
          if (!same || !kept) lost.push(store + '#' + i + ' ' + v);
        });
      });
    });
    check(p.key + ': every zone a row named is still named, by the same zone (' + Z.references().length + ' references)', !lost.length, lost.slice(0, 5).join(', '));
    // 2. nothing else moved
    const strip = o => { const c = clone(o); Object.keys(REF).forEach(s => (c[s] || []).forEach(r => { if (r) { delete r[REF[s][0]]; delete r.zones; } })); if (c.projectConfig) { delete c.projectConfig.zones; delete c.projectConfig.zonesSchema; delete c.projectConfig.zoneSeq; delete c.projectConfig.zoneUpgradeLog; } return J(c); };
    check(p.key + ': nothing else in the project changed', strip(before) === strip(data));
    const keptZones = zonesBefore.every(z => { const n = Z.get(z.id); return n && n.code === z.code && n.name === z.name && n.parentId === z.parentId && J(n.equipment || []) === J(z.equipment || []); });
    check(p.key + ': zones already in the model are kept as they were (' + zonesBefore.length + ' kept, ' + rep.created.length + ' added from references)', keptZones && Z.all().length === zonesBefore.length + rep.created.length);
    check(p.key + ': clean afterwards (no reference without a zone, nothing blocked, validate ok)', Z.danglingReferences().length === 0 && rep.blocked.length === 0 && Z.validate().ok, J(rep.blocked) + J(Z.validate().issues.slice(0, 3)));
    const snap = J(data);
    check(p.key + ': a second upgrade changes nothing', Z.upgrade({ at: 'T2' }).changed === 0 && J(data) === snap);
  });
}

// ===================================================================== D
console.log('\n[D] the readers and writers');
{
  const PC = S('pra_canvas.js'), XC = S('physical_crosscheck.js'), WT = S('zsa_walkthrough.js'), CZ = S('cad_zonal.js'), DO = S('data_ops_modules.js'), HM = S('helpers_modules.js'), MF = S('misc_fn_modules.js'), ZU = S('zonal_ui.js');
  check('the PRA canvas writes the footprint into affectedZones only (no second list)', !/row\.zones\b/.test(PC) && !/zones: \[\]/.test(PC) && /row\.affectedZones\.push\(code\)/.test(PC));
  check('the cross-check reads affectedZones through the register', /p\.affectedZones\.forEach/.test(XC) && /Z\.resolve\(c\)/.test(XC) && !/Array\.isArray\(p\.zones\)/.test(XC));
  check('the walkthrough writes the zone code and finds its rows by zone, whichever way they were written', (WT.match(/zoneId: _code\(zoneId\)/g) || []).length === 2 && /_same\(r\.zoneId, zoneId\)/.test(WT));
  check('the zone list import finds a zone by its code ignoring case', /Z\.byCode\(e\.code\)/.test(CZ));
  check('both load paths run the upgrade', /window\.ZONES\.upgrade\(\)/.test(DO) && /window\.ZONES\.upgrade\(\)/.test(HM));
  check('the change funnel registers a new zone code in the same change', /window\.ZONES\.reconcile\(\); \} catch\(_\) \{\}\n\s*try \{ if \(window\.SLChangeAck\) window\.SLChangeAck\.noteChange\(\)/.test(MF));
  check('the Zonal Model page renames a code everywhere and says when a code is taken', /_Z\(\)\.recode\(id, c\)/.test(ZU) && (ZU.match(/_zErr\(r\.err\)/g) || []).length >= 2);
  // the cross-check on a small project: a PRA typed on the PRA form (affectedZones only) now reaches it
  const d = messy(), { Z, sb } = load(d); Z.upgrade({ at: 'T' });
  vm.runInContext(XC, sb, { filename: 'physical_crosscheck.js' });
  const fp = sb.PHYS_CROSSCHECK.praFootprints ? sb.PHYS_CROSSCHECK.praFootprints() : null;
  check('a PRA typed on the PRA form (affectedZones only) is a footprint the cross-check sees', fp && fp.some(f => f.id === 'PRA-2' && f.zones.join() === 'z-2,z-5'), J(fp));
}

// ===================================================================== M
console.log('\n[M] mutations');
{
  const mut = (name, from, to, broken) => {
    if (!ZM.includes(from)) { check('mutation anchor present: ' + name, false); return; }
    let caught; try { caught = broken(ZM.replace(from, to)); } catch (e) { caught = true; }
    check('mutation caught: ' + name, caught);
  };
  const up = src => { const d = messy(), L = load(d, src); L.Z.upgrade({ at: 'T' }); return { d, Z: L.Z }; };
  mut('codes compared exactly (case and spacing matter)', "function normCode(s) { return String(s == null ? '' : s).trim().replace(/\\s+/g, ' ').toLowerCase(); }", "function normCode(s) { return String(s == null ? '' : s); }", s => up(s).d.zsaData[1].zoneId !== 'Z-MLGW');
  mut('a model id left in a code field', "if (byI && String(byI.code || '').trim()) { _setRef(ref, byI.code);", "if (false) {", s => up(s).d.zsaData[0].zoneId !== '211');
  mut('an unknown code dropped instead of registered', "var a = addZone({ code: t,", "var a = { ok: false } || addZone({ code: t,", s => !!up(s).Z.byCode('Z-TAIL') === false);
  mut('the PRA canvas list left beside affectedZones', "p.affectedZones = aff; delete p.zones; rep.prazones++;", "rep.prazones++;", s => 'zones' in up(s).d.praData[0]);
  mut('a shared code resolved anyway', "if (dupKeys[normCode(t)]) return;", "", s => { const d = messy(); d.projectConfig.zones.push({ id: 'z-9', code: 'Z-NACL', name: 'x', parentId: null, equipment: [] }); d.zsaData.push({ internalId: 5, zoneId: 'z-nacl', desc: 'a' }); const L = load(d, s); L.Z.upgrade({ at: 'T' }); return d.zsaData[4].zoneId !== 'z-nacl'; });
  mut('duplicate codes accepted on add', "if (dupe) return { ok: false,", "if (false) return { ok: false,", s => load(messy(), s).Z.addZone({ code: 'z-nacl' }).ok !== false);
  mut('recode leaves the rows behind', "references().forEach(function (ref) { if (normCode(ref.value) === normCode(old) && normCode(old)) { _setRef(ref, c); n++; } });", "", s => { const d = messy(), L = load(d, s); L.Z.upgrade({ at: 'T' }); L.Z.recode('z-2', 'MLG-W'); return d.zsaData[1].zoneId !== 'MLG-W'; });
  mut('the second upgrade logs again', "if (did) {\n            if (!Array.isArray(pc.zoneUpgradeLog))", "if (true) {\n            if (!Array.isArray(pc.zoneUpgradeLog))", s => { const d = messy(), L = load(d, s); L.Z.upgrade({ at: 'T' }); L.Z.upgrade({ at: 'T' }); return d.projectConfig.zoneUpgradeLog.length !== 1; });
  mut('migrate downgrades zones-3', "if (pc.zonesSchema !== 'zones-3') pc.zonesSchema = 'zones-2';", "pc.zonesSchema = 'zones-2';", s => { const L = load(messy(), s); L.Z.upgrade({ at: 'T' }); L.Z.migrate(); return L.Z.schemaOf() !== 'zones-3'; });
  mut('dangling references not checked', "if (schemaOf() === 'zones-3') danglingReferences()", "if (false) danglingReferences()", s => { const d = messy(), L = load(d, s); L.Z.upgrade({ at: 'T' }); d.zsaData.push({ internalId: 7, zoneId: 'Z-X' }); return L.Z.validate().ok; });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
