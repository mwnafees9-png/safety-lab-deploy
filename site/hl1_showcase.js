// hl1_showcase.js — loader for the Aeolus HL-1 demo project.
//
// Mirrors kestrel_showcase.js: lazy-loads demo_showcase_hl1.js on demand and
// exposes window.loadHL1Demo.
//
// The HL-1 is a fictional outsized freighter, like the other showcase
// aircraft, so it is visible to every account. isVisible() is kept because the
// demo picker calls it through the generic `gate` mechanism; set HL1_PUBLIC to
// false to put it back behind ?demo=hl1 and the allow-listed domains.
// ---------------------------------------------------------------------------
(function () {
    'use strict';
    // NOTE: the ?v= on the lazy-loaded source below is the CACHE KEY. Editing
    // demo_showcase_hl1.js WITHOUT bumping it leaves the edge serving the
    // previous build under the same URL — which cost two deploy cycles on the
    // Halcyon demo on 4 Aug. Bump it, and index.html's pin, with every change.

    var HL1_PUBLIC = true;   // 31 Jul: Waqas — list it with the other demos on the live site.
    var HL1_DOMAINS = ['safetylabaero.com'];

    function _email() {
        try {
            var e = (localStorage.getItem('safetyLab.signup.email') || '').toLowerCase().trim();
            if (e) return e;
        } catch (_) {}
        try {
            var u = window.__slUser && window.__slUser.email;
            return (u || '').toLowerCase().trim();
        } catch (_) { return ''; }
    }

    // Visible in the demo picker?
    function isVisible() {
        if (HL1_PUBLIC) return true;
        try { if (/[?&]demo=hl1/.test((window.location && window.location.search) || '')) return true; } catch (_) {}
        var e = _email();
        if (!e) return false;
        var dom = e.split('@')[1] || '';
        return HL1_DOMAINS.indexOf(dom) >= 0;
    }

    // 4 Nov 2026: the HL-1 carries its CAD model. demo/hl1_cad_data.js (made by tools/demo/hl1_cad/build_demo_cad.js with
    // the CAD page's own engine) holds the parts, the 47 zones with their boxes, the part links and the risk volumes; the
    // geometry itself comes from the bundled STEP (demo/hl1_cad_step.js), which the 3D view reads the first time it is
    // needed on a computer, checked against the fingerprint like any re-opened file (cad_viewer.js, SLCadBundled).
    var CAD_DATA_SRC = 'demo/hl1_cad_data.js?v=1', CAD_STEP_SRC = 'demo/hl1_cad_step.js?v=1';
    function _loadScript(id, src) {
        return new Promise(function (resolve, reject) {
            var ex = document.getElementById(id);
            if (ex) { if (ex.getAttribute('data-ok')) return resolve(); ex.addEventListener('load', function () { resolve(); }); ex.addEventListener('error', function () { reject(new Error(src + ' failed')); }); return; }
            var s = document.createElement('script'); s.id = id; s.src = src;
            s.onload = function () { s.setAttribute('data-ok', '1'); resolve(); };
            s.onerror = function () { reject(new Error(src + ' failed')); };
            document.head.appendChild(s);
        });
    }
    function _addCad(data) {
        var C = window.SL_HL1_CAD;
        if (!C || !C.projectConfig || !data || !data.projectConfig) return false;
        Object.keys(C.projectConfig).forEach(function (k) { data.projectConfig[k] = JSON.parse(JSON.stringify(C.projectConfig[k])); });
        _register();   // the 3D view finds the geometry for this fingerprint in the bundled STEP
        return true;
    }
    // 4 Nov 2026 (Waqas: "prefeed the model in aeolus demo"): an Aeolus HL-1 project that has no
    // CAD model (a copy saved before the model was bundled, on the web or in the desktop) gets it added when it opens,
    // through the CAD page's own engine (cad_zonal.js): the zone boxes by code, the model, the part links, the risk volumes.
    // Nothing else in the project changes. Any Aeolus project whose model is the bundled one finds its geometry in the
    // bundled STEP. A newer model can still be imported on the CAD page or from the Autopilots.
    function _pcNow() { try { if (window.SLEnv && SLEnv.get) { var v = SLEnv.get('projectConfig'); if (v) return v; } } catch (_) {} try { return projectConfig; } catch (_) { return window.projectConfig || null; } }
    function _isAeolus() { var n = ''; try { n = (window.SLEnv && SLEnv.get) ? SLEnv.get('projectName') : ''; } catch (_) {} if (!n) { try { n = projectName; } catch (_) {} } return /^Aeolus HL-1\b/.test(String(n || '')); }
    function _register() {
        var C = window.SL_HL1_CAD; if (!C) return;
        window.SLCadBundled = window.SLCadBundled || {};
        window.SLCadBundled[C.sha256] = { fileName: C.fileName, label: 'the Aeolus HL-1 demo aircraft', text: function () { return _loadScript('sl-hl1-cad-step', CAD_STEP_SRC).then(function () { var S = window.SL_HL1_STEP; if (!S || S.sha256 !== C.sha256) throw new Error('The bundled demo model does not match.'); return S.text; }); } };
    }
    var _ensuring = null;
    function ensureCad() {
        if (_ensuring) return _ensuring;
        if (!_isAeolus()) return Promise.resolve(false);
        _ensuring = _loadScript('sl-hl1-cad-data', CAD_DATA_SRC).then(function () {
            var C = window.SL_HL1_CAD, E = window.SLCadZonal, pc = _pcNow();
            if (!C || !C.projectConfig || !E || !pc || !_isAeolus()) return false;
            _register();
            if (Array.isArray(pc.cadModels) && pc.cadModels.length) return false;   // it has a model (this one or a newer one): left alone
            var run = function () {
                var D = C.projectConfig, zs = D.zones || [], byId = {}; zs.forEach(function (z) { byId[z.id] = z; });
                var rows = zs.filter(function (z) { return z.volume && z.volume.kind === 'box'; }).map(function (z) { var p = z.parentId && byId[z.parentId] ? byId[z.parentId].code : ''; return { code: z.code, name: z.name, parentCode: p, xMin: z.volume.min[0], xMax: z.volume.max[0], yMin: z.volume.min[1], yMax: z.volume.max[1], zMin: z.volume.min[2], zMax: z.volume.max[2] }; });
                rows.sort(function (a, b) { return (a.parentCode ? 1 : 0) - (b.parentCode ? 1 : 0); });   // parents first
                E.importZoneList(rows);
                var m0 = (D.cadModels || [])[0]; if (!m0) return false;
                var r = E.addCadModel({ fileName: m0.fileName, sha256: m0.sha256, revision: m0.revision, importedAt: m0.importedAt, units: 'mm', parts: m0.parts });
                if (!r || !r.ok) return false;
                Object.keys(D.cadLinks || {}).forEach(function (k) { var L = D.cadLinks[k]; if (L && L.sysId && L.pid) E.confirmLink(r.model.id, L.pid, L.sysId, L.by || 'Aeolus demo', { on: L.on || 'system', at: L.at }); });
                (D.praVolumes || []).forEach(function (v) { if (!(E.riskVolumes() || []).some(function (x) { return x.label === v.label; })) E.addRiskVolume({ kind: v.kind, shape: v.shape, label: v.label, source: v.source || 'manual', praId: v.praId }); });
                try { if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave(); } catch (_) {}
                return true;
            };
            var A = window.SLChangeAck, ok = (A && typeof A.system === 'function') ? A.system(run) : run();
            if (ok) {
                try { if (window.SLZsaAuto) { SLZsaAuto.reset(); SLZsaAuto.render(); } if (window.SLPraAuto) { SLPraAuto.reset(); SLPraAuto.render(); } } catch (_) {}
                try { if (typeof showToast === 'function') showToast('The Aeolus HL-1 3D model, its zones and risk areas were added to this project.', 'info', 5000); } catch (_) {}
            }
            return !!ok;
        }, function () { return false; }).then(function (v) { _ensuring = null; return v; }, function () { _ensuring = null; return false; });
        return _ensuring;
    }
    // every project load (a file, the cloud, a restore, the autosave) goes through _applyProjectData
    function _hookLoads() {
        var orig = window._applyProjectData;
        if (typeof orig !== 'function' || orig._slHl1Cad) return !!(orig && orig._slHl1Cad);
        var w = function () { var r = orig.apply(this, arguments); setTimeout(function () { ensureCad(); }, 0); return r; };
        w._slHl1Cad = true;
        try { if (window.SLWrap) window.SLWrap.preserve(orig, w); } catch (_) {}
        window._applyProjectData = w;
        return true;
    }
    (function () { var n = 0, t = setInterval(function () { if (_hookLoads() || ++n > 60) { clearInterval(t); setTimeout(function () { ensureCad(); }, 1500); } }, 250); })();
    function _ensureLoaded() {
        return new Promise(function (resolve, reject) {
            if (window.SL_SHOWCASE_HL1 && typeof window.SL_SHOWCASE_HL1.build === 'function') return resolve();
            var existing = document.getElementById('sl-hl1-lazy');
            if (existing) {
                existing.addEventListener('load', function () { resolve(); });
                existing.addEventListener('error', function () { reject(new Error('HL-1 showcase load failed')); });
                return;
            }
            var s = document.createElement('script');
            s.id = 'sl-hl1-lazy';
            s.src = window.SL_SHOWCASE_HL1_SRC || 'demo_showcase_hl1.js?v=7';
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error('HL-1 showcase load failed')); };
            document.head.appendChild(s);
        });
    }

    async function loadHL1Demo() {
        if (!isVisible()) {
            try { if (typeof showToast === 'function') showToast('That demo is not available on this account.', 'error', 3500); } catch (_) {}
            return;
        }
        try { await _ensureLoaded(); } catch (_) {}
        try { await _loadScript('sl-hl1-cad-data', CAD_DATA_SRC); } catch (_) {}   // the demo opens without it if it cannot load
        if (!(window.SL_SHOWCASE_HL1 && typeof window.SL_SHOWCASE_HL1.build === 'function')) {
            try { showToast('The HL-1 demo is unavailable in this build.', 'error', 3500); } catch (_) {}
            return;
        }
        var data;
        try { data = window.SL_SHOWCASE_HL1.build(); }
        catch (err) { try { showToast('Could not build the demo: ' + ((err && err.message) || err), 'error', 4500); } catch (_) {} return; }
        try { _addCad(data); } catch (_) {}
        try {
            if (typeof _applyProjectData === 'function') _applyProjectData(data);
            else if (typeof window._applyProjectData === 'function') window._applyProjectData(data);
            else throw new Error('project applier unavailable');
        }
        catch (err) { try { showToast('Could not load the demo: ' + ((err && err.message) || err), 'error', 4500); } catch (_) {} return; }
        try { window.SL_SHOWCASE_HL1.postLoad(); } catch (_) {}
        try { localStorage.setItem('safetyLab.onrampState.v1', 'dismissed'); if (window._refreshOnramp) window._refreshOnramp(); } catch (_) {}
        try {
            showToast('Aeolus HL-1 demonstration loaded. Built from public information only — open Assumptions to see what is public and what we assumed. Start at Define → Certification basis, then Analyze → Aircraft analyses.', 'success', 9000);
        } catch (_) {}
    }

    window.loadHL1Demo = loadHL1Demo;
    window.SLHl1Cad = { ensure: ensureCad, isAeolus: _isAeolus };
    window.slHL1Visible = isVisible;
})();
