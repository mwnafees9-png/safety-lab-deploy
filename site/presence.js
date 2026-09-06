// ============================================================================
// presence.js — v2.0 — COL-1: teammate presence (SLPresence) + the shared avatar (SLAvatar).
//
// 2.0 (6 Sep 2026, Waqas): people show as ROUND AVATARS — two initials (first + last) or
// their own picture — INLINE in the top bar at the same height as the buttons, to the
// left of Preferences, like the people bubbles in Office. Full name (and where they are
// working) on hover. Overlapping, "+N" past five. One bubble per PERSON (two tabs of the
// same account collapse). NO anonymous bubbles: a session with no signed-in name is never
// tracked and never shown (the "engineer" pill is gone). Identity comes from the account:
// user_metadata.full_name / avatar (a small picture the person uploads in the Account
// panel; it lives on the account in whichever backend the install uses — never on our
// cloud for a customer install).
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
    // ---- identity + the shared avatar --------------------------------------------
    function _lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } }
    function _identity() {
        try {
            const s = window._supabaseSession;
            const u = s && s.user;
            const email = String((u && u.email) || '').trim().toLowerCase();
            if (!email) return null;                                   // no account → no presence, no bubble
            const meta = (u && u.user_metadata) || {};
            const name = String(meta.full_name || _lsGet('safetyLab.signup.name') || email.split('@')[0]).trim();
            const avatar = String(meta.avatar || _lsGet('safetyLab.profile.avatar') || '');
            return { name, email, initials: initialsOf(name), avatar: /^data:image\//.test(avatar) && avatar.length < 20000 ? avatar : '' };
        } catch (_) { return null; }
    }
    // Two initials: first letter of the first word + first letter of the last word ("Waqas
    // Nafees" → WN). One word → its first letter. Never more than two characters.
    function initialsOf(name) {
        const parts = String(name || '').trim().split(/[\s._-]+/).filter(Boolean);
        if (!parts.length) return '?';
        const a = parts[0][0], b = parts.length > 1 ? parts[parts.length - 1][0] : '';
        return (a + b).toUpperCase();
    }
    function _escAttr(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    // avatarHtml(person, size, extraStyle) — the ONE way an avatar is drawn anywhere in the app
    // (presence strip, the sign-in chip, the Account panel). person = { name, email, initials?, avatar? }.
    function avatarHtml(p, size, extra) {
        size = size || 28;
        const name = String((p && p.name) || '').trim() || 'Someone';
        const ini = (p && p.initials) || initialsOf(name);
        const seed = (p && (p.email || p.name)) || name;
        const c = _colorFor(seed);
        const base = 'display:inline-flex; align-items:center; justify-content:center; box-sizing:border-box; flex:0 0 auto; ' +
            'width:' + size + 'px; height:' + size + 'px; border-radius:50%; overflow:hidden; ' +
            'border:2px solid var(--color-surface-1,#fff); background:' + c + '; color:#fff; ' +
            'font-size:' + Math.round(size * 0.4) + 'px; font-weight:700; letter-spacing:.02em; line-height:1; user-select:none; ' + (extra || '');
        const pic = (p && p.avatar && /^data:image\//.test(p.avatar)) ? p.avatar : '';
        return '<span class="sl-avatar" title="' + _escAttr(name) + '" aria-label="' + _escAttr(name) + '" style="' + base + '">' +
            (pic ? '<img src="' + _escAttr(pic) + '" alt="" style="width:100%; height:100%; object-fit:cover; display:block;">' : _escAttr(ini)) +
            '</span>';
    }
    function _colorFor(tok) {
        let h = 0; const s = String(tok || '');
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
        return COLORS[Math.abs(h) % COLORS.length];
    }
    function _here() {
        let tab = null;
        try { const a = document.querySelector('.asb-item.active'); tab = a ? (a.querySelector('.asb-lbl') || {}).textContent : null; } catch (_) {}
        const me = _identity() || { name: '', email: '', initials: '', avatar: '' };
        return { name: me.name, email: me.email, initials: me.initials, avatar: me.avatar, tok: _tok, tab: tab || 'working', pageId: (typeof activeFTAPageId !== 'undefined' ? activeFTAPageId : null), at: Date.now() };
    }

    // ---- avatar strip: inline in the top bar, left of Preferences ------------------
    function _mountStrip() {
        let strip = document.getElementById('pres-strip');
        if (strip) return strip;
        strip = document.createElement('div');
        strip.id = 'pres-strip';
        strip.setAttribute('aria-label', 'People in this project');
        strip.style.cssText = 'display:none; align-items:center; height:30px; padding:0 4px; margin:0;';
        try {
            const group = document.querySelector('.export-group');
            const pref = document.getElementById('userpref-wrap');
            if (group && pref && pref.parentNode === group) group.insertBefore(strip, pref);
            else if (group) group.insertBefore(strip, group.firstChild);
            else { strip.style.cssText = 'position:fixed; top:10px; right:190px; z-index:9000; display:none; align-items:center;'; document.body.appendChild(strip); }
        } catch (_) { try { document.body.appendChild(strip); } catch (__) {} }
        return strip;
    }
    function _peopleFrom(state) {
        // one bubble per PERSON: collapse several tabs of one account; skip anything unnamed
        const byEmail = new Map();
        Object.values(state || {}).flat().forEach(p => {
            if (!p || p.tok === _tok || !p.email || !p.name) return;
            const k = String(p.email).toLowerCase();
            const cur = byEmail.get(k);
            if (!cur || (p.at || 0) > (cur.at || 0)) byEmail.set(k, p);
        });
        return Array.from(byEmail.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }
    function _renderStrip() {
        try {
            const strip = _mountStrip();
            const people = _peopleFrom(_state);
            if (!people.length) { strip.style.display = 'none'; strip.innerHTML = ''; return; }
            const MAX = 5;
            const shown = people.slice(0, MAX);
            strip.style.display = 'inline-flex';
            strip.innerHTML = shown.map((p, i) => {
                const where = p.tab ? ' — ' + String(p.tab) : '';
                const html = avatarHtml({ name: p.name, email: p.email, initials: p.initials, avatar: p.avatar }, 28, (i ? 'margin-left:-8px; ' : '') + 'position:relative; z-index:' + (MAX - i) + ';');
                return html.replace('title="' + _escAttr(p.name) + '"', 'title="' + _escAttr(p.name + where) + '"');
            }).join('') + (people.length > MAX
                ? '<span class="sl-avatar sl-avatar-more" title="' + _escAttr(people.slice(MAX).map(p => p.name).join(', ')) + '" style="display:inline-flex; align-items:center; justify-content:center; box-sizing:border-box; width:28px; height:28px; border-radius:50%; margin-left:-8px; border:2px solid var(--color-surface-1,#fff); background:var(--color-surface-3,#E5E9F2); color:var(--color-text-secondary,#4A5568); font-size:11px; font-weight:700;">+' + (people.length - MAX) + '</span>'
                : '');
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
        if (!client || !ws || !proj || !_identity()) { setTimeout(start, 4000); return; }   // no signed-in name → not yet
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
    const api = { start, refresh: _retrack, _here, _colorFor, _renderCursor, _renderStrip, _identity, peers: () => Object.values(_state).flat().filter(p => p.tok !== _tok), people: () => _peopleFrom(_state), COLORS };
    const avatarApi = { html: avatarHtml, initials: initialsOf, color: _colorFor, me: _identity };
    if (typeof window !== 'undefined') { window.SLPresence = api; window.SLAvatar = avatarApi; }
    if (typeof globalThis !== 'undefined') { globalThis.SLPresence = api; globalThis.SLAvatar = avatarApi; }
})();
