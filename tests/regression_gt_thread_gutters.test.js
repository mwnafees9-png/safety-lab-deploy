#!/usr/bin/env node
/*
 * Regression — golden-thread swim lanes: a container never covers a dotted line.
 *   Feeder (RAM/HF) risers are dashed; they must run in the COLUMN GAP, and the
 *   pitch widens to fit however many risers a column needs. RAM and HF risers
 *   never share an x. Executes the REAL renderer (gt_thread.js is a UMD module)
 *   on a fixture dense enough that the old fixed 22px gap forced risers under
 *   the previous column's cards — then geometrically intersects every dashed
 *   segment against every card rect.
 * Run: node tests/regression_gt_thread_gutters.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const GT = require(path.join(__dirname, '..', 'site', 'gt_thread.js'));
check('module exports render', typeof GT.render === 'function');

// ---- fixture: 6 feeders on one column — the old 22px gap could hold 2 -------
const N = (key, kind, label, sub, extra) => Object.assign({ key, kind, id: key.split(':')[1], label, sub: sub || '' }, extra || {});
const graph = {
  nodes: [
    N('func:SF1', 'func', 'SF-01 · Control pitch', 'Function'),
    N('sys:S1', 'sys', 'Flight Control', 'Fn · Control pitch', { role: 'primary' }),
    N('fc:C1', 'fc', 'FC-01', 'AFHA · Catastrophic'),
    N('fc:C2', 'fc', 'FC-02', 'AFHA · Hazardous'),
    N('fta:T1', 'fta', 'PASA · FC-01 loss', 'Fault tree'),
    N('ram:R1', 'ram', 'LRU-1', 'Reliability'), N('ram:R2', 'ram', 'LRU-2', 'Reliability'),
    N('hf:H1', 'hf', 'HF-1', 'Crew action'), N('hf:H2', 'hf', 'HF-2', 'Crew action'),
    N('hf:H3', 'hf', 'HF-3', 'Crew action'), N('hf:H4', 'hf', 'HF-4', 'Crew action'),
  ],
  links: [
    { s: 'func:SF1', t: 'sys:S1' }, { s: 'sys:S1', t: 'fc:C1' }, { s: 'sys:S1', t: 'fc:C2' },
    { s: 'fc:C1', t: 'fta:T1' },
    { s: 'ram:R1', t: 'fc:C1' }, { s: 'ram:R2', t: 'fc:C2' },
    { s: 'hf:H1', t: 'fc:C1' }, { s: 'hf:H2', t: 'fc:C1' }, { s: 'hf:H3', t: 'fc:C2' }, { s: 'hf:H4', t: 'fc:C2' },
  ],
};
const host = { innerHTML: '', querySelector: () => null };
GT.render(host, graph);
const svg = host.innerHTML;
check('renders an svg', /<svg /.test(svg));

// ---- parse card rects (first rect inside each g[data-key]) ------------------
const cards = [];
const gRe = /<g data-key="([^"]+)"[^>]*><rect x="([\d.:-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/g;
let m; while ((m = gRe.exec(svg))) cards.push({ key: m[1], x: +m[2], y: +m[3], w: +m[4], h: +m[5] });
check('all 11 cards drawn', cards.length === 11, String(cards.length));

// ---- parse dashed paths (the feeder risers) ---------------------------------
const dashed = [];
const pRe = /<path ([^>]+)\/>/g;
while ((m = pRe.exec(svg))) {
  const at = m[1];
  if (!/stroke-dasharray="4,3"/.test(at)) continue;
  const d = (at.match(/ d="([^"]+)"/) || [])[1];
  const pts = (d.match(/-?[\d.]+,-?[\d.]+/g) || []).map(p => p.split(',').map(Number));
  dashed.push({ s: (at.match(/data-s="([^"]+)"/) || [])[1], pts });
}
check('all 6 feeder connectors are dashed paths', dashed.length === 6, String(dashed.length));

// ---- THE property: no dashed segment crosses any card's interior ------------
const EPS = 0.5;
function segHitsCard(a, b, r) {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
  const y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  return x1 > r.x + EPS && x0 < r.x + r.w - EPS && y1 > r.y + EPS && y0 < r.y + r.h - EPS;
}
const hits = [];
dashed.forEach(p => {
  for (let i = 1; i < p.pts.length; i++)
    cards.forEach(r => { if (segHitsCard(p.pts[i - 1], p.pts[i], r)) hits.push(p.s + ' × ' + r.key); });
});
check('no dashed segment runs under any card (containers never cover dotted lines)',
  hits.length === 0, hits.slice(0, 6).join('; '));

// ---- risers are distinct: RAM and HF never share an x -----------------------
const riserX = dashed.map(p => p.pts[1][0]);
check('every riser has its own x (column-global gutter index)',
  new Set(riserX.map(x => Math.round(x * 10))).size === riserX.length, JSON.stringify(riserX));

// ---- roomy pitch: he has zoom + pan — the gap breathes ----------------------
const c = {}; cards.forEach(r => { c[r.key] = r; });
const gap1 = c['fc:C1'].x - (c['sys:S1'].x + c['sys:S1'].w);
check('column gap is generous (≥ 40px base) and fits all 4 risers of the fc column',
  gap1 >= 40 && gap1 >= 16 + 4 * 8 + 12, String(gap1));

// ---- feeder risers stay inside their target's gap ---------------------------
const riserOk = dashed.every(p => {
  const t = c[(svg.match(new RegExp('data-s="' + p.s.replace(/[:\\]/g, '\\$&') + '" data-t="([^"]+)"')) || [])[1]];
  if (!t) return true;
  const x = p.pts[1][0];
  return x < t.x && x > t.x - gap1;
});
check('risers run inside the target column gap', riserOk);

// ---- pin (rule 12) ----------------------------------------------------------
const idx = S('index.html');
check('gt_thread pinned at 0.8 or later',
  parseFloat((idx.match(/gt_thread\.js\?v=([0-9.]+)/) || [])[1] || '0') >= 0.8);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
