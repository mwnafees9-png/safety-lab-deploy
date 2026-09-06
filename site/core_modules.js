// core_modules.js — ReqHistory / AiClient / SaveFs, extracted verbatim from safety_lab.js
// (Phase 76). Classic script, shared global scope, loaded BEFORE safety_lab.js. Self-
// contained at definition; monolith globals referenced inside methods at runtime. Byte-identical.

const ReqHistory = (function(){
    // Fields whose changes we surface in the diff. Other fields (reqSource,
    // compromised, archivedAt etc.) are bookkeeping and don't go in the diff.
    const TRACKED_FIELDS = [
        'text','rat','level','type','traceId','traceIds',
        'validationMethod','validationStatus','validationEvidence',
        'verifMethod','verifStatus','verifEvidence',
        'status','deleted'
    ];

    function _actor() {
        try {
            if (typeof Review !== 'undefined' && Review && typeof Review.getReviewerName === 'function') {
                return Review.getReviewerName() || 'anonymous';
            }
        } catch(_) {}
        return 'anonymous';
    }
    function _normalize(v) {
        if (v == null) return null;
        if (Array.isArray(v)) return v.slice().map(x => x == null ? '' : String(x));
        return typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
    }
    function _equal(a, b) {
        if (a === b) return true;
        if (a == null && b == null) return true;
        if (a == null || b == null) return false;
        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) if (!_equal(a[i], b[i])) return false;
            return true;
        }
        if (typeof a === 'object' && typeof b === 'object') {
            try { return JSON.stringify(a) === JSON.stringify(b); } catch(_) { return false; }
        }
        return String(a) === String(b);
    }
    function diff(prev, next) {
        const out = {};
        prev = prev || {};
        next = next || {};
        TRACKED_FIELDS.forEach(f => {
            const a = _normalize(prev[f]);
            const b = _normalize(next[f]);
            if (!_equal(a, b)) out[f] = { from: a, to: b };
        });
        return out;
    }
    function record(req, action, prev, opts) {
        if (!req) return;
        if (!Array.isArray(req.history)) req.history = [];
        const entry = {
            ts: Date.now(),
            actor: (opts && opts.actor) || _actor(),
            action: action,
            note: (opts && opts.note) || ''
        };
        if (action === 'create' || action === 'auto-create') {
            // For create entries, snapshot the initial values of tracked fields.
            const snap = {};
            TRACKED_FIELDS.forEach(f => { if (req[f] != null) snap[f] = _normalize(req[f]); });
            entry.snapshot = snap;
        } else if (action === 'edit' || action === 'auto-update' || action === 'reconcile' || action === 'archive') {
            entry.changes = diff(prev, req);
            // Skip the entry entirely when nothing tracked actually changed.
            if (Object.keys(entry.changes).length === 0 && action !== 'archive') return;
        } else if (action === 'delete' || action === 'restore') {
            entry.changes = diff(prev || {}, req);
        }
        req.history.push(entry);
        // Hard cap to keep history bounded — keep the most recent 200 entries.
        if (req.history.length > 200) req.history.splice(0, req.history.length - 200);
    }
    function getHistory(req) {
        if (!req || !Array.isArray(req.history)) return [];
        return req.history.slice().reverse();   // newest first for display
    }
    // Soft-delete and restore. Stores expose mutate-in-place behavior;
    // delete here flips a flag rather than splicing the array.
    function softDelete(req) {
        if (!req || req.deleted) return false;
        const prev = JSON.parse(JSON.stringify(req));
        req.deleted = true;
        req.deletedAt = Date.now();
        record(req, 'delete', prev);
        return true;
    }
    function restore(req) {
        if (!req || !req.deleted) return false;
        const prev = JSON.parse(JSON.stringify(req));
        req.deleted = false;
        delete req.deletedAt;
        record(req, 'restore', prev);
        return true;
    }
    // Generator labels for entry display.
    const ACTION_LABELS = {
        'create':       'Created',
        'edit':         'Edited',
        'auto-create':  'Auto-generated',
        'auto-update':  'Auto-regenerated',
        'reconcile':    'Reconciled (AC↔Sys dedup)',
        'archive':      'Archived',
        'delete':       'Deleted',
        'restore':      'Restored'
    };
    const FIELD_LABELS = {
        'text':                'Statement',
        'rat':                 'Rationale',
        'level':               'Level',
        'type':                'Type',
        'traceId':             'Trace',
        'traceIds':            'Traces',
        'validationMethod':    'Validation method',
        'validationStatus':    'Validation status',
        'validationEvidence':  'Validation evidence',
        'verifMethod':         'Verification method',
        'verifStatus':         'Verification status',
        'verifEvidence':       'Verification evidence',
        'status':              'Status',
        'deleted':             'Deleted flag'
    };
    return { diff, record, getHistory, softDelete, restore, ACTION_LABELS, FIELD_LABELS, TRACKED_FIELDS };
})();
window.ReqHistory = ReqHistory;

const AiClient = (function(){
    function getAnthropicKey() { try { return localStorage.getItem(AI_LS_ANTHROPIC) || ''; } catch(_) { return ''; } }
    function getVoyageKey()    { try { return localStorage.getItem(AI_LS_VOYAGE)    || ''; } catch(_) { return ''; } }
    // Phase 53.66b — AI is available when EITHER the Pro+ hosted proxy is usable
    // (license token + Pro+ tier active) OR the user has pasted a BYO Anthropic key.
    function isProxyMode()     { return !!(typeof isProPlusLicensed === 'function' && isProPlusLicensed() && getLicenseToken()); }
    function isConfigured()    { return isProxyMode() || !!getAnthropicKey(); }
    function hasMemory()       { return isProxyMode() || !!getVoyageKey(); }

    // Token allowance tracker — measured in Sonnet-equivalent tokens / calendar month.
    function _currentMonth() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
    // Monthly allowance for the active license tier. Enterprise / owner licenses are
    // UNCAPPED (the proxy mirrors this on the license_tokens row); Pro+ keeps the
    // standard Sonnet-equivalent budget. Returns Infinity for the uncapped case.
    function _monthlyAllowance() {
        // AI usage is UNCAPPED by default — calls are never blocked on a monthly token
        // allowance. Usage is still tracked (below) for the usage/cost summary. A per-customer
        // ceiling, when a customer requests one, is applied via the optional session cost cap ($).
        // NOTE: the hosted proxy enforces its own allowance on the license_tokens row — to fully
        // uncap, that server-side allowance must also be set uncapped.
        return Infinity;
    }
    function _tokenUsage() {
        const allowance = _monthlyAllowance();
        if (!projectConfig) return { month: _currentMonth(), used: 0, allowance: allowance };
        if (!projectConfig.aiTokenUsage || projectConfig.aiTokenUsage.month !== _currentMonth()) {
            projectConfig.aiTokenUsage = { month: _currentMonth(), used: 0, allowance: allowance };
        }
        // Re-sync allowance to the current tier every read — tier can change after sign-in,
        // and Infinity must not be left frozen as a stale 2,000,000 from a prior session
        // (it also serializes to null in saved projects, so it's recomputed here on load).
        projectConfig.aiTokenUsage.allowance = allowance;
        return projectConfig.aiTokenUsage;
    }
    function getTokenUsage() { return _tokenUsage(); }
    function _consumeTokens(model, tokensIn, tokensOut) {
        if (!isProxyMode()) return;       // BYO key — user pays the provider directly; no allowance tracking
        const weight = MODEL_TOKEN_WEIGHTS[model] || 1.0;
        const weighted = ((tokensIn || 0) + (tokensOut || 0)) * weight;
        const u = _tokenUsage();
        u.used = (u.used || 0) + weighted;
    }
    function _allowanceRemaining() {
        const u = _tokenUsage();
        if (!isFinite(u.allowance)) return Infinity;   // enterprise / owner — uncapped
        return Math.max(0, (u.allowance || 0) - (u.used || 0));
    }

    function _settings(){
        const cfg = (projectConfig && projectConfig.aiSettings) || {};
        return {
            anthropicModel: cfg.anthropicModel || 'claude-opus-4-8',
            voyageModel:    cfg.voyageModel    || 'voyage-3-large',
            maxTokens:      cfg.maxTokens      || 4096,
            costCap:        (cfg.costCap != null ? cfg.costCap : 0),   // 0 = no cap (default); set per-customer to enforce
            topK:           cfg.topK           || 5
        };
    }

    function _addCost(model, tokensIn, tokensOut){
        const price = AI_PRICES_USD_PER_MTOK[model];
        if (!price) return 0;
        const cost = (tokensIn / 1e6) * price.input + (tokensOut / 1e6) * price.output;
        try {
            const cur = parseFloat(localStorage.getItem(AI_LS_COST) || '0');
            localStorage.setItem(AI_LS_COST, String(cur + cost));
        } catch(_) {}
        return cost;
    }

    function getSessionCost(){
        try { return parseFloat(localStorage.getItem(AI_LS_COST) || '0'); } catch(_) { return 0; }
    }
    function resetSessionCost(){
        try { localStorage.setItem(AI_LS_COST, '0'); } catch(_) {}
    }

    // Call Anthropic Messages API. opts = { system, messages, maxTokens?, model? }.
    // messages: [{role: 'user'|'assistant', content: string | [{type:'image', source:{...}}, {type:'text', text:'...'}]}].
    // Phase 53.66b — when the user has a Pro+ license, requests go through the
    // Safety Lab Aero proxy (which holds the real Anthropic / Azure keys). When the user
    // pasted a BYO key in Advanced settings, requests go direct to Anthropic. ITAR-
    // controlled projects always go via the proxy (which routes to Azure OpenAI in a
    // US-only private deployment); BYO mode is blocked for ITAR projects to avoid
    // accidentally sending controlled diagrams to public Anthropic.
    // Phase 66 — parse an Anthropic SSE stream into the SAME shape messages() used to
    // return when buffering (content[]/model/stop_reason/usage), so every caller that
    // reads r.content[0].text keeps working unchanged. Streaming is what lets long
    // Opus generations through the proxy without tripping Cloudflare's 524 timeout.
    async function _readAnthropicStream(response){
        const reader = response.body.getReader();
        const dec = new TextDecoder();
        let buf = '', text = '', model = '', stopReason = null, streamErr = null;
        const usage = { input_tokens: 0, output_tokens: 0 };
        const handle = function(raw){
            const line = raw.split('\n').find(function(l){ return l.indexOf('data:') === 0; });
            if (!line) return;
            const ds = line.slice(5).trim();
            if (!ds || ds === '[DONE]') return;
            let p; try { p = JSON.parse(ds); } catch(_) { return; }
            if (p.type === 'message_start' && p.message) {
                model = p.message.model || model;
                if (p.message.usage) {
                    usage.input_tokens  = p.message.usage.input_tokens  || usage.input_tokens;
                    usage.output_tokens = p.message.usage.output_tokens || usage.output_tokens;
                }
            } else if (p.type === 'content_block_delta' && p.delta && p.delta.type === 'text_delta') {
                text += p.delta.text || '';
            } else if (p.type === 'message_delta') {
                if (p.delta && p.delta.stop_reason) stopReason = p.delta.stop_reason;
                if (p.usage && p.usage.output_tokens != null) usage.output_tokens = p.usage.output_tokens;
            } else if (p.type === 'error') {
                streamErr = (p.error && p.error.message) || 'stream error';
            }
        };
        for (;;) {
            const r = await reader.read();
            if (r.done) break;
            buf += dec.decode(r.value, { stream: true });
            let idx;
            while ((idx = buf.indexOf('\n\n')) !== -1) {
                handle(buf.slice(0, idx));
                buf = buf.slice(idx + 2);
            }
        }
        if (buf.trim()) handle(buf);
        if (streamErr) throw new Error(streamErr);
        return { id: 'stream', type: 'message', role: 'assistant', model: model || null,
                 stop_reason: stopReason, content: [{ type: 'text', text: text }], usage: usage };
    }

    // Anthropic deprecated temperature/top_p/top_k on Opus 4.7+ (e.g. claude-opus-4-8): sending
    // them returns 400 "temperature is deprecated for this model". Omit (don't retune) for those;
    // Sonnet/Haiku and Opus ≤4.6 still accept a custom sampling temperature.
    //
    // CONSEQUENCE, established 5 Sep 2026 and worth stating here because it cost
    // three paid measurement runs: the DEFAULT analytical model is
    // claude-opus-4-8, so on the default configuration a requested temperature
    // is never sent. Any consistency work that leans on sampling temperature
    // must first change the model — and that is eval-gated — or it is leaning on
    // nothing. Callers can now see this per call: the audit record carries
    // temperatureAsked and temperatureApplied.
    function _modelAcceptsTemperature(model){
        var m = String(model || '');
        var om = m.match(/opus-(\d+)-(\d+)/i);
        if (om) { var maj = +om[1], min = +om[2]; if (maj > 4 || (maj === 4 && min >= 7)) return false; }
        return true;
    }
    // 6 Sep 2026 — THE controlled-data fence for every AI request that leaves the
    // browser. This function is the one place chat, drafts, batch, report prose, the
    // connection test and embeddings all pass through, so the rule lives here and
    // nowhere else. Waqas's rule: customer data never touches Safety Lab's cloud, at
    // any point — and that includes transiting the proxy on its way to Azure Gov.
    // So a project marked export-controlled, or any uploaded document marked
    // controlled, refuses outright. The only backends that may process controlled
    // data are the customer's own: Claude via their GovCloud, their Azure Government,
    // or an on-prem model — none of which come through here (Provider routes
    // 'local' straight to the endpoint). Fails CLOSED when the project
    // configuration cannot be read. Returns a reason string, or null when clear.
    function controlledRefusal(){
        try {
            let reason = null;
            if (typeof window !== 'undefined' && window.SLControlled && typeof window.SLControlled.blocksCloud === 'function') {
                reason = window.SLControlled.blocksCloud(null);
            } else if (typeof projectConfig !== 'undefined' && projectConfig) {
                reason = projectConfig.isITARControlled ? 'this project is marked export-controlled' : null;
            } else {
                reason = 'the project configuration could not be read';
            }
            if (!reason) {
                const api = (typeof window !== 'undefined') ? window.SafetyLabSourceDocs : null;
                const list = (api && typeof api.list === 'function') ? (api.list() || []) : [];
                const ctrl = list.filter(function(d){ return d && d.controlled; });
                if (ctrl.length) reason = 'a controlled document is on file (' + ctrl.map(function(d){ return d.name || 'document'; }).join(', ') + ')';
            }
            return reason;
        } catch (_) { return 'the project configuration could not be read'; }
    }
    function controlledRefusalMessage(reason){
        return 'AI is off because ' + reason + '. Controlled data can only run on your own Claude (GovCloud), Azure Government, or on-prem backend — choose one under AI Settings.';
    }
    // 6 Sep 2026 — no AI endpoint at all (browser-only install, or AI switched off): refuse
    // here, at the one choke point, in plain words. Never fall back to a Safety Lab address.
    function unconfiguredRefusal(){
        try { return AI_PROXY_BASE_URL ? null : 'AI is not set up on this install. Choose an AI backend under Settings (your own Claude, Azure, or on-prem endpoint).'; }
        catch (_) { return 'AI is not set up on this install.'; }
    }
    async function messages(opts){
        const s = _settings();
        const _cap = Number(s.costCap) || 0;   // 0 = uncapped (default); a per-customer cap is honored when set
        if (_cap > 0 && getSessionCost() >= _cap) throw new Error('Session cost cap ($' + _cap + ') reached. Raise or clear the cap in AI Settings, or reset the session.');
        const model = opts.model || s.anthropicModel;
        const _refused = controlledRefusal();
        if (_refused) throw new Error(controlledRefusalMessage(_refused));
        const _unset = unconfiguredRefusal();
        if (_unset) throw new Error(_unset);
        const itar = !!(projectConfig && projectConfig.isITARControlled);
        const proxy = isProxyMode();
        if (proxy && _allowanceRemaining() <= 0) {
            const u = _tokenUsage();
            throw new Error('Pro+ monthly token allowance exhausted (' + u.allowance.toLocaleString() + ' tokens, Sonnet-equivalent). Resets on the 1st of next month. Add a top-up at Settings → Billing, or fall back to BYO key.');
        }
        const body = {
            model: model,
            max_tokens: opts.maxTokens || s.maxTokens,
            messages: opts.messages || [],
            stream: true    // Phase 66 — stream SSE so long generations don't 524 at the proxy edge
        };
        // Sampling temperature — Provider sets this per feature (tiered: 0.0 eval/validators,
        // 0.2 analytical drafting, 0.3 ANEM chat). Default low for repeatability if unset.
        // Omitted entirely for models that deprecated it (Opus 4.7+) — see _modelAcceptsTemperature.
        // 5 Sep 2026 — this used to drop a caller's temperature SILENTLY. On
        // 5 Sep every analytical lane was switched to temperature 0 to make the
        // FHA repeatable, three identical-input draws were taken to measure the
        // effect, and only a code read that evening established that the default
        // drafting model is claude-opus-4-8, i.e. an Opus 4.7+ that does not
        // accept the parameter at all. The setting never reached the model and
        // nothing said so, so three paid draws were scored believing they
        // measured something they did not. Omitting the parameter is still
        // correct — sending it to these models returns 400 — but doing it
        // quietly is not. Record both the value asked for and whether it landed,
        // so a run's own audit trail answers the question.
        const _tempAsked = (typeof opts.temperature === 'number') ? opts.temperature : 0.2;
        const _tempApplied = _modelAcceptsTemperature(model);
        if (_tempApplied) body.temperature = _tempAsked;
        if (opts.system) body.system = opts.system;
        const startedAt = Date.now();
        // One request send (proxy or BYO). Extracted so we can retry cleanly.
        async function _send(b) {
            if (proxy) {
                // Route via Safety Lab Aero proxy. Proxy handles Anthropic vs Azure OpenAI
                // routing based on the isITAR flag we pass through.
                return fetch(AI_PROXY_BASE_URL + '/anthropic/messages', {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'authorization': 'Bearer ' + getLicenseToken(),
                        'x-safetylab-itar': itar ? '1' : '0',
                        'x-safetylab-feature': opts.feature || 'messages'
                    },
                    body: JSON.stringify(b)
                });
            }
            // BYO Anthropic key path.
            const key = getAnthropicKey();
            if (!key) throw new Error('No AI credentials configured. Either upgrade to Pro+ or paste a BYO Anthropic key in Advanced.');
            return fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-api-key': key,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify(b)
            });
        }
        let response, _preErr = null;   // _preErr: error already read off the first response (body is single-use)
        try {
            response = await _send(body);
            // Self-heal: newer models (Opus 4.7+ and reasoning/extended-thinking models)
            // reject `temperature` with a 400 "temperature is deprecated for this model".
            // _modelAcceptsTemperature already strips it for known ids; this catches the
            // case where an unrecognized model id (codename/date-suffix) slipped through —
            // retry ONCE without temperature so a chat turn never dies on a sampling param.
            if (!response.ok && body.temperature !== undefined) {
                let ej = {}; try { ej = await response.json(); } catch (_) {}
                const em = (ej.error && ej.error.message) || ('HTTP ' + response.status);
                if (response.status === 400 && /temperature/i.test(em)) {
                    delete body.temperature;
                    response = await _send(body);   // retry once, without the sampling param
                } else {
                    _preErr = em;   // real error — hand to the throw block below (body already consumed)
                }
            }
        } catch (e) {
            _logCall({ feature: opts.feature || 'messages', model, ok: false, error: String(e), startedAt, proxy, itar, temperatureAsked: _tempAsked, temperatureApplied: _tempApplied });
            throw e;
        }
        if (_preErr || !response.ok) {
            // Errors (401/402/503/5xx) come back as JSON even when we asked for a stream.
            let emsg = _preErr;
            if (!emsg) { let errJson = {}; try { errJson = await response.json(); } catch (_) {} emsg = (errJson.error && errJson.error.message) || ('HTTP ' + response.status); }
            _logCall({ feature: opts.feature || 'messages', model, ok: false, error: emsg, startedAt, proxy, itar, temperatureAsked: _tempAsked, temperatureApplied: _tempApplied });
            throw new Error(emsg);
        }
        // Phase 66 — assemble the SSE stream client-side (content-type text/event-stream).
        // Fall back to a buffered JSON body for any path that didn't stream (e.g. an
        // older proxy still buffering, or a future non-stream caller).
        const _ctype = (response.headers.get('content-type') || '');
        let json;
        if (_ctype.indexOf('text/event-stream') !== -1 && response.body && response.body.getReader) {
            json = await _readAnthropicStream(response);
        } else {
            json = await response.json();
        }
        const usage = json.usage || {};
        const incCost = _addCost(model, usage.input_tokens || 0, usage.output_tokens || 0);
        _consumeTokens(model, usage.input_tokens || 0, usage.output_tokens || 0);
        _logCall({ feature: opts.feature || 'messages', model, ok: true, tokensIn: usage.input_tokens, tokensOut: usage.output_tokens, cost: incCost, startedAt, proxy, itar, temperatureAsked: _tempAsked, temperatureApplied: _tempApplied });
        return json;
    }

    // Voyage embeddings — single text or batch. Same Pro+ proxy / BYO key routing as messages().
    async function embed(input, opts){
        opts = opts || {};
        const s = _settings();
        const model = opts.model || s.voyageModel;
        const inputArr = Array.isArray(input) ? input : [input];
        const proxy = isProxyMode();
        const _refusedEmb = controlledRefusal();
        if (_refusedEmb) throw new Error(controlledRefusalMessage(_refusedEmb));
        const _unsetEmb = unconfiguredRefusal();
        if (_unsetEmb) throw new Error(_unsetEmb);
        const itar = !!(projectConfig && projectConfig.isITARControlled);
        if (proxy && _allowanceRemaining() <= 0) {
            throw new Error('Pro+ monthly token allowance exhausted. Resets next month.');
        }
        const startedAt = Date.now();
        let response;
        try {
            if (proxy) {
                response = await fetch(AI_PROXY_BASE_URL + '/voyage/embeddings', {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'authorization': 'Bearer ' + getLicenseToken(),
                        'x-safetylab-itar': itar ? '1' : '0',
                        'x-safetylab-feature': 'embed'
                    },
                    body: JSON.stringify({ input: inputArr, model, input_type: opts.inputType || 'document' })
                });
            } else {
                const key = getVoyageKey();
                if (!key) throw new Error('No embedding credentials configured. Either upgrade to Pro+ or paste a BYO Voyage key in Advanced.');
                response = await fetch('https://api.voyageai.com/v1/embeddings', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + key },
                    body: JSON.stringify({ input: inputArr, model, input_type: opts.inputType || 'document' })
                });
            }
        } catch (e) {
            _logCall({ feature: 'embed', model, ok: false, error: String(e), startedAt, proxy, itar });
            throw e;
        }
        const json = await response.json();
        if (!response.ok) {
            _logCall({ feature: 'embed', model, ok: false, error: (json.detail || json.error || 'HTTP ' + response.status), startedAt, proxy, itar });
            throw new Error(json.detail || json.error || ('HTTP ' + response.status));
        }
        const tokensIn = (json.usage && json.usage.total_tokens) || 0;
        const incCost = _addCost(model, tokensIn, 0);
        _consumeTokens(model, tokensIn, 0);
        _logCall({ feature: 'embed', model, ok: true, tokensIn, tokensOut: 0, cost: incCost, startedAt, proxy, itar });
        return Array.isArray(input) ? json.data.map(d => d.embedding) : json.data[0].embedding;
    }

    // ----- Audit log (lives on projectConfig so it travels with the file) -----
    function _logCall(entry){
        if (!projectConfig) return;
        if (!Array.isArray(projectConfig.aiAuditLog)) projectConfig.aiAuditLog = [];
        const e = Object.assign({ ts: Date.now() }, entry);
        if (e.startedAt) { e.latencyMs = Date.now() - e.startedAt; delete e.startedAt; }
        projectConfig.aiAuditLog.push(e);
        // Keep most-recent 500 entries on the project; older purged.
        if (projectConfig.aiAuditLog.length > 500) projectConfig.aiAuditLog.splice(0, projectConfig.aiAuditLog.length - 500);
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch(_) {}
    }
    function getAuditLog(){ return (projectConfig && projectConfig.aiAuditLog) || []; }

    return { isConfigured, hasMemory, isProxyMode, getTokenUsage, getSessionCost, resetSessionCost, messages, embed, getAuditLog, controlledRefusal, controlledRefusalMessage, unconfiguredRefusal };
})();
window.AiClient = AiClient;

const SaveFs = (function() {
    const DB_NAME  = 'safetyLabSaveFs';
    const DB_STORE = 'handles';
    const KEY_DEFAULT_DIR = 'defaultDir';

    function _openDb() {
        return new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    async function _idbGet(key) {
        try {
            const db = await _openDb();
            return new Promise(resolve => {
                const tx = db.transaction(DB_STORE, 'readonly');
                const r = tx.objectStore(DB_STORE).get(key);
                r.onsuccess = () => resolve(r.result || null);
                r.onerror = () => resolve(null);
            });
        } catch (_) { return null; }
    }
    async function _idbPut(key, val) {
        try {
            const db = await _openDb();
            return new Promise(resolve => {
                const tx = db.transaction(DB_STORE, 'readwrite');
                tx.objectStore(DB_STORE).put(val, key);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            });
        } catch (_) { return false; }
    }
    async function _idbDel(key) {
        try {
            const db = await _openDb();
            return new Promise(resolve => {
                const tx = db.transaction(DB_STORE, 'readwrite');
                tx.objectStore(DB_STORE).delete(key);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            });
        } catch (_) { return false; }
    }

    function isSupported() {
        return typeof window !== 'undefined'
            && typeof window.showDirectoryPicker === 'function'
            && typeof window.showSaveFilePicker === 'function';
    }
    function isFileOrigin() {
        return typeof location !== 'undefined' && location.protocol === 'file:';
    }
    function unsupportedReason() {
        if (typeof window === 'undefined') return 'no window';
        if (isFileOrigin()) return 'Open this page via http(s) (or localhost) to enable folder picker — browsers block it on file:// for security.';
        if (typeof window.showDirectoryPicker !== 'function') return 'Your browser doesn\'t support the directory picker (try Chrome, Edge, or Brave).';
        return '';
    }

    async function getDefaultDirHandle(silent) {
        if (!isSupported()) return null;
        const h = await _idbGet(KEY_DEFAULT_DIR);
        if (!h) return null;
        // Permission may have lapsed since the handle was stored — re-request if needed.
        try {
            const opts = { mode: 'readwrite' };
            let perm = await h.queryPermission(opts);
            if (perm === 'granted') return h;
            if (!silent) {
                perm = await h.requestPermission(opts);
                if (perm === 'granted') return h;
            }
        } catch (_) {}
        return null;
    }

    async function getDefaultDirName() {
        const h = await _idbGet(KEY_DEFAULT_DIR);
        return (h && h.name) ? h.name : '';
    }

    async function chooseDefaultDir() {
        if (!isSupported()) {
            showToast(unsupportedReason() || 'Directory picker not available.', 'warning', 5000);
            return null;
        }
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            await _idbPut(KEY_DEFAULT_DIR, handle);
            try { localStorage.setItem('safetyLab.saveDir.name', handle.name || ''); } catch (_) {}   // #2Sep2026 synchronous hint so _requireSaveLocation skips re-prompt WITHOUT an await before the picker
            showToast('Save folder set: ' + handle.name, 'success', 3000);
            if (typeof _refreshSaveFolderMenu === 'function') _refreshSaveFolderMenu();
            return handle;
        } catch (e) {
            if (e && e.name === 'AbortError') return null;   // user canceled
            showToast('Could not set save folder: ' + (e && e.message || e), 'error', 4000);
            return null;
        }
    }

    async function clearDefaultDir() {
        await _idbDel(KEY_DEFAULT_DIR);
        try { localStorage.removeItem('safetyLab.saveDir.name'); } catch (_) {}   // #2Sep2026 clear the synchronous hint
        showToast('Save folder cleared. Files will download to the browser default.', 'info', 3000);
        if (typeof _refreshSaveFolderMenu === 'function') _refreshSaveFolderMenu();
    }

    // Universal save. Order of attempts:
    //   1. Write to the default dir if a handle exists and permission is granted.
    //   2. Show a save-file picker (one-shot) if File System Access is supported.
    //   3. Fall back to anchor.download (browser default Downloads/).
    //
    // suggestedName must include the extension. opts.skipPicker = true forces
    // anchor fallback (used by anything that should never prompt).
    async function saveBlob(blob, suggestedName, opts) {
        opts = opts || {};
        const fileTypes = opts.types || _typesForName(suggestedName);

        if (isSupported() && !opts.skipPicker) {
            // (1) Default directory
            try {
                const dir = await getDefaultDirHandle();
                if (dir) {
                    const fh = await dir.getFileHandle(suggestedName, { create: true });
                    const w = await fh.createWritable();
                    await w.write(blob);
                    await w.close();
                    showToast('Saved to ' + dir.name + '/' + suggestedName, 'success', 3000);
                    return { ok: true, mode: 'defaultDir', name: suggestedName };
                }
            } catch (e) {
                console.warn('Default dir write failed, will fall through:', e);
            }
            // (2) Save-file picker
            if (opts.allowPicker !== false) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName,
                        types: fileTypes
                    });
                    const w = await handle.createWritable();
                    await w.write(blob);
                    await w.close();
                    showToast('Saved: ' + handle.name, 'success', 3000);
                    return { ok: true, mode: 'picker', name: handle.name };
                } catch (e) {
                    if (e && e.name === 'AbortError') return { ok: false, mode: 'cancelled' };
                    console.warn('Picker write failed, will fall through:', e);
                }
            }
        }
        // (3) Anchor.download fallback
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = suggestedName;
        a.click();
        URL.revokeObjectURL(url);
        return { ok: true, mode: 'download', name: suggestedName };
    }

    // Lightweight MIME guess for showSaveFilePicker.types[].
    function _typesForName(name) {
        const ext = (name.split('.').pop() || '').toLowerCase();
        const map = {
            sl:   { description: 'Safety Lab project', accept: { 'application/json': ['.sl'] } },
            json: { description: 'JSON project', accept: { 'application/json': ['.json'] } },
            pdf:  { description: 'PDF',           accept: { 'application/pdf':  ['.pdf']  } },
            csv:  { description: 'CSV',           accept: { 'text/csv':         ['.csv']  } },
            xlsx: { description: 'Excel',         accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }
        };
        return map[ext] ? [map[ext]] : [];
    }

    return {
        isSupported, isFileOrigin, unsupportedReason,
        chooseDefaultDir, clearDefaultDir,
        getDefaultDirHandle, getDefaultDirName,
        saveBlob
    };
})();
window.SaveFs = SaveFs;
