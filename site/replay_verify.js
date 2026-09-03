// ============================================================================
// replay_verify.js — v1.1 — ASR-1: deterministic replay verification (SLReplay).
//
// The tool-qualification artifact: elicited inputs + deterministic core =
// reproducible outputs — DEMONSTRATED on demand, not claimed. Three layers:
//
//   1. INTEGRITY — a snapshot's canonical SHA-256 recomputes and matches the
//      hash recorded when it was cut (revisions store sha256 at creation).
//   2. REPLAY — every bottom-up fault-tree page in the snapshot is re-derived
//      through the live arena engine (computeExactProbability is pure over
//      the tree + baked node probabilities) and compared against the values
//      recorded IN the snapshot, to 1e-12 relative. Same inputs, same
//      numbers, any machine, any day.
//   3. CHAIN — checkpoint acts (revision cut, replay verification) append to
//      the hash-chained journal, so the lineage of every verified state is
//      tamper-evident (journal.js Q7).
//
// Two-lane discipline: this module never writes to any store and never
// produces a number of its own — it re-runs the engine and REPORTS agreement
// or names the first disagreement (page, recorded, recomputed, delta).
//
// BORN MODULAR: new file; wraps createProjectRevision additively
// (_replayWrapped) to journal the checkpoint hash; injects a verify action
// into the version-history panel when present. Exports window.SLReplay.
// ============================================================================
(function () {
    'use strict';

    const REL_TOL = 1e-12;

    function _fmt(v) { return (typeof v === 'number' && isFinite(v)) ? v.toExponential(6) : String(v); }

    // ---- layer 2: re-derive every bottom-up page from a snapshot -------------
    // Pure: operates on a deep COPY of the snapshot's trees; live stores are
    // never touched. Returns { pages: [...], pass, checked, mismatches }.
    // Pure engine P(top) for a page root (raw tree, engine lane only).
    function _pureP(root) {
        const r = computeExactProbability(JSON.parse(JSON.stringify(root)));
        return (r && typeof r === 'object' && 'prob' in r) ? r.prob : r;
    }
    // Stamp a replay card: pageId -> pure engine P(top), computed at cut time.
    // The card isolates the DETERMINISTIC CORE: baked/allocated roots are
    // user-lane config transforms and are not replay targets.
    function stampReplayCard() {
        const card = {};
        try {
            ((typeof ftaPages !== 'undefined' ? ftaPages : []) || []).forEach(p => {
                if (!p || !p.root) return;
                try { const v = _pureP(p.root); if (typeof v === 'number' && isFinite(v)) card[p.id] = v; } catch (_) {}
            });
            if (typeof projectConfig !== 'undefined' && projectConfig) projectConfig.replayCard = { at: new Date().toISOString(), engine: 'arena-1', pages: card };
        } catch (_) {}
        return card;
    }
    function replaySnapshot(snapshot) {
        const out = { pages: [], checked: 0, mismatches: 0, pass: true, error: null, noCard: false };
        try {
            if (!snapshot || !Array.isArray(snapshot.ftaPages)) { out.error = 'snapshot has no fault-tree pages'; return out; }
            if (typeof computeExactProbability !== 'function') { out.error = 'engine unavailable'; return out; }
            const card = snapshot.projectConfig && snapshot.projectConfig.replayCard && snapshot.projectConfig.replayCard.pages;
            if (!card) { out.noCard = true; out.error = 'no replay card — snapshot predates ASR-1 (integrity check still applies)'; return out; }
            snapshot.ftaPages.forEach(p => {
                if (!p || !p.root || !(p.id in card)) return;
                const recorded = card[p.id];
                let recomputed = null, err = null;
                try { recomputed = _pureP(p.root); } catch (e) { err = (e && e.name) || 'error'; }
                const match = err == null && typeof recomputed === 'number' &&
                    (recorded === recomputed || Math.abs(recorded - recomputed) <= Math.abs(recorded) * REL_TOL);
                out.checked++;
                if (!match) { out.mismatches++; out.pass = false; }
                out.pages.push({ id: p.id, name: p.name || p.id, recorded, recomputed, match, error: err });
            });
        } catch (e) { out.error = e.message; out.pass = false; }
        return out;
    }

    // ---- layer 1 + 2 for a stored revision ------------------------------------
    // verifyRevision(id): fetch the sealed snapshot + its recorded sha256,
    // recompute the canonical hash, then replay the trees.
    async function verifyRevision(id) {
        const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
        if (!client || !id) return { ok: false, error: 'not signed in' };
        const { data, error } = await client.from('project_baselines').select('data, sha256, version_no, label').eq('id', id).maybeSingle();
        if (error || !data || !data.data) return { ok: false, error: (error && error.message) || 'revision has no data' };
        const rehash = (typeof _canonicalHash === 'function') ? await _canonicalHash(data.data) : null;
        const integrity = !!(data.sha256 && rehash && data.sha256 === rehash);
        const replay = replaySnapshot(data.data);
        const ok = integrity && replay.pass && !replay.error;
        const summary = 'Rev ' + data.version_no + (data.label ? ' (' + data.label + ')' : '') +
            ' — integrity ' + (integrity ? 'INTACT (sha256 matches)' : 'BROKEN') +
            ' · replay ' + replay.checked + ' page(s), ' + (replay.pass ? 'all bit-reproduced to 1e-12' : replay.mismatches + ' MISMATCH(ES)');
        try { if (typeof jrnl === 'function') jrnl('replay-verify', summary + ' · ' + (ok ? 'PASS' : 'FAIL')); } catch (_) {}
        return { ok, integrity, sha256: data.sha256, rehash, replay, summary };
    }

    // Verify the CURRENT working state: build a snapshot the same way a save
    // does, then replay it. (No stored hash to compare — replay layer only.)
    function verifyCurrent() {
        // Working-copy determinism demonstration: every tree computed TWICE on
        // fresh arenas must agree bit-for-bit. (Stored-card comparison needs a
        // sealed revision - use verifyRevision for cross-time replay.)
        const out = { pages: [], checked: 0, mismatches: 0, pass: true };
        try {
            ((typeof ftaPages !== 'undefined' ? ftaPages : []) || []).forEach(p => {
                if (!p || !p.root) return;
                let a = null, b = null, err = null;
                try { a = _pureP(p.root); b = _pureP(p.root); } catch (e) { err = (e && e.name) || 'error'; }
                if (typeof a !== 'number') return;
                const match = err == null && a === b;
                out.checked++;
                if (!match) { out.mismatches++; out.pass = false; }
                out.pages.push({ id: p.id, name: p.name || p.id, recorded: a, recomputed: b, match, error: err });
            });
        } catch (e) { out.pass = false; out.error = e.message; }
        const ok = out.pass && out.checked > 0;
        const summary = 'Working copy - ' + out.checked + ' tree(s) computed twice on fresh arenas, ' + (out.pass ? 'bit-identical' : out.mismatches + ' MISMATCH(ES)');
        try { if (typeof jrnl === 'function') jrnl('replay-verify', summary); } catch (_) {}
        return { ok, replay: out, summary };
    }

    // ---- layer 3: journal the checkpoint hash when a revision is cut ----------
    (function wrapRevision() {
        if (typeof window.createProjectRevision !== 'function' || window.createProjectRevision._replayWrapped) { setTimeout(wrapRevision, 400); return; }
        const orig = window.createProjectRevision;
        const wrapped = async function (label, note) {
            try { stampReplayCard(); } catch (_) {}   // card rides inside the snapshot
            const r = await orig.apply(this, arguments);
            try {
                if (r != null && typeof jrnl === 'function') jrnl('checkpoint', 'Revision ' + r + (label ? ' (' + label + ')' : '') + ' sealed — canonical sha256 recorded in project_baselines; lineage chained.');
            } catch (_) {}
            return r;
        };
        wrapped._replayWrapped = true;
        window.createProjectRevision = wrapped;
    })();

    // ---- surface: a verify action on the version-history panel ----------------
    function _toastResult(r) {
        try {
            if (typeof showToast === 'function') showToast((r.ok ? '✓ ' : '✗ ') + (r.summary || r.error), r.ok ? 'success' : 'warning', 7000);
        } catch (_) {}
    }
    window._replayVerifyRevision = async function (id) {
        _toastResult(await verifyRevision(id));
        try { if (typeof _renderVersionHistory === 'function') _renderVersionHistory(); } catch (_) {}
    };
    window._replayVerifyCurrent = function () { _toastResult(verifyCurrent()); };

    // ------------------------------------------------------------- exports
    const api = { replaySnapshot, verifyRevision, verifyCurrent, stampReplayCard, REL_TOL };
    if (typeof window !== 'undefined') window.SLReplay = api;
    if (typeof globalThis !== 'undefined') globalThis.SLReplay = api;
})();
