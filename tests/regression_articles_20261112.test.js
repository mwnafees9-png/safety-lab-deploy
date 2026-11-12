#!/usr/bin/env node
/*
 * Regression: the articles section (12 Nov 2026).
 *
 * Waqas: "put an article section on the landing page and put all the articles and papers we have on
 * there", "if you think it will help us with SEO". Each article is its own page with the full text
 * (/articles/<slug>), /articles lists them all, the homepage shows the latest three, and the guides
 * page lists every one. Papers stay off for now ("articles only for now"; "we dont need to advertise
 * our guard rails").
 *
 * WHAT THIS PINS:
 *   [1] every page under site/articles/ is routed by the worker, in the sitemap, in the footer list
 *       and in llms.txt, and every routed articles/... slug has a page;
 *   [2] each article: one H1, title <= 60, description <= 160, self canonical = og:url, Article JSON-LD
 *       that parses, an og:image that exists, and every image it references exists on disk;
 *   [3] /articles links to every article; the homepage and /resources link to /articles;
 *   [4] no em or en dash anywhere in the visible copy (house rule);
 *   [5] the worker's canonical redirect folds /articles/<slug>.html and /articles/<slug>/ into
 *       /articles/<slug> with a 301.
 *
 * Run: node tests/regression_articles_20261112.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ': ' + d : '')); } };
const ROOT = path.join(__dirname, '..'); const SITE = path.join(ROOT, 'site');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const visible = h => h.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');

const files = fs.readdirSync(path.join(SITE, 'articles')).filter(f => f.endsWith('.html')).sort();
const slugs = files.map(f => f.replace(/\.html$/, ''));
check('there are articles (' + files.length + ')', files.length >= 5);

// ---- [1] routing, sitemap, footer, llms ---------------------------------------------------------
const worker = R('worker.js');
const allow = new Set([...(worker.match(/const CONTENT_PAGES = new Set\(\[([\s\S]*?)\]\);/) || [, ''])[1].matchAll(/'([a-z0-9-]+(?:\/[a-z0-9-]+)?)'/g)].map(m => m[1]));
const sitemap = R('tools/seo/sitemap.mjs'); const footer = R('tools/seo/footer.mjs'); const llms = S('llms.txt');
check('/articles is routed and in the sitemap', allow.has('articles') && /url: "\/articles",/.test(sitemap) && fs.existsSync(path.join(SITE, 'articles.html')));
for (const s of slugs) {
  check('article ' + s + ' is routed, in the sitemap, the footer list and llms.txt',
    allow.has('articles/' + s) && sitemap.includes('url: "/articles/' + s + '"') && footer.includes('"articles/' + s + '.html"') && llms.includes('https://safetylabaero.com/articles/' + s + ')'));
}
const orphanRoutes = [...allow].filter(a => a.startsWith('articles/') && !slugs.includes(a.slice(9)));
check('every routed articles/ slug has a page', orphanRoutes.length === 0, orphanRoutes.join(' '));

// ---- [2] page basics --------------------------------------------------------------------------
for (const f of files) {
  const h = S('articles/' + f), s = f.replace(/\.html$/, ''), canon = 'https://safetylabaero.com/articles/' + s;
  const title = (h.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  const desc = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  const probs = [];
  if ((visible(h).match(/<h1[\s>]/g) || []).length !== 1) probs.push('h1 count');
  if (!title || title.replace(/&quot;/g, '"').replace(/&amp;/g, '&').length > 60) probs.push('title ' + title.length);
  if (!desc || desc.replace(/&quot;/g, '"').length > 160) probs.push('desc ' + desc.length);
  if (!h.includes('<link rel="canonical" href="' + canon + '">') || !h.includes('<meta property="og:url" content="' + canon + '">')) probs.push('canonical/og:url');
  let ld = null; try { ld = JSON.parse(h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]); } catch (e) { probs.push('json-ld'); }
  if (ld && !ld['@graph'].some(x => x['@type'] === 'Article' && x.url === canon && /^\d{4}-\d{2}-\d{2}$/.test(x.datePublished))) probs.push('Article schema');
  const og = (h.match(/<meta property="og:image" content="https:\/\/safetylabaero\.com([^"]+)"/) || [])[1];
  if (!og || !fs.existsSync(path.join(SITE, og))) probs.push('og:image ' + og);
  const missing = [...h.matchAll(/<img src="(\/articles\/[^"]+)"/g)].map(m => m[1]).filter(u => !fs.existsSync(path.join(SITE, u)));
  if (missing.length) probs.push('missing images ' + missing.join(','));
  if (!/SITE-FOOTER:BEGIN[\s\S]*href="\/articles"[\s\S]*SITE-FOOTER:END/.test(h)) probs.push('footer');
  check(f + ': h1, title, description, canonical, Article schema, images, footer', probs.length === 0, probs.join('; '));
}

// ---- [3] links in -----------------------------------------------------------------------------
const idx = S('articles.html');
check('/articles links to every article', slugs.every(s => idx.includes('href="/articles/' + s + '"')));
check('the homepage has the articles section and links to /articles', /id="articles"/.test(S('landing.html')) && /href="\/articles"/.test(S('landing.html')));
check('/resources links to /articles and to every article', /href="\/articles"/.test(S('resources.html')) && slugs.every(s => S('resources.html').includes('href="/articles/' + s + '"')));
check('the AI guardrails paper is not published as an article (Waqas: "we dont need to advertise our guard rails")', !slugs.some(s => /guardrail/.test(s)));

// ---- [4] house rule ---------------------------------------------------------------------------
const dashed = ['articles.html', ...files.map(f => 'articles/' + f)].filter(f => /[—–]/.test(visible(S(f))));
check('no em or en dash in any article page', dashed.length === 0, dashed.join(' '));

// ---- [5] canonical redirect -------------------------------------------------------------------
{
  const fn = worker.slice(worker.indexOf('const CANON_HOST'), worker.indexOf('const CONTENT_PAGES'));
  const canonical = new Function('Response', fn + '; return canonicalRedirect;')({ redirect: (u, s) => ({ u, s }) });
  const s = slugs[0];
  for (const from of ['/articles/' + s + '.html', '/articles/' + s + '/', '/articles.html', '/articles/']) {
    const r = canonical(new URL('https://safetylabaero.com' + from), allow);
    const to = 'https://safetylabaero.com' + from.replace(/(\.html|\/)$/, '');
    check('301 ' + from + ' -> ' + to, r && r.s === 301 && r.u === to, JSON.stringify(r));
  }
  check('no redirect for the canonical article address', canonical(new URL('https://safetylabaero.com/articles/' + s), allow) === null);
  check('an unknown nested address is not redirected', canonical(new URL('https://safetylabaero.com/articles/nope.html'), allow) === null);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
