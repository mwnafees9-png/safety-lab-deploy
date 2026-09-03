#!/usr/bin/env node
/*
 * Regression — the SL-ARC-0001 §20 defect-closure batch (8 Aug 2026, night).
 * Seven closures, each found by READING THE CODE to write the Data Architecture
 * document, stated to the customer in §20, and closed here:
 *
 *   D1  praData.affectedZones joins on zsaData.zoneId — seed corrected, and the
 *       edge is now swept as dangling (also the stated limit in SL-WP-0010 §11).
 *   D2  pageTopSeverity reads linkedFhaIds[] (array first, scalar fallback,
 *       strictest wins) — gate-indep-phys / NSPF no longer suppressed on
 *       non-active pages.
 *   D4  _markStructureChangeObsolete filters on the generator ids the
 *       generators actually emit (gate-indep-*, fha-prob, fha-dal, fta-*,
 *       dalgebra*), not the three phantoms nothing writes.
 *   D5  CMA linkedGateIds "pageId:nodeId" — BOTH halves resolve in the sweep.
 *   D6  AI-filed review comments: authorName is the AI, the human stays in
 *       filedBy, and the renderer badges it.
 *   +   acTraces[] / linkedFhaIds[] plural forms swept alongside the legacy
 *       scalars (dangle AND orphan sides).
 *   +   Program Planning catalogue cites SAE J3307, not "STPA Handbook".
 *
 * Executed against the REAL gt_integrity.js in a vm sandbox; the entangled
 * modules (assurance, misc_fn) are exercised through their REAL extracted
 * functions — the same source text that ships, never a re-implementation.
 *
 * Run: node tests/regression_arc20_defects.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const gti = S('gt_integrity.js'), dataOps = S('data_ops_modules.js'), assurance = S('assurance_modules.js'),
      miscFn = S('misc_fn_modules.js'), ai = S('ai_assistant.js'), progPlan = S('program_plan.js'),
      html = S('index.html'), loader = S('ai_loader.js');

function sandbox() {
  const sb = { console, Object, String, Array, JSON, Set, Map, Date, Math, Number, parseFloat, parseInt, isNaN,
    setTimeout: () => 0, clearTimeout: () => 0, setInterval: () => 0, clearInterval: () => 0 };
  sb.window = sb; sb.globalThis = sb;
  sb.document = { readyState: 'complete', getElementById: () => null, querySelector: () => null,
    createElement: () => ({ style: {}, setAttribute: () => {}, addEventListener: () => {}, appendChild: () => {}, classList: { toggle: () => {}, add: () => {}, remove: () => {} } }),
    addEventListener: () => {}, body: { appendChild: () => {} } };
  sb.projectConfig = {};
  sb.acFunctionsData = []; sb.acFhaData = []; sb.acReqData = []; sb.acAssumptionsData = [];
  sb.systemsData = []; sb.zsaData = []; sb.praData = []; sb.cmaData = []; sb.itemsData = []; sb.ftaPages = [];
  sb.resourcesData = []; sb.routingData = [];
  sb.scheduleAutosave = () => {}; sb.saveState = () => {};
  vm.createContext(sb);
  vm.runInContext(gti, sb);
  return sb;
}
const dangles = (sb, whereRx) => sb.gtIntegrity().dangling.filter(d => whereRx.test(d.where));

// Extract a top-level `function name(...) {...}` from module source by brace
// counting — the REAL shipped text, so a drift in the module breaks this suite.
function extractFn(src, name) {
  const ix = src.indexOf('function ' + name + '(');
  if (ix < 0) throw new Error(name + ' not found');
  let i = src.indexOf('{', ix), depth = 0, j = i;
  for (; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (!depth) break; }
  }
  return src.slice(ix, j + 1);
}

// ---- [D1] the seed joins, and the sweep guards the join --------------------
console.log('\n[D1] praData.affectedZones — seed correct, edge swept');
{
  // Seed drift pin: every affectedZones value in the demo seed must be a zoneId
  // that the demo's own zsaData declares — checked against the SHIPPED text.
  const praBlock = dataOps.slice(dataOps.indexOf('const praData = ['), dataOps.indexOf('];', dataOps.indexOf('const praData = [')));
  const zoneIds = new Set([...dataOps.matchAll(/zoneId: '([^']+)'/g)].map(m => m[1]));
  const refs = [...praBlock.matchAll(/affectedZones: \[([^\]]*)\]/g)].flatMap(m => [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]));
  check('seed declares affectedZones on every PRA row', refs.length >= 5, 'got ' + refs.length);
  check('every seeded affectedZones value resolves against the seed zoneIds (join key)',
    refs.every(r => zoneIds.has(r)), 'unresolved: ' + refs.filter(r => !zoneIds.has(r)).join(','));
  check('no internalId-style zsa-N reference remains in the PRA seed', !/affectedZones: \[[^\]]*'zsa-\d/.test(praBlock));

  // Behavior: the sweep names a dead zone reference instead of silence.
  const sb = sandbox();
  sb.zsaData.push({ internalId: 'zsa-1', zoneId: 'Z-KEEL', housedFunctions: [] });
  sb.praData.push({ internalId: 'pra-1', praId: 'PRA-FIRE', affectedZones: ['Z-KEEL'] });
  sb.praData.push({ internalId: 'pra-2', praId: 'PRA-ROTOR', affectedZones: ['zsa-1'] }); // the old silent shape
  const d = dangles(sb, /^PRA /);
  check('a resolving zoneId reference is clean', !d.some(x => x.where === 'PRA PRA-FIRE'));
  check('an internalId (or any dead) reference is DANGLING, not a silent empty join',
    d.some(x => x.where === 'PRA PRA-ROTOR' && x.ref === 'zsa-1'), JSON.stringify(d));
}

// ---- [D2] pageTopSeverity reads the plural ---------------------------------
console.log('\n[D2] pageTopSeverity — linkedFhaIds[] resolved, strictest wins');
{
  const sb = { console, Object, String, Array };
  sb.acFhaData = [{ internalId: 'fha-1', severity: 'Major' }, { internalId: 'fha-2', severity: 'Catastrophic' }];
  sb.systemsData = [{ id: 'sys-1', fha: [{ internalId: 'sfha-1', severity: 'Hazardous' }] }];
  sb.activeFTAPageId = 'other-page'; sb.ftaConfig = {};
  vm.createContext(sb);
  vm.runInContext('SEV_ORDER = { Catastrophic: 4, Hazardous: 3, Major: 2, Minor: 1 };' +
    'function moreRestrictiveSev(a,b){ if(!a) return b; if(!b) return a; return (SEV_ORDER[a]||0) >= (SEV_ORDER[b]||0) ? a : b; }' +
    extractFn(assurance, 'pageTopSeverity'), sb);
  const f = id => vm.runInContext('pageTopSeverity(' + JSON.stringify(id) + ')', sb);
  check('plural-only page (the seeded shape) resolves — was null before the fix',
    f({ id: 'p1', linkedFhaIds: ['fha-1'] }) === 'Major');
  check('multiple links: the STRICTEST severity governs',
    f({ id: 'p1', linkedFhaIds: ['fha-1', 'fha-2'] }) === 'Catastrophic');
  check('sys-FHA links resolve through the plural too',
    f({ id: 'p1', linkedFhaIds: ['sfha-1'] }) === 'Hazardous');
  check('legacy scalar still resolves (fallback preserved)',
    f({ id: 'p1', linkedFhaId: 'fha-2' }) === 'Catastrophic');
  check('no links → null (unchanged)', f({ id: 'p1' }) === null);
}

// ---- [D4] structure-change staleness hits the real generators --------------
console.log('\n[D4] _markStructureChangeObsolete — the ids the generators emit');
{
  const sb = { console, Object, String, Array };
  sb.acReqData = [
    { id: 'r1', reqSource: { generator: 'gate-indep-and' } },
    { id: 'r2', reqSource: { generator: 'gate-indep-phys' } },
    { id: 'r3', reqSource: { generator: 'fha-prob' } },
    { id: 'r4', reqSource: { generator: 'fha-dal' } },
    { id: 'r5', reqSource: { generator: 'fta-event' } },
    { id: 'r6', reqSource: { generator: 'fta-interval' } },
    { id: 'r7', reqSource: { generator: 'dalgebra-default' } },
    { id: 'r8', reqSource: { generator: 'zsa-separation' } },   // NOT structure-dependent
    { id: 'r9', reqSource: { generator: 'pra-zonal' } },        // NOT structure-dependent
    { id: 'r10', reqSource: { generator: 'fcim-monitor' } },    // NOT structure-dependent
  ];
  sb.systemsData = [];
  vm.createContext(sb);
  vm.runInContext(extractFn(miscFn, '_markStructureChangeObsolete'), sb);
  const touched = vm.runInContext('_markStructureChangeObsolete("test edit")', sb);
  const stale = id => sb.acReqData.find(r => r.id === id).reqSource.stale === true;
  check('all seven structure-dependent families flagged (was: gate-indep-*, fha-prob, fha-dal NEVER flagged)',
    touched === 7 && ['r1','r2','r3','r4','r5','r6','r7'].every(stale), 'touched=' + touched);
  check('zonal / PRA / FCIM-monitor requirements untouched — their targets do not ride the tree',
    ['r8','r9','r10'].every(id => !stale(id)));
  const fnText = extractFn(miscFn, '_markStructureChangeObsolete');
  check('the three phantom ids are GONE from the filter',
    !/'gate-independence'/.test(fnText) && !/!== 'fha'/.test(fnText) && !/'fha-quant'/.test(fnText) && !/'fha-similarity'/.test(fnText));
}

// ---- [D5] CMA gate refs resolve BOTH halves --------------------------------
console.log('\n[D5] CMA linkedGateIds — pageId:nodeId, node half resolved');
{
  const sb = sandbox();
  vm.runInContext('function findNode(n, id){ if(!n) return null; if(n.id === id) return n; for(const c of (n.children||[])){ const h = findNode(c, id); if(h) return h; } return null; }', sb);
  sb.ftaPages.push({ id: 7, name: 'FCS Pitch', root: { id: 1, children: [{ id: 2, children: [] }] } });
  sb.cmaData.push({ internalId: 'c1', cmaId: 'CMA-OK',   linkedGateIds: ['7:2'] });
  sb.cmaData.push({ internalId: 'c2', cmaId: 'CMA-NODE', linkedGateIds: ['7:99'] });  // page alive, gate deleted
  sb.cmaData.push({ internalId: 'c3', cmaId: 'CMA-PAGE', linkedGateIds: ['404:1'] });
  const d = dangles(sb, /^CMA /);
  check('live page + live node — clean', !d.some(x => x.where === 'CMA CMA-OK'));
  check('deleted node on a live page is DANGLING (the previously invisible case)',
    d.some(x => x.where === 'CMA CMA-NODE' && /node unresolved/.test(x.detail)), JSON.stringify(d));
  check('dead page still reported', d.some(x => x.where === 'CMA CMA-PAGE' && /page unresolved/.test(x.detail)));
}
{
  // Degradation: without the tree module (no findNode), the page half still runs.
  const sb = sandbox();
  sb.ftaPages.push({ id: 7, name: 'FCS Pitch', root: { id: 1, children: [] } });
  sb.cmaData.push({ internalId: 'c1', cmaId: 'CMA-X', linkedGateIds: ['7:99'] });
  let d = null;
  try { d = dangles(sb, /^CMA /); } catch (e) { d = e; }
  check('no findNode in scope → sweep degrades to the page half, never throws',
    Array.isArray(d) && !d.some(x => x.where === 'CMA CMA-X'), String(d));
}

// ---- [D6] AI-filed comments are the AI's, visibly --------------------------
console.log('\n[D6] AI comment attribution — authorName honest, badge rendered');
{
  const stamps = (ai.match(/c\.filedBy = c\.authorName; c\.authorName = 'ANEM \(AI\)';/g) || []).length +
                 (ai.match(/reply\.filedBy = reply\.authorName; reply\.authorName = 'ANEM \(AI\)';/g) || []).length;
  // SIX since 2 Sep 2026: the HF lane drafters file a PROVENANCE comment for the one
  // lane with no free-text column (Human Error Analysis — its eight are all load-bearing),
  // so an accepted row there can still be traced back to the sentence it was drafted
  // from. It deposits like the other five and is attributed like them.
  check('all SIX deposit lanes re-author to ANEM (AI) with the human kept in filedBy (req.recommend, arch.recommend, comment.resolve, doc.review, hf.improve, hf.draftlane)',
    stamps === 6, 'found ' + stamps);
  check('every re-author sits beside the aiGenerated stamp (additive provenance intact)',
    (ai.match(/aiGenerated = true/g) || []).length === 6);

  const sb = { console, Object, String, Array, Math, Date };
  sb.esc = s2 => String(s2 == null ? '' : s2);
  sb.Review = { relTime: () => 'now' };
  vm.createContext(sb);
  vm.runInContext(extractFn(miscFn, '_renderReviewComment'), sb);
  const render = c => vm.runInContext('_renderReviewComment(' + JSON.stringify(c) + ', 0)', sb);
  const aiHtml = render({ commentId: 'c1', authorName: 'ANEM (AI)', aiGenerated: true, aiModel: 'claude-x', filedBy: 'Waqas', timestamp: 1, text: 'finding', status: 'open' });
  check('renderer badges an AI comment and names who filed it',
    /review-comment-ai-badge/.test(aiHtml) && />AI</.test(aiHtml) && /filed by Waqas/.test(aiHtml));
  const humanHtml = render({ commentId: 'c2', authorName: 'Waqas', timestamp: 1, text: 'note', status: 'open' });
  check('a human comment renders with NO badge — the badge means something',
    !/review-comment-ai-badge/.test(humanHtml) && !/filed by/.test(humanHtml));
}

// ---- [plural] acTraces[] and linkedFhaIds[] swept --------------------------
console.log('\n[plural] legacy-scalar sweeps read the array forms');
{
  const sb = sandbox();
  sb.acFhaData.push({ internalId: 'ac-1', fcId: 'FC-1', severity: 'Catastrophic' });
  sb.systemsData.push({ id: 's1', name: 'FCS', fha: [
    { internalId: 'sf-1', fcId: 'SFC-1', acTraces: ['ac-1'] },        // plural, resolves
    { internalId: 'sf-2', fcId: 'SFC-2', acTraces: ['ac-GONE'] },     // plural, dead — was invisible
    { internalId: 'sf-3', fcId: 'SFC-3', acTrace: 'ac-GONE-2' },      // scalar, dead — the old path
  ], req: [], functions: [] });
  const d = sb.gtIntegrity();
  check('a dead acTraces[] entry is DANGLING (was swept only via the scalar)',
    d.dangling.some(x => x.ref === 'ac-GONE'), JSON.stringify(d.dangling.slice(0, 4)));
  check('the legacy scalar path still reports', d.dangling.some(x => x.ref === 'ac-GONE-2'));
  check('AC FHA traced via acTraces[] is NOT an orphan (hasSfha reads the plural)',
    !d.orphans.some(x => x.where === 'AC FHA' && x.ref === 'FC-1'), JSON.stringify(d.orphans.slice(0, 4)));
}
{
  const sb = sandbox();
  sb.acFhaData.push({ internalId: 'ac-2', fcId: 'FC-2', severity: 'Major' });
  sb.ftaPages.push({ id: 1, name: 'T1', root: { id: 1, children: [] }, linkedFhaIds: ['ac-2'] });
  sb.ftaPages.push({ id: 2, name: 'T2', root: { id: 1, children: [] }, linkedFhaIds: ['ac-GONE'] });
  const d = sb.gtIntegrity();
  check('a dead page linkedFhaIds[] entry is DANGLING (seeded pages carry ONLY the plural)',
    d.dangling.some(x => x.where === 'Tree T2' && x.ref === 'ac-GONE'), JSON.stringify(d.dangling.slice(0, 4)));
  check('a live plural link is clean AND counts as the FHA\'s tree (no orphan)',
    !d.dangling.some(x => x.where === 'Tree T1') && !d.orphans.some(x => x.where === 'AC FHA' && x.ref === 'FC-2'));
}

// ---- [J3307] one provenance story ------------------------------------------
console.log('\n[J3307] Program Planning catalogue cites the standard the engine cites');
{
  check('program_plan.js stpa entry cites SAE J3307', /std: 'SAE J3307/.test(progPlan));
  check('"STPA Handbook" is gone from program_plan.js as a std value', !/std: 'STPA Handbook/.test(progPlan));
}

// ---- [pins] cache-busts moved with the edits (floors, not literals — §7.3) -
console.log('\n[pins] index.html + ai_loader carry the batch');
{
  const floor = (src, file, min) => {
    const m = src.match(new RegExp(file.replace('.', '\\.') + '\\?v=([0-9.]+)'));
    if (!m) return false;
    const [maj, min2] = m[1].split('.').map(Number);
    const [fmaj, fmin] = String(min).split('.').map(Number);
    return maj > fmaj || (maj === fmaj && min2 >= fmin);
  };
  check('data_ops_modules >= 66.7', floor(html, 'data_ops_modules.js', '66.7'));
  check('gt_integrity >= 1.5', floor(html, 'gt_integrity.js', '1.5'));
  check('assurance_modules >= 1.19', floor(html, 'assurance_modules.js', '1.19'));
  check('misc_fn_modules >= 66.27', floor(html, 'misc_fn_modules.js', '66.27'));
  check('program_plan >= 1.4', floor(html, 'program_plan.js', '1.4'));
  check('ai_loader >= 5.4', floor(html, 'ai_loader.js', '5.4'));
  check('ai_loader FILES carries ai_assistant >= 72.4', floor(loader, 'ai_assistant.js', '72.4'));
}

console.log('\n' + (fail ? 'FAIL' : 'PASS') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
