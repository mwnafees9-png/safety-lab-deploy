# Build plan — the three urgent builds
**5 September 2026. Nothing built yet. Scoped read-only against commit `dcf2a1d`.**

Companion to `DECISIONS_2026-09-05_scope.md`, which records what was agreed and why.
This file records what the work actually is.

---

## The fact that reshapes the plan

The three urgent builds are **workspace membership**, **collaborative workspace**, and
**no customer data on our cloud**. They look independent. They are not.

**The database cannot be rebuilt from this repository.** Sixteen production tables have no
`CREATE TABLE` anywhere in `supabase/migrations/` — among them `projects`,
`project_documents`, `workspaces`, and both collaboration tables `project_crdt` and
`yjs_documents`. Step 1 of the existing customer deployment guide is `supabase db push`,
which fails on `0001`.

That single gap is the long pole for **both** big builds:

- *No customer data on our cloud* is, in the main, "the customer runs the database" — which
  cannot happen until the database can be created from files.
- *Collaborative sync* needs a server that holds the shared document. Building that on our
  hosted infrastructure and then moving it to the customer's is a rewrite of the transport,
  done twice.

So this is not two large builds. It is **one foundation and then two builds**, and the
foundation is the schema capture.

**Second fact, same shape:** the cross-tenant membership hole (`0001_rls_baseline.sql:108-109`)
and the `erase_project` grant drift (`0005:41,43`) both live *in the migration files*. Every
customer-hosted install would be built from those files and would inherit both from day one.
The repository is currently more dangerous than production. This is why the membership fix is
not merely urgent — it is a prerequisite for the other two.

---

## Sizing, honestly

The register estimates 2–3 weeks for customer-hosted (`OPEN_ITEMS.md:1140`). That estimate
assumed packaged migrations were a downstream detail. They are the work.

| | Estimate |
|---|---|
| Membership + grant drift + dead ITAR fences | ~1 week |
| Schema capture and proving it rebuilds | ~3 weeks |
| Making the app configurable (one config surface, CSP, fail-loud, egress self-test) | ~2 weeks |
| Licensing and authentication for a customer install | 2–3 weeks |
| Customer deployment guide + a reference install done by someone who did not build it | ~2 weeks |
| **No customer data on our cloud — total** | **8–10 weeks** |
| Collaborative sync — honest locks (makes the current claim true) | ~2 weeks |
| Collaborative sync — merge covering the whole project | ~4–6 weeks |
| Collaborative sync — server holds the document, prompts genuinely gone | months, after the above |
| Desktop app — sign-in, paywall, shell hardening, update signing | ~2 weeks, parallel, separate repo |

Sizes assume one engineer plus review and no half-fixes.

---

## Sequence

### Stage 0 — this week, unblocks everything (~1 week)

1. **Close the membership hole and the erase-permission drift in one migration.**
   Keep the seven helpers (they are `SECURITY DEFINER` so a policy can read
   `workspace_members` without recursing into that table's own RLS — `0008` says so in its own
   comment). Add one new helper reading `workspaces.owner_id`, because at creation the creator
   is not yet a member. Correct `ws_members_self_join` to permit self-insert only into a
   workspace the caller owns; add `WITH CHECK` to `ws_members_admin_update`; guard deletion of
   an owner row; add an owner-only transfer RPC; drop the two hardcoded emails from
   `is_safety_lab_admin()`; correct the `erase_project` grant.
2. **Widen `regression_h8_rls_disk_sync`** so a policy naming no helper can no longer hide from
   it — this is how the hole survived three reviews.
3. **Publish the permission model as a one-page table**, backed by a test, so it cannot drift.
4. **Fix the two dead ITAR fences** — `crdt_sync.js:59` and `presence.js:38` read
   `window.projectConfig`, which is never assigned, so both return false always. Add a test
   that fails if either reads an unassigned global.
5. **Fence the five paths that have none:** manual Save, Create Revision, notifications, the
   remote answer cache, feedback.
6. **Move the controlled-document guard into `Provider.complete`** so every lane obeys it, not
   only the chat lane.
7. **Fix the merge-not-saved data-loss path** (`helpers_modules.js:8270`): autosave is
   suspended while a teammate's change is applied and never picks it up. Independent of every
   architectural decision below, and rule 26 exists because of a data-loss incident.

### Stage 1 — the foundation (~3 weeks)

8. **Capture the missing schema.** Dump production, reconcile against the eight hand-edited
   migrations, decide what is baseline and what is history, land it as a numbered baseline
   plus the `private.*` function bodies and the sign-in hooks. The care is in the reconciling,
   not the dumping: getting it wrong ships a silent authorization change.
9. **Prove it.** Fresh throwaway project, clean checkout, push, run the permission suites
   against it, diff the live policy and function lists against production. "We think it
   applies" is how the current drift happened.
10. **Correct the migration record.** The version-monotonic guard IS applied — its own file
    header saying NOT YET APPLIED is the false document; `OPEN_ITEMS.md:966` and
    `PERSISTENCE_INVENTORY.md:65` both record the sign-off, the apply and the rolled-back
    probes. Fix the header. (`0007` is unapplied by design, cleared in three places; `0001` and
    `0008` must never be applied — that has to be stated in the files themselves, because a
    customer rebuild follows the files.) An earlier draft of this plan repeated the false
    header; that is precisely the class of defect this cleanup exists to remove.
11. **Package the edge functions** with a documented secret list and a deploy script.

### Stage 2 — the two builds, in parallel once the foundation holds

**No customer data on our cloud:** one configuration surface feeding every endpoint (today
there are three inconsistent override names, one documented nowhere and one documented in the
guide but read by nothing); CSP derived from that config; refuse to boot if the install names a
customer backend while any endpoint still resolves to a Safety Lab host; a boot-time egress
self-test the customer can run; then licensing and authentication; then the rewritten guide and
a reference install performed by someone who did not build it.

**Collaborative workspace:** server-authoritative locks keyed on the authenticated user, not a
browser-storage value; the writer refusing to overwrite an area someone else holds; lock state
broadcast live; then field-level merge so two people on one row do not silently lose an edit;
then the server holding the document, which is what actually removes the prompts.

### Stage 3 — desktop (parallel throughout, separate repo)

Sign-in that actually runs, which gives the sign-in notification for free and makes the paywall
a consequence rather than a feature; signed updates; shell hardening; get it into version
control with a remote — it has one commit from 5 July and no backup.

---

## The full order, settled 5 Sep 2026

Waqas: *"add the CoFFE upgrade to the buildmap after the 3 urgent builds and rest of the builds
discussed from tonight."*

| # | Build | Why here |
|---|---|---|
| 0 | Cleanup | **DONE 5 Sep.** Served-tree leak, test wall, dead files, 75 MB of scratch, the FHA prompt contradiction, the silent temperature drop, three lying documents, the stale proxy. |
| 1 | **Workspace membership** | A live hole, and a hard prerequisite: it lives in the migration files, so every customer-hosted install would be built with it. |
| 2 | **Collaborative workspace** | SharePoint-style. Live co-editing plus presence replaces the editing lock; the configuration-management and version-control lock stays and becomes server-enforced; change attribution (what changed, by whom, when) is part of it, not a later polish. |
| 3 | **No customer data on our cloud** | Not just ITAR — all of it, on customer servers, with step-by-step instructions. Shares its foundation with 2: the database has to be rebuildable from files before either can move. |
| 4 | **MFA** | Broken, not a policy choice. Fix it and turn it on. |
| 5 | **Desktop** (S23–S27) | Update channel first (unsigned updates can push code to every user), then real sign-in — which delivers the sign-in notification and the paywall as consequences rather than as new features. |
| 6 | **MAC screen** | "Messed up", needs to be markedly more intuitive; the approach itself can improve. |
| 7 | **CoFFE upgrade** (B8) | Last. Wire the coverage report, make the residue lane report its failures and cap it, populate the degraded weights so the standard's third state comes through the existing path. The shortest-route finding stays off until Waqas rules on the demo risk. Full reading of ARP4761A B.4.3.1 and Q.4.4.1 is in the register at B8. |

Two things sit outside this order because they are decisions, not builds: whether to change the
drafting model so a sampling temperature actually applies (F25, eval-gated), and whether to wire the
CoFFE shortest-route finding (B8.2).

---

## What must be decided before Stage 1 starts

These are not engineering questions.

**Q1 — Does the hosted product end, or become one mode among several?**
Removing the hosted paths is smaller and safer. Keeping both doubles the test surface
permanently. This decides the shape of everything downstream.

**Q2 — Does the AI stay ours or move to theirs?**
Today the proxy validates every AI call by reading a licence row from *our* database with a
service-role key. Move the database and entitlement moves with it. Either our proxy validates
an offline signed licence instead of a database row, or the customer runs a packaged proxy
with their own model keys and there is no metering. These are different products, and the
second also moves ITAR routing off Safety Lab's shoulders.

**Q3 — When two engineers change the same FHA severity at the same moment, what should happen?**
Silent merge with one winner and no record? Merge with a flagged finding? Or should it have
been prevented? A tool facing a certification authority silently merging two engineers'
severity classifications is a different risk from a Word document. This is a safety-process
call.

**Q4 — Do the journal, the gate baselines and the problem reports merge?**
A tamper-evident hash chain and a mergeable document are awkward partners. The proposal for
ruling: those three move to a server-side append-only table and stop living inside the project
document.

**Q5 — Is collaborative sync built on our hosted infrastructure or customer-hosted from the
start?**
Both live channels and both server mirrors are hosted today. Hosted first, then moving, is a
transport rewrite. Customer-hosted first is slower but is the thing that was actually asked
for.

---

## What is already settled and needs no further discussion

Creator is owner; nobody enters without an invitation; only the owner invites unless they grant
admin. Only the owner transfers ownership; admins cannot evict the owner. The editing lock is
retired in favor of live co-editing plus presence; the **configuration-management and
version-control lock stays** and becomes server-enforced. Change attribution — what changed, by
whom, when — is part of the sync build, not a later polish. MFA is fixed and enabled. Security
headers get the proper fix. The seal check may fail loudly, since no customers exist. The
escape rule shows its reasoning in the comments. The occupant axis is judged wherever occupants
are aboard. Crew tasks gain explicit links to the conditions they answer. Both
non-canonical-FAIL suites are fixed and a check enforces the format across the wall. `ship.sh`
widens to run the evaluation tests. The 5 September draw exports go to OneDrive before anything
touches that browser.
