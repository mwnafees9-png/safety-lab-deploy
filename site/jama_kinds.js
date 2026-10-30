// ============================================================================
// jama_kinds.js, v1.0, 22 Oct 2026: everything the live Jama bridge brings in that is not the
// aircraft function tree (jama_tree.js does that) or a requirement (live_bridge.js does that):
// assumptions, failure conditions (FCIM + Hazard assessment), system functions, and which
// system an item belongs to.
//
// Waqas's ruling (22 Oct 2026): "every page that can interface with Jama needs it ... both at the
// aircraft and system level". One connection per project; on each page the panel shows that
// page's Jama changes; same rules everywhere: nothing changes until someone signs, nothing is
// deleted, identity is Jama's item id, the Jama key is the ID Safety Lab shows.
//
// PURE: no network, no DOM, no globals written. live_bridge.js reads Jama and draws the panels.
//
// WHICH SYSTEM. An administrator picks, per system workspace, the Jama folder or set that holds
// that system's items. An item belongs to a system when its Jama position (location.sequence,
// "3.2.1") sits inside that folder's ("3.2"). Everything else is aircraft level. If a customer
// marks systems some other way (a field, a tag), only partition() changes.
//
// FAILURE CONDITIONS. Safety Lab keeps a failure condition in two places, as ARP4761A does: its
// slot in the function's FCIM row (total loss / partial loss / malfunction) and its FHA row
// (severity, flight phases, effects). A Jama failure-condition item fills both. Its function is
// the nearest Jama function above it (looking through folders), or a field the administrator
// names. Its slot comes from a field the administrator names, or from its wording ("Loss of",
// "Partial loss of", "Erroneous"). The FHA values come from the fields the administrator maps.
// A condition whose function is not in Safety Lab yet waits (named, never dropped): apply the
// functions first.
// ============================================================================
(function (root) {
    'use strict';
    const TOOL = 'jama-live';
    function S(v) { return v == null ? '' : String(v).trim(); }
    function arrOf(a) { return Array.isArray(a) ? a : []; }

    // ------------------------------------------------------------------ which system
    // containers: [{ sysId, seq, id }]. Returns Map(itemId -> sysId or null). The deepest
    // container that holds the item wins (a system folder inside another system's folder).
    function partition(items, containers) {
        const cs = arrOf(containers).filter(c => c && S(c.seq)).map(c => ({ sysId: c.sysId, seq: S(c.seq), id: c.id == null ? null : Number(c.id) }))
            .sort((a, b) => b.seq.length - a.seq.length);
        const out = new Map();
        arrOf(items).forEach(function (n) {
            if (!n) return;
            const q = S(n.seq);
            let hit = null;
            for (const c of cs) {
                if (n.id === c.id) break;   // the container itself is nobody's item
                if (q && (q === c.seq || q.indexOf(c.seq + '.') === 0)) { hit = c.sysId; break; }
            }
            out.set(n.id, hit);
        });
        return out;
    }

    // ------------------------------------------------------------------ field values
    // A Jama field can hold text, rich text, a number, a picklist option id, or a list of option
    // ids. options: Map(optionId -> name), filled by live_bridge from /picklistoptions.
    function fieldText(item, field, options) {
        if (!item || !field) return '';
        const f = item.fields || {};
        let v = f[field];
        if (v == null) return '';
        const one = x => {
            if (x == null) return '';
            if (typeof x === 'number' && options instanceof Map && options.has(x)) return S(options.get(x));
            if (typeof x === 'object') return S(x.name || x.value || '');
            return plainText(String(x));
        };
        return Array.isArray(v) ? v.map(one).filter(Boolean).join(', ') : one(v);
    }
    function plainText(html) {
        let t = String(html == null ? '' : html);
        if (!/[<&]/.test(t)) return t.trim();
        t = t.replace(/<(br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, '');
        t = t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        return t.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');
    }
    // the picklist option ids an item set references (so live_bridge can name them)
    function optionIds(items, fieldNames) {
        const want = new Set(arrOf(fieldNames).filter(Boolean)), out = new Set();
        arrOf(items).forEach(function (it) {
            const f = (it && it.fields) || {};
            want.forEach(function (k) {
                const v = f[k];
                (Array.isArray(v) ? v : [v]).forEach(x => { if (typeof x === 'number' && isFinite(x)) out.add(x); });
            });
        });
        return Array.from(out);
    }

    // ------------------------------------------------------------------ vocabularies
    function severityOf(text) {
        const t = S(text).toLowerCase();
        if (!t) return '';
        if (/catastroph|\bcat\b|^i$|\bclass i\b/.test(t)) return 'Catastrophic';
        if (/hazard|severe[- ]major|\bhaz\b|^ii$|\bclass ii\b/.test(t)) return 'Hazardous';
        if (/\bmajor\b|\bmaj\b|^iii$|\bclass iii\b/.test(t)) return 'Major';
        if (/\bminor\b|\bmin\b|^iv$|\bclass iv\b/.test(t)) return 'Minor';
        if (/no safety effect|\bnse\b|no effect|^v$|\bclass v\b/.test(t)) return 'No Safety Effect';
        return '';
    }
    // FCIM slot: from the mapped field when there is one, else from the wording
    function slotOf(modeText, name) {
        const t = S(modeText).toLowerCase(), n = S(name).toLowerCase();
        const read = x => {
            if (!x) return '';
            if (/malfunction|erroneous|misleading|inadvertent|uncommanded|incorrect|unannunciated wrong|hazardously misleading/.test(x)) return 'm';
            if (/partial|degrad|reduced|loss of (one|some|a single)|intermittent/.test(x)) return 'pl';
            if (/total|complete|loss of all|^loss of|^loss\b|unavailab/.test(x)) return 'tl';
            return '';
        };
        return read(t) || read(n);
    }
    const SLOT_NAME = { tl: 'Total loss', pl: 'Partial loss', m: 'Malfunction' };

    // ------------------------------------------------------------------ simple kinds
    // Assumptions and system functions: one Jama item, one Safety Lab row, matched by item id.
    //   spec.src     the source field on the row ('asmSource' | 'fnSource')
    //   spec.same(row, item) -> [field names that differ]
    function diffSimple(items, rows, spec) {
        const byRemote = new Map();
        arrOf(rows).forEach(r => { const s = r && r[spec.src]; if (s && s.tool === TOOL && s.remoteId != null) byRemote.set(Number(s.remoteId), r); });
        const fresh = [], changed = [], seen = new Set();
        let unchanged = 0;
        arrOf(items).forEach(function (it) {
            const r = byRemote.get(Number(it.id));
            if (!r) { fresh.push({ item: it }); return; }
            seen.add(r);
            const fields = spec.same(r, it);
            if (r[spec.src].missingInSource) fields.push('back in Jama');
            if (fields.length) changed.push({ row: r, item: it, fields: fields }); else unchanged++;
        });
        const missing = arrOf(rows).filter(r => r && r[spec.src] && r[spec.src].tool === TOOL && !seen.has(r) && !r[spec.src].missingInSource)
            .map(r => ({ row: r, why: 'no longer in Jama' }));
        return { fresh, changed, missing, unchanged };
    }
    function _stamp(item, by, at, extra) { return Object.assign({ tool: TOOL, remoteId: item.id, key: item.key, lastChange: item.modified, by: by, at: at }, extra || {}); }
    function _flag(rows, src, by, at) { let n = 0; arrOf(rows).forEach(x => { const s = x.row[src]; s.missingInSource = true; s.missingWhy = x.why || ''; s.flaggedAt = at; s.flaggedBy = by; n++; }); return n; }
    function _need(o) {
        const by = S(o && o.signedBy);
        if (!by) return { err: 'A signature is required. The bridge watches; you decide.' };
        return { by: by, at: (o && o.at) || new Date().toISOString(), newId: (o && typeof o.newId === 'function') ? o.newId : (function () { let n = Date.now(); return () => String(n++); })() };
    }

    // assumptions: asmId = the Jama key, text = the description (or the name when it has none)
    const ASM = {
        src: 'asmSource',
        text: it => S(it.text) || S(it.name),
        same: (r, it) => { const f = []; if (S(r.text) !== ASM.text(it)) f.push('text'); if (S(r.asmId) !== S(it.key)) f.push('Jama key'); return f; }
    };
    function diffAssumptions(items, rows) { return diffSimple(items, rows, ASM); }
    function applyAssumptions(diff, store, opts) {
        const o = _need(opts); if (o.err) return { ok: false, err: o.err };
        if (!Array.isArray(store)) return { ok: false, err: 'The assumption store is not available.' };
        let added = 0, updated = 0;
        arrOf(diff.fresh).forEach(x => {
            store.push({ internalId: o.newId(), asmId: x.item.key, origin: 'Jama', text: ASM.text(x.item), state: 'Proposed', valStrategy: '', valArtifact: '', verArtifact: '',
                         asmSource: _stamp(x.item, o.by, o.at) });
            added++;
        });
        arrOf(diff.changed).forEach(x => {
            x.row.text = ASM.text(x.item); x.row.asmId = x.item.key;
            Object.assign(x.row.asmSource, _stamp(x.item, o.by, o.at)); delete x.row.asmSource.missingInSource;
            updated++;
        });
        return { ok: true, added, updated, flagged: _flag(diff.missing, 'asmSource', o.by, o.at) };
    }

    // system functions (flat in a system workspace): funcId = the Jama key
    const SFN = {
        src: 'fnSource',
        same: (r, it) => { const f = []; if (S(r.funcName) !== S(it.name)) f.push('name'); if (S(r.funcDef) !== S(it.text)) f.push('description'); if (S(r.funcId) !== S(it.key)) f.push('Jama key'); return f; }
    };
    function diffSystemFunctions(items, rows) { return diffSimple(items, rows, SFN); }
    function applySystemFunctions(diff, store, opts) {
        const o = _need(opts); if (o.err) return { ok: false, err: o.err };
        if (!Array.isArray(store)) return { ok: false, err: 'The system function store is not available.' };
        let added = 0, updated = 0;
        arrOf(diff.fresh).forEach(x => {
            store.push({ internalId: o.newId(), funcId: x.item.key, funcName: x.item.name, funcDef: x.item.text, fnSource: _stamp(x.item, o.by, o.at) });
            added++;
        });
        arrOf(diff.changed).forEach(x => {
            // the ID stays what it was: FCIM, FHA and traces point at it; the new key is recorded
            x.row.funcName = x.item.name; x.row.funcDef = x.item.text;
            Object.assign(x.row.fnSource, _stamp(x.item, o.by, o.at)); delete x.row.fnSource.missingInSource;
            updated++;
        });
        return { ok: true, added, updated, flagged: _flag(diff.missing, 'fnSource', o.by, o.at) };
    }

    // ------------------------------------------------------------------ failure conditions
    // ctx:
    //   fcim, fha            the FCIM and FHA stores of the scope (aircraft or one system)
    //   functionOf(item)     the Safety Lab function ID (subId / funcId) the condition belongs to, or ''
    //   functionWhy(item)    why there is none (for the waiting list)
    //   values(item)         { mode, severity, phases, effAc, effCrew, effPax } as text (mapped fields)
    //   leafCheck(id)        '' or a note when the function has functions under it
    const SLOTS = [['tl', 'tlId', 'tlDesc'], ['pl', 'plId', 'plDesc'], ['m', 'mId', 'mDesc']];
    function fcimSlotOf(fcim, fcId) {
        for (const r of arrOf(fcim)) {
            if (!r) continue;
            for (const [slot, idK] of SLOTS) if (S(r[idK]) === fcId) return { row: r, slot: slot, extra: false };
            for (const [slot, k] of [['pl', 'plExtra'], ['m', 'mExtra']]) {
                const i = arrOf(r[k]).findIndex(e => e && S(e.id) === fcId);
                if (i >= 0) return { row: r, slot: slot, extra: true, index: i };
            }
        }
        return null;
    }
    function _fcWanted(item, ctx) {
        const v = (ctx.values && ctx.values(item)) || {};
        return {
            fcId: S(item.key), fcDesc: S(item.name) || S(item.text), subId: S(ctx.functionOf ? ctx.functionOf(item) : ''),
            slot: slotOf(v.mode, item.name), severity: severityOf(v.severity), severityRaw: S(v.severity),
            phases: S(v.phases), effAc: S(v.effAc), effCrew: S(v.effCrew), effPax: S(v.effPax)
        };
    }
    function diffFailureConditions(items, ctx) {
        const fha = arrOf(ctx.fha), fcim = arrOf(ctx.fcim);
        const byRemote = new Map();
        fha.forEach(r => { const s = r && r.fcSource; if (s && s.tool === TOOL && s.remoteId != null) byRemote.set(Number(s.remoteId), r); });
        const fresh = [], changed = [], waiting = [], notes = [], seen = new Set();
        let unchanged = 0;
        arrOf(items).forEach(function (it) {
            const w = _fcWanted(it, ctx);
            const r = byRemote.get(Number(it.id));
            if (r) seen.add(r);
            if (!w.subId) { waiting.push({ item: it, why: (ctx.functionWhy && ctx.functionWhy(it)) || 'it is not under a function in Jama' }); return; }
            if (!w.slot) { waiting.push({ item: it, why: 'Safety Lab cannot tell whether it is a total loss, a partial loss or a malfunction: choose the Jama field that says so, or word it "Loss of ...", "Partial loss of ..." or "Erroneous ..."' }); return; }
            if (w.severityRaw && !w.severity) notes.push(w.fcId + ': severity "' + w.severityRaw + '" is not one Safety Lab knows; it is left for you to classify');
            const leaf = ctx.leafCheck ? ctx.leafCheck(w.subId) : '';
            if (leaf) notes.push(w.fcId + ': ' + leaf);
            if (!r) { fresh.push({ item: it, want: w }); return; }
            const now = fcimSlotOf(fcim, S(r.fcId));
            const f = [];
            if (S(r.fcDesc) !== w.fcDesc) f.push('description');
            if (S(r.subId) !== w.subId) f.push('function ' + S(r.subId) + ' is now ' + w.subId);
            if (!now || now.slot !== w.slot) f.push('now a ' + SLOT_NAME[w.slot].toLowerCase());
            if (w.severity && S(r.severity) !== w.severity) f.push('severity ' + (S(r.severity) || 'none') + ' is now ' + w.severity);
            ['phases', 'effAc', 'effCrew', 'effPax'].forEach(k => { if (w[k] && S(r[k]) !== w[k]) f.push({ phases: 'flight phases', effAc: 'effect on the aircraft', effCrew: 'effect on the crew', effPax: 'effect on passengers' }[k]); });
            if (r.fcSource.missingInSource) f.push('back in Jama');
            if (f.length) changed.push({ row: r, item: it, want: w, fields: f }); else unchanged++;
        });
        const missing = fha.filter(r => r && r.fcSource && r.fcSource.tool === TOOL && !seen.has(r) && !r.fcSource.missingInSource).map(r => ({ row: r, why: 'no longer in Jama' }));
        return { fresh, changed, missing, waiting, notes, unchanged };
    }
    function _fcimRowFor(fcim, subId, newId) {
        let r = fcim.find(x => x && S(x.subId) === subId);
        if (!r) { r = { internalId: newId(), subId: subId, awareness: '', tlId: '', tlDesc: '', plId: '', plDesc: '', mId: '', mDesc: '' }; fcim.push(r); }
        return r;
    }
    function _takeOut(fcim, fcId) {
        const at = fcimSlotOf(fcim, fcId); if (!at) return;
        if (at.extra) { at.row[at.slot === 'pl' ? 'plExtra' : 'mExtra'].splice(at.index, 1); return; }
        const [, idK, dK] = SLOTS.find(x => x[0] === at.slot);
        at.row[idK] = ''; at.row[dK] = '';
    }
    // put the condition in its slot; a second partial loss or malfunction of one function goes in
    // the slot's list (Table A3 multiplicity); a second total loss is refused by name
    function _putIn(fcim, w, newId) {
        const r = _fcimRowFor(fcim, w.subId, newId);
        const [, idK, dK] = SLOTS.find(x => x[0] === w.slot);
        if (!S(r[idK]) || S(r[idK]) === w.fcId) { r[idK] = w.fcId; r[dK] = w.fcDesc; return ''; }
        if (w.slot === 'tl') return w.fcId + ': ' + w.subId + ' already has a total loss (' + S(r[idK]) + '); a function has one total loss. Not placed in the FCIM.';
        const k = w.slot === 'pl' ? 'plExtra' : 'mExtra';
        if (!Array.isArray(r[k])) r[k] = [];
        const e = r[k].find(x => x && S(x.id) === w.fcId);
        if (e) e.desc = w.fcDesc; else r[k].push({ id: w.fcId, desc: w.fcDesc });
        return '';
    }
    function _fhaFields(row, w) {
        row.fcId = w.fcId; row.fcDesc = w.fcDesc; row.subId = w.subId;
        if (w.severity) row.severity = w.severity;
        ['phases', 'effAc', 'effCrew', 'effPax'].forEach(k => { if (w[k]) row[k] = w[k]; });
    }
    function applyFailureConditions(diff, ctx, opts) {
        const o = _need(opts); if (o.err) return { ok: false, err: o.err };
        const fcim = ctx.fcim, fha = ctx.fha;
        if (!Array.isArray(fcim) || !Array.isArray(fha)) return { ok: false, err: 'The FCIM or FHA store is not available.' };
        let added = 0, updated = 0; const refused = [];
        arrOf(diff.fresh).forEach(x => {
            const why = _putIn(fcim, x.want, o.newId);
            if (why) { refused.push(why); return; }
            const row = { internalId: o.newId(), fcId: '', fcDesc: '', subId: '', phases: '', effAc: '', effCrew: '', effPax: '', severity: '', assumptionIds: [], comments: '',
                          fcSource: _stamp(x.item, o.by, o.at) };
            _fhaFields(row, x.want);
            // 30 Oct 2026 (no duplicates): the condition already assessed for these phases is updated, not added again;
            // one assessed for only some of them is refused by name
            const _nd = (typeof window !== 'undefined') ? window.SLNoDupes : null, _c = _nd ? _nd.fhaClash(row, fha) : null;
            if (_c && !_c.exact) { refused.push(_c.reason); return; }
            if (_c && _c.exact) { _fhaFields(_c.row, x.want); _c.row.fcSource = row.fcSource; updated++; return; }
            fha.push(row); added++;
        });
        arrOf(diff.changed).forEach(x => {
            const was = S(x.row.fcId);
            const now = fcimSlotOf(fcim, was);
            if (!now || now.slot !== x.want.slot || S(now.row.subId) !== x.want.subId) {
                _takeOut(fcim, was);
                const why = _putIn(fcim, Object.assign({}, x.want, { fcId: was }), o.newId);
                if (why) { refused.push(why); return; }
            } else {
                const [, , dK] = SLOTS.find(s => s[0] === now.slot);
                if (now.extra) now.row[now.slot === 'pl' ? 'plExtra' : 'mExtra'][now.index].desc = x.want.fcDesc; else now.row[dK] = x.want.fcDesc;
            }
            // the FC ID stays what it was (fault trees, requirements and traces point at it)
            _fhaFields(x.row, Object.assign({}, x.want, { fcId: was }));
            Object.assign(x.row.fcSource, _stamp(x.item, o.by, o.at)); delete x.row.fcSource.missingInSource;
            updated++;
        });
        return { ok: true, added, updated, refused, flagged: _flag(diff.missing, 'fcSource', o.by, o.at) };
    }

    function pendingOf(d) {
        if (!d) return 0;
        return arrOf(d.fresh).length + arrOf(d.changed).length + arrOf(d.missing).length + arrOf(d.fnChanged).length + arrOf(d.moved).length + arrOf(d.revised).length;
    }

    const API = { TOOL, partition, fieldText, optionIds, plainText, severityOf, slotOf, SLOT_NAME, diffSimple,
                  diffAssumptions, applyAssumptions, diffSystemFunctions, applySystemFunctions,
                  fcimSlotOf, diffFailureConditions, applyFailureConditions, pendingOf };
    root.SLJamaKinds = API;
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
