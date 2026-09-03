// ============================================================================
// mil217f_stress.js — v1.0 — ARP-G4: MIL-HDBK-217F Notice 2 PART-STRESS,
// microcircuits first (§5.1 gate/logic arrays + microprocessors).
//
//     λp = (C1·πT + C2·πE) · πQ · πL      [failures / 10⁶ hours]
//
// LANE POSITION, stated plainly: parts count stays the DEFAULT prediction
// lane. Part-stress is the opt-in refinement for parts whose junction
// temperature, package and environment you actually know. And the honest
// frame around BOTH lanes: MIL-HDBK-217F has not been updated since 1995,
// and the National Academies' 2015 review of defense reliability practice
// recommends treating handbook predictions as rough screens — useful for
// comparison and supplier communication, never as demonstrated reliability.
// This tool ships 217F because supplier data still arrives in this
// currency; the output is labeled accordingly.
//
// TABLE PROVENANCE (MIL-HDBK-217F is a US Government work — public
// domain; the values below are transcriptions, each carrying its §ref):
//   · C1 die complexity (§5.1) — cross-checked against two secondary
//     sources; digital bipolar/MOS gate bands + microprocessor bit widths.
//   · πT (§5.8) — πT = 0.1·exp[(−Ea/8.617×10⁻⁵)(1/(Tj+273) − 1/298)],
//     Ea per technology family, cross-checked.
//   · πE (§5.10) — microcircuit row, all 14 environments, cross-checked.
//   · πL (§5.10) — πL = 0.01·e^(5.35−0.35·Y), floor 1.0 at Y ≥ 2 years;
//     reproduces the handbook's own lookup points (2.0/1.8/1.5/1.2/1.0).
//   · C2 (§5.9) and πQ Class S (§5.10) — TRANSCRIPTION-CONFIRM: secondary
//     sources disagree in the second digit (e.g. 2.8 vs 2.6 ×10⁻⁴ for the
//     hermetic-DIP coefficient; 0.2 vs 0.25 for Class S). The values below
//     are the most widely cited; every result that touches them carries a
//     CONFIRM note naming the clause to check in your controlled copy, and
//     an override-with-basis is provided. Refusal over silent trust.
//
// REFUSE-DON'T-DEFAULT: every stress input (Tj, environment, quality,
// package, pin count, gate count / bit width, years in production) is
// REQUIRED. A prediction computed from a defaulted junction temperature is
// a guess wearing four significant figures.
//
// Display-lane + one authored ledger (projectConfig.stress217) written only
// through the author adapter. Born-modular page after Markov Models.
// ============================================================================
(function () {
    'use strict';

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ---- §5.1 C1 — die complexity ------------------------------------------
    const C1_GATE_BANDS = [
        { max: 100,   bipolar: 0.0025, mos: 0.010 },
        { max: 1000,  bipolar: 0.0050, mos: 0.020 },
        { max: 3000,  bipolar: 0.010,  mos: 0.040 },
        { max: 10000, bipolar: 0.020,  mos: 0.080 },
        { max: 30000, bipolar: 0.040,  mos: 0.16  },
        { max: 60000, bipolar: 0.080,  mos: 0.29  },
    ];
    const C1_MICRO_BITS = [
        { max: 8,  bipolar: 0.060, mos: 0.14 },
        { max: 16, bipolar: 0.12,  mos: 0.28 },
        { max: 32, bipolar: 0.24,  mos: 0.56 },
    ];

    // ---- §5.8 πT — technology activation energies (eV) ---------------------
    const EA_TABLE = [
        { id: 'ttl',     label: 'TTL / ASTTL / CML / HTTL / FTTL / DTL / ECL / ALSTTL', ea: 0.4  },
        { id: 'f-ttl',   label: 'F / LTTL / STTL',                                      ea: 0.45 },
        { id: 'bicmos',  label: 'BiCMOS / LSTTL',                                       ea: 0.5  },
        { id: 'iil',     label: 'III / I3L / ISL',                                      ea: 0.6  },
        { id: 'mos',     label: 'Digital MOS / VHSIC CMOS',                             ea: 0.35 },
        { id: 'linear',  label: 'Linear (bipolar & MOS)',                               ea: 0.65 },
        { id: 'memory',  label: 'Memories (bipolar & MOS) / MNOS',                      ea: 0.6  },
    ];
    const BOLTZ = 8.617e-5;   // eV/K
    function piT(tjC, ea) { return 0.1 * Math.exp((-ea / BOLTZ) * (1 / (tjC + 273) - 1 / 298)); }

    // ---- §5.9 C2 — package (TRANSCRIPTION-CONFIRM) -------------------------
    const C2_PACKAGES = [
        { id: 'dip-hermetic', label: 'Hermetic DIP (solder/weld seal)', k: 2.8e-4, exp: 1.08, confirm: true },
        { id: 'dip-glass',    label: 'DIP with glass seal',             k: 9.0e-5, exp: 1.51, confirm: true },
        { id: 'flatpack',     label: 'Hermetic flatpack',               k: 3.0e-5, exp: 1.82, confirm: true },
        { id: 'can',          label: 'Hermetic can',                    k: 3.0e-5, exp: 2.01, confirm: true },
        { id: 'nonhermetic',  label: 'Nonhermetic (DIP / PGA / SMT)',   k: 3.6e-4, exp: 1.08, confirm: true },
    ];

    // ---- §5.10 πE — microcircuit environments ------------------------------
    const PIE_TABLE = { GB: 0.5, GF: 2.0, GM: 4.0, NS: 4.0, NU: 6.0, AIC: 4.0, AIF: 5.0,
                        AUC: 5.0, AUF: 8.0, ARW: 8.0, SF: 0.5, MF: 5.0, ML: 42, CL: 220 };

    // ---- §5.10 πQ — quality (Class S flagged) ------------------------------
    const PIQ_TABLE = [
        { id: 'S',   label: 'Class S',                piq: 0.25, confirm: true,
          note: 'secondary sources disagree (0.2 vs 0.25) — confirm §5.10 in your controlled copy before crediting Class S' },
        { id: 'B',   label: 'Class B',                piq: 1.0 },
        { id: 'B-1', label: 'Class B-1',              piq: 2.0 },
        { id: 'COM', label: 'Commercial / unknown',   piq: 10.0 },
    ];

    // ---- §5.10 πL — learning -----------------------------------------------
    function piL(years) { return years >= 2 ? 1.0 : 0.01 * Math.exp(5.35 - 0.35 * years); }

    // ---- the engine ---------------------------------------------------------
    // computeStress217F(input) → { ok, lambdaP (f/10⁶h), lambdaPerHour,
    //   terms, basis[], confirm[] } — or { ok:false, reason } with a NAMED
    //   refusal. Overrides ({c1|c2|ea|piQ}Override + matching *Basis) are
    //   allowed and echoed; an override without a basis is refused.
    function computeStress217F(input) {
        const refuse = m => ({ ok: false, reason: 'REFUSED — ' + m + '. Refuse-don\'t-default: a prediction computed from a defaulted stress input is a guess wearing four significant figures.' });
        if (!input) return refuse('no input');
        const notes = [], basis = [];

        // -- C1
        let C1, kind = input.kind;
        if (input.c1Override != null) {
            if (!(String(input.c1OverrideBasis || '').trim().length >= 10)) return refuse('C1 override without a cited basis (≥10 chars)');
            C1 = parseFloat(input.c1Override);
            if (!(C1 > 0)) return refuse('C1 override is not a positive number');
            basis.push('C1 OVERRIDDEN — ' + input.c1OverrideBasis);
        } else if (kind === 'gate_array') {
            const tech = input.tech;
            if (tech !== 'bipolar' && tech !== 'mos') return refuse('die technology must be \'bipolar\' or \'mos\' for the §5.1 C1 table');
            const g = parseFloat(input.gates);
            if (!(g >= 1)) return refuse('gate count is required for a gate/logic array (≥1)');
            const band = C1_GATE_BANDS.find(b => g <= b.max);
            if (!band) return refuse('gate count ' + g + ' exceeds the §5.1 table (60,000 gates) — the handbook has no C1 for this die; use supplier data, not extrapolation');
            C1 = band[tech];
            basis.push('C1 = ' + C1 + ' (§5.1 digital ' + tech + ', ≤' + band.max.toLocaleString() + ' gates)');
        } else if (kind === 'microprocessor') {
            const tech = input.tech;
            if (tech !== 'bipolar' && tech !== 'mos') return refuse('die technology must be \'bipolar\' or \'mos\' for the §5.1 microprocessor C1 table');
            const bits = parseFloat(input.bits);
            if (!(bits >= 1)) return refuse('bus width (bits) is required for a microprocessor');
            const band = C1_MICRO_BITS.find(b => bits <= b.max);
            if (!band) return refuse('bus width ' + bits + ' bits exceeds the §5.1 table (32 bits) — no C1 exists for this device in 217F');
            C1 = band[tech];
            basis.push('C1 = ' + C1 + ' (§5.1 ' + tech + ' microprocessor, ≤' + band.max + ' bits)');
        } else return refuse('kind must be \'gate_array\' or \'microprocessor\' (microcircuits-first scope of this lane)');

        // -- πT
        let ea;
        if (input.eaOverride != null) {
            if (!(String(input.eaOverrideBasis || '').trim().length >= 10)) return refuse('Ea override without a cited basis (≥10 chars)');
            ea = parseFloat(input.eaOverride);
            if (!(ea > 0 && ea < 2)) return refuse('Ea override outside the physical range (0, 2) eV');
            basis.push('Ea OVERRIDDEN — ' + input.eaOverrideBasis);
        } else {
            const row = EA_TABLE.find(t => t.id === input.eaTech);
            if (!row) return refuse('technology family for Ea is required (§5.8) — one of: ' + EA_TABLE.map(t => t.id).join(', '));
            ea = row.ea;
            basis.push('Ea = ' + ea + ' eV (§5.8, ' + row.label + ')');
        }
        const tj = parseFloat(input.tjC);
        if (!isFinite(tj)) return refuse('junction temperature Tj (°C) is required — the single strongest driver of the prediction');
        if (tj < -55 || tj > 175) return refuse('Tj = ' + tj + ' °C is outside the handbook envelope (−55…175 °C)');
        const PT = piT(tj, ea);

        // -- C2
        let C2, pkgRow = null;
        if (input.c2Override != null) {
            if (!(String(input.c2OverrideBasis || '').trim().length >= 10)) return refuse('C2 override without a cited basis (≥10 chars)');
            C2 = parseFloat(input.c2Override);
            if (!(C2 > 0)) return refuse('C2 override is not a positive number');
            basis.push('C2 OVERRIDDEN — ' + input.c2OverrideBasis);
        } else {
            pkgRow = C2_PACKAGES.find(p => p.id === input.pkg);
            if (!pkgRow) return refuse('package type is required (§5.9) — one of: ' + C2_PACKAGES.map(p => p.id).join(', '));
            const np = parseFloat(input.pins);
            if (!(np >= 3)) return refuse('pin count Np is required (≥3) for the §5.9 package factor');
            C2 = pkgRow.k * Math.pow(np, pkgRow.exp);
            basis.push('C2 = ' + pkgRow.k + '·Np^' + pkgRow.exp + ' = ' + C2.toExponential(3) + ' (§5.9, ' + pkgRow.label + ', Np=' + np + ')');
            if (pkgRow.confirm) notes.push('C2 (§5.9): coefficient transcribed from secondary sources that disagree in the second digit — CONFIRM against your controlled copy of MIL-HDBK-217F N2 before release');
        }

        // -- πE
        const PE = PIE_TABLE[input.env];
        if (PE == null) return refuse('environment is required (§5.10) — one of: ' + Object.keys(PIE_TABLE).join(', '));
        basis.push('πE = ' + PE + ' (§5.10, ' + input.env + ')');

        // -- πQ
        let PQ;
        if (input.piQOverride != null) {
            if (!(String(input.piQOverrideBasis || '').trim().length >= 10)) return refuse('πQ override without a cited basis (≥10 chars)');
            PQ = parseFloat(input.piQOverride);
            if (!(PQ > 0)) return refuse('πQ override is not a positive number');
            basis.push('πQ OVERRIDDEN — ' + input.piQOverrideBasis);
        } else {
            const q = PIQ_TABLE.find(x => x.id === input.quality);
            if (!q) return refuse('quality class is required (§5.10) — one of: ' + PIQ_TABLE.map(x => x.id).join(', '));
            PQ = q.piq;
            basis.push('πQ = ' + q.piq + ' (§5.10, ' + q.label + ')');
            if (q.confirm) notes.push('πQ Class S (§5.10): ' + q.note);
        }

        // -- πL
        const yrs = parseFloat(input.yearsInProduction);
        if (!isFinite(yrs) || yrs < 0) return refuse('years in production is required (§5.10 πL) — learning is part of the model, not an assumption');
        const PL = piL(yrs);
        basis.push('πL = ' + PL.toFixed(3) + ' (§5.10, ' + yrs + ' yr in production)');

        const lambdaP = (C1 * PT + C2 * PE) * PQ * PL;      // failures / 10⁶ h
        return { ok: true,
                 lambdaP, lambdaPerHour: lambdaP / 1e6,
                 terms: { C1, piT: PT, Ea: ea, C2, piE: PE, piQ: PQ, piL: PL, TjC: tj },
                 basis, confirm: notes,
                 frame: 'MIL-HDBK-217F N2 part-stress (§5.1) — handbook prediction, not demonstrated reliability (National Academies 2015); parts count remains the default lane.' };
    }

    // ---- the authored parts ledger -----------------------------------------
    function _store() {
        if (typeof projectConfig === 'undefined') return [];
        if (!Array.isArray(projectConfig.stress217)) projectConfig.stress217 = [];
        return projectConfig.stress217;
    }
    const _save = () => { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} _render(); };
    const _toast = (m, t) => { try { if (typeof showToast === 'function') showToast(m, t || 'info', 5200); } catch (_) {} };
    const author = {
        addPart: function (rec) {
            const r = computeStress217F(rec);
            if (!r.ok) { _toast(r.reason, 'error'); return false; }
            if (!(rec.name || '').trim()) { _toast('The part needs a name (reference designator or part number).', 'error'); return false; }
            _store().push(Object.assign({ id: 'st217-' + (_store().length + 1) + '-' + String(rec.name).replace(/\W+/g, '').slice(0, 12) }, rec));
            _save();
            return true;
        },
        rmPart: function (id) {
            const st = _store(); const i = st.findIndex(x => x.id === id);
            if (i >= 0) { st.splice(i, 1); _save(); }
        },
    };

    // ---- born-modular page --------------------------------------------------
    function _ensurePage() {
        if (typeof document === 'undefined') return false;
        if (!document.getElementById('view-stress217')) {
            const prev = document.getElementById('view-markov');
            if (!prev || !prev.parentNode) return false;
            const v = document.createElement('div'); v.id = 'view-stress217'; v.style.display = 'none';
            prev.parentNode.insertBefore(v, prev.nextSibling);
        }
        if (!document.getElementById('snav-stress217')) {
            const prevNav = document.getElementById('snav-markov');
            if (prevNav && prevNav.parentNode) {
                const a = document.createElement('a');
                a.className = prevNav.className; a.id = 'snav-stress217'; a.setAttribute('role', 'button'); a.setAttribute('tabindex', '0');
                a.setAttribute('onclick', "switchTab('stress217')");
                a.innerHTML = '<span class="asb-lbl">217F Part-Stress</span>';
                prevNav.parentNode.insertBefore(a, prevNav.nextSibling);
            }
        }
        return true;
    }
    const _F = id => { const el = document.getElementById(id); return el ? el.value : ''; };
    window.st217Add = function () {
        author.addPart({ name: _F('st217-name'), kind: _F('st217-kind'), tech: _F('st217-tech'),
            gates: _F('st217-gates'), bits: _F('st217-bits'), eaTech: _F('st217-eatech'), tjC: _F('st217-tj'),
            pkg: _F('st217-pkg'), pins: _F('st217-pins'), env: _F('st217-env'), quality: _F('st217-q'),
            yearsInProduction: _F('st217-yrs') });
    };
    window.st217Rm = function (id) { author.rmPart(id); };
    function _render() {
        if (typeof document === 'undefined') return;
        const host = document.getElementById('view-stress217'); if (!host) return;
        const opt = (arr, val, lbl) => arr.map(x => '<option value="' + esc(x[val]) + '">' + esc(x[lbl] || x[val]) + '</option>').join('');
        const parts = _store().map(p => ({ p, r: computeStress217F(p) }));
        host.innerHTML =
            '<div class="header-with-export"><h3>MIL-HDBK-217F part-stress <span class="u-mono" style="font-size:10.5px; font-weight:700; color:#0e7490; border:1px solid #0e749055; background:#0e74900D; border-radius:5px; padding:2px 8px; vertical-align:3px;">§5.1 microcircuits</span></h3></div>' +
            '<p style="font-size:12.5px; color:var(--color-text-secondary); ">λp = (C1·πT + C2·πE)·πQ·πL, failures per 10⁶ h. <b>Parts count remains the default lane</b> — part-stress is the opt-in refinement for parts whose junction temperature, package and environment you actually know, and every stress input is required (refuse-don’t-default). Honesty about the currency itself: 217F was last updated in 1995, and the National Academies’ 2015 review recommends treating handbook predictions as rough screens for comparison — never as demonstrated reliability. C2 and Class-S πQ transcriptions carry a CONFIRM note; check them against your controlled copy.</p>' +
            '<div class="controls" style="border-left-color:#0e7490;"><h5 style="margin:0 0 8px 0;">Add a part (§5.1 gate/logic array or microprocessor)</h5>' +
            '<div style="display:grid; grid-template-columns:repeat(6,1fr); gap:8px; font-size:12px;">' +
            '<input id="st217-name" placeholder="Name / refdes *">' +
            '<select id="st217-kind"><option value="gate_array">Gate/logic array</option><option value="microprocessor">Microprocessor</option></select>' +
            '<select id="st217-tech"><option value="bipolar">Bipolar</option><option value="mos">MOS</option></select>' +
            '<input id="st217-gates" type="number" placeholder="Gates (array) *">' +
            '<input id="st217-bits" type="number" placeholder="Bits (µP) *">' +
            '<select id="st217-eatech"><option value="">Ea technology (§5.8) *</option>' + opt(EA_TABLE, 'id', 'label') + '</select>' +
            '<input id="st217-tj" type="number" placeholder="Tj °C *">' +
            '<select id="st217-pkg"><option value="">Package (§5.9) *</option>' + opt(C2_PACKAGES, 'id', 'label') + '</select>' +
            '<input id="st217-pins" type="number" placeholder="Pins Np *">' +
            '<select id="st217-env"><option value="">Environment *</option>' + Object.keys(PIE_TABLE).map(e => '<option>' + e + '</option>').join('') + '</select>' +
            '<select id="st217-q"><option value="">Quality *</option>' + opt(PIQ_TABLE, 'id', 'label') + '</select>' +
            '<input id="st217-yrs" type="number" step="0.1" placeholder="Years in production *">' +
            '</div><button class="btn-cyan action-btn" style="margin-top:8px;" onclick="st217Add()">+ Add part (refuses on any missing input)</button></div>' +
            (!parts.length ? '<p style="font-size:12px; color:var(--color-text-tertiary); padding:8px 2px;">No part-stress records yet — parts count remains the default lane until a part earns the refinement.</p>' :
                '<table class="data-table" style="width:100%; font-size:11.5px; margin-top:10px;"><thead><tr><th>Part</th><th>λp /10⁶h</th><th>λ /h</th><th>C1</th><th>πT</th><th>C2</th><th>πE</th><th>πQ</th><th>πL</th><th>Receipt</th><th></th></tr></thead><tbody>' +
                parts.map(x => x.r.ok
                    ? '<tr><td><b>' + esc(x.p.name) + '</b></td><td class="u-mono">' + x.r.lambdaP.toExponential(3) + '</td><td class="u-mono">' + x.r.lambdaPerHour.toExponential(3) + '</td>' +
                      ['C1', 'piT', 'C2', 'piE', 'piQ', 'piL'].map(k => '<td class="u-mono">' + (+x.r.terms[k]).toPrecision(3) + '</td>').join('') +
                      '<td style="font-size:9.5px; color:var(--color-text-tertiary); max-width:260px;" title="' + esc(x.r.basis.join(' · ')) + '">' + esc(x.r.basis[0]) + ' …' + (x.r.confirm.length ? ' <b style="color:#9A6200;">CONFIRM×' + x.r.confirm.length + '</b>' : '') + '</td>' +
                      '<td><button class="action-btn btn-red" onclick="st217Rm(\'' + esc(x.p.id) + '\')">X</button></td></tr>'
                    : '<tr><td><b>' + esc(x.p.name) + '</b></td><td colspan="9" style="color:#B91C1C; font-size:11px;">' + esc(x.r.reason) + '</td><td><button class="action-btn btn-red" onclick="st217Rm(\'' + esc(x.p.id) + '\')">X</button></td></tr>').join('') +
                '</tbody></table>');
    }
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        (function wrapNav() {
            if (typeof window.switchTab !== 'function' || window.switchTab._st217Wrapped) return;
            const orig = window.switchTab;
            const wrapped = function (tabId) {
                const r = orig.apply(this, arguments);
                try {
                    const v = document.getElementById('view-stress217');
                    if (v) v.style.display = (tabId === 'stress217') ? 'block' : 'none';
                    const sn = document.getElementById('snav-stress217');
                    if (sn) sn.classList.toggle('snav-active', tabId === 'stress217');
                    if (tabId === 'stress217') _render();
                } catch (_) {}
                return r;
            };
            wrapped._st217Wrapped = true;
            window.switchTab = wrapped;
        })();
        (function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); })(function () {
            let tries = 30; const t = setInterval(function () { if (_ensurePage() || --tries <= 0) clearInterval(t); }, 250);
        });
    }

    const API = { computeStress217F, piT, piL, EA_TABLE, C1_GATE_BANDS, C1_MICRO_BITS, C2_PACKAGES, PIE_TABLE, PIQ_TABLE, author, render: _render };
    if (typeof window !== 'undefined') window.MIL217F = API;
    if (typeof module !== 'undefined') module.exports = API;
})();
