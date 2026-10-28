#!/usr/bin/env node
/*
 * Regression: DOORS Next and Cameo (Teamwork Cloud) on the Connections framework, as pilots (alm_engine.js, 28 Oct 2026).
 *
 * Waqas: live two-way links with DOORS Next and Cameo as with Jama, Polarion and Codebeamer. His rulings (28 Oct 2026):
 * Safety Lab writes to Cameo only elements it created itself, never an element his engineers made there, and no admin
 * can make Safety Lab the owner of one; DOORS Next gets no comments (it has no public API for them), the signer and
 * reason live in History. Both are pilots: reading is on, sending switches on once proven on a real server.
 * The real func_tree.js, connections.js and alm_engine.js run against an in-memory DOORS Next shaped from IBM's
 * published 7.0.2 traffic (rootservices, catalog, services.xml, the module structure API, an artifact GET, the
 * creation factory) and an in-memory Teamwork Cloud shaped from Dassault's published OpenAPI document. Pinned:
 *   [D1] DOORS Next: rootservices -> catalog -> the project's services.xml -> its streams; modules listed by an OSLC
 *        query, every page; a module read through the module structure API (DoorsRP-Request-Type: public 2.0, the
 *        stream as vvc.configuration, no OSLC-Core-Version) and each entry through OSLC with the stream as
 *        Configuration-Context; headings are functions in a functions module and looked through elsewhere; the tree
 *        comes from the module's nesting;
 *   [D2] a change, an item taken out of the module, an item that could not be read (nothing flagged missing);
 *   [D3] pilot: nothing is ready to send and Send refuses; switched on for a proof, a new failure condition is created
 *        through the creation factory (title, description, type, folder), placed in the module (structure PUT with
 *        If-Match and a new entry), linked to its function on Safety Lab's own item, and a later edit goes out as a
 *        PUT with If-Match; a stale version (412) is held, never forced;
 *   [C1] Cameo: projects, branch, packages (with their path); activities as a function tree by ownership; SysML
 *        requirements by their stereotype, with their Text and Id tags; documentation from the element's comment;
 *   [C2] owners: no admin can make Safety Lab the owner of a Cameo element; pilot: nothing goes out; switched on for a
 *        proof, only Safety Lab's own new element is created and only it is changed;
 *   [F]  the fence: DOORS Next writes only to the creation factory, its own artifacts (never a module itself) and a
 *        module's structure, with only the project and stream on the address; Cameo writes only one element at a time;
 *        only each tool's own protocol headers pass.
 * MUTATE=<name> reverts one guard; each must turn the test red.
 *
 * Run: node tests/regression_alm_pilots_20261028.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 700) + ')' : '')); } };
const REPO = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');
const MUTATIONS = {
  pilot:     ['site/alm_engine.js', "function sendOn() { return !drv.pilotSend || !!(W.SLAlm && W.SLAlm._proveSend && W.SLAlm._proveSend[tid]); }", 'function sendOn() { return true; }'],
  canown:    ['site/connections.js', "if (owner === 'sl') { var ad0 = _ad[_tid(tool)]; if (ad0 && ad0.canOwn === false) return", "if (false) { var ad0 = _ad[_tid(tool)]; if (ad0 && ad0.canOwn === false) return"],
  headers:   ['site/alm_engine.js', "if (hk.length) return 'the header ' + hk[0] + ' is not sent to this tool';", ''],
  modpath:   ['site/alm_engine.js', "PUT: [/^resources\\/(?!MD_)[\\w-]+$/, /^resources\\/MD_[\\w-]+\\/structure$/]", "PUT: [/^resources\\/[\\w-]+$/, /^resources\\/MD_[\\w-]+\\/structure$/]"],
  partial:   ['site/alm_engine.js', "if (!r.partial) read[g].add(String(p.container));", 'read[g].add(String(p.container));'],
  heading:   ['site/alm_engine.js', "r.items.forEach(function (it) { if (it.heading && p.kind !== 'fn') return;", 'r.items.forEach(function (it) {'],
  structhdr: ['site/alm_engine.js', "HM: function (c, accept) { var h = { 'DoorsRP-Request-Type': 'public 2.0',", "HM: function (c, accept) { var h = { 'OSLC-Core-Version': '2.0',"],
  ifmatch:   ['site/alm_engine.js', "            var w = await req('PUT', url, x, { raw: true, headers: this.H(c, { 'Content-Type': 'application/rdf+xml', 'If-Match': r.etag }) });", "            var w = await req('PUT', url, x, { raw: true, headers: this.H(c, { 'Content-Type': 'application/rdf+xml' }) });"],
  stale:     ['site/alm_engine.js', "if (w.status === 412 || w.status === 409) throw new Error('changed in DOORS Next while Safety Lab was sending; check it, then send again');", ''],
  paging:    ['site/alm_engine.js', "url = next && next !== url ? next : '';", "url = '';"],
  stereo:    ['site/alm_engine.js', "if (!sid) continue;", ''],
};
const MUT = process.env.MUTATE || '';
function src(p) {
  let s = read(p);
  if (MUT) { const m = MUTATIONS[MUT]; if (!m) { console.error('unknown mutation ' + MUT); process.exit(3); } if (m[0] === p) { if (s.indexOf(m[1]) < 0) { console.error('mutation ' + MUT + ' anchor not found'); process.exit(4); } s = s.split(m[1]).join(m[2]); } }
  return s;
}
const lc = h => { const o = {}; Object.keys(h || {}).forEach(k => { o[k.toLowerCase()] = h[k]; }); return o; };
const xesc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ------------------------------------------------------------------ an in-memory DOORS Next (OSLC RM 2.0, module structure API)
function doors() {
  const H = 'https://dng.example.com', R = H + '/rm', PA = R + '/process/project-areas/_PA1', SVC = R + '/oslc_rm/_PA1/services.xml', COMP = R + '/cm/component/_C1';
  const S1 = R + '/cm/stream/_S1', S2 = R + '/cm/stream/_S2';
  let clock = 0, next = 100, etagN = 0;
  const stamp = () => '2026-10-28T13:' + String(10 + (clock++ % 49)).padStart(2, '0') + ':00.000Z';
  const art = new Map();      // url -> { title, desc (xhtml), id, modified, etag, links: [] }
  const add = (key, title, ident) => { const u = R + '/resources/' + key; art.set(u, { title, desc: '<div xmlns="http://www.w3.org/1999/xhtml">' + xesc(title) + ' in <b>detail</b></div>', id: String(ident), modified: '2026-10-20T10:00:00.000Z', etag: '"%220%22&_' + (etagN++) + '"', links: [] }); return u; };
  const modules = new Map();  // module url -> { title, root: [ {art, heading, kids:[]} ], etag }
  const F = R + '/resources/MD_F', Q = R + '/resources/MD_R';
  const t1 = add('TX_1', 'Control flight path', 101), t2 = add('TX_2', 'Control pitch', 102), t4 = add('TX_4', 'Command elevator', 104), t3 = add('TX_3', 'Control roll', 103), t5 = add('TX_5', 'Command ailerons', 105);
  modules.set(F, { title: 'Aircraft functions', etag: '"m1"', root: [{ art: t1, heading: true, kids: [{ art: t2, kids: [{ art: t4, kids: [] }] }, { art: t3, kids: [{ art: t5, kids: [] }] }] }] });
  const h10 = add('TX_10', 'Requirements', 110), r11 = add('TX_11', 'The FCS shall command the elevator within 50 ms.', 111), r12 = add('TX_12', 'The FCS shall annunciate loss of pitch trim.', 112);
  modules.set(Q, { title: 'FCS requirements', etag: '"m2"', root: [{ art: h10, heading: true, kids: [{ art: r11, kids: [] }, { art: r12, kids: [] }] }] });
  for (let i = 0; i < 3; i++) modules.set(R + '/resources/MD_X' + i, { title: 'Other module ' + i, etag: '"x"', root: [] });
  const log = [], writes = [], broken = new Set();
  let structurePuts = 0;
  const NS = 'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:oslc="http://open-services.net/ns/core#" xmlns:oslc_rm="http://open-services.net/ns/rm#" xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#" xmlns:oslc_config="http://open-services.net/ns/config#" xmlns:jazz_rm="http://jazz.net/ns/rm#" xmlns:nav="http://jazz.net/ns/rm/navigation#" xmlns:j.0="http://jazz.net/ns/rm/dng/module#" xmlns:oslc_auto="http://open-services.net/ns/auto#"';
  const rdf = body => '<?xml version="1.0" encoding="UTF-8"?>\n<rdf:RDF ' + NS + '>\n' + body + '\n</rdf:RDF>';
  const artXml = u => { const a = art.get(u); return rdf('<rdf:Description rdf:about="' + u + '?oslc_config.context=' + encodeURIComponent(S1) + '"><dcterms:description rdf:parseType="Literal">' + a.desc + '</dcterms:description><dcterms:identifier rdf:datatype="http://www.w3.org/2001/XMLSchema#string">' + a.id + '</dcterms:identifier><rdf:type rdf:resource="http://jazz.net/ns/rm#Text"/><dcterms:modified rdf:datatype="http://www.w3.org/2001/XMLSchema#dateTime">' + a.modified + '</dcterms:modified><dcterms:title rdf:parseType="Literal">' + xesc(a.title) + '</dcterms:title><rdf:type rdf:resource="http://open-services.net/ns/rm#Requirement"/>' + a.links.map(l => '<j.9:Link xmlns:j.9="http://www.ibm.com/xmlns/rdm/types/" rdf:resource="' + l + '"/>').join('') + '</rdf:Description>'); };
  function flatOf(mu) {
    const m = modules.get(mu), out = [{ uri: mu + '/structure', type: 'dng_module:Binding', component: COMP, isStructureRoot: 'true', isHeading: false, module: mu, boundArtifact: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil', childBindings: [] }];
    let n = 0;
    (function walk(list, parent) { list.forEach(e => { const uri = mu.replace('MD_', 'BI_') + '_' + (n++); parent.childBindings.push(uri); const o = { uri, type: 'dng_module:Binding', component: COMP, isHeading: !!e.heading, module: mu, boundArtifact: e.art, childBindings: [] }; out.push(o); walk(e.kids, o); }); })(m.root, out[0]);
    return out;
  }
  const lit = (body, local) => { const m = new RegExp('<[\\w.-]+:' + local + '\\b[^>]*?(?:/>|>([\\s\\S]*?)</[\\w.-]+:' + local + '>)').exec(body); return m ? (m[1] || '') : null; };
  const res = (body, local) => { const m = new RegExp('<[\\w.-]+:' + local + '\\b[^>]*rdf:resource="([^"]*)"').exec(body); return m ? m[1] : null; };
  function handle(method, url, body, headers) {
    const u = new URL(url), h = lc(headers), p = u.pathname; let m;
    (method === 'GET' ? log : writes).push({ method, path: p + u.search, headers: h, body });
    if (u.host !== 'dng.example.com') return [502, 'wrong host'];
    const oslc = h['oslc-core-version'] === '2.0';
    const ctxOk = !h['configuration-context'] || [S1, S2].indexOf(h['configuration-context']) >= 0;
    if (p === '/rm/rootservices') return [200, rdf('<rdf:Description rdf:about="' + R + '/rootservices"><oslc_rm_10:rmServiceProviders xmlns:oslc_rm_10="http://open-services.net/xmlns/rm/1.0/" rdf:resource="' + R + '/oslc_rm/catalog"/></rdf:Description>')];
    if (p === '/rm/oslc_rm/catalog') return [200, rdf('<oslc:ServiceProviderCatalog rdf:about="' + R + '/oslc_rm/catalog"><oslc:serviceProvider><oslc:ServiceProvider rdf:about="' + SVC + '"><dcterms:title rdf:parseType="Literal">Flight Controls</dcterms:title><oslc:details rdf:resource="' + PA + '"/></oslc:ServiceProvider></oslc:serviceProvider><oslc:serviceProvider><oslc:ServiceProvider rdf:about="' + R + '/oslc_rm/_PA2/services.xml"><dcterms:title rdf:parseType="Literal">Landing Gear</dcterms:title><oslc:details rdf:resource="' + R + '/process/project-areas/_PA2"/></oslc:ServiceProvider></oslc:serviceProvider></oslc:ServiceProviderCatalog>')];
    if (p === '/rm/oslc_rm/_PA1/services.xml') {
      if (!oslc) return [200, rdf('<rdf:Description rdf:about="' + SVC + '"/>')];   // without the OSLC header DOORS Next leaves the capabilities out
      const qb = R + '/views?oslc.query=true&projectURL=' + encodeURIComponent(PA);
      return [200, rdf('<oslc:ServiceProvider rdf:about="' + SVC + '"><oslc:service><oslc:Service><oslc:domain rdf:resource="http://open-services.net/ns/rm#"/>' +
        '<oslc:queryCapability><oslc:QueryCapability><oslc:resourceType rdf:resource="http://jazz.net/ns/rm#View"/><oslc:queryBase rdf:resource="' + R + '/views_oslc/query"/><dcterms:title rdf:parseType="Literal">View Definition Query Capability</dcterms:title></oslc:QueryCapability></oslc:queryCapability>' +
        '<oslc:queryCapability><oslc:QueryCapability><oslc:queryBase rdf:resource="' + xesc(R + '/folders?oslc.where=public_rm:parent=' + encodeURIComponent(PA)) + '"/><dcterms:title rdf:parseType="Literal">Folder Query Capability</dcterms:title></oslc:QueryCapability></oslc:queryCapability>' +
        '<oslc:queryCapability><oslc:QueryCapability><oslc:resourceType rdf:resource="http://open-services.net/ns/rm#RequirementCollection"/><oslc:resourceType rdf:resource="http://open-services.net/ns/rm#Requirement"/><oslc:queryBase rdf:resource="' + xesc(qb) + '"/><dcterms:title rdf:parseType="Literal">Query Capability</dcterms:title></oslc:QueryCapability></oslc:queryCapability>' +
        '<oslc:creationFactory><oslc:CreationFactory><oslc_config:component rdf:resource="' + COMP + '"/><dcterms:title rdf:parseType="Literal">Collection Creation Factory</dcterms:title><oslc:resourceType rdf:resource="http://open-services.net/ns/rm#RequirementCollection"/><oslc:creation rdf:resource="' + xesc(R + '/requirementFactory?projectURL=' + encodeURIComponent(PA)) + '"/></oslc:CreationFactory></oslc:creationFactory>' +
        '<oslc:creationFactory><oslc:CreationFactory><oslc_config:component rdf:resource="' + COMP + '"/><dcterms:title rdf:parseType="Literal">Requirement Creation Factory</dcterms:title><oslc:resourceType rdf:resource="http://open-services.net/ns/rm#Requirement"/><oslc:creation rdf:resource="' + xesc(R + '/requirementFactory?projectURL=' + encodeURIComponent(PA)) + '"/><oslc:resourceShape rdf:resource="' + R + '/types/OT_SYS"/><oslc:resourceShape rdf:resource="' + R + '/types/OT_HEAD"/></oslc:CreationFactory></oslc:creationFactory>' +
        '</oslc:Service></oslc:service></oslc:ServiceProvider>')];
    }
    if (p === '/rm/cm/component/_C1/configurations') return [200, rdf('<rdf:Description rdf:about="' + COMP + '/configurations"><rdfs:member rdf:resource="' + S1 + '"/><rdfs:member rdf:resource="' + S2 + '"/><rdfs:member rdf:resource="' + R + '/cm/baseline/_B1"/></rdf:Description>')];
    if ((m = /^\/rm\/cm\/stream\/(_S\d)$/.exec(p))) return [200, rdf('<oslc_config:Configuration rdf:about="' + R + '/cm/stream/' + m[1] + '"><dcterms:title rdf:parseType="Literal">' + (m[1] === '_S1' ? 'Flight Controls Initial Stream' : 'Flight Controls Variant B') + '</dcterms:title></oslc_config:Configuration>')];
    if (p === '/rm/views') {
      if (!oslc || !ctxOk) return [400, 'missing headers'];
      const where = u.searchParams.get('oslc.where') || '';
      if (where !== 'rdf:type=<http://jazz.net/ns/rm#Module>') return [400, 'unexpected query ' + where];
      const all = Array.from(modules.keys()), pg = Number(u.searchParams.get('page') || 0), size = 2;   // smaller than 200 so paging is exercised
      const slice = all.slice(pg * size, pg * size + size), more = (pg + 1) * size < all.length;
      const nextU = R + '/views?' + u.search.slice(1).replace(/&page=\d+/, '') + '&page=' + (pg + 1);
      return [200, rdf(slice.map(mu => '<rdf:Description rdf:about="' + xesc(url) + '"><rdfs:member><jazz_rm:Module rdf:about="' + mu + '"><dcterms:title rdf:parseType="Literal">' + xesc(modules.get(mu).title) + '</dcterms:title></jazz_rm:Module></rdfs:member></rdf:Description>').join('') +
        '<oslc:ResponseInfo rdf:about="' + xesc(url) + '">' + (more ? '<oslc:nextPage rdf:resource="' + xesc(nextU) + '"/>' : '') + '</oslc:ResponseInfo>')];
    }
    if ((m = /^\/rm\/resources\/(MD_\w+)$/.exec(p)) && method === 'GET') {
      const mu = R + '/resources/' + m[1]; if (!modules.has(mu)) return [404, ''];
      if (h['doorsrp-request-type'] === 'public 2.0') return [200, rdf('<j.0:Module rdf:about="' + mu + '"><j.0:structure rdf:resource="' + mu + '/structure"/></j.0:Module>')];
      return [200, rdf('<rdf:Description rdf:about="' + mu + '"><oslc_rm:uses rdf:resource="' + t1 + '"/></rdf:Description>')];
    }
    if ((m = /^\/rm\/resources\/(MD_\w+)\/structure$/.exec(p))) {
      const mu = R + '/resources/' + m[1], md = modules.get(mu); if (!md) return [404, ''];
      if (h['doorsrp-request-type'] !== 'public 2.0' || h['oslc-core-version'] || h['configuration-context']) return [400, 'the module structure API takes DoorsRP-Request-Type: public 2.0 and vvc.configuration, never the OSLC headers'];
      if (h['vvc.configuration'] && [S1, S2].indexOf(h['vvc.configuration']) < 0) return [400, 'bad configuration'];
      if (method === 'GET') return [200, JSON.stringify(flatOf(mu), null, 1), { etag: md.etag }];
      if (method === 'PUT') {
        if (h['if-match'] !== md.etag) return [412, 'stale'];
        const arr = JSON.parse(body), by = {}; arr.forEach(b => { by[b.uri] = b; });
        const rootB = arr.find(b => b.isStructureRoot === 'true');
        const build = list => list.map(uri => { const b = by[uri]; if (!b) throw new Error('unknown binding ' + uri); if (!/BI_|structure#\d+$/.test(uri)) throw new Error('bad binding uri'); if (b.module !== mu) throw new Error('binding of another module'); return { art: b.boundArtifact, heading: !!b.isHeading, kids: build(b.childBindings || []) }; });
        try { md.root = build(rootB.childBindings); } catch (e) { return [400, e.message]; }
        md.etag = '"m' + (++etagN) + '"'; structurePuts++;
        return [202, '', { location: R + '/taskTracker/t' + structurePuts }];
      }
    }
    if ((m = /^\/rm\/taskTracker\/(t\d+)$/.exec(p))) return [200, rdf('<rdf:Description rdf:about="' + R + '/taskTracker/' + m[1] + '"><oslc_auto:state rdf:resource="http://open-services.net/ns/auto#complete"/><oslc_auto:verdict rdf:resource="http://open-services.net/ns/auto#passed"/></rdf:Description>')];
    if ((m = /^\/rm\/resources\/(TX_\w+)$/.exec(p))) {
      const au = R + '/resources/' + m[1], a = art.get(au); if (!a) return [404, ''];
      if (!oslc || !ctxOk) return [400, 'missing OSLC headers'];
      if (method === 'GET') { if (broken.has(au)) return [500, 'server error']; return [200, artXml(au), { etag: a.etag }]; }
      if (method === 'PUT') {
        if (!h['if-match']) return [400, 'If-Match is required'];
        if (h['if-match'] !== a.etag) return [412, 'stale'];
        const t = lit(body, 'title'), d = lit(body, 'description');
        if (t != null) a.title = t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'); if (d != null) a.desc = d;
        a.links = []; const lr = /<[\w.-]+:Link\b[^>]*rdf:resource="([^"]*)"/g; let lm; while ((lm = lr.exec(body))) a.links.push(lm[1]);
        a.modified = stamp(); a.etag = '"%220%22&_' + (etagN++) + '"';
        return [200, '', { etag: a.etag }];
      }
    }
    if (p === '/rm/requirementFactory' && method === 'POST') {
      if (!oslc || u.searchParams.get('projectURL') !== PA) return [400, 'bad factory request'];
      const key = 'TX_N' + (next++), au = R + '/resources/' + key, t = lit(body, 'title'), d = lit(body, 'description');
      art.set(au, { title: t, desc: d, id: String(5000 + next), modified: stamp(), etag: '"%220%22&_' + (etagN++) + '"', links: [], shape: res(body, 'instanceShape'), folder: res(body, 'parent'), types: body.indexOf('http://open-services.net/ns/rm#Requirement') >= 0 });
      return [201, '', { location: au, etag: art.get(au).etag }];
    }
    return [404, 'no such endpoint ' + p];
  }
  return { art, modules, handle, log, writes, broken, stamp, F, Q, R, S1, S2, t4, t5, r12, structurePuts: () => structurePuts };
}

// ------------------------------------------------------------------ an in-memory Teamwork Cloud (Cameo)
function twc() {
  const B = 'https://twc.example.com/osmc', RES = 'res-0001', BR = 'br-trunk';
  const el = new Map();       // id -> { type, name, owner, owned:[], comments:[], body, modified, stereo, tags }
  let clock = 0;
  const stamp = () => '202610281' + String(10000 + (clock++)).slice(1) + 'GMT';
  const add = (id, type, name, owner, extra) => { el.set(id, Object.assign({ type, name, owner, owned: [], comments: [], body: '', modified: '20261020100000GMT' }, extra || {})); if (owner && el.get(owner)) el.get(owner).owned.push(id); };
  add('m-0001', 'uml:Model', 'Aircraft model', null);
  add('p-fn', 'uml:Package', 'Functions', 'm-0001'); add('p-req', 'uml:Package', 'Requirements', 'm-0001'); add('p-sub', 'uml:Package', 'Hydraulics', 'p-req'); add('p-safety', 'uml:Package', 'Safety Lab', 'm-0001');
  add('a-1', 'uml:Activity', 'Provide hydraulic power', 'p-fn'); add('a-2', 'uml:Activity', 'Pressurise system A', 'a-1'); add('a-3', 'uml:Activity', 'Isolate a leak', 'a-2'); add('a-4', 'uml:Activity', 'Monitor reservoir', 'p-fn');
  add('c-1', 'uml:Comment', '', 'a-2', { body: '<html><body><p>Keeps system A at <b>3000 psi</b>.</p></body></html>' }); el.get('a-2').comments.push('c-1');
  add('r-1', 'uml:Class', 'Leak isolation time', 'p-sub', { stereo: [{ id: 'st-req', name: 'Requirement' }], tags: { Id: 'HYD-1', Text: 'The system shall isolate a leak within 2 s.' } });
  add('r-2', 'uml:Class', 'Reservoir level report', 'p-sub', { stereo: [{ id: 'st-req', name: 'Requirement' }], tags: { Id: 'HYD-2', Text: 'The system shall report reservoir level.' } });
  add('b-1', 'uml:Class', 'Pump', 'p-sub', { stereo: [{ id: 'st-blk', name: 'Block' }] });
  const log = [], writes = [];
  const json = o => o;
  const wire = id => { const e = el.get(id); return [{ '@id': '', '@type': ['ldp:DirectContainer', e.type], 'ldp:contains': e.owned.map(x => ({ '@id': x })) },
    { '@id': '#' + id, '@type': e.type, 'kerml:esiID': id, 'kerml:modifiedTime': e.modified, 'kerml:name': e.name, 'kerml:owner': e.owner ? [{ '@id': e.owner }] : [],
      'kerml:esiData': { name: e.name, owner: e.owner ? [{ '@id': e.owner }] : [], ownedElement: e.owned.map(x => ({ '@id': x })), ownedComment: e.comments.map(x => ({ '@id': x })), body: e.body || undefined } }]; };
  function handle(method, url, body, headers) {
    const u = new URL(url), p = u.pathname; let m;
    (method === 'GET' || (method === 'POST' && /\/elements$/.test(p)) ? log : writes).push({ method, path: p + u.search, body, headers: lc(headers) });
    if (u.host !== 'twc.example.com') return [502, {}];
    if (p === '/osmc/resources') return [200, { '@id': '', '@type': 'ldp:BasicContainer', 'ldp:contains': [{ '@id': RES, ID: RES, 'dcterms:title': 'Aircraft model.MASTER' }, { '@id': 'res-0002', ID: 'res-0002', 'dcterms:title': 'Ground support.MASTER' }] }];
    if (p === '/osmc/resources/' + RES) return [200, [{ '@id': '', 'dcterms:title': 'Aircraft model.MASTER', ID: RES }]];
    if (p === '/osmc/resources/' + RES + '/branches') return [200, { '@type': ['ldp:BasicContainer'], 'ldp:contains': [{ '@id': BR }, { '@id': 'br-exp' }] }];
    if ((m = /^\/osmc\/resources\/res-0001\/branches\/(br-\w+)$/.exec(p))) return [200, [{ '@type': ['ldp:DirectContainer', 'kerml:Branch'], 'ldp:contains': [12, 11] }, { '@type': ['kerml:Branch'], ID: m[1], 'dcterms:title': m[1] === BR ? 'trunk' : 'experiment', latestRevision: m[1] === BR ? 12 : 3 }]];
    if (p === '/osmc/resources/' + RES + '/branches/' + BR + '/revisions/12') return [200, { rootObjectIDs: ['m-0001'], author: 'admin' }];
    if (p === '/osmc/resources/' + RES + '/branches/' + BR + '/elements' && method === 'POST') { const out = {}; (body || []).forEach(id => { if (el.has(id)) out[id] = wire(id); }); return [200, out]; }
    if ((m = /^\/osmc\/resources\/res-0001\/branches\/br-trunk\/elements\/([\w-]+)\/stereotypes$/.exec(p))) { const e = el.get(m[1]); return [200, [{ '@type': 'ldp:DirectContainer', 'ldp:membershipResource': '#stereotypes' }, { '@id': '#stereotypes', '@type': 'uml:Stereotypes', 'uml:stereotypes': (e && e.stereo || []).map(s => ({ 'uml:stereotypeId': s.id, 'uml:stereotypeName': s.name })) }]]; }
    if ((m = /^\/osmc\/resources\/res-0001\/branches\/br-trunk\/elements\/([\w-]+)\/stereotypes\/st-req\/tags$/.exec(p))) { const e = el.get(m[1]); return [200, [{ '@type': 'ldp:DirectContainer' }, { '@id': '#tags', '@type': 'uml:Tags', 'uml:values': Object.keys((e && e.tags) || {}).map(k => ({ 'uml:tagName': k, 'uml:tagValue': e.tags[k] })) }]]; }
    if ((m = /^\/osmc\/resources\/res-0001\/branches\/br-trunk\/elements\/([\w-]+)$/.exec(p))) {
      if (method === 'POST') { if (el.has(m[1])) return [409, {}]; const d = body['kerml:esiData'] || {}; add(m[1], body['@type'], d.name, (d.owningPackage || {})['@id']); el.get(m[1]).modified = stamp(); return [201, {}]; }
      if (method === 'PATCH') { const e = el.get(m[1]); if (!e) return [404, {}]; const d = body['kerml:esiData'] || {}; if (d.name != null) e.name = d.name; if (d.body != null) e.body = d.body; e.modified = stamp(); return [200, wire(m[1])]; }
    }
    return [404, { message: 'no such endpoint ' + p }];
  }
  return { el, handle, log, writes, stamp };
}

// ------------------------------------------------------------------ the page (desktop door)
function page(T, pc) {
  const els = {};
  const document = { readyState: 'complete', body: { appendChild(e) { if (e && e.id) els[e.id] = e; } }, head: { appendChild() {} }, documentElement: { appendChild() {} },
    getElementById: id => els[id] || null, addEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
    createElement: () => ({ innerHTML: '', style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, querySelector: () => null, addEventListener() {}, remove() { delete els[this.id]; } }) };
  const sent = [];
  const ctx = { console, URL, setTimeout, clearTimeout, setInterval: () => 1, clearInterval: () => {}, navigator: { userAgent: 'test' }, encodeURIComponent, decodeURIComponent,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, document, Blob: function () {}, crypto: { randomUUID: () => 'sl-new-' + Math.random().toString(16).slice(2, 10) },
    acFunctionsData: [], acReqData: [], acAssumptionsData: [], acFcimData: [], acFhaData: [], acExtractedFCs: [], ftaPages: [],
    systemsData: [{ id: 'sys-fcs', name: 'Flight Control System', functions: [], req: [], asm: [] }, { id: 'sys-hyd', name: 'Hydraulics', functions: [], req: [], asm: [] }],
    projectConfig: pc, newRowId: (() => { let n = 0; return () => 'r' + (++n); })(), showToast: () => {}, scheduleAutosave: () => {}, getActiveWorkspace: () => null, sent };
  const HOST = { doors: 'dng.example.com', cameo: 'twc.example.com' };
  ctx.slabSecrets = { save: async () => ({ ok: true }), status: async () => ({ secrets: [{ kind: 'doors' }, { kind: 'cameo' }] }) };
  ctx.slabBridge = { toolOpts: true, get: async () => ({ ok: false }), send: async () => ({ ok: false }), tool: async (tool, m, u, b, o) => {
    o = o || {};
    const bad = ctx.SLAlm.almRequestProblem(tool, m, u, HOST[tool], o.headers);
    sent.push({ tool, method: m, url: u, bad, headers: o.headers });
    if (bad) return { ok: false, error: 'Not sent: ' + bad };
    const r = T[tool].handle(m, u, b, o.headers || {});
    if (o.raw) return { ok: true, raw: true, status: r[0], text: typeof r[1] === 'string' ? r[1] : JSON.stringify(r[1]), etag: (r[2] || {}).etag || '', location: (r[2] || {}).location || '' };
    if (r[0] >= 200 && r[0] < 300) return { ok: true, status: r[0], data: r[1] };
    return { ok: false, status: r[0], error: 'HTTP ' + r[0] };
  } };
  ctx.fetch = async () => { throw new Error('the desktop page made a network request'); };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.jrnl = () => {};
  vm.createContext(ctx);
  for (const f of ['site/func_tree.js', 'site/connections.js', 'site/alm_engine.js']) vm.runInContext(src(f), ctx, { filename: f });
  ctx.SLAlm._waitScale = 0;
  return ctx;
}
const cfg = () => ({ almTools: {
  doors: { baseUrl: 'https://dng.example.com/rm', project: 'Flight Controls', auth: 'password', user: 'sam', stream: 'https://dng.example.com/rm/cm/stream/_S1',
    picks: [{ container: 'https://dng.example.com/rm/resources/MD_F', containerName: 'Aircraft functions', kind: 'fn', scope: 'ac' }, { container: 'https://dng.example.com/rm/resources/MD_R', containerName: 'FCS requirements', kind: 'req', scope: 'sys-fcs' }],
    send: { fc: { on: true, container: 'https://dng.example.com/rm/resources/MD_R', containerName: 'FCS requirements', type: 'https://dng.example.com/rm/types/OT_SYS', folder: 'https://dng.example.com/rm/folders/FR_SAFETY' } } },
  cameo: { baseUrl: 'https://twc.example.com', project: 'res-0001', auth: 'basic', user: 'sam',
    picks: [{ container: 'p-fn', containerName: 'Functions', kind: 'fn', scope: 'ac' }, { container: 'p-req', containerName: 'Requirements', kind: 'req', scope: 'sys-hyd' }],
    send: { fc: { on: true, container: 'p-safety', containerName: 'Safety Lab' } } } } });

(async function main() {
  const T = { doors: doors(), cameo: twc() };
  const pc = cfg(), p = page(T, pc), C = p.SLConnections, A = p.SLAlm, D = A.tool('doors'), K = A.tool('cameo');
  await D.refreshHas(); await K.refreshHas();

  console.log('\n[D1] DOORS Next: discovery, modules, structure, tree');
  const c0 = D.cfg();
  const prj = await D.driver.projects(c0, D.req);
  check('rootservices -> catalog: the project areas this login can open', prj.map(x => x.name).join() === 'Flight Controls,Landing Gear', JSON.stringify(prj));
  const sts = await D.driver.streams(Object.assign({}, c0), D.req);
  check('the project\u2019s streams, by name (baselines left out)', sts.map(x => x.name).join() === 'Flight Controls Initial Stream,Flight Controls Variant B', JSON.stringify(sts));
  const mods = await D.driver.listContainers(Object.assign({}, c0), D.req);
  check('all 5 modules listed by an OSLC query, followed across 3 pages', mods.length === 5 && mods[0].name === 'Aircraft functions' && T.doors.log.filter(l => l.path.indexOf('/rm/views') === 0).length === 3, JSON.stringify(mods.map(m => m.name)));
  T.doors.log.length = 0;
  await D.check(true);
  const stLog = T.doors.log.filter(l => /\/structure$/.test(l.path));
  check('module structure read with DoorsRP-Request-Type: public 2.0 and the stream as vvc.configuration, no OSLC header', stLog.length === 2 && stLog.every(l => l.headers['doorsrp-request-type'] === 'public 2.0' && l.headers['vvc.configuration'] === T.doors.S1 && !l.headers['oslc-core-version']), JSON.stringify(stLog.map(l => l.headers)));
  const artLog = T.doors.log.filter(l => /\/resources\/TX_/.test(l.path));
  check('each entry read through OSLC with the stream as Configuration-Context', artLog.length === 8 && artLog.every(l => l.headers['oslc-core-version'] === '2.0' && l.headers['configuration-context'] === T.doors.S1));
  let inc = C.incoming('doors');
  const fns = inc.filter(c => c.kind === 'fn').map(c => c.slId).sort().join(' '), rqs = inc.filter(c => c.kind === 'req').map(c => c.slId).sort().join(' ');
  check('functions: the heading is the top function, the 4 under it are lines', fns === '102 103 104 105', fns);
  check('requirements: the heading is looked through; the 2 requirements are lines, for the system', rqs === '111 112' && inc.filter(c => c.kind === 'req').every(c => c.scope === 'sys-fcs'), rqs);
  C.decide({ accept: inc.map(c => c.key) }, 'Sam Lee', 'first pass');
  const f104 = p.acFunctionsData.find(x => x.subId === '104');
  check('the tree comes from the module\u2019s nesting: 104 under 102 under top function 101', f104 && f104.parentSubId === '102' && f104.funcId === '101' && f104.fnSource.tool === 'doors' && f104.fnSource.remoteId === T.doors.t4, JSON.stringify(f104 && f104.fnSource));
  check('rich text comes in as plain text', f104.subDef === 'Command elevator in detail', f104.subDef);
  check('the rows are locked to DOORS Next', !!C.lockOf(f104, 'fn') && C.lockOf(f104, 'fn').toolLabel === 'DOORS Next');

  console.log('\n[D2] DOORS Next: a change, an item taken out, an item that cannot be read');
  T.doors.art.get(T.doors.t4).title = 'Command elevator and stabilizer'; T.doors.art.get(T.doors.t4).modified = T.doors.stamp();
  const mR = T.doors.modules.get(T.doors.Q); mR.root[0].kids = mR.root[0].kids.filter(e => e.art !== T.doors.r12);
  await D.check(true);
  inc = C.incoming('doors');
  check('the rename and the requirement taken out of the module are two lines', inc.map(c => c.change + ':' + c.slId).sort().join(' ') === 'changed:104 removed:112', inc.map(c => c.change + ':' + c.slId).join(' '));
  C.decide({ accept: inc.map(c => c.key) }, 'Sam Lee', 'second pass');
  check('taken out of the module: flagged, never deleted', p.systemsData[0].req.find(x => x.id === '112').reqSource.missingInSource === true);
  T.doors.broken.add(T.doors.t5);   // still in the module, but its read fails
  await D.check(true);
  check('a module with an entry that could not be read: named in the warnings, and nothing from it flagged missing', D.state().warnings.some(w => /could not be read/.test(w)) && !C.incoming('doors').some(c => c.change === 'removed'), D.state().warnings.join(' | '));
  T.doors.broken.clear();

  console.log('\n[D3] DOORS Next: pilot, then a proof');
  p.acFhaData.push({ internalId: 'fc1', fcId: 'FC-101', fcDesc: 'Loss of elevator command', subId: '104', severity: 'Hazardous', phases: ['Cruise'] });
  check('pilot: nothing is ready to send to DOORS Next', C.outgoing('doors').length === 0);
  check('pilot: Mapping says sending switches on once proven on a real server', /Pilot: reading from DOORS Next is on/.test(D.sendSettingsHtml()));
  const before = T.doors.writes.length;
  let s = await D.send([{ key: 'x', _send: 'fc', _row: p.acFhaData[0], _fields: { name: 'x', text: 'x', html: 'x' } }], 'Sam Lee', 'try');
  check('pilot: Send refuses, nothing written', s.ok === false && /not switched on yet/.test(s.err) && T.doors.writes.length === before);
  A._proveSend = { doors: true };
  const nfc = C.outgoing('doors').find(o => o._send === 'fc');
  s = await C.send([nfc.key], 'Sam Lee', 'FHA review 3');
  const post = T.doors.writes.find(w => w.method === 'POST'), sput = T.doors.writes.find(w => w.method === 'PUT' && /structure$/.test(w.path));
  check('proof: created through the creation factory with its title, description, type and folder', s.sent === 1 && post && /requirementFactory\?projectURL=/.test(post.path) && /FC-101 Loss of elevator command/.test(post.body) && /Hazardous/.test(post.body) && /types\/OT_SYS/.test(post.body) && /folders\/FR_SAFETY/.test(post.body), JSON.stringify(s));
  const newU = p.acFhaData[0].sendLinks && p.acFhaData[0].sendLinks.doors && p.acFhaData[0].sendLinks.doors.remoteId;
  check('placed in the module: the structure PUT carries If-Match and the new entry, and the module now holds it', !!sput && sput.headers['if-match'] && T.doors.modules.get(T.doors.Q).root.some(e => e.art === newU), JSON.stringify(sput && sput.headers));
  check('linked to its function on Safety Lab\u2019s own item (never by changing the function)', T.doors.art.get(newU).links[0] === T.doors.t4 && !T.doors.writes.some(w => w.method === 'PUT' && w.path.indexOf('TX_4') >= 0));
  check('no comment call (DOORS Next has none); the signer and reason are in History', pc.connections.log.some(e => e.what === 'sent' && e.tool === 'doors' && e.why === 'FHA review 3'));
  p.acFhaData[0].fcDesc = 'Loss of elevator command, both channels';
  let ch = C.outgoing('doors').find(o => o._send === 'fc');
  s = await C.send([ch.key], 'Sam Lee', 'wording');
  const put2 = T.doors.writes.filter(w => w.method === 'PUT' && w.path.indexOf('TX_N') >= 0).pop();
  check('an edit goes out as a PUT of the same item with If-Match', s.sent === 1 && put2.headers['if-match'] && /both channels/.test(T.doors.art.get(newU).title), JSON.stringify(s));
  // someone changes it in DOORS Next between Safety Lab's read and its write: the PUT is answered 412
  p.acFhaData[0].fcDesc = 'Loss of elevator command, both channels, in cruise';
  ch = C.outgoing('doors').find(o => o._send === 'fc');
  const realHandle = T.doors.handle;
  T.doors.handle = (m, u, b, h) => { if (m === 'PUT' && u.indexOf('TX_N') >= 0) { T.doors.art.get(newU).etag = '"someone-else"'; } return realHandle(m, u, b, h); };
  s = await C.send([ch.key], 'Sam Lee', 'race');
  T.doors.handle = realHandle;
  check('a stale version (412) is not forced: the send fails and says why', s.sent === 0 && s.failed.some(f => /changed in DOORS Next while Safety Lab was sending/.test(f)) && !/in cruise/.test(T.doors.art.get(newU).title), JSON.stringify(s));
  A._proveSend = null;

  console.log('\n[C1] Cameo: projects, branch, packages, functions, requirements');
  const kc = K.cfg();
  const kp = await K.driver.projects(Object.assign({}, kc), K.req);
  check('projects listed (the .MASTER suffix dropped)', kp.map(x => x.name).join() === 'Aircraft model,Ground support', JSON.stringify(kp));
  const kb = await K.driver.branches(Object.assign({}, kc), K.req);
  check('branches listed by name', kb.map(b => b.name).join() === 'trunk,experiment');
  const pk = await K.driver.listContainers(Object.assign({}, kc), K.req);
  check('packages listed with where they sit', pk.map(x => x.name + '@' + x.where).join() === 'Functions@Aircraft model,Requirements@Aircraft model,Safety Lab@Aircraft model,Hydraulics@Aircraft model / Requirements', JSON.stringify(pk));
  await K.check(true);
  inc = C.incoming('cameo');
  const kf = inc.filter(c => c.kind === 'fn').map(c => c.name).sort().join(' | '), kr = inc.filter(c => c.kind === 'req');
  check('activities as functions: the 3 under the top function and the second top function', kf === 'Isolate a leak | Monitor reservoir | Pressurise system A', kf);
  check('requirements: only the two SysML requirements (not the block), keyed by their Id, for Hydraulics', kr.map(c => c.slId).sort().join() === 'HYD-1,HYD-2' && kr.every(c => c.scope === 'sys-hyd'), JSON.stringify(kr.map(c => c.slId)));
  C.decide({ accept: inc.map(c => c.key) }, 'Ana Ruiz', 'hydraulics');
  const a3 = p.acFunctionsData.find(x => x.subName === 'Isolate a leak'), a2 = p.acFunctionsData.find(x => x.subName === 'Pressurise system A');
  check('the tree comes from ownership: Isolate a leak under Pressurise system A under Provide hydraulic power', a3 && a2 && a3.parentSubId === a2.subId && a3.funcName === 'Provide hydraulic power' && a3.fnSource.tool === 'cameo');
  check('documentation comes from the element\u2019s comment, as plain text', a2.subDef === 'Keeps system A at 3000 psi.', a2.subDef);
  check('a requirement\u2019s text comes from its Text tag', p.systemsData[1].req.find(x => x.id === 'HYD-1').text === 'The system shall isolate a leak within 2 s.');

  console.log('\n[C2] Cameo: never Safety Lab\u2019s to change; pilot, then a proof');
  const own = C.setOwner('cameo', [a2.fnSource.remoteId], 'sl', 'we want to edit it');
  check('no admin can make Safety Lab the owner of an element made in Cameo', own.ok === false && /never changes what your engineers made/.test(own.err), JSON.stringify(own));
  check('Mapping offers no owner buttons for Cameo', /Cameo owns everything linked from it/.test((function () { let h = ''; const host = { innerHTML: '' }; p.document.getElementById = id => id === 'view-conn' ? { style: { display: 'block' } } : (id === 'conn-host' ? host : null); C.show('map'); h = host.innerHTML; return h; })()));
  check('pilot: nothing ready to send to Cameo', C.outgoing('cameo').length === 0);
  A._proveSend = { cameo: true };
  const kfc = C.outgoing('cameo').filter(o => o._send === 'fc');
  check('proof: only Safety Lab\u2019s own failure condition is ready to send', kfc.length === 1 && C.outgoing('cameo').length === 1);
  const w0 = T.cameo.writes.length;
  s = await C.send([kfc[0].key], 'Ana Ruiz', 'FHA');
  const kw = T.cameo.writes.slice(w0);
  check('proof: one new element is created in the chosen package, and nothing else is written', s.sent === 1 && kw.length === 1 && kw[0].method === 'POST' && kw[0].body['kerml:esiData'].owningPackage['@id'] === 'p-safety' && T.cameo.el.get('p-safety').owned.length === 1, JSON.stringify(kw.map(w => w.method + ' ' + w.path)));
  A._proveSend = null;

  console.log('\n[F] the fence');
  const F = A.almRequestProblem, DN = 'https://dng.example.com/rm', TW = 'https://twc.example.com/osmc/resources/r1/branches/b1';
  const ok = [['doors', 'POST', DN + '/requirementFactory?projectURL=x&oslc_config.context=y', { 'OSLC-Core-Version': '2.0', 'Content-Type': 'application/rdf+xml' }], ['doors', 'PUT', DN + '/resources/TX_9', { 'If-Match': '"1"' }],
    ['doors', 'PUT', DN + '/resources/MD_F/structure', { 'DoorsRP-Request-Type': 'public 2.0', 'vvc.configuration': 'x' }], ['doors', 'GET', DN + '/views?oslc.query=true', { 'Configuration-Context': 'x' }],
    ['cameo', 'POST', TW + '/elements', { 'Content-Type': 'application/json' }], ['cameo', 'POST', TW + '/elements/new-1', {}], ['cameo', 'PATCH', TW + '/elements/e-1', {}]];
  check('allowed: the creation factory, an artifact, a module\u2019s structure, a query; Cameo\u2019s batch read, one create, one change', ok.every(x => F(x[0], x[1], x[2], new URL(x[2]).hostname, x[3]) === ''), JSON.stringify(ok.map(x => F(x[0], x[1], x[2], new URL(x[2]).hostname, x[3]))));
  const no = [['doors', 'PUT', DN + '/resources/MD_F', {}], ['doors', 'DELETE', DN + '/resources/TX_9', {}], ['doors', 'POST', DN + '/requirementFactory?projectURL=x&evil=1', {}], ['doors', 'POST', DN + '/collectionFactory', {}],
    ['doors', 'GET', DN + '/views', { Cookie: 'JSESSIONID=x' }], ['doors', 'GET', DN + '/views', { Authorization: 'Basic x' }], ['doors', 'GET', 'https://dng.example.com/jts/users', {}],
    ['cameo', 'DELETE', TW + '/elements/e-1', {}], ['cameo', 'PATCH', TW + '/elements', {}], ['cameo', 'PUT', TW + '/elements/e-1', {}], ['cameo', 'POST', 'https://twc.example.com/osmc/workspaces', {}], ['cameo', 'GET', TW + '/elements/e', { 'X-Other': '1' }]];
  const leak = no.filter(x => F(x[0], x[1], x[2], new URL(x[2]).hostname, x[3]) === '');
  check('refused: changing a module itself, a delete, another factory, extra address terms, a cookie or login header from the page, other Jazz apps; a Cameo delete, batch change, replace, a new workspace', leak.length === 0, JSON.stringify(leak));
  const pOld = page({ doors: doors(), cameo: twc() }, cfg()); delete pOld.slabBridge.toolOpts; await pOld.SLAlm.tool('doors').refreshHas();
  let eOld = ''; try { await pOld.SLAlm.tool('doors').check(true); } catch (e) { eOld = e.message; }
  check('a desktop app too old to pass the tool\u2019s headers says to update it, and sends nothing', /Update the app/.test(eOld) && pOld.sent.length === 0, eOld);
  check('every request the engine made was inside the fence (' + p.sent.length + ')', p.sent.length > 60 && p.sent.every(x => !x.bad), JSON.stringify(p.sent.filter(x => x.bad).slice(0, 3)));

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
