// ============================================================================
// interdep_ai.js — v1.1 — Phase D gap 4 (D1): the Interdependence AI sweep.
// v1.1 (21 Aug 2026, A10): candidates are system-FUNCTION columns (Q.4-1).
//
// The roadmap's D1 headline: "AI sweep for EMPTY cells only." This module
// implements exactly that discipline:
//
//   · The sweep reads ONLY cells whose state is 'unreviewed' — derived facts,
//     signed assertions, signed clears, and existing proposals are never
//     touched, never re-asked, never overwritten.
//   · Every AI verdict lands as state 'proposed' (dir contributes|clear) with
//     its one-line rationale and model — a dashed amber cell the engineer
//     clicks to ACCEPT (their signature becomes the review) or dismiss.
//   · Proposed cells still count as UNREVIEWED for the PASA B.5 gate — an AI
//     proposal is a pointer, never a review outcome.
//   · Declared assumptions ride the #1b contract into the AI-assumptions
//     ledger (citations machine-verified); every call leaves provenance.
//
// BORN MODULAR: new file; the sweep button is rendered by renderInterdepPage
// (one anchor), everything else lives here.
// ============================================================================
(function () {
    'use strict';

    function _toast(m, k, t) { try { if (typeof showToast === 'function') showToast(m, k || 'info', t || 3000); } catch (_) {} }
    function _parseJson(text) {
        try { return JSON.parse(String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch (_) {}
        try { const m = String(text).match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); } catch (_) {}
        return null;
    }
    // 4 Sep 2026 (F16a) — run 2's sweep made 25 calls and landed NOTHING: with 27 candidate
    // functions per condition the reply outgrew maxTokens 1200 and was cut off mid-JSON, so the
    // parse failed silently. A cut-off reply is now SALVAGED (every complete cell entry before the
    // cut is kept) and REPORTED as a failure, never swallowed.
    function _salvageCells(text) {
        const out = []; const re = /\{\s*"colId"\s*:\s*"([^"]+)"\s*,\s*"contributes"\s*:\s*(true|false)\s*,\s*"why"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
        let m; while ((m = re.exec(String(text || '')))) out.push({ colId: m[1], contributes: m[2] === 'true', why: m[3].replace(/\\"/g, '"') });
        return out;
    }
    function _sweepBudget(nCandidates) { return Math.min(8000, 600 + 110 * Math.max(1, nCandidates)); }   // tokens: ~60 per cell + assumptions
    async function _lane() {
        try { if (typeof window.slLoadAI === 'function') await window.slLoadAI(); } catch (_) {}
        const P = window.SafetyLabAI;
        if (!(P && typeof P.complete === 'function')) { _toast('AI assistant not available — Pro+ with AI enabled is required.', 'warning', 4000); return null; }
        return P;
    }
    function _logAssumptions(list) {
        try {
            if (!Array.isArray(list) || !window.SafetyLabAiAssumptions) return;
            list.forEach(a => {
                if (!a || !a.text) return;
                window.SafetyLabAiAssumptions.add({
                    analysis: 'interdep.sweep', analysisLabel: 'Interdependence', text: String(a.text), type: a.type || 'other',
                    status: 'Open', at: Date.now(),
                    rationale: a.rationale, ifWrong: a.ifWrong || a.if_wrong, usedFor: a.usedFor || a.used_for, citations: a.citations,
                });
            });
        } catch (_) {}
    }
    function _sysContext(s) {
        return {
            sysId: s.id, name: s.name || s.id,
            functions: (s.functions || []).slice(0, 20).map(f => (f.subId || f.funcId || '') + ' ' + (f.subName || f.funcName || '')).filter(x => x.trim()),
            fcSample: (s.fha || []).slice(0, 8).map(f => f.fcId + ' ' + (f.fcDesc || '')),
        };
    }
    const _ASM_CLAUSE = 'In ADDITION, include a top-level "assumptions" array declaring every load-bearing assumption ({"text","type","rationale","ifWrong","usedFor","citations":[{"doc","quote","where"}]}); citation quotes VERBATIM from supplied documents only, [] when unsupported. Return [] if none.';

    const IDP_SWEEP_FC_CAP = 25;   // per run — rerun for the rest, honestly reported

    async function idpAiSweep() {
        if (typeof idpColumns !== 'function' || typeof _idpCellRaw !== 'function' || typeof _idpStore !== 'function' || typeof _idpCellKey !== 'function') { _toast('Interdependence machinery not loaded.', 'error'); return; }
        const fcs = (typeof acFhaData !== 'undefined' && acFhaData) || [];
        const syss = (typeof systemsData !== 'undefined' && systemsData) || [];
        // EMPTY CELLS ONLY — collect per FC.
        const work = [];
        // 21 Aug 2026 (A10) — candidates are FUNCTION columns (Q.4-1). The
        // system-level legacy column is never proposable: a coarse proposal
        // would only mint more coarse data.
        const cols = idpColumns().filter(c => !c.legacy);
        fcs.forEach(fc => {
            if (!fc) return;
            const empty = cols.filter(col => _idpCellRaw(fc, col.colId).state === 'unreviewed');
            if (empty.length) work.push({ fc, empty });
        });
        if (!work.length) { _toast('No empty cells — every FC × system pair is derived, reviewed, or already proposed.', 'info', 3500); return; }
        const P = await _lane(); if (!P) return;
        const batch = work.slice(0, IDP_SWEEP_FC_CAP);
        const skipped = work.length - batch.length;
        _toast('AI sweep: proposing verdicts for ' + batch.reduce((a, w) => a + w.empty.length, 0) + ' empty cell(s) across ' + batch.length + ' FC(s)…' + (skipped ? ' (' + skipped + ' more FC(s) next run)' : ''), 'info', 4000);

        const store = _idpStore();
        let proposedN = 0, calls = 0, failures = 0; const reasons = [];
        for (const wk of batch) {
            const fc = wk.fc;
            const ctx = {
                failureCondition: { fcId: fc.fcId, description: fc.fcDesc, severity: fc.severity, function: fc.subId },
                candidateFunctions: wk.empty.map(col => {
                    const s = (syss.find(x => x && x.id === col.sysId) || { id: col.sysId });
                    return Object.assign({ colId: col.colId, funcId: col.funcId, funcName: col.fnName }, _sysContext(s));
                }),
            };
            let r;
            try {
                calls++;
                r = await P.complete({
                    feature: 'interdep.sweep',
                    system: 'You are screening an aircraft-level Interdependence table (ARP 4761A B.3): for ONE failure condition, judge which candidate SYSTEM FUNCTIONS could CONTRIBUTE to it — by implementing the aircraft function, by malfunction, or by a credible coupling — using ONLY the provided context. These are PROPOSALS an engineer will sign or dismiss; be conservative: when the context genuinely supports neither verdict, mark contributes=true with a why that says the coupling is uncertain (a false "no" hides a hazard; a false "yes" costs a review click). Respond ONLY with JSON {"cells":[{"colId":"…","contributes":true|false,"why":"<at most 20 words, grounded in the provided functions/FCs>"}],"assumptions":[…]} — one entry per candidate function (echo its colId exactly), no extras. Keep every why short: the reply must fit. ' + _ASM_CLAUSE,
                    messages: [{ role: 'user', content: JSON.stringify(ctx, null, 1) }],
                    maxTokens: _sweepBudget(wk.empty.length), temperature: 0,
                });
            } catch (e) { failures++; reasons.push((fc.fcId || fc.internalId) + ': ' + ((e && e.message) || 'call failed')); continue; }
            let j = _parseJson(r && r.text);
            if (!j) {
                const got = _salvageCells(r && r.text);
                failures++; reasons.push((fc.fcId || fc.internalId) + ': reply was not valid JSON' + (got.length ? ' (cut off — ' + got.length + ' complete cell(s) salvaged)' : ''));
                j = { cells: got, assumptions: [] };
            }
            _logAssumptions(j.assumptions);
            try { if (window.AiFidelity && window.AiFidelity.recordProvenance) window.AiFidelity.recordProvenance({ kind: 'draft', feature: 'interdep.sweep', section: fc.fcId || String(fc.internalId), model: (r && r.model) || '' }); } catch (_) {}
            (Array.isArray(j.cells) ? j.cells : []).forEach(c => {
                if (!c || !c.colId) return;
                if (!wk.empty.some(col => String(col.colId) === String(c.colId))) return; // only the cells we asked about
                const key = _idpCellKey(fc.internalId, c.colId);
                if (store.cells[key]) return;                                             // something landed meanwhile — never overwrite
                if (_idpCellRaw(fc, c.colId).state !== 'unreviewed') return;              // a derivation may have appeared — facts win
                store.cells[key] = { state: 'proposed', dir: c.contributes ? 'contributes' : 'clear', why: String(c.why || '').slice(0, 240), model: (r && r.model) || '', at: new Date().toISOString() };
                proposedN++;
            });
        }
        try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
        _toast('Sweep complete — ' + proposedN + ' proposal(s) landed (' + calls + ' call(s)' + (failures ? ', ' + failures + ' failed — ' + reasons[0] : '') + ')' + (skipped ? ' · ' + skipped + ' FC(s) remain — run again' : '') + '. Amber dashed cells await your signature.', failures ? 'warning' : 'success', 8000);
        try { window.__idpSweepLast = { proposed: proposedN, calls: calls, failures: failures, reasons: reasons.slice(0, 25), skipped: skipped, at: new Date().toISOString() }; } catch (_) {}
        try { if (typeof renderInterdepPage === 'function') renderInterdepPage(); } catch (_) {}
    }

    // ------------------------------------------------------------- exports
    window.idpAiSweep = idpAiSweep;
    window.__idpSweepInternals = { _parseJson: _parseJson, _salvageCells: _salvageCells, _sweepBudget: _sweepBudget };
})();
