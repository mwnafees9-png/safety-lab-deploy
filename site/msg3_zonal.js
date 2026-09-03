// ============================================================================
// msg3_zonal.js — v1.0 — MSG-3 Zonal Inspection program, REUSING the shared
// zonal model (ZONES) + equipment register + inherent-hazard library. BORN
// MODULAR: modal launched from the Zonal Model page. The zone tree authored for
// ZSA (safety) is the SAME tree that drives the MSG-3 zonal maintenance program
// — authored once, two consumers.
//
// MSG-3 zonal logic (ATA MSG-3 Vol 1, Zonal Analysis + EZAP for EWIS):
//   For each zone, derive a candidate inspection from its contents + environment:
//     · EZAP (Enhanced Zonal Analysis Procedure) if the zone contains electrical
//       / EWIS / emitting equipment — wiring degradation & ignition risk.
//     · DET (detailed inspection) if the zone environment carries fluids, heat,
//       or flammable exposure.
//     · GVI (general visual inspection) otherwise.
//   The analyst confirms/overrides and accepts each into the program.
//
// Labels/logic paraphrased (methodology). Source: ATA MSG-3; EZAP per FAA EWIS.
// ============================================================================
(function () {
    'use strict';
    var ROOT = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);
    function _esc(s) { if (typeof esc === 'function') return esc(s); return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _Z() { return ROOT.ZONES; }
    function _E() { return ROOT.EQUIP_HAZARDS; }
    function _sys() { return (typeof systemsData !== 'undefined' ? systemsData : (ROOT.systemsData || [])); }
    function _store() { var pc = (typeof projectConfig !== 'undefined' ? projectConfig : {}); if (!pc.msg3Zonal) pc.msg3Zonal = {}; return pc.msg3Zonal; }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }

    var EWIS_TYPES = { electrical_power: 1, avionics: 1, rf_emitter: 1 };

    function candidate(z) {
        var E = _E();
        var equip = (z.equipment || []).map(function (id) { var s = _sys().find(function (x) { return x.id === id; }) || { name: id }; return { id: id, name: s.name, type: E ? E.systemType(id) : null }; });
        var haz = (E && typeof E.zoneHazards === 'function') ? E.zoneHazards(z.id) : [];
        var mech = {}; haz.forEach(function (h) { mech[h.mechanism] = 1; });
        var ewis = equip.some(function (e) { return e.type && EWIS_TYPES[e.type]; }) || !!mech.em;
        var env = [];
        if (mech.fluid || mech.contamination) env.push('fluid / corrosion');
        if (mech.heat) env.push('heat'); if (mech.vibration) env.push('vibration');
        if (mech.em) env.push('EMI'); if (mech.fire) env.push('flammable');
        var task = ewis ? 'EZAP' : ((mech.fluid || mech.fire || mech.heat) ? 'DET' : 'GVI');
        var rationale = ewis ? 'Electrical / EWIS present — Enhanced Zonal Analysis Procedure.'
            : (task === 'DET' ? 'Fluid / heat / flammable environment — detailed inspection.' : 'General visual inspection.');
        return { zoneId: z.id, code: z.code, name: z.name, equipment: equip.map(function (e) { return e.name; }), envFactors: env, ewis: ewis, task: task, rationale: rationale };
    }
    function candidates() { var Z = _Z(); if (!Z) return []; return Z.all().map(candidate); }

    ROOT.MSG3_ZONAL = { SCHEMA: 'msg3-zonal-1', candidates: candidates, candidate: candidate };

    // ---- UI --------------------------------------------------------------
    ROOT._m3SetTask = function (zoneId, v) { var s = _store(); s[zoneId] = s[zoneId] || {}; s[zoneId].task = v; _save(); _renderModal(); };
    ROOT._m3Accept = function (zoneId) { var s = _store(); s[zoneId] = s[zoneId] || {}; s[zoneId].accepted = !s[zoneId].accepted; _save(); _renderModal(); };
    ROOT._m3CloseModal = function () { var m = document.getElementById('m3z-modal'); if (m) m.remove(); };

    function _renderModal() {
        var m = document.getElementById('m3z-modal'); if (!m) return;
        var store = _store();
        var rows = candidates().map(function (c) {
            var st = store[c.zoneId] || {};
            var task = st.task || c.task;
            var taskSel = ['GVI', 'DET', 'EZAP'].map(function (t) {
                return '<option value="' + t + '"' + (t === task ? ' selected' : '') + '>' + t + '</option>';
            }).join('');
            return '<div style="border-bottom:1px solid #EEF2F8;padding:6px 0;display:flex;align-items:center;gap:8px;font-size:11.5px;">' +
                '<div style="min-width:150px;"><b style="color:#0B2545;">' + _esc(c.code || '') + ' ' + _esc(c.name || '') + '</b>' +
                  '<div style="color:#55555C;font-size:10.5px;">' + _esc(c.equipment.join(', ') || 'no equipment') + '</div></div>' +
                '<div style="flex:1;color:#55555C;">' + (c.envFactors.length ? _esc(c.envFactors.join(', ')) : '—') + (c.ewis ? ' <b style="color:#8E2A2A;">· EWIS</b>' : '') + '</div>' +
                '<select onchange="_m3SetTask(\'' + c.zoneId + '\',this.value)" style="font-size:11px;padding:2px;border:1px solid #D8DEE9;border-radius:5px;">' + taskSel + '</select>' +
                '<button onclick="_m3Accept(\'' + c.zoneId + '\')" style="font-size:10px;padding:1px 8px;border:1px solid ' + (st.accepted ? '#1E7A34' : '#8a8a8a') + ';border-radius:5px;cursor:pointer;background:transparent;color:' + (st.accepted ? '#1E7A34' : '#8a8a8a') + ';">' + (st.accepted ? 'in program ✓' : 'accept') + '</button>' +
                '</div>';
        }).join('') || '<div style="color:#8a8a8a;font-size:12px;padding:12px;">No zones yet — define them on the Zonal Model page. The same tree drives this program.</div>';
        m.querySelector('#m3z-body').innerHTML =
            '<div style="font-size:11.5px;color:#55555C;margin-bottom:6px;">Derived from the shared zonal model — GVI (general visual), DET (detailed), or EZAP (enhanced, for EWIS). Confirm/override the task and accept it into the program.</div>' + rows;
    }

    ROOT.msg3Zonal = function () {
        ROOT._m3CloseModal();
        var ov = document.createElement('div'); ov.id = 'm3z-modal';
        ov.style.cssText = 'position:fixed;inset:0;z-index:2147483601;display:flex;align-items:center;justify-content:center;background:rgba(8,12,20,.5);padding:24px;';
        ov.innerHTML = '<div style="background:#fff;color:#202024;border-radius:14px;max-width:720px;width:100%;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.32);">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid #EEF2F8;">' +
              '<div><div style="font-weight:700;color:#0B2545;">MSG-3 Zonal Inspection program</div>' +
              '<div style="font-size:11.5px;color:#55555C;">Reuses the same zone tree + equipment as ZSA — authored once, two consumers.</div></div>' +
              '<button onclick="_m3CloseModal()" style="border:none;background:transparent;font-size:22px;cursor:pointer;color:#888;">&times;</button></div>' +
            '<div id="m3z-body" style="padding:12px 18px;overflow:auto;"></div></div>';
        ov.addEventListener('mousedown', function (e) { if (e.target === ov) ov.remove(); });
        document.body.appendChild(ov);
        _renderModal();
    };
})();
