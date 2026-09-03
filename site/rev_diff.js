// ============================================================================
// rev_diff.js — v1.0 — DIF-1: revision diff — git-diff for safety models.
//
// A DER reviewing a resubmission re-reads the whole document; this shows the
// DELTA between two sealed states instead — with both endpoints already
// cryptographically verifiable (canonical sha256 + replay cards, ASR-1).
// Review the change, not the document.
//
// What is diffed (by stable identity, never by position):
//   · fault-tree pages added/removed; per shared page, nodes added/removed and
//     field changes (name, gate type, λ, probability, DAL, event class);
//   · FHA rows (aircraft + every system) — severity/classification changes;
//   · requirements (aircraft + systems) — added/removed/text changed;
//   · assumptions — state transitions (Proposed → Validated → Verified);
//   · replay-card deltas — which pages' engine P(top) moved, old → new.
//
// Display lane only: reads two snapshots, writes nothing, recommends nothing.
// Changes are NAMED with before/after values — judgment stays with the
// engineer. Exports window.SLDiff { compare, diffAgainstCurrent, open }.
// BORN MODULAR: new file; the Version History rows gain a "Δ Diff" action.
// ============================================================================
(function () {
    'use strict';

    const CAP = 40;   // rows shown per category; full counts always stated

    function _esc(s) { if (typeof esc === 'function') return esc(s); return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _fmt(v) { return (typeof v === 'number' && isFinite(v)) ? v.toExponential(3) : String(v == null ? '—' : v); }

    // ---- tree walk: index nodes by stable id --------------------------------
    function _index(root) {
        const m = new Map();
        (function walk(n) { if (!n) return; m.set(String(n.id), n); (n.children || []).forEach(walk); })(root);
        return m;
    }
    const NODE_FIELDS = ['name', 'gateType', 'lambda', 'probability', 'dal', 'eventClass', 'ccfGroup', 'beta'];

    function _diffTrees(pA, pB, out) {
        const a = _index(pA && pA.root), b = _index(pB && pB.root);
        a.forEach((n, id) => { if (!b.has(id)) out.nodes.push({ kind: 'removed', page: pA.name || pA.id, what: (n.displayId || n.type || 'node') + ' "' + (n.name || '') + '"' }); });
        b.forEach((n, id) => {
            if (!a.has(id)) { out.nodes.push({ kind: 'added', page: pB.name || pB.id, what: (n.displayId || n.type || 'node') + ' "' + (n.name || '') + '"' }); return; }
            const o = a.get(id);
            NODE_FIELDS.forEach(f => {
                const ov = o[f], nv = n[f];
                if (ov !== nv && !(ov == null && nv == null)) out.nodes.push({ kind: 'changed', page: pB.name || pB.id, what: (n.displayId || id) + ' ' + f + ': ' + _fmt(ov) + ' → ' + _fmt(nv) });
            });
        });
    }

    function _rows(snap, pick) { try { return pick(snap) || []; } catch (_) { return []; } }
    function _byId(arr, key) { const m = new Map(); (arr || []).forEach(r => { if (r && r[key] != null) m.set(String(r[key]), r); }); return m; }

    function _diffList(aArr, bArr, key, label, fields, out) {
        const a = _byId(aArr, key), b = _byId(bArr, key);
        a.forEach((r, id) => { if (!b.has(id)) out.push({ kind: 'removed', what: label + ' ' + id }); });
        b.forEach((r, id) => {
            if (!a.has(id)) { out.push({ kind: 'added', what: label + ' ' + id }); return; }
            const o = a.get(id);
            fields.forEach(f => { if (String(o[f] == null ? '' : o[f]) !== String(r[f] == null ? '' : r[f])) out.push({ kind: 'changed', what: label + ' ' + id + ' ' + f + ': "' + String(o[f] == null ? '—' : o[f]).slice(0, 40) + '" → "' + String(r[f] == null ? '—' : r[f]).slice(0, 40) + '"' }); });
        });
    }

    // ---- the diff --------------------------------------------------------------
    // compare(snapA, snapB) → structured delta. A = older/base, B = newer.
    function compare(snapA, snapB) {
        const out = { pages: [], nodes: [], fha: [], req: [], asm: [], replay: [], total: 0 };
        const pA = _byId((snapA && snapA.ftaPages) || [], 'id'), pB = _byId((snapB && snapB.ftaPages) || [], 'id');
        pA.forEach((p, id) => { if (!pB.has(id)) out.pages.push({ kind: 'removed', what: 'page "' + (p.name || id) + '"' }); });
        pB.forEach((p, id) => { if (!pA.has(id)) out.pages.push({ kind: 'added', what: 'page "' + (p.name || id) + '"' }); else _diffTrees(pA.get(id), p, out); });
        const fhaOf = s => [...((s.acFhaData) || []), ...(((s.systemsData) || []).flatMap(x => x.fha || []))];
        _diffList(fhaOf(snapA), fhaOf(snapB), 'id', 'FC', ['severity', 'classification', 'condition', 'name'], out.fha);
        const reqOf = s => [...((s.acReqData) || []), ...(((s.systemsData) || []).flatMap(x => x.req || []))];
        _diffList(reqOf(snapA), reqOf(snapB), 'reqId', 'REQ', ['text', 'dal', 'verStatus', 'valStatus'], out.req);
        const asmOf = s => [...((s.acAssumptionsData) || []), ...(((s.systemsData) || []).flatMap(x => x.asm || []))];
        _diffList(asmOf(snapA), asmOf(snapB), 'asmId', 'ASM', ['state', 'text'], out.asm);
        // replay-card deltas — the engine lane said the number moved
        const cA = (snapA && snapA.projectConfig && snapA.projectConfig.replayCard && snapA.projectConfig.replayCard.pages) || {};
        const cB = (snapB && snapB.projectConfig && snapB.projectConfig.replayCard && snapB.projectConfig.replayCard.pages) || {};
        Object.keys(cB).forEach(id => {
            if (id in cA && cA[id] !== cB[id]) {
                const name = (pB.get(id) && pB.get(id).name) || id;
                out.replay.push({ kind: 'changed', what: 'P(top) "' + name + '": ' + _fmt(cA[id]) + ' → ' + _fmt(cB[id]) });
            }
        });
        out.total = out.pages.length + out.nodes.length + out.fha.length + out.req.length + out.asm.length + out.replay.length;
        return out;
    }

    function _currentSnapshot() { return (typeof _buildProjectSnapshot === 'function') ? _buildProjectSnapshot() : null; }

    async function diffAgainstCurrent(revisionId) {
        const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
        if (!client || !revisionId) return { error: 'not signed in' };
        const { data, error } = await client.from('project_baselines').select('data, version_no, label').eq('id', revisionId).maybeSingle();
        if (error || !data || !data.data) return { error: (error && error.message) || 'revision has no data' };
        const cur = _currentSnapshot();
        if (!cur) return { error: 'snapshot builder unavailable' };
        return { base: 'Rev ' + data.version_no + (data.label ? ' (' + data.label + ')' : ''), delta: compare(data.data, cur) };
    }

    // ---- render ------------------------------------------------------------------
    function _section(title, rows) {
        if (!rows.length) return '';
        const icon = k => k === 'added' ? '＋' : (k === 'removed' ? '−' : '±');
        const color = k => k === 'added' ? '#1B7F4B' : (k === 'removed' ? '#C0392B' : '#B34700');
        return '<div style="margin-top:12px;"><b style="font-size:12.5px;">' + _esc(title) + ' (' + rows.length + ')</b>' +
            rows.slice(0, CAP).map(r => '<div style="font-size:11.5px; padding:2px 0 2px 10px; font-family:var(--font-mono,monospace);"><span style="color:' + color(r.kind) + '; font-weight:700;">' + icon(r.kind) + '</span> ' + _esc((r.page ? '[' + r.page + '] ' : '') + r.what) + '</div>').join('') +
            (rows.length > CAP ? '<div style="font-size:10.5px; color:var(--color-text-tertiary,#7C8698); padding-left:10px;">… ' + (rows.length - CAP) + ' more (export for the full list)</div>' : '') + '</div>';
    }
    function close() { const m = document.getElementById('diff-modal'); if (m) m.remove(); }
    function _render(baseLabel, delta) {
        close();
        const wrap = document.createElement('div');
        wrap.id = 'diff-modal';
        wrap.style.cssText = 'position:fixed; inset:0; z-index:99960; background:rgba(10,20,40,0.45); display:flex; align-items:center; justify-content:center;';
        wrap.innerHTML = '<div style="max-width:640px; width:94%; max-height:84vh; overflow:auto; background:var(--color-surface-1,#fff); color:var(--color-text-primary,#16213A); border:1px solid var(--color-border-strong,#B9C2D0); border-radius:8px; box-shadow:0 18px 60px rgba(10,20,40,0.4); padding:18px 20px;">' +
            '<div style="display:flex; align-items:baseline; gap:10px;"><b style="font-size:15px;">Δ ' + _esc(baseLabel) + ' → working copy</b>' +
            '<span class="u-mono" style="margin-left:auto; font-size:11px; color:var(--color-text-tertiary,#7C8698);">' + delta.total + ' change(s)</span></div>' +
            '<p style="font-size:11.5px; color:var(--color-text-secondary,#4A5568); margin:6px 0 2px;">Identity-matched delta — both endpoints carry canonical hashes and replay cards (verify via ⟲). The tool names changes; judgment stays with you.</p>' +
            (delta.total === 0 ? '<p style="font-size:12.5px; margin-top:12px;">No differences — the working copy matches this revision.</p>' :
                _section('Fault-tree pages', delta.pages) + _section('Tree nodes', delta.nodes) + _section('Failure conditions', delta.fha) +
                _section('Requirements', delta.req) + _section('Assumptions', delta.asm) + _section('Engine P(top) deltas (replay cards)', delta.replay)) +
            '<div style="display:flex; margin-top:14px;"><button id="diff-close" class="ckpt-m-btn" style="margin-left:auto; font-size:11.5px; padding:4px 14px;">Close</button></div></div>';
        document.body.appendChild(wrap);
        wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
        wrap.querySelector('#diff-close').addEventListener('click', close);
    }
    async function open(revisionId) {
        const r = await diffAgainstCurrent(revisionId);
        if (r.error) { try { if (typeof showToast === 'function') showToast('Diff failed: ' + r.error, 'warning', 5000); } catch (_) {} return; }
        _render(r.base, r.delta);
    }
    window._revDiffOpen = open;

    // ------------------------------------------------------------- exports
    const api = { compare, diffAgainstCurrent, open, close, CAP };
    if (typeof window !== 'undefined') window.SLDiff = api;
    if (typeof globalThis !== 'undefined') globalThis.SLDiff = api;
})();
