/* fha_phase_cover.js: every flight phase accounted for, on the FHA table itself (5 Nov 2026).
   Waqas, on Radia's FHA: "it completely left out Cruise ... till Brian went in and had to update it manually".
   The ruling it holds (4 Sep 2026): every failure condition applies to every flight phase; rows come from effects. So
   for each failure condition (its rows grouped by condition id), every phase of the project's mission profile is either
   on one of its rows ("All phases" counts for all), or marked "Does not apply" with the reason, by a person. A phase
   that is neither is flagged: at the top of the Comments cell of the condition's first row (where group findings go), and in a bar over the table, with
   "Draft the missing phases with ANEM" (only those phases, the rows already there kept) and "Does not apply".
   It reads every row, ANEM's and hand-written alike, so a gap is seen whoever made the rows. Both the aircraft FHA and
   each system FHA. Pure apart from markNA / clearNA, which edit a row and save. */
(function () {
    'use strict';
    const keyP = x => String(x == null ? '' : x).toLowerCase().replace(/[^a-z0-9]+/g, '');
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const now = () => new Date().toISOString();

    // the project's mission profile, in its own order ("All phases" is a wildcard, not a phase)
    function profile() {
        let out = [];
        try { out = ((typeof flightPhasesData !== 'undefined' ? flightPhasesData : []) || []).map(p => String((p && p.phase) || '').trim()).filter(Boolean); } catch (_) { out = []; }
        return out.filter(x => !/^all phases$/i.test(x));
    }
    function rowsOf(scope, systemId) {
        try {
            if (scope === 'ac') return (typeof acFhaData !== 'undefined' ? acFhaData : []) || [];
            const sy = ((typeof systemsData !== 'undefined' ? systemsData : []) || []).find(x => x && String(x.id) === String(systemId));
            return (sy && sy.fha) || [];
        } catch (_) { return []; }
    }
    // a failure condition's id: the condition it classifies, else its FC id, else its wording under its function
    const condOf = r => { if (!r) return ''; const c = String(r.sourceCondId || r.srcCondId || r.fcId || '').trim(); return c || ('fc:' + String(r.subId || '') + ':' + String(r.fcDesc || '').replace(/\s+/g, ' ').trim().toLowerCase()); };
    const phasesOf = r => String((r && r.phases) || '').split(',').map(x => x.trim()).filter(Boolean);
    // the phases marked "Does not apply" for a condition, on any of its rows
    function naOf(rows, cond) { const out = []; (rows || []).forEach(r => { if (r && condOf(r) === cond && Array.isArray(r.phaseNA)) r.phaseNA.forEach(x => { if (x && x.phase && !out.some(y => keyP(y.phase) === keyP(x.phase))) out.push(x); }); }); return out; }
    const naPhases = (rows, cond) => naOf(rows, cond).map(x => x.phase);

    /* every condition with the phases it leaves unassessed: [{cond, fcId, desc, subId, headId, missing, na}] (only
       those with something missing). A project with no mission profile has nothing to check against. */
    function gaps(rows) {
        const prof = profile(); if (!prof.length) return [];
        const by = new Map();
        (rows || []).forEach(r => { if (!r || r.obsolete) return; const c = condOf(r); if (!by.has(c)) by.set(c, []); by.get(c).push(r); });
        const out = [];
        for (const [cond, rs] of by) {
            const cov = new Set();
            rs.forEach(r => phasesOf(r).forEach(p => { if (/^all phases$/i.test(p)) prof.forEach(q => cov.add(keyP(q))); else cov.add(keyP(p)); }));
            const na = naOf(rs, cond); na.forEach(x => cov.add(keyP(x.phase)));
            const missing = prof.filter(q => !cov.has(keyP(q)));
            if (missing.length) out.push({ cond, fcId: String(rs[0].fcId || rs[0].sourceCondId || ''), desc: String(rs[0].fcDesc || ''), subId: String(rs[0].subId || ''), headId: rs[0].internalId, missing, na });
        }
        return out;
    }
    // per render: the gaps by the id of each condition's first row (the Phases cell reads it)
    const memo = new WeakMap();
    function index(rows) {
        const sig = (rows || []).map(r => r ? (r.internalId + '|' + condOf(r) + '|' + (r.phases || '') + '|' + (Array.isArray(r.phaseNA) ? r.phaseNA.map(x => x.phase).join('/') : '') + (r.obsolete ? '|o' : '')) : '').join('\n') + '\n' + profile().join('|');
        const m = memo.get(rows); if (m && m.sig === sig) return m.idx;
        const idx = new Map(); gaps(rows).forEach(g => idx.set(String(g.headId), g));
        if (rows && typeof rows === 'object') memo.set(rows, { sig, idx });
        return idx;
    }
    // what the Comments cell of a condition's first row opens with: what is not assessed, and what does not apply
    function cellNote(row, rows) {
        if (!row) return '';
        let out = '';
        const na = Array.isArray(row.phaseNA) ? row.phaseNA.filter(x => x && x.phase) : [];
        if (na.length) out += '<div class="fha-phase-na" style="font-size:11px;margin:0 0 4px 0;">Phases that do not apply: ' + na.map(x => '<span title="' + esc(x.reason + (x.by ? ' (' + x.by + ')' : '')) + '">' + esc(x.phase) + '</span>').join(', ') + '</div>';
        const g = index(rows).get(String(row.internalId));
        if (g) out += '<div class="fha-phase-gap" data-fha-phase-gap="' + esc(g.cond) + '" style="font-size:11px;margin:0 0 4px 0;color:var(--color-danger,#b42318);font-weight:600;">Phases not assessed for this condition: ' + esc(g.missing.join(', ')) + '</div>';
        return out;
    }

    // ---- the bar over the table ----
    function bar(scope, systemId, tbodyId) {
        try {
            const tb = document.getElementById(tbodyId); const table = tb && tb.closest('table'); if (!table) return;
            const id = 'fha-phase-bar-' + (scope === 'ac' ? 'ac' : 'sys');
            let el = document.getElementById(id);
            const g = gaps(rowsOf(scope, systemId));
            if (!g.length) { if (el) el.remove(); return; }
            if (!el) { el = document.createElement('div'); el.id = id; el.className = 'fha-phase-bar'; el.style.cssText = 'margin:6px 0;padding:8px 10px;border:1px solid var(--color-danger,#b42318);border-radius:8px;font-size:12.5px;'; table.parentNode.insertBefore(el, table); }
            el.setAttribute('data-scope', scope); el.setAttribute('data-system', systemId == null ? '' : String(systemId));
            const n = g.reduce((k, x) => k + x.missing.length, 0), open = el.querySelector('details') && el.querySelector('details').open;
            el.innerHTML = '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;"><strong style="color:var(--color-danger,#b42318);">' + g.length + ' failure condition' + (g.length === 1 ? ' leaves' : 's leave') + ' flight phases unassessed (' + n + ' in all).</strong>'
                + '<span>Every condition applies to every phase: each phase goes on a row, or is marked Does not apply with the reason.</span>'
                + '<button type="button" class="btn-ghost" style="font-size:12px;padding:3px 10px;border-color:#6B4FD8;color:#4B33B0;" onclick="SLPhaseCover.draft(this.closest(\'.fha-phase-bar\').dataset.scope, this.closest(\'.fha-phase-bar\').dataset.system, null)">✨ Draft every missing phase with ANEM</button></div>'
                + '<details' + (open || g.length <= 5 ? ' open' : '') + ' style="margin-top:6px;"><summary>The conditions</summary>' + g.map(x => '<div class="fha-phase-gaprow" data-cond="' + esc(x.cond) + '" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:4px 0;">'
                    + '<span><strong>' + esc(x.fcId || x.cond) + '</strong> ' + esc(x.desc.slice(0, 90)) + ': not assessed in <strong>' + esc(x.missing.join(', ')) + '</strong></span>'
                    + '<button type="button" class="btn-ghost" style="font-size:11px;padding:2px 9px;border-color:#6B4FD8;color:#4B33B0;" onclick="SLPhaseCover.draft(this.closest(\'.fha-phase-bar\').dataset.scope, this.closest(\'.fha-phase-bar\').dataset.system, [this.closest(\'.fha-phase-gaprow\').dataset.cond])">✨ Draft the missing phases</button>'
                    + '<button type="button" class="btn-ghost" style="font-size:11px;padding:2px 9px;" onclick="SLPhaseCover.askNA(this.closest(\'.fha-phase-bar\').dataset.scope, this.closest(\'.fha-phase-bar\').dataset.system, this.closest(\'.fha-phase-gaprow\').dataset.cond)">Does not apply…</button></div>').join('') + '</details>';
        } catch (_) {}
    }

    // ---- ANEM: draft only the missing phases, the rows already there kept ----
    async function draft(scope, systemId, conds) {
        const all = gaps(rowsOf(scope, systemId)), pick = conds ? all.filter(g => conds.indexOf(g.cond) >= 0) : all;
        if (!pick.length) { if (typeof showToast === 'function') showToast('Every phase is accounted for.', 'info'); return; }
        // ANEM drafts what the FCIM identifies: a condition with no FCIM id cannot be sent (its rows were written by hand)
        const fcim = pick.filter(g => !/^fc:/.test(g.cond)), hand = pick.length - fcim.length;
        if (!fcim.length) { if (typeof showToast === 'function') showToast('These rows have no FCIM condition for ANEM to draft from. Add the missing phases by hand, or mark them Does not apply.', 'warning', 7000); return; }
        try { if (typeof window.slLoadAI === 'function') await window.slLoadAI(); } catch (_) {}
        if (!(window.SafetyLabAI && typeof window.SafetyLabAI.populateFha === 'function')) { if (typeof showToast === 'function') showToast('ANEM is not available here.', 'warning'); return; }
        const only = {}; fcim.forEach(g => { only[g.cond] = g.missing.slice(); });
        if (hand && typeof showToast === 'function') showToast(hand + ' condition' + (hand === 1 ? ' has' : 's have') + ' no FCIM id and stay' + (hand === 1 ? 's' : '') + ' for you to fill by hand.', 'info', 6000);
        const o = { condIds: Object.keys(only), onlyPhases: only };
        if (scope !== 'ac') { o.systemId = systemId; const sy = ((typeof systemsData !== 'undefined' ? systemsData : []) || []).find(x => x && String(x.id) === String(systemId)); o.systemName = sy ? (sy.name || sy.id) : systemId; }
        return window.SafetyLabAI.populateFha(o);
    }

    // ---- Does not apply: the phases picked, with the reason, kept on the condition's first row ----
    function markNA(scope, systemId, cond, phases, reason, by) {
        const why = String(reason || '').replace(/\s+/g, ' ').trim();
        if (!why) throw new Error('Say why the phase does not apply.');
        const rows = rowsOf(scope, systemId), head = rows.find(r => r && !r.obsolete && condOf(r) === cond);
        if (!head) throw new Error('That failure condition is not in the table.');
        const prof = profile(), keep = (phases || []).map(p => prof.find(q => keyP(q) === keyP(p))).filter(Boolean);
        if (!keep.length) throw new Error('Pick at least one phase.');
        head.phaseNA = Array.isArray(head.phaseNA) ? head.phaseNA.filter(x => !keep.some(p => keyP(p) === keyP(x.phase))) : [];
        keep.forEach(p => head.phaseNA.push({ phase: p, reason: why, by: String(by || '').trim(), at: now() }));
        save(scope);
        return keep;
    }
    function clearNA(scope, systemId, cond, phase) {
        const rows = rowsOf(scope, systemId); let hit = 0;
        rows.forEach(r => { if (r && condOf(r) === cond && Array.isArray(r.phaseNA)) { const n = r.phaseNA.length; r.phaseNA = r.phaseNA.filter(x => keyP(x.phase) !== keyP(phase)); hit += n - r.phaseNA.length; if (!r.phaseNA.length) delete r.phaseNA; } });
        if (hit) save(scope);
        return hit;
    }
    function save(scope) {
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        try { if (scope === 'ac') { if (typeof renderACFHA === 'function') renderACFHA(); } else if (typeof renderSysFHA === 'function') renderSysFHA(); } catch (_) {}
    }
    const who = () => { try { const u = (typeof _supabaseSession !== 'undefined' && _supabaseSession && _supabaseSession.user) || null; const m = (u && u.user_metadata) || {}; return m.full_name || m.name || (u && u.email) || ''; } catch (_) { return ''; } };
    // the form: which of the missing phases, and why
    function askNA(scope, systemId, cond) {
        const g = gaps(rowsOf(scope, systemId)).find(x => x.cond === cond); if (!g) return;
        const ov = document.createElement('div');
        ov.className = 'fha-na-modal'; ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:100000;display:flex;align-items:center;justify-content:center;';
        ov.innerHTML = '<div role="dialog" aria-modal="true" style="background:var(--color-surface,#fff);color:var(--color-text,#111);border-radius:12px;padding:18px 20px;width:min(520px,92vw);box-shadow:0 10px 40px rgba(0,0,0,.25);">'
            + '<h3 style="margin:0 0 6px;font-size:16px;">' + esc(g.fcId || g.cond) + ': phases that do not apply</h3>'
            + '<div style="font-size:12.5px;margin-bottom:10px;">' + esc(g.desc) + '</div>'
            + '<div style="display:flex;flex-wrap:wrap;gap:6px 14px;margin-bottom:10px;">' + g.missing.map(p => '<label style="font-size:13px;"><input type="checkbox" data-na-phase="' + esc(p) + '"> ' + esc(p) + '</label>').join('') + '</div>'
            + '<label style="display:block;font-size:12.5px;font-weight:600;margin-bottom:4px;">Why it does not apply</label><textarea data-na-why rows="3" style="width:100%;box-sizing:border-box;font:inherit;padding:6px;border:1px solid var(--color-border,#ccc);border-radius:6px;" placeholder="For example: the function only operates on the ground; in Cruise its loss has no effect because..."></textarea>'
            + '<div data-na-err style="color:var(--color-danger,#b42318);font-size:12px;min-height:16px;margin-top:4px;"></div>'
            + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;"><button type="button" class="btn-ghost" data-na-cancel>Cancel</button><button type="button" class="btn-cyan" data-na-ok>Mark does not apply</button></div></div>';
        document.body.appendChild(ov);
        const close = () => ov.remove();
        ov.querySelector('[data-na-cancel]').onclick = close;
        ov.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
        ov.querySelector('[data-na-ok]').onclick = () => {
            const ph = [...ov.querySelectorAll('[data-na-phase]:checked')].map(x => x.getAttribute('data-na-phase'));
            try { const k = markNA(scope, systemId, cond, ph, ov.querySelector('[data-na-why]').value, who()); close(); if (typeof showToast === 'function') showToast('Marked does not apply for ' + (g.fcId || cond) + ': ' + k.join(', ') + '.', 'success'); }
            catch (e) { ov.querySelector('[data-na-err]').textContent = e.message; }
        };
        setTimeout(() => { const f = ov.querySelector('[data-na-phase]'); if (f) f.focus(); }, 0);
    }

    window.SLPhaseCover = { profile, rowsOf, condOf, naOf, naPhases, gaps, index, cellNote, bar, draft, markNA, clearNA, askNA };
})();
