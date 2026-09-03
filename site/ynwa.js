/*
 * ynwa.js — a small, tasteful easter egg. Type "ynwa" anywhere in the app and
 * a red scarf rises across the top of the screen for a few seconds.
 *
 * DELIBERATELY OUTSIDE THE QUALIFIED TOOL BOUNDARY. This module touches no
 * analysis engine, no project data, no persistence, and no report generation.
 * It only draws a transient overlay and a toast. It is excluded from the
 * DO-330 TCI functional set (cosmetic / non-operational). Failsafe throughout:
 * any error is swallowed so it can never affect a running session.
 *
 * No club marks or crests are used (trademarks) and no song lyrics are
 * reproduced — only the motto phrase itself. Colours are generic red.
 */
(function () {
    'use strict';
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (window.__ynwaWired) return;
    window.__ynwaWired = true;

    var SEQ = 'ynwa';
    var buf = '';

    function ensureStyle() {
        if (document.getElementById('sl-ynwa-style')) return;
        var st = document.createElement('style');
        st.id = 'sl-ynwa-style';
        st.textContent = [
            '@keyframes slYnwaRise{0%{transform:translateY(-120%);opacity:0}',
            '18%{transform:translateY(0);opacity:1}82%{transform:translateY(0);opacity:1}',
            '100%{transform:translateY(-120%);opacity:0}}',
            '@keyframes slYnwaSway{0%,100%{transform:rotate(-1.1deg)}50%{transform:rotate(1.1deg)}}',
            '.sl-ynwa-wrap{position:fixed;top:0;left:0;right:0;z-index:99999;pointer-events:none;',
            'display:flex;justify-content:center;animation:slYnwaRise 4.6s cubic-bezier(.22,1,.36,1) forwards}',
            '.sl-ynwa-scarf{margin-top:14px;padding:14px 34px;border-radius:10px;',
            'background:linear-gradient(180deg,#d00027 0%,#c8102e 46%,#9b0c22 100%);',
            'color:#fff;font-weight:800;letter-spacing:.14em;text-transform:uppercase;',
            'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;',
            'box-shadow:0 10px 34px rgba(155,12,34,.42),inset 0 1px 0 rgba(255,255,255,.28);',
            'border:1px solid rgba(255,255,255,.35);position:relative;text-align:center;',
            'animation:slYnwaSway 2.4s ease-in-out infinite}',
            '.sl-ynwa-scarf:before,.sl-ynwa-scarf:after{content:"";position:absolute;top:0;bottom:0;width:14px;',
            'background:repeating-linear-gradient(45deg,#fff 0 5px,#c8102e 5px 10px)}',
            '.sl-ynwa-scarf:before{left:-14px;border-radius:10px 0 0 10px}',
            '.sl-ynwa-scarf:after{right:-14px;border-radius:0 10px 10px 0}',
            '.sl-ynwa-sub{display:block;margin-top:6px;font-size:12px;font-weight:700;',
            'letter-spacing:.05em;opacity:.96;text-transform:none}'
        ].join('');
        document.head.appendChild(st);
    }

    var _cooling = false;
    function fire() {
        if (_cooling) return;            // debounce — one scarf at a time
        _cooling = true;
        setTimeout(function () { _cooling = false; }, 2500);
        try {
            ensureStyle();
            var wrap = document.createElement('div');
            wrap.className = 'sl-ynwa-wrap';
            wrap.setAttribute('aria-hidden', 'true');
            wrap.innerHTML = '<div class="sl-ynwa-scarf">You&#39;ll Never Walk Alone' +
                '<span class="sl-ynwa-sub">Anya &amp; Emma ❤️</span></div>';
            document.body.appendChild(wrap);
            setTimeout(function () { try { wrap.remove(); } catch (e) {} }, 4800);
        } catch (e) { /* never let the egg break the app */ }
    }

    // Manual trigger for QA / anyone who knows.
    window.__ynwa = fire;

    document.addEventListener('keydown', function (ev) {
        try {
            if (ev.ctrlKey || ev.metaKey || ev.altKey) { buf = ''; return; }
            var t = ev.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
                buf = ''; return; // don't hijack real typing
            }
            var k = (ev.key || '').toLowerCase();
            if (k.length !== 1 || k < 'a' || k > 'z') { buf = ''; return; }
            buf = (buf + k).slice(-SEQ.length);
            if (buf === SEQ) { buf = ''; fire(); }
        } catch (e) { buf = ''; }
    }, true);

    // Also honour the natural gesture: typing "ynwa" into any field. Fires only
    // when the value ends in the standalone token (a real comment that merely
    // contains "ynwa" mid-word won't trip it), and the cooldown prevents repeats.
    document.addEventListener('input', function (ev) {
        try {
            var t = ev.target;
            if (!t) return;
            var v = (t.value != null ? t.value : (t.textContent || ''));
            if (/(^|[^a-z])ynwa$/i.test(String(v).trim())) fire();
        } catch (e) { /* swallow */ }
    }, true);
})();
