#!/usr/bin/env node
/*
 * Regression (4 Nov 2026): why a failure condition carries its severity is shown in the Comments column of the
 * aircraft and system FHA, not under the failure condition (Waqas: "why is AI populating the failure conditions column
 * with reasons, rather than the comments and effects column"; confirmed: "correct", with "ai should be drafting the
 * missing information the same way it does").
 *   [S]  helpers_modules.js: the failure condition cell holds the condition only; the Comments cell carries the reason
 *        (_fhaWhyHtml: the recorded reason, ANEM's draft with Accept, Edit and Discard, or the "No reason recorded"
 *        note), in both the aircraft and the system table. data_ops_modules.js: the CSV, Excel and PDF exports carry a
 *        "Why this severity" column beside Comments (it was missing), and an import reads it back into the reason
 *        without blanking a reason when the file has no such column.
 *   [B]  the real app (HL-1 demo): no failure condition cell shows a reason; the Comments cells do; a row with no
 *        reason shows the missing note (or ANEM's draft) in its Comments cell; the AC FHA CSV export has the column.
 * MUTATION PROOFS: SL_FR_MUTATE=fccell | comments | csv. Each turns this red.
 * Run: node tests/regression_fha_reason_in_comments_20261104.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + String(d).slice(0, 400) : '')); } };
const REPO = path.join(__dirname, '..'), SITE = path.join(REPO, 'site');
const MUT = process.env.SL_FR_MUTATE || '';
const MUTS = {
  fccell:   ['helpers_modules.js', '<td style="min-width:480px;width:34%;">${_findingHtml}${_fhaCommentsCell(row)}${_fhaWhyHtml(row)}</td>', '<td style="min-width:480px;width:34%;">${_findingHtml}${_fhaCommentsCell(row)}</td>'],
  comments: ['helpers_modules.js', '<td style="min-width:480px;width:34%;">${_findingHtml}${_fhaCommentsCell(row)}${_fhaWhyHtml(row)}</td>${reviewTd}</tr>', '<td style="min-width:480px;width:34%;">${_findingHtml}${_fhaCommentsCell(row)}</td>${reviewTd}</tr>'],
  csv:      ['data_ops_modules.js', "(r.assumptionIds || []).join('; '), r.severityRationale || '', r.comments, _ml('acFha', r)]));", "(r.assumptionIds || []).join('; '), '', r.comments, _ml('acFha', r)]));"]
};
if (MUT && !MUTS[MUT]) { console.error('unknown mutation ' + MUT); process.exit(3); }
function src(name) { let s = fs.readFileSync(path.join(SITE, name), 'utf8'); const m = MUTS[MUT]; if (m && m[0] === name) { if (s.indexOf(m[1]) < 0) throw new Error('mutation site missing: ' + m[1]); s = s.replace(m[1], m[2]); } return s; }
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));

(async function main() {
  console.log('\n[S] the code');
  const hm = src('helpers_modules.js'), dm = src('data_ops_modules.js');
  check('the failure condition cell holds the condition only (both tables)', !/\$\{esc\(row\.fcDesc\)\}\$\{_fhaWhyHtml\(row\)\}/.test(hm) && (hm.match(/\$\{_obsBadge\}\$\{esc\(row\.fcDesc\)\}<\/td>/g) || []).length === 2);
  check('the aircraft FHA Comments cell carries the reason', /\$\{_findingHtml\}\$\{_fhaCommentsCell\(row\)\}\$\{_fhaWhyHtml\(row\)\}<\/td>/.test(hm));
  check('the system FHA Comments cell carries the reason', /\$\{_findingHtml\}\$\{_fhaCommentsCell\(row\)\}\$\{_fhaWhyHtml\(row\)\}<\/td>\$\{reviewTd\}<\/tr>/.test(hm));
  check('ANEM still drafts a missing reason there (draft box with Accept, Edit, Discard; the missing note)', /function _fhaWhyHtml\(row\) \{[\s\S]*?fhaReasonAccept[\s\S]*?fhaReasonEdit[\s\S]*?fhaReasonDiscard[\s\S]*?No reason recorded for/.test(hm));
  check('the CSV exports carry "Why this severity" beside Comments (aircraft and system)', (dm.match(/'Assumption IDs','Why this severity','Comments','Model Links'\]/g) || []).length === 2 && /r\.severityRationale \|\| '', r\.comments, _ml\('acFha', r\)/.test(dm) && /r\.severityRationale \|\| '', r\.comments, _ml\('sysFha', r\)/.test(dm));
  check('the Excel and PDF exports too', (dm.match(/'Assumption IDs','Why this severity','Comments'\],\n\s+rows:/g) || []).length === 2);
  check('an import reads it back, and a file without the column leaves the reason alone', (dm.match(/\.\.\.\(getValue\(row, \['Why this severity'\]\) \? \{ severityRationale: getValue\(row, \['Why this severity'\]\) \} : \{\}\)/g) || []).length === 2);

  let pw = null; try { pw = require('playwright'); } catch (_) {}
  if (!pw) console.log('  SKIP  Playwright is not installed here; [S] above proves the code');
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
      const pg = await (await b.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true })).newPage();
      pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); pg.on('dialog', (d) => d.dismiss().catch(() => {}));
      await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await tick(5000);
      await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); });
      await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
      await pg.evaluate(() => window.loadHL1Demo()); await tick(9000);
      // one row with a reason, one without (the demo rows carry no reason until one is recorded)
      await pg.evaluate(() => { acFhaData[0].severityRationale = 'Departure from controlled flight; Catastrophic by definition.'; acFhaData[1].severityRationale = ''; renderACFHA(); });
      await pg.evaluate(() => switchTab('ac-fha')); await tick(1500);
      const T = await pg.evaluate(() => {
        const rows = [...document.querySelectorAll('#ac-fha-body tr')].filter((tr) => tr.querySelector('td'));
        const fcCellWhy = rows.some((tr) => { const tds = tr.querySelectorAll(':scope > td'); return [...tds].some((td) => td.querySelector('.fha-why') && /\b(FC-|Loss|Erroneous|Uncommanded|Inability)/.test(td.innerText.split('\n')[0]) && !td.querySelector('textarea')); });
        const lastCells = rows.map((tr) => { const tds = [...tr.querySelectorAll(':scope > td')]; const w = tds.find((td) => td.querySelector('.fha-why')); return w ? tds.indexOf(w) : -1; }).filter((i) => i >= 0);
        const recorded = [...document.querySelectorAll('#ac-fha-body .fha-why')].some((e) => /Why this severity: Departure from controlled flight; Catastrophic by definition\./.test(e.innerText));
        const missing = !!document.querySelector('#ac-fha-body .fha-why-missing, #ac-fha-body .fha-why-draft');
        // the column the reasons sit in is the Comments column of the header
        const heads = [...document.querySelectorAll('#ac-fha-table thead th')].map((th) => th.innerText.trim());
        return { fcCellWhy, cols: [...new Set(lastCells)], heads, recorded, missing };
      });
      const commentsCol = T.heads.findIndex((h) => /comment/i.test(h));
      check('no failure condition cell shows a reason', !T.fcCellWhy);
      check('every reason sits in the Comments column', T.cols.length === 1 && commentsCol >= 0 && T.cols[0] === commentsCol, JSON.stringify({ cols: T.cols, commentsCol, heads: T.heads }));
      check('a recorded reason reads "Why this severity: ..." there', T.recorded);
      check('a row with no reason shows the missing note (or ANEM\'s draft) there', T.missing);
      const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 15000 }).catch(() => null), pg.evaluate(() => exportData('AC_FHA', 'csv'))]);
      let csv = ''; if (dl) { const fp = await dl.path(); csv = fs.readFileSync(fp, 'utf8'); }
      check('the AC FHA CSV carries the reason in its own column beside Comments', /Why this severity,Comments/.test(csv.split('\n')[0] || '') && /Catastrophic by definition/.test(csv), (csv.split('\n')[0] || 'no download').slice(0, 300));
      check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    } finally { await b.close(); srv.close(); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  (mutation: ' + MUT + ')' : ''));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });
