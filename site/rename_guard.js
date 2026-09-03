// ============================================================================
// rename_guard.js — v1.5 — Q4: rename-safe identity + delete-stale cascade.
//
// v1.3 (Waqas ruling, 2 Aug 2026): "once deleted, all connected artifacts
// should be marked as stale in the golden thread." Function deletes already
// cascaded obsolescence (safety_lab _removeFunctionCascade); every OTHER
// owner kind — FHA rows, zones, items, PRAs — left dependents silently
// dangling until gt_integrity noticed after the fact. The same owner
// snapshot that detects renames now detects DELETIONS (owner gone, key not
// re-owned) and automatically marks every referencing artifact stale using
// the product's existing obsolete vocabulary (rows: obsolete/obsoleteReason;
// requirements: reqSource.obsolete + orphan; array-slot containers get
// staleRefs entries). Marks are idempotent, so overlapping with the function
// cascade is harmless; gt_integrity renders the marks as a STALE section.
//
// The golden thread survives renames wherever links ride internal ids
// (linkedFhaIds, realizedByItemId, threadLinks, parentReqId). But several
// stores hold ID STRINGS: ZSA zones list function subIds, PRAs list zone
// ids, RAM tasks / MSG-3 / FMEA rows hold item ids, FCIM TL/PL/M columns
// hold FC ids, requirement trace tags hold subIds/praIds. Rename the owner
// and every string reference strands — gt_integrity reports it AFTER the
// fact; nothing healed it. This module does.
//
// Mechanism (deterministic, internal-id anchored):
//   1. Snapshot every identity owner: kind + owner internalId → key string.
//   2. Ride the autosave debounce (scheduleAutosave fires after every
//      mutation). On a throttle, re-snapshot and diff: same owner, key
//      changed, old ≠ new → a RENAME, not a delete+create.
//   3. Enumerate live string references to the OLD value across the known
//      reference map. If any exist, a modal offers one-click propagation
//      ("FC-02 → FC-02A · 7 references"), listing where they live.
//   4. Propagation rewrites exactly those slots, logs to
//      projectConfig.renameLog, autosaves. Declining leaves everything for
//      gt_integrity to flag — nothing is ever rewritten silently.
//
// Ambiguity guard: if the old key is still carried by ANOTHER live owner
// (duplicate ids), the rename is skipped — references may legitimately
// point at the survivor. Baselines reset on project apply/load so restores
// and round-trip proofs never trigger rename storms.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _sysList() { return (typeof systemsData !== 'undefined' ? systemsData : []) || []; }
    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : null); }

    // ------------------------------------------------------ the identity map
    // owners(): every row that OWNS a key of this kind → { id, key }.
    // refs(value): every live slot holding that key string elsewhere.
    function _reqRefs(value, slots) {
        const scan = (reqs, where) => (reqs || []).forEach(r => {
            if (!r || r.deleted) return;
            if (r.traceId === value) slots.push({ obj: r, field: 'traceId', where });
            if (Array.isArray(r.traceIds) && r.traceIds.indexOf(value) >= 0) slots.push({ obj: r, field: 'traceIds', isArray: true, where });
        });
        scan(typeof acReqData !== 'undefined' ? acReqData : [], 'AC requirements');
        _sysList().forEach(s => scan(s.req, (s.name || s.id) + ' requirements'));
    }
    // 8 Aug 2026 — physical hazards reference their source CCA finding by id
    // ({kind, ref}); a zone/PRA rename or delete must reach that slot too.
    function _phSourceRefs(kind, value, slots) {
        (((typeof projectConfig !== 'undefined' && projectConfig.physHazards) || [])).forEach(ph => {
            if (ph && ph.source && ph.source.kind === kind && String(ph.source.ref) === String(value))
                // obj/field drive the rename write (ph.source.ref = new id);
                // markObj is where a delete-time stale mark belongs — the ROW,
                // so badges and the stale sweep see it.
                slots.push({ obj: ph.source, field: 'ref', markObj: ph, where: 'Physical hazard ' + (ph.phId || '') });
        });
    }

    const KINDS = {
        subId: {
            label: 'Function ID',
            owners: () => {
                const out = [];
                (typeof acFunctionsData !== 'undefined' ? acFunctionsData : []).forEach(f => f && out.push({ id: 'ac:' + f.internalId, key: f.subId, obj: f, field: 'subId' }));
                // system functions carry their id in funcId (subId is the legacy field)
                _sysList().forEach(s => (s.functions || []).forEach(f => f && out.push({ id: 'sys-' + s.id + ':' + f.internalId, key: f.subId || f.funcId, obj: f, field: (f.subId != null ? 'subId' : 'funcId') })));
                return out;
            },
            refs: value => {
                const slots = [];
                const fhaScan = (fha, where) => (fha || []).forEach(r => {
                    if (!r) return;
                    if (r.subId === value) slots.push({ obj: r, field: 'subId', where: where + ' FHA' });
                    if (Array.isArray(r.subIds) && r.subIds.indexOf(value) >= 0) slots.push({ obj: r, field: 'subIds', isArray: true, where: where + ' FHA' });
                });
                fhaScan(typeof acFhaData !== 'undefined' ? acFhaData : [], 'AC');
                _sysList().forEach(s => fhaScan(s.fha, s.name || s.id));
                const fcimScan = (rows, where) => (rows || []).forEach(r => { if (r && r.subId === value) slots.push({ obj: r, field: 'subId', where }); });
                fcimScan(typeof acFcimData !== 'undefined' ? acFcimData : [], 'AC FCIM');
                _sysList().forEach(s => fcimScan(s.fcim, (s.name || s.id) + ' FCIM'));
                (typeof zsaData !== 'undefined' ? zsaData : []).forEach(z => {
                    if (z && Array.isArray(z.housedFunctions) && z.housedFunctions.indexOf(value) >= 0)
                        slots.push({ obj: z, field: 'housedFunctions', isArray: true, where: 'ZSA zone ' + z.zoneId });
                });
                (typeof itemsData !== 'undefined' ? itemsData : []).forEach(i => {
                    if (i && Array.isArray(i.traceIds) && i.traceIds.indexOf(value) >= 0)
                        slots.push({ obj: i, field: 'traceIds', isArray: true, where: 'Item ' + (i.itemId || '') });
                });
                _reqRefs(value, slots);
                return slots;
            }
        },
        zoneId: {
            label: 'Zone ID',
            owners: () => (typeof zsaData !== 'undefined' ? zsaData : []).filter(Boolean).map(z => ({ id: 'zsa:' + (z.internalId != null ? z.internalId : z.zoneId), key: z.zoneId, obj: z, field: 'zoneId' })),
            refs: value => {
                const slots = [];
                (typeof praData !== 'undefined' ? praData : []).forEach(p => {
                    if (p && Array.isArray(p.affectedZones) && p.affectedZones.indexOf(value) >= 0)
                        slots.push({ obj: p, field: 'affectedZones', isArray: true, where: 'PRA ' + (p.praId || '') });
                });
                _phSourceRefs('zsa', value, slots);
                _reqRefs(value, slots);   // zsa-separation / zsa-phys write traceId = zoneId
                return slots;
            }
        },
        itemId: {
            label: 'Item / LRU ID',
            owners: () => (typeof itemsData !== 'undefined' ? itemsData : []).filter(Boolean).map(i => ({ id: 'item:' + i.internalId, key: i.itemId, obj: i, field: 'itemId' })),
            refs: value => {
                const slots = [];
                const pc = _pc();
                const scanList = (list, where) => (list || []).forEach(t => { if (t && t.itemId === value) slots.push({ obj: t, field: 'itemId', where }); });
                if (pc && pc.ram) scanList(pc.ram.tasks, 'RAM maintainability tasks');
                if (pc && pc.mxAnalytics) {
                    scanList(pc.mxAnalytics.msis, 'MSG-3 MSIs');
                    scanList(pc.mxAnalytics.spares, 'Spares');
                    scanList(pc.mxAnalytics.lora, 'LORA');
                }
                if (pc && pc.lcc) scanList(pc.lcc.items, 'LCC items');
                (typeof fmeaData !== 'undefined' ? fmeaData : []).forEach(r => { if (r && r.itemId === value) slots.push({ obj: r, field: 'itemId', where: 'FMEA' }); });
                return slots;
            }
        },
        fcId: {
            label: 'Failure condition ID',
            owners: () => {
                const out = [];
                (typeof acFhaData !== 'undefined' ? acFhaData : []).forEach(f => f && out.push({ id: 'acfha:' + f.internalId, key: f.fcId, obj: f, field: 'fcId' }));
                _sysList().forEach(s => (s.fha || []).forEach(f => f && out.push({ id: 'sysfha-' + s.id + ':' + f.internalId, key: f.fcId, obj: f, field: 'fcId' })));
                return out;
            },
            refs: value => {
                const slots = [];
                const fcimScan = (rows, where) => (rows || []).forEach(r => {
                    if (!r) return;
                    ['tlId', 'plId', 'mId'].forEach(f => { if (r[f] === value) slots.push({ obj: r, field: f, where }); });
                });
                fcimScan(typeof acFcimData !== 'undefined' ? acFcimData : [], 'AC FCIM');
                _sysList().forEach(s => fcimScan(s.fcim, (s.name || s.id) + ' FCIM'));
                _reqRefs(value, slots);
                return slots;
            }
        },
        praId: {
            label: 'PRA ID',
            owners: () => (typeof praData !== 'undefined' ? praData : []).filter(Boolean).map(p => ({ id: 'pra:' + (p.internalId != null ? p.internalId : p.praId), key: p.praId, obj: p, field: 'praId' })),
            refs: value => { const slots = []; _phSourceRefs('pra', value, slots); _reqRefs(value, slots); return slots; }
        },
        // 8 Aug 2026 — physical hazards (phys_hazards.js) are identity owners:
        // requirements trace to a phId, so renaming one must carry the traces and
        // deleting one must mark them stale, exactly like an FC id.
        phId: {
            label: 'Physical hazard ID',
            owners: () => (((typeof projectConfig !== 'undefined' && projectConfig.physHazards) || [])).filter(Boolean)
                .map(p => ({ id: 'ph:' + p.internalId, key: p.phId, obj: p, field: 'phId' })),
            refs: value => { const slots = []; _reqRefs(value, slots); return slots; }
        },
        // v1.4 (2 Aug) — tree PAGES are owners too: transfer gates reference
        // them by id (linkedPageId / transferOutTo), and a deleted page turns
        // every such transfer into a silent zero (empty cut sets, healthy-
        // looking top P). Deleting a page now marks the referencing transfer
        // NODES stale; INV-44 + the gt dangling sweep make them loud.
        pageId: {
            label: 'Fault tree page',
            // Page ids are STRUCTURAL and internal — never renamed by a user, so no
            // owner-write slot is offered here (only the delete path uses this kind).
            owners: () => ((typeof ftaPages !== 'undefined' ? ftaPages : []) || []).filter(Boolean).map(p => ({ id: 'ftap:' + p.id, key: String(p.id) })),
            refs: value => {
                const slots = [];
                ((typeof ftaPages !== 'undefined' ? ftaPages : []) || []).forEach(p => p && (function walk(n) {
                    if (!n) return;
                    if (String(n.linkedPageId || '') === String(value)) slots.push({ obj: n, field: 'linkedPageId', where: 'Transfer in ' + (p.name || p.id) });
                    if (String(n.transferOutTo || '') === String(value)) slots.push({ obj: n, field: 'transferOutTo', where: 'Transfer-out stub in ' + (p.name || p.id) });
                    (n.children || []).concat(n._children || []).forEach(walk);
                })(p.root));
                return slots;
            }
        }
    };

    // ------------------------------------------------------ snapshot + diff
    let _last = null;

    function _snap() {
        const m = {};
        Object.keys(KINDS).forEach(kind => {
            try { KINDS[kind].owners().forEach(o => { if (o.key) m[kind + '|' + o.id] = o.key; }); } catch (_) {}
        });
        return m;
    }

    // Mark every artifact still referencing a DELETED owner's key as stale.
    // Rows take the product's obsolete vocabulary (badge renderers already
    // read it); requirements take the reqSource.obsolete + orphan convention
    // the function cascade established; array-slot containers (a zone's
    // housedFunctions, a PRA's affectedZones, traceIds lists) get a
    // staleRefs entry — gt_integrity renders those. Idempotent throughout.
    function rgMarkStale(kind, oldKey) {
        const label = (KINDS[kind] && KINDS[kind].label) || kind;
        const reason = 'STALE — ' + label + ' ' + oldKey + ' deleted';
        let refs = [];
        try { refs = KINDS[kind].refs(oldKey); } catch (_) {}
        let marked = 0;
        refs.forEach(slot => {
            try {
                const o = slot.obj;
                if (slot.isArray) {
                    o.staleRefs = o.staleRefs || [];
                    if (!o.staleRefs.some(s => s && s.kind === kind && s.ref === oldKey && s.field === slot.field)) {
                        o.staleRefs.push({ kind, ref: oldKey, field: slot.field, reason, at: new Date().toISOString() });
                        marked++;
                    }
                } else if (slot.field === 'traceId') {
                    if (o.reqSource && o.reqSource.obsolete) return;
                    o.reqSource = o.reqSource || {};
                    o.reqSource.obsolete = { reason, taggedAt: new Date().toISOString() };
                    o.reqSource.orphan = true;
                    marked++;
                } else {
                    // markObj (8 Aug 2026): when the reference slot is a nested
                    // object (a physical hazard's source), the stale mark belongs
                    // on the ROW the sweeps and badges read, not on the nested slot.
                    const tgt = slot.markObj || o;
                    if (tgt.obsolete) return;
                    tgt.obsolete = true;
                    tgt.obsoleteReason = reason;
                    tgt.obsoletedAt = new Date().toISOString();
                    marked++;
                }
            } catch (_) {}
        });
        if (marked) {
            const pc = _pc();
            if (pc) {
                pc.staleLog = pc.staleLog || [];
                pc.staleLog.push({ kind, key: oldKey, marked, at: new Date().toISOString() });
            }
        }
        return marked;
    }

    // Diff the last baseline against now. Returns renames (with live ref
    // slots) and ALWAYS re-baselines, so each rename is reported once.
    // v1.3: the same diff detects DELETIONS (owner id gone, its key not
    // re-owned) and marks the survivors stale automatically — marking is
    // non-destructive, so no modal gate; the toast + gt page carry the news.
    function rgScan() {
        const cur = _snap();
        const renames = [];
        let staleMarked = 0; const staleKeys = [];
        if (_last) {
            // current keys per kind — the ambiguity + deletion guards need them
            const liveKeys = {};
            Object.keys(cur).forEach(idk => {
                const kind = idk.split('|')[0];
                (liveKeys[kind] = liveKeys[kind] || new Set()).add(cur[idk]);
            });
            Object.keys(cur).forEach(idk => {
                const prev = _last[idk], next = cur[idk];
                if (!prev || !next || prev === next) return;
                const kind = idk.split('|')[0];
                if (liveKeys[kind].has(prev)) return;   // old key still owned elsewhere — ambiguous, skip
                let refs = [];
                try { refs = KINDS[kind].refs(prev); } catch (_) {}
                renames.push({ kind, label: KINDS[kind].label, from: prev, to: next, refs });
            });
            // DELETIONS: the owner id itself is gone. If its key survives on
            // another owner (duplicate ids, or a re-key), references may
            // legitimately point at the survivor — skip, same ambiguity rule.
            Object.keys(_last).forEach(idk => {
                if (cur[idk] !== undefined) return;
                const kind = idk.split('|')[0];
                const oldKey = _last[idk];
                if (!oldKey) return;
                if (liveKeys[kind] && liveKeys[kind].has(oldKey)) return;
                const n = rgMarkStale(kind, oldKey);
                if (n) { staleMarked += n; staleKeys.push(oldKey); }
            });
        }
        _last = cur;
        if (staleMarked) {
            try { if (typeof showToast === 'function') showToast(staleMarked + ' connected artifact' + (staleMarked === 1 ? '' : 's') + ' marked STALE (deleted: ' + staleKeys.join(', ') + ') — see Thread Integrity.', 'warning', 6000); } catch (_) {}
            try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        }
        return renames;
    }

    function rgBaseline() { _last = _snap(); }

    // ------------------------------------------------------------ propagate
    function rgApply(rename) {
        let n = 0;
        // v1.1 (2 Aug, caught live): re-enumerate at APPLY time. The slots were
        // captured at scan time; if the data changed since (another card's apply,
        // an external fix, an undo), the stale slots miss new references and
        // report phantom ones. Fresh enumeration makes the click truthful.
        try { if (KINDS[rename.kind]) rename = Object.assign({}, rename, { refs: KINDS[rename.kind].refs(rename.from) }); } catch (_) {}
        (rename.refs || []).forEach(slot => {
            try {
                if (slot.isArray) {
                    const a = slot.obj[slot.field];
                    const ix = a.indexOf(rename.from);
                    if (ix >= 0) { a[ix] = rename.to; n++; }
                } else if (slot.obj[slot.field] === rename.from) {
                    slot.obj[slot.field] = rename.to;
                    n++;
                }
            } catch (_) {}
        });
        const pc = _pc();
        if (pc) {
            pc.renameLog = pc.renameLog || [];
            pc.renameLog.push({ kind: rename.kind, from: rename.from, to: rename.to, updated: n, at: new Date().toISOString() });
        }
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        return n;
    }

    // ------------------------------------------------------------- the modal
    let _queue = [];

    function _ensureModal() {
        let modal = document.getElementById('rg-modal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'rg-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML =
            '<div class="modal-content" style="max-width: 640px;">' +
            '<div class="modal-header">' +
            '<h2>Rename Detected</h2>' +
            '<button class="btn-red" style="margin:0;" onclick="rgCloseModal()">Close</button>' +
            '</div>' +
            '<div class="modal-body" style="padding: 18px 22px;">' +
            '<p style="font-size:12.5px; color:var(--color-text-secondary); margin:0 0 12px;">Other artifacts still reference the old identifier as text. Update them to keep the golden thread intact, or keep the old strings (Thread Integrity will flag them).</p>' +
            '<div id="rg-modal-list"></div>' +
            '</div></div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) window.rgCloseModal(); });
        return modal;
    }

    function _renderModal() {
        const modal = _ensureModal();
        const list = document.getElementById('rg-modal-list');
        // v1.1 — prune entries whose references no longer exist (someone fixed
        // them another way since the scan): a card claiming live references that
        // are already clean is a stale card, and it stays on screen forever.
        _queue = _queue.filter(r => {
            try { r.refs = KINDS[r.kind] ? KINDS[r.kind].refs(r.from) : r.refs; } catch (_) {}
            return (r.refs || []).length > 0;
        });
        if (!_queue.length) { window.rgCloseModal(); return; }
        list.innerHTML = _queue.map((r, i) => {
            const byWhere = {};
            r.refs.forEach(s => { byWhere[s.where] = (byWhere[s.where] || 0) + 1; });
            const whereStr = Object.keys(byWhere).map(w => _esc(w) + ' ×' + byWhere[w]).join(' · ');
            return '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-2); padding:10px 14px; margin-bottom:10px;">' +
                '<div style="font-size:13px;"><b>' + _esc(r.label) + '</b>: <span class="u-mono">' + _esc(r.from) + '</span> → <span class="u-mono">' + _esc(r.to) + '</span></div>' +
                '<div style="font-size:12px; color:var(--color-text-secondary); margin-top:4px;">' + r.refs.length + ' reference' + (r.refs.length === 1 ? '' : 's') + ' still point at the old id: ' + whereStr + '</div>' +
                '<div style="margin-top:8px; display:flex; gap:8px;">' +
                '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 12px;" onclick="rgApplyQueued(' + i + ')">Update references</button>' +
                '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 12px; opacity:0.7;" onclick="rgDismissQueued(' + i + ')">Keep old strings</button>' +
                '</div></div>';
        }).join('');
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);
    }

    window.rgCloseModal = function () {
        const modal = document.getElementById('rg-modal');
        if (!modal) return;
        modal.classList.remove('show');
        setTimeout(() => { modal.style.display = 'none'; }, 250);
    };
    window.rgApplyQueued = function (i) {
        const r = _queue[i];
        if (!r) return;
        const n = rgApply(r);
        _queue.splice(i, 1);
        try { if (typeof showToast === 'function') showToast(n + ' reference' + (n === 1 ? '' : 's') + ' updated: ' + r.from + ' → ' + r.to + '.', 'success', 3600); } catch (_) {}
        _renderModal();
    };
    window.rgDismissQueued = function (i) {
        _queue.splice(i, 1);
        _renderModal();
    };

    // -------------------------------------------------------------- the hook
    // Ride the autosave debounce: scheduleAutosave fires after every mutation.
    // Throttled so a burst of edits produces one scan.
    let _timer = null;
    function _checkSoon() {
        if (_timer) clearTimeout(_timer);
        _timer = setTimeout(() => {
            _timer = null;
            try {
                const renames = rgScan().filter(r => r.refs.length > 0);
                if (renames.length) { _queue.push(...renames); _renderModal(); }
            } catch (_) {}
        }, 900);
    }

    (function wrap() {
        if (typeof window.scheduleAutosave === 'function' && !window.scheduleAutosave._rgWrapped) {
            const orig = window.scheduleAutosave;
            const wrapped = function () {
                const r = orig.apply(this, arguments);
                try { _checkSoon(); } catch (_) {}
                return r;
            };
            wrapped._rgWrapped = true;
            window.scheduleAutosave = wrapped;
        }
        // Project apply/load resets the baseline — restores, recoveries, and
        // round-trip proofs must never read as mass renames.
        if (typeof window._applyProjectData === 'function' && !window._applyProjectData._rgWrapped) {
            const orig = window._applyProjectData;
            const wrapped = function () {
                const r = orig.apply(this, arguments);
                try { _queue = []; rgBaseline(); } catch (_) {}
                return r;
            };
            wrapped._rgWrapped = true;
            window._applyProjectData = wrapped;
        }
    })();

    // Initial baseline once the project data exists.
    (function boot(tries) {
        if (typeof acFhaData !== 'undefined' && typeof projectConfig !== 'undefined') { rgBaseline(); return; }
        if (tries > 0) setTimeout(() => boot(tries - 1), 400);
    })(25);

    // v1.5 (4 Aug 2026) — owner-key write, for the DELIBERATE renumber
    // migration (slate #12). The reactive rename flow never needed this: the
    // user had already renamed the owner by hand and rgApply only had to chase
    // the danglers. A migration renames the owner too, and that write belongs
    // HERE, beside the store knowledge, rather than in a second module that
    // would then have to know where every id lives (§8).
    // Returns { ok, from, to } or { ok:false, reason }. Writes ONE field.
    function rgRenameOwner(kind, from, to) {
        const def = KINDS[kind];
        if (!def) return { ok: false, reason: 'unknown kind "' + kind + '"' };
        let owners = [];
        try { owners = def.owners() || []; } catch (e) { return { ok: false, reason: 'owner enumeration failed: ' + (e && e.message) }; }
        if (owners.some(o => o && o.key === to)) return { ok: false, reason: '"' + to + '" is already in use — refusing to merge two owners onto one id' };
        const hit = owners.filter(o => o && o.key === from);
        if (!hit.length) return { ok: false, reason: 'no ' + (def.label || kind) + ' carries the id "' + from + '"' };
        if (hit.length > 1) return { ok: false, reason: '"' + from + '" is carried by ' + hit.length + ' owners — ambiguous, refusing' };
        const o = hit[0];
        if (!o.obj || !o.field) return { ok: false, reason: (def.label || kind) + ' ids are structural and are not renameable' };
        o.obj[o.field] = to;
        return { ok: true, from, to };
    }

    // ------------------------------------------------------------- exports
    window.rgRenameOwner = rgRenameOwner;
    window.rgScan = rgScan;
    window.rgApply = rgApply;
    window.rgBaseline = rgBaseline;
    window.rgMarkStale = rgMarkStale;
    window._rgKinds = KINDS;
})();
