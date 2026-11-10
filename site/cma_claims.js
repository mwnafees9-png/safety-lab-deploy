// cma_claims.js (SLCmaClaims v1.2, 10 Nov 2026: figure() draws a whole tree handed in; v1.1 10 Nov 2026; v1.0 the same day): the independence claims of the CMA, worked out from the project data.
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
//   figure(key, o)     (v1.1) the fault tree the gate sits in, drawn as the tool's own canvas draws it, the gate and its
//                      inputs marked; trees over 40 nodes (or wider than 6 columns) cut into parts (see below).
(function (root) {
    'use strict';
    var VERSION = '1.2';   // 1.2 10 Nov 2026: figure() draws a whole tree handed in (o.page, o.noMarks, o.metrics) for the PASA and PSSA reports
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

    // ---- v1.1: the fault tree as the tool draws it ---------------------------------------------------------------------------
    // Waqas, 10 Nov 2026, on v1.0's own sketch: "why are we showing them like these instead of the actual fault trees from the
    // tool?"; then: trees "over 40 nodes be cut down, cropped and shown as multiple images". So the picture is the canvas's
    // own drawing, as its Word and PDF picture draws it (SLFtaEdit.exportClone): the canvas layout (d3.tree with the canvas's
    // node size and separation, avoidNodeOverlap, the engineer's own moves when the tree is drawn whole), its connectors
    // (down, across, down into the top of the box), its description box, ID box and P per flight / per flight hour line
    // (formatNodeMetrics), its gate and event symbols and colors (getShapePath, getNodeColors) and its DAL badges. Drawn as
    // plain SVG (no editing boxes) so it goes to Word and print too. On top: the critical gate outlined and labeled, the
    // inputs claimed independent outlined dashed and labeled. Up to MAX_NODES the whole tree is one picture; a bigger tree
    // (or one wider than MAX_COLS columns, the limit the printed fault trees use, which would be unreadable at page width) is cut at its largest branches into
    // parts, each cut point naming the part it continues in. Parts are lettered (part A, part B): a label, not a count.
    var MAX_NODES = 40, MAX_COLS = 6, NODE_W = 160, BOX_TOP = 30;   // 6 columns: the same limit as the tool's printed fault trees (fta_print.js), so the text stays readable on a page and in Word
    // the canvas's own pieces: top-level functions and constants of the app's scripts (shared global scope; no eval, the CSP forbids it)
    /* global getShapePath, getNodeColors, formatNodeMetrics, avoidNodeOverlap, dalPrefixForNode, DAL_COLORS, _FTA_DESC_BOX_HEIGHT, _ftaNodeVerticalSpacing */
    function gl(name) {
        try {
            switch (name) {
                case 'getShapePath': return typeof getShapePath !== 'undefined' ? getShapePath : root.getShapePath;
                case 'getNodeColors': return typeof getNodeColors !== 'undefined' ? getNodeColors : root.getNodeColors;
                case 'formatNodeMetrics': return typeof formatNodeMetrics !== 'undefined' ? formatNodeMetrics : root.formatNodeMetrics;
                case 'avoidNodeOverlap': return typeof avoidNodeOverlap !== 'undefined' ? avoidNodeOverlap : root.avoidNodeOverlap;
                case 'dalPrefixForNode': return typeof dalPrefixForNode !== 'undefined' ? dalPrefixForNode : root.dalPrefixForNode;
                case 'DAL_COLORS': return typeof DAL_COLORS !== 'undefined' ? DAL_COLORS : root.DAL_COLORS;
                case '_FTA_DESC_BOX_HEIGHT': return typeof _FTA_DESC_BOX_HEIGHT !== 'undefined' ? _FTA_DESC_BOX_HEIGHT : root._FTA_DESC_BOX_HEIGHT;
                case '_ftaNodeVerticalSpacing': return typeof _ftaNodeVerticalSpacing !== 'undefined' ? _ftaNodeVerticalSpacing : root._ftaNodeVerticalSpacing;
            }
        } catch (_) {}
        return root[name];
    }
    function figure(key, o) {
        o = o || {};
        // v1.2 (10 Nov 2026, the PASA and PSSA Autopilots): o.page draws a whole tree the caller hands in (the integrated tree
        // built for the report, never stored), with no gate marked (o.noMarks); o.metrics(node) gives the probability line
        // from the tree's own data, so a tree that is not open on the canvas shows its own numbers
        var gn = o.page && o.page.root ? { page: o.page, node: o.page.root, path: [o.page.root] } : gateNode(key); if (!gn) return null;
        var d3 = root.d3, shape = gl('getShapePath'), colors = gl('getNodeColors'), metrics = gl('formatNodeMetrics');
        if (!d3 || typeof shape !== 'function' || typeof colors !== 'function') return null;
        var C = o.C || { ink: '#0f172a', sub: '#475569', line: '#94a3b8', paper: '#ffffff', panel: '#ffffff', on: '#1A6EF2', onF: '#EAF2FE', warn: '#B26A00', warnF: '#FDF1DE' };
        var dark = !!o.dark, anchor = o.anchor || ('cmt-' + fp(key)), nodeG = o.nodeG || function (id, inner) { return '<g data-node="' + E(id) + '">' + inner + '</g>'; };
        var page = gn.page, gateN = o.noMarks ? null : gn.node, inputs = o.noMarks ? [] : kids(gn.node), pathSet = new Set(gn.path);
        var DAL_C = gl('DAL_COLORS') || { A: '#dc3545', B: '#f97316', C: '#eab308', D: '#fcd34d', E: '#cbd5e1' }, prefix = gl('dalPrefixForNode');
        var descDefault = (gl('_FTA_DESC_BOX_HEIGHT') || 100) + 44, vsp = (function () { var f = gl('_ftaNodeVerticalSpacing'); try { return f ? f() : 274; } catch (_) { return 274; } })();
        // ---- cut the tree into parts --------------------------------------------------------------------------------
        var sizeOf = new Map();
        (function sz(n) { var t = 1; kids(n).forEach(function (k) { t += sz(k); }); sizeOf.set(n, t); return t; })(page.root);
        var parts = [], partOf = new Map();
        function inPart(rootN, cuts) { var list = []; (function w(n) { list.push(n); if (n !== rootN && cuts.has(n)) return; kids(n).forEach(w); })(rootN); return list; }
        function leavesIn(rootN, cuts) { var c = 0; (function w(n) { var ks = (n !== rootN && cuts.has(n)) ? [] : kids(n); if (!ks.length) { c++; return; } ks.forEach(w); })(rootN); return c; }
        (function split(rootN) {
            var part = { root: rootN, cuts: new Set() }; parts.push(part);
            for (var guard = 0; guard < 200; guard++) {
                var list = inPart(rootN, part.cuts);
                if (list.length <= MAX_NODES && leavesIn(rootN, part.cuts) <= MAX_COLS) break;
                var sub = function (n) { return inPart(n, part.cuts).length; };
                var cand = list.filter(function (n) { return n !== rootN && !part.cuts.has(n) && kids(n).length; });
                if (!cand.length) break;
                // the largest branch that fits a part of its own; else the largest of all
                cand.sort(function (a, b) { return sub(b) - sub(a); });
                var fit = cand.filter(function (n) { return sub(n) <= MAX_NODES && sub(n) > 1; }), pick = fit.length ? fit[0] : cand[0];
                if (pick === rootN) break;
                part.cuts.add(pick);
            }
            Array.from(part.cuts).forEach(function (c) { partOf.set(c, null); });
            // each cut branch is its own part, in the order they appear in the tree
            var order = []; (function w(n) { if (n !== rootN && part.cuts.has(n)) { order.push(n); return; } kids(n).forEach(w); })(rootN);
            order.forEach(function (c) { partOf.set(c, parts.length); split(c); });
        })(page.root);
        // ---- draw each part ---------------------------------------------------------------------------------------------
        var out = [], gatePart = -1;
        parts.forEach(function (part, pi) {
            var h = d3.hierarchy(part.root, function (n) { return (n !== part.root && part.cuts.has(n)) ? null : (kids(n).length ? kids(n) : null); });
            d3.tree().nodeSize([165, vsp]).separation(function (a, b) { return a.parent === b.parent ? 1.05 : 1.2; })(h);
            try { var av = gl('avoidNodeOverlap'); if (typeof av === 'function') av(h); } catch (_) {}
            if (parts.length === 1) h.each(function (d) { d.x += (d.data.xOffset || 0); d.y += (d.data.yOffset || 0); });
            var ds = h.descendants(), H = function (d) { return d.data.descBoxHeight || descDefault; };
            var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            ds.forEach(function (d) { minX = Math.min(minX, d.x - NODE_W / 2 - 12); maxX = Math.max(maxX, d.x + NODE_W / 2 + 12); minY = Math.min(minY, d.y - BOX_TOP - H(d) - 22); maxY = Math.max(maxY, d.y + 58); });
            var ox = 16 - minX, oy = 16 - minY, W = Math.ceil(maxX - minX + 32), HH = Math.ceil(maxY - minY + 32 + 24);
            var body = '', nodes = [], linkC = dark ? '#5b8fb9' : '#94a3b8';
            h.links().forEach(function (l) {
                var sx = l.source.x + ox, sy = l.source.y + oy, tx = l.target.x + ox, ty = l.target.y + oy - BOX_TOP - H(l.target), mid = (sy + 25 + ty) / 2;
                body += '<path d="M ' + sx + ' ' + (sy + 25) + ' V ' + mid + ' H ' + tx + ' V ' + ty + '" fill="none" stroke="' + linkC + '" stroke-width="1.5"/>';
            });
            ds.forEach(function (d) {
                var n = d.data, x = d.x + ox, y = d.y + oy, hh = H(d), descH = Math.max(20, hh - 44), top = y - BOX_TOP - hh;
                var isGate = n === gateN, isInput = inputs.indexOf(n) >= 0, cut = n !== part.root && part.cuts.has(n);
                if (isGate) gatePart = pi;
                var col = safe(function () { return colors({ data: n }, dark); }, { fill: '#8e8e93', stroke: '#6e6e73' });
                var lines = wrapC(T(n.name || ''), 30, Math.max(1, Math.floor(descH / 12) - 1)), ly0 = top + descH / 2 - (lines.length - 1) * 6 + 3;
                var m = ''; try { m = typeof o.metrics === 'function' ? S(o.metrics(n)) : typeof metrics === 'function' ? S(metrics({ data: n })) : ''; } catch (_) { m = ''; }
                var g = '<g transform="translate(' + x + ',' + y + ')">'
                    + '<rect x="-80" y="' + (-BOX_TOP - hh) + '" width="160" height="' + descH + '" rx="3" fill="' + C.paper + '" stroke="' + C.line + '" stroke-width="1"/>'
                    + lines.map(function (ln, k) { return '<text x="0" y="' + (ly0 - y + k * 12) + '" text-anchor="middle" font-size="10" fill="' + C.ink + '">' + E(ln) + '</text>'; }).join('')
                    + '<rect x="-80" y="' + (-BOX_TOP - hh + descH + 3) + '" width="160" height="18" rx="3" fill="' + C.paper + '" stroke="' + (dark ? '#4f78b5' : '#93c5fd') + '" stroke-width="1"/>'
                    + '<text x="0" y="' + (-BOX_TOP - hh + descH + 16) + '" text-anchor="middle" font-size="10" font-weight="600" fill="' + C.on + '">' + E(S(n.displayId || '')) + '</text>'
                    + (m ? '<text x="0" y="' + (-BOX_TOP - hh + descH + 37) + '" text-anchor="middle" font-size="9.5" font-family="monospace" fill="' + C.ink + '">' + E(m) + '</text>' : '')
                    + '<path d="' + E(shape({ data: n })) + '" fill="' + col.fill + '" stroke="' + col.stroke + '"/>'
                    + (n.allocatedDAL ? '<g transform="translate(35,-22)"><rect x="-27" y="-11" width="54" height="20" rx="5" fill="' + (DAL_C[n.allocatedDAL] || '#9ca3af') + '" stroke="#0f172a" stroke-width="1.25"/><text y="4" text-anchor="middle" font-weight="700" font-size="11" fill="#0f172a">' + E((typeof prefix === 'function' ? safe(function () { return prefix(n); }, 'DAL') : 'DAL') + ' ' + n.allocatedDAL) + '</text></g>' : '')
                    + (cut ? '<text x="0" y="44" text-anchor="middle" font-size="10.5" font-weight="700" fill="' + C.ink + '">Continues in part ' + partLetter(partOf.get(n)) + '</text>' : '')
                    + (isTransfer(n) ? '<text x="0" y="44" text-anchor="middle" font-size="10" font-weight="700" fill="' + C.ink + '">' + E('Continues in "' + T((transferPage(n) || {}).name || 'another tree') + '"') + '</text>' : '')
                    + '</g>';
                // the marks: the critical gate outlined and labeled, the inputs claimed independent dashed and labeled
                if (isGate || isInput) {
                    var mx = x - 84, my = top - 6, mw = 168, mh = (y + 30) - top + 6, lab = isGate ? 'The critical gate' : 'Claimed independent';
                    g += '<rect data-cmt-mark="' + (isGate ? 'gate' : 'input') + '" x="' + mx + '" y="' + my + '" width="' + mw + '" height="' + mh + '" rx="8" fill="none" stroke="' + (isGate ? C.on : C.warn) + '" stroke-width="' + (isGate ? 3 : 2.2) + '"' + (isGate ? '' : ' stroke-dasharray="7 4"') + '/>'
                        + '<rect x="' + (mx + 6) + '" y="' + (my - 10) + '" width="' + (lab.length * 6.2 + 12) + '" height="17" rx="4" fill="' + (isGate ? C.on : C.warnF) + '" stroke="' + (isGate ? C.on : C.warn) + '"/>'
                        + '<text x="' + (mx + 12) + '" y="' + (my + 2) + '" font-size="10.5" font-weight="700" fill="' + (isGate ? (dark ? '#0b1220' : '#ffffff') : C.ink) + '">' + E(lab) + '</text>';
                }
                var nid = anchor + '-n' + S(n.id);
                body += nodeG(nid, g, T((n.displayId ? n.displayId + ' ' : '') + (n.name || '')));
                nodes.push({ id: nid, kind: isGate ? 'gate' : isInput ? 'input' : pathSet.has(n) ? 'path' : 'ctx', label: T((n.displayId ? n.displayId + ' ' : '') + (n.name || '')), inputs: kids(n).map(function (k) { return T((k.displayId ? k.displayId + ' ' : '') + (k.name || '')); }), gateKey: S(key), nodeId: S(n.id), pageId: S(page.id) });
            });
            var ly = HH - 14;
            if (!o.noMarks) body += '<rect x="16" y="' + (ly - 10) + '" width="14" height="11" rx="2" fill="none" stroke="' + C.on + '" stroke-width="2.5"/><text x="36" y="' + ly + '" font-size="10.5" fill="' + C.ink + '">The critical gate</text>'
                + '<rect x="150" y="' + (ly - 10) + '" width="14" height="11" rx="2" fill="none" stroke="' + C.warn + '" stroke-dasharray="4 2" stroke-width="2"/><text x="170" y="' + ly + '" font-size="10.5" fill="' + C.ink + '">An input claimed independent</text>';
            W = Math.max(W, 380);
            out.push({ body: body, W: W, HH: HH, nodes: nodes, part: pi + 1, count: ds.length });
        });
        // every part of one tree at the same width, so they read at the same scale
        var wMax = out.reduce(function (m, p) { return Math.max(m, p.W); }, 0);
        out = out.map(function (p) {
            var W = wMax, HH = p.HH, pi = p.part - 1, dx = Math.round((wMax - p.W) / 2), body = '<g transform="translate(' + dx + ',0)">' + p.body + '</g>';
            var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + HH + '" width="' + W + '" height="' + HH + '" font-family="Helvetica, Arial, sans-serif" role="img" aria-label="' + E('Fault tree ' + T(page.name || page.id) + (parts.length > 1 ? ', part ' + partLetter(pi) : '')) + '" data-cmt-gate="' + E(key) + '" data-cmt-part="' + (pi + 1) + '"><rect width="100%" height="100%" fill="' + C.paper + '"/>' + body + '</svg>';
            return { svg: svg, w: W, h: HH, nodes: p.nodes, part: p.part, letter: partLetter(p.part - 1), of: parts.length, count: p.count };
        });
        return { parts: out, gatePart: gatePart + 1, total: sizeOf.get(page.root), tree: T(page.name || page.id), pathLen: gn.path.length };
    }
    // parts are lettered (A, B, ... Z, AA): a figure label, never a count in the report's words
    function partLetter(i) { var s0 = '', n = i + 1; while (n > 0) { var m = (n - 1) % 26; s0 = String.fromCharCode(65 + m) + s0; n = Math.floor((n - 1) / 26); } return s0; }
    function wrapC(text, max, lines) {
        var words = S(text).split(/\s+/).filter(Boolean), out = [], cur = '';
        words.forEach(function (w) { if ((cur + ' ' + w).trim().length <= max) cur = (cur + ' ' + w).trim(); else { if (cur) out.push(cur); cur = w.length > max ? w.slice(0, max - 1) + '…' : w; } });
        if (cur) out.push(cur);
        if (out.length > lines) { out.length = lines; out[lines - 1] = out[lines - 1].slice(0, max - 1) + '…'; }
        return out;
    }

    var api = { VERSION: VERSION, analysis: analysis, gates: gates, gate: gate, gateNode: gateNode, inputs: inputs, claimKey: claimKey, claimedWords: claimedWords, groups: groups, groupOf: groupOf,
        evidence: evidence, checksFor: checksFor, facts: facts, figure: figure, zonesOfItem: zonesOfItem, sevWords: sevWords, forget: forget, leaves: leaves, itemOf: itemOf, itemByCode: itemByCode, fp: fp };
    try { root.SLCmaClaims = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
