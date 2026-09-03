// ============================================================================
// ram_predict.js — v0.5 — RAM-PREDICT (task #95): MIL-HDBK-217F Notice 2
//
// v0.5 (30 Aug 2026, Waqas: "far more intuitive"): the page teaches on empty
// and computes LIVE once rows exist — results render on every change and on
// every visit, no separate compute step needed (the button stays as an
// explicit re-run). The engine, its refusals, and the store are untouched.
// parts-count reliability prediction. The PREDICTED lane of the two-lane
// posture — the FRACAS ledger remains the DEMONSTRATED lane, and the page
// shows the drift between them rather than letting a prediction masquerade
// as evidence.
//
// Method (handbook Appendix A, parts count):
//     λ_EQUIP = Σ  N_i · λg_i · πQ_i      (failures per 10^6 hours)
// λg is the generic failure rate for the part category IN the selected use
// environment; πQ is the part quality factor; N is the count. MTBF = 10^6/λ.
//
// DATA DISCIPLINE — the reason this file contains no numbers:
// every λg and πQ lives in ram_predict_data.js, generated ONLY from a staged
// copy of the actual MIL-HDBK-217F Notice 2 PDF (public-domain US-gov
// handbook — data MAY be stored, unlike licensed spines), each category
// carrying its table + page citation. No staged data ⇒ this engine REFUSES.
// A prediction from remembered numbers is not a prediction, it's a rumor.
//
// Persistence rides projectConfig.ram.predict ({env, rows:[{cat, qty,
// quality}]}) — no new top-level store, no payload edit needed (the fracas
// pattern). projectConfig is a SCRIPT-SCOPE global: bare identifier access
// only (the OPS-MC lesson). Deterministic: no RNG, no Date, no eval.
// ============================================================================
(function () {
    'use strict';

    // ------------------------------------------------------------- data access
    function _db() {
        try { return (typeof window !== 'undefined' && window.RAM_PREDICT_DATA) || null; } catch (_) { return null; }
    }
    function _ram() {
        try {
            if (typeof projectConfig === 'undefined' || !projectConfig) return null;
            if (!projectConfig.ram) return null;
            return projectConfig.ram;
        } catch (_) { return null; }
    }
    // READS DON'T WRITE (battery-caught in v0.1: merely viewing the tab
    // created ram.predict, which autosave then persisted — a store born from
    // a glance). _read() renders defaults without touching the store;
    // _ensure() creates it, and is called ONLY from authored actions.
    function _read() {
        const ram = _ram();
        if (!ram) return null;
        const p = ram.predict;
        return { env: (p && p.env) || 'AIC', rows: (p && Array.isArray(p.rows)) ? p.rows : [] };
    }
    function _ensure() {
        const ram = _ram();
        if (!ram) return null;
        if (!ram.predict) ram.predict = { env: 'AIC', rows: [] };
        if (!Array.isArray(ram.predict.rows)) ram.predict.rows = [];
        return ram.predict;
    }
    function _save() { try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {} }
    function _toast(m, k, t) { try { if (typeof showToast === 'function') showToast(m, k || 'info', t || 5200); } catch (_) {} }
    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // --------------------------------------------------------------- the engine
    // rows: [{ cat, qty, quality }] · env: handbook environment code.
    function predict(rows, env) {
        const db = _db();
        if (!db || !db.categories || !db.meta || !db.meta.source)
            throw new Error('RAM-PREDICT refused: the MIL-HDBK-217F data file is not staged. This engine will not invent generic failure rates — stage the handbook, generate ram_predict_data.js from it, and every number will carry its page citation.');
        if (!Array.isArray(rows) || !rows.length)
            throw new Error('RAM-PREDICT refused: no parts listed. A parts count needs parts.');
        if (!db.environments[env])
            throw new Error('RAM-PREDICT refused: environment "' + env + '" is not in the sourced table set. Sourced: ' + Object.keys(db.environments).join(', ') + '.');
        const out = [];
        let total = 0;
        rows.forEach((row, i) => {
            const cat = db.categories[row.cat];
            if (!cat)
                throw new Error('RAM-PREDICT refused: part category "' + row.cat + '" (row ' + (i + 1) + ') is not in the sourced set. Categories are only shipped when verified against the staged handbook — sourced today: ' + Object.keys(db.categories).join(', ') + '.');
            const qty = Math.floor(Number(row.qty));
            if (!(qty > 0)) throw new Error('RAM-PREDICT refused: row ' + (i + 1) + ' (' + cat.name + ') has quantity ' + row.qty + ' — a parts count counts parts.');
            const lg = cat.lambdaG[env];
            if (lg == null) throw new Error('RAM-PREDICT refused: ' + cat.name + ' has no sourced λg for environment ' + env + ' (sourced: ' + Object.keys(cat.lambdaG).join(', ') + '). No value, no guess.');
            const qk = row.quality || cat.defaultQuality;
            const pq = cat.piQ[qk];
            if (pq == null) throw new Error('RAM-PREDICT refused: quality level "' + qk + '" is not sourced for ' + cat.name + ' (sourced: ' + Object.keys(cat.piQ).join(', ') + ').');
            const contrib = qty * lg * pq;
            total += contrib;
            out.push({
                cat: row.cat, name: cat.name, qty: qty, env: env,
                lambdaG: lg, quality: qk, piQ: pq, contrib: contrib,
                cite: cat.cite
            });
        });
        return {
            env: env, envName: db.environments[env],
            rows: out, lambdaTotal: total,                       // per 10^6 h
            mtbfHrs: total > 0 ? 1e6 / total : null,
            source: db.meta.source,
            basis: 'λ_EQUIP = Σ N·λg·πQ per MIL-HDBK-217F Notice 2 parts count (' + db.meta.source + '); λ in failures per 10^6 h; environment ' + env + ' (' + db.environments[env] + '). PREDICTED-lane figure: a prediction earns no credit — the FRACAS ledger demonstrates. Computed, never stored.'
        };
    }

    // Drift vs the DEMONSTRATED lane: compare against a FRACAS-fed field record.
    function drift(pred, rec) {
        if (!pred || !rec) return null;
        const incs = Array.isArray(rec.incidents) ? rec.incidents : [];
        const fails = incs.length ? incs.length : (rec.failures != null ? rec.failures : null);
        if (!(rec.hours > 0) || !(fails > 0)) return null;
        const demMtbf = rec.hours / fails;
        return {
            recId: rec.id, demonstratedMtbf: demMtbf, predictedMtbf: pred.mtbfHrs,
            ratio: pred.mtbfHrs != null ? demMtbf / pred.mtbfHrs : null,
            note: 'Demonstrated (' + (incs.length ? 'ledger-fed' : 'authored') + ') vs predicted — credit follows the demonstration, always.'
        };
    }

    // ---------------------------------------------------------------- UI
    function renderPage() {
        if (typeof document === 'undefined') return;
        const host = document.getElementById('ram-predict-host');
        if (!host) return;
        if (typeof window._ramHasAccess === 'function' && !window._ramHasAccess()) {
            host.innerHTML = '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-2); padding:26px 30px; "><h3 style="margin:0 0 10px; border:none; padding:0;">Parts-count prediction is a Pro+ capability</h3></div>';
            return;
        }
        const db = _db();
        if (!db) {
            host.innerHTML = '<div style="border:1px solid #B7791F; background:var(--color-surface-2); padding:18px 22px; " class="u-mono">' +
                '<b style="font-size:12px;">Handbook data not staged.</b><div style="font-size:11px; margin-top:6px; color:var(--color-text-secondary);">' +
                'This lane computes λ = Σ N·λg·πQ from MIL-HDBK-217F Notice 2 — and refuses to run until the handbook tables are staged with citations. A prediction from remembered numbers is a rumor.</div></div>';
            return;
        }
        const st = _read();
        if (!st) { host.innerHTML = ''; return; }
        const catOpts = Object.keys(db.categories).map(k => '<option value="' + k + '">' + _esc(db.categories[k].name) + '</option>').join('');
        const envOpts = Object.keys(db.environments).map(k => '<option value="' + k + '"' + (st.env === k ? ' selected' : '') + '>' + k + ' — ' + _esc(db.environments[k]) + '</option>').join('');
        const IN = 'style="font:inherit; font-size:11px; padding:3px 5px; border:1px solid var(--color-border-strong); background:var(--color-surface-2); color:inherit; border-radius:4px;"';
        let rowsHtml = st.rows.map((r, i) => {
            const cat = db.categories[r.cat];
            const qOpts = cat ? Object.keys(cat.piQ).map(k => '<option value="' + k + '"' + ((r.quality || cat.defaultQuality) === k ? ' selected' : '') + '>' + k + '</option>').join('') : '';
            return '<tr><td class="u-mono" style="font-size:11px;">' + _esc(cat ? cat.name : r.cat) + '</td>' +
                '<td><input ' + IN + ' style="width:56px; font-size:11px; padding:3px 5px; text-align:right; border:1px solid var(--color-border-strong); background:var(--color-surface-2); color:inherit; border-radius:4px;" value="' + r.qty + '" onchange="RAM_PREDICT.setQty(' + i + ', this.value)"></td>' +
                '<td><select ' + IN + ' onchange="RAM_PREDICT.setQuality(' + i + ', this.value)">' + qOpts + '</select></td>' +
                '<td class="u-mono" style="font-size:10px; color:var(--color-text-tertiary);">' + _esc(cat ? cat.cite : '') + '</td>' +
                '<td><a href="#" onclick="RAM_PREDICT.removeRow(' + i + '); return false;" style="font-size:11px;">remove</a></td></tr>';
        }).join('');
        host.innerHTML =
            '<div style="display:flex; gap:10px; align-items:end; flex-wrap:wrap; margin-bottom:10px;">' +
            '<label class="u-mono" style="font-size:10px;">use environment<br><select id="rp-env" ' + IN + ' onchange="RAM_PREDICT.setEnv(this.value)">' + envOpts + '</select></label>' +
            '<label class="u-mono" style="font-size:10px;">add part<br><select id="rp-cat" ' + IN + '>' + catOpts + '</select></label>' +
            '<button onclick="RAM_PREDICT.addRow()" class="btn-cyan" style="font-size:11px;">+ Add</button>' +
            (st.rows.length ? '<button onclick="RAM_PREDICT.compute()" class="btn-cyan" style="font-size:11px;" title="Results already update live on every change — this re-runs the computation explicitly">Recompute</button>' : '') +
            (st.rows.length ? '<button onclick="exportData(\'RM_Predictions\', \'csv\')" class="btn-cyan" style="font-size:11px;" title="Export the computed parts-count prediction with handbook citations as CSV">↓ Export CSV</button>' : '') +
            '</div>' +
            (st.rows.length ? '<table class="data-table" style="width:100%;  font-size:12px;"><thead><tr><th>Part category</th><th>N</th><th>Quality</th><th>Source</th><th></th></tr></thead><tbody>' + rowsHtml + '</tbody></table>'
                            // v0.5 teach-on-empty: what this page is, in three
                            // steps, before any jargon lands. Same tokens the
                            // rest of the site uses; nothing is invented — the
                            // formula and the two-lane rule were already here.
                            : '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); border-radius:6px; padding:16px 20px; ">' +
                              '<b style="font-size:13px;">Your first failure-rate estimate — from a parts list alone.</b>' +
                              '<p style="font-size:12.5px; color:var(--color-text-secondary); margin:8px 0 10px;">No design detail needed yet: the handbook has measured generic failure rates for standard part categories in each use environment. Three steps:</p>' +
                              '<div style="font-size:12.5px; color:var(--color-text-secondary); line-height:1.7;">' +
                              '<b style="color:var(--color-text-primary);">1.</b> Pick the <b>use environment</b> above (airborne inhabited cargo, ground benign, …) — the same part fails at very different rates in each.<br>' +
                              '<b style="color:var(--color-text-primary);">2.</b> <b>Add part categories</b> and set how many of each you have, and at what quality level.<br>' +
                              '<b style="color:var(--color-text-primary);">3.</b> Read λ and MTBF below — they update live as you type, and <b>every number carries its handbook citation</b>.</div>' +
                              '<p class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary); margin:12px 0 0;">λ_EQUIP = Σ N·λg·πQ (per 10⁶ h) · MTBF = 10⁶/λ — MIL-HDBK-217F Notice 2, parts count</p>' +
                              '</div>') +
            '<div id="rp-out" style="margin-top:10px;"></div>' +
            '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">' + _esc('Source: ' + db.meta.source + ' — public-domain US-gov handbook; values stored verbatim with per-table citations. PREDICTED lane: a parts count earns no credit — the FRACAS ledger demonstrates.') + '</p>';
        // v0.5 live results: a populated page never shows a stale or empty
        // result block — compute on every render (defensive; refusals render
        // inline exactly as before).
        if (st.rows.length) { try { compute(); } catch (_) {} }
    }

    function compute() {
        const st = _read(); const db = _db();
        if (!st || !db) return;
        let r;
        try { r = predict(st.rows, st.env); } catch (e) { _toast(e.message, 'error', 6800); const o = document.getElementById('rp-out'); if (o) o.innerHTML = '<div class="u-mono" style="font-size:10.5px; color:#8E2A2A;">' + _esc(e.message) + '</div>'; return; }
        // drift vs demonstrated, if any field record exists
        const ram = _ram();
        const recs = (ram && ram.field || []).filter(f => f.hours > 0);
        const driftHtml = recs.map(f => {
            const d = drift(r, f);
            if (!d) return '';
            return '<br>drift vs <b>' + _esc(d.recId) + '</b>: demonstrated MTBF ' + Math.round(d.demonstratedMtbf).toLocaleString() + ' h vs predicted ' + Math.round(d.predictedMtbf).toLocaleString() + ' h (ratio ' + d.ratio.toFixed(2) + '×) — ' + _esc(d.note);
        }).join('');
        const o = document.getElementById('rp-out');
        if (!o) return;
        o.innerHTML =
            '<div class="u-mono" style="font-size:11px; border:1px solid var(--color-border); border-radius:4px; padding:9px 12px;">' +
            '<span style="font-size:9.5px; font-weight:700; border:1px solid #B7791F; color:#B7791F; border-radius:4px; padding:1px 6px;">PREDICTED — CLAIMED LANE</span><br><br>' +
            r.rows.map(x => _esc(x.name) + ': ' + x.qty + ' × λg ' + x.lambdaG + ' × πQ ' + x.piQ + ' (' + _esc(x.quality) + ') = ' + x.contrib.toFixed(4) + ' /10⁶h  <span style="color:var(--color-text-tertiary);">[' + _esc(x.cite) + ']</span>').join('<br>') +
            '<br><br><b>λ total = ' + r.lambdaTotal.toFixed(4) + ' per 10⁶ h · predicted MTBF = ' + Math.round(r.mtbfHrs).toLocaleString() + ' h</b>' +
            driftHtml +
            '<br><br><span style="color:var(--color-text-tertiary);">' + _esc(r.basis) + '</span></div>';
    }

    function addRow() {
        const st = _ensure(); const db = _db();
        if (!st || !db) return;
        const cat = (document.getElementById('rp-cat') || {}).value;
        if (!db.categories[cat]) return;
        st.rows.push({ cat: cat, qty: 1, quality: db.categories[cat].defaultQuality });
        _save(); renderPage();
    }
    function removeRow(i) { const st = _ensure(); if (!st) return; st.rows.splice(i, 1); _save(); renderPage(); }
    // v0.5: every authored change recomputes live — the result block is never
    // stale. compute() is defensive (refusals render inline, never throw out).
    function _live() { try { compute(); } catch (_) {} }
    function setQty(i, v) { const st = _ensure(); if (!st || !st.rows[i]) return; st.rows[i].qty = Math.max(1, Math.floor(Number(v) || 1)); _save(); _live(); }
    function setQuality(i, v) { const st = _ensure(); if (!st || !st.rows[i]) return; st.rows[i].quality = v; _save(); _live(); }
    function setEnv(v) { const st = _ensure(); if (!st) return; st.env = v; _save(); _live(); }

    const API = { predict: predict, drift: drift, renderPage: renderPage, compute: compute, addRow: addRow, removeRow: removeRow, setQty: setQty, setQuality: setQuality, setEnv: setEnv };

    // ------------------------------------------------------------- wiring
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        (function wire() {
            if (typeof window.switchTab === 'function' && !window.switchTab._rpWrapped) {
                const orig = window.switchTab;
                const wrapped = function (tabId) {
                    const r = orig.apply(this, arguments);
                    try {
                        // The core switchTab only shows/hides views whose id is in its
                        // `tabs` array — and 'ram-predict' is not (it's a lane added
                        // after that array, like the other ram-* lanes). So this wrap
                        // MUST toggle its own view's display, exactly as ram_modules /
                        // rbd_module do for theirs. Without this the nav button fills the
                        // host but never reveals the view (found live 20 Jul — the render
                        // populated the host while view-ram-predict stayed display:none).
                        const v = document.getElementById('view-ram-predict');
                        if (v) v.style.display = (tabId === 'ram-predict') ? 'block' : 'none';
                        if (tabId === 'ram-predict') renderPage();
                    } catch (_) {}
                    return r;
                };
                wrapped._rpWrapped = true;
                window.switchTab = wrapped;
            } else if (typeof window.switchTab !== 'function' && typeof window.addEventListener === 'function') {
                window.addEventListener('DOMContentLoaded', () => setTimeout(wire, 700));
            }
        })();
    }

    if (typeof window !== 'undefined') window.RAM_PREDICT = API;
    if (typeof module !== 'undefined') module.exports = API;
})();
