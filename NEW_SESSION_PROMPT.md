# Safety Lab Aero: new-session briefing (rewritten 23 Sep 2026; replaces the 19 Aug version)

Waqas pastes the short prompt at the bottom of this file into a fresh session. Everything above it
is what that session must read, connect and understand BEFORE it changes a single file.

---

## 0. The standard, in his words. Read it twice.

> "No half ass fixes / measures." "We always go for the gold star implementation, we are not going
> to be a company with a tonne of bugs." "If anything needs rebuilding we do that now." (6 Sep 2026,
> said three times)

What that means in practice, as it has been enforced:

- **Rebuild when the thing is wrong; do not patch around it.** A fix aimed at the one example in a
  report instead of the whole class of problem is a half measure (S29: RLS was fixed on the five
  tables an audit named and left open on the nineteen it did not).
- **Measure, then propose.** Every proposal carries a number from the running app. On 23 Sep a
  "compute on every edit" pass was proposed from reading code; the measurement showed 30 real edits
  cost 30 ms even at 100x project size. The proposal was wrong and cost an hour to find out.
- **Every change arrives with a test that fails without it** (break the guarded thing, watch it go
  red, restore it).
- **Nothing is "done" until it is verified on the served build**, by execution, with numbers.
- **Say the plan and the time before anything longer than ten minutes, then report at that time.**
  On 23 Sep he had to ask "what's going on" four times during two silent hour-long runs. That does
  not happen again (WORKING_RULES rule 31).

## 1. How to talk to Waqas (standing rules, all his)

- **Plain language, no jargon, every response.** Explain simply even on deep technical work.
- **State back how you understood the request and get his confirmation before acting** on anything
  non-trivial. A one-line "understood as X, doing Y" is enough when the ask is clear.
- **Deploys are his.** Every delivery ends with the command on its own line:
  ```
  cd ~/dev/safety-lab-deploy && ./ship.sh
  ```
  You may run `./ship.sh --dry` (the test wall only, never builds or deploys). Never run
  `./ship.sh`, `./build.sh` or any `wrangler` command yourself.
- **Never offer breaks or suggest stopping.** He says when to stop. School pickup and dinner pause
  him mid-afternoon (Denver time); keep working through it.
- **Autonomous between check-ins, a message at each decision point, honest status including cost.**
- **Never re-ask a settled ruling.** Rulings live in HANDOFF.md, OPEN_ITEMS.md and DECISIONS_*.md.
- American English everywhere ("math", not "maths"). No em dashes in customer-facing text.
- No customer names in anything public ("everybody is under an NDA"). Radia is never named in the
  demo.

## 2. Hard rules (security, data, money)

- **"I don't want their data on our cloud, at any point."** The hosted site is for trials, demos and
  internal use only. Real customers run one of three doors: their own backend, the desktop app, or
  browser-only local mode. **Never train on customer content, period.**
- **Production database (`fhrqkhdrwbfnizkepkch`) changes only by a migration file that ran first on
  the throwaway (`yiisexbngnjakkqkmctw`)**, verified there, then applied to production on his word,
  then verified again. File the migration in `supabase/migrations/` AND bundle it in
  `customer-install/db/` with `apply.sh` wired, in the same commit.
- **Secrets never in the repo, a file, a chat or a document.** Signing keys stay on his Mac only
  (`~/.safetylab/`); Claude never handles certificates or credentials. The service-role key is never
  used client-side.
- **ITAR:** `~/Desktop/04 - System Safety` is never read, staged or ingested.
- **Publishing to the public desktop update channel needs his explicit permission.**
- **Never delete a data store to clean it up** (rule 26). Deletion in his folders needs a per-session
  permission; ask once, say why.
- **SAE standards are copyrighted: clause numbers and titles only, never prose.** US-government
  documents (NASA, FAA) are public domain.
- **Never send email, messages or comments.** Produce paste-ready drafts; he sends.
- **safetylabaero.com from the cloud container:** use the Chrome tools, not curl/wget/python, when
  WebFetch refuses the domain. (23 Sep slip: served-byte checks were done with curl. Do not repeat.)

## 3. What to connect to, and what each is for

Check each at the start; if one is missing, say so plainly and do what the others allow.

| Connection | What it gives you | Notes |
|---|---|---|
| **His Mac, via the Claude desktop app** | a shell (`device_bash`) on the connected folders | Folders: `~/dev/safety-lab-deploy`, `~/dev/safety-lab-desktop`, `~/dev/safety-lab-proxy-deploy`, `~/Desktop`, `~/Downloads`. **Work on the files where they are**; edit in place with anchored python read-modify-write. Stage to the cloud only for a browser run or an image. The link drops sometimes: stop, say so, never guess. |
| **Delete permission** (per session) | lets git remove its own `.git/index.lock` | Without it every commit after the first fails on a stale lock. Request it once for the repo you commit in. |
| **Supabase MCP** | read and migrate production + the throwaway | Rule above. Read-only census is always fine. |
| **Claude in Chrome** (his real browser) | live verification on safetylabaero.com, Search Console, Bing, GitHub | Signed in as mwnafees9. Never type passwords or keys. |
| **GitHub** `github.com/mwnafees9-png` | off-machine copy of all three repos | `gh` is authed on his Mac. `ship.sh` pushes after every green deploy. Desktop and proxy repos: `git push` by hand after each commit. |
| **Cloud container Chromium** `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` | the runtime tab sweep and timing probes | `CHROME_PATH=<that> SWEEP_OFFLINE=1 node tools/sweep/tab_sweep.js --src`, needs `worker.js` beside `site/`. A full sweep takes about 25 minutes; say so before starting. Offline, every click logs the realtime websocket failure; that is noise, not a bug. |
| **Cloudflare dashboard** | zone settings, redirect rules | His. Give click-by-click steps; never ask for a token. |

Standards PDFs live in `~/Desktop/Downloads from Data Migration/`: `SAE ARP4761A.pdf` (Appendix Q
is the one the product turns on), `SAE ARP4754B.pdf`, ASTM `F3230-21a` and `F3061-22b`, STPA,
`CS-UAS-Annex-B`, `SORA-v2.5-Annex-E`, `EASA_AI_Roadmap_2.0`, the EASA ML concept paper,
`NIST_AI_RMF_1.0`, `NASA-HDBK-870925-14`. Read the relevant clauses before designing anything that
touches them. Do not work from memory of a standard.

## 4. Read before touching anything, in this order

1. **This file**, fully.
2. **`WORKING_RULES.md`** (31 rules, every one paid for). Rules 4, 5, 13, 14, 17, 26, 27, 28 and 31
   are the ones broken most often.
3. **`HANDOFF.md`, the top ~300 lines.** Newest first; the recent entries are the live state.
   Search it for older context; it is 5,500+ lines.
4. **`OPEN_ITEMS.md`** from the top down to the 14 Sep reconciliation. It is the register; update it
   in place.
5. **`BUILD_STATE_2026-09-14.md`**: the evidence table of what is built and what is not.
6. **The code you will touch, its callers, its consumers, and its wrappers** (rule 17). Eleven
   modules wrap app functions by name (see `site/fn_wrap.js` and `site/lazy_render.js` headers); a
   change to a wrapped function without reading its wrappers is how 23 Sep's first measurement
   still cost 608 ms.
7. **The product, live**: open safetylabaero.com/app in Chrome, load the sample project, click
   through the Aircraft FHA, a System Folder, the fault trees and PASA before proposing a change to
   any of them (rule 3).

## 5. The code in one page

- **Three repos, side by side in `~/dev`** (tests reach sibling repos by `../` paths):
  `safety-lab-deploy` (web app, site, workers, migrations, customer install kit),
  `safety-lab-desktop` (Electron shell, pulls the web bundle into `app/`),
  `safety-lab-proxy-deploy` (the AI proxy worker; the one place a user's secret is read).
- **`site/`**: 255 classic scripts (no modules, no bundler), 235 `<script>` tags in `index.html`,
  each pinned with `?v=`. `build.sh` minifies into `dist/` with an allowlist. Cross-file globals
  resolve by name, so identifiers are never minified.
- **App state is top-level `let`**, global lexical scope, NOT on `window`. `window[name]` reads
  `undefined` silently. Use `SLEnv.get('name')` (rule 5). The CSP forbids `eval`.
- **Never edit `index.html` by line index** (rule 4). Anchored replacement only. Bump the `?v=` pin
  of every touched module (pins are floors, rule 12); `ai_loader.js` has its own pinned FILES list.
- **Edit signal:** every change funnels through `scheduleAutosave()` (misc_fn_modules); `save_watch.js`
  catches writers that forget it. **Tab switching:** `switchTab()` (support_modules) shows one view
  and calls its renderer; `pasaSub()` does the same inside PASA.
- **`lazy_render.js`** (23 Sep): 15 renderers start with `SLLazy.defer(host, name, arguments)` and
  do nothing while their view is hidden; the pending render runs on arrival. 11 wrapper modules ask
  `SLLazy.skipped(host)`. A new renderer on a hidden view should follow the same pattern;
  `tests/regression_lazy_render.test.js` pins the list.
- **Workers:** the site worker `black-recipe-1776` (`worker.js`, repo root) owns routing, headers,
  CSP, canonical redirects and the 404; the AI proxy is on `api.safetylabaero.com`.
- **Generated, never hand-edited:** the agreement (`legal/build_agreement.mjs` writes
  `site/eula_modal.js`, the static `/legal` page, the desktop copies; rule 28), the site footer
  (`tools/seo/footer.mjs`), the sitemap (`tools/seo/sitemap.mjs`). Edit the generator, run it.
- **Cloudflare's asset fallback no longer hides missing files** (worker owns it since 14 Sep), but
  still verify a deploy by byte size and string markers in the served file, not by a 200 (rule 13).

## 6. The delivery loop, every time

1. Understand and state back. 2. Read the code (section 4 item 6). 3. Measure the current behavior.
4. Change the code. 5. `node --check` each touched file. 6. Write or extend the test from the
requirement; break the guarded thing to prove it goes red. 7. `./ship.sh --dry` must say
`WALL GREEN` (326 suites / 0 fails / 0 crashed as of 23 Sep). 8. Bump pins. 9. For anything that
renders or runs in the browser, prove it in Chromium (sweep or a targeted probe) with numbers.
10. Commit in his name with the session attribution lines. 11. HANDOFF entry on top, register
updated in place. 12. Give him the ship command. 13. After "deployed": verify the served files and
the behavior live, and say what you checked.

## 7. Where things stand (23 Sep 2026, evening)

**Live and verified today:** SEO fixes (canonical redirects, real 404, static /legal, FHA and Medini
comparison pages, privacy policy, one generated footer, sitemap resubmitted to Google and Bing);
lazy render (the render fan-out of 20 off-screen edits went from 2,093 ms to 3 ms); dead `ai_usage`
table dropped in production (verified, 7 licences intact); GitHub remotes on all three repos.

**Measured today and NOT yet acted on (the next task):** the time now goes into **opening tabs**,
not editing. At normal sample size: Items 0.76 s, PASA 0.74 s, Aircraft FHA 0.55 s, Dashboard
0.38 s, Fault trees 0.36 s; one FHA edit on the FHA tab 0.17 s (the whole table is rebuilt for one
row). **Unresolved:** a probe that inflated the sample 5x, 20x and 100x never returned when
switching tabs. Either the harness or the app stalls on a big project; nobody knows yet, and
"project sizes will be enormous" is his directive. The three probes are kept in `tools/perf/`
(`probe_arrive.js <repo> <scale>` is the one that stalled; run it in the cloud Chromium with the
site copied across, and time-box it).

**Open, needing Waqas:** rotate `notify_hook_secret` (it appeared in a chat screenshot); Cloudflare
"Always Use HTTPS" toggle (optional; the worker already redirects); desktop 0.18.3 sign-in test and
the Windows build; the Apple Developer ID certificate for signed desktop updates (S24).

**Open, buildable:** the tab-arrival work above; migration capture (the other half of S12);
requirements write-back (A12, ruling needed on consumption vs contribution); the sweep's websocket
noise filter; thin-browser and air-gapped tiers (S19, S21; parked, no customer asking).

---

## The prompt to paste into the new session

```
You are picking up Safety Lab Aero engineering work. Before you change any file:

1. Read ~/dev/safety-lab-deploy/NEW_SESSION_PROMPT.md in full. It holds my standards, my rules,
   what to connect to, and the current state. The standard is no half measures: gold star
   implementation, rebuild what is wrong, measure before proposing, verify live.
2. Check every connection it lists and tell me which are up and which are not.
3. Read WORKING_RULES.md, the top of HANDOFF.md, and OPEN_ITEMS.md as it tells you to.
4. Open the live app and look at the parts the next task touches.
5. Then tell me, in plain language, what you understand the next task to be, how you would
   approach it, how long it will take, and what you will measure. Wait for my go.

Anything longer than ten minutes: tell me the plan and the time first, and report at that time.
```
