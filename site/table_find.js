/* table_find.js: Ctrl+F (Cmd+F on a Mac) that finds every row (5 Nov 2026).
   Waqas: "we need to add control F search". Safety Lab draws only what is on screen: the big tables are paged (50 rows
   a page) and off-screen tabs are drawn on arrival, so the browser's own find sees a fraction of a long table. This
   find bar searches the tables in view in full: every row of every page, read from the same rows the page draws. It
   says how many it found ("3 of 17"), Enter goes to the next, Shift+Enter back, Esc closes; a match on another page
   turns the pager to that page, scrolls the row into view and lights the words found.
   What is searched in a row is what a person reads in it: cell text, the chosen value of a pick-list, the text in a
   box; not the row's menu, its buttons or the options of a pick-list.
   With no table in view, the browser's own find opens as usual; in the desktop app (which has none) the bar searches
   the page's text instead. Display only: it never changes the project. */
(function () {
    'use strict';
    if (typeof window === 'undefined' || window.SLFind) return;
    const SKIP = new Set(['BUTTON', 'OPTION', 'SCRIPT', 'STYLE', 'SVG', 'TEMPLATE', 'NOSCRIPT']);
    const skipEl = el => SKIP.has(el.tagName) || (el.getAttribute && (el.getAttribute('role') === 'menu' || el.getAttribute('aria-hidden') === 'true')) || (el.classList && (el.classList.contains('row-action-menu') || el.classList.contains('sl-find-skip')));
    // what a person reads in a row
    function rowText(tr) {
        let out = '';
        const walk = n => {
            if (n.nodeType === 3) { out += n.nodeValue; return; }
            if (n.nodeType !== 1) return;
            if (n.tagName === 'SELECT') { const o = n.options && n.options[n.selectedIndex]; if (o) out += ' ' + o.text + ' '; return; }
            if (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA') { if (!/^(checkbox|radio|button|submit|hidden|file)$/i.test(n.type || '')) out += ' ' + (n.value || '') + ' '; return; }
            if (skipEl(n)) return;
            for (const c of n.childNodes) walk(c);
            if (/^(TD|TH|DIV|P|BR|LI)$/.test(n.tagName)) out += ' ';
        };
        walk(tr);
        return out.replace(/\s+/g, ' ');
    }
    const visible = el => !!(el && el.offsetParent !== null && el.getClientRects().length);

    /* ---------- the sources: the tables in view ---------- */
    // a paged table registers its rows here (paginate.js pageTbody / attach)
    const reg = new Map();   // tbody -> { key, rows, rowHtml, prefix, goto(i) }  or  table -> { key, pages(), goPage(p) }
    function register(tbodyOrHost, info) { if (tbodyOrHost) reg.set(tbodyOrHost, info); }
    function tablesInView() {
        const main = document.querySelector('#main-content, main, .main-content') || document.body;
        return Array.from(main.querySelectorAll('table')).filter(t => visible(t) && t.tBodies && t.tBodies.length && !t.closest('.sl-find-bar') && !t.closest('.modal-overlay, [role="dialog"]'));
    }
    const tmpl = document.createElement('template');
    // every row of a table as text, page by page where it is paged; each entry knows how to bring its row on screen
    // the text of a paged table's rows, kept until the table is drawn again (a new rows list) or the bar is closed
    const textCache = new WeakMap();
    function rowsOf(table) {
        const tb = table.tBodies[0], src = reg.get(tb);
        if (src && Array.isArray(src.rows) && typeof src.rowHtml === 'function' && src.rows.length > 50) {
            let texts = textCache.get(src.rows);
            if (!texts || texts.length !== src.rows.length) { texts = src.rows.map((r, i) => { try { tmpl.innerHTML = src.rowHtml(r, i); const tr = tmpl.content.querySelector('tr'); return tr ? rowText(tr) : ''; } catch (_) { return ''; } }); textCache.set(src.rows, texts); }
            return texts.map((text, i) => ({ text, show: () => src.goto(i) }));
        }
        // a table paged by a pager of its own (cut sets, budgets): the pager sits just before it
        let pg = null; for (const [k, v] of reg) if (v && typeof v.goPage === 'function' && k.isConnected && k.parentNode === table.parentNode && (k.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING)) pg = v;
        if (pg && typeof pg.goPage === 'function' && pg.pages() > 1) {
            const out = [], cur = pg.page(), n = pg.pages();
            for (let p = 1; p <= n; p++) { pg.goPage(p); Array.from(table.tBodies[0].rows).forEach((tr, j) => out.push({ text: rowText(tr), show: () => { pg.goPage(p); return table.tBodies[0].rows[j]; } })); }
            pg.goPage(cur);
            return out;
        }
        return Array.from(tb.rows).filter(tr => !tr.classList.contains('sl-find-skip')).map(tr => ({ text: rowText(tr), show: () => tr }));
    }

    /* ---------- the bar ---------- */
    let bar = null, input = null, count = null, scope = null, hits = [], cur = -1, mode = 'tables', lastQ = '';
    function build() {
        bar = document.createElement('div'); bar.className = 'sl-find-bar'; bar.setAttribute('role', 'search');
        bar.innerHTML = '<input type="search" aria-label="Find in the tables" placeholder="Find in this table…" spellcheck="false"><span class="sl-find-count"></span>'
            + '<button type="button" data-f="prev" title="Previous (Shift+Enter)" aria-label="Previous match">↑</button><button type="button" data-f="next" title="Next (Enter)" aria-label="Next match">↓</button><button type="button" data-f="close" title="Close (Esc)" aria-label="Close find">×</button><div class="sl-find-scope"></div>';
        document.body.appendChild(bar);
        input = bar.querySelector('input'); count = bar.querySelector('.sl-find-count'); scope = bar.querySelector('.sl-find-scope');
        let t = null;
        input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => search(input.value), 120); });
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); if (input.value !== lastQ) search(input.value); else step(e.shiftKey ? -1 : 1); }
            else if (e.key === 'Escape') { e.preventDefault(); close(); }
        });
        bar.addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; const f = b.getAttribute('data-f'); if (f === 'close') close(); else { if (input.value !== lastQ) search(input.value); step(f === 'prev' ? -1 : 1); } input.focus(); });
    }
    function open(m) {
        mode = m || 'tables';
        if (!bar) build();
        bar.style.display = 'flex';
        input.placeholder = mode === 'page' ? 'Find on this page…' : 'Find in this table…';
        input.focus(); input.select();
        if (input.value) search(input.value);
        else { count.textContent = ''; scope.textContent = describe(); }
    }
    function close() { if (!bar) return; unmark(); for (const k of [...reg.keys()]) if (!k.isConnected) reg.delete(k); bar.style.display = 'none'; hits = []; cur = -1; lastQ = ''; }
    function describe() {
        if (mode === 'page') return 'Searching the text on this page';
        const ts = tablesInView(), n = ts.reduce((k, t) => { const s = reg.get(t.tBodies[0]); return k + (s && Array.isArray(s.rows) ? s.rows.length : t.tBodies[0].rows.length); }, 0);
        return 'Searching every row of ' + (ts.length === 1 ? 'this table' : 'the ' + ts.length + ' tables in view') + ' (' + n.toLocaleString() + ' rows), pages included';
    }

    /* ---------- searching ---------- */
    function search(q) {
        unmark(); hits = []; cur = -1; lastQ = q;
        const needle = String(q || '').trim().toLowerCase();
        if (!needle) { count.textContent = ''; scope.textContent = describe(); return; }
        if (mode === 'page') { pageSearch(needle); return; }
        for (const t of tablesInView()) for (const r of rowsOf(t)) { const text = r.text.toLowerCase(); let i = text.indexOf(needle), n = 0; while (i >= 0) { n++; i = text.indexOf(needle, i + needle.length); } if (n) hits.push({ table: t, row: r, n }); }
        const total = hits.reduce((k, h) => k + h.n, 0);
        scope.textContent = describe();
        if (!hits.length) { count.textContent = 'Not found'; count.classList.add('none'); return; }
        count.classList.remove('none');
        count.dataset.total = String(total);
        step(1);
    }
    function step(d) {
        if (!hits.length) return;
        cur = (cur + d + hits.length) % hits.length;
        const h = hits[cur], tr = h.row.show();
        unmark();
        const el = (tr && tr.nodeType === 1) ? tr : null;
        if (el) { mark(el, lastQ.trim().toLowerCase()); el.scrollIntoView({ block: 'center' }); }
        const rows = hits.length, words = Number(count.dataset.total || rows);
        count.textContent = (cur + 1) + ' of ' + rows + ' row' + (rows === 1 ? '' : 's') + (words !== rows ? ' (' + words + ' matches)' : '');
    }
    // light the words found in a row (the current row stands out)
    let marked = [];
    function mark(root, needle) {
        if (!needle) return;
        root.classList.add('sl-find-row');
        marked.push({ row: root });
        const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => { for (let p = n.parentNode; p && p !== root; p = p.parentNode) if (p.nodeType === 1 && skipEl(p)) return NodeFilter.FILTER_REJECT; return n.nodeValue.toLowerCase().indexOf(needle) >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; } });
        const nodes = []; while (tw.nextNode()) nodes.push(tw.currentNode);
        for (const n of nodes) {
            const s = n.nodeValue, low = s.toLowerCase(), frag = document.createDocumentFragment(); let at = 0, i = low.indexOf(needle);
            while (i >= 0) { if (i > at) frag.appendChild(document.createTextNode(s.slice(at, i))); const m = document.createElement('mark'); m.className = 'sl-find-hit'; m.textContent = s.slice(i, i + needle.length); frag.appendChild(m); at = i + needle.length; i = low.indexOf(needle, at); }
            if (at < s.length) frag.appendChild(document.createTextNode(s.slice(at)));
            n.parentNode.replaceChild(frag, n);
        }
    }
    function unmark() {
        document.querySelectorAll('mark.sl-find-hit').forEach(m => { const t = document.createTextNode(m.textContent); m.parentNode.replaceChild(t, m); if (t.parentNode) t.parentNode.normalize(); });
        document.querySelectorAll('.sl-find-row').forEach(r => r.classList.remove('sl-find-row'));
        marked = [];
    }
    // the desktop app has no find of its own: there the bar searches the page's text when no table is in view
    function pageSearch(needle) {
        const main = document.querySelector('#main-content, main, .main-content') || document.body, blocks = [];
        const tw = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, { acceptNode: n => { const p = n.parentNode; if (!p || p.closest('.sl-find-bar') || !visible(p)) return NodeFilter.FILTER_REJECT; return n.nodeValue.toLowerCase().indexOf(needle) >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; } });
        while (tw.nextNode()) { const b = tw.currentNode.parentNode.closest('p, li, td, th, h1, h2, h3, h4, div, span') || tw.currentNode.parentNode; if (blocks.indexOf(b) < 0) blocks.push(b); }
        hits = blocks.map(b => ({ row: { show: () => b }, n: 1 }));
        scope.textContent = describe();
        if (!hits.length) { count.textContent = 'Not found'; count.classList.add('none'); return; }
        count.classList.remove('none'); count.dataset.total = String(hits.length); step(1);
    }

    /* ---------- Ctrl+F / Cmd+F ---------- */
    const desktop = () => !!(window.slabDesktop || window.__SLAB_DESKTOP__);
    document.addEventListener('keydown', e => {
        if (!((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'f' || e.key === 'F'))) return;
        if (bar && bar.style.display !== 'none' && document.activeElement === input) { e.preventDefault(); input.select(); return; }
        if (tablesInView().length) { e.preventDefault(); open('tables'); return; }
        if (desktop()) { e.preventDefault(); open('page'); }
        // otherwise the browser's own find opens, as usual
    }, true);

    window.SLFind = { register, open, close, search, step, rowText, tablesInView, get hits() { return hits; }, get current() { return cur; } };
})();
