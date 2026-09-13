// kestrel_showcase.js — loader for the Kestrel RJ (Part 25 transport) showcase.
// Born-modular: lazy-loads demo_showcase_kestrel25.js, then applies the built
// project through the same _applyProjectData path the K350/SORA showcases use,
// and runs the real engines via postLoad. Exposes window.loadKestrelRj (wired to
// the "Load Kestrel RJ (Part 25)" menu item).
(function () {
    'use strict';

    function _apply(data) {
        var fn = (typeof window.__applyProjectData === 'function') ? window.__applyProjectData
               : (typeof window._applyProjectData === 'function') ? window._applyProjectData
               : (typeof _applyProjectData === 'function') ? _applyProjectData : null;
        if (!fn) throw new Error('project applier unavailable');
        return fn(data);
    }
    function _toast(m, k, ms) { try { if (typeof window.showToast === 'function') window.showToast(m, k || 'info', ms || 3000); } catch (_) {} }

    function ensureLoaded() {
        return new Promise(function (resolve, reject) {
            if (window.SL_SHOWCASE_KESTREL25 && typeof window.SL_SHOWCASE_KESTREL25.build === 'function') return resolve();
            var ex = document.getElementById('sl-kestrel25-lazy');
            if (ex) { ex.addEventListener('load', function () { resolve(); }); ex.addEventListener('error', function () { reject(new Error('load failed')); }); return; }
            var s = document.createElement('script');
            s.id = 'sl-kestrel25-lazy';
            s.src = window.SL_SHOWCASE_KESTREL25_SRC || 'demo_showcase_kestrel25.js?v=2';
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error('load failed')); };
            document.head.appendChild(s);
        });
    }

    async function loadKestrelRj() {
        try { await ensureLoaded(); } catch (_) {}
        if (!(window.SL_SHOWCASE_KESTREL25 && typeof window.SL_SHOWCASE_KESTREL25.build === 'function')) {
            _toast('The Kestrel RJ sample is unavailable in this build.', 'error', 3500); return;
        }
        var data;
        try { data = window.SL_SHOWCASE_KESTREL25.build(); }
        catch (err) { _toast('Could not build Kestrel RJ: ' + ((err && err.message) || err), 'error', 4500); return; }
        try { _apply(data); }
        catch (err) { _toast('Could not load Kestrel RJ: ' + ((err && err.message) || err), 'error', 4500); return; }
        try { window.SL_SHOWCASE_KESTREL25.postLoad(); } catch (_) {}
        try { localStorage.setItem('safetyLab.onrampState.v1', 'dismissed'); if (window._refreshOnramp) window._refreshOnramp(); } catch (_) {}
        _toast('Kestrel RJ (Part 25) showcase loaded — MAC compiled and probabilities computed live. Start at Aircraft Safety → FHA, then PASA · Loss of pitch control.', 'success', 6000);
    }

    window.loadKestrelRj = loadKestrelRj;
})();
