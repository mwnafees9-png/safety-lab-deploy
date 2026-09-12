// ============================================================================
// fha_a5.js — v1.0 — per-phase effects capture on the AFHA workbook
// (ARP4761A Table A5, the failure condition EFFECTS matrix).
//
// WHY. §A.5's worked example carries effects PER FLIGHT PHASE per failure
// condition — and the severity genuinely differs by phase (the high-lift
// example is Catastrophic on takeoff/approach and No-Effect on landing). The
// AFHA row holds ONE effects set and ONE severity, so until this the choice
// was worst-case prose or duplicate rows. Decided by Waqas 2 Aug 2026: capture
// per-phase effects on the AFHA row, ADDITIVELY.
//
// THE ADDITIVE CONTRACT (deliberate, this is the whole design):
//   · row.severity stays the single GOVERNING severity. Every downstream
//     reader — DAL allocation, probability targets, trees, chips, HF checks —
//     is untouched and reads exactly what it read before.
//   · row.phaseEffects = [{ phase, effAc, effCrew, effPax, severity }] is an
//     OPTIONAL A5-shaped matrix. Absence ⇒ pre-change behaviour, byte for byte.
//   · INV-43 (advisory): where the matrix is filled and classifies, the
//     governing severity must equal the WORST per-phase severity. Divergence
//     is a named finding — a governing severity milder than one of its own
//     phases is an understatement wearing a reviewed look.
//   · Exposure normalisation continues to read the row's phase list only.
//     A5 effects do not change any number anywhere. (The full per-phase-
//     severity restructure is a separate, planned decision — open items.)
//
// BORN MODULAR: wraps renderACFHA to inject one badge per row into the Phases
// cell; modal editor writes row.phaseEffects; invariant registered into the
// existing sweep. No monolith edits.
// ============================================================================
(function () {
    const A5_BADGE = false;   // 3 Sep 2026 — see _inject
    'use strict';

    const SEVS = ['', 'No Safety Effect', 'Minor', 'Major', 'Hazardous', 'Catastrophic'];
    const RANK = { 'No Safety Effect': 0, 'Negligible': 0, 'Minor': 1, 'Major': 2, 'Hazardous': 3, 'Catastrophic': 4 };
    function _esc(s) { if (typeof esc === 'function') return esc(s); return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _rows() { return (typeof acFhaData !== 'undefined' ? acFhaData : []) || []; }
    function _row(id) { return _rows().find(r => String(r.internalId) === String(id)) || null; }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }

    // The row's named phases, tolerant of both storage shapes (array or the
    // display string the table renders).
    function phasesOf(row) {
        if (!row) return [];
        if (Array.isArray(row.phases)) return row.phases.filter(Boolean).map(String);
        return String(row.phases || '').split(',').map(s => s.trim()).filter(Boolean);
    }

    // Worst per-phase severity among filled, classified entries. null when the
    // matrix is absent, empty, or entirely unclassified — an unclassified
    // matrix is a capture in progress, not a divergence.
    function worstOf(row) {
        const pe = Array.isArray(row && row.phaseEffects) ? row.phaseEffects : [];
        let worst = null;
        pe.forEach(e => {
            const s = e && e.severity;
            if (s && RANK[s] !== undefined) { if (worst === null || RANK[s] > RANK[worst]) worst = s; }
        });
        return worst;
    }

    // Divergence finding for one row, or null. The check is one-sided on
    // purpose: governing MILDER than a phase is the dangerous direction;
    // governing harsher is conservatism and is not flagged.
    function evalRow(row) {
        const worst = worstOf(row);
        if (worst === null) return null;
        const gov = row.severity;
        if (!gov || RANK[gov] === undefined) {
            return { worst, gov: gov || '(unclassified)', msg: 'per-phase matrix classifies up to ' + worst + ' but the row carries no governing severity' };
        }
        if (RANK[gov] < RANK[worst]) {
            return { worst, gov, msg: 'governing severity ' + gov + ' is milder than its own ' + worst + ' phase — Table A5 discipline: the row governs at the worst phase' };
        }
        return null;
    }

    // ------------------------------------------------------------- the modal
    function open(internalId) {
        const row = _row(internalId);
        if (!row) return;
        close();
        const named = phasesOf(row);
        const existing = Array.isArray(row.phaseEffects) ? row.phaseEffects : [];
        // Named phases first, then any matrix entries for phases no longer on
        // the row (kept visible, never silently dropped — flagged instead).
        const phases = named.slice();
        existing.forEach(e => { if (e && e.phase && phases.indexOf(e.phase) === -1) phases.push(e.phase); });
        const byPhase = {}; existing.forEach(e => { if (e && e.phase) byPhase[e.phase] = e; });

        const ov = document.createElement('div');
        ov.id = 'fha-a5-overlay';
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(10,16,28,.55);z-index:10050;display:flex;align-items:center;justify-content:center;';
        const grid = phases.map(ph => {
            const e = byPhase[ph] || {};
            const orphan = named.indexOf(ph) === -1;
            const sevOpts = SEVS.map(s => '<option value="' + _esc(s) + '"' + (String(e.severity || '') === s ? ' selected' : '') + '>' + (s || '— not classified —') + '</option>').join('');
            return '<tr data-a5-phase="' + _esc(ph) + '">' +
                '<td style="white-space:nowrap;font-weight:600;">' + _esc(ph) + (orphan ? ' <span title="This phase is no longer on the row’s phase list" style="color:#B03030;font-size:10px;border:1px dashed #B03030;padding:0 4px;">not on row</span>' : '') + '</td>' +
                '<td><textarea data-a5="effAc" rows="2" style="width:100%;font:inherit;font-size:12px;">' + _esc(e.effAc || '') + '</textarea></td>' +
                '<td><textarea data-a5="effCrew" rows="2" style="width:100%;font:inherit;font-size:12px;">' + _esc(e.effCrew || '') + '</textarea></td>' +
                '<td><textarea data-a5="effPax" rows="2" style="width:100%;font:inherit;font-size:12px;">' + _esc(e.effPax || '') + '</textarea></td>' +
                '<td><select data-a5="severity" style="font:inherit;font-size:12px;">' + sevOpts + '</select></td>' +
            '</tr>';
        }).join('');
        const card = document.createElement('div');
        card.style.cssText = 'background:#fff;color:#1b1f27;width:min(980px,95vw);max-height:88vh;overflow:auto;border-radius:12px;padding:18px 20px;box-shadow:0 24px 64px rgba(0,0,0,.4);';
        card.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;">' +
              '<div><div style="font-weight:800;font-size:15px;">Per-phase effects — ' + _esc(row.fcId || '') + '</div>' +
              '<div style="font-size:12px;color:#555;">' + _esc(row.fcDesc || '') + '</div></div>' +
              '<button type="button" id="fha-a5-close" style="font:inherit;border:1px solid #ccd;background:#fff;border-radius:8px;padding:4px 12px;cursor:pointer;">Close</button></div>' +
            '<p style="font-size:11.5px;color:var(--color-text-primary);margin:10px 0 8px;">ARP4761A Table A5 shape — effects per flight phase for THIS failure condition. The row’s governing severity stays the single value everything downstream reads; INV-43 flags a governing severity milder than the worst phase here. Leave a phase blank if it adds nothing.</p>' +
            '<table style="width:100%;border-collapse:collapse;font-size:12px;" class="a5-grid"><thead><tr>' +
              '<th style="text-align:left;">Phase</th><th style="text-align:left;">Effect on Aircraft</th><th style="text-align:left;">Effect on Flight Crew</th><th style="text-align:left;">Effect on Occupants</th><th style="text-align:left;">Severity (this phase)</th>' +
            '</tr></thead><tbody>' + grid + '</tbody></table>' +
            '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;">' +
              '<button type="button" id="fha-a5-save" style="font:inherit;font-weight:700;border:none;background:#0B2545;color:#fff;border-radius:8px;padding:7px 18px;cursor:pointer;">Save matrix</button></div>';
        ov.appendChild(card);
        ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
        document.body.appendChild(ov);
        card.querySelector('#fha-a5-close').onclick = close;
        card.querySelector('#fha-a5-save').onclick = function () {
            const out = [];
            card.querySelectorAll('tr[data-a5-phase]').forEach(tr => {
                const get = k => { const el = tr.querySelector('[data-a5="' + k + '"]'); return el ? String(el.value || '').trim() : ''; };
                const e = { phase: tr.getAttribute('data-a5-phase'), effAc: get('effAc'), effCrew: get('effCrew'), effPax: get('effPax'), severity: get('severity') };
                if (e.effAc || e.effCrew || e.effPax || e.severity) out.push(e);   // only substantive entries persist
            });
            if (out.length) row.phaseEffects = out; else delete row.phaseEffects;
            _save();
            close();
            try { if (typeof renderACFHA === 'function') renderACFHA(); } catch (_) {}
        };
    }
    function close() { const el = document.getElementById('fha-a5-overlay'); if (el && el.parentNode) el.parentNode.removeChild(el); }

    // ------------------------------------------------ badge injection (wrap)
    function _badgeHtml(row) {
        const n = Array.isArray(row.phaseEffects) ? row.phaseEffects.length : 0;
        const div = evalRow(row);
        const style = div
            ? 'border:1px solid #B03030;color:#B03030;'
            : (n ? 'border:1px solid #0E7A3C;color:#0E7A3C;' : 'border:1px dashed #8896AB;color:#66738A;');
        const label = n ? ('A5 ×' + n + (div ? ' ⚠' : '')) : 'A5 +';
        const tip = div ? div.msg : (n ? 'Per-phase effects captured (Table A5) — click to review' : 'Capture per-phase effects for this condition (ARP4761A Table A5)');
        return ' <button type="button" class="fha-a5-badge" data-a5-open="' + _esc(row.internalId) + '" title="' + _esc(tip) + '" style="font-size:10px;padding:0 5px;border-radius:999px;background:transparent;cursor:pointer;' + style + '">' + label + '</button>';
    }
    function _inject() {
        // 3 Sep 2026 (Waqas) — RETIRED FROM THE TABLE. The 2 Aug reading that per-phase
        // effects are annotation on ONE row was a misunderstanding: with one governing
        // severity over a full phase list the exposure ratio is pinned at 1 and every
        // tree under the row is over-allocated, which is exactly what the exposure
        // linkage exists to prevent. Per-phase differences now land as separate rows
        // (rows come from effects; each row's phase list sets its own exposure), and
        // the AI never wrote this matrix in any case — every AI row showed "A5 +"
        // forever. The module, its editor and INV-43 stay in the codebase untouched;
        // only the per-row badge stops rendering. Flip A5_BADGE to re-enable.
        if (!A5_BADGE) return;
        const tbody = document.getElementById('ac-fha-body');
        if (!tbody) return;
        tbody.querySelectorAll('tr').forEach(tr => {
            if (tr.querySelector('.fha-a5-badge')) return;
            const editBtn = tr.querySelector('[onclick*="editACFHA"]');
            const m = editBtn && String(editBtn.getAttribute('onclick') || '').match(/editACFHA\('?([^'")]+)'?\)/);
            if (!m) return;
            const row = _row(m[1]);
            if (!row) return;
            const phasesTd = tr.children[4];   // Actions | Sub-Function | FC ID | Failure Condition | Phases
            if (phasesTd) phasesTd.insertAdjacentHTML('beforeend', _badgeHtml(row));
        });
    }
    if (typeof document !== 'undefined') {
        document.addEventListener('click', function (e) {
            const b = e.target && e.target.closest && e.target.closest('[data-a5-open]');
            if (b) { e.preventDefault(); open(b.getAttribute('data-a5-open')); }
        });
    }
    if (typeof window !== 'undefined' && typeof window.renderACFHA === 'function') {
        const _orig = window.renderACFHA;
        window.renderACFHA = function () { const r = _orig.apply(this, arguments); try { _inject(); } catch (_) {} return r; };
    }

    // ------------------------------------------------------------- INV-43
    if (typeof window !== 'undefined' && typeof window.invRegister === 'function') {
        window.invRegister({
            id: 'INV-43', sev: 'advisory',
            name: 'Table A5 discipline — governing severity is never milder than the worst per-phase severity on the same row',
            run: function () {
                const rows = _rows().filter(r => Array.isArray(r.phaseEffects) && r.phaseEffects.length);
                const fails = [];
                rows.forEach(r => {
                    const d = evalRow(r);
                    if (d) fails.push((r.fcId || ('#' + r.internalId)) + ': ' + d.msg);
                });
                return { checked: rows.length, fails };
            }
        });
    }

    if (typeof window !== 'undefined') window.FHA_A5 = { open, close, evalRow, worstOf, phasesOf };
    if (typeof module !== 'undefined' && module.exports) module.exports = { evalRow, worstOf, phasesOf, RANK };
})();
