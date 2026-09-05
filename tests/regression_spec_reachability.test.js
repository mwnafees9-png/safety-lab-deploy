#!/usr/bin/env node
/*
 * Regression — the specs reach the path the product actually takes
 * (2 Aug 2026, prompted by Waqas asking "ANEM has the same Specs as the
 * Assistant?" — the honest answer was "almost", and this closes the gap).
 *
 * THE WIRING, pinned so it cannot silently regress:
 *  · Classic per-feature calls: Provider.complete injects
 *    _FEATURE_SPECS[feature] for every feature in _ANALYSIS_FEATURES.
 *  · Unified batch (_anemBatch — the PRIMARY path, _useUnifiedFeatures()
 *    defaults true): runs as feature 'chat.edit', which is deliberately NOT in
 *    _ANALYSIS_FEATURES — so before this change the full spec blocks never
 *    reached it, only the condensed directives. Now _anemBatch injects
 *    _FEATURE_SPECS[cfg.analysis] itself.
 *  · Free-form chat: keeps the condensed op contract BY DESIGN (fifteen specs
 *    per turn is bloat); the op lines are its contract, kept honest by the
 *    §4.6 grep-the-accept-path rule. That design choice is asserted here as a
 *    choice, not left as an accident someone re-discovers.
 *
 * Run: node tests/regression_spec_reachability.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');

console.log('\n[spec] classic path injection');
// 29 Aug 2026 — superseded in place (Skills V1): the spec now resolves
// registry-first through _skillBodyFor with the inline table as fallback.
// The INTENT is unchanged — the spec text reaches the prompt for analysis
// features — and regression_ai_skills proves the two sources byte-identical.
// F2, 31 Aug 2026 — superseded in place: the gate's body moved wholesale into
// _assembleAnalysisContext, so the classic injection is now gate -> assembler
// -> spec. Same intent as 2 Aug: the spec text reaches the prompt for every
// analysis feature.
check('Provider.complete injects the spec for analysis features (via the assembler)',
  /const wantInsuf = _ANALYSIS_FEATURES\[opts\.feature\] === 1;/.test(ai) &&
  /if \(wantInsuf && opts\.system\) \{/.test(ai) &&
  /opts\.system = await _assembleAnalysisContext\(opts\.feature, opts\.system, opts\);/.test(ai) &&
  /const _spec = _skillBodyFor\(feature\) \|\| _FEATURE_SPECS\[feature\];/.test(ai));

console.log('\n[spec] the unified batch — the primary path');
// 26 Aug 2026 — this pin is SUPERSEDED in place, deliberately. It fixed the exact
// composition `_specBlock + systemExtra + ABSTAIN` because on 2 Aug those were the
// only two things the batch had to compensate for. Measured live on 26 Aug, two
// more were missing on the same primary path: the engineer's SOURCE DOCUMENTS and
// the F6 assumptions contract (a 61,974-char SDD on file reached the FHA prompt as
// zero bytes; "Import documents → model" shipped none of it either). Both are now
// compensated the same way, so the pinned shape grows to match. The INTENT is
// unchanged and is what actually matters: whatever Provider.complete gives the
// classic lanes behind the _ANALYSIS_FEATURES gate, _anemBatch must hand to the
// primary path itself, because 'chat.edit' is outside that gate BY DESIGN.
// 26 Aug evening — the pinned composition grew a FIFTH compensation: _zonalBlock
// (zones, routings, and the deterministic particular-risk applicability list),
// found absent from the primary path's prompt by the same live capture probe
// that found the documents missing. Same intent as ever: whatever the classic
// lanes get behind the _ANALYSIS_FEATURES gate, _anemBatch hands to the primary
// path itself.
// F2, 31 Aug 2026 — SUPERSEDED IN PLACE a third time, and this one closes the
// series: the compensations themselves are gone. The pinned composition
// (_specBlock + _docBlock + _zonalBlock + systemExtra + ABSTAIN, wrapped in the
// assumptions contract) was five hand-copied fragments of Provider.complete's
// gate; the 31 Aug refactor moved the gate's WHOLE body into
// _assembleAnalysisContext and made BOTH sites call it — the classic lanes via
// the gate, _anemBatch directly, keyed on cfg.analysis. The intent pinned here
// is unchanged since 2 Aug: whatever the classic lanes get behind the
// _ANALYSIS_FEATURES gate, the primary path gets too, with 'chat.edit' outside
// that gate BY DESIGN — the exclusion now an explicit parameter, not a copy.
check('ONE assembler exists and both paths call it',
  /async function _assembleAnalysisContext\(feature, system, opts\)/.test(ai) &&
  /opts\.system = await _assembleAnalysisContext\(opts\.feature, opts\.system, opts\);/.test(ai) &&
  // 5 Sep 2026 — the second argument is now the lane-gated _abstainForLane
  // rather than an unconditional + _ABSTAIN_RULE (the FHA lanes carry the
  // judgement contract instead). The INVARIANT this check exists for is
  // untouched: both paths still go through the one assembler.
  /const _sysExtra = await _assembleAnalysisContext\(cfg\.analysis \|\| '', String\(cfg\.systemExtra \|\| ''\) \+ _abstainForLane,/.test(ai),
  'the fork is retired only while BOTH call sites go through the one function');
check('the hand-copied compensations are gone from _anemBatch',
  !/const _specBlock =/.test(ai) && !/const _docBlock =/.test(ai) && !/const _zonalBlock =/.test(ai),
  'a surviving compensation means the fork quietly re-opened');
check('the assembler carries every block the classic lanes had (spec, thread, docs, exemplars, memory, corpus, zonal, contracts)',
  (function () {
    const m = ai.match(/async function _assembleAnalysisContext[\s\S]*?\n    \}/);
    if (!m) return false;
    const body = m[0];
    return /_skillBodyFor\(feature\) \|\| _FEATURE_SPECS\[feature\]/.test(body)
        && /_goldenThreadContext\(feature, opts\)/.test(body)
        && /_projectDocContext\(feature, opts\)/.test(body)
        && /AiFidelity\.exemplarsFor/.test(body)
        && /_memoryExemplars\(String\(feature \|\| ''\)\)/.test(body)
        && /A15_CORPUS\.groundingBlock/.test(body)
        && /_ZONAL_FEATURES\[feature\] === 1/.test(body)
        && /_withAssumptionsClause\(sys\)/.test(body)
        && /_withBasisClause\(sys, feature\)/.test(body)
        && /_withInsufficiencyClause\(sys\)/.test(body);
  })(),
  'a block missing here is missing from BOTH paths at once — the failure mode inverted');
check('the decompose dedupe probe moved WITH the doc block (60k-SDD-twice guard)',
  (function () {
    const m = ai.match(/async function _assembleAnalysisContext[\s\S]*?\n    \}/);
    return !!m && /opts\.dedupeContext/.test(m[0]) && /indexOf\('TEXT:\\n'\)/.test(m[0]) && /dedupeContext: _ctxStr/.test(ai);
  })(),
  'without it the decompose lane ships the SDD twice again');
check('the injection is keyed on cfg.analysis, which every unified caller passes',
  (function () {
    // every _anemBatch(...) call with a _FEATURE_DIRECTIVE must carry analysis:
    const calls = ai.match(/_anemBatch\(_FEATURE_DIRECTIVE\.[a-z]+[^)]*\{[^}]*\}/g) || [];
    return calls.length >= 6 && calls.every(c => /analysis:/.test(c));
  })(),
  'a unified caller without analysis: gets no spec — if one is ever added, name its analysis'),
check('the unified feature ids in _FEATURE_SPECS cover what the batch callers name',
  (function () {
    const named = [...new Set((ai.match(/analysis: '([a-z.]+)'/g) || []).map(s => s.slice(11, -1)))];
    const specs = (ai.match(/const _FEATURE_SPECS = \{[\s\S]*?\};/) || [''])[0];
    // doc.import mirrors (spec-less by design); chat.edit is the generic Ask-AI
    // batch — heterogeneous, no single spec applies. Everything analytic must map,
    // including the 'fha' ALIAS the unified FHA batch names itself with.
    const misses = named.filter(a => a !== 'doc.import' && a !== 'chat.edit' && specs.indexOf("'" + a + "'") === -1);
    return misses.length === 0;
  })(), 'a named analysis with no spec entry silently runs bare');

console.log('\n[spec] the chat — a design choice, stated');
check('chat/unified run as chat.edit, outside _ANALYSIS_FEATURES',
  /feature: 'chat\.edit'/.test(ai) && !/'chat\.edit': 1/.test((ai.match(/const _ANALYSIS_FEATURES = \{[\s\S]*?\};/) || [''])[0]));
check('the choice is documented at the injection site',
  /the free-form chat keeps the\s*\n?\s*\/\/ condensed op contract by design/.test(ai) || /chat keeps the[\s\S]{0,80}condensed op contract by design/.test(ai));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
