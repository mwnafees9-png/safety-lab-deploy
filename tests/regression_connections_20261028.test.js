#!/usr/bin/env node
/*
 * Regression: Safety Lab Connections, the owner model for linked items, on the existing Jama connection (28 Oct 2026).
 *
 * Waqas: "if safety lab is the source of truth then we can edit, if jama is the source of truth no edit permissions";
 * "only for the items being linked not for all the fields"; changes from the owner are flagged and "never update[d]
 * automatically without their engineering teams consent"; "we provide users the interface and ability to push changes
 * directly to that tool"; a pop-up at sign-in with Accept, Reject or Later; the pill "4 incoming changes from Jama + 6
 * changes to confirm"; a reminder at sign-out. The real connections.js, live_bridge.js, jama_tree.js, jama_kinds.js
 * and func_tree.js run against an in-memory Jama that reads and writes. Pinned:
 *   [A] every staged Jama change is one line; accepting one applies only it (and the new parents a new function
 *       hangs under); a rejected line stays out, recorded, until Jama changes the item again; a page panel's sign
 *       never takes a rejected line;
 *   [B] owners: only an admin, with a reason, changes one; an edit made in Jama to an item Safety Lab owns is never
 *       incoming, it is flagged in History once; a row Jama owns is put back when edited in Safety Lab, a row
 *       Safety Lab owns is not;
 *   [C] sending: a failure condition made in Safety Lab is created in the chosen Jama folder, linked to its function's
 *       Jama item, with a comment saying who sent it; an edit goes out as a change; a change made in Jama since is
 *       held back, never overwritten; an item from Jama that Safety Lab owns is sent as a change; nothing is deleted,
 *       nothing goes to another host or path; the browser-only door does not write;
 *   [D] History records checks, signatures, rejections, flags, sends, holds and owner changes, and exports;
 *   [E] in the real app: the pop-up lists what came in, signs from it, Later leaves the pill; the one pill reads
 *       "N incoming changes from Jama + M changes to confirm"; a worksheet shows the lock and will not open the
 *       editor of a row Jama owns; an edit to it is put back; the reminder names what was not sent before leaving.
 * MUTATE=<name> reverts one guard; each must turn the test red.
 *
 * Run: node tests/regression_connections_20261028.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), http = require('http'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 600) + ')' : '')); } };
const REPO = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');
const MUTATIONS = {
  subset:   ['site/live_bridge.js', "if (Array.isArray(x[arr])) y[arr] = x[arr].filter(e => want.has(_ceKey(scope, k, arr, e)));", ''],
  parents:  ['site/live_bridge.js', "            x.fresh.forEach(e => { if (want.has(_ceKey(scope, 'fn', 'fresh', e))) pull(e); });", ''],
  rejected: ['site/connections.js', "if (s && s.decisions && s.decisions[c.key] && s.decisions[c.key].d === 'rejected') return 'rejected';", ''],
  owned:    ['site/connections.js', "if (c.remoteId != null && c.change !== 'added' && ownerOf(c.tool, c.remoteId) === 'sl') return 'owned';", ''],
  admin:    ['site/connections.js', "if (!isAdmin()) return { ok: false, err: 'Only an admin can change who owns a linked item.' };", ''],
  guard:    ['site/connections.js', "if (a !== b) { if (before[k] === undefined) delete after[k]; else after[k] = JSON.parse(JSON.stringify(before[k])); back.push(k); }", "if (a !== b) { back.push(k); }"],
  held:     ['site/live_bridge.js', "if (link.modified && String(now.modifiedDate || '') !== String(link.modified)) {", "if (false) {"],
  fence:    ['site/live_bridge.js', "if (method !== 'POST' && method !== 'PATCH') return 'Safety Lab only creates and changes items in Jama; it never deletes';", ''],
  panel:    ['site/live_bridge.js', "const r = (_cx && typeof _cx.signLines === 'function')", "const r = (false)"],
  lockui:   ['site/support_modules.js', "{ const lk = _crudLock(key, item); if (lk) { _crudLockSay(lk); return; } }   // 28 Oct 2026", ''],
  pill:     ['site/change_ack.js', "var inTxt = ''; try { var CX = W.SLConnections; if (CX && typeof CX.pillText === 'function') inTxt = CX.pillText() || ''; } catch (_) { inTxt = ''; }", "var inTxt = '';"],
  leave:    ['site/save_state.js', "try { var CX = W.SLConnections; if (CX && typeof CX.beforeLeave === 'function' && !(await CX.beforeLeave(reason || 'leave'))) { _paint(); return false; } } catch (_) {}", '']
};
const MUT = process.env.MUTATE || '';
let NO_E = false;   // [E] (the real app) could not run here: its guards are proven where it can
const UI_ONLY = { lockui: 1, pill: 1, leave: 1 };
function src(p) {
  let s = read(p);
  if (MUT) { const m = MUTATIONS[MUT]; if (!m) { console.error('unknown mutation ' + MUT); process.exit(3); } if (m[0] === p) { if (s.indexOf(m[1]) < 0) { console.error('mutation ' + MUT + ' anchor not found'); process.exit(4); } s = s.split(m[1]).join(m[2]); } }
  return s;
}
// ------------------------------------------------------------------ an in-memory Jama that reads and writes
const JAMA_SRC = "// An in-memory Jama (read and write), shaped like the REST API Safety Lab uses.\nmodule.exports = function jama() {\n  const T = { FUNC: 101, REQ: 102, FLD: 105, FC: 109 };\n  const items = new Map(); let nextId = 5000; let clock = 0;\n  const stamp = () => '2026-10-28T10:' + String(10 + (clock++ % 49)).padStart(2, '0') + ':00.000+0000';\n  const add = (id, type, key, name, parent, seq, extra) => { const it = { id, documentKey: key, itemType: type, childItemType: type === T.FLD ? T.REQ : undefined,\n    fields: Object.assign({ name, description: '<p>' + name + ' description</p>' }, extra || {}), location: { parent: parent != null ? { item: parent } : { project: 46 }, sequence: seq, globalSortOrder: id },\n    modifiedDate: '2026-10-20T10:00:00.000+0000' }; items.set(id, it); return it; };\n  add(1, T.FLD, 'RAD-FLD-1', 'Aircraft functions', null, '1');\n  add(10, T.FUNC, 'AF-1', 'Control flight path', 1, '1.1');\n  add(11, T.FUNC, 'AF-1.1', 'Control pitch', 10, '1.1.1');\n  add(111, T.FUNC, 'AF-1.1.1', 'Command elevator', 11, '1.1.1.1');\n  add(112, T.FUNC, 'AF-1.1.2', 'Trim pitch', 11, '1.1.1.2');\n  add(12, T.FUNC, 'AF-1.2', 'Control roll', 10, '1.1.2');\n  add(121, T.FUNC, 'AF-1.2.1', 'Command ailerons', 12, '1.1.2.1');\n  add(2, T.FLD, 'RAD-FLD-2', 'Aircraft requirements', null, '2');\n  add(201, T.REQ, 'RAD-REQ-1', 'The aircraft shall be controllable in pitch.', 2, '2.1');\n  add(202, T.REQ, 'RAD-REQ-2', 'The aircraft shall be controllable in roll.', 2, '2.2');\n  add(3, T.FLD, 'RAD-FLD-3', 'Safety analysis', null, '3');\n  const log = [], writes = [];\n  const touch = it => { it.modifiedDate = stamp(); };\n  function get(url) {\n    const u = new URL(url); log.push('GET ' + u.pathname + u.search);\n    const pg = list => { const st = Number(u.searchParams.get('startAt') || 0), mx = Math.min(50, Number(u.searchParams.get('maxResults') || 20)); return { meta: { pageInfo: { startIndex: st, totalResults: list.length } }, data: list.slice(st, st + mx) }; };\n    const all = Array.from(items.values()); let m;\n    if (u.pathname.endsWith('/rest/latest/projects')) return pg([{ id: 46, projectKey: 'RAD', fields: { name: 'Example aircraft' } }]);\n    if (u.pathname.endsWith('/rest/latest/itemtypes')) return pg([{ id: T.FUNC, display: 'Function', typeKey: 'FUNC' }, { id: T.REQ, display: 'Requirement', typeKey: 'REQ' }, { id: T.FLD, display: 'Folder', typeKey: 'FLD' }, { id: T.FC, display: 'Failure condition', typeKey: 'FC' }]);\n    if (u.pathname.endsWith('/rest/latest/items') && u.searchParams.get('rootOnly') === 'true') return pg(all.filter(i => !i.location.parent.item));\n    if ((m = /\\/rest\\/latest\\/items\\/(\\d+)\\/children$/.exec(u.pathname))) return pg(all.filter(i => i.location.parent.item === Number(m[1])));\n    if ((m = /\\/rest\\/latest\\/items\\/(\\d+)\\/versions$/.exec(u.pathname))) return { meta: { pageInfo: { totalResults: 1 } }, data: [] };\n    if ((m = /\\/rest\\/latest\\/items\\/(\\d+)$/.exec(u.pathname))) { const it = items.get(Number(m[1])); if (!it) throw new Error('HTTP 404 at ' + u.pathname); return { data: JSON.parse(JSON.stringify(it)) }; }\n    if (u.pathname.endsWith('/rest/latest/abstractitems')) { const want = new Set(u.searchParams.getAll('itemType').map(Number)); return pg(want.size ? all.filter(i => want.has(i.itemType)) : all); }\n    if (u.pathname.endsWith('/rest/latest/relationships')) return pg([]);\n    throw new Error('HTTP 404 ' + u.pathname);\n  }\n  function write(method, url, body) {\n    const u = new URL(url); writes.push({ method, path: u.pathname, body: JSON.parse(JSON.stringify(body || null)) });\n    let m;\n    if (method === 'POST' && u.pathname.endsWith('/rest/latest/items')) {\n      const id = nextId++; const parent = body.location && body.location.parent && body.location.parent.item;\n      add(id, body.itemType, 'RAD-FC-' + id, body.fields.name, parent || null, '3.' + id, Object.assign({}, body.fields)); touch(items.get(id));\n      return { status: 201, data: { meta: { status: 'Created', id: id, location: url + '/' + id } } };\n    }\n    if (method === 'PATCH' && (m = /\\/rest\\/latest\\/items\\/(\\d+)$/.exec(u.pathname))) {\n      const it = items.get(Number(m[1])); if (!it) return { status: 404, data: { meta: { message: 'not found' } } };\n      (body || []).forEach(op => { const k = String(op.path || '').replace(/^\\/fields\\//, ''); if (op.op === 'replace' || op.op === 'add') it.fields[k] = op.value; }); touch(it);\n      return { status: 200, data: { meta: { status: 'OK' } } };\n    }\n    if (method === 'POST' && u.pathname.endsWith('/rest/latest/relationships')) return { status: 201, data: { meta: { id: nextId++ } } };\n    if (method === 'POST' && (m = /\\/rest\\/latest\\/items\\/(\\d+)\\/comments$/.exec(u.pathname))) return { status: 201, data: { meta: { id: nextId++ } } };\n    return { status: 404, data: { meta: { message: 'no such endpoint ' + u.pathname } } };\n  }\n  return { T, items, add, get, write, log, writes, touch };\n};\n";
const jama = (function () { const module = { exports: null }; new Function('module', JAMA_SRC)(module); return module.exports; })();
function page(J, pc, opts) {
  opts = opts || {};
  const document = { readyState: 'complete', body: { appendChild() {} }, head: { appendChild() {} }, documentElement: { appendChild() {} },
    getElementById: () => null, addEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
    createElement: () => ({ innerHTML: '', style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {}, remove() {} }) };
  const toasts = [];
  const ctx = { console, URL, setTimeout, clearTimeout, setInterval: () => 1, clearInterval: () => {}, navigator: { userAgent: opts.web ? 'test browser' : 'test Electron/31' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, document, Blob: function () {}, btoa: s => Buffer.from(s).toString('base64'),
    acFunctionsData: [], acReqData: [], acAssumptionsData: [], acFcimData: [], acFhaData: [], acExtractedFCs: [], ftaPages: [],
    systemsData: [{ id: 'sys-fcs', name: 'Flight Control System', functions: [], req: [], asm: [], fcim: [], fha: [], extractedFCs: [] }],
    projectConfig: pc, newRowId: (() => { let n = 0; return () => 'r' + (++n); })(), showToast: (m, k) => toasts.push([k, m]), toasts, scheduleAutosave: () => {},
    getActiveWorkspace: () => opts.role ? { myRole: opts.role } : null };
  if (!opts.web) {
    ctx.__slabDesktop = true;
    ctx.slabSecrets = { save: async () => ({ ok: true }), status: async () => ({ secrets: [{ kind: 'jama', meta: { baseHost: 'example.jamacloud.com', user: 'cid', auth: 'oauth' } }] }) };
    ctx.slabBridge = { get: async u => { try { return { ok: true, data: J.get(u) }; } catch (e) { return { ok: false, error: e.message }; } },
                       send: async (m, u, b) => { const r = J.write(m, u, b); return r.status < 300 ? { ok: true, status: r.status, data: r.data } : { ok: false, status: r.status, error: 'HTTP ' + r.status }; } };
  } else {
    ctx.SecretStore = { door: () => 'session', has: () => true, get: () => 'secret', meta: () => ({ user: 'cid', auth: 'basic' }) };
    ctx.fetch = async () => { throw new Error('the test page made a network request'); };
  }
  ctx.window = ctx; ctx.globalThis = ctx; ctx.jrnl = () => {};
  vm.createContext(ctx);
  for (const f of ['site/func_tree.js', 'site/jama_tree.js', 'site/jama_kinds.js', 'site/connections.js', 'site/live_bridge.js']) vm.runInContext(src(f), ctx, { filename: f });
  ctx._bridgeGet._waitMs = 0;
  return ctx;
}
const cfg = () => ({ jamaBridge: { kind: 'jama', baseUrl: 'https://example.jamacloud.com', projectId: '46', auth: 'oauth',
  picks: [{ id: 1, key: 'RAD-FLD-1', name: 'Aircraft functions', seq: '1', kind: 'fn', container: true, types: { 101: 'fn' } }, { id: 2, key: 'RAD-FLD-2', name: 'Aircraft requirements', seq: '2', kind: 'req', container: true, types: { 102: 'req' } }],
  send: { fc: { on: true, itemType: 109, parent: 3 } } } });

(async function main() {
  console.log('\n[A] lines, a part accepted, rejections kept');
  const J = jama(), pc = cfg(), p = page(J, pc), C = p.SLConnections;
  check('Jama is registered with the framework', !!C.adapter('jama') && C.connected().map(t => t.id).join() === 'jama');
  await p.bridgeCheck(true);
  let inc = C.incoming();
  check('every staged change is one line (5 functions, 2 requirements)', inc.length === 7 && inc.filter(c => c.kind === 'fn').length === 5, inc.map(c => c.slId).join(' '));
  const leaf = inc.find(c => c.slId === 'AF-1.1.1'), rq2 = inc.find(c => c.slId === 'RAD-REQ-2');
  let r = C.decide({ accept: [leaf.key], reject: [rq2.key] }, 'Sam Lee', 'first pass');
  const rows = p.acFunctionsData.map(x => x.subId + '<' + (x.parentSubId || '')).join(' ');
  check('accepting one sub-sub-function applies it and the new parent it hangs under, nothing else', r.ok && rows === 'AF-1.1< AF-1.1.1<AF-1.1' && p.acReqData.length === 0, rows);
  check('the rejected line is out of Incoming, kept with who, when and why', !C.incoming().some(c => c.slId === 'RAD-REQ-2') && C.rejected().length === 1 && pc.connections.decisions[rq2.key].by === 'Sam Lee' && pc.connections.decisions[rq2.key].why === 'first pass');
  check('a signature is required', C.decide({ accept: [C.incoming()[0].key] }, '  ', '').ok === false);
  const before = p.acReqData.length;
  // the Requirements page panel's own "Sign and apply" (live_bridge.js bridgeApplyUi), with its name box filled in
  const box = { querySelector: q => q === '.jb-by' ? { value: 'Sam Lee' } : (q === '.jb-err' ? { textContent: '' } : null) };
  const oldQ = p.document.querySelector; p.document.querySelector = q => /data-jb="ac-req"/.test(q) ? box : null;
  p.bridgeApplyUi('ac-req');
  p.document.querySelector = oldQ;
  check('the Requirements page panel signs everything waiting there except the rejected line', p.acReqData.length === before + 1 && !p.acReqData.some(x => x.id === 'RAD-REQ-2') && pc.connections.log.some(e => e.what === 'signed' && /Requirements|aircraft requirements/.test(e.why || '')), JSON.stringify(p.acReqData.map(x => x.id)));
  J.items.get(202).fields.name = 'The aircraft shall be controllable in roll at all speeds.'; J.touch(J.items.get(202));
  await p.bridgeCheck(true);
  check('Jama changes the rejected item again: it comes back as a new line', C.incoming().some(c => c.slId === 'RAD-REQ-2'));
  C.decide({ accept: C.incoming().map(c => c.key) }, 'Sam Lee', 'rest');

  console.log('\n[B] owners and the lock');
  const f112 = p.acFunctionsData.find(x => x.subId === 'AF-1.1.2'), f111 = p.acFunctionsData.find(x => x.subId === 'AF-1.1.1');
  const pv = page(jama(), cfg(), { role: 'editor' });
  check('only an admin changes an owner', pv.SLConnections.setOwner('jama', ['111'], 'sl', 'x').ok === false);
  check('a reason is required', C.setOwner('jama', [f111.fnSource.remoteId], 'sl', '').ok === false);
  check('an admin, with a reason, makes Safety Lab the owner', C.setOwner('jama', [f111.fnSource.remoteId], 'sl', 'we own the wording').ok && C.ownerOf('jama', f111.fnSource.remoteId) === 'sl');
  J.items.get(111).fields.name = 'Command elevator (edited in Jama)'; J.touch(J.items.get(111));
  await p.bridgeCheck(true);
  check('an edit in Jama to an item Safety Lab owns is not incoming', !C.incoming().some(c => c.slId === 'AF-1.1.1'));
  check('... it is flagged in History, once', pc.connections.log.filter(e => e.what === 'flagged').length === 1);
  await p.bridgeCheck(true);
  check('... and not again at the next check', pc.connections.log.filter(e => e.what === 'flagged').length === 1);
  let b4 = JSON.parse(JSON.stringify(f112)); f112.subName = 'changed in Safety Lab';
  check('a row Jama owns is put back when edited in Safety Lab', JSON.stringify(C.guardRow('fn', b4, f112)) === '["subName"]' && f112.subName === 'Trim pitch');
  b4 = JSON.parse(JSON.stringify(f111)); f111.subName = 'Command elevator (Safety Lab wording)';
  check('a row Safety Lab owns is edited freely', C.guardRow('fn', b4, f111).length === 0 && f111.subName === 'Command elevator (Safety Lab wording)');
  check('a row from Jama shows who owns it', C.lockOf(f112, 'fn').toolLabel === 'Jama Connect' && C.lockOf(f111, 'fn') === null);

  console.log('\n[C] sending');
  p.acFhaData.push({ internalId: 'fh1', fcId: 'FC-012', subId: 'AF-1.1.1', fcDesc: 'Loss of elevator command', phases: ['Cruise'], effAc: 'Reduced pitch control', effCrew: 'High workload', effPax: 'None', severity: 'Hazardous', severityRationale: 'Crew must fly with trim' });
  let out = C.outgoing();
  check('Ready to send: the new failure condition and the renamed Safety Lab-owned function', out.length === 2 && out.some(o => o.change === 'new' && o.slId === 'FC-012') && out.some(o => o.change === 'changed' && o.slId === 'AF-1.1.1'), out.map(o => o.change + ':' + o.slId).join(' '));
  J.writes.length = 0;
  r = await C.send(out.map(o => o.key), 'Sam Lee', 'FHA review 3');
  const w = J.writes.map(x => x.method + ' ' + x.path.replace('/rest/latest', ''));
  check('sent: the item made in the chosen folder, linked to its function, with a comment; the owned function changed', r.ok && r.sent === 2 && w.indexOf('POST /items') >= 0 && J.writes.some(x => x.path.endsWith('/relationships') && x.body.fromItem === 111) && w.filter(x => x === 'POST /comments').length === 2 && J.writes.some(x => x.method === 'PATCH' && x.path.endsWith('/items/111')), JSON.stringify(r) + ' ' + w.join(' | '));
  const fh = p.acFhaData[0], link = fh.sendLinks && fh.sendLinks['jama-live'];
  check('the failure condition remembers its Jama item', !!(link && link.remoteId && link.key && link.by === 'Sam Lee'));
  const made = J.items.get(Number(link.remoteId));
  check('only the name and the description are written, the engineer’s class in the description, no number', made.fields.name === 'FC-012 Loss of elevator command' && /Hazardous: Crew must fly with trim/.test(made.fields.description) && Object.keys(made.fields).sort().join() === 'description,name');
  check('nothing waits after a send', C.outgoing().length === 0);
  fh.severityRationale = 'Crew must fly with trim; checked in the simulator';
  J.items.get(Number(link.remoteId)).fields.name = 'someone edited it in Jama'; J.touch(J.items.get(Number(link.remoteId)));
  r = await C.send(C.outgoing().map(o => o.key), 'Sam Lee', 'again');
  check('a change made in Jama since is held back, never overwritten', r.sent === 0 && r.held.length === 1 && J.items.get(Number(link.remoteId)).fields.name === 'someone edited it in Jama', JSON.stringify(r));
  r = await C.send(C.outgoing().map(o => o.key), 'Sam Lee', 'send again after checking');
  check('sent again on purpose, Safety Lab’s version goes out', r.sent === 1 && /checked in the simulator/.test(J.items.get(Number(link.remoteId)).fields.description));
  const fence = [p._bridgeWriteProblem('DELETE', 'https://example.jamacloud.com/rest/latest/items/5'), p._bridgeWriteProblem('PUT', 'https://example.jamacloud.com/rest/latest/items/5'),
    p._bridgeWriteProblem('POST', 'https://other.jamacloud.com/rest/latest/items'), p._bridgeWriteProblem('POST', 'https://example.jamacloud.com/rest/latest/users'), p._bridgeWriteProblem('PATCH', 'https://example.jamacloud.com/rest/latest/items')];
  check('never a delete, another host or another path', fence.every(Boolean), JSON.stringify(fence));
  const pw2 = page(jama(), cfg(), { web: true });
  await pw2.bridgeCheck(true).catch(() => {});
  pw2.acFhaData.push({ internalId: 'x', fcId: 'FC-1', subId: 'AF-1.1', fcDesc: 'Loss of pitch' });
  pw2.projectConfig.jamaBridge.send = { fc: { on: true, itemType: 109, parent: 3 } };
  const lines = pw2.bridgeOutgoing();
  const rw = await pw2.bridgeSend(lines, 'Sam', '');
  check('a browser-only session does not write (its public relay only reads)', !rw.ok || rw.sent === 0 && rw.failed.length && /desktop app or your company/.test(rw.failed[0]), JSON.stringify(rw));

  console.log('\n[D] History');
  const whats = new Set(pc.connections.log.map(e => e.what));
  check('checks, signatures, rejections, flags, sends, holds and owner changes are recorded', ['check', 'signed', 'rejected', 'flagged', 'sent', 'conflict', 'owner'].every(x => whats.has(x)), Array.from(whats).join(','));
  const csv = C.exportCsv();
  check('History exports for an audit', /^When,Who,Tool,What,Items,Reason,Result/.test(csv) && csv.split('\n').length === pc.connections.log.length + 1);

  // ------------------------------------------------------------------ [E] the real app
  let pw; try { pw = require('playwright'); } catch (_) { console.log('  note  Playwright is not installed here: [E] did not run'); NO_E = true; return finish(); }
  console.log('\n[E] in the real app');
  const SITE = path.join(REPO, 'site');
  const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const srv = http.createServer((q, rs) => { let pp = decodeURIComponent(q.url.split('?')[0]); if (pp.endsWith('/')) pp += 'index.html'; const f = path.join(SITE, path.normalize(pp)); if (!f.startsWith(SITE)) { rs.writeHead(403); return rs.end(); }
    let b; try { b = MUT ? Buffer.from(src(path.relative(REPO, f))) : fs.readFileSync(f); } catch (_) { rs.writeHead(404); return rs.end(); } rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); rs.end(b); });
  await new Promise(res => srv.listen(0, '127.0.0.1', res));
  let browser; try { browser = await pw.chromium.launch(); } catch (_) { console.log('  note  Chromium could not start here: [E] did not run'); NO_E = true; srv.close(); return finish(); }
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.addInitScript('window.__jamaFake=(function(){var module={exports:null};' + JAMA_SRC + ';return module.exports;})();(function(){var J=window.__jamaFake();window.__J=J;window.__slabDesktop=true;' +
      "window.slabSecrets={save:async()=>({ok:true}),status:async()=>({secrets:[{kind:'jama',meta:{baseHost:'example.jamacloud.com',user:'cid',auth:'oauth'}}]})};" +
      'window.slabBridge={get:async u=>{try{return{ok:true,data:J.get(u)}}catch(e){return{ok:false,error:e.message}}},send:async(m,u,b)=>{var r=J.write(m,u,b);return r.status<300?{ok:true,status:r.status,data:r.data}:{ok:false,status:r.status,error:"HTTP "+r.status}}};})();');
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e))); pg.on('dialog', d => d.dismiss().catch(() => {}));
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/'); await new Promise(r0 => setTimeout(r0, 3500));
    await pg.evaluate(() => { const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked'); document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; }); });
    await pg.evaluate(async () => { await loadSampleProject(); }); await new Promise(r0 => setTimeout(r0, 3000));
    const decideCma = () => pg.evaluate(() => { const L = window.SLCmaLive; if (!L || !L.pending().length) return; L.pending().forEach(x => L.setChoice(x.key, 'ignore', 'test')); L.submitModal(); });
    await pg.evaluate(async () => {
      projectConfig.jamaBridge = { kind: 'jama', baseUrl: 'https://example.jamacloud.com', projectId: '46', auth: 'oauth', picks: [{ id: 1, key: 'RAD-FLD-1', name: 'Aircraft functions', seq: '1', kind: 'fn', container: true, types: { 101: 'fn' } }, { id: 2, key: 'RAD-FLD-2', name: 'Aircraft requirements', seq: '2', kind: 'req', container: true, types: { 102: 'req' } }] };
      await bridgeCheck(false);
    });
    await new Promise(r0 => setTimeout(r0, 600));
    const E1 = await pg.evaluate(() => { const p = document.getElementById('cx-pop'); return { pop: !!p, lines: p ? p.querySelectorAll('.cx-line').length : 0, radios: p ? p.querySelectorAll('.cx-line input[type=radio]').length : 0, text: p ? p.innerText.slice(0, 200) : '' }; });
    check('the pop-up lists what came in, each with Accept, Reject or Later', E1.pop && E1.lines === 7 && E1.radios === 21, JSON.stringify(E1));
    await pg.evaluate(() => { const p = document.getElementById('cx-pop'); const l = p.querySelector('.cx-line'); l.querySelector('input[value=accept]').click(); p.querySelector('.cx-by').value = 'Sam Lee'; });
    await pg.evaluate(() => { document.querySelector('#cx-pop .cx-sign button').click(); });
    await new Promise(r0 => setTimeout(r0, 600));
    const E2 = await pg.evaluate(() => ({ pop: !!document.getElementById('cx-pop'), lines: document.querySelectorAll('#cx-pop .cx-line').length, fn: acFunctionsData.filter(f => f.fnSource && f.fnSource.tool === 'jama-live').length }));
    check('signing from the pop-up applies the accepted line and keeps the rest waiting', E2.pop && E2.lines === 6 && E2.fn === 1, JSON.stringify(E2));
    await pg.evaluate(() => { document.querySelector('#cx-pop .cx-pop-foot .cx-right button').click(); });
    await new Promise(r0 => setTimeout(r0, 400));
    const barTxt = () => pg.evaluate(() => { const b = document.getElementById('sl-ack-bar'); return b && b.classList.contains('on') ? b.innerText.replace(/\s+/g, ' ').trim() : ''; });
    const E3 = { pop: await pg.evaluate(() => !!document.getElementById('cx-pop')), bar: await barTxt() };
    check('Later closes the pop-up and the pill says what is waiting', !E3.pop && E3.bar === '6 incoming changes from Jama', JSON.stringify(E3));
    await decideCma();
    // a change of the person's own: the one pill shows both
    await pg.evaluate(() => { SLChangeAck._markInput(); const r = acFhaData.find(x => !x.fcSource); r.severityRationale = (r.severityRationale || '') + ' (edited)'; scheduleAutosave(); });
    await new Promise(r0 => setTimeout(r0, 1500)); await pg.evaluate(() => SLChangeAck.collectNow()); await new Promise(r0 => setTimeout(r0, 300));
    const E4 = await barTxt();
    check('one pill: "6 incoming changes from Jama + 1 change to confirm"', /^6 incoming changes from Jama \+ 1 change to confirm Review$/.test(E4), E4);
    await pg.evaluate(() => { document.querySelector('#sl-ack-bar .sl-ack-in').click(); });
    await new Promise(r0 => setTimeout(r0, 400));
    check('its incoming part opens Incoming changes', await pg.evaluate(() => document.getElementById('view-conn').style.display === 'block' && /Incoming changes/.test(document.querySelector('#conn-host .cx-tab.on').textContent)));
    // the lock, on the worksheet and on any edit
    await pg.evaluate(() => { switchTab('ac-func'); }); await new Promise(r0 => setTimeout(r0, 500));
    const E5 = await pg.evaluate(() => { const row = acFunctionsData.find(f => f.fnSource && f.fnSource.tool === 'jama-live'); const locks = document.querySelectorAll('#ac-func-body .cx-lock').length; const mine = Array.from(document.querySelectorAll('#ac-func-body td')).some(td => /deleteACFunction|editACFunction/.test(td.innerHTML) && td.innerHTML.indexOf("'" + row.internalId + "'") >= 0); editACFunction(row.internalId); return { lock: locks > 0 && !mine, edit: (typeof editStates !== 'undefined' && editStates.acFunc) || '' }; });
    check('the worksheet shows the lock and does not open the editor of a row Jama owns', E5.lock && !E5.edit, JSON.stringify(E5));
    await pg.evaluate(() => { SLChangeAck._markInput(); const row = acFunctionsData.find(f => f.fnSource && f.fnSource.tool === 'jama-live'); window.__was = row.subName; row.subName = 'renamed in Safety Lab'; scheduleAutosave(); });
    await new Promise(r0 => setTimeout(r0, 1500)); await pg.evaluate(() => SLChangeAck.collectNow()); await new Promise(r0 => setTimeout(r0, 300));
    const E6 = await pg.evaluate(() => { const row = acFunctionsData.find(f => f.fnSource && f.fnSource.tool === 'jama-live'); return { name: row.subName, was: window.__was }; });
    check('an edit to a row Jama owns is put back', E6.name === E6.was, JSON.stringify(E6));
    // the reminder before leaving
    await pg.evaluate(() => { projectConfig.jamaBridge.send = { fc: { on: true, itemType: 109, parent: 3 } }; SLChangeAck.drop({}); });
    const leave = pg.evaluate(() => window.__slabRequestClose());
    await new Promise(r0 => setTimeout(r0, 600));
    const E7 = await pg.evaluate(() => { const l = document.getElementById('cx-leave'); return l ? l.innerText : ''; });
    check('closing names what was not sent yet, with "Review and send now"', /changes? not sent yet/.test(E7) && /Review and send now/.test(E7), E7);
    await pg.evaluate(() => { document.querySelector('#cx-leave .cx-pop-card .cx-row button').click(); });
    check('"Review and send now" stays and opens Ready to send', (await leave) === false && await pg.evaluate(() => /Ready to send/.test(document.querySelector('#conn-host .cx-tab.on').textContent)));
    for (const t of ['main', 'in', 'out', 'map', 'hist']) await pg.evaluate(t => SLConnections.show(t), t);
    check('every tab draws, no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  } catch (e) { check('the browser run completed', false, e && e.stack); }
  finally { try { await browser.close(); } catch (_) {} srv.close(); }
  finish();
})().catch(e => { check('the run completed', false, e && e.stack); finish(); });
function finish() {
  if (!MUT && !process.env.NOMUT) {
    console.log('\n[mutation] each guard, reverted, turns the test red');
    for (const k of Object.keys(MUTATIONS)) {
      if (NO_E && UI_ONLY[k]) { console.log('  note  mutation "' + k + '" guards the real app, which could not run here'); continue; }
      const x = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { MUTATE: k }), encoding: 'utf8', timeout: 600000 });
      const fails = (x.stdout.match(/^  FAIL  .*$/mg) || []);
      check('mutation "' + k + '" turns the test red (' + fails.length + ' failing)', x.status === 1 && fails.length > 0, x.status + ' ' + (x.stderr || '').slice(0, 300));
    }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
