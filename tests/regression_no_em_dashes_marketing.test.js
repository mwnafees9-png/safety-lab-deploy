#!/usr/bin/env node
/*
 * Regression — no em dashes in customer-facing marketing copy (13 Sep 2026).
 *
 * WHY: Waqas's rule for anything a customer reads: no em dashes ("they look AI generated").
 * The landing page was rewritten by hand on 11 Sep (73 of them); the 13 marketing pages
 * were not, and 189 more sat in their visible text, including the <title> of the ARP 4761A
 * and FMEA guides. Rewritten 13 Sep (colons for labels and explanations, commas for
 * conjunction tails, parentheses for asides). This suite keeps them out.
 *
 * Scope: every top-level site/*.html EXCEPT index.html (the app; its own job) and
 * legal.html (EULA wording is not marketing copy). Only VISIBLE text counts: HTML
 * comments, <script> and <style> are ignored (they are stripped or never read). A lone
 * dash used as an empty-value placeholder inside an element (">—<") is UI, not prose,
 * and is allowed.
 *
 * Run: node tests/regression_no_em_dashes_marketing.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const SKIP = new Set(['index.html', 'legal.html']);

function visible(html) {
    return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
}
function proseDashes(html) {
    const v = visible(html);
    const out = [];
    let i = -1;
    while ((i = v.indexOf('—', i + 1)) !== -1) {
        const before = v.slice(Math.max(0, i - 3), i).trimEnd(), after = v.slice(i + 1, i + 4).trimStart();
        if (before.endsWith('>') && after.startsWith('<')) continue;   // placeholder value, not prose
        out.push(v.slice(Math.max(0, i - 50), i + 50).replace(/\s+/g, ' '));
    }
    return out;
}

const pages = fs.readdirSync(SITE).filter(f => /\.html$/.test(f) && !SKIP.has(f)).sort();
check('there are marketing pages to check', pages.length >= 12, pages.length + ' pages');
let total = 0;
for (const f of pages) {
    const d = proseDashes(fs.readFileSync(path.join(SITE, f), 'utf8'));
    total += d.length;
    check(f + ': no em dash in visible text', d.length === 0, d.length + ' found, e.g. "' + (d[0] || '') + '"');
}
// The one place they were most visible: page titles and share titles.
for (const f of pages) {
    const s = fs.readFileSync(path.join(SITE, f), 'utf8');
    const t = (s.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    const og = (s.match(/property="og:title" content="([^"]*)"/) || [])[1] || '';
    check(f + ': <title> and og:title carry no em dash', t.indexOf('—') === -1 && og.indexOf('—') === -1);
}
check('the detector still SEES a dash when one is present (probe sanity)', proseDashes('<p>a — b</p>').length === 1 && proseDashes('<span>—</span>').length === 0 && proseDashes('<!-- a — b --><p>ok</p>').length === 0);

console.log('\n' + pass + ' passed, ' + fail + ' failed (' + total + ' prose dashes across ' + pages.length + ' pages)');
process.exit(fail ? 1 : 0);
