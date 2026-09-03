# What's left to build — snapshot, 21 Aug 2026

Snapshot for quick reference. Canonical sources: `OPEN_ITEMS.md` (standing register) and
`SESSION_ENTRY_20Aug_recovery.md` §7. Update those, not this.

---

## The ordered queue

**1 · Recovery UI (client half)** — smallest self-contained win.
Server side is live in production (`sl_recovery_points()`, `sl_restore_project_version()`).
Missing: the in-app "restore an earlier version" screen that lists snapshots and calls the two
RPCs. No new database work. Unlocks self-serve recovery of Untitled Project (272 items) and
Vantage V7 (79).

**2 · B6 + A10 — system-id → function-id migration.** Both artefacts together: MAC `clauses[].of`
and interdependence `idpCell`, plus the golden-thread SYSTEM column going function-level.
Measured 20 Aug: `validateMembers` already accepts `kind: 'function'` — this is data + resolver
work, not model surgery. ARP4761A basis: Table Q.4-1 columns are system *functions*.

**3 · B3 — tree generation from the MAC lanes.** Three top events (three conditions at three
severities, never three branches of one tree), ids from the numbering scheme, regenerate-as-diff,
provenance on every generated node. The "massive win" headstart.

**4 · B4 — CoFFE consumes MAC.** Fold away what the model answers; elicit only malfunction and
unmodelled systems; prune pairs containing a MAC-computed YES single. Kills most of the 676-case
burden (measured saving 92 of 676 from pruning alone once verdicts exist).

**5 · A9 + A8 — margin state + stale-flagging, built once.** A8 owed in FIVE places (now six —
the FMES-adopt snapshot R2 has the same staleness shape), built zero. A9 CHANGES SHIPPED
BEHAVIOUR: 66.19's auto-loosening of siblings stops; offered-rebalance, analyst decides, never
silent. Needs Waqas's sign-off on the flow. ARP4761A basis for A8's shape: assumptions register
with impact column (Table Q.15-13) + interrelated-requirements re-examination rule.

**6 · A3 / A5 / A6 / A7.** Provider L3 + consumer L2 interface requirements · DAL strictest
across trees (Q.17.4.8 pattern: strictest-across-derivations persists) · independence propagation
(failures global, claims local) · common-resource-≠-common-cause guard (Q.17.4.9 pattern:
resources and CCF verified as separate passes).

**7 · C2 — allocation/verification mirror.** Allocation leaf = item + effect (FMES group);
verification twin = modes at λ×α inheriting the coordinate.

---

## Left-side structural gaps the queue must close (measured 20 Aug, K350)

- **L1** — SFHA rows key to aircraft sub-functions, not system functions (0 of 20). The join
  exists (13 of 20 FC ids come from the system FCIM); only the key is at the wrong level.
  Everything else waits on this.
- **L2** — aircraft allocation leaves declare no owning system function (0 of 20).
- **L3** — `idpCell(fc, systemId)` can't express a function. (= A10.)
- **L4** — tighter-of-two: severity built · probability built but not function-keyed · DAL not built.
- **L5** — aircraft verification trees are hand-built twins; nothing composes system-function
  verified results upward. Blueprint now in hand: ARP4761A Q.17.4.7 MF&MS FTA — system SSA
  results plugged in as sourced undeveloped events, with the SSA-vs-MF&MS allocation rule.

## Right-side gaps (the rate path computes; these stop it being automatic)

- **R1** — no adopt-all sweep (`fmesAdopt` is one button per group; 0 of 79 leaves ever adopted)
- **R2** — adopt is a snapshot; FMEA edits after adopt go undetected (A8's sixth site)
- **R3** — multi-basic-event groups refuse to adopt; real projects will have them
- **R4** — `calculateAllProbabilities()` is active-page scoped; any sweep needs page-scoped compute

## Small carried-over items

Tighter-of-two test rebuilt against the aircraft **malfunction** FC (prior attempt retracted) ·
ID schema in program planning + `.A/.U` suffix · `hasFhaNormalization` fabricated basis ·
SFHA `acTrace` keyed by string not `internalId` · ~70 `switchTab` wrap sites ·
one-line `anon` EXECUTE revoke on `sl_restore_project_version`.

## Parked / not yours to start

B1/B2 wiring (subsumed by B3/B4) · NAV overhaul (`NAV_V2_PLAN.md`) · demos overhaul (Aeolus
rework) · **rulings that are Waqas's call: B5** (self-checking/cross-comparison pairs in the
malfunction lane) **and C4** (closure block for legacy projects — parked until the demos rework
is real; do not re-ask).
