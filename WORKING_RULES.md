# Working rules — stripped list from Waqas, 19 Aug 2026 (session-local reference)

Before writing anything
1. Reproduce the bug first. No repro = not a bug (the `deg:` token "fix" that never existed).
2. Measure blast radius of a data-model change against real project data first (CoFFE partial-loss enum: 676→~1500 cases, computed nothing).
3. Read the live tool before proposing a change to it.

While writing
4. Never edit `index.html` by line index. Anchored string replacement only.
5. `SLEnv.get('name')` for app state, never `window[name]` (top-level `let` = global lexical, silent undefined).
6. After two failed layout fixes, stop and read `getComputedStyle` on the live page.
7. A new module gets a load-order assertion in the same commit that introduces it.

When testing
8. Write the test from the requirement, not from the code just written (the inverted boundary rule).
9. Prove every new check by breaking the guarded thing and watching it go red.
10. Assert a selector matches a live element, not that a CSS rule exists (`.is-modal`).
11. Any markup builder: render in a VM and inspect generated HTML (the malformed onchange quoting).
12. Pins as floors, never literals — `parseFloat('72.10') === 72.1`.

When verifying a deploy
13. Compare byte sizes, not status codes (Cloudflare SPA fallback: 200 + ~340KB shell for any missing file).
14. When a live probe reports something alarming, suspect the probe first.

Added 19 Aug 2026 by Waqas
17. **Understand the associated code for anything you touch BEFORE you touch it.** Read the call
    sites, the consumers and the fail-safe semantics of the function you are changing — not just
    the function. A change that is locally correct and globally wrong is the expensive kind.
18. **Always provide a copyable deployment command when something needs shipping.** Deploys are
    Waqas's; every delivery ends with the exact command, on its own line, ready to paste.

Earned 19 Aug 2026, during the A2/A4 live verification
19. **Rule 14 runs in both directions: a probe that reports ABSENCE is as suspect as one that
    reports a problem.** "0 transfer gates on Aeolus" was a probe that tested four field names and
    missed the canonical one (`gateType: 'TRANSFER'`). A finding of nothing is a finding, and it
    has to be falsified the same way — search for the thing by more than one name, and confirm the
    probe can see a positive case before trusting a negative.
20. **When a live check disagrees with a pre-build measurement, the disagreement IS the finding.**
    Chase it before declaring the verification passed. Here it turned "A2 is a no-op because there
    are no transfers" into "A2 is a no-op because the seven transfers have no children" — same
    conclusion, different and correct reason, plus nine missing tests.

Structurally
15. Runtime smoke gate in `ship.sh` before the next feature — headless load, no uncaught boot errors, key globals defined, auth initialises, drawer opens, identity block renders.
16. Ship smaller; live-verify between batches.

21. **HANDOFF.md stays current AT ALL TIMES (Waqas directive, 29 Aug 2026).** Every working
    session appends its dated entry to the TOP of HANDOFF.md before it ends — what shipped,
    what was learned, what changed commercially, what is open — same discipline as the
    register and the wall. The 20-29 Aug gap (ten days dark, state living only in
    OPEN_ITEMS.md and chat) does not happen again. OPEN_ITEMS.md remains the living
    state; HANDOFF.md is the narrative log a fresh session reads first.

22. **No internal language on the analysis pages (Waqas directive, 3 Sep 2026: "it's an analytical
    tool, not something we should be using internal language for — everything should be
    descriptive and make things intuitive for the user").** Invariant ids (INV-nn), batch and
    item codes (H-4, ENG-2, HF-3a, A9, Q9…) and phase numbers never appear in user-facing text
    on an analysis page — a finding, a footer, a tooltip or a definition names the check or the
    concept in words ("the phase-workload check", "the unvalidated-credit check"). The invariant
    id stays the index on the Thread Integrity page, beside its name, and hovering any id
    anywhere shows the registered name and severity (field_defs.js). Every column on the HF and
    R&M pages has a hover definition and every page an "About this lane" strip; a new column
    without a definition fails regression_field_defs. A standard's own numbering (MSG-3 Q1–Q4,
    §25.1302(a)–(d)) is the user's language and stays.

---

## Measured on Aeolus HL-1, live, 19 Aug 2026 (before A2/A4 was written)

| | |
|---|---|
| pages | 36 — 18 allocation, 18 verification mirrors |
| systems | 21 · tree levels: 26 system, 10 aircraft |
| page scope keys | 9 distinct `sys-*` buckets + `ac` (10 pages) |
| nodes | 182 — gates 80, basic 102, **undeveloped 0** |
| **nodes carrying `node.identity`** | **0 of 182** |
| **transfer gates** | **7** — first measured as 0, which was a probe bug; see the correction below |
| allocation leaves with a probability budget | 51 — **5 on aircraft pages**, 46 on system pages |
| distinct logical ids | 50 · **lids appearing in >1 scope: 0** |
| `unownedPages()` | 0 |
| requirements in the project | 36, all in `system.req`; `acReqData` empty |
| **existing auto-generated requirements** | **0** (no `reqSource` on any row) |
| `AutoReq.generate({ftaEvent}, scope)` preview | ac 5 new · FCS 5 · PRP 12 · EPS 6 — all new, 0 orphaned |

**CORRECTION, made during live verification after the deploy.** The pre-build probe reported
**0 transfer gates and that was wrong.** It tested `n.type === 'transfer'` plus four field names but
NOT the canonical shape, which is a **gate** with `gateType: 'TRANSFER'` and its destination in
`transferOutTo`. Aeolus has **seven**, on aircraft PASA pages, transferring into LDG, PRP, EPS and
NZD. I suspected the data when I should have suspected the probe — the inverse of rule 14. The
shipped code covers the shape (the union in `_transferTargetPage` was written defensively), so
nothing shipped broken, but the path was live on real data with no test on it. Nine checks added
after the fact, two mutations proving them.

**Conclusion: A2 is still a no-op on Aeolus, for a better reason.** All seven transfer gates resolve
to a system rather than to the aircraft page — but **none has children**, so no leaf inherits
through one, and `resolveOwner` falls through to the page's `systemId` for every requirement-bearing
node. U-1's cross-bucket duplication is already fixed and confirmed live
(0 lids in more than one scope). Nothing moves, and A4 has nothing to migrate, until someone
declares identity on a node sitting on an aircraft page. Max theoretical movers today: 5 rows.

23. **The catastrophic step is ONE joint end state (Waqas ruling, 3 Sep 2026).** "If you're
    losing the aircraft, the effect for the other two should be automatically multiple
    fatalities, there is no further argument, with the assumption the situation is not
    recoverable with crew action" — and "you dont need human factors to play a part there".
    Any severity axis at its top step carries the other two to theirs: crew and passengers are
    aboard, hull loss is credited as non-recoverable, and Table A6 CAT-1 is one state, not three
    judgments. Never look for HF evidence, workload data or annunciation coverage to settle the
    crew axis once the aircraft is lost, and never abstain on crew or occupants for want of it.
    Below the top step the axes are independent and each needs its own evidence. Corollary: all
    three axes must describe the SAME credited outcome — crediting a recovery on two axes and
    the crash on the third is the error this rule exists to kill (Vayu AFHA, 3 Sep: 5 of 36
    classified rows had the occupant axis governing alone, and all five were broken).

24. **An abstention is not a level, and a probe that skips blanks is not a probe (3 Sep 2026).**
    The Effects cell printed "None" for an empty axis, indistinguishable from a stated level of
    none, and Waqas read three hull-loss rows as claiming the crew survived. The coherence probe
    written the same day tested for levels BELOW the top step and so skipped those same blank
    axes entirely — renderer and check shared one blind spot: unknown treated as benign. Render
    blank as blank; test blank as a failure.

25. **When a bridge drops mid-run, STOP and say so — never open or navigate a tab (Waqas
    directive, 4 Sep 2026: "stop opening new tabs mid run, just let me know the bridge has
    dropped and I can go test it").** Two capture draws were burned in one morning because the
    reflex on a dead connection was to re-establish one: `tabs_context_mcp{createIfEmpty}` plus a
    navigate produced a FRESH page, and a fresh page has no in-flight promise and no page
    variables — the very result being recovered is what the recovery destroys. A drop is not an
    error to work around; it is a fact to report. The work in the page continues without me.
    Corollary for anything long-running in a browser: the record must be durable the instant it
    exists (write it before and after, not only after), and the tab belongs to the user — I drive
    it, I do not create it.

26. **NEVER delete a data store to clean it up — not a file, not a localStorage key, not a row
    (Waqas directive, 4 Sep 2026: "stop deleting files, we need that data").** On 4 Sep I cleared
    `localStorage['slab.campaign.v1']` because the driver choked on its shape, and only afterwards
    read what it held: the 2 Sep HF campaign's RAW DRAWS (tid_v113 / task_v113), which existed
    nowhere else — `grep -r tid_v113 eval/` returns nothing. The scored findings survived in
    eval/HF_CONSISTENCY_RESULTS_2026-09-02.md; the rows they were computed from are gone, so those
    draws can never be re-scored per-axis or re-examined. The code fix was to NORMALISE the read
    (a wrong-shaped store now reads as empty), which was always the right answer and needed no
    deletion at all. Standing procedure: READ IT FIRST, EXPORT IT TO THE REPO, and only then, if
    it must go, move it aside under a dated key or `_to_delete/`. Measurement data is the one
    thing that cannot be regenerated — a draw costs money and a moment in the model's life that
    does not come back.

27. **The wall counts CRASHES, not just FAIL lines (12 Sep 2026).** ship.sh refuses on a suite
    that cannot start (non-zero exit with no FAIL line). A loop that greps only `^  FAIL  ` reports
    green on a crashed suite — that happened with `regression_budget_margin` (it runs
    budget_ledger.js in a sandbox without helpers). Any local wall run must treat a non-zero exit
    as a failure, exactly as ship.sh does, before anything is called green.

28. **The agreement is GENERATED, never hand-edited (15 Sep 2026).** `legal/SL-EULA-0004.html` is
    the single source of the legal text. `site/eula_modal.js` (pinned 1.3.0) and the desktop's
    `agreements/eula.html` + `eula.version` are written from it by `node legal/build_agreement.mjs`,
    which pull-web.sh re-runs on every sync. Edit the source and rebuild; never type into a copy.
    The `?v=` pin must equal the exported EULA_VERSION/rev and agree across index.html + legal.html.
    Colour sweeps and cache bumps must skip eula_modal.js; if touched, rebuild rather than restore.
    WHY: SL-LICENSE-0001 was a SECOND agreement holding its own copy of clauses the EULA also had.
    On 3 Aug the broad training grant was removed from the EULA and pinned by a test that read only
    eula_modal.js. The same grant sat in license_modal.js, worded one word differently, and survived
    six weeks. It was withdrawn on 15 Sep and folded into SL-EULA-0004. There is ONE agreement, ONE
    acceptance gate, and ONE source file. `regression_agreement_single_source` finds agreement text
    by SCANNING both repos rather than by a file list, and flags any sentence pairing a training
    verb with customer data that is not phrased as a refusal.

29. **AI-facing verbiage is never edited outside the eval (Waqas, 12 Sep 2026).** The severity
    rubric, the effect-level vocabulary, prompt and kb_data text are what the AI classifies against;
    changing a word there is an eval-gated change. User-facing definition text MAY be aligned to
    the authority (AC 25.1309-1B / AC 23.1309-1E), and when it is, our own context is ADDED beneath
    the authority wording, never removed.

30. **One severity renderer (12 Sep 2026).** Every place a severity class is shown goes through
    `sevPillHtml()` (or a module's `_sevPill` shim); no module picks its own hex colour for a
    class (`regression_severity_pills` guards it). Fills live in `--sev-*-fill` in BOTH theme
    blocks of safety_lab.css. Reports/exports and the FRACAS incident scale are the two deliberate
    exceptions.

31. **Say the plan and the time before anything longer than ten minutes, then report at that time
    (23 Sep 2026).** Two silent hour-long runs (a browser sweep run twice, then open-ended timing
    probes) had Waqas asking "what's going on" four times. Before a long job: one line on what it
    is, why, and how long. At the estimate: a result, or a plain statement of what is still running
    and why. A probe that has not returned by its time box is stopped and reported, not waited on.
    The same day's corollary to rules 1-3: **propose a performance change only from a
    measurement.** The "compute on every edit" pass was proposed from reading code; 30 real edits
    measured 30 ms at 100x project size.
