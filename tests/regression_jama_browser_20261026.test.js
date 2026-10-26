#!/usr/bin/env node
/*
 * Regression: the Jama browser replaces the item-type chooser (26 Oct 2026).
 *
 * Waqas: "once they click everything it should give them the JAMA browser and they select what they
 * want rather than having them select specific item types". Found at a customer: Jama Cloud refused
 * GET /rest/latest/itemtypes (HTTP 403), and the old chooser could not even start.
 *
 * What this pins (live_bridge.js in a page, against an in-memory Jama, rule 11: the browser's markup
 * is rendered and inspected, not assumed):
 *   1. saving the connection opens the browser; projects are listed, the configured one chosen;
 *   2. the project's top level is read 50 at a time; a folder's children are read only when it is
 *      opened, 50 at a time, with "Show more";
 *   3. ticking a folder brings in everything under it (through nested folders) through the existing
 *      check, review and signed apply; a single item comes in alone; folders are never filed;
 *      what is ticked keeps being watched (a new item under a ticked folder shows up at the next check);
 *   4. all of it works while Jama refuses /itemtypes, and the system folder choice does too;
 *   5. the 403 text from the desktop is shown where it happened (the project list);
 *   6. the markup: every handler is one of ours with a numeric id, names are escaped, an item under a
 *      ticked folder shows as coming in with it; the connection dialog has no item-type chooser left.
 * Then each check is proven by reverting the code it guards (MUTATE=<name>) and watching it go red.
 *
 * Run: node tests/regression_jama_browser_20261026.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 600) + ')' : '')); } };
const REPO = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');

const MUTATIONS = {
  nested:    ["(l.seq && n.seq && n.seq.indexOf(l.seq + '.') === 0)", "false"],
  container: ["const hit = container ? null : live.find(", "const hit = live.find("],
  lazy:      ["if (x.open && x.kids == null && !x.loading) return _brLoadKids(x, false);", ""],
  paging:    ["x.kids = (more && x.kids ? x.kids : []).concat(ids);", "x.kids = ids;"],
  picksread: ["if (picks.length) return _fetchPicked(cfg, picks);", ""],
  openafter: ["_render();\n            _openBrowserAfterSave();", "_render();"],
  context:   ["if (items && items._context instanceof Map) items._context.forEach((n, id) => cache.set(id, n));", ""],
  folders:   ["catch (_) { types = null; }", "catch (e) { throw e; }"],
  covered:   ["if (b.picks.has(p)) return b.picks.get(p);", "if (false) return null;"],
  escape:    ["'</span> <span>' + _esc(x.name) + '</span>'", "'</span> <span>' + x.name + '</span>'"],
  kindgate:  ["if (unset.length) msg =", "if (false) msg ="],
};
const MUT = process.env.MUTATE || '';
function liveBridgeSrc() {
  let src = read('site/live_bridge.js');
  if (MUT) {
    const m = MUTATIONS[MUT]; if (!m) { console.error('unknown mutation ' + MUT); process.exit(3); }
    if (src.indexOf(m[0]) < 0) { console.error('mutation ' + MUT + ' anchor not found'); process.exit(4); }
    src = src.split(m[0]).join(m[1]);
  }
  return src;
}

// ------------------------------------------------------------------ Jama project 46, in memory
const T = { FUNC: 101, REQ: 102, FLD: 105 };
function jama() {
  const items = new Map();
  const add = (id, type, key, name, parent, seq) => items.set(id, { id, documentKey: key, itemType: type, childItemType: type === T.FLD ? T.REQ : undefined,
    fields: { name, description: '<p>' + name + '</p>' }, location: { parent: parent != null ? { item: parent } : { project: 46 }, sequence: seq, globalSortOrder: id },
    modifiedDate: '2026-10-20T10:00:00.000+0000' });
  add(1, T.FLD, 'RAD-FLD-1', 'Aircraft functions', null, '1');
  add(10, T.FUNC, 'AF-1', 'Control flight path', 1, '1.1');
  add(11, T.FUNC, 'AF-1.1', 'Control pitch', 10, '1.1.1');
  add(12, T.FUNC, 'AF-1.2', 'Control roll', 10, '1.1.2');
  add(13, T.FLD, 'RAD-FLD-13', 'More sub-functions', 10, '1.1.3');
  add(14, T.FUNC, 'AF-1.3', 'Control yaw', 13, '1.1.3.1');
  add(2, T.FLD, 'RAD-FLD-2', 'Aircraft requirements', null, '2');
  for (let i = 1; i <= 120; i++) add(1000 + i, T.REQ, 'RAD-REQ-' + i, 'Requirement ' + i, 2, '2.' + i);
  add(3, T.FLD, 'RAD-FLD-3', 'Nested folder', 2, '2.121');
  add(300, T.REQ, 'RAD-REQ-300', 'Nested requirement', 3, '2.121.1');
  add(4, T.FLD, 'RAD-FLD-4', 'Loose items', null, '3');
  add(400, T.REQ, 'RAD-REQ-400', 'Lone requirement', 4, '3.1');
  add(401, T.REQ, 'RAD-X-401', 'Something else', 4, '3.2');
  add(5, T.FLD, 'RAD-FLD-5', '<img src=x onerror=alert(1)>', null, '4');
  for (let i = 0; i < 51; i++) add(600 + i, T.FLD, 'RAD-ARC-' + i, 'Archive ' + i, null, String(5 + i));
  const forbid = new Set(['/rest/latest/itemtypes']);
  const log = [];
  function get(url) {
    const u = new URL(url); log.push(u.pathname + u.search);
    if (forbid.has(u.pathname)) throw new Error('Jama refused ' + u.pathname + ' (HTTP 403). Jama says: "User does not have permission to view item types". The sign-in itself worked.');
    const pg = list => { const st = Number(u.searchParams.get('startAt') || 0), mx = Math.min(50, Number(u.searchParams.get('maxResults') || 20)); return { meta: { pageInfo: { startIndex: st, totalResults: list.length } }, data: list.slice(st, st + mx) }; };
    const all = Array.from(items.values()); let m;
    if (u.pathname === '/rest/latest/projects') return pg([{ id: 46, projectKey: 'RAD', fields: { name: 'Radia Aircraft' } }, { id: 47, projectKey: 'OLD', fields: { name: 'Old program' } }]);
    if (u.pathname === '/rest/latest/itemtypes') return pg([{ id: T.FUNC, display: 'Function', typeKey: 'FUNC' }, { id: T.REQ, display: 'Requirement', typeKey: 'REQ' }, { id: T.FLD, display: 'Folder', typeKey: 'FLD' }]);
    if (u.pathname === '/rest/latest/items' && u.searchParams.get('rootOnly') === 'true') return pg(u.searchParams.get('project') === '46' ? all.filter(i => !i.location.parent.item) : []);
    if ((m = /^\/rest\/latest\/items\/(\d+)\/children$/.exec(u.pathname))) return pg(all.filter(i => i.location.parent.item === Number(m[1])));
    if ((m = /^\/rest\/latest\/items\/(\d+)$/.exec(u.pathname))) { const it = items.get(Number(m[1])); if (!it) throw new Error('HTTP 404 from radia.jamacloud.com at ' + u.pathname + '.'); return { data: it }; }
    if (u.pathname === '/rest/latest/abstractitems') { const want = new Set(u.searchParams.getAll('itemType').map(Number)); return pg(want.size ? all.filter(i => want.has(i.itemType)) : all); }
    throw new Error('HTTP 404 ' + u.pathname);
  }
  return { items, add, get, log, forbid };
}

// ------------------------------------------------------------------ a page
function page(J, pc) {
  const els = new Map();
  const el = id => { const e = { id, innerHTML: '', value: '', checked: false, type: 'text', style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {} }; els.set(id, e); return e; };
  const document = {
    readyState: 'complete', body: { appendChild(e) { if (e.id) els.set(e.id, e); } },
    getElementById: id => els.get(id) || null, addEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
    createElement: () => ({ innerHTML: '', style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {} }),
  };
  const toasts = [];
  const ctx = {
    console, URL, setTimeout, clearTimeout, setInterval: () => 1, clearInterval: () => {}, navigator: { userAgent: 'test Electron/31' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, document,
    __slabDesktop: true, slabSecrets: { save: async () => ({ ok: true }), status: async () => ({ secrets: [{ kind: 'jama', meta: { baseHost: 'radia.jamacloud.com', user: 'cid', auth: 'oauth' } }] }) },
    slabBridge: { get: async u => { try { return { ok: true, data: J.get(u) }; } catch (e) { return { ok: false, error: e.message }; } } },
    acFunctionsData: [], acReqData: [], acAssumptionsData: [], acFcimData: [], acFhaData: [], acExtractedFCs: [],
    systemsData: [{ id: 'sys-fcs', name: 'Flight Control System', functions: [], req: [], asm: [], fcim: [], fha: [], extractedFCs: [] }],
    projectConfig: pc, newRowId: (() => { let n = 0; return () => 'r' + (++n); })(), showToast: (m, k) => toasts.push([k, m]), toasts,
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.jrnl = () => {};
  vm.createContext(ctx);
  for (const f of ['site/func_tree.js', 'site/jama_tree.js', 'site/jama_kinds.js']) vm.runInContext(read(f), ctx, { filename: f });
  vm.runInContext(liveBridgeSrc(), ctx, { filename: 'site/live_bridge.js' });
  ctx._bridgeGet._waitMs = 0;
  ctx.els = els; ctx.el = el;
  return ctx;
}
const browserHtml = p => { const e = p.els.get('jb-browse'); return e && e.style.display !== 'none' ? e.innerHTML : ''; };
const rows = h => (h.match(/class="jb-br-row" data-id="\d+"/g) || []).length;
const rowHtml = (h, id) => { const i = h.indexOf('class="jb-br-row" data-id="' + id + '"'); return i < 0 ? '' : h.slice(i, h.indexOf('</div>', i)); };

(async function main() {
  const J = jama();
  const pc = { jamaBridge: { kind: 'jama', baseUrl: 'https://radia.jamacloud.com', projectId: '46', auth: 'oauth' } };
  const p = page(J, pc);

  console.log('\n[1] saving the connection opens the browser');
  for (const [id, v] of [['lb-url', 'https://radia.jamacloud.com'], ['lb-pid', '46'], ['lb-user', 'cid'], ['lb-token', 'secret'], ['lb-auth', 'oauth']]) p.el(id).value = v;
  const cb = p.el('lb-auto'); cb.type = 'checkbox';
  await p.bridgeSaveUi();
  await new Promise(r => setTimeout(r, 20));
  let h = browserHtml(p);
  check('the browser is open after Save', !!h && /Choose what comes in from Jama/.test(h), h.slice(0, 200));
  check('the project list is read and the configured project is chosen', /<option value="46" selected>Radia Aircraft \(RAD\), id 46<\/option>/.test(h) && /<option value="47">/.test(h), (h.match(/<select id="jb-br-proj"[\s\S]*?<\/select>/) || [''])[0]);
  check('Jama refused the item types, and the browser says so in plain words and carries on', /Jama did not list its item types/.test(h) && /Jama refused \/rest\/latest\/itemtypes \(HTTP 403\)/.test(h));
  check('nothing on the page asks for the login back', !/secret/.test(JSON.stringify(pc)));

  console.log('\n[2] the tree, the way Jama shows it, read as it is opened');
  check('the top level, 50 at a time', rows(h) === 50 && /Show more \(50 of 55\)/.test(h), rows(h));
  check('the top level was asked for with rootOnly, 50 at a time', J.log.some(u => u === '/rest/latest/items?project=46&rootOnly=true&maxResults=50&startAt=0'));
  check('no folder\'s children were read before it was opened', !J.log.some(u => /\/children/.test(u)));
  await p.bridgeBrowseMore();
  h = browserHtml(p);
  check('Show more reads the next page of the top level', rows(h) === 55 && !/Show more/.test(h), rows(h));
  await p.bridgeBrowseToggle(2);
  h = browserHtml(p);
  check('opening a folder reads its children, 50 at a time', J.log.some(u => u === '/rest/latest/items/2/children?maxResults=50&startAt=0') && /Show more \(50 of 121\)/.test(h) && rows(h) === 105, rows(h));
  await p.bridgeBrowseMore(2); await p.bridgeBrowseMore(2);
  h = browserHtml(p);
  check('Show more under a folder reads the rest of it', rows(h) === 55 + 121 && !/Show more/.test(h) && J.log.some(u => u === '/rest/latest/items/2/children?maxResults=50&startAt=100'), rows(h));
  check('folders are marked as folders without the item types', / class="jb-br-type"[^>]*>Folder or set</.test(rowHtml(h, 2)));

  console.log('\n[3] tick, say what it is, bring in');
  p.bridgeBrowsePick(2, true);
  h = browserHtml(p);
  check('a ticked folder: guessed as requirements from its name, changeable', /<tr data-id="2">[\s\S]*?<option value="req" selected>Requirements<\/option>/.test(h));
  check('everything under a ticked folder shows as coming in with it', /disabled title="Comes in with RAD-FLD-2"/.test(rowHtml(h, 1001)) && /comes in with RAD-FLD-2/.test(rowHtml(h, 3)));
  await p.bridgeBrowseToggle(1); p.bridgeBrowsePick(1, true);
  await p.bridgeBrowseToggle(4); p.bridgeBrowsePick(400, true); p.bridgeBrowsePick(401, true);
  const before = JSON.stringify(pc.jamaBridge);
  const refused = await p.bridgeBrowseBring();
  h = browserHtml(p);
  check('Bring in is refused while something has no kind, and it is named', refused === null && /Say what this is in Safety Lab first: RAD-X-401\./.test(h) && JSON.stringify(pc.jamaBridge) === before, (h.match(/class="jb-br-msg"[^>]*>[^<]*/) || [''])[0]);
  p.bridgeBrowsePick(401, false);
  J.log.length = 0;
  const d = await p.bridgeBrowseBring();
  const picks = pc.jamaBridge.picks || [];
  check('what was ticked is the project\'s choice now (ids, keys, kinds), the browser closed', picks.length === 3 && picks.find(x => x.id === 2).kind === 'req' && picks.find(x => x.id === 1).kind === 'fn' && picks.find(x => x.id === 400).kind === 'req' && !browserHtml(p), JSON.stringify(picks));
  check('the check never asks for the item types, and reads the project without a type filter', !J.log.some(u => /itemtypes/.test(u)) && J.log.some(u => /^\/rest\/latest\/abstractitems\?project=46&maxResults=50&startAt=0$/.test(u)), J.log.slice(0, 6).join(' '));
  const keys = d && d.req ? d.req.fresh.map(x => x.key) : [];
  check('a ticked folder brings in everything under it, through a folder inside it', d && keys.length === 122 && keys.indexOf('RAD-REQ-300') >= 0 && keys.indexOf('RAD-REQ-120') >= 0, keys.length);
  check('a single ticked item comes in alone; its neighbour does not', keys.indexOf('RAD-REQ-400') >= 0 && keys.indexOf('RAD-X-401') < 0);
  check('folders and sets are never filed', !keys.some(k => /FLD/.test(k)) && !(d.fn ? d.fn.fresh : []).some(x => /FLD/.test(x.item.key)));
  check('functions come in as a tree, looking through a folder between them', d.fn && d.fn.fresh.length === 3 && d.fn.fresh.every(x => x.top.key === 'AF-1') && d.fn.fresh.some(x => x.item.key === 'AF-1.3'), JSON.stringify(d.fn && d.fn.fresh.map(x => x.item.key + '<' + x.top.key)));
  check('looking through that folder asked Jama nothing more', !J.log.some(u => u === '/rest/latest/items/13'), J.log.filter(u => /items\/\d+$/.test(u)).join(' '));
  const ok = p.bridgeApply(d, 'Brian');
  check('the existing signed apply files them: requirements and functions in their own stores', ok.ok && p.acReqData.length === 122 && p.acFunctionsData.length === 3 && p.acReqData.every(r => r.reqSource && r.reqSource.tool === 'jama-live'));
  J.add(301, T.REQ, 'RAD-REQ-301', 'Added later in Jama', 3, '2.121.2');
  const d2 = await p.bridgeCheck(true);
  check('a ticked folder keeps being watched: a new item under it shows up at the next check', d2.req.fresh.length === 1 && d2.req.fresh[0].key === 'RAD-REQ-301' && d2.req.changed.length === 0 && d2.req.missing.length === 0, JSON.stringify({ f: d2.req.fresh.map(x => x.key), m: d2.req.missing.length }));

  console.log('\n[4] with /itemtypes refused, the rest still works');
  const folders = await p.bridgeFetchContainers().catch(e => e);
  check('the system folder choice finds the folders by their shape', Array.isArray(folders) && folders.length === 55 + 2 && folders.every(f => /FLD|ARC/.test(f.key)), folders && folders.message);

  console.log('\n[5] a refusal is shown where it happened');
  J.forbid.add('/rest/latest/projects');
  await p.bridgeBrowseUi();
  h = browserHtml(p);
  check('the project list refused: Jama\'s path and reason on screen, and the configured project still browses', /The project list could not be read\. Jama refused \/rest\/latest\/projects \(HTTP 403\)/.test(h) && /Showing project 46 from the connection/.test(h) && rows(h) === 50);
  J.forbid.delete('/rest/latest/projects');

  console.log('\n[6] the markup');
  await p.bridgeBrowseUi(); await p.bridgeBrowseToggle(2);
  h = browserHtml(p);
  const handlers = (h.match(/ on(click|change)="[^"]*"/g) || []).map(s => s.replace(/^ on\w+="|"$/g, ''));
  const okHandler = s => /^bridgeBrowse(Toggle|More|Pick|Kind|Project|Bring|Close)\((\d*|\d+, (this\.checked|false)|\d+, this\.value|this\.value)\)$/.test(s);
  check('every handler in the browser is one of ours, with a numeric id', handlers.length > 100 && handlers.every(okHandler), handlers.filter(s => !okHandler(s)).slice(0, 3).join(' | '));
  check('a Jama name is shown as text, never as markup', h.indexOf('<img src=x') < 0 && h.indexOf('&lt;img src=x onerror=alert(1)&gt;') > 0);
  check('the saved choice is ticked when the browser opens again', /value="2" checked/.test(rowHtml(h, 2)) && /<tr data-id="400">/.test(h));
  check('the tags balance', (h.match(/<div/g) || []).length === (h.match(/<\/div>/g) || []).length && (h.match(/<select/g) || []).length === (h.match(/<\/select>/g) || []).length);
  p.bridgeBrowseClose();
  p.bridgeSetupUi();
  const s = (p.els.get('jb-setup') || {}).innerHTML || '';
  check('the connection dialog: no item-type chooser, says what comes in, offers the browser', !/lb-fn-type|bridgeTypesSaveUi|Choose item types/.test(s) && /What comes in\.<\/b> 3 chosen in Jama/.test(s) && /onclick="bridgeBrowseUi\(\)"/.test(s), s.slice(0, 300));
  const lb = read('site/live_bridge.js');
  check('no em dashes in what v4 added', lb.slice(lb.indexOf('v4.0, 26 Oct 2026')).indexOf(String.fromCharCode(0x2014)) < 0);

  if (!MUT) {
    console.log('\n[mutations] each check goes red when the thing it guards is reverted');
    for (const name of Object.keys(MUTATIONS)) {
      const r = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { MUTATE: name }), encoding: 'utf8', timeout: 120000 });
      const fails = (r.stdout.match(/^  FAIL  .*$/mg) || []);
      check('reverting "' + name + '" turns the test red (' + fails.length + ' failing)', (r.status === 1 && fails.length > 0) || r.status === 2, r.status + ' ' + (r.stderr || '').slice(0, 300));
    }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
