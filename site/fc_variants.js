// 13 Sep 2026 (R19 step 3): native alert/confirm/prompt replaced by the app's own dialogs (slAlert/slConfirm/slPrompt) and typed toasts; see tests/regression_native_dialogs.test.js
// ============================================================================
// fc_variants.js — v1.0 — M6: combined & conditioned failure conditions
// (ARP4761A A.3.1, A.8.3–A.8.5). BORN MODULAR: zero monolith edits — injects a
// panel into the AC FHA view by wrapping renderACFHA (mbsa_dashboard pattern)
// and contributes INV-29/INV-30 into the standard invariant sweep.
//
// THE GAP THIS CLOSES: the FHA held single-function FCs only. The standard
// asks for three more first-class citizens:
//   · COMBINED FCs — related functions failing together, usually worse than
//     either alone (A.8.3). Here a combined FC is an ORDINARY acFhaData row
//     (flows through severity, DAL, trees, budgets untouched) carrying
//     combinedOf:[fcId…] + the parents' severities at creation (staleness).
//   · OPERATIONAL conditioning — RTO, rejected landing, diversion, go-around
//     change an FC's effect/severity context (A.8.4).
//   · ENVIRONMENTAL conditioning — icing, HIRF, lightning, bird strike (A.8.5).
//     Both are an eventContext tag {kind, ref} on the existing row.
//
// DETERMINISTIC CANDIDATES: two Cat/Haz FCs on different functions that are
// implemented by at least one COMMON SYSTEM are physically coupled — their
// combination deserves an assessment or a signed "not credible" disposition
// (projectConfig.fcCombDispositions). The couplings come from the existing
// interdependence derivations (_idpSystemsImplementing) — no new judgment.
//
// THE CHECKS (same sweep, same panel as all invariants):
//   INV-29 (hard)     — a combined FC classified LESS severe than its worst
//                       parent. Combination cannot dilute severity.
//   INV-30 (advisory) — coupled Cat/Haz pairs with neither a combined FC nor
//                       a signed disposition; combined FCs whose parents'
//                       severity changed since creation (stale).
//
// v2.0, 30 Oct 2026 (Waqas: "We need to have an AI drafting interface ... the combine failures table under the FHAs",
// "do it the same way we have for all other analyses", "There shouldn't be combo failures proposed initially till
// the user prompts", "We do not guess"):
//   · BOTH LEVELS. The panel sits under the aircraft FHA and under each system's FHA (wrapping renderSysFHA the way
//     renderACFHA is wrapped). A system's combined conditions are rows of that system's FHA, combining that system's
//     conditions only. The coupled-pair candidates stay aircraft-level (they come from the aircraft functions'
//     implementing systems).
//   · ONE WRITER. createCombined(scope, parents, opts) is the only way a combined row is made, by hand (+ Combine FCs)
//     or from an accepted ANEM proposal: two or more distinct conditions of this scope, none itself a combination,
//     no combination of the same set already recorded (nothing is added twice), never milder than its worst part,
//     its FC ID from the programme's numbering scheme. It says why when it refuses.
//   · THE AI BAR. The panel's heading carries the same AI bar as every analysis (lane_ai_bar.js mountSection), whose
//     one action, "Propose combined failure conditions", runs only when pressed. Its proposals open in the standard
//     review panel; every basis a proposal cites is checked against the project before it is shown
//     (ai_assistant.js _combineVerify).
//   · v2.1, 31 Oct 2026 (Waqas: "rationale and reasoning needs to be there"): no combined condition without its
//     reasoning (why the combination carries its class): the writer refuses one, the panel and the FHA table show it.
// ============================================================================
(function () {
    var _sevPill = function (s, o) { return (typeof sevPillHtml === 'function') ? sevPillHtml(s, o) : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }; // severity pill (helpers_modules.js); safe when helpers is not loaded (test sandboxes)
    'use strict';

    function _esc(s) { if (typeof esc === 'function') return esc(s); return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }
    function _fha() { return (typeof acFhaData !== 'undefined' ? acFhaData : []) || []; }
    function _save() { try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {} }
    function _rank(s) { return (typeof SEVERITY_RANK !== 'undefined' ? SEVERITY_RANK[s] : 0) || 0; }
    function _isCatHaz(s) { return /catastrophic|hazardous/i.test(String(s || '')); }
    function _disp() { const pc = _pc(); if (!pc.fcCombDispositions) pc.fcCombDispositions = {}; return pc.fcCombDispositions; }
    function _ask(m, d) { return slPrompt(m, d || ''); }
    // ---- scope: 'ac' (the aircraft FHA) or a system object (that system's FHA) --------------------------------
    function _systems() { return (typeof systemsData !== 'undefined' ? systemsData : null) || []; }
    function _sysById(id) { return _systems().find(s => s && String(s.id) === String(id)) || null; }
    function _scope(x) { if (!x || x === 'ac' || x === 'aircraft') return 'ac'; if (typeof x === 'object') return x; return _sysById(x) || 'ac'; }
    function _rowsOf(scope) { scope = _scope(scope); return scope === 'ac' ? _fha() : ((scope.fha = scope.fha || [])); }
    function _scopeLabel(scope) { scope = _scope(scope); return scope === 'ac' ? 'aircraft FHA' : ((scope.name || scope.id) + ' FHA'); }
    function _activeSys() { try { return (typeof activeSystemId !== 'undefined' && activeSystemId) ? _sysById(activeSystemId) : null; } catch (_) { return null; } }

    const OP_SUGGEST = 'RTO / rejected landing / diversion / go-around / single-engine taxi / ferry';
    const ENV_SUGGEST = 'icing / HIRF / lightning / bird strike / volcanic ash / heavy rain';

    function _pairKey(a, b) { return [String(a), String(b)].sort().join('∧'); }
    function _subsOf(f) { return [f.subId].concat(Array.isArray(f.subIds) ? f.subIds : []).filter(Boolean); }

    // ---- deterministic coupling: FCs sharing an implementing system ----------
    function _implSystemsList(f) {
        const out = [], seen = new Set();
        if (typeof _idpSystemsImplementing !== 'function') return out;
        _subsOf(f).forEach(su => { try { _idpSystemsImplementing(su).forEach(id => { if (!seen.has(id)) { seen.add(id); out.push(id); } }); } catch (_) {} });
        return out;
    }
    // 23 Sep 2026 (perf fix 1) — INDEXED candidate search. The old loop was
    // all-pairs over Cat/Haz FCs and re-derived each FC's implementing systems
    // inside the inner loop (a systems scan per pair); a 100x project hung the
    // FHA tab. Now each FC's systems are derived ONCE (inside one idpIndexBatch,
    // helpers_modules.js), a system -> FC index yields only pairs that really
    // share a system, and the output (pairs, order, shared list) is identical:
    // a-index then b-index, shared in b's system order.
    // See tests/regression_perf_fcv_candidates.test.js.
    function _eligible() {
        return _fha().filter(f => f && !f.deleted && _isCatHaz(f.severity) && !(f.combinedOf && f.combinedOf.length));
    }
    // The pair search proper. Returns pairs as row POSITIONS in _eligible()'s
    // order plus the pair key and shared systems — no row objects, no dispositions.
    function _pairsImpl() {
        const rows = _eligible();
        const covered = new Set();
        _fha().forEach(f => {
            if (f && Array.isArray(f.combinedOf) && f.combinedOf.length >= 2) {
                for (let i = 0; i < f.combinedOf.length; i++) for (let j = i + 1; j < f.combinedOf.length; j++) covered.add(_pairKey(f.combinedOf[i], f.combinedOf[j]));
            }
        });
        const sys = rows.map(_implSystemsList);
        const subs = rows.map(_subsOf);
        const bySys = new Map();
        sys.forEach((list, idx) => list.forEach(id => { let a = bySys.get(id); if (!a) { a = []; bySys.set(id, a); } a.push(idx); }));
        const out = [];
        for (let i = 0; i < rows.length; i++) {
            if (!sys[i].length) continue;
            const si = new Set(sys[i]);
            const js = new Set();
            sys[i].forEach(id => bySys.get(id).forEach(j => { if (j > i) js.add(j); }));
            if (!js.size) continue;
            const subI = subs[i];
            [...js].sort((x, y) => x - y).forEach(j => {
                if (subI.some(s => subs[j].indexOf(s) !== -1)) return;   // same function — that's one FC's own analysis
                const shared = sys[j].filter(x => si.has(x));
                if (!shared.length) return;
                const key = _pairKey(rows[i].fcId, rows[j].fcId);
                if (covered.has(key)) return;
                out.push({ i, j, key, shared });
            });
        }
        return out;
    }
    // 23 Sep 2026 (perf round 2) — the pair list is REMEMBERED, keyed by every
    // input the search reads: each FHA row's fcId, sub-functions, eligibility
    // (Cat/Haz, not deleted, not itself combined) and combinedOf, plus every
    // system's id and function traces (all _idpSystemsImplementing reads).
    // Dispositions are NOT in the key: they are looked up live on every call.
    // A large project can hold 100k+ coupled pairs; an FHA edit that does not
    // touch those inputs (an effect text, a phase, Major -> Minor) no longer
    // repeats the search. See tests/regression_perf_fcv_candidates.test.js.
    let _pairsMemo = null;
    function _pairsKey() {
        const rowsSig = _fha().map(f => f ? [f.fcId, _subsOf(f), (!f.deleted && _isCatHaz(f.severity)) ? 1 : 0, f.combinedOf || null] : null);
        const sysSig = ((typeof systemsData !== 'undefined' ? systemsData : null) || []).map(s => s ? [s.id, (s.functions || []).map(fn => fn ? [fn.traceIds || null, fn.traceId || null] : null)] : null);
        return JSON.stringify([rowsSig, sysSig]);
    }
    function _pairs() {
        let key = null;
        try { key = _pairsKey(); } catch (_) { key = null; }
        if (key !== null && _pairsMemo && _pairsMemo.key === key) return _pairsMemo.pairs;
        const pairs = (typeof idpIndexBatch === 'function') ? idpIndexBatch(_pairsImpl) : _pairsImpl();
        _pairsMemo = key === null ? null : { key, pairs };
        return pairs;
    }
    function combinationCandidates() {
        const rows = _eligible(), disp = _disp();
        return _pairs().map(p => ({ a: rows[p.i], b: rows[p.j], key: p.key, shared: p.shared.slice(), disposition: disp[p.key] || null }));
    }

    // ---- combined-FC bookkeeping ----------------------------------------------
    function combinedRows(scope) { return _rowsOf(scope).filter(f => f && Array.isArray(f.combinedOf) && f.combinedOf.length >= 2); }
    // the row an FC ID names in a scope: its worst-severity row (a condition can have one row per flight phase)
    function _parentOf(fcId, scope) {
        const id = String(fcId == null ? '' : fcId).trim(); if (!id) return null;
        let best = null;
        _rowsOf(scope).forEach(f => { if (f && !f.deleted && String(f.fcId || '').trim() === id && (!best || _rank(f.severity) > _rank(best.severity))) best = f; });
        return best;
    }
    // 31 Oct 2026 (customer checklist item 3): each combined condition checked against the conditions it is made of, every
    // time the panel or the checks run: every part still in this FHA, no part itself a combination, the parts on more
    // than one function, the combination at least as severe as its worst part, each part's class as it was when the
    // combination was assessed, and the reasoning recorded. -> [{ ok, text, hard }]
    function checkCombined(f, scope) {
        const out = [], ids = (f && Array.isArray(f.combinedOf)) ? f.combinedOf.map(String) : [];
        const parts = ids.map(id => ({ id: id, row: _parentOf(id, scope) }));
        const gone = parts.filter(p => !p.row).map(p => p.id);
        out.push(gone.length ? { ok: false, hard: true, text: gone.join(', ') + (gone.length === 1 ? ' is' : ' are') + ' no longer in this FHA' } : { ok: true, text: 'every part is in this FHA' });
        const nested = parts.filter(p => p.row && Array.isArray(p.row.combinedOf) && p.row.combinedOf.length).map(p => p.id);
        if (nested.length) out.push({ ok: false, hard: true, text: nested.join(', ') + ' is itself a combination' });
        const subs = parts.filter(p => p.row).map(p => (_subsOf(p.row)[0] || ''));
        if (subs.length >= 2 && subs.every(x => x && x === subs[0])) out.push({ ok: false, hard: true, text: 'every part belongs to one function (' + subs[0] + '): that is the function\'s FCIM, not a combination' });
        let worst = 0, worstName = '', worstId = '';
        parts.forEach(p => { if (p.row && _rank(p.row.severity) > worst) { worst = _rank(p.row.severity); worstName = p.row.severity; worstId = p.id; } });
        if (worst && _rank(f.severity) < worst) out.push({ ok: false, hard: true, text: 'it is ' + (f.severity || 'not classified') + ', milder than ' + worstId + ' (' + worstName + '): a combination cannot dilute severity (A.8.3)' });
        else if (worst) out.push({ ok: true, text: 'at least as severe as its worst part (' + worstId + ', ' + worstName + ')' });
        const changed = parts.filter(p => p.row && f.parentSevAtCreate && f.parentSevAtCreate[p.id] && f.parentSevAtCreate[p.id] !== p.row.severity);
        out.push(changed.length ? { ok: false, hard: false, text: changed.map(p => p.id + ' was ' + f.parentSevAtCreate[p.id] + ', now ' + p.row.severity).join('; ') + ': re-assess the combination' } : { ok: true, text: 'each part\'s class is as it was when the combination was assessed' });
        out.push(String(f.severityRationale || '').trim() ? { ok: true, text: 'the reasoning is recorded' } : { ok: false, hard: false, text: 'no reasoning recorded for why it is ' + (f.severity || 'classified as it is') });
        return out;
    }
    function combinedIssues(scope) {
        const hard = [], stale = [];
        combinedRows(scope).forEach(f => {
            checkCombined(f, scope).forEach(c => { if (!c.ok && c.hard && !/milder than/.test(c.text)) hard.push(f.fcId + ': ' + c.text); });
            let worst = 0, worstName = '';
            (f.combinedOf || []).forEach(pid => {
                const p = _parentOf(pid, scope);
                if (p && _rank(p.severity) > worst) { worst = _rank(p.severity); worstName = p.severity; }
                if (p && f.parentSevAtCreate && f.parentSevAtCreate[pid] && f.parentSevAtCreate[pid] !== p.severity)
                    stale.push(f.fcId + ': parent ' + pid + ' severity changed ' + f.parentSevAtCreate[pid] + ' → ' + p.severity + ' since the combination was assessed — re-review');
            });
            if (worst && _rank(f.severity) < worst)
                hard.push(f.fcId + ' [' + f.severity + '] is classified LESS severe than its worst parent (' + worstName + ') — combination cannot dilute severity (A.8.3)');
        });
        return { hard, stale };
    }

    // ---- actions ----------------------------------------------------------------
    async function fcvTagContext(internalId) {
        const f = _fha().find(x => String(x.internalId) === String(internalId)); if (!f) return;
        const kind = await _ask('Condition kind: "operational" (' + OP_SUGGEST + ') or "environmental" (' + ENV_SUGGEST + '). Blank clears the tag:', (f.eventContext && f.eventContext.kind) || '');
        if (kind === null) return;
        if (!String(kind).trim()) { delete f.eventContext; _save(); _render(); return; }
        const k = /^env/i.test(kind) ? 'environmental' : 'operational';
        const ref = await _ask('Condition (' + (k === 'operational' ? OP_SUGGEST : ENV_SUGGEST) + '):', (f.eventContext && f.eventContext.ref) || '');
        if (ref === null || !String(ref).trim()) return;
        f.eventContext = { kind: k, ref: String(ref).trim() };
        _save(); _render();
    }
    // ---- the one writer of combined rows ------------------------------------------------------------------------
    function _sameSet(a, b) { if (a.length !== b.length) return false; const x = a.slice().sort().join('|'); return x === b.slice().sort().join('|'); }
    function _sysFuncTraces(scope, subId) {
        if (scope === 'ac') return [subId];
        const fn = (scope.functions || []).find(x => x && String(x.funcId || '') === String(subId));
        const t = fn ? (Array.isArray(fn.traceIds) ? fn.traceIds : (fn.traceId ? [fn.traceId] : [])) : [];
        return t.length ? t : [subId];
    }
    // does a combination of these conditions already exist? (the same set, in any order)
    function findCombined(scope, parentFcIds) {
        const ids = (parentFcIds || []).map(x => String(x).trim()).filter(Boolean);
        return combinedRows(scope).find(f => _sameSet((f.combinedOf || []).map(String), ids)) || null;
    }
    // Create a combined failure condition. opts: { severity, fcDesc, effAc, effCrew, effPax, rationale, differentFunctions,
    // ai: { model, basis } }. Returns { ok:true, row } or { ok:false, why }.
    function createCombined(scope, parentFcIds, opts) {
        opts = opts || {};
        scope = _scope(scope);
        const rows = _rowsOf(scope);
        const ids = [];
        (parentFcIds || []).forEach(x => { const k = String(x == null ? '' : x).trim(); if (k && ids.indexOf(k) < 0) ids.push(k); });
        if (ids.length < 2) return { ok: false, why: 'a combination needs two or more different failure conditions' };
        const parents = ids.map(id => _parentOf(id, scope));
        const missing = ids.filter((id, i) => !parents[i]);
        if (missing.length) return { ok: false, why: missing.join(', ') + (missing.length === 1 ? ' is' : ' are') + ' not a failure condition in the ' + _scopeLabel(scope) };
        const nested = parents.filter(p => Array.isArray(p.combinedOf) && p.combinedOf.length);
        if (nested.length) return { ok: false, why: nested.map(p => p.fcId).join(', ') + ' is itself a combination; combine its parts instead' };
        const dup = findCombined(scope, ids);
        if (dup) return { ok: false, why: 'this combination is already recorded as ' + (dup.fcId || 'a combined condition'), existing: dup };
        if (opts.differentFunctions) {
            const subsets = parents.map(p => _subsOf(p).map(String).sort().join('|'));
            if (subsets.every(x => x && x === subsets[0])) return { ok: false, why: 'all of them belong to one function (' + _subsOf(parents[0])[0] + '); its failure modes are that function\'s FCIM, not a combination' };
        }
        let worst = parents[0];
        parents.forEach(p => { if (_rank(p.severity) > _rank(worst.severity)) worst = p; });
        const sev = String(opts.severity || worst.severity || '').trim();
        if (_rank(sev) < _rank(worst.severity)) return { ok: false, why: 'a combination cannot be milder than its worst part (' + worst.fcId + ' is ' + worst.severity + ')' };
        // 31 Oct 2026 (Waqas: "rationale and reasoning needs to be there"): no combined condition without its reasoning
        if (!String(opts.rationale || '').trim()) return { ok: false, why: 'a combined condition needs its reasoning: why these conditions together are ' + sev + ' (the rationale)' };
        const subIds = [...new Set(parents.flatMap(_subsOf))];
        const sevAt = {}; parents.forEach(p => { sevAt[p.fcId] = p.severity; });
        const row = {
            internalId: 'fcc-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
            fcId: '',
            subId: subIds[0] || '', subIds,
            fcDesc: String(opts.fcDesc || '').trim() || ('Combined: ' + parents.map(p => p.fcDesc || p.fcId).join(' + ')),
            severity: sev,
            phases: [...new Set(parents.flatMap(p => String(p.phases || '').split(/,\s*/)))].filter(Boolean).join(', '),
            effAc: String(opts.effAc || '').trim() || ('Effects of ' + parents.map(p => p.fcId).join(' + ') + ' occurring together.'),
            effCrew: String(opts.effCrew || '').trim(), effPax: String(opts.effPax || '').trim(),
            assumptionIds: [...new Set(parents.flatMap(p => p.assumptionIds || []))], comments: '',
            combinedOf: parents.map(p => p.fcId), parentSevAtCreate: sevAt
        };
        if (scope !== 'ac' && parents.some(p => p.acTrace != null)) { const t = parents.find(p => p.acTrace != null); row.acTrace = t.acTrace; }
        row.severityRationale = String(opts.rationale).trim();
        if (opts.ai) {
            row.aiGenerated = true; row.aiFeature = 'fha.combine'; row.aiModel = opts.ai.model || null; row.aiAt = new Date().toISOString();
            if (opts.ai.skill) row.aiSkill = opts.ai.skill;
            if (Array.isArray(opts.ai.basis)) row.combineBasis = opts.ai.basis.map(b => ({ kind: b.kind, ref: b.ref, text: b.text || '' }));
        }
        // the FC ID from the programme's numbering scheme (the same path as every FHA row); a plain next number otherwise
        try { if (typeof _slAssignFcId === 'function' && window.SafetyLabNumbering && typeof slNumberingScheme !== 'undefined' && slNumberingScheme) _slAssignFcId(row, rows, scope === 'ac' ? null : { SYS: String(scope.id) }); } catch (_) {}
        if (!String(row.fcId || '').trim() || rows.some(f => f && String(f.fcId || '').trim() === String(row.fcId).trim())) {
            const used = new Set(rows.map(f => f && String(f.fcId || '').trim()));
            const pre = scope === 'ac' ? 'FC-C' : (String(scope.id).toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6) + '-FC-C');
            let n = 1; while (used.has(pre + String(n).padStart(2, '0'))) n++;
            row.fcId = pre + String(n).padStart(2, '0');
        }
        rows.push(row);
        _save();
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        _rerender(scope);
        return { ok: true, row };
    }
    function _rerender(scope) {
        scope = _scope(scope);
        try { if (scope === 'ac') { if (typeof renderACFHA === 'function') renderACFHA(); else _render(); } else { const a = _activeSys(); if (a && String(a.id) === String(scope.id) && typeof renderSysFHA === 'function') renderSysFHA(); } } catch (_) {}
    }
    // + Combine FCs, by hand. prefill: "FC-01, FC-03"; sysId: a system's panel (blank: the aircraft)
    async function fcvCombine(prefill, sysId) {
        const scope = sysId ? _scope(sysId) : 'ac';
        const ids = await _ask('Combine failure conditions of the ' + _scopeLabel(scope) + ', comma-separated FC IDs (e.g. FC-01, FC-03):', prefill || '');
        if (!ids) return;
        const list = String(ids).split(/[,\s]+/).filter(Boolean);
        const parents = list.map(id => _parentOf(id, scope));
        if (list.length < 2 || parents.some(p => !p)) { try { showToast('Give two or more FC IDs from the ' + _scopeLabel(scope) + '.', 'warning', 4000); } catch (_) {} return; }
        let worst = parents[0];
        parents.forEach(p => { if (_rank(p.severity) > _rank(worst.severity)) worst = p; });
        const sev = await _ask('Severity of the combined condition (default: its worst part, ' + worst.severity + '). A combination may be worse than its parts, never milder:', worst.severity);
        if (sev === null) return;
        const why = await _ask('Why is this combination ' + (String(sev).trim() || worst.severity) + '? Say what happens when ' + list.join(' and ') + ' occur together (required):', '');
        if (why === null) return;
        if (!String(why).trim()) { try { showToast('Not added: a combined condition needs its reasoning.', 'warning', 5000); } catch (_) {} return; }
        const res = createCombined(scope, list, { severity: String(sev).trim() || worst.severity, rationale: String(why).trim() });
        try {
            if (res.ok) showToast('Combined condition ' + res.row.fcId + ' added. It is an ordinary FHA row: its tree, budget and DAL follow as usual.', 'info', 4500);
            else showToast('Not added: ' + res.why + '.', 'warning', 6000);
        } catch (_) {}
    }
    async function fcvDisposition(key) {
        const d = _disp();
        if (d[key]) {
            const yes = await slConfirm('Clear disposition signed by ' + (d[key].by || '?') + '?', { danger: true, okText: 'Clear' });
            if (yes) { delete d[key]; _save(); _render(); }
            return;
        }
        const by = await _ask('Disposition "' + key + '", sign with your name:', (typeof _signoffReviewerName === 'function' && _signoffReviewerName()) || ''); if (!by || !by.trim()) return;
        const note = await _ask('Basis: why is this combination not credible / already covered?', ''); if (note === null) return;
        d[key] = { by: by.trim(), at: new Date().toISOString(), note: String(note).trim() };
        _save(); _render();
    }

    // ---- render -------------------------------------------------------------------
    const CAND_PAGE = 50;
    let _candLimit = CAND_PAGE;
    function fcvShowMore() { _candLimit += CAND_PAGE; _render(); }
    function _render() { return _renderScope('ac'); }
    function _renderSys() { const s = _activeSys(); if (s) return _renderScope(s); }
    function _renderScope(scope) {
        scope = _scope(scope);
        const isAc = scope === 'ac';
        const view = document.getElementById(isAc ? 'view-ac-fha' : 'ws-view-fha'); if (!view) return;
        const hostId = isAc ? 'fcv-panel' : 'fcv-panel-sys';
        let host = document.getElementById(hostId);
        if (!host) { host = document.createElement('div'); host.id = hostId; host.style.cssText = 'margin-top:18px;'; view.appendChild(host); }
        const sysArg = isAc ? '' : _esc(String(scope.id));
        const combined = combinedRows(scope);
        const tagged = isAc ? _fha().filter(f => f && f.eventContext && f.eventContext.kind) : [];
        // Only the pairs on screen become objects; the counts cover every pair. (Aircraft level only.)
        const pairs = isAc ? _pairs() : [], rowsE = isAc ? _eligible() : [], disp = _disp();
        let openCount = 0;
        const openShown = [], doneShown = [];
        pairs.forEach(p => {
            const d = disp[p.key];
            if (!d) { openCount++; if (openShown.length < _candLimit) openShown.push(p); }
            else if (doneShown.length < _candLimit) doneShown.push(p);
        });
        const toCand = p => ({ a: rowsE[p.i], b: rowsE[p.j], key: p.key, shared: p.shared, disposition: disp[p.key] || null });
        const iss = combinedIssues(scope);

        let html = '<div style="border:1px solid var(--color-border-hair,rgba(0,0,0,.14));border-radius:var(--r-lg,12px);padding:14px 16px;background:var(--color-surface,#fff);">';
        html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px;">' +
            '<strong style="font-size:14px;">' + (isAc ? 'Combined &amp; conditioned failure conditions <span style="font-weight:400;font-size:11.5px;color:var(--color-text-tertiary,#888);">— A.8.3 combinations · A.8.4 operational · A.8.5 environmental</span>' : 'Combined failure conditions · ' + _esc(scope.name || scope.id) + ' <span style="font-weight:400;font-size:11.5px;color:var(--color-text-tertiary,#888);">— ARP4761A A.8.3, this system\'s conditions</span>') + '</strong>' +
            '<span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><span class="fcv-ai-slot slab-ai-section" data-ai-section="fcv" data-ai-scope="' + (isAc ? 'ac' : sysArg) + '"></span><button class="btn-cyan" onclick="fcvCombine(\'\', \'' + sysArg + '\')" style="font-size:12px;">+ Combine FCs</button></span></div>';
        html += '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;margin-bottom:10px;color:var(--color-text-secondary,#666);">' +
            '<span><strong>' + combined.length + '</strong> combined FC(s)</span>' +
            (isAc ? '<span><strong>' + tagged.length + '</strong> conditioned FC(s)</span>' +
            '<span style="color:' + (openCount ? 'var(--color-warning,#b7791f)' : 'var(--color-success,#1a7f37)') + ';"><strong>' + openCount + '</strong> coupled Cat/Haz pair(s) undispositioned</span>' : '') +
            (iss.hard.length ? '<span style="color:var(--color-danger,#b42318);font-weight:600;">' + iss.hard.length + ' combination check(s) failed — INV-29</span>' : '') + '</div>';

        if (combined.length) {
            html += '<div style="font-size:11px;color:var(--color-text-tertiary,#888);margin:6px 0 2px;">COMBINED (ordinary FHA rows — trees/budgets/DAL apply as usual)</div>';
            combined.forEach(f => {
                const basis = (f.severityRationale ? '<div style="font-size:11.5px;margin-top:3px;"><strong>Why ' + _esc(f.severity) + ':</strong> ' + _esc(f.severityRationale) + '</div>' : '<div style="font-size:11.5px;margin-top:3px;color:var(--color-warning,#b26a00);">No reasoning recorded yet: edit the row to add why this combination is ' + _esc(f.severity) + '.</div>') +
                    (f.effAc ? '<div style="font-size:11px;color:var(--color-text-secondary,#666);margin-top:2px;"><strong>Effect together:</strong> ' + _esc(f.effAc) + '</div>' : '') +
                    (Array.isArray(f.combineBasis) && f.combineBasis.length ? '<div style="font-size:11px;color:var(--color-text-tertiary,#888);margin-top:2px;">Basis: ' + _esc(f.combineBasis.map(b => b.text || (b.kind + ' ' + b.ref)).join('; ')) + (f.aiGenerated ? ' · proposed by ANEM, accepted' : '') + '</div>' : '');
                // 31 Oct 2026 (item 3): the parts with their classes, and the check against them
                const _ck = checkCombined(f, scope), _bad = _ck.filter(c => !c.ok);
                const _parts = (f.combinedOf || []).map(id => { const p = _parentOf(id, scope); return '<span data-fcv-part="' + _esc(id) + '">' + _esc(id) + ' ' + (p ? _sevPill(p.severity) : '<span style="color:var(--color-danger,#b42318);">missing</span>') + '</span>'; }).join(' + ');
                const _check = '<div data-fcv-check="' + _esc(f.fcId) + '" style="font-size:11.5px;margin-top:3px;">' + _parts + ' \u2192 ' + _sevPill(f.severity) + ' &nbsp; ' +
                    (_bad.length ? _bad.map(c => '<span style="color:' + (c.hard ? 'var(--color-danger,#b42318)' : 'var(--color-warning,#b26a00)') + ';font-weight:600;">\u26a0 ' + _esc(c.text) + '</span>').join(' &nbsp; ')
                                 : '<span style="color:var(--color-success,#1a7f37);font-weight:600;" title="' + _esc(_ck.map(c => c.text).join('; ')) + '">\u2713 checked against its parts</span>') + '</div>';
                html += '<div style="font-size:12px;padding:4px 0;border-top:1px solid var(--color-border-hair,rgba(0,0,0,.07));"><strong>' + _esc(f.fcId) + '</strong> ' + _sevPill(f.severity) + ' = ' + _esc((f.combinedOf || []).join(' + ')) + ' — ' + _esc(f.fcDesc) + basis + _check + '</div>';
            });
        }
        if (tagged.length) {
            html += '<div style="font-size:11px;color:var(--color-text-tertiary,#888);margin:10px 0 2px;">CONDITIONED</div>';
            tagged.forEach(f => {
                html += '<div style="font-size:12px;padding:4px 0;border-top:1px solid var(--color-border-hair,rgba(0,0,0,.07));"><strong>' + _esc(f.fcId) + '</strong> · <span style="text-transform:uppercase;font-size:10px;letter-spacing:.4px;color:var(--color-text-tertiary,#888);">' + _esc(f.eventContext.kind) + '</span> <strong>' + _esc(f.eventContext.ref) + '</strong> — ' + _esc(f.fcDesc) + ' <a href="#" onclick="fcvTagContext(\'' + _esc(String(f.internalId)) + '\');return false;" style="font-size:11px;color:var(--color-link,#0b57d0);">edit</a></div>';
            });
        }
        if (!combined.length && !isAc) html += '<div style="font-size:12px;color:var(--color-text-tertiary,#888);padding:4px 0;">No combined conditions in this system yet. Combine two of its conditions by hand, or ask ANEM to propose some.</div>';
        if (isAc) html += '<div style="font-size:11px;color:var(--color-text-tertiary,#888);margin:10px 0 2px;">TAG A CONDITION</div>' +
            '<div style="font-size:12px;">' + _fha().filter(f => f && !f.eventContext).slice(0, 200).map(f => '<a href="#" onclick="fcvTagContext(\'' + _esc(String(f.internalId)) + '\');return false;" style="display:inline-block;margin:2px 6px 2px 0;color:var(--color-link,#0b57d0);">' + _esc(f.fcId) + '</a>').join('') + '</div>';

        if (pairs.length) {
            // 23 Sep 2026 (perf fix 1) — undispositioned pairs first, CAND_PAGE at a
            // time with "show more". The counts above and INV-30 still cover ALL pairs.
            const total = pairs.length;
            const shown = openShown.concat(doneShown).slice(0, _candLimit).map(toCand);
            html += '<div style="font-size:11px;color:var(--color-text-tertiary,#888);margin:12px 0 2px;">COUPLED CAT/HAZ PAIRS (share an implementing system — assess the combination or disposition it)' +
                (total > shown.length ? ' · showing ' + shown.length + ' of ' + total + ', undispositioned first' : '') + '</div>';
            shown.forEach(c => {
                html += '<div style="display:flex;gap:8px;align-items:baseline;font-size:12px;padding:5px 0;border-top:1px solid var(--color-border-hair,rgba(0,0,0,.07));">' +
                    '<span style="flex:1;"><strong>' + _esc(c.a.fcId) + '</strong> + <strong>' + _esc(c.b.fcId) + '</strong> <span style="color:var(--color-text-tertiary,#888);">(via ' + _esc(c.shared.join(', ')) + ')</span>' +
                    (c.disposition ? ' <span style="color:var(--color-success,#1a7f37);">✍ ' + _esc(c.disposition.by) + ' — ' + _esc(c.disposition.note || 'dispositioned') + '</span>' : '') + '</span>' +
                    (c.disposition
                        ? '<a href="#" onclick="fcvDisposition(\'' + _esc(c.key) + '\');return false;" style="font-size:11px;color:var(--color-text-tertiary,#888);">clear</a>'
                        : '<a href="#" onclick="fcvCombine(\'' + _esc(c.a.fcId) + ', ' + _esc(c.b.fcId) + '\');return false;" style="font-size:11px;color:var(--color-link,#0b57d0);">combine</a> <a href="#" onclick="fcvDisposition(\'' + _esc(c.key) + '\');return false;" style="font-size:11px;color:var(--color-warning,#b7791f);">disposition</a>') +
                    '</div>';
            });
            if (total > shown.length) {
                html += '<div style="padding:6px 0;border-top:1px solid var(--color-border-hair,rgba(0,0,0,.07));"><a href="#" onclick="fcvShowMore();return false;" style="font-size:12px;color:var(--color-link,#0b57d0);">Show ' + Math.min(CAND_PAGE, total - shown.length) + ' more (' + (total - shown.length) + ' not shown)</a></div>';
            }
        }
        html += '</div>';
        host.innerHTML = html;
        // the standard AI bar, in the panel's heading (lane_ai_bar.js); nothing runs until it is pressed
        try {
            const slot = host.querySelector ? host.querySelector('.fcv-ai-slot') : null;
            if (slot && window.LANE_AI_BAR && typeof window.LANE_AI_BAR.mountSection === 'function') window.LANE_AI_BAR.mountSection(slot, 'fcv', isAc ? { lane: 'aircraft' } : { systemId: String(scope.id), systemName: String(scope.name || scope.id) });
        } catch (_) {}
    }

    // ---- invariants ---------------------------------------------------------------
    (function register() {
        function reg() {
            if (typeof window.invRegister !== 'function') return false;
            window.invRegister({
                id: 'INV-29', name: 'Combined failure conditions are at least as severe as their worst parent', sev: 'hard',
                run: () => {
                    // every level: the aircraft FHA and each system's
                    let checked = combinedRows('ac').length, fails = combinedIssues('ac').hard.slice();
                    _systems().forEach(sy => { if (!sy) return; checked += combinedRows(sy).length; combinedIssues(sy).hard.forEach(m => fails.push((sy.name || sy.id) + ': ' + m)); });
                    return { checked, fails };
                }
            });
            window.invRegister({
                id: 'INV-30', name: 'Coupled Cat/Haz combinations assessed or dispositioned; combined FCs not stale', sev: 'advisory',
                run: () => {
                    // 23 Sep 2026 (perf round 4): counts every pair but writes a message
                    // only for the first ones; invRun keeps the first 10 and the full
                    // count (failCount). A large project can hold 100k+ coupled pairs.
                    const pairs = _pairs(), rowsE = _eligible(), disp = _disp();
                    const SAMPLE = 20;
                    let openCount = 0; const sample = [];
                    pairs.forEach(p => {
                        if (disp[p.key]) return;
                        openCount++;
                        if (sample.length < SAMPLE) sample.push(rowsE[p.i].fcId + ' + ' + rowsE[p.j].fcId + ' share implementing system(s) ' + p.shared.join(', ') + ' — no combined FC, no signed disposition (A.8.3)');
                    });
                    const stale = combinedIssues().stale;
                    return { checked: pairs.length + combinedRows().length, fails: sample.concat(stale), failCount: openCount + stale.length };
                }
            });
            return true;
        }
        if (!reg()) { let tries = 30; const t = setInterval(() => { if (reg() || --tries <= 0) clearInterval(t); }, 250); }
    })();

    // ---- wiring: re-render whenever the AC FHA view renders --------------------------
    function _wrap() {
        if (typeof window.renderACFHA !== 'function' || window.renderACFHA._fcvWrapped) return false;
        const orig = window.renderACFHA;
        const wrapped = function () { const r = orig.apply(this, arguments); if (typeof SLLazy !== 'undefined' && SLLazy.skipped('ac-fha-body')) return r; /* lazy_render.js: the original was deferred, so is this companion */ try { _render(); } catch (_) {} return r; };
        wrapped._fcvWrapped = true;
        window.renderACFHA = wrapped;
        return true;
    }
    function _wrapSys() {
        if (typeof window.renderSysFHA !== 'function' || window.renderSysFHA._fcvWrapped) return !!(window.renderSysFHA && window.renderSysFHA._fcvWrapped);
        const orig = window.renderSysFHA;
        const wrapped = function () { const r = orig.apply(this, arguments); if (typeof SLLazy !== 'undefined' && SLLazy.skipped('sys-fha-body')) return r; /* lazy_render.js: the original was deferred, so is this companion */ try { _renderSys(); } catch (_) {} return r; };
        wrapped._fcvWrapped = true;
        window.renderSysFHA = wrapped;
        return true;
    }
    function _ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
    _ready(function () {
        let tries = 30; const t = setInterval(function () { if (_wrap() || --tries <= 0) clearInterval(t); }, 250); try { _render(); } catch (_) {}
        let triesS = 30; const t2 = setInterval(function () { if (_wrapSys() || --triesS <= 0) clearInterval(t2); }, 250);
    });

    // exports
    window.fcvTagContext = fcvTagContext;
    window.fcvCombine = fcvCombine;
    window.fcvDisposition = fcvDisposition;
    window.fcvCandidates = combinationCandidates;
    window.fcvShowMore = fcvShowMore;
    window._renderFcVariants = _render;
    window._renderFcVariantsSys = _renderSys;
    // 30 Oct 2026 (v2.0): the one writer, and the reads ANEM's proposals are checked against
    window.SLFcVariants = { VERSION: '2.2', checkCombined, createCombined, findCombined, combinedRows, combinedIssues, parentOf: _parentOf, rowsOf: _rowsOf, scope: _scope, subsOf: _subsOf, sysFuncTraces: _sysFuncTraces, implementingSystems: _implSystemsList };
})();
