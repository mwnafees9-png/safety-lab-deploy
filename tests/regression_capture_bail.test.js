#!/usr/bin/env node
/**
 * Regression — A REFUSAL IS A RESULT (3 Sep 2026).
 *
 * The 3 Sep campaign queued three FMEA runs. All three "failed" after 901
 * seconds with "no panel opened" — 45 minutes of wall clock to learn nothing.
 * The lane had in fact refused instantly and said why, in a toast, to an empty
 * room: the provider was not ready. The capture only ever resolved from a
 * review panel, so a lane that never reached one hung until the timeout.
 *
 * There are 99 toast-and-return guard clauses in ai_assistant.js. This suite
 * pins the contract that turns every one of them into a fast, labelled outcome
 * instead of a timeout, and — the load-bearing check — that none of it is
 * reachable when no capture is armed, so the engineer's own path is untouched.
 * Run: node tests/regression_capture_bail.test.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
let pass = 0, fail = 0;
function check(name, cond, detail) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); } }
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

// ---- 1. static: the wiring is present and complete --------------------------
console.log('[1] the wiring');
{
  check('_captureBail exists and RESOLVES (a refusal is data, not an error)',
    /function _captureBail\(reason, extra\) \{/.test(ai) && /declined: true, bailed: true/.test(ai));
  check('the bail carries what the tool told the user', /saidToUser: \(_lastToast && _lastToast\.msg\)/.test(ai));
  check('_toast records its last message so there is something to carry',
    /_lastToast = \{ msg: String\(msg == null \? '' : msg\)/.test(ai));
  check('_captureBail is INERT when nothing is armed', /function _captureBail[\s\S]{0,200}?if \(!_capture\.armed\) return false;/.test(ai));
  check('_captureGuard is inert too — disarmed calls go straight through',
    /function _captureGuard\(name, fn\) \{\s*\n\s*return function \(\) \{\s*\n\s*if \(!_capture\.armed\) return fn\.apply\(this, arguments\);/.test(ai));
  const wrapped = (ai.match(/_captureGuard\('/g) || []).length;
  check('every drafting lane is wrapped, not just FMEA', wrapped >= 17, wrapped + ' wrapped');
  ['populateFha', 'populateFcim', 'decompose', 'draftPra', 'draftZsa', 'draftCma', 'draftFmea', 'draftHfLane'].forEach(function (k) {
    check('lane wrapped at the public API: ' + k, new RegExp(k + ":\\s+_captureGuard\\('" + k + "'").test(ai));
  });
  check('the SIXTH picker is guarded — the one the 76.38 sweep missed',
    /function _fmeaSystemPicker[\s\S]{0,600}?if \(_capture\.armed\) \{[\s\S]{0,400}?FMEA system auto-selected/.test(ai));
  check('the FMEA picker bails rather than hangs when there is nothing to analyse',
    /_captureBail\('FMEA: no system has fault trees with basic events'/.test(ai));
}

// ---- 2. EXECUTED: the machinery actually behaves ----------------------------
console.log('\n[2] executed — arm, refuse, resolve');
{
  const ctx = { console, Promise, Date, setTimeout, clearTimeout, parseInt, Object, String, Math, Error };
  vm.createContext(ctx);
  vm.runInContext(
    'var _capture = { armed: false, resolve: null, reject: null, timer: null, armedAt: 0 };\n' +
    'var _lastToast = { msg: "", kind: "", at: 0 };\n' +
    extractFn(ai, '_captureDisarm') + '\n' +
    extractFn(ai, '_captureArm') + '\n' +
    extractFn(ai, '_captureBail') + '\n' +
    extractFn(ai, '_aiCallsInFlight') + '\n' +
    extractFn(ai, '_captureGuard') + '\n', ctx);

  check('disarmed, a bail does nothing and reports so', vm.runInContext('_captureBail("nope") === false', ctx));

  const run = (code) => vm.runInContext('(async () => {' + code + '})()', ctx);

  // Sequential ON PURPOSE: only one capture may be armed at a time, and that is
  // the contract, not a limitation. Arming three at once is what the first draft
  // of this suite did, and it failed exactly as the machinery promises it would.
  (async () => {
    // a lane that refuses instantly, exactly like draftFmea with no provider
    const a = await run(`
      var p = _captureArm(5000);
      _lastToast = { msg: "AI backend not ready.", kind: "warning", at: Date.now() };
      var lane = _captureGuard('draftFmea', function () { return undefined; });
      lane();
      var out = await p;
      return { declined: out.declined, bailed: out.bailed, said: out.saidToUser, lane: out.lane,
               reason: out.reason, items: Array.isArray(out.items) && out.items.length === 0, armed: _capture.armed };
    `);
    // a lane that DOES draft — the guard must keep its hands off
    const b = await run(`
      var p = _captureArm(5000);
      var lane = _captureGuard('populateFha', function () {
        var res = _capture.resolve; _captureDisarm();
        res({ items: [{ id: 'row-1' }], declined: false });   // stand-in for _captureFire
        return 'lane-return-value';
      });
      var ret = lane();
      var out = await p;
      return { rows: out.items.length, declined: out.declined, bailed: !!out.bailed, ret: await ret };
    `);
    // a lane that throws before drafting
    const c = await run(`
      var p = _captureArm(5000);
      var lane = _captureGuard('draftZsa', function () { throw new Error('boom'); });
      var threw = false;
      try { lane(); } catch (e) { threw = (e.message === 'boom'); }
      var out = await p;
      return { threw: threw, bailed: out.bailed, mentions: /threw before drafting/.test(out.reason) };
    `);
    // 4 Sep 2026 — THE FALSE BAIL. A fire-and-forget lane returns at once while its
    // model call runs. With the app's in-flight counter > 0 the guard must NOT bail;
    // the seam fires when the panel opens. (decompose, run 1 of the golden campaign:
    // the first guard bailed at 0 s while Opus was 24 s into the real draft.)
    const f = await run(`
      var p = _captureArm(5000);
      globalThis._aiBusy = { n: 1 };                                   // a call is running
      var lane = _captureGuard('decompose', function () { return undefined; });   // returns immediately
      lane();
      var bailedEarly = null;
      await new Promise(function (r) { setTimeout(r, 2200); });         // past the 1.5 s grace
      bailedEarly = !_capture.armed;
      // now the draft "lands": the seam fires with rows
      var res = _capture.resolve; if (res) { _captureDisarm(); res({ items: [{ op: 'add_function' }], declined: false }); }
      var out = await p;
      globalThis._aiBusy = { n: 0 };
      return { bailedEarly: bailedEarly, rows: out.items ? out.items.length : -1, declined: out.declined };
    `);
    check('a lane that RETURNS while its AI call is in flight is NOT bailed', f.bailedEarly === false);
    check('… and the real draft lands in the capture when the panel opens', f.rows === 1 && f.declined === false);
    // arming twice is refused — the property that made this suite honest
    const d = await run(`
      var p1 = _captureArm(5000); var rejected = false;
      try { await _captureArm(5000); } catch (e) { rejected = /already armed/.test(e.message); }
      _captureBail('cleanup'); await p1;
      return { rejected: rejected };
    `);
    // the guard is transparent when nothing is armed
    const r4 = vm.runInContext(`(function () {
      var lane = _captureGuard('populateFha', function (x, y) { return x + y; });
      return { value: lane(2, 3), notAPromise: !(lane(1, 1) instanceof Promise) };
    })()`, ctx);

    check('a refusing lane RESOLVES instead of hanging to the timeout', a.declined === true && a.bailed === true);
    check('the bail repeats what the tool actually said', a.said === 'AI backend not ready.', a.said);
    check('the bail names the lane that refused', a.lane === 'draftFmea', String(a.lane));
    check('the reason says a guard clause turned it away', /returned without drafting and no AI call is in flight/.test(a.reason), a.reason);
    check('a bailed payload is shaped like any other — empty items, never undefined', a.items === true);
    check('the capture disarms on bail (one-shot, like the fire path)', a.armed === false);

    check('a lane that DRAFTS is untouched by the guard', b.rows === 1 && b.declined === false);
    check('a real draft is never mislabelled as bailed', b.bailed === false);
    check("the lane's own return value still reaches its caller", b.ret === 'lane-return-value');

    check('a throwing lane bails AND still rethrows to its caller', c.threw === true && c.bailed === true);
    check('the reason distinguishes a throw from a polite refusal', c.mentions === true);

    check('disarmed, the guard returns the raw value synchronously', r4.value === 5 && r4.notAPromise === true);

    check('arming twice is refused — one capture at a time', d.rejected === true);

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })();
}
