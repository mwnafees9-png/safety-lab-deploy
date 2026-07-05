// modules/safetycase.js — EN 50129 safety-case structure with live evidence
// states per part, plus the tamper-evident sign-off chain viewer.
import { verifyChain } from '../core/evidence.js';

const STATES = ['not started', 'in work', 'drafted', 'generated', 'accepted', 'n/a — tailored'];

function autoHint(partId, S) {
    if (partId === 'p1') return S.systemDef.description ? 'system definition recorded ✓' : 'record the system definition first';
    if (partId === 'p4') {
        const n = S.hazards.length, c = S.hazards.filter(h => h.state !== 'open').length;
        return n ? c + '/' + n + ' hazards dispositioned' : 'no hazards yet';
    }
    if (partId === 'p6') {
        const openSracs = S.sracs.filter(x => x.state !== 'accepted' && x.state !== 'verified').length;
        return openSracs ? openSracs + ' SRAC(s) not yet accepted — conclusion blocked' : 'SRACs accepted';
    }
    return '';
}

function render(host, ctx) {
    const S = ctx.state;
    host.innerHTML =
        '<div class="head"><h1>Safety Case — EN 50129<span class="sub">six-part structure · evidence states from the live model, prose never drifts</span></h1></div>' +
        '<table><thead><tr><th style="width:60px">Part</th><th>Title</th><th style="width:170px">State</th><th>Live evidence hint</th></tr></thead><tbody>' +
        ctx.spine.safetyCaseParts.map(p => {
            const st = S.safetyCase.parts[p.id] || 'not started';
            return '<tr><td class="mono">' + p.id.toUpperCase() + '</td><td>' + ctx.esc(p.name) + '</td>' +
                '<td class="clickable" data-part="' + p.id + '"><span class="stamp bw">' + ctx.esc(st.toUpperCase()) + '</span></td>' +
                '<td class="prov">' + ctx.esc(autoHint(p.id, S)) + '</td></tr>';
        }).join('') +
        '</tbody></table>' +
        '<h3>Sign-off chain — tamper-evident</h3>' +
        '<div id="sc-chain" class="prov">verifying…</div>' +
        '<table style="margin-top:8px;"><thead><tr><th style="width:150px">When</th><th style="width:110px">Target</th><th style="width:130px">Stage</th><th style="width:120px">Signer</th><th>Hash</th></tr></thead><tbody>' +
        (S.evidence.signoffs.slice(-12).reverse().map(r =>
            '<tr><td class="prov">' + ctx.esc(String(r.at).slice(0, 16).replace('T', ' ')) + '</td>' +
            '<td class="mono">' + ctx.esc(r.kind + ':' + r.id) + '</td>' +
            '<td class="mono">' + ctx.esc(r.stage) + '</td>' +
            '<td>' + ctx.esc(r.signer) + '</td>' +
            '<td class="prov">' + ctx.esc(String(r.hash).slice(0, 16)) + '…</td></tr>'
        ).join('') || '<tr><td colspan="5" class="prov">no signed acts yet</td></tr>') +
        '</tbody></table>';

    verifyChain(S.evidence).then(v => {
        const el = host.querySelector('#sc-chain');
        if (el) el.innerHTML = v.ok
            ? '<span class="ok">✓ chain intact — ' + v.length + ' signed act(s), each hash-linked to the previous</span>'
            : '<span class="bad">✗ CHAIN BROKEN at ' + ctx.esc(v.at && v.at.id) + ' — evidence has been altered</span>';
    });

    host.querySelectorAll('td[data-part]').forEach(td => {
        td.onclick = () => {
            const pid = td.getAttribute('data-part');
            const cur = S.safetyCase.parts[pid] || 'not started';
            const next = STATES[(STATES.indexOf(cur) + 1) % STATES.length];
            ctx.update(s => { s.safetyCase.parts[pid] = next; }, 'safetycase:changed');
        };
    });
}

export const module = { id: 'safetycase', section: 'Evidence', title: 'Safety Case · EN 50129', render };
