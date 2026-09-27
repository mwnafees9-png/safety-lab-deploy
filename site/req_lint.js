// ============================================================================
// req_lint.js — v1.0 — Q8 (27 Sep 2026): the requirement wording check.
//
// A requirement statement carries the "what" in one testable sentence. This
// module reads every statement, authored or generated, and warns (never
// blocks) when the wording works against that:
//   · exactly one "shall" (none = not a requirement; two = two requirements)
//   · let-out words: except, unless, although, not limited to
//   · hedges: usually, generally, often, normally
//   · possibility words: may, might, should, ought
//   · vagueness: as appropriate, capable of
//   · indefinite pronouns: this, these (name the thing)
//   · statements of fact: is, are, was carrying the sentence with no "shall"
//     (an "is" inside a When / While clause of a shall-sentence is fine)
// The checklist wording is ours. Generated requirements already follow the
// one-shall house style (assurance_modules Phase 56.50), so this mostly catches
// hand-written rows and edits.
//
// EARS is a public notation (Mavin et al.); the five templates offered on the
// requirement form are our own wording of its five patterns: ubiquitous,
// state-driven (While), event-driven (When), optional feature (Where),
// unwanted behavior (If, then).
//
// Surfaces: a chip in the statement cell of both requirement tables (pager-safe
// through an observer), a summary line above each table, live findings under the
// statement field while typing, EARS buttons under the field, INV-63 advisory.
// Reads through SLEnv (rule 5) with direct-identifier fallback. No eval.
// window.SLReqLint + module.exports (tests).
// ============================================================================
(function (root) {
    'use strict';
    var RULES = [
        { code: 'let-out',     label: 'let-out word',        words: ['except', 'unless', 'although', 'not limited to'] },
        { code: 'hedge',       label: 'hedge',               words: ['usually', 'generally', 'often', 'normally'] },
        { code: 'possibility', label: 'possibility word',    words: ['may', 'might', 'should', 'ought'] },
        { code: 'vague',       label: 'vague phrase',        words: ['as appropriate', 'capable of'] },
        { code: 'pronoun',     label: 'indefinite pronoun',  words: ['this', 'these'] }
    ];
    var FACT_WORDS = ['is', 'are', 'was'];
    var EARS = [
        { id: 'ubiquitous', label: 'Ubiquitous', hint: 'always true', text: 'The <system> shall <response>.' },
        { id: 'while',      label: 'While',      hint: 'state-driven', text: 'While <state>, the <system> shall <response>.' },
        { id: 'when',       label: 'When',       hint: 'event-driven', text: 'When <trigger>, the <system> shall <response>.' },
        { id: 'where',      label: 'Where',      hint: 'optional feature', text: 'Where <feature is present>, the <system> shall <response>.' },
        { id: 'if',         label: 'If, then',   hint: 'unwanted behavior', text: 'If <unwanted condition>, then the <system> shall <response>.' }
    ];

    function _g(name) {
        try { if (root.SLEnv && typeof root.SLEnv.get === 'function') { var v = root.SLEnv.get(name); if (v !== undefined) return v; } } catch (_) {}
        try {
            switch (name) {
                case 'acReqData': return (typeof acReqData !== 'undefined') ? acReqData : root.acReqData;
                case 'systemsData': return (typeof systemsData !== 'undefined') ? systemsData : root.systemsData;
                case 'activeSystemId': return (typeof activeSystemId !== 'undefined') ? activeSystemId : root.activeSystemId;
            }
        } catch (_) {}
        return root[name];
    }
    function _arr(v) { return Array.isArray(v) ? v : []; }
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function _re(word) { return new RegExp('(^|[^A-Za-z-])' + word.replace(/\s+/g, '\\s+') + '(?![A-Za-z-])', 'gi'); }
    function _count(text, word) { var m = String(text || '').match(_re(word)); return m ? m.length : 0; }

    // ---- the check --------------------------------------------------------------
    function lint(text) {
        var s = String(text == null ? '' : text);
        var out = { text: s, shallCount: _count(s, 'shall'), findings: [] };
        if (!s.trim()) return out;
        if (out.shallCount === 0) out.findings.push({ code: 'no-shall', label: 'no "shall"', word: '', text: 'no "shall": this reads as a statement, not a requirement' });
        else if (out.shallCount > 1) out.findings.push({ code: 'many-shall', label: 'more than one "shall"', word: 'shall', text: out.shallCount + ' "shall"s: split into one requirement per statement' });
        RULES.forEach(function (r) {
            r.words.forEach(function (w) {
                var n = _count(s, w);
                if (n) out.findings.push({ code: r.code, label: r.label, word: w, text: r.label + ' "' + w + '"' + (r.code === 'let-out' ? ': the exception belongs in its own requirement' : r.code === 'hedge' ? ': say when it holds and when it does not' : r.code === 'possibility' ? ': a requirement says shall' : r.code === 'vague' ? ': say what, how much, by when' : ': name the thing') });
            });
        });
        if (out.shallCount === 0) {
            FACT_WORDS.forEach(function (w) { if (_count(s, w)) out.findings.push({ code: 'fact', label: 'statement of fact', word: w, text: 'statement of fact "' + w + '": say what the design shall do' }); });
        }
        return out;
    }
    function ok(text) { return lint(text).findings.length === 0; }

    // ---- stores --------------------------------------------------------------------
    function stores() {
        var out = [{ scope: 'ac', label: 'Aircraft', reqs: _arr(_g('acReqData')) }];
        _arr(_g('systemsData')).forEach(function (s) { if (s && s.id != null) out.push({ scope: 'sys-' + s.id, label: s.name || String(s.id), reqs: _arr(s.req) }); });
        return out;
    }
    function storeFor(scope) {
        if (scope === 'sys') { var a = _g('activeSystemId'); scope = a != null && a !== '' ? 'sys-' + a : 'ac'; }
        var hit = null; stores().some(function (st) { if (st.scope === scope) { hit = st; return true; } return false; }); return hit;
    }
    function live(r) { return r && !r.deleted && r.status !== 'archived' && !(r.reqSource && r.reqSource.obsolete); }
    function reqRef(r) { return r ? (r.id || ('REQ-' + r.internalId)) : ''; }
    function lintStore(st) {
        return st.reqs.filter(live).map(function (r) { return { req: r, ref: reqRef(r), result: lint(r.text) }; }).filter(function (x) { return x.result.findings.length; });
    }
    function findingsAll() {
        var out = [];
        stores().forEach(function (st) { lintStore(st).forEach(function (x) { out.push({ scope: st.scope, label: st.label, ref: x.ref, findings: x.result.findings, text: st.label + ' ' + x.ref + ': ' + x.result.findings.map(function (f) { return f.text; }).join('; ') }); }); });
        return out;
    }
    var INV = { id: 'INV-63', sev: 'advisory',
        name: 'Every requirement statement is one testable "shall" sentence: no let-outs, hedges, possibility words, vague phrases, indefinite pronouns or statements of fact',
        run: function () { var n = 0; stores().forEach(function (st) { n += st.reqs.filter(live).length; }); var f = findingsAll(); return { checked: n, fails: f.slice(0, 20).map(function (x) { return x.text; }), failCount: f.length }; } };
    (function reg(tries) {
        if (typeof root.invRegister === 'function') { try { root.invRegister(INV); } catch (_) {} return; }
        if (tries > 0 && typeof setTimeout === 'function') setTimeout(function () { reg(tries - 1); }, 50);
    })(40);

    // ---- surfaces -------------------------------------------------------------------
    function chipHtml(result) {
        if (!result || !result.findings.length) return '';
        return '<span data-rl-chip="1" title="' + _esc(result.findings.map(function (f) { return f.text; }).join('\n')) + '" style="display:inline-block;margin-left:6px;padding:1px 7px;font-size:10px;font-weight:700;border-radius:9px;border:1px solid #9A6200;color:#9A6200;background:var(--color-surface-2);white-space:nowrap;">wording ' + result.findings.length + '</span>';
    }
    function decorateTable(scope) {
        var d = root.document; if (!d) return 0;
        var tbody = d.getElementById(scope === 'ac' ? 'ac-req-body' : 'sys-req-body'); if (!tbody) return 0;
        var st = storeFor(scope); if (!st) return 0;
        var byId = {}; st.reqs.forEach(function (r) { if (r) byId[String(r.internalId)] = r; });
        var n = 0;
        Array.prototype.forEach.call(tbody.querySelectorAll('tr'), function (tr, i) {
            if (tr.getAttribute('data-rl') === '1') return;
            var r = byId[String(tr.getAttribute('data-iid'))] || st.reqs[i]; if (!r) return;
            var res = lint(r.text);
            var cells = tr.querySelectorAll('td');
            if (res.findings.length && cells.length > 4) cells[4].insertAdjacentHTML('beforeend', chipHtml(res));
            tr.setAttribute('data-rl-n', String(res.findings.length));
            tr.setAttribute('data-rl', '1'); n++;
        });
        renderSummary(scope);
        return n;
    }
    function summaryHtml(st) {
        var rows = st.reqs.filter(live), bad = lintStore(st);
        if (!rows.length) return '';
        return '<span class="u-mono" style="font-size:11px;color:' + (bad.length ? '#9A6200' : '#1D9E75') + ';font-weight:700;">Wording check: ' + (bad.length ? bad.length + ' of ' + rows.length + ' statement' + (rows.length === 1 ? '' : 's') + ' need' + (bad.length === 1 ? 's' : '') + ' a look' : 'all ' + rows.length + ' statements read as one testable "shall"') + '</span>'
            + '<span style="font-size:11px;color:var(--color-text-secondary);"> · one "shall", no let-outs, hedges, possibility words, vague phrases, indefinite pronouns or statements of fact. Warnings only.</span>';
    }
    function renderSummary(scope) {
        var d = root.document; if (!d) return false;
        var table = d.getElementById(scope === 'ac' ? 'ac-req-table' : 'sys-req-table'); if (!table || !table.parentNode) return false;
        var st = storeFor(scope); if (!st) return false;
        var id = 'rl-summary-' + scope, host = d.getElementById(id);
        if (!host) { host = d.createElement('div'); host.id = id; host.style.cssText = 'padding:4px 2px 6px;'; table.parentNode.insertBefore(host, table); }
        host.innerHTML = summaryHtml(st);
        return true;
    }
    // Live check under the statement field, and the EARS buttons.
    function fieldHtml(result) {
        if (!result || !String(result.text || '').trim()) return '';
        if (!result.findings.length) return '<span style="font-size:11px;color:#1D9E75;font-weight:600;">Reads as one testable "shall".</span>';
        return result.findings.map(function (f) { return '<span style="display:inline-block;margin:0 8px 2px 0;font-size:11px;color:#9A6200;">&#9679; ' + _esc(f.text) + '</span>'; }).join('');
    }
    function earsHtml(prefix) {
        return '<span style="font-size:10.5px;color:var(--color-text-tertiary);margin-right:6px;">EARS pattern:</span>' + EARS.map(function (t) {
            return '<button type="button" class="action-btn" style="padding:1px 7px;font-size:10.5px;margin:0 4px 2px 0;" title="' + _esc(t.hint + ': ' + t.text) + '" onclick="SLReqLint.applyEars(\'' + _esc(prefix) + '\',\'' + t.id + '\')">' + _esc(t.label) + '</button>';
        }).join('');
    }
    function applyEars(prefix, id) {
        var d = root.document; if (!d) return false;
        var el = d.getElementById(prefix + '-text'); if (!el) return false;
        var t = null; EARS.some(function (x) { if (x.id === id) { t = x; return true; } return false; });
        if (!t) return false;
        var cur = String(el.value || '').trim();
        // An empty field takes the template; a filled one is not overwritten, the template goes in front only when asked twice.
        if (!cur) el.value = t.text;
        else if (el.getAttribute('data-rl-ears-armed') === id) { el.value = t.text; el.removeAttribute('data-rl-ears-armed'); }
        else { el.setAttribute('data-rl-ears-armed', id); try { if (typeof root.showToast === 'function') root.showToast('The statement is not empty. Click ' + t.label + ' again to replace it with the template.', 'info', 3500); } catch (_) {} return false; }
        try { el.focus(); var i = el.value.indexOf('<'); if (i >= 0 && typeof el.setSelectionRange === 'function') el.setSelectionRange(i, el.value.indexOf('>') + 1); } catch (_) {}
        refreshField(prefix);
        return true;
    }
    function refreshField(prefix) {
        var d = root.document; if (!d) return false;
        var el = d.getElementById(prefix + '-text'); if (!el) return false;
        var host = d.getElementById('rl-field-' + prefix); if (!host) return false;
        host.innerHTML = fieldHtml(lint(el.value));
        return true;
    }
    function installField(prefix) {
        var d = root.document; if (!d) return false;
        var el = d.getElementById(prefix + '-text'); if (!el || !el.parentNode || el.getAttribute('data-rl-field') === '1') return false;
        var box = d.createElement('div'); box.id = 'rl-ears-' + prefix; box.style.cssText = 'margin:2px 0 6px;'; box.innerHTML = earsHtml(prefix);
        var live = d.createElement('div'); live.id = 'rl-field-' + prefix; live.style.cssText = 'min-height:14px;margin:0 0 6px;';
        el.parentNode.insertBefore(live, el.nextSibling);
        el.parentNode.insertBefore(box, live);
        el.setAttribute('data-rl-field', '1');
        try { el.addEventListener('input', function () { refreshField(prefix); }); } catch (_) {}
        return true;
    }

    // ---- hooks ----------------------------------------------------------------------
    var _observed = {};
    function _observe(id, fn) {
        var d = root.document; if (!d || typeof root.MutationObserver !== 'function' || _observed[id]) return false;
        var tb = d.getElementById(id); if (!tb) return false;
        var pending = false;
        var mo = new root.MutationObserver(function () { if (pending) return; pending = true; setTimeout(function () { pending = false; try { fn(); } catch (_) {} }, 0); });
        mo.observe(tb, { childList: true }); _observed[id] = mo; return true;
    }
    function _wrapRender(name, fn) {
        var orig = root[name];
        if (typeof orig !== 'function' || orig._rlWrapped) return false;
        var w = function () { var r = orig.apply(this, arguments); try { fn(); } catch (_) {} return r; };
        w._rlWrapped = true; root[name] = w; return true;
    }
    function watchTables() { return [_observe('ac-req-body', function () { decorateTable('ac'); }), _observe('sys-req-body', function () { decorateTable('sys'); })].every(Boolean); }
    (function hook(tries) {
        var ok = [watchTables(), installField('ac-req'), installField('sys-req'),
                  _wrapRender('renderACReq', function () { decorateTable('ac'); }), _wrapRender('renderSysReq', function () { decorateTable('sys'); })];
        if (ok.some(function (x) { return !x; }) && tries > 0 && typeof setTimeout === 'function') setTimeout(function () { hook(tries - 1); }, 100);
    })(50);

    var api = { RULES: RULES, FACT_WORDS: FACT_WORDS, EARS: EARS, lint: lint, ok: ok, stores: stores, storeFor: storeFor, lintStore: lintStore, findingsAll: findingsAll, INV: INV,
                chipHtml: chipHtml, decorateTable: decorateTable, summaryHtml: summaryHtml, renderSummary: renderSummary, fieldHtml: fieldHtml, earsHtml: earsHtml, applyEars: applyEars, refreshField: refreshField, installField: installField,
                watchTables: watchTables, _observe: _observe, _wrapRender: _wrapRender };
    try { root.SLReqLint = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
