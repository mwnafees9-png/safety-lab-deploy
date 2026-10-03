#!/usr/bin/env node
/*
 * Regression: the "ITAR cloud, proxy to Azure Gov" AI mode is retired (3 Oct 2026).
 *
 * Waqas: clean up the leftover ITAR routing through our proxy to Azure Gov. Controlled data
 * never runs through Safety Lab's cloud, so the option only confused things. What this pins:
 *   1. The settings dropdown offers cloud and local only.
 *   2. No working code tests for 'itar-cloud' except the two spots that read an OLD saved
 *      value as 'cloud' (so a browser that had it saved does not break).
 *   3. EXECUTED: the AI module reads a saved 'itar-cloud' as 'cloud', and 'local' stays 'local'.
 *   4. EXECUTED: the settings panel shows a saved 'itar-cloud' as 'cloud'.
 *   5. EXECUTED: controlled data is still refused on 'cloud' (nothing loosened by the removal).
 *   6. Cache pins bumped so browsers load the new files.
 *
 * Run: node tests/regression_itar_cloud_retired_20261003.test.js
 * Mutation runs: SLAB_SITE=/path/to/mutated/site node tests/regression_itar_cloud_retired_20261003.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = process.env.SLAB_SITE || path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const PIN = require('./lib/pinfloor.js');
const ai = S('ai_assistant.js'), idx = S('index.html'), helpers = S('helpers_modules.js'), loader = S('ai_loader.js');
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
function block(src, startMarker) {
  const i = src.indexOf(startMarker);
  if (i < 0) return '';
  let depth = 0, started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { depth++; started = true; }
    else if (src[j] === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
  }
  return '';
}

console.log('\n[itar-cloud retired] the settings dropdown');
{
  const sel = (idx.match(/<select id="ai-provider-mode">([\s\S]*?)<\/select>/) || [])[1] || '';
  const vals = (sel.match(/value="([^"]+)"/g) || []).map(s => s.slice(7, -1));
  check('the backend dropdown exists', sel.length > 0);
  check('it offers exactly cloud and local', vals.join(',') === 'cloud,local', 'got ' + vals.join(','));
  check('no "ITAR cloud, proxy to Azure Gov" wording left in the page', !/ITAR cloud|proxy → Azure Gov\b/.test(idx));
}

console.log('\n[itar-cloud retired] no working code depends on the mode');
{
  const codeAi = strip(ai), codeH = strip(helpers);
  const nAi = (codeAi.match(/itar-cloud/g) || []).length, nH = (codeH.match(/itar-cloud/g) || []).length;
  check('ai_assistant.js: only the one read-as-cloud mapping mentions it', nAi === 1, 'found ' + nAi);
  check('helpers_modules.js: only the one read-as-cloud mapping mentions it', nH === 1, 'found ' + nH);
  let others = 0;
  for (const f of fs.readdirSync(SITE)) {
    if (!/\.js$/.test(f) || f === 'ai_assistant.js' || f === 'helpers_modules.js') continue;
    if (/itar-cloud/.test(strip(fs.readFileSync(path.join(SITE, f), 'utf8')))) { others++; console.log('     still in ' + f); }
  }
  check('no other site script uses it', others === 0);
  check('complete() no longer has an itar-cloud branch', !/itar-cloud/.test(strip(block(ai, 'async complete('))));
  check('describe() no longer mentions Azure', !/Azure/.test(strip(block(ai, 'describe() {'))));
}

console.log('\n[itar-cloud retired] EXECUTED: the AI module reads the saved value');
{
  const getter = block(ai, 'get mode() {');
  check('the mode getter was found', getter.length > 0);
  function modeFor(stored, qs, throws) {
    const store = {}; if (stored != null) store['safetyLab.ai.provider'] = stored;
    const ctx = {
      URLSearchParams, location: { search: qs || '' },
      localStorage: {
        getItem: k => { if (throws) throw new Error('blocked'); return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
        setItem: (k, v) => { if (throws) throw new Error('blocked'); store[k] = String(v); }
      }
    };
    vm.createContext(ctx);
    vm.runInContext('globalThis.__P = { ' + getter + ' };', ctx);
    return ctx.__P.mode;
  }
  check('saved itar-cloud reads as cloud', modeFor('itar-cloud') === 'cloud');
  check('?aiProvider=itar-cloud reads as cloud', modeFor(null, '?aiProvider=itar-cloud') === 'cloud');
  check('saved local stays local', modeFor('local') === 'local');
  check('saved cloud stays cloud', modeFor('cloud') === 'cloud');
  check('nothing saved reads as cloud', modeFor(null) === 'cloud');
  check('storage blocked reads as cloud', modeFor(null, '', true) === 'cloud');
}

console.log('\n[itar-cloud retired] EXECUTED: the settings panel shows the saved value');
{
  const line = (helpers.match(/set\('ai-provider-mode',[^\n]*/) || [''])[0];
  check('the settings line was found', line.length > 0);
  function shown(stored) {
    const ctx = { out: null, set: (id, v) => { ctx.out = v; }, lsGet: () => stored };
    vm.createContext(ctx);
    vm.runInContext(line, ctx);
    return ctx.out;
  }
  check('saved itar-cloud shows as cloud', shown('itar-cloud') === 'cloud');
  check('saved local shows as local', shown('local') === 'local');
  check('nothing saved shows as cloud', shown('') === 'cloud');
}

console.log('\n[itar-cloud retired] EXECUTED: controlled data still refused on cloud');
{
  const route = block(ai, 'route(request) {');
  const cls = (ai.match(/const _CONTROLLED_CLASS = (\/[^\n]*\/i);/) || [])[1];
  check('route() and the controlled pattern were found', route.length > 0 && !!cls);
  function decide(mode, classification) {
    const ctx = { Provider: { mode }, _payloadTaint: () => '', SLConfig: undefined };
    vm.createContext(ctx);
    vm.runInContext('const _CONTROLLED_CLASS = ' + cls + ';\nglobalThis.__G = { ' + route + ' };', ctx);
    return ctx.__G.route({ data_classification: classification });
  }
  check('cloud + ITAR data: refused', decide('cloud', 'ITAR').allowed === false);
  check('cloud + ordinary data: allowed', decide('cloud', '').allowed === true);
  check('local + ITAR data: allowed', decide('local', 'ITAR').allowed === true);
}

console.log('\n[itar-cloud retired] cache pins');
check('ai_assistant >= 76.74 (loader)', PIN.atLeast(loader, 'ai_assistant.js', '76.74'));
check('ai_loader >= 8.66', PIN.atLeast(idx, 'ai_loader.js', '8.66'));
check('helpers_modules >= 3.18', PIN.atLeast(idx, 'helpers_modules.js', '3.18'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
