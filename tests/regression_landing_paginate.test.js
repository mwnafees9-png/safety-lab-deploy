#!/usr/bin/env node
/*
 * Regression — paginated landing sections (scroll-snap + dots rail).
 *   [1] snapping is PROXIMITY, never mandatory — long sections must never
 *       trap the reader; reduced-motion users get no snapping at all.
 *   [2] sections present as pages (min-height + snap-align + nav offset).
 *   [3] the dots rail is built from the real sections and labeled from
 *       their own headings — it cannot drift from the page.
 *   [4] mobile (<900px) gets no snap forcing and no rail.
 * Run: node tests/regression_landing_paginate.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const s = fs.readFileSync(path.join(__dirname, '..', 'site', 'landing.html'), 'utf8');

check('proximity snapping, never mandatory', /scroll-snap-type: y proximity/.test(s) && !/snap-type:\s*y\s+mandatory/.test(s));
check('snapping gated on desktop + motion preference', /min-width: 900px\) and \(prefers-reduced-motion: no-preference\)/.test(s));
check('sections present as pages (min-height 100svh minus nav, snap-align, scroll-margin)',
  /min-height: calc\(100svh - 56px\)/.test(s) && /scroll-snap-align: start/.test(s) && /scroll-margin-top: 56px/.test(s));
check('dots rail built FROM the sections, labeled from their own h1/h2',
  /querySelectorAll\('body > section'\)/.test(s) && /querySelector\('h1, h2'\)/.test(s) && /pgdots/.test(s));
check('active dot tracked by IntersectionObserver', /IntersectionObserver/.test(s) && /rootMargin: '-45% 0px -45% 0px'/.test(s));
check('mobile: rail hidden, no snap forcing', /@media \(max-width: 899px\) \{ \.pgdots \{ display: none; \} \}/.test(s));
check('footer snaps as the closing page', /body > footer \{ scroll-snap-align: end; \}/.test(s));

// TONED 13 Aug 2026 — the literal below moved on purpose, do not "restore" it.
// Saturation was cut 25-35% on the three bright stops (hues held) after the
// marketing review flagged the page as too sharp to read at length. It is also
// an accessibility fix: white body text on the FINAL stop measured 4.13:1
// against the old #AF52DE and measures 4.73:1 against #9B55BE — i.e. the bottom
// of the page went from failing WCAG AA for body text to passing it.
check('brand identity: light blue->purple hue wash, sections transparent, light scheme', /linear-gradient\(165deg, #e9edff 0%, #ffffff 46%, #f9f2ff 100%\)/.test(s) && /background: transparent !important/.test(s) && /color-scheme: light/.test(s));
// The "More" menu must NOT inherit the 7%-white glass surface: a small overlay
// sitting on the wash was unreadable (marketing review, 13 Aug). Opaque panel.
check('More dropdown is an opaque panel, not glass', /\.nav-more-menu\s*\{[^}]*background:\s*#ffffff\s*!important/.test(s) && /\.nav-more-menu a \{ color: #14171c !important/.test(s));
// One section must carry the focal treatment, and it must be the golden thread —
// the only section on the page that demonstrates rather than asserts.
check('golden thread carries the focal spotlight + live badge', /class="golden-thread section-spotlight"/.test(s) && /\.section-spotlight::before/.test(s) && /The golden thread &middot; live/.test(s));
check('white surfaces + dark clipped headline on light', /backdrop-filter: blur\(10px\)/.test(s) && /linear-gradient\(135deg, #007aff 0%, #af52de 100%\)/.test(s));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
