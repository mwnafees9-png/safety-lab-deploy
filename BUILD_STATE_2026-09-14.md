# Safety Lab Aero: what is built and what is not, confirmed from the live app and the code

Date: 14 Sep 2026. Method: every open entry in OPEN_ITEMS.md was checked against the running site (safetylabaero.com/app, fetched from your signed-in tab), the three repositories on your Mac (safety-lab-deploy at 67041e2, safety-lab-proxy-deploy at 23ae01c, safety-lab-desktop at d2b26d9), the migrations folder, and HANDOFF.md. The register is not the source here; the evidence column is.

## 1. Built, but the register still lists it as open (mark closed)

| Item | What it is | Evidence |
|---|---|---|
| S1 membership hole | Anyone signed in could add themselves as owner of any workspace | Migrations 20260905 (membership + ownership), 20260907 (admin cannot mint owner), 20260907 (hardcoded admins dropped); HANDOFF 5 Sep "applied and verified live" |
| S2 MFA off | MFA step-up | auth_gate.js: step-up is ON unless SL_MFA_REQUIRED === false; live page: the flag is unset, so MFA is on. The desktop signs in at the same gate (auth_gate ~979). Server-side AAL enforcement is not separately confirmed; see section 3 |
| S3 ITAR fences (6 doors) | Controlled data must never reach our cloud | 65c185a (sync/presence fences), e7275ed (manual save, revision, notifications), a0d6c86 (ONE fence at the AI choke point, chat-lane guard retired, itar-cloud refused, answer cache consults the flag); tests/regression_controlled_ai_fences (36 checks, mutation-proven) |
| S12 served-tree leak | Full source served, stale artifacts | build.sh allowlist (5 Sep); .fuse_hidden and MS_SSO_SETUP out of the served tree |
| S19–S21 customer-hosted | Whole product on the customer's infrastructure | customer-install/db proven on real Supabase, proxy offline-licence mode (Worker + standalone Node), DEPLOYMENT.md + SL-DG-0001, configure.js + verify.sh; already corrected in the register today |
| S23 desktop bypass | Desktop skipped sign-in via a local licence file | auth_gate.js: the Electron bypass is gone; desktop 0.16/0.17 sign in at the gate |
| R1, R2, R4, R12, R16, R18, R19 | Redesign commit, desktop 0.17.0, American English, Search Console, prompt caching, save/sync rebuild, tool-wide sweep | Each has its HANDOFF entry and commit; register already marks them |
| A12 data half | consumedBySystems on resources | cea_graph.js reads it; demo data carries it. The write-back path from a finding is NOT built (section 3) |
| H-8b | Three production-only DB functions codified | erase_my_account, erase_project, verify chain functions appear in migrations 0005/0006/0008 |
| F26, F27 | FHA prompt contradiction; wall mis-reporting | Register marks closed 5 Sep |

## 2. Confirmed NOT built, live or in code

| Item | What it is | Evidence |
|---|---|---|
| S4 security headers on the fallback route | Any unknown /app/<path> serves the app without headers | Live: /app/ and / return CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy; /app/unknown-path-xyz returns 200 with NONE of them |
| S6 trust page | Says customer content may be used to improve our models | Live trust.html still contains "may be used to improve our models" (and, lower down, "no training on customer data": the page contradicts itself) |
| S5 sealed baselines hollow | lock_seal reads stores through eval, which CSP blocks in the web build | lock_seal.js:91 still uses `(0, eval)(...)` |
| S7 / S13 audit log | Nothing writes audit rows | No writer to audit_log or workspace_audit anywhere in site/ or the edge functions (cloud_writer's "audit" is the lock-breach check, unrelated) |
| S8 credentials in browser storage | Licence token, BYO AI keys stored in localStorage | auth_gate.js:1022, bindings_modules.js:1559-1560, 1643 still write them |
| S9 erasure | Self-service erasure, persisted certificate, cache cascade | The DB functions exist (0005); no client flow beyond what the audit described |
| S10 notification functions | Accept any bearer of 16+ characters | notify-feedback and notify-invite have no shared-secret check; notify-expiry, -review, -signin, -signup do have one (partly done) |
| S11 proxy hygiene | Rate limit fails open on a KV error; raw licence token as KV key | worker.js:120 "rate-limit KV error (failing open)"; no hashing of the token key. (Offline-licence auth does refuse when no key is configured, worker.js:423) |
| S12 migration drift | DDL for ~10 tables and private function bodies not in the repo | Migrations folder has 22 files; the 6 Sep capture is in customer-install, not in supabase/migrations; 0007 still present |
| S14–S18 enterprise controls | Classification label per project, retention and legal hold, admin controls, AI data receipt, customer-managed keys | No code for legal hold, retention, force sign-out, session lifetime, data receipt or key wrapping in site/ or migrations. (A "data_classification" router exists in the AI proxy path only) |
| S22 whitepaper Rev 3.0 and pages | Paper and trust/security pages rewritten to match reality | Not present; R15 hold still stands |
| S24 signed update channel | Auto-update verified only by a hash from the same host | desktop main.js:414-420: AUTO_UPDATE_SIGNED = false, no code-signing certificate, updates manual |
| S25 Electron hardening | Context isolation on the app window | main.js:198: contextIsolation false, sandbox false on the app window (gate and settings windows are isolated); notarize + hardenedRuntime ARE configured in package.json |
| S26 plaintext on disk; stale bundle | config.json holds tokens; bundle behind the web | config.json still the store; the bundled app is web 0e0d3f1 (helpers 2.98): it predates R18 (save/sync rebuild), the per-user undo, and all of R19. cloud_writer.js IS in the bundle now; error_watch.js is not |
| S27 desktop backup | No git remote | `git remote -v` prints nothing; 4 commits |
| R6 | Delete the SL_CRDT_AUTHORITATIVE rollback branch | Flag still in crdt_sync.js (line 281-306) and index.html:4016 sets it true; deferred by you "after it bakes" |
| R7 | Live AI round-trip on a customer install | Needs your AI key; not done |
| R8 | Rotate the service_role key in five webhook triggers | Not done (coordinated with you) |
| R9 / R17 | Staff and Electra AI entitlement on the proxy | proxy worker.js has no comp for @safetylabaero.com or electra.aero; both still metered by the DB rate limit |
| R10 | Google Fonts hot-link | Live app page still loads fonts.googleapis (2 links; landing 4) |
| R13 | Report exports still use old severity colours | reports.js has no pill colour mapping; your ruling pending |
| R14 | Golden run 2 | Latest goldens in eval/runs/goldens are 4 Sep (aeolus v7); no post-severity-fix draws |
| B8.1–B8.6 CoFFE upgrade | Coverage line, shortest route, residue reasons, residue cap, degraded weights, SFHA cross-check | coffeCoverage and coffeShortestRoute exist in misc_fn_modules (2071, 2114) with zero callers: built, not wired. Rest not built. Scheduled last by you |
| A12 write-back | Record a newly found "system uses this resource" back into the resource data with a signature | Not built; needs your granularity ruling |
| B5 | Self-checking / cross-comparison pairs in the malfunction lane | Not built; design undecided |
| C4 | Closure block for legacy trees | node_identity.js reports "blocks-closure"; the switch-on policy is parked by you until the demos rework |
| NAV overhaul | Navigation per NAV_V2_PLAN.md | Plan and five mockups exist in docs/; index.html still carries the current sidebar (snav-*). The 12 Sep redesign restyled it; it did not restructure it |
| R3 demo data | Demo SFHA rows link to real functions and FCs | demo_showcase.js untouched since the English and dialog passes; not regenerated |
| R5 MAC screen rework | Parked by you | No code since the 11 Sep mockup |
| F22 → F23 → F24 | "Felt yet" as a fixed property; MAC rules for 13 functions and phases for 6 crew tasks; three fresh draws | fha_derive.js still derives "felt" per draw (line 31, 107); no per-function property; no new goldens |
| F11 | AI learns from engineer edits on AI rows | Not built; design ruling first |
| F12 | Jump to where accepted rows landed | Not found in the accept path |
| F13 | add_cma returns no id | ai_assistant.js:12170 applies it and returns ok only; no id; also fta/FMEA decline reasons absent |
| F14 | Ask the model to fill appliesTo on assumptions | ai_skills.js has no appliesTo instruction |
| F17 | Panel to sign the MAC arbitration scheme by hand | "arbitration" appears in the engine and skills, no panel |
| F18 | Detach an empty local restore before first autosave | Not present in the boot path |
| F19 | Phase coverage check on the classic SFHA path | Not present |
| F20 | Retire or keep the 102 seeded skeleton tree pages | Your ruling |
| F25 | Temperature lever | ai_assistant.js:212-249 sets per-feature temperature and passes it; the register's note is that the SHIPPED model ignores it (a model change, eval-gated): your ruling |
| F4, F5, F6, F7, F8 | Methodology checks and the human answer key | Not run; F8 needs a person |
| F1, F2 | Deterministic batching, single context-assembly path | Post-Radia by your ruling |
| H-1 | CRDT garbage collector armed | crdt_gc.js still report-only (_armed gate); your call after one survey line |
| H-4, H-11(a) | Hard delete of six orphan rows; narrowing restore RPCs | Your call |
| E1 | Monitoring note only | Not a build |

## 3. Cannot be settled from the code alone (needs you, or production access)

- S2 server side: whether Supabase enforces AAL2 on the row policies (the client step-up is on; the migrations mention auth_assurance only in the signatures table).
- S6 wording of the fine-tuning policy ("never without written opt-in" was proposed).
- S11 whether the rate limit should fail closed for non-founder licences.
- R7 needs one AI key; R8 needs a coordinated big-bang.
- Everything marked "your ruling" above: A12 granularity, B5, B8.2 (demo risk), C4, F11, F20, F25, R13, H-1, H-4, H-11(a).

## 4. The order you set, re-read against this

You said: ITAR, then customer-hosted, then desktop, then MAC screen, then CoFFE. ITAR and customer-hosted are done. The next in your order is the desktop: S24 (signed updates, you said first), S25, S26 (including refreshing the bundle, which is now three releases of web work behind), S27 (a remote, ten minutes). After that the security defects that are live-visible today (S4 headers, S6 trust page, S10 the two unprotected functions, S8, S5, S7 audit writer), then the enterprise controls, then MAC and CoFFE when you are ready.
