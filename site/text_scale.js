// text_scale.js — v2.2 — "User preferences" top-bar dropdown.
// v2.1: zoom buttons are compact − / + (was "Zoom out" / "Zoom in").
// v2.2: theme row centered to match the zoom row.
// BORN MODULAR: new file behaviour, zero monolith edits.
//
// v2.0: the old sidebar A− / A+ text-size control becomes a top-bar
// "⚙ Preferences" dropdown that houses:
//   · Zoom  — Zoom out / % / Zoom in (the same whole-UI zoom engine, via CSS
//     `zoom` on <body>; persisted; applied before paint so there's no flash).
//   · Theme — the existing light/dark switch (#theme-switch) is RELOCATED into
//     the dropdown (the node is moved, not recreated, so its onchange →
//     toggleThemeEngine wiring stays intact).
// The panel themes itself with the app's own CSS variables (--bg-container,
// --text-primary, --border-primary) so it reads correctly in light and dark.
(function () {
    'use strict';

    var KEY = 'safetyLab.ui.textScale';
    var STEPS = [90, 100, 110, 125, 140, 160];
    var DEFAULT = 100;

    function _get() {
        try { var v = parseInt(localStorage.getItem(KEY) || '', 10); if (STEPS.indexOf(v) >= 0) return v; } catch (_) {}
        return DEFAULT;
    }
    function _apply(pct) {
        try { document.body.style.zoom = (pct / 100).toString(); } catch (_) {}
        var lbl = document.getElementById('txtscale-val');
        if (lbl) lbl.textContent = pct + '%';
    }
    function _set(pct) {
        pct = Math.max(STEPS[0], Math.min(STEPS[STEPS.length - 1], pct));
        try { localStorage.setItem(KEY, String(pct)); } catch (_) {}
        _apply(pct);
    }
    function _step(dir) {
        var cur = _get();
        var i = STEPS.indexOf(cur); if (i < 0) i = STEPS.indexOf(DEFAULT);
        i = Math.max(0, Math.min(STEPS.length - 1, i + dir));
        _set(STEPS[i]);
    }

    // Apply as early as possible (body exists by the time deferred scripts run).
    _apply(_get());

    // -------- dropdown open/close --------
    function _openMenu(open) {
        var menu = document.getElementById('userpref-menu');
        var btn = document.getElementById('userpref-btn');
        if (!menu) return;
        var show = (open == null) ? (menu.style.display === 'none') : open;
        menu.style.display = show ? 'block' : 'none';
        if (btn) btn.setAttribute('aria-expanded', show ? 'true' : 'false');
    }
    document.addEventListener('click', function (e) {
        var wrap = document.getElementById('userpref-wrap');
        if (!wrap) return;
        if (!wrap.contains(e.target)) _openMenu(false);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') _openMenu(false); });

    function _injectControl() {
        if (document.getElementById('userpref-wrap')) return true;
        // Top bar: the export-group holds theme switch / save / sign-in / project menu.
        var host = document.querySelector('.export-group');
        if (!host) return false;

        var BORDER = 'var(--border-primary, rgba(120,120,120,.35))';
        var BG = 'var(--bg-container, #ffffff)';
        var CTL = 'var(--bg-control, transparent)';
        var TXT = 'var(--text-primary, inherit)';
        var TXT2 = 'var(--text-secondary, inherit)';

        var wrap = document.createElement('div');
        wrap.id = 'userpref-wrap';
        wrap.style.cssText = 'position:relative;display:inline-flex;align-items:center;';
        wrap.innerHTML =
            '<button type="button" id="userpref-btn" aria-haspopup="true" aria-expanded="false" title="User preferences — zoom & theme" ' +
                'style="display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;background:' + CTL + ';color:' + TXT + ';border:1px solid ' + BORDER + ';border-radius:8px;cursor:pointer;font-size:12.5px;line-height:1;">' +
                '<span aria-hidden="true">⚙</span><span>Preferences</span><span aria-hidden="true" style="opacity:.7;">▾</span></button>' +
            '<div id="userpref-menu" role="menu" style="display:none;position:absolute;top:calc(100% + 8px);right:0;z-index:4000;min-width:246px;padding:12px 14px;' +
                'background:' + BG + ';color:' + TXT + ';border:1px solid ' + BORDER + ';border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.28);font-size:12.5px;">' +
                '<div style="font-weight:700;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:' + TXT2 + ';margin-bottom:10px;">User preferences</div>' +
                // Zoom
                '<div style="font-weight:600;margin-bottom:6px;">Zoom</div>' +
                '<div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:12px;">' +
                    '<button type="button" id="txtscale-dn" aria-label="Zoom out" title="Zoom out" ' +
                        'style="width:30px;height:28px;border:1px solid ' + BORDER + ';border-radius:6px;background:' + CTL + ';color:' + TXT + ';cursor:pointer;font-size:16px;line-height:1;">−</button>' +
                    '<span id="txtscale-val" style="min-width:42px;text-align:center;font-variant-numeric:tabular-nums;opacity:.9;">' + _get() + '%</span>' +
                    '<button type="button" id="txtscale-up" aria-label="Zoom in" title="Zoom in" ' +
                        'style="width:30px;height:28px;border:1px solid ' + BORDER + ';border-radius:6px;background:' + CTL + ';color:' + TXT + ';cursor:pointer;font-size:16px;line-height:1;">+</button>' +
                '</div>' +
                '<div style="height:1px;background:' + BORDER + ';margin:2px 0 12px;"></div>' +
                // Theme
                '<div style="font-weight:600;margin-bottom:6px;">Theme</div>' +
                '<div id="userpref-theme-slot" style="display:flex;align-items:center;justify-content:center;gap:10px;">' +
                    '<span id="userpref-theme-label" style="color:' + TXT2 + ';">Light / Dark mode</span>' +
                '</div>' +
            '</div>';

        // Insert as the first control in the top-bar group.
        host.insertBefore(wrap, host.firstChild);

        // Relocate the existing theme switch into the dropdown (move the node so
        // its onchange="toggleThemeEngine()" wiring is preserved).
        try {
            var sw = document.getElementById('theme-switch');
            var lbl = sw && sw.closest ? sw.closest('.ds-switch') : null;
            var slot = document.getElementById('userpref-theme-slot');
            if (lbl && slot) slot.insertBefore(lbl, slot.firstChild);
        } catch (_) {}

        document.getElementById('userpref-btn').addEventListener('click', function (e) { e.stopPropagation(); _openMenu(); });
        document.getElementById('txtscale-dn').addEventListener('click', function () { _step(-1); });
        document.getElementById('txtscale-up').addEventListener('click', function () { _step(1); });
        return true;
    }

    function _ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
    _ready(function () {
        var tries = 40;
        var t = setInterval(function () { if (_injectControl() || --tries <= 0) clearInterval(t); }, 200);
    });

    // Keyboard: Ctrl/Cmd + '=' zoom in, Ctrl/Cmd + '-' zoom out, Ctrl/Cmd + '0' reset.
    document.addEventListener('keydown', function (e) {
        if (!(e.ctrlKey || e.metaKey)) return;
        if (e.key === '=' || e.key === '+') { e.preventDefault(); _step(1); }
        else if (e.key === '-' || e.key === '_') { e.preventDefault(); _step(-1); }
        else if (e.key === '0') { e.preventDefault(); _set(DEFAULT); }
    });

    window.setTextScale = _set;
    window.getTextScale = _get;
})();
