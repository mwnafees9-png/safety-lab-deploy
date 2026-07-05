// modules/hazards.js — the Hazard Log: rail's living ledger. Rows classify on
// the CSM-RA matrix (spine), carry THR targets, and SIL derives from THR via
// the spine table. Signed state changes go through core/evidence.
import { sign, isStale } from '../core/evidence.js';

function fmtThr(v) { return v > 0 ? '≤ ' + v.toExponential(1) + ' /h' : '—'; }

function riskCell(ctx, h) {
    if (h.frequency == null || h.severity == null) return '<span class="stamp bw">UNCLASSIFIED</span>';
    const cat = ctx.spine.riskMatrix.cell(h.frequency, h.severity);
    return ctx.stamp(cat.toUpperCase(), ctx.spine.palette.risk[cat]);
}

function silCell(ctx, h) {
    if (h.sil == null) return '<span class="prov">—</span>';
    return ctx.stamp('SIL ' + h.sil, ctx.spine.palette.sil[h.sil]);
}

function render(host, ctx) {
    const S = ctx.state;
    const open = S.hazards.filter(h => h.state === 'open').length;
    host.innerHTML =
        '<div class="head"><h1>Hazard Log<span class="sub">the living ledger — one row per hazard, cradle to acceptance</span></h1>' +
        '<div class="chips"><span class="chip">Total <b>' + S.hazards.length + '</b></span>' +
        '<span class="chip">Open <b>' + open + '</b></span></div></div>' +
        '<div class="toolbar"><button class="primary" id="hz-add">+ New hazard</button>' +
        '<span class="prov">click Risk to cycle frequency · shift-click for severity · click THR to set · SIL derives · click State to advance (signed)</span></div>' +
        '<table><thead><tr><th style="width:80px">Hazard</th><th>Description</th><th style="width:130px">Risk (CSM-RA)</th>' +
        '<th style="width:120px">Principle</th><th style="width:110px">THR</th><th style="width:70px">SIL</th>' +
        '<th style="width:110px">State</th><th style="width:150px">Provenance</th></tr></thead><tbody>' +
        S.hazards.map(h => {
            const stale = isStale(S.evidence, { kind: 'hazard', id: h.id }, h);
            return '<tr data-id="' + h.id + '">' +
                '<td class="mono">' + ctx.esc(h.id) + '</td>' +
                '<td class="clickable" data-act="desc">' + ctx.esc(h.description) + '</td>' +
                '<td class="clickable" data-act="risk">' + riskCell(ctx, h) +
                '  <div class="prov">' + ctx.esc(ctx.spine.frequencies[h.frequency] || '?') + ' × ' + ctx.esc(ctx.spine.severities[h.severity] || '?') + '</div></td>' +
                '<td class="clickable" data-act="principle">' + (h.principle ? ctx.esc(h.principle) : '<span class="prov">choose…</span>') + '</td>' +
                '<td class="thr clickable" data-act="thr">' + fmtThr(h.thr) + '</td>' +
                '<td>' + silCell(ctx, h) + '</td>' +
                '<td class="clickable" data-act="state"><span class="stamp bw">' + ctx.esc(h.state.toUpperCase()) + '</span></td>' +
                '<td class="prov">' + (h.signedBy ? 'signed ' + ctx.esc(h.signedBy) : 'unsigned') + (stale ? ' · <span class="warn">drift ⚠</span>' : '') + '</td>' +
                '</tr>';
        }).join('') +
        '</tbody></table>' +
        '<div class="note"><b>Two-lane rule</b> — the risk category and the SIL are computed from the spine (matrix, THR table); ' +
        'the frequency, severity, principle and THR are elicited engineering judgments. The computed lane never fills the elicited one.</div>';

    host.querySelector('#hz-add').onclick = () => {
        const description = prompt('Hazard description:');
        if (!description) return;
        ctx.update(s => s.hazards.push({
            id: ctx.id('HZ'), description, frequency: null, severity: null,
            principle: '', thr: 0, sil: null, state: 'open', signedBy: '',
        }), 'hazards:changed');
    };

    host.querySelectorAll('td[data-act]').forEach(td => {
        td.onclick = async (e) => {
            const id = td.parentElement.getAttribute('data-id');
            const act = td.getAttribute('data-act');
            const S2 = ctx.state;
            const h = S2.hazards.find(x => x.id === id);
            if (!h) return;
            if (act === 'desc') {
                const d = prompt('Description:', h.description); if (d == null) return;
                ctx.update(s => { s.hazards.find(x => x.id === id).description = d; });
            } else if (act === 'risk') {
                ctx.update(s => {
                    const r = s.hazards.find(x => x.id === id);
                    if (e.shiftKey) r.severity = r.severity == null ? 0 : (r.severity + 1) % ctx.spine.severities.length;
                    else r.frequency = r.frequency == null ? 0 : (r.frequency + 1) % ctx.spine.frequencies.length;
                    if (r.frequency != null && r.severity != null) r.category = ctx.spine.riskMatrix.cell(r.frequency, r.severity);
                });
            } else if (act === 'principle') {
                const opts = ctx.spine.riskAcceptancePrinciples;
                const pick = prompt('Risk-acceptance principle (CSM-RA):\n' + opts.map((o, i) => (i + 1) + '. ' + o).join('\n'), '3');
                const idx = parseInt(pick) - 1;
                if (!(idx >= 0 && idx < opts.length)) return;
                ctx.update(s => { s.hazards.find(x => x.id === id).principle = opts[idx]; });
            } else if (act === 'thr') {
                const v = prompt('Tolerable Hazard Rate (per hour, e.g. 1e-8):', h.thr || '1e-8');
                const n = parseFloat(v); if (!(n > 0)) return;
                ctx.update(s => {
                    const r = s.hazards.find(x => x.id === id);
                    r.thr = n; r.sil = ctx.spine.silFromThr(n);   // computed lane
                });
            } else if (act === 'state') {
                const states = ctx.spine.hazardStates;
                const next = states[(states.indexOf(h.state) + 1) % states.length];
                const signer = prompt('Advance ' + h.id + ' → "' + next + '". Sign with your name:');
                if (!signer) return;
                const rec = { kind: 'hazard', id: h.id };
                ctx.update(s => { const r = s.hazards.find(x => x.id === id); r.state = next; r.signedBy = signer; });
                await sign(ctx.state.evidence, rec, 'state:' + next, signer, ctx.state.hazards.find(x => x.id === id));
                ctx.update(() => {}, 'evidence:changed');
            }
        };
    });
}

export const module = { id: 'hazards', section: 'Safety Analyses', title: 'Hazard Log', render };
