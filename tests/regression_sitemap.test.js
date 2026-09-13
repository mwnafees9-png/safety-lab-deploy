#!/usr/bin/env node
/*
 * Regression — the sitemap is generated, complete, and shipped with real dates (13 Sep 2026).
 *
 *   S1  tools/seo/sitemap.mjs renders valid XML with every page in its list, one <url> each,
 *       absolute https URLs on our host, lastmod in YYYY-MM-DD, and no duplicates
 *   S2  the committed site/sitemap.xml lists exactly the generator's URLs, in order
 *   S3  every listed page file exists; every linked, indexable marketing page is listed
 *       (a page with a canonical pointing elsewhere is a duplicate and must NOT be listed;
 *       index.html is the app, not a page for search)
 *   S4  build.sh regenerates the sitemap into dist/ (so the shipped file carries real dates)
 *   S5  the IndexNow ping reads the same list (13+ pages, all on our host)
 *
 * Run: node tests/regression_sitemap.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, 'site');
const locs = t => [...t.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

(async function () {
    const gen = await import(path.join(ROOT, 'tools', 'seo', 'sitemap.mjs'));
    const xml = gen.render(ROOT);
    console.log('\n[S1] generator output');
    check('starts with the XML prolog and the sitemaps.org urlset', /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/.test(xml));
    const L = locs(xml);
    check('one <url> per page in the list', L.length === gen.PAGES.length && (xml.match(/<url>/g) || []).length === gen.PAGES.length);
    check('every URL is absolute https on safetylabaero.com', L.every(u => /^https:\/\/safetylabaero\.com(\/[a-z0-9-]*)?$/.test(u)));
    check('no duplicate URLs', new Set(L).size === L.length);
    check('every lastmod is a real YYYY-MM-DD', [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].every(m => /^\d{4}-\d{2}-\d{2}$/.test(m[1]) && !isNaN(Date.parse(m[1]))));
    check('no lastmod is the stale 2026-06-05 placeholder for every page', !/(<lastmod>2026-06-05<\/lastmod>[\s\S]*){13}/.test(xml));

    console.log('\n[S2] committed file matches the list');
    const committed = fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8');
    check('site/sitemap.xml lists exactly the generator URLs, in order', JSON.stringify(locs(committed)) === JSON.stringify(L));

    console.log('\n[S3] completeness');
    check('every listed page file exists', gen.PAGES.every(p => fs.existsSync(path.join(SITE, p.file))));
    const pages = fs.readdirSync(SITE).filter(f => /\.html$/.test(f) && f !== 'index.html');
    const listedFiles = new Set(gen.PAGES.map(p => p.file));
    const problems = [];
    for (const f of pages) {
        const s = fs.readFileSync(path.join(SITE, f), 'utf8');
        const canon = (s.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || '';
        const self = 'https://safetylabaero.com/' + (f === 'landing.html' ? '' : f.replace(/\.html$/, ''));
        const dup = canon && canon !== self;
        const noindex = /<meta name="robots" content="[^"]*noindex/.test(s);
        if (dup || noindex) { if (listedFiles.has(f)) problems.push(f + ' is a duplicate/noindex page but is listed'); }
        else if (!listedFiles.has(f)) problems.push(f + ' is an indexable page but is NOT listed');
        if (!canon) problems.push(f + ' has no canonical');
    }
    check('every indexable marketing page is listed, duplicates are not, all carry a canonical', problems.length === 0, problems.join('; '));
    check('security.html is the unlinked duplicate of /trust (canonical there, not listed)', !listedFiles.has('security.html') && /href="https:\/\/safetylabaero\.com\/trust"/.test(fs.readFileSync(path.join(SITE, 'security.html'), 'utf8')));

    console.log('\n[S4] build');
    const build = fs.readFileSync(path.join(ROOT, 'build.sh'), 'utf8');
    check('build.sh regenerates the sitemap into dist/ after the asset copy', /node tools\/seo\/sitemap\.mjs --out "\$OUT\/sitemap\.xml"/.test(build) && build.indexOf('node tools/seo/sitemap.mjs') > build.indexOf("-name '*.xml'"));

    console.log('\n[S5] IndexNow reads the same list');
    const inx = await import(path.join(ROOT, 'tools', 'indexnow', 'ping.mjs'));
    check('ping payload URLs === sitemap URLs', JSON.stringify(inx.sitemapUrls()) === JSON.stringify(L));

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  suite threw — ' + (e && e.stack || e)); process.exit(1); });
