// ============================================================================
// diagram_editor.js - v1.4 - SLDiagramEditor: the ONE diagram editor core.
// 13 Oct 2026 (v1.4, Waqas rulings 1 and 2): moves, resizes, auto layout and editor Undo / Redo are collected (SLChangeAck.deferred) and acknowledged together on leaving the view; content edits still ask per gesture.
// 13 Oct 2026 (v1.3, merge of integrate3 into fix3-M): every hook of the v1.1 rounds, v1.2 and fix3-M together.
// 13 Oct 2026 (v1.2, merge): the hooks of both v1.1 rounds below, together.
// 13 Oct 2026 (v1.1, STPA control structure + cascading effects build): five small generic
// hooks the first two real diagrams needed, nothing diagram specific in the core:
//   def.decorate(model, ctx) -> SVG markup drawn in world coordinates between the connectors
//     and the shapes (derived findings such as STPA missing feedback, a cascade path); it is
//     redrawn on every render and included in toSvg(), so keep it small.
//   def.elementClass(el, ctx) / def.connectorClass(c, ctx) -> extra CSS classes per item
//     (highlight or dim by a derived state); applied on every render of a visible item.
//   editor.refresh() -> rebuild every visible item (call after the derived state changed).
//   kind.sysmlLinkable === false (or def.sysmlLinkable === false) -> the properties panel shows
//     the item's own model identity read only, with no Link / Unlink buttons (for shapes that
//     ARE the model element, such as a system or a resource).
//   def.panelAction(act, item, ctx) -> buttons with data-pact in def.panel() markup reach the
//     diagram; def.newId(what, kind, { model, from, to }) now also receives the live model
//     (and, for a connector, its two ends), so a diagram can mint ids from its own data.
//   kind.defaultProps may be a function (id, kind) -> props (props derived from the new id), and
//     kind.uniqueProps: ['key'] lists identity props a copy / paste must not carry over.
// 13 Oct 2026 (v1.1, event tree + bow-tie round): two small generic hooks.
//   def.complete(tx, ctx): optional. Runs inside every user or api change transaction (toolbox,
//     properties, delete, paste, move, resize), after the gesture's own edits and before the
//     change is committed, so a diagram whose shapes are partly DERIVED from others (the event
//     tree's branch points and end states follow its headings) keeps them consistent in the SAME
//     undo step and the same acknowledgement. Throw a RuleError (SLDiagramEditor.RuleError) to
//     refuse the gesture with a plain-language reason; the change is rolled back.
//   def.hint: optional status-bar text in place of the default "Drag shapes to move them..." (a
//     diagram with computed positions or no hand-drawn connectors says what its gestures are).
//   elementKind.lodShape: true draws the normal shape (without its label) at far zoom instead of a
//     plain box; a function(el) returns the far-zoom markup. For shapes whose box is mostly empty
//     (event tree branch points), a plain box at far zoom would hide the tree.
// 13 Oct 2026 (v1.1, fix3-M): shape functions get ctx.model (the whole model) when drawn and exported, and
// editor.refreshShapes() redraws every visible shape, for shapes that depend on other items (the RBD k-out-of-n
// node shows its n, repeated blocks are marked in every place); a field descriptor may carry apply(tx, value, item)
// so one properties edit updates several items in one undo step; a connector kind with offerOnDrag: false is not
// offered in the chooser after a drag (toolbox tool or properties instead). See tests/regression_rbd_markov_diagrams_20261013b.test.js
// 13 Oct 2026 (v1.0): new. Every Safety Lab diagram except the fault tree is
// built on this core (bowtie, event tree, STPA control structure, reliability
// block diagram, Markov state diagram, cascading effects graph), so they all
// share one toolbox, one way to draw, one undo, one zoom/pan/fullscreen, one
// properties panel and one change path.
//
// ---------------------------------------------------------------------------
// WHAT A DIAGRAM DOES
//   1. Register its notation once:
//        SLDiagramEditor.register({
//          type: 'markov', title: 'Markov state diagram',
//          elementKinds:   { state: { label: 'State', shape: 'ellipse', w: 90, h: 90, aspect: 'lock' } },
//          connectorKinds: { transition: { label: 'Transition', from: ['state'], to: ['state'],
//                                          arrow: 'triangle', route: 'curved', allowSelfLoop: true } },
//          canConnect(from, to, kindId, ctx) { return true or 'reason it is not allowed'; },
//          layout(model, ctx) { return { id: { x, y } }; },          // optional (or 'layered' / 'grid')
//          fields(item, ctx) { return [ { key: 'props.rate', label: 'Rate (per hour)', type: 'number' } ]; },
//          validate(model) { return [ { id, message } ]; }            // optional
//        });
//   2. Mount an editor where the diagram lives:
//        const ed = SLDiagramEditor.mount(hostEl, { type: 'markov',
//          adapter: { load: () => myStoredModel(), save: (model, change) => writeIntoProject(model) },
//          readOnly: () => !canEdit(), lockKey: 'markov:' + modelId });
//      The editor works on its own copy of the model. Project data changes ONLY through
//      adapter.save (or opts.onChange), so a diagram can keep its existing stored shape
//      (event trees, bowties in projectConfig) by translating in load/save.
//
// THE DATA MODEL CONTRACT (plain JSON, what load returns and save receives)
//   { elements:   [ { id, kind, x, y, w, h, label, props: {}, sysmlRef? } ],
//     connectors: [ { id, kind, from, to, fromPort, toPort, label, props: {}, sysmlRef? } ] }
//   ids are UUIDs by default (crypto.randomUUID), stable for the life of the element, and
//   usable directly as the SysML v2 elementId. sysmlRef links an element to a model element
//   ({ id, qualifiedName, name, kind }); a SysML provider can be plugged in with
//   SLDiagramEditor.setSysmlProvider({ pick, describe, open }).
//
// THE ONE CHANGE PATH
//   Every edit (toolbox create, connect, move, resize, rename, properties, delete, paste,
//   align, layout, undo, redo, and editor.change() from diagram code) becomes ONE change
//   object { id, label, source, ops, summary() } and goes through _commit():
//     beforeChange hooks (global SLDiagramEditor.onBeforeChange, def.beforeChange,
//       opts.beforeChange): return false, or a Promise of false, to cancel. While a Promise
//       is pending the editor shows "Waiting for confirmation" and takes no new edits. This is
//       the hook the change acknowledgement (Save / Don't Save / Cancel) attaches to.
//     -> history (the editor's undo stack)
//     -> persistence: window.pushUndo (the app's project snapshot undo, taken BEFORE the
//        project is written), adapter.save(model, change), then scheduleAutosave(), which
//        carries the edit to autosave, the CRDT live sync, the activity log and lock checks.
//     -> afterChange hooks, editor.on('change') listeners.
//
// UNDO INTEGRATION (the decision, and why)
//   The editor keeps its own fine-grained undo stack of change ops (one entry per action,
//   exact inverse, cheap even on big projects), and Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and
//   Ctrl/Cmd+Y act on it while focus is in the editor. Every change ALSO calls the app's
//   pushUndo before the project is written, exactly like the wrapped _UNDO_TARGETS actions,
//   so the app-wide undo (outside the editor) covers diagram edits too. Rules that keep the
//   two consistent:
//     - When the editor has nothing left to undo, the key falls through to the app's undo.
//     - When live co-editing undo is on (SafetyLabCRDT.liveUndo()), the editor hands undo and
//       redo to the app (per user, never a teammate's work) and reloads.
//     - If the project data changed from outside (app undo, sync pull, project load), the
//       editor notices (SLDataChange generation, checked at the start of every interaction,
//       or editor.reload() called by the diagram) and reloads; its own undo stack is cleared
//       because its ops no longer describe the data in front of the user.
//
// READ ONLY
//   opts.readOnly (true, or a function returning true or a reason string), opts.lockScope
//   ({ scope, systemId } checked with slLockState from lock_enforce.js), and opts.lockKey (a
//   field lock in edit_locks.js: claimed on first focus, someone else holding it makes the
//   editor read only and says who). Read only keeps select, zoom, pan, fullscreen, minimap,
//   copy and the properties panel (inputs disabled); everything that edits is gone.
//
// PERFORMANCE
//   Only what is on screen is in the DOM (the "only compute what's on screen" rule): every
//   render keeps the elements and connectors that intersect the visible world rectangle and
//   drops the rest. Far zoom draws plain boxes without labels. Rebuilds are per id (dirty
//   set), zoom and pan only move one transform.
//
// House dialogs only (slAlert, slConfirm, slPrompt), showToast for notices. American English.
// Tests: tests/regression_diagram_editor_20261013b.test.js (node, pure core) and
//        tools/diagram_editor/browser_check.js (Chromium). API guide: EDITOR_API (see report).
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '1.4';
    var SVGNS = 'http://www.w3.org/2000/svg';
    var HAS_DOM = (typeof document !== 'undefined' && document && typeof document.createElement === 'function');

    // ------------------------------------------------------------------ utils
    function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
    function uuid() {
        try { if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID(); } catch (_) {}
        var b = [];
        for (var i = 0; i < 16; i++) b.push(Math.floor(Math.random() * 256));
        try { if (root.crypto && root.crypto.getRandomValues) { var a = new Uint8Array(16); root.crypto.getRandomValues(a); b = Array.prototype.slice.call(a); } } catch (_) {}
        b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
        var h = b.map(function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
        return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
    }
    function toast(msg, type, ms) {
        try { if (typeof root.showToast === 'function') return root.showToast(msg, type || 'info', ms || 2600); } catch (_) {}
        try { console.log('[diagram] ' + msg); } catch (_) {}
    }
    function kindMatches(spec, kind, el) {
        if (spec == null || spec === '*') return true;
        if (typeof spec === 'function') return !!spec(kind, el);
        if (Array.isArray(spec)) return spec.indexOf(kind) !== -1;
        return spec === kind;
    }

    // --------------------------------------------------------------- registry
    var _defs = {};
    var _hooks = { before: [], after: [] };
    var _sysml = null;
    var _instances = [];
    var _clipboard = {};   // per diagram type

    function _normDef(def) {
        if (!def || !def.type) throw new Error('A diagram needs a type.');
        def.elementKinds = def.elementKinds || {};
        def.connectorKinds = def.connectorKinds || {};
        Object.keys(def.elementKinds).forEach(function (k) {
            var ek = def.elementKinds[k];
            ek.id = k;
            if (!ek.label) ek.label = k;
            if (ek.w == null) ek.w = 120;
            if (ek.h == null) ek.h = 60;
            if (ek.minW == null) ek.minW = 20;
            if (ek.minH == null) ek.minH = 20;
            if (ek.resizable == null) ek.resizable = true;
            if (ek.shape == null) ek.shape = 'rect';
            if (ek.ports == null) ek.ports = 'sides';
        });
        Object.keys(def.connectorKinds).forEach(function (k) {
            var ck = def.connectorKinds[k];
            ck.id = k;
            if (!ck.label) ck.label = k;
            if (ck.arrow == null) ck.arrow = 'triangle';
            if (ck.route == null) ck.route = 'straight';
            if (ck.directed == null) ck.directed = true;
        });
        if (def.grid == null) def.grid = 10;
        return def;
    }
    function register(def) { _normDef(def); _defs[def.type] = def; return def; }
    function getDiagram(type) { return _defs[type] || null; }

    // ============================================================ PURE CORE
    // Everything below up to the VIEW section touches no DOM; tests run it in node.

    function normalize(def, model) {
        var m = clone(model) || {};
        var out = { elements: [], connectors: [] };
        var seen = {};
        (Array.isArray(m.elements) ? m.elements : []).forEach(function (e) {
            if (!e || typeof e !== 'object') return;
            var ek = def.elementKinds[e.kind] || {};
            var el = e;
            if (!el.id || seen[el.id]) el.id = uuid();
            seen[el.id] = 1;
            el.x = num(el.x, 0); el.y = num(el.y, 0);
            el.w = num(el.w, ek.w || 120); el.h = num(el.h, ek.h || 60);
            if (el.label == null) el.label = '';
            if (!el.props || typeof el.props !== 'object') el.props = {};
            out.elements.push(el);
        });
        (Array.isArray(m.connectors) ? m.connectors : []).forEach(function (c) {
            if (!c || typeof c !== 'object') return;
            if (!c.id || seen[c.id]) c.id = uuid();
            seen[c.id] = 1;
            if (c.label == null) c.label = '';
            if (c.fromPort === undefined) c.fromPort = null;
            if (c.toPort === undefined) c.toPort = null;
            if (!c.props || typeof c.props !== 'object') c.props = {};
            out.connectors.push(c);   // a connector with a missing end is KEPT (never silently lose data); validate() reports it
        });
        // carry any extra top-level fields the diagram stores alongside (meta, title...)
        Object.keys(m).forEach(function (k) { if (k !== 'elements' && k !== 'connectors') out[k] = m[k]; });
        return out;
    }

    function RuleError(msg) { this.name = 'RuleError'; this.message = msg; }
    RuleError.prototype = Object.create(Error.prototype);

    function Store(def, model) {
        this.def = def;
        this.m = normalize(def, model);
        this._reindex();
    }
    Store.prototype._reindex = function () {
        var el = new Map(), cn = new Map();
        this.m.elements.forEach(function (e) { el.set(e.id, e); });
        this.m.connectors.forEach(function (c) { cn.set(c.id, c); });
        this.ix = { el: el, cn: cn };
    };
    Store.prototype.getEl = function (id) { return this.ix.el.get(id) || null; };
    Store.prototype.getCn = function (id) { return this.ix.cn.get(id) || null; };
    Store.prototype.get = function (id) { return this.getEl(id) || this.getCn(id); };
    Store.prototype.isEl = function (id) { return this.ix.el.has(id); };
    Store.prototype.newId = function (what, kind, ends) {
        if (typeof this.def.newId === 'function') { var id = this.def.newId(what, kind, { model: this.m, from: ends && ends.from, to: ends && ends.to }); if (id && !this.get(id)) return id; }
        var u; do { u = uuid(); } while (this.get(u));
        return u;
    };
    Store.prototype.connectorsOf = function (elId) {
        return this.m.connectors.filter(function (c) { return c.from === elId || c.to === elId; });
    };
    Store.prototype.begin = function (label) { return new Tx(this, label); };
    // Apply recorded ops forward (redo) or backward (undo).
    Store.prototype.apply = function (ops, reverse) {
        var self = this;
        var list = reverse ? ops.slice().reverse() : ops;
        list.forEach(function (op) {
            var from = reverse ? op.after : op.before, to = reverse ? op.before : op.after;
            var arr = op.t === 'el' ? self.m.elements : self.m.connectors;
            var map = op.t === 'el' ? self.ix.el : self.ix.cn;
            if (from && !to) {
                var i = arr.findIndex(function (x) { return x.id === op.id; });
                if (i >= 0) arr.splice(i, 1);
                map.delete(op.id);
            } else if (!from && to) {
                var o = clone(to);
                var at = (op.index == null || op.index < 0 || op.index > arr.length) ? arr.length : op.index;
                arr.splice(at, 0, o);
                map.set(op.id, o);
            } else if (to) {
                var j = arr.findIndex(function (x) { return x.id === op.id; });
                var o2 = clone(to);
                if (j >= 0) arr[j] = o2; else arr.push(o2);
                map.set(op.id, o2);
            }
        });
    };

    // Rule check for a connection. Returns { ok: true } or { ok: false, reason }.
    function canConnect(def, store, fromId, toId, kindId, opt) {
        opt = opt || {};
        var ck = def.connectorKinds[kindId];
        if (!ck) return { ok: false, reason: 'Unknown connector type "' + kindId + '".' };
        var a = store.getEl(fromId), b = store.getEl(toId);
        if (!a || !b) return { ok: false, reason: 'A ' + ck.label.toLowerCase() + ' must start and end on a shape.' };
        var ak = def.elementKinds[a.kind] || { label: a.kind }, bk = def.elementKinds[b.kind] || { label: b.kind };
        if (fromId === toId && !ck.allowSelfLoop) return { ok: false, reason: 'A ' + ck.label.toLowerCase() + ' cannot connect a shape to itself.' };
        if (!kindMatches(ck.from, a.kind, a)) return { ok: false, reason: 'A ' + ck.label.toLowerCase() + ' cannot start at a ' + ak.label.toLowerCase() + '.' };
        if (!kindMatches(ck.to, b.kind, b)) return { ok: false, reason: 'A ' + ck.label.toLowerCase() + ' cannot end at a ' + bk.label.toLowerCase() + '.' };
        var ign = opt.ignoreId;
        if (!ck.allowDuplicate) {
            var dup = store.m.connectors.some(function (c) {
                if (c.id === ign || c.kind !== kindId) return false;
                if (c.from === fromId && c.to === toId) return true;
                return ck.directed === false && c.from === toId && c.to === fromId;
            });
            if (dup) return { ok: false, reason: 'These two shapes are already connected by a ' + ck.label.toLowerCase() + '.' };
        }
        if (ak.maxOut != null) {
            var outs = store.m.connectors.filter(function (c) { return c.id !== ign && c.from === fromId; }).length;
            if (outs >= ak.maxOut) return { ok: false, reason: 'A ' + ak.label.toLowerCase() + ' can have at most ' + ak.maxOut + ' outgoing connection' + (ak.maxOut === 1 ? '' : 's') + '.' };
        }
        if (bk.maxIn != null) {
            var ins = store.m.connectors.filter(function (c) { return c.id !== ign && c.to === toId; }).length;
            if (ins >= bk.maxIn) return { ok: false, reason: 'A ' + bk.label.toLowerCase() + ' can have at most ' + bk.maxIn + ' incoming connection' + (bk.maxIn === 1 ? '' : 's') + '.' };
        }
        if (typeof def.canConnect === 'function') {
            var r;
            try { r = def.canConnect(a, b, kindId, { model: store.m, store: store, ignoreId: ign }); } catch (e) { r = String(e && e.message || e); }
            if (r === false) return { ok: false, reason: 'This connection is not allowed in a ' + (def.title || def.type) + '.' };
            if (typeof r === 'string' && r) return { ok: false, reason: r };
        }
        return { ok: true };
    }
    function legalConnectorKinds(def, store, fromId, toId) {
        return Object.keys(def.connectorKinds).filter(function (k) { return canConnect(def, store, fromId, toId, k).ok; });
    }

    // A transaction applies immediately (so dragging shows live) and records one op per
    // touched id: the state before the first touch and the state at end().
    function Tx(store, label) {
        this.s = store; this.label = label || 'Edit'; this._ops = new Map(); this._order = []; this.closed = false;
    }
    Tx.prototype._touch = function (t, id) {
        var key = t + ':' + id;
        var op = this._ops.get(key);
        if (!op) {
            var cur = t === 'el' ? this.s.getEl(id) : this.s.getCn(id);
            op = { t: t, id: id, before: cur ? clone(cur) : null, after: null, index: -1 };
            this._ops.set(key, op); this._order.push(key);
        }
        return op;
    };
    Tx.prototype._live = function () { if (this.closed) throw new Error('This change is already finished.'); };
    Tx.prototype.addElement = function (kind, x, y, extra) {
        this._live();
        var def = this.s.def, ek = def.elementKinds[kind];
        extra = extra || {};
        if (!ek) throw new RuleError('Unknown shape type "' + kind + '".');
        if (ek.maxCount != null) {
            var n = this.s.m.elements.filter(function (e) { return e.kind === kind; }).length;
            if (n >= ek.maxCount) throw new RuleError('This diagram can have only ' + ek.maxCount + ' ' + ek.label.toLowerCase() + (ek.maxCount === 1 ? '' : 's') + '.');
        }
        var id = extra.id || this.s.newId('element', kind);
        if (this.s.get(id)) throw new RuleError('The id "' + id + '" is already used.');
        var el = {
            id: id, kind: kind,
            x: num(x, 0), y: num(y, 0),
            w: num(extra.w, ek.w), h: num(extra.h, ek.h),
            label: extra.label != null ? String(extra.label) : (ek.defaultLabel != null ? String(ek.defaultLabel) : ek.label),
            props: Object.assign({}, clone(typeof ek.defaultProps === 'function' ? ek.defaultProps(id, kind) : ek.defaultProps) || {}, clone(extra.props) || {})
        };
        if (extra.sysmlRef) el.sysmlRef = clone(extra.sysmlRef);
        Object.keys(extra).forEach(function (k) { if (!(k in el) && k !== 'id') el[k] = clone(extra[k]); });
        var op = this._touch('el', id);
        this.s.m.elements.push(el); this.s.ix.el.set(id, el);
        op.index = this.s.m.elements.length - 1;
        return el;
    };
    Tx.prototype.updateElement = function (id, patch) {
        this._live();
        var el = this.s.getEl(id);
        if (!el) throw new RuleError('That shape no longer exists.');
        var ek = this.s.def.elementKinds[patch && patch.kind || el.kind];
        if (patch.kind != null && !ek) throw new RuleError('Unknown shape type "' + patch.kind + '".');
        this._touch('el', id);
        Object.keys(patch).forEach(function (k) {
            if (k === 'id') return;
            if (k === 'props') {
                var p = Object.assign({}, el.props || {});
                Object.keys(patch.props || {}).forEach(function (pk) { if (patch.props[pk] === undefined) delete p[pk]; else p[pk] = clone(patch.props[pk]); });
                el.props = p;
            } else if (patch[k] === undefined) { delete el[k]; }
            else el[k] = clone(patch[k]);
        });
        if (ek) {
            el.w = Math.max(num(el.w, ek.w), ek.minW); el.h = Math.max(num(el.h, ek.h), ek.minH);
            if (ek.aspect === 'lock') { var s = Math.max(el.w, el.h); if (patch.w != null && patch.h == null) s = el.w; else if (patch.h != null && patch.w == null) s = el.h; el.w = el.h = s; }
        }
        el.x = num(el.x, 0); el.y = num(el.y, 0);
        return el;
    };
    Tx.prototype.removeElement = function (id) {
        this._live();
        var el = this.s.getEl(id);
        if (!el) return false;
        var self = this;
        this.s.connectorsOf(id).forEach(function (c) { self.removeConnector(c.id); });
        var op = this._touch('el', id);
        var i = this.s.m.elements.indexOf(el);
        this.s.m.elements.splice(i, 1); this.s.ix.el.delete(id);
        op.index = i;
        return true;
    };
    Tx.prototype.addConnector = function (kind, from, to, extra) {
        this._live();
        extra = extra || {};
        var r = canConnect(this.s.def, this.s, from, to, kind);
        if (!r.ok) throw new RuleError(r.reason);
        var ck = this.s.def.connectorKinds[kind];
        var id = extra.id || this.s.newId('connector', kind, { from: from, to: to });
        if (this.s.get(id)) throw new RuleError('The id "' + id + '" is already used.');
        var c = {
            id: id, kind: kind, from: from, to: to,
            fromPort: extra.fromPort != null ? extra.fromPort : null,
            toPort: extra.toPort != null ? extra.toPort : null,
            label: extra.label != null ? String(extra.label) : (ck.defaultLabel != null ? String(ck.defaultLabel) : ''),
            props: Object.assign({}, clone(typeof ck.defaultProps === 'function' ? ck.defaultProps(id, kind) : ck.defaultProps) || {}, clone(extra.props) || {})
        };
        if (extra.sysmlRef) c.sysmlRef = clone(extra.sysmlRef);
        var op = this._touch('cn', id);
        this.s.m.connectors.push(c); this.s.ix.cn.set(id, c);
        op.index = this.s.m.connectors.length - 1;
        return c;
    };
    Tx.prototype.updateConnector = function (id, patch) {
        this._live();
        var c = this.s.getCn(id);
        if (!c) throw new RuleError('That connector no longer exists.');
        var nk = patch.kind != null ? patch.kind : c.kind, nf = patch.from != null ? patch.from : c.from, nt = patch.to != null ? patch.to : c.to;
        if (nk !== c.kind || nf !== c.from || nt !== c.to) {
            var r = canConnect(this.s.def, this.s, nf, nt, nk, { ignoreId: id });
            if (!r.ok) throw new RuleError(r.reason);
        }
        this._touch('cn', id);
        Object.keys(patch).forEach(function (k) {
            if (k === 'id') return;
            if (k === 'props') {
                var p = Object.assign({}, c.props || {});
                Object.keys(patch.props || {}).forEach(function (pk) { if (patch.props[pk] === undefined) delete p[pk]; else p[pk] = clone(patch.props[pk]); });
                c.props = p;
            } else if (patch[k] === undefined) delete c[k];
            else c[k] = clone(patch[k]);
        });
        return c;
    };
    Tx.prototype.removeConnector = function (id) {
        this._live();
        var c = this.s.getCn(id);
        if (!c) return false;
        var op = this._touch('cn', id);
        var i = this.s.m.connectors.indexOf(c);
        this.s.m.connectors.splice(i, 1); this.s.ix.cn.delete(id);
        op.index = i;
        return true;
    };
    Tx.prototype.remove = function (id) { return this.s.isEl(id) ? this.removeElement(id) : this.removeConnector(id); };
    Tx.prototype.update = function (id, patch) { return this.s.isEl(id) ? this.updateElement(id, patch) : this.updateConnector(id, patch); };
    Tx.prototype.get = function (id) { return this.s.get(id); };
    Object.defineProperty(Tx.prototype, 'model', { get: function () { return this.s.m; } });
    // Finish: compute the after-states and drop no-op entries. Returns the ops list.
    Tx.prototype.end = function () {
        if (this.closed) return this._final;
        var self = this, out = [];
        this._order.forEach(function (key) {
            var op = self._ops.get(key);
            var cur = op.t === 'el' ? self.s.getEl(op.id) : self.s.getCn(op.id);
            op.after = cur ? clone(cur) : null;
            if (!op.before && !op.after) return;
            if (op.before && op.after && same(op.before, op.after)) return;
            out.push(op);
        });
        this.closed = true; this._final = out;
        return out;
    };
    Tx.prototype.rollback = function () {
        var ops = this.end();
        this.s.apply(ops, true);
        return ops;
    };

    // Which changes are collected rather than asked one by one (change_ack.js): Undo / Redo, an
    // auto layout, and any change whose every op only moves or resizes (x, y, w, h, and a
    // connector's route points). Exported for tests.
    var POS_KEYS = { x: 1, y: 1, w: 1, h: 1, points: 1, waypoints: 1, route: 1, bends: 1 };
    function positionOnly(ops) {
        if (!ops || !ops.length) return false;
        return ops.every(function (op) {
            if (!op || !op.before || !op.after) return false;
            var keys = {}; Object.keys(op.before).concat(Object.keys(op.after)).forEach(function (k) { keys[k] = 1; });
            return Object.keys(keys).every(function (k) { return POS_KEYS[k] || JSON.stringify(op.before[k]) === JSON.stringify(op.after[k]); });
        });
    }
    function deferKind(change) {
        if (!change) return null;
        if (change.source === 'undo') return 'undo';
        if (change.source === 'redo') return 'redo';
        if (change.source === 'layout') return 'system';   // positions the diagram always computes (def.autoLayout): the app's, not the person's
        if (positionOnly(change.ops)) return 'move';
        return null;
    }
    var _changeSeq = 0;
    function makeChange(type, label, ops, source) {
        var ch = { id: ++_changeSeq, diagram: type, label: label, ops: ops, source: source || 'user', time: Date.now() };
        ch.summary = function () { return summarize(ops); };
        return ch;
    }
    function summarize(ops) {
        var s = { added: { elements: [], connectors: [] }, removed: { elements: [], connectors: [] }, updated: { elements: [], connectors: [] } };
        ops.forEach(function (op) {
            var bucket = !op.before ? s.added : (!op.after ? s.removed : s.updated);
            (op.t === 'el' ? bucket.elements : bucket.connectors).push(op.after || op.before);
        });
        return s;
    }
    function invertOps(ops) {
        return ops.slice().reverse().map(function (op) { return { t: op.t, id: op.id, before: op.after, after: op.before, index: op.index }; });
    }

    function History(limit) { this.undo = []; this.redo = []; this.limit = limit || 300; }
    History.prototype.push = function (entry) { this.undo.push(entry); if (this.undo.length > this.limit) this.undo.shift(); this.redo = []; };
    History.prototype.clear = function () { this.undo = []; this.redo = []; };

    // Hooks: run sequentially; false (or a Promise of false) vetoes. Returns boolean or Promise<boolean>.
    function runBefore(list, change, ctx) {
        var i = 0;
        function step() {
            while (i < list.length) {
                var fn = list[i++], r;
                try { r = fn(change, ctx); } catch (e) { try { console.warn('[diagram] beforeChange hook failed', e); } catch (_) {} r = true; }
                if (r === false) return false;
                if (r && typeof r.then === 'function') return r.then(function (v) { return v === false ? false : step(); }, function () { return false; });
            }
            return true;
        }
        return step();
    }

    // Layouts. Return { id: { x, y } }.
    function layoutLayered(model, opt) {
        opt = opt || {};
        var dir = opt.direction || 'down', gapX = opt.gapX || 60, gapY = opt.gapY || 70;
        var ids = model.elements.map(function (e) { return e.id; });
        var byId = {}; model.elements.forEach(function (e) { byId[e.id] = e; });
        var succ = {}, indeg = {};
        ids.forEach(function (id) { succ[id] = []; indeg[id] = 0; });
        model.connectors.forEach(function (c) { if (byId[c.from] && byId[c.to] && c.from !== c.to) { succ[c.from].push(c.to); indeg[c.to]++; } });
        // longest path layering with cycle tolerance (Kahn, then leftovers)
        var layer = {}, q = ids.filter(function (id) { return indeg[id] === 0; }), seen = {};
        q.forEach(function (id) { layer[id] = 0; });
        var deg = clone(indeg);
        while (q.length) {
            var id = q.shift(); seen[id] = 1;
            succ[id].forEach(function (t) { layer[t] = Math.max(layer[t] || 0, layer[id] + 1); if (--deg[t] === 0) q.push(t); });
        }
        ids.forEach(function (id) { if (!seen[id]) layer[id] = layer[id] || 0; });
        var layers = [];
        ids.forEach(function (id) { var L = layer[id]; (layers[L] = layers[L] || []).push(id); });
        // one barycenter pass for order
        var pos = {};
        layers.forEach(function (row, L) {
            if (L > 0) {
                var preds = {};
                model.connectors.forEach(function (c) { if (layer[c.to] === L && pos[c.from] != null) (preds[c.to] = preds[c.to] || []).push(pos[c.from]); });
                row.sort(function (a, b) {
                    var pa = preds[a] ? preds[a].reduce(function (s, v) { return s + v; }, 0) / preds[a].length : 1e9;
                    var pb = preds[b] ? preds[b].reduce(function (s, v) { return s + v; }, 0) / preds[b].length : 1e9;
                    return pa - pb;
                });
            }
            row.forEach(function (id, i) { pos[id] = i; });
        });
        var out = {}, cursor = 0;
        layers.forEach(function (row) {
            var along = 0, thick = 0;
            row.forEach(function (id) {
                var e = byId[id];
                if (dir === 'right') { out[id] = { x: cursor, y: along }; along += e.h + gapY; thick = Math.max(thick, e.w); }
                else { out[id] = { x: along, y: cursor }; along += e.w + gapX; thick = Math.max(thick, e.h); }
            });
            cursor += thick + (dir === 'right' ? gapX * 1.5 : gapY);
        });
        return out;
    }
    function layoutGrid(model, opt) {
        opt = opt || {};
        var cols = opt.cols || Math.max(1, Math.ceil(Math.sqrt(model.elements.length))), gap = opt.gap || 40, out = {};
        var cw = 0, rh = 0;
        model.elements.forEach(function (e) { cw = Math.max(cw, e.w); rh = Math.max(rh, e.h); });
        model.elements.forEach(function (e, i) { out[e.id] = { x: (i % cols) * (cw + gap), y: Math.floor(i / cols) * (rh + gap) }; });
        return out;
    }
    // Align / distribute. Returns { id: { x?, y? } } for the given elements.
    function alignPositions(els, how) {
        var out = {};
        if (els.length < 2) return out;
        var minX = Math.min.apply(null, els.map(function (e) { return e.x; }));
        var maxR = Math.max.apply(null, els.map(function (e) { return e.x + e.w; }));
        var minY = Math.min.apply(null, els.map(function (e) { return e.y; }));
        var maxB = Math.max.apply(null, els.map(function (e) { return e.y + e.h; }));
        if (how === 'left') els.forEach(function (e) { out[e.id] = { x: minX }; });
        else if (how === 'right') els.forEach(function (e) { out[e.id] = { x: maxR - e.w }; });
        else if (how === 'center') { var cx = (minX + maxR) / 2; els.forEach(function (e) { out[e.id] = { x: cx - e.w / 2 }; }); }
        else if (how === 'top') els.forEach(function (e) { out[e.id] = { y: minY }; });
        else if (how === 'bottom') els.forEach(function (e) { out[e.id] = { y: maxB - e.h }; });
        else if (how === 'middle') { var cy = (minY + maxB) / 2; els.forEach(function (e) { out[e.id] = { y: cy - e.h / 2 }; }); }
        else if (how === 'hspace' || how === 'vspace') {
            if (els.length < 3) return out;
            var horiz = how === 'hspace';
            var sorted = els.slice().sort(function (a, b) { return horiz ? a.x - b.x : a.y - b.y; });
            var total = sorted.reduce(function (s, e) { return s + (horiz ? e.w : e.h); }, 0);
            var span = horiz ? (maxR - minX) : (maxB - minY);
            var gap = (span - total) / (sorted.length - 1), at = horiz ? minX : minY;
            sorted.forEach(function (e) { out[e.id] = horiz ? { x: at } : { y: at }; at += (horiz ? e.w : e.h) + gap; });
        }
        return out;
    }
    // Clipboard payload for a selection: the elements plus the connectors between them.
    function copyPayload(store, ids) {
        var set = {}; ids.forEach(function (id) { set[id] = 1; });
        var els = store.m.elements.filter(function (e) { return set[e.id]; });
        var elSet = {}; els.forEach(function (e) { elSet[e.id] = 1; });
        var cns = store.m.connectors.filter(function (c) { return (set[c.id] || (elSet[c.from] && elSet[c.to])) && elSet[c.from] && elSet[c.to]; });
        return { elements: clone(els), connectors: clone(cns) };
    }
    // Paste into a transaction with fresh ids, offset by (dx, dy). Copies drop sysmlRef: a copy is a NEW element.
    // A shape a rule refuses (for example a second start point) is skipped, not the whole paste;
    // the reasons come back on created.skipped.
    function pastePayload(tx, payload, dx, dy) {
        var map = {}, created = [];
        created.skipped = [];
        (payload.elements || []).forEach(function (e) {
            var extra = clone(e); delete extra.id; delete extra.kind; delete extra.x; delete extra.y; delete extra.sysmlRef;
            var ekp = tx.s.def.elementKinds[e.kind];
            if (ekp && Array.isArray(ekp.uniqueProps) && extra.props) ekp.uniqueProps.forEach(function (k) { delete extra.props[k]; });   // identity props are not copied
            try {
                var n = tx.addElement(e.kind, e.x + dx, e.y + dy, extra);
                map[e.id] = n.id; created.push(n.id);
            } catch (err) { if (err instanceof RuleError) created.skipped.push(err.message); else throw err; }
        });
        (payload.connectors || []).forEach(function (c) {
            if (!map[c.from] || !map[c.to]) return;
            try {
                var cpr = clone(c.props) || {}, ckp = tx.s.def.connectorKinds[c.kind];
                if (ckp && Array.isArray(ckp.uniqueProps)) ckp.uniqueProps.forEach(function (k) { delete cpr[k]; });
                var n = tx.addConnector(c.kind, map[c.from], map[c.to], { fromPort: c.fromPort, toPort: c.toPort, label: c.label, props: cpr });
                created.push(n.id);
            } catch (e) { /* a rule refused it in this diagram; the shapes still paste */ }
        });
        return created;
    }
    function validateModel(def, store) {
        var issues = [];
        store.m.connectors.forEach(function (c) {
            if (!store.getEl(c.from) || !store.getEl(c.to)) issues.push({ id: c.id, message: 'A connector has a missing end.' });
            if (!def.connectorKinds[c.kind]) issues.push({ id: c.id, message: 'Unknown connector type "' + c.kind + '".' });
        });
        store.m.elements.forEach(function (e) { if (!def.elementKinds[e.kind]) issues.push({ id: e.id, message: 'Unknown shape type "' + e.kind + '".' }); });
        if (typeof def.validate === 'function') {
            try { (def.validate(store.m) || []).forEach(function (i) { issues.push(i); }); } catch (e) { issues.push({ id: null, message: 'Diagram check failed: ' + (e && e.message || e) }); }
        }
        return issues;
    }

    // ============================================================ GEOMETRY
    function center(e) { return { x: e.x + e.w / 2, y: e.y + e.h / 2 }; }
    function kindPorts(ek) {
        if (Array.isArray(ek.ports)) return ek.ports;
        if (ek.ports === 'none') return [];
        return [{ id: 'n', x: 0.5, y: 0, dir: 'n' }, { id: 'e', x: 1, y: 0.5, dir: 'e' }, { id: 's', x: 0.5, y: 1, dir: 's' }, { id: 'w', x: 0, y: 0.5, dir: 'w' }];
    }
    function portPoint(e, p) {
        var dir = p.dir || (p.y <= 0 ? 'n' : p.y >= 1 ? 's' : p.x <= 0 ? 'w' : p.x >= 1 ? 'e' : null);
        return { x: e.x + p.x * e.w, y: e.y + p.y * e.h, dir: dir };
    }
    function boundaryPoint(e, ek, toward) {
        var c = center(e), dx = toward.x - c.x, dy = toward.y - c.y;
        if (!dx && !dy) return { x: c.x, y: e.y };
        var hw = e.w / 2, hh = e.h / 2, t, b = (ek && ek.boundary) || ({ ellipse: 'ellipse', circle: 'ellipse', doubleEllipse: 'ellipse', diamond: 'diamond' }[ek && typeof ek.shape === 'string' ? ek.shape : ''] || 'rect');
        if (b === 'ellipse') t = 1 / Math.sqrt((dx * dx) / (hw * hw) + (dy * dy) / (hh * hh));
        else if (b === 'diamond') t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
        else t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
        var dir = Math.abs(dx) * hh > Math.abs(dy) * hw ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n');
        return { x: c.x + dx * t, y: c.y + dy * t, dir: dir };
    }
    function endPoint(def, e, portId, toward) {
        var ek = def.elementKinds[e.kind] || {};
        if (portId != null) {
            var p = kindPorts(ek).filter(function (q) { return q.id === portId; })[0];
            if (p) return portPoint(e, p);
        }
        return boundaryPoint(e, ek, toward);
    }
    // Returns { d, mid, a, b } for a connector, given bend offset for parallel connectors.
    function connectorGeometry(def, c, a, b, bend) {
        var ck = def.connectorKinds[c.kind] || {};
        var route = ck.route || 'straight';
        if (a === b) {   // self loop
            var cx = a.x + a.w / 2, r = Math.max(18, Math.min(a.w, a.h) * 0.32) + (bend ? Math.abs(bend) * 0.6 : 0);
            var p1 = boundaryPoint(a, def.elementKinds[a.kind], { x: cx - r * 0.7, y: a.y - 100 }), p2 = boundaryPoint(a, def.elementKinds[a.kind], { x: cx + r * 0.7, y: a.y - 100 });
            var top = a.y - r * 2.2;
            return { d: 'M' + p1.x + ',' + p1.y + ' C' + (p1.x - r) + ',' + top + ' ' + (p2.x + r) + ',' + top + ' ' + p2.x + ',' + p2.y, mid: { x: cx, y: top + r * 0.55 }, a: p1, b: p2 };
        }
        var ca = center(a), cb = center(b);
        if (route === 'orthogonal') {
            var pa = endPoint(def, a, c.fromPort, cb), pb = endPoint(def, b, c.toPort, ca);
            var horiz = pa.dir ? (pa.dir === 'e' || pa.dir === 'w') : Math.abs(cb.x - ca.x) >= Math.abs(cb.y - ca.y);
            var d, mid;
            if (horiz) { var mx = (pa.x + pb.x) / 2 + (bend || 0); d = 'M' + pa.x + ',' + pa.y + ' H' + mx + ' V' + pb.y + ' H' + pb.x; mid = { x: mx, y: (pa.y + pb.y) / 2 }; }
            else { var my = (pa.y + pb.y) / 2 + (bend || 0); d = 'M' + pa.x + ',' + pa.y + ' V' + my + ' H' + pb.x + ' V' + pb.y; mid = { x: (pa.x + pb.x) / 2, y: my }; }
            return { d: d, mid: mid, a: pa, b: pb };
        }
        var bendAmt = bend || 0;
        if (route === 'curved' && !bendAmt) bendAmt = 0;
        if (bendAmt) {
            var mxx = (ca.x + cb.x) / 2, myy = (ca.y + cb.y) / 2, dx = cb.x - ca.x, dy = cb.y - ca.y, L = Math.sqrt(dx * dx + dy * dy) || 1;
            var ctl = { x: mxx - dy / L * bendAmt * 2, y: myy + dx / L * bendAmt * 2 };
            var qa = endPoint(def, a, c.fromPort, ctl), qb = endPoint(def, b, c.toPort, ctl);
            var midq = { x: 0.25 * qa.x + 0.5 * ctl.x + 0.25 * qb.x, y: 0.25 * qa.y + 0.5 * ctl.y + 0.25 * qb.y };
            return { d: 'M' + qa.x + ',' + qa.y + ' Q' + ctl.x + ',' + ctl.y + ' ' + qb.x + ',' + qb.y, mid: midq, a: qa, b: qb };
        }
        var sa = endPoint(def, a, c.fromPort, c.toPort != null ? endPoint(def, b, c.toPort, ca) : cb);
        var sb = endPoint(def, b, c.toPort, c.fromPort != null ? sa : ca);
        return { d: 'M' + sa.x + ',' + sa.y + ' L' + sb.x + ',' + sb.y, mid: { x: (sa.x + sb.x) / 2, y: (sa.y + sb.y) / 2 }, a: sa, b: sb };
    }
    // Parallel connectors between the same pair bend apart (A to B and B to A never overlap).
    function bendMap(connectors) {
        var groups = {}, out = {};
        connectors.forEach(function (c) {
            if (c.from === c.to) { var k0 = 'self:' + c.from; (groups[k0] = groups[k0] || []).push(c); return; }
            var k = c.from < c.to ? c.from + '|' + c.to : c.to + '|' + c.from;
            (groups[k] = groups[k] || []).push(c);
        });
        Object.keys(groups).forEach(function (k) {
            var g = groups[k];
            if (k.indexOf('self:') === 0) { g.forEach(function (c, i) { out[c.id] = i * 14; }); return; }
            if (g.length < 2) return;
            // offsets are measured against the canonical direction, then turned into each
            // connector's own direction, so A to B and B to A land on opposite sides
            g.forEach(function (c, i) {
                var off = (i - (g.length - 1) / 2) * 36;
                out[c.id] = c.from < c.to ? off : -off;
            });
        });
        return out;
    }

    // ============================================================ SHAPES
    function _st(ek, ctx) {
        var s = ek.style || {};
        return 'fill="' + esc(s.fill || 'var(--sde-fill)') + '" stroke="' + esc(s.stroke || 'var(--sde-stroke)') + '" stroke-width="' + num(s.strokeWidth, 1.5) + '"' + (s.dash ? ' stroke-dasharray="' + esc(s.dash) + '"' : '');
    }
    var shapes = {
        rect: function (e, ek) { return '<rect class="sde-shape" x="0" y="0" width="' + e.w + '" height="' + e.h + '" ' + _st(ek) + '/>'; },
        roundRect: function (e, ek) { return '<rect class="sde-shape" x="0" y="0" rx="10" ry="10" width="' + e.w + '" height="' + e.h + '" ' + _st(ek) + '/>'; },
        stadium: function (e, ek) { var r = Math.min(e.w, e.h) / 2; return '<rect class="sde-shape" x="0" y="0" rx="' + r + '" ry="' + r + '" width="' + e.w + '" height="' + e.h + '" ' + _st(ek) + '/>'; },
        ellipse: function (e, ek) { return '<ellipse class="sde-shape" cx="' + e.w / 2 + '" cy="' + e.h / 2 + '" rx="' + e.w / 2 + '" ry="' + e.h / 2 + '" ' + _st(ek) + '/>'; },
        circle: function (e, ek) { return shapes.ellipse(e, ek); },
        doubleEllipse: function (e, ek) { return shapes.ellipse(e, ek) + '<ellipse cx="' + e.w / 2 + '" cy="' + e.h / 2 + '" rx="' + Math.max(1, e.w / 2 - 5) + '" ry="' + Math.max(1, e.h / 2 - 5) + '" fill="none" stroke="' + esc((ek.style || {}).stroke || 'var(--sde-stroke)') + '" stroke-width="1.2"/>'; },
        diamond: function (e, ek) { return '<polygon class="sde-shape" points="' + e.w / 2 + ',0 ' + e.w + ',' + e.h / 2 + ' ' + e.w / 2 + ',' + e.h + ' 0,' + e.h / 2 + '" ' + _st(ek) + '/>'; },
        hexagon: function (e, ek) { var i = Math.min(e.w * 0.18, e.h * 0.5); return '<polygon class="sde-shape" points="' + i + ',0 ' + (e.w - i) + ',0 ' + e.w + ',' + e.h / 2 + ' ' + (e.w - i) + ',' + e.h + ' ' + i + ',' + e.h + ' 0,' + e.h / 2 + '" ' + _st(ek) + '/>'; },
        parallelogram: function (e, ek) { var i = Math.min(e.w * 0.18, 24); return '<polygon class="sde-shape" points="' + i + ',0 ' + e.w + ',0 ' + (e.w - i) + ',' + e.h + ' 0,' + e.h + '" ' + _st(ek) + '/>'; },
        triangle: function (e, ek) { return '<polygon class="sde-shape" points="' + e.w / 2 + ',0 ' + e.w + ',' + e.h + ' 0,' + e.h + '" ' + _st(ek) + '/>'; },
        point: function (e, ek) { var r = Math.min(e.w, e.h) / 2; return '<circle class="sde-shape" cx="' + e.w / 2 + '" cy="' + e.h / 2 + '" r="' + r + '" fill="' + esc((ek.style || {}).stroke || 'var(--sde-stroke)') + '"/>'; }
    };
    function shapeMarkup(def, e, ctx) {
        var ek = def.elementKinds[e.kind] || { shape: 'rect', style: { dash: '4 3' } };
        try {
            if (typeof ek.shape === 'function') return String(ek.shape(e, ctx) || '');
            return (shapes[ek.shape] || shapes.rect)(e, ek, ctx);
        } catch (err) { return shapes.rect(e, { style: { stroke: '#c0392b', dash: '3 3' } }); }
    }
    function wrapLines(text, maxW, fs, maxLines) {
        var per = Math.max(3, Math.floor(maxW / (fs * 0.58)));
        var out = [];
        String(text || '').split('\n').forEach(function (para) {
            var words = para.split(/\s+/), line = '';
            words.forEach(function (w) {
                while (w.length > per) { if (line) { out.push(line); line = ''; } out.push(w.slice(0, per)); w = w.slice(per); }
                if (!line) line = w; else if ((line + ' ' + w).length <= per) line += ' ' + w; else { out.push(line); line = w; }
            });
            out.push(line);
        });
        if (maxLines && out.length > maxLines) { out = out.slice(0, maxLines); out[maxLines - 1] = out[maxLines - 1].replace(/.{0,1}$/, '') + '…'; }
        return out;
    }
    function labelMarkup(def, e) {
        var ek = def.elementKinds[e.kind] || {};
        if (ek.renderLabel === false || !e.label) return '';
        var fs = ek.fontSize || 12, lh = fs * 1.25, pos = ek.labelPos || 'center';
        var maxLines = pos === 'center' ? Math.max(1, Math.floor((e.h - 6) / lh)) : 3;
        var lines = wrapLines(e.label, pos === 'center' ? e.w - 12 : Math.max(e.w * 1.6, 80), fs, maxLines);
        var y0 = pos === 'below' ? e.h + fs + 2 : pos === 'above' ? -6 - (lines.length - 1) * lh : e.h / 2 - (lines.length - 1) * lh / 2 + fs * 0.35;
        return '<text class="sde-label" x="' + e.w / 2 + '" y="' + y0 + '" font-size="' + fs + '" text-anchor="middle">' +
            lines.map(function (l, i) { return '<tspan x="' + e.w / 2 + '" dy="' + (i ? lh : 0) + '">' + esc(l) + '</tspan>'; }).join('') + '</text>';
    }
    function markerDefs(def, prefix) {
        var out = '';
        Object.keys(def.connectorKinds).forEach(function (k) {
            var ck = def.connectorKinds[k], col = (ck.style && ck.style.stroke) || 'var(--sde-line)';
            ['start', 'end'].forEach(function (which) {
                var a = typeof ck.arrow === 'object' ? ck.arrow[which] : (ck.arrow === 'both' ? 'triangle' : (which === 'end' && ck.arrow !== 'none' && ck.arrow !== 'start' ? ck.arrow : (which === 'start' && ck.arrow === 'start' ? 'triangle' : null)));
                if (!a || a === 'none') return;
                var id = prefix + '-m-' + k + '-' + which;
                var body = a === 'open' ? '<path d="M0,0 L10,5 L0,10" fill="none" stroke="' + col + '" stroke-width="1.6"/>'
                    : a === 'diamond' ? '<path d="M0,5 L5,0 L10,5 L5,10 Z" fill="' + col + '"/>'
                    : a === 'circle' ? '<circle cx="5" cy="5" r="4" fill="' + col + '"/>'
                    : a === 'bar' ? '<path d="M8,0 L8,10" stroke="' + col + '" stroke-width="2"/>'
                    : '<path d="M0,0 L10,5 L0,10 Z" fill="' + col + '"/>';
                out += '<marker id="' + id + '" viewBox="0 0 10 10" refX="' + (a === 'circle' || a === 'diamond' ? 5 : 9) + '" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="' + (which === 'start' ? 'auto-start-reverse' : 'auto') + '">' + body + '</marker>';
            });
        });
        return out;
    }
    function connectorMarkup(def, c, geo, prefix) {
        var ck = def.connectorKinds[c.kind] || { style: { dash: '3 3' } }, s = ck.style || {};
        var hasM = function (w) { var a = typeof ck.arrow === 'object' ? ck.arrow[w] : (ck.arrow === 'both' ? 'triangle' : (w === 'end' ? (ck.arrow !== 'none' && ck.arrow !== 'start' ? ck.arrow : null) : (ck.arrow === 'start' ? 'triangle' : null))); return a && a !== 'none'; };
        var out = '<path class="sde-hit" d="' + geo.d + '"/>' +
            '<path class="sde-line" d="' + geo.d + '" fill="none" stroke="' + esc(s.stroke || 'var(--sde-line)') + '" stroke-width="' + num(s.width, 1.5) + '"' +
            (s.dash ? ' stroke-dasharray="' + esc(s.dash) + '"' : '') +
            (hasM('end') ? ' marker-end="url(#' + prefix + '-m-' + c.kind + '-end)"' : '') +
            (hasM('start') ? ' marker-start="url(#' + prefix + '-m-' + c.kind + '-start)"' : '') + '/>';
        var text = c.label;
        if (typeof ck.labelText === 'function') { try { text = ck.labelText(c); } catch (_) {} }
        if (text) {
            var fs = 11, w = Math.min(220, String(text).length * fs * 0.6 + 10);
            out += '<g class="sde-clabel" transform="translate(' + geo.mid.x + ',' + geo.mid.y + ')"><rect x="' + (-w / 2) + '" y="-9" width="' + w + '" height="18" rx="4"/><text y="4" font-size="' + fs + '" text-anchor="middle">' + esc(String(text).slice(0, 40)) + '</text></g>';
        }
        return out;
    }

    // ============================================================ VIEW
    var CSS = [
        '.sde{--sde-bg:var(--color-surface-1,#fff);--sde-fill:var(--color-surface-1,#fff);--sde-stroke:var(--color-text-primary,#14171c);--sde-line:var(--color-text-secondary,#4a5260);--sde-accent:var(--color-accent,#1A6EF2);--sde-muted:var(--color-text-tertiary,#7a828f);--sde-border:var(--color-border-thin,rgba(20,23,28,.35));--sde-panel:var(--color-surface-2,#f5f6f8);--sde-ok:var(--color-success,#1f8f4e);--sde-bad:var(--color-danger,#c0392b);--sde-griddot:rgba(120,128,140,.28);',
        'position:relative;display:flex;flex-direction:column;border:1px solid var(--sde-border);border-radius:8px;background:var(--sde-bg);color:var(--color-text-primary,#14171c);font:13px/1.35 var(--font-sans,system-ui,-apple-system,"Segoe UI",sans-serif);min-height:360px;overflow:hidden}',
        '.sde.sde-fullscreen{position:fixed;inset:0;z-index:9000;border-radius:0;height:auto!important}',
        '.sde-bar{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:6px 8px;border-bottom:1px solid var(--sde-border);background:var(--sde-panel)}',
        '.sde-bar .sde-sep{width:1px;height:20px;background:var(--sde-border);margin:0 4px}',
        '.sde select.sde-btn{width:auto;min-width:0;flex:0 0 auto;margin:0;padding:0 6px}',
        '.sde-btn{display:inline-flex;align-items:center;gap:4px;height:28px;margin:0;padding:0 9px;box-shadow:none;background-image:none;border:1px solid var(--sde-border);border-radius:6px;background:var(--sde-bg);color:inherit;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}',
        '.sde-btn:hover:not(:disabled){border-color:var(--sde-accent)}',
        '.sde-btn:disabled{opacity:.45;cursor:default}',
        '.sde-btn[aria-pressed="true"]{background:var(--sde-accent);border-color:var(--sde-accent);color:#fff}',
        '.sde-btn:focus-visible,.sde-tool:focus-visible,.sde-canvas:focus-visible{outline:2px solid var(--sde-accent);outline-offset:1px}',
        '.sde-zoom{min-width:48px;text-align:center;font-variant-numeric:tabular-nums;font-size:12px}',
        '.sde-body{position:relative;display:flex;flex:1;min-height:0}',
        '.sde-toolbox{width:150px;flex:0 0 auto;border-right:1px solid var(--sde-border);background:var(--sde-panel);overflow:auto;padding:8px 6px}',
        '.sde-toolbox h4{margin:6px 4px 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--sde-muted)}',
        '.sde-tool{display:flex;align-items:center;justify-content:flex-start;gap:8px;box-shadow:none;background-image:none;width:100%;padding:5px 6px;margin:0 0 3px;border:1px solid transparent;border-radius:6px;background:transparent;color:inherit;font:inherit;font-size:12px;text-align:left;cursor:grab;touch-action:none;user-select:none}',
        '.sde-tool:hover{background:var(--sde-bg);border-color:var(--sde-border)}',
        '.sde-tool[aria-pressed="true"]{background:var(--sde-bg);border-color:var(--sde-accent);box-shadow:inset 3px 0 0 var(--sde-accent)}',
        '.sde-tool svg{flex:0 0 auto}',
        '.sde-ro .sde-tool{cursor:default;opacity:.5}',
        '.sde-canvas{position:relative;flex:1;min-width:0;overflow:hidden;outline:none;touch-action:none;background-color:var(--sde-bg)}',
        '.sde-canvas.sde-grid{background-image:radial-gradient(var(--sde-griddot) 1px,transparent 1px)}',
        '.sde-canvas svg.sde-svg{position:absolute;inset:0;width:100%;height:100%;display:block;user-select:none}',
        '.sde-canvas.sde-mode-pan{cursor:grab}.sde-canvas.sde-panning{cursor:grabbing}.sde-canvas.sde-armed{cursor:crosshair}',
        '.sde-el{cursor:move}.sde-ro .sde-el{cursor:pointer}',
        '.sde-label{fill:currentColor;pointer-events:none}',
        '.sde-lod .sde-label,.sde-lod .sde-clabel{display:none}',
        '.sde-el.sde-sel .sde-shape{stroke:var(--sde-accent);stroke-width:2.5}',
        '.sde-el.sde-focus>.sde-focusring{display:block}',
        '.sde-focusring{display:none;fill:none;stroke:var(--sde-accent);stroke-width:1.5;stroke-dasharray:4 3;pointer-events:none}',
        '.sde-cn .sde-hit{fill:none;stroke:transparent;stroke-width:12;cursor:pointer}',
        '.sde-cn.sde-sel .sde-line{stroke:var(--sde-accent)!important;stroke-width:2.5}',
        '.sde-cn.sde-focus .sde-line{stroke-dasharray:6 3}',
        '.sde-clabel rect{fill:var(--sde-bg);stroke:var(--sde-border)}.sde-clabel text{fill:currentColor}',
        '.sde-el.sde-legal .sde-shape{stroke:var(--sde-ok);stroke-width:2.5}',
        '.sde-el.sde-illegal{opacity:.35}',
        '.sde-el.sde-src .sde-shape{stroke:var(--sde-accent);stroke-width:3}',
        '.sde-handle{fill:var(--sde-bg);stroke:var(--sde-accent);stroke-width:1.5}',
        '.sde-port{fill:var(--sde-accent);stroke:var(--sde-bg);stroke-width:1.5;cursor:crosshair}',
        '.sde-port:hover{r:7}',
        '.sde-rubber{stroke:var(--sde-accent);stroke-width:1.5;stroke-dasharray:5 4;fill:none;pointer-events:none}',
        '.sde-marquee{fill:rgba(26,110,242,.08);stroke:var(--sde-accent);stroke-dasharray:4 3;pointer-events:none}',
        '.sde-props{width:270px;flex:0 0 auto;border-left:1px solid var(--sde-border);background:var(--sde-panel);overflow:auto;padding:10px 12px;display:none}',
        '.sde-props.sde-open{display:block}',
        '.sde-props h3{margin:0 0 8px;font-size:13px}',
        '.sde-props label{display:block;margin:8px 0 3px;font-size:11px;color:var(--sde-muted)}',
        '.sde-props input,.sde-props select,.sde-props textarea{width:100%;box-sizing:border-box;padding:5px 7px;border:1px solid var(--sde-border);border-radius:5px;background:var(--sde-bg);color:inherit;font:inherit;font-size:12px}',
        '.sde-props input[type=checkbox]{width:auto}',
        '.sde-props .sde-ro-val{font-family:var(--font-mono,monospace);font-size:11px;word-break:break-all;color:var(--sde-muted)}',
        '.sde-props .sde-help{font-size:11px;color:var(--sde-muted);margin-top:2px}',
        '.sde-props .sde-issue{font-size:12px;color:var(--sde-bad);margin:4px 0}',
        '.sde-props .sde-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}',
        '.sde-status{display:flex;gap:12px;align-items:center;padding:4px 10px;border-top:1px solid var(--sde-border);background:var(--sde-panel);font-size:12px;color:var(--sde-muted);min-height:24px}',
        '.sde-status .sde-hint{flex:1}',
        '.sde-banner{display:none;padding:6px 10px;background:var(--color-warning-bg,#fff4d6);color:var(--color-text-primary,#14171c);border-bottom:1px solid var(--sde-border);font-size:12px}',
        '.sde-ro .sde-banner{display:block}',
        '.sde-busy .sde-canvas{cursor:progress}',
        '.sde-minimap{position:absolute;right:10px;bottom:10px;width:180px;height:120px;border:1px solid var(--sde-border);border-radius:6px;background:var(--sde-bg);box-shadow:0 2px 8px rgba(0,0,0,.12);cursor:pointer;display:none}',
        '.sde-minimap.sde-open{display:block}',
        '.sde-inline{position:absolute;z-index:5;box-sizing:border-box;padding:4px 6px;border:2px solid var(--sde-accent);border-radius:4px;background:var(--sde-bg);color:inherit;font:inherit;font-size:12px;resize:none;text-align:center}',
        '.sde-menu{position:absolute;z-index:6;min-width:160px;padding:4px;border:1px solid var(--sde-border);border-radius:6px;background:var(--sde-bg);box-shadow:0 4px 14px rgba(0,0,0,.16)}',
        '.sde-menu button{display:block;width:100%;padding:6px 8px;border:0;background:transparent;color:inherit;font:inherit;font-size:12px;text-align:left;cursor:pointer;border-radius:4px}',
        '.sde-menu button:hover,.sde-menu button:focus{background:var(--sde-panel)}',
        '.sde-ghost{position:fixed;z-index:9500;pointer-events:none;opacity:.85}',
        '.sde-keys{position:absolute;z-index:6;right:10px;top:10px;max-width:330px;padding:10px 12px;border:1px solid var(--sde-border);border-radius:6px;background:var(--sde-bg);box-shadow:0 4px 14px rgba(0,0,0,.16);font-size:12px}',
        '.sde-keys table{border-collapse:collapse}.sde-keys td{padding:2px 6px;vertical-align:top}.sde-keys td:first-child{white-space:nowrap;font-family:var(--font-mono,monospace)}',
        '.sde-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}',
        '@media (max-width:720px){.sde-toolbox{width:112px}.sde-props{position:absolute;right:0;top:0;bottom:0;z-index:4}}'
    ].join('\n');
    function _injectCss() {
        if (!HAS_DOM || document.getElementById('sde-styles')) return;
        var st = document.createElement('style'); st.id = 'sde-styles'; st.textContent = CSS;
        (document.head || document.documentElement).appendChild(st);
    }
    function h(tag, attrs, html) {
        var n = document.createElement(tag);
        if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] != null) n.setAttribute(k, attrs[k]); });
        if (html != null) n.innerHTML = html;
        return n;
    }
    function svgEl(tag, attrs) {
        var n = document.createElementNS(SVGNS, tag);
        if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
        return n;
    }
    function isTyping(t) { return !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)); }
    var ICONS = {
        undo: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 3 2 6l3 3"/><path d="M2 6h8a4 4 0 0 1 0 8H7"/></svg>',
        redo: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m11 3 3 3-3 3"/><path d="M14 6H6a4 4 0 0 0 0 8h3"/></svg>',
        pan: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1v14M1 8h14M8 1 6 3M8 1l2 2M8 15l-2-2M8 15l2-2M1 8l2-2M1 8l2 2M15 8l-2-2M15 8l-2 2"/></svg>',
        select: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2"><rect x="2" y="2" width="12" height="12"/></svg>',
        connect: '<svg width="22" height="14" viewBox="0 0 22 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="4" width="6" height="6"/><rect x="15" y="4" width="6" height="6"/><path d="M7 7h8"/></svg>'
    };

    var _uid = 0;
    function Editor(container, opts) {
        if (!HAS_DOM) throw new Error('SLDiagramEditor.mount needs a browser document.');
        var def = _defs[opts.type];
        if (!def) throw new Error('No diagram registered with type "' + opts.type + '".');
        _injectCss();
        this.n = ++_uid; this.prefix = 'sde' + this.n;
        this.def = def; this.type = def.type; this.opts = opts;
        this.container = container;
        if (opts.adapter) this.adapter = opts.adapter;
        else {
            // No adapter: the editor holds the model; opts.onChange(model, change) hears every kept change.
            var mem = opts.model || { elements: [], connectors: [] };
            this.adapter = { _memory: typeof opts.onChange !== 'function', load: function () { return mem; }, save: function (m, ch) { mem = m; if (typeof opts.onChange === 'function') opts.onChange(clone(m), ch); } };
        }
        this.store = new Store(def, this.adapter.load());
        this.history = new History(opts.historyLimit);
        this.view = { x: 40, y: 40, k: 1 };
        this.sel = new Set(); this.focusId = null;
        this.mode = 'pan';
        this.armed = null;
        this.snap = opts.snap != null ? !!opts.snap : (def.snap != null ? !!def.snap : true);
        this.grid = def.grid || 10;
        this.propsOpen = opts.properties != null ? !!opts.properties : true;
        this.minimapPref = opts.minimap != null ? opts.minimap : 'auto';
        this.fullscreen = false;
        this.busy = false;
        this._listeners = {};
        this._elDom = new Map(); this._cnDom = new Map(); this._dirty = new Set(); this._dirtyAll = true;
        this._pasteN = 0;
        this._lastJSON = JSON.stringify(this.store.m);
        this._gen = this._dataGen();
        this._build();
        this._resolveReadOnly();
        this.render();
        if (opts.fit !== false) { var self = this; setTimeout(function () { if (self.store.m.elements.length) self.fit(); }, 0); }
        _instances.push(this);
    }
    var P = Editor.prototype;

    // ---------------------------------------------------------------- events
    P.on = function (ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); var self = this; return function () { self._listeners[ev] = (self._listeners[ev] || []).filter(function (f) { return f !== fn; }); }; };
    P._emit = function (ev, a, b) { (this._listeners[ev] || []).forEach(function (f) { try { f(a, b); } catch (e) { try { console.warn('[diagram] listener failed', e); } catch (_) {} } }); };

    // ---------------------------------------------------------------- build DOM
    P._build = function () {
        var self = this, def = this.def;
        var root = h('div', { class: 'sde', 'data-diagram': def.type, 'data-sde': this.prefix });
        if (this.opts.height) root.style.height = typeof this.opts.height === 'number' ? this.opts.height + 'px' : this.opts.height;
        // toolbar
        var bar = h('div', { class: 'sde-bar', role: 'toolbar', 'aria-label': (def.title || def.type) + ' tools' });
        function btn(act, label, inner, title) { var b = h('button', { type: 'button', class: 'sde-btn', 'data-act': act, title: title || label, 'aria-label': label }, inner || esc(label)); bar.appendChild(b); return b; }
        function sep() { bar.appendChild(h('span', { class: 'sde-sep', 'aria-hidden': 'true' })); }
        this.$ = {};
        this.$.pan = btn('mode-pan', 'Pan', ICONS.pan + ' Pan', 'Drag empty canvas to move the view (hold Space anywhere to pan)');
        this.$.select = btn('mode-select', 'Select area', ICONS.select + ' Select area', 'Drag on empty canvas to select everything inside a box (or hold Shift and drag)');
        sep();
        this.$.undo = btn('undo', 'Undo', ICONS.undo + ' Undo', 'Undo (Ctrl+Z)');
        this.$.redo = btn('redo', 'Redo', ICONS.redo + ' Redo', 'Redo (Ctrl+Shift+Z or Ctrl+Y)');
        sep();
        this.$.del = btn('delete', 'Delete', null, 'Delete the selection (Delete key)');
        this.$.copy = btn('copy', 'Copy', null, 'Copy (Ctrl+C)');
        this.$.paste = btn('paste', 'Paste', null, 'Paste (Ctrl+V)');
        var alignSel = h('select', { class: 'sde-btn', 'data-act': 'align', 'aria-label': 'Align the selection', title: 'Align or space the selected shapes' },
            '<option value="">Align</option><option value="left">Align left</option><option value="center">Align centers</option><option value="right">Align right</option><option value="top">Align top</option><option value="middle">Align middles</option><option value="bottom">Align bottom</option><option value="hspace">Space evenly across</option><option value="vspace">Space evenly down</option>');
        bar.appendChild(alignSel); this.$.align = alignSel;
        this.$.layout = btn('layout', 'Auto layout', null, 'Arrange the whole diagram automatically');
        this.$.snapB = btn('snap', 'Snap to grid', null, 'Snap shapes to the grid while moving (hold Alt to move freely)');
        sep();
        this.$.zout = btn('zoom-out', 'Zoom out', '−', 'Zoom out (-)');
        this.$.zoomLbl = h('span', { class: 'sde-zoom', 'aria-live': 'polite' }, '100%'); bar.appendChild(this.$.zoomLbl);
        this.$.zin = btn('zoom-in', 'Zoom in', '+', 'Zoom in (+)');
        btn('fit', 'Fit', null, 'Fit the whole diagram in view (1)');
        btn('zoom-100', '100%', null, 'Actual size (0)');
        this.$.mini = btn('minimap', 'Overview', null, 'Show or hide the overview map');
        this.$.full = btn('fullscreen', 'Full screen', null, 'Full screen (Esc exits)');
        sep();
        this.$.propsB = btn('props', 'Properties', null, 'Show or hide the properties panel');
        btn('keys', 'Keys', null, 'Keyboard shortcuts');
        (this.opts.actions || []).forEach(function (a, i) { var b = btn('custom-' + i, a.label, null, a.title || a.label); b._custom = a; });
        root.appendChild(bar);
        this.$.banner = h('div', { class: 'sde-banner', role: 'status' }); root.appendChild(this.$.banner);
        // body: toolbox | canvas | properties
        var body = h('div', { class: 'sde-body' });
        var tb = h('div', { class: 'sde-toolbox', role: 'group', 'aria-label': 'Toolbox' });
        var tbh = '<h4>Shapes</h4>';
        Object.keys(def.elementKinds).forEach(function (k) {
            var ek = def.elementKinds[k];
            if (ek.hidden) return;
            tbh += '<button type="button" class="sde-tool" data-tool="el" data-kind="' + esc(k) + '" aria-pressed="false" title="' + esc((ek.description ? ek.description + '. ' : '') + 'Drag onto the canvas, or click then click the canvas') + '">' + self._toolIcon(ek) + '<span>' + esc(ek.label) + '</span></button>';
        });
        var cks = Object.keys(def.connectorKinds).filter(function (k) { return !def.connectorKinds[k].hidden; });
        if (cks.length) {
            tbh += '<h4>Connectors</h4>';
            cks.forEach(function (k) {
                var ck = def.connectorKinds[k];
                tbh += '<button type="button" class="sde-tool" data-tool="cn" data-kind="' + esc(k) + '" aria-pressed="false" title="' + esc((ck.description ? ck.description + '. ' : '') + 'Click, then click the start shape and the end shape. Esc stops.') + '">' + self._connIcon(ck) + '<span>' + esc(ck.label) + '</span></button>';
            });
        }
        tb.innerHTML = tbh;
        this.$.toolbox = tb; body.appendChild(tb);
        var cv = h('div', { class: 'sde-canvas sde-grid', tabindex: '0', role: 'application', 'aria-roledescription': 'diagram editor', 'aria-label': (def.title || def.type) + ' canvas. Tab moves between shapes, arrow keys move them, Enter renames, Delete removes. Press question mark for all keys.' });
        var svg = svgEl('svg', { class: 'sde-svg' });
        svg.innerHTML = '<defs>' + markerDefs(def, this.prefix) + '</defs><rect class="sde-bgrect" x="0" y="0" width="100%" height="100%" fill="transparent"/>' +
            '<g class="sde-vp"><g class="sde-gcn"></g><g class="sde-gdeco"></g><g class="sde-gel"></g><g class="sde-gov"></g></g>';
        cv.appendChild(svg);
        var mm = h('canvas', { class: 'sde-minimap', width: '360', height: '240', 'aria-label': 'Overview map. Click to move the view.', role: 'img' });
        cv.appendChild(mm);
        this.$.live = h('div', { class: 'sde-sr', 'aria-live': 'polite' }); cv.appendChild(this.$.live);
        body.appendChild(cv);
        var props = h('div', { class: 'sde-props', role: 'region', 'aria-label': 'Properties' });
        body.appendChild(props);
        root.appendChild(body);
        var status = h('div', { class: 'sde-status' }, '<span class="sde-hint"></span><span class="sde-count"></span>');
        root.appendChild(status);
        this.container.appendChild(root);
        this.root = root; this.$.bar = bar; this.$.canvas = cv; this.$.svg = svg; this.$.vp = svg.querySelector('.sde-vp');
        this.$.gcn = svg.querySelector('.sde-gcn'); this.$.gel = svg.querySelector('.sde-gel'); this.$.gov = svg.querySelector('.sde-gov'); this.$.gdeco = svg.querySelector('.sde-gdeco');
        this.$.mm = mm; this.$.props = props; this.$.hint = status.querySelector('.sde-hint'); this.$.count = status.querySelector('.sde-count');
        this._wire();
        this._syncChrome();
    };
    P._toolIcon = function (ek) {
        if (ek.icon) return ek.icon;
        var w = 28, hgt = 20, e = { x: 0, y: 0, w: w, h: hgt, label: '', props: {} };
        if (ek.aspect === 'lock') { e.w = e.h = 20; }
        var s = typeof ek.shape === 'function' ? ek.shape(Object.assign({}, e, { w: ek.w, h: ek.h }), { icon: true }) : (shapes[ek.shape] || shapes.rect)(e, ek);
        if (typeof ek.shape === 'function') return '<svg width="28" height="20" viewBox="-2 -2 ' + (ek.w + 4) + ' ' + (ek.h + 4) + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' + s + '</svg>';
        return '<svg width="30" height="22" viewBox="-1 -1 ' + (e.w + 2) + ' ' + (e.h + 2) + '" aria-hidden="true">' + s + '</svg>';
    };
    P._connIcon = function (ck) {
        var s = ck.style || {}, col = s.stroke || 'currentColor';
        var head = ck.arrow === 'none' ? '' : '<path d="M22,7 L16,4 L16,10 Z" fill="' + esc(col) + '"/>';
        return '<svg width="30" height="14" viewBox="0 0 30 14" aria-hidden="true"><path d="M2,7 L22,7" stroke="' + esc(col) + '" stroke-width="1.6"' + (s.dash ? ' stroke-dasharray="' + esc(s.dash) + '"' : '') + '/>' + head + '</svg>';
    };

    // ---------------------------------------------------------------- wiring
    P._wire = function () {
        var self = this, cv = this.$.canvas, svg = this.$.svg;
        this._h = {};
        this.$.bar.addEventListener('click', function (e) {
            var b = e.target.closest('[data-act]'); if (!b || b.tagName === 'SELECT') return;
            self._act(b.getAttribute('data-act'), b);
        });
        this.$.align.addEventListener('change', function () { var v = self.$.align.value; self.$.align.value = ''; if (v) self.align(v); });
        // toolbox: drag to place, click to arm
        this.$.toolbox.addEventListener('pointerdown', function (e) {
            var t = e.target.closest('.sde-tool'); if (!t || e.button !== 0) return;
            if (self.isReadOnly()) return;
            if (t.getAttribute('data-tool') === 'el') self._toolDragStart(e, t.getAttribute('data-kind'), t);
        });
        this.$.toolbox.addEventListener('click', function (e) {
            var t = e.target.closest('.sde-tool'); if (!t) return;
            if (self._suppressToolClick) { self._suppressToolClick = false; return; }
            if (self.isReadOnly()) { toast('This diagram is read only.', 'info'); return; }
            var kind = t.getAttribute('data-kind');
            if (t.getAttribute('data-tool') === 'el') {
                if (e.detail === 0) { var c = self._viewCenterWorld(); self.place(kind, c.x, c.y); return; }   // keyboard Enter/Space: place at view center
                self._arm(self.armed && self.armed.type === 'place' && self.armed.kind === kind ? null : { type: 'place', kind: kind });
            } else {
                self._arm(self.armed && self.armed.type === 'connect' && self.armed.kind === kind ? null : { type: 'connect', kind: kind, from: null });
            }
        });
        svg.addEventListener('pointerdown', function (e) { self._onDown(e); });
        svg.addEventListener('pointermove', function (e) { self._onMove(e); });
        svg.addEventListener('pointerup', function (e) { self._onUp(e); });
        svg.addEventListener('pointercancel', function (e) { self._onUp(e, true); });
        svg.addEventListener('pointerover', function (e) { self._onHover(e); });
        svg.addEventListener('dblclick', function (e) { self._onDbl(e); });
        svg.addEventListener('wheel', function (e) { self._onWheel(e); }, { passive: false });
        svg.addEventListener('contextmenu', function (e) { if (self._drag) e.preventDefault(); });
        this.root.addEventListener('keydown', function (e) { self._onKey(e); });
        this.root.addEventListener('keyup', function (e) { if (e.key === ' ' || e.code === 'Space') { self._space = false; self._syncCursor(); } });
        cv.addEventListener('focus', function () { self._checkExternal(); self._claimLock(); });
        this.$.mm.addEventListener('pointerdown', function (e) { e.stopPropagation(); self._mmDrag = true; try { self.$.mm.setPointerCapture(e.pointerId); } catch (_) {} self._mmTo(e); });
        this.$.mm.addEventListener('pointermove', function (e) { if (self._mmDrag) self._mmTo(e); });
        this.$.mm.addEventListener('pointerup', function () { self._mmDrag = false; });
        this.$.props.addEventListener('change', function (e) { self._onPropInput(e); });
        this.$.props.addEventListener('click', function (e) { var b = e.target.closest('[data-pact]'); if (b) self._propAction(b.getAttribute('data-pact'), b); });
        if (typeof ResizeObserver !== 'undefined') { this._ro = new ResizeObserver(function () { self._scheduleRender(); }); this._ro.observe(cv); }
        this._docKey = function (e) { if (self.fullscreen && e.key === 'Escape' && !self.root.contains(document.activeElement)) { e.preventDefault(); e.stopPropagation(); self.toggleFullscreen(false); } };
        document.addEventListener('keydown', this._docKey, true);
        try { if (root.SLLocks && typeof root.SLLocks.onChange === 'function') root.SLLocks.onChange(function () { self._resolveReadOnly(); }); } catch (_) {}
    };
    P._act = function (act, b) {
        switch (act) {
            case 'mode-pan': this.setMode('pan'); break;
            case 'mode-select': this.setMode('select'); break;
            case 'undo': this.undo(); break;
            case 'redo': this.redo(); break;
            case 'delete': this.deleteSelection(); break;
            case 'copy': this.copy(); break;
            case 'paste': this.paste(); break;
            case 'layout': this.autoLayout(); break;
            case 'snap': this.snap = !this.snap; this._syncChrome(); break;
            case 'zoom-in': this.zoomBy(1.25); break;
            case 'zoom-out': this.zoomBy(0.8); break;
            case 'fit': this.fit(); break;
            case 'zoom-100': this.zoomTo(1); break;
            case 'minimap': this.minimapPref = !this._minimapShown(); this._syncChrome(); this._drawMinimap(); break;
            case 'fullscreen': this.toggleFullscreen(); break;
            case 'props': this.propsOpen = !this.propsOpen; this._syncChrome(); break;
            case 'keys': this.toggleKeys(); break;
            default:
                if (b && b._custom) { try { b._custom.run(this); } catch (e) { toast('That action failed: ' + (e && e.message || e), 'error'); } }
        }
    };

    // ---------------------------------------------------------------- read only
    P._resolveReadOnly = function () {
        var ro = false, why = '';
        var o = this.opts.readOnly;
        try { var r = typeof o === 'function' ? o(this) : o; if (r) { ro = true; why = typeof r === 'string' ? r : 'You can view this diagram but not change it.'; } } catch (_) {}
        if (!ro && this.opts.lockScope && typeof root.slLockState === 'function') {
            try {
                var ls = root.slLockState(this.opts.lockScope.scope, this.opts.lockScope.systemId);
                if (ls && ls.editable === false) { ro = true; why = ls.kind === 'baseline' ? ('Read only: ' + ls.gate + ' is baselined. Reopening needs a problem report.') : ('Read only: locked by ' + (ls.name || ls.by || 'another user') + '.'); }
            } catch (_) {}
        }
        if (!ro && this.opts.lockKey && root.SLLocks && typeof root.SLLocks.heldBy === 'function') {
            try { var who = root.SLLocks.heldBy(this.opts.lockKey); if (who) { ro = true; why = 'Read only: ' + who + ' is editing this diagram right now.'; } } catch (_) {}
        }
        if (!ro && this._lockRefused) { ro = true; why = this._lockRefused; }
        this._setRO(ro, why);
        return ro;
    };
    P._setRO = function (ro, why) {
        var was = this.readOnly;
        this.readOnly = !!ro; this.roReason = why || '';
        this.root.classList.toggle('sde-ro', this.readOnly);
        this.$.banner.textContent = this.readOnly ? (this.roReason || 'Read only.') : '';
        if (this.readOnly) { this._arm(null); this._cancelInline(); }
        if (was !== this.readOnly) { this._dirtyAll = true; this._syncChrome(); this._renderProps(); this._scheduleRender(); }
    };
    P.setReadOnly = function (ro, reason) { this.opts.readOnly = ro ? (reason || true) : false; return this._resolveReadOnly(); };
    P.isReadOnly = function () { return !!this.readOnly; };
    P._claimLock = function () {
        var self = this, key = this.opts.lockKey;
        if (!key || this._lockClaimed || !root.SLLocks || typeof root.SLLocks.claim !== 'function' || this.readOnly) return;
        this._lockClaimed = true;
        Promise.resolve(root.SLLocks.claim(key)).then(function (r) {
            if (r && r.ok === false) { self._lockClaimed = false; self._lockRefused = 'Read only: ' + (r.name || 'someone else') + ' is editing this diagram right now.'; self._resolveReadOnly(); }
        }).catch(function () { self._lockClaimed = false; });
    };
    P._canEdit = function () {
        if (this._resolveReadOnly()) { toast(this.roReason || 'This diagram is read only.', 'info'); return false; }
        if (this.busy) { toast('Waiting for the last change to be confirmed.', 'info'); return false; }
        return true;
    };

    // ---------------------------------------------------------------- data in/out
    P._dataGen = function () { try { return root.SLDataChange && typeof root.SLDataChange.gen === 'function' ? root.SLDataChange.gen() : null; } catch (_) { return null; } };
    // The project data changed from outside the editor (app undo, sync pull, project load).
    P._checkExternal = function () {
        if (this.adapter._memory) return false;
        var g = this._dataGen();
        if (g != null && this._gen != null && g === this._gen) return false;
        this._gen = g;
        return this.reload();
    };
    P.reload = function () {
        var m;
        try { m = normalize(this.def, this.adapter.load()); } catch (e) { return false; }
        var j = JSON.stringify(m);
        if (j === this._lastJSON) return false;
        this.store.m = m; this.store._reindex();
        this._lastJSON = j;
        this.history.clear();
        var self = this;
        Array.from(this.sel).forEach(function (id) { if (!self.store.get(id)) self.sel.delete(id); });
        if (this.focusId && !this.store.get(this.focusId)) this.focusId = null;
        this._dirtyAll = true; this._boundsCache = null;
        this._syncChrome(); this._renderProps(); this.render();
        this._emit('reload', this.model());
        return true;
    };
    // Replace the whole model from diagram code (for example after the diagram regenerated it).
    // This is not an undoable edit; the editor's undo stack is cleared.
    P.setModel = function (model) {
        if (this.adapter._memory || !this.opts.adapter) { var m = normalize(this.def, model); this.adapter.load = function () { return m; }; }
        this._lastJSON = null;
        return this.reload();
    };
    P.model = function () { return clone(this.store.m); };
    P.get = function (id) { return clone(this.store.get(id)); };

    // ---------------------------------------------------------------- the ONE change path
    // change(label, fn): fn(tx) edits through the transaction. Resolves true when the change is
    // kept, false when a rule or a beforeChange hook refused it.
    P.change = function (label, fn, opt) {
        opt = opt || {};
        if (!opt.force && !this._canEdit()) return Promise.resolve(false);
        var tx = this.store.begin(label);
        try { fn(tx); this._complete(tx, opt.source || 'user'); }
        catch (e) {
            tx.rollback(); this._markAll(tx._final); this._scheduleRender();
            if (e instanceof RuleError) { toast(e.message, 'warning', 3400); this._say(e.message); }
            else { toast('That change failed: ' + (e && e.message || e), 'error'); try { console.warn('[diagram] change failed', e); } catch (_) {} }
            return Promise.resolve(false);
        }
        return this._commit(tx.end(), label, opt.source || 'user');
    };
    // def.complete: keep derived shapes consistent inside the same transaction (v1.1).
    P._complete = function (tx, source) {
        if (typeof this.def.complete === 'function') this.def.complete(tx, { editor: this, label: tx.label, source: source || 'user' });
    };
    P._markAll = function (ops) {
        var self = this; (ops || []).forEach(function (op) { self._dirty.add(op.id); var a = op.after || op.before; if (op.t === 'cn' && a) { self._dirty.add('pair:' + a.from); self._dirty.add('pair:' + a.to); } });
        this._boundsCache = null;
    };
    P._commit = function (ops, label, source, histEntry) {
        var self = this;
        this._markAll(ops);
        if (!ops.length) { this._scheduleRender(); return Promise.resolve(true); }
        var change = makeChange(this.type, label, ops, source);
        var ctx = { editor: this, diagram: this.type, label: label, source: source };
        var hooks = _hooks.before.slice();
        if (typeof this.def.beforeChange === 'function') hooks.push(this.def.beforeChange);
        if (typeof this.opts.beforeChange === 'function') hooks.push(this.opts.beforeChange);
        this._scheduleRender();
        var r = runBefore(hooks, change, ctx);
        var finish = function (ok) {
            self.busy = false; self.root.classList.remove('sde-busy');
            if (!ok) {
                self.store.apply(ops, true); self._markAll(ops);
                self._say('Change canceled: ' + label);
                self._syncChrome(); self._renderProps(); self._scheduleRender();
                return false;
            }
            if (source === 'user' || source === 'api') self.history.push({ label: label, ops: ops });
            else if (histEntry) histEntry();
            self._persist(change);
            _hooks.after.forEach(function (fn) { try { fn(change, ctx); } catch (e) { try { console.warn('[diagram] afterChange hook failed', e); } catch (_) {} } });
            if (typeof self.def.afterChange === 'function') { try { self.def.afterChange(change, ctx); } catch (_) {} }
            if (typeof self.opts.afterChange === 'function') { try { self.opts.afterChange(change, ctx); } catch (_) {} }
            self._emit('change', change);
            if (self.def.autoLayout && (source === 'user' || source === 'api')) self._applyAutoLayout();
            self._syncChrome(); self._renderProps(); self._scheduleRender();
            return true;
        };
        if (r && typeof r.then === 'function') {
            this.busy = true; this.root.classList.add('sde-busy'); this._hint('Waiting for confirmation…');
            return r.then(finish, function () { return finish(false); });
        }
        return Promise.resolve(finish(r !== false));
    };
    P._persist = function (change) {
        var save = this.adapter && this.adapter.save;
        if (save && this.adapter._memory) { save.call(this.adapter, clone(this.store.m), change); this._lastJSON = JSON.stringify(this.store.m); }
        else if (save) {
            if (this.opts.globalUndo !== false && typeof root.pushUndo === 'function') { try { root.pushUndo('Diagram: ' + change.label); } catch (_) {} }
            var self = this, write = function () {
                try { save.call(self.adapter, clone(self.store.m), change); }
                catch (e) { toast('The diagram change could not be saved: ' + (e && e.message || e), 'error', 5000); try { console.warn('[diagram] save failed', e); } catch (_) {} }
                if (self.opts.autosave !== false && typeof root.scheduleAutosave === 'function') { try { root.scheduleAutosave(); } catch (_) {} }
            };
            // 13 Oct 2026 (night, Waqas rulings 1 and 2): a change that only moves or resizes shapes,
            // an auto layout, and Undo / Redo in the editor are not asked about one by one: they are
            // collected and acknowledged together when the person leaves the view (change_ack.js).
            var dk = deferKind(change);
            if (dk === 'system' && root.SLChangeAck && typeof root.SLChangeAck.system === 'function') root.SLChangeAck.system(write);
            else if (dk && root.SLChangeAck && typeof root.SLChangeAck.deferred === 'function') root.SLChangeAck.deferred({ kind: dk, label: (this.def.title || this.type) + ': ' + String(change.label || '').replace(/^(Undo|Redo) /, '') }, write);
            else write();
            try { this._lastJSON = JSON.stringify(normalize(this.def, this.adapter.load())); } catch (_) { this._lastJSON = JSON.stringify(this.store.m); }
        } else {
            this._lastJSON = JSON.stringify(this.store.m);
        }
        this._gen = this._dataGen();
    };
    P.canUndo = function () { return this.history.undo.length > 0; };
    P.canRedo = function () { return this.history.redo.length > 0; };
    P._liveUndo = function () { try { return !!(this.adapter.save && !this.adapter._memory && root.SafetyLabCRDT && root.SafetyLabCRDT.liveUndo && root.SafetyLabCRDT.liveUndo()); } catch (_) { return false; } };
    P.undo = function () {
        if (this._liveUndo() && typeof root.undo === 'function') { root.undo(); this._checkExternal(); this.reload(); return Promise.resolve(true); }
        if (!this.canUndo()) { toast('Nothing to undo in this diagram.', 'info', 1800); return Promise.resolve(false); }
        if (!this._canEdit()) return Promise.resolve(false);
        var self = this, entry = this.history.undo[this.history.undo.length - 1];
        this.store.apply(entry.ops, true);
        return this._commit(invertOps(entry.ops), 'Undo ' + entry.label, 'undo', function () { self.history.undo.pop(); self.history.redo.push(entry); })
            .then(function (ok) { if (ok) { self._pruneSel(); self._say('Undid ' + entry.label); } return ok; });
    };
    P.redo = function () {
        if (this._liveUndo() && typeof root.redo === 'function') { root.redo(); this._checkExternal(); this.reload(); return Promise.resolve(true); }
        if (!this.canRedo()) { toast('Nothing to redo in this diagram.', 'info', 1800); return Promise.resolve(false); }
        if (!this._canEdit()) return Promise.resolve(false);
        var self = this, entry = this.history.redo[this.history.redo.length - 1];
        this.store.apply(entry.ops, false);
        return this._commit(entry.ops.map(function (o) { return clone(o); }), 'Redo ' + entry.label, 'redo', function () { self.history.redo.pop(); self.history.undo.push(entry); })
            .then(function (ok) { if (ok) { self._pruneSel(); self._say('Redid ' + entry.label); } return ok; });
    };
    P._pruneSel = function () { var self = this; Array.from(this.sel).forEach(function (id) { if (!self.store.get(id)) self.sel.delete(id); }); if (this.focusId && !this.store.get(this.focusId)) this.focusId = null; this._renderProps(); };

    // ---------------------------------------------------------------- high-level actions
    P._snapV = function (v, free) { return (this.snap && !free) ? Math.round(v / this.grid) * this.grid : Math.round(v); };
    P.place = function (kind, cx, cy, extra) {
        var ek = this.def.elementKinds[kind]; if (!ek) return Promise.resolve(null);
        var self = this, made = null;
        var x = this._snapV(cx - ek.w / 2), y = this._snapV(cy - ek.h / 2);
        return this.change('Add ' + ek.label.toLowerCase(), function (tx) { made = tx.addElement(kind, x, y, extra); }).then(function (ok) {
            if (!ok || !made) return null;
            self.select([made.id]); self.focusId = made.id;
            self._say('Added ' + ek.label + '. Press Enter to rename.');
            return made.id;
        });
    };
    P.connect = function (from, to, kind, extra) {
        var ck = this.def.connectorKinds[kind], self = this, made = null;
        if (!ck) return Promise.resolve(null);
        return this.change('Add ' + ck.label.toLowerCase(), function (tx) { made = tx.addConnector(kind, from, to, extra); }).then(function (ok) {
            if (!ok || !made) return null;
            self.select([made.id]);
            self._say('Connected with ' + ck.label + '.');
            return made.id;
        });
    };
    P.deleteSelection = function () {
        var self = this, ids = Array.from(this.sel);
        if (!ids.length) { toast('Select something to delete first.', 'info', 1800); return Promise.resolve(false); }
        var refused = null;
        if (typeof this.def.canDelete === 'function') {
            ids = ids.filter(function (id) { var r = self.def.canDelete(self.store.get(id), { model: self.store.m }); if (r === false || typeof r === 'string') { refused = typeof r === 'string' ? r : 'That item cannot be deleted.'; return false; } return true; });
            if (!ids.length) { toast(refused, 'warning'); return Promise.resolve(false); }
        }
        var n = ids.length;
        return this.change(n === 1 ? 'Delete ' + this._nameOf(ids[0]) : 'Delete ' + n + ' items', function (tx) { ids.forEach(function (id) { if (tx.get(id)) tx.remove(id); }); }).then(function (ok) {
            if (ok) { self.sel.clear(); self.focusId = null; self._say('Deleted.'); if (refused) toast(refused, 'warning'); self._syncChrome(); self._renderProps(); self._scheduleRender(); }
            return ok;
        });
    };
    P.rename = function (id, text) {
        var it = this.store.get(id); if (!it) return Promise.resolve(false);
        if (String(text) === String(it.label)) return Promise.resolve(true);
        return this.change('Rename ' + this._nameOf(id), function (tx) { tx.update(id, { label: String(text) }); });
    };
    P.copy = function () {
        var ids = Array.from(this.sel);
        if (!ids.length) { toast('Select something to copy first.', 'info', 1800); return false; }
        _clipboard[this.type] = copyPayload(this.store, ids);
        this._pasteN = 0;
        this._say('Copied ' + _clipboard[this.type].elements.length + ' shape(s).');
        this._syncChrome();
        return true;
    };
    P.cut = function () { if (this.copy()) return this.deleteSelection(); return Promise.resolve(false); };
    P.paste = function () {
        var pl = _clipboard[this.type];
        if (!pl || !pl.elements.length) { toast('Nothing to paste. Copy shapes first.', 'info', 1800); return Promise.resolve(false); }
        var self = this, created = [];
        this._pasteN++;
        var off = this.grid * 2 * this._pasteN;
        return this.change('Paste ' + pl.elements.length + ' shape(s)', function (tx) { created = pastePayload(tx, pl, off, off); }).then(function (ok) {
            if (ok) {
                self.select(created);
                if (created.skipped && created.skipped.length) toast(created.skipped.length + ' shape(s) not pasted: ' + created.skipped[0], 'warning', 4000);
            }
            return ok;
        });
    };
    P.duplicate = function () { if (this.copy()) return this.paste(); return Promise.resolve(false); };
    P.align = function (how) {
        var els = this._selEls();
        if (els.length < (how === 'hspace' || how === 'vspace' ? 3 : 2)) { toast(how === 'hspace' || how === 'vspace' ? 'Select at least three shapes to space them evenly.' : 'Select at least two shapes to align them.', 'info'); return Promise.resolve(false); }
        var pos = alignPositions(els, how);
        return this.change('Align ' + els.length + ' shapes', function (tx) { Object.keys(pos).forEach(function (id) { tx.updateElement(id, pos[id]); }); });
    };
    P._layoutFn = function () {
        var l = this.def.layout;
        if (typeof l === 'function') return l;
        if (l === 'grid') return layoutGrid;
        if (l === 'layered' || l == null) return function (m, c) { return layoutLayered(m, c && c.options); };
        return null;
    };
    P.autoLayout = function () {
        var fn = this._layoutFn(); if (!fn) return Promise.resolve(false);
        var self = this, pos;
        try { pos = fn(clone(this.store.m), { editor: this, selection: Array.from(this.sel), options: this.def.layoutOptions }) || {}; } catch (e) { toast('Auto layout failed: ' + (e && e.message || e), 'error'); return Promise.resolve(false); }
        return this.change('Auto layout', function (tx) {
            Object.keys(pos).forEach(function (id) { if (tx.get(id) && self.store.isEl(id)) tx.updateElement(id, pos[id]); });
        }).then(function (ok) { if (ok) self.fit(); return ok; });
    };
    // Diagrams whose positions are always computed (def.autoLayout = true): layout runs after each
    // change and is folded into the same history entry, so one undo takes both back.
    P._applyAutoLayout = function () {
        var fn = this._layoutFn(); if (!fn) return;
        var pos; try { pos = fn(clone(this.store.m), { editor: this, options: this.def.layoutOptions }) || {}; } catch (_) { return; }
        var tx = this.store.begin('layout'), self = this;
        Object.keys(pos).forEach(function (id) { if (self.store.isEl(id)) tx.updateElement(id, pos[id]); });
        var ops = tx.end();
        if (!ops.length) return;
        var last = this.history.undo[this.history.undo.length - 1];
        if (last) last.ops = last.ops.concat(ops);
        this._markAll(ops);
        this._persist(makeChange(this.type, 'layout', ops, 'layout'));
    };
    P.setMode = function (m) { this.mode = m === 'select' ? 'select' : 'pan'; this._syncChrome(); };

    // ---------------------------------------------------------------- selection
    P.select = function (ids, add) {
        var self = this;
        if (!add) this.sel.clear();
        (ids || []).forEach(function (id) { if (self.store.get(id)) self.sel.add(id); });
        if (ids && ids.length === 1) this.focusId = ids[0];
        this._syncSel(); this._syncChrome(); this._renderProps();
        this._emit('select', Array.from(this.sel));
        var one = this.sel.size === 1 ? this.store.get(Array.from(this.sel)[0]) : null;
        if (one) this._say(this._nameOf(one.id) + ' selected.');
        return Array.from(this.sel);
    };
    P.selection = function () { return Array.from(this.sel); };
    P._selEls = function () { var self = this; return Array.from(this.sel).map(function (id) { return self.store.getEl(id); }).filter(Boolean); };
    P._nameOf = function (id) {
        var it = this.store.get(id); if (!it) return 'item';
        var k = this.store.isEl(id) ? this.def.elementKinds[it.kind] : this.def.connectorKinds[it.kind];
        var kl = k ? k.label : it.kind;
        return it.label ? kl + ' "' + String(it.label).slice(0, 40) + '"' : kl;
    };

    // ---------------------------------------------------------------- view transform
    P._size = function () { var r = this.$.canvas.getBoundingClientRect(); return { w: r.width || 800, h: r.height || 500, left: r.left, top: r.top }; };
    P.toWorld = function (clientX, clientY) { var s = this._size(); return { x: (clientX - s.left - this.view.x) / this.view.k, y: (clientY - s.top - this.view.y) / this.view.k }; };
    P._viewCenterWorld = function () { var s = this._size(); return { x: (s.w / 2 - this.view.x) / this.view.k, y: (s.h / 2 - this.view.y) / this.view.k }; };
    P.setView = function (v) {
        if (v.k != null) this.view.k = clamp(v.k, 0.08, 4);
        if (v.x != null) this.view.x = v.x;
        if (v.y != null) this.view.y = v.y;
        this._applyView();
    };
    P.getView = function () { return { x: this.view.x, y: this.view.y, k: this.view.k }; };
    P._applyView = function () {
        this.$.vp.setAttribute('transform', 'translate(' + this.view.x + ',' + this.view.y + ') scale(' + this.view.k + ')');
        var g = this.grid * this.view.k;
        if (g >= 6) { this.$.canvas.style.backgroundSize = g + 'px ' + g + 'px'; this.$.canvas.style.backgroundPosition = this.view.x + 'px ' + this.view.y + 'px'; this.$.canvas.classList.add('sde-grid'); }
        else this.$.canvas.classList.remove('sde-grid');
        this.$.zoomLbl.textContent = Math.round(this.view.k * 100) + '%';
        this._scheduleRender();
        this._emit('view', this.getView());
    };
    P.zoomTo = function (k, cx, cy) {
        var s = this._size();
        if (cx == null) { cx = s.w / 2; cy = s.h / 2; }
        var nk = clamp(k, 0.08, 4), wx = (cx - this.view.x) / this.view.k, wy = (cy - this.view.y) / this.view.k;
        this.view.k = nk; this.view.x = cx - wx * nk; this.view.y = cy - wy * nk;
        this._applyView();
    };
    P.zoomBy = function (f, cx, cy) { this.zoomTo(this.view.k * f, cx, cy); };
    P.panBy = function (dx, dy) { this.view.x += dx; this.view.y += dy; this._applyView(); };
    P.bounds = function () {
        if (this._boundsCache) return this._boundsCache;
        var els = this.store.m.elements;
        if (!els.length) return (this._boundsCache = { x: 0, y: 0, w: 0, h: 0, empty: true });
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (var i = 0; i < els.length; i++) { var e = els[i]; if (e.x < x0) x0 = e.x; if (e.y < y0) y0 = e.y; if (e.x + e.w > x1) x1 = e.x + e.w; if (e.y + e.h > y1) y1 = e.y + e.h; }
        y0 -= 40; // room for self loops and labels above
        return (this._boundsCache = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 + 30 });
    };
    P.fit = function () {
        var b = this.bounds(), s = this._size();
        if (b.empty) { this.setView({ x: 40, y: 40, k: 1 }); return; }
        var pad = 40, k = clamp(Math.min((s.w - pad * 2) / Math.max(b.w, 1), (s.h - pad * 2) / Math.max(b.h, 1)), 0.08, 1.5);
        this.setView({ k: k, x: (s.w - b.w * k) / 2 - b.x * k, y: (s.h - b.h * k) / 2 - b.y * k });
    };
    P.ensureVisible = function (id) {
        var e = this.store.getEl(id); if (!e) { var c = this.store.getCn(id); e = c && this.store.getEl(c.from); }
        if (!e) return;
        var s = this._size(), k = this.view.k;
        var sx = e.x * k + this.view.x, sy = e.y * k + this.view.y, sw = e.w * k, sh = e.h * k, m = 30;
        var dx = 0, dy = 0;
        if (sx < m) dx = m - sx; else if (sx + sw > s.w - m) dx = (s.w - m) - (sx + sw);
        if (sy < m) dy = m - sy; else if (sy + sh > s.h - m) dy = (s.h - m) - (sy + sh);
        if (dx || dy) this.panBy(dx, dy);
    };
    P.toggleFullscreen = function (force) {
        this.fullscreen = force != null ? !!force : !this.fullscreen;
        this.root.classList.toggle('sde-fullscreen', this.fullscreen);
        try { document.documentElement.style.overflow = this.fullscreen ? 'hidden' : ''; } catch (_) {}
        this._syncChrome(); this._scheduleRender();
        if (this.fullscreen) { try { this.$.canvas.focus({ preventScroll: true }); } catch (_) {} }
        this._emit('fullscreen', this.fullscreen);
        return this.fullscreen;
    };
    P.isFullscreen = function () { return this.fullscreen; };

    // ---------------------------------------------------------------- chrome
    P._syncChrome = function () {
        if (!this.$) return;
        var ro = this.readOnly, nSel = this.sel.size;
        this.$.pan.setAttribute('aria-pressed', String(this.mode === 'pan'));
        this.$.select.setAttribute('aria-pressed', String(this.mode === 'select'));
        this.$.undo.disabled = ro || !this.canUndo();
        this.$.redo.disabled = ro || !this.canRedo();
        this.$.del.disabled = ro || !nSel;
        this.$.copy.disabled = !nSel;
        this.$.paste.disabled = ro || !(_clipboard[this.type] && _clipboard[this.type].elements.length);
        this.$.align.disabled = ro || this._selEls().length < 2;
        this.$.layout.disabled = ro || !this._layoutFn() || !this.store.m.elements.length;
        this.$.layout.style.display = this._layoutFn() ? '' : 'none';
        this.$.snapB.setAttribute('aria-pressed', String(this.snap));
        this.$.snapB.disabled = ro;
        this.$.full.setAttribute('aria-pressed', String(this.fullscreen));
        this.$.full.textContent = this.fullscreen ? 'Exit full screen' : 'Full screen';
        this.$.mini.setAttribute('aria-pressed', String(this._minimapShown()));
        this.$.mm.classList.toggle('sde-open', this._minimapShown());
        this.$.propsB.setAttribute('aria-pressed', String(this.propsOpen));
        this.$.props.classList.toggle('sde-open', this.propsOpen);
        var self = this;
        Array.prototype.forEach.call(this.$.toolbox.querySelectorAll('.sde-tool'), function (t) {
            var on = !!(self.armed && self.armed.kind === t.getAttribute('data-kind') && ((self.armed.type === 'place') === (t.getAttribute('data-tool') === 'el')));
            t.setAttribute('aria-pressed', String(on));
            t.disabled = false;
            t.setAttribute('aria-disabled', String(!!ro));
        });
        this._syncCursor();
        var m = this.store.m;
        this.$.count.textContent = m.elements.length + ' shape' + (m.elements.length === 1 ? '' : 's') + ', ' + m.connectors.length + ' connector' + (m.connectors.length === 1 ? '' : 's') + (nSel ? ', ' + nSel + ' selected' : '');
        this._hint();
    };
    P._syncCursor = function () {
        var c = this.$.canvas;
        c.classList.toggle('sde-armed', !!this.armed);
        c.classList.toggle('sde-mode-pan', !this.armed && (this.mode === 'pan' || this._space));
    };
    P._hint = function (text) {
        if (!this.$) return;
        if (text == null) {
            if (this.readOnly) text = 'Read only. You can select, zoom, pan and copy.';
            else if (this.armed && this.armed.type === 'place') text = 'Click on the canvas to place a ' + this.def.elementKinds[this.armed.kind].label.toLowerCase() + '. Esc cancels.';
            else if (this.armed && this.armed.type === 'connect') text = this.armed.from ? 'Now click the shape to connect to. Esc stops connecting.' : 'Click the shape the ' + this.def.connectorKinds[this.armed.kind].label.toLowerCase() + ' starts from. Esc stops connecting.';
            else if (!this.store.m.elements.length) text = 'Empty diagram. Drag a shape from the toolbox onto the canvas, or click a shape and then click the canvas.';
            else text = (this.def.hint ? this.def.hint + ' ' : 'Drag shapes to move them. Drag from a blue dot to connect. Double-click to rename. ') + (this.mode === 'pan' ? 'Drag empty space to pan, Shift-drag to select an area.' : 'Drag empty space to select an area, hold Space to pan.');
        }
        this.$.hint.textContent = text;
    };
    P._say = function (t) { if (this.$ && this.$.live) this.$.live.textContent = t; };
    P._minimapShown = function () {
        if (this.minimapPref === true) return true;
        if (this.minimapPref === false) return false;
        var b = this.bounds(), s = this._size();
        return !b.empty && (b.w * this.view.k > s.w * 1.05 || b.h * this.view.k > s.h * 1.05 || this.store.m.elements.length > 60);
    };
    P.toggleKeys = function () {
        var ex = this.root.querySelector('.sde-keys');
        if (ex) { ex.remove(); return; }
        var rows = [['Drag a toolbox shape', 'Create it where you drop it'], ['Click a toolbox shape, then canvas', 'Create it there'], ['Enter on a toolbox shape', 'Create it in the middle of the view'], ['Drag a blue dot', 'Draw a connector'], ['Tab / Shift+Tab', 'Move between shapes'], ['Arrow keys', 'Move the selection (Shift: 10 steps); pan when nothing is selected'], ['Enter or F2', 'Rename'], ['C', 'Connect from the selected shape: Tab to the target, Enter'], ['Delete', 'Delete the selection'], ['Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y', 'Undo / redo'], ['Ctrl+C / Ctrl+X / Ctrl+V / Ctrl+D', 'Copy / cut / paste / duplicate'], ['Ctrl+A', 'Select everything'], ['+ / - / 0 / 1', 'Zoom in / out / 100% / fit'], ['Space + drag', 'Pan'], ['Shift + drag', 'Select an area'], ['F', 'Full screen'], ['Esc', 'Cancel, clear the selection, leave full screen']];
        var box = h('div', { class: 'sde-keys', role: 'dialog', 'aria-label': 'Keyboard shortcuts' }, '<strong>Keys</strong><table>' + rows.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</table><div class="sde-row"><button type="button" class="sde-btn" data-close>Close</button></div>');
        box.querySelector('[data-close]').addEventListener('click', function () { box.remove(); });
        this.$.canvas.appendChild(box);
    };

    // ---------------------------------------------------------------- arming (toolbox modes)
    P._arm = function (a) {
        this.armed = a;
        this._clearConnectMarks();
        if (a && a.type === 'connect') this._markLegal(a.from, a.kind);
        this._syncChrome();
        this._renderOverlay();
    };
    P.startConnect = function (kind, fromId) {
        if (!this._canEdit()) return;
        if (!kind) { var ks = Object.keys(this.def.connectorKinds); kind = ks[0]; }
        this._arm({ type: 'connect', kind: kind, from: fromId || null });
        if (fromId) this._markLegal(fromId, kind);
    };
    P._markLegal = function (fromId, kind) {
        var self = this;
        this._clearConnectMarks();
        if (!fromId) return;
        this._legalMarks = true;
        this._elDom.forEach(function (g, id) {
            if (id === fromId) { g.classList.add('sde-src'); return; }
            var ok = kind ? canConnect(self.def, self.store, fromId, id, kind).ok : legalConnectorKinds(self.def, self.store, fromId, id).length > 0;
            g.classList.add(ok ? 'sde-legal' : 'sde-illegal');
        });
    };
    P._clearConnectMarks = function () {
        if (!this._legalMarks) return;
        this._legalMarks = false;
        this._elDom.forEach(function (g) { g.classList.remove('sde-legal', 'sde-illegal', 'sde-src'); });
    };
    // Finish a connection: armed kind, the single legal kind, or a chooser when several fit.
    P._finishConnect = function (fromId, toId, kind, fromPort, toPort, clientX, clientY) {
        var self = this;
        var kinds = kind ? [kind] : legalConnectorKinds(this.def, this.store, fromId, toId);
        // 13 Oct 2026 (v1.1): a kind marked offerOnDrag: false (the RBD two-way link) is drawn from its toolbox tool or
        // chosen in the properties panel, so a plain drag does not ask every time; it is still offered when nothing else fits.
        if (!kind && kinds.length > 1) { var offered = kinds.filter(function (k) { return self.def.connectorKinds[k].offerOnDrag !== false; }); if (offered.length) kinds = offered; }
        if (kind) { var r = canConnect(this.def, this.store, fromId, toId, kind); if (!r.ok) { toast(r.reason, 'warning', 3400); this._say(r.reason); return Promise.resolve(null); } }
        if (!kinds.length) {
            var reasons = Object.keys(this.def.connectorKinds).map(function (k) { return canConnect(self.def, self.store, fromId, toId, k).reason; }).filter(Boolean);
            var msg = reasons[0] || 'These shapes cannot be connected.';
            toast(msg, 'warning', 3400); this._say(msg);
            return Promise.resolve(null);
        }
        var extra = { fromPort: fromPort != null ? fromPort : null, toPort: toPort != null ? toPort : null };
        if (kinds.length === 1) return this.connect(fromId, toId, kinds[0], extra);
        return this._chooser(kinds.map(function (k) { return { value: k, label: self.def.connectorKinds[k].label }; }), clientX, clientY, 'Which connector?').then(function (k) { return k ? self.connect(fromId, toId, k, extra) : null; });
    };
    P._chooser = function (items, clientX, clientY, title) {
        var self = this;
        return new Promise(function (resolve) {
            var s = self._size();
            var menu = h('div', { class: 'sde-menu', role: 'menu', 'aria-label': title || 'Choose' });
            menu.innerHTML = items.map(function (it) { return '<button type="button" role="menuitem" data-v="' + esc(it.value) + '">' + esc(it.label) + '</button>'; }).join('') + '<button type="button" role="menuitem" data-v="">Cancel</button>';
            var cx = clientX != null ? clientX - s.left : s.w / 2, cy = clientY != null ? clientY - s.top : s.h / 2;
            menu.style.left = clamp(cx, 4, s.w - 170) + 'px'; menu.style.top = clamp(cy, 4, s.h - 40 * (items.length + 1)) + 'px';
            var done = function (v) { menu.remove(); document.removeEventListener('pointerdown', outside, true); try { self.$.canvas.focus({ preventScroll: true }); } catch (_) {} resolve(v || null); };
            var outside = function (e) { if (!menu.contains(e.target)) done(null); };
            menu.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) done(b.getAttribute('data-v')); });
            menu.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') { e.stopPropagation(); done(null); }
                var bs = Array.prototype.slice.call(menu.querySelectorAll('button')), i = bs.indexOf(document.activeElement);
                if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
                if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
            });
            self.$.canvas.appendChild(menu);
            setTimeout(function () { document.addEventListener('pointerdown', outside, true); var f = menu.querySelector('button'); if (f) f.focus(); }, 0);
            self._menu = menu;
        });
    };

    // ---------------------------------------------------------------- pointer
    P._hitEl = function (target) { var g = target && target.closest && target.closest('.sde-el'); return g ? g.getAttribute('data-id') : null; };
    P._hitCn = function (target) { var g = target && target.closest && target.closest('.sde-cn'); return g ? g.getAttribute('data-id') : null; };
    P._elAt = function (clientX, clientY) {
        var list = document.elementsFromPoint ? document.elementsFromPoint(clientX, clientY) : [document.elementFromPoint(clientX, clientY)];
        for (var i = 0; i < list.length; i++) { var id = this._hitEl(list[i]); if (id) return id; }
        return null;
    };
    P._cnAt = function (clientX, clientY) {
        var list = document.elementsFromPoint ? document.elementsFromPoint(clientX, clientY) : [];
        for (var i = 0; i < list.length; i++) { var id = this._hitCn(list[i]); if (id) return id; }
        return null;
    };
    P._toolDragStart = function (e, kind, btn) {
        var self = this, sx = e.clientX, sy = e.clientY, ghost = null, moved = false;
        var ek = this.def.elementKinds[kind];
        var move = function (ev) {
            if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 5) return;
            if (!moved) {
                moved = true;
                ghost = h('div', { class: 'sde-ghost' }, '<svg width="' + Math.round(ek.w * self.view.k) + '" height="' + Math.round(ek.h * self.view.k) + '" viewBox="-1 -1 ' + (ek.w + 2) + ' ' + (ek.h + 2) + '">' + shapeMarkup(self.def, { id: '', kind: kind, x: 0, y: 0, w: ek.w, h: ek.h, label: '', props: {} }, {}) + '</svg>');
                document.body.appendChild(ghost);
            }
            ghost.style.left = (ev.clientX - ek.w * self.view.k / 2) + 'px'; ghost.style.top = (ev.clientY - ek.h * self.view.k / 2) + 'px';
        };
        var up = function (ev) {
            document.removeEventListener('pointermove', move, true); document.removeEventListener('pointerup', up, true);
            if (ghost) ghost.remove();
            if (!moved) return;   // a plain click: the click handler arms the tool
            self._suppressToolClick = true;
            setTimeout(function () { self._suppressToolClick = false; }, 0);
            var r = self.$.canvas.getBoundingClientRect();
            if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
                var w = self.toWorld(ev.clientX, ev.clientY);
                self.place(kind, w.x, w.y);
                try { self.$.canvas.focus({ preventScroll: true }); } catch (_) {}
            }
        };
        document.addEventListener('pointermove', move, true); document.addEventListener('pointerup', up, true);
    };
    P._onHover = function (e) { if (!this._drag) this._updateHover(e); };
    // The connection dots sit just outside a shape, so the hover holds while the pointer is
    // within a band around the shape (moving from the shape to a dot never loses them).
    P._updateHover = function (e) {
        if (this.readOnly) return;
        var id = this._hitEl(e.target);
        if (!id) {
            var port = e.target.closest && e.target.closest('.sde-port');
            if (port) id = port.getAttribute('data-el');
            else if (this._hoverId) {
                var el = this.store.getEl(this._hoverId), w = this.toWorld(e.clientX, e.clientY), band = 22 / this.view.k;
                if (el && w.x >= el.x - band && w.x <= el.x + el.w + band && w.y >= el.y - band && w.y <= el.y + el.h + band) id = this._hoverId;
            }
        }
        if (id !== this._hoverId) { this._hoverId = id; this._renderOverlay(); }
    };
    P._onDown = function (e) {
        if (this._menu && this._menu.parentNode) return;
        this._checkExternal();
        this._resolveReadOnly();
        try { this.$.canvas.focus({ preventScroll: true }); } catch (_) {}
        var self = this, ro = this.readOnly;
        // pinch: second touch pointer
        this._pointers = this._pointers || new Map();
        if (e.pointerType === 'touch') {
            this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (this._pointers.size === 2) { this._startPinch(); return; }
        }
        if (e.button === 1 || (e.button === 0 && this._space)) { e.preventDefault(); return this._startPan(e); }
        if (e.button !== 0) return;
        var port = e.target.closest && e.target.closest('.sde-port');
        var handle = e.target.closest && e.target.closest('.sde-handle');
        var elId = this._hitEl(e.target), cnId = elId ? null : this._hitCn(e.target);
        var w = this.toWorld(e.clientX, e.clientY);
        if (!ro && port) { e.preventDefault(); return this._startConnectDrag(e, port.getAttribute('data-el'), port.getAttribute('data-port') || null); }
        if (!ro && handle) { e.preventDefault(); return this._startResize(e, handle.getAttribute('data-el'), handle.getAttribute('data-h')); }
        if (!ro && this.armed && this.armed.type === 'place') {
            e.preventDefault();
            var k = this.armed.kind; this._arm(null);
            this.place(k, w.x, w.y);
            return;
        }
        if (!ro && this.armed && this.armed.type === 'connect') {
            e.preventDefault();
            if (!elId) { if (!this.armed.from) toast('Click a shape to start the connector.', 'info', 1800); return; }
            if (!this.armed.from) { this.armed.from = elId; this._markLegal(elId, this.armed.kind); this._syncChrome(); this._renderOverlay(); return; }
            var from = this.armed.from, kind = this.armed.kind;
            this.armed.from = null; this._clearConnectMarks(); this._syncChrome();
            this._finishConnect(from, elId, kind, null, null, e.clientX, e.clientY);
            return;
        }
        if (elId) {
            e.preventDefault();
            var multi = e.shiftKey || e.metaKey || e.ctrlKey;
            if (multi) { if (this.sel.has(elId)) { this.sel.delete(elId); this._syncSel(); this._syncChrome(); this._renderProps(); } else this.select([elId], true); return; }
            if (!this.sel.has(elId)) this.select([elId]);
            this.focusId = elId;
            if (!ro && !this.def.lockPositions && !this.def.autoLayout) this._startMove(e);
            return;
        }
        if (cnId) {
            e.preventDefault();
            if (e.shiftKey || e.metaKey || e.ctrlKey) { if (this.sel.has(cnId)) { this.sel.delete(cnId); this._syncSel(); this._syncChrome(); this._renderProps(); } else this.select([cnId], true); }
            else this.select([cnId]);
            this.focusId = cnId;
            return;
        }
        // empty canvas
        if (e.shiftKey || this.mode === 'select') return this._startMarquee(e);
        if (this.sel.size) this.select([]);
        this._startPan(e);
    };
    P._capture = function (e) { try { this.$.svg.setPointerCapture(e.pointerId); } catch (_) {} };
    P._startPan = function (e) {
        this._capture(e);
        this._drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y };
        this.$.canvas.classList.add('sde-panning');
    };
    P._startPinch = function () {
        var pts = Array.from(this._pointers.values());
        var d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        if (this._drag && this._drag.tx) { this._drag.tx.rollback(); this._markAll(this._drag.tx._final); }
        this._drag = { type: 'pinch', d0: d, k0: this.view.k };
    };
    P._startMove = function (e) {
        this._capture(e);
        var self = this, w = this.toWorld(e.clientX, e.clientY);
        var ids = this._selEls().map(function (el) { return el.id; });
        var start = {}; ids.forEach(function (id) { var el = self.store.getEl(id); start[id] = { x: el.x, y: el.y }; });
        this._drag = { type: 'move', wx: w.x, wy: w.y, ids: ids, start: start, tx: null, moved: false };
    };
    P._startResize = function (e, id, hnd) {
        if (!this._canEdit()) return;
        this._capture(e);
        var el = this.store.getEl(id);
        this._drag = { type: 'resize', id: id, h: hnd, start: { x: el.x, y: el.y, w: el.w, h: el.h }, w0: this.toWorld(e.clientX, e.clientY), tx: this.store.begin('Resize ' + this._nameOf(id)) };
    };
    P._startConnectDrag = function (e, fromId, portId) {
        if (!this._canEdit()) return;
        this._capture(e);
        var ek = this.def.elementKinds[this.store.getEl(fromId).kind];
        var declared = Array.isArray(ek.ports);
        var armedKind = this.armed && this.armed.type === 'connect' ? this.armed.kind : null;
        this._drag = { type: 'connect', from: fromId, port: declared ? portId : null, portVis: portId, kind: armedKind };
        this._markLegal(fromId, armedKind);
    };
    P._startMarquee = function (e) {
        this._capture(e);
        var w = this.toWorld(e.clientX, e.clientY);
        this._drag = { type: 'marquee', x0: w.x, y0: w.y, x1: w.x, y1: w.y, add: e.shiftKey || e.metaKey || e.ctrlKey, base: new Set(this.sel) };
    };
    P._onMove = function (e) {
        if (this._pointers && this._pointers.has(e.pointerId)) this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        var d = this._drag;
        if (!d) { this._updateHover(e); return; }
        var self = this;
        if (d.type === 'pinch') {
            var pts = Array.from(this._pointers.values()); if (pts.length < 2) return;
            var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1, s = this._size();
            this.zoomTo(d.k0 * dist / d.d0, (pts[0].x + pts[1].x) / 2 - s.left, (pts[0].y + pts[1].y) / 2 - s.top);
            return;
        }
        if (d.type === 'pan') { this.setView({ x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }); return; }
        var w = this.toWorld(e.clientX, e.clientY);
        if (d.type === 'move') {
            var dx = w.x - d.wx, dy = w.y - d.wy;
            if (!d.moved && Math.abs(dx) * this.view.k + Math.abs(dy) * this.view.k < 3) return;
            if (!d.moved) { if (!this._canEdit()) { this._drag = null; return; } d.moved = true; d.tx = this.store.begin(d.ids.length === 1 ? 'Move ' + this._nameOf(d.ids[0]) : 'Move ' + d.ids.length + ' shapes'); }
            var lead = d.start[d.ids[0]];
            var nx = this._snapV(lead.x + dx, e.altKey), ny = this._snapV(lead.y + dy, e.altKey);
            var ddx = nx - lead.x, ddy = ny - lead.y;
            d.ids.forEach(function (id) { var s0 = d.start[id]; d.tx.updateElement(id, { x: s0.x + ddx, y: s0.y + ddy }); self._dirty.add(id); });
            this._boundsCache = null;
            this._scheduleRender();
            return;
        }
        if (d.type === 'resize') {
            var s0 = d.start, ek = this.def.elementKinds[this.store.getEl(d.id).kind];
            var ex = w.x - d.w0.x, ey = w.y - d.w0.y, nxx = s0.x, nyy = s0.y, nw = s0.w, nh = s0.h;
            if (d.h.indexOf('e') >= 0) nw = s0.w + ex;
            if (d.h.indexOf('s') >= 0) nh = s0.h + ey;
            if (d.h.indexOf('w') >= 0) { nw = s0.w - ex; nxx = s0.x + ex; }
            if (d.h.indexOf('n') >= 0) { nh = s0.h - ey; nyy = s0.y + ey; }
            nw = Math.max(ek.minW, this._snapV(nw, e.altKey)); nh = Math.max(ek.minH, this._snapV(nh, e.altKey));
            if (ek.aspect === 'lock') { nw = nh = Math.max(nw, nh); }
            if (d.h.indexOf('w') >= 0) nxx = s0.x + s0.w - nw;
            if (d.h.indexOf('n') >= 0) nyy = s0.y + s0.h - nh;
            d.tx.updateElement(d.id, { x: nxx, y: nyy, w: nw, h: nh });
            this._dirty.add(d.id); this._boundsCache = null; this._scheduleRender();
            return;
        }
        if (d.type === 'connect') { d.cur = w; d.client = { x: e.clientX, y: e.clientY }; d.over = this._elAt(e.clientX, e.clientY); this._renderOverlay(); return; }
        if (d.type === 'marquee') {
            d.x1 = w.x; d.y1 = w.y;
            var x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
            var next = new Set(d.add ? d.base : []);
            this.store.m.elements.forEach(function (el) { if (el.x >= x0 && el.y >= y0 && el.x + el.w <= x1 && el.y + el.h <= y1) next.add(el.id); });
            this.store.m.connectors.forEach(function (c) { if (next.has(c.from) && next.has(c.to)) next.add(c.id); });
            this.sel = next; this._syncSel(); this._renderOverlay();
        }
    };
    P._onUp = function (e, cancel) {
        if (this._pointers) this._pointers.delete(e.pointerId);
        var d = this._drag; if (!d) return;
        this._drag = null;
        this.$.canvas.classList.remove('sde-panning');
        try { this.$.svg.releasePointerCapture(e.pointerId); } catch (_) {}
        if (d.type === 'pinch') return;
        if ((d.type === 'move' || d.type === 'resize') && d.tx) {
            if (cancel) { d.tx.rollback(); this._markAll(d.tx._final); this._scheduleRender(); return; }
            try { this._complete(d.tx, 'user'); }
            catch (err) {
                d.tx.rollback(); this._markAll(d.tx._final); this._scheduleRender();
                if (err instanceof RuleError) { toast(err.message, 'warning', 3400); this._say(err.message); } else { try { console.warn('[diagram] change failed', err); } catch (_) {} }
                return;
            }
            this._commit(d.tx.end(), d.tx.label, 'user');
            return;
        }
        if (d.type === 'connect') {
            this._clearConnectMarks();
            var target = cancel ? null : this._elAt(e.clientX, e.clientY);
            this._renderOverlay();
            if (!target) return;
            var tek = this.def.elementKinds[this.store.getEl(target).kind], toPort = null;
            if (Array.isArray(tek.ports)) {
                var w = this.toWorld(e.clientX, e.clientY), tel = this.store.getEl(target), best = Infinity;
                tek.ports.forEach(function (p) { var pp = portPoint(tel, p), dd = Math.hypot(pp.x - w.x, pp.y - w.y); if (dd < best) { best = dd; toPort = p.id; } });
            }
            this._finishConnect(d.from, target, d.kind, d.port, toPort, e.clientX, e.clientY);
            return;
        }
        if (d.type === 'marquee') { this._syncChrome(); this._renderProps(); this._renderOverlay(); this._emit('select', Array.from(this.sel)); }
    };
    P._onWheel = function (e) {
        e.preventDefault();
        var s = this._size();
        var f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
        this.zoomBy(f, e.clientX - s.left, e.clientY - s.top);
    };
    P._onDbl = function (e) {
        // the move drag captures the pointer, so the event target can be the svg itself: hit-test the point
        var id = this._hitEl(e.target) || this._hitCn(e.target) || this._elAt(e.clientX, e.clientY) || this._cnAt(e.clientX, e.clientY);
        if (!id) return;   // double-click on empty canvas does nothing (no hidden create)
        e.preventDefault();
        this.editLabel(id);
    };

    // ---------------------------------------------------------------- inline label editor
    P.editLabel = function (id) {
        if (!this._canEdit()) return;
        var it = this.store.get(id); if (!it) return;
        var isEl = this.store.isEl(id), k = isEl ? this.def.elementKinds[it.kind] : this.def.connectorKinds[it.kind];
        if (k && k.labelEditable === false) { toast('This item has no editable name.', 'info'); return; }
        this._cancelInline();
        this.ensureVisible(id);
        var s = this.view, box;
        if (isEl) box = { x: it.x * s.k + s.x, y: it.y * s.k + s.y, w: Math.max(it.w * s.k, 120), h: Math.max(it.h * s.k, 30) };
        else {
            var a = this.store.getEl(it.from), b = this.store.getEl(it.to);
            var g = a && b ? connectorGeometry(this.def, it, a, b, 0) : { mid: { x: 0, y: 0 } };
            box = { x: g.mid.x * s.k + s.x - 80, y: g.mid.y * s.k + s.y - 16, w: 160, h: 32 };
        }
        var ta = h('textarea', { class: 'sde-inline', 'aria-label': 'Name', rows: '2' });
        ta.value = it.label || '';
        ta.style.left = box.x + 'px'; ta.style.top = box.y + 'px'; ta.style.width = box.w + 'px'; ta.style.height = box.h + 'px';
        var self = this, done = false;
        var finish = function (commit) {
            if (done) return; done = true;
            var v = ta.value; ta.remove(); self._inline = null;
            try { self.$.canvas.focus({ preventScroll: true }); } catch (_) {}
            if (commit) self.rename(id, v.replace(/\s+$/, ''));
        };
        ta.addEventListener('keydown', function (e) {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); }
            else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        });
        ta.addEventListener('blur', function () { finish(true); });
        this.$.canvas.appendChild(ta);
        this._inline = { el: ta, finish: finish };
        ta.focus(); ta.select();
    };
    P._cancelInline = function () { if (this._inline) this._inline.finish(false); };

    // ---------------------------------------------------------------- keyboard
    P._onKey = function (e) {
        var t = e.target, meta = e.metaKey || e.ctrlKey;
        if (isTyping(t)) {
            if (e.key === 'Escape' && this.fullscreen && !this._inline) { e.preventDefault(); e.stopPropagation(); this.toggleFullscreen(false); }
            return;
        }
        if (this.$.toolbox.contains(t) && (e.key === 'Enter' || e.key === ' ')) return;   // the click handler places at view center
        var self = this, k = e.key, handled = true;
        this._checkExternal();
        if (meta && (k === 'z' || k === 'Z') && !e.shiftKey) {
            if (!this.canUndo() && !this._liveUndo()) return;   // nothing here: the app's undo takes over
            this.undo();
        } else if (meta && ((k === 'z' || k === 'Z') && e.shiftKey || k === 'y' || k === 'Y')) {
            if (!this.canRedo() && !this._liveUndo()) return;
            this.redo();
        } else if (meta && (k === 'c' || k === 'C')) this.copy();
        else if (meta && (k === 'x' || k === 'X')) this.cut();
        else if (meta && (k === 'v' || k === 'V')) this.paste();
        else if (meta && (k === 'd' || k === 'D')) this.duplicate();
        else if (meta && (k === 'a' || k === 'A')) this.select(this.store.m.elements.map(function (x) { return x.id; }).concat(this.store.m.connectors.map(function (x) { return x.id; })));
        else if (meta) return;
        else if (k === 'Escape') {
            if (this._drag) { var d = this._drag; this._drag = null; if (d.tx) { d.tx.rollback(); this._markAll(d.tx._final); } this._clearConnectMarks(); this._renderOverlay(); this._scheduleRender(); }
            else if (this.armed) this._arm(null);
            else if (this.root.querySelector('.sde-keys')) this.root.querySelector('.sde-keys').remove();
            else if (this.sel.size) this.select([]);
            else if (this.fullscreen) this.toggleFullscreen(false);
            else handled = false;
        }
        else if (k === 'Tab') {
            if (!this.$.canvas.contains(t)) return;
            handled = this._tabFocus(e.shiftKey ? -1 : 1);
        }
        else if (k === 'Delete' || k === 'Backspace') this.deleteSelection();
        else if (k === 'Enter' || k === 'F2') {
            if (this.armed && this.armed.type === 'connect' && this.armed.from && this.focusId && this.store.isEl(this.focusId)) {
                var from = this.armed.from, kind = this.armed.kind; this._arm(null);
                this._finishConnect(from, this.focusId, kind);
            } else if (this.focusId) this.editLabel(this.focusId);
            else handled = false;
        }
        else if (k === 'c' || k === 'C') {
            var src = this.focusId && this.store.isEl(this.focusId) ? this.focusId : null;
            if (!src) { toast('Select the shape to connect from first.', 'info'); }
            else if (this._canEdit()) { var ks = Object.keys(this.def.connectorKinds).filter(function (ck) { return !self.def.connectorKinds[ck].hidden; }); this._arm({ type: 'connect', kind: ks.length === 1 ? ks[0] : null, from: src }); this._markLegal(src, this.armed.kind); this._say('Connecting from ' + this._nameOf(src) + '. Tab to the target and press Enter.'); }
        }
        else if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
            var step = (e.shiftKey ? 10 : 1) * (this.snap ? this.grid : 1);
            var dx = k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0, dy = k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0;
            var els = this._selEls();
            if (els.length && !this.readOnly && !this.def.lockPositions && !this.def.autoLayout) {
                this.change(els.length === 1 ? 'Move ' + this._nameOf(els[0].id) : 'Move ' + els.length + ' shapes', function (tx) { els.forEach(function (el) { tx.updateElement(el.id, { x: el.x + dx, y: el.y + dy }); }); })
                    .then(function () { if (els.length === 1) self.ensureVisible(els[0].id); });
            } else this.panBy(-dx * 4, -dy * 4);
        }
        else if (k === '+' || k === '=') this.zoomBy(1.25);
        else if (k === '-' || k === '_') this.zoomBy(0.8);
        else if (k === '0') this.zoomTo(1);
        else if (k === '1') this.fit();
        else if (k === 'f' || k === 'F') this.toggleFullscreen();
        else if (k === '?') this.toggleKeys();
        else if (k === ' ') { this._space = true; this._syncCursor(); }
        else handled = false;
        if (handled) { e.preventDefault(); e.stopPropagation(); }
    };
    P._tabFocus = function (dir) {
        var list = this.store.m.elements.slice().sort(function (a, b) { return (a.y - b.y) || (a.x - b.x); }).map(function (x) { return x.id; });
        if (!list.length) return false;
        var i = this.focusId ? list.indexOf(this.focusId) : -1;
        var j = i + dir;
        if (i === -1) j = dir > 0 ? 0 : list.length - 1;
        if (j < 0 || j >= list.length) { this.focusId = null; this._syncSel(); return false; }   // let Tab leave the canvas at the ends
        this.focusId = list[j];
        if (!(this.armed && this.armed.type === 'connect')) this.select([list[j]]);
        else { this._syncSel(); this._say(this._nameOf(list[j]) + '. Press Enter to connect.'); }
        this.ensureVisible(list[j]);
        return true;
    };

    // ---------------------------------------------------------------- properties panel
    P._renderProps = function () {
        if (!this.$ || !this.$.props) return;
        var p = this.$.props, self = this, ro = this.readOnly, dis = ro ? ' disabled' : '';
        if (p.contains(document.activeElement) && document.activeElement.tagName !== 'BUTTON') return;   // do not rebuild under the user's typing
        var ids = Array.from(this.sel), html = '';
        if (ids.length === 1 && this.store.get(ids[0])) {
            var it = this.store.get(ids[0]), isEl = this.store.isEl(it.id);
            var k = (isEl ? this.def.elementKinds : this.def.connectorKinds)[it.kind] || { label: it.kind };
            html += '<h3>' + esc(k.label) + '</h3>';
            if (k.labelEditable !== false) html += '<label for="' + this.prefix + '-f-label">Name</label><textarea id="' + this.prefix + '-f-label" rows="2" data-key="label"' + dis + '>' + esc(it.label) + '</textarea>';
            if (!isEl) {
                var a = this.store.getEl(it.from), b = this.store.getEl(it.to);
                html += '<label>From</label><div>' + esc(a ? this._nameOf(a.id) : '(missing)') + '</div><label>To</label><div>' + esc(b ? this._nameOf(b.id) : '(missing)') + '</div>';
                var kinds = Object.keys(this.def.connectorKinds).filter(function (ck) { return ck === it.kind || canConnect(self.def, self.store, it.from, it.to, ck, { ignoreId: it.id }).ok; });
                if (kinds.length > 1) html += '<label for="' + this.prefix + '-f-kind">Connector type</label><select id="' + this.prefix + '-f-kind" data-key="kind"' + dis + '>' + kinds.map(function (ck) { return '<option value="' + esc(ck) + '"' + (ck === it.kind ? ' selected' : '') + '>' + esc(self.def.connectorKinds[ck].label) + '</option>'; }).join('') + '</select>';
            }
            html += this._fieldsHtml(it, isEl, k, dis);
            if (isEl) html += '<label>Position and size</label><div class="sde-ro-val">x ' + Math.round(it.x) + ', y ' + Math.round(it.y) + ', ' + Math.round(it.w) + ' by ' + Math.round(it.h) + '</div>';
            if (k.sysmlLinkable === false || this.def.sysmlLinkable === false) {
                if (it.sysmlRef) html += '<label>Model element</label><div class="sde-ro-val" data-sysml>' + esc(this._describeRef(it.sysmlRef)) + '</div><div class="sde-help">This shape is this model element itself.</div>';
            } else {
                html += '<label>Model element</label>';
                if (it.sysmlRef) html += '<div class="sde-ro-val" data-sysml>' + esc(this._describeRef(it.sysmlRef)) + '</div>';
                else html += '<div class="sde-help">Not linked to a model element yet.</div>';
                html += '<div class="sde-row"><button type="button" class="sde-btn" data-pact="link"' + dis + '>' + (it.sysmlRef ? 'Change link' : 'Link to model element') + '</button>' + (it.sysmlRef ? '<button type="button" class="sde-btn" data-pact="unlink"' + dis + '>Unlink</button>' + (_sysml && _sysml.open ? '<button type="button" class="sde-btn" data-pact="open">Open</button>' : '') : '') + '</div>';
            }
            html += '<label>Element ID (SysML v2)</label><div class="sde-ro-val">' + esc(it.id) + '</div>';
            if (!ro) html += '<div class="sde-row"><button type="button" class="sde-btn" data-pact="delete">Delete</button>' + (isEl ? '<button type="button" class="sde-btn" data-pact="connect">Connect from here</button>' : '') + '</div>';
        } else if (ids.length > 1) {
            html += '<h3>' + ids.length + ' items selected</h3>';
            if (!ro) html += '<div class="sde-row"><button type="button" class="sde-btn" data-pact="align-left">Align left</button><button type="button" class="sde-btn" data-pact="align-top">Align top</button><button type="button" class="sde-btn" data-pact="align-hspace">Space across</button><button type="button" class="sde-btn" data-pact="delete">Delete all</button></div>';
        } else {
            html += '<h3>' + esc(this.def.title || this.def.type) + '</h3><div class="sde-help">Select a shape or connector to see and edit its properties.</div>';
            var m = this.store.m;
            html += '<label>Contents</label><div>' + m.elements.length + ' shapes, ' + m.connectors.length + ' connectors</div>';
            var issues = validateModel(this.def, this.store);
            if (issues.length) html += '<label>Checks</label>' + issues.slice(0, 30).map(function (i) { return '<div class="sde-issue"' + (i.id ? ' data-issue="' + esc(i.id) + '"' : '') + '>' + esc(i.message) + '</div>'; }).join('');
        }
        if (typeof this.def.panel === 'function') { try { var extra = this.def.panel(ids.length === 1 ? clone(this.store.get(ids[0])) : null, { editor: this, readOnly: ro }); if (extra) html += '<div class="sde-custom">' + extra + '</div>'; } catch (_) {} }
        p.innerHTML = html;
    };
    P._fields = function (it, isEl, k) {
        var f = null;
        if (typeof this.def.fields === 'function') { try { f = this.def.fields(clone(it), { editor: this, isElement: isEl }); } catch (_) {} }
        if (!f && Array.isArray(k.fields)) f = k.fields;
        return f || [];
    };
    P._fieldsHtml = function (it, isEl, k, dis) {
        var self = this;
        return this._fields(it, isEl, k).map(function (f, i) {
            var id = self.prefix + '-f' + i, v = getPath(it, f.key), d = (dis || f.readOnly) ? ' disabled' : '';
            var lab = '<label for="' + id + '">' + esc(f.label || f.key) + '</label>';
            var help = f.help ? '<div class="sde-help">' + esc(f.help) + '</div>' : '';
            if (f.type === 'select') return lab + '<select id="' + id + '" data-key="' + esc(f.key) + '" data-type="select"' + d + '>' + (f.options || []).map(function (o) { var ov = typeof o === 'object' ? o.value : o, ol = typeof o === 'object' ? o.label : o; return '<option value="' + esc(ov) + '"' + (String(ov) === String(v) ? ' selected' : '') + '>' + esc(ol) + '</option>'; }).join('') + '</select>' + help;
            if (f.type === 'checkbox') return '<label><input id="' + id + '" type="checkbox" data-key="' + esc(f.key) + '" data-type="checkbox"' + (v ? ' checked' : '') + d + '> ' + esc(f.label || f.key) + '</label>' + help;
            if (f.type === 'textarea') return lab + '<textarea id="' + id + '" rows="3" data-key="' + esc(f.key) + '"' + d + '>' + esc(v == null ? '' : v) + '</textarea>' + help;
            if (f.type === 'number') return lab + '<input id="' + id + '" type="text" inputmode="decimal" data-key="' + esc(f.key) + '" data-type="number" value="' + esc(v == null ? '' : v) + '"' + d + '>' + help;
            return lab + '<input id="' + id + '" type="text" data-key="' + esc(f.key) + '" value="' + esc(v == null ? '' : v) + '"' + d + '>' + help;
        }).join('');
    };
    function getPath(o, key) { var parts = String(key).split('.'), v = o; for (var i = 0; i < parts.length; i++) { if (v == null) return undefined; v = v[parts[i]]; } return v; }
    function patchFor(key, value) {
        var parts = String(key).split('.');
        if (parts.length === 1) { var p = {}; p[key] = value; return p; }
        if (parts[0] === 'props') { var pp = {}; pp[parts.slice(1).join('.')] = value; return { props: pp }; }
        var q = {}; q[parts[0]] = value; return q;
    }
    P._onPropInput = function (e) {
        var inp = e.target, key = inp.getAttribute('data-key'); if (!key) return;
        var ids = Array.from(this.sel); if (ids.length !== 1) return;
        var id = ids[0], it = this.store.get(id); if (!it) return;
        var type = inp.getAttribute('data-type'), v;
        if (type === 'checkbox') v = !!inp.checked;
        else if (type === 'number') {
            var raw = String(inp.value).trim();
            if (raw === '') v = undefined;
            else { v = Number(raw); if (!isFinite(v)) { toast('Enter a number (for example 1e-5).', 'warning'); inp.value = getPath(it, key) == null ? '' : getPath(it, key); return; } }
        } else v = inp.value;
        var self = this, f = this._fields(it, this.store.isEl(id), (this.store.isEl(id) ? this.def.elementKinds : this.def.connectorKinds)[it.kind] || {}).filter(function (x) { return x.key === key; })[0];
        if (f && typeof f.validate === 'function') { var msg = f.validate(v, clone(it)); if (typeof msg === 'string' && msg) { toast(msg, 'warning'); inp.value = getPath(it, key) == null ? '' : getPath(it, key); return; } }
        var label = key === 'label' ? 'Rename ' + this._nameOf(id) : key === 'kind' ? 'Change connector type' : 'Edit ' + ((f && f.label) || key).toLowerCase();
        try { inp.blur(); } catch (_) {}
        // 13 Oct 2026 (v1.1): a field may apply itself (f.apply(tx, value, item)) so one edit can update several
        // items in ONE undo step (an RBD repeated block keeps every copy's failure rate equal).
        var applyFn = f && typeof f.apply === 'function' ? f.apply : null;
        this.change(label, function (tx) { if (applyFn) applyFn(tx, v, clone(it)); else tx.update(id, patchFor(key, v)); }).then(function () { self._renderProps(); });
    };
    P._describeRef = function (ref) {
        if (_sysml && typeof _sysml.describe === 'function') { try { var d = _sysml.describe(ref); if (d) return d; } catch (_) {} }
        return ref.qualifiedName || ref.name || ref.id || 'linked';
    };
    P.linkSysml = function (id, ref) {
        var self = this;
        return this.change(ref ? 'Link ' + this._nameOf(id) + ' to the model' : 'Unlink ' + this._nameOf(id), function (tx) { tx.update(id, { sysmlRef: ref ? clone(ref) : undefined }); }).then(function (ok) { self._renderProps(); return ok; });
    };
    P._propAction = function (act) {
        var self = this, ids = Array.from(this.sel), id = ids[0];
        if (act === 'delete') return this.deleteSelection();
        if (act.indexOf('align-') === 0) return this.align(act.slice(6));
        if (act === 'connect') return this.startConnect(null, id);
        if (act === 'unlink') return this.linkSysml(id, null);
        if (act === 'open') { try { _sysml.open(this.store.get(id).sysmlRef, { editor: this }); } catch (_) {} return; }
        if (['delete', 'connect', 'unlink', 'link', 'open'].indexOf(act) < 0 && act.indexOf('align-') !== 0) {
            if (typeof this.def.panelAction === 'function') { try { return this.def.panelAction(act, ids.length === 1 ? clone(this.store.get(id)) : null, { editor: this, selection: ids.slice() }); } catch (e) { toast('That action failed: ' + (e && e.message || e), 'error'); } }
            return;
        }
        if (act === 'link') {
            if (!this._canEdit()) return;
            var it = clone(this.store.get(id));
            var pick = (_sysml && typeof _sysml.pick === 'function')
                ? Promise.resolve(_sysml.pick(it, { editor: this, diagram: this.type, kind: it.kind }))
                : (typeof root.slPrompt === 'function'
                    ? Promise.resolve(root.slPrompt('Qualified name of the SysML v2 element this represents (for example Aircraft::Hydraulics::Pump).', it.sysmlRef && it.sysmlRef.qualifiedName || '', { title: 'Link to model element' })).then(function (q) { q = q && String(q).trim(); return q ? { qualifiedName: q } : null; })
                    : Promise.resolve(null));
            return pick.then(function (ref) { if (ref) return self.linkSysml(id, ref); });
        }
    };
    // The identity a SysML v2 exporter uses for an item of this diagram.
    P.sysmlIdentity = function (id) {
        var it = this.store.get(id); if (!it) return null;
        var isEl = this.store.isEl(id), k = (isEl ? this.def.elementKinds : this.def.connectorKinds)[it.kind] || {};
        return { elementId: it.id, declaredName: it.label || '', kind: it.kind, sysmlType: k.sysmlType || null, ref: it.sysmlRef ? clone(it.sysmlRef) : null, diagram: this.type };
    };

    // ---------------------------------------------------------------- render
    P._scheduleRender = function () {
        var self = this;
        if (this._raf) return;
        if (typeof requestAnimationFrame !== 'function') { this.render(); return; }
        this._raf = requestAnimationFrame(function () { self._raf = null; self.render(); });
    };
    P.render = function () {
        if (this._destroyed) return;
        if (this._raf) { try { cancelAnimationFrame(this._raf); } catch (_) {} this._raf = null; }
        var self = this, def = this.def, m = this.store.m, s = this._size(), k = this.view.k;
        this.$.vp.setAttribute('transform', 'translate(' + this.view.x + ',' + this.view.y + ') scale(' + k + ')');
        var margin = 120 / k;
        var vx0 = -this.view.x / k - margin, vy0 = -this.view.y / k - margin, vx1 = vx0 + s.w / k + margin * 2, vy1 = vy0 + s.h / k + margin * 2;
        var lod = k < 0.35;
        this.$.svg.classList.toggle('sde-lod', lod);
        var all = this._dirtyAll; this._dirtyAll = false;
        var dirty = this._dirty; this._dirty = new Set();
        var visible = new Set();
        var gel = this.$.gel, gcn = this.$.gcn;
        for (var i = 0; i < m.elements.length; i++) {
            var e = m.elements[i];
            if (e.x + e.w < vx0 || e.x > vx1 || e.y + e.h < vy0 || e.y > vy1) continue;
            visible.add(e.id);
            var g = this._elDom.get(e.id);
            if (!g) { g = svgEl('g', { class: 'sde-el', 'data-id': e.id }); this._elDom.set(e.id, g); g._lod = null; dirty.add(e.id); }
            if (typeof def.elementClass === 'function') { var xc = ''; try { xc = def.elementClass(e, { editor: this }) || ''; } catch (_) {} if (g._xc !== xc) { g.setAttribute('class', 'sde-el' + (xc ? ' ' + xc : '')); g._xc = xc; } }
            if (all || dirty.has(e.id) || g._lod !== lod) {
                g.setAttribute('transform', 'translate(' + e.x + ',' + e.y + ')');
                g.setAttribute('data-kind', e.kind);
                var lek = def.elementKinds[e.kind] || {};
                g.innerHTML = (lod ? (lek.lodShape === true ? shapeMarkup(def, e, { editor: this, readOnly: this.readOnly, lod: true, model: m }) : typeof lek.lodShape === 'function' ? String(lek.lodShape(e) || '') : '<rect class="sde-shape" width="' + e.w + '" height="' + e.h + '" fill="var(--sde-fill)" stroke="var(--sde-stroke)"/>') : shapeMarkup(def, e, { editor: this, readOnly: this.readOnly, model: m }) + labelMarkup(def, e)) +
                    '<rect class="sde-focusring" x="-5" y="-5" width="' + (e.w + 10) + '" height="' + (e.h + 10) + '" rx="4"/>' +
                    '<title>' + esc(this._nameOf(e.id)) + '</title>';
                g._lod = lod;
            }
            if (g.parentNode !== gel) gel.appendChild(g);
        }
        this._elDom.forEach(function (g, id) { if (!visible.has(id)) { g.remove(); self._elDom.delete(id); } });
        // connectors
        var bends = bendMap(m.connectors), cvis = new Set();
        for (var j = 0; j < m.connectors.length; j++) {
            var c = m.connectors[j], a = this.store.getEl(c.from), b = this.store.getEl(c.to);
            if (!a || !b) continue;
            if (!visible.has(a.id) && !visible.has(b.id)) {
                var bx0 = Math.min(a.x, b.x), bx1 = Math.max(a.x + a.w, b.x + b.w), by0 = Math.min(a.y, b.y), by1 = Math.max(a.y + a.h, b.y + b.h);
                if (bx1 < vx0 || bx0 > vx1 || by1 < vy0 || by0 > vy1) continue;
            }
            cvis.add(c.id);
            var cg = this._cnDom.get(c.id);
            if (!cg) { cg = svgEl('g', { class: 'sde-cn', 'data-id': c.id }); this._cnDom.set(c.id, cg); cg._key = null; }
            var key = (bends[c.id] || 0) + '|' + (lod ? 1 : 0);
            if (all || cg._key !== key || dirty.has(c.id) || dirty.has(a.id) || dirty.has(b.id) || dirty.has('pair:' + a.id) || dirty.has('pair:' + b.id)) {
                var geo = connectorGeometry(def, c, a, b, bends[c.id] || 0);
                cg.setAttribute('data-kind', c.kind);
                cg.innerHTML = connectorMarkup(def, c, geo, this.prefix) + '<title>' + esc(this._nameOf(c.id)) + '</title>';
                cg._key = key;
            }
            if (typeof def.connectorClass === 'function') { var xcc = ''; try { xcc = def.connectorClass(c, { editor: this }) || ''; } catch (_) {} if (cg._xc !== xcc) { cg.setAttribute('class', 'sde-cn' + (xcc ? ' ' + xcc : '')); cg._xc = xcc; } }
            if (cg.parentNode !== gcn) gcn.appendChild(cg);
        }
        this._cnDom.forEach(function (g, id) { if (!cvis.has(id)) { g.remove(); self._cnDom.delete(id); } });
        if (this.$.gdeco) {
            var deco = '';
            if (typeof def.decorate === 'function') { try { deco = def.decorate(m, { editor: this, lod: lod, k: k }) || ''; } catch (err) { try { console.warn('[diagram] decorate failed', err); } catch (_) {} } }
            if (this._decoHtml !== deco) { this.$.gdeco.innerHTML = deco; this._decoHtml = deco; }
        }
        this._syncSel();
        if (this.armed && this.armed.type === 'connect' && this.armed.from) this._markLegal(this.armed.from, this.armed.kind);
        this._renderOverlay();
        this._drawMinimap();
        this.$.zoomLbl.textContent = Math.round(k * 100) + '%';
        if (this.$.mm) this.$.mm.classList.toggle('sde-open', this._minimapShown());
    };
    P._syncSel = function () {
        var self = this;
        this._elDom.forEach(function (g, id) { g.classList.toggle('sde-sel', self.sel.has(id)); g.classList.toggle('sde-focus', self.focusId === id); });
        this._cnDom.forEach(function (g, id) { g.classList.toggle('sde-sel', self.sel.has(id)); g.classList.toggle('sde-focus', self.focusId === id); });
        this._renderOverlay();
    };
    // Overlay: resize handles on the single selected shape, connection dots on hover and on the
    // selected shape, the rubber band while connecting, the marquee box.
    P._renderOverlay = function () {
        if (!this.$) return;
        var self = this, ov = this.$.gov, out = '', k = this.view.k, r = 5 / k, d = this._drag;
        if (!this.readOnly) {
            var sels = this._selEls();
            if (sels.length === 1) {
                var e = sels[0], ek = this.def.elementKinds[e.kind] || {};
                if (ek.resizable && !this.def.lockPositions && !this.def.autoLayout) {
                    var hs = ek.aspect === 'lock' ? ['nw', 'ne', 'sw', 'se'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
                    hs.forEach(function (hn) {
                        var hx = e.x + (hn.indexOf('w') >= 0 ? 0 : hn.indexOf('e') >= 0 ? e.w : e.w / 2), hy = e.y + (hn.indexOf('n') >= 0 ? 0 : hn.indexOf('s') >= 0 ? e.h : e.h / 2);
                        out += '<rect class="sde-handle" data-el="' + esc(e.id) + '" data-h="' + hn + '" x="' + (hx - r) + '" y="' + (hy - r) + '" width="' + 2 * r + '" height="' + 2 * r + '" style="cursor:' + hn + '-resize"/>';
                    });
                }
            }
            var portIds = {};
            if (this._hoverId && this.store.getEl(this._hoverId)) portIds[this._hoverId] = 1;
            if (sels.length === 1) portIds[sels[0].id] = 1;
            if (d && d.type === 'connect' && d.over) portIds[d.over] = 1;
            if (Object.keys(this.def.connectorKinds).length && !(d && (d.type === 'move' || d.type === 'resize'))) {
                Object.keys(portIds).forEach(function (id) {
                    var el = self.store.getEl(id); if (!el) return;
                    var ek2 = self.def.elementKinds[el.kind] || {};
                    kindPorts(ek2).forEach(function (p) {
                        var pp = portPoint(el, p), off = 9 / k;
                        var px = pp.x + (pp.dir === 'e' ? off : pp.dir === 'w' ? -off : 0), py = pp.y + (pp.dir === 's' ? off : pp.dir === 'n' ? -off : 0);
                        out += '<circle class="sde-port" data-el="' + esc(id) + '" data-port="' + esc(p.id) + '" cx="' + px + '" cy="' + py + '" r="' + (5.5 / k) + '"><title>Drag to connect' + (p.label ? ' (' + esc(p.label) + ')' : '') + '</title></circle>';
                    });
                });
            }
            if (d && d.type === 'connect' && d.cur) {
                var src = this.store.getEl(d.from);
                if (src) {
                    var sp = d.portVis != null ? (function () { var p = kindPorts(self.def.elementKinds[src.kind] || {}).filter(function (q) { return q.id === d.portVis; })[0]; return p ? portPoint(src, p) : center(src); })() : center(src);
                    out += '<path class="sde-rubber" d="M' + sp.x + ',' + sp.y + ' L' + d.cur.x + ',' + d.cur.y + '" stroke-width="' + 1.5 / k + '"/>';
                }
            }
        }
        if (d && d.type === 'marquee') {
            out += '<rect class="sde-marquee" x="' + Math.min(d.x0, d.x1) + '" y="' + Math.min(d.y0, d.y1) + '" width="' + Math.abs(d.x1 - d.x0) + '" height="' + Math.abs(d.y1 - d.y0) + '" stroke-width="' + 1 / k + '"/>';
        }
        ov.innerHTML = out;
    };
    P._drawMinimap = function () {
        var cvs = this.$.mm; if (!cvs || !this._minimapShown()) return;
        var ctx = cvs.getContext && cvs.getContext('2d'); if (!ctx) return;
        var W = cvs.width, H = cvs.height, b = this.bounds(), s = this._size();
        ctx.clearRect(0, 0, W, H);
        if (b.empty) return;
        var vw = { x: -this.view.x / this.view.k, y: -this.view.y / this.view.k, w: s.w / this.view.k, h: s.h / this.view.k };
        var x0 = Math.min(b.x, vw.x), y0 = Math.min(b.y, vw.y), x1 = Math.max(b.x + b.w, vw.x + vw.w), y1 = Math.max(b.y + b.h, vw.y + vw.h);
        var sc = Math.min((W - 12) / (x1 - x0 || 1), (H - 12) / (y1 - y0 || 1));
        var ox = 6 - x0 * sc + ((W - 12) - (x1 - x0) * sc) / 2, oy = 6 - y0 * sc + ((H - 12) - (y1 - y0) * sc) / 2;
        this._mmT = { sc: sc, ox: ox, oy: oy };
        var st = getComputedStyle(this.root);
        ctx.fillStyle = (st.getPropertyValue('--sde-line') || '#4a5260').trim() || '#4a5260';
        ctx.globalAlpha = 0.55;
        var els = this.store.m.elements;
        for (var i = 0; i < els.length; i++) { var e = els[i]; ctx.fillRect(ox + e.x * sc, oy + e.y * sc, Math.max(1.5, e.w * sc), Math.max(1.5, e.h * sc)); }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = (st.getPropertyValue('--sde-accent') || '#1A6EF2').trim() || '#1A6EF2';
        ctx.lineWidth = 2;
        ctx.strokeRect(ox + vw.x * sc, oy + vw.y * sc, vw.w * sc, vw.h * sc);
    };
    P._mmTo = function (e) {
        if (!this._mmT) return;
        var r = this.$.mm.getBoundingClientRect(), fx = this.$.mm.width / r.width, fy = this.$.mm.height / r.height;
        var wx = ((e.clientX - r.left) * fx - this._mmT.ox) / this._mmT.sc, wy = ((e.clientY - r.top) * fy - this._mmT.oy) / this._mmT.sc;
        var s = this._size();
        this.setView({ x: s.w / 2 - wx * this.view.k, y: s.h / 2 - wy * this.view.k });
    };
    // A standalone SVG of the WHOLE diagram (not only what is on screen), for exports and reports.
    P.toSvg = function (opt) {
        opt = opt || {};
        var def = this.def, m = this.store.m, b = this.bounds(), pad = 20, self = this;
        if (b.empty) b = { x: 0, y: 0, w: 100, h: 60 };
        var bends = bendMap(m.connectors), body = '';
        m.connectors.forEach(function (c) { var a = self.store.getEl(c.from), bb = self.store.getEl(c.to); if (a && bb) body += '<g class="sde-cn">' + connectorMarkup(def, c, connectorGeometry(def, c, a, bb, bends[c.id] || 0), 'x' + self.prefix) + '</g>'; });
        if (typeof def.decorate === 'function') { try { body += def.decorate(m, { editor: this, export: true, k: 1 }) || ''; } catch (_) {} }
        m.elements.forEach(function (e) { body += '<g transform="translate(' + e.x + ',' + e.y + ')">' + shapeMarkup(def, e, { export: true, model: m }) + labelMarkup(def, e) + '</g>'; });
        var vars = '--sde-fill:#fff;--sde-stroke:#14171c;--sde-line:#4a5260;--sde-bg:#fff;--sde-border:#c7ccd4';
        return '<svg xmlns="' + SVGNS + '" viewBox="' + (b.x - pad) + ' ' + (b.y - pad) + ' ' + (b.w + pad * 2) + ' ' + (b.h + pad * 2) + '" width="' + Math.round(b.w + pad * 2) + '" height="' + Math.round(b.h + pad * 2) + '" style="' + vars + ';font-family:system-ui,sans-serif;color:#14171c">' +
            '<style>.sde-hit{display:none}.sde-label,.sde-clabel text{fill:#14171c}.sde-clabel rect{fill:#fff;stroke:#c7ccd4}</style><defs>' + markerDefs(def, 'x' + this.prefix) + '</defs>' + body + '</svg>';
    };
    P.validate = function () { return validateModel(this.def, this.store); };
    // 13 Oct 2026 (v1.1): redraw every visible shape on the next frame. For notations whose shapes depend on
    // OTHER items (a k-out-of-n node showing its n, a repeated block marked in every place): call it from
    // afterChange or after a reload. Shape functions receive ctx.model (the whole model) for that.
    P.refreshShapes = function () { this._dirtyAll = true; this._scheduleRender(); };
    // Rebuild every visible item (derived state such as a highlight changed; the model did not).
    P.refresh = function () { this._dirtyAll = true; this._renderProps(); this.render(); };
    P.destroy = function () {
        this._destroyed = true;
        try { if (this._ro) this._ro.disconnect(); } catch (_) {}
        try { document.removeEventListener('keydown', this._docKey, true); } catch (_) {}
        try { if (this.fullscreen) document.documentElement.style.overflow = ''; } catch (_) {}
        try { if (this.opts.lockKey && this._lockClaimed && root.SLLocks && root.SLLocks.release) root.SLLocks.release(this.opts.lockKey); } catch (_) {}
        try { this.root.remove(); } catch (_) {}
        var i = _instances.indexOf(this); if (i >= 0) _instances.splice(i, 1);
    };

    function mount(container, opts) {
        if (typeof container === 'string') container = document.querySelector(container);
        if (!container) throw new Error('SLDiagramEditor.mount: no container.');
        return new Editor(container, opts || {});
    }

    var api = {
        positionOnly: positionOnly, deferKind: deferKind,   // 13 Oct 2026 (night): which changes are collected, not asked one by one
        version: VERSION,
        register: register,
        getDiagram: getDiagram,
        types: function () { return Object.keys(_defs); },
        mount: mount,
        instances: function () { return _instances.slice(); },
        onBeforeChange: function (fn) { _hooks.before.push(fn); return function () { _hooks.before = _hooks.before.filter(function (f) { return f !== fn; }); }; },
        onAfterChange: function (fn) { _hooks.after.push(fn); return function () { _hooks.after = _hooks.after.filter(function (f) { return f !== fn; }); }; },
        setSysmlProvider: function (p) { _sysml = p || null; },
        getSysmlProvider: function () { return _sysml; },
        RuleError: RuleError,
        shapes: shapes,
        layouts: { layered: layoutLayered, grid: layoutGrid },
        uuid: uuid,
        esc: esc,
        // the pure core, for tests and for diagrams that edit without the view
        core: {
            normalize: normalize, Store: Store, Tx: Tx, History: History, RuleError: RuleError,
            canConnect: canConnect, legalConnectorKinds: legalConnectorKinds,
            makeChange: makeChange, summarize: summarize, invertOps: invertOps, runBefore: runBefore,
            alignPositions: alignPositions, copyPayload: copyPayload, pastePayload: pastePayload,
            validate: validateModel, bendMap: bendMap, connectorGeometry: connectorGeometry, boundaryPoint: boundaryPoint, wrapLines: wrapLines,
            normDef: _normDef, unregister: function (type) { delete _defs[type]; }
        }
    };
    root.SLDiagramEditor = api;
    if (typeof globalThis !== 'undefined') globalThis.SLDiagramEditor = api;
})(typeof window !== 'undefined' ? window : globalThis);
