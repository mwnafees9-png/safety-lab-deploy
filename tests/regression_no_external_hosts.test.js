#!/usr/bin/env node
/*
 * Regression — a build loads NOTHING from outside itself (16 Sep 2026).
 *
 * WHAT HAPPENED. The app pulled nine libraries from four CDNs: d3js.org and cdn.jsdelivr.net as
 * blocking <script> tags on every page load, and cdnjs.cloudflare.com and unpkg.com on demand when
 * a user exported to Excel/PDF/Word or imported a .docx/.pdf. Three separate failures came out of
 * the one cause:
 *
 *   1. A customer-hosted install contacted four addresses that appear nowhere on the egress list
 *      SL-DG-0001 section 7.2 tells the customer is EVERY address the app contacts. Same shape as
 *      the corpus-endpoint leak found the same day, without the customer data riding along.
 *   2. The DESKTOP app was already broken by it and nobody knew. Its egress allowlist admits only
 *      the configured backend and AI endpoint (shell_rules.allowedHosts), so all six on-demand
 *      loads were refused by our own shell: Excel export, PDF export, Word export, .docx import
 *      and .pdf import simply failed. patch-index.py rewrote the three <script> tags to local
 *      copies and NOTHING rewrote the six that load from JavaScript.
 *   3. An air-gapped install could not work at all.
 *
 * The most instructive detail: ai_assistant.js ALREADY had the right pattern, a vendored path
 * tried first and the CDN second. But nobody ever put the file in site/vendor/, so the first entry
 * 404'd on every single call and the CDN was the only path that ever ran. A fallback hid a missing
 * file for months. That is why check [4] exists, and why the fallbacks are gone rather than
 * reordered: a fallback that fires when a local file is missing is a silent reach-out no guard can
 * see. A missing vendored file must fail loudly, naming the file.
 *
 * Run: node tests/regression_no_external_hosts.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };

const REPO = path.join(__dirname, '..');
const SITE = path.join(REPO, 'site');
const DIST = path.join(REPO, 'dist');

// Hosts we have ever loaded code from, plus the ones a future contributor is most likely to reach
// for. A NEW host is the thing to fear, so checks [1] and [2] are written to catch any absolute
// URL in a resource position; this list is the belt to their braces.
const CDN_HOSTS = [
  'd3js.org', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com',
  'esm.sh', 'cdn.skypack.dev', 'ajax.googleapis.com', 'fonts.googleapis.com', 'fonts.gstatic.com',
];

// Files that SHIP. site/vendor holds the vendored libraries themselves, which legitimately contain
// URLs in their own comments and source-map hints; scanning them would be scanning third-party code.
function shipping(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /\.(js|html)$/.test(f))
    .map((f) => ({ name: f, text: fs.readFileSync(path.join(dir, f), 'utf8') }));
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*|<!--)/.test(l)).join('\n');

// ---- [1] no absolute URL in a RESOURCE position in any page ------------------------------------
// <a href="https://..."> is a link the user clicks and is fine. <script src>, <link href>,
// <iframe src> and <img src> are fetches the browser makes on its own.
console.log('\n[external] pages fetch nothing from outside the build');
const RESOURCE = /<(script|link|iframe|img)\b([^>]*?)\b(?:src|href)=["'](https?:\/\/[^"']+)["']/gi;
// rel=canonical / alternate / me are metadata: they tell a search engine where the page lives and
// fetch nothing. Every other <link> rel does fetch (stylesheet, preload, preconnect, icon,
// manifest), so an absolute URL there is a real outbound request and must fail.
const NON_FETCHING_REL = /\brel=["'](canonical|alternate|me)["']/i;
for (const f of shipping(SITE)) {
  if (!/\.html$/.test(f.name)) continue;
  const hits = [...f.text.matchAll(RESOURCE)]
    .filter((m) => !(m[1].toLowerCase() === 'link' && NON_FETCHING_REL.test(m[2])))
    .map((m) => m[3]);
  check('site/' + f.name + ' loads no external resource', hits.length === 0, hits.join(' '));
}

// ---- [2] no script element pointed at an absolute URL from JavaScript ---------------------------
console.log('\n[external] no script or worker is pointed at an absolute URL from code');
const ASSIGN = /\.(src|workerSrc|href)\s*=\s*["'`](https?:\/\/[^"'`]+)["'`]/g;
let assignHits = [];
for (const f of shipping(SITE)) {
  if (!/\.js$/.test(f.name)) continue;
  for (const m of stripComments(f.text).matchAll(ASSIGN)) assignHits.push(f.name + ': ' + m[2]);
}
check('no .src / .workerSrc assignment names an absolute URL', assignHits.length === 0, assignHits.join(' | '));

// ---- [3] the named CDNs appear nowhere in shipping code ----------------------------------------
console.log('\n[external] the CDNs we used to load from are gone');
for (const host of CDN_HOSTS) {
  const where = [];
  for (const f of shipping(SITE)) if (stripComments(f.text).includes(host)) where.push(f.name);
  check(host + ' appears in no shipping file', where.length === 0, where.join(', '));
}

// ---- [4] every vendored path the code names actually EXISTS ------------------------------------
// The check that would have caught the original bug: ai_assistant.js named
// vendor/mammoth.browser.min.js for months while no such file existed.
console.log('\n[external] every vendor/ path the code names is a real file');
const VENDOR_REF = /["'`](vendor\/[A-Za-z0-9._-]+\.js)["'`]|src=["'](vendor\/[A-Za-z0-9._-]+\.js)["']/g;
const referenced = new Set();
for (const f of shipping(SITE)) for (const m of stripComments(f.text).matchAll(VENDOR_REF)) referenced.add(m[1] || m[2]);
check('the code references at least the libraries we vendored', referenced.size >= 10, [...referenced].join(' '));
for (const ref of [...referenced].sort()) {
  check(ref + ' exists in site/', fs.existsSync(path.join(SITE, ref)));
}

// ---- [5] the vendoring script is the one way those files arrive --------------------------------
console.log('\n[external] the vendored copies are reproducible, not hand-placed');
const vsh = path.join(REPO, 'vendor-libs.sh');
check('vendor-libs.sh exists', fs.existsSync(vsh));
if (fs.existsSync(vsh)) {
  const v = fs.readFileSync(vsh, 'utf8');
  const missing = [...referenced].filter((r) => !v.includes(path.basename(r)));
  // yjs predates the script and is committed on its own; everything else must be reproducible.
  const unexplained = missing.filter((m) => !/yjs/.test(m));
  check('every referenced vendor file is produced by vendor-libs.sh', unexplained.length === 0, unexplained.join(' '));
  check('versions are pinned in the script, so vendoring changes no behavior',
    /d3@7/.test(v) && /xlsx@0\.18\.5/.test(v) && /jspdf@2\.5\.1/.test(v) && /jszip@3\.10\.1/.test(v) &&
    /docx@8\.5\.0/.test(v) && /mammoth@1\.6\.0/.test(v) && /pdfjs-dist@3\.11\.174/.test(v));
}

// ---- [6] the BUILT output, when one is present -------------------------------------------------
// Source being clean is not the same as the thing we ship being clean; build.sh could drop a
// directory or a minifier could inline something. Check the artifact too when it exists.
if (fs.existsSync(DIST)) {
  console.log('\n[external] the BUILT output is clean too');
  const distHits = [];
  for (const f of shipping(DIST)) for (const host of CDN_HOSTS) if (f.text.includes(host)) distHits.push(f.name + ':' + host);
  check('no CDN host survives into dist/', distHits.length === 0, distHits.join(' '));
  for (const ref of [...referenced].sort()) check('dist/' + ref + ' was copied into the build', fs.existsSync(path.join(DIST, ref)));
} else {
  console.log('\n[external] (no dist/ present — source checks only)');
}

console.log('\n' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'PASS ' + pass + ' / ' + pass));
process.exit(fail ? 1 : 0);
