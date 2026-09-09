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

    // ---- read UI: server change-history panel + chain-integrity check ----
    function _esc(s) {
        if (typeof esc === 'function') { try { return esc(s); } catch (_) {} }
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _fmtTs(t) { try { return t ? new Date(t).toLocaleString() : ''; } catch (_) { return String(t || ''); } }

    // Verify the CHAIN LINKAGE of the fetched rows: rows are newest-first, so walking
    // oldest->newest each row.prev_hash must equal the previous row.row_hash. A deletion,
    // reorder, or insertion anywhere breaks the link. (Full content-hash re-verification is a
    // server-side job — the trigger hashes over Postgres jsonb/timestamptz text — and is exposed
    // separately; this check proves the sequence itself is intact from what the server returned.)
    function _verifyLinkage(rowsNewestFirst) {
        var rows = (rowsNewestFirst || []).slice().reverse();   // oldest -> newest
        for (var i = 1; i < rows.length; i++) {
            if (String(rows[i].prev_hash || '') !== String(rows[i - 1].row_hash || '')) {
                return { ok: false, brokenAt: rows[i].id };
            }
        }
        if (rows.length && String(rows[0].prev_hash || '') !== '' && rows.length) {
            // first fetched row may legitimately have a non-empty prev_hash (older rows exist beyond
            // the fetch window), so we do NOT treat that as a break — only inter-row links are checked.
        }
        return { ok: true, brokenAt: null, n: rows.length };
    }

    async function showHistory() {
        var overlay = document.getElementById('sl-cj-overlay');
        if (overlay) overlay.remove();
        overlay = document.createElement('div');
        overlay.id = 'sl-cj-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:100000;display:flex;align-items:center;justify-content:center;';
        var box = document.createElement('div');
        box.style.cssText = 'background:var(--color-surface-1,#fff);color:var(--color-text-primary,#111);width:min(920px,94vw);max-height:86vh;overflow:auto;border:1px solid var(--color-border-strong,#333);border-radius:9px;box-shadow:0 12px 48px rgba(0,0,0,.35);';
        box.innerHTML =
            '<div style="padding:12px 16px;border-bottom:2px solid var(--color-text-primary,#222);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--color-surface-1,#fff);">' +
            '<b style="font-size:14px;">Change history — server record</b>' +
            '<button id="sl-cj-close" style="font-size:12px;padding:3px 12px;cursor:pointer;">Close</button></div>' +
            '<div id="sl-cj-body" style="padding:14px 16px;font-size:12.5px;color:var(--color-text-secondary,#555);">Loading…</div>';
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
        var closeBtn = box.querySelector('#sl-cj-close'); if (closeBtn) closeBtn.onclick = function () { overlay.remove(); };

        var body = box.querySelector('#sl-cj-body');
        var rows = await fetchJournal(200);
        if (!rows.length) {
            body.innerHTML = '<p style="color:var(--color-text-tertiary,#888);">No server-recorded changes yet for this project. Meaningful actions (edits routed through the workspace log, baselines, sign-offs, problem reports, and engine dispositions) append here once you are signed in on a cloud project.</p>';
            return;
        }
        var link = _verifyLinkage(rows);
        var banner = link.ok
            ? '<div style="padding:8px 12px;border:1px solid #1a8f3c;background:rgba(26,143,60,.08);border-radius:6px;margin-bottom:12px;color:#1a8f3c;font-weight:600;">Chain intact — ' + rows.length + ' record' + (rows.length === 1 ? '' : 's') + ', every link verified. Any deletion or reorder would break it.</div>'
            : '<div style="padding:8px 12px;border:1px solid #c0392b;background:rgba(192,57,43,.08);border-radius:6px;margin-bottom:12px;color:#c0392b;font-weight:600;">CHAIN BROKEN at record #' + _esc(link.brokenAt) + ' — the sequence returned by the server does not link. Investigate.</div>';
        var trs = rows.map(function (r) {
            var ent = (r.entity_kind ? _esc(r.entity_kind) : '') + (r.entity_id ? ' <span class="u-mono" style="color:var(--color-text-tertiary,#999);">' + _esc(r.entity_id) + '</span>' : '');
            var sum = '';
            try { sum = (r.summary && typeof r.summary === 'object') ? _esc(r.summary.text || JSON.stringify(r.summary)) : _esc(r.summary); } catch (_) { sum = ''; }
            return '<tr>' +
                '<td style="padding:5px 8px;border-bottom:1px solid var(--color-border,#e5e7eb);white-space:nowrap;font-size:11px;">' + _esc(_fmtTs(r.ts)) + '</td>' +
                '<td style="padding:5px 8px;border-bottom:1px solid var(--color-border,#e5e7eb);font-size:11px;">' + _esc(r.actor_email || '—') + '</td>' +
                '<td style="padding:5px 8px;border-bottom:1px solid var(--color-border,#e5e7eb);font-weight:600;white-space:nowrap;">' + _esc(r.action) + '</td>' +
                '<td style="padding:5px 8px;border-bottom:1px solid var(--color-border,#e5e7eb);">' + ent + '</td>' +
                '<td style="padding:5px 8px;border-bottom:1px solid var(--color-border,#e5e7eb);">' + sum + '</td>' +
                '</tr>';
        }).join('');
        body.innerHTML = banner +
            '<table style="border-collapse:collapse;width:100%;font-size:12px;">' +
            '<thead><tr>' +
            ['When', 'Who', 'Action', 'Entity', 'Summary'].map(function (h) { return '<th style="text-align:left;padding:5px 8px;border-bottom:2px solid var(--color-text-primary,#333);font-size:10.5px;text-transform:uppercase;color:var(--color-text-tertiary,#777);">' + h + '</th>'; }).join('') +
            '</tr></thead><tbody>' + trs + '</tbody></table>';
    }

    // Inject a launcher into the existing hash-chained journal panel (Thread Integrity tab).
    function _injectLauncher() {
        try {
            var host = document.getElementById('gt-jrnl-panel');
            if (!host || document.getElementById('sl-cj-launch')) return;
            var bar = document.createElement('div');
            bar.style.cssText = 'padding:8px 14px 12px;';
            bar.innerHTML = '<button id="sl-cj-launch" class="ckpt-m-btn" style="font-size:11px;padding:3px 12px;cursor:pointer;">Server change history…</button>' +
                '<span style="font-size:11px;color:var(--color-text-tertiary,#888);margin-left:8px;">Append-only, per-project, server-recorded — attribution and time are set server-side and cannot be edited from the app.</span>';
            host.appendChild(bar);
            var b = bar.querySelector('#sl-cj-launch'); if (b) b.onclick = function () { showHistory(); };
        } catch (_) {}
    }
    function _wrapSwitchTab() {
        try {
            if (typeof window.switchTab !== 'function' || window.switchTab._slCjWrapped) return;
            var orig = window.switchTab;
            var wrapped = function (tabId) {
                var r = orig.apply(this, arguments);
                try { if (tabId === 'gt-integrity') setTimeout(_injectLauncher, 220); } catch (_) {}
                return r;
            };
            wrapped._slCjWrapped = true;
            window.switchTab = wrapped;
        } catch (_) {}
    }
    _wrapSwitchTab();
    setTimeout(_wrapSwitchTab, 1600);   // switchTab may be defined after us

    window.SLJournal = {
        record: record,
        problemEvent: problemEvent,
        fetchJournal: fetchJournal,
        fetchProblemEvents: fetchProblemEvents,
        showHistory: showHistory,
        _verifyLinkage: _verifyLinkage,
        _meaningful: JRNL_MEANINGFUL
    };
})();
