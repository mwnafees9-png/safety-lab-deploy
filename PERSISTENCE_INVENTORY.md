# Autosave & Collaboration — Full Inventory (as of 3 Sep 2026)

Compiled from the served code (`site/*.js` module headers and bodies), the applied migrations (`supabase/migrations/`), HANDOFF.md and OPEN_ITEMS.md. Every line here is traceable to one of those; nothing is from memory. Dates are the log's dates; modules whose birth predates the log are marked "in place since ≤ early Jul 2026" (git import 5 Jul).

Waqas's question was: *we do some parts well and break others every time we address data loss — what has shipped?* The short answer is at the end (§5). The inventory is §1–§4.

---

## 1. The persistence spine, layer by layer

### 1a. Local autosave (single slot) — the monolith
| What | Where | Protects against | Status |
|---|---|---|---|
| Debounced autosave to IndexedDB / localStorage / disk (one un-keyed slot per browser profile) | `_writeAutosave`, `scheduleAutosave`, `checkAutosaveRecovery` (data_ops / helpers / bindings) | losing the working set on refresh or crash | in place since ≤ Jul |
| **E1 parts 1–2** — during boot recovery, an empty snapshot never overwrites a stored one that has content; recovery hold released on both promise outcomes + 12 s backstop; verdict judged from the snapshot OBJECT, not by re-parsing a 4.5 MB payload | data_ops 66.16 · helpers 2.51 · bindings 1.25 | the boot-time race where an empty in-memory model autosaved over the only copy | **landed 26 Aug**, `regression_autosave_e1` 33 checks / 13 mutations red (M1 = the exact pre-fix code) |
| **E1 part 3** — throttled *last-good* slot (120 s) with an OFFER banner; never a silent restore | helpers (28 Aug batch) | the wrong state being the only state | landed 28 Aug |
| Autosave META carries `cloudProjectId` / `cloudDocVersion` atomically with the payload; `checkAutosaveRecovery` adopts them on both paths | helpers 2.57 · data_ops 66.24 | resume restoring DATA but dropping the cloud identity → duplicate project rows minted (db0b5a9e) | landed 31 Aug, verified live |

### 1b. Recovery ring + session resume — `session_resume.js` (v1.3)
| What | Protects against | Status |
|---|---|---|
| Last **5 generations** in IndexedDB (a new generation at most every 5 min + first write of a session); "Recovery ring" panel on Thread Integrity; restore through `_applyProjectData` | a bad state autosaving over the only good copy | in place since ≤ Jul |
| `_ringCaptureForce()` exposed so the save-conflict path can BANK the in-memory state before anything else happens | the conflict dialog's Cancel branch wiping unsaved work | 1.3, 31 Aug |
| Session resume — active tab / system / sub-tab remembered and re-entered after boot recovery | losing the PLACE, not the data | ≤ Jul |

### 1c. Concurrent-tab lease — `tab_guard.js` (v1.0)
| What | Protects against | Status |
|---|---|---|
| One tab holds a WRITE LEASE (localStorage token, 5 s heartbeat, 12 s TTL, BroadcastChannel); a tab without it keeps working in memory but its autosave writes are SUSPENDED behind a banner with one-click takeover; generation counter compared on re-acquire, modal offers newer vs keep, user decides | the same profile open in two tabs silently last-writer-wins on the LOCAL slot | ≤ Jul; loads after session_resume so the lease is outermost (a suspended tab writes neither the slot nor the ring) |
| **Not covered by it:** the CLOUD write path. The lease governs `_writeAutosave`; it does not stop a second tab's *manual* save or its background cloud push. Two tabs of one user are today caught only by the server version check (§1d). | | design item (a) below |

### 1d. Cloud document + the two writers — `helpers_modules.saveProjectToCloud` and `cloud_sync.js`
The cloud copy is one row per project in `project_documents` (`data` jsonb, `version` int). Two client paths write it.

**Manual / commit path — `saveProjectToCloud` (helpers 2.73)**, reached from `commitSaveChanges()` which is called from 20+ module `_save()` paths (every AI accept via ai_fidelity, the HF stores, navigation).
| Change | Protects against | Shipped |
|---|---|---|
| Optimistic concurrency on `project_documents.version` (`_activeCloudDocVersion` token) with a confirm on mismatch | a stale tab overwriting a newer cloud copy | pre-31 Aug |
| Version read is UNCONDITIONAL; a null token over an existing doc ADOPTS the server version (never writes 1 over N); a real mismatch BANKS in-memory state first (`_bankWorkingState` = sync `_writeAutosave` + `_ringCaptureForce`), then asks with honest wording; Cancel loads the cloud copy WITH the bank in place | version-1-over-N regression; the Cancel branch that used to wipe unbanked work | 2.57, 31 Aug, verified live on db0b5a9e |
| **SERIALIZED + COALESCED** — one cloud save in flight per tab, at most one queued follow-up that snapshots the latest state (`window.__slabCloudSaveQ`) | the tab racing ITSELF: two overlapping saves, the second seeing the first's version bump and reporting a conflict against its own previous save | 2.73, 2 Sep, deployed |
| **CONDITIONAL WRITE** — `UPDATE … WHERE version = <token>` `.select('version')`; zero rows = refused at the server → bank → ask → resync → ONE retry, then "refused twice" error; no row → INSERT at v1, 23505 = same conflict. The blind UPSERT is gone from this path. | two writers that both read N both writing N+1, the second silently destroying the first | 2.73, 2 Sep, deployed |
| NON-BLOCKING reconcile through the app's `slConfirm` (native `confirm()` only as fallback) | the renderer freezing under a native dialog, killing in-flight work | 2.73, 2 Sep |

**Silent / background path — `cloud_sync.js`** ("continuous cloud autosave + first-edit provisioning"; in place before 20 Aug — the shrink guard was added to it that day; rides `_writeAutosave`, throttled to one push per 12 s, ALSO flushes on `pagehide` and on `visibilitychange → hidden`).
| Change | Protects against | Shipped |
|---|---|---|
| Push the snapshot to the cloud after each local autosave; provision a project row on first real edit | a signed-in user who never clicks Save having no server row at all | 1.0 |
| **Shrink guard** `_wouldGut` — refuse to push when content collapses below 20 % of the last shipped count (mirrors `sl_doc_items()` in the DB; a lone rootless FTA page = empty) | the 20 Aug wipes: a transient client-side empty state pushed over a 212-item project, then re-pushed four times by the 12 s cadence | 20 Aug (client half; DB trigger is the real backstop, §1e) |
| Version history written from the automatic path too (`_recordSaveHistory`) | 1,271 pushes leaving only 225 history rows; 233 of 411 projects with no recoverable history | 20 Aug |
| Provisioning through the SHARED lock `_slEnsureCloudProject` | two racing writers minting two rows | (H-series) |
| Null token adopts the server version instead of writing 1 | version regression from the silent path | 1.6, 31 Aug |
| `_hasRealContent` requires a ROOTED fault-tree page | **H-4** orphan "Untitled Project" rows minted from a pristine New Project tab (c29d1d96, 6eeca9a7, +4) | 1.7, 31 Aug |
| **ITAR guard** — judged from the snapshot; never pushes an ITAR-controlled project to hosted Supabase; posture stated once | the 18-Aug DESKTOP_SYNC_GO_LIVE defect 1, "the most serious open item since 14 Aug" | 30 Aug (desktop-sync batch) |
| Detach cloud identity on showcase / sample / File-Open / New Project loads (`__slCloudSyncDetach`) | a demo load overwriting an unrelated real cloud project (de27b117) | 1.6 + misc_fn 66.45, 31 Aug |
| **ONE writer per tab** — queues on the same `__slabCloudSaveQ` chain as the manual save; snapshot taken INSIDE the queued run; the write is the same conditional UPDATE; a refused write is skipped silently (the manual Save reconciles); INSERT at v1 only when no row exists | the 3 Sep loop: the autosave's blind upsert bumping the version under an in-flight manual save → the manual path refusing its own tab's write → the dialog; and the reverse interleaving, an older snapshot landing over a newer save with no trace | **1.8, built + green 249/0/0, NOT yet deployed** (mitigated live with the kill switch `window.SL_CLOUD_AUTOSAVE = false`) |

### 1e. Server side — Supabase (project `Safety-Lab`, us-east-2)
| What | Protects against | Status |
|---|---|---|
| `project_document_versions` — append-only history of EVERY save, immutable (UPDATE revoked), pruned to 80 rows per project by the trigger | nothing to roll back to | `0004`, applied |
| `project_baselines` — deliberate numbered revisions through review / approval / sign-off | (custody, not recovery) | `0003`, applied |
| **`sl_guard_project_document` trigger** (BEFORE UPDATE): archives OLD into the versions table, REFUSES a write that guts the document (`sl_doc_items()` collapse) unless the one-statement `sl.restore='on'` flag is open | every client in the wild, including builds that never got the client guard | `20260820`, applied; disk copy reconstructed from `pg_get_functiondef` after it drifted |
| Recovery RPCs `sl_recovery_points`, `sl_restore_project_version` — authorise → BANK the current state (undoable via returned `undo_version`) → write under the flag → clear it in the same statement | rollbacks being refused by the anti-wipe guard (a deliberate restore looks exactly like a wipe); the flag leaking past one statement (found by testing the first version) | `20260820b`, applied |
| `sl_restore_project_baseline` — same contract for sealed revisions | the client-side baseline restore being refused / steering users to `_slIntentionalClear` | `20260821`, applied |
| **H-2 version monotonicity** — a write with `NEW.version <= OLD.version` (restore flag closed) is REWRITTEN to `OLD.version + 1`, not refused | wild tabs regressing the counter until they reload | `20260831`, signed off by Waqas, applied via MCP, verified with rolled-back probes |
| H-7 project archive (`deleted_at`, admin/owner only, reversible) | customers unable to retire a project; editors soft-deleting | `20260831b`, applied |
| RLS baseline, private-schema helpers never returning null | cross-workspace reads | `0001`, `0008`, `20260831c` |

### 1f. Real-time collaboration
| What | Where | Status |
|---|---|---|
| **CRDT co-authoring** — Yjs over Supabase Realtime, per-item merge for aircraft-level flat tables (functions / FHA / requirements), per-project IndexedDB doc `slab-crdt-<pid>`, `project_crdt` server mirror (10 of 36 stores) | `crdt_sync.js` 1.6 | header says "flag-gated + inert by default"; **in practice `flagOn()` is TRUE unless explicitly killed** (found 31 Aug). Never runs for ITAR projects. |
| `adoptModel()` — an authoritative load (open-from-cloud, server restore) makes the MODEL the working copy; stale keys tombstoned; 15 s `_adoptUntil` window turns any pull into a push | the 31 Aug **resurrection**: after a cloud load the stale local ydoc unioned the previous session's rows back into memory within ~6 s | 1.4, 31 Aug, watched live (planted zombie row deleted on load) |
| H-5 — `refresh()` synchronous on adopt + `_docStale()` guard on BOTH push and pull | the 6 s project-switch window where the doc still belonged to the previous project (pull was the worse direction: old project's rows onto the new model) | 1.6, 31 Aug |
| H-1 — `crdt_gc.js` 1.1 survey-only collector for the ~360 orphan IndexedDB docs; four conditions must hold, a failed project list classifies nothing | the collector itself becoming the next E1 ("a mechanism built to protect data deleting it instead") | built 31 Aug, **not armed** (Waqas to arm after reading one survey) |
| **Presence** — who is in the project, where, live cursors on shared FTA pages; ephemeral by construction, writes nothing | `presence.js` 1.0 (COL-1) | in place; guards: signed-in + cloud project + not ITAR |
| Invitations end to end (`accept_invitation`, `pending_invitations`, notify-invite edge fn) | H-9 | first delivered invitation 31 Aug |

### 1g. Locks, custody and integrity (the collaboration model Waqas relies on)
| What | Where | Status |
|---|---|---|
| Holder-owned user locks, no override path, voluntary unlock flagged in change log + hash-chained journal; BASELINED stronger than locked, reopen only via a Problem Report; locked views inert with a banner | `lock_enforce.js` 1.0 | in place since ≤ Jul (SLA-WP-003 Rev 2.3 §19 documents it) |
| SHA-256 sealed baselines, INV-19 recomputes on every sweep (catches out-of-app edits); surgical reopen limited to the PR's declared artifact families | `lock_seal.js` 1.0 | ≤ Jul |
| Baseline cascade awareness (upstream reopen stamps downstream "impacted"); break-glass takeover with signature + reason into a takeover register | `lock_custody.js` 1.0 | ≤ Jul |
| Baseline delta report per PR cycle (REG §5b) | `lock_delta.js` 1.0 | ≤ Jul |
| Delete guard (snapshot → delete → re-sweep → offer undo when new dangling refs appear); rename guard + delete-stale cascade; golden-thread integrity sweep | `delete_guard.js`, `rename_guard.js` 1.6, `gt_integrity.js` 1.5 | ≤ Jul / 2 Aug ruling |
| **What the locks do NOT do today:** they are workspace/area locks in the project model (`acWorkspace.lock`, `system.lock`, `_wsEditable`), enforced in the UI. They are not consulted by either cloud write path, and the cloud conflict guard does not know a lock exists — so under locks a conflict prompt is a *lock breach* wearing a "teammate changed this" costume. | | design item (b) below |

---

## 2. The incident ledger — every data-loss event and what it taught

| Date | What was lost / nearly lost | Root cause | Fix | What it broke or missed |
|---|---|---|---|---|
| before 20 Aug | **Four projects destroyed**; worst: 212 items / 150 requirements collapsed to one blank FTA page, pushed over four more times | `cloud_sync` UPDATE path had no content guard; `pagehide`/`visibilitychange` forced an immediate push of whatever was in memory | shrink guard (client) + `sl_guard_project_document` trigger (server) + recovery RPCs + history on the automatic path | the trigger made *deliberate* rollbacks look like wipes → baseline restore broke → `20260821` RPC; the restore flag leaked past one statement in the first RPC version |
| 18 Aug (found) / 30 Aug (fixed) | ITAR-marked projects silently snapshotted to hosted Supabase every 12 s | `cloud_sync` had no ITAR guard (crdt and presence did) | snapshot-judged ITAR guard | — |
| 26 Aug | an empty in-memory model autosaved over the only good local copy during boot recovery | boot-time race | E1 parts 1–3 | first attempt reused `_autosaveSuspended` and stranded autosave; rebuilt as a one-write refusal |
| 30–31 Aug | "a later accept RESURRECTED the earlier draft"; version 1 written over version 3 (f7a7bda2); duplicate project rows (db0b5a9e, 914f7002); Cancel on the conflict dialog wiped unbanked work | THREE coupled defects: `_loadCloudProject` never set the version token; session resume dropped the cloud identity; **CRDT default-ON unioned the stale local doc back after every authoritative load** | 66.45 / 2.57 / 1.6 / 1.4 / 66.24 / 1.3 + H-2 trigger | left H-4 (orphan minter), H-5 (project-switch window), H-6 (numbering counters) — all found and closed the same day by driving it live |
| 2 Sep | conflict dialog looping on a project open in ONE tab; every OK closed the AI panel mid-draw | `saveProjectToCloud` had no in-flight guard and 20+ `_save()` callers; token updated only AFTER the write; the write was a blind UPSERT | 2.73: serialized + coalesced, conditional write, non-blocking reconcile | **missed the second writer** — `cloud_sync` was still independent and still blind |
| 3 Sep | same dialog back within the hour; two campaign draws lost to it | `cloud_sync`'s own `_inFlight` only serialized it against itself; its visibilitychange flush fired while an accept was saving | 1.8: one shared chain, snapshot inside the run, conditional write, silent skip | (built, green, undeployed) |

Side casualties worth naming: the 20-Aug trigger + the 31-Aug adopt posture are the two changes that have held under every later stress; every other layer has needed a second pass.

---

## 3. Why "fix one, break another" keeps happening — the honest pattern

1. **There was never one owner of the cloud write.** The manual Save, the background autosave, the CRDT mirror and the restore RPCs each grew their own guard, and each guard was correct *about itself*. Yesterday's fix hardened one writer against the other's symptom and did not enumerate the other. `grep -n project_documents site/*.js` lists every writer in ten seconds and was not run until today.
2. **Guards were added at the symptom, not at the invariant.** The invariant is simple: *a write to `project_documents` lands only if the version it read is still the version on the server, and there is one such write in flight per tab.* Until 2.73 no code stated it; until 1.8 not every writer obeyed it.
3. **Tests pinned mechanisms, not outcomes.** Suites asserted "upserts the document", "concurrency-safe: skips when diverged" — true statements about a design that could still lose data. The behavioural sections (fake CAS client, race between check and write, two writers in flight) only exist since 2 Sep, and section (h) of `regression_cloud_sync` — the exact 3 Sep loop — was written today.
4. **Protective mechanisms are themselves writers.** E1 (26 Aug), the CRDT persistence (31 Aug), the GC candidate (H-1) — each was built to protect data and each was, or would have been, a destroyer under the wrong precondition. The 20-Aug DB trigger held precisely because it sits *below* every client.
5. **Verification ran on the happy path.** The campaign's save cadence (an accept every ~40 s, a tab going to background) was the first sustained concurrency load the product had. Both 2 Sep defects surfaced within an hour of it.

---

## 4. What is open right now

| # | Item | Owner / decision |
|---|---|---|
| O-1 | ~~Deploy cloud_sync 1.8~~ **DONE 3 Sep 00:50 UTC, verified live.** Superseded by the consolidation below (cloud_writer 1.0 / helpers 2.74 / cloud_sync 1.9 — **deployed + live-verified 3 Sep**). | done |
| O-2 | ~~Second tab of the same user~~ **BUILT 3 Sep (cloud_writer 1.0):** the tab write lease now gates the cloud path — a suspended tab pushes nothing and is told to click the banner. | **live 3 Sep, verified** |
| O-3 | ~~Lock breach as audit~~ **BUILT 3 Sep (cloud_writer 1.0):** a refused write while this user holds a workspace lock is banked, logged to the change log + journal as `lock-breach` (versions named), toasted, resynced, holder's state kept — no dialog. Silent mode audits once per server version. | **live 3 Sep, verified** |
| O-4 | ~~commitSaveChanges storm~~ **BUILT 3 Sep (cloud_writer 1.0):** 3 s quiet window after a landed write; a burst becomes one trailing write; `flush()` on pagehide. 74 call sites in 34 modules counted. | **live 3 Sep, verified** |
| O-5 | Cache-bust chain: `index.html → ai_loader.js?v= (unchanged) → ai_assistant.js?v=N`; a normal reload served the stale loader after two deploys this week. Bump the loader pin per ship or serve it no-cache. | small, do with O-1 |
| O-6 | H-1 CRDT GC still survey-only (~360 orphan IndexedDB docs). | Waqas to arm after one survey |
| O-7 | CRDT is default-ON with the header still claiming "inert by default". Either the header or the flag is wrong; decide which. | design call |
| O-9 | After a manual save lands, the background autosave re-pushes identical content once (cloud_sync's `_lastPushedTs` does not learn from a manual landing). One extra history row; give the writer an onLanded hook. | small |
| O-8 | Chrome throttles a hidden tab's timers to ~1/min after 5 min in the background; anything that polls (the campaign driver, presence heartbeats, the 12 s autosave) must be checked against that. | note for drivers; verify presence/lease TTLs |

---

## 4b. The consolidation (3 Sep, Waqas: "yes on 1")

`site/cloud_writer.js` is now the only file that composes a write to `project_documents`; `regression_cloud_writer` scans every served JS and fails the wall if a second writer appears. `saveProjectToCloud` (manual) and `cloud_sync._push` (silent) keep policy and hand the writer a `prepare()` that runs inside its serialized run. Details in HANDOFF (3 Sep, "ITEM 1 DONE").

## 5. Short answer

Shipped and holding: the local slot with the E1 refusal, the 5-generation recovery ring, the tab write lease, the server-side anti-wipe trigger with archive-first restore RPCs and 80-deep version history, the H-2 monotonic counter, the CRDT adopt-model posture, presence, invitations, and the lock/seal/custody stack.

Shipped twice and finally coherent as of today's build: the cloud write itself — one serialized chain per tab, every writer conditional on the version it read, no blind upsert anywhere, refusal handled by banking then asking (manual) or silent skip (background). That last piece is built and green but not deployed.

Still a design gap rather than a bug: the cloud guard and the workspace locks do not know about each other, and the same user in a second tab is a coin-flip on the cloud path. Those are O-2/O-3 and they are Waqas's calls, not mine.
