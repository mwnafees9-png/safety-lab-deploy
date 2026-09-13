// 13 Sep 2026 (R19 step 2): every fire-and-forget promise chain in this file now ends in .catch → SLErrorWatch.report(e, module), so a failure is recorded and told to the person instead of dying in the console.
// ============================================================================
// fracas_ledger.js — v0.1 — FRACAS-2: the incident ledger + workflow layer.
//
// The existing FRACAS (ram_modules) is the STATISTICIAN — field records with
// hours/failures, chi-square LCB vs prediction, verdicts feeding MSG-3 and
// dispatch. This module adds the CASE MANAGER underneath it: per-event
// incident records with the workflow fields (failure mode, severity, RCA
// method, containment, corrective + preventive actions, responsible, target
// date, status lifecycle, repair time, downtime), living ON each field
// record (f.incidents[]) so persistence rides projectConfig.ram for free.
//
// THE FEED RULE — the case manager feeds the statistician, nothing is
// double-entered: when a record has incidents, its FAILURE COUNT is the
// incident count (computed, not typed). Hours stay authored — operating
// hours are fleet data, not a sum of events. ramFieldRows is wrapped so
// point / LCB / verdict recompute from the fed count under the exact same
// discipline (same chi-square LCB helper, same confidence source).
//
// DOCTRINE:
//   · VERIFICATION OF EFFECTIVENESS is the two-posture rule in overalls: an
//     incident does not CLOSE, and a corrective action is only CLAIMED,
//     until a named verifier signs the effectiveness check. Closing without
//     one is refused.
//   · RECURRENCE is the FRACAS-iest signal there is: the same failure mode
//     twice on the same record flags loudly — a repeat failure means the
//     corrective action didn't.
//   · LESSONS LEARNED are candidate typed assumptions, not a text graveyard:
//     each lesson offers a copy-ready assumption seed for the register —
//     seeded by a human, never auto-written.
//   · KPIs are computed, never stored: MTTR = Σ repair / repaired-count;
//     availability = MTBF/(MTBF+MTTR); recurrence rate = repeats/total.
//   · NO EVAL (the CSP lesson); all writes through the single author adapter.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
    const STATUSES = ['open', 'investigating', 'closed'];
    const RCA_METHODS = ['5-why', 'fishbone', 'FTA', 'other'];

    function _ram() {
        if (typeof projectConfig === 'undefined' || !projectConfig || !projectConfig.ram) return null;
        return projectConfig.ram;
    }
    function _rec(recId) {
        const r = _ram();
        return r ? (r.field || []).find(f => f && f.id === recId) : null;
    }
    function _incs(f) {
        if (!Array.isArray(f.incidents)) f.incidents = [];
        return f.incidents;
    }
    function _save() { try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); else if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }
    function _toast(m, k, t) { try { if (typeof showToast === 'function') showToast(m, k || 'info', t || 4200); } catch (_) {} }

    // ------------------------------------------------------- author adapter
    // The ONLY mutation sites. Refusal over repair throughout.
    function addIncident(recId, inc) {
        const f = _rec(recId);
        if (!f) throw new Error('fracas: field record ' + recId + ' not found');
        inc = inc || {};
        const date = String(inc.date || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('fracas: incident date required (YYYY-MM-DD) — an undated failure is folklore, not data');
        const desc = String(inc.desc || '').trim();
        if (desc.length < 5) throw new Error('fracas: failure description required (≥5 chars)');
        const mode = String(inc.mode || '').trim();
        if (!mode) throw new Error('fracas: failure MODE required — recurrence detection keys on it');
        const severity = String(inc.severity || '').trim();
        if (SEVERITIES.indexOf(severity) < 0) throw new Error('fracas: severity must be one of ' + SEVERITIES.join('/'));
        const repair = inc.repairHrs == null || inc.repairHrs === '' ? null : +inc.repairHrs;
        const down = inc.downtimeHrs == null || inc.downtimeHrs === '' ? null : +inc.downtimeHrs;
        if (repair != null && !(repair >= 0)) throw new Error('fracas: repair hours must be ≥ 0');
        if (down != null && !(down >= 0)) throw new Error('fracas: downtime hours must be ≥ 0');
        const incs = _incs(f);
        const nid = 'INC-' + String((f._incCounter = (f._incCounter || 0) + 1)).padStart(3, '0');
        incs.push({
            id: nid, date: date, desc: desc, mode: mode, severity: severity,
            rcaMethod: RCA_METHODS.indexOf(inc.rcaMethod) >= 0 ? inc.rcaMethod : 'other',
            containment: String(inc.containment || '').trim() || null,
            corrective: String(inc.corrective || '').trim() || null,
            preventive: String(inc.preventive || '').trim() || null,
            responsible: String(inc.responsible || '').trim() || null,
            targetDate: /^\d{4}-\d{2}-\d{2}$/.test(String(inc.targetDate || '')) ? inc.targetDate : null,
            status: 'open',
            repairHrs: repair, downtimeHrs: down,
            verifiedBy: null, verifiedAt: null, lesson: null
        });
        _save();
        return nid;
    }
    function setStatus(recId, incId, status, opts) {
        const f = _rec(recId);
        const inc = f && _incs(f).find(x => x.id === incId);
        if (!inc) throw new Error('fracas: incident not found');
        if (STATUSES.indexOf(status) < 0) throw new Error('fracas: status must be ' + STATUSES.join('/'));
        if (status === 'closed') {
            const vb = String((opts && opts.verifiedBy) || '').trim();
            if (!vb) throw new Error('fracas: an incident does not CLOSE until a named verifier signs the effectiveness check — a corrective action is only CLAIMED until verified. Verify it, or leave it investigating.');
            if (!inc.corrective) throw new Error('fracas: cannot close without a corrective action on record — what exactly was verified effective?');
            inc.verifiedBy = vb;
            inc.verifiedAt = (opts && opts.verifiedAt) || new Date().toISOString().slice(0, 10);
        }
        inc.status = status;
        _save();
        return inc;
    }
    function setFields(recId, incId, patch) {
        const f = _rec(recId);
        const inc = f && _incs(f).find(x => x.id === incId);
        if (!inc) throw new Error('fracas: incident not found');
        ['containment', 'corrective', 'preventive', 'responsible', 'lesson'].forEach(k => {
            if (patch && patch[k] != null) inc[k] = String(patch[k]).trim() || null;
        });
        if (patch && patch.repairHrs != null) { const v = +patch.repairHrs; if (!(v >= 0)) throw new Error('fracas: repair hours must be ≥ 0'); inc.repairHrs = v; }
        if (patch && patch.downtimeHrs != null) { const v = +patch.downtimeHrs; if (!(v >= 0)) throw new Error('fracas: downtime hours must be ≥ 0'); inc.downtimeHrs = v; }
        _save();
        return inc;
    }

    // ------------------------------------------------------- computed reads
    function effectiveFailures(f) {
        const incs = Array.isArray(f.incidents) ? f.incidents : [];
        return incs.length ? incs.length : (f.failures != null ? f.failures : null);
    }
    function kpis(f) {
        const incs = Array.isArray(f.incidents) ? f.incidents : [];
        const reps = incs.filter(i => i.repairHrs != null);
        const mttr = reps.length ? reps.reduce((a, i) => a + i.repairHrs, 0) / reps.length : null;
        const fails = effectiveFailures(f);
        const mtbf = (f.hours > 0 && fails > 0) ? f.hours / fails : null;
        const availability = (mtbf != null && mttr != null) ? mtbf / (mtbf + mttr) * 100 : null;
        // recurrence: same failure mode more than once on the same record
        const byMode = {};
        incs.forEach(i => { const k = i.mode.toLowerCase(); byMode[k] = (byMode[k] || 0) + 1; });
        const flaggedModes = Object.keys(byMode).filter(k => byMode[k] >= 2);
        const repeats = flaggedModes.reduce((a, k) => a + byMode[k] - 1, 0);
        return {
            incidents: incs.length,
            open: incs.filter(i => i.status !== 'closed').length,
            unverifiedClaims: incs.filter(i => i.corrective && i.status !== 'closed').length,
            mttrHrs: mttr, mtbfHrs: mtbf, availabilityPct: availability,
            recurrence: { repeats: repeats, total: incs.length,
                          ratePct: incs.length ? repeats / incs.length * 100 : 0, flaggedModes: flaggedModes },
            basis: 'MTTR = Σ repair / repaired-count · availability = MTBF/(MTBF+MTTR) · recurrence = repeats/total (same mode, same record). Computed, never stored.'
        };
    }
    function assumptionSeed(recId, incId) {
        const f = _rec(recId);
        const inc = f && (f.incidents || []).find(x => x.id === incId);
        if (!inc || !inc.lesson) return null;
        return 'It is assumed that ' + inc.lesson.replace(/\.$/, '') +
               ' [seeded from FRACAS ' + f.id + '/' + inc.id + ', mode: ' + inc.mode + '; validate before credit]';
    }

    // -------------------------------------------------- feed the statistician
    // Wrap ramFieldRows: records WITH incidents recompute failures/point/LCB/
    // verdict from the fed count — same LCB helper, same confidence source,
    // same verdict discipline as ram_modules.
    const RAM_CONF_FALLBACK = 0.60;
    function _conf() { try { const v = typeof window._ramConfidence === 'function' ? window._ramConfidence() : null; return (v > 0 && v < 1) ? v : RAM_CONF_FALLBACK; } catch (_) { return RAM_CONF_FALLBACK; } }
    function _wrapRows() {
        if (typeof window === 'undefined' || typeof window.ramFieldRows !== 'function' || window.ramFieldRows._flWrapped) return;
        const orig = window.ramFieldRows;
        const wrapped = function () {
            const rows = orig.apply(this, arguments);
            const lcbFn = window._ramMtbfLcb;
            return rows.map(x => {
                const incs = Array.isArray(x.f.incidents) ? x.f.incidents : [];
                if (!incs.length) return x;
                const failures = incs.length;
                const statistical = x.f.hours > 0;
                const point = statistical ? x.f.hours / failures : x.point;
                const lcb = (statistical && typeof lcbFn === 'function') ? lcbFn(x.f.hours, failures, _conf()) : null;
                let verdict = x.verdict;
                if (x.predicted != null && statistical) {
                    if (lcb != null && lcb >= x.predicted) verdict = 'verified';
                    else if (point != null && point < x.predicted) verdict = 'finding';
                    else verdict = 'inconclusive';
                }
                return Object.assign({}, x, { fedFailures: failures, statistical: statistical, point: point, lcb: lcb, verdict: verdict, fedByLedger: true });
            });
        };
        wrapped._flWrapped = true;
        window.ramFieldRows = wrapped;
    }

    // ------------------------------------------------------------------- UI
    const IN = 'style="font:inherit; font-size:11px; padding:3px 5px; margin:0; border:1px solid var(--color-border-strong); background:var(--color-surface-2); color:inherit; border-radius:4px;"';
    function _sevChip(sv) {
        const c = sv === 'Critical' ? '#8E2A2A' : sv === 'High' ? '#B45309' : sv === 'Medium' ? '#9A6200' : '#556';
        return '<span class="u-mono" style="font-size:9.5px; font-weight:700; color:' + c + '; border:1px solid ' + c + '55; border-radius:4px; padding:1px 6px;">' + _esc(sv.toUpperCase()) + '</span>';
    }
    function renderLedger() {
        if (typeof document === 'undefined') return;
        const host = document.getElementById('ram-rel-host');
        if (!host) return;
        let card = document.getElementById('fl-card');
        const ram = _ram();
        if (!ram || !(ram.field || []).length) { if (card) card.remove(); return; }
        if (!card) {
            card = document.createElement('div');
            card.id = 'fl-card';
            host.appendChild(card);
        }
        card.innerHTML =
            '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-top:18px;">' +
            '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary); display:flex; justify-content:space-between; gap:10px; align-items:center;">' +
            '<b>FRACAS incident ledger — the case manager under the statistician</b>' +
            '<span class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary);">events feed the failure counts; nothing is double-entered</span></div>' +
            (ram.field || []).map(f => {
                const k = kpis(f);
                const incs = Array.isArray(f.incidents) ? f.incidents : [];
                const chip = (label, v, warn) => v == null ? '' :
                    '<span class="u-mono" style="font-size:10px; font-weight:700; padding:2px 8px; border-radius:5px; border:1px solid ' +
                    (warn ? '#B7791F' : 'var(--color-border-strong)') + '; color:' + (warn ? '#B7791F' : 'inherit') + ';">' + label + ' ' + v + '</span>';
                return '<div style="padding:10px 14px; border-bottom:1px solid var(--color-border);">' +
                    '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">' +
                    '<b class="u-mono" style="font-size:11.5px;">' + _esc(f.id) + '</b>' +
                    '<span style="font-size:11px; color:var(--color-text-secondary);">' + _esc(f.beRef || '') + '</span>' +
                    chip('incidents', k.incidents) +
                    (k.mttrHrs != null ? chip('MTTR', k.mttrHrs.toFixed(1) + ' h') : '') +
                    (k.availabilityPct != null ? chip('availability', k.availabilityPct.toFixed(2) + '%') : '') +
                    (k.recurrence.repeats ? chip('⟳ RECURRENCE', k.recurrence.repeats + '× (' + k.recurrence.flaggedModes.join(', ') + ') — the corrective action didn’t', true) : '') +
                    (k.unverifiedClaims ? chip('unverified actions', k.unverifiedClaims, true) : '') +
                    '</div>' +
                    (incs.length ? '<table class="data-table" style="width:100%; font-size:11.5px; margin-top:7px;"><thead><tr><th>Inc</th><th>Date</th><th>Mode</th><th>Sev</th><th>Description</th><th>Corrective</th><th>Status</th><th>Repair h</th><th></th></tr></thead><tbody>' +
                        incs.map(i =>
                            '<tr><td class="u-mono">' + _esc(i.id) + '</td><td class="u-mono">' + _esc(i.date) + '</td><td>' + _esc(i.mode) + '</td><td>' + _sevChip(i.severity) + '</td>' +
                            '<td>' + _esc(i.desc) + (i.lesson ? '<br><span style="font-size:10.5px; color:var(--color-text-tertiary);">lesson: ' + _esc(i.lesson) + ' <button class="u-mono" style="font-size:9.5px; cursor:pointer; border:1px solid var(--color-border-strong); background:var(--color-surface-2); border-radius:4px; padding:0 6px;" onclick="FRACAS_LEDGER.copySeed(\'' + _esc(f.id) + '\',\'' + _esc(i.id) + '\', this)">copy assumption seed</button></span>' : '') + '</td>' +
                            '<td style="font-size:11px;">' + _esc(i.corrective || '—') + (i.verifiedBy ? '<br><span class="u-mono" style="font-size:9.5px; color:#1D9E75;">VERIFIED EFFECTIVE — ' + _esc(i.verifiedBy) + ' · ' + _esc(i.verifiedAt || '') + '</span>' : (i.corrective ? '<br><span class="u-mono" style="font-size:9.5px; color:#B7791F;">CLAIMED — not yet verified</span>' : '')) + '</td>' +
                            '<td><span class="u-mono" style="font-size:10px; font-weight:700; color:' + (i.status === 'closed' ? '#1D9E75' : i.status === 'investigating' ? '#9A6200' : '#B7791F') + ';">' + i.status.toUpperCase() + '</span></td>' +
                            '<td class="u-mono">' + (i.repairHrs != null ? i.repairHrs : '—') + '</td>' +
                            '<td style="white-space:nowrap;">' +
                            (i.status !== 'closed' ? '<button class="u-mono" style="font-size:9.5px; cursor:pointer; border:1px solid var(--color-border-strong); background:var(--color-surface-2); border-radius:4px; padding:1px 6px;" onclick="FRACAS_LEDGER.uiAdvance(\'' + _esc(f.id) + '\',\'' + _esc(i.id) + '\')">' + (i.status === 'open' ? 'investigate' : 'close…') + '</button>' : '') +
                            ' <button class="u-mono" style="font-size:9.5px; cursor:pointer; border:1px solid var(--color-border-strong); background:var(--color-surface-2); border-radius:4px; padding:1px 6px;" onclick="FRACAS_LEDGER.uiEdit(\'' + _esc(f.id) + '\',\'' + _esc(i.id) + '\')">edit…</button></td></tr>').join('') +
                        '</tbody></table>' : '<div style="font-size:11px; color:var(--color-text-tertiary); margin-top:5px;">No incidents logged — the statistical fields above stand alone until events arrive.</div>') +
                    '<div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:7px;">' +
                    '<input id="fl-d-' + _esc(f.id) + '" ' + IN + ' placeholder="YYYY-MM-DD" size="10">' +
                    '<input id="fl-m-' + _esc(f.id) + '" ' + IN + ' placeholder="failure mode" size="14">' +
                    '<select id="fl-s-' + _esc(f.id) + '" ' + IN + '>' + SEVERITIES.map(s2 => '<option>' + s2 + '</option>').join('') + '</select>' +
                    '<input id="fl-x-' + _esc(f.id) + '" ' + IN + ' placeholder="failure description" size="26">' +
                    '<input id="fl-r-' + _esc(f.id) + '" ' + IN + ' placeholder="repair h" size="7">' +
                    '<button class="u-mono" style="font-size:10px; font-weight:700; cursor:pointer; border:1px solid #1D9E75; color:#1D9E75; background:#1D9E750D; border-radius:5px; padding:3px 10px;" onclick="FRACAS_LEDGER.uiAdd(\'' + _esc(f.id) + '\')">+ log incident</button>' +
                    '</div></div>';
            }).join('') +
            '<div style="padding:7px 14px; font-size:10.5px; color:var(--color-text-tertiary);">Closing an incident requires a NAMED effectiveness verifier — a corrective action is only claimed until verified. Lessons become assumption seeds for the register, by hand, never automatically.</div>' +
            '</div>';
    }

    function _ask(msg, dflt) {
        if (typeof slPrompt === 'function') return slPrompt(msg, dflt || '');
        return Promise.resolve(typeof prompt === 'function' ? prompt(msg, dflt || '') : null);
    }
    const API = {
        addIncident, setStatus, setFields, kpis, effectiveFailures, assumptionSeed, renderLedger,
        SEVERITIES, STATUSES, RCA_METHODS,
        uiAdd: function (recId) {
            const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
            try {
                addIncident(recId, { date: g('fl-d-' + recId), mode: g('fl-m-' + recId), severity: g('fl-s-' + recId),
                                     desc: g('fl-x-' + recId), repairHrs: g('fl-r-' + recId) || null });
                renderLedger();
                try { if (typeof renderRamRelPage === 'function') renderRamRelPage(); } catch (_) {}
                _toast('Incident logged — failure count now feeds from the ledger.', 'success');
            } catch (e) { _toast(e.message, 'error', 6000); }
        },
        uiAdvance: function (recId, incId) {
            const f = _rec(recId); const inc = f && (f.incidents || []).find(x => x.id === incId);
            if (!inc) return;
            if (inc.status === 'open') {
                try { setStatus(recId, incId, 'investigating'); renderLedger(); } catch (e) { _toast(e.message, 'error'); }
                return;
            }
            Promise.resolve(_ask('Close ' + incId + ' — corrective action on record:\n"' + (inc.corrective || 'NONE') + '"\n\nName the effectiveness VERIFIER (required; empty aborts):', ''))
                .then(vb => {
                    if (vb == null || !String(vb).trim()) { _toast('Not closed — unverified effectiveness is a claim, not a closure.', 'info'); return; }
                    try {
                        if (!inc.corrective) {
                            return Promise.resolve(_ask('No corrective action on record — state it first:', '')).then(ca => {
                                if (ca == null || !String(ca).trim()) { _toast('Not closed — nothing to verify.', 'info'); return; }
                                setFields(recId, incId, { corrective: ca });
                                setStatus(recId, incId, 'closed', { verifiedBy: String(vb).trim() });
                                renderLedger(); try { renderRamRelPage(); } catch (_) {}
                            });
                        }
                        setStatus(recId, incId, 'closed', { verifiedBy: String(vb).trim() });
                        renderLedger(); try { renderRamRelPage(); } catch (_) {}
                    } catch (e) { _toast(e.message, 'error', 6000); }
                }).catch(function (e) { if (window.SLErrorWatch) SLErrorWatch.report(e, 'fracas_ledger'); });
        },
        uiEdit: function (recId, incId) {
            Promise.resolve(_ask('Edit field — format: field | value\nfields: containment / corrective / preventive / responsible / lesson / repairHrs / downtimeHrs', ''))
                .then(v => {
                    if (v == null || String(v).indexOf('|') < 0) return;
                    const kf = String(v).split('|')[0].trim(); const val = String(v).split('|').slice(1).join('|').trim();
                    try { const p = {}; p[kf] = val; setFields(recId, incId, p); renderLedger(); _toast('Updated ' + kf + '.', 'success', 2600); }
                    catch (e) { _toast(e.message, 'error', 5200); }
                }).catch(function (e) { if (window.SLErrorWatch) SLErrorWatch.report(e, 'fracas_ledger'); });
        },
        copySeed: function (recId, incId, btn) {
            const seed = assumptionSeed(recId, incId);
            if (!seed) return;
            try { if (navigator.clipboard) navigator.clipboard.writeText(seed); if (btn) btn.textContent = 'copied'; } catch (_) {}
        }
    };

    // ------------------------------------------------------------------ wiring
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        (function wire() {
            _wrapRows();
            if (typeof window.renderRamRelPage === 'function' && !window.renderRamRelPage._flWrapped) {
                const orig = window.renderRamRelPage;
                const wrapped = function () { const r = orig.apply(this, arguments); try { setTimeout(renderLedger, 0); } catch (_) {} return r; };
                wrapped._flWrapped = true;
                window.renderRamRelPage = wrapped;
            } else if (!window.renderRamRelPage && typeof window.addEventListener === 'function') {
                window.addEventListener('DOMContentLoaded', () => setTimeout(wire, 600));
            }
        })();
    }

    if (typeof window !== 'undefined') window.FRACAS_LEDGER = API;
    if (typeof module !== 'undefined') module.exports = API;
})();
