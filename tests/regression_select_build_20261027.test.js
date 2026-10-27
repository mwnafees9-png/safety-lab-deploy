#!/usr/bin/env node
/*
 * Regression: a big project no longer crashes the page when a picker is built (27 Oct 2026).
 *
 * Customer report: "when they press control R instead of refreshing it crashes the app". Reproduced on
 * the real desktop app with a real project (2,080 aircraft assumptions): the page died about 7 seconds
 * after every load ("Oilpan: Large allocation ... out of memory"), inside populateFhaAsmDropdown, which
 * built its drop-down with `innerHTML +=` once per assumption (each += re-parses the whole list).
 * Ctrl+R reloads, the FHA page opens again, and it crashes again. In headless Chromium the same page
 * freezes for 105 seconds instead of crashing.
 *
 * Pinned:
 *   [A] no `innerHTML +=` is left in the site's scripts (the one log line in jama_bridge.js aside, which
 *       appends a line per connector step);
 *   [B] in the real app, with 2,080 aircraft assumptions and 3,000 FHA rows, the FHA page opens and every
 *       picker is built in well under 2 seconds, with every option present and the selection kept.
 * MUTATE=1 serves the old populateFhaAsmDropdown (with 600 assumptions, so the red run ends in seconds).
 *
 * Run: node tests/regression_select_build_20261027.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 400) + ')' : '')); } };
const done = () => { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); };
const SITE = path.join(__dirname, '..', 'site');
const MUTATE = process.env.MUTATE || '';
const N = MUTATE ? 600 : 2080;
const OLD = "    getAllAssumptions().forEach(a => {\n        const trimmed = (a.text || '').length > 60 ? (a.text || '').slice(0, 60) + '…' : (a.text || '');\n        sel.innerHTML += `<option value=\"${esc(a.asmId)}\">[${esc(a.scope)}] ${esc(a.asmId)}: ${esc(trimmed)}</option>`;\n    });\n    sel.innerHTML = html;";

console.log('\n[A] no innerHTML += left in the site');
if (!MUTATE) {
  const hits = [];
  fs.readdirSync(SITE).filter(f => /\.js$/.test(f)).forEach(f => {
    fs.readFileSync(path.join(SITE, f), 'utf8').split('\n').forEach((l, i) => {
      const code = l.replace(/\/\/.*$/, '');
      if (/\.innerHTML\s*\+=/.test(code) && !(f === 'jama_bridge.js' && /function _log\(/.test(l))) hits.push(f + ':' + (i + 1));
    });
  });
  check('no `innerHTML +=` in any site script', hits.length === 0, hits.join(', '));
}

let pw; try { pw = require('playwright'); } catch (_) { console.log('  note  Playwright is not installed here: [B] did not run'); done(); }
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(SITE, path.normalize(p));
      if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); }
      fs.readFile(f, (e, b) => {
        if (e) { r.writeHead(404); return r.end('not found'); }
        if (MUTATE && path.basename(f) === 'data_ops_modules.js') {
          const s = String(b), from = s.indexOf("    getAllAssumptions().forEach(a => {\n        const trimmed"), to = s.indexOf('    sel.innerHTML = html;', from);
          if (from < 0 || to < 0) { console.error('mutation anchor not found'); process.exit(4); }
          b = Buffer.from(s.slice(0, from) + OLD + s.slice(to + '    sel.innerHTML = html;'.length));
        }
        r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b);
      });
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  console.log('\n[B] in the real app, ' + N + ' assumptions' + (MUTATE ? ' (MUTATION: the old picker)' : ''));
  const srv = await serve();
  let browser;
  try { browser = await pw.chromium.launch(); } catch (e) { console.log('  note  Chromium could not start here: [B] did not run'); srv.close(); done(); }
  try {
    const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    const errs = []; pg.on('pageerror', e => errs.push(String(e))); let crashed = false; pg.on('crash', () => { crashed = true; });
    pg.on('dialog', d => d.dismiss().catch(() => {}));
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/'); await sleep(3500);
    await pg.evaluate(() => {
      const g = document.getElementById('sl-auth-gate'); if (g) g.remove();
      document.documentElement.classList.remove('sl-auth-gate-blocked');
      document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; });
    });
    await pg.evaluate(async () => { await loadSampleProject(); }); await sleep(3000);
    const r = await pg.evaluate(n => {
      for (let i = 0; i < n; i++) acAssumptionsData.push({ asmId: 'ASM-AC-' + String(9000 + i), text: 'The aircraft continues to a suitable aerodrome <after> loss of an engine, assumption ' + i, state: 'Proposed' });
      const sel = document.getElementById('ac-fha-asm-select');
      const before = sel ? sel.options.length : -1;
      const t1 = performance.now(); switchTab('ac-fha'); const tab = performance.now() - t1;
      const opts = sel ? Array.from(sel.options) : [];
      const last = opts.find(o => o.value === 'ASM-AC-' + String(9000 + n - 1));
      // the generic picker, with duplicates and 3,000 rows
      const host = document.createElement('select'); host.id = 'sl-test-pick'; document.body.appendChild(host);
      const rows = []; for (let i = 0; i < 3000; i++) rows.push({ id: 'FC-' + (i % 2500), d: 'Loss of <thing> ' + i });
      host.innerHTML = '<option value="FC-17">x</option>'; host.value = 'FC-17';
      const t2 = performance.now(); populateDropdowns('sl-test-pick', rows, 'id', 'd'); const pick = performance.now() - t2;
      return { before, tab, n: opts.length, lastText: last ? last.textContent : '', escaped: last ? last.innerHTML.indexOf('&lt;after&gt;') >= 0 : false,
               pick, pickN: host.options.length, kept: host.value, firstPick: host.options[1] ? host.options[1].textContent : '' };
    }, N);
    check('the FHA page opens in well under 2 seconds with ' + N + ' assumptions', !crashed && r.tab < 2000, JSON.stringify(r));
    check('every assumption is in the picker, in order, escaped', /ASM-AC-\d+: The aircraft continues/.test(r.lastText) && r.escaped && r.n >= N + 1, JSON.stringify(r));
    check('the generic picker: 3,000 rows in well under 2 seconds, duplicates once, selection kept', r.pick < 2000 && r.pickN === 2501 && r.kept === 'FC-17' && r.firstPick === 'FC-0: Loss of <thing> 0', JSON.stringify(r));
    check('no page errors, no crash', !crashed && !errs.length, errs.slice(0, 3).join(' | '));
  } catch (e) { check('the browser run completed', false, e && e.message); }
  finally { try { await browser.close(); } catch (_) {} srv.close(); }
  if (!MUTATE) {
    console.log('\n[mutation] the old picker turns the test red');
    const x = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { MUTATE: '1' }), encoding: 'utf8', timeout: 600000 });
    const fails = (x.stdout.match(/^  FAIL  .*$/mg) || []);
    check('reverting populateFhaAsmDropdown turns the test red (' + fails.length + ' failing)', x.status === 1 && fails.length > 0, x.status + ' ' + (x.stderr || '').slice(0, 300));
  }
  done();
})();
