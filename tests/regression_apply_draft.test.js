#!/usr/bin/env node
/**
 * Regression — PROGRAMMATIC ACCEPT (3 Sep 2026).
 *
 * The capture seam made every lane's DRAFT reachable without the DOM. The
 * golden-thread campaign needs the other half: applying that draft through the
 * SAME executor the review panel's Accept uses, so a reference snapshot built
 * unattended is built by exactly the code an engineer's click runs. This pins
 * that contract, and that every item is ACCOUNTED for — applied, updated,
 * blocked, protected, unsupported — never silently dropped.
 * Run: node tests/regression_apply_draft.test.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ai = fs.readFileSync(path.join(__dirname, '..', 'site', 'ai_assistant.js'), 'utf8');
let pass = 0, fail = 0;
function check(n, c, d) { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } }
function extractFn(src, name) {
  const i = src.indexOf('function ' + name + '('); if (i < 0) return null;
  let depth = 0, started = false, inS = null, esc = false, line = false, blk = false;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    const c = src[k], n = src[k + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (blk) { if (c === '*' && n === '/') { blk = false; k++; } continue; }
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (inS) { if (c === inS) inS = null; continue; }
    if (c === '/' && n === '/') { line = true; k++; continue; }
    if (c === '/' && n === '*') { blk = true; k++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) return src.slice(i, k + 1); }
  }
  return null;
}

console.log('[1] the wiring');
check('applyDraft is on the public API, next to the capture seam', /applyDraft: _applyCapturedDraft,/.test(ai));
check('unified actions go through _chatRunActions — the SAME executor as the panel', /const res = _chatRunActions\(\[a\], model, undefined, feature\);/.test(ai));
check('add_fha rows get the batch assumptions matched exactly as the panel does', /a\._assumptions = _assumptionsFor\(asms, String\(a\.fcDesc \|\| ''\)\.trim\(\)\)/.test(ai));
check('HF rows go through the lane\'s own applier', /_applyHfDraftRow\(_HF_DRAFT_LANES\[opts\.lane\], a\)/.test(ai));

console.log('\n[2] executed — every item is accounted for');
{
  const calls = { run: [], hf: [], fha: [] };
  const ctx = {
    console, String, Object, Array, RegExp,
    MODELS: { reason: 'test-model' },
    _HF_DRAFT_LANES: { tid: { name: 'Task inventory' } },
    _assumptionsFor: (list, fc) => (list || []).filter(x => x.for === fc),
    _chatRunActions: (acts, model, _m, feature) => {
      calls.run.push({ op: acts[0].op, model, feature, asms: acts[0]._assumptions });
      const a = acts[0];
      if (a.op === 'blocked_op') return [{ ok: false, blocked: true, error: 'blocked by consistency check' }];
      if (a.op === 'add_fha' && a.fcDesc === 'edited one') return [{ ok: false, blocked: true, error: 'row for X (same phases) was edited by hand — not overwritten' }];
      if (a.op === 'add_fha' && a.fcDesc === 'redraft') return [{ ok: true, summary: 'AFHA FC updated in place — redraft' }];
      if (a.op === 'explode') throw new Error('kaboom');
      return [{ ok: true, summary: 'added' }];
    },
    _applyHfDraftRow: (cfg, x) => { calls.hf.push({ lane: cfg.name, k: x._k }); return x._k !== 'bad'; },
    _applyFhaSuggestion: Object.assign((s) => { calls.fha.push(s); return s.fcDesc === 'protect me' ? 'protected' : true; }, { _last: { action: 'add' } }),
    scheduleAutosave: () => {}, _aiConsistencyAutoCheck: () => {}
  };
  vm.createContext(ctx);
  vm.runInContext(extractFn(ai, '_applyCapturedDraft') + '; globalThis.__apply = _applyCapturedDraft;', ctx);

  const payload = {
    feature: 'fha.populate',
    assumptions: [{ for: 'gear', text: 'assumed retractable' }, { for: 'other', text: 'irrelevant' }],
    items: [
      { op: 'add_function', name: 'F1' },
      { op: 'add_fha', fcDesc: 'gear', judgementCall: true },
      { op: 'add_fha', fcDesc: 'redraft' },
      { op: 'add_fha', fcDesc: 'edited one' },
      { op: 'blocked_op' },
      { op: 'explode' },
      null,
      { weird: 1 }
    ]
  };
  const out = vm.runInContext('JSON.stringify(__apply(' + JSON.stringify(payload) + '))', ctx);
  const o = JSON.parse(out);
  check('applied / updated / protected / blocked / failed / unsupported each counted once',
    o.applied === 2 && o.updated === 1 && o.protected === 1 && o.blocked === 1 && o.failed === 1 && o.unsupported === 2, JSON.stringify(o));
  check('a judgement row is counted so the campaign can score it separately', o.judgement === 1);
  check('the count of items equals the count of results — nothing dropped', o.items === 8 && o.results.length === 8);
  check('the add_fha row received ONLY its own matched assumptions', calls.run.find(c => c.op === 'add_fha').asms.length === 1 && calls.run.find(c => c.op === 'add_fha').asms[0].text === 'assumed retractable');
  check('the executor was called with the draft\'s feature and the model', calls.run[0].feature === 'fha.populate' && calls.run[0].model === 'test-model');
  check('a throwing item is recorded as failed WITH its message, and the rest still run', o.results.some(r => /kaboom/.test(r.error || '')) && o.results.length === 8);

  const hf = JSON.parse(vm.runInContext('JSON.stringify(__apply(' + JSON.stringify({ feature: 'hf.draftlane', items: [{ _k: 'r1', task: 'x' }, { _k: 'bad' }] }) + ', { lane: "tid" }))', ctx));
  check('HF rows apply through the lane applier, good and bad both accounted', hf.applied === 1 && hf.failed === 1 && calls.hf.length === 2 && calls.hf[0].lane === 'Task inventory');
  const hfNoLane = JSON.parse(vm.runInContext('JSON.stringify(__apply(' + JSON.stringify({ feature: 'hf.draftlane', items: [{ _k: 'r1' }] }) + '))', ctx));
  check('an HF row with no lane given is UNSUPPORTED, never silently applied to the wrong lane', hfNoLane.unsupported === 1 && hfNoLane.applied === 0);

  const classic = JSON.parse(vm.runInContext('JSON.stringify(__apply(' + JSON.stringify({ feature: 'fha.populate', assumptions: [{ for: 'c1', text: 'a' }], items: [{ subId: 'S', fcDesc: 'c1' }, { subId: 'S', fcDesc: 'protect me' }] }) + '))', ctx));
  check('the classic FHA suggestion shape applies through _applyFhaSuggestion, protected counted', classic.applied === 1 && classic.protected === 1 && calls.fha[0]._assumptions.length === 1 && calls.fha[0]._model === 'test-model');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
