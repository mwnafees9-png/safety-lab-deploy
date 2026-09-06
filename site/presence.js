// ============================================================================
// presence.js — v1.0 — COL-1: teammate presence (SLPresence).
//
// Multiplayer safety engineering, layer one: WHO is in this project right
// now, WHERE they're working, and — when two people share a fault-tree page —
// each other's live cursor on the canvas. Rides Supabase Realtime's native
// presence on its own channel (slab-presence:<ws>:<proj>), separate from the
// CRDT doc channel; cursor positions stream as throttled broadcasts in WORLD
// coordinates (rendered inside the zoom group, so every peer sees them in
// their own viewport correctly).
//
// Identity is never color-alone: every marker and avatar carries the name.
// Display lane only: nothing here writes to any store; presence is ephemeral
// by construction (Supabase drops it when the socket dies).
//
// Guards: signed-in + active cloud project + NOT ITAR-controlled; opt-out via
// ?presence=0 or localStorage SLA_PRESENCE='0'. Everything try/caught.
//
// BORN MODULAR: new file; wraps switchTab additively (_presWrapped); injects
// an avatar strip (#pres-strip) beside the save indicator area. Exports
// window.SLPresence.
// ============================================================================
(function () {
    'use strict';

    // Fixed categorical palette (assigned by stable hash, never cycled).
    const COLORS = ['#0A63CC', '#B34700', '#1B7F4B', '#7C3AED', '#B3005E', '#00707E'];
    const CURSOR_MS = 150;      // cursor stream throttle
    let _chan = null, _state = {}, _tok = null, _lastCur = 0, _started = false;

    function _flagOff() {
        try {
            if (/[?&]presence=0/.test(location.search)) return true;
            if (localStorage.getItem('SLA_PRESENCE') === '0') return true;
        } catch (_) {}
        return false;
    }
    // 5 Sep 2026 — same dead fence as crdt_sync.js, same cause and same fix.
    // `window.projectConfig` is permanently undefined (top-level `let` lives in
    // the global lexical environment, not on window), so this returned false for
    // every project and presence ran on ITAR projects. Reads through SLEnv, no
    // eval (CSP), and FAILS CLOSED when the accessor is unavailable.
    function _itar() {
      try {
        // Order matters. SLEnv is the supported accessor and the only one that
        // works in every build. The BARE IDENTIFIER is the real variable — these
        // are classic scripts sharing one global lexical scope, which is exactly
        // why `window.projectConfig` was always undefined — and `typeof` guards it
        // without eval (the production CSP blocks eval; that is what hollowed out
        // lock_seal.js). If NEITHER is reachable we treat the project as
        // controlled and stay out: fail-open is defensible for an outage and
        // indefensible for a controlled-data fence.
        var E = (typeof SLEnv !== 'undefined') ? SLEnv : (typeof window !== 'undefined' ? window.SLEnv : null);
        if (E && typeof E.get === 'function') {
          var pc = E.get('projectConfig');
          if (pc !== undefined) return !!(pc && pc.isITARControlled);
        }
        if (typeof projectConfig !== 'undefined') {
          return !!(projectConfig && projectConfig.isITARControlled);
        }
        return true;                                              // fail CLOSED
      } catch (_) { return true; }                                // fail CLOSED
    }
    function _proj() { try { return (typeof getActiveCloudProjectId === 'function' && getActiveCloudProjectId()) || window._activeCloudProjectId || null; } catch (_) { return null; } }
    function _ws() { try { return (typeof getActiveWorkspaceId === 'function' && getActiveWorkspaceId()) || null; } catch (_) { return null; } }
    function _me() {
        try {
            const s = window._supabaseSession;
            const email = s && s.user && s.user.email;
            return (email || 'engineer').split('@')[0];
        } catch (_) { return 'engineer'; }
    }
    function _colorFor(tok) {
        let h = 0; const s = String(tok || '');
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
        return COLORS[Math.abs(h) % COLORS.length];
    }
    function _here() {
        let tab = null;
        try { const a = document.querySelector('.asb-item.active'); tab = a ? (a.querySelector('.asb-lbl') || {}).textContent : null; } catch (_) {}
        return { name: _me(), tok: _tok, tab: tab || 'working', pageId: (typeof activeFTAPageId !== 'undefined' ? activeFTAPageId : null), at: Date.now() };
    }

    // ---- avatar strip ----------------------------------------------------------
    function _renderStrip() {
        try {
            let strip = document.getElementById('pres-strip');
            const peers = Object.values(_state).flat().filter(p => p.tok !== _tok);
            if (!peers.length) { if (strip) strip.style.display = 'none'; return; }
            if (!strip) {
                strip = document.createElement('div');
                strip.id = 'pres-strip';
                strip.style.cssText = 'position:fixed; top:10px; right:190px; z-index:9000; display:flex; gap:6px; align-items:center;';
                document.body.appendChild(strip);
            }
            strip.style.display = 'flex';
            strip.innerHTML = peers.slice(0, 6).map(p => {
                const c = _colorFor(p.tok);
                return '<span title="' + String(p.name).replace(/"/g, '') + ' — ' + String(p.tab).replace(/"/g, '') + '" ' +
                    'style="display:inline-flex; align-items:center; gap:5px; padding:3px 9px; font-size:11px; font-weight:700; border-radius:999px; ' +
                    'background:var(--color-surface-1,#fff); border:1.5px solid ' + c + '; color:' + c + ';">' +
                    '<span style="width:7px; height:7px; border-radius:50%; background:' + c + ';"></span>' +
                    String(p.name).slice(0, 14) + '</span>';
            }).join('') + (peers.length > 6 ? '<span style="font-size:11px;">+' + (peers.length - 6) + '</span>' : '');
        } catch (_) {}
    }

    // ---- live cursors on a shared FTA page --------------------------------------
    function _g() { try { return document.querySelector('#fta-svg g'); } catch (_) { return null; } }
    function _renderCursor(p) {
        try {
            const g = _g();
            if (!g || p.pageId !== (typeof activeFTAPageId !== 'undefined' ? activeFTAPageId : null)) return;
            const NS = 'http://www.w3.org/2000/svg';
            let el = g.querySelector('[data-pres="' + p.tok + '"]');
            if (!el) {
                el = document.createElementNS(NS, 'g');
                el.setAttribute('data-pres', p.tok);
                el.setAttribute('pointer-events', 'none');
                const c = _colorFor(p.tok);
                el.innerHTML = '<circle r="5" fill="' + c + '" stroke="#fff" stroke-width="1.5"></circle>' +
                    '<text y="-9" text-anchor="middle" font-size="10" font-weight="700" fill="' + c + '" style="paint-order:stroke; stroke:#fff; stroke-width:3px;">' + String(p.name).slice(0, 14) + '</text>';
                g.appendChild(el);
            }
            el.setAttribute('transform', 'translate(' + (+p.x || 0) + ',' + (+p.y || 0) + ')');
            clearTimeout(el._fade);
            el._fade = setTimeout(() => { try { el.remove(); } catch (_) {} }, 6000);   // stale cursors fade
        } catch (_) {}
    }
    function _wireCursorStream() {
        try {
            const host = document.getElementById('fta-svg');
            if (!host || host._presWired) return;
            host._presWired = true;
            host.addEventListener('mousemove', function (ev) {
                const now = Date.now();
                if (now - _lastCur < CURSOR_MS || !_chan) return;
                _lastCur = now;
                try {
                    const g = _g();
                    if (!g || typeof d3 === 'undefined') return;
                    const t = d3.zoomTransform(g.parentNode);          // world coords: peers render in their own viewport
                    const r = host.getBoundingClientRect();
                    const wx = (ev.clientX - r.left - t.x) / t.k, wy = (ev.clientY - r.top - t.y) / t.k;
                    _chan.send({ type: 'broadcast', event: 'cursor', payload: Object.assign(_here(), { x: wx, y: wy }) });
                } catch (_) {}
            });
        } catch (_) {}
    }

    // ---- lifecycle ----------------------------------------------------------------
    function start() {
        if (_started || _flagOff() || _itar()) return;
        let client = null;
        try { client = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null; } catch (_) {}
        const ws = _ws(), proj = _proj();
        if (!client || !ws || !proj) { setTimeout(start, 4000); return; }
        _tok = (crypto.randomUUID ? crypto.randomUUID() : 'p' + Math.random().toString(36).slice(2)).slice(0, 8);
        _chan = client.channel('slab-presence:' + ws + ':' + proj, { config: { presence: { key: _tok } } });
        _chan.on('presence', { event: 'sync' }, function () {
            try { _state = _chan.presenceState(); } catch (_) { _state = {}; }
            _renderStrip();
        });
        _chan.on('broadcast', { event: 'cursor' }, function (m) { if (m && m.payload && m.payload.tok !== _tok) _renderCursor(m.payload); });
        _chan.subscribe(function (status) {
            if (status === 'SUBSCRIBED') { try { _chan.track(_here()); } catch (_) {} }
        });
        _started = true;
        _wireCursorStream();
    }
    function _retrack() { try { if (_chan) _chan.track(_here()); } catch (_) {} }

    (function wrapSwitchTab() {
        if (typeof window.switchTab !== 'function' || window.switchTab._presWrapped) { setTimeout(wrapSwitchTab, 300); return; }
        const orig = window.switchTab;
        const wrapped = function () {
            const r = orig.apply(this, arguments);
            try { _retrack(); _wireCursorStream(); } catch (_) {}
            return r;
        };
        wrapped._presWrapped = true;
        window.switchTab = wrapped;
    })();

    function _ready(fn) { if (typeof document === 'undefined') return; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
    _ready(function () { setTimeout(start, 3000); });   // after auth + project resolve

    // ------------------------------------------------------------- exports
    const api = { start, _here, _colorFor, _renderCursor, _renderStrip, peers: () => Object.values(_state).flat().filter(p => p.tok !== _tok), COLORS };
    if (typeof window !== 'undefined') window.SLPresence = api;
    if (typeof globalThis !== 'undefined') globalThis.SLPresence = api;
})();
