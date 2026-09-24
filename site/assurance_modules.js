// assurance_modules.js — Review / AutoReq / Traceability, extracted verbatim from
// safety_lab.js (Phase 76). Classic script, shared global lexical scope, loaded BEFORE
// safety_lab.js. Accessed by bare name (no window.*); self-contained at definition;
// monolith globals used inside methods at runtime. Byte-identical.

const Review = (function() {

    // Phase 53.25 — sysFunc + sysFcim added so comments scope to active system.
    const SYS_KINDS = new Set(['sysFha', 'sysReq', 'sysAsm', 'sysFunc', 'sysFcim']);

    function targetMatches(comment, target) {
        if (!comment || !comment.target || !target) return false;
        if (comment.target.kind !== target.kind) return false;
        if (comment.target.id !== target.id) return false;
        if (SYS_KINDS.has(comment.target.kind)) {
            // systemId optional on either side — treat missing as "any" for back-compat
            if (target.systemId && comment.target.systemId &&
                target.systemId !== comment.target.systemId) return false;
        }
        return true;
    }

    function _nextId() {
        // Globally-unique id: a per-session token stops two live clients from minting
        // the same cmt-N and colliding when comments are broadcast (#27 part 2).
        const tok = (typeof _rtClientToken !== 'undefined' && _rtClientToken) ? _rtClientToken : 'L';
        const id = 'cmt-' + tok + '-' + reviewCounter;
        reviewCounter++;
        return id;
    }

    function addComment(target, text, parentId) {
        text = (text || '').toString().trim();
        if (!text) return null;
        const author = (activeReviewerName || '').trim() || 'Reviewer';
        const c = {
            commentId: _nextId(),
            target: {
                kind: target.kind,
                id: target.id,
                systemId: target.systemId || null
            },
            authorName: author,
            timestamp: Date.now(),
            text: text,
            status: 'open',
            parentId: parentId || null,
            resolvedAt: null,
            resolvedBy: null,
            resolutionNote: ''
        };
        reviewCommentsData.push(c);
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch(_) {}
        try { if (typeof _rtBroadcastComment === 'function') _rtBroadcastComment('upsert', { c: c }); } catch(_) {}   // #27 part 2
        return c;
    }

    function getById(commentId) {
        return reviewCommentsData.find(c => c.commentId === commentId) || null;
    }

    function resolveComment(commentId, note) {
        const c = getById(commentId);
        if (!c) return false;
        c.status = 'resolved';
        c.resolvedAt = Date.now();
        c.resolvedBy = (activeReviewerName || '').trim() || 'Reviewer';
        if (note) c.resolutionNote = note.toString();
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch(_) {}
        try { if (typeof _rtBroadcastComment === 'function') _rtBroadcastComment('upsert', { c: c }); } catch(_) {}   // #27 part 2
        return true;
    }

    function reopenComment(commentId) {
        const c = getById(commentId);
        if (!c) return false;
        c.status = 'open';
        c.resolvedAt = null;
        c.resolvedBy = null;
        c.resolutionNote = '';
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch(_) {}
        try { if (typeof _rtBroadcastComment === 'function') _rtBroadcastComment('upsert', { c: c }); } catch(_) {}   // #27 part 2
        return true;
    }

    function deleteComment(commentId) {
        // Cascade — drop the comment + every descendant reply.
        const doomed = new Set([commentId]);
        let grew = true;
        while (grew) {
            grew = false;
            reviewCommentsData.forEach(c => {
                if (c.parentId && doomed.has(c.parentId) && !doomed.has(c.commentId)) {
                    doomed.add(c.commentId);
                    grew = true;
                }
            });
        }
        const before = reviewCommentsData.length;
        reviewCommentsData = reviewCommentsData.filter(c => !doomed.has(c.commentId));
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch(_) {}
        try { if (typeof _rtBroadcastComment === 'function') _rtBroadcastComment('delete', { commentId: commentId }); } catch(_) {}   // #27 part 2
        return reviewCommentsData.length < before;
    }

    function commentsForTarget(target, includeResolved) {
        return reviewCommentsData.filter(c =>
            targetMatches(c, target) &&
            (includeResolved ? true : (c.status === 'open' || _hasOpenDescendant(c)))
        );
    }

    function _hasOpenDescendant(root) {
        // Used to keep the thread visible if any reply is still open.
        const stack = [root.commentId];
        while (stack.length) {
            const pid = stack.pop();
            const kids = reviewCommentsData.filter(c => c.parentId === pid);
            for (const k of kids) {
                if (k.status === 'open') return true;
                stack.push(k.commentId);
            }
        }
        return false;
    }

    // Build threaded view: roots (parentId === null) for the target, plus all
    // descendants in DFS order. Each thread = { root, descendants: [{c, depth}] }.
    function threadsFor(target, opts) {
        opts = opts || {};
        const includeResolved = !!opts.includeResolved;
        const all = reviewCommentsData.filter(c => targetMatches(c, target));
        const byParent = new Map();
        all.forEach(c => {
            const k = c.parentId || '__root__';
            if (!byParent.has(k)) byParent.set(k, []);
            byParent.get(k).push(c);
        });
        // Sort siblings by timestamp ascending so the conversation reads top-to-bottom.
        byParent.forEach(list => list.sort((a, b) => a.timestamp - b.timestamp));

        const roots = (byParent.get('__root__') || []);
        const threads = [];
        for (const root of roots) {
            const descendants = [];
            (function walk(parentId, depth) {
                const kids = byParent.get(parentId) || [];
                for (const k of kids) {
                    descendants.push({ c: k, depth: depth });
                    walk(k.commentId, depth + 1);
                }
            })(root.commentId, 1);

            // Apply resolved filter: drop the entire thread only if the root AND
            // every descendant are resolved.
            if (!includeResolved) {
                const anyOpen = root.status === 'open' || descendants.some(d => d.c.status === 'open');
                if (!anyOpen) continue;
            }
            threads.push({ root, descendants });
        }
        // Newest-first thread order by root timestamp.
        threads.sort((a, b) => b.root.timestamp - a.root.timestamp);
        return threads;
    }

    function openCountFor(target) {
        return reviewCommentsData.filter(c => targetMatches(c, target) && c.status === 'open').length;
    }

    function totalCountFor(target) {
        return reviewCommentsData.filter(c => targetMatches(c, target)).length;
    }

    function allOpen() {
        return reviewCommentsData
            .filter(c => c.status === 'open')
            .slice()
            .sort((a, b) => b.timestamp - a.timestamp);
    }

    function byKind(kind) {
        return reviewCommentsData.filter(c => c.target && c.target.kind === kind);
    }

    function setReviewerName(name) {
        activeReviewerName = (name || '').toString();
        try { localStorage.setItem('safetyLab.activeReviewerName', activeReviewerName); } catch(_) {}
    }

    function getReviewerName() {
        return activeReviewerName || '';
    }

    // Format a timestamp into a short human label ("just now", "5m ago", "2h ago", or yyyy-mm-dd).
    function relTime(ts) {
        if (!ts) return '';
        const diff = Date.now() - ts;
        if (diff < 30 * 1000) return 'just now';
        if (diff < 60 * 60 * 1000) return Math.round(diff / 60000) + 'm ago';
        if (diff < 24 * 60 * 60 * 1000) return Math.round(diff / 3600000) + 'h ago';
        return new Date(ts).toISOString().slice(0, 10);
    }

    // Human label for an artifact kind (used in summary tab headers / dashboard).
    // Phase 53.25 — Functions + FCIM added.
    const KIND_LABELS = {
        acFunc: 'AC Functions',
        sysFunc:'System Functions',
        acFcim: 'AC FCIM',
        sysFcim:'System FCIM',
        acFha:  'AC Hazards',
        sysFha: 'System Hazards',
        acReq:  'AC Requirements',
        sysReq: 'System Requirements',
        acAsm:  'AC Assumptions',
        sysAsm: 'System Assumptions',
        pra:    'Particular Risks',
        zsa:    'Zonal Safety',
        cma:    'Common Mode',
        fmea:   'FMEA',
        stpaScope: 'STPA Scope',     // W1 1a-2 — stakeholder confirmation of mission/scope/boundary rides the SAME approvals rail
        sourceDoc: 'Source Documents', // FIG3-4 — document-level compliance-review findings comment ON the document
        // 1 Sep 2026 — HF lanes get the same review/commenting treatment (Waqas). One kind per lane; id = the row's own id.
        hfAlloc: 'HF Function Allocation', hfTask: 'HF Task Analysis', hfHea: 'HF Human Error Analysis', hfAlerts: 'HF Crew Alerting',
        hfTid: 'HF Task Identification', hfErgo: 'HF Ergonomics', hfCd: 'HF Controls & Displays', hfSa: 'HF Situation Awareness', hfMfc: 'HF Minimum Flight Crew'
    };
    const KIND_ORDER = ['acFunc', 'sysFunc', 'acFcim', 'sysFcim', 'acFha', 'sysFha', 'pra', 'zsa', 'cma', 'fmea', 'acReq', 'sysReq', 'acAsm', 'sysAsm', 'stpaScope', 'sourceDoc', 'hfAlloc', 'hfTid', 'hfTask', 'hfHea', 'hfAlerts', 'hfErgo', 'hfCd', 'hfSa', 'hfMfc'];
    function kindLabel(k) { return KIND_LABELS[k] || k; }

    // Phase 53.71 — Approval records. Approval is an explicit reviewer action distinct
    // from comment resolution. An artifact is "approved" when (a) a reviewer has signed
    // off via approve() AND (b) there are no open review comments on it. The phase-status
    // logic on the dashboard treats only approved artifacts as counting toward "complete".
    function _approvalMatches(rec, target) {
        if (!rec || !target) return false;
        if (rec.kind !== target.kind) return false;
        if (String(rec.id) !== String(target.id)) return false;
        if (SYS_KINDS.has(rec.kind)) {
            if (target.systemId && rec.systemId && target.systemId !== rec.systemId) return false;
        }
        return true;
    }
    function getApproval(target) {
        if (!target) return null;
        return reviewApprovalsData.find(r => _approvalMatches(r, target)) || null;
    }
    function isApproved(target) {
        const rec = getApproval(target);
        if (!rec) return false;
        if (rec.signoffOnly && !rec.approvedBy) return false;   // #25 — sign-off-only record; not a binary approval
        // An approval is invalidated if there is *any* open comment on the same target.
        // Forces re-approval whenever someone reopens a concern.
        const openCount = reviewCommentsData.filter(c => targetMatches(c, target) && c.status === 'open').length;
        return openCount === 0;
    }
    function approve(target, note) {
        if (!target || !target.kind || target.id == null) return null;
        // Don't double-record — if an approval exists, refresh it (treats as re-approve).
        const existing = getApproval(target);
        const reviewer = (activeReviewerName || '').trim() || 'Reviewer';
        const now = Date.now();
        if (existing) {
            existing.approvedBy = reviewer;
            existing.approvedAt = now;
            if (note) existing.note = String(note);
        } else {
            reviewApprovalsData.push({
                kind: target.kind,
                id: target.id,
                systemId: target.systemId || null,
                approvedBy: reviewer,
                approvedAt: now,
                note: note ? String(note) : ''
            });
        }
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch(_) {}
        return getApproval(target);
    }
    function unapprove(target) {
        const idx = reviewApprovalsData.findIndex(r => _approvalMatches(r, target));
        if (idx < 0) return false;
        reviewApprovalsData.splice(idx, 1);
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch(_) {}
        return true;
    }
    function approvalCountByKind() {
        const out = {};
        reviewApprovalsData.forEach(r => { out[r.kind] = (out[r.kind] || 0) + 1; });
        return out;
    }

    return {
        targetMatches,
        addComment, getById, resolveComment, reopenComment, deleteComment,
        commentsForTarget, threadsFor, openCountFor, totalCountFor,
        allOpen, byKind,
        setReviewerName, getReviewerName,
        approve, unapprove, isApproved, getApproval, approvalCountByKind,
        relTime, kindLabel, KIND_LABELS, KIND_ORDER
    };
})();

// AutoReq candidate rows carry THREE separate fields, split apart on 1 Aug 2026:
//
//   type      — the ARP4754B §5.3.1 class of requirement (Safety, Functional,
//               Operational, Maintainability, …). See req_taxonomy.js.
//   analysis  — which analysis produced it (Probabilistic, Design Assurance,
//               Independence, Maintenance). This is what USED to sit in `type`.
//   level     — L1 aircraft / L2 system / L3 item.
//
// They were one field until the split, and "Probabilistic" was never a peer of
// "Safety": a probabilistic requirement IS a safety requirement, derived from the
// FHA. The requirements page filtered on the §5.3.1 vocabulary while every
// generator wrote the analysis vocabulary, so four of the five filter chips
// returned an empty list on the shipped Kestrel showcase.
const AutoReq = (function(){
    // Tiny non-crypto hash (DJB2) for fingerprinting.
    function hashStr(s){ let h=5381; for(let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))|0; return (h>>>0).toString(36); }
    function fp(){ return hashStr(Array.prototype.slice.call(arguments).map(p => JSON.stringify(p==null?null:p)).join('|')); }

    // Severity ranking for SPF / independence checks.
    const SEV_ORDER = SEVERITY_RANK;   // Phase 27 refactor B5 — alias to module-scope constant.

    // Walk every node in every page; cb(node, page).
    function walkAllPages(cb){
        ftaPages.forEach(page => {
            (function walk(node){
                if(!node) return;
                cb(node, page);
                const kids = node.children || node._children;
                if(kids) kids.forEach(walk);
            })(page.root);
        });
    }

    // ---------------------------------------------------------------------
    // Phase 66.27 — WHICH REQUIREMENT BUCKET DOES A FAULT-TREE PAGE BELONG TO?
    //
    // Waqas, 19 Aug 2026, looking at the live build: "why are showing L3 auto req
    // requirements at the aircraft level shouldnt they be in their respective system
    // buckets?"
    //
    // The defect: generate() takes a scope and hands it to every generator, but the
    // FTA-derived ones used it ONLY to prefix reqSource.sourceId and to pick the
    // destination store. The traversal was walkAllPages() — every page in the project,
    // with no test on treeLevel or systemId. So:
    //   - generating at aircraft scope emitted an L3 for every basic event on EVERY
    //     tree, system trees included;
    //   - generating at each system scope emitted the SAME events again into that
    //     system's store, the two rows differing only by the `ac:` vs `sys-<id>:`
    //     prefix;
    //   - the seenLids dedupe is per-run and cannot see the other bucket.
    //
    // FAIL-SAFE RULE. A page is attributed to a system only when its systemId RESOLVES
    // to a system that actually exists. A dangling systemId, or a page declaring
    // treeLevel 'system' without one, falls back to the aircraft bucket rather than
    // matching no scope at all — because the failure mode of a strict rule here is
    // that requirements silently STOP being generated, which is far worse than the
    // duplication we are fixing. Those pages are reported by unownedPages() so the
    // fallback is visible rather than quiet (spec item B4: "unowned is a finding, not
    // a fallback bucket").
    // ---------------------------------------------------------------------
    function _pageScopeKey(page){
        if(!page) return 'ac';
        if(page.systemId){
            const known = (typeof systemsData !== 'undefined' && systemsData || [])
                .some(s => s && s.id === page.systemId);
            return known ? ('sys-' + page.systemId) : 'ac';
        }
        return 'ac';
    }
    function pageInScope(page, scope){ return _pageScopeKey(page) === scope; }

    // Same walk as walkAllPages, restricted to the pages that belong to `scope`.
    function walkPagesInScope(scope, cb){
        (ftaPages || []).forEach(page => {
            if(!pageInScope(page, scope)) return;
            (function walk(node){
                if(!node) return;
                cb(node, page);
                const kids = node.children || node._children;
                if(kids) kids.forEach(walk);
            })(page.root);
        });
    }

    // Pages whose ownership could not be resolved and which therefore fell back to the
    // aircraft bucket. Surfaced so the fallback is a visible finding.
    function unownedPages(){
        return (ftaPages || []).filter(p => {
            if(!p || p.verifies) return false;
            if(p.systemId){
                return !((typeof systemsData !== 'undefined' && systemsData || [])
                    .some(s => s && s.id === p.systemId));
            }
            return p.treeLevel === 'system';
        }).map(p => ({
            id: p.id,
            name: p.name || 'Untitled',
            treeLevel: p.treeLevel || 'standalone',
            systemId: p.systemId || null,
            reason: p.systemId
                ? 'systemId "' + p.systemId + '" does not resolve to a known system'
                : 'declared a system tree but no system is set',
            bucket: 'ac'
        }));
    }

    // ---------------------------------------------------------------------
    // Phase 66.36 — A2. BUCKET BY THE DECLARED OWNER, NOT BY THE PAGE.
    //
    // U-2 / BUILD_SPEC §B2: the owner of an L3 is the system that PERFORMS THE
    // FUNCTION, not the one that houses the part and not whichever page the node
    // happens to be drawn on. C1 shipped the declaration (`node.identity`); this
    // is the first consumer of it.
    //
    // The rules live in node_identity.js and are NOT reimplemented here — this
    // file only adapts the tree shape into the ctx that SLNodeIdentity.resolveOwner
    // expects, and then applies two things resolveOwner deliberately does not:
    //
    //   1. THE EXISTENCE CHECK. resolveOwner returns whatever systemId it is given.
    //      _pageScopeKey additionally requires the id to resolve to a system that
    //      actually exists, and falls back to the aircraft bucket when it does not.
    //      That fail-safe is load-bearing: the failure mode of a strict rule here is
    //      that requirements silently STOP being generated, which is far worse than
    //      the duplication being fixed. Keep it.
    //   2. THE PAGE FALLBACK. An UNOWNED node is not filed into a void — it falls
    //      back to its page's bucket, exactly as before this change, and the page is
    //      still reported by unownedPages(). Unowned is a finding, not a bucket (U-4).
    //
    // MEASURED ON AEOLUS HL-1, 19 Aug 2026, BEFORE THIS WAS WRITTEN: 182 nodes, 0
    // carrying node.identity, 0 transfer gates. So on today's real data every node
    // resolves through the page fallback and this change moves NOTHING. That is the
    // intended blast radius — it is an enabling change, not a re-filing event. Rows
    // begin to move only as the drawer is used to declare identity, which is why A4
    // (the in-place migration) had to land in the same build.
    // ---------------------------------------------------------------------

    // A transfer gate's destination page. The codebase has accumulated four shapes for
    // this (type 'transfer', gateType 'TRANSFER', transferTo, transferRef) and a fifth
    // field for the destination (transferOutTo vs linkedPageId); accept the union rather
    // than assume, because guessing wrong here silently mis-buckets a whole branch.
    function _transferTargetPage(node){
        if(!node) return null;
        const isTransfer = node.type === 'transfer'
            || (node.type === 'gate' && node.gateType === 'TRANSFER')
            || !!node.transferTo || !!node.transferRef || !!node.transferOutTo;
        if(!isTransfer) return null;
        const pid = node.transferOutTo || node.linkedPageId || node.transferTo || node.transferRef;
        if(!pid) return null;
        return (ftaPages || []).find(p => p && String(p.id) === String(pid)) || null;
    }

    // Build the ctx resolveOwner needs for one page: parent lookup, page lookup and
    // transfer resolution. Parents are mapped once per page rather than re-walked per
    // node — genFTAEvents calls this for every leaf on the page.
    function _ownerCtx(page){
        const parents = new Map();
        (function walk(n){
            if(!n) return;
            const kids = n.children || n._children;
            if(kids) kids.forEach(c => { if(c){ parents.set(c, n); walk(c); } });
        })(page && page.root);
        return {
            parentOf: n => parents.get(n) || null,
            pageOf:   () => page,
            transferTarget: n => _transferTargetPage(n)
        };
    }

    function _systemExists(sysId){
        return !!sysId && (typeof systemsData !== 'undefined' && systemsData || [])
            .some(s => s && s.id === sysId);
    }

    // The bucket a single NODE belongs to. Falls back to the page's bucket whenever the
    // declaration is absent or does not resolve — never to a void.
    function _nodeScopeKey(node, page, ctx){
        const fallback = _pageScopeKey(page);
        const NI = (typeof window !== 'undefined' && window.SLNodeIdentity)
            || (typeof SLNodeIdentity !== 'undefined' ? SLNodeIdentity : null);
        if(!NI || typeof NI.resolveOwner !== 'function') return fallback;
        let owner = null;
        try { owner = NI.resolveOwner(node, ctx || _ownerCtx(page)); } catch(_) { return fallback; }
        if(!owner || owner.unowned || !owner.systemId) return fallback;
        // A resource node's PROVIDER owns the probabilistic requirement, once, at the
        // strictest value (U-2 / A3 — BUILT 22 Aug 2026: genFTAEvents collapses the
        // provider rows per resourceId and emits the per-consumer L2 interface
        // requirements). resolveOwner already returns the provider as `systemId` with
        // role 'provider'; honour it rather than second-guessing it.
        return _systemExists(owner.systemId) ? ('sys-' + owner.systemId) : fallback;
    }

    // Every allocation page, with its ctx built once. Verification mirrors are excluded:
    // requirements are generated from allocation trees only (Phase 61).
    function _allocationPages(){
        return (ftaPages || []).filter(p => p && !p.verifies);
    }

    // Walk every allocation page and hand back only the nodes whose OWNER puts them in
    // `scope`. Replaces walkPagesInScope for the FTA-event generator; the page-level walk
    // is kept for the DALgebra and gate-independence generators, which allocate against a
    // page's logic rather than against a node's owner (deliberate boundary — see HANDOFF).
    function walkNodesInScope(scope, cb){
        _allocationPages().forEach(page => {
            const ctx = _ownerCtx(page);
            (function walk(node){
                if(!node) return;
                if(_nodeScopeKey(node, page, ctx) === scope) cb(node, page);
                const kids = node.children || node._children;
                if(kids) kids.forEach(walk);
            })(page.root);
        });
    }

    // Find path from root → target node. Returns null if not found.
    function findPathTo(root, target){
        if(root === target) return [root];
        const kids = root.children || root._children;
        if(!kids) return null;
        for(const c of kids){ const p = findPathTo(c, target); if(p) return [root, ...p]; }
        return null;
    }

    // Determine top-event severity for a page by walking the linked FHA. The page may carry
    // its own linkedFhaId (raw internalId), or fall back to ftaConfig's prefixed AC_/SYS_ id
    // when the page is currently active. Resolve across both AC + every system folder so
    // OR-family compromise checks work on system-level trees too (Phase 27 audit A6).
    function pageTopSeverity(page){
        if (!page) return null;
        // 1. The page's linked FHA rows. 8 Aug 2026 (SL-ARC-0001 §20 D2): every
        //    seeded page carries ONLY the plural linkedFhaIds[] — reading the
        //    legacy scalar alone returned null on non-active pages, which
        //    SUPPRESSED gate-indep-phys and the OR-gate NSPF requirement there.
        //    Array first, scalar fallback, strictest severity wins — the same
        //    resolution _governingFhaForPage and _ccmrPageFha use.
        const linkIds = (Array.isArray(page.linkedFhaIds) && page.linkedFhaIds.length) ? page.linkedFhaIds : (page.linkedFhaId ? [page.linkedFhaId] : []);
        if (linkIds.length) {
            let best = null;
            linkIds.forEach(id => {
                let hit = (acFhaData || []).find(f => String(f.internalId) === String(id)) || null;
                if (!hit) {
                    for (const s of (systemsData || [])) {
                        const m = (s.fha || []).find(f => String(f.internalId) === String(id));
                        if (m) { hit = m; break; }
                    }
                }
                if (hit && hit.severity) best = moreRestrictiveSev(best, hit.severity);
            });
            if (best) return best;
        }
        // 2. Fall back to ftaConfig's prefixed id when this is the active page. Use the same
        //    AC_/SYS_ resolver the toolbar uses so sys-FHA links are honored.
        if (page.id === activeFTAPageId && ftaConfig && ftaConfig.linkedFhaId) {
            const fha = (typeof _resolveLinkedFha === 'function') ? _resolveLinkedFha(ftaConfig.linkedFhaId) : null;
            if (fha) return fha.severity || null;
        }
        return null;
    }

    // DAL ranking — alias to module-scope DAL_RANK_MAP (Phase 27 refactor B7).
    const DAL_RANK = DAL_RANK_MAP;
    function moreRestrictiveSev(a, b){
        if(!a) return b; if(!b) return a;
        return (SEV_ORDER[a] || 0) >= (SEV_ORDER[b] || 0) ? a : b;
    }

    // Phase 28 — sys FHAs now carry acTraces[] (1-to-many AC FHA references). Reads check
    // the array form first and fall back to the legacy scalar field.
    function _sysFhaAcTraces(sf){
        if (!sf) return [];
        if (Array.isArray(sf.acTraces) && sf.acTraces.length) return sf.acTraces;
        return sf.acTrace ? [sf.acTrace] : [];
    }
    // Locate the most-restrictive linked sys FHA for a given AC FHA. A sys FHA matches if
    // its acTraces array contains the AC FHA's fcId. Returns null when nothing links.
    function findLinkedSysFhaForAcFc(acFha){
        if(!acFha || !acFha.fcId) return null;
        let best = null;
        systemsData.forEach(sys => {
            (sys.fha || []).forEach(sf => {
                if(_sysFhaAcTraces(sf).includes(acFha.fcId)){
                    if(!best || (SEV_ORDER[sf.severity] || 0) > (SEV_ORDER[best.severity] || 0)) best = sf;
                }
            });
        });
        return best;
    }
    // Reverse: locate every AC FHA that a sys FHA traces to (returns the most-conservative
    // when called via the legacy [0] callsite shape — but callers should iterate when they
    // want the full set).
    function findAcFhaForSysFc(sysFha){
        const traces = _sysFhaAcTraces(sysFha);
        if (!traces.length) return null;
        // For backwards compat, return just the first matching AC FHA.
        for (const fcId of traces) {
            const hit = acFhaData.find(a => a.fcId === fcId);
            if (hit) return hit;
        }
        return null;
    }
    function findAllAcFhasForSysFc(sysFha){
        return _sysFhaAcTraces(sysFha)
            .map(fcId => acFhaData.find(a => a.fcId === fcId))
            .filter(Boolean);
    }

    // ----- Generator 1: FHA → safety + per-function DAL requirements -----
    // Probabilistic reqs: one per failure condition (per FHA hazard). When the FHA is linked
    // (sys ↔ ac via acTrace), the AC scope emits ONE combined req using the more-restrictive
    // (severity, target) of the pair; the sys scope skips it.
    // FDAL reqs: one per sub-function (subId), with the MAX DAL across all hazards on that function.
    // Phase 53.18 — read the active certification basis from projectConfig.
    // Drives AC reference (1309-1B vs 1309-1E) and class-aware analysis depth.
    function certBasisForChart() {
        const reg = (typeof projectConfig !== 'undefined' && projectConfig && projectConfig.regulation) || 'Part 25';
        const cls = (typeof projectConfig !== 'undefined' && projectConfig && projectConfig.part23Class) || 'IV';
        const isPart23 = reg === 'Part 23';
        return {
            regulation: reg,
            part23Class: cls,
            acRef: isPart23 ? 'AC 23.1309-1E' : 'AC 25.1309-1B',
            // Class IV behaves like Part 25 (full rigor for Cat/Haz). Class I & II
            // accept qualitative-only defaults for Cat/Haz where Part 25 would
            // force qual+quant. Class III sits in between — same as default for
            // now (qual+quant) but with the 23.1309-1E reference.
            classRigor: isPart23 ? cls : 'IV'
        };
    }

    // Phase 53.13/14/18 — AC 25.1309-1B Figure 2 / AC 23.1309-1E Figure 2 decision logic.
    // Returns the analysis depth required for an FHA based on severity, chartProps,
    // and the active cert basis. Drives which requirements genFHA emits.
    //
    // Cert basis differences:
    //   Part 25 / Part 23 Class IV     → full rigor (qual+quant default for Cat/Haz)
    //   Part 23 Class III              → qual+quant default for Cat/Haz, but qual
    //                                    sufficient when isSimpleConventional=true
    //   Part 23 Class II               → qualitative often sufficient for Haz/Cat
    //                                    (the smaller-aircraft path). Defaults to
    //                                    qualitative unless explicitly told the
    //                                    system is complex (isSimpleConventional=false).
    //   Part 23 Class I                → most permissive. Qualitative default for
    //                                    every severity (even Cat) on simple
    //                                    aircraft per AC 23.1309-1E §17(d).
    function decideAnalysisDepth(fha, certBasis){
        const sev = (fha && fha.severity) || '';
        // Minor / Negligible / No Effect → 17(a) & (b): verify by design and
        // installation appraisal. No safety requirement is generated. Applies to
        // both AC 25.1309-1B and AC 23.1309-1E.
        if (sev === 'Minor' || sev === 'Negligible' || sev === 'No Effect') {
            return { skip: true, reason: 'design-appraisal' };
        }
        const cb = certBasis || certBasisForChart();
        const cp = (fha && fha.chartProps) || {};
        const isPart23 = cb.regulation === 'Part 23';
        const cls = cb.classRigor;
        // Permissive class = qualitative is the conservative default for Cat/Haz.
        const permissive = isPart23 && (cls === 'I' || cls === 'II');

        // Similar to prior design — applies to all qualifying severities, both
        // regulations. AC 23.1309-1E §17(c) & (d) mirrors AC 25.1309-1B.
        if (cp.similarPrior === true) {
            return { mode: 'similarity', clause: '17(c) & (d)', branch: 'similar-prior',
                     acRef: cb.acRef, certBasis: cb };
        }

        if (sev === 'Major') {
            if (cp.isSimple === true)     return { mode: 'qualitative', clause: '17(c)', branch: 'major-simple', acRef: cb.acRef, certBasis: cb };
            if (cp.isRedundant === true)  return { mode: 'qualitative', clause: '17(c)', branch: 'major-redundant', acRef: cb.acRef, certBasis: cb };
            if (cp.isSimple === false && cp.isRedundant === false) {
                return { mode: 'qual-quant', clause: '17(c)', branch: 'major-complex', acRef: cb.acRef, certBasis: cb };
            }
            // Major uncharacterized — for permissive classes (I/II) default to
            // qualitative; otherwise default to conservative qual+quant.
            return {
                mode: permissive ? 'qualitative' : 'qual-quant',
                clause: '17(c)',
                branch: permissive ? 'major-uncharacterized-permissive' : 'major-uncharacterized',
                acRef: cb.acRef, certBasis: cb,
                uncharacterized: true
            };
        }

        if (sev === 'Hazardous' || sev === 'Catastrophic') {
            if (cp.isSimpleConventional === true) {
                return { mode: 'qualitative', clause: '17(d)', branch: 'cat-haz-simple-conventional',
                         acRef: cb.acRef, certBasis: cb };
            }
            if (cp.isSimpleConventional === false) {
                return { mode: 'qual-quant', clause: '17(c)', branch: 'cat-haz-complex',
                         acRef: cb.acRef, certBasis: cb };
            }
            // Uncharacterized Cat/Haz. Class I/II default to qualitative
            // (permissive path); Class III/IV and Part 25 default to qual+quant.
            return {
                mode: permissive ? 'qualitative' : 'qual-quant',
                clause: permissive ? '17(d)' : '17(c)',
                branch: permissive ? 'cat-haz-uncharacterized-permissive' : 'cat-haz-default',
                acRef: cb.acRef, certBasis: cb,
                uncharacterized: true
            };
        }
        return { skip: true, reason: 'unknown-severity' };
    }

    // Phase 53.17 — group FHA records by fcId so duplicates (same FC referenced
    // by multiple rows across phases / pages / imports) collapse into a single
    // canonical record. Worst-severity wins; chartProps roll up with "more
    // conservative wins" (any answer that drives toward qual+quant defeats
    // similarity/qualitative-only).
    function _rollupChartProp(members, key, conservativeValue) {
        let anyConservative = false, anyTrue = false;
        for (const m of members) {
            const cp = (m && m.chartProps) || {};
            if (cp[key] === conservativeValue) anyConservative = true;
            if (cp[key] === true) anyTrue = true;
        }
        if (anyConservative) return conservativeValue;
        if (anyTrue) return true;
        return null;
    }

    function _canonicalizeFhaGroup(members) {
        if (members.length === 1) return members[0];
        // Pick the most-restrictive severity member as the canonical base.
        let canonical = members[0];
        for (let i = 1; i < members.length; i++) {
            const winnerSev = moreRestrictiveSev(canonical.severity, members[i].severity);
            if (winnerSev === members[i].severity && winnerSev !== canonical.severity) {
                canonical = members[i];
            }
        }
        // Synthetic canonical — don't mutate the source FHA.
        const out = Object.assign({}, canonical);
        // chartProps rollup: similarPrior=false is more conservative (forces deeper
        // analysis); isSimple/isRedundant/isSimpleConventional=false is more conservative
        // (drives toward qual+quant).
        out.chartProps = {
            similarPrior:         _rollupChartProp(members, 'similarPrior', false),
            isSimple:             _rollupChartProp(members, 'isSimple', false),
            isRedundant:          _rollupChartProp(members, 'isRedundant', false),
            isSimpleConventional: _rollupChartProp(members, 'isSimpleConventional', false)
        };
        // Union of phases (comma-separated lists in each member).
        const phasesSet = new Set();
        members.forEach(m => {
            const s = (m && m.phases) ? String(m.phases) : '';
            s.split(',').map(x => x.trim()).filter(Boolean).forEach(p => phasesSet.add(p));
        });
        out.phases = Array.from(phasesSet).join(', ');
        // Union of subIds across all members.
        const subSet = new Set();
        members.forEach(m => {
            if (Array.isArray(m && m.subIds)) m.subIds.forEach(s => subSet.add(s));
            else if (m && m.subId) subSet.add(m.subId);
        });
        out.subIds = Array.from(subSet);
        out.subId = out.subIds[0] || canonical.subId || '';
        // Union of assumption IDs.
        const asmSet = new Set();
        members.forEach(m => (m && m.assumptionIds || []).forEach(a => asmSet.add(a)));
        out.assumptionIds = Array.from(asmSet);
        // Longest fcDesc is usually the most complete one.
        out.fcDesc = members.reduce((best, m) => {
            const d = (m && m.fcDesc) || '';
            return d.length > best.length ? d : best;
        }, '');
        // Track every contributing internalId — feeds the fingerprint so any edit
        // to any duplicate re-stales the requirement.
        out._contributingIds = members.map(m => m.internalId).filter(Boolean).sort();
        out._duplicateCount  = members.length;
        return out;
    }

    function _groupFhaByFcId(fhaArr) {
        const groups = new Map();
        (fhaArr || []).forEach(f => {
            if (!f || !f.severity) return;
            const id = (f.fcId || '').trim();
            // Records without an fcId can't be deduplicated; each gets its own group.
            const key = id ? id : ('__no-fcid__' + (f.internalId || Math.random()));
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(f);
        });
        return groups;
    }

    // ---------------------------------------------------------------------
    // Phase 56.50 — requirement-syntax house style (EARS / INCOSE + ARP form).
    // Every generated requirement carries exactly ONE "shall", active voice,
    // condition-first, and NO parentheticals, citations, IDs, or derivation
    // math in the normative text — all of that lives in the rationale field.
    // Fingerprints carry a 'v2' token where text forms changed, so existing
    // generated requirements update in place (one expected stale pass).
    // ---------------------------------------------------------------------
    // Lowercase the first letter for mid-sentence flow unless the first word
    // is an acronym (all-caps, len>1).
    function _midSentence(s) {
        const str = (s || '').trim();
        if (!str) return str;
        const fw = str.split(/\s+/)[0] || '';
        if (fw && fw === fw.toUpperCase() && fw.length > 1) return str;
        return str.charAt(0).toLowerCase() + str.slice(1);
    }
    // "A" / "A and B" / "A, B, and C" — natural-language list subject.
    function _subjectList(names) {
        const n = (names || []).filter(Boolean);
        if (!n.length) return '';
        if (n.length === 1) return n[0];
        if (n.length === 2) return n[0] + ' and ' + n[1];
        return n.slice(0, -1).join(', ') + ', and ' + n[n.length - 1];
    }

    // ---------------------------------------------------------------------
    // CCMR pair-trace (Waqas's ruling, 3 Aug 2026 — §1b "CCMR τ vs the NTE
    // bound", REFINED same day; behavior calls ruled 4 Aug). The repair-credit
    // row (periodic τ / monitored μ) is a MAINTAINABILITY requirement that
    // IMPLEMENTS and VERIFIES the governing probabilistic SAFETY requirement —
    // the fha-prob row of the FC linked to the tree page. NO new requirement
    // text is emitted in either direction: the safety requirement keeps its
    // original probabilistic wording, the NTE stays a derived quantity on the
    // CCMR page, and τ over the bound surfaces as a trace-level conflict
    // (INV-46, ADVISORY — his call, 4 Aug), never a rewrite of either number.
    // Governing = the most-restrictive linked FHA row, the same resolution
    // the CCMR latent sweep uses (_ccmrPageFha).
    function _governingFhaForPage(page){
        if (!page) return null;
        const ids = (Array.isArray(page.linkedFhaIds) && page.linkedFhaIds.length) ? page.linkedFhaIds : (page.linkedFhaId ? [page.linkedFhaId] : []);
        let best = null;
        ids.forEach(id => {
            let fha = (acFhaData || []).find(x => x && String(x.internalId) === String(id));
            let home = 'ac';
            if (!fha) {
                for (const s of (systemsData || [])) {
                    const m = ((s && s.fha) || []).find(x => x && String(x.internalId) === String(id));
                    if (m) { fha = m; home = 'sys-' + s.id; break; }
                }
            }
            if (fha && fha.severity && (!best || (SEV_ORDER[fha.severity] || 0) > (SEV_ORDER[best.fha.severity] || 0))) best = { fha, home };
        });
        if (!best) return null;
        // Effective severity mirrors genFHA's linkage rule (more restrictive wins),
        // so the pair-trace gates on the same target the safety requirement carries.
        let effSev = best.fha.severity;
        try {
            if (best.home === 'ac' && typeof findLinkedSysFhaForAcFc === 'function') {
                const ls = findLinkedSysFhaForAcFc(best.fha);
                if (ls && ls.severity && typeof moreRestrictiveSev === 'function') effSev = moreRestrictiveSev(effSev, ls.severity);
            }
        } catch (_) {}
        let prob = null;
        try { const t = getSafetyTarget(effSev); if (t && t.prob != null) prob = t.prob; } catch (_) {}
        return {
            fha: best.fha, home: best.home, effSev, prob,
            fcId: best.fha.fcId || ('#' + best.fha.internalId),
            sourceId: best.home + ':fha:prob:' + best.fha.internalId
        };
    }
    // Is the governing safety requirement ACCEPTED into its home register, or
    // still preview-only? (HL-1 today: 0 of 30 fha-prob rows accepted.) Ruling
    // 4 Aug: trace ANYWAY — the governing FHA ROW exists either way — name the
    // gap in the rationale, and carry the register state in the fingerprint so
    // accepting the safety requirement re-flags the pair updated (self-heals).
    function _govSafetyAccepted(gov){
        if (!gov) return false;
        try {
            const st = storeForScope(gov.home) || [];
            return st.some(r => r && !r.deleted && r.reqSource && r.reqSource.sourceId === gov.sourceId);
        } catch (_) { return false; }
    }

    function genFHA(fhaArr, scopeKey){
        const out = [];
        const isAcScope = scopeKey === 'ac';

        // Phase 53.17 — collapse duplicate fcId entries into canonical groups
        // before applying the per-FC decision tree.
        const groups = _groupFhaByFcId(fhaArr);
        const canonicals = [];
        groups.forEach(members => canonicals.push(_canonicalizeFhaGroup(members)));

        // Reverse side of the CCMR pair-trace: which repair-credit maintenance
        // requirements implement each FHA row's probabilistic safety requirement.
        // Walked over ALLOCATION pages only (mirrors are evidence sinks), keyed
        // by the governing row's internalId, deduped across common-mode repeats.
        const implBySafety = new Map();   // fha.internalId → [fta-interval sourceIds]
        (ftaPages || []).forEach(p => {
            if (!p || !p.root || p.verifies) return;
            // Phase 66.27 — this builds sourceIds with the scope prefix, so it must only
            // walk pages that belong to this scope, or an aircraft-scope run claims the
            // maintenance requirements of every system's trees.
            if (!pageInScope(p, scopeKey)) return;
            const gov = _governingFhaForPage(p);
            if (!gov) return;
            (function walk(n){
                if (!n) return;
                if ((n.type === 'basic' || n.type === 'undeveloped') &&
                    ((n.repairModel === 'periodic' && n.tau) || (n.repairModel === 'monitored' && n.mu))) {
                    const lid = n.logicalId != null ? n.logicalId : n.id;
                    const sid = `${scopeKey}:fta-interval:${lid}`;
                    const arr = implBySafety.get(gov.fha.internalId) || [];
                    if (arr.indexOf(sid) < 0) arr.push(sid);
                    implBySafety.set(gov.fha.internalId, arr);
                }
                (n.children || n._children || []).forEach(walk);
            })(p.root);
        });

        // ----- Per-hazard safety reqs (probabilistic + qualitative), with linkage dedup -----
        // Chart-aware: severity + chartProps drive which req types are emitted.
        // - Min/Neg              → nothing (design-appraisal path)
        // - similarPrior         → similarity-argument req only
        // - qualitative branch   → qualitative assessment req only
        // - qual-quant branch    → qualitative + probabilistic reqs
        canonicals.forEach(fha => {
            if(!fha || !fha.severity) return;

            // Phase 53.18 — cert basis lookup is project-wide; pass it through
            // so generated reqs cite the right AC (1309-1B for Part 25, 1309-1E
            // for Part 23) and Class I/II get the permissive defaults.
            const certBasis = certBasisForChart();
            const depth = decideAnalysisDepth(fha, certBasis);
            if (depth.skip) return;

            let linkedSysFha = null, linkedAcFha = null;
            if(isAcScope){
                linkedSysFha = findLinkedSysFhaForAcFc(fha);
            } else {
                linkedAcFha = findAcFhaForSysFc(fha);
                // Sys-side: if this FC is linked to an AC FC, the AC-scope generator owns the combined req. Skip it here.
                if(linkedAcFha) return;
            }

            // Effective (more-restrictive) target for this hazard, accounting for linkage.
            let effSev = fha.severity;
            if(linkedSysFha) effSev = moreRestrictiveSev(fha.severity, linkedSysFha.severity);
            const t = getNormalizedSafetyTarget(effSev, fha.phases);

            const fcLabelShort = fha.fcId ? `${fha.fcId} (${fha.fcDesc || 'failure condition'})` : (fha.fcDesc || 'the identified failure condition');

            // Phase 56.49b — Qualitative FHA requirements (Similarity Argument,
            // Qualitative Assessment) suppressed. They were non-verifiable prose
            // that bloated the SRDD without adding cert-defensible content. The
            // FC's quantitative probability budget IS the safety requirement
            // (AC 25.1309-1A); narrative justification belongs in the FHA report
            // / SSA, not in the generated SRDD. Only the probabilistic branch
            // continues below.
            const certClassClause = (certBasis.regulation === 'Part 23')
                ? `${certBasis.acRef} §${depth.clause} (Class ${certBasis.part23Class})`
                : `${certBasis.acRef} §${depth.clause}`;
            if (depth.mode === 'similarity') return;   // similarity-only branch → no req emitted
            if (depth.mode !== 'qual-quant') return;
            if (t.prob === null) return;   // no quantitative target (shouldn't happen for Cat/Haz/Maj)

            const fcSubject = _midSentence(fha.fcDesc || (fha.fcId ? 'failure condition ' + fha.fcId : 'the identified failure condition'));
            const phaseLabel = fha.phases ? fha.phases : 'all applicable flight phases';
            const phaseClause = fha.phases ? ` during ${fha.phases}` : '';
            let linkRat = '';
            if(linkedSysFha){
                const winner = effSev === fha.severity ? 'AC' : 'System';
                linkRat = ` Linked to system FC ${linkedSysFha.fcId}; the combined target is the more restrictive of AC (${fha.severity}) and System (${linkedSysFha.severity}) — ${winner} governs.`;
            }

            // Top-event probability target is NOT normalized — the cert basis quotes 1e-9/FH
            // (or whatever severity bucket) as an *averaged* rate over the flight envelope.
            // Phase exposure context belongs in the rationale + fingerprint so phase changes
            // re-stale derived event allocations, but the headline target stands as-is.
            const hasNormalization = fha.phases && t.matchedPhases.length && t.exposureRatio < 0.999;
            let exposureRat = '';
            if (hasNormalization) {
                const rPct = t.exposureRatio * 100;
                const rPctStr = rPct < 1 ? rPct.toFixed(2) : rPct.toFixed(1);
                exposureRat = ` Phase exposure: ${t.exposedHours.toFixed(2)} h of ${t.totalHours.toFixed(2)} h flight (r=${rPctStr}%; ${t.matchedPhases.join(', ')}). Basic-event allocations under this hazard should be expressed as operational rates during these phases (event-allocation normalization, not target rescaling).`;
            }

            // Phase 56.50 — ARP 4761 / AIR6110 form: "The probability of <FC>
            // during <phase> shall not exceed P per flight." One shall, condition
            // in the sentence, everything derivational (per-FH equivalence,
            // envelope math, linkage, severity, citation) in the rationale.
            let mhFc = 0;
            try { if (typeof _missionHoursForNormalization === 'function') mhFc = _missionHoursForNormalization() || 0; } catch (_) {}
            if (!mhFc && t.totalHours) mhFc = t.totalHours;
            const pFc = mhFc ? -Math.expm1(-t.prob * mhFc) : null;
            // CCMR pair-trace, reverse direction (3 Aug ruling): name the
            // repair-credit maintenance requirements that implement this safety
            // requirement. Rationale + context + fingerprint only — the
            // probabilistic wording above is UNTOUCHED (his refinement: no new
            // requirement text; dwell-time imperatives have no testability).
            // Tokens join the fingerprint only when the list is non-empty, so
            // projects with no repair-model events see zero re-stale churn.
            const implIds = [];
            ((fha._contributingIds && fha._contributingIds.length) ? fha._contributingIds : [fha.internalId]).forEach(cid => {
                (implBySafety.get(cid) || []).forEach(s => { if (implIds.indexOf(s) < 0) implIds.push(s); });
            });
            implIds.sort();
            const implRat = implIds.length
                ? ` Implemented and verified by the repair-credit maintenance requirement(s) ${implIds.join(', ')} (CCMR pair-trace); an authored interval over the CCMR not-to-exceed bound surfaces as a trace conflict — INV-46 — never as a rewrite of this target.`
                : '';
            out.push({
                text: pFc != null
                    ? `The probability of ${fcSubject}${phaseClause} shall not exceed ${pFc.toExponential(2)} per flight.`
                    : `The probability of ${fcSubject}${phaseClause} shall not exceed ${t.prob.toExponential(2)} per flight hour.`,
                rat: `${fha.fcId ? fha.fcId + ' — ' : ''}${effSev} per ${certBasis.acRef}.` +
                     (pFc != null ? ` Equivalent to ≤ ${t.prob.toExponential(2)} per flight hour averaged over the ${mhFc.toFixed(2)} h flight envelope (cert-basis form).` : '') +
                     `${linkRat} Phase: ${phaseLabel}.${exposureRat}${implRat}`,
                level: 'L1', type: 'Safety', analysis: 'Probabilistic',
                verifMethod: 'Analysis',
                traceId: fha.subId || '',
                reqSource: {
                    generator: 'fha-prob',
                    sourceId: `${scopeKey}:fha:prob:${fha.internalId}`,
                    context: {
                        severity: fha.severity, phases: fha.phases, fcId: fha.fcId,
                        effSeverity: effSev, dal: t.dal, prob: t.prob, scope: t.scope,
                        linkedSysFcId: linkedSysFha ? linkedSysFha.fcId : null,
                        linkedSysSeverity: linkedSysFha ? linkedSysFha.severity : null,
                        // Phase normalization context — drives the stale-detection fingerprint so
                        // edits to phase durations / FHA phase list re-flag the requirement.
                        exposureRatio:   t.exposureRatio,
                        exposedHours:    t.exposedHours,
                        totalHours:      t.totalHours,
                        matchedPhases:   t.matchedPhases,
                        phaseActiveProb: t.phaseActiveProb,
                        missionProb:     t.missionProb,
                        // CCMR pair-trace — the maintenance requirements that implement this one.
                        implementedBy:   implIds
                    },
                    fingerprint: fp('fha-prob', 'v2', fha.severity, fha.phases, fha.fcId, fha.fcDesc,
                                    t.dal, t.prob, t.scope,
                                    linkedSysFha ? linkedSysFha.fcId : '',
                                    linkedSysFha ? linkedSysFha.severity : '',
                                    // Round to 6 sig figs to avoid spurious staleness from float jitter.
                                    Math.round(t.exposureRatio * 1e6) / 1e6,
                                    t.matchedPhases.slice().sort(),
                                    // Sorted contributing internalIds so edits to any duplicate re-stale.
                                    fha._contributingIds || [],
                                    // CCMR pair-trace tokens ride only when a pair exists (no global churn).
                                    ...(implIds.length ? ['impl'].concat(implIds) : [])),
                    generatedAt: Date.now()
                }
            });
        });

        // ----- Per-function FDAL reqs: one per sub-function with max DAL across that function's hazards -----
        // For AC scope, sub-functions come from acFunctionsData (subId/subName/subDef).
        // For Sys scope, they come from sys().functions.
        const funcMeta = isAcScope
            ? acFunctionsData
            : ((systemsData.find(s => 'sys-' + s.id === scopeKey) || {}).functions || []);
        const funcByKey = new Map();
        funcMeta.forEach(f => funcByKey.set(f.subId, f));

        // Group hazards by subId; aggregate severity (most-restrictive) accounting for linkage.
        // Phase 28 — FHAs now carry subIds[] (1-to-many functions). Each FHA contributes to
        // EVERY listed function's FDAL allocation. Legacy single .subId still honored as fallback.
        const bySub = new Map();
        (fhaArr || []).forEach(fha => {
            if(!fha || !fha.severity) return;
            // Phase 53.14 — Min/Neg/No-Effect FCs do not contribute to FDAL allocation.
            // Chart says they're verified by design appraisal only; no DAL req.
            if (fha.severity === 'Minor' || fha.severity === 'Negligible' || fha.severity === 'No Effect') return;
            const fnIds = (Array.isArray(fha.subIds) && fha.subIds.length) ? fha.subIds : (fha.subId ? [fha.subId] : []);
            if(!fnIds.length) return;
            let effSev = fha.severity;
            let linkedSysFha = isAcScope ? findLinkedSysFhaForAcFc(fha) : null;
            let linkedAcFha = !isAcScope ? findAcFhaForSysFc(fha) : null;
            if(linkedSysFha) effSev = moreRestrictiveSev(effSev, linkedSysFha.severity);
            if(linkedAcFha){
                // Sys-scope FDAL: skip if linked (covered by AC-side FDAL on the parent function).
                return;
            }
            fnIds.forEach(subId => {
                if(!bySub.has(subId)) bySub.set(subId, { fhaList: [], effSev: null, linkNotes: [] });
                const ent = bySub.get(subId);
                ent.fhaList.push(fha);
                ent.effSev = moreRestrictiveSev(ent.effSev, effSev);
                if(linkedSysFha) ent.linkNotes.push(`${fha.fcId} ↔ ${linkedSysFha.fcId} (sys ${linkedSysFha.severity})`);
            });
        });

        bySub.forEach((ent, subId) => {
            const t = getSafetyTarget(ent.effSev);
            if(!t.dal) return;
            const fmeta = funcByKey.get(subId);
            // System-scope functions only carry funcName now (subName was dropped in Phase 24);
            // AC-scope keeps the legacy sub-* fields. Use whichever name field exists.
            const funcName = fmeta ? (fmeta.funcName || fmeta.subName || '') : '';
            const hazList = ent.fhaList.map(h => `${h.fcId} [${h.severity}]`).join(', ');
            const linkRat = ent.linkNotes.length ? ` Linked FCs: ${ent.linkNotes.join('; ')}.` : '';
            // Phase 56.50 — the function is the subject; driving hazards, linkage,
            // and the cert-basis citation move to the rationale.
            const funcSubject = funcName
                ? (/function/i.test(funcName) ? `The ${funcName}` : `The ${funcName} function`)
                : `Function ${subId}`;

            out.push({
                text: `${funcSubject} shall be developed to FDAL ${t.dal}.`,
                rat: `Function ${subId}. FDAL allocated per ${t.scope}: maximum across the hazards this function contributes to (${hazList}). Effective severity ${ent.effSev}.${linkRat}`,
                level: 'L1', type: 'Safety', analysis: 'Design Assurance',
                verifMethod: 'Inspection',
                traceId: subId,
                reqSource: {
                    generator: 'fha-dal',
                    sourceId: `${scopeKey}:fha:dal:func:${subId}`,
                    context: {
                        subId, effSeverity: ent.effSev, dal: t.dal, scope: t.scope,
                        fhaIds: ent.fhaList.map(h => h.internalId),
                        linked: ent.linkNotes
                    },
                    fingerprint: fp('fha-dal-func', 'v2', subId, ent.effSev, t.dal, t.scope,
                                    ent.fhaList.map(h => h.fcId + ':' + h.severity).sort(),
                                    ent.linkNotes.slice().sort()),
                    generatedAt: Date.now()
                }
            });
        });

        return out;
    }

    // ----- Generator 2: FTA basic events → reliability requirements -----
    function genFTAEvents(scopeKey){
        const out = [];
        const seenLids = new Set();
        // ------------------------------------------------------------------ A3
        // Declared common resources (node.identity.kind === 'resource'). The
        // provider owns ONE probabilistic L3 per resource, at the strictest
        // allocated value across every consuming tree; each consuming system owns
        // an L2 interface requirement pinning the assumption ITS trees make.
        // Collected during the walk, emitted after it. A resource node whose
        // provider does not resolve to a real system keeps the legacy per-node
        // path below — the fail-safe posture of this generator (a strict rule
        // whose failure mode is requirements silently NOT generated is worse
        // than the duplication A3 removes).
        const _resUses = new Map();   // resourceId → [{ node, page, lid, p, consumerSystemId }]
        const _resDeclared = (node) => node.identity && node.identity.kind === 'resource'
            && node.identity.resourceId != null && String(node.identity.resourceId).trim() !== ''
            && node.identity.providerSystemId && _systemExists(node.identity.providerSystemId);
        const _sysLabel = id => {
            const s = (systemsData || []).find(x => x && x.id === id);
            return s ? (s.name || String(id)) : String(id);
        };
        // Resolve the page's linked-FHA exposure once per page so we don't recompute on every event.
        const pageExposure = new Map();   // pageId → { exposureRatio, exposedHours, totalHours, matchedPhases, fhaFcId }
        (ftaPages || []).forEach(p => {
            // Phase 28 item 4 — pages can link multiple FHAs (linkedFhaIds[]). For exposure
            // we take the most-restrictive linked FHA's phases (driving target).
            const ids = (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds : (p.linkedFhaId ? [p.linkedFhaId] : []);
            if (!ids.length) return;
            let f = null;
            for (const lid of ids) {
                let cand = (acFhaData || []).find(x => String(x.internalId) === String(lid));
                if (!cand) {
                    for (const s of (systemsData || [])) {
                        const m = (s.fha || []).find(x => String(x.internalId) === String(lid));
                        if (m) { cand = m; break; }
                    }
                }
                if (!cand) continue;
                if (!f || (SEV_ORDER[cand.severity] || 0) > (SEV_ORDER[f.severity] || 0)) f = cand;
            }
            if (!f || !f.phases) return;
            const exp = getPhaseExposureRatio(f.phases);
            pageExposure.set(p.id, Object.assign({}, exp, { fhaFcId: f.fcId, fhaSeverity: f.severity }));
        });

        // CCMR pair-trace, forward direction (3 Aug ruling): resolve each
        // allocation page's GOVERNING probabilistic safety requirement once.
        const pageGoverning = new Map();   // pageId → { sourceId, fcId, effSev, prob, accepted }
        (ftaPages || []).forEach(p => {
            if (!p || p.verifies) return;
            const gov = _governingFhaForPage(p);
            if (gov) pageGoverning.set(p.id, Object.assign({}, gov, { accepted: _govSafetyAccepted(gov) }));
        });

        // Phase 66.36 (A2) — was walkPagesInScope: every node on a page inherited the
        // page's bucket. Now each NODE is filed by its own resolved owner, so a branch
        // declared to FCS on an aircraft PASA page files into the FCS bucket instead of
        // sitting at aircraft level. Nodes with no declaration still resolve to the
        // page's bucket, so this is behaviour-preserving on undeclared trees.
        walkNodesInScope(scopeKey, (node, page) => {
            if(!node || (node.type !== 'basic' && node.type !== 'undeveloped')) return;
            // Phase 61 — requirements are generated from ALLOCATION trees only. Verification
            // mirrors are evidence sinks, not requirement sources (generating from them would
            // restate computed values as requirements).
            if (page && page.verifies) return;
            const lid = node.logicalId != null ? node.logicalId : node.id;
            if(seenLids.has(lid)) return;   // dedupe across common-mode repeats
            seenLids.add(lid);
            // Phase 61 — the allocated PROBABILITY budget is the requirement quantity.
            // Allocation is probability-only: no λ exists on allocation-tree leaves, and
            // none is derived. λ (with its repair model) lives on the verification tree,
            // where getAutoReqVerificationEvidence compares computed P against this budget.
            const pAllocated = parseFloat(node.probability) || 0;
            if(pAllocated <= 0) return;

            // A3 — a declared resource with a resolving provider is NOT a per-node
            // requirement: collect the use; the collapsed provider row (and the
            // consumers' interface rows) are emitted after the walk.
            if (_resDeclared(node)) {
                const NI = (typeof window !== 'undefined' && window.SLNodeIdentity)
                    || (typeof SLNodeIdentity !== 'undefined' ? SLNodeIdentity : null);
                let consumer = null;
                try {
                    const own = NI && NI.resolveOwner ? NI.resolveOwner(node, _ownerCtx(page)) : null;
                    consumer = own && own.consumerSystemId && _systemExists(own.consumerSystemId)
                        ? own.consumerSystemId : null;
                } catch (_) { consumer = null; }
                const rid = String(node.identity.resourceId);
                if (!_resUses.has(rid)) _resUses.set(rid, []);
                _resUses.get(rid).push({ node, page, lid, p: pAllocated, consumerSystemId: consumer });
                return;
            }

            // Phase 56.50 — repair/monitoring credit and library provenance are NOT
            // part of the probability requirement's normative text. The repair model
            // becomes its own singular maintenance requirement (below); the library
            // reference moves to the rationale.
            let repairRat = '';
            if(node.repairModel === 'monitored' && node.mu){
                repairRat = ` The allocation takes credit for continuous monitoring with repair (μ ≥ ${(+node.mu).toExponential(2)}/h) — see the companion maintenance requirement.`;
            } else if(node.repairModel === 'periodic' && node.tau){
                repairRat = ` The allocation takes latent-failure detection credit (periodic test, τ ≤ ${node.tau} h) — see the companion maintenance requirement.`;
            }
            const libRat = node.libraryKey ? ` Component library ref: ${node.libraryKey}.` : '';

            // Phase-exposure normalization. λ stored on the node is interpreted as the
            // OPERATIONAL rate (failures per hour while exposed). The cert basis target is
            // expressed as an AVERAGED rate (per flight hour over the whole envelope).
            // Bridge: λ_averaged = λ_operational × r. We surface both so the supplier sees the
            // rate they design to, and the safety reviewer sees how it rolls up to FAR 1309.
            const exp = pageExposure.get(page.id);
            const exposureNormalized = exp && exp.matchedPhases.length && exp.ratio < 0.999;
            // Express the allocation as a PROBABILITY of failure per flight, not a rate. t_exposed is
            // the hours the event is exposed per flight; P = 1 − e^(−λ·t_exposed). λ still travels in
            // reqSource.context (below) for verification — only the requirement prose changes.
            let missionHours = 0;
            try { if (typeof _missionHoursForNormalization === 'function') missionHours = _missionHoursForNormalization() || 0; } catch (_) {}
            if (!missionHours && exp && exp.totalHours) missionHours = exp.totalHours;
            const tExposed = exposureNormalized ? exp.exposedHours : (missionHours || (exp && exp.totalHours) || 1);
            // Phase 61 — the allocated budget IS the requirement value; no λ→P conversion.
            // tExposed above is retained purely as the requirement's time-basis label.
            const pFlight = pAllocated;
            const pStr = (isFinite(pFlight) && pFlight > 0) ? pFlight.toExponential(2) : '0';
            // Phase 56.50 — exposure math is derivation, not requirement. The
            // normative text states only the budget; the accrual window, exposure
            // ratio and time basis live in the rationale.
            let phaseRat = '';
            if (exposureNormalized) {
                const rPct = exp.ratio * 100;
                const rStr = rPct < 1 ? rPct.toFixed(2) : rPct.toFixed(1);
                phaseRat = ` Budget accrues while exposed during ${exp.matchedPhases.join(', ')} (${exp.exposedHours.toFixed(2)} h of the ${exp.totalHours.toFixed(2)} h flight envelope, r=${rStr}%; page top hazard ${exp.fhaFcId || ''}).`;
            } else if (missionHours || (exp && exp.totalHours)) {
                phaseRat = ` Time basis: the ${(missionHours || exp.totalHours).toFixed(2)} h flight.`;
            }

            // Phase 56.18d — external-source rationale. When the event inherits
            // its target from another FHA row or FTA node, the requirement text
            // should say so explicitly and the fingerprint should pick up the
            // link so regeneration after an external move marks the req stale.
            let extRat = '';
            let extFingerprintTokens = [];
            if (node.externalSource) {
                const src = node.externalSource;
                const kind = src.kind || (src.targetId && !src.targetNodeId ? 'fha' : (src.targetNodeId ? 'fta' : ''));
                const scopeStr = src.scope === 'aircraft' ? 'aircraft-level' : ('system ' + (((systemsData || []).find(s => s.id === src.systemId) || {}).name || src.systemId || '?'));
                if (kind === 'fha') {
                    extRat = ` Inherited from ${scopeStr} FHA row ${src.targetId}; this event's rate is fixed by that hazard's allocated target.`;
                    extFingerprintTokens = ['ext-fha', src.scope || '', src.systemId || '', src.targetId || ''];
                } else if (kind === 'fta') {
                    extRat = ` Inherited from ${scopeStr} FTA node ${src.targetNodeId} on page ${src.targetPageId}; this event's rate is fixed by the linked node's computed probability.`;
                    extFingerprintTokens = ['ext-fta', src.scope || '', src.systemId || '', src.targetPageId || '', src.targetNodeId || ''];
                }
                if (node._externalAllocation && node._externalAllocation.overrun) {
                    extRat += ` Allocator flag: apportioned target (${node._externalAllocation.apportioned.toExponential(2)}) exceeded the inherited ceiling (${node._externalAllocation.external.toExponential(2)}); the inherited value governs.`;
                }
            }

            // Phase 56.50 — description as subject (event ID lives only in the trace
            // tag). One shall; repair credit and library provenance in the rationale.
            // When the event NAME is already a failure statement ("… fails",
            // "loss of …"), don't prepend "failure of" — that reads double.
            const subjName = node.name || node.displayId || 'the component';
            const failurePhrased = /(fail|loss|lost|erroneous|inadvertent|jam|rupture|leak|inoperative|unavailable)/i.test(subjName);
            // Verb-phrased names ("… fails") take "The probability THAT X fails";
            // noun-phrased failures ("loss of …") take "The probability OF …".
            const verbPhrased = /(fails?|failed|jams?|jammed|ruptures?|ruptured|leaks?|leaked|sticks?|stuck|opens?|closes?|disconnects?|activates?|deploys?|bursts?)$/i.test(subjName.trim());
            out.push({
                text: verbPhrased
                    ? `The probability that ${_midSentence(subjName)} shall not exceed ${pStr} per flight.`
                    : (failurePhrased
                        ? `The probability of ${_midSentence(subjName)} shall not exceed ${pStr} per flight.`
                        : `The probability of failure of ${_midSentence(subjName)} shall not exceed ${pStr} per flight.`),
                rat: `Allocated from the fault tree on page ${page.name}.${phaseRat}${repairRat}${libRat}${extRat}`,
                level: 'L3', type: 'Safety', analysis: 'Probabilistic',
                verifMethod: 'Analysis',
                traceId: node.displayId || '',
                reqSource: {
                    generator: 'fta-event',
                    sourceId: `${scopeKey}:fta-event:${lid}`,
                    context: {
                        // Phase 61 — the allocated PROBABILITY budget is the requirement's
                        // quantitative target. Verification evidence compares the mirror
                        // node's computed P (λ + repair/Markov model) against pAllocated.
                        pAllocated,
                        exposureBasisHours: tExposed,
                        libraryKey: node.libraryKey || '',
                        repairModel: node.repairModel || 'unmaintained',
                        mu: node.mu || 0, tau: node.tau || 0,
                        exposureRatio:      exp ? exp.ratio : 1,
                        matchedPhases:      exp ? exp.matchedPhases : [],
                        linkedFhaFcId:      exp ? exp.fhaFcId : null,
                        // Phase 56.18d — capture external-source state so the req
                        // can be re-validated on regen and surfaced in the UI.
                        externalSource:     node.externalSource ? Object.assign({}, node.externalSource) : null,
                        externalAllocation: node._externalAllocation ? Object.assign({}, node._externalAllocation) : null
                    },
                    fingerprint: fp('fta-event', 'v2', pAllocated, node.libraryKey, node.repairModel, node.mu, node.tau,
                                    exp ? Math.round(exp.ratio * 1e6) / 1e6 : 1,
                                    exp ? exp.matchedPhases.slice().sort() : [],
                                    ...extFingerprintTokens),
                    generatedAt: Date.now()
                }
            });

            // Phase 56.50 — the repair model is a REQUIREMENT in its own right,
            // not a subordinate clause. A periodic-test interval on a latent
            // event is a candidate CMR; monitored repair is a design claim the
            // safety case depends on. Singular, separately verifiable.
            // M7 (D.4.3.1) — if a monitor spec record exists for this event, the
            // requirement carries the full attribute set (threshold, cycle time,
            // coverage, scrub interval, independent channel) and re-fingerprints on
            // spec changes so regeneration flags stale requirements.
            const mSpec = (typeof window !== 'undefined' && typeof window.monitorSpecFor === 'function') ? window.monitorSpecFor(lid) : null;
            const mAttrs = mSpec ? [
                mSpec.threshold ? `detection threshold: ${mSpec.threshold}` : '',
                mSpec.cycleSec ? `monitor cycle ≤ ${mSpec.cycleSec} s` : '',
                (isFinite(+mSpec.coverage) && +mSpec.coverage < 1) ? `coverage ≥ ${Math.round(+mSpec.coverage * 100)}% with the undetected fraction inspected at intervals not exceeding ${mSpec.scrubFH || 'the declared dormancy'} flight hours` : '',
                mSpec.monitorLid ? `implemented in a channel (${mSpec.monitorLid}) independent of the monitored element` : ''
            ].filter(Boolean) : [];
            // Ruling 2 Aug 2026 (decision slate #6): the monitor attribute set is
            // NOT appended to the interval/monitored text as a second "shall" —
            // it is emitted as a SECOND, cross-traced atomic requirement below.
            // One imperative per requirement; the atomicity lint's known CCMR
            // finding resolves here.
            const mFpTokens = mSpec ? [mSpec.threshold, mSpec.cycleSec, mSpec.coverage, mSpec.scrubFH, mSpec.monitorLid] : [];
            // The CCMR latent sweep computes a NOT-TO-EXCEED interval for latent
            // events in Catastrophic/Hazardous trees: the longest test interval at
            // which the top event still meets its severity target, given the
            // measured lambda. Until 1 Aug 2026 that bound was computed and shown
            // on the CCMR page and never reached the requirement engine — so the
            // requirements register could read "shall be tested at intervals not
            // exceeding tau" while the CCMR lane was simultaneously flagging that
            // same tau as over the safety-derived bound. Two views of one model
            // disagreeing, with nothing to reconcile them.
            //
            // This attaches the bound to the requirement's RATIONALE only. It does
            // NOT rewrite the interval: tau is the analyst's committed value, and
            // silently substituting nte would change a maintenance commitment
            // without anyone deciding to. Whether nte should govern is a safety
            // call for the engineer, and the requirement now carries what they
            // need to make it.
            let nteRat = '';
            let nteFpTokens = [];
            try {
                if (typeof ccmrLatentSweep === 'function') {
                    const evKey = node.displayId || node.name || ('node ' + node.id);
                    // Mirror-aware (3 Aug pair-trace build): the NTE is computed on
                    // the VERIFICATION tree (λ lives there) while requirements
                    // generate from the ALLOCATION tree. Match this event's sweep
                    // row on either page of the pair — logicalId survives the
                    // mirror clone — preferring a row with a computed bound.
                    const sweptAll = (ccmrLatentSweep() || []).filter(function (r) {
                        if (!r) return false;
                        if (r.pageId !== page.id && r.verifies !== page.id) return false;
                        return (r.lid != null && r.lid === lid) || r.event === evKey;
                    });
                    const swept = sweptAll.filter(function (r) {
                        return r.nte != null && isFinite(r.nte) && r.nte < 1e6;
                    })[0] || sweptAll[0];
                    if (swept && swept.nte != null && isFinite(swept.nte) && swept.nte < 1e6) {
                        nteFpTokens = [swept.nte, swept.exceeds ? 'over' : 'within'];
                        nteRat = swept.exceeds
                            ? ` CCMR CONFLICT: the latent sweep computes a not-to-exceed interval of ${(+swept.nte).toPrecision(3)} h for this event (severity ${swept.severity}, lambda ${(+swept.lambda).toExponential(2)}); the authored interval exceeds it, so this requirement as written does not meet the safety target. Reconcile on the CCMR page before baselining.`
                            : ` CCMR: within the not-to-exceed bound of ${(+swept.nte).toPrecision(3)} h computed by the latent sweep (severity ${swept.severity}).`;
                    } else if (swept && swept.note) {
                        nteRat = ` CCMR: no not-to-exceed bound available (${swept.note}).`;
                    }
                }
            } catch (_) { nteRat = ''; }
            // CCMR pair-trace, forward direction. Ruling 4 Aug on preview-only:
            // trace ANYWAY against the DERIVED sourceId (the governing FHA row
            // exists even when its fha-prob requirement is not yet accepted),
            // name the gap in the rationale, and carry the register state in
            // the fingerprint so accepting the safety requirement re-flags this
            // row updated and the caveat self-heals.
            const gov = pageGoverning.get(page.id) || null;
            let govRat = '', govFpTokens = [], govCtx = null;
            if (gov && gov.prob != null) {
                govRat = ` Implements and verifies the governing probabilistic safety requirement for ${gov.fcId} (${gov.effSev}) — ${gov.sourceId} (CCMR pair-trace).` +
                    (gov.accepted ? '' : ` That safety requirement is not yet in the register (fha-prob preview only) — run AutoReq with the FHA generator and accept it to complete the pair.`);
                govFpTokens = [gov.sourceId, gov.accepted ? 'gov-accepted' : 'gov-preview'];
                govCtx = { governedBy: gov.sourceId, governingFcId: gov.fcId, governingSeverity: gov.effSev, governingAccepted: !!gov.accepted };
            }
            // App I fold-in (his call, 4 Aug): when this event also appears in a
            // Markov model, the interval requirement's rationale carries the
            // interval↔rate equivalence receipt so the FTA's periodic-test credit
            // and the Markov repair representation tell one story. Cites
            // ARP4761A App I §I.3.3.2 by clause number and title only; the math
            // below is stated in our own words: with constant λ and inspection
            // interval τ, the mean time a failure sits undetected before the
            // inspection that finds it is T_TSF = τ/(1 − e^(−λτ)) − 1/λ, which
            // tends to τ/2 as λτ → 0, and a continuous repair transition standing
            // in for the discrete inspection (§I.3.3.3 form) uses μ_eq = 1/T_TSF.
            let bridgeRat = '', bridgeFpTokens = [];
            if (node.repairModel === 'periodic' && node.tau && node.markovModelId && typeof getMarkovModel === 'function') {
                try {
                    const mdl = getMarkovModel(node.markovModelId);
                    if (mdl) {
                        const lamB = (typeof getEffectiveLambda === 'function') ? (getEffectiveLambda(node) || 0) : (parseFloat(node.lambda) || 0);
                        const tauB = +node.tau;
                        let tsf, basis;
                        if (lamB > 0) {
                            const x = lamB * tauB;
                            tsf = (x > 1e-12) ? (tauB / (1 - Math.exp(-x)) - 1 / lamB) : tauB / 2;
                            basis = `exact for constant λ = ${lamB.toExponential(2)}/h`;
                        } else {
                            tsf = tauB / 2;
                            basis = 'τ/2 first-order form — no λ entered on this allocation node';
                        }
                        const muEq = tsf > 0 ? (1 / tsf) : null;
                        const repairs = ((mdl.transitions || [])).filter(function (t) {
                            const fromS = (mdl.states || []).find(s => s && s.name === t.from);
                            const toS = (mdl.states || []).find(s => s && s.name === t.to);
                            return fromS && toS && fromS.isFailed && !toS.isFailed;
                        });
                        bridgeRat = ` Interval↔rate equivalence receipt (ARP4761A App I §I.3.3.2, "The Relationship Between TSF and Periodic Inspection/Repair Times" — this event also appears in Markov model "${mdl.name}"): mean undetected dwell T_TSF ≈ ${(+tsf).toPrecision(3)} h (${basis})` +
                            (muEq ? `, equivalent continuous repair rate μ_eq ≈ ${muEq.toExponential(2)}/h (§I.3.3.3 form)` : '') + '.' +
                            (repairs.length
                                ? ` The model's repair transition(s) ${repairs.map(t => `${t.from}→${t.to} @ ${(+t.rate).toExponential(2)}/h`).join(', ')} and this interval must tell one story — reconcile if they diverge.`
                                : ' The model declares no repair transition out of a failed state — if it is meant to represent this periodic inspection, add one at μ_eq.');
                        bridgeFpTokens = ['appI', node.markovModelId, Math.round(tsf * 1e6) / 1e6]
                            .concat(repairs.map(t => t.from + '>' + t.to + ':' + t.rate));
                    }
                } catch (_) { bridgeRat = ''; bridgeFpTokens = []; }
            }
            let intervalEmitted = '';   // which branch pushed the base requirement (gates the monitor split)
            if (node.repairModel === 'periodic' && node.tau) {
                intervalEmitted = 'periodic';
                out.push({
                    text: `${subjName} shall be tested for undetected failure at intervals not exceeding ${node.tau} hours.`,
                    rat: `The fault-tree allocation for this event on page ${page.name} takes latent-failure detection credit (periodic test, τ ≤ ${node.tau} h); without the interval the allocated probability is invalid. Candidate CMR — coordinate the interval with the scheduled-maintenance program.` + (mSpec ? ` Monitor spec ${mSpec.id} (D.4.3.1) attributes are carried by the linked monitoring-function requirement (${scopeKey}:fta-interval-monitor:${lid}).` : '') + nteRat + govRat + bridgeRat,
                    level: 'L3', type: 'Maintainability', analysis: 'Maintenance',
                    verifMethod: 'Inspection',
                    traceId: node.displayId || '',
                    reqSource: {
                        generator: 'fta-interval',
                        sourceId: `${scopeKey}:fta-interval:${lid}`,
                        context: Object.assign({ repairModel: 'periodic', tau: node.tau, monitorSpecId: mSpec ? mSpec.id : '' }, govCtx || {}),
                        fingerprint: fp('fta-interval', 'periodic', node.tau, mSpec ? mSpec.id : '', ...nteFpTokens, ...govFpTokens, ...bridgeFpTokens),
                        generatedAt: Date.now()
                    }
                });
            } else if (node.repairModel === 'monitored' && node.mu) {
                intervalEmitted = 'monitored';
                out.push({
                    text: `${subjName} shall provide continuous failure monitoring achieving a mean repair rate of at least ${(+node.mu).toExponential(2)} per hour.`,
                    rat: `The fault-tree allocation for this event on page ${page.name} takes credit for monitored repair (μ ≥ ${(+node.mu).toExponential(2)}/h); the monitoring and restoration path is part of the safety case for the allocated probability.` + (mSpec ? ` Monitor spec ${mSpec.id} (D.4.3.1) attributes are carried by the linked monitoring-function requirement (${scopeKey}:fta-interval-monitor:${lid}).` : '') + govRat,
                    level: 'L3', type: 'Maintainability', analysis: 'Maintenance',
                    verifMethod: 'Analysis',
                    traceId: node.displayId || '',
                    reqSource: {
                        generator: 'fta-interval',
                        sourceId: `${scopeKey}:fta-interval:${lid}`,
                        context: Object.assign({ repairModel: 'monitored', mu: node.mu, monitorSpecId: mSpec ? mSpec.id : '' }, govCtx || {}),
                        fingerprint: fp('fta-interval', 'monitored', node.mu, mSpec ? mSpec.id : '', ...govFpTokens),
                        generatedAt: Date.now()
                    }
                });
            }
            // Second requirement of the split — the monitor attribute set, atomic,
            // cross-traced to the interval/monitored requirement it backs. Same
            // generator key ('fta-interval') so the orphan sweep (exact-match
            // branch under opts.ftaEvent) covers it: when the monitor spec is
            // removed the candidate stops being generated and the stored row is
            // flagged orphaned, same as any other auto-req. Distinct sourceId so
            // the merge never confuses the pair.
            if (intervalEmitted && mAttrs.length) {
                const intervalRef = intervalEmitted === 'periodic'
                    ? `the periodic-test interval requirement (${scopeKey}:fta-interval:${lid}, τ ≤ ${node.tau} h)`
                    : `the monitored-repair requirement (${scopeKey}:fta-interval:${lid}, μ ≥ ${(+node.mu).toExponential(2)}/h)`;
                out.push({
                    text: `The monitoring function for ${subjName} shall satisfy: ${mAttrs.join('; ')}.`,
                    rat: `Monitor spec ${mSpec.id} (D.4.3.1) attribute set, split from ${intervalRef} so each requirement carries a single imperative. The detection credit taken by the fault-tree allocation on page ${page.name} is valid only if the monitoring function meets these attributes.`,
                    level: 'L3', type: 'Maintainability', analysis: 'Maintenance',
                    verifMethod: 'Analysis',
                    traceId: node.displayId || '',
                    reqSource: {
                        generator: 'fta-interval',
                        sourceId: `${scopeKey}:fta-interval-monitor:${lid}`,
                        context: { repairModel: intervalEmitted, monitorSpecId: mSpec.id, pairsWith: `${scopeKey}:fta-interval:${lid}` },
                        fingerprint: fp('fta-interval', 'monitor', ...mFpTokens),
                        generatedAt: Date.now()
                    }
                });
            }
        });

        // ------------------------------------------------------------------ A3
        // Provider rows: ONE per resource, in the PROVIDER's bucket, at the
        // strictest value. walkNodesInScope only yields resource nodes whose
        // provider bucket IS this scope, so everything collected above belongs
        // here. Tie/govern rule: the strictest use governs; first-walked wins a
        // tie, so agreeing projects never churn.
        _resUses.forEach((uses, rid) => {
            let gov = uses[0];
            uses.forEach(u => { if (u.p < gov.p) gov = u; });
            const providerId = gov.node.identity.providerSystemId;
            const consumers = [];
            uses.forEach(u => {
                const label = u.consumerSystemId ? _sysLabel(u.consumerSystemId) : '(unresolved consumer)';
                if (consumers.indexOf(label) < 0) consumers.push(label);
            });
            const pStr = gov.p.toExponential(2);
            const subj = gov.node.name || ('resource ' + rid);
            // Same three-way phrasing as the per-node fta-event text (live-found
            // 22 Aug: "probability of X fails" read wrong for verb-phrased names).
            const failurePhrased = /(fail|loss|lost|erroneous|inadvertent|jam|rupture|leak|inoperative|unavailable)/i.test(subj);
            const verbPhrased = /(fails?|failed|jams?|jammed|ruptures?|ruptured|leaks?|leaked|sticks?|stuck|opens?|closes?|disconnects?|activates?|deploys?|bursts?)$/i.test(subj.trim());
            out.push({
                text: verbPhrased
                    ? `The probability that ${_midSentence(subj)} shall not exceed ${pStr} per flight.`
                    : (failurePhrased
                        ? `The probability of ${_midSentence(subj)} shall not exceed ${pStr} per flight.`
                        : `The probability of loss of ${_midSentence(subj)} shall not exceed ${pStr} per flight.`),
                rat: `Common resource ${rid}, provided by ${_sysLabel(providerId)}. ONE provider requirement at the strictest value across every consumer (A3 / U-2): ` +
                     uses.map(u => `${u.page.name} allocates ${u.p.toExponential(2)}`).join('; ') +
                     `. The strictest consumer governs (${gov.page.name}); each consuming system carries its own L2 interface requirement pinning the assumption its trees make.`,
                level: 'L3', type: 'Safety', analysis: 'Probabilistic',
                verifMethod: 'Analysis',
                traceId: gov.node.displayId || '',
                reqSource: {
                    generator: 'fta-resource',
                    sourceId: `${scopeKey}:fta-resource:${rid}`,
                    context: { resourceId: rid, providerSystemId: providerId, pAllocated: gov.p,
                               consumers: consumers.slice(),
                               uses: uses.map(u => ({ page: u.page.id, lid: u.lid, p: u.p, consumer: u.consumerSystemId })) },
                    fingerprint: fp('fta-resource', rid, gov.p,
                                    uses.map(u => String(u.lid) + ':' + u.p).sort(),
                                    consumers.slice().sort()),
                    generatedAt: Date.now()
                }
            });
        });

        // Consumer interface rows: this scope is a CONSUMER of resources whose
        // provider (and therefore provider row) lives elsewhere. Walk every
        // allocation page for declared-resource uses consumed by THIS system;
        // one L2 per resource, at that consumer's own strictest assumption.
        if (scopeKey !== 'ac') {
            const _ifaceUses = new Map();   // resourceId → [{ node, page, lid, p }]
            _allocationPages().forEach(page => {
                const ctx = _ownerCtx(page);
                (function walk(node) {
                    if (!node) return;
                    if ((node.type === 'basic' || node.type === 'undeveloped') && _resDeclared(node)) {
                        const p = parseFloat(node.probability) || 0;
                        if (p > 0) {
                            const NI = (typeof window !== 'undefined' && window.SLNodeIdentity)
                                || (typeof SLNodeIdentity !== 'undefined' ? SLNodeIdentity : null);
                            let consumer = null;
                            try {
                                const own = NI && NI.resolveOwner ? NI.resolveOwner(node, ctx) : null;
                                consumer = own && own.consumerSystemId ? own.consumerSystemId : null;
                            } catch (_) { consumer = null; }
                            if (consumer && ('sys-' + consumer) === scopeKey) {
                                const rid = String(node.identity.resourceId);
                                if (!_ifaceUses.has(rid)) _ifaceUses.set(rid, []);
                                _ifaceUses.get(rid).push({ node, page, lid: node.logicalId != null ? node.logicalId : node.id, p });
                            }
                        }
                    }
                    (node.children || node._children || []).forEach(walk);
                })(page.root);
            });
            _ifaceUses.forEach((uses, rid) => {
                let gov = uses[0];
                uses.forEach(u => { if (u.p < gov.p) gov = u; });
                const providerId = gov.node.identity.providerSystemId;
                const consumerName = _sysLabel(scopeKey.slice(4));
                const pStr = gov.p.toExponential(2);
                const iSubj = gov.node.name || ('resource ' + rid);
                const iFail = /(fail|loss|lost|erroneous|inadvertent|jam|rupture|leak|inoperative|unavailable)/i.test(iSubj);
                const iVerb = /(fails?|failed|jams?|jammed|ruptures?|ruptured|leaks?|leaked|sticks?|stuck|opens?|closes?|disconnects?|activates?|deploys?|bursts?)$/i.test(iSubj.trim());
                const iClause = iVerb ? `${_midSentence(iSubj)}`
                              : iFail ? `${_midSentence(iSubj)} occurs`
                              : `failure of ${_midSentence(iSubj)} occurs`;
                out.push({
                    text: `${consumerName} shall assume that ${iClause} with a probability no greater than ${pStr} per flight, per the interface with ${_sysLabel(providerId)}.`,
                    rat: `Interface assumption on common resource ${rid} (provider: ${_sysLabel(providerId)}). This system's trees take credit for the resource at: ` +
                         uses.map(u => `${u.page.name} (${u.p.toExponential(2)})`).join('; ') +
                         `. The strictest of this system's own uses governs. The provider carries the single probabilistic L3 for the resource (${'sys-' + providerId}:fta-resource:${rid}); this row is the consumer-side contract against it (ARP4754B §5.3.1.8).`,
                    level: 'L2', type: 'Interface', analysis: 'Probabilistic',
                    verifMethod: 'Analysis',
                    traceId: gov.node.displayId || '',
                    reqSource: {
                        generator: 'fta-resource-iface',
                        sourceId: `${scopeKey}:fta-resource-iface:${rid}`,
                        context: { resourceId: rid, providerSystemId: providerId, pAssumed: gov.p,
                                   pairsWith: 'sys-' + providerId + ':fta-resource:' + rid,
                                   uses: uses.map(u => ({ page: u.page.id, lid: u.lid, p: u.p })) },
                        fingerprint: fp('fta-resource-iface', rid, gov.p,
                                        uses.map(u => String(u.lid) + ':' + u.p).sort()),
                        generatedAt: Date.now()
                    }
                });
            });
        }
        return out;
    }

    // ----- Generator 3: DALgebra → DAL allocation requirements -----
    // Phase 56.49f — Two output modes:
    //   compressed (default): emit one default-DAL statement covering the
    //     dominant (modal) DAL/kind combination across the scope, plus a
    //     per-node exception line for every node whose DAL differs from the
    //     default. ~70% fewer lines on typical trees where OR pass-through
    //     keeps most nodes at the same DAL.
    //   explicit: emit one per-node DAL line as before. Engineers (or their
    //     DERs) who prefer everything spelled out can flip the toggle in the
    //     AutoReq settings panel.
    // Toggle stored on projectConfig.autoreqDalMode (default 'compressed').
    function genDALgebra(scopeKey){
        const out = [];
        // Option-based DALgebra rationale (ARP4754B §5.2.3 / ARP4761A Table P2). The standards define
        // no marked "carrier"; the explanation of how each member's DAL was derived lives here — in the
        // requirement's rationale — keyed to the option the engineer chose and the independence basis.
        function _dalgebraRat(a) {
            const d = (a.node && a.node._dalDerivation) || {};
            const tp2 = 'ARP4754B §5.2.3 / ARP4761A Table P2';
            const indepTxt = d.independence === 'substantiated' ? 'CMA-substantiated functional independence'
                : d.independence === 'claimed' ? 'a claimed (CMA-pending) functional independence'
                : 'functional independence';
            // 23 Sep 2026 (G4) — Part 23 under ASTM F3061 §4.2.5 Table 1 (f3061_dal.js).
            if (d.basis === 'f3061') {
                const t1 = 'ASTM F3061 §4.2.5, Table 1 (Assessment Level ' + (d.level || '?') + ', ' + (d.severity || 'failure condition') + ')';
                if (d.role === 'primary') return a.kind + ' ' + a.dal + ' held at the primary-system DAL under ' + t1 + '; the other members of this independent AND take the secondary-system DAL, predicated on ' + indepTxt + ' between the members.';
                if (d.role === 'secondary') return a.kind + ' ' + a.dal + ' set at the secondary-system DAL under ' + t1 + ' (never lower: Table 1 has no level below the secondary), predicated on ' + indepTxt + ' between the members.';
                return a.kind + ' ' + a.dal + ' held at the primary-system DAL under ' + t1 + ': Table 1 gives this class no secondary-system DAL, so no member is reduced.';
            }
            if (d.basis === 'option1') return d.role === 'top'
                ? a.kind + ' ' + a.dal + ' held at the failure condition’s top level under ' + tp2 + ' Option 1 (one member retains the top DAL), predicated on ' + indepTxt + ' between the members.'
                : a.kind + ' ' + a.dal + ' reduced under ' + tp2 + ' Option 1 (additional members two development-assurance levels below the failure condition DAL, floored at DAL E), predicated on ' + indepTxt + ' between the members.';
            if (d.basis === 'option2') return d.role === 'upper'
                ? a.kind + ' ' + a.dal + ' set one level below the top under ' + tp2 + ' Option 2 (at least two members one level below the FC DAL), predicated on ' + indepTxt + ' between the members.'
                : a.kind + ' ' + a.dal + ' reduced to the Option 2 floor under ' + tp2 + ', predicated on ' + indepTxt + ' between the members.';
            if (d.basis === 'no-independence') return a.kind + ' ' + a.dal + ' held at the top level: no functional independence claimed between the AND members, so no reduction is taken (' + tp2 + ' step f).';
            if (d.basis === 'compromised') return a.kind + ' ' + a.dal + ' held at the top level: functional independence is COMPROMISED (CMA found a common mode), so any reduction is invalid and members revert to the top (' + tp2 + ' step f).';
            if (d.basis === 'inherit') return a.kind + ' ' + a.dal + ' inherited from the top level — an OR/XOR/VOTING member whose single failure causes the condition takes the full FC DAL (' + tp2 + ', single-member basis).';
            return a.kind + ' ' + a.dal + ' allocated by top-down apportionment from the linked failure condition severity (' + tp2 + ').';
        }
        const mode = (typeof projectConfig === 'object' && projectConfig && projectConfig.autoreqDalMode === 'explicit')
            ? 'explicit' : 'compressed';
        // First pass — collect every unique-logicalId DAL allocation in the
        // scope. We then either emit them all (explicit) or compute the
        // modal default and emit the exceptions (compressed).
        const allocations = [];   // { node, page, lid, kind, dal, opt }
        walkPagesInScope(scopeKey, (node, page) => {
            // Every node that received an allocated DAL gets a requirement — including the REDUCED
            // members (not just the former "carriers"), so the option-based reduction is explained
            // in each member's rationale rather than implied by a canvas symbol.
            if(!node.allocatedDAL) return;
            const lid = node.logicalId != null ? node.logicalId : node.id;

            const opt = (node._dalDerivation && node._dalDerivation.option) || (node.dalOption === 'opt1' ? '1' : '2');
            // FDAL vs IDAL routing — authoritative when page.treeLevel is declared:
            //   aircraft-level tree → FDAL for every carrier (functions awaiting decomposition).
            //   system-level tree   → IDAL for every basic-event carrier; gates still get FDAL.
            //   standalone / unset  → fall back to node-type heuristic
            //                         (gate/undeveloped → FDAL, basic → IDAL).
            // Phase 55.0.8 — per-node dalKindOverride wins over every other rule, so
            // engineers can force a specific label without renaming the node type.
            const level = page.treeLevel || 'standalone';
            let kind;
            if (node.dalKindOverride === 'FDAL' || node.dalKindOverride === 'IDAL') {
                kind = node.dalKindOverride;
            } else if (level === 'aircraft') {
                kind = 'FDAL';
            } else if (level === 'system') {
                kind = (node.type === 'basic') ? 'IDAL' : 'FDAL';
            } else {
                kind = (node.type === 'gate' || node.type === 'undeveloped') ? 'FDAL' : 'IDAL';
            }

            allocations.push({ node, page, lid, kind, dal: node.allocatedDAL, opt, level });
        });

        // A5 (22 Aug 2026) — ONE requirement per logicalId, at the MAX of the
        // resulting DALs across every tree that derives one (a shared event is one
        // physical item; it must satisfy its strictest position, ARP4754B §5.2.3).
        // The derivations are NOT merged: tree A reducing under Option 1 and tree B
        // under Option 2 are different arguments, and the rationale cites only the
        // GOVERNING tree's — the others are named as disagreeing derivations.
        // Until now this dedupe was first-seen-wins (Phase 56.49c), which made the
        // register's DAL an accident of page walk order whenever trees disagreed.
        // Tie rule: same DAL from several trees → the first-walked page governs, so
        // sourceIds (which carry the page id) do not churn on agreeing projects.
        const _dalStricter = (a, b) => {
            // dalMax (helpers) when present; A < B < … < E fallback keeps tests pure.
            if (typeof dalMax === 'function') return dalMax(a, b) === a;
            return String(a) <= String(b);
        };
        const _byLid = new Map();   // lid → { governing allocation, others: [{page, dal}] }
        allocations.forEach(a => {
            const g = _byLid.get(a.lid);
            if (!g) { _byLid.set(a.lid, { gov: a, others: [] }); return; }
            if (_dalStricter(a.dal, g.gov.dal) && a.dal !== g.gov.dal) {
                g.others.push({ page: g.gov.page, dal: g.gov.dal });
                g.gov = a;
            } else if (a.dal !== g.gov.dal) {
                g.others.push({ page: a.page, dal: a.dal });
            }
            // equal DAL on another page: first-walked keeps governing; nothing to record
        });
        const perLid = [];
        _byLid.forEach(g => {
            // Disagreement note + fingerprint tokens ONLY when trees actually disagree —
            // single-derivation (and agreeing) events keep byte-identical output.
            const distinct = [];
            g.others.forEach(o => {
                const label = (o.page && o.page.name ? o.page.name : String(o.page && o.page.id)) + ' derives ' + o.dal;
                if (distinct.indexOf(label) < 0) distinct.push(label);
            });
            perLid.push(Object.assign({}, g.gov, { _disagree: distinct }));
        });
        const _disagreeRat = a => a._disagree && a._disagree.length
            ? ` Strictest across trees: ${a._disagree.join('; ')} for this same event — the max of the resulting DALs governs, and reduction arguments are not merged across derivations (each tree's argument stands alone, ARP4754B §5.2.3). Governing derivation: ${a.page.name || a.page.id}.`
            : '';
        const _disagreeFpTokens = a => a._disagree && a._disagree.length
            ? ['a5-strictest', a._disagree.slice().sort()] : [];

        // Phase 56.49f — emit per mode.
        if (mode === 'explicit') {
            perLid.forEach(a => {
                out.push({
                    text: `${a.node.name || a.node.displayId || 'Item'} shall be developed to ${a.kind} ${a.dal}.`,
                    rat: _dalgebraRat(a) + _disagreeRat(a),
                    level: 'L2', type: 'Safety', analysis: 'Design Assurance',
                    verifMethod: 'Inspection',
                    traceId: a.node.displayId || '',
                    reqSource: {
                        generator: 'dalgebra',
                        sourceId: `${scopeKey}:dalgebra:${a.page.id}:${a.lid}`,
                        context: { dal: a.dal, dalOption: a.opt, kind: a.kind, type: a.node.type, treeLevel: a.level, disagree: a._disagree.length ? a._disagree : undefined },
                        fingerprint: fp('dalgebra', a.dal, a.opt, a.kind, a.node.type, a.level, ...(_disagreeFpTokens(a))),
                        generatedAt: Date.now()
                    }
                });
            });
            return out;
        }

        // Compressed mode: compute modal (kind, dal) combo across all per-lid
        // governing allocations (A5 — one physical item, one strictest DAL).
        if (perLid.length === 0) return out;
        const tally = new Map();   // "kind|dal" → count
        perLid.forEach(a => {
            const k = a.kind + '|' + a.dal;
            tally.set(k, (tally.get(k) || 0) + 1);
        });
        let defaultKey = null, defaultCount = 0;
        tally.forEach((c, k) => { if (c > defaultCount) { defaultCount = c; defaultKey = k; } });
        const [defaultKind, defaultDal] = defaultKey.split('|');

        // Emit the default-DAL statement only if at least 2 allocations share it;
        // otherwise every line is an exception and the compressed form gains nothing.
        if (defaultCount >= 2) {
            const scopeLabel = scopeKey === 'ac' ? 'aircraft' : 'system';
            out.push({
                text: `Each ${defaultKind === 'FDAL' ? 'function' : 'item'} within ${scopeLabel} scope shall be developed to ${defaultKind} ${defaultDal} unless a ${defaultKind === 'FDAL' ? 'function' : 'item'}-specific allocation requirement states otherwise.`,
                rat: `Default applies to ${defaultCount} of ${perLid.length} ${defaultKind === 'FDAL' ? 'functions' : 'items'} in scope; the exceptions are stated as individual allocation requirements. Per ARP4754B §5.2.3 / ARP4761A Table P2.`,
                level: 'L2', type: 'Safety', analysis: 'Design Assurance',
                verifMethod: 'Inspection',
                traceId: '',
                reqSource: {
                    generator: 'dalgebra-default',
                    sourceId: `${scopeKey}:dalgebra-default:${defaultKey}`,
                    context: { defaultDal, defaultKind, defaultCount, totalCount: perLid.length },
                    fingerprint: fp('dalgebra-default', 'v2', defaultDal, defaultKind, defaultCount, perLid.length),
                    generatedAt: Date.now()
                }
            });
        }

        // Exception requirements: any allocation that doesn't match the default.
        // (Or if defaultCount < 2, every allocation becomes an "exception" — same
        // output as explicit mode, which is fine.)
        const emitAll = defaultCount < 2;
        perLid.forEach(a => {
            const aKey = a.kind + '|' + a.dal;
            if (!emitAll && aKey === defaultKey) return;
            out.push({
                text: `${a.node.name || a.node.displayId || 'Item'} shall be developed to ${a.kind} ${a.dal}.`,
                rat: 'Exception to default. ' + _dalgebraRat(a) + _disagreeRat(a),
                level: 'L2', type: 'Safety', analysis: 'Design Assurance',
                verifMethod: 'Inspection',
                traceId: a.node.displayId || '',
                reqSource: {
                    generator: 'dalgebra',
                    sourceId: `${scopeKey}:dalgebra:${a.page.id}:${a.lid}`,
                    context: { dal: a.dal, dalOption: a.opt, kind: a.kind, type: a.node.type, treeLevel: a.level, isException: !emitAll, disagree: a._disagree.length ? a._disagree : undefined },
                    fingerprint: fp('dalgebra', a.dal, a.opt, a.kind, a.node.type, a.level, defaultKey, ...(_disagreeFpTokens(a))),
                    generatedAt: Date.now()
                }
            });
        });
        return out;
    }

    // ----- Generator 4: Gate structure → independence / SPF requirements -----
    function isAndFamily(node){
        if(!node || node.type !== 'gate') return false;
        if(node.gateType === 'AND' || node.gateType === 'INHIBIT' || node.gateType === 'PAND') return true;
        if(node.gateType === 'VOTING'){
            const k = parseInt(node.votingK) || 0;
            const n = (node.children || []).length;
            return k > 0 && k === n;
        }
        return false;
    }
    function isOrFamily(node){
        if(!node || node.type !== 'gate') return false;
        if(node.gateType === 'OR' || node.gateType === 'XOR') return true;
        if(node.gateType === 'VOTING'){
            const k = parseInt(node.votingK) || 0;
            const n = (node.children || []).length;
            return n > 0 && k > 0 && k < n;
        }
        return false;
    }

    function checkANDCompromise(gate){
        const reasons = [];
        const kids = gate.children || [];
        if(kids.length < 2) return reasons;

        // Shared logicalId — same physical event used twice in an AND.
        // A7 (22 Aug 2026, ruled: suppress + note) — when the shared event is a
        // DECLARED resource (macres:/macsys: lid, MAC/lane provenance, resource
        // identity), the sharing is STRUCTURAL: the model states it and the BDD
        // quantifies it exactly. It is noted, never counted as a compromise —
        // common resource ≠ common cause. An UNDECLARED shared lid keeps the
        // warning verbatim (an engineer reusing an event without declaring a
        // resource is exactly the case the old text exists for).
        const _sharedIsDeclared = (lid, nodes) => {
            const s = String(lid);
            if (s.indexOf('macres:') === 0 || s.indexOf('macsys:') === 0) return true;
            return nodes.every(c => c && (c._macProvenance || c._macGraft || c._laneProv
                || (c.identity && c.identity.kind === 'resource')));
        };
        const lidMap = new Map();
        kids.forEach(c => {
            const lid = c.logicalId != null ? c.logicalId : c.id;
            if(!lidMap.has(lid)) lidMap.set(lid, []);
            lidMap.get(lid).push(c);
        });
        lidMap.forEach((nodes, lid) => {
            if(nodes.length < 2) return;
            const displays = nodes.map(c => c.displayId || String(c.id));
            if(_sharedIsDeclared(lid, nodes)) reasons.push({
                kind: 'shared-resource-structural', structural: true,
                detail: `Children ${displays.join(' and ')} share declared resource ${lid} — structural sharing, modeled exactly in the quantification (shared logicalId). Not a common-cause finding: the independence claimed at this gate applies to the remaining, unmodeled couplings (the CRA and CMA lanes own this resource).`
            });
            else reasons.push({
                kind: 'shared-logical-id',
                detail: `Children ${displays.join(' and ')} share logicalId ${lid} — same physical event used twice (common-mode).`
            });
        });

        // Shared CCF group.
        const ccfMap = new Map();
        kids.forEach(c => {
            if(!c.ccfGroup) return;
            if(!ccfMap.has(c.ccfGroup)) ccfMap.set(c.ccfGroup, []);
            ccfMap.get(c.ccfGroup).push(c.displayId || String(c.id));
        });
        ccfMap.forEach((displays, grp) => {
            if(displays.length > 1) reasons.push({
                kind: 'shared-ccf-group',
                detail: `Children ${displays.join(', ')} all belong to CCF group "${grp}" — explicit common-cause dependency.`
            });
        });

        // Shared component library entry — heuristic for common manufacturer / family.
        const libMap = new Map();
        kids.forEach(c => {
            if(!c.libraryKey) return;
            if(!libMap.has(c.libraryKey)) libMap.set(c.libraryKey, []);
            libMap.get(c.libraryKey).push(c.displayId || String(c.id));
        });
        libMap.forEach((displays, key) => {
            if(displays.length > 1) reasons.push({
                kind: 'shared-library-entry',
                detail: `Children ${displays.join(', ')} reference the same component library entry "${key}" — likely shared family / manufacturer.`
            });
        });

        return reasons;
    }

    // CMA-driven compromise: any Open / In-Progress CMA that links this gate AND lists
    // common modes or non-empty findings tells us the AutoReq independence claim is at risk.
    // Closed / Mitigated CMAs are considered resolved and do NOT flag the requirement.
    function checkCMACompromise(gate, page){
        const reasons = [];
        if (!gate || !page) return reasons;
        const gateKey = page.id + ':' + gate.id;
        (typeof cmaData !== 'undefined' ? cmaData : []).forEach(c => {
            if (!c || !c.linkedGateIds || !c.linkedGateIds.includes(gateKey)) return;
            const status = c.status || 'Open';
            if (status === 'Mitigated' || status === 'Closed — Accepted') return;
            const hasModes = c.modes && c.modes.length > 0;
            const hasFindings = c.findings && String(c.findings).trim().length > 0;
            if (!hasModes && !hasFindings) return;   // a CMA that just links a gate but identifies nothing isn't a finding
            const modeLabelMap = (typeof CMA_MODE_LABELS !== 'undefined') ? CMA_MODE_LABELS : {};
            const modeLabels = (c.modes || []).map(m => modeLabelMap[m] || m).join(', ');
            const cmaIdStr = c.cmaId || ('CMA#' + c.internalId);
            const parts = [];
            parts.push(`CMA ${cmaIdStr} (status: ${status})`);
            if (modeLabels) parts.push(`identifies common modes: ${modeLabels}`);
            if (hasFindings) parts.push(`findings: ${c.findings}`);
            reasons.push({ kind: 'cma', detail: parts.join(' — ') });
        });
        // A6 (22 Aug 2026) — failures of independence are GLOBAL, claims are LOCAL.
        // The loop above reports CMAs LINKED to this gate. But an open common-mode
        // finding is a fact about the member PAIR it couples: if this gate's children
        // include a pair some other gate's open CMA identified, the independence
        // claimed here is compromised too — the coupling does not care which gate the
        // analyst happened to record it against. (The reverse stays false: closing or
        // substantiating a claim elsewhere validates nothing here.)
        try {
            const _idx = (typeof _cmaCompromisedIndex === 'function') ? _cmaCompromisedIndex()
                       : (typeof window !== 'undefined' && typeof window._cmaCompromisedIndex === 'function' ? window._cmaCompromisedIndex() : null);
            if (_idx && _idx.pairs && _idx.pairs.size) {
                const _kids = gate.children || [];
                const _lids = _kids.map(c => String(c.logicalId != null ? c.logicalId : c.id));
                const _seenPk = new Set();
                for (let i = 0; i < _lids.length; i++) for (let j = i + 1; j < _lids.length; j++) {
                    const pk = [_lids[i], _lids[j]].sort().join('|');
                    if (_seenPk.has(pk)) continue;
                    _seenPk.add(pk);
                    const rec = _idx.pairs.get(pk);
                    if (!rec) continue;
                    if (rec.key === page.id + ':' + gate.id) continue;   // linked HERE — already reported above
                    reasons.push({ kind: 'cma-global',
                        detail: `CMA ${rec.cma} (recorded at gate ${rec.gate} on ${rec.page}) identifies an open common mode coupling ${_lids[i]}/${_lids[j]} — the same member pair sits under this gate. A failure of independence is global; the claim here cannot stand while that CMA is open.` });
                }
            }
        } catch (e) { /* fail open */ }
        return reasons;
    }

    function checkORCompromise(gate, page){
        const reasons = [];
        const root = page.root;
        if(!root) return reasons;
        const topSev = pageTopSeverity(page);

        // Structural SPF: walk from root → gate. If no AND-family ancestor and top sev ≥ Hazardous, flag.
        const path = findPathTo(root, gate);
        if(path && path.length >= 1){
            const ancestors = path.slice(0, -1);
            const hasAndAncestor = ancestors.some(isAndFamily);
            if(!hasAndAncestor && topSev && SEV_ORDER[topSev] >= 4){
                reasons.push({
                    kind: 'structural-spf',
                    detail: `Gate ${gate.displayId || gate.id} has no AND-family ancestor and feeds a ${topSev} top event — any single child failure propagates to top.`
                });
            }
            if(gate === root && topSev && SEV_ORDER[topSev] >= 4){
                reasons.push({
                    kind: 'top-or-spf',
                    detail: `OR-family gate is the top event of a ${topSev} hazard — every child is structurally a single point of failure.`
                });
            }
        }
        return reasons;
    }

    function genGateIndependence(scopeKey){
        const out = [];
        walkPagesInScope(scopeKey, (node, page) => {
            if(!node || node.type !== 'gate') return;
            // Skip pure TRANSFER pointers and transferred-out stubs (destination root carries the children).
            if(node.gateType === 'TRANSFER' || node.transferOutTo) return;
            const kids = node.children || [];
            if(kids.length < 1) return;

            // Phase 55.0.8 — show descriptions alongside IDs so generated reqs read
            // as "BE-1 (Power supply A)" rather than the cryptic ID-only "BE-1".
            const childLabels = kids.map(c => {
                const id = c.displayId || String(c.id);
                const nm = (c.name || '').trim();
                return nm ? `${id} (${nm})` : id;
            }).join(', ');
            // Phase 56.49d — positive-form labels for independence requirements
            // (descriptions only, no IDs). When a description starts with a
            // failure-mode prefix ("Loss of", "Erroneous Info from", etc.) we
            // strip it so the subject reads as the signal/asset, not its failure.
            function _stripFailurePrefix(s) {
                // Strip leading failure-mode prefixes AND trailing failure verbs
                // ("Elevator servo channel A fails" → "Elevator servo channel A")
                // so independence subjects read as assets, not their failures.
                let t = (s || '').replace(/^(loss of (ability to )?|erroneous info from |inadvertent |failure of |loss of )/i, '').trim();
                t = t.replace(/ (fails?|failed|failure|lost|inoperative|unavailable)$/i, '').trim();
                return t || s;
            }
            const childAssetNames = kids.map(c => _stripFailurePrefix(c.name || c.displayId || ''));
            const childAssetSubject = _subjectList(childAssetNames);
            const sortedChildLids = kids.map(c => c.logicalId != null ? c.logicalId : c.id).slice().sort();
            const topSev = pageTopSeverity(page);
            const gateLabel = (function(){
                const id = node.displayId || '';
                const nm = (node.name || '').trim();
                if (id && nm) return `${id} (${nm})`;
                return id || nm || 'unnamed gate';
            })();

            // Phase 56.18d — gate rebalance rationale. When children of this
            // gate include externally-constrained events, allocator already
            // redistributed the budget; the requirement text should call this
            // out so designers know which sibling targets were tightened or
            // loosened to satisfy the external inheritance.
            let rebalRat = '';
            const rebalFingerprintTokens = [];
            if (node._externalRebalance) {
                rebalRat = ` Allocator rebalanced this gate's children because ${node._externalRebalance.constrainedCount} of ${node._externalRebalance.constrainedCount + node._externalRebalance.freeCount} carry an external-source link; sibling targets have been adjusted (tightened or loosened) to keep the gate at its allocated probability while honoring the inherited values.`;
                rebalFingerprintTokens.push('rebal', node._externalRebalance.mode, node._externalRebalance.constrainedCount);
            }

            // Surface the allocateDAL-generated independence requirement's substantiation state
            // (the precondition for the DAL reduction) in the AutoReq rationale.
            const _ir = node._independenceReq;
            const irNote = _ir
                ? ` DAL reduction taken under ${_ir.status} independence — CMA substantiation (ARP4761A App M) ${_ir.status === 'substantiated' ? 'is recorded' : 'is REQUIRED to validate the reduction'}.`
                : '';

            if(isAndFamily(node)){
                if (kids.length < 2) return;   // independence needs ≥2 members
                const reasons = checkANDCompromise(node).concat(checkCMACompromise(node, page));
                // A7 — structural notes travel with the reasons but never
                // compromise the requirement on their own.
                const _compromising = reasons.filter(r => !r.structural);
                // Phase 56.50 — independence is TYPED, one claim per requirement:
                //   (a) functional independence — the AND gate's standing claim;
                //   (b) development independence — only when a DAL reduction is
                //       predicated on it (Option 1/2), typed function-vs-item;
                //   (c) physical separation — only when the gate protects a
                //       Catastrophic top event (installation coupling matters);
                //   (d) common-cause couplings detected on the gate (shared
                //       library entry, declared CCF group, CMA-identified
                //       modes) become their own singular requirements.
                out.push({
                    text: `${childAssetSubject} shall be functionally independent.`,
                    rat: `Required by AND-family gate ${gateLabel} per ARP 4754A §5.4.1 — the gate's probability product assumes no common cause couples its members. Children: ${childLabels}.${rebalRat}${irNote}`,
                    level: 'L2', type: 'Safety', analysis: 'Independence',
                    verifMethod: 'Analysis',
                    traceId: node.displayId || '',
                    reqSource: {
                        generator: 'gate-indep-and',
                        sourceId: `${scopeKey}:gate-indep:${page.id}:${node.id}`,
                        context: { gateType: node.gateType, children: kids.map(c => c.displayId || String(c.id)), childLids: sortedChildLids, externalRebalance: node._externalRebalance || null },
                        fingerprint: fp('gate-indep-and', 'v2', node.gateType, sortedChildLids,
                            kids.map(c => c.ccfGroup || ''),
                            kids.map(c => c.libraryKey || ''),
                            ...rebalFingerprintTokens),
                        generatedAt: Date.now()
                    },
                    compromised: _compromising.length > 0,
                    compromiseReasons: reasons
                });

                // (b) Development independence — the predicate of the DAL reduction.
                if (_ir) {
                    const kw = (page.treeLevel === 'system')
                        ? (kids.every(c => c.type === 'basic') ? 'item' : 'function')
                        : (page.treeLevel === 'aircraft' ? 'function'
                            : (kids.every(c => c.type === 'basic') ? 'item' : 'function'));
                    const opt = node.dalOption === 'opt1' ? '1' : '2';
                    out.push({
                        text: `${childAssetSubject} shall be developed with ${kw} development independence.`,
                        rat: `The DAL reduction at gate ${gateLabel} (ARP4754B §5.2.3 / ARP4761A Table P2, Option ${opt}) is predicated on development independence between the members. CMA substantiation (ARP4761A App M) ${_ir.status === 'substantiated' ? 'is recorded' : 'is REQUIRED to validate the reduction'}. Children: ${childLabels}.`,
                        level: 'L2', type: 'Safety', analysis: 'Independence',
                        verifMethod: 'Analysis',
                        traceId: node.displayId || '',
                        reqSource: {
                            generator: 'gate-indep-dev',
                            sourceId: `${scopeKey}:gate-indep-dev:${page.id}:${node.id}`,
                            context: { gateType: node.gateType, childLids: sortedChildLids, option: opt, kind: kw, cmaStatus: _ir.status },
                            fingerprint: fp('gate-indep-dev', node.gateType, sortedChildLids, opt, kw, _ir.status),
                            generatedAt: Date.now()
                        }
                    });
                }

                // (c) Physical separation — Catastrophic top events only.
                if (topSev === 'Catastrophic') {
                    out.push({
                        text: `${childAssetSubject} shall be physically separated.`,
                        rat: `Members of AND-family gate ${gateLabel} protect a Catastrophic top event; installation separation (location, routing, power sources) is required so a single physical event cannot fail more than one member. Coverage is corroborated by ZSA/PRA. Children: ${childLabels}.`,
                        level: 'L2', type: 'Safety', analysis: 'Independence',
                        verifMethod: 'Inspection',
                        traceId: node.displayId || '',
                        reqSource: {
                            generator: 'gate-indep-phys',
                            sourceId: `${scopeKey}:gate-indep-phys:${page.id}:${node.id}`,
                            context: { gateType: node.gateType, childLids: sortedChildLids, topSeverity: topSev },
                            fingerprint: fp('gate-indep-phys', node.gateType, sortedChildLids, topSev),
                            generatedAt: Date.now()
                        }
                    });
                }

                // (d1) Shared component-library entries → dissimilarity requirements.
                const libGroups = new Map();
                kids.forEach(c => {
                    if (!c.libraryKey) return;
                    if (!libGroups.has(c.libraryKey)) libGroups.set(c.libraryKey, []);
                    libGroups.get(c.libraryKey).push(c);
                });
                libGroups.forEach((members, key) => {
                    if (members.length < 2) return;
                    const subj = _subjectList(members.map(c => _stripFailurePrefix(c.name || c.displayId || '')));
                    out.push({
                        text: `${subj} shall not be implemented with components of a common part number or design family.`,
                        rat: `Members of AND-family gate ${gateLabel} reference the same component library entry "${key}"; a shared design family defeats the independence claimed at this gate (common-mode susceptibility, ARP4761A App M). Members: ${members.map(c => c.displayId || String(c.id)).join(', ')}.`,
                        level: 'L2', type: 'Safety', analysis: 'Independence',
                        verifMethod: 'Inspection',
                        traceId: node.displayId || '',
                        reqSource: {
                            generator: 'gate-indep-ccf-lib',
                            sourceId: `${scopeKey}:gate-indep-ccf-lib:${page.id}:${node.id}:${key}`,
                            context: { libraryKey: key, members: members.map(c => c.displayId || String(c.id)) },
                            fingerprint: fp('gate-indep-ccf-lib', key, members.map(c => c.logicalId != null ? c.logicalId : c.id).sort()),
                            generatedAt: Date.now()
                        }
                    });
                });

                // (d2) Declared CCF groups → common-cause control requirements.
                const ccfGroups = new Map();
                kids.forEach(c => {
                    if (!c.ccfGroup) return;
                    if (!ccfGroups.has(c.ccfGroup)) ccfGroups.set(c.ccfGroup, []);
                    ccfGroups.get(c.ccfGroup).push(c);
                });
                ccfGroups.forEach((members, grp) => {
                    if (members.length < 2) return;
                    const subj = _subjectList(members.map(c => _stripFailurePrefix(c.name || c.displayId || '')));
                    out.push({
                        text: `A single common cause shall not fail more than one of ${subj}.`,
                        rat: `Members of AND-family gate ${gateLabel} are declared members of CCF group "${grp}". The independence claimed at this gate requires the declared coupling to be controlled by segregation and its residual contribution bounded (β term) in the gate's quantification (ARP4761A App M). Members: ${members.map(c => c.displayId || String(c.id)).join(', ')}.`,
                        level: 'L2', type: 'Safety', analysis: 'Independence',
                        verifMethod: 'Analysis',
                        traceId: node.displayId || '',
                        reqSource: {
                            generator: 'gate-indep-ccf-group',
                            sourceId: `${scopeKey}:gate-indep-ccf-group:${page.id}:${node.id}:${grp}`,
                            context: { ccfGroup: grp, members: members.map(c => c.displayId || String(c.id)) },
                            fingerprint: fp('gate-indep-ccf-group', grp, members.map(c => c.logicalId != null ? c.logicalId : c.id).sort()),
                            generatedAt: Date.now()
                        }
                    });
                });

                // (d3) CMA-identified common modes → preclusion requirements. Emitted
                // for ANY CMA linking this gate with identified modes (not just open
                // ones): closing the CMA is the verification evidence, and the
                // requirement must survive closure — it is the design constraint the
                // mitigation made real. Status travels in rationale + fingerprint.
                const gateKey = page.id + ':' + node.id;
                (typeof cmaData !== 'undefined' ? cmaData : []).forEach(c => {
                    if (!c || !c.linkedGateIds || !c.linkedGateIds.includes(gateKey)) return;
                    const modes = c.modes || [];
                    if (!modes.length) return;
                    const modeLabelMap = (typeof CMA_MODE_LABELS !== 'undefined') ? CMA_MODE_LABELS : {};
                    const cmaIdStr = c.cmaId || ('CMA#' + c.internalId);
                    const status = c.status || 'Open';
                    modes.forEach(m => {
                        const label = modeLabelMap[m] || m;
                        out.push({
                            text: `The design shall preclude ${_midSentence(label)} from affecting more than one of ${childAssetSubject}.`,
                            rat: `Derived from ${cmaIdStr} (status: ${status}), which identifies this common mode across the members of AND-family gate ${gateLabel}. CMA closure (Mitigated / Closed — Accepted) is the substantiating evidence.${c.findings ? ' Findings: ' + c.findings : ''}`,
                            level: 'L2', type: 'Safety', analysis: 'Independence',
                            verifMethod: 'Analysis',
                            traceId: node.displayId || '',
                            reqSource: {
                                generator: 'gate-indep-cma',
                                sourceId: `${scopeKey}:gate-indep-cma:${page.id}:${node.id}:${c.internalId}:${m}`,
                                context: { cmaId: cmaIdStr, mode: m, status, childLids: sortedChildLids },
                                fingerprint: fp('gate-indep-cma', m, status, sortedChildLids),
                                generatedAt: Date.now()
                            }
                        });
                    });
                });
            } else if(isOrFamily(node)){
                const reasons = checkORCompromise(node, page).concat(checkCMACompromise(node, page));
                // Phase 56.49e — NSPF requirement only at FC top with severity
                // ≥ Hazardous. Suppress OR-gate NSPF for everything else (it's
                // a tautology — the upstream AND covers NSPF for the FC).
                if (node !== page.root) return;   // not the FC top, skip
                if (!topSev || SEV_ORDER[topSev] < 4) return;   // not Catastrophic/Hazardous
                // Use the FULL failure condition (do NOT strip "Loss of…") — an NSPF requirement must
                // name the FAILURE ("loss of cabin pressurization"), not the function ("cabin
                // pressurization"). Lowercase the first letter for mid-sentence flow unless it's an acronym.
                const _rawFc = (node.name || gateLabel || '').trim();
                const _fw = _rawFc.split(/\s+/)[0] || '';
                const fcSubject = (_fw && _fw === _fw.toUpperCase() && _fw.length > 1)
                    ? _rawFc
                    : (_rawFc.charAt(0).toLowerCase() + _rawFc.slice(1));
                out.push({
                    text: `No single failure shall result in ${fcSubject}.`,
                    rat: `Required for ${topSev} failure conditions per 14 CFR 25.1309(b) / AC 25.1309-1B §4.1. Top: ${gateLabel}.${rebalRat}`,
                    level: 'L2', type: 'Safety', analysis: 'Independence',
                    verifMethod: 'Analysis',
                    traceId: node.displayId || '',
                    reqSource: {
                        generator: 'gate-indep-or',
                        sourceId: `${scopeKey}:gate-indep:${page.id}:${node.id}`,
                        context: { gateType: node.gateType, children: kids.map(c => c.displayId || String(c.id)), childLids: sortedChildLids, topSeverity: topSev, externalRebalance: node._externalRebalance || null },
                        fingerprint: fp('gate-indep-or', 'v2', node.gateType, sortedChildLids, topSev, ...rebalFingerprintTokens),
                        generatedAt: Date.now()
                    },
                    compromised: reasons.length > 0,
                    compromiseReasons: reasons
                });
            }
        });
        return out;
    }

    // ----- Generator 5: PRA → zonal protection requirements -----
    // One requirement per PRA that lists affected zones. Aggregates the exposed sub-functions
    // (housed functions across the affected zones) so the requirement captures the full bidirectional
    // PRA ↔ Zone ↔ Function trace. AC-scope only — PRAs are inherently aircraft-level.
    function genPRA(scopeKey){
        if (scopeKey !== 'ac') return [];
        const out = [];
        const pras = (typeof praData !== 'undefined' ? praData : []) || [];
        pras.forEach(p => {
            if (!p) return;
            // 23 Sep 2026 (G3) — a risk with SCENARIOS yields one traced requirement per scenario
            // (origin, rationale, classification, allocation, interrelation — pra_scenarios.js);
            // a risk without keeps the single zonal requirement below, so nothing churns.
            if (typeof SLPraScenarios !== 'undefined' && SLPraScenarios.has(p)) { out.push(...SLPraScenarios.requirements(p, fp, scopeKey)); return; }
            if (p.disposition === 'na') return;   // ruled not applicable on the PRA canvas
            const zones = Array.isArray(p.affectedZones) ? p.affectedZones.slice().sort() : [];
            if (!zones.length) return;   // PRAs without affected zones have nothing to constrain
            // Derive exposed sub-functions via the zone → housedFunctions join.
            const exposed = new Set();
            zones.forEach(zid => {
                const z = (typeof zsaData !== 'undefined' ? zsaData : []).find(zz => zz.zoneId === zid);
                if (z && Array.isArray(z.housedFunctions)) z.housedFunctions.forEach(s => exposed.add(s));
            });
            const exposedList = Array.from(exposed).sort();
            const zonesStr = zones.join(', ');
            const exposedStr = exposedList.length ? exposedList.join(', ') : 'no housed functions recorded';
            const mitRat = p.mitigation ? ` Reference mitigation: ${p.mitigation}.` : '';
            const sourceKey = p.praId || ('internal-' + p.internalId);
            // Phase 56.50 — EARS unwanted-behavior form: "If <trigger>, the
            // <system> shall <response>." One shall; the old "or compensating
            // means shall be provided" escape clause and the second/third shall
            // are gone — the PRA linkage and mitigation live in the rationale.
            const retainStr = exposedList.length ? exposedList.join(', ') : 'the aircraft sub-functions housed in those zones';
            out.push({
                text: `If the particular risk "${p.threat || 'unspecified threat'}" occurs within zone(s) ${zonesStr}, the aircraft shall retain ${retainStr}.`,
                rat: `Derived from PRA ${p.praId || ''}: "${p.desc || ''}". Threat: ${p.threat || '—'}. Zones affected: ${zonesStr}. Exposed sub-functions (via zone housing): ${exposedStr}. Retention may be met by protection of the installation or by an accepted compensating means — either way the exposed functions survive the postulated event.${mitRat} Per ARP4761A App L / 14 CFR 25.1309.`,
                level: 'L2', type: 'Safety', analysis: 'Independence',
                verifMethod: 'Analysis',
                traceId: p.praId || '',
                reqSource: {
                    generator: 'pra-zonal',
                    sourceId: `${scopeKey}:pra:${sourceKey}`,
                    context: { threat: p.threat || '', zones, exposedFunctions: exposedList, mitigation: p.mitigation || '' },
                    fingerprint: fp('pra-zonal', 'v2', p.threat || '', zones, exposedList, p.mitigation || ''),
                    generatedAt: Date.now()
                }
            });
        });
        return out;
    }

    // ----- Generator 6: ZSA → housed-function separation requirements -----
    // Per ZSA zone, one separation requirement covering the functions housed in that zone.
    // Catastrophic zones (per ZSA severity) get strictened wording. AC-scope only.
    function genZSA(scopeKey){
        if (scopeKey !== 'ac') return [];
        const out = [];
        const zsas = (typeof zsaData !== 'undefined' ? zsaData : []) || [];
        zsas.forEach(z => {
            if (!z || !z.zoneId) return;
            const housed = Array.isArray(z.housedFunctions) ? z.housedFunctions.slice().sort() : [];
            if (!housed.length) return;   // no housed functions → nothing to separate
            const isCat = z.severity === 'Catastrophic';
            const housedStr = housed.join(', ');
            // Phase 56.50 — the verifiable claim IS the requirement: a single
            // zonal event must not take out more than one housed sub-function.
            // "Adequate … separation" (banned vague term) and the multi-shall
            // Catastrophic strictness clause are gone: the separation means are
            // rationale, and Catastrophic zones get a separate singular physical-
            // separation requirement verified by inspection.
            const strictRat = isCat
                ? ' The zone is classified Catastrophic; physical (not merely logical) separation is required — see the companion physical-separation requirement.'
                : '';
            const mitRat = z.mitigation ? ` Existing mitigation reference: ${z.mitigation}.` : '';
            const sourceKey = z.zoneId;
            out.push({
                text: `A single zonal event within zone ${z.zoneId} shall not compromise more than one of ${housedStr}.`,
                rat: `Derived from ZSA zone ${z.zoneId} (${z.desc || 'no description'}). Severity: ${z.severity || '—'}. Equipment: ${z.equip || '—'}. Environmental, electrical, mechanical, and installation separation of the housed sub-functions is the design means.${strictRat}${mitRat} Per ARP4761A App K / AC 25.1309-1B Zonal Safety Analysis.`,
                level: 'L2', type: 'Safety', analysis: 'Independence',
                verifMethod: 'Analysis',
                traceId: z.zoneId || '',
                reqSource: {
                    generator: 'zsa-separation',
                    sourceId: `${scopeKey}:zsa:${sourceKey}`,
                    context: { zoneId: z.zoneId, severity: z.severity || '', housedFunctions: housed, equip: z.equip || '', mitigation: z.mitigation || '' },
                    fingerprint: fp('zsa-separation', 'v2', z.zoneId, z.severity || '', housed, z.equip || '', z.mitigation || ''),
                    generatedAt: Date.now()
                }
            });
            if (isCat) {
                out.push({
                    text: `The aircraft sub-functions housed in zone ${z.zoneId} shall be physically separated.`,
                    rat: `Zone ${z.zoneId} is classified Catastrophic; separation must be physical, not merely logical. Housed sub-functions: ${housedStr}. Verified by inspection of the installation and by analysis (ZSA).`,
                    level: 'L2', type: 'Safety', analysis: 'Independence',
                    verifMethod: 'Inspection',
                    traceId: z.zoneId || '',
                    reqSource: {
                        generator: 'zsa-phys',
                        sourceId: `${scopeKey}:zsa:${sourceKey}:phys`,
                        context: { zoneId: z.zoneId, housedFunctions: housed },
                        fingerprint: fp('zsa-phys', z.zoneId, housed),
                        generatedAt: Date.now()
                    }
                });
            }
        });
        return out;
    }

    // Resolve target store + helper for scope key 'ac' or 'sys-<id>'.
    // ----- Generator 7: HF register -> ARP4754B §5.3.1.4 operational requirements -----
    //
    // WHY THIS EXISTS. ARP4754B §5.1.8 is the mandate: where human-performed tasks
    // or limitations are relied on to ensure safety or to form part of the
    // certification substantiation, they should be identified and recorded in the
    // certification data. The HF register already IDENTIFIES them — that is what a
    // typed Human Factors assumption is. Nothing was RECORDING them as requirements,
    // so the crew credit lived only as an assumption and never became something with
    // a verification method against it.
    //
    // §5.3.1.4 names four things as the bulk of an operational requirement: actions,
    // decisions, information requirements, and timing. Three of those are derivable
    // from what the register actually holds. The fourth is not, and this generator
    // does not invent it:
    //
    //   ACTIONS      — hf.crewmember + hf.direction + the assumption statement.
    //                  The statement is QUOTED, never paraphrased. Every other
    //                  generator in this file builds text from structured fields
    //                  (a probability, a DAL, an interval); the action exists only
    //                  as the analyst's prose, and rewriting an engineer's words
    //                  into an imperative is how meaning gets quietly changed.
    //
    //   TIMING       — hf.taskTimeS with hf.taskTimeBasis. The strongest of the
    //                  three: a measured number with a stated provenance.
    //
    //   INFORMATION  — hf.channels, but ONLY the sensory ones. The channel pack
    //                  mixes input channels (visual, auditory) with response and
    //                  resource channels (psychomotor, verbal, cognitive). A
    //                  requirement on what the aircraft must PRESENT can only be
    //                  built from the input side; "presented via the cognitive
    //                  channel" is not a sentence about a display.
    //
    //   DECISIONS    — NOT GENERATED. There is no decision field on the register.
    //                  Deriving one from direction or workload band would be
    //                  invention dressed as derivation. Logged as an open item.
    //
    // §5.3.1.4 also requires normal AND non-normal circumstances to be considered.
    // The register's `direction` carries that distinction (prevention tasks run in
    // normal operation; recovery and non-recovery are by definition non-normal), so
    // it is stated in the rationale rather than turned into a separate requirement.
    function genHfOperational(scopeKey){
        const out = [];
        const A = (typeof window !== 'undefined') ? window.HF_ASSUMPTIONS : null;
        if (!A || typeof A.asmAllTyped !== 'function') return out;

        // An assumption's scope is 'Aircraft' or the system's display name; the
        // generator's scopeKey is 'ac' or 'sys-<id>'. Resolve one to the other, and
        // fall back to the id, because a system with no name still owns its rows.
        let wantScope = 'Aircraft';
        if (scopeKey !== 'ac') {
            const sysId = scopeKey.replace(/^sys-/, '');
            const sys = (systemsData || []).find(x => x.id === sysId);
            wantScope = sys ? (sys.name || sys.id) : sysId;
        }

        // Failure conditions resting on this assumption — the reason the crew credit
        // is load-bearing, and what makes the requirement traceable.
        const fhaArr = fhaArrForScope(scopeKey) || [];
        const fcsFor = asmId => fhaArr.filter(f => (f.assumptionIds || []).indexOf(asmId) >= 0);

        const SENSORY = { visual: 1, auditory: 1, tactile: 1 };
        const phaseNames = (typeof A.phasesNormalized === 'function') ? A.phasesNormalized() : [];
        const phaseOf = n => phaseNames.find(p => String(p.name).toLowerCase() === String(n || '').toLowerCase()) || null;

        (A.asmAllTyped() || []).forEach(a => {
            if (!a || a.type !== 'hf' || !a.hf) return;
            if (String(a.scope) !== String(wantScope)) return;
            const h = a.hf;
            const crew = (h.crewmember || '').trim();
            if (!crew) return;   // without a responsible party there is no operational requirement to write

            const stmt = String(a.text || '').trim();
            if (!stmt) return;

            const fcs = fcsFor(a.asmId);
            const fcRat = fcs.length
                ? ` Relied on by ${fcs.map(f => f.fcId || ('#' + f.internalId)).join(', ')}` +
                  (fcs.some(f => /^(Catastrophic|Hazardous)$/i.test(f.severity || '')) ? ' (includes a Catastrophic/Hazardous condition)' : '') + '.'
                : ' Not yet linked to a failure condition — the credit is recorded but nothing rests on it.';
            const stateRat = A.isValidated(a.state)
                ? ` Assumption ${a.asmId} is ${a.state}, so the credited posture holds.`
                : ` Assumption ${a.asmId} is ${a.state} — the credit is NOT yet validated, so the conservative posture governs until it is (INV-35).`;
            const dir = (h.direction || 'recovery');
            const circumstance = (dir === 'prevention')
                ? 'normal operation (the task prevents the condition arising)'
                : (dir === 'workload' ? 'normal and non-normal operation' : 'non-normal operation (the condition has arisen)');
            const ph = h.responsePhase ? phaseOf(h.responsePhase) : null;
            const phaseClause = h.responsePhase ? ` during ${h.responsePhase}` : '';
            const mandate = 'ARP4754B §5.1.8 — a human-performed task relied on to ensure safety is to be identified and recorded in the certification data; §5.3.1.4 is the class it is recorded as.';
            // A basis naming a simulator or a trial IS test evidence; anything else
            // is task analysis until somebody says otherwise.
            const basis = String(h.taskTimeBasis || '').trim();
            const byTest = /\b(sim|simulator|trial|flight test|test|measured|observed)\b/i.test(basis);

            // ---- ACTION -------------------------------------------------------
            out.push({
                text: `The ${crew} shall perform the ${dir} task credited by ${a.asmId}${phaseClause}: "${stmt}"`,
                rat: `${mandate} Circumstance: ${circumstance}.${fcRat}${stateRat} The task statement is reproduced verbatim from the assumption — it is the analyst's wording, not a restatement.`,
                level: 'L1', type: 'Operational', analysis: 'Human Factors',
                verifMethod: 'Analysis',
                traceId: fcs.length ? (fcs[0].fcId || '') : '',
                reqSource: {
                    generator: 'hf-op-action',
                    sourceId: `${scopeKey}:hf-op-action:${a.asmId}`,
                    context: { asmId: a.asmId, crewmember: crew, direction: dir, state: a.state,
                               responsePhase: h.responsePhase || '', fcIds: fcs.map(f => f.fcId || '') },
                    fingerprint: fp('hf-op-action', a.asmId, stmt, crew, dir, a.state, h.responsePhase || '',
                                    fcs.map(f => f.fcId || '').slice().sort()),
                    generatedAt: Date.now()
                }
            });

            // ---- TIMING -------------------------------------------------------
            if (h.taskTimeS != null && h.taskTimeS > 0) {
                const win = ph && ph.windowS ? ph.windowS : 0;
                const util = win ? (h.taskTimeS / win) : 0;
                const winRat = win
                    ? ` The ${h.responsePhase} response window is ${win} s, so this task alone occupies ${Math.round(util * 100)}% of it` +
                      (util > (A.TIME_OCCUPANCY_RED_LINE || 0.8) ? ` — already past the ${Math.round((A.TIME_OCCUPANCY_RED_LINE || 0.8) * 100)}% time-occupancy red line before any co-activated task is counted (INV-36).` : '.')
                    : ` No response window is authored for ${h.responsePhase || 'this phase'}, so INV-36 saturation is silent here and this time is unbounded by anything.`;
                out.push({
                    text: `The ${crew} shall complete the task credited by ${a.asmId} within ${h.taskTimeS} seconds${phaseClause}.`,
                    rat: `${mandate} Timing is the element of §5.3.1.4 the register holds most firmly.` +
                         (basis ? ` Basis: ${basis}.` : ' No basis is recorded for this task time — it is an assumed number until one is.') +
                         winRat + stateRat,
                    level: 'L1', type: 'Operational', analysis: 'Human Factors',
                    verifMethod: byTest ? 'Test' : 'Analysis',
                    traceId: fcs.length ? (fcs[0].fcId || '') : '',
                    reqSource: {
                        generator: 'hf-op-timing',
                        sourceId: `${scopeKey}:hf-op-timing:${a.asmId}`,
                        context: { asmId: a.asmId, taskTimeS: h.taskTimeS, basis, windowS: win,
                                   utilization: win ? Math.round(util * 100) / 100 : null, crewmember: crew },
                        fingerprint: fp('hf-op-timing', a.asmId, h.taskTimeS, basis, win, crew, a.state),
                        generatedAt: Date.now()
                    }
                });
            }

            // ---- INFORMATION --------------------------------------------------
            const sensory = (h.channels || []).filter(c => SENSORY[String(c).toLowerCase()]);
            if (sensory.length) {
                out.push({
                    text: `The information the ${crew} requires to perform the task credited by ${a.asmId} shall be presented via the ${sensory.join(' and ')} channel${sensory.length > 1 ? 's' : ''}${phaseClause}.`,
                    rat: `${mandate} §5.3.1.4 defines operational requirements as the interface between the flight crew and the functional system; the declared sensory channels ARE that interface.` +
                         ((h.channels || []).length > sensory.length
                            ? ` The assumption also declares ${(h.channels || []).filter(c => !SENSORY[String(c).toLowerCase()]).join(', ')} — those describe what the crew does with the information, not what the system must present, so they are deliberately not requirements here.`
                            : '') + stateRat,
                    level: 'L1', type: 'Operational', analysis: 'Human Factors',
                    verifMethod: 'Inspection',
                    traceId: fcs.length ? (fcs[0].fcId || '') : '',
                    reqSource: {
                        generator: 'hf-op-info',
                        sourceId: `${scopeKey}:hf-op-info:${a.asmId}`,
                        context: { asmId: a.asmId, sensoryChannels: sensory, allChannels: h.channels || [], crewmember: crew },
                        fingerprint: fp('hf-op-info', a.asmId, sensory.slice().sort(), crew, a.state),
                        generatedAt: Date.now()
                    }
                });
            }
        });
        return out;
    }

    // ----- Generator 8: interface register -> ARP4754B §5.3.1.8 interface requirements -----
    //
    // §5.3.1.8 asks for the interconnections plus the relevant characteristics of
    // the information communicated; every input with a source and every output
    // destination defined; and descriptions that fully describe signal behaviour.
    // projectConfig.interfaces holds exactly those fields — fromSystemId,
    // fromFuncId, toSystemId, toFuncId, kind, medium, direction, icdRef,
    // resourceId — and is already read by cea_graph, sneak_module,
    // oos_independence and gt_integrity. Nothing was turning it into requirements.
    //
    // The clause's own completeness conditions are checkable, so an incomplete
    // edge produces a requirement that SAYS what is missing rather than a tidy
    // sentence that implies the interface is defined when it is not. That is the
    // whole value here: a silent gap in an interface register is invisible, and
    // the requirement register is where it becomes somebody's problem.
    function genInterface(scopeKey){
        const out = [];
        // Interfaces are aircraft-level architecture: system-to-system edges. A
        // system scope would be claiming ownership of the far end too.
        if (scopeKey !== 'ac') return out;
        const edges = (typeof projectConfig === 'object' && projectConfig && Array.isArray(projectConfig.interfaces))
            ? projectConfig.interfaces : [];
        if (!edges.length) return out;
        const sysName = id => {
            const s = (systemsData || []).find(x => x.id === id);
            return s ? (s.name || s.id) : (id || '(undefined endpoint)');
        };
        const DIR = { a_to_b: 'unidirectional', b_to_a: 'unidirectional', bidirectional: 'bidirectional' };

        edges.forEach(e => {
            if (!e) return;
            const from = sysName(e.fromSystemId), to = sysName(e.toSystemId);
            const eid = e.id || (String(e.fromSystemId) + '->' + String(e.toSystemId) + ':' + String(e.kind || ''));
            const arrow = (e.direction === 'b_to_a') ? (to + ' to ' + from) : (from + ' to ' + to);
            const both  = e.direction === 'bidirectional';

            // What the clause requires, and whether this edge supplies it.
            const missing = [];
            if (!e.fromSystemId || !e.toSystemId) missing.push('an endpoint is undefined, so the input has no source or the output no destination');
            if (!String(e.medium || '').trim())   missing.push('no medium or signal set is recorded, so the characteristics of the information communicated are undefined');
            if (!e.direction)                     missing.push('no direction is recorded');
            if (!String(e.icdRef || '').trim())   missing.push('no ICD reference, so nothing fully describes the behavior of the signals');

            const mediumClause = String(e.medium || '').trim() ? ` carrying ${e.medium}` : '';
            const dirClause = both ? ', in both directions' : '';
            const icdClause = String(e.icdRef || '').trim() ? ` in accordance with ${e.icdRef}` : '';
            const kindNote = e.kind === 'resource'
                ? ' This is a SHARED RESOURCE edge — it is a common-cause candidate, and the CMA evaluates whether it defeats an independence claim resting on these two systems.'
                : (e.kind === 'functional'
                    ? ' This is a FUNCTIONAL dependency — the far system relies on this interface to deliver its function, so a loss here propagates as a functional failure rather than only a data one.'
                    : '');

            out.push({
                text: `The interface from ${arrow}${mediumClause}${dirClause} shall be defined${icdClause}, with the source of every input, the destination of every output, and the behavior of the signals fully described.`,
                rat: `ARP4754B §5.3.1.8 — interface requirements cover the interconnections and the relevant characteristics of the information communicated; inputs are to have a defined source and outputs a defined destination, and the descriptions are to fully describe signal behavior.` +
                     ` Derived from the project interface register (${e.kind || 'interface'} edge${e.id ? ' ' + e.id : ''}).` + kindNote +
                     (missing.length
                        ? ` INCOMPLETE against the clause: ${missing.join('; ')}. The requirement is generated anyway — an interface the safety case leans on that nobody has defined is exactly the gap this class exists to surface.`
                        : ` The register supplies endpoints, medium, direction and an ICD reference, so the clause's completeness conditions are met.`),
                level: 'L2', type: 'Interface', analysis: 'Interface register',
                verifMethod: 'Inspection',
                traceId: '',
                reqSource: {
                    generator: 'iface-def',
                    sourceId: `${scopeKey}:iface-def:${eid}`,
                    context: { from: e.fromSystemId || '', to: e.toSystemId || '', kind: e.kind || '',
                               medium: e.medium || '', direction: e.direction || '', icdRef: e.icdRef || '',
                               resourceId: e.resourceId || '', incomplete: missing },
                    fingerprint: fp('iface-def', e.fromSystemId || '', e.toSystemId || '', e.kind || '',
                                    e.medium || '', e.direction || '', e.icdRef || '', e.resourceId || '',
                                    missing.slice().sort()),
                    generatedAt: Date.now()
                }
            });
        });
        return out;
    }

    function storeForScope(scope){
        if(scope === 'ac') return acReqData;
        const sysId = scope.replace(/^sys-/, '');
        const s = systemsData.find(x => x.id === sysId);
        return s ? s.req : null;
    }
    function fhaArrForScope(scope){
        if(scope === 'ac') return acFhaData;
        const sysId = scope.replace(/^sys-/, '');
        const s = systemsData.find(x => x.id === sysId);
        return s ? s.fha : [];
    }

    // =====================================================================
    // Phase 66.36 — A4. THE IN-PLACE RE-BUCKETING MIGRATION.
    //
    // U-6 / BUILD_SPEC §B6. A2 changes which bucket a node belongs to. The bucket is
    // encoded TWICE — by which array the row physically lives in (acReqData vs
    // system.req) and by the `ac:` / `sys-<id>:` prefix on reqSource.sourceId, which
    // _scopeOf() reads back. Both must move together:
    //
    //   - rewrite the prefix only  → the row stays in acReqData while _scopeOf reports
    //     sys-fcs; the next generate() cannot find it in storeForScope('sys-fcs'),
    //     creates a duplicate there and orphans the original.
    //   - move the row only        → _scopeOf reports the old owner forever.
    //
    // So this is one operation, or it is a corruption. And it MIGRATES rather than
    // regenerating: a regenerate mints a new internalId and loses verification status,
    // verification evidence and every manual edit on the row.
    //
    // fta-interval (the companion maintenance requirement) shares the lid keyspace and
    // moves with its event — leaving it behind would strand it in a bucket whose tree no
    // longer contains the node it refers to.
    //
    // POSTURE, ruled by Waqas 19 Aug 2026: previewed and confirmed, never silent. This
    // module only PLANS the migration; nothing here writes until applyBucketMigration is
    // called from an explicit user action, and the decision is recorded as provenance in
    // an attributed sentence. Same posture as the rebalance flow in BUILD_SPEC §D: a tool
    // that moves a safety requirement's owner without a human deciding is making the
    // decision itself.
    // =====================================================================

    const _REBUCKETABLE = { 'fta-event': true, 'fta-interval': true };

    // '<scope>:<generator>:<lid>' — the lid may itself contain colons, so match rather
    // than split. Returns null for any sourceId that is not a re-bucketable FTA row.
    function _parseFtaSourceId(sid){
        const m = String(sid || '').match(/^(ac|sys-[^:]+):(fta-event|fta-interval):(.+)$/);
        return m ? { scope: m[1], generator: m[2], lid: m[3] } : null;
    }

    // Every requirement row in the project, tagged with the bucket it physically sits in.
    function _allReqRows(){
        const rows = [];
        (acReqData || []).forEach(r => rows.push({ req: r, bucket: 'ac', store: acReqData }));
        (systemsData || []).forEach(s => {
            if(!s || !Array.isArray(s.req)) return;
            s.req.forEach(r => rows.push({ req: r, bucket: 'sys-' + s.id, store: s.req }));
        });
        return rows;
    }

    // lid → the bucket its node belongs to NOW, by declared owner. First occurrence wins,
    // matching the seenLids dedupe in genFTAEvents so the plan and the generator agree.
    function _bucketByLid(){
        const map = new Map();
        _allocationPages().forEach(page => {
            const ctx = _ownerCtx(page);
            (function walk(node){
                if(!node) return;
                if(node.type === 'basic' || node.type === 'undeveloped'){
                    const lid = String(node.logicalId != null ? node.logicalId : node.id);
                    if(!map.has(lid)) map.set(lid, { scope: _nodeScopeKey(node, page, ctx), node, page });
                }
                const kids = node.children || node._children;
                if(kids) kids.forEach(walk);
            })(page.root);
        });
        return map;
    }

    // What WOULD move, and what it costs. Pure — reads only.
    function planBucketMigration(){
        const want = _bucketByLid();
        const moves = [], unresolved = [];
        _allReqRows().forEach(row => {
            const r = row.req;
            if(!r || r.deleted || !r.reqSource) return;
            if(!_REBUCKETABLE[r.reqSource.generator]) return;
            const parsed = _parseFtaSourceId(r.reqSource.sourceId);
            if(!parsed) return;
            const target = want.get(String(parsed.lid));
            // The node is gone — that is an ORPHAN, which generate() already reports.
            // Silently re-filing a requirement whose source no longer exists would hide it.
            if(!target){ unresolved.push({ req: r, from: row.bucket, lid: parsed.lid, reason: 'no node with this logical id on any allocation page' }); return; }
            if(target.scope === row.bucket && parsed.scope === row.bucket) return;   // already correct
            const destStore = storeForScope(target.scope);
            if(!destStore){ unresolved.push({ req: r, from: row.bucket, lid: parsed.lid, reason: 'destination bucket ' + target.scope + ' has no requirement store' }); return; }
            moves.push({
                req: r,
                lid: parsed.lid,
                generator: parsed.generator,
                from: row.bucket,
                to: target.scope,
                prefixWas: parsed.scope,
                // The two facts that decide whether this is cheap or expensive, per §D:
                // a draft costs nothing to move; an issued, evidenced requirement does not.
                hasVerificationStatus: !!(r.verifStatus || r.verificationStatus),
                hasEvidence: !!(r.verifEvidence || (Array.isArray(r.evidence) && r.evidence.length)),
                userOverridden: !!(r.reqSource && r.reqSource.userOverridden),
                traceId: r.traceId || r.id || ('REQ-' + r.internalId),
                text: r.text || ''
            });
        });
        return { moves, unresolved };
    }

    function _bucketLabel(scope){
        if(scope === 'ac') return 'Aircraft';
        const s = (systemsData || []).find(x => x && ('sys-' + x.id) === scope);
        return s ? (s.name || s.id) : scope;
    }

    // Apply a plan. Writes. Only ever called from an explicit user action.
    function applyBucketMigration(plan, opts){
        opts = opts || {};
        if(!plan || !Array.isArray(plan.moves) || !plan.moves.length) return 0;
        let who = opts.by || '';
        if(!who){ try { who = (typeof window !== 'undefined' && typeof window._signoffReviewerName === 'function') ? (window._signoffReviewerName() || '') : ''; } catch(_) { who = ''; } }
        const when = new Date();
        let n = 0;
        plan.moves.forEach(mv => {
            const src = storeForScope(mv.from);
            const dst = storeForScope(mv.to);
            if(!src || !dst) return;
            const i = src.indexOf(mv.req);
            if(i < 0) return;
            const preSnap = (typeof ReqHistory !== 'undefined' && ReqHistory.snapshot) ? (function(){ try { return ReqHistory.snapshot(mv.req); } catch(_) { return null; } })() : null;
            // Move the row, then rewrite the key. Order matters only for readability —
            // both land before anything else can observe the store.
            src.splice(i, 1);
            dst.push(mv.req);
            mv.req.reqSource.sourceId = mv.to + ':' + mv.generator + ':' + mv.lid;
            // Provenance, in the active voice and naming a person. "budgets updated" is
            // exactly what this must never say (§D).
            const sentence = (who || 'An analyst') + ' moved ' + mv.traceId + ' from the '
                + _bucketLabel(mv.from) + ' register to ' + _bucketLabel(mv.to) + ' on '
                + when.toLocaleDateString() + ', because the fault-tree node it is allocated from '
                + 'is declared to ' + _bucketLabel(mv.to) + '.';
            const log = mv.req.reqSource.rebucketed || (mv.req.reqSource.rebucketed = []);
            log.push({ from: mv.from, to: mv.to, at: when.toISOString(), by: who || null, sentence: sentence });
            try { if (typeof ReqHistory !== 'undefined' && ReqHistory.record) ReqHistory.record(mv.req, 'rebucket', preSnap, { note: sentence }); } catch(_) {}
            n++;
        });
        return n;
    }

    // ---------------------------------------------------------------------
    // Phase 55.0.8 — Customizable AutoReq templates.
    // Orgs that have an existing requirements-writing standard (e.g., "[REQ-...]"
    // prefix, "must" instead of "shall", different phrasings, internal IDs at the
    // front) can override the auto-generated text per generator. Templates use
    // ${var} substitution, with `${a|b|c}` falling back through alternatives.
    //
    // Variables available:
    //   ${text}, ${rat}                       — the default-generated text / rationale
    //   ${level}, ${type}, ${traceId}         — the requirement's top-level fields
    //   ${context.<key>}                      — anything in reqSource.context
    //                                           (e.g., context.dal, context.severity,
    //                                            context.fcId, context.threat)
    //   ${generator}                          — generator name (fha-prob, dalgebra, etc.)
    //
    // Storage:
    //   window.autoReqTemplateOverrides = {
    //     'fha-prob': { text: '[SR-${context.fcId}] ${text}', rat: '...' },
    //     'dalgebra': { text: '...', rat: '...' },
    //     ...
    //   }
    // Empty / missing entries fall through to the default text. Save+load
    // round-trips automatically because the overrides live on the project.
    // ---------------------------------------------------------------------
    function _arSubstitute(tmpl, vars) {
        if (typeof tmpl !== 'string' || !tmpl) return '';
        return tmpl.replace(/\$\{([^}]+)\}/g, (m, expr) => {
            const alts = expr.split('|').map(s => s.trim());
            for (const path of alts) {
                let cur = vars;
                const segments = path.split('.');
                let ok = true;
                for (const seg of segments) {
                    if (cur == null || typeof cur !== 'object') { ok = false; break; }
                    cur = cur[seg];
                }
                if (ok && cur != null && String(cur) !== '') return String(cur);
            }
            return '';
        });
    }

    function _applyTemplateOverride(req) {
        if (!req || !req.reqSource) return req;
        const overrides = (typeof window !== 'undefined' && window.autoReqTemplateOverrides) || {};
        const gen = req.reqSource.generator;
        const tmpl = overrides[gen];
        if (!tmpl || (!tmpl.text && !tmpl.rat)) return req;
        const vars = {
            text:      req.text,
            rat:       req.rat,
            level:     req.level,
            type:      req.type,
            traceId:   req.traceId,
            generator: gen,
            context:   (req.reqSource.context || {})
        };
        // Treat reqSource.context fields as top-level too so users can write
        // ${dal} instead of ${context.dal} for convenience.
        const ctx = req.reqSource.context || {};
        Object.keys(ctx).forEach(k => { if (vars[k] === undefined) vars[k] = ctx[k]; });
        try {
            if (tmpl.text) req.text = _arSubstitute(tmpl.text, vars);
            if (tmpl.rat)  req.rat  = _arSubstitute(tmpl.rat,  vars);
        } catch (e) {
            console.warn('[AutoReq] template substitution failed for', gen, e);
        }
        return req;
    }

    // Default templates — captured here so the settings UI can show "reset to default".
    // The strings are the ones the in-code generators emit; if a user clears their
    // override the system reverts to the in-code text (templates are post-processing).
    const DEFAULT_AR_TEMPLATES = {
        'fha-prob':       { text: '${text}', rat: '${rat}' },
        'fha-qualitative':{ text: '${text}', rat: '${rat}' },
        'fha-similarity': { text: '${text}', rat: '${rat}' },
        'fha-dal':        { text: '${text}', rat: '${rat}' },
        'fta-event':      { text: '${text}', rat: '${rat}' },
        'fta-interval':   { text: '${text}', rat: '${rat}' },
        'dalgebra':       { text: '${text}', rat: '${rat}' },
        'gate-indep-and': { text: '${text}', rat: '${rat}' },
        'gate-indep-dev': { text: '${text}', rat: '${rat}' },
        'gate-indep-phys':{ text: '${text}', rat: '${rat}' },
        'gate-indep-ccf-lib':   { text: '${text}', rat: '${rat}' },
        'gate-indep-ccf-group': { text: '${text}', rat: '${rat}' },
        'gate-indep-cma': { text: '${text}', rat: '${rat}' },
        'gate-indep-or':  { text: '${text}', rat: '${rat}' },
        'pra-zonal':      { text: '${text}', rat: '${rat}' },
        'pra-scenario':   { text: '${text}', rat: '${rat}' },
        'zsa-separation': { text: '${text}', rat: '${rat}' },
        'zsa-phys':       { text: '${text}', rat: '${rat}' },
        'fcim-monitor':   { text: '${text}', rat: '${rat}' }
    };

    // Diff a previous req against the live generated candidate to figure out what changed.
    function describeDiff(prev, next){
        const changes = [];
        if(prev.text !== next.text) changes.push({ field: 'text', from: prev.text, to: next.text });
        if(prev.level !== next.level) changes.push({ field: 'level', from: prev.level, to: next.level });
        if(prev.type !== next.type) changes.push({ field: 'type', from: prev.type, to: next.type });
        if(prev.rat !== next.rat) changes.push({ field: 'rat', from: prev.rat, to: next.rat });
        // Context diff for human-readable summary.
        const a = prev.reqSource && prev.reqSource.context || {};
        const b = next.reqSource && next.reqSource.context || {};
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        keys.forEach(k => { if(JSON.stringify(a[k]) !== JSON.stringify(b[k])) changes.push({ field: `context.${k}`, from: a[k], to: b[k] }); });
        return changes;
    }

    // ----- Generator 9: FCIM aware/unaware pair -> crew-awareness monitoring requirement -----
    //
    // Decided 2 Aug 2026 (Waqas). The recorded awareness doctrine: when awareness
    // affects severity, the sub-function carries an Aware and an Unaware row,
    // paired (pairId, set in the FCIM_COMBINED desk), and the engineer records
    // which risk governs. Choosing 'aware' takes credit for crew awareness — a
    // credit that exists only if the crew is actually made aware. This generator
    // emits the annunciation/monitoring requirement that credit owes. 'unaware'
    // governing (no credit taken) or an undecided pair emits NOTHING; a
    // standalone Unaware row is legitimate and emits nothing (Waqas's ruling).
    // AC scope only for now — the pairing desk writes acFcimData; extend with
    // the system desk when it exists. Per ARP4761A §A.3 awareness distinction
    // and the §xx.1309 warning-information expectation.
    function genFcimMonitoring(scopeKey){
        if (scopeKey !== 'ac') return [];
        const out = [];
        const rows = (typeof acFcimData !== 'undefined' ? acFcimData : []) || [];
        const seen = new Set();
        rows.forEach(r => {
            if (!r || !r.pairId || r.pairGoverns !== 'aware' || seen.has(r.pairId)) return;
            const partner = rows.find(x => x && x !== r && x.pairId === r.pairId);
            if (!partner) return;   // half a pair is a standalone row — legitimate, nothing owed
            seen.add(r.pairId);
            const unaware = (r.awareness === 'Unaware') ? r : (partner.awareness === 'Unaware' ? partner : null);
            if (!unaware) return;   // no unaware half — nothing to annunciate
            const fcIds = [unaware.tlId, unaware.plId, unaware.mId].filter(Boolean);
            if (!fcIds.length) return;
            const subId = unaware.subId || r.subId || '';
            out.push({
                text: `Failure conditions ${fcIds.join(', ')} of ${subId} shall be annunciated to the flight crew.`,
                rat: `Derived from FCIM aware/unaware pair ${r.pairId} on ${subId}: the AWARE (lower-risk) classification was chosen to govern, which takes credit for crew awareness. The credit holds only if the crew is made aware, so annunciation of the otherwise-unaware condition(s) is required. Per ARP4761A §A.3 crew-awareness distinction and the §xx.1309 warning-information expectation. Unpairing the rows or choosing the unaware risk to govern withdraws this requirement on the next generate.`,
                level: 'L1', type: 'Safety', analysis: 'Human Factors',
                verifMethod: 'Test',
                traceId: subId,
                reqSource: {
                    generator: 'fcim-monitor',
                    sourceId: `${scopeKey}:fcim-monitor:${r.pairId}`,
                    context: { pairId: r.pairId, subId, fcIds, governs: r.pairGoverns },
                    fingerprint: fp('fcim-monitor', 'v1', r.pairId, subId, fcIds, r.pairGoverns),
                    generatedAt: Date.now()
                }
            });
        });
        return out;
    }

    // ----- Public API -----
    // generate({ fha, ftaEvent, dalgebra, gateIndependence }, scope) → preview merge
    function generate(opts, scope){
        scope = scope || 'ac';
        opts = opts || { fha:true, ftaEvent:true, dalgebra:true, gateIndependence:true, praZonal:true, zsaSeparation:true, hfOperational:true, iface:true, fcimMonitor:true };

        const candidates = [];
        if(opts.fha) candidates.push(...genFHA(fhaArrForScope(scope), scope));
        if(opts.ftaEvent) candidates.push(...genFTAEvents(scope));
        if(opts.dalgebra) candidates.push(...genDALgebra(scope));
        if(opts.gateIndependence) candidates.push(...genGateIndependence(scope));
        if(opts.praZonal) candidates.push(...genPRA(scope));
        if(opts.zsaSeparation) candidates.push(...genZSA(scope));
        if(opts.hfOperational) candidates.push(...genHfOperational(scope));
        if(opts.iface) candidates.push(...genInterface(scope));
        if(opts.fcimMonitor) candidates.push(...genFcimMonitoring(scope));

        // Phase 55.0.8 — apply per-org template overrides to every candidate.
        // The override gets a snapshot of the default text+rat as ${text}/${rat}
        // so most customizations only need to wrap or prefix, not re-derive.
        candidates.forEach(_applyTemplateOverride);

        const store = storeForScope(scope) || [];
        const existing = new Map();
        store.forEach(r => { if(r.reqSource && r.reqSource.sourceId) existing.set(r.reqSource.sourceId, r); });

        // Phase 66.36 (A4) — a row whose node has been re-declared to another system is
        // NOT new here and NOT an orphan there; it is a pending move awaiting the
        // analyst's decision. Without this the preview would report the same requirement
        // twice — once as a fresh row in the new bucket, once as an orphan in the old —
        // and accepting both would destroy the verification status on the original.
        const migration = planBucketMigration();
        const pendingIntoThisScope = new Set();
        const pendingOutOfThisScope = new Set();
        migration.moves.forEach(mv => {
            if(mv.to === scope) pendingIntoThisScope.add(String(mv.lid));
            if(mv.from === scope) pendingOutOfThisScope.add(mv.req);
        });

        const isNew = [], isUpdated = [], unchanged = [];
        candidates.forEach(cand => {
            const prev = existing.get(cand.reqSource.sourceId);
            if(!prev){
                const parsed = _parseFtaSourceId(cand.reqSource.sourceId);
                if(parsed && pendingIntoThisScope.has(String(parsed.lid))) return;   // arrives by migration, not by creation
                isNew.push(cand);
            }
            else if(prev.reqSource.fingerprint !== cand.reqSource.fingerprint) isUpdated.push({ prev, next: cand, diff: describeDiff(prev, cand) });
            else unchanged.push({ prev, next: cand });
        });

        // Orphaned auto-reqs whose source disappeared (only check within requested generator scope).
        const candIds = new Set(candidates.map(c => c.reqSource.sourceId));
        const orphaned = [];
        store.forEach(r => {
            if(!r.reqSource) return;
            const g = r.reqSource.generator || '';
            const inScope = (
                (g.startsWith('fha') && opts.fha) ||
                ((g === 'fta-event' || g === 'fta-interval' || g === 'fta-resource' || g === 'fta-resource-iface') && opts.ftaEvent) ||
                (g.startsWith('dalgebra') && opts.dalgebra) ||
                (g.startsWith('gate-indep') && opts.gateIndependence) ||
                ((g === 'pra-zonal' || g === 'pra-scenario') && opts.praZonal) ||
                (g.startsWith('zsa') && opts.zsaSeparation) ||
                (g.startsWith('hf-op') && opts.hfOperational) ||
                (g.startsWith('iface') && opts.iface) ||
                (g === 'fcim-monitor' && opts.fcimMonitor)
            );
            // Pending a move out of this bucket — its source still exists, it just belongs
            // to someone else now. Reporting it as an orphan would invite the analyst to
            // delete a live requirement.
            if(pendingOutOfThisScope.has(r)) return;
            if(inScope && !candIds.has(r.reqSource.sourceId)) orphaned.push(r);
        });

        return { scope, isNew, isUpdated, unchanged, orphaned,
                 migrations: migration.moves, migrationUnresolved: migration.unresolved };
    }

    // Apply a merge to the store. Choices control what gets written.
    function applyMerge(merge, choices){
        choices = choices || { acceptNew:true, acceptUpdates:true, acceptOrphanRemoval:false };
        const store = storeForScope(merge.scope);
        if(!store) return 0;
        let n = 0;
        if(choices.acceptNew){
            merge.isNew.forEach(cand => {
                cand.internalId = newRowId();
                // Phase 53.63 — assign a default derivationType from the generator if absent.
                // FHA-driven candidates are top-level safety reqs (the FHA IS the top hazard
                // analysis). FTA event, DALgebra, gate-independence, PRA, ZSA are derived
                // during design analysis and need their own validation argument back to safety.
                if (!cand.derivationType && cand.reqSource && cand.reqSource.generator) {
                    const g = cand.reqSource.generator;
                    cand.derivationType = (g.indexOf('fha') === 0) ? 'top-level' : 'derived';
                }
                store.push(cand);
                // Phase 53.56 — log auto-creation in req history.
                try { if (typeof ReqHistory !== 'undefined') ReqHistory.record(cand, 'auto-create', null, { note: (cand.reqSource && cand.reqSource.generator) || '' }); } catch(_) {}
                n++;
            });
        }
        if(choices.acceptUpdates){
            merge.isUpdated.forEach(({ prev, next }) => {
                // Snapshot the prev state before mutating in place — history needs the diff.
                const preSnap = (typeof ReqHistory !== 'undefined') ? JSON.parse(JSON.stringify(prev)) : null;
                // Preserve user-overridden text if user manually edited the requirement statement.
                const keepText = prev.reqSource && prev.reqSource.userOverridden;
                prev.text = keepText ? prev.text : next.text;
                prev.rat = next.rat;
                prev.level = next.level;
                prev.type = next.type;
                prev.analysis = next.analysis;
                prev.traceId = next.traceId || prev.traceId;
                prev.compromised = !!next.compromised;
                prev.compromiseReasons = next.compromiseReasons || [];
                const prevSrc = prev.reqSource || {};
                prev.reqSource = Object.assign({}, next.reqSource, {
                    userOverridden: !!prevSrc.userOverridden,
                    stale: false
                });
                try { if (preSnap) ReqHistory.record(prev, 'auto-update', preSnap, { note: (prev.reqSource && prev.reqSource.generator) || '' }); } catch(_) {}
                n++;
            });
        }
        if(choices.acceptOrphanRemoval){
            const oids = new Set(merge.orphaned.map(o => o.internalId));
            // Phase 53.56 — soft-delete orphans instead of splicing them out, so the
            // audit trail survives and the user can restore from the Deleted filter.
            for(let i = 0; i < store.length; i++){
                if(oids.has(store[i].internalId) && !store[i].deleted){
                    try { if (typeof ReqHistory !== 'undefined') ReqHistory.softDelete(store[i]); } catch(_) { store[i].deleted = true; store[i].deletedAt = Date.now(); }
                    n++;
                }
            }
        }
        return n;
    }

    // Re-evaluate stale + compromised flags on existing auto-reqs without modifying their content.
    function recomputeFlags(scope){
        scope = scope || 'ac';
        const merge = generate({ fha:true, ftaEvent:true, dalgebra:true, gateIndependence:true, praZonal:true, zsaSeparation:true }, scope);
        const store = storeForScope(scope) || [];
        const liveById = new Map();
        merge.isNew.forEach(c => liveById.set(c.reqSource.sourceId, c));
        merge.isUpdated.forEach(u => liveById.set(u.next.reqSource.sourceId, u.next));
        merge.unchanged.forEach(u => liveById.set(u.next.reqSource.sourceId, u.next));
        store.forEach(r => {
            if(!r.reqSource) return;
            const live = liveById.get(r.reqSource.sourceId);
            if(live){
                r.reqSource.stale = (r.reqSource.fingerprint !== live.reqSource.fingerprint);
                r.reqSource.orphan = false;
                r.compromised = !!live.compromised;
                r.compromiseReasons = live.compromiseReasons || [];
            } else {
                r.reqSource.stale = false;
                r.reqSource.orphan = true;
            }
        });
    }

    // Look up the human-readable label for a generator key.
    const GEN_LABELS = {
        'fha-prob':         'FHA → Probabilistic',
        'fha-qualitative':  'FHA → Qualitative',
        'fha-similarity':   'FHA → Similarity argument',
        'fha-dal':          'FHA → DAL',
        'fta-event':        'FTA event → Reliability',
        'fta-interval':     'FTA event → Maintenance interval (CMR candidate)',
        'dalgebra':         'DALgebra → DAL allocation',
        'dalgebra-default': 'DALgebra → Default DAL',
        'gate-indep-and':   'Gate → Functional independence',
        'gate-indep-dev':   'Gate → Development independence (DAL reduction)',
        'gate-indep-phys':  'Gate → Physical separation (Cat top)',
        'gate-indep-ccf-lib':   'Gate → Dissimilarity (shared library entry)',
        'gate-indep-ccf-group': 'Gate → Common-cause control (CCF group)',
        'gate-indep-cma':   'CMA → Common-mode preclusion',
        'gate-indep-or':    'Gate → No-single-failure check',
        'pra-zonal':        'PRA → Zonal protection',
        'pra-scenario':     'PRA scenario → Traced protection requirement',
        'zsa-separation':   'ZSA → Housed-function separation',
        'zsa-phys':         'ZSA → Physical separation (Cat zone)',
        'fcim-monitor':     'FCIM pair → Crew-awareness monitoring (annunciation credit)'
    };

    // ========================================================================
    // Phase 11.2 — Detect duplicate AC↔Sys requirements and tag the less
    // conservative one as obsolete (does NOT delete; preserves audit trail).
    // Match rule: same FHA fcId OR explicit acTrace linkage; one in AC scope,
    // one in any Sys scope.  Conservativeness: lower prob target wins;
    // higher DAL rank (A=5 → E=1) wins.
    // ========================================================================
    const DAL_RANK_LOCAL = DAL_RANK_MAP;   // Phase 27 refactor B7 — alias to module-scope constant.
    function _conservativenessScore(req) {
        // Score per-req. Lower-target probabilistic reqs and higher-DAL design-assurance reqs are MORE conservative.
        if (!req || !req.reqSource) return null;
        const ctx = req.reqSource.context || {};
        const gen = req.reqSource.generator;
        if (gen === 'fha-prob') {
            // More conservative = lower prob target. Convert so larger score = more conservative.
            const p = ctx.prob;
            if (p == null || p <= 0) return 0;
            return -Math.log10(p);
        }
        if (gen === 'fha-dal') {
            return DAL_RANK_LOCAL[ctx.dal] || 0;
        }
        return null;   // other generators aren't part of this dedup pass
    }
    function _reqFcKey(req) {
        // Returns a key that identifies the underlying failure condition.
        // For AC reqs: the fcId of the linked FHA. For Sys reqs: the linked AC FC (via acTrace), or fcId itself.
        if (!req || !req.reqSource) return null;
        const ctx = req.reqSource.context || {};
        if (ctx.fcId) return ctx.fcId;
        if (req.reqSource.sourceId && req.reqSource.sourceId.indexOf('fha') >= 0) {
            // Try to recover by looking up the source FHA.
            const sourceId = req.reqSource.sourceId;
            const m = sourceId.match(/^(ac|sys-[^:]+):fha:(prob|dal(?::func)?):(.+)$/);
            if (m) {
                const scope = m[1];
                const ref = m[3];
                if (scope === 'ac') {
                    const f = (acFhaData || []).find(x => String(x.internalId) === String(ref));
                    return f ? f.fcId : null;
                } else {
                    const sys = systemsData.find(s => 'sys-' + s.id === scope);
                    if (!sys) return null;
                    const f = (sys.fha || []).find(x => String(x.internalId) === String(ref));
                    if (!f) return null;
                    // For sys-side, the FC is normalized to the linked AC FC if traced; otherwise the sys fcId.
                    return f.acTrace || f.fcId;
                }
            }
        }
        return null;
    }
    function _scopeOf(req) {
        if (!req || !req.reqSource) return null;
        const s = req.reqSource.sourceId || '';
        if (s.indexOf('ac:') === 0) return 'ac';
        const m = s.match(/^sys-([^:]+):/);
        return m ? ('sys-' + m[1]) : null;
    }

    // Find duplicates across all stores. Returns array of { winner, loser, kind, reason }.
    // winner = more conservative; loser = less conservative (gets obsolete-flagged).
    function findDuplicates() {
        const allReqs = [];
        (acReqData || []).forEach(r => allReqs.push(r));
        (systemsData || []).forEach(s => (s.req || []).forEach(r => allReqs.push(r)));

        // Group by (fc-key, generator-kind). Only the relevant generators ('fha-prob', 'fha-dal').
        const groups = new Map();
        allReqs.forEach(r => {
            if (!r.reqSource) return;
            const gen = r.reqSource.generator;
            if (gen !== 'fha-prob' && gen !== 'fha-dal') return;
            // Skip already-obsolete or archived reqs from the matching pool.
            if (r.reqSource.obsolete || r.status === 'archived') return;
            const key = _reqFcKey(r);
            if (!key) return;
            const groupKey = gen + '|' + key;
            if (!groups.has(groupKey)) groups.set(groupKey, []);
            groups.get(groupKey).push(r);
        });

        const pairs = [];
        groups.forEach((reqs, gk) => {
            if (reqs.length < 2) return;
            // Identify scopes — we need at least one AC and one Sys to count it as cross-scope duplicate.
            const acReqs = reqs.filter(r => _scopeOf(r) === 'ac');
            const sysReqs = reqs.filter(r => _scopeOf(r) && _scopeOf(r).indexOf('sys-') === 0);
            if (!acReqs.length || !sysReqs.length) return;
            // For each (ac, sys) pair in the group, pick conservativeness winner.
            acReqs.forEach(aReq => {
                sysReqs.forEach(sReq => {
                    const aScore = _conservativenessScore(aReq);
                    const sScore = _conservativenessScore(sReq);
                    if (aScore == null || sScore == null) return;
                    if (Math.abs(aScore - sScore) < 1e-9) return;   // truly equal — no action
                    const winner = aScore >= sScore ? aReq : sReq;
                    const loser  = aScore >= sScore ? sReq : aReq;
                    pairs.push({
                        winner, loser,
                        kind: aReq.reqSource.generator,   // 'fha-prob' or 'fha-dal'
                        reason: aReq.reqSource.generator === 'fha-prob'
                            ? 'Lower probability target is more conservative.'
                            : 'Higher DAL (A > B > C > D > E) is more conservative.'
                    });
                });
            });
        });
        return pairs;
    }

    // Tag the loser of each pair with reqSource.obsolete = { supersededBy, reason, taggedAt }.
    // Returns the count of newly-tagged reqs.
    function applyObsoleteTags(pairs) {
        let n = 0;
        (pairs || []).forEach(p => {
            if (!p.loser || !p.winner) return;
            if (!p.loser.reqSource) return;
            // Skip if already tagged with same supersedingId.
            if (p.loser.reqSource.obsolete && p.loser.reqSource.obsolete.supersededBy === p.winner.internalId) return;
            p.loser.reqSource.obsolete = {
                supersededBy: p.winner.internalId,
                supersededByRef: (p.winner.reqSource && p.winner.reqSource.sourceId) || ('REQ-' + p.winner.internalId),
                reason: p.reason,
                taggedAt: Date.now()
            };
            n++;
        });
        return n;
    }

    // ------------------------------------------------------------- INV-46
    // CCMR pair-trace conflict (Waqas's rulings: 3 Aug — τ > NTE is a
    // trace-level conflict between the maintainability row and the governing
    // probabilistic safety row, never a rewrite of either number; 4 Aug —
    // gating severity ADVISORY). Reads the same latent sweep the CCMR page
    // renders, so the two surfaces cannot disagree; checked = rows with a
    // computed bound, fails = exceedances, each naming BOTH sides of the pair
    // and whether each is in the register or still preview-only.
    // assurance_modules loads BEFORE invariants.js (index ~3949 vs ~4048), so
    // registration retries — same net as INV-45 in fcim_combined.
    if (typeof window !== 'undefined') {
        (function regInv46(tries) {
            if (typeof window.invRegister === 'function') {
                window.invRegister({
                    id: 'INV-46', sev: 'advisory',
                    name: 'Authored maintenance intervals within their CCMR not-to-exceed bounds (τ ≤ NTE — pair-trace conflict)',
                    run: function () {
                        var rows = [];
                        try { rows = (typeof ccmrLatentSweep === 'function') ? (ccmrLatentSweep() || []) : []; } catch (_) { rows = []; }
                        var bounded = rows.filter(function (r) { return r && r.nte != null && isFinite(r.nte) && r.nte < 1e6; });
                        var fails = [];
                        bounded.forEach(function (r) {
                            if (!r.exceeds) return;
                            var allocPageId = r.verifies || r.pageId;
                            var page = null;
                            try { page = (ftaPages || []).find(function (p) { return p && p.id === allocPageId; }) || null; } catch (_) {}
                            var gov = page ? _governingFhaForPage(page) : null;
                            var govIn = gov ? _govSafetyAccepted(gov) : false;
                            var mnt = null;
                            if (r.lid != null) {
                                try {
                                    var scopes = ['ac'].concat(((typeof systemsData !== 'undefined' ? systemsData : []) || []).map(function (s) { return 'sys-' + s.id; }));
                                    for (var i = 0; i < scopes.length && !mnt; i++) {
                                        var st = storeForScope(scopes[i]) || [];
                                        mnt = st.find(function (q) { return q && !q.deleted && q.reqSource && q.reqSource.sourceId === scopes[i] + ':fta-interval:' + r.lid; }) || null;
                                    }
                                } catch (_) {}
                            }
                            fails.push(
                                r.system + ' FTA ' + r.event + ' [' + r.severity + (r.fcId ? ', ' + r.fcId : '') + ']: authored ' + r.detection +
                                ' interval ' + r.interval + ' h exceeds the CCMR not-to-exceed bound ' + (+r.nte).toPrecision(3) + ' h — pair state: maintainability requirement ' +
                                (mnt ? mnt.reqSource.sourceId + ' in the register' : 'not yet in the register (run AutoReq → FTA events)') +
                                '; governing safety requirement ' +
                                (gov ? (govIn ? gov.sourceId + ' in the register' : 'derived only — fha-prob preview (' + gov.sourceId + ')') : 'unresolved (no linked FHA row)') +
                                '. Reconcile the interval or the design on the CCMR page — never rewrite the safety target.'
                            );
                        });
                        return { checked: bounded.length, fails: fails };
                    }
                });
                return;
            }
            if (tries > 0) setTimeout(function () { regInv46(tries - 1); }, 300);
        })(25);
    }

    // ---------------------------------------------------------------------
    // Phase 66.38 — A1. UNOWNED IS A FINDING, NOT A FALLBACK BUCKET (U-4).
    //
    // unownedPages() has been computed and exported since 66.27 and reported to
    // NOBODY — reachable from the console and nowhere else, which is the same as
    // not existing. This registers it as a cross-artifact invariant, so it renders
    // in the integrity panel with everything else and is stamped into the evidence
    // package. No new UI, no new data model: the finding already existed, it just
    // had no way of reaching a person.
    //
    // WHY 'hard'. A page whose systemId does not resolve still generates
    // requirements — they file into the AIRCRAFT bucket by fallback, silently, and
    // that fallback is deliberate (a strict rule would make requirements stop being
    // generated, which is worse). The consequence is a real mis-filing with no
    // outward sign, which is the same class as INV-44's unresolved transfer
    // silently zeroing a branch. Detection has to be loud precisely because the
    // handling is forgiving.
    //
    // WHAT THIS DELIBERATELY DOES NOT REPORT — and it is the whole scoping
    // decision. Since A2, a NODE can also fall back: no declared identity means
    // resolveOwner returns UNOWNED and the node inherits its page's bucket. Every
    // node on every existing project is in that state today (measured on Aeolus
    // HL-1: 0 of 182 carry node.identity), so an invariant that flagged it would
    // report ~51 failures on a healthy project on day one and train everyone to
    // ignore the panel. That is the cry-wolf failure the MAC guard exists to
    // prevent and the reason C4 is parked. An undeclared node is a MIGRATION state,
    // not a defect. A dangling systemId is a defect.
    // ---------------------------------------------------------------------
    if (typeof window !== 'undefined') {
        (function regInv49(tries) {
            if (typeof window.invRegister === 'function') {
                window.invRegister({
                    id: 'INV-49', sev: 'hard',
                    name: 'Every allocation fault-tree page resolves to an owner (an unresolved page files its requirements into the aircraft bucket silently)',
                    run: function () {
                        var checked = 0, fails = [];
                        try {
                            checked = ((typeof ftaPages !== 'undefined' ? ftaPages : []) || [])
                                .filter(function (p) { return p && !p.verifies; }).length;
                            (unownedPages() || []).forEach(function (u) {
                                fails.push('"' + (u.name || 'Untitled') + '" (' + (u.treeLevel || 'standalone') +
                                           ') — ' + u.reason + '; its requirements are filing into the aircraft bucket');
                            });
                        } catch (_) {}
                        return { checked: checked, fails: fails };
                    }
                });
                return;
            }
            if (tries > 0) setTimeout(function () { regInv49(tries - 1); }, 300);
        })(25);
    }

    return { generate, applyMerge, recomputeFlags, describeDiff, GEN_LABELS, findDuplicates, applyObsoleteTags,
             decideAnalysisDepth, certBasisForChart,
             // Phase 55.0.8 — template overrides API
             DEFAULT_AR_TEMPLATES,
             applyTemplateOverride: _applyTemplateOverride,
             substituteTemplate: _arSubstitute,
             // Phase 66.27 — bucket attribution, exposed so the UI can flag unowned pages
             // and so the wall can assert the scoping rule directly.
             pageScopeKey: _pageScopeKey, pageInScope, walkPagesInScope, unownedPages,
             // Phase 66.36 — A2 / A4.
             nodeScopeKey: _nodeScopeKey, walkNodesInScope, ownerCtx: _ownerCtx,
             planBucketMigration, applyBucketMigration, bucketLabel: _bucketLabel };
})();

const Traceability = (function(){

    // Map of kind → human-readable label (for panel headings + palette).
    const KIND_LABELS = {
        acFunc: 'AC Function', sysFunc: 'System Function',
        acFcim: 'AC FCIM',     sysFcim: 'System FCIM',
        acFha:  'AC FHA',      sysFha:  'System FHA',
        acReq:  'AC Requirement', sysReq: 'System Requirement',
        acAsm:  'AC Assumption',  sysAsm:  'System Assumption',
        ftaPage:'Fault Tree Page', ftaNode: 'FTA Node',
        pra:    'PRA',         zsa:     'ZSA',
        cma:    'CMA',         fmea:    'FMEA',
        library:'Library Entry',
        item:   'Item / LRU',     // Phase 53.61
        // HF lanes — 2 Sep 2026. Registered so the Traces panel opens with the lane's real
        // name instead of a raw kind string. The REFERRER RESOLVER for these is not written
        // yet: getReferrers has no hf* case, so the panel opens honestly empty rather than
        // pretending. The joins that will fill it (an FHA row crediting an HF assumption, a
        // task promoted into the register, an alert cited by a failure condition) are real
        // and already in the data — they are the next piece, not a missing one here.
        hfAlloc: 'HF Function Allocation', hfTid: 'HF Task Identification',
        hfTask:  'HF Task Analysis',       hfHea: 'HF Human Error Analysis',
        hfAlerts:'HF Crew Alerting',       hfErgo: 'HF Ergonomics',
        hfCd:    'HF Controls & Displays', hfSa:  'HF Situation Awareness',
        hfMfc:   'HF Minimum Flight Crew'
    };

    // Map of kind → tab id (used by the navigation jumper).
    const KIND_TAB = {
        acFunc: 'ac-func', sysFunc: 'sys-workspace',
        acFcim: 'ac-fcim', sysFcim: 'sys-workspace',
        acFha:  'ac-fha',  sysFha:  'sys-workspace',
        acReq:  'ac-req',  sysReq:  'sys-workspace',
        acAsm:  'ac-asm',  sysAsm:  'sys-workspace',
        ftaPage:'fta', ftaNode: 'fta',
        pra:'pra', zsa:'zsa', cma:'cma', fmea:'fmea',
        library:'library',
        item:   'items',          // Phase 53.61
        hfAlloc:'hfa-alloc', hfTid:'hfa-tid', hfTask:'hfa-task', hfHea:'hfa-hea',
        hfAlerts:'hfa-alerts', hfErgo:'hfa-ergo', hfCd:'hfa-cd', hfSa:'hfa-sa', hfMfc:'hfa-mfc'
    };

    // Tiny helper: shorten long labels for chip display.
    function trim(s, n){ s = String(s == null ? '' : s); n = n || 90; return s.length > n ? s.slice(0, n - 1) + '…' : s; }

    // Build a descriptor for a referrer artifact, suitable for jump-on-click.
    function descriptor(kind, id, label, opts){
        opts = opts || {};
        return {
            kind,
            id,
            label: String(label || ''),
            detail: opts.detail || '',
            tab: KIND_TAB[kind] || 'dashboard',
            systemId: opts.systemId || null,
            // For sys-* artifacts: the sub-workspace tab inside the system (sys-func, sys-fha, etc.)
            sysSubtab: opts.sysSubtab || null
        };
    }

    // ------------------------------------------------------------------
    //  getReferrers(target) — every artifact that references `target`.
    //  target shape:
    //    { kind: 'acFha',     id: 123 }                    (internalId)
    //    { kind: 'acFunc',    subId: 'F-1' }
    //    { kind: 'acReq',     id: 123 }
    //    { kind: 'sysFha',    id: 123, systemId: 'sys-1' }
    //    { kind: 'ftaPage',   id: pageId }
    //    { kind: 'ftaNode',   id: nodeId, pageId, logicalId? }
    //    { kind: 'pra'|'zsa'|'cma'|'fmea', id: internalId }
    //    { kind: 'acAsm',     id: internalId }
    // ------------------------------------------------------------------
    function getReferrers(target){
        if (!target || !target.kind) return [];
        const out = [];

        // Helper: walk every fault-tree node, invoking cb(node, page).
        const walkAllTreeNodes = (cb) => {
            (ftaPages || []).forEach(page => {
                (function walk(n){
                    if (!n) return;
                    cb(n, page);
                    const kids = n.children || n._children;
                    if (kids) kids.forEach(walk);
                })(page.root);
            });
        };

        // Helper: every requirement (with origin scope) flat-mapped.
        const allReqsWithScope = () => {
            const r = (acReqData || []).map(x => ({ req: x, scope: 'ac', systemId: null }));
            (systemsData || []).forEach(s => (s.req || []).forEach(req => r.push({ req, scope: 'sys-' + s.id, systemId: s.id })));
            return r;
        };

        // Helper: every FHA with its scope.
        const allFhaWithScope = () => {
            const r = (acFhaData || []).map(x => ({ fha: x, scope: 'ac', systemId: null }));
            (systemsData || []).forEach(s => (s.fha || []).forEach(fha => r.push({ fha, scope: 'sys-' + s.id, systemId: s.id })));
            return r;
        };

        switch (target.kind) {

        case 'acFunc': {
            const subId = target.subId;
            if (!subId) return [];
            // System functions that trace to this AC function via their traceIds array (1-to-many).
            (systemsData || []).forEach(s => {
                (s.functions || []).forEach(f => {
                    const traces = Array.isArray(f.traceIds) ? f.traceIds : (f.traceId ? [f.traceId] : []);
                    if (traces.includes(subId)) {
                        out.push(descriptor('sysFunc', f.funcId || f.internalId, '[' + (s.name || s.id) + '] ' + (f.funcId || '') + ' · ' + trim(f.funcName), { systemId: s.id, sysSubtab: 'sys-func', detail: 'System function tracing to this AC function' }));
                    }
                });
            });
            // AC FHAs trace via .subIds[] (legacy .subId still honored) — Phase 28 item 3.
            (acFhaData || []).forEach(f => {
                const ids = (Array.isArray(f.subIds) && f.subIds.length) ? f.subIds : (f.subId ? [f.subId] : []);
                if (ids.includes(subId)) out.push(descriptor('acFha', f.internalId, (f.fcId || '') + ': ' + trim(f.fcDesc), { detail: 'Linked function' }));
            });
            // Sys FHAs trace via .subIds[] too — but only the ones in the systems whose acTrace matches.
            (systemsData || []).forEach(s => {
                (s.fha || []).forEach(f => {
                    const ids = (Array.isArray(f.subIds) && f.subIds.length) ? f.subIds : (f.subId ? [f.subId] : []);
                    // Sys FHAs reference SYSTEM functions (which trace to AC functions via traceIds).
                    // Only surface them here if the sys function they reference happens to trace back
                    // to this AC function. (Most queries against AC functions stay on the AC side.)
                    if (!ids.length) return;
                    const sysFuncs = (s.functions || []);
                    const hits = ids.filter(sfid => sysFuncs.some(sf => sf.funcId === sfid && (Array.isArray(sf.traceIds) ? sf.traceIds : [sf.traceId]).includes(subId)));
                    if (hits.length) out.push(descriptor('sysFha', f.internalId, '[' + (s.name || s.id) + '] ' + (f.fcId || '') + ': ' + trim(f.fcDesc), { systemId: s.id, sysSubtab: 'sys-fha', detail: 'Sys FHA on function tracing here' }));
                });
            });
            // Assumptions that link to this function directly (Phase 28 item 8).
            (acAssumptionsData || []).forEach(a => {
                if (Array.isArray(a.linkedFunctions) && a.linkedFunctions.includes(subId)) {
                    out.push(descriptor('acAsm', a.internalId, (a.asmId || '#' + a.internalId) + ' · ' + trim(a.text || a.statement), { detail: 'Linked function (assumption)' }));
                }
            });
            // AC FCIM rows reference via .subFunc
            (acFcimData || []).forEach(c => {
                // FCIM rows store the sub-function under .subId, and the failure-condition
                // descriptors under tl/pl/m id+desc — not fcId/fcDesc (Phase 27 audit A11).
                if (c.subId === subId) {
                    const labelId = c.tlId || c.plId || c.mId || '#' + c.internalId;
                    const labelDesc = c.tlDesc || c.plDesc || c.mDesc || '';
                    out.push(descriptor('acFcim', c.internalId, labelId + ': ' + trim(labelDesc)));
                }
            });
            // AC Requirements that trace to this function
            (acReqData || []).forEach(r => {
                // Phase 28 — reqs carry traceIds[] (legacy traceId still honored).
                const traceList = (Array.isArray(r.traceIds) && r.traceIds.length) ? r.traceIds : (r.traceId ? [r.traceId] : []);
                if (r.traceTo === subId || traceList.includes(subId)) out.push(descriptor('acReq', r.internalId, trim(r.text)));
                else if (r.reqSource && r.reqSource.context && r.reqSource.context.subId === subId) out.push(descriptor('acReq', r.internalId, trim(r.text), { detail: 'Auto-generated' }));
            });
            // FMEA functional rows linking to this sub-function
            (fmeaData || []).forEach(m => {
                if (m.fmeaType === 'functional' && m.funcSubId === subId) out.push(descriptor('fmea', m.internalId, m.fmeaId + ' · ' + trim(m.localEffect)));
            });
            // ZSAs that house this function
            (zsaData || []).forEach(z => {
                if ((z.housedFunctions || []).includes(subId)) out.push(descriptor('zsa', z.internalId, z.zoneId + ' · ' + trim(z.desc), { detail: 'Houses this function' }));
            });
            // PRAs that expose this function (via zone join)
            (praData || []).forEach(p => {
                const exposed = new Set();
                (p.affectedZones || []).forEach(zid => {
                    const z = (zsaData || []).find(zz => zz.zoneId === zid);
                    if (z) (z.housedFunctions || []).forEach(s => exposed.add(s));
                });
                if (exposed.has(subId)) out.push(descriptor('pra', p.internalId, p.praId + ' · ' + trim(p.threat), { detail: 'Exposes this function via zone' }));
            });
            break;
        }

        case 'acFha': {
            // Find by internalId or fcId
            const fha = (acFhaData || []).find(f => String(f.internalId) === String(target.id) || f.fcId === target.id);
            if (!fha) return [];
            const fcId = fha.fcId;
            // Sys FHAs that trace up to this AC FC via acTraces[] (legacy acTrace still honored) — Phase 28 item 1.
            (systemsData || []).forEach(s => (s.fha || []).forEach(sf => {
                const traces = (Array.isArray(sf.acTraces) && sf.acTraces.length) ? sf.acTraces : (sf.acTrace ? [sf.acTrace] : []);
                if (traces.includes(fcId)) out.push(descriptor('sysFha', sf.internalId, sf.fcId + ': ' + trim(sf.fcDesc), { systemId: s.id, sysSubtab: 'sys-fha', detail: 'Traces to this AC FC' }));
            }));
            // FTA pages linked to this hazard
            (ftaPages || []).forEach(page => {
                // Phase 28 item 4 — pages may carry linkedFhaIds[] (legacy linkedFhaId fallback).
                const pageLinks = (Array.isArray(page.linkedFhaIds) && page.linkedFhaIds.length) ? page.linkedFhaIds : (page.linkedFhaId ? [page.linkedFhaId] : []);
                if (pageLinks.includes(fha.internalId)) out.push(descriptor('ftaPage', page.id, trim(page.name), { detail: 'Linked hazard' }));
            });
            // Generated requirements referencing this FHA (AC + Sys)
            allReqsWithScope().forEach(({ req, scope, systemId }) => {
                if (!req.reqSource) return;
                const sid = req.reqSource.sourceId || '';
                const ctx = req.reqSource.context || {};
                if (sid.includes(':fha:') && (ctx.fcId === fcId || sid.includes(':' + fha.internalId))) {
                    const kind = scope === 'ac' ? 'acReq' : 'sysReq';
                    out.push(descriptor(kind, req.internalId, trim(req.text), { systemId, sysSubtab: scope === 'ac' ? null : 'sys-req' }));
                }
            });
            // Assumptions linked to this FHA
            (acAssumptionsData || []).forEach(a => {
                if ((a.linkedFHAs || []).includes(fha.internalId) || (a.linkedFHAs || []).includes(fcId)) {
                    out.push(descriptor('acAsm', a.internalId, (a.asmId || '') + ' · ' + trim(a.statement), { detail: 'Linked assumption' }));
                }
            });
            // Functional FMEA rows linked to this failure condition (#3).
            (fmeaData || []).forEach(m => {
                if (m.fmeaType === 'functional' && String(m.linkedFcId) === String(fha.internalId)) {
                    out.push(descriptor('fmea', m.internalId, (m.fmeaId || '') + ' · ' + trim(m.localEffect), { detail: 'Functional FMEA → this FC' }));
                }
            });
            break;
        }

        case 'sysFunc': {
            const sys = (systemsData || []).find(s => s.id === target.systemId);
            if (!sys) return [];
            const f = (sys.functions || []).find(x => x.funcId === target.id || String(x.internalId) === String(target.id));
            if (!f) return [];
            // AC functions this system function traces to (1-to-many).
            const traces = Array.isArray(f.traceIds) ? f.traceIds : (f.traceId ? [f.traceId] : []);
            traces.forEach(acId => {
                const ac = (acFunctionsData || []).find(x => x.funcId === acId);
                if (ac) {
                    out.push(descriptor('acFunc', ac.subId || ac.funcId, (ac.funcId || '') + ' · ' + trim(ac.funcName), { detail: 'Parent AC function (traced)' }));
                } else {
                    out.push(descriptor('acFunc', acId, acId + ' (orphan trace)', { detail: 'Trace target no longer exists in AC Functions' }));
                }
            });
            // Sys FHAs whose subId points at this function (subId stores funcId post-Phase 24).
            (sys.fha || []).forEach(fh => {
                if (fh.subId === f.funcId) out.push(descriptor('sysFha', fh.internalId, (fh.fcId || '') + ': ' + trim(fh.fcDesc), { systemId: sys.id, sysSubtab: 'sys-fha', detail: 'Linked function' }));
            });
            // Sys FCIM rows likewise.
            (sys.fcim || []).forEach(c => {
                if (c.subId === f.funcId) out.push(descriptor('sysFcim', c.internalId, (c.tlId || c.plId || c.mId || '') + ' · ' + trim(c.tlDesc || c.plDesc || c.mDesc), { systemId: sys.id, sysSubtab: 'sys-fcim' }));
            });
            // Sys requirements that trace to this function.
            (sys.req || []).forEach(r => {
                const traceList = (Array.isArray(r.traceIds) && r.traceIds.length) ? r.traceIds : (r.traceId ? [r.traceId] : []);
                if (r.traceTo === f.funcId || traceList.includes(f.funcId)) {
                    out.push(descriptor('sysReq', r.internalId, trim(r.text), { systemId: sys.id, sysSubtab: 'sys-req' }));
                }
            });
            break;
        }

        case 'sysFha': {
            const sys = (systemsData || []).find(s => s.id === target.systemId);
            if (!sys) return [];
            const fha = (sys.fha || []).find(f => String(f.internalId) === String(target.id) || f.fcId === target.id);
            if (!fha) return [];
            // AC FHAs this sys FHA traces to (acTraces[] with legacy acTrace fallback) — Phase 28 item 1.
            const traces = (Array.isArray(fha.acTraces) && fha.acTraces.length) ? fha.acTraces : (fha.acTrace ? [fha.acTrace] : []);
            traces.forEach(fcId => {
                const acFha = (acFhaData || []).find(a => a.fcId === fcId);
                if (acFha) out.push(descriptor('acFha', acFha.internalId, acFha.fcId + ': ' + trim(acFha.fcDesc), { detail: 'Parent AC FC' }));
                else out.push(descriptor('acFha', fcId, fcId + ' (orphan trace)', { detail: 'AC trace target no longer exists' }));
            });
            // FTA pages linked to this hazard
            (ftaPages || []).forEach(page => {
                const pageLinks = (Array.isArray(page.linkedFhaIds) && page.linkedFhaIds.length) ? page.linkedFhaIds : (page.linkedFhaId ? [page.linkedFhaId] : []);
                if (pageLinks.includes(fha.internalId)) out.push(descriptor('ftaPage', page.id, trim(page.name)));
            });
            // Sys requirements derived from this FHA
            (sys.req || []).forEach(r => {
                if (!r.reqSource) return;
                const sid = r.reqSource.sourceId || '';
                if (sid.includes(':fha:') && (sid.includes(':' + fha.internalId) || (r.reqSource.context && r.reqSource.context.fcId === fha.fcId))) {
                    out.push(descriptor('sysReq', r.internalId, trim(r.text), { systemId: sys.id, sysSubtab: 'sys-req' }));
                }
            });
            // Sys assumptions linked to this FHA
            (sys.asm || []).forEach(a => {
                if ((a.linkedFHAs || []).includes(fha.internalId)) out.push(descriptor('sysAsm', a.internalId, a.asmId + ' · ' + trim(a.statement), { systemId: sys.id, sysSubtab: 'sys-asm' }));
            });
            break;
        }

        case 'ftaPage': {
            const page = (ftaPages || []).find(p => p.id === target.id);
            if (!page) return [];
            // FHAs this page links to (linkedFhaIds[] with legacy linkedFhaId fallback) — Phase 28 item 4.
            const pageLinks = (Array.isArray(page.linkedFhaIds) && page.linkedFhaIds.length) ? page.linkedFhaIds : (page.linkedFhaId ? [page.linkedFhaId] : []);
            pageLinks.forEach(lid => {
                const acFha = (acFhaData || []).find(f => String(f.internalId) === String(lid));
                if (acFha) {
                    out.push(descriptor('acFha', acFha.internalId, acFha.fcId + ': ' + trim(acFha.fcDesc), { detail: 'Top hazard' }));
                } else {
                    (systemsData || []).forEach(s => {
                        const sf = (s.fha || []).find(f => String(f.internalId) === String(lid));
                        if (sf) out.push(descriptor('sysFha', sf.internalId, sf.fcId + ': ' + trim(sf.fcDesc), { systemId: s.id, sysSubtab: 'sys-fha', detail: 'Top hazard' }));
                    });
                }
            });
            // Owning system for system-level trees
            if (page.systemId) {
                const sys = (systemsData || []).find(s => s.id === page.systemId);
                if (sys) out.push(descriptor('sysFunc', sys.id, 'System: ' + sys.name, { systemId: sys.id, detail: 'Owning system' }));
            }
            // Requirements generated from gates / basic events on this page
            allReqsWithScope().forEach(({ req, scope, systemId }) => {
                if (!req.reqSource) return;
                const sid = req.reqSource.sourceId || '';
                if (sid.includes(':gate-indep:' + page.id + ':') || (sid.includes(':fta-event:'))) {
                    // For fta-event reqs we'd need to walk to confirm the lid lives on this page — keep light here.
                    const kind = scope === 'ac' ? 'acReq' : 'sysReq';
                    if (sid.includes(':gate-indep:' + page.id + ':')) {
                        out.push(descriptor(kind, req.internalId, trim(req.text), { systemId, sysSubtab: scope === 'ac' ? null : 'sys-req', detail: 'Gate independence' }));
                    }
                }
            });
            // CMAs linking any gate on this page
            (cmaData || []).forEach(c => {
                if (!c.linkedGateIds) return;
                if (c.linkedGateIds.some(k => k.indexOf(page.id + ':') === 0)) {
                    out.push(descriptor('cma', c.internalId, c.cmaId + ' · ' + trim(c.subject), { detail: 'Links gate on this page' }));
                }
            });
            break;
        }

        case 'ftaNode': {
            const pageId = target.pageId;
            const nodeId = target.id;
            const page = (ftaPages || []).find(p => p.id === pageId);
            if (!page) return [];
            const node = (typeof findNode === 'function') ? findNode(page.root, nodeId) : null;
            const lid = (node && node.logicalId != null) ? node.logicalId : nodeId;
            // FMEA piece-part rows referencing this basic event
            (fmeaData || []).forEach(m => {
                if ((m.fmeaType || 'piece-part') === 'piece-part' && m.beId === nodeId) out.push(descriptor('fmea', m.internalId, m.fmeaId + ' · ' + trim(m.part)));
            });
            // CMAs linking this gate
            const gateKey = pageId + ':' + nodeId;
            (cmaData || []).forEach(c => {
                if ((c.linkedGateIds || []).includes(gateKey)) out.push(descriptor('cma', c.internalId, c.cmaId + ' · ' + trim(c.subject)));
            });
            // Auto-reqs derived from this node (basic event reliability OR gate independence)
            allReqsWithScope().forEach(({ req, scope, systemId }) => {
                if (!req.reqSource) return;
                const sid = req.reqSource.sourceId || '';
                const matchBE = sid.startsWith(scope + ':fta-event:') && (sid.endsWith(':' + lid) || sid.endsWith(':' + nodeId));
                const matchGate = sid === scope + ':gate-indep:' + pageId + ':' + nodeId;
                if (matchBE || matchGate) {
                    const kind = scope === 'ac' ? 'acReq' : 'sysReq';
                    out.push(descriptor(kind, req.internalId, trim(req.text), { systemId, sysSubtab: scope === 'ac' ? null : 'sys-req' }));
                }
            });
            break;
        }

        case 'pra': {
            const pra = (praData || []).find(p => String(p.internalId) === String(target.id));
            if (!pra) return [];
            // Zones it affects
            (pra.affectedZones || []).forEach(zid => {
                const z = (zsaData || []).find(zz => zz.zoneId === zid);
                if (z) out.push(descriptor('zsa', z.internalId, z.zoneId + ' · ' + trim(z.desc), { detail: 'Affected zone' }));
            });
            // Auto-reqs generated from this PRA
            allReqsWithScope().forEach(({ req, scope, systemId }) => {
                if (!req.reqSource) return;
                const sid = req.reqSource.sourceId || '';
                if (sid === 'ac:pra:' + (pra.praId || 'internal-' + pra.internalId)) {
                    out.push(descriptor('acReq', req.internalId, trim(req.text), { detail: 'Zonal-protection req' }));
                }
            });
            break;
        }

        case 'zsa': {
            const zsa = (zsaData || []).find(z => String(z.internalId) === String(target.id));
            if (!zsa) return [];
            // PRAs whose affectedZones include this zone
            (praData || []).forEach(p => {
                if ((p.affectedZones || []).includes(zsa.zoneId)) out.push(descriptor('pra', p.internalId, p.praId + ' · ' + trim(p.threat), { detail: 'Affects this zone' }));
            });
            // Functions housed here
            (zsa.housedFunctions || []).forEach(subId => {
                const f = (acFunctionsData || []).find(x => x.subId === subId);
                if (f) out.push(descriptor('acFunc', f.subId, f.subId + ' · ' + trim(f.subName), { detail: 'Housed in this zone' }));
            });
            // Auto-reqs generated from this ZSA
            allReqsWithScope().forEach(({ req, scope, systemId }) => {
                if (!req.reqSource) return;
                const sid = req.reqSource.sourceId || '';
                if (sid === 'ac:zsa:' + zsa.zoneId) {
                    out.push(descriptor('acReq', req.internalId, trim(req.text), { detail: 'Separation req' }));
                }
            });
            break;
        }

        case 'cma': {
            const cma = (cmaData || []).find(c => String(c.internalId) === String(target.id));
            if (!cma) return [];
            // Linked gates
            (cma.linkedGateIds || []).forEach(key => {
                const sep = key.indexOf(':');
                if (sep < 0) return;
                const pageId = key.slice(0, sep);
                const nodeId = parseInt(key.slice(sep + 1), 10);
                const page = (ftaPages || []).find(p => String(p.id) === String(pageId));
                if (!page) return;
                const n = (typeof findNode === 'function') ? findNode(page.root, nodeId) : null;
                if (!n) return;
                out.push(descriptor('ftaNode', nodeId, '[' + (page.name || '') + '] ' + (n.displayId || ('G-' + n.id)) + ' (' + (n.gateType || 'gate') + ')', { detail: 'Linked gate' }));
            });
            // Owning system (if any)
            if (cma.scope === 'system' && cma.owningSystemId) {
                const s = (systemsData || []).find(x => x.id === cma.owningSystemId);
                if (s) out.push(descriptor('sysFunc', s.id, 'System: ' + s.name, { systemId: s.id }));
            }
            break;
        }

        case 'library': {
            // target.id is the library key (e.g. 'CR.A1' for a MIL-HDBK-217F capacitor).
            const libKey = target.id;
            if (!libKey) return [];
            const matchedBeIds = new Set();
            (ftaPages || []).forEach(page => {
                (function walk(n){
                    if (!n) return;
                    if (n.type === 'basic' && n.libraryKey === libKey) {
                        const lid = n.logicalId != null ? n.logicalId : n.id;
                        matchedBeIds.add(n.id);
                        out.push(descriptor('ftaNode', n.id, '[' + (page.name || '') + '] ' + (n.displayId || n.id) + (n.name ? ' · ' + n.name : ''), { detail: 'Uses this library entry' }));
                    }
                    const kids = n.children || n._children;
                    if (kids) kids.forEach(walk);
                })(page.root);
            });
            // FMEA piece-part rows that point at any matched basic event.
            (fmeaData || []).forEach(m => {
                if ((m.fmeaType || 'piece-part') === 'piece-part' && matchedBeIds.has(m.beId)) {
                    out.push(descriptor('fmea', m.internalId, (m.fmeaId || '#' + m.internalId) + ' · ' + trim(m.part), { detail: 'FMEA on a basic event using this library entry' }));
                }
            });
            // Auto-generated reliability reqs whose source context carries this libraryKey.
            const allReqs = [];
            (acReqData || []).forEach(r => allReqs.push({ req: r, scope: 'ac', systemId: null }));
            (systemsData || []).forEach(s => (s.req || []).forEach(r => allReqs.push({ req: r, scope: 'sys-' + s.id, systemId: s.id })));
            allReqs.forEach(({ req, scope, systemId }) => {
                if (req && req.reqSource && req.reqSource.context && req.reqSource.context.libraryKey === libKey) {
                    out.push(descriptor(scope === 'ac' ? 'acReq' : 'sysReq', req.internalId, trim(req.text), { systemId, sysSubtab: scope === 'ac' ? null : 'sys-req', detail: 'Reliability req derived from this library entry' }));
                }
            });
            break;
        }

        case 'fmea': {
            const m = (fmeaData || []).find(r => String(r.internalId) === String(target.id));
            if (!m) return [];
            if (m.fmeaType === 'functional' && m.funcSubId) {
                const f = (acFunctionsData || []).find(x => x.subId === m.funcSubId);
                if (f) out.push(descriptor('acFunc', f.subId, f.subId + ' · ' + trim(f.subName), { detail: 'Linked sub-function' }));
            }
            // Functional FMEA → linked failure condition (#3).
            if (m.fmeaType === 'functional' && m.linkedFcId) {
                const fc = (acFhaData || []).find(h => String(h.internalId) === String(m.linkedFcId));
                if (fc) out.push(descriptor('acFha', fc.internalId, (fc.fcId || '') + ': ' + trim(fc.fcDesc), { detail: 'Linked failure condition' }));
            }
            if ((m.fmeaType || 'piece-part') === 'piece-part' && m.beId) {
                // Find the basic event
                for (const page of (ftaPages || [])) {
                    const n = (typeof findNode === 'function') ? findNode(page.root, m.beId) : null;
                    if (n) { out.push(descriptor('ftaNode', m.beId, '[' + (page.name || '') + '] ' + (n.displayId || n.id), { detail: 'Linked basic event' })); break; }
                }
            }
            if (m.scope === 'system' && m.owningSystemId) {
                const s = (systemsData || []).find(x => x.id === m.owningSystemId);
                if (s) out.push(descriptor('sysFunc', s.id, 'System: ' + s.name, { systemId: s.id }));
            }
            break;
        }

        case 'acReq':
        case 'sysReq': {
            // Reqs are leaves — what they reference is already encoded in their reqSource. Surface the source artifact as a referrer (inverse).
            const list = target.kind === 'acReq' ? (acReqData || []) : (((systemsData || []).find(s => s.id === target.systemId) || {}).req || []);
            const req = list.find(r => String(r.internalId) === String(target.id));
            if (!req || !req.reqSource) return [];
            const sid = req.reqSource.sourceId || '';
            const ctx = req.reqSource.context || {};
            // FHA source
            if (sid.includes(':fha:')) {
                const m = sid.match(/^(ac|sys-[^:]+):fha:(?:prob|dal(?::func)?):(.+)$/);
                if (m) {
                    if (m[1] === 'ac') {
                        const f = (acFhaData || []).find(x => String(x.internalId) === String(m)[2] || x.fcId === m[2]);
                        if (f) out.push(descriptor('acFha', f.internalId, f.fcId + ': ' + trim(f.fcDesc), { detail: 'Source FHA' }));
                    } else {
                        const sysId = m[1].replace(/^sys-/, '');
                        const s = (systemsData || []).find(x => x.id === sysId);
                        const f = s && (s.fha || []).find(x => String(x.internalId) === String(m)[2] || x.fcId === m[2]);
                        if (f) out.push(descriptor('sysFha', f.internalId, f.fcId + ': ' + trim(f.fcDesc), { systemId: sysId, sysSubtab: 'sys-fha', detail: 'Source FHA' }));
                    }
                }
            }
            // FTA event source
            if (sid.includes(':fta-event:')) {
                const lid = sid.split(':').pop();
                // Find matching basic event
                for (const page of (ftaPages || [])) {
                    let found = null;
                    (function walk(n){
                        if (!n || found) return;
                        const nlid = n.logicalId != null ? n.logicalId : n.id;
                        if (String(nlid) === String(lid)) { found = n; return; }
                        const kids = n.children || n._children;
                        if (kids) kids.forEach(walk);
                    })(page.root);
                    if (found) { out.push(descriptor('ftaNode', found.id, '[' + (page.name || '') + '] ' + (found.displayId || found.id), { detail: 'Source basic event' })); break; }
                }
            }
            // Gate independence source
            if (sid.includes(':gate-indep:')) {
                const parts = sid.split(':');
                const pageId = parts[parts.length - 2];
                const nodeId = parseInt(parts[parts.length - 1], 10);
                const page = (ftaPages || []).find(p => String(p.id) === String(pageId));
                if (page) {
                    const n = (typeof findNode === 'function') ? findNode(page.root, nodeId) : null;
                    if (n) out.push(descriptor('ftaNode', nodeId, '[' + (page.name || '') + '] ' + (n.displayId || n.id) + ' (' + (n.gateType || 'gate') + ')', { detail: 'Source gate' }));
                }
            }
            // PRA / ZSA source
            if (sid.includes(':pra:')) {
                const praId = sid.split(':pra:')[1];
                const p = (praData || []).find(x => x.praId === praId || ('internal-' + x.internalId) === praId);
                if (p) out.push(descriptor('pra', p.internalId, p.praId + ' · ' + trim(p.threat), { detail: 'Source PRA' }));
            }
            if (sid.includes(':zsa:')) {
                const zid = sid.split(':zsa:')[1];
                const z = (zsaData || []).find(x => x.zoneId === zid);
                if (z) out.push(descriptor('zsa', z.internalId, z.zoneId + ' · ' + trim(z.desc), { detail: 'Source ZSA' }));
            }
            // Obsoleting / superseding req
            if (req.reqSource.obsolete && req.reqSource.obsolete.supersededBy) {
                const supId = req.reqSource.obsolete.supersededBy;
                // Find the superseding req across all stores
                const all = allReqsWithScope();
                const sup = all.find(({ req: r }) => String(r.internalId) === String(supId));
                if (sup) {
                    const k = sup.scope === 'ac' ? 'acReq' : 'sysReq';
                    out.push(descriptor(k, sup.req.internalId, trim(sup.req.text), { systemId: sup.systemId, sysSubtab: sup.scope === 'ac' ? null : 'sys-req', detail: 'This req is superseded by' }));
                }
            }
            break;
        }

        }
        return out;
    }

    // ------------------------------------------------------------------
    //  listAllArtifacts() — flat list of every artifact in the project.
    //  Used by the command palette for fuzzy search.
    // ------------------------------------------------------------------
    function listAllArtifacts(){
        const out = [];
        // AC Functions
        (acFunctionsData || []).forEach(f => out.push({ kind: 'acFunc', id: f.subId, label: f.subId + ' · ' + (f.subName || ''), searchText: [f.subId, f.subName, f.parentFunc].join(' '), tab: 'ac-func' }));
        // AC FCIM
        // Phase 27 audit A11 — FCIM uses tl/pl/m id+desc fields and .subId (not .subFunc/.fcId/.fcDesc).
        (acFcimData || []).forEach(c => {
            const labelId = c.tlId || c.plId || c.mId || '#' + c.internalId;
            const labelDesc = c.tlDesc || c.plDesc || c.mDesc || '';
            out.push({ kind: 'acFcim', id: c.internalId, label: labelId + ' · ' + labelDesc, searchText: [c.tlId, c.plId, c.mId, c.tlDesc, c.plDesc, c.mDesc, c.subId].filter(Boolean).join(' '), tab: 'ac-fcim' });
        });
        // AC FHA
        (acFhaData || []).forEach(f => out.push({ kind: 'acFha', id: f.internalId, label: (f.fcId || '#' + f.internalId) + ' · ' + (f.fcDesc || '') + ' [' + (f.severity || '—') + ']', searchText: [f.fcId, f.fcDesc, f.severity, f.subId].join(' '), tab: 'ac-fha' }));
        // AC Reqs
        (acReqData || []).forEach(r => out.push({ kind: 'acReq', id: r.internalId, label: (r.traceId || '#' + r.internalId) + ' · ' + trim(r.text, 80), searchText: [r.traceId, r.text, r.level, r.type].join(' '), tab: 'ac-req' }));
        // AC Assumptions
        (acAssumptionsData || []).forEach(a => out.push({ kind: 'acAsm', id: a.internalId, label: (a.asmId || '#' + a.internalId) + ' · ' + trim(a.statement, 70), searchText: [a.asmId, a.statement, a.state].join(' '), tab: 'ac-asm' }));
        // Sys-scoped
        (systemsData || []).forEach(s => {
            (s.functions || []).forEach(f => out.push({ kind: 'sysFunc', id: f.subId, systemId: s.id, label: '[' + s.name + '] ' + (f.subId || '') + ' · ' + (f.subName || ''), searchText: [s.name, f.subId, f.subName].join(' '), tab: 'sys-workspace', sysSubtab: 'sys-func' }));
            (s.fcim || []).forEach(c => {
                const labelId = c.tlId || c.plId || c.mId || '#' + c.internalId;
                const labelDesc = c.tlDesc || c.plDesc || c.mDesc || '';
                out.push({ kind: 'sysFcim', id: c.internalId, systemId: s.id, label: '[' + s.name + '] ' + labelId + ' · ' + labelDesc, searchText: [s.name, c.tlId, c.plId, c.mId, c.tlDesc, c.plDesc, c.mDesc, c.subId].filter(Boolean).join(' '), tab: 'sys-workspace', sysSubtab: 'sys-fcim' });
            });
            (s.fha || []).forEach(f => out.push({ kind: 'sysFha', id: f.internalId, systemId: s.id, label: '[' + s.name + '] ' + (f.fcId || '') + ' · ' + (f.fcDesc || '') + ' [' + (f.severity || '—') + ']', searchText: [s.name, f.fcId, f.fcDesc, f.severity].join(' '), tab: 'sys-workspace', sysSubtab: 'sys-fha' }));
            (s.req || []).forEach(r => out.push({ kind: 'sysReq', id: r.internalId, systemId: s.id, label: '[' + s.name + '] ' + (r.traceId || '#' + r.internalId) + ' · ' + trim(r.text, 70), searchText: [s.name, r.traceId, r.text, r.level].join(' '), tab: 'sys-workspace', sysSubtab: 'sys-req' }));
            (s.asm || []).forEach(a => out.push({ kind: 'sysAsm', id: a.internalId, systemId: s.id, label: '[' + s.name + '] ' + (a.asmId || '#' + a.internalId) + ' · ' + trim(a.statement, 60), searchText: [s.name, a.asmId, a.statement].join(' '), tab: 'sys-workspace', sysSubtab: 'sys-asm' }));
        });
        // FTA pages
        (ftaPages || []).forEach(p => out.push({ kind: 'ftaPage', id: p.id, label: 'Tree: ' + (p.name || 'Untitled') + ' [' + (p.treeLevel || 'standalone') + ']', searchText: [p.name, p.treeLevel].join(' '), tab: 'fta' }));
        // PRA / ZSA / CMA / FMEA
        (praData || []).forEach(p => out.push({ kind: 'pra', id: p.internalId, label: (p.praId || '#' + p.internalId) + ' · ' + (p.threat || ''), searchText: [p.praId, p.threat, p.desc].join(' '), tab: 'pra' }));
        (zsaData || []).forEach(z => out.push({ kind: 'zsa', id: z.internalId, label: (z.zoneId || '#' + z.internalId) + ' · ' + (z.desc || '') + ' [' + (z.severity || '—') + ']', searchText: [z.zoneId, z.desc, z.severity, z.equip].join(' '), tab: 'zsa' }));
        (cmaData || []).forEach(c => out.push({ kind: 'cma', id: c.internalId, label: (c.cmaId || '#' + c.internalId) + ' · ' + (c.subject || ''), searchText: [c.cmaId, c.subject, c.claim, c.findings].join(' '), tab: 'cma' }));
        (fmeaData || []).forEach(m => out.push({ kind: 'fmea', id: m.internalId, label: (m.fmeaId || '#' + m.internalId) + ' · ' + (m.part || m.funcSubId || '') + ' · ' + trim(m.localEffect, 50), searchText: [m.fmeaId, m.part, m.funcSubId, m.localEffect].join(' '), tab: 'fmea' }));
        // Library entries — surface them in the command palette so users can jump straight
        // to the component card from anywhere in the project.
        if (typeof getActiveLibrary === 'function') {
            try {
                const active = getActiveLibrary();
                Object.entries(active || {}).forEach(([key, def]) => {
                    out.push({ kind: 'library', id: key, label: key + ' · ' + (def.name || '') + (def.group ? '  [' + def.group + ']' : ''), searchText: [key, def.name, def.group, def.source].filter(Boolean).join(' '), tab: 'library' });
                });
            } catch(e){}
        }
        return out;
    }

    // ------------------------------------------------------------------
    //  getWorklist() — actionable issues for the Dashboard.
    //  Categories: stale, compromised, obsolete-pending-archive, orphans, open CMAs, dup pairs.
    // ------------------------------------------------------------------
    function getWorklist(){
        const buckets = {
            staleReqs: [],
            compromisedReqs: [],
            obsoletePending: [],
            orphanFmea: [],
            openCmas: [],
            duplicatePairs: []
        };

        // Stale + compromised reqs across AC + Sys
        const pushReq = (req, scope, systemId) => {
            if (!req || !req.reqSource) return null;
            const kind = scope === 'ac' ? 'acReq' : 'sysReq';
            return descriptor(kind, req.internalId, trim(req.text), { systemId, sysSubtab: scope === 'ac' ? null : 'sys-req' });
        };
        (acReqData || []).forEach(r => {
            if (r.reqSource && r.reqSource.stale)                  buckets.staleReqs.push(pushReq(r, 'ac'));
            if (r.compromised && r.compromiseReasons && r.compromiseReasons.length) buckets.compromisedReqs.push(pushReq(r, 'ac'));
            if (r.reqSource && r.reqSource.obsolete && r.status !== 'archived') buckets.obsoletePending.push(pushReq(r, 'ac'));
        });
        (systemsData || []).forEach(s => (s.req || []).forEach(r => {
            if (r.reqSource && r.reqSource.stale)                  buckets.staleReqs.push(pushReq(r, 'sys-' + s.id, s.id));
            if (r.compromised && r.compromiseReasons && r.compromiseReasons.length) buckets.compromisedReqs.push(pushReq(r, 'sys-' + s.id, s.id));
            if (r.reqSource && r.reqSource.obsolete && r.status !== 'archived') buckets.obsoletePending.push(pushReq(r, 'sys-' + s.id, s.id));
        }));

        // Orphan FMEA rows
        (fmeaData || []).forEach(m => {
            if (typeof _isFmeaOrphan === 'function' && _isFmeaOrphan(m)) {
                buckets.orphanFmea.push(descriptor('fmea', m.internalId, (m.fmeaId || '#' + m.internalId) + ' · ' + trim(m.localEffect, 50)));
            }
        });

        // Open / In-Progress CMAs with identified modes or findings
        (cmaData || []).forEach(c => {
            const s = c.status || 'Open';
            if (s === 'Mitigated' || s === 'Closed — Accepted') return;
            const hasModes = c.modes && c.modes.length > 0;
            const hasFindings = c.findings && String(c.findings).trim().length > 0;
            if (hasModes || hasFindings) buckets.openCmas.push(descriptor('cma', c.internalId, (c.cmaId || '#' + c.internalId) + ' · ' + trim(c.subject, 50)));
        });

        // Duplicate AC↔Sys req pairs awaiting reconciliation. Resolve the full scope key for
        // each side (e.g. 'sys-fcs' rather than the placeholder 'sys') so the worklist's jump
        // links can route into the correct system workspace (Phase 27 audit A12).
        const _resolveScope = (req) => {
            if (!req || !req.reqSource) return { scope: 'ac', systemId: null };
            const sid = req.reqSource.sourceId || '';
            if (sid.indexOf('ac:') === 0) return { scope: 'ac', systemId: null };
            const m = sid.match(/^sys-([^:]+):/);
            return m ? { scope: 'sys-' + m[1], systemId: m[1] } : { scope: 'ac', systemId: null };
        };
        try {
            const pairs = (typeof AutoReq !== 'undefined' && AutoReq.findDuplicates) ? AutoReq.findDuplicates() : [];
            pairs.forEach(p => {
                if (!p.loser || (p.loser.reqSource && p.loser.reqSource.obsolete)) return;   // already tagged
                const winScope = _resolveScope(p.winner);
                const losScope = _resolveScope(p.loser);
                buckets.duplicatePairs.push({
                    winner: pushReq(p.winner, winScope.scope, winScope.systemId),
                    loser:  pushReq(p.loser,  losScope.scope, losScope.systemId),
                    kind: p.kind, reason: p.reason
                });
            });
        } catch(e){}

        return buckets;
    }

    return { getReferrers, listAllArtifacts, getWorklist, KIND_LABELS, KIND_TAB, descriptor };
})();
