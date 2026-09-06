// misc_fn_modules.js — v1.0 — Phase P2 batch 6: residual function layer (full sweep).
// MOVED VERBATIM from safety_lab.js (byte-exact; classic script loaded BEFORE the
// monolith; all names remain global). 100%% pure runtime function declarations —
// zero load-time code. Each segment was machine-validated (standalone parse +
// monolith-minus-segment parse) before the move; reconstruction diff proves the
// original file is byte-recoverable. Segment map: see [P2 batch 6] markers in safety_lab.js.
function _slabGuardSourceDoc(doc, budgetRef) {
    const out = {
        id: doc && doc.id, name: (doc && doc.name) || 'document', addedAt: (doc && doc.addedAt) || Date.now(),
        text: String((doc && doc.text) || ''),
        tables: Array.isArray(doc && doc.tables) ? doc.tables.map(function (t) {
            return { title: String((t && t.title) || ''), markdown: String((t && t.markdown) || '') };
        }) : [],
        images: []
    };
    const imgs = Array.isArray(doc && doc.images) ? doc.images : [];
    for (let i = 0; i < imgs.length; i++) {
        const im = imgs[i] || {};
        const data = String(im.data || '');
        const cap = String(im.caption || '');
        if (!data || data.length > _SLAB_DOC_IMG_MAX) {
            // Too big to persist — keep a captioned placeholder so the diagram is still referenced.
            out.images.push({ type: String(im.type || ''), data: '', caption: cap });
            continue;
        }
        if ((budgetRef.used + data.length) > _SLAB_DOC_IMG_TOTAL_MAX) {
            out.images.push({ type: String(im.type || ''), data: '', caption: cap });
            continue;
        }
        budgetRef.used += data.length;
        out.images.push({ type: String(im.type || ''), data: data, caption: cap });
    }
    return out;
}
// Build the persist-safe projection of projectSourceDocs (size-guarded). Never throws.
function _slabSerializeSourceDocs() {
    try {
        const budget = { used: 0 };
        return (Array.isArray(projectSourceDocs) ? projectSourceDocs : []).map(function (d) { return _slabGuardSourceDoc(d, budget); });
    } catch (_) { return []; }
}

function _aiAsmNormText(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim().toLowerCase(); }
// Re-render the AI Assumptions tab only if it is the one currently on screen, so
// mutations from a background AI run don't fight whatever the user is looking at.
function _aiAsmRerenderIfOpen() {
    try {
        const v = document.getElementById('view-assumptions');
        if (v && v.style.display !== 'none' && typeof renderAiAssumptions === 'function') renderAiAssumptions();
    } catch (_) {}
}

function getTrialStartedAt() {
    try {
        const raw = localStorage.getItem('safetyLab.license.trialStartedAt');
        const v = raw ? parseInt(raw, 10) : NaN;
        return Number.isFinite(v) ? v : null;
    } catch(_) { return null; }
}
function getTrialTargetTier() {
    try {
        const t = localStorage.getItem('safetyLab.license.trialTarget');
        return (t && LICENSE_TIER_RANK.hasOwnProperty(t)) ? t : null;
    } catch(_) { return null; }
}
function getTrialDaysRemaining() {
    const started = getTrialStartedAt();
    if (!started) return 0;
    const remainingMs = TRIAL_DURATION_MS - (Date.now() - started);
    return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}
function isOnTrial() { return getTrialDaysRemaining() > 0; }
function startTrial(targetTier) {
    // Call once at signup. `targetTier` is the paid tier the user is trialing toward
    // (used by upsell prompts to suggest the right "Upgrade to X" CTA when the trial ends).
    if (!targetTier || !LICENSE_TIER_RANK.hasOwnProperty(targetTier)) targetTier = 'pro';
    try {
        localStorage.setItem('safetyLab.license.trialStartedAt', String(Date.now()));
        localStorage.setItem('safetyLab.license.trialTarget', targetTier);
    } catch(_) {}
    return getTrialDaysRemaining();
}
function endTrial() {
    try {
        localStorage.removeItem('safetyLab.license.trialStartedAt');
        localStorage.removeItem('safetyLab.license.trialTarget');
    } catch(_) {}
}

function getSignupDate() {
    try {
        const raw = localStorage.getItem('safetyLab.signup.signupDate');
        const v = raw ? parseInt(raw, 10) : NaN;
        return Number.isFinite(v) ? v : null;
    } catch(_) { return null; }
}
function setSignupDate(ts) {
    try {
        if (ts == null) localStorage.removeItem('safetyLab.signup.signupDate');
        else            localStorage.setItem('safetyLab.signup.signupDate', String(ts | 0));
    } catch(_) {}
}

function isInGrandfatherWindow() {
    const signupAt = getSignupDate();
    if (!signupAt) return false;
    // Only signups made BEFORE enforcement start qualify for grandfather treatment.
    if (signupAt >= PAYWALL_ENFORCEMENT_START) return false;
    // Window expires 30 days after enforcement start (not after signup).
    return Date.now() < (PAYWALL_ENFORCEMENT_START + PAYWALL_GRANDFATHER_MS);
}
function getGrandfatherDaysRemaining() {
    if (!isInGrandfatherWindow()) return 0;
    const remainingMs = (PAYWALL_ENFORCEMENT_START + PAYWALL_GRANDFATHER_MS) - Date.now();
    return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}

function isEduLicensed()        { return getEffectiveTier() === 'edu'; }
function isProLicensed()        { return LICENSE_TIER_RANK[getEffectiveTier()] >= LICENSE_TIER_RANK['pro']; }
function isProPlusLicensed()    { return LICENSE_TIER_RANK[getEffectiveTier()] >= LICENSE_TIER_RANK['pro-plus']; }
function isEnterpriseLicensed() { return getEffectiveTier() === 'enterprise'; }

function canUseAutoReq()          { return !isEduLicensed(); }
function canUseVerificationTree() { return !isEduLicensed(); }
function canUseAI()               { return isProPlusLicensed(); }
function canUseConfigBaselining() { return isProPlusLicensed(); }   // SC config baselining — Pro+ gated
function canUseItarRouting()      { return isEnterpriseLicensed(); }
function canUseDO330Kit()         { return isEnterpriseLicensed(); }

function isEduEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const e = email.trim().toLowerCase();
    // Strict .edu (US) or .edu.<cc> (e.g. .edu.au, .edu.cn) or .ac.<cc> (UK / international).
    return /@[\w.-]+\.(edu|edu\.[a-z]{2,3}|ac\.[a-z]{2,3})$/.test(e);
}

function _compEntryEmail(entry) {
    return (typeof entry === 'string' ? entry : (entry && entry.email) || '').trim().toLowerCase();
}
function _isCompEntryActive(entry) {
    if (typeof entry === 'string') return true;
    if (!entry || !entry.expiresAt) return true;
    // Parse YYYY-MM-DD as end-of-day UTC so the comp covers the entire expiry day.
    const expires = Date.parse(entry.expiresAt + 'T23:59:59Z');
    return !Number.isFinite(expires) || Date.now() <= expires;
}

function isElectraEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const e = email.trim().toLowerCase();
    return /@electra\.aero$/.test(e);
}
function isCompedEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const e = email.trim().toLowerCase();
    // Explicit block overrides everything below (domain comp included) — paywalls a
    // specific address even at a comped partner domain.
    try { if (typeof COMPED_BLOCKED_EMAILS !== 'undefined' && COMPED_BLOCKED_EMAILS.indexOf(e) >= 0) return false; } catch(_) {}
    // Per-email comp first (covers founder/advisor/beta-evaluator addresses on any provider).
    for (let i = 0; i < COMPED_FREE_EMAILS.length; i++) {
        const entry = COMPED_FREE_EMAILS[i];
        if (_compEntryEmail(entry) === e && _isCompEntryActive(entry)) return true;
    }
    // Then per-domain comp (covers whole partner orgs like electra.aero).
    for (let i = 0; i < COMPED_FREE_DOMAINS.length; i++) {
        const re = new RegExp('@' + COMPED_FREE_DOMAINS[i].replace(/\./g, '\\.') + '$');
        if (re.test(e)) return true;
    }
    return false;
}

function showUpgradeRequiredToast(feature, requiredTier) {
    const tierLabel = ({
        'pro': 'Pro',
        'pro-plus': 'Pro+',
        'enterprise': 'Enterprise'
    })[requiredTier] || 'a paid plan';
    const effective = getEffectiveTier();
    let currentLabel = ({'edu':'Student / University (free)','pro':'Pro','pro-plus':'Pro+','enterprise':'Enterprise'})[effective] || effective;
    // If they're inside the 10-day trial we frame the restriction as "trial gating",
    // not as a tier mismatch — gives them the right mental model + a clear CTA.
    if (isOnTrial()) {
        const days = getTrialDaysRemaining();
        const target = getTrialTargetTier() || 'pro';
        const targetLabel = ({'pro':'Pro','pro-plus':'Pro+','enterprise':'Enterprise'})[target] || 'a paid plan';
        const msg = (feature || 'This feature') + ' unlocks when your trial converts to ' + targetLabel +
            '. Trial has ' + days + ' day' + (days === 1 ? '' : 's') + ' left.';
        if (typeof showToast === 'function') showToast(msg, 'warning', 5200);
        else alert(msg);
        return;
    }
    const msg = (feature || 'This feature') + ' requires ' + tierLabel + '. Your current tier is ' + currentLabel + '.';
    if (typeof showToast === 'function') showToast(msg, 'warning', 5200);
    else alert(msg);
}

function getLicenseToken() {
    try { return localStorage.getItem('safetyLab.license.token') || ''; } catch(_) { return ''; }
}

function certBasisDisplayLabel() {
    const reg = (typeof canonRegulation === 'function') ? canonRegulation((projectConfig && projectConfig.regulation) || 'Part 25') : ((projectConfig && projectConfig.regulation) || 'Part 25');
    if (reg === 'Part 23')  return 'Part 23 Class ' + (projectConfig.part23Class || 'IV');
    if (reg === 'Part 27')  return 'Part 27' + ((typeof part27IsLegacy === 'function' && part27IsLegacy(projectConfig.part27Class)) ? ' (legacy — pick a class)' : ' Class ' + projectConfig.part27Class);
    if (reg === 'SC-VTOL')  return 'SC-VTOL ' + (projectConfig.scvtolCategory || 'Enhanced') + ((typeof scvtolIsLegacyBasic === 'function' && scvtolIsLegacyBasic(projectConfig.scvtolCategory)) ? ' (legacy — confirm seat band)' : '');
    if (reg === 'Custom')   return (projectConfig.customCertBasis && projectConfig.customCertBasis.name) || 'Custom Cert Basis';
    return reg;
}

function getDALCredit(dal, kind) {
    if (!dal) return null;
    const table = kind === 'hw' ? DO254_DAL_CREDIT : DO178C_DAL_CREDIT;
    const entry = table[String(dal).toUpperCase()];
    if (!entry) return null;
    return Object.assign({ dal: dal, kindLabel: kind === 'hw' ? 'DO-254' : 'DO-178C' }, entry);
}

function renderMoCCatalogue() {
    const host = document.getElementById('moc-catalogue-host');
    if (!host) return;
    // Phase 53.54 — filter by active cert basis. Cross-cutting entries always show.
    const certBasis = (projectConfig && projectConfig.regulation) || 'Part 25';
    const part23Class = (projectConfig && projectConfig.part23Class) || 'IV';
    const showAll = !!_mocShowAllRegulations;
    const entries = COMPLIANCE_CATALOGUE.filter(e => {
        if (showAll) return true;
        const at = Array.isArray(e.appliesTo) ? e.appliesTo : ['Part 25', 'Part 23'];
        return at.indexOf(certBasis) >= 0;
    });
    const rows = entries.map(e => {
        const isCrossCutting = Array.isArray(e.appliesTo) && e.appliesTo.length > 1;
        const tag = isCrossCutting
            ? ' <span style="display: inline-block; padding: 1px 6px; font-size: 9px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; background: var(--color-surface-2); color: var(--color-text-secondary); border-radius: var(--r-full); margin-left: 4px;">cross-cert</span>'
            : '';
        return '<tr><td><strong>' + esc(e.regulation) + '</strong>' + tag + '</td><td><span style="font-family: var(--font-mono); color: var(--color-accent);">' + esc(e.paragraph) + '</span></td><td>' + esc(e.title) + '</td></tr>';
    }).join('');
    // Filter banner + toggle. Cert-basis context is read live from projectConfig so changing
    // the AC 1309 selector re-narrows the catalog on the next render.
    const filterLine = showAll
        ? 'Showing <strong>all</strong> ' + COMPLIANCE_CATALOGUE.length + ' regulation entries (filter off). Cert basis: <strong>' + esc(certBasis) + (certBasis === 'Part 23' ? ' Class ' + esc(part23Class) : '') + '</strong>.'
        : 'Filtered to <strong>' + entries.length + '</strong> of ' + COMPLIANCE_CATALOGUE.length + ' entries for cert basis <strong>' + esc(certBasis) + (certBasis === 'Part 23' ? ' Class ' + esc(part23Class) : '') + '</strong>. Cross-cert standards (ARP 4754B, ARP 4761A, DO-178C, DO-254) always show.';
    host.innerHTML =
        '<div style="display: flex; justify-content: space-between; align-items: center; gap: var(--s-3); margin-bottom: var(--s-3); padding: var(--s-2) var(--s-3); background: var(--color-surface-1); border: 1px solid var(--color-border-hair); border-radius: var(--r-md); font-size: 12px; flex-wrap: wrap;">'
        +   '<span style="color: var(--color-text-secondary);">' + filterLine + '</span>'
        +   '<label style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-size: 12px; color: var(--color-text-secondary);">'
        +     '<input type="checkbox" ' + (showAll ? 'checked' : '') + ' onchange="onMoCShowAllToggle()" class="u-m0">'
        +     'Show all regulations'
        +   '</label>'
        + '</div>'
        + '<table class="reference-table" class="u-text-sm"><thead><tr><th style="width: 18%;">Regulation</th><th style="width: 18%;">Paragraph</th><th>Title</th></tr></thead><tbody>' + rows + '</tbody></table>';
}
function onMoCShowAllToggle() {
    _mocShowAllRegulations = !_mocShowAllRegulations;
    renderMoCCatalogue();
}

function renderMoCMatrix() {
    const host = document.getElementById('moc-matrix-host');
    if (!host) return;
    const allReqs = [];
    (acReqData || []).forEach(r => allReqs.push({ req: r, scope: 'ac', systemId: null }));
    (systemsData || []).forEach(s => (s.req || []).forEach(r => allReqs.push({ req: r, scope: 'sys-' + s.id, systemId: s.id, sysName: s.name })));

    const rowsWithMoc = allReqs.filter(({ req }) => Array.isArray(req.mocEntries) && req.mocEntries.length);
    if (!rowsWithMoc.length) {
        host.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-tertiary); font-style: italic; background: var(--color-surface-1); border: 1px solid var(--color-border-hair); border-radius: var(--r-md);">No requirements have MoC entries yet. On the AC Requirements or System Requirements tab, edit a requirement and use "+ Add MoC entry" to attach compliance credit.</div>';
        return;
    }
    const palette = {
        'Compliant':     { bg: 'rgba(52, 199, 89, 0.16)',  fg: 'var(--sev-min-fg)' },
        'Non-Compliant': { bg: 'rgba(255, 59, 48, 0.13)',  fg: 'var(--sev-cat-fg)' },
        'In Progress':   { bg: 'rgba(255, 149, 0, 0.13)',  fg: 'var(--sev-haz-fg)' },
        'Partial':       { bg: 'rgba(255, 204, 0, 0.16)',  fg: 'var(--sev-maj-fg)' },
        'Pending':       { bg: 'var(--color-surface-2)',    fg: 'var(--color-text-tertiary)' },
        'N/A':           { bg: 'var(--color-surface-2)',    fg: 'var(--color-text-tertiary)' }
    };
    const rowHtml = rowsWithMoc.map(({ req, scope, sysName }) => {
        const entries = req.mocEntries.map(e => {
            const p = palette[e.status] || palette['Pending'];
            return '<div style="display: flex; gap: 8px; align-items: center; padding: 4px 0; font-size: 11px;">' +
                '<span style="background: ' + p.bg + '; color: ' + p.fg + '; padding: 1px 8px; border-radius: var(--r-full); font-weight: 600; min-width: 90px; text-align: center;">' + esc(e.status || 'Pending') + '</span>' +
                '<span style="font-family: var(--font-mono); color: var(--color-accent);">' + esc(e.regulation || '') + ' ' + esc(e.paragraph || '') + '</span>' +
                '<span style="color: var(--color-text-secondary);">via ' + esc(e.method || '—') + '</span>' +
                (e.notes ? '<span class="u-muted-italic">— ' + esc(e.notes) + '</span>' : '') +
            '</div>';
        }).join('');
        const scopeLabel = scope === 'ac' ? 'AC' : ('Sys: ' + (sysName || scope));
        return '<tr><td><span style="font-size: 10px; text-transform: uppercase; color: var(--color-text-tertiary); letter-spacing: 0.05em;">' + esc(scopeLabel) + '</span><br><strong>' + esc(req.traceId || ('#' + req.internalId)) + '</strong><br><span class="u-text-xs">' + esc((req.text || '').slice(0, 80)) + ((req.text || '').length > 80 ? '…' : '') + '</span></td><td>' + entries + '</td></tr>';
    }).join('');
    host.innerHTML = '<table class="reference-table" class="u-text-sm"><thead><tr><th style="width: 35%;">Requirement</th><th>MoC Entries</th></tr></thead><tbody>' + rowHtml + '</tbody></table>';
}

async function _sha256Hex(str) {
    const enc = new TextEncoder().encode(str);
    const hashBuf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// #260 — Assumptions-disposition gate. Cert artifacts (baselines, reports) should not
// be finalized while AI-declared assumptions are still Open (undispositioned). Returns
// a Promise<boolean>: true = proceed. Offers Review (opens the tab) / Cancel / Proceed
// anyway (logged + attributable). Fails OPEN on any error so a UI glitch can never block
// a user from generating their own artifacts.
function _gateEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
// [P2 batch 5] L966-1012 moved verbatim to bindings_modules.js

// Capture a new baseline. Prompts the user for milestone + notes.
// [P2 batch 5] L1015-1045 moved verbatim to bindings_modules.js

// Render the Baselines tab.
function renderBaselines() {
    const host = document.getElementById('baselines-host');
    if (!host) return;
    if (!projectBaselines.length) {
        host.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--color-text-tertiary); font-style: italic; background: var(--color-surface-1); border: 1px solid var(--color-border-hair); border-radius: var(--r-md);">No baselines captured yet. Click "+ Capture New Baseline" to snapshot the current project state at a certification milestone.</div>';
        return;
    }
    const rows = projectBaselines.slice().reverse().map(b => {
        const date = new Date(b.timestamp).toLocaleString();
        const kb = (b.sizeBytes / 1024).toFixed(1);
        return '<tr>' +
            '<td><strong>' + esc(b.name) + '</strong><br><span class="u-muted-small">' + esc(b.milestone) + '</span></td>' +
            '<td>' + esc(date) + '</td>' +
            '<td>' + (b.signedBy ? esc(b.signedBy) : '<span style="color: var(--sev-haz-fg); font-style: italic;">unsigned</span>') + '</td>' +
            '<td><span style="font-family: var(--font-mono); font-size: 10px;">' + esc(b.hash.slice(0, 16)) + '…</span><br><span class="u-muted-small">' + kb + ' KB</span></td>' +
            '<td>' + esc(b.notes || '—') + '</td>' +
            '<td>' + kebabMenu(
                '<button type="button" role="menuitem" onclick="downloadBaseline(\'' + b.id + '\')">↓ Download JSON</button>' +
                '<button type="button" role="menuitem" onclick="verifyBaseline(\'' + b.id + '\')">✓ Verify integrity</button>' +
                '<button type="button" role="menuitem" onclick="diffBaselineToCurrent(\'' + b.id + '\')">Δ Show changes</button>' +
                '<button type="button" role="menuitem" class="ram-danger" onclick="deleteBaseline(\'' + b.id + '\')">✕ Delete</button>'
            ) + '</td>' +
        '</tr>';
    }).join('');
    host.innerHTML = '<table class="reference-table" class="u-text-sm"><thead><tr><th>Baseline</th><th>Captured</th><th>Signed By</th><th>SHA-256 + Size</th><th>Notes</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

// [P2 batch 5] L1075-1085 moved verbatim to bindings_modules.js

// [P2 batch 5] L1087-1096 moved verbatim to bindings_modules.js

// === REDLINE-DIFF-START =================================================
// #30 — Field-level baseline redline. Pure diff of two project snapshots → per-array
// added / removed / changed rows, with old→new for each changed field. Testable (no DOM).
function _baselineRowKey(r) {
    if (!r) return '';
    return String(r.internalId != null ? r.internalId : (r.id != null ? r.id : (r.fcId != null ? r.fcId : (r.subId != null ? r.subId : (r.asmId != null ? r.asmId : '')))));
}
function _baselineFieldDiff(snap, cur) {
    const ARRAYS = ['acFunctionsData', 'acFhaData', 'acReqData', 'acAssumptionsData', 'systemsData', 'praData', 'zsaData', 'cmaData', 'fmeaData', 'ftaPages'];
    const out = {};
    ARRAYS.forEach(function (name) {
        const a = Array.isArray(snap && snap[name]) ? snap[name] : [];
        const b = Array.isArray(cur && cur[name]) ? cur[name] : [];
        const amap = {}, bmap = {};
        a.forEach(function (r, i) { amap[_baselineRowKey(r) || ('#' + i)] = r; });
        b.forEach(function (r, i) { bmap[_baselineRowKey(r) || ('#' + i)] = r; });
        const added = [], removed = [], changed = [];
        Object.keys(bmap).forEach(function (k) { if (!(k in amap)) added.push(k); });
        Object.keys(amap).forEach(function (k) {
            if (!(k in bmap)) { removed.push(k); return; }
            const ra = amap[k], rb = bmap[k];
            if (JSON.stringify(ra) === JSON.stringify(rb)) return;
            const fields = {}, keys = {};
            Object.keys(ra || {}).forEach(function (f) { keys[f] = 1; });
            Object.keys(rb || {}).forEach(function (f) { keys[f] = 1; });
            Object.keys(keys).forEach(function (f) {
                const va = ra ? ra[f] : undefined, vb = rb ? rb[f] : undefined;
                const sa = (va && typeof va === 'object') ? JSON.stringify(va) : String(va == null ? '' : va);
                const sb = (vb && typeof vb === 'object') ? JSON.stringify(vb) : String(vb == null ? '' : vb);
                if (sa !== sb) fields[f] = [sa, sb];
            });
            if (Object.keys(fields).length) changed.push({ key: k, fields: fields });
        });
        if (added.length || removed.length || changed.length) out[name] = { added: added, removed: removed, changed: changed };
    });
    return out;
}
// === REDLINE-DIFF-END ===================================================
// [P2 batch 5] L1136-1136 moved verbatim to bindings_modules.js
function _renderBaselineDiff(b, diff, curHash) {
    const old = document.getElementById('baseline-diff-panel'); if (old) old.remove();
    const names = Object.keys(diff);
    const clip = function (s) { s = String(s == null ? '' : s); return s.length > 80 ? s.slice(0, 80) + '…' : s; };
    let body = names.length ? '' : '<div style="color:#5b6675;">Hash differs but no row-level changes in the tracked arrays (e.g. config/FTA-config only).</div>';
    names.forEach(function (name) {
        const d = diff[name];
        body += '<div style="margin-top:12px;"><div style="font-weight:700;color:#0a1f44;font-size:13px;">' + esc(_DIFF_LABELS[name] || name) + ' — <span style="color:#0a7f4f;">+' + d.added.length + '</span> · <span style="color:#b91c1c;">−' + d.removed.length + '</span> · <span style="color:#b45309;">' + d.changed.length + ' changed</span></div>';
        d.changed.slice(0, 40).forEach(function (c) {
            body += '<div style="margin:6px 0 6px 8px;font-size:12px;"><b>' + esc(c.key) + '</b>';
            Object.keys(c.fields).slice(0, 12).forEach(function (f) {
                body += '<div style="margin-left:10px;color:#5b6675;">' + esc(f) + ': <span style="color:#b91c1c;text-decoration:line-through;">' + esc(clip(c.fields[f][0])) + '</span> → <span style="color:#0a7f4f;">' + esc(clip(c.fields[f][1])) + '</span></div>';
            });
            body += '</div>';
        });
        if (d.changed.length > 40) body += '<div style="margin-left:8px;color:#5b6675;font-size:11px;">…and ' + (d.changed.length - 40) + ' more changed rows.</div>';
        body += '</div>';
    });
    const ov = document.createElement('div'); ov.id = 'baseline-diff-panel';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:20px;font:14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;';
    ov.innerHTML = '<div style="background:#fff;color:#1a2230;border-radius:14px;width:min(680px,96vw);max-height:90vh;overflow:auto;box-shadow:0 24px 64px rgba(0,0,0,.3);padding:20px 22px;">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;"><div style="font-size:16px;font-weight:700;color:#0a1f44;">Redline vs baseline "' + esc(b.name) + '"</div><button id="bdiff-x" style="border:none;background:transparent;font-size:22px;cursor:pointer;color:#5b6675;">×</button></div>'
        + '<div style="font-size:11px;color:#5b6675;margin:2px 0 8px;font-family:monospace;">baseline ' + esc(b.hash.slice(0, 16)) + '… → current ' + esc(curHash.slice(0, 16)) + '…</div>'
        + body + '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) ov.remove(); });
    const xb = document.getElementById('bdiff-x'); if (xb) xb.onclick = function () { ov.remove(); };
}

function makeNodeIndependent(node) {
    node = node || selectedNodeData;
    if (!node) { alert('Select a node first.'); return; }
    const lid = node.logicalId != null ? node.logicalId : node.id;
    const group = repeatedEventGroups().get(lid);
    if (!group || group.length < 2) {
        alert('This node is not part of a common-mode group.');
        return;
    }
    if (!confirm(`Make "${node.displayId || node.name || 'this node'}" independent? It will no longer share failures with the other ${group.length - 1} instance(s). The other instances stay linked to each other.`)) return;

    // Mint a fresh logicalId + displayId for the selected node only.
    const typeKey = node.type === 'gate' ? 'gate' : node.type;
    node.logicalId = internalIdCounter++;
    node.displayId = generateDisplayId(typeKey);
    // Clear any common-mode paste markers that would re-link it on next paste-review.
    if (node._pasteOrigin) {
        node._pasteOrigin.pasteMode = 'independent';
    }
    // Recompute + redraw.
    if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities();
    if (typeof updateD3 === 'function') updateD3();
    if (typeof selectNode === 'function') selectNode(node);
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    if (typeof showToast === 'function') showToast(`"${node.displayId}" is now independent.`, 'success');
}

function closePasteReviewModal() {
    const m = document.getElementById('paste-review-modal');
    if (m) m.remove();
}

function onPasteModeChange() {
    const modeEl = document.querySelector('input[name="paste-mode"]:checked');
    const mode = modeEl ? modeEl.value : 'independent';
    const ccfHost = document.getElementById('paste-ccf-config');
    if (ccfHost) ccfHost.style.display = (mode === 'ccf-group') ? 'block' : 'none';
}

function applyPasteMode_SameEvent(branchRoot) {
    (function walk(n) {
        if (!n) return;
        if (n._originalLogicalId != null) {
            n.logicalId = n._originalLogicalId;
        }
        delete n._originalLogicalId;
        const kids = n.children || n._children;
        if (kids) kids.forEach(walk);
    })(branchRoot);
    if (typeof propagateRepeatedEventEdit === 'function') {
        (function sync(n) {
            if (!n) return;
            propagateRepeatedEventEdit(n);
            const kids = n.children || n._children;
            if (kids) kids.forEach(sync);
        })(branchRoot);
    }
}

function applyPasteMode_CCFGroup(branchRoot, groupName, beta) {
    const sourceLogicalIds = new Set();
    (function walk(n) {
        if (!n) return;
        if (n.type === 'basic' && n._originalLogicalId != null) {
            sourceLogicalIds.add(n._originalLogicalId);
        }
        if (n.type === 'basic') {
            n.ccfGroup = groupName;
            n.beta = Math.max(0, Math.min(1, beta));
        }
        delete n._originalLogicalId;
        const kids = n.children || n._children;
        if (kids) kids.forEach(walk);
    })(branchRoot);
    const srcTreeId = branchRoot._pasteOrigin && branchRoot._pasteOrigin.sourceTreeId;
    if (srcTreeId != null && typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) {
        const srcPage = ftaPages.find(p => p.id === srcTreeId);
        if (srcPage && srcPage.root) {
            (function walkSrc(n) {
                if (!n) return;
                if (n.type === 'basic' && sourceLogicalIds.has(n.logicalId)) {
                    n.ccfGroup = groupName;
                    n.beta = Math.max(0, Math.min(1, beta));
                }
                const kids = n.children || n._children;
                if (kids) kids.forEach(walkSrc);
            })(srcPage.root);
        }
    }
}

function acceptPasteReview() {
    const modal = document.getElementById('paste-review-modal');
    const branch = modal && modal._pasteBranchRoot;
    if (!branch) { closePasteReviewModal(); return; }
    const modeEl = document.querySelector('input[name="paste-mode"]:checked');
    const mode = modeEl ? modeEl.value : 'independent';
    let toastMsg = '';
    if (mode === 'same-event') {
        applyPasteMode_SameEvent(branch);
        toastMsg = 'Pasted as same physical event — source and destination linked via shared event ID.';
    } else if (mode === 'ccf-group') {
        const nameEl = document.getElementById('paste-ccf-name');
        const betaEl = document.getElementById('paste-ccf-beta');
        const name = (nameEl && nameEl.value || '').trim();
        const beta = Math.max(0, Math.min(1, parseFloat(betaEl && betaEl.value) || 0.1));
        if (!name) {
            alert('Please enter a CCF group name (e.g., BATT-PROPLOT-2024Q1).');
            if (nameEl) nameEl.focus();
            return;
        }
        applyPasteMode_CCFGroup(branch, name, beta);
        toastMsg = 'Pasted into CCF group "' + name + '" with β = ' + beta + ' on both sides.';
    } else {
        // Independent: strip the original-id marker; new IDs already in place.
        (function strip(n) {
            if (!n) return;
            delete n._originalLogicalId;
            const kids = n.children || n._children;
            if (kids) kids.forEach(strip);
        })(branch);
        toastMsg = 'Pasted as independent instance. Conservative-merge allocation preserved.';
    }
    closePasteReviewModal();
    if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities();
    if (typeof updateD3 === 'function') updateD3();
    if (typeof toast === 'function') toast(toastMsg);
}

function revertPasteToNatural() {
    const modal = document.getElementById('paste-review-modal');
    const branch = modal && modal._pasteBranchRoot;
    if (!branch) { closePasteReviewModal(); return; }
    (function strip(n) {
        if (!n) return;
        delete n._pasteOrigin;
        delete n._pasteOverrideProb;
        delete n._pasteDALOverride;
        delete n._pasteOriginDismissed;
        delete n._originalLogicalId;
        const kids = n.children || n._children;
        if (kids) kids.forEach(strip);
    })(branch);
    closePasteReviewModal();
    if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities();
    if (typeof updateD3 === 'function') updateD3();
    if (typeof toast === 'function') toast('Reverted to natural allocation. Source snapshots discarded.');
}

function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Collision-resistant row ID for new records.
function newRowId() {
    return Date.now().toString() + Math.random().toString(36).slice(2, 7);
}

function emptyTemplateOverrides() {
    const out = {};
    Object.keys(TEMPLATE_SCHEMAS).forEach(k => {
        out[k] = { columnOverrides: {}, customColumns: [], columnOrder: [] };
    });
    return out;
}

// Org-level template overrides live in localStorage so they persist across projects
// opened in the same browser. In production these would sync from a backend; the
// localStorage version is the beta-build offline fallback.
// [P2 batch 5] L1785-1785 moved verbatim to bindings_modules.js

function loadOrgTemplates() {
    try {
        const raw = localStorage.getItem(ORG_TEMPLATES_LSKEY);
        if (!raw) return emptyTemplateOverrides();
        const parsed = JSON.parse(raw);
        // Backfill any artifact kinds that were added after the user's last save.
        const merged = emptyTemplateOverrides();
        Object.keys(merged).forEach(k => {
            if (parsed[k]) {
                merged[k].columnOverrides = parsed[k].columnOverrides || {};
                merged[k].customColumns   = Array.isArray(parsed[k].customColumns) ? parsed[k].customColumns : [];
                merged[k].columnOrder     = Array.isArray(parsed[k].columnOrder)   ? parsed[k].columnOrder   : [];
            }
        });
        return merged;
    } catch(_) {
        return emptyTemplateOverrides();
    }
}
function saveOrgTemplates(overrides) {
    try { localStorage.setItem(ORG_TEMPLATES_LSKEY, JSON.stringify(overrides)); } catch(_) {}
}

function getCustomFieldValue(row, columnId) {
    if (!row || !row.customFields) return '';
    return row.customFields[columnId] != null ? row.customFields[columnId] : '';
}
function setCustomFieldValue(row, columnId, value) {
    if (!row) return;
    if (!row.customFields) row.customFields = {};
    row.customFields[columnId] = value;
}

function getCustomColumns(kind) {
    const eff = getEffectiveTemplate(kind);
    return eff.columns.filter(c => !c.builtIn && !c.hide);
}

function getBuiltInColumnLabel(kind, columnId) {
    const eff = getEffectiveTemplate(kind);
    const c = eff.columns.find(x => x.id === columnId && x.builtIn);
    return c ? c.label : columnId;
}

function renderCustomColumnCells(kind, row) {
    const cols = getCustomColumns(kind);
    if (!cols.length) return '';
    let out = '';
    cols.forEach(c => {
        const v = getCustomFieldValue(row, c.id);
        out += '<td>' + esc(String(v == null ? '' : v)) + '</td>';
    });
    return out;
}

function customColumnHeadersHtml(kind) {
    const cols = getCustomColumns(kind);
    if (!cols.length) return '';
    return cols.map(c => '<th>' + esc(c.label) + '</th>').join('');
}

function _injectCustomColumnHeaders() {
    Object.keys(_CUSTOM_COL_THEAD_IDS).forEach(kind => {
        const tid = _CUSTOM_COL_THEAD_IDS[kind];
        if (!tid) return;
        const thead = document.getElementById(tid);
        if (!thead) return;
        const tr = thead.querySelector('tr');
        if (!tr) return;
        // Strip any previously-injected custom headers, then re-append.
        Array.from(tr.querySelectorAll('th[data-tmpl-custom="1"]')).forEach(n => n.remove());
        const cols = getCustomColumns(kind);
        cols.forEach(c => {
            const th = document.createElement('th');
            th.textContent = c.label;
            th.setAttribute('data-tmpl-custom', '1');
            // Insert before the Review column if present, else append at end.
            const reviewTh = tr.querySelector('th[data-tmpl-review="1"]');
            if (reviewTh) tr.insertBefore(th, reviewTh);
            else tr.appendChild(th);
        });
    });
}

function openTemplateEditor(initialKind) {
    _activeTemplateKind = initialKind || 'acFha';
    _activeTemplateScope = 'project';
    const m = document.getElementById('template-editor-modal');
    if (!m) return;
    m.style.display = 'flex';
    setTimeout(() => m.classList.add('show'), 10);
    renderTemplateEditor();
}
function closeTemplateEditor() {
    const m = document.getElementById('template-editor-modal');
    if (!m) return;
    m.classList.remove('show');
    setTimeout(() => m.style.display = 'none', 220);
}

function setTemplateKind(kind) {
    _activeTemplateKind = kind;
    renderTemplateEditor();
}
function setTemplateScope(scope) {
    _activeTemplateScope = scope;
    renderTemplateEditor();
}

function renameColumn(columnId, newLabel) {
    const o = _activeOverrides();
    const eff = getEffectiveTemplate(_activeTemplateKind);
    const col = eff.columns.find(c => c.id === columnId);
    if (!col) return;
    if (col.builtIn) {
        // Built-in: store as a label override against the canonical id.
        if (!o.columnOverrides[columnId]) o.columnOverrides[columnId] = {};
        // Empty input → revert to default.
        if (!newLabel || newLabel === col.origLabel) delete o.columnOverrides[columnId].label;
        else o.columnOverrides[columnId].label = newLabel;
        if (Object.keys(o.columnOverrides[columnId]).length === 0) delete o.columnOverrides[columnId];
    } else {
        // Custom: update directly in customColumns.
        const cc = o.customColumns.find(c => c.id === columnId);
        if (cc) cc.label = newLabel || cc.id;
    }
    _persistActiveScope();
    _rerenderAffectedTable();
}

function toggleColumnHidden(columnId, hide) {
    const o = _activeOverrides();
    const eff = getEffectiveTemplate(_activeTemplateKind);
    const col = eff.columns.find(c => c.id === columnId);
    if (!col) return;
    if (col.builtIn) {
        if (!o.columnOverrides[columnId]) o.columnOverrides[columnId] = {};
        if (hide) o.columnOverrides[columnId].hide = true;
        else delete o.columnOverrides[columnId].hide;
        if (Object.keys(o.columnOverrides[columnId]).length === 0) delete o.columnOverrides[columnId];
    } else {
        const cc = o.customColumns.find(c => c.id === columnId);
        if (cc) cc.hide = !!hide;
    }
    _persistActiveScope();
    _rerenderAffectedTable();
    renderTemplateEditor();
}

function resetColumnOverride(columnId) {
    const o = _activeOverrides();
    if (o.columnOverrides[columnId]) {
        delete o.columnOverrides[columnId];
        _persistActiveScope();
        _rerenderAffectedTable();
        renderTemplateEditor();
    }
}

function addCustomColumn() {
    const labelEl = document.getElementById('template-add-col-label');
    const typeEl  = document.getElementById('template-add-col-type');
    if (!labelEl || !typeEl) return;
    const label = (labelEl.value || '').trim();
    const type  = typeEl.value;
    if (!label) {
        if (typeof showToast === 'function') showToast('Give the new column a label first.', 'warning', 3000);
        return;
    }
    // Slug the label into a safe id and avoid id collisions.
    const baseId = 'custom_' + label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const o = _activeOverrides();
    let id = baseId;
    let n = 1;
    while (o.customColumns.find(c => c.id === id)) { id = baseId + '_' + (++n); }
    const newCol = { id, label, type, builtIn: false };
    if (type === 'enum' || type === 'multiselect') newCol.options = [];
    o.customColumns.push(newCol);
    _persistActiveScope();
    labelEl.value = '';
    renderTemplateEditor();
    _rerenderAffectedTable();
    if (typeof showToast === 'function') showToast('Added column "' + label + '" to ' + TEMPLATE_SCHEMAS[_activeTemplateKind].name + '.', 'success', 3200);
}

function changeCustomColumnType(columnId, newType) {
    const o = _activeOverrides();
    const cc = o.customColumns.find(c => c.id === columnId);
    if (cc) {
        cc.type = newType;
        if ((newType === 'enum' || newType === 'multiselect') && !Array.isArray(cc.options)) cc.options = [];
        _persistActiveScope();
        _rerenderAffectedTable();
    }
}

function deleteCustomColumn(columnId) {
    if (!confirm('Delete this column? Any values stored for this column on existing rows will be removed on next save.')) return;
    const o = _activeOverrides();
    o.customColumns = o.customColumns.filter(c => c.id !== columnId);
    _persistActiveScope();
    renderTemplateEditor();
    _rerenderAffectedTable();
}

function _rerenderAffectedTable() {
    const KIND_RENDERER = {
        acFha:  () => (typeof renderACFHA === 'function' ? renderACFHA() : null),
        acFunc: () => (typeof renderACFunctions === 'function' ? renderACFunctions() : null),
        acFcim: () => (typeof renderACFcim === 'function' ? renderACFcim() : null),
        acReq:  () => (typeof renderACReq === 'function' ? renderACReq() : null),
        acAsm:  () => (typeof renderACAsm === 'function' ? renderACAsm() : null),
        sysFha: () => (typeof renderSysFHA === 'function' ? renderSysFHA() : null),
        sysFunc: () => (typeof renderSysFunctions === 'function' ? renderSysFunctions() : null),
        sysFcim: () => (typeof renderSysFcim === 'function' ? renderSysFcim() : null),
        sysReq: () => (typeof renderSysReq === 'function' ? renderSysReq() : null),
        sysAsm: () => (typeof renderSysAsm === 'function' ? renderSysAsm() : null),
        pra:    () => (typeof renderPRA === 'function' ? renderPRA() : null),
        zsa:    () => (typeof renderZSA === 'function' ? renderZSA() : null),
        cma:    () => (typeof renderCMA === 'function' ? renderCMA() : null),
        // 2 Aug 2026 — the fmea template schema split into the two rendered
        // modes (Table J1 / J2); both re-render the same worksheet.
        fmeaFunctional: () => (typeof renderFMEA === 'function' ? renderFMEA() : null),
        fmeaPiecePart:  () => (typeof renderFMEA === 'function' ? renderFMEA() : null)
    };
    try { KIND_RENDERER[_activeTemplateKind] && KIND_RENDERER[_activeTemplateKind](); } catch(_) {}
    try { _injectCustomColumnHeaders(); } catch(_) {}
}

function rerenderAllTemplateDrivenTables() {
    // Called after load or reset so every visible table picks up the latest template state.
    try { _injectCustomColumnHeaders(); } catch(_) {}
    ['acFha','acFunc','acFcim','acReq','acAsm','sysFha','sysFunc','sysFcim','sysReq','sysAsm','pra','zsa','cma','fmeaFunctional','fmeaPiecePart'].forEach(k => {
        const prev = _activeTemplateKind;
        _activeTemplateKind = k;
        _rerenderAffectedTable();
        _activeTemplateKind = prev;
    });
}

function kebabMenu(itemsHtml) {
    return `<div class="row-actions"><button type="button" class="row-kebab" aria-label="Row actions" aria-haspopup="true" onclick="toggleRowMenu(event)">⋮</button>`
        + `<div class="row-action-menu" role="menu">${itemsHtml || ''}</div></div>`;
}

function reviewCellHtml(kind, internalId, systemId) {
    if (!kind || internalId == null) return '<td class="review-col"></td>';
    const sysId = systemId || null;
    // Artifact identity stamp — the ONLY place rows get data-artifact-kind/id, so
    // _highlightArtifactRow (golden thread / backref / palette "jump here") can find
    // the row. Before this stamp existed the highlight selector matched NOTHING —
    // the flash was dead code from birth (found 15 Aug 2026). Keep kind names in
    // step with the Review kinds; the GT navigator maps onto these.
    const artAttrs = ' data-artifact-kind="' + String(kind).replace(/"/g, '&quot;') + '"'
        + ' data-artifact-id="' + String(internalId).replace(/"/g, '&quot;') + '"'
        + (sysId ? ' data-artifact-sys="' + String(sysId).replace(/"/g, '&quot;') + '"' : '');
    let cmt = '';
    if (typeof commentTriggerHtml === 'function' && typeof Review !== 'undefined') {
        // commentTriggerHtml already gates on its own commentable-kind set.
        cmt = commentTriggerHtml({ kind, id: internalId, systemId: sysId });
    }
    const apv = APPROVABLE_KINDS.has(kind) ? _approvalControlHtml(kind, internalId, sysId) : '';
    if (!cmt && !apv) return '<td class="review-col"' + artAttrs + '></td>';
    // Consolidated into the house kebab (matches the Actions column): one ⋮
    // trigger, the comment + approval + sign controls live in the dropdown.
    // A green dot on the trigger keeps sign-off state visible at a glance.
    let dot = '';
    try {
        // 2 Sep 2026 — this was calling Review.isApproved(kind, id, sysId) POSITIONALLY.
        // Review.isApproved takes ONE argument, a target object (arity 1), so the call
        // returned false for every kind on every row and the green dot has never drawn
        // since it was written. Found by approving an HF row in prod and watching the
        // store say approved while the closed kebab stayed blank. _approvalControlHtml a
        // few lines down had the object form right all along.
        if (APPROVABLE_KINDS.has(kind) && typeof Review !== 'undefined' && typeof Review.isApproved === 'function' && Review.isApproved({ kind: kind, id: internalId, systemId: sysId })) {
            dot = '<span style="position:absolute; top:1px; right:1px; width:6px; height:6px; border-radius:50%; background:#1D9E75;"></span>';
        }
    } catch (_) {}
    return '<td class="review-col"' + artAttrs + '><div class="row-actions">' +
        '<button type="button" class="row-kebab" style="position:relative;" aria-label="Review actions" aria-haspopup="true" onclick="toggleRowMenu(event)">⋮' + dot + '</button>' +
        '<div class="row-action-menu" role="menu">' +
        '<span class="review-cell-group" style="display:flex; align-items:center; gap:8px; padding:6px 10px;">' + cmt + apv + '</span>' +
        '</div></div></td>';
}

function _injectReviewColumnHeaders() {
    _REVIEW_COL_TBODY_IDS.forEach(id => {
        const tbody = document.getElementById(id);
        if (!tbody) return;
        const table = tbody.closest('table');
        if (!table) return;
        const thead = table.querySelector('thead');
        if (!thead) return;
        // Find the header row — usually the first <tr> in thead.
        const tr = thead.querySelector('tr');
        if (!tr) return;
        // Don't double-inject — skip if a Review column already exists, whether a prior
        // injection (th.review-col) or a static header (th[data-tmpl-review], e.g. FHA).
        if (tr.querySelector('th.review-col, th[data-tmpl-review]')) return;
        const th = document.createElement('th');
        th.className = 'review-col';
        th.textContent = 'Review';
        tr.appendChild(th);
    });
}

async function _refreshSaveFolderMenu() {
    const choose = document.getElementById('menu-save-folder-choose');
    const clear  = document.getElementById('menu-save-folder-clear');
    if (!choose || !clear || typeof SaveFs === 'undefined') return;
    const name = await SaveFs.getDefaultDirName();
    if (name) {
        choose.innerHTML = '📁  Save folder: <strong>' + esc(name) + '</strong> — Change…';
        clear.style.display = '';
    } else {
        const reason = SaveFs.isSupported() ? '' : ' (unavailable)';
        choose.innerHTML = '📁  Choose save folder…' + reason;
        clear.style.display = 'none';
    }
}

function initNewProjectState() {
    // 20 Aug 2026 — DERIVED. Every project store, its reset value, and its window mirror
    // now come from project_stores.js. This function used to clear ~25 stores by hand and
    // the list went stale twice with real cost: flightPhasesData was missed until 1 Aug
    // 2026 (a year of exposure ratios computed against the previous aircraft's mission
    // length), and itemsData / projectBaselines / autoReqTemplateOverrides /
    // projectReportEdits were missed until today — a blank project came up on production
    // holding 16 LRUs from the Aeolus demo.
    //
    // What stays here is everything that is NOT a project store: the numbering engine,
    // the UI cursor, and the panel that must be closed.
    if (typeof window !== 'undefined' && window.SLStores) {
        window.SLStores.reset();
    } else {
        initNewProjectStateLegacy();   // project_stores.js failed to load — clear SOMETHING
    }
    _slResetNumbering();               // fresh numbering scheme + empty counter store
    if (typeof _refreshProjectNameUI === 'function') _refreshProjectNameUI();
    selectedNodeData = null;
    try { document.getElementById('node-config-panel').style.display = 'none'; } catch (_) {}
    if (typeof _phasesProfileId !== 'undefined') { try { _phasesProfileId = ''; } catch (_) {} }
}

// The pre-20-Aug body, kept ONLY as a fallback for a failed project_stores.js load. The
// wall asserts it still covers every declared store, so it cannot rot into a different
// answer than the declaration gives.
function initNewProjectStateLegacy() {
    acFunctionsData = []; acFcimData = []; acExtractedFCs = []; acFhaData = []; acReqData = []; acAssumptionsData = []; acAsmCounter = 1; 
    systemsData = []; activeSystemId = null;
    praData = []; zsaData = []; cmaData = []; routingData = []; resourcesData = []; projectSourceDocs = []; aiAssumptions = []; fmeaData = []; fmeaCounter = 1; internalIdCounter = 1; typeCounters = { gate: 1, basic: 1, undeveloped: 1, conditioning: 1, house: 1 };
    _slResetNumbering(); // fresh numbering scheme + empty counter store for a new project
    reviewCommentsData = []; reviewCounter = 1;
    reviewApprovalsData = [];
    // ---------------------------------------------------------------------------------
    // 20 Aug 2026 — FOUR stores that _snapshotProject() saves were never cleared here, so
    // a brand-new project inherited them from whatever was open before. Confirmed live on
    // production: a blank project came up carrying 16 itemsData rows from the Aeolus demo
    // (LRU-FCS-01 "Elevator servo channel A" and friends), offered in the item-failure
    // declaration picker under another programme's part numbers.
    //
    // The invariant this function has to satisfy is simply: CLEAR EVERY KEY
    // _snapshotProject() CAPTURES. It is not a judgement call and it should not be
    // maintained by eye — tests/regression_new_project_reset diffs the two lists and fails
    // when they drift, which is what would have caught flightPhasesData in 2025 and these
    // four this year. See the flightPhasesData note below: same bug, same cause, and it
    // took a year of wrong exposure denominators to notice.
    itemsData = [];
    projectBaselines = [];
    autoReqTemplateOverrides = {};
    try { if (typeof window !== 'undefined') window.autoReqTemplateOverrides = autoReqTemplateOverrides; } catch (_) {}
    projectReportEdits = {};
    try { if (typeof window !== 'undefined') window.projectReportEdits = projectReportEdits; } catch (_) {}
    // ---------------------------------------------------------------------------------
    // Phase 54 — reset project-level template overrides on new project.
    // NOTE: projectTemplates and autoReqTemplateOverrides are DIFFERENT stores despite the
    // similar names; resetting this one was never resetting the other.
    projectTemplates = (typeof emptyTemplateOverrides === 'function') ? emptyTemplateOverrides() : {};
    window.projectTemplates = projectTemplates;
    projectName = 'Untitled Project';
    if (typeof _refreshProjectNameUI === 'function') _refreshProjectNameUI();
    // Start the fault tree blank — no top event until the user adds one via "+ Add Top Event".
    ftaPages = [{ id: 'page-' + Date.now(), name: 'Untitled Fault Tree', root: null }];
    activeFTAPageId = ftaPages[0].id; selectedNodeData = null; document.getElementById('node-config-panel').style.display = 'none';
    projectConfig = { regulation: 'Part 25', part23Class: 'IV', override: false, customLibrary: {}, piQ: 1, piE: 1, markovModels: [], libraryStandard: 'MIL-HDBK-217F', libraryEnv: 'GB', libraryQuality: 'B2', useStressPrediction: false, operatingTempC: 25, activationEnergyEv: 0.4 };
    ftaConfig = { mode: 'bottom-up', apportion: 'equal', targetP: 0.00001, linkedFhaId: '', exposureTime: 1, exposureSource: 'auto' };
    // Flight phases were NOT reset here until 1 Aug 2026. Every other store was, so
    // a new project started with the previous project's phase table — an eVTOL's
    // Hover/Transition, or a UAS profile's Launch/Task/Recovery, silently became the
    // phase vocabulary of a Part 25 project. The FHA form then offered those phases
    // and the mission duration behind every exposure ratio was the wrong aircraft's.
    // The seed is a deep copy: nominal mission + the two contingency phases.
    flightPhasesData = (typeof newDefaultPhaseTable === 'function')
        ? newDefaultPhaseTable()
        : (flightPhasesData || []);
    if (typeof _phasesProfileId !== 'undefined') { try { _phasesProfileId = ''; } catch (_) {} }
    // STPA lane starts empty on a new project.
    mlData = { constituents: [], odd: [], datasets: [], monitors: [], capture: [], captureEnabled: false, counter: 1 };
    stpaData = { cs: { controllers: [], processes: [], actions: [], feedbacks: [], others: [], precedence: [] }, dispositions: {}, causeDismissals: {}, scopeFcIds: [], meta: { mission: '', scope: '', boundary: '', abstractionLevel: '' }, losses: [], hazards: [], constraints: [], responsibilities: [], csState: 'initial', sip: {} };
}

function createNewProject() {
    // Phase 63.17 — routed through the SSPP intake wizard: the creation choices
    // (cert basis, ops parameters, methodology, starting route) ARE the initial
    // System Safety Program Plan record.
    try { openNewProjectWizard(); return; } catch (_) {}
    _createNewProjectBlank();
}
function _createNewProjectBlank() {
    // 31 Aug 2026 — a new project must not wear the OUTGOING project's cloud
    // identity. Without this detach, the first autosave after New Project
    // renamed and overwrote the previous cloud project (de27b117 was renamed
    // "g5 t3 fullsession" and its content replaced this way). Same posture as
    // the demo/sample loaders; inline fallback if cloud_sync isn't loaded.
    try {
        if (typeof window.__slCloudSyncDetach === 'function') window.__slCloudSyncDetach();
        else { _activeCloudProjectId = null; _activeCloudDocVersion = null; _dirtySinceSave = false; }
    } catch (_) {}
    initNewProjectState();
    ['ac-func-body','ac-fcim-body','ac-fha-body','ac-req-body','ac-asm-body','sys-func-body','sys-fcim-body','sys-fha-body','sys-req-body','sys-asm-body','pra-body','zsa-body','cma-body','routing-body','resources-body','fmea-body','trace-body','cutset-body'].forEach(id => { const el = document.getElementById(id); if(el) el.innerHTML = ''; });
    // BLANKING A TBODY IS NOT THE SAME AS RE-RENDERING A TAB — 1 Aug 2026.
    //
    // The list above empties 18 <tbody> elements, which is why the tables look
    // right. But modules that inject their own panel by WRAPPING a render
    // function only rebuild when that function is called, and this path called
    // none of them. fc_variants.js wraps renderACFHA to redraw #fcv-panel; on a
    // new project nothing called renderACFHA, so the panel kept showing the
    // PREVIOUS project's FC-01…FC-30. Navigating to the tab did not heal it
    // either — switchTab('ac-fha') repopulates that tab's dropdowns, not its
    // table (streaming_load.js says so in its header), so the stale list
    // survived for the whole life of the new project.
    //
    // Re-rendering instead of blanking fixes the class, not just this panel: it
    // restores the invariant every load path already keeps — a new project
    // re-renders every project-data table — which is what any future wrapper
    // module will rely on. On a blank project all of these are free; there are
    // no rows to draw.
    // By NAME, not by reference: an array literal of bare identifiers evaluates
    // every one of them before the loop's try/catch can protect anything, so a
    // single renderer that is not declared in this build would throw here and
    // take new-project creation down with it.
    ['renderACFunctions', 'renderACFCIM', 'renderACFHA', 'renderACReq', 'renderACAssumptions',
     'renderPRA', 'renderZSA', 'renderCMA', 'renderFMEA','renderFlightPhases','refreshFhaPhaseGrids'].forEach(function (name) {
        try { const fn = window[name]; if (typeof fn === 'function') fn(); } catch (_) {}
    });
    Object.keys(formConfigs).forEach(mod => cancelEdit(mod)); switchTab('dashboard'); renderFTASidebar(); updateD3();
}

// ============================================================================
// Phase 63.17 — New Project wizard = SSPP intake. Lays out every route and
// choice with its consequences, and writes the selections into projectConfig +
// the Safety Program Plan record so the SPP view is populated from day one.
// ============================================================================
// [P2 batch 5] L2271-2280 moved verbatim to bindings_modules.js
function openNewProjectWizard() {
    closeCockpitModal();
    const ov = document.createElement('div');
    ov.id = 'ckpt-modal-overlay';
    const baseOpts = _NPW_BASES.map((b, i) => '<option value="' + esc(b.v) + '"' + (i === 0 ? ' selected' : '') + '>' + esc(b.label) + ' — ' + esc(b.sub) + '</option>').join('');
    const slotRows = SPP_SLOTS.map(s =>
        '<div class="ckpt-m-row"><span title="' + esc(s.help || '') + '" style="cursor:help;border-bottom:1px dotted var(--color-text-tertiary);">' + esc(s.label) + (s.help ? ' <span style="font-size:10px;opacity:.6;">&#9432;</span>' : '') + '</span><span><select class="state-select" id="npw-slot-' + esc(s.id) + '" style="max-width:280px;">' +
        s.options.map((o, i) => '<option value="' + i + '"' + (i === s.dflt ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select></span></div>').join('');
    ov.innerHTML =
        '<div class="ckpt-modal" role="dialog" aria-modal="true" style="max-width: 820px;">' +
        '<div class="ckpt-m-head"><span class="ckpt-designation">New project</span>' +
        '<span class="ckpt-m-name">System Safety Program Plan — intake</span>' +
        '<button class="ckpt-m-close" onclick="closeCockpitModal()" aria-label="Close">×</button></div>' +
        '<div style="padding: 14px 18px; max-height: 70vh; overflow:auto;">' +
        '<div class="ckpt-m-sec">Project</div>' +
        '<input type="text" id="npw-name" placeholder="Project name (e.g., HX-1 Hydrogen Demonstrator)" style="width:100%; margin-bottom:12px;">' +
        '<div class="ckpt-m-sec">Certification basis — drives every target, DAL floor, and depth-of-analysis default</div>' +
        '<select class="state-select" id="npw-basis" style="width:100%; margin-bottom:8px;" onchange="var v=this.value; document.getElementById(\'npw-p23\').style.display = v===\'Part 23\'?\'\':\'none\'; document.getElementById(\'npw-p27\').style.display = v===\'Part 27\'?\'\':\'none\'; document.getElementById(\'npw-vtol\').style.display = v===\'sc-vtol\'?\'\':\'none\'; try{PROGRAM_PLAN.renderWizardScope(\'npw-scope\', v);}catch(_){}">' + baseOpts + '</select>' +
        '<select class="state-select" id="npw-p23" style="width:100%; margin-bottom:8px; display:none;">' +
        '<option value="I">Class I — single recip ≤6,000 lb</option><option value="II">Class II — multi recip / single turboprop</option><option value="III">Class III — turbojets, ≥6,000 lb</option><option value="IV" selected>Class IV — commuter</option></select>' +
        '<select class="state-select" id="npw-p27" style="width:100%; margin-bottom:8px; display:none;">' +
        '<option value="I">Class I — reciprocating, ≤5 occupants</option><option value="II">Class II — single turbine, ≤5 occupants, ≤4,000 lb</option><option value="III" selected>Class III — single turbine, ≥6 occupants, 4,001–7,000 lb</option><option value="IV">Class IV — twin turbine</option></select>' +
        '<select class="state-select" id="npw-vtol" style="width:100%; margin-bottom:8px; display:none;">' +
        '<option value="Basic 1">Category Basic 1 — 0–1 passengers (controlled emergency landing)</option><option value="Basic 2">Category Basic 2 — 2–6 passengers</option><option value="Basic 3">Category Basic 3 — 7–9 passengers</option><option value="Enhanced" selected>Category Enhanced — CSFL required, congested-area / commercial pax</option></select>' +
        '<div class="ckpt-m-row"><span>Certification mission duration (h) — sets t_mission for phase normalization; use the shortest binding mission</span>' +
        '<span><input type="number" id="npw-mission" step="0.1" min="0" placeholder="e.g., 1.5" style="width:110px;"></span></div>' +
        '<div class="ckpt-m-sec" style="margin-top:14px;">Methodology — fixed objectives, your methods (changeable later in the Safety Program Plan)</div>' +
        slotRows +
        '<div class="ckpt-m-sec" style="margin-top:14px;">Program scope — what your basis expects, preselected. THE PLAN DRIVES THE NAV.</div>' +
        '<div id="npw-scope"></div>' +
        '<div class="ckpt-m-sec" style="margin-top:14px;">Starting route</div>' +
        '<div class="ckpt-m-row" style="border:none;"><label style="display:flex; gap:8px; cursor:pointer;"><input type="radio" name="npw-route" value="blank" checked> <span><b>Blank program</b> — define aircraft functions, run the AFHA, and let the PASA workspace build outward. The full ARP4761A spine from scratch.</span></label></div>' +
        '<div class="ckpt-m-row" style="border:none;"><label style="display:flex; gap:8px; cursor:pointer;"><input type="radio" name="npw-route" value="sample"> <span><b>Sample project</b> — a pre-built program with FHA, trees, CCA and requirements populated. Best for exploring the workflow.</span></label></div>' +
        '<div class="ckpt-m-row" style="border:none;"><label style="display:flex; gap:8px; cursor:pointer;"><input type="radio" name="npw-route" value="import"> <span><b>Import</b> — bring existing work: Excel/CSV worksheets, a SysML (XMI) model, or Jama Connect requirements. Lands you in the import dialogs.</span></label></div>' +
        '</div>' +
        '<div class="ckpt-m-foot"><span class="ckpt-m-outputs">Selections are recorded as the initial SSPP — reviewable and changeable under Define → Program Planning</span>' +
        '<span class="ckpt-m-actions"><button class="ckpt-m-btn" onclick="closeCockpitModal()">Cancel</button>' +
        '<button class="ckpt-m-btn ckpt-m-btn-primary" onclick="npwCreate()">Create project</button></span></div></div>';
    ov.addEventListener('click', e => { if (e.target === ov) closeCockpitModal(); });
    document.addEventListener('keydown', _ckptEsc, true);
    document.body.appendChild(ov);
    // Program-scope checklist rides the chosen basis from the first paint.
    try { if (typeof PROGRAM_PLAN !== 'undefined') PROGRAM_PLAN.renderWizardScope('npw-scope', (document.getElementById('npw-basis') || {}).value || 'Part 25'); } catch (_) {}
}

// 2 Sep 2026 (Waqas: "require the user to specify a save location") — the New Project
// wizard now binds a durable save location at creation, where a real user gesture exists
// (the Create-project click). A bound folder means every committed change also writes the
// per-project .sl file via _writeAutosaveToDisk — the project is no longer hostage to the
// shared, un-keyed browser slot. async so the picker can be awaited; the picker is the
// FIRST await after the synchronous setup, so the click's user activation still covers it.
async function npwCreate() {
    const name = (document.getElementById('npw-name') || {}).value || '';
    const basis = (document.getElementById('npw-basis') || {}).value || 'Part 25';
    const p23 = (document.getElementById('npw-p23') || {}).value || 'IV';
    const p27 = (document.getElementById('npw-p27') || {}).value || 'III';
    const vtol = (document.getElementById('npw-vtol') || {}).value || 'Enhanced';
    const mission = parseFloat((document.getElementById('npw-mission') || {}).value) || 0;
    const route = (document.querySelector('input[name="npw-route"]:checked') || {}).value || 'blank';
    const slots = {};
    SPP_SLOTS.forEach(s => { const el = document.getElementById('npw-slot-' + s.id); slots[s.id] = el ? (parseInt(el.value) || 0) : s.dflt; });
    // Capture the program-scope checklist BEFORE the modal (and its boxes) go away.
    const laneSel = {};
    document.querySelectorAll('input.npw-lane[data-lane]').forEach(b => { laneSel[b.dataset.lane] = !!b.checked; });
    closeCockpitModal();
    _createNewProjectBlank();
    if (name.trim()) { try { projectName = name.trim(); const chip = document.querySelector('#project-name-chip .project-name-chip-label'); if (chip) chip.textContent = projectName; } catch (_) {} }
    // 31 Aug 2026 — the wizard's basis id for eVTOL is 'sc-vtol'; the engine's key is
    // 'SC-VTOL'. Store the canonical form so getSafetyTarget() never falls back to Part 25.
    projectConfig.regulation = (basis === 'sc-vtol') ? 'SC-VTOL' : basis;
    if (basis === 'Part 23') projectConfig.part23Class = p23;
    if (basis === 'Part 27') projectConfig.part27Class = p27;
    if (basis === 'sc-vtol') projectConfig.scvtolCategory = vtol;
    if (mission > 0) projectConfig.missionDuration = mission;
    _sppStore().slots = slots;
    projectConfig.safetyProgramPlan.intake = { at: new Date().toISOString(), basis, route };
    // THE PLAN DRIVES THE NAV — scope from the wizard's checklist (falls back
    // to pure basis defaults when the checklist didn't render). New project =
    // no data, so every deselection here is free and unsigned.
    try {
        if (typeof PROGRAM_PLAN !== 'undefined') {
            if (Object.keys(laneSel).length) PROGRAM_PLAN.applyWizardScope(basis, laneSel);
            else PROGRAM_PLAN.initScope(basis);
        }
    } catch (_) {}
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    if (route === 'sample') { try { loadSampleProject(); } catch (_) {} }
    else if (route === 'import') {
        switchTab('ac-func');
        if (typeof showToast === 'function') showToast('Import route: use Data Actions ▾ → Import from Excel/CSV on any worksheet, or Project ▾ → Import SysML / Jama.', 'info', 7000);
    }
    if (typeof showToast === 'function') showToast('Project created — SSPP recorded (' + basis + '). Review it under Define → Program Planning.', 'success', 5000);
    // REQUIRE A SAVE LOCATION — last, so the project already exists and the picker is the
    // sole await under the click's activation.
    try { await _requireSaveLocation(); } catch (_) {}
}

// Bind a durable per-project save folder on browsers that support it. Best-effort and
// honest: on Safari/Firefox (no persistent handle) it defers to IndexedDB + cloud silently;
// if the user cancels the picker it does not block them out of their own project, it warns
// plainly that the project is browser-only until they choose one. A folder already bound is
// reused — we don't re-prompt every New Project.
async function _requireSaveLocation() {
    try {
        if (typeof SaveFs === 'undefined' || !SaveFs.isSupported || !SaveFs.isSupported()) return;
        // #2Sep2026 — showDirectoryPicker needs the click's transient user
        // activation, and ANY await before it can burn that activation, so the
        // picker must be the FIRST await. Read the already-bound folder from the
        // SYNCHRONOUS localStorage hint instead of awaiting getDefaultDirName()
        // (an IndexedDB read that was the activation killer).
        var existing = ''; try { existing = localStorage.getItem('safetyLab.saveDir.name') || ''; } catch (_) {}
        if (existing) { try { scheduleAutosave(); } catch (_) {} return; }   // reuse the bound folder
        var handle = await SaveFs.chooseDefaultDir();
        if (handle) { try { scheduleAutosave(); } catch (_) {} }             // write the first .sl now
        else if (typeof showToast === 'function') {
            showToast('No save folder chosen — this project is kept in your browser only and can be lost if browser data is cleared. Set one any time from Save \u25b8 Save Folder.', 'warning', 7000);
        }
    } catch (_) {}
}

function _safeFileName(s, fallback) {
    const cleaned = String(s || '').trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '');
    return cleaned || (fallback || 'Untitled');
}

// Phase 70 (desktop) — single source of truth for the full project export payload.
// Reused by saveProject() (browser download / File System Access) and by the Electron
// desktop bridge (window.__slabGetProjectJSON → native .slab save). Edit the payload here only.
function _slabBuildProjectExport() {
    const _betaBuild = {
        buildId: typeof BETA_BUILD_ID !== 'undefined' ? BETA_BUILD_ID : 'unknown',
        testerLabel: typeof BETA_TESTER_LABEL !== 'undefined' ? BETA_TESTER_LABEL : 'unknown',
        exportedAt: new Date().toISOString(),
        appVersion: 'Safety Lab Aero beta'
    };
    return { projectName, _betaBuild, acFunctionsData, acFcimData, acExtractedFCs, acFhaData, acReqData, acAssumptionsData, acAsmCounter, systemsData, activeSystemId, praData, zsaData, cmaData, routingData, resourcesData, projectSourceDocs: _slabSerializeSourceDocs(), aiAssumptions, fmeaData, fmeaCounter, itemsData, flightPhasesData, stpaData, mlData, ftaPages, activeFTAPageId, internalIdCounter, typeCounters, ftaConfig, projectConfig, projectBaselines, reviewCommentsData, reviewCounter, reviewApprovalsData, projectTemplates,
        // IDs & Numbering — active scheme + immutable counter store travel with the project
        numberingScheme: slNumberingScheme, numberingStore: slNumberingStore,
        // Phase 56.9 — Per-project report-section edits
        autoReqTemplateOverrides, projectReportEdits };
}

function renderProcessStrip() {
    const host = document.getElementById('dash-process-strip');
    if (!host) return;
    let phases;
    try { phases = computePhaseStatus(); } catch (e) { console.warn('computePhaseStatus failed:', e); host.innerHTML = ''; return; }
    try { if (typeof applyCockpitStatuses === 'function') applyCockpitStatuses(phases); } catch (e) { console.warn('applyCockpitStatuses:', e); }

    function chip(status) {
        return '<span class="ckpt-chip ckpt-chip-' + esc(status) + '">' + esc(CKPT_STATUS_LABEL[status] || status) + '</span>';
    }
    function card(p, compact) {
        const pct = Math.round(Math.max(0, Math.min(1, p.ratio || 0)) * 100);
        return '<div class="ckpt-card' + (compact ? ' ckpt-compact' : '') + '" tabindex="0" role="button"' +
            ' onclick="openCockpitModal(\'' + esc(p.label) + '\')"' +
            ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault(); this.click();}"' +
            ' title="' + esc(p.desc) + '">' +
            '<div class="ckpt-head"><span class="ckpt-designation">' + esc(p.label) + '</span>' + chip(p.status) + '</div>' +
            '<div class="ckpt-name">' + esc(p.name) + '</div>' +
            '<div class="ckpt-progress">' + esc(p.progress) + '</div>' +
            '<div class="ckpt-bar"><div class="ckpt-bar-fill st-' + esc(p.status) + '" style="width:' + pct + '%"></div></div>' +
            '</div>';
    }

    const rows = [
        { label: 'Aircraft development', pair: ['AFHA', 'PASA'] },
        { label: 'System development',   pair: ['SFHA', 'PSSA'] },
        { label: 'Verification',         pair: ['SSA', 'ASA'] }
    ];
    let html = '';
    rows.forEach(r => {
        html += '<div class="ckpt-row-label">' + esc(r.label) + '</div>';
        html += '<div class="ckpt-row">' + card(phases[r.pair[0]]) +
                '<div class="ckpt-arrow" aria-hidden="true">→</div>' + card(phases[r.pair[1]]) + '</div>';
    });
    html += '<div class="ckpt-row-label">Common cause analysis — parallel track</div>';
    html += '<div class="ckpt-cca">' + ['PRA', 'ZSA', 'CMA'].map(id => card(phases[id], true)).join('') + '</div>';
    host.innerHTML = html;
}

function renderPostureMetrics() {
    const host = document.getElementById('dash-posture');
    if (!host) return;
    let phases = null;
    try { phases = applyCockpitStatuses(computePhaseStatus()); } catch (_) {}
    const spine = ['AFHA', 'PASA', 'SFHA', 'PSSA', 'SSA', 'ASA'];
    let ready = 0, inwork = 0, handed = 0, reopened = 0;
    if (phases) spine.forEach(k => {
        const s = phases[k] && phases[k].status;
        if (s === 'complete') ready++; else if (s === 'in-progress') inwork++;
        else if (s === 'handed-off') handed++; else if (s === 'reopened') reopened++;
    });
    const allSysFha = (systemsData || []).flatMap(s => s.fha || []);
    const crit = [...(acFhaData || []), ...allSysFha].filter(f => f.severity === 'Catastrophic' || f.severity === 'Hazardous').length;
    const allAsm = [...(acAssumptionsData || []), ...(systemsData || []).flatMap(s => s.asm || [])];
    const openAsm = allAsm.filter(a => a.state === 'Proposed').length;
    const allReq = [...(acReqData || []), ...(systemsData || []).flatMap(s => s.req || [])];
    const comp = allReq.filter(r => r.compromised).length;

    function tile(label, value, sub, tone) {
        return '<div class="ckpt-tile' + (tone ? ' ckpt-tile-' + tone : '') + '">' +
            '<div class="ckpt-tile-label">' + esc(label) + '</div>' +
            '<div class="ckpt-tile-value">' + esc(String(value)) + '</div>' +
            '<div class="ckpt-tile-sub">' + esc(sub) + '</div></div>';
    }
    const notStarted = 6 - ready - inwork - handed - reopened;
    host.innerHTML =
        tile('Assessments', handed + ' baselined',
             (reopened ? reopened + ' reopened · ' : '') + ready + ' ready · ' + inwork + ' in work · ' + notStarted + ' not started',
             reopened ? 'danger' : (handed === 6 ? 'ok' : '')) +
        tile('Cat / Haz failure conditions', crit, 'aircraft + systems') +
        tile('Open assumptions', openAsm, openAsm ? 'proposed — awaiting validation' : 'all dispositioned', openAsm ? 'warn' : 'ok') +
        tile('Compromised independence', comp, comp ? 'requirements need rework' : 'none — clean', comp ? 'danger' : 'ok');
}

function renderReqVvStrip() {
    const host = document.getElementById('dash-req-vv');
    if (!host) return;
    const allReq = [...(acReqData || []), ...(systemsData || []).flatMap(s => s.req || [])];
    let verified = 0, validated = 0, inwork = 0, untouched = 0;
    allReq.forEach(r => {
        const vs = String(r.verStatus || '').trim();
        const va = String(r.valStatus || '').trim();
        if (vs === 'Passed') verified++;
        else if (va === 'Passed') validated++;
        else if (vs || va || r.verMethod || r.valMethod) inwork++;
        else untouched++;
    });
    const total = allReq.length;
    if (!total) { host.innerHTML = ''; return; }
    const pct = n => Math.round((n / total) * 1000) / 10;
    host.innerHTML =
        '<div class="ckpt-vv" role="button" tabindex="0" onclick="switchTab(\'vv-status\')" title="Open the V&V status roll-up">' +
        '<div class="ckpt-vv-head"><span class="ckpt-designation">Requirements — V&amp;V posture</span>' +
        '<span class="ckpt-vv-total">' + total + ' total</span></div>' +
        '<div class="ckpt-vv-bar">' +
        '<div class="ckpt-vv-seg vv-verified" style="width:' + pct(verified) + '%"></div>' +
        '<div class="ckpt-vv-seg vv-validated" style="width:' + pct(validated) + '%"></div>' +
        '<div class="ckpt-vv-seg vv-inwork" style="width:' + pct(inwork) + '%"></div>' +
        '<div class="ckpt-vv-seg vv-untouched" style="width:' + pct(untouched) + '%"></div>' +
        '</div>' +
        '<div class="ckpt-vv-legend">' + verified + ' verified · ' + validated + ' validated · ' +
        inwork + ' in work · ' + untouched + ' untouched</div></div>';
}

function enterPhase(phaseId) {
    let phases;
    try { phases = computePhaseStatus(); } catch(_) { return; }
    const p = phases[phaseId];
    if (!p) return;
    if (p.target && p.target.tab && typeof switchTab === 'function') switchTab(p.target.tab);
    if (typeof showToast === 'function') showToast(p.label + ' — ' + p.name + ': ' + p.progress, 'info', 3200);
}

function _ckptAttestKey(key, itemId) { return key + ':' + itemId; }

// Evaluate an assessment's checklist. Returns { items:[…], ready } where ready means
// every auto item passes and every attest item is signed (planned items don't block).
function evalCkptChecklist(key, phases, ctx) {
    const defs = CKPT_CHECKLISTS[key] || [];
    const c = ctx || _ckptEvalCtx(phases);
    const att = (projectConfig && projectConfig.ckptAttest) || {};
    const tlr = (projectConfig && projectConfig.ckptTailored) || {};
    const items = defs.map(d => {
        // Phase 63.16 (D8) — tailoring: any checklist item can be opted out with a
        // signed rationale (Safety Program Plan). Tailored items satisfy the gate
        // but stay permanently visible with their rationale — opting out is an
        // act, not an absence.
        const t = tlr[key + ':' + d.id];
        if (t) return { id: d.id, ref: d.ref, label: d.label, state: 'tailored', detail: 'tailored out · ' + (t.by || '') + ' — ' + (t.rationale || '') };
        if (d.kind === 'planned') return { id: d.id, ref: d.ref, label: d.label, state: 'planned', detail: d.tag || 'roadmap' };
        if (d.kind === 'attest') {
            const a = att[_ckptAttestKey(key, d.id)];
            return a ? { id: d.id, ref: d.ref, label: d.label, state: 'attested', detail: 'signed · ' + (a.by || '') }
                     : { id: d.id, ref: d.ref, label: d.label, state: 'open', detail: 'attest' };
        }
        let r;
        try { r = d.eval(c) || { pass: false, detail: 'n/a' }; } catch (e) { r = { pass: false, detail: 'eval error' }; }
        return { id: d.id, ref: d.ref, label: d.label, state: r.pass ? 'pass' : 'fail', detail: r.detail || '' };
    });
    const ready = items.length > 0 && items.every(i => i.state === 'pass' || i.state === 'attested' || i.state === 'planned' || i.state === 'tailored');
    return { items, ready };
}

function applyCockpitStatuses(phases) {
    const H = (projectConfig && projectConfig.ckptHandoffs) || {};
    const ctx = _ckptEvalCtx(phases);
    Object.keys(CKPT_CHECKLISTS).forEach(key => {
        if (!phases[key]) return;
        const h = H[key];
        if (h) {
            phases[key].status = (_ckptFingerprint(key) === h.fp) ? 'handed-off' : 'reopened';
            phases[key].handoff = h;
            if (phases[key].status === 'handed-off') { phases[key].ratio = 1; return; }
        }
        const cl = evalCkptChecklist(key, phases, ctx);
        phases[key].checklist = cl;
        if (!h && cl.ready) phases[key].status = 'complete';
    });
    return phases;
}

async function ckptHandOff(key) {
    let phases;
    try { phases = applyCockpitStatuses(computePhaseStatus()); } catch (_) { return; }
    const p = phases[key];
    if (!p) return;
    const cl = p.checklist || evalCkptChecklist(key, phases);
    if (!cl.ready) { if (typeof showToast === 'function') showToast('Completion checklist not satisfied — resolve open items before handing off.', 'warning', 3500); return; }
    const by = (await slPrompt('Hand off ' + key + ' — sign with your name:', _signoffReviewerName() || '')) || '';
    if (!by.trim()) return;
    const snapshot = { acFunctionsData, acFcimData, acFhaData, acReqData, acAssumptionsData, systemsData, praData, zsaData, cmaData, fmeaData, ftaPages, ftaConfig, projectConfig, flightPhasesData };
    const snapStr = JSON.stringify(snapshot);
    const hash = await _sha256Hex(snapStr);
    const baseline = { id: 'bl-' + Date.now(), name: key + ' hand-off', milestone: key + ' hand-off', signedBy: by, notes: 'Cockpit hand-off — completion checklist satisfied.', timestamp: new Date().toISOString(), hash, sizeBytes: snapStr.length, snapshot };
    projectBaselines.push(baseline);
    if (!projectConfig.ckptHandoffs) projectConfig.ckptHandoffs = {};
    projectConfig.ckptHandoffs[key] = { at: baseline.timestamp, by, fp: _ckptFingerprint(key), baselineId: baseline.id, hash };
    if (typeof showToast === 'function') showToast(key + ' baselined. Baseline ' + hash.slice(0, 12) + '… captured; downstream trays stamped fresh.', 'success', 4000);
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    try { updateDashboard(); } catch (_) {}
    _ckptRefresh(key);
}

async function ckptAttest(key, itemId) {
    const k = _ckptAttestKey(key, itemId);
    if (!projectConfig.ckptAttest) projectConfig.ckptAttest = {};
    const existing = projectConfig.ckptAttest[k];
    if (existing) {
        const yes = await (typeof slConfirm === 'function' ? slConfirm('Clear attestation signed by ' + (existing.by || 'unknown') + '?') : Promise.resolve(confirm('Clear attestation?')));
        if (yes) delete projectConfig.ckptAttest[k];
    } else {
        const by = (await slPrompt('Attest — sign with your name:', _signoffReviewerName() || '')) || '';
        if (!by.trim()) return;
        projectConfig.ckptAttest[k] = { by: by.trim(), at: new Date().toISOString() };
    }
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    try { updateDashboard(); } catch (_) {}
    _ckptRefresh(key);
}

function ccmrWearoutList() {
    const rows = [];
    const lib = (typeof COMPONENT_LIBRARY !== 'undefined' && COMPONENT_LIBRARY) || {};
    const mechRe = /mech|nswc|bearing|pump|valve|actuator|gear|motor|hinge|spring|seal/i;
    (ftaPages || []).forEach(page => {
        if (!page || !page.root || !(page.verifies || page.mode === 'bottom-up')) return;
        const sysName = page.systemId ? (((systemsData || []).find(s => s.id === page.systemId) || {}).name || '') : 'Aircraft';
        (function walk(n, seen) {
            if (!n || seen.has(n.id)) return;
            seen.add(n.id);
            if (n.type !== 'gate' && n.libraryKey) {
                const e = lib[n.libraryKey] || (typeof projectConfig !== 'undefined' && projectConfig.customLibrary && projectConfig.customLibrary[n.libraryKey]) || null;
                const hay = [n.libraryKey, e && e.name, e && e.group, e && e.category, e && e.source].filter(Boolean).join(' ');
                if (mechRe.test(hay)) rows.push({ pageName: page.name || '', system: sysName, event: n.displayId || n.name, libraryKey: n.libraryKey, group: (e && (e.group || e.category)) || '' });
            }
            (n.children || n._children || []).forEach(c => walk(c, seen));
        })(page.root, new Set());
    });
    return rows;
}

function ccmrExportCsv() {
    const rows = ccmrLatentSweep(true);
    const head = ['Event', 'Name', 'Tree', 'System', 'FC', 'Severity', 'Detection', 'Lambda_per_h', 'Current_interval_h', 'Not_to_exceed_h', 'Exceeds', 'Note'];
    const csv = [head.join(',')].concat(rows.map(r => [r.event, r.name, r.pageName, r.system, r.fcId, r.severity, r.detection, r.lambda || '', (r.interval || ''), (r.nte != null && isFinite(r.nte) ? r.nte : ''), r.exceeds ? 'YES' : '', r.note]
        .map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(','))).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'CCMR_latent_sweep_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function _fmesNorm(s) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
function _fmesSysName(id) { return id ? (((systemsData || []).find(s => s.id === id) || {}).name || String(id)) : 'Aircraft'; }

function fmesGroups() {
    const groups = new Map();
    const incomplete = [];
    (fmeaData || []).forEach(r => {
        // Piece-part rows only. The FMES here is the RATE rollup that feeds
        // fault-tree basic events (fmesAdopt sums λ over beIds) — a functional
        // (Table J1) row carries neither a rate nor a basic-event link, so a
        // functional group would be an adoption candidate that adopts nothing.
        // This filter did not exist before 5 Aug 2026 because it never needed
        // to: _pruneFmeaToPerSystem deleted every functional row before this
        // code could see one. The prune was fixed to let functional rows
        // PERSIST (Waqas's ruling — honour the ffmea lane), which made every
        // consumer's implicit "all rows are piece-part" assumption live; this
        // is the one place that assumption carried rate semantics.
        if ((r.fmeaType || 'piece-part') !== 'piece-part') return;
        const eff = _fmesNorm(r.endEffect);
        const det = _fmesNorm(r.detection);
        if (!eff || !det) { incomplete.push(r); return; }
        const sysKey = (r.scope === 'system' ? String(r.owningSystemId || '') : 'AC');
        const key = sysKey + '§' + eff + '§' + det;
        if (!groups.has(key)) groups.set(key, {
            key, systemId: r.scope === 'system' ? r.owningSystemId : '',
            system: _fmesSysName(r.scope === 'system' ? r.owningSystemId : ''),
            effect: String(r.endEffect).trim(), detection: String(r.detection).trim(),
            rows: [], sumRate: 0, beIds: new Set(), worstSev: '', modes: []
        });
        const g = groups.get(key);
        g.rows.push(r);
        g.sumRate += (parseFloat(r.rate) || 0);
        if (r.beId) g.beIds.add(String(r.beId));
        g.modes.push([r.part, r.mode].filter(Boolean).join(' — '));
        if ((_CKPT_SEV_RANK[r.severity] || 0) > (_CKPT_SEV_RANK[g.worstSev] || 0)) g.worstSev = r.severity || g.worstSev;
    });
    return { groups: [...groups.values()], incomplete };
}

function fmesAdopt(groupKey) {
    const g = fmesGroups().groups.find(x => x.key === groupKey);
    if (!g || g.beIds.size !== 1) { if (typeof showToast === 'function') showToast('Group must link exactly one basic event to adopt Σλ.', 'warning', 3000); return; }
    const beId = [...g.beIds][0];
    const hit = _fmesFindBe(beId);
    if (!hit) { if (typeof showToast === 'function') showToast('Linked basic event not found in any tree.', 'warning', 3000); return; }
    hit.node.lambda = g.sumRate;
    hit.node.inputMode = 'lambda';
    hit.node._fmesGroup = g.key;
    if (typeof showToast === 'function') showToast('λ = ' + g.sumRate.toExponential(3) + ' /h applied to ' + (hit.node.displayId || 'event') + ' from ' + g.rows.length + ' FMEA mode(s).', 'success', 3500);
    try { calculateAllProbabilities(); } catch (_) {}
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    renderFmesPage();
}

function fmesExportCsv() {
    const { groups } = fmesGroups();
    const head = ['System', 'Failure_Mode_Summary_End_Effect', 'Detection_Means', 'Summed_Rate_per_h', 'Worst_Severity', 'Contributing_Modes', 'Causal_FMEA_Rows', 'Linked_Basic_Event'];
    const csv = [head.join(',')].concat(groups.map(g => [g.system, g.effect, g.detection, g.sumRate, g.worstSev, g.modes.join(' | '), g.rows.map(r => r.fmeaId || r.internalId).join(' | '), [...g.beIds].join(' | ')]
        .map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(','))).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'FMES_derived_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// C1 (gap 5) — the REAL disposition questionnaire (ARP 4761A App M / Table M2
// discipline): the engineer walks every common-mode category and records a
// per-category verdict, mitigation prose, and a signature — replacing the old
// single-prompt enum. Existing single-prompt dispositions render unchanged.
async function ipDisposition(key) {
    if (!projectConfig.ipDispositions) projectConfig.ipDispositions = {};
    const existing = projectConfig.ipDispositions[key];
    if (existing) {
        const summary = existing.answers
            ? Object.keys(existing.answers).filter(k => existing.answers[k] !== 'independent').map(k => k + ': ' + existing.answers[k]).join(', ') || 'independent in every category'
            : (existing.susceptible || '');
        const yes = await (typeof slConfirm === 'function' ? slConfirm('Clear disposition signed by ' + (existing.by || '?') + ' (' + summary + ')?') : Promise.resolve(confirm('Clear disposition?')));
        if (yes) { delete projectConfig.ipDispositions[key]; try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {} ipLedger(true); renderIpLedgerPage(); }
        return;
    }
    _ipDispModal(key);
}
function _ipDispModal(key) {
    const old = document.getElementById('ip-disp-modal'); if (old) old.remove();
    const cats = (typeof CMA_MODE_LABELS !== 'undefined') ? CMA_MODE_LABELS : { design: 'Design', manufacturing: 'Manufacturing', installation: 'Installation', environment: 'Environment', maintenance: 'Maintenance' };
    const p = (typeof ipLedger === 'function' ? ipLedger() : []).find(x => x.key === key);
    const label = p ? p.members.map(m => m.label).join(' ⊥ ') : key;
    const opt = ['independent', 'susceptible-failure', 'susceptible-error', 'susceptible-both'];
    const optLabel = { independent: 'Independent', 'susceptible-failure': 'Susceptible — common FAILURE', 'susceptible-error': 'Susceptible — common ERROR', 'susceptible-both': 'Susceptible — BOTH' };
    const ov = document.createElement('div');
    ov.id = 'ip-disp-modal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99996;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:20px;';
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    ov.innerHTML = '<div style="background:var(--color-surface-1,#fff);color:var(--color-text-primary,#111);max-width:640px;width:100%;max-height:88vh;overflow:auto;border:1px solid var(--color-border-strong,#333);padding:16px 20px;" onclick="event.stopPropagation()">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid var(--color-text-primary,#111);padding-bottom:8px;"><b style="font-size:13.5px;">Independence disposition — App M questionnaire</b>' +
        '<button class="ckpt-m-btn" style="font-size:11px;padding:2px 10px;" onclick="document.getElementById(\'ip-disp-modal\').remove()">✕</button></div>' +
        '<div style="font-size:12px;color:var(--color-text-secondary);margin:8px 0 4px;"><b>' + esc(label) + '</b></div>' +
        '<p style="font-size:11px;color:var(--color-text-tertiary);margin:0 0 10px;">Challenge the claim in every common-mode category. Any category marked susceptible should carry a CMA row and a mitigation; the ledger cross-checks CCF declarations regardless of what you answer.</p>' +
        Object.keys(cats).map(c =>
            '<div style="display:flex;align-items:center;gap:10px;margin:4px 0;font-size:12px;"><span style="width:170px;flex-shrink:0;">' + esc(cats[c]) + '</span>' +
            '<select class="state-select" data-ipq="' + esc(c) + '" style="flex:1;font-size:11.5px;">' + opt.map(o => '<option value="' + o + '">' + optLabel[o] + '</option>').join('') + '</select></div>').join('') +
        '<div style="font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:var(--color-text-tertiary);margin:12px 0 3px;">Mitigation / justification</div>' +
        '<textarea id="ip-disp-mit" style="width:100%;min-height:60px;padding:8px 10px;font-size:12px;box-sizing:border-box;border:1px solid var(--color-border-hair);background:var(--color-surface-2);color:var(--color-text-primary);" placeholder="Separation, dissimilarity, process controls… (what keeps the members independent, or what mitigates the susceptibility)"></textarea>' +
        '<div style="display:flex;gap:8px;align-items:center;margin-top:12px;">' +
        '<input type="text" id="ip-disp-by" placeholder="Sign with your name" value="' + esc((typeof _signoffReviewerName === 'function' && _signoffReviewerName()) || '') + '" style="flex:1;padding:6px 9px;font-size:12px;">' +
        '<button class="ckpt-m-btn" style="font-size:12px;padding:6px 16px;color:#166534;font-weight:700;" onclick="ipDispSubmit(' + JSON.stringify(key).replace(/"/g, '&quot;') + ')">✓ Sign disposition</button></div></div>';
    document.body.appendChild(ov);
}
function ipDispSubmit(key) {
    const ov = document.getElementById('ip-disp-modal'); if (!ov) return;
    const by = (document.getElementById('ip-disp-by') || {}).value || '';
    if (!by.trim()) { try { showToast('A disposition needs a signature.', 'warning', 3000); } catch (_) {} return; }
    const answers = {};
    ov.querySelectorAll('select[data-ipq]').forEach(s => { answers[s.getAttribute('data-ipq')] = s.value; });
    const worst = Object.values(answers).reduce((w, v) => {
        if (v === 'susceptible-both') return 'both';
        if (v === 'susceptible-failure') return w === 'error' || w === 'both' ? 'both' : 'failure';
        if (v === 'susceptible-error') return w === 'failure' || w === 'both' ? 'both' : 'error';
        return w;
    }, 'none');
    if (!projectConfig.ipDispositions) projectConfig.ipDispositions = {};
    projectConfig.ipDispositions[key] = {
        by: by.trim(), at: new Date().toISOString(), susceptible: worst,
        answers, mitigation: ((document.getElementById('ip-disp-mit') || {}).value || '').trim(),
    };
    ov.remove();
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    ipLedger(true);
    renderIpLedgerPage();
    try { showToast('Disposition signed — worst-case susceptibility: ' + worst.toUpperCase() + '. Susceptible categories should carry CMA rows.', worst === 'none' ? 'success' : 'warning', 5000); } catch (_) {}
}

function renderIpLedgerPage() {
    const host = document.getElementById('ipledger-host');
    if (!host) return;
    const list = ipLedger(true);
    const count = st => list.filter(p => p.state === st).length;

    let html = '<div class="ckpt-posture" style="margin-top:0;">' +
        '<div class="ckpt-tile"><div class="ckpt-tile-label">Principles identified</div><div class="ckpt-tile-value">' + list.length + '</div><div class="ckpt-tile-sub">unique member-sets</div></div>' +
        '<div class="ckpt-tile"><div class="ckpt-tile-label">Evaluated or beyond</div><div class="ckpt-tile-value">' + (list.length - count('identified')) + '</div><div class="ckpt-tile-sub">dispositioned / evidenced</div></div>' +
        '<div class="ckpt-tile"><div class="ckpt-tile-label">Verified</div><div class="ckpt-tile-value">' + count('verified') + '</div><div class="ckpt-tile-sub">CMA closed + requirement</div></div>' +
        '<div class="ckpt-tile' + (count('compromised') ? ' ckpt-tile-danger' : ' ckpt-tile-ok') + '"><div class="ckpt-tile-label">Compromised</div><div class="ckpt-tile-value">' + count('compromised') + '</div><div class="ckpt-tile-sub">' + (count('compromised') ? 'claims defeated — rework' : 'no defeated claims') + '</div></div></div>';

    // App M launchers (4 Aug build): the global questionnaire at aircraft AND
    // system level (M.3.2 / M.3.3) — per-principle passes launch from each row.
    const sysOpts = (systemsData || []).map(s => '<option value="' + esc(s.id) + '">' + esc(s.name || s.id) + '</option>').join('');
    html += '<div style="display:flex; align-items:center; gap:8px; margin:6px 0 10px; flex-wrap:wrap; font-size:12px;">' +
        '<button class="ckpt-m-btn" style="font-size:11.5px; padding:3px 10px;" onclick="cmaWalkthrough(\'aircraft\',\'Aircraft-level\')" title="Global Table M1 pass at aircraft level (M.3.2)">CMA questionnaire — aircraft</button>' +
        (sysOpts ? '<span>· system level (M.3.3):</span><select id="ip-cma-sys" style="font-size:11.5px; padding:2px 4px;">' + sysOpts + '</select>' +
            '<button class="ckpt-m-btn" style="font-size:11.5px; padding:3px 10px;" onclick="cmaWalkthroughSys(document.getElementById(\'ip-cma-sys\').value)">Run</button>' : '') +
        '<span style="color: var(--color-text-tertiary);">per-principle passes (Table M2) launch from each row below</span></div>';

    if (!list.length) {
        html += '<p style="color: var(--color-text-tertiary); font-size: 13px;">No independence principles identified yet. Principles derive automatically from minimal cut sets of order ≥2 in Catastrophic/Hazardous trees, from AND/INHIBIT gates carrying DALgebra independence claims, and from bow-tie cross-side common-cause findings.</p>';
    } else {
        html += '<table class="data-table" style="width:100%; font-size:12.5px;"><thead><tr><th>Members</th><th>Claim</th><th>Sources</th><th>CMA evidence</th><th>Reqs</th><th>State</th><th>Disposition</th></tr></thead><tbody>';
        list.sort((a, b) => (a.state === 'compromised' ? -1 : 1) - (b.state === 'compromised' ? -1 : 1)).forEach(p => {
            const m = _IP_STATE_META[p.state];
            const chips = p.members.map(x => '<span class="u-mono" style="display:inline-block; border:1px solid var(--color-border-thin); padding:1px 6px; margin:1px 2px 1px 0; font-size:11px;">' + esc(x.label) + '</span>').join('');
            const claims = [...p.claims].map(c => c === 'failure' ? 'P-credit' : 'DAL-credit').join(' + ');
            const btN = p.sources.filter(s => s.type === 'bowtie').length;
            const monN = p.sources.filter(s => s.type === 'monitor').length;
            const srcs = p.sources.filter(s => s.type === 'cutset').length + ' cutsets · ' + p.sources.filter(s => s.type === 'gate').length + ' gates' + (btN ? ' · ' + btN + ' bow-tie' : '') + (monN ? ' · ' + monN + ' monitor' : '');
            // Per-principle questionnaire affordance + coverage (M.3.2.1.3); the
            // walkthrough files rows against this principle's key, and phase
            // tags feed the ASA marker.
            const w = p.walk || { devRun: false, verRun: false, devConcerns: 0, verConcerns: 0 };
            const cov = (w.devRun ? 'dev ✓' + (w.devConcerns ? ' (' + w.devConcerns + ' concern' + (w.devConcerns === 1 ? '' : 's') + ')' : '') : 'dev —') +
                        ' · ' + (w.verRun ? 'ASA ✓' + (w.verConcerns ? ' (' + w.verConcerns + ')' : '') : 'ASA —');
            const cma = (p.cma.length ? p.cma.map(c => esc(c.cmaId) + ' (' + esc(c.status) + (c.phase === 'verification' ? ' · ver' : '') + ')').join('<br>') : '—') +
                '<div style="margin-top:2px;"><button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 7px;" onclick="cmaWalkthroughIp(\'' + esc(p.key) + '\')" title="Run the tailored Table M1 questionnaire against THIS principle (M.3.2.1.3 / Table M2)">Questionnaire →</button> <span class="u-mono" style="font-size:10px; color: var(--color-text-tertiary);">' + cov + '</span></div>';
            const dispBtn = p.disposition
                ? '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 8px;" onclick="ipDisposition(\'' + esc(p.key) + '\')" title="signed ' + esc(p.disposition.at.slice(0, 10)) + '">✍ ' + esc(p.disposition.by) + ' · ' + esc(p.disposition.susceptible) + '</button>'
                : '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 8px;" onclick="ipDisposition(\'' + esc(p.key) + '\')">Sign disposition</button>';
            html += '<tr' + (p.state === 'compromised' ? ' style="background: var(--sev-cat-bg);"' : '') + '>' +
                '<td>' + chips + (p.contradiction ? '<div style="color:var(--color-danger); font-size:11px; font-weight:600;">⚠ members share a CCF group (β&gt;0)</div>' : '') +
                (p.bowtieCC ? '<div style="color:var(--color-danger); font-size:11px; font-weight:600;">⚠ mitigation barrier shares a cause cut-set element (' + esc([...new Set(p.sources.filter(s => s.type === 'bowtie').map(s => s.btId + ' · ' + s.sharedLid))].join(', ')) + ')</div>' : '') +
                (p.monitorCC ? '<div style="color:var(--color-danger); font-size:11px; font-weight:600;">⚠ monitor channel not independent of the monitored event (' + esc([...new Set(p.sources.filter(s => s.type === 'monitor').map(s => s.monitorLid + ' watches ' + s.lid))].join(', ')) + ')</div>' : '') + '</td>' +
                '<td>' + esc(claims) + '</td>' +
                '<td class="u-mono" style="font-size:11px;">' + esc(srcs) + '</td>' +
                '<td class="u-mono" style="font-size:11px;">' + cma + '</td>' +
                '<td class="u-mono" style="text-align:center;">' + p.reqs.length + '</td>' +
                '<td><span class="sla-stamp" style="color:' + m.color + ';">' + m.label + '</span>' +
                (p.asaAdvisory ? '<div style="font-size:10px; color:#B7791F; font-weight:600;" title="Verified on development-phase evidence; the M.3.2.2 as-built examination (ASA checklist pass) has not been run against this principle. Advisory only — the state stands.">⚠ development evidence only — ASA pass not run</div>' : '') + '</td>' +
                '<td>' + dispBtn + '</td></tr>';
        });
        html += '</tbody></table>';
        html += '<p class="cfg-hint" title="One record per unique member-set — every gate, cut set, and DAL reduction relying on the same claim attaches here, so a CMA finding or CCF contradiction flips them all at once.">One record per member-set · a finding flips every dependent claim. Lifecycle: Identified → Evaluated → Requirement → Verified.</p>';
    }
    host.innerHTML = html;
}

// 21 Aug 2026 (A10) — cells are FUNCTION columns ('fn:<funcId>') at Q.4-1
// granularity. A legacy SYSTEM-LEVEL column never takes a NEW review: clicking
// it refines the existing system-level review onto one of the system's
// functions (signed), or lifts it — legacy data can only shrink.
async function idpCycleCell(fcInternalId, colId) {
    const fc = (acFhaData || []).find(f => String(f.internalId) === String(fcInternalId));
    if (!fc) return;
    const store = _idpStore();
    const key = _idpCellKey(fcInternalId, colId);
    const manual = store.cells[key];
    const isFn = String(colId).indexOf('fn:') === 0;
    const funcId = isFn ? String(colId).slice(3) : null;
    const colLabel = isFn
        ? ((typeof window !== 'undefined' && window.SLFnResolve) ? SLFnResolve.label(funcId) : funcId)
        : ((((systemsData || []).find(s => s.id === colId)) || {}).name || String(colId));
    const derived = isFn ? _idpDerivedFn(fc, funcId) : _idpDerivedSysOnly(fc, colId);
    if (!isFn) {
        if (!manual) {
            if (derived) { if (typeof showToast === 'function') showToast('System-level derived fact — ' + derived.why, 'info', 5000); return; }
            if (typeof showToast === 'function') showToast('This is the system-level (legacy) column — assert on one of ' + colLabel + '\u2019s FUNCTION columns instead.', 'info', 4500);
            return;
        }
        const fns = (typeof window !== 'undefined' && window.SLFnResolve) ? SLFnResolve.functionsOf(colId) : [];
        const menu = fns.map((f, i) => (i + 1) + '. ' + (f.funcName || f.funcId)).join('\n');
        const pick = await slPrompt('System-level review on ' + colLabel + ' (' + manual.state + (manual.by ? ', ' + manual.by : '') + ').\n\nRefine it onto a FUNCTION — type its number:\n' + menu + '\n\n0 = remove this legacy review \u00b7 blank = cancel', '');
        if (pick === null || String(pick).trim() === '') return;
        const n = parseInt(pick, 10);
        if (n === 0) { delete store.cells[key]; }
        else if (n >= 1 && n <= fns.length) {
            const by = (await slPrompt('Sign the refinement (moves this ' + manual.state + ' review to ' + (fns[n - 1].funcName || fns[n - 1].funcId) + '):', manual.by || _signoffReviewerName() || '')) || '';
            if (!by.trim()) return;
            store.cells[_idpCellKey(fcInternalId, 'fn:' + fns[n - 1].funcId)] = { state: manual.state, by: by.trim(), at: new Date().toISOString(), note: 'refined from system-level review' + (manual.note ? ' \u2014 ' + manual.note : '') };
            delete store.cells[key];
        } else { return; }
        try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
        renderInterdepPage();
        return;
    }
    if (!manual) {
        if (derived) { if (typeof showToast === 'function') showToast('Derived contribution — ' + derived.why + '. Derivations are facts; adjust the trace/resource data to change them.', 'info', 4000); return; }
        const by = (await slPrompt('Assert: ' + colLabel + ' contributes to ' + fc.fcId + ' (normal op or malfunction). Sign with your name:', _signoffReviewerName() || '')) || '';
        if (!by.trim()) return;
        store.cells[key] = { state: 'asserted', by: by.trim(), at: new Date().toISOString() };
    } else if (manual.state === 'proposed') {
        // D1 (gap 4) — dispositioning an AI proposal. The signature is the review;
        // the proposal itself never decides anything.
        const dirTxt = (manual.dir === 'clear') ? 'NO contribution' : 'a contribution';
        const by = (await slPrompt('AI proposed ' + dirTxt + ' of ' + colLabel + ' to ' + fc.fcId + ' — "' + (manual.why || '') + '".\n\nSign to ACCEPT as ' + (manual.dir === 'clear' ? 'CLEARED (reviewed, none)' : 'ASSERTED (contributes)') + ' — or leave blank, then click again to dismiss the proposal:', _signoffReviewerName() || '')) || '';
        if (by.trim()) {
            store.cells[key] = { state: manual.dir === 'clear' ? 'cleared' : 'asserted', by: by.trim(), at: new Date().toISOString(), note: 'AI-proposed, engineer-accepted: ' + (manual.why || '') };
        } else {
            delete store.cells[key];   // dismissed — back to unreviewed
            if (typeof showToast === 'function') showToast('Proposal dismissed — cell is unreviewed again.', 'info', 2500);
        }
    } else if (manual.state === 'asserted') {
        const by = (await slPrompt('Clear: reviewed, no contribution of ' + colLabel + ' to ' + fc.fcId + '. Sign with your name:', manual.by || _signoffReviewerName() || '')) || '';
        if (!by.trim()) return;
        store.cells[key] = { state: 'cleared', by: by.trim(), at: new Date().toISOString() };
    } else {
        delete store.cells[key];
    }
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    renderInterdepPage();
}

// 21 Aug 2026 (A10) — declare WHICH of a provider system's functions provides a
// resource (resource system functions — chain step 5, Q.4-2 granularity). Until
// declared, the resource stays a coarse system-level fact in the tables.
async function idpDeclareResProviderFn(resId, sysId) {
    const r = (resourcesData || []).find(x => String(x.internalId || x.resId) === String(resId));
    const s = (systemsData || []).find(x => x.id === sysId);
    if (!r || !s) return;
    const fns = (s.functions || []).filter(f => f && f.funcId);
    if (!fns.length) { if (typeof showToast === 'function') showToast('Declare functions on ' + (s.name || s.id) + ' first.', 'warning', 3500); return; }
    if (!Array.isArray(r.providedByFunctions)) r.providedByFunctions = [];
    const menu = fns.map((f, i) => (i + 1) + '. ' + (f.funcName || f.funcId) + (r.providedByFunctions.indexOf(f.funcId) !== -1 ? '  \u2713' : '')).join('\n');
    const pick = await slPrompt('Which of ' + (s.name || s.id) + '\u2019s functions PROVIDES ' + (r.name || r.resId) + '?\n\nType a number to toggle:\n' + menu + '\n\nblank = done', '');
    if (pick === null || String(pick).trim() === '') { try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {} renderInterdepPage(); return; }
    const n = parseInt(pick, 10);
    if (n >= 1 && n <= fns.length) {
        const fid = fns[n - 1].funcId;
        const at = r.providedByFunctions.indexOf(fid);
        if (at === -1) r.providedByFunctions.push(fid); else r.providedByFunctions.splice(at, 1);
    }
    return idpDeclareResProviderFn(resId, sysId);
}

async function craEditCell(fcId, resKey, sysId) {
    const store = _idpStore();
    const key = String(fcId) + '§' + String(resKey) + '§' + String(sysId);
    const cur = store.cra[key] || '';
    const txt = await slPrompt('Effect of this resource loss/malfunction on this system (blank to clear):', cur);
    if (txt === null) return;
    if (String(txt).trim()) store.cra[key] = String(txt).trim(); else delete store.cra[key];
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    renderInterdepPage();
}

function _resFnConsumers(r) {
    const set = new Set();
    (r.consumedBy || []).forEach(subId => _idpSystemsImplementing(subId).forEach(id => set.add(id)));
    return set;
}
function idpCycleResCell(resId, sysId) {
    const r = (resourcesData || []).find(x => String(x.internalId || x.resId) === String(resId));
    const s = (systemsData || []).find(x => x.id === sysId);
    if (!r || !s) return;
    if (!Array.isArray(r.providedBy)) r.providedBy = [];
    if (!Array.isArray(r.consumedBySystems)) r.consumedBySystems = [];
    const fnDerived = _resFnConsumers(r).has(sysId);
    const isP = r.providedBy.indexOf(sysId) !== -1;
    const isC = r.consumedBySystems.indexOf(sysId) !== -1;
    const canProvide = s.role === 'resource' || s.role === 'both';
    const setP = v => { const i = r.providedBy.indexOf(sysId); if (v && i === -1) r.providedBy.push(sysId); if (!v && i !== -1) r.providedBy.splice(i, 1); };
    const setC = v => { const i = r.consumedBySystems.indexOf(sysId); if (v && i === -1) r.consumedBySystems.push(sysId); if (!v && i !== -1) r.consumedBySystems.splice(i, 1); };
    if (canProvide) {
        if (!isP && !isC) { setP(true); }
        else if (isP && !isC) { setP(false); setC(true); }
        else if (!isP && isC) { setP(true); }
        else { setP(false); setC(false); }
    } else {
        if (isC) setC(false); else setC(true);
        if (!isC && fnDerived && typeof showToast === 'function') showToast('Still consumes via traced functions (' + (r.consumedBy || []).join(', ') + ') — adjust the function links to remove that.', 'info', 3500);
    }
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    renderInterdepPage();
}

async function idpQuickAddResource() {
    const name = (await slPrompt('New resource name (e.g., "28 V DC bus 1", "Hydraulic system B", "Air data"):', '')) || '';
    if (!name.trim()) return;
    const type = (await slPrompt('Type — Electrical / Hydraulic / Pneumatic / Fuel / Mechanical / Data / Thermal / Other:', 'Electrical')) || 'Other';
    resourcesData.push({ internalId: 'res-' + Date.now(), resId: 'RES-' + ((resourcesData || []).length + 1).toString().padStart(3, '0'), name: name.trim(), type: type.trim(), providedBy: [], consumedBy: [], consumedBySystems: [], description: '' });
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    renderInterdepPage();
}

function interdepExportCsv() {
    const fcs = acFhaData || [];
    const syss = systemsData || [];
    const rows = [['Aircraft function', 'FC ID', 'Severity'].concat(syss.map(s => s.name)).concat(['Contributors']).join(',')];
    fcs.forEach(fc => {
        const fn = ((acFunctionsData || []).find(f => f.subId === fc.subId) || {});
        const cells = syss.map(s => { const c = idpCell(fc, s.id); return c.state === 'contributes' ? ('X (' + c.kind + ')') : c.state === 'cleared' ? 'cleared' : ''; });
        rows.push([fn.funcName || fc.subId || '', fc.fcId || '', fc.severity || ''].concat(cells).concat([String(idpContributors(fc).length)]).map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','));
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Interdependence_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function _macStore() {
    if (!Array.isArray(projectConfig.macModels)) projectConfig.macModels = [];
    return projectConfig.macModels;
}

// ============================================================================
// Phase D2 (L1/L2) — the MAC fidelity ladder. A clause generalizes from
// "≥min of n members survive" (L0, counting) to "surviving CAPACITY ≥ floor"
// (L1 multipliers / L2 scalar floors), with optional DEGRADED states that
// retain part of a member's contribution. Damage per member is the level it
// is assigned (loss dominates degraded — levels are exclusive, never summed);
// an unmodeled state is a full loss (conservative by default). A clause with
// none of the new fields takes the ORIGINAL k-subset path — L0 breach sets
// are byte-identical to every prior release.
//   Breach-set element naming: '<sysId>' = full loss (unchanged);
//   'deg:<sysId>:<label>' = degraded-state event.
// ============================================================================
function _macDegFor(rule, sysId) {
    return (Array.isArray(rule && rule.degraded) ? rule.degraded : []).filter(d => d && d.sysId === sysId && String(d.label || '').trim());
}
function macClauseWeighted(rule, cl) {
    if (!cl) return false;
    if (cl.floor != null) return true;
    if (cl.weights && Object.keys(cl.weights).some(k => +cl.weights[k] > 0 && +cl.weights[k] !== 1)) return true;
    return (cl.of || []).some(m => _macDegFor(rule, m).length);
}
// Derived fidelity level: L2 = scalar floor present; L1 = weights/degraded; L0 otherwise.
function macRuleLevel(rule) {
    if (!rule) return 0;
    if ((rule.clauses || []).some(c => c && c.floor != null)) return 2;
    if ((rule.clauses || []).some(c => macClauseWeighted(rule, c))) return 1;
    return 0;
}
const MAC_COMBO_CAP = 50000;   // explosion guard — refuse, never approximate
// Minimal breach sets. Returns { sets, error } — error only from the guard.
function macBreachSetsChecked(rule) {
    const out = [];
    let error = null;
    (rule.clauses || []).forEach(cl => {
        const members = cl.of || [];
        if (!members.length || error) return;
        if (!macClauseWeighted(rule, cl)) {
            // ---- L0 path — UNCHANGED original combinatorics ----
            const need = members.length - (cl.min || 1) + 1;   // fail this many → clause violated
            if (need <= 0 || need > members.length) return;
            (function pick(start, cur) {
                if (cur.length === need) { out.push(cur.slice()); return; }
                for (let i = start; i < members.length; i++) { cur.push(members[i]); pick(i + 1, cur); cur.pop(); }
            })(0, []);
            return;
        }
        // ---- L1/L2 path — weighted capacity vs scalar floor ----
        const w = m => (cl.weights && +cl.weights[m] > 0) ? +cl.weights[m] : 1;
        const total = members.reduce((a, m) => a + w(m), 0);
        const floor = cl.floor != null ? +cl.floor : (cl.min || 1);
        // Damage levels per member: intact · each valid degraded state · full loss.
        const levels = members.map(m => {
            const L = [{ key: null, dmg: 0 }];
            _macDegFor(rule, m).forEach(d => {
                const wd = +d.weight;
                if (wd >= 0 && wd < w(m)) L.push({ key: 'deg:' + m + ':' + d.label, dmg: w(m) - wd });
            });
            L.push({ key: m, dmg: w(m) });
            return L;
        });
        const comboCount = levels.reduce((a, L) => a * L.length, 1);
        if (comboCount > MAC_COMBO_CAP) { error = 'clause over ' + members.length + ' members exceeds the ' + MAC_COMBO_CAP + '-combination enumeration cap — split the clause'; return; }
        // Breach when surviving < floor ⇔ damage > total − floor (strict, ε-guarded).
        // Prune on first crossing: any extension is a superset; cross-branch
        // non-minimal sets are removed by the subsumption reduce below.
        const thresh = total - floor + 1e-12;
        (function walk(i, dmg, keys) {
            if (dmg > thresh) { if (keys.length) out.push(keys.slice()); return; }
            if (i >= levels.length) return;
            for (const lv of levels[i]) {
                if (lv.key) keys.push(lv.key);
                walk(i + 1, dmg + lv.dmg, keys);
                if (lv.key) keys.pop();
            }
        })(0, 0, []);
    });
    // subsumption-reduce (a breach set containing another is non-minimal)
    const sets = out.map(a => [...new Set(a)].sort()).sort((a, b) => a.length - b.length);
    const min = [];
    sets.forEach(s => {
        const sub = min.some(m => m.every(x => s.indexOf(x) !== -1));
        if (!sub && !min.some(m => m.length === s.length && m.every((x, i) => x === s[i]))) min.push(s);
    });
    return { sets: min, error };
}
function macBreachSets(rule) {
    return macBreachSetsChecked(rule).sets;
}

function macStats() {
    const rules = _macStore();
    let spf = 0, combos = 0, unsub = 0;
    rules.forEach(r => {
        const b = macBreachSets(r);
        combos += b.length;
        spf += b.filter(s => s.length === 1).length;
        if (!(r.substantiation && r.substantiation.kind === 'sdd')) unsub++;
    });
    return { rules: rules.length, combos, spf, unsub };
}

function macTreeStatus(rule) {
    const rec = _macCompiledStore()[rule.id];
    if (!rec || !(ftaPages || []).some(p => p.id === rec.pageId)) return 'missing';
    return rec.fp === _macRuleFp(rule) ? 'fresh' : 'stale';
}

function macCompileAll() {
    const rules = _macStore();
    let ok = 0, fail = 0, notes = [];
    rules.forEach(r => {
        const res = macCompile(r.id);
        if (res.ok) { ok++; if (res.added.length || res.removed.length) notes.push(r.subId + ': +' + res.added.length + '/−' + res.removed.length + ' combos'); if (!res.verified) notes.push(r.subId + ': EQUIVALENCE CHECK FAILED'); }
        else { fail++; notes.push(r.subId + ': ' + res.reason); }
    });
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    try { updateDashboard(); } catch (_) {}
    if (typeof showToast === 'function') showToast('Compiled ' + ok + ' MF&MS tree(s)' + (fail ? ' · ' + fail + ' skipped' : '') + (notes.length ? ' — ' + notes.slice(0, 3).join(' · ') : ''), fail ? 'warning' : 'success', 5000);
    renderMfmsPanel();
}

function _coffeStore() {
    if (!projectConfig.coffe) projectConfig.coffe = { verdicts: {} };
    if (!projectConfig.coffe.verdicts) projectConfig.coffe.verdicts = {};
    return projectConfig.coffe;
}
function _coffeCaseKey(parts) {
    return parts.map(p => p.sysId + '=' + p.state).sort().join('∧');
}

// Enumerate cases for one FC: singles, then pairs, pruning supersets of
// confirmed-yes singles.
function coffeCases(fc) {
    const systems = idpContributors(fc);
    const V = _coffeStore().verdicts;
    const out = [];
    const yesSingles = new Set();
    systems.forEach(sysId => _COFFE_STATES.forEach(state => {
        const parts = [{ sysId, state }];
        const key = _coffeCaseKey(parts);
        const v = V[fc.internalId + '§' + key];
        if (v && v.verdict === 'yes') yesSingles.add(sysId + '=' + state);
        // 21 Aug 2026 (B4) — CoFFE consumes MAC: a single the MODEL computes as
        // YES prunes its supersets too. Previously only a SIGNED yes pruned, and
        // with 0 signed the prune never fired — measured 92 of 676 wasted cases
        // on Aeolus. A signed NO stays authoritative: the disagreement is
        // already a finding, and the pairs stay elicitable.
        else if (!v && coffeComputed(fc, { parts, key }) === 'yes') yesSingles.add(sysId + '=' + state);
        out.push({ parts, key });
    }));
    for (let i = 0; i < systems.length; i++) for (let j = i + 1; j < systems.length; j++) {
        _COFFE_STATES.forEach(s1 => _COFFE_STATES.forEach(s2 => {
            const a = systems[i] + '=' + s1, b = systems[j] + '=' + s2;
            if (yesSingles.has(a) || yesSingles.has(b)) return;   // superset pruning
            out.push({ parts: [{ sysId: systems[i], state: s1 }, { sysId: systems[j], state: s2 }], key: _coffeCaseKey([{ sysId: systems[i], state: s1 }, { sysId: systems[j], state: s2 }]) });
        }));
    }
    return out;
}

function _coffeBreachSetsForFc(fc) {
    const rules = _macStore().filter(r => r.subId === fc.subId);
    let sets = [];
    rules.forEach(r => { sets = sets.concat(macBreachSets(r)); });
    return sets;
}
// ---------------------------------------------------------------------------
// Phase 66.28 — the computed (MAC) lane, corrected and widened.
//
// ONE REAL GAP, plus a correctness property that gap forced us to state.
//
// HONESTY NOTE, 19 Aug 2026. The first draft of this comment claimed a live bug: that
// the old exact-string comparison could never match a `deg:<sys>:<label>` token, so
// weighted/floored (L1/L2) clauses computed 'no' where they should compute 'yes'.
// Waqas said check it against the real thing before building. Executed old and new
// side by side against a real weighted clause — IT DOES NOT REPRODUCE. Whenever a
// `deg:` breach set is coverable by total losses, the walk also emits the equivalent
// bare-token set, so the old code found that one and answered correctly. The claim was
// wrong and is recorded here rather than quietly deleted.
//
// MONOTONICITY is still a property worth stating, because it only starts to matter now
// that partial loss exists: total loss of A is at least as damaging as A degraded, so a
// total-loss part must satisfy a `deg:A:*` requirement. Previously unreachable, since
// no case could carry a degraded state at all.
//
// GAP (the real one) — partial loss. _COFFE_STATES carried only 'total loss' and 'malfunction', so
// the state the whole ARP Q.4-6 example turns on (cases 2, 5, 8, 11 are D, not F)
// could not be expressed at all — even though the FCIM has spoken TL/PL/M since
// forever, and MAC already models named degraded levels with weights.
//
// WHAT STAYS null. Malfunction. MAC's clause arithmetic is about AVAILABILITY — how
// much capability survives — and an adverse action such as "uncommanded high thrust"
// is not a loss of capability. That is precisely why FF5.3 hangs outside the AND
// branch in the ARP tree. Judgement is genuinely required there, and the panel now
// says so rather than rendering a blank.
//
// PARTIAL LOSS IS DELIBERATELY COARSER THAN MAC. CoFFE says "degraded"; MAC names a
// level with a weight. A partial-loss part therefore satisfies `deg:<sys>:<any>`, i.e.
// the lane answers "there EXISTS a degradation of this system that breaches". That is
// the conservative direction for a cross-check: it raises the question and lets the
// engineer rule it out, rather than staying silent.
// ---------------------------------------------------------------------------
function _coffeDegSys(tok) {
    // 'deg:<sysId>:<label>' → sysId. Labels may contain ':', ids may not.
    if (String(tok).indexOf('deg:') !== 0) return null;
    const rest = String(tok).slice(4);
    const i = rest.indexOf(':');
    return _coffeTokSys(i < 0 ? rest : rest.slice(0, i));
}
// 4 Sep 2026 (F15, found while building the MAC drafter) — MAC MEMBERS ARE SYSTEM
// FUNCTIONS SINCE B6 (21 Aug), BUT COFFE CASES ARE PER SYSTEM. The computed lane
// compared a breach-set token (a system FUNCTION id such as FCS-F1) with a case part
// (a SYSTEM id such as sys-fcs) letter for letter, so every rule drafted on the MAC
// page since B6 was invisible to CoFFE: nothing folded, every case was elicited, and
// coffeUnmodelledSystems called every contributor unmodelled. The demo projects still
// carry system-id members, which is why it never showed. A function token now
// resolves to its OWNER SYSTEM: total loss of the system covers loss of any of its
// functions (the conservative direction — it raises the question, never hides it).
function _coffeTokSys(tok) {
    const id = String(tok == null ? '' : tok);
    if (!id) return id;
    try { if ((systemsData || []).some(s => s && String(s.id) === id)) return id; } catch (_) {}
    try { const own = (typeof _idpFnOwner === 'function') ? _idpFnOwner(id) : null; if (own && own.system) return String(own.system.id); } catch (_) {}
    // 4 Sep 2026 (F16b) — a MAC member may be a CONFIGURATION ITEM (FCC A, FCC B); its owner
    // system is the item's owningSystemId. Run 2's rules were mostly items, and every one read
    // as "no system" here.
    try { const it = (typeof itemsData !== 'undefined' && itemsData || []).find(x => x && (String(x.itemId) === id || String(x.internalId) === id)); if (it && it.owningSystemId) return String(it.owningSystemId); } catch (_) {}
    return id;
}
function coffeComputed(fc, kase) {
    // Malfunction has no computed lane — see the note above.
    if (kase.parts.some(p => p.state === 'malfunction')) return null;
    const sets = _coffeBreachSetsForFc(fc);
    if (!sets.length) return null;   // no MAC model → no computed lane
    const covers = tok => {
        const degSys = _coffeDegSys(tok);
        if (degSys !== null) {
            // A degraded requirement is met by degradation OR by outright loss.
            return kase.parts.some(p => p.sysId === degSys &&
                (p.state === 'partial loss' || p.state === 'total loss'));
        }
        // A full-loss requirement is met only by full loss (of the member's OWNER system).
        const sysOf = _coffeTokSys(tok);
        return kase.parts.some(p => p.sysId === sysOf && p.state === 'total loss');
    };
    return sets.some(b => b.every(covers)) ? 'yes' : 'no';
}

// Which MAC breach set (if any) this case covers — so a finding can name it rather
// than just asserting a disagreement.
function coffeMatchedBreachSet(fc, kase) {
    if (kase.parts.some(p => p.state === 'malfunction')) return null;
    const sets = _coffeBreachSetsForFc(fc);
    const covers = tok => {
        const degSys = _coffeDegSys(tok);
        if (degSys !== null) return kase.parts.some(p => p.sysId === degSys && (p.state === 'partial loss' || p.state === 'total loss'));
        const sysOf = _coffeTokSys(tok);
        return kase.parts.some(p => p.sysId === sysOf && p.state === 'total loss');
    };
    return sets.find(b => b.every(covers)) || null;
}

// ---------------------------------------------------------------------------
// Phase 66.28 — SHORTEST ROUTE. Waqas: "which combination gets you to the
// catastrophic effect the fastest".
//
// The answer is the lowest-order set that still produces the condition. Order 1 on a
// Catastrophic or Hazardous condition is not a ranking — it is a single failure
// causing that condition, which §xx.1309 does not permit — so it is returned as a
// HARD finding, not a table row.
//
// Both lanes are searched: signed verdicts (authoritative) and the MAC model's own
// minimal breach sets (which may be shorter than anything anyone has signed yet).
// ---------------------------------------------------------------------------
function coffeShortestRoute(fc) {
    const V = _coffeStore().verdicts;
    const out = { order: null, cases: [], source: null, modelOrder: null, hard: false };
    let best = Infinity;
    coffeCases(fc).forEach(kase => {
        const v = V[fc.internalId + '\u00a7' + kase.key];
        const yes = (v && v.verdict === 'yes') || (!v && coffeComputed(fc, kase) === 'yes');
        if (!yes) return;
        const n = kase.parts.length;
        if (n < best) { best = n; out.cases = [kase]; out.source = v ? 'signed' : 'model'; }
        else if (n === best) out.cases.push(kase);
    });
    if (best !== Infinity) out.order = best;
    const sets = _coffeBreachSetsForFc(fc);
    if (sets.length) out.modelOrder = sets.reduce((m, b) => Math.min(m, b.length), Infinity);
    if (out.modelOrder === Infinity) out.modelOrder = null;
    // CRY-WOLF GUARD — caught by testing against Aeolus, 19 Aug. An order-1 route from a
    // SINGLE-MEMBER clause reads "this function is required", i.e. the redundancy has not
    // been modelled yet. That is not a discovered single point of failure. Without this,
    // 17 of Aeolus's 22 rules raise a hard finding on day one and everyone learns to
    // ignore the flag. Same rule SLMacLanes.lanes() applies; kept in step deliberately.
    const rules = _macStore().filter(r => r.subId === fc.subId);
    out.singleMemberClause = rules.some(r => (r.clauses || []).some(cl => (cl && cl.of || []).length <= 1));
    out.unmodelled = (out.order === 1 || out.modelOrder === 1) && out.singleMemberClause;
    const sev = String(fc && fc.severity || '');
    out.hard = (out.order === 1 || out.modelOrder === 1) &&
               !out.singleMemberClause &&
               /Catastrophic|Hazardous/i.test(sev);
    return out;
}

// Contributing systems (per the interdependence table) that no MAC clause mentions.
// Their availability cases cannot be computed, so they genuinely need elicitation —
// and that is worth saying out loud rather than leaving as a blank column.
function coffeUnmodelledSystems(fc) {
    const rules = _macStore().filter(r => r.subId === fc.subId);
    const covered = new Set();
    rules.forEach(r => (r.clauses || []).forEach(cl => (cl.of || []).forEach(m => { covered.add(m); covered.add(_coffeTokSys(m)); })));
    return idpContributors(fc).filter(id => !covered.has(id));
}

// Enumeration coverage, stated. The walk is singles + pairs; triples and beyond are
// NOT enumerated. House rule: a bounded sweep says what it left out.
function coffeCoverage(fc) {
    const systems = idpContributors(fc);
    const st = _COFFE_STATES.length;
    return {
        systems: systems.length,
        states: st,
        singles: systems.length * st,
        pairs: (systems.length * (systems.length - 1) / 2) * st * st,
        depth: 2,
        higherOrderNotEnumerated: systems.length > 2
    };
}

// Accept the model's answer as the determination, recorded as DERIVED rather than
// independently judged. Inverts the burden: a signature is spent where the engineer
// disagrees with the model or where no model exists, not on confirming arithmetic.
async function coffeConfirmDerived(fcInternalId, caseKey) {
    const fc = (acFhaData || []).find(f => String(f.internalId) === String(fcInternalId));
    if (!fc) return;
    const parts = caseKey.split('\u2227').map(seg => { const i = seg.lastIndexOf('='); return { sysId: seg.slice(0, i), state: seg.slice(i + 1) }; });
    const c = coffeComputed(fc, { parts, key: caseKey });
    if (c === null) { if (typeof showToast === 'function') showToast('No computed lane for this case — it needs a judgement.', 'warning', 3200); return; }
    const by = (await slPrompt('Confirm the model\u2019s answer (' + c.toUpperCase() + ') and sign:', _signoffReviewerName() || '')) || '';
    if (!by.trim()) return;
    const store = _coffeStore();
    store.verdicts[String(fcInternalId) + '\u00a7' + caseKey] = {
        verdict: c, by: by.trim(), at: new Date().toISOString(), derived: true
    };
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    renderCoffePanel();
}

async function coffeVerdict(fcInternalId, caseKey) {
    const store = _coffeStore();
    const k = String(fcInternalId) + '§' + caseKey;
    const cur = store.verdicts[k];
    if (cur) {
        const yes = await (typeof slConfirm === 'function' ? slConfirm('Clear verdict "' + cur.verdict + '" signed by ' + (cur.by || '?') + '?') : Promise.resolve(confirm('Clear?')));
        if (yes) delete store.verdicts[k];
    } else {
        const v = (await slPrompt('Does this combination result in the failure condition? yes / no:', 'yes')) || '';
        if (!/^y|^n/i.test(v.trim())) return;
        const by = (await slPrompt('Sign with your name:', _signoffReviewerName() || '')) || '';
        if (!by.trim()) return;
        store.verdicts[k] = { verdict: /^y/i.test(v.trim()) ? 'yes' : 'no', by: by.trim(), at: new Date().toISOString() };
    }
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    renderCoffePanel();
}

async function coffeEditResult(fcInternalId, caseKey) {
    const store = _coffeStore();
    if (!store.results) store.results = {};
    const k = String(fcInternalId) + '§' + caseKey;
    const txt = await slPrompt('Capability result for this case (e.g., "High-speed overrun", "Low-speed overrun — stops on runway"):', store.results[k] || '');
    if (txt === null) return;
    if (String(txt).trim()) store.results[k] = String(txt).trim(); else delete store.results[k];
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    renderCoffePanel();
}

function coffeGraft(fcInternalId, caseKey) {
    const fc = (acFhaData || []).find(f => String(f.internalId) === String(fcInternalId));
    if (!fc) return;
    const rule = _macStore().find(r => r.subId === fc.subId);
    const rec = rule && _macCompiledStore()[rule.id];
    const page = rec && (ftaPages || []).find(p => p.id === rec.pageId);
    if (!page || !page.root) { if (typeof showToast === 'function') showToast('Compile the MAC tree for this function first (MF&MS tab).', 'warning', 3500); return; }
    if ((page.root.children || []).some(c => c._macGraft === caseKey)) { if (typeof showToast === 'function') showToast('Already grafted.', 'info', 2200); return; }
    const parts = caseKey.split('∧').map(seg => { const i = seg.lastIndexOf('='); return { sysId: seg.slice(0, i), state: seg.slice(i + 1) }; });
    const mkEvent = p => {
        const s = (systemsData || []).find(x => x.id === p.sysId) || { name: p.sysId };
        const mal = p.state === 'malfunction';
        // Phase 66.28 — Waqas: "we dont need to call them FF nodes, let the user define
        // their numbering schema." The displayId comes from the project's numbering
        // scheme (shared, so the same system reuses one id across grafts); the old
        // hardcoded 'MAC\u00b7' / 'MAL\u00b7' prefixes are the fallback only when the engine
        // is unavailable.
        let did = null;
        try {
            const N = window.SafetyLabNumbering;
            if (N && typeof slNumberingScheme !== 'undefined' && slNumberingScheme) {
                did = N.makeSharedId(slNumberingScheme, 'basicEvent',
                    (mal ? 'macmal:' : 'macsys:') + p.sysId,
                    Object.assign(typeof _slNumberCtx === 'function' ? _slNumberCtx() : {}, { SYS: s.name }),
                    slNumberingStore);
            }
        } catch (_) {}
        return { id: internalIdCounter++, logicalId: (mal ? 'macmal:' : 'macsys:') + p.sysId,
                 displayId: did || ((mal ? 'MAL\u00b7' : 'MAC\u00b7') + s.name.slice(0, 14)),
                 name: s.name + (mal ? ' malfunction (adverse action)' : ' failed / unavailable'),
                 type: 'basic', probability: 0, children: [], _macProvenance: 'authored-malfunction' };
    };
    let branch;
    if (parts.length === 1) branch = mkEvent(parts[0]);
    else branch = { id: internalIdCounter++, logicalId: internalIdCounter, displayId: 'MAL-AND',
                    name: 'Combined: ' + parts.map(p => _macSysName(p.sysId) + ' ' + p.state).join(' ∧ '),
                    type: 'gate', gateType: 'AND', probability: 0, children: parts.map(mkEvent), _macProvenance: 'authored-malfunction' };
    branch._macGraft = caseKey;
    page.root.children.push(branch);
    if (!rec.grafts) rec.grafts = [];
    rec.grafts.push(caseKey);
    if (typeof showToast === 'function') showToast('Authored branch grafted onto ' + page.name + ' — tagged, preserved across recompiles, outside the equivalence theorem.', 'success', 4500);
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    renderCoffePanel();
}

function _sppStore() {
    if (!projectConfig.safetyProgramPlan) projectConfig.safetyProgramPlan = { slots: {}, notes: '' };
    if (!projectConfig.safetyProgramPlan.slots) projectConfig.safetyProgramPlan.slots = {};
    return projectConfig.safetyProgramPlan;
}
function sppSetSlot(id, idx) {
    _sppStore().slots[id] = parseInt(idx) || 0;
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    renderSppPage();
}

async function sppTailorItem() {
    const key = (await slPrompt('Tailor out a completion-checklist item.\nAssessment (AFHA/PASA/SFHA/PSSA/SSA/ASA/PRA/ZSA/CMA):', 'PASA')) || '';
    const K = key.trim().toUpperCase();
    const defs = CKPT_CHECKLISTS[K];
    if (!defs) { if (typeof showToast === 'function') showToast('Unknown assessment "' + key + '".', 'warning', 3000); return; }
    const id = (await slPrompt('Item id — one of:\n' + defs.map(d => '  ' + d.id + ' — ' + d.ref + ' ' + d.label).join('\n'), defs[0].id)) || '';
    if (!defs.some(d => d.id === id.trim())) { if (typeof showToast === 'function') showToast('Unknown item.', 'warning', 3000); return; }
    const rationale = (await slPrompt('Rationale — the DER\'s question is "why didn\'t you do this"; answer it:', '')) || '';
    if (!rationale.trim()) return;
    const by = (await slPrompt('Sign with your name:', _signoffReviewerName() || '')) || '';
    if (!by.trim()) return;
    if (!projectConfig.ckptTailored) projectConfig.ckptTailored = {};
    projectConfig.ckptTailored[K + ':' + id.trim()] = { rationale: rationale.trim(), by: by.trim(), at: new Date().toISOString() };
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    try { updateDashboard(); } catch (_) {}
    renderSppPage();
}

async function sppClearTailoring(k) {
    const t = (projectConfig.ckptTailored || {})[k];
    const yes = await (typeof slConfirm === 'function' ? slConfirm('Reinstate "' + k + '" (clear tailoring signed by ' + (t && t.by || '?') + ')?') : Promise.resolve(confirm('Reinstate?')));
    if (!yes) return;
    delete projectConfig.ckptTailored[k];
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    try { updateDashboard(); } catch (_) {}
    renderSppPage();
}

function coffeFindings(fc) {
    const V = _coffeStore().verdicts;
    const findings = [];
    const prefix = String(fc.internalId) + '§';
    Object.keys(V).forEach(k => {
        if (k.indexOf(prefix) !== 0) return;
        const key = k.slice(prefix.length);
        const parts = key.split('∧').map(seg => { const i = seg.lastIndexOf('='); return { sysId: seg.slice(0, i), state: seg.slice(i + 1) }; });
        const v = V[k];
        const c = coffeComputed(fc, { parts, key });
        if (v && c && v.verdict !== c) {
            findings.push(v.verdict === 'yes'
                ? { kind: 'missing-branch', key, msg: 'Elicited YES but the MAC model does not breach — missing tree branch or missing MAC clause: ' + key }
                : { kind: 'model-challenge', key, msg: 'Elicited NO but the MAC model breaches — either the model is conservative here or the verdict needs revisiting: ' + key });
        }
    });
    return findings;
}

async function mfmsNewAuthoredTree() {
    const crit = (acFhaData || []).filter(f => f.severity === 'Catastrophic' || f.severity === 'Hazardous');
    if (!crit.length) { if (typeof showToast === 'function') showToast('No cat/haz failure conditions yet — add AFHA rows first.', 'warning', 3500); return; }
    const pick = (await slPrompt('Link to failure condition — enter an FC ID:\n' + crit.map(f => '  ' + f.fcId + ' — ' + (f.fcDesc || '').slice(0, 50)).join('\n'), crit[0].fcId)) || '';
    const fc = crit.find(f => f.fcId === pick.trim());
    if (!fc) { if (typeof showToast === 'function') showToast('No cat/haz FC with id "' + pick + '".', 'warning', 3000); return; }
    const rootId = internalIdCounter++;
    const page = {
        id: 'mfms-auth-' + Date.now(),
        name: 'MF&MS (authored) · ' + fc.fcId,
        treeLevel: 'aircraft', mode: 'top-down',
        linkedFhaId: fc.internalId, mfmsMethod: 'authored',
        root: { id: rootId, logicalId: rootId, displayId: 'TOP-' + fc.fcId, name: fc.fcDesc || fc.fcId, type: 'gate', gateType: 'OR', probability: 0, children: [] },
        missionProfileId: (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.missionProfileId) || ''
    };
    ftaPages.push(page);
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    openFTAPageById(page.id);
}

async function wsPssaNewTree() {
    const s = sys();
    if (!s) return;
    const rows = s.fha || [];
    let linkedFhaId = '';
    if (rows.length) {
        const pick = (await slPrompt('Link to a system failure condition — enter an FC ID (blank for none):\n' + rows.map(f => '  ' + f.fcId + ' — ' + (f.fcDesc || '').slice(0, 50)).join('\n'), rows[0].fcId)) || '';
        const fc = rows.find(f => f.fcId === pick.trim());
        if (fc) linkedFhaId = fc.internalId;
    }
    const rootId = internalIdCounter++;
    const page = {
        id: 'pssa-' + s.id + '-' + Date.now(),
        name: 'PSSA · ' + s.name + (linkedFhaId ? ' · ' + ((rows.find(f => String(f.internalId) === String(linkedFhaId)) || {}).fcId || '') : ''),
        treeLevel: 'system', systemId: s.id, mode: 'top-down',
        linkedFhaId: linkedFhaId || undefined,
        root: { id: rootId, logicalId: rootId, displayId: 'TOP', name: 'System failure condition', type: 'gate', gateType: 'OR', probability: 0, children: [] },
        missionProfileId: (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.missionProfileId) || ''
    };
    ftaPages.push(page);
    try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    openFTAPageById(page.id);
}

async function mfmsAiRestructure(ruleId) {
    if (!(window.SafetyLabAI && SafetyLabAI.available && SafetyLabAI.available())) {
        if (typeof showToast === 'function') showToast('AI backend not available — check AI Settings.', 'warning', 3500);
        return;
    }
    const rule = _macStore().find(r => r.id === ruleId);
    const rec = _macCompiledStore()[ruleId];
    if (!rule || !rec) return;
    const fc = _macFcForRule(rule);
    const sysList = [...new Set((rule.clauses || []).flatMap(c => c.of || []))]
        .map(id => ({ id, name: _macSysName(id) }));
    const breach = macBreachSets(rule);
    const system = 'You restructure aviation fault trees for readability. You will receive breach combinations (minimal cut sets at system granularity) for an aircraft-level failure condition. Produce a JSON tree whose Boolean logic is EXACTLY equivalent: it must fail precisely on those combinations, no more, no less. Use meaningful intermediate gate names an ARP4761A reviewer would recognize. Schema: {"name":string,"gate":"OR"|"AND"|"VOTING","k":int(VOTING only),"children":[...]} — leaves are {"sys":"<systemId>","name":string}. Use ONLY the given system ids, each as many times as the logic requires. Reply with the JSON object only, no fences, no commentary.';
    const user = 'Failure condition: ' + (fc ? (fc.fcId + ' — ' + (fc.fcDesc || '')) : rule.subId) +
        '\nSystems: ' + JSON.stringify(sysList) +
        '\nBreach combinations (each inner array = one minimal failure combination of system ids): ' + JSON.stringify(breach) +
        '\nProduce the equivalent readable tree.';
    if (typeof showToast === 'function') showToast('✦ Drafting readable structure — the equivalence prover will check it before anything is applied…', 'info', 3500);
    let text = '';
    try {
        const r = await SafetyLabAI.complete({ feature: 'fta.restructure', system, messages: [{ role: 'user', content: user }], maxTokens: 2000, temperature: 0.2 });
        text = (r && (r.text || r.completion)) || '';
    } catch (e) {
        if (typeof showToast === 'function') showToast('AI call failed: ' + (e && e.message || e), 'warning', 4000);
        return;
    }
    let spec = null;
    try { spec = JSON.parse(String(text).replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/, '').trim()); }
    catch (_) { if (typeof showToast === 'function') showToast('AI returned unparseable structure — rejected.', 'warning', 4000); return; }
    const res = mfmsApplyRestructure(ruleId, spec);
    if (res.ok) {
        if (typeof showToast === 'function') showToast('✓ Equivalence PROVEN — readable structure applied. AI drafted the form; the math owns the truth.', 'success', 5000);
        try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    } else {
        if (typeof showToast === 'function') showToast('✕ ' + res.reason, 'warning', 5000);
    }
    renderMfmsPanel();
}

function renderWsPssaPanel() {
    const host = document.getElementById('ws-pssa-host');
    const s = sys();
    if (!host || !s) return;
    const trees = (ftaPages || []).filter(p => p.systemId === s.id && !p.verifies && (p.mode || 'top-down') === 'top-down');
    const mirrors = (ftaPages || []).filter(p => p.verifies && trees.some(t => t.id === p.verifies));
    const dalRun = trees.filter(t => t.root && t.root.allocatedDAL).length;
    let latents = [], exceeds = 0;
    try { latents = ccmrLatentSweep().filter(r => r.system === s.name); exceeds = latents.filter(r => r.exceeds).length; } catch (_) {}

    let html = '<div class="ckpt-posture" style="margin-top:0;">' +
        '<div class="ckpt-tile"><div class="ckpt-tile-label">Allocation trees</div><div class="ckpt-tile-value">' + trees.length + '</div><div class="ckpt-tile-sub">this system</div></div>' +
        '<div class="ckpt-tile"><div class="ckpt-tile-label">DAL allocation run</div><div class="ckpt-tile-value">' + dalRun + ' / ' + trees.length + '</div><div class="ckpt-tile-sub">roots carry FDAL</div></div>' +
        '<div class="ckpt-tile"><div class="ckpt-tile-label">Verification mirrors</div><div class="ckpt-tile-value">' + mirrors.length + ' / ' + trees.length + '</div><div class="ckpt-tile-sub">SSA side</div></div>' +
        '<div class="ckpt-tile' + (exceeds ? ' ckpt-tile-danger' : latents.length ? ' ckpt-tile-warn' : ' ckpt-tile-ok') + '"><div class="ckpt-tile-label">Latents (CCMR)</div><div class="ckpt-tile-value">' + latents.length + '</div><div class="ckpt-tile-sub">' + (exceeds ? exceeds + ' exceed not-to-exceed' : 'within bounds') + '</div></div></div>';

    html += '<div style="margin-bottom: var(--s-3);"><button class="ckpt-m-btn ckpt-m-btn-primary" onclick="wsPssaNewTree()">+ allocation tree</button></div>';

    if (!trees.length) {
        html += '<p style="color: var(--color-text-tertiary); font-size: 13px;">No allocation trees for this system yet — any tree created with this system\'s scope (here or in the FTA view) appears automatically.</p>';
    } else {
        html += '<table class="data-table" style="width:100%; font-size:12.5px;"><thead><tr><th>Tree</th><th>Linked FC</th><th>FDAL</th><th>Mirror</th><th></th></tr></thead><tbody>';
        trees.forEach(t => {
            const fr = _ccmrPageFha(t);
            const mirror = (ftaPages || []).find(p => p.verifies === t.id);
            html += '<tr><td>' + esc(t.name || t.id) + '</td>' +
                '<td class="u-mono">' + esc(fr ? (fr.fha.fcId || '') : '—') + (fr && (fr.fha.severity === 'Catastrophic' || fr.fha.severity === 'Hazardous') ? ' <span class="sla-stamp" style="color: var(--sev-' + (fr.fha.severity === 'Catastrophic' ? 'cat' : 'haz') + '-fg); font-size:9px;">' + fr.fha.severity.slice(0, 3).toUpperCase() + '</span>' : '') + '</td>' +
                '<td class="u-mono">' + esc((t.root && t.root.allocatedDAL) || '—') + '</td>' +
                '<td>' + (mirror ? '<span style="color: var(--color-success);">✓</span>' : '<span style="color: var(--color-text-tertiary);">—</span>') + '</td>' +
                '<td><button class="ckpt-m-btn" style="font-size:11px; padding:2px 8px;" onclick="openFTAPageById(\'' + esc(t.id) + '\')">Open ↗</button></td></tr>';
        });
        html += '</tbody></table>';
    }
    host.innerHTML = html;
}

function _pasaReparent() {
    if (_pasaReparented) return;
    const panels = document.getElementById('pasa-subpanels');
    if (!panels) return;
    ['view-interdep', 'view-mac'].forEach(id => {
        const v = document.getElementById(id);
        if (v) { v.style.display = 'none'; panels.appendChild(v); }
    });
    // Resources has no tab of its own: its matrix renders inside the interdependence
    // view, and the row editor tucks underneath in a collapsible section.
    const interdepView = document.getElementById('view-interdep');
    const resView = document.getElementById('view-resources');
    if (interdepView && resView) {
        const det = document.createElement('details');
        det.id = 'idp-resource-editor';
        det.innerHTML = '<summary style="cursor:pointer; font-size:12.5px; color: var(--color-text-secondary); padding: 8px 0;">Resource editor — add or edit provide/consume rows</summary>';
        resView.style.display = '';
        det.appendChild(resView);
        interdepView.appendChild(det);
    }
    _pasaReparented = true;
}
function pasaSub(name) {
    _pasaReparent();
    if (name === 'resources') name = 'interdep';   // merged
    const map = { cockpit: 'pasa-sub-cockpit', interdep: 'view-interdep', mac: 'view-mac', mfms: 'pasa-sub-mfms', coffe: 'pasa-sub-coffe' };
    Object.entries(map).forEach(([k, id]) => {
        const el = document.getElementById(id);
        if (el) el.style.display = (k === name) ? '' : 'none';
        const btn = document.getElementById('pasa-tab-' + k);
        if (btn) btn.classList.toggle('active', k === name);
    });
    if (name === 'cockpit') { try { renderCockpitPage('PASA'); } catch (_) {} }
    if (name === 'interdep') { try { renderInterdepPage(); _populateResourceMultiselects({}); renderResources(); } catch (_) {} }
    if (name === 'mac') { try { renderMacPage(); } catch (_) {} }
    if (name === 'mfms') { try { renderMfmsPanel(); } catch (_) {} }
    if (name === 'coffe') { try { renderCoffePanel(); } catch (_) {} }
}

function rateEquivalentForProb(P, t) {
    if (P == null) return 0;
    if (P <= 0) return 0;
    if (P >= 1) return Infinity;
    const tExp = (t != null) ? t : (ftaConfig.exposureTime || 1);
    if (!(tExp > 0)) return 0;
    return -Math.log1p(-P) / tExp;
}

function _acPlanSubAdds(subRows) {
    const nonEmpty = (subRows || []).filter(function (s) { return ((s.id || '') + (s.name || '') + (s.def || '')).trim() !== ''; });
    if (nonEmpty.length) return nonEmpty;
    const first = (subRows && subRows[0]) || { id: '', name: '', def: '' };
    return [{ id: first.id || '', name: first.name || '', def: first.def || '' }];
}
function _acClearSubfuncExtras() {
    const c = document.getElementById('ac-subfunc-extra'); if (c) c.innerHTML = '';
}

function _readChartRadio(name) {
    const el = document.querySelector('input[name="' + name + '"]:checked');
    if (!el) return null;
    if (el.value === 'true') return true;
    if (el.value === 'false') return false;
    return null;
}

function _refreshFhaChartOutcome() {
    const out = document.getElementById('fha-chart-outcome');
    if (!out || !_fhaChartActive) return;
    const fha = _fhaChartActive.fha;
    // Use the project's cert basis + the radio values to compute the live outcome.
    const cp = {
        similarPrior:         _readChartRadio('fha-chart-similar'),
        isSimple:             _readChartRadio('fha-chart-simple'),
        isRedundant:          _readChartRadio('fha-chart-redundant'),
        isSimpleConventional: _readChartRadio('fha-chart-simpleconv')
    };
    // Call the live decision function via the AutoReq module's exposed surface.
    const probe = Object.assign({}, fha, { chartProps: cp });
    let depth = null;
    try { depth = AutoReq.decideAnalysisDepth ? AutoReq.decideAnalysisDepth(probe) : null; } catch(_) {}
    let outcome = '';
    if (!depth || depth.skip) {
        outcome = '<em>Outcome pending — answer the questions above. Defaults to qual + quant if left blank (or qualitative on permissive Class I/II).</em>';
    } else if (depth.mode === 'similarity') {
        outcome = '<strong>Outcome:</strong> Similarity argument requirement only (' + (depth.acRef || 'AC 25.1309-1B') + ' §' + depth.clause + ').';
    } else if (depth.mode === 'qualitative') {
        const note = depth.uncharacterized ? ' — pending characterization; permissive default for this cert class' : '';
        outcome = '<strong>Outcome:</strong> Qualitative assessment only (' + (depth.acRef || 'AC 25.1309-1B') + ' §' + depth.clause + ')' + note + '.';
    } else if (depth.mode === 'qual-quant') {
        const note = depth.uncharacterized ? ' — pending characterization; defaults to full rigor' : '';
        outcome = '<strong>Outcome:</strong> Qualitative + Quantitative requirements (' + (depth.acRef || 'AC 25.1309-1B') + ' §' + depth.clause + ')' + note + '.';
    }
    out.innerHTML = outcome;
}

function reqVerStatusBadge(row, kind) {
    if (!row) return '';
    const status = row[kind + 'Status'] || '';
    const method = row[kind + 'Method'] || '';
    const ev     = row[kind + 'Evidence'] || '';
    if (!status && !method && !ev) return '<span class="u-muted-small">—</span>';
    const palette = {
        'Passed':     { bg: 'rgba(52, 199, 89, 0.14)',  fg: 'var(--sev-min-fg)' },
        'Failed':     { bg: 'rgba(255, 59, 48, 0.13)',  fg: 'var(--sev-cat-fg)' },
        'In Progress':{ bg: 'rgba(255, 149, 0, 0.13)',  fg: 'var(--sev-haz-fg)' },
        'Pending':    { bg: 'var(--color-surface-2)',    fg: 'var(--color-text-tertiary)' },
        'N/A':        { bg: 'var(--color-surface-2)',    fg: 'var(--color-text-tertiary)' }
    };
    const p = palette[status] || palette['Pending'];
    const label = status || (method ? method : 'Pending');
    const tip = (method ? 'Method: ' + method : '') + (ev ? (method ? ' · ' : '') + 'Evidence: ' + ev : '');
    return '<span title="' + esc(tip) + '" style="display: inline-block; padding: 2px 8px; background: ' + p.bg + '; color: ' + p.fg + '; border-radius: var(--r-full); font-size: 10px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;">' + esc(label) + '</span>';
}

function _fcimRenderCells(row, actions) {
    const obsBadge = row.obsolete
        ? '<span class="slab-obsolete-badge" title="' + esc(row.obsoleteReason || 'Obsolete') + '">OBSOLETE</span>'
        : '';
    const subCell = `<td>${obsBadge}<strong>${esc(row.subId)}</strong></td>`;
    // N/A used to blank the TL/PL/M columns and replace them with the rationale. That read
    // on screen as "nothing was drafted here" rather than "the crew-unaware VARIANT does not
    // apply", and it matched a trace path that dropped the conditions outright. Corrected
    // 1 Aug 2026: the failure conditions are shown like any other row, and the N/A marker
    // carries its rationale in the awareness cell where it belongs — the marker is about
    // awareness, so it lives in the awareness column.
    const isNA = !!(row && row.awareness === 'N/A');
    // 2 Aug 2026 — aware/unaware PAIRING (Waqas's ruling: a standalone Unaware is
    // legitimate; where awareness affects severity, both scenarios are captured
    // and linked). The badge names the pair and which risk the engineer chose to
    // govern; taking the aware (lower) credit owes the monitoring requirement the
    // fcim-monitor generator emits.
    const pairBadge = (row && row.pairId)
        ? `<br><span style="font-size:10px;border:1px solid var(--color-accent);color:var(--color-accent);border-radius:999px;padding:0 6px;" title="Aware/Unaware pair ${esc(row.pairId)} — ${esc(row.pairGoverns || 'governing risk not yet chosen')}${row.pairGoverns === 'aware' ? ' governs: annunciation credit taken, monitoring requirement owed (see AutoReq)' : (row.pairGoverns === 'unaware' ? ' governs: no credit taken, none owed' : '')}">paired · ${esc(row.pairGoverns ? row.pairGoverns + ' governs' : 'undecided')}</span>`
        : '';
    const awareCell = isNA
        ? `<td><span style="color: var(--color-text-tertiary); font-style: italic;" title="${esc(row.rationale || 'The crew-unaware case is inapplicable — this failure is intrinsically evident.')}">N/A <span style="font-size: 11px;">(no unaware case)</span></span>${row.rationale ? `<br><span style="font-size: 11px; color: var(--color-text-tertiary); font-style: italic;">${esc(row.rationale)}</span>` : ''}${pairBadge}</td>`
        : `<td>${esc(row.awareness)}${pairBadge}</td>`;
    // 2 Aug 2026 — COMBINED failure conditions column (ARP4761A §A.3, Table A3
    // text: related sub-functions should yield conditions combining their
    // failures). Waqas's ruling: a dedicated column, not a separate block. Each
    // entry names its partner sub-functions; editing happens in the FCIM_COMBINED
    // modal (born-modular) because the entry is an array, which the CRUD factory's
    // flat form fields cannot carry.
    const combos = Array.isArray(row && row.combined) ? row.combined : [];
    const comboHtml = combos.map(c =>
        `<div><strong>${esc(c.cbId || '')}</strong> ${esc(c.cbDesc || '')}<br><span style="font-size:10.5px;color:var(--color-text-tertiary);">with ${esc((c.withSubIds || []).join(', ') || '—')}</span></div>`
    ).join('');
    const comboCell = `<td>${comboHtml}<button type="button" data-fcim-combined="${esc(row.internalId)}" title="Combined failure conditions across related sub-functions (ARP4761A Table A3) — edit" style="font-size:10px;padding:0 5px;border-radius:999px;border:1px dashed var(--color-border-strong);background:transparent;cursor:pointer;color:var(--color-text-secondary);">${combos.length ? 'edit' : '+ combined'}</button></td>`;
    // 2 Aug 2026 — Table A3 multiplicity: additional distinct conditions beyond
    // the primary render stacked in the same cell, each with its own FC id
    // (plExtra: the within-MAC / outside-MAC split under a complete-loss TL;
    // mExtra: MF2…MFn). Additive — rows without extras render exactly as before.
    const _extraHtml = list => (Array.isArray(list) ? list : []).map(e =>
        `<div style="margin-top:3px;border-top:1px dashed var(--color-border-hair);padding-top:2px;"><strong>${esc(e.id || '')}</strong><br>${esc(e.desc || '')}</div>`).join('');
    return `<td>${actions}</td>${subCell}${awareCell}<td><strong>${esc(row.tlId)}</strong><br>${esc(row.tlDesc)}</td><td><strong>${esc(row.plId)}</strong><br>${esc(row.plDesc)}${_extraHtml(row.plExtra)}</td><td><strong>${esc(row.mId)}</strong><br>${esc(row.mDesc)}${_extraHtml(row.mExtra)}</td>${comboCell}`;
}

// FCIM "N/A" marks a sub-function whose crew-UNAWARE case is inapplicable — the failure is
// intrinsically evident, so the crew can never miss it. It does NOT mean the sub-function
// has no failure conditions.
//
// CORRECTED 1 Aug 2026. This function used to skip N/A rows entirely, on the reading that
// they were "documentation only". The consequence was that the total-loss, partial-loss and
// malfunction conditions of every intrinsically evident failure never reached extractedFCs,
// so they were absent from the FHA's FC dropdown and invisible to the AI drafting the FHA.
// Those are frequently the SEVERE ones — the prompt's own examples of intrinsic evidence are
// yaw, roll, asymmetry and deceleration. The negative finding N/A records is about the
// awareness dimension only.
// 20 Aug 2026 — every extracted FC now carries the `subId` of the FCIM row it came from.
// It always knew this by construction and simply threw it away, which is why the FHA form
// could offer SF-001's failure conditions while SF-002 was selected and then SAVE the pair:
// measured live, submitACFHA accepted { subId: 'SF-002', fcId: 'SF-001-TL' } with the
// pitch-axis description auto-filled from the wrong sub-function, no alert, no finding. The
// scope key, requirement bucket, tree ownership and every report inherit that contradiction
// and nothing downstream can recover from it.
// `combined: true` marks Table A3 combined conditions, which span related sub-functions BY
// DEFINITION — those are legitimately cross-sub-function and the guard must not reject them.
function _pushExtractedFCs(fcimArr, out) {
    (fcimArr || []).forEach(d => {
        if (!d) return;
        if (d.tlId) out.push({ id: d.tlId, desc: d.tlDesc, subId: d.subId });
        if (d.plId) out.push({ id: d.plId, desc: d.plDesc, subId: d.subId });
        if (d.mId)  out.push({ id: d.mId,  desc: d.mDesc,  subId: d.subId });
        // 2 Aug 2026 — combined failure conditions (Table A3's related-sub-
        // functions rule) trace forward like every other condition: an FHA row
        // can be built on a combined condition, and the AI drafting the FHA sees
        // it. Same lesson as the N/A fix above — a condition the matrix holds
        // but the FHA cannot see is a condition that silently never happened.
        (Array.isArray(d.combined) ? d.combined : []).forEach(c => {
            if (c && c.cbId) out.push({ id: c.cbId, desc: c.cbDesc, subId: d.subId, combined: true });
        });
        // 2 Aug 2026 — Table A3 multiplicity: every additional distinct condition
        // traces forward exactly like the primaries. A condition held by the
        // matrix but invisible to the FHA silently never happened.
        (Array.isArray(d.plExtra) ? d.plExtra : []).forEach(e => { if (e && e.id) out.push({ id: e.id, desc: e.desc, subId: d.subId }); });
        (Array.isArray(d.mExtra)  ? d.mExtra  : []).forEach(e => { if (e && e.id) out.push({ id: e.id, desc: e.desc, subId: d.subId }); });
    });
}

// Phase 53.42 — rebuild extractedFCs for every system from its FCIM rows. Used on project
// load + after Excel import + by Auto-fill FC IDs to make sure the dropdown lists every ID
// the FCIM contains.
function rebuildExtractedFCsForAllSystems() {
    (systemsData || []).forEach(s => {
        s.extractedFCs = [];
        _pushExtractedFCs(s.fcim, s.extractedFCs);
    });
    // AC side mirror.
    acExtractedFCs = [];
    _pushExtractedFCs(acFcimData, acExtractedFCs);
}

function checkZSA_SpatialReq() { const sev = document.getElementById('zsa-severity').value; const mitigateInput = document.getElementById('zsa-mitigation'); if(sev !== 'Catastrophic') { mitigateInput.placeholder = "Not strictly required for Major/Hazardous..."; } else { mitigateInput.placeholder = "e.g., Relocated wire bundle 2 inches above hydraulic drip line"; } }

function _readZsaAdjacencyHints(){
    const parseCsv = (id) => {
        const v = (document.getElementById(id) || {}).value || '';
        return v.split(',').map(s => s.trim()).filter(Boolean);
    };
    const checked = (id) => !!(document.getElementById(id) || {}).checked;
    return {
        forwardOfEngines:    parseCsv('zsa-adj-fwd-engines'),
        aftOfEngines:        parseCsv('zsa-adj-aft-engines'),
        withinRotorPlaneOf:  parseCsv('zsa-adj-rotor-plane'),
        sameSideAsEngines:   parseCsv('zsa-adj-same-side'),
        shieldedBy:          (document.getElementById('zsa-adj-shielded-by') || {}).value || '',
        adjacentZones:       parseCsv('zsa-adj-adjacent'),
        pressurized:         checked('zsa-adj-pressurized'),
        aboveCabinFloor:     checked('zsa-adj-above-floor'),
        forwardOfPressureBhd: checked('zsa-adj-forward-cabin')
    };
}
function _writeZsaAdjacencyHints(adj){
    adj = adj || {};
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = (Array.isArray(v) ? v.join(', ') : (v || '')); };
    const setBool = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
    set('zsa-adj-fwd-engines',  adj.forwardOfEngines);
    set('zsa-adj-aft-engines',  adj.aftOfEngines);
    set('zsa-adj-rotor-plane',  adj.withinRotorPlaneOf);
    set('zsa-adj-same-side',    adj.sameSideAsEngines);
    set('zsa-adj-shielded-by',  adj.shieldedBy);
    set('zsa-adj-adjacent',     adj.adjacentZones);
    setBool('zsa-adj-pressurized',     adj.pressurized);
    setBool('zsa-adj-above-floor',     adj.aboveCabinFloor);
    setBool('zsa-adj-forward-cabin',   adj.forwardOfPressureBhd);
}
function _clearZsaAdjacencyHints(){
    _writeZsaAdjacencyHints({});
}

function populateCmaOwningSystem(selectedId) {
    const sel = document.getElementById('cma-owning-system');
    if (!sel) return;
    const cur = (selectedId != null) ? selectedId : sel.value;
    const opts = ['<option value="">-- Select a system folder --</option>'];
    (systemsData || []).forEach(s => {
        opts.push('<option value="' + esc(s.id) + '">' + esc(s.name || s.id) + '</option>');
    });
    sel.innerHTML = opts.join('');
    if (cur) sel.value = cur;
}
function onCmaScopeChange() {
    const scope = (document.getElementById('cma-scope') || {}).value || 'aircraft';
    const row = document.getElementById('cma-owning-system-row');
    if (row) row.style.display = (scope === 'system') ? 'flex' : 'none';
    if (scope === 'system') populateCmaOwningSystem();
}

function _cmaSuggestBadge(row) {
    if (!row || !row.suggested) return '';
    const src = row.autoSource === 'shared-event' ? 'shared event' : (row.autoSource === 'ccf-group' ? 'CCF group' : (row.autoSource === 'shared-resource' ? 'shared resource' : 'auto'));
    return '<div class="cma-suggest">'
        + '<span class="cma-suggest-tag" title="Auto-created from the fault trees — review, then Accept to keep or Dismiss to remove.">✨ Auto-detected · ' + esc(src) + '</span>'
        + '<button type="button" class="cma-suggest-accept" onclick="acceptCmaSuggestion(' + row.internalId + ')">Accept</button>'
        + '<button type="button" class="cma-suggest-dismiss" onclick="dismissCmaSuggestion(' + row.internalId + ')">Dismiss</button>'
        + '</div>';
}

function _populateResourceProvidedBy(selected) {
    const el = document.getElementById('resources-provided-by');
    if (!el) return;
    const current = selected || _getCheckboxListValues(el);
    const options = (systemsData || [])
        .filter(s => s && s.id != null && String(s.id) !== '')
        .map(s => ({ value: String(s.id), label: (s.name ? String(s.name) : String(s.id)) + '  ·  ' + String(s.id) }));
    _renderCheckboxList(el, options, current, { emptyText: 'No systems defined yet — add some in the System Directory first.' });
}
function _populateResourceConsumedBy(selected) {
    const el = document.getElementById('resources-consumed-by');
    if (!el) return;
    const current = selected || _getCheckboxListValues(el);
    const options = (acFunctionsData || [])
        .filter(f => f && f.subId != null && String(f.subId) !== '')
        .map(f => ({ value: String(f.subId), label: String(f.subId) + (f.subName ? '  ·  ' + f.subName : '') }));
    _renderCheckboxList(el, options, current, { emptyText: 'No aircraft sub-functions defined yet — add some in Aircraft Functions first.' });
}
function _populateResourceMultiselects(row) {
    row = row || {};
    _populateResourceProvidedBy(row.providedBy || []);
    _populateResourceConsumedBy(row.consumedBy || []);
}

function renderArpProcessPage() {
    const host = document.getElementById('arp-process-host');
    if (!host) return;
    let phases;
    try { phases = computePhaseStatus(); } catch (e) { host.innerHTML = '<div style="color: var(--color-text-tertiary); padding: 16px;">Could not compute phase status.</div>'; return; }
    const statusColor = {
        'not-started':  { bg: 'var(--color-surface-2)', text: 'var(--color-text-tertiary)', label: 'Not started' },
        'in-progress':  { bg: 'rgba(245, 158, 11, 0.12)', text: '#b45309', label: 'In progress' },
        'complete':     { bg: 'rgba(34, 197, 94, 0.12)',  text: '#15803d', label: 'Complete' }
    };
    function _card(p) {
        const s = statusColor[p.status] || statusColor['not-started'];
        return '<div style="border: 1px solid var(--color-border-hair); border-radius: 10px; padding: 16px 18px; background: var(--color-surface-1); display: grid; grid-template-columns: 100px 1fr 160px 130px; gap: 16px; align-items: center; margin-bottom: 10px;">' +
            '<div style="font-family: var(--font-mono); font-size: 18px; font-weight: 700; color: var(--color-text-primary);">' + esc(p.label) + '</div>' +
            '<div>' +
                '<div style="font-size: 14px; font-weight: 600; color: var(--color-text-primary); margin-bottom: 4px;">' + esc(p.name) + '</div>' +
                '<div style="font-size: 12px; color: var(--color-text-secondary); line-height: 1.45;">' + esc(p.desc) + '</div>' +
            '</div>' +
            '<div style="font-size: 12px; color: var(--color-text-secondary);">' + esc(p.progress) + '</div>' +
            '<div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">' +
                '<span style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; padding: 3px 9px; border-radius: 12px; background: ' + s.bg + '; color: ' + s.text + ';">' + esc(s.label) + '</span>' +
                '<button class="btn-cyan" style="font-size: 11px; padding: 4px 10px;" onclick="enterPhase(\'' + esc(p.label) + '\')">Open →</button>' +
            '</div>' +
        '</div>';
    }
    const spine = ['AFHA','PASA','SFHA','PSSA','SSA','ASA'];
    const cca   = ['PRA','ZSA','CMA'];
    let html = '<div style="font-size: 11px; color: var(--color-text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; margin: 4px 4px 8px;">Safety process spine</div>';
    spine.forEach(id => { if (phases[id]) html += _card(phases[id]); });
    html += '<div style="font-size: 11px; color: var(--color-text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; margin: 18px 4px 8px;">Common Cause Analysis (parallel track)</div>';
    cca.forEach(id => { if (phases[id]) html += _card(phases[id]); });
    host.innerHTML = html;
}

function getBasicEventsFromAllTrees(list = []) { ftaPages.forEach(page => { if(page.root) extractBasicEvents(page.root, list); }); return list; }
function extractBasicEvents(node, list) { if(!node) return; if(node.type === 'basic') list.push(node); let actualChildren = node.children || node._children; if(actualChildren) actualChildren.forEach(c => extractBasicEvents(c, list)); }

function updateFMEABasicEvents() {
    const select = document.getElementById('fmea-basic-event'); select.innerHTML = '<option value="">-- Select FTA Basic Event --</option>';
    const events = getBasicEventsFromAllTrees(); events.forEach(e => select.innerHTML += `<option value="${esc(e.id)}">[${esc(e.displayId)}] ${esc(e.name)}</option>`);
    // Guard against listener-leak on repeated FMEA tab visits (Phase 27 audit A9). The rate +
    // time inputs each accumulated a fresh calcFMEAProb on every tab open; over a few visits
    // the recalc fired several times per keystroke. Mark the inputs as wired so we attach once.
    const rateEl = document.getElementById('fmea-rate');
    const timeEl = document.getElementById('fmea-time');
    if (rateEl && !rateEl.dataset.calcWired) { rateEl.addEventListener('input', calcFMEAProb); rateEl.dataset.calcWired = '1'; }
    if (timeEl && !timeEl.dataset.calcWired) { timeEl.addEventListener('input', calcFMEAProb); timeEl.dataset.calcWired = '1'; }
}
// ---------- FMEA per ARP4761A Appendix J ----------
// Corrected 1 Aug 2026: this said "§5.1.3 + Appendix B", which was wrong twice.
// 4761A §5 is Safety-Related Maintenance Tasks (only §5.1 and §5.2 exist), and
// Appendix B is the Preliminary Aircraft Safety Assessment. FMEA is Appendix J.
// Two modes share one fmeaData array, discriminated by row.fmeaType:
//   'functional'  — top-down, function-level. Linked to acFunctionsData via funcSubId.
//   'piece-part'  — bottom-up, component-level. Quantitative via λ × t + linked to FTA basic event.
// Common ARP 4761A fields on both: localEffect, nextEffect, endEffect, detection, severity,
// compensating, remarks. Backward compat: legacy rows with no fmeaType default to 'piece-part'.

// FMEA_FUNC_MODE_LABELS — extracted to ui_constants.js (Phase 76; byte-identical, loaded BEFORE this file).
// [P2 batch 5] L5561-5561 moved verbatim to bindings_modules.js
// [P2 batch 5] L5562-5562 moved verbatim to bindings_modules.js

// ----- Scope (Aircraft / System) helpers, mirroring the FTA tree-level pattern -----
// FMEA_SCOPE_LABELS — extracted to ui_constants.js (Phase 76; byte-identical, loaded BEFORE this file).
// FMEA_SCOPE_COLORS — extracted to ui_constants.js (Phase 76; byte-identical, loaded BEFORE this file).

// Populate the FMEA "Owning System" dropdown from systemsData.
function populateFmeaOwningSystem(selectedId) {
    const sel = document.getElementById('fmea-owning-system');
    if (!sel) return;
    const cur = (selectedId != null) ? selectedId : sel.value;
    const opts = ['<option value="">-- Select a system folder --</option>'];
    (systemsData || []).forEach(s => {
        opts.push('<option value="' + esc(s.id) + '">' + esc(s.name || s.id) + '</option>');
    });
    sel.innerHTML = opts.join('');
    if (cur) sel.value = cur;
}

// Show/hide the owning-system row based on the scope dropdown's current value.
function onFmeaScopeChange() {
    const scope = (document.getElementById('fmea-scope') || {}).value || 'aircraft';
    const row = document.getElementById('fmea-owning-system-row');
    if (row) row.style.display = (scope === 'system') ? 'flex' : 'none';
    if (scope === 'system') populateFmeaOwningSystem();
}

function getActiveFTARoot() { if(!activeFTAPageId) return null; const page = ftaPages.find(p => p.id === activeFTAPageId); return page ? page.root : null; }

// Phase 53.37 — render transferred-out subtrees nested under their source page.
//   • Pages with `transferInFrom` become children of the source page.
//   • Each parent gets a chevron toggle (▾/▸) that collapses/expands its subtree branch.
//   • Subtree pages render with a SUBTREE badge regardless of their treeLevel value.
//   • Collapse state is stored on the page object so it survives re-renders & saves.
// Phase 56.15 — Sidebar v2: search + section grouping.
// ----------------------------------------------------------------------------
// Per Electra customer feedback (2026-05-27): trees should group by scope and
// be searchable by name. Top section is "Aircraft Fault Trees" (treeLevel ===
// 'aircraft'), then one section per System (sorted by system name), then a
// Standalone section. Within each section, transfer-subtree pages still nest
// under their source page so the existing transfer hierarchy survives. Search
// matches by page name (case-insensitive). Section-collapse state and the
// search query persist in localStorage so reloads keep the analyst's place.

// [P2 batch 5] L6105-6105 moved verbatim to bindings_modules.js
// [P2 batch 5] L6106-6106 moved verbatim to bindings_modules.js

function _getFtaSidebarCollapsedSet() {
    try {
        const raw = localStorage.getItem(FTA_SIDEBAR_COLLAPSE_KEY);
        return new Set(raw ? JSON.parse(raw) : []);
    } catch (_) { return new Set(); }
}
function _setFtaSidebarSectionCollapsed(sectionId, isCollapsed) {
    const set = _getFtaSidebarCollapsedSet();
    if (isCollapsed) set.add(sectionId); else set.delete(sectionId);
    try { localStorage.setItem(FTA_SIDEBAR_COLLAPSE_KEY, JSON.stringify(Array.from(set))); } catch (_) {}
}
function _getFtaSidebarSearch() {
    try { return localStorage.getItem(FTA_SIDEBAR_SEARCH_KEY) || ''; } catch (_) { return ''; }
}
function _setFtaSidebarSearch(q) {
    try { localStorage.setItem(FTA_SIDEBAR_SEARCH_KEY, q || ''); } catch (_) {}
}

function _ftaNodeVerticalSpacing() {
    const fOHeight   = _FTA_DESC_BOX_HEIGHT + 44;
    const gateHeight = 40;
    const buffer     = 60;
    return fOHeight + gateHeight + buffer + 30;   // 30 = baseline offset between fO bottom & gate
}
// [P2 batch 5] L6197-6203 moved verbatim to bindings_modules.js
function _pickDescFontSize(text) {
    const len = (text || '').length;
    for (const tier of _FTA_DESC_FONT_TIERS) {
        if (len <= tier.maxChars) return tier.font;
    }
    return 8;
}

function autoSizeNodeDescription(textarea, datum) {
    if (!textarea || !datum) return;
    const ID_H = 20, METRIC_H = 18, GAP = 3;
    const descHeight = _FTA_DESC_BOX_HEIGHT;
    // Pin the textarea height; shrink the font so content always fits inside the box.
    // setProperty(..., 'important') so the pick beats theme-level !important rules.
    textarea.style.height = descHeight + 'px';
    textarea.style.setProperty('font-size', _pickDescFontSize(textarea.value || '') + 'px', 'important');
    // Center vertically in the box AS ACTUALLY RENDERED — the flex stack may
    // shrink the textarea below descHeight, so measure clientHeight, never the
    // constant. Never clip: shrink the font until content fits, then split the
    // remaining slack into top padding. (Horizontal centering is CSS text-align.)
    try {
        textarea.style.paddingTop = '4px';
        // v66.5 — the inline CCF tag is a normal flex sibling now (fta_view
        // v66.15), so it consumes its own stack height; no reserve needed —
        // clientHeight already reflects the squeezed textarea.
        const boxH = textarea.clientHeight || descHeight;   // rendered box (flex-final)
        let fs = parseFloat(getComputedStyle(textarea).fontSize) || 12;
        textarea.style.height = 'auto';
        let contentH = textarea.scrollHeight;
        while (contentH > boxH && fs > 9) {
            fs -= 0.5;
            textarea.style.setProperty('font-size', fs + 'px', 'important');
            contentH = textarea.scrollHeight;
        }
        textarea.style.height = descHeight + 'px';
        const slack = boxH - contentH;
        textarea.style.paddingTop = slack > 2 ? (4 + slack / 2) + 'px' : '4px';
    } catch (_) { textarea.style.height = descHeight + 'px'; }
    const totalH = descHeight + GAP + ID_H + GAP + METRIC_H;
    const fo = textarea.closest('foreignObject');
    if (fo) {
        // Anchor BOTTOM at y=-30; new top is -30 - totalH.
        fo.setAttribute('y', String(-30 - totalH));
        fo.setAttribute('height', String(totalH));
    }
    datum.data.descBoxHeight = totalH;
    // Redraw the link from this node's parent into this node so it attaches at the new top.
    redrawLinkToNode(datum);
}

function redrawLinkToNode(d) {
    if (!d || !g) return;
    try {
        g.selectAll('.link').filter(l => l.target.data.id === d.data.id).attr('d', linkData => {
            const targetOffset = (linkData.target.data && linkData.target.data.descBoxHeight) ? linkData.target.data.descBoxHeight : 90;
            const midY = (linkData.source.y + 25 + linkData.target.y - targetOffset) / 2;
            return `M ${linkData.source.x} ${linkData.source.y + 25} V ${midY} H ${linkData.target.x} V ${linkData.target.y - targetOffset}`;
        });
    } catch (e) { /* ignore — link selection may not exist on initial load */ }
}

function reconfigureActiveTreeLayout() {
    const page = (ftaPages || []).find(p => p.id === activeFTAPageId);
    if (!page || !page.root) {
        if (typeof showToast === 'function') showToast('No active tree to reconfigure.', 'warning', 2200);
        return;
    }
    let cleared = 0;
    (function walk(n) {
        if (!n) return;
        if (n.xOffset) { n.xOffset = 0; cleared++; }
        if (n.yOffset) { n.yOffset = 0; cleared++; }
        const kids = n.children || n._children;
        if (kids) kids.forEach(walk);
    })(page.root);
    updateD3();
    if (typeof fitToScreen === 'function') setTimeout(fitToScreen, 50);
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
    if (typeof showToast === 'function') {
        showToast(cleared ? ('Layout reconfigured — cleared ' + cleared + ' offset' + (cleared === 1 ? '' : 's') + '.') : 'Layout already at default positions.', 'info', 2200);
    }
}

function _authSendLabel() { return 'Email me a code'; }
function _authSendBlurb() { return 'We&rsquo;ll email you a sign-in code.'; }

// Public: send a sign-in email. On the WEB this is a magic LINK — the click lands back on
// the page and detectSessionInUrl finishes sign-in. On DESKTOP we deliberately omit
// emailRedirectTo so the user finishes with the emailed 6-digit CODE via verifyEmailOtp()
// (a file:// redirect is a dead end). Resolves when Supabase has dispatched the email.
async function sendMagicLink(email) {
    const client = _initSupabaseClient();
    if (!client) throw new Error('Supabase client not available');
    const desktop = _isDesktopAuth();
    const options = { shouldCreateUser: true };
    if (!desktop) {
        // Web: where the magic-link click should land (current page, no stacked hash).
        options.emailRedirectTo = window.location.origin + window.location.pathname;
    }
    const { error } = await client.auth.signInWithOtp({
        email: String(email).trim().toLowerCase(),
        options: options
    });
    if (error) throw error;
    return { ok: true, mode: desktop ? 'code' : 'link', redirectTo: options.emailRedirectTo || null };
}

function _parseAuthInput(raw) {
    // Strip whitespace AND the invisible characters that ride along when a code is
    // copied out of a styled HTML email — a non-breaking or zero-width space makes
    // "123456" fail a digit test while looking perfectly correct on screen. .trim()
    // does not remove those.
    raw = String(raw || '').replace(/[\s\u00A0\u200B-\u200D\uFEFF]/g, '');
    if (!raw) return null;
    // Supabase's email OTP length is a PROJECT SETTING (6-10 digits), not a constant.
    // This was pinned at exactly 6 while the project issued 8 — so the app rejected
    // its own emails and no email sign-in could complete. Found 7 Aug 2026 on a live
    // code: 29215973. Do not narrow this back to a fixed length; read the setting if
    // you need to know, do not assume it.
    if (/^\d{6,10}$/.test(raw)) return { kind: 'code', token: raw, type: 'email' };
    let token = null, type = null;
    try {
        const u = new URL(raw);
        token = u.searchParams.get('token') || u.searchParams.get('token_hash');
        type  = u.searchParams.get('type');
        if (!token && u.hash) {
            const h = new URLSearchParams(u.hash.replace(/^#/, ''));
            token = h.get('token') || h.get('token_hash');
            type  = type || h.get('type');
        }
    } catch (_) {
        if (/^[A-Za-z0-9_\-]{12,}$/.test(raw)) token = raw;   // a bare token hash
    }
    if (token) return { kind: 'hash', token: token, type: type || 'email' };
    return null;
}

async function verifyEmailOtp(email, input) {
    const client = _initSupabaseClient();
    if (!client) throw new Error('Supabase client not available');
    const parsed = _parseAuthInput(input);
    if (!parsed) throw new Error('Enter the sign-in code from your email, or paste the sign-in link.');
    let res;
    if (parsed.kind === 'code') {
        res = await client.auth.verifyOtp({ email: String(email).trim().toLowerCase(), token: parsed.token, type: 'email' });
    } else {
        // Verify the token hash straight from the pasted link — no PKCE code-verifier needed,
        // so it works even though the link was opened in a different browser context.
        res = await client.auth.verifyOtp({ token_hash: parsed.token, type: parsed.type || 'email' });
    }
    if (res.error) throw res.error;
    return { ok: true, session: (res.data && res.data.session) || null };
}

async function supabaseSignOut() {
    const client = _initSupabaseClient();
    if (!client) {
        // Best-effort local sign-out if Supabase isn't available.
        try { setSignupEmail(''); } catch (_) {}
        try { refreshSigninChip(); } catch (_) {}
        return;
    }
    try { await client.auth.signOut(); } catch (e) { console.error(e); }
}

function closeSignupModal() {
    const m = document.getElementById('signup-modal');
    if (!m) return;
    m.classList.remove('show');
    setTimeout(() => m.style.display = 'none', 220);
    // Mark that the user has seen / dismissed the modal so we don't re-open on next load.
    try { localStorage.setItem('safetyLab.signup.dismissed', '1'); } catch(_) {}
}

function _signupUseDifferentEmail() {
    _signupAwaitingCode = null;
    const codeField = document.getElementById('signup-code-field');
    const emailEl = document.getElementById('signup-email');
    const submitBtn = document.getElementById('signup-submit-btn');
    const intro = document.getElementById('signup-intro');
    if (codeField) codeField.style.display = 'none';
    if (emailEl) { emailEl.removeAttribute('readonly'); emailEl.value = ''; try { emailEl.focus(); } catch (_) {} }
    if (submitBtn) { submitBtn.textContent = 'Continue'; submitBtn.disabled = false; }
    if (intro) intro.innerHTML = 'Enter your email to sign in. We&rsquo;ll email you a sign-in code.';
    try { onSignupEmailChange(); } catch (_) {}
}

function _wsToast(msg, kind){ try{ if(typeof showToast==='function'){ showToast(msg, kind||'info', 3200); return; } }catch(_){} try{ if(typeof toast==='function'){ toast(msg, kind); } }catch(_){} }
function _wsUser(){
    let email=''; try{ email=(getSignupEmail()||'').toLowerCase(); }catch(_){}
    let name=''; try{ name=localStorage.getItem('safetyLab.signup.name')||''; }catch(_){}
    return { email: email, name: name || (email ? email.split('@')[0] : 'Someone') };
}
function _wsEnsure(){
    if (typeof projectConfig === 'undefined' || !projectConfig) return false;
    if (!projectConfig.acWorkspace) projectConfig.acWorkspace = { owner:'', lock:null };
    if (!Array.isArray(projectConfig.changeLog)) projectConfig.changeLog = [];
    return true;
}
function _wsAreaRef(scope, systemId){
    if (!_wsEnsure()) return null;
    if (scope === 'system'){
        const s=(systemsData||[]).find(function(x){ return String(x.id)===String(systemId); });
        return s ? { obj:s, label:'System · ' + (s.name||s.id) } : null;
    }
    return { obj: projectConfig.acWorkspace, label:'Aircraft level' };
}
function _wsGetLock(scope, systemId){ const r=_wsAreaRef(scope,systemId); return r ? (r.obj.lock||null) : null; }
function _wsGetOwner(scope, systemId){ const r=_wsAreaRef(scope,systemId); return r ? (r.obj.owner||'') : ''; }
function _wsEditable(scope, systemId){ const l=_wsGetLock(scope,systemId); if(!l) return true; return String(l.by||'').toLowerCase() === _wsUser().email; }

function _wsLog(scope, systemId, action, summary){
    try{ _wsEnsure(); const u=_wsUser();
        projectConfig.changeLog.push({ ts:Date.now(), by:u.email, name:u.name, scope:scope, systemId:systemId||'', action:action, summary:summary });
        if (projectConfig.changeLog.length > 500) projectConfig.changeLog.splice(0, projectConfig.changeLog.length - 500);
    }catch(_){}
}
// [P2 batch 5] L6653-6653 moved verbatim to bindings_modules.js
function _wsLock(scope, systemId){
    const r=_wsAreaRef(scope,systemId); if(!r) return false;
    const u=_wsUser(); if(!u.email){ _wsToast('Sign in to lock a workspace.','warning'); return false; }
    const cur=r.obj.lock;
    if (cur && String(cur.by||'').toLowerCase() !== u.email){ _wsToast('Already locked by ' + (cur.name||cur.by) + '.','warning'); return false; }
    r.obj.lock = { by:u.email, name:u.name, at:Date.now() };
    _wsLog(scope, systemId, 'lock', 'locked ' + r.label);
    try{ scheduleAutosave(); }catch(_){}
    return true;
}
function _wsUnlock(scope, systemId, force){
    const r=_wsAreaRef(scope,systemId); if(!r) return false;
    const u=_wsUser(); const cur=r.obj.lock; if(!cur) return true;
    const mine = String(cur.by||'').toLowerCase() === u.email;
    if(!mine && !force) return false;
    r.obj.lock = null;
    _wsLog(scope, systemId, 'unlock', (mine?'released ':'override-unlocked ') + r.label);
    try{ scheduleAutosave(); }catch(_){}
    return true;
}
function _wsSetOwner(scope, systemId, email){
    const r=_wsAreaRef(scope,systemId); if(!r) return false;
    r.obj.owner = (email||'').trim().toLowerCase();
    _wsLog(scope, systemId, 'allocate', 'allocated ' + r.label + ' to ' + (r.obj.owner||'(unassigned)'));
    try{ scheduleAutosave(); }catch(_){}
    return true;
}

function _wsAttachLockBadge(hdr, id, scope, systemId) {
    if (!hdr || typeof _wsGetLock !== 'function') return;
    let b = document.getElementById(id);
    if (!b) { b = document.createElement('span'); b.id = id; b.className = 'ws-inline-lock'; hdr.appendChild(b); }
    b.onclick = function (e) { e.stopPropagation(); _wsToggleInlineLock(scope, systemId); };
    const lock = _wsGetLock(scope, systemId);
    const u = (typeof _wsUser === 'function') ? _wsUser() : { email: '' };
    const mine = lock && String(lock.by || '').toLowerCase() === (u.email || '').toLowerCase();
    if (!lock) { b.textContent = '🔓 Unlocked'; b.title = 'Click to lock this area'; b.dataset.state = 'open'; }
    else if (mine) { b.textContent = '🔒 Locked by you'; b.title = 'Click to unlock'; b.dataset.state = 'mine'; }
    else { b.textContent = '🔒 Locked by ' + (lock.name || lock.by); b.title = 'Locked by another user — click to override'; b.dataset.state = 'other'; }
}
function _wsRenderInlineLocks() {
    try {
        Object.keys(_WS_LOCK_VIEWS).forEach(function (vid) {
            const view = document.getElementById('view-' + vid);
            if (!view || view.style.display === 'none') return;
            const hdr = view.querySelector('h3, h2');
            _wsAttachLockBadge(hdr, 'wslock-' + vid, _WS_LOCK_VIEWS[vid], '');
        });
        const sw = document.getElementById('view-sys-workspace');
        if (sw && sw.style.display !== 'none') {
            const t = document.getElementById('ws-sys-title') || sw.querySelector('h2, h3');
            const sid = (typeof activeSystemId !== 'undefined') ? activeSystemId : '';
            if (t && sid) _wsAttachLockBadge(t, 'wslock-sys', 'system', sid);
        }
    } catch (_) {}
}

async function _wsToggleInlineLock(scope, systemId) {
    if (typeof _wsGetLock !== 'function') return;
    const lock = _wsGetLock(scope, systemId);
    const u = (typeof _wsUser === 'function') ? _wsUser() : { email: '' };
    const mine = lock && String(lock.by || '').toLowerCase() === (u.email || '').toLowerCase();
    const act = !lock ? 'lock' : (mine ? 'unlock' : 'override');
    const label = act === 'lock' ? 'lock this area' : (act === 'override' ? 'override another user’s lock' : 'unlock this area');
    const ok = await _wsRequirePassword(label);
    if (!ok) return;
    if (act === 'lock') _wsLock(scope, systemId);
    else if (act === 'unlock') _wsUnlock(scope, systemId, false);
    else _wsUnlock(scope, systemId, true);
    try { _wsRenderInlineLocks(); } catch (_) {}
    try { _wsApplyReadonlyNotice(_wsActiveArea.scope, _wsActiveArea.sysId); } catch (_) {}
}

function maybeAutoOpenSignup() {
    try {
        // First-launch prompt unless a signup record exists or the modal was dismissed.
        // (6 Sep 2026: the desktop "prompt to connect" branch is gone — every platform
        // signs in at the auth gate before the app opens.)
        if (getSignupEmail()) return;            // already signed in
        if (localStorage.getItem('safetyLab.signup.dismissed') === '1') return;
        // Tiny delay so it lands after the welcome modal logic if that ran first.
        setTimeout(openSignupModal, 600);
    } catch(_) {}
}

function getActiveWorkspaceId() {
    if (_activeWorkspaceId) return _activeWorkspaceId;
    try { return localStorage.getItem(ACTIVE_WS_LSKEY) || null; } catch (_) { return null; }
}
function setActiveWorkspaceId(id) {
    _activeWorkspaceId = id || null;
    try {
        if (id) localStorage.setItem(ACTIVE_WS_LSKEY, id);
        else    localStorage.removeItem(ACTIVE_WS_LSKEY);
    } catch (_) {}
    try { if (typeof startRealtimePresence === 'function') { if (id && _rtEnabled()) startRealtimePresence(); else stopRealtimePresence(); } } catch (_) {}
}
function getActiveWorkspace() {
    const id = getActiveWorkspaceId();
    return _workspaces.find(w => w.id === id) || null;
}

async function fetchWorkspaces() {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!client) return [];
    try {
        // Pull workspaces + my role in each via the join. RLS already filters to
        // workspaces I'm a member of, so no explicit user_id filter is needed.
        const { data, error } = await client
            .from('workspaces')
            .select('id, name, is_personal, owner_id, created_at, workspace_members!inner(role,user_id)')
            .order('is_personal', { ascending: false })
            .order('name', { ascending: true });
        if (error) {
            console.error('[Safety Lab Aero] fetchWorkspaces error:', error);
            return [];
        }
        // Flatten the member role onto each workspace for easy display.
        return (data || []).map(w => {
            const me = (w.workspace_members || []).find(m => m.user_id === (_supabaseSession && _supabaseSession.user && _supabaseSession.user.id));
            return Object.assign({}, w, { myRole: me ? me.role : null });
        });
    } catch (e) {
        console.error('[Safety Lab Aero] fetchWorkspaces threw:', e);
        return [];
    }
}

async function refreshWorkspaceChip() {
    const wrap = document.getElementById('workspace-chip-wrap');
    const label = document.getElementById('workspace-chip-label');
    if (!wrap || !label) return;
    // Only show the chip when we have a real Supabase session.
    const hasSession = (typeof isSupabaseSignedIn === 'function') && isSupabaseSignedIn();
    if (!hasSession) {
        wrap.style.display = 'none';
        return;
    }
    // Load (or reload) workspaces.
    _workspaces = await fetchWorkspaces();
    // If no valid active workspace is selected yet, default to where the user's
    // work actually lives — the workspace holding their most recently touched
    // project — instead of blindly Personal (which is often empty and reads as
    // "I lost everything"). Falls back to Personal/first on any hiccup.
    if (!getActiveWorkspaceId() || !_workspaces.find(w => w.id === getActiveWorkspaceId())) {
        let chosen = null;
        try {
            const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
            if (client) {
                const { data: recent } = await client
                    .from('projects')
                    .select('workspace_id, updated_at, created_at')
                    .is('deleted_at', null)
                    .order('updated_at', { ascending: false, nullsFirst: false })
                    .order('created_at', { ascending: false })
                    .limit(1);
                if (recent && recent[0] && _workspaces.find(w => w.id === recent[0].workspace_id)) {
                    chosen = recent[0].workspace_id;
                }
            }
        } catch (_) { /* non-fatal — fall through to Personal */ }
        if (!chosen) { const p = _workspaces.find(w => w.is_personal) || _workspaces[0]; chosen = p && p.id; }
        if (chosen) setActiveWorkspaceId(chosen);
    }
    const active = getActiveWorkspace();
    wrap.style.display = 'inline-block';
    label.textContent = active ? active.name : 'No workspace';
    // Also re-render the dropdown contents in case it's open.
    _renderWorkspaceMenu();
}

function _renderWorkspaceMenu() {
    const list = document.getElementById('workspace-menu-list');
    if (!list) return;
    const activeId = getActiveWorkspaceId();
    if (!_workspaces.length) {
        list.innerHTML = '<div class="workspace-menu-empty">No workspaces yet.</div>';
        return;
    }
    list.innerHTML = _workspaces.map(w => {
        const isActive = w.id === activeId;
        const roleBadge = w.myRole ? '<span class="workspace-menu-role">' + esc(w.myRole) + '</span>' : '';
        const checkmark = isActive ? '<span class="workspace-menu-check">✓</span>' : '<span class="workspace-menu-check"></span>';
        return '<button class="workspace-menu-item ' + (isActive ? 'active' : '') + '" role="menuitem" onclick="switchWorkspace(\'' + esc(w.id) + '\')">' +
            checkmark +
            '<span class="workspace-menu-name">' + esc(w.name) + (w.is_personal ? ' <span class="workspace-menu-personal">personal</span>' : '') + '</span>' +
            roleBadge +
        '</button>';
    }).join('');
}

function toggleWorkspaceMenu() {
    const menu = document.getElementById('workspace-menu');
    const chip = document.getElementById('workspace-chip');
    if (!menu) return;
    const isOpen = menu.classList.contains('open');
    if (isOpen) {
        menu.classList.remove('open');
        menu.setAttribute('aria-hidden', 'true');
        if (chip) chip.setAttribute('aria-expanded', 'false');
    } else {
        _renderWorkspaceMenu();
        menu.classList.add('open');
        menu.setAttribute('aria-hidden', 'false');
        if (chip) chip.setAttribute('aria-expanded', 'true');
    }
}

function switchWorkspace(id) {
    setActiveWorkspaceId(id);
    const w = _workspaces.find(x => x.id === id);
    if (typeof showToast === 'function' && w) {
        showToast('Switched to workspace: ' + w.name, 'success', 3200);
    }
    toggleWorkspaceMenu();         // close dropdown
    refreshWorkspaceChip();        // re-render label
}

function getActiveCloudProjectId() { return _activeCloudProjectId; }

function closeCloudProjectsModal() {
    const m = document.getElementById('cloud-projects-modal');
    if (!m) return;
    m.classList.remove('show');
    setTimeout(() => m.style.display = 'none', 220);
}

async function _loadCloudProject(projectId) {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!client || !projectId) return;
    try {
        const { data, error } = await client
            .from('project_documents')
            .select('data, version, updated_at')
            .eq('project_id', projectId)
            .maybeSingle();
        if (error) throw error;
        if (!data || !data.data) {
            if (typeof showToast === 'function') showToast('That project has no saved document yet.', 'warning', 4000);
            return;
        }
        _restoreProjectSnapshot(data.data);
        _activeCloudProjectId = projectId;
        // 31 Aug 2026 — open-from-cloud must adopt the document's identity the way
        // _applyServerRestore always has. This function used to set the project id
        // and LEAVE _activeCloudDocVersion at whatever it was: null in a fresh tab
        // (next save wrote version 1 over version N — reproduced live, v3 -> v1 on
        // f7a7bda2), stale from the previous project otherwise (next save raised a
        // spurious "changed by someone else" conflict whose Cancel branch reloaded
        // the cloud copy over the engineer's in-memory work — the 30 Aug 124-row
        // wipe). The loaded snapshot is now the authoritative working copy:
        // version token synced, dirty cleared, shrink baseline rebased, and the
        // CRDT doc told to mirror the model rather than union stale rows back in.
        _activeCloudDocVersion = (data.version != null) ? data.version : null;
        try { _dirtySinceSave = false; } catch (_) {}
        try { if (typeof window.__slCloudSyncRebase === 'function') window.__slCloudSyncRebase(); } catch (_) {}
        try { if (window.SafetyLabCRDT && typeof window.SafetyLabCRDT.adoptModel === 'function') window.SafetyLabCRDT.adoptModel(); } catch (_) {}
        try { if (typeof _rtUpdatePresenceProject === 'function') _rtUpdatePresenceProject(); } catch (_) {}
        closeCloudProjectsModal();
        if (typeof showToast === 'function') showToast('Loaded project from cloud.', 'success', 4000);
    } catch (e) {
        console.error('[Safety Lab Aero] load cloud project failed:', e);
        if (typeof showToast === 'function') showToast('Load failed: ' + (e.message || 'unknown'), 'warning', 5000);
    }
}

function openVersionHistory() {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!client) {
        if (typeof showToast === 'function') showToast('Sign in to view version history.', 'warning', 4000);
        return;
    }
    const old = document.getElementById('version-history-panel'); if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'version-history-panel';
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;background:rgba(8,12,20,.55);backdrop-filter:blur(2px);padding:24px;';
    ov.innerHTML =
        '<div style="background:var(--color-surface-1,#fff);color:var(--color-text-primary,#111);border-radius:12px;max-width:680px;width:100%;max-height:84vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.3);">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--color-border-hair);">' +
                '<div style="font-weight:700;font-size:15px;">Version history &amp; revisions</div>' +
                '<button type="button" aria-label="Close" onclick="closeVersionHistory()" style="border:none;background:transparent;font-size:20px;line-height:1;cursor:pointer;color:var(--color-text-tertiary);">&times;</button>' +
            '</div>' +
            '<div style="padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--color-border-hair);">' +
                '<div style="font-size:12px;color:var(--color-text-tertiary);">Revisions are deliberate, numbered checkpoints that go through review &amp; sign-off. Every save is kept below.</div>' +
                '<button type="button" class="action-btn btn-cyan" onclick="promptCreateRevision()" style="white-space:nowrap;">&#43; Create revision</button>' +
            '</div>' +
            '<div id="vh-body" style="overflow:auto;padding:8px 18px 18px;">Loading&hellip;</div>' +
        '</div>';
    ov.addEventListener('click', function(e) { if (e.target === ov) closeVersionHistory(); });
    document.body.appendChild(ov);
    if (!_activeCloudProjectId) {
        const body = document.getElementById('vh-body');
        if (body) body.innerHTML = '<div style="padding:16px;color:var(--color-text-tertiary);font-style:italic;">Save this project to cloud first — version history and revisions start once it has a cloud home.</div>';
        return;
    }
    _renderVersionHistory();
}

function closeVersionHistory() {
    const ov = document.getElementById('version-history-panel'); if (ov) ov.remove();
}

// 21 Aug 2026 — restores are SERVER-SIDE now, via the 20 Aug recovery RPCs.
// The old path here fetched the snapshot and pushed it back through
// saveProjectToCloud(), which the anti-wipe trigger refuses whenever the
// snapshot being restored is much smaller than the live document — a deliberate
// rollback is indistinguishable from the wipe the guard exists to stop. The
// RPCs authorise, BANK THE CURRENT STATE FIRST (so every restore is undoable
// via the returned undo_version), and write under the guard's one-statement
// sl.restore flag. The client's only jobs are to call them and reload.
async function _applyServerRestore(client, projectId, res) {
    // Pull the fresh document the server just wrote and make it the working copy.
    const { data, error } = await client.from('project_documents')
        .select('data, version').eq('project_id', projectId).maybeSingle();
    if (error) throw error;
    if (!data || !data.data) throw new Error('Restored, but the document could not be re-read.');
    _restoreProjectSnapshot(data.data);
    try { _activeCloudProjectId = projectId; } catch (_) {}
    try { _activeCloudDocVersion = (res && res.new_version != null) ? res.new_version : data.version; } catch (_) {}
    try { _dirtySinceSave = false; } catch (_) {}
    // Drop cloud_sync's shrink baseline — a deliberate rollback to a smaller
    // snapshot must not pause autosave as a suspected wipe.
    try { if (typeof window.__slCloudSyncRebase === 'function') window.__slCloudSyncRebase(); } catch (_) {}
    // 31 Aug 2026 — and the CRDT doc must mirror the restored model, or the
    // per-project IndexedDB doc unions the pre-restore rows straight back in
    // (the same resurrection _loadCloudProject suffered).
    try { if (window.SafetyLabCRDT && typeof window.SafetyLabCRDT.adoptModel === 'function') window.SafetyLabCRDT.adoptModel(); } catch (_) {}
}

async function restoreSavedVersion(version) {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!client || version == null) return;
    const projectId = (typeof _activeCloudProjectId !== 'undefined') ? _activeCloudProjectId : null;
    if (!projectId) { if (typeof showToast === 'function') showToast('Open the cloud project first.', 'warning', 4000); return; }
    if (typeof window.confirm === 'function' &&
        !window.confirm('Restore version ' + version + ' as your current working copy? Your current state is banked first, so this can be undone.')) return;
    try {
        const { data, error } = await client.rpc('sl_restore_project_version', { p_project: projectId, p_version: Number(version) });
        if (error) throw error;
        await _applyServerRestore(client, projectId, data);
        await _renderVersionHistory();
        if (typeof showToast === 'function') showToast(
            'Restored version ' + version + ' (' + ((data && data.items_after) != null ? data.items_after + ' items' : 'done') + '). '
            + 'To undo, restore version ' + (data && data.undo_version) + ' from the list.', 'success', 8000);
    } catch (e) {
        console.error('[Safety Lab Aero] restore version failed:', e);
        if (typeof showToast === 'function') showToast('Restore failed: ' + (e.message || 'unknown'), 'warning', 6000);
    }
}

async function restoreRevision(id) {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!client || !id) return;
    const projectId = (typeof _activeCloudProjectId !== 'undefined') ? _activeCloudProjectId : null;
    if (!projectId) { if (typeof showToast === 'function') showToast('Open the cloud project first.', 'warning', 4000); return; }
    if (typeof window.confirm === 'function' &&
        !window.confirm('Restore this revision as your current working copy? Your current state is banked first, so this can be undone; the sealed revision itself is unchanged.')) return;
    try {
        const { data, error } = await client.rpc('sl_restore_project_baseline', { p_project: projectId, p_baseline: id });
        if (error) throw error;
        await _applyServerRestore(client, projectId, data);
        await _renderVersionHistory();
        if (typeof showToast === 'function') showToast(
            'Restored Rev ' + ((data && data.revision_no) != null ? data.revision_no : '?')
            + ((data && data.revision_label) ? ' — ' + data.revision_label : '') + '. '
            + 'To undo, restore version ' + (data && data.undo_version) + ' from the list.', 'success', 8000);
    } catch (e) {
        console.error('[Safety Lab Aero] restore revision failed:', e);
        if (typeof showToast === 'function') showToast('Restore failed: ' + (e.message || 'unknown'), 'warning', 6000);
    }
}

async function promptCreateRevision() {
    if (!_activeCloudProjectId) {
        if (typeof showToast === 'function') showToast('Save the project to cloud before creating a revision.', 'warning', 4000);
        return;
    }
    const label = (typeof window.prompt === 'function') ? window.prompt('Name this revision (e.g. "Rev A — PDR baseline"):', '') : '';
    if (label === null) return;   // cancelled
    const note = (typeof window.prompt === 'function') ? (window.prompt('Optional note (what changed / why):', '') || null) : null;
    await createProjectRevision(label || null, note);
    await _renderVersionHistory();
}

function closeReviewsPanel() { const ov = document.getElementById('reviews-panel'); if (ov) ov.remove(); }

async function _renderReviewsList() {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    const body = document.getElementById('rv-body');
    if (!client || !body) return;
    const projectId = _activeCloudProjectId; if (!projectId) return;
    body.innerHTML = 'Loading&hellip;';
    try {
        const { data: reviews, error } = await client.from('reviews')
            .select('id, title, status, requested_by, created_at')
            .eq('project_id', projectId).order('created_at', { ascending: false });
        if (error) throw error;
        const emailMap = await _emailsForIds(client, (reviews || []).map(r => r.requested_by));
        const canRequest = ['owner', 'admin', 'editor'].indexOf((getActiveWorkspace() || {}).myRole) !== -1;
        let html = canRequest ? '<div style="display:flex;justify-content:flex-end;margin-bottom:10px;"><button type="button" class="action-btn btn-cyan" onclick="_rvShowRequestForm()">&#43; Request review</button></div>' : '';
        if (!reviews || !reviews.length) {
            html += '<div style="padding:10px 0;color:var(--color-text-tertiary);font-style:italic;font-size:13px;">No reviews yet. Request one to send this project to a reviewer or approver.</div>';
        } else {
            html += reviews.map(r =>
                '<div onclick="openReviewDetail(\'' + esc(r.id) + '\')" style="cursor:pointer;display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--color-border-hair);">' +
                    '<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:600;">' + esc(r.title || '(untitled review)') + '</div>' +
                    '<div style="font-size:11px;color:var(--color-text-tertiary);">requested by ' + esc(emailMap[r.requested_by] || '—') + ' &middot; ' + esc(r.created_at ? new Date(r.created_at).toLocaleDateString() : '—') + '</div></div>' +
                    _rvStatusBadge(r.status) +
                '</div>'
            ).join('');
        }
        body.innerHTML = html;
    } catch (e) {
        console.error('[Safety Lab Aero] reviews list failed:', e);
        body.innerHTML = '<div style="padding:12px;color:var(--color-danger);">Failed to load reviews: ' + esc(e.message || 'unknown') + '</div>';
    }
}

async function _rvShowRequestForm() {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    const body = document.getElementById('rv-body');
    if (!client || !body) return;
    const wsId = getActiveWorkspaceId();
    body.innerHTML = 'Loading team&hellip;';
    try {
        const { data: members, error } = await client.from('workspace_members')
            .select('user_id, role, users:users!inner(email)').eq('workspace_id', wsId);
        if (error) throw error;
        const myId = _supabaseSession && _supabaseSession.user && _supabaseSession.user.id;
        const pickable = (members || []).filter(m => m.user_id !== myId).map(m => ({ id: m.user_id, email: (m.users && m.users.email) || m.user_id, role: m.role }));
        let html = '<div style="font-weight:600;font-size:14px;margin-bottom:12px;">Request a review</div>';
        html += '<label style="display:block;font-size:12px;color:var(--color-text-tertiary);margin-bottom:4px;">Title</label>';
        html += '<input id="rv-title" type="text" placeholder="e.g. FHA for PDR" style="width:100%;padding:8px;border:1px solid var(--color-border-hair);border-radius:6px;margin-bottom:14px;font:inherit;box-sizing:border-box;">';
        if (!pickable.length) {
            html += '<div style="font-size:12px;color:var(--color-text-tertiary);font-style:italic;margin-bottom:14px;">No other team members yet — invite teammates in Workspace settings first.</div>';
        } else {
            html += '<label style="display:block;font-size:12px;color:var(--color-text-tertiary);margin-bottom:4px;">Reviewers</label>';
            html += '<div style="margin-bottom:14px;max-height:140px;overflow:auto;border:1px solid var(--color-border-hair);border-radius:6px;padding:6px 10px;">' +
                pickable.map(o => '<label style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:13px;"><input type="checkbox" class="rv-reviewer" value="' + esc(o.id) + '"> ' + esc(o.email) + ' <span style="color:var(--color-text-tertiary);font-size:11px;">' + esc(o.role) + '</span></label>').join('') +
                '</div>';
            html += '<label style="display:block;font-size:12px;color:var(--color-text-tertiary);margin-bottom:4px;">Approver (final sign-off authority)</label>';
            html += '<select id="rv-approver" style="width:100%;padding:8px;border:1px solid var(--color-border-hair);border-radius:6px;margin-bottom:16px;font:inherit;box-sizing:border-box;"><option value="">— none —</option>' +
                pickable.map(o => '<option value="' + esc(o.id) + '">' + esc(o.email) + '</option>').join('') + '</select>';
        }
        html += '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
            '<button type="button" class="action-btn" onclick="_renderReviewsList()">Cancel</button>' +
            '<button type="button" class="action-btn btn-cyan" onclick="submitReviewRequest()">Send for review</button></div>';
        html += '<div id="rv-form-status" style="font-size:12px;margin-top:8px;"></div>';
        body.innerHTML = html;
    } catch (e) {
        console.error('[Safety Lab Aero] request form failed:', e);
        body.innerHTML = '<div style="padding:12px;color:var(--color-danger);">Failed to load team: ' + esc(e.message || 'unknown') + '</div>';
    }
}

async function submitReviewRequest() {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!client) return;
    const statusEl = document.getElementById('rv-form-status');
    const projectId = _activeCloudProjectId;
    const userId = _supabaseSession && _supabaseSession.user && _supabaseSession.user.id;
    if (!projectId || !userId) return;
    const title = ((document.getElementById('rv-title') || {}).value || '').trim();
    const reviewers = Array.from(document.querySelectorAll('.rv-reviewer:checked')).map(c => c.value);
    const approver = (document.getElementById('rv-approver') || {}).value || '';
    if (!title) { if (statusEl) { statusEl.textContent = 'Add a title.'; statusEl.style.color = 'var(--color-danger)'; } return; }
    if (!reviewers.length && !approver) { if (statusEl) { statusEl.textContent = 'Pick at least one reviewer or an approver.'; statusEl.style.color = 'var(--color-danger)'; } return; }
    try {
        const { data: review, error } = await client.from('reviews')
            .insert({ project_id: projectId, title: title, scope: 'project', status: 'in_review', requested_by: userId })
            .select('id').single();
        if (error) throw error;
        const rows = [];
        reviewers.forEach(uid => { if (uid !== approver) rows.push({ review_id: review.id, user_id: uid, role: 'reviewer' }); });
        if (approver) rows.push({ review_id: review.id, user_id: approver, role: 'approver' });
        if (rows.length) {
            const { error: aErr } = await client.from('review_assignments').insert(rows);
            if (aErr) throw aErr;
        }
        if (typeof showToast === 'function') showToast('Review requested: ' + title, 'success', 4000);
        openReviewDetail(review.id);
    } catch (e) {
        console.error('[Safety Lab Aero] submit review failed:', e);
        if (statusEl) { statusEl.textContent = 'Failed: ' + (e.message || 'unknown'); statusEl.style.color = 'var(--color-danger)'; }
    }
}

async function recordMyReviewDecision(reviewId, decision) {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!client || !reviewId) return;
    const userId = _supabaseSession && _supabaseSession.user && _supabaseSession.user.id;
    try {
        const { error } = await client.from('review_assignments')
            .update({ decision: decision, decided_at: new Date().toISOString() })
            .eq('review_id', reviewId).eq('user_id', userId);
        if (error) throw error;
        await openReviewDetail(reviewId);
        if (typeof showToast === 'function') showToast(decision === 'approved' ? 'Approved.' : 'Changes requested.', 'success', 3500);
    } catch (e) {
        console.error('[Safety Lab Aero] decision failed:', e);
        if (typeof showToast === 'function') showToast('Could not record decision: ' + (e.message || 'unknown'), 'warning', 5000);
    }
}

async function setReviewStatus(reviewId, status) {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!client || !reviewId) return;
    try {
        const { error } = await client.from('reviews').update({ status: status, decided_at: new Date().toISOString() }).eq('id', reviewId);
        if (error) throw error;
        await openReviewDetail(reviewId);
        if (typeof showToast === 'function') showToast('Review ' + status.replace(/_/g, ' ') + '.', 'success', 3500);
    } catch (e) {
        console.error('[Safety Lab Aero] set status failed:', e);
        if (typeof showToast === 'function') showToast('Could not update: ' + (e.message || 'unknown'), 'warning', 5000);
    }
}

async function addReviewComment(reviewId) {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    const input = document.getElementById('rv-comment');
    if (!client || !input || !reviewId) return;
    const text = (input.value || '').trim();
    if (!text) return;
    const userId = _supabaseSession && _supabaseSession.user && _supabaseSession.user.id;
    try {
        const { error } = await client.from('review_comments').insert({ review_id: reviewId, body: text, author: userId });
        if (error) throw error;
        input.value = '';
        await openReviewDetail(reviewId);
    } catch (e) {
        console.error('[Safety Lab Aero] comment failed:', e);
        if (typeof showToast === 'function') showToast('Could not post comment: ' + (e.message || 'unknown'), 'warning', 5000);
    }
}

async function openSignoffModal(reviewId) {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!client || !reviewId) return;
    const sess = _supabaseSession;
    const email = sess && sess.user && sess.user.email;
    const userId = sess && sess.user && sess.user.id;
    // My role on this review (approver if assigned as one, else reviewer).
    let myRole = 'reviewer';
    try {
        const { data: asg } = await client.from('review_assignments').select('role').eq('review_id', reviewId).eq('user_id', userId);
        if ((asg || []).some(a => a.role === 'approver')) myRole = 'approver';
    } catch (_) { /* default reviewer */ }
    // The exact analysis fingerprint this signature will bind to.
    const hash = (await _canonicalHash(_buildProjectSnapshot())) || ('nohash-' + Date.now());
    const old = document.getElementById('signoff-modal'); if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'signoff-modal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483601;display:flex;align-items:center;justify-content:center;background:rgba(8,12,20,.6);padding:24px;';
    ov.innerHTML =
        '<div style="background:var(--color-surface-1,#fff);color:var(--color-text-primary,#111);border-radius:12px;max-width:460px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.35);">' +
            '<div style="padding:16px 18px;border-bottom:1px solid var(--color-border-hair);font-weight:700;">Sign off</div>' +
            '<div style="padding:16px 18px;">' +
                '<div style="font-size:12px;color:var(--color-text-tertiary);margin-bottom:10px;">Signing as <strong>' + esc(email || '') + '</strong> (' + esc(myRole) + '). Your signature binds to this exact analysis fingerprint:</div>' +
                '<div style="font-family:monospace;font-size:11px;background:var(--color-surface-2,#f3f4f6);padding:8px;border-radius:6px;margin-bottom:14px;word-break:break-all;">' + esc(hash) + '</div>' +
                '<label style="display:block;font-size:12px;color:var(--color-text-tertiary);margin-bottom:4px;">Decision</label>' +
                '<select id="so-decision" style="width:100%;padding:8px;border:1px solid var(--color-border-hair);border-radius:6px;margin-bottom:12px;font:inherit;box-sizing:border-box;"><option value="approve">Approve</option><option value="reject">Reject</option></select>' +
                '<label style="display:block;font-size:12px;color:var(--color-text-tertiary);margin-bottom:4px;">Statement</label>' +
                '<input id="so-meaning" type="text" value="I approve this analysis for release." style="width:100%;padding:8px;border:1px solid var(--color-border-hair);border-radius:6px;margin-bottom:12px;font:inherit;box-sizing:border-box;">' +
                '<label style="display:block;font-size:12px;color:var(--color-text-tertiary);margin-bottom:4px;">Re-enter your password to sign</label>' +
                '<input id="so-password" type="password" placeholder="Password" autocomplete="current-password" style="width:100%;padding:8px;border:1px solid var(--color-border-hair);border-radius:6px;margin-bottom:14px;font:inherit;box-sizing:border-box;">' +
                '<div id="so-status" style="font-size:12px;margin-bottom:10px;"></div>' +
                '<div style="display:flex;gap:8px;justify-content:flex-end;"><button type="button" class="action-btn" onclick="closeSignoffModal()">Cancel</button><button type="button" class="action-btn btn-cyan" onclick="submitSignoff(\'' + esc(reviewId) + '\',\'' + esc(hash) + '\',\'' + esc(myRole) + '\')">Sign</button></div>' +
            '</div>' +
        '</div>';
    document.body.appendChild(ov);
}

function closeSignoffModal() { const ov = document.getElementById('signoff-modal'); if (ov) ov.remove(); }

async function submitSignoff(reviewId, baselineSha, roleAtSigning) {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!client || !reviewId) return;
    const statusEl = document.getElementById('so-status');
    const sess = _supabaseSession;
    const email = sess && sess.user && sess.user.email;
    const userId = sess && sess.user && sess.user.id;
    const decision = (document.getElementById('so-decision') || {}).value || 'approve';
    const meaning = ((document.getElementById('so-meaning') || {}).value || '').trim();
    const password = (document.getElementById('so-password') || {}).value || '';
    if (!password) { if (statusEl) { statusEl.textContent = 'Enter your password to sign.'; statusEl.style.color = 'var(--color-danger)'; } return; }
    if (statusEl) { statusEl.textContent = 'Verifying identity…'; statusEl.style.color = 'var(--color-text-tertiary)'; }
    try {
        // Re-authenticate: identity + intent. Verifies the signer is really them.
        const { error: authErr } = await client.auth.signInWithPassword({ email: email, password: password });
        if (authErr) { if (statusEl) { statusEl.textContent = 'Password incorrect — not signed.'; statusEl.style.color = 'var(--color-danger)'; } return; }
        const projectId = _activeCloudProjectId;
        // Link to a sealed revision if the signed fingerprint matches one.
        let baselineId = null;
        try {
            const { data: b } = await client.from('project_baselines').select('id').eq('project_id', projectId).eq('sha256', baselineSha).order('version_no', { ascending: false }).limit(1).maybeSingle();
            baselineId = b ? b.id : null;
        } catch (_) { /* optional link */ }
        const { error } = await client.from('signoffs').insert({
            review_id: reviewId, project_id: projectId, baseline_id: baselineId, baseline_sha256: baselineSha,
            signer_user_id: userId, signer_email: email, role_at_signing: roleAtSigning,
            decision: decision, meaning: meaning || null, auth_assurance: 'password_reauth',
            user_agent: (typeof navigator !== 'undefined' ? navigator.userAgent : null)
        });
        if (error) throw error;
        closeSignoffModal();
        await openReviewDetail(reviewId);
        if (typeof showToast === 'function') showToast('Signed: ' + decision + '.', 'success', 4000);
    } catch (e) {
        console.error('[Safety Lab Aero] sign-off failed:', e);
        if (statusEl) { statusEl.textContent = 'Sign-off failed: ' + (e.message || 'unknown'); statusEl.style.color = 'var(--color-danger)'; }
    }
}

async function openSignatureCertificate(reviewId) {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!client || !reviewId) return;
    try {
        const [revRes, soRes] = await Promise.all([
            client.from('reviews').select('id, title, status').eq('id', reviewId).maybeSingle(),
            client.from('signoffs').select('id, signer_email, role_at_signing, decision, meaning, baseline_sha256, ts').eq('review_id', reviewId).order('id', { ascending: true })
        ]);
        const review = revRes.data || {};
        const signoffs = soRes.data || [];
        const rows = signoffs.map(s =>
            '<tr>' +
                '<td style="padding:6px 10px;border-bottom:1px solid #ddd;">' + esc(s.signer_email || '—') + '</td>' +
                '<td style="padding:6px 10px;border-bottom:1px solid #ddd;text-transform:uppercase;">' + esc(s.role_at_signing) + '</td>' +
                '<td style="padding:6px 10px;border-bottom:1px solid #ddd;color:' + (s.decision === 'approve' ? '#1a8f3c' : '#c0392b') + ';font-weight:600;text-transform:uppercase;">' + esc(s.decision) + '</td>' +
                '<td style="padding:6px 10px;border-bottom:1px solid #ddd;">' + esc(s.meaning || '') + '</td>' +
                '<td style="padding:6px 10px;border-bottom:1px solid #ddd;font-family:monospace;font-size:10px;">' + esc((s.baseline_sha256 || '').slice(0, 24)) + '&hellip;</td>' +
                '<td style="padding:6px 10px;border-bottom:1px solid #ddd;font-size:11px;">' + esc(s.ts ? new Date(s.ts).toLocaleString() : '') + '</td>' +
            '</tr>'
        ).join('');
        const w = window.open('', '_blank');
        if (!w) { if (typeof showToast === 'function') showToast('Allow pop-ups to view the certificate.', 'warning', 4000); return; }
        w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Signature Certificate</title>' +
            '<style>body{font-family:-apple-system,Arial,sans-serif;color:#111;margin:40px auto;padding:0 20px;}h1{font-size:20px;margin-bottom:4px;}table{border-collapse:collapse;width:100%;font-size:13px;margin-top:16px;}th{text-align:left;padding:6px 10px;border-bottom:2px solid #333;font-size:11px;text-transform:uppercase;color:#555;}</style>' +
            '</head><body>' +
            '<h1>Safety Lab Aero — Signature Certificate</h1>' +
            '<div style="color:#555;font-size:13px;">Review: <strong>' + esc(review.title || '') + '</strong> &middot; Status: ' + esc(review.status || '') + '</div>' +
            '<div style="color:#555;font-size:12px;margin-top:6px;">Generated ' + esc(new Date().toLocaleString()) + '. Each signature is bound to the analysis fingerprint shown and recorded in an append-only, hash-chained ledger; any later alteration of a signed record is detectable.</div>' +
            (signoffs.length ? '<table><thead><tr><th>Signatory</th><th>Role</th><th>Decision</th><th>Statement</th><th>Analysis fingerprint</th><th>Signed</th></tr></thead><tbody>' + rows + '</tbody></table>' : '<p style="color:#888;font-style:italic;margin-top:20px;">No signatures recorded.</p>') +
            '<p style="margin-top:24px;color:#999;font-size:11px;">Use your browser Print command to save this certificate as a PDF.</p>' +
            '</body></html>');
        w.document.close();
    } catch (e) {
        console.error('[Safety Lab Aero] certificate failed:', e);
        if (typeof showToast === 'function') showToast('Could not open certificate: ' + (e.message || 'unknown'), 'warning', 5000);
    }
}

async function verifySignoffLedger() {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!client) return;
    try {
        const { data, error } = await client.rpc('verify_signoff_chain');
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (row && row.ok) {
            if (typeof showToast === 'function') showToast('Signature ledger intact — ' + (row.checked || 0) + ' verified.', 'success', 5000);
        } else {
            if (typeof showToast === 'function') showToast('LEDGER INTEGRITY FAILED at signature #' + (row && row.first_bad_id) + ' — tampering detected.', 'warning', 9000);
        }
    } catch (e) {
        console.error('[Safety Lab Aero] verify ledger failed:', e);
        if (typeof showToast === 'function') showToast('Could not verify ledger: ' + (e.message || 'unknown'), 'warning', 5000);
    }
}

async function openWorkspaceSettings() {
    try { toggleWorkspaceMenu(); } catch (_) {}     // close the dropdown if open
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    if (!client) {
        if (typeof showToast === 'function') showToast('Sign in to manage workspaces.', 'warning', 4000);
        return;
    }
    const ws = getActiveWorkspace();
    if (!ws) {
        if (typeof showToast === 'function') showToast('No active workspace selected.', 'warning', 4000);
        return;
    }
    const m = document.getElementById('workspace-settings-modal');
    if (!m) return;
    m.style.display = 'flex';
    setTimeout(() => m.classList.add('show'), 10);
    const nameEl = document.getElementById('ws-settings-name');
    const roleEl = document.getElementById('ws-settings-role');
    if (nameEl) nameEl.textContent = ws.name || '—';
    if (roleEl) roleEl.textContent = ws.myRole || '—';
    const statusEl = document.getElementById('ws-invite-status');
    if (statusEl) statusEl.textContent = '';
    // 31 Aug 2026 — the single email input became a repeatable row; seed one empty row.
    try { wsResetInviteRows(); } catch (_) {}
    await _renderWorkspaceMembers();
    try { await _renderPendingInvitations(); } catch (_) {}   // 31 Aug 2026 — outstanding invites
}

function closeWorkspaceSettings() {
    const m = document.getElementById('workspace-settings-modal');
    if (!m) return;
    m.classList.remove('show');
    setTimeout(() => m.style.display = 'none', 220);
}

async function updateWorkspaceMemberRole(userId, newRole) {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    const statusEl = document.getElementById('ws-invite-status');
    if (!client || !userId) return;
    const wsId = getActiveWorkspaceId();
    if (!wsId) return;
    if (['admin', 'editor', 'reviewer', 'viewer'].indexOf(newRole) === -1) return;
    try {
        const { error } = await client
            .from('workspace_members')
            .update({ role: newRole })
            .eq('workspace_id', wsId)
            .eq('user_id', userId);
        if (error) throw error;
        if (statusEl) { statusEl.textContent = 'Role updated to ' + newRole + '.'; statusEl.style.color = 'var(--color-text-secondary)'; }
    } catch (e) {
        console.error('[Safety Lab Aero] update role failed:', e);
        if (statusEl) { statusEl.textContent = 'Update failed: ' + (e.message || 'unknown'); statusEl.style.color = 'var(--color-danger)'; }
    }
    await _renderWorkspaceMembers();
}

async function removeWorkspaceMember(userId) {
    const client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
    const statusEl = document.getElementById('ws-invite-status');
    if (!client || !userId) return;
    const wsId = getActiveWorkspaceId();
    if (!wsId) return;
    if (typeof window.confirm === 'function' &&
        !window.confirm('Remove this member from the workspace? They will lose access to its projects.')) return;
    try {
        const { error } = await client
            .from('workspace_members')
            .delete()
            .eq('workspace_id', wsId)
            .eq('user_id', userId);
        if (error) throw error;
        if (statusEl) { statusEl.textContent = 'Member removed.'; statusEl.style.color = 'var(--color-text-secondary)'; }
    } catch (e) {
        console.error('[Safety Lab Aero] remove member failed:', e);
        if (statusEl) { statusEl.textContent = 'Remove failed: ' + (e.message || 'unknown'); statusEl.style.color = 'var(--color-danger)'; }
    }
    await _renderWorkspaceMembers();
}

function _markStructureChangeObsolete(reason) {
    let touched = 0;
    function flag(req) {
        if (!req || !req.reqSource || req.status === 'archived') return;
        // Only flag generators whose targets depend on FTA structure.
        // 8 Aug 2026 (SL-ARC-0001 §20 D4): this list previously named three ids
        // NOTHING emits (gate-independence, fha, fha-quant — plus fha-similarity,
        // a label-table phantom), so structural edits never immediately staled
        // the gate-independence and FHA-target families; the gap closed only on
        // the next AutoReq run. These are the ids the generators actually write.
        const g = String(req.reqSource.generator || '');
        if (g !== 'fta-event' && g !== 'fta-interval' && g !== 'dalgebra' && g !== 'dalgebra-default' && g.indexOf('gate-indep') !== 0 && g !== 'fha-prob' && g !== 'fha-dal') return;
        req.reqSource.stale = true;
        req.reqSource.staleReason = reason || 'FTA structure changed; regenerate AutoReq to refresh targets.';
        touched++;
    }
    (acReqData || []).forEach(flag);
    (systemsData || []).forEach(s => (s.req || []).forEach(flag));
    if (touched > 0) {
        // Defer renders to the calling site's normal flow.
        if (typeof console !== 'undefined') console.log('[SafetyLab] Phase 53.49 — structural change flagged ' + touched + ' AutoReq req(s) as stale: ' + reason);
    }
    return touched;
}

function _autoMirrorIntoVerification(newNode, sourcePage, parentInSource) {
    if (!sourcePage || sourcePage.verifies) return false;   // we ARE in the verification side; nothing to do
    const mirror = (ftaPages || []).find(p => p.verifies === sourcePage.id);
    if (!mirror || !mirror.root) return false;
    // Find the parent in the mirror by logicalId.
    const parentLid = parentInSource && (parentInSource.logicalId != null ? parentInSource.logicalId : parentInSource.id);
    if (parentLid == null) return false;
    const mirrorParent = _findNodeByLogicalId(mirror.root, parentLid);
    if (!mirrorParent) return false;   // mirror has diverged; user must reconcile manually
    // Clone newNode for the mirror with blanked leaf values + same logicalId.
    const mirrorClone = _cloneSubtreeForVerification(newNode, /*blankValues=*/true);
    if (!mirrorParent.children) mirrorParent.children = [];
    mirrorParent.children.push(mirrorClone);
    return true;
}

function onFtaCalcModeChange() {
    const sel = document.getElementById('fta-calc-mode');
    if (!sel) return;
    const newMode = sel.value;
    const page = ftaPages.find(p => p.id === activeFTAPageId);
    const oldMode = (page && page.mode) || ftaConfig.mode || 'bottom-up';
    const hasContent = !!(page && page.root && (
        (page.root.children && page.root.children.length > 0) ||
        (page.root._children && page.root._children.length > 0)
    ));
    // Top-Down → Bottom-Up on a developed tree triggers the verification-mirror offer.
    // Phase 53.69 — EDU tier doesn't have V&V mirror trees, so we skip the offer entirely.
    const canMirror = (typeof canUseVerificationTree !== 'function') || canUseVerificationTree();
    if (newMode === 'bottom-up' && oldMode === 'top-down' && hasContent && page && canMirror) {
        const wantsMirror = confirm(
            'You\'re on a top-down allocation tree. Switching this tree to Bottom-Up would lose the apportioned λ values you\'ve built.\n\n' +
            'OK — Create a Verification Mirror tree:\n' +
            '  • clones the structure to a new page\n' +
            '  • blanks every leaf so you can enter real implementation values\n' +
            '  • mode is set to Bottom-Up\n' +
            '  • the calculated top-event probability becomes verification evidence for your allocations\n\n' +
            'Cancel — keep this tree as-is and abort the mode switch.'
        );
        if (wantsMirror) {
            // Build the mirror without flipping the current page's mode.
            createVerificationTreeFromActive();
            // Restore the dropdown to the original mode for the source page; the new page is now active so the dropdown will update via _refreshFtaToolbarLayout()/syncFtaConfigFromActivePage.
            return;
        } else {
            // User aborted — restore dropdown to oldMode.
            sel.value = oldMode;
            return;
        }
    }
    // All other transitions just update the active page's mode and the global view state.
    if (page) page.mode = newMode;
    syncFTAConfig();
}

function _syncMirrorOwnershipFromSource(sourcePage) {
    if (!sourcePage || sourcePage.verifies) return false;
    const mirror = (ftaPages || []).find(p => p.verifies === sourcePage.id);
    if (!mirror) return false;
    mirror.treeLevel    = sourcePage.treeLevel || 'standalone';
    mirror.systemId     = sourcePage.systemId;
    mirror.linkedFhaId  = sourcePage.linkedFhaId;
    mirror.linkedFhaIds = Array.isArray(sourcePage.linkedFhaIds) ? sourcePage.linkedFhaIds.slice() : undefined;
    if (typeof sourcePage.targetP === 'number') mirror.targetP = sourcePage.targetP;
    mirror.missionProfileId = sourcePage.missionProfileId || '';   // Phase 76 — same exposure basis
    return true;
}

function propagateDalFromTrueRoot() {
    // A5 (22 Aug 2026) — the reactive sweep is ALL ROOT FAMILIES now. The old body
    // cleared EVERY page's DALs and then allocated only the ACTIVE family, so at any
    // instant the in-memory project carried exactly one family's derivations — the
    // register (genDALgebra) could never see two trees disagree, and non-active
    // families showed stale or empty DAL badges until visited. Measured live on the
    // K350 before this change: 34 pages, DALs present on ONE (the last family swept),
    // which was not the active page's family. One code path for canvas and register.
    propagateDalAllRoots();
}

// A5 — allocate every seeded root family in one pass. Per family the derivation is
// exactly the old propagateDalFromTrueRoot (same allocateDAL, same strictest-lid
// smoothing INSIDE the family); families remain separate derivations — nothing here
// merges reduction arguments across trees. That register-side max is genDALgebra's.
// The legacy ftaConfig.linkedFhaId fallback still applies — but only to the ACTIVE
// family's root, exactly the page the legacy channel was scoped to.
function propagateDalAllRoots() {
    if (typeof ftaPages === 'undefined' || !Array.isArray(ftaPages)) return 0;
    const activeRoot = (typeof getRootAncestorPageOfActive === 'function') ? getRootAncestorPageOfActive() : null;
    // Resolve each root family's seed FIRST: if nothing is seeded, leave existing
    // DALs untouched (the old "No seed" early-return, kept project-wide).
    const jobs = [];
    ftaPages.forEach(p => {
        if (!p || !p.root || p.verifies) return;
        if (typeof getRootAncestorPage === 'function' && getRootAncestorPage(p) !== p) return;   // roots only
        // A11 (22 Aug 2026, live-found during the A5 verify, parked then unparked):
        // a page linked ONLY via linkedFhaIds[] (the newer multi-FHA UI) never
        // seeded — the old expression read the array only when the LEGACY field
        // was also set. The array is a first-class seed source now; the legacy
        // scalar remains the fallback.
        let linkedFhaId = ((Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length ? p.linkedFhaIds[0] : null)
            || p.linkedFhaId || '') || '';
        // Legacy single-page channel: ftaConfig seeds the active family only.
        if (!linkedFhaId && activeRoot && p.id === activeRoot.id && typeof ftaConfig === 'object' && ftaConfig) {
            linkedFhaId = ftaConfig.linkedFhaId || '';
        }
        if (!linkedFhaId) return;
        // 20 Aug 2026 ruling preserved: both id forms go through the one resolver
        // (AC first, then every system, string-coerced compare — see #51).
        const fha = (typeof _resolveLinkedFha === 'function') ? _resolveLinkedFha(linkedFhaId) : null;
        if (!fha) return;
        const topDal = (typeof getSafetyTarget === 'function') ? getSafetyTarget(fha.severity).dal : null;
        if (!topDal) return;
        jobs.push({ page: p, topDal: topDal });
    });
    if (!jobs.length) return 0;   // No seed anywhere — leave existing DALs untouched.
    clearAllAllocations();
    // A6 — one failed-pair index for the whole pass (open CMA common modes are global).
    const cmaSet = (typeof _cmaCompromisedIndex === 'function') ? _cmaCompromisedIndex()
                 : ((typeof _cmaCompromisedGateIdSet === 'function') ? _cmaCompromisedGateIdSet() : null);
    jobs.forEach(j => {
        allocateDAL(j.page.root, j.topDal, new Set(), cmaSet);
        // Phase 56.48a — strictest DAL across shared logicalIds WITHIN the family
        // (one component must satisfy its strictest position in this derivation).
        _propagateStrictestDALAcrossSharedEvents(j.page.root);
    });
    return jobs.length;
}

function _propagateStrictestDALAcrossSharedEvents(rootNode) {
    if (!rootNode) return;
    const buckets = new Map();   // logicalId → [nodes...]
    const visited = new Set();
    (function gather(n) {
        if (!n) return;
        if (n.gateType === 'TRANSFER' || n.transferOutTo) {
            const linkedId = n.transferOutTo || n.linkedPageId;
            if (linkedId && !visited.has(linkedId)) {
                visited.add(linkedId);
                const linkedPage = (typeof ftaPages !== 'undefined') ? ftaPages.find(p => p.id === linkedId) : null;
                if (linkedPage && linkedPage.root) gather(linkedPage.root);
            }
            return;
        }
        const lid = n.logicalId != null ? n.logicalId : n.id;
        const arr = buckets.get(lid) || [];
        arr.push(n);
        buckets.set(lid, arr);
        const kids = n.children || n._children;
        if (kids) kids.forEach(gather);
    })(rootNode);
    buckets.forEach((arr) => {
        if (arr.length < 2) return;
        let strict = null;
        arr.forEach(n => {
            if (n.allocatedDAL) strict = dalMax(strict, n.allocatedDAL);
        });
        if (!strict) return;
        arr.forEach(n => { n.allocatedDAL = strict; });
    });
}

function refreshFtaMissionProfileDropdown() {
    const sel = document.getElementById('fta-mission-profile');
    if (!sel) return;
    let html = '<option value="">Standard (default)</option>';
    _missionProfiles().forEach(p => { html += `<option value="${esc(p.id)}">${esc(p.name)}</option>`; });
    sel.innerHTML = html;
    sel.value = (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.missionProfileId) ? ftaConfig.missionProfileId : '';
    // Phase 76 — a verification mirror inherits its source's profile; lock the control on mirrors.
    const _ap = (typeof ftaPages !== 'undefined') ? ftaPages.find(p => p.id === activeFTAPageId) : null;
    sel.disabled = !!(_ap && _ap.verifies);
}
function onFtaMissionProfileChange() {
    const sel = document.getElementById('fta-mission-profile');
    const page = (typeof ftaPages !== 'undefined') ? ftaPages.find(p => p.id === activeFTAPageId) : null;
    if (!sel) return;
    const val = sel.value || '';
    ftaConfig.missionProfileId = val;
    if (page) page.missionProfileId = val;
    // Phase 76 — a verification mirror must follow its source's exposure basis.
    if (page && typeof _syncMirrorOwnershipFromSource === 'function') _syncMirrorOwnershipFromSource(page);
    // Re-pull exposure under the new profile's durations when on auto + linked to an FHA.
    if ((ftaConfig.exposureSource || 'auto') === 'auto' && ftaConfig.linkedFhaId && typeof syncFTAExposureFromFHA === 'function') {
        syncFTAExposureFromFHA();
        const expInput = document.getElementById('fta-exposure-time');
        if (expInput) expInput.value = ftaConfig.exposureTime;
    }
    if (typeof refreshTopAllocatorReadout === 'function') refreshTopAllocatorReadout();
    if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities();
    if (typeof updateD3 === 'function') updateD3();
    if (typeof scheduleAutosave === 'function') scheduleAutosave();
}

function updateFTAConfigUI() {
    let mode = document.getElementById('fta-calc-mode').value;
    // Phase 53.28 — toolbar layout depends on mode (Apportionment + Target Rate hide in bottom-up).
    if (typeof _refreshFtaToolbarLayout === 'function') _refreshFtaToolbarLayout();
    document.getElementById('fta-apportion').disabled = mode === 'bottom-up';
    // Phase 32a — keep the exposure-time input + auto-toggle in step with ftaConfig.
    // The input is always editable (typing flips auto off when the value diverges from the
    // FHA-derived one). The checkbox only governs whether a fresh FHA-link / load event
    // re-pulls the value.
    const expInput = document.getElementById('fta-exposure-time');
    const expAuto  = document.getElementById('fta-exposure-auto');
    if (expInput) {
        expInput.value = ftaConfig.exposureTime || 1;
        expInput.disabled = false;
    }
    if (expAuto)  expAuto.checked  = (ftaConfig.exposureSource || 'auto') === 'auto';
    if (typeof refreshTopAllocatorReadout === 'function') refreshTopAllocatorReadout();
    // Target Rate: disabled in bottom-up, or when a hazard is linked and override is off
    // (the regulation drives the value in that case).
    const hazardLinked = !!document.getElementById('fta-fha-link').value;
    const overrideOn = !!(document.getElementById('fta-target-override') && document.getElementById('fta-target-override').checked);
    document.getElementById('fta-target-p').disabled = (mode === 'bottom-up') || (hazardLinked && !overrideOn);
    let linkSel = document.getElementById('fta-fha-link'); let currentVal = linkSel.value; linkSel.innerHTML = '<option value="">-- No Link (1 Hr Default) --</option>'; let acGroup = '<optgroup label="Aircraft FHA">'; acFhaData.forEach(d => acGroup += `<option value="AC_${esc(d.internalId)}">${esc(d.fcId)}: ${esc((d.fcDesc||'').substring(0,25))}...</option>`); acGroup += '</optgroup>'; let sysGroup = '<optgroup label="System FHA">'; getAllSysFha().forEach(d => sysGroup += `<option value="SYS_${esc(d.internalId)}">${esc(d.fcId)}: ${esc((d.fcDesc||'').substring(0,25))}...</option>`); sysGroup += '</optgroup>'; linkSel.innerHTML += acGroup + sysGroup; linkSel.value = currentVal; if(selectedNodeData) { let isEvent = selectedNodeData.type !== 'gate' && selectedNodeData.gateType !== 'TRANSFER'; const isRoot = (typeof getActiveFTARoot === 'function') ? (getActiveFTARoot() === selectedNodeData) : false; const isGate = selectedNodeData.type === 'gate' && selectedNodeData.gateType !== 'TRANSFER'; document.getElementById('config-lambda-container').style.display = isEvent ? 'block' : 'none'; const showWeight = !isRoot && mode === 'top-down' && ftaConfig.apportion === 'weighted'; document.getElementById('config-weight-container').style.display = showWeight ? 'block' : 'none'; if (showWeight && typeof syncWeightSliderFromNode === 'function') syncWeightSliderFromNode(); document.getElementById('config-voting-container').style.display = (selectedNodeData.gateType === 'VOTING') ? 'block' : 'none'; document.getElementById('config-lambda').disabled = mode === 'top-down'; if(isEvent && mode === 'top-down') { document.getElementById('config-lambda').value = selectedNodeData.lambda; } const prescribedC = document.getElementById('config-prescribed-container'); if (prescribedC) { prescribedC.style.display = isGate ? 'flex' : 'none'; if (isGate && typeof syncPrescribedFromNode === 'function') syncPrescribedFromNode(); } } }

// Phase 56.38 — paste-origin constraint helper. Mirrors _getExternalSourceTarget
// for nodes that carry an allocation snapshot from a cross-tree paste. Returns
// the snapshot probability if present and unoverridden, else null. The
// allocator applies conservative-merge by combining this with any externalSource
// target and taking the strictest (smallest) value.
function _getPasteOriginTarget(node) {
    if (!node || !node._pasteOrigin) return null;
    if (node._pasteOriginDismissed) return null;
    if (typeof node._pasteOverrideProb === 'number' && isFinite(node._pasteOverrideProb)) {
        return node._pasteOverrideProb > 0 ? node._pasteOverrideProb : null;
    }
    const p = node._pasteOrigin.snapshotProb;
    return (typeof p === 'number' && isFinite(p) && p > 0) ? p : null;
}

function _getPrescribedTarget(node) {
    if (!node || node.type !== 'gate') return null;
    if (!node.prescribedRate) return null;
    const p = node.prescribedProb;
    if (typeof p !== 'number' || !isFinite(p) || p < 0 || p > 1) return null;
    return p;
}

function onWeightSliderInput(rawValue) {
    if (!selectedNodeData) return;
    const info = _findParentAndSiblings(selectedNodeData);
    if (!info) return;
    const requested = parseFloat(rawValue);
    if (!isFinite(requested)) return;
    const applied = _rebalanceSiblingWeights(selectedNodeData, info.siblings, requested);
    const slider  = document.getElementById('config-weight');
    const display = document.getElementById('config-weight-display');
    if (slider && Math.abs(parseFloat(slider.value) - applied) > 0.05) slider.value = applied.toFixed(1);
    if (display) display.textContent = applied.toFixed(1) + '%';
    syncWeightSliderFromNode();    // refresh sibling readouts
    if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities();
    if (typeof updateD3 === 'function') updateD3();
    // Phase 56.47 — persist weight edits so they survive refresh.
    try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch(_) {}
}

function onWeightLockToggle(isLocked) {
    if (!selectedNodeData) return;
    selectedNodeData.weightLocked = !!isLocked;
    syncWeightSliderFromNode();
    // Phase 56.47 — persist lock toggles too.
    try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch(_) {}
}

function syncPrescribedFromNode() {
    if (!selectedNodeData || selectedNodeData.type !== 'gate') return;
    const rateChk = document.getElementById('config-prescribed-rate');
    const probEl  = document.getElementById('config-prescribed-prob');
    const justEl  = document.getElementById('config-prescribed-justification');
    if (rateChk) rateChk.checked = !!selectedNodeData.prescribedRate;
    if (probEl)  probEl.value = (typeof selectedNodeData.prescribedProb === 'number' && isFinite(selectedNodeData.prescribedProb)) ? selectedNodeData.prescribedProb : '';
    if (justEl)  justEl.value = selectedNodeData.prescribedJustification || '';
    const valueRow = document.getElementById('config-prescribed-value-row');
    const justRow  = document.getElementById('config-prescribed-justification-row');
    const enabled  = !!selectedNodeData.prescribedRate;
    if (valueRow) valueRow.style.opacity = enabled ? '1' : '0.55';
    if (justRow)  justRow.style.opacity  = enabled ? '1' : '0.55';
    if (probEl)   probEl.disabled = !enabled;
    if (justEl)   justEl.disabled = !enabled;
}

function _computeBirnbaumPerVariable(rootNode, uniqueVars) {
    if (!rootNode || !uniqueVars || typeof computeExactProbability !== 'function') return null;
    if (uniqueVars.size === 0) return null;
    const birnbaum = new Map();
    uniqueVars.forEach((nodes, lid) => {
        const originals = nodes.map(n => n.probability);
        // P_top with p_v = 1
        nodes.forEach(n => { n.probability = 0.9999; });
        let pAt1 = 0;
        try { const r = computeExactProbability(rootNode); if (r && isFinite(r.prob)) pAt1 = r.prob; } catch (e) { pAt1 = 0; }
        // P_top with p_v = 0
        nodes.forEach(n => { n.probability = 0; });
        let pAt0 = 0;
        try { const r = computeExactProbability(rootNode); if (r && isFinite(r.prob)) pAt0 = r.prob; } catch (e) { pAt0 = 0; }
        // Restore
        nodes.forEach((n, i) => { n.probability = originals[i]; });
        birnbaum.set(lid, Math.max(0, pAt1 - pAt0));
    });
    return birnbaum;
}

// [OPT-1] CutsetExplosionError — deduped; single source: fta_engine.js (identical, incl. Error prototype wiring).

// #7b — the worker offload is now ON BY DEFAULT (it had shipped dark behind an
// opt-in flag). Opt OUT with ?cutsetWorker=0 or localStorage SLA_CUTSET_WORKER='0'.
// The legacy opt-in tokens ('1') remain accepted. Same engine either way —
// fta_worker.js importScripts the SAME fta_engine.js the page runs.
function _cutsetWorkerEnabled() {
    try {
        if (/[?&]cutsetWorker=0/.test(location.search)) return false;
        if (localStorage.getItem('SLA_CUTSET_WORKER') === '0') return false;
        return typeof Worker !== 'undefined';
    } catch (_) { return typeof Worker !== 'undefined'; }
}
// Versioned spawn — same cache-busting discipline as the page's <script> tags,
// so a deploy can never pair a fresh page with a stale cached worker. Bump this
// (and the importScripts version inside fta_worker.js) whenever the engine bumps.
function _getCutsetWorker() { if (_cutsetWorker) return _cutsetWorker; try { _cutsetWorker = new Worker('fta_worker.js?v=1.4'); } catch (_) { _cutsetWorker = null; } return _cutsetWorker; }
function _countTreeNodes(node, seen) { if (!node) return 0; seen = seen || new Set(); if (seen.has(node.id)) return 0; seen.add(node.id); var n = 1; var kids = node.children || node._children; if (kids) for (var i = 0; i < kids.length; i++) n += _countTreeNodes(kids[i], seen); return n; }
function _reconstructCutsets(encoded, index) {
    return encoded.map(function (c) {
        var arr = c.ids.map(function (eid) { return index[eid]; }).filter(Boolean);
        if (c.dyn) { arr.dynamicOrigin = c.dyn.o; arr.dynamicOrder = c.dyn.ord; }
        return arr;
    });
}
function enumerateCutsetsAsync(rootNode) {
    return new Promise(function (resolve, reject) {
        function sync() { try { resolve(getCutsets(rootNode)); } catch (e) { reject(e); } }
        if (!_cutsetWorkerEnabled() || typeof Worker === 'undefined' || typeof SLFTAEngine === 'undefined') return sync();
        try { if (_countTreeNodes(rootNode) < _CUTSET_WORKER_MIN_NODES) return sync(); } catch (_) { return sync(); }
        var flat;
        try { flat = SLFTAEngine.flattenTransfers(rootNode, (typeof ftaPages !== 'undefined' ? ftaPages : [])); } catch (_) { return sync(); }
        var w = _getCutsetWorker(); if (!w) return sync();
        var id = ++_cutsetWorkerSeq, done = false;
        var watchdog = setTimeout(function () { if (done) return; done = true; cleanup(); sync(); }, 20000);
        function cleanup() { clearTimeout(watchdog); try { w.removeEventListener('message', onMsg); w.removeEventListener('error', onErr); } catch (_) {} }
        function onMsg(ev) {
            var d = ev.data || {}; if (d.id !== id || done) return; done = true; cleanup();
            if (d.ok) { try { resolve(_reconstructCutsets(d.cutsets, flat.index)); } catch (e) { sync(); } }
            else if (d.name === 'CutsetExplosionError') { reject(new CutsetExplosionError(d.count)); }
            else { sync(); }
        }
        function onErr() { if (done) return; done = true; cleanup(); sync(); }
        w.addEventListener('message', onMsg); w.addEventListener('error', onErr);
        try { w.postMessage({ id: id, root: flat.root }); } catch (_) { done = true; cleanup(); sync(); }
    });
}

function computeImportanceAsync(rootNode) {
    return new Promise(function (resolve, reject) {
        function sync() { try { resolve(computeImportanceMeasures(rootNode)); } catch (e) { reject(e); } }
        if (!_cutsetWorkerEnabled() || typeof Worker === 'undefined' || typeof SLFTAEngine === 'undefined') return sync();
        try { if (_countTreeNodes(rootNode) < _CUTSET_WORKER_MIN_NODES) return sync(); } catch (_) { return sync(); }
        var flat;
        try { flat = SLFTAEngine.flattenTransfers(rootNode, (typeof ftaPages !== 'undefined' ? ftaPages : [])); } catch (_) { return sync(); }
        var w = _getCutsetWorker(); if (!w) return sync();
        var id = ++_cutsetWorkerSeq, done = false;
        var watchdog = setTimeout(function () { if (done) return; done = true; cleanup(); sync(); }, 20000);
        function cleanup() { clearTimeout(watchdog); try { w.removeEventListener('message', onMsg); w.removeEventListener('error', onErr); } catch (_) {} }
        function onMsg(ev) {
            var d = ev.data || {}; if (d.id !== id || done) return; done = true; cleanup();
            if (d.ok && d.ptop) {
                try {
                    var p = d.ptop;
                    var measures = p.measures.map(function (m) { return { node: flat.index[m.nodeId], varIdx: m.varIdx, p: m.p, birnbaum: m.birnbaum, fv: m.fv, raw: m.raw, rrw: m.rrw, critical: m.critical, dim: m.dim }; });
                    resolve({ measures: measures, pTop: p.pTop, bddSize: p.bddSize });
                } catch (e) { sync(); }
            } else { sync(); }
        }
        function onErr() { if (done) return; done = true; cleanup(); sync(); }
        w.addEventListener('message', onMsg); w.addEventListener('error', onErr);
        try { w.postMessage({ id: id, op: 'ptop', root: flat.root }); } catch (_) { done = true; cleanup(); sync(); }
    });
}

function _threadBtn(target){
    const j = JSON.stringify(target).replace(/"/g, '&quot;');
    return '<button class="action-btn" style="background:#8b5cf6;" title="Show this item on its failure-condition thread" onclick="openThreadFromArtifact(JSON.parse(this.getAttribute(\'data-gt\').replace(/&quot;/g,String.fromCharCode(34))))" data-gt="' + j + '">Thread</button>';
}
// Phase 57b — Thread as a kebab MENU ITEM so it lives inside the ⋮ menu, not dangling beside it.
function _threadMenuItem(target){
    const j = JSON.stringify(target).replace(/"/g, '&quot;');
    return '<button type="button" role="menuitem" title="Show this item on its failure-condition thread" onclick="openThreadFromArtifact(JSON.parse(this.getAttribute(\'data-gt\').replace(/&quot;/g,String.fromCharCode(34))))" data-gt="' + j + '">🧵 Thread</button>';
}
// Inject the Thread item into a rowActionsHTML kebab string, just before Delete.
function _threadInKebab(actionsHtml, target){
    const item = _threadMenuItem(target);
    const marker = '<button type="button" role="menuitem" class="ram-danger"';
    const i = actionsHtml.indexOf(marker);
    return (i >= 0) ? (actionsHtml.slice(0, i) + item + actionsHtml.slice(i)) : (actionsHtml + item);
}

function closeGoldenThreadModal() {
    const modal = document.getElementById('golden-thread-modal');
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
}

// ============================================================================
// Golden Thread — interactive trace VIEW (Sankey) + per-function trace report.
// Reuses the exact joins from _renderGoldenThread (FC -> function/system -> tree
// -> CCA -> requirement -> verification) but assembles ONE graph from the whole
// project and lays it out left-to-right by artifact layer. Click a node to lay
// out its connected ecosystem. The same walk feeds the Golden Thread Trace
// Report (REPORT_DEFS.GTT). No new libraries — uses the D3 v7 already loaded.
// ============================================================================
// [P2 batch 5] L8569-8569 moved verbatim to bindings_modules.js
// [P2 batch 5] L8570-8570 moved verbatim to bindings_modules.js
// [P2 batch 5] L8571-8571 moved verbatim to bindings_modules.js
// [P2 batch 5] L8572-8572 moved verbatim to bindings_modules.js
// [P2 batch 5] L8573-8573 moved verbatim to bindings_modules.js

// [P2 batch 2] L21295-21516 moved verbatim to fta_view_modules.js

// ── Golden-thread ecosystem MODAL ──────────────────────────────────────────────────
// Double-click a node → this pops the full trace with CLICKABLE pills; clicking a pill routes
// to that exact record/view via the node's `ref` ({kind,id,systemId}) captured at graph build.
// [P2 batch 5] L8580-8580 moved verbatim to bindings_modules.js
// [P2 batch 4] L16375-16517 moved verbatim to helpers_modules.js

// #50 — Golden-thread interactivity: hover a node to light up its full upstream+downstream
// thread, and an optional "only compromised/stale" filter. Additive over the existing render.
// [P2 batch 5] L8585-8585 moved verbatim to bindings_modules.js
function _gtvThreadSet(graph, key) {
    const down = {}, up = {};
    (graph.links || []).forEach(L => { (down[L.s] = down[L.s] || []).push(L.t); (up[L.t] = up[L.t] || []).push(L.s); });
    const set = new Set([key]);
    const walk = (k, map) => { (map[k] || []).forEach(n => { if (!set.has(n)) { set.add(n); walk(n, map); } }); };
    walk(key, down); walk(key, up);
    return set;
}
function _gtvHighlightThread(graph, linkSel, nodeG, key) {
    const set = _gtvThreadSet(graph, key);
    linkSel.attr('stroke-opacity', L => (set.has(L.s) && set.has(L.t)) ? 0.9 : 0.05);
    nodeG.style('opacity', d => set.has(d.key) ? 1 : 0.22);
}
function _gtvApplyFlaggedFilter(graph, linkSel, nodeG) {
    const flagged = (graph.nodes || []).filter(n => n.flag).map(n => n.key);
    if (!flagged.length) { linkSel.attr('stroke-opacity', 0.4); nodeG.style('opacity', 1); return; }
    const set = new Set();
    flagged.forEach(k => { _gtvThreadSet(graph, k).forEach(x => set.add(x)); });
    linkSel.attr('stroke-opacity', L => (set.has(L.s) && set.has(L.t)) ? 0.85 : 0.04);
    nodeG.style('opacity', d => set.has(d.key) ? 1 : 0.16);
}
function _gtvClearHighlight(graph, linkSel, nodeG) {
    if (_gtvOnlyFlagged) _gtvApplyFlaggedFilter(graph, linkSel, nodeG);
    else { linkSel.attr('stroke-opacity', 0.4); nodeG.style('opacity', 1); }
}
function toggleGtvFlagged(cb) { _gtvOnlyFlagged = !!(cb && cb.checked); if (typeof renderGoldenThreadView === 'function') renderGoldenThreadView(); }

function _slModalHasExit(o) {
    if (o.querySelector('.modal-close, .node-modal-close, .close-x, .sl-fb-close, [aria-label="Close" i], [aria-label="Dismiss" i], [data-modal-close], [onclick*="close" i], [onclick*="dismiss" i]')) return true;
    const cands = o.querySelectorAll('button, .btn, [role="button"], a');
    for (let i = 0; i < cands.length; i++) {
        const t = (cands[i].textContent || '').trim();
        if (!t) { if (/^[×✕✖✗]$/.test((cands[i].getAttribute('aria-label') || '').trim())) return true; continue; }
        if (/^[×✕✖✗]$/.test(t)) return true;
        if (/\b(close|cancel|dismiss|skip|done)\b/i.test(t)) return true;
    }
    return false;
}
function _slInjectModalExit(o) {
    try {
        if (!o || o.nodeType !== 1 || !o.classList || !o.classList.contains('modal-overlay')) return;
        if (o.getAttribute('data-exit-guaranteed')) return;
        if ((o.id && _SL_MODAL_EXIT_EXEMPT[o.id]) || _slModalHasExit(o)) { o.setAttribute('data-exit-guaranteed', '1'); return; }
        const host = o.querySelector('.modal-content, .modal, .shortcuts-card, .sl-dialog-card') || o;
        try { if (getComputedStyle(host).position === 'static') host.style.position = 'relative'; } catch (_) {}
        const x = document.createElement('button');
        x.type = 'button'; x.className = 'modal-close sl-auto-exit';
        x.setAttribute('aria-label', 'Close'); x.title = 'Close (Esc)'; x.textContent = '×';
        x.style.cssText = 'position:absolute;top:9px;right:12px;z-index:6;background:transparent;border:none;font-size:23px;line-height:1;cursor:pointer;color:var(--color-text-secondary,#667085);padding:2px 7px;';
        x.addEventListener('click', function (ev) { try { ev.stopPropagation(); } catch (_) {} o.classList.remove('show'); o.style.display = ''; });
        host.appendChild(x);
        o.setAttribute('data-exit-guaranteed', '1');
    } catch (_) {}
}
// [P2 batch 5] L8723-8723 moved verbatim to bindings_modules.js
function _slScanModals() { _slModalScanQueued = false; try { document.querySelectorAll('.modal-overlay').forEach(_slInjectModalExit); } catch (_) {} }
function _slQueueModalScan() { if (_slModalScanQueued) return; _slModalScanQueued = true; (window.requestAnimationFrame ? requestAnimationFrame : function (f) { setTimeout(f, 0); })(_slScanModals); }

function _perfEnabled() { try { if (/[?&]perf=1/.test(location.search)) return true; return localStorage.getItem('SLA_PERF') === '1'; } catch (_) { return false; } }
function _perfRecord(label, ms) { var s = _perfStats[label] || (_perfStats[label] = { n: 0, total: 0, max: 0, last: 0 }); s.n++; s.total += ms; s.last = ms; if (ms > s.max) s.max = ms; }
function _perfTime(label, fn) {
    if (!_perfEnabled()) return fn();
    var now = (typeof performance !== 'undefined' && performance.now) ? function () { return performance.now(); } : function () { return Date.now(); };
    var t0 = now();
    try { return fn(); } finally { _perfRecord(label, now() - t0); }
}
function _perfRows() {
    return Object.keys(_perfStats).map(function (k) { var s = _perfStats[k]; return { op: k, calls: s.n, avgMs: +(s.total / s.n).toFixed(2), maxMs: +s.max.toFixed(2), lastMs: +s.last.toFixed(2) }; })
        .sort(function (a, b) { return b.avgMs - a.avgMs; });
}
function _perfRenderOverlay() {
    try {
        if (!_perfEnabled()) { var ex = document.getElementById('sl-perf'); if (ex) ex.remove(); return; }
        var el = document.getElementById('sl-perf');
        if (!el) { el = document.createElement('div'); el.id = 'sl-perf'; el.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:99991;background:#0a1f44;color:#cfe0f2;font:11px/1.45 ui-monospace,Menlo,Consolas,monospace;padding:8px 10px;border-radius:8px;max-width:360px;box-shadow:0 6px 20px rgba(0,0,0,.3);'; document.body.appendChild(el); }
        var rows = _perfRows().slice(0, 8);
        el.innerHTML = '<b style="color:#7fc4ff">⏱ Safety Lab perf</b> · avg ms<br>' + (rows.length ? rows.map(function (r) { return r.op + ': <b>' + r.avgMs + '</b> (×' + r.calls + ', max ' + r.maxMs + ')'; }).join('<br>') : 'no samples yet — exercise the app');
    } catch (_) {}
}

function _bundleSafe(id) { return String(id == null ? '' : id).replace(/[^a-zA-Z0-9_.-]/g, '_') || 'x'; }
function _bundleSig(s) { try { return (typeof _cyrb53 === 'function') ? _cyrb53(s) : ('len' + s.length); } catch (_) { return 'len' + (s ? s.length : 0); } }
// Flat project → { files: {path: jsonString}, manifest }. (Pure, testable.)
function _bundleSplit(project) {
    project = project || {};
    const files = {};
    Object.keys(_BUNDLE_MAP).forEach(function (path) {
        const obj = {};
        _BUNDLE_MAP[path].forEach(function (k) { if (project[k] !== undefined) obj[k] = project[k]; });
        files[path] = JSON.stringify(obj);
    });
    const systemsOrder = [], ftaOrder = [];
    (project.systemsData || []).forEach(function (sys) { const p = 'systems/sys-' + _bundleSafe(sys && sys.id) + '.json'; files[p] = JSON.stringify(sys); systemsOrder.push(p); });
    (project.ftaPages || []).forEach(function (pg) { const p = 'fta/' + _bundleSafe(pg && pg.id) + '.json'; files[p] = JSON.stringify(pg); ftaOrder.push(p); });
    const manifest = { schema: 1, savedAt: Date.now(), systemsOrder: systemsOrder, ftaOrder: ftaOrder,
        files: Object.keys(files).map(function (p) { return { path: p, sig: _bundleSig(files[p]) }; }) };
    return { files: files, manifest: manifest };
}
// { manifest, files } → flat project (lossless inverse of _bundleSplit). (Pure, testable.)
function _bundleMerge(manifest, files) {
    const project = {};
    Object.keys(_BUNDLE_MAP).forEach(function (path) { if (files[path]) { try { Object.assign(project, JSON.parse(files[path])); } catch (_) {} } });
    project.systemsData = ((manifest && manifest.systemsOrder) || []).map(function (p) { try { return files[p] ? JSON.parse(files[p]) : null; } catch (_) { return null; } }).filter(function (x) { return x != null; });
    project.ftaPages = ((manifest && manifest.ftaOrder) || []).map(function (p) { try { return files[p] ? JSON.parse(files[p]) : null; } catch (_) { return null; } }).filter(function (x) { return x != null; });
    return project;
}
// Which content files changed/deleted vs a previous manifest → drives delta save.
function _bundleChangedFiles(newFiles, oldManifest) {
    const old = {}; (((oldManifest && oldManifest.files)) || []).forEach(function (f) { old[f.path] = f.sig; });
    const changed = [], deleted = [];
    Object.keys(newFiles).forEach(function (p) { if (old[p] !== _bundleSig(newFiles[p])) changed.push(p); delete old[p]; });
    Object.keys(old).forEach(function (p) { deleted.push(p); });
    return { changed: changed, deleted: deleted };
}

function _slMakeViewSaveBtn() {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'save-indicator sl-view-save';
    b.setAttribute('role', 'button'); b.tabIndex = 0;
    b.title = 'Autosaved to this browser. Click to save changes (writes the .json locally and to the cloud when signed in).';
    b.innerHTML = '<span class="save-indicator-dot"></span><span class="sl-view-save-text">All changes saved</span>';
    b.addEventListener('click', function () { if (typeof commitSaveChanges === 'function') commitSaveChanges(); });
    b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (typeof commitSaveChanges === 'function') commitSaveChanges(); } });
    return b;
}
function _slEnsureViewSaveStyle() {
    if (document.getElementById('sl-view-save-style')) return;
    const st = document.createElement('style'); st.id = 'sl-view-save-style';
    st.textContent = '.sl-view-save{cursor:pointer}.save-indicator.dirty .sl-view-save-text{color:#fff;font-weight:600}';
    document.head.appendChild(st);
}
function _slInjectViewSaveButtons() {
    try {
        _slEnsureViewSaveStyle();
        _SL_SAVE_VIEWS.forEach(function (id) {
            const view = document.getElementById(id); if (!view) return;
            if (view.querySelector('.sl-view-save')) return;   // idempotent
            const hdr = view.querySelector('.header-with-export');
            const btn = _slMakeViewSaveBtn();
            if (hdr) { const first = hdr.firstElementChild; if (first) first.style.marginRight = 'auto'; hdr.appendChild(btn); }
            else { const bar = document.createElement('div'); bar.style.cssText = 'display:flex;justify-content:flex-end;margin:0 0 10px;'; bar.appendChild(btn); view.insertBefore(bar, view.firstChild); }
        });
        if (typeof _updateSaveIndicator === 'function') _updateSaveIndicator('saved');   // set initial label on all buttons
    } catch (_) {}
}

function _renderWorkflowStepper(activeTab) {
    // 23 Aug 2026 (3) — THE STRIP IS GONE (Waqas: "this is useless" / "remove
    // the pills we have the vertical nav options"). The horizontal spine
    // experiment ended the same day it shipped: the vertical rail is the
    // navigation, and the Prove pages present as tabs inside the Prove area
    // (prove_tabs.js). This function stays because support_modules calls it
    // lexically on every switchTab — it now only clears any residue host so
    // stale DOM can never linger. The catalogue-residue lesson: no dead
    // artifact survives on a timer.
    var host = document.getElementById('wf-stepper-host');
    if (host && host.parentNode) host.parentNode.removeChild(host);
}

function _maybeShowGettingStarted() {
    let seen = false;
    try { seen = localStorage.getItem(_GS_SEEN_KEY) === '1'; } catch (_) {}
    if (seen) return;
    const container = document.querySelector('.container');
    const header = container && container.querySelector('.global-header');
    if (!container || !header || document.getElementById('getting-started-card')) return;
    const card = document.createElement('div');
    card.id = 'getting-started-card';
    card.className = 'getting-started-card';
    card.innerHTML =
        '<div><h4>Welcome to Safety Lab Aero 👋</h4>' +
        '<p>Follow the safety spine left → right: build your <strong>FHA</strong>, develop the <strong>fault trees</strong>, and the tool rolls up the <strong>Golden Thread</strong> so every artifact stays linked. New here? Load the sample project from the <strong>Project</strong> menu to see a full worked example.</p></div>' +
        '<button type="button" class="gs-close" aria-label="Dismiss" onclick="dismissGettingStarted()">×</button>';
    header.insertAdjacentElement('afterend', card);
}
function dismissGettingStarted() {
    try { localStorage.setItem(_GS_SEEN_KEY, '1'); } catch (_) {}
    const c = document.getElementById('getting-started-card');
    if (c) c.remove();
}

function _renderTabEmptyStates() {
    Object.keys(_EMPTY_STATE_MAP).forEach(function (bodyId) {
        var tb = document.getElementById(bodyId); if (!tb) return;
        var table = tb.closest('table'); if (!table) return;
        var view = table.closest('[id^="view-"]'); if (view && view.style.display === 'none') return;
        var realRows = Array.prototype.filter.call(tb.children, function (tr) { return tr.getAttribute('data-empty-hint') !== '1'; });
        var hint = tb.querySelector('tr[data-empty-hint="1"]');
        if (realRows.length === 0) {
            if (!hint) {
                var cols = (table.querySelectorAll('thead th') || []).length || 1;
                var tr = document.createElement('tr'); tr.setAttribute('data-empty-hint', '1');
                tr.innerHTML = '<td colspan="' + cols + '" class="sl-empty-row">' + esc(_EMPTY_STATE_MAP[bodyId]) + '</td>';
                tb.appendChild(tr);
            }
        } else if (hint) { hint.remove(); }
    });
}

function toggleSlCollapsible(btn) {
    const p = btn.closest('.sl-collapsible'); if (!p) return;
    const collapsed = p.classList.toggle('is-collapsed');
    btn.setAttribute('aria-expanded', String(!collapsed));
    const label = btn.dataset.label || btn.textContent.replace(/^[▸▾]\s*/, '');
    btn.textContent = (collapsed ? '▸ ' : '▾ ') + label;
}
function expandEntryForm(id) {
    const p = document.getElementById(id); if (!p || !p.classList.contains('is-collapsed')) return;
    const b = p.querySelector('.sl-collapse-toggle');
    if (b) b.click(); else p.classList.remove('is-collapsed');
}

function _slDialog(opts) {
    return new Promise(resolve => {
        let ov = document.getElementById('sl-dialog-overlay');
        if (!ov) { ov = document.createElement('div'); ov.id = 'sl-dialog-overlay'; ov.className = 'modal-overlay'; document.body.appendChild(ov); }
        if (ov._hideTimer) { clearTimeout(ov._hideTimer); ov._hideTimer = null; }   // cancel a prior dialog's pending hide
        const isPrompt = opts.type === 'prompt';
        ov.innerHTML =
            '<div class="sl-dialog-card" role="dialog" aria-modal="true">'
            + (opts.title ? '<h3 class="sl-dialog-title">' + esc(opts.title) + '</h3>' : '')
            + '<div class="sl-dialog-msg">' + esc(opts.message || '').replace(/\n/g, '<br>') + '</div>'
            + (isPrompt ? '<input type="text" id="sl-dialog-input" class="sl-dialog-input" value="' + esc(opts.def || '') + '">' : '')
            + '<div class="sl-dialog-actions">'
            + '<button type="button" class="sl-dialog-cancel">' + esc(opts.cancelText || 'Cancel') + '</button>'
            + '<button type="button" class="sl-dialog-ok' + (opts.danger ? ' sl-danger' : '') + '">' + esc(opts.okText || 'OK') + '</button>'
            + '</div></div>';
        ov.style.display = 'flex';
        requestAnimationFrame(() => ov.classList.add('show'));
        const input = ov.querySelector('#sl-dialog-input');
        const finish = (val) => {
            document.removeEventListener('keydown', onKey, true);
            ov.classList.remove('show'); ov.setAttribute('aria-hidden', 'true');
            ov._hideTimer = setTimeout(() => { ov.style.display = 'none'; ov._hideTimer = null; }, 200);
            resolve(val);
        };
        const onOk = () => finish(isPrompt ? (input ? input.value : '') : true);
        const onCancel = () => finish(isPrompt ? null : false);
        function onKey(e) {
            if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onCancel(); }
            else if (e.key === 'Enter') { e.preventDefault(); onOk(); }
        }
        ov.querySelector('.sl-dialog-ok').addEventListener('click', onOk);
        ov.querySelector('.sl-dialog-cancel').addEventListener('click', onCancel);
        ov.addEventListener('click', e => { if (e.target === ov) onCancel(); });
        document.addEventListener('keydown', onKey, true);
        setTimeout(() => { if (input) { input.focus(); input.select(); } else { const b = ov.querySelector('.sl-dialog-ok'); if (b) b.focus(); } }, 40);
    });
}
function slConfirm(message, opts) { opts = opts || {}; return _slDialog({ type: 'confirm', message: message, title: opts.title, okText: opts.okText, cancelText: opts.cancelText, danger: opts.danger }); }

function _ftaGoToSearchHit(hit) {
    if (!hit || !hit.node) return;
    const page = (ftaPages || []).find(p => p.id === hit.pageId);
    if (!page || !page.root) return;
    if (activeFTAPageId !== hit.pageId) {
        activeFTAPageId = hit.pageId;
        if (typeof renderFTASidebar === 'function') renderFTASidebar();
    }
    _ftaExpandPathToNode(page.root, hit.node);
    if (typeof selectNode === 'function') selectNode(hit.node);
    if (typeof updateD3 === 'function') updateD3();
    setTimeout(() => _ftaCenterOnNode(hit.node), 60);   // let updateD3 lay out before centering
}

// PER-CHANGE IMMEDIATE SAVE (2 Sep 2026, Waqas: "I want saving per change").
//
// WHAT CHANGED, AND WHY. This used to arm a 2-SECOND debounce: an edit made and a tab
// closed within those two seconds was gone. That window was the loss, and combined with a
// recovery gate blind to HF data it is what ate a full session. There is no reason to wait
// — every committed change now writes IMMEDIATELY.
//
// "Immediate" without melting the browser. Almost every edit funnels through this one
// function (a field commit, a row add, an accepted AI draft), so it is the natural
// "a change happened" signal — and it is per COMMITTED change, not per keystroke. The one
// hazard is a synchronous BURST: accepting 44 drafted rows calls this 44 times in one
// stack, and 44 full-document writes would be waste. So the write is queued on a single
// MICROTASK: the burst sets the flag 44 times, queues once, and the flush runs once the
// stack unwinds — one write, the instant the batch finishes, zero human-perceptible delay
// and zero unsaved window. localStorage lands synchronously inside _writeAutosave (the
// zero-loss guarantee); IndexedDB and the per-project .sl disk file follow fire-and-forget.
//
// _flushAutosave (pagehide/beforeunload/visibilitychange) stays as the synchronous belt-
// and-braces for the rare case the microtask has not run yet; it is idempotent with this.
function scheduleAutosave() {
    if(_autosaveSuspended) return;
    try { _quantClearCache(); } catch(_) {}   // #45 — any edit invalidates cached quant results (keeps cached refs valid)
    _dirtySinceSave = true;   // Phase 57 — any tracked edit makes the Save Changes control active
    try { if (window.SafetyLabCRDT && window.SafetyLabCRDT.onLocalChange) window.SafetyLabCRDT.onLocalChange(); } catch(_) {}   // Phase 1 — mirror the edit into the CRDT (no-op unless co-authoring is enabled)
    _autosavePending = true;  // there is now an unwritten change (flushed on tab hide/close)
    try { _wsTrackActivity(); } catch(_) {}   // attributed change log (coalesced ≤1/area/90s)
    _updateSaveIndicator('saving');
    if (_autosaveFlushQueued) return;   // a write for this synchronous burst is already queued
    _autosaveFlushQueued = true;
    var _flush = function () {
        _autosaveFlushQueued = false;
        try { _writeAutosave(); } catch(_) {}
    };
    // Microtask = end of the current synchronous burst, before any timer or paint. rAF
    // (which waits ~16ms for a frame) is the fallback where queueMicrotask is absent.
    if (typeof queueMicrotask === 'function') queueMicrotask(_flush);
    else if (typeof Promise !== 'undefined') Promise.resolve().then(_flush);
    else if (typeof requestAnimationFrame === 'function') requestAnimationFrame(_flush);
    else setTimeout(_flush, 0);
}
// Flush a pending debounced autosave SYNCHRONOUSLY before the tab is hidden/closed, so an
// edit made inside the 2s debounce window can't be lost. localStorage writes are synchronous,
// so this is safe in pagehide/beforeunload. Same payload as the debounced write — cadence only,
// no behaviour change, local-only. Covers tab close, navigation, and sign-out (which navigates away).
function _flushAutosave() {
    try {
        if (_autosaveSuspended || !_autosavePending) return;
        clearTimeout(_autosaveDebounceTimer); _autosaveDebounceTimer = null;
        clearTimeout(_autosaveMaxWaitTimer); _autosaveMaxWaitTimer = null;
        _autosaveFlushQueued = false;   // per-change: this synchronous flush satisfies any queued microtask
        // ENG-4 — a pending idle-scheduled write must not be lost on tab hide.
        try { if (typeof SLIdle !== 'undefined' && SLIdle) SLIdle.cancel('autosave'); } catch (_) {}
        _writeAutosave();
    } catch (_) {}
}

function showWelcomeModal() {
    const m = document.getElementById('welcome-modal');
    if(!m) return;
    m.style.display = 'flex';
    setTimeout(() => m.classList.add('show'), 10);
}
function closeWelcomeModal() {
    const m = document.getElementById('welcome-modal');
    if(!m) return;
    const dontShow = document.getElementById('welcome-dont-show');
    if(dontShow && dontShow.checked) {
        try { localStorage.setItem(WELCOME_KEY, '1'); } catch(e){}
    }
    m.classList.remove('show');
    setTimeout(() => m.style.display = 'none', 250);
}
function maybeShowWelcomeOnLoad() {
    try {
        if(localStorage.getItem(WELCOME_KEY) === '1') return;
    } catch(e){}
    // Don't show welcome if user is mid-recovery (they have a project already).
    if(document.querySelector('.recovery-banner')) return;
    setTimeout(showWelcomeModal, 350);
}

// ----- 5.10 Help mode -----
// [P2 batch 5] L9195-9195 moved verbatim to bindings_modules.js
function toggleHelpMode() {
    _helpModeActive = !_helpModeActive;
    document.body.classList.toggle('help-mode-active', _helpModeActive);
    const btn = document.getElementById('help-toggle');
    if(btn) btn.classList.toggle('active', _helpModeActive);
    if(_helpModeActive) {
        _injectHelpAttributes();
        showToast('Help mode on — hover any control for a hint.', 'info', 3500);
    } else {
        showToast('Help mode off.', 'info', 2000);
    }
}
function _injectHelpAttributes() {
    // Map element selectors → help text. We only set data-help if not already set, so we never overwrite explicit hints.
    const map = {
        '#help-toggle': 'Toggle Help Mode — hover controls for hints',
        '#theme-switch': 'Switch between light and dark mode',
        '#btn-add-top': 'Add the top event of the fault tree',
        '#btn-fullscreen': 'Toggle fullscreen mode for the fault tree canvas',
        '#btn-delete': 'Delete the currently selected node',
        '#btn-allocate-dal': 'Walk the tree and auto-assign DAL per ARP4754A',
        '#btn-clear-dal': 'Clear all DAL allocations on this project',
        '#save-indicator': 'Autosave status — saves to this browser every few seconds',
        '.brand-mark': 'Safety Lab Aero — unified safety engineering environment',
        '#fta-fha-link': 'Link this fault tree to an FHA hazard for exposure time + DAL target',
        '#proj-regulation': 'Choose Part 23 or Part 25 — drives probability + DAL targets',
        '#proj-part23-class': 'Part 23 aircraft class (drives DAL allocation per CAR 23.1309)'
    };
    Object.entries(map).forEach(([sel, hint]) => {
        document.querySelectorAll(sel).forEach(el => { if(!el.getAttribute('data-help')) el.setAttribute('data-help', hint); });
    });
}

// ----- 5.7 Keyboard shortcuts -----
function _isTypingTarget(el) {
    if(!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function _bnid() { return _benchIdSeed++; }
function _mkLeaf(opts) {
    opts = opts || {};
    const id = _bnid();
    return Object.assign({ id, logicalId: opts.logicalId != null ? opts.logicalId : id, displayId: opts.displayId || 'E-' + id, name: opts.name || 'Event', type: 'basic', probability: opts.probability || 0, lambda: opts.lambda || 0, inputMode: 'lambda', children: [] }, opts);
}
function _mkGate(gateType, kids, opts) {
    opts = opts || {};
    const id = _bnid();
    return Object.assign({ id, logicalId: opts.logicalId != null ? opts.logicalId : id, displayId: opts.displayId || 'G-' + id, name: opts.name || gateType, type: 'gate', gateType, probability: 0, children: kids || [] }, opts);
}

function checkBetaExpiry() {
    if (typeof BUILD_EXPIRES_AT !== 'number') return;
    if (Date.now() <= BUILD_EXPIRES_AT) return;
    const host = document.querySelector('.container');
    if (!host || document.getElementById('beta-expiry-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'beta-expiry-banner';
    banner.style.cssText = 'background: rgba(255, 59, 48, 0.13); border: 1px solid var(--sev-cat-fg); color: var(--sev-cat-fg); padding: 10px 14px; border-radius: var(--r-md); margin: 8px 16px; font-size: 13px; display: flex; gap: 12px; align-items: center; justify-content: space-between;';
    banner.innerHTML =
        '<div><strong>Beta build expired.</strong> This build (<code style="font-family: var(--font-mono);">' +
            esc(BETA_BUILD_ID) + '</code>) reached its expiry on ' + new Date(BUILD_EXPIRES_AT).toLocaleDateString() +
            '. Contact the maintainer for a renewed build.</div>' +
        '<a href="mailto:' + esc(BETA_FEEDBACK_EMAIL) + '?subject=Safety%20Lab%20Aero%20Beta%20-%20Renewal%20Request%20-%20' + encodeURIComponent(BETA_BUILD_ID) +
            '" style="color: inherit; text-decoration: underline; font-weight: 600;">Request renewal</a>';
    const header = host.querySelector('.global-header');
    if (header && header.nextSibling) host.insertBefore(banner, header.nextSibling);
    else host.insertBefore(banner, host.firstChild);
}

function renderBetaBuildInfo() {
    const host = document.getElementById('beta-build-info');
    if (!host) return;
    const daysLeft = Math.ceil((BUILD_EXPIRES_AT - Date.now()) / 86400000);
    // The public deploy serves the dev-build defaults — the per-tester build.sh
    // substitution only applies to distributed internal betas. Suppress the build-id /
    // expiry chip on the public build (otherwise it shows "dev-build · expires in 26860
    // days"). The footer's "Safety Lab Aero beta build" line already conveys beta status.
    if (BETA_BUILD_ID === 'dev-build' || daysLeft > 365) { host.innerHTML = ''; return; }
    const expDate = new Date(BUILD_EXPIRES_AT);
    const expStr = expDate.toLocaleDateString();
    const isExpired = daysLeft < 0;
    const colour = isExpired ? 'var(--sev-cat-fg)' : (daysLeft < 7 ? 'var(--sev-haz-fg)' : 'var(--color-text-tertiary)');
    host.innerHTML =
        '<span style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-tertiary);">Beta build</span> ' +
        '<span style="font-family: var(--font-mono); font-size: 11px; color: var(--color-text-secondary);">' + esc(BETA_BUILD_ID) + '</span>' +
        ' · <span style="font-size: 11px; color: ' + colour + ';" title="Expires ' + esc(expStr) + '">' +
            (isExpired ? 'expired' : 'expires in ' + daysLeft + ' day' + (daysLeft === 1 ? '' : 's')) +
        '</span>';
}

// Phase 66.11 — LANDING HIGHLIGHT ENGINE.
// A jump that lands silently reads as a jump that did not happen. Everything that
// navigates on the user's behalf marks its destination through here: the mark is
// strong, it carries a badge naming WHY it is marked, and it PERSISTS until the
// user does something (pointer, key, wheel) or 14s passes — the old 1.6s flash
// regularly finished before the smooth-scroll did.
var _slLandingTimer = null, _slLandingDismiss = null, _slLandingArmedAt = 0;

function _slClearLanding() {
    try {
        document.querySelectorAll('.sl-landed').forEach(el => {
            el.classList.remove('sl-landed');
            if (el.dataset && el.dataset._hlPrevBg != null) { el.style.background = el.dataset._hlPrevBg; delete el.dataset._hlPrevBg; }
        });
        document.querySelectorAll('.sl-landed-badge').forEach(b => b.remove());
        document.querySelectorAll('.node.landed-highlight').forEach(n => n.classList.remove('landed-highlight'));
    } catch (_) {}
    if (_slLandingTimer) { clearTimeout(_slLandingTimer); _slLandingTimer = null; }
    if (_slLandingDismiss) {
        // keep this list identical to the one _slArmLandingDismiss registers —
        // wheel came off both on 25 Aug 2026, and an asymmetric remove-list is
        // how the next reader ends up believing wheel is still wired.
        ['pointerdown', 'keydown'].forEach(ev => { try { document.removeEventListener(ev, _slLandingDismiss, true); } catch (_) {} });
        _slLandingDismiss = null;
    }
}

function _slArmLandingDismiss() {
    // 25 Aug 2026 — Waqas: "the item i clicked highlighting needs to be for 10
    // seconds not a flash". The timer was never the problem (it was already
    // 14s). Two other things made it read as a flash:
    //   · the CSS pulsed only 3 times (~3.45s) and then went static — fixed in
    //     safety_lab.css, which now pulses for the whole 10 seconds;
    //   · WHEEL was a dismiss trigger, so the moment you scrolled to look at
    //     the row you had just been sent to, the highlight died. Scrolling to
    //     read the thing is not "I have moved on" — it is the opposite. Wheel
    //     is gone from the dismiss set.
    // A deliberate click or keypress still dismisses it, but only after a
    // grace window, so the tail of the interaction that CAUSED the landing
    // cannot kill the landing it just produced.
    if (_slLandingTimer) clearTimeout(_slLandingTimer);
    _slLandingTimer = setTimeout(_slClearLanding, 10000);
    _slLandingArmedAt = Date.now();
    if (_slLandingDismiss) return;
    _slLandingDismiss = function () {
        if (Date.now() - (_slLandingArmedAt || 0) < 1200) return;   // grace
        setTimeout(_slClearLanding, 60);
    };
    ['pointerdown', 'keydown'].forEach(ev => { try { document.addEventListener(ev, _slLandingDismiss, true); } catch (_) {} });
}

function _slLandingBadge(label) {
    const b = document.createElement('span');
    b.className = 'sl-landed-badge';
    b.textContent = label || '\u25c0 THE ITEM YOU CLICKED';
    return b;
}

// Mark a fault-tree node on the canvas. Used when a jump lands on a tree rather
// than a table — a transfer-gate hop, a golden-thread pill pointing at a tree.
function _slHighlightFtaNode(nodeId, label) {
    if (nodeId == null) return false;
    let hit = null;
    try {
        document.querySelectorAll('g.node').forEach(g => {
            if (hit) return;
            const d = g.__data__;
            if (d && d.data && String(d.data.id) === String(nodeId)) hit = g;
        });
    } catch (_) { return false; }
    if (!hit) return false;
    hit.classList.add('landed-highlight');
    try {
        const idField = hit.querySelector('.inline-id');
        if (idField && idField.parentNode && !idField.parentNode.querySelector('.sl-landed-badge')) {
            idField.parentNode.insertBefore(_slLandingBadge(label), idField);
        }
    } catch (_) {}
    _slArmLandingDismiss();
    return true;
}

function _highlightArtifactRow(kind, id, label) {
    // Find the element stamped by reviewCellHtml (the review <td>) and mark its
    // whole ROW — the td alone is a sliver nobody sees. Attribute values are
    // written HTML-escaped, so match with CSS.escape / quote-escaping.
    const idStr = String(id).replace(/"/g, '\\"');
    const sel = '[data-artifact-kind="' + String(kind).replace(/"/g, '\\"') + '"][data-artifact-id="' + idStr + '"]';
    const el = document.querySelector(sel);
    if (!el) return false;
    const row = (el.closest && el.closest('tr')) || el;
    _slClearLanding();
    try { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) { }
    const cells = row.tagName === 'TR' ? Array.from(row.children) : [row];
    row.classList.add('sl-landed');
    cells.forEach(c => c.classList.add('sl-landed'));
    try {
        const first = cells[0];
        if (first && !first.querySelector('.sl-landed-badge')) first.insertBefore(_slLandingBadge(label), first.firstChild);
    } catch (_) {}
    _slArmLandingDismiss();
    return true;
}

// Helper for row renderers to drop the back-ref trigger icon.
function backrefTriggerHtml(target, label) {
    const t = JSON.stringify(target).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    const l = (label || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    return '<span class="backref-trigger" tabindex="0" role="button" aria-label="Traces to / used by" title="Traces to / used by — show every artifact linked to this one" onclick="event.stopPropagation(); openBackrefPanel(JSON.parse(this.getAttribute(\'data-target\').replace(/&quot;/g, \'\\&quot;\').replace(/\\\\&quot;/g, \'&quot;\')), this.getAttribute(\'data-label\'))" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault(); this.click();}" data-target="' + t + '" data-label="' + l + '">⇋</span>';
}

// ============================================================================
// Phase 50.3 — Review side panel (in-context, threaded)
// ----------------------------------------------------------------------------
// State:
//   _reviewTarget      the artifact { kind, id, systemId? } currently in focus
//   _reviewReplyParent commentId we're replying to (null = root comment)
// ============================================================================
// [P2 batch 5] L10071-10071 moved verbatim to bindings_modules.js
// [P2 batch 5] L10072-10072 moved verbatim to bindings_modules.js

// Pretty subtitle for the side panel header. Looks up the artifact and returns
// "<id> · <short description>" so the reviewer knows what they're commenting on.
// [P2 batch 4] L18983-19021 moved verbatim to helpers_modules.js

// Open the review panel for an artifact. Idempotent — repeat calls just refresh.
// [P2 batch 5] L10079-10119 moved verbatim to bindings_modules.js

// [P2 batch 5] L10121-10128 moved verbatim to bindings_modules.js

// Render the comment list inside the open panel. Re-runs on every CRUD action.
// [P2 batch 5] L10131-10164 moved verbatim to bindings_modules.js

function _renderReviewComment(c, depth) {
    const isRoot = depth === 0;
    const cls = 'review-comment' + (isRoot ? '' : ' review-reply depth-' + Math.min(depth, 4));
    const status = c.status === 'resolved' ? 'resolved' : 'open';
    const statusTag = '<span class="review-status-tag ' + status + '">' + status + '</span>';
    let actions = '';
    actions += '<button class="review-action-btn" onclick="beginReviewReply(\'' + esc(c.commentId) + '\')">Reply</button>';
    if (c.status === 'open') {
        actions += '<button class="review-action-btn" onclick="resolveReviewComment(\'' + esc(c.commentId) + '\')">Resolve</button>';
    } else {
        actions += '<button class="review-action-btn" onclick="reopenReviewComment(\'' + esc(c.commentId) + '\')">Reopen</button>';
    }
    actions += '<button class="review-action-btn danger" onclick="deleteReviewComment(\'' + esc(c.commentId) + '\')">Delete</button>';

    let resolution = '';
    if (c.status === 'resolved' && (c.resolvedBy || c.resolutionNote)) {
        let r = 'Resolved';
        if (c.resolvedBy) r += ' by ' + esc(c.resolvedBy);
        if (c.resolvedAt) r += ' · ' + esc(Review.relTime(c.resolvedAt));
        if (c.resolutionNote) r += ' — ' + esc(c.resolutionNote);
        resolution = '<div class="review-comment-resolution">' + r + '</div>';
    }

    return '<div class="' + cls + '" data-comment-id="' + esc(c.commentId) + '">' +
        '<div class="review-comment-meta">' +
            '<span class="review-comment-author">' + esc(c.authorName) + '</span>' +
            // 8 Aug 2026 (SL-ARC-0001 §20 D6): AI-filed comments are badged in the
            // meta line — the byline alone must never read as an engineer's judgement.
            (c.aiGenerated ? '<span class="review-comment-ai-badge" title="Drafted by the AI assistant' + (c.aiModel ? ' (' + esc(c.aiModel) + ')' : '') + ' — advisory, not an engineer\'s judgement" style="font-size:9px; font-weight:700; letter-spacing:0.4px; padding:1px 5px; border-radius:3px; border:1px solid var(--color-border-hair); color:var(--color-text-tertiary); cursor:help;">AI</span>' : '') +
            (c.aiGenerated && c.filedBy ? '<span style="font-size:10px; color:var(--color-text-tertiary);">· filed by ' + esc(c.filedBy) + '</span>' : '') +
            '<span>· ' + esc(Review.relTime(c.timestamp)) + '</span>' +
            statusTag +
        '</div>' +
        '<div class="review-comment-text">' + esc(c.text) + '</div>' +
        resolution +
        '<div class="review-comment-actions">' + actions + '</div>' +
    '</div>';
}

function _updatePalActive() {
    document.querySelectorAll('#cmd-palette-results .cmd-palette-item').forEach((el, i) => {
        el.classList.toggle('active', i === _palActiveIdx);
        if (i === _palActiveIdx) el.scrollIntoView({ block: 'nearest' });
    });
}

function _shortcutMod() {
    return /Mac|iPhone|iPad|iPod/.test((navigator.platform || '') + ' ' + (navigator.userAgent || '')) ? '⌘' : 'Ctrl';
}
function _renderShortcutsBody() {
    const host = document.getElementById('shortcuts-body');
    if (!host) return;
    const mod = _shortcutMod();
    const keys = combo => combo.split(' ').filter(Boolean)
        .map(k => '<kbd>' + esc(k === '{MOD}' ? mod : k) + '</kbd>').join(' ');
    host.innerHTML = _SHORTCUT_GROUPS.map(g =>
        '<div class="shortcuts-group">'
        + '<div class="shortcuts-group-title">' + esc(g.title) + '</div>'
        + g.items.map(([k, d]) =>
            '<div class="shortcuts-row"><span class="shortcuts-desc">' + esc(d) + '</span>'
            + '<span class="shortcuts-keys">' + keys(k) + '</span></div>').join('')
        + '</div>').join('');
}

function updateSystemBreadcrumb() {
    const host = document.getElementById('sys-breadcrumb-host');
    if (!host) {
        // First render — try to insert the breadcrumb into the system workspace header.
        const ws = document.getElementById('view-sys-workspace');
        if (!ws) return;
        const bc = document.createElement('div');
        bc.className = 'sys-breadcrumb';
        bc.id = 'sys-breadcrumb-host';
        ws.insertBefore(bc, ws.firstChild);
    }
    const bc = document.getElementById('sys-breadcrumb-host');
    if (!bc) return;
    const s = (typeof sys === 'function') ? sys() : null;
    if (!s) { bc.style.display = 'none'; return; }
    bc.style.display = 'flex';
    const others = (systemsData || []).filter(x => x.id !== s.id);
    const switcher = others.length
        ? '<select class="sys-breadcrumb-switcher" onchange="if(this.value)openSystemWorkspace(this.value)" aria-label="Switch system">' +
          '<option value="">Switch to…</option>' +
          others.map(x => '<option value="' + esc(x.id) + '">' + esc(x.name || x.id) + '</option>').join('') +
          '</select>'
        : '';
    bc.innerHTML =
        '<span class="sys-breadcrumb-label">Working in</span>' +
        '<span class="sys-breadcrumb-name">' + esc(s.name || s.id) + '</span>' +
        '<span class="u-muted-small">·</span>' +
        '<span style="font-size: 11px; color: var(--color-text-secondary);">' + (s.functions || []).length + ' functions · ' + (s.fha || []).length + ' FHAs · ' + (s.req || []).length + ' reqs</span>' +
        switcher +
        '<a href="javascript:void(0)" onclick="switchTab(\'sys-dir\')" style="font-size: 11px; color: var(--color-text-tertiary); text-decoration: none; margin-left: 6px;" title="Back to directory">↩ All systems</a>';
}

function ensureFilterBar(viewId, opts) {
    opts = opts || {};
    const view = document.getElementById(viewId);
    if (!view) return;
    if (view.querySelector('.generic-filter-bar')) return;
    const bar = document.createElement('div');
    bar.className = 'ar-filter-bar generic-filter-bar';
    bar.setAttribute('data-view-filter', viewId);
    bar.innerHTML = '<span class="ar-filter-label">Filter:</span>' +
        '<span class="ar-filter-chip active" data-gen-filter="all" onclick="setGenericFilter(\'' + viewId + '\', \'all\')">All</span>' +
        '<span class="ar-filter-chip" data-gen-filter="issues" onclick="setGenericFilter(\'' + viewId + '\', \'issues\')" title="' + (opts.issuesHint || 'Show rows that need attention') + '">Issues</span>';
    // Insert at the top of the view, after the header.
    const header = view.querySelector('.header-with-export') || view.firstElementChild;
    if (header && header.nextSibling) view.insertBefore(bar, header.nextSibling);
    else view.appendChild(bar);
    _genericFilters[viewId] = 'all';
}
// [P2 batch 5] L10610-10626 moved verbatim to bindings_modules.js
function applyGenericFilters() {
    ensureFilterBar('view-ac-func',  { issuesHint: 'Functions referenced by no FHA or no requirement' });
    ensureFilterBar('view-ac-fcim',  { issuesHint: 'FCIM rows whose subfunction or hazard is missing' });
    ensureFilterBar('view-ac-fha',   { issuesHint: 'FHAs with no linked sub-function or no assumptions' });
    ensureFilterBar('view-pra',      { issuesHint: 'PRAs with no affected zones or empty mitigation' });
    ensureFilterBar('view-zsa',      { issuesHint: 'ZSA zones with no housed functions' });
}

function _bulkKey(view, id) { return view + ':' + String(id); }
// [P2 batch 5] L10642-10646 moved verbatim to bindings_modules.js
// [P2 batch 5] L10647-10653 moved verbatim to bindings_modules.js
function _renderBulkBar(view) {
    let bar = document.querySelector('#' + view + ' .bulk-bar');
    const selectedIds = Array.from(window._bulkSel).filter(k => k.indexOf(view + ':') === 0).map(k => k.slice(view.length + 1));
    if (!bar) {
        // Inject the bar above the table.
        const root = document.getElementById(view);
        if (!root) return;
        const tbl = root.querySelector('table');
        if (!tbl) return;
        const div = document.createElement('div');
        div.className = 'bulk-bar';
        div.innerHTML = '<span class="bulk-bar-count">0 selected</span>' +
            '<button onclick="bulkAction(\'' + view + '\', \'delete\')" class="btn-red">Delete</button>' +
            (view === 'view-ac-req' || view === 'view-sys-req' ? '<button onclick="bulkAction(\'' + view + '\', \'archive\')">Archive</button>' : '') +
            '<button onclick="bulkClear(\'' + view + '\')" style="margin-left:auto;">Clear</button>';
        tbl.parentNode.insertBefore(div, tbl);
        bar = div;
    }
    const n = selectedIds.length;
    bar.classList.toggle('show', n > 0);
    const cnt = bar.querySelector('.bulk-bar-count');
    if (cnt) cnt.textContent = n + ' selected';
}
// [P2 batch 5] L10677-10681 moved verbatim to bindings_modules.js
// [P2 batch 5] L10682-10706 moved verbatim to bindings_modules.js
// Inject bulk checkboxes into table headers + rows. Runs after each render via observation.
// ----------------------------------------------------------------------------
// Phase 56.21 — DISABLED at user request. The injection added a leading <th>
// checkbox cell to the table header but couldn't always insert the matching
// <td> into every data row (e.g. when a row had no inferable internalId, or
// when a row was re-rendered before the cell got added), which shifted every
// header column to the right of where the row content sat — producing the
// "checkbox pushing the headers right" misalignment in the Aircraft
// Requirements table. Whole bulk-select feature parked for now; the underlying
// bulk-action functions are kept in case we want to bring it back later.
// ----------------------------------------------------------------------------
function injectBulkCheckboxes(view) {
    // Defensive cleanup: if any checkboxes were injected in earlier sessions
    // before this disable landed, strip them on next render pass.
    const root = document.getElementById(view);
    if (!root) return;
    const stale = root.querySelectorAll('.bulk-checkbox-all, .bulk-checkbox-row');
    stale.forEach(cb => {
        const cell = cb.closest('th, td');
        if (cell) cell.remove();
    });
    // Hide the bulk action bar if a previous render left it around.
    const bar = root.querySelector('.bulk-bar');
    if (bar) bar.classList.remove('show');
}
function applyBulkUI() {
    ['view-fmea', 'view-cma', 'view-pra', 'view-zsa', 'view-ac-req'].forEach(injectBulkCheckboxes);
}

function _loadDocxLib() {
    if (window.docx) return Promise.resolve(window.docx);
    if (_docxLibLoading) return _docxLibLoading;
    _docxLibLoading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://unpkg.com/docx@8.5.0/build/index.umd.js';
        s.onload = () => resolve(window.docx);
        s.onerror = () => reject(new Error('Could not load docx (network required)'));
        document.head.appendChild(s);
    });
    return _docxLibLoading;
}

// [P2 batch 5] L10969-10969 moved verbatim to bindings_modules.js
function _loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (_jszipLoading) return _jszipLoading;
    _jszipLoading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        s.onload = () => resolve(window.JSZip);
        s.onerror = () => reject(new Error('Could not load JSZip (network required)'));
        document.head.appendChild(s);
    });
    return _jszipLoading;
}

// Reports (v1 + v2 §56.9 + v3 §56.10) — extracted to reports.js (Phase 76; byte-identical, loaded AFTER this file).

/* ============================================================================
 * Phase 56.13 — Paywall Screen
 * ----------------------------------------------------------------------------
 * When isPaywalled() is true, renders a full-screen overlay that blocks the
 * app and offers Subscribe / Sign-out controls. Active trial and grandfather
 * windows render the appropriate countdown banner inside the overlay instead
 * of fully blocking — the user can still use the app, but they see a
 * persistent reminder that the clock is ticking.
 *
 * Stripe Checkout URLs are kept in PAYWALL_PRICING; replace the placeholder
 * cnb_* identifiers with the live Stripe Price IDs once the products are set
 * up. The fallback path is mailto: so even without Stripe the user has a way
 * to convert.
 * ========================================================================= */
