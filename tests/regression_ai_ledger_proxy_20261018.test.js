#!/usr/bin/env node
/*
 * Regression — SEC-3b, the app's half (18 Oct 2026).
 *
 * The AI proxy now writes the server ledger row (audit_log, source 'proxy') from what it saw, and says so
 * on the response: x-safetylab-audit: proxy. The app must then NOT write its own self-reported row too,
 * and must still write one for every call the proxy did not record: a response without the header (an
 * older or ledger-less proxy, a refusal before the AI), a network failure, a key held in this tab.
 * The project's own AI log keeps every call either way, and says which ones the proxy recorded.
 * AiClient (core_modules.js) is executed in a VM with a stubbed fetch and a spy on SLAudit.aiCall.
 * The proxy's half: safety-lab-proxy-deploy/test/audit_ledger.test.mjs. The database's: 25_ai_ledger_from_proxy.sql
 * and customer-install/db/tests/access_rules/checks_audit.txt.
 *
 * Run: node tests/regression_ai_ledger_proxy_20261018.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = process.env.SLAB_SITE || path.join(__dirname, '..', 'site');
const core = fs.readFileSync(path.join(SITE, 'core_modules.js'), 'utf8');
const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');

function makeClient(fetchImpl) {
    const ls = {}, spy = [];
    const ctx = vm.createContext({
        window: { SLAudit: { aiCall: e => spy.push(e) } }, console, TextDecoder, TextEncoder, Date, Math, JSON, Number, String, Array, Object, isFinite, parseFloat,
        localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); } },
        indexedDB: undefined, fetch: fetchImpl,
        AI_LS_ANTHROPIC: 'safetyLab.ai.anthropicKey', AI_LS_VOYAGE: 'safetyLab.ai.voyageKey', AI_LS_COST: 'safetyLab.ai.sessionCost',
        AI_PROXY_BASE_URL: 'https://proxy.test/v1/ai',
        MODEL_TOKEN_WEIGHTS: { 'claude-sonnet-4-6': 1.0 }, AI_PRICES_USD_PER_MTOK: { 'claude-sonnet-4-6': { input: 3, output: 15 } },
        projectConfig: { aiSettings: {} },
        isProPlusLicensed: () => true, getLicenseToken: () => 'tok_test_0000000000000000',
        Review: undefined, scheduleAutosave: undefined
    });
    vm.runInContext(core, ctx);
    return { C: ctx.window.AiClient, spy, ctx };
}
const hdrs = (o) => ({ get: h => { const k = String(h).toLowerCase(); return k in o ? o[k] : null; } });
const jsonRes = (body, status, extra) => ({ ok: status < 400, status, headers: hdrs(Object.assign({ 'content-type': 'application/json' }, extra || {})), json: async () => body });
const OKBODY = { model: 'claude-sonnet-4-6', usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'text', text: 'hi' }] };
const ask = (C) => C.messages({ system: 'S', messages: [{ role: 'user', content: 'go' }], feature: 'chat', model: 'claude-sonnet-4-6' });
const last = (C) => { const l = C.getAuditLog(); return l[l.length - 1]; };

(async () => {
    console.log('\n[1] the proxy recorded it: the app does not write a second row');
    {
        const { C, spy } = makeClient(async () => jsonRes(OKBODY, 200, { 'x-safetylab-audit': 'proxy' }));
        await ask(C);
        check('no app row for a call the proxy recorded', spy.length === 0, JSON.stringify(spy));
        check('...the project\'s own log still has the call, marked as recorded by the proxy', last(C) && last(C).ok === true && last(C).ledger === 'proxy' && !('observed' in last(C)), JSON.stringify(last(C)));
    }
    {
        const { C, spy } = makeClient(async () => jsonRes({ error: { message: 'max_tokens too large' } }, 400, { 'x-safetylab-audit': 'proxy' }));
        let threw = false; try { await ask(C); } catch (_) { threw = true; }
        check('a failure the proxy recorded: no app row either', threw && spy.length === 0 && last(C).ok === false && last(C).ledger === 'proxy');
    }
    {
        const { C, spy } = makeClient(async () => jsonRes({ data: [{ embedding: [0.1] }], usage: { total_tokens: 7 } }, 200, { 'x-safetylab-audit': 'proxy' }));
        await C.embed('x');
        check('embeddings the proxy recorded: no app row', spy.length === 0 && last(C).ledger === 'proxy');
    }
    {
        const { C, spy } = makeClient(async () => jsonRes({ detail: 'bad input' }, 400, { 'x-safetylab-audit': 'proxy' }));
        let threw = false; try { await C.embed('x'); } catch (_) { threw = true; }
        check('a failed embeddings call the proxy recorded: no app row', threw && spy.length === 0 && last(C).ok === false && last(C).ledger === 'proxy');
    }

    console.log('\n[2] everything else is still recorded by the app');
    {
        const { C, spy } = makeClient(async () => jsonRes(OKBODY, 200));
        await ask(C);
        check('a response without the header (older or ledger-less proxy): one app row', spy.length === 1 && spy[0].feature === 'chat' && spy[0].ok === true, JSON.stringify(spy));
        check('...and the project log does not claim the proxy recorded it', last(C) && !('ledger' in last(C)));
    }
    {
        const { C, spy } = makeClient(async () => jsonRes({ error: { message: 'Request rate limit (1/min) exceeded' } }, 429));
        let threw = false; try { await ask(C); } catch (_) { threw = true; }
        check('a refusal before the AI (no header): one app row, failed', threw && spy.length === 1 && spy[0].ok === false);
    }
    {
        const { C, spy } = makeClient(async () => { throw new Error('network down'); });
        let threw = false; try { await ask(C); } catch (_) { threw = true; }
        check('a network failure: one app row, failed', threw && spy.length === 1 && spy[0].ok === false && /network down/.test(spy[0].error));
    }
    {
        const { C, spy } = makeClient(async () => jsonRes(OKBODY, 200, { 'x-safetylab-audit': 'something-else' }));
        await ask(C);
        check('only the exact value counts: any other header value still gets an app row', spy.length === 1);
    }

    console.log('\n[3] wiring');
    // at least 1.13 (a later change to core_modules.js bumps it again: 22 Oct 2026, 1.14)
    { const m = /core_modules\.js\?v=1\.(\d+)"/.exec(idx); check('index.html loads core_modules.js 1.13 or later', !!m && Number(m[1]) >= 13, m && m[0]); }
    check('the app reads the header only through the one helper', (core.match(/x-safetylab-audit/g) || []).length === 2 && /function _proxyAudited\(r\)/.test(core));

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
