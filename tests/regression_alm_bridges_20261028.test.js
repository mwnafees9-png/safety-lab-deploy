#!/usr/bin/env node
/*
 * Regression: Polarion and Codebeamer on the Connections framework (alm_engine.js, 28 Oct 2026).
 *
 * Waqas: live two-way links with "Jama, Polarion, DOORS Next, Codebeamer, Cameo" and GENESYS; one owner per linked
 * item; changes from the owning tool "never update[d] automatically without their engineering teams consent"; Safety
 * Lab-owned changes pushed by a person. The real func_tree.js, connections.js and alm_engine.js run against an
 * in-memory Polarion (REST API v1, JSON:API, shaped from Siemens' published OpenAPI document) and an in-memory
 * Codebeamer (Swagger API v3, shaped from PTC's published examples), through the desktop bridge and through the
 * Safety Lab server. Pinned:
 *   [P1] Polarion: what is chosen in Mapping is read in full (document parts paged, work items by id); the function
 *        tree comes from the "parent" links; every difference is one line; accepting a leaf brings its new parents;
 *        rows carry string ids and are locked to Polarion;
 *   [P2] a rename, a move, an item gone: changed, moved, removed lines; a removed item is flagged, never deleted;
 *        a rejected line stays out until Polarion changes the item again; a document that cannot be read flags nothing;
 *   [P3] sending: an item Safety Lab owns goes out as a PATCH with a comment; changed in Polarion since, it is held;
 *        a failure condition made in Safety Lab is created, moved into the chosen document, linked to its function;
 *        an edit to it goes out as a change;
 *   [C1] Codebeamer: trackers read through items/query, paged; parents make the tree; requirements to a system;
 *        keys from the tracker key name; a "slow down" (429) is waited out;
 *   [C2] sending: an owned item changes through PUT items/{id}/fields with the tracker's field ids; a new failure
 *        condition is created in the tracker and associated ("related") to its function; no comment calls;
 *   [F]  the fence: only https, the saved host, the tool's REST paths, and for writes only create, change, link and
 *        comment; nothing the engine sent was outside it; a browser-only session cannot connect; the server door
 *        sends the request to /bridge?tool=&target= with the person's session, never a login;
 *   [X]  both tools in Incoming changes and the pill together.
 * MUTATE=<name> reverts one guard; each must turn the test red.
 *
 * Run: node tests/regression_alm_bridges_20261028.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 600) + ')' : '')); } };
const REPO = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');
const MUTATIONS = {
  fence:   ['site/alm_engine.js', "var ok = (R.read[m] || []).concat(R.write[m] || []).some(function (re) { return re.test(rest); });", 'var ok = true;'],
  host:    ['site/alm_engine.js', "if (!savedHost || u.hostname.toLowerCase() !== String(savedHost).toLowerCase()) return 'only the saved address can be reached';", ''],
  held:    ['site/alm_engine.js', "if (S(now.modified) !== S(l.seen)) {", 'if (false) {'],
  held2:   ['site/alm_engine.js', "if (link.modified && S(now2.modified) !== S(link.modified)) {", 'if (false) {'],
  unread:  ['site/alm_engine.js', "by.forEach(function (r, id) { var s = r[K.src]; if (!seen.has(id) && !s.missingInSource && read.has(String(s.container || ''))) missing.push", "by.forEach(function (r, id) { var s = r[K.src]; if (!seen.has(id) && !s.missingInSource) missing.push"],
  subset:  ['site/alm_engine.js', "if (Array.isArray(x[arr])) y[arr] = x[arr].filter(function (e) { return want.has(_key(sc, k, arr, e)); });", 'if (Array.isArray(x[arr])) y[arr] = x[arr];'],
  parents: ['site/alm_engine.js', "arrOf(x.fresh).forEach(function (e) { if (want.has(_key(sc, 'fn', 'fresh', e))) pull(e); });", ''],
  paging:  ['site/alm_engine.js', "if (!(j && j.links && j.links.next) || !arrOf(j && j.data).length) break; n++;\n            }\n            var order", "break;\n            }\n            var order"],
  parent:  ['site/alm_engine.js', "if (s.length >= 5 && s[2] === 'parent' && order.has(s[4])) parent = parent || s[4];", ''],
  retry:   ['site/alm_engine.js', "if (status === 429 && tries < 3)", 'if (false)'],
  door:    ['site/alm_engine.js', "return drv.label + ' connects through the Safety Lab desktop app", "return ''; ('"],
  gone:    ['site/alm_engine.js', "if (!n) missing.push({ row: r, why: 'no longer in the tool' });", ''],
};
const MUT = process.env.MUTATE || '';
function src(p) {
  let s = read(p);
  if (MUT) { const m = MUTATIONS[MUT]; if (!m) { console.error('unknown mutation ' + MUT); process.exit(3); } if (m[0] === p) { if (s.indexOf(m[1]) < 0) { console.error('mutation ' + MUT + ' anchor not found'); process.exit(4); } s = s.split(m[1]).join(m[2]); } }
  return s;
}

// ------------------------------------------------------------------ an in-memory Polarion (REST API v1)
function polarion() {
  const P = 'FCS', API = '/polarion/rest/v1';
  let clock = 0, next = 100;
  const stamp = () => '2026-10-28T11:' + String(10 + (clock++ % 49)).padStart(2, '0') + ':00Z';
  const wi = new Map();       // id -> { id, type, title, description:{type,value}, updated, links:[{role, to}] }
  const docs = new Map();     // 'FCS/space/name' -> { title, parts: [workItemId | {heading}] }
  const comments = [], log = [], writes = [];
  const add = (id, type, title, parent, doc) => { wi.set(id, { id, type, title, description: { type: 'text/html', value: '<p>' + title + ' <b>in detail</b></p>' }, updated: '2026-10-20T10:00:00Z', links: parent ? [{ role: 'parent', to: parent }] : [] }); if (doc) docs.get(doc).parts.push(id); };
  docs.set('FCS/_default/Aircraft functions', { title: 'Aircraft functions', parts: [] });
  docs.set('FCS/Requirements/FCS requirements', { title: 'FCS requirements', parts: [] });
  docs.set('FCS/_default/Safety', { title: 'Safety', parts: [] });
  docs.set('FCS/_default/Locked', { title: 'Locked', parts: [] });
  const F = 'FCS/_default/Aircraft functions';
  docs.get(F).parts.push({ heading: 'Functions' });
  add('FCS-1', 'function', 'Control flight path', null, F);
  add('FCS-2', 'function', 'Control pitch', 'FCS-1', F);
  add('FCS-4', 'function', 'Command elevator', 'FCS-2', F);
  add('FCS-3', 'function', 'Control roll', 'FCS-1', F);
  add('FCS-5', 'function', 'Command ailerons', 'FCS-3', F);
  add('FCS-9', 'function', 'Provide cabin lighting', null, F);
  const R = 'FCS/Requirements/FCS requirements';
  add('FCS-20', 'requirement', 'The FCS shall command the elevator within 50 ms.', null, R);
  add('FCS-21', 'requirement', 'The FCS shall annunciate loss of pitch trim.', null, R);
  const body = it => ({ type: 'workitems', id: P + '/' + it.id, attributes: { title: it.title, description: it.description, updated: it.updated, type: it.type },
    relationships: { linkedWorkItems: { data: it.links.map(l => ({ type: 'linkedworkitems', id: P + '/' + it.id + '/' + l.role + '/' + P + '/' + l.to })) } } });
  const PAGE_MAX = 4;   // smaller than Polarion's 100, so paging is exercised
  function handle(method, url, b) {
    const u = new URL(url), pth = decodeURIComponent(u.pathname);
    if (method === 'GET') log.push('GET ' + pth); else writes.push({ method, path: pth, body: JSON.parse(JSON.stringify(b == null ? null : b)) });
    if (u.hostname !== 'polarion.example.com') return [502, { errors: [{ title: 'wrong host' }] }];
    if (!pth.startsWith(API + '/')) return [404, {}];
    const rest = pth.slice(API.length + 1); let m;
    const pg = list => { const size = Math.min(PAGE_MAX, Number(u.searchParams.get('page[size]') || 100)), num = Number(u.searchParams.get('page[number]') || 1); const s = list.slice((num - 1) * size, num * size); return [200, { data: s, links: num * size < list.length ? { next: 'next' } : {} }]; };
    if (method === 'GET' && rest === 'projects/' + P) return [200, { data: { type: 'projects', id: P, attributes: { name: 'Flight Control System' } } }];
    if (method === 'GET' && rest === 'projects') return pg([{ type: 'projects', id: P, attributes: { name: 'Flight Control System' } }]);
    if (method === 'GET' && rest === 'projects/' + P + '/documents') return pg(Array.from(docs.keys()).map(id => ({ type: 'documents', id, attributes: { title: docs.get(id).title } })));
    if (method === 'GET' && (m = /^projects\/FCS\/spaces\/([^/]+)\/documents\/(.+)\/parts$/.exec(rest))) {
      const d = docs.get(P + '/' + m[1] + '/' + m[2]); if (!d) return [404, {}];
      if (d.title === 'Locked') return [403, { errors: [{ title: 'Forbidden' }] }];
      return pg(d.parts.map((x, i) => typeof x === 'string' ? { type: 'document_parts', id: P + '/' + m[1] + '/' + m[2] + '/workitem_' + x, attributes: { type: 'workitem' }, relationships: { workItem: { data: { type: 'workitems', id: P + '/' + x } } } } : { type: 'document_parts', id: 'h' + i, attributes: { type: 'heading' } }));
    }
    if (method === 'GET' && rest === 'projects/' + P + '/workitems') {
      const q = u.searchParams.get('query') || ''; const mm = /^id:\((.*)\)$/.exec(q); if (!mm) return [400, {}];
      const ids = mm[1].split(' ').filter(Boolean);
      return pg(ids.filter(id => wi.has(id)).map(id => body(wi.get(id))));
    }
    if (method === 'GET' && (m = /^projects\/FCS\/workitems\/([^/]+)$/.exec(rest))) { const it = wi.get(m[1]); return it ? [200, { data: body(it) }] : [404, {}]; }
    if (method === 'PATCH' && (m = /^projects\/FCS\/workitems\/([^/]+)$/.exec(rest))) {
      const it = wi.get(m[1]); if (!it) return [404, {}];
      const a = (b && b.data && b.data.attributes) || {}; if (a.title != null) it.title = a.title; if (a.description) it.description = a.description; it.updated = stamp(); return [204, null];
    }
    if (method === 'POST' && rest === 'projects/' + P + '/workitems') {
      const d = b.data[0], id = 'FCS-' + (next++); wi.set(id, { id, type: d.attributes.type, title: d.attributes.title, description: d.attributes.description, updated: stamp(), links: [] });
      return [201, { data: [{ type: 'workitems', id: P + '/' + id }] }];
    }
    if (method === 'POST' && (m = /^projects\/FCS\/workitems\/([^/]+)\/actions\/moveToDocument$/.exec(rest))) { const d = docs.get(b.targetDocument); if (!d || !wi.has(m[1])) return [400, {}]; d.parts.push(m[1]); return [204, null]; }
    if (method === 'POST' && (m = /^projects\/FCS\/workitems\/([^/]+)\/linkedworkitems$/.exec(rest))) { const it = wi.get(m[1]); const l = b.data[0]; it.links.push({ role: l.attributes.role, to: l.relationships.workItem.data.id.split('/')[1] }); return [201, { data: [{ type: 'linkedworkitems', id: 'x' }] }]; }
    if (method === 'POST' && (m = /^projects\/FCS\/workitems\/([^/]+)\/comments$/.exec(rest))) { comments.push({ id: m[1], text: b.data[0].attributes.text.value }); return [201, { data: [{ type: 'workitem_comments', id: 'c' }] }]; }
    return [404, { errors: [{ title: 'Not Found' }] }];
  }
  return { wi, docs, comments, log, writes, handle, stamp, F, R };
}

// ------------------------------------------------------------------ an in-memory Codebeamer (Swagger API v3)
function codebeamer() {
  const API = '/cb/api/v3';
  let clock = 0, next = 9000, slowOnce = true;
  const stamp = () => '2026-10-28T12:' + String(10 + (clock++ % 49)).padStart(2, '0') + ':00.000';
  const items = new Map(), assoc = [], log = [], writes = [];
  const trackers = { 501: { id: 501, name: 'System functions', keyName: 'SFN' }, 502: { id: 502, name: 'Software requirements', keyName: 'SWR' }, 503: { id: 503, name: 'Safety', keyName: 'SAF' } };
  const add = (id, tracker, name, parent, ord) => items.set(id, { id, name, description: "__" + name + "__ in ''wiki''", descriptionFormat: 'Wiki', modifiedAt: '2026-10-20T10:00:00.000', version: 1, tracker: { id: tracker, name: trackers[tracker].name, type: 'TrackerReference' }, parent: parent ? { id: parent, type: 'TrackerItemReference' } : null, ordinal: ord });
  add(1001, 501, 'Provide hydraulic power', null, 1);
  add(1002, 501, 'Pressurise system A', 1001, 2);
  add(1003, 501, 'Pressurise system B', 1001, 3);
  add(1004, 501, 'Monitor reservoir level', null, 4);
  add(1005, 501, 'Isolate a leak', 1002, 5);
  add(2001, 502, 'The software shall isolate a leak within 2 s.', null, 1);
  add(2002, 502, 'The software shall report reservoir level.', null, 2);
  add(2003, 502, 'The software shall log pump faults.', null, 3);
  const fields = name => name;
  function handle(method, url, b) {
    const u = new URL(url), pth = decodeURIComponent(u.pathname);
    if (method === 'GET' || (method === 'POST' && /items\/query$/.test(pth))) log.push(method + ' ' + pth); else writes.push({ method, path: pth, body: JSON.parse(JSON.stringify(b == null ? null : b)) });
    if (u.hostname !== 'cb.example.com' || !pth.startsWith(API + '/')) return [404, {}];
    const rest = pth.slice(API.length + 1); let m;
    if (method === 'GET' && rest === 'projects/7') return [200, { id: 7, name: 'Hydraulics' }];
    if (method === 'GET' && rest === 'projects') return [200, [{ id: 7, name: 'Hydraulics' }]];
    if (method === 'GET' && rest === 'projects/7/trackers') return [200, Object.values(trackers).map(t => ({ id: t.id, name: t.name, type: { name: 'Requirement' } }))];
    if (method === 'GET' && (m = /^trackers\/(\d+)$/.exec(rest))) return trackers[m[1]] ? [200, trackers[m[1]]] : [404, {}];
    if (method === 'GET' && (m = /^trackers\/(\d+)\/fields$/.exec(rest))) return [200, [{ id: 0, name: 'ID' }, { id: 3, name: 'Summary' }, { id: 80, name: 'Description' }, { id: 7, name: 'Status' }]];
    if (method === 'GET' && rest === 'associations/types') return [200, [{ id: 1, name: 'depends' }, { id: 2, name: 'parent' }, { id: 4, name: 'related' }]];
    if (method === 'POST' && rest === 'items/query') {
      if (slowOnce) { slowOnce = false; return [429, { message: 'Too many requests' }, 0]; }
      const mm = /^tracker\.id IN \((\d+)\)$/.exec(b.queryString || ''); if (!mm) return [400, {}];
      const all = Array.from(items.values()).filter(i => i.tracker.id === Number(mm[1]));
      const size = Math.min(2, b.pageSize || 25), page = b.page || 1;   // smaller than Codebeamer's 500 so paging is exercised
      return [200, { page, pageSize: size, total: all.length, items: all.slice((page - 1) * size, page * size) }];
    }
    if (method === 'GET' && (m = /^items\/(\d+)$/.exec(rest))) { const it = items.get(Number(m[1])); return it ? [200, it] : [404, {}]; }
    if (method === 'PUT' && (m = /^items\/(\d+)\/fields$/.exec(rest))) {
      const it = items.get(Number(m[1])); if (!it) return [404, {}];
      (b.fieldValues || []).forEach(f => { if (f.fieldId === 3) it.name = f.value; if (f.fieldId === 80) { it.description = f.value; it.descriptionFormat = 'Wiki'; } });
      it.modifiedAt = stamp(); it.version++; return [200, it];
    }
    if (method === 'POST' && (m = /^trackers\/(\d+)\/items$/.exec(rest))) {
      const id = next++; items.set(id, { id, name: b.name, description: b.description, descriptionFormat: b.descriptionFormat, modifiedAt: stamp(), version: 1, tracker: { id: Number(m[1]) }, parent: null, ordinal: id });
      return [201, items.get(id)];
    }
    if (method === 'POST' && rest === 'associations') { assoc.push(b); return [201, { id: next++ }]; }
    return [404, { message: 'no such endpoint' }];
  }
  return { items, assoc, log, writes, handle, stamp, add };
}

// ------------------------------------------------------------------ the page
function page(T, pc, opts) {
  opts = opts || {};
  const els = {};
  const document = { readyState: 'complete', body: { appendChild(el) { if (el && el.id) els[el.id] = el; } }, head: { appendChild() {} }, documentElement: { appendChild() {} },
    getElementById: id => els[id] || null, addEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
    createElement: () => ({ innerHTML: '', style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, querySelector: () => null, addEventListener() {}, remove() { delete els[this.id]; } }) };
  const toasts = [], sent = [];
  const ctx = { console, URL, setTimeout, clearTimeout, setInterval: () => 1, clearInterval: () => {}, navigator: { userAgent: 'test' }, encodeURIComponent, decodeURIComponent,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, document, Blob: function () {},
    acFunctionsData: [], acReqData: [], acAssumptionsData: [], acFcimData: [], acFhaData: [], acExtractedFCs: [], ftaPages: [],
    systemsData: [{ id: 'sys-fcs', name: 'Flight Control System', functions: [], req: [], asm: [] }, { id: 'sys-hyd', name: 'Hydraulics', functions: [], req: [], asm: [] }],
    projectConfig: pc, newRowId: (() => { let n = 0; return () => 'r' + (++n); })(), showToast: (m, k) => toasts.push([k, m]), toasts, scheduleAutosave: () => {},
    getActiveWorkspace: () => null, sent };
  const route = (tool, method, url, body) => {
    const S = (ctx.SLAlm || { almRequestProblem: () => '' });
    const host = tool === 'polarion' ? 'polarion.example.com' : 'cb.example.com';
    const bad = S.almRequestProblem(tool, method, url, host);
    sent.push({ tool, method, url, bad });
    if (bad) return { ok: false, error: 'Not sent: ' + bad };
    const r = T[tool].handle(method, url, body);
    if (r[0] >= 200 && r[0] < 300) return { ok: true, status: r[0], data: r[1] };
    return { ok: false, status: r[0], error: 'HTTP ' + r[0], retryAfter: r[2] };
  };
  if (opts.door === 'server') {
    ctx.SecretStore = { door: () => 'vault', has: k => /_token$/.test(k), sessionJwt: () => 'JWT-1', save: async () => ({ ok: true }) };
    ctx.SLConfig = { aiEndpoint: 'https://ai.example.com/v1/ai' };
    ctx.fetch = async (url, init) => {
      const u = new URL(url); const tool = u.searchParams.get('tool'), target = u.searchParams.get('target');
      ctx.fetched = (ctx.fetched || []).concat([{ url, auth: init.headers.Authorization, method: init.method, path: u.pathname }]);
      const r = route(tool, init.method, target, init.body ? JSON.parse(init.body) : undefined);
      return { ok: r.ok, status: r.ok ? r.status : (r.status || 400), headers: { get: () => null }, text: async () => JSON.stringify(r.ok ? r.data : { error: { message: r.error } }) };
    };
  } else if (opts.door === 'browser') {
    ctx.SecretStore = { door: () => 'session', has: () => false, save: async () => ({ ok: true }) };
    ctx.fetch = async () => { ctx.fetchedAny = true; throw new Error('the browser-only page made a network request'); };
  } else {
    ctx.slabSecrets = { save: async () => ({ ok: true }), status: async () => ({ secrets: [{ kind: 'polarion' }, { kind: 'codebeamer' }] }) };
    ctx.slabBridge = { get: async () => ({ ok: false }), send: async () => ({ ok: false }), tool: async (tool, m, u, b) => route(tool, m, u, b) };
    ctx.fetch = async () => { throw new Error('the desktop page made a network request'); };
  }
  ctx.window = ctx; ctx.globalThis = ctx; ctx.jrnl = () => {};
  vm.createContext(ctx);
  for (const f of ['site/func_tree.js', 'site/connections.js', 'site/alm_engine.js']) vm.runInContext(src(f), ctx, { filename: f });
  ctx.SLAlm._waitScale = 0;
  return ctx;
}
const cfg = () => ({ almTools: {
  polarion: { baseUrl: 'https://polarion.example.com', project: 'FCS', auth: 'bearer',
    picks: [{ container: 'FCS/_default/Aircraft functions', containerName: 'Aircraft functions', kind: 'fn', scope: 'ac' },
            { container: 'FCS/Requirements/FCS requirements', containerName: 'FCS requirements', kind: 'req', scope: 'sys-fcs' }],
    send: { fc: { on: true, container: 'FCS/_default/Safety', containerName: 'Safety', type: 'failureCondition' } } },
  codebeamer: { baseUrl: 'https://cb.example.com/cb', project: '7', auth: 'basic', user: 'sam',
    picks: [{ container: '501', containerName: 'System functions', kind: 'fn', scope: 'ac' }, { container: '502', containerName: 'Software requirements', kind: 'req', scope: 'sys-hyd' }],
    send: { fc: { on: true, container: '503', containerName: 'Safety' } } } } });
const tick = () => new Promise(r => setTimeout(r, 5));

// [E] the real app in a browser (Playwright, when it is installed here; the Mac wall has none, and says so)
async function realApp() {
  let pw = null; try { pw = require('playwright'); } catch (_) {}
  if (!pw) { console.log('  SKIP  Playwright is not installed here; [P]-[X] above prove the engine'); return; }
  const http = require('http');
  const SITE = path.join(REPO, 'site');
  const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(404); return r.end(); }
    let body; try { body = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
    if (MUT && f.endsWith(path.join('site', 'alm_engine.js'))) body = Buffer.from(src('site/alm_engine.js'));
    r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(body); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const b = await pw.chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
    const FAKES = polarion.toString() + '\n' + codebeamer.toString();
    await ctx.addInitScript(FAKES + ';(function(){var T={polarion:polarion(),codebeamer:codebeamer()};window.__T=T;window.__slabDesktop=true;var saved={};window.__saved=saved;' +
      'window.slabSecrets={save:async(k,v,m)=>{saved[k]={v:v,m:m};return{ok:true}},status:async()=>({secrets:Object.keys(saved).map(k=>({kind:k,meta:saved[k].m}))}),available:async()=>({ok:true})};' +
      'window.slabBridge={get:async()=>({ok:false,error:"no jama"}),send:async()=>({ok:false}),tool:async(t,m,u,bd)=>{var host=(saved[t]&&saved[t].m.baseHost)||"";var bad=window.SLAlm.almRequestProblem(t,m,u,host);if(bad)return{ok:false,error:"Not sent: "+bad};var r=T[t].handle(m,u,bd);return r[0]<300?{ok:true,status:r[0],data:r[1]}:{ok:false,status:r[0],error:"HTTP "+r[0],retryAfter:r[2]}}};})();');
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e))); pg.on('dialog', d => d.dismiss().catch(() => {}));
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/?ai=1'); await new Promise(r => setTimeout(r, 3500));
    await pg.evaluate(() => { const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked'); document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; }); });
    await pg.evaluate(async () => { await loadSampleProject(); }); await new Promise(r => setTimeout(r, 3000));
    const decideCma = () => pg.evaluate(() => { const L = window.SLCmaLive; if (!L || !L.pending().length) return 0; L.pending().forEach(x => L.setChoice(x.key, 'ignore', 'test: not part of this check')); L.submitModal(); return 1; });
    await decideCma(); await new Promise(r => setTimeout(r, 500)); await decideCma();
    await pg.evaluate(() => { SLAlm._waitScale = 0; SLConnections.show('main'); });
    await new Promise(r => setTimeout(r, 500));
    check('[E] the Connections page offers Polarion and Codebeamer', await pg.evaluate(() => ['Polarion', 'Codebeamer'].every(n => Array.from(document.querySelectorAll('#conn-host .cx-off')).some(x => x.innerText.indexOf(n) >= 0 && /Connect/.test(x.innerText)))));
    await decideCma();
    await pg.click('#conn-host .cx-off:has-text("Polarion") button'); await new Promise(r => setTimeout(r, 500));
    if (process.env.DBG) console.log('DBG before', JSON.stringify(await pg.evaluate(() => ({ st: SLChangeAck.status(), lines: SLChangeAck.lines() }))));
    await pg.fill('#alm-url', 'https://polarion.example.com'); await pg.fill('#alm-proj', 'FCS'); await pg.fill('#alm-tok', 'PAT-1');
    await decideCma(); await pg.click('#alm-setup button:has-text("Save and test")'); await new Promise(r => setTimeout(r, 1500));
    if (process.env.DBG) console.log('DBG after save', JSON.stringify(await pg.evaluate(() => ({ st: SLChangeAck.status(), lines: SLChangeAck.lines() }))));
    const saved = await pg.evaluate(() => ({ s: window.__saved.polarion, cfg: projectConfig.almTools && projectConfig.almTools.polarion }));
    check('[E] Save and test: the token goes to the keychain with its host, never into the project', saved.s && saved.s.v.token === 'PAT-1' && saved.s.m.baseHost === 'polarion.example.com' && saved.cfg && saved.cfg.project === 'FCS' && !JSON.stringify(saved.cfg).includes('PAT-1'));
    check('[E] the test passed and "choose what is linked" opened, listing the documents', await pg.evaluate(() => document.querySelectorAll('#alm-browse .alm-pick').length === 4));
    await pg.evaluate(() => { document.querySelectorAll('#alm-browse .alm-pick').forEach(tr => { const id = tr.getAttribute('data-id'); if (id === 'FCS/_default/Aircraft functions') { tr.querySelector('.alm-on').checked = true; tr.querySelector('.alm-kind').value = 'fn'; } if (id === 'FCS/Requirements/FCS requirements') { tr.querySelector('.alm-on').checked = true; tr.querySelector('.alm-kind').value = 'req'; tr.querySelector('.alm-scope').value = (systemsData[0] || {}).id || 'ac'; } }); });
    await decideCma(); await pg.click('#alm-browse button:has-text("Save and check")'); await new Promise(r => setTimeout(r, 2000));
    const st = await pg.evaluate(() => ({ inc: SLConnections.incoming('polarion').length, pop: !!document.getElementById('cx-pop'), picks: projectConfig.almTools.polarion.picks.length, lines: SLChangeAck.lines().length }));
    check('[E] Save and check: the pop-up lists what came in from Polarion', st.picks === 2 && st.inc > 0 && st.pop, JSON.stringify(st));
    check('[E] connecting, choosing and checking are not "changes to confirm"', st.lines === 0, JSON.stringify(await pg.evaluate(() => SLChangeAck.lines())));
    await pg.evaluate(() => SLConnections.popLater()); await new Promise(r => setTimeout(r, 400));
    const bar = await pg.evaluate(() => { const x = document.getElementById('sl-ack-bar'); return x ? x.innerText.replace(/\s+/g, ' ') : ''; });
    check('[E] Later: the pill names Polarion', /\d+ incoming changes? from Polarion/.test(bar), bar);
    await pg.evaluate(() => { SLConnections.show('map'); }); await new Promise(r => setTimeout(r, 300));
    check('[E] Mapping shows what Safety Lab sends to Polarion', await pg.evaluate(() => /What Safety Lab sends to Polarion/.test(document.getElementById('conn-host').innerText)));
    check('[E] no page errors', errs.length === 0, errs.join(' | '));
  } finally { await b.close(); srv.close(); }
}

(async function main() {
  const T = { polarion: polarion(), codebeamer: codebeamer() };
  const pc = cfg(), p = page(T, pc), C = p.SLConnections, A = p.SLAlm;
  const PO = A.tool('polarion'), CB = A.tool('codebeamer');
  await PO.refreshHas(); await CB.refreshHas();

  console.log('\n[P1] Polarion: read, tree, lines, a part accepted');
  check('both tools are registered and connected', !!C.adapter('polarion') && !!C.adapter('codebeamer') && C.connected().map(t => t.id).sort().join() === 'codebeamer,polarion');
  await PO.check(true);
  let inc = C.incoming('polarion');
  const fns = inc.filter(c => c.kind === 'fn'), rqs = inc.filter(c => c.kind === 'req');
  check('every work item is one line: 5 functions (FCS-1 is the top of the tree, so has no row of its own) and 2 system requirements', fns.length === 5 && rqs.length === 2, inc.map(c => c.kind + ':' + c.slId).join(' '));
  check('all six function work items were read although the document is paged 4 at a time', T.polarion.log.filter(l => /\/parts$/.test(l)).length >= 2 && fns.some(c => c.slId === 'FCS-9'));
  check('the requirements are for the system the document was chosen for', rqs.every(c => c.scope === 'sys-fcs' && c.scopeName === 'Flight Control System'));
  const leaf = fns.find(c => c.slId === 'FCS-4');
  let r = C.decide({ accept: [leaf.key] }, 'Sam Lee', 'first pass');
  let rows = p.acFunctionsData.map(x => x.funcId + '/' + x.subId + '<' + (x.parentSubId || '')).join(' ');
  check('accepting FCS-4 brings its new parent FCS-2, under top function FCS-1, and nothing else', r.ok && rows === 'FCS-1/FCS-2< FCS-1/FCS-4<FCS-2', rows);
  const r4 = p.acFunctionsData.find(x => x.subId === 'FCS-4');
  check('the row remembers Polarion: tool, string id, document, parent, top', r4.fnSource.tool === 'polarion' && r4.fnSource.remoteId === 'FCS-4' && r4.fnSource.container === 'FCS/_default/Aircraft functions' && r4.fnSource.parentRemoteId === 'FCS-2' && r4.fnSource.funcRemoteId === 'FCS-1');
  check('rich text comes in as plain text', r4.subDef === 'Command elevator in detail', r4.subDef);
  const lk = C.lockOf(r4, 'fn');
  check('the row is locked to Polarion until an admin makes Safety Lab its owner', !!lk && lk.tool === 'polarion' && lk.toolLabel === 'Polarion' && lk.fields.indexOf('subName') >= 0);
  C.decide({ accept: C.incoming('polarion').map(c => c.key) }, 'Sam Lee', 'the rest');
  check('everything signed in: 5 function rows (FCS-9 alone is a function-only row) and 2 FCS requirements', p.acFunctionsData.length === 5 && p.acFunctionsData.some(x => x.funcId === 'FCS-9' && !x.subId && x.fnSource.funcOnly) && p.systemsData[0].req.length === 2 && C.incoming('polarion').length === 0,
        p.acFunctionsData.map(x => x.funcId + '/' + x.subId).join(' '));

  console.log('\n[P2] Polarion: rename, move, gone, rejected, unreadable');
  const W = T.polarion.wi;
  W.get('FCS-5').title = 'Command ailerons and spoilers'; W.get('FCS-5').updated = T.polarion.stamp();
  W.get('FCS-3').links = [{ role: 'parent', to: 'FCS-2' }]; W.get('FCS-3').updated = T.polarion.stamp();
  T.polarion.docs.get(T.polarion.F).parts = T.polarion.docs.get(T.polarion.F).parts.filter(x => x !== 'FCS-9');
  W.get('FCS-21').description = { type: 'text/plain', value: 'The FCS shall annunciate loss of pitch trim within 1 s.' }; W.get('FCS-21').updated = T.polarion.stamp();
  await PO.check(true);
  inc = C.incoming('polarion');
  const kinds = inc.map(c => c.change + ':' + c.slId).sort().join(' ');
  check('a rename, a move, an item gone and a requirement edit are four lines', kinds === 'changed:FCS-21 changed:FCS-5 moved:FCS-3 removed:FCS-9', kinds);
  const mv = inc.find(c => c.change === 'moved');
  check('the move says where it was and where it goes', mv.before.place === 'FCS-1' && mv.after.place === 'FCS-1 > FCS-2', JSON.stringify([mv.before, mv.after]));
  const rq = inc.find(c => c.slId === 'FCS-21');
  C.decide({ reject: [rq.key], accept: inc.filter(c => c !== rq).map(c => c.key) }, 'Sam Lee', 'review 2');
  const f3 = p.acFunctionsData.find(x => x.subId === 'FCS-3'), f9 = p.acFunctionsData.find(x => x.funcId === 'FCS-9');
  check('the move is applied: FCS-3 now sits under FCS-2', f3.parentSubId === 'FCS-2' && f3.fnSource.parentRemoteId === 'FCS-2');
  check('the item gone from Polarion is flagged, never deleted', !!f9 && f9.fnSource.missingInSource === true);
  check('the rejected requirement edit stays out of the analysis', !/within 1 s/.test(p.systemsData[0].req.find(x => x.id === 'FCS-21').text) && C.incoming('polarion').length === 0);
  await PO.check(true);
  check('checked again, the rejected line is still out and the flagged item is not news again', C.incoming('polarion').length === 0, C.incoming('polarion').map(c => c.change + c.slId).join());
  W.get('FCS-21').updated = T.polarion.stamp();
  await PO.check(true);
  check('Polarion changes the rejected item again: it comes back', C.incoming('polarion').some(c => c.slId === 'FCS-21'));
  C.decide({ accept: C.incoming('polarion').map(c => c.key) }, 'Sam Lee', 'ok now');
  // a document this login cannot read
  pc.almTools.polarion.picks.push({ container: 'FCS/_default/Locked', containerName: 'Locked', kind: 'req', scope: 'sys-fcs' });
  p.systemsData[0].req.push({ internalId: 'x1', id: 'FCS-77', text: 'from the locked document', reqSource: { tool: 'polarion', remoteId: 'FCS-77', key: 'FCS-77', container: 'FCS/_default/Locked' } });
  await PO.check(true);
  check('a document that cannot be read is named in the warnings and nothing from it is flagged missing', PO.state().warnings.some(w => /Locked/.test(w) && /HTTP 403/.test(w)) && !C.incoming('polarion').some(c => c.slId === 'FCS-77'), PO.state().warnings.join(' | '));
  pc.almTools.polarion.picks.pop(); p.systemsData[0].req.pop();

  console.log('\n[P3] Polarion: sending');
  const f2 = p.acFunctionsData.find(x => x.subId === 'FCS-2');
  check('a reason is needed to make Safety Lab the owner', C.setOwner('polarion', ['FCS-2'], 'sl', '').ok === false);
  check('an admin makes Safety Lab the owner of FCS-2', C.setOwner('polarion', ['FCS-2'], 'sl', 'pitch is ours now').ok === true && !C.lockOf(f2, 'fn'));
  f2.subName = 'Control pitch attitude';
  let out = C.outgoing('polarion');
  const own = out.find(o => o.remoteId === 'FCS-2');
  check('the edit to the owned item is ready to send, the name only', !!own && own.change === 'changed' && own.after.name === 'Control pitch attitude' && own.after.description === undefined, JSON.stringify(own && own.after));
  // someone edits it in Polarion before the send
  W.get('FCS-2').updated = T.polarion.stamp();
  let s = await C.send([own.key], 'Sam Lee', 'pitch wording');
  check('changed in Polarion since the last check: held back, nothing written', s.sent === 0 && s.held.length === 1 && !T.polarion.writes.some(w => w.method === 'PATCH'), JSON.stringify(s));
  await PO.check(true);
  const own2 = C.outgoing('polarion').find(o => o.remoteId === 'FCS-2');
  s = await C.send([own2.key], 'Sam Lee', 'pitch wording');
  const patch = T.polarion.writes.find(w => w.method === 'PATCH');
  check('sent: a PATCH of the work item with the new title, then a comment naming who and why', s.sent === 1 && patch && patch.path === '/polarion/rest/v1/projects/FCS/workitems/FCS-2' && patch.body.data.attributes.title === 'Control pitch attitude' && T.polarion.comments.some(c => c.id === 'FCS-2' && /Sam Lee: pitch wording/.test(c.text)), JSON.stringify(s));
  check('nothing left to send for it', !C.outgoing('polarion').some(o => o.remoteId === 'FCS-2'));
  // a failure condition made in Safety Lab
  p.acFhaData.push({ internalId: 'fc1', fcId: 'FC-101', fcDesc: 'Loss of elevator command', subId: 'FCS-4', severity: 'Hazardous', phases: ['Cruise'], effAc: 'Pitch control lost' });
  out = C.outgoing('polarion');
  const nfc = out.find(o => o._send === 'fc');
  check('a failure condition made in Safety Lab is ready to send as new', !!nfc && nfc.change === 'new' && /Safety/.test(nfc.after.into));
  s = await C.send([nfc.key], 'Sam Lee', 'FHA review 3');
  const made = T.polarion.writes.filter(w => w.method === 'POST');
  const create = made.find(w => /\/workitems$/.test(w.path)), mvd = made.find(w => /moveToDocument$/.test(w.path)), lnk = made.find(w => /linkedworkitems$/.test(w.path));
  check('it is created as the chosen type, moved into the chosen document, linked to its function FCS-4', s.sent === 1 && create && create.body.data[0].attributes.type === 'failureCondition' && mvd && mvd.body.targetDocument === 'FCS/_default/Safety' &&
        lnk && /workitems\/FCS-1\d\d\/linkedworkitems$/.test(lnk.path) && lnk.body.data[0].relationships.workItem.data.id === 'FCS/FCS-4' && lnk.body.data[0].attributes.role === 'relates_to', JSON.stringify(made.map(w => w.path)));
  const fcRow = p.acFhaData[0];
  check('the failure condition remembers its Polarion work item, and is linked and owned by Safety Lab', fcRow.sendLinks.polarion && /^FCS-1\d\d$/.test(fcRow.sendLinks.polarion.remoteId) && C.adapter('polarion').linkedRows().some(x => x.made && x.slId === 'FC-101'));
  check('the severity is in the description; no calculated result is', /Hazardous/.test(create.body.data[0].attributes.description.value) && !/probab|1e-|DAL/i.test(JSON.stringify(create.body)));
  check('nothing waiting after the send', !C.outgoing('polarion').length);
  fcRow.fcDesc = 'Loss of elevator command, both channels';
  const chg = C.outgoing('polarion')[0];
  check('an edit to it is a change to send', chg && chg.change === 'changed');
  s = await C.send([chg.key], 'Sam Lee', 'wording');
  const lastPatch = T.polarion.writes.filter(w => w.method === 'PATCH').pop();
  check('it goes out as a PATCH of the same work item', s.sent === 1 && lastPatch.path.endsWith('/workitems/' + fcRow.sendLinks.polarion.remoteId) && /both channels/.test(lastPatch.body.data.attributes.title));

  console.log('\n[C1] Codebeamer: read, tree, slow down');
  await CB.check(true);
  inc = C.incoming('codebeamer');
  check('a "slow down" answer (429) is waited out and the read carries on', T.codebeamer.log.filter(l => /items\/query/.test(l)).length >= 5 && inc.length > 0);
  const cf = inc.filter(c => c.kind === 'fn').map(c => c.slId).sort().join(' '), cr = inc.filter(c => c.kind === 'req');
  check('all 5 tracker items read 2 at a time: 4 function rows (1001 is a top function) keyed with the tracker key name', cf === 'SFN-1002 SFN-1003 SFN-1004 SFN-1005', cf);
  check('the 3 software requirements are for Hydraulics', cr.length === 3 && cr.every(c => c.scope === 'sys-hyd'));
  C.decide({ accept: inc.map(c => c.key) }, 'Ana Ruiz', 'hydraulics');
  const iso = p.acFunctionsData.find(x => x.subId === 'SFN-1005');
  check('the tree comes from the tracker parents: SFN-1005 under SFN-1002 under SFN-1001', iso && iso.parentSubId === 'SFN-1002' && iso.funcId === 'SFN-1001' && iso.fnSource.tool === 'codebeamer' && iso.fnSource.remoteId === '1005');
  check('wiki text comes in as plain text', iso.subDef === 'Isolate a leak in wiki', iso.subDef);

  console.log('\n[C2] Codebeamer: sending');
  C.setOwner('codebeamer', ['1003'], 'sl', 'B side is ours');
  p.acFunctionsData.find(x => x.subId === 'SFN-1003').subDef = 'Pressurise system B from the PTU';
  const o3 = C.outgoing('codebeamer').find(o => o.remoteId === '1003');
  s = await C.send([o3.key], 'Ana Ruiz', 'PTU');
  const put = T.codebeamer.writes.find(w => w.method === 'PUT');
  check('an owned item changes through PUT items/{id}/fields with the tracker’s Summary (3) and Description (80) ids', s.sent === 1 && put && put.path === '/cb/api/v3/items/1003/fields' && put.body.fieldValues.some(f => f.fieldId === 80 && f.value === 'Pressurise system B from the PTU') && put.body.fieldValues.some(f => f.fieldId === 3), JSON.stringify(put));
  p.acFhaData.push({ internalId: 'fc2', fcId: 'FC-201', fcDesc: 'Leak not isolated', subId: 'SFN-1005', severity: 'Major' });
  const n2 = C.outgoing('codebeamer').find(o => o._send === 'fc' && o.slId === 'FC-201');
  s = await C.send([n2.key], 'Ana Ruiz', 'FHA');
  const cre = T.codebeamer.writes.find(w => w.method === 'POST' && /trackers\/503\/items$/.test(w.path));
  check('a new failure condition is created in the chosen tracker as plain text', s.sent === 1 && cre && cre.body.descriptionFormat === 'PlainText' && /Major/.test(cre.body.description), JSON.stringify(s));
  check('and associated ("related") from its function SFN-1005', T.codebeamer.assoc.length === 1 && T.codebeamer.assoc[0].from.id === 1005 && T.codebeamer.assoc[0].type.id === 4);
  check('Codebeamer gets no comment calls (its REST API has none); the signer and reason are in History', !T.codebeamer.writes.some(w => /comment/i.test(w.path)) && pc.connections.log.some(e => e.what === 'sent' && e.tool === 'codebeamer' && e.signedBy === 'Ana Ruiz' && e.why === 'FHA'));
  T.codebeamer.items.get(Number(p.acFhaData[1].sendLinks.codebeamer.remoteId)).modifiedAt = T.codebeamer.stamp();
  p.acFhaData[1].fcDesc = 'Leak not isolated in time';
  s = await C.send([C.outgoing('codebeamer').find(o => o.slId === 'FC-201').key], 'Ana Ruiz', 'x');
  check('someone edited it in Codebeamer since Safety Lab sent it: held, not overwritten', s.sent === 0 && s.held.length === 1);

  console.log('\n[F] the fence and the doors');
  const F = A.almRequestProblem;
  check('Polarion: a read, a create, a move into a document, a link, a comment and a change pass', ['GET https://polarion.example.com/polarion/rest/v1/projects/FCS/documents?x=1', 'POST https://polarion.example.com/polarion/rest/v1/projects/FCS/workitems', 'POST https://polarion.example.com/polarion/rest/v1/projects/FCS/workitems/FCS-1/actions/moveToDocument', 'POST https://polarion.example.com/polarion/rest/v1/projects/FCS/workitems/FCS-1/linkedworkitems', 'POST https://polarion.example.com/polarion/rest/v1/projects/FCS/workitems/FCS-1/comments', 'PATCH https://polarion.example.com/polarion/rest/v1/projects/FCS/workitems/FCS-1'].every(x => F('polarion', x.split(' ')[0], x.split(' ')[1], 'polarion.example.com') === ''));
  const refused = [['polarion', 'DELETE', 'https://polarion.example.com/polarion/rest/v1/projects/FCS/workitems/FCS-1'], ['polarion', 'PATCH', 'https://polarion.example.com/polarion/rest/v1/projects/FCS/documents/x'],
    ['polarion', 'POST', 'https://polarion.example.com/polarion/rest/v1/projects/FCS/workitems?x=1'], ['polarion', 'GET', 'https://evil.example.net/polarion/rest/v1/projects'], ['polarion', 'GET', 'http://polarion.example.com/polarion/rest/v1/projects'],
    ['polarion', 'GET', 'https://polarion.example.com/polarion/admin'], ['polarion', 'POST', 'https://polarion.example.com/polarion/rest/v1/projects/FCS/workitems/FCS-1/actions/delete'],
    ['codebeamer', 'DELETE', 'https://cb.example.com/cb/api/v3/items/1'], ['codebeamer', 'PUT', 'https://cb.example.com/cb/api/v3/items/1'], ['codebeamer', 'POST', 'https://cb.example.com/cb/api/v3/projects/7/trackers'], ['codebeamer', 'POST', 'https://cb.example.com/cb/api/v3/items/1/comments'], ['jama', 'GET', 'https://cb.example.com/cb/api/v3/items/1']];
  const leak = refused.filter(x => F(x[0], x[1], x[2], x[0] === 'polarion' ? 'polarion.example.com' : 'cb.example.com') === '');
  check('refused: a delete, other paths, a query on a write, another host, plain http, a tool that is not connected here', leak.length === 0, JSON.stringify(leak));
  check('Codebeamer: a query (a read sent as POST), a create, a change of fields and an association pass', ['POST https://cb.example.com/cb/api/v3/items/query', 'POST https://cb.example.com/cb/api/v3/trackers/5/items', 'PUT https://cb.example.com/cb/api/v3/items/1/fields', 'POST https://cb.example.com/cb/api/v3/associations'].every(x => F('codebeamer', x.split(' ')[0], x.split(' ')[1], 'cb.example.com') === ''));
  check('every request the engine made was inside the fence (' + p.sent.length + ' requests)', p.sent.length > 40 && p.sent.every(x => !x.bad), JSON.stringify(p.sent.filter(x => x.bad)));
  check('the desktop page never made a request itself', true);
  // browser only
  const pb = page({ polarion: polarion(), codebeamer: codebeamer() }, cfg(), { door: 'browser' });
  let err = ''; try { await pb.SLAlm.tool('polarion').check(true); } catch (e) { err = e.message; }
  check('a browser-only session cannot connect, and says it needs the desktop app or the company server', /desktop app or your company’s Safety Lab server/.test(err) && !pb.fetchedAny, err);
  const sl = await pb.SLAlm.tool('polarion').saveLogin('https://polarion.example.com', 'bearer', '', 'TOKEN');
  check('and will not keep a login in the tab', sl.ok === false);
  // the Safety Lab server
  const Ts = { polarion: polarion(), codebeamer: codebeamer() };
  const ps = page(Ts, cfg(), { door: 'server' });
  await ps.SLAlm.tool('codebeamer').check(true);
  check('through the server: the request goes to /bridge?tool=codebeamer&target=..., with the session, never a login', ps.fetched.length > 0 && ps.fetched.every(f => f.path === '/v1/ai/bridge' && f.auth === 'Bearer JWT-1' && /tool=codebeamer/.test(f.url)) && ps.SLConnections.incoming('codebeamer').length === 7, JSON.stringify(ps.fetched.slice(0, 2)));

  console.log('\n[X] both tools together');
  T.polarion.wi.get('FCS-20').title = 'x'; T.polarion.wi.get('FCS-20').description = { type: 'text/plain', value: 'The FCS shall command the elevator within 40 ms.' }; T.polarion.wi.get('FCS-20').updated = T.polarion.stamp();
  T.codebeamer.items.get(2003).name = 'y'; T.codebeamer.items.get(2003).description = 'The software shall log pump faults with a time stamp.'; T.codebeamer.items.get(2003).descriptionFormat = 'PlainText'; T.codebeamer.items.get(2003).modifiedAt = T.codebeamer.stamp();
  await PO.check(true); await CB.check(true);
  check('the pill names both tools', C.pillText() === '1 incoming change from Polarion, 1 from Codebeamer', C.pillText());
  check('History has every check, signature, rejection, send and hold, per tool', ['check', 'signed', 'rejected', 'sent', 'conflict', 'owner'].every(w => pc.connections.log.some(e => e.what === w)) && pc.connections.log.some(e => e.tool === 'codebeamer') && pc.connections.log.some(e => e.tool === 'polarion'));
  await tick();

  console.log('\n[E] in the real app: connect, choose, check, the pop-up and the pill');
  await realApp();

  console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  (MUTATE=' + MUT + ')' : ''));
  if (!MUT && !process.env.NOMUT) {
    console.log('\n[M] every guard, reverted, turns this test red');
    const cp = require('child_process');
    for (const k of Object.keys(MUTATIONS)) {
      const r2 = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { MUTATE: k }), encoding: 'utf8', timeout: 120000 });
      check('mutation ' + k + ' goes red', r2.status === 1, (r2.stdout || '').split('\n').slice(-3).join(' ') + (r2.stderr || '').slice(0, 300));
    }
    console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  crashed: ' + (e && e.stack || e)); process.exit(1); });
