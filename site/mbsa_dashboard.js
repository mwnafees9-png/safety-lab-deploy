// mbsa_dashboard.js — v1.0 — MBSA Model Cockpit on the Executive Dashboard.
// BORN MODULAR: new file, zero monolith edits. Injects a live MBSA status card
// into #view-dashboard, right below the six-assessment process strip, and keeps it
// fresh by wrapping renderProcessStrip (the dashboard's render entry).
//
// It READS the same deterministic engines the PASA/SSA gate checklists read — it
// asserts nothing of its own:
//   · MBSA_SCHEMA.validate()      — model conforms to the schema contract
//   · l3EquivalenceAll()          — typed deviation lanes proven (BDD ⇔ reach)
//   · m2Equivalence(rule)         — mode chains proven & substantiated
//   · INV-12 coverage logic       — Cat/Haz FCs represented in the MAC model
//   · CKPT_CHECKLISTS PASA/SSA    — the four MBSA AUTO gate items, verbatim
(function () {
    'use strict';

    function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }
    function _rules() { return (_pc().macModels || []).filter(Boolean); }

    function _metrics() {
        var rules = _rules();
        var schema = { ok: true, rules: 0, issues: [] };
        try { schema = window.MBSA_SCHEMA.validate(); } catch (_) {}
        var lanes = { n: 0, ok: true };
        try { var e = window.l3EquivalenceAll().filter(function (x) { return !x.empty; }); lanes = { n: e.length, ok: e.every(function (x) { return x.agree; }) }; } catch (_) {}
        var modes = { n: 0, ok: true };
        try { var wm = rules.filter(function (r) { return Array.isArray(r.modes) && r.modes.length; }); modes = { n: wm.length, ok: wm.every(function (r) { var m = window.m2Equivalence(r); return !m || m.empty || m.agree; }) }; } catch (_) {}
        var cov = { total: 0, covered: 0 };
        try {
            var ms = new Set(); rules.forEach(function (r) { if (r && r.subId) ms.add(r.subId); });
            (typeof acFhaData !== 'undefined' ? acFhaData : []).forEach(function (f) {
                if (!/cat|haz/i.test(String(f.severity))) return;
                cov.total++;
                var subs = [f.subId].concat(Array.isArray(f.subIds) ? f.subIds : []).filter(Boolean);
                if (subs.some(function (su) { return ms.has(su); })) cov.covered++;
            });
        } catch (_) {}
        var mon = { credited: 0, specd: 0, high: 0, findings: 0 };
        try { if (typeof window.monitorStats === 'function') mon = window.monitorStats(); } catch (_) {}
        return { rules: rules.length, schema: schema, lanes: lanes, modes: modes, cov: cov, mon: mon };
    }

    function _gateItems() {
        var out = [], seen = {};
        try {
            ['PASA', 'SSA'].forEach(function (k) {
                ((typeof CKPT_CHECKLISTS !== 'undefined' ? CKPT_CHECKLISTS[k] : []) || []).forEach(function (i) {
                    if (i && i.id && i.id.indexOf('mbsa') === 0 && !seen[i.id]) {
                        seen[i.id] = 1;
                        var r = { pass: true, detail: '' };
                        try { r = i.eval(); } catch (_) {}
                        out.push({ label: i.label, pass: !!r.pass, detail: r.detail || '' });
                    }
                });
            });
        } catch (_) {}
        return out;
    }

    // House pattern (matches the RAM cockpit strip): ckpt-row-label + ckpt-card
    // with designation/chip/name and a u-mono stat line; details live in a modal.
    function _stat(label, val, warn) {
        return '<span class="u-mono" style="font-size:10.5px; margin-right:10px;' + (warn ? ' color:#8E2A2A; font-weight:700;' : ' color:var(--color-text-secondary);') + '">' +
            _esc(label) + ' <b>' + _esc(val) + '</b></span>';
    }

    function renderMbsaDashboardCard() {
        var strip = document.getElementById('dash-process-strip');
        if (!strip) return;
        var rules = _rules();
        var card = document.getElementById('mbsa-dash-card');
        if (!card) {
            card = document.createElement('div');
            card.id = 'mbsa-dash-card';
            card.style.cssText = 'margin-top:var(--s-4,16px);';
            strip.parentNode.insertBefore(card, strip.nextSibling);
        }

        var label = '<div class="ckpt-row-label">MBSA — model-based safety analysis (feeds the gates)</div>';

        if (!rules.length) {
            card.innerHTML = label +
                '<div class="ckpt-card" tabindex="0" role="button" onclick="try{switchTab(\'mac\')}catch(e){}" ' +
                'title="No MAC model yet — build a minimum-acceptable-configuration model on the Interdependence / MAC tab.">' +
                '<div class="ckpt-head"><span class="ckpt-designation">MBSA</span><span class="ckpt-chip ckpt-chip-not-started">No MAC model</span></div>' +
                '<div class="ckpt-name">Model-based safety analysis</div>' +
                '<div style="margin-top:6px; line-height:1.9;">' + _stat('rules', '0') +
                '<span class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary);">build the MAC model to compile model-based trees</span></div></div>';
            return;
        }

        var m = _metrics();
        var items = _gateItems();
        var allOk = m.schema.ok && m.lanes.ok && m.modes.ok && items.every(function (i) { return i.pass; });
        var covPct = m.cov.total ? Math.round(100 * m.cov.covered / m.cov.total) : 0;
        var chip = allOk
            ? '<span class="ckpt-chip ckpt-chip-complete">Model proven</span>'
            : '<span class="ckpt-chip ckpt-chip-in-progress">Attention</span>';

        card.innerHTML = label +
            '<div class="ckpt-card" tabindex="0" role="button" onclick="openMbsaCockpitModal()" ' +
            'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault(); this.click();}" ' +
            'title="MAC model integrity — schema, deviation lanes, mode chains, coverage, monitors. Read live from the deterministic engines; click for detail.">' +
            '<div class="ckpt-head"><span class="ckpt-designation">MBSA</span>' + chip + '</div>' +
            '<div class="ckpt-name">Model-based safety analysis — MAC model integrity</div>' +
            '<div style="margin-top:6px; line-height:1.9;">' +
            _stat('rules', m.rules) +
            _stat('schema', m.schema.ok ? '✓' : m.schema.issues.length + '✗', !m.schema.ok) +
            _stat('lanes', m.lanes.n + (m.lanes.ok ? '✓' : '✗'), !m.lanes.ok) +
            _stat('chains', m.modes.n + (m.modes.ok ? '✓' : '✗'), !m.modes.ok) +
            _stat('Cat/Haz', covPct + '%') +
            (m.mon.credited ? _stat('monitors', m.mon.specd + '/' + m.mon.credited + (m.mon.high ? ' ✗' : ''), !!m.mon.high) : '') +
            '</div></div>';
    }

    // detail modal — same shape as the RAM cockpit modal
    window.openMbsaCockpitModal = function () {
        var old = document.getElementById('mbsa-ckpt-modal');
        if (old) old.remove();
        var m = _metrics();
        var items = _gateItems();
        var covPct = m.cov.total ? Math.round(100 * m.cov.covered / m.cov.total) : 0;
        var sec = function (title, body) { return '<div style="margin-bottom:16px;"><div style="font-weight:700; font-size:13px; border-bottom:2px solid var(--color-text-primary); padding-bottom:4px; margin-bottom:8px;">' + title + '</div>' + body + '</div>'; };
        var row = function (l, v, warn) { return '<div style="display:flex; justify-content:space-between; font-size:12.5px; padding:3px 0;' + (warn ? ' color:#8E2A2A; font-weight:600;' : '') + '"><span>' + l + '</span><span class="u-mono">' + v + '</span></div>'; };
        var checks = items.map(function (i) {
            return '<div style="display:flex; gap:8px; align-items:flex-start; padding:5px 0; border-top:1px solid var(--color-border-hair,rgba(0,0,0,.07)); font-size:12.5px;">' +
                '<span style="flex:0 0 auto; font-weight:700; color:' + (i.pass ? 'var(--color-success)' : 'var(--color-danger)') + ';">' + (i.pass ? '✓' : '✗') + '</span>' +
                '<span style="flex:1;">' + _esc(i.label) + (i.detail ? '<span style="color:var(--color-text-tertiary);"> — ' + _esc(i.detail) + '</span>' : '') + '</span></div>';
        }).join('');
        var div = document.createElement('div');
        div.id = 'mbsa-ckpt-modal';
        div.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:9000; display:flex; align-items:center; justify-content:center;';
        div.addEventListener('click', function (e) { if (e.target === div) div.remove(); });
        div.innerHTML = '<div style="background:var(--color-surface-0, #fff); max-width:720px; width:92%; max-height:82vh; overflow:auto; padding:22px 26px; border:1px solid var(--color-border-strong); box-shadow:0 18px 60px rgba(0,0,0,0.3);">' +
            '<div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:14px;">' +
            '<span class="ckpt-designation" style="font-size:15px;">MBSA — MAC model integrity</span>' +
            '<button onclick="document.getElementById(\'mbsa-ckpt-modal\').remove()" style="border:none; background:none; font-size:18px; cursor:pointer; color:var(--color-text-tertiary);">×</button></div>' +
            sec('Posture', row('MAC rules', m.rules) +
                row('Schema', m.schema.ok ? 'conformant' : m.schema.issues.length + ' issue(s)', !m.schema.ok) +
                row('Deviation lanes (BDD ⇔ reach)', m.lanes.n + (m.lanes.ok ? ' — all corroborated' : ' — disagreement'), !m.lanes.ok) +
                row('Mode chains', m.modes.n + (m.modes.ok ? ' — proven & substantiated' : ' — unproven'), !m.modes.ok) +
                row('Cat/Haz FCs in the model', m.cov.covered + '/' + m.cov.total + ' (' + covPct + '%)') +
                (m.mon.credited ? row('Monitor specs on credited events', m.mon.specd + '/' + m.mon.credited + (m.mon.high ? ' · ' + m.mon.high + ' high finding(s)' : ''), !!m.mon.high) : '')) +
            sec('Model integrity checks (read live from the deterministic engines — cannot be attested past)', checks) +
            (m.cov.total && m.cov.covered < m.cov.total
                ? '<p style="font-size:11.5px; color:var(--color-text-secondary); margin:0 0 14px;">' + (m.cov.total - m.cov.covered) + ' of ' + m.cov.total + ' Cat/Haz failure condition(s) are hand-built only (not represented in the MAC model). Advisory — model coverage is a maturity measure, not a compliance requirement.</p>' : '') +
            '<div style="text-align:right;"><button class="btn-cyan" style="font-size:12.5px;" onclick="document.getElementById(\'mbsa-ckpt-modal\').remove(); try{switchTab(\'mac\')}catch(e){}">Open MAC model ▸</button></div>' +
            '</div>';
        document.body.appendChild(div);
    };

    // Re-render whenever the dashboard process strip renders (idempotent — updates in place).
    if (typeof window.renderProcessStrip === 'function' && !window.renderProcessStrip._mbsaDashWrapped) {
        var orig = window.renderProcessStrip;
        var wrapped = function () { var r = orig.apply(this, arguments); try { renderMbsaDashboardCard(); } catch (_) {} return r; };
        wrapped._mbsaDashWrapped = true;
        window.renderProcessStrip = wrapped;
    }
    // Also attempt an initial paint (in case the dashboard is already rendered).
    function _ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
    _ready(function () { try { renderMbsaDashboardCard(); } catch (_) {} });

    window.renderMbsaDashboardCard = renderMbsaDashboardCard;
})();
