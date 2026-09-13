// 13 Sep 2026 (R19 step 3): native alert/confirm/prompt replaced by the app's own dialogs (slAlert/slConfirm/slPrompt) and typed toasts; see tests/regression_native_dialogs.test.js
// ============================================================================
// fracas_slas.js — v0.1 — FRACAS-3: timeliness SLAs, safety-relevance triage,
// KPI trending — the PROCESS layer over the FRACAS-2 case manager.
//
// FRACAS-2 (fracas_ledger.js) gave every failure a case: mode, severity, RCA,
// corrective action, verified-effectiveness closure. What it could not say is
// whether the PROCESS is healthy: are incidents triaged promptly, is the
// safety question asked of every one, are closures on pace, is the trend
// getting better or worse. This module answers those three questions:
//
//   · TIMELINESS SLAs — a severity-tiered policy (triage days + closure days
//     per severity) stored at projectConfig.ram.slaPolicy. The house starting
//     values ship clearly LABELED as house defaults — a program ADOPTS or
//     edits them; the panel shows whose policy is in force. Clocks are
//     computed per incident (age, triage verdict, closure verdict, missed
//     target date) — exceptions surface, the compliant majority stays quiet.
//   · SAFETY-RELEVANCE TRIAGE — every incident gets asked ONCE, explicitly:
//     is this safety-relevant? 'Yes' wants the FC it touches (or a problem-
//     report seed — offered copy-ready, never auto-raised). 'No' is a safety
//     DECISION and demands a rationale (≥10 chars) and a name. Untriaged
//     past the SLA is an exception, loudly.
//   · KPI TRENDING — monthly buckets, computed never stored: opened, closed,
//     open-at-end, mean-days-to-close, %-triaged, overdue-at-end, repeat-mode
//     count. Rendered as a trend table with inline bars.
//   · INV-41 (advisory) — the process invariant: no incident untriaged past
//     the SLA; no safety-relevant incident left unlinked (no FC, no PR); no
//     closure clock silently overdue.
//
// All writes through the author adapter here (triage, policy); incident data
// itself stays owned by FRACAS-2. Deterministic core: every clock function
// takes an explicit `today` — Date.now() appears only at the UI edge.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const DAY = 86400000;

    function _ram() { return (typeof projectConfig !== 'undefined' && projectConfig && projectConfig.ram) ? projectConfig.ram : null; }
    const _save = () => { try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); else if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} };
    const _toast = (m, k) => { try { if (typeof showToast === 'function') showToast(m, k || 'info', 5200); } catch (_) {} };

    // ---- policy -------------------------------------------------------------
    // Severity-tiered closure + one triage clock. House defaults are a
    // STARTING POSITION, labeled as such until the program adopts them.
    const HOUSE_DEFAULTS = { triageDays: 3, closeDays: { Critical: 30, High: 60, Medium: 90, Low: 180 }, adoptedBy: null, adoptedAt: null };
    function slaPolicy() {
        const r = _ram();
        const p = (r && r.slaPolicy) ? r.slaPolicy : null;
        if (!p) return Object.assign({ house: true }, JSON.parse(JSON.stringify(HOUSE_DEFAULTS)));
        return Object.assign({ house: !p.adoptedBy }, JSON.parse(JSON.stringify(HOUSE_DEFAULTS)), JSON.parse(JSON.stringify(p)));
    }
    function setSlaPolicy(patch, by) {
        const r = _ram();
        if (!r) { _toast('No R&M store yet — the SLA policy lives on the program.', 'error'); return false; }
        if (!(by || '').trim()) { _toast('Adopting or editing the SLA policy needs a name — a process owner, not a ghost.', 'error'); return false; }
        const cur = r.slaPolicy || JSON.parse(JSON.stringify(HOUSE_DEFAULTS));
        if (patch && patch.triageDays != null) {
            const v = +patch.triageDays;
            if (!(v >= 1 && v <= 60)) { _toast('Triage SLA must be 1–60 days.', 'error'); return false; }
            cur.triageDays = v;
        }
        if (patch && patch.closeDays) {
            for (const sev of ['Critical', 'High', 'Medium', 'Low']) {
                if (patch.closeDays[sev] != null) {
                    const v = +patch.closeDays[sev];
                    if (!(v >= 1 && v <= 730)) { _toast('Closure SLA (' + sev + ') must be 1–730 days.', 'error'); return false; }
                    (cur.closeDays = cur.closeDays || {})[sev] = v;
                }
            }
        }
        cur.adoptedBy = String(by).trim();
        cur.adoptedAt = (patch && patch.at) || new Date().toISOString().slice(0, 10);
        r.slaPolicy = cur;
        _save();
        return true;
    }

    // ---- clocks (deterministic — explicit today) ---------------------------
    const _days = (a, b) => Math.floor((Date.parse(b) - Date.parse(a)) / DAY);
    function slaFor(inc, today, policy) {
        const p = policy || slaPolicy();
        const age = _days(inc.date, today);
        const closed = inc.status === 'closed';
        const closeAt = closed ? (inc.verifiedAt || today) : today;
        const cycleDays = _days(inc.date, closeAt);
        const limit = (p.closeDays && p.closeDays[inc.severity]) || 90;
        const triaged = !!(inc.triage && inc.triage.by);
        const out = {
            ageDays: age, cycleDays: cycleDays, closed: closed, limitDays: limit,
            triage: triaged ? 'triaged' : (age > p.triageDays ? 'OVERDUE' : 'due'),
            closure: closed ? (cycleDays <= limit ? 'closed-on-time' : 'closed-late')
                            : (age > limit ? 'OVERDUE' : (age > limit * 0.8 ? 'due-soon' : 'on-time')),
            targetMissed: !!(inc.targetDate && !closed && today > inc.targetDate),
        };
        out.exception = out.triage === 'OVERDUE' || out.closure === 'OVERDUE' || out.closure === 'closed-late' || out.targetMissed;
        return out;
    }

    // ---- triage (author adapter) -------------------------------------------
    function setTriage(recId, incId, t) {
        const r = _ram();
        const f = r && (r.field || []).find(x => x && x.id === recId);
        const inc = f && (f.incidents || []).find(x => x.id === incId);
        if (!inc) { _toast('fracas: incident not found', 'error'); return false; }
        t = t || {};
        if (typeof t.relevant !== 'boolean') { _toast('Triage answers the question: safety-relevant, yes or no.', 'error'); return false; }
        if (!(t.by || '').trim()) { _toast('Triage needs a name — it is a safety decision, not a checkbox.', 'error'); return false; }
        if (t.relevant === false && String(t.rationale || '').trim().length < 10) {
            _toast('NOT safety-relevant is a safety DECISION — it demands a rationale (≥10 chars). "Obviously not" is not a rationale.', 'error');
            return false;
        }
        inc.triage = { relevant: t.relevant, rationale: String(t.rationale || '').trim() || null,
                       linkedFcId: String(t.linkedFcId || '').trim() || null,
                       by: String(t.by).trim(), at: t.at || new Date().toISOString().slice(0, 10) };
        _save();
        return true;
    }
    function clearTriage(recId, incId) {
        const r = _ram();
        const f = r && (r.field || []).find(x => x && x.id === recId);
        const inc = f && (f.incidents || []).find(x => x.id === incId);
        if (!inc || !inc.triage) return false;
        delete inc.triage;
        _save();
        return true;
    }
    // Copy-ready problem-report seed — seeded by a human, never auto-raised.
    function prSeed(rec, inc) {
        return {
            title: 'FRACAS ' + inc.id + ' — ' + inc.mode + ' on ' + (rec.name || rec.itemId || rec.id),
            safetyRelated: true,
            source: 'FRACAS incident ' + inc.id + ' (' + inc.date + ')',
            linked: (inc.triage && inc.triage.linkedFcId) || '',
            note: 'Seed from the FRACAS triage lane — raise it in the Problem Reports register; nothing is auto-written.',
        };
    }

    // ---- iterate all incidents ---------------------------------------------
    function _allIncidents() {
        const r = _ram();
        const out = [];
        ((r && r.field) || []).forEach(f => (f.incidents || []).forEach(i => out.push({ rec: f, inc: i })));
        return out;
    }

    // ---- KPI trending (computed, never stored) ------------------------------
    function trend(today, monthsBack) {
        const N = monthsBack || 6;
        const p = slaPolicy();
        const all = _allIncidents();
        const ym = d => String(d).slice(0, 7);
        const months = [];
        const t = new Date(Date.parse(String(today).slice(0, 10) + 'T00:00:00Z'));
        for (let k = N - 1; k >= 0; k--) {
            const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - k, 1));
            months.push(d.toISOString().slice(0, 7));
        }
        return months.map(m => {
            const monthEnd = m + '-28';   // clock reference inside the month, deterministic
            const opened = all.filter(x => ym(x.inc.date) === m);
            const closed = all.filter(x => x.inc.status === 'closed' && x.inc.verifiedAt && ym(x.inc.verifiedAt) === m);
            const openAtEnd = all.filter(x => x.inc.date <= monthEnd && !(x.inc.status === 'closed' && x.inc.verifiedAt && x.inc.verifiedAt <= monthEnd));
            const overdue = openAtEnd.filter(x => slaFor(x.inc, monthEnd, p).closure === 'OVERDUE');
            const mttc = closed.length ? closed.reduce((a, x) => a + _days(x.inc.date, x.inc.verifiedAt), 0) / closed.length : null;
            const cohort = all.filter(x => x.inc.date <= monthEnd);
            const triaged = cohort.filter(x => x.inc.triage && x.inc.triage.by);
            const modes = {};
            cohort.forEach(x => { const k2 = (x.rec.id || '') + '§' + x.inc.mode; modes[k2] = (modes[k2] || 0) + 1; });
            const repeats = Object.values(modes).filter(n => n >= 2).length;
            return { month: m, opened: opened.length, closed: closed.length, openAtEnd: openAtEnd.length,
                     overdueAtEnd: overdue.length, mttcDays: mttc == null ? null : Math.round(mttc),
                     triagedPct: cohort.length ? Math.round(100 * triaged.length / cohort.length) : null,
                     repeatModes: repeats };
        });
    }

    // ---- INV-41 (advisory) --------------------------------------------------
    if (typeof invRegister === 'function') {
        invRegister({ id: 'INV-41', sev: 'advisory',
            name: 'FRACAS process discipline — triage on the clock, safety-relevant incidents linked, closure SLAs named when overdue',
            run: function () {
                try {
                    const all = _allIncidents();
                    if (!all.length) return { checked: 0, fails: [] };
                    const today = new Date().toISOString().slice(0, 10);
                    const p = slaPolicy();
                    const fails = [];
                    all.forEach(x => {
                        const v = slaFor(x.inc, today, p);
                        if (v.triage === 'OVERDUE')
                            fails.push(x.inc.id + ' (' + (x.rec.name || x.rec.id) + '): UNTRIAGED ' + v.ageDays + ' days — the safety question has not been asked (SLA ' + p.triageDays + 'd)');
                        if (x.inc.triage && x.inc.triage.relevant === true && !x.inc.triage.linkedFcId)
                            fails.push(x.inc.id + ': safety-RELEVANT but linked to no failure condition and no problem report — the finding is floating');
                        if (v.closure === 'OVERDUE')
                            fails.push(x.inc.id + ' (' + x.inc.severity + '): open ' + v.ageDays + 'd against a ' + v.limitDays + 'd closure SLA');
                    });
                    return { checked: all.length, fails: fails };
                } catch (_) { return { checked: 0, fails: [] }; }
            } });
    }

    // ---- panel (exception report + trend + policy) --------------------------
    const _bar = (v, max) => { const n = max > 0 ? Math.round(6 * v / max) : 0; return '▁▂▃▄▅▆▇'.slice(n, n + 1) || '▁'; };
    function renderSlaPanel() {
        if (typeof document === 'undefined') return;
        const host = document.getElementById('ram-rel-host');
        if (!host) return;
        let card = document.getElementById('fracas-sla-card');
        const r = _ram();
        const all = _allIncidents();
        if (!r || !all.length) { if (card) card.remove(); return; }
        if (!card) { card = document.createElement('div'); card.id = 'fracas-sla-card'; host.appendChild(card); }
        const today = new Date().toISOString().slice(0, 10);
        const p = slaPolicy();
        const rows = all.map(x => ({ x, v: slaFor(x.inc, today, p) }));
        const exceptions = rows.filter(y => y.v.exception || (!y.x.inc.triage && y.v.triage !== 'triaged'));
        const tr = trend(today, 6);
        const maxOpen = Math.max(1, ...tr.map(m => m.openAtEnd));
        card.innerHTML =
            '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-top:14px;">' +
            '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary); display:flex; justify-content:space-between; gap:10px; align-items:center;">' +
            '<b>FRACAS timeliness &amp; triage — the process layer</b>' +
            '<span class="u-mono" style="font-size:10px; color:' + (p.house ? '#B7791F' : 'var(--color-text-tertiary)') + ';">' +
            (p.house ? 'HOUSE-DEFAULT SLAs — adopt them below to make them yours' : 'policy adopted by ' + _esc(p.adoptedBy) + ' · ' + _esc(p.adoptedAt)) + '</span></div>' +
            '<div style="padding:10px 14px;">' +
            '<div style="font-size:11px; color:var(--color-text-secondary); margin-bottom:8px;">Triage SLA ' + p.triageDays + 'd · closure SLAs (days): ' +
            ['Critical', 'High', 'Medium', 'Low'].map(s => s + ' ' + p.closeDays[s]).join(' · ') + '</div>' +
            (exceptions.length
                ? '<table class="data-table" style="width:100%; font-size:11px;"><thead><tr><th>Incident</th><th>Record</th><th>Sev</th><th>Age</th><th>Triage</th><th>Closure</th><th>Target</th><th>Safety triage</th></tr></thead><tbody>' +
                  exceptions.map(y => '<tr>' +
                    '<td class="u-mono">' + _esc(y.x.inc.id) + '</td><td>' + _esc(y.x.rec.name || y.x.rec.id) + '</td>' +
                    '<td>' + _esc(y.x.inc.severity) + '</td><td class="u-mono">' + y.v.ageDays + 'd</td>' +
                    '<td>' + (y.v.triage === 'OVERDUE' ? '<b style="color:#B91C1C;">UNTRIAGED (SLA blown)</b>' : _esc(y.v.triage)) + '</td>' +
                    '<td>' + (/OVERDUE|late/.test(y.v.closure) ? '<b style="color:#B91C1C;">' + _esc(y.v.closure) + '</b>' : _esc(y.v.closure)) + '</td>' +
                    '<td>' + (y.v.targetMissed ? '<b style="color:#B7791F;">missed</b>' : '—') + '</td>' +
                    '<td>' + (y.x.inc.triage
                        ? (y.x.inc.triage.relevant ? '<span style="color:#B91C1C; font-weight:700;">SAFETY-RELEVANT</span>' + (y.x.inc.triage.linkedFcId ? ' → ' + _esc(y.x.inc.triage.linkedFcId) : ' <b style="color:#B7791F;">(unlinked!)</b>') : 'not relevant — ' + _esc((y.x.inc.triage.rationale || '').slice(0, 40)))
                        : '<button class="ckpt-m-btn" style="font-size:10px;" onclick="FRACAS_SLA.uiTriage(\'' + _esc(y.x.rec.id) + '\',\'' + _esc(y.x.inc.id) + '\')">triage…</button>') + '</td></tr>').join('') +
                  '</tbody></table>'
                : '<div style="font-size:11.5px; color:#1D6E3E;">✓ No exceptions — every incident triaged on the clock, every closure inside its SLA.</div>') +
            '<table class="data-table" style="width:100%; font-size:10.5px; margin-top:10px;"><thead><tr><th>Month</th><th>Opened</th><th>Closed</th><th>Open @ end</th><th>Overdue</th><th>MTTC (d)</th><th>Triaged %</th><th>Repeat modes</th></tr></thead><tbody>' +
            tr.map(m => '<tr><td class="u-mono">' + m.month + '</td><td>' + m.opened + '</td><td>' + m.closed + '</td>' +
                '<td class="u-mono">' + _bar(m.openAtEnd, maxOpen) + ' ' + m.openAtEnd + '</td>' +
                '<td>' + (m.overdueAtEnd ? '<b style="color:#B91C1C;">' + m.overdueAtEnd + '</b>' : '0') + '</td>' +
                '<td>' + (m.mttcDays == null ? '—' : m.mttcDays) + '</td><td>' + (m.triagedPct == null ? '—' : m.triagedPct + '%') + '</td>' +
                '<td>' + (m.repeatModes ? '<b style="color:#B7791F;">' + m.repeatModes + '</b>' : '0') + '</td></tr>').join('') + '</tbody></table>' +
            '<div style="display:flex; gap:8px; align-items:center; margin-top:10px; font-size:11px; flex-wrap:wrap;">' +
            '<span style="color:var(--color-text-tertiary);">SLA policy:</span>' +
            'triage <input id="fsla-t" type="number" min="1" max="60" value="' + p.triageDays + '" style="width:52px;">d' +
            ['Critical', 'High', 'Medium', 'Low'].map(s => ' · ' + s + ' <input id="fsla-' + s + '" type="number" min="1" max="730" value="' + p.closeDays[s] + '" style="width:58px;">d').join('') +
            ' <input id="fsla-by" placeholder="adopted by (name)" style="width:150px;">' +
            ' <button class="ckpt-m-btn" style="font-size:10.5px;" onclick="FRACAS_SLA.uiAdopt()">adopt / update policy</button></div>' +
            '<div style="font-size:10px; color:var(--color-text-tertiary); margin-top:6px;">Exceptions only — the compliant majority stays quiet. KPIs are computed from the ledger, never stored. The Thread Integrity sweep watches the same three disciplines (overdue triage, overdue closure, repeat modes).</div>' +
            '</div></div>';
    }

    // ---- UI edge ------------------------------------------------------------
    async function uiTriage(recId, incId) {
        const rel = await slConfirm('Safety triage for ' + incId + ':\n\nOK = SAFETY-RELEVANT (you will be asked for the FC id)\nCancel = not safety-relevant (you will be asked for the rationale)', { title: 'Safety triage' });
        const by = await slPrompt('Triage signature (name):', '');
        if (!by || !by.trim()) return;
        if (rel) {
            const fc = (await slPrompt('Failure-condition id this incident touches (e.g. FC-012). Leave empty to link later (it will flag as unlinked):', '')) || '';
            if (setTriage(recId, incId, { relevant: true, linkedFcId: fc, by: by })) renderSlaPanel();
        } else {
            const why = (await slPrompt('Rationale: WHY is this not safety-relevant? (≥10 chars, this is a safety decision):', '')) || '';
            if (setTriage(recId, incId, { relevant: false, rationale: why, by: by })) renderSlaPanel();
        }
    }
    function uiAdopt() {
        const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
        const ok = setSlaPolicy({ triageDays: g('fsla-t'),
            closeDays: { Critical: g('fsla-Critical'), High: g('fsla-High'), Medium: g('fsla-Medium'), Low: g('fsla-Low') } }, g('fsla-by'));
        if (ok) { _toast('SLA policy adopted — the clocks now run against your numbers.', 'success'); renderSlaPanel(); }
    }

    // ---- wrap the FRACAS-2 render so the panel rides every refresh ----------
    (function wrapRender() {
        if (typeof window === 'undefined') return;
        const tryWrap = function () {
            if (!window.FRACAS_LEDGER || typeof window.FRACAS_LEDGER.renderLedger !== 'function' || window.FRACAS_LEDGER.renderLedger._slaWrapped) return false;
            const orig = window.FRACAS_LEDGER.renderLedger;
            const wrapped = function () { const r = orig.apply(this, arguments); try { renderSlaPanel(); } catch (_) {} return r; };
            wrapped._slaWrapped = true;
            window.FRACAS_LEDGER.renderLedger = wrapped;
            return true;
        };
        if (!tryWrap()) { let n = 0; const iv = setInterval(function () { if (tryWrap() || ++n >= 40) clearInterval(iv); }, 250); }
    })();

    const API = { HOUSE_DEFAULTS, slaPolicy, setSlaPolicy, slaFor, setTriage, clearTriage, prSeed, trend, renderSlaPanel, uiTriage, uiAdopt };
    if (typeof window !== 'undefined') window.FRACAS_SLA = API;
    if (typeof module !== 'undefined') module.exports = API;
})();
