#!/usr/bin/env node
/*
 * Regression — A15 phase 2: the client corpus module (4 Aug 2026).
 * Pins: ITAR gate FIRST and fail-closed; corpus failure never blocks a
 * completion; exact-id lookup solves the citers-outrank-the-section note;
 * cited-reference framing; the Provider injection is awaited, guarded, and
 * query-capped. Stores read by BARE IDENTIFIER (let-scoped world, 3 Aug).
 * Run: node tests/regression_a15_client.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const PIN = require('./lib/pinfloor.js');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const src = fs.readFileSync(path.join(SITE, 'corpus_retrieve.js'), 'utf8');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');

function world(itar, fetchImpl) {
    const sb = { console, JSON, Math, String, Array, Promise, encodeURIComponent, fetch: fetchImpl };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext('let projectConfig = ' + JSON.stringify({ isITARControlled: itar }) + ';', sb);
    vm.runInContext(src, sb);
    return sb;
}
const HIT = { id: '14CFR-25.1309', title: '§ 25.1309 Equipment, systems, and installations.', part: '25', score: 9.9, text: 'The airplane systems must be designed…', provenance: { section: '25.1309' } };
const CITER = { id: '14CFR-25.1365', title: '§ 25.1365 Electrical appliances.', part: '25', score: 12.1, text: 'meet the requirements of § 25.1309(b)…', provenance: { section: '25.1365' } };
const okFetch = (calls) => async (url) => { calls.push(url); return { ok: true, json: async () => ({ issueDate: '2026-07-31', results: [CITER, HIT] }) }; };

(async function main() {
console.log('\n[a15c] ITAR gate first, fail closed');
let calls = [];
const wI = world(true, okFetch(calls));
check('an ITAR project retrieves NOTHING — zero egress', (await wI.A15_CORPUS.search('x')).length === 0 && calls.length === 0);
check('lookup and groundingBlock gate identically',
  (await wI.A15_CORPUS.lookup('25.1309')).length === 0 && (await wI.A15_CORPUS.groundingBlock('x')) === '' && calls.length === 0);
check('UNKNOWN control state fails CLOSED', /catch \(_\) \{ return true; \}/.test(src));

console.log('\n[a15c] retrieval + the exact-id lookup');
calls = [];
const w = world(false, okFetch(calls));
const hits = await w.A15_CORPUS.search('failure condition', 4);
check('search returns parsed hits with provenance + issueDate', hits.length === 2 && hits[0].issueDate === '2026-07-31');
const ex = await w.A15_CORPUS.lookup('§ 25.1309');
check('lookup returns the SECTION ITSELF even when a citer outscores it (the 4 Aug ranking note)',
  ex.length === 1 && ex[0].id === '14CFR-25.1309');
const gb = await w.A15_CORPUS.groundingBlock('loss of pitch control');
check('the grounding block is cited-reference framed (authoritative, cite-by-id, never alter, ignorable)',
  gb.includes('REGULATORY REFERENCE') && gb.includes('AUTHORITATIVE') && gb.includes('[14CFR-') && gb.includes('if none is relevant, ignore them'));
const wDown = world(false, async () => { throw new Error('net down'); });
check('corpus down → empty, never a throw (drafting must not block on retrieval)',
  (await wDown.A15_CORPUS.search('x')).length === 0 && (await wDown.A15_CORPUS.groundingBlock('x')) === '');
check('endpoint overridable for desktop/air-gap (__SLAB_CORPUS_ENDPOINT__)', src.includes('__SLAB_CORPUS_ENDPOINT__'));

console.log('\n[a15c] the Provider injection');
check('injection rides Provider.complete beside the memory exemplars, AWAITED and guarded',
  ai.includes('await window.A15_CORPUS.groundingBlock(') && /try \{\s*\n\s*if \(window\.A15_CORPUS/.test(ai));
check('the query is the task content, capped at 300 chars', ai.includes(".slice(0, 300)") && ai.includes('opts.messages[0]'));
check('wiring: corpus_retrieve 1.0+, loader 4.9+, ai 71.8+',
  PIN.atLeast(idx, 'corpus_retrieve.js', '1.0') &&
  PIN.atLeast(idx, 'ai_loader.js', '4.9') &&
  PIN.atLeast(fs.readFileSync(path.join(SITE, 'ai_loader.js'), 'utf8'), 'ai_assistant.js', '71.8'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
})();
