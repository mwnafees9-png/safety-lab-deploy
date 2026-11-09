// cma_claims.js (SLCmaClaims v1.0, 10 Nov 2026): the independence claims of the CMA, worked out from the project data.
//
// Waqas, 9 Nov 2026, on the CMA page: "why is this table there and not in the report, why are we not showing them images of
// the fault trees we are talking about and why have we not pre-written the qualitative analyses for them?". On grouping
// (asked and answered the same day): "Grouped. One CMA per independence claim, listing every gate that relies on it, and
// each gate keeps its own section and fault tree picture pointing to the shared review. Same claim means exactly the same
// set of items or systems claimed independent: a gate relying on a subset or a different set gets its own CMA."
//
// What this file gives cma_autopilot.js (pure: it reads the project, it never writes):
//   gates()            every critical AND gate once (by key), with every failure condition it serves and both budget tests
//                      per failure condition (critical_gates.js analyzeAll, read once per redraw).
//   inputs(key)        the inputs of a gate, each with the basic events under it (through transfers), the items that
//                      realize them (realizedByItemId, the Items tab), their systems and their zones (the CAD model).
//   claimKey(key)      what the gate claims independent, as one string: per input, the sorted items (or systems, or event
//                      names when nothing is linked) under it; the inputs sorted. Two gates make the same claim only when
//                      these are exactly equal.
//   groups()           the critical gates grouped by claimKey, in a stable order.
//   evidence(keys)     the common mode categories the project data can answer for these gates, each { a, why, source }:
//                        fault tree      the same basic event (or the same item) under more than one input
//                        Items           same design ("As LRU-..."), suppliers named in the item list, software or not,
//                                        declared dissimilar
//                        CAD model zones where each item sits: the same zone, nested zones, neighboring zones without a
//                                        credited barrier, or zones apart (with the zonal safety analysis record named)
//                        PRA             a particular risk whose footprint covers the zones of more than one input
//                        Routing         a routing entry that carries items of more than one input
//                      Same inputs, same answers, every time. What the data cannot settle is left out: the engineer writes
//                      it, or accepts an AI draft (cma_autopilot.js).
//   figure(key, o)     the fault tree around the gate: the path from the top event to the gate (other inputs along the
//                      path shown as boxes), the gate highlighted, its inputs marked as claimed independent, two levels
//                      under each input; what is not drawn is counted and said. Squared connectors, never through a box.
(function (root) {
    'use strict';
    var VERSION = '1.0';
    function S(v) { return String(v == null ? '' : v); }
    function E(s) { return S(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function T(s) { return S(s).replace(/\s*\u2014\s*/g, ', ').replace(/\s+/g, ' ').trim(); }
    function g(name) { try { if (root.SLEnv && root.SLEnv.get) { var v = root.SLEnv.get(name); if (v !== undefined) return v; } } catch (_) {} try { return root[name]; } catch (_) { return undefined; } }
    function arr(name) { var v = g(name); return Array.isArray(v) ? v : []; }
    function safe(f, d) { try { var v = f(); return v === undefined ? d : v; } catch (_) { return d; } }
    function kids(n) { return (n && (n.children || n._children)) || []; }
    function listJoin(a) { a = a.filter(Boolean); return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
    function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
    function cmp(a, b) { return S(a).localeCompare(S(b), undefined, { numeric: true }); }
    function fp(s) { var h = 5381; s = S(s); for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
    function dot(s) { s = T(s); return s && !/[.!?]$/.test(s) ? s + '.' : s; }

    // ---- read once per redraw ---------------------------------------------------------------------------------------
    var _m = {}, _mt = null;
    function memo(k, f) { if (Object.prototype.hasOwnProperty.call(_m, k)) return _m[k]; var v = f(); _m[k] = v; if (!_mt && typeof setTimeout === 'function') _mt = setTimeout(function () { _m = {}; _mt = null; }, 0); return v; }
    function forget() { _m = {}; if (_mt && typeof clearTimeout === 'function') clearTimeout(_mt); _mt = null; }

    // ---- severity in words ------------------------------------------------------------------------------------------
    var SEV = { CAT: 'Catastrophic', HAZ: 'Hazardous', MAJ: 'Major', MIN: 'Minor', NSE: 'No safety effect' };
    function sevWords(s) { s = S(s).trim(); var u = s.toUpperCase().replace(/[^A-Z]/g, ''); if (SEV[u]) return SEV[u]; var hit = Object.keys(SEV).find(function (k) { return SEV[k].toUpperCase().replace(/[^A-Z]/g, '') === u; }); return hit ? SEV[hit] : (s || 'severity not set'); }

    // ---- pages, nodes ------------------------------------------------------------------------------------------------
    function pages() { return memo('pages', function () { return arr('ftaPages').filter(function (p) { return p && p.root && !(p.integrated && p.integrated.sourcePageId != null); }); }); }
    function pageById(id) { return pages().find(function (p) { return S(p.id) === S(id); }) || null; }
    function isTransfer(n) { return !!n && n.type === 'gate' && (n.gateType === 'TRANSFER' || !!n.transferOutTo); }
    function transferPage(n) { var id = n.transferOutTo || n.linkedPageId; return id ? pageById(id) : null; }
    function findPath(rootN, id) {
        var path = null;
        (function w(n, acc) { if (path || !n) return; var a = acc.concat([n]); if (S(n.id) === S(id)) { path = a; return; } kids(n).forEach(function (k) { w(k, a); }); })(rootN, []);
        return path;
    }
    function gateNode(key) { var k = S(key), cut = k.lastIndexOf(':'); if (cut < 0) return null; var p = pageById(k.slice(0, cut)); if (!p) return null; var path = findPath(p.root, k.slice(cut + 1)); return path ? { page: p, node: path[path.length - 1], path: path } : null; }
    // the basic events under a node, through transfers (each page once)
    function leaves(n) {
        var out = [], seenP = {};
        (function w(x) {
            if (!x) return;
            if (isTransfer(x)) { var p = transferPage(x); if (p && !seenP[p.id]) { seenP[p.id] = 1; w(p.root); } return; }
            if (x.type === 'gate' && kids(x).length) { kids(x).forEach(w); return; }
            if (x.type !== 'gate') out.push(x);
        })(n);
        return out;
    }

    // ---- items, systems and zones ---------------------------------------------------------------------------------------
    function itemIdx() { return memo('items', function () { var m = {}; arr('itemsData').forEach(function (it) { if (it && it.internalId != null) m[S(it.internalId)] = it; }); return m; }); }
    function itemOf(leaf) { var id = leaf && (leaf.realizedByItemId != null ? leaf.realizedByItemId : leaf.itemInternalId); return id != null ? itemIdx()[S(id)] || null : null; }
    function itemByCode(code) { var c = S(code).trim().toUpperCase(); return arr('itemsData').find(function (it) { return it && S(it.itemId).toUpperCase() === c; }) || null; }
    function sysName(id) { var s = arr('systemsData').find(function (x) { return x && S(x.id) === S(id); }); return s ? T(s.name || s.id).replace(/\s*,\s*$/, '') : S(id); }
    function itemWords(it) { return S(it.itemId) + ' ' + T(it.name); }
    function Z() { return root.ZONES || null; }
    function zoneWords(zid) { var z = safe(function () { return Z().get(zid); }, null); return z ? (S(z.code) + (z.name ? ' ' + T(z.name) : '')).trim() : S(zid); }
    function zoneCode(zid) { var z = safe(function () { return Z().get(zid); }, null); return z ? S(z.code || zid) : S(zid); }
    // item name -> zone ids, from the CAD model: a part named as the item (its link, when confirmed, to the item's system)
    function itemZones() {
        return memo('izones', function () {
            var C = root.SLCadZonal, out = {}; if (!C || !Z()) return out;
            var cad = safe(function () { return C.latestCadId(); }, null); if (!cad) return out;
            var cont = safe(function () { return C.containment(cad); }, null), conf = safe(function () { return C.confirmed(cad); }, {}) || {};
            var byName = {};
            ((cont && cont.parts) || []).forEach(function (r) { if (!r || !r.zoneId) return; var nm = S(r.pid).slice(S(r.pid).lastIndexOf('/') + 1).replace(/#\d+$/, '').trim().toLowerCase(); (byName[nm] = byName[nm] || []).push({ zone: r.zoneId, sys: conf[r.pid] || null }); });
            arr('itemsData').forEach(function (it) {
                var hits = byName[S(it.name).trim().toLowerCase()] || [];
                var ok = hits.filter(function (h) { return !h.sys || !it.owningSystemId || S(h.sys) === S(it.owningSystemId); });
                if (ok.length) out[S(it.internalId)] = uniq(ok.map(function (h) { return h.zone; })).sort(cmp);
            });
            return out;
        });
    }
    function zonesOfItem(it) { return it ? (itemZones()[S(it.internalId)] || []) : []; }

    // ---- the critical gates, once each, with every failure condition and both tests ----------------------------------------
    // critical_gates.js analyzeAll, once per redraw (it recomputes every tree)
    function analysis() { return memo('analysis', function () { var CG = root.SLCriticalGates; return CG ? (safe(function () { return CG.analyzeAll(); }, []) || []) : []; }); }
    function gates() {
        return memo('gates', function () {
            var CG = root.SLCriticalGates; if (!CG) return [];
            var by = {}, order = [];
            analysis().forEach(function (res) {
                (res.gates || []).forEach(function (x) {
                    if (!x.critical) return;
                    var rec = by[x.key];
                    if (!rec) { rec = by[x.key] = { key: x.key, pageId: S(x.pageId), nodeId: S(x.nodeId), displayId: S(x.displayId), name: T(x.name), gateType: S(x.gateType), tests: [], fcs: [] }; order.push(x.key); }
                    var ex = safe(function () { return CG.explain(x, res); }, null);
                    (res.fcs || []).forEach(function (fr) {
                        var f = fr.fha || {}, id = S(f.fcId || ('FC ' + (f.internalId || '')));
                        if (rec.fcs.some(function (y) { return y.id === id && y.system === (fr.sysId != null ? S(fr.sysName) : ''); })) return;
                        rec.fcs.push({ id: id, internalId: S(f.internalId), name: T(f.fcDesc || f.failureCondition || f.name || ''), severity: sevWords(f.severity), system: fr.sysId != null ? S(fr.sysName) : '', sysId: fr.sysId != null ? S(fr.sysId) : '' });
                    });
                    rec.tests.push({ treeId: S(res.pageId), tree: T(res.pageName), fcs: (res.fcs || []).map(function (fr) { return S((fr.fha || {}).fcId || ''); }), target: res.target, g: x, words: ex });
                });
            });
            var SR = { Catastrophic: 0, Hazardous: 1, Major: 2, Minor: 3 };
            return order.map(function (k) { var r = by[k]; r.fcs.sort(function (a, b) { return (SR[a.severity] != null ? SR[a.severity] : 9) - (SR[b.severity] != null ? SR[b.severity] : 9) || cmp(a.id, b.id); }); return r; })
                .filter(function (r) { return !!gateNode(r.key); });
        });
    }
    function gate(key) { return gates().find(function (x) { return x.key === S(key); }) || null; }

    // ---- the inputs of a gate ---------------------------------------------------------------------------------------------
    function inputs(key) {
        return memo('in:' + key, function () {
            var gn = gateNode(key); if (!gn) return [];
            return kids(gn.node).map(function (c) {
                var ls = leaves(c), its = [], ids = [];
                ls.forEach(function (l) {
                    var it = itemOf(l);
                    if (it) { if (its.indexOf(it) < 0) its.push(it); ids.push('item:' + S(it.internalId)); return; }
                    var eq = safe(function () { return root.SLCadZonal.equipmentOfEvent(l); }, null);
                    ids.push(eq ? 'sys:' + S(eq) : 'event:' + T(l.name || l.displayId || l.id).toLowerCase());
                });
                var zones = []; its.forEach(function (it) { zonesOfItem(it).forEach(function (z) { if (zones.indexOf(z) < 0) zones.push(z); }); });
                return { node: c, id: S(c.displayId || c.id), name: T(c.name || c.displayId || c.id), leaves: ls, items: its, systems: uniq(its.map(function (it) { return S(it.owningSystemId); }).filter(Boolean)), zones: zones.sort(cmp), ident: uniq(ids).sort(cmp).join('+'), dal: S(c.allocatedDAL || '') };
            });
        });
    }
    function claimKey(key) { var ins = inputs(key); return ins.length ? ins.map(function (i) { return i.ident; }).sort(cmp).join(' | ') : 'gate:' + S(key); }
    // what is claimed independent, in words: the items under each input, or the input's own name
    function claimedWords(key) { return inputs(key).map(function (i) { return i.items.length ? i.name + ' (' + listJoin(i.items.map(itemWords)) + ')' : i.name; }); }
    function groups() {
        return memo('groups', function () {
            var by = {}, order = [];
            gates().forEach(function (x) { var ck = claimKey(x.key); if (!by[ck]) { by[ck] = { key: 'c' + fp(ck), ident: ck, gates: [] }; order.push(ck); } by[ck].gates.push(x.key); });
            return order.map(function (k) { return by[k]; });
        });
    }
    function groupOf(gateKey) { var k = S(gateKey); return groups().find(function (gr) { return gr.gates.indexOf(k) >= 0; }) || null; }

    // ---- the evidence: the categories the project data answers ---------------------------------------------------------------
    // each check returns { cat, a, why, source }; per gate, then merged over the claim's gates
    var TYPE_CAT = { Electrical: 'cr-egen', Hydraulic: 'cr-hgen', Pneumatic: 'cr-pneu', Computing: 'cr-proc', Sensing: 'cr-sensor', Display: 'cr-proc' };
    function pairs(n) { var o = []; for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) o.push([i, j]); return o; }
    function zsaRecord(zid) {
        var code = zoneCode(zid), Zm = Z();
        return arr('zsaData').find(function (r) { if (!r) return false; if (S(r.zoneId) === code) return true; var z = safe(function () { return Zm.resolve(r.zoneId); }, null); return !!z && S(z.id) === S(zid); }) || null;
    }
    function zsaWords(zid) { var r = zsaRecord(zid); return r ? ' The zonal safety analysis for ' + zoneCode(zid) + ' records: ' + dot(r.interference || r.desc || '') + (T(r.mitigation) ? ' Its mitigation: ' + dot(r.mitigation) : '') : ''; }
    function checksFor(key) {
        var ins = inputs(key), out = [];
        if (ins.length < 2) return out;
        var named = function (i) { return '"' + ins[i].name + '"'; };
        // 1. the same basic event (or the same item) under more than one input: a shared cause, by the tree itself
        var seen = {};
        ins.forEach(function (inp, i) { inp.leaves.forEach(function (l) { var it = itemOf(l), id = it ? 'item:' + it.internalId : 'lid:' + S(l.logicalId != null ? l.logicalId : l.id); (seen[id] = seen[id] || { leaf: l, item: it, at: [] }); if (seen[id].at.indexOf(i) < 0) seen[id].at.push(i); }); });
        Object.keys(seen).sort(cmp).forEach(function (id) {
            var s = seen[id]; if (s.at.length < 2) return;
            var what = s.item ? itemWords(s.item) : '"' + T(s.leaf.name || s.leaf.displayId) + '"';
            var cat = s.item ? (s.item.daType === 'Software' && !TYPE_CAT[s.item.type] ? 'dv-sw' : TYPE_CAT[s.item.type] || 'cr-add') : 'cr-add';
            out.push({ cat: cat, a: 'concern', source: 'Fault tree', why: 'The fault tree puts ' + what + ' under ' + listJoin(s.at.map(named)) + ': one failure of it fails more than one input at once.' });
        });
        // the items of every input are known only when every basic event under every input has its item
        var allItems = ins.every(function (i) { return i.items.length && i.leaves.every(function (l) { return !!itemOf(l); }); });
        var itemsOf = function (i) { return ins[i].items; };
        // 2. same design: an item described as another input's item ("As LRU-PRP-01"): items grouped by the design they share
        var designOf = function (it) { var m = /^As\s+([A-Z][A-Z0-9]*-[A-Z0-9-]+)/.exec(S(it.description).trim()); return m ? S(m[1]).replace(/-+$/, '').toUpperCase() : S(it.itemId).toUpperCase(); };
        var byDesign = {};
        ins.forEach(function (inp, i) { inp.items.forEach(function (it) { var d = designOf(it), x = byDesign[d] || (byDesign[d] = { at: [], items: [], copied: false }); if (x.at.indexOf(i) < 0) x.at.push(i); if (x.items.indexOf(it) < 0) x.items.push(it); if (d !== S(it.itemId).toUpperCase()) x.copied = true; }); });
        var same = Object.keys(byDesign).sort(cmp).filter(function (d) { return byDesign[d].copied && byDesign[d].at.length >= 2; }).map(function (d) {
            var x = byDesign[d], base = itemByCode(d), copies = x.items.filter(function (it) { return S(it.itemId).toUpperCase() !== d; });
            return listJoin(copies.map(itemWords)) + (copies.length === 1 ? ' is' : ' are') + ' recorded as the same design as ' + (base ? itemWords(base) : d);
        });
        if (same.length) {
            out.push({ cat: 'mf-mfr', a: 'concern', source: 'Items', why: 'The item list says ' + same.join('; ') + ': one source makes them, so one quality escape can reach more than one input.' });
            out.push({ cat: 'dv-spec', a: 'concern', source: 'Items', why: 'The item list says ' + same.join('; ') + ': they are built to one specification, so an error in it sits in more than one input.' });
        }
        // 3. suppliers named in the item list
        var sup = function (it) { var m = /\bSupplier\s+([A-Z0-9]+)\b/.exec(S(it.description)); return m ? m[1] : ''; };
        if (!same.length && allItems && ins.every(function (inp) { return inp.items.every(function (it) { return !!sup(it); }); })) {
            var sets = ins.map(function (inp) { return uniq(inp.items.map(sup)); });
            var shared = pairs(ins.length).some(function (p) { return sets[p[0]].some(function (x) { return sets[p[1]].indexOf(x) >= 0; }); });
            var sw = ins.map(function (inp) { return inp.items.map(function (it) { return S(it.itemId) + ' from supplier ' + sup(it); }).join(', '); });
            out.push(shared ? { cat: 'mf-mfr', a: 'concern', source: 'Items', why: 'The item list names the same supplier on more than one input: ' + listJoin(sw) + '.' }
                            : { cat: 'mf-mfr', a: 'no', source: 'Items', why: 'The item list names a different supplier for each input: ' + listJoin(sw) + '.' });
        }
        // 4. software, from the item list
        if (allItems) {
            var swIn = ins.map(function (inp) { return inp.items.filter(function (it) { return it.daType === 'Software'; }); });
            var nSw = swIn.filter(function (x) { return x.length; }).length;
            if (!nSw) out.push({ cat: 'dv-sw', a: 'na', source: 'Items', why: 'Every item realizing these inputs is hardware in the item list (' + listJoin(uniq([].concat.apply([], ins.map(function (i) { return i.items.map(itemWords); })))) + '), so no software is involved.' });
            else if (nSw >= 2) {
                var dis = [].concat.apply([], swIn).filter(function (it) { return /dissimilar/i.test(S(it.description)); });
                out.push(dis.length ? { cat: 'dv-sw', a: 'no', source: 'Items', why: 'More than one input runs software, and the item list records ' + listJoin(dis.map(itemWords)) + ' as dissimilar.' }
                                    : { cat: 'dv-sw', a: 'concern', source: 'Items', why: 'More than one input runs software (' + listJoin(uniq([].concat.apply([], swIn).map(itemWords))) + ') and the item list does not record them as dissimilar.' });
            }
        }
        // 5. where the items sit: the CAD model's zones
        var Zm = Z();
        if (Zm && ins.every(function (i) { return i.zones.length; })) {
            var hits = [], near = [];
            pairs(ins.length).forEach(function (p) {
                ins[p[0]].zones.forEach(function (za) { ins[p[1]].zones.forEach(function (zb) {
                    if (za === zb) hits.push({ z: za, p: p, how: 'in the same zone ' + zoneWords(za) });
                    else if (safe(function () { return Zm.isDescendant(za, zb); }, false)) hits.push({ z: zb, p: p, how: 'in nested zones inside ' + zoneWords(zb) });
                    else if (safe(function () { return Zm.isDescendant(zb, za); }, false)) hits.push({ z: za, p: p, how: 'in nested zones inside ' + zoneWords(za) });
                    else {
                        var A = safe(function () { return Zm.get(za); }, null), B = safe(function () { return Zm.get(zb); }, null);
                        if (A && B && A.parentId != null && A.parentId === B.parentId) {
                            var bar = safe(function () { return Zm.barrierBetween(za, zb); }, null), cred = bar && safe(function () { return Zm.barrierCredit(bar).credit; }, !!bar.substantiated);
                            if (!cred) near.push({ z: A.parentId, p: p, how: 'in neighboring zones ' + zoneCode(za) + ' and ' + zoneCode(zb) + ' under ' + zoneWords(A.parentId) + ', with no credited barrier between them' });
                        }
                    }
                }); });
            });
            var place = ins.map(function (i) { return '"' + i.name + '" in ' + listJoin(i.zones.map(zoneCode)); });
            if (hits.length || near.length) {
                var L = hits.concat(near), parts0 = uniq(L.map(function (h) { return listJoin(h.p.map(named)) + ' sit ' + h.how; }));
                out.push({ cat: 'im-bay', a: 'concern', source: 'CAD model zones', why: 'The CAD model places ' + listJoin(place) + '. ' + parts0.join('; ') + '.' + uniq(L.map(function (h) { return zsaWords(h.z); })).join('') });
            } else out.push({ cat: 'im-bay', a: 'no', source: 'CAD model zones', why: 'The CAD model places ' + listJoin(place) + ': no two inputs share a zone, nested zones or neighboring zones without a credited barrier.' });
            // 6. particular risks whose footprint covers the zones of more than one input
            var FP = safe(function () { return root.SLCadZonal.praFootprints(); }, []) || [];
            var reach = [];
            FP.forEach(function (f) {
                var at = []; ins.forEach(function (inp, i) { if (inp.zones.some(function (z) { return f.zones[z]; })) at.push(i); });
                if (at.length >= 2) {
                    var pr = arr('praData').find(function (r) { return r && S(r.praId) === S(f.praId); }) || {};
                    reach.push((f.praId ? f.praId + ' ' : '') + T(f.label) + ' reaches ' + listJoin(at.map(named)) + (T(pr.mitigation) ? ' (its mitigation: ' + T(pr.mitigation).replace(/[.]$/, '') + ')' : ''));
                }
            });
            if (reach.length) out.push({ cat: 'im-part', a: 'concern', source: 'Particular risk assessment', why: 'The particular risk assessment shows one event reaching more than one input, so the separation between them must hold against it: ' + reach.join('; ') + '.' });
        }
        // 7. a routing entry carrying items of more than one input
        arr('routingData').forEach(function (rt) {
            var carried = (rt && rt.carriesItems) || []; if (!carried.length) return;
            var at = []; ins.forEach(function (inp, i) { if (inp.items.some(function (it) { return carried.indexOf(S(it.itemId)) >= 0; })) at.push(i); });
            if (at.length >= 2) out.push({ cat: 'cr-if', a: 'concern', source: 'Routing', why: 'Routing ' + S(rt.routingId) + ' ' + T(rt.name) + ' carries ' + listJoin(at.map(named)) + ' together' + ((rt.routesThroughZones || []).length ? ' through ' + listJoin(rt.routesThroughZones.map(S)) : '') + ': one damaged route or connector can cut them all.' });
        });
        return out;
    }
    var SRC_ORDER = ['Fault tree', 'Items', 'CAD model zones', 'Particular risk assessment', 'Routing'];
    // the answers for a set of gates (one claim): a Concern on any gate is a Concern; No or Does not apply only when every
    // gate's data gives that same answer
    function evidence(keys) {
        keys = (keys || []).map(S).filter(function (k) { return !!gateNode(k); });
        return memo('ev:' + keys.slice().sort().join(','), function () {
            var per = keys.map(function (k) { var m = {}; checksFor(k).forEach(function (c) { var x = m[c.cat] || (m[c.cat] = { cat: c.cat, list: [] }); x.list.push(c); }); return m; });
            var cats = uniq([].concat.apply([], per.map(function (m) { return Object.keys(m); }))), out = {};
            cats.forEach(function (cat) {
                var all = per.map(function (m) { return m[cat] ? m[cat].list : null; });
                var flat = [].concat.apply([], all.filter(Boolean));
                var anyC = flat.filter(function (c) { return c.a === 'concern'; });
                var pick = anyC.length ? anyC : (all.every(Boolean) && uniq(flat.map(function (c) { return c.a; })).length === 1 ? flat : null);
                if (!pick) return;
                var srcs = uniq(pick.map(function (c) { return c.source; })).sort(function (a, b) { return SRC_ORDER.indexOf(a) - SRC_ORDER.indexOf(b); });
                out[cat] = { cat: cat, a: pick[0].a, why: uniq(pick.map(function (c) { return c.why; })).join(' '), source: srcs.join(', ') };
            });
            return out;
        });
    }
    // the plain facts the judgment answers (and the AI) rest on, per gate
    function facts(keys) {
        var out = [];
        (keys || []).forEach(function (k) {
            var gt = gate(k), ins = inputs(k); if (!gt) return;
            out.push(gt.displayId + ' ' + gt.name + ' (' + gt.gateType + ' gate in "' + T((pageById(gt.pageId) || {}).name || gt.pageId) + '"), inputs: ' + ins.map(function (i) {
                return '"' + i.name + '"' + (i.dal ? ' (DAL ' + i.dal + ')' : '') + (i.items.length ? ', items ' + i.items.map(function (it) { return itemWords(it) + ' [' + S(it.type) + ', ' + S(it.daType) + ', DAL ' + S(it.dal) + ', system ' + sysName(it.owningSystemId) + (T(it.description) ? ', "' + T(it.description) + '"' : '') + ']'; }).join('; ') : ', no item linked') + (i.zones.length ? ', zones ' + i.zones.map(zoneCode).join(', ') : '');
            }).join('; '));
        });
        return out;
    }

    // ---- the fault tree around the gate, drawn ------------------------------------------------------------------------------
    var BW = 176, BH = 50, HG = 18, VG = 34, SYM = 14, M = 14;
    function wrap(t, n) { var w = S(t).split(/\s+/), L = [], c = ''; w.forEach(function (x) { if ((c + ' ' + x).trim().length > n && c) { L.push(c); c = x; } else c = (c + ' ' + x).trim(); }); if (c) L.push(c); return L; }
    function figure(key, o) {
        o = o || {};
        var gn = gateNode(key); if (!gn) return null;
        var C = o.C || { ink: '#101216', sub: '#3c4350', line: '#5B6270', paper: '#FFFFFF', panel: '#F4F6FA', on: '#1A6EF2', onF: '#E8F0FE', warn: '#9A5B00', warnF: '#FFF4E0' };
        var anchor = o.anchor || ('cmt-' + fp(key)), nodeG = o.nodeG || function (id, inner) { return '<g data-node="' + E(id) + '">' + inner + '</g>'; };
        var trimmed = 0, nodes = [], MAXK = 5, DEPTH = 2;
        // the displayed tree: { n, kind: 'path'|'ctx'|'gate'|'input'|'below'|'more', kids }
        function below(n, d) {
            var ks = kids(n); if (isTransfer(n)) return { n: n, kind: 'below', kids: [], transfer: true };
            if (d >= DEPTH) { trimmed += countUnder(n); return { n: n, kind: 'below', kids: [] }; }
            var show = ks.slice(0, MAXK).map(function (k) { return below(k, d + 1); });
            if (ks.length > MAXK) { var rest = ks.slice(MAXK); var c = rest.length + rest.reduce(function (t, k) { return t + countUnder(k); }, 0); trimmed += c; show.push({ kind: 'more', label: rest.length + ' more ' + (rest.length === 1 ? 'input' : 'inputs'), kids: [] }); }
            return { n: n, kind: 'below', kids: show };
        }
        function countUnder(n) { var c = 0; (function w(x) { kids(x).forEach(function (k) { c++; w(k); }); })(n); return c; }
        var gateTree = { n: gn.node, kind: 'gate', kids: kids(gn.node).map(function (k) { var b = below(k, 1); b.kind = 'input'; return b; }) };
        var tree = gateTree;
        for (var i = gn.path.length - 2; i >= 0; i--) {
            var anc = gn.path[i], child = gn.path[i + 1], sib = kids(anc).filter(function (k) { return k !== child; });
            var ctx = sib.slice(0, 2).map(function (k) { trimmed += countUnder(k); return { n: k, kind: 'ctx', kids: [] }; });
            if (sib.length > 2) { var rs = sib.slice(2); trimmed += rs.length + rs.reduce(function (t, k) { return t + countUnder(k); }, 0); ctx.push({ kind: 'more', label: rs.length + ' other ' + (rs.length === 1 ? 'input' : 'inputs'), kids: [] }); }
            var idx = kids(anc).indexOf(child), list = ctx.slice();
            list.splice(Math.min(idx, list.length), 0, tree);
            tree = { n: anc, kind: 'path', kids: list };
        }
        // layout: leaf slots left to right, parents centered over their children; a node whose children are all ends is
        // drawn with them stacked under it (a rail down the left side), so the picture stays narrow enough to read
        var SB = 40, SG = 8, SI = 18;
        (function mark(t) { t.stack = t.kids.length > 0 && t.kids.every(function (k) { return !k.kids.length; }) && t.kids.length > 1; t.kids.forEach(mark); })(tree);
        var slot = 0;
        (function px(t) { if (!t.kids.length || t.stack) { t.x = slot++; t.kids.forEach(function (k) { k.x = t.x; }); return; } t.kids.forEach(px); t.x = (t.kids[0].x + t.kids[t.kids.length - 1].x) / 2; })(tree);
        var maxY = 0;
        (function py(t, y) { t.y = y; maxY = Math.max(maxY, y + BH);
            if (t.stack) { t.kids.forEach(function (k, i) { k.sy = true; k.y = y + BH + SYM + 14 + i * (SB + SG); maxY = Math.max(maxY, k.y + SB); }); return; }
            t.kids.forEach(function (k) { py(k, y + BH + VG + SYM); }); })(tree, M + 12);
        var W = M * 2 + slot * BW + Math.max(0, slot - 1) * HG, H = maxY + 36;
        var X = function (t) { return M + t.x * (BW + HG); }, Y = function (t) { return t.y; };
        var body = '';
        function sym(t, cx, y) {
            var ty = S(t.n && t.n.gateType).toUpperCase(), w = 22, h = SYM, x = cx - w / 2;
            var path = ty === 'OR' ? 'M' + x + ',' + (y + h) + ' Q' + cx + ',' + (y + h - 5) + ' ' + (x + w) + ',' + (y + h) + ' Q' + (x + w - 2) + ',' + (y + 3) + ' ' + cx + ',' + y + ' Q' + (x + 2) + ',' + (y + 3) + ' ' + x + ',' + (y + h) + ' Z'
                : 'M' + x + ',' + (y + h) + ' L' + x + ',' + (y + h / 2) + ' A' + (w / 2) + ',' + (h / 2) + ' 0 0 1 ' + (x + w) + ',' + (y + h / 2) + ' L' + (x + w) + ',' + (y + h) + ' Z';
            return '<path d="' + path + '" fill="' + C.paper + '" stroke="' + C.line + '" stroke-width="1.2"/>';
        }
        (function draw(t) {
            var x = X(t) + (t.sy ? SI : 0), y = Y(t), bw = t.sy ? BW - SI : BW, bh = t.sy ? SB : BH, cx = X(t) + BW / 2;
            if (t.kids.length) {
                var by = y + BH + SYM;
                body += '<path d="M' + cx + ',' + (y + BH) + ' L' + cx + ',' + by + '" stroke="' + C.line + '" stroke-width="1.2" fill="none"/>' + sym(t, cx, y + BH);
                if (t.stack) {
                    var rx = X(t) + 8, last = t.kids[t.kids.length - 1];
                    body += '<path d="M' + cx + ',' + by + ' L' + cx + ',' + (by + 7) + ' L' + rx + ',' + (by + 7) + ' L' + rx + ',' + (last.y + SB / 2) + '" stroke="' + C.line + '" stroke-width="1.2" fill="none"/>';
                    t.kids.forEach(function (k) { body += '<path d="M' + rx + ',' + (k.y + SB / 2) + ' L' + (X(k) + SI) + ',' + (k.y + SB / 2) + '" stroke="' + C.line + '" stroke-width="1.2" fill="none"/>'; });
                } else {
                    var mid = by + VG / 2, xs = t.kids.map(function (k) { return X(k) + BW / 2; });
                    body += '<path d="M' + cx + ',' + by + ' L' + cx + ',' + mid + (xs.length > 1 ? ' M' + Math.min.apply(null, xs) + ',' + mid + ' L' + Math.max.apply(null, xs) + ',' + mid : '') + '" stroke="' + C.line + '" stroke-width="1.2" fill="none"/>';
                    t.kids.forEach(function (k) { var kx = X(k) + BW / 2; body += '<path d="M' + kx + ',' + mid + ' L' + kx + ',' + Y(k) + '" stroke="' + C.line + '" stroke-width="1.2" fill="none"/>'; });
                }
            }
            var fill = C.panel, stroke = C.line, sw = 1, dash = '', tag = '';
            if (t.kind === 'gate') { fill = C.onF; stroke = C.on; sw = 2.6; tag = 'The critical gate'; }
            else if (t.kind === 'input') { fill = C.warnF; stroke = C.warn; sw = 1.8; dash = ' stroke-dasharray="6 3"'; tag = 'Claimed independent'; }
            else if (t.kind === 'more') { fill = C.paper; dash = ' stroke-dasharray="2 3"'; }
            var head = t.n ? S(t.n.displayId || ((t.n.type === 'gate' ? 'G-' : 'E-') + t.n.id)) + (t.n.type === 'gate' && !isTransfer(t.n) ? ' ' + S(t.n.gateType || '') : isTransfer(t.n) ? ' continues in another tree' : '') : '';
            var nl = t.sy ? 1 : 2, chars = t.sy ? 27 : 30, full = t.n ? wrap(T(t.n.name || ''), chars) : [t.label], lines = full.slice(0, nl);
            if (full.length > nl) lines[nl - 1] = lines[nl - 1].replace(/.{0,3}$/, '') + '...';
            var inner = '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + bh + '" rx="6" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"' + dash + '/>'
                + (head ? '<text x="' + (x + 8) + '" y="' + (y + 14) + '" font-size="10.5" font-weight="700" fill="' + C.ink + '">' + E(head) + '</text>' : '')
                + lines.map(function (l, li) { return '<text x="' + (x + 8) + '" y="' + (y + (head ? 28 : 22) + li * 12) + '" font-size="10.5" fill="' + C.ink + '">' + E(l) + '</text>'; }).join('')
                + (tag ? '<text x="' + (x + bw - 6) + '" y="' + (y + 14) + '" font-size="9" font-weight="700" text-anchor="end" fill="' + C.ink + '">' + E(tag === 'The critical gate' ? 'Critical' : 'Independent') + '</text>' : '');
            if (t.n) {
                var nid = anchor + '-n' + S(t.n.id);
                body += nodeG(nid, inner, T((t.n.displayId ? t.n.displayId + ' ' : '') + (t.n.name || '')));
                nodes.push({ id: nid, kind: t.kind, label: T((t.n.displayId ? t.n.displayId + ' ' : '') + (t.n.name || '')), inputs: kids(t.n).map(function (k) { return T((k.displayId ? k.displayId + ' ' : '') + (k.name || '')); }), gateKey: S(key), nodeId: S(t.n.id), pageId: S(gn.page.id) });
            } else body += inner;
            t.kids.forEach(draw);
        })(tree);
        var ly = H - 14;
        body += '<rect x="' + M + '" y="' + (ly - 9) + '" width="12" height="10" rx="2" fill="' + C.onF + '" stroke="' + C.on + '" stroke-width="2"/><text x="' + (M + 18) + '" y="' + ly + '" font-size="10" fill="' + C.ink + '">The critical gate</text>'
            + '<rect x="' + (M + 128) + '" y="' + (ly - 9) + '" width="12" height="10" rx="2" fill="' + C.warnF + '" stroke="' + C.warn + '" stroke-dasharray="4 2" stroke-width="1.6"/><text x="' + (M + 146) + '" y="' + ly + '" font-size="10" fill="' + C.ink + '">An input claimed independent</text>'
            + '<rect x="' + (M + 330) + '" y="' + (ly - 9) + '" width="12" height="10" rx="2" fill="' + C.panel + '" stroke="' + C.line + '"/><text x="' + (M + 348) + '" y="' + ly + '" font-size="10" fill="' + C.ink + '">Shown for context</text>';
        W = Math.max(W, M * 2 + 470);
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" font-family="Arial, Helvetica, sans-serif" role="img" aria-label="' + E('Fault tree around ' + S(gn.node.displayId || gn.node.id)) + '" data-cmt-gate="' + E(key) + '"><rect width="100%" height="100%" fill="' + C.paper + '"/>' + body + '</svg>';
        return { svg: svg, w: W, h: H, nodes: nodes, trimmed: trimmed, tree: T(gn.page.name || gn.page.id), pathLen: gn.path.length };
    }

    var api = { VERSION: VERSION, analysis: analysis, gates: gates, gate: gate, gateNode: gateNode, inputs: inputs, claimKey: claimKey, claimedWords: claimedWords, groups: groups, groupOf: groupOf,
        evidence: evidence, checksFor: checksFor, facts: facts, figure: figure, zonesOfItem: zonesOfItem, sevWords: sevWords, forget: forget, leaves: leaves, itemOf: itemOf, itemByCode: itemByCode, fp: fp };
    try { root.SLCmaClaims = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
