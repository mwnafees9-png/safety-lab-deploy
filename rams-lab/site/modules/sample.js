// modules/sample.js — the M4 Platform Screen Door sample program (original
// content, mirrors the mockup) + system definition page. Loading replaces state.
import { store } from '../core/store.js';

function sampleProject() {
    return {
        meta: { name: 'Metro Line M4 — Platform Screen Doors', createdAt: new Date().toISOString(), phase: 6 },
        systemDef: {
            description: 'Platform screen door (PSD) system for a driverless metro line: 24 stations, 48 door-sets per platform pair, interlocked with train position and departure authority.',
            boundary: 'PSD mechanical assemblies, door control units, interlock controller (2oo2), obstacle detection, OCC interface. Excludes trainborne doors and signalling (interfaces only).',
            operationalContext: '20 operating hours/day, 6,000 op hours/yr per door-set, GoA4 unattended operation, CSM-RA explicit risk estimation.',
        },
        hazards: [
            { id: 'HZ-001', description: 'Doors open while train in motion / not aligned at platform', frequency: 3, severity: 3, category: 'Intolerable', principle: 'Explicit Risk Estimation', thr: 1e-9, sil: 4, state: 'controlled', signedBy: 'R. Váldez' },
            { id: 'HZ-002', description: 'Passenger trapped between PSD and train door, departure enabled', frequency: 4, severity: 2, category: 'Intolerable', principle: 'Explicit Risk Estimation', thr: 1e-8, sil: 3, state: 'open', signedBy: '' },
            { id: 'HZ-003', description: 'PSD fails to open in emergency evacuation (all doors)', frequency: 2, severity: 2, category: 'Undesirable', principle: 'Code of Practice', thr: 5e-8, sil: 3, state: 'controlled', signedBy: 'J. Okafor' },
            { id: 'HZ-004', description: 'Misleading door-status indication to OCC', frequency: 3, severity: 2, category: 'Undesirable', principle: 'Reference System', thr: 1e-7, sil: 2, state: 'controlled', signedBy: 'J. Okafor' },
            { id: 'HZ-005', description: 'Door closes on passenger with force above limit', frequency: 4, severity: 1, category: 'Undesirable', principle: 'Code of Practice', thr: 1e-6, sil: 1, state: 'open', signedBy: '' },
        ],
        thr: [{
            hazardId: 'HZ-001', kind: 'or',
            children: [
                { name: 'Interlock controller (2oo2)', weight: 1, target: 2.5e-10 },
                { name: 'Door drive & lock', weight: 1, target: 2.5e-10 },
                { name: 'Train position input', weight: 1, target: 2.5e-10 },
                { name: 'Departure authority interface', weight: 1, target: 2.5e-10 },
            ],
        }],
        reliability: {
            items: [
                { name: 'Door drive unit (DCU + motor)', lambda: 8.1e-6, source: 'Field', qty: 1 },
                { name: 'Obstacle detection sensor pair', lambda: 1.2e-5, source: 'MIL-HDBK-217F', qty: 1 },
                { name: 'Interlock controller (2oo2)', lambda: 4.0e-6, source: 'Vendor', qty: 1 },
                { name: 'Position lock & limit switches', lambda: 9.5e-6, source: 'NSWC-11', qty: 1 },
            ],
            fieldData: [{ observedMtbf: 52900, windowMonths: 12, at: new Date().toISOString() }],
        },
        availability: {
            opHoursPerYear: 6000,
            measures: [
                { name: 'A(op) — service availability (%)', target: 99.975, higherIsBetter: true, achieved: 99.981 },
                { name: 'MTBSAF — service-affecting failures (h)', target: 5000, higherIsBetter: true, achieved: 6340 },
                { name: 'Downtime per door-set per year (h)', target: 2.2, higherIsBetter: false, achieved: 1.6 },
                { name: 'Line service loss > 5 min (events/yr)', target: 2, higherIsBetter: false, achieved: 2 },
            ],
        },
        maintainability: {
            tasks: [
                { name: 'DCU LRU swap (platform level)', itemName: 'Door drive unit (DCU + motor)', activeRepair: 0.2, logistics: 0.1, admin: 0.05, mttr: 0.25, lambda: 8.1e-6, demonstrated: 0.2 },
                { name: 'Sensor pair align & verify', itemName: 'Obstacle detection sensor pair', activeRepair: 0.35, logistics: 0.05, admin: 0.02, mttr: 0.42, lambda: 1.2e-5, demonstrated: 0.32 },
                { name: 'Manual release inspection (T-114)', itemName: '', activeRepair: 0.13, logistics: 0, admin: 0, mttr: 0.13, lambda: 0, demonstrated: 0.12 },
                { name: 'Full door-set replacement (night)', itemName: '', activeRepair: 3.5, logistics: 0.4, admin: 0.1, mttr: 4.0, lambda: 1e-6, demonstrated: 4.6 },
            ],
        },
        sracs: [
            { id: 'SRAC-001', text: 'Manual release handles inspected per maintenance plan T-114 every 90 days.', hazardId: 'HZ-003', state: 'accepted', signedBy: 'M. Chen' },
            { id: 'SRAC-002', text: 'Platform gap ≤ 85 mm maintained at all served stations.', hazardId: 'HZ-002', state: 'open', signedBy: '' },
            { id: 'SRAC-003', text: 'OCC override of door interlock restricted to authorized supervisors (two-person rule).', hazardId: 'HZ-001', state: 'accepted', signedBy: 'M. Chen' },
        ],
        safetyCase: { parts: { p1: 'generated', p2: 'generated', p3: 'drafted', p4: 'in work', p5: 'n/a — tailored', p6: 'not started' } },
        evidence: { signoffs: [], baselines: [], attests: { 'ph4:rev': { by: 'R. Váldez', at: new Date().toISOString() } }, tailored: {} },
        counters: { HZ: 5, SRAC: 3 },
    };
}

function render(host, ctx) {
    const S = ctx.state;
    host.innerHTML =
        '<div class="head"><h1>System Definition<span class="sub">the analysis boundary — everything downstream traces here</span></h1>' +
        '<div class="chips"><span class="chip clickable" id="sd-sample">Load <b>M4 sample program</b></span>' +
        '<span class="chip clickable" id="sd-reset">Reset <b>blank project</b></span></div></div>' +
        ['description', 'boundary', 'operationalContext'].map(k =>
            '<h3>' + { description: 'System description', boundary: 'System boundary', operationalContext: 'Operational context' }[k] + '</h3>' +
            '<div class="clickable" data-field="' + k + '" style="border:1px solid var(--hair); padding:10px 14px; min-height:44px; font-size:13.5px;">' +
            (S.systemDef[k] ? ctx.esc(S.systemDef[k]) : '<span class="prov">click to write…</span>') + '</div>'
        ).join('') +
        '<div class="note">Loading the sample replaces the current project (local browser storage only in v1).</div>';

    host.querySelector('#sd-sample').onclick = () => {
        if (!confirm('Replace the current project with the M4 Platform Screen Door sample?')) return;
        store.replace(sampleProject());
        ctx.go('dashboard');
    };
    host.querySelector('#sd-reset').onclick = () => {
        if (!confirm('Reset to a blank project? This clears local data.')) return;
        store.reset();
        ctx.go('dashboard');
    };
    host.querySelectorAll('[data-field]').forEach(el => {
        el.onclick = () => {
            const k = el.getAttribute('data-field');
            const v = prompt('Edit:', S.systemDef[k] || '');
            if (v == null) return;
            ctx.update(s => { s.systemDef[k] = v; }, 'sysdef:changed');
        };
    });
}

export const module = { id: 'sysdef', section: 'Program', title: 'System Definition', render };
export { sampleProject };
