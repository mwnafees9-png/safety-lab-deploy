/* ============================================================================
 * fn_resolver.js — v1.0 — SLFnResolve: one classifier for "what is this id?".
 * ----------------------------------------------------------------------------
 * B6 (21 Aug 2026). MAC clause members — and, with A10, interdependence
 * columns — are SYSTEM FUNCTIONS, never bare systems. ARP4761A Table Q.4-1
 * columns are the system WITH its function; a system performs several
 * functions with different minimums, so a system-level member cannot express
 * a floor (see mac_lanes.js validateMembers, which this module finally feeds).
 *
 * This is the resolver mac_lanes.js was designed to be handed and never was:
 *   resolve(id) -> { kind: 'function' | 'system' | 'item' | 'unknown',
 *                    label, systemId?, funcId?, funcName? }
 * classified against the live project state:
 *   · systemsData[].functions[].funcId  -> 'function'  (label "System · Function")
 *   · systemsData[].id                  -> 'system'
 *   · itemsData[].itemId / internalId   -> 'item'      (system-level MAC providers)
 *
 * READS STATE LAZILY through SLEnv (top-level `let` is not on window — rule 5;
 * this module is a separate closure and cannot see the app's lexical globals).
 * Pure classification: no DOM, no storage, no side effects. Node tests inject
 * data via _setData(). Exposed as window.SLFnResolve and module.exports.
 * ==========================================================================*/
(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.SLFnResolve = api;
}(this, function () {
    'use strict';

    var _injected = null;   // tests only — _setData({ systems, items })

    function _g(name) {
        try {
            if (typeof window !== 'undefined' && window.SLEnv && typeof SLEnv.get === 'function') return SLEnv.get(name);
        } catch (_) {}
        return undefined;
    }
    function _data() {
        if (_injected) return _injected;
        return { systems: _g('systemsData') || [], items: _g('itemsData') || [] };
    }

    function resolve(id) {
        if (id == null || id === '') return { kind: 'unknown', label: String(id || '') };
        var d = _data(), sid = String(id);
        for (var i = 0; i < d.systems.length; i++) {
            var s = d.systems[i] || {};
            var fns = s.functions || [];
            for (var j = 0; j < fns.length; j++) {
                var f = fns[j] || {};
                if (String(f.funcId) === sid) {
                    return { kind: 'function', systemId: s.id, funcId: f.funcId,
                             funcName: f.funcName || f.funcId,
                             label: (s.name || s.id) + ' · ' + (f.funcName || f.funcId) };
                }
            }
        }
        for (var k = 0; k < d.systems.length; k++) {
            var sy = d.systems[k] || {};
            if (String(sy.id) === sid) return { kind: 'system', systemId: sy.id, label: sy.name || sy.id };
        }
        for (var m = 0; m < d.items.length; m++) {
            var it = d.items[m] || {};
            if (String(it.itemId) === sid || String(it.internalId) === sid) {
                return { kind: 'item', systemId: it.owningSystemId, label: it.name || it.itemId || sid };
            }
        }
        return { kind: 'unknown', label: sid };
    }

    function functionsOf(systemId) {
        var d = _data(), out = [];
        var s = d.systems.find ? d.systems.find(function (x) { return x && String(x.id) === String(systemId); }) : null;
        ((s && s.functions) || []).forEach(function (f) {
            if (f && f.funcId) out.push({ funcId: f.funcId, funcName: f.funcName || f.funcId, systemId: systemId });
        });
        return out;
    }

    function allFunctions() {
        var d = _data(), out = [];
        d.systems.forEach(function (s) {
            ((s && s.functions) || []).forEach(function (f) {
                if (f && f.funcId) out.push({ funcId: f.funcId, funcName: f.funcName || f.funcId,
                                              systemId: s.id, systemName: s.name || s.id,
                                              label: (s.name || s.id) + ' · ' + (f.funcName || f.funcId) });
            });
        });
        return out;
    }

    function label(id) { return resolve(id).label; }

    return {
        resolve: resolve, functionsOf: functionsOf, allFunctions: allFunctions, label: label,
        _setData: function (d) { _injected = d ? { systems: d.systems || [], items: d.items || [] } : null; }
    };
}));
