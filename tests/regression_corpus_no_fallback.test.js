#!/usr/bin/env node
/*
 * Regression — a blank method-corpus address is FINAL on a customer install (16 Sep 2026, R7).
 *
 * THE LEAK. corpus_retrieve.js carried its own fallback: if no corpus endpoint was configured it
 * used 'https://api.safetylabaero.com'. CORPUS_ENDPOINT is blank in the shipped install.env.example
 * — the documented default — so every self-hosted install sent
 *     GET https://api.safetylabaero.com/v1/corpus/search?q=<first 500 chars of the drafting prompt>
 * to Safety Lab on every AI draft. Caught live during R7, in the network log of a real FHA draft on
 * a self-hosted reference install.
 *
 * It was invisible to every guard we had:
 *   · the startup hard-stop reads the CONFIGURED value, which is empty, so nothing to refuse;
 *   · SLConfigEgress() builds its list from the configured value, so it did not list the host —
 *     while SL-DG-0001 section 7.2 tells the customer that list is every address the app contacts;
 *   · SL-EULA-0004 section 2A says Licensor receives no AI requests on a customer install.
 * Exactly the defect class fixed for the AI endpoint on 6 Sep (config 1.2, "a blank AI address is
 * FINAL"); the corpus endpoint was missed then. The desktop app was protected only by its egress
 * allowlist, which means retrieval there failed silently instead.
 *
 * THE RULE: SLConfig is the only authority for this address. Hosted demo supplies the default;
 * every customer mode means OFF when blank. Retrieval is advisory, so off costs nothing but the
 * knowledge lookup.
 *
 * Run: node tests/regression_corpus_no_fallback.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const cfgSrc = fs.readFileSync(path.join(SITE, 'slab_config.js'), 'utf8');
const corpusSrc = fs.readFileSync(path.join(SITE, 'corpus_retrieve.js'), 'utf8');

// ---- [1] corpus_retrieve carries NO address of its own ----------------------------------------
console.log('\n[corpus] the module has no fallback');
check('corpus_retrieve.js names no Safety Lab host outside comments',
  !corpusSrc.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n').includes('api.safetylabaero.com'),
  'a fallback here is invisible to the hard-stop and to SLConfigEgress');
check('it reads SLConfig.corpusEndpoint and nothing else', /window\.SLConfig && window\.SLConfig\.corpusEndpoint/.test(corpusSrc) && !/__SLAB_CORPUS_ENDPOINT__/.test(corpusSrc.replace(/\/\*[\s\S]*?\*\//g, '')));
check('search() returns nothing when the address is blank', /if \(!ENDPOINT\) return \[\];/.test(corpusSrc));
check('the ITAR fail-closed guard still runs', /if \(_itarBlocked\(\)\) return \[\];/.test(corpusSrc));

// ---- [2] slab_config resolves it, per mode, EXECUTED -------------------------------------------
console.log('\n[corpus] slab_config resolution, executed in vm');
function resolve(globals) {
  const W = Object.assign({ location: { search: '' } }, globals);
  const sb = { window: W, console: { info(){}, warn(){}, error(){} }, document: { getElementById: () => null, createElement: () => ({ setAttribute(){}, appendChild(){} }), addEventListener(){}, readyState: 'complete', body: { appendChild(){} }, documentElement: { appendChild(){} } }, URL };
  sb.window = sb.window || {}; sb.self = sb; vm.createContext(sb);
  try { vm.runInContext(cfgSrc, sb); } catch (e) { return { err: e.message }; }
  const C = sb.window.SLConfig || {};
  return { mode: C.mode, corpus: C.corpusEndpoint, egress: (C.egress || []).map(e => e.purpose + '=' + e.host + (e.safetyLab ? '!SL' : '')) };
}
const CUSTOMER = { __SLAB_SUPABASE_URL__: 'https://cust.supabase.co', __SLAB_SUPABASE_KEY__: 'k', __SLAB_AI_ENDPOINT__: 'https://ai.cust.com/v1/ai' };
const selfHosted = resolve(CUSTOMER);
check('self-hosted, corpus unset -> corpus is OFF (was: our cloud)', selfHosted.mode === 'self-hosted' && selfHosted.corpus === '', JSON.stringify(selfHosted));
check('self-hosted, corpus unset -> SLConfigEgress lists NO Safety Lab host',
  !(selfHosted.egress || []).some(e => /!SL/.test(e)), JSON.stringify(selfHosted.egress));
const selfHostedOwn = resolve(Object.assign({ __SLAB_CORPUS_ENDPOINT__: 'https://corpus.cust.com' }, CUSTOMER));
check('self-hosted, corpus set -> the customer address is used and listed',
  selfHostedOwn.corpus === 'https://corpus.cust.com' && selfHostedOwn.egress.some(e => e.startsWith('method corpus=corpus.cust.com')), JSON.stringify(selfHostedOwn));
const hosted = resolve({});
check('hosted demo -> the Safety Lab corpus default still applies', hosted.mode === 'hosted-demo' && /api\.safetylabaero\.com/.test(hosted.corpus || ''), JSON.stringify(hosted));
const browserOnly = resolve({ __SLAB_LOCAL_ONLY__: true });
check('browser-only -> corpus OFF', browserOnly.mode === 'browser-only' && !browserOnly.corpus, JSON.stringify(browserOnly));

console.log('\n' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'PASS ' + pass + ' / ' + pass));
process.exit(fail ? 1 : 0);
