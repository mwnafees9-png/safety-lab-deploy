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
        parseModes: parseModes, checkSplit: checkSplit, splitFor: splitFor, keysWithSplit: keysWithSplit, partLambda: partLambda, detail: detail, modesCell: modesCell };
})(typeof window !== 'undefined' ? window : globalThis);
