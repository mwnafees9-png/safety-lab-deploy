#!/usr/bin/env node
/*
 * Regression — the MAC → FCIM edge (8 Aug 2026, SL-ARC-0001 §22 MBSA gray
 * bar): "for each clause, the conditions its breach produces, proposed and
 * adopted rather than written … what is missing is the write, and an override
 * flag so a hand-authored condition is not overwritten." mac_fcim.js is that
 * edge: candidates from the REAL macBreachSetsChecked enumeration (extracted
 * from misc_fn_modules and executed — never a private re-implementation),
 * landing as plExtra entries with macSource provenance behind a preview→sign
 * desk.
 *
 * INV-45 discipline pinned: generated cell text carries NO severity words.
 *
 * Run: node tests/regression_mac_fcim.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const src = S('mac_fcim.js'), misc = S('misc_fn_modules.js'), combined = S('fcim_combined.js'), html = S('index.html');

// ---- extract the REAL breach enumeration from misc_fn_modules ---------------
function extract(name) {
  const i = misc.indexOf('function ' + name + '(');
  if (i < 0) throw new Error(name + ' not found');
  const j = misc.indexOf('\n}', i);
  return misc.slice(i, j + 2);
}
const engine = ['const MAC_COMBO_CAP = 50000;', extract('_macDegFor'), extract('macClauseWeighted'),
  extract('macRuleLevel'), extract('macBreachSetsChecked'), extract('macBreachSets')].join('\n');

function sandbox() {
  const sb = { console, Object, String, Array, JSON, Set, Map, Date, Math, Number, parseFloat, parseInt, isNaN,
    setTimeout: () => 0, clearTimeout: () => 0, setInterval: () => 0, clearInterval: () => 0 };
  sb.window = sb; sb.globalThis = sb;
  sb.document = { getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {}, addEventListener: () => {}, setAttribute: () => {} }), addEventListener: () => {}, body: { appendChild: () => {} }, readyState: 'complete' };
  sb.projectConfig = { macModels: [] };
  sb.acFcimData = []; sb.systemsData = [];
  sb._macSysName = id => { const s = sb.systemsData.find(x => x.id === id); return s ? s.name : String(id); };
  sb._invs = []; sb.invRegister = d => sb._invs.push(d);
  sb._minted = []; sb._slAutoNumber = (key, row) => {   // spy — the real engine has its own suite
    ['plExtra', 'mExtra'].forEach(k => (row[k] || []).forEach((e, i) => { if (e && !e.id && e.desc) { e.id = row.subId + '-PL' + (i + 2); sb._minted.push(e.id); } }));
  };
  sb.scheduleAutosave = () => { sb._saved = (sb._saved || 0) + 1; };
  vm.createContext(sb);
  vm.runInContext(engine, sb);
  vm.runInContext(src, sb);
  return sb;
}
const RULE = (over) => Object.assign({
  id: 'mac-01', subId: 'SF-04',
  clauses: [{ min: 2, of: ['prp1', 'prp2', 'prp3', 'prp4'] }]
}, over || {});
const ROW = (over) => Object.assign({
  internalId: 6001, subId: 'SF-04', awareness: 'Aware',
  tlId: 'FC-05', tlDesc: 'Total loss of thrust (all four)', plId: 'SF04-PL', plDesc: 'hand partial', mId: 'SF04-M', mDesc: 'hand malfunction'
}, over || {});

// ---- [1] candidates from the real enumeration -------------------------------
console.log('\n[cand] min-2-of-4 → one within-MAC + four outside-MAC, complete loss excluded');
{
  const sb = sandbox();
  sb.systemsData = [{ id: 'prp1', name: 'Powerplant 1' }, { id: 'prp2', name: 'Powerplant 2' }, { id: 'prp3', name: 'Powerplant 3' }, { id: 'prp4', name: 'Powerplant 4' }];
  sb.projectConfig.macModels.push(RULE());
  sb.acFcimData.push(ROW());
  const c = sb.macFcimCandidates();
  const within = c.candidates.filter(x => /within$/.test(x.sourceId));
  const breach = c.candidates.filter(x => /:breach:/.test(x.sourceId));
  check('one within-MAC condition per clause that admits degradation', within.length === 1 &&
    /Loss of up to 2 of/.test(within[0].desc) && /meets the minimum acceptable configuration/.test(within[0].desc));
  check('four outside-MAC conditions — the minimal 3-of-4 breach sets', breach.length === 4 &&
    breach.every(x => /falls below the minimum acceptable configuration/.test(x.desc)));
  check('member SYSTEM NAMES in the text, not raw ids', /Powerplant 1/.test(within[0].desc) && breach.every(x => /Powerplant/.test(x.desc)));
  check('a pair clause (min 1 of 2) proposes the within condition and EXCLUDES its complete-loss breach', (function () {
    const sb2 = sandbox();
    sb2.systemsData = [{ id: 'a', name: 'Chan A' }, { id: 'b', name: 'Chan B' }];
    sb2.projectConfig.macModels.push({ id: 'mac-02', subId: 'SF-01', clauses: [{ min: 1, of: ['a', 'b'] }] });
    sb2.acFcimData.push(ROW({ internalId: 6002, subId: 'SF-01' }));
    const cc = sb2.macFcimCandidates();
    return cc.candidates.length === 1 && /within$/.test(cc.candidates[0].sourceId) && /up to 1 of/.test(cc.candidates[0].desc);
  })());
  check('no FCIM row → the rule is named UNBOUND, never silently dropped', (function () {
    const sb3 = sandbox();
    sb3.projectConfig.macModels.push(RULE());
    const cc = sb3.macFcimCandidates();
    return cc.candidates.length === 0 && cc.unbound.length === 1 && /no FCIM row for SF-04/.test(cc.unbound[0].why);
  })());
}

// ---- [2] INV-45 discipline — no severity words in generated text ------------
console.log('\n[inv45] generated conditions carry no severity vocabulary');
{
  const sb = sandbox();
  sb.systemsData = [{ id: 'prp1', name: 'Powerplant 1' }, { id: 'prp2', name: 'Powerplant 2' }, { id: 'prp3', name: 'Powerplant 3' }, { id: 'prp4', name: 'Powerplant 4' }];
  sb.projectConfig.macModels.push(RULE(), { id: 'mac-03', subId: 'SF-04', clauses: [{ min: 1, of: ['prp1', 'prp2'], floor: 0.5, weights: { prp1: 1, prp2: 1 } }] });
  sb.acFcimData.push(ROW());
  const RE = /\b(catastrophic|hazardous|major|minor|no safety effect)\b|\bseverity\b/i;   // _INV45_RE, verbatim
  const all = sb.macFcimCandidates().candidates;
  check('every candidate text is INV-45-clean (incl. the weighted-clause form)', all.length >= 5 && all.every(x => !RE.test(x.desc)));
}

// ---- [3] apply — signature, provenance, minting, override -------------------
console.log('\n[apply] preview→sign lands plExtra entries; hand-authored cells untouched');
{
  const sb = sandbox();
  sb.systemsData = [{ id: 'prp1', name: 'P1' }, { id: 'prp2', name: 'P2' }, { id: 'prp3', name: 'P3' }, { id: 'prp4', name: 'P4' }];
  sb.projectConfig.macModels.push(RULE());
  const row = ROW({ plExtra: [{ id: 'SF-04-PLX', desc: 'hand-authored extra — never touched' }] });
  sb.acFcimData.push(row);
  check('unsigned apply refuses (0 writes)', sb.macFcimApply(null, '') === 0 && row.plExtra.length === 1);
  const n = sb.macFcimApply(null, 'Waqas');
  check('signed apply lands the five conditions as plExtra entries', n === 5 && row.plExtra.length === 6);
  check('every landed entry carries macSource {sourceId, fingerprint, by}', row.plExtra.slice(1).every(e =>
    e.macSource && e.macSource.sourceId && e.macSource.fingerprint && e.macSource.by === 'Waqas'));
  check('ids minted through the numbering seam for blank entries only', sb._minted.length === 5 && row.plExtra[0].id === 'SF-04-PLX');
  check('the hand-authored entry is byte-untouched', row.plExtra[0].desc === 'hand-authored extra — never touched' && !row.plExtra[0].macSource);
  const p2 = sb.macFcimPreview();
  check('re-preview is all UNCHANGED (idempotent)', p2.isNew.length === 0 && p2.isUpdated.length === 0 && p2.unchanged.length === 5 && p2.orphaned.length === 0);
  // ---- fingerprint moves when the rule moves --------------------------------
  sb.projectConfig.macModels[0].clauses[0].min = 3;
  const p3 = sb.macFcimPreview();
  check('rule change → within condition reads UPDATED, breach sets re-derive', p3.isUpdated.length >= 1 || p3.isNew.length >= 1);
  const before = row.plExtra[0];
  sb.macFcimApply(p3, 'Waqas');
  check('update-in-place touches ONLY macSource entries; hand entry still first and untouched',
    row.plExtra[0] === before && !row.plExtra[0].macSource);
  // ---- orphan: the rule disappears ------------------------------------------
  sb.projectConfig.macModels.length = 0;
  const p4 = sb.macFcimPreview();
  check('rule deleted → every adopted entry reads ORPHANED', p4.orphaned.length >= 5);
  sb.macFcimApply(p4, 'Waqas');
  check('orphans are FLAGGED (macSource.orphan + reason), never deleted', row.plExtra.length >= 6 &&
    row.plExtra.slice(1).every(e => e.macSource.orphan === true && /no longer produces/.test(e.macSource.orphanReason)));
}

// ---- [4] INV-47 registered and executes -------------------------------------
console.log('\n[inv47] the edge is checkable');
{
  const sb = sandbox();
  sb.systemsData = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
  sb.projectConfig.macModels.push({ id: 'mac-01', subId: 'SF-01', clauses: [{ min: 1, of: ['a', 'b', 'c'] }] });
  sb.acFcimData.push(ROW({ internalId: 6009, subId: 'SF-01' }));
  const inv = sb._invs.find(x => x.id === 'INV-47');
  check('INV-47 registered ADVISORY', !!inv && inv.sev === 'advisory');
  const r1 = inv.run();
  check('pending proposals are findings', r1.fails.length >= 1 && r1.fails.some(f => /not yet in the matrix/.test(f)));
  sb.macFcimApply(null, 'Waqas');
  const r2 = inv.run();
  check('after adoption the invariant is clean', r2.fails.length === 0 && r2.checked >= 1);
}

// ---- [5] the fcim_combined modal preserves provenance -----------------------
console.log('\n[modal] fcim_combined save carries entry fields forward (source pin)');
{
  check('fcim_combined rebuild carries prior fields via _carry (macSource survives a modal save)',
    /_carry/.test(combined) && /Object\.assign\(\{\}, _carry\(k, id, desc\) \|\| \{\}, \{ id, desc \}\)/.test(combined));
  check('the why is written at the site', /Rebuilding[\s\S]{0,120}STRIP/.test(combined) || /used to STRIP them/.test(combined));
}

// ---- [6] wiring — floors, not literals (§7.3) -------------------------------
console.log('\n[wiring]');
{
  const m1 = html.match(/mac_fcim\.js\?v=([0-9.]+)/);
  const m2 = html.match(/fcim_combined\.js\?v=([0-9.]+)/);
  check('index.html loads mac_fcim.js (≥1.0)', m1 && parseFloat(m1[1]) >= 1.0);
  check('fcim_combined pinned ≥ 1.3 (the preserve fix)', m2 && parseFloat(m2[1]) >= 1.3, m2 && m2[1]);
  check('mac_fcim loads AFTER mac_flows (the desk wraps renderMacPage)',
    html.indexOf('mac_flows.js?v=') < html.indexOf('mac_fcim.js?v='));
  check('module exports the three-surface API', /window\.macFcimCandidates = macFcimCandidates/.test(src) &&
    /window\.macFcimPreview = macFcimPreview/.test(src) && /window\.macFcimApply = macFcimApply/.test(src));
  check('never a second enumerator — candidates call macBreachSetsChecked', /macBreachSetsChecked/.test(src) &&
    !/function macBreachSets/.test(src));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
