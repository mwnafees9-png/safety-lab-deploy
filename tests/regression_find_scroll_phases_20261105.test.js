#!/usr/bin/env node
/*
 * Regression (5 Nov 2026), three things Waqas asked for together ("we need to add control F search, when you edit or do
 * anything in the table it jumps to the top, AI is not addressing all phases of flight for Radia"; on the third: "it
 * completely left out Cruise from the screenshot I sent you till Brian went in and had to update it manually").
 *   [U]  fha_phase_cover.js: every failure condition accounts for every phase of the mission profile (on a row, "All
 *        phases", or marked does not apply with a reason); what is left is named. ai_assistant.js: the FHA's
 *        fill-the-missing-phases mode keeps only the phases asked for and counts the rows already there.
 *   [S]  the mission profile verbatim in every FHA turn; the coverage pass repeated (up to three); the phase note at the
 *        top of the Comments cell (the Phases cell stays the ticked phases only); edits come back to their row;
 *        the pager registers every page with the find bar.
 *   [B]  the real app (HL-1 demo, made 150 rows long): the bar over the table and the note in Comments; Does not apply
 *        through the form; Edit then Save comes back to the row and lights it; Ctrl+F finds a row on page 3, turns the
 *        pager, lights the words, does not search the row menu, Esc clears; the desktop searches the page.
 * MUTATION PROOFS: SL_FSP_MUTATE=na | shape | back | pages | passes. Each turns this red.
 * Run: node tests/regression_find_scroll_phases_20261105.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + String(d).slice(0, 400) : '')); } };
const REPO = path.join(__dirname, '..'), SITE = path.join(REPO, 'site');
const MUT = process.env.SL_FSP_MUTATE || '';
const MUTS = {
  na:     ['fha_phase_cover.js', "const na = naOf(rs, cond); na.forEach(x => cov.add(keyP(x.phase)));", "const na = naOf(rs, cond);"],
  shape:  ['ai_assistant.js', "return a.phases.length > 0;", "return true;"],
  back:   ['support_modules.js', "    _slEditReturnTo(module);   // 5 Nov 2026: back to the row edited\n", ""],
  pages:  ['paginate.js', "                window.SLFind.register(tbody, { key: opts.key, rows, rowHtml, goto: i => {", "                if (0) window.SLFind.register(tbody, { key: opts.key, rows, rowHtml, goto: i => {"],
  passes: ['ai_assistant.js', "for (let _pass = 0; _pass < 3 && _gaps.length", "for (let _pass = 0; _pass < 1 && _gaps.length"]
};
if (MUT && !MUTS[MUT]) { console.error('unknown mutation ' + MUT); process.exit(3); }
function src(name) { let s = fs.readFileSync(path.join(SITE, name), 'utf8'); const m = MUTS[MUT]; if (m && m[0] === name) { if (s.indexOf(m[1]) < 0) throw new Error('mutation site missing: ' + m[1]); s = s.replace(m[1], m[2]); } return s; }
function extractFn(s, name) {
  const i = s.indexOf('function ' + name + '('); if (i < 0) return null;
  let depth = 0, started = false, inS = null, esc = false, line = false, blk = false;
  for (let k = s.indexOf('{', i); k < s.length; k++) {
    const c = s[k], n = s[k + 1];
    if (line) { if (c === '\n') line = false; continue; } if (blk) { if (c === '*' && n === '/') { blk = false; k++; } continue; }
    if (esc) { esc = false; continue; } if (c === '\\') { esc = true; continue; }
    if (inS) { if (c === inS) inS = null; continue; }
    if (c === '/' && n === '/') { line = true; k++; continue; } if (c === '/' && n === '*') { blk = true; k++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '{') { depth++; started = true; } else if (c === '}') { depth--; if (started && depth === 0) return s.slice(i, k + 1); }
  }
  return null;
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));

(async function main() {
  const pc = src('fha_phase_cover.js'), ai = src('ai_assistant.js'), hm = src('helpers_modules.js'), sm = src('support_modules.js'), pgn = src('paginate.js'), tf = src('table_find.js');
  console.log('\n[U] every phase accounted for');
  const PROF = ['Standing', 'Taxi', 'Takeoff', 'Climb', 'Cruise', 'Descent', 'Approach', 'Landing'];
  const ctx = { console, window: {}, document: undefined, flightPhasesData: PROF.map(p => ({ phase: p })).concat([{ phase: 'All phases' }]), acFhaData: [], systemsData: [], scheduleAutosave() { ctx.saved = (ctx.saved || 0) + 1; } };
  vm.createContext(ctx); vm.runInContext(pc, ctx); const C = ctx.window.SLPhaseCover;
  ctx.acFhaData.push(
    { internalId: 1, fcId: '2.1.6-M2', fcDesc: 'Uncommanded yaw control', phases: 'Takeoff, Landing' },
    { internalId: 2, fcId: '2.1.6-M2', fcDesc: 'Uncommanded yaw control', phases: 'Climb, Descent, Approach' },   // Cruise left out, as in Radia's file
    { internalId: 3, fcId: '2.1.6-PL2', fcDesc: 'Partial loss of yaw control', phases: 'All phases' },
    { internalId: 4, fcId: '2.1.6-TL', fcDesc: 'Total loss of yaw control', phases: 'Standing, Taxi, Takeoff', obsolete: false },
    { internalId: 5, fcId: '2.1.6-TL', fcDesc: 'Total loss of yaw control', phases: 'Climb, Cruise, Descent, Approach, Landing' },
    { internalId: 6, fcId: '9.9-X', fcDesc: 'Retired', phases: 'Taxi', obsolete: true });
  let g = C.gaps(ctx.acFhaData);
  const m2 = g.find(x => x.cond === '2.1.6-M2');
  check('the condition with Cruise left out is named, with every phase it never assessed', m2 && m2.missing.join() === 'Standing,Taxi,Cruise', JSON.stringify(g));
  check('"All phases" covers the profile; rows that together cover every phase are complete; an obsolete row is not checked', !g.some(x => x.cond === '2.1.6-PL2' || x.cond === '2.1.6-TL' || x.cond === '9.9-X'), JSON.stringify(g.map(x => x.cond)));
  check('the note opens the first row only, naming the phases', /Phases not assessed for this condition: Standing, Taxi, Cruise/.test(C.cellNote(ctx.acFhaData[0], ctx.acFhaData)) && C.cellNote(ctx.acFhaData[1], ctx.acFhaData) === '');
  let threw = ''; try { C.markNA('ac', null, '2.1.6-M2', ['Standing', 'Taxi'], '  ', 'Brian'); } catch (e) { threw = e.message; }
  check('Does not apply needs the reason', /Say why/.test(threw));
  C.markNA('ac', null, '2.1.6-M2', ['Standing', 'taxi'], 'Yaw control is engaged from the take-off roll on; on the ground at rest it is not powered.', 'Brian');
  g = C.gaps(ctx.acFhaData);
  check('marked does not apply (by whom, why), the phases are accounted for; Cruise is still named', g.find(x => x.cond === '2.1.6-M2').missing.join() === 'Cruise' && ctx.acFhaData[0].phaseNA.length === 2 && ctx.acFhaData[0].phaseNA[1].phase === 'Taxi' && ctx.acFhaData[0].phaseNA[0].by === 'Brian' && ctx.saved >= 1, JSON.stringify(ctx.acFhaData[0].phaseNA));
  check('the note shows what does not apply', /Phases that do not apply: <span[^>]*>Standing<\/span>, <span[^>]*>Taxi<\/span>/.test(C.cellNote(ctx.acFhaData[0], ctx.acFhaData)));
  ctx.acFhaData[1].phases += ', Cruise';
  check('once a row covers Cruise, the condition is complete', !C.gaps(ctx.acFhaData).some(x => x.cond === '2.1.6-M2'));
  C.clearNA('ac', null, '2.1.6-M2', 'Taxi');
  check('a does-not-apply taken back puts the phase back as unassessed', C.gaps(ctx.acFhaData).find(x => x.cond === '2.1.6-M2').missing.join() === 'Taxi');
  const ctx2 = Object.assign({}, ctx, { flightPhasesData: [] }); vm.createContext(ctx2); vm.runInContext(pc, ctx2);
  check('a project with no mission profile has nothing to check against', ctx2.window.SLPhaseCover.gaps(ctx.acFhaData).length === 0);

  console.log('\n[U] ANEM: fill the missing phases only');
  const ac = { console, window: { SLPhaseCover: C }, flightPhasesData: ctx.flightPhasesData, FLIGHT_PHASES: PROF, snapshot: () => ({ acFhaData: ctx.acFhaData, systemsData: [] }) };
  vm.createContext(ac);
  ['_projectPhaseNames', '_fhaProfileClause', '_fhaFillSetup'].forEach(n => { const f = extractFn(ai, n); if (!f) throw new Error('missing ' + n); vm.runInContext(f, ac); });
  ctx.acFhaData[1].phases = 'Climb, Descent, Approach'; ctx.acFhaData[0].phaseNA = [{ phase: 'Standing', reason: 'r', by: 'B' }, { phase: 'Taxi', reason: 'r', by: 'B' }];
  const fill = vm.runInContext("_fhaFillSetup({ onlyPhases: { '2.1.6-M2': ['Cruise'] } }, null)", ac);
  check('the rows already there and the phases that do not apply count as covered', fill && fill.have.some(a => a.phases.join() === 'Takeoff,Landing') && fill.have.some(a => a.phases.join() === 'Standing,Taxi'));
  check('the request names the condition and only the phase to fill, and carries the mission profile verbatim', /FILL THE MISSING PHASES ONLY/.test(fill.extra) && /- 2\.1\.6-M2: Cruise/.test(fill.extra) && /THE MISSION PROFILE[^:]*: Standing, Taxi, Takeoff, Climb, Cruise, Descent, Approach, Landing\./.test(fill.extra));
  const condOf = a => a.srcCondId;
  const kept = fill.shape([
    { op: 'add_fha', srcCondId: '2.1.6-M2', phases: ['Cruise', 'Climb'] },            // Climb is already assessed: dropped from the row
    { op: 'add_fha', srcCondId: '2.1.6-M2', phases: ['Takeoff'] },                    // nothing asked for: the row goes
    { op: 'add_fha', srcCondId: '2.1.6-TL', phases: ['Cruise'] },                     // a condition not asked about: goes
    { op: 'add_fha', srcCondId: '2.1.6-M2', phases: ['All phases'] },                 // "All phases" means the phases asked for
    { op: 'add_requirement', text: 'kept' }], condOf);
  check('ANEM\'s answer keeps only the phases asked for: no phase assessed twice, no other condition touched', kept.length === 3 && kept[0].phases.join() === 'Cruise' && kept[1].phases.join() === 'Cruise' && kept[2].op === 'add_requirement', JSON.stringify(kept));
  check('with nothing to fill, the mode is off', vm.runInContext("_fhaFillSetup({}, null)", ac) === null);

  console.log('\n[S] the code');
  check('every FHA turn carries the mission profile (aircraft and system)', /\+ \(_fill \? _fill\.extra : _fhaProfileClause\(null\)\),/.test(ai) && /_fhaEscapesClause\(\) \+ \(_fill \? _fill\.extra : _fhaProfileClause\(null\)\) \+ mac/.test(ai));
  check('the phase-coverage pass repeats (up to three) and stops when a pass adds nothing', /for \(let _pass = 0; _pass < 3 && _gaps\.length/.test(ai) && /if \(_gapCount\(_gaps\) >= _before\) break;/.test(ai));
  check('what ANEM returns is shaped before the coverage is measured', /const _shape = function \(\) \{ if \(typeof cfg\.shapeActions === 'function'\)/.test(ai) && /shapeActions: _fill \? function \(acts\) \{ return _fill\.shape\(acts, _condOf\); \} : null/.test(ai) && /shapeActions: _fill \? function \(acts\) \{ return _fill\.shape\(acts, condOf\); \} : null/.test(ai));
  check('the note opens the Comments cell of both tables; the Phases cell is the ticked phases only', /_grpBadge\.replace\('margin-left:6px;', 'margin-left:0;'\)\}<\/div>` : ''\) \+ _fhaPhaseNote\(row, acFhaData\);|: '' \+ _fhaPhaseNote\(row, acFhaData\);/.test(hm) && /const _findingHtml = _fhaPhaseNote\(row, \(sys\(\) && sys\(\)\.fha\) \|\| \[\]\);/.test(hm) && /return list\.map\(esc\)\.join\('<br>'\);\n\}/.test(hm));
  check('the bar over both tables', /SLPhaseCover\.bar\('ac', null, 'ac-fha-body'\)/.test(hm) && /SLPhaseCover\.bar\('sys', sys\(\)\.id, 'sys-fha-body'\)/.test(hm));
  check('an edit remembers its place when it opens and comes back on Save or Cancel', /function setEditMode\(module\) \{ _slEditRemember\(module\);/.test(sm) && /_slEditReturnTo\(module\);   \/\/ 5 Nov 2026: back to the row edited/.test(sm));
  check('the pager hands the find bar every row and every page', /window\.SLFind\.register\(tbody, \{ key: opts\.key, rows, rowHtml, goto: i => \{/.test(pgn) && /window\.SLFind\.register\(host, \{ key, page: \(\) => st\.page/.test(pgn));
  check('Ctrl+F and Cmd+F open the bar where a table is in view; elsewhere the browser keeps its own find (the desktop searches the page)', /\(e\.ctrlKey \|\| e\.metaKey\) && !e\.altKey && \(e\.key === 'f' \|\| e\.key === 'F'\)/.test(tf) && /if \(tablesInView\(\)\.length\) \{ e\.preventDefault\(\); open\('tables'\); return; \}/.test(tf) && /if \(desktop\(\)\) \{ e\.preventDefault\(\); open\('page'\); \}/.test(tf));
  const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  check('the new files are loaded, the find bar before the pager', /<script src="table_find\.js\?v=1\.0" defer><\/script>\n    <script src="paginate\.js\?v=1\.4" defer><\/script>/.test(idx) && /<script src="fha_phase_cover\.js\?v=1\.0" defer><\/script>/.test(idx));

  let pw = null; try { pw = require('playwright'); } catch (_) {}
  if (!pw) console.log('  SKIP  Playwright is not installed here; [U] and [S] above prove the code');
  else {
    console.log('\n[B] the real app');
    const http = require('http');
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
    const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(404); return r.end(); }
      let b; try { b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
      const name = path.relative(SITE, f); if (MUTS[MUT] && MUTS[MUT][0] === name) b = Buffer.from(src(name));
      r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const b = await pw.chromium.launch(); const errs = [];
    try {
      const pg = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
      pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); pg.on('dialog', (d) => d.accept().catch(() => {}));
      await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await tick(5000);
      await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); });
      await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
      await pg.evaluate(() => window.loadHL1Demo()); await tick(9000);
      await pg.evaluate(() => { const base = acFhaData.slice(); for (let k = 0; k < 4; k++) base.forEach((r, i) => acFhaData.push(Object.assign({}, r, { internalId: 'x' + k + '_' + i, fcId: r.fcId + '-c' + k }))); acFhaData[acFhaData.length - 3].fcDesc = 'Zebra crossing failure on page three'; renderACFHA(); switchTab('ac-fha'); });
      await tick(1500);
      // the phase check
      const P = await pg.evaluate(() => ({ bar: !!document.getElementById('fha-phase-bar-ac'), text: (document.getElementById('fha-phase-bar-ac') || {}).innerText || '', notes: document.querySelectorAll('#ac-fha-body .fha-phase-gap').length, inComments: [...document.querySelectorAll('#ac-fha-body .fha-phase-gap')].every(n => /Comments|comment/i.test(document.querySelector('#ac-fha-table thead').querySelectorAll('th')[n.closest('td').cellIndex].innerText)), gaps: SLPhaseCover.gaps(acFhaData).length }));
      check('the bar over the table names the conditions with phases left out, with Draft and Does not apply', P.bar && /failure conditions leave flight phases unassessed/.test(P.text) && /Draft every missing phase with ANEM/.test(P.text) && /Does not apply/.test(P.text), P.text.slice(0, 200));
      check('the note opens the Comments cell of each such condition\'s first row (on this page)', P.notes > 0 && P.inComments, JSON.stringify(P));
      const cond = await pg.evaluate(() => SLPhaseCover.gaps(acFhaData)[0].cond);
      await pg.evaluate((c) => { const d = document.querySelector('#fha-phase-bar-ac details'); if (d) d.open = true; [...document.querySelectorAll('#fha-phase-bar-ac .fha-phase-gaprow')].find(r => r.dataset.cond === c).querySelector('button:last-child').click(); }, cond);
      await tick(300);
      const miss = await pg.evaluate((c) => SLPhaseCover.gaps(acFhaData).find(x => x.cond === c).missing, cond);
      for (const p of miss) await pg.check('.fha-na-modal [data-na-phase="' + p + '"]');
      await pg.click('.fha-na-modal [data-na-ok]'); await tick(300);
      check('Does not apply without a reason is refused in the form', await pg.locator('.fha-na-modal').count() === 1 && /Say why/.test(await pg.locator('.fha-na-modal [data-na-err]').innerText()));
      await pg.fill('.fha-na-modal [data-na-why]', 'Test reason: not powered in these phases.'); await pg.click('.fha-na-modal [data-na-ok]'); await tick(800);
      const after = await pg.evaluate((c) => ({ still: SLPhaseCover.gaps(acFhaData).some(x => x.cond === c), na: (acFhaData.find(r => SLPhaseCover.condOf(r) === c).phaseNA || []).length, n: SLPhaseCover.gaps(acFhaData).length }), cond);
      check('marked does not apply: the condition leaves the bar, the reason is kept on its row', !after.still && after.na === miss.length && after.n === P.gaps - 1, JSON.stringify(after));
      // Edit then Save comes back to the row
      const Y = () => pg.evaluate(() => window.scrollY);
      const iid = await pg.evaluate(() => { const tr = document.querySelector('#ac-fha-body tr:nth-child(20)'); tr.scrollIntoView({ block: 'center' }); const id = acFhaData.find(r => tr.innerHTML.indexOf("editACFHA('" + r.internalId + "')") >= 0).internalId; return id; });
      await tick(300); const y0 = await Y();
      await pg.evaluate((id) => { setTimeout(() => editACFHA(id), 0); }, iid); await tick(600); const y1 = await Y();
      await pg.evaluate(() => submitACFHA()); await tick(700); const y2 = await Y();
      const lit = await pg.evaluate((id) => { const tr = document.querySelector('tr.sl-row-flash'); return !!tr && tr.innerHTML.indexOf("editACFHA('" + id + "')") >= 0; }, iid);
      check('Edit takes the page to the form; Save brings it back to the row edited, lit', y1 < 200 && Math.abs(y2 - y0) < 700 && lit, JSON.stringify({ y0, y1, y2, lit }));
      // Ctrl+F
      await pg.mouse.click(900, 500); await pg.keyboard.press('Control+f'); await tick(300);
      check('Ctrl+F opens the find bar, saying it searches every row and page', await pg.locator('.sl-find-bar').isVisible() && /every row of this table \(150 rows\), pages included/.test(await pg.locator('.sl-find-scope').innerText()));
      await pg.keyboard.type('zebra'); await tick(1500);
      const F = await pg.evaluate(() => ({ count: document.querySelector('.sl-find-count').innerText, marks: document.querySelectorAll('mark.sl-find-hit').length, page: document.querySelector('#slp-fha-ac input[data-pg=jump]').value, inRow: !!document.querySelector('tr.sl-find-row mark.sl-find-hit') }));
      check('a row on page 3 is found: the pager turns to it and the word is lit', F.count === '1 of 1 row' && F.marks === 1 && F.page === '3' && F.inRow, JSON.stringify(F));
      await pg.fill('.sl-find-bar input', 'Edit'); await tick(1500);
      check('the row menu is not searched (every row has Edit in its menu)', /Not found/.test(await pg.locator('.sl-find-count').innerText()));
      await pg.fill('.sl-find-bar input', 'pitch'); await tick(1500); const c1 = await pg.locator('.sl-find-count').innerText();
      await pg.keyboard.press('Enter'); await tick(300); const c2 = await pg.locator('.sl-find-count').innerText();
      check('Enter goes to the next match', /^1 of \d+ rows/.test(c1) && /^2 of \d+ rows/.test(c2), c1 + ' | ' + c2);
      await pg.keyboard.press('Escape'); await tick(200);
      check('Esc closes it and takes the highlights away', !(await pg.locator('.sl-find-bar').isVisible()) && await pg.locator('mark.sl-find-hit').count() === 0);
      // the desktop: no table in view, the bar searches the page
      // a page with no table in view (the tables hidden here), in the desktop app
      await pg.evaluate(() => { window.slabDesktop = window.slabDesktop || {}; document.querySelectorAll('table').forEach(t => { t.dataset.fspHid = t.style.display || '-'; t.style.display = 'none'; }); }); await tick(200);
      await pg.keyboard.press('Control+f'); await tick(300);
      check('in the desktop app, with no table in view, the bar searches the page', await pg.evaluate(() => SLFind.tablesInView().length) === 0 && /on this page/.test(await pg.locator('.sl-find-bar input').getAttribute('placeholder')));
      await pg.keyboard.type('Aircraft'); await tick(600);
      check('… and finds the words on it', /^1 of \d+/.test(await pg.locator('.sl-find-count').innerText()) && await pg.locator('mark.sl-find-hit').count() > 0, await pg.locator('.sl-find-count').innerText());
      await pg.keyboard.press('Escape');
      check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    } finally { await b.close(); srv.close(); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  (mutation: ' + MUT + ')' : ''));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });
