/* ============================================================================
 * apx_trees.js (SLApxTrees v1.0, 26 Nov 2026): the PASA fault tree layers built from what the Interdependence, MAC and
 * CoFFE Autopilots sent, and the first layer of a system tree from its change-over answer.
 *
 * Waqas, 25 Nov 2026: "if MAC already exists or CoFFE already exists then we should be creating whatever layers we can
 * without getting into architectural specifics"; "A baselined tree or any analysis for that matter shouldnt be changing
 * without a change request and PR filled"; "typically CoFFE and interdependence fill out the first couple layers and then
 * MAC adds a few more details". 26 Nov 2026, on the briefing: "lets think what 4761 A needs, MAC is essentially your systems
 * configuration needed for continued safe flight and landing"; "what if they dont want MAC or CoFFE"; "Only fill empty
 * trees"; generated nodes change "via the Autopilot"; "Yes, build it".
 *
 * THE SHAPE (ARP4761A Figure Q.4-1, Q.4.2.5, Q.4.4.2): the aircraft tree is built from the CoFFE result and stops at the
 * system failure conditions, where each system's own tree takes over (Q.6.2.2, built from the architecture).
 *   top       the failure condition (fc_auto_trees.js made it, with its objective): an OR
 *   layer 1   <FC>.CoFFE, the combined loss (the CoFFE gate), and beside it each wrong action that causes it on its own
 *   layer 2   one AND per combination left after the duplicates are cut (Table Q.4-8); its independence principle rides on it
 *   layer 3   each failure in a combination: the system FHA line's ONE shared node (SLFcTrees.nodeKey, the same node in every
 *             tree), OR'd with the resource failures that do it (a shared resource failure is one event, once)
 *   stop      the system FHA nodes: each system's PSSA tree plugs in there. Nothing is invented underneath.
 * The MAC is the minimum configuration: it decides which assembly states are the events and which combinations break it.
 * It is already how the CoFFE columns are built, so it shows up as the events of layer 3, never as a layer under them.
 *
 * WHAT IS BUILT FROM WHAT (the tool never guesses at a missing part):
 *   CoFFE sent                the gate above from the CoFFE's own result and budgets
 *   MAC sent, no CoFFE        the MAC's breaking combinations are layer 2; no budgets (the tree's even split)
 *   neither                   nothing here: the PASA asks, per traced system line, "on its own, or only together with
 *                             others?" (pasa_autopilot.js) and places it
 * BUDGETS. Each event carries the budget the engineer gave it in the CoFFE (apxBudget, a probability per flight, the unit a
 * node's probability has in the tree). The allocation holds it like any other constraint (slApxCap in fta_quant_modules.js):
 * verbatim, its free siblings taking the rest, and never looser than a stricter share from another tree (a shared node keeps
 * its strictest budget, slSharedStrictestPass). Budgets tighter than the gate needs leave spare, flagged as everywhere else;
 * budgets that add up to more than the objective leave the gate over-committed, which the CoFFE's own check also says. A
 * resource failure under an event has no budget of its own: it shares the event's. The MAC alone gives no budgets.
 * ONLY EMPTY TREES. A tree is filled only when it has nothing built under its top (SLFcTrees.built is false). Once filled it
 * is ours (page.apxTree): a later change to what was sent rebuilds the generated layers; anything an engineer added under a
 * generated gate is put back under the gate with the same key, or under the top, flagged, when that gate is gone.
 * BASELINES. While the area is baselined (slLockState, lock_enforce.js) nothing is written: the change waits in
 * page.apxPending and is applied once a PR reopens the PASA.
 * GENERATED NODES change only through the Autopilot: renaming, retyping, moving or deleting one in the fault tree editor is
 * refused (guards below); adding branches and numbers under them is free.
 * SYSTEM TREES. A total loss whose MAC build has a change-over ("both lost, or one lost with the change-over failing") gives
 * that system FHA line's PSSA tree, when it is empty, its first layer: OR(AND(both units lost), AND(first unit lost,
 * change-over fails)). It describes how the system is built, so it belongs to the system tree, not the aircraft tree.
 *
 * API (window.SLApxTrees): sync(fcKey?), spec(fc), pendingFor(page), isGen(node), guardOn. Kill switch:
 * window.SL_APX_TREES_OFF = true. Load after fc_auto_trees.js, apx_coffe.js, apx_bridge.js and fta_canvas_edit.js.
 * Tests: tests/regression_apx_trees_20261126.test.js.
 * ==========================================================================*/
(function (root) {
    'use strict';
    var VERSION = '1.0';
    function S(v) { return String(v == null ? '' : v); }
    function T(s) { return S(s).replace(/\s*\u2014\s*/g, ', ').replace(/\s+/g, ' ').trim(); }
    function g(name) { try { if (root.SLEnv && root.SLEnv.get) { var v = root.SLEnv.get(name); if (v !== undefined) return v; } } catch (_) {} try { return root[name]; } catch (_) { return undefined; } }
    function safe(f, d) { try { var v = f(); return v === undefined ? d : v; } catch (_) { return d; } }
    function kids(n) { return (n && (n.children || n._children)) || []; }
    function off() { return !!root.SL_APX_TREES_OFF; }
    function F() { return root.SLFcTrees || null; }
    function A() { return root.SLApxAuto || null; }
    function M() { return root.SLApxMac || null; }
    function C() { return root.SLApxCof || null; }
    function X() { return root.SLApx || null; }
    function pc() { var p = g('projectConfig'); if (!p) { try { p = projectConfig; } catch (_) {} } return p && typeof p === 'object' ? p : null; }   // eslint-disable-line no-undef
    function pages() { var p = g('ftaPages'); if (!Array.isArray(p)) { try { p = ftaPages; } catch (_) {} } return Array.isArray(p) ? p : []; }   // eslint-disable-line no-undef
    function store() { var p = pc(); if (!p) return null; if (!p.apx || typeof p.apx !== 'object') p.apx = {}; if (!p.apx.trees || typeof p.apx.trees !== 'object') p.apx.trees = {}; if (!p.apx.trees.nodes) p.apx.trees.nodes = {}; return p.apx.trees; }
    function nid() { try { return internalIdCounter++; } catch (_) { return Date.now() + Math.floor(Math.random() * 1e6); } }   // eslint-disable-line no-undef
    function cap(s) { s = S(s); return s.charAt(0).toUpperCase() + s.slice(1); }
    function lc(s) { s = S(s); return /^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1); }
    function hash(s) { var h = 5381; s = S(s); for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
    function now() { return new Date().toISOString(); }

    // ---- where things stand ---------------------------------------------------------------------------------------
    function acGroup(fc) { var f = F(); if (!f) return null; return (safe(function () { return f.groups('ac'); }, []) || []).filter(function (x) { return x && x.gov && S(x.gov.internalId) === S(fc.key); })[0] || null; }
    // a baselined (or otherwise locked) area takes no writes: the change waits for a PR to reopen it
    function lockOf(scope, sysId) {
        var L = root.slLockState; if (typeof L !== 'function') return null;
        var s = safe(function () { return L(scope, sysId); }, null);
        return s && s.editable === false ? s : null;
    }
    function sent(model, fc) { return !!(model && safe(function () { return model.status(fc).k === 'sent'; }, false)); }

    // ---- the spec: what the generated layers are, with no ids ------------------------------------------------------
    function changed(model, fc) { return !!(model && safe(function () { return model.status(fc).k === 'changed'; }, false)); }
    function source(fc) {
        var Cm = C() && C().model, Mm = M() && M().model, Xe = X();
        // sent before and changed since: the tree stays as it was sent until it is sent again (never a switch to the MAC meanwhile)
        if (changed(Cm, fc) || (!sent(Cm, fc) && changed(Mm, fc))) return { kind: 'hold' };
        if (Cm && sent(Cm, fc)) {
            var sol = safe(function () { return Cm.solved(fc); }, null);
            if (sol && !sol.error && sol.done) return { kind: 'coffe', sol: sol, gate: safe(function () { return Cm.gate(fc, sol); }, null), budgets: ((Cm.peek(fc.key) || {}).budgets) || {} };
        }
        if (Mm && sent(Mm, fc) && Xe) {
            var ms = safe(function () { return Mm.solved(fc); }, null);
            if (ms && !ms.error && ms.done) { var br = safe(function () { return Mm.breaking(ms); }, []) || []; return { kind: 'mac', sol: ms, gate: br.length ? safe(function () { return Xe.gate(br, ms.cols); }, null) : null, budgets: {} }; }
        }
        return null;
    }
    function colOf(sol, id) { return (sol.ds || []).filter(function (d) { return d.id === id; })[0] || null; }
    function ownNode(fc, k, name) {
        var Mm = M().model, l = safe(function () { return Mm.linkOf(fc, k); }, null);
        if (l && l.sysId != null && l.fcId) return { t: 'sys', sysId: S(l.sysId), fcId: S(l.fcId), k: 'sys:' + S(l.sysId) + '|' + S(l.fcId) };
        return { t: 'ev', name: name, k: 'ev:' + fc.key + '|' + k };
    }
    function evSpec(fc, src, e) {
        var Cm = C().model, d = colOf(src.sol, e.col); if (!d) return null;
        var isM = !!d.isM || e.st === 'M', k = isM ? (d.colId || d.id) + '|M' : e.col + '|' + e.st;
        var words = cap(safe(function () { return Cm.evWords(d, isM ? 'M' : e.st); }, d.name)), ff = safe(function () { return Cm.ffId(fc, isM ? d.colId : d.id, isM ? 'M' : e.st); }, '');
        var own = ownNode(fc, k, (ff ? ff + ' ' : '') + words);
        var res = safe(function () { return Cm.resEvents(fc, d, isM ? 'M' : e.st); }, []) || [];
        var node = !res.length ? own : { t: 'gate', gateType: 'OR', name: (ff ? ff + ' ' : '') + words, k: 'ev:' + fc.key + '|' + k,
            children: [own].concat(res.map(function (r) { return { t: 'res', name: T(r.code), k: r.shared ? 'res:' + r.id + '|' + r.mode : 'res:' + r.id + '|' + r.mode + '|' + (d.colId || d.id) }; })) };
        var b = Number(src.budgets[e.col + '|' + e.st]);
        node.v = b > 0 && b <= 1 ? b : null;
        return node;
    }
    function evKey(e) { return e.col + '|' + e.st; }
    // the independence principles of the CoFFE (Table Q.4-12), by the combination they stand for
    function principles(fc, src) {
        if (src.kind !== 'coffe') return {};
        var Cm = C().model, rows = safe(function () { return Cm.fcRows(fc, src.sol); }, []) || [], list = safe(function () { return Cm.indepList(fc, src.sol); }, []) || [], out = {};
        rows.forEach(function (row, i) {
            var p = list[i]; if (!p || !p.on || p.single) return;
            var evs = []; for (var j = 0; j < row.c.length; j++) if (row.c[j] !== 'O') evs.push(src.sol.ds[j].id + '|' + row.c[j]);
            out[evs.sort().join('&')] = { id: 'PASA-' + p.key, text: T(p.text) };
        });
        return out;
    }
    function spec(fc) {
        if (!fc || !C() || !M() || !A()) return null;
        var src = source(fc); if (!src) return null;
        if (src.kind === 'hold') return { kind: 'hold' };
        var Cm = C().model, Mm = M().model, gt = src.gate, P = principles(fc, src), kids0 = [];
        var ev = function (e) { return evSpec(fc, src, e); };
        if (gt) {
            var inner;
            if (gt.shape === 'core-any') {
                var all = gt.core.concat(gt.any).map(evKey);
                inner = { t: 'gate', gateType: 'AND', k: 'combined',
                    children: gt.core.map(ev).concat([{ t: 'gate', gateType: 'OR', name: 'Any one of these further failures', k: 'or:any:' + gt.any.map(evKey).sort().join('&'), children: gt.any.map(ev) }]).filter(Boolean),
                    indep: Object.keys(P).filter(function (pk) { return pk.split('&').every(function (x) { return all.indexOf(x) >= 0; }); }).map(function (pk) { return P[pk]; }) };
            } else {
                var setNode = function (set, i) {
                    if (set.length === 1) return ev(set[0]);
                    var sk = set.map(evKey).sort().join('&');
                    return { t: 'gate', gateType: 'AND', name: 'Combination ' + (i + 1), k: 'and:' + sk, children: set.map(ev).filter(Boolean), indep: P[sk] ? [P[sk]] : [] };
                };
                inner = gt.sets.length === 1 ? setNode(gt.sets[0], 0) : { t: 'gate', gateType: 'OR', children: gt.sets.map(setNode).filter(Boolean) };
            }
            if (inner.t !== 'gate') inner = { t: 'gate', gateType: 'OR', children: [inner] };
            // the combined loss keeps one key whatever its shape or source (a MAC sent first, the CoFFE after): the same
            // node in the tree and in its verification tree, renamed rather than taken out and put back
            inner.k = 'combined';
            var outcome = src.kind === 'coffe' ? lc(safe(function () { return Cm.outcomeName(fc, 0); }, fc.desc)) : lc(fc.desc);
            inner.name = 'Combined loss resulting in ' + outcome;
            inner.displayId = (fc.fcId || 'FC') + '.' + (src.kind === 'coffe' ? 'CoFFE' : 'MAC');
            kids0.push(inner);
        }
        (safe(function () { return Mm.aloneMalf(fc); }, []) || []).forEach(function (m) {
            var ff = safe(function () { return Cm.ffId(fc, m.colId, 'M'); }, '');
            kids0.push(ownNode(fc, m.colId + '|M', (ff ? ff + ' ' : '') + m.sysName + ' doing the wrong thing'));
        });
        if (!kids0.length) return null;
        var top = { t: 'gate', gateType: 'OR', k: 'top', top: true, children: kids0 };
        return { kind: src.kind, top: top, fp: hash(JSON.stringify(strip(top))) };
    }
    function strip(n) { var o = { t: n.t, k: n.k, g: n.gateType || '', n: n.name || '', s: n.sysId || '', f: n.fcId || '', b: n.v != null ? n.v : null, i: (n.indep || []).map(function (x) { return x.id + ':' + x.text; }) }; if (n.children) o.c = n.children.map(strip); return o; }

    // ---- writing it into the tree ----------------------------------------------------------------------------------
    // a generated node keeps its display id through every rebuild (by its key), minted once from the program's gate and
    // basic event schemes (generateDisplayId) like any node made by hand
    function dispId(type, memoKey) {
        var st = store(); if (st && !st.ids) st.ids = {};
        if (st && memoKey && st.ids[memoKey]) return st.ids[memoKey];
        var d = safe(function () { return typeof root.generateDisplayId === 'function' ? root.generateDisplayId(type === 'gate' ? 'gate' : 'basic') : null; }, null);
        if (!d) d = (type === 'gate' ? 'G-' : 'BE-') + nid();
        if (st && memoKey) st.ids[memoKey] = d;
        return d;
    }
    // a generated gate (or event of its own) keeps its id through every rebuild, by its key: the verification tree follows
    // a node by its logical id (verify_sync.js), so a rebuild that keeps the shape takes nothing out of it
    function stableId(memoKey) {
        var st = store(); if (!st || !memoKey) return nid(); if (!st.lids) st.lids = {};
        var have = st.lids[memoKey];
        if (have == null || pages().some(function (p) { return p && p.root && clash(p.root, have, memoKey); })) { have = nid(); st.lids[memoKey] = have; }
        return have;
    }
    // the id is taken by a node that is not ours under this key (a hand-made node, another project merged in)
    function clash(n, id, memoKey) { var hit = false; (function w(x) { if (!x || hit) return; if (String(x.id) === String(id) && !(x.apxGen && x.apxGen.mk === memoKey)) hit = true; kids(x).forEach(w); })(n); return hit; }
    function base(type, name, memoKey) {
        var id = stableId(memoKey), n = { id: id, logicalId: id, type: type, name: name || '', probability: 0, children: [] };
        if (type === 'gate') n.gateType = 'OR'; else n.inputMode = 'probability';
        n.displayId = dispId(type, memoKey);
        return n;
    }
    function sharedLid(k) { var st = store(); if (!st) return nid(); if (st.nodes[k] == null) st.nodes[k] = nid(); return st.nodes[k]; }
    // mk: the node's whole path of keys from the top, so a failure that sits in two combinations is two nodes with two ids
    function realize(sp, fcKey, kind, pmk) {
        var n, f = F(), mk = (pmk || fcKey + '|') + '>' + sp.k;
        if (sp.t === 'sys') {
            var e = f.nodeKey({ sysId: sp.sysId, fcId: sp.fcId }, true);
            n = base('basic', '', mk); n._mk = mk; n.logicalId = e.lid; n.sysNode = { sysId: S(e.sysId), fcId: e.fcId || null, col: e.col || null }; n.name = f.nodeName(e);
        } else if (sp.t === 'res' || sp.t === 'ev') {
            n = base('basic', sp.name, mk); n._mk = mk; n.logicalId = sharedLid(sp.k);
        } else {
            n = base('gate', sp.name, mk); n._mk = mk; n.gateType = sp.gateType; if (sp.displayId) n.displayId = sp.displayId;
            n.children = sp.children.map(function (c) { return realize(c, fcKey, kind, mk); });
            if (sp.indep && sp.indep.length) n.apxIndep = sp.indep.map(function (x) { return { id: x.id, text: x.text }; });
        }
        n.apxGen = { fc: S(fcKey), k: sp.k, src: kind, mk: n._mk };
        delete n._mk;
        if (sp.v > 0 && sp.v <= 1) n.apxBudget = sp.v;
        return n;
    }
    function isGen(n) { return !!(n && n.apxGen && n.apxGen.k && n.apxGen.k !== 'top'); }
    // what an engineer added under the generated part: kept, by the key of the gate it sits under
    function harvest(top) {
        var keep = [];
        (function w(n) { kids(n).forEach(function (c) { if (!c.apxGen && !(c.type === 'undeveloped' && /^Decompose: causes of /.test(c.name || ''))) keep.push({ pk: n === top ? 'top' : n.apxGen && n.apxGen.k, node: c }); else w(c); }); })(top);
        return keep;
    }
    function index(n, map) { map = map || {}; if (n && n.apxGen && n.type === 'gate' && !map[n.apxGen.k]) map[n.apxGen.k] = n; kids(n).forEach(function (c) { index(c, map); }); return map; }
    function write(page, sp, fc) {
        var top = page.root; if (!top) return false;
        var keep = page.apxTree ? harvest(top) : [];
        var built = realize(sp.top, fc.key, sp.kind);
        top.gateType = 'OR';
        top.children = built.children;
        top.apxGen = { fc: S(fc.key), k: 'top', src: sp.kind };
        var map = index(top);
        keep.forEach(function (x) {
            var at = x.pk === 'top' ? top : map[x.pk];
            if (!at) { at = top; x.node._apxOrphan = { was: x.pk, at: now() }; } else delete x.node._apxOrphan;
            if (!Array.isArray(at.children)) at.children = [];
            at.children.push(x.node);
        });
        page.apxTree = { fc: S(fc.key), src: sp.kind, fp: sp.fp, at: now(), orphans: keep.filter(function (x) { return x.node._apxOrphan; }).length };
        delete page.apxPending;
        if (page.autoFcTree && F().shapeFp) page.autoFcTree.fp = F().shapeFp(top);
        try { if (typeof root.jrnl === 'function') root.jrnl('tree-generated', (page.name || page.id) + ' layers built from the ' + (sp.kind === 'coffe' ? 'CoFFE' : 'MAC') + ' sent for ' + (fc.fcId || fc.key)); } catch (_) {}
        try { var V = root.SLVerifySync; if (V && V.ensureMirror) { var m = V.ensureMirror(page); if (m && V.syncMirror) V.syncMirror(m); } } catch (_) {}
        return true;
    }

    // ---- one failure condition -------------------------------------------------------------------------------------
    // returns 'built' | 'rebuilt' | 'same' | 'pending' | 'skip' with why
    // what the spec of one failure condition rests on: its three Autopilot records and the systems' FHA ids (the links)
    var _memo = {};
    function sigOf(fc) {
        var p = pc(), a = (p && p.apx) || {}, k = S(fc.key), sys = (g('systemsData') || []).map(function (s) { return s ? S(s.id) + ':' + (s.fha || []).map(function (r) { return r ? S(r.fcId) : ''; }).join(',') : ''; }).join('|');
        return hash(JSON.stringify([(a.idp || {})[k] || null, (a.mac || {})[k] || null, (a.cof || {})[k] || null, sys]));
    }
    function specMemo(fc) { var sg = sigOf(fc), m = _memo[S(fc.key)]; if (m && m.sg === sg) return m.sp; var sp = spec(fc); _memo[S(fc.key)] = { sg: sg, sp: sp }; return sp; }
    function syncFc(fc) {
        var f = F(); if (!f) return { r: 'skip', why: 'no fault tree module' };
        var gr = acGroup(fc); if (!gr || !gr.needsTree) return { r: 'skip', why: 'no tree needed' };
        var page0 = f.treeFor(gr), ours0 = !!(page0 && page0.apxTree && page0.apxTree.fc === S(fc.key));
        if (page0 && !ours0 && f.built(page0)) return { r: 'skip', why: 'the tree already has an engineer\'s work in it' };
        var sp = specMemo(fc); if (!sp) return { r: 'skip', why: 'nothing sent to build from' };
        if (sp.kind === 'hold') return { r: 'same', why: 'changed since it was sent: waits for the next send' };
        var page = page0 || safe(function () { return f.makeTree(gr); }, null); if (!page || !page.root) return { r: 'skip', why: 'no tree' };
        var ours = !!(page.apxTree && page.apxTree.fc === S(fc.key));
        if (!ours && f.built(page)) return { r: 'skip', why: 'the tree already has an engineer\'s work in it' };
        if (ours && page.apxTree.fp === sp.fp) { if (page.apxPending) delete page.apxPending; return { r: 'same' }; }
        var lk = lockOf('ac');
        if (lk) { page.apxPending = { fp: sp.fp, src: sp.kind, at: now(), kind: lk.kind, gate: lk.gate || '' }; return { r: 'pending', why: lk.kind }; }
        write(page, sp, fc);
        return { r: ours ? 'rebuilt' : 'built', page: page };
    }

    // ---- system trees: the change-over layer -----------------------------------------------------------------------
    function sysCoLayers() {
        var out = [], Am = A() && A().model, Mm = M() && M().model, f = F(); if (!Am || !Mm || !f) return out;
        (safe(function () { return Am.fcs(); }, []) || []).forEach(function (fc) {
            if (!sent(Mm, fc) && !sent(C() && C().model, fc)) return;
            (safe(function () { return Mm.allEvents(fc); }, []) || []).forEach(function (e) {
                if (e.st !== 'F' || !e.d) return;
                var w = safe(function () { return Mm.coWays(e.d); }, null), l = Mm.linkOf(fc, e.k); if (!w || !l) return;
                out.push({ fc: fc, e: e, ways: w, sysId: S(l.sysId), fcId: S(l.fcId), k: 'co:' + S(l.sysId) + '|' + S(l.fcId) });
            });
        });
        return out;
    }
    function syncSys(x) {
        var f = F(), sy = (g('systemsData') || []).filter(function (s) { return s && S(s.id) === x.sysId; })[0]; if (!sy) return { r: 'skip' };
        var sg = (safe(function () { return f.groups(sy); }, []) || []).filter(function (q) { return q.fcId === x.fcId; })[0]; if (!sg || !sg.needsTree) return { r: 'skip' };
        var page = f.treeFor(sg); if (!page || !page.root) return { r: 'skip' };
        var fp = hash(JSON.stringify(x.ways.map(function (w) { return w.parts; })));
        var ours = !!(page.apxTree && page.apxTree.co === x.k);
        if (!ours && f.built(page)) return { r: 'skip' };
        if (ours && page.apxTree.fp === fp) return { r: 'same' };
        var lk = lockOf('system', x.sysId);
        if (lk) { page.apxPending = { fp: fp, src: 'mac', at: now(), kind: lk.kind, gate: lk.gate || '' }; return { r: 'pending' }; }
        var top = page.root, keep = ours ? harvest(top) : [];
        var lids = {}, leaf = function (name, ak) { var key = 'unit:' + x.k + '|' + name, mk = ak + '>' + key; if (lids[key] == null) lids[key] = sharedLid(key); var n = base('basic', name, mk); n.logicalId = lids[key]; n.apxGen = { fc: S(x.fc.key), k: key, src: 'mac', mk: mk }; return n; };
        top.gateType = 'OR';
        top.children = x.ways.map(function (w) { var ak = 'and:' + x.k + '|' + w.k, a = base('gate', w.text, ak); a.gateType = 'AND'; a.apxGen = { fc: S(x.fc.key), k: ak, src: 'mac', mk: ak }; a.children = w.parts.map(function (pt) { return leaf(pt, ak); }); return a; });
        top.apxGen = { fc: S(x.fc.key), k: 'top', src: 'mac' };
        var map = index(top);
        keep.forEach(function (y) { var at = y.pk === 'top' ? top : map[y.pk]; if (!at) { at = top; y.node._apxOrphan = { was: y.pk, at: now() }; } at.children.push(y.node); });
        page.apxTree = { co: x.k, fc: S(x.fc.key), src: 'mac', fp: fp, at: now() };
        delete page.apxPending;
        if (page.autoFcTree && f.shapeFp) page.autoFcTree.fp = f.shapeFp(top);
        try { var V = root.SLVerifySync; if (V && V.ensureMirror) { var m = V.ensureMirror(page); if (m && V.syncMirror) V.syncMirror(m); } } catch (_) {}
        return { r: ours ? 'rebuilt' : 'built' };
    }

    // ---- the pass ---------------------------------------------------------------------------------------------------
    var _busy = false, _lastGen = null;
    function touch() {
        try { if (typeof root._slSharedStrictestRound === 'function') root._slSharedStrictestRound(); } catch (_) {}
        try { if (root.SLDataChange && root.SLDataChange.bump) root.SLDataChange.bump(); } catch (_) {}
        try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {}
    }
    function sync(fcKey) {
        if (off() || _busy || !F() || !A() || !M() || !C()) return [];
        _busy = true;
        var out = [];
        try {
            var list = (safe(function () { return A().model.fcs(); }, []) || []).filter(function (fc) { return fcKey == null || S(fc.key) === S(fcKey); });
            list.forEach(function (fc) { var r = safe(function () { return syncFc(fc); }, { r: 'skip', why: 'error' }); r.fc = fc.fcId || fc.key; out.push(r); });
            sysCoLayers().forEach(function (x) { if (fcKey != null && S(x.fc.key) !== S(fcKey)) return; var r = safe(function () { return syncSys(x); }, { r: 'skip' }); r.sys = x.sysId + ' ' + x.fcId; out.push(r); });
            if (out.some(function (r) { return r.r === 'built' || r.r === 'rebuilt' || r.r === 'pending'; })) touch();
        } finally { _busy = false; try { _lastGen = root.SLDataChange ? root.SLDataChange.gen() : null; } catch (_) {} }
        return out;
    }
    // a change made while the area was baselined, waiting for a PR
    function pendingFor(page) { return page && page.apxPending ? page.apxPending : null; }

    // ---- the guards: generated nodes change through the Autopilot ---------------------------------------------------
    var _lastRefusal = 0;
    function refuse(what) {
        var t = Date.now(); if (t - _lastRefusal < 1500) return null; _lastRefusal = t;
        var m = cap(what) + ' is part of the layers built from the Interdependence, MAC and CoFFE Autopilots. Change it there and the tree follows. You can still add your own branches and numbers under it.';
        try { if (typeof root.showToast === 'function') root.showToast(m, 'warning', 5200); } catch (_) {}
        return null;
    }
    function hasGen(n) { var hit = false; (function w(x) { if (!x || hit) return; if (isGen(x)) { hit = true; return; } kids(x).forEach(w); })(n); return hit; }
    function sel() { try { return typeof selectedNodeData !== 'undefined' ? selectedNodeData : null; } catch (_) { return null; } }   // eslint-disable-line no-undef
    function wrapGlobals() {
        var del = root.deleteSelectedNode;
        if (typeof del === 'function' && !del.__slApxGuard) {
            var wd = function () { var n = sel(); if (n && hasGen(n)) return refuse(isGen(n) ? 'this node' : 'a node inside this branch'); return del.apply(this, arguments); };
            wd.__slApxGuard = true; try { root.deleteSelectedNode = wd; } catch (_) {}
        }
        ['updateNodeData', 'updateNodeDataInline'].forEach(function (name) {
            var f0 = root[name]; if (typeof f0 !== 'function' || f0.__slApxGuard) return;
            var w = function () {
                var n = sel(), before = n && (isGen(n) || (n.apxGen && n.apxGen.k === 'top')) ? { name: n.name, type: n.type, gateType: n.gateType, displayId: n.displayId } : null;
                var r = f0.apply(this, arguments);
                if (before && n) {
                    var top = n.apxGen.k === 'top', changed = (!top && (n.name !== before.name || n.displayId !== before.displayId)) || n.type !== before.type || n.gateType !== before.gateType;
                    if (changed) { if (!top) { n.name = before.name; n.displayId = before.displayId; } n.type = before.type; n.gateType = before.gateType; refuse(top ? 'the gate type of this top event' : 'this node'); try { if (typeof root.renderFTA === 'function') root.renderFTA(); } catch (_) {} }
                }
                return r;
            };
            w.__slApxGuard = true; try { root[name] = w; } catch (_) {}
        });
        var E = root.SLFtaEdit;
        if (E && !E.__slApxGuard) {
            ['connect', 'disconnect'].forEach(function (name) {
                var f1 = E[name]; if (typeof f1 !== 'function') return;
                E[name] = function (node) { if (isGen(node)) return refuse('this node'), { ok: false, reason: 'generated' }; return f1.apply(this, arguments); };
            });
            E.__slApxGuard = true;
        }
    }

    // ---- hooks -----------------------------------------------------------------------------------------------------
    // a send is taken a moment later, once whatever sent it has finished (a fill sends the MAC and then the CoFFE of every
    // failure condition: the tree is built once, from the CoFFE, not from the MAC and then again)
    var _later = {}, _laterT = null;
    function later(fcKey) {
        _later[S(fcKey)] = 1;
        if (_laterT) clearTimeout(_laterT);
        _laterT = setTimeout(function () { _laterT = null; var ks = Object.keys(_later); _later = {}; ks.forEach(function (k) { try { sync(k); } catch (_) {} }); }, 1500);
    }
    function hookBridge() {
        var B = root.SLApxBridge; if (!B || typeof B.project !== 'function' || B.project.__slApxTrees) return;
        var p0 = B.project;
        B.project = function (fc) { var r = p0.apply(this, arguments); try { if (fc && fc.key != null) later(fc.key); } catch (_) {} return r; };
        B.project.__slApxTrees = true;
        var u0 = B.unproject;
        if (typeof u0 === 'function' && !u0.__slApxTrees) { B.unproject = function (fc) { var r = u0.apply(this, arguments); try { if (fc && fc.key != null) later(fc.key); } catch (_) {} return r; }; B.unproject.__slApxTrees = true; }
    }
    // a project opened with something sent and its trees still empty (or a PR that reopened the PASA) is caught up here,
    // once per data change, never while the page is busy drawing
    function tick() {
        if (off()) return;
        hookBridge(); wrapGlobals();
        var dc = root.SLDataChange, gen = dc ? safe(function () { return dc.gen(); }, null) : null;
        if (gen != null && gen === _lastGen) return;
        if (_laterT) return;   // a send is about to be taken
        sync();
    }
    if (typeof setInterval === 'function' && typeof document !== 'undefined') setInterval(function () { try { tick(); } catch (_) {} }, 4000);

    var api = { VERSION: VERSION, sync: sync, spec: spec, pendingFor: pendingFor, isGen: isGen, tick: tick, _source: source, guardOn: wrapGlobals };
    try { root.SLApxTrees = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
