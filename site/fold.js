// ============================================================================
// fold.js, v1.0: every list folds shut behind a header with its count; a list that only
// exists to choose one thing is a drop-down menu (14 Nov 2026).
//
// Waqas, 14 Nov 2026: "Instead of showing long lists, we should have drop down menus in both
// tools in all places". His answers: both kinds, by what the list is for; every list folds,
// however short; the main worksheet a page exists to edit stays open (it has its own pager,
// paginate.js). Word and PDF exports print every list in full: paper cannot drop down.
//
//   SLFold.list({ key, title, items, row, cols, head, tableClass, ul, page, open, note })   a folded, paged list
//   SLFold.section({ key, title, count, body, open })                 a folded block of HTML
//   SLFold.pick({ key, label, items, value, placeholder, onPick })   a drop-down to choose one
//   SLMenus: every row of tabs or filter chips inside a page is shown as one drop-down (below)
//
// A list stays open while its page redraws: what is open is kept per key for this page visit
// (never saved in the project). Turning a page inside a list redraws that list only. Printing
// opens every list first and closes them again after.
// Pure string builders plus one set of document listeners; no data is changed here.
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '1.0';
    var PAGE = 50;
    var _open = {};          // key -> true while open (this page visit only)
    var _lists = {};         // key -> { items, row, cols, page, pageSize }
    var _picks = {};         // key -> onPick
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
    function _n(x) { return Number(x).toLocaleString('en-US'); }
    function _key(k) { return String(k == null ? '' : k); }

    var CSS = '.sl-fold{margin:4px 0;}' +
        '.sl-fold>summary{cursor:pointer;font-size:12px;font-weight:600;color:var(--color-text-primary,#101216);padding:3px 0;list-style:none;display:flex;align-items:center;gap:6px;}' +
        '.sl-fold>summary::-webkit-details-marker{display:none;}' +
        '.sl-fold>summary::before{content:"";width:0;height:0;border-left:5px solid currentColor;border-top:4px solid transparent;border-bottom:4px solid transparent;transition:transform .12s;}' +
        '.sl-fold[open]>summary::before{transform:rotate(90deg);}' +
        '.sl-fold>summary:focus-visible{outline:2px solid var(--color-accent,#1A6EF2);outline-offset:2px;border-radius:3px;}' +
        '.sl-fold-body{padding:2px 0 4px 11px;}' +
        '.sl-fold-auto>summary{font-weight:inherit;}.sl-fold-n{font-size:12px;font-weight:600;}' +
        '.sl-fold-nav{display:flex;gap:6px;align-items:center;padding:4px 0;font-size:12px;color:var(--color-text-primary,#101216);}' +
        '.sl-fold-nav button,.sl-pick select{font:inherit;font-size:12px;border:1px solid var(--color-border-hair,rgba(0,0,0,.18));border-radius:6px;background:var(--color-surface-2,#F3F5F9);color:var(--color-text-primary,#101216);}' +
        '.sl-fold-nav button{height:24px;padding:0 9px;cursor:pointer;}' +
        '.sl-fold-nav button[disabled]{opacity:.4;cursor:default;}' +
        '.sl-pick{display:inline-flex;gap:6px;align-items:center;font-size:12px;color:var(--color-text-primary,#101216);}' +
        '.sl-pick select{height:26px;padding:0 6px;max-width:100%;}' +
        '.sl-pm-src{display:none!important;}' +
        '.sl-pm{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 0 10px;}' +
        '.sl-pm-l{font-size:12px;font-weight:600;color:var(--color-text-primary,#101216);text-transform:uppercase;letter-spacing:.04em;}' +
        '.sl-pm-sel{font:inherit;font-size:13px;width:auto!important;flex:0 1 auto;min-width:260px;max-width:100%;height:34px;padding:0 30px 0 10px;border:1.5px solid var(--color-text-primary,#101216);border-radius:8px;background-color:var(--color-surface,#fff);color:var(--color-text-primary,#101216);cursor:pointer;-webkit-appearance:none;appearance:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 12 12%22><path d=%22M2 4l4 4 4-4%22 fill=%22none%22 stroke=%22%23101216%22 stroke-width=%221.8%22/></svg>");background-repeat:no-repeat;background-position:right 10px center;}' +
        '.sl-pm-sel:focus-visible{outline:2px solid var(--color-accent,#1A6EF2);outline-offset:2px;}' +
        '.sl-pm-g{display:inline-flex;align-items:center;gap:6px;}' +
        '.sl-pm-total{font-size:12.5px;font-weight:600;color:var(--color-text-primary,#101216);}' +
        '.sl-pm a{font-size:12px;margin-left:auto;}' +
        '.sl-pm-switch{display:inline-flex!important;gap:0!important;border:1.5px solid var(--color-text-primary,#101216);border-radius:8px;overflow:hidden;padding:0!important;flex-wrap:nowrap!important;}' +
        '.sl-pm-switch>button,.sl-pm-switch>[role=tab],.sl-pm-switch>[role=button],.sl-pm-switch>.ar-filter-chip,.sl-pm-switch>.filter-chip{border:0!important;border-radius:0!important;margin:0!important;padding:6px 14px!important;font-weight:600!important;background:var(--color-surface,#fff)!important;color:var(--color-text-primary,#101216)!important;box-shadow:none!important;}' +
        '.sl-pm-switch>*+button,.sl-pm-switch>*+.ar-filter-chip,.sl-pm-switch>*+.filter-chip,.sl-pm-switch>*+[role=tab]{border-left:1.5px solid var(--color-text-primary,#101216)!important;}' +
        '.sl-pm-switch>.active,.sl-pm-switch>.on,.sl-pm-switch>[aria-selected=true],.sl-pm-switch>[aria-pressed=true]{background:var(--color-text-primary,#101216)!important;color:var(--color-surface,#fff)!important;}' +
        '.sl-pm-switch>.prove-tabbar-lbl,.sl-pm-switch>.ar-filter-label{padding:6px 10px;font-weight:600;}';
    function _style() {
        if (typeof document === 'undefined' || document.getElementById('sl-fold-css')) return;
        var st = document.createElement('style'); st.id = 'sl-fold-css'; st.textContent = CSS;
        (document.head || document.documentElement).appendChild(st);
    }

    // ---- a folded block ----------------------------------------------------------------------
    // section({ key, title, count, body, open }): count is shown in brackets when given; open: true
    // opens it the first time it is drawn (afterwards the person's own choice is kept)
    function section(o) {
        _style();
        var k = _key(o.key);
        if (o.open && !_open.hasOwnProperty(k)) _open[k] = true;
        var isOpen = _open[k] === true;
        var head = _esc(o.title) + (o.count != null ? ' (' + _n(o.count) + ')' : '');
        return '<details class="sl-fold" data-fold="' + _esc(k) + '"' + (isOpen ? ' open' : '') + '><summary>' + head + '</summary><div class="sl-fold-body">' + (o.body || '') + '</div></details>';
    }

    // ---- a folded, paged list ----------------------------------------------------------------
    // list({ key, title, items, row(item, index) -> html, cols, page, open, empty, note })
    //   cols: the list is table rows (row returns <tr>); the page bar is then a row of its own
    //   empty: what to say when there is nothing (drawn without a fold); null draws nothing
    //   note: a line drawn inside the fold above the rows
    function list(o) {
        var k = _key(o.key), items = o.items || [];
        if (!items.length) return o.empty == null ? '' : '<div style="font-size:12px;color:var(--color-text-primary,#101216);">' + o.empty + '</div>';
        var old = _lists[k];
        _lists[k] = { items: items, row: o.row, cols: o.cols || 0, pageSize: o.page || PAGE, page: old && old.n === items.length ? old.page : 0, n: items.length, table: o.table || null };
        var inner = _pageHtml(k);
        var body = (o.note ? '<div style="font-size:12px;margin-bottom:4px;">' + o.note + '</div>' : '') +
            (o.cols ? '<table' + (o.tableClass ? ' class="' + _esc(o.tableClass) + '"' : '') + ' style="' + (o.table || 'width:100%;border-collapse:collapse;font-size:12px;') + '">' + (o.head || '') + '<tbody data-fold-list="' + _esc(k) + '">' + inner + '</tbody></table>'
                : o.ul ? '<ul style="margin:2px 0 0;padding-left:18px" data-fold-list="' + _esc(k) + '">' + inner + '</ul>'
                : '<div data-fold-list="' + _esc(k) + '">' + inner + '</div>');
        return section({ key: k, title: o.title, count: items.length, body: body, open: o.open });
    }
    function _pageHtml(k) {
        var L = _lists[k]; if (!L) return '';
        var size = L.pageSize, pages = Math.max(1, Math.ceil(L.items.length / size));
        if (L.page >= pages) L.page = pages - 1; if (L.page < 0) L.page = 0;
        var a = L.page * size, rows = '';
        for (var i = a; i < Math.min(a + size, L.items.length); i++) rows += L.row(L.items[i], i);
        if (pages <= 1) return rows;
        var nav = '<span>' + _n(a + 1) + ' to ' + _n(Math.min(a + size, L.items.length)) + ' of ' + _n(L.items.length) + '</span>' +
            '<button type="button" data-fold-page="' + _esc(k) + '" data-dir="-1"' + (L.page === 0 ? ' disabled' : '') + '>Previous</button>' +
            '<button type="button" data-fold-page="' + _esc(k) + '" data-dir="1"' + (L.page >= pages - 1 ? ' disabled' : '') + '>Next</button>';
        return rows + (L.cols ? '<tr data-fold-nav><td colspan="' + L.cols + '"><div class="sl-fold-nav">' + nav + '</div></td></tr>' : '<div class="sl-fold-nav" data-fold-nav>' + nav + '</div>');
    }
    function turn(k, dir) {
        var L = _lists[k]; if (!L) return false;
        L.page += dir;
        if (typeof document === 'undefined') { _pageHtml(k); return true; }
        var el = document.querySelector('[data-fold-list="' + (root.CSS && root.CSS.escape ? root.CSS.escape(k) : k) + '"]');
        if (el) el.innerHTML = _pageHtml(k);
        return true;
    }

    // ---- a drop-down to choose one -------------------------------------------------------------
    // pick({ key, label, items: [{ value, label }], value, placeholder, onPick(value) })
    function pick(o) {
        _style();
        var k = _key(o.key); if (typeof o.onPick === 'function') _picks[k] = o.onPick;
        var items = o.items || [], v = o.value == null ? '' : String(o.value);
        var opts = (o.placeholder != null ? '<option value=""' + (v === '' ? ' selected' : '') + '>' + _esc(o.placeholder) + '</option>' : '') +
            items.map(function (it) { var val = String(it.value); return '<option value="' + _esc(val) + '"' + (val === v ? ' selected' : '') + '>' + _esc(it.label != null ? it.label : val) + '</option>'; }).join('');
        return '<label class="sl-pick">' + (o.label ? '<span>' + _esc(o.label) + ' (' + _n(items.length) + ')</span>' : '') + '<select data-fold-pick="' + _esc(k) + '">' + opts + '</select></label>';
    }

    // ---- the document listeners ----------------------------------------------------------------
    var _printOpened = [];
    function _wire() {
        if (typeof document === 'undefined' || root.__slFoldWired) return;
        root.__slFoldWired = true;
        // toggle does not bubble: listen on the way down
        document.addEventListener('toggle', function (e) { var d = e.target; if (d && d.classList && d.classList.contains('sl-fold')) { var k = d.getAttribute('data-fold'); if (d.open) _open[k] = true; else _open[k] = false; } }, true);
        document.addEventListener('click', function (e) { var b = e.target && e.target.closest && e.target.closest('[data-fold-page]'); if (!b) return; e.preventDefault(); e.stopPropagation(); turn(b.getAttribute('data-fold-page'), +b.getAttribute('data-dir')); }, true);
        document.addEventListener('change', function (e) { var s = e.target; if (!s || !s.getAttribute) return; var k = s.getAttribute('data-fold-pick'); if (k == null || !_picks[k]) return; try { _picks[k](s.value, s); } catch (err) { try { console.warn('drop-down', k, err); } catch (_) {} } });
        // printing: every list open, then back as it was
        root.addEventListener && root.addEventListener('beforeprint', function () { _printOpened = []; document.querySelectorAll('details.sl-fold:not([open])').forEach(function (d) { d.open = true; _printOpened.push(d); }); });
        root.addEventListener && root.addEventListener('afterprint', function () { _printOpened.forEach(function (d) { d.open = false; }); _printOpened = []; });
    }
    _wire();


    // ---- rows of tabs and filter chips become drop-downs (14 Nov 2026) --------------------------------
    // Waqas, of a wall of chips and a row of tabs: "anything that shows like this in both apps should be a drop down
    // list". His answers: every row of tabs or chips inside a page; the tool's own navigation (the left menu, the area
    // bar) stays; a row of two or three choices is a switch, kept as buttons and made more prominent. Each row is drawn
    // by its own page as before; a watcher shows it as one drop-down after it (each option is a choice's words, or its
    // tip when the tip says more; the row's label is the menu's label; links in the row stay beside the menu). Picking
    // an option clicks that choice, so every page keeps its own handling. The row stays in the page, hidden.
    var ROWS = '[role="tablist"], .prove-tabbar, .mk-phase-tabs, .hfr-tabs, .ar-filter-bar, #backref-tabs, #trace-filter-bar, .sys-workspace-nav, .scv-tabs, #vv-status-controls, .vv-set-chips, .pra-tabs';
    var SKIP = '#sl-areabar, .sl-areabar, #sidebar, nav, .sl-pm';
    var ITEM = 'button, [role="tab"], [role="button"], .ar-filter-chip, .filter-chip';
    function _items(row) { return Array.prototype.filter.call(row.querySelectorAll(ITEM), function (b) { return !b.closest('.sl-pm') && b.closest(ROWS) === row && !b.matches('a'); }); }
    function _words(b) {
        var t = String(b.innerText || b.textContent || '').split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean).join(', ').replace(/\s+/g, ' ');
        var tip = String(b.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
        return tip.length > t.length && t && tip.toLowerCase().indexOf(t.split(' ')[0].toLowerCase()) >= 0 ? tip : t;
    }
    function _on(b) { return b.classList.contains('active') || b.classList.contains('on') || b.getAttribute('aria-selected') === 'true' || b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-checked') === 'true'; }
    // the groups in a row: a label (a short text that is not a choice, for example "Scope" or "Status") starts a new
    // group; a label marked data-sl-pm-sub (for example "Unmapped") is a heading inside the group it is in
    function _groups(row, items) {
        var groups = [], cur = null, isItem = function (el) { return items.indexOf(el) >= 0; };
        var walk = Array.prototype.slice.call(row.children);
        var direct = items.every(function (b) { return b.parentNode === row; });
        if (!direct) return [{ label: '', parts: [{ label: '', items: items }] }];
        walk.forEach(function (el) {
            if (isItem(el)) { if (!cur) { cur = { label: '', parts: [{ label: '', items: [] }] }; groups.push(cur); } cur.parts[cur.parts.length - 1].items.push(el); return; }
            if (el.matches('a, .sl-pm') || el.querySelector(ITEM)) return;
            var t = String(el.textContent || '').replace(/[:\s]+$/, '').trim(); if (!t || t.length > 40) return;
            if (el.hasAttribute('data-sl-pm-sub') && cur) { cur.parts.push({ label: t, items: [] }); return; }
            cur = { label: t, parts: [{ label: '', items: [] }] }; groups.push(cur);
        });
        return groups.filter(function (g) { return g.parts.some(function (p) { return p.items.length; }); });
    }
    function menuize(row) {
        if (!row || !row.isConnected || !row.parentNode || row.closest(SKIP)) return;
        var old = row.__slPm; if (old && old.parentNode) old.parentNode.removeChild(old); row.__slPm = null;
        row.classList.remove('sl-pm-src'); row.classList.remove('sl-pm-switch');
        var items = _items(row); if (!items.length) return;
        var groups = _groups(row, items);
        if (groups.length <= 1 && items.length <= 3) { row.classList.add('sl-pm-switch'); return; }
        _style();
        var acc = 0, open = 0, html = '';
        groups.forEach(function (g, gi) {
            var mine = []; g.parts.forEach(function (p) { mine = mine.concat(p.items); });
            var label = g.label || (gi === 0 ? (row.getAttribute('aria-label') || '') : '');
            var any = mine.some(_on);
            var opt = function (b) {
                var w = _words(b), m = w.match(/(\d[\d,]*) to accept/), o = w.match(/(\d[\d,]*) open\b/);
                if (m) acc += +m[1].replace(/,/g, ''); if (o) open += +o[1].replace(/,/g, '');
                return '<option value="' + items.indexOf(b) + '"' + (_on(b) ? ' selected' : '') + (b.disabled ? ' disabled' : '') + '>' + _esc(w) + '</option>';
            };
            var body = g.parts.map(function (p) { var h = p.items.map(opt).join(''); return p.label ? '<optgroup label="' + _esc(p.label) + '">' + h + '</optgroup>' : h; }).join('');
            html += '<span class="sl-pm-g">' + (label ? '<span class="sl-pm-l">' + _esc(label) + '</span>' : '') + '<select class="sl-pm-sel" aria-label="' + _esc(label || 'Choose') + '">' + (any ? '' : '<option value="" selected>Choose…</option>') + body + '</select></span>';
        });
        var total = [acc ? _n(acc) + ' to accept in all' : '', open ? _n(open) + ' open in all' : ''].filter(Boolean).join(', ');
        var box = document.createElement('div');
        box.className = 'sl-pm';
        box.innerHTML = html + (total ? '<span class="sl-pm-total">' + _esc(total) + '</span>' : '');
        Array.prototype.forEach.call(box.querySelectorAll('select'), function (sel) { sel.addEventListener('change', function (e) { var b = items[+e.target.value]; if (b) b.click(); }); });
        // links in the row (for example "Open the CAD model") stay on screen, beside the menu
        Array.prototype.forEach.call(row.querySelectorAll('a'), function (a) { var c = a.cloneNode(true); c.addEventListener('click', function (e) { e.preventDefault(); a.click(); }); box.appendChild(c); });
        row.classList.add('sl-pm-src');
        row.parentNode.insertBefore(box, row.nextSibling);   // after the row, so a row a page keeps first stays first
        row.__slPm = box;
    }
    var _pend = [], _tick = null;
    function _queue(row) { if (_pend.indexOf(row) < 0) _pend.push(row); if (!_tick) _tick = (root.requestAnimationFrame || setTimeout)(function () { _tick = null; var L = _pend; _pend = []; L.forEach(menuize); }); }
    function _scan(n) {
        if (!n || n.nodeType !== 1) return;
        if (n.closest && n.closest('.sl-pm')) return;
        var r = n.closest ? n.closest(ROWS) : null; if (r) { _queue(r); return; }
        if (n.querySelectorAll) Array.prototype.forEach.call(n.querySelectorAll(ROWS), _queue);
    }
    function _wireMenus() {
        if (typeof document === 'undefined' || typeof MutationObserver === 'undefined' || root.__slMenusWired) return;
        root.__slMenusWired = true;
        var start = function () {
            _scan(document.body);
            new MutationObserver(function (ms) { ms.forEach(function (m) {
                // a change inside a row (its choices redrawn, or which one is chosen) redraws its menu; the menu's own
                // changes, and the row's own class (hidden or a switch, set here), never do
                var t = m.target; if (!t || t.nodeType !== 1 || (t.closest && t.closest('.sl-pm'))) return;
                if (m.type === 'attributes') { if (t.matches && t.matches(ROWS)) return; var r = t.closest(ROWS); if (r) _queue(r); return; }
                var r2 = t.closest ? t.closest(ROWS) : null; if (r2) _queue(r2);
                Array.prototype.forEach.call(m.addedNodes, _scan);
            }); })
                .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-selected', 'aria-pressed'] });
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    }
    _wireMenus();
    root.SLMenus = { VERSION: VERSION, ROWS: ROWS, menuize: menuize };


    // ---- every titled list in a page folds (14 Nov 2026) ----------------------------------------------------
    // The lists the pages draw themselves: a heading followed by a table or a list folds shut behind that heading and
    // its count (the heading moves into the fold's header, so it reads the same); a table of more than 50 rows pages
    // inside. Not folded, on purpose (Waqas's answers): the main worksheet of a page (its first data-table, or a
    // table with its own pager or with fields to fill in), reports and plans drawn as documents, and anything already
    // folded. The page's own code is untouched: the watcher works on what it drew.
    var DOCS = '.sl-fold, .sl-pm, details, .ccr-doc, .ccr-tabdoc, [data-pladoc], .pla-doc, .pra-rep, #report-gen-modal, [contenteditable="true"], svg, .slp-bar, nav, #sidebar, .modal-overlay';
    var _seq = 0;
    function _rowsOf(L) {
        if (L.tagName === 'UL' || L.tagName === 'OL') return Array.prototype.filter.call(L.children, function (c) { return c.tagName === 'LI'; });
        var t = L.tagName === 'TABLE' ? L : L.querySelector(':scope > table');
        if (!t) return null;
        var body = t.tBodies && t.tBodies.length ? t.tBodies[0] : t;
        return Array.prototype.filter.call(body.rows || [], function (r) { return !r.closest('thead') && !r.querySelector('th:only-child') && r.cells.length; });
    }
    function _isList(L) {
        if (!L || L.nodeType !== 1) return false;
        if (L.tagName === 'UL' || L.tagName === 'OL' || L.tagName === 'TABLE') return true;
        return L.tagName === 'DIV' && L.children.length === 1 && L.children[0].tagName === 'TABLE';
    }
    function _isWorksheet(L) {
        var t = L.tagName === 'TABLE' ? L : L.querySelector('table'); if (!t) return false;
        if (t.hasAttribute('data-sl-worksheet')) return true;
        if (t.querySelector('input:not([type=checkbox]), select, textarea')) return true;
        var nx = L.nextElementSibling; if (nx && (nx.classList.contains('slp-bar') || nx.querySelector && nx.querySelector(':scope > .slp-bar'))) return true;
        // the page's main table: Safety Lab draws its worksheets as table.data-table; the first one of a page is its worksheet
        var view = L.closest('[id^="view-"]'); if (view && t.classList.contains('data-table')) { var first = view.querySelector('table.data-table'); if (first === t) return true; }
        return false;
    }
    // the title of a list: the short line of text right above it (a heading, a bold line, a caption); a long
    // paragraph above a list is a description, not a title, and that list is left as it is
    var TITLE_TAGS = { H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, DIV: 1, P: 1, B: 1, STRONG: 1, SPAN: 1, LABEL: 1 };
    function _titleOf(L) {
        var T = L.previousElementSibling;
        if (!T || !TITLE_TAGS[T.tagName] || T.closest(DOCS)) return null;
        if (T.querySelector('table, ul, ol, details, svg, img')) return null;
        // a header with its own buttons: the fold is titled by its words, and the header, buttons and all, stays at
        // the top of the opened list
        if (T.querySelector('input, select, textarea')) return null;   // a form above a table is not its title
        var t = _words2(T);
        return t && t.length <= (/^H[2-6]$/.test(T.tagName) || /head|(^|[ -])[a-z]*-h(\b|$)/.test(T.className || '') ? 160 : 80) ? T : null;
    }
    function _words2(T) { var c = T.cloneNode(true); Array.prototype.forEach.call(c.querySelectorAll('button, select, input, textarea, [onclick]'), function (x) { x.parentNode.removeChild(x); }); return String(c.textContent || '').replace(/\s+/g, ' ').trim(); }
    function autoFold(L) {
        if (!L || L.__slAuto || !L.isConnected || L.closest(DOCS) || L.closest(SKIP) || !_isList(L) || _isWorksheet(L)) return;
        var H = _titleOf(L); if (!H || H.__slAuto) return;
        var rows = _rowsOf(L); if (!rows || !rows.length) return;
        L.__slAuto = H.__slAuto = true;
        var view = H.closest('[id^="view-"], [role="dialog"], .modal');
        var words = _words2(H), live = !!H.querySelector('button, select, input, [onclick]');
        var key = 'auto|' + (view && view.id ? view.id : 'page') + '|' + words.replace(/\s*\(\d[\d,]*\)\s*$/, '');
        _style();
        var d = document.createElement('details');
        d.className = 'sl-fold sl-fold-auto'; d.setAttribute('data-fold', key);
        if (_open[key] === true) d.open = true;
        var sm = document.createElement('summary');
        var hasCount = /\(\d[\d,]*\)\s*$/.test(words);
        H.parentNode.insertBefore(d, H);
        if (live) { var w = document.createElement('span'); w.textContent = words; sm.appendChild(w); } else { sm.appendChild(H); H.style.display = 'inline'; H.style.margin = '0'; }
        if (!hasCount) { var c = document.createElement('span'); c.className = 'sl-fold-n'; c.textContent = ' (' + _n(rows.length) + ')'; sm.appendChild(c); }
        d.appendChild(sm);
        var b = document.createElement('div'); b.className = 'sl-fold-body'; d.appendChild(b); if (live) b.appendChild(H); b.appendChild(L);
        if (rows.length > PAGE) _domPager(b, rows, key);
    }
    function _domPager(box, rows, key) {
        var page = 0, pages = Math.ceil(rows.length / PAGE);
        var nav = document.createElement('div'); nav.className = 'sl-fold-nav';
        var draw = function () {
            rows.forEach(function (r, i) { r.style.display = (i >= page * PAGE && i < (page + 1) * PAGE) ? '' : 'none'; });
            nav.innerHTML = '<span>' + _n(page * PAGE + 1) + ' to ' + _n(Math.min((page + 1) * PAGE, rows.length)) + ' of ' + _n(rows.length) + '</span><button type="button" data-d="-1"' + (page === 0 ? ' disabled' : '') + '>Previous</button><button type="button" data-d="1"' + (page >= pages - 1 ? ' disabled' : '') + '>Next</button>';
        };
        nav.addEventListener('click', function (e) { var bt = e.target.closest('button[data-d]'); if (!bt) return; e.preventDefault(); e.stopPropagation(); page = Math.max(0, Math.min(pages - 1, page + +bt.getAttribute('data-d'))); draw(); });
        box.appendChild(nav); draw();
    }
    var LISTS = 'table, ul, ol, div > table:only-child';
    function _autoScan(n) {
        if (!n || n.nodeType !== 1 || (n.closest && n.closest('.sl-fold'))) return;
        var cand = function (L) { if (L.tagName === 'TABLE' && L.parentNode && L.parentNode.tagName === 'DIV' && L.parentNode.children.length === 1 && !_titleOf(L)) autoFold(L.parentNode); else autoFold(L); };
        if (n.matches && n.matches('table, ul, ol')) cand(n);
        if (n.querySelectorAll) Array.prototype.forEach.call(n.querySelectorAll('table, ul, ol'), cand);
    }
    var _apend = [], _atick = null;
    function _aqueue(n) { _apend.push(n); if (!_atick) _atick = (root.requestAnimationFrame || setTimeout)(function () { _atick = null; var L = _apend; _apend = []; L.forEach(_autoScan); }); }
    function _wireAuto() {
        if (typeof document === 'undefined' || typeof MutationObserver === 'undefined' || root.__slAutoWired) return;
        root.__slAutoWired = true;
        var start = function () { _aqueue(document.body); new MutationObserver(function (ms) { ms.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (x) { if (x.nodeType === 1 && !(x.closest && x.closest('.sl-fold-auto'))) _aqueue(x); }); }); }).observe(document.body, { childList: true, subtree: true }); };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    }
    _wireAuto();
    root.SLAutoFold = { autoFold: autoFold };

    root.SLFold = { VERSION: VERSION, PAGE: PAGE, list: list, section: section, pick: pick, turn: turn, isOpen: function (k) { return _open[_key(k)] === true; }, setOpen: function (k, v) { _open[_key(k)] = !!v; }, _pageHtml: _pageHtml };
})(typeof window !== 'undefined' ? window : globalThis);
