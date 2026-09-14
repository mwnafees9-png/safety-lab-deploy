#!/usr/bin/env node
/*
 * Regression — marketing routes + RFC 9116 security.txt (worker.js).
 *
 *   [1] security.txt: served inline from the Worker at BOTH the well-known and
 *       legacy paths, correct content type, every RFC 9116 required field, and
 *       an Expires date that is checked for staleness BEFORE it bites.
 *   [2] Every internal link on landing.html actually resolves. This suite exists
 *       because three of them did not: /security, /tools and /templates all had
 *       their .html files shipped but were never added to the Worker's
 *       CONTENT_PAGES allowlist. They fell through to the assets binding, missed,
 *       and `not_found_handling: "single-page-application"` returned 200 plus the
 *       APP SHELL. A visitor clicking "Trust & security" landed inside the
 *       application. Nothing flagged it, because a 200 logs as success.
 *   [3] Allowlist integrity: every routed slug has a file behind it.
 *   [4] /security → /trust is redirected, so old links keep resolving.
 *
 * Run: node tests/regression_marketing_routes.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const ROOT = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const w = ROOT('worker.js');
const landing = S('landing.html');

// ---- [1] security.txt — RFC 9116 ----------------------------------------------
const txtBlock = (w.match(/const SECURITY_TXT = \[([\s\S]*?)\]\.join\('\\n'\)/) || [, ''])[1];
const lines = [...txtBlock.matchAll(/'([^']*)'/g)].map(m => m[1]);
const field = name => lines.filter(l => l.toLowerCase().startsWith(name.toLowerCase() + ':'))
                           .map(l => l.slice(name.length + 1).trim());

check('security.txt is served from the Worker, not from an asset file',
  /SECURITY_TXT/.test(w) && lines.length > 0,
  'inline so it cannot 404 behind asset config — dot-directories are an assets footgun');
check('served at the RFC 9116 well-known path AND the legacy root path',
  /path === '\/\.well-known\/security\.txt'/.test(w) && /path === '\/security\.txt'/.test(w));
check('served as text/plain; charset=utf-8',
  /content-type':\s*'text\/plain;\s*charset=utf-8'/.test(w));

check('RFC 9116: at least one Contact field', field('Contact').length >= 1,
  field('Contact').length + ' found');
check('RFC 9116: Expires field present (required)', field('Expires').length === 1);

const expRaw = field('Expires')[0];
const expMs = expRaw ? Date.parse(expRaw) : NaN;
const daysOut = Math.round((expMs - Date.now()) / 864e5);
check('Expires parses as a date', Number.isFinite(expMs), String(expRaw));
// The staleness tripwire. RFC 9116 says a security.txt past its Expires date
// "should not be used" — an expired file is worse than none, because a
// researcher reads it, believes it, and reports nowhere. 30 days of warning.
check('Expires is more than 30 days out (staleness tripwire)',
  Number.isFinite(expMs) && daysOut > 30,
  Number.isFinite(expMs) ? daysOut + ' days remaining — RENEW IT' : 'unparseable');
check('Expires is no more than a year out (RFC 9116 recommendation)',
  Number.isFinite(expMs) && daysOut <= 366, daysOut + ' days');

check('Canonical points at the well-known path',
  (field('Canonical')[0] || '').endsWith('/.well-known/security.txt'));

// A Policy field that 404s sends researchers to a dead page. Prove the target
// is a route the Worker actually serves.
const CONTENT_PAGES = new Set(
  [...(w.match(/CONTENT_PAGES = new Set\(\[([\s\S]*?)\]\)/) || [, ''])[1].matchAll(/'([a-z0-9-]+)'/g)].map(m => m[1]));
const policySlug = (field('Policy')[0] || '').replace(/^https?:\/\/[^/]+\/?/, '').replace(/\/$/, '');
check('Policy target is a route the Worker serves, not a dead link',
  !policySlug || CONTENT_PAGES.has(policySlug),
  'Policy → /' + policySlug);
check('Policy target has a file behind it',
  !policySlug || fs.existsSync(path.join(__dirname, '..', 'site', policySlug + '.html')),
  policySlug + '.html');

// ---- [2] every internal landing link resolves ----------------------------------
// Routes the Worker handles explicitly rather than through CONTENT_PAGES.
const EXPLICIT = new Set(['app', 'security']);
const hrefs = [...new Set([...landing.matchAll(/href="\/([a-z0-9-]+)"/g)].map(m => m[1]))];
const broken = hrefs.filter(h => !EXPLICIT.has(h) && !CONTENT_PAGES.has(h));
check('every internal landing-page link is routed (no silent app-shell 200s)',
  broken.length === 0, broken.map(b => '/' + b).join(', '));
check('landing page actually has internal links to check (guard)', hrefs.length >= 5,
  hrefs.length + ' found');

// ---- [3] allowlist integrity ---------------------------------------------------
const orphanRoutes = [...CONTENT_PAGES].filter(s => !fs.existsSync(path.join(__dirname, '..', 'site', s + '.html')));
check('every allowlisted slug has a .html file behind it',
  orphanRoutes.length === 0, orphanRoutes.join(', '));

// ---- [4] the /security → /trust redirect ---------------------------------------
check('/security redirects (trust.html supersedes security.html)',
  /path === '\/security'/.test(w) && /Response\.redirect\(url\.origin \+ '\/trust', 301\)/.test(w));

// ---- [5] sitemap coverage ------------------------------------------------------
// A routed page missing from the sitemap is a page search engines never see.
// /tools and /templates are TOP-NAV items and were both absent (30 Jul), along
// with /trust and /legal. Search performance is a tracked channel here, so the
// sitemap earns a tripwire rather than a periodic manual audit.
const sitemap = S('sitemap.xml');
const missingFromSitemap = [...CONTENT_PAGES]
  .filter(s => sitemap.indexOf('safetylabaero.com/' + s + '<') < 0);
check('every routed content page is in sitemap.xml',
  missingFromSitemap.length === 0, missingFromSitemap.map(s => '/' + s).join(', '));
check('sitemap entries all carry a lastmod',
  (sitemap.match(/<url>/g) || []).length === (sitemap.match(/<lastmod>/g) || []).length,
  (sitemap.match(/<url>/g) || []).length + ' urls');
check('robots.txt points at the sitemap',
  /^Sitemap:\s*https:\/\/safetylabaero\.com\/sitemap\.xml/m.test(S('robots.txt')));

// ---- [6] no orphan pages -------------------------------------------------------
// trust.html shipped with NO internal links at all — no nav, no footer, no logo
// link. A visitor (or a security reviewer you sent the link to) landed there and
// the only way out was the back button. It was the only page on the site like it.
const noWayHome = [...CONTENT_PAGES].filter(slug => {
  try { return S(slug + '.html').indexOf('href="/"') < 0; } catch (_) { return false; }
});
check('every content page has a link back to the site', noWayHome.length === 0,
  noWayHome.map(s => '/' + s).join(', '));

// A page reachable only from the footer of one page is barely reachable. The trust
// page is what gets sent to security reviewers — it belongs in the top nav.
const navMenu = (landing.match(/<div class="nav-more-menu"[\s\S]*?<\/div>/) || [''])[0];
check('trust page is reachable from the landing top nav, not just the footer',
  navMenu.indexOf('href="/trust"') >= 0);

// ---- [5] /demo → Outlook Bookings ----------------------------------------------
// A short branded address for the booking page, because the raw Outlook URL is 168
// characters — too long for a LinkedIn connection note and unusable in a signature.
//
// The 302 is the check that matters. Outlook regenerates the meetingtype id whenever
// the booking type is edited, and a 301 is cached by the browser indefinitely: the day
// that id changes, everyone who ever clicked /demo is pinned to a dead URL they cannot
// clear. /security → /trust is a 301 precisely because its target CANNOT move. Asserting
// the number here keeps that distinction from being "corrected" into consistency later.
check('/demo is routed', /path === '\/demo'/.test(w) && /path === '\/demo\/'/.test(w));
check('/demo redirects to the booking URL constant',
  /Response\.redirect\(BOOKING_URL, 302\)/.test(w));
check('/demo is a 302, NOT a 301 — the booking id is regenerated by Outlook',
  !/Response\.redirect\(BOOKING_URL, 301\)/.test(w));
check('BOOKING_URL is a named constant, so a regenerated id is a one-line fix',
  /^const BOOKING_URL = 'https:\/\/outlook\.office\.com\/bookwithme\//m.test(w));
// `anonymous` is what lets an invitee book without a Microsoft account. It has been
// dropped once already by someone tidying the URL; pinned so it cannot happen quietly.
check('the booking URL keeps its anonymous param',
  /BOOKING_URL = '[^']*[?&]anonymous(&|')/.test(w));

// ---- [5] no external font hot-links (R10) --------------------------------------
// Google Fonts links/preconnects leak a request to Google on any self-hosted (ITAR) install and
// are CSP-blocked on the hosted site anyway. Pinned so they cannot return.
console.log('\n[5] no external font hot-links on any page');
{
  const glob = require('fs').readdirSync(path.join(__dirname, '..', 'site')).filter(f => f.endsWith('.html'));
  const offenders = glob.filter(f => /fonts\.googleapis|fonts\.gstatic/.test(S(f)));
  check('no site/*.html references fonts.googleapis / fonts.gstatic (' + glob.length + ' pages)', offenders.length === 0, offenders.join(', '));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
