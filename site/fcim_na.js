// ============================================================================
// fcim_na.js, v1.0, 26 Oct 2026: an FCIM cell that does not apply says so, with its reason, and stops there.
//
// RULING (Waqas, 26 Oct 2026, confirmed): "instead of leaving non-applicable failure conditions blank the AI should be
// populating them as N/A with the rationale why the AI did not consider those failure conditions. But our engine
// should read them as not applicable and NOT count them as failure conditions at all and not populate the thread or
// any other conditions from that point on; they are stopped right at the FCIM level." And: "the engineer can overrule
// N/A and ask ANEM (the AI assistant) to draft that failure condition or do it manually."
//
// THE CELL. Each FCIM row has three cells (total loss tl, partial loss pl, malfunction m). A cell is in one of three
// states (state(row, s)):
//   'condition'  it holds a failure condition (text, an FC ID, or additional conditions in plExtra / mExtra)
//   'na'         it holds no condition and a reason it does not apply: row[s + 'Na'] = the reason (a string)
//   'blank'      neither: not assessed yet. A blank is never read as "does not apply" (rule 24).
// Fields beside the reason (flat, so the form, the change collection, the exports and the live sync all read them):
//   sNaBy 'ai' | 'engineer', sNaAt ISO time; when the cell held a condition before it was marked: sNaPrevId,
//   sNaPrevDesc, sNaPrevExtra (kept, never deleted, and put back by an overrule); sNaParked: the FHA rows that
//   classified that condition, set aside by the person's choice ({ at, row }, put back by an overrule); sNaKeep: the
//   person chose to keep those FHA rows as failure conditions (Thread Integrity lists them, INV-68).
// A project saved before this has none of these fields: every cell reads as before (condition or blank).
//
// WHERE N/A STOPS. A cell marked N/A carries no FC ID and no text, so nothing mints an ID for it (_slAutoNumber and the
// AI writer number a cell only when it has text) and _pushExtractedFCs (misc_fn_modules.js), the one place FCIM cells
// become failure conditions, skips it by name. Everything downstream (the FHA pickers, the AI FHA drafter, trees,
// DALs, requirements, the Golden Thread, CoFFE) starts from those extracted conditions or from FHA rows built on them.
// A condition later written into an N/A cell by any path (the form, an import, the assistant) stands: settle() puts
// back what the N/A had set aside and drops the reason.
//
// API (window.SLFcimNa): SLOTS, state, isNa, why, mark, overrule, park, keep, downstream, settle, settleAll, audit,
// locate, cellHtml, markInteractive, overruleInteractive, draftInteractive, askDownstream, rowLabel.
// Load: after misc_fn_modules.js and safety_lab.js, before fcim_combined.js and fc_auto_trees.js.
// Tests: tests/regression_fcim_na_20261026.test.js.
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '1.0';
    var SLOTS = [
        { s: 'tl', id: 'tlId', desc: 'tlDesc', extra: null, label: 'Total loss', mode: 'TL' },
        { s: 'pl', id: 'plId', desc: 'plDesc', extra: 'plExtra', label: 'Partial loss', mode: 'PL' },
        { s: 'm', id: 'mId', desc: 'mDesc', extra: 'mExtra', label: 'Malfunction', mode: 'M' }
    ];
    var NA_FIELDS = ['Na', 'NaBy', 'NaAt', 'NaPrevId', 'NaPrevDesc', 'NaPrevExtra', 'NaParked', 'NaKeep'];
    function _slot(s) { for (var i = 0; i < SLOTS.length; i++) if (SLOTS[i].s === s) return SLOTS[i]; return null; }
    function _t(v) { return String(v == null ? '' : v).trim(); }
    function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function _extraHas(row, sl) { var a = sl.extra ? row[sl.extra] : null; return Array.isArray(a) && a.some(function (e) { return e && (_t(e.desc) || _t(e.id)); }); }

    // ---- the cell --------------------------------------------------------------------------------------------------
    function why(row, s) { return row ? _t(row[s + 'Na']) : ''; }
    function state(row, s) {
        var sl = _slot(s); if (!row || !sl) return 'blank';
        if (_t(row[sl.desc]) || _extraHas(row, sl)) return 'condition';
        if (why(row, s)) return 'na';
        if (_t(row[sl.id])) return 'condition';
        return 'blank';
    }
    function isNa(row, s) { return state(row, s) === 'na'; }
    function _clearNa(row, s) { NA_FIELDS.forEach(function (f) { delete row[s + f]; }); }
    function _prevIds(row, s) {
        var ids = [_t(row[s + 'NaPrevId'])];
        (Array.isArray(row[s + 'NaPrevExtra']) ? row[s + 'NaPrevExtra'] : []).forEach(function (e) { if (e) ids.push(_t(e.id)); });
        return ids.filter(Boolean);
    }
    // the FHA rows (of the scope's FHA store) that classify the condition this cell held before it was marked N/A
    function downstream(row, s, fha) {
        if (!row) return [];
        var ids = _prevIds(row, s); if (!ids.length) return [];
        return (Array.isArray(fha) ? fha : []).filter(function (r) { return r && ids.indexOf(_t(r.fcId)) >= 0; });
    }

    // mark(row, s, reason, { by, fha }): the cell no longer holds a failure condition. Refused without a reason.
    // A condition it held is kept beside it (sNaPrev*) and its FHA rows are returned for the person to decide on.
    function mark(row, s, reason, opts) {
        opts = opts || {};
        var sl = _slot(s); reason = _t(reason);
        if (!row || !sl) return { ok: false, error: 'There is no such cell.' };
        if (!reason) return { ok: false, error: 'A cell marked not applicable needs the reason it does not apply.' };
        var was = state(row, s);
        if (was === 'condition') {
            row[s + 'NaPrevId'] = _t(row[sl.id]);
            row[s + 'NaPrevDesc'] = row[sl.desc] == null ? '' : String(row[sl.desc]);
            if (sl.extra && Array.isArray(row[sl.extra]) && row[sl.extra].length) row[s + 'NaPrevExtra'] = row[sl.extra];
        }
        if (sl.extra) delete row[sl.extra];
        row[sl.id] = ''; row[sl.desc] = '';
        row[s + 'Na'] = reason;
        row[s + 'NaBy'] = opts.by === 'ai' ? 'ai' : 'engineer';
        row[s + 'NaAt'] = new Date().toISOString();
        delete row[s + 'NaKeep'];
        return { ok: true, was: was, downstream: downstream(row, s, opts.fha) };
    }
    // set the FHA rows built on the old condition aside: out of the FHA (so nothing reads them as failure conditions),
    // kept with the cell, put back by an overrule. Nothing is deleted.
    function park(row, s, fha) {
        if (!row || !Array.isArray(fha)) return 0;
        var ids = _prevIds(row, s); if (!ids.length) return 0;
        var parked = Array.isArray(row[s + 'NaParked']) ? row[s + 'NaParked'] : [], took = [];
        for (var i = 0; i < fha.length; i++) { var r = fha[i]; if (r && ids.indexOf(_t(r.fcId)) >= 0) took.push({ at: i, row: r }); }
        for (var j = took.length - 1; j >= 0; j--) fha.splice(took[j].at, 1);
        if (took.length) row[s + 'NaParked'] = parked.concat(took);
        delete row[s + 'NaKeep'];
        return took.length;
    }
    function keep(row, s) { if (row) row[s + 'NaKeep'] = true; }
    function _unpark(row, s, fha) {
        var p = row[s + 'NaParked'], n = 0;
        if (!Array.isArray(p) || !Array.isArray(fha)) return 0;
        p.slice().sort(function (a, b) { return (a.at || 0) - (b.at || 0); }).forEach(function (x) {
            if (!x || !x.row) return;
            if (fha.some(function (r) { return r && String(r.internalId) === String(x.row.internalId); })) return;
            fha.splice(Math.min(x.at || 0, fha.length), 0, x.row); n++;
        });
        delete row[s + 'NaParked'];
        return n;
    }
    // overrule(row, s, fha): the N/A is withdrawn. A condition the cell held before comes back with the FHA rows that
    // were set aside; a cell that never held one opens blank, for the engineer to write or for ANEM to draft.
    function overrule(row, s, fha) {
        var sl = _slot(s);
        if (!row || !sl || state(row, s) !== 'na') return { ok: false, error: 'This cell is not marked not applicable.' };
        var n = _unpark(row, s, fha), restored = false;
        if (_t(row[s + 'NaPrevDesc']) || _t(row[s + 'NaPrevId'])) {
            row[sl.id] = row[s + 'NaPrevId'] || ''; row[sl.desc] = row[s + 'NaPrevDesc'] || '';
            if (sl.extra && Array.isArray(row[s + 'NaPrevExtra'])) row[sl.extra] = row[s + 'NaPrevExtra'];
            restored = true;
        }
        _clearNa(row, s);
        return { ok: true, restored: restored, unparked: n };
    }
    // a condition was written into an N/A cell by another path: the condition stands, the FHA rows set aside come
    // back, a blank FC ID takes the one the cell had, and the reason goes. Returns the slots it settled.
    function settle(row, fha) {
        var out = [];
        if (!row) return out;
        SLOTS.forEach(function (sl) {
            var s = sl.s;
            if (!why(row, s) && !Array.isArray(row[s + 'NaParked'])) return;
            if (state(row, s) !== 'condition') return;
            _unpark(row, s, fha);
            if (!_t(row[sl.id]) && _t(row[s + 'NaPrevId']) && _t(row[sl.desc])) row[sl.id] = _t(row[s + 'NaPrevId']);
            _clearNa(row, s);
            out.push(s);
        });
        return out;
    }
    function settleAll(fcim, fha) { var n = 0; (Array.isArray(fcim) ? fcim : []).forEach(function (r) { n += settle(r, fha).length; }); return n; }

    // ---- the project ----------------------------------------------------------------------------------------------
    function _stores() {
        var o = { ac: [], acFha: [], systems: [], acFuncs: [] };
        try { if (typeof acFcimData !== 'undefined') o.ac = acFcimData || []; } catch (_) {}
        try { if (typeof acFhaData !== 'undefined') o.acFha = acFhaData || []; } catch (_) {}
        try { if (typeof systemsData !== 'undefined') o.systems = systemsData || []; } catch (_) {}
        try { if (typeof acFunctionsData !== 'undefined') o.acFuncs = acFunctionsData || []; } catch (_) {}
        try { var E = root.SLEnv; if (E && typeof E.get === 'function') { if (!o.ac.length && Array.isArray(E.get('acFcimData'))) o.ac = E.get('acFcimData'); if (!o.acFha.length && Array.isArray(E.get('acFhaData'))) o.acFha = E.get('acFhaData'); if (!o.systems.length && Array.isArray(E.get('systemsData'))) o.systems = E.get('systemsData'); } } catch (_) {}
        return o;
    }
    // locate(internalId): { row, fcim, fha, sys, scope: 'ac' | 'sys', funcs }
    function locate(iid) {
        var st = _stores(), row = st.ac.find(function (r) { return r && String(r.internalId) === String(iid); });
        if (row) return { row: row, fcim: st.ac, fha: st.acFha, sys: null, scope: 'ac', funcs: st.acFuncs };
        for (var i = 0; i < st.systems.length; i++) {
            var sy = st.systems[i]; if (!sy) continue;
            row = (sy.fcim || []).find(function (r) { return r && String(r.internalId) === String(iid); });
            if (row) { if (!Array.isArray(sy.fha)) sy.fha = []; return { row: row, fcim: sy.fcim, fha: sy.fha, sys: sy, scope: 'sys', funcs: sy.functions || [] }; }
        }
        return null;
    }
    // every cell, for Thread Integrity: blank cells (not assessed yet), "N/A" typed with no reason, and N/A cells whose
    // old condition is still classified in the FHA (the person kept those rows, or has not decided)
    function audit(stores) {
        var st = stores || _stores();
        var scopes = [{ where: 'Aircraft FCIM', fcim: st.ac || st.acFcimData || [], fha: st.acFha || st.acFhaData || [] }];
        (st.systems || st.systemsData || []).forEach(function (sy) { if (sy) scopes.push({ where: (sy.name || sy.id) + ' FCIM', fcim: sy.fcim || [], fha: sy.fha || [] }); });
        var out = { checked: 0, blank: [], naNoReason: [], stillClassified: [], na: 0 };
        scopes.forEach(function (sc) {
            (Array.isArray(sc.fcim) ? sc.fcim : []).forEach(function (r) {
                if (!r) return;
                var who = sc.where + ' ' + (r.subId || ('#' + r.internalId)) + (r.awareness ? ' (' + r.awareness + ')' : '');
                SLOTS.forEach(function (sl) {
                    out.checked++;
                    var st2 = state(r, sl.s);
                    if (st2 === 'condition' && /^\s*(n\/?a|not applicable)\s*\.?\s*$/i.test(String(r[sl.desc] || ''))) { out.naNoReason.push(who + ' ' + sl.label.toLowerCase() + ': marked "N/A" with no reason; give the reason it does not apply, or write the failure condition'); return; }
                    if (st2 === 'blank') { out.blank.push(who + ' ' + sl.label.toLowerCase() + ': not assessed yet (no failure condition, and no reason it does not apply)'); return; }
                    if (st2 === 'na') {
                        out.na++;
                        var d = downstream(r, sl.s, sc.fha);
                        if (d.length) out.stillClassified.push(who + ' ' + sl.label.toLowerCase() + ' is marked not applicable, but ' + d.length + ' FHA row' + (d.length === 1 ? '' : 's') + ' still classif' + (d.length === 1 ? 'ies ' : 'y ') + _prevIds(r, sl.s).join(', ') + (r[sl.s + 'NaKeep'] ? ' (kept by choice)' : '; set them aside or keep them from the FCIM cell'));
                    }
                });
            });
        });
        return out;
    }
    // a label for an FCIM row in lists of FCIM rows (search, links): its first condition, or "not applicable"
    function rowLabel(r) {
        if (!r) return '';
        var id = _t(r.tlId) || _t(r.plId) || _t(r.mId), desc = _t(r.tlDesc) || _t(r.plDesc) || _t(r.mDesc);
        if (id || desc) return (id || ('#' + r.internalId)) + ' · ' + desc;
        var na = SLOTS.some(function (sl) { return state(r, sl.s) === 'na'; });
        return (_t(r.subId) || ('#' + r.internalId)) + ' · ' + (na ? 'no failure condition applies' : 'not assessed yet');
    }

    // ---- the page --------------------------------------------------------------------------------------------------
    var PILL = 'font-size:10px;padding:0 6px;border-radius:999px;border:1px dashed var(--color-border-strong);background:transparent;cursor:pointer;color:var(--color-text-secondary);margin:2px 3px 0 0;';
    function _btn(act, row, s, text, title) {
        return '<button type="button" data-fcim-na="' + act + '" data-iid="' + _esc(row.internalId) + '" data-slot="' + s + '" title="' + _esc(title) + '" style="' + PILL + '">' + _esc(text) + '</button>';
    }
    // the inside of one TL / PL / M cell on the FCIM page (the <td> is the caller's). extrasHtml: the cell's additional
    // conditions, already rendered by the caller.
    function cellHtml(row, s, extrasHtml) {
        var sl = _slot(s); if (!row || !sl) return '';
        var st = state(row, s);
        if (st === 'na') {
            var by = row[s + 'NaBy'] === 'ai' ? 'ANEM' : 'the engineer';
            var fha = (locate(row.internalId) || {}).fha;
            var d = downstream(row, s, fha);
            var parked = Array.isArray(row[s + 'NaParked']) ? row[s + 'NaParked'].length : 0;
            return '<span class="fcim-na" data-fcim-na-cell="' + s + '" title="' + _esc(sl.label + ' does not apply: ' + why(row, s) + ' (marked by ' + by + '). It is not a failure condition: nothing downstream is built from it.') + '" style="display:inline-block;font-size:10.5px;font-weight:800;letter-spacing:.04em;padding:0 7px;border-radius:4px;border:1px solid var(--color-border-strong);color:var(--color-text-secondary);">N/A</span>'
                + '<br><span style="font-size:11px;color:var(--color-text-tertiary);font-style:italic;">' + _esc(why(row, s)) + '</span>'
                + '<br><span style="font-size:10px;color:var(--color-text-tertiary);">Marked by ' + _esc(by) + (parked ? '; ' + parked + ' FHA row' + (parked === 1 ? '' : 's') + ' set aside' : '') + '</span><br>'
                + _btn('overrule', row, s, 'overrule', 'Withdraw not applicable: ' + (_t(row[s + 'NaPrevDesc']) ? 'the failure condition it held comes back' : 'the cell opens for a failure condition'))
                + (d.length && !row[s + 'NaKeep'] ? _btn('decide', row, s, d.length + ' FHA row' + (d.length === 1 ? '' : 's') + ': decide', 'FHA rows still classify the condition this cell held: set them aside or keep them') : '');
        }
        if (st === 'condition') {
            return '<strong>' + _esc(row[sl.id]) + '</strong><br>' + _esc(row[sl.desc]) + (extrasHtml || '')
                + '<br>' + _btn('mark', row, s, 'not applicable', 'Mark ' + sl.label.toLowerCase() + ' not applicable to this function (a reason is required)');
        }
        // blank: shown blank, with what can be done about it
        return (extrasHtml || '') + _btn('draft', row, s, 'draft with ANEM', 'Ask ANEM to draft this one cell: a failure condition, or the reason it does not apply')
            + _btn('mark', row, s, 'not applicable', 'Mark ' + sl.label.toLowerCase() + ' not applicable to this function (a reason is required)');
    }

    function _fn(name) { var f = root[name]; if (typeof f === 'function') return f; try { var E = root.SLEnv; if (E && typeof E.get === 'function') { var v = E.get(name); if (typeof v === 'function') return v; } } catch (_) {} return null; }
    function _do(name) { var f = _fn(name); if (!f) return; try { return f.apply(root, Array.prototype.slice.call(arguments, 1)); } catch (e) { try { console.warn('[fcim_na] ' + name, e); } catch (_) {} } }
    function _toast(m, k, ms) { _do('showToast', m, k || 'info', ms || 5000); }
    function _after() {
        _do('rebuildExtractedFCsForAllSystems');
        _do('renderACFCIM'); _do('renderSysFCIM'); _do('renderACFHA'); _do('renderSysFHA');
        _do('scheduleAutosave');
    }
    function _batch(label, fn) {
        var CA = root.SLChangeAck;
        if (CA && typeof CA.batch === 'function') { try { return CA.batch(label, fn); } catch (_) {} }
        return Promise.resolve().then(fn);
    }
    function _linked(ctx, rows) {
        var ids = rows.map(function (r) { return String(r.internalId); }), fcIds = rows.map(function (r) { return _t(r.fcId); });
        var trees = 0, reqs = 0;
        try { (typeof ftaPages !== 'undefined' ? ftaPages : (root.ftaPages || [])).forEach(function (p) { var l = (Array.isArray(p && p.linkedFhaIds) ? p.linkedFhaIds : (p && p.linkedFhaId != null ? [p.linkedFhaId] : [])).map(function (x) { return String(x).replace(/^(AC_|SYS_)/, ''); }); if (l.some(function (x) { return ids.indexOf(x) >= 0; })) trees++; }); } catch (_) {}
        try { var rq = ctx.scope === 'ac' ? (typeof acReqData !== 'undefined' ? acReqData : []) : ((ctx.sys && ctx.sys.req) || []); (rq || []).forEach(function (r) { if (!r || r.deleted) return; var c = (r.reqSource && r.reqSource.context) || {}; if (fcIds.indexOf(_t(r.traceId)) >= 0 || fcIds.indexOf(_t(c.fcId)) >= 0) reqs++; }); } catch (_) {}
        return { trees: trees, reqs: reqs };
    }
    // ask what to do with FHA rows still classifying the condition the cell held (the way fc_auto_trees.js asks about a
    // tree its failure condition no longer needs). 'park' | 'keep' | 'later' | 'none'
    async function askDownstream(row, s, ctx) {
        ctx = ctx || locate(row && row.internalId);
        if (!ctx) return 'none';
        var rows = downstream(row, s, ctx.fha); if (!rows.length) return 'none';
        var choose = _fn('slChoose'); if (!choose) return 'later';
        var sl = _slot(s), L = _linked(ctx, rows), ids = _prevIds(row, s).join(', ');
        var v = await choose(sl.label + ' of ' + (row.subId || 'this function') + ' is marked not applicable. ' + rows.length + ' FHA row' + (rows.length === 1 ? '' : 's') + ' classif' + (rows.length === 1 ? 'ies' : 'y') + ' the failure condition it held (' + ids + ')'
            + (L.trees ? ', ' + L.trees + ' fault tree' + (L.trees === 1 ? ' is' : 's are') + ' linked to ' + (rows.length === 1 ? 'it' : 'them') : '')
            + (L.reqs ? ', ' + L.reqs + ' requirement' + (L.reqs === 1 ? ' traces' : 's trace') + ' to it' : '') + '. Set them aside, or keep them?', [
            { value: 'park', label: 'Set them aside', hint: 'They stop counting as failure conditions and are kept with this FCIM cell; overruling the N/A brings them back. A fault tree made for them is asked about next; requirements generated from them are offered for removal the next time requirements are generated.' },
            { value: 'keep', label: 'Keep them', hint: 'They stay as failure conditions. Thread Integrity lists them until you decide.' }],
            { title: 'Work built on a failure condition that no longer applies', cancelText: 'Ask me later' });
        if (!v) return 'later';
        if (v === 'keep') { keep(row, s); return 'keep'; }
        var n = park(row, s, ctx.fha);
        if (n) _toast(n + ' FHA row' + (n === 1 ? '' : 's') + ' set aside with ' + (row.subId || 'the cell') + ' ' + sl.label.toLowerCase() + '. Overrule the N/A to bring ' + (n === 1 ? 'it' : 'them') + ' back.', 'info', 6000);
        return 'park';
    }
    // the person marks a cell not applicable: a reason is required (the dialog asks again on a blank)
    async function markInteractive(iid, s) {
        var ctx = locate(iid), sl = _slot(s); if (!ctx || !sl) return { ok: false };
        var askReason = _fn('slPrompt'); if (!askReason) return { ok: false };
        var reason = null;
        for (;;) {
            reason = await askReason('Why does ' + sl.label.toLowerCase() + ' not apply to ' + (ctx.row.subId || 'this function') + '? The reason stays with the cell, and the cell stops counting as a failure condition.', why(ctx.row, s), { title: 'Mark ' + sl.label.toLowerCase() + ' not applicable', okText: 'Mark not applicable' });
            if (reason == null) return { ok: false, canceled: true };
            if (_t(reason)) break;
            _toast('A reason is needed: a cell cannot be marked not applicable without one.', 'warning', 5000);
        }
        var res = null;
        await _batch((ctx.row.subId || 'FCIM') + ' ' + sl.label.toLowerCase() + ' marked not applicable', async function () {
            res = mark(ctx.row, s, reason, { by: 'engineer', fha: ctx.fha });
            if (res.ok && res.downstream.length) await askDownstream(ctx.row, s, ctx);
            _after(ctx);
        });
        return res || { ok: false };
    }
    async function overruleInteractive(iid, s) {
        var ctx = locate(iid), sl = _slot(s); if (!ctx || !sl) return { ok: false };
        var res = null;
        await _batch((ctx.row.subId || 'FCIM') + ' ' + sl.label.toLowerCase() + ': not applicable withdrawn', function () {
            res = overrule(ctx.row, s, ctx.fha);
            _after(ctx);
        });
        if (res && res.ok) _toast(sl.label + ' of ' + (ctx.row.subId || 'this function') + (res.restored ? ' holds its failure condition again' + (res.unparked ? ' and ' + res.unparked + ' FHA row' + (res.unparked === 1 ? ' is' : 's are') + ' back' : '') + '.' : ' is open: write the failure condition, or ask ANEM to draft it.'), 'info', 6000);
        return res || { ok: false };
    }
    async function decideInteractive(iid, s) {
        var ctx = locate(iid); if (!ctx) return 'none';
        var v = 'none';
        await _batch((ctx.row.subId || 'FCIM') + ': FHA rows of a condition that no longer applies', async function () { v = await askDownstream(ctx.row, s, ctx); _after(ctx); });
        return v;
    }
    function draftInteractive(iid, s) {
        var go = function () { var AI = root.SafetyLabAI; if (AI && typeof AI.draftFcimCell === 'function') return AI.draftFcimCell(iid, s); _toast('ANEM is not available in this session.', 'warning'); };
        var load = _fn('slLoadAI');
        if (load) return Promise.resolve(load()).then(go, function () { _toast('ANEM could not be loaded.', 'warning'); });
        return go();
    }
    if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
        document.addEventListener('click', function (e) {
            var b = e.target && e.target.closest && e.target.closest('[data-fcim-na]');
            if (!b) return;
            e.preventDefault();
            var act = b.getAttribute('data-fcim-na'), iid = b.getAttribute('data-iid'), s = b.getAttribute('data-slot');
            if (act === 'mark') markInteractive(iid, s);
            else if (act === 'overrule') overruleInteractive(iid, s);
            else if (act === 'decide') decideInteractive(iid, s);
            else if (act === 'draft') draftInteractive(iid, s);
        });
    }

    // ---- INV-68: every FCIM cell is assessed --------------------------------------------------------------------------
    var INV = {
        id: 'INV-68', sev: 'advisory',
        name: 'Every FCIM cell is assessed: a failure condition, or marked not applicable with its reason',
        run: function () {
            var a = audit();
            return { checked: a.checked, fails: a.naNoReason.concat(a.stillClassified, a.blank), blank: a.blank.length, notApplicable: a.na };
        }
    };
    (function reg(tries) {
        if (typeof root.invRegister === 'function') { try { root.invRegister(INV); } catch (_) {} return; }
        if (tries > 0 && typeof setTimeout === 'function') setTimeout(function () { reg(tries - 1); }, 300);
    })(25);

    var api = { VERSION: VERSION, SLOTS: SLOTS, state: state, isNa: isNa, why: why, mark: mark, overrule: overrule, park: park, keep: keep,
        downstream: downstream, settle: settle, settleAll: settleAll, audit: audit, locate: locate, rowLabel: rowLabel, cellHtml: cellHtml,
        askDownstream: askDownstream, markInteractive: markInteractive, overruleInteractive: overruleInteractive, decideInteractive: decideInteractive,
        draftInteractive: draftInteractive, INV: INV };
    try { root.SLFcimNa = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
