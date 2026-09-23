#!/usr/bin/env node
/*
 * Regression — the SEO read of 23 Sep 2026 (score 74/100), pinned so it cannot quietly come back.
 *
 * WHAT WAS FOUND. Four copies of the site (http, http://www, https://www, https) all answering 200;
 * /x.html and /x/ answering as duplicates with a temporary 307; a text/plain 9-byte 404; the homepage
 * not linking to three of the five topic pages; the company schema naming a person as the organization
 * and the offer marked PreOrder with no price; /legal saying "Loading…" (81 words) with the agreement
 * pulled in by script and no privacy policy anywhere; five descriptions over 160 chars and three titles
 * over 60; two islands of pages whose footers did not link to each other; no page for "functional
 * hazard assessment" and no page mentioning the competitor two customers left; no llms.txt.
 *
 * WHAT THIS PINS:
 *   [1] worker.js redirects every non-canonical address with a 301 and serves a branded 404 page;
 *   [2] every public page: one H1, title <= 60, description <= 160, self canonical, og/twitter, JSON-LD;
 *   [3] the homepage links to every topic page and to /privacy; Organization is the company; offers priced;
 *   [4] the generated footer is present and current on every page, and no page is a dead end;
 *   [5] /legal carries the agreement in its HTML (no script fetch); /privacy exists and is real;
 *   [6] the two new pages exist with FAQ schema; sitemap, worker allowlist and footer list agree;
 *   [7] llms.txt lists every public page; the ARP pages carry the unspaced spelling once;
 *   [8] no em dash anywhere in customer-facing copy on the new pages (house rule, see the sibling suite).
 *
 * Run: node tests/regression_seo_site.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..'); const SITE = path.join(ROOT, 'site');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const attr = (html, re) => { const m = html.match(re); return m ? m[1] : null; };
const visible = html => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');

const worker = R('worker.js');
const sitemapSrc = R('tools/seo/sitemap.mjs');
const footerSrc = R('tools/seo/footer.mjs');
const PAGES = [...sitemapSrc.matchAll(/url:\s*"([^"]+)",\s*file:\s*"([^"]+)"/g)].map(m => ({ url: m[1], file: m[2] }));
const allow = new Set([...(worker.match(/const CONTENT_PAGES = new Set\(\[([\s\S]*?)\]\);/) || [, ''])[1].matchAll(/'([a-z0-9-]+)'/g)].map(m => m[1]));

// ---- [1] canonical redirects + branded 404 ----------------------------------------------------
{
  const fn = worker.slice(worker.indexOf('const CANON_HOST'), worker.indexOf('const CONTENT_PAGES'));
  const Response = { redirect: (u, s) => ({ u, s }) };
  const canon = new Function('Response', fn + '; return canonicalRedirect;')(Response);
  const CP = allow;
  const cases = [
    ['http://safetylabaero.com/', 'https://safetylabaero.com/'],
    ['http://www.safetylabaero.com/legal', 'https://safetylabaero.com/legal'],
    ['https://www.safetylabaero.com/fault-tree-analysis/', 'https://safetylabaero.com/fault-tree-analysis'],
    ['https://safetylabaero.com/fault-tree-analysis.html', 'https://safetylabaero.com/fault-tree-analysis'],
    ['https://safetylabaero.com/index.html', 'https://safetylabaero.com/'],
    ['https://safetylabaero.com/landing.html', 'https://safetylabaero.com/'],
  ];
  for (const [from, to] of cases) { const r = canon(new URL(from), CP); check('301 ' + from + ' -> ' + to, r && r.s === 301 && r.u === to, JSON.stringify(r)); }
  for (const u of ['https://safetylabaero.com/fault-tree-analysis', 'https://safetylabaero.com/app/', 'https://safetylabaero.com/app/safety_lab.js', 'https://safetylabaero.com/legal?x=1', 'http://localhost:8787/']) {
    check('no redirect for canonical/unrelated ' + u, canon(new URL(u), CP) === null);
  }
  check('the redirect runs before any routing (first thing in fetch)', /async fetch\(request, env, ctx\) \{\s*const url = new URL\(request\.url\);\s*\{\s*const r = canonicalRedirect/.test(worker));
  check('page-shaped misses serve site/404.html with status 404', /notFoundPage\(env, url\)/.test(worker) && /status: 404, statusText: 'Not Found'/.test(worker) && fs.existsSync(path.join(SITE, '404.html')));
  check('404.html is noindex and links back into the site', /noindex/.test(S('404.html')) && /href="\/resources"/.test(S('404.html')));
  check('the 404 page carries the CSP like every other document', /notFoundPage[\s\S]*Content-Security-Policy/.test(worker));
  check('versioned assets are cached immutable, images for a day', /searchParams\.has\('v'\)[\s\S]*max-age=31536000, immutable/.test(worker) && /max-age=86400/.test(worker));
}

// ---- [2] every public page: the basics --------------------------------------------------------
const problems = [];
for (const p of PAGES) {
  const h = S(p.file); const v = visible(h);
  const title = attr(h, /<title>([^<]*)<\/title>/); const desc = attr(h, /<meta name="description" content="([^"]*)"/);
  const canon = attr(h, /<link rel="canonical" href="([^"]*)"/);
  const h1s = (v.match(/<h1[\s>]/g) || []).length;
  if (!title) problems.push(p.file + ': no title'); else if (title.length > 60) problems.push(p.file + ': title ' + title.length + ' chars');
  if (!desc) problems.push(p.file + ': no description'); else if (desc.length > 160) problems.push(p.file + ': description ' + desc.length + ' chars');
  if (canon !== 'https://safetylabaero.com' + (p.url === '/' ? '/' : p.url)) problems.push(p.file + ': canonical ' + canon);
  if (h1s !== 1) problems.push(p.file + ': ' + h1s + ' h1');
  if (!/property="og:title"/.test(h) || !/name="twitter:card"/.test(h)) problems.push(p.file + ': og/twitter missing');
  if (!/application\/ld\+json/.test(h)) problems.push(p.file + ': no JSON-LD');
  const ogurl = attr(h, /<meta property="og:url" content="([^"]*)"/);
  if (ogurl && ogurl !== canon) problems.push(p.file + ': og:url ' + ogurl + ' != canonical ' + canon);
  if (!/rel="icon"/.test(h)) problems.push(p.file + ': no favicon link');
}
check('every public page: title <= 60, description <= 160, one H1, self canonical = og:url, og/twitter, JSON-LD, favicon (' + PAGES.length + ' pages)', problems.length === 0, problems.join('; '));

// ---- [3] homepage links, schema ----------------------------------------------------------------
{
  const L = S('landing.html');
  const topics = ['/fault-tree-analysis', '/functional-hazard-assessment', '/arp-4761a', '/arp-4754b', '/fmea-software', '/common-cause-analysis', '/medini-analyze-alternative', '/privacy', '/legal', '/trust', '/ai-guardrails', '/resources', '/tools', '/templates', '/roi'];
  const missing = topics.filter(t => !new RegExp('href="' + t + '"').test(L));
  check('homepage links to every topic page, the comparison, and both legal pages', missing.length === 0, missing.join(' '));
  const ld = JSON.parse(L.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const org = ld['@graph'].find(x => x['@type'] === 'Organization'); const sw = ld['@graph'].find(x => x['@type'] === 'SoftwareApplication');
  check('Organization is the company, not a person', org && org.name === 'Safety Lab Aero, Inc.' && org.legalName === 'Safety Lab Aero, Inc.');
  check('Organization logo is a square image that exists', org && /logo-512\.png$/.test(org.logo) && fs.existsSync(path.join(SITE, 'logo-512.png')));
  check('offers carry the three published tiers with prices and InStock', Array.isArray(sw.offers) && sw.offers.length === 3 && sw.offers.every(o => o.priceCurrency === 'USD' && /InStock/.test(o.availability)) && sw.offers.map(o => o.price).join(',') === '0,1500,2500' && !JSON.stringify(sw).includes('PreOrder'));
  check('homepage title carries "aircraft safety analysis software"', /<title>Aircraft Safety Analysis Software/.test(L) && /<h1>Aircraft safety analysis software/.test(L));
}

// ---- [4] the generated footer is on every page and current; no dead ends -----------------------
{
  let out = '';
  try { out = execSync('node tools/seo/footer.mjs --check', { cwd: ROOT, encoding: 'utf8' }); } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  check('tools/seo/footer.mjs --check passes (every page carries the current shared footer)', /footer check OK/.test(out), out.trim().split('\n').slice(-3).join(' | '));
  const listed = [...footerSrc.matchAll(/"([a-z0-9-]+\.html)"/g)].map(m => m[1]);
  const notInFooterList = PAGES.map(p => p.file).filter(f => f !== 'landing.html' && !listed.includes(f));
  check('every sitemap page except the homepage is in the footer generator list', notInFooterList.length === 0, notInFooterList.join(' '));
  const deadEnds = PAGES.filter(p => (new Set([...S(p.file).matchAll(/href="(\/[a-z0-9-]*)"/g)].map(m => m[1]))).size < 8);
  check('no public page is a dead end (fewer than 8 distinct internal links)', deadEnds.length === 0, deadEnds.map(p => p.file).join(' '));
}

// ---- [5] legal carries the agreement; privacy is real -----------------------------------------
{
  const L = S('legal.html'); const v = visible(L);
  check('/legal has the agreement text in its HTML (no run-time fetch)', /Personalization; No Model Training/.test(v) && !/<script[^>]*eula_modal\.js/.test(L) && !/Loading/.test(v));
  check('/legal agreement text is byte-identical to the generated source (build_agreement --check)', (() => { try { return /check OK/.test(execSync('node legal/build_agreement.mjs --check', { cwd: ROOT, encoding: 'utf8' })); } catch (e) { return false; } })());
  check('/legal links to /privacy', /href="\/privacy"/.test(L));
  const P = S('privacy.html'); const pv = visible(P).replace(/<[^>]+>/g, ' ');
  check('/privacy exists, is indexable, and names the processors the trust page names', /index, follow/.test(P) && ['Supabase', 'Cloudflare', 'Anthropic', 'Voyage', 'Stripe', 'Resend'].every(x => pv.includes(x)));
  check('/privacy states the no-training promise and the 90-day retention the agreement promises', /never do with it|do not use your customer data[^.]*to train/i.test(pv) && /90 days/.test(pv));
  check('/privacy is substantial (over 900 words)', pv.split(/\s+/).length > 900, String(pv.split(/\s+/).length));
}

// ---- [6] the two new pages, and the three lists agree ------------------------------------------
{
  for (const f of ['functional-hazard-assessment.html', 'medini-analyze-alternative.html']) {
    const h = S(f);
    check(f + ' has FAQPage schema whose questions appear as H3s', /"@type": "FAQPage"/.test(h) && [...h.matchAll(/"name": "([^"]+\?)"/g)].every(m => h.includes('<h3>' + m[1] + '</h3>')));
  }
  check('/functional-hazard-assessment links to the FHA template and the ARP 4761A page', /href="\/templates"/.test(S('functional-hazard-assessment.html')) && /href="\/arp-4761a"/.test(S('functional-hazard-assessment.html')));
  check('the comparison page carries the trademark notice and no competitor pricing claim', /trademarks of ANSYS/.test(S('medini-analyze-alternative.html')) && !/medini[^.]*\$\d/i.test(S('medini-analyze-alternative.html')));
  const slugs = PAGES.filter(p => p.url !== '/').map(p => p.url.slice(1));
  const notRouted = slugs.filter(s => !allow.has(s)); const notListed = [...allow].filter(s => !slugs.includes(s));
  check('every sitemap page is routed by the worker, and every routed slug is in the sitemap', notRouted.length === 0 && notListed.length === 0, 'unrouted: ' + notRouted.join(',') + ' unlisted: ' + notListed.join(','));
  check('/resources lists the FHA guide and the comparison', /href="\/functional-hazard-assessment"/.test(S('resources.html')) && /href="\/medini-analyze-alternative"/.test(S('resources.html')));
}

// ---- [7] llms.txt, ARP spellings -------------------------------------------------------------------
{
  const t = fs.existsSync(path.join(SITE, 'llms.txt')) ? S('llms.txt') : '';
  const missing = PAGES.filter(p => !t.includes('https://safetylabaero.com' + (p.url === '/' ? '/' : p.url)));
  check('llms.txt exists and lists every public page', t.length > 0 && missing.length === 0, missing.map(p => p.url).join(' '));
  check('llms.txt states the no-training and US-hosting facts', /never used to train/.test(t) && /United States/.test(t));
  check('ARP pages carry the unspaced spelling once (how people type it)', /ARP4761A/.test(visible(S('arp-4761a.html'))) && /ARP4754B/.test(visible(S('arp-4754b.html'))));
  check('worker.js does not need the .txt allowlist for llms.txt (served like robots.txt)', /robots\.txt/.test(worker));
}

// ---- [8] house rule on the new copy ----------------------------------------------------------------
{
  const bad = ['functional-hazard-assessment.html', 'medini-analyze-alternative.html', 'privacy.html', '404.html'].filter(f => /[—–]/.test(visible(S(f))));
  check('no em or en dash in the new pages', bad.length === 0, bad.join(' '));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
