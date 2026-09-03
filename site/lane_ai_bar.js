// ============================================================================
// lane_ai_bar.js — v1.2 — THE AI ACTION BAR, IN THE LANE ITSELF.
//
// Waqas, 2 Sep 2026: "actually I prefer having a per lane button in the actual
// lane rather than just the AI assistant lets wire it up for all the analyses in
// the app."
//
// Before this, exactly one family had in-lane AI buttons — the nine HF lanes,
// hand-placed in index.html and in the HF register panel. Every other analysis
// (FHA, FCIM, functions, fault trees, FMEA, PRA, ZSA, CMA, requirements, STPA,
// resources) had its AI action reachable ONLY from the assistant launcher. You had
// to leave the lane you were working in to run the thing that works on it.
//
// SCOPE RULE: a lane's bar offers ONLY the actions that act on that lane. That is
// enforced by the shape of the registry (ACTION -> lane, inverted at read time), not
// by a comment asking the next person to be careful.
//
// ONE SOURCE OF TRUTH, TWO SURFACES. The bar does not define its own actions. It
// maps a tab id to LAUNCHER ACTION LABELS and resolves them against
// SafetyLabAI.launcherActions() at mount time, running the launcher's own `run`
// function. So an action added to the launcher lights up in its lane too, an
// action's behaviour is defined once, and the two surfaces cannot drift into
// disagreeing about what a lane can do. A label that stops resolving is a wiring
// break, and regression_lane_ai_bar catches it by resolving every label in the
// registry against the live launcher.
//
// WHY A REGISTRY AND NOT 20 HAND-PLACED DIVS. The hand-placed HF bars were the
// proof: seven in index.html, two more in a JS panel, each carrying its own copy
// of the same onclick, the same try/catch and the same title text. Nine copies of
// one idea is nine places to forget. Those are removed; this module serves them.
//
// MOUNT POINT. All 86 lane views open with a <div class="header-with-export">
// carrying the lane's <h3> and its Data Actions dropdown. The bar is inserted
// directly after it — above the lane's explanatory text, below its title — which
// is where the HF bars already sat, so the placement is not a new convention.
//
// GATED: a lane's button is disabled, and says what is missing, when the analysis does
// not yet have its inputs. The authority for that is SafetyLabAI.inputReady — the bar
// asks, it does not decide, so the launcher and the bar can never disagree about
// whether an analysis can run.
//
// BORN MODULAR: renders nothing until a tab is shown. Idempotent — mounting an
// already-mounted lane refreshes it rather than stacking a second bar.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ---------------------------------------------------------------- registry
    // THE RULE (Waqas, 2 Sep 2026): "it should only draft the lane it is mounted on."
    //
    // So this is deliberately NOT a lane -> actions map. It is ACTION -> the single lane
    // that action writes, and each lane's bar is DERIVED by inverting it. A button
    // therefore cannot appear on a lane it does not act on, because that arrangement is
    // not expressible in the data — the guarantee is structural, not a convention someone
    // has to remember while adding the next entry.
    //
    // Two placements this rule decided, against the obvious guess:
    //   · "Propose CCF groups" sits on FAULT TREES, not CMA. It reads the CMA's
    //     independence claims, but what it WRITES is β-couplings tagged onto fault-tree
    //     basic events. The lane it acts on is the tree.
    //   · "Recommend requirements" sits on REQUIREMENTS, not the FHA. It reads failure
    //     conditions and files its proposals as comments against them, but the artifact it
    //     is proposing is a requirement, and the requirements lane is where the engineer
    //     dispositions it.
    var ACTION_WRITES = {
        'Decompose architecture → functions': 'ac-func',
        'Generate FCIM':                      'ac-fcim',
        'Draft FHA':                          'ac-fha',
        'Synthesize fault trees':             'fta',
        'Review fault trees':                 'fta',
        'Propose CCF groups':                 'fta',
        'FMEA — by system':                   'fmea',
        'Particular Risk Analysis (PRA)':     'pra',
        'Zonal Safety Analysis (ZSA)':        'zsa',
        'Common Mode Analysis (CMA)':         'cma',
        'Recommend requirements':             'ac-req',
        'Draft STPA':                         'stpa',
        'Draft Resources':                    'resources',
        'Human Factors — register crew credit': 'hfa'
    };

    // The nine HF sub-lanes are GENERATED, exactly as their launcher entries are: one
    // registry decides which HF lanes the recommender serves, and both surfaces read it.
    // Each recommender is already scoped to its own lane by the argument it is called
    // with, so it satisfies the rule above by construction.
    var _HF_TAB_BY_NAME = {
        'Task Identification':  'hfa-tid',
        'Function Allocation':  'hfa-alloc',
        'Task Analysis':        'hfa-task',
        'Human Error Analysis': 'hfa-hea',
        'Crew Alerting':        'hfa-alerts',
        'Ergonomics':           'hfa-ergo',
        'Controls & Displays':  'hfa-cd',
        'Situation Awareness':  'hfa-sa',
        'Minimum Flight Crew':  'hfa-mfc'
    };
    function _hfWrites() {
        var out = {};
        try {
            var API = (typeof window !== 'undefined') ? window.SafetyLabAI : null;
            if (!API || typeof API.launcherActions !== 'function') return out;
            // EACH HF LANE NOW HAS TWO LAUNCHER ENTRIES — a drafter, labelled
            // '… · draft from documents', and a recommender. The suffix is stripped to
            // find the lane; both labels are kept as separate keys, so both render, in
            // launcher order (draft first, because that is the order of the work). A
            // non-greedy capture plus an optional suffix is what makes one regex serve
            // both, and it stays exact: anything that is not a known lane name still
            // resolves to no tab and is dropped rather than guessed at.
            API.launcherActions().forEach(function (a) {
                if (!a || a.group !== 'Human factors') return;
                var m = /^HF — (.+?)(?: · draft from documents)?$/.exec(String(a.label || ''));
                if (!m) return;
                var tab = _HF_TAB_BY_NAME[m[1]];
                if (tab) out[a.label] = tab;
            });
        } catch (_) {}
        return out;
    }
    // Invert: lane -> the actions that act on it, in registry order.
    function _lanesFromWrites() {
        var writes = {};
        Object.keys(ACTION_WRITES).forEach(function (k) { writes[k] = ACTION_WRITES[k]; });
        var hf = _hfWrites();
        Object.keys(hf).forEach(function (k) { writes[k] = hf[k]; });
        var byLane = {};
        Object.keys(writes).forEach(function (label) {
            var lane = writes[label];
            (byLane[lane] = byLane[lane] || []).push(label);
        });
        return byLane;
    }

    function _actionsFor(tabId) {
        var labels = _lanesFromWrites()[tabId];
        if (!labels || !labels.length) return [];
        var API = (typeof window !== 'undefined') ? window.SafetyLabAI : null;
        if (!API || typeof API.launcherActions !== 'function') return [];
        var all;
        try { all = API.launcherActions(); } catch (_) { return []; }
        var byLabel = {};
        (all || []).forEach(function (a) { if (a && a.label) byLabel[a.label] = a; });
        // A label that no longer resolves is dropped, never rendered as a dead button.
        // Silent here on purpose — the wall is where that break gets caught, not a
        // toast in the engineer's face mid-analysis.
        return labels.map(function (l) { return byLabel[l]; }).filter(Boolean);
    }

    // ------------------------------------------------------------------ styles
    var _styled = false;
    function _ensureStyles() {
        if (_styled || typeof document === 'undefined') return;
        _styled = true;
        var st = document.createElement('style');
        st.id = 'lane-ai-bar-styles';
        st.textContent = [
            '.slab-ai-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 12px;}',
            '.slab-ai-bar .slab-ai-btn{font-size:11.5px;}',
            '.slab-ai-bar .slab-ai-note{font-size:10.5px;opacity:.55;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}',
            '.slab-ai-bar .slab-ai-blocked{opacity:.5;cursor:not-allowed;}'
        ].join('\n');
        document.head.appendChild(st);
    }

    // ------------------------------------------------------------------- mount
    function mount(tabId) {
        if (typeof document === 'undefined') return false;
        var acts = _actionsFor(tabId);
        var view = document.getElementById('view-' + tabId);
        if (!view) return false;
        var existing = view.querySelector(':scope > .slab-ai-bar');
        if (!acts.length) { if (existing) existing.remove(); return false; }
        _ensureStyles();

        var bar = existing || document.createElement('div');
        bar.className = 'slab-ai-bar';
        bar.innerHTML = '';
        acts.forEach(function (a, i) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn-cyan slab-ai-btn';
            b.textContent = '✨ ' + a.label;
            b.setAttribute('data-lane-ai', a.label);
            // Show the gate rather than only enforcing it. SafetyLabAI gates the action
            // itself, so a click on an unready analysis is refused with the reason either
            // way — but a button that offers something it will then refuse is a worse
            // button than one that says up front what is missing.
            var rd = null;
            try {
                var _API = (typeof window !== 'undefined') ? window.SafetyLabAI : null;
                if (a.needs && _API && typeof _API.inputReady === 'function') rd = _API.inputReady(a.needs.r);
            } catch (_) {}
            if (rd && !rd.ready) {
                b.disabled = true;
                b.classList.add('slab-ai-blocked');
                b.textContent = '✨ ' + a.label + ' — needs ' + rd.need;
                b.title = a.label + ' cannot run yet: it needs ' + rd.need + '. ' + (a.sub || '');
            } else {
                b.title = (a.sub || '') + ' — advisory; every result lands in a review gate you accept or dismiss.';
            }
            b.onclick = function () {
                Promise.resolve().then(a.run).catch(function (e) {
                    try {
                        if (typeof showToast === 'function') showToast((e && e.message) || String(e), 'warning', 4000);
                        else if (typeof alert === 'function') alert((e && e.message) || String(e));
                    } catch (_) {}
                });
            };
            bar.appendChild(b);
        });
        var note = document.createElement('span');
        note.className = 'slab-ai-note';
        note.textContent = 'advisory — you review and accept';
        bar.appendChild(note);

        if (!existing) {
            var anchor = view.querySelector(':scope > .header-with-export');
            if (anchor && anchor.parentNode === view) anchor.insertAdjacentElement('afterend', bar);
            else view.insertBefore(bar, view.firstChild);
        }
        return true;
    }

    // Mount on every tab change. The AI module loads lazily (ai_loader), so a lane
    // shown before it arrives would render no bar and never retry — hence the short
    // re-mount after the loader's window, and the retry on the API appearing.
    function _wire() {
        if (typeof window === 'undefined' || typeof document === 'undefined') return;
        if (typeof window.switchTab === 'function' && !window.switchTab._laneAiWrapped) {
            var orig = window.switchTab;
            var wrapped = function (tabId) {
                var r = orig.apply(this, arguments);
                try { mount(tabId); } catch (_) {}
                try { setTimeout(function () { mount(tabId); }, 900); } catch (_) {}
                return r;
            };
            wrapped._laneAiWrapped = true;
            // Preserve anything an earlier wrapper hung on the function.
            Object.keys(orig).forEach(function (k) { try { wrapped[k] = orig[k]; } catch (_) {} });
            window.switchTab = wrapped;
            try {
                var cur = document.querySelector('[id^="view-"]:not([style*="display: none"])');
                if (cur) mount(cur.id.replace(/^view-/, ''));
            } catch (_) {}
        } else if (typeof window.addEventListener === 'function') {
            window.addEventListener('DOMContentLoaded', function () { setTimeout(_wire, 700); });
        }
    }
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () { setTimeout(_wire, 800); });
        } else {
            setTimeout(_wire, 800);
        }
    }

    var API = { mount: mount, ACTION_WRITES: ACTION_WRITES, lanesFromWrites: _lanesFromWrites, actionsFor: _actionsFor, hfWrites: _hfWrites, HF_TAB_BY_NAME: _HF_TAB_BY_NAME };
    if (typeof window !== 'undefined') window.LANE_AI_BAR = API;
    if (typeof module !== 'undefined') module.exports = API;
})();
