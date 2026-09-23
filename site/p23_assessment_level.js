// ============================================================================
// p23_assessment_level.js — v1.0 — Part 23 Assessment Level from ASTM F3230
// Table 3 (23 Sep 2026, standards gap G1).
//
// WHY: the app used to ask for "Part 23 Class I–IV" with the old AC 23.1309-1E
// wording ("single recip ≤ 6,000 lb" …). Since Part 23 Amendment 64 the
// aeroplane has a CERTIFICATION LEVEL (1–4, by passenger seats, 14 CFR
// §23.2005), and ASTM F3230 §4.2 Table 3 (Assessment Level Selection Matrix)
// picks the Assessment Level I–IV from two inputs: that certification level and
// the propulsion (reciprocating/electric or turbine; one engine or more). The
// probability targets (safety_targets.js "Part 23 I–IV") and DALs were already
// right; the way the row was chosen could put a user on the wrong row.
//
// WHAT: ask the two questions, derive the level, store all three:
//   projectConfig.part23CertLevel   '1'..'4'
//   projectConfig.part23Propulsion  'recip-1' | 'recip-multi' | 'turbine-1' |
//                                   'turbine-multi' | 'other'
//   projectConfig.part23Class       'I'..'IV'  (the key everything else reads)
//   projectConfig.part23ManualLevel 'I'..'IV'  only for 'other': the level the
//                                   user picked by hand (so a class left over
//                                   from an earlier pick is never passed off
//                                   as a manual choice)
// 'other' (hybrids, eVTOL, unique architectures) is outside Table 3 (its
// note B): the user picks the level agreed with the authority, and it is
// recorded as a manual choice.
// A project saved before this change has part23Class only. It keeps its class
// untouched and is shown as "not yet confirmed" until the two inputs are given.
// The grid below is facts from the table (a lookup), not the standard's text.
// See tests/regression_p23_assessment_level.test.js.
// ============================================================================
(function (root) {
    'use strict';

    var CERT_LEVELS = [
        { v: '1', label: 'Level 1 — 0 to 1 passenger seats' },
        { v: '2', label: 'Level 2 — 2 to 6 passenger seats' },
        { v: '3', label: 'Level 3 — 7 to 9 passenger seats' },
        { v: '4', label: 'Level 4 — 10 to 19 passenger seats' }
    ];
    var PROPULSION = [
        { v: 'recip-1',       label: 'One reciprocating or electric engine' },
        { v: 'recip-multi',   label: 'More than one reciprocating or electric engine' },
        { v: 'turbine-1',     label: 'One turbine engine' },
        { v: 'turbine-multi', label: 'More than one turbine engine' },
        { v: 'other',         label: 'Hybrid, eVTOL or other (outside Table 3)' }
    ];
    // F3230 Table 3: rows = certification level, columns = propulsion.
    var GRID = {
        '1': { 'recip-1': 'I',   'recip-multi': 'II',  'turbine-1': 'II',  'turbine-multi': 'II'  },
        '2': { 'recip-1': 'I',   'recip-multi': 'II',  'turbine-1': 'II',  'turbine-multi': 'II'  },
        '3': { 'recip-1': 'III', 'recip-multi': 'III', 'turbine-1': 'III', 'turbine-multi': 'III' },
        '4': { 'recip-1': 'IV',  'recip-multi': 'IV',  'turbine-1': 'IV',  'turbine-multi': 'IV'  }
    };
    var LEVELS = ['I', 'II', 'III', 'IV'];

    // The Assessment Level for a pair, or null when Table 3 does not decide it.
    function assessmentLevel(certLevel, propulsion) {
        var row = GRID[String(certLevel)];
        return (row && row[propulsion]) || null;
    }

    // Where a config stands: { level, source: 'table3' | 'manual' | 'pending' | 'legacy' | 'none', note }
    function status(cfg) {
        cfg = cfg || {};
        var lvl = cfg.part23CertLevel, prop = cfg.part23Propulsion, cls = cfg.part23Class;
        var derived = assessmentLevel(lvl, prop);
        if (derived) return { level: derived, source: 'table3', note: 'Assessment Level ' + derived + ' from F3230 Table 3 (certification level ' + lvl + ', ' + _label(PROPULSION, prop).toLowerCase() + ').' };
        if (prop === 'other' && LEVELS.indexOf(cls) !== -1 && cfg.part23ManualLevel === cls)
            return { level: cls, source: 'manual', note: 'Assessment Level ' + cls + ' chosen by hand: this propulsion is outside F3230 Table 3. Record the level agreed with the certifying authority.' };
        if (prop === 'other')
            return { level: LEVELS.indexOf(cls) !== -1 ? cls : null, source: 'pending', note: 'This propulsion is outside F3230 Table 3: pick the Assessment Level agreed with the certifying authority.' + (LEVELS.indexOf(cls) !== -1 ? ' Until then Level ' + cls + ' stays in force.' : '') };
        if (LEVELS.indexOf(cls) !== -1)
            return { level: cls, source: 'legacy', note: 'Class ' + cls + ' was picked before the app asked for certification level and propulsion. Give both to confirm it against F3230 Table 3.' };
        return { level: null, source: 'none', note: 'Give the certification level and propulsion.' };
    }

    // Apply a pick to a config. Returns the resulting status. Never clears an
    // existing class when the pick is incomplete.
    function apply(cfg, certLevel, propulsion, manualLevel) {
        if (!cfg) return status(cfg);
        if (certLevel != null && certLevel !== '') cfg.part23CertLevel = String(certLevel);
        if (propulsion != null && propulsion !== '') cfg.part23Propulsion = propulsion;
        var d = assessmentLevel(cfg.part23CertLevel, cfg.part23Propulsion);
        if (d) { cfg.part23Class = d; delete cfg.part23ManualLevel; }
        else if (cfg.part23Propulsion === 'other' && LEVELS.indexOf(manualLevel) !== -1) { cfg.part23Class = manualLevel; cfg.part23ManualLevel = manualLevel; }
        return status(cfg);
    }

    function _label(list, v) { for (var i = 0; i < list.length; i++) if (list[i].v === v) return list[i].label; return String(v || ''); }
    function _esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function _opts(list, sel, placeholder) {
        return '<option value=""' + (sel ? '' : ' selected') + ' disabled>' + _esc(placeholder) + '</option>' +
            list.map(function (o) { return '<option value="' + _esc(o.v) + '"' + (o.v === sel ? ' selected' : '') + '>' + _esc(o.label) + '</option>'; }).join('');
    }

    // The picker's HTML: two selects, a manual-level select (only for 'other'),
    // and a line saying what was derived. `prefix` makes the ids unique;
    // `onchange` is the handler source both selects call.
    function pickerHTML(prefix, cfg, onchange) {
        cfg = cfg || {};
        var st = status(cfg), oc = onchange ? ' onchange="' + _esc(onchange) + '"' : '';
        var manual = cfg.part23Propulsion === 'other';
        return '<div class="p23-picker" id="' + prefix + '-wrap">' +
            '<select class="state-select" id="' + prefix + '-level"' + oc + ' style="width:100%; margin-bottom:6px;">' + _opts(CERT_LEVELS, cfg.part23CertLevel, 'Certification level (14 CFR §23.2005)…') + '</select>' +
            '<select class="state-select" id="' + prefix + '-prop"' + oc + ' style="width:100%; margin-bottom:6px;">' + _opts(PROPULSION, cfg.part23Propulsion, 'Propulsion…') + '</select>' +
            '<select class="state-select" id="' + prefix + '-manual"' + oc + ' style="width:100%; margin-bottom:6px;' + (manual ? '' : ' display:none;') + '">' +
                _opts(LEVELS.map(function (l) { return { v: l, label: 'Assessment Level ' + l + ' (agreed with the authority)' }; }), manual ? (cfg.part23ManualLevel || '') : '', 'Assessment Level agreed with the authority…') + '</select>' +
            '<div id="' + prefix + '-note" class="p23-note" style="font-size:12px; margin-bottom:8px; color:var(--color-text-secondary);">' + _esc(st.note) + '</div>' +
            '</div>';
    }
    // Read a picker back: { certLevel, propulsion, manual }
    function readPicker(prefix, doc) {
        doc = doc || (typeof document !== 'undefined' ? document : null);
        var g = function (s) { var el = doc && doc.getElementById(prefix + '-' + s); return el ? el.value : ''; };
        return { certLevel: g('level'), propulsion: g('prop'), manual: g('manual') };
    }
    // After a change: apply to cfg, show/hide the manual select, refresh the note.
    function syncPicker(prefix, cfg, doc) {
        doc = doc || (typeof document !== 'undefined' ? document : null);
        var r = readPicker(prefix, doc);
        var st = apply(cfg, r.certLevel, r.propulsion, r.manual);
        var m = doc && doc.getElementById(prefix + '-manual');
        if (m) m.style.display = cfg.part23Propulsion === 'other' ? '' : 'none';
        var n = doc && doc.getElementById(prefix + '-note');
        if (n) n.textContent = st.note;
        return st;
    }

    var api = { CERT_LEVELS: CERT_LEVELS, PROPULSION: PROPULSION, GRID: GRID, assessmentLevel: assessmentLevel,
        status: status, apply: apply, pickerHTML: pickerHTML, readPicker: readPicker, syncPicker: syncPicker };
    try { root.SLP23 = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
