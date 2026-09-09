// ============================================================================
// change_journal_sync.js — v1.0 — Stage 3 client wiring (9 Sep 2026).
//
// Mirrors the app's MEANINGFUL ACTIONS to the server-side, append-only,
// hash-chained stores built in migration 20260909030000:
//   public.change_journal          — who changed what, when (meaningful acts)
//   public.problem_report_events   — PR lifecycle as a locked event log
//
// The server chain trigger sets actor := auth.uid(), actor_email := the JWT
// email claim, ts := now(), and the per-project hash chain — none of it is
// client-forgeable, and this module never sends any of them. It sends only
// the action / entity / summary. RLS lets a workspace EDITOR insert and a
// MEMBER read; a viewer/outsider insert is refused server-side.
//
// FAIL-SOFT IS ABSOLUTE. A journal write must never block, delay, or throw
// into a real save or edit: every path is wrapped, the insert is
// fire-and-forget (its promise rejection is swallowed), and nothing here is
// awaited by a caller. If the user is signed out, on a demo/showcase project,
// offline, or lacks edit rights, the mirror simply no-ops.
// ============================================================================
(function () {
    'use strict';

    function _client() {
        try { return (typeof getSupabaseClient === 'function') ? getSupabaseClient() : (window.getSupabaseClient ? window.getSupabaseClient() : null); }
        catch (_) { return null; }
    }
    function _proj() {
        try { if (typeof _activeCloudProjectId !== 'undefined' && _activeCloudProjectId) return _activeCloudProjectId; } catch (_) {}
        try { return window._activeCloudProjectId || null; } catch (_) { return null; }
    }
    function _signedIn() {
        try { return !!(typeof _supabaseSession !== 'undefined' && _supabaseSession && _supabaseSession.user); }
        catch (_) { try { return !!(window._supabaseSession && window._supabaseSession.user); } catch (__) { return false; } }
    }
    function _swallow(p) { try { if (p && typeof p.then === 'function') p.then(function () {}, function () {}); } catch (_) {} }

    // Fire-and-forget append of one meaningful action. Never throws, never awaited.
    function record(action, opts) {
        try {
            opts = opts || {};
            var client = _client(), projectId = _proj();
            if (!client || !projectId || !_signedIn() || !action) return;
            var summary = (opts.summary && typeof opts.summary === 'object')
                ? opts.summary
                : { text: String(opts.summary == null ? '' : opts.summary).slice(0, 500) };
            var row = {
                project_id: projectId,
                action: String(action).slice(0, 80),
                entity_kind: opts.entity_kind ? String(opts.entity_kind).slice(0, 60) : null,
                entity_id: (opts.entity_id != null && opts.entity_id !== '') ? String(opts.entity_id).slice(0, 200) : null,
                summary: summary
                // actor, actor_email, ts, prev_hash, row_hash: all server-set by the chain trigger.
            };
            _swallow(client.from('change_journal').insert(row));
        } catch (_) { /* never surface a journaling fault to the caller */ }
    }

    // Fire-and-forget append of one problem-report lifecycle event (opened/updated/resolved/...).
    function problemEvent(reportId, event, payload) {
        try {
            var client = _client(), projectId = _proj();
            if (!client || !projectId || !_signedIn() || !reportId || !event) return;
            var row = {
                project_id: projectId,
                report_id: String(reportId).slice(0, 200),
                event: String(event).slice(0, 40),
                payload: (payload && typeof payload === 'object') ? payload : { text: String(payload == null ? '' : payload) }
            };
            _swallow(client.from('problem_report_events').insert(row));
        } catch (_) {}
    }

    // Read-back (member-read RLS). Newest first. Returns [] on any failure.
    async function fetchJournal(limit) {
        try {
            var client = _client(), projectId = _proj();
            if (!client || !projectId) return [];
            var res = await client.from('change_journal')
                .select('id, actor_email, action, entity_kind, entity_id, summary, ts, prev_hash, row_hash')
                .eq('project_id', projectId)
                .order('id', { ascending: false })
                .limit(Math.max(1, Math.min(500, limit || 100)));
            return (res && res.data) || [];
        } catch (_) { return []; }
    }
    async function fetchProblemEvents(reportId) {
        try {
            var client = _client(), projectId = _proj();
            if (!client || !projectId) return [];
            var q = client.from('problem_report_events')
                .select('id, report_id, event, payload, actor_email, ts, prev_hash, row_hash')
                .eq('project_id', projectId);
            if (reportId) q = q.eq('report_id', String(reportId));
            var res = await q.order('id', { ascending: true });
            return (res && res.data) || [];
        } catch (_) { return []; }
    }

    // ---- mirror the app's own meaningful-action stream (window.jrnl) ----
    // ALLOWLIST — the consequential ENGINEERING acts only, never dev/verification
    // noise (fuzz, self-test, replay-verify, checkpoint, load, compaction).
    var JRNL_MEANINGFUL = {
        'autoreq': 1, 'spf-accept': 1, 'zonal-accept': 1, 'ccf-confirm': 1, 'ccf-bucket': 1,
        'rename': 1, 'bind': 1, 'unbind': 1, 'mac': 1, 'mac-fcim': 1, 'l3-fmea': 1,
        'xmi-import': 1, 'status-back': 1, 'bridge-sync': 1, 'bridge-check': 1,
        'tree-created': 1, 'trade-tree': 1, 'fc-route': 1,
        'baseline': 1, 'baseline-reopen': 1, 'baseline-seal': 1, 'baseline-surgical': 1
    };
    function _wrapJrnl() {
        try {
            if (typeof window.jrnl !== 'function' || window.jrnl._slMirror) return;
            var orig = window.jrnl;
            var wrapped = function (kind, summary) {
                var r = orig.apply(this, arguments);
                try { if (JRNL_MEANINGFUL[String(kind)]) record(String(kind), { summary: { text: String(summary == null ? '' : summary).slice(0, 500) } }); } catch (_) {}
                return r;
            };
            wrapped._slMirror = true;
            window.jrnl = wrapped;
        } catch (_) {}
    }
    _wrapJrnl();
    setTimeout(_wrapJrnl, 1500);   // journal.js may register window.jrnl after us

    window.SLJournal = {
        record: record,
        problemEvent: problemEvent,
        fetchJournal: fetchJournal,
        fetchProblemEvents: fetchProblemEvents,
        _meaningful: JRNL_MEANINGFUL
    };
})();
