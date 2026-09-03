# Safety Lab Aero — new-session kickoff prompt (rewritten 19 Aug 2026, after the C1 ship)

Paste everything below the line into a fresh Cowork session (desktop app, cloud mode).

**Wiring needed before pasting:** Claude desktop app running with **Desktop and Downloads
connected**; Chrome extension connected; Waqas signed into safetylabaero.com/app with the HL-1
project open before live verification starts.

---

## Start here, in this order

1. Read `~/Desktop/safety-lab-deploy/WORK_PACKAGE_MAC_CoFFE_Structured_Trees.md` **in full.** It is
   the single best explanation of what we are building and why, and it contains the ordered build
   list. Everything else is supporting material.
2. Read `~/Desktop/safety-lab-deploy/OPEN_ITEMS.md` — the standing A/B/C register. It is the
   checklist; update it **in place**, do not let it scroll away inside HANDOFF.
3. Skim `UPGRADES_Requirement_Bucketing.md` (U-1…U-7, the rationale) and
   `BUILD_SPEC_Structured_Nodes_and_Bucketing.md` (the *what*, including the margin/rebalance
   design).
4. Read the **top ~400 lines** of `~/Desktop/safety-lab-deploy/HANDOFF.md` — it is 640KB of
   canonical working memory in reverse-chronological session blocks, so the recent entries are the
   live ones. Search it for older context rather than reading it end to end.
5. Then copy the repo into your container and work there:
   `~/Desktop/safety-lab-deploy` → `/home/claude/work/safety-lab-deploy` via the device bridge.

**Before you write a line of code, read the section below titled "The mistakes made on 18–19 Aug,
and the rule each one bought."** It is a real post-mortem, not boilerplate — one of those mistakes
took the production app down, and three others shipped broken features past a fully green test wall.
Every rule in it was paid for.

## Consume the standards — do not work from memory of them

They are all in `~/Downloads`. Stage and read the relevant ones **before** designing anything that
touches them.

- **`SAE ARP4761A.pdf` — Appendix Q is the one this work package turns on**: Q.4-1 interdependence
  (an aircraft failure condition is allocated to **system functions**, not systems), Q.4-2 common
  resource × system function, Q.4-6 CoFFE, and the worked fault tree. Also App I (phased-mission
  Markov; §I.3.3.2 interval↔rate equivalence) and App M (CMA per-IP passes) — both on the standing
  deep-read list.
- **`SAE ARP4754B.pdf`** — functional allocation (aircraft function → system function → item), DAL
  assignment and reduction. The authority for "owner = the system that performs the function" and
  for DAL-strictest-across-trees.
- ASTM lane: `F3230-21a …Safety Assessment of Systems and Equipment in Small Aircraft.pdf`,
  `F3061-22b …Systems and Equipment in Small Aircraft.pdf`
- STPA: `System Theoretic Process Analysis (STPA) Standard for All Industries.pdf`
- UAS/SORA: `CS-UAS-Annex-B-MSO-Issue-1.0.pdf`,
  `SORA-v2.5-Annex-E-Release.JAR_doc_28pdf.pdf`, `crd_document-publication.pdf`,
  `d2_-_consolidated_gm-for_publication-02052024.pdf`
- ML assurance: `EASA_AI_Roadmap_2.0.pdf`, the two EASA AI/ML concept papers,
  `NIST_AI_RMF_1.0_AI.100-1.pdf`, `roadmap_for_AI_safety_assurance.pdf`
- HF (public domain): `human_integration_design_handbook_revision_1.pdf`, `NASA-HDBK-870925-14.pdf`

**SAE copyright: clause numbers and titles only, never prose.** NASA/FAA/US-government documents are
public domain — quote freely.

## Standing rules (HANDOFF §1 — non-negotiable)

- **Deploys are Waqas's.** Never run `./build.sh`, `./ship.sh`, or any `wrangler` command — give him
  the command and wait for "deployed".
- **Secrets:** Supabase service-role key never in repo/file/chat; Stripe secret never client-side;
  never touch his passwords/SMTP.
- **Comms:** never send email/comments/DMs — produce copy-paste-ready drafts only. `security@` is
  him-only.
- **English only** (he says "veere"/"bosh" — don't mirror Punjabi).
- **safetylabaero.com:** WebFetch fails PROVENANCE_REQUIRED; NEVER fall back to curl/wget/python for
  that domain — use the Chrome tools.
- **ITAR:** `~/Desktop/04 - System Safety` is never read, staged, or ingested.
- **device_bash cannot delete** — `mv` into a `_to_delete/` subfolder and tell him.
- **SAE copyright:** clause numbers + titles only, never prose.
- **Device commits:** never commit over a device file from a staged copy without matching its
  device-side md5 first (the staging mount once served a truncated file with an unchanged mtime).
  After committing, md5-compare container vs device.
- **HANDOFF discipline:** canonical copy in the repo; mirror to `~/Desktop/bobby handoff.md` in the
  SAME step, every time. Append session-log entries as work lands; record what was verified BY
  EXECUTION, with numbers.

## Working method (earned, not optional)

- **Read the code before proposing. Verify by execution, not grep.** Waqas, 19 Aug: *"before you do
  anything check the live tool and make sure you understand how things currently work."* This caught
  a bug I had asserted and that did not reproduce.
- Test wall before every delivery: `for f in tests/*.test.js; do node "$f"; done` — **156 suites /
  0 real fails** at handoff. Ship nothing on a red wall. (A real failure is a line beginning with
  exactly two spaces then `FAIL` — never grep for bare `FAIL`, it appears inside PASS descriptions.)
- Tests assert **INVARIANTS** (membership, relative order, floors like `>= 71.8`), never index
  positions, counts, or pin literals — pin literals broke twice in one day.
- **Static assertions cannot see runtime behaviour.** Four defects escaped a green wall in one night
  on 19 Aug, all the same shape: correct-looking source the browser could not use. When you add a
  markup builder, add a test that **renders it in a VM and inspects the generated HTML** — see
  section `[0]` of `tests/regression_node_identity_ui.test.js` for the pattern.
- Watch for captured-then-discarded data (5+ instances found this way).
- **Error rate tracks batch size.** Waqas asked directly why we were making so many mistakes; that
  was one of the three answers. Prefer smaller ships with a live verification between them.
- Flag Waqas at task boundaries when your context runs low; he decides push vs fresh.
- AskUserQuestion for real decisions; his rulings are settled — **NEVER re-ask a settled ruling.**

## The mistakes made on 18–19 Aug, and the rule each one bought

Read this section properly. Waqas asked directly — *"why are we making so many mistakes?"* — and the
honest answer had three parts:

1. **Reasoning where measuring was needed.** Most of the list below is one variant or another of
   asserting how the code behaves from reading it, instead of running it.
2. **A test wall made only of static assertions cannot see runtime behaviour.** Four defects escaped
   a green wall in a single night, all the same shape: *correct-looking source the browser could not
   use*.
3. **The error rate tracks batch size.** The worst incidents came out of the biggest batches.

### The escapes that a green wall did not catch

- **Dead CSS selectors.** Sticky header and pinned drag handle did nothing, because every rule was
  written against `.is-modal` and **nothing in the app ever applies that class** — the live selector
  is `#node-config-panel[style*="display: block"]`. The wall passed because it asserted rule *text*,
  not that the selector matches anything.
  → **Assert that a selector matches a live element, not that a rule exists. Every `.is-modal` rule
  must carry its live twin.**

- **A production outage from line-index editing of `index.html`.** A script-tag reorder moved each
  `<script>` but left its `<!--` opening behind, so `misc_fn_modules.js` and `safety_lab.js` ended up
  inside an unterminated HTML comment and never loaded. Everything they declare vanished — `esc`,
  `getActiveFTARoot`, `systemsData`, `acFunctionsData`, `SUPABASE_PROJECT_URL`. Auth failed, the
  cockpits were empty, 1000+ ReferenceErrors pointed at innocent files. The tags returned 200 by
  hand, the files parsed, deployed byte sizes matched `dist`, the wall was green.
  → **NEVER edit `index.html` by line index. Anchored string replacement only.** A guard now exists
  and was proven to fail on the broken file.

- **The invisible editor.** `node_identity_ui.js` read app state through `window[name]`, but the
  state is top-level `let` — global **lexical** environment, not `window`. Every read returned
  `undefined`, `render()` wrote an empty string, and there was **no error anywhere**. Waqas: *"C1
  didnt get shipped i didnt see a modal upon add gate/event."* It had shipped; it just could not see
  anything it needed.
  → **Use `SLEnv.get('name')`. Never `window[name]` for app state.** `eval` would also work and is
  blocked by the CSP.

- **Dropdowns that did nothing.** `onchange="slNodeIdentitySet("kind", this.value)"` — double quotes
  inside a double-quoted attribute. The attribute terminates early, the browser silently discards the
  handler. Forty-five string assertions had passed over that markup because they read the **source**
  and the defect was in the **output**.
  → **Any new markup builder gets a test that renders it in a VM and inspects the generated HTML** —
  copy section `[0]` of `tests/regression_node_identity_ui.test.js`.

### The reasoning-instead-of-measuring mistakes

- **A claimed `deg:` token bug that did not reproduce.** I asserted from reading that exact-string
  matching could never match a `deg:` breach token. Running old and new side by side showed it does.
  Caught only because Waqas said *"before you do anything check the live tool and make sure you
  understand how things currently work."*
  → **Reproduce a bug before fixing it. If it will not reproduce, it is not a bug.**

- **A plan that would have made things worse.** Adding a `partial loss` value to `_COFFE_STATES`
  looked obviously right. Measured live: it takes 676 cases to ~1500 and computes a lane for **none**
  of them, because 0 of 22 rules use the weighted path. Withdrawn.
  → **Measure the blast radius of a data-model change on real project data before proposing it.**

- **Three failed attempts at one CSS fix.** Waqas: *"your fix just moved it to the left."* Root cause
  was structural — a `flex-basis: 100%` cannot break to its own line without `flex-wrap` — and three
  rounds of reasoning about it produced three wrong fixes. Reading `getComputedStyle` on the live
  page found it immediately.
  → **After two failed attempts at a layout fix, stop editing and measure the live DOM.**

- **The boundary rule was built inverted.** The first cut required *both* sides to have an owner, so
  a system branch under an aircraft-level parent reported no boundary — the single shape the rule
  exists for. Caught by the wall, but only because the test was written from the spec rather than
  from the implementation.
  → **Write the test from the requirement, never from the code you just wrote.**

- **Load order wrong.** `mac_lanes.js` and `node_identity.js` were placed *after* their consumer
  `fta_view_modules.js`. Caught by the wall.
  → **A new module gets a load-order assertion in the same commit that introduces it.**

### Tests that passed or failed for the wrong reason

Several checks in the new suites were themselves wrong — one compared
`indexOf('node_identity_ui.js')` against a **comment** rather than the script tag, and pin checks
compared literals (`parseFloat('72.10') === 72.1` bites here).
→ **Prove a new check by breaking the thing it guards and watching it go red.** A check that has
never failed has never been tested. And **assert pins as floors, never literals.**

### Harness artefacts nearly reported as product bugs

`handleWired: false` — because the probe called `selectNode()` instead of
`openNodePropertiesModal()`. A `SUPABASE_PROJECT_URL` "ERR" — because the probe was wrapped in
`eval()` and the CSP blocks eval.
→ **When a live probe reports something alarming, suspect the probe first.** Confirm with a second,
differently-shaped probe before telling Waqas anything is broken.

### And the standing conclusion

**Build the runtime smoke gate in `ship.sh` before shipping another feature.** ~20 lines of
Playwright — headless load of the deployed page, no uncaught errors at boot, key globals defined,
auth initialises, drawer opens, identity block renders. It would have caught all four escapes above.
It is item 0 on every list in this repo for that reason.

Also: **Cloudflare's SPA fallback returns 200 + the ~340KB app shell for any missing file**, so
"the file is there, it returned 200" proves nothing. Verify deploys with a **byte-size** control
probe.

## Code map — enough to know where to look

219 JS files in `site/`, all **classic scripts** (no modules, no bundler), 203 `<script src=>` tags
in `index.html`, minified into `dist/` by `build.sh`. Cross-file globals resolve by name, which is
why the build never uses `--minify-identifiers`.

Enumerate with `ls -S site/*.js`. The ones this work package touches:

| File | Role |
|---|---|
| `index.html` | every script tag + its `?v=` cache-buster pin. **Never edit by line index.** |
| `safety_lab.js` | app bootstrap, Supabase config, the top-level `let` state declarations |
| `helpers_modules.js` | `addSelectedGate` / `addSelectedEvent`, `idpCell`, `idpContributors`, numbering call sites |
| `fta_view_modules.js` | canvas, `selectNode`, the node-properties drawer |
| `misc_fn_modules.js` | CoFFE (`coffeComputed`, `coffeShortestRoute`, `coffeCoverage`, `coffeGraft`, …) |
| `assurance_modules.js` | `AutoReq.generate`, `genFTAEvents` / `genDALgebra` / `genGateIndependence`, `walkPagesInScope`, `unownedPages` |
| `mac_lanes.js` | MAC three-lane derivation. Pure, tested, **called by nothing yet** |
| `node_identity.js` | the node coordinate + ownership rules (`resolveOwner`, `crossesBoundary`, `sweepTree`) |
| `node_identity_ui.js` | the identity editor — ONE builder, TWO mounts (drawer + creation dialog) |
| `sl_env.js` | read-only bridge to the app's lexical globals. Loaded AFTER `safety_lab.js` |
| `numbering.js` | `SafetyLabNumbering.makeSharedId` — generated ids come from here, never a hardcoded prefix |
| `ai_loader.js` | lazy AI lane; has its own `FILES` array of pinned filenames — bump pins **here too** |

Load order matters and is a real source of bugs: `mac_lanes.js`, `node_identity.js` and
`node_identity_ui.js` load **before** `fta_view_modules.js` (a consumer); `sl_env.js` loads **after**
`safety_lab.js` (it closes over that file's declarations).

## Code gotchas (each cost real time — do not relearn)

- **Bare identifiers for app stores.** `acFcimData`, `acFhaData`, `ftaPages`, `selectedNodeData`,
  `systemsData`, `projectConfig`, `Review` etc. are top-level `let`/`const` — global **LEXICAL**
  scope, **NOT** on `window`. `window[name]` reads `undefined` and fails **silently**. That is what
  `sl_env.js` exists for; use `SLEnv.get('name')`. Test harnesses must seed stores via a `let`
  prelude script in vm (NOT context properties) or they cannot catch this bug class.
- **CSP `script-src` forbids `eval`** — no `Function()`-based live patching, and no eval workaround
  for the lexical-globals problem.
- **Never edit `index.html` by line index.** Anchored string replacement only. A line-index reorder
  once left `<!--` openings behind, put two modules inside an unterminated comment and took the app
  down while every static check stayed green.
- **Cloudflare's SPA fallback returns 200 + the ~340KB app shell for any missing file.** Verify a
  deploy with a **byte-size** control probe, never a bare 200.
- **CSS:** `.is-modal` is dead — nothing applies it. The live drawer selector is
  `#node-config-panel[style*="display: block"]`; every `.is-modal` rule needs its live twin. Also:
  `flex-basis:100%` cannot break a line without `flex-wrap`; `position:absolute;top:0;bottom:0`
  inside a scroll container spans only the first screenful; flexbox `min-height:auto` stops an
  `overflow-y:auto` child scrolling; use `overscroll-behavior: contain` to stop scroll chaining.
  Measure widths with `offsetWidth`, not `getBoundingClientRect().width` (scaled pixels — 684 vs 759
  live).
- **Minified live markers:** only STRING LITERALS and BEHAVIOR survive the build. Numbers reformat
  (16000→16e3); local identifiers rename; comments strip.
- **TOML ordering:** top-level keys BEFORE any `[[table]]` — wrangler silently drops a key placed
  after a table.
- **Python heredoc edits:** an assert-abort leaves the file UNWRITTEN while later shell commands
  still run — verify each edit landed; keep cwd absolute.
- **Retry loops:** cap them and fail fast on non-transient errors.
- **`grep -c` counts lines, not matches.** Check patterns individually.
- **Load order:** `invariants.js` at index ~4048 — modules loading earlier need retry-registration
  for `invRegister`; `fcim_combined` (4083) and later are safe. `eula_modal` defines `checkEula`
  after `auth_gate` may call it — the 4s self-check net covers it.

## Environment & infra map

- Repo: `~/Desktop/safety-lab-deploy` (`site/` = source, `dist/` = minified build, `tests/`,
  `tools/a15/`). Desktop app repo: `~/Desktop/safety-lab-desktop` (Electron, `sync-app.sh` pulls
  `site/` into `app/`).
- Cloudflare: the SITE worker is `black-recipe-1776` (repo-root `wrangler.jsonc` — a bare
  `wrangler deploy` anywhere in the repo resolves to IT; the a15 worker deploys ONLY with
  `wrangler deploy -c ~/Desktop/safety-lab-deploy/tools/a15/wrangler.toml`). AI proxy on
  `api.safetylabaero.com`; corpus worker `safetylab-corpus` on `api.safetylabaero.com/v1/corpus/*`
  (R2 `safetylab-corpus`); desktop updates on `updates.safetylabaero.com/desktop/` (R2
  `safetylab-downloads`).
- **CSP connect-src allowlist:** self, the Supabase pair, api.safetylabaero.com, api.anthropic.com,
  api.voyageai.com, electra.jamacloud.com, cdnjs, jsdelivr. Nothing else connects — a new endpoint
  must ride an allowlisted host or the CSP changes deliberately.
- Cloudflare edge caches `/app/` HTML for a TTL: after a deploy the page may load OLD pins while
  module URLs already serve NEW content. `fetch(cache:'no-store')` does NOT bypass the edge cache.
  Self-heals in minutes; his dashboard purge if urgent.
- Zone routes take ~1–3 min to propagate — a 404's ERROR SHAPE tells you which worker answered
  (api proxy: `{"error":{"type":"not_found"…}}`; corpus: flat).

## Live-verification recipe (Chrome tools)

1. `tabs_context_mcp` first; reuse his app tab only for the app.
2. Control probe: fetch a missing file — 200 + text/html + ~340KB fallback; a real module returns
   text/javascript. **Compare byte sizes, not status codes.**
3. Check served modules by string-literal markers on the NEW `?v=` URLs.
4. Exercise features **by execution in the page** (temp in-memory fixtures restored in the SAME
   synchronous script; never `_save()`/submit test data; reload-persistence check after intentional
   writes).
5. His browser data-guard sometimes blocks tool results containing query strings/digits — mask
   digits or use a plain tab + `get_page_text`.
6. The 20-min idle lock signs him out — a signed-out page correctly shows no gates; ask him to sign
   in rather than assuming a regression.
7. Beware harness artefacts that look like bugs: calling `selectNode()` instead of
   `openNodePropertiesModal()` reports `handleWired: false`; probing a global inside a function
   wrapped in `eval()` reports ERR because the CSP blocks eval, not because the global is missing.

## The wall & delivery loop (every build)

edit → `node --check` each touched file → run the new suite → full wall → bump pins (`index.html`
**and** the `ai_loader` FILES array; new modules get their own `?v=`) → HANDOFF entry + header
counts + mirror copy → `SendUserFile` → `device_commit_files` → md5 compare → give him
`cd ~/Desktop/safety-lab-deploy && ./ship.sh` → on "deployed", live-verify → seal the HANDOFF entry
as VERIFIED LIVE → sync again.

## Current state (19 Aug 2026)

Wall **156 suites / 0 real fails.** Live and verified on the deployed build: `node_identity` 1.0 ·
`node_identity_ui` 1.3 · `sl_env` 1.0 · `mac_lanes` 1.0 · `helpers_modules` 2.38 ·
`fta_view_modules` 66.30 · `misc_fn_modules` 66.31 · `assurance_modules` 1.20 · `safety_lab.css`
65.48 · `safety_lab.js` 65.41.

Shipped this session: the node-properties drawer rebuild (vertical stacking, scroll containment,
sticky header, viewport-pinned resize handle); a whole-app panel audit via a new static scanner
(36 findings, 35 fixed, standing invariants suite); requirement-generator scope filtering;
`mac_lanes.js`; and **C1 — structured node creation**, live and verified.

Not started: the **NAV overhaul** (plan in `NAV_V2_PLAN.md`, mockups in `docs/nav_*.html`). Aeolus
HL-1 will be reworked with the demos overhaul, so the measured numbers in the work package are a
snapshot, not a defect list.

## THE TASK

Work section 9 of `WORK_PACKAGE_MAC_CoFFE_Structured_Trees.md`, in order:

**0. The runtime smoke gate in `ship.sh` — before any feature.** ~20 lines of Playwright: headless
load of the deployed page, assert no uncaught errors at boot, assert the key globals are defined,
assert auth initialises, open the drawer, assert the identity block renders. Four defects escaped a
green wall in one night and this would have caught all four. Accept it when reintroducing any one of
them turns the gate red.

**1. A2 + A4 together — bucket by the declared owner, with the in-place `reqSource.sourceId`
migration.** `node.identity` now exists on every structured node; make `genFTAEvents` read it
instead of inferring ownership. A2 without A4 orphans every affected requirement and loses
verification status, evidence and manual edits — they ship together or not at all. Reproduce on a
project with real systems (Aeolus/Halcyon); the four-tree demo cannot show this defect.

**2. A1 — surface `unownedPages()`.** Cheapest item on the register, no new data model.

Then B6+A10 (the system→function granularity migration, both artefacts together), B3 (tree
generation from the MAC lanes — the visible win), B4 (CoFFE consumes MAC). Full acceptance criteria
for each are in section 9.

**Three rulings are open and must come from Waqas, not from you** — A12 (resource consumption vs
contribution), B5 (self-checking/cross-comparison arbitration), and when the closure block switches
on for legacy projects. Section 10 of the work package states each one and the leaning.
