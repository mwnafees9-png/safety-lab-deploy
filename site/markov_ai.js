/* markov_ai.js v1.0 (6 Nov 2026): the AI drafts a Markov model (ARP4761A App I) for one system.
 *
 * Waqas (6 Nov 2026): "I want safety lab AI generated for every 4761 artifact". The Markov page had no AI at all.
 *
 * What the AI does, and what it never does:
 *   - It proposes the STRUCTURE: the states a system passes through (operational, degraded, failed), the failures
 *     and repairs that move it between them, and the starting state, from the system's items, its failure
 *     conditions and the failure data the project already holds.
 *   - It writes NO number. Each transition names the project's own rate sources (a fault-tree basic event's λ or
 *     μ, an FMEA row's λ) by reference; the rate is the SUM of the referenced sources, worked out here. A failure
 *     out of a state where three independent channels can each fail lists all three: λA + λB + λC.
 *   - A transition with no recorded rate is kept with rate 0 (the page shows "λ = ?") and flagged for the engineer.
 *     A reference to a source that does not exist is dropped from the sum and flagged. Nothing is guessed.
 * The draft opens in a review panel (states, transitions with where each rate came from, the solver's checks,
 * the AI's assumptions); nothing is written until Accept, which adds the model with its provenance.
 * AI-facing text (SYSTEM) is eval-gated (WORKING_RULES rule 29): skill markov.draft v1.
 * Entry points: the "Draft a Markov model" launcher action (ai_assistant.js), which the lane bar puts on the
 * Markov Models page. Tests: tests/regression_markov_ai_20261106.test.js. */
(function (root) {
    'use strict';
    var VERSION = '1.0', SKILL = 'markov.draft', SKILL_VERSION = 1, MAX_TOKENS = 3000;
    function S(v) { return String(v == null ? '' : v); }
    function num(v) { var n = parseFloat(v); return isFinite(n) && n > 0 ? n : null; }
    function E(s) { return S(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    // the app's stores are top-level bindings of its scripts (not window properties), and the CSP forbids eval: read
    // them through the SLEnv bridge (sl_env.js), as every module does
    function g(name) { try { var E = root.SLEnv; if (E && typeof E.get === 'function') { var v = E.get(name); if (v !== undefined) return v; } } catch (_) {} try { return root[name]; } catch (_) { return undefined; } }
    function fmt(v) { var n = Number(v); if (!isFinite(n) || n === 0) return '?'; return n.toExponential(2).replace('.00e', 'e'); }

    // ---- the system and the systems under it ------------------------------------------------------------------
    function systems() { return (g('systemsData') || []).filter(function (s) { return s && s.id; }); }
    function family(sid) {
        var all = systems(), ids = [sid], grew = true;
        while (grew) { grew = false; all.forEach(function (s) { if (s.parentId && ids.indexOf(s.parentId) >= 0 && ids.indexOf(s.id) < 0) { ids.push(s.id); grew = true; } }); }
        // and the systems that own the items its fault trees' basic events are realized by (an installation such as
        // the hydraulic power system and its systems A, B and C)
        var owner = {}; (g('itemsData') || []).forEach(function (it) { if (it && it.owningSystemId) owner[it.internalId] = it.owningSystemId; });
        (g('ftaPages') || []).forEach(function (p) {
            if (!p || !p.root || ids.indexOf(p.systemId) < 0) return;
            var seen = new Set();
            (function walk(n) { if (!n || seen.has(n)) return; seen.add(n); var o = owner[n.realizedByItemId]; if (o && ids.indexOf(o) < 0 && all.some(function (s) { return s.id === o; })) ids.push(o); (n.children || []).forEach(walk); })(p.root);
        });
        return ids;
    }

    // ---- the rate sources the project holds for a system ------------------------------------------------------
    // { ref, kind: 'basic event' | 'FMEA', name, lambda, mu, item, where }
    function sources(sid) {
        var fam = family(sid), out = [], seen = {}, items = {};
        (g('itemsData') || []).forEach(function (it) { if (it) items[it.internalId] = it; });
        (g('ftaPages') || []).forEach(function (p) {
            if (!p || !p.root || fam.indexOf(p.systemId) < 0) return;
            var visited = new Set();
            (function walk(n) {
                if (!n || visited.has(n)) return; visited.add(n);
                if (n.type !== 'gate') {
                    var lam = num(n.lambda), mu = n.repairModel === 'continuous' ? num(n.mu) : null;
                    var ref = S(n.displayId || ('BE-' + n.id));
                    if ((lam || mu) && !seen[ref]) {
                        seen[ref] = 1; var it = items[n.realizedByItemId];
                        out.push({ ref: ref, kind: 'basic event', name: S(n.name || n.label), lambda: lam, mu: mu, item: it ? S(it.itemId) + ' ' + S(it.name) : '', where: S(p.name) });
                    }
                }
                (n.children || []).forEach(walk);
            })(p.root);
        });
        (g('fmeaData') || []).forEach(function (r) {
            if (!r) return;
            var owners = [r.owningSystemId].concat(r.owningSystemIds || []).filter(Boolean);
            if (!owners.some(function (o) { return fam.indexOf(o) >= 0; })) return;
            var lam = num(r.lambda) || num(r.failureRate) || num(r.rate) || num(r.modeLambda);
            var ref = S(r.fmeaId || ('FMEA-' + r.internalId));
            if (lam && !seen[ref]) { seen[ref] = 1; out.push({ ref: ref, kind: 'FMEA', name: S(r.partName || r.component || r.funcMode || '') + (r.failureMode ? ': ' + r.failureMode : ''), lambda: lam, mu: null, item: S(r.itemId || ''), where: 'FMEA' }); }
        });
        return out;
    }

    // ---- what the AI sees ------------------------------------------------------------------------------------
    function context(sid) {
        var sys = systems().filter(function (s) { return s.id === sid; })[0];
        if (!sys) return null;
        var fam = family(sid);
        var subs = systems().filter(function (s) { return fam.indexOf(s.id) >= 0 && s.id !== sid; }).map(function (s) { return { id: s.id, name: s.name }; });
        var fcs = [];
        systems().forEach(function (s) { if (fam.indexOf(s.id) >= 0) (s.fha || []).forEach(function (f) { if (f) fcs.push({ id: S(f.fcId || f.id), description: S(f.fcDesc || f.failureCondition || f.description || f.name), severity: S(f.severity || f.classification), phases: Array.isArray(f.phases) ? f.phases.join(', ') : S(f.phases || f.phase || '') }); }); });
        var items = (g('itemsData') || []).filter(function (it) { return it && fam.indexOf(it.owningSystemId) >= 0; }).map(function (it) { return { id: S(it.itemId), name: S(it.name), type: S(it.type), note: S(it.description) }; });
        var src = sources(sid).map(function (x) { return { ref: x.ref, kind: x.kind, name: x.name, item: x.item, in: x.where, has_failure_rate: !!x.lambda, has_repair_rate: !!x.mu }; });
        var models = ((g('projectConfig') || {}).markovModels || []).map(function (m) { return S(m.name); });
        return { system: { id: sys.id, name: S(sys.name) }, subsystems: subs, functions: (sys.functions || []).map(function (f) { return S(f.funcName || f.name || f.description || f.funcId); }).filter(Boolean),
            failure_conditions: fcs, items: items, rate_sources: src, existing_markov_models: models };
    }

    var SYSTEM = [
        'You draft a Markov model (ARP4761A Appendix I, IEC 61165 state-transition notation) for ONE aircraft system, for a safety engineer to review.',
        'A Markov model earns its place where a fault tree cannot say what matters: repair or restoration (in flight or between flights), degraded states that still work, the order of failures, or shared load. Model the redundancy the items and failure conditions show. Keep it small and readable: usually 3 to 8 states.',
        'STATES: each has a short plain name that says what is working (for example "Two of three systems working"), a type (operational, degraded or failed) and a one-line meaning. At least one state is failed, and it is the failure condition the model supports. Name that failure condition by its id in "supports".',
        'TRANSITIONS: kind "failure" (λ) or "repair" (μ). No transition from a state into itself. Every failed state is reachable from the start.',
        'RATES: you write NO numbers anywhere. A transition names the rate sources that cause it, by their "ref" from rate_sources, in "rate_from". The rate is the sum of the sources listed. List the sources of the items that can fail OUT OF THE FROM STATE, and only those: the items still working there. Where a state groups identical items without saying which have failed ("two of three systems working"), list as many of the identical sources as items still working (two of the three), not all of them. A failure lists sources that have a failure rate; a repair lists sources that have a repair rate. Where no source has the rate a transition needs, leave "rate_from" empty and say in "why" what rate is missing: the engineer supplies it. Never invent a ref.',
        'Add a repair transition only where the project or the item descriptions show the system can be restored (a reset, a backup brought on line, repair between flights). Otherwise do not model repair, and say so in assumptions.',
        'Use only the systems, items, failure conditions and sources given. Write in plain American English. No placeholders, no "TBD", no square brackets.',
        'Reply with JSON only, no markdown fence:',
        '{"name": "...", "supports": "<failure condition id>", "states": [{"name": "...", "type": "operational|degraded|failed", "meaning": "..."}], "start": "<state name>",',
        ' "transitions": [{"from": "...", "to": "...", "kind": "failure|repair", "rate_from": ["<ref>", ...], "why": "..."}],',
        ' "narrative": "2 to 4 sentences: what the model represents and why a Markov model is used for it, no numbers",',
        ' "assumptions": ["each assumption the model rests on, one line each"]}'
    ].join('\n');

    // the reply as JSON; a stray brace that closes the object before a top-level key (seen live 6 Nov 2026 on the
    // propulsion system) is repaired, anything else unreadable is null
    function parse(text) {
        var t = S(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
        var a = t.indexOf('{'), b = t.lastIndexOf('}');
        if (a < 0 || b <= a) return null;
        var body = t.slice(a, b + 1);
        try { return JSON.parse(body); } catch (_) {}
        var fixed = body.replace(/"\s*\}\s*,\s*"(name|supports|states|start|transitions|narrative|assumptions)"\s*:/g, '", "$1":');
        try { return JSON.parse(fixed); } catch (_) { return null; }
    }

    // ---- the draft as a model the page and the solver read ----------------------------------------------------
    var NUM_RE = /\b\d+(\.\d+)?\s*[eE]\s*[-+]?\d+\b|\b\d+(\.\d+)?\s*(per (flight )?hour|\/\s*h(ou)?r?\b|fh\b)/;
    function build(j, sid, meta) {
        meta = meta || {};
        var issues = [], src = {}, list = meta.sources || sources(sid);   // the sources the AI was shown
        list.forEach(function (x) { src[x.ref.toUpperCase()] = x; });
        if (!j || !Array.isArray(j.states) || !Array.isArray(j.transitions)) return { model: null, issues: ['The AI did not return a model the app can read.'] };
        var states = [], names = {};
        j.states.forEach(function (s, i) {
            var nm = S(s && s.name).trim(); if (!nm) { issues.push('State ' + (i + 1) + ' has no name and was left out.'); return; }
            if (names[nm]) { issues.push('State "' + nm + '" appears twice; the second was left out.'); return; }
            names[nm] = 1; var ty = S(s.type).toLowerCase();
            var st = { id: 'st-ai-' + i, name: nm, isFailed: ty === 'failed', meaning: S(s.meaning).trim() };
            if (ty === 'degraded') st.degraded = true;
            states.push(st);
        });
        var trs = [];
        j.transitions.forEach(function (t, i) {
            var from = S(t && t.from).trim(), to = S(t && t.to).trim(), kind = S(t && t.kind).toLowerCase() === 'repair' ? 'repair' : 'failure';
            if (!names[from] || !names[to]) { issues.push('A transition from "' + from + '" to "' + to + '" names a state that is not in the model and was left out.'); return; }
            if (from === to) { issues.push('A transition from "' + from + '" into itself was left out.'); return; }
            var refs = [], rate = 0, missing = [], wrong = [];
            (Array.isArray(t.rate_from) ? t.rate_from : []).forEach(function (r) {
                var key = S(r).trim().toUpperCase(); if (!key || refs.indexOf(key) >= 0) return;
                var x = src[key];
                if (!x) { missing.push(S(r)); return; }
                var v = kind === 'repair' ? x.mu : x.lambda;
                if (!v) { wrong.push(x.ref); return; }
                refs.push(x.ref); rate += v;
            });
            if (missing.length) issues.push('"' + from + '" to "' + to + '": ' + missing.join(', ') + ' ' + (missing.length > 1 ? 'are' : 'is') + ' not a rate source of this system and ' + (missing.length > 1 ? 'were' : 'was') + ' left out of the rate.');
            if (wrong.length) issues.push('"' + from + '" to "' + to + '": ' + wrong.join(', ') + ' ' + (wrong.length > 1 ? 'have' : 'has') + ' no recorded ' + (kind === 'repair' ? 'repair' : 'failure') + ' rate, so ' + (wrong.length > 1 ? 'they add' : 'it adds') + ' nothing.');
            if (!refs.length) issues.push('"' + from + '" to "' + to + '" (' + (kind === 'repair' ? 'repair, μ' : 'failure, λ') + ') has no recorded rate: the engineer gives it before the model is solved.' + (t.why ? ' The AI says: ' + S(t.why).trim() : ''));
            trs.push({ id: 'tr-ai-' + i, from: from, to: to, kind: kind, rate: rate ? +rate.toPrecision(6) : 0, rateFrom: refs, why: S(t.why).trim() });
        });
        // the same items cannot fail out of two different states of one chain: an item lost on the way is no longer working
        var bySet = {};
        trs.forEach(function (t) { if (t.kind !== 'failure' || t.rateFrom.length < 2) return; var k = t.rateFrom.slice().sort().join('+'); (bySet[k] = bySet[k] || []).push(t.from); });
        Object.keys(bySet).forEach(function (k) { var fr = bySet[k].filter(function (x, i, a) { return a.indexOf(x) === i; }); if (fr.length > 1) issues.push('The same ' + k.split('+').length + ' rate sources (' + k.split('+').join(', ') + ') leave ' + fr.length + ' different states (' + fr.map(function (x) { return '"' + x + '"'; }).join(', ') + '): out of a state with fewer items working, fewer of them can fail. Check each rate counts only the items still working.'); });
        if (!states.some(function (s) { return s.isFailed; })) issues.push('No state is marked failed, so the model cannot give a probability of failure.');
        var start = names[S(j.start).trim()] ? S(j.start).trim() : (states[0] && states[0].name);
        if (S(j.start).trim() && !names[S(j.start).trim()]) issues.push('The starting state "' + S(j.start) + '" is not in the model; the first state is used.');
        // every failed state reachable from the start
        var reach = {}, q = [start]; reach[start] = 1;
        while (q.length) { var nm = q.shift(); trs.forEach(function (t) { if (t.from === nm && !reach[t.to]) { reach[t.to] = 1; q.push(t.to); } }); }
        states.filter(function (s) { return s.isFailed && !reach[s.name]; }).forEach(function (s) { issues.push('The failed state "' + s.name + '" cannot be reached from the start.'); });
        var narrative = S(j.narrative).trim();
        if (NUM_RE.test(narrative)) issues.push('The AI wrote a rate in its description; the rates in the model come from the project, check the description against them.');
        var guardFn = root.SLReportAI && root.SLReportAI.guard;
        if (guardFn) { try { guardFn(narrative, {}).forEach(function (f) { issues.push('Description: ' + S(f.why || f.text || f)); }); } catch (_) {} }
        var sys = systems().filter(function (s) { return s.id === sid; })[0] || {};
        var model = {
            id: 'mkv-ai-' + Date.now().toString(36), name: S(j.name).trim() || ('Markov model of the ' + S(sys.name)),
            states: states, transitions: trs, initialState: start, forSystemId: sid, supports: S(j.supports).trim(), description: narrative,
            assumptions: (Array.isArray(j.assumptions) ? j.assumptions : []).map(S).map(function (a) { return a.trim(); }).filter(Boolean),
            aiGenerated: true, aiFeature: SKILL, aiSkill: SKILL + ' v' + SKILL_VERSION, aiModel: meta.model || null, aiAt: new Date().toISOString()
        };
        return { model: model, issues: issues, sources: list };
    }

    // the solver's checks of the drafted model (rates still to be given are not counted twice)
    function checks(model) {
        var v = root.validateMarkovModel || (root.MARKOV_CTMC && root.MARKOV_CTMC.validateMarkovModel);
        if (typeof v !== 'function' || !model) return [];
        var r = v(model);
        return r.errors.filter(function (e) { return !/rate 0 is not a positive/.test(e); }).concat(r.warnings);
    }

    function request(sid) {
        var ctx = context(sid); if (!ctx) return null;
        return { feature: SKILL, system: SYSTEM, messages: [{ role: 'user', content: 'Draft a Markov model for this system. Project data:\n' + JSON.stringify(ctx, null, 1) }], maxTokens: MAX_TOKENS, ctx: ctx };
    }
    async function draft(sid) {
        var P = root.SafetyLabAI; if (!(P && typeof P.complete === 'function')) throw new Error('The AI assistant is not available.');
        var req = request(sid); if (!req) throw new Error('No system "' + sid + '".');
        if (!req.ctx.rate_sources.length && !req.ctx.items.length) throw new Error('The ' + req.ctx.system.name + ' has no items and no failure data yet: add its items, its fault trees or its FMEA first.');
        var shown = sources(sid);   // what the AI is shown is what its refs are resolved against, whatever changes during the call
        var r = await P.complete({ feature: req.feature, system: req.system, messages: req.messages, maxTokens: req.maxTokens });
        var j = parse(r && r.text);
        if (!j) {   // one more turn when the reply is not readable JSON
            r = await P.complete({ feature: req.feature, system: req.system, messages: req.messages.concat([{ role: 'assistant', content: S(r && r.text) }, { role: 'user', content: 'That reply is not valid JSON. Send the same model again as one valid JSON object only, nothing else.' }]), maxTokens: req.maxTokens });
            j = parse(r && r.text);
        }
        var b = build(j, sid, { model: r && r.model, sources: shown });
        if (b.model) b.checks = checks(b.model);
        try { if (root.AiFidelity && root.AiFidelity.recordProvenance) root.AiFidelity.recordProvenance({ kind: 'draft', feature: SKILL, skill: SKILL + ' v' + SKILL_VERSION, section: sid, model: (r && r.model) || '', flags: b.issues.length }); } catch (_) {}
        return b;
    }

    function accept(b, edited) {
        if (!b || !b.model) return null;
        var pc = g('projectConfig'); if (!pc) return null;
        var m = JSON.parse(JSON.stringify(b.model));
        if (edited) { m.humanEdited = true; m.humanEditedAt = new Date().toISOString(); }
        try { if (root.SLTreeHomes && root.SLTreeHomes.stamp) root.SLTreeHomes.stamp(m); } catch (_) {}
        (pc.markovModels = pc.markovModels || []).push(m);
        try { if (root.AiFidelity && root.AiFidelity.recordProvenance) root.AiFidelity.recordProvenance({ kind: 'accept', feature: SKILL, skill: SKILL + ' v' + SKILL_VERSION, section: m.id, model: m.aiModel || '', flags: (b.issues || []).length }); } catch (_) {}
        try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {}
        try { if (typeof root.renderMarkovModels === 'function') root.renderMarkovModels(); } catch (_) {}
        return m;
    }

    // ---- the review panel ------------------------------------------------------------------------------------
    var _last = null;
    function panelHtml(b) {
        var m = b.model, srcBy = {};
        (b.sources || []).forEach(function (x) { srcBy[x.ref] = x; });
        var ty = function (s) { return s.isFailed ? 'Failed' : (s.degraded ? 'Degraded' : 'Operational'); };
        var h = '<div class="mkai-head"><h3>AI-drafted Markov model · review</h3><button type="button" data-mkai="close">Close</button></div>' +
            '<div class="mkai-note">Nothing is added until you Accept. The AI chose the states and transitions; every rate below is the sum of the project\'s own recorded rates it names. A rate shown as ? has no recorded source: give it on the Markov page after you accept.</div>' +
            '<div class="mkai-body"><label class="mkai-l">Name <input type="text" data-mkai="name" value="' + E(m.name) + '"></label>' +
            (m.supports ? '<p class="mkai-m">Supports failure condition ' + E(m.supports) + '.</p>' : '') +
            (m.description ? '<p>' + E(m.description) + '</p>' : '') +
            '<h4>States</h4><table class="mkai-t"><tr><th>State</th><th>Type</th><th>Meaning</th></tr>' + m.states.map(function (s) { return '<tr><td>' + E(s.name) + (s.name === m.initialState ? ' <b>(start)</b>' : '') + '</td><td>' + ty(s) + '</td><td>' + E(s.meaning) + '</td></tr>'; }).join('') + '</table>' +
            '<h4>Transitions</h4><table class="mkai-t"><tr><th>From</th><th>To</th><th>Kind</th><th>Rate per hour</th><th>Where the rate comes from</th></tr>' + m.transitions.map(function (t) {
                return '<tr><td>' + E(t.from) + '</td><td>' + E(t.to) + '</td><td>' + (t.kind === 'repair' ? 'Repair (μ)' : 'Failure (λ)') + '</td><td class="mkai-n' + (t.rate ? '' : ' mkai-open') + '">' + fmt(t.rate) + '</td><td>' +
                    (t.rateFrom.length ? t.rateFrom.map(function (r) { var x = srcBy[r] || {}; return E(r + ' ' + (x.name || '')) + ' (' + fmt(t.kind === 'repair' ? x.mu : x.lambda) + ')'; }).join(' + ') : '<i>no recorded rate</i>') + (t.why ? '<div class="mkai-m">' + E(t.why) + '</div>' : '') + '</td></tr>';
            }).join('') + '</table>' +
            ((b.issues.length || (b.checks || []).length) ? '<h4>For the engineer</h4><ul class="mkai-i">' + b.issues.concat(b.checks || []).map(function (x) { return '<li>' + E(x) + '</li>'; }).join('') + '</ul>' : '<p class="mkai-m">No open points: every rate came from the project and the solver accepts the model.</p>') +
            (m.assumptions.length ? '<h4>Assumptions the AI made</h4><ul>' + m.assumptions.map(function (a) { return '<li>' + E(a) + '</li>'; }).join('') + '</ul>' : '') +
            '</div><div class="mkai-foot"><button type="button" data-mkai="discard">Discard</button><button type="button" class="mkai-p" data-mkai="accept">Accept and add to the Markov models</button></div>';
        return h;
    }
    var CSS = '#mkai-panel{position:fixed;right:16px;top:64px;bottom:16px;width:min(760px,calc(100vw - 32px));z-index:10050;background:var(--bg-primary,#fff);color:var(--text-primary,#101216);border:1px solid var(--border-primary,#d0d5dd);border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.25);display:flex;flex-direction:column;font-size:13px}' +
        '#mkai-panel .mkai-head,#mkai-panel .mkai-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--border-primary,#d0d5dd)}#mkai-panel .mkai-foot{border-bottom:0;border-top:1px solid var(--border-primary,#d0d5dd);justify-content:flex-end}' +
        '#mkai-panel h3{margin:0;font-size:15px}#mkai-panel h4{margin:14px 0 6px;font-size:13px}#mkai-panel .mkai-body{overflow:auto;padding:10px 14px;flex:1}#mkai-panel .mkai-note{padding:8px 14px;background:rgba(26,110,242,.08);font-size:12px}' +
        '#mkai-panel .mkai-t{border-collapse:collapse;width:100%}#mkai-panel .mkai-t th,#mkai-panel .mkai-t td{border:1px solid var(--border-primary,#d0d5dd);padding:4px 6px;text-align:left;vertical-align:top}#mkai-panel .mkai-n{font-family:monospace;white-space:nowrap}' +
        '#mkai-panel .mkai-open{color:#b42318;font-weight:600}#mkai-panel .mkai-m{color:var(--text-secondary,#5b6270);font-size:12px;margin:2px 0}#mkai-panel .mkai-i li{color:#b54708}#mkai-panel .mkai-l input{width:100%;margin-top:4px}' +
        '#mkai-panel button{padding:6px 12px;border-radius:6px;border:1px solid var(--border-primary,#d0d5dd);background:transparent;color:inherit;cursor:pointer}#mkai-panel .mkai-p{background:#1A6EF2;color:#fff;border-color:#1A6EF2}';
    function close() { var p = typeof document !== 'undefined' && document.getElementById('mkai-panel'); if (p) p.remove(); }
    function show(b) {
        _last = b; close();
        if (!document.getElementById('mkai-style')) { var st = document.createElement('style'); st.id = 'mkai-style'; st.textContent = CSS; document.head.appendChild(st); }
        var p = document.createElement('div'); p.id = 'mkai-panel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'AI-drafted Markov model'); p.innerHTML = panelHtml(b);
        document.body.appendChild(p);
        p.addEventListener('click', function (ev) {
            var a = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-mkai');
            if (a === 'close' || a === 'discard') { close(); try { if (a === 'discard' && root.AiFidelity) root.AiFidelity.recordProvenance({ kind: 'reject', feature: SKILL, section: b.model.id }); } catch (_) {} }
            if (a === 'accept') {
                var nmEl = p.querySelector('[data-mkai="name"]'), nm = nmEl ? S(nmEl.value).trim() : '', edited = !!(nm && nm !== b.model.name);
                if (nm) b.model.name = nm;
                var m = accept(b, edited); close();
                try { if (typeof root.showToast === 'function') root.showToast('Markov model "' + m.name + '" added (AI-drafted, provenance logged).' + (b.issues.length ? ' ' + b.issues.length + ' point' + (b.issues.length > 1 ? 's' : '') + ' left for you on the Markov page.' : ''), 'success', 5000); } catch (_) {}
            }
        });
    }
    // which system: the scope a button passes, else a choice of the systems with failure data
    async function open(scope) {
        var sid = scope && scope.systemId;
        if (!sid) {
            var list = systems().map(function (s) { return { s: s, n: sources(s.id).length }; }).filter(function (x) { return x.n; });
            if (!list.length) throw new Error('No system has recorded failure rates yet: build its fault trees or its FMEA first.');
            var pick = typeof root.slPrompt === 'function' ? await root.slPrompt('Draft a Markov model for which system? Type its number:\n' + list.map(function (x, i) { return (i + 1) + '. ' + x.s.name + ' (' + x.n + ' rate source' + (x.n > 1 ? 's' : '') + ')'; }).join('\n'), '1') : '1';
            var k = parseInt(pick, 10); if (!(k >= 1 && k <= list.length)) return null;
            sid = list[k - 1].s.id;
        }
        try { if (typeof root.showToast === 'function') root.showToast('Drafting a Markov model with the AI…', 'info', 3000); } catch (_) {}
        var b = await draft(sid);
        if (!b.model) { try { root.showToast(b.issues[0], 'warning', 5000); } catch (_) {} return b; }
        show(b); return b;
    }

    var api = { VERSION: VERSION, SKILL: SKILL, SKILL_VERSION: SKILL_VERSION, SYSTEM: SYSTEM, family: family, sources: sources, context: context, parse: parse, build: build, checks: checks, request: request, draft: draft, accept: accept, panelHtml: panelHtml, show: show, open: open, last: function () { return _last; } };
    try { root.SLMarkovAI = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
