#!/usr/bin/env node
/*
 * Regression — fault-tree synthesis covers what the ENGINEER chose, not the
 * first five conditions a slice happened to keep.
 * (26 Aug 2026. Waqas, with 38 untreed FHA rows and 5 trees on screen: "why was
 * only one tree generated" — then the ruling: "we should give user the option
 * to choose which failure conditions they want to synthesize, or do them all
 * as a batch.")
 *
 * THE BUG: _runSynth opened with
 *     fcs.slice(0, Math.min(fcs.length, opts.limit || 5))
 * — a silent first-5 cap. FC-001…FC-005 all sat under SF-001, so the visible
 * result of "synthesise my fault trees" was one function's trees and nothing
 * else, with no indication 33 conditions were dropped. Third instance of the
 * silent-truncation family (the 12k document cap, the 7-of-75 FHA).
 *
 * THE FIX: the choice belongs to the engineer. _openFcPicker lists every
 * untreed condition with a checkbox — ALL pre-checked, so "do them all" is the
 * default and narrowing is the deliberate act. _runSynth synthesises exactly
 * what it is handed, chunked to the output budget (trees are the costliest
 * rows), with per-fcId coverage asserted from the actions.
 *
 * Run: node tests/regression_synth_fc_choice.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
const loader = fs.readFileSync(path.join(SITE, 'ai_loader.js'), 'utf8');
const code = ai.replace(/^\s*\/\/.*$/gm, '');

function block(src, startMarker) {
  const i = src.indexOf(startMarker);
  if (i < 0) return null;
  let j = src.indexOf('{', i), depth = 0, inS = null, esc = false, line = false, blk = false;
  for (let k = j; k < src.length; k++) {
    const c = src[k], n = src[k + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (blk) { if (c === '*' && n === '/') { blk = false; k++; } continue; }
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (inS) { if (c === inS) inS = null; continue; }
    if (c === '/' && n === '/') { line = true; k++; continue; }
    if (c === '/' && n === '*') { blk = true; k++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  return null;
}

console.log('\n[cap] the silent first-5 slice is gone');
check('no `opts.limit || 5` default anywhere in live code',
  !/opts\.limit \|\| 5/.test(code),
  'this line dropped 33 of 38 conditions without a word');
check('an explicit programmatic limit still works, but only when PASSED',
  /typeof opts\.limit === 'number' && opts\.limit > 0\) \? fcs\.slice\(0, opts\.limit\) : fcs\.slice\(\)/.test(code));
check('the synthesis architecture text is no longer sliced at 50,000',
  !/\(none provided — use only the project model\)'\)\.slice\(0, 50000\)/.test(code),
  'same no-cap ruling as the source documents');

console.log('\n[choice] the engineer picks the conditions');
check('_allocationSynthFlow routes through the FC picker before the arch input',
  /_openFcPicker\(fcs, asm, function \(picked\) \{ _allocationArchStep\(opts, picked, asm, scope\); \}\);/.test(ai));
check('the programmatic path (caller supplied fcs) does NOT interpose the picker',
  /if \(opts\.fcs && opts\.fcs\.length\) \{\s*\n\s*_withArchInput\(/.test(ai),
  'a caller that already chose must not be second-guessed by a dialog');

console.log('\n[choice] the picker, executed against a DOM stub');
const pickSrc = block(ai, 'function _openFcPicker(');
check('the picker is extractable', !!pickSrc);
if (pickSrc) {
  const run = (fcs, drive) => {
    const els = [];
    const mkEl = () => {
      const e = { id: '', className: '', innerHTML: '', style: {}, textContent: '', disabled: false,
        onclick: null, _attrs: {}, _listeners: {},
        getAttribute(k) { return this._attrs[k]; }, setAttribute(k, v) { this._attrs[k] = v; },
        addEventListener(ev, fn) { this._listeners[ev] = fn; },
        appendChild() {}, remove() { e._removed = true; } };
      return e;
    };
    const root = mkEl();
    let checkboxes = null;
    const ensureBoxes = () => {
      if (checkboxes) return checkboxes;
      // Derive each box's checked state from the RENDERED markup — hard-coding
      // checked=true here made the all-pre-checked assertion vacuous (caught by
      // mutation M3 refusing to go red on first run).
      const inputs = root.innerHTML.match(/<input type="checkbox" class="synth-fc"[^>]*>/g) || [];
      checkboxes = inputs.map((tag, i) => {
        const b = mkEl(); b.checked = /\schecked\s*>/.test(tag) || /\schecked\s/.test(tag);
        b.setAttribute('data-i', String((tag.match(/data-i="(\d+)"/) || [])[1] || i)); return b;
      });
      return checkboxes;
    };
    root.querySelector = sel => {
      const e = mkEl(); e._sel = sel; els.push(e); return e;
    };
    root.querySelectorAll = sel => /synth-fc\b/.test(sel) ? ensureBoxes() : [];
    const doc = { getElementById: () => null, createElement: () => root, body: { appendChild() {} } };
    let picked = null;
    // 4 Sep 2026 — the picker answers itself under an ARMED capture (golden campaign);
    // this suite is the human path, so the capture is disarmed and a bail would be a bug.
    const fn = new Function('document', '_ensurePanelStyles', '_applyPanelPalette', '_esc', '_capture', '_captureBail', 'console',
      pickSrc + '\nreturn _openFcPicker;')(
      doc, () => {}, () => {},
      s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
      { armed: false }, () => { throw new Error('bail must not fire on the human path'); }, { info() {} });
    fn(fcs, 'PASA', p => { picked = p; });
    const go = els.find(e => e._sel === '#synth-fc-go');
    if (drive) drive({ boxes: ensureBoxes(), go, root });
    return { picked, go, root, boxes: ensureBoxes() };
  };
  const FCS = [
    { fcId: 'FC-010', severity: 'Major',        fcDesc: 'major thing' },
    { fcId: 'FC-002', severity: 'Catastrophic', fcDesc: 'cat thing' },
    { fcId: 'FC-005', severity: 'Hazardous',    fcDesc: 'haz thing' },
    { fcId: 'FC-001', severity: 'Catastrophic', fcDesc: 'another cat' }
  ];

  const all = run(FCS, ({ go }) => { go.onclick(); });
  check('every condition is listed with a checkbox', all.boxes.length === 4);
  check('DEFAULT is do-them-all: no clicks beyond Go returns every condition',
    Array.isArray(all.picked) && all.picked.length === 4,
    'the ruling\'s "or do them all as a batch" is the pre-checked state');
  check('Catastrophic conditions are listed first',
    all.picked[0].severity === 'Catastrophic' && all.picked[1].severity === 'Catastrophic');
  check('…tie-broken by fcId', all.picked[0].fcId === 'FC-001' && all.picked[1].fcId === 'FC-002');

  const some = run(FCS, ({ boxes, go }) => { boxes[0].checked = false; boxes[2].checked = false; go.onclick(); });
  check('unchecking narrows the set to exactly what stayed checked',
    some.picked.length === 2 && some.picked.map(f => f.fcId).join(',') === 'FC-002,FC-010');

  const none = run(FCS, ({ boxes, go }) => { boxes.forEach(b => { b.checked = false; }); go.onclick(); });
  check('with nothing selected, Go does not fire the callback', none.picked === null);
}

console.log('\n[batch] synthesis chunks and asserts coverage per condition');
check('the unified synth call carries a chunk descriptor over the chosen FCs',
  /analysis: 'fta\.synthesize',[\s\S]{0,700}chunk: \{\s*\n\s*units: batch, size: 2, noun: 'failure condition',/.test(ai),
  'trees are the costliest rows the engine drafts — two per turn fits the budget');
check('coverage is keyed on fcId and counts ONLY add_fta_tree actions',
  /coveredBy: function \(a\) \{ return a && \(a\.op === 'add_fta_tree'\) \? \(a\.fhaFcId \|\| a\.fcId\) : null; \}/.test(ai),
  'a stray non-tree action echoing an fcId must not count as a synthesised tree');

console.log('\n[batch] it actually loads');
check('loader cache pin bumped past the fix (ai_assistant.js >= 73.2)', (() => {
  const m = loader.match(/ai_assistant\.js\?v=([\d.]+)/);
  return m && parseFloat(m[1]) >= 73.2;
})());

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
