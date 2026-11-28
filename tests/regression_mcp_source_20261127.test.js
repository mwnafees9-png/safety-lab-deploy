#!/usr/bin/env node
/*
 * Regression: Safety Lab reads from an MCP server (alm_engine.js 1.2, the 'mcp' driver; TD-11, 27 Nov 2026).
 *
 * Waqas, to Violet Labs, 6 Nov 2026: "Safety Lab will pull the Jama and GENESYS data from Violet's MCP on its own
 * schedule, so nothing needs to be pushed to our API from your side", "every change that comes in through Violet
 * waits in Safety Lab until an engineer accepts it". 27 Nov 2026: build it as a general connection, on the same engine
 * as Polarion and Codebeamer, with the engineer choosing what is brought in, a timed check, and read only.
 *
 * The real func_tree.js, connections.js and alm_engine.js run against a stand-in MCP server (Streamable HTTP, written
 * here from the MCP specification: a handshake, a session id, JSON or event-stream answers, tools with their own names
 * and shapes). Behind it: a "Jama" (sets, items with a parent, a document key, an HTML description, offset paging,
 * folders among the items) and a "GENESYS" (folders, entities with a guid, a title, a parent object, a version, cursor
 * paging, answers as text only). Pinned:
 *   [M1] the handshake (initialize, the session id, the version, notifications/initialized); every source of every
 *        reader is listed; what was chosen is read in full, both ways of paging; every difference is one line; the
 *        function tree comes from the parents; folders are left out; two readers never collide;
 *   [M2] accepted and signed lines become rows the server owns (locked); a rename, a move, an item gone: changed,
 *        moved, removed lines; a removed item is flagged, never deleted; a source that cannot be read flags nothing;
 *        a server with no change mark still shows a change;
 *   [M3] the session lost: one new handshake, the read goes on; event-stream answers; an answer with no list, an
 *        item with no id and a tool's refusal are said plainly;
 *   [RO] read only: nothing is ever ready to send, a send is refused, Safety Lab cannot be made the owner, and the
 *        server's write tool is never called;
 *   [F]  the fence, the same in the page, the desktop and the server: https, the saved host and path, POST, one
 *        JSON-RPC message, only the handshake, tools/list and the tools named with the login;
 *   [R]  the real relay (worker.js): the token goes out as a Bearer token and never comes back; what was checked is
 *        what is sent; an unapproved tool sends nothing; the session id comes back; a stream that stays open is let
 *        go once the answer has arrived;
 *   [T]  the timer: not before its time, then quietly; never while a check runs or the tab is hidden; 0 is never; a
 *        check that fails is said on the card;
 *   [D]  the vault takes the login (migration, kit, apply.sh, secret_store.js); the pins;
 *   [E]  the real app (Playwright, when installed): connect, the tools are listed, the argument names are filled
 *        from the tools' own descriptions, save, choose what is linked, the lines wait in Incoming changes.
 * MUTATE=<name> reverts one guard; each must turn the test red.
 *
 * Run: node tests/regression_mcp_source_20261127.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 700) + ')' : '')); } };
const REPO = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');
const ENG = 'site/alm_engine.js', PX = 'customer-install/selfhost/ai-proxy/worker.js';
const MUTATIONS = {
  tool:     [ENG, "if (!name || may.indexOf(name) < 0) return 'the tool '", "if (false) return 'the tool '"],
  method:   [ENG, "if (j.method !== 'tools/call') return 'Safety Lab only lists and calls the tools of an MCP server';", ''],
  path:     [ENG, "if (!path || u.pathname !== path) return 'only the saved MCP address can be reached';", ''],
  post:     [ENG, "if (m !== 'POST') return 'an MCP server is only ever sent a POST';", ''],
  readonly: [ENG, "function sendOn() { if (drv.readOnly) return false; return", 'function sendOn() { return'],
  cursor:   [ENG, "if (S(x.cursorArg)) { var nc = mcpPick(data, MCP_NEXT); if (nc == null || nc === false) break; a[x.cursorArg] = nc; continue; }", 'if (S(x.cursorArg)) break;'],
  offset:   [ENG, "a[x.offsetArg] = off; continue;", 'break;'],
  session:  [ENG, "if (s.sid && !again && method !== 'initialize') { _mcpOpen = null; return self.rpc(c, req, method, params, true); }", ''],
  skip:     [ENG, "if (type && skip.indexOf(type.toLowerCase()) >= 0) return false;", ''],
  prefix:   [ENG, "return { id: k + String(id), key:", "return { id: String(id), key:"],
  timer:    [ENG, "if (now - _last < m * 60000) return false;", ''],
  hidden:   [ENG, "try { if (typeof document !== 'undefined' && document.hidden) return 0; } catch (_) {}", ''],
  unread:   [ENG, "if (!r.partial) read[g].add(String(p.container));", 'read[g].add(String(p.container));'],
  resend:   [PX, "const msg = JSON.parse(body); body = JSON.stringify(msg); mcpId = msg.id === undefined ? null : msg.id;", 'const msg = JSON.parse(body); mcpId = msg.id === undefined ? null : msg.id;'],
  relay:    [PX, "const fp2 = almRequestProblem(tool, method, chk.target.toString(), savedHost, ph, sec.meta || {}, body);", 'const fp2 = "";'],
  stream:   [PX, "if (answered()) { try { await reader.cancel(); } catch (_) {} break; }", ''],
};
const MUT = process.env.MUTATE || '';
function src(p) {
  let s = read(p);
  if (MUT) { const m = MUTATIONS[MUT]; if (!m) { console.error('unknown mutation ' + MUT); process.exit(3); } if (m[0] === p) { if (s.indexOf(m[1]) < 0) { console.error('mutation ' + MUT + ' anchor not found'); process.exit(4); } s = s.split(m[1]).join(m[2]); } }
  return s;
}

// ------------------------------------------------------------------ a stand-in MCP server (Streamable HTTP)
// Self-contained, so the same code also runs inside the browser for [E].
function standIn(opts) {
  opts = opts || {};
  var S = { sse: !!opts.sse, sessions: opts.sessions !== false, token: 'MCP-TOKEN', sid: null, n: 0, inits: 0, calls: [], writes: [], denied: 0, version: opts.version || '2025-06-18', lockSet: null, noMarks: false, badList: false };
  var clock = 0, stamp = function () { return '2026-11-27T10:' + String(10 + (clock++ % 49)) + ':00Z'; };
  var jama = { sets: [{ id: 31, name: 'System requirements', itemType: 'requirement' }, { id: 33, name: 'Assumptions', itemType: 'assumption' }, { id: 34, name: 'Locked set', itemType: 'requirement' }], items: {} };
  var jAdd = function (id, set, key, name, type, parent) { jama.items[id] = { id: id, setId: set, documentKey: key, name: name, description: '<p>' + name + ' <b>in detail</b></p>', itemType: type || 'requirement', parent: parent == null ? null : parent, modifiedDate: '2026-11-20T10:00:00Z', sequence: id }; };
  jAdd(300, 31, 'HL1-FLD-1', 'Flight controls', 'folder');
  jAdd(301, 31, 'HL1-SYS-101', 'The FCS shall command the elevator within 50 ms.', 'requirement', 300);
  jAdd(302, 31, 'HL1-SYS-102', 'The FCS shall monitor each actuator.', 'requirement', 300);
  jAdd(303, 31, 'HL1-SYS-103', 'The FCS shall report loss of a channel.', 'requirement', 300);
  jAdd(304, 31, 'HL1-SYS-104', 'The FCS shall hold the last valid command for 100 ms.', 'requirement', 300);
  jAdd(305, 31, 'HL1-TXT-1', 'Notes for the reader', 'text', 300);
  jAdd(401, 33, 'HL1-ASM-1', 'Dual hydraulic supply is available in all phases.', 'assumption');
  jAdd(402, 33, 'HL1-ASM-2', 'Crew are trained on reversion.', 'assumption');
  jAdd(501, 34, 'HL1-LCK-1', 'From the locked set', 'requirement');
  var gen = { folders: [{ guid: 'F-FN', title: 'Aircraft functions', class: 'Function' }, { guid: 'F-RQ', title: 'Originating requirements', class: 'Requirement' }], ents: {} };
  var gAdd = function (guid, folder, number, title, parent) { gen.ents[guid] = { guid: guid, folder: folder, number: number, title: title, body: title + ', as GENESYS words it.', class: 'Function', parent: parent ? { id: parent } : null, version: 1 }; };
  gAdd('G1', 'F-FN', 'F.1', 'Control flight path');
  gAdd('G2', 'F-FN', 'F.1.1', 'Control pitch', 'G1');
  gAdd('G3', 'F-FN', 'F.1.1.1', 'Command elevator', 'G2');
  gAdd('G4', 'F-FN', 'F.1.2', 'Control roll', 'G1');
  gAdd('G5', 'F-FN', 'F.2', 'Provide cabin lighting');
  var num = { type: 'integer' }, str = { type: 'string' };
  var TOOLS = [
    { name: 'jama_list_sets', description: 'The sets of a Jama project.', inputSchema: { type: 'object', properties: { project: num }, required: ['project'] } },
    { name: 'jama_list_items', description: 'The items of one Jama set, a page at a time.', inputSchema: { type: 'object', properties: { setId: num, startAt: num, maxResults: num }, required: ['setId'] } },
    { name: 'jama_get_item', description: 'One Jama item by its id.', inputSchema: { type: 'object', properties: { id: num }, required: ['id'] } },
    { name: 'jama_update_item', description: 'Change a Jama item.', inputSchema: { type: 'object', properties: { id: num, name: str }, required: ['id'] } },
    { name: 'genesys_list_folders', description: 'The folders of the GENESYS project.', inputSchema: { type: 'object', properties: {} } },
    { name: 'genesys_list_entities', description: 'The entities of one GENESYS folder.', inputSchema: { type: 'object', properties: { folder: str, cursor: str, limit: num }, required: ['folder'] } },
    { name: 'genesys_get_entity', description: 'One GENESYS entity by its guid.', inputSchema: { type: 'object', properties: { guid: str }, required: ['guid'] } }
  ];
  function jItem(it) { var o = {}; Object.keys(it).forEach(function (k) { o[k] = it[k]; }); if (S.noMarks) delete o.modifiedDate; return o; }
  function call(name, a) {
    S.calls.push({ name: name, args: a });
    if (name === 'jama_list_sets') { if (a.project !== 12) throw new Error('no such project'); return { data: jama.sets.slice(), meta: { pageInfo: { totalResults: jama.sets.length } } }; }
    if (name === 'jama_list_items') {
      if (typeof a.setId !== 'number') throw new Error('setId must be a number');
      if (a.setId === S.lockSet) throw new Error('this token cannot read set ' + a.setId);
      var all = Object.keys(jama.items).map(function (k) { return jama.items[k]; }).filter(function (x) { return x.setId === a.setId; }).sort(function (x, y) { return x.sequence - y.sequence; });
      var at = Number(a.startAt) || 0, n = Math.min(Number(a.maxResults) || 20, 3), page = all.slice(at, at + n).map(jItem);
      if (S.badList) return { meta: { pageInfo: { totalResults: all.length } }, page: { rows: page } };
      return { data: page, meta: { pageInfo: { startIndex: at, resultCount: page.length, totalResults: all.length } } };
    }
    if (name === 'jama_get_item') { var it = jama.items[a.id]; if (!it) throw new Error('no such item'); return { data: jItem(it) }; }
    if (name === 'jama_update_item') { S.writes.push(a); return { ok: true }; }
    if (name === 'genesys_list_folders') return { folders: gen.folders.slice() };
    if (name === 'genesys_list_entities') {
      var list = Object.keys(gen.ents).map(function (k) { return gen.ents[k]; }).filter(function (x) { return x.folder === a.folder; });
      var start = a.cursor ? Number(String(a.cursor).replace('c', '')) : 0, pg = list.slice(start, start + 2), out = { entities: pg };
      if (start + 2 < list.length) out.nextCursor = 'c' + (start + 2);
      return out;
    }
    if (name === 'genesys_get_entity') { var e = gen.ents[a.guid]; if (!e) throw new Error('no such entity'); return e; }
    var er = new Error('Unknown tool: ' + name); er.code = -32602; throw er;
  }
  // GENESYS answers as text only (no structuredContent): the driver reads the text as JSON
  function result(name, data) { var text = JSON.stringify(data); return /^genesys_/.test(name) ? { content: [{ type: 'text', text: text }], isError: false } : { content: [{ type: 'text', text: text }], structuredContent: data, isError: false }; }
  function answer(status, msg, extra) {
    var h = extra || {};
    if (msg == null) { h['content-type'] = 'application/json'; return { status: status, headers: h, text: '' }; }
    if (S.sse && status === 200) { h['content-type'] = 'text/event-stream'; return { status: status, headers: h, text: 'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progress":1}}\n\nevent: message\ndata: ' + JSON.stringify(msg) + '\n\n' }; }
    h['content-type'] = 'application/json'; return { status: status, headers: h, text: JSON.stringify(msg) };
  }
  // headers: lower-case names. Gives back { status, headers, text }.
  function handle(method, pathname, headers, bodyText) {
    if (pathname !== '/mcp') return { status: 404, headers: {}, text: 'no such path' };
    if (method !== 'POST') return { status: 405, headers: {}, text: '' };
    if (headers.authorization !== 'Bearer ' + S.token) { S.denied++; return { status: 401, headers: {}, text: '' }; }
    var msg; try { msg = JSON.parse(bodyText); } catch (_) { return answer(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
    if (msg.method === 'initialize') {
      S.inits++; var extra = {};
      if (S.sessions) { S.sid = 'sess-' + (++S.n); extra['mcp-session-id'] = S.sid; }
      return answer(200, { jsonrpc: '2.0', id: msg.id, result: { protocolVersion: S.version, capabilities: { tools: {} }, serverInfo: { name: 'Stand-in', version: '1' } } }, extra);
    }
    if (S.sessions && headers['mcp-session-id'] !== S.sid) return answer(404, { jsonrpc: '2.0', id: msg.id == null ? null : msg.id, error: { code: -32001, message: 'Session not found' } });
    if (msg.method === 'notifications/initialized') return { status: 202, headers: {}, text: '' };
    if (msg.method === 'tools/list') {
      var at = msg.params && msg.params.cursor ? Number(msg.params.cursor) : 0, r = { tools: TOOLS.slice(at, at + 4) };
      if (at + 4 < TOOLS.length) r.nextCursor = String(at + 4);
      return answer(200, { jsonrpc: '2.0', id: msg.id, result: r });
    }
    if (msg.method === 'tools/call') {
      var name = msg.params && msg.params.name;
      try { return answer(200, { jsonrpc: '2.0', id: msg.id, result: result(name, call(name, (msg.params && msg.params.arguments) || {})) }); }
      catch (e) {
        if (e.code) return answer(200, { jsonrpc: '2.0', id: msg.id, error: { code: e.code, message: e.message } });
        return answer(200, { jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: e.message }], isError: true } });
      }
    }
    return answer(200, { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found' } });
  }
  return { S: S, jama: jama, gen: gen, TOOLS: TOOLS, handle: handle, stamp: stamp, jAdd: jAdd, gAdd: gAdd };
}

const URL_MCP = 'https://mcp.example.com/mcp';
const APPROVED = 'jama_list_sets jama_list_items jama_get_item genesys_list_folders genesys_list_entities genesys_get_entity';
const META = () => ({ baseHost: 'mcp.example.com', auth: 'bearer', path: '/mcp', tools: APPROVED });
const READERS = () => [
  { key: 'jama', name: 'Jama', sources: { tool: 'jama_list_sets', args: { project: 12 } }, items: { tool: 'jama_list_items', sourceArg: 'setId', sourceNum: true, offsetArg: 'startAt', limitArg: 'maxResults' }, one: { tool: 'jama_get_item', idArg: 'id', idNum: true }, fields: {} },
  { key: 'genesys', name: 'GENESYS', sources: { tool: 'genesys_list_folders' }, items: { tool: 'genesys_list_entities', sourceArg: 'folder', cursorArg: 'cursor', limitArg: 'limit' }, one: { tool: 'genesys_get_entity', idArg: 'guid' }, fields: {} }
];
const cfg = () => ({ almTools: { mcp: { label: 'Violet', baseUrl: URL_MCP, auth: 'bearer', readers: READERS(),
  picks: [{ container: 'genesys|F-FN', containerName: 'Aircraft functions', kind: 'fn', scope: 'ac' },
          { container: 'jama|31', containerName: 'System requirements', kind: 'req', scope: 'sys-fcs' },
          { container: 'jama|33', containerName: 'Assumptions', kind: 'asm', scope: 'ac' }] } } });

// ------------------------------------------------------------------ the page (the desktop's door, or the server's)
function page(T, pc, opts) {
  opts = opts || {};
  const els = {};
  const document = { readyState: 'complete', hidden: false, body: { appendChild(el) { if (el && el.id) els[el.id] = el; } }, head: { appendChild() {} }, documentElement: { appendChild() {} },
    getElementById: id => els[id] || null, addEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
    createElement: () => ({ innerHTML: '', style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, querySelector: () => null, addEventListener() {}, remove() { delete els[this.id]; } }) };
  const toasts = [], sent = [], ls = {};
  const meta = opts.meta || META();
  const ctx = { console, URL, setTimeout, clearTimeout, setInterval: () => ({ unref() {} }), clearInterval: () => {}, navigator: { userAgent: 'test' }, encodeURIComponent, decodeURIComponent,
    localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem(k, v) { ls[k] = String(v); }, removeItem(k) { delete ls[k]; } }, document, Blob: function () {},
    acFunctionsData: [], acReqData: [], acAssumptionsData: [], acFcimData: [], acFhaData: [], acExtractedFCs: [], ftaPages: [],
    systemsData: [{ id: 'sys-fcs', name: 'Flight Control System', functions: [], req: [], asm: [] }],
    projectConfig: pc, newRowId: (() => { let n = 0; return () => 'r' + (++n); })(), showToast: (m, k) => toasts.push([k, m]), toasts, scheduleAutosave: () => {},
    getActiveWorkspace: () => null, sent, ls };
  // what the desktop's main process does: the fence (the engine's own, with what was saved with the login), then the call
  const route = (tool, method, url, body, o) => {
    const A = ctx.SLAlm, hdr = (o && o.headers) || {};
    const bad = A.almRequestProblem(tool, method, url, meta.baseHost, hdr, meta, body);
    let msg = null; try { msg = JSON.parse(body); } catch (_) {}
    sent.push({ tool, method, url, bad, rpc: msg && msg.method, name: msg && msg.params && msg.params.name, headers: hdr });
    if (bad) return { ok: false, error: 'Not sent: ' + bad + '.' };
    const h = { authorization: 'Bearer MCP-TOKEN' }; Object.keys(hdr).forEach(k => { h[k.toLowerCase()] = hdr[k]; });
    const r = T.handle(method, new URL(url).pathname, h, body);
    if (r.status === 401) return { ok: false, status: 401, error: 'the MCP server did not accept the saved login (HTTP 401).' };
    return { ok: true, raw: true, status: r.status, text: r.text, etag: '', location: '', session: r.headers['mcp-session-id'] || '', retryAfter: 0 };
  };
  if (opts.door === 'server') {
    ctx.SecretStore = { door: () => 'vault', has: k => k === 'mcp_token', meta: k => (k === 'mcp_token' ? meta : {}), sessionJwt: () => 'JWT-1', save: async () => ({ ok: true }) };
    ctx.SLConfig = { aiEndpoint: 'https://ai.example.com/v1/ai' };
    ctx.fetched = [];
    ctx.fetch = async (url, init) => {
      const u = new URL(url); const tool = u.searchParams.get('tool'), target = u.searchParams.get('target');
      ctx.fetched.push({ auth: init.headers.Authorization, method: init.method, path: u.pathname, raw: u.searchParams.get('raw'), ct: init.headers['Content-Type'] });
      const r = route(tool, init.method, target, init.body, { headers: JSON.parse(init.headers['X-Slab-Tool-Headers'] || '{}') });
      const ok = r.ok;
      return { ok, status: ok ? 200 : (r.status || 400), headers: { get: () => null }, text: async () => JSON.stringify(ok ? r : { error: { message: r.error } }) };
    };
  } else if (opts.door === 'browser') {
    ctx.SecretStore = { door: () => 'session', has: () => false, meta: () => ({}), save: async () => ({ ok: true }) };
    ctx.fetch = async () => { ctx.fetchedAny = true; throw new Error('the browser-only page made a network request'); };
  } else {
    ctx.slabSecrets = { save: async () => ({ ok: true }), status: async () => ({ secrets: [{ kind: 'mcp', meta }] }) };
    ctx.slabBridge = { get: async () => ({ ok: false }), send: async () => ({ ok: false }), toolOpts: true, tool: async (tool, m, u, b, o) => route(tool, m, u, b, o) };
    if (!opts.oldApp) ctx.slabBridge.toolMcp = true;
    ctx.fetch = async () => { throw new Error('the desktop page made a network request'); };
  }
  ctx.window = ctx; ctx.globalThis = ctx; ctx.jrnl = () => {};
  vm.createContext(ctx);
  for (const f of ['site/func_tree.js', 'site/connections.js', ENG]) vm.runInContext(src(f), ctx, { filename: f });
  ctx.SLAlm._waitScale = 0;
  return ctx;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const lineOf = (C, pred) => C.incoming('mcp').filter(pred);

// ------------------------------------------------------------------ [R] the real relay
function relay() {
  const proxy = src(PX);
  const between = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i); return i >= 0 && j > i ? t.slice(i, j) : ''; };
  const grab = re => (proxy.match(re) || [''])[0];
  const pxFence = between(proxy, 'var ALM_RULES = {', 'const TOOL_LABEL').trim();
  const code = [grab(/const BRIDGE_WRITE_MAX = [^\n]*\n/), grab(/function bridgeInternalAllowList[\s\S]*?\n}\n/), grab(/function bridgeTargetProblem[\s\S]*?\n}\n/), pxFence, between(proxy, 'const TOOL_LABEL', 'async function handleBridge(request, env, caller, url) {')].join('\n');
  const calls = [], T = standIn({ sse: false });
  const state = { hold: false, cancelled: 0 };
  class Resp { constructor(text, init) { this._t = text; this.status = init.status; const hh = init.headers || {}; this.headers = { get: k => { const v = hh[String(k).toLowerCase()]; return v == null ? null : v; }, getSetCookie: () => [] }; } async text() { return this._t; } }
  const secrets = { 'u1:mcp_token': { secret: 'MCP-TOKEN', meta: META() } };
  const deps = {
    jsonResponse: (status, body, extra) => new Resp(JSON.stringify(body), { status, headers: Object.assign({ 'content-type': 'application/json' }, extra || {}) }),
    checkRateLimit: async () => ({ ok: true }),
    readUserSecret: async (e, uid, kind) => secrets[uid + ':' + kind] || { missing: true },
    fetch: async (u, init) => {
      calls.push({ u, init });
      const r = T.handle(init.method, new URL(u).pathname, init.headers, init.body);
      if (state.hold && /event-stream/.test(r.headers['content-type'] || '')) {
        // a server that answers and then keeps its stream open
        const enc = new TextEncoder();
        const body = new ReadableStream({ start(c) { c.enqueue(enc.encode(r.text.slice(0, 40))); c.enqueue(enc.encode(r.text.slice(40))); }, cancel() { state.cancelled++; } });
        return new Response(body, { status: r.status, headers: r.headers });
      }
      return new Response(r.text === '' && r.status === 202 ? null : r.text, { status: r.status, headers: r.headers });
    },
    CORS: {}, btoa: s => Buffer.from(s).toString('base64'), Response: Resp, AbortSignal: { timeout: () => undefined }
  };
  let handle = null, err = '';
  try { handle = new Function(...Object.keys(deps), code + '\nreturn handleToolBridge;')(...Object.values(deps)); } catch (e) { err = e.message; }
  const env = { LICENSE_MODE: 'offline', BRIDGE_INTERNAL_HOSTS: '' };
  const H = { accept: 'application/json, text/event-stream', 'content-type': 'application/json' };
  const go = (method, target, body, o) => handle({ method, text: async () => (body == null ? '' : body), headers: { get: k => (String(k).toLowerCase() === 'x-slab-tool-headers' ? JSON.stringify((o && o.h) || H) : null) } }, env, { userId: (o && o.uid) || 'u1' },
    new URL('https://ai.example.com/v1/ai/bridge?tool=mcp&raw=1&target=' + encodeURIComponent(target)), 'mcp');
  return { handle, err, go, calls, T, state, secrets, proxy, pxFence };
}

(async function main() {
  const T = standIn();
  const pc = cfg();
  const p = page(T, pc);
  const C = p.SLConnections, A = p.SLAlm, M = A.tool('mcp');
  await M.refreshHas();

  console.log('\n[M1] the handshake, the sources, the read, the lines');
  check('the MCP server is a tool on the Connections engine, named by the project', !!M && C.adapter('mcp') && C.connected().some(t => t.id === 'mcp') && C.TOOLS.find(t => t.id === 'mcp').label === 'Violet');
  const srcs = await M.driver.listContainers(M.cfg(), M.req);
  check('every source of every reader is listed, each said to be from its reader', srcs.length === 5 && srcs.filter(s => /^jama\|/.test(s.id)).length === 3 && srcs.filter(s => /^genesys\|/.test(s.id)).length === 2 && srcs.find(s => s.id === 'jama|31').name === 'System requirements' && /Jama/.test(srcs.find(s => s.id === 'jama|31').where), JSON.stringify(srcs));
  check('a source says what it most likely holds (the engineer still chooses)', srcs.find(s => s.id === 'genesys|F-FN').kind === 'fn' && srcs.find(s => s.id === 'jama|33').kind === 'asm' && srcs.find(s => s.id === 'jama|31').kind === 'req');
  const hs = p.sent.filter(x => x.rpc === 'initialize' || x.rpc === 'notifications/initialized');
  check('one handshake: initialize, then notifications/initialized with the session id and the version', T.S.inits === 1 && hs.length === 2 && hs[0].rpc === 'initialize' && !hs[0].headers['mcp-session-id'] && hs[1].headers['mcp-session-id'] === 'sess-1' && hs[1].headers['mcp-protocol-version'] === '2025-06-18', JSON.stringify(hs));
  check('the fixed arguments from Connection settings go with the call', T.S.calls.some(c => c.name === 'jama_list_sets' && c.args.project === 12));
  T.S.calls.length = 0;
  await M.check(true);
  const inc = C.incoming('mcp');
  check('every item that was chosen is a line: 4 function lines (5 functions; a top function comes in with what sits under it), 4 requirements, 2 assumptions', inc.length === 10 && inc.filter(c => c.kind === 'fn').length === 4 && inc.filter(c => c.kind === 'req').length === 4 && inc.filter(c => c.kind === 'asm').length === 2 && inc.every(c => c.change === 'added'), inc.map(c => c.kind + ':' + c.extKey).join(' '));
  const jl = T.S.calls.filter(c => c.name === 'jama_list_items' && c.args.setId === 31), gl = T.S.calls.filter(c => c.name === 'genesys_list_entities');
  check('Jama is read by offset to its total (6 items, 3 a page: 2 pages), with the source as a number', jl.length === 2 && jl[0].args.startAt === undefined && jl[1].args.startAt === 3 && jl[0].args.maxResults === 100, JSON.stringify(jl));
  check('GENESYS is read by cursor to the end (5 entities, 2 a page: 3 pages)', gl.length === 3 && gl[0].args.cursor === undefined && gl[1].args.cursor === 'c2' && gl[2].args.cursor === 'c4' && gl[0].args.folder === 'F-FN', JSON.stringify(gl));
  check('a folder and a text item among the Jama items are left out', !inc.some(c => /FLD|TXT/.test(c.extKey)));
  check('the requirements go to the system that was chosen, with their Jama key and plain words', inc.filter(c => c.kind === 'req').every(c => c.scope === 'sys-fcs' && /^HL1-SYS-10\d$/.test(c.extKey)) && inc.find(c => c.extKey === 'HL1-SYS-101').after.text === 'The FCS shall command the elevator within 50 ms. in detail', JSON.stringify(inc.find(c => c.extKey === 'HL1-SYS-101')));
  check('an item is "<reader>:<its id in the server>", so two readers never collide', inc.find(c => c.extKey === 'HL1-SYS-101').remoteId === 'jama:301' && inc.find(c => c.extKey === 'F.1.1').remoteId === 'genesys:G2');
  check('nothing has entered the analysis', p.acFunctionsData.length === 0 && p.systemsData[0].req.length === 0 && p.acAssumptionsData.length === 0);
  check('the server’s write tool was never called', T.S.writes.length === 0 && !T.S.calls.some(c => c.name === 'jama_update_item'));

  console.log('\n[M2] accepted and signed; a rename, a move, an item gone');
  const leaf = inc.find(c => c.extKey === 'F.1.1.1');
  let d = C.decide({ accept: [leaf.key] }, 'Sam Lee', 'elevator first');
  check('accepting the deepest function brings its parents with it, and nothing else', d.ok !== false && p.acFunctionsData.length >= 1 && p.acFunctionsData.some(r => r.subId === 'F.1.1.1') && p.acFunctionsData.some(r => r.subId === 'F.1.1') && !p.acFunctionsData.some(r => /F\.1\.2|F\.2/.test(r.subId || r.funcId)), JSON.stringify(p.acFunctionsData.map(r => [r.funcId, r.subId])));
  const g3 = p.acFunctionsData.find(r => r.subId === 'F.1.1.1');
  check('the tree is the server’s: Command elevator sits under Control pitch, under Control flight path', g3 && g3.funcId === 'F.1' && g3.parentSubId === 'F.1.1' && g3.fnSource.tool === 'mcp' && g3.fnSource.remoteId === 'genesys:G3' && g3.fnSource.parentRemoteId === 'genesys:G2', JSON.stringify(g3));
  check('the row is locked: the server owns it', !!C.lockOf(g3, 'fn') && C.ownerOf('mcp', 'genesys:G3') !== 'sl');
  d = C.decide({ accept: C.incoming('mcp').map(c => c.key) }, 'Sam Lee', 'the rest');
  check('the rest signed in: 4 requirements in the system, 2 assumptions, every function', p.systemsData[0].req.length === 4 && p.acAssumptionsData.length === 2 && C.incoming('mcp').length === 0 && p.systemsData[0].req.every(r => r.reqSource.tool === 'mcp' && r.reqSource.by === 'Sam Lee'), JSON.stringify(d));
  check('the History says who signed what in', C.store().log.some(h => h.what === 'signed' && /Violet/.test(h.text) && h.signedBy === 'Sam Lee'), JSON.stringify(C.store().log.slice(-2)));
  await M.check(true);
  check('checked again with nothing changed: nothing waits', C.incoming('mcp').length === 0);
  // Jama renames a requirement; GENESYS moves a function and bumps its version; Jama drops an assumption
  T.jama.items[302].name = 'The FCS shall monitor each actuator and its power.'; T.jama.items[302].description = '<p>The FCS shall monitor each actuator and its power.</p>'; T.jama.items[302].modifiedDate = T.stamp();
  T.gen.ents.G3.parent = { id: 'G4' }; T.gen.ents.G3.version = 2;
  delete T.jama.items[402];
  await M.check(true);
  const c302 = lineOf(C, c => c.remoteId === 'jama:302')[0], mv = lineOf(C, c => c.remoteId === 'genesys:G3' && c.change === 'moved')[0], gone = lineOf(C, c => c.remoteId === 'jama:402')[0];
  check('a changed requirement is one "changed" line showing before and after', c302 && c302.change === 'changed' && /and its power/.test(c302.after.text) && !/and its power/.test(c302.before.text), JSON.stringify(c302));
  check('a function moved in the server is one "moved" line', !!mv && /F\.1\.2/.test(JSON.stringify(mv.after)), JSON.stringify(mv));
  check('an item gone from the server is one "removed" line', gone && gone.change === 'removed');
  check('exactly those three lines', C.incoming('mcp').length === 3, C.incoming('mcp').map(c => c.change + ':' + c.remoteId).join(' '));
  const nAsm = p.acAssumptionsData.length;
  C.decide({ accept: C.incoming('mcp').map(c => c.key) }, 'Sam Lee', 'follow the tools');
  const a402 = p.acAssumptionsData.find(r => r.asmSource.remoteId === 'jama:402');
  check('the removed item is flagged as missing, never deleted', p.acAssumptionsData.length === nAsm && a402 && a402.asmSource.missingInSource === true);
  check('the move is applied: Command elevator now sits under Control roll', p.acFunctionsData.find(r => r.subId === 'F.1.1.1').parentSubId === 'F.1.2');
  // a source this token cannot read
  pc.almTools.mcp.picks.push({ container: 'jama|34', containerName: 'Locked set', kind: 'req', scope: 'sys-fcs' });
  p.systemsData[0].req.push({ internalId: 'x1', id: 'HL1-LCK-9', text: 'was in the locked set', reqSource: { tool: 'mcp', remoteId: 'jama:509', key: 'HL1-LCK-9', container: 'jama|34' } });
  T.S.lockSet = 34;
  await M.check(true);
  check('a source that cannot be read is named in the warnings, with the server’s reason, and flags nothing as missing', M.state().warnings.some(w => /Locked set/.test(w) && /cannot read set 34/.test(w)) && !C.incoming('mcp').some(c => c.remoteId === 'jama:509'), M.state().warnings.join(' | '));
  T.S.lockSet = null; pc.almTools.mcp.picks.pop(); p.systemsData[0].req.pop();
  // a server that gives no change mark
  T.S.noMarks = true;
  await M.check(true);
  C.decide({ accept: C.incoming('mcp').map(c => c.key) }, 'Sam Lee', 'marks');
  T.jama.items[303].name = 'The FCS shall report loss of a channel to the crew.'; T.jama.items[303].description = '<p>The FCS shall report loss of a channel to the crew.</p>';
  await M.check(true);
  check('a server with no change mark: a change in the words is still one line', C.incoming('mcp').length === 1 && C.incoming('mcp')[0].remoteId === 'jama:303' && C.incoming('mcp')[0].change === 'changed', C.incoming('mcp').map(c => c.change + ':' + c.remoteId).join(' '));
  C.decide({ accept: C.incoming('mcp').map(c => c.key) }, 'Sam Lee', 'ok');
  T.S.noMarks = false;
  await M.check(true); C.decide({ accept: C.incoming('mcp').map(c => c.key) }, 'Sam Lee', 'marks back');

  console.log('\n[M3] the session lost; event streams; plain words when something is wrong');
  const inits0 = T.S.inits;
  T.S.sid = 'forgotten';   // the server has let the session go
  await M.check(true);
  check('the session lost: one new handshake, and the check goes on', T.S.inits === inits0 + 1 && !M.state().warnings.length && M.state().diff && C.incoming('mcp').length === 0, T.S.inits + ' ' + M.state().warnings.join('|'));
  const T2 = standIn({ sse: true }), pc2 = cfg(), p2 = page(T2, pc2), M2 = p2.SLAlm.tool('mcp');
  await M2.refreshHas(); await M2.check(true);
  check('a server that answers as an event stream (with other messages before the answer) is read the same', p2.SLConnections.incoming('mcp').length === 10, String(p2.SLConnections.incoming('mcp').length));
  const T3 = standIn({ sessions: false, version: '2024-11-05' }), p3 = page(T3, cfg()), M3 = p3.SLAlm.tool('mcp');
  await M3.refreshHas(); await M3.check(true);
  check('a server with no session and an older MCP version is read the same, in its version', p3.SLConnections.incoming('mcp').length === 10 && p3.sent.filter(x => x.rpc === 'tools/call').every(x => x.headers['mcp-protocol-version'] === '2024-11-05' && !x.headers['mcp-session-id']));
  const T4 = standIn({ version: '2030-01-01' }), p4 = page(T4, cfg()), M4 = p4.SLAlm.tool('mcp');
  await M4.refreshHas(); let e4 = ''; try { await M4.driver.listContainers(M4.cfg(), M4.req); } catch (e) { e4 = e.message; }
  check('a server that speaks an MCP version Safety Lab does not is refused in plain words', /speaks MCP version 2030-01-01/.test(e4), e4);
  T.S.badList = true;
  await M.check(true);
  check('an answer whose list cannot be found is said plainly, and flags nothing', M.state().warnings.some(w => /no list Safety Lab can find/.test(w)) && !C.incoming('mcp').some(c => c.change === 'removed'), M.state().warnings.join(' | '));
  pc.almTools.mcp.readers[0].itemsPath = 'page.rows';
  await M.check(true);
  check('saying where the list is (Details) reads it', !M.state().warnings.length && C.incoming('mcp').length === 0, M.state().warnings.join(' | ') + ' ' + C.incoming('mcp').length);
  T.S.badList = false; delete pc.almTools.mcp.readers[0].itemsPath;
  pc.almTools.mcp.readers[0].fields = { id: 'nope' };
  await M.check(true);
  check('items with no id that can be found are counted in a warning and not staged', M.state().warnings.some(w => /have no id Safety Lab can find/.test(w)), M.state().warnings.join(' | '));
  pc.almTools.mcp.readers[0].fields = {};
  await M.check(true);
  // more items than one check reads: what was not read is never called missing
  A._mcpPageCap = 1;
  await M.check(true);
  check('a source too long to read in one check says so, and nothing from it is flagged as missing', M.state().warnings.some(w => /more items in this source than Safety Lab reads in one check/.test(w)) && !C.incoming('mcp').some(c => c.change === 'removed'), M.state().warnings.join(' | ') + ' || ' + C.incoming('mcp').map(c => c.change + ':' + c.remoteId).join(' '));
  delete A._mcpPageCap;
  await M.check(true);
  const one = await M.driver.seen(M.cfg(), M.req, 'jama:301'), oneG = await M.driver.seen(M.cfg(), M.req, 'genesys:G2');
  check('one item is read by its id through the reader it came from (the id as a number for Jama)', one && one.id === 'jama:301' && /50 ms/.test(one.name) && oneG && oneG.id === 'genesys:G2' && T.S.calls.some(c => c.name === 'jama_get_item' && c.args.id === 301) && T.S.calls.some(c => c.name === 'genesys_get_entity' && c.args.guid === 'G2'));

  console.log('\n[RO] read only');
  check('nothing is ever ready to send', C.outgoing('mcp').length === 0);
  const so = C.setOwner('mcp', ['jama:301'], 'sl', 'we want to edit it');
  check('Safety Lab cannot be made the owner of what the server owns', so.ok === false && /stay owned/.test(so.err), JSON.stringify(so));
  p.acFhaData.push({ internalId: 'fc1', fcId: 'FC-101', fcDesc: 'Loss of elevator command', subId: 'F.1.1.1', severity: 'Hazardous' });
  pc.almTools.mcp.send = { fc: { on: true, container: 'jama|31' } };
  check('a failure condition made in Safety Lab is not offered to it, even with sending asked for in the settings', C.outgoing('mcp').length === 0);
  const sr = await M.send([{ _send: 'fc', _row: p.acFhaData[0], _fields: { name: 'x', html: 'x', text: 'x' }, slId: 'FC-101', name: 'x' }], 'Sam Lee', 'try');
  check('a send is refused outright, and nothing goes to the server', sr.ok === false && /only reads/.test(sr.err) && T.S.writes.length === 0, JSON.stringify(sr));
  check('the Connections page says so', /Nothing\. Safety Lab only reads from Violet/.test(M.sendSettingsHtml()) && C.adapter('mcp').readOnly === true && C.adapter('mcp').pilot() === false);
  check('the driver has no way to write', ['update', 'create', 'link', 'comment'].every(k => M.driver[k] == null));
  delete pc.almTools.mcp.send; p.acFhaData.pop();

  console.log('\n[F] the fence');
  const F = (method, url, body, meta, h) => A.almRequestProblem('mcp', method, url, 'mcp.example.com', h || {}, meta || META(), body);
  const rpc = (method, params) => JSON.stringify({ jsonrpc: '2.0', id: 9, method, params });
  check('the handshake, the tool list and an approved tool pass', F('POST', URL_MCP, rpc('initialize', {})) === '' && F('POST', URL_MCP, rpc('tools/list', {})) === '' && F('POST', URL_MCP, JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })) === '' && F('POST', URL_MCP, rpc('tools/call', { name: 'jama_list_items', arguments: {} })) === '');
  check('a tool that was not named with the login is refused (the server’s write tool)', /was not approved/.test(F('POST', URL_MCP, rpc('tools/call', { name: 'jama_update_item', arguments: { id: 301 } }))));
  check('a call with no tool name is refused', /was not approved/.test(F('POST', URL_MCP, rpc('tools/call', {}))));
  check('any other method is refused (resources, prompts, sampling, logging)', ['resources/read', 'prompts/get', 'sampling/createMessage', 'logging/setLevel', 'completion/complete'].every(m => /only lists and calls the tools/.test(F('POST', URL_MCP, rpc(m, {})))));
  check('GET and DELETE are refused', /only ever sent a POST/.test(F('GET', URL_MCP)) && /only ever sent a POST/.test(F('DELETE', URL_MCP)));
  check('another path, another host, plain http and a query string are refused', /saved MCP address/.test(F('POST', 'https://mcp.example.com/admin', rpc('tools/list'))) && /saved address/.test(F('POST', 'https://evil.example.com/mcp', rpc('tools/list'))) && /https/.test(F('POST', 'http://mcp.example.com/mcp', rpc('tools/list'))) && /query string/.test(F('POST', URL_MCP + '?x=1', rpc('tools/list'))));
  check('a batch, a body that is not JSON, and no body are refused', [JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'tools/list' }]), 'not json', undefined, '{"method":"tools/list"}'].every(b => /not one JSON-RPC message/.test(F('POST', URL_MCP, b))));
  check('a login saved with no path or no tools reaches nothing', /saved MCP address/.test(F('POST', URL_MCP, rpc('tools/list'), { baseHost: 'mcp.example.com' })) && /was not approved/.test(F('POST', URL_MCP, rpc('tools/call', { name: 'jama_list_items' }), { baseHost: 'mcp.example.com', path: '/mcp' })));
  check('only MCP’s own headers pass', F('POST', URL_MCP, rpc('tools/list'), null, { accept: 'x', 'content-type': 'x', 'mcp-protocol-version': 'x', 'mcp-session-id': 'x' }) === '' && /header authorization is not sent/.test(F('POST', URL_MCP, rpc('tools/list'), null, { authorization: 'Bearer x' })) && /header cookie/.test(F('POST', URL_MCP, rpc('tools/list'), null, { cookie: 'a=b' })));
  check('nothing the engine sent in all of the above was outside the fence, and every call was a POST to the saved address', p.sent.length > 30 && p.sent.every(x => !x.bad && x.method === 'POST' && x.url === URL_MCP) && p.sent.filter(x => x.rpc === 'tools/call').every(x => APPROVED.split(' ').indexOf(x.name) >= 0));
  // a tool chosen in the settings but not approved with this person's login
  const pcU = cfg(); pcU.almTools.mcp.readers[1].items.tool = 'genesys_list_everything';
  const pU = page(standIn(), pcU), MU = pU.SLAlm.tool('mcp'); await MU.refreshHas(); await MU.check(true);
  check('a tool the project chose but this login never approved is not called; the warning says to sign in again', MU.state().warnings.some(w => /genesys_list_everything was not approved when this login was saved/.test(w)) && !pU.sent.some(x => !x.bad && x.name === 'genesys_list_everything'), MU.state().warnings.join(' | '));
  const pB = page(standIn(), cfg(), { door: 'browser' }), MB = pB.SLAlm.tool('mcp'); let eB = ''; try { await MB.check(true); } catch (e) { eB = e.message; }
  check('a browser-only session cannot connect (nowhere safe for the token), and makes no request', /desktop app or your company/.test(eB) && !pB.fetchedAny, eB);
  const pO = page(standIn(), cfg(), { oldApp: true }), MO = pO.SLAlm.tool('mcp'); await MO.refreshHas(); let eO = ''; try { await MO.check(true); } catch (e) { eO = e.message; }
  check('a desktop app from before this build says to update, and sends nothing', /Update the app/.test(eO) && pO.sent.length === 0, eO);
  const TS = standIn(), pS = page(TS, cfg(), { door: 'server' }), MS = pS.SLAlm.tool('mcp'); await MS.check(true);
  check('through a Safety Lab server: /bridge?tool=mcp, raw, with the person’s session and never a token', pS.SLConnections.incoming('mcp').length === 10 && pS.fetched.length > 5 && pS.fetched.every(f => f.auth === 'Bearer JWT-1' && f.path === '/v1/ai/bridge' && f.raw === '1' && f.method === 'POST' && f.ct === 'text/plain'), JSON.stringify(pS.fetched[0]));

  console.log('\n[R] the real relay (worker.js)');
  const R = relay();
  check('the relay loads', !!R.handle, R.err);
  if (R.handle) {
    const eng = src(ENG), between = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i); return i >= 0 && j > i ? t.slice(i, j) : ''; };
    const engFence = between(eng, '    var ALM_RULES = {', '    // ------------------------------------------------------------------ small helpers').split('\n').map(l => l.replace(/^    /, '')).join('\n').trim();
    check('the relay’s fence is the engine’s, word for word, and names the MCP rule', engFence === R.pxFence && /function mcpRequestProblem/.test(R.pxFence) && /mcp: \{\s*mcp: true/.test(R.pxFence));
    let r = await R.go('POST', URL_MCP, rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'Safety Lab', version: '1' } }));
    let j = JSON.parse(await r.text());
    check('the handshake goes out with the saved token as a Bearer token, and the session id comes back', r.status === 200 && j.raw === true && j.status === 200 && j.session === 'sess-1' && R.calls[0].init.headers.authorization === 'Bearer MCP-TOKEN' && R.calls[0].init.method === 'POST' && R.calls[0].init.redirect === 'manual' && R.calls[0].init.headers.accept === 'application/json, text/event-stream', JSON.stringify(j).slice(0, 300));
    check('the answer carries no token', !/MCP-TOKEN/.test(JSON.stringify(j)));
    const HS = { accept: 'application/json, text/event-stream', 'content-type': 'application/json', 'mcp-session-id': 'sess-1', 'mcp-protocol-version': '2025-06-18' };
    r = await R.go('POST', URL_MCP, rpc('tools/call', { name: 'jama_list_items', arguments: { setId: 31 } }), { h: HS }); j = JSON.parse(await r.text());
    check('an approved tool is called and its answer comes back whole', j.status === 200 && /HL1-SYS-101/.test(j.text) && R.calls[1].init.headers['mcp-session-id'] === 'sess-1');
    const n0 = R.calls.length;
    const refused = [['POST', URL_MCP, rpc('tools/call', { name: 'jama_update_item', arguments: { id: 301, name: 'x' } })], ['POST', URL_MCP, rpc('resources/read', { uri: 'x' })], ['GET', URL_MCP, null], ['DELETE', URL_MCP, null],
      ['POST', 'https://mcp.example.com/other', rpc('tools/list')], ['POST', 'https://evil.example.com/mcp', rpc('tools/list')], ['POST', URL_MCP + '?a=1', rpc('tools/list')], ['POST', URL_MCP, 'not json'], ['POST', URL_MCP, JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'tools/list' }])], ['POST', 'https://10.0.0.5/mcp', rpc('tools/list')]];
    for (const x of refused) { const rr = await R.go(x[0], x[1], x[2], { h: HS }); check('refused, nothing sent: ' + x[0] + ' ' + x[1].replace(/^https:\/\//, '') + ' ' + String(x[2] || '').slice(0, 60), rr.status >= 400 && R.calls.length === n0, rr.status + ' ' + (await rr.text()).slice(0, 200)); }
    r = await R.go('POST', URL_MCP, rpc('tools/list'), { h: Object.assign({ authorization: 'Bearer stolen' }, HS) });
    check('the page cannot put its own Authorization on the request', r.status >= 400 && R.calls.length === n0);
    r = await R.go('POST', URL_MCP, rpc('tools/list'), { uid: 'u2', h: HS });
    check('a person with no login saved reaches nothing', r.status === 404 && R.calls.length === n0);
    // what was checked is what is sent: a message with the method written twice
    const twice = '{"jsonrpc":"2.0","id":7,"method":"resources/read","method":"tools/list","params":{}}';
    r = await R.go('POST', URL_MCP, twice, { h: HS });
    const sentBody = R.calls.length > n0 ? R.calls[R.calls.length - 1].init.body : '';
    check('a message written to read two ways is sent the one way it was checked', r.status === 200 && sentBody === '{"jsonrpc":"2.0","id":7,"method":"tools/list","params":{}}', sentBody);
    R.secrets['u3:mcp_token'] = { secret: 'T3', meta: { baseHost: 'mcp.example.com', auth: 'bearer', path: '/mcp', tools: '' } };
    r = await R.go('POST', URL_MCP, rpc('tools/call', { name: 'jama_list_items', arguments: {} }), { uid: 'u3', h: HS });
    check('a login saved with no tools may list the tools but call none', r.status === 400 && /was not approved/.test(await r.text()));
    R.T.S.sse = true; R.state.hold = true;
    const t0 = Date.now();
    r = await Promise.race([R.go('POST', URL_MCP, rpc('tools/call', { name: 'jama_list_items', arguments: { setId: 33 } }), { h: HS }), wait(4000).then(() => null)]);
    j = r ? JSON.parse(await r.text()) : null;
    check('a stream the server keeps open is let go as soon as the answer has arrived', !!j && j.status === 200 && /HL1-ASM-1/.test(j.text) && R.state.cancelled === 1 && Date.now() - t0 < 3000, j ? JSON.stringify(j).slice(0, 200) : 'the relay never answered');
    R.T.S.sse = false; R.state.hold = false;
    R.T.S.token = 'CHANGED';
    r = await R.go('POST', URL_MCP, rpc('tools/list'), { h: HS });
    check('a token the server no longer accepts is said plainly (sign in again)', r.status === 401 && /did not accept the saved login/.test(await r.text()));
    check('the relay sends the token as a Bearer token whatever was saved as the sign-in method', /const bearer = tool === "polarion" \|\| isMcp \|\|/.test(R.proxy));
  }

  console.log('\n[T] the timer');
  const TT = standIn(), pT = page(TT, cfg()), MT = pT.SLAlm.tool('mcp'), AT = pT.SLAlm;
  await MT.refreshHas();
  check('an MCP server is checked again every 15 minutes unless told otherwise; the other tools never, unless asked', MT.every() === 15 && AT.tool('polarion').every() === 0);
  const now = Date.now();
  check('not before its time', AT.tickAll(now + 14 * 60000) === 0 && TT.S.calls.length === 0);
  check('at its time: one quiet check', AT.tickAll(now + 15 * 60000 + 1000) === 1);
  await wait(60);
  check('the check ran and staged its lines, with no toast', pT.SLConnections.incoming('mcp').length === 10 && !pT.toasts.some(t => /Violet/.test(t[1])), JSON.stringify(pT.toasts));
  check('not again until its time has passed again', AT.tickAll(Date.now() + 60000) === 0);
  pT.document.hidden = true;
  check('a tab nobody is looking at waits', AT.tickAll(Date.now() + 40 * 60000) === 0);
  pT.document.hidden = false;
  MT.state().checking = true;
  check('never on top of a check that is running', AT.tickAll(Date.now() + 40 * 60000) === 0);
  MT.state().checking = false;
  MT.setWatch(true, 0);
  check('0 minutes is never', MT.every() === 0 && AT.tickAll(Date.now() + 600 * 60000) === 0);
  MT.setWatch(true, 5);
  check('the minutes are kept on this computer, between 0 and 1440', MT.every() === 5 && pT.ls['safetyLab.alm.mcp.every'] === '5' && (MT.setWatch(true, 99999), MT.every() === 1440) && (MT.setWatch(true, -4), MT.every() === 0));
  MT.setWatch(true, 5); TT.S.token = 'CHANGED';
  check('at its time with a login the server refuses: the check is tried', AT.tickAll(Date.now() + 6 * 60000) === 1);
  await wait(60);
  check('a timed check the server refuses says why on the card, in plain words, and flags nothing', pT.SLConnections.adapter('mcp').warnings().some(w => /Could not read source Aircraft functions: the MCP server did not accept the saved login \(HTTP 401\)\. Nothing from it is flagged as missing\./.test(w)) && !pT.SLConnections.incoming('mcp').some(c => c.change === 'removed'), JSON.stringify(pT.SLConnections.adapter('mcp').warnings()));
  check('the Connections page offers the timer for every tool', /id="alm-every"/.test(src(ENG)) && /id="mcp-every"/.test(src(ENG)));

  console.log('\n[D] the vault and the pins');
  const mig = path.join(REPO, 'supabase', 'migrations', '20261127b_mcp_secret_kind.sql'), kit = path.join(REPO, 'customer-install', 'db', '31_mcp_secret_kind.sql');
  if (!fs.existsSync(mig)) console.log('  SKIP  this copy of the repo has no supabase/ folder');
  else {
    const m = fs.readFileSync(mig, 'utf8');
    check('the migration lets the table and save_secret() take the MCP login, two-factor still enforced, every earlier kind kept', (m.match(/'mcp_token'/g) || []).length === 2 && /perform private\.require_mfa\(\);/.test(m) && ['anthropic_key', 'voyage_key', 'jama_token', 'polarion_token', 'codebeamer_token', 'doors_token', 'cameo_token', 'genesys_token'].every(k => (m.match(new RegExp("'" + k + "'", 'g')) || []).length === 2));
    check('the customer kit carries the same file, and apply.sh runs it after file 30', fs.existsSync(kit) && fs.readFileSync(kit, 'utf8') === m && / 30_api_clients_and_collections 31_mcp_secret_kind;/.test(read('customer-install/db/apply.sh')) && /31_mcp_secret_kind\.sql/.test(read('customer-install/db/README.md')));
  }
  // the same proof the kit ships (customer-install/db/tests/access_rules), on a database built from the kit, when one is reachable
  const proofDir = path.join(REPO, 'customer-install', 'db', 'tests', 'access_rules');
  if (!process.env.PGHOST || !fs.existsSync(path.join(proofDir, 'checks_mcp_secret.txt'))) console.log('  SKIP  no Postgres named (PGHOST, PGPORT, PGUSER): the database proof is ' + 'customer-install/db/tests/access_rules/checks_mcp_secret.txt');
  else if (!MUT) {
    const x = cp.spawnSync('bash', [path.join(proofDir, 'run_proof.sh'), 'checks_mcp_secret.txt'], { cwd: proofDir, env: Object.assign({}, process.env, { DB: 'proof_mcp_secret' }), encoding: 'utf8', timeout: 240000 });
    check('on a database built from the kit: the MCP login saves under two-factor, only its owner sees that it is there, only the server reads it (11 checks)', /== 11 passed, 0 failed/.test(x.stdout), (x.stdout || '').split('\n').filter(l => /FAIL|==/.test(l)).join(' | ') + (x.stderr || '').slice(0, 200));
  }
  check('the page can save it (secret_store.js) and the relay reads "<tool>_token"', /mcp_token: 1/.test(read('site/secret_store.js')) && /readUserSecret\(env, caller\.userId, tool \+ "_token"\)/.test(read(PX)));
  const idx = read('site/index.html');
  check('index.html loads this build of the engine, the Connections page and the secret store', /alm_engine\.js\?v=1\.2"/.test(idx) && /connections\.js\?v=1\.3"/.test(idx) && /secret_store\.js\?v=1\.3"/.test(idx), (idx.match(/(alm_engine|connections|secret_store)\.js\?v=[0-9.]+/g) || []).join(' '));
  check('the Connections page lists the MCP server among the tools, read only', /\{ id: 'mcp', label: 'MCP server', how: 'Model Context Protocol, read only' \}/.test(read('site/connections.js')));

  console.log('\n[E] the real app');
  if (!MUT || MUTATIONS[MUT][0] === ENG) await realApp();

  if (!MUT) {
    console.log('\n[mutation] each guard, reverted, turns the test red');
    for (const k of Object.keys(MUTATIONS)) {
      const x = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { MUTATE: k, NO_APP: '1' }), encoding: 'utf8', timeout: 120000 });
      const fails = (x.stdout.match(/^  FAIL  .*$/mg) || []);
      check('MUTATE=' + k + ' turns the test red', x.status !== 0 && fails.length > 0, 'exit ' + x.status + ', ' + fails.length + ' failing' + (x.stderr ? ' ' + x.stderr.slice(0, 200) : ''));
    }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

// [E] the real app in a browser (Playwright, when it is installed here; the Mac wall has none, and says so)
async function realApp() {
  if (process.env.NO_APP) return;
  let pw = null; try { pw = require('playwright'); } catch (_) {}
  if (!pw) { console.log('  SKIP  Playwright is not installed here; [M]-[T] above prove the engine'); return; }
  const http = require('http');
  const SITE = path.join(REPO, 'site');
  const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const srv = http.createServer((q, r) => { let pth = decodeURIComponent(q.url.split('?')[0]); if (pth.endsWith('/')) pth += 'index.html'; const f = path.join(SITE, path.normalize(pth)); if (!f.startsWith(SITE)) { r.writeHead(404); return r.end(); }
    let body; try { body = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
    if (MUT && f.endsWith(path.join('site', 'alm_engine.js'))) body = Buffer.from(src(ENG));
    r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(body); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const b = await pw.chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.addInitScript(standIn.toString() + ';(function(){var T=standIn();window.__T=T;window.__slabDesktop=true;var saved={};window.__saved=saved;window.__sent=[];' +
      'window.slabSecrets={save:async(k,v,m)=>{saved[k]={v:v,m:m};return{ok:true}},status:async()=>({secrets:Object.keys(saved).map(k=>({kind:k,meta:saved[k].m}))}),available:async()=>({ok:true})};' +
      'window.slabBridge={toolOpts:true,toolMcp:true,get:async()=>({ok:false,error:"no jama"}),send:async()=>({ok:false}),tool:async(t,m,u,bd,o)=>{var sv=saved[t]||{m:{}};var hdr=(o&&o.headers)||{};' +
      'var bad=window.SLAlm.almRequestProblem(t,m,u,sv.m.baseHost||"",hdr,sv.m,bd);var name="";try{var q=JSON.parse(bd);name=q.method+(q.params&&q.params.name?":"+q.params.name:"")}catch(_){}window.__sent.push({bad:bad,name:name});' +
      'if(bad)return{ok:false,error:"Not sent: "+bad+"."};var h={authorization:"Bearer "+((sv.v&&sv.v.token)||"")};Object.keys(hdr).forEach(function(k){h[k.toLowerCase()]=hdr[k]});' +
      'var r=T.handle(m,new URL(u).pathname,h,bd);if(r.status===401)return{ok:false,status:401,error:"the MCP server did not accept the saved login (HTTP 401)."};' +
      'return{ok:true,raw:true,status:r.status,text:r.text,etag:"",location:"",session:r.headers["mcp-session-id"]||"",retryAfter:0}}};})();');
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e))); pg.on('dialog', d => d.dismiss().catch(() => {}));
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/?ai=1'); await wait(3500);
    await pg.evaluate(() => { const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked'); document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; }); });
    await pg.evaluate(async () => { await loadSampleProject(); }); await wait(3000);
    const decideCma = () => pg.evaluate(() => { const L = window.SLCmaLive; if (!L || !L.pending().length) return 0; L.pending().forEach(x => L.setChoice(x.key, 'ignore', 'test: not part of this check')); L.submitModal(); return 1; });
    await decideCma(); await wait(500); await decideCma();
    await pg.evaluate(() => { SLAlm._waitScale = 0; SLConnections.show('main'); }); await wait(500);
    check('[E] the Connections page offers the MCP server, read only', await pg.evaluate(() => Array.from(document.querySelectorAll('#conn-host .cx-off')).some(x => /MCP server/.test(x.innerText) && /read only/.test(x.innerText) && /Connect/.test(x.innerText))));
    await decideCma();
    await pg.click('#conn-host .cx-off:has-text("MCP server") button'); await wait(500);
    await pg.fill('#mcp-name', 'Violet'); await pg.fill('#mcp-url', 'https://mcp.example.com/mcp'); await pg.fill('#mcp-tok', 'MCP-TOKEN');
    await decideCma(); await pg.click('#alm-setup button:has-text("Connect")'); await wait(1200);
    check('[E] Connect lists the server’s tools, folded behind their count', await pg.evaluate(() => /The server’s tools \(7\)/.test(document.getElementById('mcp-readers').innerText) && document.querySelectorAll('#mcp-readers details.cx-fold').length >= 1 && !document.querySelector('#mcp-readers details.cx-fold').open), await pg.evaluate(() => (document.getElementById('mcp-err') || {}).textContent + ' | ' + (document.getElementById('mcp-readers') || {}).innerText.slice(0, 200)));
    check('[E] at this point the token is saved with the address and no tool', await pg.evaluate(() => { const s = window.__saved.mcp; return !!s && s.m.baseHost === 'mcp.example.com' && s.m.path === '/mcp' && !s.m.tools && s.m.auth === 'bearer'; }), JSON.stringify(await pg.evaluate(() => window.__saved.mcp && window.__saved.mcp.m)));
    // the first reader was added for the engineer; choose its tools
    const pick = (i, role, name) => pg.evaluate(([i, role, name]) => { SLAlm.ui('mcp').set(i, role + '.tool', name); }, [i, role, name]);
    await pg.evaluate(() => SLAlm.ui('mcp').set(0, 'name', 'Jama'));
    await pick(0, 'sources', 'jama_list_sets'); await pick(0, 'items', 'jama_list_items'); await pick(0, 'one', 'jama_get_item');
    await pg.evaluate(() => SLAlm.ui('mcp').set(0, 'sources.args', '{"project": 12}'));
    await pg.evaluate(() => SLAlm.ui('mcp').add()); await pg.evaluate(() => SLAlm.ui('mcp').set(1, 'name', 'GENESYS'));
    await pick(1, 'sources', 'genesys_list_folders'); await pick(1, 'items', 'genesys_list_entities'); await pick(1, 'one', 'genesys_get_entity');
    const w = await pg.evaluate(() => JSON.parse(JSON.stringify(SLAlm.drivers.mcp._w.readers)));
    check('[E] the argument names are filled from the tools’ own descriptions: the source, the paging, the id, and whether each is a number',
      w.length === 2 && w[0].items.sourceArg === 'setId' && w[0].items.sourceNum === true && w[0].items.offsetArg === 'startAt' && w[0].items.limitArg === 'maxResults' && !w[0].items.cursorArg && w[0].one.idArg === 'id' && w[0].one.idNum === true &&
      w[1].items.sourceArg === 'folder' && w[1].items.sourceNum === false && w[1].items.cursorArg === 'cursor' && w[1].items.limitArg === 'limit' && w[1].one.idArg === 'guid' && w[0].key === 'jama' && w[1].key === 'genesys', JSON.stringify(w));
    if (process.env.SHOT) { await pg.evaluate(() => { const d = document.querySelector('#mcp-readers details.cx-fold:last-of-type'); document.querySelectorAll('#mcp-readers .cx-sub details').forEach((x, i) => { if (i === 0) x.open = true; }); }); await pg.screenshot({ path: path.join(process.env.SHOT, 'mcp_setup.png'), fullPage: false }); }
    await pg.fill('#mcp-tok', '');
    await pg.click('#alm-setup button:has-text("Save and test")'); await wait(600);
    check('[E] new tools need the token once more: they are saved with the login', await pg.evaluate(() => /Type the token once more/.test(document.getElementById('mcp-err').textContent) && !(projectConfig.almTools && projectConfig.almTools.mcp && (projectConfig.almTools.mcp.readers || []).length)), await pg.evaluate(() => document.getElementById('mcp-err').textContent));
    await pg.fill('#mcp-tok', 'MCP-TOKEN'); await pg.fill('#mcp-every', '10');
    await decideCma(); await pg.click('#alm-setup button:has-text("Save and test")'); await wait(1800);
    const sv = await pg.evaluate(() => ({ m: window.__saved.mcp.m, cfg: projectConfig.almTools.mcp, every: localStorage.getItem('safetyLab.alm.mcp.every') }));
    check('[E] saved: the login names exactly the six read tools; the project keeps the address, the name and the readers, never the token',
      sv.m.tools === 'jama_list_sets jama_list_items jama_get_item genesys_list_folders genesys_list_entities genesys_get_entity' && sv.cfg.label === 'Violet' && sv.cfg.baseUrl === 'https://mcp.example.com/mcp' && sv.cfg.readers.length === 2 && !/MCP-TOKEN/.test(JSON.stringify(sv.cfg)) && sv.every === '10', JSON.stringify(sv));
    check('[E] the test read passed and "choose what is linked" opened, listing all five sources with what each most likely holds', await pg.evaluate(() => { const rows = Array.from(document.querySelectorAll('#alm-browse .alm-pick')), by = id => rows.find(r => r.getAttribute('data-id') === id); return rows.length === 5 && !!by('genesys|F-FN') && by('genesys|F-FN').querySelector('.alm-kind').value === 'fn' && !!by('jama|33') && by('jama|33').querySelector('.alm-kind').value === 'asm'; }), await pg.evaluate(() => ((document.getElementById('mcp-err') || {}).textContent || '') + ' | ' + Array.from(document.querySelectorAll('#alm-browse .alm-pick')).map(r => r.getAttribute('data-id')).join(',') + ' | ' + ((document.getElementById('alm-browse') || {}).innerText || '').slice(0, 300)));
    await pg.evaluate(() => { document.querySelectorAll('#alm-browse .alm-pick').forEach(tr => { const id = tr.getAttribute('data-id'); if (id === 'genesys|F-FN' || id === 'jama|31') tr.querySelector('.alm-on').checked = true; }); });
    if (process.env.SHOT) await pg.screenshot({ path: path.join(process.env.SHOT, 'mcp_browse.png'), fullPage: false });
    await decideCma(); await pg.click('#alm-browse button:has-text("Save and check")'); await wait(2200);
    const st = await pg.evaluate(() => ({ inc: SLConnections.incoming('mcp').length, lines: SLChangeAck.lines().length, fn: SLConnections.incoming('mcp').filter(c => c.kind === 'fn').length, label: SLConnections.incoming('mcp')[0] && SLConnections.incoming('mcp')[0].tool }));
    check('[E] the check staged the 5 functions (4 lines) and 4 requirements in Incoming changes; nothing entered the analysis by itself', st.inc === 8 && st.fn === 4, JSON.stringify(st));
    check('[E] connecting, choosing and checking are not "changes to confirm"', st.lines === 0);
    await pg.evaluate(() => { try { SLConnections.popLater(); } catch (_) {} SLConnections.show('main'); }); await wait(500);
    const card = await pg.evaluate(() => { const c = Array.from(document.querySelectorAll('#conn-host .cx-card')).find(x => /Violet/.test(x.innerText)); return c ? c.innerText.replace(/\s+/g, ' ') : ''; });
    check('[E] the card carries the project’s name for it, says it only reads, and says how often it is checked', /Violet/.test(card) && /Connected/.test(card) && /only reads from Violet/.test(card) && /every 10 minutes/.test(card) && /mcp\.example\.com/.test(card) && /Jama, GENESYS/.test(card), card.slice(0, 400));
    if (process.env.SHOT) await pg.screenshot({ path: path.join(process.env.SHOT, 'mcp_card.png'), fullPage: false });
    const sent = await pg.evaluate(() => window.__sent);
    check('[E] nothing the app sent was refused by the fence, and the write tool was never asked for', sent.length > 10 && sent.every(s => !s.bad) && !sent.some(s => /jama_update_item/.test(s.name)) && await pg.evaluate(() => window.__T.S.writes.length === 0), JSON.stringify(sent.filter(s => s.bad)));
    check('[E] no page errors', errs.length === 0, errs.join(' | ').slice(0, 400));
  } finally { await b.close(); srv.close(); }
}
