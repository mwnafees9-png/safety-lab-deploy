#!/usr/bin/env node
/*
 * Regression — C2: the allocation/verification mirror (22 Aug 2026).
 *   Allocation leaf = item + effect (FMES group) — it stops there (C3: no
 *   mode-level targets, ever). The verification mirror decomposes the adopted
 *   leaf into an OR gate of failure-mode events at λ = each FMEA row's rate
 *   (α = its share of Σλ). The COORDINATE is lockstep, twin wins: the
 *   allocation side's identity syncs onto the mirror; modeIds are the one
 *   mirror-side field. The clone no longer aliases identity between twins.
 *   R2's drift watcher learns the decomposed shape.
 * Run: node tests/regression_mirror_modes.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const slice = (src, from, to, label) => {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error('slice anchors missing: ' + label);
  return src.slice(a, b);
};

globalThis.window = globalThis;
globalThis.SLEnv = { get: n => globalThis[n] };
globalThis.document = undefined;
globalThis.internalIdCounter = 1000;
globalThis.showToast = () => {};
globalThis.calculateAllProbabilities = () => {};
globalThis.updateD3 = () => {};
globalThis.commitSaveChanges = () => { globalThis._saves = (globalThis._saves || 0) + 1; };
globalThis.esc = s => String(s == null ? '' : s);

// ---- fixture ---------------------------------------------------------------
const GROUP = () => ({
  key: 'AC§eff§det', sumRate: 8e-6, system: 'Aircraft', effect: 'eff', detection: 'det',
  rows: [
    { fmeaId: 'F1', part: 'Pump', mode: 'Seizes', rate: 5e-6 },
    { fmeaId: 'F2', part: 'Pump', mode: 'Leaks',  rate: 3e-6 } ],
  beIds: new Set(['BE-1'])
});
let theGroup = GROUP();
globalThis.fmesGroups = () => ({ groups: theGroup ? [theGroup] : [], incomplete: [] });
const mk = () => {
  theGroup = GROUP();
  globalThis.ftaPages = [
    { id: 'alloc', name: 'SSA · Pump', root: { id: 1, type: 'gate', gateType: 'OR', children: [
        { id: 101, logicalId: 'L1', type: 'basic', name: 'Loss of pump output', probability: 1e-6,
          identity: { kind: 'item', systemId: 's1', itemId: 'IT-1', effectId: 'EF-1', declaredBy: 'W' } } ] } },
    { id: 'mir', name: 'SSA · Pump (Verification)', verifies: 'alloc', root: { id: 2, type: 'gate', gateType: 'OR', children: [
        { id: 201, logicalId: 'L1', type: 'basic', name: 'Loss of pump output', displayId: 'BE-1',
          _fmesGroup: 'AC§eff§det', inputMode: 'lambda', lambda: 8e-6, probability: 0,
          identity: { kind: 'item', systemId: 'sSTALE', itemId: 'OLD' } } ] } },
  ];
  globalThis.activeFTAPageId = 'mir';
  globalThis.selectedNodeData = null;
};
mk();
globalThis._fmesFindBe = beId => {
  let out = null;
  ftaPages.forEach(p => { (function w(n) { if (!n || out) return; if ((n.displayId || '') === String(beId)) out = { node: n, page: p }; (n.children || []).forEach(w); })(p.root); });
  return out;
};

const MM = (() => { const m = { exports: {} }; new Function('window', 'module', S('mirror_modes.js'))(globalThis, m); return globalThis.SLMirrorModes; })();
check('module exports the full API', ['syncMirrorIdentity', 'syncAll', 'decompose', 'recompose', 'fmesCellButton'].every(k => typeof MM[k] === 'function'));

// ---- lockstep: twin wins ----------------------------------------------------
const mirLeaf = () => ftaPages[1].root.children[0];
const allocLeaf = () => ftaPages[0].root.children[0];
let n = MM.syncMirrorIdentity(ftaPages[1]);
check('LOCKSTEP: the allocation twin\'s coordinate overwrites the mirror\'s stale one',
  n >= 1 && mirLeaf().identity.itemId === 'IT-1' && mirLeaf().identity.systemId === 's1', JSON.stringify(mirLeaf().identity));
check('…by COPY, not by aliasing (mutating the mirror never reaches the twin)',
  (mirLeaf().identity.itemId = 'HACKED', allocLeaf().identity.itemId === 'IT-1'));
MM.syncMirrorIdentity(ftaPages[1]);
mirLeaf().identity.modeIds = ['F9'];
MM.syncMirrorIdentity(ftaPages[1]);
check('modeIds are the ONE mirror-side field — sync preserves them', JSON.stringify(mirLeaf().identity.modeIds) === '["F9"]' && mirLeaf().identity.itemId === 'IT-1');
delete allocLeaf().identity;
MM.syncMirrorIdentity(ftaPages[1]);
check('a twin with NO declaration wins too — the mirror cannot out-declare it', mirLeaf().identity === undefined);

// ---- C3: allocation side refuses --------------------------------------------
mk();
// The allocation leaf is FULLY adoptable — only the C3 verification-side guard
// stands between it and decomposition. (First cut of this check left it
// unadopted, and the adoption guard masked a dead C3 guard — mutation-caught.)
allocLeaf()._fmesGroup = 'AC§eff§det'; allocLeaf().inputMode = 'lambda'; allocLeaf().lambda = 8e-6;
check('C3: decompose on an ALLOCATION page is refused even when fully adopted',
  MM.decompose('alloc', 101) === false && allocLeaf().type === 'basic' && !allocLeaf()._fmesDecomposed);
delete allocLeaf()._fmesGroup; delete allocLeaf().inputMode; delete allocLeaf().lambda;

// ---- decompose ---------------------------------------------------------------
check('decompose requires an adoption', (() => { const x = { id: 999, logicalId: 'LX', type: 'basic' }; ftaPages[1].root.children.push(x); const r = MM.decompose('mir', 999); ftaPages[1].root.children.pop(); return r === false; })());
check('decompose turns the adopted mirror leaf into an OR gate of its modes',
  MM.decompose('mir', 201) === true && mirLeaf().type === 'gate' && mirLeaf().gateType === 'OR' && mirLeaf().children.length === 2);
const kids = mirLeaf().children;
check('each mode child carries λ = its FMEA row\'s rate (5e-6, 3e-6) and Σ = the group Σλ',
  kids[0].lambda === 5e-6 && kids[1].lambda === 3e-6 && Math.abs(kids[0].lambda + kids[1].lambda - 8e-6) < 1e-18);
check('α is each row\'s share of Σλ', Math.abs(kids[0]._fmesMode.alpha - 0.625) < 1e-9 && Math.abs(kids[1]._fmesMode.alpha - 0.375) < 1e-9);
check('mode children inherit the twin coordinate PLUS their own modeIds — nothing else new',
  kids[0].identity && kids[0].identity.itemId === 'IT-1' && JSON.stringify(kids[0].identity.modeIds) === '["F1"]' && JSON.stringify(kids[1].identity.modeIds) === '["F2"]');
check('mode lids are synthetic and traceable to the parent', kids[0].logicalId === 'L1§mode§F1' && kids[1].logicalId === 'L1§mode§F2');
check('the decomposition is recorded and the parent leaves the lambda-leaf shape',
  mirLeaf()._fmesDecomposed && mirLeaf()._fmesDecomposed.modes === 2 && mirLeaf().lambda === undefined && mirLeaf().inputMode === undefined);
check('decomposing twice is refused', MM.decompose('mir', 201) === false);
check('lockstep leaves mode children alone (no twin, own coordinate)',
  (MM.syncMirrorIdentity(ftaPages[1]), kids[0].identity.modeIds[0] === 'F1'));

// ---- recompose ---------------------------------------------------------------
theGroup.sumRate = 9e-6;
check('recompose folds back at the group\'s CURRENT Σλ (9e-6, not the recorded 8e-6)',
  MM.recompose('mir', 201) === true && mirLeaf().type === 'basic' && mirLeaf().lambda === 9e-6 && mirLeaf()._fmesDecomposed === undefined && mirLeaf().children.length === 0);
mk(); MM.decompose('mir', 201);
theGroup = null;   // group GONE
check('recompose with the group GONE uses the last-known Σλ and still folds back',
  MM.recompose('mir', 201) === true && mirLeaf().lambda === 8e-6);

// ---- the FMES cell + node panel ---------------------------------------------
mk();
check('FMES cell offers Decompose for a live mirror adoption', /Decompose modes/.test(MM.fmesCellButton(theGroup)));
MM.decompose('mir', 201);
check('…and Recompose once decomposed', /Recompose/.test(MM.fmesCellButton(theGroup)));
mk();
ftaPages[0].root.children[0].displayId = 'BE-1'; ftaPages[1].root.children[0].displayId = 'BE-X';   // adoption points allocation-side now
check('an ALLOCATION-side adoption gets NO decompose button', MM.fmesCellButton(theGroup) === '');
mk();
check('node panel: adopted mirror leaf offers the decompose control', /Decompose into modes/.test(MM._panelHtml(mirLeaf(), ftaPages[1])));
MM.decompose('mir', 201);
check('node panel: a mode child explains itself — α share, inherited coordinate, C3',
  (() => { const h = MM._panelHtml(mirLeaf().children[0], ftaPages[1]); return /Failure mode/.test(h) && /62\.5%/.test(h) && /read-only/.test(h) && /C3/.test(h); })());
check('node panel: silent on allocation pages', MM._panelHtml(allocLeaf(), ftaPages[0]) === '');

// ---- C2.1: the live-UI findings ---------------------------------------------
mk(); MM.decompose('mir', 201);
check('C2.1: mode children mint displayIds from the parent (canvas badge was "undefined")',
  mirLeaf().children[0].displayId === 'BE-1.M1' && mirLeaf().children[1].displayId === 'BE-1.M2');
(0, eval)(slice(S('helpers_modules.js'), 'function _fmesBeState', 'function renderFmesPage', '_fmesBeState'));
let st = _fmesBeState(theGroup);
check('C2.1: _fmesBeState knows the decomposed shape — ok when modes sum to the group, NEVER offering Apply Σλ',
  /decomposed · 2 modes/.test(st.label) && st.cls === 'ok' && st.noAdopt === true, JSON.stringify(st));
theGroup.sumRate = 9e-6;
st = _fmesBeState(theGroup);
check('C2.1: a moved FMEA under a decomposition reads as an honest re-decompose state, still no Apply Σλ',
  /re-decompose/.test(st.label) && st.cls === 'danger' && st.noAdopt === true, JSON.stringify(st));
theGroup.sumRate = 8e-6;
check('C2.1: the Apply Σλ button cell honors noAdopt (source wiring)',
  /!st\.noAdopt && \(st\.canAdopt \|\| st\.cls !== 'ok'\)/.test(S('helpers_modules.js')));

// ---- the clone no longer aliases identity ------------------------------------
(0, eval)(slice(S('helpers_modules.js'), 'function _cloneSubtreeForVerification', 'function createVerificationTreeFromActive', 'clone'));
mk();
const clone = _cloneSubtreeForVerification(allocLeaf(), true);
clone.identity.itemId = 'MUTATED';
check('CLONE FIX: the mirror clone deep-copies identity — the allocation original is untouched',
  allocLeaf().identity.itemId === 'IT-1' && clone.identity.declaredBy === 'W');

// ---- R2 learns the decomposed shape (stale_watch v1.1) ------------------------
mk(); MM.decompose('mir', 201);
globalThis.projectConfig = {};
globalThis.acFhaData = []; globalThis.acAssumptionsData = []; globalThis.acReqData = [];
globalThis.systemsData = []; globalThis.getSafetyTarget = () => ({ prob: 1e-9 });
globalThis.computeExactProbability = () => ({ prob: 0 });
globalThis.macTreeStatus = () => 'fresh'; globalThis.SLLaneTrees = { status: () => 'fresh' };
globalThis.slPrompt = async () => 'W';
delete require.cache[require.resolve(path.join(__dirname, '..', 'site', 'stale_watch.js'))];
const SW = require(path.join(__dirname, '..', 'site', 'stale_watch.js'));
theGroup.sumRate = 9e-6;   // the FMEA moved under the decomposition
let fl = SW.sweep().flags.filter(f => f.source === 'fmes');
check('[fmes] a decomposed node whose modes no longer sum to the group Σλ flags, saying re-decompose',
  fl.length === 1 && /re-decompose/.test(fl[0].msg) && /9\.00e-6/.test(fl[0].msg), JSON.stringify(fl));
theGroup.sumRate = 8e-6;
check('[fmes] matching sums stay quiet', SW.sweep().flags.filter(f => f.source === 'fmes').length === 0);
theGroup = null;
check('[fmes] a decomposed node whose group is GONE flags', SW.sweep().flags.some(f => f.source === 'fmes' && /no longer exists/.test(f.msg)));

// ---- wiring -------------------------------------------------------------------
const idx = S('index.html');
check('index loads mirror_modes.js AFTER its providers (misc, helpers, stale_watch)',
  /mirror_modes\.js\?v=1\.[0-9]+"\s+defer/.test(idx) &&   // floor (rule 12) — 1.1 = C2.1 displayIds
  ['misc_fn_modules', 'helpers_modules', 'stale_watch'].every(f => idx.indexOf(f + '.js?v=') < idx.indexOf('mirror_modes.js?v=')));
check('pins: helpers ≥2.48 · stale_watch ≥1.1 (floors, rule 12)',
  parseFloat((idx.match(/helpers_modules\.js\?v=([\d.]+)/) || [])[1]) >= 2.48 &&
  parseFloat((idx.match(/stale_watch\.js\?v=([\d.]+)/) || [])[1]) >= 1.1);
const misc = S('misc_fn_modules.js');
check('C3 wiring: the DAL sweep never allocates on verification pages', /if \(!p \|\| !p\.root \|\| p\.verifies\) return;/.test(misc));
check('C3 wiring: requirements generate from allocation trees only', /if \(page && page\.verifies\) return;/.test(S('assurance_modules.js')));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
