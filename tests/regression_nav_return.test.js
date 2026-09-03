#!/usr/bin/env node
/*
 * Regression — a golden-thread jump has a DOOR IN and a WAY BACK
 * (25 Aug 2026, reviewer feedback in nav_feedback_1.pptx).
 *
 * Two findings, one suite:
 *
 *  1. "From golden thread I want to see this FC, but it opens a window instead
 *     … I cant click on the FC. I figured it out by going through the Function,
 *     then Failure condition."
 *     Cause: both ecosystem panels build their pill list with `m.key !== key`,
 *     which excludes the CLICKED node from its own panel. The destination
 *     already worked — there was simply no control that pointed at it. Pinned
 *     here on BOTH surfaces (inline panel + modal), because fixing one would
 *     have left the complaint alive in whichever the reviewer happened to open.
 *
 *  2. "Then you get to here and you can click around but to go back you have to
 *     click on the golden thread."
 *     nav_return.js records the panel you LEFT (not the node you landed on) and
 *     paints a return chip. Pinned: the origin is the origin, the chip returns
 *     to the thread AND reopens that node, and a move the user makes himself
 *     clears it.
 *
 * NOT pinned, deliberately: the CAD spec tree and the safety-V navigator. The
 * reviewer offered both as options and said "None of this has to be done now";
 * the CAD tree would also reverse the signed 23 Aug ruling that removed tree
 * rows from the rail. Those are rulings, not defects.
 *
 * Run: node tests/regression_nav_return.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const view = S('fta_view_modules.js');
const helpers = S('helpers_modules.js');
const ret = S('nav_return.js');
const idx = S('index.html');

// ---- 1. the door in, on BOTH panel surfaces --------------------------------
check('the inline panel offers a door to the node you clicked (gte-self)',
  /class="gte-pill gte-self" data-navkey="' \+ esc\(n\.key\)/.test(view) &&
  />Open ' \+ esc\(n\.label\)/.test(view));
check('the modal panel offers the same door (gtem-self)',
  /class="gtem-pill gtem-self" data-navkey="' \+ esc\(n\.key\)/.test(helpers) &&
  />Open ' \+ esc\(n\.label\)/.test(helpers));
check('both doors reuse the EXISTING wiring contract — no new click handlers',
  view.includes(".gte-pill[data-navkey]") && helpers.includes(".gtem-pill[data-navkey]"));
check('the door is gated the same way pills are (a real ref, never a vv bucket)',
  (view.match(/!!n\.ref && n\.kind !== 'vv'/g) || []).length >= 1 &&
  (helpers.match(/!!n\.ref && n\.kind !== 'vv'/g) || []).length >= 1);
// The drag header eats mousedown; the door must not live inside it.
check('the inline door sits BELOW the drag header, not inside it',
  view.indexOf('gte-self') > view.indexOf('gt-eco-drag') &&
  view.indexOf('gte-self') > view.indexOf('id="gt-eco-close"'));
// The destination has to actually exist for a failure condition.
check('_gtvNavigateTo can route a failure condition (acFha + sysFha both handled)',
  /case 'acFha':/.test(helpers) && /case 'sysFha':/.test(helpers));

// ---- 2. the way back -------------------------------------------------------
check('nav_return records the panel you LEFT, not the node you landed on', (() => {
  // the origin is captured from _gtvShowEco (the open panel), then read in the
  // _gtvNavigateTo wrapper as `from` before the jump runs.
  return /_cur = _labelOf\(graph, key\)/.test(ret) && /var from = _cur;/.test(ret);
})());
check('the chip returns to the thread AND reopens that node (pending-key handshake)',
  /_pendingKey = _origin\.key/.test(ret) &&
  /switchTab\('golden-thread'\)/.test(ret) &&
  /if \(has\) key = _pendingKey;/.test(ret));
check('the handshake refuses a node that no longer exists in the rebuilt graph',
  /graph\.nodes\.some\(function \(n\) \{ return n\.key === _pendingKey; \}\)/.test(ret));
check('a move the user makes himself clears the chip',
  /if \(!_fromThread\) \{ _origin = null; hide\(\); \}/.test(ret) &&
  /tabId === 'golden-thread'/.test(ret));
check('every wrapper is guarded against double-wrapping',
  (ret.match(/_slReturnWrapped/g) || []).length >= 8);
check('kill switch present (SL_NAV_RETURN_OFF)', ret.includes('SL_NAV_RETURN_OFF'));
check('wired in index.html, cache-busted, AFTER the files it wraps',
  /nav_return\.js\?v=[\d.]+/.test(idx) &&
  idx.indexOf('nav_return.js') > idx.indexOf('fta_view_modules.js') &&
  idx.indexOf('nav_return.js') > idx.indexOf('helpers_modules.js') &&
  idx.indexOf('nav_return.js') > idx.indexOf('support_modules.js'));

// ---- 3. behaviour, on a DOM harness ---------------------------------------
{
  const nodes = [
    { key: 'fc:FC-15', label: 'FC-15', kind: 'fc', ref: { kind: 'acFha', id: 15 } },
    { key: 'func:SF-07', label: 'SF-07 · Steer on the ground', kind: 'func', ref: { kind: 'acFunc', id: 7 } }
  ];
  const graph = { nodes: nodes, links: [] };
  const made = [];
  const listeners = {};
  const mkEl = () => ({
    style: {}, id: '', innerHTML: '', title: '', parentNode: null,
    setAttribute() {}, appendChild() {},
    addEventListener: function (k, f) { (listeners[this.id] = listeners[this.id] || {})[k] = f; }
  });
  global.window = global;
  global.document = {
    getElementById: id => made.find(e => e.id === id) || null,
    createElement: () => { const e = mkEl(); return e; },
    body: { appendChild: e => { made.push(e); e.parentNode = { removeChild: x => { const i = made.indexOf(x); if (i >= 0) made.splice(i, 1); } }; } }
  };

  let switched = [], rendered = 0, ecoOpened = [];
  global.switchTab = t => { switched.push(t); };
  global._gtvShowEco = (key, g) => { ecoOpened.push(key); };
  global._gtvShowEcoModal = () => {};
  global.renderGoldenThreadView = () => { rendered++; global._gtvShowEco('func:SF-07', graph); };
  let navTo = [];
  global._gtvNavigateTo = n => { navTo.push(n.key); global.switchTab('ac-fha'); return true; };

  delete require.cache[require.resolve('../site/nav_return.js')];
  require('../site/nav_return.js');
  const NR = global.SL_NAV_RETURN;

  // open FC-15's panel, then jump to it
  global._gtvShowEco('fc:FC-15', graph);
  check('the wrapper remembers which panel is open', NR._state().cur.key === 'fc:FC-15');

  global._gtvNavigateTo(nodes[0]);
  check('a jump records the origin panel as the way back',
    NR._state().origin && NR._state().origin.key === 'fc:FC-15' && navTo[0] === 'fc:FC-15');
  check('…and the jump\'s own switchTab does NOT clear it',
    NR._state().origin !== null, 'the _fromThread guard failed');

  NR._paint();
  const chip = made.find(e => e.id === NR.CHIP_ID || e.id === 'sl-nav-return');
  check('the chip paints, naming the node you left',
    !!chip && /Back to Golden Thread/.test(chip.innerHTML) && /FC-15/.test(chip.innerHTML));

  switched = []; ecoOpened = [];
  NR._goBack();
  check('clicking it returns to the Golden Thread', switched.indexOf('golden-thread') >= 0);
  const before = NR._state();
  check('…and the origin is consumed, so the chip does not linger', before.origin === null);

  // the pending key must reopen FC-15, not the default start node
  global.renderGoldenThreadView();
  check('…and the panel you left is reopened, not the default node',
    ecoOpened[ecoOpened.length - 1] === 'fc:FC-15',
    'reopened ' + ecoOpened[ecoOpened.length - 1]);

  // a user-initiated move clears it
  global._gtvShowEco('fc:FC-15', graph);
  global._gtvNavigateTo(nodes[0]);
  check('a fresh jump arms the chip again', NR._state().origin !== null);
  global.switchTab('cma');
  check('a rail move the user makes himself clears the chip', NR._state().origin === null);

  delete global.window; delete global.document; delete global.switchTab;
  delete global._gtvShowEco; delete global._gtvShowEcoModal;
  delete global.renderGoldenThreadView; delete global._gtvNavigateTo;
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
