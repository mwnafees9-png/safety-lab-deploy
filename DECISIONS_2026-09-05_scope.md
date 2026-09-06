# Scope agreement — 5 September 2026 (evening session)

**Status:** agreed with Waqas in conversation, nothing built yet. This file is the durable
trail: what was decided, and how we got there. It exists because the reasoning behind these
decisions is worth as much as the decisions, and a compaction must not be able to lose it.

---

## How this session got here

Waqas: *"I do not want us repeating what we have done on previous sessions, I do not want
screwing up what is in good health, so before you touch anything I want you to have an
understanding of the product end to end along with the code."*

So before any proposal: the full 5,041-line HANDOFF.md (133 dated entries) was digested into a
per-entry record plus a de-duplicated index of every standing ruling and every rejected idea;
ARP4761A (692 pages) and ARP4754B (172 pages) were read page by page; and six read-only code
surveys covered the app shell and state layer, the AI path, the FHA and severity machinery,
the golden thread downstream of the FHA, auth/tenancy/cloud/security, and the test and deploy
machinery. Nothing in the repo was modified at any point. Commit at the time: `dcf2a1d`.

Those surveys produced findings Waqas had not seen, and the decisions below were made in
response to them.

---

## Findings that drove the decisions

**F-a — The FHA prompt contradicts itself inside one request.** The abstain rule
(`ai_assistant.js:2675-2680`, `:12739`, `:1568`) tells the model to return an empty severity
and calls a blank a good outcome. The skill body (`ai_skills.js:35`) says *"WHEN THE
INFORMATION IS THIN, JUDGE - DO NOT ABSTAIN."* Both ride in the same assembled prompt. Which
one the model follows on a given turn is not determined by the code. This is the same class of
defect as the five-instructions-arguing problem found on 5 Sep, and it sits directly on the
per-phase consistency number we are trying to move.
→ **Waqas: "the abstain instruction needs to be removed, we have judgement call flags now."**

**F-b — Temperature 0 probably never reached the model.** `MODELS.reason` defaults to
`claude-opus-4-8` (`ai_assistant.js:702`); `_modelAcceptsTemperature` strips temperature for
Opus ≥ 4.7 (`core_modules.js:262-270`). The 5 Sep "lever 1" change therefore had no wire
effect on the default configuration, and the three draws scored at 0.64–0.72 were measuring a
configuration different from the one we believed we were measuring.
→ **Waqas: "needs to get fixed."**

**F-c — The escape rule can zero a Catastrophic row, silently.** `SLFhaDerive.apply` runs
first at accept (`ai_assistant.js:3199-3206`); its `nse` branch forces all three axes to the
bottom and returns (`fha_derive.js:360-364`), skipping the MAC and human-factors derivations
entirely and filing no "assumed pending" assumption. Thirteen airborne total-loss rows had
already been turned into No Safety Effect this way (`fha_derive.js:124-128`); the 5 Sep fix
addressed only the `escape:"none"` sub-case.
→ **Waqas: "If you can escape with no safety effect, other rules do not matter if the
assessment is in fact true, we should lean on the user to correct the no safety effect
posture" / "should show in the comments."**

**F-d — S1 confirmed, and the reason it hid.** `ws_members_self_join` is created at
`0001_rls_baseline.sql:108-109` as `for insert … with check (auth.uid() = user_id)` — no
workspace condition, no role condition, no trigger. Permissive INSERT policies OR together, so
any signed-in user who learns a workspace id can insert themselves at role `owner`. It
survived three reviews because the audit test (`regression_h8_rls_disk_sync.test.js:76-84`)
filters for lines containing one of the seven helper names, and this policy contains none of
them — it was invisible to the test by construction. `accept_invitation` already covers the
legitimate join path completely (email match, expiry, single use, owner excluded, no
downgrade).

**F-e — Two problems worse than the audit reported.**
1. `erase_project` is granted to `authenticated` on disk (`0005:41,43`) while live is
   service_role. The drift runs *more permissive in the repo than in production*, so any
   rebuild from the repo — a customer installation, disaster recovery, staging — would hand a
   destructive command to every signed-in user.
2. `lock_seal.js:91` reads the stores through CSP-blocked `eval` and, unlike its siblings
   `stale_watch.js:53` and `lane_trees.js:75`, has **no fallback**. For an aircraft FHA the
   seal is therefore a literal constant: the integrity check (INV-19) reports green over a
   hand-edited FHA.

**F-f — F23's blocker.** A Task Analysis row has no field pointing at a failure condition.
The crew-axis derivation finds tasks only through a human-error row's `fcIds → asmId → task`
join or a token match inside the task's text. Text matching will not repeat between draws.

**F-g — Quality machinery gaps.** `regression_e2_commitment` and `regression_invitations`
print a non-canonical `FAIL` and never exit non-zero, so they can fail through a green wall.
`eval/regression_ai_repeatability.test.js` is not in `tests/`, so `ship.sh` has never run the
scorer's own mutation proofs.

---

## What was agreed

Numbered as put to Waqas; his answers in his own words where he gave them.

| # | Decision | Waqas |
|---|---|---|
| 1 | Workspace membership: creator is automatically owner; nobody enters without an invite; only the owner invites, unless the owner grants admin, and then admins may invite too | agreed |
| 2 | Only the owner may transfer ownership | agreed |
| 3 | Admins may not evict the owner unless ownership has been transferred | agreed |
| 4 | MFA was switched off because it was broken, not by design — find the break, fix it, turn it on | "MFA needs to get fixed ASAP it was turned off because it was not working" |
| 5 | Security headers get the proper fix: the worker owns the SPA fallback and returns a real 404 for unknown paths | "Proper fix" |
| 6 | No customers exist yet, so the baseline-seal check may start failing loudly with nobody to notify | agreed |
| 7 | The escape rule keeps its outcome but must show in the comments which answers produced it, so the engineer can correct it | "should show in the comments" |
| 8 | The occupant axis is judged wherever occupants are actually aboard — the "option C off" ruling was Aeolus-specific (no occupants onboard), not general | "correct" |
| 9 | Crew tasks: users link a task to the failure conditions it answers and to who it is assigned to; task analysis lives on a single thread | agreed |
| 10 | Fix both non-canonical-FAIL suites **and** add the check enforcing the format across the wall | "Both" |
| 11 | The `erase_project` grant drift is corrected in the same database change as the membership fix | agreed |
| 12 | Widen `ship.sh` so `eval/*.test.js` runs on every deploy | "widen it" |
| 13 | The 5 Sep e1/e2/e3 draw exports go to OneDrive (`~/Desktop/OneDrive - Safety Lab Aero`) — they exist only in a browser today, which violates rule 26 | "store them on my one drive" |
| 14 | Collaborative sync must behave like Microsoft SharePoint: no "project state has changed" prompts, edits from any user update everyone's state live; workspace locking already exists to stop two people editing one document | "that is a nuissance" |
| 15 | **No customer data on Safety Lab's cloud at all — not just ITAR.** It stays on customer servers, and customers get step-by-step instructions to set that up | agreed |
| 16 | The MAC screen is "messed up", needs to be markedly more intuitive and the approach improved | agreed |

**Order (settled 5 Sep, Waqas's call).** Items 15 and 14 come FIRST — no customer data on our
cloud, and SharePoint-style collaborative sync — *"100% no half ass fixes this time."* Then
MFA. Then item 16 (MAC).

Recorded honestly, because it was argued the other way and the argument was not accepted:
Claude recommended the membership hole and MFA first, on the grounds that they are roughly a
day of contained work and that a customer-hosted installation would otherwise inherit every
one of these defects. Waqas chose the order above. The consequence to be aware of: **the
cross-tenant membership hole (F-d) stays open while items 15 and 14 are built.** It is a live
exposure — any signed-in user who learns a workspace id can join it as owner. The membership
fix is a self-contained database migration that touches no application code, so it can be
prepared and handed over in parallel without competing with the urgent builds.

---

## The one decision that was revised, and why

Waqas initially ruled: *"I do not want helpers, I want it by policy"*, then *"clean it up the
helpers and write the whole thing as a policy."*

That could not be done as stated. The seven helpers in the `private` schema are
`SECURITY DEFINER` precisely so that a policy can read `workspace_members` without recursing
into that table's own row-level security — `0008` says so in a comment written at the time:
*"Each is SECURITY DEFINER so a policy can read workspace_members without recursing into that
table's own RLS."* Inlining that logic would make the membership policies recurse. Every
project read and write in the product passes through these rules, so the failure mode is not
degradation, it is the product not working.

Put to Waqas as: can this be fixed properly *through* helpers? Answer: yes — and that is the
smaller, safer change.

**The agreed fix:**
- Keep the helpers. They were never the defect; the broken policy simply never called one.
- Add **one** new helper that reads `workspaces.owner_id`, because at the moment of creation
  the creator is not yet a member and the existing membership-based owner check cannot see
  them. Eight helpers, matching the seven that exist.
- Correct `ws_members_self_join` to permit a self-insert only into a workspace the caller
  owns; every other join goes through `accept_invitation`.
- Add `WITH CHECK` to `ws_members_admin_update` so an admin cannot promote themselves to
  owner; add a guard refusing deletion of an `owner` membership row.
- A dedicated owner-only RPC for ownership transfer.
- Remove `private.is_safety_lab_admin()`'s two hardcoded email addresses (one a personal
  Gmail) in favour of a proper role.
- Correct the `erase_project` grant in the same migration.
- Widen `regression_h8_rls_disk_sync` so a policy that names no helper can no longer hide
  from it.
- Publish the whole permission model as a one-page table, backed by a test, so it cannot
  drift silently again.

**Jama Connect, for comparison** (researched 5 Sep): Jama has no self-join path at all.
Access is entirely admin-granted — organization admins at organization level, project admins
at project level — to users or groups, inheriting organization → project → folder → item, with
the highest permission winning on conflict. There is no project "owner" and no request or
invitation flow. Safety Lab's creator-becomes-owner-plus-invite model is deliberately
friendlier and closer to SharePoint and Google Workspace, and it still closes the hole,
because the only remaining self-service action is "create a workspace and be its owner."
The idea worth taking from Jama is **permission inheritance**, which Safety Lab does not have
today (access is flat, per workspace) and which an enterprise buyer will expect — worth
settling before the customer-hosted build, not after.

---

## Still open at the time of writing

- **The ITAR build.** Waqas: *"ITAR folder is our own ITAR build … you wont just go near it
  you need to understand it"* and then *"you can read the ITAR build."* He was told first that
  anything read lands in this cloud session regardless of how it is read, and he cleared it on
  that basis. The standing "never read, stage, or request access" rule for that folder is
  therefore lifted by him, for this work. Its location is still to be confirmed — it is not at
  the Desktop top level.
- **The desktop application.** `~/Desktop/safety-lab-desktop` exists. `auth_gate.js:873`
  lifts the sign-in gate on `window.__SLAB_DESKTOP__` before any check and `:403` exempts it
  from idle sign-out, and there is no desktop code in the deploy repo. Waqas: *"I do not
  know"* what authorizes it. To be audited; until then every "MFA is enforced" and "sessions
  expire" claim is web-only.
- Roughly forty lower-consequence questions across the six code digests, not yet put to him.

---

## Addendum — 6 Sep 2026 rulings (no customer data on our cloud)

All stated by Waqas on 6 Sep 2026, in order:

1. **"I don't want their data on our cloud, at any point."** Customer data — AI and non-AI — never touches Safety Lab's cloud, not even transiting the proxy. The hosted site is for trials, demos and internal use only.
2. **Three doors for real customers:** (1) self-hosted backend (their database, their sign-in, their AI); (2) the desktop app (files on their machine); (3) browser-only mode with the project kept as a file on their own machine / OneDrive / SharePoint — "yes I want the third case too". No live co-editing in door 3 (no server holds the document); the workspace lock does the check-out job there.
3. **Exactly three AI backends are offered:** Claude (via Bedrock; GovCloud for real ITAR programs), Azure (Azure OpenAI / Azure Government), and our own LLM (self-hosted / on-prem). "I dont wanna offer google." Controlled data may only run on these in their government-boundary or on-prem form — never the plain public API. Claude is the validated engine; Azure would need its own eval before a controlled draft is trusted.
4. **ITAR demo = Safety Lab as its own first install:** app on our site, documents on our SharePoint, AI on our own Azure or Bedrock account, nothing through the proxy or the database.
5. **Model improvement** comes from the instruction layer, adopting better base models, and training on material Safety Lab owns (standards, reference analyses, Aeolus, synthetic examples). A hosted copy of our LLM is frozen; nothing flows back from an install. Customer-donated examples only as a rare, consented, scrubbed extra.
6. **Sign-in notifications in a customer install go to THEIR admin, never to us;** seats and expiry enforced locally against a signed licence. (Open: whether an optional anonymous monthly seat count is wanted — Waqas's answer was "at any point", which reads as no.)
7. **Throwaway Supabase project** may be created under Waqas's account to prove the schema rebuild — "confirmed on both" (fences + throwaway database).
