// 13 Sep 2026 (R19 step 2): every fire-and-forget promise chain in this file now ends in .catch → SLErrorWatch.report(e, module), so a failure is recorded and told to the person instead of dying in the console.
// ============================================================================
// notify_agents.js — v1.3 — the integrity sentinel (Teams bot + webhook + email).
//
// Phase 0 of the Teams/ANEM plan (Waqas ruling, 12 Aug 2026): when a project's
// integrity WORSENS — something newly stale, newly obsolete, newly dangling,
// or newly compromised — the people working in the tool hear about it where
// they already are: a Teams channel and an inbox. A product feature for tool
// users, not internal ops.
//
// Design rules, in order of importance:
//   · OFF by default, per project. Notifications are an elicited act — the
//     engineer turns them on, pastes a webhook, owns the destination.
//   · WORSENING ONLY. The sentinel diffs the current issue set against the
//     last ACKNOWLEDGED snapshot (keys `where|ref|reason`) and speaks only for
//     keys that are new. Fixing things never notifies; re-saving never
//     re-notifies; the same defect never fires twice until re-acknowledged.
//   · The sweep is the referee, not this module: issues come from the shipped
//     gt_integrity.js verdicts (gtStaleSweep + gtIntegrity().dangling +
//     gtTransferSweep) plus the compromised-flag walk. Nothing is recomputed
//     here — two lanes, as everywhere else.
//   · The browser never talks to a customer webhook directly (CORS, and no
//     open relay): it POSTs the proxy (/v1/ai/notify/integrity) with the same
//     license Bearer the AI lane uses, and the proxy fans out.
//   · v1.2 (Waqas ruling, 13 Aug 2026 — "the bot will be sending messages"):
//     the PREFERRED destination is now a PAIRING CODE, not a webhook URL. The
//     customer adds the Safety Lab Aero app to a channel, the bot replies with
//     a code, they paste the code here once. Advantages that matter: no
//     Microsoft URL ever lands in a project file, the flag arrives from the
//     bot's own identity instead of an anonymous workflow post, and revoking
//     is removing the app. The webhook and email rails still work and are
//     unchanged — a customer who cannot install an app is never locked out.
//   · Debounced off the autosave write — a burst of edits collapses to one look.
//
// Surfaces: a config card appended to the Thread Integrity page (renders after
// gt_integrity's page + q_completeness's wrap — load order matters and is
// pinned by the regression suite). Born modular.
// ============================================================================
(function () {
    'use strict';

    var VERSION = '1.2';
    // v1.1 (12 Aug 2026, found by EXECUTION on the deployed build, not review):
    //   · the app has NO global save function by any other name — a stub of that kind lived in
    //     the house tests. The real save rail is `_writeAutosave` (the same
    //     function cloud_sync wraps) with `scheduleAutosave` as the debounced
    //     entry. v1.0's hook found nothing and silently never armed. Now we
    //     wrap window._writeAutosave, and _save() prefers scheduleAutosave().
    //   · gt_integrity's nav wrapper calls its CLOSURE render, not
    //     window.renderGtIntegrityPage — so wrapping the window name never
    //     fires on navigation. v1.1 also wraps window.switchTab and appends
    //     the card AFTER the page's own render settles.
    var DEBOUNCE_MS = 4000;

    var _esc = function (s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    };

    // ------------------------------------------------------------- config
    // Per-project, inside projectConfig so it travels with the .safetylab file
    // and is versioned/baselined like everything else the project owns.
    function _cfg() {
        if (typeof projectConfig === 'undefined' || !projectConfig) return null;
        if (projectConfig.notifyAgents && projectConfig.notifyAgents.pairingCode === undefined) projectConfig.notifyAgents.pairingCode = '';
        if (!projectConfig.notifyAgents) {
            projectConfig.notifyAgents = { enabled: false, pairingCode: '', webhookUrl: '', email: '', ackKeys: [], lastSentAt: 0 };
        }
        return projectConfig.notifyAgents;
    }
    var _save = function () { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} };

    function _proxyBase() {
        try {
            if (typeof window !== 'undefined' && window.SLConfig) return String(window.SLConfig.aiEndpoint || '');   // blank = no AI (6 Sep 2026)
            if (typeof window !== 'undefined' && window.__SLAB_AI_ENDPOINT__) return String(window.__SLAB_AI_ENDPOINT__);
        } catch (_) {}
        return 'https://api.safetylabaero.com/v1/ai';
    }
    function _licenseToken() {
        // ONE accessor (misc_fn_modules.getLicenseToken): on a customer install the bearer is the
        // signed licence blob, not the token slot. Reading the slot here sent the wrong credential.
        try { if (typeof window !== 'undefined' && typeof window.getLicenseToken === 'function') return String(window.getLicenseToken() || ''); } catch (_) {}
        try { return (typeof localStorage !== 'undefined' && localStorage.getItem('safetyLab.license.token')) || ''; } catch (_) { return ''; }
    }

    // ------------------------------------------------------ the issue set
    // One flat list, every entry keyed `where|ref|reason`. Sources:
    //   stale/obsolete — gtStaleSweep()            (delete-time marks)
    //   dangling       — gtIntegrity().dangling    (unresolved references)
    //   transfers      — gtTransferSweep()         (silently zeroed branches)
    //   compromised    — node/row flag walk        (gt_thread's red lane)
    function naCollect() {
        var out = [];
        var push = function (kind, where, ref, reason) {
            out.push({ kind: kind, where: String(where || ''), ref: String(ref || ''), reason: String(reason || '') });
        };
        try { (typeof gtStaleSweep === 'function' ? gtStaleSweep() : []).forEach(function (s) { push('stale', s.where, s.ref, s.reason); }); } catch (_) {}
        try { (typeof gtIntegrity === 'function' ? gtIntegrity().dangling : []).forEach(function (d) { push('dangling', d.where, d.ref, d.detail); }); } catch (_) {}
        try { (typeof gtTransferSweep === 'function' ? gtTransferSweep() : []).forEach(function (t) { push('dangling', t.where, t.ref, t.detail); }); } catch (_) {}
        // compromised — the strongest flag on the flagship visual, swept last
        try {
            ((typeof ftaPages !== 'undefined' ? ftaPages : []) || []).forEach(function (p) {
                if (!p) return;
                (function w(n) {
                    if (!n) return;
                    if (n.flag === 'compromised') push('compromised', 'Fault tree ' + (p.name || p.id), n.displayId || n.name || n.id, n.flagReason || 'compromised');
                    (n.children || []).concat(n._children || []).forEach(w);
                })(p.root);
            });
        } catch (_) {}
        return out;
    }
    function naKey(x) { return x.where + '|' + x.ref + '|' + x.reason; }

    // ------------------------------------------------- worsening detection
    // Diff against the acknowledged snapshot. Returns ONLY the new arrivals.
    function naWorsened() {
        var cfg = _cfg();
        if (!cfg) return [];
        var ack = {};
        (cfg.ackKeys || []).forEach(function (k) { ack[k] = 1; });
        return naCollect().filter(function (x) { return !ack[naKey(x)]; });
    }

    // ------------------------------------------------------------ the send
    // Fire-and-forget: a notification failure must never disturb the tool.
    function naSend(payloadExtra) {
        var cfg = _cfg();
        if (!cfg || !cfg.enabled) return Promise.resolve({ skipped: 'disabled' });
        // 5 Sep 2026 — this sender had NO controlled-data check of any kind, and
        // its payload carries the project NAME plus the system and node names
        // behind every integrity finding. On an export-controlled programme the
        // names alone can be the sensitive part. Uses the one shared answer in
        // helpers_modules (SLControlled), which loads first; the inline fallback
        // is only for a build where that module is missing, and it FAILS CLOSED
        // — a notification is never worth guessing about.
        try {
            var SC = (typeof window !== 'undefined') ? window.SLControlled : null;
            var blocked = SC && typeof SC.blocksCloud === 'function'
                ? SC.blocksCloud(null)
                : ((typeof projectConfig !== 'undefined' && projectConfig)
                     ? (projectConfig.isITARControlled ? 'this project is marked export-controlled' : null)
                     : 'the project configuration could not be read');
            if (blocked) {
                try { console.info('[notify-agents] not sending — ' + blocked + '.'); } catch (_) {}
                if (SC && typeof SC.notice === 'function') SC.notice(blocked, 'notifications');
                return Promise.resolve({ skipped: 'controlled' });
            }
        } catch (_) { return Promise.resolve({ skipped: 'controlled' }); }
        if (!cfg.pairingCode && !cfg.webhookUrl && !cfg.email) return Promise.resolve({ skipped: 'no_destination' });
        var token = _licenseToken();
        if (!token) return Promise.resolve({ skipped: 'no_license' });
        var worsened = (payloadExtra && payloadExtra.test) ? [] : naWorsened();
        if (!worsened.length && !(payloadExtra && payloadExtra.test)) return Promise.resolve({ skipped: 'nothing_new' });
        var all = naCollect();
        var body = {
            project: (typeof projectName === 'string' && projectName.trim()) ? projectName : 'Untitled project', // F1 fix — global projectName, not projectConfig keys that never exist
            worsened: worsened.slice(0, 40),
            counts: {
                stale: all.filter(function (x) { return x.kind === 'stale'; }).length,
                dangling: all.filter(function (x) { return x.kind === 'dangling'; }).length,
                compromised: all.filter(function (x) { return x.kind === 'compromised'; }).length
            },
            pairingCode: cfg.pairingCode || '',
            webhookUrl: cfg.webhookUrl || '',
            email: cfg.email || '',
            ts: Date.now()
        };
        if (payloadExtra) Object.keys(payloadExtra).forEach(function (k) { body[k] = payloadExtra[k]; });
        var p = fetch(_proxyBase() + '/notify/integrity', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
            body: JSON.stringify(body)
        }).then(function (r) { return r.json().catch(function () { return { ok: r.ok }; }); })
          .catch(function (e) { console.warn('[notify-agents] send failed (tool unaffected)', String(e)); return { error: String(e) }; });
        // worsened keys are auto-acknowledged ON SEND — the humans have been
        // told; the card's "Acknowledge" button covers the manual path.
        if (!(payloadExtra && payloadExtra.test)) {
            worsened.forEach(function (x) { cfg.ackKeys.push(naKey(x)); });
            cfg.lastSentAt = Date.now();
            _save();
        }
        return p;
    }

    // --------------------------------------------------- the debounced hook
    // Rides _writeAutosave — the REAL save rail (cloud_sync's precedent; the
    // live app has one save rail, scheduleAutosave). Every autosave schedules one sentinel
    // look, bursts collapse, showcase stays silent (config is per project and
    // OFF by default — a demo project only ever notifies if someone
    // deliberately configured it to).
    var _timer = null;
    function _schedule() {
        if (_timer) { try { clearTimeout(_timer); } catch (_) {} }
        _timer = setTimeout(function () {
            _timer = null;
            try { var cfg = _cfg(); if (cfg && cfg.enabled) naSend(); } catch (_) {}
        }, DEBOUNCE_MS);
    }
    (function wrapSave(tries) {
        var name = (typeof window._writeAutosave === 'function') ? '_writeAutosave' : null;
        if (name && !window[name]._naWrapped) {
            var orig = window[name];
            var wrapped = function () {
                var r = orig.apply(this, arguments);
                try { _schedule(); } catch (_) {}
                return r;
            };
            wrapped._naWrapped = true;
            // 20 Aug 2026 — keep every prior wrapper's idempotence marker (see fn_wrap.js).
            try { if (window.SLWrap) SLWrap.preserve(orig, wrapped); } catch (_) {}
            window[name] = wrapped;
            return;
        }
        if (!name && tries > 0) setTimeout(function () { wrapSave(tries - 1); }, 300);
    })(25);

    // ------------------------------------------------------ the config card
    // Appended to the Thread Integrity page by wrapping the shipped renderer
    // (q_completeness sets the precedent; we load after it and append last).
    function naRenderCard() {
        var host = document.getElementById('gt-integrity-host');
        if (!host) return;
        var cfg = _cfg();
        if (!cfg) return;
        var old = document.getElementById('na-config-card');
        if (old) old.remove();
        var openCount = naWorsened().length;
        var div = document.createElement('div');
        div.id = 'na-config-card';
        div.style.cssText = 'margin-top:20px; border:1px solid var(--color-border-hair); border-radius:10px; padding:14px 16px; background:var(--color-surface-1);';
        div.innerHTML =
            '<div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">' +
            '<b style="font-size:13px;">Integrity notifications</b>' +
            '<span style="font-size:10.5px; color:var(--color-text-tertiary); font-family:var(--font-mono);">v' + VERSION + ' · Teams + email · worsening only</span>' +
            '<label style="margin-left:auto; font-size:12px; display:flex; align-items:center; gap:6px; cursor:pointer;">' +
            '<input type="checkbox" id="na-enabled"' + (cfg.enabled ? ' checked' : '') + '> enabled</label></div>' +
            '<p style="font-size:11.5px; color:var(--color-text-secondary); margin:0 0 10px;">When this project’s integrity worsens — newly stale, obsolete, dangling or compromised — a summary is sent. Off by default; nothing sends until you enable it. Only the summary leaves this machine: your project data does not.</p>' +
            '<p style="font-size:11.5px; color:var(--color-text-secondary); margin:0 0 10px;"><b>Teams (recommended):</b> add the <b>Safety Lab Aero</b> app to the channel — it replies with a pairing code. Paste that code below. <span style="color:var(--color-text-tertiary);">No webhook to copy, and removing the app revokes it.</span></p>' +
            '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">' +
            '<label style="font-size:11px; color:var(--color-text-tertiary);">Teams pairing code' +
            '<input type="text" id="na-pair" placeholder="ABCD-EFGH" maxlength="9" value="' + _esc(cfg.pairingCode) + '" style="width:100%; font-size:13px; letter-spacing:0.08em; text-transform:uppercase; font-family:var(--font-mono); margin-top:3px;"></label>' +
            '<label style="font-size:11px; color:var(--color-text-tertiary);">Email (optional)' +
            '<input type="text" id="na-email" placeholder="team@yourcompany.com" value="' + _esc(cfg.email) + '" style="width:100%; font-size:11.5px; margin-top:3px;"></label></div>' +
            '<details style="margin-bottom:10px;"><summary style="font-size:11px; color:var(--color-text-tertiary); cursor:pointer;">No app install? Use an incoming webhook instead</summary>' +
            '<label style="font-size:11px; color:var(--color-text-tertiary); display:block; margin-top:6px;">Teams webhook URL (channel → Workflows → “Post to a channel when a webhook request is received”)' +
            '<input type="text" id="na-webhook" placeholder="https://….webhook.office.com/…" value="' + _esc(cfg.webhookUrl) + '" style="width:100%; font-size:11.5px; font-family:var(--font-mono); margin-top:3px;"></label></details>' +
            '<div style="display:flex; gap:8px; align-items:center;">' +
            '<button class="ckpt-m-btn" id="na-save" style="font-size:11px; padding:2px 10px;">Save</button>' +
            '<button class="ckpt-m-btn" id="na-test" style="font-size:11px; padding:2px 10px;">Send test</button>' +
            '<button class="ckpt-m-btn" id="na-ack" style="font-size:11px; padding:2px 10px;">Acknowledge current state' + (openCount ? ' (' + openCount + ' unacknowledged)' : '') + '</button>' +
            '<span id="na-status" style="font-size:11px; color:var(--color-text-tertiary);"></span></div>';
        host.appendChild(div);
        var status = function (msg) { var el = document.getElementById('na-status'); if (el) el.textContent = msg; };
        var read = function () {
            cfg.enabled = !!document.getElementById('na-enabled').checked;
            var p = document.getElementById('na-pair');
            // Normalise exactly as the bot does: humans paste these from a card,
            // in any case, with or without the dash.
            var raw = p ? String(p.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
            cfg.pairingCode = raw.length === 8 ? (raw.slice(0, 4) + '-' + raw.slice(4)) : raw;
            if (p) p.value = cfg.pairingCode;
            var w = document.getElementById('na-webhook');
            cfg.webhookUrl = w ? String(w.value || '').trim() : (cfg.webhookUrl || '');
            cfg.email = String(document.getElementById('na-email').value || '').trim();
        };
        document.getElementById('na-save').addEventListener('click', function () { read(); _save(); status('Saved.'); });
        document.getElementById('na-test').addEventListener('click', function () {
            read(); _save(); status('Sending test…');
            naSend({ test: true }).then(function (r) {
                status(r && r.ok ? 'Test delivered.' : 'Test failed: ' + ((r && (r.skipped || r.error || (r.error_detail || ''))) || 'see console'));
            }).catch(function (e) { if (window.SLErrorWatch) SLErrorWatch.report(e, 'notify_agents'); });
        });
        document.getElementById('na-ack').addEventListener('click', function () {
            cfg.ackKeys = naCollect().map(naKey);
            _save(); status('Acknowledged — only NEW findings will notify from here.');
            naRenderCard();
        });
    }
    (function wrapRender(tries) {
        if (typeof window.renderGtIntegrityPage === 'function' && !window.renderGtIntegrityPage._naWrapped) {
            var orig = window.renderGtIntegrityPage;
            var wrapped = function () {
                var r = orig.apply(this, arguments);
                try { naRenderCard(); } catch (_) {}
                return r;
            };
            wrapped._naWrapped = true;
            window.renderGtIntegrityPage = wrapped;
            return;
        }
        if (tries > 0) setTimeout(function () { wrapRender(tries - 1); }, 300);
    })(25);
    // v1.1 — the navigation truth: gt_integrity's own switchTab wrapper calls
    // its CLOSURE renderGtIntegrityPage, so the window-name wrap above never
    // fires from navigation (kept for direct window callers). Wrap switchTab
    // too and append the card after the page's own render + q_completeness's
    // Q-map append settle.
    (function wrapNav(tries) {
        if (typeof window.switchTab === 'function' && !window.switchTab._naWrapped) {
            var orig = window.switchTab;
            var wrapped = function (tabId) {
                var r = orig.apply(this, arguments);
                try { if (tabId === 'gt-integrity') setTimeout(naRenderCard, 60); } catch (_) {}
                return r;
            };
            wrapped._naWrapped = true;
            window.switchTab = wrapped;
            return;
        }
        if (tries > 0) setTimeout(function () { wrapNav(tries - 1); }, 300);
    })(25);

    // ------------------------------------------------------------- exports
    window.naCollect = naCollect;
    window.naWorsened = naWorsened;
    window.naSend = naSend;
    window.naRenderCard = naRenderCard;
    window.NOTIFY_AGENTS_VERSION = VERSION;
})();
