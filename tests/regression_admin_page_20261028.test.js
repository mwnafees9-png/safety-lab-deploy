#!/usr/bin/env node
/*
 * Regression: Admin is a page (28 Oct 2026).
 *
 * Waqas: "why dont we make admin a page instead of a a modal and make connections live there, this is not just a
 * requirements thing"; "AI key is fine where it is, seats, and licenses yes". Pinned:
 *   [A] the Admin section holds three pages, Connections, Workspaces and locks, Seats and license; Connections is no
 *       longer in Requirements; switchTab knows the three views (so it hides them when another page opens);
 *   [B] Workspaces and locks is drawn on the page, not in a window; the window is still there for any old caller;
 *   [C] Seats and license shows the license (who, plan, seats, end) and the seats in use; only an admin can load a
 *       renewed license, and a file that does not verify is refused with the plain reason, nothing stored;
 *   [D] in the real app (Playwright, when installed): the Admin section's tabs, each page shows and hides properly,
 *       no window opens, no page errors.
 * MUTATE=<name> reverts one guard; each must turn the test red.
 * Run: node tests/regression_admin_page_20261028.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 500) + ')' : '')); } };
const REPO = path.join(__dirname, '..');
const MUTATIONS = {
  views:  ['site/support_modules.js', "'stpa', 'interdep', 'conn', 'admin-ws', 'admin-lic'];", "'stpa', 'interdep'];"],
  inline: ['site/helpers_modules.js', "    if(!inline){\n    const ov=document.createElement('div'); ov.id='ws-panel';", "    if(true){\n    const ov=document.createElement('div'); ov.id='ws-panel';"],
  admin:  ['site/admin_page.js', "        if (!_isAdmin()) { say('Only an admin can load a new license.'); return; }", ''],
  nav:    ['site/nav_areas.js', "items: ['snav-conn', 'snav-ws-locks', 'snav-admin-lic'] }", "items: ['snav-ws-locks'] }"]
};
const MUT = process.env.MUTATE || '';
function read(p) {
  let s = fs.readFileSync(path.join(REPO, p), 'utf8');
  if (MUT) { const m = MUTATIONS[MUT]; if (!m) { console.error('unknown mutation'); process.exit(3); } if (m[0] === p) { if (s.indexOf(m[1]) < 0) { console.error('mutation anchor not found: ' + MUT); process.exit(4); } s = s.split(m[1]).join(m[2]); } }
  return s;
}

(async function main() {
  console.log('\n[A] the Admin section');
  const nav = read('site/nav_areas.js'), idx = read('site/index.html'), sup = read('site/support_modules.js');
  const areas = (function () { const m = /var AREAS = (\[[\s\S]*?\n    \]);/.exec(nav); return m ? vm.runInNewContext(m[1]) : []; })();
  const adm = areas.find(a => a.key === 'admin'), req = areas.find(a => a.key === 'req');
  check('Admin holds Connections, Workspaces and locks, Seats and license', adm && JSON.stringify(adm.items) === JSON.stringify(['snav-conn', 'snav-ws-locks', 'snav-admin-lic']), JSON.stringify(adm));
  check('Connections is no longer a Requirements page', req && req.items.indexOf('snav-conn') < 0);
  check('the three links open pages, not a window', /id="snav-conn" onclick="switchTab\('conn'\)"/.test(idx) && /id="snav-ws-locks" onclick="switchTab\('admin-ws'\)"/.test(idx) && /id="snav-admin-lic" onclick="switchTab\('admin-lic'\)"/.test(idx));
  check('the three views exist', ['view-conn', 'view-admin-ws', 'view-admin-lic'].every(id => idx.indexOf('id="' + id + '"') >= 0));
  check('switchTab knows the three views, so it hides them when another page opens', /'interdep', 'conn', 'admin-ws', 'admin-lic'\];/.test(sup));
  check('admin_page.js loads after connections.js and before nav_areas.js', (() => { const a = idx.indexOf('connections.js?v='), b = idx.indexOf('admin_page.js?v='), c = idx.indexOf('nav_areas.js?v='); return a > 0 && b > a && c > b; })());

  console.log('\n[B] Workspaces and locks on the page');
  const hm = read('site/helpers_modules.js');
  const fnSrc = (hm.match(/function openWorkspacesPanel\(host\)\{[\s\S]*?\n}\n/) || [''])[0];
  check('openWorkspacesPanel takes a host and draws there', !!fnSrc && /const inline = !!\(host && host\.nodeType === 1\);/.test(fnSrc));
  const els = {}, appended = [];
  const mkEl = id => ({ id, nodeType: 1, innerHTML: '', style: {}, listeners: {}, addEventListener(k, f) { this.listeners[k] = f; }, remove() {} });
  const host = mkEl('admin-ws-host');
  const ctx = { console, Date, JSON, String, Object, Array, systemsData: [{ id: 's1', name: 'Hydraulics' }], projectConfig: { changeLog: [{ ts: 1, name: 'Ana', summary: 'Locked Hydraulics' }] },
    document: { getElementById: id => { if (id === 'ws-areas' || id === 'ws-activity') { if (!els[id]) els[id] = mkEl(id); return els[id]; } return null; }, createElement: () => { const e = mkEl(''); appended.push(e); return e; }, body: { appendChild: e => appended.push(e) } },
    _wsUser: () => ({ email: 'ana@example.com', name: 'Ana' }), _wsEnsure: () => true, _wsGetLock: () => null, _wsGetOwner: () => '', _wsToast: () => {} };
  vm.createContext(ctx);
  vm.runInContext(fnSrc + '\n;globalThis.__ws = openWorkspacesPanel;', ctx);
  ctx.__ws(host);
  check('on the page: the areas and the activity are drawn into it, and no window opens', /Workspaces and locks/.test(host.innerHTML) && /Hydraulics/.test(els['ws-areas'].innerHTML) && /Locked Hydraulics/.test(els['ws-activity'].innerHTML) && appended.length === 0, 'appended ' + appended.length);
  const before = appended.length; for (const k in els) delete els[k];
  ctx.__ws();
  check('without a host: the window as before (for any old caller)', appended.length > before);

  console.log('\n[C] Seats and license');
  const ap = read('site/admin_page.js');
  const toasts = [], stored = [];
  const W = { SLConfig: { mode: 'self-hosted' }, SLLicense: { valid: true, customer: 'Example Aircraft Co', tier: 'pro_plus', seats: 10, expiresAt: '2027-01-31T00:00:00Z', daysLeft: 95, id: 'LIC-42', trial: false, present: true },
    SLSeats: { state: () => ({ active: true, status: 'held', seats: 10, inUse: 3, holders: [{ email: 'ana@example.com', you: true }, { email: 'sam@example.com' }] }) },
    SLConnections: { isAdmin: () => W.__admin }, __admin: true,
    SLLicenseInstall: async blob => { if (blob === 'GOOD') { stored.push(blob); return { valid: true, customer: 'Example Aircraft Co', tier: 'pro_plus', expiresAt: '2028-01-31T00:00:00Z' }; } return { valid: false, reason: 'signature invalid' }; },
    SLLicensePlainReason: r => r === 'signature invalid' ? 'This license file was altered or was not issued by Safety Lab Aero.' : r,
    location: { reload: () => { W.__reloaded = true; } }, addEventListener() {}, switchTab: function () {} };
  const doc = { _e: {}, getElementById(id) { return this._e[id] || null; } };
  doc._e['admin-lic-host'] = { innerHTML: '' }; doc._e['view-admin-lic'] = { style: { display: 'block' } };
  const c2 = { window: W, document: doc, console, setTimeout: f => f(), Date, JSON, Object, Array, String, Number };
  vm.createContext(c2); vm.runInContext(ap, c2);
  W.SLAdminPage.drawLic();
  const h = doc._e['admin-lic-host'].innerHTML;
  check('the license: who it is for, the plan, seats, the end date with days left, its number', /Example Aircraft Co/.test(h) && /pro_plus/.test(h) && />10</.test(h) && /2027-01-31 \(95 days left\)/.test(h) && /LIC-42/.test(h));
  check('the seats: 3 of 10 in use, by whom', /3 of 10 in use/.test(h) && /ana@example\.com \(you\)/.test(h) && /sam@example\.com/.test(h));
  check('an admin sees "Load a renewed license file"', /Load a renewed license file/.test(h));
  const setFile = txt => { doc._e['adm-lic-file'] = { files: [{ text: async () => txt }] }; doc._e['adm-lic-err'] = { textContent: '' }; };
  setFile('BAD'); await W.SLAdminPage.loadLicense();
  check('a file that does not verify is refused with the plain reason, nothing stored, no reload', /altered or was not issued/.test(doc._e['adm-lic-err'].textContent) && !stored.length && !W.__reloaded);
  setFile('GOOD'); await W.SLAdminPage.loadLicense();
  check('a renewed license that verifies is loaded and the page reloads to use it', stored.length === 1 && W.__reloaded === true);
  W.__admin = false; W.__reloaded = false; stored.length = 0;
  W.SLAdminPage.drawLic();
  check('someone who is not an admin is told only an admin can load one', /Only an admin can load a new license/.test(doc._e['admin-lic-host'].innerHTML) && !/Load a renewed license file/.test(doc._e['admin-lic-host'].innerHTML));
  setFile('GOOD'); await W.SLAdminPage.loadLicense();
  check('and cannot load one even by calling it directly', !stored.length && !W.__reloaded);
  W.SLConfig.mode = 'hosted-demo'; W.SLLicense = { valid: false, present: false, authoritative: false }; W.SLSeats = { state: () => ({ active: false, status: 'idle' }) };
  W.SLAdminPage.drawLic();
  check('on the hosted service: no license file to manage, no seats counted', /hosted service/.test(doc._e['admin-lic-host'].innerHTML) && /Seats are counted only on a customer/.test(doc._e['admin-lic-host'].innerHTML));

  console.log('\n[D] in the real app');
  let pw = null; try { pw = require('playwright'); } catch (_) {}
  if (!pw) console.log('  SKIP  Playwright is not installed here; [A]-[C] above prove the page');
  else {
    const http = require('http'), SITE = path.join(REPO, 'site');
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
    const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(404); return r.end(); }
      let b; try { b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
      const rel = 'site/' + path.relative(SITE, f).split(path.sep).join('/'); if (MUT && MUTATIONS[MUT][0] === rel) b = Buffer.from(read(rel));
      r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const b = await pw.chromium.launch();
    try {
      const pg = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e))); pg.on('dialog', d => d.dismiss().catch(() => {}));
      await pg.goto('http://127.0.0.1:' + srv.address().port + '/?ai=1'); await new Promise(r => setTimeout(r, 3500));
      await pg.evaluate(() => { const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked'); document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; }); });
      await pg.evaluate(async () => { await loadSampleProject(); }); await new Promise(r => setTimeout(r, 3000));
      const tabs = await pg.evaluate(() => { SLNavAreas.open('admin'); return Array.from(document.querySelectorAll('#sl-areabar a, #sl-areabar button')).map(x => x.textContent.trim()); });
      check('[D] the Admin section shows its three pages as tabs', JSON.stringify(tabs) === JSON.stringify(['Connections', 'Workspaces and locks', 'Seats and license']), JSON.stringify(tabs));
      const reqTabs = await pg.evaluate(() => { SLNavAreas.open('req'); return Array.from(document.querySelectorAll('#sl-areabar a, #sl-areabar button')).map(x => x.textContent.trim()); });
      check('[D] Requirements no longer lists Connections', reqTabs.length > 3 && reqTabs.indexOf('Connections') < 0, JSON.stringify(reqTabs));
      const vis = () => pg.evaluate(() => ['view-conn', 'view-admin-ws', 'view-admin-lic', 'view-dashboard'].map(id => { const e = document.getElementById(id); return e && e.style.display !== 'none' ? 1 : 0; }).join(''));
      await pg.evaluate(() => switchTab('conn')); check('[D] Connections shows alone', (await vis()) === '1000');
      await pg.evaluate(() => switchTab('admin-ws')); check('[D] Workspaces and locks shows alone, with no window', (await vis()) === '0100' && await pg.evaluate(() => !document.getElementById('ws-panel') && /Workspaces and locks/.test(document.getElementById('admin-ws-host').innerText)));
      await pg.evaluate(() => switchTab('admin-lic')); check('[D] Seats and license shows alone', (await vis()) === '0010' && await pg.evaluate(() => /License/.test(document.getElementById('admin-lic-host').innerText)));
      await pg.evaluate(() => switchTab('dashboard')); check('[D] another page hides all three', (await vis()) === '0001');
      check('[D] no page errors', errs.length === 0, errs.join(' | '));
    } finally { await b.close(); srv.close(); }
  }

  console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  (MUTATE=' + MUT + ')' : ''));
  if (!MUT && !process.env.NOMUT) {
    console.log('\n[M] every guard, reverted, turns this test red');
    const cp = require('child_process');
    for (const k of Object.keys(MUTATIONS)) {
      const r2 = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { MUTATE: k }), encoding: 'utf8', timeout: 180000 });
      check('mutation ' + k + ' goes red', r2.status === 1, (r2.stdout || '').split('\n').slice(-3).join(' ') + (r2.stderr || '').slice(0, 300));
    }
    console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  crashed: ' + (e && e.stack || e)); process.exit(1); });
