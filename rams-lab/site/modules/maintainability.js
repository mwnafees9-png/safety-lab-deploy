// modules/maintainability.js — MTTR estimates, MDT decomposition, demonstrated
// times vs targets (two-lane), mean MTTR weighted by failure rate.
import { mdt, meanMttr } from '../core/engine.js';

function render(host, ctx) {
    const S = ctx.state;
    const T = S.maintainability.tasks;
    const mean = meanMttr(T.map(t => ({ lambda: t.lambda, mttr: t.mttr })));

    host.innerHTML =
        '<div class="head"><h1>Maintainability Analysis<span class="sub">MTTR estimates (HDBK-472 style) · MDT decomposition · demonstrated vs target</span></h1>' +
        '<div class="chips"><span class="chip">Tasks <b>' + T.length + '</b></span>' +
        '<span class="chip">Mean MTTR (λ-weighted) <b>' + (mean ? (mean * 60).toFixed(0) + ' min' : '—') + '</b></span></div></div>' +
        '<div class="methods">MTTR prediction · MDT = active + logistics + admin · task analysis · LORA · testability/BIT · PM intervals (RCM) — v1 ships the task ledger + lanes.</div>' +
        '<div class="toolbar"><button class="primary" id="mt-add">+ Add maintenance task</button>' +
        '<span class="prov">click Demonstrated to record a timed demonstration</span></div>' +
        '<table><thead><tr><th>Task</th><th style="width:120px">Linked item</th><th style="width:90px">λ (/h)</th>' +
        '<th style="width:100px">MTTR est (h)</th><th style="width:130px">MDT (act+log+adm)</th><th style="width:120px">Demonstrated</th><th style="width:90px">Verdict</th></tr></thead><tbody>' +
        T.map((t, i) => {
            const d = mdt(t);
            const ok = t.demonstrated != null ? t.demonstrated <= t.mttr : null;
            return '<tr><td>' + ctx.esc(t.name) + '</td><td class="prov">' + ctx.esc(t.itemName || '—') + '</td>' +
                '<td class="thr">' + (t.lambda ? t.lambda.toExponential(1) : '—') + '</td>' +
                '<td class="thr">' + t.mttr.toFixed(2) + '</td>' +
                '<td class="thr">' + d.toFixed(2) + ' <span class="prov">(' + (t.activeRepair || 0) + '+' + (t.logistics || 0) + '+' + (t.admin || 0) + ')</span></td>' +
                '<td class="thr clickable" data-demo="' + i + '">' + (t.demonstrated != null ? t.demonstrated.toFixed(2) + ' h' : '<span class="prov">record…</span>') + '</td>' +
                '<td>' + (ok == null ? '<span class="prov">open</span>' : ok ? '<span class="ok">✓ within</span>' : '<span class="warn">⚠ over</span>') + '</td></tr>';
        }).join('') +
        '</tbody></table>' +
        '<div class="note"><b>Bridge to safety</b> — testability coverage and inspection intervals here feed latent-exposure ' +
        'times in the safety analyses; the PM-interval optimizer (roadmap) bisects intervals against hazard AND availability targets through the live model.</div>';

    host.querySelector('#mt-add').onclick = () => {
        const name = prompt('Task name (e.g. "DCU LRU swap"):'); if (!name) return;
        const itemName = prompt('Linked reliability item (optional, exact name):') || '';
        const active = parseFloat(prompt('Active repair time (h):', '0.25')) || 0;
        const log = parseFloat(prompt('Logistics delay (h):', '0.1')) || 0;
        const adm = parseFloat(prompt('Admin delay (h):', '0.05')) || 0;
        const lam = parseFloat(prompt('Initiating failure rate λ (/h, optional):', '1e-6')) || 0;
        ctx.update(s => s.maintainability.tasks.push({
            name, itemName, activeRepair: active, logistics: log, admin: adm,
            mttr: active, lambda: lam, demonstrated: null,
        }), 'maintainability:changed');
    };
    host.querySelectorAll('td[data-demo]').forEach(td => {
        td.onclick = () => {
            const i = parseInt(td.getAttribute('data-demo'));
            const v = parseFloat(prompt('Demonstrated repair time (hours):', T[i].demonstrated ?? T[i].mttr));
            if (isNaN(v)) return;
            ctx.update(s => { s.maintainability.tasks[i].demonstrated = v; }, 'maintainability:changed');
        };
    });
}

export const module = { id: 'maintainability', section: 'Maintainability', title: 'MTTR · MDT · Tasks', render };
