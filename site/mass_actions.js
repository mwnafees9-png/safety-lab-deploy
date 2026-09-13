// 13 Sep 2026 (R19 step 2): every fire-and-forget promise chain in this file now ends in .catch → SLErrorWatch.report(e, module), so a failure is recorded and told to the person instead of dying in the console.
// ============================================================================
// mass_actions.js — v0.6 — MASS ACTIONS FOR TABULATED ANALYSES (beta demand).
//
// One shared module, not fifteen table hacks: a selection layer that rides on
// top of the existing worksheet tables and routes EVERY write through each
// worksheet's own helpers, so validation, cascades (obsolescence, soft-delete
// history), autosave and re-render fire exactly as if the user had acted row
// by row. The module owns selection UI only.
//
// v0.1 targets (registry is data — adding a lane is five lines):
//   · AFHA  (ac-fha-body)  — batch delete via deleteACFHA
//   · SFHA  (sys-fha-body) — batch delete via deleteSysFHA
//   · Requirements (ac-req-body) — batch soft-delete via deleteACReq
//   (v0.6: batch DELETE is the product — bulk edit/export were cut on
//    Waqas's call: severity is a per-FC judgment, not a sweep.)
//
// DOCTRINE:
//   · Bulk delete is gated by a TYPED confirm ("DELETE") — one gate for the
//     batch; the per-row confirm() prompts are suppressed ONLY inside the
//     batch loop and restored in a finally. One decision, N executions.
//   · Guards refuse with NAMES, never silently: an FHA row wired to a fault
//     tree, or a requirement already in the Deleted bin, is SKIPPED and the
//     summary toast says which and why ("11 deleted · 2 refused: FC-021 has
//     a linked fault tree…").
//   · Computed tables (UCA seeds, HFA items) are deliberately NOT targets:
//     their rows aren't stored data.
//   · Selection state is UI memory — never persisted, cleared on project ops.
//
// Mechanics: rows are identified by parsing the delete-handler id out of the
// actions cell (every table builds it via rowActionsHTML), and a
// MutationObserver re-injects checkboxes after any re-render or page flip —
// selection survives pagination because it keys on internalId, not DOM.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    // NO EVAL, EVER: the live worker's CSP has no 'unsafe-eval', so an eval-based
    // global resolver silently returns nothing in production while passing local
    // QA (whose server sends no CSP). Learned live, 20 Jul 2026. Classic scripts
    // see the global lexical bindings directly — resolve them by name, explicitly.
    const GLOBALS = {
        acFhaData:      function () { return (typeof acFhaData      !== 'undefined') ? acFhaData      : undefined; },
        acReqData:      function () { return (typeof acReqData      !== 'undefined') ? acReqData      : undefined; },
        systemsData:    function () { return (typeof systemsData    !== 'undefined') ? systemsData    : undefined; },
        activeSystemId: function () { return (typeof activeSystemId !== 'undefined') ? activeSystemId : undefined; },
        ftaPages:       function () { return (typeof ftaPages       !== 'undefined') ? ftaPages       : undefined; }
    };
    function _g(name) { const f = GLOBALS[name]; return f ? f() : undefined; }
    function _fn(name) { const f = (typeof window !== 'undefined') ? window[name] : undefined; return (typeof f === 'function') ? f : null; }

    // ------------------------------------------------------------ the registry
    // guardDelete(row) → string reason to REFUSE, or null to allow.
    function _fhaLinkedTree(row) {
        const pages = _g('ftaPages') || [];
        const bare = x => String(x == null ? '' : x).replace(/^(AC_|SYS_)/, '');
        const mine = [String(row.internalId), String(row.fcId || '')];
        const linked = pages.some(p => {
            const ids = (Array.isArray(p.linkedFhaIds) ? p.linkedFhaIds : []).concat(p.linkedFhaId != null ? [p.linkedFhaId] : []);
            return ids.map(bare).some(id => mine.indexOf(id) >= 0);
        });
        return linked ? ((row.fcId || row.internalId) + ' has a linked fault tree — unlink or delete the tree first') : null;
    }
    const TARGETS = [
        {
            key: 'acFha', label: 'Aircraft FHA', tbodyId: 'ac-fha-body',
            store: () => _g('acFhaData') || [],
            deleteFn: 'deleteACFHA', renderFn: 'renderACFHA',
            guardDelete: _fhaLinkedTree
        },
        {
            key: 'sysFha', label: 'System FHA', tbodyId: 'sys-fha-body',
            store: () => { const ss = _g('systemsData') || []; const id = _g('activeSystemId');
                           const s = ss.find(x => x && x.id === id); return (s && s.fha) || []; },
            deleteFn: 'deleteSysFHA', renderFn: 'renderSysFHA',
            guardDelete: _fhaLinkedTree
        },
        {
            key: 'acReq', label: 'Requirements', tbodyId: 'ac-req-body',
            store: () => _g('acReqData') || [],
            deleteFn: 'deleteACReq', renderFn: 'renderACReq',
            guardDelete: row => row.deleted ? ((row.traceId || row.internalId) + ' is already in the Deleted bin') : null
        }
    ];
    const _byTbody = {}; TARGETS.forEach(t => { _byTbody[t.tbodyId] = t; });

    // ------------------------------------------------------------ selection
    // sel[targetKey] = Set of internalIds (strings). UI memory only.
    const sel = {}; TARGETS.forEach(t => { sel[t.key] = new Set(); });
    let _lastTick = {};   // per-target last-clicked id for shift-range

    function _rowId(tr, t) {
        const cell = tr.cells && tr.cells[0]; if (!cell) return null;
        const btn = cell.querySelector('[onclick*="' + t.deleteFn + '("]');
        if (!btn) return null;
        const m = (btn.getAttribute('onclick') || '').match(new RegExp(t.deleteFn + "\\('([^']+)'\\)"));
        return m ? m[1] : null;
    }

    function augment(t) {
        const tbody = document.getElementById(t.tbodyId);
        if (!tbody) return;
        Array.prototype.forEach.call(tbody.rows, tr => {
            const id = _rowId(tr, t);
            if (!id) return;
            const cell = tr.cells[0];
            // side-by-side: checkbox and the row's kebab share one flex line
            let wrap = cell.querySelector('.ma-wrap');
            if (!wrap) {
                wrap = document.createElement('div');
                wrap.className = 'ma-wrap';
                wrap.style.cssText = 'display:flex; align-items:center; gap:7px;';
                while (cell.firstChild) wrap.appendChild(cell.firstChild);
                cell.appendChild(wrap);
            }
            // the kebab's Delete is redundant once mass actions exist here — hide it
            // (display only: the button still carries the row id that _rowId parses)
            const delBtn = cell.querySelector('[onclick*="' + t.deleteFn + '("]');
            if (delBtn && !delBtn._maHidden) { delBtn._maHidden = true; delBtn.style.display = 'none'; }
            let cb = wrap.querySelector('.ma-cb');
            if (!cb) {
                wrap.insertAdjacentHTML('afterbegin',
                    '<input type="checkbox" class="ma-cb" data-ma-id="' + _esc(id) + '" title="Select for mass actions" ' +
                    'style="margin:0; flex:0 0 auto; width:15px; height:15px; cursor:pointer; accent-color:#1D9E75;">');
                cb = wrap.querySelector('.ma-cb');
                cb.addEventListener('click', ev => _tick(t, id, cb, ev));
            }
            cb.checked = sel[t.key].has(id);
        });
        _headerCb(t, tbody);
        _bar();
    }
    // select-all lives in the ACTIONS header cell: checked = whole page selected,
    // indeterminate = partial. Toggling selects/clears the visible page.
    function _headerCb(t, tbody) {
        const table = tbody.closest('table'); if (!table) return;
        const th = table.querySelector('thead th'); if (!th) return;
        let hc = th.querySelector('.ma-cb-all');
        if (!hc) {
            // same flex treatment as the rows: checkbox and the ACTIONS label
            // share one centered line
            let hwrap = th.querySelector('.ma-hwrap');
            if (!hwrap) {
                hwrap = document.createElement('div');
                hwrap.className = 'ma-hwrap';
                hwrap.style.cssText = 'display:flex; align-items:center; gap:7px;';
                while (th.firstChild) hwrap.appendChild(th.firstChild);
                th.appendChild(hwrap);
            }
            hwrap.insertAdjacentHTML('afterbegin',
                '<input type="checkbox" class="ma-cb-all" title="Select all rows on this page" ' +
                'style="margin:0; flex:0 0 auto; width:15px; height:15px; cursor:pointer; accent-color:#1D9E75;">');
            hc = th.querySelector('.ma-cb-all');
            hc.addEventListener('change', () => {
                const vis = _visibleIds(t);
                if (hc.checked) vis.forEach(id => sel[t.key].add(id));
                else vis.forEach(id => sel[t.key].delete(id));
                augment(t);
            });
        }
        const vis = _visibleIds(t);
        const selVis = vis.filter(id => sel[t.key].has(id));
        hc.checked = vis.length > 0 && selVis.length === vis.length;
        hc.indeterminate = selVis.length > 0 && selVis.length < vis.length;
    }

    function _visibleIds(t) {
        const tbody = document.getElementById(t.tbodyId);
        if (!tbody) return [];
        return Array.prototype.map.call(tbody.querySelectorAll('.ma-cb'), c => c.getAttribute('data-ma-id'));
    }
    function _tick(t, id, cb, ev) {
        if (ev && ev.shiftKey && _lastTick[t.key]) {
            const vis = _visibleIds(t);
            const a = vis.indexOf(_lastTick[t.key]), b = vis.indexOf(id);
            if (a >= 0 && b >= 0) {
                vis.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(x => { cb.checked ? sel[t.key].add(x) : sel[t.key].delete(x); });
            }
        } else {
            cb.checked ? sel[t.key].add(id) : sel[t.key].delete(id);
        }
        _lastTick[t.key] = id;
        augment(t);
    }

    // ---------------------------------------------------------- the action bar
    function _activeTarget() {
        for (const t of TARGETS) if (sel[t.key].size) return t;
        return null;
    }
    function _bar() {
        let bar = document.getElementById('ma-bar');
        const t = _activeTarget();
        if (!t) { if (bar) bar.remove(); return; }
        const n = sel[t.key].size;
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'ma-bar';
            bar.style.cssText = 'position:fixed; left:50%; bottom:22px; transform:translateX(-50%); z-index:1600;' +
                'background:var(--color-surface-1, #fff); border:1px solid var(--color-border-strong, #999); box-shadow:0 8px 28px rgba(0,0,0,0.22);' +
                'padding:8px 14px; display:flex; align-items:center; gap:10px; font-size:12.5px;' +
                'flex-wrap:nowrap; white-space:nowrap; max-width:96vw; overflow-x:auto;';
            document.body.appendChild(bar);
        }
        bar.innerHTML =
            '<b class="u-mono" style="font-size:12px; white-space:nowrap; flex:0 0 auto;">' + n + ' selected</b>' +
            '<span style="color:var(--color-text-tertiary, #888); font-size:11px; white-space:nowrap; flex:0 0 auto;">· ' + _esc(t.label) + '</span>' +
            '<button onclick="MASS_ACTIONS.selectAllVisible()" style="' + _btn() + '">Select page</button>' +
            '<button onclick="MASS_ACTIONS.bulkDelete()" style="' + _btn() + ' color:#B91C1C; border-color:#B91C1C99;">Delete…</button>' +
            '<button onclick="MASS_ACTIONS.clear()" style="' + _btn() + '">Clear</button>';
    }
    function _btn() { return 'font:inherit; font-size:11.5px; font-weight:600; padding:4px 10px; margin:0; cursor:pointer; background:var(--color-surface-2, #f5f5f5); border:1px solid var(--color-border-strong, #999); color:inherit; white-space:nowrap; flex:0 0 auto; align-self:center;'; }
    function _in() { return 'font:inherit; font-size:11.5px; padding:4px 6px; margin:0; background:var(--color-surface-2, #f5f5f5); border:1px solid var(--color-border-strong, #999); color:inherit; white-space:nowrap; flex:0 0 auto; align-self:center; height:27px;'; }

    function _toast(msg, type, ms) { try { if (typeof showToast === 'function') showToast(msg, type || 'info', ms || 5200); } catch (_) {} }
    function _saveRender(t) {
        try { const r = _fn(t.renderFn); if (r) r(); } catch (_) {}
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        augment(t);
    }

    // ------------------------------------------------------------- operations
    const API = {
        selectAllVisible: function () {
            const t = _activeTarget(); if (!t) return;
            _visibleIds(t).forEach(id => sel[t.key].add(id));
            augment(t);
        },
        clear: function () {
            TARGETS.forEach(t => sel[t.key].clear());
            document.querySelectorAll('.ma-cb').forEach(c => { c.checked = false; });
            _bar();
        },
        bulkDelete: function () {
            const t = _activeTarget(); if (!t) return;
            const ids = Array.from(sel[t.key]);
            const del = _fn(t.deleteFn);
            if (!del) { _toast('Delete helper unavailable for ' + t.label + '.', 'error'); return; }
            const ask = (typeof slPrompt === 'function') ? slPrompt : (m => Promise.resolve(typeof prompt === 'function' ? prompt(m) : null));
            Promise.resolve(ask('Mass delete — ' + ids.length + ' ' + t.label + ' row' + (ids.length === 1 ? '' : 's') + ' selected.\n\nType DELETE to proceed. Rows with downstream links are refused by name, never silently dropped.', '', { title: 'Mass delete', okText: 'Delete selected' }))
                .then(v => {
                    if (String(v).trim() !== 'DELETE') { _toast('Nothing deleted — the typed gate is the point.', 'info', 3600); return; }
                    const rows = t.store();
                    const refused = [];
                    let done = 0;
                    // ONE typed gate for the batch: per-row confirm() prompts are
                    // suppressed strictly inside this loop and restored in finally.
                    const _confirm = window.confirm;
                    try {
                        window.confirm = function () { return true; };
                        ids.forEach(id => {
                            const row = rows.find(r => r && String(r.internalId) === String(id));
                            if (!row) { refused.push(id + ': not found (already gone?)'); return; }
                            const why = t.guardDelete ? t.guardDelete(row) : null;
                            if (why) { refused.push(why); return; }
                            try { del(row.internalId); done++; sel[t.key].delete(id); } catch (e) { refused.push((row.fcId || row.traceId || id) + ': ' + e.message); }
                        });
                    } finally {
                        window.confirm = _confirm;
                    }
                    _saveRender(t);
                    _toast(done + ' deleted' + (refused.length ? ' · ' + refused.length + ' refused: ' + refused.slice(0, 3).join(' · ') + (refused.length > 3 ? ' …' : '') : '.'),
                           refused.length ? 'info' : 'success', 8000);
                }).catch(function (e) { if (window.SLErrorWatch) SLErrorWatch.report(e, 'mass_actions'); });
        },
        _augmentAll: function () { TARGETS.forEach(augment); },
        TARGETS: TARGETS, _sel: sel
    };

    // ------------------------------------------------------------------ wiring
    function _wire() {
        if (typeof document === 'undefined') return;
        TARGETS.forEach(t => {
            const tbody = document.getElementById(t.tbodyId);
            if (!tbody || tbody._maObserved) return;
            tbody._maObserved = true;
            new MutationObserver(() => augment(t)).observe(tbody, { childList: true });
            augment(t);
        });
    }
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(_wire, 400));
        else setTimeout(_wire, 400);
        // tabs render lazily — re-check after every tab switch (moat pattern)
        (function wrap() {
            if (typeof window.switchTab === 'function' && !window.switchTab._maWrapped) {
                const orig = window.switchTab;
                const wrapped = function (tabId) { const r = orig.apply(this, arguments); try { setTimeout(_wire, 300); } catch (_) {} return r; };
                wrapped._maWrapped = true;
                window.switchTab = wrapped;
            } else if (typeof window.addEventListener === 'function') {
                window.addEventListener('DOMContentLoaded', () => setTimeout(wrap, 600));
            }
        })();
    }

    if (typeof window !== 'undefined') window.MASS_ACTIONS = API;
    if (typeof module !== 'undefined') module.exports = API;
})();
