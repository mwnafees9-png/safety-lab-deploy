# Closed items — archive

Split out of `OPEN_ITEMS.md` on 28 Sep 2026 at Waqas's request ("remove entries that are completed
and/or obsoleted/overcome by other tasks"), after checking each entry against the code and the live
app rather than trusting the register.

Nothing here is deleted, because these entries carry the PROOF a finding was fixed: migration ids,
test counts, mutations run, what was verified live. If a customer or an auditor ever asks how a
security finding was closed, the answer is in this file. Live work stays in `OPEN_ITEMS.md`.

Measurement data is never deleted (rule 26); none is touched here.

## 14 Sep 2026 — LIVE + CODE RECONCILIATION (Waqas: "confirm from the live app and code, what's built and what is not"). Full evidence table in `BUILD_STATE_2026-09-14.md`.

Checked every open entry against the running site, the three repos (safety-lab-deploy, -proxy-deploy, -desktop), the migrations, and HANDOFF. Corrections to this register:

**Now CLOSED (were still listed open below — verified built):**
- S1 membership hole — migrations 20260905/20260907 x3, applied and verified live 5 Sep.
- S2 MFA — auth_gate step-up ON unless SL_MFA_REQUIRED===false; live page has the flag unset. (Server-side AAL enforcement not separately confirmed — see BUILD_STATE §3.)
- S3 ITAR fences — commits 65c185a, e7275ed, a0d6c86 (ONE fence at the AI choke point; chat-lane guard retired; itar-cloud refused; answer cache honours the flag); regression_controlled_ai_fences 36 checks.
- S12 served-tree leak — build.sh allowlist; stale artefacts out of the served tree. (DDL/migration-capture half still open.)
- S19–S21 customer-hosted — see the superseded note at those entries.
- S23 desktop sign-in bypass — auth_gate Electron bypass gone; desktop signs in at the gate.
- A12 data half — consumedBySystems read by cea_graph and carried in demo data. (Write-back path still open.)
- H-8b — erase_my_account / erase_project / verify chain fns are in migrations 0005/0006/0008.

**DONE 14 Sep 2026 — S4/S6/R10 DEPLOYED + VERIFIED LIVE (via ship.sh); S10 committed, its own `supabase functions deploy` + a real-signin check still to run:**
- S4 — DONE + LIVE (cf006e8, verified in-browser: unknown /app path now carries all headers, a missing .js is a real 404). Worker now owns the SPA fallback: assets not_found_handling 'none', a missing /app/<file> is a real 404 with the hardening headers, an extensionless deep link gets the shell via serveHtml (CSP + headers), every asset stamped nosniff/frame/HSTS. Behavioural test regression_app_headers (16). Deploys via ship.sh.
- S10 — DONE (e7dcbe2). CORRECTION to the earlier note here: it was the four DB-webhook functions (notify-signin/-signup/-expiry/-review) that accepted any Bearer >= 16 chars; notify-feedback/-invite already verify a real user JWT and were fine. The four now verify the caller's token equals SUPABASE_SERVICE_ROLE_KEY in constant time (the triggers/cron send exactly that), fail closed. regression_notify_auth (42). DEPLOYS SEPARATELY via `supabase functions deploy`; verify a real sign-in still emails after.
- R10 — DONE + LIVE (cf006e8, verified: 0 google-font refs served). Google Fonts <link>/preconnect removed from all 12 pages; pinned in regression_marketing_routes. Deploys via ship.sh.
- S6 — DONE + LIVE (dbfd458, verified: /trust reads 'never train on your content', old claim gone). trust.html now states we never use customer content to train/fine-tune any model; the self-contradiction is gone. Pinned in regression_marketing_routes. Deploys via ship.sh.

**Confirmed STILL OPEN and visible live today (highest signal):**
- S5 — DONE (505cd65, wall 309/0/0). lock_seal now reads sealed stores via SLEnv (CSP-safe) not eval; the seal hashed nothing before. Behavioural test regression_seal_content (7). Deploys via ship.sh.
- S8 (credentials off browser localStorage) — IN PROGRESS. Waqas ruled 14 Sep: build a server-side secret vault on the customer's own DB, for BOTH Jama and AI keys; prove local Postgres then throwaway Supabase. PHASE 1 DONE + PROVEN on local Postgres (commit 79452d0): user_secrets table, write-only-from-client via SECURITY DEFINER save_secret/delete_secret + read-only my_secrets_status (kind/meta, never a value), service_role reads server-side. Shipped in customer-install/db/08_user_secrets_vault.sql (apply.sh wired) + supabase/migrations (timestamped), NOT applied to any live DB. PHASE 2 DONE 14 Sep (real-auth proof on the existing throwaway yiisexbngnjakkqkmctw — all checks passed with real roles). PHASES LEFT: 3 app write path (rpc calls replace localStorage; browser-only->local store, desktop->keychain), 4 server read path (Jama bridge + AI proxy read via service_role), 5 customer-install+prod apply, 6 tests. Plan: customer-install/db/VAULT_DESIGN.md.
- S7 (no audit-log writer) — DONE 16 Sep (3dc9f50). The judgement above was wrong: it was not an
  enterprise build, it was two SECURITY DEFINER functions and four client call sites. The table,
  the chain trigger, the immutability trigger and the read policies had all existed and been
  correct the whole time; nothing had ever written a row. Shipped with it: DEFINER wrappers so
  verify_signoff_chain stops erroring for every real user, TRUNCATE/UPDATE/DELETE revoked on all
  five append-only ledgers (anon held TRUNCATE on signoffs and UPDATE+DELETE+TRUNCATE on
  project_baselines and destruction_certificates on PRODUCTION), a daily pg_cron verification
  recorded in public.chain_verifications, and a trail on the break-glass hatches. Migrations
  20260916c/d APPLIED TO PRODUCTION and verified there as an ordinary authenticated role;
  customer bundle 09/10 wired into apply.sh. trust.html corrected. regression_audit_writers (96),
  eight mutations run against it. Client side needs ./ship.sh to reach browsers.

- S2b (MFA step-up never fired) — FOUND + FIXED 16 Sep (e40e2d4). The sign-in step-up shipped
  6 Sep and had NEVER run: needsChallenge() read nextLevel from supabase-js's cached session,
  which carries no factor list, so it returned false for everyone. Production before the fix:
  two verified TOTP factors, 30 sessions, auth.mfa_amr_claims = 20 password + 10 email/signup
  and ZERO totp. Fixed to read the factor list from listFactors() and fail closed in four
  places; mfa 1.3, auth_gate 62.74; regression_mfa_step_up (25), six mutations.
  POLICY (Waqas, 16 Sep): 2FA stays OPT-IN. SL_MFA_MANDATORY is deliberately unset, and
  SL-WP-0003 section 19 + the two other "enforced multi-factor authentication" claims were
  corrected in the document to match. NOTE ON DEPLOY: the two accounts that HAVE enrolled will
  now actually be challenged for a code — if either has lost the authenticator they need the
  factor removed before they can sign in.
- DOC CONTROL: two different files are both named "SL-WP-0003 Data Security v3.0" — the one on
  the Desktop (current, has the workspace-security section) and an older, shorter one in
  Downloads with its PDF, which predates that section and still claims MFA is enforced for
  every account. Only the Desktop copy was corrected. The stale pair should be replaced or
  removed before anything gets attached to an email by mistake.

## 23 Sep 2026 — S27 CLOSED, S26 CLOSED (was not a secret), ai_usage DROPPED (throwaway; production pending)

- **S27 git remote — CLOSED.** All three repos pushed to github.com/mwnafees9-png (safety-lab-deploy,
  safety-lab-desktop, safety-lab-proxy-deploy), local HEAD == origin/master on each. ship.sh now
  pushes after every successful deploy and warns if the push fails or uncommitted changes shipped,
  so GitHub cannot fall behind production silently. The desktop and proxy repos are pushed by hand
  (their release scripts are separate); `git push` after each commit there.
- **S26 desktop config.json "plaintext backend key" — CLOSED, NOT A SECRET.** Read main.js,
  shell_rules.js, settings.html: `backendKey` is the customer's PUBLISHABLE (anon) key, the one every
  browser bundle carries by design, and shell_rules hands it to the page as __SLAB_SUPABASE_KEY__ on
  every launch so the page can talk to the server at all. Encrypting it in the keychain would
  decrypt it straight back into the renderer; nothing gained. The credential that WAS a secret
  (Jama) went to the OS keychain 16 Sep (secrets.js). Hygiene only: config.json written owner-only
  (0600) like secrets.json — done in this commit. RLS and the licence are what protect the data,
  not the key.
- **ai_usage / increment_ai_usage — DEAD, DROPPED.** Not a broken meter: the first per-user design,
  superseded by consume_tokens on the licence row, which the proxy calls after every request and
  which produces allowance_exhausted. No caller, no reader in any repo. Migration 20260923a +
  customer-install 12_ (apply.sh wired). regression_h8_rls_disk_sync taught that a dropped table
  accounts for its 0001 policies. APPLIED TO THROWAWAY yiisexbngnjakkqkmctw and verified (table
  null, function 0, consume_tokens and set_updated_at intact, 30 public tables). PRODUCTION
  fhrqkhdrwbfnizkepkch: APPLIED 23 Sep 2026 (Waqas: "lets get it done"); verified table null,
  function 0, consume_tokens 1, set_updated_at 1, 29 public tables, 7 licence rows intact.
- Still open from the 17 Sep sweep: ROTATE notify_hook_secret (Waqas; involves the value).
- SEO (audit 23 Sep, 74/100): all code-side items shipped 6d34360 and verified live; sitemap
  resubmitted to Google (16 pages) and Bing; indexing requested for the five changed pages; Rich
  Results Test clean on / and /functional-hazard-assessment. Off-code levers left: inbound links,
  a monthly content piece, per-page social images. Re-read Search Console ~21 Oct.

## 17 Sep 2026 — S28: every email the product sends had been dead since 14 Sep. FIXED AND LIVE.

FOUND by a deliberate sweep for controls that have never executed (the pattern behind the last
ten defects), not by a report. notification_log has rows every day 5–14 Sep then nothing; the
daily expiry cron reported SUCCEEDED on all fourteen runs including 17 Sep; every row in
net._http_response was 401. Sign-in, signup, review and licence-expiry mail: all of it.

CAUSE: the 14 Sep hardening (S10) doing exactly what it says. The notify-* functions began
requiring an exact match against SUPABASE_SERVICE_ROLE_KEY, but the callers were five Dashboard
webhooks whose headers are a STRING LITERAL inside the trigger definition, holding a legacy
service-role JWT that no longer matched. Silent because net.http_post() queues and returns at
once, so the cron never sees the reply.

THIRD GATE, found only by testing against production: the platform's own verify_jwt was on, so
Supabase's gateway refused a non-JWT bearer before our code ran. That is WHY the credential had
to be the service-role key in the first place. Now off for the four machine-called functions
(supabase/config.toml, in the repo so a deploy cannot silently restore the default); it protected
nothing, since the anon key is a valid JWT and ships in every browser bundle.

FIX: purpose-built secret in Vault, read at send time; sender cannot raise (auth.users is written
on every sign-in); every send recorded with its function name; hourly sweep fills in the reply.
Migration 20260917a APPLIED TO PRODUCTION. Proven end to end 17 Sep 20:05 UTC —
notification_log shows status=sent with a Resend id, the first row since 14 Sep 01:59.

## 17 Sep 2026 — S29: anon and authenticated could TRUNCATE every customer table. FIXED AND LIVE.

RLS is enabled on all 29 public tables, which is exactly why this looked fine. Postgres RLS DOES
NOT APPLY TO TRUNCATE: a policy can forbid deleting one row and say nothing about emptying the
table. anon and authenticated held TRUNCATE on 19 of them, including projects, project_documents,
project_document_versions, project_crdt, yjs_documents, workspaces, workspace_members, users and
license_tokens.

The 16 Sep lockdown (20260916c) revoked exactly this on five LEDGER tables, because the 5 Sep
audit had named those five. The tables holding the actual work were never in scope. A fix aimed at
the examples in a report rather than at the class of problem leaves the rest of the class.

HONEST SEVERITY: not reachable through the public API. PostgREST has no verb that issues a
TRUNCATE; neither role has CREATE on the schema, so neither can define a function to do it; and
the one SECURITY DEFINER function authenticated can reach that runs dynamic SQL
(private.erase_my_account) binds its user value as a parameter and is not injectable -- checked.
So what stood between a published anon key and an empty projects table was that PostgREST happens
not to offer the verb. Nobody chose that control, wrote it down, or could test it.

FIXED: migration 20260917b sweeps pg_class rather than listing tables, and ALSO changes the
default privileges -- Supabase grants ALL on new tables in public to anon and authenticated, so a
revoke alone lasts until the next CREATE TABLE. Proven on the throwaway behaviourally as the real
authenticated role: insert works, select works, TRUNCATE refused, rows intact; and a brand new
table comes out without the privilege. APPLIED TO PRODUCTION, verified 0 tables truncatable by
either role with select/insert/update/delete untouched. Bundled as customer-install 11_ and wired
into apply.sh. regression_truncate_grants (13), mutation-tested.

## 14 Sep 2026 (evening) — SECOND RECONCILIATION, verified live + across all three repos

- **S5 is DEPLOYED and LIVE.** The register said "deploys via ship.sh" and the last note said not yet shipped. Checked the served file: `lock_seal.js?v=1.0` on safetylabaero.com/app carries the minified `_g` that reads `SLEnv` first. Sealed baselines hash real content in production now. Nothing left on S5.
- **NO REPO HAS A GIT REMOTE.** S27 was filed as a desktop-only problem. It is not: `safety-lab-deploy`, `safety-lab-desktop` and `safety-lab-proxy-deploy` all report an empty `git remote -v`. The entire product — web app, desktop shell, AI proxy, the customer install kit, every migration — exists on exactly one Mac, in three working copies, with no off-machine copy of the history. A disk failure loses the company. This is the cheapest item on this register and the most expensive one to skip: one private remote per repo and three pushes.
- **safety-lab-proxy-deploy has an uncommitted `wrangler.jsonc`.** Check and commit or revert.
- **customer-install carries two untracked files** (SL-DG-0001 Deployment and Setup Guide v2.0 .docx/.pdf, written 14 Sep) — commit them with the guide work.
- **SL-DG-0001 is now Rev 2.0** (Deployment and Setup Guide): adds the desktop application, the two AI-key paths, a data-residency table for the three ways to run it, and team setup; reformatted to the white-paper family spec. Status Draft. HOLD before it reaches Radia: (a) R7, the live AI round-trip, has still never been run; (b) it tells Windows users to run an installer that has not been built. Both are listed below.
- **CODE FINDING behind the guide's section 15 (per-user AI keys):** on a customer's own server, and in the desktop app, a personal Anthropic key pasted into Advanced settings CANNOT work by design — the desktop egress allowlist only admits the configured backend and AI endpoint, and an unconfigured AI refuses before the send. Bring-your-own-key is a trial-cloud path only. This is correct behaviour and is now documented, but it means the customer-deployed proxy is the ONLY AI path for a real install, which raises the stakes on R7.

## H-9 — CLOSED 31 Aug 2026: invitation email is delivered, end to end

Proven live, not asserted. First real invitation reached an external Gmail inbox:
Resend id 4f4ce081 to etchetoghetto@gmail.com, status **Delivered** on the Resend
dashboard, `notification_log` row kind='invite' status='sent'. A second copy to
waqas.nafees@safetylabaero.com delivered at the same moment. NOTIFY_FROM_EMAIL is
therefore a verified sender, and the onboarding@resend.dev trap the notify-signup
header warns about does NOT apply here.

Getting there took two edge-function defects that only running it could surface —
both now recorded in the notify-invite header:
  [v1] NO CORS. The browser preflights cross-origin; v1 answered OPTIONS with 405
       and set no Access-Control-Allow-Origin, so the request died in the browser
       before reaching any code. supabase-js calls that "Failed to send a request
       to the Edge Function", which reads like a missing function — it sent us
       auditing RLS and grants that were correct throughout. Worst property: the
       notification_log write is INSIDE the function, so a preflight failure
       leaves no trace anywhere at all.
  [v2] SUPABASE_ANON_KEY IS NOT INJECTED in this project. The caller-scoped client
       was built with an empty key, getUser() failed, and the function returned its
       own 401 — indistinguishable from the gateway rejecting the JWT. v3 validates
       the token with the service-role client (auth.getUser(jwt)) and checks
       membership explicitly; the anon key was never needed.

## H-10 — CLOSED 31 Aug 2026: edge function sources are in git, CORS is covered

All SEVEN deployed functions exported byte-for-byte from the live deployment into
`supabase/functions/<slug>/index.ts` with a provenance README (the deployed function
stays authoritative until someone redeploys from that directory).
`regression_edge_function_cors` (27 checks, 5 mutations red) DERIVES the browser-invoked
set from `site/` on every run — `functions.invoke('x')` and `functions/v1/x` — so a new
client-called function is covered the day it is added rather than the day someone
remembers to edit the suite. The sharpest check is ORDER: v1 did have a method guard, and
an OPTIONS branch placed below it is dead code with the headers still in the file looking
correct; mutation M3 is exactly that shape and goes red.
Census: only notify-feedback and notify-invite are browser-called, and they are precisely
the two that carry CORS. The other five are webhook/cron driven. Consistent, not accidental.

### Superseded original entry

notify-invite (and the notify-* family before it) exist only as deployed functions
in Supabase; supabase/functions/ holds no source. For a product that sells
auditability and deterministic regeneration, the code that emails customers should
be in the repo and diffable. There is also no regression coverage for the CORS
preflight, which is the defect that cost the most time tonight and would silently
return the moment someone redeploys from a fresh copy. Task: export the deployed
sources to supabase/functions/<slug>/index.ts, commit, and add a check that every
browser-invoked function answers OPTIONS and sets the CORS headers.

- **A2 + A4** — **SHIPPED 19 Aug 2026 (66.36).** `genFTAEvents` files each NODE by
  `SLNodeIdentity.resolveOwner` instead of inheriting the page's bucket, and a row whose owner has
  moved is **migrated in place** — the row changes store AND its `reqSource.sourceId` prefix in one
  operation, keeping `internalId`, verification status, verification evidence and manual edits.
  The fail-safe from 66.27 is preserved: a `systemId` that resolves to no system falls back to the
  page's bucket, never to nothing. `fta-interval` migrates with its `fta-event`.
  **Posture, ruled by Waqas: previewed and confirmed, never silent** — `planBucketMigration()` is
  pure, `applyBucketMigration()` runs only from an explicit click on its own control (deliberately
  NOT part of "Accept all"), and the decision is recorded in `reqSource.rebucketed[]` as an
  attributed sentence in the active voice. `generate()` no longer double-reports a pending move as
  a new row plus an orphan.
  **VERIFIED LIVE on the deployed build, 19 Aug.** A2 is a no-op on Aeolus HL-1 as it stands —
  182 nodes, 0 with `node.identity`, 0 existing auto-reqs, and the 7 transfer gates it does have
  carry no children, so every requirement-bearing node still resolves through the page fallback.
  `generate()` returns exactly the pre-deploy counts (ac 5 · FCS 5 · PRP 12 · EPS 6, 0 orphaned,
  0 migrations). Rows begin to move only as the drawer is used. Max movers today: 5.
  Exercised end-to-end in the page against a temporary in-memory fixture: declaring a leaf to
  another system produced ONE pending move (not a new row plus an orphan), and applying it moved
  the row, rewrote the prefix, and preserved `internalId`, verification status, evidence and the
  manual-edit flag. Fixture restored in the same script; nothing saved.
  *Still to build on top: A3 (consumer-side L2 interface requirements) — a declared resource already
  buckets to its provider, but the consumer rows are not generated.*
- **A1** — **SHIPPED AND VERIFIED LIVE 19 Aug 2026 (66.38).** `unownedPages()` now reaches a person: **INV-49**
  (`sev: 'hard'`) in the cross-artifact invariants registry, so it renders in the integrity panel and
  is stamped into the evidence package. No new UI, no new data model. Each failure names the page,
  the reason it did not resolve, and that its requirements are filing into the aircraft bucket.
  Hard rather than advisory because the *handling* is deliberately forgiving — an unresolved page
  still generates requirements — so detection must be loud. **Deliberately does NOT flag undeclared
  NODES**: every node on every existing project is undeclared today (0 of 182 on Aeolus), so that
  would open with ~51 failures on a healthy project and train everyone to ignore the panel. An
  undeclared node is a migration state; a dangling `systemId` is a defect. U-4 is now closed.
  **Verified live:** 18 checked / 0 fails on Aeolus; with a dangling `systemId` injected in memory the
  panel renders a visible FAIL row naming the page and the bucket, then restores clean.
- **A0** — scope-filtered generators (66.27). Aircraft scope no longer emits an L3 for every event
  on every tree; system scopes no longer re-emit the same events. `unownedPages()` exported.

- **A3** — ~~One L3 in the provider's bucket at the strictest value; consumers get L2 interface
  requirements~~ — **LANDED 22 Aug 2026** (assurance 1.24, copy fix 1.25). `genFTAEvents` now
  collapses declared resources (identity.kind 'resource' with a resolving provider): ONE
  `fta-resource` L3 in the provider's bucket at the strictest allocated value across every
  consumer, rationale naming each consuming tree's allocation and the governing one; each
  resolving consumer system gets an `fta-resource-iface` L2 (Interface class, §5.3.1.8) pinning
  ITS OWN strictest assumption and cross-tracing the provider row. FAIL-SAFE kept: a resource
  whose provider does not resolve stays on the legacy per-node path — requirements never
  silently stop generating. Orphan sweep covers both new generator keys. Zero churn on real
  data (K350: 0 resource nodes — rows appear as identity gets declared). **Verified live:**
  read-only preview injection on the K350 (identity declared in memory, nothing saved) produced
  the provider row in the hyd bucket, the consumer contract in fcs, and the per-node row's
  replacement; restored clean. Live check also caught the verb-phrase copy flaw → 1.25
  ("probability THAT x fails" / "shall assume that … occurs"). Suite:
  `regression_resource_split` (24 checks, 4 mutations proven red). *Observed during the
  live check, unrelated: `ac:fha:prob:1003` shows pre-existing fingerprint drift vs the stored
  register — A8's watchers and the AutoReq updated-flag cover it on next regen.*
- **A5** — ~~DAL strictest across trees~~ — **LANDED 22 Aug 2026** (support 66.23 · misc 66.37 ·
  assurance 1.23). Two defects fell together. (1) The reactive DAL sweep cleared EVERY page and
  allocated only the ACTIVE family — measured live on the K350 before the fix: 34 pages, DALs on
  ONE (not even the active page's family). `propagateDalFromTrueRoot` is now a thin wrapper over
  `propagateDalAllRoots()`: every seeded root family allocates in one pass (5 families / 6 pages
  light up on the K350), legacy `ftaConfig.linkedFhaId` still seeds the active family only,
  no-seed-anywhere still leaves existing DALs untouched. (2) `genDALgebra`'s dedupe was
  first-seen-wins per logicalId — the register's DAL was an accident of page walk order. Now ONE
  row per shared event at the **max of the resulting DALs**; the governing tree's derivation is
  the rationale, disagreeing trees are NAMED ("reduction arguments are not merged across
  derivations — each tree's argument stands alone"), and `context.disagree` + fingerprint tokens
  appear ONLY on disagreement, so agreeing projects churn nothing (sourceId keeps the governing
  page; tie → first-walked). Suite: `regression_dal_strictest` (14 checks; 6 mutations across
  A5+A6 proven red). Durability's seed-resolution guard followed the logic into
  `propagateDalAllRoots` with a supersession note.
- **A6** — ~~Independence propagation~~ — **LANDED 22 Aug 2026** (same build). FAILURES ARE
  GLOBAL, CLAIMS ARE LOCAL. `_cmaCompromisedIndex()` (support) turns every open, signal-carrying
  CMA's linked gates into failed member PAIRS keyed by logicalId — returns `{ids, pairs}`;
  legacy bare-Set callers still work. `allocateDAL`: a gate whose children include a failed pair
  is compromised wherever the CMA was recorded — members revert to top DAL,
  `_dalCompromiseReason` names the CMA + recording gate + page and says the failure is global,
  `_probCompromised` demands the β term; a locally 'substantiated' claim does NOT survive;
  sharing only ONE member of the pair compromises nothing; Mitigated/Closed CMAs compromise
  nothing (closure restores); `suggested` rows drive nothing. `checkCMACompromise` (assurance)
  raises the matching `cma-global` AutoReq finding with a self-skip for the linked gate.
  **Verified live on the K350:** index builds `{ids:[5099], pairs:['5097|5098']}` from CMA-002;
  a detached AND gate carrying that pair (even claimed 'substantiated') comes out compromised
  with the global reason naming G-5099; a control sharing one member keeps its reduction.
  Suite: `regression_indep_global` (19 checks).
- **A11** — ~~Multi-FHA-linked pages never receive DAL seeds~~ — **LANDED 22 Aug 2026**
  (misc 66.38; unparked same day for the pre-NAV cleanup). The seed expression reads
  `linkedFhaIds[0]` first-class now (`|| linkedFhaId` fallback) — a page linked only the newer
  way seeds, the ARRAY governs when both fields exist, the legacy scalar still works alone.
  Three checks in `regression_dal_strictest` (now 17), the legacy-gate mutation proven red.
  PASA · FC-09's family lights on the K350 after deploy.
- **A7** — ~~Common resource ≠ common cause guard~~ — **LANDED 22 Aug 2026** (ccf_similarity
  1.3 · assurance 1.26; ruled: suppress + note). It was manufacturing a finding on the live
  K350: `ccfPairs()` demanded a signed disposition for `macsys:sys-prl` vs `sys-prr` — two
  MAC-COMPILED events whose coupling the model itself states. Now: the similarity detector
  SKIPS structural-vs-structural pairs (macsys:/macres: lids, MAC/lane provenance, resource
  identity — `_ccfIsStructural` exported); authored twins AND authored-vs-compiled mixes still
  flag. `checkANDCompromise`: a shared DECLARED-resource lid becomes an informational
  `shared-resource-structural` note ("modeled exactly … not a common-cause finding … the CRA
  and CMA lanes own this resource") that never compromises the independence requirement;
  undeclared shared lids keep the warning verbatim, declared CCF groups still surface. Suite:
  `regression_resource_not_ccf` (13 checks, 4 mutations proven red — including one against
  OVER-suppression of mixed pairs).
- **A8** — ~~Stale-flagging, built once~~ — **LANDED 21 Aug 2026** (`stale_watch.js` v1.0,
  SLStaleWatch). One mechanism, SIX watchers, each with its own honest consistency predicate:
  [ss] issued requirement quotes a budget the allocation has since TIGHTENED (reqSource.context
  vs the node's current value) · [asm] assumption text quotes a number looser than its FC's
  objective (heuristic quote-parse, and the flag says so) · [alpha] verification-side achieved
  P(top) moved in the HARDER direction since its baseline (first sight = baseline, never a
  flag; ack re-baselines) · [coffe] a grafted branch whose source verdict was re-classified or
  cleared · [mac] compiled MF&MS / lane trees stale against their rule, surfaced centrally ·
  [fmes] R2's FMES-adopt drift — `_fmesGroup` events whose adopted λ no longer equals the
  group's current Σλ. THE DIRECTION RULE (A9's) enforced everywhere: EASIER never flags.
  Acks are signed and value-pinned (projectConfig.staleFlags) — quiet only for the acknowledged
  value, returning the moment it moves again; never deleted. Predicates are stateless
  (recomputed per sweep) except [alpha]'s baseline (projectConfig.staleBaselines). Register
  rendered under the dashboard leading indicators (wraps updateDashboard, preserve-discipline,
  zero monolith edits). Suite: `regression_stale_watch` (22 checks, all six predicates
  behavioural; four mutations red). R2 closes with it.
- **A9** — ~~Margin as a third budget state~~ — **LANDED 21 Aug 2026** (fta_quant 66.14 ·
  budget_ledger 1.3 · ux_leading 1.2 · bindings 1.19). THE SILENT ABSORB STOPPED: constrained
  children take caps verbatim, free siblings keep their NATURAL apportionment, the gate records
  `_budgetMargin` (over-committed RED / exact / under-allocated AMBER / signed reserve /
  absorbed-by-decision) — VOTING gates included (live-found: every constrained gate on the K350
  is a MAC k-of-N; exact P(≥k) by DP, 1% band for the rare-event-inverse noise). The absorb is an
  OFFERED rebalance: `SLBudgetDecisions` records absorb / reserve / dismissed, attributed with a
  sentence, "did nothing" logged, revert keeps the record. The ledger surfaces the tri-state per
  row with the offer flow (candidates + impact preview keyed on issued-and-EVIDENCED requirements
  via reqSource/verifStatus); over-committed offers NO fake fix — it logs the review. RED fails
  the new PASA completion item (B.4.1 budget feasibility) and lands a dashboard leading
  indicator; advisory posture — nothing locks. Both suites locking the old behaviour updated
  deliberately with the supersession documented (incl. the 19 Aug quote the loosen was built
  from). Suite: `regression_budget_margin` (35 checks, real allocator + real register + VM
  render; six mutations red).
  Direction rule, kept: **a budget that got EASIER needs no action; a budget that got HARDER does.**
- **A10** — ~~Interdependence at FUNCTION granularity~~ — **LANDED 21 Aug 2026 (with B6).**
  Q.4-1 columns are now system functions (`fc§fn:<funcId>` cells, two-row grouped header); legacy
  system-keyed cells stay readable in a coarse ▣ sys column and are refined by a signed click, never
  auto-expanded. Derivations land on a function only where the data names it (trace on the function ·
  `providedByFunctions` · SFHA function key); system-only facts stay visibly coarse. `idpCell(fc,
  systemId)` keeps its aggregate meaning for every old caller; `idpContributorFns()` is the Q.4-1
  answer. AI sweep proposes on function columns only. Suites: `regression_idp_functions` (35,
  behavioural), `regression_interdep_sweep` (20, end-to-end incl. signed legacy refinement).
  **L1 closed with it (21 Aug):** SFHA rows key to their SYSTEM function — explicit `sysFuncId` on
  every form save (the form has offered functions since the pairing guard), signed re-key control on
  seed-era rows with the FCIM join as the suggestion, provenance on the row, `acTrace` untouched;
  the golden-thread SYSTEM lane names the function where the thread knows it
  (`regression_sfha_rekey`, 27 checks).
- **A11** — ~~System dropdown limited to that FC's interdependence contributors~~ — **LANDED** in
  C1: ordered contributors-already-used-first, with "+ another system…" as a permanent last list
  entry (a short list with a hidden escape is a funnel). A page with no linked FC, and a linked FC
  with no recorded contributors, both say so rather than silently listing all 20.

- **C1** — **Structured node creation. SHIPPED 19 Aug 2026 and verified on the deployed build.**
  `node.identity = { kind, systemId, functionId, fcId, itemId, effectId, modeIds, resourceId,
  providerSystemId, textOverride, declaredBy, declaredAt }`. Kinds: functional · item ·
  resource · human · external · devError (never quantified) · undeveloped. ONE `html(node)` builder,
  TWO mounts — the creation dialog (`#ni-modal-body`) and the properties drawer
  (`#config-identity-host`), which is also the migration surface for legacy free-text nodes. Gates
  are offered **Functional only** ("logic only, inherits from above") — a gate is how failures
  combine, never a thing that fails. Rules live in `node_identity.js` (`resolveOwner`,
  `crossesBoundary`, `sweepTree`); the editor never reimplements them. A **resource node carries two
  owners** (provider + consumer) and they are never collapsed. Boundary rule is asymmetric: an owner
  appearing where the parent had none **is** a crossing.
  Name field and display override removed per Waqas — *"the name would be the failure condition
  itself."*
  **Still to consume:** nothing downstream reads `node.identity` yet. That is A2.

- **C2** — ~~Allocation leaf = item + effect; verification mirror decomposed into modes~~ —
  **LANDED 22 Aug 2026** (`mirror_modes.js` v1.0 · helpers 2.48 · stale_watch 1.1; three postures
  ruled by Waqas: OR gate + mode children · controls on the FMES page AND the node panel ·
  coordinate LOCKSTEP, twin wins). `SLMirrorModes`: `decompose()` turns an adopted mirror leaf
  into an OR gate with one basic event per contributing FMEA row at λ = the row's rate
  (α = its share of Σλ; α shown in the node panel), each child inheriting the twin coordinate
  plus its OWN modeIds — the one mirror-side identity field; `recompose()` folds back at the
  group's CURRENT Σλ (last-known + warning when the group is gone);
  `syncMirrorIdentity()` lockstep runs on node select, on every ownership sync, and at the
  moment of decomposition (mutation-caught: children must stamp the twin's CURRENT coordinate).
  NOT auto-FMEA: modes come only from the authored FMEA piece-part rows fmesGroups() already
  rolls up. C3 enforced: decompose REFUSES allocation pages even when fully adopted
  (mutation-proven after the first fixture masked a dead guard); the DAL sweep and AutoReq
  already skip verification pages — wiring-checked. CLONE FIX: `_cloneSubtreeForVerification`
  deep-copies identity — the twins were sharing ONE identity object by reference, so a
  verification-side modeIds edit would have contaminated the allocation twin and tripped its
  closure block. R2's [fmes] watcher learned the decomposed shape: Σ(mode children λ) vs the
  group's current Σλ, with GONE and re-decompose messages. Suite: `regression_mirror_modes`
  (31 checks, 5 mutations proven red). Durability tag count 208→209; stale_watch pin regex
  became a floor (rule 12).
- **C3** — **No mode-level targets, ever** (ruled). Mode contribution and sensitivity stay
  verification-side analysis that informs design; never allocated, never a requirement.

- **E1 parts 1 + 2 — LANDED 26 Aug 2026** (data_ops 66.16 · helpers 2.51 · bindings 1.25).
  Waqas first deferred this to after the Radia demo, then reversed and ruled it built the same
  night. **The guard is deliberately narrow: during boot recovery only, an empty snapshot never
  overwrites a stored one that has content.** Content-bearing writes are untouched on every path
  at all times; outside the recovery window behaviour is byte-for-byte what shipped, so
  `createNewProject` and any other deliberate blanking still persist exactly as before.
  · `_autosaveRecoveryPending` / `_autosaveRecoveryTimer` / `_autosaveStoredHasContent` declared in
  bindings; `_recoveryHoldBegin` / `_recoveryHoldEnd` bracket `checkAutosaveRecovery`, releasing on
  BOTH promise outcomes plus a 12s backstop.
  · **Kept separate from `_autosaveSuspended` on purpose, after trying the blunter version first:**
  `_applyProjectData` sets and clears that flag in its own try/finally and schedules the
  migration-recording write from it, so reusing it re-opens the window early AND swallows that
  legitimate write when `SLIdle` is absent. A guard that only ever refuses ONE write also cannot
  strand autosave the way a general suspend can.
  · Emptiness is judged from the snapshot OBJECT with the same `_autosaveHasContent` the restore
  path uses — not by re-parsing the payload, which on a 4.5 MB project would cost more than the
  write it guards. The verdict is cached (`_autosaveStoredHasContent`), seeded by recovery, updated
  by every write, cleared by `discardAutosave`, and lazily read once if still unknown.
  · Suite: `regression_autosave_e1` — 33 checks, all EXECUTED against the real `_writeAutosave` and
  the real `_autosaveHasContent` over a fake storage layer, never pinned as source text (six hours
  earlier a source-shape pin let a dead feature pass the whole wall). **13 mutations proven red,
  including M1 = the exact pre-fix code.** Wall 187 suites, 0 failing.

- **E1 part 3 — LANDED 26 Aug 2026, same night** (data_ops 66.17 · helpers 2.52 · bindings 1.26),
  after Waqas ruled "everything gets done tonight". I had argued against it on cost grounds; the
  objection was to mirroring EVERY save, and **throttling answers it** — so the objection is
  withdrawn, not overruled.
  · `LASTGOOD_KEY` / `LASTGOOD_META_KEY`, written at most once every `LASTGOOD_MIN_INTERVAL_MS`
  (120 s) and ONLY from a snapshot that has content. The already-serialised payload is reused —
  the expensive part of an autosave is the stringify, and it has happened by then. Cost at steady
  state is one extra `setItem` per two minutes, not per save.
  · Covers the case parts 1+2 do not: **content→content shrink**, where a project loses most of its
  rows and saves over itself. That result passes `_autosaveHasContent`, so the refusal never fires.
  · Recovery **offers, never restores silently**: an empty primary plus a good last-good raises the
  recovery banner — built and unreachable since silent recovery landed — naming the snapshot's age.
  Silent restore was considered and rejected: an empty current slot is also what a genuinely NEW
  project looks like, so quietly resurrecting the old one would replace the user's new work with
  old work, which is this item's own bug wearing a hat.
  · "Dismiss" closes the banner and **keeps the snapshot**. A backup is not deleted by a click that
  means "not now". (Consequence, accepted: after `discardAutosave` the offer can appear on the next
  load. Non-destructive and dismissible, so it stays.)
  · The mirror can never break the save it backs up — content-gated, self-swallowing, and wrapped
  at the call site.
  · Suite grew to **53 checks, 11 further mutations proven red.** Two survived the first pass and
  both were real gaps in MY checks, not in the code: the throttle assertion compared timestamps
  that collide inside one millisecond (now asserts on mirrored CONTENT), and an `onRejected` arm
  that was **dead code** — the upstream `.catch` already converts a rejection to a value. The dead
  arm was deleted and replaced by a behavioural check that a rejected IndexedDB read still closes
  the recovery window. A third fell out of the same pass: one of my part-1 checks was itself a
  source-shape pin, and it broke on a refactor while the behaviour stayed correct — replaced with
  an executed check. Wall 187 suites, 0 failing.

- **E1 — still open: WHY recovery failed to fire on 26 Aug.** Unanswerable post-hoc (both copies
  were blank by the time it was investigated). The leading candidate is the race the hold now
  closes. If a blank-on-refresh is ever seen again, the `[E1] refused to overwrite…` console line
  is the marker that the guard caught it, and the stored project will still be there.

- **E1 — AUTOSAVE OVERWRITES GOOD LOCAL COPIES WITH AN EMPTY PROJECT.** Data-loss defect,
  reproduced live 26 Aug 2026 (22:16 UTC) on the deployed build. A page reload came back to a
  blank project; within seconds BOTH local copies had been overwritten with the blank state and
  the work was recoverable only from the cloud.

  **Measured, not inferred.** localStorage `safetyLab.autosave.v1` — 4,823 B, all row counts 0,
  meta ts 1787782620560. IndexedDB `safetyLab.autosave.v1` — 5,056 B, blank, meta ts
  1787782702724 (i.e. IDB was overwritten LATER than the mirror, so it was not lagging behind
  with good data). Session immediately before the reload: 19 functions · 32 FCIM rows ·
  114 extracted conditions · 38 FHA rows · 11 fault trees · 18 ZSA rows · 1 source doc.

  **The asymmetry, which is the whole bug.** `_autosaveHasContent(parsed)`
  (helpers_modules.js:10327) is the predicate for "is this snapshot worth anything" —
  any FHA row, any requirement, any fault tree with a root, or any system. `checkAutosaveRecovery`
  (data_ops_modules.js:764, 776) consults it on the way OUT and correctly declines to restore an
  empty snapshot — verified live against the current blank state, returns `false`.
  `_writeAutosave` (helpers_modules.js:10593) consults it on the way IN **never**: its only guard
  is `if (_autosaveSuspended) return;`. So the app knows how to recognise an empty snapshot, and
  uses that knowledge only to refuse READING one — never to refuse WRITING one over a good one.

  **Why recovery did not fire is a separate, still-open question** and cannot now be answered
  post-hoc (both copies are blank). The leading candidate is a race: the IndexedDB recovery path
  is `.then()`-async and `_autosaveSuspended` is not held across it, so a blank-state autosave can
  land before the restore resolves. `_autosaveSuspended` is set for project load and sample load
  (data_ops_modules.js:833/909, helpers_modules.js:7895/7919) — not for recovery.

  **Proposed fix, three parts, smallest first:**
  1. Hold `_autosaveSuspended` until `checkAutosaveRecovery()` has fully resolved, IndexedDB
     fallback included. Closes the specific race that produced this.
  2. In `_writeAutosave`, refuse the overwrite: if the new snapshot fails `_autosaveHasContent`
     and the stored one passes it, write to a `safetyLab.autosave.lastgood.v1` slot instead.
  3. Stop treating a single overwritable slot as a backup — keep the last good snapshot beside
     the current one, and surface it in the existing recovery banner (`_showRecoveryBanner`,
     already built, currently unreachable on the silent-recovery path).

  **Not a customer-visible regression from any recent batch** — the asymmetry is long-standing.
  It is filed here because a refresh at the wrong moment silently destroys both local copies, and
  the recovery feature is the thing that destroys them.

---

- **F25 — THE TEMPERATURE LEVER IS INERT ON THE SHIPPED MODEL (found 5 Sep 2026, night; half-fixed
  the same night; a DECISION is open).** Lever 1 on 5 Sep set every analytical drafter to
  temperature 0. `AiClient` omits temperature entirely for Opus 4.7+ because those models reject
  it with a 400 (`core_modules.js` `_modelAcceptsTemperature`), and `MODELS.reason` defaults to
  `claude-opus-4-8`. **So the setting never reached the model.** Confirmed independently by the
  exported draws, which record `requestModel: claude-opus-4-8`. DONE: the omission is no longer
  silent — every call records `temperatureAsked` / `temperatureApplied` in the AI audit log, and
  the two comments asserting the old premise are corrected (core_modules 1.3, ai_assistant 76.60,
  shipped and verified served). **OPEN, for Waqas:** making the lever real means changing the
  drafting model to one that accepts the parameter (Sonnet, or Opus <= 4.6), which is eval-gated
  against the reigning golden — a decision about drafting quality, not a tweak.
  WHAT THIS DOES **NOT** INVALIDATE: e1/e2/e3 remain a sound baseline. They measured three
  identical-input draws under the provider's default sampling, which is exactly the configuration
  still shipping, so F22/F23 improvements are measurable against them. What changed is only the
  LABEL — they are not "temperature 0" runs, and the README filed with them says so.

- **F26 — THE FHA PROMPT CONTRADICTED ITSELF; CLOSED 5 Sep 2026 (ai_assistant 76.60, served).**
  `_ABSTAIN_RULE` ("any field you cannot ground must be returned as an EMPTY STRING ... leaving a
  field empty is a GOOD outcome") and the shipped `fha.draft` body ("WHEN THE INFORMATION IS THIN,
  JUDGE - DO NOT ABSTAIN ... an empty level silently drops the row from every downstream check")
  rode in the SAME assembled request, and no code decided which won — the same defect class as the
  five arguing row-instructions found on 5 Sep morning. Waqas: "the abstain instruction needs to
  be removed, we have judgement call flags now." Scoped by him, after the evidence was put to him,
  to **fha.draft and sfha.draft only** — the only 2 of 25 registered skills carrying the
  judgementCall/judgementNote contract; the other 23 keep `_ABSTAIN_RULE`, because stripping it
  there trades a visible blank for a silent guess. Five sites changed (`_fhaSystemPrompt`, rules
  2b and 2c, `_FEATURE_DIRECTIVE.fha`, and the batch's per-lane gate). Guarded by
  `tests/regression_fha_no_abstain_and_temp.test.js`, 27 checks, mutation-proven seven ways.
  **Note for the next measurement:** every draw before 5 Sep was taken under the contradiction, so
  an abstention rate from those runs measures a coin flip between two instructions rather than the
  model's judgement. E2's abstention findings should be read with that in mind.

- **F27 — THE WALL COULD MIS-REPORT ITS OWN FAILURES; CLOSED 5 Sep 2026.** `ship.sh` anchors on
  `^  FAIL  ` (two spaces each side) because the bare word FAIL appears inside check NAMES. 28
  suites emitted `'  FAIL '` with one trailing space and were invisible to that grep. Measured
  before fixing (rule 9): a forced failure still exited non-zero, so the crash detector caught it
  and the wall DID go red — the defect was MIS-REPORTING (a real assertion failure announced as
  "suite did not run to completion"), not silence. The cleanup inventory said 2 suites; it was 28.
  All canonicalised; `tests/regression_wall_hygiene.test.js` (12 checks, mutation-proven four
  ways) now polices the format, that every suite can fail the process, and that `ship.sh` still
  anchors at BOTH call sites. `ship.sh` also widened to `tests/*.test.js eval/*.test.js`, so
  `eval/regression_ai_repeatability` — the scorer's own mutation proofs — runs on a deploy for the
  first time (Waqas: "widen it").

- **F16 — FIXED a–d 4 Sep 2026 (evening batch: interdep_ai 1.2, misc 66.55, lane_trees 1.3,
  ai_assistant 76.54, ai_skills 2.11 / mac.draft v2, loader 8.46); e and f remain.** (a) the
  sweep's reply was cut off at maxTokens 1200 with 27 candidates per condition and the parse
  failed silently — budget now sized to the candidate count, cut-off replies salvaged and
  REPORTED as failures; (b) `_coffeTokSys` resolves configuration items to their owner system
  and `idpFindings` treats a contributor as covered when a member belongs to its system; (c)
  `add_mac` accepts `arbitration` from the document only, never guessed, malformed dropped and
  reported; (d) a batch whose replies were unreadable, or valid with no actions and no words,
  now says so — the harness records the reason. Original entry follows.
  RUN 2 FINDINGS (4 Sep 2026, evening; the full thread's first pass).** (a) The
  interdependence sweep made 25 calls and landed 0 proposals — undiagnosed; inspect the raw reply
  and the colId echo in `interdep_ai.js` before run 3. (b) `lane_trees` `idpFindings`/coverage do
  not treat a configuration item that is a MAC member as covering its owner system's functions —
  `idp-uncovered` on every one of the 33 pages. (c) The MAC drafter proposes no `arbitration`
  scheme — `lane-mal` "No arbitration scheme declared" everywhere. (d) FMEA declined with no
  reason (goes with F13). (e) CoFFE residue was 1,389 cases; the lane needs a cap or a smarter
  residue before it runs unattended. (f) The run 2 export is in Downloads, not yet under
  `eval/runs/goldens/`; 8 sub-functions have no MAC rule. Fix a–d in one pass, then run 3.

- **F15 — BUILT AND RUN 4 Sep 2026 (arch.systems, arch.items, mac.draft, coffe.draft; THREAD
  compiles trees). Kept for the design record; what it found is F16.** Original entry: THE FULL
  THREAD BEFORE RUN 2 (Waqas, 4 Sep: "wait for the full MAC/CoFFE"; "the thread
  should run CoFFE interdependence and MAC").** Trees must be COMPILED from interdependence + MAC +
  CoFFE (+ CRA) — `SLLaneTrees.compileAll()` — not drawn by the AI synthesiser, so tree logic is
  identical run to run. Build order: (1) systems + system functions from the SDD through the
  harness (`add_system`, `decompose` needs a system-scope handle under capture — today the picker
  auto-selects Aircraft); (2) interdependence sweep (`idpAiSweep`) as a thread step; the harness
  asserts the model's proposals so downstream can run (testing only — a proposal is never a review
  in production); (3) MAC drafter — NEW lane: per aircraft sub-function and phase, clauses of system
  functions with min-of, from the SDD's redundancy statements; lands as `macModels` entries with
  `substantiation.kind='assumption'` carrying the SDD citation, engineer flips to 'sdd'; eval-gated
  (changes what the trees measure); (4) CoFFE residue proposer — NEW lane: yes/no + result text for
  the cases the MAC cannot compute (malfunction cases, unmodelled systems); lands as verdicts by the
  model; (5) thread step 'trees' becomes compileAll(); FMEA then runs (systems exist). Score trees
  two ways: shape identical (yes/no per condition) and node names same-meaning (judge).

- **F10 — SHIPPED 3 Sep 2026 (ai_assistant 76.39), listed so the campaign machinery's state is on the register too.** A refusal is a result:
  `_captureBail` + `_captureGuard` on the 17 public lane entry points, plus a guard on
  `_fmeaSystemPicker` (the sixth picker — the 76.38 sweep matched `_open*Picker` and missed it).
  99 toast-and-return guard clauses resolved no capture, so a lane refusing early hung a campaign
  for its full timeout: three FMEA runs burned 901 s each to report "no panel opened" when the lane
  had already refused, correctly and in milliseconds — `ppfmea` is not in that project's programme
  scope, so the opt-in gate turned it away before any model call. `regression_capture_bail`, 30 checks,
  14 executed. Inert when no capture is armed.


---

- **H-1 — BUILT 31 Aug 2026, SURVEY-ONLY UNTIL ARMED** (`site/crdt_gc.js` v1.0 + a ledger
  written by crdt_sync 1.6). Four conditions must all hold before a doc is dropped; the
  one that matters is rule 4 — a failed or empty accessible-project query classifies
  NOTHING (mutation M1: remove it and every doc on the machine comes back "drop").
  Docs predating the ledger are never dropped on ledger grounds: absence of evidence is
  not evidence of a sync. **Waqas to arm** with localStorage `SLA_CRDT_GC='1'` (or
  `?crdtgc=1`) after reading one real survey line in the console. `regression_h1_crdt_gc`,
  23 checks, 6 mutations red incl. over-suppression. Original entry:
- ~~**H-1 — CRDT IndexedDB leak:**~~ ~360 `slab-crdt-<projectId>` IndexedDB databases on Waqas's
  machine, one per project ever opened, never pruned. Unbounded local storage growth; each is
  also a stale-state reservoir (mitigated by the 66.45 adopt-model posture, not removed).
  Candidate: prune docs for projects deleted or untouched for N days, or key a generation into
  the db name on authoritative loads.
- **H-2 — APPLIED AND LIVE-VERIFIED 31 Aug 2026.** Signed off by Waqas and applied via the
  Supabase MCP. Verified with rolled-back probes on production, not assumed: the trigger is
  BEFORE; a stale client writing version 1 over version 1 was rewritten to 2; a normal forward
  write 1->6 was left exactly alone; `sl.restore='on'` still bypasses so the recovery RPCs are
  unaffected. Original entry:
- ~~**H-2 — READY, AWAITING SIGN-OFF (31 Aug).**~~ `supabase/migrations/20260831_version_monotonic_guard.sql`
  now carries the COMPLETE `create or replace`, generated from the live
  `pg_get_functiondef` — not a patch fragment, per the drift lesson H-8 just re-taught.
  The only change against what production runs today is the block marked `[H-2]`,
  placed last: after the archive block (so the snapshot banks with OLD.version intact)
  and BELOW the shrink refusal (a save that is going to be refused must not get its
  version quietly bumped on the way to raising). Nulls on either side are left alone —
  a missing version is a different defect and inventing a number would hide it.
  **Waqas's call to apply.** Original entry:
- ~~**H-2 — DB version-monotonicity guard:**~~ client fix shipped (66.45/2.57/1.6) but wild tabs
  still regress `project_documents.version` until reloaded. Proposed trigger amendment drafted
  in `supabase/migrations/20260831_version_monotonic_guard.sql` — rewrite, not refuse. Awaiting
  Waqas's sign-off to apply to production (direct-apply + SYNC NOTE, per the 20 Aug pattern).
- **H-4 — orphan empty-project minter (intermittent, pre-existing):** an empty "Untitled Project"
  row is occasionally provisioned right after New Project (6eeca9a7 31 Aug; c29d1d96 + four
  others earlier). The manual-save path provisions without a content guard by design; some caller
  reaches it in a race. Did not reproduce under instrumentation. Candidate: content-guard the
  manual provision too, or find the caller with a persistent stack hook.
- **H-4 status update (31 Aug):** ROOT-CAUSED AND FIXED in cloud_sync 1.7 — _hasRealContent
  counted the blank seeded FTA page as content; now requires a rooted page.
  **VERIFIED BY CONTENT 31 Aug, and the verification earned its keep.**
  · SIX are genuinely empty — 0 FHA / 0 functions / 0 requirements / 0 systems, one unrooted
    FTA page, ~2.2–2.7 KB — and ALL SIX already carry `deleted_at = 2026-08-30 15:04:02`,
    so they are already invisible to the app. A hard delete is optional housekeeping, not a
    fix: c29d1d96, 6eeca9a7, 328f5eb2, ef3209c5, 324d1ea0, 2dc39080.
  · **2eb7e186 IS NOT AN ORPHAN AND MUST COME OFF THE LIST.** 101 FHA rows, 18 functions,
    117 KB, 16 saved versions, `deleted_at` NULL — a live project with real content. Its
    18/101 shape matches the Aeolus golden, so it is most likely an eval run, but that is a
    guess and the rows are real. Deleting it would have destroyed 101 FHA rows.
    This is exactly why the original entry said "verify each is empty by content first".
  · No production rows were deleted. Hard-deleting customer data is Waqas's to run.
- **H-3 — DONE 31 Aug:** swept in the 27-project cleanup (f7a7bda2 deleted with the rest; list + content-resolution record in HANDOFF). Superseded:
- **H-3 (old) — repro pollution:** measurement project f7a7bda2 (g5 t3 fullsession) holds 120 SYN-*
  synthetic rows at version 1 from the 31 Aug repro; history v1-v3 intact. Restore v3 via
  Version History or delete with the measurement-project cleanup batch. Cleanup also gets:
  914f7002 (313-row g5 duplicate, old-build gap 31 Aug) and 6eeca9a7 (empty orphan).

- **H-11 — CLOSED 31 Aug 2026, but READ IT: the RLS helpers returned NULL, not false.**
  `private.workspace_role()` is NULL for a non-member, so `null in ('owner','admin')` was NULL
  and `can_admin_workspace` / `can_edit_workspace` / `can_review_workspace` /
  `is_workspace_owner` all returned NULL. Every plpgsql gate of the form
  `if not private.can_admin_workspace(x) then raise` therefore DID NOT FIRE for exactly the
  population it existed to stop. RLS policies were never affected (Postgres treats a NULL
  policy expression as false); only the SECURITY DEFINER RPCs were.
  **Proven reachable, rolled back:** a signed-in non-member passed the authorization gate in
  `public.sl_restore_project_version` against a live project owned by someone else, failing
  only on a version number that does not exist. `sl_restore_project_baseline` had the same
  shape and grant. `erase_project` had the same shape but is granted only to
  postgres/service_role — latent, not browser-reachable.
  Fixed at the helpers (`20260831c`), so every caller present and future is closed at once.
  Re-probed after: stranger gets 42501 everywhere, admin unaffected, editor correctly refused
  the archive while their ordinary edit still succeeds.
  **STILL OPEN, for Waqas:** (a) should `sl_restore_project_baseline` /
  `sl_restore_project_version` be narrowed further than editor-level now that they are actually
  gated? (b) do the access logs show this was ever exercised? I have not looked at logs.
  (c) a wall check cannot see production — worth a periodic pg_proc census for the
  `if not private.` shape, the way H-8's suite censuses the migration tree.

- **H-8b — OPEN, opened 31 Aug 2026:** `private.audit_immutable()`, `private.erase_my_account()`
  and `private.verify_signoff_chain()` also exist only in production. No POLICY depends on them,
  so the access model is now reconstructible from disk — the full database is not. Codify them
  from `pg_get_functiondef` the same way.

## DONE (1 Sep 2026) — BYO-standard: bot-side per-tenant store (built on BOT_KV)
App side shipped (user uploads a standard -> chunked into BM25 -> in-app ANEM grounds on it,
tagged 'USER:' and marked reference-not-authority/instruction; see EXPORT_RUN). The Teams BOT
still answers only from the static kb_bundle. To make the bot respond on a customer's own
standard needs a per-tenant store the worker reads at query time:
  - upload path (who uploads: the customer via app? an admin? — auth/tenancy decision)
  - storage: Cloudflare KV (simple, per-key blobs) vs D1 (queryable, better for many chunks)
  - chunk + retrieve in the worker with the SAME USER-SUPPLIED marker + no-injection posture
  - isolation: one tenant's standard must never leak into another tenant's answers
DECISION NEEDED FROM WAQAS: storage model (KV vs D1) and whether to build now. This is standing
config + backend, so not started on my own initiative.

- **S1 — Cross-tenant membership hole (live).** `ws_members_self_join` = `WITH CHECK (auth.uid() = user_id)` only; no trigger. Anyone signed in who learns a workspace id can add themselves as owner. Fix: self-join only into a workspace the caller owns (creation); joins otherwise via `accept_invitation`; add `WITH CHECK` to `ws_members_admin_update` (no promotion to owner). Migration + test against live `pg_policies`.
- **S2 — MFA is off and browser-only.** `index.html:4007 SL_MFA_REQUIRED=false`; enforcement fails open; desktop bypass; no server-side AAL2 check. Fix: switch on; require `aal2` in RLS helpers (or a policy on the content tables) so an AAL1 session cannot read project data; desktop path decided with Waqas.
- **S3 — ITAR fences that do not hold.** (a) `crdt_sync.js:59` / `presence.js:38` read `window.projectConfig` (never assigned) — expose it or read the bare identifier; (b) manual Save-to-cloud and Create Revision upload ITAR projects — fence both; (c) `notify_agents.js` has no ITAR gate — add; (d) controlled-document guard only on the ANEM path — move into `Provider.complete` so every lane obeys it; (e) "ITAR cloud" backend selection does not set the ITAR header — make the header follow the effective policy, not the project toggle alone. Tests for each.
- **S4 — Security headers missing on the SPA fallback.** `/app/index.html` and any unknown `/app/<path>` serve the app with no CSP/HSTS/XFO (verified live). Fix in `worker.js`: stamp headers on every HTML response incl. the fallback; add `fonts.googleapis.com`/`gstatic` to the CSP or drop the Google Fonts tags.
- **S5 — Sealed baselines are hollow in the web build.** `lock_seal.js:91` reads stores via eval (blocked by CSP) → FHA/requirements/CCA/items/FMEA not sealed. Fix: read stores through `SLStores.snapshot()` / explicit references (same in `stale_watch.js:53`, `lane_trees.js:75,87`); test that every family in `CONTENT_FOR` hashes non-null.
- **S6 — Trust page says customer content may train models** (`trust.html:164`) — contradicts the EULA, SL-WP-0003 §6 and the no-training regression test. Fix the page; decide the sovereign fine-tuning policy in writing ("never without written opt-in" proposed).

- **S7 — No audit record is written.** `audit_log` (chain trigger, append-only) and `workspace_audit` have no writer; `audit_log` has 0 rows. Build: the gateway writes one row per AI call (user, feature header, model, tokens, ITAR flag, latency, outcome — never content) through a service-role RPC; the app writes workspace events (sign-in, role change, invitation, export, erasure); `verify_audit_chain()`; customer-facing export. This is also Enterprise build S13.
- **S10 — Notification edge functions accept any bearer ≥ 16 chars** (`notify-signin/-signup/-expiry/-review`). Fix: verify the shared secret.
- **S19–S21 — SUPERSEDED: CUSTOMER-HOSTED IS BUILT (7–11 Sep 2026, urgent #4; Waqas 14 Sep: "this is built").** The three-tier sizing below is the 5 Sep estimate and is kept only as history. What exists: customer-install/db (schema baseline scrubbed of Safety Lab specifics + migrations 01–06 incl. Stage 3 and the grants lockdown, apply.sh, README) proven on a real clean Supabase and attack-tested with real roles; the AI proxy in offline-licence mode (ES256 signed licence is the credential, never fails open, metering off) as a Cloudflare Worker AND as a standalone Node service for GovCloud/VPC, with ordinary-Anthropic / Bedrock-GovCloud / Azure-Gov config; the finding that a customer install needs zero edge functions (invite email optional, degrades to a copyable link); DEPLOYMENT.md + the controlled docx SL-DG-0001; configure.js (validates the answer sheet, refuses any address that points at Safety Lab's cloud, mutation-proven test) + verify.sh. STILL OPEN on it: only the live AI round-trip proof (R7), gated on one AI key from Waqas; and the whitepaper hold (R15) until that proof exists.
- **S19 — "Thin browser" mode (Enterprise setting, ~1 week).** No persistent browser storage: project in memory while the tab is open, saves straight to the server, sign-out/close leaves nothing (no autosave, ring, caches, AI memory; licence token session-only). Closes S8 and half of S9 by construction.
- **S20 — Customer-hosted backend (~2–3 weeks).** Database, sign-in, real-time and the AI gateway run in the customer's own Supabase org / AWS account; we host only the static app (or they do). Needs: backend URL/key as an installation setting (today hard-coded in `safety_lab.js:3088`, `labs_thread_config.js`, and the CSP connect-src); packaged migrations (depends on S12); packaged edge functions and proxy; a licence check that does not phone home; their Entra SSO; their model endpoint (Bedrock / Azure / vLLM). Deployment guide.
- **S21 — Fully self-hosted / air-gapped (S20 + ~1–2 weeks).** App container + open-weights model on their hardware; packaged installer; what the paper already promises as the fourth tier.

- **S23 — Nothing authorizes a desktop user but a file on their own disk.** `safety-lab-desktop`
  is an Electron shell around a bundled copy of the web app. A signed licence file is verified
  offline (`license.js`) — no server call, no seat check, no machine binding — and
  `preload-app.js` then writes `license.tier` (**defaulting to `pro-plus`**) plus a self-typed
  identity into the page's localStorage. `auth_gate.js:873` lifts the sign-in gate on
  `__SLAB_DESKTOP__` before MFA can run and `:403` disarms idle sign-out, so MFA and session
  expiry are web-only claims. **Waqas's ruling: fix it; notify him when a user signs in; a user
  without a licence is PAYWALLED.** The sign-in notification machinery already exists
  (`notify-signin`) — desktop never triggers it because desktop never signs in, so a real sign-in
  delivers both the notification and the paywall as consequences rather than as new features.
- **S26 — Plaintext on disk, and a stale bundle.** `config.json` holds an AI bearer token and the
  database key; localStorage holds the licence token, the session and **Jama username+password**.
  Separately: `app/` is 16 modules behind `site/` and is **missing `cloud_writer.js`**, i.e. still
  on the pre-consolidation two-writer cloud path — a data-integrity divergence, not tidiness.
- **S27 — The desktop repo is not backed up.** One commit, 5 Jul 2026, **no git remote**;
  everything since is uncommitted.

- **S22 — SL-WP-0003 Data Security → Rev 3.0, trust.html and security.html rewritten to match, AI data policy page, sub-processor list (add Voyage AI, Microsoft/Teams, AWS GovCloud planned, Resend, Stripe).** Written AFTER the builds ("we build then we write the papers"). Must not claim: Azure as the ITAR backend (it is Bedrock GovCloud, unprovisioned — today ITAR requests are refused); MFA enforced; AI calls audited; customer-managed keys (until S18); signed certificates; pen test done; "nothing leaves the browser in local mode" (corpus search, cache, autosave, notify); "only excerpts sent" (whole documents are sent).

- **R1 — CLOSED 12 Sep 2026 (afternoon): the redesign is committed as 985167a** (63 files; wall 290/0/0 first). Git-on-the-mount gotcha stands: unlink is forbidden, so `mv` locks aside and expect `tmp_obj_*` litter unless delete permission is granted for the session.
- **R2 — CLOSED 13 Sep: desktop 0.17.0 released (web 0e0d3f1, both Mac chips, bundle verified).** Was: The web's `SL_DESKTOP_APP_READY = true` switch was found missing (never committed, erased by a revert) and restored + guarded (038d93a, `regression_desktop_open_in_flag`); desktop bumped to 0.17.0 (8858407). Waqas runs `./ship.sh` then `cd ~/dev/safety-lab-desktop && ./release.sh` (release.sh runs pull-web itself; the device VM cannot: no Chrome, no Mac packager). Verify: BUILD_INFO.json webCommit, black nav + pills on the FHA page, "Open this project in the desktop app" on the web account panel.
- **R18 — SYNC DATA LOSS RACE (found 13 Sep 2026 during the R4 eval). BUILT 13 Sep (see HANDOFF 'THE SAVE/SYNC REBUILD'); awaiting deploy + live confirmation.** An accepted FHA draft of 184 rows vanished about a second after accept; functions and FCIM survived. Traced with a wrapper on window.__crdtApply: crdt_sync.js pushLocal runs 350 ms after scheduleAutosave (onLocalChange debounce), and pullToModel REPLACES every synced store with the doc's rows on any non-local Yjs update. Remote updates were arriving every ~12-13 s with no second user in the project (server echo of our own saves, most likely). A pull landing inside that 350 ms window overwrites the unpushed local rows with the doc's copy (none), and the next push then deletes them from the doc too. Reproduced by trace on the second draw: apply at t, push within 350 ms, pull at t+6.3 s carried the rows (no loss); the first draw lost the race. Odds per accept ~3% at that echo rate; a big accept (100+ rows) is exactly where it hurts. SECOND WITNESS (Waqas, 13 Sep): the same disappearance hit him on automatic requirement generation (acReqData is a synced table, same path). Waqas: a sweep of the app comes BEFORE the fix is built. THE 13 s SENDER, FOUND IN CODE: the cloud autosave (one push per 12 s) confirms version N -> cloud_writer calls SafetyLabCRDT.noteSnapshotVersion -> _stampSet wrote meta.docVersion OUTSIDE a transaction -> Yjs 'update' with origin null -> the handler read it as remote -> full pullToModel. The app pulled on its own autosave clock. WHAT WAS BUILT (Waqas: 'perfect solution', 'if existing infra needs to be scrapped we do it'): (1) stamp written as a local transaction; (2) pushLocal is a THREE-WAY diff against a synced baseline (local vs baseline vs doc), so push-before-pull is always safe and never resurrects a teammate's delete; pullToModel pushes first on every live update and never on a load reconcile; (3) __crdtApply merges IN PLACE (array, row, page, node, projectConfig identity survive a pull — selectedNodeData stays live); (4) save_watch.js: a 1 Hz idle fingerprint watcher calls scheduleAutosave for any silent change, settled by explicit saves so nothing saves twice; (5) one rail: commitSaveChanges rides scheduleAutosave, the nonexistent saveState is gone from all ten modules, twenty-odd silent writers announce themselves, undo/redo push; (6) cloud_sync shrink guard is per table (10+ rows -> under 20% refused and named). Tests: regression_sync_pending_push (16), regression_crdt_merge_in_place (23), regression_save_rails (53), regression_cloud_shrink_per_table (13), all mutation-proven; wall 301/0/0. RULED AND BUILT 13 Sep (Waqas: 'if I hit undo I want it to restore mine but not impact teammates' work ... exactly how it is in Microsoft documents / SharePoint'): while co-editing is live, undo/redo go through a Yjs UndoManager scoped to the synced tables and tracking only this tab's own transactions (crdt_sync 2.1 undo/redo/canUndo/canRedo/liveUndo; helpers_modules 3.1 routes undo()/redo() there, snapshot undo stays for solo/offline). A teammate's later edit of the same row wins and a superseded step is skipped, as in Word. Seeds carry origin 'seed' and are never a step; undo/redo results reach the screen through the ordinary pull. Proven end to end with the REAL bundled Yjs in two vm tabs (tests/regression_live_undo_per_user, 24 checks, mutation-proven). Not covered by the live undo: stores the sync does not carry (AI assumptions ledger, review comments, source docs).; stores the live sync does not carry (AI assumptions ledger, review comments, source docs) still rely on their writers announcing; the fingerprint's cost on a very large project is to be read live (SLSaveWatch.status().lastCostMs).

- **R19 — FULL TOOL-WIDE SWEEP (Waqas, 13 Sep 2026: "at some point we will need a full tool wide sweep"). STEPS 1 + 2 + 3 BUILT AND DEPLOYED 13 Sep late night (see HANDOFF), wall 305/0/0, served bytes verified.** Static sweep of all 253 scripts + runtime sweep of all 86 tabs (new tools/sweep/tab_sweep.js). Findings: 92 promise chains with no handler (41 truly bare), no global error catcher, 264 native alert/confirm/prompt sites in 56 files (22 hit by ordinary clicks), 23 store writers relying on save_watch, 89 cosmetic pin/header mismatches, one legacy dead panel (view-resources). Ruled "all three, in that order". DONE: (1) error_watch.js 1.0, the global catcher with ring, dedupe, one plain-language toast; (2) every bare chain in 16 modules ends in a report-catch (regression_silent_failures, 21 checks); (3) 13 Sep late night: ALL 353 native alert/confirm/prompt sites in 69 files rewritten onto slAlert (new) / slConfirm / slPrompt and typed toasts, dialog engine queues, window.alert is a guard only, regression_native_dialogs (22 checks) pins zero native sites tool-wide, wall 305/0/0, runtime sweep 0 native dialogs hit (see HANDOFF 'R19 STEP 3'). 14 Sep small hours: the tail is done too (4 real save-hygiene fixes + regression_writers_announce; deep sweep covers system sub-tabs, PASA panels and one level inside modals: 105 targets, 1,628 modal buttons, 0 errors; the three 'dead code' candidates were checked and are live or deliberately parked, nothing removed). Remaining: the 89 cosmetic pin/header mismatches only.
- **R10 — Google Fonts hot-link.** index.html and landing.html still link fonts.googleapis.com (IBM Plex / Inter); the self-host rule for ITAR installs says drop it or ship the woff2 files (build.sh already allowlists *.woff2). Newsreader is unreachable through the org proxy either way.
- **R12 — CLOSED 13 Sep: both consoles live (Waqas's logins), sitemap.xml submitted in each (Success, 13 pages), IndexNow on every deploy, marketing pages de-dashed, guide-page Q&A widened with schema in step.** Left with Waqas: LinkedIn/Crunchbase consistency, directory choices. Optional: em dashes in the app UI (index.html).
- **R16 — Prompt caching BUILT 12 Sep (afternoon), f7a8c00 web + 23ae01c proxy (item 16 of NEXT_SESSION).** Byte-identical packaging: the assembler records two cache breaks (after the skill body, after the source document), AiClient cuts the string into marked blocks on the wire; proxy meters reads 0.10x / writes 1.25x and now weights claude-opus-4-8 at 5x (it was missing → metered at 1x). DEPLOYED and PROVEN LIVE 12 Sep (direct call: 9,906 tokens written then read, $0.187 → $0.016; real AFHA batch: 49,189-token prefix, $1.6 per writing slice → $0.29 per reading call). Improvement to make: the batch pool runs first-wave slices in parallel so each pays the cache write; prime the cache with the first slice alone, then fan out. Follow-up decision: the stable-first REORDER variant (bigger hit rate on the chat/batch path, eval-gated ~$5) once the Console shows the measured hit rate.
- **Q1 — Promote assumption to requirement. DONE 27 Sep 2026** (`site/req_basis.js` 1.0, shared with Q2/Q3;
  `tests/regression_req_basis.test.js` 69/69, nine mutations proved red). "→ requirement" button in the ID cell
  of every Assumptions row (aircraft and system): creates a Safety requirement (L1/L2) carrying the statement,
  a rationale built from the assumption ID, origin, rationale and both postures, the source tag, traced to the
  assumption's first failure condition; `reqSource {generator:'assumption', sourceId:'asm:<id>'}` +
  `linkedAsmIds` one way, `asm.requirementIds` the other. Second click finds the existing row. Gap = credited
  (credited posture written) + alive + not Verified + no requirement: badge on the row, "Requirement basis"
  stage on the Golden Thread (with a promote link), INV-59 advisory. v1.1: the four table bodies are
  watched, so rows the pager or a single-row patch draws are decorated too (seen live on Barracuda page 2).
- **Q2 — Rationale is a required field on safety requirements. DONE 27 Sep 2026** (same module). The two
  requirement forms refuse to log a Safety-class requirement with an empty rationale (toast + focus; other
  classes pass). Safety-derived = Safety class, or generated, or carries an analysis. Empty rationale → "no
  rationale" badge on the row, the Golden Thread stage says CHECK, INV-60 advisory on the wall.
- **Q3 — Source-analysis tag on requirements and assumptions. DONE 27 Sep 2026** (same module). Tags FHA,
  PSSA, CMA, PRA, ZSA, HF. Generated requirements are tagged from their generator (gate-indep-cma → CMA, the
  other gate/FTA/DALgebra/interface/FCIM/USOC generators → PSSA, pra-* → PRA, zsa-* → ZSA, hf-* → HF, fha-* →
  FHA); a promoted assumption's requirement inherits the assumption's tag. Authored rows: "Source analysis"
  select on both requirement forms (`sourceAnalysis`), a select in each assumption row; assumptions also infer
  from an HF type or an FHA/PSSA/CMA/PRA/ZSA/HF word in their origin. Pill by the Type cell. Reports: "Source"
  column on requirements_table and assumptions_list; new appendix `{{appendix:src}}` ("Requirements and
  assumptions by source analysis": Source, Kind, ID, Statement, Rationale, Status, grouped in vocabulary order,
  Untagged last) offered as "By source analysis" on AFHA, PASA, ASA, SFHA, PSSA, SSA, docx and PDF. Custom
  .docx templates strip appendix tokens as before.
- **Q4 — Alert-independence check. DONE 27 Sep 2026** (`site/crew_credit.js` 1.0, shared with Q5/Q6;
  `tests/regression_crew_credit.test.js` 61/61, twelve mutations proved red). Standards read in full first
  (AC 25.1322-1 §7b/§7d(3), AC 25.1309-1B §5.4.2, CS-E 510(d), CS-P 150(d)). The CMA questionnaire carries a
  standing "Crew alerting" item (`al-common`: the alert can fail from the same cause as the malfunction it
  announces). A failure condition relies on an alert when the crew alerting inventory names it, an FCIM
  aware-governs pair credits it, or a recovery task is credited on it. Unanswered in that scope's
  questionnaire (aircraft or the system) = open item on the Golden Thread ("Crew credit" stage, with a link
  into the questionnaire) and INV-61 advisory. Second consequence of §5.4.2: a Cat/Haz condition relying on
  an alert with no "loss of annunciation" failure condition in the FHA (found by wording) is named too.
- **Q5 — Crew-response timing flag. DONE 27 Sep 2026** (same module). Crew credit = an HF-typed assumption
  linked to the condition (the HF lane's crew task: direction, crewmember, task time, basis) or an FCIM
  aware-governs pair. The three §5.3.5.1 verifications become three recorded facts, each a finding when
  missing: an alert with a class (Warning / Caution / Advisory, §25.1322(b)) covering the condition; an
  assumed response time on every credited task (a time with no basis is a check, not a gap); a sensory
  modality on the alert (how the crew recognizes it). §5.4.3: Cat/Haz with a recovery task and only an
  Advisory is flagged. §6.3.3.2: Cat/Haz whose only defense is crew action (no AND-family gate on any linked
  tree, no non-HF Safety requirement traced) is flagged. Surfaces: "crew credit n" badge in the FHA severity
  cell (both scopes, pager-safe), the Golden Thread stage, INV-62 advisory.
- **Q6 — Engine and propeller severity anchors. DONE 27 Sep 2026** (same module). Cert basis Part 33 / CS-E:
  panel under the FHA severity select with Minor / Major / Hazardous engine effect (§33.75(g)(1)-(3), CS-E
  510(g)(1)-(3); the seven hazardous effects listed from the public-domain §33.75 text). Part 35 / CS-P:
  Major and Hazardous propeller effects (§35.15(g), CS-P 15 terminology; analysis per §35.15 / CS-P 150).
  Both note that Catastrophic is an aircraft-level class (AMC E 510 (3)(a), AMC P 150 (3)(a)) and that
  §35.15 has no Major objective (CS-P 150(a)(4) does). No EASA text reproduced. Correction found while
  reading: the cert basis spine and catalogue cited "CS-P 70" as the propeller safety analysis; CS-P 70 is
  "Tests, History". Now CS-P 150, cross-referenced to CS-P 15, and §35.15's objective no longer claims the
  Part 25 ladder.

- **Q7 — Critical AND-gate test (CMA scoping). DONE 26 Sep 2026** (`site/critical_gates.js` 1.0,
  `tests/regression_critical_gates.test.js` 35/35, four mutations proved red). For every AND-family gate
  (AND, INHIBIT, PAND, SPARE) in a tree linked to a failure condition: P(top) with the gate as OR and with the
  gate as certain, BDD-exact on a clone with transfers inlined, against the strictest objective among the
  linked conditions (the Golden Thread's own budget check). Either result over the objective = critical.
  CMA page: panel above the table (critical first, "show all"; reviewed by which CMA, "Review in CMA" ticks the
  gate in the form and names the claim). Golden Thread: a "Critical gates" stage before Common cause, CHECK
  while a critical gate has no non-suggested CMA. INV-58 (advisory). Not shipped yet; Waqas ships.
- **Q8 — Requirement quality linter. DONE 27 Sep 2026** (`site/req_lint.js` 1.0, `tests/regression_req_lint.test.js`
  31/31, eight mutations proved red). `SLReqLint.lint(text)`: one "shall" (none = "reads as a statement", two or
  more = "split"); let-outs, hedges, possibility words, vague phrases, indefinite pronouns, whole words any case,
  phrases across whitespace; "is / are / was" is a statement of fact only when there is no "shall" (an "is" in a
  When / While clause is fine); "shall not" is one shall. Warnings only. Surfaces: "wording n" chip in the
  statement cell of both requirement tables (pager-safe), a summary line above each table (amber count or green
  "all n statements read as one testable shall"), a live line under the statement field while typing, five EARS
  buttons under the field (Ubiquitous / While / When / Where / If, then; our wording; an empty field takes the
  template, a filled one asks for a second click), INV-63 advisory. Generated rows already follow the one-shall
  house style, so this mostly catches hand-written rows.
- **Q9 — Design-baseline stamp. DONE 27 Sep 2026** (`site/design_baseline.js` 1.0, `tests/regression_design_baseline.test.js`
  39/39, ten mutations proved red). The DESIGN baseline (release / DMU version the analysis looked at), distinct
  from the Configuration Baselines page's analysis snapshots. `projectConfig.designBaseline = { current, history }`
  (ids DB-1, DB-2 ...; "new baseline" moves the current record to history with a superseded stamp; editing the
  current record's label / DMU / date / note does not mint). Per-page stamps `projectConfig.designStamps[key]` =
  { baselineId, at, by }, keys afha, sfha:<sys>, fta:<page>, cma, pra, zsa, reqs:ac, reqs:<sys>; stamping is an
  explicit click ("analyzed against DB-n"), never inferred; refused with no current baseline. Status current /
  older (re-check) / not stated. Surfaces: Design baseline panel above the analysis baselines table (current
  record, mint form, history, every analysis page with status and a stamp button, "state all"); a one-line strip
  at the top of AFHA, FTA (follows the active tree), CMA, PRA, ZSA and Requirements; Golden Thread stage "Design
  baseline" (the condition's FHA page, linked trees, requirements) with re-check links; INV-66 advisory (fails on
  older stamps; not-stated reported beside, silent when no baseline is set).
- **Q10 — ZSA per-item record. DONE 27 Sep 2026** (`site/zonal_threats.js` 1.0, `tests/regression_zonal_threats.test.js`
  32/32 on the real zonal_model.js, nine mutations proved red). Per placed equipment item (systemsData id, the
  zonal model's own identity): what it emits (heat, fluid, debris, EMI, vibration; in normal / abnormal / failed
  operation) and what it is susceptible to; stored on projectConfig.zoneThreats. Computed: co-location (a
  susceptible item shares a zone with an emitter; emitted in normal operation = permanent exposure, gap; only
  abnormal / failed = failure sequence, check) and carry-over (the emitter sits in an adjacent zone: parent, child
  or sibling in the containment tree, roots are siblings of roots; and no SUBSTANTIATED barrier stands between
  the two zones; an unsubstantiated barrier changes nothing). "Per-item threats" section on the Zonal Model page:
  an editor per placed item (15 emit boxes, 5 susceptible boxes, a note), findings with their kind, the placed
  items with no record yet. INV-65 advisory names findings and unrecorded items. zsa_walkthrough untouched.
- **Q11 — PRA survivability framing. DONE 27 Sep 2026** (`site/pra_framing.js` 1.0, `tests/regression_pra_framing.test.js`
  29/29, eight mutations proved red). Framing paragraph under the PRA page hint: each risk is taken as certain
  (probability 1), the analysis asks what it reaches, what it takes out together and whether CSFL survives (ARP4761A
  App L). Nature of the risk added on top of the regulatory categories: proximity / trajectory / environmental /
  structural, every catalog entry mapped (id map, then words in the threat name), a "By nature" strip in the
  catalog browser with click-through, a pill by Threat Source on the row. Minimization argument: a row that KEEPS a
  Catastrophic scenario (pra_scenarios classification = worst linked FC, accepted or still open; "not acceptable"
  is a pending design change and owes nothing yet) needs `row.minimization`; textarea under Mitigation on the form,
  restored on edit; the form refuses to log such a row with the argument empty; badge by Mitigation on the row
  ("minimization argument needed" / "minimized"), INV-64 advisory.

- **Q12 — Prosecutor stance. DONE 27 Sep 2026** (fha.draft / sfha.draft v10#ff757938, cma.draft v2#6f303f9c).
  The FHA and CMA bodies start from "assume this design is unsafe and look for the evidence", and say explicitly
  that the stance governs what the model looks for, not the class it assigns.
- **Q13 — No threat is far-fetched. DONE 27 Sep 2026** (cma.draft v2). A category is excluded only when it does
  not APPLY to the design, never because it seems improbable; both eval draws dropped nothing for being unlikely.
- **Q14 — Defense order. DONE 27 Sep 2026** (fha.draft / sfha.draft v10). Design out first, safeguard second,
  inform the crew third; "inform the crew" alone is never accepted against Hazardous or Catastrophic. This is the
  one change the eval shows clearly: 17 rows naming a design defense against 0-1 on the goldens.
- Eval filed under eval/runs/draws5 (draw5_f1_v10, draw5_f2_v10, cma_v1, cma_v2); the reading is in HANDOFF.md
  under 27 Sep. All four FHA metrics sit inside the tool's own draw-to-draw band.

## Moved in the 28 Sep second pass (landed entries that still sat in the open register)

- ~~**B1** — Nothing consumes `mac_lanes.js`. No UI, no tree generation.~~ — **STALE, CLOSED
  26 Aug 2026.** Untrue since B3 landed 21 Aug. `lane_trees.js` (pinned `?v=1.2` in index.html)
  reads `SLMacLanes` at seven call sites and generates the three top-event trees from one MAC
  declaration; `stale_watch.js:185` reads `SLLaneTrees.status` for the [mac] watcher, so the
  wiring is surfaced centrally too. `mac_lanes` is additionally referenced from
  `misc_fn_modules.js`, `fn_resolver.js` and `helpers_modules.js`. There is UI (the desk on the
  MF&MS panel) and there is tree generation. **Nothing to build.**

## Suggested order (revised 19 Aug, after C1 shipped)

0. ~~**Runtime smoke gate in `ship.sh`**~~ — **LANDED 19 Aug (66.37).** See the note at the top.
1. ~~**A2 + A4 together**~~ — **LANDED 19 Aug (66.36).** See section A.
2. ~~**A1** — surface `unownedPages()`~~ — **LANDED 19 Aug (66.38).**
3. ~~**B6 + A10** — the system-id → function-id migration~~ — **LANDED 21 Aug 2026,** L1 and the
   golden-thread SYSTEM column with it. See sections A and B.
4. ~~**B3** — tree generation from the MAC lanes~~ — **LANDED 21 Aug 2026.** See section B.
5. ~~**B4** — CoFFE consumes MAC~~ — **LANDED 21 Aug 2026.** See section B.
   *New (21 Aug, from the FHA line-up check against the Appendix Q example):* **FHA-G** —
   ~~group same-FC-ID phase rows~~ — **LANDED 22 Aug 2026** (helpers 2.50). `_fhaGroupRows`
   (pure, render-order only — the store is untouched) clusters same-fcId rows at the first
   member's position; the head wears a "phase group × N · worst <sev>" badge whose tooltip
   teaches the App Q pattern and that the fault trees take the group's worst case (B3 ruling);
   members render as └ continuations; every row's menu offers "⧉ Add phase variant" —
   `acFhaAddPhaseVariant` inserts a sibling under the SAME fc id right after its source, phases
   blank for the engineer, effects/severity/assumptions carried as a starting point, saved and
   toasted. Empty fcIds never group; pagination renders the grouped order over the full store.
   Suite: `regression_fha_group` (17 checks, 3 mutations proven red). AC workbook only for now —
   the SFHA gets it when a system-level need shows up.
   *Also closed 22 Aug — the "session expiry" pattern:* NOT a defect. `auth_gate.js` has a
   deliberate 20-minute idle lock ("Signed out after 20 minutes of inactivity", every session,
   no exemption, pre-logout warning, local-scope signOut per 66.12). The four drop-outs during
   the 22 Aug live checks were the lock working: CDP-driven automation fires no DOM activity
   events, so long build stretches read as idle. No code change; the live-check protocol now
   knows to expect it.
6. ~~**A9 + A8**~~ — **BOTH LANDED 21 Aug 2026** (A8 closes R2 with it). See section A.
7. ~~**A3 / A5 / A6 / A7**~~ — **ALL FOUR LANDED 22 Aug 2026** (see section A). *New from the
   A5 live verify:* **A11** — the linkedFhaIds-only seed gap (see section A; parked 22 Aug).
8. ~~**C2** — the allocation/verification mirror.~~ — **LANDED 22 Aug 2026** (see section C).

Separately outstanding: the **NAV overhaul** (`NAV_V2_PLAN.md`, mockups in `docs/nav_*.html`), and
the **demos overhaul** — Aeolus is being reworked, the measured numbers above are a snapshot, and
the section-D allocator carry-overs were scrapped on 19 Aug for the same reason.

---

## E · Durability

### Landed
### Was: ruling needed
- **H-6 — LANDED 31 Aug 2026** (helpers 2.61), and it was bigger than filed: snapshots
  already carry numberingScheme AND numberingStore, and `_restoreProjectSnapshot` read
  NEITHER — so a cloud load kept the OUTGOING project's counter store, not merely an
  unseeded one. Fixed in `_restoreProjectSnapshot`, which covers `_loadCloudProject` and
  `_applyServerRestore` together. `regression_h6_numbering_cloud_seed`, 20 executed
  checks, 3 mutations red (M1 = the exact pre-fix code). Original entry:
- ~~**H-6 — numbering counters not seeded on cloud load:**~~ `_slSeedNumberingFromExisting` runs on
  the projectConfig-restore path but NOT in `_loadCloudProject`, so a cloud-loaded project mints
  from FC-001 regardless of existing rows — collides when a project's rows start at FC-001.
  Observed live 31 Aug on db0b5a9e (rows FC-198+, scratch mint gave FC-001). One-line candidate
  fix in _loadCloudProject + seed check in the suite. (Mitigated for AI FHA rows by the FCIM
  carry-forward, 75.3 — minting is now the fallback, not the norm.)
- **H-7 — LANDED 31 Aug 2026.** Ruled by Waqas: **admin/owner only, archive (reversible)**.
  `20260831b_project_archive.sql` + `20260831c` (the fix). Three layers: the UI hides controls
  from anyone who cannot use them; the three RPCs re-check admin; and a BEFORE UPDATE trigger
  refuses ANY change to `deleted_at` from a non-admin browser session, so bypassing the RPCs
  changes nothing. Archived list capped at 100 with a count — this workspace already holds 354.
  Proven live against a real editor membership (rolled back): direct update raises, RPC raises
  42501, and the same editor's ordinary name edit on the same row still succeeds.
  `regression_h7_project_archive`, 42 checks, 6 mutations red. Original entry:
- ~~**H-7 — NEEDS A RULING BEFORE CODE (31 Aug).**~~ Live RLS census settles part of it:
  `projects_editor_update` is `USING private.can_edit_workspace(workspace_id)` with no
  separate WITH CHECK, and `projects_member_read` already carries `deleted_at is null` —
  so an EDITOR can set `deleted_at` today and the row correctly vanishes from every member
  read. The soft-delete machinery exists; nothing client-side ever uses it. The open
  questions are posture, not plumbing: (1) who may retire a project — editor, as RLS
  currently allows, or admin only? (2) archive (reversible, listed under a Show archived
  toggle) or delete (a real tombstone)? (3) does a retired project keep its CRDT doc and
  version history, or are those swept? Answer those three and the build is small.
  Original entry:
- ~~**H-7 — NO project delete/archive in the product:**~~ nothing client-side ever sets projects.deleted_at, and live RLS refuses it from the browser anyway. Customers cannot delete a project. Needs an archive/delete UI + server RPC + deliberate RLS posture. (Found 31 Aug during the cleanup sweep.)
- **H-8 — LANDED 31 Aug 2026**, and the filed description understated it. The drift is not
  one policy: production keeps ALL SEVEN RLS helpers in schema `private` (SECURITY DEFINER,
  pinned search_path) and every one of its 59 policies calls them qualified, while NOTHING on
  disk creates that schema and NOT ONE disk policy qualifies a call. So (a) the three newest
  RPCs already call `private.*` and would fail on a rebuild, and (b) 0001's own header invites
  a re-apply that would create un-revoked `public` copies and repoint all 18 policies at them —
  a silent authorization downgrade. `0008_rls_private_schema_sync_20260831.sql` reconciles the
  disk (RECONCILIATION ONLY — production is the correct side, do not apply to it); 0001's
  header carries a dated supersession and its statements are left byte-unchanged as the
  historical record. `regression_h8_rls_disk_sync`, 23 checks, 6 mutations red.
  Cleared as NOT drift with evidence: 0007_config_management (unapplied by design, tables
  absent, no client references) and `public.pending_comps` (RLS on, 0 policies = service-role
  only, unreferenced).
- ~~**R4 — American English, surgical.**~~ **DONE 13 Sep 2026** (e757de6 batch A, 021398e batch B, 06ac5de batch B2; all deployed). Parser-based, string-literal-prose only; the *_kb_data.js quote guard keeps British spelling inside quoted passages from European standards. The eval gate was run TWICE on the deployed v9 text: a fresh-project run (confounded by decompose variance, 18 functions vs the references' 20/22/29 — filed as eval/runs/r4_batchB2_fresh_2026-09-13T14-54.json) and the honest one, the 5 Sep identical-input protocol (run 3 project, 22 fn / 43 FCIM / 107 conditions, FHA cleared, cache bypassed, bare): draw e4 on v9 vs e1/e2/e3 reads perPhaseClassAgreement 0.666 / 0.611 / 0.600 against the three's own band of 0.635 / 0.656 / 0.72; functionWorstCaseAgreement 0.955 / 0.864 / 0.909 vs 0.909 / 0.955 / 0.955; severeJumpRate 0.079 / 0.102 / 0.097 vs 0.061 / 0.064 / 0.078; signature match 0.97-0.98; 203 rows vs 197-200. Reading: the spelling change is not detectable above the tool's own draw-to-draw variance (one draw, low edge of the band, within its spread). Caveats: e2/e3 rode 1,251 chars of review memory, e4 was bare; eight days and a redesign sit between them. Exports filed under eval/runs/draws5/ (e1-e3 pulled from the browser's IndexedDB, e4 new). ~$13 total. Leftovers: em dashes inside the app UI strings (separate item), British spelling in comments (not customer-facing, left alone).
- **B0** — `mac_lanes.js` 1.0: three lanes derived from one declaration, per function,
  Catastrophic-only, arbitration-driven malfunction lane, cry-wolf guard, `_NO_DEFAULTS` enforced by
  the wall. 51 checks.

- **B3** — ~~Tree generation from the lanes~~ — **LANDED 21 Aug 2026** (`lane_trees.js` v1.0,
  spec = ARP4761A Figure Q.4-1, supplied as screenshots). One MAC declaration generates THREE top
  events (total loss / partial loss / malfunction — three conditions, three severities, three
  pages), each bound to its own classified condition via the FCIM TL/PL/M ids, **worst-case row
  only** (Waqas: "fault trees will only be for the worst case"). The TL tree is the Q.4-1 shape:
  availability gate (MAC breach structure; members become FF branches of own-loss OR resource
  routes) + signed CoFFE malfunction residue OUTSIDE it (the FF5.3 position). CRA feeds
  structurally — one SHARED resource event per (resource, mode), same logicalId under every
  serving branch (the AGS.MF ×2 pattern), system-level linkage visibly coarse; interdependence
  contributors no clause covers are NAMED findings, never invented branches. Ids from the
  numbering engine (makeSharedId — stable across regenerates; hardcoded prefixes only when the
  engine is absent). Regenerate-as-diff on per-lane fingerprints over EVERY feeding lane.
  Verification, restated for the enriched tree: [1] skeleton cutsets ≡ lane sets (BDD, routes and
  residue stripped) and [2] every resource event sits under exactly the branches the declared
  data serves. Desk on the MF&MS panel (wraps `renderMfmsPanel`, zero monolith edits). Suite:
  `regression_lane_trees` (30 checks, executable against the real breach arithmetic, BDD and
  numbering engines, on the Appendix Q decelerate-on-ground fixture — the weighted clause
  WBS×3+{GSS,TRS,FLS}×1 floor 3 reproduces the Q.4-1 AND exactly).
- **B4** — ~~CoFFE consumes MAC~~ — **LANDED 21 Aug 2026** (helpers 2.47 · misc_fn 66.36).
  The prune now fires on MODEL-computed YES singles (was signed-only; with 0 signed it never
  fired) — a signed NO stays authoritative and un-prunes its pairs. The panel folds
  model-answered cases behind an expandable derived section ("n answered by the MAC model —
  x breach · y survive"); the elicit table carries ONLY malfunction cases, cases touching a
  system no MAC clause models (their computed "survives" is vacuous and annotated "outside the
  MAC model"), and live signed-vs-computed disagreements. `coffeConfirmDerived` (B2, shipped
  but unreachable) gained its "sign derived" button; derived signatures render their
  provenance. Unmodelled systems are called out by name above the table. Case numbers are
  positions in the full walk, stable across sections. Suite:
  `regression_coffe_consumes_mac` (22 checks — behavioural prune checks plus a VM render of
  the real panel; four mutations proven red).
- **B6** — ~~`clauses[].of` holds system ids~~ — **LANDED 21 Aug 2026 (with A10).** `fn_resolver.js`
  v1.0 (`SLFnResolve`) is the classifier `mac_lanes` was designed for; the MAC editor offers system
  FUNCTIONS grouped by system (no bare-system fallback); `validateMembers` is wired in the rules
  table, every bare-system member renders a finding with a signed, previewed re-point that migrates
  clause membership, weights, fidelity basis and the arbitration set, recorded in `rule.repointed[]`.
  Measured before building: all 98 real customer projects carried ZERO mac rules and ZERO idp cells —
  every legacy member lives in demo copies, which show their findings until the demos rework reseeds
  them (ruled 21 Aug: let them show). Suite: `regression_fn_granularity` (30 checks). Live-verified
  on K350 in the deployed tool, fixture-restored.
