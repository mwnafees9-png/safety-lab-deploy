// ============================================================================
// renumber_migration.js — v1.1 — the legacy-id renumber migration.
// v1.1 adds the PLAN GENERATOR (renumberPlanFromScheme / renumberPlanPreview):
// targets are minted by the project numbering engine, never by a private copy
// of the scheme. NOTE TO FUTURE ME: extending a module WITHOUT bumping its
// ?v= pin left the edge serving the previous asset under the same URL — the
// pin bump is not bookkeeping, it is the cache key.
// Slate ruling #12 (2 Aug): folded into the demo overhaul, done
// CROSS-REFERENCES FIRST, PREVIEW-THEN-APPLY. Both halves live here.
//
// IT OWNS NO REFERENCE MECHANISM OF ITS OWN. rename_guard already enumerates
// every place an identifier is referenced — `_rgKinds[kind].owners()` and
// `.refs(value)` cover function ids, zone ids, item ids, failure-condition
// ids, particular-risk ids and tree page ids — and `rgApply()` already
// rewrites those slots, RE-ENUMERATING at apply time so a stale scan cannot
// produce phantom updates. Building a second enumerator here would be the §8
// disease with the highest possible stakes: two mechanisms disagreeing about
// what points at an id, while a migration rewrites the project. So this module
// PLANS and REPORTS; rename_guard remains the only thing that touches data.
//
// The preview is a PURE READ. The apply writes only by CALLING rename_guard
// (rgRenameOwner for the owner's own id, rgApply for every reference), so all
// store knowledge stays in one module. An unsafe plan is REFUSED WHOLE rather
// than applied in part: a half-renumbered project sits in a state nobody
// designed, and the collisions are precisely the rows where that bites.
//
// What the preview answers, before anybody clicks anything:
//   · for each proposed rename, HOW MANY references move and WHERE they live;
//   · which proposals are no-ops (id already correct);
//   · which name an owner that does not exist (a typo in the plan);
//   · which COLLIDE — the target id is already in use, or two sources map onto
//     one target. A collision applied blindly merges two distinct artifacts'
//     references into one id, which is unrecoverable without a backup.
//   · a stable ORDER for the apply, so a rename never lands on an id that a
//     later rename is about to vacate.
// ============================================================================
(function () {
    'use strict';

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function _kinds() {
        try { if (typeof window !== 'undefined' && window._rgKinds) return window._rgKinds; } catch (_) {}
        return null;
    }

    // Normalise a plan: accepts { old: new } or [{ from, to }, …].
    function _normalise(mapping) {
        if (Array.isArray(mapping)) {
            return mapping.filter(Boolean).map(m => ({ from: String(m.from), to: String(m.to) }));
        }
        return Object.keys(mapping || {}).map(k => ({ from: String(k), to: String(mapping[k]) }));
    }

    // renumberPreview(kind, mapping) — PURE. Never mutates, never applies.
    function renumberPreview(kind, mapping) {
        const K = _kinds();
        if (!K) return { ok: false, reason: 'rename_guard is not loaded — it owns the reference enumerators, and this preview refuses to guess at them' };
        const def = K[kind];
        if (!def) return { ok: false, reason: 'unknown identifier kind "' + kind + '" — known kinds: ' + Object.keys(K).join(', ') };

        let owners = [];
        try { owners = def.owners() || []; } catch (e) { return { ok: false, reason: 'could not enumerate owners: ' + (e && e.message) }; }
        const ownerKeys = new Set(owners.map(o => o && o.key).filter(Boolean));

        const plan = _normalise(mapping);
        const targetCount = new Map();
        plan.forEach(p => targetCount.set(p.to, (targetCount.get(p.to) || 0) + 1));
        const sources = new Set(plan.map(p => p.from));

        const entries = plan.map(p => {
            const e = { from: p.from, to: p.to, refs: 0, byWhere: {}, status: 'ok', note: '' };
            if (p.from === p.to) { e.status = 'noop'; e.note = 'already carries this id'; return e; }
            if (!ownerKeys.has(p.from)) { e.status = 'unknown-owner'; e.note = 'no ' + (def.label || kind) + ' with this id exists in the project'; return e; }
            // Collision: the target is already an owner AND is not itself being
            // vacated by this same plan; or two sources aim at one target.
            if (targetCount.get(p.to) > 1) { e.status = 'collision'; e.note = 'more than one id in this plan maps onto "' + p.to + '"'; }
            else if (ownerKeys.has(p.to) && !sources.has(p.to)) { e.status = 'collision'; e.note = '"' + p.to + '" is already in use and is not being renamed away by this plan'; }
            let slots = [];
            try { slots = def.refs(p.from) || []; } catch (err) { e.status = 'error'; e.note = 'reference scan failed: ' + (err && err.message); return e; }
            e.refs = slots.length;
            slots.forEach(s => { const w = (s && s.where) || 'unknown'; e.byWhere[w] = (e.byWhere[w] || 0) + 1; });
            return e;
        });

        // Apply ORDER: an id whose target is vacated by another rename must go
        // AFTER that one, or it lands on a live id. Sources that are nobody's
        // target go first; the rest follow in dependency order, and anything
        // left over is a CYCLE (A→B, B→A), which cannot be done by renames
        // alone and is reported rather than half-applied.
        const applicable = entries.filter(e => e.status === 'ok');
        const byFrom = new Map(applicable.map(e => [e.from, e]));
        const order = [], placed = new Set();
        let progress = true;
        while (progress) {
            progress = false;
            applicable.forEach(e => {
                if (placed.has(e.from)) return;
                const blocker = byFrom.get(e.to);          // someone still owns our target
                if (blocker && !placed.has(blocker.from)) return;
                order.push(e.from); placed.add(e.from); progress = true;
            });
        }
        const cycles = applicable.filter(e => !placed.has(e.from)).map(e => e.from);

        const totals = {
            proposed: entries.length,
            applicable: applicable.length,
            refs: entries.reduce((a, e) => a + e.refs, 0),
            noops: entries.filter(e => e.status === 'noop').length,
            unknown: entries.filter(e => e.status === 'unknown-owner').length,
            collisions: entries.filter(e => e.status === 'collision').length,
            errors: entries.filter(e => e.status === 'error').length,
            cycles: cycles.length
        };
        return {
            ok: true, kind, label: def.label || kind, entries, order, cycles, totals,
            safeToApply: totals.collisions === 0 && totals.errors === 0 && totals.cycles === 0,
            // renumberApply() walks `order`, calling rgRenameOwner then rgApply
            // per id — rename_guard re-enumerates each rename as it runs.
            applyRecipe: 'renumberApply(kind, mapping) walks .order calling rgRenameOwner + rgApply — rename_guard re-enumerates at apply time'
        };
    }

    // Human-readable preview, for a modal or the console. Read-only.
    function renumberPreviewText(kind, mapping) {
        const r = renumberPreview(kind, mapping);
        if (!r.ok) return 'REFUSED — ' + r.reason;
        const lines = [];
        lines.push('Renumber preview — ' + r.label + ' (' + r.totals.proposed + ' proposed)');
        lines.push(r.totals.applicable + ' applicable · ' + r.totals.refs + ' references would move · ' +
                   r.totals.noops + ' already correct · ' + r.totals.unknown + ' unknown · ' +
                   r.totals.collisions + ' collisions · ' + r.totals.cycles + ' in a cycle');
        lines.push(r.safeToApply ? 'SAFE TO APPLY in the order below.' : 'NOT SAFE TO APPLY — resolve the flagged rows first.');
        r.entries.forEach(e => {
            const where = Object.keys(e.byWhere).map(w => w + ' ×' + e.byWhere[w]).join(', ');
            lines.push('  ' + e.from + ' → ' + e.to + '  [' + e.status.toUpperCase() + ']' +
                       (e.refs ? '  ' + e.refs + ' refs: ' + where : '') + (e.note ? '  — ' + e.note : ''));
        });
        if (r.cycles.length) lines.push('  CYCLE: ' + r.cycles.join(', ') + ' — renames alone cannot resolve this; stage through a temporary id.');
        return lines.join('\n');
    }

    // ---- PLAN GENERATOR -----------------------------------------------------
    // The plan must NOT be hand-rolled. Proven live on HL-1: a naive
    // "<subId>-TL for every row" plan previewed 30 proposed / 17 applicable /
    // 13 COLLISIONS, because several failure conditions share a sub-function.
    // The project's own numbering engine already solves this — the `fcimMode`
    // kind mints {PARENT}-{MODE} and carries the ordinal-suffix collision guard
    // (TL → TL2 → TL3) added 2 Aug for exactly the aware/unaware pair case. So
    // this generator ASKS THE ENGINE for each target, through the same
    // `_slFillField` call the form uses, rather than reimplementing the scheme.
    //
    // Where the ids live: an FCIM row owns the cell ids (tlId / plId / mId),
    // and an AFHA row carries its FCIM condition id AS its fcId — so a plan
    // keyed on the CURRENT cell id renames the FHA owner and rename_guard
    // carries the FCIM cell and every requirement trace along with it.
    //
    // Returns { ok, mapping, rows, unmapped, extras, note }. Pure: it mints
    // into throwaway objects and touches no store.
    function renumberPlanFromScheme(opts) {
        opts = opts || {};
        const scope = opts.scope || 'ac';
        let rows = [];
        try {
            if (scope === 'ac') rows = (typeof acFcimData !== 'undefined' && Array.isArray(acFcimData)) ? acFcimData : [];
            else {
                const s = ((typeof systemsData !== 'undefined' ? systemsData : []) || []).find(x => x && ('sys-' + x.id) === scope);
                rows = (s && s.fcim) || [];
            }
        } catch (_) { rows = []; }
        if (!rows.length) return { ok: false, reason: 'no FCIM rows in scope "' + scope + '" — the FCIM owns the cell ids a renumber targets' };
        if (typeof _slFillField !== 'function') {
            return { ok: false, reason: 'the numbering engine (_slFillField) is not loaded — REFUSED rather than minting ids with a private copy of the scheme' };
        }
        const sysCtx = (scope === 'ac') ? {} : { SYS: String(scope).replace(/^sys-/, '') };

        // Targets already claimed, so the engine's collision guard can see them.
        const taken = new Set();
        rows.forEach(r => { if (!r) return; ['tlId', 'plId', 'mId'].forEach(f => { if (r[f]) taken.add(String(r[f])); }); });

        const mapping = {}, planRows = [];
        let extras = 0;
        rows.forEach(r => {
            if (!r || !r.subId) return;
            [['TL', 'tlId', 'tlDesc'], ['PL', 'plId', 'plDesc'], ['M', 'mId', 'mDesc']].forEach(([MODE, idField, descField]) => {
                const cur = r[idField];
                if (!cur) return;                                   // empty cell — nothing to renumber
                const tmp = {};                                     // throwaway: the engine fills a BLANK field
                _slFillField('fcimMode', 'x', tmp, Object.assign({ PARENT: r.subId, MODE }, sysCtx),
                             cand => cand !== cur && taken.has(cand));
                const target = tmp.x;
                if (!target) return;
                taken.delete(String(cur));                          // this id is being vacated
                taken.add(String(target));
                planRows.push({ from: String(cur), to: String(target), subId: r.subId, mode: MODE,
                                desc: String(r[descField] || '').slice(0, 60) });
                if (String(cur) !== String(target)) mapping[String(cur)] = String(target);
            });
            // Cell multiplicity (plExtra / mExtra). Counted and REPORTED rather
            // than guessed at — their id field is confirmed per project, and a
            // silently skipped extra is a condition that keeps a legacy id.
            ['plExtra', 'mExtra'].forEach(k => { if (Array.isArray(r[k])) extras += r[k].length; });
        });

        // Any FHA fcId that no FCIM cell accounts for — named, never dropped.
        const unmapped = [];
        try {
            const known = new Set(planRows.map(p => p.from));
            ((typeof acFhaData !== 'undefined' ? acFhaData : []) || []).forEach(f => {
                if (f && f.fcId && !known.has(String(f.fcId))) unmapped.push(String(f.fcId));
            });
        } catch (_) {}

        return {
            ok: true, scope, mapping, rows: planRows, extras,
            unmapped: Array.from(new Set(unmapped)),
            note: 'targets minted by the project numbering engine (fcimMode / {PARENT}-{MODE} with its ordinal collision guard)' +
                  (extras ? ' — ' + extras + ' plExtra/mExtra condition(s) present and NOT included: confirm their id field before renumbering them' : '')
        };
    }

    // Convenience: generate then preview in one call.
    function renumberPlanPreview(opts) {
        const plan = renumberPlanFromScheme(opts);
        if (!plan.ok) return plan;
        const pre = renumberPreview('fcId', plan.mapping);
        return Object.assign({}, pre, { plan });
    }

    // ---- APPLY --------------------------------------------------------------
    // Composes the two writes that already exist, in the order the preview
    // computed: rename the OWNER (rename_guard v1.5's rgRenameOwner), then
    // rewrite every REFERENCE (rgApply, which re-enumerates at apply time so it
    // sees the state this loop has produced so far). This module still writes
    // nothing itself.
    //
    // REFUSES on an unsafe plan rather than applying the safe subset: a partial
    // renumber leaves the project in a state no one designed, half on old ids
    // and half on new, and the collisions are exactly the rows where that
    // matters. `opts.dryRun` walks the whole thing and reports without writing.
    function renumberApply(kind, mapping, opts) {
        opts = opts || {};
        const pre = renumberPreview(kind, mapping);
        if (!pre.ok) return pre;
        if (!pre.safeToApply) {
            return { ok: false, reason: 'plan is not safe to apply — ' + pre.totals.collisions + ' collision(s), ' +
                     pre.totals.cycles + ' cycle(s), ' + pre.totals.errors + ' scan error(s). Resolve them, or stage a cycle through a temporary id.',
                     preview: pre };
        }
        if (!pre.totals.applicable) return { ok: true, applied: 0, refsUpdated: 0, steps: [], preview: pre, note: 'nothing to do' };
        if (opts.dryRun) return { ok: true, dryRun: true, applied: 0, refsUpdated: 0, steps: [], preview: pre };

        if (typeof window === 'undefined' || typeof window.rgRenameOwner !== 'function' || typeof window.rgApply !== 'function') {
            return { ok: false, reason: 'rename_guard v1.5+ is required (rgRenameOwner + rgApply) — this module never writes stores itself' };
        }
        try { if (typeof pushUndo === 'function') pushUndo('Renumber ' + pre.label + ' (' + pre.totals.applicable + ' ids)'); } catch (_) {}

        const byFrom = new Map(pre.entries.map(e => [e.from, e]));
        const steps = [];
        let refsUpdated = 0, applied = 0;
        for (const from of pre.order) {
            const e = byFrom.get(from);
            if (!e) continue;
            const owner = window.rgRenameOwner(kind, e.from, e.to);
            if (!owner.ok) { steps.push({ from: e.from, to: e.to, ok: false, reason: owner.reason, refs: 0 }); continue; }
            let n = 0;
            try { n = window.rgApply({ kind, from: e.from, to: e.to }) || 0; } catch (err) {
                steps.push({ from: e.from, to: e.to, ok: false, reason: 'owner renamed but reference rewrite failed: ' + (err && err.message), refs: 0 });
                continue;
            }
            refsUpdated += n; applied++;
            steps.push({ from: e.from, to: e.to, ok: true, refs: n });
        }
        try {
            const pc = (typeof projectConfig !== 'undefined' && projectConfig) ? projectConfig : null;
            if (pc) {
                pc.renumberLog = pc.renumberLog || [];
                pc.renumberLog.push({ kind, applied, refsUpdated, at: new Date().toISOString(),
                                      ids: steps.filter(s => s.ok).map(s => s.from + '→' + s.to) });
            }
        } catch (_) {}
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        return { ok: true, applied, refsUpdated, steps, preview: pre,
                 failed: steps.filter(s => !s.ok).length };
    }

    const API = { renumberPreview, renumberPreviewText, renumberApply, renumberPlanFromScheme, renumberPlanPreview };
    if (typeof window !== 'undefined') {
        window.RENUMBER = API;
        window.renumberPreview = renumberPreview;
        window.renumberPreviewText = renumberPreviewText;
        window.renumberApply = renumberApply;
        window.renumberPlanFromScheme = renumberPlanFromScheme;
        window.renumberPlanPreview = renumberPlanPreview;
    }
    if (typeof module !== 'undefined') module.exports = API;
})();
