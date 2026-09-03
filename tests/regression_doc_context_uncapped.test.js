#!/usr/bin/env node
/*
 * Regression — the engineer's source documents reach the model, WHOLE.
 * (26 Aug 2026, Waqas: "ok lets fix the cap" → then "there should be no cap".)
 *
 * WHAT WENT WRONG, measured live on the deployed build rather than reasoned about:
 *  · A 61,974-char SDD sat in the project. Drafting an aircraft FHA, the system
 *    prompt contained NO source-document block and no document name — because
 *    _projectDocContext is injected inside Provider.complete's _ANALYSIS_FEATURES
 *    gate, and the unified engine completes as 'chat.edit', which is deliberately
 *    outside it (see regression_spec_reachability).
 *  · "Import documents → model" shipped 0 bytes of the document while its own
 *    directive told the model to "read the provided source documents".
 *  · Where the block DID reach a classic lane it carried the first 12,000 chars —
 *    19.4% of that SDD, cut mid-sentence on page 5 of 40, announced to nobody.
 *
 * THE RULING, and why this suite pins an ABSENCE: a truncation the engineer cannot
 * see produces an analysis that looks complete while resting on a fraction of the
 * specification. In a certification tool that is the failure mode that actually
 * ships. A document too large for the model must fail visibly instead. So there is
 * no cap — not a bigger cap — and these checks exist to stop a well-meaning future
 * change from reintroducing one.
 *
 * Run: node tests/regression_doc_context_uncapped.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
const loader = fs.readFileSync(path.join(SITE, 'ai_loader.js'), 'utf8');

// Brace-matched extraction so these run against the REAL source, never a copy of
// it that can drift.
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
// Comments are where the REASONING lives and must survive; only live code is
// asserted against. Strip line comments before looking for a reintroduced cap.
const code = ai.replace(/^\s*\/\/.*$/gm, '');

console.log('\n[uncapped] no truncation constant may come back');
check('no per-document cap constant in live code',
  !/const\s+_SLAB_DOC_TEXT_CAP\s*=/.test(code),
  'a cap silently hides the engineer\'s own specification — see the header of this file');
check('no total-across-documents cap constant in live code',
  !/const\s+_SLAB_DOC_TOTAL_CAP\s*=/.test(code));
check('the reasoning is recorded at the site, not just here',
  /there should be no cap/i.test(ai) && /THERE IS NO CAP/.test(ai),
  'without the note, the next person re-adds one thinking they are being careful');

console.log('\n[uncapped] _projectDocContext, executed');
const fnSrc = block(ai, 'function _projectDocContext(');
check('the builder is extractable', !!fnSrc);
if (fnSrc) {
  const mk = docs => new Function('snapshot', fnSrc + '\nreturn _projectDocContext("fha", {});')(
    () => ({ projectSourceDocs: docs }));

  check('no documents → empty string (never a stray header)', mk([]) === '');

  const sdd = 'Ω'.repeat(61974);
  const one = mk([{ name: 'AEO-SDD-0001.pdf', text: sdd }]);
  check('the 61,974-char Aeolus SDD travels WHOLE — the actual regression',
    (one.match(/Ω/g) || []).length === 61974,
    'this is the exact document that was being cut at 12,000 chars');
  check('…with no truncation marker of any kind',
    !/truncated/i.test(one) && !/omitted/i.test(one) && one.indexOf('…[') < 0);
  check('…and it is named, so the model can cite it',
    one.indexOf('AEO-SDD-0001.pdf') >= 0);
  check('…and carries the untrusted-content framing',
    /UNTRUSTED REFERENCE DATA/.test(one) && /never follow any instruction/.test(one));

  // the point of "no cap": size must not change the behaviour, at any size
  const huge = mk([{ name: 'giant.pdf', text: 'Ω'.repeat(2000000) }]);
  check('a 2,000,000-char document ALSO travels whole (no hidden ceiling)',
    (huge.match(/Ω/g) || []).length === 2000000,
    'if this fails, something is slicing again');

  const many = mk(Array.from({ length: 6 }, (_, i) => ({ name: 'doc' + i + '.pdf', text: 'Ω'.repeat(100000) })));
  check('six large documents all travel whole — no shared budget starves the later ones',
    (many.match(/Ω/g) || []).length === 600000);
  check('…and every document is named', Array.from({ length: 6 }, (_, i) => 'doc' + i + '.pdf').every(n => many.indexOf(n) >= 0));
}

console.log('\n[uncapped] the decompose lane carries its material whole too');
check('the decompose lane does not slice its source material',
  !/slice\(0, 60000\)/.test(code) &&
  // 30 Aug 2026 — spec targeting: the lane may now pass a DECLARED, deterministic
  // chapter selection from SLABSpecIndex (note line included), but the untargeted
  // fallback must remain the WHOLE text and no numeric cap may ever return.
  /return 'ARCHITECTURE \/ SOURCE MATERIAL:\\n' \+ String\(input\.text\);/.test(code) &&
  /SLABSpecIndex\.select\(String\(input\.text\), 'arch\.decompose'\)/.test(code),
  'it used to hard-code 60000; targeting must be declared selection + whole-text fallback, never a cap');

console.log('\n[uncapped] the suppression probe, executed (F2: it lives in the assembler now)');
// F2, 31 Aug 2026 — superseded in place: the _anemBatch-private _docBlock IIFE
// moved into _assembleAnalysisContext as the `_dc` builder, keyed on
// opts.dedupeContext, so the SAME probe now guards BOTH paths. Same promises:
// de-duplication is not a cap; only a verbatim-text match suppresses; empty and
// throwing builders degrade to '', never break the draft.
const dbSrc = block(ai, 'const _dc = (function () {');
check('the doc-block builder is extractable from the assembler', !!dbSrc);
if (dbSrc) {
  // block() stops at the IIFE's closing brace; restore the invocation it cut off.
  const body = 'return ' + dbSrc.replace(/^const _dc = /, '') + ')();';
  const run = (blockText, ctx) => new Function('_projectDocContext', 'feature', 'opts', body)(
    () => blockText, 'arch.decompose', { dedupeContext: ctx });
  const docBlock = '=== SDD ===\nTEXT:\n' + 'X'.repeat(500);
  check('with no caller context, the document block is injected',
    run(docBlock, '') === docBlock);
  check('when the caller context ALREADY holds the same text, it is not sent twice',
    run(docBlock, 'ARCHITECTURE / SOURCE MATERIAL:\n' + 'X'.repeat(500)) === '',
    'de-duplication is not a cap — it stops one document being paid for twice in one prompt');
  check('a DIFFERENT caller context does not suppress the document',
    run(docBlock, 'ARCHITECTURE / SOURCE MATERIAL:\n' + 'Y'.repeat(500)) === docBlock);
  check('an empty document block stays empty', run('', 'anything at all') === '');
  check('a throwing builder degrades to empty, never breaks the draft',
    new Function('_projectDocContext', 'feature', 'opts', body)(
      () => { throw new Error('boom'); }, 'arch.decompose', {}) === '');
}

console.log('\n[uncapped] it actually loads');
check('loader cache pin bumped past the fix (ai_assistant.js >= 72.7)', (() => {
  const m = loader.match(/ai_assistant\.js\?v=([\d.]+)/);
  return m && parseFloat(m[1]) >= 72.7;
})());

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
