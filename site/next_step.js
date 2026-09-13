// ============================================================================
// next_step.js — v0.5 — A11. What to do next, and what is waiting on you.
//
// WHAT THIS IS NOT. It is not an agent that walks the programme. An assistant
// that drafts an FHA, then seeds a control structure from its own unreviewed
// FHA, then writes requirements from its own unreviewed control structure is
// compounding unreviewed work — and each layer reads as more settled than the
// one beneath it. So nothing here runs a chain. It reads the state, says what
// is next, and stops.
//
// WHY THE PLAN DOES NOT HAVE TO BE INFERRED. ARP4761A already is the plan, and
// program_plan.js already encodes it: a 25-lane catalogue across safety, RAM,
// human factors and ML, each lane declaring its standard and the certification
// bases that expect it. The ordering below is a TABLE, not a judgement, and the
// model is not consulted about it.
//
// THE SPINE IS NOT IN THE CATALOGUE — AND THAT IS CORRECT. The catalogue gates
// OPTIONAL lanes; a program without functions, an FHA and requirements is not a
// tailored program, it is not a program. So the spine is never gated and never
// appears there. But "what's next" on an empty project is a spine question every
// single time, so this module carries its own spine table. Omitting it would
// have produced a recommender that answers the question it was built for with
// "20 lanes blocked" and no way forward.
//
// THREE KINDS OF HELP, NAMED APART. A lane where a deterministic engine does the
// work (requirement generation, DAL allocation, probability budgets) is not the
// same as a lane where a model drafts something you then have to review, and
// neither is the same as a lane you do by hand. Collapsing them into "AI" would
// overstate what the model does and understate what the engine already does.
//
// DERIVED LANES ARE OUTPUT, NOT WORK. CCMR, FMES and the Independence Ledger
// author nothing — they recompute from the fault trees and the FMEA rows on
// every read. They are listed under their own heading. Counting their rows as
// progress would let a project appear to advance in three lanes because someone
// added one basic event in a fourth.
//
// HONEST ABOUT COVERAGE. AI assistance is uneven: the ARP4761A spine has the
// bulk of the drafting features, STPA has a seed, and RAM and human factors have
// one narrow touch each. A lane with no assist is marked MANUAL rather
// than quietly omitted — a plan that only lists what the tool can help with is
// not a plan, it is a menu.
// ============================================================================
(function () {
    'use strict';
    // Guarded rather than early-returned, so the assessment core stays callable
    // under node with no DOM. A module that cannot be tested headlessly gets
    // tested by hand, which means eventually it does not get tested.
    try {
        if (typeof window !== 'undefined') {
            if (window.__slNextStepWired) return;
            window.__slNextStepWired = true;
        }
    } catch (_) {}

    // ---- primitives ---------------------------------------------------------
    // Prerequisites are expressed against these rather than against other lanes,
    // because a primitive is checkable and a lane is an opinion.
    function _n(v) { try { return (v && v.length) || 0; } catch (_) { return 0; } }
    function _sysSum(key) {
        try {
            return (systemsData || []).reduce(function (a, s) { return a + _n(s && s[key]); }, 0);
        } catch (_) { return 0; }
    }
    const PRIMITIVES = {
        functions:     function () { try { return _n(acFunctionsData) + _sysSum('functions'); } catch (_) { return 0; } },
        systems:       function () { try { return _n(systemsData); } catch (_) { return 0; } },
        items:         function () { try { return _n(itemsData); } catch (_) { return 0; } },
        fhaAny:        function () { try { return _n(acFhaData) + _sysSum('fha'); } catch (_) { return 0; } },
        fhaClassified: function () {
            try {
                const all = (acFhaData || []).concat((systemsData || []).reduce(function (a, s) {
                    return a.concat((s && s.fha) || []);
                }, []));
                return all.filter(function (f) { return f && String(f.severity || '').trim(); }).length;
            } catch (_) { return 0; }
        },
        trees:         function () { try { return (ftaPages || []).filter(function (p) { return p && p.root; }).length; } catch (_) { return 0; } }
    };
    const PRIM_LABEL = {
        functions: 'aircraft functions', systems: 'systems', items: 'items',
        fhaAny: 'failure conditions', fhaClassified: 'classified failure conditions', trees: 'fault trees'
    };

    // ---- how much help exists, and of what kind -----------------------------
    // 'engine'  — deterministic. The maths is the maths; there is no draft to
    //             second-guess, only inputs to confirm.
    // 'ai'      — a model drafts, you review. Everything in the A-series about
    //             abstention, edit gates and verify-repair applies to these.
    // null      — manual. Listed anyway.
    const A = function (kind, text, partial) { return { kind: kind, text: text, partial: !!partial }; };

    // ---- the spine ----------------------------------------------------------
    // Not gated, not in the catalogue, and ordered by ARP4754B / ARP4761A.
    //
    // Clause references corrected 1 Aug 2026 against the documents themselves.
    // Four of these eight were wrong when this shipped: ARP4754B §5 is INTEGRAL
    // PROCESSES, not the development process, so the function / architecture /
    // item work is §4.2, §4.3 and §4.5; and in ARP4761A §3.1 is the process
    // overview, with AFHA at §3.2 and SFHA at §3.4. FMEA is App J — App G is
    // Fault Tree Analysis.
    //
    // Citing a real document by a clause that says something else is worse than
    // citing nothing: it survives review precisely because it looks checked.
    const SPINE = [
        { id: 'ac-func',  tab: 'ac-func',  name: 'Aircraft functional breakdown', std: 'ARP4754B §4.2',
          needs: [], count: function () { return _n(acFunctionsData); }, assist: null },
        { id: 'ac-fha',   tab: 'ac-fha',   name: 'Aircraft FHA', std: 'ARP4761A §3.2 · App A',
          needs: ['functions'], count: function () { return _n(acFhaData); },
          assist: A('ai', 'AI drafts failure conditions — and declines severity rather than guessing it') },
        { id: 'ac-fcim',  tab: 'ac-fcim',  name: 'Failure Condition Impact Matrix', std: 'ARP4761A §3.2 (derived from the AFHA)',
          needs: ['functions'], count: function () { return _n(acFcimData); },
          assist: A('ai', 'AI drafts the FCIM') },
        { id: 'ac-req',   tab: 'ac-req',   name: 'Aircraft safety requirements', std: 'ARP4754B §4.1.3 · §5.1',
          needs: ['fhaClassified'], count: function () { return _n(acReqData); },
          assist: A('engine', 'generated deterministically from the classified failure conditions — no model involved') },
        { id: 'sys-dir',  tab: 'sys-dir',  name: 'System breakdown', std: 'ARP4754B §4.3',
          needs: ['functions'], count: function () { return _n(systemsData); }, assist: null },
        { id: 'sys-fha',  tab: 'sys-dir',  name: 'System FHA (SFHA)', std: 'ARP4761A §3.4 · App C',
          needs: ['systems'], count: function () { return _sysSum('fha'); },
          assist: A('ai', 'AI drafts system failure conditions') },
        { id: 'items',    tab: 'items',    name: 'Item definition', std: 'ARP4754B §4.5',
          needs: ['systems'], count: function () { return _n(itemsData); }, assist: null },
        { id: 'fmea',     tab: 'sys-dir',  name: 'FMEA (inside each System Folder)', std: 'ARP4761A App J',
          needs: ['items'], count: function () { try { return _n(fmeaData) + _sysSum('fmea'); } catch (_) { return 0; } },
          assist: A('ai', 'AI drafts FMEA rows') }
    ];

    // ---- precedence for the catalogue lanes ---------------------------------
    // Straight from ARP4761A. Lanes absent from this map have no prerequisite —
    // they can start whenever, which for the CCA track is the point: common-cause
    // work runs THROUGHOUT development, not after it.
    const NEEDS = {
        hfa: ['functions'], 'hfa-task': ['functions'], 'hfa-ergo': ['functions'],
        stpa: ['functions'],
        fta: ['fhaClassified'],            // a tree is built FOR a classified failure condition
        markov: ['trees'], eta: ['trees'],
        cma: ['trees'],                    // common-mode against the independence a tree claims
        fmes: ['fhaAny'],
        ccmr: ['trees'],
        'ram-reliability': ['items'], 'ram-swrel': ['items'], 'ram-sneak': ['items'],
        'ram-lcc': ['items'], 'ram-mx': ['items'], 'ram-msg3': ['items'],
        'ram-mmel': ['fhaClassified'], 'ram-lora': ['items'],
        bowtie: ['fhaAny'], ipledger: ['trees'], routing: ['systems']
    };

    // ---- where an AI assist actually exists ---------------------------------
    // Deliberately explicit rather than inferred. Uneven coverage is a fact about
    // the product and the plan should say so out loud.
    const ASSIST = {
        fta:  A('ai', 'AI synthesises a tree from architecture'),
        pra:  A('ai', 'AI drafts particular risks'),
        zsa:  A('ai', 'AI drafts zonal entries'),
        cma:  A('ai', 'AI drafts common-mode entries'),
        stpa: A('ai', 'AI seeds the spine + control structure; the engine derives UCAs'),
        'ram-msg3': A('ai', 'AI drafts MSG-3 rationale only', true),
        // Human factors got its first assist on 1 Aug 2026. Marked partial on both
        // lanes on purpose: it registers crew credit that is already being taken
        // and writes the sentence, and it deliberately leaves every measured
        // quantity — task time, its basis, the workload band, the posture — blank.
        hfa: A('ai', 'AI registers crew credit the analysis already takes; every measured quantity is left for you', true),
        'hfa-task': A('ai', 'the task ledger is the HF-typed assumptions, so the same drafting fills it — task time is never drafted', true)
    };

    // ---- assessment ---------------------------------------------------------
    // `inject` exists so the bucket logic — the only part with any judgement in
    // it — can be exercised under node. Production passes nothing.
    function assess(inject) {
        const src = inject || {};
        const PP = src.PP || ((typeof window !== 'undefined') ? window.PROGRAM_PLAN : null);
        if (!PP || !Array.isArray(PP.CATALOGUE)) return null;
        const basis = (function () { try { return PP.basisNow(); } catch (_) { return ''; } })();

        const prim = {};
        Object.keys(PRIMITIVES).forEach(function (k) {
            prim[k] = src.primitives ? (Number(src.primitives[k]) || 0) : PRIMITIVES[k]();
        });
        const DERIVED = PP.DERIVED || {};
        const NO_STORE = PP.NO_STORE || {};

        function _wrap(o) {
            const missing = (o.needs || []).filter(function (k) { return !prim[k]; });
            return {
                id: o.id, name: o.name, std: o.std, tab: o.tab, spine: !!o.spine,
                on: o.on !== false, expected: !!o.expected, count: o.count,
                derived: !!o.derived, noStore: !!o.noStore,
                blockedBy: missing.map(function (k) { return PRIM_LABEL[k] || k; }),
                ready: (o.on !== false) && !missing.length,
                assist: o.assist || null
            };
        }

        const spine = SPINE.map(function (l) {
            let c = 0;
            if (src.counts && src.counts[l.id] != null) c = Number(src.counts[l.id]) || 0;
            else { try { c = Number(l.count()) || 0; } catch (_) { c = 0; } }
            return _wrap({ id: l.id, name: l.name, std: l.std, tab: l.tab, needs: l.needs,
                           count: c, assist: l.assist, spine: true, on: true, expected: true });
        });

        const lanes = PP.CATALOGUE.map(function (l) {
            let on = true, expected = false, count = 0;
            try { on = PP.laneOn(l.id); } catch (_) {}
            try { expected = PP.isExpected(l.id, basis); } catch (_) {}
            if (src.counts && src.counts[l.id] != null) count = Number(src.counts[l.id]) || 0;
            else { try { count = Number(PP.laneData(l.id)) || 0; } catch (_) {} }
            return _wrap({ id: l.id, name: l.name, std: l.std, tab: (l.tabs || [])[0], needs: NEEDS[l.id],
                           count: count, assist: ASSIST[l.id] || null, on: on, expected: expected,
                           derived: !!DERIVED[l.id], noStore: !!NO_STORE[l.id] });
        });

        // ---- what a human has to decide -------------------------------------
        // These are the things the engine will otherwise carry forward as fact.
        const waiting = [];
        if (!prim.functions) {
            waiting.push({
                what: 'No aircraft functions defined',
                why: 'Every lane below the spine reads from the functional breakdown. Nothing can start until it exists.',
                where: 'ac-func'
            });
        }
        const unclass = prim.fhaAny - prim.fhaClassified;
        if (unclass > 0) {
            waiting.push({
                what: unclass + ' failure condition' + (unclass === 1 ? '' : 's') + ' with no severity',
                why: 'The engine allocates DAL and probability targets from severity. It will do that correctly off a value nobody confirmed — correct arithmetic on an unverified input is the failure this gate exists to stop.',
                where: 'ac-fha'
            });
        }
        if (prim.fhaClassified > 0 && !prim.trees) {
            waiting.push({
                what: 'No fault tree carries a classified failure condition yet',
                why: 'Severity sets the probability target; nothing yet shows the architecture meets it. Until a tree exists that budget is an intention, not a claim.',
                where: 'fta'
            });
        }

        // A lane is in play if it is switched on AND either the basis expects it
        // or somebody has already put work in it. Count alone is enough: work
        // that exists outranks a table's opinion about whether it should.
        //
        // Derived lanes need the OTHER test, and getting this wrong once already
        // hid them entirely: their count is 0 by construction, and none of them
        // is basis-expected, so the authored-work rule silenced them on every
        // project forever. What makes a derived view worth opening is that its
        // INPUTS exist — trees for the latent sweep and the independence ledger,
        // FMEA rows for the FMES rollup. So they surface on readiness instead.
        const real = lanes.filter(function (l) { return !l.derived && l.on && (l.expected || l.count > 0); });
        const derived = lanes.filter(function (l) { return l.derived && l.on && l.ready; });
        const all = spine.concat(real);

        return {
            basis: basis,
            primitives: prim,
            lanes: lanes,
            spine: spine,
            waiting: waiting,
            ready:   all.filter(function (l) { return l.ready && !l.count; }),
            inWork:  all.filter(function (l) { return l.ready && l.count > 0; }),
            blocked: all.filter(function (l) { return !l.ready; }),
            derived: derived,
            // Counted across the whole board rather than just the startable lanes,
            // because the honest statement is about coverage, not about today.
            manual:  all.filter(function (l) { return !l.assist; })
        };
    }

    // ---- rendering ----------------------------------------------------------
    function _esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }
    function _go(tab) { return tab ? (' <a href="#" data-nextstep-tab="' + _esc(tab) + '" style="font-size:11px;">open</a>') : ''; }
    function _assistNote(l) {
        if (!l.assist) return '<span style="color:#8A6D00;">MANUAL — no AI assist exists for this lane</span>';
        const tag = l.assist.kind === 'engine' ? 'ENGINE' : 'AI';
        return '<span style="color:#0E7A3C;"><b>' + tag + '</b> · ' + _esc(l.assist.text)
             + (l.assist.partial ? ' — partial cover only' : '') + '</span>';
    }
    function _laneLine(l, note) {
        return '<li style="margin:3px 0;"><b>' + _esc(l.name) + '</b>'
             + (l.spine ? ' <span style="font-size:10px;border:1px solid var(--color-border-strong);padding:0 3px;">SPINE</span>' : '')
             + '<span style="font-size:11px;color:var(--color-text-tertiary);"> · ' + _esc(l.std || '') + '</span>'
             + _go(l.tab)
             + (note ? ('<br><span style="font-size:11.5px;color:var(--color-text-secondary);">' + note + '</span>') : '')
             + '</li>';
    }
    function _S(t, sub) {
        return '<div style="padding:8px 13px;border-bottom:2px solid var(--color-text-primary);margin-top:14px;"><b>' + t + '</b>'
             + (sub ? ' <span style="font-size:11px;color:var(--color-text-tertiary);">' + sub + '</span>' : '') + '</div>';
    }
    function _ul(items) { return '<ul style="margin:8px 0 0;padding-left:18px;font-size:12.5px;">' + items.join('') + '</ul>'; }
    function _none(msg, good) {
        return '<div style="padding:9px 13px;font-size:12px;color:' + (good ? '#0E7A3C' : 'var(--color-text-tertiary)') + ';">' + msg + '</div>';
    }
    function _plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

    function html(inject) {
        const a = assess(inject);
        if (!a) return '<div style="padding:14px;color:var(--color-text-tertiary);font-size:12px;">Program plan not loaded.</div>';

        let out = '<h3>What\'s next</h3>'
            + '<p style="font-size:12.5px;color:var(--color-text-secondary);margin:2px 0 8px;">'
            + 'Read from the program plan and the current project state, against ' + _esc(a.basis) + '. '
            + 'The ordering comes from ARP4754B and ARP4761A, not from a model — nothing here was inferred, and nothing runs on its own.</p>';

        out += _S('Waiting on you', a.waiting.length ? _plural(a.waiting.length, 'decision') : 'nothing outstanding');
        out += a.waiting.length
            ? _ul(a.waiting.map(function (w) {
                  return '<li style="margin:5px 0;"><b>' + _esc(w.what) + '</b>' + _go(w.where)
                       + '<br><span style="font-size:11.5px;color:var(--color-text-secondary);">' + _esc(w.why) + '</span></li>';
              }))
            : _none('Nothing is waiting on a human decision.', true);

        out += _S('Ready to start', _plural(a.ready.length, 'lane'));
        out += a.ready.length
            ? _ul(a.ready.map(function (l) { return _laneLine(l, _assistNote(l)); }))
            : _none('Nothing new to start.');

        out += _S('In work', _plural(a.inWork.length, 'lane'));
        out += a.inWork.length
            ? _ul(a.inWork.map(function (l) {
                  return _laneLine(l, '<span style="color:var(--color-text-secondary);">' + _plural(l.count, 'item') + ' recorded</span> · ' + _assistNote(l));
              }))
            : _none('Nothing started yet.');

        out += _S('Blocked', _plural(a.blocked.length, 'lane'));
        out += a.blocked.length
            ? _ul(a.blocked.map(function (l) {
                  return _laneLine(l, '<span style="color:#B03030;">needs ' + _esc(l.blockedBy.join(', ')) + '</span>');
              }))
            : _none('Nothing blocked.', true);

        if (a.derived.length) {
            out += _S('Derived — no work of their own', _plural(a.derived.length, 'view'));
            out += _ul(a.derived.map(function (l) {
                return _laneLine(l, '<span style="color:var(--color-text-secondary);">their inputs exist, so there is something to read — but nothing is authored here. Recomputed from the trees and the FMEA rows on every read, so a derived view is never "started", never counts as progress, and strands nothing if it leaves the program</span>');
            }));
        }

        const noAssist = a.manual.length;
        if (noAssist) {
            out += '<div style="border:1px solid var(--color-border-strong);background:var(--color-surface-2);padding:9px 13px;margin-top:14px;font-size:11.5px;color:var(--color-text-secondary);">'
                 + '<b>' + noAssist + ' of the lanes above have no AI assist at all</b> and are listed anyway. '
                 + 'Coverage is uneven — the ARP4761A spine carries most of the drafting features, STPA has a seed, and RAM and human factors have one narrow touch each. '
                 + 'A plan that listed only what the tool can help with would be a menu, not a plan.</div>';
        }
        return out;
    }

    function render(hostId) {
        if (typeof document === 'undefined') return;
        const host = document.getElementById(hostId || 'next-step');
        if (!host) return;
        try { host.innerHTML = html(); } catch (_) {}
        try {
            Array.prototype.forEach.call(host.querySelectorAll('[data-nextstep-tab]'), function (a) {
                a.addEventListener('click', function (e) {
                    e.preventDefault();
                    try { if (typeof switchTab === 'function') switchTab(a.getAttribute('data-nextstep-tab')); } catch (_) {}
                });
            });
        } catch (_) {}
    }

    const API = { assess: assess, html: html, render: render,
                  NEEDS: NEEDS, ASSIST: ASSIST, SPINE: SPINE, PRIMITIVES: PRIMITIVES };
    try { if (typeof window !== 'undefined') { window.NEXT_STEP = API; window.renderNextStep = render; } } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
