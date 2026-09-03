#!/usr/bin/env node
/*
 * Regression — two findings from Waqas testing FCIM generation on a fresh project
 * (26 Aug 2026: "it gives an error for FCIM generation").
 *
 * IT WAS NOT AN ERROR. Read back from the live session's lastRaw(): the model
 * returned valid JSON, stop_reason end_turn, insufficient_information:true, a
 * reasoned three-paragraph explanation and THREE labelled choices. The engineer
 * saw "AI error: …" in a warning toast and nothing else.
 *
 * FINDING 1 — _SPEC_FCIM contradicted itself and inverted the golden thread.
 *   It carried a stale layer treating the FCIM as an indication/mitigation matrix
 *   built on top of a finished AFHA: "REQUIRED INPUTS: existing FHA rows …
 *   otherwise return insufficient_information", "one row per failure condition",
 *   and a Severity column — against the Table A3 lines above it saying "one row
 *   per function in the decomposition" and "NO SEVERITY WORDS IN CELLS".
 *   Live proof of the contradiction: with 22 functions and an empty AFHA, the
 *   product's own gap detector reported SF-001…SF-022 as needing FCIM while the
 *   spec told the model it must not proceed.
 *   Waqas ruling: "FCIM is first and then FCIM feeds the FHA."
 *
 * FINDING 2 — the batch path binned the model's answer. On insufficiency it
 *   showed _toast('AI error: …'); on zero actions it showed the first 160 chars
 *   of the reply in a transient info toast. `choices` was discarded both times.
 *   In a product whose posture is that a grounded refusal beats a fabricated
 *   answer, the refusal was the one output being treated as a defect.
 *
 * Run: node tests/regression_fcim_first_and_abstention_panel.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
const loader = fs.readFileSync(path.join(SITE, 'ai_loader.js'), 'utf8');

function block(src, startMarker) {
  const i = src.indexOf(startMarker);
  if (i < 0) return null;
  let j = src.indexOf('{', i), depth = 0, inS = null, esc = false;
  for (let k = j; k < src.length; k++) {
    const c = src[k];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (inS) { if (c === inS) inS = null; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  return null;
}
const specSrc = (ai.match(/const _SPEC_FCIM = \[[\s\S]*?\]\.join\('\\n'\);/) || [''])[0];
// only the spec STRINGS govern the model; // comments in the block are for humans
const specText = specSrc.replace(/^\s*\/\/.*$/gm, '');

console.log('\n[fcim] the spec no longer inverts the golden thread');
check('the spec block is findable', specSrc.length > 500);
check('FHA rows are NOT a required input any more',
  !/REQUIRED INPUTS: existing FHA rows/.test(specText),
  'this line made the FCIM depend on its own output');
check('…and the required input is the function decomposition',
  /REQUIRED INPUTS: the FUNCTION DECOMPOSITION/.test(specText));
check('the ordering ruling is stated explicitly to the model',
  /FCIM comes FIRST and FEEDS the AFHA/.test(specText),
  'Waqas, 26 Aug: "FCIM is first and then FCIM feeds the FHA"');
check('the model is forbidden from refusing for want of FHA rows',
  /NEVER return insufficient_information for want of them/.test(specText),
  'the exact behaviour observed live on 26 Aug');
check('notation says one row per FUNCTION, matching the Table A3 line above it',
  /NOTATION: one row per function/.test(specText) &&
  !/NOTATION: one row per failure condition/.test(specText));
check('no Severity column survives in the FORMAT line',
  /FORMAT:/.test(specText) && !/\| Severity \|/.test(specText),
  'it contradicted "NO SEVERITY WORDS IN CELLS" three lines earlier');
check('the ungroundable columns abstain per A10 instead of blocking the matrix',
  /leave those fields EMPTY/i.test(specText) && /Refusing the matrix is not/.test(specText));
check('the Table A3 function-row shape is still intact (not broken by the edit)',
  /one row per function in the decomposition/.test(specText));

console.log('\n[abstention] the model\'s own words survive the error path');
check('the insufficiency error carries the parsed payload',
  /e\.parsed = _safeParseJson\(String\(result\.text \|\| ''\)\)/.test(ai),
  'without it every caller can only show a one-line reason');
// 26 Aug (same day, later) — the handling moved into the chunk loop: a slice that
// declines is remembered rather than aborting the draft, and the panel opens only
// if NOTHING was drafted across all slices. Same guarantee, correct granularity.
check('_anemBatch routes a reasoned abstention to a panel, not an error toast',
  /if \(e && e\.isInsufficient\) \{[\s\S]{0,160}_declined = \{ parsed: e\.parsed, insufficient: e\.insufficient \}/.test(ai) &&
  /if \(_declined\) \{ _anemNoActionsPanel\(cfg, _declined\.parsed, _declined\.insufficient, _rerun\); return; \}/.test(ai));
check('…a slice that declines does not discard the slices that worked',
  /continue;\s*\/\/ one slice declining must not discard/.test(ai),
  'aborting the whole draft on one declined slice would lose completed rows');
// 3 Sep 2026 — the message now names the exhausted retry budget rather than a bare
// "AI error", because a turn only reaches this line after _TURN_TRIES attempts.
check('…and genuine errors still toast as errors, naming the attempts they burned',
  /_toast\('Nothing drafted — every turn failed after ' \+ _TURN_TRIES \+ ' attempts\. Last error: ' \+ \(\(_hardErr && _hardErr\.message\) \|\| _hardErr\)/.test(ai) && /return;/.test(ai));
check('the zero-actions path no longer truncates the reply into a toast',
  !/_toast\(parsed\.reply \? String\(parsed\.reply\)\.slice\(0, 160\)/.test(ai) &&
  /if \(!actions\.length\) \{ _anemNoActionsPanel\(cfg, parsed, null, _rerun\); return; \}/.test(ai));
check('a chosen option re-runs the SAME directive with the engineer\'s steer',
  /ENGINEER CHOSE: /.test(ai) && /const _rerun = function \(steer\)/.test(ai));

console.log('\n[abstention] the panel, executed against a DOM stub');
const panelSrc = block(ai, 'function _anemNoActionsPanel(');
check('the panel builder is extractable', !!panelSrc);
if (panelSrc) {
  // Minimal DOM good enough for the builder: innerHTML is captured verbatim and
  // querySelector hands back click-recording stubs.
  const mkDom = () => {
    const made = [];
    const el = () => {
      const e = { id: '', className: '', innerHTML: '', style: {}, onclick: null,
        _attrs: {}, getAttribute(k) { return this._attrs[k]; }, setAttribute(k, v) { this._attrs[k] = v; },
        appendChild() {}, remove() { e._removed = true; } };
      return e;
    };
    const root = el();
    root.querySelector = sel => { const q = el(); made.push({ sel, q }); return q; };
    root.querySelectorAll = sel => {
      if (!/ai-noact-choice/.test(sel)) return [];
      const n = (root.innerHTML.match(/class="ai-noact-choice"/g) || []).length;
      return Array.from({ length: n }, (_, i) => { const b = el(); b.setAttribute('data-i', String(i)); made.push({ sel, q: b }); return b; });
    };
    return { root, made };
  };
  const run = (cfg, parsed, insuf, rerun) => {
    const dom = mkDom();
    const document_ = {
      getElementById: () => null,
      createElement: () => dom.root,
      body: { appendChild() {} }
    };
    // 4 Sep 2026 — the panel now consults THE CAPTURE SEAM before rendering, so the
    // sandbox supplies a disarmed _capture. Disarmed is the posture that must render:
    // this suite is the proof the seam is INERT in normal use.
    const fn = new Function('document', '_ensurePanelStyles', '_applyPanelPalette', '_esc', '_toast', '_capture', '_captureFire',
      panelSrc + '\nreturn _anemNoActionsPanel;')(
      document_, () => {}, () => {}, s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])), () => {},
      { armed: false }, () => { throw new Error('_captureFire must not run while disarmed'); });
    fn(cfg, parsed, insuf, rerun);
    return dom;
  };

  const parsed = {
    reply: 'I can\'t build the FCIM yet. CURRENT PROJECT STATE shows acFha:[] — there are 22 aircraft functions but ZERO AFHA failure conditions authored.',
    choices: [
      { label: 'Build the AFHA first', detail: 'You load AFHA rows, then I generate the full FCIM.' },
      { label: 'FCIM capability phrases only', detail: 'No awareness/indications.', recommended: true },
      { label: 'I\'ll import the FHA myself first', detail: 'You do it.' }
    ]
  };
  const insuf = { reason: 'no failure conditions authored', missing: ['AFHA failure conditions'] };

  const d1 = run({ title: '✨ AI-drafted FCIM · review' }, parsed, insuf, () => {});
  const h1 = d1.root.innerHTML;
  check('the model\'s FULL reply is rendered — not 160 characters of it',
    h1.indexOf('ZERO AFHA failure conditions authored') >= 0,
    'the sentence that explains the refusal sits past the old 160-char cut');
  check('all three choices become buttons', (h1.match(/class="ai-noact-choice"/g) || []).length === 3);
  check('each choice shows its label and detail',
    h1.indexOf('Build the AFHA first') >= 0 && h1.indexOf('No awareness/indications.') >= 0);
  check('the recommended choice is marked once', (h1.match(/★ RECOMMENDED/g) || []).length === 1);
  check('the named-missing inputs are listed', h1.indexOf('AFHA failure conditions') >= 0);
  check('it is framed as an abstention, not a failure',
    /considered abstention, not a failure/.test(h1) && /nothing was written to the project/.test(h1));
  check('the title comes from the calling feature', h1.indexOf('AI-drafted FCIM') >= 0);

  // clicking a choice must re-run with THAT choice's text
  let steer = null;
  const d2 = run({ title: 't' }, parsed, null, s => { steer = s; });
  const btns = d2.made.filter(m => /ai-noact-choice/.test(m.sel)).map(m => m.q);
  check('a choice button is wired to the re-run', btns.length === 3 && typeof btns[1].onclick === 'function');
  if (btns[1] && btns[1].onclick) {
    btns[1].onclick();
    check('clicking the second choice re-runs with the second choice\'s text',
      steer === 'FCIM capability phrases only — No awareness/indications.',
      'got: ' + steer);
  }

  // degradation: no choices at all still renders the reasoning
  const d3 = run({ title: 't' }, { reply: 'Nothing to do here.' }, null, () => {});
  check('with no choices it still shows the reasoning and no empty menu',
    d3.root.innerHTML.indexOf('Nothing to do here.') >= 0 &&
    d3.root.innerHTML.indexOf('HOW TO PROCEED') < 0);
  const d4 = run({ title: 't' }, null, insuf, () => {});
  check('with no parsed payload it falls back to the insufficiency reason',
    d4.root.innerHTML.indexOf('no failure conditions authored') >= 0);
  check('the reply is HTML-escaped (a document can put markup in the model\'s mouth)',
    run({ title: 't' }, { reply: '<img src=x onerror=alert(1)>' }, null, () => {})
      .root.innerHTML.indexOf('&lt;img') >= 0);
}

console.log('\n[fcim] it actually loads');
check('loader cache pin bumped past the fix (ai_assistant.js >= 72.8)', (() => {
  const m = loader.match(/ai_assistant\.js\?v=([\d.]+)/);
  return m && parseFloat(m[1]) >= 72.8;
})());

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
