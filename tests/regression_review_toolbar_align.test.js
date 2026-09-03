#!/usr/bin/env node
/*
 * Regression — Prove ▸ Review & Approvals toolbar: the Reviewer field and the
 * Export PDF button must be the same height and on the same line.
 *
 * Waqas, 31 Aug 2026: "these need to be the same height and in line".
 *
 * MEASURED ON THE DEPLOYED BUILD, not computed from the stylesheet: the field
 * was 24.8px tall, the button 36.2px, and their centres sat 10px apart. Three
 * causes stacked, and two of them are the same global rule biting again:
 *   · the global `label` rule carries margin-bottom: var(--s-2) = 8px, and
 *     .action-group is align-items:center — which centres the label's MARGIN
 *     box, riding the content 4px high;
 *   · the global `input, select, textarea` rule carries
 *     margin-bottom: var(--s-3) = 12px, centred inside the inline-flex label —
 *     the other 6px. That rule collapsed the workspace invite email field to
 *     20px earlier the same day; this suite exists partly so the next thing it
 *     moves is caught by a check rather than by someone's eye;
 *   · the height gap came from the field's 3px/12px padding+font against the
 *     base button's 8px 16px / 13px / line-height 1.4 plus btn-cyan's 1px border.
 *
 * The fix matches the FIELD TO THE BUTTON. The button's size comes from the
 * shared `button` rule and is identical in every other .header-with-export
 * toolbar in the app, so shrinking it here would trade one misalignment for an
 * inconsistency across every other screen.
 *
 * These checks are arithmetic over the real declared values rather than a pin on
 * the literal style string: a pin would pass if someone changed the button and
 * left the field alone, which is the exact failure being guarded.
 *
 * Run: node tests/regression_review_toolbar_align.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'site', 'index.html'), 'utf8');
const css  = fs.readFileSync(path.join(ROOT, 'site', 'safety_lab.css'), 'utf8');

// ---- pull the toolbar out of the markup -----------------------------------
const grp = (() => {
  const i = html.indexOf('id="review-reviewer-name"');
  // Wide enough to include the explanatory comment above the label, which is
  // ~1.3k on its own — the first cut sliced it off and the "cause is recorded"
  // check failed against a comment that was right there.
  return i < 0 ? null : html.slice(Math.max(0, i - 2600), i + 900);
})();
check('the Review toolbar exists', !!grp);
if (!grp) { console.log('\n  ' + pass + ' passed, ' + fail + ' failed'); process.exit(1); }

const inputStyle = (grp.match(/id="review-reviewer-name"[^>]*style="([^"]*)"/) || [])[1] || '';
const labelStyle = (grp.match(/<label style="([^"]*)">\s*\n\s*Reviewer/) || [])[1] || '';
const decl = (s, p) => { const m = s.match(new RegExp('(?:^|;)\\s*' + p + '\\s*:\\s*([^;]+)')); return m ? m[1].trim() : null; };
const px = v => v == null ? null : parseFloat(v);

// ---- the base button box, read from the stylesheet it actually comes from --
const btnRule = css.slice(css.indexOf('\nbutton {'), css.indexOf('\nbutton {') + 400);
const btnPadY = px((decl(btnRule, 'padding') || '').split(/\s+/)[0]);
const btnFont = px(decl(btnRule, 'font-size'));
const btnLh   = px(decl(btnRule, 'line-height'));
check('read the base button box from the stylesheet', btnPadY === 8 && btnFont === 13 && btnLh === 1.4,
      JSON.stringify({ btnPadY, btnFont, btnLh }));
// btn-cyan turns the button into a 1px-bordered outline button
check('btn-cyan adds a 1px border (it is part of the height)', /\.btn-cyan\s*\{[\s\S]{0,200}border:\s*1px solid/.test(css));
const BORDER = 2;   // 1px top + 1px bottom, on both elements
const buttonH = btnPadY * 2 + btnFont * btnLh + BORDER;

// ---- the field box, from its inline style ---------------------------------
const inPadY = px((decl(inputStyle, 'padding') || '').split(/\s+/)[0]);
const inFont = px(decl(inputStyle, 'font-size'));
const inLh   = px(decl(inputStyle, 'line-height'));
const inputH = (inPadY == null || inFont == null || inLh == null) ? null : inPadY * 2 + inFont * inLh + BORDER;

console.log('        button ' + buttonH.toFixed(1) + 'px   field ' + (inputH == null ? '?' : inputH.toFixed(1)) + 'px');
check('SAME HEIGHT — the field computes to the button height',
      inputH != null && Math.abs(inputH - buttonH) < 0.6,
      'button ' + buttonH + ' vs field ' + inputH);

// ---- IN LINE — both stacked margins must be cancelled ----------------------
check('the global label rule really does carry a bottom margin (the 4px)',
      /\nlabel \{[\s\S]{0,260}margin-bottom:\s*var\(--s-2\)/.test(css));
check('the global input rule really does carry a bottom margin (the 6px)',
      /\ninput, select, textarea \{[\s\S]{0,400}margin-bottom:\s*var\(--s-3\)/.test(css));
check('IN LINE — the label cancels its margin', decl(labelStyle, 'margin') === '0');
check('IN LINE — the field cancels its margin', decl(inputStyle, 'margin') === '0');
check('the field is border-box, so its padding is inside the height it declares',
      decl(inputStyle, 'box-sizing') === 'border-box');
check('.action-group still centres its children', /\.action-group \{[^}]*align-items:\s*center/.test(css));

// ---- and the reason is written down where the next person will look --------
check('the cause is recorded at the site, not just fixed',
      /same height and in line/i.test(grp) && /margin-bottom: var\(--s-3\)/.test(grp));
check('...including that it is the same global rule that hit the invite field',
      /invite\s*\n?\s*(?:.*)?email field/i.test(grp) || /invite email field/i.test(grp));

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
