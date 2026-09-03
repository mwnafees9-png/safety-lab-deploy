#!/usr/bin/env node
/*
 * Regression: landing highlight + transfer-gate navigation (build 66.11).
 *
 * TWO REPORTS, 18 Aug 2026:
 *   • "when we are clicking anything on the thread to take us to the origin source
 *      once there it should be explicitly highlighted so the user knows what they
 *      are looking for" — landings were a 1.6s pale flash, and fault-tree/system
 *      destinations were not marked AT ALL.
 *   • "when you double click a transfer gate it should take you to the tree you are
 *      transferring to" — reproduced live: the first click opens the properties
 *      panel, that re-renders the canvas, and the native dblclick pair never
 *      completes on the replaced element, so nothing happened.
 *
 * Loads the REAL sources. Run:  node tests/regression_landing_highlight.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
function slice(file, start, end) {
  const src = read(file);
  const a = src.indexOf(start), b = src.indexOf(end, a + 1);
  if (a < 0 || b < 0) throw new Error('markers not found in ' + file);
  return src.slice(a, b);
}


// House rule (SL §7.3): pins are FLOORS, never literals — a literal breaks on the
// next legitimate bump, which is exactly what happened to this suite one batch
// after it was written. Compare major.minor as INTEGERS: parseFloat('72.10') is
// 72.1, which would silently read as older than 72.5.
function pinAtLeast(src, file, wantMajor, wantMinor) {
  const m = src.match(new RegExp(file.replace('.', '\\.') + '\\?v=(\\d+)\\.(\\d+)'));
  if (!m) return false;
  const maj = parseInt(m[1], 10), min = parseInt(m[2], 10);
  return maj > wantMajor || (maj === wantMajor && min >= wantMinor);
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

console.log('\n[1] The double-click window is keyed on the NODE, not the DOM element');
{
  const src = slice('fta_view_modules.js', 'var _ftaLastNodeClick = null;', 'function syncFTAConfig');
  const F = new Function(src + '; return { isDouble: _ftaClickIsTransferDouble, reset: () => { _ftaLastNodeClick = null; } };')();
  const gate = { id: 7147, gateType: 'TRANSFER', linkedPageId: 'pg-nzd-open' };
  F.reset();
  check('first click on a transfer gate is not a double', F.isDouble(gate, 1000) === false);
  check('second click 200ms later IS a double', F.isDouble(gate, 1200) === true);
  F.reset();
  F.isDouble(gate, 1000);
  check('second click 900ms later is NOT a double', F.isDouble(gate, 1900) === false);
  F.reset();
  F.isDouble(gate, 1000);
  check('a click on a DIFFERENT node does not count as the pair',
    F.isDouble({ id: 7148, gateType: 'TRANSFER', linkedPageId: 'pg-x' }, 1100) === false);
  F.reset();
  check('an ordinary gate never arms the transfer hop',
    F.isDouble({ id: 1, gateType: 'OR' }, 1000) === false && F.isDouble({ id: 1, gateType: 'OR' }, 1100) === false);
  check('a transfer-OUT node (no linkedPageId) still arms it',
    (F.reset(), F.isDouble({ id: 5, transferOutTo: 'pg-y' }, 1000), F.isDouble({ id: 5, transferOutTo: 'pg-y' }, 1100)) === true);
}

console.log('\n[2] Both routes funnel into ONE navigator');
{
  const view = read('fta_view_modules.js');
  check('ftaOpenTransferTarget exists', /function ftaOpenTransferTarget\(/.test(view));
  check('the click route calls it', /_ftaClickIsTransferDouble\(d\.data, Date\.now\(\)\)[\s\S]{0,180}ftaOpenTransferTarget\(d\.data\)/.test(view));
  check('the dblclick route calls it too', /gateType === 'TRANSFER' && d\.data\.linkedPageId\) \|\| d\.data\.transferOutTo\)[\s\S]{0,220}ftaOpenTransferTarget\(d\.data\)/.test(view));
  check('the old inline dblclick body is gone (no drift between the two routes)',
    !/dblclick[\s\S]{0,400}activeFTAPageId = d\.data\.linkedPageId/.test(view));
  check('a dangling transfer target is reported, not silently ignored',
    /no longer exists/.test(view));
  check('the panel Go button shares the same navigator',
    /function jumpToTransferTree\(\)[\s\S]{0,400}ftaOpenTransferTarget\(selectedNodeData\)/.test(read('helpers_modules.js')));
  check('arriving on a transferred tree marks the top event',
    /TRANSFERRED HERE/.test(view));
}

console.log('\n[3] The landing mark persists — it is not a flash any more');
{
  const mfn = read('misc_fn_modules.js');
  check('_slClearLanding / _slArmLandingDismiss exist',
    /function _slClearLanding\(/.test(mfn) && /function _slArmLandingDismiss\(/.test(mfn));
  check('the 1.6s auto-clear is gone', !/1600\)/.test(mfn.slice(mfn.indexOf('function _highlightArtifactRow'), mfn.indexOf('function _highlightArtifactRow') + 2000)));
  // 25 Aug 2026 — SUPERSEDED. Waqas: "the item i clicked highlighting needs to
  // be for 10 seconds not a flash". This suite already won this fight once (the
  // 1.6s auto-clear above) and the answer then was "clear on interaction, not on
  // a timer". That answer is what broke it the second time: WHEEL was in the
  // dismiss set, so scrolling to look at the row you had just been sent to
  // killed the highlight showing you where you landed. Scrolling to read the
  // thing is not "I have moved on" — it is the opposite.
  // The rule now: a fixed ten seconds; wheel never dismisses; a deliberate
  // click or keypress still does, but only after a grace window so the tail of
  // the interaction that CAUSED the landing cannot kill it.
  check('scrolling never dismisses the landing — wheel is out of the dismiss set',
    /\['pointerdown', 'keydown'\]\.forEach\(ev => \{ try \{ document\.addEventListener/.test(mfn) &&
    !/'wheel'/.test(mfn));
  check('a deliberate click still dismisses it, after a grace window',
    /_slLandingArmedAt/.test(mfn) && /< 1200\) return;/.test(mfn));
  check('the hold is exactly the ten seconds asked for',
    /setTimeout\(_slClearLanding, 10000\)/.test(mfn));
  check('the pulse runs the whole ten seconds on BOTH surfaces (rows + tree nodes)', (() => {
    const css = read('safety_lab.css');
    return (css.match(/sl-landed-pulse 1\.25s ease-out 8/g) || []).length === 2 &&
      !/sl-landed-pulse 1\.15s ease-out 3/.test(css);
  })());
  check('the destination carries a badge saying why it is marked',
    /THE ITEM YOU CLICKED/.test(mfn) && /function _slLandingBadge\(/.test(mfn));
  check('canvas nodes can be marked too', /function _slHighlightFtaNode\(/.test(mfn));
}

console.log('\n[4] The destinations that used to land silently now mark themselves');
{
  const helpers = read('helpers_modules.js');
  const bind = read('bindings_modules.js');
  check('golden thread → fault tree marks the top event',
    /case 'ftaPage':[\s\S]{0,700}_slHighlightFtaNode/.test(helpers));
  check('golden thread → system workspace marks the row',
    /case 'system':[\s\S]{0,220}hl\('system', r\.id/.test(helpers));
  check('jumpToArtifact marks an ftaNode on the canvas',
    /kind === 'ftaNode'[\s\S]{0,160}_slHighlightFtaNode\(id\)/.test(bind));
  check('jumpToArtifact still falls back to the row highlight',
    /_highlightArtifactRow\(kind, id\)/.test(bind));
}

console.log('\n[5] Styling is pinned and respects reduced motion');
{
  const css = read('safety_lab.css');
  check('.node.landed-highlight defined', /\.node\.landed-highlight/.test(css));
  check('.sl-landed row treatment defined', /tr\.sl-landed > td/.test(css));
  check('badge style defined', /\.sl-landed-badge/.test(css));
  check('prefers-reduced-motion disables the pulse',
    /prefers-reduced-motion[\s\S]{0,320}animation: none/.test(css));
  const html = read('index.html');
  check('cache pins at or past this batch for every file it touched',
    pinAtLeast(html, 'safety_lab.css', 65, 40) && pinAtLeast(html, 'misc_fn_modules.js', 66, 29) &&
    pinAtLeast(html, 'fta_view_modules.js', 66, 24) && pinAtLeast(html, 'helpers_modules.js', 2, 31) &&
    pinAtLeast(html, 'bindings_modules.js', 1, 17));
}

console.log('\n' + (fail === 0
  ? 'ALL GREEN — ' + pass + ' checks'
  : fail + ' FAILED, ' + pass + ' passed'));
process.exit(fail === 0 ? 0 : 1);
