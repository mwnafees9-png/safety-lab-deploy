// modules/availability.js — Ai from λ+MTTR (computed), Ao from service data
// (elicited), downtime budgets. Uses core engine only.
import { inherentAvailability, seriesAvailability, annualDowntime, mtbf } from '../core/engine.js';
import { meanMttr } from '../core/engine.js';

function render(host, ctx) {
    const S = ctx.state;
    const items = S.reliability.items;
    const tasks = S.maintainability.tasks;
    const mttrByName = {};
    tasks.forEach(t => { if (t.itemName) mttrByName[t.itemName] = t.mttr; });
    // Ai only where a maintenance task supplies a real MTTR — no invented
    // repair times. Items without a linked task are listed but excluded from
    // the rollup (shown as '—'), which is honest, unlike a default.
    const rows = items.map(it => {
        const mttr = mttrByName[it.name] != null ? mttrByName[it.name] : null;
        const ai = mttr != null ? inherentAvailability(it.lambda || 0, mttr) : null;
        return { name: it.name, lambda: it.lambda || 0, mttr, ai,
                 downtime: mttr != null ? annualDowntime(it.lambda, mttr, S.availability.opHoursPerYear || 6000) : null };
    });
    const linked = rows.filter(r => r.ai != null);
    const sysAi = linked.length ? seriesAvailability(linked.map(r => r.ai)) : null;
    const M = S.availability.measures;

    host.innerHTML =
        '<div class="head"><h1>Availability Analysis<span class="sub">Ai computed from λ + MTTR · Ao elicited from service records · budgets apportioned</span></h1>' +
        '<div class="chips"><span class="chip">System Ai <b>' + (sysAi != null ? (sysAi * 100).toFixed(3) + '%' : '— (link tasks)') + '</b></span>' +
        '<span class="chip">Op hours/yr <b>' + (S.availability.opHoursPerYear || 6000) + '</b></span></div></div>' +
        '<div class="methods">Ai/Aa/Ao · steady-state series model (engine) · MTBSAF · downtime apportionment · degraded modes · spares — v1 ships Ai + measures ledger.</div>' +
        '<h3>Inherent availability — computed lane</h3>' +
        '<table><thead><tr><th>Item</th><th style="width:100px">λ (/h)</th><th style="width:90px">MTTR (h)</th><th style="width:110px">Ai</th><th style="width:150px">Downtime (h/yr)</th></tr></thead><tbody>' +
        rows.map(r =>
            '<tr><td>' + ctx.esc(r.name) + '</td><td class="thr">' + r.lambda.toExponential(2) + '</td>' +
            '<td class="thr">' + (r.mttr != null ? r.mttr.toFixed(2) : '—') + '</td><td class="thr">' + (r.ai != null ? (r.ai * 100).toFixed(4) + '%' : '—') + '</td>' +
            '<td class="thr">' + (r.downtime != null ? r.downtime.toFixed(2) : '—') + '</td></tr>'
        ).join('') +
        '</tbody></table>' +
        '<h3>Service measures — targets vs achieved (elicited lane)</h3>' +
        '<div class="toolbar"><button class="primary" id="av-add">+ Add measure</button></div>' +
        '<table><thead><tr><th>Measure</th><th style="width:130px">Target</th><th style="width:150px">Achieved</th><th style="width:100px">Verdict</th></tr></thead><tbody>' +
        M.map((m, i) => {
            const ok = m.higherIsBetter ? (m.achieved >= m.target) : (m.achieved <= m.target);
            return '<tr><td>' + ctx.esc(m.name) + '</td><td class="thr">' + ctx.esc(m.targetLabel || m.target) + '</td>' +
                '<td class="thr clickable" data-ach="' + i + '">' + ctx.esc(m.achievedLabel || m.achieved) + '</td>' +
                '<td>' + (m.achieved == null ? '<span class="prov">open</span>' : (ok ? '<span class="ok">✓ meets</span>' : '<span class="warn">⚠ miss</span>')) + '</td></tr>';
        }).join('') +
        '</tbody></table>' +
        '<div class="note"><b>Money view</b> — rail tenders score availability with penalty regimes; the achieved column is what liquidated damages are computed from. Keep it elicited from operations records, never from the model.</div>';

    host.querySelector('#av-add').onclick = () => {
        const name = prompt('Measure name (e.g. "MTBSAF", "Line service loss > 5 min / yr"):'); if (!name) return;
        const target = parseFloat(prompt('Target (number):', '5000')); if (isNaN(target)) return;
        const hib = confirm('Is higher better? (OK = yes, Cancel = lower is better)');
        ctx.update(s => s.availability.measures.push({ name, target, higherIsBetter: hib, achieved: null }), 'availability:changed');
    };
    host.querySelectorAll('td[data-ach]').forEach(td => {
        td.onclick = () => {
            const i = parseInt(td.getAttribute('data-ach'));
            const v = parseFloat(prompt('Achieved value (from service records):', M[i].achieved ?? ''));
            if (isNaN(v)) return;
            ctx.update(s => { s.availability.measures[i].achieved = v; s.availability.measures[i].achievedLabel = null; }, 'availability:changed');
        };
    });
}

export const module = { id: 'availability', section: 'Availability', title: 'Ai / Ao · Service Measures', render };
