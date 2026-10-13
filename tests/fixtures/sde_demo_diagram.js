// tests/fixtures/sde_demo_diagram.js - 13 Oct 2026 (v1.0). A tiny demo notation used ONLY by the
// diagram editor tests (tests/regression_diagram_editor_20261013b.test.js and
// tools/diagram_editor/browser_check.js). Not loaded by index.html, never shown in the app.
(function (root) {
    'use strict';
    var E = root.SLDiagramEditor;
    E.register({
        type: 'sde-demo',
        title: 'Demo diagram',
        grid: 10,
        elementKinds: {
            start: { label: 'Start', shape: 'circle', w: 30, h: 30, aspect: 'lock', maxCount: 1, maxOut: 1, ports: 'none', resizable: false, labelPos: 'below', defaultLabel: 'Start' },
            block: { label: 'Block', shape: 'roundRect', w: 120, h: 50, fields: [{ key: 'props.rate', label: 'Failure rate (per hour)', type: 'number', help: 'For example 1e-5' }, { key: 'props.kind', label: 'Kind', type: 'select', options: ['hardware', 'software'] }] },
            state: { label: 'State', shape: 'ellipse', w: 80, h: 80, aspect: 'lock', sysmlType: 'state' },
            gate: { label: 'Gate', shape: 'diamond', w: 60, h: 60, ports: [{ id: 'in', x: 0.5, y: 0, dir: 'n', label: 'input' }, { id: 'out', x: 0.5, y: 1, dir: 's', label: 'output' }] }
        },
        connectorKinds: {
            flow: { label: 'Flow', from: ['start', 'block', 'gate'], to: ['block', 'gate'], route: 'orthogonal', arrow: 'triangle' },
            transition: { label: 'Transition', from: ['state'], to: ['state'], route: 'curved', arrow: 'open', allowSelfLoop: true, labelText: function (c) { return c.props && c.props.rate != null ? 'rate ' + c.props.rate : c.label; } },
            note: { label: 'Note link', from: '*', to: '*', arrow: 'none', directed: false, style: { dash: '4 3' } }
        },
        canConnect: function (a, b, kind) {
            if (kind === 'note' && a.kind === b.kind) return 'A note link joins two different kinds of shape.';
            return true;
        },
        fields: function (item, ctx) {
            if (!ctx.isElement && item.kind === 'transition') return [{ key: 'props.rate', label: 'Rate (per hour)', type: 'number' }];
            return null;
        },
        validate: function (m) {
            var out = [];
            m.elements.forEach(function (e) { if (e.kind === 'block' && !e.label) out.push({ id: e.id, message: 'A block has no name.' }); });
            return out;
        },
        layout: 'layered'
    });
})(typeof window !== 'undefined' ? window : globalThis);
