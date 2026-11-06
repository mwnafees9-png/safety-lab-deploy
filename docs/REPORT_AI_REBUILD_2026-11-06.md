# AI-drafted reports rebuild (6 Nov 2026)

Waqas (6 Nov): "I want safety lab AI generated for every 4761 artifact, and the current PASA AI generated report, doesnt
create tables and diagrams, gave a lot of errors and place holders rather than drafting accurate reports"; "yes I want it
before [Sys Lab], and these reports are AI generated so we need those things in there".

## What is wrong today (reports.js v3 AI bulk-draft, lines ~4370-5150)
1. One generic prompt (_systemPromptForSection) for all 19 report types; the AI rewrites the WHOLE section prose and the
   accepted prose replaces the section (projectReportEdits). A section that is only a table token ({{fha_table}}) comes
   back as prose: the table is gone. Same for {{appendix:fta}} (the fault tree sheets, the only figures).
2. Rule 2 of the prompt instructs the placeholder: "[Data to be added in subsequent revisions]".
3. Context capped: 30 rows per table (sectionContext 40), 800 max tokens per section; the claim checker
   (ai_fidelity.checkClaims) then flags every ID/number the AI could not see -> the "errors".
4. report_writer.js TITLES mislabel several tables (mac_table "Multiple aircraft configurations", mfms_table "Multiple
   failure modes", ip_ledger_table "Issue papers", ccmr_table "Certification check maintenance requirements",
   coffe_table "Combinations of failures and failure effects").

## Plan
1. site/report_ai.js (SLReportAI): split a section into narrative + locked blocks (tables, lists, appendices, figures);
   the AI drafts only the narrative; compose() always puts every locked block back. Empty data -> a deterministic
   statement of what the project has not recorded (from the token titles and the gap list), never a placeholder.
   guard() rejects placeholders/markdown; one redraft with the checker and guard findings; full rows for the section's
   own tables (up to 200), summaries for the rest; maxTokens 1600. Per-artifact section guidance grounded in the
   ARP4761A appendix for each artifact (AFHA, PASA, ASA, SFHA, PSSA, SSA, ZSA, PRA, CMA, FMEA, FMES): skill
   report.section.draft v2, eval-gated (rule 29).
2. Figures in the body: {{figure:...}} tokens rendered as writer 'sheets' blocks: fault trees per failure condition
   (PASA/ASA/PSSA/SSA), architecture diagrams (diagram_editor toSvg), event trees/bow-ties, ZSA and PRA autopilot
   pictures.
3. Fix the writer titles.
4. AI drafting for the 4761 analyses still without it (dependence diagrams, Markov, CEA, PSSA/SSA budget work).
5. Golden eval per report type on Aeolus before ship.

## Baseline, live (6 Nov 2026, safetylabaero.com, Aeolus HL-1, the deployed reports.js v66.23, 27 sections)
- 10 of 27 PASA sections came back with "[Data to be added in subsequent revisions]" (Allocated Requirements,
  Development Assurance Allocation, Linked Fault Trees, Qualitative Functional Failure Scenarios, Appendices, ...), on a
  project that has the data. 1 section flagged by the claim checker ("Order-1" read as an ID). 0 errors this run.
  Tables survived this run only because the AI happened to repeat the tokens; nothing kept them.

## Progress
- report_ai.js v1.0 (SLReportAI), reports.js v66.24 (_draftSectionWithAI rebuilt on it, the old prompt and its
  placeholder rule deleted; figure tokens fta_top, zsa_zones, pra_risks), report_writer.js v1.2 (titles),
  zsa_autopilot.js v1.2 / pra_autopilot.js v1.3 (figures()). Test regression_report_ai_20261106 (23 checks; mutations
  nocompose, noguard, nodet, cap30 red).
- Figures render: autopilot_ui.js v1.4 figure() stacks the views into ONE standalone svg (picture() returned an HTML
  wrapper with several svgs and a legend div, which SLFtaPrint.png could not draw); the test now renders a PNG.
- report_ai RULES: American English spelling added (the live AI wrote "summarises").
- Live eval (Aeolus HL-1, injected): PASA 27 sections, 0 placeholders, 0 flags, 0 tokens lost; AFHA 11 sections 0/0/0;
  SFHA (FCS) 10, PSSA (FCS) 20, PSSA 20: 0 placeholders, 0 flags after, 3 redrafts. SSA, ASA, ZSA, PRA, CMA, FMEA,
  FMES running. An earlier chain hung on one AI call: every eval call now has a 150 s limit.
- Markov (plan item 4): markov_ai.js v1.0 (SLMarkovAI, skill markov.draft v1). The AI proposes states and transitions
  for one system; each transition names the project's rate sources (basic event λ/μ, FMEA λ) and the rate is their
  sum, worked out by the engine; unknown refs dropped and flagged, missing rates kept at 0 and flagged, the same
  sources leaving two states flagged, rates in the description flagged. Review panel, Accept adds the model with its
  provenance (forSystemId; the home level is stamped as usual). Launcher action "Draft a Markov model" (ai_assistant
  v77.04, gate 'markov'), lane bar on the Markov page (lane_ai_bar 1.7). Test regression_markov_ai_20261106 (21 checks;
  mutations nosum, anyref, nonum red). Live: hydraulic power 3 to 2 to 1 to 0 systems, rates 3, 2 and 1 x the
  system loss rate from BE-7102..7104, no issues (after the prompt said to list only the items still working; the
  first run listed all three on every step).
- CSP: markov_ai.js first read the stores with new Function; the production CSP (worker.js: script-src 'self'
  'unsafe-inline', no eval) blocks that, so in production it would have seen an empty project. Now SLEnv; the Markov
  and report tests serve that CSP so the next eval is caught (proved: the eval version goes red).
- Markov live, all four systems correct: hydraulics 3/2/1 x system loss rate; electrical 4/3/2/1 x generator rate,
  APU rate missing and flagged; flight controls the two dissimilar elevator lanes with their own FMEA rates;
  propulsion 4/3/2/1 x engine rate (that reply had a stray brace: parse() repairs it, and draft() asks once more
  for valid JSON when a reply cannot be read).
- Live report eval complete: AFHA 11, SFHA 10, PSSA 20, SSA 24, ASA 19, ZSA 9, PRA 9, CMA 10, FMEA 7, FMES 5, PASA 27
  sections: 0 placeholders, 0 flags after review, 0 errors, 0 tables lost (redrafts: 0 to 3 per report).
- DAlgebra (Waqas, 6 Nov): a claimed independence takes the reduction again, CMA pending; see OPEN_ITEMS RA-4.
