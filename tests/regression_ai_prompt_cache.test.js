#!/usr/bin/env node
/*
 * Regression — prompt caching on the AI path (12 Sep 2026).
 *
 * WHY: every AI call used to send the whole system prompt (skill body + severity rubric
 * + the uploaded source document, 30-60k tokens) as ONE plain string, re-billed at full
 * input price on every batch, repair pass and review. Anthropic bills a repeated prefix at
 * a tenth of that when the request marks it with cache_control. This is PACKAGING ONLY:
 * the words the model sees are the words it saw before, in the same order (rule 29 — no
 * eval needed); what changes is that the string is cut into blocks on the wire.
 *
 * Executes the REAL source (AiClient from core_modules.js, the assembler and the chat
 * prompt parts from ai_assistant.js) in a vm sandbox — never a re-implementation.
 *
 *   C1  systemBlocks: blocks joined back together === the original string, byte for byte.
 *   C2  every block but the last carries cache_control; the last (variable tail) does not.
 *   C3  cuts land only on '\n\n' seams, seam kept in the earlier block; a bad break
 *       (mid-line, out of range, out of order, non-integer) is dropped, never guessed.
 *   C4  no breaks / not a string => the wire shape is unchanged (string), so the
 *       customer's own OpenAI-style endpoint and old callers see exactly what they did.
 *   C5  at most 4 markers ever reach the wire (Anthropic's limit).
 *   C6  messages() puts the blocks on body.system and reads cache counters back from the
 *       stream's message_start; the cost, the allowance and the audit entry price cache
 *       writes at 1.25x and reads at 0.10x of input.
 *   A1  the assembler records a break right after the skill body and right after the
 *       source-document block, each on a seam, and nothing else; no doc => one break.
 *   A2  the recorded breaks split the ASSEMBLED string cleanly (C1 holds end to end).
 *   A3  the chat prompt parts: text identical to the old join; first break just past the
 *       role text's seam; second just past the seam the caller appends after the state.
 *   W1  the wiring: Provider.complete passes cacheBreaks; _anemComplete builds them from
 *       the chat parts + the assembler's; the batch hands them to both _anemRun sites.
 *
 * Run: node tests/regression_ai_prompt_cache.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const core = S('core_modules.js'), ai = S('ai_assistant.js'), idx = S('index.html'), loader = S('ai_loader.js');
const PIN = require('./lib/pinfloor.js');

// ---------------------------------------------------------------- AiClient, executed
function makeClient(fetchImpl, store) {
    const ls = store || {};
    const ctx = vm.createContext({
        window: {}, console: console, TextDecoder: TextDecoder, Date: Date, Math: Math, JSON: JSON, Number: Number, String: String, Array: Array, Object: Object, isFinite: isFinite, parseFloat: parseFloat,
        localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); } },
        indexedDB: undefined,
        fetch: fetchImpl,
        // monolith globals AiClient reads at call time
        AI_LS_ANTHROPIC: 'safetyLab.ai.anthropicKey', AI_LS_VOYAGE: 'safetyLab.ai.voyageKey', AI_LS_COST: 'safetyLab.ai.sessionCost',
        AI_PROXY_BASE_URL: 'https://proxy.test/v1/ai',
        MODEL_TOKEN_WEIGHTS: { 'claude-opus-4-8': 5.0, 'claude-sonnet-4-6': 1.0 },
        AI_PRICES_USD_PER_MTOK: { 'claude-opus-4-8': { input: 15, output: 75 } },
        projectConfig: { aiSettings: {} },
        isProPlusLicensed: () => true, getLicenseToken: () => 'tok_test_0000000000000000',
        Review: undefined, scheduleAutosave: undefined
    });
    vm.runInContext(core, ctx);
    return { AiClient: ctx.window.AiClient, ctx: ctx, ls: ls };
}
const { AiClient } = makeClient(async () => { throw new Error('no fetch expected'); });
check('core_modules exposes AiClient.systemBlocks and billableTokens', typeof AiClient.systemBlocks === 'function' && typeof AiClient.billableTokens === 'function');

const join = b => Array.isArray(b) ? b.map(x => x.text).join('') : b;
const P = (n, w) => Array.from({ length: n }, (_, i) => w + i).join(' ');
const sys = 'PROMPT ' + P(40, 'p') + '\n\nSKILL ' + P(60, 's') + '\n\nTHREAD ' + P(10, 't') + '\n\nDOC ' + P(200, 'd') + '\n\nRUBRIC ' + P(30, 'r') + '\n\nTAIL';
const afterSkill = sys.indexOf('\n\nTHREAD') + 2, afterDoc = sys.indexOf('\n\nRUBRIC') + 2;

console.log('\n[C] systemBlocks — cut on the wire, not in the text');
const b1 = AiClient.systemBlocks(sys, [afterSkill, afterDoc]);
check('C1 blocks joined === original string, byte for byte', Array.isArray(b1) && join(b1) === sys);
check('C1 three blocks for two breaks', Array.isArray(b1) && b1.length === 3, Array.isArray(b1) ? b1.length : typeof b1);
check('C2 every block but the last carries cache_control ephemeral', Array.isArray(b1) && b1.slice(0, -1).every(x => x.cache_control && x.cache_control.type === 'ephemeral'));
check('C2 the last block carries NO marker (it is the variable tail)', Array.isArray(b1) && !('cache_control' in b1[b1.length - 1]));
check('C2 every block is a text block', Array.isArray(b1) && b1.every(x => x.type === 'text' && typeof x.text === 'string' && x.text.length));
check('C3 the seam stays in the EARLIER block (block ends with \\n\\n, next starts with a word)', Array.isArray(b1) && /\n\n$/.test(b1[0].text) && /^THREAD/.test(b1[1].text) && /\n\n$/.test(b1[1].text) && /^RUBRIC/.test(b1[2].text));
check('C3 mid-line break is dropped, not guessed', join(AiClient.systemBlocks(sys, [afterSkill + 3])) === sys && AiClient.systemBlocks(sys, [afterSkill + 3]) === sys);
check('C3 out-of-range breaks (0, length, beyond) are dropped', AiClient.systemBlocks(sys, [0, sys.length, sys.length + 50]) === sys);
check('C3 out-of-order second break is dropped, first kept', (function () { const b = AiClient.systemBlocks(sys, [afterDoc, afterSkill]); return Array.isArray(b) && b.length === 2 && join(b) === sys && b[0].text.length === afterDoc; })());
check('C3 non-integer / NaN breaks are dropped', AiClient.systemBlocks(sys, [afterSkill + 0.5, NaN, 'x']) === sys);
check('C4 no breaks => string unchanged', AiClient.systemBlocks(sys) === sys && AiClient.systemBlocks(sys, []) === sys);
check('C4 empty / non-string system passes through untouched', AiClient.systemBlocks('', [1]) === '' && AiClient.systemBlocks(undefined, [1]) === undefined);
const many = Array.from({ length: 12 }, (_, i) => 'B' + i + ' ' + P(20, 'w')).join('\n\n') + '\n\nEND';
const seams = []; let at = -1; while ((at = many.indexOf('\n\n', at + 1)) !== -1) seams.push(at + 2);
const bMany = AiClient.systemBlocks(many, seams);
check('C5 at most 4 markers reach the wire even with 12 valid seams', Array.isArray(bMany) && bMany.filter(x => x.cache_control).length === 4 && bMany.length === 5 && join(bMany) === many);

console.log('\n[C6] messages() — blocks on the wire, cache counters read back, priced');
function sse(events) { return events.map(e => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''); }
function streamResponse(text) {
    const enc = new TextEncoder(); let sent = false;
    return {
        ok: true, status: 200, headers: { get: h => (h === 'content-type' ? 'text/event-stream; charset=utf-8' : null) },
        body: { getReader: () => ({ read: async () => sent ? { done: true } : (sent = true, { done: false, value: enc.encode(text) }) }) }
    };
}
(async function () {
    const seen = [];
    const { AiClient: C, ctx, ls } = makeClient(async (url, init) => {
        seen.push({ url, body: JSON.parse(init.body) });
        return streamResponse(sse([
            { type: 'message_start', message: { model: 'claude-opus-4-8', usage: { input_tokens: 700, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 21000 } } },
            { type: 'content_block_delta', delta: { type: 'text_delta', text: '{"rows":[]}' } },
            { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 400 } }
        ]));
    });
    const r = await C.messages({ system: sys, cacheBreaks: [afterSkill, afterDoc], messages: [{ role: 'user', content: 'go' }], feature: 'fha.populate', model: 'claude-opus-4-8' });
    const wire = seen[0] && seen[0].body;
    check('C6 request went to the proxy messages route', seen.length === 1 && /\/anthropic\/messages$/.test(seen[0].url));
    check('C6 body.system is the block array, joined === the string', wire && Array.isArray(wire.system) && join(wire.system) === sys && wire.system.length === 3);
    check('C6 markers on the two stable prefixes only', wire && wire.system[0].cache_control && wire.system[1].cache_control && !wire.system[2].cache_control);
    check('C6 stream:true is still set (caching works with streaming)', wire && wire.stream === true);
    check('C6 user turn carries no marker', wire && typeof wire.messages[0].content === 'string');
    check('C6 usage read back carries both cache counters', r.usage && r.usage.cache_read_input_tokens === 21000 && r.usage.cache_creation_input_tokens === 0 && r.usage.input_tokens === 700 && r.usage.output_tokens === 400);
    const cost = parseFloat(ls['safetyLab.ai.sessionCost']);
    const expect = (700 / 1e6) * 15 + (400 / 1e6) * 75 + (21000 / 1e6) * 15 * 0.10;
    check('C6 session cost prices the cache read at 0.10x input', Math.abs(cost - expect) < 1e-9, cost + ' vs ' + expect);
    const used = ctx.projectConfig.aiTokenUsage && ctx.projectConfig.aiTokenUsage.used;
    check('C6 allowance counts (in + out + 0.10*read) * model weight', Math.abs(used - (700 + 400 + 2100) * 5) < 1e-6, String(used));
    const log = C.getAuditLog(); const last = log[log.length - 1];
    check('C6 audit entry records cacheRead / cacheWrite / cacheMarkers', last && last.cacheRead === 21000 && last.cacheWrite === 0 && last.cacheMarkers === 2 && last.tokensIn === 700);
    check('C6 billableTokens prices a write at 1.25x', Math.abs(C.billableTokens({ input_tokens: 10, output_tokens: 0, cache_creation_input_tokens: 1000 }) - 1260) < 1e-9);
    check('C6 billableTokens with no cache fields === in + out (old responses bill as before)', C.billableTokens({ input_tokens: 10, output_tokens: 5 }) === 15);

    // A plain string (no breaks) still goes as a string — the pre-caching wire shape.
    seen.length = 0;
    await C.messages({ system: 'plain', messages: [{ role: 'user', content: 'go' }], feature: 'x', model: 'claude-opus-4-8' });
    check('C4 messages() with no breaks sends system as a string', seen[0] && seen[0].body.system === 'plain');

    // ------------------------------------------------------------ assembler, executed
    console.log('\n[A] _assembleAnalysisContext — where the breaks are recorded');
    const m = ai.match(/async function _assembleAnalysisContext\(feature, system, opts\) \{[\s\S]*?\n    \}/);
    check('A0 assembler source found', !!m);
    function sandbox(over) {
        const base = {
            _skillBodyFor: f => 'SPEC(' + f + ')', _FEATURE_SPECS: {},
            _goldenThreadContext: () => 'THREAD', _projectDocContext: () => 'DOCNOTE\nTEXT:\n' + 'D'.repeat(400),
            _memoryExemplars: () => 'MEM', _ZONAL_FEATURES: {}, _zonalContext: () => '',
            _withAssumptionsClause: s => s + '\n\n[ASSUME]', _withBasisClause: s => s + '\n\n[BASIS]', _withInsufficiencyClause: s => s + '\n\n[INSUF]',
            _CONTROLLED_CLASS: /controlled/i,
            window: { AiFidelity: { exemplarsFor: () => 'EX' }, A15_CORPUS: { groundingBlock: async () => 'CORPUS' } }, console
        };
        const c = vm.createContext(Object.assign(base, over || {}));
        vm.runInContext('var __fn = (' + m[0].replace('async function _assembleAnalysisContext', 'async function ') + ');', c);
        return (f, s, o) => vm.runInContext('__fn', c)(f, s, o);
    }
    const o1 = {}; const out1 = await sandbox()('fha.populate', 'BASE', o1);
    check('A1 two breaks recorded on the caller\'s opts', Array.isArray(o1.cacheBreaks) && o1.cacheBreaks.length === 2, JSON.stringify(o1.cacheBreaks));
    check('A1 first break is just past the seam after the skill body', o1.cacheBreaks && out1.slice(0, o1.cacheBreaks[0]) === 'BASE\n\nSPEC(fha.populate)\n\n');
    check('A1 second break is just past the seam after the source document', o1.cacheBreaks && out1.slice(o1.cacheBreaks[1] - 2, o1.cacheBreaks[1]) === '\n\n' && out1.slice(0, o1.cacheBreaks[1]).endsWith('D'.repeat(400) + '\n\n') && out1.slice(o1.cacheBreaks[1]).startsWith('EX'));
    check('A1 breaks ascend and sit inside the string', o1.cacheBreaks && o1.cacheBreaks[0] < o1.cacheBreaks[1] && o1.cacheBreaks[1] < out1.length);
    const bA = C.systemBlocks(out1, o1.cacheBreaks);
    check('A2 the assembled string cuts cleanly at the recorded breaks (3 blocks, byte-identical)', Array.isArray(bA) && bA.length === 3 && join(bA) === out1);
    const o2 = {}; const out2 = await sandbox({ _projectDocContext: () => '' })('fha.populate', 'BASE', o2);
    check('A1 no source document => one break (after the skill body)', Array.isArray(o2.cacheBreaks) && o2.cacheBreaks.length === 1 && out2.slice(0, o2.cacheBreaks[0]) === 'BASE\n\nSPEC(fha.populate)\n\n');
    const o3 = {}; await sandbox({ _skillBodyFor: () => null, _projectDocContext: () => '' })('nothing', 'BASE', o3);
    check('A1 no skill body and no document => no breaks (string goes as before)', Array.isArray(o3.cacheBreaks) && o3.cacheBreaks.length === 0);
    const o4 = {}; const out4 = await sandbox({ _projectDocContext: () => { throw new Error('boom'); } })('fha.populate', 'BASE', o4);
    check('A1 a failing doc provider records no doc break and still returns context', o4.cacheBreaks && o4.cacheBreaks.length === 1 && out4.indexOf('SPEC') > 0);
    check('A1 the assembler still returns a STRING (every consumer\'s contract)', typeof out1 === 'string');

    // ------------------------------------------------------------ chat prompt parts
    console.log('\n[A3] _chatSystemPromptParts — the chat prompt, same text, with breaks');
    const pm = ai.match(/function _chatSystemPromptParts\(role\) \{[\s\S]*?\n    \}/);
    check('A3 parts function found', !!pm);
    const pc = vm.createContext({ _standardsPreamble: () => 'PRE', _chatProjectState: () => ({ a: 1 }), JSON });
    vm.runInContext('var __p = (' + pm[0].replace('function _chatSystemPromptParts', 'function ') + ');', pc);
    const parts = vm.runInContext('__p', pc)('ROLE TEXT');
    const oldJoin = ['PRE', '', 'ROLE TEXT', '', 'CURRENT PROJECT STATE (JSON, read-only — reference these ids). The connected spine is included: each fault-tree page carries its allocTarget / allocDAL and its ccfGroups / repeatedEvents; system functions carry tracesUpTo and system FCs carry rollsUpTo; requirements carry traceTo. Inherit allocated targets (never a severity-class guess when a real target exists), preserve every up-link, and never break an existing CCF grouping or independence claim.', JSON.stringify({ a: 1 })].join('\n');
    check('A3 text is byte-identical to the join _chatSystemPrompt always produced', parts.text === oldJoin);
    check('A3 first break just past the seam after the role text', parts.text.slice(0, parts.breaks[0]) === 'PRE\n\nROLE TEXT\n\n');
    check('A3 second break is two past the end (valid once the caller appends a \\n\\n-led extra)', parts.breaks[1] === parts.text.length + 2);
    const full = parts.text + '\n\nEXTRA\n\nOUTPUT FORMAT';
    const bC = C.systemBlocks(full, parts.breaks);
    check('A3 with a \\n\\n-led extra appended both chat breaks cut cleanly', Array.isArray(bC) && bC.length === 3 && join(bC) === full && bC[1].text.endsWith('{"a":1}\n\n'));
    const bC2 = C.systemBlocks(parts.text + 'X', parts.breaks);
    check('A3 with no seam after the state, the state break is dropped (role break kept)', Array.isArray(bC2) && bC2.length === 2 && join(bC2) === parts.text + 'X');
    check('A3 _chatSystemPrompt() returns the parts text (one prompt, one source)', /function _chatSystemPrompt\(\) \{ return _chatSystemPromptParts\(_chatSystemPromptRole\(\)\)\.text; \}/.test(ai));

    // ------------------------------------------------------------ wiring
    console.log('\n[W] wiring');
    check('W1 Provider.complete passes cacheBreaks to AiClient.messages', /system:\s+opts\.system,\s*\n\s*cacheBreaks: opts\.cacheBreaks/.test(ai));
    check('W1 assembler hands breaks back on opts.cacheBreaks', /opts\.cacheBreaks = _breaks\.filter/.test(ai));
    check('W1 _anemComplete builds breaks from the chat parts + shifted extra breaks and passes them', /const _breaks = _chat\.breaks\.concat\(/.test(ai) && /feature: 'chat\.edit', model: MODELS\.reason, system: sys, cacheBreaks: _breaks/.test(ai));
    check('W1 _anemRun forwards extraBreaks on the first try and the retry', (ai.match(/_anemComplete\(messages, ex[^\n]*extraBreaks\)/g) || []).length === 2);
    check('W1 the batch passes the assembler breaks to BOTH _anemRun call sites', (ai.match(/_anemRun\(_mkMessages\([^)]*\), _sysExtra, _chunk \? _CHUNK_TURN_TOKENS : undefined, 0, _sysBreaks\)/g) || []).length === 2);
    check('W1 the local (customer endpoint) path still sends system as a string', /messages\.push\(\{ role: 'system', content: opts\.system \}\)/.test(ai));
    check('W2 pins: core_modules >= 1.6, ai_loader >= 8.54, ai_assistant >= 76.63', PIN.atLeast(idx, 'core_modules.js', '1.6') && PIN.atLeast(idx, 'ai_loader.js', '8.54') && PIN.atLeast(loader, 'ai_assistant.js', '76.63'));

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  suite threw — ' + (e && e.stack || e)); process.exit(1); });
