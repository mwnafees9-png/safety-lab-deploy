#!/usr/bin/env node
/* Regression (15 Oct 2026): the Claude 5.x generation (Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5). site/ai_request.js
 * holds the model list, prices, allowance weights, the one switch for the new defaults (off until the live eval passes)
 * and the request rules from the Opus 5.5 migration guide; AiClient (core_modules.js), the AI assistant's model
 * defaults, the settings dropdown, the cost tables, the self-host proxy weights and the live eval runner use it. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + d : '')); } };
const ROOT = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SRC = read('site/ai_request.js');
const load = src => { const sb = { module: { exports: {} }, console }; sb.globalThis = sb; vm.runInNewContext(src, sb); return sb.module.exports; };
const A = load(SRC), NEW = ['claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'], OLD = ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-6', 'claude-fable-5'];
function probe(Ax) {
    const out = {};
    out.gen5 = NEW.every(m => Ax.gen5(m)) && ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-6'].every(m => !Ax.gen5(m));
    out.noTemp = NEW.every(m => Ax.acceptsTemperature(m) === false);
    out.oldTemp = Ax.acceptsTemperature('claude-opus-4-8') === false && Ax.acceptsTemperature('claude-sonnet-4-6') === false && Ax.acceptsTemperature('claude-haiku-4-5-20251001') === true && Ax.acceptsTemperature('claude-opus-4-6') === true;
    const b = { model: 'claude-opus-5-5', max_tokens: 4096, temperature: 0.2, top_p: 0.9, top_k: 5, thinking: { type: 'enabled', budget_tokens: 1000 }, messages: [{ role: 'user', content: 'x' }] };
    out.shape = Ax.shape(b, 'claude-opus-5-5', { temperature: 0, feature: 'zonal.pra.writeup' }); out.body = b;
    const c = { model: 'claude-haiku-5-5', max_tokens: 200000, messages: [{ role: 'user', content: 'x' }] }; out.shapeH = Ax.shape(c, 'claude-haiku-5-5', { feature: 'classify.triage' }); out.bodyH = c;
    const d = { model: 'claude-haiku-4-5-20251001', max_tokens: 4096, messages: [{ role: 'user', content: 'x' }] }; out.shapeOld = Ax.shape(d, 'claude-haiku-4-5-20251001', { temperature: 0, feature: 'fha.draft' }); out.bodyOld = d;
    const e = { model: 'claude-opus-4-8', max_tokens: 4096, messages: [{ role: 'user', content: 'x' }] }; Ax.shape(e, 'claude-opus-4-8', { temperature: 0 }); out.bodyO48 = e;
    const f = { model: 'claude-sonnet-5-5', max_tokens: 4096, messages: [{ role: 'user', content: 'x' }, { role: 'assistant', content: '{' }] }; out.prefill = Ax.shape(f, 'claude-sonnet-5-5', {});
    return out;
}
const P = probe(A);
check('generation: Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5 are Claude 5.x; Opus 4.8, Sonnet 4.6, Haiku 4.5, Opus 4.6 are not', P.gen5);
check('no sampling parameters on any Claude 5.x model (guide: "Omit temperature, top_p, and top_k ... any other value is rejected")', P.noTemp);
check('old models keep their rules (Opus 4.8 and Sonnet 4.6 omit temperature; Haiku 4.5 and Opus 4.6 accept it)', P.oldTemp);
check('Claude 5.x body: temperature, top_p, top_k and thinking removed, explicit effort in output_config, max_tokens raised to the thinking floor (16000)', !('temperature' in P.body) && !('top_p' in P.body) && !('top_k' in P.body) && !('thinking' in P.body) && P.body.output_config && P.body.output_config.effort === 'medium' && P.body.max_tokens === 16000 && P.shape.effort === 'medium' && P.shape.temperatureApplied === false, JSON.stringify(P.body));
check('classification on Haiku 5.5 runs at effort low; max_tokens capped at the 128K maximum output', P.bodyH.output_config.effort === 'low' && P.bodyH.max_tokens === 128000, JSON.stringify(P.bodyH));
check('old models get no output_config: Haiku 4.5 keeps temperature 0, Opus 4.8 sends none (proxies that route old ids keep working)', !('output_config' in P.bodyOld) && P.bodyOld.temperature === 0 && !('output_config' in P.bodyO48) && !('temperature' in P.bodyO48));
check('a prefilled assistant turn is flagged on Claude 5.x (guide: "Don\'t end messages with a prefilled assistant turn")', P.prefill.prefillRefused === true);
check('defaults, one switch per lane (15 Oct 2026 live eval): reason Opus 5.5; draft Sonnet 4.6 and classify Haiku 4.5 until their own eval', A.USE_NEXT.reason === true && A.USE_NEXT.draft === false && A.USE_NEXT.classify === false && A.defaultModel('reason') === 'claude-opus-5-5' && A.defaultModel('draft') === 'claude-sonnet-4-6' && A.defaultModel('classify') === 'claude-haiku-4-5-20251001' && A.defaultModel('anything-else') === 'claude-opus-5-5');
{ const B = load(SRC.replace('var USE_NEXT = { reason: true, draft: false, classify: false };', 'var USE_NEXT = { reason: true, draft: true, classify: true };'));
  check('switching the draft and classify lanes moves them to Sonnet 5.5 and Haiku 5.5', B.defaultModel('draft') === 'claude-sonnet-5-5' && B.defaultModel('classify') === 'claude-haiku-5-5' && B.defaultModel('reason') === 'claude-opus-5-5'); }
// prices and allowance weights: the models overview, and Sonnet-4.6-relative weights everywhere the app or the proxy meters
{ const CD = read('site/config_data.js'), PX = read('customer-install/selfhost/ai-proxy/worker.js');
  const want = { 'claude-fable-5-1': [10, 50, 3.33], 'claude-opus-5-5': [4, 20, 1.33], 'claude-sonnet-5-5': [2, 10, 0.67], 'claude-haiku-5-5': [0.1, 0.5, 0.033] };
  const ok = Object.keys(want).every(m => { const w = want[m]; const re = new RegExp("'" + m + "':\\s*\\{ input: " + w[0].toFixed(2).replace('.', '\\.') + ",\\s*output: " + w[1].toFixed(2).replace('.', '\\.') + " \\}");
      return A.PRICES[m].input === w[0] && A.PRICES[m].output === w[1] && A.WEIGHTS[m] === w[2] && re.test(CD) && new RegExp("'" + m + "':\\s*" + String(w[2]).replace('.', '\\.') + ",").test(CD) && new RegExp('"' + m + '": ' + String(w[2]).replace('.', '\\.') + ',').test(PX); });
  check('prices ($10/$50, $4/$20, $2/$10, from $0.10/$0.50) and allowance weights in ai_request.js, the cost meter table (config_data.js) and the self-host proxy', ok); }
// wiring
{ const CM = read('site/core_modules.js'), AS = read('site/ai_assistant.js'), HM = read('site/helpers_modules.js'), IDX = read('site/index.html'), RL = read('eval/zonal_ai/run_live.js');
  check('AiClient shapes every Claude 5.x request through SLAiRequest.shape, refuses a prefill, records the effort, and joins text blocks of a buffered thinking answer', /window\.SLAiRequest\.shape\(body, model, \{ temperature: _tempAsked, feature: opts\.feature, effort: opts\.effort \}\)/.test(CM) && /prefilled assistant turn; the request was not sent/.test(CM) && (CM.match(/effort: _shape \? _shape\.effort : null/g) || []).length === 3 && /json\.content\.filter\(function \(b\) \{ return b && b\.type === 'text'; \}\)/.test(CM));
  check('the default model comes from SLAiRequest in AiClient settings, the AI assistant (reason, draft, classify) and the settings form', /window\.SLAiRequest\.defaultModel\('reason'\)/.test(CM) && /A\.defaultModel\('draft'\)/.test(AS) && /A\.defaultModel\('classify'\)/.test(AS) && /A\.defaultModel\('reason'\)/.test(AS) && /SLAiRequest\.defaultModel\('reason'\)/.test(HM));
  // the verifier: always the other family, from the eval-approved lane defaults (run the real function)
  { const fn = AS.slice(AS.indexOf('    function _verifierModel('), AS.indexOf('    async function _runSafetyVerifier'));
    const mk = (reason, draft) => { const sb = { MODELS: { reason, draft } }; vm.runInNewContext(fn + '; this.v = _verifierModel;', sb); return sb.v; };
    const v1 = mk('claude-opus-5-5', 'claude-sonnet-4-6'), v2 = mk('claude-opus-5-5', 'claude-sonnet-5-5'), v3 = mk('claude-sonnet-4-6', 'claude-sonnet-4-6');
    check('verifier: an Opus 5.5 draft is checked by the draft lane\'s Sonnet (4.6 now, 5.5 once that lane switches); a Sonnet draft by the reason lane\'s Opus, or Opus 4.8 if the reason model is not an Opus', v1('claude-opus-5-5') === 'claude-sonnet-4-6' && v2('claude-opus-5-5') === 'claude-sonnet-5-5' && v1('claude-sonnet-4-6') === 'claude-opus-5-5' && v3('claude-sonnet-4-6') === 'claude-opus-4-8' && v1() === 'claude-sonnet-4-6'); }
  const sel = IDX.slice(IDX.indexOf('<select id="ai-anthropic-model">'), IDX.indexOf('</select>', IDX.indexOf('<select id="ai-anthropic-model">')));
  check('the model dropdown offers Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5 and keeps the previous ids; Opus 5.5 is labeled the default', NEW.every(m => sel.indexOf('value="' + m + '"') >= 0) && OLD.every(m => sel.indexOf('value="' + m + '"') >= 0) && /Claude Opus 5\.5 \(default: reasoning and write-ups/.test(sel) && /Claude Opus 4\.8 \(previous, 5x allowance\)/.test(sel) && !/current default/.test(sel) && sel.indexOf(String.fromCharCode(0x2014)) < 0);
  check('index.html loads ai_request.js right before core_modules.js', IDX.indexOf('ai_request.js?v=') > 0 && IDX.indexOf('ai_request.js?v=') < IDX.indexOf('core_modules.js?v=') && IDX.slice(IDX.indexOf('ai_request.js?v='), IDX.indexOf('core_modules.js?v=')).split('<script').length === 2);
  check('the live eval runner takes a model list and shapes each request with the app\'s rules', /process\.argv\.slice\(2\)\.join\(','\)\.split\(','\)/.test(RL) && /AR\.shape\(body, model, \{ temperature: 0, feature: req\.feature \}\)/.test(RL) && /b\.type === 'text'/.test(RL));
  check('no em dash in ai_request.js', SRC.indexOf(String.fromCharCode(0x2014)) < 0); }
const mut = (name, from, to, red) => { if (SRC.indexOf(from) < 0) { check('anchor present: ' + name, false); return; } let r; try { r = red(probe(load(SRC.replace(from, to)))); } catch (e) { r = true; } check('mutation goes red: ' + name, r); };
mut('Haiku / Fable not treated as Claude 5.x', "if (/claude-(fable|mythos)\\b/.test(m)) return true;", "", P2 => !P2.gen5 || !P2.noTemp);
mut('temperature kept on Claude 5.x', "            delete body.temperature;\n", "", P2 => 'temperature' in P2.body);
mut('no explicit effort', "            body.output_config = Object.assign({}, body.output_config || {}, { effort: out.effort });\n", "", P2 => !(P2.body.output_config && P2.body.output_config.effort));
mut('reason lane not switched (stays on Opus 4.8)', "var USE_NEXT = { reason: true, draft: false, classify: false };", "var USE_NEXT = { reason: false, draft: false, classify: false };", () => load(SRC.replace("var USE_NEXT = { reason: true, draft: false, classify: false };", "var USE_NEXT = { reason: false, draft: false, classify: false };")).defaultModel('reason') !== 'claude-opus-5-5');
mut('no max_tokens room for thinking', "body.max_tokens = Math.min(MODEL_MAX_OUTPUT, Math.max(body.max_tokens || 0, MAX_TOKENS_FLOOR));", "", P2 => P2.body.max_tokens !== 16000);
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
