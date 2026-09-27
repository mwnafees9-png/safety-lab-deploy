// ============================================================================
// zonal_threats.js — v1.0 — Q10 (27 Sep 2026): the per-item threat record of
// the zonal safety analysis.
//
// A zonal analysis asks two questions of every piece of equipment in a zone:
// what can it throw at its neighbors, and what can its neighbors throw at it
// (ARP4761A Appendix K; own words). This module records both, per equipment
// item, on top of the zonal model (zonal_model.js, projectConfig.zones):
//
//   emits:       for each threat (heat, fluid, debris, EMI, vibration) the
//                states in which the item emits it: normal, abnormal, failed.
//                A leak that only happens when a seal fails is "fluid: failed";
//                a hot duct is "heat: normal".
//   susceptible: the threats the item cannot tolerate.
//
// From those two the module computes, deterministically:
//   · co-location: an item susceptible to T shares a zone with an emitter of T.
//     Emitted in normal operation = the exposure is permanent (gap); only in
//     abnormal or failed operation = a failure sequence to assess (check).
//   · carry-over: the emitter is in an ADJACENT zone (parent, child or sibling
//     in the containment tree) and no substantiated barrier stands between the
//     two zones (zonal_model barriers). Fluid runs, heat radiates, debris flies,
//     EMI couples and vibration travels through structure; a boundary only
//     stops them when something substantiated says so.
//
// Stored on projectConfig.zoneThreats[<equipment id>] = { emits: { heat: [states] ... },
// susceptible: [threats], note }. Equipment ids are the systemsData ids the
// zonal model already uses (the golden-thread identity rule).
//
// Surfaces: a "Per-item threats" section on the Zonal Model page (editor per
// placed item, findings below it), the ZSA walkthrough untouched, INV-65
// advisory. Reads through SLEnv (rule 5) with direct fallback. No eval.
// window.SLZonalThreats + module.exports (tests).
// ============================================================================
(function (root) {
    'use strict';
    var THREATS = [
        { id: 'heat',      label: 'Heat',      note: 'hot surfaces, exhaust, fire' },
        { id: 'fluid',     label: 'Fluid',     note: 'fuel, oil, hydraulic, water, waste' },
        { id: 'debris',    label: 'Debris',    note: 'released parts, fragments, flailing' },
        { id: 'emi',       label: 'EMI',       note: 'electromagnetic interference' },
        { id: 'vibration', label: 'Vibration', note: 'mechanical vibration through structure' }
    ];
    var STATES = ['normal', 'abnormal', 'failed'];
    var STATE_LABEL = { normal: 'in normal operation', abnormal: 'in abnormal operation', failed: 'when it fails' };

    function _g(name) {
        try { if (root.SLEnv && typeof root.SLEnv.get === 'function') { var v = root.SLEnv.get(name); if (v !== undefined) return v; } } catch (_) {}
        try {
            switch (name) {
                case 'projectConfig': return (typeof projectConfig !== 'undefined') ? projectConfig : root.projectConfig;
                case 'systemsData': return (typeof systemsData !== 'undefined') ? systemsData : root.systemsData;
            }
        } catch (_) {}
        return root[name];
    }
    function _pc() { var p = _g('projectConfig'); return (p && typeof p === 'object') ? p : {}; }
    function _Z() { return root.ZONES || null; }
    function _arr(v) { return Array.isArray(v) ? v : []; }
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function _sysName(id) { var s = _arr(_g('systemsData')).find(function (x) { return x && x.id === id; }); return s ? (s.name || id) : id; }
    function _label(t) { var x = THREATS.find(function (y) { return y.id === t; }); return x ? x.label : t; }
    function _zlabel(z) { return z ? ((z.code ? z.code + ' ' : '') + (z.name || z.id)) : ''; }

    // ---- store ---------------------------------------------------------------------
    function _store() { var pc = _pc(); if (!pc.zoneThreats || typeof pc.zoneThreats !== 'object') pc.zoneThreats = {}; return pc.zoneThreats; }
    function _norm(rec) {
        var out = { emits: {}, susceptible: [], note: String(rec && rec.note || '') };
        THREATS.forEach(function (t) {
            var st = rec && rec.emits && rec.emits[t.id];
            out.emits[t.id] = _arr(st).map(String).filter(function (s) { return STATES.indexOf(s) >= 0; });
        });
        out.susceptible = _arr(rec && rec.susceptible).map(String).filter(function (t) { return THREATS.some(function (x) { return x.id === t; }); });
        return out;
    }
    function record(itemId) { return _norm(_store()[itemId]); }
    function has(itemId) { var r = record(itemId); return r.susceptible.length > 0 || THREATS.some(function (t) { return r.emits[t.id].length; }); }
    function setEmit(itemId, threat, state, on) {
        if (!itemId || !THREATS.some(function (t) { return t.id === threat; }) || STATES.indexOf(state) < 0) return false;
        var s = _store(); var r = _norm(s[itemId]);
        var list = r.emits[threat].filter(function (x) { return x !== state; });
        if (on) list.push(state);
        r.emits[threat] = STATES.filter(function (x) { return list.indexOf(x) >= 0; });
        s[itemId] = r; _save(); return true;
    }
    function setSusceptible(itemId, threat, on) {
        if (!itemId || !THREATS.some(function (t) { return t.id === threat; })) return false;
        var s = _store(); var r = _norm(s[itemId]);
        r.susceptible = r.susceptible.filter(function (x) { return x !== threat; });
        if (on) r.susceptible.push(threat);
        r.susceptible = THREATS.map(function (t) { return t.id; }).filter(function (t) { return r.susceptible.indexOf(t) >= 0; });
        s[itemId] = r; _save(); return true;
    }
    function setNote(itemId, note) { if (!itemId) return false; var s = _store(); var r = _norm(s[itemId]); r.note = String(note || ''); s[itemId] = r; _save(); return true; }
    function _save() { try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {} }

    // ---- geometry: neighbors and barriers ------------------------------------------------
    function adjacent(zoneId) {
        var Z = _Z(); if (!Z) return [];
        var z = Z.get(zoneId); if (!z) return [];
        var out = [];
        if (z.parentId != null) { var p = Z.get(z.parentId); if (p) out.push(p); }
        Z.children(zoneId).forEach(function (c) { out.push(c); });
        Z.all().forEach(function (o) { if (!o || o.id === zoneId || out.indexOf(o) >= 0) return; var sib = (o.parentId == null) ? (z.parentId == null) : (o.parentId === z.parentId); if (sib) out.push(o); });
        return out;
    }
    function blocked(a, b) {
        var Z = _Z(); if (!Z || typeof Z.barrierBetween !== 'function') return false;
        var bar = Z.barrierBetween(a, b);
        return !!(bar && bar.substantiated);
    }

    // ---- the analysis ---------------------------------------------------------------------
    // Per zone: what is emitted here (by whom, in which states) and who here is susceptible.
    function zoneProfile(zoneId) {
        var Z = _Z(); var z = Z && Z.get(zoneId); if (!z) return null;
        var emitted = {}, susceptible = {};
        THREATS.forEach(function (t) { emitted[t.id] = []; susceptible[t.id] = []; });
        _arr(z.equipment).forEach(function (id) {
            var r = record(id);
            THREATS.forEach(function (t) { if (r.emits[t.id].length) emitted[t.id].push({ item: id, states: r.emits[t.id] }); });
            r.susceptible.forEach(function (t) { susceptible[t].push(id); });
        });
        return { zone: z, emitted: emitted, susceptible: susceptible };
    }
    function _worst(states) { return states.indexOf('normal') >= 0 ? 'gap' : 'warn'; }
    function findings() {
        var Z = _Z(); if (!Z) return [];
        var out = [];
        var profiles = {}; Z.all().forEach(function (z) { if (z) profiles[z.id] = zoneProfile(z.id); });
        Z.all().forEach(function (z) {
            if (!z) return;
            var me = profiles[z.id];
            THREATS.forEach(function (t) {
                var victims = me.susceptible[t.id]; if (!victims.length) return;
                // co-location
                me.emitted[t.id].forEach(function (e) {
                    victims.forEach(function (v) {
                        if (v === e.item) return;
                        out.push({ kind: 'co-located', sev: _worst(e.states), threat: t.id, zone: z.id, fromZone: z.id, emitter: e.item, victim: v, states: e.states,
                                   text: _zlabel(z) + ': ' + _sysName(v) + ' is susceptible to ' + _label(t.id).toLowerCase() + ' and shares the zone with ' + _sysName(e.item) + ', which emits it ' + e.states.map(function (s) { return STATE_LABEL[s]; }).join(' / ') });
                    });
                });
                // carry-over from adjacent zones
                adjacent(z.id).forEach(function (n) {
                    var np = profiles[n.id]; if (!np || blocked(z.id, n.id)) return;
                    np.emitted[t.id].forEach(function (e) {
                        victims.forEach(function (v) {
                            out.push({ kind: 'carry-over', sev: _worst(e.states), threat: t.id, zone: z.id, fromZone: n.id, emitter: e.item, victim: v, states: e.states,
                                       text: _zlabel(z) + ': ' + _sysName(v) + ' is susceptible to ' + _label(t.id).toLowerCase() + '; ' + _sysName(e.item) + ' in adjacent zone ' + _zlabel(n) + ' emits it ' + e.states.map(function (s) { return STATE_LABEL[s]; }).join(' / ') + ' and no substantiated barrier stands between the zones' });
                        });
                    });
                });
            });
        });
        return out;
    }
    // Placed items with no record at all: the analysis has not looked at them yet.
    function unrecorded() {
        var Z = _Z(); if (!Z) return [];
        var out = [];
        Z.all().forEach(function (z) { _arr(z && z.equipment).forEach(function (id) { if (!has(id)) out.push({ item: id, zone: z.id, text: _zlabel(z) + ': ' + _sysName(id) + ' has no threat record (what it emits, what it is susceptible to)' }); }); });
        return out;
    }
    var INV = { id: 'INV-65', sev: 'advisory',
        name: 'Every equipment item in a zone records what it emits and what it is susceptible to; no susceptible item shares a zone, or an unbarriered neighboring zone, with an emitter of that threat (ARP4761A Appendix K)',
        run: function () {
            var Z = _Z(); var n = 0; if (Z) Z.all().forEach(function (z) { n += _arr(z && z.equipment).length; });
            var f = findings().concat(unrecorded());
            return { checked: n, fails: f.slice(0, 20).map(function (x) { return x.text; }), failCount: f.length };
        } };
    (function reg(tries) {
        if (typeof root.invRegister === 'function') { try { root.invRegister(INV); } catch (_) {} return; }
        if (tries > 0 && typeof setTimeout === 'function') setTimeout(function () { reg(tries - 1); }, 50);
    })(40);

    // ---- page section --------------------------------------------------------------------
    function _cb(itemId, threat, state, on) {
        return '<label style="display:inline-flex;align-items:center;gap:3px;font-size:10.5px;margin-right:6px;cursor:pointer;" title="' + _esc(_label(threat) + ' ' + STATE_LABEL[state]) + '"><input type="checkbox"' + (on ? ' checked' : '') + ' style="width:auto;margin:0;" onchange="SLZonalThreats.setEmit(\'' + _esc(itemId) + '\',\'' + threat + '\',\'' + state + '\',this.checked);SLZonalThreats.renderSection()">' + state + '</label>';
    }
    function itemEditorHtml(itemId) {
        var r = record(itemId);
        return '<div data-zt-item="' + _esc(itemId) + '" style="border-top:1px solid var(--color-border-hair);padding:6px 0;">'
            + '<div style="font-weight:700;font-size:12px;color:var(--color-text-primary);">' + _esc(_sysName(itemId)) + (has(itemId) ? '' : ' <span style="font-size:10px;color:#9A6200;font-weight:700;">no record yet</span>') + '</div>'
            + '<table style="font-size:11px;border-collapse:collapse;margin-top:4px;"><tr><th style="text-align:left;padding:1px 8px 1px 0;font-weight:600;color:var(--color-text-secondary);">Threat</th><th style="text-align:left;padding:1px 8px;font-weight:600;color:var(--color-text-secondary);">Emits</th><th style="text-align:left;padding:1px 8px;font-weight:600;color:var(--color-text-secondary);">Susceptible</th></tr>'
            + THREATS.map(function (t) {
                return '<tr><td style="padding:1px 8px 1px 0;" title="' + _esc(t.note) + '">' + _esc(t.label) + '</td><td style="padding:1px 8px;">' + STATES.map(function (s) { return _cb(itemId, t.id, s, r.emits[t.id].indexOf(s) >= 0); }).join('') + '</td>'
                    + '<td style="padding:1px 8px;"><input type="checkbox"' + (r.susceptible.indexOf(t.id) >= 0 ? ' checked' : '') + ' style="width:auto;margin:0;" title="' + _esc(_sysName(itemId) + ' cannot tolerate ' + t.label.toLowerCase()) + '" onchange="SLZonalThreats.setSusceptible(\'' + _esc(itemId) + '\',\'' + t.id + '\',this.checked);SLZonalThreats.renderSection()"></td></tr>';
            }).join('') + '</table>'
            + '<input type="text" value="' + _esc(r.note) + '" placeholder="note (e.g. drip shield fitted, sealed connector, shielded harness)" style="font-size:11px;margin-top:4px;width:100%;max-width:520px;" onchange="SLZonalThreats.setNote(\'' + _esc(itemId) + '\',this.value)">'
            + '</div>';
    }
    function sectionHtml() {
        var Z = _Z(); if (!Z) return '';
        var zones = Z.all().filter(function (z) { return z && _arr(z.equipment).length; });
        var f = findings(), u = unrecorded();
        var gaps = f.filter(function (x) { return x.sev === 'gap'; }).length;
        var body = zones.length ? zones.map(function (z) {
            return '<div style="margin-top:8px;"><div style="font-family:var(--font-mono,monospace);font-weight:700;font-size:12px;color:var(--color-text-primary);">' + _esc(_zlabel(z)) + '</div>' + _arr(z.equipment).map(itemEditorHtml).join('') + '</div>';
        }).join('') : '<div style="font-size:11.5px;color:var(--color-text-secondary);">Place equipment in zones above; each placed item gets a threat record here.</div>';
        var list = f.length ? f.map(function (x) { return '<div style="font-size:11.5px;padding:2px 0;color:' + (x.sev === 'gap' ? '#8E2A2A' : '#9A6200') + ';">&#9679; <b>' + (x.kind === 'co-located' ? 'Co-located' : 'Carries over') + '</b> · ' + _esc(x.text) + '</div>'; }).join('')
            : '<div style="font-size:11.5px;color:#1E7A34;">No susceptible item shares a zone, or an unbarriered neighboring zone, with an emitter of its threat.</div>';
        var unrec = u.length ? '<div style="font-size:11px;color:#9A6200;margin-top:4px;">' + u.length + ' placed item' + (u.length === 1 ? '' : 's') + ' with no threat record yet: ' + u.slice(0, 8).map(function (x) { return _esc(_sysName(x.item)); }).join(', ') + (u.length > 8 ? ' +' + (u.length - 8) : '') + '</div>' : '';
        return '<div id="zt-section" style="margin-top:12px;border:1px solid var(--color-border-hair);border-radius:8px;padding:10px;">'
            + '<div style="font-weight:700;color:var(--color-text-primary);font-size:12.5px;">Per-item threats (what each item emits, what it is susceptible to)</div>'
            + '<div style="font-size:11px;color:#55555C;margin-bottom:4px;">Heat, fluid, debris, EMI, vibration; emitted in normal, abnormal or failed operation. A susceptible item next to an emitter is a co-location; an emitter in an adjacent zone with no substantiated barrier carries over. ARP4761A Appendix K, own words.</div>'
            + body
            + '<div style="margin-top:10px;font-weight:700;font-size:12px;color:var(--color-text-primary);">Findings: ' + f.length + ' (' + gaps + ' permanent exposure' + (gaps === 1 ? '' : 's') + ', ' + (f.length - gaps) + ' failure sequence' + (f.length - gaps === 1 ? '' : 's') + ' to assess)</div>'
            + list + unrec + '</div>';
    }
    function renderSection() {
        var d = root.document; if (!d) return false;
        var host = d.getElementById('view-zonal'); if (!host) return false;
        var html = sectionHtml(); if (!html) return false;
        var old = d.getElementById('zt-section');
        if (old) { old.outerHTML = html; return true; }
        // The page renders one wrapper div; the section goes at the end of it.
        var wrapper = host.firstElementChild || host;
        wrapper.insertAdjacentHTML('beforeend', html);
        return true;
    }
    function _wrapRender() {
        var orig = root._renderZonalPage;
        if (typeof orig !== 'function' || orig._ztWrapped) return false;
        var w = function () { var r = orig.apply(this, arguments); try { renderSection(); } catch (_) {} return r; };
        w._ztWrapped = true; root._renderZonalPage = w; return true;
    }
    (function hook(tries) {
        if (!_wrapRender() && tries > 0 && typeof setTimeout === 'function') setTimeout(function () { hook(tries - 1); }, 100);
    })(50);

    var api = { THREATS: THREATS, STATES: STATES, record: record, has: has, setEmit: setEmit, setSusceptible: setSusceptible, setNote: setNote,
                adjacent: adjacent, blocked: blocked, zoneProfile: zoneProfile, findings: findings, unrecorded: unrecorded, INV: INV,
                itemEditorHtml: itemEditorHtml, sectionHtml: sectionHtml, renderSection: renderSection, _wrapRender: _wrapRender };
    try { root.SLZonalThreats = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
