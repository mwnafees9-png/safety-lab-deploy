// ============================================================================
// markov_ndf.js — v0.1 — MARKOV-NDF (task #96): the 3-state Normal / Degraded
// / Failed discrete-time template, with the full worked receipt.
//
// The Rathore worked example, encoded the house way. A discrete-time chain:
// rows of P are per-step transition probabilities and MUST each sum to 1
// (refusal names the offending row). Steady state solves π = πP, Σπ = 1 —
// TWICE, two ways:
//   1. Linear elimination: (Pᵀ − I)π = 0 with the last equation replaced by
//      Σπ = 1; Gaussian elimination with partial pivoting.
//   2. Power iteration: π₀ uniform, πₖ₊₁ = πₖP until ‖Δ‖∞ < 1e-14.
// The two must agree to 1e-9 or the card REFUSES (a chain that defeats one
// method — reducible, periodic — gets a named refusal, never a number).
// The receipt prints the balance equations, the solution, the residual
// ‖πP − π‖∞, and the dual-method delta. Nothing is stored — the matrix lives
// in the DOM, the answer is computed fresh every press.
//
// Why N/D/F matters here: Degraded is dispatch thinking. MMEL analysis asks
// how long you may operate degraded before repair; this template is the
// smallest honest on-ramp to that conversation (and to multi-state
// reliability, RAM-MSR, if we ever commit it).
//
// Deterministic: no RNG, no Date, no eval, no store access at all.
// ============================================================================
(function () {
    'use strict';

    const STATES = ['Normal', 'Degraded', 'Failed'];
    const TOL_ROW = 1e-9, TOL_AGREE = 1e-9;

    // ------------------------------------------------------------ validation
    function validate(P) {
        if (!Array.isArray(P) || P.length !== 3 || P.some(r => !Array.isArray(r) || r.length !== 3))
            throw new Error('MARKOV-NDF refused: the template is exactly 3×3 (Normal / Degraded / Failed).');
        P.forEach((row, i) => {
            row.forEach((p, j) => {
                if (!(typeof p === 'number' && isFinite(p)) || p < 0 || p > 1)
                    throw new Error('MARKOV-NDF refused: P[' + STATES[i] + '→' + STATES[j] + '] = ' + p + ' is not a probability in [0, 1].');
            });
            const s = row.reduce((a, b) => a + b, 0);
            if (Math.abs(s - 1) > TOL_ROW)
                throw new Error('MARKOV-NDF refused: the ' + STATES[i] + ' row sums to ' + s + ', not 1. A transition row that does not sum to 1 leaks probability — fix the row, not the tool.');
        });
    }

    // --------------------------------------------------- method 1: elimination
    function solveLinear(P) {
        // (Pᵀ − I)π = 0, rows 0..1; row 2 replaced by Σπ = 1.
        const A = [
            [P[0][0] - 1, P[1][0],     P[2][0],     0],
            [P[0][1],     P[1][1] - 1, P[2][1],     0],
            [1,           1,           1,           1]
        ];
        for (let c = 0; c < 3; c++) {
            let piv = c;
            for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
            if (Math.abs(A[piv][c]) < 1e-14) throw new Error('MARKOV-NDF refused: the balance equations are singular beyond the normalization — the chain is reducible (some state is unreachable). A steady state that depends on where you start is not a steady state.');
            [A[c], A[piv]] = [A[piv], A[c]];
            for (let r = 0; r < 3; r++) {
                if (r === c) continue;
                const f = A[r][c] / A[c][c];
                for (let k = c; k < 4; k++) A[r][k] -= f * A[c][k];
            }
        }
        return [A[0][3] / A[0][0], A[1][3] / A[1][1], A[2][3] / A[2][2]];
    }

    // ------------------------------------------------- method 2: power iteration
    function solvePower(P) {
        let pi = [1 / 3, 1 / 3, 1 / 3];
        for (let it = 0; it < 200000; it++) {
            const next = [0, 0, 0];
            for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) next[j] += pi[i] * P[i][j];
            const delta = Math.max(Math.abs(next[0] - pi[0]), Math.abs(next[1] - pi[1]), Math.abs(next[2] - pi[2]));
            pi = next;
            if (delta < 1e-14) return pi;
        }
        throw new Error('MARKOV-NDF refused: power iteration did not converge in 200,000 steps — the chain is likely periodic. The dual computation cannot be completed, so no figure is shown.');
    }

    // ------------------------------------------------------------ the solve
    function solve(P) {
        validate(P);
        const a = solveLinear(P);
        const b = solvePower(P);
        const delta = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
        if (delta > TOL_AGREE)
            throw new Error('MARKOV-NDF DISAGREEMENT: elimination and power iteration differ by ' + delta.toExponential(3) + ' — the tool refuses to show a number it cannot compute twice.');
        // residual receipt: ‖πP − π‖∞ on the elimination result
        const chk = [0, 0, 0];
        for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) chk[j] += a[i] * P[i][j];
        const residual = Math.max(Math.abs(chk[0] - a[0]), Math.abs(chk[1] - a[1]), Math.abs(chk[2] - a[2]));
        return {
            pi: a, residual: residual, methodDelta: delta,
            equations: [
                'π_N = π_N·' + P[0][0] + ' + π_D·' + P[1][0] + ' + π_F·' + P[2][0],
                'π_D = π_N·' + P[0][1] + ' + π_D·' + P[1][1] + ' + π_F·' + P[2][1],
                'π_N + π_D + π_F = 1   (replaces the redundant third balance equation)'
            ],
            interpretation: STATES.map((s, i) => 'Long-run, the system spends ' + (a[i] * 100).toFixed(2) + '% of its steps in ' + s + '.'),
            basis: 'π = πP solved twice — Gaussian elimination on (Pᵀ−I | Σπ=1) and power iteration from uniform — agreement asserted to ' + TOL_AGREE.toExponential(0) + ' (Δ = ' + delta.toExponential(2) + '); residual ‖πP−π‖∞ = ' + residual.toExponential(2) + '. Computed, never stored.'
        };
    }

    // ---------------------------------------------------------------- UI
    const DEFAULT = [[0.97, 0.02, 0.01], [0.03, 0.90, 0.07], [0.10, 0.00, 0.90]];
    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    function _toast(m, k, t) { try { if (typeof showToast === 'function') showToast(m, k || 'info', t || 5200); } catch (_) {} }
    const IN = 'style="font:inherit; font-size:11.5px; width:64px; padding:3px 4px; text-align:right; border:1px solid var(--color-border-strong); background:var(--color-surface-2); color:inherit; border-radius:4px;"';

    function renderCard() {
        if (typeof document === 'undefined') return;
        const view = document.getElementById('view-markov');
        if (!view || document.getElementById('mndf-card')) return;
        const container = document.getElementById('markov-models-container');
        const card = document.createElement('div');
        card.id = 'mndf-card';
        card.style.cssText = 'border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin:0 0 16px;';
        let grid = '<table style="border-collapse:collapse; margin:6px 0;"><tr><td></td>' +
            STATES.map(s => '<td class="u-mono" style="font-size:10px; padding:2px 6px; color:var(--color-text-tertiary);">→ ' + s + '</td>').join('') + '</tr>';
        STATES.forEach((s, i) => {
            grid += '<tr><td class="u-mono" style="font-size:10px; padding:2px 6px; color:var(--color-text-tertiary);">' + s + '</td>' +
                DEFAULT[i].map((v, j) => '<td style="padding:2px;"><input id="mndf-' + i + j + '" ' + IN + ' value="' + v + '"></td>').join('') + '</tr>';
        });
        grid += '</table>';
        card.innerHTML =
            '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary); display:flex; justify-content:space-between; gap:10px; align-items:center;">' +
            '<b>Normal / Degraded / Failed — the 3-state discrete template</b>' +
            '<span class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary);">rows must sum to 1 · solved twice · receipt printed</span></div>' +
            '<div style="padding:10px 14px;">' +
            '<div style="font-size:11.5px; color:var(--color-text-secondary); ">Per-step transition probabilities. Degraded is dispatch thinking — MMEL analysis asks how long you may operate degraded before repair; this is the smallest honest on-ramp to that conversation. (The n-state <i>rate</i> models below remain the certification path; they feed basic events.)</div>' +
            grid +
            '<button onclick="MARKOV_NDF.run()" style="font:inherit; font-size:11px; padding:5px 14px; border:1px solid var(--color-text-primary); background:var(--color-text-primary); color:var(--color-surface-1); border-radius:4px; cursor:pointer;">Solve steady state</button>' +
            '<div id="mndf-out" style="margin-top:8px;"></div></div>';
        if (container && container.parentNode) container.parentNode.insertBefore(card, container);
        else view.appendChild(card);
    }

    function run() {
        const P = [0, 1, 2].map(i => [0, 1, 2].map(j => parseFloat((document.getElementById('mndf-' + i + j) || {}).value)));
        let r;
        try { r = solve(P); } catch (e) { _toast(e.message, 'error', 6800); const o = document.getElementById('mndf-out'); if (o) o.innerHTML = '<div class="u-mono" style="font-size:10.5px; color:#8E2A2A;">' + _esc(e.message) + '</div>'; return; }
        const o = document.getElementById('mndf-out');
        if (!o) return;
        o.innerHTML =
            '<div class="u-mono" style="font-size:11px; border:1px solid var(--color-border); border-radius:4px; padding:9px 12px;">' +
            '<b>Balance equations</b><br>' + r.equations.map(_esc).join('<br>') + '<br><br>' +
            '<b>Steady state</b>: π = [' + r.pi.map(x => x.toFixed(6)).join(', ') + ']  (N, D, F)<br>' +
            r.interpretation.map(_esc).join('<br>') + '<br><br>' +
            '<span style="color:var(--color-text-tertiary);">' + _esc(r.basis) + '</span></div>';
    }

    const API = { solve: solve, validate: validate, run: run, renderCard: renderCard, STATES: STATES, DEFAULT: DEFAULT };

    // ------------------------------------------------------------- wiring
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        (function wire() {
            if (document.getElementById('view-markov')) renderCard();
            else if (typeof window.addEventListener === 'function')
                window.addEventListener('DOMContentLoaded', () => setTimeout(renderCard, 500));
        })();
    }

    if (typeof window !== 'undefined') window.MARKOV_NDF = API;
    if (typeof module !== 'undefined') module.exports = API;
})();
