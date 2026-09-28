#!/usr/bin/env node
/*
 * Regression — two defects found on 28 Sep 2026, both of the same family:
 * something that contains no information reading as an answer.
 *
 *   B1  CERT BASIS ORDERING. onProjectConfigChange reads the Part 23 picker,
 *       and renderProjectConfigUI is what CREATES that picker (only while the
 *       basis is Part 23). The read came first, so a switch INTO Part 23 found
 *       no picker, part23Class was never derived, and getSafetyTarget fell back
 *       to 'Part 23 IV'. Part 23 IV is numerically identical to Part 25 at the
 *       top (1e-9 / DAL A), so the basis moved and the numbers appeared not to.
 *       Regression from aa2b497 (G1), which replaced the always-present class
 *       dropdown with a picker that is drawn on demand.
 *
 *   B2  UNPOPULATED MIRROR. _cloneSubtreeForVerification blanks every leaf, so
 *       a fresh verification mirror computes P(top) = exactly 0. Zero is finite:
 *       the budget ledger took it as an achieved result and 0 <= objective is
 *       always true, so an EMPTY mirror reported meets-objective and asa_triage
 *       closed the condition as 'closed-by-ssa'. The same zero was substituted
 *       for a leaf in asa_triage._achievedForSysFha, making the aircraft-level
 *       number optimistic.
 *
 * These EXECUTE the real functions. B1 runs the real handler against a DOM that
 * models the thing that actually broke: the picker does not exist until the
 * render creates it.
 *
 * Run: node tests/regression_basis_and_mirror.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const slice = (src, from, to) => { const a = src.indexOf(from); const b = src.indexOf(to, a + 1); return src.slice(a, b < 0 ? src.length : b); };

// ---------------------------------------------------------------- a DOM that behaves
// getElementById returns null for an id that has not been created. Setting innerHTML
// registers the ids inside it and de-registers the previous children: exactly how the
// Part 23 host behaves when the basis is switched.
function makeDoc(staticIds) {
    const reg = {};
    const mk = id => {
        const el = { id, value: '', textContent: '', style: {}, _children: [] };
        Object.defineProperty(el, 'innerHTML', {
            get() { return el._html || ''; },
            set(v) {
                (el._children || []).forEach(cid => { delete reg[cid]; });
                el._html = String(v == null ? '' : v);
                const kids = [];
                el._html.replace(/id="([^"]+)"/g, (_, cid) => { reg[cid] = reg[cid] || mk(cid); kids.push(cid); return ''; });
                el._children = kids;
            }
        });
        return el;
    };
    (staticIds || []).forEach(id => { reg[id] = mk(id); });
    return { getElementById: id => reg[id] || null, _reg: reg, _mk: mk };
}

// ---------------------------------------------------------------- B1 sandbox
const SUP = read('support_modules.js'), HELP = read('helpers_modules.js');
const ctx = { console, Math, JSON, String, Array, Object, Number, isNaN, isFinite, parseFloat, parseInt, RegExp, Date };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(read('safety_targets.js'), ctx, { filename: 'safety_targets.js' });
vm.runInContext(read('p23_assessment_level.js'), ctx, { filename: 'p23_assessment_level.js' });
vm.runInContext(read('f3061_dal.js'), ctx, { filename: 'f3061_dal.js' });
// cosmetic collaborators the two real functions call
vm.runInContext("function esc(s){return String(s==null?'':s);}" +
    "function certBasisDisplayLabel(){return String(projectConfig.regulation||'');}" +
    "function _renderCustomCertBasisEditor(){return '';}" +
    "function isProLicensed(){return true;}" +
    // downstream refreshers the handler and the render call; not under test here, and
    // every one of them is a pure redraw of a surface we are not asserting on.
    "function renderProbTable(){}function renderDalTable(){}function showToast(){}" +
    "function refreshFTARequiredTarget(){}function refreshTopAllocatorReadout(){}" +
    "function calculateAllProbabilities(){}function updateD3(){}function renderMoCCatalogue(){}" +
    "function scheduleAutosave(){}", ctx);
// the REAL cert-basis resolvers + the REAL render + the REAL handler
['function canonRegulation', 'function scvtolTargetKey', 'function scvtolIsLegacyBasic',
 'function part27TargetKey', 'function part27IsLegacy', 'function certBasisKeyFor',
 'function getSafetyTarget'].forEach(sig => {
    const s = SUP.indexOf(sig);
    if (s < 0) { check('setup: found ' + sig, false); return; }
    const nl = SUP.indexOf('\n}', s);
    vm.runInContext(SUP.slice(s, nl + 2), ctx, { filename: 'support_modules.js' });
});
vm.runInContext(slice(SUP, 'function renderProjectConfigUI()', '\nfunction _renderCustomCertBasisEditor'), ctx, { filename: 'renderProjectConfigUI' });
vm.runInContext(slice(HELP, 'function onProjectConfigChange()', '\nfunction derivationBadgeHtml'), ctx, { filename: 'onProjectConfigChange' });

// The page as it stands while the basis is Part 25: the host exists, the picker does not.
ctx.document = makeDoc(['proj-regulation', 'proj-part23-host', 'proj-class-container', 'proj-scvtol-container',
    'proj-scvtol-category', 'proj-part27-container', 'proj-part27-class', 'proj-custom-container',
    'proj-custom-content', 'proj-mission-based-note', 'proj-config-summary', 'proj-mission-duration']);
// A project set up through the wizard: level and propulsion are stored, class derives from them.
ctx.projectConfig = { regulation: 'Part 25', part23CertLevel: '1', part23Propulsion: 'recip-1', part23Class: 'IV' };

console.log('\n[B1] switching the certification basis moves the targets with it');
check('B1: the Part 23 picker does NOT exist while the basis is Part 25',
    ctx.document.getElementById('proj-p23-level') === null);
const before = ctx.getSafetyTarget('Catastrophic');
check('B1: Part 25 Catastrophic is 1e-9 / DAL A', before.prob === 1e-9 && before.dal === 'A', JSON.stringify(before));

ctx.document.getElementById('proj-regulation').value = 'Part 23';   // the user changes the dropdown
ctx.onProjectConfigChange();                                         // ONE event, as in the app

check('B1: the picker exists after the render', ctx.document.getElementById('proj-p23-level') !== null);
check('B1: part23Class was derived in that SAME event (level 1 + single recip = I)',
    ctx.projectConfig.part23Class === 'I', 'got ' + ctx.projectConfig.part23Class);
const after = ctx.getSafetyTarget('Catastrophic');
check('B1: the Catastrophic target moved to the Part 23 I row (1e-6)', after.prob === 1e-6, JSON.stringify(after));
check('B1: the DAL moved off A', after.dal !== 'A', 'got ' + after.dal);
check('B1: the basis key is Part 23 I, not Part 23 IV', after.scope === 'Part 23 I', after.scope);
check('B1: and it did NOT silently stay on the Part 25 number', after.prob !== before.prob);

// ---------------------------------------------------------------- B2
console.log('\n[B2] an unpopulated verification mirror is not a result');
const ctx2 = { console, Math, JSON, String, Array, Object, Number, isFinite, isNaN };
ctx2.window = ctx2; ctx2.globalThis = ctx2;
vm.createContext(ctx2);
vm.runInContext(slice(HELP, 'function slMirrorIsPopulated(', '\ntry { if (typeof window'), ctx2, { filename: 'slMirrorIsPopulated' });
const P = ctx2.slMirrorIsPopulated;

const blankLeaf = () => ({ type: 'basic', lambda: 0, probability: 0, inputValue: 0 });
const realLeaf  = () => ({ type: 'basic', lambda: 1e-5, probability: 1e-5 });
const tree = leaves => ({ root: { type: 'gate', children: leaves } });

check('B2: a freshly cloned mirror (every leaf blanked) is NOT populated', P(tree([blankLeaf(), blankLeaf()])) === false);
check('B2: a fully entered mirror IS populated', P(tree([realLeaf(), realLeaf()])) === true);
check('B2: a HALF entered mirror is not populated', P(tree([realLeaf(), blankLeaf()])) === false);
check('B2: a leaf carrying only a Markov model counts as entered',
    P(tree([{ type: 'basic', lambda: 0, probability: 0, markovModelId: 'm1' }])) === true);
check('B2: a mirror with no leaves at all is not populated', P({ root: { type: 'gate', children: [] } }) === false);
check('B2: a missing mirror is not populated', P(null) === false && P({}) === false);

console.log('\n[B2] the rule is used where the decisions are made');
const LED = read('budget_ledger.js'), ASA = read('asa_triage.js');
check('B2: the ledger gates achieved on populated', /_mirrorPopulated\(mirror\)\s*\)\s*\?\s*_pTop\(mirror\)\s*:\s*null/.test(LED));
check('B2: asa_triage refuses an unpopulated mirror as a verified source', /if \(!_mirrorPopulated\(mirror\)\) continue;/.test(ASA));
check('B2: both delegate to the one shared definition', /slMirrorIsPopulated/.test(LED) && /slMirrorIsPopulated/.test(ASA));
check('B2: the checklist no longer keeps its own copy of the rule',
    /const mirrorPopulated = t => slMirrorIsPopulated\(/.test(HELP) &&
    (HELP.match(/tot > 0 && pop >= tot/g) || []).length === 1);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
