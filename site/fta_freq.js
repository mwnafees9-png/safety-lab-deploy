// ============================================================================
// fta_freq.js — v1.1 — ARP-G12: failure FREQUENCY alongside unavailability.
//
// G.11 quantifies the probability of BEING failed (unavailability, Q).
// G.12 quantifies the rate of BECOMING failed (failure frequency, w) — the
// quantity a frequency-domain objective and a supplier's rate-based tree
// actually speak. This module adds the G.12 answer on top of the SAME exact
// BDD the tool already trusts:
//
//     w_top = Σ_i  IB_i · w_i
//
// where IB_i is the EXACT Birnbaum importance of event i (∂Q_top/∂q_i,
// computed by cofactoring the compiled BDD — the same twiddle the existing
// importance measures use) and w_i is the event's unconditional failure
// intensity by its own model:
//
//   · unmaintained / default   w = λ·(1−q)      q = the SAME probability the
//                                                BDD used (probMap) — the
//                                                named number IS the engine's
//   · continuous repair (μ>0)  w = λ·μ/(λ+μ)    = λ·(1−q_ss)
//   · periodic inspection      w = λ·(1−q̄)     q̄ from the engine's own map
//   · supplier-provided        w = node.supplierW  (typed, cited via
//                                node.supplierWBasis — supplier trees enter
//                                in the frequency domain without conversion)
//   · probability-only event   w = 0 — an ENABLER: it conditions the others'
//                                Birnbaum but has no intensity of its own.
//                                Named in the receipt, never guessed.
//   · Markov-attached event    REFUSED (w treated 0 + loud flag): frequency
//                                from an attached Markov model needs
//                                transition-level analysis — not v1, and the
//                                refusal is the feature.
//   · CCF group rows           w = 0 + loud LOWER-BOUND flag: the group's
//                                probability is in the BDD but its intensity
//                                is not decomposed in v1.
//
// Conversion (the honest, stated kind): expected failures per flight
// N ≈ w_top · T_mission, and w_top itself is the per-FH figure. No
// frequency is ever invented for an event that lacks a rate.
//
// LANE DISCIPLINE (v1.1): frequency is a VERIFICATION-tree question. Top-down
// allocation trees carry probability BUDGETS only — the allocator strips λ by
// design (helpers: top-down mode deletes n.lambda) — so sweeping them would
// class every budget as an "enabler", which is noise wearing a receipt. The
// sweep computes on verification trees (p.verifies || mode 'bottom-up', the
// same test the rest of the house uses) and names the skip on allocation
// trees, pointing at the verification mirror when one exists.
//
// Display-lane: pure computation + a born-modular page ('Frequency (G.12)'
// under Trees & models). Zero store writes. Loads in any order; without the
// quant engine it refuses with a named reason instead of half an answer.
// ============================================================================
(function () {
    var _sevPill = function (s, o) { return (typeof sevPillHtml === 'function') ? sevPillHtml(s, o) : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }; // severity pill (helpers_modules.js); safe when helpers is not loaded (test sandboxes)
    'use strict';

    function _enginesPresent() {
        return typeof computeExactProbability === 'function' && typeof BDD !== 'undefined' && BDD && typeof BDD.probability === 'function';
    }
    function _lambdaOf(node) {
        try { if (typeof getEffectiveLambda === 'function') { const l = getEffectiveLambda(node); if (isFinite(l) && l > 0) return l; } } catch (_) {}
        const l = parseFloat(node && node.lambda);
        return (isFinite(l) && l > 0) ? l : 0;
    }

    // ---- the core -----------------------------------------------------------
    function computeFrequency(rootNode) {
        if (!_enginesPresent()) return { ok: false, reason: 'quantification engine not loaded — no frequency without the exact BDD' };
        if (!rootNode) return { ok: false, reason: 'empty tree' };
        let ex;
        try { ex = computeExactProbability(rootNode); }
        catch (e) { return { ok: false, reason: 'engine refusal: ' + ((e && e.message) || e) }; }
        if (!ex || !ex.bdd || !ex.varOrder) return { ok: false, reason: 'engine returned no BDD' };
        const { bdd, varOrder, varMeta, probMap } = ex;
        const pTop = ex.prob;
        const T = (function () { try { return (typeof ftaConfig === 'object' && ftaConfig && parseFloat(ftaConfig.exposureTime)) || 1; } catch (_) { return 1; } })();

        const rows = [];
        const flags = { ccfGroups: 0, markovRefused: 0, enablers: 0, suppliers: 0 };
        let wTop = 0;
        varOrder.forEach(function (refNode, varIdx) {
            const meta = varMeta && varMeta[varIdx];
            const p = probMap.get(varIdx) || 0;
            // exact Birnbaum by cofactoring — the same twiddle as the importance measures
            const m1 = new Map(probMap); m1.set(varIdx, 1);
            const m0 = new Map(probMap); m0.set(varIdx, 0);
            const IB = BDD.probability(bdd, m1) - BDD.probability(bdd, m0);

            let cls, w = 0, note = '';
            if (meta && meta.type === 'group') {
                cls = 'ccf-group'; flags.ccfGroups++;
                note = 'CCF group row — probability is in the BDD, intensity not decomposed in v1 (LOWER BOUND)';
            } else if (refNode && refNode.markovModelId) {
                cls = 'markov-refused'; flags.markovRefused++;
                note = 'REFUSED: frequency from an attached Markov model needs transition-level analysis — supply λ directly or detach';
            } else if (refNode && isFinite(parseFloat(refNode.supplierW)) && parseFloat(refNode.supplierW) > 0) {
                cls = 'supplier'; flags.suppliers++;
                w = parseFloat(refNode.supplierW);
                note = 'supplier-provided frequency' + (refNode.supplierWBasis ? ' — ' + String(refNode.supplierWBasis) : ' — NO BASIS CITED (cite it)');
            } else {
                const lam = _lambdaOf(refNode);
                if (!(lam > 0)) {
                    cls = 'enabler'; flags.enablers++;
                    note = 'probability-only event — conditions the others (enabler), no failure intensity of its own; supply λ or a supplier frequency to treat as initiator';
                } else {
                    const model = (refNode && refNode.repairModel) || 'unmaintained';
                    if (model === 'continuous' && refNode && parseFloat(refNode.mu) > 0) {
                        const mu = parseFloat(refNode.mu);
                        cls = 'repairable'; w = lam * mu / (lam + mu);
                        note = 'continuous repair — w = λμ/(λ+μ)';
                    } else if (model === 'periodic') {
                        cls = 'periodic'; w = lam * (1 - p);
                        note = 'periodic inspection — w = λ(1−q̄), q̄ from the engine';
                    } else {
                        cls = 'initiator'; w = lam * (1 - p);
                        note = 'w = λ(1−q), q = the engine’s own probability for this event';
                    }
                }
            }
            const contrib = IB * w;
            wTop += contrib;
            rows.push({ name: (refNode && (refNode.displayId || refNode.name)) || ('var ' + varIdx),
                        cls: cls, p: p, IB: IB, lambda: _lambdaOf(refNode), w: w, contrib: contrib, note: note });
        });
        rows.forEach(function (r) { r.share = wTop > 0 ? r.contrib / wTop : 0; });
        rows.sort(function (a, b) { return b.contrib - a.contrib; });
        return { ok: true, wTop: wTop, nPerFlight: wTop * T, T: T, pTop: pTop,
                 lowerBound: flags.ccfGroups > 0, flags: flags, rows: rows, bddSize: ex.bddSize };
    }

    // ---- page ---------------------------------------------------------------
    const esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    const fmt = function (x) { return (x == null || !isFinite(x)) ? '—' : (x === 0 ? '0' : x.toExponential(3)); };
    function _sevOfPage(p) {
        try {
            const ids = (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds : (p.linkedFhaId ? [p.linkedFhaId] : []);
            const all = [].concat((typeof acFhaData !== 'undefined' ? acFhaData : []) || [],
                                  (typeof getAllSysFha === 'function' ? getAllSysFha() : []));
            let best = null; const rank = { 'Catastrophic': 5, 'Hazardous': 4, 'Major': 3, 'Minor': 2 };
            ids.forEach(function (id) {
                const f = all.find(function (x) { return x && String(x.internalId) === String(id).replace('AC_', '').replace('SYS_', ''); });
                if (f && rank[f.severity] && (!best || rank[f.severity] > rank[best])) best = f.severity;
            });
            return best;
        } catch (_) { return null; }
    }
    function sweep() {
        const out = [];
        const pages = ((typeof ftaPages !== 'undefined' ? ftaPages : []) || []);
        pages.forEach(function (p) {
            if (!p || !p.root) return;
            // The house test for a verification tree (same as helpers/fta_view):
            // a mirror page (p.verifies) or an explicitly bottom-up page.
            const isVerification = !!p.verifies || (p.mode === 'bottom-up');
            let r;
            if (!isVerification) {
                const mirror = pages.find(function (x) { return x && x.verifies === p.id; });
                r = { ok: false, allocation: true,
                      reason: 'top-down allocation — probability budgets only (the allocator strips λ by design); the frequency question belongs to the verification tree' +
                              (mirror ? ' — see ' + (mirror.name || ('FT-' + mirror.id)) : ' (no verification mirror yet)') };
            } else {
                try { r = computeFrequency(p.root); } catch (e) { r = { ok: false, reason: String((e && e.message) || e) }; }
            }
            out.push({ pageId: p.id, page: p.name || ('FT-' + p.id), severity: _sevOfPage(p), verification: isVerification, res: r });
        });
        return out;
    }
    function _ensurePage() {
        if (typeof document === 'undefined') return false;
        if (!document.getElementById('view-freq')) {
            const prev = document.getElementById('view-expcase') || document.getElementById('view-monitors') || document.getElementById('view-bowtie');
            if (!prev || !prev.parentNode) return false;
            const v = document.createElement('div'); v.id = 'view-freq'; v.style.display = 'none';
            prev.parentNode.insertBefore(v, prev.nextSibling);
        }
        if (!document.getElementById('snav-freq')) {
            const prevNav = document.getElementById('snav-expcase') || document.getElementById('snav-monitors');
            // 23 Aug 2026 — no nav row: a Fault-trees TAB now (prove_tabs.js), label clean of clause numbers.
        }
        return true;
    }
    function _render() {
        if (typeof document === 'undefined') return;
        const host = document.getElementById('view-freq'); if (!host) return;
        const trees = sweep();
        const chip = function (txt, col) { return '<span class="u-mono" style="font-size:9.5px; font-weight:700; color:' + col + '; border:1px solid ' + col + '55; background:' + col + '0D; border-radius:4px; padding:1px 7px;">' + esc(txt) + '</span>'; };
        host.innerHTML =
            '<div class="header-with-export"><h3>Failure frequency <span class="u-mono" style="font-size:10.5px; font-weight:700; color:#6D28D9; border:1px solid #6D28D955; background:#6D28D90D; border-radius:5px; padding:2px 8px; vertical-align:3px;">ARP4761A G.12</span></h3></div>' +
            '<p style="font-size:12.5px; color:var(--color-text-secondary); ">G.11 answers the probability of BEING failed; G.12 answers the rate of BECOMING failed — the quantity supplier trees and frequency-domain objectives speak. Computed as w = Σ IB·w over the SAME exact BDD as the probability run, so the two lanes can never quietly disagree. An event with no rate contributes no frequency: enablers are named, Markov attachments are refused, CCF group rows make the figure a stated LOWER BOUND — never a silent one. Frequency is a VERIFICATION-tree question: top-down allocation trees carry probability budgets only (the allocator strips λ by design), so they are listed but never computed — their frequency lives on the verification mirror.</p>' +
            (!trees.length ? '<div style="font-size:12px; color:var(--color-text-tertiary); padding:14px;">No fault trees yet.</div>' :
             trees.map(function (t) {
                const r = t.res;
                return '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); border-radius:8px; padding:10px 14px; margin-bottom:10px;">' +
                    '<div style="display:flex; justify-content:space-between; align-items:center;">' +
                    '<b style="font-size:12.5px;">' + esc(t.page) + '</b><span>' +
                    (t.severity ? _sevPill(t.severity) + ' ' : '') +
                    (r.ok ? chip('w = ' + fmt(r.wTop) + ' /FH', '#1F3A5F') : (r.allocation ? chip('ALLOCATION — no frequency lane', '#7C8797') : chip('REFUSED', '#B91C1C'))) + '</span></div>' +
                    (!r.ok ? '<div style="font-size:11.5px; color:' + (r.allocation ? 'var(--color-text-tertiary)' : '#B91C1C') + '; margin-top:4px;">' + esc(r.reason) + '</div>' :
                        '<div class="u-mono" style="font-size:11px; color:var(--color-text-secondary); margin-top:4px;">Q(top) = ' + fmt(r.pTop) + ' · w(top) = ' + fmt(r.wTop) + ' /FH · expected failures per flight ≈ ' + fmt(r.nPerFlight) + ' (T = ' + r.T + ' FH)' + (r.lowerBound ? ' · <b style="color:#B7791F;">LOWER BOUND — ' + r.flags.ccfGroups + ' CCF group row(s) not decomposed</b>' : '') + '</div>' +
                        ((r.flags.markovRefused || r.flags.enablers || r.flags.suppliers) ?
                            '<div style="font-size:10.5px; color:var(--color-text-tertiary); margin-top:2px;">' +
                            (r.flags.markovRefused ? r.flags.markovRefused + ' Markov-attached event(s) REFUSED · ' : '') +
                            (r.flags.enablers ? r.flags.enablers + ' probability-only enabler(s) · ' : '') +
                            (r.flags.suppliers ? r.flags.suppliers + ' supplier frequenc(ies) in the frequency domain' : '') + '</div>' : '') +
                        '<table class="data-table" style="width:100%; font-size:11px; margin-top:6px;"><thead><tr><th>Event</th><th>Class</th><th>q</th><th>IB (exact)</th><th>λ /FH</th><th>w /FH</th><th>IB·w</th><th>Share</th></tr></thead><tbody>' +
                        r.rows.slice(0, 12).map(function (x) {
                            return '<tr title="' + esc(x.note) + '"><td>' + esc(x.name) + '</td><td class="u-mono" style="font-size:9.5px;">' + esc(x.cls.toUpperCase()) + '</td>' +
                                '<td class="u-mono">' + fmt(x.p) + '</td><td class="u-mono">' + fmt(x.IB) + '</td><td class="u-mono">' + fmt(x.lambda) + '</td>' +
                                '<td class="u-mono">' + fmt(x.w) + '</td><td class="u-mono">' + fmt(x.contrib) + '</td><td class="u-mono">' + (x.share ? (x.share * 100).toFixed(1) + '%' : '—') + '</td></tr>';
                        }).join('') + '</tbody></table>' +
                        (r.rows.length > 12 ? '<div style="font-size:10px; color:var(--color-text-tertiary); margin-top:3px;">Top 12 of ' + r.rows.length + ' by contribution — the evidence package carries them all.</div>' : '')) +
                    '</div>';
             }).join('')) +
            '<div style="font-size:10.5px; color:var(--color-text-tertiary); margin-top:8px;">Receipt discipline: every event names its class and its formula in the tooltip; a hover answers "where did this w come from" without leaving the page.</div>';
    }

    const API = { computeFrequency: computeFrequency, sweep: sweep, render: _render };
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        (function wrapNav() {
            if (typeof window.switchTab !== 'function' || window.switchTab._freqWrapped) return;
            const orig = window.switchTab;
            const wrapped = function (tabId) {
                const r = orig.apply(this, arguments);
                try {
                    const v = document.getElementById('view-freq');
                    if (v) v.style.display = (tabId === 'freq') ? 'block' : 'none';
                    const sn = document.getElementById('snav-freq');
                    if (sn) sn.classList.toggle('snav-active', tabId === 'freq');
                    if (tabId === 'freq') _render();
                } catch (_) {}
                return r;
            };
            wrapped._freqWrapped = true;
            window.switchTab = wrapped;
        })();
        (function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); })(function () {
            let tries = 30; const t = setInterval(function () { if (_ensurePage() || --tries <= 0) clearInterval(t); }, 250);
        });
    }
    if (typeof window !== 'undefined') window.FTA_FREQ = API;
    if (typeof module !== 'undefined') module.exports = API;
})();
