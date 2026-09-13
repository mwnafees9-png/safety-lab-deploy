// ============================================================================
// severity_axes.js — v1.3 — severity DERIVED from three effect axes (3 Sep 2026).
//   1.3 (5 Sep 2026): the Effects cell names the levels fha_derive.js set by rule (MAC / HF / escape).
//
// Waqas: "reduction in safety margins or reduction in functional capabilities —
// none, slight, significant, large or hull loss — determine aircraft effect;
// increase in crew workload — none, slight, significant, large or fatalities —
// determine crew effect; pax effect is determined by slight inconvenience/none,
// discomfort, minor injuries, severe injuries/few fatalities, multiple
// fatalities." And: "I like that context and it defines why the aircraft is
// lost … I do not want to lose that context."
//
// So every FHA row keeps its three effect SENTENCES (effAc / effCrew / effPax —
// the evidence: remaining means, workload, consequence) and gains three closed
// LEVELS (effAcLevel / effCrewLevel / effPaxLevel). The severity class is the
// worst axis, mapped by the certification basis' definitions; it is never a
// free choice once a level is set. That is the consistency lever: two draws
// that read the same facts land on the same levels, and when they do not the
// disagreement is on ONE named axis — a reviewable question, not a shrug.
//
// Each level carries the Table A6 anchor it corresponds to (the same anchors
// the drafter's sevBasis has cited since v2), so the rationale quotes the
// governing axis' definition and nothing is invented.
//
// Born modular: injects the three level pickers into the AC and System FHA
// forms, wraps submit/edit so the levels are stored and the severity select is
// driven (and disabled) while levels are set, and provides the Effects-cell
// renderer the two row builders call. If this file fails to load the FHA works
// exactly as before: typed severity, sentences only.
// ============================================================================
(function () {
    'use strict';
    var G = (typeof window !== 'undefined') ? window : globalThis;
    if (G.SLSeverityAxes) return;

    // Product severity vocabulary (the <select> values): index = level index.
    var CLASSES = ['Negligible', 'Minor', 'Major', 'Hazardous', 'Catastrophic'];
    var CLASS_LABEL = { Negligible: 'No Safety Effect', Minor: 'Minor', Major: 'Major', Hazardous: 'Hazardous', Catastrophic: 'Catastrophic' };
    var AXES = {
        ac: {
            key: 'effAcLevel', label: 'Aircraft', question: 'Reduction in safety margins or functional capabilities',
            levels: ['none', 'slight', 'significant', 'large', 'hull loss'],
            anchors: ['NSE-1', 'MIN-1', 'MAJ-1', 'HAZ-1', 'CAT-1'],
            defs: [
                'No effect on safety margins or functional capabilities (No Safety Effect).',
                'Slight reduction in functional capabilities or safety margins (Minor).',
                'Significant reduction in safety margins or functional capabilities (Major).',
                'Large reduction in functional capabilities or safety margins (Hazardous).',
                'Normally with hull loss; a condition that would prevent continued safe flight and landing (Catastrophic).'
            ],
            evidence: 'How many independent means remain after this failure, and how many further failures until a catastrophic outcome (from the architecture and the fault tree where one exists).'
        },
        crew: {
            key: 'effCrewLevel', label: 'Crew', question: 'Increase in crew workload',
            levels: ['none', 'slight', 'significant', 'large', 'fatalities or incapacitation'],
            anchors: ['NSE-1', 'MIN-2', 'MAJ-2', 'HAZ-2', 'CAT-1'],
            defs: [
                'No effect on flightcrew workload (No Safety Effect).',
                'Slight increase in workload, such as routine flight plan changes (Minor).',
                'A physical discomfort or significant increase in workload or in conditions impairing the efficiency of the flightcrew (Major).',
                'Physical distress or excessive workload such that the flightcrew cannot be relied upon to perform their tasks accurately or completely (Hazardous).',
                'Fatalities or incapacitation (Catastrophic).'
            ],
            evidence: 'The human-factors data for this condition: the credited crew tasks, their response time against the time available, phase occupancy, the alerting that supports detection.'
        },
        pax: {
            key: 'effPaxLevel', label: 'Occupants', question: 'Effect on occupants or other persons excluding flightcrew',
            levels: ['none or slight inconvenience', 'discomfort', 'minor injuries', 'severe injuries or few fatalities', 'multiple fatalities'],
            anchors: ['NSE-1', 'MIN-3', 'MAJ-3', 'HAZ-3', 'CAT-1'],
            defs: [
                'Inconvenience (No Safety Effect).',
                'Physical discomfort (Minor).',
                'Physical distress, possibly including injuries (Major).',
                'Serious or fatal injury to a small number of persons other than the flightcrew (Hazardous).',
                'Multiple fatalities (Catastrophic).'
            ],
            evidence: 'The physical consequence of the aircraft effect in that phase.'
        }
    };
    var ORDER = ['ac', 'crew', 'pax'];

    // A model (or a CSV) may phrase a level loosely — "Hull loss", "loss of the
    // aircraft", "slight inconvenience", "severe injuries". The closed vocabulary
    // still governs: a phrase is accepted only when it names ONE level; anything
    // else is unset (empty), never a guess. Numbers 0–4 are accepted too.
    var SYN = {
        ac:   [['none', 'no effect', 'no reduction'], ['slight'], ['significant'], ['large'], ['hull loss', 'loss of aircraft', 'loss of the aircraft', 'loss of the airplane', 'loss of airplane', 'aircraft lost']],
        crew: [['none', 'no increase', 'no effect'], ['slight'], ['significant'], ['large', 'excessive'], ['fatalities or incapacitation', 'fatalities', 'fatality', 'incapacitation', 'incapacitated']],
        pax:  [['none or slight inconvenience', 'none', 'slight inconvenience', 'inconvenience', 'no effect'], ['discomfort'], ['minor injuries', 'minor injury'], ['severe injuries or few fatalities', 'severe injuries', 'serious injuries', 'few fatalities', 'serious or fatal injury', 'serious injury'], ['multiple fatalities', 'fatalities']]
    };
    function _k(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
    function levelIndex(axis, v) {
        var a = AXES[axis]; if (!a) return -1;
        if (typeof v === 'number' && v >= 0 && v <= 4 && v === Math.floor(v)) return v;
        var s = _k(v); if (!s) return -1;
        var i = a.levels.indexOf(s); if (i >= 0) return i;
        if (/^[0-4]$/.test(s)) return Number(s);
        var hits = [];
        SYN[axis].forEach(function (list, li) { if (list.some(function (w) { return s === w || s.indexOf(w) >= 0; })) hits.push(li); });
        // "fatalities" alone matches two pax levels ("few fatalities" / "multiple fatalities")
        // only via the loose form; exact synonyms win over substring hits.
        if (hits.length !== 1) { var exact = []; SYN[axis].forEach(function (list, li) { if (list.indexOf(s) >= 0) exact.push(li); }); return exact.length === 1 ? exact[0] : -1; }
        return hits[0];
    }
    function normLevel(axis, v) { var i = levelIndex(axis, v); return i >= 0 ? AXES[axis].levels[i] : ''; }
    // The three level fields of any object, normalised to the closed vocabulary.
    function levelsOf(obj) { var o = {}; ORDER.forEach(function (ax) { o[AXES[ax].key] = normLevel(ax, obj && obj[AXES[ax].key]); }); return o; }
    // Severity from whatever levels are present; null when none are set.
    // { severity, governing: [axis…], anchor, idx }
    function derive(row) {
        var best = -1, gov = [];
        // the joint top step applies BEFORE the worst-axis read, so a row that
        // names one catastrophic axis is classified as the whole state it implies
        var _t = (function () { try { return applyTerminal(row || {}).levels; } catch (_) { return null; } })();
        var src = _t || (row || {});
        ORDER.forEach(function (ax) {
            var i = levelIndex(ax, src[AXES[ax].key]);
            if (i < 0) return;
            if (i > best) { best = i; gov = [ax]; } else if (i === best) gov.push(ax);
        });
        if (best < 0) return null;
        return { severity: CLASSES[best], idx: best, governing: gov, anchor: AXES[gov[0]].anchors[best] };
    }
    // ------------------------------------------------------------------------
    // THE TOP STEP IS JOINT (Waqas ruling, 3 Sep 2026): "if you're losing the
    // aircraft, the effect for the other two should be automatically multiple
    // fatalities, there is no further argument, with the assumption the situation
    // is not recoverable with crew action."
    //
    // The anchor table already said so and nobody read it: level 4 on ALL THREE
    // axes maps to the same anchor, CAT-1. The catastrophic step is not three
    // independent judgments, it is ONE joint end state — the aircraft is lost,
    // and everyone aboard, crew included, is in it. So any axis at its top step
    // carries the other two there.
    //
    // What this kills, measured on the Vayu AFHA run of 3 Sep: rows crediting a
    // survivable aircraft state and a working pilot alongside dead occupants
    // (SF-002-M2: large / large / multiple fatalities), and rows leaving the crew
    // axis EMPTY beside hull loss and multiple fatalities (SF-005-M) — the model
    // hedging the aircraft and crew axes to the moment before the crash and
    // putting the crash itself on the occupant axis alone. All three axes must
    // describe the SAME credited outcome; below the top step they stay free.
    //
    // The standing assumption this rests on, recorded on every row it fires on.
    var TERMINAL_ASSUMPTION = 'Hull loss is credited as not recoverable by crew action, so the crew and occupant outcomes follow from it (ARP4761A Table A6 CAT-1: multiple fatalities, usually with the loss of the aircraft).';
    var TOP = 4;
    // Returns { levels, changed:[axis…], assumption } — levels always complete at
    // the top step. Never LOWERS an axis; only raises the other two to meet the
    // worst. A row with no axis at the top step comes back untouched.
    function applyTerminal(row) {
        var levels = levelsOf(row), changed = [];
        var terminal = ORDER.some(function (ax) { return levelIndex(ax, levels[AXES[ax].key]) === TOP; });
        if (!terminal) return { levels: levels, changed: changed, assumption: '' };
        ORDER.forEach(function (ax) {
            var k = AXES[ax].key;
            if (levelIndex(ax, levels[k]) !== TOP) { changed.push(ax); levels[k] = AXES[ax].levels[TOP]; }
        });
        return { levels: levels, changed: changed, assumption: changed.length ? TERMINAL_ASSUMPTION : '' };
    }
    // Human sentence for what the determination did, for the row's comments.
    function terminalNote(res) {
        if (!res || !res.changed || !res.changed.length) return '';
        return 'Top step is joint: ' + res.changed.map(function (ax) { return AXES[ax].label.toLowerCase() + ' set to "' + AXES[ax].levels[TOP] + '"'; }).join(' and ')
             + ' because another axis is at the catastrophic step. ' + TERMINAL_ASSUMPTION;
    }
    function hasLevels(row) { return ORDER.some(function (ax) { return levelIndex(ax, row && row[AXES[ax].key]) >= 0; }); }
    function rationale(row) {
        var d = derive(row); if (!d) return '';
        // read the parts off the PROPAGATED levels, so a row whose crew axis the
        // joint top step just filled never prints "Crew —" beside a catastrophic class
        var _lv = (function () { try { return applyTerminal(row).levels; } catch (_) { return row; } })();
        var parts = ORDER.map(function (ax) { var i = levelIndex(ax, _lv[AXES[ax].key]); return AXES[ax].label + ' ' + (i >= 0 ? AXES[ax].levels[i] : '—'); });
        // Rule 22 — descriptive, not internal shorthand. Three governing axes is the
        // joint catastrophic state, not a list of three things each "governing".
        var who = (d.governing.length === ORDER.length)
            ? 'all three axes at the catastrophic step'
            : (d.governing.map(function (ax) { return AXES[ax].label.toLowerCase(); }).join(' and ') + (d.governing.length > 1 ? ' axes govern' : ' axis governs'));
        return parts.join(' · ') + ' → ' + CLASS_LABEL[d.severity] + ' (' + who + ')';
    }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    // ---- the Effects cell: level chip + the sentence that justifies it ----------
    // 11 Sep 2026 — level chips take the app-wide severity fills (safety_lab.css .sev-axis-chip[data-level]); no private colours here.
    var CHIP = { 0: '', 1: '', 2: '', 3: '', 4: '' };
    function effectsHtml(row) {
        return ORDER.map(function (ax) {
            var a = AXES[ax], i = levelIndex(ax, row && row[a.key]);
            var chip = i >= 0 ? '<span class="sev-axis-chip" data-level="' + i + '" title="' + esc(a.question + ': ' + a.defs[i]) + '" style="display:inline-block;font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:1px 6px;border-radius:999px;margin-right:6px;' + CHIP[i] + '">' + esc(a.levels[i]) + '</span>' : '';
            // 5 Sep 2026 (levers 2 + 3) — a level set BY RULE says so beside the chip: from the
            // MAC rule, from the Task Analysis, or by the escape rule (No Safety Effect).
            var _dv = (row && row.derived && row.derived[ax]) ? String(row.derived[ax]) : '';
            if (chip && _dv) chip += '<span class="sev-axis-derived" title="' + esc(_dv === 'MAC' ? 'Derived from the MAC rule for this function, not judged.' : (_dv === 'HF' ? 'Derived from the crew Task Analysis (occupancy against the 60% / 80% lines), not judged.' : 'Set by the escape rule: the effect is not realized in these phases and the flight can be escaped.')) + '" style="font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--color-text-tertiary);margin-right:6px;cursor:help;">' + esc(_dv === 'escape' ? 'by rule' : 'from ' + _dv) + '</span>';
            var sentenceKey = ax === 'ac' ? 'effAc' : (ax === 'crew' ? 'effCrew' : 'effPax');
            // 3 Sep 2026 — AN ABSTENTION IS NOT A LEVEL. This printed the word
            // "None" for an empty sentence, which reads as "no effect on the crew"
            // and is indistinguishable from a real level of none. Waqas, on
            // SF-005-M (hull loss / — / multiple fatalities): "how is the crew
            // surviving here with the aircraft lost and passengers dead?" — it was
            // not; the row said nothing and the cell made silence look like an
            // answer. Blank now reads as blank, in the muted abstention style.
            var sentence = (row && row[sentenceKey]) ? esc(row[sentenceKey]) : '';
            var stated = (i >= 0) || !!sentence;
            var body = stated ? (sentence || '<span style="opacity:.65">level only — no effect stated</span>')
                              : '<span style="opacity:.65;font-style:italic">not stated</span>';
            return '<strong>' + esc(ax === 'pax' ? 'Pax' : (ax === 'ac' ? 'AC' : 'Crew')) + ':</strong> ' + chip + body;
        }).join('<br>');
    }

    // ---- the forms: three level pickers under the three effect inputs ----------
    function _sel(prefix, ax) { return document.getElementById(prefix + '-lvl-' + ax); }
    function _injectPickers(prefix) {
        try {
            var acIn = document.getElementById(prefix + '-eff-ac'); if (!acIn) return false;
            var grid = acIn.parentNode; if (!grid || document.getElementById(prefix + '-lvl-ac')) return true;
            var wrap = document.createElement('div');
            wrap.className = 'grid-3-col sev-axes-grid'; wrap.style.marginTop = '6px';
            wrap.innerHTML = ORDER.map(function (ax) {
                var a = AXES[ax];
                var opts = ['<option value="">' + esc(a.question) + ' — level…</option>'].concat(a.levels.map(function (l, i) { return '<option value="' + esc(l) + '" title="' + esc(a.defs[i]) + '">' + esc(a.label + ': ' + l) + ' → ' + esc(CLASS_LABEL[CLASSES[i]]) + '</option>'; })).join('');
                return '<select id="' + prefix + '-lvl-' + ax + '" data-sev-axis="' + ax + '" title="' + esc(a.question + '. Evidence: ' + a.evidence) + '">' + opts + '</select>';
            }).join('');
            grid.parentNode.insertBefore(wrap, grid.nextSibling);
            var note = document.createElement('div');
            note.id = prefix + '-sev-derived-note';
            note.style.cssText = 'font-size:11px;color:var(--color-text-tertiary);margin-top:4px;';
            wrap.parentNode.insertBefore(note, wrap.nextSibling);
            ORDER.forEach(function (ax) { _sel(prefix, ax).addEventListener('change', function () { _driveSeverity(prefix); }); });
            _driveSeverity(prefix);
            return true;
        } catch (_) { return false; }
    }
    function _readLevels(prefix) { var o = {}; ORDER.forEach(function (ax) { var el = _sel(prefix, ax); o[AXES[ax].key] = el ? normLevel(ax, el.value) : ''; }); return o; }
    function _writeLevels(prefix, row) { ORDER.forEach(function (ax) { var el = _sel(prefix, ax); if (el) el.value = normLevel(ax, row && row[AXES[ax].key]); }); _driveSeverity(prefix); }
    // While any level is set the class is derived and the select is read-only;
    // clear the levels to classify by hand (that IS the recorded override).
    function _driveSeverity(prefix) {
        var sev = document.getElementById(prefix + '-sev'), note = document.getElementById(prefix + '-sev-derived-note'); if (!sev) return;
        // the joint top step, applied to the pickers themselves: name one
        // catastrophic axis and the other two are set and locked, with the
        // assumption stated under them. Clear it and they are free again.
        var _raw = _readLevels(prefix), _t = applyTerminal(_raw);
        if (_t.changed.length) {
            ORDER.forEach(function (ax) { var el = _sel(prefix, ax); if (el) el.value = _t.levels[AXES[ax].key]; });
        }
        var _isTerminal = ORDER.some(function (ax) { return levelIndex(ax, _t.levels[AXES[ax].key]) === TOP; });
        ORDER.forEach(function (ax) {
            var el = _sel(prefix, ax); if (!el) return;
            var lead = levelIndex(ax, _raw[AXES[ax].key]) === TOP;
            el.disabled = !!(_isTerminal && !lead && _t.changed.indexOf(ax) >= 0);
            el.title = el.disabled ? TERMINAL_ASSUMPTION : (AXES[ax].question + '. Evidence: ' + AXES[ax].evidence);
        });
        var d = derive(_t.levels);
        if (d) { sev.value = d.severity; sev.disabled = true; sev.title = 'Derived from the three effect levels — clear the levels to classify by hand.'; if (note) note.textContent = 'Severity derived: ' + rationale(_t.levels) + '.' + (_t.changed.length ? (' ' + terminalNote(_t)) : ''); }
        else { sev.disabled = false; sev.title = ''; if (note) note.textContent = 'Set the three effect levels and the severity is derived from the worst axis; leave them blank to classify by hand.'; }
    }

    // ---- wrap submit / edit for both forms -------------------------------------
    function _wrap(name, fn) {
        if (typeof G[name] !== 'function' || G[name]._sevAxesWrapped) return false;
        var orig = G[name];
        var wrapped = function () { return fn.call(this, orig, arguments); };
        wrapped._sevAxesWrapped = true;
        try { if (G.SLWrap) G.SLWrap.preserve(orig, wrapped); } catch (_) {}
        G[name] = wrapped;
        return true;
    }
    function _storeFor(prefix) {
        try {
            if (prefix === 'ac-fha') return (typeof acFhaData !== 'undefined') ? acFhaData : null;
            var s = (typeof sys === 'function') ? sys() : null; return s && Array.isArray(s.fha) ? s.fha : null;
        } catch (_) { return null; }
    }
    function _wireForm(prefix, submitName, editName) {
        _wrap(submitName, function (orig, args) {
            _injectPickers(prefix);
            var _t0 = applyTerminal(_readLevels(prefix));
            var levels = _t0.levels;          // the joint top step is stored, not just displayed
            var d = derive(levels);
            var sev = document.getElementById(prefix + '-sev');
            var before = _storeFor(prefix); var ids = before ? before.map(function (r) { return String(r.internalId); }) : [];
            var editing = null; try { editing = (typeof editStates !== 'undefined') ? (prefix === 'ac-fha' ? editStates.acFha : editStates.sysFha) : null; } catch (_) {}
            if (sev && d) { sev.disabled = false; sev.value = d.severity; }          // the disabled select must still submit the derived class
            var r = orig.apply(this, args);
            try {
                var store = _storeFor(prefix); if (store) {
                    var row = editing ? store.find(function (x) { return String(x.internalId) === String(editing); }) : store.find(function (x) { return ids.indexOf(String(x.internalId)) < 0; });
                    if (row) { ORDER.forEach(function (ax) { row[AXES[ax].key] = levels[AXES[ax].key] || ''; }); if (d) { row.severity = d.severity; row.sevBasis = d.anchor; } }
                }
            } catch (_) {}
            try { _writeLevels(prefix, {}); } catch (_) {}
            return r;
        });
        _wrap(editName, function (orig, args) {
            var r = orig.apply(this, args);
            try { _injectPickers(prefix); var store = _storeFor(prefix); var row = store && store.find(function (x) { return String(x.internalId) === String(args[0]); }); _writeLevels(prefix, row || {}); } catch (_) {}
            return r;
        });
    }
    function boot() {
        var tries = 0, iv = setInterval(function () {
            _injectPickers('ac-fha'); _injectPickers('sys-fha');
            _wireForm('ac-fha', 'submitACFHA', 'editACFHA');
            _wireForm('sys-fha', 'submitSysFHA', 'editSysFHA');
            var done = G.submitACFHA && G.submitACFHA._sevAxesWrapped && G.submitSysFHA && G.submitSysFHA._sevAxesWrapped;
            if (done || ++tries > 40) clearInterval(iv);
        }, 300);
    }
    if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot(); }

    G.SLSeverityAxes = { _v: '1.3', AXES: AXES, ORDER: ORDER, CLASSES: CLASSES, CLASS_LABEL: CLASS_LABEL, levelIndex: levelIndex, normLevel: normLevel, levelsOf: levelsOf, derive: derive, applyTerminal: applyTerminal, terminalNote: terminalNote, TERMINAL_ASSUMPTION: TERMINAL_ASSUMPTION, TOP: TOP, hasLevels: hasLevels, rationale: rationale, effectsHtml: effectsHtml };
})();
