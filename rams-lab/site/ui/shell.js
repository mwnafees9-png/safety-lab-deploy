// ui/shell.js — sidebar, router, page host. Consumes the registry; knows no
// module by name. Renders the ink-on-paper chrome and hands modules a ctx.
import { registry } from '../core/registry.js';
import { store } from '../core/store.js';
import { bus } from '../core/bus.js';

export const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const TRAIN_MARK = `
<svg width="44" height="30" viewBox="0 0 44 30" xmlns="http://www.w3.org/2000/svg" aria-label="RAMS Lab">
  <path fill="#fff" d="M4 4 h26 c5 0 9 3.5 11 9 l1.5 5 h-38.5 z"/>
  <rect x="7" y="8" width="6" height="6" fill="#0B0B0C"/>
  <rect x="16" y="8" width="6" height="6" fill="#0B0B0C"/>
  <path d="M25 8 h5.5 c2.6 0 4.8 2.2 6 6 H25 z" fill="#0B0B0C"/>
  <rect x="4" y="20" width="38" height="3" fill="#fff"/>
  <rect x="1" y="26" width="42" height="2.5" fill="#fff"/>
</svg>`;

let activeId = null;
let rootEl = null;
let spineRef = null;

function ctx() {
    return {
        state: store.state,
        spine: spineRef,
        update: (fn, ev) => store.update(fn, ev),
        id: p => store.id(p),
        nid: () => store.nid(),
        bus,
        esc,
        go: id => navigate(id),
        stamp(text, color, tint) {
            return '<span class="stamp" style="color:' + color + ';' + (tint === false ? '' : 'background:' + color + '1A;') + '">' + esc(text) + '</span>';
        },
    };
}

function renderNav() {
    const nav = rootEl.querySelector('#rl-nav');
    nav.innerHTML = registry.sections().map(sec =>
        '<div class="nav-sec">' + esc(sec.name) + '</div>' +
        sec.items.map(m =>
            '<a href="#' + esc(m.id) + '" class="' + (m.id === activeId ? 'on' : '') + '" data-mod="' + esc(m.id) + '">' + esc(m.title) + '</a>'
        ).join('')
    ).join('');
    nav.querySelectorAll('a[data-mod]').forEach(a => {
        a.onclick = e => { e.preventDefault(); navigate(a.getAttribute('data-mod')); };
    });
}

function renderPage() {
    const host = rootEl.querySelector('#rl-page');
    const mod = registry.get(activeId) || registry.all()[0];
    if (!mod) { host.innerHTML = '<p>No modules registered.</p>'; return; }
    activeId = mod.id;
    host.innerHTML = '';
    try { mod.render(host, ctx()); }
    catch (e) {
        console.error('[shell] render failed:', mod.id, e);
        host.innerHTML = '<div class="note">Module "' + esc(mod.id) + '" failed to render: ' + esc(e.message) + '</div>';
    }
}

export function navigate(id) {
    activeId = id;
    try { location.hash = id; } catch (_) {}
    renderNav();
    renderPage();
}

export const shell = {
    mount(body, opts) {
        spineRef = opts.spine;
        store.load();
        rootEl = document.createElement('div');
        rootEl.innerHTML =
            '<aside class="sidebar">' +
            '  <div class="brand"><div class="logo-row">' + TRAIN_MARK +
            '    <span class="wordmark">' + esc(spineRef.productName) + '</span></div>' +
            '    <span class="mono tagline">' + esc(spineRef.tagline) + '</span></div>' +
            '  <div class="nav" id="rl-nav"></div>' +
            '  <div class="side-foot mono">SAFETY LAB PLATFORM · VERTICAL 2</div>' +
            '</aside>' +
            '<main class="main"><div id="rl-page"></div></main>';
        body.appendChild(rootEl);
        const initial = (location.hash || '').slice(1);
        activeId = registry.get(initial) ? initial : (registry.all()[0] || {}).id;
        renderNav();
        renderPage();
        bus.on('state:changed', () => renderPage());
        bus.on('state:replaced', () => renderPage());
        window.addEventListener('hashchange', () => {
            const id = location.hash.slice(1);
            if (registry.get(id) && id !== activeId) navigate(id);
        });
    },
};
