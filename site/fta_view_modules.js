// fta_view_modules.js — v1.0 — Phase P2 batch 2a: FTA & golden-thread view layer.
// MOVED VERBATIM from safety_lab.js (byte-exact; classic script loaded BEFORE the
// monolith; all names remain global). Pure runtime function declarations — zero
// load-time code. Contents: FTA fuzzy-match + canvas render helpers, node drawer,
// FTA config sync + FC-link panels, quantification cache, golden-thread viz.
function _ftaNorm(s) { return (s == null ? '' : String(s)).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function _ftaTokens(s) { const n = _ftaNorm(s); return n ? n.split(' ') : []; }
function _ftaTrigrams(s) {
    const t = '  ' + _ftaNorm(s) + '  ';
    const set = new Set();
    for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
    return set;
}
function _ftaDice(a, b) {   // Sørensen–Dice over character trigrams ∈ [0,1]
    const A = _ftaTrigrams(a), B = _ftaTrigrams(b);
    if (!A.size || !B.size) return 0;
    let inter = 0; A.forEach(g => { if (B.has(g)) inter++; });
    return (2 * inter) / (A.size + B.size);
}
// Relevance of a node's text (description + node ID + internal id) to the query. 0 = no match.
function _ftaMatchScore(query, node) {
    const q = _ftaNorm(query);
    if (!q || !node) return 0;
    const hayRaw = (node.name || '') + ' ' + (node.displayId || '') + ' ' + (node.id || '');
    const hay = _ftaNorm(hayRaw);
    if (!hay) return 0;
    if (hay.indexOf(q) >= 0) return 1.0;                          // exact substring
    const qTokens = q.split(' ');
    if (qTokens.every(t => hay.indexOf(t) >= 0)) return 0.9;      // all query words present, any order
    if (q.length >= 3) {                                          // fuzzy tier (skip noisy 1–2 char queries)
        let sim = _ftaDice(q, hay);
        const nTokens = _ftaTokens(hayRaw);
        if (nTokens.length) {                                     // best per-word match (handles long descriptions)
            let acc = 0;
            qTokens.forEach(qt => { let best = 0; nTokens.forEach(nt => { const s = _ftaDice(qt, nt); if (s > best) best = s; }); acc += best; });
            sim = Math.max(sim, acc / qTokens.length);
        }
        if (sim >= _FTA_SIM_THRESHOLD) return sim * 0.85;        // fuzzy hits rank below exact/token hits
    }
    return 0;
}
// Best-matching node in a page (highest relevance, 0 = none). Lets the sidebar search match by
// node — including similar wording — not just the tree name.
function _firstNodeMatchInPage(page, query) {
    if (!page || !page.root || !query) return null;
    let best = null, bestScore = 0;
    (function walk(n, seen) {
        if (!n || seen.has(n.id)) return; seen.add(n.id);
        const s = _ftaMatchScore(query, n);
        if (s > bestScore) { bestScore = s; best = n; }
        const kids = n.children || n._children;
        if (kids) kids.forEach(c => walk(c, seen));
    })(page.root, new Set());
    return best;
}

function _bindFtaSidebarSearch() {
    const input = document.getElementById('fta-sidebar-search');
    const clearBtn = document.getElementById('fta-sidebar-search-clear');
    if (!input || input._slBound) return;
    input._slBound = true;
    input.value = _getFtaSidebarSearch();
    if (clearBtn) clearBtn.style.display = input.value ? 'block' : 'none';
    input.addEventListener('input', () => {
        _setFtaSidebarSearch(input.value);
        if (clearBtn) clearBtn.style.display = input.value ? 'block' : 'none';
        renderFTASidebar();
    });
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            input.value = '';
            _setFtaSidebarSearch('');
            clearBtn.style.display = 'none';
            renderFTASidebar();
            input.focus();
        });
    }
}

function renderFTASidebar() {
    try { if (typeof _renderSidebarContext === 'function') _renderSidebarContext(); } catch(_) {}
    const list = document.getElementById('fta-sidebar-list'); if (!list) return; list.innerHTML = '';
    _bindFtaSidebarSearch();

    // Build a parent → children[] index. A page is a child if its transferInFrom.sourcePageId
    // points at a page that still exists. Orphaned transfer pages fall back to top-level.
    const pageById = new Map();
    (ftaPages || []).forEach(p => pageById.set(p.id, p));
    const childrenByParent = new Map();
    const rootPages = [];
    (ftaPages || []).forEach(p => {
        const parentId = p.transferInFrom && p.transferInFrom.sourcePageId;
        if (parentId && pageById.has(parentId)) {
            if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
            childrenByParent.get(parentId).push(p);
        } else {
            rootPages.push(p);
        }
    });

    // Active search query
    const searchInput = document.getElementById('fta-sidebar-search');
    const queryRaw = searchInput ? searchInput.value : _getFtaSidebarSearch();
    const qLower = (queryRaw || '').trim().toLowerCase();
    const isSearching = !!qLower;

    // Per-render cache so the node-content scan runs at most once per page.
    const _nodeMatchCache = new Map();
    function _pageNodeHit(page) {
        if (!qLower || !page) return null;
        if (_nodeMatchCache.has(page.id)) return _nodeMatchCache.get(page.id);
        const hit = _firstNodeMatchInPage(page, qLower);
        _nodeMatchCache.set(page.id, hit);
        return hit;
    }
    function pageMatches(page) {
        if (!qLower) return true;
        // Match the tree name OR any node inside it (description / node ID / internal id), so
        // searching an event or gate (e.g. "BE-1095") surfaces its tree instead of "No trees match".
        if (((page.name || '').toLowerCase()).includes(qLower)) return true;
        return !!_pageNodeHit(page);
    }
    // Does any page in this root's subtree match? Searches keep the parent visible
    // when only a descendant matches, so transfer chains stay reachable.
    function subtreeMatches(rootPage) {
        if (pageMatches(rootPage)) return true;
        const kids = childrenByParent.get(rootPage.id) || [];
        return kids.some(subtreeMatches);
    }

    // Group root pages by section.
    const aircraftRoots = rootPages.filter(p => p.treeLevel === 'aircraft' && (!isSearching || subtreeMatches(p)));
    const standaloneRoots = rootPages.filter(p => p.treeLevel !== 'aircraft' && p.treeLevel !== 'system' && (!isSearching || subtreeMatches(p)));

    // System-level: one section per system, sorted by system name. Pages whose
    // declared systemId no longer resolves get an "Unassigned System Trees" bucket.
    const sysIds = new Set();
    rootPages.forEach(p => { if (p.treeLevel === 'system' && p.systemId) sysIds.add(p.systemId); });
    const sysList = Array.from(sysIds).map(id => {
        const sys = (systemsData || []).find(s => s.id === id);
        return { id, name: sys ? (sys.name || '(unnamed system)') : '(unknown system)', exists: !!sys };
    }).sort((a, b) => a.name.localeCompare(b.name));

    const sections = []; // { id, label, pages: [rootPage,…] }
    if (aircraftRoots.length) {
        sections.push({ id: 'aircraft', label: 'Aircraft Fault Trees', pages: aircraftRoots });
    }
    sysList.forEach(s => {
        // 23 Aug 2026 — an EXISTING system's trees live in that system's folder
        // in the rail (Waqas: "why are system fault trees showing in the
        // PASA?"). They leave this aircraft-level browser — except while
        // searching, which stays level-blind so any node id or name surfaces
        // its tree no matter where it lives. Trees whose system no longer
        // resolves keep their section here: a folder that does not exist
        // cannot carry them.
        if (s.exists && !isSearching) return;
        const pages = rootPages.filter(p => p.systemId === s.id && (!isSearching || subtreeMatches(p)));
        if (pages.length) {
            sections.push({ id: 'sys-' + s.id, label: 'System · ' + s.name, pages });
        }
    });
    const unassignedSys = rootPages.filter(p => p.treeLevel === 'system' && (!p.systemId || !sysList.find(s => s.id === p.systemId)) && (!isSearching || subtreeMatches(p)));
    if (unassignedSys.length) {
        sections.push({ id: 'sys-unassigned', label: 'Unassigned System Trees', pages: unassignedSys });
    }
    if (standaloneRoots.length) {
        // Phase 56.17 — sandbox flag so the section header gets a visible
        // "Sandbox" pill, and the children render with reduced visual weight.
        sections.push({ id: 'standalone', label: 'Standalone', pages: standaloneRoots, isSandbox: true });
    }

    if (sections.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding: 14px 8px; font-size: 12px; color: var(--text-secondary); font-style: italic;';
        empty.innerText = isSearching
            ? `No trees or nodes match "${queryRaw}".`
            : 'No fault trees yet. Click "+ New Fault Tree" below to start.';
        list.appendChild(empty);
        return;
    }

    const collapsedSet = _getFtaSidebarCollapsedSet();

    function countSubtree(root) {
        let n = 1;
        (childrenByParent.get(root.id) || []).forEach(k => { n += countSubtree(k); });
        return n;
    }

    function renderNode(page, depth) {
        const isActive = page.id === activeFTAPageId;
        const isSubtree = !!(page.transferInFrom && pageById.has(page.transferInFrom.sourcePageId));
        const kids = childrenByParent.get(page.id) || [];
        const hasKids = kids.length > 0;
        const collapsed = !!page._sidebarCollapsed;
        const matchesQuery = pageMatches(page);
        // Phase 56.17 — sandbox flag derives from treeLevel directly so it
        // applies to nested transferred children of a standalone root too.
        const isSandbox = page.treeLevel !== 'aircraft' && page.treeLevel !== 'system';

        const div = document.createElement('div');
        div.className = `fta-page-item ${isActive ? 'active' : ''}`;
        if (depth > 0) div.style.marginLeft = (depth * 14) + 'px';
        if (isSandbox) {
            // De-emphasize the whole row visually to telegraph "not on the cert
            // critical path." Active selection still gets full opacity so the
            // user always knows what's active.
            div.style.opacity = isActive ? '1' : '0.7';
        }
        // Cascade obsolescence — dim obsolete trees (the parent function was removed).
        // Applied after the sandbox rule so it wins for de-emphasis.
        if (page.obsolete) {
            div.style.opacity = '0.55';
        }

        // Chevron toggle. Always rendered (even when no kids) so columns stay aligned;
        // grayed out when there's nothing to expand.
        const chev = document.createElement('span');
        chev.style.cssText = 'width: 14px; flex-shrink: 0; cursor: ' + (hasKids ? 'pointer' : 'default') +
            '; color: ' + (hasKids ? 'var(--color-text-secondary)' : 'transparent') + '; font-size: 11px; user-select: none; text-align: center;';
        chev.textContent = hasKids ? (collapsed ? '▸' : '▾') : '·';
        chev.title = hasKids ? (collapsed ? 'Expand subtree branches' : 'Collapse subtree branches') : '';
        chev.onclick = (e) => {
            if (!hasKids) return;
            e.stopPropagation();
            page._sidebarCollapsed = !collapsed;
            renderFTASidebar();
        };
        div.appendChild(chev);

        // Left side: name + tree-level badge
        const left = document.createElement('div');
        left.style.cssText = 'display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; cursor: pointer;';
        const nameSpan = document.createElement('span');
        nameSpan.innerText = page.name || 'Untitled Tree';
        nameSpan.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
        if (isSearching && matchesQuery) {
            nameSpan.style.fontWeight = '600';
        } else if (isSearching && !matchesQuery) {
            // Dim non-matching rows that only show because a descendant matched.
            nameSpan.style.opacity = '0.55';
        }
        left.appendChild(nameSpan);
        // Phase 53.46 — verification mirror pages take a 'verification' badge; subtree wins
        // over treeLevel; otherwise show the page's treeLevel.
        const isVerification = !!page.verifies;
        const lvl = isVerification ? 'verification' : (isSubtree ? 'subtree' : (page.treeLevel || 'standalone'));
        // v66.14 — fallback for unknown treeLevel values: an unmapped level used
        // to throw ("reading 'bg'") and abort the ENTIRE sidebar render (seen in
        // live console history against scratch/test pages). Unknown levels now
        // render a neutral badge with the raw value instead.
        const c = TREE_LEVEL_COLORS[lvl] || TREE_LEVEL_COLORS['standalone'] || { bg: '#E2E8F0', fg: '#334155' };
        const lvlBadge = document.createElement('span');
        lvlBadge.style.cssText = `display: inline-block; padding: 1px 7px; font-size: 9px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; background: ${c.bg}; color: ${c.fg}; border-radius: 999px; align-self: flex-start;`;
        lvlBadge.innerText = TREE_LEVEL_LABELS[lvl] || String(lvl);
        left.appendChild(lvlBadge);
        // Cascade obsolescence — OBSOLETE badge next to the level badge.
        if (page.obsolete) {
            const obsBadge = document.createElement('span');
            obsBadge.className = 'slab-obsolete-badge';
            obsBadge.style.cssText = 'align-self: flex-start;';
            obsBadge.innerText = 'OBSOLETE';
            obsBadge.title = page.obsoleteReason || 'Obsolete — parent function removed';
            left.appendChild(obsBadge);
        }
        // Backlog #1 — AI-synthesized trees carry the confidence pill (deterministic
        // verdict from recorded provenance + review state; ai_badges.js, guarded).
        try {
            if (page.aiGenerated && typeof window !== 'undefined' && window.AiBadges) {
                const _conf = window.AiBadges.confidence(page, { kind: 'ftaPage', id: page.id });
                if (_conf) {
                    const aiBadge = document.createElement('span');
                    aiBadge.className = 'ai-conf-pill ai-conf-' + _conf.tier;
                    aiBadge.style.cssText = 'align-self: flex-start; margin-right: 0;';
                    aiBadge.innerText = _conf.label + ' ' + _conf.grade;
                    aiBadge.title = _conf.why.join('\n');
                    left.appendChild(aiBadge);
                }
            }
        } catch (_) {}
        left.onclick = () => {
            activeFTAPageId = page.id;
            if (typeof syncFtaConfigFromActivePage === 'function') syncFtaConfigFromActivePage();
            // Phase 66 — page switch is a render path: re-derive this page's target
            // from its linked FHA and re-run the allocator BEFORE painting, so
            // budgets are always live, never whatever the save happened to hold.
            try { if (typeof refreshFTARequiredTarget === 'function') refreshFTARequiredTarget(); } catch(_) {}
            try { calculateAllProbabilities(); } catch(_) {}
            // If this tree was surfaced by a node match (not its name), land on that node:
            // reveal collapsed ancestors, select it, and center the canvas on it.
            const nodeHit = qLower ? _pageNodeHit(page) : null;
            if (nodeHit && typeof _ftaExpandPathToNode === 'function') _ftaExpandPathToNode(page.root, nodeHit);
            renderFTASidebar();
            if (nodeHit && typeof selectNode === 'function') {
                selectNode(nodeHit);
            } else {
                selectedNodeData = null;
                document.getElementById('node-config-panel').style.display = 'none';
            }
            updateD3();
            refreshTreeLevelDropdown();
            if (nodeHit && typeof _ftaCenterOnNode === 'function') setTimeout(() => _ftaCenterOnNode(nodeHit), 60);
        };

        // Phase 56.17 — promote-out-of-sandbox action on standalone-tree rows.
        // Only rendered for root sandbox pages (transferred subtrees inherit their
        // parent's promotion automatically).
        let promoteBtn = null;
        if (isSandbox && !isSubtree) {
            promoteBtn = document.createElement('button');
            promoteBtn.className = 'action-btn';
            promoteBtn.style.cssText = 'padding: 2px 6px; background: var(--color-purple, #8b5cf6); color: #fff;';
            promoteBtn.innerText = '↑';
            promoteBtn.title = 'Promote to Aircraft or System fault tree';
            promoteBtn.onclick = (e) => {
                e.stopPropagation();
                _promoteStandaloneTree(page.id);
            };
        }

        const delBtn = document.createElement('button');
        delBtn.className = 'action-btn btn-red'; delBtn.style.padding = '2px 5px'; delBtn.innerText = 'X';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm(`Delete page ${page.name}?`)) {
                ftaPages = ftaPages.filter(p => p.id !== page.id);
                if (activeFTAPageId === page.id) activeFTAPageId = ftaPages.length > 0 ? ftaPages[0].id : null;
                if (typeof syncFtaConfigFromActivePage === 'function') syncFtaConfigFromActivePage();
                renderFTASidebar(); calculateAllProbabilities(); updateD3();
            }
        };
        div.appendChild(left);
        if (promoteBtn) div.appendChild(promoteBtn);
        div.appendChild(delBtn);
        list.appendChild(div);

        // Recurse for nested transferred subtrees (unless collapsed).
        if (hasKids && !collapsed) {
            kids.forEach(k => renderNode(k, depth + 1));
        }
    }

    sections.forEach(section => {
        // When searching we force sections open so matches stay visible regardless of
        // the persisted collapse preference.
        const isCollapsed = !isSearching && collapsedSet.has(section.id);
        const header = document.createElement('div');
        header.className = 'fta-sidebar-section';
        header.style.cssText = 'display: flex; align-items: center; gap: 6px; padding: 8px 4px 4px; border-bottom: 1px solid var(--border-primary); margin-top: 6px; cursor: pointer; user-select: none;';
        const chev = document.createElement('span');
        chev.style.cssText = 'width: 12px; font-size: 10px; color: var(--text-secondary); text-align: center;';
        chev.textContent = isCollapsed ? '▸' : '▾';
        header.appendChild(chev);
        const label = document.createElement('span');
        label.style.cssText = 'flex: 1; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
        label.innerText = section.label;
        header.appendChild(label);
        // Phase 56.17 — Sandbox pill telegraphs that the Standalone section is
        // experimental work and does not feed certification artifacts.
        if (section.isSandbox) {
            const sandboxPill = document.createElement('span');
            sandboxPill.style.cssText = 'font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; background: var(--color-warning-bg, rgba(251,191,36,0.18)); color: var(--color-warning, #f59e0b); border: 1px solid var(--color-warning, #f59e0b); border-radius: 999px; padding: 1px 7px;';
            sandboxPill.innerText = 'Sandbox';
            sandboxPill.title = 'Trees in this section are experimental — they do not roll up to certification documents, AutoReq, or DAL allocation.';
            header.appendChild(sandboxPill);
        }
        const count = document.createElement('span');
        count.style.cssText = 'font-size: 10px; color: var(--text-secondary); background: var(--bg-secondary); border-radius: 999px; padding: 1px 7px;';
        count.innerText = section.pages.reduce((n, r) => n + countSubtree(r), 0);
        header.appendChild(count);
        header.onclick = () => {
            if (isSearching) return; // collapse is disabled during search
            _setFtaSidebarSectionCollapsed(section.id, !isCollapsed);
            renderFTASidebar();
        };
        list.appendChild(header);

        if (isCollapsed) return;
        section.pages.forEach(p => renderNode(p, 0));
    });
}

// Phase 56.17 — Promote a sandbox/standalone tree out of the sandbox bucket
// into either the Aircraft or a System scope. Two-step prompt (Aircraft is the
// fast path, System requires the user to pick which system from a numbered list).
async function _promoteStandaloneTree(pageId) {
    const page = ftaPages.find(p => p.id === pageId);
    if (!page) return;
    const stepOne = confirm(
        'Promote "' + (page.name || 'this tree') + '" to:\n\n' +
        'OK — Aircraft Fault Tree (rolls into aircraft-level cert)\n' +
        'Cancel — System Fault Tree (you\'ll pick the system on the next step)'
    );
    if (stepOne) {
        page.treeLevel = 'aircraft';
        page.systemId = '';
        if (typeof _syncMirrorOwnershipFromSource === 'function') _syncMirrorOwnershipFromSource(page);
        if (typeof renderFTASidebar === 'function') renderFTASidebar();
        if (typeof updateD3 === 'function') updateD3();
        if (typeof refreshTreeLevelDropdown === 'function') refreshTreeLevelDropdown();
        if (typeof showToast === 'function') showToast('Promoted to Aircraft Fault Tree.', 'success', 2500);
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
        return;
    }
    const systems = systemsData || [];
    if (systems.length === 0) {
        alert('No systems defined yet. Create a system first in the Systems Safety workspace, then come back to promote this tree.');
        return;
    }
    const list = systems.map((s, i) => `${i + 1}. ${s.name || '(unnamed system)'}`).join('\n');
    const pick = await slPrompt(
        'Promote "' + (page.name || 'this tree') + '" to which system?\n\n' +
        list + '\n\nType the number and press OK:'
    );
    if (pick === null || pick === '') return;
    const idx = parseInt(pick, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= systems.length) {
        alert('Invalid selection — promotion canceled. Use the number from the list (1–' + systems.length + ').');
        return;
    }
    page.treeLevel = 'system';
    page.systemId = systems[idx].id;
    if (typeof _syncMirrorOwnershipFromSource === 'function') _syncMirrorOwnershipFromSource(page);
    if (typeof renderFTASidebar === 'function') renderFTASidebar();
    if (typeof updateD3 === 'function') updateD3();
    if (typeof refreshTreeLevelDropdown === 'function') refreshTreeLevelDropdown();
    if (typeof showToast === 'function') showToast('Promoted to System: ' + (systems[idx].name || systems[idx].id) + '.', 'success', 2500);
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
}

function avoidNodeOverlap(root, halfWidth) {
    if (!root) return;
    // Description box is 160 wide → 80 px half. We use 82 to leave a 2 px breathing strip
    // (anything tighter would visually touch). Required center-to-center = 164. Default d3
    // sibling spacing at nodeSize[0]=165, sep=1.05 is 173 — comfortably above 164, so this
    // pass never widens normal siblings, only steps in when extra content (DAL badge,
    // transfer-in label) would actually collide.
    halfWidth = halfWidth || 82;
    const byDepth = new Map();
    root.each(d => {
        const arr = byDepth.get(d.depth) || [];
        arr.push(d);
        byDepth.set(d.depth, arr);
    });
    byDepth.forEach(nodes => {
        nodes.sort((a, b) => a.x - b.x);
        for (let i = 1; i < nodes.length; i++) {
            const need = nodes[i - 1].x + 2 * halfWidth;
            if (nodes[i].x < need) {
                const dx = need - nodes[i].x;
                // Shift this node and every descendant by dx. d3.hierarchy nodes expose
                // .each which walks the subtree.
                nodes[i].each(n => { n.x += dx; });
            }
        }
    });
}

// #41 — linked failure-condition chip in the FTA header. Shows the active tree's owning FC +
// severity (color-coded), or an "unlinked — set owning function" nudge that opens the calc
// panel's owning-function selector (shared with the #40 Auto-allocate DAL guidance).
function _sevChipColors(sev) {
    const s = (sev || '').toLowerCase();
    if (s.indexOf('cat') === 0) return { bg: '#fdecea', fg: '#b91c1c', bd: '#f5c2c0' };
    if (s.indexOf('haz') === 0) return { bg: '#fef0e6', fg: '#c2410c', bd: '#f6c89f' };
    if (s.indexOf('maj') === 0) return { bg: '#fef9e7', fg: '#a16207', bd: '#f3e3a3' };
    if (s.indexOf('min') === 0) return { bg: '#eef6ff', fg: '#1d4ed8', bd: '#c6dbff' };
    return { bg: '#f1f3f5', fg: '#5b6675', bd: '#dde2e8' };
}
function _ftaFocusOwningFunction() {
    const s0 = document.getElementById('fta-fha-link');
    if (!s0 || s0.offsetParent === null) {
        const tog = Array.from(document.querySelectorAll('button, summary, [role="button"], .panel-collapse-toggle'))
            .find(x => /calculation mode/i.test((x.textContent || '').slice(0, 40)));
        if (tog) tog.click();
    }
    const sel = document.getElementById('fta-fha-link');
    if (sel) {
        try { sel.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
        try { sel.focus({ preventScroll: true }); } catch (_) {}
        const p = sel.style.boxShadow;
        sel.style.boxShadow = '0 0 0 3px rgba(47,109,246,0.55)';
        setTimeout(() => { sel.style.boxShadow = p; }, 2200);
    }
}
function _renderFtaLinkedChip() {
    const view = document.getElementById('view-fta'); if (!view) return;
    const h = view.querySelector('h3'); if (!h) return;
    let chip = document.getElementById('fta-linked-chip');
    if (!chip) {
        chip = document.createElement('span'); chip.id = 'fta-linked-chip';
        chip.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin-left:12px;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer;vertical-align:middle;border:1px solid transparent;white-space:nowrap;';
        chip.addEventListener('click', _ftaFocusOwningFunction);
        h.appendChild(chip);
    }
    const linkedFhaId = (document.getElementById('fta-fha-link') || {}).value || '';
    let fha = null;
    try { fha = (linkedFhaId && typeof _resolveLinkedFha === 'function') ? _resolveLinkedFha(linkedFhaId) : null; } catch (_) { fha = null; }
    const E = (typeof esc === 'function') ? esc : (x => String(x == null ? '' : x));
    if (fha) {
        const sev = fha.severity || ''; const c = _sevChipColors(sev);
        chip.style.background = c.bg; chip.style.color = c.fg; chip.style.borderColor = c.bd;
        chip.title = 'Linked to a failure condition — DAL and probability target derive from its severity. Click to change.';
        chip.innerHTML = '🔗 Linked: ' + E(fha.fcId || '') + (sev ? (' · ' + E(sev)) : '');
    } else {
        chip.style.background = '#fdf4e7'; chip.style.color = '#b45309'; chip.style.borderColor = '#f0d9b5';
        chip.title = 'This tree has no owning failure condition. Click to set it (DAL is derived from severity).';
        chip.innerHTML = '⚠ Unlinked — set owning function';
    }
}
// #47 — when the Calculation Mode & Exposure panel is collapsed, show a one-line basis summary
// (mode · apportionment · exposure · linked FC) so the tree's setup is visible without expanding.
function _renderFtaConfigSummary() {
    const panel = document.getElementById('fta-config-panel'); if (!panel) return;
    const toggle = panel.querySelector('.panel-collapse-toggle'); if (!toggle) return;
    let sumEl = document.getElementById('fta-config-summary');
    if (!sumEl) {
        sumEl = document.createElement('span'); sumEl.id = 'fta-config-summary';
        sumEl.style.cssText = 'margin-left:10px;font-size:11.5px;font-weight:500;color:var(--color-text-tertiary,#6b7280);';
        toggle.insertAdjacentElement('afterend', sumEl);
        toggle.addEventListener('click', () => setTimeout(_renderFtaConfigSummary, 40));
    }
    if (!panel.classList.contains('is-collapsed')) { sumEl.style.display = 'none'; return; }
    const tdown = !!(typeof ftaConfig !== 'undefined' && ftaConfig && ftaConfig.mode === 'top-down');
    const parts = [tdown ? 'Top-down' : 'Bottom-up'];
    if (tdown) parts.push((ftaConfig.apportion === 'weighted') ? 'Weighted' : 'Equal');
    if (typeof ftaConfig !== 'undefined' && ftaConfig && ftaConfig.exposureTime) parts.push('exposure ' + ftaConfig.exposureTime + ' hr');
    let fha = null;
    try { const lid = (document.getElementById('fta-fha-link') || {}).value || ''; fha = (lid && typeof _resolveLinkedFha === 'function') ? _resolveLinkedFha(lid) : null; } catch (_) {}
    parts.push(fha ? ('linked ' + (fha.fcId || '')) : 'unlinked');
    sumEl.style.display = 'inline';
    sumEl.textContent = '· ' + parts.join(' · ');
}
// ============================================================================
// ENG-2 phase 2 — FTA canvas viewport culling (game-engine frustum culling,
// applied to display only). Engages above _FTA_CULL_MIN_NODES; small trees
// keep the identical full-render path. Opt out: ?cull=0 or SLA_FTA_CULL='0'.
// ============================================================================
const _FTA_CULL_MIN_NODES = 300;
function _ftaCullActive(n) {
    try {
        if (/[?&]cull=0/.test(location.search)) return false;
        if (localStorage.getItem('SLA_FTA_CULL') === '0') return false;
    } catch (_) {}
    return n > _FTA_CULL_MIN_NODES;
}
// Visible world-rect from the current zoom transform, padded by one full
// viewport on every side (generous margin → smooth panning, rare remounts).
function _ftaCullRect() {
    try {
        const el = document.getElementById('fta-svg');
        if (!el || typeof svg === 'undefined' || !svg || !svg.node()) return null;
        const w = el.clientWidth, h = el.clientHeight;
        if (!w || !h) return null;
        const t = d3.zoomTransform(svg.node());
        const x0 = (0 - t.x) / t.k, y0 = (0 - t.y) / t.k;
        const x1 = (w - t.x) / t.k, y1 = (h - t.y) / t.k;
        const mx = (x1 - x0), my = (y1 - y0);
        return { x0: x0 - mx, y0: y0 - my, x1: x1 + mx, y1: y1 + my };
    } catch (_) { return null; }
}
function _ftaNodeInRect(d, r) { return d.x >= r.x0 && d.x <= r.x1 && d.y >= r.y0 && d.y <= r.y1; }
function _ftaLinkCrossesRect(l, r) {
    const ax = Math.min(l.source.x, l.target.x), bx = Math.max(l.source.x, l.target.x);
    const ay = Math.min(l.source.y, l.target.y), by = Math.max(l.source.y, l.target.y);
    return bx >= r.x0 && ax <= r.x1 && by >= r.y0 && ay <= r.y1;
}
// Re-render (throttled, trailing) after pan/zoom so newly-visible regions
// mount. Small trees never re-render here — their zoom stays pure-transform.
// Never fires while an inline editor inside the canvas holds focus (a cull
// remount would yank the field out from under the user's cursor).
let _ftaCullTimer = null;
function _ftaCullOnZoom() {
    try {
        const rootNode = (typeof getActiveFTARoot === 'function') ? getActiveFTARoot() : null;
        if (!rootNode) return;
        if (!_ftaCullActive(typeof _countTreeNodes === 'function' ? _countTreeNodes(rootNode) : 0)) return;
        const ae = document.activeElement;
        if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT') && ae.closest && ae.closest('#fta-svg')) return;
        clearTimeout(_ftaCullTimer);
        _ftaCullTimer = setTimeout(function () { try { updateD3(); } catch (_) {} }, 160);
    } catch (_) {}
}
// Honesty pill — bottom-left of the canvas while culling is active: display
// windowing must never read as "that's the whole tree".
function _ftaCullPill(shown, total, capped) {
    try {
        const el = document.getElementById('fta-svg');
        if (!el || !el.parentElement) return;
        let pill = document.getElementById('fta-cull-pill');
        if (shown == null) { if (pill) pill.style.display = 'none'; return; }
        if (!pill) {
            pill = document.createElement('div');
            pill.id = 'fta-cull-pill';
            pill.style.cssText = 'position:absolute; left:14px; bottom:14px; z-index:5; padding:3px 10px; font-size:11px; font-family:var(--font-mono, monospace); color:var(--color-text-secondary,#4A5568); background:var(--color-surface-1,#fff); border:1px solid var(--color-border-strong,#B9C2D0); border-radius:4px; pointer-events:none;';
            const host = el.parentElement;
            if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
            host.appendChild(pill);
        }
        pill.style.display = 'block';
        pill.textContent = 'viewport rendering: ' + shown.toLocaleString() + ' of ' + total.toLocaleString() + ' nodes mounted' +
            (capped ? ' (zoomed out — nearest to view centre; zoom in for full local detail)' : '') +
            ' — layout and math cover the full tree';
    } catch (_) {}
}

function updateD3() {
    try {
        try { _renderFtaLinkedChip(); } catch (_) {}
        try { _renderFtaConfigSummary(); } catch (_) {}
        if (typeof d3 === 'undefined') return; const rootNode = getActiveFTARoot();
        if (!rootNode) { g.selectAll("*").remove(); updateToolbarState(); return; }
        // Phase 53.40 — refresh nodeSize on every render so Reconfigure Layout (and any future
        // dynamic box-height change) reflows the tree to match the current box dimensions.
        if (treeLayout && typeof _ftaNodeVerticalSpacing === 'function') {
            treeLayout.nodeSize([165, _ftaNodeVerticalSpacing()]);
        }
        const root = d3.hierarchy(rootNode, d => d.children); treeLayout(root);
        // Phase 33 — adaptive overlap avoidance. With the tightened nodeSize, two nodes at the
        // same depth can end up with overlapping bounding boxes when one carries extra content
        // (DAL badge, transfer-in indicator, etc.). For each depth row, walk left-to-right and
        // shift any overlapping node — together with its entire subtree — right by exactly the
        // overlap distance. User drag offsets are applied after, so manual placement still wins.
        avoidNodeOverlap(root);
        root.each(d => { d.x += (d.data.xOffset || 0); d.y += (d.data.yOffset || 0); });
        const isDark = document.body.classList.contains('theme-dark');

        // Correlation colouring (Option B): classify basic events as independent (green),
        // repeated / same-physical-event (amber), or CCF-group member (violet). Computed once
        // per render so getNodeColors() reads a ready set; also drives the conditional legend.
        try {
            _ftaRepeatedLids = new Set([...repeatedEventGroups().keys()]);
            let _hasCCF = false;
            root.each(d => { const x = d.data; if (x && x.type === 'basic' && x.ccfGroup && (x.beta || 0) > 0) _hasCCF = true; });
            _renderCorrelationLegend(_ftaRepeatedLids.size > 0, _hasCCF);
            try { _ftaCcfRenderSuggestPill(); } catch (_) {}   // #7 — surface CCF candidates as a canvas pill
        } catch (_) {}

        // ENG-2 phase 2 — VIEWPORT CULLING (big trees only). Above the threshold,
        // only nodes inside the visible world-rect (padded by one full viewport
        // on every side, so ordinary panning never shows a blank frame) are
        // mounted; links render when either endpoint is visible OR the link's
        // bounding box crosses the rect (long vertical connectors). The
        // selected node is always mounted. Below the threshold nothing changes:
        // the filter is the identity, byte-for-byte the old render. DISPLAY
        // ONLY — layout, math, and every store are computed over the full tree.
        // Known ephemeral-class limitation: highlight classes (cut set / search
        // hit) live on mounted DOM and don't survive a cull remount of far
        // off-screen nodes; both flows zoom their targets into view first, so
        // the highlighted nodes are mounted where it matters.
        const _allDesc = root.descendants();
        const _cullRect = _ftaCullActive(_allDesc.length) ? _ftaCullRect() : null;
        let _descList = _allDesc, _linkList = root.links(), _cullCapped = false;
        if (_cullRect) {
            const _selId = (typeof selectedNodeData !== 'undefined' && selectedNodeData) ? selectedNodeData.id : null;
            _descList = _allDesc.filter(d => d.data.id === _selId || _ftaNodeInRect(d, _cullRect));
            // MOUNT CAP (live-test finding): zoomed far out, the rect covers the
            // whole forest and a full remount pins the main thread for seconds —
            // exactly what culling exists to prevent. Above the cap, mount the
            // nodes nearest the view centre and say so on the pill; node detail
            // is unreadable at that zoom anyway, and zooming in remounts the
            // local neighborhood in full.
            const _CULL_MOUNT_CAP = 350;   // live-tuned: 600 cost ~5s on full zoom-out; at that zoom nodes are dots anyway
            if (_descList.length > _CULL_MOUNT_CAP) {
                const cx = (_cullRect.x0 + _cullRect.x1) / 2, cy = (_cullRect.y0 + _cullRect.y1) / 2;
                _descList = _descList
                    .map(d => [(d.x - cx) * (d.x - cx) + (d.y - cy) * (d.y - cy), d])
                    .sort((a, b) => a[0] - b[0])
                    .slice(0, _CULL_MOUNT_CAP)
                    .map(p => p[1]);
                _cullCapped = true;
            }
            const _visIds = new Set(_descList.map(d => d.data.id));
            _linkList = root.links().filter(l => _visIds.has(l.source.data.id) || _visIds.has(l.target.data.id) || (!_cullCapped && _ftaLinkCrossesRect(l, _cullRect)));
        }
        _ftaCullPill(_cullRect ? _descList.length : null, _allDesc.length, _cullCapped);

        const links = g.selectAll('.link').data(_linkList, d => d.target.data.id);
        links.enter().append('path').attr('class', 'link').merge(links).transition().duration(180)
            .attr('d', d => {
                // Phase 49 — per-node descBoxHeight; falls back to 90 (legacy fixed value) for nodes
                // that haven't been measured yet on first paint.
                const tOff = (d.target.data && d.target.data.descBoxHeight) ? d.target.data.descBoxHeight : 90;
                const midY = (d.source.y + 25 + d.target.y - tOff) / 2;
                return `M ${d.source.x} ${d.source.y + 25} V ${midY} H ${d.target.x} V ${d.target.y - tOff}`;
            })
            .style('stroke', isDark ? '#38bdf8' : '#94a3b8').style('stroke-opacity', isDark ? 0.4 : 1);
        links.exit().remove();
        
        // Phase 47 — drag a node and the entire subtree rooted at that node moves with it.
        // (Each descendant's xOffset/yOffset and d3 position are shifted by the same dx/dy,
        // so children remain individually draggable: dragging a child shifts only its own
        // subtree.) Every link that has a source or target inside the moved subtree is
        // re-rendered, plus the link from the parent into the dragged node.
        const dragHandler = d3.drag().on("drag", function(event, d) {
            // Collect every node in the subtree we're about to shift.
            const subtreeIds = new Set();
            d.each(n => {
                n.data.xOffset = (n.data.xOffset || 0) + event.dx;
                n.data.yOffset = (n.data.yOffset || 0) + event.dy;
                n.x += event.dx;
                n.y += event.dy;
                subtreeIds.add(n.data.id);
            });
            // Move every SVG node inside the moved subtree to its new position.
            g.selectAll('.node').filter(nd => subtreeIds.has(nd.data.id))
                .attr('transform', nd => `translate(${nd.x},${nd.y})`);
            // Re-render every link whose source OR target lives inside the moved subtree.
            // That catches both the internal subtree links and the parent→dragged-node link.
            g.selectAll('.link').filter(l => subtreeIds.has(l.source.data.id) || subtreeIds.has(l.target.data.id))
                .attr('d', linkData => {
                    const tOff = (linkData.target.data && linkData.target.data.descBoxHeight) ? linkData.target.data.descBoxHeight : 90;
                    const midY = (linkData.source.y + 25 + linkData.target.y - tOff) / 2;
                    return `M ${linkData.source.x} ${linkData.source.y + 25} V ${midY} H ${linkData.target.x} V ${linkData.target.y - tOff}`;
                });
        });

        const nodes = g.selectAll('.node').data(_descList, d => d.data.id);
        const nodeEnter = nodes.enter().append('g').attr('class', d => `node ${selectedNodeData && selectedNodeData.id === d.data.id ? 'selected' : ''}`)
            .attr('transform', d => `translate(${d.x},${d.y})`)
            .on('click', (event, d) => {
                // #6 — shift-click a basic event toggles it into the CCF multi-select; a normal click
                // clears any selection and opens the properties modal as before.
                if (event.shiftKey && d.data && d.data.type === 'basic') { event.stopPropagation(); _ftaCcfToggleMulti(d.data, event.currentTarget); return; }
                if (_ftaCcfMultiSel && _ftaCcfMultiSel.size) _ftaCcfClearMulti();
                // Phase 66.11 — a second click on a transfer gate hops to its target.
                // Checked BEFORE the properties panel opens, because opening the panel
                // re-renders the canvas and kills the native dblclick pairing.
                if (_ftaClickIsTransferDouble(d.data, Date.now())) {
                    event.stopPropagation();
                    if (ftaOpenTransferTarget(d.data)) return;
                }
                openNodePropertiesModal(d.data);
            })
            .on('dblclick', (event, d) => {
                // Phase 56.24 — TRANSFER navigation keeps priority; otherwise open the
                // properties modal. Gate collapse/expand on dblclick was retired here
                // so double-click consistently means "open properties." (Use Alt/Option
                // + click on a gate to collapse if we re-add that gesture later.)
                if ((d.data.gateType === 'TRANSFER' && d.data.linkedPageId) || d.data.transferOutTo) {
                    // Phase 66.11 — one implementation, shared with the click-count route.
                    ftaOpenTransferTarget(d.data);
                } else {
                    openNodePropertiesModal(d.data);
                }
            }).call(dragHandler);
        
        // Phase 38 — foreignObject restored to y=-120, height=90 so descriptions are fully visible.
        const fo = nodeEnter.append('foreignObject').attr('x', -80).attr('y', -120).attr('width', 160).attr('height', 90).attr('class', 'node-foreign-object').on('mousedown', e => e.stopPropagation()).on('click', e => e.stopPropagation()).on('dblclick', e => e.stopPropagation()).on('wheel', e => e.stopPropagation());
        // Phase 38 — restored 3 px gap. Content stack 46+3+20+3+18 = 90 px = foreignObject height.
        const container = fo.append('xhtml:div').attr('xmlns', 'http://www.w3.org/1999/xhtml').style('display', 'flex').style('flex-direction', 'column').style('gap', '3px').style('width', '100%').style('height', '100%').style('justify-content', 'flex-end');
        
        container.append('xhtml:textarea').attr('class', 'inline-desc').attr('placeholder', 'Description').attr('spellcheck', 'false').attr('autocorrect', 'off').attr('data-gramm', 'false').attr('data-gramm_editor', 'false').attr('data-enable-grammarly', 'false').on('input', function(e, d) {
            d.data.name = this.value;
            // Phase 49 — auto-size the foreignObject + redraw the parent→this-node link so
            // the layout follows the description as it grows / shrinks.
            autoSizeNodeDescription(this, d);
            if(selectedNodeData && selectedNodeData.id === d.data.id) document.getElementById('config-name').value = this.value;
        }).on('change', function(e, d) { propagateRepeatedEventEdit(d.data); updateNodeDataInline(); });
        container.append('xhtml:input').attr('class', 'inline-id').attr('placeholder', 'ID').attr('data-gramm', 'false').attr('data-gramm_editor', 'false').attr('data-enable-grammarly', 'false').on('input', function(e, d) {
            // Stash previous value once per focus so we can revert on duplicate.
            if (this._prevDisplayId === undefined) this._prevDisplayId = d.data.displayId || '';
            d.data.displayId = this.value;
        }).on('focus', function(e, d) {
            // Reset the revert anchor each time the user starts a new edit.
            this._prevDisplayId = d.data.displayId || '';
        }).on('change', function(e, d) {
            // Phase 56.23 — refuse duplicate IDs anywhere in the project.
            const newId = (this.value || '').trim();
            const prevId = this._prevDisplayId || '';
            if (newId && newId !== prevId && typeof _isDisplayIdDuplicate === 'function' && _isDisplayIdDuplicate(newId, d.data.id)) {
                if (typeof showToast === 'function') showToast('ID "' + newId + '" is already used elsewhere in this project. ID reverted.', 'warning', 4000);
                d.data.displayId = prevId;
                this.value = prevId;
                this._prevDisplayId = undefined;
                if (typeof updateD3 === 'function') updateD3();
                return;
            }
            this._prevDisplayId = undefined;
            propagateRepeatedEventEdit(d.data);
            updateNodeDataInline();
        });
        // Phase 53.33 — λ / P metrics field is read-only on the canvas. Edit failure rate +
        // probability in the node properties panel (right side) instead. Title attribute serves
        // as a quick hint for users who try to click in.
        container.append('xhtml:input').attr('class', 'inline-metrics').attr('readonly', 'readonly').attr('tabindex', '-1').attr('placeholder', 'λ / P (select node to edit)').attr('title', 'Failure rate and probability are read-only on the canvas — select the node to edit in the properties panel.');

        // v66.15 — inline CCF tag as an IN-FLOW flex child at the BOTTOM of the
        // stack, under the λ/P metrics line (Waqas's placement). v66.12
        // absolute-positioned it at bottom:44px, but the flex stack's real
        // rendered metrics differ from the layout constants (the textarea
        // shrinks below its pinned height), so the tag landed on the ID text
        // (live finding). Normal flow can't overlap: description → ID → λ/P →
        // CCF tag, each consuming its own height from the flex-end stack.
        // Still the clickable entry to the CCF group manager popover (#5).
        container.append('xhtml:div').attr('class', 'ccf-inline-tag')
            .attr('title', 'Common-cause group — click to manage')
            // v66.16 — 8px bottom margin lifts the tag clear of the DAL badge
            // that overlaps the container's bottom edge (live finding).
            .style('flex', '0 0 14px').style('height', '14px').style('line-height', '14px').style('margin-bottom', '8px')
            .style('font-size', '9px').style('text-align', 'center')
            .style('color', '#8b5cf6').style('font-weight', '700')
            .style('text-decoration', 'underline').style('cursor', 'pointer')
            .style('pointer-events', 'auto').style('display', 'none')
            .on('mousedown', e => e.stopPropagation())
            .on('dblclick', e => e.stopPropagation())
            .on('click', function (event, d) { try { event.stopPropagation(); _ftaCcfPopover(d.data, event); } catch (_) {} });

        // Phase 56.42 — Actual line for top-down + shared events. The inline-metrics
        // foreignObject is only 160px wide, so the combined "Target: ... Actual: ..."
        // string gets truncated. Render the Actual on a second line as a native SVG
        // <text> element, which can extend beyond the 160px and stays compact.
        nodeEnter.append('text')
            .attr('class', 'node-actual-line')
            .attr('x', 0).attr('y', -10)
            .attr('text-anchor', 'middle')
            .style('font-size', '11px')
            .style('font-family', 'ui-monospace, Menlo, monospace')
            .style('fill', 'var(--color-text-secondary, #555)')
            .style('pointer-events', 'none');

        // Phase 56.45 — Feasibility marker. Small ⚠ next to the metrics line when
        // an event's allocated λ exceeds its engineer-set achievable λ. Hover
        // tooltip explains the delta.
        nodeEnter.append('text')
            .attr('class', 'node-feasibility-mark')
            .attr('x', 78).attr('y', -32)
            .attr('text-anchor', 'end')
            .style('font-size', '14px')
            .style('font-family', 'system-ui, sans-serif')
            .style('fill', '#ff453a')
            .style('font-weight', '700')
            .style('cursor', 'help');

        // Backlog #4 — ◇ mark on qualitative development-error events
        // (ARP 4761A 4.1.1.1). Top-left of the shape, opposite the ⚠ mark.
        nodeEnter.append('text')
            .attr('class', 'node-dev-error-mark')
            .attr('x', -78).attr('y', -32)
            .attr('text-anchor', 'start')
            .style('font-size', '12px')
            .style('font-family', 'system-ui, sans-serif')
            .style('fill', '#0E7490')
            .style('font-weight', '700')
            .style('cursor', 'help');

        // Phase 55.0.9 — per-node hover delete button. Sits at the top-right corner of the
        // description foreignObject (which is at x=-80, y=-120, width=160). Hidden by default
        // via .node-delete-btn opacity:0, fades in on .node:hover (or .node.selected).
        // Clicking calls deleteNodeRecursive() directly so the user doesn't have to select
        // first then hit Delete in the toolbar.
        const delFo = nodeEnter.append('foreignObject')
            .attr('class', 'node-delete-btn')
            .attr('x', 64).attr('y', -126).attr('width', 28).attr('height', 28)
            .on('mousedown', e => e.stopPropagation())
            .on('click', e => e.stopPropagation())
            .on('dblclick', e => e.stopPropagation())
            .on('wheel', e => e.stopPropagation());
        delFo.append('xhtml:button')
            .attr('xmlns', 'http://www.w3.org/1999/xhtml')
            .attr('class', 'node-delete-btn-inner')
            .attr('type', 'button')
            .attr('title', 'Delete this node and its subtree')
            .attr('aria-label', 'Delete node')
            .text('×')
            .on('click', function(e, d) {
                e.stopPropagation();
                // Honor the existing safety check for the page root — deleteNodeRecursive()
                // already alerts if the user tries to delete the top event without going
                // through "Delete top + reset page" flow. We just delegate.
                selectedNodeData = d.data;
                deleteSelectedNode();
            });

        // v66.12 — the CCF tag lives INSIDE the description box now (bottom strip,
        // created with the foreignObject stack above; the name text is pushed up
        // by autoSizeNodeDescription's reserve). The old floating SVG ccf-tag is
        // gone — it collided with wrapped names after the desc box grew to 100px.
        nodeEnter.each(function(d) { d3.select(this).append('path').attr('d', getShapePath(d)).attr('fill', getNodeColors(d).fill).attr('stroke', getNodeColors(d).stroke); });
        nodeEnter.append('text').attr('class', 'transfer-tag').attr('y', 35).attr('text-anchor', 'middle').attr('fill', '#7e22ce').attr('font-weight', 'bold').attr('font-size', '10px');
        // v66.11 — collapse/transfer-in y restored above the description box (the
        // box grew to _FTA_DESC_BOX_HEIGHT=100, top now −174; the old fixed y
        // landed inside the wrapped text). Original clearance preserved.
        nodeEnter.append('text').attr('class', 'collapse-tag').attr('y', -184).attr('text-anchor', 'middle').attr('fill', '#f59e0b').attr('font-weight', 'bold').attr('font-size', '18px');
        // Transfer-out indicator (▽) below a logical gate whose subtree has been extracted to its own page.
        nodeEnter.append('text').attr('class', 'transfer-out-indicator').attr('y', 42).attr('text-anchor', 'middle').attr('fill', '#7e22ce').attr('font-weight', 'bold').attr('font-size', '11px').attr('cursor', 'pointer').attr('pointer-events', 'all')
            .on('click', function(event, d) {
                event.stopPropagation();
                if (!d.data.transferOutTo) return;
                activeFTAPageId = d.data.transferOutTo;
                selectedNodeData = null;
                document.getElementById('node-config-panel').style.display = 'none';
                renderFTASidebar(); updateD3(); fitToScreen();
            });
        // Transfer-in indicator (△) above the root of a page that was extracted from elsewhere.
        nodeEnter.append('text').attr('class', 'transfer-in-indicator').attr('y', -204).attr('text-anchor', 'middle').attr('fill', '#7e22ce').attr('font-weight', 'bold').attr('font-size', '11px').attr('cursor', 'pointer').attr('pointer-events', 'all')
            .on('click', function(event, d) {
                event.stopPropagation();
                const page = ftaPages.find(p => p.id === activeFTAPageId);
                if (!page || !page.transferInFrom || page.root !== d.data) return;
                activeFTAPageId = page.transferInFrom.sourcePageId;
                selectedNodeData = null;
                document.getElementById('node-config-panel').style.display = 'none';
                renderFTASidebar(); updateD3(); fitToScreen();
            });
        // DAL badge — colored pill in the top-right corner of the node shape.
        const dalBadge = nodeEnter.append('g').attr('class', 'dal-badge').attr('transform', 'translate(35, -22)');
        // Phase 53.41 — bigger rect + bigger bolder text + darker text fill for readability.
        dalBadge.append('rect').attr('class', 'dal-badge-rect').attr('x', -27).attr('y', -11).attr('width', 54).attr('height', 20).attr('rx', 5).attr('ry', 5).attr('stroke', '#0f172a').attr('stroke-width', 1.25);
        dalBadge.append('text').attr('class', 'dal-badge-text').attr('y', 4).attr('text-anchor', 'middle').attr('font-weight', '700').attr('font-size', '11.5px').attr('fill', '#0f172a').style('letter-spacing', '0.3px');
        // DAL-carrier star removed — ARP4754B / ARP4761A define no marked "carrier". The per-member
        // DAL badges fully express the allocation; the option-based DALgebra explanation lives in the
        // generated requirement's rationale, not as a canvas glyph.
        // Phase 46 — K/N badge on VOTING gates. Mirrors the DAL badge layout but on the left
        // side of the shape. Indigo fill to distinguish from the DAL badge palette.
        const votingBadge = nodeEnter.append('g').attr('class', 'voting-k-badge').attr('transform', 'translate(-35, -22)');
        votingBadge.append('rect').attr('class', 'voting-k-rect').attr('x', -22).attr('y', -10).attr('width', 44).attr('height', 18).attr('rx', 4).attr('ry', 4).attr('fill', '#5856d6').attr('stroke', '#1f2937').attr('stroke-width', 1);
        votingBadge.append('text').attr('class', 'voting-k-text').attr('y', 3).attr('text-anchor', 'middle').attr('font-weight', 'bold').attr('font-size', '10px').attr('fill', '#ffffff');

        // Inline mode dropdown under each leaf node (basic + undeveloped). Only the dropdown lives
        // on the canvas — value/library entry happens in the node-config panel to keep the canvas
        // uncluttered. Switching mode auto-converts inputValue so resolved λ stays stable.
        const inputFo = nodeEnter.append('foreignObject')
            .attr('class', 'node-input-mode-fo')
            .attr('x', -80).attr('y', 50).attr('width', 160).attr('height', 26)
            .on('mousedown', e => e.stopPropagation())
            .on('click', e => e.stopPropagation())
            .on('dblclick', e => e.stopPropagation())
            .on('wheel', e => e.stopPropagation());
        const inputDiv = inputFo.append('xhtml:div').attr('xmlns', 'http://www.w3.org/1999/xhtml')
            .style('width', '100%');
        inputDiv.append('xhtml:select').attr('class', 'inline-mode')
            .html('<option value="lambda">λ — Failure rate</option><option value="mtbf">MTBF (hours)</option><option value="probability">P at exposure t</option><option value="library">Component library</option>')
            .on('change', function(e, d) {
                const oldMode = d.data.inputMode || 'lambda';
                const newMode = this.value;
                const oldLambda = d.data.lambda || 0;
                // Auto-convert inputValue so the resolved λ stays continuous across the unit change.
                const t = ftaConfig.exposureTime || 1;
                if (newMode === 'lambda') d.data.inputValue = oldLambda;
                else if (newMode === 'mtbf') d.data.inputValue = oldLambda > 0 ? 1 / oldLambda : 0;
                else if (newMode === 'probability') d.data.inputValue = -Math.expm1(-oldLambda * t);
                // For library mode the user picks via the panel; leave inputValue alone.
                d.data.inputMode = newMode;
                if (newMode !== 'library') {
                    d.data.lambda = lambdaFromInputMode(newMode, d.data.inputValue, d.data.libraryKey, t);
                }
                // Backlog #4 — a dev-error event never carries a number,
                // whatever input mode the user switches to.
                if (d.data.eventClass === 'dev-error') { d.data.lambda = 0; d.data.inputValue = 0; }
                propagateRepeatedEventEdit(d.data);
                calculateAllProbabilities();
                updateD3();
                // If the panel is open on this node, refresh it so the user can edit the new-mode value.
                if (selectedNodeData && selectedNodeData.id === d.data.id) selectNode(d.data);
            });

        const nodeUpdate = nodeEnter.merge(nodes); nodeUpdate.transition().duration(180).attr('transform', d => `translate(${d.x},${d.y})`);
        nodeUpdate.attr('class', d => `node ${selectedNodeData && selectedNodeData.id === d.data.id ? 'selected' : ''}`);
        
        nodeUpdate.select('.inline-desc').each(function(d) {
            if(document.activeElement !== this) this.value = d.data.name || '';
            // Phase 49 — fit the foreignObject to the rendered description height every
            // render so the layout stays in step with whatever's actually in the textarea.
            autoSizeNodeDescription(this, d);
        });
        nodeUpdate.select('.inline-id').each(function(d) { if(document.activeElement !== this) this.value = d.data.displayId; });
        nodeUpdate.select('.inline-metrics').each(function(d) {
            // Phase 33 \u2014 every node (gate + leaf) shows \u03BB /hr as primary, P at t as secondary.
            // Phase 53.33 \u2014 field is now read-only; ignore legacy customMetrics overrides and
            // always show the live computed value so editing in the properties panel is reflected
            // immediately on the canvas.
            this.value = formatNodeMetrics(d);
        });
        // Phase 56.42 \u2014 Actual line for top-down + shared events. Populated by
        // formatNodeActualLine, which returns '' for nodes where the actual is
        // not divergent (so the line silently hides).
        // Phase 63.9 \u2014 long advisory notes (\u26a0/\u25b3 prefixed) collapse to a caution
        // flag on the canvas; the full message moves to a click-toast + tooltip.
        // Short data lines ("Actual: P=\u2026") still render as text.
        nodeUpdate.select('.node-actual-line').each(function(d) {
            const txt = (typeof formatNodeActualLine === 'function') ? formatNodeActualLine(d) : '';
            const isFlag = !!txt && (txt.charAt(0) === '\u26a0' || txt.charAt(0) === '\u25b3');
            if (isFlag) {
                const glyph = txt.charAt(0);
                this.textContent = glyph;
                this.style.display = '';
                this.style.cursor = 'pointer';
                this.style.fontSize = '15px';
                const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                titleEl.textContent = txt.slice(1).trim();
                this.appendChild(titleEl);
                this.onclick = function(ev) {
                    try { ev.stopPropagation(); if (typeof showToast === 'function') showToast(txt.slice(1).trim(), glyph === '\u26a0' ? 'warning' : 'info', 6500); } catch (_) {}
                };
            } else {
                this.textContent = txt;
                this.style.cursor = '';
                this.style.fontSize = '';
                this.onclick = null;
                this.style.display = txt ? '' : 'none';
            }
        });
        // Phase 56.45 — Feasibility marker. Show ⚠ on leaves where allocated > achievable.
        nodeUpdate.select('.node-feasibility-mark').each(function(d) {
            const node = d.data;
            if (node && node.type !== 'gate' && node._feasibilityViolation) {
                const v = node._feasibilityViolation;
                this.textContent = '⚠';
                this.style.display = '';
                let titleEl = this.querySelector('title');
                if (!titleEl) {
                    titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                    this.appendChild(titleEl);
                }
                titleEl.textContent = 'Physically achievable failure probability ' + v.achievable.toExponential(2) +
                    (v.achievableLambda ? ' (from λ_ach = ' + v.achievableLambda.toExponential(2) + ' /hr over the exposure window)' : '') +
                    ' exceeds the allocated budget P ≤ ' + v.allocated.toExponential(2) +
                    ' — component would need to be ' + v.delta.toFixed(1) + '× more reliable than physics allows. Architecture change or higher-grade component required.';
            } else {
                this.textContent = '';
                this.style.display = 'none';
            }
        });
        // Backlog #4 — ◇ marker sync on qualitative development-error events.
        nodeUpdate.select('.node-dev-error-mark').each(function(d) {
            const node = d.data;
            if (node && node.type !== 'gate' && node.eventClass === 'dev-error') {
                this.textContent = '◇ DEV ERROR';
                this.style.display = '';
                let titleEl = this.querySelector('title');
                if (!titleEl) {
                    titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                    this.appendChild(titleEl);
                }
                titleEl.textContent = 'Qualitative development error (ARP 4761A 4.1.1.1) — never quantified. λ and P are forced to 0; cut sets containing this event are reported as qualitative failure scenarios and the quantified P(top) is explicitly conditional on no development error.';
            } else {
                this.textContent = '';
                this.style.display = 'none';
            }
        });
        // Sync inline mode dropdown. Visible for leaf events with λ semantics (basic + undeveloped).
        nodeUpdate.select('.node-input-mode-fo').style('display', d => (d.data.type === 'basic' || d.data.type === 'undeveloped') ? 'block' : 'none');
        nodeUpdate.select('.inline-mode').each(function(d) {
            if (document.activeElement !== this) this.value = d.data.inputMode || 'lambda';
        });
        
        nodeUpdate.each(function(d) { d3.select(this).select('path').transition().duration(120).attr('d', getShapePath(d)).attr('fill', getNodeColors(d).fill).attr('stroke', getNodeColors(d).stroke); });
        nodeUpdate.select('.ccf-inline-tag')
            .style('display', d => (d.data.ccfGroup && d.data.beta > 0) ? 'block' : 'none')
            .text(d => (d.data.ccfGroup && d.data.beta > 0) ? `(CCF: ${d.data.ccfGroup})` : "");
        // Compute the per-render repeated map. Used to amber-tint the inline-id and to set the SVG group's title.
        const _repeatMap = repeatedEventGroups();
        nodeUpdate.each(function(d) {
            const lid = d.data.logicalId != null ? d.data.logicalId : d.data.id;
            const grp = _repeatMap.get(lid);
            const count = grp ? grp.length : 1;
            const idEl = this.querySelector('.inline-id');
            if (idEl) idEl.classList.toggle('is-repeated', count >= 2);
            // SVG <title> on the group acts as a tooltip on hover.
            let titleEl = this.querySelector(':scope > title');
            if (count >= 2) {
                if (!titleEl) {
                    titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                    this.insertBefore(titleEl, this.firstChild);
                }
                titleEl.textContent = `Common-mode event — appears ${count} times in this tree`;
            } else if (titleEl) {
                titleEl.remove();
            }
        });
        // Pure TRANSFER and transferred-out logical gates both point at another page; the tag below
        // the triangle names the destination.
        nodeUpdate.select('.transfer-tag').text(d => {
            if (d.data.gateType === 'TRANSFER') return `→ ${ftaPages.find(p=>p.id === d.data.linkedPageId)?.name || 'Unlinked'}`;
            if (d.data.transferOutTo) return `→ ${ftaPages.find(p=>p.id === d.data.transferOutTo)?.name || 'Unlinked'}`;
            return "";
        });
        // The transfer-out-indicator is now superfluous — the triangle shape conveys it.
        nodeUpdate.select('.transfer-out-indicator').text('');
        // △ Transfer In above the root of any page that was extracted from another.
        nodeUpdate.select('.transfer-in-indicator').text(d => {
            const page = ftaPages.find(p => p.id === activeFTAPageId);
            if (!page || !page.transferInFrom || page.root !== d.data) return '';
            const src = ftaPages.find(p => p.id === page.transferInFrom.sourcePageId);
            return src ? `△ Transfer In ← ${src.name}` : '△ Transfer In';
        });
        nodeUpdate.select('.collapse-tag').text(d => d.data._children ? "[+]" : "");
        // Show / hide the DAL badge based on allocation state and color it per letter.
        nodeUpdate.select('.dal-badge').style('display', d => d.data.allocatedDAL ? 'inline' : 'none');
        nodeUpdate.select('.dal-badge-rect').attr('fill', d => DAL_COLORS[d.data.allocatedDAL] || '#9ca3af');
        nodeUpdate.select('.dal-badge-text').text(d => d.data.allocatedDAL ? `${dalPrefixForNode(d.data)} ${d.data.allocatedDAL}` : '');
        // Phase 46 — VOTING K/N badge. Only shown when the gate is VOTING.
        nodeUpdate.select('.voting-k-badge').style('display', d => d.data.gateType === 'VOTING' ? 'inline' : 'none');
        nodeUpdate.select('.voting-k-text').text(d => {
            if (d.data.gateType !== 'VOTING') return '';
            const k = d.data.votingK || 2;
            const kids = d.data.children || d.data._children || [];
            return 'K=' + k + '/' + kids.length;
        });
        nodes.exit().remove(); updateToolbarState();
    } catch (err) { console.error("D3 Rendering Error:", err); }
}

// Parent / Root Traversal Logic
function findParentNode(root, childId) { let actualChildren = root.children || root._children; if (actualChildren) { for (let i = 0; i < actualChildren.length; i++) { if (actualChildren[i].id === childId) return root; let found = findParentNode(actualChildren[i], childId); if (found) return found; } } return null; }
function selectParentNode() { if(!selectedNodeData) return; const rootNode = getActiveFTARoot(); if(!rootNode || selectedNodeData.id === rootNode.id) return; const parent = findParentNode(rootNode, selectedNodeData.id); if(parent) { selectNode(parent); fitToScreen(); } }
function selectRootNode() { const rootNode = getActiveFTARoot(); if(rootNode) { selectNode(rootNode); fitToScreen(); } }
function findNode(root, targetId) { if (!root) return null; if (root.id === targetId) return root; let actualChildren = root.children || root._children; if (actualChildren) { for (let child of actualChildren) { let result = findNode(child, targetId); if (result) return result; } } return null; }

// Phase 56.24 — single-click and double-click split.
//   selectNode(dataNode)            — sets selectedNodeData + (re)populates the
//                                     properties panel form fields, but does NOT
//                                     open the panel. If the panel was already
//                                     visible (e.g. user previously double-clicked
//                                     and the modal is open), its contents refresh
//                                     in place. This is the single-click handler.
//   openNodePropertiesModal(dataNode) — calls selectNode then forces the panel
//                                     visible, which the unified edit-modal
//                                     observer picks up to portal the form into
//                                     the centered modal. This is the double-click
//                                     handler (and the keyboard shortcut handler).
function openNodePropertiesModal(dataNode) {
    selectNode(dataNode);
    const panel = document.getElementById('node-config-panel');
    if (panel) panel.style.display = 'block';
    // Phase 57 — the properties panel is now a right-docked slide-in drawer that opens on a
    // single node click and stays in the corner (non-blocking, canvas stays usable). It is not
    // draggable (that would fight the fixed right-edge docking) but it IS resizable via the
    // left-edge handle; restore the user's saved width and wire the drag once.
    _applyNodeDrawerWidth();
    _initNodeDrawerResize();
    // #42 — keep the selected node visible beside the drawer (pans only if it'd be hidden).
    setTimeout(() => { try { _ftaRevealNodeBesidePanel(dataNode); } catch (_) {} }, 80);
}

// Phase 66.18 — ceiling raised 960 -> 1200 to match the wider default (760); on a
// large display the drawer can now be dragged genuinely wide for a long standards
// block. The 96%-of-viewport clamp still stops it swallowing the canvas entirely.
function _nodeDrawerMaxW() { return Math.min(1200, Math.round((window.innerWidth || 1200) * 0.96)); }
function _applyNodeDrawerWidth() {
    const panel = document.getElementById('node-config-panel');
    if (!panel) return;
    let w;
    try { w = parseInt(localStorage.getItem(NODE_DRAWER_WIDTH_KEY), 10); } catch (_) { w = NaN; }
    if (!isFinite(w) || w <= 0) return;   // no saved preference -> CSS default applies
    // Phase 66.18 — a width saved while the default was 520 would otherwise pin the
    // drawer at the old narrow size forever. Anything at or under the old default is
    // treated as "never deliberately widened" and dropped, so the new default shows.
    if (w <= 520) { try { localStorage.removeItem(NODE_DRAWER_WIDTH_KEY); } catch (_) {} return; }
    w = Math.max(NODE_DRAWER_MIN_W, Math.min(_nodeDrawerMaxW(), w));
    panel.style.width = w + 'px';
}
// Phase 66.24 — publish the drawer's rendered width as --drawer-w so the drag handle,
// which is now pinned to the viewport (it used to scroll off the top of a tall drawer),
// can sit exactly on the drawer's left edge. Guarded on w > 0 so a measurement taken
// while the panel is display:none does not wipe the last good value.
function _syncNodeDrawerWidthVar() {
    const panel = document.getElementById('node-config-panel');
    if (!panel) return;
    // offsetWidth, NOT getBoundingClientRect().width. The app runs under a desktop scale
    // factor, so the rect is in scaled pixels while a CSS `right:` value is resolved in
    // layout pixels — measured live on 19 Aug the rect said 684 where the layout width
    // was 759, which would have parked the handle ~75px inside the drawer.
    const w = panel.offsetWidth;
    if (w > 0) document.documentElement.style.setProperty('--drawer-w', w + 'px');
}
function _initNodeDrawerResize() {
    const panel = document.getElementById('node-config-panel');
    const handle = document.getElementById('node-drawer-resize');
    if (!panel || !handle || handle._resizeWired) return;
    handle._resizeWired = true;
    // One observer covers every path that changes the width: the CSS default, a width
    // restored from localStorage, a live drag, and a viewport resize.
    try {
        if (typeof ResizeObserver === 'function') {
            new ResizeObserver(_syncNodeDrawerWidthVar).observe(panel);
        } else {
            window.addEventListener('resize', _syncNodeDrawerWidthVar);
        }
    } catch (_) { window.addEventListener('resize', _syncNodeDrawerWidthVar); }
    _syncNodeDrawerWidthVar();
    let dragging = false;
    const onMove = (e) => {
        if (!dragging) return;
        const clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
        // Drawer is docked at the right edge, so its width = viewport width − pointer X.
        let w = (window.innerWidth || 1200) - clientX;
        w = Math.max(NODE_DRAWER_MIN_W, Math.min(_nodeDrawerMaxW(), w));
        panel.style.width = w + 'px';
        _syncNodeDrawerWidthVar();
        e.preventDefault();
    };
    const onUp = () => {
        if (!dragging) return;
        dragging = false;
        handle.classList.remove('dragging');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        const w = parseInt(panel.style.width, 10);
        if (isFinite(w) && w > 0) { try { localStorage.setItem(NODE_DRAWER_WIDTH_KEY, String(w)); } catch (_) {} }
    };
    const onDown = (e) => {
        dragging = true;
        handle.classList.add('dragging');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ew-resize';
        e.preventDefault();
    };
    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
}

function selectNode(dataNode) {
    selectedNodeData = dataNode; document.getElementById('config-node-id').innerText = dataNode.displayId; document.getElementById('config-name').value = dataNode.name;
    if (typeof refreshBasicEventDerived === 'function') refreshBasicEventDerived();
    // Phase 66.33 — "what is this node?" renders first in the drawer. Guarded: the
    // identity editor is additive, and a node with no coordinate is still perfectly
    // editable — it just cannot be owned, shared or traced until someone declares it.
    try { if (typeof slRenderNodeIdentity === 'function') slRenderNodeIdentity(); } catch (_) {}
    // Subtle common-mode hint next to the node ID — only shown if this logicalId appears elsewhere.
    const _hint = document.getElementById('config-common-mode-hint');
    const _miBtn = document.getElementById('btn-make-independent');
    if (_hint) {
        const _grp = repeatedEventGroups().get(dataNode.logicalId != null ? dataNode.logicalId : dataNode.id);
        const _shared = (_grp && _grp.length >= 2);
        _hint.textContent = _shared ? `· common-mode ×${_grp.length}` : '';
        // Phase 56.51b — only offer Make Independent when this node is currently shared.
        if (_miBtn) _miBtn.style.display = _shared ? 'inline-block' : 'none';
    } else if (_miBtn) {
        _miBtn.style.display = 'none';
    }
    // Phase 58 — shared-resource common-cause warning. Surfaced as a sibling span so
    // it never clobbers the common-mode ×N hint above. Set transiently by the
    // shared-resource detector (node._sharedResourceFlag = resource name).
    try {
        let _srHint = document.getElementById('config-shared-resource-hint');
        if (!_srHint && _hint && _hint.parentNode) {
            _srHint = document.createElement('span');
            _srHint.id = 'config-shared-resource-hint';
            _srHint.style.cssText = 'font-size: 0.75em; color: var(--sev-cat-fg); font-weight: 600; margin-left: 6px;';
            _hint.parentNode.insertBefore(_srHint, _hint.nextSibling);
        }
        if (_srHint) {
            _srHint.textContent = dataNode && dataNode._sharedResourceFlag
                ? ('⚠ shared resource: ' + dataNode._sharedResourceFlag + ' — independence may be defeated')
                : '';
        }
    } catch (e) { /* drawer hint is best-effort */ }
    // STPA-BRIDGE — the reverse view: if any assessed UCA declares THIS node as
    // its failure-mode counterpart, say so in the drawer. Read-only backlink;
    // the bridge is authored on the STPA lane (Step 3), refs validated there.
    try {
        let _sbHint = document.getElementById('config-stpa-bridge-hint');
        if (!_sbHint && _hint && _hint.parentNode) {
            _sbHint = document.createElement('span');
            _sbHint.id = 'config-stpa-bridge-hint';
            _sbHint.style.cssText = 'font-size: 0.75em; color: #6D28D9; font-weight: 600; margin-left: 6px;';
            _hint.parentNode.appendChild(_sbHint);
        }
        if (_sbHint) {
            const _ucas = [];
            const _disp = (typeof stpaData !== 'undefined' && stpaData && stpaData.dispositions) ? stpaData.dispositions : {};
            Object.keys(_disp).forEach(k => {
                const x = _disp[k];
                if (!x || x.status !== 'assessed' || !x.bridge || !x.bridge.declared) return;
                const refs = (x.bridge.ftaRefs || []).map(String);
                if (refs.indexOf(String(dataNode.displayId)) >= 0 || refs.indexOf(String(dataNode.id)) >= 0) _ucas.push('UCA-' + k);
            });
            _sbHint.textContent = _ucas.length ? ('⛓ STPA: ' + _ucas.join(', ')) : '';
            _sbHint.title = _ucas.length ? ('This node is the declared failure-mode counterpart of ' + _ucas.length + ' unsafe control action(s) — the bridge is authored on the STPA lane, Step 3. The classical lane quantifies the counterpart; STPA keeps the context that makes it unsafe.') : '';
        }
    } catch (e) { /* backlink chip is best-effort */ }
    let typeVal = dataNode.type === 'gate' ? dataNode.gateType : dataNode.type; document.getElementById('config-node-type').value = typeVal;
    document.getElementById('config-name-container').style.display = (dataNode.gateType === 'TRANSFER') ? 'none' : 'block';
    document.getElementById('config-transfer-container').style.display = (dataNode.gateType === 'TRANSFER') ? 'flex' : 'none';
    document.getElementById('config-ccf-container').style.display = (dataNode.type === 'basic') ? 'flex' : 'none';
    if(dataNode.gateType === 'TRANSFER') { const linkSel = document.getElementById('config-transfer-link'); linkSel.innerHTML = '<option value="">-- Select Tree to Link --</option>'; ftaPages.forEach(p => { if(p.id !== activeFTAPageId) linkSel.innerHTML += `<option value="${esc(p.id)}" ${dataNode.linkedPageId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`; }); }
    if (dataNode.type !== 'gate' && dataNode.gateType !== 'TRANSFER') { document.getElementById('config-lambda').value = dataNode.lambda || 0; /* Phase 66.10 — the weight slider is a PERCENTAGE control; seeding it with the raw `weight || 1` wrote 1% onto any node that had no weight yet. syncWeightSliderFromNode() owns it and defaults to the node's equal share. */ if (typeof syncWeightSliderFromNode === 'function') syncWeightSliderFromNode(); if (typeof slRenderEventReuse === 'function') slRenderEventReuse(); if(dataNode.type === 'basic') { document.getElementById('config-ccf-group').value = dataNode.ccfGroup || ''; document.getElementById('config-beta').value = dataNode.beta || 0; document.getElementById('config-gamma').value = dataNode.gamma || 0; document.getElementById('config-delta').value = dataNode.delta || 0; } }
    if (dataNode.gateType === 'VOTING') document.getElementById('config-voting-k').value = dataNode.votingK || 2;

    // --- DFT-WARM: spare dormancy + switch reliability (SPARE gates only) ---
    const spareContainer = document.getElementById('config-spare-container');
    if (spareContainer) {
        const isSpare = dataNode.gateType === 'SPARE';
        spareContainer.style.display = isSpare ? 'flex' : 'none';
        if (isSpare) {
            const wkEl = document.getElementById('config-spare-warmk');
            const spEl = document.getElementById('config-spare-switchp');
            // Absent = the historical cold / perfect-switch model. Show the defaults
            // explicitly rather than leaving the fields blank, so the model actually
            // in force is never something the reader has to guess at.
            if (wkEl) wkEl.value = isFinite(parseFloat(dataNode.spareWarmK)) ? parseFloat(dataNode.spareWarmK) : 0;
            if (spEl) spEl.value = isFinite(parseFloat(dataNode.spareSwitchP)) ? parseFloat(dataNode.spareSwitchP) : 1;
        }
    }

    // --- DAL allocation panel (AND / INHIBIT gates only) ---
    const dalContainer = document.getElementById('config-dal-container');
    const isAndLike = dataNode.gateType === 'AND' || dataNode.gateType === 'INHIBIT';
    if (dalContainer) {
        dalContainer.style.display = isAndLike ? 'flex' : 'none';
        if (isAndLike) {
            const indepSel = document.getElementById('config-dal-independence');
            if (indepSel) indepSel.value = dataNode.dalIndependence || 'claimed';
            document.getElementById('config-dal-option').value = dataNode.dalOption || 'opt2';
            const carrierWrap = document.getElementById('config-dal-carrier-container');
            const carrierSel = document.getElementById('config-dal-carrier');
            const kids = dataNode.children || dataNode._children || [];
            carrierSel.innerHTML = '<option value="">-- pick a child --</option>';
            kids.forEach(c => carrierSel.innerHTML += `<option value="${esc(c.id)}" ${dataNode.dalCarrierChildId === c.id ? 'selected' : ''}>[${esc(c.displayId)}] ${esc(c.name || '')}</option>`);
            carrierWrap.style.display = (dataNode.dalOption === 'opt1') ? 'block' : 'none';
        }
    }

    // --- Phase 55.0.8 — DAL Kind override (FDAL/IDAL) — applies to every non-TRANSFER node. ---
    const dalKindContainer = document.getElementById('config-dal-kind-container');
    if (dalKindContainer) {
        const showKindOverride = dataNode.gateType !== 'TRANSFER';
        dalKindContainer.style.display = showKindOverride ? 'flex' : 'none';
        if (showKindOverride) {
            const kindSel = document.getElementById('config-dal-kind-override');
            if (kindSel) {
                kindSel.value = (dataNode.dalKindOverride === 'FDAL' || dataNode.dalKindOverride === 'IDAL')
                    ? dataNode.dalKindOverride
                    : '';
            }
        }
    }

    // Panel-side input-mode block — visible for leaf events (basic + undeveloped) where it provides
    // the value/library entry. The inline canvas dropdown only switches mode.
    const inputContainer = document.getElementById('config-input-mode-container');
    const showInputMode = (dataNode.type === 'basic' || dataNode.type === 'undeveloped');
    if (inputContainer) {
        inputContainer.style.display = showInputMode ? 'flex' : 'none';
        if (showInputMode) {
            populateComponentLibrary();
            document.getElementById('config-input-mode').value = dataNode.inputMode || 'lambda';
            document.getElementById('config-input-value').value = dataNode.inputValue != null ? dataNode.inputValue : (dataNode.lambda || 0);
            if (dataNode.libraryKey) document.getElementById('config-input-library').value = dataNode.libraryKey;
            onInputModeChange(); // sync labels and visibility
        }
    }
    // Legacy "Failure Rate (λ/hr)" field hidden for leaf events that now use the input-mode block.
    const lambdaContainer = document.getElementById('config-lambda-container');
    if (lambdaContainer) lambdaContainer.style.display = showInputMode ? 'none' : 'block';

    // Backlog #4 — qualitative development-error checkbox (ARP 4761A 4.1.1.1).
    // Leaf events only (basic + undeveloped). Sync checked state from the node
    // and mirror the disabled state onto both value inputs (λ + input-mode).
    const devContainer = document.getElementById('config-dev-error-container');
    if (devContainer) {
        devContainer.style.display = showInputMode ? 'flex' : 'none';
        const devChk = document.getElementById('config-dev-error');
        const isDev = showInputMode && dataNode.eventClass === 'dev-error';
        if (devChk) devChk.checked = isDev;
        const lamInp = document.getElementById('config-lambda');
        const valInp = document.getElementById('config-input-value');
        if (lamInp) lamInp.disabled = isDev;
        if (valInp) valInp.disabled = isDev;
    }

    // Phase 56.45 — Achievable λ container (basic / undeveloped events only).
    // Auto-populate from library when input mode is library and field is empty.
    const achievableContainer = document.getElementById('config-achievable-container');
    if (achievableContainer) {
        achievableContainer.style.display = showInputMode ? 'flex' : 'none';
        if (showInputMode) {
            const achEl = document.getElementById('config-achievable-lambda');
            if (achEl) {
                // Prefer explicit user-set value; otherwise library default for library mode; otherwise empty.
                let val = '';
                if (typeof dataNode.achievableLambda === 'number' && isFinite(dataNode.achievableLambda) && dataNode.achievableLambda > 0) {
                    val = dataNode.achievableLambda;
                } else if (dataNode.inputMode === 'library' && dataNode.libraryKey && typeof COMPONENT_LIBRARY === 'object' && COMPONENT_LIBRARY[dataNode.libraryKey]) {
                    val = COMPONENT_LIBRARY[dataNode.libraryKey].lambda;
                }
                achEl.value = val === '' ? '' : val;
            }
            // Feasibility status text.
            const statusEl = document.getElementById('config-feasibility-status');
            if (statusEl) {
                const alloc = dataNode.lambda || 0;
                const ach = (typeof dataNode.achievableLambda === 'number' && isFinite(dataNode.achievableLambda)) ? dataNode.achievableLambda : 0;
                let msg = 'Leave blank to skip the check. Auto-populates from the component library when Input Mode is library.';
                if (alloc > 0 && ach > 0) {
                    if (ach > alloc * 1.001) {
                        const delta = ach / alloc;
                        msg = '<span style="color:#ff453a;font-weight:600;">⚠ Achievable ' + ach.toExponential(2) + ' /hr is tighter than the allocated budget ' + alloc.toExponential(2) + ' allows — physics gives a worse failure rate than the budget can absorb. Need to make the component ' + delta.toFixed(1) + '× more reliable.</span> Architecture change or higher-grade component required.';
                    } else {
                        const margin = alloc / ach;
                        msg = '<span style="color:#34c759;">✓ Feasible. Allocated budget ' + alloc.toExponential(2) + ' /hr accommodates the achievable rate ' + ach.toExponential(2) + ' /hr with ' + margin.toFixed(1) + '× margin.</span>';
                    }
                }
                statusEl.innerHTML = '<p style="font-size:11px;color:var(--color-text-tertiary);margin:18px 0 0 0;line-height:1.4;">' + msg + '</p>';
            }
        }
    }

    // Uncertainty (lognormal EF) + repair model panel — for leaf events only.
    const uncertContainer = document.getElementById('config-uncertainty-container');
    if (uncertContainer) {
        uncertContainer.style.display = showInputMode ? 'flex' : 'none';
        if (showInputMode) {
            document.getElementById('config-lambda-ef').value = dataNode.lambdaEF != null ? dataNode.lambdaEF : 1;
            document.getElementById('config-repair-model').value = dataNode.repairModel || 'unmaintained';
            document.getElementById('config-mu').value = dataNode.mu != null ? dataNode.mu : '';
            document.getElementById('config-tau').value = dataNode.tau != null ? dataNode.tau : '';
            // Populate the Markov dropdown with the project's models.
            const mkvSel = document.getElementById('config-markov-model');
            if (mkvSel) {
                const models = (projectConfig && projectConfig.markovModels) || [];
                mkvSel.innerHTML = '<option value="">— None —</option>' + models.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
                mkvSel.value = dataNode.markovModelId || '';
            }
            onRepairModelChange();
        }
    }
    // Phase 57 — per-event exposure controls (leaf events only).
    const exposureContainer = document.getElementById('config-exposure-container');
    if (exposureContainer) {
        exposureContainer.style.display = showInputMode ? 'flex' : 'none';
        if (showInputMode) {
            const modeSel = document.getElementById('config-exposure-mode');
            if (modeSel) modeSel.value = dataNode.exposureMode || 'continuous';
            const expTimeEl = document.getElementById('config-exposure-time');
            if (expTimeEl) expTimeEl.value = dataNode.exposureTime != null ? dataNode.exposureTime : '';
            const dormEl = document.getElementById('config-dormancy-interval');
            if (dormEl) dormEl.value = dataNode.dormancyInterval != null ? dataNode.dormancyInterval : '';
            // Toggle the conditional inputs to match the mode without persisting (avoid a write loop).
            const mode = dataNode.exposureMode || 'continuous';
            const manualWrap = document.getElementById('config-exposure-manual-container');
            const dormWrap   = document.getElementById('config-dormancy-container');
            if (manualWrap) manualWrap.style.display = mode === 'manual' ? 'block' : 'none';
            if (dormWrap)   dormWrap.style.display   = mode === 'latent' ? 'block' : 'none';
            if (typeof _refreshExposureReadout === 'function') _refreshExposureReadout();
        }
    }
    // Per-phase λ editor — visible only when the active FTA is linked to a hazard with phases.
    renderPhaseLambdaEditor(dataNode);
    updateFTAConfigUI(); updateD3();
}

// Produce the inner HTML for a component library <select>, with optgroups by `group`.
// Shared between the inline canvas dropdown and any panel-side library select.
// Each option carries a `title` attribute so hovering reveals the source citation.
function componentLibraryOptionsHtml() {
    const buckets = new Map();
    // Merge built-in + per-project custom entries so the dropdown surfaces everything.
    const merged = getActiveLibrary();
    Object.entries(merged).forEach(([key, def]) => {
        const g = def.group || 'Other';
        if (!buckets.has(g)) buckets.set(g, []);
        buckets.get(g).push([key, def]);
    });
    let html = '<option value="">-- Select component --</option>';
    buckets.forEach((entries, groupName) => {
        html += `<optgroup label="${esc(groupName)}">`;
        entries.forEach(([key, def]) => {
            const source = def.source ? ` — Source: ${def.source}` : '';
            const tip = `${def.name}${source} | λ = ${def.lambda.toExponential(2)}/hr`;
            html += `<option value="${esc(key)}" title="${esc(tip)}">${esc(def.name)} (λ = ${def.lambda.toExponential(0)})</option>`;
        });
        html += '</optgroup>';
    });
    return html;
}

// The "active" library — built-in entries merged with the project's customLibrary additions/overrides.
// Custom entries supersede built-in entries with the same key (so users can override individual λ values).
function getActiveLibrary() {
    const custom = (projectConfig && projectConfig.customLibrary) || {};
    return { ...COMPONENT_LIBRARY, ...custom };
}

function isBuiltinLibraryEntry(key) { return COMPONENT_LIBRARY[key] !== undefined; }

// Recompute λ for every node whose inputMode is 'library', so changes to the library
// (override, delete, multiplier change) propagate through every fault tree.
function refreshLibraryDependentNodes() {
    ftaPages.forEach(page => {
        (function walk(n) {
            if (!n) return;
            if (n.inputMode === 'library' && n.libraryKey) {
                n.lambda = lambdaFromInputMode('library', 0, n.libraryKey, ftaConfig.exposureTime);
            }
            const kids = n.children || n._children;
            if (kids) kids.forEach(walk);
        })(page.root);
    });
    calculateAllProbabilities();
    if (typeof updateD3 === 'function') updateD3();
}

// Phase 66.11 — TRANSFER HOP. Double-click on a transfer gate is supposed to open
// the tree it transfers to (another system's tree, or a sub-tree of this one). The
// d3 'dblclick' binding alone was UNRELIABLE in practice: the first click opens the
// properties panel, that re-renders the canvas, and the second click lands on a
// freshly-created element — so the pair never completes and nothing happens. We now
// detect the second click ourselves, keyed on the NODE id rather than the DOM node,
// which survives the re-render. The dblclick binding is kept as well: both routes
// funnel into this one function so the behaviour cannot drift apart again.
function ftaOpenTransferTarget(nodeData) {
    if (!nodeData) return false;
    const targetId = nodeData.linkedPageId || nodeData.transferOutTo;
    if (!targetId) return false;
    const target = (typeof ftaPages !== 'undefined') ? ftaPages.find(p => p.id === targetId) : null;
    if (!target) {
        if (typeof showToast === 'function') showToast('That transfer points at a tree that no longer exists.', 'warning', 5000);
        return false;
    }
    activeFTAPageId = targetId;
    selectedNodeData = null;
    const cfg = document.getElementById('node-config-panel');
    if (cfg) cfg.style.display = 'none';
    if (typeof renderFTASidebar === 'function') renderFTASidebar();
    if (typeof updateD3 === 'function') updateD3();
    if (typeof fitToScreen === 'function') fitToScreen();
    // You have just been moved to a different tree — say so, and mark what you
    // arrived at, or the hop is indistinguishable from a mis-click.
    if (typeof showToast === 'function') showToast('Transferred to: ' + (target.name || targetId), 'info', 4200);
    setTimeout(() => {
        try {
            if (target.root && typeof _slHighlightFtaNode === 'function') {
                _slHighlightFtaNode(target.root.id, '\u25c0 TRANSFERRED HERE');
            }
        } catch (_) {}
    }, 320);
    return true;
}

// Second click on the SAME transfer gate within the double-click window.
var _ftaLastNodeClick = null;
function _ftaClickIsTransferDouble(nodeData, nowMs) {
    if (!nodeData || !(nodeData.linkedPageId || nodeData.transferOutTo)) { _ftaLastNodeClick = null; return false; }
    const prev = _ftaLastNodeClick;
    _ftaLastNodeClick = { id: nodeData.id, t: nowMs };
    return !!(prev && prev.id === nodeData.id && (nowMs - prev.t) < 450);
}

// Phase 66.17 — EVENT REUSE / CROSS-TREE AWARENESS panel block.
// Answers Paganini's two questions in the one place where a user names an event:
//   "is this event used elsewhere?"  -> the usage line, with click-through
//   "does this event already exist?" -> suggestions + the consumable-here menu
// Read-only until clicked. Adoption copies IDENTITY only — never a probability:
// _propagateStrictestAcrossSharedEvents already makes the strictest instance win
// across every tree, so the conservative tree wins by construction.
function slRenderEventReuse() {
    const usageEl = document.getElementById('config-event-usage');
    const sugEl = document.getElementById('config-event-suggest');
    if (!usageEl || !sugEl) return;
    const node = (typeof selectedNodeData !== 'undefined') ? selectedNodeData : null;
    const RU = window.SLEventReuse;
    if (!node || !RU || node.type === 'gate' || node.gateType === 'TRANSFER') {
        usageEl.innerHTML = ''; sugEl.innerHTML = ''; return;
    }
    let html = '';
    // Phase 66.19 — held at the strictest allocation across trees? Say so FIRST: it is
    // the reason this node's number does not match what this tree would apportion.
    try {
        const info = (typeof slSharedStrictestInfo === 'function') ? slSharedStrictestInfo(node) : null;
        if (info && info.held) {
            const h = info.held;
            html += '<div style="color:#b45309;"><b>&#9888; Held at the strictest allocation:</b> P=' +
                    esc(Number(h.prob).toExponential(3)) + ' (&asymp;' + esc(Number(h.rate).toExponential(2)) + '/FH)' +
                    ' &mdash; this tree would have apportioned ' + esc(Number(h.naturalProb).toExponential(3)) +
                    '. The stricter requirement comes from <b>' + esc(h.fromPageName) + '</b> (' + h.instances +
                    ' instances across the model). <span style="color:var(--color-text-tertiary);">One physical item carries one requirement; the released budget goes to this gate&rsquo;s other children.</span></div>';
        }
        if (info && info.conflict) {
            html += '<div style="color:#b45309;"><b>&#9888; Shared across trees with DIFFERENT exposure models</b> (' +
                    esc(info.conflict.modes.join(', ')) + ') &mdash; the budgets are not comparable, so no strictest requirement ' +
                    'has been applied. Reconcile the exposure model, or model these as separate events.</div>';
        }
    } catch (_) {}
    try {
        const u = RU.usage(node);
        if (u.elsewhere.length) {
            const links = u.elsewhere.map(function (e) {
                return '<a href="#" class="sl-ev-jump" data-page="' + esc(String(e.pageId)) + '" data-node="' + esc(String(e.nodeId)) +
                       '" style="color:var(--color-purple,#7247B1); text-decoration:underline;">' + esc(e.pageName) + '</a>';
            }).join(', ');
            html += '<div><b style="color:var(--color-purple,#7247B1);">&#8646; Also used in ' + u.elsewhere.length + ' other tree' +
                    (u.elsewhere.length === 1 ? '' : 's') + ':</b> ' + links +
                    ' <span style="color:var(--color-text-tertiary);">&mdash; one physical event; the strictest allocation across all of them wins</span></div>';
        }
        if (u.mirrors.length) {
            html += '<div style="color:var(--color-text-tertiary);">&#8596; mirrored in its verification twin (by design, not a common-mode finding)</div>';
        }
    } catch (_) {}
    usageEl.innerHTML = html;
    let sug = '';
    try {
        const myLid = (node.logicalId != null ? node.logicalId : node.id);
        const matches = RU.nameMatches(node.name || '', undefined, 4)
            .filter(function (m) { return String(m.lid) !== String(myLid); });
        if (matches.length) {
            sug += '<div style="color:#b45309;"><b>Already in the model:</b> ' + matches.map(function (m) {
                return '<a href="#" class="sl-ev-adopt" data-lid="' + esc(String(m.lid)) + '" data-name="' + esc(m.name) +
                       '" title="Reuse this as the same physical event" style="text-decoration:underline;">' + esc(m.name) +
                       ' <span style="opacity:.7;">(' + esc(m.pageName) + ')</span></a>';
            }).join(' &middot; ') + ' <span style="color:var(--color-text-tertiary);">&mdash; click to reuse as the same event</span></div>';
        }
        const cons = RU.consumableHere();
        if (cons.length) {
            sug += '<details style="margin-top:3px;"><summary style="cursor:pointer; color:var(--color-text-tertiary);">' +
                   'Consumable here &mdash; ' + cons.length + ' event' + (cons.length === 1 ? '' : 's') +
                   ' from this system and the systems that contribute to it</summary>' +
                   '<div style="max-height:150px; overflow:auto; margin-top:4px;">' +
                   cons.slice(0, 60).map(function (c) {
                       return '<div><a href="#" class="sl-ev-adopt" data-lid="' + esc(String(c.lid)) + '" data-name="' + esc(c.name) +
                              '" style="text-decoration:underline;">' + esc(c.name) + '</a> ' +
                              '<span style="color:var(--color-text-tertiary);">&middot; ' + esc(c.pageName) + ' &middot; ' + esc(c.reason) + '</span></div>';
                   }).join('') +
                   (cons.length > 60 ? '<div style="color:var(--color-text-tertiary);">&hellip;' + (cons.length - 60) + ' more</div>' : '') +
                   '</div></details>';
        }
    } catch (_) {}
    sugEl.innerHTML = sug;
    usageEl.querySelectorAll('.sl-ev-jump').forEach(function (a) {
        a.addEventListener('click', function (ev) {
            ev.preventDefault();
            const pid = a.getAttribute('data-page'), nid = a.getAttribute('data-node');
            try {
                if (typeof openFTAPageById === 'function') openFTAPageById(pid);
                setTimeout(function () {
                    try { if (typeof _slHighlightFtaNode === 'function') _slHighlightFtaNode(nid, '◀ SAME EVENT'); } catch (_) {}
                }, 320);
            } catch (_) {}
        });
    });
    sugEl.querySelectorAll('.sl-ev-adopt').forEach(function (a) {
        a.addEventListener('click', function (ev) {
            ev.preventDefault();
            const lidRaw = a.getAttribute('data-lid'), nm = a.getAttribute('data-name');
            const asNum = Number(lidRaw);
            const lid = (isFinite(asNum) && String(asNum) === lidRaw) ? asNum : lidRaw;
            if (!RU.adopt(selectedNodeData, lid, nm)) return;
            try { document.getElementById('config-name').value = selectedNodeData.name || ''; } catch (_) {}
            if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities();
            if (typeof updateD3 === 'function') updateD3();
            if (typeof showToast === 'function') showToast('Reused as the same physical event — the strictest allocation now applies to every instance.', 'info', 5200);
            slRenderEventReuse();
            try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        });
    });
}
try { window.slRenderEventReuse = slRenderEventReuse; } catch (_) {}

function syncFTAConfig() {
    ftaConfig.mode = document.getElementById('fta-calc-mode').value;
    // Phase 66.10 — switching a bottom-up tree into top-down used to leave every
    // node without a weight; the first config save then stamped 1% onto one child
    // and the allocator handed its sibling the rest. Seed equal shares up front.
    if (ftaConfig.mode === 'top-down' && typeof seedTopDownWeights === 'function'
        && typeof getActiveFTARoot === 'function') {
        try { seedTopDownWeights(getActiveFTARoot()); } catch (_) {}
    }
    // Phase 53.45 — remember the user's mode choice across reloads.
    try { localStorage.setItem(_UI_FTA_MODE_KEY, ftaConfig.mode); } catch(_) {}
    // Phase 53.46 — keep per-page mode in step with the toolbar.
    const _activePage = ftaPages.find(p => p.id === activeFTAPageId);
    if (_activePage) _activePage.mode = ftaConfig.mode;
    ftaConfig.apportion = document.getElementById('fta-apportion').value;
    // Phase 56.47 — persist apportion choice so it survives refresh.
    try { localStorage.setItem(_UI_FTA_APPORTION_KEY, ftaConfig.apportion); } catch(_) {}
    ftaConfig.linkedFhaId = document.getElementById('fta-fha-link').value;
    // Before reading the target-rate input, refresh it to the regulation-derived value
    // when a hazard is linked and the user hasn't toggled the override.
    refreshFTARequiredTarget();
    refreshFcLinkPanel();
    refreshTreeLevelDropdown();
    ftaConfig.targetP = parseFloat(document.getElementById('fta-target-p').value) || 0.00001;
    // Phase 56.47 — mirror the engineer's target into the active page so
    // standalone trees (no FHA link) remember their budget across page
    // switches and refreshes. Pages with FHA links derive their target from
    // the linked FHA's severity, so we don't override the page field there.
    if (!ftaConfig.linkedFhaId) {
        const _activePageT = ftaPages.find(p => p.id === activeFTAPageId);
        if (_activePageT) _activePageT.targetP = ftaConfig.targetP;
    }

    // Phase 32a — exposure-source tracking.
    //   exposureSource = 'auto'   → pull exposureTime from the linked FHA's phase durations.
    //   exposureSource = 'manual' → read the toolbar's exposure-time input.
    const expInput = document.getElementById('fta-exposure-time');
    const expAuto  = document.getElementById('fta-exposure-auto');
    if (expAuto) ftaConfig.exposureSource = expAuto.checked ? 'auto' : 'manual';
    if (ftaConfig.exposureSource === 'auto' && ftaConfig.linkedFhaId) {
        const wrote = syncFTAExposureFromFHA();
        if (wrote && expInput) expInput.value = ftaConfig.exposureTime;
    } else if (expInput) {
        const v = parseFloat(expInput.value);
        if (!isNaN(v) && v > 0) ftaConfig.exposureTime = v;
    }
    // Refresh derived top-allocator readout on the toolbar.
    refreshTopAllocatorReadout();

    updateFTAConfigUI();
    calculateAllProbabilities();
    updateD3();
    // Phase 56.47 — autosave UI-driven config changes (apportion mode, exposure
    // source, linked FHA, target P, etc.) so they survive refresh.
    try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch(_) {}
}

// Render the derived top-allocator readout — operational rate during exposure, top P at end
// of exposure, plus a small "from FHA" badge when normalization is active.
function refreshTopAllocatorReadout() {
    const host = document.getElementById('fta-top-alloc-readout');
    if (!host) return;
    const mode = (ftaConfig.mode || '').toLowerCase();
    // Hide entirely in bottom-up — the allocator isn't running there.
    if (mode !== 'top-down') { host.style.display = 'none'; return; }
    const tc = _computeTopAllocatorContext();
    host.style.display = 'block';
    const fmt = (x) => (x == null || isNaN(x)) ? '—' : (x.toExponential ? x.toExponential(2) : x);
    // Mission-duration source comes from the context — keeps the display in step with the math.
    const sourceLabels = {
        'project-defined':       'project mission',
        'sum-of-flight-phases':  'sum of flight phases',
        'no-mission-defined':    'no mission defined'
    };
    const missionSourceLabel = sourceLabels[tc.missionSource] || '';
    const phaseChip = tc.hasFhaNormalization
        ? `<span class="exposure-badge" style="background: rgba(10,132,255,0.16); color: #6D7CF0;" title="Exposure pulled from FHA phases: ${esc((tc.matchedPhases || []).join(', '))}">FHA-normalized · r = ${(tc.phaseRatio * 100).toFixed(2)}%</span>`
        : `<span class="exposure-badge" style="background: var(--color-surface-2); color: var(--color-text-tertiary);">no phase restriction (r = 100%)</span>`;
    // Multi-line block so each quantity sits on its own row — easier to read at a glance.
    host.innerHTML =
        `<div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 11px; margin-bottom: 6px;">` +
            `<span style="text-transform: uppercase; letter-spacing: 0.07em; font-weight: 600; color: var(--color-text-tertiary);">Top-down allocation basis</span>` +
            phaseChip +
        `</div>` +
        `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px 16px; font-family: var(--font-mono); font-size: 12px;">` +
            `<div title="Regulatory headline target — averaged per flight hour per AC 25.1309-1B / AMC 25.1309 / AC 23.1309-1E."><span class="u-muted">Headline λ_top</span><br><strong>${fmt(tc.headlineRate)}</strong> /FH</div>` +
            `<div title="Sum of the FHA's exposed phase durations."><span class="u-muted">t_exposure</span><br><strong>${tc.exposureTime.toFixed(4)}</strong> hr</div>` +
            `<div title="Mission duration used as the normalization denominator. Source: ${esc(missionSourceLabel || 'n/a')}"><span class="u-muted">t_mission</span><br><strong>${tc.totalMissionHours.toFixed(2)}</strong> hr ${tc.hasFhaNormalization ? `<span style="color: var(--color-text-tertiary); font-weight: 400;">(${esc(missionSourceLabel)})</span>` : ''}</div>` +
            (tc.hasFhaNormalization
                ? `<div title="Operational rate during exposure = headline × (t_mission / t_exposure) = headline / r. This is the binding rate the BE leaves must satisfy."><span class="u-muted">Operational λ_op</span><br><strong style="color: var(--color-accent);">${fmt(tc.operationalRate)}</strong> /hr during exposure</div>`
                : `<div><span class="u-muted">Operational λ_op</span><br>= headline (no restriction)</div>`
            ) +
            `<div title="The probability the allocator distributes through the gate structure: λ_op × t_exposure = λ_top × t_mission."><span class="u-muted">P at t_exposure</span><br><strong>${fmt(tc.topProbAtExposure)}</strong></div>` +
        `</div>`;
}

// ---------- FTA Tree-Level dropdown (Phase 11.1) ----------
// Each ftaPage carries an explicit `treeLevel` of 'aircraft' | 'system' | 'standalone'.
// Drives DALgebra FDAL/IDAL assignment, AutoReq scoping rules, and a sidebar badge.
// Default 'standalone' for legacy pages and new trees.

// TREE_LEVEL_LABELS — extracted to ui_constants.js (Phase 76; byte-identical, loaded BEFORE this file).
// TREE_LEVEL_COLORS — extracted to ui_constants.js (Phase 76; byte-identical, loaded BEFORE this file).

function refreshTreeLevelDropdown() {
    const sel = document.getElementById('fta-tree-level');
    if (!sel) return;
    const page = ftaPages.find(p => p.id === activeFTAPageId);
    if (!page) return;
    // Backfill default for legacy pages
    if (!page.treeLevel) page.treeLevel = 'standalone';
    sel.value = page.treeLevel;
    refreshSystemPickerRow();
}

function onFtaTreeLevelChange() {
    const sel = document.getElementById('fta-tree-level');
    if (!sel) return;
    const page = ftaPages.find(p => p.id === activeFTAPageId);
    if (!page) return;
    page.treeLevel = sel.value;
    // Clear systemId when leaving system level
    if (page.treeLevel !== 'system') page.systemId = '';
    _syncMirrorOwnershipFromSource(page);   // Phase 57 — keep the mirror's ownership in step
    refreshSystemPickerRow();
    renderFTASidebar();
    if (typeof showToast === 'function') {
        showToast('Tree level set to ' + TREE_LEVEL_LABELS[page.treeLevel] + '.', 'info', 2000);
    }
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
}

// Phase 53.27 + 53.28 — single source of truth for which toolbar cells show.
//   • Link-to-Hazard cell: hides in system tree-level (wizard owns the link).
//   • Apportionment + Target Rate cells: hide unless top-down mode is selected — they're
//     meaningless when the tree evaluates bottom-up.
// Grid column count is derived from the visible-cell count so the layout stays balanced.
function _refreshFtaToolbarLayout() {
    const page = ftaPages.find(p => p.id === activeFTAPageId);
    const inSystem = !!(page && page.treeLevel === 'system');
    const modeEl   = document.getElementById('fta-calc-mode');
    const isTopDown = !!(modeEl && modeEl.value === 'top-down');

    const apportionCell = document.getElementById('fta-apportion-cell');
    const targetCell    = document.getElementById('fta-target-cell');
    const fhaLinkCell   = document.getElementById('fta-fha-link-cell');
    const grid          = document.getElementById('fta-toolbar-grid');

    if (apportionCell) apportionCell.style.display = isTopDown ? 'flex' : 'none';
    if (targetCell)    targetCell.style.display    = isTopDown ? 'flex' : 'none';
    if (fhaLinkCell)   fhaLinkCell.style.display   = inSystem  ? 'none' : 'flex';

    // Recompute grid columns from the visible-cell count (Tree Level + Calc Mode always show).
    const visible = 2 + (isTopDown ? 2 : 0) + (inSystem ? 0 : 1);
    if (grid) grid.style.gridTemplateColumns = Array(visible).fill('1fr').join(' ');
}

// Populate + show/hide the owning-system picker based on the active page's treeLevel.
function refreshSystemPickerRow() {
    const row = document.getElementById('fta-system-picker-row');
    const sel = document.getElementById('fta-owning-system');
    const info = document.getElementById('fta-system-picker-info');
    if (!row || !sel) return;
    const page = ftaPages.find(p => p.id === activeFTAPageId);
    _refreshFtaToolbarLayout();
    if (!page) { row.style.display = 'none'; return; }
    if (page.treeLevel !== 'system') { row.style.display = 'none'; _hideSysWizard(); return; }
    row.style.display = 'block';
    // Populate dropdown from systemsData
    const opts = ['<option value="">-- Select a system folder --</option>'];
    (systemsData || []).forEach(s => {
        opts.push('<option value="' + esc(s.id) + '">' + esc(s.name || ('System ' + s.id)) + '</option>');
    });
    sel.innerHTML = opts.join('');
    sel.value = page.systemId || '';
    // Show metrics for the picked system, if any.
    if (info) {
        if (!page.systemId) {
            info.innerHTML = '<span style="color: var(--color-text-tertiary); font-family: var(--font-system); font-style: italic;">' + ((systemsData || []).length ? 'Pick a system folder to associate this fault tree with — its functions, FHAs, and reqs will be cross-referenced.' : 'No system folders exist yet — create one in Systems Safety first.') + '</span>';
        } else {
            const sys = (systemsData || []).find(s => s.id === page.systemId);
            if (!sys) { info.innerHTML = '<span style="color: var(--color-warning);">Referenced system folder no longer exists.</span>'; return; }
            const fnCount = (sys.functions || []).length;
            const fhaCount = (sys.fha || []).length;
            const reqCount = (sys.req || []).length;
            info.innerHTML = '<strong>' + esc(sys.name || sys.id) + '</strong> &nbsp;·&nbsp; ' + fnCount + ' function' + (fnCount === 1 ? '' : 's') + ' &nbsp;·&nbsp; ' + fhaCount + ' FHA hazard' + (fhaCount === 1 ? '' : 's') + ' &nbsp;·&nbsp; ' + reqCount + ' requirement' + (reqCount === 1 ? '' : 's');
        }
    }
    // Show / populate the guided sub-function picker once a system is chosen.
    _refreshSysWizard(page);
}

function onFtaOwningSystemChange() {
    const sel = document.getElementById('fta-owning-system');
    if (!sel) return;
    const page = ftaPages.find(p => p.id === activeFTAPageId);
    if (!page) return;
    page.systemId = sel.value;
    // Clear wizard selections when system changes — the dropdowns below are dependent.
    delete page._wizardSubId;
    _syncMirrorOwnershipFromSource(page);   // Phase 57 — propagate the new owning system to the mirror
    refreshSystemPickerRow();
    renderFTASidebar();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
}

// ---- Phase 22 — Guided sys-level FTA wizard (System → Function → FC → top gate) ----
function _hideSysWizard() {
    const fr = document.getElementById('fta-sys-func-row');
    const cr = document.getElementById('fta-sys-fc-row');
    if (fr) fr.style.display = 'none';
    if (cr) cr.style.display = 'none';
}
function _refreshSysWizard(page) {
    const fr = document.getElementById('fta-sys-func-row');
    const cr = document.getElementById('fta-sys-fc-row');
    const funcSel = document.getElementById('fta-sys-func');
    const fcSel = document.getElementById('fta-sys-fc');
    const fcHint = document.getElementById('fta-sys-fc-empty-hint');
    if (!fr || !cr || !funcSel || !fcSel) return;
    if (!page || page.treeLevel !== 'system' || !page.systemId) {
        _hideSysWizard();
        return;
    }
    const sys = (systemsData || []).find(s => s.id === page.systemId);
    if (!sys) { _hideSysWizard(); return; }

    fr.style.display = 'flex';
    // Populate function dropdown from the picked system's functions.
    // No auto-selection — the user must explicitly pick each step.
    const fnOpts = ['<option value="">-- Select a function --</option>'];
    (sys.functions || []).forEach(f => {
        const label = (f.funcId || '') + (f.funcName ? '  ·  ' + f.funcName : '');
        fnOpts.push('<option value="' + esc(f.funcId || '') + '">' + esc(label) + '</option>');
    });
    funcSel.innerHTML = fnOpts.join('');
    funcSel.value = page._wizardSubId || '';

    // Reveal / hide FC dropdown based on sub-function selection.
    if (!page._wizardSubId) {
        cr.style.display = 'none';
        return;
    }
    cr.style.display = 'flex';
    // Failure-condition dropdown: filter to FHAs for the chosen sub-function, then deduplicate
    // by fcId, keeping the most conservative severity in each group. Severities may vary across
    // phases of flight on records that share an FC ID — the conservative pick drives the tree's
    // top-event target.
    const matching = (sys.fha || []).filter(f => f.subId === page._wizardSubId);
    if (!matching.length) {
        fcSel.innerHTML = '<option value="">-- No FHA hazards for this sub-function --</option>';
        if (fcHint) {
            fcHint.style.display = 'block';
            fcHint.textContent = 'No FHA hazards exist for this sub-function yet. Add one in Systems Safety → ' + (sys.name || sys.id) + ' → FHA, then return here.';
        }
        return;
    }
    if (fcHint) fcHint.style.display = 'none';
    const SEV_RANK_LOCAL = SEVERITY_RANK;   // Phase 27 refactor B5 — alias to module-scope constant.
    const groups = new Map();
    matching.forEach(f => {
        const key = (f.fcId || '#' + f.internalId);
        const prev = groups.get(key);
        const rank = SEV_RANK_LOCAL[f.severity] || 0;
        if (!prev || rank > (SEV_RANK_LOCAL[prev.severity] || 0)) {
            groups.set(key, f);
        }
    });
    const fcOpts = ['<option value="">-- Select a failure condition --</option>'];
    Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([fcKey, f]) => {
        // Tag entries where multiple severities exist for the same FC ID to make the
        // "most conservative wins" choice transparent.
        const variants = matching.filter(x => (x.fcId || '#' + x.internalId) === fcKey);
        const sev = f.severity ? ' [' + f.severity + ']' : '';
        const variantTag = variants.length > 1 ? '  (most conservative of ' + variants.length + ' variants)' : '';
        const label = fcKey + ': ' + (f.fcDesc || 'failure condition') + sev + variantTag;
        fcOpts.push('<option value="' + esc(f.internalId) + '">' + esc(label) + '</option>');
    });
    fcSel.innerHTML = fcOpts.join('');
    // No pre-selection — the user picks the FC to develop the tree for.
    fcSel.value = '';
}

function refreshFcLinkPanel() {
    const panel = document.getElementById('fta-fc-link-panel');
    const sel   = document.getElementById('fta-ac-fc-link');
    const eff   = document.getElementById('fta-fc-link-effective');
    if (!panel || !sel) return;
    const linked = (document.getElementById('fta-fha-link') || {}).value || '';
    if (!linked.startsWith('SYS_')) { panel.style.display = 'none'; return; }
    const sysFhaId = linked.replace('SYS_', '');
    let sysFha = null;
    systemsData.forEach(sys => { (sys.fha || []).forEach(f => { if (String(f.internalId) === String(sysFhaId)) sysFha = f; }); });
    if (!sysFha) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    // Populate the dropdown from AC FHAs (by fcId, matching sysFha.acTrace's semantics).
    const curr = sysFha.acTrace || '';
    let html = '<option value="">-- Not linked --</option>';
    acFhaData.forEach(ac => {
        const sel = (ac.fcId === curr) ? ' selected' : '';
        html += `<option value="${esc(ac.fcId)}"${sel}>${esc(ac.fcId)}: ${esc((ac.fcDesc || '').slice(0, 40))}</option>`;
    });
    sel.innerHTML = html;
    // Show the effective combined target.
    if (curr) {
        const ac = acFhaData.find(a => a.fcId === curr);
        if (ac) {
            const sevOrder = SEVERITY_RANK;   // Phase 27 refactor B5 — alias to module-scope constant.
            const winner = (sevOrder[ac.severity] || 0) >= (sevOrder[sysFha.severity] || 0) ? ac.severity : sysFha.severity;
            const t = getSafetyTarget(winner);
            eff.textContent = `Effective severity: ${winner}  |  Target: ${t.prob ? '≤ ' + t.prob.toExponential(0) + '/FH' : 'n/a'}  |  DAL: ${t.dal || '—'}  |  AC: ${ac.severity}, Sys: ${sysFha.severity}`;
        } else {
            eff.textContent = '';
        }
    } else {
        eff.textContent = '';
    }
}

function onAcFcLinkChange() {
    const linked = (document.getElementById('fta-fha-link') || {}).value || '';
    if (!linked.startsWith('SYS_')) return;
    const sysFhaId = linked.replace('SYS_', '');
    let sysFha = null;
    systemsData.forEach(sys => { (sys.fha || []).forEach(f => { if (String(f.internalId) === String(sysFhaId)) sysFha = f; }); });
    if (!sysFha) return;
    sysFha.acTrace = document.getElementById('fta-ac-fc-link').value || '';
    refreshFcLinkPanel();
    // Recompute auto-req flags so any linked-pair reqs get re-evaluated downstream.
    try { AutoReq.recomputeFlags('ac'); systemsData.forEach(s => AutoReq.recomputeFlags('sys-' + s.id)); } catch(e){}
}

// Look up the linked hazard's severity, compute the regulation-derived top-event target,
// update the auto-target panel, and (unless override is on) auto-fill the Target Rate.
function refreshFTARequiredTarget() {
    const panel = document.getElementById('fta-required-target-panel');
    const detail = document.getElementById('fta-required-target-detail');
    const targetInput = document.getElementById('fta-target-p');
    const overrideChk = document.getElementById('fta-target-override');
    if (!panel || !detail || !targetInput) return;

    const linkedFhaId = document.getElementById('fta-fha-link').value;
    const mode = document.getElementById('fta-calc-mode').value;

    const _hideEventAllocPanel = () => {
        const eap = document.getElementById('fta-event-alloc-panel');
        if (eap) eap.style.display = 'none';
    };

    if (!linkedFhaId) {
        panel.style.display = 'none';
        _hideEventAllocPanel();
        if (overrideChk) overrideChk.checked = false;
        projectConfig.override = false;
        return;
    }

    // Resolve the FHA row (AC or Sys) by the prefixed internalId stored in the dropdown value.
    const isAC = linkedFhaId.startsWith('AC_');
    const realId = linkedFhaId.replace('AC_', '').replace('SYS_', '');
    // #51 — string-coerced compare (FHA internalId is numeric in many projects/demos; realId is a
    // string). Without this the lookup fails and the Target Rate never auto-fills from the cert basis.
    const fha = isAC
        ? acFhaData.find(x => String(x.internalId) === String(realId))
        : getAllSysFha().find(x => String(x.internalId) === String(realId));

    if (!fha) {
        panel.style.display = 'none';
        _hideEventAllocPanel();
        return;
    }
    // Top-event target panel shows ONLY the unnormalized headline — severity → /FH averaged + DAL.
    // No exposure context here; phase-exposure interpretation belongs to the basic-event
    // allocations (see the generated FTA event requirements + the separate panel below).
    const target = getSafetyTarget(fha.severity);
    const probTxt = target.prob === null
        ? '<span class="u-muted">No quantitative requirement (severity = ' + esc(fha.severity || 'unknown') + ')</span>'
        : `Severity: <strong>${esc(fha.severity)}</strong> &middot; Top-event target: <strong>&lt; ${target.prob.toExponential(0)} /FH</strong> &middot; Required <strong>DAL ${target.dal}</strong>`;

    detail.innerHTML = `${probTxt}<br><span class="u-muted">Basis: ${esc(target.scope)} &middot; Hazard: ${esc(fha.fcId || '(no FC ID)')}</span>`;
    panel.style.display = 'block';

    // Render a separate event-allocation-basis panel (visually distinct from the top-target
    // section). The top target is severity-driven only; the event-alloc panel describes how
    // basic-event λ allocations should be interpreted under this tree's exposure window.
    _renderEventAllocBasisPanel(fha);

    // Auto-fill the Target Rate input when override is off. Target is the unnormalized headline.
    const overrideOn = !!(overrideChk && overrideChk.checked);
    projectConfig.override = overrideOn;
    if (!overrideOn && target.prob !== null) {
        targetInput.value = target.prob;
        // Keep the LIVE allocation target in sync with the cert-basis + severity-derived value
        // (dynamic with the chosen certification basis), not the stale manual default. Without this
        // the top-down allocation would apportion against ftaConfig.targetP, which lags the input.
        if (typeof ftaConfig !== 'undefined') ftaConfig.targetP = target.prob;
        try {
            const _ap = (ftaPages || []).find(p => p.id === activeFTAPageId);
            if (_ap) _ap.targetP = target.prob;
        } catch (_) {}
    }
}

// Event-allocation basis panel — separate from the top-event-target section so that the
// top target visible at the top is always read as severity-driven and unrescaled.
function _renderEventAllocBasisPanel(fha) {
    if (!fha) return;
    const parent = document.getElementById('fta-required-target-panel');
    if (!parent) return;
    let host = document.getElementById('fta-event-alloc-panel');
    if (!host) {
        host = document.createElement('div');
        host.id = 'fta-event-alloc-panel';
        host.style.cssText = 'margin-top: var(--s-3); padding: 10px 12px; border-radius: var(--r-md); background: var(--color-surface-2); border: 1px solid var(--color-border-hair);';
        parent.parentNode.insertBefore(host, parent.nextSibling);
    }
    const exp = getPhaseExposureRatio(fha.phases);
    // A contingency phase holds r at 1 deliberately (support_modules.js). Falling
    // through to the r >= 0.999 hide would leave the engineer looking at a hazard
    // scoped to a go-around with no exposure panel at all, and no way to tell
    // "held at 1 on purpose" from "the phase matched nothing".
    if (fha.phases && (exp.specialPhases || []).length) {
        host.style.display = 'block';
        host.innerHTML =
            `<div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--color-text-tertiary); font-weight: 600; margin-bottom: 4px;">Exposure Window &mdash; contingency phase</div>` +
            `<div style="font-size: 13px; color: var(--color-text-primary);">` +
                `This hazard is scoped to <em>${esc((exp.specialPhases || []).join(', '))}</em>, which is outside the nominal mission. ` +
                `The exposure window is held at the <strong>full ${exp.totalHours.toFixed(2)} h flight</strong> (r = 100%), not the manoeuvre's own duration.` +
            `</div>` +
            `<div style="font-size: 12px; color: var(--color-text-secondary); margin-top: 4px;">` +
                `The function had to survive the whole flight to be available when the contingency was flown, so the failure accrues across the flight and is revealed at the demand. ` +
                `Scaling t down to the manoeuvre would understate the probability by roughly two orders of magnitude. ` +
                `A tighter figure needs P(demand) × duration; there is no occurrence-frequency field yet, so the conservative bound is held rather than a frequency assumed.` +
            `</div>` +
            (exp.unmatchedPhases.length
                ? `<div style="margin-top: 6px; font-size: 11px; color: var(--sev-haz-fg);">⚠ Unmatched phases: ${esc(exp.unmatchedPhases.join(', '))} — add them to the Flight Phases tab to include in the exposure window.</div>`
                : '');
        return;
    }
    if (!fha.phases || !exp.matchedPhases.length || exp.ratio >= 0.999) {
        host.style.display = 'none';
        return;
    }
    const rPct = exp.ratio * 100;
    const rPctStr = rPct < 1 ? rPct.toFixed(2) : rPct.toFixed(1);
    host.style.display = 'block';
    host.innerHTML =
        `<div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--color-text-tertiary); font-weight: 600; margin-bottom: 4px;">Event-Allocation Basis &mdash; informational, does not modify the top-event target</div>` +
        `<div style="font-size: 13px; color: var(--color-text-primary);">` +
            `Exposure window: <strong>${exp.exposedHours.toFixed(2)} h</strong> of ${exp.totalHours.toFixed(2)} h flight ` +
            `(r = ${rPctStr}%; phases: <em>${esc(exp.matchedPhases.join(', '))}</em>).` +
        `</div>` +
        `<div style="font-size: 12px; color: var(--color-text-secondary); margin-top: 4px;">` +
            `Basic-event λ allocations under this tree are interpreted as <strong>operational rates</strong> (failures per hour while exposed). ` +
            `The cutset rolls them up to an averaged contribution of λ × r per flight hour, which aggregates against the headline target shown above. ` +
            `The top-event target itself is unchanged.` +
        `</div>` +
        (exp.unmatchedPhases.length
            ? `<div style="margin-top: 6px; font-size: 11px; color: var(--sev-haz-fg);">⚠ Unmatched phases: ${esc(exp.unmatchedPhases.join(', '))} — add them to the Flight Phases tab to include in the exposure window.</div>`
            : '');
}

// Phase 53.43 — transfer-chain helpers. Every transferred-in page knows its parent via
// `transferInFrom.sourcePageId`; chasing that chain back gives us the "true root" page whose
// top event is the source of all top-down apportionment.
function getRootAncestorPage(page) {
    const seen = new Set();
    while (page && page.transferInFrom && page.transferInFrom.sourcePageId && !seen.has(page.id)) {
        seen.add(page.id);
        const parent = ftaPages.find(p => p.id === page.transferInFrom.sourcePageId);
        if (!parent) break;
        page = parent;
    }
    return page;
}
function getRootAncestorPageOfActive() {
    const active = ftaPages.find(p => p.id === activeFTAPageId);
    return active ? getRootAncestorPage(active) : null;
}

function _quantCacheEnabled() { try { if (/[?&]quantcache=1/.test(location.search)) return true; return localStorage.getItem('SLA_QUANTCACHE') === '1'; } catch (_) { return false; } }
function _quantClearCache() { try { _quantCache.clear(); } catch (_) {} }
function _quantCanon(root) {
    try {
        var flat = (typeof SLFTAEngine !== 'undefined' && SLFTAEngine.flattenTransfers) ? SLFTAEngine.flattenTransfers(root, (typeof ftaPages !== 'undefined' ? ftaPages : [])).root : root;
        return (typeof _stableStringify === 'function') ? _stableStringify(flat) : JSON.stringify(flat);
    } catch (_) { return null; }
}
function _quantCacheGet(canon, field) {
    if (canon == null) return undefined;
    var e = _quantCache.get(_cyrb53(canon));
    return (e && e.canon === canon) ? e[field] : undefined;   // collision-verified
}
function _quantCacheStore(canon, field, val) {
    if (canon == null) return;
    var key = _cyrb53(canon), e = _quantCache.get(key);
    if (!e || e.canon !== canon) e = { canon: canon };
    e[field] = val;
    _quantCache.delete(key); _quantCache.set(key, e);   // move-to-end (LRU)
    while (_quantCache.size > _QUANT_CACHE_CAP) _quantCache.delete(_quantCache.keys().next().value);
}
// #7b — one-shot prefetch handoff from the worker path. The async orchestrator
// computes cut sets + importance OFF-THREAD, parks them here, then calls the
// unchanged synchronous renderer — which consumes the prefetch instead of
// recomputing. Works whether or not the LRU quant cache is enabled. Consumed
// (cleared) on first read so a stale prefetch can never serve a mutated tree —
// the canon check makes even that impossible, belt and braces.
var _ftaPrefetch = { canon: null, cutsets: undefined, bdd: undefined };
var _ftaComputeSeq = 0;
function _quantCachedCutsets(root) {
    try {
        if (_ftaPrefetch.cutsets !== undefined && _ftaPrefetch.canon === _quantCanon(root)) {
            var pv = _ftaPrefetch.cutsets; _ftaPrefetch.cutsets = undefined; return pv;
        }
    } catch (_) {}
    if (!_quantCacheEnabled()) return getCutsets(root);
    var canon = _quantCanon(root), hit = _quantCacheGet(canon, 'cutsets');
    if (hit !== undefined) return hit;
    var v = getCutsets(root);   // may throw CutsetExplosionError → propagate, never cache a throw
    _quantCacheStore(canon, 'cutsets', v);
    return v;
}
function _quantCachedImportance(root) {
    try {
        if (_ftaPrefetch.bdd !== undefined && _ftaPrefetch.canon === _quantCanon(root)) {
            var pb = _ftaPrefetch.bdd; _ftaPrefetch.bdd = undefined; return pb;
        }
    } catch (_) {}
    if (!_quantCacheEnabled()) return computeImportanceMeasures(root);
    var canon = _quantCanon(root), hit = _quantCacheGet(canon, 'bdd');
    if (hit !== undefined) return hit;
    var v = computeImportanceMeasures(root);
    _quantCacheStore(canon, 'bdd', v);
    return v;
}

// #7b — dispatcher. Small trees (or a warm cache/prefetch) take the synchronous
// path exactly as before — zero behavior change, zero added latency. Big trees
// route through the Web Worker with a progress line + working Cancel, so the
// page never freezes while the engine grinds. The worker runs the SAME
// fta_engine.js (single source), so results are identical by construction; on
// any worker failure the async wrappers fall back to the synchronous engine —
// to correctness, never to approximation.
function generateCutsetReport() {
    const rootNode = getActiveFTARoot(); if (!rootNode) return alert("Tree is empty.");
    try {
        const big = (typeof _countTreeNodes === 'function') && (typeof _CUTSET_WORKER_MIN_NODES !== 'undefined') && _countTreeNodes(rootNode) >= _CUTSET_WORKER_MIN_NODES;
        const workerOk = (typeof enumerateCutsetsAsync === 'function') && (typeof _cutsetWorkerEnabled === 'function') && _cutsetWorkerEnabled() && (typeof Worker !== 'undefined');
        const warm = (_ftaPrefetch.cutsets !== undefined && _ftaPrefetch.canon === _quantCanon(rootNode)) || _quantCacheGet(_quantCanon(rootNode), 'cutsets') !== undefined;
        if (big && workerOk && !warm) return _generateCutsetReportAsync(rootNode);
    } catch (_) { /* the dispatcher must never block the sync path */ }
    return _generateCutsetReportSync(rootNode);
}
function _ftaComputeStale(token) { return token !== _ftaComputeSeq; }
function _ftaComputeProgress(msg, showCancel) {
    const summary = document.getElementById('cutset-summary');
    if (summary) summary.innerHTML = '<div style="padding:12px 14px; background:var(--bg-control); border:1px solid var(--border-primary); border-radius:4px; display:flex; align-items:center; gap:12px;">' +
        '<span class="u-mono" style="font-size:12px;">⏳ ' + esc(msg) + '</span>' +
        '<span style="font-size:11px; color:var(--text-secondary);">computing off-thread — the page stays responsive</span>' +
        (showCancel !== false ? '<button class="action-btn btn-red" style="margin-left:auto;" onclick="ftaCancelCompute()">Cancel</button>' : '') + '</div>';
    const tbody = document.getElementById('cutset-body');
    if (tbody) tbody.innerHTML = '';
    const tbl = document.getElementById('cutset-table'); if (tbl) tbl.style.display = 'none';
}
window.ftaCancelCompute = function () {
    _ftaComputeSeq++;   // orphan any in-flight run
    // Terminate the worker so the computation actually stops (not just the UI);
    // the next request spawns a fresh one.
    try { if (typeof _cutsetWorker !== 'undefined' && _cutsetWorker) { _cutsetWorker.terminate(); _cutsetWorker = null; } } catch (_) {}
    const summary = document.getElementById('cutset-summary');
    if (summary) summary.innerHTML = '<div style="padding:10px 14px; background:var(--bg-control); border:1px solid var(--border-primary); border-radius:4px; font-size:12px; color:var(--text-secondary);">Computation cancelled. Nothing was rendered — run Calculate Minimal Cutsets again when ready.</div>';
};
function _generateCutsetReportAsync(rootNode) {
    const token = ++_ftaComputeSeq;
    _ftaComputeProgress('Enumerating minimal cut sets…');
    enumerateCutsetsAsync(rootNode).then(function (raw) {
        if (_ftaComputeStale(token)) return;
        _ftaComputeProgress('Cut sets done (' + raw.length.toLocaleString() + '). Computing BDD-exact P(top) + importance…');
        return computeImportanceAsync(rootNode).then(function (bdd) {
            if (_ftaComputeStale(token)) return;
            _ftaPrefetch.canon = _quantCanon(rootNode);
            _ftaPrefetch.cutsets = raw;
            _ftaPrefetch.bdd = bdd || undefined;
            _generateCutsetReportSync(rootNode);
        }, function () {
            // Importance failed off-thread — render with cut sets prefetched;
            // the sync path recomputes importance (or reports its absence).
            if (_ftaComputeStale(token)) return;
            _ftaPrefetch.canon = _quantCanon(rootNode);
            _ftaPrefetch.cutsets = raw;
            _ftaPrefetch.bdd = undefined;
            _generateCutsetReportSync(rootNode);
        });
    }, function (err) {
        if (_ftaComputeStale(token)) return;
        if (err && err.name === 'CutsetExplosionError') return _renderCutsetTooComplex(rootNode, err);
        const summary = document.getElementById('cutset-summary');
        if (summary) summary.innerHTML = '<div style="padding:10px 14px; background:var(--bg-control); border:1px solid var(--border-primary); border-radius:4px; font-size:12px; color:#b91c1c;">Cut-set computation failed: ' + esc((err && err.message) || String(err)) + '</div>';
    });
}

function _generateCutsetReportSync(rootNode) {
    let raw;
    try { raw = _perfTime('fta.cutsets', function () { return _quantCachedCutsets(rootNode); }); }
    catch (err) { if (err && err.name === 'CutsetExplosionError') return _renderCutsetTooComplex(rootNode, err); throw err; }
    const valid = raw.filter(c => c.length > 0).sort((a, b) => a.length - b.length);
    // Minimal-cutset reduction keyed on logicalId so repeated events collapse.
    const min = [];
    for (let curr of valid) {
        const keys = curr.map(_eventKey);
        let sup = false;
        for (let m of min) {
            if (m.map(_eventKey).every(k => keys.includes(k))) { sup = true; break; }
        }
        if (!sup) min.push(curr);
    }
    const finalCutsets = expandCCFCutsets(min);
    const tbody = document.getElementById('cutset-body'); tbody.innerHTML = '';

    // Backlog #4 — qualitative development errors (ARP 4761A 4.1.1.1). A cut set
    // containing a dev-error member is a qualitative Functional Failure Scenario:
    // it is ALWAYS displayed (never truncated), never carries a number, and the
    // quantified P(top) becomes explicitly P(top | no development error).
    const _csEvP = e => (e && e.eventClass === 'dev-error') ? 0 : ((e && e.probability) || 0);
    const _csIsQual = cs => cs.some(e => e && e.eventClass === 'dev-error');
    const qualCount = finalCutsets.reduce((n, cs) => n + (_csIsQual(cs) ? 1 : 0), 0);

    // MCS upper bound: Σ P(cutset_i) over ALL cut sets — the complete bound, unaffected by display.
    // Dev-error members enter at p = 0, so qualitative sets contribute nothing to the bound.
    let mcsSum = 0;
    finalCutsets.forEach(cs => { mcsSum += cs.reduce((acc, e) => acc * _csEvP(e), 1); });

    // Exact P(top) + importance via BDD (independent of cut-set enumeration). Computed once here so the
    // display cutoff + per-row contribution can use it; reused by the summary below.
    let bddResult = null;
    try { bddResult = _perfTime('fta.ptop', function () { return _quantCachedImportance(rootNode); }); }
    catch (err) { console.error('BDD computation failed:', err); }
    const pRef = (bddResult && bddResult.pTop > 0) ? bddResult.pTop : mcsSum;   // reference P(top) for cutoff + %

    // DISPLAY truncation — Isograph-style probability cutoff. Orders 1–3 are ALWAYS shown (single-point /
    // dual / triple failures are reviewed on structure, not magnitude); order ≥4 is shown only if it
    // contributes ≥ _CUTSET_CONTRIB_FLOOR of P(top). DISPLAY ONLY — mcsSum, P(top) and the CSV export
    // cover every cut set, so the assessed probability is unchanged. (The old 20k-row DOM backstop is
    // retired by ENG-2 pagination — at most one page of rows is mounted at a time.)
    const _CUTSET_CONTRIB_FLOOR = 1e-3;                        // 0.1% of P(top)
    const _CUTSET_SHOW_FLOOR = pRef * _CUTSET_CONTRIB_FLOOR;
    // ENG-2 phase 1 — PAGINATION. Pass 1 collects the MATERIAL rows (same
    // materiality rule as before — order ≤3 always, qualitative always,
    // order ≥4 only if it contributes ≥ the floor); pass 2 renders one page
    // (50/page default) through SLPaginate. Every Σ / P(top) / importance
    // figure below stays computed over ALL cut sets — the pager windows the
    // DISPLAY only, and its bar says so. The old 20k-row DOM backstop is
    // retired: every material row is now reachable via pages, with at most
    // one page of rows mounted at a time.
    let hiddenImmaterial = 0;
    const materialRows = [];
    finalCutsets.forEach(cutset => {
        const order = cutset.length;
        const isQual = _csIsQual(cutset);
        const rel = cutset.reduce((acc, event) => acc * _csEvP(event), 1);
        // Qualitative FFS sets are ALWAYS material — structure is the finding; magnitude is undefined.
        const material = isQual || (order <= 3) || (rel >= _CUTSET_SHOW_FLOOR);
        if (!material) { hiddenImmaterial++; return; }
        materialRows.push({ cutset, order, isQual, rel });
    });
    function _cutsetRowHtml(m, rowNo) {
        const { cutset, order, isQual, rel } = m;
        const contribPct = pRef > 0 ? (rel / pRef * 100) : 0;
        const contribCell = isQual ? '—' : ((contribPct >= 0.01) ? (contribPct.toFixed(2) + '%') : (contribPct > 0 ? contribPct.toExponential(1) + '%' : '—'));
        const eventIds = cutset.map(e => (e.eventClass === 'dev-error' ? '◇ ' : '') + e.displayId).join(', ');
        const desc = cutset.map(e => e.name).join(' AND ');
        const rawIds = cutset.map(e => { if (e.isCCF) return ""; return (e.displayId || '').replace(' (Ind)', ''); }).filter(id => id !== "").join(',');
        // v66.12 — CCF tint via class, not a hardcoded light lavender: #f3e8ff
        // under dark mode left near-white text on a light row (live finding).
        // .cutset-row-ccf carries a theme-aware background in safety_lab.css.
        const rowClass = cutset.some(e => e.isCCF) ? "cutset-row-ccf" : "";
        let rowStyle = "";
        if (isQual) rowStyle = "background-color: rgba(14,116,144,0.08); border-left: 3px solid #0E7490;";
        if (cutset.dynamicOrigin) rowStyle += " border-right: 3px solid #be185d;";
        const ccfSource = cutset.some(e => e.isCCF) ? cutset.find(e => e.isCCF).sourceGroup : '';
        const dynBadge = cutset.dynamicOrigin
            ? `<div style="font-size: 0.75em; color: #be185d; font-weight: bold; margin-top: 2px;">${esc(cutset.dynamicOrigin)}: ${esc(cutset.dynamicOrder || '')}</div>`
            : '';
        const qualBadge = isQual
            ? `<div style="font-size: 0.75em; color: #0E7490; font-weight: bold; margin-top: 2px;" title="ARP 4761A 4.1.1.1 — contains a qualitative development error; this scenario is never quantified.">◇ Qualitative FFS — development error</div>`
            : '';
        const probCell = isQual
            ? `<span style="color:#0E7490;font-weight:700;" title="Development errors are never given probabilities (ARP 4761A 4.1.1.1).">qualitative</span>`
            : `<strong>${rel.toExponential(4).toUpperCase()}</strong>`;
        return `<tr class="${rowClass}" style="${rowStyle}"><td><button class="action-btn btn-amber" onclick="highlightCutset('${esc(rawIds)}', '${esc(ccfSource)}')">Show</button></td><td>${rowNo}</td><td>${order}</td><td>${esc(eventIds)}${dynBadge}${qualBadge}</td><td>${esc(desc)}</td><td>${probCell}</td><td>${contribCell}</td></tr>`;
    }
    // Pager bar host — created once, sits directly above the table.
    let pagerHost = document.getElementById('cutset-pager');
    if (!pagerHost) {
        pagerHost = document.createElement('div');
        pagerHost.id = 'cutset-pager';
        const tbl = document.getElementById('cutset-table');
        if (tbl && tbl.parentNode) tbl.parentNode.insertBefore(pagerHost, tbl);
    }
    const _renderCutsetPage = (from, to) => {
        let html = '';
        for (let i = from; i < to; i++) html += _cutsetRowHtml(materialRows[i], i + 1);
        if (hiddenImmaterial > 0 && to >= materialRows.length) {
            html += `<tr><td colspan="7" style="padding:10px;color:var(--text-secondary);font-style:italic;">${hiddenImmaterial.toLocaleString()} higher-order cut set${hiddenImmaterial === 1 ? '' : 's'} (order ≥4 contributing <0.1% of ${_pTopLabelShort()}) hidden. The P(top) bound and importance measures are computed over all ${finalCutsets.length.toLocaleString()} cut sets; export for the full list.</td></tr>`;
        }
        tbody.innerHTML = html;
    };
    function _pTopLabelShort() { return qualCount > 0 ? 'P(top | no dev error)' : 'P(top)'; }
    if (typeof SLPaginate !== 'undefined' && pagerHost) {
        SLPaginate.reset('cutsets');   // new report run → back to page 1
        SLPaginate.attach({
            key: 'cutsets', host: pagerHost, total: materialRows.length,
            label: (f, t, n) => 'cut sets ' + f.toLocaleString() + '–' + t.toLocaleString() + ' of ' + n.toLocaleString() + ' material' + (hiddenImmaterial ? ' (+' + hiddenImmaterial.toLocaleString() + ' immaterial hidden)' : '') + ' — Σ, P(top) and importance computed over all ' + finalCutsets.length.toLocaleString(),
            renderPage: _renderCutsetPage,
        });
    } else {
        // Pager unavailable (module not loaded) — render everything, as before.
        _renderCutsetPage(0, materialRows.length);
    }
    document.getElementById('cutset-table').style.display = 'table';

    // Summary block: MCS upper bound + BDD-exact P(top) + repeated-event banner + importance table.
    const summary = document.getElementById('cutset-summary');
    if (summary) {
        const repeats = repeatedEventGroups();

        // Backlog #4 — with qualitative FFS sets present, every quantified figure
        // is explicitly conditional on no development error.
        const _pTopLabel = qualCount > 0 ? 'P(top | no development error)' : 'P(top)';
        let html = `<div style="font-size:0.9em;color:var(--text-secondary);margin-bottom:6px;">Minimal cut sets for top event: <strong>${esc(_cutsetScopeLabel())}</strong> <span style="opacity:.85;">— this fault tree only, not the whole project. Table shows order ≤3 plus any order ≥4 contributing ≥0.1% of ${esc(_pTopLabel)}; export for the full list.</span></div><div style="padding: 10px; background: var(--bg-control); border: 1px solid var(--border-primary); border-radius: 4px;">
            <div><strong>Minimum Cutset Upper Bound on ${esc(_pTopLabel)}:</strong>
                <span style="font-family: monospace; font-size: 1.1em; color: var(--header-color);">${mcsSum.toExponential(4).toUpperCase()}</span>
                <span style="color: var(--text-secondary); font-size: 0.85em;">(Σ over ${finalCutsets.length} minimal cutsets)</span>
            </div>`;
        if (bddResult) {
            const delta = bddResult.pTop > 0 ? Math.abs(mcsSum - bddResult.pTop) / bddResult.pTop : 0;
            const deltaTxt = delta > 0.01 ? ` (MCS bound is +${(delta * 100).toFixed(1)}% above exact)` : ' (matches MCS bound — no significant common-mode tightening)';
            html += `<div style="margin-top: 6px;"><strong>Exact ${esc(_pTopLabel)} via BDD:</strong>
                <span style="font-family: monospace; font-size: 1.1em; color: #059669;">${bddResult.pTop.toExponential(4).toUpperCase()}</span>
                <span style="color: var(--text-secondary); font-size: 0.85em;">${esc(deltaTxt)} · BDD size: ${bddResult.bddSize} nodes</span>
            </div>`;
        }
        if (qualCount > 0) {
            html += `<div style="margin-top: 6px; color: #0E7490; font-size: 0.9em;">
                <strong>◇ ${qualCount} qualitative Functional Failure Scenario${qualCount === 1 ? '' : 's'}</strong> — cut set${qualCount === 1 ? '' : 's'} containing a development error (ARP 4761A 4.1.1.1). Development errors are never given probabilities: these scenarios are excluded from every number above, which is therefore conditional on no development error. They are addressed by process assurance (DAL) and the derived requirements, not by the probability budget.
            </div>`;
        }
        // Failure frequency w_TE — unconditional (Vesely–Goldberg; ARP4761A App G Eq G32–34).
        // Additive readout; distinct from the unavailability P(top). Never breaks the panel.
        try {
            if (typeof SLFTAEngine !== 'undefined' && SLFTAEngine.computeFailureFrequency) {
                const _ff = SLFTAEngine.computeFailureFrequency(rootNode);
                if (_ff && typeof _ff.wTE === 'number' && isFinite(_ff.wTE)) {
                    html += `<div style="margin-top: 6px;"><strong>Failure frequency w<sub>TE</sub>:</strong>
                        <span style="font-family: monospace; font-size: 1.1em; color: var(--header-color);">${_ff.wTE.toExponential(4).toUpperCase()}</span>
                        <span style="color: var(--text-secondary); font-size: 0.85em;">/hr — unconditional occurrence rate (Vesely–Goldberg · ARP4761A App G)</span>
                    </div>`;
                }
            }
        } catch (e) { /* additive — never break the panel */ }
        html += '</div>';

        if (repeats.size > 0) {
            const sample = [...repeats.entries()].slice(0, 3).map(([, arr]) => `${esc(arr[0].displayId || '')} ×${arr.length}`).join(', ');
            html += `<div style="margin-top: 8px; padding: 10px; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 4px; color: #78350f; font-size: 0.85em;">
                <strong>Common-mode events detected:</strong> ${esc(sample)}${repeats.size > 3 ? `, +${repeats.size - 3} more` : ''}.
                Cutsets dedupe correctly; the MCS upper bound over-estimates against the BDD exact when repetition matters.
            </div>`;
        }

        // Importance Measures table — six BDD-exact measures with Wikipedia-standard formulas.
        if (bddResult && bddResult.measures.length > 0) {
            const sorted = [...bddResult.measures].sort((a, b) => b.fv - a.fv);
            html += `<div style="margin-top: 12px;">
                <h4 style="margin: 0 0 6px 0; color: var(--header-color);">Importance Measures (BDD-exact)</h4>
                <p style="font-size: 0.8em; color: var(--text-secondary); margin: 0 0 6px 0;">
                    <strong>Birnbaum</strong> = ∂P(top)/∂P(x); sensitivity of top event to this event.
                    <strong>Fussell-Vesely (FV)</strong> = fractional contribution of x to top event.
                    <strong>RAW</strong> = P(top|x=1)/P(top); risk multiplier if event were certain.
                    <strong>RRW</strong> = P(top)/P(top|x=0); risk reduction if event were impossible.
                    <strong>Critical</strong> = Birnbaum·P(x)/P(top); share of top failure due to x failing.
                    <strong>DIM</strong> = ∂lnP(top)/∂lnP(x); log-scale elasticity. Sorted by FV ↓.
                </p>
                <div style="max-height: 320px; overflow-y: auto; border: 1px solid var(--border-primary); border-radius: 4px;">
                <table style="width:100%; font-size: 0.82em;">
                    <thead style="position: sticky; top: 0; background: var(--bg-control);">
                        <tr><th class="u-text-left">Event ID</th><th class="u-text-left">Name</th><th>P(x)</th><th>Birnbaum</th><th>FV</th><th>RAW</th><th>RRW</th><th>Critical</th><th>DIM</th></tr>
                    </thead>
                    <tbody>`;
            const fmtRRW = v => Number.isFinite(v) ? v.toExponential(2) : '∞';
            sorted.forEach(m => {
                html += `<tr><td><code>${esc(m.node.displayId || '')}</code></td><td>${esc(m.node.name || '')}</td><td class="u-mono">${m.p.toExponential(2)}</td><td class="u-mono">${m.birnbaum.toExponential(2)}</td><td style="font-family: monospace; ${m.fv > 0.1 ? 'color:#dc2626; font-weight:bold;' : ''}">${(m.fv * 100).toFixed(2)}%</td><td class="u-mono">${m.raw.toExponential(2)}</td><td class="u-mono">${fmtRRW(m.rrw)}</td><td class="u-mono">${(m.critical * 100).toFixed(2)}%</td><td class="u-mono">${m.dim.toExponential(2)}</td></tr>`;
            });
            html += `</tbody></table></div></div>`;
        }
        summary.innerHTML = html;
    }
}

function highlightCutset(idsStr, ccfGroupName) {
    try {
        if (typeof d3 === 'undefined') return; 
        const ids = idsStr.split(',').map(s=>s.trim());
        d3.selectAll('.node').classed('cutset-highlight', false).classed('ccf-highlight', false).classed('path-highlight', false); d3.selectAll('.link').classed('cutset-highlight', false);
        d3.selectAll('.node').filter(d => ids.includes(d.data.displayId)).classed('cutset-highlight', true);
        if(ccfGroupName) { d3.selectAll('.node').filter(d => d.data.ccfGroup === ccfGroupName).classed('ccf-highlight', true).classed('cutset-highlight', false); }

        const activeRoot = getActiveFTARoot();
        if(activeRoot) {
            let pathIds = new Set(ids);
            function searchAndTrace(node) {
                if(!node) return false;
                let inPath = ids.includes(node.displayId);
                let actualChildren = node.children || node._children;
                if(actualChildren) { actualChildren.forEach(child => { if(searchAndTrace(child)) { inPath = true; } }); }
                if(inPath) pathIds.add(node.displayId); return inPath;
            }
            searchAndTrace(activeRoot);
            d3.selectAll('.link').filter(d => pathIds.has(d.target.data.displayId)).classed('cutset-highlight', true);
            d3.selectAll('.node').filter(d => pathIds.has(d.data.displayId) && !ids.includes(d.data.displayId)).classed('path-highlight', true);
        }
    } catch(e) { console.error("Highlight Error:", e); }
}

function _gtLink(label, d){
    const i = window._gtJumps.push(d) - 1;
    return '<span role="button" tabindex="0" style="color: var(--color-accent); cursor: pointer; text-decoration: underline; text-underline-offset: 2px;" onclick="_gtJumpIdx(' + i + ')">' + esc(label) + '</span>';
}
function _gtChip(text, kind){
    const map = { gap:'var(--color-danger)', warn:'var(--color-warning)', ok:'var(--color-success)', info:'var(--color-accent)' };
    const c = map[kind] || 'var(--color-text-secondary)';
    return '<span style="display:inline-block; font-size:10.5px; font-weight:700; padding:1px 7px; border-radius:var(--r-full); background:var(--color-surface-2); color:' + c + '; margin-left:6px;">' + esc(text) + '</span>';
}
function _gtStage(title, bodyHtml, status){
    const map = { gap:'var(--color-danger)', warn:'var(--color-warning)', ok:'var(--color-success)', info:'var(--color-accent)' };
    const c = map[status] || 'var(--color-border)';
    const tag = status === 'gap' ? '<span style="font-size:10px; font-weight:700; color:var(--color-danger);">&#9679; GAP</span>'
              : status === 'warn' ? '<span style="font-size:10px; font-weight:700; color:var(--color-warning);">&#9679; CHECK</span>'
              : status === 'ok' ? '<span style="font-size:10px; font-weight:700; color:var(--color-success);">&#9679; OK</span>' : '';
    return '<div style="border:1px solid var(--color-border-hair); border-left:4px solid ' + c + '; border-radius:var(--r-md); background:var(--color-surface-1); padding:11px 14px; margin-bottom:10px;">'
        + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;"><span style="font-size:13px; font-weight:700; color:var(--color-text-primary);">' + title + '</span>' + tag + '</div>'
        + '<div style="font-size:12.5px; color:var(--color-text-secondary); line-height:1.55;">' + bodyHtml + '</div></div>';
}
function _gtCollectBEs(root){ const out=[]; (function w(n){ if(!n) return; if(n.type==='basic') out.push(n); const k=n.children||n._children; if(k) k.forEach(w); })(root); return out; }
// Highlight support — when a thread is opened *from* an analytical item, mark
// that item's place ("you are here") so the user sees where it sits on the thread.
function _gtMatch(d, hl){ if(!hl || !d) return false; if(hl.kind !== d.kind) return false; return String(hl.id) === String(d.id); }
function _gtMark(html, isHit){
    if(!isHit) return html;
    return '<span id="gt-hl" style="display:inline-block; background:var(--color-accent-soft); border-left:3px solid var(--color-accent); border-radius:0 var(--r-sm) var(--r-sm) 0; padding:2px 8px;">' + html
        + ' <span style="font-size:10px; font-weight:700; color:var(--color-accent); letter-spacing:0.04em;">&#9679; HERE</span></span>';
}

// ---- Golden Thread right column: Human Factors + RAM linkage (9 Sep 2026) ----
// Read-only, defensive: never throws into the thread render; degrades to a plain
// "unavailable / none linked" line. HF reads projectConfig.hf.{alloc,hea,alerts};
// RAM reuses the RAM suite's own resolver (window.ramTraceRows) so it can't disagree
// with the R&M pages.
function _gtHFSection(fha, domain, highlight){
    var res = { html:'', warns:0, gaps:0 };
    try {
        var pc = (typeof projectConfig !== 'undefined' && projectConfig) ? projectConfig : {};
        var hf = pc.hf || {};
        var fcId = String(fha.fcId || '');
        var inFc = function(csv){ return String(csv||'').split(',').map(function(x){ return x.trim(); }).filter(Boolean).indexOf(fcId) >= 0; };
        var alloc  = (hf.alloc  && hf.alloc.rows)  || [];
        var hea    = ((hf.hea   && hf.hea.rows)    || []).filter(function(r){ return r && inFc(r.fcIds); });
        var alerts = ((hf.alerts && hf.alerts.rows) || []).filter(function(r){ return r && inFc(r.fcIds); });
        var arow   = alloc.filter(function(r){ return r && String(r.subId) === String(fha.subId); })[0];
        var lines = [];
        if (arow && arow.allocation) {
            lines.push('Function <strong>' + esc(fha.subId||'') + '</strong> &rarr; allocation <strong>' + esc(arow.allocation) + '</strong>' + (arow.rationale ? ' &middot; ' + esc(arow.rationale) : ''));
        } else if (hea.length) {
            lines.push('Function <strong>' + esc(fha.subId||'') + '</strong> has crew-error analysis but no crew/shared allocation' + _gtChip('allocate', 'warn'));
            res.warns++;
        }
        if (hea.length) {
            lines.push('<span style="color:var(--color-text-tertiary);">Human error</span>');
            hea.slice(0,6).forEach(function(r){
                var chip = '';
                if (r.errorMode && (!r.detection || !r.recovery)) { chip = _gtChip('no detection/recovery', 'warn'); res.warns++; }
                lines.push('&middot; <strong>' + esc(r.heaId||'') + '</strong> ' + esc(r.task||'') + (r.errorMode ? ' &mdash; ' + esc(r.errorMode) : '') + chip);
            });
            if (hea.length > 6) lines.push('<span style="color:var(--color-text-tertiary);">+' + (hea.length-6) + ' more</span>');
        }
        if (alerts.length) {
            lines.push('<span style="color:var(--color-text-tertiary);">Crew alerting</span>');
            alerts.slice(0,6).forEach(function(r){
                lines.push('&middot; <strong>' + esc(r.alertId||'') + '</strong> ' + esc(r.name||'') + (r.priority ? ' &mdash; ' + esc(r.priority) : '') + (r.modality ? ' / ' + esc(r.modality) : ''));
            });
        }
        var body = lines.length ? lines.join('<br>') : 'No human-factors analysis linked to this failure condition.';
        res.html = _gtStage('Human factors', body, res.warns ? 'warn' : 'info');
    } catch (e) {
        res.html = _gtStage('Human factors', 'HF linkage unavailable.', 'info');
    }
    return res;
}
function _gtRAMSection(fha){
    var res = { html:'', warns:0, gaps:0 };
    try {
        var fcId = String(fha.fcId || '');
        var rows = [];
        if (typeof window !== 'undefined' && typeof window.ramTraceRows === 'function') {
            rows = (window.ramTraceRows() || []).filter(function(r){ return r && (r.fcs||[]).some(function(f){ return String(f.fcId) === fcId; }); });
        }
        var lines = [];
        rows.slice(0,8).forEach(function(r){
            var head = '<strong>' + esc(r.ref || '') + '</strong>' + (r.item ? ' &middot; ' + esc(r.item.itemId || r.item.name || '') : '');
            var bits = [];
            (r.tasks||[]).slice(0,3).forEach(function(t){ bits.push(esc(t.name || ('task ' + t.id)) + (t.interval ? ' @ ' + esc(String(t.interval)) : '')); });
            if ((r.field||[]).length) bits.push(r.field.length + ' FRACAS');
            if ((r.mmel||[]).length && r.mmel[0]) bits.push('MMEL ' + esc(String(r.mmel[0].category || '')));
            if ((r.msg3||[]).length) bits.push((r.msg3.length) + ' MSG-3');
            var gapc = '';
            if (r.gaps && r.gaps.length) { gapc = _gtChip(r.gaps.length + ' gap' + (r.gaps.length===1?'':'s'), 'warn'); res.warns++; }
            lines.push(head + (bits.length ? '<br><span style="color:var(--color-text-tertiary);">' + bits.join(' &middot; ') + '</span>' : '') + gapc);
        });
        if (rows.length > 8) lines.push('<span style="color:var(--color-text-tertiary);">+' + (rows.length-8) + ' more R&amp;M chains</span>');
        var body = lines.length ? lines.join('<br>') : 'No reliability / maintainability chain reaches this failure condition.';
        res.html = _gtStage('Reliability &amp; maintainability', body, res.warns ? 'warn' : 'info');
    } catch (e) {
        res.html = _gtStage('Reliability &amp; maintainability', 'RAM linkage unavailable.', 'info');
    }
    return res;
}

function _renderGoldenThread(fha, domain, highlight){
    window._gtJumps = [];
    const isAC = domain === 'AC';
    let systemId = null;
    if(!isAC){ (systemsData||[]).forEach(s => { if((s.fha||[]).some(f => String(f.internalId) === String(fha.internalId))) systemId = s.id; }); }
    const target = { kind: isAC ? 'acFha' : 'sysFha', id: fha.internalId, systemId: systemId };
    let refs = [];
    try { if(typeof Traceability !== 'undefined') refs = Traceability.getReferrers(target) || []; } catch(e){ refs = []; }
    const byKind = {}; refs.forEach(r => { (byKind[r.kind] = byKind[r.kind] || []).push(r); });

    let gaps = 0, warns = 0;
    const sevTarget = (typeof getSafetyTarget === 'function') ? getSafetyTarget(fha.severity) : { prob:null };

    // Linked fault-tree pages (linkedFhaIds — not the active-page hack).
    const linkedPages = (ftaPages||[]).filter(p => {
        const links = (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds : (p.linkedFhaId ? [p.linkedFhaId] : []);
        return links.includes(fha.internalId);
    });
    const tree = linkedPages.length ? linkedPages[0] : null;
    let computed = null;
    if(tree && tree.root){ try { computed = computeExactProbability(tree.root).prob; } catch(e){ computed = (tree.root.probability || null); } }

    let html = '';
    let rightHtml = '';

    // 1 — Failure condition
    html += _gtStage('Failure condition',
        '<strong>' + esc(fha.fcId || '') + '</strong> · ' + esc(fha.fcDesc || '') + '<br>'
        + 'Effects — AC: ' + esc(fha.effAc || '—') + ' · Crew: ' + esc(fha.effCrew || '—') + ' · Pax: ' + esc(fha.effPax || '—')
        + ' · Phases: ' + esc(fha.phases || '—'),
        'info');

    // 2 — Budget check (BDD-exact vs cert-basis target)
    let budgetBody, budgetStatus;
    if(sevTarget && sevTarget.prob != null){
        if(computed != null){
            const pass = computed <= sevTarget.prob;
            if(!pass) gaps++;
            budgetStatus = pass ? 'ok' : 'gap';
            budgetBody = 'Target ≤ ' + sevTarget.prob.toExponential(1) + '/fh · BDD-exact top ' + computed.toExponential(2)
                + _gtChip(pass ? 'within budget' : 'exceeds budget', pass ? 'ok' : 'gap');
        } else { warns++; budgetStatus = 'warn'; budgetBody = 'Target ≤ ' + sevTarget.prob.toExponential(1) + '/fh · no fault tree linked' + _gtChip('no tree', 'warn'); }
    } else { budgetStatus = 'info'; budgetBody = 'No quantitative target for this severity / cert basis (' + esc((sevTarget && sevTarget.scope) || '—') + ').'; }
    html += _gtStage('Budget check', budgetBody, budgetStatus);

    // 3 — Function / DAL
    const fn = (acFunctionsData||[]).find(f => f.subId === fha.subId);
    let fnBody;
    if(fn){ let _fb = _gtLink((fn.subId || '') + ' · ' + (fn.subName || ''), { kind:'acFunc', id: fn.subId }); if(sevTarget && sevTarget.dal) _fb += ' · FDAL ' + esc(sevTarget.dal); fnBody = _gtMark(_fb, _gtMatch({ kind:'acFunc', id: fn.subId }, highlight)); }
    else { fnBody = 'Sub-function ' + esc(fha.subId || '—') + ' (not found in AC Functions)'; warns++; }
    html += _gtStage('Function → DAL', fnBody, fn ? 'info' : 'warn');

    // 4 — Fault tree
    let ftBody, ftStatus;
    if(tree && tree.root){
        ftStatus = 'info';
        ftBody = _gtLink(tree.name || 'Fault tree', { kind:'ftaPage', id: tree.id });
        try {
            const mcs = bddMinimalCutsets(tree.root) || [];
            ftBody += ' · ' + mcs.length + ' minimal cutset' + (mcs.length===1?'':'s');
            const top = mcs.slice().sort((a,b)=>a.length-b.length).slice(0,3);
            if(top.length){ ftBody += '<br>' + top.map((cs,i)=> 'CS' + (i+1) + ': ' + cs.map(e=>e.displayId||('#'+e.id)).join(' · ')).join('<br>'); }
        } catch(e){}
    } else { ftStatus = 'warn'; ftBody = 'No fault tree linked to this failure condition.' + _gtChip('link a tree', 'warn'); }
    html += _gtStage('Fault tree', ftBody, ftStatus);

    // 5 — Contributors (basic events → FMEA modes + coverage → library)
    let contribBody = '';
    if(tree && tree.root){
        const bes = _gtCollectBEs(tree.root);
        if(bes.length){
            contribBody = bes.slice(0, 8).map(be => {
                const modes = (fmeaData||[]).filter(m => (m.fmeaType||'piece-part')==='piece-part' && m.beId === be.id);
                const cov = (typeof _sumAlphaFmForBe==='function') ? _sumAlphaFmForBe(be.id) : 0;
                let line = _gtLink(be.displayId || ('#'+be.id), { kind:'ftaNode', id: be.id, pageId: tree.id });
                if(modes.length){ const covOk = Math.abs(cov-1)<=0.02; if(!covOk && modes.some(m=>m.alphaFm!=null)) warns++; line += ' · ' + modes.length + ' FMEA mode' + (modes.length===1?'':'s') + (modes.some(m=>m.alphaFm!=null) ? _gtChip('Σα ' + Math.round(cov*100) + '%', covOk?'ok':'warn') : ''); }
                if(be.libraryKey){ const e = (typeof getActiveLibrary==='function') ? getActiveLibrary()[be.libraryKey] : null; line += ' · lib ' + esc((e&&e.name)||be.libraryKey); }
                return _gtMark(line, _gtMatch({ kind:'ftaNode', id: be.id }, highlight));
            }).join('<br>');
            if(bes.length > 8) contribBody += '<br><span style="color:var(--color-text-tertiary);">+' + (bes.length-8) + ' more basic events</span>';
        } else contribBody = 'No basic events on the linked tree yet.';
    } else { contribBody = 'No linked tree — add one to see contributors.'; }
    html += _gtStage('Contributors', contribBody, 'info');

    // 6 — Common cause (CMA on linked gates, PRA via zone, ZSA)
    const ccParts = [];
    const pageIds = linkedPages.map(p => String(p.id));
    (cmaData||[]).forEach(c => { if((c.linkedGateIds||[]).some(k => pageIds.includes(String(k).split(':')[0]))) ccParts.push(_gtMark(_gtLink('CMA ' + (c.cmaId||''), { kind:'cma', id:c.internalId }) + ' ' + esc(c.subject||''), _gtMatch({ kind:'cma', id:c.internalId }, highlight))); });
    (zsaData||[]).forEach(z => { if((z.housedFunctions||[]).includes(fha.subId)) ccParts.push(_gtMark(_gtLink('ZSA ' + (z.zoneId||''), { kind:'zsa', id:z.internalId }) + ' ' + esc(z.desc||''), _gtMatch({ kind:'zsa', id:z.internalId }, highlight))); });
    (praData||[]).forEach(p => { const zones=(p.affectedZones||[]); const exposes = zones.some(zid => { const z=(zsaData||[]).find(zz=>zz.zoneId===zid); return z && (z.housedFunctions||[]).includes(fha.subId); }); if(exposes) ccParts.push(_gtMark(_gtLink('PRA ' + (p.praId||''), { kind:'pra', id:p.internalId }) + ' ' + esc(p.threat||''), _gtMatch({ kind:'pra', id:p.internalId }, highlight))); });
    html += _gtStage('Common cause', ccParts.length ? ccParts.join('<br>') : 'No CMA / PRA / ZSA linked to this thread.', 'info');

    // 7 — Requirements
    const reqRefs = (byKind['acReq']||[]).concat(byKind['sysReq']||[]);
    let reqBody;
    if(reqRefs.length){ reqBody = reqRefs.slice(0,6).map(r => _gtMark(_gtLink(r.label || ('REQ ' + r.id), r), _gtMatch(r, highlight))).join('<br>'); }
    else { reqBody = 'No safety requirements traced to this failure condition.' + _gtChip('derive requirements', 'warn'); warns++; }
    rightHtml += _gtStage('Requirements', reqBody, reqRefs.length ? 'info' : 'warn');

    // 8 — Verification
    const resolveReq = (d) => { if(d.kind==='acReq') return (acReqData||[]).find(r=>r.internalId===d.id); const sys=(systemsData||[]).find(s=>s.id===d.systemId); return sys ? (sys.req||[]).find(r=>r.internalId===d.id) : null; };
    let vBody, vStatus = 'info';
    if(reqRefs.length){
        let verified=0, total=0;
        const lines = reqRefs.slice(0,6).map(d => { const req = resolveReq(d); if(!req) return null; total++; const st = req.verifStatus || 'Planned'; if(st==='Verified') verified++; const ok = st==='Verified'; return (req.traceId || ('REQ-'+req.internalId)) + ': ' + esc(st) + _gtChip(req.verifMethod || '—', ok?'ok':'warn'); }).filter(Boolean);
        if(total && verified < total){ warns++; vStatus='warn'; }
        vBody = lines.length ? lines.join('<br>') : 'Requirements carry no verification status yet.';
    } else { vBody = 'No requirements to verify yet.'; }
    rightHtml += _gtStage('Verification', vBody, vStatus);

    // 9 — Assumptions
    const asmRefs = (byKind['acAsm']||[]).concat(byKind['sysAsm']||[]);
    const allAsm = isAC ? (acAssumptionsData||[]) : (systemsData||[]).reduce((a,s)=>a.concat(s.asm||[]),[]);
    const fhaAsmIds = Array.isArray(fha.assumptionIds) ? fha.assumptionIds : [];
    const linkedAsm = allAsm.filter(a => fhaAsmIds.includes(a.asmId));
    let asmBody, asmStatus='info';
    const asmLines = [];
    linkedAsm.forEach(a => { const open = (a.state && a.state.toLowerCase()!=='validated' && a.state.toLowerCase()!=='closed'); if(open){ warns++; asmStatus='warn'; } asmLines.push('<strong>' + esc(a.asmId||'') + '</strong> ' + esc(a.text||a.statement||'') + _gtChip(a.state||'open', open?'warn':'ok')); });
    asmRefs.forEach(r => { if(!linkedAsm.some(a => (a.asmId||'')===String(r.id))) asmLines.push(_gtLink(r.label || ('ASM ' + r.id), r)); });
    asmBody = asmLines.length ? asmLines.join('<br>') : 'No assumptions linked to this hazard.';
    rightHtml += _gtStage('Assumptions', asmBody, asmStatus, true);

    // HF + RAM linkage (right column) — their open items count toward the thread total
    const _hf = _gtHFSection(fha, domain, highlight); warns += _hf.warns; gaps += _hf.gaps;
    const _ram = _gtRAMSection(fha); warns += _ram.warns; gaps += _ram.gaps;

    // Gap banner
    const total = gaps + warns;
    let banner;
    if(total === 0){ banner = '<div style="margin-top:8px; padding:10px 12px; border-radius:var(--r-md); border-left:3px solid var(--color-success); background:var(--color-surface-2); color:var(--color-success); font-size:12.5px; font-weight:600;">Thread complete — no open gaps on this failure condition.</div>'; }
    else { const col = gaps>0 ? 'var(--color-danger)' : 'var(--color-warning)'; banner = '<div style="margin-top:8px; padding:10px 12px; border-radius:var(--r-md); border-left:3px solid ' + col + '; background:var(--color-surface-2); color:' + col + '; font-size:12.5px;"><strong>' + total + ' open item' + (total===1?'':'s') + ' on this thread</strong>' + (gaps>0 ? ' — ' + gaps + ' budget/critical gap' + (gaps===1?'':'s') : '') + (warns>0 ? ' · ' + warns + ' incomplete link' + (warns===1?'':'s') : '') + '</div>'; }

    return '<div style="font-size:13px; font-weight:600; margin-bottom:10px; color:var(--color-text-primary);">' + esc(fha.fcId||'') + ' — ' + esc(fha.severity||'') + '</div>'
        + '<div class="gt-cols" style="display:flex; gap:16px; align-items:flex-start; flex-wrap:wrap;">'
        + '<div style="flex:1 1 0; min-width:280px;">' + html + '</div>'
        + '<div style="flex:1 1 0; min-width:280px;">' + rightHtml + _hf.html + _ram.html + '</div>'
        + '</div>'
        + banner;
}

function openGoldenThreadModal(internalId, domain, highlight) {
    const sourceArray = domain === 'AC' ? acFhaData : getAllSysFha();
    // internalId may arrive as a string (from the FHA-row button's HTML onclick) or a
    // number (from the artifact/data path). Coerce both sides so the match never fails
    // on type — this is what made the AFHA/SFHA "Golden Thread" button silently do nothing.
    const fha = sourceArray.find(x => String(x.internalId) === String(internalId));
    if(!fha) return;
    const host = document.getElementById('gt-thread');
    if(host){ try { host.innerHTML = _renderGoldenThread(fha, domain, highlight || null); } catch(e){ host.innerHTML = '<div style="color:var(--color-danger);">Thread render error: ' + esc(String(e)) + '</div>'; } }
    const titleEl = document.getElementById('gt-title');
    if(titleEl) titleEl.textContent = 'Golden Thread — ' + (fha.fcId || '');
    const modal = document.getElementById('golden-thread-modal');
    modal.style.display = 'flex';
    setTimeout(() => { modal.classList.add('show'); const hl = document.getElementById('gt-hl'); if(hl && hl.scrollIntoView){ try { hl.scrollIntoView({ block:'center', behavior:'smooth' }); } catch(_){ hl.scrollIntoView(); } } }, 60);
}

// Resolve which failure-condition thread(s) an analytical item belongs to.
// Returns [{ internalId, domain, fcId }]. The item is then shown highlighted
// on its FC's golden thread ("you are here").
function _resolveFcsForArtifact(target){
    const out = []; const seen = new Set();
    const pushFha = (fhaRow, domain) => { if(fhaRow && !seen.has(domain + ':' + fhaRow.internalId)){ seen.add(domain + ':' + fhaRow.internalId); out.push({ internalId: fhaRow.internalId, domain: domain, fcId: fhaRow.fcId }); } };
    const fhasForSubId = (subId) => { (acFhaData||[]).forEach(h => { if(h.subId === subId) pushFha(h, 'AC'); }); (systemsData||[]).forEach(s => (s.fha||[]).forEach(h => { if(h.subId === subId) pushFha(h, 'SYS'); })); };
    const fhasForPage = (page) => { if(!page) return; const links = (Array.isArray(page.linkedFhaIds)&&page.linkedFhaIds.length)?page.linkedFhaIds:(page.linkedFhaId?[page.linkedFhaId]:[]); links.forEach(lid => { const ac=(acFhaData||[]).find(h=>h.internalId===lid); if(ac){pushFha(ac,'AC');return;} (systemsData||[]).forEach(s=>{ const sf=(s.fha||[]).find(h=>h.internalId===lid); if(sf) pushFha(sf,'SYS'); }); }); };
    const pagesWithNode = (nodeId) => (ftaPages||[]).filter(p => (typeof findNode==='function') && findNode(p.root, nodeId));
    const subIdsForZone = (zoneId) => { const z=(zsaData||[]).find(zz=>zz.zoneId===zoneId); return z ? (z.housedFunctions||[]) : []; };
    try {
        switch(target.kind){
            case 'ftaNode': { const pages = target.pageId ? (ftaPages||[]).filter(p=>String(p.id)===String(target.pageId)) : pagesWithNode(target.id); pages.forEach(fhasForPage); break; }
            case 'cma': { const c=(cmaData||[]).find(x=>x.internalId===target.id); (c&&c.linkedGateIds||[]).forEach(k=>{ const pid=String(k).split(':')[0]; const pg=(ftaPages||[]).find(p=>String(p.id)===pid); fhasForPage(pg); }); break; }
            case 'zsa': { const z=(zsaData||[]).find(x=>x.internalId===target.id); (z&&z.housedFunctions||[]).forEach(fhasForSubId); break; }
            case 'pra': { const p=(praData||[]).find(x=>x.internalId===target.id); (p&&p.affectedZones||[]).forEach(zid => subIdsForZone(zid).forEach(fhasForSubId)); break; }
            case 'fmea': { const m=(fmeaData||[]).find(x=>x.internalId===target.id); if(m){ if(m.fmeaType==='functional'){ if(m.linkedFcId){ const fc=(acFhaData||[]).find(h=>String(h.internalId)===String(m.linkedFcId)); pushFha(fc,'AC'); } if(m.funcSubId) fhasForSubId(m.funcSubId); } else if(m.beId){ pagesWithNode(m.beId).forEach(fhasForPage); } } break; }
            case 'acFunc': fhasForSubId(target.id); break;
        }
    } catch(e){}
    return out;
}

function _gtvTrunc(s, n){ s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// Which system(s) realize a failure condition. SYS-domain FCs belong to their
// owning system; AC-domain FCs map to systems whose functions allocate the sub.
function _gtvSystemsForFc(fha, domain){
    const out = [];
    if(domain === 'SYS'){
        (systemsData||[]).forEach(s => { if((s.fha||[]).some(f => String(f.internalId) === String(fha.internalId))) out.push({ id: s.id, name: s.name || s.id }); });
    } else {
        (systemsData||[]).forEach(s => {
            const has = (s.functions||[]).some(fn => (Array.isArray(fn.traceIds) && fn.traceIds.includes(fha.subId)) || fn.subId === fha.subId);
            if(has) out.push({ id: s.id, name: s.name || s.id });
        });
    }
    return out;
}

// Build the project thread graph: { nodes:[{key,kind,id,label,sub,ref,deg}], links:[{s,t}] }.
// opts.functionSubId limits the walk to one aircraft sub-function.
function _gtvBuildGraph(opts){
    opts = opts || {};
    const scopeSub = opts.functionSubId || null;
    const nodes = new Map();
    const linkSet = new Set();
    const links = [];
    function addNode(kind, id, label, sub, ref, flag, flagReason){
        const key = kind + ':' + id;
        if(!nodes.has(key)) nodes.set(key, { key, kind, id: String(id), label: label || String(id), sub: sub || '', ref: ref || null, deg: 0, flag: flag || null, flagReason: flagReason || '' });
        else if(flag){ const ex = nodes.get(key); if(!ex.flag){ ex.flag = flag; ex.flagReason = flagReason || ''; } }
        return key;
    }
    function addLink(sKey, tKey){
        if(!sKey || !tKey || sKey === tKey) return;
        const id = sKey + '|' + tKey;
        if(linkSet.has(id)) return;
        linkSet.add(id); links.push({ s: sKey, t: tKey });
        const a = nodes.get(sKey), b = nodes.get(tKey); if(a) a.deg++; if(b) b.deg++;
    }
    // ---- CEA-derived supporting-system expansion --------------------------
    // Reuse the project's cascade graph (systems + resources + declared
    // interfaces) so a function's RESOURCE dependencies — power, avionics data,
    // sensor excitation — join its System lane as pills, no separate lane.
    // Reverse-BFS finds every system whose failure cascades INTO a primary
    // system; bounded hop-depth keeps a busy platform readable.
    const _CEA_SYS_HOP_CAP = 3;   // system-to-system distance, resources don't count
    let _ceaRev = null; const _ceaSysName = {};
    try {
        if(typeof window !== 'undefined' && typeof window.ceaGraph === 'function'){
            const _cg = window.ceaGraph();
            _ceaRev = {};
            _cg.nodes.forEach(nd => { if(nd.kind === 'system') _ceaSysName[String(nd.id)] = nd.name || nd.id; });
            (_cg.edges || []).forEach(e => { (_ceaRev[e.to] = _ceaRev[e.to] || []).push({ from: String(e.from), label: e.label || '' }); });
        }
    } catch(_){ _ceaRev = null; }
    const _ceaMemo = {};
    function _ceaUpstreamSystems(sysId){
        if(!_ceaRev) return [];
        const sid = String(sysId);
        if(_ceaMemo[sid]) return _ceaMemo[sid];
        const found = {}; const seen = new Set([sid]);
        let frontier = [{ id: sid, via: '', shop: 0 }];   // shop = system hops from the primary
        while(frontier.length){
            const next = [];
            frontier.forEach(cur => {
                if(cur.shop >= _CEA_SYS_HOP_CAP) return;   // bound by SYSTEM distance, not raw graph depth
                (_ceaRev[cur.id] || []).forEach(e => {
                    if(seen.has(e.from)) return; seen.add(e.from);
                    const isSys = Object.prototype.hasOwnProperty.call(_ceaSysName, e.from);
                    const via = cur.via || e.label || '';   // resource/medium closest to the primary
                    const shop = cur.shop + (isSys ? 1 : 0);
                    if(isSys && e.from !== sid && !found[e.from])
                        found[e.from] = { id: e.from, name: _ceaSysName[e.from], via: via, hops: shop };
                    next.push({ id: e.from, via: via, shop: shop });
                });
            });
            frontier = next;
        }
        return (_ceaMemo[sid] = Object.keys(found).map(k => found[k]));
    }

    const rows = [];
    (acFhaData||[]).forEach(f => rows.push({ fha: f, domain: 'AC', system: null }));
    (systemsData||[]).forEach(s => (s.fha||[]).forEach(f => rows.push({ fha: f, domain: 'SYS', system: s })));

    rows.forEach(({ fha, domain, system }) => {
        const subId = fha.subId;
        if(scopeSub && subId !== scopeSub) return;
        // 21 Aug 2026 (L1) — SFHA rows key to SYSTEM functions (funcId); resolve those too.
        const fn = (acFunctionsData||[]).find(f => f.subId === subId) || (system && (system.functions||[]).find(f => f.subId === subId || f.funcId === subId));

        let funcKey = null;
        if(subId){ const _fnNm = fn && (fn.subName || fn.funcName); funcKey = addNode('func', subId, subId + (_fnNm ? ' · ' + _fnNm : ''), 'Function', { kind: 'acFunc', id: subId }); }

        const syss = _gtvSystemsForFc(fha, domain);
        const sysKeys = [];
        // 21 Aug 2026 (A10/L1) — the SYSTEM lane names the FUNCTION where the
        // thread knows it: an SFHA row's own function key, or (aircraft rows)
        // the specific system function tracing to this sub-function. A node
        // first drawn with the generic 'System' subtitle upgrades in place.
        if(syss.length){ syss.forEach(s => {
            let fnName = null;
            try {
                if (domain === 'SYS' && system && s.id === system.id && typeof _sysFhaFuncKey === 'function') {
                    const key = _sysFhaFuncKey(system, fha);
                    if (key) { const f = (system.functions || []).find(x => x && String(x.funcId) === String(key)); fnName = f ? (f.funcName || key) : key; }
                }
                if (!fnName && subId) {
                    // _gtvSystemsForFc returns shallow {id,name} shapes — resolve
                    // the full system record for its declared functions.
                    const full = (systemsData || []).find(x => x && x.id === s.id);
                    const tf = ((full && full.functions) || []).find(x => x && (Array.isArray(x.traceIds) ? x.traceIds : []).indexOf(subId) !== -1);
                    if (tf) fnName = tf.funcName || tf.funcId;
                }
            } catch (_) {}
            const sk = addNode('sys', s.id, s.name, fnName ? ('Fn · ' + fnName) : 'System', { kind: 'system', id: s.id });
            if (fnName) { const nn = nodes.get(sk); if (nn && (nn.sub === 'System' || !nn.sub)) nn.sub = 'Fn · ' + fnName; }
            sysKeys.push(sk);
        }); }
        else { sysKeys.push(addNode('sys', '_aircraft', 'Aircraft level', 'System', null)); }

        const fcKey = addNode('fc', domain + ':' + fha.internalId, (fha.fcId || ('FC#' + fha.internalId)),
            (domain === 'AC' ? 'AFHA' : 'SFHA') + (fha.severity ? ' · ' + fha.severity : ''),
            { kind: domain === 'AC' ? 'acFha' : 'sysFha', id: fha.internalId, systemId: system ? system.id : null },
            fha.obsolete ? 'obsolete' : null, fha.obsoleteReason || '');

        sysKeys.forEach(sk => { if(funcKey) addLink(funcKey, sk); addLink(sk, fcKey); });
        // One lane, two roles: tag the systems that realize the function PRIMARY,
        // then fold in each primary's CEA-upstream supporting systems as RESOURCE
        // pills, linked to the same failure condition (their loss reaches it).
        sysKeys.forEach(sk => {
            const pn = nodes.get(sk); if(!pn) return;
            const pid = String(pn.id);
            if(pid === '_aircraft') return;
            if(!pn.role) pn.role = 'primary';
            _ceaUpstreamSystems(pid).forEach(u => {
                const rk = addNode('sys', u.id, u.name, 'via ' + (u.via || 'shared resource'), { kind: 'system', id: u.id });
                const rn = nodes.get(rk);
                if(rn && rn.role !== 'primary'){ rn.role = 'resource'; rn.via = u.via || ''; rn.hops = u.hops; rn.path = u.name + ' → … → ' + (_ceaSysName[pid] || pn.label); }
                if(funcKey) addLink(funcKey, rk);   // every system connects back to the function
                addLink(rk, fcKey);
            });
        });

        const linkedPages = (ftaPages||[]).filter(p => { const L = (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds : (p.linkedFhaId ? [p.linkedFhaId] : []); return L.includes(fha.internalId); });
        const pageIds = linkedPages.map(p => String(p.id));
        const ftaKeys = [];
        linkedPages.forEach(p => { const k = addNode('fta', p.id, (p.name || ('Tree ' + p.id)), 'Fault tree', { kind: 'ftaPage', id: p.id }, p.obsolete ? 'obsolete' : null, p.obsoleteReason || ''); ftaKeys.push(k); addLink(fcKey, k); });

        (cmaData||[]).forEach(c => { if((c.linkedGateIds||[]).some(k => pageIds.includes(String(k).split(':')[0]))){ const k = addNode('cca', 'cma:' + c.internalId, ('CMA ' + (c.cmaId || '')).trim(), c.subject || 'Common mode', { kind: 'cma', id: c.internalId }, c.ipCompromised ? 'compromised' : null, c.ipCompromised ? ('Independence compromised — ' + c.ipCompromised.principle) : ''); if(ftaKeys.length) ftaKeys.forEach(fk => addLink(fk, k)); else addLink(fcKey, k); } });

        // C1 (gap 5) — Independence Principles as first-class thread nodes: the
        // deduped claims this FC's trees rely on, coloured by lifecycle state and
        // flagged when compromised. Links: tree → principle → its requirements.
        try {
            if(typeof ipLedger === 'function' && pageIds.length){
                ipLedger().forEach(p => {
                    if(!(p.sources || []).some(sc => sc && pageIds.includes(String(sc.pageId)))) return;
                    const flag = p.state === 'compromised' ? 'compromised' : null;
                    const why = p.contradiction ? 'CCF contradiction' : p.gateCompromised ? 'gate independence compromised' : p.bowtieCC ? 'bow-tie cross-side common cause' : p.monitorCC ? 'monitor shares its target' : (flag ? 'open CMA finding' : '');
                    const ipKey = addNode('ip', p.key, p.members.map(m => m.label).join(' ⊥ '), 'Independence · ' + (p.state || 'identified'), { kind: 'principle', id: p.key }, flag, why);
                    if(ftaKeys.length) ftaKeys.forEach(fk => addLink(fk, ipKey)); else addLink(fcKey, ipKey);
                    (p.reqs || []).forEach(r => {
                        const isAc = (acReqData || []).indexOf(r) !== -1;
                        const owner = isAc ? null : (systemsData || []).find(ss => (ss.req || []).indexOf(r) !== -1);
                        const kind = isAc ? 'acReq' : 'sysReq';
                        let rf = null, rr = '';
                        if(r.compromised){ rf = 'compromised'; }
                        else if(r.ipCompromised){ rf = 'compromised'; rr = 'Independence principle compromised — ' + r.ipCompromised.principle + ' (' + r.ipCompromised.why + ')'; }
                        const rk = addNode('req', kind + ':' + r.internalId, (r.traceId || r.id || ('REQ-' + r.internalId)), r.type || 'Independence', { kind, id: r.internalId, systemId: owner ? owner.id : null }, rf, rr);
                        addLink(ipKey, rk);
                    });
                });
            }
        } catch(e){}
        (zsaData||[]).forEach(z => { if((z.housedFunctions||[]).includes(subId)){ const k = addNode('cca', 'zsa:' + z.internalId, ('ZSA ' + (z.zoneId || '')).trim(), z.desc || 'Zonal', { kind: 'zsa', id: z.internalId }); addLink(fcKey, k); } });
        (praData||[]).forEach(p => { const exposes = (p.affectedZones||[]).some(zid => { const z = (zsaData||[]).find(zz => zz.zoneId === zid); return z && (z.housedFunctions||[]).includes(subId); }); if(exposes){ const k = addNode('cca', 'pra:' + p.internalId, ('PRA ' + (p.praId || '')).trim(), p.threat || 'Particular risk', { kind: 'pra', id: p.internalId }); addLink(fcKey, k); } });

        let refs = [];
        try { if(typeof Traceability !== 'undefined') refs = Traceability.getReferrers({ kind: domain === 'AC' ? 'acFha' : 'sysFha', id: fha.internalId, systemId: system ? system.id : null }) || []; } catch(e){}
        refs.filter(r => r.kind === 'acReq' || r.kind === 'sysReq').forEach(r => {
            const req = (r.kind === 'acReq') ? (acReqData||[]).find(x => String(x.internalId) === String(r.id))
                      : (function(){ const s = (systemsData||[]).find(ss => ss.id === r.systemId); return s ? (s.req||[]).find(x => String(x.internalId) === String(r.id)) : null; })();
            const label = (req && (req.traceId || req.id)) || r.label || ('REQ-' + r.id);
            let reqFlag = null, reqReason = '';
            if(req){
                if(req.compromised){ reqFlag = 'compromised'; reqReason = (Array.isArray(req.compromiseReasons) && req.compromiseReasons.length) ? req.compromiseReasons.map(x => (x && (x.detail || x.kind)) || '').filter(Boolean).join(' · ') : ''; }
                else if(req.ipCompromised){ reqFlag = 'compromised'; reqReason = 'Independence principle compromised — ' + req.ipCompromised.principle + ' (' + req.ipCompromised.why + ')'; }
                else if(req.reqSource && req.reqSource.obsolete){ reqFlag = 'obsolete'; reqReason = (req.reqSource.obsolete && req.reqSource.obsolete.reason) || ''; }
                else if(req.reqSource && req.reqSource.stale){ reqFlag = 'stale'; reqReason = 'Upstream source changed since this requirement was generated.'; }
            }
            const rk = addNode('req', r.kind + ':' + r.id, label, (req && req.type) || 'Requirement', { kind: r.kind, id: r.id, systemId: r.systemId }, reqFlag, reqReason);
            addLink(fcKey, rk);
            const st = (req && (req.verifStatus || req.vvStatus)) || 'Planned';
            addLink(rk, addNode('vv', 'st:' + st, st, 'Verification', null));
        });

        // Also surface gate-independence requirements attached via this FC's linked fault trees —
        // they reference a gate (not the FHA), so getReferrers misses them, yet they carry the compromise flags.
        const _allReqs = (acReqData||[]).map(rr => ({ req: rr, kind: 'acReq', systemId: null }))
            .concat((systemsData||[]).reduce((a, s) => a.concat((s.req||[]).map(rr => ({ req: rr, kind: 'sysReq', systemId: s.id }))), []));
        _allReqs.forEach(({ req, kind, systemId }) => {
            const sid = req.reqSource && req.reqSource.sourceId; if(!sid) return;
            const gi = sid.indexOf(':gate-indep:'); if(gi < 0) return;
            const pageId = sid.slice(gi + 12).split(':')[0];
            if(!pageIds.includes(String(pageId))) return;
            let gf = null, gr = '';
            if(req.compromised){ gf = 'compromised'; gr = (Array.isArray(req.compromiseReasons) && req.compromiseReasons.length) ? req.compromiseReasons.map(x => (x && (x.detail || x.kind)) || '').filter(Boolean).join(' · ') : ''; }
            else if(req.ipCompromised){ gf = 'compromised'; gr = 'Independence principle compromised — ' + req.ipCompromised.principle + ' (' + req.ipCompromised.why + ')'; }
            else if(req.reqSource && req.reqSource.obsolete){ gf = 'obsolete'; gr = (req.reqSource.obsolete && req.reqSource.obsolete.reason) || ''; }
            else if(req.reqSource && req.reqSource.stale){ gf = 'stale'; }
            const gk = addNode('req', kind + ':' + req.internalId, (req.traceId || req.id || ('REQ-' + req.internalId)), req.type || 'Independence', { kind: kind, id: req.internalId, systemId: systemId }, gf, gr);
            addLink(fcKey, gk);
            const gst = req.verifStatus || req.vvStatus || 'Planned';
            addLink(gk, addNode('vv', 'st:' + gst, gst, 'Verification', null));
        });

        // ---- Authored requirements linked by traceId to this FC (+ verification) ----
        // The FHA-referrer index misses reqs that trace by fcId string; join them
        // directly so every requirement and its verification status reach the thread.
        (function(){
            const list = (domain === 'AC')
                ? (acReqData || []).map(r => ({ r: r, kind: 'acReq', systemId: null }))
                : (((system && system.req) || []).map(r => ({ r: r, kind: 'sysReq', systemId: system ? system.id : null })));
            list.filter(x => x.r && String(x.r.traceId) === String(fha.fcId)).forEach(x => {
                const r = x.r;
                let rf = null, rr = '';
                if(r.compromised){ rf = 'compromised'; rr = (Array.isArray(r.compromiseReasons) && r.compromiseReasons.length) ? r.compromiseReasons.map(y => (y && (y.detail || y.kind)) || '').filter(Boolean).join(' · ') : ''; }
                else if(r.ipCompromised){ rf = 'compromised'; rr = 'Independence principle compromised — ' + r.ipCompromised.principle; }
                else if(r.reqSource && r.reqSource.stale){ rf = 'stale'; rr = 'Upstream source changed since this requirement was generated.'; }
                const rk = addNode('req', x.kind + ':' + r.internalId, (r.id || ('REQ-' + r.internalId)), r.type || 'Requirement', { kind: x.kind, id: r.internalId, systemId: x.systemId }, rf, rr);
                addLink(fcKey, rk);
                const st = r.verifStatus || r.vvStatus || 'Planned';
                addLink(rk, addNode('vv', 'st:' + st, st, 'Verification', null));
            });
        })();
        // ---- RAM: reliability-bearing items for this function feed its trees ----
        // Reliability sets the fault-tree numbers, so items linked to this
        // function connect INTO its trees (or the FC when no tree exists yet).
        (typeof itemsData !== 'undefined' ? (itemsData || []) : []).forEach(it => {
            if(!(it.traceIds || []).includes(subId)) return;
            const rk = addNode('ram', 'item:' + (it.itemId || it.internalId), (it.itemId || 'ITEM'),
                (it.name || '') + (it.dal ? ' · DAL ' + it.dal : ''), { kind: 'item', id: it.internalId, systemId: it.owningSystemId || null });
            if(ftaKeys.length) ftaKeys.forEach(fk => addLink(rk, fk)); else addLink(rk, fcKey);
        });
        // ---- HF: human-factors assumptions inform which failure conditions are credible ----
        // Anchored to the aircraft-level FCs, flagged when not yet validated.
        // Bonded INTO the thread (not floating): aircraft-level HF hangs off the
        // function; system-level HF hangs off its system. Scoped so a thread only
        // shows aircraft-wide HF plus HF authored against a system it contains —
        // assumptions carry no per-function trace, so aircraft-level are global by design.
        if(domain === 'AC'){
            try {
                if(typeof HF_ASSUMPTIONS !== 'undefined' && HF_ASSUMPTIONS.asmAllTyped){
                    const _thrSys = (syss || []).map(s => ({ id: s.id, name: String(s.name || s.id) }));
                    const _thrNames = new Set(_thrSys.map(s => s.name));
                    HF_ASSUMPTIONS.asmAllTyped()
                        .filter(a => a && a.type === 'hf' && (a.scope === 'Aircraft' || _thrNames.has(String(a.scope))))
                        .forEach(a => {
                        const st = String(a.state || '').toLowerCase();
                        const hfFlag = (st.indexOf('validat') < 0 && st.indexOf('verif') < 0) ? 'stale' : null;
                        const hk = addNode('hf', 'hf:' + a.asmId, a.asmId, 'HF · ' + (a.state || 'assumption'),
                            { kind: 'assumption', id: a.asmId }, hfFlag, hfFlag ? 'HF assumption not yet validated' : '');
                        const owner = (a.scope !== 'Aircraft') ? _thrSys.find(s => s.name === String(a.scope)) : null;
                        if(owner) addLink('sys:' + owner.id, hk); else if(funcKey) addLink(funcKey, hk);
                        addLink(hk, fcKey);
                    });
                }
            } catch(e){}
        }
        // ---- STPA (W5): spine hazards imported from this FC join the thread ----
        // The system lane's hazard object anchors to the FC it was created from
        // (fromFcId); its STPA-derived requirements ride the standard req column.
        // Flagged 'stale' when the hazard is not yet traced to a loss — an
        // untraced hazard in evidence is a claim nobody finished.
        try {
            if(typeof stpaData !== 'undefined' && stpaData && Array.isArray(stpaData.hazards)){
                stpaData.hazards.filter(h => h && h.fromFcId && h.fromFcId === fha.fcId).forEach(h => {
                    const untraced = !(h.lossIds || []).length;
                    // STPA-BRIDGE — scan this hazard's citing UCAs for declared
                    // bridges: refs pull a ribbon to the fault tree that carries
                    // the counterpart; declared-empty marks interaction-pure.
                    const bridgedPageIds = new Set(); let interactionN = 0;
                    Object.keys(stpaData.dispositions || {}).forEach(bk => {
                        const bx = stpaData.dispositions[bk];
                        if(!bx || bx.status !== 'assessed' || (bx.hazardIds || []).indexOf(h.id) < 0) return;
                        if(!bx.bridge || !bx.bridge.declared) return;
                        const brefs = (bx.bridge.ftaRefs || []).map(String);
                        if(!brefs.length && !(bx.bridge.fmeaRefs || []).length){ interactionN++; return; }
                        brefs.forEach(ref => {
                            (ftaPages || []).some(bp => {
                                let hitP = false;
                                (function bw(n){ if(!n || hitP) return; if(String(n.displayId || '') === ref || String(n.id) === ref){ hitP = true; return; } (n.children || []).forEach(bw); })(bp.root);
                                if(hitP) bridgedPageIds.add(String(bp.id));
                                return hitP;
                            });
                        });
                    });
                    const sk = addNode('stpa', 'h:' + h.id, h.id,
                        'STPA hazard' + ((h.group || '') ? ' · ' + h.group : '') + (interactionN ? ' · interaction-pure ×' + interactionN : ''),
                        { kind: 'stpaHazard', id: h.id },
                        untraced ? 'stale' : null, untraced ? 'STPA hazard not yet traced to a loss (1b)' : '');
                    addLink(sk, fcKey);
                    bridgedPageIds.forEach(pid => {
                        const bp = (ftaPages || []).find(p => String(p.id) === pid);
                        addLink(sk, addNode('fta', pid, (bp && bp.name) || ('Tree ' + pid), 'Fault tree', { kind: 'ftaPage', id: pid }));
                    });
                    // drafted requirements whose UCA cites this hazard → req column
                    Object.keys(stpaData.dispositions || {}).forEach(k => {
                        const x = stpaData.dispositions[k];
                        if(!x || x.status !== 'assessed' || (x.hazardIds || []).indexOf(h.id) < 0) return;
                        (acReqData || []).forEach(r => {
                            if(!r || r.uca !== ('UCA-' + k)) return;
                            const rk = addNode('req', 'acReq:' + r.internalId, ('STPA · ' + (r.uca || '')),
                                r.type || 'Safety', { kind: 'acReq', id: r.internalId });
                            addLink(fcKey, rk);
                            addLink(rk, addNode('vv', 'st:' + (r.verifStatus || 'Planned'), (r.verifStatus || 'Planned'), 'Verification', null));
                        });
                    });
                });
            }
        } catch(e){}
    });
    // ---- Physical hazards (8 Aug 2026) — the twelfth node kind ----
    // A CCA-found physical hazard is NOT a functional hazard (ruling): it joins
    // the graph as its own object — source CCA artifact → hazard → its
    // requirements → verification — rendered beside the failure conditions.
    // The pass lives in phys_hazards.js (PHYS_HAZARDS._graphPass) so the store
    // knowledge stays with the module; this is only the seam.
    try {
        if(typeof window !== 'undefined' && window.PHYS_HAZARDS && typeof window.PHYS_HAZARDS._graphPass === 'function')
            window.PHYS_HAZARDS._graphPass(addNode, addLink, scopeSub);
    } catch(e){}
    return { nodes: Array.from(nodes.values()), links };
}

// Hand-rolled layered-Sankey layout. Columns = artifact layers; node height and
// ribbon width scale with connection count. Mutates _x/_y/_w/_h on nodes and
// _x0/_y0/_x1/_y1/_th on links.
function _gtvLayout(graph, W, H){
    // Monarch-display pass: taller header band, fatter node bars, more breathing
    // room between bars — the thread should read across a room, not a loupe.
    const pad = { top: 42, bottom: 18, left: 12, right: 14 };
    const colNodes = {}; _GTV_LAYERS.forEach(l => colNodes[l] = []);
    graph.nodes.forEach(n => { if(colNodes[n.kind]) colNodes[n.kind].push(n); });
    const active = _GTV_LAYERS.filter(l => colNodes[l].length);
    const nCol = active.length;
    const innerW = W - pad.left - pad.right;
    const colGap = nCol > 1 ? innerW / (nCol - 1) : 0;
    const nodeW = 18, vGap = 6;
    // Monarch-style flow, biased toward the source. Inject one unit at every sink (V&V / dead-end)
    // and push it LEFTWARD. A node's flow is split among its parents with a SOFTENED divisor
    // (inDeg^ALPHA, ALPHA<1) instead of a strict ÷inDeg — so upstream columns accumulate more
    // weight and render as fatter, more varied anchor bars. That stops the Function column from
    // being a uniform picket-fence of thin bars, and makes the "first couple columns" read bolder.
    // Ribbons still carry the real per-edge flow, so they keep the tapering Sankey look.
    const ALPHA = 0.6;   // 1 = strict conservation (flat source); lower = fatter / bolder source columns
    const outAdj = {}, inDeg = {};
    graph.nodes.forEach(n => { outAdj[n.key] = []; inDeg[n.key] = 0; });
    graph.links.forEach(L => { if(outAdj[L.s]) outAdj[L.s].push(L.t); if(L.t in inDeg) inDeg[L.t]++; });
    const div = k => Math.pow(Math.max(1, inDeg[k] || 0), ALPHA);   // softened split among a node's parents
    const flow = {};
    // right → left across the active layers; links only run left→right, so successors resolve first.
    for(let ci = active.length - 1; ci >= 0; ci--){
        colNodes[active[ci]].forEach(n => {
            const outs = outAdj[n.key];
            if(!outs || !outs.length){ flow[n.key] = 1; return; }        // sink / dead-end seeds one unit
            let f = 0; outs.forEach(t => { f += (flow[t] || 0) / div(t); });
            flow[n.key] = f > 0 ? f : 1;
        });
    }
    // Node value = the busier of its two sides. out-sum(u)=flow[u]; in-sum(t)=Σ parents flow[t]/div(t)
    // = flow[t]·inDeg[t]^(1-ALPHA). With ALPHA<1 a shared node's in-side runs a touch taller than its
    // out-side, so we size to the max and centre each ribbon stack (below) to hide the small gap.
    const outSum = {}, inSum = {};
    graph.nodes.forEach(n => {
        const k = n.key;
        outSum[k] = flow[k] || 0;
        inSum[k]  = (inDeg[k] > 0) ? (flow[k] || 0) * Math.pow(inDeg[k], 1 - ALPHA) : 0;
        n._val = Math.max(outSum[k], inSum[k], 1e-4);
        n._outOff = 0; n._inOff = 0;
    });
    // px-per-unit-of-flow, sized so the busiest column just fills the height.
    let unit = Infinity;
    active.forEach(l => {
        const ns = colNodes[l];
        const colTotal = ns.reduce((a, n) => a + n._val, 0) || 1;
        const avail = (H - pad.top - pad.bottom) - vGap * (ns.length - 1);
        if (avail > 0) unit = Math.min(unit, avail / colTotal);
    });
    if (!isFinite(unit) || unit <= 0) unit = 6;
    unit = Math.min(unit, 90);   // cap so a very sparse graph's ribbons aren't absurdly fat
    active.forEach((l, ci) => {
        const ns = colNodes[l];
        const used = ns.reduce((a, n) => a + n._val * unit, 0) + vGap * (ns.length - 1);
        let y = pad.top + Math.max(0, ((H - pad.top - pad.bottom) - used) / 2);   // centre shorter columns
        ns.forEach(n => {
            const h = Math.max(n._val * unit, 2.5);   // floor so a tiny node stays visible / clickable
            n._x = pad.left + (nCol > 1 ? ci * colGap : 0);
            n._y = y; n._h = h; n._w = nodeW; n._col = ci;
            // centre each side's ribbon stack in the node so the small out/in gap is symmetric.
            n._outOff = Math.max(0, (h - outSum[n.key] * unit) / 2);
            n._inOff  = Math.max(0, (h - inSum[n.key]  * unit) / 2);
            y += h + vGap;
        });
    });
    const byKey = {}; graph.nodes.forEach(n => { byKey[n.key] = n; });
    graph.links.forEach(L => {
        const a = byKey[L.s], b = byKey[L.t]; if(!a || !b) return;
        const th = Math.max(((flow[L.t] || 0) / div(L.t)) * unit, 0.6);   // per-edge flow (softened split)
        L._x0 = a._x + a._w; L._y0 = a._y + a._outOff + th / 2; a._outOff += th;
        L._x1 = b._x;        L._y1 = b._y + b._inOff + th / 2;  b._inOff += th;
        L._th = th;
    });
    return { active };
}

// Ecosystem panel: closure over up + down neighbours, grouped by layer.
// The panel is a movable, scrollable card — drag its handle to reposition so a
// long thread never clips — and every pill that maps to a real item is
// double-clickable to jump straight to that tree / function / requirement / etc.
function _gtvShowEco(key, graph){
    const eco = document.getElementById('gt-eco'); if(!eco) return;
    const byKey = {}; graph.nodes.forEach(n => byKey[n.key] = n);
    const out = {}, inc = {}; graph.nodes.forEach(n => { out[n.key] = []; inc[n.key] = []; });
    graph.links.forEach(L => { if(out[L.s]) out[L.s].push(L.t); if(inc[L.t]) inc[L.t].push(L.s); });
    function closure(start, adj){ const seen = {}, st = (adj[start]||[]).slice(), o = []; while(st.length){ const x = st.pop(); if(seen[x]) continue; seen[x] = 1; o.push(x); (adj[x]||[]).forEach(y => { if(!seen[y]) st.push(y); }); } return o; }
    const n = byKey[key]; if(!n){ eco.innerHTML = ''; return; }
    const reach = {}; reach[key] = 1; closure(key, out).forEach(k => reach[k] = 1); closure(key, inc).forEach(k => reach[k] = 1);
    const groups = {}; _GTV_LAYERS.forEach(l => groups[l] = []);
    Object.keys(reach).forEach(k => { const m = byKey[k]; if(m && m.key !== key && groups[m.kind]) groups[m.kind].push(m); });
    // Drag handle header (the panel becomes a floating, scrollable card on drag).
    let html = '<div id="gt-eco-drag" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:-6px -8px 8px; padding:5px 8px; cursor:move; border-bottom:1px solid var(--color-border-hair); background:var(--color-surface-3, rgba(127,127,127,0.06)); border-radius:var(--r-md) var(--r-md) 0 0;">'
        + '<span style="font-size:13px; color:var(--color-text-tertiary); letter-spacing:1px; user-select:none;">⠿</span>'
        + '<span style="font-size:11px; padding:2px 9px; border-radius:999px; color:#fff; font-weight:600; background:' + _GTV_COLOR[n.kind] + ';">' + _GTV_LNAME[n.kind] + '</span>'
        + '<span style="font-size:15px; font-weight:600; color:var(--color-text-primary);">' + esc(n.label) + '</span>'
        + '<span style="flex:1;"></span>'
        + '<span style="font-size:10.5px; color:var(--color-text-tertiary); user-select:none;">drag to move</span>'
        + '<button id="gt-eco-close" title="Close" aria-label="Close" style="margin-left:4px; background:transparent; border:none; font-size:19px; line-height:1; cursor:pointer; color:var(--color-text-secondary); padding:0 3px;">×</button></div>'
        + '<div style="font-size:11px; color:var(--color-text-tertiary); margin-bottom:8px;">Threads through ' + (Object.keys(reach).length - 1) + ' linked item' + (Object.keys(reach).length - 1 === 1 ? '' : 's') + ' · click any pill to open it</div>'
        // 25 Aug 2026 — reviewer feedback (nav_feedback_1.pptx, slide 1): "From
        // golden thread I want to see this FC, but it opens a window instead …
        // I cant click on the FC. I figured it out by going through the
        // Function, then Failure condition."
        // The cause is one line above the groups build: `m.key !== key` excludes
        // the CLICKED node from its own pill list, so the panel could open
        // everything the node threads through EXCEPT the node itself. The
        // destination already worked (_gtvNavigateTo routes acFha/sysFha) — it
        // simply had no door. This is that door. It carries the same
        // .gte-pill[data-navkey] contract, so the existing wiring loop picks it
        // up with no new event code, and it sits BELOW the drag header rather
        // than inside it, so the click can never be eaten by a drag.
        + ((!!n.ref && n.kind !== 'vv')
            ? '<div style="margin:-2px 0 9px;"><span class="gte-pill gte-self" data-navkey="' + esc(n.key) + '" role="button" tabindex="0" title="Open ' + esc(n.label) + '"'
              + ' style="display:inline-flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; padding:5px 11px; border-radius:6px; border:1px solid ' + _GTV_COLOR[n.kind] + '; background:var(--color-surface-1); color:var(--color-text-primary); cursor:pointer; transition:background .12s, box-shadow .12s;">'
              + '<span style="width:8px; height:8px; border-radius:2px; background:' + _GTV_COLOR[n.kind] + '; flex:none;"></span>Open ' + esc(n.label)
              + '<span style="opacity:.45; font-size:12px;">↗</span></span></div>'
            : '')
        + (n.flag ? '<div style="margin:4px 0 8px; padding:8px 11px; border-radius:7px; border:1px solid ' + _GTV_FLAGC[n.flag] + '; background:var(--color-surface-1); font-size:12px; color:' + _GTV_FLAGC[n.flag] + ';"><strong>' + n.flag.toUpperCase() + '</strong>' + (n.flagReason ? ' — ' + esc(n.flagReason) : '') + '</div>' : '');
    function chips(arr){ return '<div style="display:flex; flex-wrap:wrap; gap:6px;">' + arr.map(m => {
        const fc = m.flag ? _GTV_FLAGC[m.flag] : _GTV_COLOR[m.kind];
        const tag = m.flag ? '<span style="margin-left:4px; font-size:10px; font-weight:700; color:' + fc + ';">' + m.flag.toUpperCase() + '</span>' : '';
        const nav = !!m.ref && m.kind !== 'vv';
        const arrow = nav ? '<span style="margin-left:4px; opacity:.4; font-size:12px;">↗</span>' : '';
        return '<span class="gte-pill"' + (nav ? (' data-navkey="' + esc(m.key) + '" role="button" tabindex="0" title="Open ' + esc(m.label) + '"') : '')
            + ' style="display:inline-flex; align-items:center; gap:6px; font-size:12px; padding:4px 9px; border-radius:6px; border:1px solid ' + (m.flag ? fc : 'var(--color-border-hair)') + '; background:var(--color-surface-1); color:var(--color-text-primary); cursor:' + (nav ? 'pointer' : 'default') + '; transition:background .12s, box-shadow .12s;">'
            + '<span style="width:8px; height:8px; border-radius:2px; background:' + fc + '; flex:none;"></span>' + esc(m.label) + tag + arrow + '</span>'; }).join('') + '</div>'; }
    _GTV_LAYERS.forEach(l => { if(groups[l].length){ html += '<div style="margin-top:11px;"><div style="font-size:12px; font-weight:600; color:var(--color-text-secondary); margin-bottom:6px;">' + _GTV_LNAME[l] + ' (' + groups[l].length + ')</div>' + chips(groups[l]) + '</div>'; } });
    if(n.kind === 'sys'){
        const sid = esc(String(n.id));
        const btn = 'font-size:11.5px; padding:6px 11px; border-radius:6px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary); cursor:pointer;';
        html += '<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">'
            + '<button class="gte-route" data-route="cea" data-sid="' + sid + '" style="' + btn + '">Cascading Effects Analysis \u2197</button>'
            + '<button class="gte-route" data-route="interdep" data-sid="' + sid + '" style="' + btn + '">Interdependence \u2197</button></div>';
        if(n.role === 'resource'){
            html += '<div style="margin-top:6px; font-size:11px; color:var(--color-text-tertiary);">Supporting dependency' + (n.via ? ' \u00b7 via ' + esc(n.via) : '') + (n.hops ? ' \u00b7 ' + n.hops + ' hop' + (n.hops === 1 ? '' : 's') + ' upstream' : '') + (n.path ? '<br>' + esc(n.path) : '') + '</div>';
        } else if(n.role === 'primary'){
            html += '<div style="margin-top:6px; font-size:11px; color:var(--color-text-tertiary);">Primary system \u2014 realizes this function.</div>';
        }
    }
    if(n.kind === 'func'){ html += '<button class="action-btn" id="gt-eco-report" style="margin-top:14px; background:var(--color-accent);" data-sub="' + esc(n.id) + '">📄 Generate trace report for ' + esc(n.id) + '</button>'; }
    html += '<div style="margin-top:12px; font-size:11px; color:var(--color-text-tertiary); border-top:1px dashed var(--color-border-hair); padding-top:8px;">Tip: click any pill to jump to that tree, function, requirement or HF item. Drag the ⠿ handle to move; × to close.</div>';
    eco.innerHTML = html;
    // Wire pill navigation — single-click opens the item; Enter for keyboard users.
    eco.querySelectorAll('.gte-pill[data-navkey]').forEach(el => {
        el.addEventListener('mouseenter', () => { el.style.background = 'var(--color-surface-3, #eef1f7)'; el.style.boxShadow = '0 1px 4px rgba(0,0,0,.12)'; });
        el.addEventListener('mouseleave', () => { el.style.background = 'var(--color-surface-1)'; el.style.boxShadow = 'none'; });
        const go = () => { const m = byKey[el.getAttribute('data-navkey')]; if(!m) return; const ok = (typeof _gtvNavigateTo === 'function') && _gtvNavigateTo(m); if(ok && window.showToast) showToast('Opened ' + m.label, 'info', 1600); };
        el.addEventListener('click', go);
        el.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); go(); } });
    });
    eco.querySelectorAll('.gte-route').forEach(el => {
        el.addEventListener('mouseenter', () => { el.style.background = 'var(--color-surface-3, #eef1f7)'; });
        el.addEventListener('mouseleave', () => { el.style.background = 'var(--color-surface-1)'; });
        el.addEventListener('click', () => {
            const r = el.getAttribute('data-route'), sid = el.getAttribute('data-sid');
            try {
                if(r === 'cea'){ if(typeof switchTab === 'function') switchTab('cea'); if(typeof window.ceaSelect === 'function') window.ceaSelect(sid); if(window.showToast) showToast('Opened Cascading Effects Analysis', 'info', 1600); }
                else { if(typeof switchTab === 'function') switchTab('interdep'); if(window.showToast) showToast('Opened Interdependence', 'info', 1600); }
            } catch(_){}
        });
    });
    try { _gtvEcoMakeDraggable(eco); } catch(_){}
    const rb = document.getElementById('gt-eco-report');
    if(rb) rb.addEventListener('click', function(){
        const sub = this.getAttribute('data-sub'); this.disabled = true; this.textContent = 'Generating…';
        if(window.Reports && Reports.generate){
            Reports.generate({ reportType: 'GTT', format: 'docx', functionSubId: sub })
                .then(r => { if(window.showToast) showToast('Generated ' + r.name, 'success', 3500); })
                .catch(e => { if(window.showToast) showToast(String(e && e.message || e), 'error', 4500); })
                .then(() => { rb.disabled = false; rb.textContent = '📄 Generate trace report for ' + sub; });
        }
    });
}

// Make the golden-thread ecosystem panel a movable, scrollable floating card so a
// long thread never clips. Grab the handle to drag; double-click the handle to dock
// it back into the page flow. Document-level listeners are attached once.
let _gtvEcoDragState = null;
function _gtvEcoMakeDraggable(eco){
    if(!eco) return;
    const handle = eco.querySelector('#gt-eco-drag'); if(!handle) return;
    // Float the panel into the viewport so it's immediately visible and never
    // clips — the docked in-flow position sits far below the diagram, off-screen.
    if(getComputedStyle(eco).position !== 'fixed'){
        eco.style.position = 'fixed';
        eco.style.top = '92px';
        eco.style.right = '22px';
        eco.style.left = 'auto';
        eco.style.width = '400px';
        eco.style.maxWidth = '92vw';
        eco.style.maxHeight = '78vh';
        eco.style.overflow = 'auto';
        eco.style.zIndex = '100001';
        eco.style.margin = '0';
        eco.style.boxShadow = '0 22px 60px rgba(0,0,0,.34)';
    }
    // Close — clear content and return the (empty) div to the normal flow.
    const closeBtn = eco.querySelector('#gt-eco-close');
    if(closeBtn) closeBtn.addEventListener('click', function(ev){
        ev.stopPropagation();
        ['position','top','right','left','width','maxWidth','maxHeight','overflow','zIndex','margin','boxShadow'].forEach(k => { eco.style[k] = ''; });
        eco.innerHTML = '';
    });
    // Drag by the handle (works from any current position; no transformed ancestor here).
    handle.addEventListener('mousedown', function(ev){
        if(ev.button !== 0) return;
        if(ev.target && ev.target.id === 'gt-eco-close') return;
        const r = eco.getBoundingClientRect();
        eco.style.left = r.left + 'px'; eco.style.top = r.top + 'px'; eco.style.right = 'auto';
        _gtvEcoDragState = { eco: eco, x: ev.clientX, y: ev.clientY, l: r.left, t: r.top };
        ev.preventDefault();
    });
    if(!_gtvEcoMakeDraggable._wired){
        _gtvEcoMakeDraggable._wired = true;
        document.addEventListener('mousemove', function(ev){
            const s = _gtvEcoDragState; if(!s) return;
            s.eco.style.left = (s.l + ev.clientX - s.x) + 'px';
            s.eco.style.top  = (s.t + ev.clientY - s.y) + 'px';
        });
        document.addEventListener('mouseup', function(){ _gtvEcoDragState = null; });
    }
}

function _findPageContainingLogicalId(lid) {
    for (const p of (ftaPages || [])) {
        if (!p.root || p.verifies) continue;   // skip mirror pages — they're sinks, not sources
        let found = null;
        (function walk(n) {
            if (found || !n) return;
            if ((n.logicalId != null ? n.logicalId : n.id) === lid) { found = p; return; }
            const kids = n.children || n._children;
            if (kids) kids.forEach(walk);
        })(p.root);
        if (found) return found;
    }
    return null;
}
function _findVerificationMirror(sourcePage) {
    if (!sourcePage) return null;
    return (ftaPages || []).find(p => p.verifies === sourcePage.id);
}
function _findNodeByLogicalId(root, lid) {
    if (!root) return null;
    let found = null;
    (function walk(n) {
        if (found || !n) return;
        if ((n.logicalId != null ? n.logicalId : n.id) === lid) { found = n; return; }
        const kids = n.children || n._children;
        if (kids) kids.forEach(walk);
    })(root);
    return found;
}
// Phase 57 — flight (mission) duration in hours, used to normalize a rolled-up top-event
// probability into an AC 25.1309 "average probability per flight hour" before comparing it to
// a per-flight-hour cert target (e.g. Hazardous 1e-7/hr). Mirrors _computeTopAllocatorContext's
// t_mission priority: project-defined mission duration → sum of flight-phase durations → null.
// Both sources are project-wide, so this is independent of which FTA page is active.
function _missionHoursForNormalization() {
    const md = (typeof projectConfig !== 'undefined' && projectConfig.missionDuration && projectConfig.missionDuration > 0)
        ? projectConfig.missionDuration : null;
    if (md) return md;
    let sum = 0;
    try {
        (flightPhasesData || []).forEach(p => {
            const h = (typeof parseDurationToHours === 'function') ? parseDurationToHours(p.duration, p.durationUnit) : 0;
            if (h > 0) sum += h;
        });
    } catch (e) { /* ignore */ }
    return sum > 0 ? sum : null;
}

function getAutoReqVerificationEvidence(row) {
    if (!row || !row.reqSource) return null;
    const src = row.reqSource;
    const gen = src.generator;

    // FTA basic event reqs: target λ + per-leaf mirror lookup.
    if (gen === 'fta-event' && src.sourceId) {
        // sourceId form: "{scope}:fta-event:{logicalId}"
        const parts = String(src.sourceId).split(':');
        const lidStr = parts[parts.length - 1];
        const lidNum = parseFloat(lidStr);
        const lid = isNaN(lidNum) ? lidStr : lidNum;
        const allocPage = _findPageContainingLogicalId(lid);
        if (!allocPage) return { state: 'no-mirror', label: 'No allocation page', detail: 'Could not locate the allocation tree containing this event.' };
        const mirror = _findVerificationMirror(allocPage);
        if (!mirror) return { state: 'no-mirror', label: 'No verification tree', detail: 'Create a verification mirror tree to start populating implementation values.' };
        const node = _findNodeByLogicalId(mirror.root, lid);
        if (!node) return { state: 'no-node', label: 'Unmapped', detail: 'The verification tree has no node matching this requirement\'s source. Either the leaf is missing from the mirror or it has been restructured.' };

        // Phase 61 — probability-vs-probability comparison. The allocation carries a P
        // budget (reqSource.context.pAllocated); the mirror node's computed probability —
        // via its real λ + repair model / Markov model — is the implementation evidence.
        // This is the model-agnostic boundary: allocation never sees repair physics,
        // verification owns all of it.
        const pTarget = (src.context && typeof src.context.pAllocated === 'number' && isFinite(src.context.pAllocated) && src.context.pAllocated > 0)
            ? src.context.pAllocated : null;
        if (pTarget !== null) {
            const lamEff = (typeof getEffectiveLambda === 'function') ? (getEffectiveLambda(node) || 0) : (parseFloat(node.lambda) || 0);
            if (!(lamEff > 0) && !node.markovModelId) {
                return { state: 'awaiting', label: 'Awaiting verification', detail: 'The verification tree has the matching node but no λ (or Markov model) has been entered yet. Populate the implementation value on the verification side.' };
            }
            const tExp = (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.exposureTime) ? ftaConfig.exposureTime : 1;
            const actualP = (typeof effectiveProb === 'function') ? effectiveProb(node, tExp) : -Math.expm1(-lamEff * tExp);
            const pass = actualP <= pTarget * 1.000001;   // tolerance for floating-point comparisons
            return {
                state: pass ? 'pass' : 'fail',
                label: (pass ? 'PASS' : 'FAIL') + ' · P = ' + actualP.toExponential(2),
                detail: 'Verified probability (λ + repair/Markov model over the exposure window) = ' + actualP.toExponential(2) +
                        ' · allocated budget P ≤ ' + pTarget.toExponential(2) + ' · ' +
                        (pass ? 'meets budget' : 'exceeds budget — implementation does not satisfy the apportioned allocation'),
                actual: actualP, target: pTarget
            };
        }

        // Legacy fallback — requirements generated before Phase 61 carry λ targets.
        const actual = parseFloat(node.lambda) || 0;
        if (actual <= 0) return { state: 'awaiting', label: 'Awaiting verification', detail: 'The verification tree has the matching node but no λ has been entered yet. Populate the implementation value on the verification side.' };
        const target = (src.context && src.context.lambdaOperational) || 0;
        if (target <= 0) {
            // No comparable target — show the verified value only.
            return { state: 'pass', label: 'λ = ' + actual.toExponential(2) + ' /hr', detail: 'Verification λ recorded; no comparable target on the requirement (pre-Phase-61 requirement — regenerate AutoReq for probability-based comparison).' };
        }
        const pass = actual <= target * 1.000001;   // tolerance for floating-point comparisons
        return {
            state: pass ? 'pass' : 'fail',
            label: (pass ? 'PASS' : 'FAIL') + ' · λ = ' + actual.toExponential(2),
            detail: 'Verification λ = ' + actual.toExponential(2) + ' /hr · target ≤ ' + target.toExponential(2) + ' /hr · ' + (pass ? 'meets target' : 'exceeds target — implementation does not satisfy the apportioned allocation') + ' (pre-Phase-61 λ comparison — regenerate AutoReq for the probability-based check).',
            actual, target
        };
    }

    // FHA top-event reqs: target P + top-event mirror roll-up.
    if ((gen === 'fha' || gen === 'fha-quant' || gen === 'fha-similarity') && src.context) {
        const fcId = src.context.fcId;
        if (!fcId) return null;
        // Find an allocation page whose linkedFhaId resolves to this FHA fcId.
        const allocPage = (ftaPages || []).find(p => {
            if (!p.root || p.verifies) return false;
            const linkedIds = Array.isArray(p.linkedFhaIds) ? p.linkedFhaIds : (p.linkedFhaId ? [p.linkedFhaId] : []);
            return linkedIds.some(id => {
                const isAC = String(id).startsWith('AC_');
                const realId = String(id).replace('AC_', '').replace('SYS_', '');
                const fha = isAC
                    ? (acFhaData || []).find(x => String(x.internalId) === String(realId))
                    : (typeof getAllSysFha === 'function' ? getAllSysFha() : []).find(x => String(x.internalId) === String(realId));
                return fha && fha.fcId === fcId;
            });
        });
        if (!allocPage) return null;   // No linked FTA page; can't auto-verify against a tree.
        const mirror = _findVerificationMirror(allocPage);
        if (!mirror || !mirror.root) return { state: 'no-mirror', label: 'No verification tree', detail: 'Create a verification mirror for the linked FTA to roll up top-event evidence.' };
        const actual = parseFloat(mirror.root.probability) || 0;
        if (actual <= 0) return { state: 'awaiting', label: 'Awaiting verification', detail: 'Populate leaf λ values in the verification tree; the top-event probability rolls up automatically.' };
        // Pull the target from the req's text or context (lambdaOperational not set on FHA reqs).
        // Use the cert-basis target via getSafetyTarget if severity is in context.
        let target = 0;
        if (src.context.severity && typeof getSafetyTarget === 'function') {
            const tgt = getSafetyTarget(src.context.severity);
            target = (tgt && tgt.prob) || 0;
        }
        if (target <= 0) return { state: 'pass', label: 'P = ' + actual.toExponential(2), detail: 'Top-event probability rolled up from verification tree.' };
        // Phase 57 — exposure-time normalization. `actual` is the per-flight probability rolled
        // up over the leaves' exposure windows; the cert target (getSafetyTarget) is an average
        // probability PER FLIGHT HOUR (e.g. Hazardous 1e-7/hr). Comparing the two directly
        // flatters short-exposure trees (a sub-hour P looks like it clears an hourly budget).
        // Convert the rolled-up P to a per-flight-hour rate, λ_avg = −ln(1−P)/t_flight, and
        // compare that to the target. Falls back to the raw P comparison when no mission model
        // (project mission duration or flight phases) exists — preserving prior behavior.
        const tMission = _missionHoursForNormalization();
        let actualRate = actual, normalized = false;
        if (tMission && tMission > 0) {
            actualRate = -Math.log1p(-Math.min(actual, 1 - 1e-15)) / tMission;
            normalized = true;
        }
        const pass = actualRate <= target * 1.000001;
        return {
            state: pass ? 'pass' : 'fail',
            label: (pass ? 'PASS' : 'FAIL') + ' · ' + (normalized ? 'λ = ' + actualRate.toExponential(2) + '/hr' : 'P = ' + actual.toExponential(2)),
            detail: normalized
                ? 'Top-event P = ' + actual.toExponential(2) + ' over a ' + tMission.toFixed(3) + ' hr flight → ' + actualRate.toExponential(2) + '/hr average · target ≤ ' + target.toExponential(2) + '/hr · ' + (pass ? 'meets regulation target' : 'exceeds regulation target')
                : 'Top-event P = ' + actual.toExponential(2) + ' · target ≤ ' + target.toExponential(2) + ' · ' + (pass ? 'meets regulation target' : 'exceeds regulation target') + ' (no mission model defined — compared on raw probability)',
            actual, actualRate, target, normalized, tMission
        };
    }

    return null;   // not a quantitative req we can auto-verify
}
