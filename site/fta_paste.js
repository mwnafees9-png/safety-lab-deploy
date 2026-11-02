// fta_paste.js: SLFtaPaste 1.0
//
// 1 Nov 2026 (customer checklist item 32): every paste of an event asks what it is. A pasted event is either
//   - the SAME EVENT: one failure that shows up in more than one place. It keeps its ID, every copy stays in step with
//     the others, and the calculation counts it once (a repeated event), on this tree and across trees; or
//   - an INDEPENDENT COPY: a separate failure that happens to look the same (the same part on another channel). It gets
//     new IDs and is counted on its own.
// Before today the answer was guessed: a paste inside the same tree was always the same event, a paste into another
// tree was always a copy, and the review dialog's "Same physical event" choice on a cross-tree paste did nothing (the
// IDs had already been replaced). Now nothing is placed until the engineer answers; Esc or Cancel pastes nothing.
// Paste Special adds a third answer, a common cause group (beta factor) across the copy and its source.
// A cross-tree paste still shows the allocation review afterwards (what was kept from the source tree), without the
// old mode buttons: the mode was already chosen here.
//
// On the Golden Thread an event that sits in more than one tree shows once, linked to every tree it sits in
// (sharedEvents(), read by _gtvBuildGraph).
//
// API (window.SLFtaPaste): run(special) (Paste Branch and Paste Special call it), choose(opts) (the dialog, a promise
// of { mode: 'same' | 'independent' | 'ccf', ccf: { name, beta } } or null), sharedEvents(pageIds?) (events in two or
// more trees), _setTestAnswer(answer) (tests).
(function () {
    'use strict';
    var VERSION = '1.0';
    var _testAnswer = null;

    function _pages() { try { if (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) return ftaPages; } catch (_) {} return []; }
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function _kids(n) { return (n && (n.children || n._children)) || []; }
    function _toast(m, k, ms) { try { if (typeof showToast === 'function') showToast(m, k || 'info', ms || 4200); } catch (_) {} }
    function _count(n) { var e = 0, g = 0; (function w(x) { if (!x) return; if (x.type === 'gate') g++; else e++; _kids(x).forEach(w); })(n); return { events: e, gates: g }; }

    function close() { var m = document.getElementById('sl-paste-modal'); if (m) m.remove(); }
    // the question, before anything is placed
    function choose(opts) {
        opts = opts || {};
        if (_testAnswer) { var a = _testAnswer; return Promise.resolve(a === 'cancel' ? null : (typeof a === 'string' ? { mode: a } : a)); }
        return new Promise(function (resolve) {
            close();
            var sub = opts.subtree || {}, c = _count(sub);
            var what = (sub.displayId ? sub.displayId + ' ' : '') + (sub.name || (sub.type === 'gate' ? 'branch' : 'event'));
            var size = sub.type === 'gate' ? ' (a branch with ' + c.events + ' event' + (c.events === 1 ? '' : 's') + ')' : '';
            var wrap = document.createElement('div');
            wrap.id = 'sl-paste-modal'; wrap.className = 'sl-int-modal';
            wrap.innerHTML = '<div class="sl-int-card" role="dialog" aria-modal="true" aria-labelledby="sl-paste-title">' +
                '<h3 id="sl-paste-title">Paste: same event or a copy?</h3>' +
                '<p class="sl-int-help">You are pasting <b>' + _esc(what) + '</b>' + _esc(size) + (opts.crossTree ? ' from <b>' + _esc(opts.sourceName || 'another tree') + '</b>' : '') + '.</p>' +
                '<div class="sl-paste-choices">' +
                '<button type="button" class="sl-paste-choice" data-paste-mode="same"><b>Same event</b><span>One failure that shows up in more than one place. It keeps its ID, every copy stays in step, and it is counted once.</span></button>' +
                '<button type="button" class="sl-paste-choice" data-paste-mode="independent"><b>Independent copy</b><span>A separate failure that looks the same (the same part on another channel, for example). New IDs, counted on its own.</span></button>' +
                (opts.ccf ? '<button type="button" class="sl-paste-choice" data-paste-mode="ccf"><b>Common cause group</b><span>Separate failures that can also fail together (same supplier, same lot). New IDs, joined to the source by a beta factor.</span></button>' +
                    '<div class="sl-paste-ccf" data-paste-ccf hidden><label class="sl-int-label" for="sl-paste-ccf-name">Group name</label><input id="sl-paste-ccf-name" data-paste-ccf-name type="text" placeholder="For example: BATT-LOT-2026Q1"><label class="sl-int-label" for="sl-paste-ccf-beta">Beta factor (0 to 1)</label><input id="sl-paste-ccf-beta" data-paste-ccf-beta type="number" min="0" max="1" step="0.01" value="0.1"><div class="sl-int-actions"><button type="button" class="action-btn btn-cyan" data-paste-ccf-go>Paste as a common cause group</button></div></div>' : '') +
                '</div>' +
                '<div class="sl-int-err" data-paste-err role="alert"></div>' +
                '<div class="sl-int-actions"><button type="button" class="action-btn" data-paste-cancel>Cancel</button></div>' +
                '</div>';
            document.body.appendChild(wrap);
            var done = false;
            function finish(v) { if (done) return; done = true; close(); resolve(v); }
            wrap.querySelectorAll('[data-paste-mode]').forEach(function (b) {
                b.onclick = function () {
                    var m = b.getAttribute('data-paste-mode');
                    if (m === 'ccf') { var box = wrap.querySelector('[data-paste-ccf]'); box.hidden = false; var nm = box.querySelector('[data-paste-ccf-name]'); if (nm) nm.focus(); return; }
                    finish({ mode: m });
                };
            });
            var go = wrap.querySelector('[data-paste-ccf-go]');
            if (go) go.onclick = function () {
                var name = (wrap.querySelector('[data-paste-ccf-name]').value || '').trim();
                var beta = parseFloat(wrap.querySelector('[data-paste-ccf-beta]').value);
                if (!name) { wrap.querySelector('[data-paste-err]').textContent = 'Give the common cause group a name.'; return; }
                if (!(beta >= 0 && beta <= 1)) { wrap.querySelector('[data-paste-err]').textContent = 'The beta factor is a number from 0 to 1.'; return; }
                finish({ mode: 'ccf', ccf: { name: name, beta: beta } });
            };
            wrap.querySelector('[data-paste-cancel]').onclick = function () { finish(null); };
            wrap.addEventListener('click', function (e) { if (e.target === wrap) finish(null); });
            wrap.addEventListener('keydown', function (e) { if (e.key === 'Escape') finish(null); });
            setTimeout(function () { try { wrap.querySelector('[data-paste-mode="same"]').focus(); } catch (_) {} }, 30);
        });
    }

    // where the paste goes; null (with the reason said) when it cannot go anywhere
    function _target() {
        var page = _pages().find(function (p) { return p && p.id === activeFTAPageId; });
        if (!page) { _toast('No active fault tree.', 'warning', 4000); return null; }
        if (!page.root) return { page: page, asRoot: true };
        var sel = (typeof selectedNodeData !== 'undefined') ? selectedNodeData : null;
        if (sel && sel.type === 'gate' && sel.gateType !== 'TRANSFER') {
            var gate = (typeof resolveTransferOutTarget === 'function') ? resolveTransferOutTarget(sel) : sel;
            return { page: page, gate: gate };
        }
        try { slAlert('Select a non-transfer gate to paste under, or delete the top event first to paste as the new root.', { title: 'Paste' }); } catch (_) {}
        return null;
    }

    function run(special) {
        var clip = (typeof nodeClipboard !== 'undefined') ? nodeClipboard : null;
        if (!clip) { _toast('Clipboard is empty. Copy a node first.', 'warning', 4000); return Promise.resolve(null); }
        var t = _target(); if (!t) return Promise.resolve(null);
        var crossTree = clip.sourceTreeId !== activeFTAPageId;
        return choose({ subtree: clip.subtree, crossTree: crossTree, sourceName: clip.sourcePageName || '', ccf: !!special }).then(function (ans) {
            if (!ans) return null;
            var t2 = _target(); if (!t2) return null;   // the selection could have changed while the question was open
            var same = ans.mode === 'same';
            var cloned = cloneSubtree(clip.subtree, same);
            (function post(n, depth) {
                if (!n) return;
                if (crossTree && n._pasteOrigin) { n._pasteOrigin.pastedAt = Date.now(); if (depth === 0) n._pasteOrigin.isBranchRoot = true; }
                else delete n._pasteOrigin;   // inside one tree the natural allocation is the right one
                if (ans.mode !== 'ccf') delete n._originalLogicalId;
                _kids(n).forEach(function (c) { post(c, depth + 1); });
            })(cloned, 0);
            if (t2.asRoot) { t2.page.root = cloned; t2.page.name = cloned.name || t2.page.name; try { renderFTASidebar(); } catch (_) {} }
            else { if (!t2.gate.children) t2.gate.children = []; t2.gate.children.push(cloned); }
            var msg;
            if (same) {
                // every copy of the same event carries the same values: the pasted ones take the values the event already has
                try { if (typeof propagateRepeatedEventEdit === 'function') (function sync(n) { if (!n) return; if (n.type !== 'gate') { var src = _otherCopy(n); if (src) propagateRepeatedEventEdit(src); } _kids(n).forEach(sync); })(cloned); } catch (_) {}
                msg = 'Pasted as the same event: it keeps its ID, every copy stays in step, and it is counted once.';
            } else if (ans.mode === 'ccf') {
                try { applyPasteMode_CCFGroup(cloned, ans.ccf.name, ans.ccf.beta); } catch (_) {}
                msg = 'Pasted as a common cause group "' + ans.ccf.name + '" (beta ' + ans.ccf.beta + ') with its source.';
            } else msg = 'Pasted as an independent copy: new IDs, counted on its own.';
            try { calculateAllProbabilities(); } catch (_) {}
            try { updateD3(); } catch (_) {}
            try { if (typeof selectNode === 'function') selectNode(cloned); } catch (_) {}
            try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
            _toast(msg, 'success', 4200);
            if (crossTree && typeof openPasteReviewModal === 'function') setTimeout(function () { try { openPasteReviewModal(cloned); } catch (_) {} }, 60);
            return { mode: ans.mode, node: cloned };
        });
    }
    // another copy of this event somewhere in the project (the one whose values every copy takes)
    function _otherCopy(n) {
        var lid = n.logicalId != null ? n.logicalId : n.id, hit = null;
        _pages().forEach(function (p) {
            if (hit || !p || !p.root || p.integrated) return;
            (function w(x) { if (!x || hit) return; if (x !== n && x.type !== 'gate' && String(x.logicalId != null ? x.logicalId : x.id) === String(lid)) hit = x; _kids(x).forEach(w); })(p.root);
        });
        return hit;
    }

    // events that sit in two or more trees: [{ lid, displayId, name, pages: [{ id, name }] }]
    function sharedEvents() {
        var byLid = new Map();
        _pages().forEach(function (p) {
            if (!p || !p.root || p.integrated || p.verifies) return;   // a verification tree and an integrated tree repeat their sources by design
            var seen = new Set();
            (function w(n) {
                if (!n) return;
                if (n.type !== 'gate') {
                    var lid = String(n.logicalId != null ? n.logicalId : n.id);
                    if (!seen.has(lid)) {
                        seen.add(lid);
                        var e = byLid.get(lid) || { lid: lid, displayId: n.displayId || '', name: n.name || '', pages: [] };
                        e.pages.push({ id: String(p.id), name: p.name || String(p.id) });
                        byLid.set(lid, e);
                    }
                }
                _kids(n).forEach(w);
            })(p.root);
        });
        var out = [];
        byLid.forEach(function (e) { if (e.pages.length >= 2) out.push(e); });
        return out;
    }

    function _setTestAnswer(a) { _testAnswer = a; }
    var api = { VERSION: VERSION, run: run, choose: choose, close: close, sharedEvents: sharedEvents, _setTestAnswer: _setTestAnswer };
    try { if (typeof window !== 'undefined') window.SLFtaPaste = api; } catch (_) {}
})();
