#!/usr/bin/env node
/*
 * Regression: a condition no retry can clear stops the AI at once (24 Oct 2026, Radia, NS-6).
 *
 * On Radia's server, with no AI key set yet, every drafting turn got "This server has no AI key
 * yet..." (a 503 no_server_key from the server's AI service) and was tried 3 times with a pause
 * between, and the other turns were sent anyway, before the person was told. The failure thrown
 * by AiClient carried only its message, so the status and the error type were lost and the
 * permanent-condition rule (a text match) never saw them. Now:
 *   1. AiClient's failures carry the HTTP status and the backend's error type;
 *   2. AiClient.isPermanentError is the one rule: no key or credentials, a refused key, no
 *      permission, no credit or quota stop; busy, overloaded, unreachable and server errors do not;
 *   3. a drafting turn meets it once (no retry), and turns not yet started are not sent;
 *   4. the assurance loop (draft, check, repair, other model) stops at once too, with the words;
 *   5. what the person sees starts with the backend's own words.
 * The real functions are cut out of the source and run.
 *
 * Run: node tests/regression_ai_permanent_stop_20261024.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 400) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const core = fs.readFileSync(process.env.SL_CORE || path.join(SITE, 'core_modules.js'), 'utf8');
const ai = fs.readFileSync(process.env.SL_AI || path.join(SITE, 'ai_assistant.js'), 'utf8');

(async function main() {
  console.log('\n[1-2] the rule, run');
  const a = core.indexOf('    const _PERMANENT_TYPES'), b = core.indexOf('    function _plainNetError(e, viaProxy) {');
  check('core_modules has the rule and the error maker', a > 0 && b > a);
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(core.slice(a, b) + '\nthis.isPermanentError = isPermanentError; this._aiError = _aiError;', ctx);
  const { isPermanentError, _aiError } = ctx;
  const NOKEY = "This server has no AI key yet. Your Safety Lab administrator adds it in the app: AI Assistant, Settings, Server AI key.";
  const e503 = _aiError(NOKEY, 503, 'no_server_key');
  check('1 a failure carries its status and type', e503.status === 503 && e503.type === 'no_server_key' && e503.message === NOKEY);
  check('2 a server with no AI key (503 no_server_key): permanent', isPermanentError(e503) && e503.permanent === true);
  check('2 the same words with no type (an older path): permanent', isPermanentError(new Error(NOKEY)));
  check('2 the type alone decides, whatever the words (no_server_key, reworded)', isPermanentError({ message: 'The server is not set up for AI.', status: 503, type: 'no_server_key' }));
  check('2 the status alone decides, whatever the words (401, 402, 403)', [401, 402, 403].every(s => isPermanentError({ message: 'Malformed token.', status: s, type: '' })));
  check('2 a 503 with no type and other words is retried', !isPermanentError({ message: 'Service temporarily down.', status: 503, type: '' }));
  check('2 a refused key (401) and no permission (403): permanent', isPermanentError(_aiError('invalid x-api-key', 401, 'authentication_error')) && isPermanentError(_aiError('nope', 403, 'permission_error')));
  check('2 no credit (400 with the live words): permanent', isPermanentError(_aiError('Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.', 400, 'invalid_request_error')));
  for (const m of ['No AI key on this computer yet. Paste your Anthropic key under Advanced, or choose an AI endpoint in Settings.', 'No AI key saved for this account. Add your Anthropic key under Advanced.', 'Sign in again to use your saved AI key.', 'No AI credentials configured. Either upgrade to Pro+ or paste a BYO Anthropic key in Advanced.', 'No embedding credentials configured. Either upgrade to Pro+ or paste a BYO Voyage key in Advanced.'])
    check('2 local: "' + m.slice(0, 40) + '...": permanent', isPermanentError(new Error(m)));
  check('2 overloaded (529), busy (429), server error (500), bad gateway (502): retried', ![_aiError('Overloaded', 529, 'overloaded_error'), _aiError('Rate limited', 429, 'rate_limit_error'), _aiError('Internal server error', 500, 'api_error'), _aiError('HTTP 502', 502, '')].some(isPermanentError));
  check('2 unreachable: retried', !isPermanentError(new Error('Safety Lab cannot reach the AI service on 192.168.10.42. Check the network.')));
  check('2 nothing: not permanent', isPermanentError(null) === false);
  check('1 the failed-response path throws with status and type', /throw _aiError\(emsg, response && response\.status, etype\);/.test(core) && /etype = \(errJson\.error && errJson\.error\.type\) \|\| ''/.test(core) && /_preType = \(ej\.error && ej\.error\.type\) \|\| ''/.test(core));
  check('1 AiClient exposes the rule', /return \{ isPermanentError, isConfigured,/.test(core));

  console.log('\n[3] a drafting turn, run');
  const at = ai.indexOf('const _runSlice = async function (_ci) {'), end = ai.indexOf('\n        };', at);
  const pa = ai.indexOf('        const _isPermanent = function (e) {'), pe = ai.indexOf('\n        };', pa);
  const wl = (ai.match(/const _worker = async function \(\) \{[^\n]*\};/) || [])[0];
  check('extracted the turn runner, the classifier and the pool worker', at > 0 && end > at && pa > 0 && pe > pa && !!wl);
  async function batch(errOf, n) {
    const c = { console, setTimeout, Math, Promise, Array, String, AiClient: { isPermanentError } };
    vm.createContext(c);
    const src = `
      const _TURN_TRIES = 3; let _retried = 0; const _turnErrs = []; let _permanentErr = null;
      const _PERMANENT_RE = /credit balance/i;
      ${ai.slice(pa, pe + '\n        };'.length)}
      const _slices = Array.from({ length: ${n} }, (_, i) => ['u' + i]);
      const _results = new Array(_slices.length);
      const _chunk = { noun: 'failure condition', label: u => String(u), units: _slices.flat() };
      const _CHUNK_TURN_TOKENS = 4000, _sysExtra = '', _sysBreaks = [], _batchLane = 'fha';
      const _mkMessages = x => [{ role: 'user', content: x }];
      const calls = [];
      const _anemRun = async function (m) { calls.push(m[0].content); await new Promise(r => setTimeout(r, 5)); const e = errOf(calls.length); if (e) throw e; return { ok: 1 }; };
      ${ai.slice(at, end + '\n        };'.length)}
      (async function () { let _next = 0; ${wl} await Promise.all(Array.from({ length: Math.min(4, _slices.length) }, _worker)); return { calls: calls.length, permanent: _permanentErr, results: _results, retried: _retried }; })()`;
    c.errOf = errOf;
    return vm.runInContext(src.replace('errOf(calls.length)', 'globalThis.errOf(calls.length)'), Object.assign(c, { globalThis: c }));
  }
  const t0 = Date.now();
  let r = await batch(() => _aiError(NOKEY, 503, 'no_server_key'), 1);
  check('3 one turn, no AI key on the server: asked once, never retried', r.calls === 1 && r.permanent && r.permanent.message === NOKEY && r.retried === 0, JSON.stringify({ calls: r.calls }));
  check('3 and no backoff pause was spent on it', Date.now() - t0 < 400, (Date.now() - t0) + ' ms');
  r = await batch(() => _aiError(NOKEY, 503, 'no_server_key'), 10);
  check('3 ten turns: only the ones already in flight are asked, the rest are never sent', r.calls <= 4 && r.calls >= 1 && r.results.filter(Boolean).length === r.calls, 'calls ' + r.calls);
  r = await batch(n => n === 1 ? _aiError('Overloaded', 529, 'overloaded_error') : null, 1);
  check('3 an overloaded provider is still retried (and then succeeds)', r.calls === 2 && r.retried === 1 && !r.permanent, JSON.stringify({ calls: r.calls, retried: r.retried }));

  console.log('\n[4] the assurance loop, run');
  const ra = ai.indexOf('        run: async function (task) {'), re = ai.indexOf('\n        }\n    };', ra);
  check('extracted the assurance loop', ra > 0 && re > ra);
  const c2 = { AiClient: { isPermanentError }, Promise, String, Error, _agentCorrectionPacket: () => ({ instruction: 'fix' }), _agentSmallestDecision: () => ({ kind: 'x', ask: 'decide' }) };
  vm.createContext(c2);
  vm.runInContext('this.run = async function (task) {' + ai.slice(ai.indexOf('{', ra) + 1, re + '\n        }'.length), c2);
  let n = 0;
  let out = await c2.run({ generate: async () => { n++; throw _aiError(NOKEY, 503, 'no_server_key'); }, validate: () => ({ verdict: 'validated' }) });
  check('4 no AI key: asked once, not 6 times', n === 1 && out.status === 'failed' && out.attempts === 1, 'calls ' + n);
  check('4 it says the backend\'s words', out.permanentError === NOKEY && out.escalation && out.escalation.ask === NOKEY);
  n = 0;
  out = await c2.run({ generate: async () => { n++; if (n < 3) throw _aiError('Overloaded', 529, 'overloaded_error'); return { actions: [] }; }, validate: () => ({ verdict: 'validated' }) });
  check('4 an overloaded provider is still tried again', n === 3 && out.status === 'validated', 'calls ' + n);

  console.log('\n[5] what the person sees');
  check('5 nothing drafted: the backend\'s words first, then why nothing more was sent', /_toast\('Nothing drafted\. ' \+ \(\(_permanentErr && _permanentErr\.message\) \|\| _permanentErr\) \+ ' Trying again cannot fix this, so no further turns were sent\.'/.test(ai));
  // the lines added on 24 Oct (older lines in the same functions keep their own wording)
  const aiAdded = ai.split('\n').filter(l => /24 Oct 2026|NS-6|permanent = |permanentError|no further turns were sent|AiClient\.isPermanentError/.test(l));
  const added = [core.slice(a, b), aiAdded.join('\n'), wl, fs.readFileSync(__filename, 'utf8')];
  check('no em dashes in what was added', added.every(s => s.indexOf(String.fromCharCode(0x2014)) < 0));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });
