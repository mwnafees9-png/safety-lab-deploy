// modules/sracs.js — Safety-Related Application Conditions: the register of
// conditions exported to the operator/integrator. Signed state advances.
import { sign } from '../core/evidence.js';

function render(host, ctx) {
    const S = ctx.state;
    host.innerHTML =
        '<div class="head"><h1>SRAC Register<span class="sub">safety-related application conditions — exported, tracked to acceptance</span></h1>' +
        '<div class="chips"><span class="chip">Total <b>' + S.sracs.length + '</b></span>' +
        '<span class="chip">Open <b>' + S.sracs.filter(x => x.state === 'open').length + '</b></span></div></div>' +
        '<div class="toolbar"><button class="primary" id="sr-add">+ New SRAC</button>' +
        '<span class="prov">click State to advance (signed act)</span></div>' +
        '<table><thead><tr><th style="width:90px">SRAC</th><th>Condition placed on operator / integrator</th>' +
        '<th style="width:110px">Linked hazard</th><th style="width:120px">State</th><th style="width:130px">Provenance</th></tr></thead><tbody>' +
        S.sracs.map(r =>
            '<tr data-id="' + r.id + '"><td class="mono">' + ctx.esc(r.id) + '</td>' +
            '<td>' + ctx.esc(r.text) + '</td>' +
            '<td class="mono">' + ctx.esc(r.hazardId || '—') + '</td>' +
            '<td class="clickable" data-act="state"><span class="stamp ' + (r.state === 'open' ? '' : 'bw') + '"' +
            (r.state === 'open' ? ' style="color:#9A6200;background:rgba(154,98,0,0.1);"' : '') + '>' + ctx.esc(r.state.toUpperCase()) + '</span></td>' +
            '<td class="prov">' + (r.signedBy ? 'signed ' + ctx.esc(r.signedBy) : 'unsigned') + '</td></tr>'
        ).join('') +
        '</tbody></table>' +
        '<div class="note"><b>Why SRACs are first-class</b> — every assumption the analysis rests on that the OPERATOR must uphold ' +
        'is an exported condition, not a footnote. The 50129 safety case is incomplete until every SRAC is accepted by its addressee.</div>';

    host.querySelector('#sr-add').onclick = () => {
        const text = prompt('Condition text:'); if (!text) return;
        const hazardId = prompt('Linked hazard id (optional):') || '';
        ctx.update(s => s.sracs.push({ id: ctx.id('SRAC'), text, hazardId, state: 'open', signedBy: '' }), 'sracs:changed');
    };
    host.querySelectorAll('td[data-act="state"]').forEach(td => {
        td.onclick = async () => {
            const id = td.parentElement.getAttribute('data-id');
            const r = ctx.state.sracs.find(x => x.id === id); if (!r) return;
            const states = ctx.spine.sracStates;
            const next = states[(states.indexOf(r.state) + 1) % states.length];
            const signer = prompt('Advance ' + r.id + ' → "' + next + '". Sign with your name:');
            if (!signer) return;
            ctx.update(s => { const x = s.sracs.find(y => y.id === id); x.state = next; x.signedBy = signer; });
            await sign(ctx.state.evidence, { kind: 'srac', id }, 'state:' + next, signer, ctx.state.sracs.find(y => y.id === id));
            ctx.update(() => {}, 'evidence:changed');
        };
    });
}

export const module = { id: 'sracs', section: 'Evidence', title: 'SRAC Register', render };
