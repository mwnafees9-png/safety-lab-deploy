// modules/thr.js — THR apportionment: split a hazard's tolerable rate across
// subsystems with the core apportion engine.
// Dimensional discipline: series ('or') splits the RATE directly (rates add
// in series). Parallel ('and') converts to probability over a stated exposure
// time T, splits in the probability domain, and converts back — a product of
// rates is not a rate. The exposure time is recorded on the apportionment.
import { apportion, pFromLambda, lambdaFromP } from '../core/engine.js';

function render(host, ctx) {
    const S = ctx.state;
    const withThr = S.hazards.filter(h => h.thr > 0);
    host.innerHTML =
        '<div class="head"><h1>THR Apportionment<span class="sub">top-down budget split — the same allocation engine as the platform, THR semantics</span></h1>' +
        '<div class="chips"><span class="chip">Hazards with THR <b>' + withThr.length + '</b></span>' +
        '<span class="chip">Apportionments <b>' + S.thr.length + '</b></span></div></div>' +
        '<div class="toolbar"><button class="primary" id="thr-add">+ Apportion a hazard THR</button></div>' +
        (S.thr.length === 0
            ? '<p class="prov">No apportionments yet — pick a hazard with a THR and split it across contributing subsystems.</p>'
            : S.thr.map((a, i) => {
                const hz = S.hazards.find(h => h.id === a.hazardId) || {};
                return '<h3>' + ctx.esc(a.hazardId) + ' — ' + ctx.esc(hz.description || '') + ' · ' + (a.kind === 'and' ? 'parallel (AND)' : 'series (OR)') + '</h3>' +
                    '<table><thead><tr><th>Subsystem</th><th style="width:90px">Weight</th><th style="width:150px">Apportioned THR</th><th style="width:80px">SIL</th></tr></thead><tbody>' +
                    a.children.map(c =>
                        '<tr><td>' + ctx.esc(c.name) + '</td><td class="mono">' + c.weight + '</td>' +
                        '<td class="thr">≤ ' + c.target.toExponential(2) + ' /h</td>' +
                        '<td>' + (ctx.spine.silFromThr(c.target) != null ? ctx.stamp('SIL ' + ctx.spine.silFromThr(c.target), ctx.spine.palette.sil[ctx.spine.silFromThr(c.target)]) : '—') + '</td></tr>'
                    ).join('') +
                    '</tbody></table>' +
                    '<div class="prov" style="margin:6px 0 4px;">parent THR ' + (hz.thr || 0).toExponential(1) + ' /h · ' +
                    (a.kind === 'or' ? 'series: child rates sum to the parent budget'
                        : 'parallel: split in the probability domain over T = ' + (a.exposureT || 1) + ' h, converted back to rates') +
                    ' · <a href="#" data-del="' + i + '">remove</a></div>';
            }).join(''));

    host.querySelector('#thr-add').onclick = () => {
        if (!withThr.length) { alert('Set a THR on a hazard first (Hazard Log).'); return; }
        const pick = prompt('Hazard to apportion:\n' + withThr.map(h => h.id + ' — ' + h.description.slice(0, 50)).join('\n') + '\n\nEnter hazard id:', withThr[0].id);
        const hz = withThr.find(h => h.id === (pick || '').trim());
        if (!hz) return;
        const names = prompt('Contributing subsystems (comma-separated):', 'Interlock, Door drive, Detection');
        if (!names) return;
        const kind = (prompt('Structure — series contributions (or) / parallel redundancy (and):', 'or') || 'or').trim().toLowerCase() === 'and' ? 'and' : 'or';
        const children = names.split(',').map(n => ({ name: n.trim(), weight: 1 })).filter(c => c.name);
        let split, exposureT = null;
        if (kind === 'and') {
            // rate → probability over exposure T → split → back to rate
            exposureT = parseFloat(prompt('Exposure time for the parallel combination (hours — e.g. mission or detection interval):', '1')) || 1;
            const pParent = pFromLambda(hz.thr, exposureT);
            split = apportion(pParent, children, 'and').map(c => ({ ...c, target: lambdaFromP(c.target, exposureT) }));
        } else {
            split = apportion(hz.thr, children, 'or');
        }
        ctx.update(s => s.thr.push({ hazardId: hz.id, kind, exposureT, children: split }), 'thr:changed');
    };
    host.querySelectorAll('a[data-del]').forEach(a => {
        a.onclick = e => {
            e.preventDefault();
            const i = parseInt(a.getAttribute('data-del'));
            if (!confirm('Remove this apportionment?')) return;
            ctx.update(s => s.thr.splice(i, 1), 'thr:changed');
        };
    });
}

export const module = { id: 'thr', section: 'Safety Analyses', title: 'THR Apportionment', render };
