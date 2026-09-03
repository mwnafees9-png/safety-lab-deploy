#!/usr/bin/env node
/**
 * Regression — the campaign driver (4 Sep 2026).
 *
 * The driver lives in the repo because the 3 Sep campaign died three times with
 * its logic in a console scratchpad, and 4 Sep lost two draws because a result
 * lived only in a page variable. This suite EXECUTES it against a fake app: a
 * draw that lands, a draw that is interrupted, a draw whose lane call throws,
 * the mutation assertion, and the consistency scorer.
 * Run: node tests/regression_campaign_driver.test.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'eval', 'campaign_driver.js'), 'utf8');
let pass = 0, fail = 0;
function check(n, c, d) { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } }

function mkCtx(opts) {
  opts = opts || {};
  const store = {};
  const ctx = {
    console: { info() {}, warn() {} }, JSON, Math, Date, String, Object, Promise, Error, Array,
    setTimeout, clearTimeout,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { title: 'Aeolus D1' },
    acFhaData: { length: 253 }, acAssumptionsData: { length: 0 }
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  ctx.SafetyLabAI = {
    MODELS: { reason: 'claude-sonnet-4-6' }, evalFresh: false,
    _pending: null,
    captureNextDraft(ms) { const self = this; return new Promise((res, rej) => { self._pending = { res, rej }; if (opts.neverResolve) return; }); },
    captureCancel() { if (this._pending) { this._pending.rej(new Error('capture cancelled')); this._pending = null; } },
    populateFha(o) { ctx.__lastCall = { fn: 'populateFha', o }; if (opts.callThrows) throw new Error('boom'); if (opts.neverResolve) return; setTimeout(() => { if (this._pending) { this._pending.res(opts.payload); this._pending = null; } }, 5); },
    populateFcim(o) { ctx.__lastCall = { fn: 'populateFcim', o }; setTimeout(() => { if (this._pending) { this._pending.res(opts.payload); this._pending = null; } }, 5); },
    draftHfLane(l) { ctx.__lastCall = { fn: 'draftHfLane', o: l }; setTimeout(() => { if (this._pending) { this._pending.res(opts.payload); this._pending = null; } }, 5); },
    decompose() {}, draftPra() {}, draftZsa() {}, draftCma() {}, draftFmea() {}
  };
  vm.createContext(ctx); vm.runInContext(SRC, ctx);
  return ctx;
}
const payload = (rows, extra) => Object.assign({ skill: 'fha.draft@v5#d9c0a41a', feature: 'fha', declined: false,
  items: rows, assumptions: [{ text: 'a' }], coverage: { total: 3, covered: 3 }, verifyReport: { ran: true } }, extra || {});

console.log('[0] the store survives junk');
{
  const c = mkCtx({ payload: payload([]) });
  c.localStorage.setItem('slab.campaign.v1', '{"notRuns":1}');       // valid JSON, wrong shape
  check('a store of the wrong shape reads as empty instead of exploding on .runs', c.SLCampaign.read().runs.length === 0 && c.SLCampaign.pending().length === 0);
  c.localStorage.setItem('slab.campaign.v1', 'not json at all');
  check('an unparseable store reads as empty too', c.SLCampaign.read().runs.length === 0);
  c.localStorage.setItem('slab.campaign.v1', 'null');
  check('a null store reads as empty', c.SLCampaign.read().runs.length === 0);
}

console.log('[1] shape');
{
  const c = mkCtx({ payload: payload([]) });
  check('driver exposes runs / draw / score / pending / summary and the lane list',
    ['runs', 'draw', 'score', 'pending', 'summary', 'read', 'clear', 'exportJson'].every(k => typeof c.SLCampaign[k] === 'function' || k === 'read') && Array.isArray(c.SLCampaign.LANES));
  check('every lane the campaign needs is present',
    ['fha', 'fhaFuncs', 'fcim', 'decompose', 'pra', 'zsa', 'cma', 'fmea', 'hf'].every(l => c.SLCampaign.LANES.indexOf(l) >= 0), c.SLCampaign.LANES.join(','));
  check('the driver adds NO prompt of its own — it only calls the app\'s public entry points',
    !/system:|_anemBatch|prompt/i.test(SRC.replace(/\/\/[^\n]*/g, '')));
  check('it never touches the DOM', !/querySelector|getElementById|\.click\(/.test(SRC));
}

(async function () {
  console.log('\n[2] EXECUTED — a draw that lands');
  {
    const c = mkCtx({ payload: payload([{ srcCondId: 'SF-001-TL', severity: 'Catastrophic', effAcLevel: 'hull loss' }]) });
    const r = await c.SLCampaign.draw('t-r1', 'fha', ['SF-001-TL']);
    check('the lane was called through the app\'s own function, with the ids', c.__lastCall.fn === 'populateFha' && c.__lastCall.o.condIds.join() === 'SF-001-TL');
    check('evalFresh is set, or the draw is a cached echo (campaign finding #1)', c.SafetyLabAI.evalFresh === true);
    check('the record captures rows, skill stamp, model, coverage and the verifier report',
      r.ok === true && r.n === 1 && r.skill === 'fha.draft@v5#d9c0a41a' && r.model === 'claude-sonnet-4-6' && r.coverage.total === 3 && r.verifyReport.ran === true);
    check('it ASSERTS the seam\'s promise every draw — the project was not mutated', r.mutated.fha === 0 && r.mutated.asm === 0);
    check('the finished record replaced the started one (upsert by tag, no duplicates)',
      c.SLCampaign.read().runs.length === 1 && c.SLCampaign.read().runs[0].state === 'done');
    check('nothing is left pending', c.SLCampaign.pending().length === 0);
  }

  console.log('\n[3] EXECUTED — the failures that cost real draws');
  {
    // an interrupted draw must be VISIBLE, not vanish (rule 25)
    const c = mkCtx({ neverResolve: true, payload: payload([]) });
    c.SLCampaign.draw('t-r1', 'fha', ['SF-001-TL']);           // deliberately not awaited
    await new Promise(r => setTimeout(r, 20));
    check('a draw in flight has already written a "started" record before any result',
      c.SLCampaign.read().runs.length === 1 && c.SLCampaign.read().runs[0].state === 'started');
    check('and pending() names it, so an interrupted campaign is recoverable rather than silent',
      c.SLCampaign.pending().join() === 't-r1');

    const c2 = mkCtx({ callThrows: true, payload: payload([]) });
    const r2 = await c2.SLCampaign.draw('x-r1', 'fha', ['SF-001-TL']);
    check('a lane call that throws is recorded as a failure, not left armed', r2.ok === false && /call threw: boom/.test(r2.error));

    const c3 = mkCtx({ payload: payload([]) });
    const r3 = await c3.SLCampaign.draw('y-r1', 'nope', []);
    check('an unknown lane fails loudly rather than doing nothing', r3 && r3.ok === false && /unknown lane/.test(r3.error));

    const c4 = mkCtx({ payload: payload([{ srcCondId: 'A' }]) });
    c4.acFhaData.length = 253;
    const orig = c4.SafetyLabAI.populateFha.bind(c4.SafetyLabAI);
    c4.SafetyLabAI.populateFha = function (o) { c4.acFhaData.length = 254; return orig(o); };   // simulate a leak
    const r4 = await c4.SLCampaign.draw('m-r1', 'fha', ['A']);
    check('a draw that DID mutate the project is flagged in the record, never assumed clean', r4.mutated.fha === 1);
  }

  console.log('\n[4] EXECUTED — the consistency scorer');
  {
    const c = mkCtx({ payload: null });
    const mk = (tag, rows) => { const s = c.SLCampaign.read(); s.runs.push({ tag, ok: true, state: 'done', secs: 60, items: rows }); c.localStorage.setItem('slab.campaign.v1', JSON.stringify(s)); };
    mk('z-r1', [{ srcCondId: 'A', severity: 'Catastrophic', effAcLevel: 'hull loss', effCrewLevel: 'fatalities or incapacitation', effPaxLevel: 'multiple fatalities' },
                { srcCondId: 'B', severity: 'Major', effAcLevel: 'significant', effCrewLevel: 'significant', effPaxLevel: 'discomfort' },
                { srcCondId: 'C', severity: 'Hazardous', effAcLevel: 'large', effCrewLevel: 'large', effPaxLevel: 'severe injuries or few fatalities' }]);
    mk('z-r2', [{ srcCondId: 'A', severity: 'Catastrophic', effAcLevel: 'hull loss', effCrewLevel: 'fatalities or incapacitation', effPaxLevel: 'multiple fatalities' },
                { srcCondId: 'B', severity: 'Hazardous', effAcLevel: 'large', effCrewLevel: 'significant', effPaxLevel: 'discomfort' },
                { srcCondId: 'C', severity: '', effAcLevel: '', effCrewLevel: 'large', effPaxLevel: 'severe injuries or few fatalities' }]);
    const s = c.SLCampaign.score('z-');
    check('it pairs rows by condition id across runs', s.matchedOnAllRuns === 3, JSON.stringify(s.matchedOnAllRuns));
    check('severity agreement counts only rows BOTH runs committed (A and B: 1 of 2)',
      s.fields.severity.bothCommitted === 2 && s.fields.severity.agreed === 1 && s.fields.severity.agreement === 0.5, JSON.stringify(s.fields.severity));
    check('a commitment flip (committed in one run, blank in the other) is counted separately, not as a disagreement',
      s.fields.severity.commitmentFlips === 1);
    check('EVERY AXIS is scored separately — a disagreement names the axis it lives on (the v5 point)',
      s.fields.ac.agreement === 0.5 && s.fields.crew.agreement === 1 && s.fields.pax.agreement === 1, JSON.stringify({ ac: s.fields.ac.agreement, crew: s.fields.crew.agreement, pax: s.fields.pax.agreement }));
    check('the actual disagreeing values are kept, so a number is always traceable to rows',
      s.fields.ac.disagreements.length === 1 && /significant \| large/.test(s.fields.ac.disagreements[0]));
    check('row-count spread is reported (enumeration variance, the 2 Sep TID finding)', s.rowSpread.min === 3 && s.rowSpread.max === 3);
    check('fewer than two completed runs refuses to produce a number', !!c.SLCampaign.score('nothing-').error);
    check('accuracy is NOT invented here — the driver scores consistency only', /Accuracy needs a golden/.test(SRC));
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
