# Safety Lab Aero: next-session handoff (12 Sep 2026)

Read this first, then `WORKING_RULES.md` (rules 27 to 30 are new), then the 12 Sep entry at the top of `HANDOFF.md`. `OPEN_ITEMS.md` section R holds the same items in register form; this file is the long version with the how-to for each.

Repo: `~/dev/safety-lab-deploy` (mounted at `$HOME/mnt/dev/safety-lab-deploy` over the device bridge). Deploy is only ever `cd ~/dev/safety-lab-deploy && ./ship.sh`, run by Waqas. ship.sh builds the WORKING TREE, so uncommitted changes deploy. The wall is `tests/*.test.js` + `eval/*.test.js`; a suite that exits non-zero counts as a failure even with no FAIL line (rule 27).

Device-mount gotchas that cost time this week: the mount forbids unlink, so `rm` and `git checkout -- <file>` fail. Revert a file with `git show HEAD:"$f" > "$f"`. Clear a stale git lock with `mv .git/index.lock .git/index.lock.stale.$$`. Move files aside into `_to_delete/<date>-<reason>/` instead of deleting.

---

## 0. Where things stand

Everything listed as built below is deployed and live on safetylabaero.com as of 12 Sep. The wall was 290 suites, 0 fails, 0 crashes at the last run on the Mac.

Built and live this week: the Terminal redesign (app, landing page, 13 marketing pages, sign-in gate); the severity pill system across every analysis; cert-basis definitions aligned to AC 25.1309-1B Table 4-1 with our context kept as additions; landing copy with no em dashes; the shared `marketing.css`; ~150 undefined color aliases (`--color-border`, `--color-surface`, `--color-text`, `--color-link`) defined so grey stopped leaking; sync Stages 1 to 3 plus the CRDT-authoritative flip plus node-level fault-tree merge; MFA step-up; Microsoft SSO; membership/ownership rewrite; customer-install DB kit proven on real Supabase; proxy offline-licence mode.

NOT committed: all of the redesign and severity work (59 files against commit ab73d55). That is item 1.

---

## 1. Commit the redesign (do this before anything else)

Why: 59 files are deployed but only exist in the working tree. If the folder is damaged (iCloud did this once), the live site cannot be rebuilt from git.

How:

```
cd ~/dev/safety-lab-deploy
mv .git/index.lock .git/index.lock.stale.$$ 2>/dev/null; mv .git/HEAD.lock .git/HEAD.lock.stale.$$ 2>/dev/null
git add -A
git commit -m "feat(ui): Terminal redesign (app + landing + marketing), severity pill system, AC 1309 definitions, alias tokens" 
```

What is in it, so the message can be split if preferred: `site/safety_lab.css` (tokens, dark nav, black table heads, serif titles, gradient buttons, severity pills, alias tokens, 2px table borders); `site/index.html` (cache pins, legend chips, cert-basis table); `site/landing.html` (light identity, centering, separators, dropdown, About layout, em dashes, founder card back to "MW"); `site/marketing.css` (new) + 13 marketing pages linking it; `site/seo.css`; `site/auth_gate.js`; helpers_modules (sevPillHtml + 5 sites), and the modules carrying a `_sevPill` shim: asa_triage, budget_ledger, fc_tree_flow, data_ops_modules, cca_models, ffs_module, ram_trace, bindings_modules, event_trees, exposure_case, fta_freq, fault_sim, stpa_panel, bowtie, fta_view_modules, model_checks, fc_variants, hf_severity_badge, misc_fn_modules, safety_lab, severity_axes, gt_thread, zonal_ui, pra_canvas, cma_walkthrough, msg3_zonal, ai_assistant (color map only), ai_loader (pin). New tests: `regression_severity_pills`, plus guard updates in `regression_landing_paginate`, `regression_fha_group`, `regression_fha_derive`. Docs: HANDOFF.md, OPEN_ITEMS.md, WORKING_RULES.md.

Verify: `git status --short | wc -l` returns 0; the two version-locked files `site/eula_modal.js` and `site/license_modal.js` show NO diff (rule 28).

## 2. Desktop app catch-up

Why: the desktop app wraps a snapshot of the web build. Until it is re-pulled it still shows the old paper design and the old severity colors.

How (on the Mac, after item 1):

```
cd ~/dev/safety-lab-desktop && bash pull-web.sh && ./release.sh
```

`pull-web.sh` refuses a dirty web tree, which is another reason item 1 comes first. Details of the desktop shell live in memory notes (`/areas/safety-lab-desktop`) and the 6 Sep HANDOFF entries.

Verify: launch the desktop build, open the FHA page, confirm the black side nav and the severity pills.

## 3. Regenerate the demo data

Why: every demo SFHA row references a system function id and an FC id that do not exist in that system (each demo system has zero extracted FCs). The 9 Sep editor fix injects the row's own value as a selectable option so the editor no longer blanks, but the underlying demo data is still wrong, and any customer poking at a demo will see SFHA rows that trace to nothing.

Where: `site/demo_projects.js`, `site/demo_showcase.js`, `site/demo_showcase_halcyon.js`, `site/demo_showcase_vayu.js` (and `data_ops_modules.js` around line 2500 for the seeded EPS/LGS examples). The SFHA rows carry `funcId`/`fcId` fields that must match the system's `sysFunctions` and extracted FCs.

How: for each demo, build the system functions and FCIM/extracted FCs first, then generate SFHA rows that reference them by id. Write a wall check that walks every demo and asserts every SFHA row resolves (function id exists in its system, FC id exists) so this cannot regress.

Verify: open each demo, open an SFHA row for edit, confirm the Function and FC selects show the row's values as real options, not injected fallbacks; the new suite is green.

## 4. American English, surgical

Why: Waqas wants American English app-wide. The bulk sweep on 11 Sep was reverted because it broke 14 suites: it renamed all-caps identifiers (`CATALOGUE` referenced as `PP.CATALOGUE`), touched object keys (`programme:`), and edited AI knowledge files that are eval-gated.

Scope Waqas chose: visible text + AI prompts.

How, in two batches:

Batch A (safe, no eval): UI-visible strings only. Replace inside string literals and HTML text; skip any token that is all caps, any identifier preceded by `.`, any object key (`word:`), and any file in the eval-gated set. Candidate words: colour, catalogue, programme, behaviour, analyse, organisation, licence (note: `licence` appears in code identifiers and file names of the licence system; only change display text), centre, metre, favour, honour, modelling, labelled, cancelled, judgement (the AI schema uses `judgementCall`/`judgementNote` keys, keep those). Run the full wall after every file.

Batch B (eval-gated): `ai_skills.js`, `ai_assistant.js` prompt bodies, `cert_std_kb_data.js`, `hf_kb_data.js`, `stpa_kb_data.js`, `fta_kb_data.js`, `sora_kb_data.js`, `cert_basis_spine.js`, `program_plan.js`, `severity_rubrics.js`. Rule 29: never modify AI-facing verbiage without the eval. One golden eval run (about $5) against `eval/golden_aeolus_v5.json` before shipping this batch. Quoted regulatory text in the rubric stays exactly as the authority wrote it, whichever spelling it uses.

Verify: wall green after A; golden eval unchanged after B.

## 5. MAC screen rework

Why: 5 Sep item 16, Waqas: "the MAC screen is messed up, needs to be markedly more intuitive." Parked 11 Sep: "needs more of my brain cells." Do not start this without him in the loop.

What exists: the 11 Sep Terminal mockup (artifact "redesign.html", version 9) contains a MAC page that puts the minimum-configuration set and the flight phases on one screen so the breach condition builds in one place. That is a starting point, not a spec. The earlier 10 Sep suggestions were lost to context compaction; re-derive from the current MAC code (`mac_l3.js` and the MAC UI in helpers/misc modules) before proposing.

How: read the current MAC screen and code, list the specific pain points, propose a design with a mockup, get Waqas's confirmation, then build. Rule: state back the understanding before doing.

## 6. Sync Stage 4: delete the rollback switch

Why: the CRDT-authoritative flip is live (`window.SL_CRDT_AUTHORITATIVE = true` in index.html since 9 Sep). The flag-off branch in `crdt_sync.js` (`adoptModel` Stage-1 adopt-window path, `authOn()` checks) is the one-line emergency rollback. Waqas deferred deletion "after it bakes" so the undo stays available through the customer go-live.

How, when he says go: remove the flag-off branches in `crdt_sync.js` (`authOn()` becomes always true, the adopt-window path goes), remove the inline flag from index.html, update `regression_crdt_authority` (its flag-off checks become "no flag-off path exists"), run the wall, ship. Nothing else in the old sync stack is deletable: `cloud_sync.js` autosave is now the periodic backup writer and the browser lock is the substrate of the CM baseline lock (`lock_enforce.js`, `lock_custody.js`).

Verify: the served `crdt_sync.js` no longer contains the flag-off strings; two signed-in tabs on a real cloud project still co-edit live.

## 7. Customer-install live AI round-trip

Why: "no customer data on our cloud" is build-complete except the final proof of the AI path on a customer's own key. The DB half is proven on real Supabase (throwaway project yiisexbngnjakkqkmctw, still running at $10/mo). The proxy offline-licence mode is proven 7/7 with a throwaway key.

Gate: one AI key from Waqas (Anthropic, or Bedrock, or Azure). He said 9 Sep it is not happening soon; parked.

How, when the key arrives: deploy the proxy (Cloudflare worker or `server.mjs` standalone) with `LICENSE_MODE=offline`, the public key, and the customer AI key; serve the app with `slab_env.js` generated by `customer-install/configure.js` pointing at the throwaway DB and that proxy; sign a trial `.lic`; run one FHA draft end-to-end; confirm with `SLConfigEgress()` that no request touched safetylabaero.com or the prod Supabase host.

## 8. Service-key rotation (Supabase)

Why: the service_role JWT is embedded in plaintext as an argument in five db-webhook triggers (review_assignments, review_comments, reviews, users signin, users signup notifications). It is in the schema and therefore in backups.

How: choreographed with Waqas, never solo. Regenerating the JWT secret changes both the anon and service keys at once, so in one sitting: regenerate; update the app's anon key and ship; update the edge-function environment; recreate the five triggers with the new service key; smoke test sign-in and a review notification. Prepare the SQL for the five triggers in advance so the window is minutes.

## 9. Staff AI entitlement on the proxy

Why: all @safetylabaero.com accounts are comped at Enterprise in the app (`COMPED_ENTERPRISE_DOMAINS` in bindings_modules, `compedTierFor` in misc_fn_modules), but the AI proxy in `safety-lab-proxy-deploy` meters by the DB `rate_limit_rpm`, not by email domain, so staff still hit the default AI limits.

How: in the proxy's DB-mode auth path, resolve the caller's email from the license_tokens row and apply the Enterprise rate limit for the staff domain (or write the staff rows' rate_limit_rpm directly, which needs no code). Add a proxy test.

## 10. Google Fonts hot-link

Why: `site/index.html` (lines 19 to 21) and `site/landing.html` link fonts.googleapis.com for IBM Plex and Inter. The self-host rule for ITAR and air-gapped installs says the app must not call out for fonts. The org proxy blocks the font hosts anyway, so today the app renders system fallbacks.

How: either drop the links and rely on the system stack already in `--font-sans`/`--font-mono`, or ship the woff2 files in `site/fonts/` with `@font-face` in safety_lab.css (build.sh already allowlists `*.woff2`). Newsreader (the serif for h1/h2) could not be fetched from the cloud or the device; Georgia is the working fallback. Marketing pages may keep hot-links (public site), but the app should not.

## 11. Microsoft sign-in secret expiry

The Entra app "Safety Lab Aero – Web Sign-in" (client bb5194ab-9e8d-49e8-835a-4dbc26bd7467) has a client secret expiring around February 2027. Renew it in Entra and update the Supabase Azure provider before then, or sign-in with Microsoft stops. Put a reminder on Waqas's calendar for January 2027.

## 12. Search Console and Bing Webmaster Tools

Why: the 8 Sep SEO report's only real action. Bing scored 18/100 because the site was never submitted. The site already has `sitemap.xml`, `robots.txt`, FAQ schema on the five guide pages, and Organization/SoftwareApplication schema on the landing page.

How: Waqas creates the two properties under his Google and Microsoft logins; Claude adds the verification file (or DNS TXT if he prefers), submits `sitemap.xml` in both, and adds an IndexNow key file plus a ping in ship.sh. Read-only access only for any outside consultant; nobody outside gets repo, CMS, or DNS.

## 13. Report exports still use the old severity colors

`reports.js` (docx/pdf generation) colors severities its own way. The pill system was applied to the app only, on purpose. Decide with Waqas whether exports should follow (soft fills with black text print well; the old dark reds print badly on some printers). If yes, map the same five fills in the export renderer and add a check.

## 14. Golden run 2 (FHA consistency)

Why: Waqas wants three fresh FHA draws on identical inputs after the severity fixes, judged against the 90% consistency bar, and then the wider thread run (systems → interdependence → MAC → CoFFE → compiled fault trees) with the AI doing each step from the SDD. Tree logic must be identical run to run; node prose close on meaning.

How: each draw in a fresh session from an empty FHA (measurement rule, not a product rule); export every draw to the repo under `eval/` before scoring (rule 26: measurement data is never deleted). Cost about $5 per full FHA draw. The temperature setting is stripped for Opus 4.7+, so draws measure default sampling; note that in the results.

## 15. SL-WP-0003 Data Security v3.0 hold

The white paper was written as-built ahead of the build at Waqas's direction. It must not go to Boom, ZeroAvia, Aero Vodochody, or Boeing until customer-hosted (item 7) and the packaged AI backends are live and Waqas has eyeballed them. The workspace-security section (§20) is written from the verified live model and is fine.

## 16. Prompt caching on the AI path (budget: biggest single saving available)

Why: Anthropic emailed Waqas about prompt caching and he asked whether we can use it; today we do not, anywhere. Every AI call sends the whole `system` prompt as ONE plain string: the FHA skill body (`_BODIES_FHA_SHARED` in `ai_skills.js` is thousands of words), the severity rubric, the cert-basis block, and the extracted source-document context. All of it is re-billed at full input price on every draw, every repair pass, every review. A ten-row FHA session can resend the same 30 to 60k tokens dozens of times. With caching, repeated reads of the stable prefix cost about a tenth of the normal input price (cache writes cost a quarter more once, then reads are cheap for five minutes, refreshed on each hit), so a working session on one project should burn on the order of 60 to 80 percent less input budget.

Where: client side only. `site/core_modules.js` `messages()` (line ~318) builds the body and sets `body.system = opts.system` as a string. The proxy (`safety-lab-proxy-deploy/worker.js`, `handleAnthropic`) forwards `bodyText` untouched to `api.anthropic.com`, so cache markers pass straight through. Callers assemble the system prompt in `ai_assistant.js` (`_fhaSystemPrompt`, `_decompSystemPrompt`, `_assembleAnalysisContext`, `_severityRubricBlock`).

How:

1. In `core_modules.js` `messages()`, accept `opts.system` as either a string or an array of `{type:'text', text, cache_control?}` blocks. When it is a string, wrap it as one block. Add `cache_control: { type: 'ephemeral' }` to the LAST stable block (the API caches everything up to and including the marked block; up to four markers are allowed).
2. In `ai_assistant.js`, split each system prompt into ordered blocks so the stable part comes first and the variable part last: [skill body] [severity rubric for this basis] [project source-document context] [per-call scope such as the system name and the function list]. Put a marker on the skill body block (identical across every project, so it caches globally for the account) and a second marker on the source-document context block (identical within a project session). Anything that changes per call goes AFTER the last marker. Do not change a single word of any prompt or rubric (rule 29); this is packaging only, and the model sees the identical text.
3. `_assembleAnalysisContext` is the one place to do the split, so every severity-assigning feature (`fha.populate`, `sfha.populate`, `fcim.populate`, `fmea.*`, `fta.review`, `doc.review`, `req.recommend`) inherits it. Chat (ANEM) gets the same treatment on its system prompt.
4. Streaming (`stream: true`) is fine with caching. Minimum cacheable prefix is 1024 tokens for Sonnet/Opus (2048 on Haiku), which the skill bodies clear by a wide margin.
5. Metering: the proxy reads `usage.input_tokens` and `output_tokens` from the stream (`worker.js` ~line 138) and bills the license. With caching the response also carries `cache_creation_input_tokens` and `cache_read_input_tokens`. Update `weightedTokens` to price cache reads at 0.1x and cache writes at 1.25x so Pro+ allowances reflect the real cost and staff can see the saving; log both counts in `audit_log` if the AI writer is ever wired.
6. ITAR routing: `sovereign_router.js` translates to Bedrock or Azure OpenAI Government. Bedrock's Anthropic models accept `cache_control` unchanged; the Azure OpenAI translation must STRIP `cache_control` from blocks (Azure has its own automatic caching and rejects unknown keys). Add that strip in the Azure branch.
7. Eval: the text sent to the model is byte-identical, so this is not a prompt change and needs no golden eval; still, run one FHA draft on Aeolus and compare the raw response shape to yesterday's, and read `cache_read_input_tokens` in the second call to prove the cache hit.

Verify: two consecutive FHA drafts on the same project within five minutes; the second response's `usage.cache_read_input_tokens` is large and `input_tokens` is small; the wall stays green; `regression_ai_repeatability` unchanged. Add a client test that asserts the system prompt reaches `messages()` as blocks with the marker on a stable block and nothing variable before it.

Estimated size: half a day, mostly in `ai_assistant.js`, plus the proxy pricing tweak.

---

## Standing rulings that shape all of the above

Customer data never touches Safety Lab's cloud; the hosted site is for trials, demos, and internal use only. Controlled work runs only on Claude via Bedrock (GovCloud), Azure Gov, or our own LLM; no Google. Rebuild rather than patch when the existing thing is wrong; no half-fixes. American English everywhere. Plain language in every response; state back the understanding and confirm before acting; always hand Waqas the deploy command as a copyable block; do not offer breaks.

## Verification methods that work

Marketing pages: stage the HTML plus `seo.css`/`marketing.css` to the cloud, rewrite `/seo.css` and `/marketing.css` to relative paths, render with headless Chromium at `/opt/pw-browsers/chromium-*/chrome-linux/chrome --headless --no-sandbox --screenshot`, crop and read the PNG. For the landing page, neutralize the 100vh sections in the throwaway copy (`.hero{min-height:auto!important} body > section{min-height:auto!important}`).

Logged-in app: Claude-in-Chrome signed in as mwnafees9. Claude's tab is usually hidden behind Waqas's, so screenshots show HIS tab, not Claude's; use `javascript_tool` computed-style scans instead. `switchTab('<id>')` is synchronous; never `await` timers (throttled in hidden tabs). Close the tab when done: it triggers his "active in another tab, saving paused" lock.

Severity rendering: `sevPillHtml('Catastrophic', { dal: true })` in helpers; `regression_severity_pills` guards every site.
