// ============================================================================
// numbering_plan.js, v1.4 (26 Nov 2026: system failure conditions get their own template; the Autopilots' system lines can be
// renumbered to it, shown first): ID schemes on the Program Planning page.
//
// Decided by Waqas, 2 Aug 2026: the programme declares its FUNCTION ID scheme
// and FAILURE CONDITION ID scheme, at aircraft and system level, and numbering
// derives from those schemes everywhere — manual form entry and AI accepts
// alike. The engine for this (numbering.js — template tokens, scoped counters,
// forward-only) already existed; this card surfaces the three templates that
// govern those artifacts where programme decisions live, with a live preview
// of BOTH levels: the {SYS} token is the system-level form, and the engine
// collapses it cleanly at aircraft level, so one template serves both.
//
// FORWARD-ONLY, stated on the card: a scheme change affects NEW ids only.
// Existing ids never renumber from here — renumbering is a separate, audited
// migration with cross-reference preview (FHA rows, trees and requirements
// reference FC ids), deliberately NOT this card's button.
//
// BORN MODULAR: wraps PROGRAM_PLAN.renderScopeSection; injects one card into
// #view-spp after the scope host. Writes through SafetyLabNumberingState
// (persisted with the project payload). "Full editor…" opens the existing
// numbering modal for the remaining kinds (trees, gates, events, requirements).
// ============================================================================
(function () {
    'use strict';
    if (typeof window === 'undefined') return;

    // 31 Aug 2026 (Waqas): "node identities can be prescribed in the program
    // planning by the user." The FTA node kinds join the card — gate and
    // basic-event id schemes are programme decisions, not buried-modal
    // settings; generateDisplayId already honors these templates on every
    // node minted anywhere (manual canvas + AI synthesis alike). The TOP
    // EVENT is deliberately NOT a template here: by the same-day ruling its
    // id IS the failure condition id carried from the FCIM / A/S FHA — the
    // card states that rule instead of offering to override it.
    var KINDS = [
        { kind: 'subFunction', label: 'Function IDs', hint: 'sub-functions — the ids FHA/FCIM rows hang off' },
        { kind: 'failureCond', label: 'Failure condition IDs (aircraft)', hint: 'aircraft FHA rows' },
        { kind: 'sysFailureCond', label: 'Failure condition IDs (system)', hint: 'system FHA rows, typed or made by the Autopilots; {SYS} is the system\'s short name' },
        { kind: 'fcimMode',    label: 'FCIM cell IDs', hint: 'TL / PL / M per function; extras number PL2…, M2… (Table A3)' },
        { kind: 'gate',        label: 'FTA gate IDs', hint: 'gate nodes on every fault-tree page (manual + AI-synthesised)' },
        { kind: 'basicEvent',  label: 'FTA basic-event IDs', hint: 'leaf events; shared/common-cause events reuse one id via the engine' }
    ];
    function N() { return window.SafetyLabNumbering; }
    function State() { return window.SafetyLabNumberingState; }
    function _esc(s) { if (typeof esc === 'function') return esc(s); return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    function _preview(scheme, kind) {
        try {
            var t = (scheme.templates || {})[kind]; if (!t) return { ac: '—', sys: '—' };
            var base = { PARENT: 'SF-02', MODE: 'PL', PROGRAM: 'AEOLUS', SEQ: 7 };
            var ex = function (SYS) {
                // The engine's own expand() renders the preview — previewId() would
                // fix SYS='NAV', but we want BOTH levels, so call expand directly.
                return N().expand(t.pattern, Object.assign({}, base, { SYS: SYS, TYPE: t.type }));
            };
            return { ac: ex(''), sys: ex('FCS') };
        } catch (_) { return { ac: '—', sys: '—' }; }
    }

    // ---- v1.4 (26 Nov 2026): renumbering the system failure conditions the Autopilots made --------------------------------
    // Waqas: "allow users to add their own numbering scheme". The schemes stay forward-only; this is the one deliberate,
    // shown-first renumber, and only for the lines the MAC and CoFFE Autopilots made (row.apx). A line is renumbered only when
    // its id appears nowhere but in the places this updates: its own row, the Autopilots' links and the shared node registry
    // (by system), the PASA's linking answers, the shared nodes in the trees and its system's tree names. Anything else that
    // names it (a requirement, a report, the same id on another line) keeps it, and the list says so.
    function _systems() { try { return (typeof systemsData !== 'undefined' && Array.isArray(systemsData)) ? systemsData : []; } catch (_) { return []; } }   // eslint-disable-line no-undef
    function _pages() { try { return (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) ? ftaPages : []; } catch (_) { return []; } }   // eslint-disable-line no-undef
    function _pcfg() { try { return (typeof projectConfig !== 'undefined' && projectConfig) ? projectConfig : null; } catch (_) { return null; } }   // eslint-disable-line no-undef
    function _reEsc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function _tok(id) { return new RegExp('(^|[^A-Za-z0-9_-])' + _reEsc(id) + '(?![A-Za-z0-9_])', 'g'); }
    function _count(str, id) { var m = String(str == null ? '' : str).match(_tok(id)); return m ? m.length : 0; }
    function _walk(o, f, seen) { if (!o || typeof o !== 'object') return; seen = seen || new Set(); if (seen.has(o)) return; seen.add(o); f(o); Object.keys(o).forEach(function (k) { _walk(o[k], f, seen); }); }
    var Renum = {
        plan: function () {
            var Nn = N(), St = State(); if (!Nn || !St) return [];
            var scheme = Nn.withDefaults(St.getScheme()), t = scheme.templates.sysFailureCond, out = [];
            var store = JSON.parse(JSON.stringify((typeof slNumberingStore !== 'undefined' && slNumberingStore) || { seq: {}, map: {} }));   // eslint-disable-line no-undef
            var prog = ''; try { prog = (typeof _slNumberCtx === 'function' ? _slNumberCtx().PROGRAM : ''); } catch (_) {}
            var snap = null; try { snap = JSON.stringify(window.SLStores && window.SLStores.snapshot ? window.SLStores.snapshot() : {}); } catch (_) {}
            var taken = {}; _systems().forEach(function (s) { (s.fha || []).forEach(function (r) { if (r && r.fcId) taken[String(r.fcId)] = 1; }); });
            try { (acFhaData || []).forEach(function (r) { if (r && r.fcId) taken[String(r.fcId)] = 1; }); } catch (_) {}   // eslint-disable-line no-undef
            _systems().forEach(function (s) {
                var code = typeof window.slSysCode === 'function' ? window.slSysCode(s.id) : String(s.id);
                var MK = '\u0001\u0001\u0001\u0001\u0001\u0001\u0001\u0001', fits = new RegExp('^' + _reEsc(Nn.expand(t.pattern, { SYS: code, TYPE: t.type, PROGRAM: prog, SEQ: MK })).split(MK).join('\\d+') + '$');
                (s.fha || []).forEach(function (r) {
                    if (!r || !r.apx || !r.fcId || fits.test(String(r.fcId))) return;
                    var id; for (var i = 0; i < 500; i++) { id = Nn.makeId(scheme, 'sysFailureCond', { SYS: code, PROGRAM: prog }, store); if (!taken[id]) break; }
                    taken[id] = 1;
                    out.push({ sys: s, row: r, from: String(r.fcId), to: id, why: Renum.blocked(s, String(r.fcId), snap) });
                });
            });
            return out;
        },
        // the places this updates, and how many times the id appears in each
        known: function (s, id) {
            var n = 1, sid = String(s.id), pc = _pcfg();
            _walk(pc && pc.apx, function (o) { if (String(o.sysId) === sid && String(o.fcId) === id) n += _count(o.fcId, id); });
            ((pc && pc.sysNodes) || []).forEach(function (e) { if (e && String(e.sysId) === sid && String(e.fcId) === id) n += 1; });
            var pa = pc && pc.pasaAuto && pc.pasaAuto.fc; if (pa) Object.keys(pa).forEach(function (k) { var L = pa[k] && pa[k].link; if (L) Object.keys(L).forEach(function (lk) { if (lk === sid + '§' + id) n += 1; }); });
            _pages().forEach(function (p) {
                if (p && p.treeLevel === 'system' && String(p.systemId) === sid) n += _count(p.name, id);
                _walk(p && p.root, function (o) { if (o.sysNode && String(o.sysNode.sysId) === sid && String(o.sysNode.fcId) === id) n += 1; if (o.pasaCombo) n += _count(o.pasaCombo, sid + '§' + id); });
            });
            return n;
        },
        blocked: function (s, id, snap) {
            if (snap == null) return 'kept: the project could not be read';
            var all = _count(snap, id);
            var k = Renum.known(s, id);
            return all > k ? 'kept: something else in the project names ' + id : '';
        },
        apply: function () {
            var done = 0, kept = [], pc = _pcfg();
            Renum.plan().forEach(function (x) {
                if (x.why) { kept.push(x.from + ' (' + x.why + ')'); return; }
                var sid = String(x.sys.id), a = x.from, b = x.to;
                x.row.fcId = b;
                _walk(pc && pc.apx, function (o) { if (String(o.sysId) === sid && String(o.fcId) === a) o.fcId = b; });
                ((pc && pc.sysNodes) || []).forEach(function (e) { if (e && String(e.sysId) === sid && String(e.fcId) === a) e.fcId = b; });
                var pa = pc && pc.pasaAuto && pc.pasaAuto.fc; if (pa) Object.keys(pa).forEach(function (k) { var L = pa[k] && pa[k].link; if (L && Object.prototype.hasOwnProperty.call(L, sid + '§' + a)) { L[sid + '§' + b] = L[sid + '§' + a]; delete L[sid + '§' + a]; } });
                _pages().forEach(function (p) {
                    if (p && p.treeLevel === 'system' && String(p.systemId) === sid && p.name) p.name = String(p.name).replace(_tok(a), function (m, pre) { return pre + b; });
                    _walk(p && p.root, function (o) { if (o.sysNode && String(o.sysNode.sysId) === sid && String(o.sysNode.fcId) === a) o.sysNode.fcId = b; if (o.pasaCombo) o.pasaCombo = String(o.pasaCombo).split(sid + '§' + a).join(sid + '§' + b); });
                });
                try { if (typeof jrnl === 'function') jrnl('fc-renumbered', (x.sys.name || sid) + ': ' + a + ' renumbered ' + b + ' (Program Planning, system failure condition scheme)'); } catch (_) {}   // eslint-disable-line no-undef
                done++;
            });
            if (done) { try { if (window.SLDataChange) window.SLDataChange.bump(); } catch (_) {} try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }   // eslint-disable-line no-undef
            return { done: done, kept: kept };
        }
    };
    window.SLSysFcRenumber = Renum;
    function _renumHtml(host) {
        var plan = Renum.plan(), d = host && host._renumDone;
        if (!plan.length && !d) return '';
        var h = '<div style="padding:9px 13px;border-top:1px solid var(--color-border);font-size:12.5px;">';
        if (d) h += '<div>' + (d.done ? d.done + ' system failure condition' + (d.done > 1 ? 's' : '') + ' renumbered.' : 'Nothing renumbered.') + (d.kept.length ? ' Kept: ' + _esc(d.kept.join('; ')) + '.' : '') + '</div>';
        if (plan.length) {
            h += '<div><b>' + plan.length + ' system failure condition' + (plan.length > 1 ? 's' : '') + ' made by the Autopilots</b> use another pattern than the system scheme above. Renumbering them is your choice and is never done on its own.</div>';
            if (host && host._renumShow) {
                h += '<table style="border-collapse:collapse;margin:6px 0;font-size:12px;"><thead><tr><th style="text-align:left;padding-right:12px;">System</th><th style="text-align:left;padding-right:12px;">Now</th><th style="text-align:left;padding-right:12px;">Becomes</th><th style="text-align:left;">Note</th></tr></thead><tbody>'
                    + plan.map(function (x) { return '<tr><td style="padding-right:12px;">' + _esc(x.sys.name || x.sys.id) + '</td><td style="padding-right:12px;font-family:var(--font-mono,monospace);">' + _esc(x.from) + '</td><td style="padding-right:12px;font-family:var(--font-mono,monospace);">' + _esc(x.why ? x.from : x.to) + '</td><td>' + _esc(x.why || '') + '</td></tr>'; }).join('') + '</tbody></table>'
                    + '<button class="ckpt-m-btn" id="ppn-renum-apply">Renumber them</button>';
            } else h += '<button class="ckpt-m-btn" id="ppn-renum-show" style="margin-top:6px;">Show the new ids</button>';
        }
        return h + '</div>';
    }
    function _render() {
        var view = document.getElementById('view-spp'); if (!view) return;
        if (!N() || !State() || !State().getScheme()) return;
        var host = document.getElementById('pp-idscheme-host');
        if (!host) { host = document.createElement('div'); host.id = 'pp-idscheme-host'; view.appendChild(host); }
        var scheme = N().withDefaults ? N().withDefaults(State().getScheme()) : State().getScheme();
        var rows = KINDS.map(function (k) {
            var t = (scheme.templates || {})[k.kind] || { pattern: '', counterScope: 'global' };
            var p = _preview(scheme, k.kind);
            return '<tr>' +
                '<td style="white-space:nowrap;padding:6px 10px 6px 0;"><b>' + _esc(k.label) + '</b><br><span style="font-size:11px;color:var(--color-text-tertiary);">' + _esc(k.hint) + '</span></td>' +
                '<td style="padding:6px 10px 6px 0;"><input data-ppn-kind="' + k.kind + '" value="' + _esc(t.pattern) + '" style="width:100%;min-width:190px;font-family:var(--font-mono,monospace);font-size:12px;padding:4px 7px;"></td>' +
                '<td style="padding:6px 10px 6px 0;"><select data-ppn-scope="' + k.kind + '" style="font-size:12px;padding:3px 6px;">' +
                    ['global', 'system', 'parent'].map(function (sc) { return '<option value="' + sc + '"' + ((t.counterScope || 'global') === sc ? ' selected' : '') + '>' + sc + '</option>'; }).join('') + '</select></td>' +
                '<td data-ppn-prev="' + k.kind + '" style="padding:6px 0;font-family:var(--font-mono,monospace);font-size:11.5px;color:var(--color-text-secondary);white-space:nowrap;">AC: ' + _esc(p.ac) + ' · SYS: ' + _esc(p.sys) + '</td></tr>';
        }).join('');
        host.innerHTML =
            '<div style="border:1px solid var(--color-border-strong);margin-top:16px;">' +
              '<div style="padding:8px 13px;border-bottom:2px solid var(--color-text-primary);"><b>ID numbering — program schemes</b> ' +
                '<span style="font-size:11px;color:var(--color-text-tertiary);">one template per artifact; {SYS} is the system-level form and collapses at aircraft level · tokens: {TYPE} {SEQ:000} {SYS} {PARENT} {MODE} {PROGRAM}</span></div>' +
              '<div style="padding:9px 13px;">' +
                '<table style="width:100%;border-collapse:collapse;font-size:12.5px;"><thead><tr>' +
                  '<th style="text-align:left;">Artifact</th><th style="text-align:left;">Pattern</th><th style="text-align:left;">Counter</th><th style="text-align:left;">Preview (aircraft · system)</th></tr></thead>' +
                '<tbody>' + rows + '</tbody></table>' +
                '<div style="display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap;">' +
                  '<span style="font-size:11px;color:var(--color-text-tertiary);flex-basis:100%;">Top events carry no template: a tree linked to a failure condition wears THAT condition\'s id (FCIM / A&#8203;FHA / S&#8203;FHA) as its top-event id — fixed by program rule, 31 Aug 2026.</span>' +
                  '<button class="ckpt-m-btn" id="ppn-save">Apply to new IDs</button>' +
                  '<button class="ckpt-m-btn" style="opacity:.85;" onclick="try{openNumberingEditor()}catch(e){}">Full editor…</button>' +
                  '<span style="font-size:11.5px;color:var(--color-text-tertiary);">Forward-only: existing ids never renumber from here. Manual entries are respected; blank ids — typed or AI-accepted — are minted from these schemes.</span>' +
                '</div>' + _renumHtml(host) + '</div></div>';
        host.querySelectorAll('input[data-ppn-kind], select[data-ppn-scope]').forEach(function (el) {
            el.addEventListener('input', function () {
                var w = N().cloneScheme(State().getScheme());
                KINDS.forEach(function (k) {
                    var pi = host.querySelector('input[data-ppn-kind="' + k.kind + '"]');
                    var si = host.querySelector('select[data-ppn-scope="' + k.kind + '"]');
                    if (w.templates[k.kind]) { w.templates[k.kind].pattern = pi.value; w.templates[k.kind].counterScope = si.value; }
                    var p = _preview(w, k.kind);
                    var pv = host.querySelector('[data-ppn-prev="' + k.kind + '"]');
                    if (pv) pv.textContent = 'AC: ' + p.ac + ' · SYS: ' + p.sys;
                });
                host._working = w;
            });
        });
        var save = host.querySelector('#ppn-save');
        if (save) save.onclick = function () {
            var w = host._working || N().cloneScheme(State().getScheme());
            KINDS.forEach(function (k) {
                var pi = host.querySelector('input[data-ppn-kind="' + k.kind + '"]');
                var si = host.querySelector('select[data-ppn-scope="' + k.kind + '"]');
                if (w.templates[k.kind] && pi && si) { w.templates[k.kind].pattern = pi.value; w.templates[k.kind].counterScope = si.value; }
            });
            State().setScheme(w);
            try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
            try { if (typeof showToast === 'function') showToast('ID schemes applied — new ids mint from these patterns (existing ids unchanged).', 'success', 4500); } catch (_) {}
            _render();
        };
        var rs = host.querySelector('#ppn-renum-show'); if (rs) rs.onclick = function () { host._renumShow = true; _render(); };
        var ra = host.querySelector('#ppn-renum-apply'); if (ra) ra.onclick = function () { var r = Renum.apply(); host._renumShow = false; host._renumDone = r; _render(); };
    }

    if (window.PROGRAM_PLAN && typeof window.PROGRAM_PLAN.renderScopeSection === 'function' && !window.PROGRAM_PLAN.renderScopeSection._ppnWrapped) {
        var _orig = window.PROGRAM_PLAN.renderScopeSection;
        var wrapped = function () { var r = _orig.apply(this, arguments); try { _render(); } catch (_) {} return r; };
        wrapped._ppnWrapped = true;
        window.PROGRAM_PLAN.renderScopeSection = wrapped;
    }
    // v1.1 (2 Aug, caught live): the export wrap above never fires on a plain
    // Program Planning visit — program_plan's own switchTab wrapper calls its
    // internal CLOSURE renderScopeSection, not the exported name. Wrap
    // switchTab ourselves (this script loads after program_plan.js, so this
    // wrap sits outside its guard) and render once at load, so the card is
    // there whenever the page is.
    if (typeof window.switchTab === 'function' && !window.switchTab._ppnWrapped) {
        var _origTab = window.switchTab;
        var wrappedTab = function (tabId) {
            var r = _origTab.apply(this, arguments);
            try { if (tabId === 'spp') setTimeout(_render, 50); } catch (_) {}
            return r;
        };
        wrappedTab._ppnWrapped = true;
        window.switchTab = wrappedTab;
    }
    try { setTimeout(_render, 300); } catch (_) {}   // boot render — _render early-returns until the view + engine exist
    window.NUMBERING_PLAN = { render: _render };
})();
