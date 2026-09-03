#!/usr/bin/env node
/*
 * Regression — the Golden Thread must zoom, not just pan.
 *
 * Roadmap #14 asked for "zoom/pan, click-to-modal, always-on provenance badges".
 * Three of those shipped; zoom did not, and the card stayed open for weeks with
 * no note saying which quarter of it was missing. _gtEnablePan() was scroll-drag
 * only, and the single d3.zoom() in the file belongs to the legacy Sankey
 * fallback that never runs on the shipping path.
 *
 * The implementation leans on a specific property of GT_THREAD's output: it
 * emits <svg viewBox="0 0 W H" width="W"> with NO height attribute, so the
 * viewBox fixes the aspect ratio and the rendered size follows `width` alone.
 * Scaling is one attribute write — no transform wrapper, no re-layout, so node
 * hit-boxes and the click-to-modal wiring are untouched. If that output shape
 * ever changes, the zoom silently stops working, so this suite pins it.
 *
 * Run: node tests/regression_gt_zoom.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const sup = S('support_modules.js');
const gt  = S('gt_thread.js');
const idx = S('index.html');

// ---- the contract the zoom depends on --------------------------------------
check('GT_THREAD still emits a viewBox with a width and no height',
  /<svg viewBox="0 0 ' \+ W \+ ' ' \+ H \+ '" width="' \+ W \+ '"/.test(gt),
  'zoom scales the width attribute and relies on viewBox for the aspect ratio');

// ---- the zoom exists and is wired ------------------------------------------
check('the scaler exists', /function _gtZoomApply\(host, scale, anchor\)/.test(sup));
check('zoom writes the svg width, not a transform',
  /svg\.setAttribute\('width', String\(base \* next\)\)/.test(sup),
  'a transform wrapper would move the node hit-boxes away from the click handlers');
check('scale is clamped', /Math\.max\(0\.4, Math\.min\(3, scale\)\)/.test(sup));
check('zoom is anchored so the point under the cursor stays put',
  /cx \* r - ax/.test(sup) && /cy \* r - ay/.test(sup));
check('ctrl/cmd + wheel zooms', /if\(!\(ev\.ctrlKey \|\| ev\.metaKey\)\) return;/.test(sup));
check('a plain wheel is left alone to scroll', /plain wheel keeps scrolling/.test(sup));
check('the wheel listener is non-passive so preventDefault works',
  /\{ passive: false \}/.test(sup));

['gtZoomIn', 'gtZoomOut', 'gtZoomFit', 'gtZoomReset'].forEach(fn =>
  check(fn + ' is defined', new RegExp('function ' + fn + '\\(').test(sup)));

// ---- the controls are actually reachable in the UI -------------------------
['gtZoomIn()', 'gtZoomOut()', 'gtZoomFit()', 'gtZoomReset()'].forEach(fn =>
  check('index.html wires ' + fn, idx.indexOf(fn) >= 0));
check('there is a live zoom readout', /id="gt-zoom-label"/.test(idx));

// ---- zoom must survive a re-render ------------------------------------------
check('the base width is re-read after every render',
  /host\.dataset\.gtBaseW = _svg\.getAttribute\('width'\)/.test(sup),
  'GT_THREAD rewrites innerHTML, so a cached width goes stale');
check('the user zoom is re-applied after a re-render',
  /const _keep = parseFloat\(host\.dataset\.gtScale \|\| '1'\)/.test(sup),
  'otherwise changing the function selection silently resets zoom to 100%');

// ---- behavioural: the maths ------------------------------------------------
const src = (sup.match(/function _gtZoomApply[\s\S]*?\n\}/) || [])[0];
check('the scaler body was located', !!src);
if (src) {
  const mkHost = (scale, w, h) => {
    const svg = { attrs: { width: '1000' }, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } };
    return { dataset: { gtBaseW: '1000', gtScale: String(scale) }, clientWidth: w, clientHeight: h,
             scrollLeft: 0, scrollTop: 0, querySelector: () => svg, _svg: svg };
  };
  const ctx = { document: { getElementById: () => null }, Math, parseFloat, String, console };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);

  let host = mkHost(1, 800, 600);
  ctx._gtZoomApply(host, 2, null);
  check('zooming to 2x doubles the rendered width', host._svg.getAttribute('width') === '2000');
  check('the scale is recorded', host.dataset.gtScale === '2');

  host = mkHost(1, 800, 600); host.scrollLeft = 100; host.scrollTop = 50;
  ctx._gtZoomApply(host, 2, { x: 400, y: 300 });
  // content point under cursor was 500,350 -> at 2x it is 1000,700 -> scroll 600,400
  check('the anchored point stays under the cursor',
    host.scrollLeft === 600 && host.scrollTop === 400,
    `got ${host.scrollLeft},${host.scrollTop}`);

  host = mkHost(1, 800, 600);
  ctx._gtZoomApply(host, 99, null);
  check('zoom is clamped at 3x', host.dataset.gtScale === '3');
  ctx._gtZoomApply(host, 0.01, null);
  check('zoom is clamped at 0.4x', host.dataset.gtScale === '0.4');

  host = mkHost(1, 800, 600);
  const before = host._svg.getAttribute('width');
  ctx._gtZoomApply(host, 1.0001, null);
  check('a no-op zoom does not touch the DOM', host._svg.getAttribute('width') === before);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
