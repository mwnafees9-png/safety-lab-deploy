/* report_ai.js v1.0 (6 Nov 2026): how a report section is drafted with the AI, for every ARP4761A report.
 *
 * Waqas (6 Nov 2026): "the current PASA AI generated report, doesnt create tables and diagrams, gave a lot of errors and
 * place holders rather than drafting accurate reports"; "these reports are AI generated so we need those things in
 * there". What went wrong (docs/REPORT_AI_REBUILD_2026-11-06.md): the AI rewrote a whole section and its prose replaced
 * the section, so a section made of a table came back without it; the prompt itself asked for a placeholder when data
 * was thin; the AI saw 30 rows of a table and had 800 tokens to write in, so the checker flagged what it could not see.
 *
 * Now a section is two things:
 *   locked   the tables, lists, appendices and figures the template names ({{fha_table}}, {{appendix:fta}},
 *            {{figure:fta_top}}): always built from the project, never written or dropped by the AI;
 *   narrative what the AI writes: the text around them, from the project's data and the section's ARP4761A purpose.
 * compose() puts every locked block back after the AI's text (where the AI placed one itself, it stays there).
 * A section whose tables are all empty and that has nothing else to say is written without the AI, as a plain
 * statement of what the project has not recorded yet. guard() refuses a placeholder ("[...]", "TBD" not in the data,
 * "to be added in a later revision", "insert ... here") and markdown headings; reports.js redrafts once with what the
 * guard and the claim checker found, and a draft still flagged shows its flags for the engineer.
 * The AI sees every row of the section's own tables (up to ROW_CAP) and the size of every other table.
 * AI-facing text (GUIDE, RULES) is eval-gated (WORKING_RULES rule 29): skill report.section.draft v2.
 * Pure functions, no screen code. */
(function (root) {
    'use strict';
    var VERSION = '1.0', SKILL = 'report.section.draft', SKILL_VERSION = 2, ROW_CAP = 200, MAX_TOKENS = 1600;
    var TOKEN_RE = /\{\{(appendix:[a-z]+|figure:[a-z_]+|[a-z0-9_]+)\}\}/gi;
    function S(v) { return String(v == null ? '' : v); }
    function isTable(v) { return Array.isArray(v) && v.every(function (r) { return r && typeof r === 'object'; }); }
    function titleOf(tok) {
        try { if (root.SLReportWriter && root.SLReportWriter.tableTitle) return root.SLReportWriter.tableTitle(tok); } catch (_) {}
        return S(tok).replace(/_(table|list|summary|grid)$/, '').replace(/_/g, ' ');
    }

    // ---- the section's locked blocks and its narrative -------------------------------------------------------
    function locked(prose, data) {
        var out = [], m, re = new RegExp(TOKEN_RE.source, 'gi'), seen = {};
        while ((m = re.exec(S(prose))) !== null) {
            var name = m[1], kind = /^appendix:/i.test(name) ? 'appendix' : /^figure:/i.test(name) ? 'figure' : isTable(data && data[name]) ? 'table' : null;
            if (kind && !seen[name]) { seen[name] = 1; out.push({ token: name, kind: kind }); }
        }
        return out;
    }
    function narrative(prose, data) {
        var L = locked(prose, data).map(function (x) { return x.token; });
        return S(prose).replace(new RegExp(TOKEN_RE.source, 'gi'), function (all, name) { return L.indexOf(name) >= 0 ? '' : all; }).replace(/\n{3,}/g, '\n\n').trim();
    }
    // the AI's text with every locked block of the template: one the AI placed stays where it is, the rest follow in order
    function compose(aiText, prose, data) {
        var L = locked(prose, data), t = S(aiText).trim(), present = {};
        (t.match(new RegExp(TOKEN_RE.source, 'gi')) || []).forEach(function (x) { present[x.slice(2, -2)] = 1; });
        var missing = L.filter(function (x) { return !present[x.token]; }).map(function (x) { return '{{' + x.token + '}}'; });
        return (t + (missing.length ? '\n\n' + missing.join('\n') : '')).trim();
    }

    // ---- what the project has not recorded, said plainly ----------------------------------------------------
    function missingFacts(prose, data) {
        return locked(prose, data).filter(function (x) { return x.kind === 'table' && !(data[x.token] || []).length; })
            .map(function (x) { return 'No ' + titleOf(x.token).toLowerCase() + ' are recorded in the project yet.'; });
    }
    // a section with only empty tables and no words of its own needs no AI: it says what is not recorded
    function deterministic(section, data) {
        var prose = S(section && section.prose), L = locked(prose, data);
        if (!L.length || narrative(prose, data).replace(/\s+/g, '').length) return null;
        if (L.some(function (x) { return x.kind !== 'table' || (data[x.token] || []).length; })) return null;
        return compose(missingFacts(prose, data).join(' '), prose, data);
    }

    // ---- the guard: no placeholders, no headings ------------------------------------------------------------
    var PLACEHOLDERS = [
        [/\[[^\]\n]{1,120}\]/, 'text in square brackets reads as a placeholder'],
        [/\b(subsequent|future|later|next) (revision|issue|version|update)s?\b/i, 'promises content for a later revision instead of saying what is not recorded'],
        [/\b(to be|will be) (added|provided|completed|confirmed|defined|supplied|inserted|developed|documented)\b[^.]{0,40}\b(later|subsequent|future|next|in due course)\b/i, 'promises content later instead of saying what is not recorded'],
        [/\b(insert|add|enter)\b[^.]{0,40}\bhere\b/i, 'an instruction to fill something in'],
        [/\bplace-?holder\b/i, 'the word placeholder'],
        [/\blorem ipsum\b/i, 'filler text'],
        [/\b[X]{3,}\b/, 'a run of X used as a blank'],
        [/<[A-Za-z][^<>\n]{0,60}>/, 'angle-bracket text reads as a blank to fill'],
    ];
    function guard(text, data) {
        var t = S(text), flags = [], blob = '';
        try { blob = JSON.stringify(data || {}); } catch (_) {}
        PLACEHOLDERS.forEach(function (p) { var m = t.replace(new RegExp(TOKEN_RE.source, 'gi'), '').match(p[0]); if (m) flags.push({ kind: 'placeholder', token: m[0], why: p[1] }); });
        var tbd = t.match(/\b(TBD|TBC|TBA|TBR)\b/);
        if (tbd && blob.indexOf(tbd[1]) < 0) flags.push({ kind: 'placeholder', token: tbd[0], why: 'not in the project data' });
        if (/^\s*#{1,6}\s/m.test(t)) flags.push({ kind: 'format', token: '#', why: 'a heading inside the section' });
        return flags;
    }

    // ---- what the AI sees ------------------------------------------------------------------------------------
    function context(reportType, section, data, base) {
        var L = locked(S(section && section.prose), data), own = {}, ctx = {}, sizes = {};
        L.forEach(function (x) { if (x.kind === 'table') own[x.token] = 1; });
        Object.keys(data || {}).forEach(function (k) {
            if (k.charAt(0) === '_') return;
            var v = data[k];
            if (isTable(v)) { if (own[k]) ctx[k] = v.slice(0, ROW_CAP); sizes[k] = v.length; }
            else if (v == null || typeof v !== 'object') ctx[k] = v;
        });
        if (base && base.derived_analysis) ctx.derived_analysis = base.derived_analysis;
        ctx.report_tables = Object.keys(sizes).map(function (k) { return { table: k, title: titleOf(k), rows: sizes[k], in_this_section: !!own[k], sent: own[k] ? Math.min(ROW_CAP, sizes[k]) : 0 }; });
        ctx.blocks_in_this_section = L.map(function (x) { return x.kind === 'table' ? { kind: 'table', token: x.token, title: titleOf(x.token), rows: sizes[x.token] || 0 } : { kind: x.kind, token: x.token }; });
        ctx.not_recorded = missingFacts(S(section && section.prose), data);
        return ctx;
    }

    // ---- what each artifact's sections are for (ARP4761A) ----------------------------------------------------
    // [report type, heading pattern, what the section must cover]. The first match wins; GENERAL when none matches.
    var GUIDE = [
        ['*', /purpose|introduction|scope/i, 'State what this document is, the aircraft or system it covers, the certification basis given in the data, and what the assessment establishes, in the terms ARP4761A uses for this artifact.'],
        ['AFHA', /failure condition|hazard/i, 'Summarize the aircraft-level failure conditions in the table: how many there are by severity class, the functions they come from, and the flight phases where the worst severities arise. Name the catastrophic and hazardous ones by their IDs as the data gives them.'],
        ['SFHA', /failure condition|hazard/i, 'Summarize the system-level failure conditions in the table: their number by severity class, the system functions they come from, and how each traces to an aircraft-level failure condition where the data records it.'],
        ['PASA', /top-level failure/i, 'Introduce the aircraft-level failure conditions the PASA must satisfy: the number by severity, and the safety objective each class carries (the qualitative and quantitative objectives given in the data for the certification basis).'],
        ['PASA', /architect/i, 'Describe the aircraft architecture as the data records it: the systems, the redundancy and independence claimed between them, and where common resources or shared zones challenge that independence (ARP4761A Appendix B, the interdependence and common resource tables). Use only systems, resources and claims present in the data.'],
        ['PASA|PSSA', /allocated requirement/i, 'Introduce the safety requirements allocated by this assessment: how many, the failure conditions they answer, and their verification state where the data gives it.'],
        ['PASA|PSSA', /development assurance|dal/i, 'State the FDAL and IDAL allocation as the data records it: which functions or items carry which level, the top failure condition severity behind each, and any allocation that relies on independence (ARP4754B 5.2 and ARP4761A).'],
        ['PASA|ASA|PSSA|SSA', /common.cause|common-cause/i, 'Summarize the common cause analyses in scope (ZSA, PRA, CMA): how many findings or analyses each has, which are open, and which independence claims they support or challenge.'],
        ['*', /assumption/i, 'Introduce the assumptions this assessment rests on: how many, how many are validated or open, and which failure conditions or requirements depend on unvalidated ones.'],
        ['*', /fault tree/i, 'Introduce the fault trees: which failure conditions they analyze, the top-event probability against the objective for each where the data gives both, single-failure (order-1) cut sets, and the qualitative lane for development errors. Refer to the figures and the table for the trees themselves.'],
        ['PASA', /interdependence/i, 'Explain the functional interdependence table (ARP4761A Table B1): for each aircraft failure condition, the contributing systems, and what the marks show about where a single system or resource reaches several failure conditions.'],
        ['PASA', /common resource/i, 'Explain the common resource analysis (ARP4761A Table B3): the resources whose loss or malfunction reaches more than one contributing system, and the combined aircraft-level effect recorded.'],
        ['PASA', /minimum acceptable|mac/i, 'Explain the minimum acceptable configuration model: the floors recorded per aircraft function and the minimal breach combinations the model enumerates.'],
        ['PASA', /malfunction|mfms|summary tree/i, 'Explain the malfunction and failure mode summary trees: which are compiled from the model and proven equivalent, which are authored, and any disagreement recorded.'],
        ['PASA', /coffe|combined functional/i, 'Explain the combined functional failure effects worksheet (ARP4761A Table B2): the combinations assessed, where the engineering verdict and the computed model agree, and every disagreement recorded as a finding.'],
        ['*', /independence principle/i, 'Explain the independence principles claimed: how many, of which kind (failure independence from cut sets, error independence from DAL allocation), and which are verified, open or compromised.'],
        ['*', /methodology|safety program plan/i, 'Describe the safety assessment method as the program plan in the data records it: the analyses in scope, those tailored out and why.'],
        ['*', /checklist|completion/i, 'Summarize the completion checklist: objectives met, open and tailored out, naming the open ones.'],
        ['*', /tailoring/i, 'Introduce the tailoring register: each objective tailored out and that each carries a signed rationale, as recorded.'],
        ['ASA|SSA', /compliance|objective|verified|evidence/i, 'Show how the as-built design meets each safety objective from the data: the quantitative result against the objective per failure condition, the verified requirements, and anything still open. Never assert compliance; state the posture and what remains.'],
        ['PSSA|SSA', /fmes|fmea|failure modes/i, 'Introduce the failure modes and effects summary: the end effects, the failure modes that roll into each, and the rates where recorded, and which feed the fault trees.'],
        ['ZSA', /.*/, 'Summarize the zonal safety analysis: the zones assessed, the equipment and installation hazards recorded per zone, the findings open and closed, and the failure conditions a zonal event could reach.'],
        ['PRA', /.*/, 'Summarize the particular risk analysis: each particular risk assessed (rotor burst, tire burst, fire, bird strike, lightning and the others in the data), the systems and zones it reaches, and the result recorded for each.'],
        ['CMA', /.*/, 'Summarize the common mode analysis (ARP4761A Appendix M): the independence claims examined, the common mode types checked, and the findings with their status.'],
        ['FMEA', /.*/, 'Summarize the FMEA: the items and failure modes analyzed, their local and end effects, detection, and the rates where recorded.'],
        ['FMES', /.*/, 'Summarize the FMES: the end effects, the failure modes grouped under each, and the summed rates where recorded.'],
    ];
    var GENERAL = 'Write what this section of this artifact must say under ARP4761A, from the data given.';
    function guideFor(reportType, heading) {
        for (var i = 0; i < GUIDE.length; i++) { var g = GUIDE[i]; if ((g[0] === '*' || g[0].split('|').indexOf(reportType) >= 0) && g[1].test(S(heading))) return g[2]; }
        return GENERAL;
    }
    var RULES = [
        'Use only the project data in the user message. Do not invent failure conditions, severities, DALs, systems, requirements, probabilities or IDs.',
        'The tables, lists, appendices and figures listed in blocks_in_this_section are inserted by the engine after your text. Do not reproduce their contents row by row; introduce them and say what they show (counts, the worst cases, what is open). Write "the table below" or "the figures below" when you refer to them.',
        'Where something is not recorded (not_recorded, an empty table, a table with 0 rows in report_tables), say so in one plain sentence as a fact about the project, for example "No common resource effects are recorded in the project yet." Never write a placeholder: no square brackets, no "TBD", no "to be added in a later revision", no "insert here".',
        'Every ID, number and DAL letter you write must appear in the data exactly as written there. Prefer counts you can make from the rows given.',
        'Prose paragraphs only: no headings, no bullet lists. Two to five paragraphs.',
        'Formal and factual; third person ("the aircraft", "the system"), in American English spelling (summarize, analyze, organization, behavior). Advisory: never state that anything is compliant, meets all requirements or is certified; state the posture, what is open and the path.',
    ];
    function systemPrompt(reportType, def, section) {
        return [
            'You are drafting the "' + S(section && section.heading) + '" section of a ' + S(def && def.name) + ' (' + reportType + '), a certification document reviewed by the authority or its representative.',
            '', 'WHAT THIS SECTION MUST COVER:', guideFor(reportType, section && section.heading),
            '', 'RULES:'].concat(RULES.map(function (r, i) { return (i + 1) + '. ' + r; })).concat([
            '', 'THE TEMPLATE TEXT FOR THIS SECTION (tone and structure only; the facts come from the data):', '"""', narrative(S(section && section.prose), {}) || '(none)', '"""',
        ]).join('\n');
    }
    // the second attempt: what was wrong with the first
    function feedback(flags) {
        return 'Your draft was rejected by the deterministic checks. Fix every item and write the section again:\n' +
            flags.map(function (f) { return '- ' + S(f.token) + ': ' + S(f.why); }).join('\n');
    }
    // how the review card shows a locked block: what the engine will put there
    var FIG = { fta_top: 'Figure: the fault trees in scope (first sheet of each)', zsa_zones: 'Figure: each zone from the CAD model', pra_risks: 'Figure: each particular risk from the CAD model' };
    function blockLabel(token, data) {
        var t = S(token);
        if (/^figure:/.test(t)) return FIG[t.slice(7)] || 'Figure: ' + t.slice(7);
        if (/^appendix:/.test(t)) return 'Appendix: ' + t.slice(9).toUpperCase();
        var n = isTable(data && data[t]) ? data[t].length : 0;
        return 'Table: ' + titleOf(t) + ' (' + n + ' row' + (n === 1 ? '' : 's') + ', built from the project)';
    }
    function previewHtml(prose, data) {
        var esc = function (x) { return S(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
        var L = locked(prose, data).map(function (x) { return x.token; });
        return esc(prose).replace(/\{\{(appendix:[a-z]+|figure:[a-z_]+|[a-z0-9_]+)\}\}/gi, function (all, name) {
            return L.indexOf(name) >= 0 ? '<span class="rpt-block-chip" data-block="' + esc(name) + '" style="display:inline-block;margin:4px 0;padding:2px 8px;border-radius:6px;border:1px dashed var(--color-border-hair,#c7ccd4);font-size:11.5px;">' + esc(blockLabel(name, data)) + '</span>' : all;
        }).replace(/\n/g, '<br>');
    }
    var api = { VERSION: VERSION, blockLabel: blockLabel, previewHtml: previewHtml, SKILL: SKILL, SKILL_VERSION: SKILL_VERSION, ROW_CAP: ROW_CAP, MAX_TOKENS: MAX_TOKENS,
        locked: locked, narrative: narrative, compose: compose, missingFacts: missingFacts, deterministic: deterministic,
        guard: guard, context: context, guideFor: guideFor, systemPrompt: systemPrompt, feedback: feedback, GUIDE: GUIDE, RULES: RULES };
    try { root.SLReportAI = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
