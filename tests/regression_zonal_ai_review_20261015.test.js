#!/usr/bin/env node
/*
 * Regression (15 Oct 2026), from the first live AI review in the AI test project:
 *  1. The review said "Enter your name as the reviewer first" but had no name box (the box is on the CAD
 *     Model tab, hidden behind the dialog). The dialog now has a Reviewer box next to Apply.
 *  2. The message stacked a new red line on every click. It is now one line, replaced each time.
 *  3. Three correct statements were rejected by the number check:
 *     a. a FACT naming "section 6.2" of SA-5020: the AI Inputs PDF reader joined each page into one line,
 *        so "6.2 Bird strike margins" was never seen as a heading. pdf_text.js keeps printed lines.
 *     b/c. two INTERPRETATIONS naming the part under review, PN-NF-411, while citing quotes about the test
 *        results. The part under review is given by the app; an interpretation may name it. A fact may not
 *        (mutation: the wrong-panel trap, a Test 4 quote about PN-NF-410 stated as a PN-NF-411 fact, stays rejected).
 *  The eval requests are byte-identical to the 7/7 eval run (prompt and passages unchanged).
 * Run: node tests/regression_zonal_ai_review_20261015.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + d : '')); } };
const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, 'site');
const Z = require(path.join(SITE, 'zonal_ai.js'));
const T = require(path.join(SITE, 'pdf_text.js'));
const F = require(path.join(ROOT, 'eval', 'zonal_ai', 'fixtures.js'));

// ---- pdf_text: lines and paragraphs from pdf.js items (positions as pdf.js reports them for SA-5020.pdf)
const it = (str, y, eol) => ({ str, transform: [11, 0, 0, 11, 72, y], height: 11, hasEOL: !!eol });
const items = [
    it('TEST DATA: invented report for the Safety Lab AI accuracy test. Not a real document.', 760, true),
    it('SA-5020 Stress Analysis, Nose Fairing Revision D', 720, true),
    it('6.2', 690), it('Bird strike margins', 690, true),
    it('Part PN-NF-410 bird strike case, ultimate load: margin of safety MS = +0.12.', 676, true),
    it('Part PN-NF-411 bird strike case, ultimate load: margin of safety MS = -0.04 (negative,', 662),   // no hasEOL: the y change ends the line
    it('redesign required).', 648, true),
    { type: 'beginMarkedContent' },
    it('1', 60, true)
];
const page = T.pageText(items);
check('PDF page keeps the heading on its own line', page.split('\n').indexOf('6.2 Bird strike margins') >= 0, JSON.stringify(page));
check('PDF page has a blank line between paragraphs', /Revision D\n\n6\.2/.test(page));
check('a wrapped line without hasEOL still breaks on the baseline change', /\(negative,\nredesign required\)\./.test(page));
check('items on one line are joined with a space as before', page.indexOf('6.2 Bird strike margins') >= 0);
check('marked-content items are skipped', page.indexOf('undefined') < 0);

const stressPdf = { id: 'doc-stress', name: 'SA-5020 Stress Analysis Nose Fairing.pdf', text: '[p.1] ' + page };
const ps = Z.passages(stressPdf);
const hit = ps.filter(p => p.text.indexOf('MS = -0.04') >= 0)[0];
check('the -0.04 passage is anchored to section 6.2 on page 1', hit && hit.section === '6.2 Bird strike margins' && hit.page === 1, JSON.stringify(hit));
const oldText = { id: 'doc-stress', name: stressPdf.name, text: '[p.1] ' + items.filter(i => typeof i.str === 'string').map(i => i.str).join(' ') };
check('mutation: the old one-line page text has no section (the cause of the false rejection)', Z.passages(oldText).every(p => !p.section));

// ---- headings: titles yes, wrapped body lines no
const ctxH = d => Z.passages({ id: 'd', name: 'd.pdf', text: '[p.1] ' + d }).map(p => p.section);
check('"4 Results" is a heading', ctxH('4 Results\nTest 4 passed.').indexOf('4 Results') >= 0);
check('"Appendix B Test rig" is a heading', ctxH('Appendix B Test rig\nThe rig is a gas gun.').indexOf('Appendix B Test rig') >= 0);
check('"250 KCAS. No penetration." is body text, not a heading', Z.passages({ id: 'd', name: 'd.pdf', text: '[p.1] The bird hit at\n250 KCAS. No penetration.' }).some(p => /250 KCAS\. No penetration/.test(p.text)));
check('"12 tests were run." is body text, not a heading', Z.passages({ id: 'd', name: 'd.pdf', text: '[p.1] Overall\n12 tests were run.' }).some(p => /12 tests were run/.test(p.text)));
check('"Table 3 shows the margins." is body text, not a heading', Z.passages({ id: 'd', name: 'd.pdf', text: '[p.1] As listed\nTable 3 shows the margins.' }).some(p => /Table 3 shows/.test(p.text)));

// ---- the three statements from the live review
const docs = F.DOCS.map(d => (d.id === 'doc-stress' ? stressPdf : d));
const env = F.env({ docs: () => docs });
const target = { volumeId: 'risk-bird-nose', part: { pid: 'p-nf411', name: 'Nose fairing panel RH', partNumber: 'PN-NF-411' } };
const ctx = Z.gather('damage.assumption', target, env);
const R = (doc, p, quote) => ({ type: 'report', doc, page: p, quote });
const out = { statements: [
    { kind: 'fact', text: 'SA-5020 Stress Analysis, Nose Fairing Revision D, section 6.2: for the PN-NF-411 bird strike case at ultimate load, the margin of safety is MS = -0.04. The analysis states that this margin is negative and redesign is required.',
      sources: [R('doc-stress', 1, 'Part PN-NF-411 bird strike case, ultimate load: margin of safety MS = -0.04 (negative, redesign required).')] },
    { kind: 'interpretation', text: 'The current test (TR-2210 Rev C) and the stress analysis (SA-5020 Rev D) agree that PN-NF-411 in its current design does not withstand a 4 lb bird at 250 KCAS. Test 4 in the same report identifies 250 KCAS as Vc. The damage assumption for the Nose fairing panel RH should therefore be that a bird strike at this condition penetrates the panel\'s inner skin. Do not treat the panel as a barrier. This is an engineering judgment for review.',
      sources: [R('doc-bird', 12, 'Penetration of the inner skin. Result: FAIL.'), R('doc-bird', 12, 'impacted by a 4 lb bird at 250 KCAS (Vc)'), R('doc-stress', 1, 'margin of safety MS = -0.04 (negative, redesign required)')] },
    { kind: 'interpretation', text: 'The passing bird strike results in the reports cover other panels or weaker conditions, so they are not evidence for PN-NF-411: - TR-2210 Rev C Test 4 passed, but it was on PN-NF-410. - Test 6 passed, but it was on PN-NF-412, at 180 KCAS, below Vc, for rig calibration only. - TR-2210 Rev A Test 4 was on PN-NF-410 at 230 KCAS, and Rev A is superseded by Revision C.',
      sources: [R('doc-bird', 12, 'Test 4: panel PN-NF-410 was impacted by a 4 lb bird at 250 KCAS (Vc). No penetration of the panel.'), R('doc-bird', 13, 'Test 6: panel PN-NF-412 was impacted by a 4 lb bird at 180 KCAS. No penetration. Result: PASS. Test 6 was run below Vc for rig calibration only.'), R('doc-bird-old', 12, 'Test 4: panel PN-NF-410 was impacted by a 4 lb bird at 230 KCAS. No penetration. Result: PASS.'), R('doc-bird-old', 1, 'Superseded by Revision C.')] },
    // mutations: must stay rejected
    { kind: 'fact', text: 'Panel PN-NF-411 was impacted by a 4 lb bird at 250 KCAS with no penetration of the panel.',
      sources: [R('doc-bird', 12, 'Test 4: panel PN-NF-410 was impacted by a 4 lb bird at 250 KCAS (Vc). No penetration of the panel.')] },
    { kind: 'interpretation', text: 'PN-NF-411 would withstand a 4 lb bird at 275 KCAS.', sources: [R('doc-bird', 12, 'Penetration of the inner skin. Result: FAIL.')] },
    { kind: 'interpretation', text: 'PN-NF-412 likely behaves like PN-NF-411.', sources: [R('doc-bird', 12, 'Penetration of the inner skin. Result: FAIL.')] }
] };
const v = Z.validate(JSON.stringify(out), ctx);
const ok = i => v.accepted.some(s => s.id === 's' + (i + 1));
const why = i => JSON.stringify((v.rejected.find(r => r.index === i) || {}).reasons || []);
check('fact naming section 6.2 of the stress analysis is accepted', ok(0), why(0));
check('interpretation naming PN-NF-411 (the part under review) is accepted', ok(1), why(1));
check('interpretation listing the other panels\' passes as not evidence for PN-NF-411 is accepted', ok(2), why(2));
check('mutation: Test 4 (PN-NF-410) stated as a PN-NF-411 FACT is still rejected (wrong-panel trap)', !ok(3) && /411/.test(why(3)), why(3));
check('mutation: an invented number (275) in an interpretation is still rejected', !ok(4) && /275/.test(why(4)), why(4));
check('mutation: another part (PN-NF-412) not in the quotes is still rejected in an interpretation', !ok(5) && /412/.test(why(5)), why(5));

// ---- eval requests unchanged (the 7/7, 95/95 Opus 5.5 run)
const reqs = F.CASES.map(c => JSON.stringify(Z.buildRequest(Z.gather(c.lane, c.target, F.env()))));
check('the 7 eval requests are byte-identical to the evaluated ones', crypto.createHash('md5').update(reqs.join('\n')).digest('hex') === 'cfe30ade1b6adf910c2e4edd707b1bcb');

// ---- the review dialog
const html = Z.renderDraftHtml(Z.draftFrom(ctx, JSON.stringify(out)));
check('the review dialog has a Reviewer name box', /data-zai-by/.test(html) && /Reviewer \(your name\)/.test(html));
check('the review dialog has one message line', (html.match(/data-zai-msg/g) || []).length === 1);
const src = fs.readFileSync(path.join(SITE, 'zonal_ai.js'), 'utf8');
const applyBlock = src.slice(src.indexOf("t.closest('[data-zai-apply]')"), src.indexOf('// ENABLED: the one switch'));
check('Apply reads the name from the dialog box', /querySelector\('\[data-zai-by\]'\)/.test(applyBlock));
check('Apply checks the name before the dialog steps aside', applyBlock.indexOf('if (!by)') >= 0 && applyBlock.indexOf('if (!by)') < applyBlock.indexOf("style.display = 'none'"));
check('Apply replaces the message instead of adding a line per click', /m\.textContent = txt/.test(applyBlock) && !/createElement\('div'\); m\.style\.color = 'var\(--color-danger,#8E2A2A\)'; m\.textContent = r\.reason/.test(applyBlock));
check('the name typed in the dialog is kept in the CAD Model name box', /getElementById\('cad-by'\)/.test(applyBlock) && /dispatchEvent\(new Event\('input'/.test(applyBlock));

// ---- wiring
const loader = fs.readFileSync(path.join(SITE, 'ai_loader.js'), 'utf8'), ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8'), index = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
check('ai_loader loads pdf_text.js just before ai_assistant.js', /'pdf_text\.js\?v=1\.0', 'ai_assistant\.js\?v=76\.82'/.test(loader));
check('the PDF reader uses SLPdfText.pageText', /SLPdfText\.pageText\(tc\.items\)/.test(ai));
check('index.html loads zonal_ai 1.6 and the new loader', /zonal_ai\.js\?v=1\.6/.test(index) && /ai_loader\.js\?v=8\.74/.test(index));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
