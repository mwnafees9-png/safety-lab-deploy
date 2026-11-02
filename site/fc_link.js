// ============================================================================
// fc_link.js, v2.0, 31 Oct 2026: a fault tree is linked to its failure condition by the app, from the FHA, and nobody
// can link it wrongly.
//
// Waqas, 30 Oct 2026: "we are linking the PL failure conditions, it keeps blanking out and not showing updated link or
// picking up the DAL"; "his picker was populated with every single failure condition if quantitative analyses are not
// applicable no fault trees get prepopulated". 31 Oct 2026: "what is the dialogue box which tree is this for, why are
// we not picking up the hazard assessment and doing the population automatically"; "they should be able to add trees if
// they want to, thats what the standalone section is for"; "why would they be wrongly linked, they should be linked to
// the failure condition from the FHA automatically, there shouldnt be any room for errors".
//
// THE RULES (v2.0 replaces v1's "which tree is this for?" question and its open-project questions):
//   ONE TREE    every failure condition that takes a tree (24 Oct rule: Major or worse, 1309 chart quantitative or not
//               answered) has one PASA or PSSA tree, made by fc_auto_trees.js. Its link is WORKED OUT, never typed:
//               every FHA row of its condition, worst severity first (enforce()). Its name, top event and FC ID follow
//               the condition too, and its target and DAL come from it.
//   THE PICKERS on a PASA or PSSA tree show what the tree is for. Picking another condition OPENS that condition's
//               tree (go()); nothing is relinked and nothing is asked. A condition that takes no tree is greyed with
//               the reason. A hand-made tree that already sits at that level never becomes a second tree for a
//               condition that has one.
//   STANDALONE  trees anyone builds by hand live in Standalone and may be linked to any condition, for reference (a
//               side study, a qualitative tree): they never replace the condition's own tree (SLFcTrees.treeFor
//               counts only the PASA and PSSA levels).
//   OLD DAMAGE  a tree the old pickers left linked wrongly is put right on its own (enforce(), run whenever the project
//               changes): an app-made tree goes back to exactly its condition; a stray pick that never took effect is
//               dropped. Each fix is written to the change log. No question is asked.
//   ANEM        fcContext(row) gives each condition its FCIM mode, function, phases, effects and the other conditions
//               of the same function; untouchedTree(row) is the empty tree a drafted tree fills; sameAs(root, row)
//               names a condition whose tree has exactly the same events.
//
// API (window.SLFcLink): rowsFor, linkedRows, currentRow, levelOf, isOwnTree, go, enforce, linkTo, treeNeed,
// untouchedTree, sameAs, fcContext, contextLine, label. Kill switch for the background enforce: SL_FC_LINK_OFF = true.
// Load: after fc_auto_trees.js. Tests: tests/regression_fc_link_20261030.test.js.
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '2.0';   // 2.0 31 Oct 2026: no relinking and no questions; the link is worked out from the condition (see the header)

    function _g(n) {
        try { var E = root.SLEnv; if (E && typeof E.get === 'function') { var v = E.get(n); if (v !== undefined) return v; } } catch (_) {}
        try { return root[n]; } catch (_) { return undefined; }
    }
    function T() { return root.SLFcTrees || null; }
    function _pages() { var p = _g('ftaPages'); return Array.isArray(p) ? p : (root.ftaPages || []); }
    function _ac() { var a = _g('acFhaData'); return Array.isArray(a) ? a : []; }
    function _systems() { var s = _g('systemsData'); return Array.isArray(s) ? s : []; }
    function _rank(sev) { var R = _g('SEVERITY_RANK') || { 'Catastrophic': 5, 'Hazardous': 4, 'Major': 3, 'Minor': 2, 'Negligible': 1 }; return R[sev] || 0; }
    function _call(name) { var f = root[name]; if (typeof f !== 'function') f = _g(name); if (typeof f !== 'function') return; try { return f.apply(root, Array.prototype.slice.call(arguments, 1)); } catch (e) { try { console.warn('[fc_link] ' + name, e); } catch (_) {} } }
    function _kids(n) { return (n && (n.children || n._children)) || []; }
    function _links(p) { return (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds.map(String) : (p.linkedFhaId != null && p.linkedFhaId !== '' ? [String(p.linkedFhaId)] : []); }
    function _resolve(id) {
        if (id == null || id === '') return null;
        var r = _call('_resolveLinkedFha', id);
        if (r) return r;
        var s = String(id).replace(/^(AC_|SYS_)/, ''), hit = _ac().find(function (x) { return x && String(x.internalId) === s; });
        if (hit) return hit;
        _systems().some(function (sy) { hit = ((sy && sy.fha) || []).find(function (x) { return x && String(x.internalId) === s; }); return !!hit; });
        return hit || null;
    }
    function _topDown(p) { return !!(p && !p.verifies && (p.mode || 'top-down') === 'top-down'); }
    function _scopeOf(row) {
        if (_ac().indexOf(row) >= 0) return 'ac';
        return _systems().find(function (s) { return s && (s.fha || []).indexOf(row) >= 0; }) || null;
    }

    // ---- one failure condition ----------------------------------------------------------------------------
    function groupOf(row) { var t = T(); if (!t || !row) return null; try { return t.groupOf(row) || null; } catch (_) { return null; } }
    function _key(row) { var g = groupOf(row); var s = _scopeOf(row); return (s === 'ac' ? 'ac' : (s ? 'sys:' + s.id : '?')) + '|' + (g ? g.key : 'row:' + (row && row.internalId)); }
    // the rows a tree for this condition links to: the worst-severity rows, governing first, then the others
    function rowsFor(row) {
        var g = groupOf(row);
        if (!g) return row ? [row] : [];
        return g.worst.concat(g.rows.filter(function (r) { return g.worst.indexOf(r) < 0; }));
    }
    function label(row) { return row ? String(row.fcId || ('#' + row.internalId)) : ''; }
    function labelSev(row) { return row ? label(row) + (row.severity ? ' (' + row.severity + ')' : '') : ''; }
    function linkedRows(page) {
        var out = [];
        if (!page) return out;
        _links(page).forEach(function (l) { var r = _resolve(l); if (r && out.indexOf(r) < 0) out.push(r); });
        return out;
    }
    // the conditions a tree's links reach, governing row of each, in link order
    function _linkedConditions(page) {
        var seen = {}, out = [];
        linkedRows(page).forEach(function (r) {
            var k = _key(r); if (seen[k]) return; seen[k] = 1;
            var g = groupOf(r); out.push(g ? g.gov : r);
        });
        return out;
    }
    // the row that decides the tree's target and DAL today: the worst severity of what it links to
    function currentRow(page) {
        var rows = linkedRows(page), best = null;
        rows.forEach(function (r) { if (!best || _rank(r.severity) > _rank(best.severity)) best = r; });
        return best;
    }
    function _isWorked(page) {
        if (!page || !page.root) return false;
        var t = T();
        if (page.autoFcTree && t && typeof t.shapeFp === 'function') { try { return t.shapeFp(page.root) !== page.autoFcTree.fp; } catch (_) {} }
        return _kids(page.root).length > 0;
    }
    function _treeFor(row) { var t = T(), g = groupOf(row); if (!t || !g || typeof t.treeFor !== 'function') return null; try { return t.treeFor(g); } catch (_) { return null; } }
    // the tree the app made for this condition, while nobody has built on it
    function untouchedTree(row, except) {
        var g = groupOf(row), t = T();
        if (!g || !t) return null;
        var hit = _pages().find(function (p) {
            if (p === except || !_topDown(p) || !p.root || !p.autoFcTree || p.autoFcTree.kept) return false;
            if (p.autoFcTree.key !== g.key) return false;
            if (g.scope === 'ac' ? p.autoFcTree.scope !== 'ac' : String(p.autoFcTree.systemId) !== String(g.sys.id)) return false;
            return !_isWorked(p);
        });
        return hit || null;
    }

    // ---- which conditions take a tree (the 24 Oct 2026 rule, fc_auto_trees) ------------------------------------
    // Waqas, 30 Oct 2026: "his picker was populated with every single failure condition if quantitative analyses are
    // not applicable no fault trees get prepopulated". A condition takes a tree when it is Major or worse and its 1309
    // chart says quantitative or is not answered (SLFcTrees needsTree). Any other condition is not offered for linking:
    // the pickers show it greyed with the reason, and go() refuses it on a PASA or PSSA tree.
    function treeNeed(row) {
        var g = groupOf(row);
        if (!g) return { needs: true, why: '' };
        if (g.needsTree) return { needs: true, why: '' };
        var gov = g.gov || row, r = g.route, why;
        if (_rank(gov.severity) < 3) why = (/^(negligible|nse|no safety effect)$/i.test(String(gov.severity || '').trim()) ? 'No Safety Effect' : (gov.severity || 'Not classified yet')) + ': no fault tree (only Major or worse get one)';
        else if (r === 'qual') why = 'qualitative per the 1309 chart: no fault tree';
        else if (r === 'similarity') why = 'shown by similarity per the 1309 chart: no fault tree';
        else why = 'the 1309 chart calls for no fault tree';
        return { needs: false, why: why };
    }

    // ---- where a tree lives ------------------------------------------------------------------------------------
    // 'pasa' / 'pssa' (an aircraft or a system top-down tree), 'standalone', or '' (a verification tree, bottom-up)
    function levelOf(page) {
        if (!_topDown(page)) return '';
        if (page.treeLevel === 'aircraft') return 'pasa';
        if (page.treeLevel === 'system') return 'pssa';
        return 'standalone';
    }
    // the condition an app-made tree was made for (its governing row), or null
    function _ownCondition(page) {
        var a = page && page.autoFcTree; if (!a || !a.key) return null;
        var t = T(); if (!t || typeof t.groups !== 'function') return null;
        var scope = a.scope === 'ac' ? 'ac' : _systems().find(function (s) { return s && String(s.id) === String(a.systemId); });
        if (!scope) return null;
        var g = null; try { g = t.groups(scope).find(function (x) { return x.key === a.key; }) || null; } catch (_) { g = null; }
        return g;
    }
    // is this page the condition's own tree (the one its target and DAL live on)?
    function isOwnTree(page, row) {
        var lv = levelOf(page); if (lv !== 'pasa' && lv !== 'pssa') return false;
        var own = _treeFor(row); return !!own && own === page;
    }

    // ---- linking (the app's own writes; never a person's pick on a PASA or PSSA tree) ---------------------------
    function _retarget(page) {
        var t = T();
        if (!t || typeof t.effectiveTarget !== 'function' || page.targetManual) return null;
        var e = null; try { e = t.effectiveTarget(page); } catch (_) { e = null; }
        if (!e || e.rate == null) return e;
        page.targetP = e.rate;
        page.targetBasis = { used: e.used, classTarget: e.classTarget, severity: e.severity, aircraft: e.aircraft };
        return e;
    }
    function _dropEmptyTwin(page, row) {
        var twin = untouchedTree(row, page);
        if (!twin) return null;
        var pages = _pages(), i = pages.indexOf(twin);
        if (i >= 0) pages.splice(i, 1);
        _log('tree-removed', twin.name + ' removed: "' + (page.name || page.id) + '" is the tree for ' + label(row) + ' (a failure condition has one tree)');
        return twin;
    }
    function _log(kind, text) { try { if (typeof root.jrnl === 'function') root.jrnl(kind, text); } catch (_) {} }
    // link a tree to exactly this row's condition: every row of it, worst first (ANEM's drafted trees; a standalone pick)
    function linkTo(page, row) {
        if (!page || !row) return null;
        var rows = rowsFor(row), gov = rows[0];
        page.linkedFhaIds = rows.map(function (r) { return r.internalId; });
        page.linkedFhaId = gov.internalId;
        if (gov.subId) page._wizardSubId = gov.subId;   // the guided picker opens on its function
        var lv = levelOf(page), twin = (lv === 'pasa' || lv === 'pssa') ? _dropEmptyTwin(page, row) : null;
        var e = _retarget(page);
        _call('scheduleAutosave');
        return { rows: rows, gov: gov, target: e, removed: twin ? twin.id : null };
    }
    // the condition's own tree, opened (made first if it should have one and somehow does not)
    function _openOwnTree(row) {
        var t = T(), g = groupOf(row);
        var own = _treeFor(row);
        if (!own && t && g && g.needsTree && typeof t.makeTree === 'function') { try { own = t.makeTree(g); } catch (_) { own = null; } }
        if (!own) return null;
        _call('openFTAPageById', own.id);
        _call('scheduleAutosave');
        return own;
    }
    // What picking a failure condition on a tree does. Never asks.
    //   PASA / PSSA tree: the same condition: nothing; another condition that takes a tree: its own tree opens (this
    //     tree is left exactly as it is); a condition that takes no tree: refused, with the reason.
    //   Standalone tree: linked to it, for reference (any condition, a qualitative study of a Minor one included).
    // Returns { action: 'same' | 'opened' | 'refused' | 'linked', page, why? }.
    function go(page, row) {
        if (!page || !row) return { action: 'none' };
        var lv = levelOf(page);
        if (lv === 'standalone') { linkTo(page, row); _log('tree-linked', '"' + (page.name || page.id) + '" (standalone) linked to ' + label(row) + ' for reference'); return { action: 'linked', page: page }; }
        var need = treeNeed(row);
        if (!need.needs) return { action: 'refused', page: page, why: label(row) + ' is ' + need.why + '. To study it anyway, build a tree in Standalone and link it there.' };
        var want = _key(row);
        if (_linkedConditions(page).some(function (c) { return _key(c) === want; })) return { action: 'same', page: page };
        var own = _openOwnTree(row);
        if (own) return { action: 'opened', page: own };
        return { action: 'refused', page: page, why: label(row) + ' has no tree yet; it is made as soon as its FHA row is saved.' };
    }

    // ---- the link, worked out (and old damage put right) ---------------------------------------------------------
    function _sameIds(a, b) { return (a || []).map(String).join('|') === (b || []).map(String).join('|'); }
    // returns how many trees were corrected
    function enforce() {
        var t = T(), fixed = 0, dirty = false;
        _pages().forEach(function (p) {
            if (!p || !p.root || !_topDown(p)) return;
            // 1. an app-made tree: exactly its condition, named for it
            if (p.autoFcTree) {
                var g = _ownCondition(p); if (!g) return;   // its condition is gone: fc_auto_trees asks about it
                var rows = g.worst.concat(g.rows.filter(function (r) { return g.worst.indexOf(r) < 0; }));
                var ids = rows.map(function (r) { return r.internalId; }), gov = rows[0];
                var notes = [];
                if (!_sameIds(p.linkedFhaIds, ids)) {
                    var was = _linkedConditions(p).map(label).join(', ') || 'nothing';
                    p.linkedFhaIds = ids; notes.push('linked to ' + label(gov) + ' (was ' + was + ')');
                }
                // the single pointer: unset stays unset (the rows are the link; a write here would be a change nobody made);
                // one of its own rows other than the worst is set to the worst quietly; one at another condition is an
                // old stray pick and goes in the change log
                if (p.linkedFhaId != null && p.linkedFhaId !== '' && String(p.linkedFhaId) !== String(gov.internalId)) {
                    var was1 = _resolve(p.linkedFhaId);
                    if (!notes.length && (!was1 || ids.map(String).indexOf(String(was1.internalId)) < 0)) notes.push('a pick of ' + (was1 ? label(was1) : 'a condition no longer in the FHA') + ' that never took effect was dropped');
                    p.linkedFhaId = gov.internalId; dirty = true;
                }
                var untouched = false; try { untouched = !!(t && t.shapeFp && t.shapeFp(p.root) === p.autoFcTree.fp); } catch (_) {}
                var desc = String(gov.fcDesc || g.fcId || 'Failure condition');
                var name = (g.scope === 'ac' ? 'PASA' : 'PSSA') + ' · ' + (g.fcId ? g.fcId + ' ' : '') + desc.slice(0, 50);
                if (p.name !== name) { notes.push('renamed for its condition'); p.name = name; }
                if (p.root.name !== desc) { p.root.name = desc; notes.push('top event named for its condition'); }
                if (g.fcId && p.root.displayId !== g.fcId) { p.root.displayId = g.fcId; dirty = true; }
                if (untouched) {
                    _kids(p.root).forEach(function (c) { if (c && c.type === 'undeveloped' && /^Decompose: causes of /.test(c.name || '') && c.name !== 'Decompose: causes of ' + desc) c.name = 'Decompose: causes of ' + desc; });
                    try { p.autoFcTree.fp = t.shapeFp(p.root); } catch (_) {}
                }
                if (notes.length) { fixed++; _retarget(p); _log('tree-link-fixed', '"' + p.name + '": ' + notes.join('; ') + '. The app keeps each tree on the failure condition it was made for.'); }
                return;
            }
            // 2. any other tree: a stray pick that never took effect (the old guided picker wrote it beside the real
            //    links) is dropped; the links themselves are left as they were made
            if (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length && p.linkedFhaId != null && p.linkedFhaId !== '') {
                var pick = _resolve(p.linkedFhaId), k = pick ? _key(pick) : null;
                if (pick && !_linkedConditions(p).some(function (c) { return _key(c) === k; })) {
                    var cur = currentRow(p);
                    if (cur) { p.linkedFhaId = cur.internalId; fixed++; _log('tree-link-fixed', '"' + (p.name || p.id) + '": a pick of ' + label(pick) + ' that never took effect was dropped; it stays with ' + _linkedConditions(p).map(label).join(', ') + '.'); }
                }
            }
        });
        if (fixed || dirty) { _call('scheduleAutosave'); _call('renderFTASidebar'); _call('syncFtaConfigFromActivePage'); }
        return fixed;
    }

    // ---- for ANEM ---------------------------------------------------------------------------------------------
    // the condition as the FCIM and the FHA describe it, and the other conditions of the same function
    var MODE_WORDS = { tl: 'total loss', pl: 'partial loss', m: 'malfunction' };
    function _fcimRows(scope) { return scope === 'ac' ? (_g('acFcimData') || []) : ((scope && scope.fcim) || []); }
    function _modeOf(fcId, scope) {
        var id = String(fcId || '').trim(); if (!id) return null;
        var hit = null;
        _fcimRows(scope).some(function (r) {
            if (!r) return false;
            ['tl', 'pl', 'm'].some(function (k) { if (String(r[k + 'Id'] || '').trim() === id) { hit = { mode: MODE_WORDS[k], desc: r[k + 'Desc'] || '', awareness: r.awareness || '', subId: r.subId || '' }; return true; } return false; });
            if (!hit) ['plExtra', 'mExtra'].some(function (k) { return (Array.isArray(r[k]) ? r[k] : []).some(function (e) { if (e && String(e.id || '').trim() === id) { hit = { mode: k === 'plExtra' ? 'partial loss' : 'malfunction', desc: e.desc || '', awareness: r.awareness || '', subId: r.subId || '' }; return true; } return false; }); });
            return !!hit;
        });
        return hit;
    }
    function _functionName(subId, scope) {
        var id = String(subId || '').trim(); if (!id) return '';
        var f = (_g('acFunctionsData') || []).find(function (x) { return x && (String(x.subId || '') === id || String(x.funcId || '') === id); });
        if (f) return f.subName || f.funcName || '';
        if (scope && scope !== 'ac') { f = (scope.functions || []).find(function (x) { return x && String(x.funcId || '') === id; }); if (f) return f.funcName || ''; }
        return '';
    }
    function fcContext(row) {
        if (!row) return null;
        var scope = _scopeOf(row);
        var m = _modeOf(row.fcId, scope) || {};
        var out = {
            fcId: row.fcId || '', mode: m.mode || '', fcimText: m.desc || '', awareness: m.awareness || '',
            subId: row.subId || m.subId || '', functionName: _functionName(row.subId || m.subId, scope),
            phases: row.phases || '', effectAircraft: row.effAc || '', effectCrew: row.effCrew || '', siblings: []
        };
        if (out.subId) {
            var rows = scope === 'ac' ? _ac() : ((scope && scope.fha) || []), seen = {};
            seen[String(row.fcId || '#' + row.internalId)] = 1;
            rows.forEach(function (r) {
                if (!r || String(r.subId || '') !== String(out.subId)) return;
                var k = String(r.fcId || '#' + r.internalId); if (seen[k]) return; seen[k] = 1;
                var g = groupOf(r), gv = g ? g.gov : r, mm = _modeOf(gv.fcId, scope) || {};
                out.siblings.push({ fcId: gv.fcId || '', mode: mm.mode || '', desc: gv.fcDesc || '', severity: gv.severity || '' });
            });
        }
        return out;
    }
    function contextLine(row) {
        var c = fcContext(row); if (!c) return '';
        var parts = [];
        if (c.subId) parts.push('function=' + c.subId + (c.functionName ? ' ' + c.functionName : ''));
        if (c.mode) parts.push('FCIM mode=' + c.mode);
        if (c.awareness) parts.push('crew awareness=' + c.awareness);
        if (c.phases) parts.push('phases=' + c.phases);
        if (c.effectAircraft) parts.push('aircraft effect=' + String(c.effectAircraft).slice(0, 160));
        if (c.siblings.length) parts.push('other conditions of this function (each has its own, different tree): ' + c.siblings.map(function (s) { return s.fcId + (s.mode ? ' ' + s.mode : '') + (s.desc ? ' "' + String(s.desc).slice(0, 70) + '"' : ''); }).join('; '));
        return parts.join(' | ');
    }
    // the events under the top, by gate type and name (the top itself is named for its condition, so it is left out)
    function _norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
    function bodyFp(n) {
        return _kids(n).map(function (c) {
            var gate = c.type === 'gate' || (Array.isArray(c.children) && c.children.length > 0 && c.type !== 'basic' && c.type !== 'event');
            return (gate ? String(c.gateType || 'OR').toUpperCase() : 'E') + ':' + _norm(c.name) + (gate ? '[' + bodyFp(c) + ']' : '');
        }).sort().join(',');
    }
    function _size(n) { var k = 0; (function w(x) { _kids(x).forEach(function (c) { k++; w(c); }); })(n); return k; }
    // a different condition at the same level whose tree has exactly these events under its top
    function sameAs(rootNode, row) {
        if (!rootNode || !row || _size(rootNode) < 2) return null;
        var fp = bodyFp(rootNode), myKey = _key(row), scope = _scopeOf(row), hit = null;
        _pages().some(function (p) {
            if (!_topDown(p) || !p.root || _size(p.root) < 2) return false;
            if (scope === 'ac' ? p.treeLevel !== 'aircraft' : (p.treeLevel !== 'system' || !scope || String(p.systemId) !== String(scope.id))) return false;
            var cs = _linkedConditions(p); if (!cs.length || cs.some(function (r) { return _key(r) === myKey; })) return false;
            if (bodyFp(p.root) !== fp) return false;
            hit = { page: p, row: cs[0], fcId: label(cs[0]) };
            return true;
        });
        return hit;
    }

    // ask about mixed trees after a project opens, and whenever one appears
    // whenever the project changes (SLDataChange): the links, worked out again
    var _seenGen = -1;
    function _tick() {
        if (root.SL_FC_LINK_OFF) return;
        try {
            var dc = root.SLDataChange, g = dc && typeof dc.gen === 'function' ? dc.gen() : null;
            if (g != null && g === _seenGen) return;
            // background work nobody made (as fc_auto_trees' sweep): it waits while a change of the person's is open or
            // they are typing, and runs as a SYSTEM change, never listed for the person to confirm
            var CA = root.SLChangeAck;
            try {
                if (CA && typeof CA.status === 'function') { var st = CA.status(); if (st.open || st.timer || st.prompting) return; }
                if (CA && ((typeof CA.typing === 'function' && CA.typing()) || (typeof CA.busy === 'function' && CA.busy()))) return;
            } catch (_) {}
            if (CA && typeof CA.background === 'function') CA.background(function () { return enforce(); });
            else if (CA && typeof CA.system === 'function') CA.system(function () { return enforce(); });
            else enforce();
            if (dc && typeof dc.gen === 'function') _seenGen = dc.gen();
        } catch (_) {}
    }
    if (typeof root.addEventListener === 'function' && typeof document !== 'undefined') {
        root.addEventListener('load', function () { setTimeout(_tick, 3000); setInterval(_tick, 4000); });
    }

    var api = { VERSION: VERSION, rowsFor: rowsFor, linkedRows: linkedRows, currentRow: currentRow, levelOf: levelOf, isOwnTree: isOwnTree,
        go: go, enforce: enforce, ownTree: function (row) { return _treeFor(row); }, linkTo: linkTo, treeNeed: treeNeed, untouchedTree: untouchedTree, sameAs: sameAs, bodyFp: bodyFp,
        fcContext: fcContext, contextLine: contextLine, label: label };
    try { root.SLFcLink = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
