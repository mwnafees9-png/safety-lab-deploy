/* library_byol.js v1.0 (2 Nov 2026): licensed reliability data the customer loads themselves (item 46).
 *
 * Waqas, 2 Nov 2026: "yes lets get the rest done", on this scope: NPRD, EPRD and FMD become named licensed
 * sources; the library CSV carries environment, quality, record count, data date and a failure mode split; the
 * part keeps all of it, so the FMEA and the fault tree can show where a number came from.
 *
 * What this module owns (no licensed values ship with Safety Lab; everything here is read from the customer's CSV):
 *   - family(source): NPRD / EPRD / FMD sources are the licensed "NPRD/EPRD" family. NPRD and EPRD rates are field
 *     data already stated per environment and quality, so they are used exactly as published: the project's
 *     environment and quality factors are NOT applied on top (that would count the environment twice).
 *   - parse(text): one CSV, two shapes.
 *       parts:  Key, Name, Lambda (required); Group, Source, Environment, Quality, Records, Data_Date, Modes (optional).
 *               Modes is the part's own split, written "Open=0.40; Short=0.35; Drift=0.25".
 *       splits: Key, Mode, Alpha (one row per mode, no Lambda column), Source optional: an FMD style file that adds
 *               a split to parts already in the library.
 *     A split is kept only when every share is above 0 and the shares add up to 1 (within 0.02). Shares written as
 *     percentages (adding up to 100) are read as percentages. A split that fails is left out and named, never fixed.
 *   - splitFor(key): the failure mode split for a library part. The customer's imported split first, then the
 *     built-in public table (FAILURE_MODE_DISTRIBUTIONS), else none.
 *   - detail(entry): one plain line saying where the number came from.
 * Run the test: node tests/regression_library_byol_20261102.test.js
 */
(function (root) {
    'use strict';
    var LICENSED = /^(NPRD|EPRD|FMD)\b/i;
    var FAMILY = 'NPRD/EPRD';
    var TOL = 0.02;

    function S(v) { return String(v == null ? '' : v).trim(); }
    function _custom() { try { return (root.projectConfig && root.projectConfig.customLibrary) || (typeof projectConfig !== 'undefined' && projectConfig.customLibrary) || {}; } catch (_) { return {}; } }
    function _builtIn() { try { return (typeof COMPONENT_LIBRARY !== 'undefined') ? COMPONENT_LIBRARY : {}; } catch (_) { return {}; } }
    function _builtInSplits() { try { return (typeof FAILURE_MODE_DISTRIBUTIONS !== 'undefined') ? FAILURE_MODE_DISTRIBUTIONS : {}; } catch (_) { return {}; } }
    function _entry(key) { var c = _custom(); if (c && !Array.isArray(c) && c[key]) return c[key]; return _builtIn()[key] || null; }

    function isLicensed(source) { return LICENSED.test(S(source)); }
    function family(source) { return isLicensed(source) ? FAMILY : null; }
    // NPRD / EPRD are field rates already per environment and quality: used as published.
    function asPublished(entry) { return !!entry && isLicensed(entry.source); }

    // ---- CSV ----
    function _csv(text) {
        var rows = [], row = [], cur = '', q = false, s = String(text || '').replace(/^﻿/, '');
        for (var i = 0; i < s.length; i++) {
            var ch = s[i];
            if (q) { if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
            if (ch === '"') q = true;
            else if (ch === ',') { row.push(cur); cur = ''; }
            else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
            else cur += ch;
        }
        if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
        return rows.filter(function (r) { return r.some(function (c) { return S(c) !== ''; }); });
    }
    function _col(headers, names) {
        for (var i = 0; i < names.length; i++) { var k = headers.indexOf(names[i]); if (k >= 0) return k; }
        return -1;
    }
    function _norm(h) { return S(h).toUpperCase().replace(/[\s\-]+/g, '_'); }

    // "Open=0.40; Short=0.35" (also "Open: 40%", "|" between modes) -> [{mode, alpha}]
    function parseModes(text) {
        var out = [];
        S(text).split(/[;|]/).forEach(function (part) {
            part = S(part); if (!part) return;
            var m = part.match(/^(.*?)[=:]\s*([0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s*%?\s*$/);
            if (!m || !S(m[1])) { out.push({ mode: part, alpha: NaN }); return; }
            out.push({ mode: S(m[1]), alpha: parseFloat(m[2]) });
        });
        return out;
    }
    // checks a split; returns { ok, modes, why }
    function checkSplit(list, source) {
        if (!list || !list.length) return { ok: false, why: 'no modes' };
        var names = {}, sum = 0, pct = false;
        for (var i = 0; i < list.length; i++) if (list[i].alpha > 1) pct = true;
        var modes = [];
        for (var j = 0; j < list.length; j++) {
            var name = S(list[j].mode), a = Number(list[j].alpha);
            if (!name) return { ok: false, why: 'a mode has no name' };
            if (!(a > 0) || !isFinite(a)) return { ok: false, why: '"' + name + '" has no share above 0' };
            if (pct) a = a / 100;
            var k = name.toLowerCase().replace(/\s+/g, ' ');
            if (names[k]) return { ok: false, why: '"' + name + '" is listed twice' };
            names[k] = 1; sum += a;
            modes.push({ mode: name, alphaFm: Math.round(a * 1e6) / 1e6, source: S(list[j].source || source) });
        }
        if (Math.abs(sum - 1) > TOL) return { ok: false, why: 'the shares add up to ' + (Math.round(sum * 1000) / 1000) + ', not 1' };
        return { ok: true, modes: modes };
    }

    // parse(text) -> { kind: 'parts'|'splits', parts: {key: entry}, splits: {key: [modes]}, skipped: [{row, key, why}] }
    function parse(text) {
        var arr = _csv(text);
        if (arr.length < 2) throw new Error('Library CSV is empty or missing a header row.');
        var H = arr[0].map(_norm);
        var iKey = _col(H, ['KEY']), iName = _col(H, ['NAME']), iLam = _col(H, ['LAMBDA', 'Λ', 'FAILURE_RATE']);
        var iGroup = _col(H, ['GROUP']), iSrc = _col(H, ['SOURCE']), iEnv = _col(H, ['ENVIRONMENT', 'ENV']);
        var iQual = _col(H, ['QUALITY']), iRec = _col(H, ['RECORDS', 'RECORD_COUNT', 'DATA_RECORDS']);
        var iDate = _col(H, ['DATA_DATE', 'DATE', 'DATA_YEAR']), iModes = _col(H, ['MODES', 'FAILURE_MODES', 'MODE_SPLIT']);
        var iMode = _col(H, ['MODE', 'FAILURE_MODE']), iAlpha = _col(H, ['ALPHA', 'ALPHA_FM', 'SHARE', 'DISTRIBUTION', 'RATIO']);
        var out = { kind: 'parts', parts: {}, splits: {}, skipped: [] };
        if (iKey < 0) throw new Error('Library CSV must include a Key column.');
        if (iLam < 0 && iMode >= 0 && iAlpha >= 0) {
            out.kind = 'splits';
            var byKey = {}, order = [];
            arr.slice(1).forEach(function (r, n) {
                var key = S(r[iKey]); if (!key) return;
                if (!byKey[key]) { byKey[key] = []; order.push(key); }
                byKey[key].push({ mode: r[iMode], alpha: parseFloat(r[iAlpha]), source: iSrc >= 0 ? r[iSrc] : '', row: n + 2 });
            });
            order.forEach(function (key) {
                var c = checkSplit(byKey[key], '');
                if (c.ok) out.splits[key] = c.modes; else out.skipped.push({ key: key, why: c.why });
            });
            return out;
        }
        if (iName < 0 || iLam < 0) throw new Error('Library CSV must include Key, Name and Lambda columns (or Key, Mode and Alpha for a failure mode split).');
        arr.slice(1).forEach(function (r, n) {
            var key = S(r[iKey]); if (!key) return;
            var lam = parseFloat(r[iLam]);
            if (!(lam >= 0) || !isFinite(lam)) { out.skipped.push({ row: n + 2, key: key, why: 'no usable failure rate' }); return; }
            var src = iSrc >= 0 ? (S(r[iSrc]) || 'imported') : 'imported';
            var e = { name: S(r[iName]) || key, lambda: lam, source: src, group: iGroup >= 0 ? (S(r[iGroup]) || 'Custom') : 'Custom' };
            if (iEnv >= 0 && S(r[iEnv])) e.env = S(r[iEnv]);
            if (iQual >= 0 && S(r[iQual])) e.quality = S(r[iQual]);
            if (iRec >= 0 && S(r[iRec]) !== '') { var rc = Number(S(r[iRec])); if (rc >= 0 && isFinite(rc) && Math.floor(rc) === rc) e.records = rc; else out.skipped.push({ row: n + 2, key: key, why: 'record count "' + S(r[iRec]) + '" is not a whole number (the part was loaded without it)' }); }
            if (iDate >= 0 && S(r[iDate])) e.dataDate = S(r[iDate]);
            if (iModes >= 0 && S(r[iModes])) {
                var c = checkSplit(parseModes(r[iModes]), src);
                if (c.ok) e.modes = c.modes; else out.skipped.push({ row: n + 2, key: key, why: 'failure mode split left out: ' + c.why + ' (the part was loaded without it)' });
            }
            out.parts[key] = e;
        });
        return out;
    }

    // apply(result): writes into projectConfig.customLibrary. A split for a part that exists only in the built-in
    // library becomes an override that keeps the built-in values and adds the split.
    function apply(res) {
        var cfg = (typeof projectConfig !== 'undefined') ? projectConfig : root.projectConfig;
        if (!cfg) return { added: 0, overridden: 0, splits: 0, skipped: (res && res.skipped) || [] };
        if (!cfg.customLibrary || Array.isArray(cfg.customLibrary)) cfg.customLibrary = {};
        var lib = cfg.customLibrary, bi = _builtIn(), added = 0, overridden = 0, splits = 0, skipped = (res.skipped || []).slice();
        Object.keys(res.parts || {}).forEach(function (key) {
            if (bi[key] !== undefined) overridden++; else added++;
            lib[key] = res.parts[key];
            if (res.parts[key].modes) splits++;
        });
        Object.keys(res.splits || {}).forEach(function (key) {
            var base = lib[key] || bi[key];
            if (!base) { skipped.push({ key: key, why: 'no part with this key in the library' }); return; }
            var e = {}; Object.keys(base).forEach(function (k) { e[k] = base[k]; });
            e.modes = res.splits[key];
            lib[key] = e; splits++;
        });
        return { added: added, overridden: overridden, splits: splits, skipped: skipped };
    }

    function splitFor(key) {
        if (!key) return null;
        var c = _custom(), e = (c && !Array.isArray(c)) ? c[key] : null;
        if (e && Array.isArray(e.modes) && e.modes.length) return { modes: e.modes, from: 'imported', source: S(e.modes[0].source || e.source) };
        var b = _builtInSplits()[key];
        if (b && b.length) return { modes: b, from: 'built-in', source: S(b[0].source) };
        return null;
    }
    // every library key that has a split (imported or built-in)
    function keysWithSplit() {
        var out = {}, c = _custom(), b = _builtInSplits();
        Object.keys(b).forEach(function (k) { if (_entry(k)) out[k] = 1; });
        if (c && !Array.isArray(c)) Object.keys(c).forEach(function (k) { if (c[k] && Array.isArray(c[k].modes) && c[k].modes.length) out[k] = 1; });
        return Object.keys(out);
    }

    // the rate a basic event using this part carries: the same sum the fault tree does (lambdaFromInputMode), so the
    // mode rates of a part add back up to its event's rate
    function partLambda(key) {
        var e = _entry(key); if (!e) return 0;
        try { if (typeof lambdaFromInputMode === 'function') { var v = lambdaFromInputMode('library', 0, key, 1); if (v > 0 && isFinite(v)) return v; } } catch (_) {}
        return Number(e.lambda) > 0 ? Number(e.lambda) : 0;
    }

    // ---- 2 Nov 2026 (item 48, the rest): mode names with no shares, and shares entered with their source ----
    // A part with no split can carry mode NAMES only (ANEM's, accepted by a person, or typed): projectConfig.libraryModeNames
    // [key] = { names: [...], by, at }. Names never carry a share; a share comes only with a source the engineer enters
    // (setShares), which makes it a split like an imported one. modesFor: the split first, else the names.
    function _cfg() { try { if (typeof projectConfig !== 'undefined') return projectConfig; } catch (_) {} return root.projectConfig || null; }
    function _names() { var c = _cfg(); if (!c) return {}; if (!c.libraryModeNames || typeof c.libraryModeNames !== 'object' || Array.isArray(c.libraryModeNames)) c.libraryModeNames = {}; return c.libraryModeNames; }
    function namesFor(key) { var n = _names()[key]; return (n && Array.isArray(n.names) && n.names.length) ? n : null; }
    function modesFor(key) {
        var sp = splitFor(key); if (sp) { sp.shares = true; return sp; }
        var n = namesFor(key); if (!n) return null;
        return { modes: n.names.map(function (m) { return { mode: m }; }), from: 'named', source: '', shares: false, by: n.by || '' };
    }
    function cleanNames(list) {
        var out = [], seen = {};
        (list || []).forEach(function (m) {
            m = S(m).replace(/\s+/g, ' ');
            if (!m || m.length > 60 || /\d/.test(m)) return;   // a mode name carries no number
            var k = m.toLowerCase(); if (seen[k]) return; seen[k] = 1; out.push(m);
        });
        return out.slice(0, 8);
    }
    function setNames(key, list, by) {
        if (!_entry(key)) return { ok: false, why: 'no part with this key in the library' };
        if (splitFor(key)) return { ok: false, why: 'this part already has a split with shares' };
        var names = cleanNames(list);
        if (!names.length) return { ok: false, why: 'no usable mode names (a name has no digits and is under 60 characters)' };
        _names()[key] = { names: names, by: S(by) || 'engineer', at: new Date().toISOString() };
        _save();
        return { ok: true, names: names };
    }
    function clearNames(key) { delete _names()[key]; _save(); }
    // shares typed by the engineer, with the source they came from: kept only as a split that passes checkSplit
    function setShares(key, rows, source) {
        if (!_entry(key)) return { ok: false, why: 'no part with this key in the library' };
        source = S(source);
        if (!source) return { ok: false, why: 'name the source the shares come from' };
        var c = checkSplit((rows || []).map(function (r) { return { mode: r.mode, alpha: Number(r.alpha) }; }), source);
        if (!c.ok) return { ok: false, why: c.why };
        var res = apply({ parts: {}, splits: (function () { var o = {}; o[key] = c.modes; return o; })(), skipped: [] });
        if (res.skipped.length) return { ok: false, why: res.skipped[0].why };
        delete _names()[key];
        // FMEA rows of this part that had a mode name and no share take the share and rate now (rows with a share keep theirs)
        var filled = 0, lam = partLambda(key);
        try { (typeof fmeaData !== 'undefined' ? fmeaData : []).forEach(function (r) {
            if (!r || r.parentLibKey !== key || r.alphaFm != null) return;
            var m = c.modes.find(function (x) { return x.mode.toLowerCase().replace(/\s+/g, ' ') === S(r.mode).toLowerCase().replace(/\s+/g, ' '); });
            if (!m) return;
            r.alphaFm = m.alphaFm; r.modeSource = m.source; if (lam > 0) r.rate = lam * m.alphaFm; filled++;
        }); } catch (_) {}
        if (filled) { try { if (typeof renderFMEA === 'function') renderFMEA(); } catch (_) {} }
        _save();
        try { if (typeof refreshLibraryDependentNodes === 'function') refreshLibraryDependentNodes(); } catch (_) {}
        return { ok: true, modes: c.modes, rowsFilled: filled };
    }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }
    // parts used by the project's basic events with neither a split nor names: what ANEM is offered to name
    function usedWithoutModes() {
        var keys = {}, out = [];
        try { (typeof ftaPages !== 'undefined' ? ftaPages : []).forEach(function (p) { (function w(n) { if (!n) return; if (n.type === 'basic' && n.libraryKey) keys[n.libraryKey] = 1; ((n.children || n._children) || []).forEach(w); })(p && p.root); }); } catch (_) {}
        Object.keys(keys).forEach(function (k) { if (_entry(k) && !modesFor(k)) out.push(k); });
        return out.sort();
    }

    // ---- the library page: a Modes button on every row, the modes dialog, and ANEM naming ----
    function E(v) { return S(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function JQ(v) { return E(JSON.stringify(String(v))); }
    function cellHtml(key) {
        var m = modesFor(key);
        var label = m ? (m.modes.length + ' mode' + (m.modes.length === 1 ? '' : 's') + (m.shares ? '' : ', names only')) : 'Modes';
        return '<button type="button" class="action-btn" style="font-size:11px;padding:2px 8px;" onclick="SLLibraryByol.ui.open(' + JQ(key) + ')" title="Failure modes of this part">' + E(label) + '</button>';
    }
    function barHtml() {
        var n = usedWithoutModes().length;
        if (!n) return '';
        return '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:8px 0;padding:8px 12px;border:1px solid var(--color-border-hair);border-radius:var(--r-md);background:var(--color-surface-2);">' +
            '<span style="font-size:12.5px;flex:1 1 320px;">' + n + ' part' + (n === 1 ? '' : 's') + ' used in your fault trees ' + (n === 1 ? 'has' : 'have') + ' no failure modes. ANEM can name them (names only; a share comes only from a source you enter).</span>' +
            '<button type="button" class="action-btn" onclick="SLLibraryByol.ui.nameUsed()">Name the modes with ANEM (' + n + ')</button></div>';
    }
    var _pending = {};   // key -> { modes, why } (ANEM's names, waiting for Accept)
    function _toast(m, k, ms) { try { if (typeof showToast === 'function') showToast(m, k || 'info', ms || 5000); } catch (_) {} }
    function _dialog(key) {
        var d = root.document; if (!d) return;
        var e = _entry(key) || {}, m = modesFor(key), p = _pending[key];
        var old = d.getElementById('lib-modes-modal'); if (old) old.remove();
        var ov = d.createElement('div'); ov.id = 'lib-modes-modal';
        ov.setAttribute('style', 'position:fixed;inset:0;background:rgba(10,12,16,.45);z-index:10050;display:flex;align-items:center;justify-content:center;');
        var rows = '';
        if (m) rows = '<table class="data-table" style="width:100%;font-size:12.5px;margin:8px 0;"><thead><tr><th>Failure mode</th><th style="width:90px;text-align:right;">Share</th><th>Source</th></tr></thead><tbody>' +
            m.modes.map(function (x) { return '<tr><td>' + E(x.mode) + '</td><td style="text-align:right;" class="u-mono">' + (x.alphaFm != null ? E(Math.round(x.alphaFm * 1000) / 10) + '%' : 'none') + '</td><td>' + E(x.source || (m.from === 'named' ? 'names: ' + (m.by || 'engineer') : '')) + (x.device ? ' (' + E(x.device) + ')' : '') + '</td></tr>'; }).join('') + '</tbody></table>';
        var from = !m ? 'This part has no failure modes yet.' : (m.from === 'imported' ? 'Your imported split.' : m.from === 'built-in' ? 'The built-in public split.' : 'Mode names only: no shares, so the FMEA rows for these modes get no rate until you enter shares with their source.');
        var pend = p ? '<div style="border:1.5px dashed rgba(107,79,216,.55);background:rgba(107,79,216,.05);border-radius:8px;padding:10px 12px;margin:8px 0;"><div style="font-size:12px;font-weight:600;margin-bottom:4px;">ANEM suggests these mode names</div><div style="font-size:13px;">' + p.modes.map(E).join(' · ') + '</div>' + (p.why ? '<div style="font-size:11.5px;margin-top:4px;">' + E(p.why) + '</div>' : '') +
            '<div style="display:flex;gap:6px;margin-top:8px;"><button type="button" class="action-btn btn-cyan" onclick="SLLibraryByol.ui.accept(' + JQ(key) + ')">Accept names</button><button type="button" class="action-btn" onclick="SLLibraryByol.ui.discard(' + JQ(key) + ')">Discard</button></div></div>' : '';
        var shareRows = (m ? m.modes : (p ? p.modes.map(function (x) { return { mode: x }; }) : [{ mode: '' }, { mode: '' }])).map(function (x, i) {
            return '<div style="display:flex;gap:6px;margin-bottom:4px;"><input type="text" class="lib-sh-mode" value="' + E(x.mode) + '" placeholder="Mode" style="flex:1;margin:0;" aria-label="Mode ' + (i + 1) + '"><input type="number" class="lib-sh-alpha" min="0" max="100" step="any" value="' + (x.alphaFm != null ? Math.round(x.alphaFm * 10000) / 100 : '') + '" placeholder="%" style="width:80px;margin:0;" aria-label="Share ' + (i + 1) + ' in percent"></div>';
        }).join('');
        ov.innerHTML = '<div role="dialog" aria-label="Failure modes" style="background:var(--color-surface-1,#fff);color:var(--color-text-primary,#101216);border-radius:12px;max-width:640px;width:calc(100% - 32px);max-height:88vh;overflow:auto;padding:18px 20px;box-shadow:0 20px 60px rgba(0,0,0,.3);">' +
            '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;"><h3 style="margin:0;font-size:16px;">Failure modes: ' + E(e.name || key) + '</h3><button type="button" class="action-btn" onclick="SLLibraryByol.ui.close()">Close</button></div>' +
            '<div style="font-size:12.5px;margin-top:6px;">' + E(from) + '</div>' + rows + pend +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 12px;">' + (!m || m.from === 'named' ? '<button type="button" class="action-btn" onclick="SLLibraryByol.ui.nameOne(' + JQ(key) + ')">' + (m ? 'Name again with ANEM' : 'Name the modes with ANEM') + '</button>' : '') +
                (m && m.from === 'named' ? '<button type="button" class="action-btn" onclick="SLLibraryByol.ui.clearNames(' + JQ(key) + ')">Remove the names</button>' : '') + '</div>' +
            '<details' + (m && m.from !== 'named' ? '' : ' open') + '><summary style="cursor:pointer;font-size:13px;font-weight:600;">' + (m && m.shares ? 'Use your own shares instead' : 'Enter shares and their source') + '</summary>' +
            '<div style="font-size:12px;margin:6px 0;">Shares in percent, adding up to 100. A share is kept only with the source it comes from (your FMD copy, a supplier analysis, test data).</div>' +
            '<div id="lib-sh-rows">' + shareRows + '</div><button type="button" class="action-btn" style="font-size:11px;" onclick="SLLibraryByol.ui.addRow()">Add a mode</button>' +
            '<div style="margin-top:8px;"><label style="font-size:12px;">Source of the shares</label><input type="text" id="lib-sh-source" placeholder="e.g. FMD-2016, supplier FMECA rev B" style="margin:0;width:100%;"></div>' +
            '<div style="display:flex;justify-content:flex-end;margin-top:10px;"><button type="button" class="action-btn btn-cyan" onclick="SLLibraryByol.ui.saveShares(' + JQ(key) + ')">Save shares</button></div></details></div>';
        ov.addEventListener('mousedown', function (ev) { if (ev.target === ov) ov.remove(); });
        d.body.appendChild(ov);
    }
    function _refresh(key) {
        try { if (typeof renderLibraryTable === 'function') renderLibraryTable(); } catch (_) {}
        if (key && root.document && root.document.getElementById('lib-modes-modal')) _dialog(key);
    }
    async function _ask(keys) {
        var AI = root.SafetyLabAI;
        if (!AI || typeof AI.modesName !== 'function') { if (typeof root.slLoadAI === 'function') { try { await root.slLoadAI(); } catch (_) {} } AI = root.SafetyLabAI; }
        if (!AI || typeof AI.modesName !== 'function') return { ok: false, why: 'ANEM is not available here.' };
        var r = await AI.modesName(keys);
        if (r && r.ok) r.parts.forEach(function (p) { _pending[p.key] = { modes: p.modes, why: p.why }; });
        return r || { ok: false, why: 'ANEM did not answer.' };
    }
    function _batchPanel() {
        var d = root.document; if (!d) return;
        var keys = Object.keys(_pending); var old = d.getElementById('lib-modes-modal'); if (old) old.remove();
        if (!keys.length) return;
        var ov = d.createElement('div'); ov.id = 'lib-modes-modal';
        ov.setAttribute('style', 'position:fixed;inset:0;background:rgba(10,12,16,.45);z-index:10050;display:flex;align-items:center;justify-content:center;');
        ov.innerHTML = '<div role="dialog" aria-label="Mode names from ANEM" style="background:var(--color-surface-1,#fff);color:var(--color-text-primary,#101216);border-radius:12px;max-width:760px;width:calc(100% - 32px);max-height:88vh;overflow:auto;padding:18px 20px;">' +
            '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;"><h3 style="margin:0;font-size:16px;">Mode names from ANEM</h3><button type="button" class="action-btn" onclick="SLLibraryByol.ui.close()">Close</button></div>' +
            '<div style="font-size:12.5px;margin:6px 0 10px;">Names only. Nothing is saved until you accept. A share comes only from a source you enter on the part.</div>' +
            keys.map(function (k) { var e = _entry(k) || {}, p = _pending[k]; return '<div data-lib-pending="' + E(k) + '" style="border:1.5px dashed rgba(107,79,216,.55);background:rgba(107,79,216,.05);border-radius:8px;padding:10px 12px;margin-bottom:8px;"><div style="font-weight:600;font-size:13px;">' + E(e.name || k) + '</div><div style="font-size:13px;margin-top:2px;">' + p.modes.map(E).join(' · ') + '</div>' + (p.why ? '<div style="font-size:11.5px;margin-top:3px;">' + E(p.why) + '</div>' : '') +
                '<div style="display:flex;gap:6px;margin-top:6px;"><button type="button" class="action-btn btn-cyan" onclick="SLLibraryByol.ui.accept(' + JQ(k) + ', true)">Accept names</button><button type="button" class="action-btn" onclick="SLLibraryByol.ui.discard(' + JQ(k) + ', true)">Discard</button></div></div>'; }).join('') +
            '<div style="display:flex;justify-content:flex-end;gap:6px;"><button type="button" class="action-btn btn-cyan" onclick="SLLibraryByol.ui.acceptAll()">Accept all ' + keys.length + '</button></div></div>';
        d.body.appendChild(ov);
    }
    var ui = {
        open: function (key) { _dialog(key); },
        close: function () { var o = root.document && root.document.getElementById('lib-modes-modal'); if (o) o.remove(); },
        nameOne: async function (key) { var r = await _ask([key]); if (!r.ok) _toast(r.why, 'warning'); _dialog(key); },
        nameUsed: async function () { var keys = usedWithoutModes(); if (!keys.length) return; var r = await _ask(keys); if (!r.ok) { _toast(r.why, 'warning'); return; } _batchPanel(); },
        accept: function (key, batch) { var p = _pending[key]; if (!p) return; var r = setNames(key, p.modes, 'ANEM, accepted'); delete _pending[key]; if (!r.ok) _toast('Not saved: ' + r.why, 'warning'); _refresh(batch ? null : key); if (batch) _batchPanel(); },
        discard: function (key, batch) { delete _pending[key]; if (batch) _batchPanel(); else _dialog(key); },
        acceptAll: function () { Object.keys(_pending).forEach(function (k) { setNames(k, _pending[k].modes, 'ANEM, accepted'); delete _pending[k]; }); _refresh(null); ui.close(); },
        clearNames: function (key) { clearNames(key); _refresh(key); },
        addRow: function () { var h = root.document.getElementById('lib-sh-rows'); if (!h) return; var div = root.document.createElement('div'); div.setAttribute('style', 'display:flex;gap:6px;margin-bottom:4px;'); div.innerHTML = '<input type="text" class="lib-sh-mode" placeholder="Mode" style="flex:1;margin:0;" aria-label="Mode"><input type="number" class="lib-sh-alpha" min="0" max="100" step="any" placeholder="%" style="width:80px;margin:0;" aria-label="Share in percent">'; h.appendChild(div); },
        saveShares: function (key) {
            var d = root.document, ms = d.querySelectorAll('#lib-sh-rows .lib-sh-mode'), as = d.querySelectorAll('#lib-sh-rows .lib-sh-alpha'), rows = [];
            for (var i = 0; i < ms.length; i++) { if (S(ms[i].value) || S(as[i].value)) rows.push({ mode: ms[i].value, alpha: parseFloat(as[i].value) }); }
            var pct = rows.map(function (r) { return { mode: r.mode, alpha: r.alpha }; });
            // typed as percent: read as percent whatever the sum, so 40 / 35 / 25 is 0.40 / 0.35 / 0.25
            pct.forEach(function (r) { r.alpha = r.alpha / 100; });
            var r = setShares(key, pct, (d.getElementById('lib-sh-source') || {}).value);
            if (!r.ok) { _toast('Not saved: ' + r.why + '.', 'warning', 6000); return; }
            _toast('Shares saved with their source.', 'success'); _refresh(key);
        }
    };

    function detail(entry) {
        if (!entry) return '';
        var bits = [S(entry.source) || 'source not stated'];
        if (entry.env) bits.push('environment ' + entry.env);
        if (entry.quality) bits.push('quality ' + entry.quality);
        if (entry.records != null) bits.push(entry.records + ' record' + (entry.records === 1 ? '' : 's'));
        if (entry.dataDate) bits.push('data ' + entry.dataDate);
        if (Array.isArray(entry.modes) && entry.modes.length) bits.push(entry.modes.length + ' failure mode' + (entry.modes.length === 1 ? '' : 's'));
        if (asPublished(entry)) bits.push('used as published');
        return bits.join(' · ');
    }
    // the Modes cell for the library export, so an import of the export gives the same split back
    function modesCell(entry) {
        if (!entry || !Array.isArray(entry.modes)) return '';
        return entry.modes.map(function (m) { return m.mode + '=' + m.alphaFm; }).join('; ');
    }

    root.SLLibraryByol = { FAMILY: FAMILY, isLicensed: isLicensed, family: family, asPublished: asPublished, parse: parse, apply: apply,
        parseModes: parseModes, checkSplit: checkSplit, splitFor: splitFor, keysWithSplit: keysWithSplit, partLambda: partLambda, detail: detail, modesCell: modesCell,
        namesFor: namesFor, modesFor: modesFor, cleanNames: cleanNames, setNames: setNames, clearNames: clearNames, setShares: setShares, usedWithoutModes: usedWithoutModes,
        cellHtml: cellHtml, barHtml: barHtml, _pending: _pending, ui: ui };
})(typeof window !== 'undefined' ? window : globalThis);
