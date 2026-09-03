#!/usr/bin/env node
/**
 * Regression — a drafting turn that throws is RETRIED, not lost (3 Sep 2026).
 *
 * Measured on the Vayu AFHA run: 122 failure conditions sliced into 25 turns,
 * 13 turns did not complete, 62 conditions never drafted — half an analysis lost
 * to transient provider failures, on the run whose whole purpose was to measure
 * the drafter. The pool had no retry anywhere in it. A scoped 12-condition
 * re-draft on the same project returned nothing at all and said nothing.
 *
 * The suite EXTRACTS the real slice runner and EXECUTES it against a fake
 * _anemRun, so the retry, the backoff, the abstention exemption and the
 * accounting are proven rather than grepped.
 * Run: node tests/regression_batch_turn_retry.test.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
let pass = 0, fail = 0;
function check(name, cond, detail) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); } }

// ---- 1. the shape is in the source -----------------------------------------
console.log('[1] the pool retries, and says what it did');
{
  check('a retry budget exists and is more than one attempt', /_TURN_TRIES = (\d+)/.test(ai) && Number((ai.match(/_TURN_TRIES = (\d+)/) || [])[1]) >= 2);
  check('the attempt loop wraps the model call', /for \(let _try = 1; _try <= _TURN_TRIES; _try\+\+\)/.test(ai) && /_results\[_ci\] = \{ ok: true, a: await _anemRun\(/.test(ai));
  check('a reasoned abstention is NEVER retried', /if \(e && e\.isInsufficient\) break;/.test(ai));
  check('backoff is exponential with jitter, not a tight loop', /500 \* Math\.pow\(3, _try - 1\) \+ Math\.floor\(Math\.random\(\) \* 400\)/.test(ai));
  check('only the final failure is recorded as the slice result', /_results\[_ci\] = \{ ok: false, e: _lastErr, tries: _TURN_TRIES \}/.test(ai));
  check('retries that succeeded are counted and reported', /_retried\+\+/.test(ai) && /needed a retry/.test(ai));
  check('a batch that drafts NOTHING can no longer pass in silence', /Nothing drafted — .* turn\(s\) returned but produced no rows/.test(ai) && /Nothing drafted — every turn failed after/.test(ai));
  check('one console line per batch states turns returned / retried / rows', /\[AI\] batch/.test(ai) && /turn\(s\) returned/.test(ai) && /still failed/.test(ai));
}

// ---- 1b. a permanent condition is not retried, and is named ----------------
// Found by the telemetry above on its FIRST live run (Vayu re-draft, 3 Sep): three
// turns x three attempts all returned "Your credit balance is too low to access the
// Anthropic API". Retrying a billing failure spends time and money to learn nothing,
// and buries the one message the engineer needs behind "3 turns did not complete".
console.log('\n[1b] billing / auth / quota fail fast and say so');
{
  check('a permanent-condition classifier exists and is consulted inside the retry loop',
    /const _isPermanent = function \(e\)/.test(ai) && /if \(_isPermanent\(e\)\) \{ _permanentErr = _permanentErr \|\| e; break; \}/.test(ai));
  check('it catches the exact live message (credit balance / Plans & Billing)',
    /credit balance\|plans & billing\|purchase credits/.test(ai));
  check('it catches quota and auth shapes too, by status AND by text',
    /e\.status === 401 \|\| e\.status === 402 \|\| e\.status === 403/.test(ai) && /insufficient_quota/.test(ai) && /invalid\[_ \]api\[_ \]key/.test(ai));
  check('the operator message is passed through verbatim, not replaced by a generic one',
    /the AI backend refused every turn and a retry cannot clear it: ' \+ \(\(_permanentErr && _permanentErr\.message\)/.test(ai));
  check('a PARTLY drafted batch says the rest was refused, not that turns "did not complete"',
    /then the AI backend refused the rest: /.test(ai) && /Re-draft the missing /.test(ai));
  check('the console line marks the permanent case rather than blaming attempts',
    /\(permanent: ' \+ \(\(_permanentErr && _permanentErr\.message\)/.test(ai));
}

// ---- 2. EXECUTED: the extracted runner against a flaky model ----------------
console.log('\n[2] EXECUTED — the real _runSlice against a fake provider');
{
  const at = ai.indexOf('const _runSlice = async function (_ci) {');
  const end = ai.indexOf('\n        };', at);
  check('extracted the real _runSlice', at > 0 && end > at);
  const body = ai.slice(at, end + '\n        };'.length);

  const harness = `
    const _TURN_TRIES = 3;
    let _retried = 0; const _turnErrs = []; let _permanentErr = null;
    const _PERMANENT_RE = /credit balance|plans & billing|purchase credits|quota|insufficient_quota|payment required|invalid[_ ]api[_ ]key|authentication|unauthorized|forbidden|permission|not entitled|account (is )?(suspended|disabled)/i;
    const _isPermanent = function (e) {
      try { if (!e) return false; if (e.status === 401 || e.status === 402 || e.status === 403) return true; return _PERMANENT_RE.test(String((e && e.message) || e)); } catch (_) { return false; }
    };
    const _slices = [['u1'], ['u2'], ['u3']];
    const _results = new Array(_slices.length);
    const _chunk = { noun: 'failure condition', label: u => String(u), units: ['u1','u2','u3'] };
    const _CHUNK_TURN_TOKENS = 4000, _sysExtra = '';
    const _mkMessages = x => [{ role: 'user', content: x }];
    globalThis.__calls = [];
    let _anemRun = async function (m) {
      globalThis.__calls.push(m[0].content);
      const n = globalThis.__calls.length;
      if (globalThis.__mode === 'flaky' && n < 3) { const e = new Error('provider 529'); throw e; }
      if (globalThis.__mode === 'abstain') { const e = new Error('insufficient'); e.isInsufficient = true; e.parsed = {}; throw e; }
      if (globalThis.__mode === 'dead') throw new Error('provider down');
      if (globalThis.__mode === 'billing') throw new Error('Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.');
      return { parsed: { actions: [{ op: 'add_fha' }] } };
    };
    ${body}
    globalThis.__run = _runSlice; globalThis.__results = _results;
    globalThis.__stats = () => ({ retried: _retried, errs: _turnErrs.length });
    globalThis.__perm = () => _permanentErr;
    globalThis.__reset = () => { globalThis.__calls = []; _retried = 0; _turnErrs.length = 0; _permanentErr = null; _results.length = 0; _results.length = 3; };
  `;
  const ctx = { console, setTimeout, Math, String, Array, Error, Promise, JSON };
  ctx.globalThis = ctx; vm.createContext(ctx);
  try { vm.runInContext(harness, ctx); } catch (e) { check('harness compiles', false, e.message); }

  return (async function () {
    // a. a turn that fails twice then succeeds is NOT lost
    ctx.__reset(); ctx.__mode = 'flaky';
    await ctx.__run(0);
    check('a turn that throws twice succeeds on the third attempt', ctx.__results[0] && ctx.__results[0].ok === true && ctx.__results[0].tries === 3, JSON.stringify(ctx.__results[0] && { ok: ctx.__results[0].ok, tries: ctx.__results[0].tries }));
    check('it really re-called the model, three times', ctx.__calls.length === 3);
    check('the successful retry is counted', ctx.__stats().retried === 1 && ctx.__stats().errs === 2);
    check('every attempt carried the SAME turn instruction (a retry is not a different question)',
      ctx.__calls[0] === ctx.__calls[1] && ctx.__calls[1] === ctx.__calls[2] && /cover EXACTLY these failure conditions/.test(ctx.__calls[0]));

    // b. a reasoned abstention is not retried
    ctx.__reset(); ctx.__mode = 'abstain';
    await ctx.__run(1);
    check('a reasoned abstention is asked ONCE and left alone', ctx.__calls.length === 1 && ctx.__results[1].ok === false && ctx.__results[1].e.isInsufficient === true);
    check('an abstention adds no retry noise', ctx.__stats().retried === 0 && ctx.__stats().errs === 0);

    // c. a genuinely dead provider gives up after the budget, keeping the last error
    ctx.__reset(); ctx.__mode = 'dead';
    await ctx.__run(2);
    check('a dead provider is tried exactly _TURN_TRIES times, then reported failed', ctx.__calls.length === 3 && ctx.__results[2].ok === false && ctx.__results[2].tries === 3);
    check('the last error survives for the toast', /provider down/.test(String(ctx.__results[2].e && ctx.__results[2].e.message)));

    // c2. a permanent condition is asked ONCE, whatever the retry budget says
    ctx.__reset(); ctx.__mode = 'billing';
    await ctx.__run(2);
    check('a billing refusal is asked once and never retried', ctx.__calls.length === 1 && ctx.__results[2].ok === false, 'calls=' + ctx.__calls.length);
    check('it is recorded as permanent, and the message survives verbatim',
      !!ctx.__perm() && /credit balance is too low/.test(String(ctx.__perm().message)));
    check('a permanent refusal adds no retry noise to the accounting', ctx.__stats().retried === 0 && ctx.__stats().errs === 0);

    // d. the happy path is untouched — no retry, no counter
    ctx.__reset(); ctx.__mode = 'ok';
    await ctx.__run(0);
    check('a turn that works first time calls once and counts no retry', ctx.__calls.length === 1 && ctx.__results[0].ok === true && ctx.__results[0].tries === 1 && ctx.__stats().retried === 0);

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })();
}
