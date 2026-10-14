#!/usr/bin/env node
// Live runner for the zonal / particular risk AI eval (rule 29).
// Builds each case's request with the SAME code the app uses (SLZonalAI.gather + buildRequest:
// same system prompt, same payload, same passages) and sends it to the Anthropic Messages API,
// the backend the app's Provider.complete reaches by default. Records the raw answers to
// eval/zonal_ai/recorded/live_<model>_<date>.json, then scores them with score.js.
// Needs ANTHROPIC_API_KEY. Without it, it says so and exits 3: no numbers are invented.
// Usage: ANTHROPIC_API_KEY=... node eval/zonal_ai/run_live.js [model]
'use strict';
const path = require('path'), fs = require('fs');
const Z = require(path.join(__dirname, '..', '..', 'site', 'zonal_ai.js'));
const F = require('./fixtures.js');
const { score } = require('./score.js');

async function main() {
    const key = process.env.ANTHROPIC_API_KEY;
    const model = process.argv[2] || 'claude-sonnet-4-5';
    if (!key) { console.log('ANTHROPIC_API_KEY is not set: the live run did not happen. Score recorded outputs with score.js.'); process.exit(3); }
    const outputs = {};
    for (const c of F.CASES) {
        const req = Z.buildRequest(Z.gather(c.lane, c.target, F.env()));
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model, max_tokens: req.maxTokens, temperature: 0, system: req.system, messages: [{ role: 'user', content: req.user }] })
        });
        const j = await res.json();
        outputs[c.id] = (j.content || []).map(b => b.text || '').join('');
        console.log(c.id + ': ' + res.status);
    }
    const day = new Date().toISOString().slice(0, 10);
    const rec = { label: 'live ' + model + ' ' + day, source: 'model', model, at: day, outputs };
    const dir = path.join(__dirname, 'recorded'); fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, 'live_' + model.replace(/[^a-z0-9.-]/gi, '_') + '_' + day + '.json');
    fs.writeFileSync(f, JSON.stringify(rec, null, 2));
    const r = score(rec);
    console.log(JSON.stringify({ file: f, citationValidity: r.citationValidity, correctness: r.correctness, hallucination: r.hallucination, gapDetection: r.gapDetection }, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
