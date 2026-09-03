#!/usr/bin/env node
/*
 * Regression — Phase 0 integrity sentinel (notify_agents.js v1.0) + the proxy
 * fan-out route. The promises under test, each of which failing would be a
 * customer-visible defect:
 *
 *   P1  OFF by default, per project — a fresh project never sends anything.
 *   P2  WORSENING ONLY — the sentinel speaks solely for keys (`where|ref|
 *       reason`) absent from the acknowledged snapshot. Fixing never fires;
 *       re-saving never re-fires; sent keys auto-acknowledge.
 *   P3  The sweep is the referee — issues come from the SHIPPED gt_integrity
 *       verdicts, never recomputed here.
 *   P4  The browser never dials a webhook — only the proxy route, with the
 *       license Bearer, may fan out; and the proxy refuses any webhook host
 *       off the allowlist (no open relay). Suffix-spoof hosts must fail.
 *   P5  saveState is wrapped debounced; renderGtIntegrityPage is wrapped for
 *       the config card; the script is pinned in index.html AFTER
 *       q_completeness.js (append-last ordering).
 *
 * Executed against the REAL notify_agents.js + gt_integrity.js in a vm
 * sandbox; the proxy's notifyHostAllowed is exercised through its REAL
 * extracted source — the same text that ships, never a re-implementation.
 *
 * Run: node tests/regression_notify_agents.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const PIN = require('./lib/pinfloor.js');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const gti = S('gt_integrity.js'), na = S('notify_agents.js'), html = S('index.html');
// The proxy repo sits beside the site repo on the Desktop.
const workerPath = path.join(__dirname, '..', '..', 'safety-lab-proxy-deploy', 'worker.js');
// 20 Aug 2026 — this used to readFileSync straight into module scope, so on any checkout
// without the sibling proxy repo the suite THREW before printing a single line. ship.sh
// discarded exit codes, so that read as a clean pass. It never was: P4 (the browser must
// never dial a webhook directly) was simply not being checked. Absent sibling is now a
// visible FAIL with the fix in the message — never a crash, and never a silent skip.
let worker = null, workerErr = null;
try { worker = fs.readFileSync(workerPath, 'utf8'); }
catch (e) { workerErr = e.code === 'ENOENT' ? 'not found at ' + workerPath : e.message; }

function sandbox() {
  const sb = { console, Object, String, Array, JSON, Set, Map, Date, Math, Number, parseFloat, parseInt, isNaN, Promise,
    setTimeout: (fn) => { sb._timers.push(fn); return sb._timers.length; }, clearTimeout: () => 0,
    setInterval: () => 0, clearInterval: () => 0 };
  sb._timers = [];
  sb.window = sb; sb.globalThis = sb;
  sb.document = { readyState: 'complete', getElementById: () => null, querySelector: () => null,
    createElement: () => ({ style: {}, setAttribute: () => {}, addEventListener: () => {}, appendChild: () => {}, remove: () => {}, classList: { toggle: () => {}, add: () => {}, remove: () => {} } }),
    addEventListener: () => {}, body: { appendChild: () => {} } };
  sb.projectConfig = { projectName: 'T' };
  sb.acFunctionsData = []; sb.acFhaData = []; sb.acReqData = []; sb.acAssumptionsData = [];
  sb.systemsData = []; sb.zsaData = []; sb.praData = []; sb.cmaData = []; sb.itemsData = []; sb.ftaPages = [];
  sb.resourcesData = []; sb.routingData = [];
  sb._fetches = [];
  sb.fetch = (url, opts) => { sb._fetches.push({ url, opts }); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }); };
  sb.localStorage = { _s: { 'safetyLab.license.token': 'tok_regression_1234567890' },
    getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
  // v1.1 — model the LIVE app's globals, learned by execution on the deployed
  // build: there is NO global saveState (that was this suite's own stub lying
  // to the module); the real rail is _writeAutosave + scheduleAutosave, and
  // navigation goes through switchTab (whose gt_integrity wrapper calls a
  // CLOSURE render, not the window name).
  sb._writeAutosave = function () {}; sb.scheduleAutosave = () => { sb._autosaves = (sb._autosaves || 0) + 1; };
  sb.switchTab = function () {};
  vm.createContext(sb);
  vm.runInContext(gti, sb);
  vm.runInContext(na, sb);
  return sb;
}
const drain = sb => { while (sb._timers.length) { const t = sb._timers.splice(0); t.forEach(fn => { try { fn(); } catch (_) {} }); } };

// Extract a top-level `function name(...) {...}` from module source by brace
// counting — the REAL shipped text, so a drift in the module breaks this suite.
function extractFn(src, name) {
  const ix = src.indexOf('function ' + name + '(');
  if (ix < 0) throw new Error(name + ' not found');
  let i = src.indexOf('{', ix), depth = 0, j = i;
  for (; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (!depth) break; }
  }
  return src.slice(ix, j + 1);
}

// ---- [P1] OFF by default — a fresh project never sends ---------------------
console.log('\n[P1] off by default, per project');
{
  const sb = sandbox(); drain(sb);
  sb.naWorsened();   // config materialises lazily (first touch) — by design:
                     // the module must not write projectConfig at parse time.
  check('config materialises disabled', sb.projectConfig.notifyAgents && sb.projectConfig.notifyAgents.enabled === false);
  check('naSend is a no-op while disabled', (sb._fetches.length === 0));
  let resolved = null;
  sb.naSend().then(r => { resolved = r; });
  return_check_p1(sb, () => {
    check('disabled send reports skipped, still zero network', resolved && resolved.skipped === 'disabled' && sb._fetches.length === 0);
  });
}
function return_check_p1(sb, fn) { Promise.resolve().then(fn).then(run_p2); }

// ---- [P2] worsening-only diff + auto-acknowledge ---------------------------
function run_p2() {
console.log('\n[P2] worsening only — keyed where|ref|reason, sent keys acknowledged');
{
  const sb = sandbox(); drain(sb);
  // seed one stale mark through the REAL sweep's eyes
  sb.zsaData.push({ zoneId: 'Z1', obsolete: true, obsoleteReason: 'source deleted' });
  const w1 = sb.naWorsened();
  check('the shipped sweep surfaces the seeded stale mark', w1.length >= 1, 'got ' + w1.length);
  check('issue keys carry where|ref|reason', w1.every(x => x.where && x.ref && x.reason !== undefined));
  sb.projectConfig.notifyAgents.enabled = true;
  sb.projectConfig.notifyAgents.webhookUrl = 'https://x.webhook.office.com/hook';
  sb.naSend();
  Promise.resolve().then(() => {
    check('enabled + worsened → exactly one POST', sb._fetches.length === 1, 'got ' + sb._fetches.length);
    const f = sb._fetches[0] || { url: '', opts: { headers: {} } };
    check('POST targets the proxy notify route, never the webhook itself',
      /\/v1\/ai\/notify\/integrity$/.test(f.url), f.url);
    check('license Bearer rides the request (same lane as AI)',
      (f.opts.headers.authorization || '').indexOf('Bearer tok_regression') === 0);
    const body = JSON.parse(f.opts.body || '{}');
    check('payload carries the webhook for SERVER-side validation', body.webhookUrl === 'https://x.webhook.office.com/hook');
    check('worsened rows travel with kind + where + ref + reason',
      Array.isArray(body.worsened) && body.worsened.length >= 1 && body.worsened.every(x => x.kind && x.where !== undefined));
    check('sent keys auto-acknowledge — second look finds nothing new', sb.naWorsened().length === 0);
    sb.naSend();
    Promise.resolve().then(() => {
      check('re-save with no NEW finding → no second POST', sb._fetches.length === 1, 'got ' + sb._fetches.length);
      // a NEW defect after acknowledge must fire again
      sb.praData.push({ praId: 'PRA9', obsolete: true, obsoleteReason: 'strike source removed' });
      check('a genuinely new finding re-arms the sentinel', sb.naWorsened().length >= 1);
      run_p3();
    });
  });
}
}

// ---- [P3] the sweep is the referee — sources are the shipped verdicts ------
function run_p3() {
console.log('\n[P3] sources are the shipped gt_integrity verdicts');
{
  check('stale lane reads gtStaleSweep', /gtStaleSweep/.test(na));
  check('dangling lane reads gtIntegrity\\(\\).dangling', /gtIntegrity[\s\S]{0,40}\.dangling/.test(na) || /gtIntegrity === 'function' \? gtIntegrity\(\)\.dangling/.test(na));
  check('zeroed-branch lane reads gtTransferSweep', /gtTransferSweep/.test(na));
  check('no re-implemented sweep — module never walks staleRefs itself', !/staleRefs/.test(na),
    'notify_agents must consume verdicts, not recompute them');
  const sb = sandbox(); drain(sb);
  // dangling through the real referee: an FHA row tracing a deleted sub-function
  sb.acFhaData.push({ fcId: 'FC-1', subId: 'SF-GONE' });
  check('a dangling reference (real sweep) enters the issue set',
    sb.naCollect().some(x => x.kind === 'dangling' && x.ref === 'SF-GONE'));
  // compromised flag walk on tree nodes
  sb.ftaPages.push({ id: 'p1', name: 'Tree A', root: { id: 1, children: [{ id: 2, flag: 'compromised', displayId: 'G2', children: [] }] } });
  check('a compromised node enters the issue set',
    sb.naCollect().some(x => x.kind === 'compromised' && x.ref === 'G2'));
  run_p4();
}
}

// ---- [P4] proxy: allowlist is real, spoofs fail, route is authed -----------
function run_p4() {
console.log('\n[P4] proxy fan-out — no open relay');
if (!worker) {
  check('the proxy repo is checked out beside this one so P4 can run', false,
    'safety-lab-proxy-deploy/worker.js ' + workerErr +
    ' — clone it beside safety-lab-deploy. Until then the open-relay checks are NOT running.');
  return;
}
{
  const allowedSrc = extractFn(worker, 'notifyHostAllowed');
  const ctx = { NOTIFY_WEBHOOK_HOSTS: [".webhook.office.com", ".logic.azure.com"], URL };
  vm.createContext(ctx);
  vm.runInContext(allowedSrc + '; this._f = notifyHostAllowed;', ctx);
  const ok = u => ctx._f(u);
  check('Teams Workflows host allowed', ok('https://prod-01.westus.logic.azure.com/workflows/abc'));
  check('legacy office webhook host allowed', ok('https://contoso.webhook.office.com/webhookb2/xyz'));
  check('arbitrary host refused', !ok('https://evil.example.com/hook'));
  check('suffix spoof refused (webhook.office.com.evil.com)', !ok('https://webhook.office.com.evil.com/h'));
  check('bare suffix domain refused (must be a subdomain)', !ok('https://webhook.office.com/h'));
  check('plain http refused', !ok('http://contoso.webhook.office.com/h'));
  check('garbage refused, never throws', !ok('not a url'));
  check('route lives INSIDE the Bearer-auth pipeline (after lookupToken)',
    worker.indexOf('/v1/ai/notify/integrity') > worker.indexOf('const check = await lookupToken'));
  check('notify has its own hard KV cap, prefixed off the AI counter', /"ntf:" \+ token, 6/.test(worker));
  check('email rail is Resend from the send subdomain', /alerts@send\.safetylabaero\.com/.test(worker));
  check('missing RESEND key degrades to "unconfigured", not an error', /unconfigured/.test(worker));
  run_p5();
}
}

// ---- [P5] wiring — wraps installed, pin present, ordering right ------------
function run_p5() {
console.log('\n[P5] wiring: wraps, pin, load order');
{
  const sb = sandbox(); drain(sb);
  check('the REAL save rail is wrapped — _writeAutosave, not the saveState phantom',
    sb._writeAutosave._naWrapped === true,
    'v1.0 hooked a global that does not exist in the live app; this pin keeps the lesson');
  check('module never trusts saveState alone — autosave names appear in source',
    /_writeAutosave/.test(na) && /scheduleAutosave/.test(na));
  check('switchTab is wrapped — the nav path that actually renders the page',
    sb.switchTab._naWrapped === true,
    "gt_integrity's nav wrapper calls its closure render; window-name wrap alone never fires");
  check('navigating to gt-integrity does not throw (card render is guarded)',
    (() => { try { sb.switchTab('gt-integrity'); drain(sb); return true; } catch (_) { return false; } })());
  check('renderGtIntegrityPage is wrapped too (direct window callers)', sb.renderGtIntegrityPage._naWrapped === true);
  check('config writes persist via scheduleAutosave (the debounced entry)',
    (() => { sb.naWorsened(); sb.projectConfig.notifyAgents.enabled = true;
             const before = sb._autosaves || 0;
             sb.zsaData.push({ zoneId: 'ZP5', obsolete: true, obsoleteReason: 'x' });
             sb.projectConfig.notifyAgents.webhookUrl = 'https://x.webhook.office.com/h';
             sb.naSend();
             return (sb._autosaves || 0) > before; })(),
    'acknowledge-on-send must reach the autosave rail or the ack keys are lost on reload');
  check('index.html pins notify_agents.js with a version',
    /<script src="notify_agents\.js\?v=[\d.]+" defer><\/script>/.test(html));
  check('pin floor >= 1.1 (the v1.0 hook defect must never ship again)',
    (() => { const m = html.match(/notify_agents\.js\?v=([\d.]+)/); return m && PIN.pinAtLeast(m[1], '1.1'); })());
  check('notify_agents loads AFTER q_completeness (append-last ordering)',
    html.indexOf('notify_agents.js?v=') > html.indexOf('q_completeness.js?v='));
  check('gt_integrity still loads before both',
    html.indexOf('gt_integrity.js?v=') < html.indexOf('q_completeness.js?v='));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exitCode = fail ? 1 : 0;
}
}
