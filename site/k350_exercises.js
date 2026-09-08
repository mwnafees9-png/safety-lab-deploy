// ============================================================================
// k350_exercises.js — v1.0 — UX-3: the K350 exercise track.
//
// The tour SHOWS the thread; the micro-tours ORIENT each surface; this trains
// the hands. Six exercises the user performs for real in their own workspace,
// each with a deterministic completion check evaluated READ-ONLY against live
// project state — the module never writes to any store, never creates data,
// and never fakes a check. "Complete" means the state actually says so.
//
// The exercises walk the discipline end to end: build a tree → enter your own
// numbers → let the engine compute → triage with importance heat → log an
// assumption → run the integrity sweep. Two-lane throughout: every value in
// the exercises is the USER's; every verdict is the engine's.
//
// BORN MODULAR: new file; injects its launch button into the Getting Started
// card (#sl-onramp, same pattern as the K350 tour, MutationObserver refresh);
// progress is COMPUTED from state on every open — nothing persisted. Exports
// window.K350Exercises.
// ============================================================================
(function () {
    'use strict';

    // ---- practice-page discovery (the user names it; we just find it) --------
    function _pages() { return (typeof ftaPages !== 'undefined' ? ftaPages : []) || []; }
    function _practicePage() {
        return _pages().find(p => p && /practice/i.test(String(p.name || ''))) || null;
    }
    function _leaves(root) {
        const out = [];
        (function walk(n) {
            if (!n) return;
            if (n.type === 'basic' || n.type === 'undeveloped') out.push(n);
            (n.children || []).forEach(walk);
        })(root);
        return out;
    }
    function _gates(root) {
        const out = [];
        (function walk(n) {
            if (!n) return;
            if (n.type === 'gate') out.push(n);
            (n.children || []).forEach(walk);
        })(root);
        return out;
    }

    // ---- the six exercises ----------------------------------------------------
    // check() returns { pass, detail } — evaluated read-only, every call.
    const EXERCISES = [
        {
            id: 'EX1', title: 'Build a practice tree',
            body: 'In Fault Tree Analysis, add a new page and name it “Practice”. Give it a top event, one AND gate, and two basic events underneath.',
            check() {
                const p = _practicePage();
                if (!p) return { pass: false, detail: 'no page named “Practice” yet' };
                const g = _gates(p.root).length, l = _leaves(p.root).length;
                return { pass: g >= 1 && l >= 2, detail: g + ' gate(s), ' + l + ' event(s)' };
            }
        },
        {
            id: 'EX2', title: 'Enter your own failure rates',
            body: 'Select each basic event on the Practice page and enter a λ — your value, from your data. The engine never invents a number; this habit is the whole discipline.',
            check() {
                const p = _practicePage();
                if (!p) return { pass: false, detail: 'needs EX1' };
                const ls = _leaves(p.root);
                const withRate = ls.filter(n => (typeof n.lambda === 'number' && n.lambda > 0) || (typeof n.probability === 'number' && n.probability > 0));
                return { pass: ls.length >= 2 && withRate.length >= 2, detail: withRate.length + '/' + ls.length + ' events quantified' };
            }
        },
        {
            id: 'EX3', title: 'Let the engine compute',
            body: 'Run the calculation (it happens on edit — check the top event now carries λ and P). Those numbers are the engine’s lane: computed, exact, never yours to type.',
            check() {
                const p = _practicePage();
                if (!p || !p.root) return { pass: false, detail: 'needs EX1–EX2' };
                const q = (typeof p.root.probability === 'number' && p.root.probability > 0) || (typeof p.root.lambda === 'number' && p.root.lambda > 0);
                return { pass: q, detail: q ? 'P(top) computed' : 'top event has no computed value yet' };
            }
        },
        {
            id: 'EX4', title: 'Triage with importance heat',
            body: 'On your Practice page, hit 🔥 Importance heat and hover the hottest event — that’s the cause carrying your risk, ranked by the engine. Leave the heat ON and check your work.',
            check() {
                const on = !!(typeof ImportanceHeat !== 'undefined' && ImportanceHeat && ImportanceHeat.isOn());
                const p = _practicePage();
                const here = !!(p && typeof activeFTAPageId !== 'undefined' && activeFTAPageId === p.id);
                if (!on) return { pass: false, detail: 'heat is off' };
                return { pass: here, detail: here ? 'heat on, practice page active' : 'heat on — switch to the Practice page' };
            }
        },
        {
            id: 'EX5', title: 'Log an assumption',
            body: 'In Aircraft Assumptions, add one containing the word “practice” — e.g. “Practice: pump λ assumed from supplier data pending test.” Assumptions are elicited, dispositioned, and never silently overwritten.',
            check() {
                const ac = (typeof acAssumptionsData !== 'undefined' ? acAssumptionsData : []) || [];
                const sys = ((typeof systemsData !== 'undefined' ? systemsData : []) || []).flatMap(s => s.asm || []);
                const hit = [...ac, ...sys].find(a => a && /practice/i.test(String(a.text || '')));
                return { pass: !!hit, detail: hit ? 'found: ' + String(hit.text).slice(0, 40) + '…' : 'no assumption mentioning “practice”' };
            }
        },
        {
            id: 'EX6', title: 'Run the integrity sweep',
            body: 'Open Prove → Thread Integrity. The sweep runs on open — a deterministic pass over every cross-artifact truth. Hard fails are golden-thread breaks; advisories are pending-work honesty.',
            check() {
                // v1.1 — the dashboard's leading-indicators strip keeps
                // invariantsLast perpetually fresh, so the timestamp alone
                // free-passed this drill (live finding). The Thread Integrity
                // PANEL node exists only once that page has actually been
                // opened this session — that's the real signal.
                const visited = !!(typeof document !== 'undefined' && document.getElementById('gt-invariants-panel'));
                if (!visited) return { pass: false, detail: 'Thread Integrity not opened this session' };
                const pc = (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {};
                const last = pc.invariantsLast && pc.invariantsLast.at;
                if (!last) return { pass: false, detail: 'sweep has never run' };
                const age = Date.now() - Date.parse(last);
                return { pass: isFinite(age) && age < 30 * 60 * 1000, detail: isFinite(age) && age < 30 * 60 * 1000 ? 'panel open · swept ' + Math.round(age / 60000) + ' min ago' : 'last sweep is stale — open Thread Integrity again' };
            }
        },
    ];

    function evaluate() {
        return EXERCISES.map(e => {
            let r;
            try { r = e.check() || { pass: false, detail: 'n/a' }; } catch (_) { r = { pass: false, detail: 'check error' }; }
            return { id: e.id, title: e.title, pass: !!r.pass, detail: r.detail || '' };
        });
    }

    // ---- the modal --------------------------------------------------------------
    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function close() { const m = document.getElementById('exq-modal'); if (m) m.remove(); }
    function open() {
        close();
        const wrap = document.createElement('div');
        wrap.id = 'exq-modal';
        wrap.style.cssText = 'position:fixed; inset:0; z-index:99970; background:rgba(10,20,40,0.45); display:flex; align-items:center; justify-content:center;';
        const results = evaluate();
        const done = results.filter(r => r.pass).length;
        const rows = EXERCISES.map((e, i) => {
            const r = results[i];
            return '<div style="display:flex; gap:12px; padding:11px 0; border-top:1px solid var(--color-border,#E3E8F0); align-items:flex-start;">' +
                '<span style="font-size:16px; line-height:1.3; flex:0 0 22px;">' + (r.pass ? '✅' : '⬜') + '</span>' +
                '<div style="flex:1;"><b style="font-size:12.5px;">' + _esc(e.id + ' — ' + e.title) + '</b>' +
                '<div style="font-size:12px; line-height:1.5; color:var(--color-text-secondary,#4A5568); margin-top:3px;">' + _esc(e.body) + '</div>' +
                '<div class="u-mono" style="font-size:10.5px; margin-top:4px; color:' + (r.pass ? 'var(--color-ok,#1B7F4B)' : 'var(--color-text-tertiary,#7C8698)') + ';">' + _esc(r.detail) + '</div></div></div>';
        }).join('');
        wrap.innerHTML =
            '<div style="width:92%; max-height:82vh; overflow:auto; background:var(--color-surface-1,#fff); color:var(--color-text-primary,#16213A); border:1px solid var(--color-border-strong,#B9C2D0); border-radius:8px; box-shadow:0 18px 60px rgba(10,20,40,0.4); padding:18px 20px;">' +
            '<div style="display:flex; align-items:baseline; gap:10px;"><b style="font-size:15px;">🎓 K350 exercise track</b>' +
            '<span class="u-mono" style="margin-left:auto; font-size:11px; color:var(--color-text-tertiary,#7C8698);">' + done + ' / ' + EXERCISES.length + ' complete</span></div>' +
            '<p style="font-size:12px; line-height:1.55; color:var(--color-text-secondary,#4A5568); margin:8px 0 4px;">Six hands-on exercises, checked against your real project state — nothing here is simulated. Do the work in the app, then come back and <b>Check my work</b>. Completion is computed live, never stored.</p>' +
            rows +
            '<div style="display:flex; gap:8px; margin-top:14px;">' +
            '<button id="exq-close" class="ckpt-m-btn" style="font-size:11.5px; padding:4px 12px;">Close</button>' +
            '<button id="exq-refresh" class="ckpt-m-btn ckpt-m-btn-primary" style="margin-left:auto; font-size:11.5px; padding:4px 14px;">Check my work ↻</button>' +
            '</div></div>';
        document.body.appendChild(wrap);
        wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
        wrap.querySelector('#exq-close').addEventListener('click', close);
        wrap.querySelector('#exq-refresh').addEventListener('click', open);
    }

    // ---- trigger in the Getting Started card ------------------------------------
    function _injectTrigger() {
        const ramp = document.getElementById('sl-onramp');
        if (!ramp || ramp.querySelector('#exq-launch')) return;
        const body = ramp.querySelector('.sl-onramp-body');
        if (!body) return;
        const btn = document.createElement('button');
        btn.id = 'exq-launch';
        btn.type = 'button';
        btn.textContent = '🎓 K350 exercise track — six hands-on drills, checked for real';
        btn.style.cssText = 'display:block; width:100%; margin-top:8px; font-size:11.5px; font-weight:700; padding:7px 10px; cursor:pointer; border:1px solid var(--color-border-strong,#B9C2D0); background:var(--color-surface-2,#F3F5F9); color:var(--color-accent,#4E63D8);';
        btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); open(); });
        body.appendChild(btn);
    }
    // v1.1 — second entry point: the Getting Started card self-dismisses for
    // returning users (live finding: Waqas's dashboard has no #sl-onramp), so
    // the track also gets a compact launcher on the dashboard, as a sibling
    // right after the leading-indicators strip.
    function _injectDashLaunch() {
        if (document.getElementById('exq-dash-launch')) return;
        const lead = document.getElementById('dash-leading');
        if (!lead || !lead.parentNode) return;
        const div = document.createElement('div');
        div.id = 'exq-dash-launch';
        div.style.cssText = 'margin-top:6px; text-align:right;';
        const a = document.createElement('button');
        a.type = 'button';
        a.className = 'ckpt-m-btn';
        a.style.cssText = 'font-size:11px; padding:3px 12px; cursor:pointer;';
        a.textContent = '🎓 K350 exercise track — six hands-on drills';
        a.addEventListener('click', open);
        div.appendChild(a);
        lead.parentNode.insertBefore(div, lead.nextSibling);
    }
    function _ready(fn) { if (typeof document === 'undefined') return; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
    _ready(function () {
        try {
            _injectTrigger(); _injectDashLaunch();
            if (typeof MutationObserver === 'function' && document.body) {
                new MutationObserver(() => { try { _injectTrigger(); _injectDashLaunch(); } catch (_) {} })
                    .observe(document.body, { childList: true, subtree: true });
            }
        } catch (_) {}
    });

    // ------------------------------------------------------------- exports
    if (typeof window !== 'undefined') {
        window.K350Exercises = { open, close, evaluate, EXERCISES };
    }
    if (typeof globalThis !== 'undefined') globalThis.K350Exercises = window.K350Exercises;
})();
