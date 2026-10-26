#!/usr/bin/env node
/*
 * Regression: the AI wrote rows with nothing in them, across the board; and two smaller AFHA drafting faults. 26 Oct 2026.
 * Found on the live Aeolus run (25 Oct 2026):
 *   - three AFHA rows with no failure condition (FC-002, FC-003, FC-004);
 *   - a function with no sub-function (AF-010 "Protect against fire", SF-025 blank) and an FCIM row for it with every
 *     column empty;
 *   - a drafting turn that came back with no rows counted as returned, and never asked again;
 *   - the judgment-call note on the FHA review panel (and two Human Factors panels) showed "<b style=...>" as text.
 * Waqas: "this bug needs to be cleared across the board". One rule per kind of row (_ROW_RULES) says what it must carry
 * to be a row at all, read in four places, all run here:
 *   [R]  the rule itself, for every kind of row
 *   [B]  the AI's reply: an empty row of any kind never reaches the review panel, and the panel says which were left out
 *   [X]  the executor every accept goes through (review panel, live chat, programmatic accept): nothing empty is
 *        written, for every kind, with the reason; full rows are written as before; an FHA row with only a condition
 *        id takes the FCIM's words; an AI edit that would empty a row is refused
 *   [D]  the function breakdown: a function with no named sub-function is not written (no placeholder "(general)")
 *   [I]  INV-31 on Thread Integrity names the empty AI rows already in a project, for the engineer to delete or redraft
 *   [E]  an empty turn is asked again, then reported as not completed
 *   [N]  panel notes are plain text, **bold** the one emphasis, everything else escaped
 * MUTATION PROOFS (SL_AFHA_MUTATE): rule, filter, gate, fhawriter, fcimwriter, reswriter, decomp, update, inv, empty, bold,
 *   escape: each turns its checks red.
 * Run: node tests/regression_afha_drafting_fixes_20261026.test.js   (the [X] and [I] checks need Playwright + Chromium)
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 700) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_AFHA_MUTATE || '';
const MUTS = {
  rule:      ['ai_assistant.js', "fcim:        { label: 'FCIM row',           need: 'a failure condition (total loss, partial loss or malfunction)', ok: function (x) { return ", "fcim:        { label: 'FCIM row',           need: 'a failure condition (total loss, partial loss or malfunction)', ok: function (x) { return true || "],
  filter:    ['ai_assistant.js', "if (_m) { actions.splice(_i, 1);", "if (false) { actions.splice(_i, 1);"],
  gate:      ['ai_assistant.js', "if (_empty) { results.push({ ok: false, blocked: true, error: 'not written: ' + _empty }); return; }", ""],
  fhawriter: ['ai_assistant.js', "if (!_condText) { _applyFhaSuggestion._last = { action: 'nocondition' }; _toast('Not applied: the drafted row names no failure condition.', 'warning'); return false; }", ""],
  decomp:    ['ai_assistant.js', "const subs = (g.subs || []).filter(function (sub) { return sub && _has(sub.subName); });", "const subs = (g.subs && g.subs.length) ? g.subs : [{ subName: '(general)', subDef: '' }];"],
  update:    ['ai_assistant.js', "if (_m && !(_k && _rowMissing(_k, row))) return { ok: false, blocked: true, error: 'not changed: it would leave ' + _m };", ""],
  fcimwriter:['ai_assistant.js', "if (_refuseEmpty('fcim', s)) return false;", ""],
  reswriter: ['ai_assistant.js', "if (_refuseEmpty('resource', x)) return false;", ""],
  inv:       ['invariants.js',   "if (!_has(f.fcDesc)) fails.push(scope + ' ' + (f.fcId || f.internalId) + ' [AI]: no failure condition' + EMPTY);", ""],
  empty:     ['ai_assistant.js', "if (_slice && _emptyTurn(_a)) {", "if (false) {"],
  bold:      ['ai_assistant.js', ".replace(/\\*\\*([^*]+)\\*\\*/g, '<b>$1</b>'); }", "; }"],
  escape:    ['ai_assistant.js', "function _noteHtml(t) { return _esc(String(t || ''))", "function _noteHtml(t) { return (String(t || ''))"],
};
const mutate = (file, body) => { const m = MUTS[MUT]; return m && file === m[0] ? body.split(m[1]).join(m[2]) : body; };
let ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8'), inv = fs.readFileSync(path.join(SITE, 'invariants.js'), 'utf8');
if (MUT) { const m = MUTS[MUT]; const src = m ? (m[0] === 'invariants.js' ? inv : ai) : ''; if (!m || mutate(m[0], src) === src) { console.log('  FAIL  the mutation ' + MUT + ' found nothing to change'); process.exit(1); } ai = mutate('ai_assistant.js', ai); inv = mutate('invariants.js', inv); }
const cut = (start, endMark) => { const a = ai.indexOf(start), b = ai.indexOf(endMark, a); return a >= 0 && b > a ? ai.slice(a, b) : ''; };

(async function main() {
  // the rule, cut out of the source and run
  const ruleSrc = cut('    const _has = function (v) {', '\n    // F1c batch (30 Aug 2026)');
  const R = {}; vm.createContext(R);
  try { vm.runInContext(ruleSrc + '\nthis.rowMissing = _rowMissing; this.actionMissing = _actionMissing; this.RULES = _ROW_RULES; this.kindOf = _rowKindOf;', R); } catch (e) { check('the rule compiles', false, e.message); }

  console.log('\n[R] the rule, for every kind of row');
  check('extracted the one rule', !!ruleSrc && typeof R.actionMissing === 'function');
  if (typeof R.actionMissing === 'function') {
    const empty = [
      { op: 'add_fha', subId: 'SF-008', fcDesc: '', severity: '' },
      { op: 'add_fcim', subId: 'SF-025', awareness: '', totalLoss: '', partialLoss: '', malfunction: '', partials: [''], malfunctions: [] },
      { op: 'add_function', funcName: 'Protect against fire', funcDef: 'Detect fire', subName: '' },
      { op: 'add_function', scope: 'system', systemId: 'sys-1', funcName: '', subName: '' },
      { op: 'add_fmea', level: 'functional', funcSubId: 'SF-001', funcMode: 'loss' },
      { op: 'add_fmea', level: 'item', mode: '', endEffect: 'Loss of braking' },
      { op: 'add_zsa', zoneId: 'Z-100', desc: '', interference: '', mitigation: '' },
      { op: 'add_pra', threat: ' ' }, { op: 'add_cma', claim: '', subject: '' }, { op: 'add_requirement', text: '' },
      { op: 'add_item', name: '' }, { op: 'add_routing', name: '' }, { op: 'add_system', name: '' }, { op: 'add_mac', subId: '' },
      { op: 'add_fta_tree', topEvent: '', root: { name: '' } }, { op: 'add_fta_node', node: { name: '' } }, { op: 'add_markov_state', name: '' },
    ];
    const full = [
      { op: 'add_fha', fcDesc: 'Loss of wheel braking' }, { op: 'add_fha', fcDesc: '', srcCondId: 'SF-002-TL' },
      { op: 'add_fcim', totalLoss: 'Loss of fire detection' }, { op: 'add_fcim', malfunctions: ['Spurious fire warning'] },
      { op: 'add_function', funcName: 'Protect against fire', subName: 'Detect fire' }, { op: 'add_function', scope: 'system', systemId: 'sys-1', subName: 'Detect engine fire' },
      { op: 'add_fmea', level: 'functional', funcSubId: 'SF-001', funcMode: 'loss', endEffect: 'Loss of braking' }, { op: 'add_fmea', level: 'item', mode: 'Open circuit', localEffect: 'No signal' },
      { op: 'add_zsa', zoneId: 'Z-100', interference: 'Hydraulic line near wiring' }, { op: 'add_pra', threat: 'Rotor burst' }, { op: 'add_cma', claim: 'Channels independent' },
      { op: 'add_requirement', text: 'The system shall...' }, { op: 'add_item', name: 'BCU' }, { op: 'add_routing', name: 'W-12' }, { op: 'add_system', name: 'Fire protection' },
      { op: 'add_mac', subId: 'SF-001' }, { op: 'add_fta_tree', topEvent: 'Loss of braking' }, { op: 'add_fta_node', node: { name: 'BCU fails' } }, { op: 'add_markov_state', name: 'Degraded' },
    ];
    const emptyMiss = empty.map(a => R.actionMissing(a)), fullMiss = full.map(a => R.actionMissing(a));
    check('[R1] each of the ' + empty.length + ' empty rows (every kind the AI writes) is named as empty', emptyMiss.every(Boolean), JSON.stringify(empty.map((a, i) => a.op + ': ' + emptyMiss[i])));
    check('[R2] each of the ' + full.length + ' full rows may be written', fullMiss.every(m => m === ''), JSON.stringify(full.map((a, i) => a.op + ': ' + fullMiss[i]).filter(x => !/: $/.test(x))));
    check('[R3] the words say what is missing', R.actionMissing(empty[0]) === 'an FHA row with no failure condition' && R.actionMissing(empty[2]) === 'an aircraft function with no function or sub-function name' && /an FCIM row with no failure condition/.test(R.actionMissing(empty[1])), JSON.stringify(emptyMiss.slice(0, 3)));
    check('[R4] the rule leaves an honest empty FIELD alone (no severity, no rationale)', R.actionMissing({ op: 'add_fha', fcDesc: 'Loss of braking', severity: '', severityRationale: '', effAc: '' }) === '');
  }

  console.log('\n[B] the AI\'s reply: an empty row never reaches the review panel');
  {
    const a = ai.indexOf('        const _emptyBy = {};'), b = ai.indexOf('        const parsed = { reply: _replies.join', a);
    check('extracted the reply filter', a > 0 && b > a);
    const c = { console, String, Object }; vm.createContext(c);
    const actions = [{ op: 'add_fha', subId: 'SF-008', fcDesc: '' }, { op: 'add_fha', fcDesc: 'Loss of braking' }, { op: 'add_fcim', subId: 'SF-025' }, { op: 'add_function', funcName: 'Protect against fire', funcDef: 'Detect fire', subName: '' }, { op: 'add_fha', fcDesc: '', srcCondId: 'SF-002-TL' }, { op: 'add_cma', claim: 'Channels independent' }];
    c.actions = actions;
    try { vm.runInContext(ruleSrc + '\n' + ai.slice(a, b) + '\nthis.n = _noCond; this.words = _emptyWords;', c); } catch (e) { check('the filter runs', false, e.message); }
    check('[B1] the three empty rows are left out, the three full ones kept, in order', c.n === 3 && actions.length === 3 && actions[0].fcDesc === 'Loss of braking' && actions[1].srcCondId === 'SF-002-TL' && actions[2].op === 'add_cma', JSON.stringify(actions));
    check('[B2] the panel says which, by kind', /1 FHA row with no failure condition/.test(c.words || '') && /1 FCIM row with no failure condition/.test(c.words || '') && /1 aircraft function with no function or sub-function name/.test(c.words || ''), c.words);
    check('[B3] the note on the panel carries it', /' empty and left out \(' \+ _emptyWords \+ '\); draft '/.test(ai));
  }

  console.log('\n[D] the function breakdown: no named sub-function, no function');
  {
    const src = cut('    function _applyDecompGroup(g) {', '\n    // Fallback IDs (numbering engine off)');
    const c = { String, Math, Date, console }; vm.createContext(c);
    let ran = true;
    try { vm.runInContext(ruleSrc + `
      var acFunctionsData = []; var toasts = []; var _decompScope = {};
      function _toast(m) { toasts.push(m); } function _skillStampFor() { return 's'; } function newRowId() { return 'r' + Math.random(); }
      function _fallbackFuncIds(r) { r.funcId = r.funcId || 'AF-1'; r.subId = r.subId || ('SF-' + (acFunctionsData.length + 1)); }
      function scheduleAutosave() {}
      ${src}
      this.run = _applyDecompGroup; this.rows = acFunctionsData; this.toasts = toasts;`, c); } catch (e) { ran = false; check('the breakdown writer runs', false, e.message); }
    if (ran) {
      const n1 = c.run({ funcName: 'Protect against fire', funcDef: 'Detect fire', subs: [{ subName: '', subDef: '' }] });
      const n2 = c.run({ funcName: 'Protect against fire', funcDef: 'Detect fire', subs: [] });
      check('[D1] "Protect against fire" with a blank sub-function, or none: nothing written, and said', n1 === 0 && n2 === 0 && c.rows.length === 0 && /has no named sub-function/.test(c.toasts.join(' ')), JSON.stringify({ n1, n2, rows: c.rows.length, t: c.toasts }));
      const n3 = c.run({ funcName: 'Protect against fire', funcDef: 'Detect and extinguish fire', subs: [{ subName: 'Detect fire', subDef: '' }, { subName: ' ', subDef: '' }] });
      check('[D2] with one named sub-function (and a blank one beside it): that one is written, the blank is not', n3 === 1 && c.rows.length === 1 && c.rows[0].subName === 'Detect fire', JSON.stringify(c.rows));
      check('[D3] no placeholder "(general)" sub-function anywhere', !c.rows.some(r => /general/i.test(r.subName)) && ai.indexOf("{ subName: '(general)', subDef: '' }") < 0);
    }
  }

  console.log('\n[W] every writer the classic lanes call directly asks the rule first');
  for (const [fn, kind] of [['_applyFcimSuggestion(s)', 'fcim'], ['_applyPra(x)', 'pra'], ['_applyZsa(x)', 'zsa'], ['_applyCma(x)', 'cma'], ['_applyFmea(x)', 'fmea'], ['_applyReqSuggestion(rq)', 'req'], ['_applyResource(x)', 'resource']]) {
    const at = ai.indexOf('    function ' + fn + ' {');
    check('[W] ' + fn.replace(/\(.*/, '') + ' refuses an empty ' + kind + ' before it writes anything', at > 0 && /^\s*if \(_refuseEmpty\('[a-z.]+', [a-z]+\)\) return false;/.test(ai.slice(ai.indexOf('\n', at) + 1, ai.indexOf('\n', ai.indexOf('\n', at) + 1))) && ai.slice(at, at + 200).indexOf("_refuseEmpty('" + kind + "'") > 0);
  }

  console.log('\n[E] an empty turn is asked again, then reported, never counted as returned');
  {
    const at = ai.indexOf('const _runSlice = async function (_ci) {'), end = ai.indexOf('\n        };', at);
    const emptyFn = (ai.match(/const _emptyTurn = function \(a\) \{[^\n]*\};/) || [''])[0];
    check('extracted the real turn runner and the empty-turn rule', at > 0 && end > at && !!emptyFn);
    const c = { console, setTimeout, Math, String, Array, Error, Promise, JSON }; c.globalThis = c; vm.createContext(c);
    vm.runInContext(`
      const _TURN_TRIES = 3; let _retried = 0; const _turnErrs = []; let _permanentErr = null;
      const _isPermanent = () => false;
      const _slices = [['SF-001-TL'], ['SF-002-TL']]; const _results = new Array(2);
      const _chunk = { noun: 'failure condition', label: u => String(u), units: ['SF-001-TL', 'SF-002-TL'] };
      const _CHUNK_TURN_TOKENS = 4000, _sysExtra = '', _sysBreaks = [], _batchLane = 'fha';
      const _mkMessages = x => [{ role: 'user', content: x }];
      globalThis.calls = 0;
      const _anemRun = async function () { globalThis.calls++; return globalThis.reply(globalThis.calls); };
      ${emptyFn}
      ${ai.slice(at, end + '\n        };'.length)}
      globalThis.run = _runSlice; globalThis.results = _results; globalThis.retried = () => _retried;`, c);
    c.reply = () => ({ parsed: { reply: 'Done.', actions: [] } });
    await c.run(0);
    check('[E1] a turn with no rows is asked 3 times, then not completed, its reply kept', c.calls === 3 && c.results[0].ok === false && c.results[0].e && c.results[0].e.emptyTurn === true && c.results[0].e.a.parsed.reply === 'Done.', JSON.stringify({ calls: c.calls, ok: c.results[0] && c.results[0].ok }));
    c.calls = 0; c.reply = n => n < 2 ? { parsed: { actions: [] } } : { parsed: { actions: [{ op: 'add_fha', fcDesc: 'Loss of x' }] } };
    await c.run(1);
    check('[E2] empty once, rows on the retry: completed, the retry counted', c.calls === 2 && c.results[1].ok === true && c.retried() === 1, JSON.stringify({ calls: c.calls }));
    check('[E3] the batch counts empty turns apart from returned ones, and the console line says so', /if \(e && e\.emptyTurn\) \{\s*\/\/[^\n]*\n\s*_emptyTurns\+\+;/.test(ai) && /came back empty after ' \+ _TURN_TRIES \+ ' tries/.test(ai));
  }

  console.log('\n[N] panel notes: plain text, **bold** the only markup');
  {
    const m = ai.match(/function _noteHtml\(t\) \{[^\n]*\}/), esc = cut('    function _esc(s) {', '\n    function _certBasis() {');
    check('extracted the note writer and the escaper', !!m && !!esc);
    const c = { String }; vm.createContext(c);
    vm.runInContext(esc + '\n' + (m ? m[0] : '') + '\nthis.f = _noteHtml;', c);
    const f = c.f || (() => '');
    check('[N1] **3 rows classified by JUDGMENT** is bold', f('Advisory. **3 rows classified by JUDGMENT.**') === 'Advisory. <b>3 rows classified by JUDGMENT.</b>', f('Advisory. **3 rows classified by JUDGMENT.**'));
    check('[N2] tags in a note are text, never markup', /&lt;b/.test(f('a <b>b</b>')) && !/<b|<img/.test(f('a <b>b</b> <img src=x>')), f('a <b>b</b> <img src=x>'));
    check('[N3] the panel writes its note through it', /'<div class="aifh-disclaimer">' \+ _noteHtml\(cfg\.disclaimer\) \+ '<\/div>'/.test(ai));
    check('[N4] no review panel note carries tags any more', !/disclaimer: '[^\n]*<b>/.test(ai) && !/deliberately <b>/.test(ai) && !/' <b style="color:#7A5300;">/.test(ai));
  }

  console.log('\n[X] the executor every accept goes through, and [I] INV-31, in the browser');
  let pw = null;
  for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
  if (!pw) { console.log('  note  Playwright is not installed on this machine: the browser checks did not run'); }
  else {
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && /\.js$/.test(f)) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
      const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
      await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html?ai=1');
      await page.waitForFunction(() => typeof loadSampleProject === 'function' && typeof window.slLoadAI === 'function', null, { timeout: 90000 });
      await page.evaluate(async () => { const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked'); window.SL_VERIFY_SYNC_OFF = true; await loadSampleProject(); await window.slLoadAI(); });
      await page.waitForFunction(() => window.SafetyLabAI && typeof SafetyLabAI.applyDraft === 'function', null, { timeout: 90000 });
      await page.waitForTimeout(1500);
      const X = await page.evaluate(() => {
        const out = {};
        const fn = acFunctionsData.find(f => f && f.subId); out.sub = fn && fn.subId;
        const ph = flightPhasesData.map(x => x.phase).slice(0, 2);
        acExtractedFCs.push({ id: 'TST-901-TL', subId: fn.subId, desc: 'Total loss of the test function', type: 'Total loss' });
        const page0 = (ftaPages || []).find(p => p && p.root && p.root.type === 'gate');
        const counts = () => ({ fha: acFhaData.length, fcim: acFcimData.length, func: acFunctionsData.length, pra: praData.length, zsa: zsaData.length, cma: cmaData.length, item: itemsData.length, routing: routingData.length, sys: systemsData.length });
        const run = items => SafetyLabAI.applyDraft({ items, assumptions: [], feature: 'chat.edit' });
        const before = counts();
        const emptyItems = [
          { op: 'add_fha', subId: fn.subId, phases: ph, fcDesc: '' },
          { op: 'add_fcim', subId: fn.subId, awareness: '', totalLoss: '', partialLoss: '', malfunction: '' },
          { op: 'add_function', funcName: 'Protect against fire', funcDef: 'Detect fire', subName: '' },
          { op: 'add_pra', threat: '' }, { op: 'add_zsa', zoneId: 'Z-1', desc: '' }, { op: 'add_cma', claim: '' },
          { op: 'add_item', name: '' }, { op: 'add_routing', name: '' }, { op: 'add_system', name: '' },
        ].concat(page0 ? [{ op: 'add_fta_node', pageId: page0.id, parentId: page0.root.id, node: { name: '', type: 'event' } }] : []);
        const r1 = run(emptyItems);
        out.emptyCounts = [before, counts()];
        out.emptyResults = r1.results.map(x => x.error || x.summary || '');
        out.applied = r1.applied;
        out.nodeKids = page0 ? (page0.root.children || []).filter(n => !String(n.name || '').trim()).length : 0;
        out.hasPage = !!page0;
        const b2 = counts();
        const r2 = run([
          { op: 'add_fha', subId: fn.subId, phases: ph, fcDesc: '', srcCondId: 'TST-901-TL' },
          { op: 'add_fha', subId: fn.subId, phases: ph, fcDesc: 'Erroneous test output' },
          { op: 'add_function', funcName: 'Protect against fire', funcDef: 'Detect and extinguish fire', subName: 'Detect fire' },
          { op: 'add_cma', claim: 'The two channels fail independently' },
        ]);
        out.full = { added: [b2, counts()], applied: r2.applied, results: r2.results.map(x => x.error || x.summary || '') };
        const byId = acFhaData.find(x => x.sourceCondId === 'TST-901-TL');
        out.byId = byId ? { desc: byId.fcDesc, fcId: byId.fcId } : null;
        // the classic lanes' own shapes go straight to their writers, past the executor
        const b5 = counts(), resN = (typeof resourcesData !== 'undefined' ? resourcesData.length : -1);
        const r5 = SafetyLabAI.applyDraft({ items: [
          { subId: fn.subId, fcDesc: '', phases: ph },
          { subId: fn.subId, totalLoss: '', partialLoss: '', malfunction: '' },
          { name: '', providedBy: [], consumedBy: [] },
        ], assumptions: [], feature: 'fha' });
        out.classic = { same: JSON.stringify(b5) === JSON.stringify(counts()), res: (typeof resourcesData !== 'undefined' ? resourcesData.length : -1) === resN, applied: r5.applied };
        // an AI edit that would empty an existing row
        const row = acFhaData.find(x => String(x.fcDesc || '').trim());
        const was = row.fcDesc;
        const r3 = run([{ op: 'update', table: 'ac_fha', _id: row.internalId, fields: { fcDesc: '' } }]);
        out.update = { kept: row.fcDesc === was, err: (r3.results[0] || {}).error || '' };
        const r4 = run([{ op: 'update', table: 'ac_fha', _id: row.internalId, fields: { comments: 'reviewed' } }]);
        out.update.other = r4.applied === 1;
        // rows written before the fix: INV-31 names them
        acFhaData.push({ internalId: 'emp-1', subId: fn.subId, fcId: 'FC-902', fcDesc: '', aiGenerated: true, aiModel: 'm', aiAt: 'x' });
        acFcimData.push({ internalId: 'emp-2', subId: 'SF-925', tlDesc: '', plDesc: '', mDesc: '', aiGenerated: true, aiModel: 'm', aiAt: 'x' });
        acFunctionsData.push({ internalId: 'emp-3', funcId: 'AF-910', funcName: 'Protect against fire', funcDef: 'Detect fire', subId: 'SF-925', subName: '', aiGenerated: true, aiModel: 'm', aiAt: 'x' });
        const R = window.invRun();
        const i31 = ((R && R.results) || []).find(x => x.id === 'INV-31') || {};
        out.inv = (i31.failures || []).filter(f => /the row is empty/.test(String(f)));
        acFhaData.splice(acFhaData.findIndex(x => x.internalId === 'emp-1'), 1); acFcimData.splice(acFcimData.findIndex(x => x.internalId === 'emp-2'), 1); acFunctionsData.splice(acFunctionsData.findIndex(x => x.internalId === 'emp-3'), 1);
        out.invAfter = (((window.invRun() || {}).results || []).find(x => x.id === 'INV-31') || { failures: [] }).failures.filter(f => /the row is empty/.test(String(f))).length;
        return out;
      });
      check('the sample has a function and a fault tree to draft against', !!X.sub && X.hasPage, JSON.stringify({ sub: X.sub, page: X.hasPage }));
      check('[X1] ' + X.emptyResults.length + ' empty rows of every kind: nothing written anywhere', X.applied === 0 && JSON.stringify(X.emptyCounts[0]) === JSON.stringify(X.emptyCounts[1]) && X.nodeKids === 0, JSON.stringify(X.emptyCounts));
      check('[X2] each one refused by the executor, in words ("not written: ...")', X.emptyResults.every(e => /^not written: an? /.test(e)), JSON.stringify(X.emptyResults));
      check('[X3] the function with a blank sub-function is the one from Aeolus, refused by name', X.emptyResults.some(e => /aircraft function with no function or sub-function name/.test(e)));
      check('[X4] full rows are written as before', X.full.applied === 4 && X.full.added[1].fha === X.full.added[0].fha + 2 && X.full.added[1].func === X.full.added[0].func + 1 && X.full.added[1].cma === X.full.added[0].cma + 1, JSON.stringify(X.full));
      check('[X5] an FHA row with only a condition id takes the FCIM\'s words and its id', X.byId && X.byId.desc === 'Total loss of the test function' && X.byId.fcId === 'TST-901-TL', JSON.stringify(X.byId));
      check('[X7] the classic lanes\' own shapes (FHA, FCIM, resource), which go straight to their writers: nothing empty written', X.classic && X.classic.same && X.classic.res && X.classic.applied === 0, JSON.stringify(X.classic));
      check('[X6] an AI edit that would empty a row is refused; the row is unchanged; other edits still go through', X.update.kept && /^not changed: it would leave an FHA row with no failure condition/.test(X.update.err) && X.update.other, JSON.stringify(X.update));
      check('[I1] INV-31 names the empty AI rows already in a project: the FHA row, the FCIM row, the function', X.inv.length === 3 && X.inv.some(f => /FC-902/.test(f)) && X.inv.some(f => /FCIM SF-925/.test(f)) && X.inv.some(f => /function SF-925 \[AI\]: no sub-function name/.test(f)), JSON.stringify(X.inv));
      check('[I2] and nothing once they are gone', X.invAfter === 0, X.invAfter);
      check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    } finally { await browser.close(); srv.close(); }
  }
  const added = fs.readFileSync(__filename, 'utf8') + ai.split('\n').filter(l => /26 Oct 2026|_noCond|_emptyTurn|_noteHtml|_condText|_ROW_RULES|_rowMissing|_refuseEmpty|_emptyWords/.test(l)).join('\n') + inv.split('\n').filter(l => /26 Oct 2026|EMPTY|_has\(/.test(l)).join('\n');
  check('no em dashes in what was added', added.indexOf(String.fromCharCode(0x2014)) < 0, (added.split('\n').find(l => l.indexOf(String.fromCharCode(0x2014)) >= 0) || '').slice(0, 200));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });
