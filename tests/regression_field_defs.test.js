#!/usr/bin/env node
/**
 * Regression — field_defs.js: every HF and R&M column has a definition on hover,
 * every HF and R&M page has an "About this lane" strip (3 Sep 2026).
 *
 * Waqas: "for other pages a toast pops up with definitions when you hover over a
 * field, we need to add that stuff to all the human factors and RAM analyses".
 *
 * The suite EXECUTES the module in a vm (stub document) and then resolves every
 * column label the real pages render — the hf_analyses schema, the HF register
 * panel and every <th> in the R&M modules — through the real lookup. A column
 * that renders without a definition fails the wall, so a new column cannot ship
 * undefined. Run: node tests/regression_field_defs.test.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
let pass = 0, fail = 0;
function check(name, cond, detail) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); } }

// ---- load the module with a stub DOM ---------------------------------------
const els = [];
const stubEl = () => ({ style: {}, classList: { add() {} }, setAttribute() {}, getAttribute() { return null; }, appendChild() {}, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; }, innerHTML: '', textContent: '' });
const doc = {
  readyState: 'complete', body: stubEl(), head: stubEl(),
  createElement() { const e = stubEl(); els.push(e); return e; },
  querySelectorAll() { return []; }, getElementById() { return null; },
  addEventListener() {}
};
const ctx = { window: {}, document: doc, localStorage: { getItem() { return null; }, setItem() {} }, setTimeout, clearTimeout, console, MutationObserver: function () { return { observe() {} }; }, innerWidth: 1200, innerHeight: 800, Array, Object, String };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(S('field_defs.js'), ctx);
const FD = ctx.SLFieldDefs;
check('module loads with a stub DOM and exports lookup/norm/about', !!(FD && typeof FD.lookup === 'function' && FD.about));

// ---- 1. every HF lane column (the schema is the truth) ----------------------
console.log('\n[1] hf_analyses schema columns');
{
  const src = S('hf_analyses.js');
  const laneRe = /^\s{8}(\w+): \{\n\s+title: '[^']*'[\s\S]*?\n\s+cols: \[([\s\S]*?)\n\s+\]/gm;
  let m, lanes = 0, missing = [];
  const VIEW = { tid: 'view-hfa-tid', tasks: 'view-hfa-task', hea: 'view-hfa-hea', alerts: 'view-hfa-alerts', ergo: 'view-hfa-ergo', cd: 'view-hfa-cd', sa: 'view-hfa-sa', alloc: 'view-hfa-alloc', mfcFactor: 'view-hfa-mfc', mfc: 'view-hfa-mfc' };
  while ((m = laneRe.exec(src))) {
    lanes++;
    const labels = [...m[2].matchAll(/label: '([^']*)'/g)].map(x => x[1]);
    labels.forEach(l => { if (l === '#' || !l.trim()) return; if (!FD.lookup(VIEW[m[1]] || '', l)) missing.push(m[1] + ':' + l); });
  }
  check('all HF lanes scanned (10)', lanes === 10, 'lanes=' + lanes);
  check('every HF lane column resolves to a definition', missing.length === 0, missing.join(', '));
  check('the four Task Analysis columns Waqas asked about are defined', ['Time (s)', 'Basis', 'Channels (HIDH)', 'Credited'].every(l => /./.test(FD.lookup('view-hfa-task', l) || '')));
  check('Response (s) is defined as reaction + execution — the crew response the safety case credits', /reaction \+ execution/.test(FD.lookup('view-hfa-task', 'Response (s)')) && /safety case credits/.test(FD.lookup('view-hfa-task', 'Response (s)')));
  check('Reaction and Execution are engineer-entered, never drafted; Available comes from the mission profile', /the AI never fills it/.test(FD.lookup('view-hfa-task', 'Reaction (s)')) && /the AI never fills it/.test(FD.lookup('view-hfa-task', 'Execution (s)')) && /mission profile/.test(FD.lookup('view-hfa-task', 'Available (s)')) && /80 %/.test(FD.lookup('view-hfa-task', 'Occupancy')));
  check('Channels names the HIDH vocabulary and the 80 % red line', /visual, auditory, cognitive, psychomotor, verbal/.test(FD.lookup('view-hfa-task', 'Channels (HIDH)')) && /80 %/.test(FD.lookup('view-hfa-task', 'Channels (HIDH)')));
}

// ---- 2. HF register panel + every R&M <th> ---------------------------------
console.log('\n[2] rendered <th> labels in the HF register and the R&M modules');
{
  const MODS = { 'hf_register_panel.js': 'view-hfa', 'ram_predict.js': 'view-ram-predict', 'ram_modules.js': 'view-ram-rel', 'fracas_ledger.js': 'view-ram-rel', 'fracas_slas.js': 'view-ram-rel', 'msg3_module.js': 'view-ram-msg3', 'rbd_module.js': 'view-ram-rbd', 'rel_analytics.js': 'view-ram-alloc', 'mx_analytics.js': 'view-ram-mx', 'mmel_module.js': 'view-mmel', 'tol_derate_module.js': 'view-ram-tol', 'budget_ledger.js': 'view-budget', 'ram_settings.js': 'view-ram-settings' };
  const SKIP = new Set(['', 'actions', 'review', '#']);
  let total = 0; const missing = [];
  Object.keys(MODS).forEach(f => {
    const src = S(f);
    const ths = [...src.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(x => x[1]);
    const seen = new Set();
    ths.forEach(raw => {
      let t = raw.replace(/<[^>]+>/g, '').replace(/'\s*\+\s*[^+]*?\+\s*'/g, '').replace(/^'\s*\+\s*'/, '').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\\'/g, "'").replace(/\s+/g, ' ').trim();
      if (t.length > 60 || /\+|\$\{|\bfunction\b/.test(t)) return;   // a template expression, not a label
      const k = FD.norm(t); if (SKIP.has(k) || seen.has(k)) return; seen.add(k); total++;
      // some tables live under several views; accept a hit under any R&M/HF view
      const views = [MODS[f], 'view-ram-rel', 'view-ram-alloc', 'view-ram-weibull', 'view-ram-growth', 'view-ram-pmopt', 'view-ram-lora', 'view-ram-test', 'view-ram-mx', 'view-hfa', ''];
      if (!views.some(v => FD.lookup(v, t))) missing.push(f + ':' + t);
    });
  });
  check('every rendered R&M / register column resolves (' + total + ' distinct labels)', missing.length === 0, missing.join(' | '));
  check('per-view overrides disambiguate reused labels (Level: SA vs LORA)', /Endsley/.test(FD.lookup('view-hfa-sa', 'Level')) && /discard, line/.test(FD.lookup('view-ram-lora', 'Level')));
  check('λ (/h) is "per hour" everywhere except the testability Σλ', /per hour\.$/.test(FD.lookup('view-ram-alloc', 'λ (/h)')) && /Σλ/.test(FD.lookup('view-ram-mx', 'Σλ (/h)')));
}

// ---- 3. an About strip for every HF and R&M view in index.html ---------------
console.log('\n[3] About this lane — one per view');
{
  const idx = S('index.html');
  const views = [...idx.matchAll(/id="(view-(?:hfa|ram)[a-z0-9-]*|view-mmel)"/g)].map(x => x[1]).filter((v, i, a) => a.indexOf(v) === i);
  const missing = views.filter(v => !FD.about[v]);
  check('every HF / R&M view in index.html has an About strip (' + views.length + ' views)', missing.length === 0, missing.join(', '));
  check('the About text says what the AI drafts and what is the engineer\'s, on the Task lane', /AI DRAFTS: phases, crew, task/.test(FD.about['view-hfa-task']) && /YOURS: Reaction, Execution, Basis, Channels/.test(FD.about['view-hfa-task']));
  check('index.html loads field_defs.js after hf_analyses.js', /hf_analyses\.js\?v=[\d.]+" defer><\/script>\s*<script src="field_defs\.js\?v=/.test(idx));
  check('the global glossary stands down while a field definition is up', /if\(window\.__slFieldDefActive\)\{ hide\(\); return; \}/.test(idx));
  check('the popover sits above the glossary popover', /z-index:2147483001/.test(S('field_defs.js')));
  check('a header that carries a native title loses it — the popover absorbs the legend, so one tooltip shows (3 Sep: "why are two of these popping up?")', /el\.setAttribute\('data-def-extra', nt\); el\.removeAttribute\('title'\)/.test(S('field_defs.js')) && /data-def-extra/.test(S('field_defs.js').split('function show(')[1]));
  check('decoration is re-run on render (MutationObserver on the view containers)', /new MutationObserver/.test(S('field_defs.js')) && /VIEW_SEL/.test(S('field_defs.js')));
}

// ---- 4. no internal language on the HF / R&M pages ----------------------------
// Waqas (3 Sep 2026): "it's an analytical tool, not something we should be using
// internal language for — everything should be descriptive and intuitive for the
// user." Invariant ids stay the index on the Thread Integrity page; on the HF and
// R&M pages a finding, a footer or a definition names the check in words.
console.log('\n[4] descriptive, not internal — HF / R&M user-facing text');
{
  const FILES = ['hf_register_panel.js', 'hf_analyses.js', 'hf_severity_badge.js', 'hf_evidence.js', 'fracas_slas.js', 'fracas_ledger.js', 'ram_modules.js', 'rel_analytics.js', 'mx_analytics.js', 'msg3_module.js', 'mmel_module.js', 'ram_predict.js', 'ram_hub.js', 'tol_derate_module.js', 'rbd_module.js', 'ram_settings.js'];
  const CODE = /INV-[A-Z0-9]+|\bHF-\d[a-z]?\b|\bENG-\d\b|\bQ\d\b(?![^<]*—)|\(A\d\)/;
  const offenders = [];
  FILES.forEach(f => {
    S(f).split('\n').forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || /invRegister\(|id: 'INV-|\.id ===|inv\.id|r\.id\b|x\.id\b/.test(t)) return;
      // only string literals reach the screen: look for the code inside quotes
      const strs = t.match(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g) || [];
      strs.forEach(str => { if (CODE.test(str) && !/Q\d — /.test(str)) offenders.push(f + ':' + (i + 1) + ' ' + str.slice(0, 60)); });
    });
  });
  check('no invariant / batch codes in HF or R&M user-facing strings (MSG-3 Q1–Q4 are the standard\'s own numbering and stay)', offenders.length === 0, offenders.slice(0, 6).join(' | '));
  const defsSrc = S('field_defs.js').replace(/\/\/[^\n]*/g, '');
  const defBlock = defsSrc.slice(defsSrc.indexOf('var HF = {'), defsSrc.indexOf('// --------------------------------------------------------------- lookup') > 0 ? defsSrc.indexOf('function norm(') : defsSrc.indexOf('function norm('));
  check('the definitions themselves carry no invariant ids — checks are named in words', !/INV-\d/.test(defBlock));
  check('an invariant id that IS on screen gets its definition from the live registry on hover', /window\._invList/.test(S('field_defs.js')) && typeof FD.invDef === 'function');
  const d = FD.invDef('INV-99');
  check('…and an unregistered id says so instead of inventing a meaning', /not registered/.test(d.def));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
