#!/usr/bin/env node
/*
 * Regression — render only what is on screen (23 Sep 2026, the lazy-compute second pass).
 *
 * WHAT WAS THERE. Rendering was per tab, compute was not: an edit on any tab called updateD3
 * (85 sites), renderFTASidebar (44), renderACFHA (22), renderMacPage (19) ... each rebuilding a
 * view with display:none. 8 Sep gated updateDashboard by tab name; this pass gates fifteen more
 * renderers by the DOM itself (is my host on screen?) and runs the pending render on arrival.
 *
 * PINNED:
 *   L1  defer() returns false (renders) when the host is missing, visible, or undecidable
 *   L2  defer() returns true and records pending when the host is hidden; the LAST args win
 *   L3  flush() runs a pending render only once its host is visible; settle() runs it regardless
 *   L4  the pending render is resolved by NAME, so a wrapper installed after the defer runs
 *   L5  re-entrancy: a render that runs from flush and defers again does not loop or double-run
 *   L6  the kill switch (window.SL_LAZY_OFF) makes defer() a no-op; errors never escape
 *   L7  wiring: lazy_render.js loads with defer right after error_watch.js, before every app module
 *   L8  every gated renderer carries the gate as its FIRST statement with its own name and a host
 *       id that exists in index.html inside the expected view; the gated list is exactly this one
 *   L9  switchTab and pasaSub flush after showing a view; both fault-tree exports settle the canvas
 *   L10 mutations go red: hidden() inverted -> visible host deferred; gate removed -> L8 red
 *
 * Run: node tests/regression_lazy_render.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const SRC = read('lazy_render.js');
const IDX = read('index.html');

// A tiny document: elements by id, each with a `visible` flag the module reads through checkVisibility.
function boot(src) {
  const els = {};
  const el = (id, visible, viewId) => {
    const e = { id, visible, ownerDocument: {}, checkVisibility() { return this.visible; }, parentElement: null,
                closest(sel) { return viewId ? { id: viewId } : null; } };
    els[id] = e; return e;
  };
  const clicks = [];
  const ctx = { console, setTimeout, Date, Math, Object, Array, String,
    document: { getElementById: id => els[id] || null, addEventListener: (k, fn) => clicks.push(fn) },
    requestAnimationFrame: fn => fn() };
  ctx.window = ctx;
  vm.createContext(ctx); vm.runInContext(src, ctx);
  return { api: ctx.window.SLLazy, el, els, ctx, clicks };
}

console.log('[L1] false when the host is missing, visible, or undecidable');
{
  const b = boot(SRC);
  check('missing host -> false', b.api.defer('nope', 'r', []) === false);
  b.el('vis', true);
  check('visible host -> false', b.api.defer('vis', 'r', []) === false);
  b.els['odd'] = { id: 'odd', ownerDocument: {} };   // no checkVisibility, no getClientRects
  check('undecidable host -> false (renders)', b.api.defer('odd', 'r', []) === false);
  check('nothing pending after the three', b.api.pending().length === 0);
  check('stats count every direct render (missing, visible, undecidable)', b.api.stats().direct === 3, JSON.stringify(b.api.stats()));
}

console.log('[L2] hidden host -> pending, last args win');
{
  const b = boot(SRC); b.el('h', false, 'view-x');
  check('hidden host -> true', b.api.defer('h', 'r', [1]) === true);
  check('recorded', b.api.pending().join() === 'h');
  b.api.defer('h', 'r', [2]);
  const seen = []; b.ctx.r = function () { seen.push(Array.from(arguments)); };
  b.api.settle('h');
  check('ran once with the LAST args', JSON.stringify(seen) === '[[2]]', JSON.stringify(seen));
  check('pending cleared', b.api.pending().length === 0);
}

console.log('[L3] flush waits for visibility; settle does not');
{
  const b = boot(SRC); const e = b.el('h', false, 'view-x');
  let n = 0; b.ctx.r = () => { n++; };
  b.api.defer('h', 'r', []);
  check('flush while hidden runs nothing', b.api.flush() === 0 && n === 0);
  e.visible = true;
  check('flush once visible runs it', b.api.flush() === 1 && n === 1);
  check('second flush is idle', b.api.flush() === 0 && n === 1);
  e.visible = false; b.api.defer('h', 'r', []);
  check('settle runs it hidden', b.api.settle('h') === true && n === 2);
  check('settle with nothing pending is false', b.api.settle('h') === false);
}

console.log('[L4] resolved by name: a wrapper installed after the defer runs');
{
  const b = boot(SRC); const e = b.el('h', false, 'view-x');
  const calls = []; b.ctx.r = () => calls.push('orig');
  b.api.defer('h', 'r', []);
  const orig = b.ctx.r; b.ctx.r = function () { calls.push('wrap'); return orig.apply(this, arguments); };
  e.visible = true; b.api.flush();
  check('wrapper then original', calls.join() === 'wrap,orig', calls.join());
  b.api.defer('h', 'gone', []); e.visible = false; b.api.defer('h', 'gone', []);
  check('a name that is not a function is dropped without throwing', b.api.settle('h') === false);
}

console.log('[L5] re-entrancy');
{
  const b = boot(SRC); const e = b.el('h', false, 'view-x');
  let n = 0;
  b.ctx.r = function () { if (b.api.defer('h', 'r', arguments)) return; n++; };
  b.ctx.r(); b.ctx.r();
  check('two calls while hidden -> one pending, zero renders', b.api.pending().length === 1 && n === 0);
  e.visible = true; b.api.flush();
  check('arrival renders exactly once', n === 1 && b.api.pending().length === 0);
  b.ctx.r();
  check('visible call renders directly', n === 2);
  e.visible = false; b.ctx.r(); b.ctx.r();
  check('hidden again -> pending again', b.api.pending().length === 1 && n === 2);
  b.clicks.forEach(fn => fn());   // click net: rAF is synchronous in the sandbox
  check('a click while still hidden runs nothing', n === 2 && b.api.pending().length === 1);
  e.visible = true; b.clicks.forEach(fn => fn());
  check('a click once visible runs the pending render', n === 3 && b.api.pending().length === 0);
}

console.log('[L5b] the visibility answer is cached until the next frame, dropped at flush/settle');
{
  const b = boot(SRC);
  let asks = 0; const e = b.el('h', false, 'view-x'); e.checkVisibility = function () { asks++; return this.visible; };
  b.ctx.requestAnimationFrame = () => {};   // hold the frame open
  b.api.defer('h', 'r', []); b.api.defer('h', 'r', []); b.api.defer('h', 'r', []);
  check('three asks in one frame -> one checkVisibility', asks === 1, String(asks));
  e.visible = true; let n = 0; b.ctx.r = () => { n++; };
  check('flush drops the cache and sees the change', b.api.flush() === 1 && n === 1 && asks === 2, asks + '/' + n);
  b.api._dropCache(); e.visible = false;
  b.api.defer('h', 'r', []); check('after the frame the answer is asked again', asks === 3 && b.api.pending().length === 1);
}

console.log('[L6] kill switch and error containment');
{
  const b = boot(SRC); b.el('h', false, 'view-x');
  b.ctx.SL_LAZY_OFF = true;
  check('SL_LAZY_OFF -> defer is a no-op', b.api.defer('h', 'r', []) === false && b.api.pending().length === 0);
  b.ctx.SL_LAZY_OFF = false;
  b.els['boom'] = { id: 'boom', ownerDocument: {}, checkVisibility() { throw new Error('x'); } };
  check('a host whose visibility throws renders (false, no throw)', b.api.defer('boom', 'r', []) === false);
  b.api.defer('h', 'r', []); b.ctx.r = () => { throw new Error('render failed'); };
  let threw = false; try { b.api.settle('h'); } catch (_) { threw = true; }
  check('a throwing render is contained', !threw && b.api.pending().length === 0);
  check('stats shape', JSON.stringify(Object.keys(b.api.stats()).sort()) === '["deferred","direct","pending","ran"]');
}

console.log('[L7] wiring in index.html');
{
  const tags = IDX.match(/<script src="[^"]+" defer><\/script>/g) || [];
  const i = tags.findIndex(t => /error_watch\.js/.test(t)), j = tags.findIndex(t => /lazy_render\.js/.test(t));
  check('lazy_render.js is a deferred script', j >= 0);
  check('it loads right after error_watch.js', j === i + 1, `error_watch at ${i}, lazy_render at ${j}`);
  const first = tags.findIndex(t => /helpers_modules\.js|support_modules\.js|fta_view_modules\.js/.test(t));
  check('before every gated module', first > j);
}

console.log('[L8] the gated renderers, their hosts, and their views');
const GATED = [
  ['helpers_modules.js',   'renderACFHA',           'ac-fha-body',             'ac-fha'],
  ['helpers_modules.js',   'renderACAssumptions',   'ac-asm-body',             'ac-asm'],
  ['helpers_modules.js',   'renderFlightPhases',    'phases-body',             'phases'],
  ['helpers_modules.js',   'renderSysFHA',          'sys-fha-body',            'sys-workspace'],
  ['support_modules.js',   'renderSysAssumptions',  'sys-asm-body',            'sys-workspace'],
  ['helpers_modules.js',   'renderMacPage',         'mac-host',                'mac'],
  ['fta_quant_modules.js', 'renderMarkovModels',    'markov-models-container', 'markov'],
  ['helpers_modules.js',   'renderInterdepPage',    'interdep-host',           'interdep'],
  ['helpers_modules.js',   'renderCoffePanel',      'coffe-host',              'pasa'],
  ['helpers_modules.js',   'renderSystemDirectory', 'sys-directory-grid',      'sys-dir'],
  ['helpers_modules.js',   'renderMfmsPanel',       'mfms-host',               'pasa'],
  ['helpers_modules.js',   'renderItems',           'item-body',               'items'],
  ['helpers_modules.js',   'renderCockpitPage',     null,                      null],   // host is 'ckpt-page-' + key, built at run time
  ['fta_view_modules.js',  'renderFTASidebar',      'fta-sidebar-list',        'fta'],
  ['fta_view_modules.js',  'updateD3',              'fta-svg',                 'fta'],
];
{
  const views = []; IDX.replace(/<(?:div|section)[^>]*id="view-([\w-]+)"/g, (m, v, off) => { views.push([off, v]); return m; });
  const viewOf = id => { const m = IDX.indexOf('id="' + id + '"'); if (m < 0) return null; let best = null; for (const [off, v] of views) if (off < m) best = v; return best; };
  const srcs = {};
  for (const [file, name, host, view] of GATED) {
    const s = srcs[file] || (srcs[file] = read(file));
    const m = new RegExp('^function ' + name + '\\s*\\(([^)]*)\\)\\s*\\{\\s*\\n\\s*if \\(typeof SLLazy !== \'undefined\' && SLLazy\\.defer\\((.+?), \'' + name + '\', arguments\\)\\) return;', 'm').exec(s);
    check(name + ' gate is the first statement, by its own name', !!m, file);
    if (!m) continue;
    if (host) {
      check(name + ' host literal is ' + host, m[2] === "'" + host + "'", m[2]);
      check(host + ' lives in view-' + view, viewOf(host) === view, String(viewOf(host)));
    } else {
      check(name + ' host is built from its key', /ckpt-page-/.test(m[2]), m[2]);
    }
  }
  // Exactly this list — a new gate must be read for side effects and added here.
  let total = 0; for (const f of ['helpers_modules.js', 'support_modules.js', 'fta_quant_modules.js', 'fta_view_modules.js', 'misc_fn_modules.js', 'data_ops_modules.js', 'bindings_modules.js', 'safety_lab.js'])
    total += (read(f).match(/SLLazy\.defer\(/g) || []).length;
  check('exactly ' + GATED.length + ' gates across the app modules', total === GATED.length, String(total));
}

console.log('[L9] arrival hooks and export settles');
{
  const sup = read('support_modules.js'), misc = read('misc_fn_modules.js'), dop = read('data_ops_modules.js');
  const st = sup.slice(sup.indexOf('function switchTab('), sup.indexOf('Phase 53.70'));
  check('switchTab flushes after showing the view', /SLLazy\.flush\(\)/.test(st) && st.indexOf('SLLazy.flush()') > st.indexOf("tabId === 'fta'"));
  const ps = misc.slice(misc.indexOf('function pasaSub('), misc.indexOf('function pasaSub(') + 3000);
  check('pasaSub flushes after showing the lane', /SLLazy\.flush\(\)/.test(ps) && ps.indexOf('SLLazy.flush()') > ps.indexOf("name === 'coffe'"));
  const settles = (dop.match(/SLLazy\.settle\('fta-svg'\)/g) || []).length;
  check('both fault-tree exports settle the canvas before reading it', settles === 2, String(settles));
  const svgReads = (dop.match(/getElementById\('fta-svg'\)/g) || []).length;
  check('no fault-tree canvas read in data_ops without a settle', svgReads === settles, `${svgReads} reads, ${settles} settles`);
}

console.log('[L11] every companion wrapper around a gated renderer stands down when the original was deferred');
{
  const names = GATED.map(g => g[1]);
  const files = fs.readdirSync(SITE).filter(f => f.endsWith('.js') && !f.startsWith('__') && f !== 'lazy_render.js');
  let wraps = 0, missing = [];
  for (const f of files) {
    const s = read(f);
    // a wrapper site: `window.<gated> = <something not the bare function>` followed within 40 lines by orig.apply
    const re = new RegExp('(?:window|w)\\.(' + names.join('|') + ')\\s*=(?!=)\\s*(?!' + names.join('|') + '\\s*;)', 'g');
    let m;
    while ((m = re.exec(s))) {
      const before = s.slice(Math.max(0, m.index - 6000), m.index + 200);
      if (!/orig\d?\.apply\(this, arguments\)/.test(before)) continue;   // an alias, not a wrapper
      wraps++;
      const body = before.slice(before.lastIndexOf('.apply(this, arguments)') - 600);
      if (!/SLLazy\.skipped\(/.test(body)) missing.push(f + ' -> ' + m[1]);
    }
  }
  // thread_bridge wraps by name through w[fn]; count it by hand
  const tb = read('thread_bridge.js');
  wraps++; if (!/SLLazy\.skipped\(fn === 'renderACAssumptions'/.test(tb)) missing.push('thread_bridge.js -> renderACAssumptions/renderSysAssumptions');
  check('every wrapper of a gated renderer asks SLLazy.skipped() after orig.apply (' + wraps + ' wrappers)', missing.length === 0 && wraps === 11, missing.join(', ') || String(wraps));
  const b = boot(SRC); b.el('h', false, 'view-x');
  check('skipped() is false with nothing pending', b.api.skipped('h') === false);
  b.api.defer('h', 'r', []);
  check('skipped() is true while the render is pending', b.api.skipped('h') === true);
  b.ctx.r = () => {}; b.api.settle('h');
  check('and false again once it ran', b.api.skipped('h') === false);
}

console.log('[L10] mutations');
{
  const inv = SRC.replace("return !el.checkVisibility();", "return el.checkVisibility();");
  const b = boot(inv); b.el('vis', true, 'view-x');
  check('hidden() inverted -> a visible host is wrongly deferred (L1 would go red)', b.api.defer('vis', 'r', []) === true);
  const s = read('helpers_modules.js').replace(/\n\s*if \(typeof SLLazy !== 'undefined' && SLLazy\.defer\('ac-fha-body', 'renderACFHA', arguments\)\) return;[^\n]*/, '');
  check('gate removed -> the L8 pattern no longer matches', !/^function renderACFHA\(\)\s*\{\s*\n\s*if \(typeof SLLazy/m.test(s));
}

console.log('\n' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'PASS ' + pass + ' / ' + pass));
process.exit(fail ? 1 : 0);
