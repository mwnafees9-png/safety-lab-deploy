// modules/dashboard.js — lifecycle cockpits + phase-gate checklists, all
// derived live from state through the spine's checklist definitions.

function phaseProgress(S, spine) {
    // crude derived completion per lifecycle block for the bars
    const hz = S.hazards.length;
    const classified = S.hazards.filter(h => h.frequency != null && h.severity != null).length;
    const withThr = S.hazards.filter(h => h.thr > 0).length;
    const withSil = S.hazards.filter(h => h.sil != null).length;
    return {
        ph1_3: S.systemDef.description ? 1 : 0,
        ph4: hz ? classified / hz : 0,
        ph5: hz ? withThr / Math.max(1, S.hazards.filter(h => h.category !== 'Negligible').length || hz) : 0,
        ph6: withThr ? withSil / withThr : 0,
        ph7_8: (S.reliability.items.length ? 0.5 : 0) + (S.maintainability.tasks.some(t => t.demonstrated != null) ? 0.5 : 0),
        ph9_12: Object.values(S.safetyCase.parts).filter(v => v === 'generated' || v === 'accepted').length / 6,
    };
}

function checklist(S, spine, key, attests) {
    const defs = spine.checklists[key] || [];
    return defs.map(d => {
        if (d.kind === 'attest') {
            const a = attests[key + ':' + d.id];
            return { label: d.label, state: a ? 'attested · ' + a.by : 'open — attest', ok: !!a, id: d.id, kind: 'attest', key };
        }
        let ok = false;
        try { ok = !!d.eval(S); } catch (_) {}
        return { label: d.label, state: ok ? 'pass' : 'open', ok, id: d.id, kind: 'auto', key };
    });
}

function render(host, ctx) {
    const S = ctx.state;
    const spine = ctx.spine;
    const prog = phaseProgress(S, spine);
    const attests = S.evidence.attests;
    const open = S.hazards.filter(h => h.state === 'open').length;

    host.innerHTML =
        '<div class="head"><h1>' + ctx.esc(S.meta.name) +
        '<span class="sub">CSM-RA · lifecycle position and gate posture, derived live — never self-reported</span></h1>' +
        '<div class="chips">' +
        '<span class="chip">Hazard log <b>' + open + ' open · ' + (S.hazards.length - open) + ' dispositioned</b></span>' +
        '<span class="chip">SRACs <b>' + S.sracs.filter(x => x.state === 'open').length + ' open</b></span>' +
        '<span class="chip clickable" id="dash-rename">Program <b>rename</b></span>' +
        '</div></div>' +
        '<h3>EN 50126 lifecycle — phase cockpits</h3>' +
        '<div class="cockpits">' +
        spine.lifecycle.map(ph => {
            const p = Math.min(1, prog[ph.id] || 0);
            const done = p >= 1;
            return '<div class="ckpt"><div class="ph">' + ctx.esc(ph.label) + '</div><div class="nm">' + ctx.esc(ph.name) + '</div>' +
                '<span class="st' + (done ? ' done' : '') + '">' + (done ? 'COMPLETE' : p > 0 ? 'IN WORK' : 'NOT STARTED') + '</span>' +
                '<div class="bar"><i style="width:' + Math.round(p * 100) + '%"></i></div></div>';
        }).join('') +
        '</div>' +
        '<h3>Phase gates — ISA checklists (live)</h3>' +
        '<div class="cols3">' +
        ['ph4', 'ph5', 'ph6'].map(key => {
            const items = checklist(S, spine, key, attests);
            const ready = items.every(i => i.ok);
            return '<div><h4>' + key.toUpperCase().replace('PH', 'Phase ') + ' gate ' + (ready ? '· <span class="ok">READY</span>' : '') + '</h4>' +
                '<table><tbody>' + items.map(i =>
                    '<tr><td>' + ctx.esc(i.label) + '</td><td style="width:130px" class="' + (i.ok ? 'ok' : 'warn') + (i.kind === 'attest' && !i.ok ? ' clickable' : '') + '"' +
                    (i.kind === 'attest' && !i.ok ? ' data-attest="' + i.key + ':' + i.id + '"' : '') + '>' +
                    (i.ok ? '✓ ' : '· ') + ctx.esc(i.state) + '</td></tr>'
                ).join('') + '</tbody></table></div>';
        }).join('') +
        '</div>' +
        '<div class="note"><b>Gate rule</b> — auto items are computed from the model and cannot be argued with; attest items are signed acts. ' +
        'A gate is READY when every line holds. Hand-off baselines the project (SHA-256) and drift reopens it.</div>';

    host.querySelector('#dash-rename').onclick = () => {
        const n = prompt('Program name:', S.meta.name);
        if (n) ctx.update(s => { s.meta.name = n; }, 'meta:changed');
    };
    host.querySelectorAll('[data-attest]').forEach(el => {
        el.onclick = () => {
            const key = el.getAttribute('data-attest');
            const by = prompt('Attest "' + key + '". Sign with your name:');
            if (!by) return;
            ctx.update(s => { s.evidence.attests[key] = { by, at: new Date().toISOString() }; }, 'evidence:changed');
        };
    });
}

export const module = { id: 'dashboard', section: 'Program', title: 'Dashboard', render };
