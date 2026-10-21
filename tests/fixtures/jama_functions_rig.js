'use strict';
// A recorded-shape Jama project for the live function bridge (21 Oct 2026).
// Item types: 10 Function, 20 Requirement, 30 Folder, 31 Set.
// Snapshot 1: a project folder holding five deep function trees (top, then four levels below,
// 743 function items in all, well past the old 500 item cap), one childless top function, a
// function that sits inside a folder inside a function (looked through), and 40 requirements.
// mutate() produces snapshot 2 with the changes a real program makes between two checks.
const FN = 10, REQ = 20, FOLDER = 30, SET = 31;

function item(id, type, key, name, parent, sort, desc, mod) {
  return { id, documentKey: key, itemType: type, modifiedDate: mod || '2026-10-01T00:00:00.000+0000',
           fields: { name, description: desc == null ? '<p>' + name + ' <b>definition</b> &amp; detail</p>' : desc },
           location: { sortOrder: sort, globalSortOrder: sort, sequence: '', parent: parent == null ? { project: 77 } : { item: parent } } };
}

function snapshot1() {
  const items = []; let id = 1000, sort = 0;
  const nextId = () => ++id;
  items.push(item(900, FOLDER, 'RAD-FLD-1', 'Aircraft functions', null, sort++));
  const tops = [];
  for (let t = 1; t <= 5; t++) {
    const tid = nextId(); tops.push(tid);
    items.push(item(tid, FN, 'RAD-AF-' + t, 'Top function ' + t, 900, sort++));
    for (let a = 1; a <= 3; a++) {
      const aid = nextId();
      items.push(item(aid, FN, 'RAD-F-' + t + '.' + a, 'Fn ' + t + '.' + a, tid, sort++));
      for (let b = 1; b <= 4; b++) {
        let parentForB = aid;
        // function 1.1.4 sits inside a folder that sits inside function 1.1 (must be looked through)
        if (t === 1 && a === 1 && b === 4) { items.push(item(950, FOLDER, 'RAD-FLD-2', 'Legacy pitch items', aid, sort++)); parentForB = 950; }
        const bid = nextId();
        items.push(item(bid, FN, 'RAD-F-' + t + '.' + a + '.' + b, 'Fn ' + t + '.' + a + '.' + b, parentForB, sort++));
        for (let c = 1; c <= 3; c++) {
          const cid = nextId();
          items.push(item(cid, FN, 'RAD-F-' + t + '.' + a + '.' + b + '.' + c, 'Fn ' + t + '.' + a + '.' + b + '.' + c, bid, sort++));
          for (let d = 1; d <= 2; d++) {
            const did = nextId();
            items.push(item(did, FN, 'RAD-F-' + t + '.' + a + '.' + b + '.' + c + '.' + d, 'Fn ' + t + '.' + a + '.' + b + '.' + c + '.' + d, cid, sort++));
          }
        }
      }
    }
  }
  items.push(item(5000, FN, 'RAD-AF-6', 'Top function 6', 900, sort++));
  items.push(item(6000, SET, 'RAD-SET-REQ', 'Requirements', null, sort++));
  for (let r = 1; r <= 40; r++) items.push(item(6000 + r, REQ, 'RAD-REQ-' + r, 'Requirement ' + r, 6000, sort++, 'The aircraft shall do thing ' + r + '.'));
  return items;
}

const byKey = (items, k) => items.find(i => i.documentKey === k);
function mutate(items) {
  const s = JSON.parse(JSON.stringify(items));
  const M = '2026-10-15T00:00:00.000+0000';
  // 1. rename a level-3 function
  const r1 = byKey(s, 'RAD-F-2.1.1'); r1.fields.name = 'Fn 2.1.1 renamed'; r1.modifiedDate = M;
  // 2. change a level-4 description
  const r2 = byKey(s, 'RAD-F-2.1.1.1'); r2.fields.description = '<p>New words</p>'; r2.modifiedDate = M;
  // 3. move a level-4 function (with its two children) under a level-3 in ANOTHER top function
  const mv = byKey(s, 'RAD-F-3.2.2.3'); mv.location.parent = { item: byKey(s, 'RAD-F-4.1.1').id }; mv.modifiedDate = M;
  // 4. delete a level-5 function
  s.splice(s.indexOf(byKey(s, 'RAD-F-5.3.4.3.2')), 1);
  // 5. a key change (item moved between sets in Jama changes its key)
  const kc = byKey(s, 'RAD-F-1.2'); kc.documentKey = 'RAD-G-1.2'; kc.modifiedDate = M;
  // 6. a new level-5 function
  s.push(item(9001, FN, 'RAD-F-1.3.1.1.3', 'Fn 1.3.1.1.3 new', byKey(s, 'RAD-F-1.3.1.1').id, 99999, null, M));
  // 7. rename a top function (applies to every row of it)
  const t2 = byKey(s, 'RAD-AF-2'); t2.fields.name = 'Top function 2 renamed'; t2.modifiedDate = M;
  // 8. the childless top function gains a child
  s.push(item(9002, FN, 'RAD-F-6.1', 'Fn 6.1', 5000, 99998, null, M));
  // 9. a requirement changes, one is removed, one is added
  const rq = byKey(s, 'RAD-REQ-3'); rq.fields.description = 'The aircraft shall do thing 3, faster.'; rq.modifiedDate = M;
  s.splice(s.indexOf(byKey(s, 'RAD-REQ-40')), 1);
  s.push(item(6100, REQ, 'RAD-REQ-41', 'Requirement 41', 6000, 99997, 'New.', M));
  return s;
}

// A Jama REST server over a snapshot: itemtypes, abstractitems (paged, itemType filter), items/{id}.
function server(getItems, opts) {
  const o = opts || {};
  const log = [];
  let rateOnce = !!o.rateLimitOnce;
  async function get(url) {
    log.push(url);
    if (rateOnce && /abstractitems/.test(url) && /startAt=100\b/.test(url)) { rateOnce = false; return { ok: false, error: 'Bridge rate limit (60/min) exceeded.' }; }
    const u = new URL(url);
    const items = getItems();
    if (u.pathname.endsWith('/rest/latest/itemtypes')) {
      return { ok: true, data: { meta: { pageInfo: { startIndex: 0, resultCount: 4, totalResults: 4 } },
        data: [{ id: FN, display: 'Function', typeKey: 'FN' }, { id: REQ, display: 'Requirement', typeKey: 'REQ' }, { id: FOLDER, display: 'Folder', typeKey: 'FLD' }, { id: SET, display: 'Set', typeKey: 'SET' }] } };
    }
    const m = /\/rest\/latest\/items\/(\d+)$/.exec(u.pathname);
    if (m) { const it = items.find(i => i.id === Number(m[1])); return it ? { ok: true, data: { data: it } } : { ok: false, error: 'HTTP 404 from jama' }; }
    if (u.pathname.endsWith('/rest/latest/abstractitems')) {
      const types = u.searchParams.getAll('itemType').map(Number);
      const startAt = Number(u.searchParams.get('startAt') || 0), max = Math.min(50, Number(u.searchParams.get('maxResults') || 20));
      const all = items.filter(i => !types.length || types.includes(i.itemType));
      return { ok: true, data: { meta: { pageInfo: { startIndex: startAt, resultCount: Math.min(max, Math.max(0, all.length - startAt)), totalResults: all.length } }, data: all.slice(startAt, startAt + max) } };
    }
    return { ok: false, error: 'HTTP 404 from jama' };
  }
  return { get, log };
}

module.exports = { FN, REQ, FOLDER, SET, snapshot1, mutate, server, byKey };
