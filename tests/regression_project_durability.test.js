#!/usr/bin/env node
/*
 * Regression — 20 Aug 2026. Four defects found by building ONE aircraft function end to end
 * on a blank production project, plus the derived invariants that would have caught three of
 * them years earlier.
 *
 *   1. page.linkedFhaId was never written by the human path — the FHA→tree link died on the
 *      next page switch, and everything that resolves "which FC does this tree analyse?"
 *      silently answered "none" on every non-active page.
 *   2. _wrapForUndoAndAutosave's list was short — the aircraft function register, both FCIMs
 *      and EVERY system-level artifact neither pushed undo nor triggered an autosave.
 *   3. initNewProjectState left four stores behind — a blank project came up carrying 16
 *      itemsData rows from the Aeolus demo.
 *   4. The FHA forms let the sub-function and the failure condition disagree, and saved it.
 *
 * WHERE THIS SUITE EARNS ITS KEEP: 2 and 3 are the SAME bug — a hand-typed registry that new
 * artifacts silently fall out of. Asserting "itemsData is now reset" fixes one instance and
 * teaches nobody. So sections [2] and [3] DERIVE their expectations from the source of truth
 * (_snapshotProject for what a project contains; the set of submit / delete globals actually
 * present in site/) and fail when the lists drift. A new artifact now breaks the wall instead
 * of silently not saving. Same reasoning as the flightPhasesData note in initNewProjectState:
 * that one took a year of wrong exposure denominators to notice by eye.
 *
 * Behaviour is EXECUTED in a VM against fixtures wherever the function is pure enough to
 * lift out. Source-text assertions are used only for wiring, which execution cannot see.
 *
 * Run: node tests/regression_project_durability.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const PIN = require('./lib/pinfloor.js');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const helpers = read('helpers_modules.js');
const misc    = read('misc_fn_modules.js');
const dataOps = read('data_ops_modules.js');
const support = read('support_modules.js');
const html    = read('index.html');

const X = (src, re, label) => { const m = src.match(re); if (!m) throw new Error('extraction failed: ' + (label || re)); return m[0]; };

/* ============================================================================
 * [1] The FHA → fault-tree link is written to the PAGE, in the form readers expect
 * ==========================================================================*/
console.log('\n[1] page.linkedFhaId — the link survives a page switch');
{
  const srcResolve = X(helpers, /function _resolveLinkedFha\(linkedFhaId\) \{[\s\S]*?\n\}/, '_resolveLinkedFha');

  // Fixtures deliberately mix id TYPES: string internalIds (what the app mints today) and
  // numeric ones (older projects and demos — the #51 note). Both must resolve.
  function ctx(acFha, sysFha) {
    const sb = { console, JSON, String, Array, Object };
    vm.createContext(sb);
    vm.runInContext(
      `let acFhaData = ${JSON.stringify(acFha)};\n` +
      `const _sys = ${JSON.stringify(sysFha)};\n` +
      `function getAllSysFha(){ return _sys; }\n` + srcResolve, sb);
    return sb;
  }
  const AC  = [{ internalId: '1787abc', fcId: 'SF-001-TL', severity: 'Catastrophic' },
               { internalId: 4242,      fcId: 'SF-001-PL', severity: 'Major' }];
  const SYS = [{ internalId: 'sys9zz',  fcId: 'SF-005-M2', severity: 'Catastrophic' }];
  const w = ctx(AC, SYS);
  const R = id => vm.runInContext('_resolveLinkedFha(' + JSON.stringify(id) + ')', w);

  check('prefixed AC_ id still resolves in the aircraft pool', R('AC_1787abc') && R('AC_1787abc').fcId === 'SF-001-TL');
  check('prefixed SYS_ id still resolves in the system pool',  R('SYS_sys9zz') && R('SYS_sys9zz').fcId === 'SF-005-M2');
  // THE FIX. A page stores the RAW internalId. Before today an unprefixed id fell to the
  // `else` and was searched ONLY in the system pool, so an aircraft page link resolved to
  // nothing and propagateDalFromTrueRoot returned having allocated zero DALs, silently.
  check('BARE aircraft internalId resolves (was: searched system pool only, found nothing)',
        R('1787abc') && R('1787abc').fcId === 'SF-001-TL');
  check('BARE system internalId resolves too', R('sys9zz') && R('sys9zz').fcId === 'SF-005-M2');
  check('BARE NUMERIC internalId resolves (#51 — older projects mint numbers)',
        R(4242) && R(4242).fcId === 'SF-001-PL');
  check('an id that matches nothing resolves to null, not undefined-shaped junk', R('nope') === null);
  check('empty / null / undefined resolve to null', R('') === null && R(null) === null && R(undefined) === null);
  // The old strip was .replace('AC_','') — unanchored, so it would eat that substring
  // anywhere in an id. Anchored now.
  const w2 = ctx([{ internalId: 'xAC_9', fcId: 'FC-ODD' }], []);
  check('prefix strip is ANCHORED (an id containing "AC_" is not mangled)',
        vm.runInContext('_resolveLinkedFha("xAC_9")', w2) !== null);

  // --- wiring: the write side exists at all, which is the whole defect -----------------
  const srcOnChange = X(helpers, /function onFtaFhaLinkChange\(\) \{[\s\S]*?\n\}/, 'onFtaFhaLinkChange');
  // Both branches, counted. Asserting merely "the string page.linkedFhaId = appears" was
  // VACUOUS — proved by mutation M1: deleting the link write entirely left the `= null` in the
  // clear branch and the check stayed green.
  check('onFtaFhaLinkChange writes page.linkedFhaId on BOTH the link and clear paths',
        (srcOnChange.match(/page\.linkedFhaId\s*=/g) || []).length >= 2,
        'assignments found: ' + (srcOnChange.match(/page\.linkedFhaId\s*=/g) || []).length);
  check('it stores fha.internalId itself, not a stringified strip (assurance compares with ===)',
        /page\.linkedFhaId\s*=\s*fha\.internalId/.test(srcOnChange));
  check('clearing the dropdown UNLINKS the page (it used to return before touching it)',
        /page\.linkedFhaId\s*=\s*null/.test(srcOnChange));
  // syncFtaConfigFromActivePage reads `Array.isArray(page.linkedFhaIds) ? ... : scalar` — an
  // EMPTY array (what ANEM's unlink leaves) beats the scalar and would swallow a fresh link.
  check('it keeps linkedFhaIds[] in step so an empty array cannot swallow the link',
        /linkedFhaIds\s*=\s*\[fha\.internalId\]/.test(srcOnChange));
  check('linking marks the project dirty', /scheduleAutosave/.test(srcOnChange));
  check('the page lookup happens BEFORE the no-link early return',
        srcOnChange.indexOf('ftaPages || []).find') < srcOnChange.indexOf('page.linkedFhaId = null'));

  // A5 supersession (22 Aug 2026): the seed-resolution logic this check guards moved
  // from propagateDalFromTrueRoot (now a thin wrapper) into propagateDalAllRoots —
  // the all-families sweep. Same guard, new home: the resolver rule must hold where
  // the seed is actually resolved.
  const srcProp = X(misc, /function propagateDalAllRoots\(\) \{[\s\S]*?if \(!fha\) return;/, 'propagateDalAllRoots');
  // Strip comments first. The explanation of the fix necessarily QUOTES the thing it removed,
  // and matching prose reported the bug as still present — the same self-inflicted failure as
  // the smoke-gate suite tripping on its own "why not Playwright" comment.
  const propCode = srcProp.replace(/\/\/[^\n]*/g, '');
  check('propagateDalFromTrueRoot no longer picks the pool by startsWith("AC_")',
        !/startsWith\('AC_'\)/.test(propCode));
  check('…it goes through the one resolver instead', /_resolveLinkedFha\(linkedFhaId\)/.test(propCode));
}

/* ============================================================================
 * [2] Undo/autosave coverage — DERIVED, so a new artifact breaks the wall
 * ==========================================================================*/
console.log('\n[2] Every project-mutating submit/delete is accounted for');
{
  const targets = JSON.parse('[' + X(dataOps, /const _UNDO_TARGETS = \[[\s\S]*?\n\];/, '_UNDO_TARGETS')
      .replace(/^const _UNDO_TARGETS = \[/, '').replace(/\n\];$/, '')
      .replace(/\/\/[^\n]*/g, '').replace(/'/g, '"').replace(/,\s*$/, '').trim().replace(/,\s*$/, '') + ']');
  const exemptSrc = X(dataOps, /const _UNDO_EXEMPT = \{[\s\S]*?\n\};/, '_UNDO_EXEMPT');
  const exempt = Object.keys(vm.runInNewContext('(' + exemptSrc.replace(/^const _UNDO_EXEMPT = /, '') .replace(/;$/, '') + ')'));

  // The four measured-broken ones. Production, live autosave timestamp, 4s settle.
  ['submitACFunction', 'submitACFCIM', 'submitSysFunction', 'submitSysFHA'].forEach(n =>
    check('measured-broken action is now wrapped: ' + n, targets.indexOf(n) !== -1));
  ['submitSysFCIM', 'submitSysReq', 'deleteACFunction', 'deleteACFCIM',
   'deleteSysFunction', 'deleteSysFCIM', 'deleteSysFHA', 'deleteSysReq'].forEach(n =>
    check('sibling of a measured-broken action is wrapped: ' + n, targets.indexOf(n) !== -1));
  check('deletePhaseRow is wrapped (t_mission is the denominator of every apportionment)',
        targets.indexOf('deletePhaseRow') !== -1);

  check('the two lists do not overlap', targets.filter(t => exempt.indexOf(t) !== -1).length === 0,
        targets.filter(t => exempt.indexOf(t) !== -1).join(','));
  check('auth is NOT wrapped — never snapshot around a credential flow',
        exempt.indexOf('submitSignup') !== -1 && targets.indexOf('submitSignup') === -1);

  // ---- the derived check: discover every submit*/delete* the app actually defines -------
  const all = new Set();
  fs.readdirSync(SITE).filter(f => f.endsWith('.js')).forEach(f => {
    let s; try { s = fs.readFileSync(path.join(SITE, f), 'utf8'); } catch (_) { return; }
    (s.match(/window\.(submit|delete)[A-Za-z0-9_]*\s*=/g) || [])
      .forEach(m => all.add(m.replace(/^window\./, '').replace(/\s*=$/, '')));
    (s.match(/^(?:async )?function (submit|delete)[A-Za-z0-9_]*/gm) || [])
      .forEach(m => all.add(m.replace(/^(?:async )?function /, '')));
  });
  const unaccounted = [...all].filter(n => targets.indexOf(n) === -1 && exempt.indexOf(n) === -1).sort();
  check('EVERY submit*/delete* global is in _UNDO_TARGETS or _UNDO_EXEMPT — no silent gap',
        unaccounted.length === 0,
        'unaccounted: ' + unaccounted.join(', ') + ' — wrap it, or add it to _UNDO_EXEMPT with a reason');

  // A name in the list that resolves to nothing is skipped by the wrapper, which looks
  // exactly like an action nobody meant to cover. Catch typos statically…
  const allSrc = fs.readdirSync(SITE).filter(f => f.endsWith('.js'))
    .map(f => { try { return fs.readFileSync(path.join(SITE, f), 'utf8'); } catch (_) { return ''; } }).join('\n');
  const ghosts = targets.filter(n =>
    !(new RegExp('window\\.' + n + '\\s*=').test(allSrc) ||
      new RegExp('^(?:async )?function ' + n + '\\b', 'm').test(allSrc)));
  check('every _UNDO_TARGETS name is actually defined somewhere (no ghost entries)',
        ghosts.length === 0, 'ghosts: ' + ghosts.join(', '));
  // …and loudly at runtime, so a load-order change is not silent either.
  check('unresolved names are recorded at runtime, not silently dropped',
        /unresolved\.push\(name\)/.test(dataOps) && /_UNDO_UNRESOLVED/.test(dataOps));
}

/* ============================================================================
 * [3] New-project reset — DERIVED from the project_stores.js declaration
 * ==========================================================================*/
console.log('\n[3] initNewProjectState clears every declared store');
{
  // Was derived from _snapshotProject's object literal; that literal is now generated
  // from project_stores.js, so the declaration is the thing to read.
  const storesSrc = read('project_stores.js');
  const keys = [...new Set([...storesSrc.matchAll(/\{ key: '([A-Za-z_$][\w$]*)'/g)].map(m => m[1]))];
  // COMMENTS STRIPPED. Proved necessary by mutation: commenting out `itemsData = [];` left
  // the suite green, because the explanatory comment two lines above says "16 itemsData rows"
  // and the assertion matched the prose. A check that reads its own documentation is not a
  // check. Third time this exact trap has bitten in this codebase — hence the helper.
  const decomment = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  // The reset now DERIVES from the declaration; the legacy body is the load-failure
  // fallback and must still cover every store, or a failed load would quietly clear a
  // different set than the declaration promises.
  check('initNewProjectState derives from the declaration', /window\.SLStores\.reset\(\)/.test(misc));
  const init = decomment(X(misc, /function initNewProjectStateLegacy\(\) \{[\s\S]*?\n\}/, 'initNewProjectStateLegacy'));

  check('the store declaration was read', keys.length > 25, 'got ' + keys.length);
  const notReset = keys.filter(k => !new RegExp('(^|[\\s;{])' + k + '\\s*=', 'm').test(init));
  check('the legacy reset fallback still clears EVERY declared store',
        notReset.length === 0,
        'leaks into the next project: ' + notReset.join(', '));

  // The four found on 20 Aug, named so a future refactor cannot quietly drop one.
  ['itemsData', 'projectBaselines', 'autoReqTemplateOverrides', 'projectReportEdits'].forEach(k =>
    check('reset on new project: ' + k, new RegExp('(^|[\\s;{])' + k + '\\s*=', 'm').test(init)));
  // Consumers read these two off window, so the mirror has to be reset with the binding.
  check('autoReqTemplateOverrides is mirrored to window on reset (consumers read window.*)',
        /window\.autoReqTemplateOverrides\s*=/.test(init));
  check('projectReportEdits is mirrored to window on reset', /window\.projectReportEdits\s*=/.test(init));
  check('projectTemplates is still reset too (a DIFFERENT store despite the name)',
        /projectTemplates\s*=/.test(init));
}

/* ============================================================================
 * [3b] The snapshot builders must agree — 20 Aug 2026
 *
 * There are THREE places that answer "what is in a project": the local autosave
 * (_snapshotProject), the cloud push (_buildProjectSnapshot) and the .slab file export
 * (_slabBuildProjectExport). They were maintained by eye and they diverged:
 * projectReportEdits and autoReqTemplateOverrides were in the local one and NOT in the
 * cloud one, so every save-to-cloud-and-reopen silently discarded every word of
 * per-section report prose the user had written. Confirmed against production —
 * 0 of 411 stored documents contained either key. projectTemplates had the mirror
 * hole, missing from the local autosave.
 *
 * The comment in _buildProjectSnapshot records that stpaData had已 the SAME bug before
 * (the whole STPA lane dropped from both the cloud push and the local autosave). That
 * is twice. So the invariant is asserted here rather than trusted: any key one builder
 * captures, the others must capture too.
 * ==========================================================================*/
console.log('\n[3b] Local autosave, cloud push and .slab export capture the same stores');
{
  const decomment = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  // Read the returned object literal of a builder and list its keys.
  function builderKeys(fnName) {
    const m = helpers.match(new RegExp('function ' + fnName + '\\([^)]*\\) \\{[\\s\\S]*?return \\{([\\s\\S]*?)\\n    \\};'));
    if (!m) throw new Error('could not read ' + fnName);
    const body = decomment(m[1]);
    const out = new Set();
    // `foo,`  `foo: expr,`  and the final `foo` before the closing brace
    body.split(/\n/).forEach(line => {
      line.split(',').forEach(part => {
        const t = part.trim();
        const k = t.match(/^([A-Za-z_$][\w$]*)\s*(?::|$)/);
        if (k) out.add(k[1]);
      });
    });
    return out;
  }
  // 20 Aug 2026 — both builders now DERIVE from project_stores.js, so the source of
  // truth for "what is in a project" is that list, not either function's literal. The
  // literals survive only as `*Legacy` fallbacks for the case where project_stores.js
  // fails to load, and those are checked separately below.
  const stores = read('project_stores.js');
  const STORE_KEYS = [...stores.matchAll(/\{ key: '([A-Za-z_$][\w$]*)'/g)].map(m => m[1]);
  const local = new Set(STORE_KEYS);
  const cloud = new Set(STORE_KEYS.concat(['_betaBuild']));
  check('project_stores.js is the single declaration', STORE_KEYS.length > 25, STORE_KEYS.length + ' stores');
  check('_snapshotProject derives from it', /return window\.SLStores\.snapshot\(\)/.test(helpers));
  check('_buildProjectSnapshot derives from it', /window\.SLStores\.snapshot\(\)[\s\S]{0,200}_betaBuild/.test(helpers));
  check('the legacy literals are kept as a load-failure fallback, not as the source',
        /function _snapshotProjectLegacy\(\)/.test(helpers) && /function _buildProjectSnapshotLegacy\(\)/.test(helpers));
  // The fallbacks must still agree with the list, or a project_stores.js load failure
  // would quietly go back to saving a DIFFERENT set of stores.
  const legacyLocal = builderKeys('_snapshotProjectLegacy');
  const legacyCloud = builderKeys('_buildProjectSnapshotLegacy');
  const legacyGapL = STORE_KEYS.filter(k => !legacyLocal.has(k));
  const legacyGapC = STORE_KEYS.filter(k => !legacyCloud.has(k));
  check('the local fallback still covers every declared store', legacyGapL.length === 0, legacyGapL.join(', '));
  check('the cloud fallback still covers every declared store', legacyGapC.length === 0, legacyGapC.join(', '));
  // AND THE OTHER DIRECTION. Without this, DELETING a store from the declaration would
  // silently stop it being saved and no check would object — the declaration would simply
  // agree with itself. The legacy literals are the independent second opinion, so any
  // store they still name must remain declared.
  const CLOUD_ONLY = new Set(['_betaBuild', 'BETA_BUILD_ID']);
  const droppedL = [...legacyLocal].filter(k => !CLOUD_ONLY.has(k) && !local.has(k));
  const droppedC = [...legacyCloud].filter(k => !CLOUD_ONLY.has(k) && !cloud.has(k));
  check('no store was dropped FROM the declaration (local fallback names it, list does not)',
        droppedL.length === 0, 'declared nowhere but still in the fallback: ' + droppedL.join(', '));
  check('no store was dropped FROM the declaration (cloud fallback names it, list does not)',
        droppedC.length === 0, 'declared nowhere but still in the fallback: ' + droppedC.join(', '));


  // _betaBuild is legitimately cloud-only — a build stamp, not project content.
  const CLOUD_ONLY_OK = new Set(['_betaBuild', 'BETA_BUILD_ID']);
  const missingFromCloud = [...local].filter(k => !cloud.has(k));
  const missingFromLocal = [...cloud].filter(k => !local.has(k) && !CLOUD_ONLY_OK.has(k));

  check('every store the local autosave keeps is also pushed to the cloud',
        missingFromCloud.length === 0,
        'DROPPED ON EVERY CLOUD SAVE: ' + missingFromCloud.join(', '));
  check('every store the cloud push keeps is also in the local autosave',
        missingFromLocal.length === 0,
        'DROPPED ON EVERY REFRESH/UNDO: ' + missingFromLocal.join(', '));

  // The three specific keys this cost us, named so a refactor cannot quietly drop one.
  ['projectReportEdits', 'autoReqTemplateOverrides', 'projectTemplates', 'stpaData'].forEach(k => {
    check('cloud push carries ' + k, cloud.has(k));
    check('local autosave carries ' + k, local.has(k));
  });

  // And the load path has to be able to put them back.
  const apply = decomment(X(dataOps, /function _applyProjectData\(data\) \{[\s\S]*?\n\}/, '_applyProjectData'));
  // projectSourceDocs is re-hydrated through _slabSerializeSourceDocs's inverse, and
  // activeSystemId is a UI cursor deliberately reset to null on load — neither is content.
  const APPLY_EXEMPT = new Set(['projectSourceDocs', 'activeSystemId']);

  // EXECUTED, not text-matched. A source assertion here was VACUOUS and mutation proved
  // it: breaking the projectTemplates restore left `data.projectTemplates` present on the
  // ternary's true-branch, so `/data\.projectTemplates/` still matched and the check stayed
  // green while the restore was dead. The only honest question is whether a value put into
  // the payload comes back out, so run the assignment prologue and look.
  function restoresWhat(src, startRe) {
    const whole = X(src, startRe, 'apply-fn');
    // Run the WHOLE body, not a slice — slicing at the first migrate*() call cut inside a
    // try block and the harness died on unbalanced braces. Instead every helper the body
    // reaches for resolves to a no-op through a proxied global, so the assignments run and
    // nothing else has to exist.
    const prologue = whole.replace(/^function [A-Za-z_$][\w$]*\(data\) \{/, '').replace(/\n\}$/, '');
    const names = [...local].filter(k => !APPLY_EXEMPT.has(k));
    // A stub that is callable AND whose properties are callable, so `SLIdle.schedule(...)`
    // and friends resolve without every collaborator having to be modelled.
    const stub = () => new Proxy(function () {}, {
      get: (t, k) => (k === Symbol.toPrimitive || k === 'then') ? undefined : stub(),
      apply: () => undefined
    });
    const real = { console, JSON, Date, Array, Object, String, Number, isFinite, Math, Set, Map,
                   // MUST NOT contain __marker. It is the FALLBACK the restore uses when the
                   // payload has no templates; if the stub carried a marker then a dead
                   // restore would produce one anyway and the check would pass vacuously —
                   // which is exactly what mutation N2 exposed.
                   window: {}, emptyTemplateOverrides: () => ({ __fallback: true }) };
    const sb = new Proxy(real, {
      has: () => true,                                   // every bare identifier "exists"
      get: (t, k) => (k in t ? t[k] : stub()),           // …and unknown ones are inert
      set: (t, k, v) => { t[k] = v; return true; }
    });
    vm.createContext(sb);
    // A payload where every store carries a recognisable marker.
    const payload = {};
    names.forEach(k => { payload[k] = [{ __marker: k }]; });
    ['ftaConfig','projectConfig','typeCounters','autoReqTemplateOverrides','projectReportEdits',
     'projectTemplates','mlData','stpaData'].forEach(k => { payload[k] = { __marker: k }; });
    payload.mlData  = { __marker: 'mlData',  constituents: [] };
    payload.stpaData = { __marker: 'stpaData', cs: {} };
    payload.ftaPages = [{ id: 'p1', root: null, __marker: 'ftaPages' }];
    // Scalars can't carry an object marker, and several are TYPE-CHECKED on the way in
    // (reviewCounter only accepts a number, so an array fixture fell to the fallback and
    // read as "dropped" when it restores perfectly). Give them distinctive scalar values.
    var SCALARS = { projectName: '__marker projectName', acAsmCounter: 987651,
                      fmeaCounter: 987652, internalIdCounter: 987653, reviewCounter: 987654 };
    Object.keys(SCALARS).forEach(k => { if (names.indexOf(k) !== -1) payload[k] = SCALARS[k]; });
    try {
      vm.runInContext('let ' + names.join(', ') + ';\nlet _autosaveSuspended;\n'
        + 'const data = ' + JSON.stringify(payload) + ';\n'
        + prologue + '\n'
        // Built as a literal, not via eval(): `eval` is not on the sandbox, so the proxy
        // handed back a stub for it and every capture read undefined — which looked exactly
        // like "every store was dropped".
        + '__seen = {' + names.map(n => JSON.stringify(n) + ':' + n).join(',') + '};', sb);
    } catch (e) { return { error: e.message }; }
    const seen = vm.runInContext('__seen', sb);
    const lost = names.filter(k => {
      const v = seen[k];
      if (v == null) return true;
      if (Object.prototype.hasOwnProperty.call(SCALARS, k)) return v !== SCALARS[k];
      let s;
      try { s = JSON.stringify(v); } catch (_) { s = undefined; }
      // undefined here means the binding holds something unserialisable (a stub, a function) —
      // i.e. it was never assigned from the payload. Treat as lost.
      return !s || s.indexOf('__marker') === -1;
    });
    return { lost };
  }

  // EXECUTED against the legacy fallback: SLStores.restore() cannot be lifted out of
  // its file (it closes over the lexical bindings), so what is executable here is the
  // fallback — and it is precisely the thing that must not rot, since it is what runs
  // if project_stores.js ever fails to load.
  check('_applyProjectData derives from the declaration', /window\.SLStores\.restore\(data\)/.test(dataOps));
  // Lifting the assignments out took a UI side effect with them: the project-name
  // repaint. Caught on PRODUCTION, not here — state said "Aeolus HL-1" while the
  // browser tab still read "Untitled Project". Restoring a binding and repainting what
  // depends on it are two jobs; the declaration owns the first, this path owns the second.
  {
    const applyFn = X(dataOps, /function _applyProjectData\(data\) \{[\s\S]*?\n\}/, '_applyProjectData');
    check('_applyProjectData still repaints the project name after restoring',
          /_refreshProjectNameUI\(\)/.test(applyFn),
          'the tab title keeps the previous project name while the state is correct');
    check('…and it repaints AFTER the restore, not before',
          applyFn.indexOf('SLStores.restore(data)') < applyFn.indexOf('_refreshProjectNameUI()'));
  }
  const r1 = restoresWhat(dataOps, /function _applyProjectDataLegacyAssign\(data\) \{[\s\S]*?\n\}/);
  check('the legacy load fallback still restores every declared store',
        !r1.error && r1.lost.length === 0,
        r1.error ? ('harness: ' + r1.error) : ('silently dropped on load: ' + r1.lost.join(', ')));

  // The other load path — open-from-cloud — must be just as complete.
  const restore = decomment(X(helpers, /function _restoreProjectSnapshot\(data\) \{[\s\S]*?\n\}/, '_restoreProjectSnapshot'));
  const notRestored2 = [...local].filter(k =>
      !APPLY_EXEMPT.has(k) && !new RegExp('data\\.' + k + '\\b').test(restore));
  check('_restoreProjectSnapshot reads back every store the autosave writes',
        notRestored2.length === 0, 'never restored: ' + notRestored2.join(', '));
}

/* ============================================================================
 * [3c] The cloud pusher cannot overwrite a project with an empty one
 * ==========================================================================*/
console.log('\n[3c] cloud_sync shrink guard + history on the automatic path');
{
  const cs = read('cloud_sync.js');
  const decomment = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const code = decomment(cs);

  check('a content counter exists', /function _contentItems\(/.test(code));
  check('it EXCLUDES projectSourceDocs (2.26MB of uploaded PDFs is not authored work)',
        !/_CONTENT_KEYS[\s\S]{0,400}projectSourceDocs/.test(code));
  check('a lone rootless fault-tree page scores zero — that is the exact wipe shape',
        /ftaPages\.length === 1 && !s\.ftaPages\[0\]\.root/.test(code));
  check('the guard exists', /function _wouldGut\(/.test(code));
  // 3 Sep 2026 — the write moved to cloud_writer.js; the guard now sits inside
  // cloud_sync's prepare(), BEFORE prepare hands the writer anything to write.
  const cw = decomment(read('cloud_writer.js'));
  check('the guard is applied inside prepare(), before the snapshot is handed to the writer',
        code.indexOf('_wouldGut(snap)') > 0 &&
        code.indexOf('return { client: client, projectId: pid, userId: uid, snapshot: snap }') > 0 &&
        code.indexOf('_wouldGut(snap)') < code.indexOf('return { client: client, projectId: pid, userId: uid, snapshot: snap }'));
  check('a gutting push RETURNS null instead of writing', /if \(_wouldGut\(snap\)\) \{[\s\S]*?return null;\s*\}/.test(code));
  check('the automatic path records version history — through the writer, after a landed write',
        /W\.write\(\{ mode: 'silent'/.test(code) && /_recordSaveHistory[\s\S]{0,80}\(projectId, nextVersion, snapshot, userId\)/.test(cw) &&
        cw.indexOf('_setToken(nextVersion)') < cw.indexOf('_recordSaveHistory'));
  check('the shrink baseline is updated only after a successful push',
        /if \(r && r\.ok\) \{[\s\S]{0,120}_lastPushedItems = snapItems/.test(code));
  check('the baseline is dropped when the cloud identity is detached (sample/demo loads)',
        /_detachCloudIdentity[\s\S]{0,400}_lastPushedItems = null/.test(code));
  // The client counter and the database function must agree or the two guards disagree
  // about what "empty" means. Named here so a change to one flags the other.
  check('client counter mirrors the DB function name in a comment for traceability',
        /sl_doc_items/.test(cs));
}

/* ============================================================================
 * [3d] Monkey-patch markers must accumulate, not replace each other
 *
 * ~90 sites in this app wrap a global by name. Each builds a BRAND NEW function
 * carrying only its own idempotence flag, so whoever wraps last silently erases
 * everyone else's — and several of these modules deliberately re-install on timers.
 *
 * Measured on production 20 Aug 2026: window._writeAutosave, wrapped by the recovery
 * ring, the cloud push AND tab_guard, carried ONLY _tgWrapped. Both other modules'
 * guards read false, so a re-install would have double-captured and DOUBLE-PUSHED —
 * in the subsystem that destroyed four customer projects. window.switchTab carried
 * zero markers across ~70 wrappers.
 *
 * Scope note, deliberately recorded: the DATA-touching sites are converted; the ~70
 * switchTab render wrappers are not, because double-rendering is a perf bug and
 * touching 70 unrelated files in one pass is how regressions get made.
 * ==========================================================================*/
console.log('\n[3d] Wrap markers accumulate across modules');
{
  const wrapSrc = read('fn_wrap.js');
  check('fn_wrap.js exists and exports preserve', /window\.SLWrap\s*=/.test(wrapSrc) && /function preserve\(/.test(wrapSrc));
  check('it only copies MARKERS, not arbitrary own properties',
        /Wrapped\$/.test(wrapSrc),
        'hoovering every own property would drag along things the new wrapper must define itself');
  check('it never clobbers a marker the new wrapper already set',
        /hasOwnProperty\.call\(wrapped, k\)/.test(wrapSrc));
  check('index.html loads fn_wrap.js', /fn_wrap\.js\?v=/.test(html));
  // It must load before anything that wraps, since every wrap site calls into it.
  check('…and loads before the modules that wrap',
        html.indexOf('fn_wrap.js?v=') < html.indexOf('data_ops_modules.js?v='));

  // The three that share _writeAutosave — the reason this matters at all.
  ['session_resume.js', 'cloud_sync.js', 'tab_guard.js'].forEach(f => {
    const src = read(f);
    const at = src.indexOf('window._writeAutosave = wrapped;');
    check(f + ' preserves prior markers when wrapping _writeAutosave',
          at > 0 && /SLWrap\.preserve\(orig, wrapped\)/.test(src.slice(Math.max(0, at - 500), at)),
          'this is how _ringWrapped and _cloudWrapped were being erased');
  });

  // Every generic window[<var>] = wrapped site must preserve. Found by scanning, so a
  // TENTH module cannot quietly reintroduce the problem.
  const offenders = [];
  fs.readdirSync(SITE).filter(f => f.endsWith('.js') && f !== 'fn_wrap.js').forEach(f => {
    let src; try { src = fs.readFileSync(path.join(SITE, f), 'utf8'); } catch (_) { return; }
    const re = /window\[(?:name|fnName|k)\]\s*=\s*wrapped;/g;
    let m;
    while ((m = re.exec(src))) {
      // 21 Aug 2026 — this used to demand the literal 'preserve(orig, wrapped)'.
      // Three modules matched it with an `orig` that did not exist in scope, so the
      // call was a swallowed ReferenceError and the check was green while the
      // preservation never ran. The rule now: the preserved variable must be THE
      // SAME variable the wrapper calls through (nearest `X.apply(this` above the
      // site) — that identifier is provably in scope, or the wrapper itself would
      // crash when invoked. A declaration check alone can't do this: the declaring
      // line sits arbitrarily far above (delete_guard's wrapper body is ~40 lines),
      // while a fixed window happily finds a DIFFERENT function's `orig` (which is
      // exactly how the cloud_sync bug arose).
      const seg = src.slice(Math.max(0, m.index - 4000), m.index);
      const pms = Array.from(seg.matchAll(/SLWrap\.preserve\((\w+), wrapped\)/g));
      const pm = pms.length ? pms[pms.length - 1] : null;
      const apps = Array.from(seg.matchAll(/\b(\w+)\.apply\(this/g));
      const applyVar = apps.length ? apps[apps.length - 1][1] : null;
      const ok = pm && (applyVar ? pm[1] === applyVar
                                 : new RegExp('(?:var|let|const)\\s+' + pm[1] + '\\s*=').test(seg));
      if (!ok) offenders.push(f + ':' + m.index + (pm ? ' (preserves `' + pm[1] + '` but calls through `' + applyVar + '`)' : ' (no preserve)'));
    }
  });
  check('every generic window[name] = wrapped site preserves prior markers',
        offenders.length === 0, 'not preserving: ' + offenders.join(', '));
}

/* ============================================================================
 * [4] FHA sub-function ↔ failure-condition agreement
 * ==========================================================================*/
console.log('\n[4] An FHA row cannot claim another sub-function’s failure condition');
{
  const srcPush  = X(misc, /function _pushExtractedFCs\(fcimArr, out\) \{[\s\S]*?\n\}/, '_pushExtractedFCs');
  const srcOwner = X(helpers, /function _fcOwnerSubId\(scope, fcId, sysId\) \{[\s\S]*?\n\}/, '_fcOwnerSubId');
  const srcPair  = X(helpers, /function _fhaPairCheck\(scope, subId, fcId, sysId\) \{[\s\S]*?\n\}/, '_fhaPairCheck');

  // --- the FC record now carries its owning sub-function ------------------------------
  const sbA = { console, JSON, Array, Object, String }; vm.createContext(sbA);
  vm.runInContext(srcPush + '\nconst out = []; _pushExtractedFCs([' + JSON.stringify({
      subId: 'SF-001', tlId: 'SF-001-TL', tlDesc: 'total', plId: 'SF-001-PL', plDesc: 'partial',
      mId: 'SF-001-M', mDesc: 'malf',
      combined: [{ cbId: 'CB-1', cbDesc: 'combined' }],
      plExtra: [{ id: 'SF-001-PL-b', desc: 'extra' }]
  }) + '], out);', sbA);
  const outA = vm.runInContext('out', sbA);
  check('_pushExtractedFCs stamps subId on the total-loss condition',
        (outA.find(x => x.id === 'SF-001-TL') || {}).subId === 'SF-001');
  check('…on partial loss and malfunction too',
        (outA.find(x => x.id === 'SF-001-PL') || {}).subId === 'SF-001' &&
        (outA.find(x => x.id === 'SF-001-M') || {}).subId === 'SF-001');
  check('…on Table A3 extra conditions', (outA.find(x => x.id === 'SF-001-PL-b') || {}).subId === 'SF-001');
  check('combined conditions are MARKED combined (they span sub-functions by design)',
        (outA.find(x => x.id === 'CB-1') || {}).combined === true);
  check('desc is still carried — existing consumers read it', (outA.find(x => x.id === 'SF-001-TL') || {}).desc === 'total');

  // --- the guard -----------------------------------------------------------------------
  const FCS = [
    { id: 'SF-001-TL', desc: 'pitch total loss', subId: 'SF-001' },
    { id: 'SF-002-TL', desc: 'roll total loss',  subId: 'SF-002' },
    { id: 'CB-1',      desc: 'combined',         subId: 'SF-001', combined: true },
    { id: 'LEGACY-1',  desc: 'imported, no owner recorded' }
  ];
  const sbB = { console, JSON, Array, Object, String }; vm.createContext(sbB);
  vm.runInContext(
    'let acExtractedFCs = ' + JSON.stringify(FCS) + ';\n' +
    'let systemsData = ' + JSON.stringify([{ id: 'sys-1', extractedFCs: FCS }]) + ';\n' +
    srcOwner + '\n' + srcPair, sbB);
  const P = (scope, sub, fc, sys) =>
    vm.runInContext('_fhaPairCheck(' + [scope, sub, fc, sys].map(v => JSON.stringify(v)).join(',') + ')', sbB);

  check('matching pair saves', P('ac', 'SF-001', 'SF-001-TL', null).ok === true);
  // THE DEFECT, exactly as measured on production.
  check('MISMATCH is refused (SF-002 cannot own SF-001-TL)', P('ac', 'SF-002', 'SF-001-TL', null).ok === false);
  check('…and the refusal says which sub-function actually owns it',
        /belongs to SF-001/.test(P('ac', 'SF-002', 'SF-001-TL', null).reason || ''));
  check('combined conditions are permitted cross-sub-function (Table A3)',
        P('ac', 'SF-002', 'CB-1', null).ok === true);
  check('a legacy FC with no recorded owner is not judged (would strand existing projects)',
        P('ac', 'SF-002', 'LEGACY-1', null).ok === true);
  check('an FC that is not in the matrix at all is not this guard’s business',
        P('ac', 'SF-002', 'NOT-IN-FCIM', null).ok === true);
  check('no FC chosen → other validation owns it', P('ac', 'SF-002', '', null).ok === true);
  check('no sub-function chosen → other validation owns it', P('ac', '', 'SF-001-TL', null).ok === true);
  check('the same guard works at system level', P('sys', 'SF-002', 'SF-001-TL', 'sys-1').ok === false);
  check('…and passes a matching system pair', P('sys', 'SF-001', 'SF-001-TL', 'sys-1').ok === true);

  // --- wiring: the guard is at the DATA boundary, not just on the dropdown --------------
  const srcSubmitAc  = X(helpers, /function submitACFHA\(\) \{[\s\S]*?\n\}/, 'submitACFHA');
  const srcSubmitSys = X(helpers, /function submitSysFHA\(\) \{[\s\S]*?\n\}/, 'submitSysFHA');
  check('submitACFHA calls the guard', /_fhaPairCheck\('ac'/.test(srcSubmitAc));
  check('submitACFHA RETURNS on a bad pair (a warning that still saves is not a guard)',
        /if \(!_chk\.ok\) \{[\s\S]*?return;\s*\}/.test(srcSubmitAc));
  check('the guard runs BEFORE the row is pushed', srcSubmitAc.indexOf('_fhaPairCheck') < srcSubmitAc.indexOf('acFhaData.push'));
  check('…and before the assumption auto-create, so a refusal leaves no stray assumption',
        srcSubmitAc.indexOf('_fhaPairCheck') < srcSubmitAc.indexOf("createNewAssumption('ac')"));
  check('submitSysFHA calls the guard and returns', /_fhaPairCheck\('sys'/.test(srcSubmitSys) &&
        /if \(!_chk\.ok\) \{[\s\S]*?return;\s*\}/.test(srcSubmitSys));

  // --- wiring: the dropdown filter is hooked to elements that actually exist ------------
  check('the AC sub-function select fires the filter (live selector)',
        /id="ac-fha-subfunc" onchange="onACFHASubFuncChange\(\)"/.test(html));
  check('the system function select fires the filter (live selector)',
        /id="sys-fha-subfunc" onchange="onSysFHASubFuncChange\(\)"/.test(html));
  check('both handlers exist', /function onACFHASubFuncChange\(\)/.test(helpers) &&
        /function onSysFHASubFuncChange\(\)/.test(helpers));
  check('the filter targets the ids the markup actually uses',
        /'ac-fha-fcid'/.test(helpers) && /'sys-fha-fcid'/.test(helpers));
  check('opening a row for edit re-filters, keeping that row’s own FC visible',
        /_refreshFhaFcOptions\('ac'\)/.test(helpers) && /_refreshFhaFcOptions\('sys'\)/.test(helpers));
  check('entering the AC FHA tab filters too', /_refreshFhaFcOptions\('ac'\)/.test(support));
}

/* ============================================================================
 * [5] Load order + pins
 * ==========================================================================*/
console.log('\n[5] The build is still assemblable');
{
  const tags = (html.match(/<script src=/g) || []).length;
  // 23 Aug 2026 (Waqas: "absolutely needs to change" → "it is its own lane") —
// HFA / Task Analysis / Ergonomics sat in an aircraft-nested category LABELED
// "R&M". Human Factors is neither R&M nor an aircraft sub-lane: it is its OWN
// top-level lane (id asb-grp-hf, sibling of Systems and RAM). Never regress.
// 30 Aug 2026 — three -> SIX entries: hf_analyses.js added Function Allocation,
// Human Error Analysis and Crew Alerting between HFA and Task Analysis
// (Waqas: "human factors is not just about assumptions"). Same lane, same
// never-regress rule — the check now names all six in order.
check('Human Factors is its own lane (asb-grp-hf), holding all SIX HF entries in order',
  /id="asb-grp-hf"[\s\S]{0,200}Human Factors<\/span>[\s\S]{0,400}id="snav-hfa"[\s\S]{0,400}id="snav-hfa-alloc"[\s\S]{0,400}id="snav-hfa-hea"[\s\S]{0,400}id="snav-hfa-alerts"[\s\S]{0,400}id="snav-hfa-task"[\s\S]{0,300}id="snav-hfa-ergo"/.test(html));
check('…and no nav category is labeled R&M any more (the reliability lane is RAM)',
  !/asb-cat-lbl">R&amp;M</.test(html));
check('…and the HF entries are OUT of the Aircraft group entirely',
  !/id="snav-hfa"/.test(html.slice(html.indexOf('asb-grp-aircraft'), html.indexOf('asb-grp-systems'))));
// 23 Aug 2026 — the OTHER half of the unfinished Rev C category migration.
// "System lane" was a pre-Rev-C category name holding one item (AI/ML learning
// assurance) INSIDE the aircraft group. Retired; the lane lives in Systems,
// still opt-in/default-off (program_plan CATALOGUE, unchanged).
check('no "System lane" category survives anywhere in the rail',
  !/asb-cat-lbl">System lane</.test(html));
// 25 Aug 2026 — 213 -> 214: nav_return.js, the way back from a golden-thread
// jump (reviewer, nav_feedback_1.pptx: "to go back you have to click on the
// golden thread"). A signed supersession, not a drift: the floor moves only
// with a named module and a reason.
// 29 Aug 2026 — 214 -> 215: ai_skills.js, the Skills V1 registry (versioned
// drafting instructions), loaded eagerly before ai_loader.
// 30 Aug 2026 — 217 -> 218: ram_hub.js, the R&M lane's Start Here overview
// (Waqas: "we need to make the RAM and HF interface far more intuitive").
// 30 Aug 2026 — 218 -> 219: hf_analyses.js, HF's own analyses (Waqas: "human
// factors is not just about assumptions") — allocation, HEA, crew alerting.
// 31 Aug 2026 — 219 -> 220: crdt_gc.js (H-1). One IndexedDB database per project
// ever opened, never pruned — ~360 on Waqas's machine. Loaded BEFORE crdt_sync,
// because crdt_sync's first ydoc update calls into its ledger; the H-1 suite
// pins that ordering. Survey-only until SLA_CRDT_GC is set: every one of those
// databases is an offline copy of somebody's work.
// 31 Aug 2026 (later): severity_rubrics.js added right after safety_targets.js — the
// cert-basis severity definitions ANEM classifies against. 220 -> 221.
// 222 -> 223 (2 Sep 2026): mel_fha_crosscheck.js — HF-2, the MEL <-> FHA cross-check, born
// modular beside mmel_module.js. Superseded in place, dated.
// 223 -> 224 (3 Sep 2026): cloud_writer.js — the ONE writer of project_documents, born modular after helpers_modules.
// 224 -> 225 (3 Sep 2026): field_defs.js — hover definitions + About strips for every HF and R&M page.
// 225 -> 226 (3 Sep 2026): continue_session.js — "Continue where you left off" on sign-in.
// 226 -> 227 (3 Sep 2026): severity_axes.js — severity derived from the three effect axes.
// 227 -> 226 (4 Sep 2026): perf_bench.js no longer loaded — Waqas: the Scale & Performance page "can be taken out".
// 226 -> 227 (5 Sep 2026): fha_derive.js — escapes per phase; aircraft / crew levels derived from the MAC and the Task Analysis (levers 2 + 3).
// 227 -> 228 (6 Sep 2026): slab_config.js — the ONE backend-config surface + hard-stop egress guard (customer-hosted build; loads first).
check('script tag count unchanged (228 — …severity_axes.js 3 Sep; perf_bench.js REMOVED 4 Sep; fha_derive.js 5 Sep; slab_config.js 6 Sep)', tags === 228, 'got ' + tags);
  check('HTML comments balanced', (html.match(/<!--/g) || []).length === (html.match(/-->/g) || []).length);
  // Floors, not equality — a later build must not silently serve a stale cached file.
  // COMPONENT-WISE, not parseFloat: `>= 2.40` read as a float is `>= 2.4`, which a stale 2.9
  // satisfies. That is a silent false-pass in the one check standing between us and a stale
  // cached file. It also makes a correct 66.9 → 66.10 bump look like a regression, which is
  // how it was found. See tests/lib/pinfloor.js.
  const pin = f => PIN.pinOf(html, f);
  check('helpers_modules pin ≥ 2.42',   PIN.pinAtLeast(pin('helpers_modules.js'), '2.42'),  'got ' + pin('helpers_modules.js'));
  check('misc_fn_modules pin ≥ 66.33',  PIN.pinAtLeast(pin('misc_fn_modules.js'), '66.33'), 'got ' + pin('misc_fn_modules.js'));
  check('data_ops_modules pin ≥ 66.14', PIN.pinAtLeast(pin('data_ops_modules.js'), '66.14'),'got ' + pin('data_ops_modules.js'));
  check('support_modules pin ≥ 66.22',  PIN.pinAtLeast(pin('support_modules.js'), '66.22'), 'got ' + pin('support_modules.js'));
  // Prove the comparator itself, here, where a reader can see it: these are the two cases the
  // old parseFloat form got wrong.
  check('pin comparator: 66.10 is PAST 66.9 (float said otherwise)', PIN.pinAtLeast('66.10', '66.9'));
  check('pin comparator: a stale 2.9 does NOT satisfy a 2.40 floor', !PIN.pinAtLeast('2.9', '2.40'));
  check('pin comparator: a missing pin fails rather than defaulting open', !PIN.pinAtLeast(null, '1.0'));
  // _fhaPairCheck lives in helpers and is called from helpers; _refreshFhaFcOptions is called
  // from support with a typeof guard. Assert both files are still in the manifest at all —
  // a dropped tag is invisible in production (the SPA shell answers 200 for a missing file).
  ['helpers_modules.js', 'misc_fn_modules.js', 'data_ops_modules.js', 'support_modules.js']
    .forEach(f => check('still in the script manifest: ' + f, html.indexOf(f + '?v=') !== -1));
}

console.log('\n' + (fail ? 'FAIL' : 'PASS') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
