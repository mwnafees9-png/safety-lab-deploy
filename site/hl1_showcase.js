// 10 Nov 2026: every part of the demo's CAD model has its material and a description built in (HL1_MATERIALS, projectConfig.cadMaterials and cadProps).
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
    // 10 Nov 2026 (Waqas: "demo's CAD model should come with materials and properties built in"): every part of the
    // Aeolus HL-1 model gets the material a real part of its kind is made of, and a short description, the first rule that
    // fits its name and place in the model deciding. Kept in projectConfig.cadMaterials and projectConfig.cadProps by the
    // model's fingerprint, as a STEP file's own materials are (zsa_type_hazards.js reads them; the CAD properties panel
    // shows them). Demo data, ours: a customer's model brings its own from its STEP file.
    var HL1_MATERIALS = [
        [/^ROUTING\/WIRING/, 'Copper conductors, PTFE and polyimide insulation (harness)', 'Wiring harness'],
        [/^ROUTING\/BLEED DUCTS/, 'Titanium alloy Ti-6Al-4V duct, nickel alloy Inconel 625 bellows', 'Bleed air duct'],
        [/^ROUTING\/FUEL LINES/, 'Aluminum alloy 6061-T6 tube', 'Fuel line'],
        [/^ROUTING\/HYDRAULIC LINES/, 'Titanium alloy Ti-3Al-2.5V tube', 'Hydraulic line'],
        [/^ROUTING\/OXYGEN LINES/, 'Stainless steel 321 tube', 'Oxygen line'],
        [/Fan rotor disc/, 'Titanium alloy Ti-6Al-4V', 'Fan rotor disc'],
        [/High-pressure turbine disc/, 'Nickel alloy Inconel 718', 'High-pressure turbine disc'],
        [/Nacelle barrel/, 'Carbon fiber composite (IM7/epoxy) with titanium fire seal', 'Nacelle barrel'],
        [/Pylon box/, 'Titanium alloy Ti-6Al-4V', 'Engine pylon box'],
        [/Fin\b|Horizontal stabilizer/, 'Carbon fiber composite (IM7/8552)', 'Tail surface'],
        [/Wing (front|rear) spar|Wing rib|Center wing box/, 'Aluminum alloy 7085-T7651', 'Wing structure'],
        [/Fuselage frame|Fuselage stringer|Keel beam|pressure bulkhead/, 'Aluminum alloy 2024-T3', 'Fuselage structure'],
        [/Cargo floor|Flight deck floor/, 'Aluminum-lithium alloy 2099-T83 beams, aramid honeycomb panels', 'Floor'],
        [/battery|batteries/i, 'Lithium-ion cells (NMC) in a stainless steel case', 'Battery'],
        [/oxygen bottle/i, 'Carbon fiber composite overwrap on an aluminum liner', 'Oxygen bottle'],
        [/extinguisher bottle/i, 'Stainless steel 304', 'Fire extinguisher bottle'],
        [/loop|detector|sensor|probe/i, 'Stainless steel sensing element, ceramic insulation', 'Sensor'],
        [/^(APU|Auxiliary power unit)$/i, 'Nickel alloy Inconel 718 hot section, aluminum casing', 'Auxiliary power unit'],
        [/restraint|\broller|guide track|winch|wipers?|quadrant|handles?\b|pedals?\b|sidestick|hinge|fitting/i, 'Steel 4340 and aluminum alloy 7075-T73 fittings', 'Mechanical part'],
        [/\bmasks?\b/i, 'Silicone rubber face seal, polycarbonate shell', 'Oxygen mask'],
        [/lavatory/i, 'Aluminum frame, flame-retardant polymer panels', 'Furnishing'],
        [/\bfans?\b/i, 'Aluminum alloy housing, glass fiber reinforced nylon impeller', 'Fan'],
        [/fadec|exciter|electronics|interphone|computer|\bunit\b|display|controller|panel|radio|receiver|transponder|recorder|instrument|switch|terminal|module|box/i, 'Aluminum alloy 6061-T6 housing, glass fiber circuit boards', 'Electronic unit'],
        [/generator/i, 'Aluminum alloy housing, copper windings, steel rotor', 'Generator'],
        [/pump|motor/i, 'Aluminum alloy A356 housing, steel rotating parts', 'Pump or motor'],
        [/accumulator|reservoir/i, 'Stainless steel 15-5PH', 'Pressure vessel'],
        [/precooler|heat exchanger|pack\b/i, 'Nickel alloy core, aluminum casing', 'Heat exchanger'],
        [/valve/i, 'Stainless steel 17-4PH body', 'Valve'],
        [/actuator|actuation/i, 'Steel 300M rod, aluminum alloy 7075-T73 body, nitrile and PTFE seals', 'Actuator'],
        [/oil tank/i, 'Aluminum alloy 2219-T87', 'Oil tank'],
        [/water tank|waste tank/i, 'Glass fiber composite (filament wound)', 'Water or waste tank'],
        [/\btank\b/i, 'Aluminum alloy 2024-T3 (integral wing tank structure)', 'Fuel tank'],
        [/bogie|nose gear|gear leg/i, 'Steel 300M with carbon brakes, rubber tires', 'Landing gear'],
        [/seat|bunk|galley|furnish/i, 'Aluminum frame, flame-retardant polymer and foam', 'Furnishing'],
        [/windshield$|windshield,|window/i, 'Stretched acrylic and glass laminate', 'Window'],
        [/\bdoor\b|hatch|\bexit\b/i, 'Aluminum alloy 7075-T6 with carbon fiber composite skin', 'Door'],
        [/\blights?\b|\blighting\b|beacon/i, 'Polycarbonate lens, aluminum housing', 'Light'],
        [/Fan rotor|turbofan|Engine \d|Powerplant/i, 'Titanium alloy Ti-6Al-4V fan case, nickel alloy hot section', 'Engine'],
        [/./, 'Aluminum alloy 6061-T6 housing, glass fiber circuit boards', 'Electronic unit']
    ];
    function hl1Materials(parts) {
        var mats = {}, props = {};
        (parts || []).forEach(function (p) {
            if (!p || !p.pid) return;
            var where = (p.path || [])[1] === 'ROUTING' ? (p.path || []).slice(1).join('/') : (p.name || '');   // routing by its run, everything else by its own name
            for (var i = 0; i < HL1_MATERIALS.length; i++) {
                var r = HL1_MATERIALS[i], hit = r[0].test(where);
                if (hit) { mats[p.pid] = r[1]; props[p.pid] = { material: r[1], description: r[2] + (p.partNumber ? ', part ' + p.partNumber : '') }; break; }
            }
        });
        return { mats: mats, props: props };
    }
    function _putMaterials(pc, sha, parts) {
        if (!pc || !sha) return false;
        var m = hl1Materials(parts);
        if (!pc.cadMaterials || typeof pc.cadMaterials !== 'object') pc.cadMaterials = {};
        if (!pc.cadProps || typeof pc.cadProps !== 'object') pc.cadProps = {};
        if (pc.cadMaterials[sha] && Object.keys(pc.cadMaterials[sha]).length) return false;   // a model's own (or earlier) materials are kept
        pc.cadMaterials[sha] = m.mats; pc.cadProps[sha] = m.props;
        return true;
    }
    function _addCad(data) {
        var C = window.SL_HL1_CAD;
        if (!C || !C.projectConfig || !data || !data.projectConfig) return false;
        Object.keys(C.projectConfig).forEach(function (k) { data.projectConfig[k] = JSON.parse(JSON.stringify(C.projectConfig[k])); });
        try { var m0 = (data.projectConfig.cadModels || [])[0]; if (m0) _putMaterials(data.projectConfig, m0.sha256 || C.sha256, m0.parts); } catch (_) {}
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
            // 10 Nov 2026: an Aeolus project with the bundled model but no materials yet gets the demo's materials
            try { var mb = (pc.cadModels || []).find(function (x) { return x && x.sha256 === C.sha256; }), mp = (C.projectConfig.cadModels || [])[0]; if (mb && mp && _putMaterials(pc, C.sha256, mp.parts)) { if (typeof window.scheduleAutosave === 'function') window.scheduleAutosave(); } } catch (_) {}
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
    window.SLHl1Cad = { ensure: ensureCad, isAeolus: _isAeolus, materials: hl1Materials };
    window.slHL1Visible = isVisible;
})();
