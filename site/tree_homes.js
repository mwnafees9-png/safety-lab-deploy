// ============================================================================
// tree_homes.js, v1.1, 25 Oct 2026: which fault trees a diagram may link (linkPages, linkAllowed, linkOptions).
// Waqas agreed: a diagram's top event (a bow-tie's) links a tree at the diagram's own level; an aircraft event
// tree's headings (its branch points, "backup fails to take over") may also link any system's trees, each named
// with its system (the system owns that number; the aircraft diagram uses it as it is); a system's event tree
// links only its own system's trees. A link made before that the rule no longer offers is kept and shown as
// "(at another level)", never dropped.
// tree_homes.js, v1.0, 24 Oct 2026: every fault tree and diagram has ONE home, decided by the tree itself.
//
// Waqas, 24 Oct 2026: "I want the top down fault trees to be in the PASA, and bottom up trees to be in ASA,
// top down system trees in that systems PSSA, and bottom up ones in that systems SSA"; "the user never selects
// top down or bottom up tree any more, they are already bottom up in ASA SSA and top down in PASA and PSSA";
// "we should have a separate fault trees option for stand alone trees" (there the user picks the direction);
// "diagram tools at both system and aircraft level depending on which level analyses you are doing";
// "diagrams that belong to no level go with the standalone trees in standalone diagram section";
// the all-trees page is dropped.
//
// THE RULE (homeOf):
//   aircraft tree, top-down     -> PASA            aircraft tree, bottom-up     -> ASA
//   system tree,   top-down     -> that system's PSSA
//   system tree,   bottom-up    -> that system's SSA
//   anything else (no level, or a system that no longer exists) -> Standalone
//   Bottom-up means a verification tree (page.verifies) or mode 'bottom-up'; no mode is top-down, the rule the
//   engine already uses ((mode || 'top-down')). A transferred sub-page lives with the tree it belongs to.
//
// WHAT FOLLOWS THE RULE
//   - the Fault Trees page shows the trees of ONE home (SLTreeHomes.current()); a search looks everywhere and
//     groups its hits by home; opening any tree (from anywhere) moves the page to that tree's home;
//   - "+ New Fault Tree" makes a tree for the home on screen: PASA and PSSA trees are top-down, Standalone asks
//     top-down or bottom-up, ASA and SSA make none (their trees are the verification trees of PASA and PSSA);
//   - the toolbar shows the level and the direction as plain words instead of the two dropdowns (Standalone
//     keeps its direction dropdown: the person chose it there);
//   - the diagram tools (bow-tie, event trees, Markov, monitors, exposure cases, frequency) show what belongs to
//     the level being worked on: the aircraft (PASA and ASA trees), one system, or Standalone. A diagram's level
//     comes from what it is built on (a bow-tie from its fault tree, a Markov model from the trees that use it),
//     else the level it was made at (item.level, item.systemId), else Standalone.
//
// API (window.SLTreeHomes): homeOf, dirOf, levelOf, current, open, label, inHome, sections, levelScope,
// itemLevel, inLevel, pageInLevel, pagesInLevel, stamp, barSpec, navArea, decorate.
// Load: after helpers_modules.js, fta_view_modules.js and misc_fn_modules.js; before nav_areas.js.
// Tests: tests/regression_tree_homes_20261024.test.js.
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '1.1';
    var KEY = 'sl-tree-home-v1';
    var DIAGRAM_TABS = ['bowtie', 'eta', 'markov', 'monitors', 'expcase', 'freq'];
    var TREE_TABS = ['fta'].concat(DIAGRAM_TABS);

    function _pages() { try { return (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) ? ftaPages : (root.ftaPages || []); } catch (_) { return []; } }
    function _systems() { try { return (typeof systemsData !== 'undefined' && Array.isArray(systemsData)) ? systemsData : (root.systemsData || []); } catch (_) { return []; } }
    function _pc() { try { return (typeof projectConfig !== 'undefined' && projectConfig) ? projectConfig : (root.projectConfig || {}); } catch (_) { return {}; } }
    function _active() { try { return (typeof activeFTAPageId !== 'undefined') ? activeFTAPageId : root.activeFTAPageId; } catch (_) { return null; } }
    function _setActive(id) { try { activeFTAPageId = id; } catch (_) { root.activeFTAPageId = id; } }
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function _sysById(id) { if (id == null || id === '') return null; var s = _systems(); for (var i = 0; i < s.length; i++) if (s[i] && String(s[i].id) === String(id)) return s[i]; return null; }
    function _sysName(id) { var s = _sysById(id); return s ? (s.name || String(s.id)) : ''; }
    function _call(name) { var f = root[name]; if (typeof f !== 'function') return; try { return f.apply(root, Array.prototype.slice.call(arguments, 1)); } catch (e) { try { console.warn('[tree_homes] ' + name, e); } catch (_) {} } }
    function _toast(m, k, ms) { _call('showToast', m, k || 'info', ms || 4000); }
    function _save() { _call('scheduleAutosave'); }

    // ---- the rule ------------------------------------------------------------------------------
    function dirOf(p) { return (p && (p.verifies || p.mode === 'bottom-up')) ? 'bottom-up' : 'top-down'; }
    // the page a transferred sub-page belongs to (followed up the chain; a loop stops where it closes)
    function _rootOf(p) {
        var byId = {}; _pages().forEach(function (x) { if (x && x.id != null) byId[x.id] = x; });
        var cur = p, seen = {};
        while (cur && cur.transferInFrom && cur.transferInFrom.sourcePageId && byId[cur.transferInFrom.sourcePageId] && !seen[cur.id]) { seen[cur.id] = 1; cur = byId[cur.transferInFrom.sourcePageId]; }
        return cur || p;
    }
    function levelOf(p) {
        var r = _rootOf(p);
        if (!r) return { level: 'standalone', systemId: null };
        if (r.treeLevel === 'aircraft') return { level: 'aircraft', systemId: null };
        if (r.treeLevel === 'system' && _sysById(r.systemId)) return { level: 'system', systemId: String(r.systemId) };
        return { level: 'standalone', systemId: null };
    }
    function homeOf(p) {
        var lv = levelOf(p), d = dirOf(_rootOf(p) || p);
        if (lv.level === 'aircraft') return { home: d === 'bottom-up' ? 'asa' : 'pasa', systemId: null, dir: d };
        if (lv.level === 'system') return { home: d === 'bottom-up' ? 'ssa' : 'pssa', systemId: lv.systemId, dir: d };
        return { home: 'standalone', systemId: null, dir: d };
    }
    function _norm(h) {
        h = h || {};
        var home = ['pasa', 'asa', 'pssa', 'ssa', 'standalone'].indexOf(h.home) >= 0 ? h.home : 'pasa';
        var sid = (home === 'pssa' || home === 'ssa') ? (h.systemId != null ? String(h.systemId) : null) : null;
        if ((home === 'pssa' || home === 'ssa') && !_sysById(sid)) { var s0 = _systems()[0]; if (s0) sid = String(s0.id); else { home = home === 'ssa' ? 'asa' : 'pasa'; sid = null; } }
        return { home: home, systemId: sid };
    }
    function same(a, b) { return !!a && !!b && a.home === b.home && String(a.systemId || '') === String(b.systemId || ''); }
    function inHome(p, h) { return same(homeOf(p), h || _cur); }

    // ---- the home on screen ----------------------------------------------------------------------
    var _cur = { home: 'pasa', systemId: null };
    try { var _saved = root.localStorage && JSON.parse(root.localStorage.getItem(KEY) || 'null'); if (_saved && _saved.home) _cur = { home: _saved.home, systemId: _saved.systemId || null }; } catch (_) {}
    function _remember() { try { if (root.localStorage) root.localStorage.setItem(KEY, JSON.stringify(_cur)); } catch (_) {} }
    function current() { _cur = _norm(_cur); return { home: _cur.home, systemId: _cur.systemId }; }
    function _setCur(h) {
        var n = _norm(h); var changed = !same(n, _cur); _cur = n; _remember();
        if (changed) setTimeout(function () {
            try { if (root.SLNavAreas) root.SLNavAreas.sync(); } catch (_) {}
            // the tab bar over the tree pages names the home: redraw it when the home changes under it
            try { var t = root._slCurrentTab; if (TREE_TABS.indexOf(t) >= 0 && root.SL_PROVE_TABS) root.SL_PROVE_TABS.render(t); } catch (_) {}
            try { if (root.SL_FTA_PICKER) root.SL_FTA_PICKER.render(true); } catch (_) {}
        }, 0);
        return changed;
    }

    function label(h, opts) {
        h = _norm(h || _cur); opts = opts || {};
        var nm = _sysName(h.systemId) || 'System';
        switch (h.home) {
            case 'pasa': return opts.short ? 'PASA' : 'PASA fault trees';
            case 'asa': return opts.short ? 'ASA' : 'ASA verification trees';
            case 'pssa': return opts.short ? nm + ' PSSA' : nm + ' PSSA fault trees';
            case 'ssa': return opts.short ? nm + ' SSA' : nm + ' SSA verification trees';
            default: return opts.short ? 'Standalone' : 'Standalone fault trees';
        }
    }
    function _blurb(h) {
        switch (h.home) {
            case 'pasa': return 'Aircraft trees, worked top-down: the failure condition’s target is shared out down the tree.';
            case 'asa': return 'Aircraft verification trees, worked bottom-up from the real design. Each one checks a PASA tree; they are made from the PASA trees, not here.';
            case 'pssa': return 'This system’s trees, worked top-down: the failure condition’s target is shared out down the tree.';
            case 'ssa': return 'This system’s verification trees, worked bottom-up from the real design. Each one checks a PSSA tree; they are made from the PSSA trees, not here.';
            default: return 'Trees that belong to neither the aircraft nor a system. Each one is worked top-down or bottom-up, as chosen when it was made. Promote one (↑) to give it a home.';
        }
    }

    // open a home: its trees on screen, and a tree of it active (the one already active when it belongs here)
    function open(home, systemId) {
        _setCur({ home: home, systemId: systemId });
        var act = _pages().find(function (p) { return p && p.id === _active(); });
        if (!act || !inHome(act)) {
            var first = _pages().find(function (p) { return p && !(p.transferInFrom && p.transferInFrom.sourcePageId) && inHome(p); }) || _pages().find(function (p) { return p && inHome(p); });
            _setActive(first ? first.id : null);
            try { selectedNodeData = null; } catch (_) {}
            var ncp = typeof document !== 'undefined' && document.getElementById('node-config-panel'); if (ncp) ncp.style.display = 'none';
            if (first) _call('syncFtaConfigFromActivePage');
        }
        _call('switchTab', 'fta');
        _call('renderFTASidebar'); _call('updateD3'); _call('refreshTreeLevelDropdown');
        return current();
    }
    // the tree on screen decides the home (opened from a PSSA panel, the Golden Thread, a bow-tie, a search ...)
    function followActive() {
        // only on the fault tree page: on a diagram page the tree last opened does not decide the level
        try { if (root._slCurrentTab && root._slCurrentTab !== 'fta') return false; } catch (_) {}
        var act = _pages().find(function (p) { return p && p.id === _active(); });
        if (act && !inHome(act)) { var h = homeOf(act); _setCur({ home: h.home, systemId: h.systemId }); return true; }
        return false;
    }

    // ---- the tree list (renderFTASidebar asks for its sections) -------------------------------------
    var ORDER = { pasa: 0, asa: 1, pssa: 2, ssa: 3, standalone: 9 };
    function sections(rootPages, isSearching, subtreeMatches) {
        followActive();
        var cur = current();
        if (!isSearching) {
            return [{ id: 'home-' + cur.home + (cur.systemId ? '-' + cur.systemId : ''), label: label(cur), pages: rootPages.filter(function (p) { return inHome(p, cur); }), isSandbox: cur.home === 'standalone' }];
        }
        // a search looks everywhere: its hits, grouped by home (the home on screen first)
        var groups = {}, keys = [];
        rootPages.forEach(function (p) {
            if (subtreeMatches && !subtreeMatches(p)) return;
            var h = homeOf(p), k = h.home + '|' + (h.systemId || '');
            if (!groups[k]) { groups[k] = { h: h, pages: [] }; keys.push(k); }
            groups[k].pages.push(p);
        });
        keys.sort(function (a, b) {
            var A = groups[a].h, B = groups[b].h;
            if (same(A, cur) !== same(B, cur)) return same(A, cur) ? -1 : 1;
            if (ORDER[A.home] !== ORDER[B.home]) return ORDER[A.home] - ORDER[B.home];
            return _sysName(A.systemId).localeCompare(_sysName(B.systemId));
        });
        return keys.map(function (k) { var g = groups[k]; return { id: 'home-' + k, label: 'In ' + label(g.h), pages: g.pages, isSandbox: g.h.home === 'standalone' }; });
    }

    // ---- the page frame: heading, words, the "+ New" button, the toolbar ---------------------------------
    function decorate() {
        if (typeof document === 'undefined') return;
        var side = document.querySelector('#view-fta .fta-sidebar') || document.createElement('div');
        followActive();   // the tree on screen decides (it may have been opened from elsewhere since the last draw)
        var cur = current();
        var h4 = side.querySelector(':scope > h4'); if (h4) h4.textContent = label(cur);
        var p = side.querySelector(':scope > p'); if (p) p.textContent = _blurb(cur);
        var pick = document.getElementById('fta-tree-pick'); if (pick) pick.title = _blurb(cur);
        var verif = cur.home === 'asa' || cur.home === 'ssa';
        var newText = '+ New ' + (cur.home === 'standalone' ? 'standalone' : label(cur, { short: true })) + ' fault tree';
        // the + New buttons (the picker's, and the hidden pane's): the home's, and none where trees are not made by hand
        [side.querySelector(':scope > button.btn-cyan'), document.getElementById('fta-tree-new')].forEach(function (btn) {
            if (!btn) return; btn.style.display = verif ? 'none' : ''; btn.textContent = newText;
        });
        var host = document.getElementById('fta-tree-pick-host');
        if (host) {
            var note = document.getElementById('fta-home-note');
            if (!note) { note = document.createElement('span'); note.id = 'fta-home-note'; note.className = 'sl-home-note'; note.style.cssText = 'font-size:12px;color:var(--color-text-secondary);'; host.appendChild(note); }
            note.textContent = verif ? 'Each verification tree is made from a ' + (cur.home === 'asa' ? 'PASA' : 'PSSA') + ' fault tree and kept in step with it.' : '';
            note.style.display = verif ? '' : 'none';
            // the tree's own actions, beside the picker (the tree list that carried them is hidden): Delete, and in
            // Standalone, Promote. A verification tree goes with its tree, so it has no Delete of its own.
            var act = _pages().find(function (x) { return x && x.id === _active(); });
            var mk = function (id, text, title, fn) {
                var b2 = document.getElementById(id);
                if (!b2) { b2 = document.createElement('button'); b2.type = 'button'; b2.id = id; b2.className = 'ckpt-m-btn'; b2.style.cssText = 'font-size:12px;padding:5px 10px;'; b2.addEventListener('click', fn); host.insertBefore(b2, note); }
                b2.textContent = text; b2.title = title; return b2;
            };
            var del = mk('fta-tree-delete', 'Delete tree', 'Delete the fault tree on screen (its verification tree is asked about)', function () {
                var a2 = _pages().find(function (x) { return x && x.id === _active(); }); if (!a2) return;
                if (root.SLVerifySync) root.SLVerifySync.deleteTree(a2.id);
            });
            var liveMirror = !!(act && act.verifies && _pages().some(function (x) { return x && x.id === act.verifies; }));
            del.style.display = act && !liveMirror ? '' : 'none';
            var pro = mk('fta-tree-promote', 'Promote \u2191', 'Give this standalone tree a home: the aircraft or a system', function () {
                var a2 = _pages().find(function (x) { return x && x.id === _active(); }); if (!a2) return;
                Promise.resolve(_call('_promoteStandaloneTree', a2.id)).then(function () { try { if (root.SL_FTA_PICKER) root.SL_FTA_PICKER.render(true); } catch (_) {} });
            });
            pro.style.display = act && cur.home === 'standalone' && !(act.transferInFrom && act.transferInFrom.sourcePageId) && !act.verifies ? '' : 'none';
        }
        decorateToolbar();
    }
    function _cellLabel(sel, id, text, title) {
        if (!sel) return;
        var span = document.getElementById(id);
        if (!span) { span = document.createElement('div'); span.id = id; span.className = 'sl-home-fixed'; sel.parentNode.insertBefore(span, sel.nextSibling); }
        span.textContent = text; span.title = title || '';
    }
    function decorateToolbar() {
        if (typeof document === 'undefined') return;
        var page = _pages().find(function (p) { return p && p.id === _active(); });
        var lvlSel = document.getElementById('fta-tree-level'), modeSel = document.getElementById('fta-calc-mode'), ownSel = document.getElementById('fta-owning-system');
        if (!page) return;
        var h = homeOf(page), lv = levelOf(page);
        // the direction is the home's: a tree outside Standalone carries it explicitly (no mode was top-down already)
        if (h.home !== 'standalone' && page.mode !== h.dir) {
            // writing what the engine already assumed (no mode is top-down): background, not the person's change
            var CA = root.SLChangeAck;
            if (CA && typeof CA.system === 'function') CA.system(function () { page.mode = h.dir; }); else page.mode = h.dir;
            try { ftaConfig.mode = h.dir; } catch (_) {}
            if (modeSel) modeSel.value = h.dir;
        }
        if (lvlSel) {
            lvlSel.style.display = 'none';
            var lt = lv.level === 'aircraft' ? 'Aircraft' : lv.level === 'system' ? 'System: ' + (_sysName(lv.systemId) || lv.systemId) : 'Standalone';
            _cellLabel(lvlSel, 'fta-home-level', lt, 'Set by where the tree lives. To move a standalone tree, use Promote (↑) in the tree list.');
        }
        if (modeSel) {
            var standalone = h.home === 'standalone';
            modeSel.style.display = standalone ? '' : 'none';
            var fixed = document.getElementById('fta-home-mode');
            if (standalone) { if (fixed) fixed.style.display = 'none'; }
            else {
                _cellLabel(modeSel, 'fta-home-mode', (h.dir === 'bottom-up' ? 'Bottom-up' : 'Top-down') + ' (' + label(h, { short: true }) + ')',
                    h.dir === 'bottom-up' ? 'Verification trees are worked bottom-up from real failure rates.' : 'Allocation trees are worked top-down: the target is shared out down the tree.');
                document.getElementById('fta-home-mode').style.display = '';
            }
        }
        if (ownSel) {
            var sysHome = h.home === 'pssa' || h.home === 'ssa';
            ownSel.style.display = sysHome ? 'none' : '';
            var f2 = document.getElementById('fta-home-system');
            if (sysHome) { _cellLabel(ownSel, 'fta-home-system', _sysName(h.systemId) || String(h.systemId), 'The system this tree belongs to: where it lives.'); document.getElementById('fta-home-system').style.display = ''; }
            else if (f2) f2.style.display = 'none';
        }
    }

    // ---- "+ New Fault Tree": a tree for the home on screen ---------------------------------------------
    async function _newTree(orig, self, args) {
        var cur = current();
        if (cur.home === 'asa' || cur.home === 'ssa') {
            _toast('Verification trees are not made here: each one is made from a ' + (cur.home === 'asa' ? 'PASA' : 'PSSA') + ' fault tree and stays in step with it.', 'info', 5200);
            return;
        }
        var dir = 'top-down';
        if (cur.home === 'standalone') {
            var choose = root.slChoose;
            dir = typeof choose === 'function'
                ? await choose('How is this standalone tree worked out?', [
                    { value: 'top-down', label: 'Top-down', hint: 'A target at the top event, shared out down the tree.' },
                    { value: 'bottom-up', label: 'Bottom-up', hint: 'Real failure rates at the bottom, rolled up to the top.' }], { title: 'New standalone fault tree' })
                : 'top-down';
            if (!dir) return;
        }
        var r = orig.apply(self, args);
        var page = _pages().find(function (p) { return p && p.id === _active(); });
        if (page) {
            page.treeLevel = cur.home === 'pasa' ? 'aircraft' : cur.home === 'pssa' ? 'system' : 'standalone';
            page.systemId = cur.home === 'pssa' ? String(cur.systemId) : '';
            page.mode = dir;
            try { ftaConfig.mode = dir; } catch (_) {}
            var ms = typeof document !== 'undefined' && document.getElementById('fta-calc-mode'); if (ms) ms.value = dir;
            _call('syncFtaConfigFromActivePage');
            _call('renderFTASidebar'); _call('refreshTreeLevelDropdown');
            _save();
        }
        return r;
    }

    // ---- the level the diagram tools are for --------------------------------------------------------
    function levelScope() {
        var c = current();
        if (c.home === 'pasa' || c.home === 'asa') return { level: 'aircraft', systemId: null };
        if (c.home === 'pssa' || c.home === 'ssa') return { level: 'system', systemId: c.systemId };
        return { level: 'standalone', systemId: null };
    }
    function _lvKey(lv) { return lv.level + '|' + (lv.level === 'system' ? String(lv.systemId) : ''); }
    function _own(item) {
        if (!item || !item.level) return null;
        if (item.level === 'aircraft') return { level: 'aircraft', systemId: null };
        if (item.level === 'system' && _sysById(item.systemId)) return { level: 'system', systemId: String(item.systemId) };
        return { level: 'standalone', systemId: null };
    }
    function _pageLevelById(id) { var p = _pages().find(function (x) { return x && x.id === id; }); return p ? levelOf(p) : null; }
    // the level(s) a diagram belongs to: from what it is built on, else where it was made, else Standalone
    function itemLevels(kind, item) {
        if (!item) return [{ level: 'standalone', systemId: null }];
        var own = _own(item);
        if (kind === 'bowtie') {
            var lp = item.ftaPageId ? _pageLevelById(item.ftaPageId) : null;
            if (lp) return [lp];
            if (own) return [own];
            if (item.etaId) { var et = (_pc().eventTrees || []).find(function (t) { return t && t.id === item.etaId; }); if (et && et !== item) { var o2 = _own(et); if (o2) return [o2]; } }
            return [{ level: 'standalone', systemId: null }];
        }
        if (kind === 'eta') {
            if (own) return [own];
            var out = {}, list = [];
            (_pc().bowties || []).forEach(function (b) { if (b && b.etaId === item.id && b.ftaPageId) { var l = _pageLevelById(b.ftaPageId); if (l && !out[_lvKey(l)]) { out[_lvKey(l)] = 1; list.push(l); } } });
            (item.barriers || []).forEach(function (bar) { if (bar && bar.linkedPageId) { var l = _pageLevelById(bar.linkedPageId); if (l && !out[_lvKey(l)]) { out[_lvKey(l)] = 1; list.push(l); } } });
            return list.length ? list : [{ level: 'standalone', systemId: null }];
        }
        if (kind === 'markov') {
            var seen = {}, lv = [];
            _pages().forEach(function (p) {
                if (!p || !p.root) return;
                var hit = false;
                (function walk(n, s) { if (!n || hit || s.has(n)) return; s.add(n); if (n.markovModelId != null && String(n.markovModelId) === String(item.id)) { hit = true; return; } (n.children || n._children || []).forEach(function (c) { walk(c, s); }); })(p.root, new Set());
                if (hit) { var l = levelOf(p); if (!seen[_lvKey(l)]) { seen[_lvKey(l)] = 1; lv.push(l); } }
            });
            if (lv.length) return lv;
            return [own || { level: 'standalone', systemId: null }];
        }
        return [own || { level: 'standalone', systemId: null }];
    }
    function itemLevel(kind, item) { return itemLevels(kind, item)[0]; }
    function inLevel(kind, item, scope) { var s = _lvKey(scope || levelScope()); return itemLevels(kind, item).some(function (l) { return _lvKey(l) === s; }); }
    function pageInLevel(pageOrId, scope) {
        var p = typeof pageOrId === 'object' ? pageOrId : _pages().find(function (x) { return x && String(x.id) === String(pageOrId); });
        return !!p && _lvKey(levelOf(p)) === _lvKey(scope || levelScope());
    }
    function pagesInLevel(scope) { return _pages().filter(function (p) { return p && pageInLevel(p, scope); }); }
    // a diagram made now belongs to the level being worked on
    function stamp(item, scope) {
        if (!item) return item;
        var s = scope || levelScope();
        item.level = s.level;
        if (s.level === 'system') item.systemId = String(s.systemId); else delete item.systemId;
        return item;
    }
    function scopeLabel(scope) { var s = scope || levelScope(); return s.level === 'aircraft' ? 'Aircraft' : s.level === 'system' ? (_sysName(s.systemId) || 'System') : 'Standalone'; }

    // ---- the tab bar over the tree pages (prove_tabs.js asks) -------------------------------------------
    var DIAG_LABELS = { bowtie: 'Bow-Tie', eta: 'Event Trees', markov: 'Markov Models', monitors: 'Monitors & Coverage', expcase: 'Exposure cases', freq: 'Frequency' };
    function barSpec() {
        var c = current();
        if (c.home === 'asa' || c.home === 'ssa') return { label: label(c, { short: true }), tabs: [{ t: 'fta', k: 'Verification trees' }] };
        var tabs = [{ t: 'fta', k: 'Fault trees' }];
        DIAGRAM_TABS.forEach(function (t) { tabs.push({ t: t, k: DIAG_LABELS[t], gateLane: (t === 'bowtie' || t === 'eta' || t === 'markov') ? t : undefined }); });
        return { label: c.home === 'standalone' ? 'Standalone' : label(c, { short: true }), tabs: tabs };
    }
    // the menu section a tree page belongs to (nav_areas.js asks)
    var NAV = { pasa: { area: 'pasa', link: 'snav-fta' }, asa: { area: 'asa', link: 'sl-nav-trees-asa' }, pssa: { area: 'pssa', link: 'sl-nav-trees-pssa' }, ssa: { area: 'ssa', link: 'sl-nav-trees-ssa' }, standalone: { area: 'standalone', link: 'sl-nav-trees-standalone' } };
    function navArea(tab) {
        if (TREE_TABS.indexOf(tab) < 0) return null;
        var c = current(), n = NAV[c.home];
        var link = n.link;
        if (tab !== 'fta') link = ({ pasa: 'sl-nav-diag-pasa', pssa: 'sl-nav-diag-pssa', standalone: 'sl-nav-diag-standalone' })[c.home] || n.link;
        return { area: n.area, link: link, systemId: c.systemId };
    }
    // a diagram tool opened while a verification home is on screen works at that level's allocation home
    function openDiagrams(home, systemId) {
        _setCur({ home: home, systemId: systemId });
        _call('switchTab', 'bowtie');
    }

    // ---- wiring ------------------------------------------------------------------------------------------
    // once per name: another module may wrap ours afterwards (the undo wrapper does, data_ops_modules.js), and
    // wrapping the outer one again would run this twice (two Standalone questions for one + New)
    var _wrapped = {};
    function _wrapOnce(name, make) {
        var f = root[name]; if (typeof f !== 'function' || f._treeHomes || _wrapped[name]) return false;
        _wrapped[name] = true;
        var g = make(f); g._treeHomes = true;
        try { if (root.SLWrap) root.SLWrap.preserve(f, g); } catch (_) {}
        Object.keys(f).forEach(function (k) { try { if (g[k] === undefined) g[k] = f[k]; } catch (_) {} });
        root[name] = g; return true;
    }
    function wire() {
        _wrapOnce('addNewFTAPage', function (f) { return function () { return _newTree(f, this, arguments); }; });
        ['refreshTreeLevelDropdown', 'syncFtaConfigFromActivePage', 'refreshSystemPickerRow'].forEach(function (n) {
            _wrapOnce(n, function (f) { return function () { var r = f.apply(this, arguments); try { decorateToolbar(); } catch (_) {} return r; }; });
        });
        _wrapOnce('renderFTASidebar', function (f) { return function () { var r = f.apply(this, arguments); try { decorate(); } catch (_) {} return r; }; });
        _wrapOnce('switchTab', function (f) {
            return function (tab) {
                // a diagram tool is a tool of the level: from ASA it opens at PASA, from an SSA at that system's PSSA
                if (DIAGRAM_TABS.indexOf(tab) >= 0) { var c = current(); if (c.home === 'asa') _setCur({ home: 'pasa' }); else if (c.home === 'ssa') _setCur({ home: 'pssa', systemId: c.systemId }); }
                return f.apply(this, arguments);
            };
        });
    }
    if (typeof root.addEventListener === 'function' && typeof document !== 'undefined') {
        root.addEventListener('load', function () { wire(); var n = 0, iv = setInterval(function () { wire(); if (++n >= 20) clearInterval(iv); }, 500); });
    }

    // ---- 25 Oct 2026 (v1.1): which fault trees a diagram may link ----------------------------------
    // the level a diagram belongs to: the one it was made at, else the level being worked on
    function ownLevel(item) { return _own(item) || levelScope(); }
    // purpose 'top': a bow-tie's top event, the diagram's own level only; 'branch': an event tree heading, the
    // own level, and at the aircraft every system's trees too (system by system, in the systems' order)
    function linkPages(purpose, scope) {
        var s = scope || levelScope();
        var roots = _pages().filter(function (p) { return p && p.root; });
        var out = roots.filter(function (p) { return pageInLevel(p, s); });
        if (purpose === 'branch' && s.level === 'aircraft') {
            _systems().forEach(function (sy) {
                roots.forEach(function (p) { var l = levelOf(p); if (l.level === 'system' && String(l.systemId) === String(sy.id)) out.push(p); });
            });
        }
        return out;
    }
    function linkAllowed(purpose, pageId, scope) { return linkPages(purpose, scope).some(function (p) { return String(p.id) === String(pageId); }); }
    // a tree at the diagram's own level by its name; one from another level carries that level's name first
    function linkLabel(p, scope) {
        var s = scope || levelScope(), l = levelOf(p), name = String(p.name || p.id);
        if (_lvKey(l) === _lvKey(s)) return name;
        return (l.level === 'system' ? (_sysName(l.systemId) || 'System') : l.level === 'aircraft' ? 'Aircraft' : 'Standalone') + ' · ' + name;
    }
    function linkOptions(purpose, cur, scope, max) {
        var s = scope || levelScope(), n = max || 60;
        var o = linkPages(purpose, s).map(function (p) { return { value: p.id, label: linkLabel(p, s).slice(0, n) }; });
        if (cur && !o.some(function (x) { return String(x.value) === String(cur); })) {
            var p = _pages().find(function (x) { return x && String(x.id) === String(cur); });
            o.push({ value: cur, label: p ? linkLabel(p, s).slice(0, n) + ' (at another level)' : cur + ' (not found)' });
        }
        return o;
    }

    var api = { VERSION: VERSION, ownLevel: ownLevel, linkPages: linkPages, linkAllowed: linkAllowed, linkLabel: linkLabel, linkOptions: linkOptions, DIAGRAM_TABS: DIAGRAM_TABS, TREE_TABS: TREE_TABS, homeOf: homeOf, dirOf: dirOf, levelOf: levelOf, current: current, open: open, followActive: followActive,
        label: label, inHome: inHome, same: same, sections: sections, decorate: decorate, decorateToolbar: decorateToolbar, levelScope: levelScope, scopeLabel: scopeLabel,
        itemLevel: itemLevel, itemLevels: itemLevels, inLevel: inLevel, pageInLevel: pageInLevel, pagesInLevel: pagesInLevel, stamp: stamp,
        barSpec: barSpec, navArea: navArea, openDiagrams: openDiagrams, _wire: wire, _setCur: _setCur };
    try { root.SLTreeHomes = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
