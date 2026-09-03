// ============================================================================
// trade_study.js — v1.0 — TRD-1: trade-study mode (SLTrade).
//
// F1 race engineers overlay two laps; safety engineers argue architecture A
// vs B with hand-built spreadsheets. This puts the engine in the meeting:
// pick two fault-tree pages (candidate architectures for the same failure
// condition, e.g. fc_variants pages) and every number on both sides is
// computed live — P(top) exact, structure counts, minimal cut sets, the
// dominant contributor by importance — with deltas NAMED, never judged.
//
// Two-lane discipline: the tool computes both candidates and states the
// differences; choosing is engineering judgment and stays with the engineer.
// Refusals are honest: a side whose cut sets exceed the enumeration budget
// says so rather than showing a truncated count.
//
// Display lane only — reads trees, writes nothing. BORN MODULAR: new file;
// injects "⚖ Trade study" into the FTA toolbar next to importance heat.
// Exports window.SLTrade { evaluate, open, close }.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) { if (typeof esc === 'function') return esc(s); return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _fmt(v) { return (typeof v === 'number' && isFinite(v)) ? v.toExponential(3) : '—'; }
    function _count(root, pred) { let n = 0; (function w(x) { if (!x) return; if (pred(x)) n++; (x.children || []).forEach(w); })(root); return n; }

    // ---- engine-lane evaluation of one candidate page -------------------------
    function evaluate(page) {
        const out = { id: page && page.id, name: (page && (page.name || page.id)) || '—', events: 0, gates: 0, pTop: null, mcs: null, mcsNote: '', topContributor: null, refusal: null };
        try {
            if (!page || !page.root) { out.refusal = 'no tree'; return out; }
            out.events = _count(page.root, n => n.type === 'basic' || n.type === 'undeveloped');
            out.gates = _count(page.root, n => n.type === 'gate');
            const copy = () => JSON.parse(JSON.stringify(page.root));
            try {
                const r = computeExactProbability(copy());
                out.pTop = (r && typeof r === 'object' && 'prob' in r) ? r.prob : r;
            } catch (e) { out.refusal = (e && e.name) || 'engine error'; }
            try {
                const cuts = (typeof getCutsets === 'function') ? getCutsets(copy()) : null;
                out.mcs = Array.isArray(cuts) ? cuts.length : null;
            } catch (e) { out.mcsNote = /Explosion/.test((e && e.name) || '') ? 'refused (enumeration budget) — P(top) stays exact' : 'unavailable'; }
            try {
                const imp = (typeof computeImportanceMeasures === 'function') ? computeImportanceMeasures(copy()) : null;
                if (imp && imp.measures && imp.measures.length) {
                    const top = imp.measures.slice().sort((a, b) => (b.fv || 0) - (a.fv || 0))[0];
                    out.topContributor = { id: top.node && (top.node.displayId || top.node.logicalId), fv: top.fv || 0 };
                }
            } catch (_) {}
        } catch (e) { out.refusal = e.message; }
        return out;
    }

    // ---- render -----------------------------------------------------------------
    function close() { const m = document.getElementById('trd-modal'); if (m) m.remove(); }
    function _row(label, a, b, delta) {
        return '<tr><td style="padding:5px 8px; font-size:11.5px; color:var(--color-text-secondary,#4A5568);">' + _esc(label) + '</td>' +
            '<td style="padding:5px 8px; font-size:12px; font-family:var(--font-mono,monospace);">' + a + '</td>' +
            '<td style="padding:5px 8px; font-size:12px; font-family:var(--font-mono,monospace);">' + b + '</td>' +
            '<td style="padding:5px 8px; font-size:11px; color:var(--color-text-tertiary,#7C8698);">' + (delta || '') + '</td></tr>';
    }
    function _compareHtml(A, B) {
        let pd = '';
        if (typeof A.pTop === 'number' && typeof B.pTop === 'number' && A.pTop > 0 && B.pTop > 0) {
            const ratio = B.pTop / A.pTop;
            pd = ratio === 1 ? 'identical' : ('B is ' + (ratio > 1 ? (ratio).toPrecision(3) + '× higher' : (1 / ratio).toPrecision(3) + '× lower'));
        }
        return '<table style="width:100%; border-collapse:collapse; margin-top:10px;">' +
            '<tr><td></td><td style="padding:5px 8px; font-weight:700; font-size:12px;">A — ' + _esc(A.name) + '</td><td style="padding:5px 8px; font-weight:700; font-size:12px;">B — ' + _esc(B.name) + '</td><td style="padding:5px 8px; font-size:11px; color:var(--color-text-tertiary,#7C8698);">Δ</td></tr>' +
            _row('P(top) — exact', _fmt(A.pTop) + (A.refusal ? ' (' + _esc(A.refusal) + ')' : ''), _fmt(B.pTop) + (B.refusal ? ' (' + _esc(B.refusal) + ')' : ''), pd) +
            _row('Basic events', A.events, B.events, (B.events - A.events >= 0 ? '+' : '') + (B.events - A.events)) +
            _row('Gates', A.gates, B.gates, (B.gates - A.gates >= 0 ? '+' : '') + (B.gates - A.gates)) +
            _row('Minimal cut sets', A.mcs != null ? A.mcs : _esc(A.mcsNote || '—'), B.mcs != null ? B.mcs : _esc(B.mcsNote || '—'), '') +
            _row('Dominant contributor (FV)', A.topContributor ? _esc(A.topContributor.id) + ' · ' + _fmt(A.topContributor.fv) : '—', B.topContributor ? _esc(B.topContributor.id) + ' · ' + _fmt(B.topContributor.fv) : '—', '') +
            '</table>';
    }
    function open() {
        close();
        const pages = ((typeof ftaPages !== 'undefined' ? ftaPages : []) || []).filter(p => p && p.root);
        if (pages.length < 2) { try { if (typeof showToast === 'function') showToast('Trade study needs at least two fault-tree pages.', 'info', 4000); } catch (_) {} return; }
        const wrap = document.createElement('div');
        wrap.id = 'trd-modal';
        wrap.style.cssText = 'position:fixed; inset:0; z-index:99960; background:rgba(10,20,40,0.45); display:flex; align-items:center; justify-content:center;';
        const opts = sel => pages.map(p => '<option value="' + _esc(p.id) + '"' + (p.id === sel ? ' selected' : '') + '>' + _esc(p.name || p.id) + '</option>').join('');
        const curId = (typeof activeFTAPageId !== 'undefined' && activeFTAPageId) || pages[0].id;
        const otherId = (pages.find(p => p.id !== curId) || pages[0]).id;
        wrap.innerHTML = '<div style="width:94%; max-height:84vh; overflow:auto; background:var(--color-surface-1,#fff); color:var(--color-text-primary,#16213A); border:1px solid var(--color-border-strong,#B9C2D0); border-radius:8px; box-shadow:0 18px 60px rgba(10,20,40,0.4); padding:18px 20px;">' +
            '<b style="font-size:15px;">⚖ Trade study — two candidates, engine-computed</b>' +
            '<p style="font-size:11.5px; color:var(--color-text-secondary,#4A5568); margin:6px 0 10px;">Every number on both sides is computed live by the deterministic engine. The tool states the differences; the choice is yours.</p>' +
            '<div style="display:flex; gap:10px; align-items:center;"><label style="font-size:11.5px;">A: <select id="trd-a">' + opts(curId) + '</select></label>' +
            '<label style="font-size:11.5px;">B: <select id="trd-b">' + opts(otherId) + '</select></label>' +
            '<button id="trd-run" class="ckpt-m-btn ckpt-m-btn-primary" style="margin-left:auto; font-size:11.5px; padding:4px 14px;">Compare</button></div>' +
            '<div id="trd-out"></div>' +
            '<div style="display:flex; margin-top:14px;"><button id="trd-close" class="ckpt-m-btn" style="margin-left:auto; font-size:11.5px; padding:4px 14px;">Close</button></div></div>';
        document.body.appendChild(wrap);
        const run = () => {
            const a = pages.find(p => p.id === wrap.querySelector('#trd-a').value);
            const b = pages.find(p => p.id === wrap.querySelector('#trd-b').value);
            wrap.querySelector('#trd-out').innerHTML = _compareHtml(evaluate(a), evaluate(b));
        };
        wrap.querySelector('#trd-run').addEventListener('click', run);
        wrap.querySelector('#trd-close').addEventListener('click', close);
        wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
        run();
    }

    // ---- toolbar injection --------------------------------------------------------
    function _inject() {
        if (document.getElementById('btn-trade-study')) return true;
        const anchor = document.getElementById('btn-importance-heat') || document.getElementById('btn-allocate-dal');
        if (!anchor || !anchor.parentNode) return false;
        const b = document.createElement('button');
        b.id = 'btn-trade-study';
        b.type = 'button';
        b.title = 'Compare two candidate architectures side by side — P(top), structure, cut sets, dominant contributor — every number computed live by the engine. The tool states differences; the choice stays yours.';
        b.textContent = '⚖ Trade study';
        b.addEventListener('click', open);
        anchor.parentNode.insertBefore(b, anchor.nextSibling);
        return true;
    }
    function _ready(fn) { if (typeof document === 'undefined') return; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
    _ready(function () { let tries = 30; const t = setInterval(function () { if (_inject() || --tries <= 0) clearInterval(t); }, 250); });

    // ------------------------------------------------------------- exports
    const api = { evaluate, open, close };
    if (typeof window !== 'undefined') window.SLTrade = api;
    if (typeof globalThis !== 'undefined') globalThis.SLTrade = api;
})();
