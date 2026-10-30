// ============================================================================
// no_dupes.js — v1.0 — ONE RULE FOR WHAT COUNTS AS THE SAME THING.
//
// Waqas, 30 Oct 2026: "AI or the tool itself must not create duplicates anywhere in the app, once
// an analysis or a field has been created, it can then be updated or removed, not duplicated".
// His rulings on what "the same" means:
//   · a function exists once: no second function, or sub-function, with the same ID or the same name
//     in the same place (a sub-function's name is unique under its parent; a system's functions are
//     unique by ID and by name inside that system);
//   · the FCIM holds at most two rows per function, one crew-Aware and one crew-Unaware ("2 FCIM rows
//     per function, 1 aware the second unaware");
//   · the FHA assesses a failure condition once per flight phase: no two rows for the same condition
//     may share a phase ("no ... two FHA rows being assessed for the same phases of flight");
//   · systems are unique by name (case and spaces ignored); a rename to a name in use is refused.
//
// Every writer asks THIS module (the form, the AI accept, ANEM, the imports, the connections), so the
// meaning of "the same" cannot drift between them. Pure functions over the rows handed in; the only
// state read is the mission profile, for "All phases".
// ============================================================================
(function () {
    'use strict';

    function S(v) { return String(v == null ? '' : v).trim(); }
    function norm(v) { return S(v).replace(/\s+/g, ' ').toLowerCase(); }
    function same(a, b) { return String(a) === String(b); }
    function others(arr, row) {
        var id = row && row.internalId;
        return (Array.isArray(arr) ? arr : []).filter(function (r) { return r && (id == null || id === '' || !same(r.internalId, id)); });
    }

    // ---------------------------------------------------------------- functions
    // An aircraft function row carries the function (funcId, funcName) and, usually, one of its
    // sub-functions (subId, subName, parentSubId). Several rows share a function on purpose.
    function acFunctionClash(row, arr) {
        if (!row) return null;
        var rest = others(arr, row);
        var sub = S(row.subId), subName = norm(row.subName), fid = S(row.funcId), fname = norm(row.funcName);
        var hit;
        if (sub) {
            hit = rest.find(function (r) { return S(r.subId) === sub; });
            if (hit) return { row: hit, reason: 'Sub-function ' + sub + ' already exists' + (S(hit.subName) ? ' (' + S(hit.subName) + ')' : '') + '. Edit that one instead of adding it again.' };
        }
        if (subName) {
            hit = rest.find(function (r) { return norm(r.subName) === subName && S(r.funcId) === fid && S(r.parentSubId) === S(row.parentSubId); });
            if (hit) return { row: hit, reason: 'A sub-function called "' + S(hit.subName) + '" already exists in the same place (' + (S(hit.subId) || 'no ID') + '). Edit that one instead of adding it again.' };
        }
        if (fname) {
            hit = rest.find(function (r) { return norm(r.funcName) === fname && S(r.funcId) !== fid; });
            if (hit) return { row: hit, reason: 'The function "' + S(hit.funcName) + '" already exists as ' + (S(hit.funcId) || 'another function') + '. Add sub-functions under it instead of creating it again.' };
        }
        if (fid && !sub && !subName) {
            hit = rest.find(function (r) { return S(r.funcId) === fid; });
            if (hit) return { row: hit, reason: 'Aircraft function ' + fid + ' already exists. Edit it, or add sub-functions under it.' };
        }
        return null;
    }
    function sysFunctionClash(row, arr) {
        if (!row) return null;
        var rest = others(arr, row);
        var fid = S(row.funcId), fname = norm(row.funcName), hit;
        if (fid) {
            hit = rest.find(function (r) { return S(r.funcId) === fid; });
            if (hit) return { row: hit, reason: 'System function ' + fid + ' already exists' + (S(hit.funcName) ? ' (' + S(hit.funcName) + ')' : '') + '. Edit that one instead of adding it again.' };
        }
        if (fname) {
            hit = rest.find(function (r) { return norm(r.funcName) === fname; });
            if (hit) return { row: hit, reason: 'This system already has a function called "' + S(hit.funcName) + '" (' + (S(hit.funcId) || 'no ID') + '). Edit that one instead of adding it again.' };
        }
        return null;
    }

    // ---------------------------------------------------------------- FCIM
    // At most one crew-Aware and one crew-Unaware row per function. "N/A" on awareness means the
    // crew-unaware case does not arise, so that row is the Aware one; blank counts as Aware too.
    function awarenessKey(v) { return /unaware/i.test(S(v)) ? 'unaware' : 'aware'; }
    function fcimClash(row, arr) {
        if (!row || !S(row.subId)) return null;
        var aw = awarenessKey(row.awareness);
        var hit = others(arr, row).find(function (r) { return S(r.subId) === S(row.subId) && awarenessKey(r.awareness) === aw; });
        if (!hit) return null;
        return { row: hit, reason: S(row.subId) + ' already has its crew-' + (aw === 'unaware' ? 'Unaware' : 'Aware') + ' FCIM row. A function has one Aware and one Unaware row at most: edit that row instead.' };
    }

    // ---------------------------------------------------------------- FHA
    function profile() {
        try {
            var fp = (typeof window !== 'undefined' && window.SLEnv && typeof window.SLEnv.get === 'function') ? window.SLEnv.get('flightPhasesData') : null;
            var out = (Array.isArray(fp) ? fp : []).map(function (p) { return S(p && p.phase); }).filter(function (x) { return x && !/^all phases$/i.test(x); });
            return out;
        } catch (_) { return []; }
    }
    function phaseList(p) { return (Array.isArray(p) ? p : String(p == null ? '' : p).split(',')).map(S).filter(Boolean); }
    // The phases a row covers, as keys; "All phases" stands for the whole mission profile.
    function phaseKeys(p) {
        var list = phaseList(p), prof = null, out = [], seen = {};
        list.forEach(function (x) {
            var ks = /^all phases$/i.test(x) ? (prof = prof || profile()).map(norm) : [norm(x)];
            if (/^all phases$/i.test(x) && !ks.length) ks = ['*'];
            ks.forEach(function (k) { if (!seen[k]) { seen[k] = 1; out.push(k); } });
        });
        return out;
    }
    // The failure condition a row assesses: its FC ID (phase siblings share it), else the FCIM condition
    // it came from, else the function and the condition's words.
    function conditionKey(r) {
        if (!r) return '';
        if (S(r.fcId)) return 'id:' + norm(r.fcId);
        if (S(r.sourceCondId)) return 'id:' + norm(r.sourceCondId);
        if (S(r.fcDesc)) return 'txt:' + norm(r.subId) + '|' + norm(r.fcDesc);
        return '';
    }
    function sameConditionAs(a, b) {
        if (!a || !b) return false;
        var ka = conditionKey(a), kb = conditionKey(b);
        if (ka && ka === kb) return true;
        // a row carrying only the FCIM source id is the same condition as one carrying it as its FC ID
        var ida = [S(a.fcId), S(a.sourceCondId)].filter(Boolean).map(norm), idb = [S(b.fcId), S(b.sourceCondId)].filter(Boolean).map(norm);
        if (ida.some(function (x) { return idb.indexOf(x) >= 0; })) return true;
        // a row not yet numbered (its FC ID is minted after this check) is the same condition as a numbered
        // one when it is the same function and the same words
        if ((!S(a.fcId) || !S(b.fcId)) && S(a.subId) && S(a.subId) === S(b.subId) && S(a.fcDesc) && norm(a.fcDesc) === norm(b.fcDesc)) return true;
        return false;
    }
    function overlap(ka, kb) {
        if (!ka.length || !kb.length) return [];
        if (ka.indexOf('*') >= 0) return kb.slice();
        if (kb.indexOf('*') >= 0) return ka.slice();
        return ka.filter(function (k) { return kb.indexOf(k) >= 0; });
    }
    function phaseLabel(keys, rowPhases) {
        // show the phases in the words the project uses
        var names = phaseList(rowPhases).concat(profile());
        return keys.map(function (k) { if (k === '*') return 'all phases'; var n = names.find(function (x) { return norm(x) === k; }); return n || k; });
    }
    // Rows of the same condition that already assess one of this row's phases.
    function fhaClash(row, arr) {
        if (!row || !conditionKey(row)) return null;
        var mine = phaseKeys(row.phases);
        if (!mine.length) return null;
        var hits = [], all = [];
        others(arr, row).forEach(function (r) {
            if (!sameConditionAs(r, row)) return;
            var ov = overlap(mine, phaseKeys(r.phases));
            if (ov.length) { hits.push(r); ov.forEach(function (k) { if (all.indexOf(k) < 0) all.push(k); }); }
        });
        if (!hits.length) return null;
        var exact = hits.length === 1 && phaseKeys(hits[0].phases).slice().sort().join('|') === mine.slice().sort().join('|');
        var cond = S(row.fcId) || S(row.sourceCondId) || S(row.fcDesc);
        return {
            rows: hits, row: hits[0], exact: exact, phases: phaseLabel(all, row.phases),
            reason: cond + ' is already assessed for ' + phaseLabel(all, row.phases).join(', ') + ' (' + hits.map(function (h) { return S(h.fcId) || 'row'; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(', ') + '). A flight phase has one assessment per failure condition: edit that row, or pick phases not yet assessed.'
        };
    }

    // ---------------------------------------------------------------- systems
    function systemNameClash(name, systems, exceptId) {
        var n = norm(name);
        if (!n) return null;
        var hit = (Array.isArray(systems) ? systems : []).find(function (s) { return s && norm(s.name) === n && (exceptId == null || !same(s.id, exceptId)); });
        return hit ? { system: hit, reason: 'A system called "' + S(hit.name) + '" already exists. Pick a different name.' } : null;
    }
    function findSystemByName(name, systems) { var c = systemNameClash(name, systems, null); return c ? c.system : null; }

    // ---------------------------------------------------------------- imports and connections
    // A file or a connected tool brings the person's own rows. One that is the SAME row as an existing one
    // (same ID, or the same function's Aware/Unaware FCIM row, or the same condition for the same phases)
    // updates it in place: the fields the import carries overwrite, the rest of the row is kept. One that
    // only resembles another (a function name used under another ID, a condition already assessed for SOME
    // of its phases) is skipped and reported, never guessed onto the wrong row.
    function _clashFor(kind, rec, store) {
        if (kind === 'acFunc') return acFunctionClash(rec, store);
        if (kind === 'sysFunc') return sysFunctionClash(rec, store);
        if (kind === 'fcim') return fcimClash(rec, store);
        if (kind === 'fha') return fhaClash(rec, store);
        return null;
    }
    function _sameRow(kind, rec, c) {
        if (!c) return false;
        if (kind === 'fha') return !!c.exact;
        if (kind === 'fcim') return true;
        if (kind === 'sysFunc') return true;
        // aircraft functions: the same sub-function ID, the same named sub-function in the same place when
        // the import gives no ID, or the same function row with no sub-function
        var h = c.row;
        if (S(rec.subId)) return S(h.subId) === S(rec.subId);
        if (S(rec.subName)) return norm(h.subName) === norm(rec.subName) && S(h.funcId) === S(rec.funcId);
        return S(h.funcId) === S(rec.funcId) && !S(h.subId) && !S(h.subName);
    }
    var ID_FIELDS = { funcId: 1, subId: 1, fcId: 1, tlId: 1, plId: 1, mId: 1, sourceCondId: 1 };
    function newTally() { return { added: 0, updated: 0, skipped: [] }; }
    function importUpsert(store, rec, kind, tally) {
        tally = tally || newTally();
        if (!Array.isArray(store) || !rec) return 'none';
        var c = _clashFor(kind, rec, store);
        if (!c) { store.push(rec); tally.added++; return 'added'; }
        if (!_sameRow(kind, rec, c)) { tally.skipped.push(c.reason); return 'skipped'; }
        var hit = c.row;
        Object.keys(rec).forEach(function (k) {
            if (k === 'internalId') return;
            var v = rec[k];
            if (ID_FIELDS[k] && S(hit[k])) return;   // an existing row keeps its IDs: links hang on them
            if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return;
            hit[k] = v;
        });
        hit.importUpdatedAt = new Date().toISOString();
        tally.updated++;
        return 'updated';
    }
    function tallyText(t) {
        if (!t || (!t.updated && !t.skipped.length)) return '';
        var s = [];
        if (t.updated) s.push(t.updated + ' row' + (t.updated === 1 ? '' : 's') + ' already existed and ' + (t.updated === 1 ? 'was' : 'were') + ' updated in place');
        if (t.skipped.length) s.push(t.skipped.length + ' row' + (t.skipped.length === 1 ? ' was' : 's were') + ' skipped, because ' + (t.skipped.length === 1 ? 'it' : 'each') + ' would have duplicated an existing one: ' + t.skipped.slice(0, 5).join(' ') + (t.skipped.length > 5 ? ' (and ' + (t.skipped.length - 5) + ' more)' : ''));
        return s.join('. ') + '. Nothing was added twice.';
    }

    var API = {
        VERSION: '1.0', norm: norm,
        importUpsert: importUpsert, newTally: newTally, tallyText: tallyText,
        acFunctionClash: acFunctionClash, sysFunctionClash: sysFunctionClash,
        awarenessKey: awarenessKey, fcimClash: fcimClash,
        phaseKeys: phaseKeys, conditionKey: conditionKey, sameConditionAs: sameConditionAs, fhaClash: fhaClash,
        systemNameClash: systemNameClash, findSystemByName: findSystemByName
    };
    if (typeof window !== 'undefined') window.SLNoDupes = API;
    if (typeof module !== 'undefined') module.exports = API;
})();
