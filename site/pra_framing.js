// ============================================================================
// pra_framing.js — v1.0 — Q11 (27 Sep 2026): the survivability framing of the
// particular risk analysis.
//
// A particular risk is not a failure with a rate. It is an event taken as
// certain (probability 1: the bird hits, the disc lets go, the lightning
// attaches) and the analysis asks what survives it (ARP4761A Appendix L;
// AC 25.1309-1B treats these as events outside the §25.1309 numbers). Three
// things follow, and this module puts each one on the PRA page:
//
//   1. The framing, stated at the top of the page in one paragraph, so nobody
//      reads a PRA row as "probability times consequence".
//   2. The library grouped by the NATURE of the risk, the way the analysis is
//      actually done: proximity (what sits next to it: fire, leaks, thermal
//      runaway, a duct that lets go), trajectory (something that flies:
//      rotor, blade, tire, shaft, shed ice, bird), environmental (lightning,
//      HIRF, hail and ice, ash), structural (a pressure boundary that fails).
//      The regulatory categories of the catalog stay; the nature is added on
//      top, in the catalog browser and on the row.
//   3. Where a Catastrophic outcome cannot be designed out (fire, rotor burst)
//      the row needs a written minimization argument: what was done to make
//      the outcome as unlikely and as survivable as it can be, and why that is
//      enough. A row with a scenario classified Catastrophic (pra_scenarios.js:
//      worst linked failure condition) and accepted without such an argument
//      is a finding on the row, on the wall (INV-64, advisory) and the form
//      refuses to log that row until the argument is written.
//
// Reads through SLEnv (rule 5) with direct-identifier fallback. No eval.
// window.SLPraFraming + module.exports (tests).
// ============================================================================
(function (root) {
    'use strict';
    var NATURES = [
        { id: 'proximity',     label: 'Proximity',     blurb: 'a threat from what sits next to the equipment: fire, leaking fluid, a hot or bursting part' },
        { id: 'trajectory',    label: 'Trajectory',    blurb: 'a threat that flies: released rotating parts, shed ice, tread, a bird' },
        { id: 'environmental', label: 'Environmental', blurb: 'a threat from outside the aircraft that reaches many zones at once' },
        { id: 'structural',    label: 'Structural',    blurb: 'a pressure or load boundary that gives way' }
    ];
    // catalog id → nature. Anything unlisted is classified by words in its name.
    var NATURE_BY_ID = {
        'rotor-burst': 'trajectory', 'blade-out': 'trajectory', 'tire-burst': 'trajectory', 'flailing-shaft': 'trajectory', 'high-energy-stored': 'trajectory',
        'rat-burst': 'trajectory', 'wheel-flange-release': 'trajectory', 'ice-shedding': 'trajectory', 'bird-strike': 'trajectory',
        'cargo-fire': 'proximity', 'in-flight-fire': 'proximity', 'engine-fire': 'proximity', 'fuel-leakage': 'proximity', 'battery-thermal-runaway': 'proximity',
        'hp-duct-rupture': 'proximity', 'chemical-container-rupture': 'proximity',
        'lightning': 'environmental', 'hirf': 'environmental', 'hail-ice': 'environmental', 'volcanic-ash': 'environmental',
        'rapid-decompression': 'structural', 'pressure-bulkhead-rupture': 'structural'
    };
    var FRAMING = 'Each particular risk on this page is taken as certain: the event happens (probability 1). The analysis is not a rate times a consequence; it asks what the event can reach, what it takes out together, and whether continued safe flight and landing survives it. Where a Catastrophic outcome cannot be designed out, the row carries a written minimization argument: what makes the outcome as unlikely and as survivable as it can be, and why that is enough (ARP4761A Appendix L).';

    function _g(name) {
        try { if (root.SLEnv && typeof root.SLEnv.get === 'function') { var v = root.SLEnv.get(name); if (v !== undefined) return v; } } catch (_) {}
        try {
            switch (name) {
                case 'praData': return (typeof praData !== 'undefined') ? praData : root.praData;
                case 'editStates': return (typeof editStates !== 'undefined') ? editStates : root.editStates;
            }
        } catch (_) {}
        return root[name];
    }
    function _arr(v) { return Array.isArray(v) ? v : []; }
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function _blank(s) { return !String(s == null ? '' : s).trim(); }
    function _scn() { return root.SLPraScenarios || null; }
    function _name(row) { return row ? (row.praId || ('PRA#' + row.internalId)) : ''; }

    // ---- nature ------------------------------------------------------------------------
    function natureOf(idOrRow) {
        var id = '', name = '';
        if (idOrRow && typeof idOrRow === 'object') { id = String(idOrRow.prCatalogueRef || idOrRow.id || ''); name = String(idOrRow.threat || idOrRow.name || ''); }
        else id = String(idOrRow || '');
        if (NATURE_BY_ID[id]) return NATURE_BY_ID[id];
        var s = (id + ' ' + name).toLowerCase();
        if (/burst|blade|rotor|shaft|tread|tire|tyre|flail|shed|bird|debris|release|fragment/.test(s)) return 'trajectory';
        if (/lightning|hirf|hail|ice|ash|electromagnetic|environment|rain|snow/.test(s)) return 'environmental';
        if (/decompress|bulkhead|pressure boundary|structural/.test(s)) return 'structural';
        if (/fire|leak|thermal|runaway|duct|overheat|chemical|fluid|hot/.test(s)) return 'proximity';
        return '';
    }
    function natureLabel(id) { var n = null; NATURES.some(function (x) { if (x.id === id) { n = x; return true; } return false; }); return n ? n.label : ''; }
    function grouped(catalog) {
        var out = {}; NATURES.forEach(function (n) { out[n.id] = []; }); out[''] = [];
        _arr(catalog).forEach(function (e) { if (e) out[natureOf(e)].push(e); });
        return out;
    }
    function natureStripHtml(catalog) {
        var g = grouped(catalog);
        return '<div data-pf-natures="1" style="margin:0 0 14px;padding:10px 12px;border:1px solid var(--color-border-hair);border-left:3px solid #9d174d;border-radius:var(--r-md);background:var(--color-surface-2);">'
            + '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-text-tertiary);font-weight:600;margin-bottom:6px;">By nature of the risk</div>'
            + NATURES.map(function (n) {
                var items = g[n.id];
                return '<div style="font-size:12px;margin:3px 0;"><b>' + _esc(n.label) + '</b> <span style="color:var(--color-text-tertiary);">(' + _esc(n.blurb) + ')</span>: '
                    + (items.length ? items.map(function (e) { return '<a href="#" onclick="selectPRCatalogueEntry(\'' + _esc(e.id) + '\');return false;">' + _esc(e.name) + '</a>'; }).join(' · ') : '<span style="color:var(--color-text-tertiary);">none in the catalog</span>') + '</div>';
            }).join('')
            + (g[''].length ? '<div style="font-size:12px;margin:3px 0;"><b>Unclassified</b>: ' + g[''].map(function (e) { return _esc(e.name); }).join(' · ') + '</div>' : '')
            + '</div>';
    }
    function naturePill(row) {
        var n = natureOf(row); if (!n) return '';
        return '<span data-pf-nature="' + n + '" class="u-mono" title="Nature of the risk" style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:9px;font-size:10px;font-weight:700;background:var(--color-surface-2);border:1px solid var(--color-border-hair);color:var(--color-text-secondary);">' + _esc(natureLabel(n)) + '</span>';
    }

    // ---- minimization ------------------------------------------------------------------
    // A Catastrophic scenario that is accepted (or still open) is a Catastrophic outcome
    // the design keeps; an argument is owed. One marked "not acceptable" is a pending
    // design change, nothing is owed yet.
    function catScenarios(row) {
        var S = _scn(); if (!S || !row) return [];
        return _arr(row.scenarios).filter(function (s) { return s && S.classification(s) === 'Catastrophic' && s.acceptable !== 'no'; });
    }
    function status(row) {
        var S = _scn();
        if (!row || (S && !S.applicable(row))) return { kind: 'na', text: '' };
        var cat = catScenarios(row);
        if (!cat.length) return { kind: 'none', text: '' };
        if (_blank(row.minimization)) return { kind: 'gap', cat: cat, text: _name(row) + ': ' + cat.length + ' Catastrophic scenario' + (cat.length === 1 ? '' : 's') + ' kept (' + cat.map(function (s) { return s.scnId || '?'; }).join(', ') + ') with no minimization argument' };
        return { kind: 'ok', cat: cat, text: _name(row) + ': minimization argument on record for ' + cat.length + ' Catastrophic scenario' + (cat.length === 1 ? '' : 's') };
    }
    function findings() {
        var out = [];
        _arr(_g('praData')).forEach(function (r) { var s = status(r); if (s.kind === 'gap') out.push({ row: r, text: s.text }); });
        return out;
    }
    var INV = { id: 'INV-64', sev: 'advisory',
        name: 'Every particular risk that keeps a Catastrophic scenario carries a written minimization argument (ARP4761A Appendix L survivability framing)',
        run: function () { var n = _arr(_g('praData')).filter(function (r) { return status(r).kind !== 'na' && catScenarios(r).length; }).length; var f = findings(); return { checked: n, fails: f.slice(0, 20).map(function (x) { return x.text; }), failCount: f.length }; } };
    (function reg(tries) {
        if (typeof root.invRegister === 'function') { try { root.invRegister(INV); } catch (_) {} return; }
        if (tries > 0 && typeof setTimeout === 'function') setTimeout(function () { reg(tries - 1); }, 50);
    })(40);
    function badgeHtml(row) {
        var s = status(row);
        if (s.kind === 'gap') return '<span data-pf-badge="gap" title="' + _esc(s.text) + '" style="display:inline-block;margin-left:6px;padding:1px 7px;font-size:10px;font-weight:700;border-radius:9px;border:1px solid #8E2A2A;color:#8E2A2A;background:var(--color-surface-2);white-space:nowrap;">minimization argument needed</span>';
        if (s.kind === 'ok') return '<span data-pf-badge="ok" title="' + _esc(s.text + '\n\n' + row.minimization) + '" style="display:inline-block;margin-left:6px;padding:1px 7px;font-size:10px;font-weight:700;border-radius:9px;border:1px solid #1D9E75;color:#1D9E75;background:var(--color-surface-2);white-space:nowrap;">minimized</span>';
        return '';
    }
    // The form gate. Called before the original submit; true = the save may go on.
    function formOk() {
        var d = root.document; if (!d) return true;
        var field = d.getElementById('pra-minimization'); if (!field) return true;
        var es = _g('editStates'); var editing = es && es.pra;
        if (editing == null) return true;   // a new row has no scenarios yet
        var row = null; _arr(_g('praData')).some(function (r) { if (r && String(r.internalId) === String(editing)) { row = r; return true; } return false; });
        if (!row || !catScenarios(row).length || !_blank(field.value)) return true;
        try { if (typeof root.showToast === 'function') root.showToast(_name(row) + ' keeps a Catastrophic scenario. Write the minimization argument before logging: what makes the outcome as unlikely and as survivable as it can be, and why that is enough.', 'warning', 7000); } catch (_) {}
        try { field.focus(); field.style.outline = '2px solid var(--color-warning)'; setTimeout(function () { field.style.outline = ''; }, 2500); } catch (_) {}
        return false;
    }
    function _wrapSubmit() {
        var orig = root.submitPRA;
        if (typeof orig !== 'function' || orig._pfWrapped) return false;
        var w = function () {
            if (!formOk()) return;
            var d = root.document; var field = d && d.getElementById('pra-minimization');
            var text = field ? String(field.value || '') : null;
            var es = _g('editStates'); var editing = es && es.pra;
            var before = _arr(_g('praData')).length;
            var r = orig.apply(this, arguments);
            try {
                var rows = _arr(_g('praData'));
                var target = null;
                if (editing != null) rows.some(function (x) { if (x && String(x.internalId) === String(editing)) { target = x; return true; } return false; });
                else if (rows.length > before) target = rows[rows.length - 1] || null;   // a refused save adds no row and writes nothing
                if (target && text != null) target.minimization = text;
                if (field) field.value = '';
            } catch (_) {}
            return r;
        };
        w._pfWrapped = true; root.submitPRA = w; return true;
    }
    function _wrapEdit() {
        var orig = root.editPRA;
        if (typeof orig !== 'function' || orig._pfWrapped) return false;
        var w = function (iid) {
            var r = orig.apply(this, arguments);
            try { var d = root.document; var field = d && d.getElementById('pra-minimization'); if (field) { var row = null; _arr(_g('praData')).some(function (x) { if (x && String(x.internalId) === String(iid)) { row = x; return true; } return false; }); field.value = row ? String(row.minimization || '') : ''; } } catch (_) {}
            return r;
        };
        w._pfWrapped = true; root.editPRA = w; return true;
    }

    // ---- page surfaces --------------------------------------------------------------------
    function framingHtml() {
        return '<b style="color:var(--color-text-primary);">Taken as certain.</b> ' + _esc(FRAMING);
    }
    function installFraming() {
        var d = root.document; if (!d) return false;
        if (d.getElementById('pf-framing')) return false;
        var view = d.getElementById('view-pra'); if (!view) return false;
        var hint = view.querySelector('.cfg-hint'); if (!hint || !hint.parentNode) return false;
        var box = d.createElement('div'); box.id = 'pf-framing';
        box.style.cssText = 'font-size:12px;line-height:1.5;color:var(--color-text-secondary);border:1px solid var(--color-border-hair);border-left:3px solid #9d174d;border-radius:var(--r-md);padding:8px 12px;margin:0 0 10px;';
        box.innerHTML = framingHtml();
        hint.parentNode.insertBefore(box, hint.nextSibling);
        return true;
    }
    function installField() {
        var d = root.document; if (!d) return false;
        if (d.getElementById('pra-minimization')) return false;
        var mit = d.getElementById('pra-mitigation'); if (!mit || !mit.parentNode) return false;
        var lab = d.createElement('label'); lab.innerHTML = 'Minimization argument <span style="font-weight:400;color:var(--color-text-tertiary);text-transform:none;letter-spacing:0;">— required when the row keeps a Catastrophic scenario: what makes the outcome as unlikely and as survivable as it can be, and why that is enough</span>';
        var ta = d.createElement('textarea'); ta.id = 'pra-minimization'; ta.rows = 3; ta.setAttribute('spellcheck', 'true'); ta.setAttribute('placeholder', 'e.g. disc fragments cannot be contained; the three hydraulic runs are routed outside the ±15° band, the fuel feed is shielded, and the remaining exposure is one run at 3° which loses one of three systems.');
        mit.parentNode.insertBefore(ta, mit.nextSibling);
        mit.parentNode.insertBefore(lab, ta);
        return true;
    }
    function decorateTable() {
        var d = root.document; if (!d) return 0;
        var tbody = d.getElementById('pra-body'); if (!tbody) return 0;
        var rows = _arr(_g('praData')); var byId = {}; rows.forEach(function (r) { if (r) byId[String(r.internalId)] = r; });
        var n = 0;
        Array.prototype.forEach.call(tbody.querySelectorAll('tr'), function (tr, i) {
            if (tr.getAttribute('data-pf') === '1') return;
            var r = byId[String(tr.getAttribute('data-iid'))] || rows[i]; if (!r) return;
            var cells = tr.querySelectorAll('td');
            if (cells.length > 2) cells[2].insertAdjacentHTML('beforeend', naturePill(r));
            if (cells.length > 8) cells[8].insertAdjacentHTML('beforeend', badgeHtml(r));
            tr.setAttribute('data-pf', '1'); n++;
        });
        return n;
    }
    function _wrapBrowser() {
        var orig = root.openPRCatalogueBrowser;
        if (typeof orig !== 'function' || orig._pfWrapped) return false;
        var w = function () {
            var r = orig.apply(this, arguments);
            try {
                var d = root.document; var ov = d && d.getElementById('_prCatOverlay');
                var cat = (typeof PARTICULAR_RISK_CATALOGUE !== 'undefined') ? PARTICULAR_RISK_CATALOGUE : root.PARTICULAR_RISK_CATALOGUE;
                if (ov && cat) { var p = ov.querySelector('p'); if (p) p.insertAdjacentHTML('afterend', natureStripHtml(cat)); }
            } catch (_) {}
            return r;
        };
        w._pfWrapped = true; root.openPRCatalogueBrowser = w; return true;
    }
    var _observed = false;
    function _observe() {
        var d = root.document; if (!d || typeof root.MutationObserver !== 'function' || _observed) return false;
        var tb = d.getElementById('pra-body'); if (!tb) return false;
        var pending = false;
        var mo = new root.MutationObserver(function () { if (pending) return; pending = true; setTimeout(function () { pending = false; try { decorateTable(); } catch (_) {} }, 0); });
        mo.observe(tb, { childList: true }); _observed = true; return true;
    }
    function _wrapRender() {
        var orig = root.renderPRA;
        if (typeof orig !== 'function' || orig._pfWrapped) return false;
        var w = function () { var r = orig.apply(this, arguments); try { decorateTable(); } catch (_) {} return r; };
        w._pfWrapped = true; root.renderPRA = w; return true;
    }
    (function hook(tries) {
        var ok = [installFraming(), installField(), _observe(), _wrapRender(), _wrapSubmit(), _wrapEdit(), _wrapBrowser()];
        if (ok.some(function (x) { return !x; }) && tries > 0 && typeof setTimeout === 'function') setTimeout(function () { hook(tries - 1); }, 100);
    })(50);

    var api = { NATURES: NATURES, NATURE_BY_ID: NATURE_BY_ID, FRAMING: FRAMING, natureOf: natureOf, natureLabel: natureLabel, grouped: grouped, natureStripHtml: natureStripHtml, naturePill: naturePill,
                catScenarios: catScenarios, status: status, findings: findings, INV: INV, badgeHtml: badgeHtml, formOk: formOk,
                framingHtml: framingHtml, installFraming: installFraming, installField: installField, decorateTable: decorateTable,
                _wrapSubmit: _wrapSubmit, _wrapEdit: _wrapEdit, _wrapBrowser: _wrapBrowser, _wrapRender: _wrapRender, _observe: _observe };
    try { root.SLPraFraming = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
