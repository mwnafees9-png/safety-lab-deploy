#!/usr/bin/env node
/*
 * Regression: a customer's three-tier Jama function tree comes in exactly (27 Oct 2026).
 *
 * Waqas: "make sure there are no bugs on our side for their jama connection or the browser, they have
 * three tiers of functions, how do we enable them to map that stuff acurately" ... "it is a sub-sub
 * function, its nested relationships in a tree in the jama left hand nav".
 *
 * The real live_bridge.js, jama_tree.js, jama_kinds.js and func_tree.js run in a page against an
 * in-memory Jama shaped like theirs: one ticked folder holding Function > Sub-function > Sub-sub-function
 * items nested under one another, a folder between two tiers, a fourth level, a Text item, a requirement
 * nested under a function, 60 children under one function, rich descriptions with a table, a list and a
 * diagram. Pinned:
 *   1. Jama refuses /itemtypes (as at the customer): the check is HELD, nothing staged, and every page
 *      asks what each Jama item type is, with counts and examples;
 *   2. answered: tier 1 is the function, tier 2 a node under it, tier 3 a node under its tier 2
 *      (parentSubId), through a folder between tiers; the fourth level is named, not brought in; the
 *      Text item stays out; the nested requirement comes in as a requirement; the answers are kept with
 *      the ticked folder and survive the Jama browser; the review counts the tree by level;
 *   3. with /itemtypes readable nothing is asked: Text stays out, named types go where their names say;
 *   4. moves between tiers in Jama come through as moves with the right parent;
 *   5. descriptions keep table cells apart, list dashes and a marker for each diagram;
 *   6. a read cut short at the item limit flags nothing as missing;
 *   7. the Functions page shows the check's warnings.
 * Each is proven by reverting the code it guards (MUTATE=<name>).
 *
 * Run: node tests/regression_jama_three_tiers_20261027.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 700) + ')' : '')); } };
const REPO = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');

const MUTATIONS = {
  textskip:  ['live_bridge', "if (_isTextType(tid)) return { kind: 'skip', how: 'text' };", ''],
  ask:       ['live_bridge', "return { kind: '', how: 'ask' };", "return { kind: L.kind, how: 'only' };"],
  held:      ['live_bridge', 'if (items && Array.isArray(items._undecided) && items._undecided.length) {', 'if (false) {'],
  extrakind: ['live_bridge', '(pk.some(p => p.kind === k) || extra.has(k))', 'pk.some(p => p.kind === k)'],
  keeptypes: ['live_bridge', "p.types && typeof p.types === 'object' && Object.keys(p.types).length ? { types: p.types } : {}", '{}'],
  truncmiss: ['live_bridge', 'if (inp.truncated) [d]', 'if (false) [d]'],
  stripwarn: ['live_bridge', "if (d && (d.warnings || []).length) html +=", 'if (false) html +='],
  levelname: ['live_bridge', "const lv = (x.depth != null && x.depth > 0) ? _levelName(x.depth) + ' ' : '';", "const lv = '';"],
  cells:     ['jama_tree', ".replace(/<\\/\\s*(td|th)\\s*>/gi, ' | ')", ''],
  diagram:   ['jama_tree', 't = t.replace(/<\\s*(img|svg|object|embed|canvas)\\b[^>]*>/gi,', 't = t.replace(/<\\s*(imgX)\\b[^>]*>/gi,'],
};
const MUT = process.env.MUTATE || '';
function src(f) {
  let s = read('site/' + f + '.js');
  const m = MUT && MUTATIONS[MUT];
  if (MUT && !m) { console.error('unknown mutation ' + MUT); process.exit(3); }
  if (m && m[0] === f) { if (s.indexOf(m[1]) < 0) { console.error('mutation ' + MUT + ' anchor not found'); process.exit(4); } s = s.split(m[1]).join(m[2]); }
  return s;
}

// ------------------------------------------------------------------ Jama project 46, in memory
const T = { FUNC: 101, REQ: 102, FLD: 105, TXT: 108 };
const RICH = '<p>Keeps the aircraft on its path.</p><table><tr><th>Mode</th><th>Authority</th></tr><tr><td>Normal</td><td>Full</td></tr></table>' +
             '<ul><li>Pitch</li><li>Roll</li></ul><p><img src="/attachment/91/fig1.png" alt="Figure 1 [context] diagram"></p><script>alert(1)</script>';
function jama(opts) {
  const items = new Map();
  const add = (id, type, key, name, parent, seq, desc) => items.set(id, { id, documentKey: key, itemType: type, childItemType: type === T.FLD ? T.FUNC : undefined,
    fields: { name, description: desc || '<p>' + name + '</p>' }, location: { parent: parent != null ? { item: parent } : { project: 46 }, sequence: seq, globalSortOrder: id },
    modifiedDate: '2026-10-20T10:00:00.000+0000' });
  add(1, T.FLD, 'RAD-FLD-1', 'Aircraft functions', null, '1');
  add(2, T.TXT, 'RAD-TXT-2', 'Introduction', 1, '1.1', '<p>How the functions are organised</p>');
  add(10, T.FUNC, 'AF-1', 'Control flight path', 1, '1.2', RICH);
  add(11, T.FUNC, 'AF-1.1', 'Control pitch', 10, '1.2.1');
  add(111, T.FUNC, 'AF-1.1.1', 'Command elevator', 11, '1.2.1.1');
  add(112, T.FUNC, 'AF-1.1.2', 'Trim pitch', 11, '1.2.1.2');
  add(1121, T.FUNC, 'AF-1.1.2.1', 'A fourth level', 112, '1.2.1.2.1');
  add(12, T.FUNC, 'AF-1.2', 'Control roll', 10, '1.2.2');
  add(13, T.REQ, 'RAD-REQ-13', 'A requirement under a function', 10, '1.2.3');
  add(120, T.FLD, 'RAD-FLD-120', 'Roll detail', 12, '1.2.2.1');
  add(121, T.FUNC, 'AF-1.2.1', 'Command ailerons', 120, '1.2.2.1.1');
  add(20, T.FUNC, 'AF-2', 'Provide lift', 1, '1.3');
  add(30, T.FUNC, 'AF-3', 'Manage energy', 1, '1.4');
  for (let i = 1; i <= 60; i++) add(3000 + i, T.FUNC, 'AF-3.' + i, 'Energy function ' + i, 30, '1.4.' + i);
  add(9, T.FLD, 'RAD-FLD-9', 'Everything else', null, '2');
  const log = [];
  const forbid = new Set(opts && opts.typesOk ? [] : ['/rest/latest/itemtypes']);
  function get(url) {
    const u = new URL(url); log.push(u.pathname + u.search);
    if (forbid.has(u.pathname)) throw new Error('Jama refused ' + u.pathname + ' (HTTP 403).');
    const pg = list => { const st = Number(u.searchParams.get('startAt') || 0), mx = Math.min(50, Number(u.searchParams.get('maxResults') || 20)); return { meta: { pageInfo: { startIndex: st, totalResults: list.length } }, data: list.slice(st, st + mx) }; };
    const all = Array.from(items.values()); let m;
    if (u.pathname === '/rest/latest/projects') return pg([{ id: 46, projectKey: 'RAD', fields: { name: 'Radia Aircraft' } }]);
    if (u.pathname === '/rest/latest/itemtypes') return pg([{ id: T.FUNC, display: 'Function', typeKey: 'FUNC' }, { id: T.REQ, display: 'Requirement', typeKey: 'REQ' }, { id: T.FLD, display: 'Folder', typeKey: 'FLD' }, { id: T.TXT, display: 'Text', typeKey: 'TXT' }]);
    if (u.pathname === '/rest/latest/items' && u.searchParams.get('rootOnly') === 'true') return pg(all.filter(i => !i.location.parent.item));
    if ((m = /^\/rest\/latest\/items\/(\d+)\/children$/.exec(u.pathname))) return pg(all.filter(i => i.location.parent.item === Number(m[1])));
    if ((m = /^\/rest\/latest\/items\/(\d+)$/.exec(u.pathname))) { const it = items.get(Number(m[1])); if (!it) throw new Error('HTTP 404 at ' + u.pathname + '.'); return { data: it }; }
    if (u.pathname === '/rest/latest/abstractitems') { const want = new Set(u.searchParams.getAll('itemType').map(Number)); return pg(want.size ? all.filter(i => want.has(i.itemType)) : all); }
    if ((m = /^\/rest\/latest\/items\/(\d+)\/versions$/.exec(u.pathname))) return pg([]);
    throw new Error('HTTP 404 ' + u.pathname);
  }
  const move = (id, parent, seq) => { const it = items.get(id); it.location = { parent: { item: parent }, sequence: seq, globalSortOrder: id }; };
  return { items, add, get, log, forbid, move };
}

// ------------------------------------------------------------------ a page
function page(J, pc) {
  const els = new Map(), strips = new Map();
  const mk = id => ({ id, innerHTML: '', value: '', checked: false, type: 'text', style: {}, attrs: {}, className: '',
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {} });
  const holder = { insertBefore(e) { if (e.id) els.set(e.id, e); if (e.attrs && e.attrs['data-jb']) strips.set(e.attrs['data-jb'], e); }, querySelector: () => null };
  for (const id of ['reqif-host', 'ac-func-table', 'ac-req-table', 'ac-fcim-table']) { const e = mk(id); e.parentNode = holder; els.set(id, e); }
  const document = {
    readyState: 'complete', body: { appendChild(e) { if (e.id) els.set(e.id, e); } },
    getElementById: id => els.get(id) || null, addEventListener() {}, querySelectorAll: () => [],
    querySelector: q => { const m = /data-jb="([^"]+)"/.exec(q); return m ? strips.get(m[1]) || null : null; },
    createElement: () => mk(''),
  };
  const toasts = [];
  const ctx = {
    console, URL, setTimeout, clearTimeout, setInterval: () => 1, clearInterval: () => {}, navigator: { userAgent: 'test Electron/31' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, document, __slabDesktop: true,
    slabSecrets: { save: async () => ({ ok: true }), status: async () => ({ secrets: [{ kind: 'jama', meta: { baseHost: 'radia.jamacloud.com', user: 'cid', auth: 'oauth' } }] }) },
    slabBridge: { get: async u => { try { return { ok: true, data: J.get(u) }; } catch (e) { return { ok: false, error: e.message }; } } },
    acFunctionsData: [], acReqData: [], acAssumptionsData: [], acFcimData: [], acFhaData: [], acExtractedFCs: [], systemsData: [],
    projectConfig: pc, newRowId: (() => { let n = 0; return () => 'r' + (++n); })(), showToast: (m, k) => toasts.push([k, m]), toasts,
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.jrnl = () => {};
  vm.createContext(ctx);
  vm.runInContext(read('site/func_tree.js'), ctx, { filename: 'func_tree.js' });
  vm.runInContext(src('jama_tree'), ctx, { filename: 'jama_tree.js' });
  vm.runInContext(read('site/jama_kinds.js'), ctx, { filename: 'jama_kinds.js' });
  vm.runInContext(src('live_bridge'), ctx, { filename: 'live_bridge.js' });
  ctx._bridgeGet._waitMs = 0;
  ctx.SLFuncTree.setLevelLimit(3);
  ctx.els = els; ctx.strips = strips;
  return ctx;
}
const strip = (p, key) => { p._bridgeRender(); const e = p.strips.get(key); return e ? e.innerHTML : ''; };
const full = p => { p._bridgeRender(); const e = p.els.get('bridge-panel'); return e ? e.innerHTML : ''; };
const row = (p, sub) => p.acFunctionsData.find(r => r.subId === sub) || null;
const cfgOf = () => ({ jamaBridge: { kind: 'jama', baseUrl: 'https://radia.jamacloud.com', projectId: '46', auth: 'oauth',
  picks: [{ id: 1, key: 'RAD-FLD-1', name: 'Aircraft functions', seq: '1', kind: 'fn', container: true }] } });

(async function main() {
  console.log('\n[1] Jama refuses /itemtypes: the check holds and asks');
  const J = jama(); const pc = cfgOf(); const p = page(J, pc);
  let d = await p.bridgeCheck(true);
  check('the check is held, nothing is staged', d && d.held === true && p._bridgePending(d) === 0 && !d.fn && !d.req, JSON.stringify(d && { held: d.held, w: d.warnings }));
  const ty = (d && d.types) || [];
  const t = id => ty.find(x => x.typeId === id) || {};
  check('every Jama item type under the folder is listed, with a count and examples', ty.length === 3 && t(T.FUNC).count === 69 && t(T.TXT).count === 1 && t(T.REQ).count === 1 &&
        /RAD-TXT-2 Introduction/.test(t(T.TXT).examples.join()) && /AF-1 Control flight path/.test(t(T.FUNC).examples.join()), JSON.stringify(ty.map(x => [x.label, x.count, x.how])));
  check('without type names nobody can tell, so all three are asked', ty.every(x => x.how === 'ask' && !x.kind));
  check('folders are never asked about (looked through, not filed)', !ty.some(x => x.typeId === T.FLD));
  let h = strip(p, 'ac-func');
  check('the Functions page says nothing is staged and asks, with a chooser per type', /Nothing from Jama is staged yet: 3 kinds of Jama item/.test(h) && (h.match(/class="jb-type-kind"/g) || []).length === 3 &&
        /onchange="bridgeTypeKind\(1, 108, this\.value\)"/.test(h) && /<option value="skip">Leave out<\/option>/.test(h), h.slice(0, 400));
  check('the Requirements exchange panel asks too', /class="jb-types"/.test(full(p)));
  check('a held check offers nothing to sign', !/Sign and apply/.test(h) && !/Sign and apply/.test(full(p)));

  console.log('\n[2] answered: the three tiers land exactly');
  await p.bridgeTypeKind(1, T.TXT, 'skip');
  await p.bridgeTypeKind(1, T.REQ, 'req');
  d = await p.bridgeTypeKind(1, T.FUNC, 'fn');
  check('the answers are kept with the ticked folder', JSON.stringify(pc.jamaBridge.picks[0].types) === JSON.stringify({ 108: 'skip', 102: 'req', 101: 'fn' }), JSON.stringify(pc.jamaBridge.picks[0]));
  check('the check runs again and stages', d && !d.held && d.fn && p._bridgePending(d) > 0);
  check('the review counts the tree by level', d.fn && JSON.stringify(Array.from(d.fn.levels)) === '[3,62,3,1]' && /In Jama: 3 functions, 62 sub-functions, 3 sub-sub-functions, 1 level 4 function \(1 below the levels this project allows, not brought in\)\./.test(full(p)), JSON.stringify(d.fn && d.fn.levels));
  check('each new row says the level it lands at', /sub-sub-function under AF-1 &gt; AF-1\.1/.test(full(p)) && /sub-function under AF-1</.test(full(p)), (full(p).match(/AF-1\.1\.1[^]{0,300}/) || [''])[0]);
  check('the fourth level is named on the Functions page, not brought in', /below level 3: AF-1\.1\.2\.1/.test(strip(p, 'ac-func')) && !d.fn.fresh.some(x => x.item.key === 'AF-1.1.2.1'));
  const res = p.bridgeApply(d, 'Brian');
  check('signed and applied', res && res.ok, JSON.stringify(res));
  const r11 = row(p, 'AF-1.1'), r111 = row(p, 'AF-1.1.1'), r112 = row(p, 'AF-1.1.2'), r121 = row(p, 'AF-1.2.1'), r12 = row(p, 'AF-1.2');
  check('tier 1 is the function, tier 2 a node directly under it', r11 && r11.funcId === 'AF-1' && r11.funcName === 'Control flight path' && !r11.parentSubId && r12 && !r12.parentSubId, JSON.stringify(r11));
  check('tier 3 is a node under its tier 2 (parentSubId)', r111 && r111.funcId === 'AF-1' && r111.parentSubId === 'AF-1.1' && r112 && r112.parentSubId === 'AF-1.1', JSON.stringify(r111));
  check('a folder between tiers is looked through', r121 && r121.parentSubId === 'AF-1.2' && !p.acFunctionsData.some(r => /FLD/.test(r.subId || r.funcId)), JSON.stringify(r121));
  check('every row the Safety Lab tree sees as valid at its level', p.acFunctionsData.every(r => !p.SLFuncTree.check(r, p.acFunctionsData)) && p.acFunctionsData.every(r => p.SLFuncTree.level(r, p.SLFuncTree.index(p.acFunctionsData)) <= 3),
        p.acFunctionsData.filter(r => p.SLFuncTree.check(r, p.acFunctionsData)).map(r => r.subId + ': ' + p.SLFuncTree.check(r, p.acFunctionsData)).join('; '));
  check('a top function with nothing under it is a function-only row', p.acFunctionsData.some(r => r.funcId === 'AF-2' && !r.subId));
  check('the 60 children of one function all came in under it', p.acFunctionsData.filter(r => r.funcId === 'AF-3' && /^AF-3\.\d+$/.test(r.subId) && !r.parentSubId).length === 60);
  check('the Text item stays out', !p.acFunctionsData.some(r => /TXT|Introduction/.test((r.subId || '') + (r.funcId || '') + (r.subName || '') + (r.funcName || ''))) && !p.acReqData.some(r => /TXT/.test(JSON.stringify(r))));
  check('the requirement nested under a function comes in as a requirement, not a sub-function', !p.acFunctionsData.some(r => r.subId === 'RAD-REQ-13') && p.acReqData.some(r => r.reqSource && /RAD-REQ-13/.test(JSON.stringify(r))), JSON.stringify(p.acReqData.map(r => r.id)));
  const f1 = p.acFunctionsData.find(r => r.funcId === 'AF-1');
  check('the description keeps its table, list and a marker for the diagram', f1 && f1.funcDef === 'Keeps the aircraft on its path.\nMode | Authority\nNormal | Full\n- Pitch\n- Roll\n[image or diagram in Jama: Figure 1 context diagram]', JSON.stringify(f1 && f1.funcDef));
  check('nothing of a script in a description survives', !/alert/.test(JSON.stringify(p.acFunctionsData)));

  console.log('\n[3] the Jama browser keeps the answers');
  await p.bridgeBrowseUi();
  d = await p.bridgeBrowseBring();
  check('Bring in from the browser keeps what each Jama type is', pc.jamaBridge.picks[0].types && pc.jamaBridge.picks[0].types['108'] === 'skip' && d && !d.held, JSON.stringify(pc.jamaBridge.picks[0]));
  check('and the next check is quiet', d && p._bridgePending(d) === 0, d && p._bridgePending(d));

  console.log('\n[4] moves between tiers in Jama');
  J.move(111, 12, '1.2.2.9');          // a sub-sub-function moves to the other sub-function
  J.move(121, 10, '1.2.9');            // a sub-sub-function becomes a sub-function
  d = await p.bridgeCheck(true);
  const mv = k => d.fn.moved.find(x => x.item.key === k);
  check('both moves are seen, with their new place and level', mv('AF-1.1.1') && mv('AF-1.1.1').parent.key === 'AF-1.2' && mv('AF-1.2.1') && !mv('AF-1.2.1').parent &&
        /now sub-sub-function under AF-1 &gt; AF-1\.2/.test(full(p)), JSON.stringify(d.fn.moved.map(x => x.item.key)));
  p.bridgeApply(d, 'Brian');
  check('applied: the parents follow Jama', row(p, 'AF-1.1.1').parentSubId === 'AF-1.2' && !row(p, 'AF-1.2.1').parentSubId, JSON.stringify([row(p, 'AF-1.1.1'), row(p, 'AF-1.2.1')].map(r => r.parentSubId)));

  console.log('\n[5] with /itemtypes readable nothing is asked');
  const J2 = jama({ typesOk: true }); const pc2 = cfgOf(); const p2 = page(J2, pc2);
  const d2 = await p2.bridgeCheck(true);
  const t2 = id => (d2.types || []).find(x => x.typeId === id) || {};
  check('not held; Text stays out, Function and Requirement go where their names say', d2 && !d2.held && t2(T.TXT).how === 'text' && t2(T.TXT).kind === 'skip' &&
        t2(T.FUNC).kind === 'fn' && t2(T.REQ).kind === 'req' && t2(T.REQ).how === 'name', JSON.stringify(d2.types));
  check('the same tree is staged', d2.fn && JSON.stringify(Array.from(d2.fn.levels)) === '[3,62,3,1]' && d2.req.fresh.some(x => x.key === 'RAD-REQ-13') && !d2.fn.fresh.some(x => x.item.key === 'RAD-TXT-2'));
  const d2b = await p2.bridgeCheck(true);
  check('the type names are read once, not at every check', J2.log.filter(u => /itemtypes/.test(u)).length === 1, J2.log.filter(u => /itemtypes/.test(u)).length);
  check('a refused /itemtypes is asked once per session, not at every check', J.log.filter(u => /itemtypes/.test(u)).length <= 2, J.log.filter(u => /itemtypes/.test(u)).length);
  void d2b;

  console.log('\n[6] a read cut short flags nothing as missing');
  for (let i = 0; i < 20010; i++) J.add(100000 + i, T.REQ, 'RAD-X-' + i, 'x', 9, '2.' + (i + 1));
  J.items.delete(3060);                 // gone from Jama, but the read never reached the end
  d = await p.bridgeCheck(true);
  check('the limit is said, and nothing is flagged as missing', d && /Read the first 20,000 items of the Jama project only/.test(d.warnings.join(' ')) && d.fn.missing.length === 0 && d.req.missing.length === 0,
        JSON.stringify({ w: d && d.warnings, m: d && d.fn && d.fn.missing.length }));

  console.log('\n[7] the markup');
  const all = full(p) + strip(p, 'ac-func');
  const handlers = (all.match(/ on(click|change)="[^"]*"/g) || []).map(s => s.replace(/^ on\w+="|"$/g, ''));
  check('every chooser handler is ours with numeric ids', handlers.filter(s => /bridgeTypeKind/.test(s)).every(s => /^bridgeTypeKind\(\d+, \d+, this\.value\)$/.test(s)) && handlers.some(s => /bridgeTypeKind/.test(s)));
  check('the tags balance', (all.match(/<table/g) || []).length === (all.match(/<\/table>/g) || []).length && (all.match(/<select/g) || []).length === (all.match(/<\/select>/g) || []).length);
  for (const f of ['site/live_bridge.js', 'site/jama_tree.js']) {
    const s = read(f), i = s.indexOf('27 Oct 2026');
    check('no em dashes in what was added to ' + f, i > 0 && s.slice(i).split('\n').filter(l => /27 Oct 2026|_typeDecide|_typesHtml|_levelsLine|levelCounts/.test(l)).every(l => l.indexOf(String.fromCharCode(0x2014)) < 0));
  }

  if (!MUT) {
    console.log('\n[mutations] each check goes red when the thing it guards is reverted');
    for (const name of Object.keys(MUTATIONS)) {
      const r = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { MUTATE: name }), encoding: 'utf8', timeout: 300000 });
      const fails = (r.stdout.match(/^  FAIL  .*$/mg) || []);
      check('reverting "' + name + '" turns the test red (' + fails.length + ' failing)', (r.status === 1 && fails.length > 0) || r.status === 2, r.status + ' ' + (r.stderr || '').slice(0, 300));
    }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
