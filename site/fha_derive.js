// ============================================================================
// fha_derive.js — v1.0 — FHA LEVELS DERIVED BY RULE, NOT JUDGED (5 Sep 2026).
//
// Two identical-input draws of the same AFHA agreed on a row's class 63% of the
// time. Waqas: "lever 2 are pure judgement calls and you will have a hard time
// getting consistent answer from the same safety engineer on 2 separate programs
// — the only way right now is human factors decides in terms of crew work load,
// and we need to lean on MAC to establish what counts as slight / significant /
// large; they will have to get validated later as those analyses are populated."
//
// So the two axes that CAN be derived are derived, here, by rule:
//
//   AIRCRAFT axis (F21a) — from the MAC rule for the function. A partial loss
//   that leaves the rule held is graded by the configuration authority left
//   against the floor: on the floor → large; one spare → significant; two or
//   more spare → slight. A total loss is OUTSIDE the MAC — the level is the loss
//   itself, judged, with the escape rule below on top. A malfunction is not a
//   configuration question, so the MAC does not govern it. No rule for the
//   function → the drafter's level stands and lands as an assumption
//   ("assumed pending MAC") in the register, validated when the MAC is set.
//
//   CREW axis (F21b) — from the crew Task Analysis. The tasks this condition
//   demands are read against the time available in the row's phases, as the
//   occupancy the HF lane already computes (HIDH §5.7.5.1 lines): up to 60% →
//   slight; 60–80% → significant; above 80% → large; a response that cannot be
//   completed in the time available is large and flagged. No task authored →
//   the drafter's level stands and lands as "assumed pending HF workload".
//
//   ESCAPES (lever 3) — the mission profile now says, per phase, how a flight
//   gets out of a condition whose effect has not yet been felt (stop on the
//   ground, reject before V1, continue to a landing, go-around, none). The
//   drafter answers three structured questions per row — is the effect realised
//   in these phases; which escape applies; does THIS failure defeat it — and
//   the product applies the ruling of 4 Sep: not realised + escape available and
//   not defeated → No Safety Effect; not realised + no escape, or defeated → the
//   END effect and its class; realised → the effect as it is felt.
//
// The OCCUPANT axis stays the drafter's: it is the physical consequence of the
// aircraft effect and no register derives it yet.
//
// Rejected on the way and not to be re-raised: a per-function worst-case anchor
// (the 2 Aug mistake) and fixed phase groups — groups come from each condition's
// effects (loss of braking: Standing NSE / Taxi Major–Hazardous / airborne
// forward-looking Catastrophic / Landing immediate Catastrophic).
//
// Born modular: ai_assistant.js calls apply() at accept and promptFor() while
// drafting; helpers' Flight Phases table edits the escapes; severity_axes'
// Effects cell shows which levels were derived. Absent this file, the FHA works
// exactly as before: judged levels, no escapes column.
// ============================================================================
(function () {
    'use strict';
    var G = (typeof window !== 'undefined') ? window : globalThis;
    if (G.SLFhaDerive) return;

    // ---- escapes ---------------------------------------------------------------
    // 'none' is a stated answer (there is no way out of this phase); '' means the
    // engineer has not said yet, and the rule then does not fire.
    var ESCAPE_NONE = 'none';
    var DEFAULT_ESCAPES = [
        [/^standing$/i,                                   'stop on the ground'],
        [/^taxi$/i,                                       'stop on the ground'],
        [/^take-?\s?off$/i,                               'reject the take-off before V1'],
        [/^rejected take-?\s?off$|^rto$|^aborted take-?\s?off$/i, 'stop on the runway'],
        [/^(initial climb|climb|cruise|descent|extended cruise)$/i, 'continue to a landing'],
        [/^(diversion|hold|diversion \/ hold|engine-out drift-down|drift-?down|emergency descent)$/i, 'continue to a landing'],
        [/^approach$|^single-engine approach$/i,          'go-around'],
        [/^go-?\s?around$|^ba?ulked landing$|^missed approach$/i, 'continue to a landing'],
        [/^landing$|^ditching|^forced landing/i,          ESCAPE_NONE]
    ];
    function defaultEscape(phaseName) {
        var n = String(phaseName || '').trim();
        for (var i = 0; i < DEFAULT_ESCAPES.length; i++) if (DEFAULT_ESCAPES[i][0].test(n)) return DEFAULT_ESCAPES[i][1];
        return '';
    }
    function _phaseTable(tbl) {
        if (Array.isArray(tbl)) return tbl;
        try { return (typeof flightPhasesData !== 'undefined' ? flightPhasesData : (G.flightPhasesData || [])) || []; } catch (_) { return []; }
    }
    // The escape in force for a phase row: the authored value, else the default.
    function escapeOf(p) {
        if (!p) return '';
        var v = (p.escape != null) ? String(p.escape).trim() : '';
        return v || defaultEscape(p.phase);
    }
    function phaseEscapes(tbl) {
        return _phaseTable(tbl).filter(function (p) { return p && p.phase; }).map(function (p) { return { phase: String(p.phase).trim(), escape: escapeOf(p) }; });
    }
    function _isAll(x) { return /^all phases$/i.test(String(x || '').trim()); }
    function _phaseList(v) {
        var list = Array.isArray(v) ? v : String(v || '').split(',');
        return list.map(function (x) { return String(x || '').trim(); }).filter(Boolean);
    }
    // Escape per phase of a row (an "All phases" row expands to the whole profile).
    function escapesForRow(phases, tbl) {
        var all = phaseEscapes(tbl), want = _phaseList(phases);
        if (!want.length || want.some(_isAll)) return all;
        return want.map(function (n) {
            var hit = all.find(function (e) { return e.phase.toLowerCase() === n.toLowerCase(); });
            return { phase: n, escape: hit ? hit.escape : '' };
        });
    }
    function escapesPromptText(tbl) {
        var list = phaseEscapes(tbl);
        if (!list.length) return '';
        return 'ESCAPES BY PHASE — how the flight gets out of a condition whose effect has not yet been felt: '
            + list.map(function (e) { return e.phase + ': ' + (e.escape || 'not stated'); }).join('; ')
            + '. For EVERY row answer three structured fields — "realized": true when the effect is felt in the row\'s phases, false when nothing has happened yet; "escape": the escape from this list that applies to the row\'s phases (or "none"); "escapeDefeated": true when THIS failure removes that escape (loss of braking defeats "stop on the ground" and "reject the take-off before V1"; loss of go-around thrust defeats "go-around"). The product applies the rule from those answers: not realized + escape available and not defeated → No Safety Effect; not realized + no escape, or the escape defeated → the END effect and its class; realized → the effect as felt. Phases whose answers differ are different rows.';
    }
    // ---- the escape rule at accept ----------------------------------------------
    // s: the drafted row (realized / escape / escapeDefeated); phases: its phases.
    // Returns { kind: 'realized' | 'unknown' | 'nse' | 'end' | 'mixed' | 'unstated', note, escapes }
    function applyEscape(s, phases, tbl) {
        var esc = escapesForRow(phases, tbl);
        if (!s || s.realized == null || s.realized === '') return { kind: 'unknown', note: '', escapes: esc };
        var notRealized = (s.realized === false || String(s.realized).toLowerCase() === 'false');
        if (!notRealized) return { kind: 'realized', note: '', escapes: esc };
        var unstated = esc.filter(function (e) { return !e.escape; }).map(function (e) { return e.phase; });
        if (unstated.length) return { kind: 'unstated', escapes: esc, note: 'Effect not realised in these phases, but no escape is stated for ' + unstated.join(', ') + ' on Define → Flight Phases — the drafted level stands until the escape is entered.' };
        var none = esc.filter(function (e) { return e.escape.toLowerCase() === ESCAPE_NONE; }).map(function (e) { return e.phase; });
        var open = esc.filter(function (e) { return e.escape.toLowerCase() !== ESCAPE_NONE; });
        var defeated = !!(s.escapeDefeated === true || String(s.escapeDefeated).toLowerCase() === 'true');
        if (none.length && !open.length) return { kind: 'end', escapes: esc, note: 'Effect not realised yet and there is no escape in ' + none.join(', ') + ' — the row carries the end effect and its class (4 Sep 2026 ruling).' };
        if (none.length && open.length) return { kind: 'mixed', escapes: esc, note: 'Effect not realised yet; ' + none.join(', ') + ' has no escape while ' + open.map(function (e) { return e.phase; }).join(', ') + ' can be escaped — the row carries the end effect conservatively; split it so each phase sits on one row.' };
        var names = open.map(function (e) { return e.escape; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(' / ');
        if (defeated) return { kind: 'end', escapes: esc, note: 'Effect not realised yet, but this failure defeats the escape (' + names + ') — the row carries the end effect and its class (4 Sep 2026 ruling).' };
        var drafted = [s.effAcLevel, s.effCrewLevel, s.effPaxLevel].map(function (x) { return String(x || '').trim(); });
        return { kind: 'nse', escapes: esc, note: 'Effect not realised in these phases and the flight can be escaped (' + names + '), which this failure does not defeat — No Safety Effect by rule (4 Sep 2026 ruling)' + (drafted.some(Boolean) ? '; the drafted levels (' + drafted.map(function (x) { return x || '—'; }).join(' / ') + ') describe the end effect and are recorded here, not on the row' : '') + '.' };
    }

    // ---- MAC → aircraft axis -----------------------------------------------------
    var AC_LEVELS = ['none', 'slight', 'significant', 'large', 'hull loss'];
    function condKind(cond) {
        var id = String((cond && cond.id) || '').trim().toUpperCase();
        if (/-TL$/.test(id)) return 'total';
        if (/-PL\d*$/.test(id)) return 'partial';
        if (/-M\d*$/.test(id)) return 'malfunction';
        if (/-CB\d*$/.test(id) || (cond && cond.combined)) return 'combined';
        var d = String((cond && cond.desc) || '').trim();
        if (/^(total|complete) loss/i.test(d)) return 'total';
        if (/^partial loss|^loss of (one|a single|1|two|2|three|3) /i.test(d)) return 'partial';
        if (/^loss of/i.test(d)) return 'total';
        return 'malfunction';
    }
    var _WORDS = { one: 1, a: 1, single: 1, two: 2, both: 2, three: 3, four: 4 };
    function lostCount(desc) {
        var d = String(desc || '').toLowerCase();
        var m = d.match(/\b(one|a|single|two|both|three|four|\d+)\b\s+(?:of|out of)\b/);
        if (m) return _WORDS[m[1]] || parseInt(m[1], 10) || 1;
        if (/\bboth\b/.test(d)) return 2;
        var m2 = d.match(/\bloss of (one|a|single|two|three|four|\d+)\b/);
        if (m2) return _WORDS[m2[1]] || parseInt(m2[1], 10) || 1;
        return 1;
    }
    function _macRules() {
        try { var pc = (typeof projectConfig !== 'undefined') ? projectConfig : G.projectConfig; return (pc && Array.isArray(pc.macModels)) ? pc.macModels : []; } catch (_) { return []; }
    }
    function rulesFor(subIds) {
        var want = (Array.isArray(subIds) ? subIds : [subIds]).map(function (x) { return String(x || '').trim(); }).filter(Boolean);
        return _macRules().filter(function (r) { return r && want.indexOf(String(r.subId || '').trim()) >= 0; });
    }
    function ruleForPhase(rules, phase) {
        var p = String(phase || '').trim().toLowerCase();
        var exact = rules.find(function (r) { return String(r.phase || '').trim().toLowerCase() === p; });
        if (exact) return exact;
        return rules.find(function (r) { return !r.phase || _isAll(r.phase); }) || null;
    }
    function ruleShape(rule) {
        var members = [], min = 0;
        (rule && Array.isArray(rule.clauses) ? rule.clauses : []).forEach(function (c) {
            if (!c) return;
            min += Math.max(1, parseInt(c.min, 10) || 1);
            (Array.isArray(c.of) ? c.of : []).forEach(function (m) { var k = String(m); if (members.indexOf(k) < 0) members.push(k); });
        });
        return { members: members, min: min, spares: members.length - min };
    }
    function _nameOf() {
        var map = {};
        try {
            var s = (typeof systemsData !== 'undefined') ? systemsData : G.systemsData;
            (s || []).forEach(function (sy) { if (!sy) return; map[String(sy.id)] = sy.name || sy.id; (sy.functions || []).forEach(function (f) { if (f && f.funcId) map[String(f.funcId)] = f.funcName || f.funcId; }); });
            var it = (typeof itemsData !== 'undefined') ? itemsData : G.itemsData;
            (it || []).forEach(function (x) { if (x && x.itemId) map[String(x.itemId)] = x.name || x.itemId; });
        } catch (_) {}
        return map;
    }
    function ruleText(rule) {
        var nm = _nameOf();
        return (rule && Array.isArray(rule.clauses) ? rule.clauses : []).map(function (c) { return 'at least ' + (c.min || 1) + ' of [' + (c.of || []).map(function (m) { return nm[String(m)] || String(m); }).join(', ') + ']'; }).join(' AND ') || 'no clauses';
    }
    // cond {id, desc, subId}; subIds: the aircraft sub-function(s) the rule is keyed on
    // (the condition's own for the AFHA; the traced ones for an SFHA); phases: the row's.
    // Returns { kind, status: 'derived'|'outside'|'malfunction'|'no-rule'|'combined', level, perPhase[], split, note, assumption }
    function macDerive(cond, subIds, phases) {
        var kind = condKind(cond);
        var sub = (Array.isArray(subIds) && subIds.length) ? subIds : [cond && cond.subId];
        var rules = rulesFor(sub);
        var id = String((cond && cond.id) || '').trim() || 'this condition';
        var subTxt = sub.filter(Boolean).join(', ') || 'this function';
        var out = { kind: kind, status: '', level: '', perPhase: [], split: false, note: '', assumption: '' };
        // a malfunction is never a configuration question — say so before asking for a rule
        if (kind === 'malfunction') { out.status = 'malfunction'; out.note = 'Malfunction — the MAC governs configuration, not erroneous operation; the aircraft level is the drafter\'s.'; return out; }
        if (kind === 'combined') { out.status = 'combined'; out.note = 'Combined condition — assessed against the MAC of each function it spans; the aircraft level is the drafter\'s.'; return out; }
        if (!rules.length) {
            out.status = 'no-rule';
            out.note = 'No MAC rule for ' + subTxt + ' yet — the aircraft level is the drafter\'s, assumed pending the MAC.';
            out.assumption = 'Aircraft effect level for ' + id + ' assumed pending the MAC rule for ' + subTxt + ' — to be validated when the minimum acceptable configuration for this function is set.';
            return out;
        }
        if (kind === 'total') { out.status = 'outside'; out.note = 'Outside the MAC (the rule ' + ruleText(ruleForPhase(rules, _phaseList(phases)[0]) || rules[0]) + ' is breached) — the aircraft level is the loss itself, with the escape rule on top.'; return out; }
        // partial loss — grade the configuration authority left against the floor
        var lost = lostCount(cond && cond.desc);
        var want = _phaseList(phases);
        if (!want.length || want.some(_isAll)) want = phaseEscapes().map(function (e) { return e.phase; });
        if (!want.length) want = ['All phases'];
        var per = want.map(function (ph) {
            var r = ruleForPhase(rules, ph);
            if (!r) return { phase: ph, level: '', status: 'no-rule' };
            var sh = ruleShape(r);
            var left = sh.spares - lost;
            if (left < 0) return { phase: ph, level: '', status: 'outside', rule: r, shape: sh };
            return { phase: ph, level: left === 0 ? 'large' : (left === 1 ? 'significant' : 'slight'), status: 'derived', rule: r, shape: sh, left: left };
        });
        out.perPhase = per;
        var derived = per.filter(function (x) { return x.status === 'derived'; });
        if (!derived.length) {
            if (per.some(function (x) { return x.status === 'outside'; })) { out.status = 'outside'; out.note = 'This partial loss removes more than the MAC rule allows (' + ruleText(per.find(function (x) { return x.rule; }).rule) + ') — outside the MAC; the aircraft level is the loss itself.'; }
            else { out.status = 'no-rule'; out.note = 'The MAC rule for ' + subTxt + ' names other phases only — no rule for ' + want.join(', ') + '; the aircraft level is the drafter\'s, assumed pending the MAC.'; out.assumption = 'Aircraft effect level for ' + id + ' in ' + want.join(', ') + ' assumed pending a MAC rule for ' + subTxt + ' in those phases.'; }
            return out;
        }
        var worst = derived.reduce(function (m, x) { return AC_LEVELS.indexOf(x.level) > AC_LEVELS.indexOf(m.level) ? x : m; }, derived[0]);
        out.status = 'derived';
        out.level = worst.level;
        var same = derived.every(function (x) { return x.level === worst.level; }) && derived.length === per.length;
        out.split = !same;
        var why = function (x) { return 'MAC ' + ruleText(x.rule) + ': ' + lost + ' lost, ' + x.left + ' spare above the floor → ' + x.level; };
        out.note = same
            ? ('Aircraft level derived from the MAC — ' + why(worst) + '.')
            : ('Aircraft level derived from the MAC per phase — ' + per.map(function (x) { return x.phase + ': ' + (x.status === 'derived' ? x.level : x.status); }).join('; ') + ' — the row takes the worst (' + worst.level + '); split it so each phase sits on one row.');
        return out;
    }

    // ---- Task Analysis → crew axis -----------------------------------------------
    function _hf() { try { var pc = (typeof projectConfig !== 'undefined') ? projectConfig : G.projectConfig; return (pc && pc.hf) || {}; } catch (_) { return {}; } }
    function _rows(store) { var st = _hf()[store]; return (st && Array.isArray(st.rows)) ? st.rows : []; }
    function _hasToken(text, tok) {
        if (!tok) return false;
        var t = String(text || '').toLowerCase(), k = String(tok).toLowerCase();
        var i = t.indexOf(k);
        while (i >= 0) {
            var before = i === 0 ? ' ' : t[i - 1], after = (i + k.length >= t.length) ? ' ' : t[i + k.length];
            if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
            i = t.indexOf(k, i + 1);
        }
        return false;
    }
    // The crew tasks a condition demands: cited by an error-analysis row that feeds
    // the condition (fcIds → asmId → task), or naming the condition / its function.
    function tasksFor(cond, subIds) {
        var tasks = _rows('tasks'), hea = _rows('hea');
        var id = String((cond && cond.id) || '').trim();
        var subs = (Array.isArray(subIds) ? subIds : [subIds]).concat([cond && cond.subId]).map(function (x) { return String(x || '').trim(); }).filter(Boolean);
        var asm = {};
        if (id) hea.forEach(function (h) { if (h && h.asmId && String(h.fcIds || '').split(',').some(function (x) { return x.trim().toLowerCase() === id.toLowerCase(); })) asm[String(h.asmId)] = 1; });
        return tasks.filter(function (t) {
            if (!t) return false;
            if (t.asmId && asm[String(t.asmId)]) return true;
            var text = [t.task, t.notes, t.basis, t.trigger].join(' | ');
            if (id && _hasToken(text, id)) return true;
            return subs.some(function (s) { return _hasToken(text, s); });
        });
    }
    function _hfApi() { return G.HF_ANALYSES || null; }
    function hfDerive(cond, subIds, phases) {
        var id = String((cond && cond.id) || '').trim() || 'this condition';
        var out = { status: '', level: '', occupancy: null, tasks: [], note: '', assumption: '', notCompletable: false };
        var api = _hfApi();
        var tasks = tasksFor(cond, subIds);
        if (!tasks.length) {
            out.status = 'no-task';
            out.note = 'No crew task in the Task Analysis is tied to ' + id + ' — the crew level is the drafter\'s, assumed pending the human-factors workload.';
            out.assumption = 'Crew workload level for ' + id + ' assumed pending the human-factors task analysis — to be validated when the crew tasks this condition demands are authored with their response times.';
            return out;
        }
        if (!api || typeof api.taskOccupancy !== 'function') { out.status = 'no-hf'; out.note = 'Task Analysis present but the HF lane is not loaded — crew level not derived.'; return out; }
        var want = _phaseList(phases);
        var per = [];
        tasks.forEach(function (t) {
            var tp = _phaseList(t.phase);
            var scoped = t;
            if (want.length && !want.some(_isAll) && tp.length && !tp.some(_isAll)) {
                var inter = tp.filter(function (p) { return want.some(function (w) { return w.toLowerCase() === p.toLowerCase(); }); });
                if (!inter.length) return;                       // this task is for other phases
                scoped = Object.assign({}, t, { phase: inter.join(', ') });
            } else if (want.length && !want.some(_isAll) && (!tp.length || tp.some(_isAll))) {
                scoped = Object.assign({}, t, { phase: want.join(', ') });
            }
            var u = api.taskOccupancy(scoped);
            per.push({ taskId: t.taskId, task: t.task, occupancy: u, responseS: api.taskResponseS ? api.taskResponseS(scoped) : null, availableS: api.taskAvailableS ? api.taskAvailableS(scoped).s : null });
        });
        out.tasks = per;
        var timed = per.filter(function (x) { return x.occupancy != null; });
        if (!per.length) { out.status = 'no-task'; out.note = 'The crew tasks tied to ' + id + ' are authored for other phases — the crew level is the drafter\'s, assumed pending the human-factors workload.'; out.assumption = 'Crew workload level for ' + id + ' in ' + (want.join(', ') || 'these phases') + ' assumed pending the task analysis for those phases.'; return out; }
        if (!timed.length) { out.status = 'no-time'; out.note = 'Crew task(s) ' + per.map(function (x) { return x.taskId; }).join(', ') + ' are tied to ' + id + ' but carry no response time or no time available — the crew level is the drafter\'s, assumed pending the human-factors workload.'; out.assumption = 'Crew workload level for ' + id + ' assumed pending response times on ' + per.map(function (x) { return x.taskId; }).join(', ') + '.'; return out; }
        var top = timed.reduce(function (m, x) { return x.occupancy > m.occupancy ? x : m; }, timed[0]);
        var u = top.occupancy;
        out.occupancy = u;
        out.status = 'derived';
        out.notCompletable = u > 1;
        out.level = u > 0.8 ? 'large' : (u > 0.6 ? 'significant' : 'slight');
        var pct = Math.round(u * 100) + '%';
        out.note = 'Crew level derived from the Task Analysis — ' + top.taskId + ' (' + String(top.task || '').slice(0, 60) + ') occupies ' + pct + ' of the time available'
            + (out.notCompletable ? ' — the response CANNOT be completed in the time available; large, flagged for HF review' : (u > 0.8 ? ' (above the 80% line) → large' : (u > 0.6 ? ' (above the 60% line) → significant' : ' → slight'))) + '.';
        return out;
    }

    // ---- what the drafter is told ---------------------------------------------------
    // conds: [{id, desc, subId}]; subIdsOf(cond) → the sub-functions the MAC is keyed on.
    function promptFor(conds, subIdsOf) {
        var lines = [];
        (conds || []).forEach(function (c) {
            if (!c || !c.id) return;
            var subs = (typeof subIdsOf === 'function') ? subIdsOf(c) : [c.subId];
            var parts = [];
            try {
                var m = macDerive(c, subs, []);
                if (m.status === 'derived') parts.push('aircraft level ' + (m.split ? 'per phase — ' + m.perPhase.map(function (x) { return x.phase + ': ' + (x.level || x.status); }).join(', ') : '= ' + m.level) + ' (MAC: ' + ruleText(m.perPhase.find(function (x) { return x.rule; }).rule) + ', ' + lostCount(c.desc) + ' lost)');
                else if (m.status === 'outside') parts.push('aircraft: OUTSIDE the MAC — write the loss itself');
                else if (m.status === 'no-rule') parts.push('aircraft: no MAC rule yet — your level is recorded as assumed pending the MAC');
            } catch (_) {}
            try {
                var h = hfDerive(c, subs, []);
                if (h.status === 'derived') parts.push('crew level = ' + h.level + ' (Task Analysis: ' + (h.tasks.filter(function (x) { return x.occupancy != null; }).map(function (x) { return x.taskId + ' ' + Math.round(x.occupancy * 100) + '%'; }).join(', ')) + (h.notCompletable ? '; response cannot be completed in the time available' : '') + ')');
                else if (h.status === 'no-task' || h.status === 'no-time') parts.push('crew: no timed crew task yet — your level is recorded as assumed pending the HF workload');
            } catch (_) {}
            if (parts.length) lines.push(c.id + ' — ' + parts.join('; '));
        });
        if (!lines.length) return '';
        return 'DERIVED LEVELS (set by rule from the MAC and the Task Analysis — copy them into effAcLevel / effCrewLevel where given and write the sentences that explain them; judge only the levels not given here, and the occupant axis always): ' + lines.join(' | ') + '.';
    }

    // ---- at accept ----------------------------------------------------------------------
    // s: the drafted row; cond {id, desc, subId} (may be thin); subIds for the MAC; levels: the
    // normalised drafted levels. Returns { levels, derived:{ac,crew,pax}, notes[], assumptions[], escape, mac, hf }.
    function apply(s, cond, subIds, levels) {
        var lv = Object.assign({}, levels || {});
        var out = { levels: lv, derived: { ac: '', crew: '', pax: '' }, notes: [], assumptions: [], escape: null, mac: null, hf: null };
        var phases = _phaseList(s && s.phases);
        var e = applyEscape(Object.assign({}, s || {}, lv), phases);
        out.escape = e;
        if (e.note) out.notes.push(e.note);
        if (e.kind === 'nse') {
            lv.effAcLevel = 'none'; lv.effCrewLevel = 'none'; lv.effPaxLevel = 'none or slight inconvenience';
            out.derived = { ac: 'escape', crew: 'escape', pax: 'escape' };
            return out;
        }
        var m = macDerive(cond, subIds, phases);
        out.mac = m;
        if (m.note) out.notes.push(m.note + ((m.status === 'derived' && lv.effAcLevel && lv.effAcLevel !== m.level) ? ' (drafter proposed ' + lv.effAcLevel + ').' : ''));
        if (m.status === 'derived' && m.level) { lv.effAcLevel = m.level; out.derived.ac = 'MAC'; }
        if (m.assumption) out.assumptions.push({ text: m.assumption, type: 'operational', appliesTo: 'all', _derive: 'mac' });
        var h = hfDerive(cond, subIds, phases);
        out.hf = h;
        if (h.note) out.notes.push(h.note + ((h.status === 'derived' && lv.effCrewLevel && lv.effCrewLevel !== h.level) ? ' (drafter proposed ' + lv.effCrewLevel + ').' : ''));
        if (h.status === 'derived' && h.level) { lv.effCrewLevel = h.level; out.derived.crew = 'HF'; }
        if (h.assumption) out.assumptions.push({ text: h.assumption, type: 'operational', appliesTo: 'all', _derive: 'hf' });
        return out;
    }

    G.SLFhaDerive = { _v: '1.0', ESCAPE_NONE: ESCAPE_NONE, defaultEscape: defaultEscape, escapeOf: escapeOf, phaseEscapes: phaseEscapes, escapesForRow: escapesForRow, escapesPromptText: escapesPromptText, applyEscape: applyEscape,
                      condKind: condKind, lostCount: lostCount, rulesFor: rulesFor, ruleForPhase: ruleForPhase, ruleShape: ruleShape, ruleText: ruleText, macDerive: macDerive,
                      tasksFor: tasksFor, hfDerive: hfDerive, promptFor: promptFor, apply: apply };
})();
