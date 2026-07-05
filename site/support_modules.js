// support_modules.js — v1.0 — Phase P2 batch 3: cross-cutting support layer.
// MOVED VERBATIM from safety_lab.js (byte-exact; classic script loaded BEFORE the
// monolith; all names remain global). Pure runtime function declarations — zero
// load-time code. Contents: AI-assumption panel helpers, transfer/copy-branch ops,
// DAL allocation (DALgebra), flight-phase exposure math, virtualized table render,
// switchTab + phase status, sys-assumption CRUD, subId trace helpers, FMEA table
// helpers, component-library handlers, node data updates, golden-thread report.
function _aiAsmStatusStyle(status) {
    if (status === 'Confirmed') return 'background:#dcfce7;color:#166534;';
    if (status === 'Rejected')  return 'background:#fee2e2;color:#991b1b;';
    return 'background:#fef3c7;color:#a16207;';  // Open
}
function _aiAsmFmtTime(at) {
    try {
        if (typeof at !== 'number') return '';
        const d = new Date(at);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (_) { return ''; }
}
// Filter setters (wired from the filter chips/selects). Re-render after each change.
function setAiAsmFilter(kind, val) {
    if (kind === 'analysis') _aiAsmFilter.analysis = val || 'all';
    else if (kind === 'status') _aiAsmFilter.status = val || 'all';
    try { renderAiAssumptions(); } catch (_) {}
}
// Status <select> change → persist via the store, which re-renders the tab.
function onAiAsmStatusChange(id, status) {
    try { if (window.SafetyLabAiAssumptions) window.SafetyLabAiAssumptions.setStatus(id, status); } catch (_) {}
}
// Note input change → persist via the store (no re-render, so focus is preserved).
function onAiAsmNoteChange(id, note) {
    try { if (window.SafetyLabAiAssumptions) window.SafetyLabAiAssumptions.setNote(id, note); } catch (_) {}
}
function renderAiAssumptions() {
    const host = document.getElementById('view-assumptions');
    if (!host) return;
    let rows = [];
    try { rows = (window.SafetyLabAiAssumptions && window.SafetyLabAiAssumptions.list()) || []; } catch (_) { rows = []; }
    const _e = (typeof esc === 'function') ? esc : function (x) { return String(x == null ? '' : x); };

    // Distinct analyses (label) present, for the analysis filter — preserve insertion order.
    const analysisLabels = [];
    rows.forEach(function (r) {
        const lbl = (r && r.analysisLabel) || (r && r.analysis) || 'AI analysis';
        if (analysisLabels.indexOf(lbl) === -1) analysisLabels.push(lbl);
    });
    analysisLabels.sort(function (a, b) { return String(a).localeCompare(String(b)); });

    // Apply filters.
    const filtered = rows.filter(function (r) {
        if (!r) return false;
        const lbl = r.analysisLabel || r.analysis || 'AI analysis';
        if (_aiAsmFilter.analysis !== 'all' && lbl !== _aiAsmFilter.analysis) return false;
        if (_aiAsmFilter.status !== 'all' && (r.status || 'Open') !== _aiAsmFilter.status) return false;
        return true;
    });

    // Header: title + overall count.
    let html = '<div class="header-with-export">'
        + '<h3>AI Assumptions <span style="font-size: 13px; font-weight: 500; color: var(--color-text-tertiary); margin-left: 8px;">— load-bearing premises declared by AI analyses (separate from engineer-managed assumptions)</span></h3>'
        + '</div>'
        + '<p style="margin: 0 0 12px 0; font-size: 12.5px; color: var(--color-text-secondary);">'
        + 'Logged automatically whenever you run an AI analysis. Each entry is the model\'s own stated assumption — confirm or reject it, and add a triage note. '
        + 'This ledger is independent of the engineer-managed assumptions on the Aircraft / System workspaces and never feeds the deterministic engine.'
        + '</p>';

    // Filters: analysis chips + status chips.
    const aChip = function (val, label) {
        const active = (_aiAsmFilter.analysis === val) ? ' active' : '';
        return '<span class="ar-filter-chip' + active + '" role="button" tabindex="0" onclick="setAiAsmFilter(\'analysis\',' + JSON.stringify(val).replace(/"/g, '&quot;') + ')">' + _e(label) + '</span>';
    };
    const sChip = function (val, label) {
        const active = (_aiAsmFilter.status === val) ? ' active' : '';
        return '<span class="ar-filter-chip' + active + '" role="button" tabindex="0" onclick="setAiAsmFilter(\'status\',' + JSON.stringify(val).replace(/"/g, '&quot;') + ')">' + _e(label) + '</span>';
    };
    html += '<div class="ar-filter-bar">'
        + '<span class="ar-filter-label">Analysis</span>'
        + aChip('all', 'All')
        + analysisLabels.map(function (lbl) { return aChip(lbl, lbl); }).join('')
        + '</div>';
    html += '<div class="ar-filter-bar">'
        + '<span class="ar-filter-label">Status</span>'
        + sChip('all', 'All')
        + sChip('Open', 'Open')
        + sChip('Confirmed', 'Confirmed')
        + sChip('Rejected', 'Rejected')
        + '<span style="margin-left:auto;font-size:12px;color:var(--color-text-tertiary);">'
        + filtered.length + ' of ' + rows.length + ' assumption' + (rows.length === 1 ? '' : 's')
        + '</span>'
        + '</div>';

    // Empty state — no rows at all, or none matching the filter.
    if (!rows.length) {
        html += '<div class="controls" style="text-align:center; padding: 28px 16px; color: var(--color-text-secondary);">'
            + 'No AI assumptions yet — they\'re logged automatically when you run an AI analysis.'
            + '</div>';
        host.innerHTML = html;
        return;
    }
    if (!filtered.length) {
        html += '<div class="controls" style="text-align:center; padding: 24px 16px; color: var(--color-text-secondary);">'
            + 'No assumptions match the current filters.'
            + '</div>';
        host.innerHTML = html;
        return;
    }

    // Group filtered rows by analysisLabel, preserving the sorted label order.
    const groups = {};
    filtered.forEach(function (r) {
        const lbl = r.analysisLabel || r.analysis || 'AI analysis';
        (groups[lbl] = groups[lbl] || []).push(r);
    });
    const groupOrder = Object.keys(groups).sort(function (a, b) { return String(a).localeCompare(String(b)); });

    const statusOpt = function (cur, val) {
        return '<option value="' + val + '"' + (cur === val ? ' selected' : '') + '>' + val + '</option>';
    };

    groupOrder.forEach(function (lbl) {
        const list = groups[lbl];
        html += '<div style="margin: 18px 0 6px 0; display:flex; align-items:center; gap:8px;">'
            + '<h4 style="margin:0; font-size:14px; color: var(--color-text-primary);">' + _e(lbl) + '</h4>'
            + '<span style="display:inline-block; padding:1px 9px; background: var(--color-surface-2); border-radius: var(--r-full); font-size:11px; font-weight:700; color: var(--color-text-secondary);">' + list.length + '</span>'
            + '</div>';
        html += '<div style="overflow-x:auto;"><table style="width:100%;">'
            + '<thead><tr>'
            + '<th>Assumption</th><th>Type</th><th>Scope / System</th><th>Model · Logged</th><th>Status</th><th>Note</th>'
            + '</tr></thead><tbody>';
        list.forEach(function (r) {
            const type = r.type || 'other';
            const tint = _AI_ASM_TYPE_TINT[type] || _AI_ASM_TYPE_TINT.other;
            const typeChip = '<span style="display:inline-block; padding:1px 8px; background: var(--color-surface-2); color: ' + tint + '; border:1px solid ' + tint + '33; border-radius: var(--r-full); font-size:10.5px; font-weight:700;">' + _e(type) + '</span>';
            // Scope / system cell.
            let scopeCell;
            if (r.systemName) scopeCell = '<span style="font-size:11.5px;">' + _e(r.systemName) + '</span>';
            else if (r.scope === 'aircraft') scopeCell = '<span style="font-size:11.5px; color: var(--color-text-secondary);">Aircraft</span>';
            else if (r.scope === 'system') scopeCell = '<span style="font-size:11.5px; color: var(--color-text-secondary);">System</span>';
            else scopeCell = '<span class="u-muted">—</span>';
            // Model · timestamp cell.
            const when = _aiAsmFmtTime(r.at);
            const modelTxt = r.model ? _e(r.model) : '';
            let metaCell = '<span style="font-size:11px; color: var(--color-text-tertiary); font-family: var(--font-mono);">';
            metaCell += (modelTxt || '—');
            if (when) metaCell += '<br>' + _e(when);
            metaCell += '</span>';
            const cur = r.status || 'Open';
            const sel = '<select onchange="onAiAsmStatusChange(' + JSON.stringify(r.id).replace(/"/g, '&quot;') + ', this.value)" style="' + _aiAsmStatusStyle(cur) + ' border:none; border-radius: var(--r-full); padding:3px 8px; font-size:11.5px; font-weight:700;">'
                + statusOpt(cur, 'Open') + statusOpt(cur, 'Confirmed') + statusOpt(cur, 'Rejected')
                + '</select>';
            const note = '<input type="text" value="' + _e(r.note || '') + '" placeholder="Triage note…" '
                + 'onchange="onAiAsmNoteChange(' + JSON.stringify(r.id).replace(/"/g, '&quot;') + ', this.value)" '
                + 'style="width:100%; min-width:120px; padding:4px 7px; font-size:11.5px; box-sizing:border-box;">';
            html += '<tr>'
                + '<td><span style="font-size:12.5px;">' + _e(r.text) + '</span></td>'
                + '<td>' + typeChip + '</td>'
                + '<td>' + scopeCell + '</td>'
                + '<td>' + metaCell + '</td>'
                + '<td>' + sel + '</td>'
                + '<td>' + note + '</td>'
                + '</tr>';
        });
        html += '</tbody></table></div>';
    });

    host.innerHTML = html;
}

function propagateRepeatedEventEdit(srcNode) {
    if (!srcNode || srcNode.logicalId == null) return;
    const lid = srcNode.logicalId;
    ftaPages.forEach(page => {
        (function walk(n) {
            if (!n) return;
            if (n !== srcNode && n.logicalId === lid) {
                REPEATED_EVENT_SYNCED_FIELDS.forEach(f => { n[f] = srcNode[f]; });
            }
            const kids = n.children || n._children;
            if (kids) kids.forEach(walk);
        })(page.root);
    });
}

// ==========================================
// Transfer-out — extract a gate's subtree to its own page.
// The source gate keeps its logical type, name, displayId, and logicalId; its children are
// moved to a new page whose root mirrors the gate (same logicalId so edits propagate).
// After transfer, adding children or pasting under the source gate routes to the destination root.
// calcBottomUp / getCutsets / allocateDAL resolve gate.transferOutTo just like the explicit
// TRANSFER gate type resolves gate.linkedPageId.
// ==========================================

// If `gate` is a transfer-out, return the destination page's root; else return the gate itself.
// Used by every add-child / paste / calc / cutset path so the transfer is transparent to callers.
function resolveTransferOutTarget(gate) {
    if (!gate || !gate.transferOutTo) return gate;
    const destPage = ftaPages.find(p => p.id === gate.transferOutTo);
    return (destPage && destPage.root) ? destPage.root : gate;
}

function transferOutSelectedGate() {
    if (!selectedNodeData) return alert('Select a gate first.');
    if (selectedNodeData.type !== 'gate' || selectedNodeData.gateType === 'TRANSFER') {
        return alert('Pick a logical gate (AND, OR, XOR, VOTING, INHIBIT) — the pure TRANSFER type is for cross-tree pointers.');
    }
    if (selectedNodeData.transferOutTo) return alert('This gate is already transferred out.');
    const sourceKids = selectedNodeData.children || selectedNodeData._children || [];
    if (!sourceKids.length) return alert('Add at least one child to the gate first, then Transfer Out.');

    const sourcePageId = activeFTAPageId;
    const sourceGate = selectedNodeData;
    const sourcePage = ftaPages.find(p => p.id === sourcePageId);

    // Build the destination page's root as a clone that keeps logicalId (so edit-sync works) and
    // takes the children with it. The deep-clone re-uses cloneSubtree's cross-tree path so child
    // logicalIds stay stable (no common-mode flagging across the transfer).
    const newRootId = internalIdCounter++;
    const movedChildren = sourceKids.map(c => cloneSubtree(c, /*preserveLogicalIds=*/true));
    const newRoot = {
        id: newRootId,
        logicalId: sourceGate.logicalId,
        displayId: sourceGate.displayId,
        name: sourceGate.name,
        type: 'gate',
        gateType: sourceGate.gateType,
        probability: 0,
        votingK: sourceGate.votingK,
        children: movedChildren
    };
    const newPageId = 'page-' + Date.now();
    ftaPages.push({
        id: newPageId,
        name: sourceGate.name ? `${sourceGate.name} (transferred)` : `Transferred from ${sourcePage ? sourcePage.name : 'tree'}`,
        root: newRoot,
        transferInFrom: { sourcePageId, sourceNodeId: sourceGate.id }
    });

    // Strip the source gate down to a stub that points at the new page.
    sourceGate.children = [];
    delete sourceGate._children;
    sourceGate.transferOutTo = newPageId;

    renderFTASidebar();
    calculateAllProbabilities();
    updateD3();
}

function copySelectedBranch() {
    if (!selectedNodeData) return alert('Select a node to copy.');
    // Anything is copyable — leaf, gate, or whole tree via the top event.
    // Phase 56.38 — capture an allocation snapshot on every node in the copied
    // subtree. When this branch is later pasted into a *different* fault tree,
    // the snapshot drives a conservative-merge against the destination's natural
    // allocation: result = strictest( source_snapshot, destination_would_be ).
    // For same-tree paste, the snapshot is stripped on paste (it would just be
    // the node's own current value, providing no useful constraint).
    const sourcePage = ftaPages.find(p => p.id === activeFTAPageId);
    const sourceTopProb = (sourcePage && sourcePage.root && typeof sourcePage.root.probability === 'number')
        ? sourcePage.root.probability : null;
    const subtree = JSON.parse(JSON.stringify(selectedNodeData));
    (function annotate(n) {
        if (!n) return;
        // Phase 56.40 — capture the source logicalId so the paste-review modal
        // can offer "Same physical event" (restore logicalId), "CCF group"
        // (link via β-factor), or "Independent" (current default).
        n._originalLogicalId = (n.logicalId != null) ? n.logicalId : n.id;
        n._pasteOrigin = {
            sourceTreeId: activeFTAPageId,
            sourcePageName: sourcePage ? sourcePage.name : null,
            sourceTopProb: sourceTopProb,
            snapshotProb: (typeof n.probability === 'number' && isFinite(n.probability) && n.probability > 0) ? n.probability : null,
            snapshotDAL: n.allocatedDAL || null,
            snapshotLambda: (typeof n.lambda === 'number' && isFinite(n.lambda) && n.lambda > 0) ? n.lambda : null,
            snapshotAt: Date.now()
        };
        // Strip cross-tree externalSource links — they may not resolve in the
        // destination project, and leaving them dangling would confuse the
        // allocator. The paste snapshot replaces the constraint contribution.
        if (n.externalSource && n.externalSource.targetPageId
            && n.externalSource.targetPageId !== activeFTAPageId) {
            n._pasteOrigin.strippedExternalSource = n.externalSource;
            delete n.externalSource;
        }
        const kids = n.children || n._children;
        if (kids) kids.forEach(annotate);
    })(subtree);
    nodeClipboard = {
        sourceTreeId: activeFTAPageId,
        sourcePageName: sourcePage ? sourcePage.name : null,
        subtree: subtree
    };
    updateToolbarState();
    if (typeof toast === 'function') toast('Branch copied — allocation snapshot captured for cross-tree paste.');
}

// Paste rules:
//   • If the active tree has no top event, the clipboard becomes the new root.
//   • If a non-transfer gate is selected, paste under it.
//   • Otherwise, user needs to either select a gate or clear the top event first.
function pasteAsChild() {
    if (!nodeClipboard) return alert('Clipboard is empty. Copy a node first.');
    const root = getActiveFTARoot();
    const sameTree = nodeClipboard.sourceTreeId === activeFTAPageId;
    const cloned = cloneSubtree(nodeClipboard.subtree, sameTree);

    // Phase 56.38 — same-tree paste: strip allocation snapshots. The natural
    // re-allocation produces the correct values; carrying snapshots would
    // over-constrain identical-tree clones. Cross-tree paste: KEEP the
    // snapshots so allocateTopDown's conservative-merge can run.
    (function postProcess(n, depth) {
        if (!n) return;
        if (sameTree) {
            delete n._pasteOrigin;
        } else {
            if (n._pasteOrigin) {
                n._pasteOrigin.pastedAt = Date.now();
                if (depth === 0) n._pasteOrigin.isBranchRoot = true;
            }
        }
        const kids = n.children || n._children;
        if (kids) kids.forEach(c => postProcess(c, depth + 1));
    })(cloned, 0);

    if (!root) {
        const page = ftaPages.find(p => p.id === activeFTAPageId);
        if (!page) return alert('No active fault tree.');
        page.root = cloned;
        page.name = cloned.name || page.name;
        renderFTASidebar();
    } else if (selectedNodeData && selectedNodeData.type === 'gate' && selectedNodeData.gateType !== 'TRANSFER') {
        // If selected gate is transferred out, route the paste to the destination root.
        const target = resolveTransferOutTarget(selectedNodeData);
        if (!target.children) target.children = [];
        target.children.push(cloned);
    } else {
        return alert('Select a non-transfer gate to paste under, or delete the top event first to paste as the new root.');
    }
    calculateAllProbabilities();
    updateD3();
    // Phase 56.38 — cross-tree paste: surface the merge result so the engineer
    // can review what was kept-from-source vs would-be-destination, and accept
    // or override. Defer so calculateAllProbabilities completes first.
    if (!sameTree && typeof openPasteReviewModal === 'function') {
        setTimeout(() => openPasteReviewModal(cloned), 60);
    } else if (!sameTree && typeof toast === 'function') {
        toast('Cross-tree paste: source allocations preserved where stricter than destination.');
    }
}

// Phase 56.51 — Paste Special. Forces the three-way mode-choice modal even
// when source and destination are the same tree. Useful when the engineer
// wants to convert a same-tree paste from repeat-event (the default) to an
// independent copy or a CCF group without re-pasting from scratch.
//
// Workflow: paste normally (defaults to repeat-event for same-tree), then
// open the paste review modal with the cloned subtree so the engineer can
// pick a different mode if they want.
function pasteSpecial() {
    if (!nodeClipboard) return alert('Clipboard is empty. Copy a node first.');
    const root = getActiveFTARoot();
    const sameTree = nodeClipboard.sourceTreeId === activeFTAPageId;
    // For Paste Special we force the modal to open regardless of same/cross tree.
    // To make the modal work we need to annotate the clone with _pasteOrigin
    // (even for same-tree paste) so the modal handlers can re-resolve mode.
    const cloned = cloneSubtree(nodeClipboard.subtree, true);   // preserve IDs as default
    (function postProcess(n, depth) {
        if (!n) return;
        // Ensure each node has a _pasteOrigin marker so the review modal
        // recognizes it as a paste subject.
        if (!n._pasteOrigin) {
            n._pasteOrigin = {
                sourceTreeId: nodeClipboard.sourceTreeId,
                sourcePageName: nodeClipboard.sourcePageName || '',
                snapshotProb: n.probability != null ? n.probability : null,
                snapshotDAL: n.allocatedDAL || null,
                snapshotLambda: n.lambda != null ? n.lambda : null,
                snapshotAt: Date.now(),
                pastedAt: Date.now()
            };
        }
        n._pasteOrigin.isBranchRoot = (depth === 0) ? true : !!n._pasteOrigin.isBranchRoot;
        // For Paste Special, capture the original logicalId so the modal's
        // Same-event / Independent / CCF handlers can do their thing.
        if (n._originalLogicalId == null) n._originalLogicalId = n.logicalId;
        const kids = n.children || n._children;
        if (kids) kids.forEach(c => postProcess(c, depth + 1));
    })(cloned, 0);

    if (!root) {
        const page = ftaPages.find(p => p.id === activeFTAPageId);
        if (!page) return alert('No active fault tree.');
        page.root = cloned;
        page.name = cloned.name || page.name;
        renderFTASidebar();
    } else if (selectedNodeData && selectedNodeData.type === 'gate' && selectedNodeData.gateType !== 'TRANSFER') {
        const target = resolveTransferOutTarget(selectedNodeData);
        if (!target.children) target.children = [];
        target.children.push(cloned);
    } else {
        return alert('Select a non-transfer gate to paste under, or delete the top event first to paste as the new root.');
    }
    calculateAllProbabilities();
    updateD3();
    if (typeof openPasteReviewModal === 'function') {
        setTimeout(() => openPasteReviewModal(cloned), 60);
    }
}

function clearAllAllocations() {
    function strip(node) {
        if (!node) return;
        node.allocatedDAL = null;
        node.isDALCarrier = false;
        // Independence-gated allocation flags (ARP4761A Table P2 / §5.2.3) — recomputed each sweep.
        node._dalReduced = false;
        node._dalProvisional = false;
        node._dalCompromised = false;
        node._dalCompromiseReason = null;
        node._probCompromised = false;
        node._probCompromiseReason = null;
        node._independenceReq = null;
        node._dalDerivation = null;
        node._cmaCompromised = false;
        const kids = node.children || node._children;
        if (kids) kids.forEach(strip);
    }
    ftaPages.forEach(p => strip(p.root));
}

// Build the set of AND/INHIBIT gate node-ids that an OPEN, linked CMA entry has flagged with a
// common mode. A CMA-found common mode overrides any independence claim — the DAL reduction and
// the independent-product P(top) at that gate are no longer valid (ARP4761A App M). Returns a Set
// of String(nodeId). Mirrors assurance_modules checkCMACompromise's open-finding test.
function _cmaCompromisedGateIdSet() {
    const set = new Set();
    try {
        (typeof cmaData !== 'undefined' ? cmaData : []).forEach(c => {
            if (!c || c.suggested) return;
            const open = c.status !== 'Mitigated' && c.status !== 'Closed — Accepted';
            const hasSignal = (Array.isArray(c.modes) && c.modes.length > 0) || (c.findings && String(c.findings).trim());
            if (!open || !hasSignal) return;
            (Array.isArray(c.linkedGateIds) ? c.linkedGateIds : []).forEach(key => {
                const k = String(key);
                const nid = k.slice(k.lastIndexOf(':') + 1);
                if (nid) set.add(nid);
            });
        });
    } catch (e) { /* fail open — no auto-compromise */ }
    return set;
}

// Recursive DAL allocator. Mutates `allocatedDAL` on every node walked.
// `visited` tracks page IDs across TRANSFERs to prevent infinite recursion on cycles.
// `cmaSet` (computed once at the top-level call) lets an open CMA common-mode finding drive a
// gate to 'compromised' independence — overriding the manual claim.
function allocateDAL(node, parentDal, visited, cmaSet) {
    if (!node || !parentDal) return;
    visited = visited || new Set();
    if (cmaSet === undefined) cmaSet = (typeof _cmaCompromisedGateIdSet === 'function') ? _cmaCompromisedGateIdSet() : null;
    // Phase 56.38 — conservative-merge for cross-tree paste. If the node carries
    // a snapshot DAL from its source tree (and the user hasn't overridden it),
    // the effective inherited DAL is the stricter of (propagated parent, snapshot).
    // dalMax keeps the lower letter (A < B < C ...), which is the stricter one.
    let effectiveParent = parentDal;
    if (node._pasteOrigin && node._pasteOrigin.snapshotDAL
        && !node._pasteDALOverride && !node._pasteOriginDismissed) {
        effectiveParent = dalMax(effectiveParent, node._pasteOrigin.snapshotDAL);
    }
    node.allocatedDAL = dalMax(node.allocatedDAL, effectiveParent);

    if (node.type !== 'gate') return;

    if (node.gateType === 'TRANSFER' || node.transferOutTo) {
        const linkedId = node.transferOutTo || node.linkedPageId;
        if (linkedId && !visited.has(linkedId)) {
            visited.add(linkedId);
            const linked = ftaPages.find(p => p.id === linkedId);
            if (linked && linked.root) allocateDAL(linked.root, parentDal, visited, cmaSet);
        }
        // For pure TRANSFER, the gate has no local children — return.
        // For a logical gate with transferOutTo, the local children are intentionally empty too
        // (they live on the linked page), so the same return is correct.
        return;
    }

    const kids = node.children || node._children;
    if (!kids || kids.length === 0) return;

    const isAndLike = node.gateType === 'AND' || node.gateType === 'INHIBIT';

    // Phase 56.38 — propagate the effective (snapshot-merged) DAL to children so
    // conservative-merge cascades through the pasted subtree.
    const propagateDal = node.allocatedDAL || effectiveParent;

    if (!isAndLike) {
        // OR / XOR / VOTING: any single member can cause the failure condition, so each member
        // must meet the full top DAL — no reduction (ARP4761A Table P2, single-member column).
        node._dalReduced = false; node._dalProvisional = false; node._dalCompromised = false;
        node._probCompromised = false; node._probCompromiseReason = null;
        node._independenceReq = null;
        kids.forEach(c => { c.isDALCarrier = false; c._dalDerivation = { basis: 'inherit' }; allocateDAL(c, propagateDal, visited, cmaSet); });
        return;
    }

    // AND / INHIBIT: a reduction below the top DAL is permitted ONLY with functional independence
    // between the members (ARP4754B §5.2.3 / ARP4761A Table P2 step f). Independence is a CLAIM
    // that Common Mode Analysis (Appendix M) must substantiate. node.dalIndependence:
    //   'claimed'       — reduction applied but PROVISIONAL (independence not yet CMA-substantiated)
    //   'substantiated' — reduction valid (CMA demonstrated independence)
    //   'none'          — no independence claimed -> group members, NO reduction (all at top DAL)
    //   'compromised'   — CMA/architecture found a common mode -> reduction INVALID, reverted + flagged
    // Default 'claimed' preserves the concept-tree purpose (allocate under a claim) while making the
    // assumption explicit and invalidatable. A compromised claim ALSO compromises the probability
    // allocation at this gate — the AND independent-product no longer holds — see _dalCompromised,
    // which the probability path consumes to require a common-cause (CCF) term.
    let indep = node.dalIndependence || 'claimed';
    // Auto-drive (connected thread): an OPEN, linked CMA common-mode finding overrides the claim.
    const cmaHit = !!(cmaSet && cmaSet.has(String(node.id)));
    if (cmaHit) indep = 'compromised';
    node._cmaCompromised = cmaHit;
    node._dalProvisional = (indep === 'claimed');
    node._dalCompromised = (indep === 'compromised');
    node._dalCompromiseReason = node._dalCompromised
        ? (cmaHit
            ? 'CMA identified an open common-mode coupling these members. The DAL reduction is invalid (members revert to the top DAL) and the probability AND-product requires a common-cause (β) term (ARP4761A App M).'
            : 'Functional independence between members not substantiated by CMA. DAL reduction is invalid (members revert to the top DAL) and the probability AND-product requires a common-cause term.')
        : null;

    if (indep === 'none' || indep === 'compromised') {
        // No substantiated independence -> group the members -> no DAL reduction.
        node._dalReduced = false;
        node._independenceReq = null;
        if (indep === 'compromised') {
            // Probability cascade (Gaps 1/4): once independence is lost the AND independent-product
            // P(top)=ΠPᵢ no longer holds — a common-cause term now dominates. Flag the gate's
            // probability as requiring a CCF (β) term, unless the members already carry a CCF group.
            const ccfCovered = kids.some(c => c && c.ccfGroup && (c.beta || 0) > 0);
            node._probCompromised = !ccfCovered;
            node._probCompromiseReason = ccfCovered ? null
                : 'Independence compromised: P(top) at this gate uses an independent product that now understates the true value — add a common-cause (β) term across the members (ARP4761A Appendix M).';
        } else {
            node._probCompromised = false; node._probCompromiseReason = null;
        }
        kids.forEach(c => { c.isDALCarrier = false; c._dalDerivation = { basis: (indep === 'compromised' ? 'compromised' : 'no-independence'), independence: indep }; allocateDAL(c, propagateDal, visited, cmaSet); });
        return;
    }

    node._dalReduced = true;
    node._probCompromised = false; node._probCompromiseReason = null;
    // Stage C (Gap 1) — the reduction generates a tracked independence requirement from the tree
    // logic. It must be substantiated by CMA (App M); AutoReq/CMA consume node._independenceReq.
    // Phase 56.50 — requirement text and rationale are separate fields: the
    // normative sentence carries one "shall"; the WHY (what independence means
    // here, the CMA substantiation demand, what the reduction rests on) is
    // rationale. Consumers that only read .text keep working.
    node._independenceReq = {
        text: 'Members of ' + (node.displayId || ('gate-' + node.id)) + ' shall be functionally independent.',
        rationale: 'No common-mode development error, common-cause failure, or shared-resource coupling may exist between the members. Substantiation by Common Mode Analysis (ARP4761A App M) validates the DAL reduction and the independent-product P(top) at this gate.',
        members: kids.map(function (c) { return c.displayId || c.id; }),
        status: (indep === 'substantiated') ? 'substantiated' : 'claimed'
    };
    const opt = node.dalOption || 'opt2';
    const oneDown  = dalDecrement(propagateDal, 1);   // top - 1
    const floorDal = dalDecrement(propagateDal, 2);   // Table P2 floor for additional members (Cat->C, Haz->D, clamp)
    if (opt === 'opt1') {
        // Option 1: one carrier member at the top DAL; additional members at the floor.
        const carrierId = node.dalCarrierChildId || (kids[0] && kids[0].id);
        kids.forEach(c => {
            if (c.id === carrierId) { c.isDALCarrier = true;  c._dalDerivation = { basis: 'option1', option: '1', independence: indep, role: 'top' };     allocateDAL(c, propagateDal, visited, cmaSet); }
            else                    { c.isDALCarrier = false; c._dalDerivation = { basis: 'option1', option: '1', independence: indep, role: 'reduced' }; allocateDAL(c, floorDal, visited, cmaSet); }
        });
    } else {
        // Option 2: at least TWO members one level below the top; remaining members at the floor.
        kids.forEach((c, i) => {
            c.isDALCarrier = (i < 2);
            c._dalDerivation = { basis: 'option2', option: '2', independence: indep, role: (i < 2) ? 'upper' : 'reduced' };
            allocateDAL(c, (i < 2) ? oneDown : floorDal, visited, cmaSet);
        });
    }
}

// ==========================================
// Component library for basic-event input mode "library".
// λ values are typical/conservative (failures per flight hour) drawn from MIL-HDBK-217F section refs,
// NPRD (Nonelectronic Parts Reliability Data) typical ranges, and EPRD (Electronic Parts Reliability
// Data) board-level field data. Treat as defaults — projects should refine with vendor numbers.
// Each entry's `group` controls the dropdown's <optgroup> placement.
// ==========================================
// ==========================================
// COMPONENT LIBRARY — Public-Domain Reliability Reference Library
// ALL entries below are sourced from US Government publications (DoD, FAA, NRC,
// NASA, US Navy) that are not subject to commercial copyright. Safety Lab Aero does
// NOT bundle any licensed data product. Users who hold active licenses for paid
// sources (NPRD/EPRD/217Plus from Quanterion-Relyence; Telcordia SR-332 from
// iconectiv; FIDES 2022; IEC TR 62380; Siemens SN 29500) may import their own
// component data via Library → Import Custom Library (CSV). That CSV stays in
// the user's project file and is not redistributed by Safety Lab Aero.
//
// Sources included in the bundle:
//   - MIL-HDBK-217F Notice 2   (DoD, public domain) — electronic parts
//   - MIL-HDBK-338B            (DoD, public domain) — system-level rollups
//   - MIL-HDBK-756B            (DoD, public domain) — generic LRU defaults
//   - NSWC-11 (Carderock)      (US Navy, public domain) — mechanical parts
//   - DOT-FAA-CT-83-49         (FAA, public domain) — aircraft system failure data
//   - AC 25.1309-1A Appendix   (FAA, public domain) — conservative generic rates
//   - NASA SP-2011-3421        (NASA, public domain) — PRA generic event data
//   - NUREG-CR-6928            (NRC, public domain) — valves, pumps, electrical
//
// Phase 53.50 (NPRD/EPRD/217Plus removed) + Phase 53.57 (Telcordia / FIDES /
// IEC TR 62380 / Siemens SN 29500 removed; public-domain expansion added).
//
// Each entry: { name, lambda (failures/hour at GB env, normal quality), source, group, category }
// ==========================================
// COMPONENT_LIBRARY / FAILURE_MODE_DISTRIBUTIONS / STANDARD_ENVIRONMENTS / STANDARD_QUALITIES
// — extracted to reliability_data.js (Phase 76; byte-identical, loaded BEFORE this file).

// Source → standard family — used to look up appropriate env / quality table.
// Phase 53.57/58/59 — only public-domain families are bundled. Licensed sources route to
// their BYOL stub family, where π_E and π_Q are 1.0 passthroughs (the customer's CSV
// already embeds whatever derate they chose from their own licensed copy).
function _sourceFamily(source) {
    if(!source) return 'MIL-HDBK-217F';
    if(source.indexOf('MIL-HDBK-217') === 0) return 'MIL-HDBK-217F';
    if(source.indexOf('NSWC') === 0) return 'NSWC-11';
    // Pro · BYOL routes — recognize the source string so imported CSVs land in the right family.
    if(source.indexOf('217Plus') === 0)   return '217Plus 2015';
    if(source.indexOf('FIDES') === 0)     return 'FIDES 2022';
    if(source.indexOf('Telcordia') === 0) return 'Telcordia SR-332';
    if(source.indexOf('Siemens') === 0 || source.indexOf('SN 29500') === 0) return 'Siemens SN 29500';
    if(source.indexOf('IEC TR 62380') === 0 || source.indexOf('IEC 62380') === 0) return 'IEC TR 62380';
    // All FAA / NASA / NRC / MIL-HDBK-338B / 756B / AC 25.1309 entries are taken as published.
    return 'Public Domain';
}

// Convert a basic-event's chosen input mode into a λ value (per flight hour).
// Stored on the node as `lambda` so the existing bottom-up engine keeps working unchanged.
function lambdaFromInputMode(mode, value, libraryKey, exposureTime) {
    const v = parseFloat(value) || 0;
    if (mode === 'mtbf')        return v > 0 ? 1 / v : 0;
    if (mode === 'probability') {
        const t = exposureTime || ftaConfig.exposureTime || 1;
        const p = Math.min(0.999999, Math.max(0, v));
        return p > 0 ? -Math.log1p(-p) / t : 0;
    }
    if (mode === 'library')     {
        const entry = getActiveLibrary()[libraryKey] || {};
        // Apply standard-aware π_E × π_Q (and π_T when stress prediction is on) per
        // the project's current Library tab settings. Falls back to the legacy
        // projectConfig.piQ / piE multipliers when the new fields aren't set yet.
        if (typeof effectiveLambdaForLibraryEntry === 'function' && (projectConfig.libraryStandard || projectConfig.libraryEnv)) {
            return effectiveLambdaForLibraryEntry(entry);
        }
        const baseLambda = entry.lambda || 0;
        const piQ = (projectConfig && projectConfig.piQ) || 1;
        const piE = (projectConfig && projectConfig.piE) || 1;
        return baseLambda * piQ * piE;
    }
    // Default — direct λ input.
    return Math.max(0, v);
}

// Returns { prob, dal, scope } for a hazard severity, using the active project configuration.
// `prob` is null when the regulation imposes no quantitative requirement (e.g., Negligible,
// or when the cert basis is mission-based like Part 450 / Part 107 SORA).
//
// Phase 53.55 — recognizes Part 25, Part 23 (Class I-IV), Part 27/29 rotorcraft, Part 33/35
// engines/propellers, SC-VTOL (Basic/Enhanced), Part 450 commercial space, Part 107 UAS,
// and Custom cert basis (Pro feature) where the user supplies their own severity ladder.
function getSafetyTarget(severity) {
    const reg = (projectConfig && projectConfig.regulation) || 'Part 25';
    let key;
    if (reg === 'Part 23') {
        key = 'Part 23 ' + (projectConfig.part23Class || 'IV');
    } else if (reg === 'SC-VTOL') {
        key = 'SC-VTOL ' + (projectConfig.scvtolCategory || 'Enhanced');
    } else if (reg === 'Custom') {
        // Pro-gated. If the project carries a custom cert-basis definition, read from it;
        // otherwise return null (UI will prompt the user to define the custom ladder).
        const cc = projectConfig.customCertBasis;
        if (cc && cc.probabilities && cc.dals) {
            return {
                prob: cc.probabilities[severity] ?? null,
                dal: cc.dals[severity] || null,
                scope: cc.name || 'Custom Cert Basis'
            };
        }
        return { prob: null, dal: null, scope: 'Custom (undefined)' };
    } else {
        key = reg;
    }
    const probs = PROB_TARGETS[key] || PROB_TARGETS['Part 25'];
    const dals = DAL_TARGETS[key] || DAL_TARGETS['Part 25'];
    return {
        prob: probs[severity] ?? null,
        dal: dals[severity] || null,
        scope: key
    };
}

// ----- Phase-exposure helpers (Phase 16) -----
// Convert a flight-phase duration to hours regardless of the unit the analyst chose
// ('hours' | 'hour' | 'hr' | 'mins' | 'minutes' | 'min' | 'seconds' | 'sec' | 's').
function parseDurationToHours(duration, unit) {
    const v = parseFloat(duration);
    if (!isFinite(v) || v < 0) return 0;
    const u = String(unit || '').toLowerCase().trim();
    if (u.startsWith('hr') || u.startsWith('hour')) return v;
    if (u.startsWith('min')) return v / 60;
    if (u.startsWith('sec') || u === 's') return v / 3600;
    return v;   // default: assume hours
}

// --- Mission profiles (Phase 76) ----------------------------------------------------
// A "mission profile" is a named flight-phase table. The DEFAULT profile is the canonical
// flightPhasesData (id '' / 'default'); special profiles (e.g. Long-haul, for extended-
// exposure latent-failure analysis) live in projectConfig.missionProfiles = [{id,name,phases:[]}].
// A fault tree records ftaPage.missionProfileId; its exposure-time math reads THAT profile's
// phase durations, while the linked FHA still selects WHICH phases apply. DAL + tree structure
// stay unchanged — only the exposure window (t) shifts, which is exactly what moves latent
// (dormant) contributions over a longer flight.
function _missionProfiles() {
    if (typeof projectConfig !== 'object' || !projectConfig) return [];
    if (!Array.isArray(projectConfig.missionProfiles)) projectConfig.missionProfiles = [];
    return projectConfig.missionProfiles;
}
function _missionProfilePhases(profileId) {
    if (!profileId || profileId === 'default') return flightPhasesData || [];
    const p = _missionProfiles().find(x => String(x.id) === String(profileId));
    return (p && Array.isArray(p.phases)) ? p.phases : (flightPhasesData || []);
}
function _missionProfileName(profileId) {
    if (!profileId || profileId === 'default') return 'Standard (default)';
    const p = _missionProfiles().find(x => String(x.id) === String(profileId));
    return p ? (p.name || 'Mission profile') : 'Standard (default)';
}
// Phase table of the fault tree currently being quantified (the active toolbar tree). Every
// FTA-side exposure read routes through here so a tree's selected profile drives its own t.
function _activeTreeMissionPhases() {
    return _missionProfilePhases((typeof ftaConfig === 'object' && ftaConfig) ? ftaConfig.missionProfileId : '');
}

function getTotalFlightDuration(phaseTable) {
    const tbl = phaseTable || flightPhasesData || [];
    return tbl.reduce((acc, p) => acc + parseDurationToHours(p.duration, p.durationUnit), 0);
}

// Parse the FHA "phases" field into an array of phase names. Accepts comma or semicolon
// separators, normalizes whitespace, and drops empties. Case-insensitive when matching.
function parsePhaseList(phasesStr) {
    if (!phasesStr) return [];
    return String(phasesStr)
        .split(/[,;\/|]/)
        .map(s => s.trim())
        .filter(Boolean);
}

// Compute the exposure ratio r = (sum of selected phase durations) / (total flight duration).
// Returns a structured result so callers can show both halves of the ratio + the matched phases.
// If the FHA references no phases (or phasesStr is empty), returns r=1 (no normalization).
// If the phases listed don't match any entry in flightPhasesData, returns r=1 with matched=[]
// — failing open is safer than silently rescaling the target.
function getPhaseExposureRatio(phasesStr, phaseTable) {
    const tbl = phaseTable || flightPhasesData || [];
    const total = getTotalFlightDuration(tbl);
    const list = parsePhaseList(phasesStr);
    if (!list.length || total <= 0) {
        return { ratio: 1, exposedHours: total, totalHours: total, matchedPhases: [], unmatchedPhases: list };
    }
    const matched = [];
    const unmatched = [];
    let exposed = 0;
    const lcMap = new Map();
    (tbl || []).forEach(p => lcMap.set(String(p.phase || '').toLowerCase(), p));
    list.forEach(name => {
        const p = lcMap.get(name.toLowerCase());
        if (p) {
            matched.push(p.phase);
            exposed += parseDurationToHours(p.duration, p.durationUnit);
        } else {
            unmatched.push(name);
        }
    });
    // If nothing matched, leave r = 1 (fail-open) — caller can still show "unmatched phases" warning.
    if (!matched.length) {
        return { ratio: 1, exposedHours: total, totalHours: total, matchedPhases: [], unmatchedPhases: unmatched };
    }
    const ratio = Math.max(1e-6, Math.min(1, exposed / total));
    return { ratio, exposedHours: exposed, totalHours: total, matchedPhases: matched, unmatchedPhases: unmatched };
}

// Apply phase-exposure normalization on top of the regulation/severity safety target.
// Returns three useful flavors of the rate:
//   • prob (headline) — the FAR 1309 per-flight-hour averaged target (unchanged from getSafetyTarget)
//   • phaseActiveProb = prob / r — the allowable rate during exposure phases only
//   • missionProb     = prob × totalHours — the allowable per-flight probability
function getNormalizedSafetyTarget(severity, phasesStr) {
    const t = getSafetyTarget(severity);
    const exp = getPhaseExposureRatio(phasesStr);
    return Object.assign({}, t, {
        exposureRatio: exp.ratio,
        exposedHours:  exp.exposedHours,
        totalHours:    exp.totalHours,
        matchedPhases: exp.matchedPhases,
        unmatchedPhases: exp.unmatchedPhases,
        phaseActiveProb: t.prob == null ? null : (t.prob / exp.ratio),
        missionProb:     t.prob == null ? null : (t.prob * exp.totalHours)
    });
}

// Pretty key used in summaries and FTA badges (e.g. "Part 23 Class IV").
function projectScopeLabel() {
    return projectConfig.regulation === 'Part 23'
        ? `Part 23 Class ${projectConfig.part23Class || 'IV'}`
        : 'Part 25 Transport';
}

// Set the AC 1309 tab dropdowns from current state and render the summary line + applicable table.
function renderProjectConfigUI() {
    const regSel = document.getElementById('proj-regulation');
    const classSel = document.getElementById('proj-part23-class');
    const classContainer = document.getElementById('proj-class-container');
    const scvtolContainer = document.getElementById('proj-scvtol-container');
    const scvtolSel = document.getElementById('proj-scvtol-category');
    const customContainer = document.getElementById('proj-custom-container');
    const customContent = document.getElementById('proj-custom-content');
    const missionNote = document.getElementById('proj-mission-based-note');
    const summary = document.getElementById('proj-config-summary');
    if (!regSel || !classSel) return;
    regSel.value = projectConfig.regulation;
    classSel.value = projectConfig.part23Class || 'IV';
    if (scvtolSel) scvtolSel.value = projectConfig.scvtolCategory || 'Enhanced';
    // Phase 53.55 — show the right sub-category selector per cert basis.
    const reg = projectConfig.regulation;
    if (classContainer)  classContainer.style.display  = reg === 'Part 23'  ? 'block' : 'none';
    if (scvtolContainer) scvtolContainer.style.display = reg === 'SC-VTOL'  ? 'block' : 'none';
    if (customContainer) customContainer.style.display = reg === 'Custom'   ? 'block' : 'none';
    if (customContent && reg === 'Custom') {
        customContent.innerHTML = _renderCustomCertBasisEditor();
    }
    // Mission-based / SORA-based methodology banner for Part 450 + Part 107.
    if (missionNote) {
        if (reg === 'Part 450') {
            missionNote.style.display = 'block';
            missionNote.innerHTML = '⚠ <strong>Part 450 is mission-based</strong> — public-risk metrics (E<sub>c</sub> ≤ 1×10⁻⁴/mission, debris-hazard P ≤ 1×10⁻⁶) rather than per-flight-hour. The per-FH severity ladder is hidden. Safety analysis on vehicle-internal systems (FTS, avionics, propulsion) still uses Part 25-style FTA/FMEA, but mission-level QRA (debris, casualty area) is out of scope for this build. The MoC catalog shows the relevant Part 450 paragraphs.';
        } else if (reg === 'Part 107') {
            missionNote.style.display = 'block';
            missionNote.innerHTML = '⚠ <strong>Part 107 / UAS uses SORA methodology</strong> — risk-class-driven (SAIL 1-6 per JARUS SORA 2.5) rather than per-flight-hour severity. The per-FH severity ladder is hidden. System-level safety analysis still applies; the MoC catalog shows the relevant Part 107 and SORA paragraphs.';
        } else {
            missionNote.style.display = 'none';
        }
    }
    // Phase 35 — mission-duration input. null/0 → empty (placeholder shows "auto").
    const md = document.getElementById('proj-mission-duration');
    if (md) md.value = (projectConfig.missionDuration && projectConfig.missionDuration > 0) ? projectConfig.missionDuration : '';
    if (summary) {
        const cat = getSafetyTarget('Catastrophic');
        const targetText = cat.prob ? '&lt;' + cat.prob.toExponential(0) + ' /fh' : 'see methodology note above';
        summary.innerHTML = '<strong>Active basis:</strong> ' + esc(certBasisDisplayLabel()) + '  &nbsp;|&nbsp;  <strong>Catastrophic target:</strong> ' + targetText + '  &nbsp;|&nbsp;  <strong>DAL ' + esc(cat.dal || '—') + '</strong> ' + (cat.dal ? 'required for Cat-level top events.' : '(not applicable to this cert basis).');
    }
    renderProbTable();
}

// Phase 53.55 — Custom cert basis editor (Pro). Renders the four severity-target inputs and
// DAL pickers; commits to projectConfig.customCertBasis on every edit.
function _renderCustomCertBasisEditor() {
    const cc = projectConfig.customCertBasis || { name: '', probabilities: {}, dals: {}, notes: '' };
    const SEV = ['Catastrophic', 'Hazardous', 'Major', 'Minor'];
    const DAL_OPTS = ['A','B','C','D','E'];
    const probRows = SEV.map(s => {
        const v = cc.probabilities && cc.probabilities[s] != null ? cc.probabilities[s] : '';
        const dalV = (cc.dals && cc.dals[s]) || 'A';
        const dalOpts = DAL_OPTS.map(d => '<option value="' + d + '"' + (d === dalV ? ' selected' : '') + '>' + d + '</option>').join('');
        return '<tr>'
            + '<td class="u-pad-sm"><strong>' + s + '</strong></td>'
            + '<td class="u-pad-sm"><input type="number" step="1e-10" value="' + esc(String(v)) + '" oninput="onCustomCertBasisFieldChange(\'prob\', \'' + s + '\', this.value)" style="width: 120px; font-family: var(--font-mono);"></td>'
            + '<td class="u-pad-sm"><select onchange="onCustomCertBasisFieldChange(\'dal\', \'' + s + '\', this.value)" style="width: 80px;">' + dalOpts + '</select></td>'
            + '</tr>';
    }).join('');
    return ''
        + '<div style="display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; background: var(--color-surface-1); border: 1px solid var(--color-border-hair); border-radius: var(--r-md);">'
        +   '<input type="text" placeholder="e.g. SC-25-001-SC (Joby G1)" value="' + esc(cc.name || '') + '" oninput="onCustomCertBasisFieldChange(\'name\', null, this.value)" style="font-weight: 600;">'
        +   '<table style="width: 100%; font-size: 12px;">'
        +     '<thead><tr><th class="u-text-left u-pad-sm">Severity</th><th class="u-text-left u-pad-sm">P-target (/FH)</th><th class="u-text-left u-pad-sm">Required DAL</th></tr></thead>'
        +     '<tbody>' + probRows + '</tbody>'
        +   '</table>'
        +   '<textarea placeholder="Notes (Special Condition number, issue paper reference, applicable AC, agreed-with-FAA caveats)" oninput="onCustomCertBasisFieldChange(\'notes\', null, this.value)" rows="2" style="font-size: 12px; font-family: var(--font-system);">' + esc(cc.notes || '') + '</textarea>'
        + '</div>';
}
function onCustomCertBasisFieldChange(field, severity, value) {
    if (!projectConfig.customCertBasis) projectConfig.customCertBasis = { name: '', probabilities: {}, dals: {}, notes: '' };
    const cc = projectConfig.customCertBasis;
    if (field === 'name')   cc.name = value;
    else if (field === 'notes')  cc.notes = value;
    else if (field === 'prob')   cc.probabilities[severity] = parseFloat(value) || null;
    else if (field === 'dal')    cc.dals[severity] = value;
    if (typeof renderProbTable === 'function') renderProbTable();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
}

function _virtualizeEnabled() { try { if (/[?&]virtualize=1/.test(location.search)) return true; return localStorage.getItem('SLA_VIRTUALIZE') === '1'; } catch (_) { return false; } }
// Pure: which row slice is visible + the spacer pad heights for the off-screen rows. (Testable.)
function _visibleWindow(scrollTop, viewportH, rowH, total, buffer) {
    buffer = buffer || 0;
    const start = Math.max(0, Math.floor((scrollTop || 0) / rowH) - buffer);
    const end = Math.min(total, start + Math.ceil((viewportH || 0) / rowH) + buffer * 2);
    return { start: start, end: end, topPad: start * rowH, botPad: Math.max(0, total - end) * rowH };
}
function _virtualRender(tbody, total, rowHtmlAt) {
    const viewport = tbody.closest('div') || tbody.parentElement;
    if (!viewport) { let h = ''; for (let i = 0; i < total; i++) h += rowHtmlAt(i); tbody.innerHTML = h; return; }
    viewport.style.overflowY = 'auto';
    if (!viewport.style.maxHeight) viewport.style.maxHeight = '70vh';
    try { const thead = tbody.closest('table') && tbody.closest('table').querySelector('thead'); if (thead) thead.querySelectorAll('th').forEach(function (th) { th.style.position = 'sticky'; th.style.top = '0'; th.style.zIndex = '1'; }); } catch (_) {}
    function paint() {
        const w = _visibleWindow(viewport.scrollTop, viewport.clientHeight || 600, _VIRTUAL_ROW_H, total, 8);
        let html = '';
        if (w.topPad > 0) html += '<tr style="height:' + w.topPad + 'px"><td colspan="99" style="padding:0;border:none;"></td></tr>';
        for (let i = w.start; i < w.end; i++) html += rowHtmlAt(i);
        if (w.botPad > 0) html += '<tr style="height:' + w.botPad + 'px"><td colspan="99" style="padding:0;border:none;"></td></tr>';
        tbody.innerHTML = html;
    }
    if (tbody._vScroll) { try { viewport.removeEventListener('scroll', tbody._vScroll); } catch (_) {} }
    var raf = null;
    tbody._vScroll = function () { if (raf) return; raf = requestAnimationFrame(function () { raf = null; paint(); }); };
    viewport.addEventListener('scroll', tbody._vScroll);
    paint();
}

// ── #46 — surgical single-row updates (opt-in; default off → full re-render unchanged) ──────────
// Patch only the changed <tr> on edit/add/delete instead of rebuilding the whole <tbody>. Falls back
// to a full render whenever it isn't provably safe — the merged-cell decomposition table, windowed
// mode, or any active filter/sort (detected when the shown-row count ≠ the data-array length).
// Enable with ?surgical=1 or localStorage SLA_SURGICAL='1'. Tune interactions in-browser.
function _crudSurgicalEnabled() { try { if (/[?&]surgical=1/.test(location.search)) return true; return localStorage.getItem('SLA_SURGICAL') === '1'; } catch (_) { return false; } }
function _cssEsc(s) { try { return (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(String(s)) : String(s).replace(/["\\]/g, '\\$&'); } catch (_) { return String(s); } }
// Pure: is a single-row DOM patch safe, or must we fall back to a full re-render? (Testable.)
function _surgicalEligible(enabled, hasRenderRows, windowed, shown, arrLen, op) {
    if (!enabled || hasRenderRows || windowed) return false;   // merged-cell table & windowed mode → full render
    if (op === 'add') return shown === arrLen - 1;             // DOM had exactly the prior rows (no filter/sort active)
    if (op === 'delete') return shown === arrLen + 1;          // DOM still has the to-be-removed row
    return shown === arrLen;                                    // edit
}

// #274 — discoverability: action-oriented empty state for every makeCRUD table, so a new
// project shows the three ways forward (add / import / ANEM) + the ⌘K palette, instead of a
// bare empty grid that leaves a first-time user stuck.
function _crudEmptyRowHtml() {
    return '<tr class="crud-empty-row"><td colspan="99">'
        + '<div class="crud-empty">'
        +   '<div class="crud-empty-icon" aria-hidden="true">✦</div>'
        +   '<div class="crud-empty-title">Nothing here yet</div>'
        +   '<div class="crud-empty-sub">Add one with the form above &nbsp;·&nbsp; import via <b>Data Actions</b> &nbsp;·&nbsp; or open <b>✦ ANEM</b> to draft &amp; edit straight from your project.</div>'
        +   '<div class="crud-empty-tip">Tip — press <kbd>⌘K</kbd> <span style="opacity:.6">(Ctrl K)</span> to jump to any view.</div>'
        + '</div></td></tr>';
}
function makeCRUD(config) {
    const { key, store, formIds, submitBtn, cancelBtn, defaultText, tableBody,
            renderCells, renderRows, afterChange, validate, transform, storePrecondition,
            editFnName, deleteFnName, onEdit } = config;

    // Mirror into formConfigs so cancelEdit/setEditMode keep working unchanged.
    formConfigs[key] = { submitBtn, cancelBtn, defaultText, fields: Object.values(formIds) };

    function readForm() {
        const data = {};
        for (const [k, id] of Object.entries(formIds)) {
            const el = document.getElementById(id);
            if (el) data[k] = el.value;
        }
        return data;
    }
    function writeForm(data) {
        for (const [k, id] of Object.entries(formIds)) {
            const el = document.getElementById(id);
            if (el) el.value = data[k] == null ? '' : data[k];
        }
    }
    function submit() {
        if (storePrecondition) {
            const err = storePrecondition();
            if (err) return alert(err);
        }
        const arr = store(); if (!arr) return;
        const editId = editStates[key];
        let data = { internalId: editId || newRowId(), ...readForm() };
        if (transform) data = transform(data);
        if (!editId) data = _slAutoNumber(key, data); // auto-fill blank IDs on create only
        if (validate) {
            const err = validate(data);
            if (err) return alert(err);
        }
        if (editId) {
            const idx = arr.findIndex(i => i.internalId === editId);
            if (idx >= 0) arr[idx] = data; else arr.push(data);
        } else {
            arr.push(data);
        }
        if (afterChange) afterChange();
        cancelEdit(key);
        // #46 — surgical single-row patch (opt-in; falls back to full render whenever unsafe).
        try {
            const tbody = document.getElementById(tableBody);
            if (tbody && _crudSurgicalEnabled()) {
                const windowed = _virtualizeEnabled() && arr.length > _VIRTUALIZE_MIN_ROWS;
                const shown = tbody.querySelectorAll('tr[data-iid]').length;
                const op = editId ? 'edit' : 'add';
                if (_surgicalEligible(true, typeof renderRows === 'function', windowed, shown, arr.length, op)) {
                    if (op === 'add') { tbody.insertAdjacentHTML('beforeend', rowTr(data)); return; }
                    const tr = tbody.querySelector('tr[data-iid="' + _cssEsc(editId) + '"]');
                    if (tr) { tr.outerHTML = rowTr(data); return; }
                }
            }
        } catch (_) {}
        render();
    }
    function edit(internalId) {
        const arr = store(); if (!arr) return;
        const item = arr.find(x => x.internalId === internalId);
        if (!item) return;
        writeForm(item);
        editStates[key] = internalId;
        setEditMode(key);
        if (onEdit) onEdit(item);
        window.scrollTo(0, 0);
    }
    function deleteItem(internalId) {
        const arr = store(); if (!arr) return;
        const idx = arr.findIndex(x => x.internalId === internalId);
        if (idx >= 0) arr.splice(idx, 1);
        if (afterChange) afterChange();
        // #46 — surgical row removal (opt-in; falls back to full render when unsafe).
        try {
            const tbody = document.getElementById(tableBody);
            if (tbody && _crudSurgicalEnabled()) {
                const windowed = _virtualizeEnabled() && arr.length > _VIRTUALIZE_MIN_ROWS;
                const shown = tbody.querySelectorAll('tr[data-iid]').length;
                if (_surgicalEligible(true, typeof renderRows === 'function', windowed, shown, arr.length, 'delete')) {
                    const tr = tbody.querySelector('tr[data-iid="' + _cssEsc(internalId) + '"]');
                    if (tr) { tr.remove(); return; }
                }
            }
        } catch (_) {}
        render();
    }
    // Single source for a standard row's <tr> (carries data-iid so surgical patches can find it).
    function rowTr(row) {
        const kind = _CRUD_KEY_TO_KIND[key];
        const sysId = (kind && kind.indexOf('sys') === 0) ? (typeof activeSystemId !== 'undefined' ? activeSystemId : null) : null;
        const review = kind ? reviewCellHtml(kind, row.internalId, sysId) : '';
        return '<tr data-iid="' + esc(String(row.internalId)) + '">' + renderCells(row, rowActionsHTML(editFnName, deleteFnName, row.internalId)) + review + '</tr>';
    }
    function render() {
        const tbody = document.getElementById(tableBody); if (!tbody) return;
        const arr = store();
        if (!arr) { tbody.innerHTML = ''; return; }
        if (!arr.length) { tbody.innerHTML = _crudEmptyRowHtml(); return; }   // #274 — action-oriented empty state
        // Phase 53.73 — auto-append the Review column (comment trigger + approval control)
        // for kinds participating in the Process Strip rollup or otherwise needing reviewer
        // sign-off. The matching `<th>Review</th>` lives in the table's <thead> in HTML.
        const kind = _CRUD_KEY_TO_KIND[key];
        const sysId = (kind && kind.indexOf('sys') === 0) ? (typeof activeSystemId !== 'undefined' ? activeSystemId : null) : null;
        const actionsFor = (internalId) => rowActionsHTML(editFnName, deleteFnName, internalId);
        const reviewFor = (internalId) => kind ? reviewCellHtml(kind, internalId, sysId) : '';
        // Optional group-aware renderer. The decomposition table uses this to merge a
        // function's identity (ID / name / definition) across all of its sub-functions
        // via rowspan — Excel-style merged cells. Everything else falls back to one <tr>/row.
        if (typeof renderRows === 'function') {
            tbody.innerHTML = renderRows(arr, { actionsFor, reviewFor, renderCells });
            return;
        }
        // #15b — windowed virtualization for large standard tables (opt-in; default = full render).
        const rowHtmlAt = (i) => rowTr(arr[i]);   // #46 — single source; carries data-iid for surgical patches
        if (_virtualizeEnabled() && arr.length > _VIRTUALIZE_MIN_ROWS) {
            _virtualRender(tbody, arr.length, rowHtmlAt);
        } else {
            let html = '';
            for (let i = 0; i < arr.length; i++) html += rowHtmlAt(i);
            tbody.innerHTML = html;
        }
    }
    return { submit, edit, deleteItem, render };
}

function toggleThemeEngine() {
    const body = document.body;
    const sw = document.getElementById('theme-switch');
    const dark = sw ? sw.checked : !body.classList.contains('theme-dark');
    body.classList.toggle('theme-dark', dark);
    body.classList.toggle('theme-light', !dark);
    if(sw) sw.checked = dark;
    try { localStorage.setItem('safetyLab.theme', dark ? 'dark' : 'light'); } catch(e){}
    if(typeof d3 !== 'undefined' && typeof updateD3 === 'function') updateD3();
}
// Initialize the theme switch state on first paint based on the persisted preference.
function initThemeFromStorage() {
    let pref = 'light';
    try { pref = localStorage.getItem('safetyLab.theme') || 'light'; } catch(e){}
    const body = document.body;
    body.classList.toggle('theme-dark', pref === 'dark');
    body.classList.toggle('theme-light', pref !== 'dark');
    const sw = document.getElementById('theme-switch');
    if(sw) sw.checked = (pref === 'dark');
}

function cancelEdit(module) {
    editStates[module] = null; const config = formConfigs[module];
    if(config) {
        config.fields.forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
        if(config.checkboxes) { document.querySelectorAll(`#${config.checkboxes} input`).forEach(cb => cb.checked = false); }
        document.getElementById(config.submitBtn).innerText = config.defaultText; document.getElementById(config.cancelBtn).style.display = 'none';
    }
    // Module-specific cleanup: clear FHA assumption chips when their forms reset.
    if (module === 'acFha') renderFhaAsmChips('ac', []);
    if (module === 'sysFha') renderFhaAsmChips('sys', []);
}
function setEditMode(module) { const config = formConfigs[module]; if(config) { document.getElementById(config.submitBtn).innerText = "Update Entry"; document.getElementById(config.cancelBtn).style.display = 'inline-block'; } }

// Phase 53 — project name + save folder UI plumbing.
function _refreshProjectNameUI() {
    const chip = document.getElementById('project-name-chip');
    if (chip) {
        const label = chip.querySelector('.project-name-chip-label');
        if (label) label.textContent = projectName || 'Untitled Project';
    }
    // Also reflect in document title so the browser tab labels the project.
    try { document.title = (projectName || 'Untitled Project') + ' — Safety Lab Aero'; } catch(_) {}
}

// Phase 71 — async modal prompt. Replaces window.prompt(), which Electron's renderer
// does NOT implement (it silently returns null, so prompt-based flows like project rename
// no-op in the desktop app). Resolves to the entered string, or null if canceled.
// #43 — slPrompt now delegates to the single _slDialog engine (defined later; hoisted at runtime),
// so prompts and confirms share one standardized, styled, accessible dialog.
function slPrompt(message, def, opts) {
    opts = opts || {};
    return _slDialog({ type: 'prompt', message: message, def: (def != null ? String(def) : ''), title: opts.title, okText: opts.okText, cancelText: opts.cancelText });
}

function switchTab(tabId) {
    try {
        // Phase 63.2 — Interdependence / Resources / MAC live INSIDE the PASA workspace.
        // Every legacy caller (classic nav, cockpit deep links, command palette) redirects.
        if (tabId === 'interdep' || tabId === 'resources' || tabId === 'mac') {
            const sub = tabId === 'interdep' ? 'interdep' : tabId === 'resources' ? 'resources' : 'mac';
            switchTab('pasa');
            try { pasaSub(sub); } catch (_) {}
            return;
        }
        // Phase 68 — FMEA is per-system now; there is no top-level FMEA tab. Any legacy
        // navigation to it (search jump, command palette, restored last-tab) lands on the
        // System Directory with a hint, so the user opens a System Folder to reach its FMEA.
        if (tabId === 'fmea') {
            if (typeof showToast === 'function') showToast('FMEA now lives inside each System Folder — open a system to view its FMEA.', 'info', 4200);
            tabId = 'sys-dir';
        }
        // Traceability Graph retired — the Golden Thread (Sankey) supersedes it. Any legacy
        // navigation (restored last-tab, command palette, stray link) lands on the Sankey so
        // nobody hits a dead view.
        if (tabId === 'graph') { tabId = 'golden-thread'; }
        const tabs = ['dashboard', 'defs', 'ac-func', 'ac-fcim', 'phases', 'ac-fha', 'ac-req', 'ac-asm', 'items', 'ai', 'assumptions', 'sys-dir', 'sys-workspace', 'pra', 'zsa', 'cma', 'routing', 'resources', 'fmea', 'fta', 'library', 'markov', 'validation', 'trace', 'golden-thread', 'moc', 'baselines', 'cm', 'review', 'reqs-repo', 'arp-process', 'vv-status', 'dal-ref', 'ccmr', 'fmes', 'ipledger', 'pasa', 'asa', 'spp'];
        // Phase 53.45 — remember the last tab so reloads land here, not back on dashboard.
        try { if (tabs.indexOf(tabId) >= 0) localStorage.setItem(_UI_LAST_TAB_KEY, tabId); } catch(_) {}
        try { window._slCurrentTab = tabId; } catch(_) {}
        tabs.forEach(t => {
            let viewDiv = document.getElementById(`view-${t}`); 
            let btn = document.getElementById(`tab-${t}`);
            if(viewDiv) viewDiv.style.display = (t === tabId) ? 'block' : 'none';
            if(btn) { if(t === tabId) btn.classList.add('nav-item-active'); else btn.classList.remove('nav-item-active'); }
            // Phase 75 — mirror active state onto the sidebar item (additive; pure layout).
            let sbtn = document.getElementById(`snav-${t}`);
            if(sbtn) sbtn.classList.toggle('snav-active', t === tabId);
        });
        try { if (typeof _renderSidebarContext === 'function') _renderSidebarContext(); } catch(_) {}
        // Workspace governance — track the active area + show a read-only banner if it's locked by someone else.
        try {
            _wsActiveArea = (tabId === 'sys-workspace' && typeof activeSystemId !== 'undefined' && activeSystemId) ? { scope:'system', sysId:activeSystemId } : { scope:'ac', sysId:'' };
            _wsApplyReadonlyNotice(_wsActiveArea.scope, _wsActiveArea.sysId);
        } catch (_) {}
        // Phase 57 — update the ARP 4761A workflow stepper to the active stage.
        try { if (typeof _renderWorkflowStepper === 'function') _renderWorkflowStepper(tabId); } catch (_) {}

        if (tabId === 'dashboard') updateDashboard();
        if (tabId === 'defs') renderProjectConfigUI();
        if (tabId === 'library') renderLibraryTable();
        if (tabId === 'markov') renderMarkovModels();
        if (tabId === 'validation') renderValidationTable();
        if (tabId === 'pra')  { populatePraAffectedZonesDropdown([]); refreshPraExposedFunctions(); _populatePraModelTypeDropdown(); _renderPraModelForm('', {}); }
        if (tabId === 'zsa')  { populateZsaHousedFunctionsDropdown([]); }
        if (tabId === 'cma')  { populateCmaModesCheckboxes([]); renderCMA(); }
        if (tabId === 'routing') { _populateRoutingMultiselects({}); renderRouting(); }
        if (tabId === 'resources') { _populateResourceMultiselects({}); renderResources(); }
        if (tabId === 'ac-fcim') populateDropdowns('ac-fcim-subfunc', acFunctionsData, 'subId', 'subName');
        if (tabId === 'ac-fha') { populateDropdowns('ac-fha-subfunc', acFunctionsData, 'subId', 'subName'); populateDropdowns('ac-fha-fcid', acExtractedFCs, 'id', 'id', true); populateFhaAsmDropdown('ac'); }
        if (tabId === 'ac-req') { populateDropdowns('ac-req-trace', acFunctionsData, 'subId', 'subName'); _populateReqParentPicker('ac'); }
        if (tabId === 'phases') renderFlightPhases(); 
        if (tabId === 'sys-dir') renderSystemDirectory();
        if (tabId === 'items') { _populateItemOwningSystem(); _populateItemZone(''); _renderItemTraceList([]); renderItems(); }
        if (tabId === 'ai') { try { renderAiAssistant(); } catch(e){ console.warn('renderAiAssistant:', e); } }
        if (tabId === 'assumptions') { try { renderAiAssumptions(); } catch(e){ console.warn('renderAiAssumptions:', e); } }
        if (tabId === 'fmea') { updateFMEABasicEvents(); renderFMEA(); }
        if (tabId === 'trace') { generateTraceMatrix(); try { renderInterfaces(); } catch(e) {} }
        if (tabId === 'reqs-repo') renderRequirementsRepository();
        if (tabId === 'arp-process') { try { renderArpProcessPage(); } catch(e) { console.warn('renderArpProcessPage:', e); } }
        if (tabId === 'vv-status')   { try { renderVVStatusPage();   } catch(e) { console.warn('renderVVStatusPage:', e); } }
        if (tabId === 'dal-ref')     { try { renderDalReferencePage(); } catch(e) { console.warn('renderDalReferencePage:', e); } }
        if (tabId === 'ccmr')        { try { renderCcmrPage(); } catch(e) { console.warn('renderCcmrPage:', e); } }
        if (tabId === 'fmes')        { try { renderFmesPage(); } catch(e) { console.warn('renderFmesPage:', e); } }
        if (tabId === 'ipledger')    { try { renderIpLedgerPage(); } catch(e) { console.warn('renderIpLedgerPage:', e); } }
        if (tabId === 'spp')         { try { renderSppPage(); } catch(e) { console.warn('renderSppPage:', e); } }
        if (tabId === 'pasa')        { try { pasaSub('cockpit'); } catch(e) { console.warn('pasa workspace:', e); } }
        if (tabId === 'asa')         { try { renderCockpitPage('ASA'); } catch(e) { console.warn('renderCockpitPage ASA:', e); } }
        if (tabId === 'golden-thread') { try { renderGoldenThreadView(); } catch(e) { console.warn('renderGoldenThreadView:', e); } try { renderInterfaces(); } catch(e) {} }
        if (tabId === 'moc') { try { renderMoCCatalogue(); renderMoCMatrix(); } catch(e) {} }
        if (tabId === 'baselines') { try { renderBaselines(); } catch(e) {} }
        if (tabId === 'cm') { try { if (window.SafetyLabCM && SafetyLabCM.render) SafetyLabCM.render(document.getElementById('view-cm')); } catch(e) {} }

        // Phase 53.7 — Aircraft Safety workspace nav: show the shared header + highlight
        // the active sub-tab when one of the ac-* views is on screen, hide otherwise.
        try { _syncAcWorkspaceNav(tabId); } catch(e) { console.warn('_syncAcWorkspaceNav:', e); }
        if (tabId === 'review') {
            // Sync the reviewer-name input with whatever's in localStorage.
            const nameInput = document.getElementById('review-reviewer-name');
            if (nameInput) nameInput.value = Review.getReviewerName();
            try { renderReviewSummary(); } catch(e) { console.warn('renderReviewSummary:', e); }
        }
        if (tabId === 'fta') {
            // Restore the active page's FHA link (dropdown + ftaConfig) BEFORE building the panel,
            // so a page reload with FTA as the active tab shows "Linked" + the derived target rather
            // than reading the empty toolbar dropdown as "Unlinked" (page.linkedFhaId is persisted;
            // it just wasn't being re-applied to the UI on initial load — only on page-switch).
            renderFTASidebar();
            if (typeof syncFtaConfigFromActivePage === 'function') syncFtaConfigFromActivePage();
            updateFTAConfigUI(); refreshTreeLevelDropdown(); refreshFTARequiredTarget();
            if (typeof _renderFtaLinkedChip === 'function') _renderFtaLinkedChip();
            if(typeof d3 !== 'undefined' && svg) updateD3();
            // Phase 56.47 — auto-fit the canvas on FTA tab entry. Without this the
            // tree paints with whatever stale transform was left in the DOM from a
            // previous render or the initial load, leaving the top event jammed
            // into a corner on refresh. Defer so the layout pass completes first.
            setTimeout(() => { if (typeof fitToScreen === 'function') fitToScreen(); }, 80);
            // Phase 55.0.9 — default-collapse the Fault Trees sidebar and the Calc-Mode
            // panel on FTA tab entry to reclaim the ~1/3 of canvas they were eating.
            // The user can expand either via the existing panel-collapse-toggle button.
            // We only do this the FIRST time per session — if the user has already
            // expanded a panel during this session, don't re-collapse it on tab return.
            try {
                if (!window.__ftaUxInitialized) {
                    // Phase 57 — the Fault Trees navigation pane is now always visible (no longer
                    // collapsible), so only the Calc-Mode panel default-collapses on first entry.
                    const cp = document.getElementById('fta-config-panel');
                    if (cp && !cp.classList.contains('is-collapsed')) {
                        cp.classList.add('is-collapsed');
                        const cpBtn = cp.querySelector('.panel-collapse-toggle');
                        if (cpBtn) cpBtn.textContent = cpBtn.dataset.collapsedLabel || '▸ Calculation Mode & Exposure';
                    }
                    window.__ftaUxInitialized = true;
                }
            } catch (_) {}
        }
    } catch (err) { console.error(err); }
}

// ============================================================================
// Phase 53.70 — ARP 4761A Process Strip
// Derives the AFHA → PASA → SFHA → PSSA → SSA → ASA phase progression from
// existing data (no new schema). CCA (PRA + ZSA + CMA) runs as a parallel
// track. Renders into #dash-process-strip on dashboard refresh. Each card is
// clickable and routes to the relevant scoped view via enterPhase().
// ============================================================================
function computePhaseStatus() {
    const phases = {};
    const hasReview = (typeof Review !== 'undefined');

    // Helper — count approved vs total over an array of {kind, id, systemId?} targets.
    // Returns { approved, total, status } where status ∈ {'not-started','in-progress','complete'}.
    function _rollup(targets) {
        const total = targets.length;
        if (total === 0) return { approved: 0, total: 0, status: 'not-started' };
        let approved = 0;
        if (hasReview) {
            targets.forEach(t => { if (Review.isApproved(t)) approved++; });
        }
        const status = approved === 0 ? 'in-progress' : (approved >= total ? 'complete' : 'in-progress');
        return { approved, total, status };
    }

    // ---- AFHA — single AFHA document for the project; line items are individual FHA rows ----
    const acFhas = acFhaData || [];
    const acFhaTargets = acFhas.map(f => ({ kind: 'acFha', id: f.internalId }));
    const acFhaRoll = _rollup(acFhaTargets);
    phases.AFHA = {
        label: 'AFHA',
        name: 'Aircraft FHA (1 doc)',
        desc: 'Single Aircraft Functional Hazard Assessment document for the project. One line item per failure condition. Complete when every line item is reviewer-approved.',
        progress: acFhas.length === 0 ? 'No line items entered' : (acFhaRoll.approved + '/' + acFhaRoll.total + ' line items approved'),
        status: acFhas.length === 0 ? 'not-started' : acFhaRoll.status,
        target: { tab: 'ac-fha' }
    };

    // ---- PASA — single PASA document for the project; line items are cat/haz hazard allocations ----
    const acCritFhas = acFhas.filter(f => f.severity === 'Catastrophic' || f.severity === 'Hazardous');
    // Each cat/haz hazard's top-down FTA(s) collectively form one line item in the PASA document.
    // The line item is "approved" only when every top-down tree allocating that hazard is signed off.
    let pasaCovered = 0, pasaApproved = 0;
    acCritFhas.forEach(f => {
        const linkedTrees = (ftaPages || []).filter(p =>
            !p.systemId && !p.verifies &&
            ((Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.indexOf(f.internalId) !== -1) || p.linkedFhaId === f.internalId)
        );
        const topDownTrees = linkedTrees.filter(t => (t.mode || 'top-down') === 'top-down' && t.root && ((t.root.children || []).length > 0 || (t.root._children || []).length > 0));
        if (topDownTrees.length > 0) {
            pasaCovered++;
            const allApproved = hasReview && topDownTrees.every(t => Review.isApproved({ kind: 'ftaPage', id: t.id }));
            if (allApproved) pasaApproved++;
        }
    });
    phases.PASA = {
        label: 'PASA',
        name: 'Prelim. AC Safety Assessment (1 doc)',
        desc: 'Single PASA document for the project. One line item per cat/haz failure condition — its top-down allocation tree + DALs + AC-level requirements. Complete when every line item is reviewer-approved.',
        progress: acCritFhas.length === 0 ? 'No cat/haz line items yet' : (pasaApproved + '/' + acCritFhas.length + ' line items approved · ' + pasaCovered + ' allocated'),
        status: acCritFhas.length === 0 ? 'not-started' :
                (pasaCovered === 0 ? 'not-started' :
                (pasaApproved >= acCritFhas.length ? 'complete' : 'in-progress')),
        target: { tab: 'fta' }
    };

    // ---- SFHA — one SFHA document per system. Line items = each system FHA row. ----
    const sysTotal = (systemsData || []).length;
    const sysFhaTargets = [];
    (systemsData || []).forEach(s => {
        (s.fha || []).forEach(f => sysFhaTargets.push({ kind: 'sysFha', id: f.internalId, systemId: s.id }));
    });
    const sysFhaRoll = _rollup(sysFhaTargets);
    const sysWithFhas = (systemsData || []).filter(s => Array.isArray(s.fha) && s.fha.length > 0).length;
    // A system's SFHA document is "complete" when every line item inside it is approved.
    const sysSfhaDocsComplete = (systemsData || []).filter(s => {
        if (!Array.isArray(s.fha) || s.fha.length === 0) return false;
        return hasReview && s.fha.every(f => Review.isApproved({ kind: 'sysFha', id: f.internalId, systemId: s.id }));
    }).length;
    phases.SFHA = {
        label: 'SFHA',
        name: 'System FHAs (1 doc per system)',
        desc: 'One System FHA document per system. Line items = each FHA row inside that system document. Complete when every line item across every system is reviewer-approved.',
        progress: sysTotal === 0 ? 'No systems defined' : (sysSfhaDocsComplete + '/' + sysTotal + ' system docs complete · ' + sysFhaRoll.approved + '/' + sysFhaRoll.total + ' line items approved'),
        status: sysTotal === 0 ? 'not-started' :
                (sysFhaTargets.length === 0 ? 'not-started' :
                (sysSfhaDocsComplete >= sysTotal ? 'complete' : 'in-progress')),
        target: { tab: 'sys-dir' }
    };

    // ---- PSSA — one PSSA document per system. Line items = each top-down FTA page in that system. ----
    let pssaCovered = 0, pssaApproved = 0;
    let pssaLineItemsTotal = 0, pssaLineItemsApproved = 0;
    (systemsData || []).forEach(s => {
        const sysTrees = (ftaPages || []).filter(p => p.systemId === s.id && !p.verifies);
        const topDownTrees = sysTrees.filter(t => (t.mode || 'top-down') === 'top-down' && t.root && ((t.root.children || []).length > 0 || (t.root._children || []).length > 0));
        if (topDownTrees.length > 0) {
            pssaCovered++;
            pssaLineItemsTotal += topDownTrees.length;
            const approvedHere = hasReview ? topDownTrees.filter(t => Review.isApproved({ kind: 'ftaPage', id: t.id })).length : 0;
            pssaLineItemsApproved += approvedHere;
            if (approvedHere >= topDownTrees.length) pssaApproved++;
        }
    });
    phases.PSSA = {
        label: 'PSSA',
        name: 'Prelim. System Safety Assessment (1 doc per system)',
        desc: 'One PSSA document per system. Line items = each top-down allocation tree + DAL allocation + derived requirements. Complete when every line item across every system is reviewer-approved.',
        progress: sysTotal === 0 ? 'No systems defined' : (pssaApproved + '/' + sysTotal + ' system docs complete · ' + pssaLineItemsApproved + '/' + pssaLineItemsTotal + ' line items approved'),
        status: sysTotal === 0 ? 'not-started' :
                (pssaCovered === 0 ? 'not-started' :
                (pssaApproved >= sysTotal ? 'complete' : 'in-progress')),
        target: { tab: 'fta' }
    };

    // ---- SSA — verification mirrors populated AND approved ----
    function _treeHasPopulatedMirror(srcTree) {
        const mirror = (ftaPages || []).find(p => p.verifies === srcTree.id);
        if (!mirror || !mirror.root) return null;
        let populated = 0, totalLeaves = 0;
        (function walk(n) {
            if (!n) return;
            if (n.type !== 'gate') {
                totalLeaves++;
                if ((n.lambda && n.lambda > 0) || (n.probability && n.probability > 0)) populated++;
            }
            (n.children || n._children || []).forEach(walk);
        })(mirror.root);
        return (totalLeaves > 0 && populated >= totalLeaves) ? mirror : null;
    }
    // ---- SSA — one SSA document per system. Line items = each verification mirror tree. ----
    let ssaCovered = 0, ssaApproved = 0;
    let ssaLineItemsTotal = 0, ssaLineItemsApproved = 0;
    (systemsData || []).forEach(s => {
        const sysTrees = (ftaPages || []).filter(p => p.systemId === s.id && !p.verifies && (p.mode || 'top-down') === 'top-down');
        if (sysTrees.length === 0) return;
        const mirrors = sysTrees.map(_treeHasPopulatedMirror).filter(Boolean);
        if (mirrors.length === sysTrees.length) {
            ssaCovered++;
            ssaLineItemsTotal += mirrors.length;
            const approvedHere = hasReview ? mirrors.filter(m => Review.isApproved({ kind: 'ftaPage', id: m.id })).length : 0;
            ssaLineItemsApproved += approvedHere;
            if (approvedHere >= mirrors.length) ssaApproved++;
        }
    });
    phases.SSA = {
        label: 'SSA',
        name: 'System Safety Assessment (1 doc per system)',
        desc: 'One SSA document per system. Line items = each populated verification mirror tree. Complete when every line item across every system is reviewer-approved.',
        progress: sysTotal === 0 ? 'No systems to verify' :
                  (ssaLineItemsTotal === 0 ? 'No populated mirrors yet' :
                   (ssaApproved + '/' + sysTotal + ' system docs complete · ' + ssaLineItemsApproved + '/' + ssaLineItemsTotal + ' line items approved')),
        status: sysTotal === 0 ? 'not-started' :
                (ssaCovered === 0 ? 'not-started' :
                (ssaApproved >= sysTotal ? 'complete' : 'in-progress')),
        target: { tab: 'fta' }
    };

    // ---- ASA — single ASA document for the project. Line items = cat/haz verification mirrors. ----
    let asaCovered = 0, asaApproved = 0;
    acCritFhas.forEach(f => {
        const linkedTrees = (ftaPages || []).filter(p =>
            !p.systemId && !p.verifies &&
            ((Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.indexOf(f.internalId) !== -1) || p.linkedFhaId === f.internalId)
        );
        if (linkedTrees.length === 0) return;
        const mirrors = linkedTrees.map(_treeHasPopulatedMirror).filter(Boolean);
        if (mirrors.length === linkedTrees.length) {
            asaCovered++;
            const allApproved = hasReview && mirrors.every(m => Review.isApproved({ kind: 'ftaPage', id: m.id }));
            if (allApproved) asaApproved++;
        }
    });
    phases.ASA = {
        label: 'ASA',
        name: 'Aircraft Safety Assessment (1 doc)',
        desc: 'Single ASA document for the project. One line item per cat/haz failure condition — its populated verification mirror + rolled-up evidence. Complete when every line item is reviewer-approved.',
        progress: acCritFhas.length === 0 ? 'No cat/haz line items yet' : (asaApproved + '/' + acCritFhas.length + ' line items approved · ' + asaCovered + ' populated'),
        status: acCritFhas.length === 0 ? 'not-started' :
                (asaCovered === 0 ? 'not-started' :
                (asaApproved >= acCritFhas.length ? 'complete' : 'in-progress')),
        target: { tab: 'fta' }
    };

    // ---- CCA parallel track — one document per project per analysis type. Line items per row. ----
    function _ccaPhase(label, name, desc, dataset, kind, tab, lineNoun) {
        const targets = (dataset || []).map(d => ({ kind, id: d.internalId }));
        const roll = _rollup(targets);
        const noun = lineNoun || 'line items';
        return {
            label, name, desc,
            progress: targets.length === 0 ? ('No ' + noun + ' entered') : (roll.approved + '/' + roll.total + ' ' + noun + ' approved'),
            status: targets.length === 0 ? 'not-started' : roll.status,
            ratio: roll.total ? roll.approved / roll.total : 0,
            target: { tab }
        };
    }
    phases.PRA = _ccaPhase('PRA', 'Particular Risk Analysis (1 doc)', 'Single PRA document for the project. One line item per particular risk (rotor burst, lightning, bird strike, fire/explosion, HIRF, hail, tire burst, decompression). Complete when every line item is reviewer-approved.', praData, 'pra', 'pra', 'risk items');
    phases.ZSA = _ccaPhase('ZSA', 'Zonal Safety Analysis (1 doc)', 'Single ZSA document for the project. One line item per zone. Complete when every zone has been reviewer-approved.', zsaData, 'zsa', 'zsa', 'zones');
    phases.CMA = _ccaPhase('CMA', 'Common Mode Analysis (1 doc)', 'Single CMA document for the project. One line item per independence claim or shared-resource analysis. Complete when every line item is reviewer-approved.', cmaData, 'cma', 'cma', 'line items');

    // Phase 62.1 (A1) — numeric completion ratios for the cockpit progress bars.
    phases.AFHA.ratio = acFhaRoll.total ? acFhaRoll.approved / acFhaRoll.total : 0;
    phases.PASA.ratio = acCritFhas.length ? pasaApproved / acCritFhas.length : 0;
    phases.SFHA.ratio = sysFhaRoll.total ? sysFhaRoll.approved / sysFhaRoll.total : 0;
    phases.PSSA.ratio = pssaLineItemsTotal ? pssaLineItemsApproved / pssaLineItemsTotal : 0;
    phases.SSA.ratio  = ssaLineItemsTotal ? ssaLineItemsApproved / ssaLineItemsTotal : 0;
    phases.ASA.ratio  = acCritFhas.length ? asaApproved / acCritFhas.length : 0;

    return phases;
}

function updateSysAsmState(id, newState) { const asm = sys().asm.find(a => a.asmId === id); if(asm) asm.state = newState; renderSysAssumptions(); }
function updateSysAsmText(id, field, val) { const asm = sys().asm.find(a => a.asmId === id); if(asm) asm[field] = val; }
function renderSysAssumptions() {
    if (!sys()) return;
    const tbody = document.getElementById('sys-asm-body'); tbody.innerHTML = '';
    const activeSysId = sys().id;
    sys().asm.forEach(row => {
        let dynFields = _asmRouteSelect('sys', row.asmId, row);
        if (row.state === 'Validated' || row.state === 'Verified') {
            dynFields += `<input type="text" placeholder="Validation Strategy" value="${esc(row.valStrategy||'')}" onchange="updateSysAsmText('${esc(row.asmId)}', 'valStrategy', this.value)"><input type="text" placeholder="Validation Artifacts" value="${esc(row.valArtifact||'')}" onchange="updateSysAsmText('${esc(row.asmId)}', 'valArtifact', this.value)">`;
        }
        if (row.state === 'Verified') {
            dynFields += `<input type="text" placeholder="Verification Artifacts" value="${esc(row.verArtifact||'')}" onchange="updateSysAsmText('${esc(row.asmId)}', 'verArtifact', this.value)">`;
        }
        const commentBtn = (typeof commentTriggerHtml === 'function')
            ? commentTriggerHtml({ kind: 'sysAsm', id: row.asmId, systemId: activeSysId }) : '';
        tbody.insertAdjacentHTML('beforeend', `<tr><td><div style="display:flex; align-items:center; gap:6px;"><strong>${esc(row.asmId)}</strong>${commentBtn}</div></td><td>${esc(row.origin)}</td><td>${esc(row.text)}</td><td>${renderLinkedFHAsHtml(row.asmId)}</td><td style="width: 140px;"><select class="state-select" onchange="updateSysAsmState('${esc(row.asmId)}', this.value)"><option value="Proposed" ${row.state==='Proposed'?'selected':''}>Proposed</option><option value="Validated" ${row.state==='Validated'?'selected':''}>Validated</option><option value="Verified" ${row.state==='Verified'?'selected':''}>Verified</option></select></td><td><div class="asm-dynamic-fields">${dynFields}</div></td></tr>`);
    });
}


// ==========================================
// PRA & ZSA
// ==========================================
// ---------- ZSA / PRA cross-reference helpers (Phase 9) ----------
// ZSA: housedFunctions: string[] of acFunctionsData subIds
// PRA: affectedZones:   string[] of zsaData zoneIds
// Derived: PRA → exposed functions = ⋃ { housedFunctions(z) : z ∈ affectedZones }

// Phase 26 — checkbox-list helpers replacing command-click multi-select dropdowns.
// Each host is a <div id="..." class="cb-list"> that the helpers populate with native
// <input type="checkbox"> rows.
function _renderCheckboxList(host, options, selected, opts) {
    if (!host) return;
    opts = opts || {};
    const selectedSet = new Set(selected || []);
    if (!options || !options.length) {
        host.innerHTML = '<div class="cb-list-empty">' + esc(opts.emptyText || 'No options available') + '</div>';
        return;
    }
    host.innerHTML = options.map(o => {
        const checked = selectedSet.has(o.value) ? ' checked' : '';
        const dis = o.disabled ? ' disabled' : '';
        const onchangeAttr = opts.onChangeHandler ? (' onchange="' + opts.onChangeHandler + '"') : '';
        return '<label class="cb-list-item"><input type="checkbox" value="' + esc(o.value) + '"' + checked + dis + onchangeAttr + '><span>' + esc(o.label) + '</span></label>';
    }).join('');
}
function _getCheckboxListValues(host) {
    if (!host) return [];
    return Array.from(host.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
}
function _setCheckboxListValues(host, values) {
    if (!host) return;
    const set = new Set(values || []);
    host.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = set.has(cb.value); });
}

function _getZsaMultiSelectValues() {
    return _getCheckboxListValues(document.getElementById('zsa-housed-functions'));
}
function _getPraMultiSelectValues() {
    return _getCheckboxListValues(document.getElementById('pra-affected-zones'));
}
function _setMultiSelectValues(elId, values) {
    _setCheckboxListValues(document.getElementById(elId), values);
}

// Populate the ZSA housed-functions checkbox list from acFunctionsData.
function populateZsaHousedFunctionsDropdown(selectedSubIds) {
    const el = document.getElementById('zsa-housed-functions');
    if (!el) return;
    const current = selectedSubIds || _getCheckboxListValues(el);
    const options = (acFunctionsData || []).map(f => ({
        value: f.subId || '',
        label: (f.subId || '') + (f.subName ? '  ·  ' + f.subName : '')
    }));
    _renderCheckboxList(el, options, current, { emptyText: 'No aircraft sub-functions defined yet.' });
}

// Populate the PRA affected-zones checkbox list from zsaData.
function populatePraAffectedZonesDropdown(selectedZoneIds) {
    const el = document.getElementById('pra-affected-zones');
    if (!el) return;
    const current = selectedZoneIds || _getCheckboxListValues(el);
    const options = (zsaData || []).map(z => ({
        value: z.zoneId || '',
        label: (z.zoneId || '') + (z.desc ? '  ·  ' + z.desc.slice(0, 50) : '') + (z.severity === 'Catastrophic' ? '  [CAT]' : '')
    }));
    _renderCheckboxList(el, options, current, {
        emptyText: 'No zones defined yet — add some in ZSA first.',
        onChangeHandler: 'refreshPraExposedFunctions()'
    });
    refreshPraExposedFunctions();
}

// Compute the set of housed-function subIds across a given set of zone IDs.
function _exposedFunctionsForZones(zoneIds) {
    if (!zoneIds || !zoneIds.length) return [];
    const set = new Set();
    zoneIds.forEach(zid => {
        const z = (zsaData || []).find(zz => zz.zoneId === zid);
        if (!z) return;
        (z.housedFunctions || []).forEach(s => set.add(s));
    });
    return Array.from(set);
}

// Refresh the "Exposed Functions" summary box under the PRA form.
function refreshPraExposedFunctions() {
    const host = document.getElementById('pra-exposed-functions-summary');
    if (!host) return;
    const zones = _getPraMultiSelectValues();
    if (!zones.length) {
        host.innerHTML = '<span class="u-muted">Select one or more zones above to see the exposed aircraft sub-functions.</span>';
        return;
    }
    const exposed = _exposedFunctionsForZones(zones);
    if (!exposed.length) {
        host.innerHTML = '<span class="u-muted">No housed functions recorded for the selected zones — populate ZSA entries first.</span>';
        return;
    }
    const labelFor = subId => {
        const f = (acFunctionsData || []).find(x => x.subId === subId);
        return f ? (subId + ' (' + (f.subName || '—') + ')') : subId;
    };
    const chips = exposed.map(s => '<span class="ar-badge ar-badge-auto" style="margin: 2px 4px 2px 0;">' + esc(labelFor(s)) + '</span>').join('');
    host.innerHTML = '<strong style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-tertiary); display: block; margin-bottom: 6px;">Exposed sub-functions (' + exposed.length + ')</strong>' + chips;
}

// Render a comma-separated readable list of housed functions for a ZSA row.
function _renderZsaHousedFunctionsCell(housed) {
    if (!housed || !housed.length) return '<span class="u-muted">—</span>';
    const labelFor = subId => {
        const f = (acFunctionsData || []).find(x => x.subId === subId);
        return f ? (subId + ' (' + (f.subName || '—') + ')') : subId;
    };
    return housed.map(s => '<span style="display: inline-block; padding: 2px 8px; background: var(--color-accent-soft); color: var(--color-accent); border-radius: var(--r-full); font-size: 11px; margin: 1px 2px;">' + esc(labelFor(s)) + '</span>').join('');
}

// Render a comma-separated readable list of affected zones for a PRA row.
function _renderPraZonesCell(zones) {
    if (!zones || !zones.length) return '<span class="u-muted">—</span>';
    return zones.map(zid => {
        const z = (zsaData || []).find(zz => zz.zoneId === zid);
        const cat = z && z.severity === 'Catastrophic';
        const color = cat ? 'var(--sev-cat-fg)' : 'var(--color-text-secondary)';
        const bg = cat ? 'var(--sev-cat-bg)' : 'var(--color-surface-2)';
        return '<span style="display: inline-block; padding: 2px 8px; background: ' + bg + '; color: ' + color + '; border-radius: var(--r-full); font-size: 11px; font-weight: ' + (cat ? '600' : '500') + '; margin: 1px 2px;">' + esc(zid) + (cat ? ' [CAT]' : '') + '</span>';
    }).join('');
}

// Render the exposed-functions cell for a PRA row (derived from its affectedZones).
function _renderPraExposedCell(zones) {
    const exposed = _exposedFunctionsForZones(zones || []);
    if (!exposed.length) return '<span class="u-muted">—</span>';
    return _renderZsaHousedFunctionsCell(exposed);
}

function _fhaSubIdList(f) {
    if (!f) return [];
    return Array.isArray(f.subIds) ? f.subIds : (f.subId ? [f.subId] : []);
}
// Resolve subIds reachable from a single node's externalSource FHA link (path a).
function _nodeExternalSourceSubIds(node) {
    try {
        const es = node && node.externalSource;
        if (!es || es.kind !== 'fha' || es.targetId == null) return [];
        const fha = (typeof _resolveLinkedFha === 'function') ? _resolveLinkedFha(String(es.targetId)) : null;
        return _fhaSubIdList(fha);
    } catch (e) { return []; }
}
// Resolve subIds reachable from a single node's realizedByItemId (path b).
function _nodeItemSubIds(node) {
    try {
        const iid = node && node.realizedByItemId;
        if (iid == null || typeof itemsData === 'undefined' || !Array.isArray(itemsData)) return [];
        const item = itemsData.find(it => it && String(it.internalId) === String(iid));
        if (!item) return [];
        return Array.isArray(item.traceIds) ? item.traceIds : (item.traceId ? [item.traceId] : []);
    } catch (e) { return []; }
}
// Page-level fallback subIds (path c) — the page's owning FHA(s) → their subIds.
function _pageLinkedSubIds(page) {
    const out = new Set();
    try {
        if (!page) return out;
        const lids = Array.isArray(page.linkedFhaIds)
            ? page.linkedFhaIds
            : (page.linkedFhaId != null ? [page.linkedFhaId] : []);
        lids.forEach(lid => {
            if (typeof acFhaData === 'undefined' || !Array.isArray(acFhaData)) return;
            const f = acFhaData.find(x => x && String(x.internalId) === String(lid));
            _fhaSubIdList(f).forEach(s => out.add(s));
        });
    } catch (e) { /* guarded */ }
    return out;
}
// Phase 58 — the SET of aircraft sub-function subIds reachable under childNode,
// using ONLY the branch-specific node-level links — (a) externalSource and
// (b) realizedByItemId — over the childNode itself, every gate under it, and every
// basic-event leaf (extractBasicEvents). The page-level fallback (c) is deliberately
// EXCLUDED here: the page's top-event FHA belongs to the whole tree, so attributing it
// to every branch would manufacture false "shared-resource" couplings across branches.
function _branchSubIds(childNode, page) {
    const set = new Set();
    try {
        if (!childNode) return set;
        // Collect this node, all descendant gates, and all basic-event leaves so
        // node-level (a)/(b) links anywhere in the branch are captured.
        const nodes = [];
        (function collect(n) {
            if (!n) return;
            nodes.push(n);
            const kids = n.children || n._children;
            if (kids && kids.length) kids.forEach(collect);
        })(childNode);
        // Also ensure pure basic-event leaves are present (mirrors extractBasicEvents).
        try {
            if (typeof extractBasicEvents === 'function') {
                const leaves = [];
                extractBasicEvents(childNode, leaves);
                leaves.forEach(l => { if (nodes.indexOf(l) === -1) nodes.push(l); });
            }
        } catch (e) { /* extractBasicEvents is best-effort */ }
        nodes.forEach(n => {
            _nodeExternalSourceSubIds(n).forEach(s => set.add(s));
            _nodeItemSubIds(n).forEach(s => set.add(s));
        });
    } catch (e) { /* fully guarded */ }
    return set;
}
// For an AND/INHIBIT gate, find resources that couple ≥2 distinct child branches:
// compute each immediate child branch's subId set, then for each resource count how
// many distinct branches consume it. ≥2 ⇒ the resource defeats the gate's assumed
// independence. Returns [{ resource, couplingBranches, sharedSubIds }].
function _gateSharedResources(gateNode, page) {
    const out = [];
    try {
        if (!gateNode) return out;
        const kids = gateNode.children || gateNode._children;
        if (!kids || kids.length < 2) return out;
        // subId set per immediate child branch.
        const branchSets = kids.map(k => _branchSubIds(k, page));
        if (typeof resourcesData === 'undefined' || !Array.isArray(resourcesData)) return out;
        resourcesData.forEach(res => {
            if (!res) return;
            const consumed = Array.isArray(res.consumedBy) ? res.consumedBy : [];
            if (!consumed.length) return;
            const consumedSet = new Set(consumed.map(String));
            let couplingBranches = 0;
            const sharedSubIds = new Set();
            branchSets.forEach(bs => {
                let touches = false;
                bs.forEach(sid => {
                    if (consumedSet.has(String(sid))) { touches = true; sharedSubIds.add(String(sid)); }
                });
                if (touches) couplingBranches++;
            });
            if (couplingBranches >= 2) {
                out.push({ resource: res, couplingBranches, sharedSubIds: Array.from(sharedSubIds) });
            }
        });
    } catch (e) { /* fully guarded */ }
    return out;
}
// Map a subId → its aircraft sub-function display name (reuses the FHA helper).
function _subIdName(subId) {
    try {
        if (typeof _fhaSubFunctionDisplay === 'function') return _fhaSubFunctionDisplay(subId);
        const f = (typeof acFunctionsData !== 'undefined' && acFunctionsData)
            ? acFunctionsData.find(x => x && String(x.subId) === String(subId)) : null;
        return f ? (f.subName || f.subId) : subId;
    } catch (e) { return subId; }
}
// Core shared-resource pass — shared by the dedicated button and the fault-tree
// auto-detect. Walks every AND/INHIBIT gate, runs _gateSharedResources, and
// returns SUGGESTED cmaData rows (mirroring the CCF/shared-event row shape).
// `existingKeys` (a Set of autoKeys) is consulted AND extended for dedup, so a
// caller can thread its own set across multiple passes. Also stamps a transient
// node._sharedResourceFlag for drawer surfacing.
function _detectSharedResourceCommonModes(existingKeys, mkId) {
    const candidates = [];
    if (existingKeys == null) existingKeys = new Set();
    const _mint = (typeof mkId === 'function')
        ? mkId
        : (() => (typeof _newId === 'function') ? _newId('CMA') : ('CMA-A' + (internalIdCounter)));
    let gates = [];
    try { gates = (typeof _enumerateAllGates === 'function') ? _enumerateAllGates() : []; } catch (e) { gates = []; }
    gates.forEach(({ page, node: gate }) => {
        if (!gate) return;
        const gt = gate.gateType;
        if (gt !== 'AND' && gt !== 'INHIBIT') return;
        const findings = _gateSharedResources(gate, page);
        findings.forEach(f => {
            const res = f.resource;
            const resId = res.resId || res.internalId;
            const key = 'resource:' + resId + ':' + page.id + ':' + gate.id;
            if (existingKeys.has(key)) return;
            existingKeys.add(key);
            const gateLabel = gate.name || gate.displayId || 'AND gate';
            const fnNames = (f.sharedSubIds || []).map(_subIdName);
            const fnText = fnNames.length ? fnNames.join(', ') : 'multiple functions';
            candidates.push({
                internalId: newRowId(), cmaId: _mint(),
                subject: 'Shared resource — ' + res.name,
                claim: 'Independence of the channels under ' + gateLabel + ' is defeated by loss of the common resource "' + res.name + '".',
                modes: ['shared-resource'],
                linkedGateIds: [page.id + ':' + gate.id],
                findings: 'Channels under this ' + gt + ' gate both depend on resource "' + res.name + '" (consumed by ' + fnText + '); a single loss of that resource defeats the independence this gate assumes.',
                mitigation: '', status: 'Open', scope: 'aircraft', owningSystemId: '',
                suggested: true, autoSource: 'shared-resource', autoKey: key
            });
            // Transient flag for the node drawer (not persisted intentionally).
            try { gate._sharedResourceFlag = res.name; } catch (e) { /* read-only node guard */ }
        });
    });
    return candidates;
}

// ============================================================================
// Phase 57 — CMA auto-detect. Harvest the common modes already encoded in the
// fault trees — (a) declared CCF groups (ccfGroup + β/γ/δ) and (b) shared/repeated
// events (one component reused in ≥2 places = single point across redundancy) —
// and (c) shared-resource couplings (Phase 58) — and stage them as SUGGESTED CMA
// rows for the analyst to Accept or Dismiss.
// ============================================================================
function autoDetectCommonModes() {
    if (!Array.isArray(ftaPages) || !ftaPages.length) {
        if (typeof showToast === 'function') showToast('No fault trees to scan yet — build a fault tree first.', 'warning', 3500);
        return;
    }
    const existingKeys = new Set((cmaData || []).map(c => c.autoKey).filter(Boolean));
    const ccfGroups = new Map();    // groupName -> { beta, gamma, delta, members: [{page, node}] }
    const sharedByLid = new Map();  // logicalId -> [{page, node}]
    (ftaPages || []).forEach(page => {
        if (!page || !page.root) return;
        (function walk(node) {
            if (!node) return;
            if (node.type !== 'gate') {
                if (node.ccfGroup && (node.beta || 0) > 0) {
                    if (!ccfGroups.has(node.ccfGroup)) ccfGroups.set(node.ccfGroup, { beta: node.beta || 0, gamma: node.gamma || 0, delta: node.delta || 0, members: [] });
                    ccfGroups.get(node.ccfGroup).members.push({ page, node });
                }
                const lid = node.logicalId != null ? node.logicalId : node.id;
                if (!sharedByLid.has(lid)) sharedByLid.set(lid, []);
                sharedByLid.get(lid).push({ page, node });
                return;
            }
            const kids = node.children || node._children;
            if (kids) kids.forEach(walk);
        })(page.root);
    });
    // Parent-gate keys ("pageId:gateId") for a set of member events — used to pre-fill Linked Gates.
    const _gateKeysFor = (members) => {
        const keys = new Set();
        members.forEach(({ page, node }) => {
            const parent = (typeof findParentNode === 'function') ? findParentNode(page.root, node.id) : null;
            if (parent) keys.add(page.id + ':' + parent.id);
        });
        return Array.from(keys);
    };
    const _mkId = () => (typeof _newId === 'function') ? _newId('CMA') : ('CMA-A' + (internalIdCounter));
    const candidates = [];
    // (a) CCF groups
    ccfGroups.forEach((grp, name) => {
        const key = 'ccf:' + name;
        if (existingKeys.has(key)) return;
        const labels = grp.members.map(m => m.node.name || m.node.displayId || ('BE-' + m.node.id));
        candidates.push({
            internalId: newRowId(), cmaId: _mkId(),
            subject: 'CCF group: ' + name,
            claim: 'Redundant items in CCF group "' + name + '" are not fully independent — a shared cause can fail them together (β=' + grp.beta + (grp.gamma ? (', γ=' + grp.gamma) : '') + (grp.delta ? (', δ=' + grp.delta) : '') + ').',
            modes: [], linkedGateIds: _gateKeysFor(grp.members),
            findings: 'Auto-detected from fault-tree CCF group "' + name + '" — ' + grp.members.length + ' member(s): ' + labels.join(', ') + '. Classify the common-cause mode(s) and record the independence / separation argument that justifies β.',
            mitigation: '', status: 'Open', scope: 'aircraft', owningSystemId: '',
            suggested: true, autoSource: 'ccf-group', autoKey: key
        });
    });
    // (b) Shared / repeated events (same logicalId reused in ≥2 distinct locations)
    sharedByLid.forEach((occ, lid) => {
        if (occ.length < 2) return;
        const key = 'shared:' + lid;
        if (existingKeys.has(key)) return;
        const nm = occ[0].node.name || occ[0].node.displayId || ('event ' + lid);
        candidates.push({
            internalId: newRowId(), cmaId: _mkId(),
            subject: 'Shared component: ' + nm,
            claim: 'A single component ("' + nm + '") appears in ' + occ.length + ' places across the fault tree(s) — its single failure defeats the redundancy it spans (single point of failure / common mode).',
            modes: [], linkedGateIds: _gateKeysFor(occ),
            findings: 'Auto-detected shared/repeated event "' + nm + '" (logical ID ' + lid + ') used in ' + occ.length + ' locations. Confirm whether this single resource is intended to feed multiple redundant paths, and capture the justification or design change.',
            mitigation: '', status: 'Open', scope: 'aircraft', owningSystemId: '',
            suggested: true, autoSource: 'shared-event', autoKey: key
        });
    });
    // (c) Shared-resource couplings — reuse the same existingKeys Set + cmaId minter
    //     so this pass dedups against the rows just staged above and mints ids
    //     identically. Factored into _detectSharedResourceCommonModes (also used by
    //     the dedicated "Flag shared-resource common modes" button).
    try {
        _detectSharedResourceCommonModes(existingKeys, _mkId).forEach(c => candidates.push(c));
    } catch (e) { /* shared-resource pass is additive + best-effort */ }
    if (!candidates.length) {
        if (typeof showToast === 'function') showToast('No new common modes found — no CCF groups, shared events, or shared-resource couplings in the fault trees (or all already captured).', 'info', 4800);
        return;
    }
    candidates.forEach(c => cmaData.push(c));
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    renderCMA();
    if (typeof showToast === 'function') showToast(candidates.length + ' common-mode candidate(s) added from the fault trees — review and Accept each.', 'success', 5200);
}

function _setFmeaTableHead() {
    const head = document.getElementById('fmea-table-head');
    if (!head) return;
    if (_fmeaActiveMode === 'functional') {
        head.innerHTML = '<tr>' +
            '<th>Actions</th><th>Scope</th><th>ID</th><th>Sub-Function</th><th>Function Failure Mode</th>' +
            '<th>Local Effect</th><th>Next-Higher Effect</th><th>End Effect</th>' +
            '<th>Detection</th><th>Severity</th><th>Compensating Provision</th><th>Phase</th>' +
        '</tr>';
    } else {
        head.innerHTML = '<tr>' +
            '<th>Actions</th><th>Scope</th><th>ID</th><th>FTA Link</th><th>Component</th><th>Failure Mode</th>' +
            '<th>Local Effect</th><th>Next-Higher Effect</th><th>End Effect</th>' +
            '<th>Detection</th><th>Severity</th><th>λ (/hr)</th><th>t (hr)</th><th>P</th>' +
        '</tr>';
    }
    // Rebuilding this thead wipes the injected Review column while the body
    // keeps rendering review cells — headerless buttons. Re-run the injector
    // (idempotent) so head and body always agree.
    try { if (typeof _injectReviewColumnHeaders === 'function') _injectReviewColumnHeaders(); } catch (_) {}
}

// Build the small scope-badge cell shown in each FMEA / CMA row. Optionally annotates with an "orphan" tag.
function _renderScopeCell(scope, owningSystemId, opts) {
    opts = opts || {};
    const s = (scope === 'system') ? 'system' : 'aircraft';
    const c = FMEA_SCOPE_COLORS[s];
    const sysName = (s === 'system' && owningSystemId)
        ? (((systemsData || []).find(x => x.id === owningSystemId) || {}).name || '(system?)')
        : '';
    const badge = '<span style="display: inline-block; padding: 2px 8px; background: ' + c.bg + '; color: ' + c.fg + '; border-radius: var(--r-full); font-size: 10px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;">' + esc(FMEA_SCOPE_LABELS[s]) + '</span>';
    const sys = sysName ? '<div style="font-size: 10px; color: var(--color-text-tertiary); margin-top: 3px;">' + esc(sysName) + '</div>' : '';
    let orph = '';
    if (opts.orphan) {
        const tip = esc(opts.orphanReason || 'Referenced source has been deleted');
        orph = '<div style="margin-top: 4px;"><span class="ar-badge ar-badge-orphan" title="' + tip + '">orphan</span></div>';
    }
    return '<td>' + badge + sys + orph + '</td>';
}

// True iff the FMEA row references a deleted AC function (functional) or basic event (piece-part).
function _isFmeaOrphan(row) {
    if (!row) return false;
    if (row.fmeaType === 'functional') {
        if (!row.funcSubId) return false;   // unset is not orphan
        return !((acFunctionsData || []).some(f => f.subId === row.funcSubId));
    }
    // piece-part (default for legacy rows)
    if (!row.beId) return false;
    for (const page of ftaPages) {
        if (typeof findNode === 'function' && findNode(page.root, row.beId)) return false;
    }
    return true;
}
function _fmeaOrphanReason(row) {
    if (!row) return '';
    if (row.fmeaType === 'functional') return 'AC sub-function "' + (row.funcSubId || '') + '" no longer exists.';
    return 'FTA basic event with id ' + (row.beId || '?') + ' no longer exists in any tree.';
}

function _readFmeaForm() {
    const get = id => (document.getElementById(id) || {}).value || '';
    const scope = get('fmea-scope') || 'aircraft';
    const common = {
        fmeaType:       _fmeaActiveMode,
        scope:          scope,                                       // 'aircraft' | 'system'
        owningSystemId: scope === 'system' ? get('fmea-owning-system') : '',
        fmeaId:         get('fmea-id'),
        localEffect:    get('fmea-local-effect'),
        nextEffect:     get('fmea-next-effect'),
        endEffect:      get('fmea-end-effect'),
        detection:      get('fmea-detection'),
        severity:       get('fmea-severity'),
        compensating:   get('fmea-compensating'),
        remarks:        get('fmea-remarks')
    };
    if (_fmeaActiveMode === 'functional') {
        return Object.assign({}, common, {
            funcSubId:  get('fmea-function-link'),
            funcMode:   get('fmea-func-mode'),
            phase:      get('fmea-phase'),
            linkedFcId: get('fmea-func-linked-fc')   // #3 — optional FHA failure-condition link
        });
    } else {
        // Phase 53.60 — capture α_FM + parent library key; if both are set and the parent
        // has a known λ, recompute λ_mode = α_FM × λ_library so the FMEA stays in sync.
        const parentLibKey = get('fmea-parent-lib');
        const alphaFm = parseFloat(get('fmea-alpha-fm'));
        let rate = parseFloat(get('fmea-rate')) || 0;
        if (parentLibKey && !isNaN(alphaFm) && alphaFm > 0) {
            const parent = (COMPONENT_LIBRARY[parentLibKey] || (projectConfig.customLibrary || {})[parentLibKey]);
            if (parent && parent.lambda > 0) {
                rate = parent.lambda * alphaFm;
                const rateEl = document.getElementById('fmea-rate');
                if (rateEl) rateEl.value = rate;
            }
        }
        const time = parseFloat(get('fmea-time')) || 0;
        return Object.assign({}, common, {
            beId: parseInt(get('fmea-basic-event')) || 0,
            parentLibKey: parentLibKey || '',
            part: get('fmea-part'),
            mode: get('fmea-mode'),
            alphaFm: isNaN(alphaFm) ? null : alphaFm,
            rate,
            time,
            prob: -Math.expm1(-rate * time)
        });
    }
}

function _writeFmeaForm(row) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = (v == null ? '' : v); };
    // Scope first so the conditional owning-system row is positioned correctly before populating.
    const scope = row.scope || 'aircraft';
    set('fmea-scope', scope);
    populateFmeaOwningSystem(row.owningSystemId || '');
    onFmeaScopeChange();
    set('fmea-id', row.fmeaId || row.id || '');
    set('fmea-local-effect', row.localEffect);
    set('fmea-next-effect',  row.nextEffect);
    set('fmea-end-effect',   row.endEffect);
    set('fmea-detection',    row.detection);
    set('fmea-severity',     row.severity || 'Major');
    set('fmea-compensating', row.compensating);
    set('fmea-remarks',      row.remarks);
    // _applyFmeaModeUI swaps the UI without canceling the active edit (setFmeaMode would
    // wipe editStates.fmea and the form fields — see Phase 27 audit A1).
    if (row.fmeaType === 'functional') {
        _applyFmeaModeUI('functional');
        _populateFmeaFunctionLink();
        _populateFmeaFuncLinkedFc();
        set('fmea-function-link', row.funcSubId);
        set('fmea-func-mode', row.funcMode || 'loss');
        set('fmea-phase', row.phase);
        set('fmea-func-linked-fc', row.linkedFcId || '');
    } else {
        _applyFmeaModeUI('piece-part');
        // Phase 53.60 — populate parent library picker before writing the row value back.
        _populateFmeaParentLib();
        set('fmea-basic-event', row.beId);
        set('fmea-parent-lib', row.parentLibKey || '');
        set('fmea-part', row.part);
        set('fmea-mode', row.mode);
        set('fmea-alpha-fm', row.alphaFm != null ? row.alphaFm : '');
        set('fmea-rate', row.rate);
        set('fmea-time', row.time);
        calcFMEAProb();
    }
}

// Phase 53.60 — populate the parent library dropdown. Filters to entries that
// have a defined failure mode distribution (so the picker stays usable).
function _populateFmeaParentLib() {
    const sel = document.getElementById('fmea-parent-lib');
    if (!sel) return;
    const opts = ['<option value="">-- No parent (enter λ directly) --</option>'];
    const groups = {};
    Object.keys(FAILURE_MODE_DISTRIBUTIONS).forEach(key => {
        const entry = COMPONENT_LIBRARY[key];
        if (!entry) return;
        const g = entry.group || 'Other';
        (groups[g] = groups[g] || []).push({ key, name: entry.name, lambda: entry.lambda });
    });
    Object.keys(groups).sort().forEach(g => {
        opts.push('<optgroup label="' + esc(g) + '">');
        groups[g].forEach(({ key, name, lambda }) => {
            opts.push('<option value="' + esc(key) + '">' + esc(name) + ' (λ ' + Number(lambda).toExponential(2) + ')</option>');
        });
        opts.push('</optgroup>');
    });
    sel.innerHTML = opts.join('');
}

function updateNodeData() {
    if(!selectedNodeData) return;
    if(selectedNodeData.gateType === 'TRANSFER') { selectedNodeData.linkedPageId = document.getElementById('config-transfer-link').value; const linkedPage = ftaPages.find(p => p.id === selectedNodeData.linkedPageId); selectedNodeData.name = linkedPage ? `Transfer to: ${linkedPage.name}` : "Transfer Gate"; } else { selectedNodeData.name = document.getElementById('config-name').value; }
    // Phase 56.39 — weight is now available on every non-root node (gates and events alike).
    // Persist from the slider on every input regardless of node type.
    if (ftaConfig.mode === 'top-down' && ftaConfig.apportion === 'weighted') {
        const wEl = document.getElementById('config-weight');
        if (wEl) {
            const w = parseFloat(wEl.value);
            if (isFinite(w) && w >= 0 && w <= 100) selectedNodeData.weight = w;
        }
        const lockEl = document.getElementById('config-weight-lock');
        if (lockEl) selectedNodeData.weightLocked = !!lockEl.checked;
    }
    // Phase 56.39d — prescribed rate (gates only). When the toggle is on the
    // node carries prescribedRate=true + prescribedProb + justification, and
    // the allocator skips top-down apportionment to its children.
    if (selectedNodeData.type === 'gate' && selectedNodeData.gateType !== 'TRANSFER') {
        const rateChk = document.getElementById('config-prescribed-rate');
        const probEl  = document.getElementById('config-prescribed-prob');
        const justEl  = document.getElementById('config-prescribed-justification');
        if (rateChk) selectedNodeData.prescribedRate = !!rateChk.checked;
        if (probEl) {
            const p = parseFloat(probEl.value);
            if (isFinite(p) && p >= 0 && p <= 1) selectedNodeData.prescribedProb = p;
            else if (probEl.value === '' || probEl.value == null) selectedNodeData.prescribedProb = null;
        }
        if (justEl) selectedNodeData.prescribedJustification = justEl.value || '';
    }
    if (selectedNodeData.type !== 'gate') {
        if(selectedNodeData.type === 'basic') {
            selectedNodeData.ccfGroup = document.getElementById('config-ccf-group').value.trim();
            const beta = parseFloat(document.getElementById('config-beta').value) || 0;
            // Beta is a probability share — clamp to [0, 1] regardless of input.
            selectedNodeData.beta = Math.min(1, Math.max(0, beta));
            const gammaEl = document.getElementById('config-gamma');
            const deltaEl = document.getElementById('config-delta');
            if (gammaEl) selectedNodeData.gamma = Math.min(1, Math.max(0, parseFloat(gammaEl.value) || 0));
            if (deltaEl) selectedNodeData.delta = Math.min(1, Math.max(0, parseFloat(deltaEl.value) || 0));
        }
        // Phase 56.45 — Achievable λ /hr (physical). Optional. When set, the
        // canvas + property panel surface a feasibility flag if allocated > achievable.
        const achEl = document.getElementById('config-achievable-lambda');
        if (achEl) {
            const raw = achEl.value;
            if (raw === '' || raw == null) {
                delete selectedNodeData.achievableLambda;
            } else {
                const parsed = parseFloat(raw);
                if (isFinite(parsed) && parsed > 0) selectedNodeData.achievableLambda = parsed;
                else delete selectedNodeData.achievableLambda;
            }
        }
        // Basic-event input mode → λ. Other event leaves still use the legacy λ input.
        if (selectedNodeData.type === 'basic' || selectedNodeData.type === 'undeveloped') {
            const modeSel = document.getElementById('config-input-mode');
            const valEl = document.getElementById('config-input-value');
            const libSel = document.getElementById('config-input-library');
            if (modeSel) {
                selectedNodeData.inputMode = modeSel.value;
                selectedNodeData.inputValue = parseFloat(valEl.value) || 0;
                selectedNodeData.libraryKey = libSel ? libSel.value : '';
                selectedNodeData.lambda = lambdaFromInputMode(
                    selectedNodeData.inputMode, selectedNodeData.inputValue,
                    selectedNodeData.libraryKey, ftaConfig.exposureTime
                );
            } else if (ftaConfig.mode === 'bottom-up') {
                const lam = parseFloat(document.getElementById('config-lambda').value) || 0;
                selectedNodeData.lambda = Math.max(0, lam);
            }
            // Uncertainty + repair model fields.
            const efEl   = document.getElementById('config-lambda-ef');
            const repSel = document.getElementById('config-repair-model');
            const muEl   = document.getElementById('config-mu');
            const tauEl  = document.getElementById('config-tau');
            if (efEl)   selectedNodeData.lambdaEF   = Math.max(1, parseFloat(efEl.value)  || 1);
            if (repSel) selectedNodeData.repairModel = repSel.value || 'unmaintained';
            if (muEl)   selectedNodeData.mu          = parseFloat(muEl.value)  || 0;
            if (tauEl)  selectedNodeData.tau         = parseFloat(tauEl.value) || 0;
            // Phase 56.x (#4) — inherit repair model from the library entry when the
            // node is sourced from one. A library-sourced component adopts the library's
            // repair characteristics (overriding the panel fields) so repairable behavior
            // stays consistent across every node that references the entry.
            if (selectedNodeData.inputMode === 'library' && selectedNodeData.libraryKey) {
                const _libEntry = getActiveLibrary()[selectedNodeData.libraryKey];
                if (_libEntry && _libEntry.repairModel) {
                    selectedNodeData.repairModel = _libEntry.repairModel;
                    if (_libEntry.mu  != null) selectedNodeData.mu  = parseFloat(_libEntry.mu)  || 0;
                    if (_libEntry.tau != null) selectedNodeData.tau = parseFloat(_libEntry.tau) || 0;
                }
            }
            const mkvSel = document.getElementById('config-markov-model');
            if (mkvSel) selectedNodeData.markovModelId = mkvSel.value || undefined;
            // Phase 57 — per-event exposure model.
            const expModeSel = document.getElementById('config-exposure-mode');
            if (expModeSel) {
                const mode = expModeSel.value || 'continuous';
                selectedNodeData.exposureMode = mode;
                const expTimeEl = document.getElementById('config-exposure-time');
                const dormEl    = document.getElementById('config-dormancy-interval');
                if (mode === 'manual' && expTimeEl) {
                    const t = parseFloat(expTimeEl.value);
                    if (isFinite(t) && t > 0) selectedNodeData.exposureTime = t;
                    else delete selectedNodeData.exposureTime;
                }
                if (mode === 'latent' && dormEl) {
                    const t = parseFloat(dormEl.value);
                    if (isFinite(t) && t > 0) selectedNodeData.dormancyInterval = t;
                    else delete selectedNodeData.dormancyInterval;
                }
                // Refresh the read-only effective-exposure readout.
                if (typeof _refreshExposureReadout === 'function') _refreshExposureReadout();
            }
        } else if (ftaConfig.mode === 'bottom-up') {
            const lam = parseFloat(document.getElementById('config-lambda').value) || 0;
            selectedNodeData.lambda = Math.max(0, lam);
        }
    }
    if (selectedNodeData.gateType === 'VOTING') {
        const k = parseInt(document.getElementById('config-voting-k').value) || 2;
        selectedNodeData.votingK = Math.max(1, k);
    }
    // DAL allocation option (AND / INHIBIT gates only).
    if (selectedNodeData.gateType === 'AND' || selectedNodeData.gateType === 'INHIBIT') {
        const optSel = document.getElementById('config-dal-option');
        const carrierSel = document.getElementById('config-dal-carrier');
        const indepSel = document.getElementById('config-dal-independence');
        if (indepSel) selectedNodeData.dalIndependence = indepSel.value;   // claimed | substantiated | none | compromised
        if (optSel) selectedNodeData.dalOption = optSel.value;
        if (carrierSel && carrierSel.value) selectedNodeData.dalCarrierChildId = parseInt(carrierSel.value);
        // Carrier dropdown is only meaningful under Option 1.
        const carrierWrap = document.getElementById('config-dal-carrier-container');
        if (carrierWrap) carrierWrap.style.display = selectedNodeData.dalOption === 'opt1' ? 'block' : 'none';
    }
    // Phase 55.0.8 — DAL Kind override (FDAL/IDAL) applies to every FTA node.
    {
        const kindSel = document.getElementById('config-dal-kind-override');
        if (kindSel) {
            const v = kindSel.value;
            if (v === 'FDAL' || v === 'IDAL') selectedNodeData.dalKindOverride = v;
            else delete selectedNodeData.dalKindOverride;
        }
    }
    const activePage = ftaPages.find(p => p.id === activeFTAPageId); if(activePage && activePage.root && activePage.root.id === selectedNodeData.id) { activePage.name = selectedNodeData.name; renderFTASidebar(); }
    // Mirror the change to every other tree-position node with the same logicalId.
    propagateRepeatedEventEdit(selectedNodeData);
    calculateAllProbabilities(); updateD3();
    // Phase 32a — refresh the BE derived display (P at t, etc.).
    refreshBasicEventDerived();
}

// Phase 32a — show "P at t = X" next to the λ input on the BE config panel. For
// FHA-normalized trees, the t is the exposure window (the actual phases the hazard exposes
// during), so the displayed P matches what the cutset will compute for this BE.
function refreshBasicEventDerived() {
    // Phase 57 — the derived "λ_op · P at t · t_exposure (FHA phases…)" rationale line under the
    // Failure Rate input was removed at the user's request. Keep the function (callers still
    // invoke it) but render nothing so the field reads clean.
    const host = document.getElementById('config-lambda-derived');
    if (host) host.innerHTML = '';
}

function renderGoldenThreadView(){
    const host = document.getElementById('gt-sankey-host');
    const eco = document.getElementById('gt-eco');
    if(!host) return;
    const pick = document.getElementById('gt-func-pick');
    if(pick){
        const cur = pick.value;
        pick.innerHTML = ['<option value="">All aircraft functions</option>'].concat((acFunctionsData||[]).map(f => '<option value="' + esc(f.subId) + '">' + esc(f.subId + ' · ' + (f.subName || '')) + '</option>')).join('');
        if((acFunctionsData||[]).some(f => f.subId === cur)) pick.value = cur;
        if(!pick.dataset.wired){ pick.addEventListener('change', renderGoldenThreadView); pick.dataset.wired = '1'; }
    }
    if(typeof d3 === 'undefined'){ host.innerHTML = '<div style="padding:30px; color:var(--color-text-tertiary);">Visualization library unavailable.</div>'; return; }
    const scope = pick ? pick.value : '';
    const graph = _gtvBuildGraph({ functionSubId: scope || null });
    if(!graph.nodes.length){
        host.innerHTML = '<div style="padding:42px; text-align:center; color:var(--color-text-tertiary); font-size:13px;">No thread to show yet. Add aircraft functions, failure conditions and supporting analyses, then the golden thread appears here.</div>';
        if(eco) eco.innerHTML = ''; return;
    }
    const counts = {}; _GTV_LAYERS.forEach(l => counts[l] = 0); graph.nodes.forEach(n => counts[n.kind]++);
    const maxCol = Math.max.apply(null, _GTV_LAYERS.map(l => counts[l]));
    const W = Math.max(940, host.clientWidth || 1100);
    // Compact: cap the layout height so a busy project doesn't balloon to ~1500px and then get
    // scaled down (which halved the ribbons). Height is rendered 1:1 below — no down-scaling.
    const H = Math.max(340, Math.min(700, maxCol * 34 + 70));
    _gtvLayout(graph, W, H);

    host.innerHTML = '';
    const svg = d3.select(host).append('svg')
        .attr('width', '100%').attr('height', H)
        .attr('viewBox', '0 0 ' + W + ' ' + H).attr('preserveAspectRatio', 'xMinYMin meet')
        .attr('style', 'display:block;');
    const g = svg.append('g');
    try { svg.call(d3.zoom().scaleExtent([0.4, 3]).filter(ev => ev.type === 'wheel' ? (ev.ctrlKey || ev.metaKey) : !ev.button).on('zoom', ev => g.attr('transform', ev.transform))); } catch(e){}

    const layerX = {}; graph.nodes.forEach(n => { if(layerX[n.kind] === undefined) layerX[n.kind] = n._x; });
    _GTV_LAYERS.filter(l => counts[l]).forEach(l => {
        g.append('text').attr('x', layerX[l]).attr('y', 18).style('fill', _GTV_COLOR[l]).attr('font-size', 12.5).attr('font-weight', 600).attr('font-family', 'inherit').text(_GTV_LNAME[l] + ' (' + counts[l] + ')');
    });
    const byKey = {}; graph.nodes.forEach(n => byKey[n.key] = n);
    // Gradient defs — each ribbon blends its source-column colour → target-column colour (target design).
    const _defs = svg.append('defs'); const _seenG = {};
    graph.links.forEach(L => {
        const sk = byKey[L.s] && byKey[L.s].kind, tk = byKey[L.t] && byKey[L.t].kind; if (!sk || !tk) return;
        const gid = 'gtvg-' + sk + '-' + tk; if (_seenG[gid]) return; _seenG[gid] = 1;
        const gr = _defs.append('linearGradient').attr('id', gid).attr('x1', '0').attr('y1', '0').attr('x2', '1').attr('y2', '0');
        gr.append('stop').attr('offset', '0%').attr('stop-color', _GTV_COLOR[sk] || '#888');
        gr.append('stop').attr('offset', '100%').attr('stop-color', _GTV_COLOR[tk] || '#888');
    });
    const linkSel = g.append('g').attr('fill', 'none').selectAll('path').data(graph.links).enter().append('path')
        .attr('d', L => { const dx = (L._x1 - L._x0) * 0.5; return 'M' + L._x0 + ',' + L._y0 + 'C' + (L._x0 + dx) + ',' + L._y0 + ' ' + (L._x1 - dx) + ',' + L._y1 + ' ' + L._x1 + ',' + L._y1; })
        .attr('stroke', L => 'url(#gtvg-' + byKey[L.s].kind + '-' + byKey[L.t].kind + ')').attr('stroke-width', L => L._th).attr('stroke-opacity', 0.45);
    const nodeG = g.append('g').selectAll('g').data(graph.nodes).enter().append('g').attr('cursor', 'pointer')
        .on('click', (ev, n) => _gtvShowEco(n.key, graph))
        .on('dblclick', (ev, n) => { try { ev.preventDefault(); ev.stopPropagation(); } catch(_){} _gtvShowEcoModal(n.key, graph); });
    nodeG.append('rect').attr('x', n => n._x).attr('y', n => n._y).attr('width', n => n._w).attr('height', n => n._h).attr('rx', 3)
        .attr('fill', n => n.flag ? _GTV_FLAGC[n.flag] : _GTV_COLOR[n.kind])
        .attr('stroke', n => n.flag === 'compromised' ? '#7a1f1f' : (n.flag ? '#33373d' : 'none'))
        .attr('stroke-width', n => n.flag ? 1.4 : 0);
    nodeG.append('title').text(n => n.label + (n.sub ? ' — ' + n.sub : '') + (n.flag ? ('  [' + n.flag.toUpperCase() + (n.flagReason ? ': ' + n.flagReason : '') + ']') : ''));
    nodeG.append('text').attr('x', n => n._x + n._w + 5).attr('y', n => n._y + n._h / 2).attr('dy', '0.35em').attr('font-size', 11).attr('font-family', 'inherit')
        .style('fill', n => n.flag === 'compromised' ? '#d35450' : (n.flag ? '#9aa0a6' : 'var(--color-text-secondary)'))
        .style('text-decoration', n => n.flag === 'obsolete' ? 'line-through' : 'none')
        .text(n => (n.flag ? _GTV_FLAGM[n.flag] : '') + _gtvTrunc(n.label, 24));

    // #50 — hover a node to spotlight its full upstream+downstream thread; sync + apply the flag filter.
    nodeG.on('mouseover', (ev, n) => { try { _gtvHighlightThread(graph, linkSel, nodeG, n.key); } catch (_) {} })
         .on('mouseout', () => { try { _gtvClearHighlight(graph, linkSel, nodeG); } catch (_) {} });
    try { const _cb = document.getElementById('gt-only-flagged'); if (_cb) _cb.checked = _gtvOnlyFlagged; } catch (_) {}
    if (_gtvOnlyFlagged) { try { _gtvApplyFlaggedFilter(graph, linkSel, nodeG); } catch (_) {} }

    // #IFACE — overlay lateral system↔system interface edges on the spine. Fully additive and
    // guarded: any failure here is contained and never affects the deterministic graph below it.
    try {
        const _ifaces = (typeof projectConfig !== 'undefined' && projectConfig && Array.isArray(projectConfig.interfaces)) ? projectConfig.interfaces : [];
        if (_ifaces.length) {
            const _sysNode = {}; graph.nodes.forEach(n => { if (n.kind === 'sys') _sysNode[String(n.id)] = n; });
            const _IKC = { interface: '#0A63CC', functional: '#7c3aed', resource: '#d97706' };
            const _ov = g.append('g').attr('fill', 'none').attr('opacity', 0.8);
            _ifaces.forEach(i => {
                const a = _sysNode[String(i.fromSystemId)], b = _sysNode[String(i.toSystemId)];
                if (!a || !b || a === b) return;
                const x = a._x + a._w / 2, y1 = a._y + a._h / 2, y2 = b._y + b._h / 2;
                const cx = x - Math.max(24, Math.abs(y2 - y1) * 0.3);
                _ov.append('path')
                    .attr('d', 'M' + x + ',' + y1 + ' C' + cx + ',' + y1 + ' ' + cx + ',' + y2 + ' ' + x + ',' + y2)
                    .attr('stroke', _IKC[i.kind] || '#888').attr('stroke-width', 1.4)
                    .attr('stroke-dasharray', i.kind === 'resource' ? '2,3' : '5,3')
                    .append('title').text((i.kind || 'interface') + ' interface');
            });
        }
    } catch (e) {}

    let startKey = scope ? ('func:' + scope) : null;
    if(!startKey || !byKey[startKey]){ const f = graph.nodes.find(n => n.kind === 'func'); startKey = f ? f.key : graph.nodes[0].key; }
    _gtvShowEco(startKey, graph);
}

// Trace-report rows (one per failure-condition thread) — reuses the same joins
// as the graph builder. Consumed by REPORT_DEFS.GTT via extractData.
function _gtvReportRows(functionSubId){
    const rows = [];
    const fcRows = [];
    (acFhaData||[]).forEach(f => fcRows.push({ fha: f, domain: 'AC', system: null }));
    (systemsData||[]).forEach(s => (s.fha||[]).forEach(f => fcRows.push({ fha: f, domain: 'SYS', system: s })));
    fcRows.forEach(({ fha, domain, system }) => {
        const subId = fha.subId;
        if(functionSubId && subId !== functionSubId) return;
        const fn = (acFunctionsData||[]).find(f => f.subId === subId) || (system && (system.functions||[]).find(f => f.subId === subId));
        const syss = _gtvSystemsForFc(fha, domain).map(s => s.name);
        const linkedPages = (ftaPages||[]).filter(p => { const L = (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds : (p.linkedFhaId ? [p.linkedFhaId] : []); return L.includes(fha.internalId); });
        const pageIds = linkedPages.map(p => String(p.id));
        const cc = [];
        (cmaData||[]).forEach(c => { if((c.linkedGateIds||[]).some(k => pageIds.includes(String(k).split(':')[0]))) cc.push('CMA ' + (c.cmaId || '')); });
        (zsaData||[]).forEach(z => { if((z.housedFunctions||[]).includes(subId)) cc.push('ZSA ' + (z.zoneId || '')); });
        (praData||[]).forEach(p => { if((p.affectedZones||[]).some(zid => { const z = (zsaData||[]).find(zz => zz.zoneId === zid); return z && (z.housedFunctions||[]).includes(subId); })) cc.push('PRA ' + (p.praId || '')); });
        let refs = []; try { refs = Traceability.getReferrers({ kind: domain === 'AC' ? 'acFha' : 'sysFha', id: fha.internalId, systemId: system ? system.id : null }) || []; } catch(e){}
        const reqLabels = [], verifs = [];
        refs.filter(r => r.kind === 'acReq' || r.kind === 'sysReq').forEach(r => {
            const req = (r.kind === 'acReq') ? (acReqData||[]).find(x => x.internalId === r.id) : (function(){ const s = (systemsData||[]).find(ss => ss.id === r.systemId); return s ? (s.req||[]).find(x => x.internalId === r.id) : null; })();
            reqLabels.push((req && (req.traceId || req.id)) || r.label || ('REQ-' + r.id));
            if(req) verifs.push(req.verifStatus || req.vvStatus || 'Planned');
        });
        const sevTarget = (typeof getSafetyTarget === 'function') ? getSafetyTarget(fha.severity) : null;
        rows.push({
            'Function': fn ? (fn.subId + ' · ' + (fn.subName || '')) : (subId || '—'),
            'System': syss.length ? syss.join(', ') : 'Aircraft level',
            'FC ID': fha.fcId || '',
            'Failure Condition': fha.fcDesc || '',
            'Severity': fha.severity || '',
            'DAL': (sevTarget && sevTarget.dal) || '',
            'Fault Tree(s)': linkedPages.map(p => p.name || ('Tree ' + p.id)).join('; ') || '—',
            'Common Cause': cc.join('; ') || '—',
            'Requirement(s)': reqLabels.join('; ') || '—',
            'Verification': verifs.length ? Array.from(new Set(verifs)).join(', ') : '—',
        });
    });
    return rows;
}

function _gtvReportGaps(functionSubId){
    const rows = _gtvReportRows(functionSubId);
    const noTree = rows.filter(r => r['Fault Tree(s)'] === '—').length;
    const noReq  = rows.filter(r => r['Requirement(s)'] === '—').length;
    const openV  = rows.filter(r => r['Verification'] === '—' || /Planned|In work|Open/i.test(r['Verification'])).length;
    const parts = [rows.length + ' failure-condition thread' + (rows.length === 1 ? '' : 's') + ' in scope.'];
    if(noTree) parts.push(noTree + ' without a linked fault tree.');
    if(noReq) parts.push(noReq + ' without a traced safety requirement.');
    if(openV) parts.push(openV + ' with verification still open.');
    if(!noTree && !noReq && !openV && rows.length) parts.push('Every thread carries a tree, a requirement, and closed verification.');
    return parts.join(' ');
}
