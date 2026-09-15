# Radia-ready runbook — what to run at the Mac

Written 15 Sep 2026. Target: Radia can install a current, secure desktop app on Mac or Windows,
stand up their own database and AI key from SL-DG-0001, and draft a real FHA on their own
infrastructure with nothing touching Safety Lab's cloud.

Your Mac is the bottleneck this week. Everything below needs it. Everything NOT below is mine.
Run the sessions in order; A protects B.

---

## Session A — back the company up (15 minutes, do this first)

No repo has a git remote. The web app, the desktop shell, the AI proxy, the install kit and
every migration exist only on this Mac. Until this is done, every other step is unprotected work.

All three repos are on branch `master` and are clean as of this writing.

With the GitHub CLI:

```
gh auth login                                  # once, if not already
cd ~/dev/safety-lab-deploy        && gh repo create safety-lab-deploy        --private --source=. --remote=origin --push
cd ~/dev/safety-lab-desktop       && gh repo create safety-lab-desktop       --private --source=. --remote=origin --push
cd ~/dev/safety-lab-proxy-deploy  && gh repo create safety-lab-proxy-deploy  --private --source=. --remote=origin --push
```

Without it: create three PRIVATE repos in the browser, then per repo:

```
cd ~/dev/<repo> && git remote add origin git@github.com:<you>/<repo>.git && git push -u origin master
```

Check: `git remote -v` prints an origin in each, and the commit count on GitHub matches
`git rev-list --count HEAD`.

Note `.gitignore` already refuses `*.lic` and signing keys, so no private key leaves the Mac.

---

## Session B — desktop 0.18.0, both platforms (60–90 min, mostly waiting)

**Why this is the top Radia blocker.** The live update channel serves **0.15.0 from 28 August** on
both Mac and Windows. That is the build from BEFORE the 6 September security rebuild: it hands
itself a pro-plus tier, walks past the sign-in gate, has no network fence, and carries the old
two-writer cloud path with the save/sync data-loss race. Anyone Radia asks to install today gets
that. Version 0.17.0 was built here on 13 Sep but never uploaded.

**Why 0.18.0 and not republish 0.17.0.** The 0.17.0 artifacts in `dist/` were built against web
commit `0e0d3f1`. The web is now 37 commits further on (S4, S5, S6, S10, R10, the R19 sweep).
Rebuilding under the same version number would put different bytes behind a version the channel
has already described. Bump.

### B1. Bump the version

```
cd ~/dev/safety-lab-desktop
npm version 0.18.0 --no-git-tag-version
```

### B2. Build Windows FIRST (Docker Desktop must be running)

```
bash build-win-docker.sh
```

This script was dead until today — it called `sync-app.sh`, which the September rebuild deleted,
so it exited at step one every time. It now runs the same gates as `release.sh`: pull-web (web
tree clean + web wall + build.sh + smoke gate + stripped bundle) then the desktop wall on the
host, then electron-builder in the Wine container. First run pulls a ~2 GB image.

**Windows must be built before the publish.** `publish-desktop.sh` uploads and cryptographically
signs whatever `dist/latest.yml` it finds. That file currently says 0.15.0. Publish a Mac-only
build and the stale Windows feed goes out freshly signed as current, which tells every Windows
user they are up to date on the August build.

### B3. Build macOS

```
./release.sh
```

### B4. Publish once, both platforms together

```
bash publish-desktop.sh
```

Requires `~/.safetylab/update_signing_key.pem` (you created it 14 Sep) and a live `wrangler login`.
It signs `latest-mac.yml` and `latest.yml`, uploads signatures before manifests, and refuses to
publish an unsigned feed.

### B5. Verify from outside

```
curl -s https://updates.safetylabaero.com/desktop/latest-mac.yml | head -2
curl -s https://updates.safetylabaero.com/desktop/latest.yml     | head -2
curl -sI https://updates.safetylabaero.com/desktop/latest-mac.yml.sig | head -1
curl -sI https://updates.safetylabaero.com/desktop/SafetyLabAero-win-x64.exe | head -1
```

Both feeds must read `version: 0.18.0`. The `.sig` must be 200 — it is 404 today, meaning the
signed-manifest lock built on 14 Sep has never actually been exercised in production.

Then install the Mac .dmg yourself and confirm: the licence gate appears, sign-in is required,
Settings shows the three backend choices, and Help → About This Build names a web commit from
today, not `0e0d3f1`.

---

## Session C — the AI key (5 minutes of yours)

Paste me one Anthropic key, ideally a fresh one scoped to this with a low spending cap so it can be
revoked after. I will stand the packaged proxy up in offline-licence mode against the throwaway
Supabase and run a real FHA draft end to end.

This is the last unproven link in the guide's main path. The database half is proven twice; the AI
half has never run. It gates SL-DG-0001 leaving Draft, the SL-WP-0003 whitepaper hold, and any
honest statement that self-hosted works. It also matters more than it looks: a per-user pasted key
cannot work on a customer's own server or in the desktop app — the egress allowlist blocks it by
design — so the packaged proxy is the ONLY AI path a real customer has.

---

## What I do while you run the above

- Credentials vault phases 3 and 4 — Jama username/password and AI keys out of browser storage and
  into the server-side vault. This is what a Radia security reviewer will actually poke at.
- Regenerate the demo data so SFHA rows point at functions that exist. They will open a demo project
  before they open anything else.
- Erasure gaps and proxy hygiene.
- Lift SL-DG-0001 out of Draft once Session C proves the path it describes.

---

## Not this week, and I would not pretend otherwise

The enterprise block (activity log, classification labels, retention, admin controls, data receipts,
customer-managed keys) is weeks of work. Native code-signing certificates are procurement with a
multi-week lead time, so first launch keeps its right-click-Open on Mac and its SmartScreen notice
on Windows. Both are fine for a trial; neither is fine for a signed enterprise agreement, and they
should be named in the Radia conversation rather than discovered by their reviewer.
