#!/usr/bin/env node
/*
 * Regression — guide-page FAQ: what people read is what search engines are told (13 Sep 2026).
 *
 * WHY: the five technical guide pages carry a visible "Frequently asked questions" block and
 * a FAQPage schema (JSON-LD). Search engines and AI answer engines quote the schema; people
 * read the block. If the two drift, the site tells machines something it does not show, and
 * Google treats that as a policy problem. On 13 Sep nine definitional questions from the
 * SEO report's question map were added to both (approved by Waqas). This suite holds them
 * together: same questions, same order, same answers, on every guide page, no em dashes,
 * and every answer long enough to be an answer.
 *
 * Run: node tests/regression_guide_faq_schema.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const PAGES = { 'arp-4761a.html': 4, 'fault-tree-analysis.html': 6, 'fmea-software.html': 4, 'common-cause-analysis.html': 3, 'arp-4754b.html': 3 };
const MUST = {
    'arp-4761a.html': ['What is ARP 4761A?', 'What is the Golden Thread in aircraft safety analysis?'],
    'fault-tree-analysis.html': ['What is fault tree analysis?', 'What is a basic event in a fault tree?', 'What is a dynamic fault tree?'],
    'fmea-software.html': ['What is FMEA?', 'How does FMEA differ from fault tree analysis?'],
    'common-cause-analysis.html': ['What is common cause analysis?'],
    'arp-4754b.html': ['What does ARP 4754B cover?']
};
const unescape = t => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&rsquo;/g, '’').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”');
const norm = t => unescape(String(t)).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

for (const [f, n] of Object.entries(PAGES)) {
    const s = fs.readFileSync(path.join(SITE, f), 'utf8');
    console.log('\n[' + f + ']');
    const at = s.indexOf('<h2>Frequently asked questions</h2>');
    check('has the FAQ block', at > 0);
    const block = s.slice(at, s.indexOf('<div class="cta-band">', at));
    const vis = [...block.matchAll(/<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)].map(m => ({ q: norm(m[1]), a: norm(m[2]) }));
    let ld = null; try { ld = JSON.parse((s.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1]); } catch (e) { ld = null; }
    check('JSON-LD parses', !!ld);
    const faq = ld && (ld['@graph'] || []).find(g => g['@type'] === 'FAQPage');
    const sch = faq ? faq.mainEntity.map(q => ({ q: norm(q.name), a: norm(q.acceptedAnswer && q.acceptedAnswer.text) })) : [];
    check('expected number of questions (' + n + ') in the visible block', vis.length === n, String(vis.length));
    check('same number in the schema', sch.length === n, String(sch.length));
    check('questions match, in order', JSON.stringify(vis.map(x => x.q)) === JSON.stringify(sch.map(x => x.q)));
    check('answers match, word for word', vis.every((x, i) => sch[i] && x.a === sch[i].a), vis.map((x, i) => sch[i] && x.a === sch[i].a ? '' : ('#' + i)).filter(Boolean).join(','));
    check('every answer is a real answer (>= 20 words)', vis.every(x => x.a.split(' ').length >= 20));
    check('the definitional questions from the report are present', MUST[f].every(q => vis.some(x => x.q === q)));
    check('no em dash in any question or answer', !vis.concat(sch).some(x => (x.q + x.a).indexOf('—') >= 0));
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
