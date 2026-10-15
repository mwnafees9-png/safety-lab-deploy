// ============================================================================
// fta_canvas_edit.js — v1.0 — 13 Oct 2026 (fix G): the fault tree is built and
// edited by hand on the canvas. SLFtaEdit.
// 15 Oct 2026 (v1.1): the toolbox is a full-height strip down the left edge of the canvas (the
// shared .sl-canvas-strip rule in safety_lab.css), no longer a floating box that stopped partway down.
//
// What it adds to the d3 fault tree canvas (fta_view_modules.js updateD3):
//   * a visible TOOLBOX with every gate and event type (NOT appears only when the
//     project allows non-coherent logic, off by default). Drag an item onto a gate
//     to add it as an input; drop it on empty canvas to make the top event (empty
//     page) or an unattached node; click an item to add it under the selected gate.
//   * CONNECTIONS by hand: every node except the top event has a round handle on
//     top of its description box. Drag the handle onto a gate to connect the node
//     (and its branch) under that gate; drag it to empty canvas to disconnect.
//     Dragging a node's body onto a gate moves the branch there too, with a clear
//     drop indicator. Illegal moves (a loop, inputs under an event or a transfer
//     gate, moving the top event, a second input on a NOT gate) are refused with a
//     plain message.
//   * UNATTACHED nodes: page.unattached[] holds branches that are not connected to
//     the top event. They are drawn with a dashed outline and "Not connected", are
//     never part of the math or the reports, and save/sync/export with the page.
//   * failure rate / probability typed directly on the canvas for basic and
//     undeveloped events (validated, same propagation as the properties panel).
//   * "Linked model element" in the properties panel: the item (LRU) that realizes
//     the event (realizedByItemId), a SysML v2 reference (sysmlRef) and the stable
//     model element ID; a badge on the node shows the link.
//   * an OVERVIEW MAP for large trees: the whole layout in miniature with the
//     visible area marked; click or drag it to move the view.
//
// THE ONE PATH. Every fault tree change goes through SLFtaEdit.applyEdit(label,
// mutate, opts): it asks the before-change listeners (any may veto), takes the
// undo snapshot, runs the change, recalculates, redraws, schedules the autosave
// (which also pushes the live sync) and then tells the change listeners.
// Toolbar and panel actions that already existed (add, delete, paste, transfer,
// change type, panel edits) are wrapped so they pass through the same listeners.
// Hooks for other modules: SLFtaEdit.onBeforeChange(fn) (return false to cancel)
// and SLFtaEdit.onChange(fn); the DOM event 'sl:fta-change' carries the same info.
//
// BORN MODULAR: classic script after fta_view_modules.js; updateD3 calls the
// render hooks (dragStart/dragMove/dragEnd, handleDrag, metric*, afterRender).
// ============================================================================
(function () {
    'use strict';
    if (typeof window === 'undefined') return;
    const NS = 'http://www.w3.org/2000/svg';

    // ---------------------------------------------------------------- basics
    function _page() { try { return (ftaPages || []).find(p => p.id === activeFTAPageId) || null; } catch (_) { return null; } }
    function _root() { const p = _page(); return p ? p.root : null; }
    function _kids(n) { return (n && (n.children || n._children)) || []; }
    function _label(n) { return n ? String(n.displayId || n.name || ('node ' + n.id)) : '?'; }
    function _toast(msg, kind, ms) { try { if (typeof showToast === 'function') showToast(msg, kind || 'warning', ms || 4500); } catch (_) {} }
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function _report(e) { try { if (window.SLErrorWatch) SLErrorWatch.report(e, 'fta_canvas_edit'); else console.error(e); } catch (_) {} }
    function nonCoherentAllowed() { try { return !!(typeof projectConfig !== 'undefined' && projectConfig && projectConfig.allowNonCoherent === true); } catch (_) { return false; } }
    function _isGate(n) { return !!n && n.type === 'gate'; }
    function _unattached(page) { page = page || _page(); if (!page) return []; if (!Array.isArray(page.unattached)) page.unattached = []; return page.unattached; }
    function _isFree(n) { const p = _page(); return !!(p && Array.isArray(p.unattached) && p.unattached.indexOf(n) >= 0); }
    function _count(n) { let c = 0; (function w(x) { if (!x) return; c++; _kids(x).forEach(w); })(n); return c; }

    // ------------------------------------------------------- the change path
    const _before = [], _after = [];
    let _inEdit = 0, _seq = 0;
    function onBeforeChange(fn) { if (typeof fn === 'function') _before.push(fn); }
    function onChange(fn) { if (typeof fn === 'function') _after.push(fn); }
    function _runBefore(info) {
        for (let i = 0; i < _before.length; i++) {
            try { if (_before[i](info) === false) return false; } catch (e) { _report(e); }
        }
        return true;
    }
    function _notify(info) {
        info.seq = ++_seq;
        for (let i = 0; i < _after.length; i++) { try { _after[i](info); } catch (e) { _report(e); } }
        try { document.dispatchEvent(new CustomEvent('sl:fta-change', { detail: info })); } catch (_) {}
    }
    // applyEdit(label, mutate, opts) — THE path for every fault tree change.
    //   opts.validate()   -> '' or a plain-language reason to refuse (checked before anything changes)
    //   opts.structural   -> flag generated requirements as stale (structure changed)
    //   opts.undoPushed   -> the gesture already took its undo snapshot (drag start)
    //   opts.recalc=false -> no recalculation (pure layout change, or the wrapped action already did it)
    //   opts.render=false -> no redraw (the gesture already moved the drawing)
    //   opts.kind / nodeIds / source -> passed to listeners
    function applyEdit(label, mutate, opts) {
        opts = opts || {};
        const info = { label: label, kind: opts.kind || 'edit', source: opts.source || 'canvas', pageId: (typeof activeFTAPageId !== 'undefined' ? activeFTAPageId : null), nodeIds: opts.nodeIds || [], structural: !!opts.structural };
        if (opts.validate) {
            let why = '';
            try { why = opts.validate() || ''; } catch (e) { why = 'That change could not be checked: ' + ((e && e.message) || e); }
            if (why) { _toast(why, 'warning', 5200); return { ok: false, reason: why }; }
        }
        if (!opts.skipBefore && !_runBefore(info)) return { ok: false, vetoed: true };
        if (!opts.undoPushed) { try { if (typeof pushUndo === 'function') pushUndo(label); } catch (_) {} }
        let result;
        _inEdit++;
        try { result = mutate(); }
        catch (e) { _inEdit--; _report(e); _toast('That change failed: ' + ((e && e.message) || e), 'error', 5000); return { ok: false, error: e }; }
        _inEdit--;
        try { if (opts.structural && typeof _markStructureChangeObsolete === 'function') _markStructureChangeObsolete(label + '.'); } catch (_) {}
        try { if (opts.recalc !== false && typeof calculateAllProbabilities === 'function') calculateAllProbabilities(); } catch (e) { _report(e); }
        try { if (opts.render !== false && typeof updateD3 === 'function') updateD3(); } catch (e) { _report(e); }
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        _notify(info);
        return { ok: true, result: result };
    }
    // The toolbar and panel actions that already existed go through the same listeners.
    const _LEGACY = {
        addTopEvent: 'Add top event', addNewFTAPage: 'New fault tree page', addSelectedGate: 'Add gate', addSelectedEvent: 'Add event',
        deleteSelectedNode: 'Delete node', pasteAsChild: 'Paste branch', pasteSpecial: 'Paste special', transferOutSelectedGate: 'Transfer out',
        integrateSelectedTransferredSubtree: 'Integrate back', changeNodeType: 'Change node type', updateNodeData: 'Edit node properties',
        updateNodeDataInline: 'Edit on the canvas', makeNodeIndependent: 'Make independent', reconfigureActiveTreeLayout: 'Reconfigure layout', runDALAllocation: 'Allocate DAL', clearAndRedraw: 'Clear DAL'
    };
    function _wrapLegacy() {
        Object.keys(_LEGACY).forEach(function (name) {
            const fn = window[name];
            if (typeof fn !== 'function' || fn._slFtaEditWrapped) return;
            const wrapped = function () {
                if (_inEdit) return fn.apply(this, arguments);
                const info = { label: _LEGACY[name], kind: 'action:' + name, source: 'toolbar', pageId: activeFTAPageId, nodeIds: (typeof selectedNodeData !== 'undefined' && selectedNodeData) ? [selectedNodeData.id] : [], structural: name !== 'updateNodeData' && name !== 'reconfigureActiveTreeLayout' };
                if (!_runBefore(info)) return;
                // A selected unattached node is deleted here (deleteNodeRecursive only walks the tree).
                if (name === 'deleteSelectedNode' && typeof selectedNodeData !== 'undefined' && selectedNodeData && _isFree(selectedNodeData)) { deleteFree(selectedNodeData); return; }
                const r = fn.apply(this, arguments);
                if (r && typeof r.then === 'function') return r.then(function (v) { _notify(info); return v; });
                _notify(info);
                return r;
            };
            wrapped._slFtaEditWrapped = true;
            try { if (window.SLWrap) SLWrap.preserve(fn, wrapped); } catch (_) {}
            window[name] = wrapped;
        });
    }

    // ------------------------------------------------------- structure helpers
    // Where a node lives on the active page: { parent, list, index, free, isRoot }.
    function locate(node) {
        const page = _page(); if (!page || !node) return null;
        if (page.root === node) return { parent: null, list: null, index: -1, free: false, isRoot: true };
        const free = _unattached(page);
        const fi = free.indexOf(node);
        if (fi >= 0) return { parent: null, list: free, index: fi, free: true, isRoot: false };
        let hit = null;
        function walk(n, freeTree) {
            if (!n || hit) return;
            const kids = _kids(n);
            for (let i = 0; i < kids.length && !hit; i++) {
                if (kids[i] === node) { hit = { parent: n, list: kids, index: i, free: freeTree, isRoot: false }; return; }
                walk(kids[i], freeTree);
            }
        }
        walk(page.root, false);
        for (let i = 0; i < free.length && !hit; i++) walk(free[i], true);
        return hit;
    }
    function contains(branch, node) { let f = false; (function w(x) { if (!x || f) return; if (x === node) { f = true; return; } _kids(x).forEach(w); })(branch); return f; }
    function _kindName(n) {
        if (!n) return 'node';
        if (n.type === 'basic') return 'a basic event';
        if (n.type === 'undeveloped') return 'an undeveloped event';
        if (n.type === 'conditioning') return 'a conditioning event';
        if (n.type === 'house') return 'a house event';
        return 'an event';
    }
    // '' when node may become an input of target, else the plain reason it may not.
    function whyNotConnect(node, target) {
        if (!node || !target) return 'Drop it onto a gate.';
        const page = _page();
        if (page && page.root === node) return 'The top event cannot be moved under another gate. Move the other nodes under it instead.';
        if (!_isGate(target)) return _label(target) + ' is ' + _kindName(target) + '. Only a gate can take inputs.';
        if (target.gateType === 'TRANSFER') return _label(target) + ' is a transfer gate: it continues on another page and cannot take inputs here.';
        if (target.transferOutTo) return 'The branch under ' + _label(target) + ' lives on its own page (transferred out). Open that page to add inputs.';
        if (node === target || contains(node, target)) return 'That would make a loop: ' + _label(target) + ' is inside the branch you are moving.';
        if (target.gateType === 'NOT') {
            const others = _kids(target).filter(k => k !== node);
            if (others.length >= 1) return 'A NOT gate takes exactly one input, and ' + _label(target) + ' already has one.';
        }
        return '';
    }
    function _detach(node) {
        const loc = locate(node);
        if (!loc || loc.isRoot) return null;
        loc.list.splice(loc.index, 1);
        return loc;
    }
    function _attach(node, target) {
        if (Array.isArray(target._children) && !Array.isArray(target.children)) target._children.push(node);
        else { if (!Array.isArray(target.children)) target.children = []; target.children.push(node); }
    }
    function _clearOffsets(n) { (function w(x) { if (!x) return; x.xOffset = 0; x.yOffset = 0; _kids(x).forEach(w); })(n); delete n.freeX; delete n.freeY; }
    function _topDown() { try { return typeof ftaConfig !== 'undefined' && ftaConfig && ftaConfig.mode === 'top-down'; } catch (_) { return false; } }
    // Top-down weights: a sibling group always sums to 100 (same rebalancer the slider and the add buttons use).
    function _rebalanceAfterMove(node, oldParent, newParent) {
        if (!_topDown()) return;
        try {
            if (oldParent && typeof _normalizeSiblingWeights === 'function') { const s = _kids(oldParent); if (s.length) _normalizeSiblingWeights(s); }
            if (newParent) {
                const sibs = _kids(newParent);
                if (sibs.length > 1 && typeof _normalizeSiblingWeights === 'function' && typeof _rebalanceSiblingWeights === 'function') {
                    _normalizeSiblingWeights(sibs.filter(x => x !== node));
                    _rebalanceSiblingWeights(node, sibs, 100 / sibs.length);
                } else if (sibs.length === 1) node.weight = 100;
            }
        } catch (_) {}
    }
    function _ccfResync(branch) {
        try {
            if (typeof ccfSyncGroup !== 'function') return;
            const groups = new Set();
            (function w(n) { if (!n) return; if (n.type === 'basic' && n.ccfGroup) groups.add(n.ccfGroup); _kids(n).forEach(w); })(branch);
            groups.forEach(gn => ccfSyncGroup(gn));
        } catch (_) {}
    }

    // connect(node, target): node (and its branch) becomes an input of target.
    function connect(node, target, opts) {
        opts = opts || {};
        const loc0 = locate(node);
        if (loc0 && loc0.parent === target) { if (!opts.quiet) _toast(_label(node) + ' is already an input of ' + _label(target) + '.', 'info', 2600); return { ok: false, reason: 'same' }; }
        const wasFree = !!(loc0 && loc0.free && !loc0.parent);
        return applyEdit((wasFree ? 'Connect ' : 'Move ') + _label(node) + ' under ' + _label(target), function () {
            const loc = _detach(node);
            _attach(node, target);
            _clearOffsets(node);
            _rebalanceAfterMove(node, loc && loc.parent, target);
            _ccfResync(node);
            // A branch joining an allocation tree is mirrored into its verification tree, the way the add buttons do.
            try {
                const page = _page();
                const tl = locate(target);
                if (wasFree && page && !page.verifies && tl && !tl.free && typeof _autoMirrorIntoVerification === 'function') _autoMirrorIntoVerification(node, page, target);
            } catch (_) {}
        }, { validate: function () { return whyNotConnect(node, target); }, structural: true, kind: wasFree ? 'connect' : 'reparent', nodeIds: [node.id, target.id], undoPushed: !!opts.undoPushed });
    }
    // disconnect(node, x, y): the branch leaves its gate and waits, unattached, at (x, y).
    function disconnect(node, x, y, opts) {
        opts = opts || {};
        return applyEdit('Disconnect ' + _label(node), function () {
            const loc = _detach(node);
            if (x == null || y == null) { const p = _defaultFreeSpot(); x = p.x; y = p.y; }
            _clearOffsets(node);
            node.freeX = Math.round(x); node.freeY = Math.round(y);
            _unattached().push(node);
            _rebalanceAfterMove(node, loc && loc.parent, null);
            _ccfResync(node);
            if (typeof selectedNodeData !== 'undefined' && selectedNodeData === node) { try { selectNode(node); } catch (_) {} }
        }, {
            validate: function () {
                const loc = locate(node);
                if (!loc) return 'That node is not on this page.';
                if (loc.isRoot) return 'The top event cannot be disconnected. Clear it with Delete Node, or start a new page.';
                if (loc.free && !loc.parent) return _label(node) + ' is already unattached.';
                return '';
            }, structural: true, kind: 'disconnect', nodeIds: [node.id], undoPushed: !!opts.undoPushed
        });
    }
    function moveFree(node, x, y, opts) {
        return applyEdit('Move ' + _label(node), function () { node.freeX = Math.round(x); node.freeY = Math.round(y); },
            { recalc: false, render: !(opts && opts.undoPushed), kind: 'move', nodeIds: [node.id], undoPushed: !!(opts && opts.undoPushed) });
    }
    function deleteFree(node) {
        return applyEdit('Delete unattached ' + _label(node), function () {
            const list = _unattached(); const i = list.indexOf(node); if (i >= 0) list.splice(i, 1);
            _ccfResync(node);
            if (typeof selectedNodeData !== 'undefined' && selectedNodeData === node) {
                selectedNodeData = null;
                const pnl = document.getElementById('node-config-panel'); if (pnl) pnl.style.display = 'none';
            }
        }, { validate: function () { return _isFree(node) ? '' : 'Only unattached nodes are deleted this way.'; }, structural: false, recalc: false, kind: 'delete-unattached', nodeIds: [node.id] });
    }
    function _defaultFreeSpot() {
        let maxX = 0, minY = 0, any = false;
        try {
            if (typeof g !== 'undefined' && g && g.node()) {
                g.selectAll('g.node').each(function (d) { if (!d) return; if (!any || d.x > maxX) maxX = d.x; if (!any || d.y < minY) minY = d.y; any = true; });
            }
        } catch (_) {}
        const n = _unattached().length;
        return { x: (any ? maxX : 0) + 260, y: (any ? minY : 0) + 40 + n * 190 };
    }

    // ------------------------------------------------------------ the toolbox
    const PALETTE = [
        { group: 'Gates', items: [
            { t: 'AND', label: 'AND', tip: 'AND gate: the output occurs when all inputs occur.' },
            { t: 'OR', label: 'OR', tip: 'OR gate: the output occurs when any input occurs.' },
            { t: 'XOR', label: 'XOR', tip: 'Exclusive OR: the output occurs when exactly one input occurs.' },
            { t: 'VOTING', label: 'k of n', tip: 'Voting gate: the output occurs when at least k of the n inputs occur (k starts at 2).' },
            { t: 'INHIBIT', label: 'INHIBIT', tip: 'Inhibit gate: the input causes the output only while the condition (a conditioning event) holds.' },
            { t: 'TRANSFER', label: 'Transfer', tip: 'Transfer gate: the branch continues on another fault tree page.' }
        ] },
        { group: 'Dynamic gates', items: [
            { t: 'PAND', label: 'PAND', tip: 'Priority AND: the output occurs when all inputs fail in order, left to right.' },
            { t: 'SPARE', label: 'SPARE', tip: 'Spare gate: the first input is the primary; the others take over in turn (cold or warm standby).' },
            { t: 'SEQ', label: 'SEQ', tip: 'Sequence gate: the inputs can only fail one after another, left to right; the output occurs when all have failed.' },
            { t: 'FDEP', label: 'FDEP', tip: 'Functional dependency: when the first input (the trigger) occurs, the other inputs count as failed.' }
        ] },
        { group: 'Non-coherent', nonCoherent: true, items: [
            { t: 'NOT', label: 'NOT', tip: 'NOT gate: the output occurs when its single input does NOT occur. Turned on in Project setup.' }
        ] },
        { group: 'Events', items: [
            { t: 'basic', label: 'Basic', tip: 'Basic event: a failure with its own failure rate or probability.' },
            { t: 'undeveloped', label: 'Undeveloped', tip: 'Undeveloped event: not developed further (not enough information or not needed).' },
            { t: 'conditioning', label: 'Condition', tip: 'Conditioning event: the condition an INHIBIT gate needs.' },
            { t: 'house', label: 'House', tip: 'House event: a condition that is either on or off (set its probability to 1 or 0).' },
            { t: 'intermediate', label: 'Intermediate', tip: 'Intermediate event: a described event developed further below it (description box with an OR gate).' }
        ] }
    ];
    const _GATES = { AND: 1, OR: 1, XOR: 1, VOTING: 1, INHIBIT: 1, TRANSFER: 1, PAND: 1, SPARE: 1, SEQ: 1, FDEP: 1, NOT: 1 };
    function _specData(spec) {
        if (spec.t === 'intermediate') return { type: 'gate', gateType: 'OR' };
        return _GATES[spec.t] ? { type: 'gate', gateType: spec.t } : { type: spec.t };
    }
    function _iconSvg(spec) {
        let path = '', col = { fill: '#8e8e93', stroke: '#6e6e73' };
        try { const d = { data: _specData(spec) }; path = getShapePath(d); col = getNodeColors(d); } catch (_) {}
        const box = spec.t === 'intermediate' ? '<rect x="-24" y="-46" width="48" height="16" rx="2" fill="var(--color-surface-1,#fff)" stroke="currentColor" stroke-width="1.5"/><line x1="0" y1="-30" x2="0" y2="-24" stroke="currentColor" stroke-width="1.5"/>' : '';
        const vb = spec.t === 'intermediate' ? '-30 -50 60 72' : '-32 -34 64 66';
        return '<svg class="ftb-ico" viewBox="' + vb + '" aria-hidden="true">' + box + '<path d="' + path + '" fill="' + col.fill + '" stroke="' + col.stroke + '" stroke-width="2"/></svg>';
    }
    function _ensureStyle() {
        if (document.getElementById('fta-canvas-edit-style')) return;
        const st = document.createElement('style');
        st.id = 'fta-canvas-edit-style';
        st.textContent = [
            // 15 Oct 2026: the toolbox is a full-height strip down the left edge of the canvas (shared rule
            // .sl-canvas-strip in safety_lab.css: position, size, background, border). Only its contents are styled here.
            '#fta-toolbox{padding:8px 7px 9px;font-family:var(--font-ui,system-ui,sans-serif);user-select:none;}',
            '#fta-toolbox .ftb-title{font-size:11px;font-weight:700;color:var(--color-text-primary,#16213A);margin:0 2px 2px;}',
            '#fta-toolbox .ftb-hint{font-size:10px;line-height:1.35;color:var(--color-text-secondary,#4A5568);margin:0 2px 6px;}',
            '#fta-toolbox .ftb-group{font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--color-text-tertiary,#6B7280);margin:7px 2px 3px;}',
            '#fta-toolbox .ftb-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;}',
            '#fta-toolbox .ftb-item{display:flex;flex-direction:column;align-items:center;gap:1px;padding:3px 2px 2px;border-radius:7px;border:1px solid var(--color-border-hair,#E2E8F0);background:var(--color-surface-1,#fff);cursor:grab;font-size:9.5px;font-weight:600;min-width:0;white-space:nowrap;color:var(--color-text-primary,#16213A);line-height:1.1;touch-action:none;}',
            '#fta-toolbox .ftb-item:hover{border-color:var(--color-accent,#3B5BDB);background:var(--color-surface-1,#fff);}',
            '#fta-toolbox .ftb-item:focus-visible{outline:2px solid var(--color-accent,#3B5BDB);outline-offset:1px;}',
            '#fta-toolbox .ftb-ico{width:28px;height:23px;color:var(--color-text-secondary,#4A5568);}',
            '.ftb-ghost{position:fixed;z-index:10050;pointer-events:none;display:flex;align-items:center;gap:6px;padding:4px 9px 4px 5px;border-radius:8px;background:var(--color-surface-1,#fff);border:1px solid var(--color-accent,#3B5BDB);box-shadow:0 6px 18px rgba(15,23,42,.22);font:600 11px var(--font-ui,system-ui,sans-serif);color:var(--color-text-primary,#16213A);}',
            '.ftb-ghost .ftb-ico{width:26px;height:24px;}',
            '#fta-drop-tip{position:fixed;z-index:10051;pointer-events:none;max-width:320px;padding:5px 9px;border-radius:7px;font:600 11.5px/1.35 var(--font-ui,system-ui,sans-serif);box-shadow:0 4px 14px rgba(15,23,42,.2);display:none;}',
            '#fta-drop-tip.ok{background:#0f5132;color:#fff;}#fta-drop-tip.bad{background:#842029;color:#fff;}#fta-drop-tip.info{background:#1e293b;color:#fff;}',
            '#fta-svg .node.fta-drop-ok > path, #fta-svg .fta-free.fta-drop-ok > path{stroke:#16a34a !important;stroke-width:4px !important;filter:drop-shadow(0 0 7px rgba(22,163,74,.75));}',
            '#fta-svg .node.fta-drop-bad > path, #fta-svg .fta-free.fta-drop-bad > path{stroke:#dc2626 !important;stroke-width:4px !important;}',
            '#fta-svg .fta-dragging{pointer-events:none;opacity:.78;}',
            '#fta-svg .fta-conn-handle{fill:var(--color-surface-1,#fff);stroke:var(--color-accent,#3B5BDB);stroke-width:2.5px;cursor:crosshair;}',
            '#fta-svg .fta-conn-handle:hover{fill:var(--color-accent,#3B5BDB);}',
            '#fta-svg .fta-rubber{stroke:var(--color-accent,#3B5BDB);stroke-width:2.5px;stroke-dasharray:6 4;fill:none;pointer-events:none;}',
            '#fta-svg .fta-free-card{fill:var(--color-surface-1,#fff);stroke:#94a3b8;stroke-width:1.6px;stroke-dasharray:6 4;}',
            '#fta-svg .fta-free.selected .fta-free-card{stroke:var(--color-accent,#3B5BDB);stroke-width:2.4px;}',
            '#fta-svg .fta-free-title{font:700 12px var(--font-ui,system-ui,sans-serif);fill:var(--color-text-primary,#16213A);}',
            '#fta-svg .fta-free-sub{font:11px var(--font-ui,system-ui,sans-serif);fill:var(--color-text-secondary,#4A5568);}',
            '#fta-svg .fta-free-flag{font:italic 600 10.5px var(--font-ui,system-ui,sans-serif);fill:#b45309;}',
            '#fta-svg .fta-free-del{cursor:pointer;}',
            '#fta-svg .fta-item-badge rect{fill:#ecfeff;stroke:#0e7490;stroke-width:1px;}',
            '#fta-svg .fta-item-badge text{font:600 10px var(--font-mono,ui-monospace,monospace);fill:#155e75;}',
            'body.theme-dark #fta-svg .fta-item-badge rect{fill:#083344;stroke:#22d3ee;}body.theme-dark #fta-svg .fta-item-badge text{fill:#a5f3fc;}',
            '#fta-svg .inline-metrics.fta-metric-edit{pointer-events:auto;cursor:text;user-select:text;border:1px dashed transparent;border-radius:4px;}',
            '#fta-svg .inline-metrics.fta-metric-edit:hover{border-color:var(--color-border-strong,#B9C2D0);background:var(--color-surface-1,#fff);}',
            '#fta-svg .inline-metrics.fta-metric-edit:focus{border:1px solid var(--color-accent,#3B5BDB);background:var(--color-surface-1,#fff);box-shadow:0 0 0 3px var(--color-accent-soft,rgba(59,91,219,.18));}',
            '#fta-svg .inline-metrics.fta-metric-bad{outline:2px solid #dc2626 !important;}',
            '#fta-minimap{position:absolute;right:12px;top:12px;z-index:7;width:232px;border-radius:10px;background:var(--color-surface-1,#fff);border:1px solid var(--color-border-strong,#B9C2D0);box-shadow:0 2px 10px rgba(15,23,42,.10);overflow:hidden;font-family:var(--font-ui,system-ui,sans-serif);}',
            '#fta-minimap .fmm-head{display:flex;align-items:center;justify-content:space-between;padding:4px 6px 3px 9px;font-size:11px;font-weight:700;color:var(--color-text-primary,#16213A);border-bottom:1px solid var(--color-border-hair,#E2E8F0);}',
            '#fta-minimap .fmm-head span{font-weight:500;color:var(--color-text-tertiary,#6B7280);font-size:10px;margin-left:6px;}',
            '#fta-minimap .fmm-close{border:none;background:transparent;font-size:15px;line-height:1;cursor:pointer;color:var(--color-text-secondary,#4A5568);padding:0 3px;}',
            '#fta-minimap .fmm-body{position:relative;width:232px;height:150px;cursor:pointer;}',
            '#fta-minimap canvas{position:absolute;left:0;top:0;width:232px;height:150px;}',
            '#svg-wrap-container #lod-pill{left:168px !important;}',
            '#svg-wrap-container .fta-empty-state{padding-left:160px;}'
        ].join('\n');
        document.head.appendChild(st);
    }
    function _ensureToolbox() {
        const host = document.getElementById('svg-wrap-container');
        if (!host) return null;
        _ensureStyle();
        let tb = document.getElementById('fta-toolbox');
        const nc = nonCoherentAllowed();
        if (tb && tb.getAttribute('data-nc') === String(nc)) return tb;
        if (!tb) {
            tb = document.createElement('div');
            tb.id = 'fta-toolbox';
            tb.className = 'sl-canvas-strip';
            tb.setAttribute('role', 'toolbar');
            tb.setAttribute('aria-label', 'Fault tree toolbox');
            if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
            host.appendChild(tb);
            ['mousedown', 'wheel', 'dblclick', 'click'].forEach(ev => tb.addEventListener(ev, e => e.stopPropagation()));
        }
        tb.setAttribute('data-nc', String(nc));
        let html = '<div class="ftb-title">Toolbox</div><div class="ftb-hint">Drag onto a gate or onto empty canvas. A click adds it under the selected gate.</div>';
        PALETTE.forEach(function (grp) {
            if (grp.nonCoherent && !nc) return;
            html += '<div class="ftb-group">' + _esc(grp.group) + '</div><div class="ftb-grid">';
            grp.items.forEach(function (it) {
                html += '<button type="button" class="ftb-item" data-t="' + it.t + '" title="' + _esc(it.tip) + '" aria-label="' + _esc(it.tip) + '">' + _iconSvg(it) + '<span>' + _esc(it.label) + '</span></button>';
            });
            html += '</div>';
        });
        tb.innerHTML = html;
        tb.querySelectorAll('.ftb-item').forEach(function (b) {
            b.addEventListener('pointerdown', _paletteDown);
            b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addFromPalette(b.getAttribute('data-t'), null); } });
        });
        return tb;
    }
    function _specOf(t) { for (const g of PALETTE) for (const it of g.items) if (it.t === t) return it; return null; }
    function _syncTypeOptions() {
        const on = nonCoherentAllowed();
        document.querySelectorAll('.fta-opt-not-group').forEach(function (og) { og.hidden = !on; });
        document.querySelectorAll('option.fta-opt-not').forEach(function (o) { o.disabled = !on; o.hidden = !on; });
        // A node that already IS a NOT gate keeps its own option selectable in the panel.
        try {
            const sel = document.getElementById('config-node-type');
            if (sel && typeof selectedNodeData !== 'undefined' && selectedNodeData && selectedNodeData.gateType === 'NOT') {
                const o = sel.querySelector('option.fta-opt-not'); if (o) { o.disabled = false; o.hidden = false; o.parentNode.hidden = false; }
            }
        } catch (_) {}
        const cb = document.getElementById('proj-allow-not'); if (cb) cb.checked = on;
    }

    // addFromPalette(t, target): target = a gate (input), 'empty' at {x,y}, or null (= the selected gate)
    function addFromPalette(t, target, at) {
        const spec = _specOf(t); if (!spec) return;
        const data = _specData(spec);
        if (data.gateType === 'NOT' && !nonCoherentAllowed()) { _toast('NOT gates are off for this project. Turn on "Allow NOT gates" in Project setup first.'); return; }
        const page = _page();
        if (!page) { _toast('Open or create a fault tree page first.'); return; }
        if (target === null) {
            target = (typeof selectedNodeData !== 'undefined') ? selectedNodeData : null;
            if (!page.root) target = 'empty';
            else if (!target) { _toast('Select a gate first, or drag the ' + spec.label + ' item onto a gate.', 'info', 4200); return; }
        }
        if (target === 'empty') {
            if (!page.root) return _addTop(spec, data);
            const pos = at || _defaultFreeSpot();
            return _addFree(spec, data, pos.x, pos.y);
        }
        const why = whyNotConnect({}, target);
        if (why) { _toast(why); return; }
        return applyEdit('Add ' + spec.label + ' under ' + _label(target), function () {
            const prevSel = selectedNodeData;
            selectedNodeData = target;
            let nn = null;
            if (data.type === 'gate') {
                const sel = document.getElementById('select-gate-type');
                const keep = sel ? sel.value : null;
                if (sel) { _ensureOption(sel, data.gateType); sel.value = data.gateType; }
                (window.addSelectedGate || addSelectedGate)();
                if (sel && keep != null) sel.value = keep;
            } else {
                const sel = document.getElementById('select-event-type');
                const keep = sel ? sel.value : null;
                if (sel) sel.value = data.type;
                (window.addSelectedEvent || addSelectedEvent)();
                if (sel && keep != null) sel.value = keep;
            }
            nn = (selectedNodeData !== target) ? selectedNodeData : null;
            if (!nn) { selectedNodeData = prevSel; return null; }
            _finishNew(nn, spec);
            return nn;
        }, { structural: true, kind: 'add', nodeIds: [target.id], recalc: false, render: spec.t === 'intermediate' });   // the add buttons' own path already recalculated and redrew
    }
    function _ensureOption(sel, v) { if (!Array.from(sel.options).some(o => o.value === v)) { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); } else { const o = Array.from(sel.options).find(x => x.value === v); if (o) o.disabled = false; } }
    function _finishNew(nn, spec) {
        if (spec.t === 'intermediate') { nn.name = 'New intermediate event'; nn.gateType = 'OR'; }
        if (nn.gateType === 'SPARE') { if (!isFinite(parseFloat(nn.spareWarmK))) nn.spareWarmK = 0; if (!isFinite(parseFloat(nn.spareSwitchP))) nn.spareSwitchP = 1; }
        if (nn.gateType === 'VOTING' && !(nn.votingK > 0)) nn.votingK = 2;
        if (nn.type === 'house' && !(nn.probability > 0)) nn.probability = 0;
    }
    function _newNodeData(spec, data) {
        const id = internalIdCounter++;
        if (data.type === 'gate') {
            const n = { id: id, logicalId: id, displayId: generateDisplayId('gate'), name: spec.t === 'intermediate' ? 'New intermediate event' : ('New ' + spec.label + ' Gate'), type: 'gate', gateType: data.gateType, probability: 0, children: [] };
            _finishNew(n, spec);
            return n;
        }
        return { id: id, logicalId: id, displayId: generateDisplayId(data.type), name: 'New Event', type: data.type, probability: 0, lambda: 0.0001, ccfGroup: '', beta: 0, children: [] };
    }
    function _addTop(spec, data) {
        if (data.type !== 'gate' || data.gateType === 'TRANSFER') { _toast('Start with a gate: the top event is the failure condition, developed through a gate below it.', 'info', 5200); return; }
        return applyEdit('Add top event (' + spec.label + ')', function () {
            (window.addTopEvent || addTopEvent)();
            const r = _root();
            if (r) { r.gateType = data.gateType; if (spec.t !== 'intermediate' && data.gateType !== 'OR') r.name = 'System Failure'; _finishNew(r, spec); if (spec.t === 'intermediate') r.name = 'System Failure'; }
            return r;
        }, { structural: true, kind: 'add-top', recalc: false });
    }
    function _addFree(spec, data, x, y) {
        let nn = null;
        const r = applyEdit('Add unattached ' + spec.label, function () {
            nn = _newNodeData(spec, data);
            nn.freeX = Math.round(x); nn.freeY = Math.round(y);
            _unattached().push(nn);
            return nn;
        }, { structural: false, recalc: false, kind: 'add-unattached' });
        if (r.ok && nn) { try { openNodePropertiesModal(nn); } catch (_) {} _toast('Added unattached. Drag its round handle onto a gate to connect it. Unattached nodes are not in the math.', 'info', 4800); }
        return r;
    }

    // ------------------------------------------------- pointer drag machinery
    function _svgEl() { return document.getElementById('fta-svg'); }
    function _world(clientX, clientY) {
        const el = _svgEl(); if (!el) return { x: 0, y: 0 };
        const r = el.getBoundingClientRect();
        let t = { x: 0, y: 0, k: 1 };
        try { t = d3.zoomTransform(el); } catch (_) {}
        return { x: (clientX - r.left - t.x) / t.k, y: (clientY - r.top - t.y) / t.k };
    }
    function _overCanvas(clientX, clientY) {
        const el = _svgEl(); if (!el) return false;
        const r = el.getBoundingClientRect();
        if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return false;
        const hit = document.elementFromPoint(clientX, clientY);
        if (!hit) return false;
        if (hit.closest && (hit.closest('#fta-toolbox') || hit.closest('#fta-minimap') || hit.closest('.canvas-floating-actions'))) return false;
        return !!(hit === el || (hit.closest && hit.closest('#fta-svg')));
    }
    // The node (data object) under the pointer, from a tree node or an unattached card.
    function _nodeAt(clientX, clientY) {
        const hit = document.elementFromPoint(clientX, clientY);
        if (!hit || !hit.closest) return null;
        const gEl = hit.closest('#fta-svg g.node, #fta-svg g.fta-free');
        if (!gEl) return null;
        const d = gEl.__data__;
        return d && d.data ? { node: d.data, el: gEl } : null;
    }
    let _tipEl = null, _hotEl = null;
    function _tip(text, cls, x, y) {
        if (!_tipEl) { _tipEl = document.createElement('div'); _tipEl.id = 'fta-drop-tip'; document.body.appendChild(_tipEl); }
        if (!text) { _tipEl.style.display = 'none'; return; }
        _tipEl.className = cls; _tipEl.textContent = text; _tipEl.style.display = 'block';
        _tipEl.style.left = Math.min(window.innerWidth - 330, x + 16) + 'px'; _tipEl.style.top = (y + 18) + 'px';
    }
    function _hot(el, ok) {
        if (_hotEl && _hotEl !== el) _hotEl.classList.remove('fta-drop-ok', 'fta-drop-bad');
        _hotEl = el || null;
        if (el) { el.classList.toggle('fta-drop-ok', !!ok); el.classList.toggle('fta-drop-bad', !ok); }
    }
    function _clearHot() { _hot(null); _tip(''); }
    // What dropping `moving` (a node, or a palette spec when moving is null) at the pointer would do.
    function _dropVerdict(clientX, clientY, moving, specLabel) {
        if (!_overCanvas(clientX, clientY)) return { kind: 'none' };
        const at = _nodeAt(clientX, clientY);
        if (at && at.node !== moving) {
            if (moving) {
                const loc = locate(moving);
                if (loc && loc.parent === at.node) return { kind: 'same', el: at.el, target: at.node };
                const why = whyNotConnect(moving, at.node);
                return why ? { kind: 'bad', el: at.el, why: why } : { kind: 'ok', el: at.el, target: at.node, text: 'Drop to connect ' + _label(moving) + ' under ' + _label(at.node) };
            }
            const why = whyNotConnect({}, at.node);
            return why ? { kind: 'bad', el: at.el, why: why } : { kind: 'ok', el: at.el, target: at.node, text: 'Drop to add ' + specLabel + ' under ' + _label(at.node) };
        }
        return { kind: 'empty', world: _world(clientX, clientY) };
    }

    // Toolbox drag
    let _pal = null;
    function _paletteDown(e) {
        if (e.button !== 0) return;
        const btn = e.currentTarget, t = btn.getAttribute('data-t'), spec = _specOf(t);
        _pal = { t: t, spec: spec, x0: e.clientX, y0: e.clientY, moved: false, ghost: null };
        try { btn.setPointerCapture(e.pointerId); } catch (_) {}
        btn.addEventListener('pointermove', _paletteMove);
        btn.addEventListener('pointerup', _paletteUp);
        btn.addEventListener('pointercancel', _paletteCancel);
        e.preventDefault();
    }
    function _paletteMove(e) {
        if (!_pal) return;
        if (!_pal.moved && Math.hypot(e.clientX - _pal.x0, e.clientY - _pal.y0) < 5) return;
        if (!_pal.moved) {
            _pal.moved = true;
            const gh = document.createElement('div'); gh.className = 'ftb-ghost';
            gh.innerHTML = _iconSvg(_pal.spec) + '<span>' + _esc(_pal.spec.label) + '</span>';
            document.body.appendChild(gh); _pal.ghost = gh;
        }
        _pal.ghost.style.left = (e.clientX + 8) + 'px'; _pal.ghost.style.top = (e.clientY - 14) + 'px';
        const v = _dropVerdict(e.clientX, e.clientY, null, _pal.spec.label);
        if (v.kind === 'ok') { _hot(v.el, true); _tip(v.text, 'ok', e.clientX, e.clientY); }
        else if (v.kind === 'bad') { _hot(v.el, false); _tip(v.why, 'bad', e.clientX, e.clientY); }
        else if (v.kind === 'empty') { _hot(null); _tip(_root() ? 'Drop here to place it unattached' : (_specData(_pal.spec).type === 'gate' && _pal.spec.t !== 'TRANSFER' ? 'Drop here to make the top event' : 'Start with a gate for the top event'), 'info', e.clientX, e.clientY); }
        else _clearHot();
    }
    function _paletteEnd(e, commit) {
        const st = _pal; _pal = null;
        const btn = e.currentTarget;
        btn.removeEventListener('pointermove', _paletteMove); btn.removeEventListener('pointerup', _paletteUp); btn.removeEventListener('pointercancel', _paletteCancel);
        if (st && st.ghost) st.ghost.remove();
        _clearHot();
        if (!st || !commit) return;
        if (!st.moved) { addFromPalette(st.t, null); return; }
        const v = _dropVerdict(e.clientX, e.clientY, null, st.spec.label);
        if (v.kind === 'ok') addFromPalette(st.t, v.target);
        else if (v.kind === 'bad') _toast(v.why);
        else if (v.kind === 'empty') addFromPalette(st.t, 'empty', v.world);
    }
    function _paletteUp(e) { _paletteEnd(e, true); }
    function _paletteCancel(e) { _paletteEnd(e, false); }

    // Node body drag (called from updateD3's d3.drag). Moves the branch; on release over a
    // gate it reconnects the branch there instead (one undo step either way).
    let _nd = null;
    function dragStart(event, d, el) { _nd = { d: d, moved: false, el: el, sub: null }; }
    // Returns false when a before-change listener refused the move (the drag then does nothing).
    function dragMove(event, d) {
        if (!_nd || _nd.d !== d) _nd = { d: d, moved: false, el: null, sub: null };
        if (_nd.vetoed) return false;
        if (!_nd.moved) {
            if (!_runBefore({ label: 'Move ' + _label(d.data), kind: 'move', source: 'canvas', pageId: activeFTAPageId, nodeIds: [d.data.id], structural: false })) { _nd.vetoed = true; return false; }
            _nd.moved = true;
            try { if (typeof pushUndo === 'function') pushUndo('Move ' + _label(d.data)); } catch (_) {}
            const ids = new Set(); d.each(n => ids.add(n.data.id)); _nd.sub = ids;
            try { g.selectAll('g.node').filter(nd => ids.has(nd.data.id)).classed('fta-dragging', true); } catch (_) {}
        }
        const se = event.sourceEvent; if (!se) return;
        const cx = se.clientX != null ? se.clientX : (se.touches && se.touches[0] ? se.touches[0].clientX : null);
        const cy = se.clientY != null ? se.clientY : (se.touches && se.touches[0] ? se.touches[0].clientY : null);
        if (cx == null) return;
        _nd.cx = cx; _nd.cy = cy;
        const isRoot = d.depth === 0;
        if (isRoot) { _clearHot(); return; }
        const v = _dropVerdict(cx, cy, d.data);
        if (v.kind === 'ok') { _hot(v.el, true); _tip(v.text, 'ok', cx, cy); }
        else if (v.kind === 'bad') { _hot(v.el, false); _tip(v.why, 'bad', cx, cy); }
        else _clearHot();
    }
    function dragEnd(event, d) {
        const st = _nd; _nd = null;
        // The verdict is read while the dragged branch is still click-through (fta-dragging).
        const v = (st && st.moved && d.depth !== 0 && st.cx != null) ? _dropVerdict(st.cx, st.cy, d.data) : { kind: 'none' };
        try { g.selectAll('g.node.fta-dragging').classed('fta-dragging', false); } catch (_) {}
        _clearHot();
        if (!st || !st.moved) return;
        if (d.depth !== 0 && st.cx != null) {
            if (v.kind === 'ok') { const cr = connect(d.data, v.target, { undoPushed: true }); if (cr && cr.ok) return; }
            if (v.kind === 'bad') _toast(v.why + ' The node was only moved.', 'warning', 5200);
        }
        applyEdit('Move ' + _label(d.data), function () {}, { undoPushed: true, skipBefore: true, recalc: false, render: false, kind: 'move', nodeIds: [d.data.id] });
    }

    // Connection handle drag: a dashed line from the handle; drop on a gate to connect,
    // on empty canvas to disconnect (or move an unattached node).
    let _hd = null;
    function handleDrag() {
        return d3.drag()
            .on('start', function (event, d) {
                if (event.sourceEvent) event.sourceEvent.stopPropagation();
                const node = d.data;
                const gEl = this.parentNode;
                const ox = d.free ? (node.freeX || 0) : d.x, oy = (d.free ? (node.freeY || 0) : d.y) + parseFloat(this.getAttribute('cy') || 0);
                const line = g.append('path').attr('class', 'fta-rubber').attr('d', 'M' + ox + ',' + oy + 'L' + ox + ',' + oy);
                gEl.classList.add('fta-dragging');
                _hd = { node: node, line: line, ox: ox, oy: oy, gEl: gEl, moved: false };
            })
            .on('drag', function (event) {
                if (!_hd) return;
                _hd.moved = true;
                const se = event.sourceEvent; if (!se || se.clientX == null) return;
                const w = _world(se.clientX, se.clientY);
                _hd.line.attr('d', 'M' + _hd.ox + ',' + _hd.oy + 'L' + w.x + ',' + w.y);
                _hd.cx = se.clientX; _hd.cy = se.clientY;
                const v = _dropVerdict(se.clientX, se.clientY, _hd.node);
                if (v.kind === 'ok') { _hot(v.el, true); _tip(v.text, 'ok', se.clientX, se.clientY); }
                else if (v.kind === 'bad') { _hot(v.el, false); _tip(v.why, 'bad', se.clientX, se.clientY); }
                else if (v.kind === 'same') { _hot(null); _tip(_label(_hd.node) + ' is already connected here', 'info', se.clientX, se.clientY); }
                else if (v.kind === 'empty') { _hot(null); _tip(_isFree(_hd.node) ? 'Drop to move it here' : 'Drop on empty canvas to disconnect', 'info', se.clientX, se.clientY); }
                else _clearHot();
            })
            .on('end', function () {
                const st = _hd; _hd = null;
                _clearHot();
                if (!st) return;
                const v = (st.moved && st.cx != null) ? _dropVerdict(st.cx, st.cy, st.node) : { kind: 'none' };
                try { st.line.remove(); } catch (_) {}
                try { st.gEl.classList.remove('fta-dragging'); } catch (_) {}
                if (!st.moved || st.cx == null) return;
                if (v.kind === 'ok') connect(st.node, v.target);
                else if (v.kind === 'bad') _toast(v.why);
                else if (v.kind === 'empty') {
                    if (_isFree(st.node)) moveFree(st.node, v.world.x, v.world.y);
                    else disconnect(st.node, v.world.x, v.world.y);
                }
            });
    }

    // ------------------------------------------- failure rate / P on the canvas
    function metricEditable(n) {
        return !!n && (n.type === 'basic' || n.type === 'undeveloped') && (n.inputMode || 'lambda') !== 'library' && n.eventClass !== 'dev-error' && !n.markovModelId;
    }
    const _MODE_NAME = { lambda: 'failure rate λ per hour', mtbf: 'MTBF in hours', probability: 'probability P at the exposure time' };
    function metricTitle(n) {
        if (!n || (n.type !== 'basic' && n.type !== 'undeveloped')) return 'Computed from the inputs below this gate.';
        if (n.eventClass === 'dev-error') return 'Development error: never quantified (ARP 4761A 4.1.1.1).';
        if ((n.inputMode || 'lambda') === 'library') return 'Taken from the component library. Change the source in the drop-down below or in the properties panel.';
        if (n.markovModelId) return 'Taken from its Markov model (properties panel).';
        return 'Click to type the ' + (_MODE_NAME[n.inputMode || 'lambda'] || 'value') + '. Enter saves, Esc cancels. The drop-down below picks λ, MTBF or P.';
    }
    function _rawValue(n) {
        const mode = n.inputMode || 'lambda';
        let v = n.inputValue;
        if (!(typeof v === 'number' && isFinite(v))) v = mode === 'lambda' ? (n.lambda || 0) : (mode === 'mtbf' ? ((n.lambda > 0) ? 1 / n.lambda : 0) : (n.probability || 0));
        return String(v);
    }
    function metricFocus(input, d) {
        if (!metricEditable(d.data)) { input.blur(); return; }
        input._ftaEditing = true;
        input.value = _rawValue(d.data);
        try { input.select(); } catch (_) {}
    }
    // Same rules as the properties panel: a number, finite, not negative; P at most 1; MTBF above 0.
    function validateMetric(n, text) {
        const mode = n.inputMode || 'lambda';
        const s = String(text == null ? '' : text).trim().replace(/[−]/g, '-').replace(/\s*[x×]\s*10\^?/i, 'e');
        if (s === '') return { why: 'Type a number, for example 1e-5.' };
        if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return { why: '"' + text + '" is not a number. Use a plain number or the form 1e-5.' };
        const v = parseFloat(s);
        if (!isFinite(v)) return { why: 'That number is out of range.' };
        if (v < 0) return { why: 'A ' + (mode === 'probability' ? 'probability' : (mode === 'mtbf' ? 'MTBF' : 'failure rate')) + ' cannot be negative.' };
        if (mode === 'probability' && v > 1) return { why: 'A probability cannot be above 1.' };
        if (mode === 'mtbf' && v === 0) return { why: 'An MTBF of 0 hours is not possible. Use a value above 0.' };
        return { value: v };
    }
    function metricCommit(input, d) {
        const n = d.data;
        if (!input._ftaEditing) return;
        input._ftaEditing = false;
        const res = validateMetric(n, input.value);
        if (res.why) {
            input.classList.add('fta-metric-bad');
            _toast(res.why + ' The value was not changed.', 'warning', 5000);
            setTimeout(function () { input.classList.remove('fta-metric-bad'); }, 1800);
            try { input.value = formatNodeMetrics(d); } catch (_) {}
            return;
        }
        if (String(res.value) === _rawValue(n)) { try { input.value = formatNodeMetrics(d); } catch (_) {} return; }
        setMetric(n, res.value);
    }
    function metricCancel(input, d) { input._ftaEditing = false; try { input.value = formatNodeMetrics(d); } catch (_) {} input.blur(); }
    // The properties panel's own path: inputMode/inputValue -> lambda (lambdaFromInputMode), repeated
    // copies follow (propagateRepeatedEventEdit), then recalculation through applyEdit.
    function setMetric(n, value) {
        return applyEdit('Set ' + (n.inputMode === 'probability' ? 'probability' : (n.inputMode === 'mtbf' ? 'MTBF' : 'failure rate')) + ' of ' + _label(n), function () {
            const mode = n.inputMode || 'lambda';
            n.inputMode = mode;
            n.inputValue = value;
            const t = (typeof ftaConfig !== 'undefined' && ftaConfig && ftaConfig.exposureTime) || 1;
            n.lambda = (typeof lambdaFromInputMode === 'function') ? lambdaFromInputMode(mode, value, n.libraryKey, t) : (mode === 'lambda' ? value : n.lambda);
            if (mode === 'probability') n.probability = value;
            try { if (typeof propagateRepeatedEventEdit === 'function') propagateRepeatedEventEdit(n); } catch (_) {}
            if (typeof selectedNodeData !== 'undefined' && selectedNodeData === n) { try { selectNode(n); } catch (_) {} }
        }, {
            validate: function () { return metricEditable(n) ? (validateMetric(n, value).why || '') : 'This value is not typed by hand here (library, Markov model or development error).'; },
            kind: 'set-value', nodeIds: [n.id]
        });
    }

    // ------------------------------------------- model link (properties panel)
    function elementIdOf(n) { return n ? (n.elementId || ('ftn-' + n.id)) : ''; }
    function eventDefIdOf(n) { return n ? ('fte-' + (n.logicalId != null ? n.logicalId : n.id)) : ''; }
    function _items() { try { return (typeof itemsData !== 'undefined' && Array.isArray(itemsData)) ? itemsData : []; } catch (_) { return []; } }
    function itemFor(n) {
        if (!n || n.realizedByItemId == null || n.realizedByItemId === '') return null;
        const k = String(n.realizedByItemId);
        return _items().find(it => it && (String(it.itemId) === k || String(it.internalId) === k)) || null;
    }
    function badgeText(n) {
        if (!n) return '';
        const it = itemFor(n);
        if (it) return '⛓ ' + (it.itemId || it.name);
        if (n.realizedByItemId != null && n.realizedByItemId !== '') return '⛓ ' + n.realizedByItemId + ' (missing)';
        if (n.sysmlRef) { const s = String(n.sysmlRef); return '⛓ ' + s.split(/::|\./).pop(); }
        return '';
    }
    function fillPanel(n) {
        const host = document.getElementById('config-model-link');
        if (!host) return;
        if (!n) { host.style.display = 'none'; return; }
        host.style.display = 'block';
        const sysName = id => { try { const s = (systemsData || []).find(x => x && (String(x.id) === String(id) || String(x.internalId) === String(id))); return s ? (s.name || s.id) : (id || 'No system'); } catch (_) { return id || 'No system'; } };
        const groups = new Map();
        _items().forEach(function (it) { if (!it) return; const k = sysName(it.owningSystemId); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); });
        const cur = n.realizedByItemId != null ? String(n.realizedByItemId) : '';
        const curItem = itemFor(n);
        let opts = '<option value="">Not linked</option>';
        groups.forEach(function (list, gname) {
            opts += '<optgroup label="' + _esc(gname) + '">' + list.map(function (it) {
                const v = it.itemId != null ? String(it.itemId) : String(it.internalId);
                const sel = curItem === it ? ' selected' : '';
                return '<option value="' + _esc(v) + '"' + sel + '>' + _esc((it.itemId || '') + (it.name ? ' · ' + it.name : '')) + '</option>';
            }).join('') + '</optgroup>';
        });
        if (cur && !curItem) opts += '<option value="' + _esc(cur) + '" selected>' + _esc(cur) + ' (not in the item list)</option>';
        const sel = document.getElementById('config-model-item');
        if (sel) { sel.innerHTML = opts; sel.disabled = !_items().length && !cur; }
        const empty = document.getElementById('config-model-item-empty');
        if (empty) empty.style.display = _items().length ? 'none' : 'block';
        const ref = document.getElementById('config-model-sysml');
        if (ref && document.activeElement !== ref) ref.value = n.sysmlRef || '';
        const eid = document.getElementById('config-model-eid');
        if (eid) eid.textContent = elementIdOf(n) + (n.type !== 'gate' ? '  ·  event ' + eventDefIdOf(n) : '');
        const free = document.getElementById('config-model-free');
        if (free) free.style.display = _isFree(n) ? 'block' : 'none';
        _syncTypeOptions();
    }
    function setItemLink(value) {
        const n = (typeof selectedNodeData !== 'undefined') ? selectedNodeData : null; if (!n) return;
        const v = String(value || '');
        applyEdit(v ? ('Link ' + _label(n) + ' to item ' + v) : ('Unlink ' + _label(n) + ' from its item'), function () {
            if (v) n.realizedByItemId = v; else delete n.realizedByItemId;
            fillPanel(n);
        }, { recalc: false, kind: 'model-link', nodeIds: [n.id] });
    }
    function setSysmlRef(value) {
        const n = (typeof selectedNodeData !== 'undefined') ? selectedNodeData : null; if (!n) return;
        const v = String(value || '').trim();
        if ((n.sysmlRef || '') === v) return;
        applyEdit(v ? ('Set SysML reference of ' + _label(n)) : ('Clear SysML reference of ' + _label(n)), function () {
            if (v) n.sysmlRef = v; else delete n.sysmlRef;
        }, { validate: function () { return v.length > 400 ? 'That reference is too long (400 characters at most).' : ''; }, recalc: false, kind: 'model-link', nodeIds: [n.id] });
    }

    // ------------------------------------------------- non-coherent setting
    function _notGates() {
        let c = 0;
        try { (ftaPages || []).forEach(function (p) { [p.root].concat(Array.isArray(p.unattached) ? p.unattached : []).forEach(function walk(n) { if (!n) return; if (n.type === 'gate' && n.gateType === 'NOT') c++; _kids(n).forEach(walk); }); }); } catch (_) {}
        return c;
    }
    function setNonCoherent(on) {
        on = !!on;
        const cb = document.getElementById('proj-allow-not');
        const r = applyEdit(on ? 'Allow NOT gates' : 'Turn off NOT gates', function () {
            projectConfig.allowNonCoherent = on;
        }, {
            validate: function () { const c = _notGates(); return (!on && c) ? ('This project still has ' + c + ' NOT gate' + (c === 1 ? '' : 's') + '. Change ' + (c === 1 ? 'it' : 'them') + ' to another gate type first.') : ''; },
            kind: 'setting', source: 'settings'
        });
        if (cb) cb.checked = nonCoherentAllowed();
        _ensureToolbox(); _syncTypeOptions();
        if (r.ok) _toast(on ? 'NOT gates are on. Cut sets of trees that use them are listed as prime implicants ("NOT X" means X does not occur).' : 'NOT gates are off (the default).', 'info', 5200);
        return r;
    }

    // ------------------------------------------------- unattached layer
    function _renderFree(isDark) {
        if (typeof g === 'undefined' || !g || !g.node()) return;
        const page = _page();
        const list = page ? _unattached(page) : [];
        let layer = g.select('g.fta-free-layer');
        if (layer.empty()) layer = g.append('g').attr('class', 'fta-free-layer');
        else layer.raise();
        const sel = layer.selectAll('g.fta-free').data(list.map(n => ({ data: n, free: true })), d => d.data.id);
        sel.exit().remove();
        const en = sel.enter().append('g').attr('class', 'fta-free');
        en.append('rect').attr('class', 'fta-free-card').attr('x', -95).attr('y', -64).attr('width', 190).attr('height', 128).attr('rx', 10);
        en.append('path').attr('class', 'fta-free-shape');
        en.append('text').attr('class', 'fta-free-title').attr('text-anchor', 'middle').attr('y', -40);
        en.append('text').attr('class', 'fta-free-sub fta-free-name').attr('text-anchor', 'middle').attr('y', -24);
        en.append('text').attr('class', 'fta-free-sub fta-free-count').attr('text-anchor', 'middle').attr('y', 38);
        en.append('text').attr('class', 'fta-free-flag').attr('text-anchor', 'middle').attr('y', 54).text('Not connected: not in the math');
        const del = en.append('g').attr('class', 'fta-free-del').attr('transform', 'translate(80,-50)');
        del.append('circle').attr('r', 9).attr('fill', '#fee2e2').attr('stroke', '#dc2626');
        del.append('text').attr('text-anchor', 'middle').attr('y', 4).attr('font-size', '13px').attr('font-weight', '700').attr('fill', '#b91c1c').text('×');
        del.append('title').text('Delete this unattached node and everything under it');
        del.on('mousedown', e => e.stopPropagation()).on('click', function (event, d) { event.stopPropagation(); deleteFree(d.data); });
        en.append('circle').attr('class', 'fta-conn-handle').attr('r', 7).attr('cx', 0).attr('cy', -64)
            .call(handleDrag()).append('title').text('Drag onto a gate to connect this node');
        en.on('click', function (event, d) { if (event.defaultPrevented) return; try { openNodePropertiesModal(d.data); } catch (_) {} });
        // drag the card: move it, or drop it onto a gate to connect
        en.call(d3.drag()
            .on('start', function (event, d) { d._m = false; d._x0 = d.data.freeX || 0; d._y0 = d.data.freeY || 0; })
            .on('drag', function (event, d) {
                if (!d._m) { d._m = true; try { pushUndo('Move ' + _label(d.data)); } catch (_) {} this.classList.add('fta-dragging'); }
                d.data.freeX = (d.data.freeX || 0) + event.dx; d.data.freeY = (d.data.freeY || 0) + event.dy;
                d3.select(this).attr('transform', 'translate(' + d.data.freeX + ',' + d.data.freeY + ')');
                const se = event.sourceEvent;
                if (se && se.clientX != null) {
                    d._cx = se.clientX; d._cy = se.clientY;
                    const v = _dropVerdict(se.clientX, se.clientY, d.data);
                    if (v.kind === 'ok') { _hot(v.el, true); _tip(v.text, 'ok', se.clientX, se.clientY); }
                    else if (v.kind === 'bad') { _hot(v.el, false); _tip(v.why, 'bad', se.clientX, se.clientY); }
                    else _clearHot();
                }
            })
            .on('end', function (event, d) {
                const v = (d._m && d._cx != null) ? _dropVerdict(d._cx, d._cy, d.data) : { kind: 'none' };
                this.classList.remove('fta-dragging');
                _clearHot();
                if (!d._m) return;
                if (v.kind === 'ok') { connect(d.data, v.target, { undoPushed: true }); return; }
                if (v.kind === 'bad') _toast(v.why + ' The node was only moved.', 'warning', 5200);
                moveFree(d.data, d.data.freeX, d.data.freeY, { undoPushed: true });
            }));
        const up = en.merge(sel);
        up.attr('transform', d => 'translate(' + (d.data.freeX || 0) + ',' + (d.data.freeY || 0) + ')');
        up.classed('selected', d => typeof selectedNodeData !== 'undefined' && selectedNodeData === d.data);
        up.select('path.fta-free-shape').attr('d', d => { try { return getShapePath(d); } catch (_) { return ''; } })
            .attr('fill', d => { try { return getNodeColors(d).fill; } catch (_) { return '#999'; } })
            .attr('stroke', d => { try { return getNodeColors(d).stroke; } catch (_) { return '#666'; } })
            .attr('transform', 'translate(0,8)');
        up.select('.fta-free-title').text(d => d.data.displayId || '');
        up.select('.fta-free-name').text(d => { const s = String(d.data.name || ''); return s.length > 30 ? s.slice(0, 29) + '…' : s; });
        up.select('.fta-free-count').text(d => { const c = _count(d.data) - 1; return c > 0 ? ('+ ' + c + ' node' + (c === 1 ? '' : 's') + ' below') : ''; });
    }

    // ------------------------------------------------------- overview map
    const _mm = { pts: null, bounds: null, n: 0, raf: 0, wired: false };
    function _mmWanted(n) {
        let pref = null;
        try { pref = localStorage.getItem('SLA_FTA_MINIMAP'); } catch (_) {}
        if (pref === '0') return false;
        if (pref === '1') return n > 0;
        return n >= 40;
    }
    function toggleMinimap(force) {
        let on = force;
        if (on == null) { const el = document.getElementById('fta-minimap'); on = !(el && el.style.display !== 'none'); }
        try { localStorage.setItem('SLA_FTA_MINIMAP', on ? '1' : '0'); } catch (_) {}
        _mmApply();
    }
    function _mmEnsure() {
        const host = document.getElementById('svg-wrap-container'); if (!host) return null;
        let el = document.getElementById('fta-minimap');
        if (el) return el;
        _ensureStyle();
        el = document.createElement('div'); el.id = 'fta-minimap';
        el.innerHTML = '<div class="fmm-head">Overview<span id="fta-minimap-count"></span><button type="button" class="fmm-close" title="Hide the overview map (the Overview button brings it back)" aria-label="Hide overview map">×</button></div>' +
            '<div class="fmm-body" title="Click or drag to move the view"><canvas id="fta-minimap-nodes" width="464" height="300"></canvas><canvas id="fta-minimap-view" width="464" height="300"></canvas></div>';
        host.appendChild(el);
        ['mousedown', 'wheel', 'dblclick', 'click'].forEach(ev => el.addEventListener(ev, e => e.stopPropagation()));
        el.querySelector('.fmm-close').addEventListener('click', function () { toggleMinimap(false); });
        const body = el.querySelector('.fmm-body');
        let dragging = false;
        const go = function (e) { const r = body.getBoundingClientRect(); _mmPan((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, dragging); };
        body.addEventListener('pointerdown', function (e) { dragging = true; try { body.setPointerCapture(e.pointerId); } catch (_) {} go(e); e.preventDefault(); });
        body.addEventListener('pointermove', function (e) { if (dragging) go(e); });
        body.addEventListener('pointerup', function () { dragging = false; });
        body.addEventListener('pointercancel', function () { dragging = false; });
        return el;
    }
    function _mmApply() {
        const el = _mmEnsure(); if (!el) return;
        const show = _mmWanted(_mm.n);
        el.style.display = show ? 'block' : 'none';
        const btn = document.getElementById('btn-fta-overview');
        if (btn) { btn.classList.toggle('is-on', show); btn.setAttribute('aria-pressed', show ? 'true' : 'false'); }
        if (show) _mmDraw();
    }
    function _mmFrame() {
        const b = _mm.bounds; if (!b) return null;
        const W = 464, H = 300, pad = 14;
        const bw = Math.max(1, b.x1 - b.x0), bh = Math.max(1, b.y1 - b.y0);
        const s = Math.min((W - 2 * pad) / bw, (H - 2 * pad) / bh);
        const ox = (W - s * bw) / 2 - s * b.x0, oy = (H - s * bh) / 2 - s * b.y0;
        return { s: s, ox: ox, oy: oy, W: W, H: H };
    }
    function _mmDraw() {
        const el = document.getElementById('fta-minimap'); if (!el || el.style.display === 'none') return;
        const cv = document.getElementById('fta-minimap-nodes'); if (!cv || !_mm.pts) return;
        const ctx = cv.getContext('2d'); if (!ctx) return;
        const f = _mmFrame(); if (!f) return;
        const dark = document.body.classList.contains('theme-dark');
        ctx.clearRect(0, 0, f.W, f.H);
        const P = _mm.pts, n = _mm.n;
        const dot = Math.max(1.5, Math.min(6, f.s * 40));
        const cols = dark ? ['#8A97F5', '#5ee07d', '#ffd60a', '#94a3b8', '#fbbf24'] : ['#3D4FB0', '#2eb04e', '#d9ad00', '#94a3b8', '#d97706'];
        for (let c = 0; c < 5; c++) {
            ctx.fillStyle = cols[c];
            for (let i = 0; i < n; i++) { if (P[i * 3 + 2] !== c) continue; ctx.fillRect(f.ox + f.s * P[i * 3] - dot / 2, f.oy + f.s * P[i * 3 + 1] - dot / 2, dot, dot); }
        }
        const cnt = document.getElementById('fta-minimap-count'); if (cnt) cnt.textContent = n.toLocaleString() + ' nodes';
        _mmView();
    }
    function _mmView() {
        const cv = document.getElementById('fta-minimap-view'); if (!cv) return;
        const ctx = cv.getContext('2d'); const f = _mmFrame(); if (!ctx || !f) return;
        ctx.clearRect(0, 0, f.W, f.H);
        const el = _svgEl(); if (!el) return;
        let t; try { t = d3.zoomTransform(el); } catch (_) { return; }
        const w = el.clientWidth, h = el.clientHeight;
        const x0 = -t.x / t.k, y0 = -t.y / t.k, x1 = (w - t.x) / t.k, y1 = (h - t.y) / t.k;
        ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 3; ctx.fillStyle = 'rgba(37,99,235,0.10)';
        const rx = f.ox + f.s * x0, ry = f.oy + f.s * y0, rw = f.s * (x1 - x0), rh = f.s * (y1 - y0);
        ctx.fillRect(rx, ry, rw, rh); ctx.strokeRect(rx, ry, rw, rh);
    }
    function _mmPan(fx, fy, smooth) {
        const f = _mmFrame(); const el = _svgEl(); if (!f || !el || typeof zoom === 'undefined' || !zoom) return;
        const wx = (fx * f.W - f.ox) / f.s, wy = (fy * f.H - f.oy) / f.s;
        let t; try { t = d3.zoomTransform(el); } catch (_) { return; }
        const k = t.k, w = el.clientWidth, h = el.clientHeight;
        const nt = d3.zoomIdentity.translate(w / 2 - k * wx, h / 2 - k * wy).scale(k);
        try { svg.call(zoom.transform, nt); } catch (_) {}
    }
    function _mmCollect(allDesc) {
        const page = _page();
        const free = page ? _unattached(page) : [];
        const n = (allDesc ? allDesc.length : 0) + free.length;
        const P = new Float32Array(Math.max(3, n * 3));
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, i = 0;
        const put = function (x, y, c) { P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = c; i++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
        if (allDesc) for (let k = 0; k < allDesc.length; k++) {
            const d = allDesc[k], t = d.data;
            put(d.x, d.y, t.type === 'gate' ? 0 : (t.type === 'basic' ? 1 : (t.type === 'undeveloped' ? 2 : 3)));
        }
        free.forEach(fn => put(fn.freeX || 0, fn.freeY || 0, 4));
        _mm.pts = P; _mm.n = i;
        _mm.bounds = i ? { x0: x0 - 120, y0: y0 - 190, x1: x1 + 120, y1: y1 + 110 } : null;
    }

    // ------------------------------------------------- render hooks
    function afterRender(hroot, allDesc, isDark) {
        try {
            _ensureToolbox();
            _syncTypeOptions();
            _renderFree(isDark);
            _mmCollect(allDesc || []);
            if (!_mm.wired && typeof zoom !== 'undefined' && zoom && zoom.on) {
                _mm.wired = true;
                zoom.on('zoom.slminimap', function () { if (_mm.raf) return; _mm.raf = requestAnimationFrame(function () { _mm.raf = 0; _mmView(); }); });
            }
            _mmApply();
            const es = document.getElementById('fta-empty-state');
            if (es) {
                const hint = es.querySelector('.empty-hint');
                if (hint && !hint.getAttribute('data-sl-g')) { hint.setAttribute('data-sl-g', '1'); hint.innerHTML = 'Drag a gate from the toolbox onto the canvas, or click <code>+ Add Top Event</code>. You can also load the sample project.'; }
            }
            _refreshButtons();
        } catch (e) { _report(e); }
    }
    function _refreshButtons() {
        const b = document.getElementById('btn-disconnect');
        if (b) {
            const n = (typeof selectedNodeData !== 'undefined') ? selectedNodeData : null;
            const loc = n ? locate(n) : null;
            b.disabled = !loc || loc.isRoot || (loc.free && !loc.parent);
        }
    }
    // Toolbar Disconnect button.
    function disconnectSelected() {
        const n = (typeof selectedNodeData !== 'undefined') ? selectedNodeData : null;
        if (!n) { _toast('Select a node first.', 'info', 3000); return; }
        return disconnect(n);
    }
    // The picture of the tree for PDF / Word reports: a copy of the canvas without the editing
    // handles, the rubber-band line and the unattached nodes (they are not part of the tree). The
    // description, ID and value boxes are HTML inside <foreignObject>, which taints the canvas the
    // reports draw the picture on (toDataURL then throws and the report has no picture), so the copy
    // redraws them as plain SVG with inline colors (a serialized SVG carries no page stylesheet).
    function _wrap(text, max, lines) {
        const words = String(text || '').split(/\s+/).filter(Boolean), out = [];
        let cur = '';
        words.forEach(function (w) {
            if ((cur + ' ' + w).trim().length <= max) cur = (cur + ' ' + w).trim();
            else { if (cur) out.push(cur); cur = w.length > max ? w.slice(0, max - 1) + '\u2026' : w; }
        });
        if (cur) out.push(cur);
        if (out.length > lines) { out.length = lines; out[lines - 1] = out[lines - 1].slice(0, max - 1) + '\u2026'; }
        return out;
    }
    function exportClone(svgEl) {
        const c = svgEl.cloneNode(true);
        c.querySelectorAll('.fta-conn-handle, .fta-rubber, .fta-free-layer').forEach(function (e) { e.remove(); });
        c.querySelectorAll('.fta-item-badge rect').forEach(function (r) { r.setAttribute('fill', '#ecfeff'); r.setAttribute('stroke', '#0e7490'); });
        c.querySelectorAll('.fta-item-badge text').forEach(function (t) { t.setAttribute('fill', '#155e75'); t.setAttribute('font-size', '10'); t.setAttribute('font-family', 'monospace'); t.setAttribute('font-weight', '600'); });
        const live = svgEl.querySelectorAll('g.node'), copies = c.querySelectorAll('g.node');
        const mk = function (tag, attrs, text) { const e = document.createElementNS(NS, tag); Object.keys(attrs).forEach(k => e.setAttribute(k, attrs[k])); if (text != null) e.textContent = text; return e; };
        for (let i = 0; i < copies.length && i < live.length; i++) {
            const L = live[i], C = copies[i];
            if (L.style && L.style.display === 'none') continue;
            const fo = L.querySelector('foreignObject.node-foreign-object');
            const q = sel => { const e = L.querySelector(sel); return e ? e.value : ''; };
            const modeSel = L.querySelector('.inline-mode');
            const modeFo = L.querySelector('foreignObject.node-input-mode-fo');
            const modeText = (modeSel && modeFo && modeFo.style.display !== 'none' && modeSel.selectedIndex >= 0) ? modeSel.options[modeSel.selectedIndex].text : '';
            const ccf = L.querySelector('.ccf-inline-tag');
            const ccfText = (ccf && ccf.style.display !== 'none') ? ccf.textContent : '';
            C.querySelectorAll('foreignObject').forEach(function (e) { e.remove(); });
            if (!fo) continue;
            const y = parseFloat(fo.getAttribute('y')) || -174, h = parseFloat(fo.getAttribute('height')) || 144;
            const descH = Math.max(20, h - 44);
            const gText = { 'font-family': 'Helvetica, Arial, sans-serif', fill: '#0f172a' };
            const first = C.firstChild;
            const box = mk('g', {});
            box.appendChild(mk('rect', { x: -80, y: y, width: 160, height: descH, rx: 3, fill: '#ffffff', stroke: '#94a3b8', 'stroke-width': 1 }));
            const lines = _wrap(q('.inline-desc'), 30, Math.max(1, Math.floor(descH / 12) - 1));
            const ly0 = y + descH / 2 - (lines.length - 1) * 6 + 3;
            lines.forEach(function (ln, k) { box.appendChild(mk('text', Object.assign({ x: 0, y: ly0 + k * 12, 'text-anchor': 'middle', 'font-size': 10 }, gText), ln)); });
            box.appendChild(mk('rect', { x: -80, y: y + descH + 3, width: 160, height: 18, rx: 3, fill: '#ffffff', stroke: '#93c5fd', 'stroke-width': 1 }));
            box.appendChild(mk('text', Object.assign({ x: 0, y: y + descH + 16, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 600 }, gText, { fill: '#2563eb' }), q('.inline-id')));
            box.appendChild(mk('text', { x: 0, y: y + descH + 37, 'text-anchor': 'middle', 'font-size': 10, 'font-family': 'monospace', fill: '#0f172a' }, q('.inline-metrics')));
            if (ccfText) box.appendChild(mk('text', { x: 0, y: y + h + 8, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 700, fill: '#8b5cf6', 'font-family': 'Helvetica, Arial, sans-serif' }, ccfText));
            if (modeText) box.appendChild(mk('text', { x: 0, y: 66, 'text-anchor': 'middle', 'font-size': 9, fill: '#475569', 'font-family': 'Helvetica, Arial, sans-serif' }, modeText));
            C.insertBefore(box, first);
        }
        c.querySelectorAll('foreignObject').forEach(function (e) { e.remove(); });
        c.querySelectorAll('path.link').forEach(function (p) { p.setAttribute('fill', 'none'); if (!p.getAttribute('stroke-width')) p.setAttribute('stroke-width', '1.5'); });
        // the canvas is sized by CSS (width 100%); give the copy its real pixel size so the picture keeps its shape
        try { const w = svgEl.clientWidth, h = svgEl.clientHeight; if (w && h) { c.setAttribute('width', String(w)); c.setAttribute('height', String(h)); c.setAttribute('viewBox', '0 0 ' + w + ' ' + h); } } catch (_) {}
        c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        return c;
    }
    // Item badge text + visibility for the node render.
    function badgeFor(d) { return badgeText(d && d.data); }

    // ------------------------------------------------- undo for typing
    // One undo step per typing session: the snapshot is taken on the FIRST change after a
    // field gains focus (before the change lands), on the canvas fields and in the panel.
    function _armTypingUndo() {
        let armed = null;
        const take = function (e, label) {
            const t = e.target;
            if (!t || armed === t) return;
            armed = t;
            try { if (typeof pushUndo === 'function') pushUndo(label); } catch (_) {}
        };
        document.addEventListener('focusout', function (e) { if (e.target === armed) armed = null; }, true);
        document.addEventListener('input', function (e) {
            const t = e.target; if (!t || !t.closest) return;
            if (t.closest('#fta-svg')) { if (t.classList.contains('inline-metrics')) return; take(e, t.classList.contains('inline-id') ? 'Edit node ID' : 'Edit description'); }
            else if (t.closest('#node-config-panel')) take(e, 'Edit node properties');
        }, true);
        document.addEventListener('change', function (e) {
            const t = e.target; if (!t || !t.closest) return;
            if (t.tagName === 'SELECT' && t.closest('#node-config-panel')) {
                if (t.id === 'config-model-item') return;   // goes through applyEdit itself (the canvas mode drop-down too)
                armed = null; take(e, 'Edit node properties');
            }
        }, true);
    }

    // ------------------------------------------------- boot
    function _boot() {
        _wrapLegacy();
        // Wrappers that other modules install later still call through ours; re-check a few times
        // in case a target did not exist yet.
        setTimeout(_wrapLegacy, 1500); setTimeout(_wrapLegacy, 5000);
        _armTypingUndo();
        _syncTypeOptions();
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && (_pal || _hd)) { _clearHot(); }
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _boot); else _boot();

    const api = {
        applyEdit, onBeforeChange, onChange,
        connect, disconnect, moveFree, deleteFree, disconnectSelected, whyNotConnect, locate, contains,
        addFromPalette, nonCoherentAllowed, setNonCoherent,
        dragStart, dragMove, dragEnd, handleDrag,
        metricEditable, metricTitle, metricFocus, metricCommit, metricCancel, validateMetric, setMetric,
        elementIdOf, eventDefIdOf, itemFor, badgeFor, fillPanel, setItemLink, setSysmlRef,
        afterRender, toggleMinimap, exportClone, _mm: _mm, PALETTE
    };
    window.SLFtaEdit = api;
})();
