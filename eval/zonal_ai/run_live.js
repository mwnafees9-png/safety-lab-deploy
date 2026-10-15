#!/usr/bin/env node
// Live runner for the zonal / particular risk AI eval (rule 29).
// Builds each case's request with the SAME code the app uses (SLZonalAI.gather + buildRequest:
// same system prompt, same payload, same passages) and sends it to the Anthropic Messages API,
// the backend the app's Provider.complete reaches by default. Records the raw answers to
// eval/zonal_ai/recorded/live_<model>_<date>.json, then scores them with score.js.
// Needs ANTHROPIC_API_KEY. Without it, it says so and exits 3: no numbers are invented.
// Usage: ANTHROPIC_API_KEY=... node eval/zonal_ai/run_live.js [model[,model...]] [model ...]
//   e.g. node eval/zonal_ai/run_live.js claude-opus-5-5,claude-sonnet-5-5,claude-haiku-5-5,claude-fable-5-1,claude-opus-4-8
// 15 Oct 2026: every request body goes through site/ai_request.js (SLAiRequest.shape), the same rules the app's AiClient
// applies (no sampling parameters on Claude 5.x, explicit effort in output_config, max_tokens room for thinking); the
// feature name is the app's ('zonal.<lane>'), so the effort is the one the app would send. Old ids keep temperature 0
// where the model accepts it, as before. Without a model the run uses the app's current default reason model.
// ANTHROPIC_BASE (optional) points at a proxy that speaks the Messages API, to run through the proxy path.
'use strict';
const path = require('path'), fs = require('fs');
const Z = require(path.join(__dirname, '..', '..', 'site', 'zonal_ai.js'));
const F = require('./fixtures.js');
const { score } = require('./score.js');
const AR = require(path.join(__dirname, '..', '..', 'site', 'ai_request.js'));

async function runModel(key, model) {
    const outputs = {}, shapes = {};
    const url = (process.env.ANTHROPIC_BASE || 'https://api.anthropic.com').replace(/\/+$/, '') + '/v1/messages';
    for (const c of F.CASES) {
        const req = Z.buildRequest(Z.gather(c.lane, c.target, F.env()));
        const body = { model, max_tokens: req.maxTokens, system: req.system, messages: [{ role: 'user', content: req.user }] };
        shapes[c.id] = AR.shape(body, model, { temperature: 0, feature: req.feature });
        const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
        const j = await res.json();
        // thinking blocks (Claude 5.x) are skipped: only text blocks are the answer
        outputs[c.id] = (j.content || []).filter(b => b && b.type === 'text').map(b => b.text || '').join('');
        console.log(model + ' ' + c.id + ': ' + res.status + (res.ok ? '' : ' ' + JSON.stringify(j.error || j).slice(0, 200)));
    }
    const day = new Date().toISOString().slice(0, 10);
    const rec = { label: 'live ' + model + ' ' + day, source: 'model', model, at: day, request: { effort: shapes[F.CASES[0].id].effort, gen5: shapes[F.CASES[0].id].gen5, temperatureApplied: shapes[F.CASES[0].id].temperatureApplied }, outputs };
    const dir = path.join(__dirname, 'recorded'); fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, 'live_' + model.replace(/[^a-z0-9.-]/gi, '_') + '_' + day + '.json');
    fs.writeFileSync(f, JSON.stringify(rec, null, 2));
    const r = score(rec);
    return { model, file: f, citationValidity: r.citationValidity, correctness: r.correctness, hallucination: r.hallucination, gapDetection: r.gapDetection };
}
async function main() {
    const key = process.env.ANTHROPIC_API_KEY;
    const models = process.argv.slice(2).join(',').split(',').map(s => s.trim()).filter(Boolean);
    if (!models.length) models.push(AR.defaultModel('reason'));
    if (!key) { console.log('ANTHROPIC_API_KEY is not set: the live run did not happen. Score recorded outputs with score.js.'); process.exit(3); }
    const rows = [];
    for (const m of models) rows.push(await runModel(key, m));
    console.log(JSON.stringify(rows, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
