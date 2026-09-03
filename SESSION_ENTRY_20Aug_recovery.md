<!-- Recovered 21 Aug 2026: transcribed from the claude.ai artifact (10818bb1) via the
     Chrome bridge after direct fetch was blocked by the cloud allowlist. Content below is
     the full 20 Aug delta handoff. -->

# Session entry — 20 Aug 2026 (late)

Delta handoff. `HANDOFF.md` in this repo is current to **19 Aug 19:20**; this file covers everything
after that. Read this first, then `WORKING_RULES.md`, then `OPEN_ITEMS.md`. `HANDOFF.md` is 677 KB —
grep it, do not read it whole.

The previous session ran in a cloud container with **no bridge to the laptop**. Everything below that
touches the database is already live in production. Everything that touches a file exists only in
that container and **must be recreated on disk** — see §2, which is the first job of the new session.

---

## 1. Machine state

Waqas moved from `waqass-macbook-air-local` (MacBook Air) to a **MacBook Pro**. The old session was
bound to the Air for its whole life and could not be repointed, which is why this handoff exists at
all.

Repo lives at `~/Desktop/safety-lab-deploy`. It was verified by md5 against the container on 20 Aug:
**51 of 51 changed files byte-identical**. Nothing is missing or stale. `tools/manifest.sh` was
absent and has been recreated.

`tools/verify_repo.sh` **does not exist and never did** on the laptop — it was written inside the
container. Two separate attempts to have Waqas run it failed. Do not reference it. If you need a
repo check, use `tools/manifest.sh`.

Current pins in `site/index.html` (all verified):

| file | pin |   | file | pin |
|---|---|---|---|---|
| `helpers_modules.js` | 2.42 |   | `safety_lab.js` | 65.43 |
| `misc_fn_modules.js` | 66.33 |   | `cloud_sync.js` | 1.3 |
| `data_ops_modules.js` | 66.14 |   | `sl_env.js` | 1.1 |
| `support_modules.js` | 66.22 |   | `project_stores.js` | 1.0 |
|  |  |   | `fn_wrap.js` | 1.0 |

205 `<script src>` tags. Wall: 159 suites, 0 fails, 0 crashed. Smoke gate: 24 checks green.
**Nothing is pending deployment.**

---

## 2. FIRST JOB — reconcile two migration files

Two files in `supabase/migrations/` are out of sync with production. Both are already applied to the
database; only the on-disk copies are wrong.

**2a. `20260820_project_document_loss_guard.sql` — the repo copy does not compile**

The prune block inside `sl_guard_project_document()` was written as:

```
select id from project_document_versions ... order by saved_at desc limit 50
union
select id from project_document_versions ... order by sl_doc_items(data) desc limit 10
```

Postgres binds a bare `LIMIT` to the **whole UNION**, not to the branch beside it, so this is a
syntax error. It was corrected at apply time on 20 Aug and the fix was never carried back to the
file. Production runs the parenthesised form:

```
select id from (
  (select id from project_document_versions
    where project_id = OLD.project_id order by saved_at desc limit 50)
  union
  (select id from project_document_versions
    where project_id = OLD.project_id order by public.sl_doc_items(data) desc limit 10)
) keepers
```

Consequence if left alone: rebuilding the database from migrations fails, and anyone reading the
file believes something is running that isn't.

**2b. `20260820b_project_recovery_rpc.sql` — new file, does not exist on disk**

Adds `sl_recovery_points()` and `sl_restore_project_version()`. See §3.

**How to recreate both, authoritatively**

**Do not retype the SQL from this document.** Pull the deployed definitions — they are the source of
truth and this guarantees repo == production:

```
select pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('sl_doc_items','sl_guard_project_document',
                    'sl_recovery_points','sl_restore_project_version');
```

Supabase project: `fhrqkhdrwbfnizkepkch` ("Safety-Lab", us-east-2). Use the Supabase MCP tools.
Applied migration names to date: `project_document_loss_guard`, `project_recovery_rpc`,
`project_recovery_rpc_fix_flag_leak`.

Note `pg_get_functiondef` returns the body, so the in-body comments survive but the file-header
rationale does not. The reasoning is preserved in §3–§4 here; carry it into the file headers when
you write them.

Then re-add the trigger and grants, which are not function definitions:

```
drop trigger if exists sl_guard_project_document_trg on public.project_documents;
create trigger sl_guard_project_document_trg
  before update on public.project_documents
  for each row execute function public.sl_guard_project_document();

revoke all on function public.sl_restore_project_version(uuid, integer) from public;
grant execute on function public.sl_restore_project_version(uuid, integer) to authenticated;
grant execute on function public.sl_recovery_points(uuid) to authenticated;
```

---

## 3. What shipped to the database on 20 Aug

`sl_recovery_points(project uuid)`

Returns `kind` (`live` | `archive`), `version`, `saved_at`, `items`, `bytes`, `saved_by`,
`is_restorable` — newest first. The live document is returned as a row so one call renders the
whole timeline.

`SECURITY INVOKER` deliberately: `project_documents` and `project_document_versions` both carry
member-read RLS policies, so RLS answers "may this caller see this project" and there is no second
authorisation path to disagree with the first. A non-member gets zero rows.

`sl_restore_project_version(project uuid, version integer)`

Returns `{ok, project_id, restored_from, new_version, undo_version, items_before, items_after}`.

Order is: **authorise → archive current → write**. `undo_version` in the result is the version the
pre-restore state was banked as, so any restore is undone by restoring that number. Restoring is
never destructive.

`SECURITY DEFINER`, because the archive insert must succeed for whichever member is restoring —
same reason the guard trigger is DEFINER. **That makes the explicit `private.can_edit_workspace()`
check load-bearing**: it is the only thing between a caller and someone else's project. It uses the
same helper the RLS policies use, not a second opinion.

Version-collision handling: the current document's version may already be taken in the archive (the
guard may have banked it). The function inserts, catches `unique_violation`, and either recognises
a byte-identical row already banked or allocates `max(version)+1` — it never lets
`on conflict do nothing` silently drop the safety copy.

**Guard change — `sl.restore` escape hatch**

The anti-wipe rule refuses "populated → gutted". A deliberate rollback to an early snapshot looks
exactly like that. The pre-existing `_slIntentionalClear` hatch is wrong for this because it lives
in the **payload**, so using it writes a marker into the customer's document. `sl.restore` is a
transaction-local GUC that only a function can set — PostgREST offers no way to issue a bare `SET`.

---

## 4. Two defects found by testing that work — both fixed, both worth remembering

**Defect 1 — the flag leaked.** First cut used `set_config('sl.restore','on', true)` with a comment
claiming it "cannot leak to the next statement". Wrong: `is_local` scopes to the **transaction**,
not the statement. Over PostgREST each RPC is its own transaction so it looked fine, but any
transaction that called restore then ran with the anti-wipe guard **switched off for everything
after it**. Fixed by resetting to `'off'` immediately after the one `UPDATE` it exists for.

**Defect 2 — the refusal message lied.** It said "The previous state is archived (version N)". The
guard archives `OLD` and then `RAISE`s, and the raise rolls the archive insert back with it —
measured: **zero archive rows after a refused wipe**. Nothing is lost (refusing is what keeps the
document whole), but telling a customer their work is banked somewhere it isn't, and then inviting
them to force the write with `_slIntentionalClear`, is the worst possible pairing. Now reads:
*"Nothing was written - the saved project still holds all N."*

Both were found by an 8-step test run against a scratch project in production, cleaned up
afterwards (verified 0 leftovers, `project_document_versions` unchanged at 243 rows). Steps:
A refuse-wipe, D recovery-points shape, E restore, F undo-the-restore, G deliberate rollback to
empty, H flag-does-not-leak, plus **I, a mutation that forces the flag on by hand to prove H is not
vacuous**.

> Keep doing this. Three vacuous checks were caught by mutation in the previous session. A check
> that cannot fail is worse than no check.

---

## 5. `project_crdt` is NOT a recovery source — retract the earlier claim

The previous session told Waqas `project_crdt` "would have saved Anirudh". That was asserted
without measurement and it is **false**. Measured over all 315 rows:

- **It mirrors 10 of the 36 project stores.** Present: `ftaPages`, `systemsData`, `fmeaData`,
  `acFhaData`, `acFunctionsData`, `acReqData`, `cmaData`, `praData`, `zsaData`,
  `acAssumptionsData`. Absent: `itemsData`, `projectConfig`, all FCIM, all system-level FHA, STPA,
  ML, resources, templates. A restore from it silently drops everything it never held.
- **It lags.** 229 of 301 rows were last written within two minutes of project creation. Against
  actively-edited projects it trails the live document by hours to days (K350 Kestrel: 2.4 days).
- **It would not have helped.** `Sylla 2.0` — Anirudh Varadharajan's lost project — holds
  2,304 bytes and the **same 6 items** its gutted live document holds.

Format, for reference: base64 Yjs update; keys are `col:<storeName>` maps whose values are JSON
strings of individual records (`{"internalId":5000,"funcId":"AF-01",...}`). Useful as corroborating
evidence. Not a restore source. `project_document_versions` **is the restore source.**

---

## 6. Recoverable right now — needs Waqas's go-ahead, do not restore unasked

Full scan of every non-deleted project for "history holds substantially more than live" returned
exactly two, both Waqas's own:

| project | live items | best in history | recoverable |
|---|---|---|---|
| `Untitled Project` (30 Jul) | 17 | 289 | **272** |
| `Vantage V7` (1 Jul) | 0 | 79 | **79** |

No customer project is in a recoverable-but-lost state. Sylla 2.0's history maxes at the same
6 items it already shows — genuinely gone, which matches what Waqas told Anirudh.

To act, get the version number from `sl_recovery_points(<project_id>)` then call
`sl_restore_project_version(<project_id>, <version>)`. Reversible via the returned `undo_version`.

---

## 7. Still open

**Blocked on files reaching the laptop (this is now unblocked — you have a bridge):**

- **Client half of the recovery UI.** The two RPCs above are the whole server side. What is missing
  is a "restore an earlier version" surface in the app that calls `sl_recovery_points()` and
  `sl_restore_project_version()`. Nothing about it needs new database work.

**Carried over, unchanged:**

- **B6 + A10** — system-id → function-id migration, including the golden-thread SYSTEM column
  becoming function-level.
- **Tighter-of-two test, built correctly.** The previous attempt hung a malfunction contributor
  under a partial-loss top event and Waqas caught it: *"the two failure conditions at the aircraft
  and system level are not the exact same ... did you build an aircraft failure condition for total
  loss, or erroneous pitch axis control provided?"* The finding was retracted; the correct test is
  still owed, against the **aircraft malfunction FC**.
- ID schema in program planning (system function ID, FC ID, tree node ID); the `.A/.U` awareness
  suffix; `hasFhaNormalization` fabricated basis; SFHA `acTrace` keyed by string rather than
  `internalId`.
- ~70 remaining `switchTab` wrap sites.
- **B5 and C4 rulings — Waqas's call, not yours.**

**Retracted, do not re-raise:** the "6.4× budget inflation" claim. `formatNodeMetrics` prints
`P=6.40E-5 · ≈1.00E-5/FH` correctly. Waqas: *"I dont think the math was incorrect."* Only the
fabricated "FHA-normalized" label survives as a real finding.

---

## 8. Traps that have already cost time

- **Top-level `let` is not on `window`.** App state lives in the global lexical environment.
  `window.selectedNodeData` is `undefined` and fails **silently**. CSP forbids `unsafe-eval`, so
  `eval` is not a way out. Use `SLEnv.get(name)` or `SLStores`. This has bitten twice.
- **~90 monkey-patchers, not 9.** `fn_wrap.js`'s header says nine; the real count is about ninety.
  Every `window[x] = wrapped` site must call `SLWrap.preserve(orig, wrapped)` or it erases other
  modules' idempotence flags. `tests/regression_project_durability` asserts this.
- **`ship.sh` now has a crash gate** — it captures `RC=$?` per suite and blocks the deploy on a
  crash. It previously discarded exit codes and reported a green wall while three suites were
  crashing.
- **`SendUserFile` produces a chat download card, not a file on disk.** Two verification attempts
  failed on this. If a file must land on the laptop, use the bridge or a heredoc.
- Do not read `HANDOFF.md` whole. 677 KB.

---

## 9. Standing rules — these are absolute

- **Deploys are Waqas's.** Never run `./build.sh`, the deploy path of `./ship.sh`, or any
  `wrangler` command. Give him the copyable command and wait. **Only give a deployment command when
  something actually needs deploying.**
- **ITAR:** `~/Desktop/04 - System Safety` is never read, staged, or ingested.
- **Secrets:** the Supabase service-role key never goes in the repo, a file, or chat. The Stripe
  secret is never client-side. Never touch his passwords or SMTP.
- **Never send anything.** No email, comments, or DMs. Copy-paste-ready drafts only. `security@`
  is him-only.
- **SAE copyright:** clause numbers and titles only. Never reproduce prose.
- `safetylabaero.com` **fails `WebFetch` with `PROVENANCE_REQUIRED`.** Never fall back to curl,
  wget, or python for that domain. Use the Chrome tools.
- `device_bash` **cannot delete.** `mv` into a `_to_delete/` subfolder under the same mounted
  folder and tell him what you moved.
- **Never commit over a device file from a staged copy** without matching its device-side md5
  first, and md5-compare after committing.
- **Handoff discipline:** canonical copy in the repo, mirrored to `~/Desktop/bobby handoff.md` in
  the **same step**. That mirror is currently stale — writing it is part of the first job.
- English only.
- **Check in often.** Waqas has called out silences at 11, 22, 25 and 33 minutes. Post a short
  interim update rather than going quiet through a long task.
- **Dumb explanations down a lot.** He has asked for this repeatedly.
- You work as **Flo Wirtz** on Safety Lab Aero.
