/* ============================================================================
 * ai_request.js (SLAiRequest), 15 Oct 2026: the one place that knows which Claude models exist in this
 * app, which are the defaults, and how a Messages request must be shaped for each model generation.
 * Loaded before core_modules.js (AiClient) and used by eval/zonal_ai/run_live.js, so the live eval
 * sends exactly what the app sends.
 *
 * Request rules for the Claude 5.x generation (Opus 5.5, Sonnet 5.5, Haiku 5.5, Fable 5.1), from the
 * Opus 5.5 migration guide (platform.claude.com/docs/en/models/opus-5-5/migration-guide, read 15 Oct 2026):
 *   "Sampling parameters: Omit temperature, top_p, and top_k, or leave them at their defaults: any other
 *    value is rejected."
 *   "Thinking: Send no thinking field, or send thinking: {"type": "adaptive"}, which is equivalent ...
 *    thinking: {"type": "disabled"} and manual thinking budgets ... are rejected."
 *   "Effort: Control thinking depth with the effort parameter, the only request parameter that controls
 *    it. All five levels (low, medium, high, xhigh, max) are supported, and the default is medium."
 *    (sent as output_config: {"effort": ...})
 *   "max_tokens remains a hard limit on total output, thinking plus response text"
 *   "Prefill: Don't end messages with a prefilled assistant turn: it is rejected."
 * The models overview gives Sonnet 5.5 and Fable 5.1 a default effort of high and Opus 5.5 / Haiku 5.5
 * medium; this module always sends an explicit effort so a changed provider default cannot change the
 * app's behavior unseen. Older models (Opus 4.x, Sonnet 4.x, Haiku 4.5) get no output_config and keep
 * their existing handling, so a proxy that still routes the old ids keeps working.
 * ========================================================================== */
(function (root) {
    'use strict';
    // One switch per lane: true uses the Claude 5.x default for that lane. 15 Oct 2026 live eval through the app path
    // (7 cases, zonal / PRA lanes): claude-opus-5-5 7/7 correct, citations 108/108, 0 traps, so the reasoning lane
    // (MODELS.reason, AI write-ups, AI chat default, the zonal / PRA AI lanes) moves to Opus 5.5. Draft and classify have
    // no eval of their own yet and stay on the previous models until they do.
    var USE_NEXT = { reason: true, draft: false, classify: false };
    var PREVIOUS = { reason: 'claude-opus-4-8', draft: 'claude-sonnet-4-6', classify: 'claude-haiku-4-5-20251001' };
    var NEXT = { reason: 'claude-opus-5-5', draft: 'claude-sonnet-5-5', classify: 'claude-haiku-5-5' };
    // USD per million tokens (models overview, 15 Oct 2026; Haiku 5.5 "from" price) and the allowance weight
    // relative to Sonnet 4.6 ($3 / $15), the unit the Pro+ monthly allowance is counted in
    var PRICES = {
        'claude-fable-5-1':  { input: 10.00, output: 50.00 },
        'claude-opus-5-5':   { input: 4.00,  output: 20.00 },
        'claude-sonnet-5-5': { input: 2.00,  output: 10.00 },
        'claude-haiku-5-5':  { input: 0.10,  output: 0.50 }
    };
    var WEIGHTS = { 'claude-fable-5-1': 3.33, 'claude-opus-5-5': 1.33, 'claude-sonnet-5-5': 0.67, 'claude-haiku-5-5': 0.033 };
    var LABELS = {
        'claude-fable-5-1': 'Claude Fable 5.1', 'claude-opus-5-5': 'Claude Opus 5.5', 'claude-sonnet-5-5': 'Claude Sonnet 5.5', 'claude-haiku-5-5': 'Claude Haiku 5.5'
    };
    // the explicit effort per kind of work: JSON-producing lanes are pinned (as deterministic as the API allows: no
    // sampling parameters exist on these models, so the effort level is the one control we fix and record)
    var EFFORT = { classify: 'low', json: 'medium', chat: 'medium', reason: 'medium', draft: 'medium' };
    var MAX_TOKENS_FLOOR = 16000;   // thinking counts against max_tokens on these models
    var MODEL_MAX_OUTPUT = 128000;

    function gen5(model) {
        var m = String(model || '').toLowerCase();
        if (/claude-(fable|mythos)\b/.test(m)) return true;
        var f = m.match(/claude-(opus|sonnet|haiku)-(\d+)(?:-(\d+))?/);
        return !!(f && +f[2] >= 5);
    }
    // older families: Opus 4.7+ and Sonnet 4.6+ reject temperature (observed); Haiku 4.5 and earlier accept it
    function acceptsTemperature(model) {
        var m = String(model || '');
        if (gen5(m)) return false;
        var om = m.match(/opus-(\d+)-(\d+)/i); if (om) { var a = +om[1], b = +om[2]; if (a > 4 || (a === 4 && b >= 7)) return false; }
        var sm = m.match(/sonnet-(\d+)-(\d+)/i); if (sm) { var c = +sm[1], d = +sm[2]; if (c > 4 || (c === 4 && d >= 6)) return false; }
        return true;
    }
    function defaultModel(role) { var r = PREVIOUS[role] ? role : 'reason'; return (USE_NEXT[r] ? NEXT : PREVIOUS)[r]; }
    function effortFor(feature) {
        var f = String(feature || '');
        if (/classif|triage|extract/i.test(f)) return EFFORT.classify;
        if (/^chat/i.test(f)) return EFFORT.chat;
        return EFFORT.json;
    }
    // shape(body, model, opts): applies the model generation's rules to a Messages body in place and
    // returns what was done, for the audit record. opts: { temperature, effort, feature }
    function shape(body, model, opts) {
        opts = opts || {};
        var out = { gen5: gen5(model), temperatureAsked: (typeof opts.temperature === 'number') ? opts.temperature : null, temperatureApplied: false, effort: null, maxTokens: body.max_tokens };
        delete body.top_p; delete body.top_k; delete body.thinking;
        if (out.gen5) {
            delete body.temperature;
            out.effort = opts.effort || effortFor(opts.feature);
            body.output_config = Object.assign({}, body.output_config || {}, { effort: out.effort });
            body.max_tokens = Math.min(MODEL_MAX_OUTPUT, Math.max(body.max_tokens || 0, MAX_TOKENS_FLOOR));
            out.maxTokens = body.max_tokens;
            // no prefilled assistant turn as the last message on these models
            if (Array.isArray(body.messages) && body.messages.length && body.messages[body.messages.length - 1].role === 'assistant') out.prefillRefused = true;
        } else if (out.temperatureAsked != null && acceptsTemperature(model)) { body.temperature = out.temperatureAsked; out.temperatureApplied = true; }
        return out;
    }
    var api = { USE_NEXT: USE_NEXT, PREVIOUS: PREVIOUS, NEXT: NEXT, PRICES: PRICES, WEIGHTS: WEIGHTS, LABELS: LABELS, EFFORT: EFFORT, MAX_TOKENS_FLOOR: MAX_TOKENS_FLOOR,
                gen5: gen5, acceptsTemperature: acceptsTemperature, defaultModel: defaultModel, effortFor: effortFor, shape: shape };
    try { root.SLAiRequest = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
