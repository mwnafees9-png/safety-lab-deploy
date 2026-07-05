// modules/reliability.js — reliability prediction: item λ registry with
// sources, MTBF rollup, predicted-vs-field lane check (FRACAS seed).
import { mtbf, seriesLambda, laneCheck } from '../core/engine.js';

const SOURCES = ['MIL-HDBK-217F', 'FIDES', 'NPRD/EPRD', 'NSWC-11', 'Vendor', 'Field'];

function render(host, ctx) {
    const S = ctx.state;
    const items = S.reliability.items;
    const sysLambda = seriesLambda(items);
    const sysMtbf = mtbf(sysLambda);
    const field = S.reliability.fieldData[0];   // { observedMtbf, windowMonths }
    const lane = field ? laneCheck(sysMtbf, field.observedMtbf ? sysMtbf * (sysMtbf / field.observedMtbf) : null, 0) : null;
    const fieldOk = field && field.observedMtbf >= sysMtbf;

    host.innerHTML =
        '<div class="head"><h1>Reliability Prediction<span class="sub">parts-level λ · MTBF rollup · predicted vs field (FRACAS lane)</span></h1>' +
        '<div class="chips"><span class="chip">Σλ <b>' + (sysLambda ? sysLambda.toExponential(2) : '—') + ' /h</b></span>' +
        '<span class="chip">System MTBF <b>' + (isFinite(sysMtbf) ? Math.round(sysMtbf).toLocaleString() + ' h' : '—') + '</b></span>' +
        (field ? '<span class="chip">Field (' + field.windowMonths + ' mo) <b class="' + (fieldOk ? 'ok' : 'warn') + '">' + Math.round(field.observedMtbf).toLocaleString() + ' h ' + (fieldOk ? '✓' : '⚠') + '</b></span>' : '') +
        '</div></div>' +
        '<div class="methods">Prediction · Allocation · RBD k-of-n (engine) · FMECA criticality · Weibull/B-life · Growth (Crow-AMSAA) · FRACAS — v1 ships prediction + the field lane; the rest are registered slots.</div>' +
        '<div class="toolbar"><button class="primary" id="rel-add">+ Add item</button>' +
        '<button id="rel-field">Record field MTBF</button></div>' +
        '<table><thead><tr><th>Item</th><th style="width:110px">λ (/h)</th><th style="width:110px">MTBF</th><th style="width:130px">Source</th><th style="width:90px">Qty</th><th style="width:130px">Contribution</th></tr></thead><tbody>' +
        items.map((it, i) =>
            '<tr><td>' + ctx.esc(it.name) + '</td>' +
            '<td class="thr clickable" data-edit="' + i + '">' + (it.lambda || 0).toExponential(2) + '</td>' +
            '<td class="thr">' + (it.lambda > 0 ? Math.round(1 / it.lambda).toLocaleString() + ' h' : '—') + '</td>' +
            '<td class="prov">' + ctx.esc(it.source || '—') + '</td>' +
            '<td class="mono">' + (it.qty || 1) + '</td>' +
            '<td class="thr">' + (sysLambda > 0 ? ((it.lambda || 0) / sysLambda * 100).toFixed(1) + '%' : '—') + '</td></tr>'
        ).join('') +
        '</tbody></table>' +
        '<div class="note"><b>Lane rule</b> — the prediction is the computed lane; field data is the elicited lane. ' +
        'Field MTBF below prediction is a FINDING that reopens the prediction, never a number to quietly average in.' +
        (field && !fieldOk ? ' <span class="bad">Current field data challenges the prediction — disposition required.</span>' : '') + '</div>';

    host.querySelector('#rel-add').onclick = () => {
        const name = prompt('Item name:'); if (!name) return;
        const lam = parseFloat(prompt('λ per hour (e.g. 8.1e-6):', '1e-6')); if (!(lam > 0)) return;
        const src = prompt('Source — ' + SOURCES.join(' / ') + ':', 'Field') || 'Field';
        ctx.update(s => s.reliability.items.push({ name, lambda: lam, source: src, qty: 1 }), 'reliability:changed');
    };
    host.querySelector('#rel-field').onclick = () => {
        const m = parseFloat(prompt('Observed field MTBF (hours):', field ? field.observedMtbf : '50000'));
        if (!(m > 0)) return;
        const w = parseInt(prompt('Observation window (months):', '12')) || 12;
        ctx.update(s => { s.reliability.fieldData = [{ observedMtbf: m, windowMonths: w, at: new Date().toISOString() }]; }, 'reliability:changed');
    };
    host.querySelectorAll('td[data-edit]').forEach(td => {
        td.onclick = () => {
            const i = parseInt(td.getAttribute('data-edit'));
            const lam = parseFloat(prompt('λ per hour:', items[i].lambda));
            if (!(lam > 0)) return;
            ctx.update(s => { s.reliability.items[i].lambda = lam; }, 'reliability:changed');
        };
    });
}

export const module = { id: 'reliability', section: 'Reliability', title: 'Prediction · λ / MTBF', render };
