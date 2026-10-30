#!/usr/bin/env python3
"""30 Oct 2026 — system functions, system FCIM and SFHA get a human interface for AI drafting.

Waqas: "SFHAs, their respective FCIMs, and Functions do not have a human interface to run it on
their respective pages or through the AI assistant page" and, confirmed, "existing actions should be
asking for scope otherwise the AI assistant page balloon up"; the SFHA works from the system FCIM's
failure conditions the same way the aircraft FHA works from the aircraft FCIM.

Anchored replacements only (rule 4). Each anchor must occur exactly once.
"""
import pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / 'site'


def patch(rel, pairs):
    p = SITE / rel
    t = p.read_text(encoding='utf-8')
    for old, new in pairs:
        n = t.count(old)
        if n != 1:
            sys.exit('%s: anchor found %d times: %r' % (rel, n, old[:90]))
        t = t.replace(old, new)
    p.write_text(t, encoding='utf-8')
    print('patched', rel)


# ---------------------------------------------------------------- ai_assistant.js
AI = []

AI.append(("// 27 Oct 2026 (v76.91, customer report)",
           "// 30 Oct 2026 (v76.92, Waqas: system functions, system FCIM and SFHA had no way to be drafted from their pages or the AI Assistant page): the launcher's Decompose, Generate FCIM and Draft FHA ask for the scope first (aircraft, or which system, with what each system still needs) when started from the AI Assistant page; a page button passes its own scope (_laneScope). A system FCIM and SFHA run on the same batch engine as the aircraft ones (_draftSystemFcim, _draftSystemFha: function or condition picker, slices, coverage, retries, phase coverage), and the SFHA classifies the system FCIM's failure conditions. cfg.pinScope writes the system scope onto every drafted row. See tests/regression_sys_ai_lanes_20261030.test.js\n"
           "// 27 Oct 2026 (v76.91, customer report)"))

# launcher actions: the page and the launcher call run() bare (ask for the scope); a lane button passes its scope
AI.append(("run: function () { return decompose(); } },",
           "run: function (o) { return decompose(_laneScope(o)); } },"))
AI.append(("run: function () { return populateFcim(); } },",
           "run: function (o) { return populateFcim(_laneScope(o)); } },"))
AI.append(("run: function () { return populateFha(); } },",
           "run: function (o) { return populateFha(_laneScope(o)); } },"))
AI.append(("needs: { r: 'afha', std: 'ARP4761A · 4754B', t: 'Aircraft-level function list, each stated as an objective (\\u201cprovide \\u2026\\u201d); operational & environmental context; the flight phases.' }, sub: 'Effects on AC / crew / pax + severity'",
           "needs: { r: 'fha', std: 'ARP4761A · 4754B', t: 'An aircraft or system function list, each stated as an objective (\\u201cprovide \\u2026\\u201d), or the FCIM\\u2019s failure conditions; operational & environmental context; the flight phases. You pick the aircraft or a system when it starts.' }, sub: 'Effects on AC / crew / pax + severity'"))

# readiness: the FHA action covers both levels now; the aircraft lane keeps 'afha' (lane_ai_bar LANE_NEEDS)
AI.append(("            case 'sfha':    return sysFuncsN?ok:no('allocated system functions');",
           "            case 'sfha':    return sysFuncsN?ok:no('allocated system functions');\n"
           "            case 'fha':     return funcsN?ok:no('aircraft or system functions');"))

# the system scope picker can say what each system still needs
AI.append(("                const n = C.countFn(sy).length;\n",
           "                if (typeof C.metaFn === 'function') return '<button type=\"button\" class=\"aifh-card\" data-sid=\"' + _esc(String(sy.id)) + '\" style=\"display:block;width:100%;text-align:left;cursor:pointer\"><h4>' + _esc(C.sysPrefix) + _esc(sy.name || sy.id) + '</h4><div class=\"aifh-meta\">' + _esc(C.metaFn(sy)) + '</div></button>';\n"
           "                const n = C.countFn(sy).length;\n"))
AI.append(("            countFn:       cfg.countFn       || _funcsNeedingFhaForSystem\n",
           "            countFn:       cfg.countFn       || _funcsNeedingFhaForSystem,\n"
           "            metaFn:        cfg.metaFn        || null\n"))

# decompose: a page button decides the scope; the AI Assistant page asks
AI.append(("        _openDecompScopePicker(systems, function (scope) {",
           "        let _pickDecomp = _openDecompScopePicker;\n"
           "        if (opts.systemId) {\n"
           "            const _dsy = systems.find(function (x) { return x && String(x.id) === String(opts.systemId); });\n"
           "            if (!_dsy) { _toast('That system is no longer in the project.', 'warning'); return; }\n"
           "            _pickDecomp = function (_s, cb) { cb({ systemId: String(_dsy.id), systemName: _dsy.name || String(_dsy.id) }); };\n"
           "        } else if (opts.fromLane) {\n"
           "            _pickDecomp = function (_s, cb) { cb({ systemId: '', systemName: '' }); };\n"
           "        }\n"
           "        _pickDecomp(systems, function (scope) {"))
AI.append(("                analysis: 'arch.decompose',\n",
           "                analysis: 'arch.decompose',\n"
           "                pinScope: (scope && scope.systemId) ? { systemId: scope.systemId, ops: ['add_function'] } : null,   // 30 Oct 2026\n"))

# populateFha: ask for the scope; a system without funcs goes to the batch engine
AI.append(("        if (_useUnifiedFeatures() && !opts.systemId && !(opts.funcs && opts.funcs.length)) {",
           "        if (opts.askScope) { _askScopeThen('fha', function (o) { return populateFha(o); }); return; }   // 30 Oct 2026\n"
           "        if (opts.systemId && !(opts.funcs && opts.funcs.length) && _useUnifiedFeatures()) return _draftSystemFha(opts);   // 30 Oct 2026\n"
           "        if (_useUnifiedFeatures() && !opts.systemId && !(opts.funcs && opts.funcs.length)) {"))
AI.append(("        if (opts.funcs && opts.funcs.length) return _runPopulateFha({ systemId: opts.systemId || '', systemName: opts.systemName || '' }, opts.funcs, opts);\n",
           "        if (opts.funcs && opts.funcs.length) return _runPopulateFha({ systemId: opts.systemId || '', systemName: opts.systemName || '' }, opts.funcs, opts);\n"
           "        if (opts.systemId) {   // 30 Oct 2026: classic engine, one system named\n"
           "            const _csy = _sysFor(opts); if (!_csy) { _toast('That system is no longer in the project.', 'warning'); return; }\n"
           "            const _cf = _funcsNeedingFhaForSystem(_csy);\n"
           "            if (!_cf.length) { _toast('Every function in ' + (_csy.name || _csy.id) + ' already has an SFHA row.', 'info'); return; }\n"
           "            return _runPopulateFha({ systemId: String(_csy.id), systemName: _csy.name || String(_csy.id) }, _cf, opts);\n"
           "        }\n"))

# populateFcim: same
AI.append(("        if (!Provider.available()) { _toast(Provider.notReadyMessage(), 'warning', 5000); throw new Error('[Safety Lab Aero AI] backend not available.'); }\n"
           "        if (_useUnifiedFeatures() && !(opts.funcs && opts.funcs.length) && !opts.systemId) {",
           "        if (!Provider.available()) { _toast(Provider.notReadyMessage(), 'warning', 5000); throw new Error('[Safety Lab Aero AI] backend not available.'); }\n"
           "        if (opts.askScope) { _askScopeThen('fcim', function (o) { return populateFcim(o); }); return; }   // 30 Oct 2026\n"
           "        if (opts.systemId && !(opts.funcs && opts.funcs.length) && _useUnifiedFeatures()) return _draftSystemFcim(opts);   // 30 Oct 2026\n"
           "        if (_useUnifiedFeatures() && !(opts.funcs && opts.funcs.length) && !opts.systemId) {"))
AI.append(("        if (opts.funcs && opts.funcs.length) return _runFcim({ systemId: opts.systemId || '', systemName: opts.systemName || '' }, opts.funcs, opts);\n",
           "        if (opts.funcs && opts.funcs.length) return _runFcim({ systemId: opts.systemId || '', systemName: opts.systemName || '' }, opts.funcs, opts);\n"
           "        if (opts.systemId) {   // 30 Oct 2026: classic engine, one system named\n"
           "            const _csy = _sysFor(opts); if (!_csy) { _toast('That system is no longer in the project.', 'warning'); return; }\n"
           "            const _cf = _funcsNeedingFcimForSystem(_csy);\n"
           "            if (!_cf.length) { _toast('Every function in ' + (_csy.name || _csy.id) + ' already has an FCIM row.', 'info'); return; }\n"
           "            return _runFcim({ systemId: String(_csy.id), systemName: _csy.name || String(_csy.id) }, _cf, opts);\n"
           "        }\n"))

# the batch engine writes the system scope onto every drafted row of the pinned ops
AI.append(("            if (Array.isArray(pp.actions)) Array.prototype.push.apply(actions, pp.actions);",
           "            if (Array.isArray(pp.actions) && cfg.pinScope && cfg.pinScope.systemId) {   // 30 Oct 2026: a system lane's rows are that system's, whatever the reply said\n"
           "                pp.actions.forEach(function (x) { if (x && (cfg.pinScope.ops || []).indexOf(x.op) >= 0) { x.scope = 'system'; x.systemId = String(cfg.pinScope.systemId); } });\n"
           "            }\n"
           "            if (Array.isArray(pp.actions)) Array.prototype.push.apply(actions, pp.actions);"))

# the new functions, placed right after the scope picker
NEW_FNS = r'''
    // ---------------------------------------------------------------------------------------------
    // 30 Oct 2026 — SYSTEM LANES (Waqas: "SFHAs, their respective FCIMs, and Functions do not have a
    // human interface to run it on their respective pages or through the AI assistant page"; then
    // "existing actions should be asking for scope otherwise the AI assistant page balloon up").
    //
    // _laneScope turns what the caller passed into the drafting scope. The AI Assistant page and the
    // launcher call run() with nothing: ask for the scope. A page button passes its own scope: the
    // aircraft pages { lane: 'aircraft' }, a system's pages { systemId, systemName }.
    function _laneScope(o) {
        if (o && typeof o === 'object') {
            if (o.systemId) return { systemId: String(o.systemId), systemName: String(o.systemName || o.systemId), fromLane: true };
            if (o.lane === 'aircraft') return { fromLane: true };
        }
        return { askScope: true };
    }
    function _sysFor(opts) {
        try { const s = snapshot(); return (s.systemsData || []).find(function (x) { return x && String(x.id) === String(opts && opts.systemId); }) || null; } catch (_) { return null; }
    }
    // A system's functions as drafting units (system functions are one flat list: funcId, funcName, funcDef).
    function _sysFuncUnits(sy) {
        const seen = {}, out = [];
        ((sy && sy.functions) || []).forEach(function (f) {
            const sid = f && (f.funcId || f.subId);
            if (!sid || seen[sid]) return; seen[sid] = 1;
            out.push({ subId: String(sid), subName: f.funcName || f.subName || String(sid), subDef: f.funcDef || f.subDef || '' });
        });
        return out;
    }
    function _sysCondUnits(sy) { return ((sy && sy.extractedFCs) || []).filter(function (e) { return e && e.id && e.desc; }); }
    // What each system still needs, on its card in the scope picker.
    function _sysFcimMeta(sy) {
        const all = _sysFuncUnits(sy).length, todo = _funcsNeedingFcimForSystem(sy).length;
        return todo + ' of ' + all + ' function' + (all === 1 ? '' : 's') + ' without an FCIM row';
    }
    function _sysFhaMeta(sy) {
        const conds = _sysCondUnits(sy);
        if (conds.length) {
            const done = {}; ((sy && sy.fha) || []).forEach(function (r) { if (r && r.fcId) done[String(r.fcId)] = 1; if (r && r.srcCondId) done[String(r.srcCondId)] = 1; });
            const todo = conds.filter(function (e) { return !done[String(e.id)]; }).length;
            return todo + ' of ' + conds.length + ' failure condition' + (conds.length === 1 ? '' : 's') + ' from the FCIM not yet in the SFHA';
        }
        const n = _sysFuncUnits(sy).length;
        return n + ' function' + (n === 1 ? '' : 's') + ', no system FCIM yet (drafts per function)';
    }
    // Aircraft or which system. Only systems with functions are offered; with none, it is the aircraft.
    function _askScopeThen(kind, next) {
        const run = function (o) { Promise.resolve().then(function () { return next(o); }).catch(function (e) { _toast((e && e.message) || String(e), 'warning', 5000); }); };
        let systems = [];
        try { systems = (snapshot().systemsData || []).filter(function (sy) { return sy && (sy.functions || []).length; }); } catch (_) { systems = []; }
        if (!systems.length) return run({ fromLane: true });
        const onPick = function (scope) { run(scope.systemId ? { systemId: scope.systemId, systemName: scope.systemName, fromLane: true } : { fromLane: true }); };
        if (kind === 'fcim') {
            _openFhaScopePicker(systems, onPick, {
                title: '✨ Generate FCIM · pick the scope',
                disclaimer: 'The FCIM is aircraft level or per system. Pick where these rows belong: a system\'s rows are filed in that system\'s FCIM and feed its SFHA.',
                acTitle: 'Aircraft FCIM', acMeta: 'One matrix row per aircraft function (the bottom of each branch)',
                sysPrefix: 'System FCIM · ', countFn: _funcsNeedingFcimForSystem, metaFn: _sysFcimMeta
            });
            return;
        }
        _openFhaScopePicker(systems, onPick, {
            title: '✨ Draft FHA · pick the scope',
            disclaimer: 'The FHA is aircraft level (AFHA) or per system (SFHA). Pick where these rows belong: a system\'s rows are filed in that system\'s FHA, classifying the failure conditions its FCIM identifies.',
            acTitle: 'Aircraft (AFHA)', acMeta: 'Aircraft-level functional hazard assessment',
            sysPrefix: 'SFHA · ', countFn: _funcsNeedingFhaForSystem, metaFn: _sysFhaMeta
        });
    }
    function _sysFcimDirective(sy) {
        const name = String(sy.name || sy.id), sid = String(sy.id);
        return 'Generate the SYSTEM FCIM (Failure Conditions, Indications & Mitigations) for the "' + name + '" system, ARP4761A §C.3 / Table C1: one row per SYSTEM function listed, at system-function altitude. Total Loss / Partial Loss / Malfunction as concise capability phrases, the crew-Aware vs crew-Unaware awareness split, and the indications + mitigations. A cell may hold SEVERAL distinct conditions (Table A3 / C1): use partials[]/malfunctions[] arrays, never merged into one phrase. Put NO severity words anywhere (severity lives in the SFHA, never the FCIM). Fill every cell: a failure condition, or {"na": true, "rationale": "<why it does not apply to this function>"} where that type of failure cannot occur; never leave a cell empty. Where MAC rules for this system are given, describe total and partial loss in their terms. Emit add_fcim actions with scope "system" and systemId ' + JSON.stringify(sid) + '; subId is the system function id exactly as listed.';
    }
    function _sysFhaDirective(sy, fromFcim) {
        const name = String(sy.name || sy.id), sid = String(sy.id);
        return 'Draft the SYSTEM-level FHA (SFHA) for the "' + name + '" system, ARP4761A §3.4 / App C. '
            + (fromFcim
                ? 'Classify the failure conditions the system FCIM identifies (each turn lists them): for each condition, its effects'
                : 'For each system function listed, identify its failure condition(s) and, for each, its effects')
            + ' on the ' + name + ' system and how they propagate to the Aircraft / Crew / Passengers (effAc, effCrew, effPax), and a SEVERITY classified per §__.1309 (Catastrophic ↔ Extremely Improbable … No Safety Effect ↔ none), DERIVED from the effects you state for that condition. Ground every row strictly in the project\'s functions and failure conditions. If the information is too thin to settle the class, do NOT return a blank: make the call an experienced safety engineer would make from what is known, set the class, and mark the row judgementCall: true with a judgementNote naming the missing fact and what you assumed. Do NOT reach for the benign end of the scale either — "No Safety Effect" is a finding about the aircraft, not a way of saying you do not know. Emit add_fha actions with scope "system" and systemId ' + JSON.stringify(sid) + '; subId is the system function id.';
    }
    const _SYS_FHA_COND_EXTRA = '\n\nSOURCE-CONDITION TRACE (required): every add_fha action MUST carry "srcCondId": the id of the failure condition it classifies, echoed VERBATIM from the THIS TURN list, and "fcDesc" echoed WORD FOR WORD from it.\n\nROWS PER CONDITION: every condition applies to every flight phase. Return as MANY add_fha rows for one condition as its effects across the flight require — phases that share the same effects and class sit on ONE row; where the effects or the class differ, that is ANOTHER row. All the rows for a condition together must cover every phase of this project\'s mission profile. A phase where the effect is not realized and the flight can be aborted or the condition escaped is a No Safety Effect row; a phase where nothing has happened yet but the end effect cannot be escaped carries that end effect. "All phases" only when the effects and class are identical everywhere. A phase belongs to EXACTLY ONE row of a condition — one effect, one class — never to two rows with different classes.';
    function _draftSystemFcim(opts) {
        const sy = _sysFor(opts);
        if (!sy) { _toast('That system is no longer in the project.', 'warning'); return; }
        const name = String(sy.name || sy.id);
        const units = _sysFuncUnits(sy);
        if (!units.length) { _toast(name + ' has no system functions yet. Add them, or decompose them from the architecture document, first.', 'info', 7000); return; }
        const go = function (picked) {
            return _anemBatch(_sysFcimDirective(sy), {
                title: '✨ AI-drafted FCIM · ' + name + ' · review', analysis: 'fcim.populate',
                thread: { scope: 'system', systemId: sy.id, funcKeys: picked.map(function (f) { return f.subId; }) },
                systemExtra: '\n' + _macRulesForSystemPrompt(sy.id),   // the MAC detail is parsed out at system level
                pinScope: { systemId: String(sy.id), ops: ['add_fcim'] },
                specSecs: _specSecsForSubIds(picked.map(function (f) { return f.subId; })),
                chunk: {
                    units: picked, size: 5, noun: 'system function',
                    keyOf:     function (f) { return f.subId; },
                    label:     function (f) { return f.subId + ' — ' + String(f.subName || ''); },
                    coveredBy: function (a) { return (a && a.op === 'add_fcim') ? a.subId : null; }
                }
            });
        };
        const sel = _pickByIds(units, opts.funcIds, function (f) { return f.subId; });
        if (sel) return go(sel);
        _openScopePicker(units, {
            title: '✨ AI-drafted FCIM · ' + name + ' · which functions?',
            disclaimer: units.length + ' system function(s) in ' + name + '. All are selected — leave it that way to identify failure conditions for the full set, or narrow the scope. One matrix row per selected function.',
            verb: 'Draft FCIM for',
            sort: function (a, b) { return String(a.subId).localeCompare(String(b.subId), undefined, { numeric: true }); },
            row: function (f) { return [f.subId, f.subName || '', f.subDef || '']; }
        }, go);
    }
    function _draftSystemFha(opts) {
        const sy = _sysFor(opts);
        if (!sy) { _toast('That system is no longer in the project.', 'warning'); return; }
        const name = String(sy.name || sy.id);
        const mac = '\n' + _macRulesForSystemPrompt(sy.id);   // the SFHA parses the MAC detail out
        const base = {
            title: '✨ AI-drafted SFHA · ' + name + ' · review', analysis: 'sfha', verifyKind: 'fha',
            pinScope: { systemId: String(sy.id), ops: ['add_fha'] }
        };
        const conds = _sysCondUnits(sy);
        if (conds.length) {
            const norm = function (v) { return String(v || '').replace(/\s+/g, ' ').trim().toLowerCase(); };
            const descMap = {};
            const condOf = function (a) { return (a && a.op === 'add_fha') ? (a.srcCondId || descMap[norm(a.fcDesc)] || null) : null; };
            const go = function (picked) {
                picked.forEach(function (e) { descMap[norm(e.desc)] = e.id; });
                const subs = []; picked.forEach(function (e) { if (e.subId && subs.indexOf(String(e.subId)) < 0) subs.push(String(e.subId)); });
                return _anemBatch(_sysFhaDirective(sy, true), Object.assign({}, base, {
                    thread: { scope: 'system', systemId: sy.id, funcKeys: subs },
                    specSecs: _specSecsForSubIds(subs),
                    systemExtra: _SYS_FHA_COND_EXTRA + _fhaEscapesClause() + mac,
                    chunk: {
                        units: picked, size: 5, noun: 'failure condition',
                        keyOf:     function (e) { return e.id; },
                        label:     function (e) { return e.id + ' — ' + String(e.desc || '').slice(0, 80) + ' (function ' + String(e.subId || '') + ')'; },
                        coveredBy: condOf,
                        gapsOf:    function (acts) { return _fhaPhaseGaps(picked, acts, condOf); },
                        extraOf:   function (slice) { return _fhaDerivedClause(slice, sy.id); }
                    }
                }));
            };
            const sel = _pickByIds(conds, opts.condIds, function (e) { return e.id; });
            if (sel) return go(sel);
            _openScopePicker(conds, {
                title: '✨ AI-drafted SFHA · ' + name + ' · which failure conditions?',
                disclaimer: conds.length + ' failure condition(s) identified in the ' + name + ' FCIM. All are selected — leave it that way to classify the full set, or narrow the scope. Each condition is assessed across every flight phase: one row where the effects are the same, separate rows where they differ.',
                verb: 'Draft SFHA for',
                sort: function (a, b) { return String(a.id).localeCompare(String(b.id), undefined, { numeric: true }); },
                row: function (e) { return [e.id, e.desc, e.subId]; }
            }, go);
            return;
        }
        // An FCIM with rows but no condition (every cell N/A or not assessed) is not "no FCIM".
        if (((sy.fcim || []).filter(Boolean)).length) { _toast('The ' + name + ' FCIM identifies no failure conditions yet: every cell is marked not applicable or not assessed. Draft or write the FCIM cells first; the SFHA classifies what the FCIM identifies.', 'info', 9000); return; }
        const units = _sysFuncUnits(sy);
        if (!units.length) { _toast(name + ' has no system functions yet. Add them, or decompose them from the architecture document, first.', 'info', 7000); return; }
        const goF = function (picked) {
            return _anemBatch(_sysFhaDirective(sy, false), Object.assign({}, base, {
                thread: { scope: 'system', systemId: sy.id, funcKeys: picked.map(function (f) { return f.subId; }) },
                specSecs: _specSecsForSubIds(picked.map(function (f) { return f.subId; })),
                systemExtra: _fhaEscapesClause() + mac,
                chunk: {
                    units: picked, size: 3, noun: 'system function',
                    keyOf:     function (f) { return f.subId; },
                    label:     function (f) { return f.subId + ' — ' + String(f.subName || ''); },
                    coveredBy: function (a) { return (a && a.op === 'add_fha') ? a.subId : null; }
                }
            }));
        };
        const selF = _pickByIds(units, opts.funcIds, function (f) { return f.subId; });
        if (selF) return goF(selF);
        _openScopePicker(units, {
            title: '✨ AI-drafted SFHA · ' + name + ' · which functions?',
            disclaimer: 'No FCIM on file for ' + name + ' yet, so the SFHA drafts per function. ' + units.length + ' system function(s) — all selected; narrow the scope if you want fewer.',
            verb: 'Draft SFHA for',
            sort: function (a, b) { return String(a.subId).localeCompare(String(b.subId), undefined, { numeric: true }); },
            row: function (f) { return [f.subId, f.subName || '', f.subDef || '']; }
        }, goF);
    }

    // 5 Sep 2026 (lever 3) — the escapes clause the FHA prompts carry, from the mission profile.
'''
AI.append(("\n    // 5 Sep 2026 (lever 3) — the escapes clause the FHA prompts carry, from the mission profile.\n", NEW_FNS))

# expose for tests and the lane bar
AI.append(("        inputReady: function (r) { try { return _aiInputReady(r); } catch (_) { return { ready: true }; } },",
           "        inputReady: function (r) { try { return _aiInputReady(r); } catch (_) { return { ready: true }; } },\n"
           "        laneScope: _laneScope,   // 30 Oct 2026\n"
           "        _sysLaneTest: { sysFuncUnits: _sysFuncUnits, sysCondUnits: _sysCondUnits, sysFcimMeta: _sysFcimMeta, sysFhaMeta: _sysFhaMeta, sysFcimDirective: _sysFcimDirective, sysFhaDirective: _sysFhaDirective },"))

patch('ai_assistant.js', AI)

# ---------------------------------------------------------------- ai_skills.js: the system batch lane's alias
patch('ai_skills.js', [("        \"fha\": \"fha.draft\"\n    };",
                        "        \"fha\": \"fha.draft\",\n        \"sfha\": \"sfha.draft\"   // 30 Oct 2026: the system FHA batch names its analysis 'sfha'\n    };")])

# ---------------------------------------------------------------- loader and script tags
patch('ai_loader.js', [("'ai_assistant.js?v=76.91'", "'ai_assistant.js?v=76.92'")])
patch('index.html', [('<script src="lane_ai_bar.js?v=1.3" defer></script>', '<script src="lane_ai_bar.js?v=1.4" defer></script>'),
                     ('<script src="a11_sequencing.js?v=1.4" defer></script>', '<script src="a11_sequencing.js?v=1.5" defer></script>'),
                     ('<script src="ai_skills.js?v=2.17" defer></script>', '<script src="ai_skills.js?v=2.18" defer></script>'),
                     ('<script src="ai_inputs_page.js?v=1.0" defer></script>', '<script src="ai_inputs_page.js?v=1.1" defer></script>')])

# ---------------------------------------------------------------- a11: the ARP4761A workflow is the aircraft
patch('a11_sequencing.js', [("        return Promise.resolve().then(action.run).then(function () {",
                             "        // 30 Oct 2026: the workflow's steps are the aircraft's (doneWhen reads the aircraft stores), so it\n"
                             "        // passes the aircraft scope; the AI Assistant page asks, a system's pages pass the system.\n"
                             "        return Promise.resolve().then(function () { return action.run({ lane: 'aircraft' }); }).then(function () {")])

# ---------------------------------------------------------------- AI page: the system pages read the inputs too
patch('ai_inputs_page.js', [("    var VERSION = '1.0';", "    var VERSION = '1.1';"),
                            ("        { tab: null, name: 'ANEM live chat', what: 'answers and proposals grounded in these documents and the model' },",
                             "        { tab: 'sys-dir', name: 'Each system\\'s Functions, FCIM and FHA pages', what: 'Decompose architecture \\u2192 functions, Generate FCIM and Draft FHA for that system' },\n"
                             "        { tab: null, name: 'ANEM live chat', what: 'answers and proposals grounded in these documents and the model' },")])
print('done')
