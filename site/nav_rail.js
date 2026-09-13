// ============================================================================
// nav_rail.js — v1.3 — Rev C nav services (15 Aug 2026, Waqas's ruling).
// v1.3 (23 Aug 2026) — SYSTEM FOLDERS. Waqas: "these [PSSA / SSA / FMES /
// Items rows] do not need to be separate menu items they will live in each
// systems directory". Each per-system entry is now a <details> folder carrying
// that system's assessments: SFHA / PSSA / Items open the system workspace on
// the right sub-tab; SSA and FMES open the aircraft-wide rollup pages until
// their per-system views exist. Folder open-state survives the 6s re-render.
// BORN MODULAR: new file, zero monolith edits. Two services on the sidebar:
//
//   1. PER-SYSTEM DIRECTORIES — each system in systemsData gets a rail entry
//      under Analyze > Systems (#asb-sys-dirs) that opens its workspace. The
//      rail is a projection of the model, same doctrine as the plan-gated
//      lanes. Re-rendered on a cheap 6s poll (the crdt_sync cadence) — the
//      list is tiny and diffed by signature, so idle re-renders are no-ops.
//   2. OPEN-STATE PERSISTENCE — every .asb-grp <details> toggle is saved to
//      localStorage and restored on boot, so the rail rests the way each
//      engineer left it. Collapsed-by-default comes from the markup; this
//      only remembers deliberate opens. (openIf auto-expansion still wins
//      for the active tab — persistence never fights navigation.)
//   3. ⌘K PALETTE — ⌘K / Ctrl+K indexes every nav item, every system, and
//      every UNDECLARED lane (labeled, routed to the SPP — it NEVER silently
//      enables a lane; declaring stays a signed act on the plan page). It is
//      SILENT: no rail row, no shortcut hint, no advert of any kind.
//
// v1.1 (23 Aug 2026) — the catalogue residue is DELETED. Waqas removed the
// Catalogue rail entry on 18 Aug ("idea is to simplify the nav not add more
// items") and renderCatalogue() survived as a no-op that boot called and a
// 6-second interval re-called forever, against an empty div the nav IA suite
// was pinning. Adding an affordance to compensate for hiding things is the
// move he rejected; keeping its corpse on a timer is worse. Gone: the slot,
// the function, both call sites, the SL_NAV export and the dead index guard.
//
// Kill switch: window.SL_NAV_RAIL = false. Fault-tolerant throughout: any
// error leaves the static nav exactly as shipped.
// ============================================================================
(function () {
    'use strict';
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    function _on() { try { return window.SL_NAV_RAIL !== false; } catch (_) { return true; } }
    var LS_KEY = 'safetyLab.navOpen.v1';

    // ---- 2 · open-state persistence ---------------------------------------
    function _readOpen() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') || []; } catch (_) { return []; } }
    function _saveOpen() {
        try {
            var ids = [];
            document.querySelectorAll('.asb-nav details.asb-grp[id]').forEach(function (d) { if (d.open) ids.push(d.id); });
            localStorage.setItem(LS_KEY, JSON.stringify(ids));
        } catch (_) {}
    }
    function _restoreOpen() {
        try {
            var want = _readOpen();
            if (!want.length) return;
            want.forEach(function (id) { var d = document.getElementById(id); if (d && d.tagName === 'DETAILS') d.open = true; });
        } catch (_) {}
    }
    function _wirePersistence() {
        try {
            document.querySelectorAll('.asb-nav details.asb-grp').forEach(function (d) {
                if (d._slNavWired) return; d._slNavWired = true;
                d.addEventListener('toggle', _saveOpen);
            });
        } catch (_) {}
    }

    // ---- 1 · per-system directories ---------------------------------------
    var _lastSig = null;
    function _systems() { try { return (typeof systemsData !== 'undefined' && Array.isArray(systemsData)) ? systemsData : (window.systemsData || []); } catch (_) { return []; } }
    function _esc(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function renderSystemDirs() {
        var host = document.getElementById('asb-sys-dirs');
        if (!host) return;
        var sys = _systems();
        // 23 Aug 2026 (2) — folder tree rows REMOVED (Waqas: "remove all the
        // fault trees from the left nav"); trees are picked on the FTA page
        // (fta_tree_picker.js). The signature is systems-only again.
        var sig = sys.map(function (s) { return s.id + ':' + s.name; }).join('|');
        if (sig === _lastSig) return;
        _lastSig = sig;
        if (!sys.length) { host.innerHTML = ''; return; }
        var open = {};
        host.querySelectorAll('details[data-sysdir]').forEach(function (d) { if (d.open) open[d.getAttribute('data-sysdir')] = 1; });
        var KIDS = [
            { k: 'ws:fha',       t: 'SFHA — hazard assessment' },
            { k: 'ws:pssa',      t: 'PSSA — preliminary' },
            { k: 'tab:ssa-page', t: 'SSA — as-built' },
            { k: 'tab:fmes',     t: 'FMES' },
            { k: 'ws:items',     t: 'Items &amp; LRUs' }
        ];
        host.innerHTML = sys.map(function (s) {
            return '<details class="asb-grp asb-nested" data-sysdir="' + _esc(s.id) + '"' + (open[s.id] ? ' open' : '') + '>' +
                '<summary class="asb-item sub" title="' + _esc(s.name) + ' — directory"><span class="asb-lbl">▣ ' + _esc(s.name) + '</span><span class="asb-chev">›</span></summary>' +
                KIDS.map(function (c) {
                    return '<a class="asb-item sub asb-sysdir-kid" role="button" tabindex="0" data-sysgo="' + _esc(s.id) + '|' + c.k + '">' +
                        '<span class="asb-lbl">' + c.t + '</span></a>';
                }).join('') + '</details>';
        }).join('');
        host.querySelectorAll('[data-sysgo]').forEach(function (el) {
            var go = function () {
                var bits = el.getAttribute('data-sysgo').split('|');
                var act = bits[1].split(':');
                try {
                    if (act[0] === 'ws') {
                        if (typeof openSystemWorkspace === 'function') openSystemWorkspace(bits[0]);
                        if (typeof switchWorkspaceTab === 'function') switchWorkspaceTab(act[1]);
                    } else if (typeof switchTab === 'function') switchTab(act[1]);
                } catch (_) {}
            };
            el.addEventListener('click', go);
            el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
        });
    }

    // ---- 3 · ⌘K palette -----------------------------------------------------
    var _pal = null;
    function _buildIndex() {
        var out = [];
        try {
            document.querySelectorAll('.asb-nav .asb-item[id^="snav-"], .asb-nav summary[id^="snav-"]').forEach(function (el) {
                var lbl = el.querySelector('.asb-lbl'); if (!lbl) return;
                var t = lbl.textContent.trim(); if (!t) return;
                out.push({ label: t, kind: 'nav', run: function () { el.click(); } });
            });
        } catch (_) {}
        try {
            _systems().forEach(function (s) {
                out.push({ label: s.name + ' — system workspace', kind: 'sys', run: function () { if (typeof openSystemWorkspace === 'function') openSystemWorkspace(s.id); } });
            });
        } catch (_) {}
        try {
            var PP = window.PROGRAM_PLAN;
            if (PP && PP.CATALOGUE && typeof PP.laneOn === 'function') {
                PP.CATALOGUE.forEach(function (l) {
                    if (PP.laneOn(l.id)) return;
                    out.push({ label: l.name, kind: 'cat', tag: 'in catalog — add via SPP', run: function () { if (typeof switchTab === 'function') switchTab('spp'); } });
                });
            }
        } catch (_) {}
        return out;
    }
    function openPalette() {
        if (!_on()) return;
        closePalette();
        var wrap = document.createElement('div');
        wrap.id = 'sl-nav-palette';
        wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-label', 'Find anything');
        wrap.style.cssText = 'position:fixed;inset:0;background:rgba(8,12,24,.55);z-index:2147483000;display:flex;align-items:flex-start;justify-content:center;padding-top:12vh;';
        var box = document.createElement('div');
        box.style.cssText = 'width:min(560px,92vw);background:var(--color-surface-1,#fff);border:1px solid var(--color-border-strong,#c8cfdd);box-shadow:0 24px 64px rgba(0,0,0,.35);border-radius:var(--r-lg,0);overflow:hidden;';
        var inp = document.createElement('input');
        inp.placeholder = 'Find a page, a system, or a catalog lane…';
        inp.setAttribute('aria-label', 'Search');
        inp.style.cssText = 'width:100%;border:none;border-bottom:1px solid var(--color-border-hair,#e3e7f0);padding:14px 16px;font:inherit;font-size:15px;outline:none;background:transparent;color:inherit;';
        var list = document.createElement('div');
        list.style.cssText = 'max-height:46vh;overflow:auto;';
        box.appendChild(inp); box.appendChild(list); wrap.appendChild(box);
        var idx = _buildIndex(), active = 0, shown = [];
        function paint() {
            var q = inp.value.trim().toLowerCase();
            shown = idx.filter(function (r) { return !q || r.label.toLowerCase().indexOf(q) >= 0; }).slice(0, 12);
            if (active >= shown.length) active = Math.max(0, shown.length - 1);
            list.innerHTML = shown.map(function (r, i) {
                return '<div data-i="' + i + '" style="padding:9px 16px;font-size:13.5px;display:flex;gap:10px;align-items:center;cursor:pointer;' + (i === active ? 'background:var(--color-surface-3,#eef1f7);' : '') + '">' +
                    '<span style="opacity:.5">' + (r.kind === 'sys' ? '▣' : r.kind === 'cat' ? '＋' : '↳') + '</span>' +
                    '<span>' + _esc(r.label) + '</span>' +
                    (r.tag ? '<span style="margin-left:auto;font-size:10.5px;color:#a86a00;border:1px solid #a86a00;padding:1px 7px;white-space:nowrap;">' + _esc(r.tag) + '</span>' : '') + '</div>';
            }).join('') || '<div style="padding:12px 16px;font-size:12.5px;opacity:.6">No matches.</div>';
            list.querySelectorAll('[data-i]').forEach(function (el) {
                el.addEventListener('mouseenter', function () { active = +el.getAttribute('data-i'); paint(); });
                el.addEventListener('click', function () { pick(+el.getAttribute('data-i')); });
            });
        }
        function pick(i) { var r = shown[i]; closePalette(); if (r) { try { r.run(); } catch (_) {} } }
        inp.addEventListener('input', paint);
        inp.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { closePalette(); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, shown.length - 1); paint(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); paint(); }
            else if (e.key === 'Enter') { e.preventDefault(); pick(active); }
        });
        wrap.addEventListener('click', function (e) { if (e.target === wrap) closePalette(); });
        document.body.appendChild(wrap);
        _pal = wrap; paint(); setTimeout(function () { inp.focus(); }, 30);
    }
    function closePalette() { if (_pal) { try { _pal.remove(); } catch (_) {} _pal = null; } }

    // ---- boot ---------------------------------------------------------------
    function boot() {
        if (!_on()) return;
        _restoreOpen(); _wirePersistence();
        renderSystemDirs();
        setInterval(function () { try { renderSystemDirs(); } catch (_) {} }, 6000);
        document.addEventListener('keydown', function (e) {
            if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); if (_pal) closePalette(); else openPalette(); }
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 400); });
    else setTimeout(boot, 400);

    window.SL_NAV = { openPalette: openPalette, closePalette: closePalette, renderSystemDirs: renderSystemDirs };
})();
