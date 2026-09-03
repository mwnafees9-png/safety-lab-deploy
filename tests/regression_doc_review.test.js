#!/usr/bin/env node
/*
 * Regression — FIG3-4 compliance-document review lane (2 Aug 2026).
 *
 * The last FAA Figure-3 use case. Waqas's rulings, encoded: NEUTRAL mismatch
 * framing (document and model are two witnesses — never presume which is
 * behind); document-level findings file as sourceDoc comments (nothing
 * important is quietly forgettable); coverage gaps reportable at ALL
 * severities. Advisory doctrine throughout: Accept files review comments;
 * the AI never edits the document or the model.
 *
 * Layers: [1] spec + registrations. [2] _modelDigest executed. [3] the accept
 * path executed against a real-shaped Review stub (anchor resolution: FHA →
 * req → FCIM → sourceDoc fallback). [4] wiring.
 *
 * Run: node tests/regression_doc_review.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const PIN = require('./lib/pinfloor.js');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const ai = S('ai_assistant.js'), asr = S('assurance_modules.js'), html = S('index.html');

// ---- [1] the spec + the three registrations ---------------------------------
console.log('\n[docrev] spec carries the rulings; feature registered everywhere it must be');
{
  const spec = (ai.match(/const _SPEC_DOCREV = \[[\s\S]*?\]\.join/) || [''])[0];
  check('spec exists, grounded (ARP4754B §5.4/§6, FAA Fig 3), advisory-only',
    /ARP4754B §5\.4 \/ §6/.test(spec) && /Figure 3 use case: compliance document review/.test(spec) && /ADVISORY ONLY/.test(spec));
  check('all five checks present (scope both directions, coverage, class/DAL, reqs, stale claims)',
    /SCOPE — /.test(spec) && /BOTH directions/.test(spec) && /COVERAGE — /.test(spec) &&
    /CLASSIFICATION \/ DAL/.test(spec) && /REQUIREMENTS — /.test(spec) && /STALE CLAIMS/.test(spec));
  check('RULING: neutral framing — "reconcile", never fix-the-document or fix-the-model',
    /NEUTRAL FRAMING/.test(spec) && /never presumes which is behind/.test(spec) && /Write "reconcile"/.test(spec));
  check('RULING: all-severity coverage gaps (where the doc claims that analysis)',
    /model conditions of ANY severity/.test(spec));
  check('grounding contract: verbatim quote ≤15 words — no quote, no finding',
    /VERBATIM quote of 15 words or fewer/.test(spec) && /A quote you cannot produce verbatim is a finding you do not have/.test(spec));
  check('abstain rule: silence is not a finding',
    /ABSTAIN — silence is not a finding/.test(spec));
  check('registered as an analysis feature (spec + doc-context auto-injection rides Provider.complete)',
    /'doc\.review': 1/.test(ai) && /'doc\.review': _SPEC_DOCREV/.test(ai));
  check('working-indicator label present', /'doc\.review': 'reviewing the compliance document'/.test(ai));
  check('token budget carries the 2 Aug lesson (16000, reasoning + findings)',
    /feature: 'doc\.review', model: MODELS\.reason[\s\S]{0,220}maxTokens: 16000/.test(ai));
}

// ---- [2] the model digest, executed -----------------------------------------
console.log('\n[docrev] _modelDigest: compact, ids + clipped text, stale flags ride');
{
  const m = ai.match(/function _modelDigest\(\)[\s\S]*?\n    \}/);
  check('digest builder extracted', !!m);
  const sb = { console, Object, String, Array, JSON, Number, Boolean };
  sb.window = { PROGRAM_PLAN: { CATALOGUE: [{ id: 'zsa', name: 'Zonal Safety' }, { id: 'ppfmea', name: 'Piece-part FMEA' }],
    laneOn: id => id === 'zsa' } };
  sb.snapshot = () => ({
    acFhaData: [{ fcId: 'FC-01', fcDesc: 'x'.repeat(200), severity: 'Catastrophic', phase: 'Landing', obsolete: true }],
    acReqData: [{ reqId: 'REQ-1', type: 'Safety', traceId: 'FC-01', reqSource: { obsolete: { reason: 'r' } } }],
    ftaPages: [{ name: 'T1', root: { name: 'top', allocatedDAL: 'A' }, targetP: 1e-9 }],
    systemsData: [{ id: 'FCS', name: 'Flight Controls', functions: [1, 2], fha: [1], fcim: [1, 2, 3] }],
    projectConfig: { staleLog: [{}, {}] }
  });
  sb._certBasis = () => 'Part 25';
  sb.acExtractedFCs = [{ id: 'SF-01-TL', desc: 'y'.repeat(200) }];
  vm.createContext(sb);
  vm.runInContext(m[0] + '\n; globalThis._d = _modelDigest;', sb);
  const d = sb._d();
  check('program plan lanes with committed flags (the SCOPE check\'s reference)',
    Array.isArray(d.programPlan) && d.programPlan.length === 2 && d.programPlan[0].committed === true && d.programPlan[1].committed === false);
  check('FHA + FCIM condition ids present, text clipped ≤90',
    d.fha[0].fcId === 'FC-01' && d.fha[0].desc.length <= 90 && d.fcimConditions[0].id === 'SF-01-TL' && d.fcimConditions[0].desc.length <= 90);
  check('stale flags ride into the digest (the STALE-CLAIMS check needs them)',
    d.fha[0].stale === true && d.requirements[0].stale === true && d.staleLog === 2);
  check('trees carry top DAL + target (the DAL check\'s reference)',
    d.faultTrees[0].topDal === 'A' && d.faultTrees[0].targetP === 1e-9);
  check('plan module absent ⇒ named unverifiable, never a throw', (function () {
    const sb2 = Object.assign({}, sb); sb2.window = {};
    vm.createContext(sb2); vm.runInContext(m[0] + '\n; globalThis._d = _modelDigest;', sb2);
    return /unverifiable|unavailable/.test(String(sb2._d().programPlan));
  })());
}

// ---- [3] the accept path, executed ------------------------------------------
console.log('\n[docrev] accept path: anchor to the artifact, fall back to the document');
{
  const m = ai.match(/function _applyDocrevFinding\(f\)[\s\S]*?\n    \}/);
  check('apply function extracted', !!m);
  const filed = [];
  const sb = { console, Object, String, Array, JSON, Date };
  sb.Review = { addComment: (target, body) => { const c = { target, body }; filed.push(c); return c; } };
  sb.acFhaData = [{ internalId: 11, fcId: 'FC-07' }];
  sb.acReqData = [{ internalId: 22, reqId: 'REQ-AC-003' }];
  sb.acFcimData = [{ internalId: 33, tlId: 'SF-02-TL', plId: 'SF-02-PL', mId: '' }];
  sb._toast = () => {}; sb.scheduleAutosave = () => {};
  vm.createContext(sb);
  vm.runInContext(m[0] + '\n; globalThis._a = _applyDocrevFinding;', sb);
  const base = { type: 'classification-mismatch', docName: 'PSSA Report', page: '14', quote: 'classified Hazardous', statement: 'Doc says Hazardous; model FHA says Catastrophic — reconcile.', whyItMatters: 'targets differ', _model: 'm' };
  check('FHA anchor: fcId match files on the FHA row',
    sb._a(Object.assign({}, base, { modelRef: 'FC-07' })) === true && filed[0].target.kind === 'acFha' && filed[0].target.id === 11);
  check('requirement anchor by reqId', sb._a(Object.assign({}, base, { modelRef: 'REQ-AC-003' })) === true && filed[1].target.kind === 'acReq' && filed[1].target.id === 22);
  check('FCIM anchor by any cell id', sb._a(Object.assign({}, base, { modelRef: 'SF-02-PL' })) === true && filed[2].target.kind === 'acFcim' && filed[2].target.id === 33);
  check('RULING: no anchor ⇒ files on the DOCUMENT (sourceDoc kind, id = doc name)',
    sb._a(Object.assign({}, base, { modelRef: '' })) === true && filed[3].target.kind === 'sourceDoc' && filed[3].target.id === 'PSSA Report');
  check('dangling citation: unknown id also lands on the document AND says the id is not in the model',
    sb._a(Object.assign({}, base, { type: 'dangling-citation', modelRef: 'FC-99' })) === true &&
    filed[4].target.kind === 'sourceDoc' && /FC-99 \(NOT FOUND in the model — that is the finding\)/.test(filed[4].body));
  check('the comment body carries the advisory header, quote, page, and neutral statement',
    /COMPLIANCE-DOCUMENT REVIEW FINDING \(AI-drafted, advisory — nothing was changed\)/.test(filed[0].body) &&
    /\[PSSA Report p\.14\] "classified Hazardous"/.test(filed[0].body) && /reconcile/.test(filed[0].body));
  check('filed comments carry AI provenance', filed.every(c => c.aiGenerated === true && c.aiFeature === 'doc.review'));
  check('the accept path NEVER resolves/edits — no resolveComment, no artifact writes in the lane',
    !/resolveComment/.test(m[0]) && !/\.push\(/.test(m[0]));
}

// ---- [4] wiring -------------------------------------------------------------
console.log('\n[docrev] wiring');
{
  check('launcher menu entry present',
    /Review compliance document/.test(ai) && /Audit AI Inputs against the live model/.test(ai));
  // 3 Sep 2026 — the lane entry points are now wrapped by _captureGuard so a
  // refusal resolves an armed capture instead of hanging it. The export is the
  // same function; only the expression around it changed. Accept either form,
  // and keep pinning that it IS reviewComplianceDoc behind the wrapper.
  check('exported on the AI surface', /reviewComplianceDoc:\s+(?:_captureGuard\('reviewComplianceDoc', )?reviewComplianceDoc/.test(ai));
  check('sourceDoc kind labelled + ordered in the review registry',
    /sourceDoc: 'Source Documents'/.test(asr) && /'stpaScope', 'sourceDoc'[,\]]/.test(asr));   // HF kinds may follow sourceDoc (1 Sep 2026)
  const pin = f => { const m2 = html.match(new RegExp('<script src="' + f + '\\?v=([0-9.]+)"')); return m2 ? m2[1] : null; };
  check('ai_loader ≥4.6 pulling ai_assistant ≥71.5',
    PIN.pinAtLeast(pin('ai_loader.js'), '4.6') && PIN.atLeast(S('ai_loader.js'), 'ai_assistant.js', '71.5'));
  check('assurance_modules ≥1.16 (carries the sourceDoc kind)', PIN.pinAtLeast(pin('assurance_modules.js'), '1.16'));
  check('no-docs guard: the lane refuses without AI Inputs instead of auditing nothing',
    /No source documents in your AI Inputs yet/.test(ai));
  check('cap announced, never silent (§ no-silent-caps)',
    /findings drafted — showing the first/.test(ai));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
