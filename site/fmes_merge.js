/* fmes_merge.js v1.0 (2 Nov 2026): FMES effects that say the same thing (customer checklist item 50).
 *
 * Waqas, 2 Nov 2026: "go ahead on item 50", on the agreed mockup: the FMES groups failure modes by end effect and detection,
 * and today only exact wording groups together, so "Loss of pitch command" and "Pitch command lost" stay apart and each hands
 * the tree a split rate. ANEM finds effects that mean the same thing; a person confirms each merge (Merge or Keep apart),
 * with Undo. Effects merge only when their detection is the same, so a detected and an undetected effect never share a group.
 *
 *   projectConfig.fmesMerges  [{ id, sys, det, effects: [normalized effect], name, by, at }]: one merged effect per entry,
 *                             inside one system and one detection. fmesGroups (misc_fn_modules.js) groups every row whose
 *                             effect is in a merge under the merge's name, rates summed.
 *   projectConfig.fmesApart   [{ sys, det, effects, at }]: effects a person kept apart; ANEM is not offered them again.
 *   projectConfig.fmesMergeLog  the merges as they were before each change (Undo goes back one step).
 *   groupsForAnem(): per system, the detection groups with two or more different effects (as written in the FMEA).
 *   check(groupId, effects, name): a suggestion is kept only when every effect is in that one group, there are two or more,
 *                             they are not already one merged effect or kept apart, and the name is one of them.
 * Nothing in the FMEA rows is changed: a merge is a grouping, and splitting it gives the rows back their own groups.
 * Run the test: node tests/regression_fmes_merge_20261102.test.js
 */
(function (root) {
    'use strict';
    function S(v) { return String(v == null ? '' : v).trim(); }
    function norm(v) { return S(v).replace(/\s+/g, ' ').toLowerCase(); }
    function E(v) { return S(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function JQ(v) { return E(JSON.stringify(String(v))); }
    function _cfg() { try { if (typeof projectConfig !== 'undefined') return projectConfig; } catch (_) {} return root.projectConfig || null; }
    function _arr(name) { var c = _cfg(); if (!c) return []; if (!Array.isArray(c[name])) c[name] = []; return c[name]; }
    function merges() { return _arr('fmesMerges'); }
    function apart() { return _arr('fmesApart'); }
    function _rows() { try { if (typeof fmeaData !== 'undefined' && Array.isArray(fmeaData)) return fmeaData; } catch (_) {} return []; }
    function _sysName(id) { try { if (typeof _fmesSysName === 'function') return _fmesSysName(id); } catch (_) {} return id || 'Aircraft'; }
    function sysKeyOf(r) { return r.scope === 'system' ? S(r.owningSystemId) : 'AC'; }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }

    function canonical(sys, det, eff) {
        var ms = merges();
        for (var i = 0; i < ms.length; i++) { var m = ms[i]; if (m.sys === sys && m.det === det && m.effects.indexOf(eff) >= 0) return m; }
        return null;
    }
    // the detection groups as written in the FMEA (before any merge)
    function rawGroups() {
        var g = {};
        _rows().forEach(function (r) {
            if ((r.fmeaType || 'piece-part') !== 'piece-part') return;
            var eff = norm(r.endEffect), det = norm(r.detection);
            if (!eff || !det) return;
            var sys = sysKeyOf(r), key = sys + '§' + det;
            if (!g[key]) g[key] = { key: key, sys: sys, det: det, system: _sysName(sys === 'AC' ? '' : sys), detection: S(r.detection), effects: {} };
            var x = g[key].effects[eff] || (g[key].effects[eff] = { norm: eff, text: S(r.endEffect).replace(/\s+/g, ' '), rows: 0 });
            x.rows++;
        });
        return g;
    }
    var _ids = {};   // short group id sent to ANEM -> group key
    function _keptApart(sys, det, effs) {
        return apart().some(function (a) { return a.sys === sys && a.det === det && effs.every(function (e) { return a.effects.indexOf(e) >= 0; }); });
    }
    function _oneMerge(sys, det, effs) {
        var m = canonical(sys, det, effs[0]);
        return !!m && effs.every(function (e) { return m.effects.indexOf(e) >= 0; });
    }
    function groupsForAnem() {
        var g = rawGroups(), bySys = {}, n = 0; _ids = {};
        Object.keys(g).forEach(function (k) {
            var grp = g[k], effs = Object.keys(grp.effects);
            if (effs.length < 2) return;
            // a group whose effects are all one merged effect already has nothing left to compare
            if (_oneMerge(grp.sys, grp.det, effs)) return;
            var id = 'G' + (++n); _ids[id] = k;
            (bySys[grp.sys] || (bySys[grp.sys] = { system: grp.system, groups: [] })).groups.push({ group: id, detection: grp.detection, effects: effs.map(function (e) { return grp.effects[e].text; }) });
        });
        return Object.keys(bySys).map(function (s) { return bySys[s]; });
    }
    function check(groupId, effects, name) {
        var key = _ids[groupId] || groupId, grp = rawGroups()[key];
        if (!grp) return { ok: false, why: 'unknown group' };
        var effs = [], seen = {};
        (Array.isArray(effects) ? effects : []).forEach(function (e) { var k = norm(e); if (k && !seen[k]) { seen[k] = 1; effs.push(k); } });
        if (effs.length < 2) return { ok: false, why: 'fewer than two effects' };
        if (!effs.every(function (e) { return grp.effects[e]; })) return { ok: false, why: 'an effect is not in this detection group' };
        if (_oneMerge(grp.sys, grp.det, effs)) return { ok: false, why: 'already one merged effect' };
        if (_keptApart(grp.sys, grp.det, effs)) return { ok: false, why: 'kept apart by a person' };
        var nk = norm(name);
        if (effs.indexOf(nk) < 0) return { ok: false, why: 'the name is not one of the effects' };
        return { ok: true, groupId: key, effects: effs.map(function (e) { return grp.effects[e].text; }), name: grp.effects[nk].text };
    }
    function _log() { var c = _cfg(); if (!c) return; var l = _arr('fmesMergeLog'); l.push(JSON.stringify(merges())); if (l.length > 50) l.splice(0, l.length - 50); }
    function merge(groupKey, effects, name, by) {
        var grp = rawGroups()[groupKey];
        if (!grp) return { ok: false, why: 'unknown group' };
        var effs = []; (effects || []).forEach(function (e) { var k = norm(e); if (k && grp.effects[k] && effs.indexOf(k) < 0) effs.push(k); });
        if (effs.length < 2) return { ok: false, why: 'fewer than two effects in this detection group' };
        var nm = S(name).replace(/\s+/g, ' ');
        if (!nm || nm.length > 160) return { ok: false, why: 'the merged effect needs a name' };
        _log();
        var ms = merges(), hit = ms.filter(function (m) { return m.sys === grp.sys && m.det === grp.det && m.effects.some(function (e) { return effs.indexOf(e) >= 0; }); });
        var keep = hit[0];
        if (keep) {
            hit.slice(1).forEach(function (m) { m.effects.forEach(function (e) { if (keep.effects.indexOf(e) < 0) keep.effects.push(e); }); ms.splice(ms.indexOf(m), 1); });
            effs.forEach(function (e) { if (keep.effects.indexOf(e) < 0) keep.effects.push(e); });
            keep.name = nm; keep.by = S(by) || 'engineer'; keep.at = new Date().toISOString();
        } else {
            keep = { id: 'FMESM-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), sys: grp.sys, det: grp.det, effects: effs, name: nm, by: S(by) || 'engineer', at: new Date().toISOString() };
            ms.push(keep);
        }
        _save();
        return { ok: true, merge: keep };
    }
    function keepApart(groupKey, effects) {
        var grp = rawGroups()[groupKey]; if (!grp) return { ok: false };
        var effs = (effects || []).map(norm).filter(function (e) { return grp.effects[e]; });
        if (effs.length < 2) return { ok: false };
        apart().push({ sys: grp.sys, det: grp.det, effects: effs, at: new Date().toISOString() });
        _save();
        return { ok: true };
    }
    function undoLast() {
        var l = _arr('fmesMergeLog'); if (!l.length) return { ok: false, why: 'nothing to undo' };
        var prev = JSON.parse(l.pop()), ms = merges();
        ms.splice(0, ms.length); prev.forEach(function (m) { ms.push(m); });
        _save();
        return { ok: true };
    }
    function split(id) {
        var ms = merges(), i = ms.findIndex(function (m) { return m.id === id; });
        if (i < 0) return { ok: false };
        _log(); ms.splice(i, 1); _save();
        return { ok: true };
    }

    // ---- the FMES page ----
    var _pending = [];   // ANEM's suggestions waiting for Merge or Keep apart
    var _busy = false;
    function panelHtml() {
        var ms = merges(), log = _arr('fmesMergeLog');
        var h = '<div style="border:1px solid var(--color-border-hair);border-radius:var(--r-md);padding:12px 14px;margin-bottom:var(--s-4);background:var(--color-surface-1);">' +
            '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;"><div style="flex:1 1 320px;"><strong style="font-size:13.5px;">Effects that say the same thing</strong>' +
            '<div style="font-size:12px;margin-top:2px;">Rows group only when their end effect reads the same. ANEM finds effects worded differently that mean the same thing; you confirm each merge. Effects merge only when their detection is the same.</div></div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;"><button type="button" class="ckpt-m-btn" onclick="SLFmesMerge.ui.find()"' + (_busy ? ' disabled' : '') + '>' + (_busy ? 'ANEM is comparing…' : 'Find similar effects with ANEM') + '</button>' +
            '<button type="button" class="ckpt-m-btn" onclick="SLFmesMerge.ui.undo()"' + (log.length ? '' : ' disabled') + '>Undo last merge</button></div></div>';
        if (_pending.length) {
            h += '<table class="data-table" style="width:100%;font-size:12.5px;margin-top:10px;"><thead><tr><th>Effects found</th><th>Detection</th><th style="width:70px;">Rows</th><th>Merge into</th><th style="width:180px;"></th></tr></thead><tbody>';
            var g = rawGroups();
            _pending.forEach(function (p, i) {
                var grp = g[p.groupId]; if (!grp) return;
                var rows = p.effects.reduce(function (s, e) { var x = grp.effects[norm(e)]; return s + (x ? x.rows : 0); }, 0);
                h += '<tr style="background:rgba(107,79,216,.05);outline:1.5px dashed rgba(107,79,216,.55);outline-offset:-2px;"><td><span style="display:inline-block;padding:1px 7px;border-radius:999px;font-size:10.5px;font-weight:700;background:rgba(107,79,216,.12);color:#4B33B0;">ANEM</span> ' + p.effects.map(E).join('<br>') + (p.why ? '<div style="font-size:11px;margin-top:3px;">' + E(p.why) + '</div>' : '') + '</td>' +
                    '<td>' + E(grp.detection) + '</td><td>' + rows + '</td>' +
                    '<td><input type="text" id="fmes-merge-name-' + i + '" value="' + E(p.name) + '" aria-label="Merged effect name" style="margin:0;width:100%;"></td>' +
                    '<td><div style="display:flex;gap:6px;"><button type="button" class="ckpt-m-btn" onclick="SLFmesMerge.ui.accept(' + i + ')">Merge</button><button type="button" class="ckpt-m-btn" onclick="SLFmesMerge.ui.apart(' + i + ')">Keep apart</button></div></td></tr>';
            });
            h += '</tbody></table>';
        }
        if (ms.length) {
            h += '<div style="font-size:12px;font-weight:600;margin-top:10px;">Merged effects</div><table class="data-table" style="width:100%;font-size:12.5px;"><thead><tr><th>Merged effect</th><th>Effects in it</th><th>Detection</th><th style="width:90px;"></th></tr></thead><tbody>';
            var g2 = rawGroups();
            ms.forEach(function (m) {
                var grp = g2[m.sys + '§' + m.det];
                h += '<tr><td>' + E(m.name) + '<div style="font-size:11px;">' + E(m.by) + '</div></td><td>' + m.effects.map(function (e) { return E(grp && grp.effects[e] ? grp.effects[e].text : e); }).join('<br>') + '</td><td>' + E(grp ? grp.detection : m.det) + '</td>' +
                    '<td><button type="button" class="ckpt-m-btn" onclick="SLFmesMerge.ui.split(' + JQ(m.id) + ')">Split</button></td></tr>';
            });
            h += '</tbody></table>';
        }
        return h + '</div>';
    }
    function _rerender() { try { if (typeof renderFmesPage === 'function') renderFmesPage(); } catch (_) {} }
    function _toast(m, k, ms) { try { if (typeof showToast === 'function') showToast(m, k || 'info', ms || 5000); } catch (_) {} }
    var ui = {
        find: async function () {
            if (_busy) return;
            var AI = root.SafetyLabAI;
            if (!AI || typeof AI.fmesSimilar !== 'function') { if (typeof root.slLoadAI === 'function') { try { await root.slLoadAI(); } catch (_) {} } AI = root.SafetyLabAI; }
            if (!AI || typeof AI.fmesSimilar !== 'function') { _toast('ANEM is not available here.', 'warning'); return; }
            _busy = true; _rerender();
            var r; try { r = await AI.fmesSimilar(); } finally { _busy = false; }
            if (!r || !r.ok) { _toast((r && r.why) || 'ANEM did not answer.', 'info'); _rerender(); return; }
            _pending = r.suggestions.slice();
            _rerender();
        },
        accept: function (i) {
            var p = _pending[i]; if (!p) return;
            var el = root.document && root.document.getElementById('fmes-merge-name-' + i);
            var r = merge(p.groupId, p.effects, el ? el.value : p.name, 'ANEM suggestion, accepted');
            if (!r.ok) { _toast('Not merged: ' + r.why + '.', 'warning'); return; }
            _pending.splice(i, 1); _rerender();
        },
        apart: function (i) { var p = _pending[i]; if (!p) return; keepApart(p.groupId, p.effects); _pending.splice(i, 1); _rerender(); },
        undo: function () { var r = undoLast(); if (!r.ok) _toast('Nothing to undo.', 'info'); _rerender(); },
        split: function (id) { split(id); _rerender(); }
    };

    root.SLFmesMerge = { VERSION: '1.0', norm: norm, canonical: canonical, rawGroups: rawGroups, groupsForAnem: groupsForAnem, check: check,
        merge: merge, keepApart: keepApart, undoLast: undoLast, split: split, merges: merges, panelHtml: panelHtml, ui: ui, _pending: function () { return _pending; } };
})(typeof window !== 'undefined' ? window : globalThis);
