// regression_fta_node_merge.test.js
// Node-level fault-tree merge (11 Sep 2026). A fault-tree page is decomposed into a
// page shell + one record per node (keyed pageId:nodeId) so two people editing
// DIFFERENT nodes of the SAME tree both survive, instead of whole-page last-write-wins.
// Tests the pure decompose/recompose logic AND the real doc write-path wiring.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'site', 'crdt_sync.js'), 'utf8');

// structural deep-equality, key-order independent
function deepEq(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (typeof a !== 'object') return a === b;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) { if (!Object.prototype.hasOwnProperty.call(b, k)) return false; if (!deepEq(a[k], b[k])) return false; }
  return true;
}

// ---- minimal fake Yjs + boot (mirrors regression_crdt_authority) ----
function makeY(env) {
  function Doc() { this._maps = new Map(); this._handlers = []; env.docs.push(this); }
  Doc.prototype.getMap = function (n) { if (!this._maps.has(n)) this._maps.set(n, new Map()); return this._maps.get(n); };
  Doc.prototype.transact = function (f) { f(); };
  Doc.prototype.on = function () {};
  Doc.prototype.destroy = function () {};
  return { Doc: Doc, applyUpdate() {}, encodeStateVector() { return new Uint8Array(0); }, encodeStateAsUpdate() { return new Uint8Array(0); } };
}
function boot(model, projectId) {
  const env = { docs: [], applied: [], listeners: {} };
  const win = {
    Y: null, navigator: { onLine: false },
    localStorage: { getItem: k => (k === 'SLA_CRDT' ? '1' : null), setItem() {}, removeItem() {} },
    console: { info() {}, warn() {}, error() {}, log() {} },
    getActiveCloudProjectId: () => env.project, getActiveWorkspaceId: () => 'ws-1', isSupabaseSignedIn: () => true,
    getSupabaseClient: () => ({ channel: () => ({ on() { return this; }, subscribe() { return this; }, send() {}, unsubscribe() {} }),
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }), upsert: () => Promise.resolve({}) }) }),
    __crdtCapture: () => JSON.parse(JSON.stringify(env.model)),
    __crdtApply: (p) => { env.applied.push(p); },
    addEventListener: (ev, cb) => { (env.listeners[ev] = env.listeners[ev] || []).push(cb); },
    projectConfig: {}, SL_CRDT_AUTHORITATIVE: false
  };
  win.window = win; env.model = model; env.project = projectId;
  const doc = { getElementById: () => null, createElement: () => ({ style: {}, set src(v) {}, appendChild() {} }), head: { appendChild() {} }, documentElement: { appendChild() {} }, body: { appendChild() {} } };
  const ctx = Object.assign(win, { document: doc, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: b => Buffer.from(b, 'base64').toString('binary'),
    Date, JSON, Math, Uint8Array, Promise, Array, Object, String });
  ctx._activeCloudDocVersion = null; ctx.Y = makeY(env);
  vm.createContext(ctx); vm.runInContext(SRC, ctx);
  env.api = ctx.SafetyLabCRDT; env.api.refresh();
  return env;
}
// read a keyed collection out of a fake doc, ordered by its ord: map
function readKeyed(doc, name) {
  const map = doc.getMap('col:' + name), ord = doc.getMap('ord:' + name);
  return Array.from(map.keys()).sort((a, b) => ((ord.get(a) != null ? ord.get(a) : 1e9) - (ord.get(b) != null ? ord.get(b) : 1e9)))
    .map(k => JSON.parse(map.get(k)));
}

// a representative fault tree: OR top, a basic + an AND gate with one basic child
function sampleTree() {
  return { id: 'pg1', name: 'Tree 1', treeLevel: 'standalone', mode: 'top-down', root:
    { id: 1, logicalId: 1, displayId: 'TOP-001', name: 'System failure', type: 'gate', gateType: 'OR', probability: 0, children: [
      { id: 2, displayId: 'BE-001', name: 'Sensor A fails', type: 'basic', probability: 0, children: [] },
      { id: 3, displayId: 'G-002', name: 'Power lost', type: 'gate', gateType: 'AND', probability: 0, children: [
        { id: 4, displayId: 'BE-003', name: 'Bus B fails', type: 'basic', probability: 0, children: [] }
      ] }
    ] } };
}
const EMPTY_COLS = { acFunctionsData: [], acFhaData: [], acReqData: [], acAssumptionsData: [], praData: [], zsaData: [], cmaData: [], fmeaData: [], acFcimData: [], routingData: [], resourcesData: [], itemsData: [], flightPhasesData: [], systemsData: [], stpaData: {}, projectConfig: {}, mlData: {}, projectName: 'P' };
const modelWith = (pages) => Object.assign({}, JSON.parse(JSON.stringify(EMPTY_COLS)), { ftaPages: pages });

// grab the pure fns off a booted API (they don't need a session)
const _fta = boot(modelWith([]), 'proj-0').api._fta;
check('pure fns exposed on API', _fta && typeof _fta.decompose === 'function' && typeof _fta.recompose === 'function');

console.log('[fta] 1 — decompose/recompose round-trips a tree exactly');
{
  const page = sampleTree();
  const d = _fta.decompose([page]);
  check('one shell, four node records', d.shells.length === 1 && d.nodes.length === 4, JSON.stringify({ s: d.shells.length, n: d.nodes.length }));
  check('shell carries page fields but NOT root', d.shells[0].name === 'Tree 1' && !('root' in d.shells[0]));
  check('node keys are pageId:nodeId', d.nodes.map(n => n.nodeKey).sort().join(',') === 'pg1:1,pg1:2,pg1:3,pg1:4');
  const back = _fta.recompose(d.shells, d.nodes);
  check('recompose returns the one page', back.length === 1 && back[0].id === 'pg1');
  check('tree reconstructed identically', deepEq(back[0].root, page.root), JSON.stringify(back[0].root));
}

console.log('[fta] 2 — THE FIX: two people editing DIFFERENT nodes both survive');
{
  const d = _fta.decompose([sampleTree()]);
  // peer A renames node 2; peer B renames node 4 — independently, on their own copies
  const aNodes = JSON.parse(JSON.stringify(d.nodes)); aNodes.find(n => n.nodeId === 2).node.name = 'Sensor A — REV A';
  const bNodes = JSON.parse(JSON.stringify(d.nodes)); bNodes.find(n => n.nodeId === 4).node.name = 'Bus B — REV B';
  // the CRDT merge is per-key: the map ends up with A's node-2 record and B's node-4 record
  const merged = {}; d.nodes.forEach(n => merged[n.nodeKey] = n);
  aNodes.forEach(n => { if (n.nodeId === 2) merged[n.nodeKey] = n; });
  bNodes.forEach(n => { if (n.nodeId === 4) merged[n.nodeKey] = n; });
  const back = _fta.recompose(d.shells, Object.values(merged));
  const root = back[0].root;
  const n2 = root.children.find(c => c.id === 2);
  const n4 = root.children.find(c => c.id === 3).children.find(c => c.id === 4);
  check("A's edit to node 2 survived", n2.name === 'Sensor A — REV A');
  check("B's edit to node 4 survived", n4.name === 'Bus B — REV B', JSON.stringify(n4));
}

console.log('[fta] 3 — adding a node under an existing gate merges in');
{
  const d = _fta.decompose([sampleTree()]);
  const nodes = d.nodes.slice();
  nodes.push({ nodeKey: 'pg1:5', pageId: 'pg1', nodeId: 5, parentId: 3, order: 1, kidsCollapsed: false, node: { id: 5, displayId: 'BE-004', name: 'Bus C fails', type: 'basic', probability: 0 } });
  const back = _fta.recompose(d.shells, nodes);
  const g = back[0].root.children.find(c => c.id === 3);
  check('gate now has two children in order', g.children.map(c => c.id).join(',') === '4,5', JSON.stringify(g.children.map(c => c.id)));
  check('added node placed correctly', g.children[1].name === 'Bus C fails');
}

console.log('[fta] 4 — sibling ORDER is preserved by the order field');
{
  const d = _fta.decompose([sampleTree()]);
  // flip the order of the two top-level children
  d.nodes.find(n => n.nodeId === 2).order = 1;
  d.nodes.find(n => n.nodeId === 3).order = 0;
  const back = _fta.recompose(d.shells, d.nodes);
  check('children reorder to 3,2', back[0].root.children.map(c => c.id).join(',') === '3,2');
}

console.log('[fta] 5 — collapsed children round-trip into _children');
{
  const page = sampleTree();
  // collapse node 3: its kids live under _children, children is null
  const g = page.root.children.find(c => c.id === 3);
  g._children = g.children; g.children = null;
  const d = _fta.decompose([page]);
  check('node 3 recorded as kidsCollapsed', d.nodes.find(n => n.nodeId === 3).kidsCollapsed === true);
  const back = _fta.recompose(d.shells, d.nodes);
  const g2 = back[0].root.children.find(c => c.id === 3);
  check('rebuilt collapsed: _children set, children null', Array.isArray(g2._children) && g2._children[0].id === 4 && g2.children === null);
}

console.log('[fta] 6 — ORPHAN (parent concurrently deleted) is surfaced, never lost');
{
  const d = _fta.decompose([sampleTree()]);
  // simulate: node 3 (the AND gate) was deleted by a peer, but node 4 (its child) edited by another -> 4 orphaned
  const nodes = d.nodes.filter(n => n.nodeId !== 3);
  const back = _fta.recompose(d.shells, nodes);
  const allIds = []; (function walk(n){ if(!n) return; allIds.push(n.id); (n.children||n._children||[]).forEach(walk); })(back[0].root);
  check('orphaned node 4 still present in the tree', allIds.indexOf(4) !== -1, JSON.stringify(allIds));
  const found = (function find(n){ if(!n) return null; if(n.id===4) return n; for(const c of (n.children||n._children||[])){ const r=find(c); if(r) return r; } return null; })(back[0].root);
  check('orphan marked _orphanReattached', found && found._orphanReattached === true);
}

console.log('[fta] 7 — LEGACY/skew: a shell that still carries .root and no node records is kept');
{
  const legacyShell = { id: 'pgL', name: 'Old tree', root: { id: 9, type: 'gate', gateType: 'OR', name: 'legacy top', children: [] } };
  const back = _fta.recompose([legacyShell], []);
  check('legacy embedded root preserved', back[0].root && back[0].root.id === 9 && back[0].root.name === 'legacy top');
}

console.log('[fta] 8 — empty page (root null) stays null, no phantom node');
{
  const d = _fta.decompose([{ id: 'pgE', name: 'empty', root: null }]);
  check('empty page: shell only, no nodes', d.shells.length === 1 && d.nodes.length === 0);
  const back = _fta.recompose(d.shells, d.nodes);
  check('recomposed empty page has root null', back[0].root === null);
}

console.log('[fta] 9 — INTEGRATION: the real doc write-path decomposes into node records');
{
  const e = boot(modelWith([sampleTree()]), 'proj-9');
  const shells = readKeyed(e.docs[0], 'ftaPages');
  const nodes = readKeyed(e.docs[0], 'ftaNodes');
  check('doc holds one page shell with NO embedded root', shells.length === 1 && !('root' in shells[0]));
  check('doc holds four flat node records', nodes.length === 4 && nodes.map(n => n.nodeKey).sort().join(',') === 'pg1:1,pg1:2,pg1:3,pg1:4');
  // reading them back through recompose rebuilds the original tree
  const back = _fta.recompose(shells, nodes);
  check('round-trip through the real doc rebuilds the tree', deepEq(back[0].root, sampleTree().root));
}

console.log('[fta] 10 — INTEGRATION: two pages merge independently (different keys)');
{
  const pageA = sampleTree();
  const pageB = { id: 'pg2', name: 'Tree 2', root: { id: 10, type: 'gate', gateType: 'OR', name: 'Top 2', children: [ { id: 11, type: 'basic', name: 'X', children: [] } ] } };
  const e = boot(modelWith([pageA, pageB]), 'proj-10');
  const shells = readKeyed(e.docs[0], 'ftaPages');
  check('both page shells present', shells.map(s => s.id).sort().join(',') === 'pg1,pg2');
  const nodes = readKeyed(e.docs[0], 'ftaNodes');
  check('node records span both pages', nodes.some(n => n.pageId === 'pg1') && nodes.some(n => n.pageId === 'pg2'));
}

console.log('\n[fta] ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
