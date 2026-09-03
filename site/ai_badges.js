// ============================================================================
// ai_badges.js — v1.0 — Backlog #1: AI confidence tied to fidelity, VISIBLE.
//
// Surfaces what the deterministic layer already knows about every AI-drafted
// artifact as a green/amber/red pill with a "why" tooltip. The pill is pure
// SURFACING — the AI never grades itself; every input to the verdict is a
// fact the core recorded (provenance markers on rows, the E2 draft state
// machine, review approvals, input modality, context manifests).
//
//   INPUT FIDELITY (graded at read time, deterministically):
//     L2 — grounded: drafted from the live project model / closed-world
//          extract, text modality.
//     L1 — partial: image/diagram input (verify-to-accept), conversational
//          chat edit, truncated/omitted context, or overridden checker flags.
//     L0 — ungrounded: no provenance recorded (legacy AI rows).
//
//   CONFIDENCE TIER (color):
//     green — human-reviewed (engineer-edited or reviewer-approved) AND L2.
//     amber — human-reviewed but L1/L0 sourcing, or accepted with a signed
//             checker-flag override.
//     red   — unreviewed AI output, or unresolved checker flags. (The same
//             condition that already blocks the E2 hand-off gate.)
//   Manual rows show nothing — the pill marks AI provenance only.
//
// BORN MODULAR: new file, zero edits to render functions. Live tables are
// decorated by a MutationObserver keyed on the known worksheet tbody ids;
// rows are matched by data-iid (CRUD tables) or the kebab menu's
// openBackrefPanel payload (FHA/FMEA tables) — never by fragile index math.
// A row that cannot be matched is simply not badged (fail-safe: no badge is
// always preferred over a wrong badge).
//
// Consumers (all guarded, all optional):
//   reports.js         — AiBadges.reportLabel(row, kind, sysId) → Origin col
//   evidence_package   — AiBadges.draftConfidence(rec) → Confidence column
//   anywhere           — AiBadges.pillHtml(AiBadges.confidence(row, opts))
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    function _g(name) { try { return (typeof window !== 'undefined' && window[name]) || undefined; } catch (_) { return undefined; } }

    // ------------------------------------------------------------ the engine
    // Features whose prompts are built from the live project model (the
    // closed-world extract) — grounded by construction.
    // hfa.draft qualifies twice over: its prompt is built from the live project
    // model like the rest, AND its candidate set is chosen by a deterministic
    // sweep rather than by the model, so it cannot draft about a failure
    // condition nobody has.
    const GROUNDED_FEATURES = /^(fha\.populate|sfha\.populate|fcim\.populate|fmea\.|cma\.draft|pra\.draft|zsa\.draft|resources\.draft|req\.recommend|fta\.synthesize|arch\.decompose|ccf\.propose|hfa\.draft)/;

    function _isAi(row) { return !!(row && (row.aiGenerated || row.aiModel)); }

    function _reviewState(row, kind, systemId, explicitId) {
        // slHumanEdited, not row.aiEdited — an AI chat edit is not human review.
        const _he = (typeof window !== 'undefined' && window.slHumanEdited) || function (r) { if (!r) return false; if (r.humanEdited === true) return true; if (r.aiChatEdited === true) return false; if (r.aiEdited === true) return !r.aiEditModel && !r.aiEditedAt; return false; };
        if (_he(row)) return { reviewed: true, how: 'engineer-edited', by: '' };
        try {
            const Review = _g('Review');
            const rid = explicitId != null ? explicitId : row.internalId;
            if (kind && rid != null && Review && typeof Review.isApproved === 'function') {
                if (Review.isApproved({ kind, id: rid, systemId: systemId || null })) {
                    const rec = Review.getApproval({ kind, id: rid, systemId: systemId || null });
                    return { reviewed: true, how: 'reviewer-approved', by: (rec && rec.approvedBy) || '' };
                }
            }
        } catch (_) {}
        return { reviewed: false, how: 'unreviewed', by: '' };
    }

    function _grade(row) {
        const mod = String(row.aiInputModality || '');
        const feat = String(row.aiFeature || '');
        if (/image/.test(mod)) return { grade: 'L1', why: 'drafted from a diagram/image — verify-to-accept applies' };
        if (GROUNDED_FEATURES.test(feat)) return { grade: 'L2', why: 'drafted from the live project model (closed-world extract)' };
        if (/^chat\./.test(feat)) return { grade: 'L1', why: 'conversational edit — weaker context contract than a scoped generator' };
        if (!feat && !row.aiModel) return { grade: 'L0', why: 'no provenance recorded on this AI row (legacy draft)' };
        return { grade: 'L1', why: 'partially grounded (feature: ' + (feat || 'unknown') + ')' };
    }

    // confidence(row, {kind, systemId}) → null for manual rows, else
    // { tier, grade, reviewed, label, why:[...], model, at, feature }
    function confidence(row, opts) {
        if (!_isAi(row)) return null;
        opts = opts || {};
        const rev = _reviewState(row, opts.kind, opts.systemId, opts.id);
        const g = _grade(row);
        let tier, label;
        if (!rev.reviewed) { tier = 'red'; label = 'AI · unreviewed'; }
        else if (g.grade === 'L2') { tier = 'green'; label = 'AI · verified'; }
        else { tier = 'amber'; label = 'AI · reviewed · caveat'; }
        const why = [];
        why.push('Input fidelity ' + g.grade + ' — ' + g.why);
        why.push(rev.reviewed ? ('Human verification: ' + rev.how + (rev.by ? ' by ' + rev.by : '')) : 'Awaiting human review — AI drafts are proposals until an engineer accepts or a reviewer approves');
        if (row.aiModel) why.push('Model: ' + row.aiModel);
        if (row.aiFeature) why.push('Feature: ' + row.aiFeature);
        if (row.aiAt) why.push('Drafted: ' + String(row.aiAt).slice(0, 16).replace('T', ' '));
        why.push('Confidence is computed by the deterministic core from recorded provenance — the AI never grades itself.');
        return { tier, grade: g.grade, reviewed: rev.reviewed, label, why, model: row.aiModel || '', at: row.aiAt || '', feature: row.aiFeature || '' };
    }

    // draftConfidence(rec) — report-section drafts from the E2 state machine
    // (projectConfig.aiDrafts entries; meta stamped by reports.js at draft time).
    function draftConfidence(rec) {
        if (!rec || rec.state === 'discarded') return null;
        const why = [];
        const flags = rec.flags || 0;
        let grade, gw;
        if (rec.truncated != null || rec.omitted != null) {
            if ((rec.truncated || 0) === 0 && (rec.omitted || 0) === 0) { grade = 'L2'; gw = 'complete closed-world section context (nothing truncated or omitted)'; }
            else { grade = 'L1'; gw = (rec.truncated || 0) + ' table(s) truncated, ' + (rec.omitted || 0) + ' omitted from the section context (declared in the manifest)'; }
        } else { grade = 'L1'; gw = 'context manifest not recorded for this draft (pre-badge draft)'; }
        why.push('Input fidelity ' + grade + ' — ' + gw);
        let tier, label;
        if (rec.state === 'drafted') { tier = 'red'; label = 'AI · unreviewed draft'; why.push('Awaiting engineer review — blocks the hand-off gate'); }
        else if (flags > 0 && !rec.overrideNote) { tier = 'red'; label = 'AI · flags unresolved'; why.push(flags + ' checker flag(s) without a signed override'); }
        else if (flags > 0) { tier = 'amber'; label = 'AI · accepted · override'; why.push(flags + ' checker flag(s) overridden: ' + rec.overrideNote + (rec.by ? ' — ' + rec.by : '')); }
        else if (grade !== 'L2') { tier = 'amber'; label = 'AI · accepted · caveat'; why.push('Accepted' + (rec.by ? ' by ' + rec.by : '') + ', checker clean'); }
        else { tier = 'green'; label = 'AI · verified'; why.push((rec.state === 'edited' ? 'Engineer-edited' : 'Accepted') + (rec.by ? ' by ' + rec.by : '') + ', checker clean'); }
        if (rec.model) why.push('Model: ' + rec.model);
        return { tier, grade, reviewed: rec.state !== 'drafted', label, why, model: rec.model || '', at: rec.at || '', feature: 'report.section.draft' };
    }

    // ------------------------------------------------------------- rendering
    function pillHtml(conf) {
        if (!conf) return '';
        return '<span class="ai-conf-pill ai-conf-' + conf.tier + '" title="' + _esc(conf.why.join('\n')) + '">' +
            _esc(conf.label) + ' <b>' + _esc(conf.grade) + '</b></span>';
    }

    // Plain-text form for final outputs (docx / pdf / csv-safe).
    function reportLabel(row, kind, systemId) {
        const c = confidence(row, { kind, systemId });
        if (!c) return '';
        if (c.tier === 'green') return 'AI · verified (' + c.grade + ')';
        if (c.tier === 'amber') return 'AI · reviewed (' + c.grade + ' — caveat)';
        return 'AI · UNREVIEWED (' + c.grade + ')';
    }

    function _injectCss() {
        if (document.getElementById('ai-conf-pill-css')) return;
        const st = document.createElement('style');
        st.id = 'ai-conf-pill-css';
        st.textContent =
            '.ai-conf-pill{display:inline-block;font-family:var(--font-mono,ui-monospace,monospace);font-size:9.5px;font-weight:600;letter-spacing:0.04em;padding:1px 7px;margin-right:6px;border-radius:var(--r-full,999px);white-space:nowrap;vertical-align:middle;cursor:help;box-shadow:inset 0 0 0 1.5px currentColor;background:transparent;}' +
            '.ai-conf-green{color:#1D6E3E;}' +
            '.ai-conf-amber{color:#9A6200;}' +
            '.ai-conf-red{color:#8E2A2A;}' +
            '.ai-est-pill{display:inline-block;font-family:var(--font-mono,ui-monospace,monospace);font-size:9.5px;font-weight:600;letter-spacing:0.04em;padding:1px 7px;margin-left:6px;border-radius:var(--r-full,999px);white-space:nowrap;vertical-align:middle;cursor:help;box-shadow:inset 0 0 0 1.5px currentColor;color:#9A6200;}';
        document.head.appendChild(st);
    }

    // ---------------------------------------------------- live-table wiring
    // Worksheet tbodies → row array + review kind. sys-scoped arrays resolve
    // against the open System Folder at decoration time.
    function _sysArr(k) {
        try {
            const sid = _g('activeSystemId');
            const list = _g('systemsData') || [];
            const s = list.find(x => x && String(x.id) === String(sid));
            return (s && s[k]) || [];
        } catch (_) { return []; }
    }
    const TABLES = [
        { body: 'ac-fha-body',   kind: 'acFha',   sys: false, rows: () => _g('acFhaData') || [] },
        { body: 'sys-fha-body',  kind: 'sysFha',  sys: true,  rows: () => _sysArr('fha') },
        { body: 'ac-func-body',  kind: 'acFunc',  sys: false, rows: () => _g('acFunctionsData') || [] },
        { body: 'sys-func-body', kind: 'sysFunc', sys: true,  rows: () => _sysArr('functions') },
        { body: 'ac-fcim-body',  kind: 'acFcim',  sys: false, rows: () => _g('acFcimData') || [] },
        { body: 'sys-fcim-body', kind: 'sysFcim', sys: true,  rows: () => _sysArr('fcim') },
        { body: 'ac-req-body',   kind: 'acReq',   sys: false, rows: () => _g('acReqData') || [] },
        { body: 'sys-req-body',  kind: 'sysReq',  sys: true,  rows: () => _sysArr('req') },
        { body: 'pra-body',      kind: 'pra',     sys: false, rows: () => _g('praData') || [] },
        { body: 'zsa-body',      kind: 'zsa',     sys: false, rows: () => _g('zsaData') || [] },
        { body: 'cma-body',      kind: 'cma',     sys: false, rows: () => _g('cmaData') || [] },
        { body: 'fmea-body',     kind: 'fmea',    sys: false, rows: () => _g('fmeaData') || [] },
        { body: 'routing-body',  kind: null,      sys: false, rows: () => _g('routingData') || [] },
        { body: 'resources-body',kind: null,      sys: false, rows: () => _g('resourcesData') || [] },
    ];
    const _TBODY = {};
    TABLES.forEach(t => { _TBODY[t.body] = t; });

    // Row identity: data-iid (CRUD factory rows) or the kebab's backref payload
    // (openBackrefPanel({kind:'acFha', id: '…'})) — present on every worksheet
    // row via rowActionsHTML. No match → no badge.
    const _BACKREF_RE = /openBackrefPanel\(\{kind:\s*'[^']*',\s*id:\s*(?:'([^']*)'|(\d+))/;
    function _rowIid(tr) {
        const d = tr.getAttribute && tr.getAttribute('data-iid');
        if (d != null && d !== '') return String(d);
        const m = _BACKREF_RE.exec(tr.innerHTML || '');
        if (m) return String(m[1] != null ? m[1] : m[2]);
        return null;
    }

    function _decorateTbody(tb) {
        const cfg = _TBODY[tb.id];
        if (!cfg) return;
        const rows = cfg.rows();
        if (!rows || !rows.length || !rows.some(_isAi)) return;
        const byId = new Map();
        rows.forEach(r => { if (r && r.internalId != null) byId.set(String(r.internalId), r); });
        const sysId = cfg.sys ? (_g('activeSystemId') || null) : null;
        Array.prototype.forEach.call(tb.rows || [], tr => {
            if (tr.querySelector && tr.querySelector('.ai-conf-pill')) return;   // idempotent
            const iid = _rowIid(tr);
            if (iid == null) return;
            const row = byId.get(iid);
            if (!row || !_isAi(row)) return;
            const conf = confidence(row, { kind: cfg.kind, systemId: sysId });
            if (!conf) return;
            // Anchor: the first cell after the actions cell that carries a
            // <strong> (the artifact's ID cell in every worksheet), else td[1].
            let cell = null;
            for (let i = 1; i < tr.cells.length; i++) { if (tr.cells[i].querySelector('strong')) { cell = tr.cells[i]; break; } }
            if (!cell) cell = tr.cells[1] || tr.cells[0];
            if (!cell) return;
            cell.insertAdjacentHTML('afterbegin', pillHtml(conf));
        });
    }

    let _pending = null;
    function _scheduleDecorate(ids) {
        if (_pending) { ids.forEach(i => _pending.add(i)); return; }
        _pending = new Set(ids);
        const run = () => {
            const todo = _pending; _pending = null;
            todo.forEach(id => { const tb = document.getElementById(id); if (tb) { try { _decorateTbody(tb); } catch (_) {} } });
        };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else setTimeout(run, 30);
    }

    function _boot() {
        if (typeof document === 'undefined') return;
        _injectCss();
        try {
            const mo = new MutationObserver(muts => {
                const hit = [];
                muts.forEach(m => {
                    let n = m.target;
                    while (n && n !== document) {
                        if (n.id && _TBODY[n.id]) { hit.push(n.id); break; }
                        n = n.parentNode;
                    }
                });
                if (hit.length) _scheduleDecorate(hit);
            });
            mo.observe(document.body, { childList: true, subtree: true });
        } catch (_) {}
        // First pass over anything already rendered.
        _scheduleDecorate(Object.keys(_TBODY));
    }
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _boot);
        else _boot();
    }

    // ==================================================================
    // Backlog #1b — AI-assumption citations, deterministically verified.
    // The model CITES; the core CHECKS. Every citation quote is matched
    // verbatim (whitespace/smart-quote normalized) against the actual
    // source-document text in the project store. Not found → flagged ✗,
    // never silently trusted. No quote is ever "close enough".
    // ==================================================================
    function _normQuote(s) {
        return String(s == null ? '' : s)
            .replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"')
            .replace(/[–—]/g, '-').replace(/ /g, ' ')
            .replace(/\s+/g, ' ').trim().toLowerCase();
    }
    // verifyCitations(citations, docs) → same-shape array + {verified, docFound, matchedDoc}
    //   citations: [{doc, quote, where}] — doc may be blank (search all docs)
    //   docs:      [{name, text}] from SafetyLabSourceDocs.list()
    function verifyCitations(citations, docs) {
        const D = (docs || []).map(d => ({ name: String((d && d.name) || ''), norm: _normQuote((d && d.text) || '') })).filter(d => d.norm);
        return (citations || []).map(c => {
            if (!c) return null;
            const out = { doc: String(c.doc || ''), quote: String(c.quote || ''), where: String(c.where || ''), verified: false, docFound: false, matchedDoc: '' };
            const q = _normQuote(out.quote);
            if (q.length < 8) return out;   // too short to be evidence — stays unverified
            const nameNorm = _normQuote(out.doc);
            const named = nameNorm ? D.filter(d => {
                const dn = _normQuote(d.name);
                return dn === nameNorm || dn.indexOf(nameNorm) !== -1 || nameNorm.indexOf(dn) !== -1;
            }) : [];
            out.docFound = named.length > 0;
            const pool = named.length ? named : D;   // blank/unmatched doc name → search everything, honestly labeled
            for (const d of pool) {
                if (d.norm.indexOf(q) !== -1) { out.verified = true; out.matchedDoc = d.name; break; }
            }
            return out;
        }).filter(Boolean);
    }

    // assumptionConfidence(entry) — pill verdict for an AI-assumption ledger row.
    //   grade: L2 = every citation verified against a source document
    //          L1 = cited, but ≥1 quote unverified or its document missing
    //          L0 = uncited (model prior) or legacy row (pre-citation capture)
    //   tier:  Open → red (a premise nobody confirmed), Confirmed+L2 → green,
    //          Confirmed otherwise → amber. Rejected → null (struck, dispositioned).
    function assumptionConfidence(entry) {
        if (!entry) return null;
        if (entry.status === 'Rejected') return null;
        const cits = Array.isArray(entry.citations) ? entry.citations : [];
        const legacy = entry.basis == null && !cits.length && entry.rationale == null;
        let grade, gw;
        if (cits.length && cits.every(c => c && c.verified)) { grade = 'L2'; gw = cits.length + ' citation(s), every quote verified verbatim against the source documents'; }
        else if (cits.length) { grade = 'L1'; gw = cits.filter(c => c && c.verified).length + '/' + cits.length + ' citation quote(s) verified — unverified quotes are flagged, not trusted'; }
        else if (legacy) { grade = 'L0'; gw = 'recorded before citation capture — re-run the analysis for cited grounds'; }
        else { grade = 'L0'; gw = 'UNCITED — the model declared this from its prior, not from a project document'; }
        const confirmed = entry.status === 'Confirmed';
        const tier = confirmed ? (grade === 'L2' ? 'green' : 'amber') : 'red';
        const label = confirmed ? 'AI premise · confirmed' : 'AI premise · open';
        const why = ['Input fidelity ' + grade + ' — ' + gw];
        why.push(confirmed ? 'Confirmed by the engineer' + (entry.note ? ' — note: ' + entry.note : '') : 'Awaiting engineer disposition (walkthrough)');
        why.push('Citations are verified by the deterministic core against the project\'s own source documents — the AI never certifies its own quotes.');
        return { tier, grade, reviewed: confirmed, label, why };
    }

    // ------------------------------------------------------------- exports
    const API = { confidence, draftConfidence, pillHtml, reportLabel, _grade, _decorateTbody, GROUNDED_FEATURES,
        verifyCitations, assumptionConfidence, _normQuote };
    if (typeof window !== 'undefined') window.AiBadges = API;
    if (typeof globalThis !== 'undefined') globalThis.AiBadges = API;   // headless tests
})();
