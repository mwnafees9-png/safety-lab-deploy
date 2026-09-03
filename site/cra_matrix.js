// ============================================================================
// cra_matrix.js — v1.1 — ARP-CRA: Common Resource Analysis (ARP4761A B.4.3.2).
// v1.1 (23 Aug 2026) — the independence finding RESOLVES members to systems.
// ipLedger members are node objects; comparing them raw to system ids meant
// the B.4.3.2 payoff could never fire. See _memberSystems below.
//
// The concern the clause exists for: two channels claimed independent, both
// drinking from the same bus — one RESOURCE failure quietly defeats the
// redundancy the trees are crediting. This module makes that examination
// systematic and demonstrable:
//
//   · ROWS — resource × failure mode. 'total loss' is a COMPUTED SEED per
//     resource (it cannot be forgotten, only assessed or dismissed with
//     rationale); degraded modes are authored. Same doctrine as UCA seeds.
//   · COLUMNS — the consuming SYSTEMS, COMPUTED from the Resources model
//     (resourcesData.consumedBy → sub-functions → implementing systems).
//     Who-consumes-what is not editable here; that truth lives in one place.
//   · CELLS — authored effect dispositions: assessed (effect text) or
//     dismissed (rationale REQUIRED). Honestly UNASSESSED until disposed.
//   · FINDINGS — a resource mode consumed by two or more systems that sit
//     under the SAME Independence-Principle claim (ipLedger members) is the
//     independence-defeat B.4.3.2 exists to catch. The matrix names the
//     collision and points at the claim; it never edits the tree or the
//     claim. Refusal over repair.
//   · INV-39 (advisory) — undisposed seed rows flag in the sweep while
//     resources exist. Silent when the Resources model is empty.
//
// Store: projectConfig.cra = { modes:[{resId,mode,desc}], cells:{ key:
// {status:'assessed'|'dismissed', effect?, rationale?} } } — rides
// projectConfig persistence, no new persistence sites. Display-lane
// renderers; ALL writes through the author adapter.
// ============================================================================
(function () {
    'use strict';

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function _pc() { return (typeof projectConfig !== 'undefined' && projectConfig) ? projectConfig : null; }
    function _store() {
        const pc = _pc(); if (!pc) return { modes: [], cells: {} };
        if (!pc.cra) pc.cra = { modes: [], cells: {} };
        if (!Array.isArray(pc.cra.modes)) pc.cra.modes = [];
        if (!pc.cra.cells) pc.cra.cells = {};
        return pc.cra;
    }
    const _res = () => (typeof resourcesData !== 'undefined' && resourcesData) || [];
    const _sys = () => (typeof systemsData !== 'undefined' && systemsData) || [];
    const _fha = () => (typeof acFhaData !== 'undefined' && acFhaData) || [];

    // ---- computed structure -------------------------------------------------
    // Consuming systems for a resource: consumedBy holds sub-function ids; a
    // system consumes when one of its functions traces to that sub-function.
    // Sub-functions no system implements fall back to an aircraft-level column
    // — honestly shown, never dropped.
    function consumersOf(r) {
        const subs = Array.isArray(r.consumedBy) ? r.consumedBy : [];
        const cols = new Map();
        subs.forEach(subId => {
            let hit = false;
            _sys().forEach(s => {
                if ((s.functions || []).some(fn => (Array.isArray(fn.traceIds) ? fn.traceIds : []).indexOf(subId) >= 0)) {
                    hit = true;
                    if (!cols.has(s.id)) cols.set(s.id, { colId: s.id, name: s.name || s.id, kind: 'system', subIds: [] });
                    cols.get(s.id).subIds.push(subId);
                }
            });
            if (!hit) {
                const key = 'sub:' + subId;
                if (!cols.has(key)) cols.set(key, { colId: key, name: subId + ' (aircraft level)', kind: 'sub', subIds: [subId] });
            }
        });
        return Array.from(cols.values());
    }
    // FCs fed by the consuming sub-functions (aircraft FHA, by subId).
    function fcsOf(r) {
        const subs = new Set(Array.isArray(r.consumedBy) ? r.consumedBy : []);
        return _fha().filter(f => f && subs.has(f.subId)).map(f => ({ fcId: f.fcId, severity: f.severity }));
    }
    // Rows: the computed 'total loss' seed per resource + authored modes.
    function rows() {
        const st = _store();
        const out = [];
        _res().forEach(r => {
            if (!r || !r.resId) return;
            out.push({ resId: r.resId, resName: r.name || r.resId, mode: 'total loss', seed: true, r });
            st.modes.filter(m => m && m.resId === r.resId).forEach(m =>
                out.push({ resId: r.resId, resName: r.name || r.resId, mode: m.mode, desc: m.desc || '', seed: false, r }));
        });
        return out;
    }
    const cellKey = (resId, mode, colId) => resId + '|' + mode + '|' + colId;
    function cellOf(resId, mode, colId) { return _store().cells[cellKey(resId, mode, colId)] || null; }

    // ---- the model (rows × cols × cells + tallies) --------------------------
    function model() {
        const rws = rows();
        const out = rws.map(rw => {
            const cols = consumersOf(rw.r);
            const cells = cols.map(c => {
                const cell = cellOf(rw.resId, rw.mode, c.colId);
                return { col: c, key: cellKey(rw.resId, rw.mode, c.colId),
                         status: cell ? cell.status : 'unassessed',
                         effect: (cell && cell.effect) || null, rationale: (cell && cell.rationale) || null };
            });
            return { resId: rw.resId, resName: rw.resName, mode: rw.mode, seed: rw.seed, desc: rw.desc || '',
                     cols: cols, cells: cells, fcs: fcsOf(rw.r),
                     disposed: cells.filter(x => x.status !== 'unassessed').length };
        });
        const seedOpen = out.filter(x => x.seed && x.cols.length && x.disposed < x.cols.length).length;
        return { rows: out, seedRowsOpen: seedOpen,
                 cellsTotal: out.reduce((a, x) => a + x.cols.length, 0),
                 cellsDisposed: out.reduce((a, x) => a + x.disposed, 0) };
    }

    // ---- independence findings (the payoff) ---------------------------------
    // A resource mode whose consuming systems include ≥2 MEMBERS of the same
    // Independence-Principle claim: the shared resource sits under both legs.
    // A principle member is a NODE (ipLedger gives {lid,…} with node logical
    // ids). To ask "do two members drink from this resource" we need each
    // member's SYSTEM: via the MAC leaf convention (logicalId 'macsys:<sys>'),
    // via an externalSource SYS_<rowId> link (the SFHA row's owning system),
    // or via the owning page being a system-level tree.
    function _memberSystems(p) {
        const out = new Set();
        const members = (p && (Array.isArray(p.members) ? p.members : Array.from(p.members || []))) || [];
        members.forEach(m => {
            const lid = String((m && typeof m === 'object') ? m.lid : m);
            if (_sys().some(s => s.id === lid)) { out.add(lid); return; }   // already a system id
            (typeof ftaPages !== 'undefined' && ftaPages ? ftaPages : []).forEach(page => {
                if (!page || !page.root) return;
                (function walk(n) {
                    if (!n) return;
                    if (String(n.logicalId != null ? n.logicalId : n.id) === lid) {
                        if (/^macsys:/.test(String(n.logicalId || ''))) out.add(String(n.logicalId).slice(7));
                        const es = n.externalSource;
                        if (es && es.kind === 'fha' && /^SYS_/.test(String(es.targetId || ''))) {
                            const inner = String(es.targetId).slice(4);
                            _sys().forEach(s => { if ((s.fha || []).some(r => r && String(r.internalId) === inner)) out.add(s.id); });
                        }
                        if (page.treeLevel === 'system' && page.systemId) out.add(page.systemId);
                    }
                    (n.children || []).forEach(walk);
                })(page.root);
            });
        });
        return out;
    }

    function findings() {
        const out = [];
        let ledger = [];
        try { ledger = (typeof ipLedger === 'function') ? (ipLedger(true) || []) : []; } catch (_) { ledger = []; }
        rows().forEach(rw => {
            const sysIds = consumersOf(rw.r).filter(c => c.kind === 'system').map(c => String(c.colId));
            if (sysIds.length < 2) return;
            ledger.forEach(p => {
                const memberSys = _memberSystems(p);
                const hit = sysIds.filter(id => memberSys.has(id));
                if (hit.length >= 2) out.push({
                    resId: rw.resId, mode: rw.mode, principle: p.key || '(principle)',
                    members: hit,
                    detail: rw.resId + ' · ' + rw.mode + ' touches ' + hit.join(' and ') + ' — both sit under independence claim "' + (p.key || '?') + '". A shared resource under both legs of the claim: name it, and route to the artifact that owns it.'
                });
            });
            // Even without an IP claim: ≥2 consuming systems feeding the same
            // Cat/Haz FC is worth surfacing — the pre-claim version of the same trap.
            const sevFcs = fcsOf(rw.r).filter(f => f.severity === 'Catastrophic' || f.severity === 'Hazardous');
            if (sysIds.length >= 2 && sevFcs.length)
                out.push({ resId: rw.resId, mode: rw.mode, principle: null, members: sysIds,
                    detail: rw.resId + ' · ' + rw.mode + ' is consumed by ' + sysIds.length + ' systems feeding ' + sevFcs.map(f => f.fcId).join(', ') + ' — verify the trees do not credit these paths as independent of this resource.' });
        });
        return out;
    }

    // ---- INV-39 (advisory) --------------------------------------------------
    if (typeof invRegister === 'function') {
        invRegister({ id: 'INV-39', sev: 'advisory',
            name: 'B.4.3.2 Common Resource Analysis — every resource’s total-loss seed row is disposed for every consumer',
            run: function () {
                try {
                    if (!_res().length) return { checked: 0, fails: [] };          // silent without a Resources model
                    const m = model();
                    const fails = [];
                    m.rows.filter(x => x.seed).forEach(x => x.cells.forEach(c => {
                        if (c.status === 'unassessed')
                            fails.push(x.resId + ' · total loss × ' + c.col.name + ' — UNASSESSED (B.4.3.2: the seed cannot be forgotten, only assessed or dismissed with rationale)');
                    }));
                    findings().filter(f => f.principle).forEach(f => fails.push('INDEPENDENCE: ' + f.detail));
                    return { checked: m.cellsTotal, fails: fails };
                } catch (_) { return { checked: 0, fails: [] }; }
            } });
    }

    // ---- author adapter (the ONLY writes) -----------------------------------
    const _save = () => { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} _render(); };
    const _toast = (m, t) => { try { if (typeof showToast === 'function') showToast(m, t || 'info', 4600); } catch (_) {} };
    const author = {
        assess: function (key, effect) {
            if (!(effect || '').trim()) { _toast('An assessment needs its effect statement — what happens to this consumer when the resource fails this way?', 'error'); return; }
            _store().cells[key] = { status: 'assessed', effect: String(effect).trim() };
            _save();
        },
        dismiss: function (key, rationale) {
            if (!(rationale || '').trim()) { _toast('Not dismissed — B.4.3.2 seeds are dismissed WITH rationale or not at all. A silent dismissal is a hole.', 'error'); return; }
            _store().cells[key] = { status: 'dismissed', rationale: String(rationale).trim() };
            _save();
        },
        reopen: function (key) { delete _store().cells[key]; _save(); },
        addMode: function (resId, mode, desc) {
            if (!(mode || '').trim()) { _toast('A failure mode needs a name (e.g., "degraded pressure").', 'error'); return; }
            const m = String(mode).trim().toLowerCase();
            if (m === 'total loss') { _toast('"total loss" is the computed seed — it already exists for every resource.', 'info'); return; }
            if (_store().modes.some(x => x.resId === resId && x.mode.toLowerCase() === m)) { _toast('That mode already exists for ' + resId + '.', 'error'); return; }
            _store().modes.push({ resId: resId, mode: String(mode).trim(), desc: String(desc || '').trim() });
            _save();
        },
        rmMode: function (resId, mode) {
            const st = _store();
            const keys = Object.keys(st.cells).filter(k => k.indexOf(resId + '|' + mode + '|') === 0);
            if (keys.length) { _toast('Mode "' + mode + '" carries ' + keys.length + ' disposed cell(s) — reopen those first; they are your data, not ours to drop.', 'error'); return; }
            const i = st.modes.findIndex(x => x.resId === resId && x.mode === mode);
            if (i >= 0) st.modes.splice(i, 1);
            _save();
        }
    };

    // ---- page (born-modular runtime registration, mirrors monitor_spec) -----
    function _ensurePage() {
        if (typeof document === 'undefined') return false;
        if (!document.getElementById('view-cra')) {
            const prev = document.getElementById('view-cma') || document.getElementById('view-zsa') || document.getElementById('view-pra');
            if (!prev || !prev.parentNode) return false;
            const v = document.createElement('div'); v.id = 'view-cra'; v.style.display = 'none';
            prev.parentNode.insertBefore(v, prev.nextSibling);
        }
        // 26 Aug 2026 — no rail row: CRA is a CMA tab now (prove_tabs v1.5,
        // CCA consolidation — Waqas ruled Common Resources under Common Modes;
        // a shared resource IS a common-cause candidate). View still
        // runtime-mounts above; any guarded snav-cra references below simply
        // find nothing.
        return true;
    }
    function _ask(msg, def, opts) {
        if (typeof slPrompt === 'function') return slPrompt(msg, def, opts);
        return Promise.resolve(typeof prompt === 'function' ? prompt(msg, def) : null);
    }
    function _render() {
        if (typeof document === 'undefined') return;
        const host = document.getElementById('view-cra'); if (!host) return;
        const m = model();
        const fnd = findings();
        const chip = (txt, col) => '<span class="u-mono" style="font-size:9.5px; font-weight:700; color:' + col + '; border:1px solid ' + col + '55; background:' + col + '0D; border-radius:4px; padding:1px 7px;">' + esc(txt) + '</span>';
        host.innerHTML =
            '<div class="header-with-export"><h3>Common Resource Analysis <span class="u-mono" style="font-size:10.5px; font-weight:700; color:#6D28D9; border:1px solid #6D28D955; background:#6D28D90D; border-radius:5px; padding:2px 8px; vertical-align:3px;">ARP4761A B.4.3.2</span></h3></div>' +
            '<p style="font-size:12.5px; color:var(--color-text-secondary); ">One resource failure must not quietly defeat claimed independence. Rows are resource × failure mode — “total loss” is a COMPUTED SEED per resource and cannot be forgotten, only assessed or dismissed with rationale. Columns are the consuming systems, computed from YOUR Resources model — who consumes what is not editable here; that truth lives in one place. ' + m.cellsDisposed + '/' + m.cellsTotal + ' cells disposed.</p>' +
            (!m.rows.length ? '<div style="font-size:12px; color:var(--color-text-tertiary); padding:14px;">No resources in the model yet — the matrix computes from the Resources view (Define → Resources).</div>' :
             m.rows.map(rw =>
                '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); border-radius:8px; padding:10px 14px; margin-bottom:10px;">' +
                '<div style="display:flex; justify-content:space-between; align-items:center;">' +
                '<b style="font-size:12.5px;">' + esc(rw.resName) + ' <span class="u-mono" style="font-size:10px; color:var(--color-text-tertiary);">' + esc(rw.resId) + '</span> · ' + esc(rw.mode) + '</b>' +
                '<span>' + (rw.seed ? chip('SEED', '#6D28D9') : '<button class="u-mono" style="font-size:9px; cursor:pointer; border:1px solid var(--color-border-strong); background:var(--color-surface-2); border-radius:3px; padding:1px 7px;" onclick="CRA.uiRmMode(\'' + esc(rw.resId) + '\',\'' + esc(rw.mode) + '\')">remove mode</button>') +
                ' <span class="u-mono" style="font-size:10px; color:var(--color-text-tertiary);">' + rw.disposed + '/' + rw.cols.length + ' disposed' + (rw.fcs.length ? ' · feeds ' + rw.fcs.map(f => esc(f.fcId)).join(', ') : '') + '</span></span></div>' +
                (rw.cols.length ?
                '<table class="data-table" style="width:100%; font-size:11.5px; margin-top:6px;"><thead><tr><th style="width:220px;">Consumer</th><th>Effect of ' + esc(rw.mode) + '</th><th style="width:170px;"></th></tr></thead><tbody>' +
                rw.cells.map(c =>
                    '<tr><td>' + esc(c.col.name) + (c.col.kind === 'sub' ? ' ' + chip('NO IMPLEMENTING SYSTEM', '#B7791F') : '') + '</td>' +
                    '<td>' + (c.status === 'assessed' ? chip('ASSESSED', '#1D9E75') + ' <span style="font-size:11.5px;">' + esc(c.effect) + '</span>'
                            : c.status === 'dismissed' ? chip('DISMISSED', '#8A93A6') + ' <span style="font-size:10.5px; color:var(--color-text-tertiary);" title="' + esc(c.rationale) + '">“' + esc(c.rationale) + '”</span>'
                            : chip('UNASSESSED', '#B91C1C')) + '</td>' +
                    '<td style="text-align:right; white-space:nowrap;">' +
                        '<button class="u-mono" style="font-size:9.5px; cursor:pointer; border:1px solid #1D9E7566; color:#1D9E75; background:#1D9E750D; border-radius:3px; padding:1px 7px;" onclick="CRA.uiAssess(\'' + esc(c.key) + '\')">assess</button> ' +
                        '<button class="u-mono" style="font-size:9.5px; cursor:pointer; border:1px solid var(--color-border-strong); color:var(--color-text-secondary); background:var(--color-surface-2); border-radius:3px; padding:1px 7px;" onclick="CRA.uiDismiss(\'' + esc(c.key) + '\')">dismiss</button>' +
                        (c.status !== 'unassessed' ? ' <button class="u-mono" style="font-size:9.5px; cursor:pointer; border:1px solid var(--color-border); color:var(--color-text-tertiary); background:none; border-radius:3px; padding:1px 7px;" onclick="CRA.uiReopen(\'' + esc(c.key) + '\')">reopen</button>' : '') +
                    '</td></tr>').join('') + '</tbody></table>'
                : '<div style="font-size:11px; color:var(--color-text-tertiary); margin-top:4px;">No consumers recorded for this resource in the Resources model.</div>') +
                '</div>').join('') +
             (m.rows.length ? '<div style="margin:4px 0 14px;"><button class="u-mono" style="font-size:10.5px; font-weight:700; cursor:pointer; border:1px solid #1F3A5F; color:#1F3A5F; background:#1F3A5F0D; border-radius:6px; padding:4px 12px;" onclick="CRA.uiAddMode()">+ authored failure mode</button><span style="font-size:11px; color:var(--color-text-tertiary); margin-left:10px;">e.g., “degraded pressure” — total loss is already seeded for every resource.</span></div>' : '') +
             (fnd.length ? '<div style="border:1px solid #B91C1C55; background:#B91C1C08; border-radius:8px; padding:10px 14px;">' +
                '<div style="font-weight:700; color:#B91C1C; font-size:12px;">⚑ Independence findings — ' + fnd.length + ' (routed, never auto-fixed)</div>' +
                fnd.map(f => '<div style="font-size:11.5px; margin-top:5px;">' + esc(f.detail) + '</div>').join('') +
                '<div style="font-size:10.5px; color:var(--color-text-tertiary); margin-top:6px;">The matrix names the collision and points at the claim that owns it. It never edits a tree or a principle. Refusal over repair.</div></div>'
              : (m.rows.length ? '<div style="font-size:11.5px; color:#1D9E75;">No independence collisions found across the current claims and consumers.</div>' : ''))) +
            '<div style="font-size:10.5px; color:var(--color-text-tertiary); margin-top:8px;">INV-39 (advisory) carries undisposed seed cells and independence findings into the sweep and the evidence package.</div>';
    }

    const API = { model: model, rows: rows, consumersOf: consumersOf, fcsOf: fcsOf, findings: findings, author: author, render: _render,
        uiAssess: function (key) {
            _ask('Effect on this consumer — what happens when the resource fails this way? (State the effect; ripple severity in words.)', '', { title: 'Assess B.4.3.2 cell', okText: 'Assess' })
                .then(v => { if (v != null) author.assess(key, String(v)); });
        },
        uiDismiss: function (key) {
            _ask('Dismiss — rationale REQUIRED (why is this consumer genuinely unaffected, and per what analysis?):', '', { title: 'Dismiss with rationale', okText: 'Dismiss' })
                .then(v => { if (v != null) author.dismiss(key, String(v)); });
        },
        uiReopen: function (key) { author.reopen(key); },
        uiAddMode: function () {
            _ask('Resource id + failure mode + description, separated by | (e.g., "RES-002 | degraded pressure | below placard, above zero"):', '', { title: 'Authored failure mode', okText: 'Add' })
                .then(v => {
                    if (v == null) return;
                    const p = String(v).split('|').map(x => x.trim());
                    author.addMode(p[0] || '', p[1] || '', p[2] || '');
                });
        },
        uiRmMode: function (resId, mode) { author.rmMode(resId, mode); }
    };

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        (function wrapNav() {
            if (typeof window.switchTab !== 'function' || window.switchTab._craWrapped) return;
            const orig = window.switchTab;
            const wrapped = function (tabId) {
                const r = orig.apply(this, arguments);
                try {
                    const v = document.getElementById('view-cra');
                    if (v) v.style.display = (tabId === 'cra') ? 'block' : 'none';
                    const sn = document.getElementById('snav-cra');
                    if (sn) sn.classList.toggle('snav-active', tabId === 'cra');
                    if (tabId === 'cra') _render();
                } catch (_) {}
                return r;
            };
            wrapped._craWrapped = true;
            window.switchTab = wrapped;
        })();
        (function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); })(function () {
            let tries = 30; const t = setInterval(function () { if (_ensurePage() || --tries <= 0) clearInterval(t); }, 250);
        });
    }
    if (typeof window !== 'undefined') window.CRA = API;
    if (typeof module !== 'undefined') module.exports = API;
})();
