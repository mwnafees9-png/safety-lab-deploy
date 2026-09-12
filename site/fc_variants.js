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
    async function _ask(m, d) { try { if (typeof slPrompt === 'function') return await slPrompt(m, d || ''); } catch (_) {} return window.prompt(m, d || ''); }

    const OP_SUGGEST = 'RTO / rejected landing / diversion / go-around / single-engine taxi / ferry';
    const ENV_SUGGEST = 'icing / HIRF / lightning / bird strike / volcanic ash / heavy rain';

    function _pairKey(a, b) { return [String(a), String(b)].sort().join('∧'); }
    function _subsOf(f) { return [f.subId].concat(Array.isArray(f.subIds) ? f.subIds : []).filter(Boolean); }

    // ---- deterministic coupling: FCs sharing an implementing system ----------
    function _implSystems(f) {
        const set = new Set();
        if (typeof _idpSystemsImplementing !== 'function') return set;
        _subsOf(f).forEach(su => { try { _idpSystemsImplementing(su).forEach(id => set.add(id)); } catch (_) {} });
        return set;
    }
    function combinationCandidates() {
        const rows = _fha().filter(f => f && !f.deleted && _isCatHaz(f.severity) && !(f.combinedOf && f.combinedOf.length));
        const covered = new Set();
        _fha().forEach(f => {
            if (f && Array.isArray(f.combinedOf) && f.combinedOf.length >= 2) {
                for (let i = 0; i < f.combinedOf.length; i++) for (let j = i + 1; j < f.combinedOf.length; j++) covered.add(_pairKey(f.combinedOf[i], f.combinedOf[j]));
            }
        });
        const disp = _disp();
        const out = [];
        for (let i = 0; i < rows.length; i++) {
            const si = _implSystems(rows[i]);
            if (!si.size) continue;
            for (let j = i + 1; j < rows.length; j++) {
                const a = rows[i], b = rows[j];
                if (_subsOf(a).some(s => _subsOf(b).indexOf(s) !== -1)) continue;   // same function — that's one FC's own analysis
                const shared = [..._implSystems(b)].filter(x => si.has(x));
                if (!shared.length) continue;
                const key = _pairKey(a.fcId, b.fcId);
                if (covered.has(key)) continue;
                out.push({ a, b, key, shared, disposition: disp[key] || null });
            }
        }
        return out;
    }

    // ---- combined-FC bookkeeping ----------------------------------------------
    function combinedRows() { return _fha().filter(f => f && Array.isArray(f.combinedOf) && f.combinedOf.length >= 2); }
    function _parentOf(fcId) { return _fha().find(f => f && f.fcId === fcId) || null; }
    function combinedIssues() {
        const hard = [], stale = [];
        combinedRows().forEach(f => {
            let worst = 0, worstName = '';
            (f.combinedOf || []).forEach(pid => {
                const p = _parentOf(pid);
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
        const kind = await _ask('Condition kind — "operational" (' + OP_SUGGEST + ') or "environmental" (' + ENV_SUGGEST + '). Blank clears the tag:', (f.eventContext && f.eventContext.kind) || '');
        if (kind === null) return;
        if (!String(kind).trim()) { delete f.eventContext; _save(); _render(); return; }
        const k = /^env/i.test(kind) ? 'environmental' : 'operational';
        const ref = await _ask('Condition (' + (k === 'operational' ? OP_SUGGEST : ENV_SUGGEST) + '):', (f.eventContext && f.eventContext.ref) || '');
        if (ref === null || !String(ref).trim()) return;
        f.eventContext = { kind: k, ref: String(ref).trim() };
        _save(); _render();
    }
    async function fcvCombine(prefill) {
        const ids = await _ask('Combine failure conditions — comma-separated FC ids (e.g. FC-01, FC-03):', prefill || '');
        if (!ids) return;
        const parents = String(ids).split(/[,\s]+/).filter(Boolean).map(_parentOf);
        if (parents.length < 2 || parents.some(p => !p)) { try { showToast('Need ≥2 valid FC ids.', 'warn'); } catch (_) {} return; }
        let worst = parents[0];
        parents.forEach(p => { if (_rank(p.severity) > _rank(worst.severity)) worst = p; });
        const sev = await _ask('Severity of the COMBINED condition (default = worst parent, ' + worst.severity + '). Combination may escalate, never dilute:', worst.severity);
        if (sev === null) return;
        const n = _fha().reduce((m, f) => Math.max(m, parseInt(String(f.fcId || '').replace(/\D/g, ''), 10) || 0), 0);
        const subIds = [...new Set(parents.flatMap(_subsOf))];
        const sevAt = {}; parents.forEach(p => { sevAt[p.fcId] = p.severity; });
        _fha().push({
            internalId: 'fcc-' + Date.now(),
            fcId: 'FC-' + String(n + 1).padStart(2, '0'),
            subId: subIds[0] || '', subIds,
            fcDesc: 'Combined: ' + parents.map(p => p.fcDesc).join(' + '),
            severity: String(sev).trim() || worst.severity,
            phases: [...new Set(parents.flatMap(p => String(p.phases || '').split(/,\s*/)))].filter(Boolean).join(', '),
            effAc: 'Combined condition — effects of ' + parents.map(p => p.fcId).join(' + ') + ' occurring together.',
            effCrew: '', effPax: '', assumptionIds: [...new Set(parents.flatMap(p => p.assumptionIds || []))], comments: '',
            combinedOf: parents.map(p => p.fcId), parentSevAtCreate: sevAt
        });
        _save();
        try { if (typeof renderACFHA === 'function') renderACFHA(); } catch (_) {}
        try { showToast('Combined FC created — it is an ordinary FHA row: allocate a tree, budget, DAL as usual.', 'info', 4000); } catch (_) {}
    }
    async function fcvDisposition(key) {
        const d = _disp();
        if (d[key]) {
            const yes = await (typeof slConfirm === 'function' ? slConfirm('Clear disposition signed by ' + (d[key].by || '?') + '?') : Promise.resolve(confirm('Clear?')));
            if (yes) { delete d[key]; _save(); _render(); }
            return;
        }
        const by = await _ask('Disposition "' + key + '" — sign with your name:', (typeof _signoffReviewerName === 'function' && _signoffReviewerName()) || ''); if (!by || !by.trim()) return;
        const note = await _ask('Basis — why is this combination not credible / already covered?', ''); if (note === null) return;
        d[key] = { by: by.trim(), at: new Date().toISOString(), note: String(note).trim() };
        _save(); _render();
    }

    // ---- render -------------------------------------------------------------------
    function _render() {
        const view = document.getElementById('view-ac-fha'); if (!view) return;
        let host = document.getElementById('fcv-panel');
        if (!host) { host = document.createElement('div'); host.id = 'fcv-panel'; host.style.cssText = 'margin-top:18px;'; view.appendChild(host); }
        const combined = combinedRows();
        const tagged = _fha().filter(f => f && f.eventContext && f.eventContext.kind);
        const cands = combinationCandidates();
        const open = cands.filter(c => !c.disposition);
        const iss = combinedIssues();

        let html = '<div style="border:1px solid var(--color-border-hair,rgba(0,0,0,.14));border-radius:var(--r-lg,12px);padding:14px 16px;background:var(--color-surface,#fff);">';
        html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px;">' +
            '<strong style="font-size:14px;">Combined &amp; conditioned failure conditions <span style="font-weight:400;font-size:11.5px;color:var(--color-text-tertiary,#888);">— A.8.3 combinations · A.8.4 operational · A.8.5 environmental</span></strong>' +
            '<span><button class="btn-cyan" onclick="fcvCombine()" style="font-size:12px;">+ Combine FCs</button></span></div>';
        html += '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;margin-bottom:10px;color:var(--color-text-secondary,#666);">' +
            '<span><strong>' + combined.length + '</strong> combined FC(s)</span>' +
            '<span><strong>' + tagged.length + '</strong> conditioned FC(s)</span>' +
            '<span style="color:' + (open.length ? 'var(--color-warning,#b7791f)' : 'var(--color-success,#1a7f37)') + ';"><strong>' + open.length + '</strong> coupled Cat/Haz pair(s) undispositioned</span>' +
            (iss.hard.length ? '<span style="color:var(--color-danger,#b42318);font-weight:600;">' + iss.hard.length + ' severity dilution(s) — INV-29</span>' : '') + '</div>';

        if (combined.length) {
            html += '<div style="font-size:11px;color:var(--color-text-tertiary,#888);margin:6px 0 2px;">COMBINED (ordinary FHA rows — trees/budgets/DAL apply as usual)</div>';
            combined.forEach(f => {
                html += '<div style="font-size:12px;padding:4px 0;border-top:1px solid var(--color-border-hair,rgba(0,0,0,.07));"><strong>' + _esc(f.fcId) + '</strong> ' + _sevPill(f.severity) + ' = ' + _esc((f.combinedOf || []).join(' + ')) + ' — ' + _esc(f.fcDesc) + '</div>';
            });
        }
        if (tagged.length) {
            html += '<div style="font-size:11px;color:var(--color-text-tertiary,#888);margin:10px 0 2px;">CONDITIONED</div>';
            tagged.forEach(f => {
                html += '<div style="font-size:12px;padding:4px 0;border-top:1px solid var(--color-border-hair,rgba(0,0,0,.07));"><strong>' + _esc(f.fcId) + '</strong> · <span style="text-transform:uppercase;font-size:10px;letter-spacing:.4px;color:var(--color-text-tertiary,#888);">' + _esc(f.eventContext.kind) + '</span> <strong>' + _esc(f.eventContext.ref) + '</strong> — ' + _esc(f.fcDesc) + ' <a href="#" onclick="fcvTagContext(\'' + _esc(String(f.internalId)) + '\');return false;" style="font-size:11px;color:var(--color-link,#0b57d0);">edit</a></div>';
            });
        }
        html += '<div style="font-size:11px;color:var(--color-text-tertiary,#888);margin:10px 0 2px;">TAG A CONDITION</div>' +
            '<div style="font-size:12px;">' + _fha().filter(f => f && !f.eventContext).slice(0, 200).map(f => '<a href="#" onclick="fcvTagContext(\'' + _esc(String(f.internalId)) + '\');return false;" style="display:inline-block;margin:2px 6px 2px 0;color:var(--color-link,#0b57d0);">' + _esc(f.fcId) + '</a>').join('') + '</div>';

        if (cands.length) {
            html += '<div style="font-size:11px;color:var(--color-text-tertiary,#888);margin:12px 0 2px;">COUPLED CAT/HAZ PAIRS (share an implementing system — assess the combination or disposition it)</div>';
            cands.forEach(c => {
                html += '<div style="display:flex;gap:8px;align-items:baseline;font-size:12px;padding:5px 0;border-top:1px solid var(--color-border-hair,rgba(0,0,0,.07));">' +
                    '<span style="flex:1;"><strong>' + _esc(c.a.fcId) + '</strong> + <strong>' + _esc(c.b.fcId) + '</strong> <span style="color:var(--color-text-tertiary,#888);">(via ' + _esc(c.shared.join(', ')) + ')</span>' +
                    (c.disposition ? ' <span style="color:var(--color-success,#1a7f37);">✍ ' + _esc(c.disposition.by) + ' — ' + _esc(c.disposition.note || 'dispositioned') + '</span>' : '') + '</span>' +
                    (c.disposition
                        ? '<a href="#" onclick="fcvDisposition(\'' + _esc(c.key) + '\');return false;" style="font-size:11px;color:var(--color-text-tertiary,#888);">clear</a>'
                        : '<a href="#" onclick="fcvCombine(\'' + _esc(c.a.fcId) + ', ' + _esc(c.b.fcId) + '\');return false;" style="font-size:11px;color:var(--color-link,#0b57d0);">combine</a> <a href="#" onclick="fcvDisposition(\'' + _esc(c.key) + '\');return false;" style="font-size:11px;color:var(--color-warning,#b7791f);">disposition</a>') +
                    '</div>';
            });
        }
        html += '</div>';
        host.innerHTML = html;
    }

    // ---- invariants ---------------------------------------------------------------
    (function register() {
        function reg() {
            if (typeof window.invRegister !== 'function') return false;
            window.invRegister({
                id: 'INV-29', name: 'Combined failure conditions are at least as severe as their worst parent', sev: 'hard',
                run: () => { const iss = combinedIssues(); return { checked: combinedRows().length, fails: iss.hard }; }
            });
            window.invRegister({
                id: 'INV-30', name: 'Coupled Cat/Haz combinations assessed or dispositioned; combined FCs not stale', sev: 'advisory',
                run: () => {
                    const cands = combinationCandidates();
                    const open = cands.filter(c => !c.disposition)
                        .map(c => c.a.fcId + ' + ' + c.b.fcId + ' share implementing system(s) ' + c.shared.join(', ') + ' — no combined FC, no signed disposition (A.8.3)');
                    return { checked: cands.length + combinedRows().length, fails: open.concat(combinedIssues().stale) };
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
        const wrapped = function () { const r = orig.apply(this, arguments); try { _render(); } catch (_) {} return r; };
        wrapped._fcvWrapped = true;
        window.renderACFHA = wrapped;
        return true;
    }
    function _ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
    _ready(function () { let tries = 30; const t = setInterval(function () { if (_wrap() || --tries <= 0) clearInterval(t); }, 250); try { _render(); } catch (_) {} });

    // exports
    window.fcvTagContext = fcvTagContext;
    window.fcvCombine = fcvCombine;
    window.fcvDisposition = fcvDisposition;
    window.fcvCandidates = combinationCandidates;
    window._renderFcVariants = _render;
})();
