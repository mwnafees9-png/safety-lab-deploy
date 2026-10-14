/* ============================================================================
 * pra_panel.js (SLPraPanel), 14 Oct 2026 (p3-pra)
 *
 * The Particular risks panel on the CAD Model page: rotor burst (setup, 360 degree sweep,
 * fragment paths in 3D), tire burst, bird strike, lightning zones, and fire / fluid leak / ice
 * shedding volumes. Reads and writes only through SLPraModels and SLCadZonal. Every number
 * shows its source; nothing goes into the analysis without the engineer's name (the name box
 * under Equipment links, #cad-by).
 * ========================================================================== */
(function () {
    'use strict';
    var VERSION = '1.1';
    var BTN = 'font-size:11.5px;padding:2px 9px;border:1px solid #007AFF;border-radius:5px;background:transparent;color:#007AFF;cursor:pointer;';
    var MUTED = 'font-size:12px;color:var(--color-text-tertiary,#7a828f);';
    var INP = 'font-size:11.5px;padding:1px 4px;width:78px;';
    var st = { sweep: null, tire: {}, bird: null, light: null, open: 'rotor' };
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
    function M() { return window.SLPraModels || null; }
    // 14 Oct 2026 (p3-ai): AI draft buttons (zonal_ai.js); empty when that module is not loaded
    function aiNotes(field, key) { try { return window.SLZonalAI ? window.SLZonalAI.notesHtml(field, key) : ''; } catch (_) { return ''; } }
    function aiBtn(lane, target) { try { return window.SLZonalAI ? ' ' + window.SLZonalAI.buttonHtml(lane, target) : ''; } catch (_) { return ''; } }
    function C() { return window.SLCadZonal || null; }
    function page() { return window.SLCadPage || null; }
    function cadId() { var p = page(); return (p && p.state && p.state.cadId) || (C() && C().latestCadId()); }
    function viewer() { var p = page(); return p && p.state ? p.state.viewer : null; }
    function who() { var el = document.getElementById('cad-by'); var v = el ? String(el.value || '').trim() : ''; if (!v) { try { if (typeof window._signoffReviewerName === 'function') v = window._signoffReviewerName() || ''; } catch (_) {} } return v; }
    function sev(s) { try { if (typeof window.sevPillHtml === 'function') return window.sevPillHtml(s); } catch (_) {} return _esc(s || 'none'); }
    function src(p) { var m = M(); if (!p) return ''; var c = m ? m.cite(p) : p.source; var r = p.ref && m ? m.REFS[p.ref] : null; return '<span style="' + MUTED + (p.source === 'unverified' || p.source === 'missing' ? 'color:var(--color-danger,#8E2A2A);' : '') + '" title="' + _esc(r ? r.quote : (p.note || '')) + '" data-pra-src="' + _esc(p.source) + '">[' + _esc(c) + ']</span>'; }
    function val(p, unit) { return p && p.value != null ? _esc(typeof p.value === 'number' ? (Math.round(p.value * 1000) / 1000) : p.value) + (unit ? ' ' + unit : '') : '<i>missing</i>'; }
    function num(id) { var el = document.getElementById(id); var v = el ? parseFloat(el.value) : NaN; return isFinite(v) ? v : null; }
    function say(t, bad) { var el = document.getElementById('cad-pra-msg'); if (el) { el.style.display = t ? 'block' : 'none'; el.style.color = bad ? 'var(--color-danger,#8E2A2A)' : ''; el.textContent = t || ''; } }
    function pidsLink(pids, label) { return '<a href="#" data-pra-parts="' + _esc(pids.join('|')) + '" style="font-size:12px;">' + _esc(label) + '</a>'; }
    function impactLine(r) { return 'Worst: ' + (r.worst ? sev(r.worst) : 'none') + (r.conditions && r.conditions.length ? ' · ' + r.conditions.map(function (c) { return _esc(c.fcId); }).join(', ') : '') + (r.shared && r.shared.length ? ' · <b style="color:var(--color-danger,#8E2A2A);">shared exposure: ' + r.shared.map(function (f) { return _esc(f.gate); }).join(', ') + '</b>' : ''); }

    function tabs() {
        return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">' + [['rotor', 'Rotor burst'], ['tire', 'Tire burst'], ['bird', 'Bird strike'], ['light', 'Lightning'], ['generic', 'Fire, leak, ice'], ['func', 'By function']].map(function (t) {
            return '<button data-pra-tab="' + t[0] + '" style="' + BTN + (st.open === t[0] ? 'background:#007AFF;color:#fff;' : '') + '">' + t[1] + '</button>'; }).join('') + '</div><div id="cad-pra-msg" style="display:none;font-size:12px;margin:4px 0;"></div>';
    }
    // ---- rotor burst
    function rotorHtml() {
        var m = M(), id = cadId(), out = '';
        var props = m.proposeRotors(id), conf = m.rotors();
        out += '<div style="' + MUTED + '">AC 20-128A failure model. Rotors are proposed from the CAD part names; enter the disc radius and blade length and confirm.</div>';
        out += props.map(function (p, i) {
            return '<div style="font-size:12px;padding:3px 0;border-top:1px solid var(--color-border-hair);" data-pra-rotor-prop="' + _esc(p.pid) + '">' + pidsLink([p.pid], p.name) + ' <span style="' + MUTED + '">at ' + p.center.map(Math.round).join(', ') + ' mm</span> <span style="' + MUTED + '">' + _esc(p.why) + '; outer radius from the box ' + p.radius + ' mm</span><br>' +
                'disc radius <input id="pra-r-' + i + '" style="' + INP + '" placeholder="mm"> blade <input id="pra-b-' + i + '" style="' + INP + '" placeholder="mm"> rotation <select id="pra-rot-' + i + '" style="font-size:11.5px;width:auto;display:inline-block;padding:1px 4px;height:auto;min-height:0;"><option value="1">+1</option><option value="-1">-1</option></select> ' +
                '<button data-pra-act="rotor-confirm" data-i="' + i + '" style="' + BTN + '">Confirm rotor</button></div>';
        }).join('') || '<div style="' + MUTED + '">No part name names a rotor, disc, fan, turbine or compressor.</div>';
        out += conf.map(function (r) { return '<div style="font-size:12px;margin-top:6px;">' + _esc(r.label) + ' <span style="' + MUTED + '">confirmed by ' + _esc(r.confirmedBy) + '; R ' + r.discRadius + ' mm, b ' + r.bladeLength + ' mm; disc mass ' + (r.bladedDiscMassKg || 'missing') + ', speed ' + (r.rpm ? r.rpm + ' rpm' : 'missing') + (r.shields.length ? '; shields ' + r.shields.length : '') + '</span> <button data-pra-act="sweep" data-rotor="' + _esc(r.id) + '" style="' + BTN + '">Sweep 360 degrees</button>' + aiBtn('pra.writeup', { kind: 'rotorBurst', rotorId: r.id, label: r.label, cadId: cadId() }) + aiNotes('praWriteups', r.id) + '</div>'; }).join('');
        var s = st.sweep;
        if (s && s.ok) {
            out += '<div style="margin-top:8px;font-size:12px;" data-pra-sweep="' + _esc(s.rotorId) + '"><b>' + _esc(s.label) + '</b> <span style="' + MUTED + '">' + _esc(s.method) + '</span>' +
                '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:4px;"><tr style="text-align:left;' + MUTED + '"><th>Fragment</th><th>Spread</th><th>Catastrophic / Hazardous release angles</th><th>Ratio</th></tr>' +
                s.models.map(function (x) {
                    var rng = x.ranges.length ? x.ranges.map(function (r, j) { return '<a href="#" data-pra-range="' + _esc(x.model) + '|' + j + '">' + _esc(r.severity) + ' ' + r.fromDeg + ' to ' + r.toDeg + ' deg</a>'; }).join('<br>') : '<span style="' + MUTED + '">none</span>';
                    var ratio = x.criterion ? (x.hazardRatio + ' vs ' + _esc(x.criterion.text) + ' ' + (x.meets ? 'met' : '<b style="color:var(--color-danger,#8E2A2A);">NOT met</b>')) : '<span style="' + MUTED + '">' + _esc(x.assessmentNote) + '</span>';
                    return '<tr style="border-top:1px solid var(--color-border-hair);"><td>' + _esc(x.label) + '<br><a href="#" data-pra-paths="' + _esc(x.model) + '" style="font-size:11px;">all paths in 3D</a></td><td>±' + val(x.spreadDeg, 'deg') + ' ' + src(x.spreadDeg) + '</td><td>' + rng + '</td><td>' + ratio + (x.energy ? '<br>energy ' + val(x.energy.joules, 'J') + ' ' + src(x.energy.joules) : '<br><span style="' + MUTED + '">' + _esc(x.energyNote) + '</span>') + '</td></tr>';
                }).join('') + '</table></div>';
        } else if (s && !s.ok) out += '<div style="font-size:12px;color:var(--color-danger,#8E2A2A);">' + _esc(s.err) + '</div>';
        return out;
    }
    // ---- tire burst
    function tireHtml() {
        var m = M(), id = cadId(), props = m.proposeTires(id), conf = m.tires(), out = '<div style="' + MUTED + '">EASA AMC 25.734 threat models. Diameter and width below come from the CAD box; replace them with the TRA grown values.</div>';
        out += props.map(function (p, i) {
            return '<div style="font-size:12px;padding:3px 0;border-top:1px solid var(--color-border-hair);">' + pidsLink([p.pid], p.name) + '<br>DG <input id="pra-dg-' + i + '" style="' + INP + '" value="' + p.grownDiameter + '"> WSG <input id="pra-w-' + i + '" style="' + INP + '" value="' + p.sectionWidth + '"> mass kg <input id="pra-tm-' + i + '" style="' + INP + '"> speed rating m/s <input id="pra-ts-' + i + '" style="' + INP + '"> rated kPa <input id="pra-tp-' + i + '" style="' + INP + '"> <span style="white-space:nowrap;"><input type="checkbox" id="pra-tb-' + i + '" style="width:auto;"> braked wheel</span> ' +
                '<button data-pra-act="tire-confirm" data-i="' + i + '" style="' + BTN + '">Confirm tire</button></div>';
        }).join('') || '<div style="' + MUTED + '">No part name names a tire or wheel.</div>';
        out += conf.map(function (t) {
            var r = st.tire[t.id];
            return '<div style="font-size:12px;margin-top:6px;" data-pra-tire="' + _esc(t.id) + '">' + _esc(t.label) + ' <span style="' + MUTED + '">confirmed by ' + _esc(t.confirmedBy) + '</span> <button data-pra-act="tire-run" data-tire="' + _esc(t.id) + '" style="' + BTN + '">Assess</button>' + aiBtn('pra.writeup', { kind: 'tireBurst', tireId: t.id, label: t.label, cadId: cadId() }) +
                (r && r.ok ? '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:4px;">' + r.models.map(function (x) {
                    return '<tr style="border-top:1px solid var(--color-border-hair);"><td>' + _esc(x.label) + '</td><td>' + (x.applies === false || x.incomplete ? '<span style="' + MUTED + '">' + _esc(x.note || '') + '</span>' : '±' + val(x.theta, 'deg') + ' ' + src(x.theta) + ' · ' + pidsLink(x.hits, x.hits.length + ' parts') + (x.wheelWellHits.length ? ' (' + x.wheelWellHits.length + ' in a wheel well or gear bay)' : '') + '<br>' + impactLine(x)) + '</td></tr>';
                }).join('') + '</table>' : '') + aiNotes('praWriteups', t.id) + '</div>';
        }).join('');
        return out;
    }
    // ---- bird strike
    function birdHtml() {
        var pcfg = {}; try { pcfg = (window.SLEnv && SLEnv.get('projectConfig')) || {}; } catch (_) {}
        var basis = pcfg.regulation || pcfg.certBasis || '';
        var out = '<div style="' + MUTED + '">Bird mass from the certification basis rule text' + (basis ? ' (' + _esc(basis) + ')' : '') + '. Enter the speeds the rule names, in m/s. Leave the basis empty to use the project\'s.</div>' +
            '<div style="font-size:12px;">basis <input id="pra-basis" style="' + INP + 'width:120px;" value="' + _esc(basis) + '"> windshield <input id="pra-v-windshield" style="' + INP + '"> structure <input id="pra-v-structure" style="' + INP + '"> empennage <input id="pra-v-empennage" style="' + INP + '"> <button data-pra-act="bird-run" style="' + BTN + '">Find exposed surfaces</button></div>';
        var b = st.bird;
        if (b && !b.ok) out += '<div style="color:var(--color-danger,#8E2A2A);font-size:12px;">' + _esc(b.err) + '</div>';
        if (b && b.ok) {
            if (b.basisIssue) out += '<div style="color:var(--color-danger,#8E2A2A);font-size:12px;">' + _esc(b.basisIssue) + '</div>';
            out += '<div style="' + MUTED + '">' + _esc(b.method) + '</div><table style="width:100%;border-collapse:collapse;font-size:12px;"><tr style="text-align:left;' + MUTED + '"><th>Exposed part</th><th>Bird</th><th>Energy</th><th>Behind it</th></tr>' +
                b.zones.map(function (z) { return '<tr style="border-top:1px solid var(--color-border-hair);" data-pra-bird="' + _esc(z.pid) + '"><td>' + pidsLink([z.pid], z.name) + '</td><td>' + val(z.massKg, 'kg') + ' ' + src(z.massKg) + '</td><td>' + val(z.energyJ, 'J') + '</td><td>' + (z.behind.length ? pidsLink([z.pid].concat(z.behind.map(function (x) { return x.pid; })), z.behind.length + ' parts') : '<span style="' + MUTED + '">none</span>') + '<br>' + impactLine(z) + aiBtn('damage.assumption', { kind: 'birdStrike', cadId: cadId(), part: { pid: z.pid, name: z.name } }) + aiNotes('damageAssumptions', z.pid) + '</td></tr>'; }).join('') + '</table>' + aiBtn('pra.writeup', { kind: 'birdStrike', label: 'Bird strike', cadId: cadId() }) + aiNotes('praWriteups', 'birdStrike');
        }
        return out;
    }
    // ---- lightning
    function lightHtml() {
        var out = '<div style="' + MUTED + '">Zones 1A to 3 proposed from the aircraft shape. SAE ARP5414 is not in the knowledge base: every proposal is unverified until you confirm it.</div><div style="font-size:12px;">band mm <input id="pra-lband" style="' + INP + '" placeholder="500"> <button data-pra-act="light-run" style="' + BTN + '">Propose zones</button>' + (st.light && st.light.ok ? ' <button data-pra-act="light-confirm" style="' + BTN + '">Confirm all as proposed</button>' : '') + '</div>';
        var L = st.light, saved = M().lightningZones(cadId());
        if (saved) out += '<div style="font-size:12px;margin-top:4px;" data-pra-light-confirmed>Confirmed by ' + _esc(saved.confirmedBy) + ' (' + saved.parts.length + ' parts).' + aiBtn('pra.writeup', { kind: 'lightning', label: 'Lightning', cadId: cadId() }) + aiNotes('praWriteups', 'lightning') + '</div>';
        if (L && L.ok) out += '<div style="font-size:12px;">band ' + val(L.band, 'mm') + ' ' + src(L.band) + ' · zones ' + src(L.source) + '</div><table style="width:100%;border-collapse:collapse;font-size:12px;">' + L.zones.map(function (z) { return '<tr style="border-top:1px solid var(--color-border-hair);" data-pra-lzone="' + z.zone + '"><td><b>' + z.zone + '</b></td><td>' + pidsLink(z.pids, z.pids.length + ' parts') + '</td><td>' + impactLine(z) + '</td></tr>'; }).join('') + '</table>' +
            '<div style="font-size:12px;margin-top:4px;"><b>Direct effects to assess:</b> ' + L.effects.direct.map(_esc).join('; ') + '<br><b>Indirect effects:</b> ' + L.effects.indirect.map(_esc).join('; ') + '<br><span style="' + MUTED + '">' + L.effects.refs.map(_esc).join(' · ') + '</span></div>';
        return out;
    }
    // ---- fire, fluid leak, ice shedding
    function genericHtml() {
        var m = M(), c = C(), vols = c.riskVolumes().filter(function (v) { return m.GENERIC_KINDS[v.kind]; });
        return '<div style="' + MUTED + '">A box around the selected parts (select them in the viewer), entered by you.</div><div style="font-size:12px;"><select id="pra-gkind" style="font-size:11.5px;width:auto;display:inline-block;padding:1px 4px;height:auto;min-height:0;">' + Object.keys(m.GENERIC_KINDS).map(function (k) { return '<option value="' + k + '">' + _esc(m.GENERIC_KINDS[k]) + '</option>'; }).join('') + '</select> label <input id="pra-glabel" style="' + INP + 'width:140px;"> margin mm <input id="pra-gmargin" style="' + INP + '" value="0"> <button data-pra-act="generic-add" style="' + BTN + '">Add around selection</button></div>' +
            vols.map(function (v) { return '<div style="font-size:12px;" data-pra-generic="' + _esc(v.id) + '"><a href="#" data-pra-vol="' + _esc(v.id) + '">' + _esc(v.label) + '</a> <span style="' + MUTED + '">' + _esc(m.GENERIC_KINDS[v.kind]) + ', ' + _esc(v.source) + '</span>' + aiBtn('pra.writeup', { volumeId: v.id, label: v.label }) + aiNotes('praWriteups', v.id) + '</div>'; }).join('');
    }
    // ---- per-function risk view
    function funcHtml() {
        var r = M().functionRiskView(cadId(), { bird: true });
        if (!r.ok) return '<div style="color:var(--color-danger,#8E2A2A);font-size:12px;">' + _esc(r.err) + '</div>';
        if (!r.functions.length) return '<div style="' + MUTED + '">No functions in the system records.</div>';
        return '<div style="' + MUTED + '">Each function, the equipment that performs it, its zone and every particular risk or zonal hazard it is exposed to. Source record in brackets.</div>' +
            r.functions.map(function (f) {
                return '<div style="border-top:1px solid var(--color-border-hair);padding:4px 0;font-size:12px;" data-pra-func="' + _esc(f.funcId) + '"><b>' + _esc(f.funcId) + ' ' + _esc(f.name) + '</b> · worst ' + sev(f.worst) + aiBtn('function.risk', { systemId: (f.elements[0] || {}).sysId, funcId: f.funcId, cadId: cadId() }) +
                    '<div>' + f.elements.map(function (e) { return _esc(e.name) + (e.zone ? ' in ' + _esc(e.zone) : ' (no zone)') + (e.parts.length ? ' ' + pidsLink(e.parts, e.parts.length + ' part' + (e.parts.length === 1 ? '' : 's')) : ''); }).join('; ') + '</div>' +
                    (f.missing ? '<div style="color:var(--color-danger,#8E2A2A);">' + _esc(f.missing) + '</div>' : '') +
                    f.exposures.map(function (x) { return '<div style="padding-left:10px;">' + _esc(x.sysId) + ': ' + _esc(x.label) + ' · ' + sev(x.worst) + ' <span style="' + MUTED + '">[' + _esc(x.src) + ']</span>' + (x.pids ? ' ' + pidsLink(x.pids, 'show') : '') + '</div>'; }).join('') +
                    f.independence.map(function (x) { return '<div style="padding-left:10px;color:' + (x.severity === 'violation' ? 'var(--color-danger,#8E2A2A)' : 'inherit') + ';">' + _esc(x.text) + ' <span style="' + MUTED + '">[' + _esc(x.src) + ']</span></div>'; }).join('') + aiNotes('functionRiskNotes', ((f.elements[0] || {}).sysId || '') + '/' + f.funcId) + '</div>';
            }).join('');
    }
    function render() {
        var el = document.getElementById('cad-pra'); if (!el) return;
        if (!M() || !C()) { el.innerHTML = '<b style="font-size:13px;">Particular risks</b><div style="' + MUTED + '">The particular risk engine is not available in this build.</div>'; return; }
        if (!cadId() || !C().model(cadId())) { el.innerHTML = '<b style="font-size:13px;">Particular risks</b><div style="' + MUTED + '">Import or open a CAD model first.</div>'; return; }
        var body = st.open === 'rotor' ? rotorHtml() : st.open === 'tire' ? tireHtml() : st.open === 'bird' ? birdHtml() : st.open === 'light' ? lightHtml() : st.open === 'func' ? funcHtml() : genericHtml();
        el.innerHTML = '<b style="font-size:13px;">Particular risks</b>' + tabs() + body;
    }
    function selection() { var v = viewer(); return v && v.sel ? Array.from(v.sel) : []; }
    function act(a) {
        var m = M(), c = C(), k = a.getAttribute('data-pra-act'), id = cadId();
        if (k === 'sweep') { st.sweep = m.sweep(a.getAttribute('data-rotor'), { cadId: id }); render(); return; }
        if (k === 'bird-run') { var sp = {}; ['windshield', 'structure', 'empennage'].forEach(function (x) { var v = num('pra-v-' + x); if (v) sp[x] = v; }); var bEl = document.getElementById('pra-basis'); st.bird = m.birdExposure(id, { basis: bEl ? bEl.value : '', speeds: sp }); render(); return; }
        if (k === 'light-run') { st.light = m.proposeLightningZones(id, { band: num('pra-lband') || undefined }); render(); return; }
        var by = who(); if (!by) { say('Enter your name under Equipment links first: everything that goes into the analysis is recorded with who confirmed it.', true); return; }
        if (k === 'rotor-confirm') {
            var i = +a.getAttribute('data-i'), p = m.proposeRotors(id)[i]; if (!p) return;
            var rr = m.confirmRotor({ label: p.name, cadId: id, pid: p.pid, center: p.center, axis: p.axis, kind: p.kind, discRadius: num('pra-r-' + i), bladeLength: num('pra-b-' + i), rotation: +document.getElementById('pra-rot-' + i).value }, by);
            say(rr.ok ? 'Rotor confirmed.' : rr.err, !rr.ok);
        } else if (k === 'tire-confirm') {
            var j = +a.getAttribute('data-i'), t = m.proposeTires(id)[j]; if (!t) return;
            var tr = m.confirmTire({ label: t.name, cadId: id, pid: t.pid, center: t.center, axis: t.axis, grownDiameter: num('pra-dg-' + j), sectionWidth: num('pra-w-' + j), massKg: num('pra-tm-' + j), speedRatingMs: num('pra-ts-' + j), ratedPressureKpa: num('pra-tp-' + j), braked: !!(document.getElementById('pra-tb-' + j) || {}).checked }, by);
            say(tr.ok ? 'Tire confirmed.' : tr.err, !tr.ok);
        } else if (k === 'tire-run') { st.tire[a.getAttribute('data-tire')] = m.tireThreats(a.getAttribute('data-tire'), { cadId: id }); }
        else if (k === 'light-confirm' && st.light && st.light.ok) { var lr = m.confirmLightningZones(id, st.light.parts, by); say(lr.ok ? 'Lightning zones confirmed for ' + lr.count + ' parts.' : lr.err, !lr.ok); }
        else if (k === 'generic-add') {
            var sel = selection(), mdl = c.model(id), parts = c.partsOf(mdl).filter(function (q) { return sel.indexOf(q.pid) >= 0 && q.bbox; });
            if (!parts.length) { say('Select the parts the volume should enclose in the viewer first.', true); return; }
            var mg = num('pra-gmargin') || 0, mn = [0, 1, 2].map(function (x) { return Math.min.apply(null, parts.map(function (q) { return q.bbox.min[x]; })) - mg; }), mx = [0, 1, 2].map(function (x) { return Math.max.apply(null, parts.map(function (q) { return q.bbox.max[x]; })) + mg; });
            var gr = m.addGenericVolume(document.getElementById('pra-gkind').value, (document.getElementById('pra-glabel') || {}).value, { min: mn, max: mx }, by);
            say(gr.ok ? 'Volume added.' : gr.err, !gr.ok);
            var v = viewer(); if (v && gr.ok) v.refreshOverlays();
        }
        render();
    }
    function showRange(model, j) {
        var s = st.sweep, v = viewer(); if (!s || !v) return;
        var x = s.models.filter(function (q) { return q.model === model; })[0]; if (!x) return;
        var r = x.ranges[j]; if (!r) return;
        var angs = x.angles.filter(function (a) { return r.fromDeg <= r.toDeg ? (a.angle >= r.fromDeg && a.angle < r.toDeg) : (a.angle >= r.fromDeg || a.angle < r.toDeg); });
        var segs = M().pathSegments(s.rotorId, model, angs.map(function (a) { return a.angle; })).map(function (q) { q.color = r.severity === 'Catastrophic' ? '#c92a2a' : '#e8590c'; return q; });
        v.showPaths(segs, { frame: true });
        var pids = []; angs.forEach(function (a) { a.pids.forEach(function (p) { if (pids.indexOf(p) < 0) pids.push(p); }); });
        if (pids.length) v.highlightParts(pids);
    }
    function showAll(model) {
        var s = st.sweep, v = viewer(); if (!s || !v) return;
        var x = s.models.filter(function (q) { return q.model === model; })[0]; if (!x) return;
        var segs = M().pathSegments(s.rotorId, model, x.angles.filter(function (a, i) { return i % 10 === 0; }).map(function (a) { return a.angle; })).filter(function (q) { return q.edge === 0; }).map(function (q) {
            var a = x.angles.filter(function (y) { return y.angle === q.angle; })[0]; q.color = a && a.worst === 'Catastrophic' ? '#c92a2a' : a && a.worst === 'Hazardous' ? '#e8590c' : '#868e96'; return q; });
        v.showPaths(segs, { frame: true });
    }
    document.addEventListener('click', function (e) {
        var host = document.getElementById('cad-pra'); if (!host || !host.contains(e.target)) return;
        var t = e.target;
        var tb = t.closest('[data-pra-tab]'); if (tb) { st.open = tb.getAttribute('data-pra-tab'); say(''); render(); return; }
        var pr = t.closest('[data-pra-parts]'); if (pr) { e.preventDefault(); var v = viewer(); var ps = pr.getAttribute('data-pra-parts').split('|').filter(Boolean); if (v && ps.length) v.highlightParts(ps); return; }
        var rg = t.closest('[data-pra-range]'); if (rg) { e.preventDefault(); var q = rg.getAttribute('data-pra-range').split('|'); showRange(q[0], +q[1]); return; }
        var pa = t.closest('[data-pra-paths]'); if (pa) { e.preventDefault(); showAll(pa.getAttribute('data-pra-paths')); return; }
        var vo = t.closest('[data-pra-vol]'); if (vo) { e.preventDefault(); var v2 = viewer(); if (v2) v2.highlightVolume(vo.getAttribute('data-pra-vol')); return; }
        var a = t.closest('[data-pra-act]'); if (a) act(a);
    });
    window.SLPraPanel = { VERSION: VERSION, render: render, state: st, _showRange: showRange };
})();
