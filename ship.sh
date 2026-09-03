#!/usr/bin/env bash
# =============================================================================
# ship.sh — the ONE deploy path for Safety Lab Aero.
#
# Green-gated: runs the full wall, REFUSES to deploy if any suite reports a real
# failure, then builds and deploys. Supersedes the two competing commands that
# were living in the handoffs:
#
#   • the bare `./build.sh && npx wrangler deploy -c wrangler.dist.jsonc`
#     (no gate — ten days of assertion drift shipped behind it unnoticed)
#   • the green-gated one-liner in SESSION_HANDOFF_2026-07-22.md
#     (right idea, never made the default)
#
# Do NOT use the old ./deploy.sh — it copies from a Claude outputs folder and can
# ship stale files.
#
# Usage:
#   ./ship.sh          wall, build, runtime smoke gate, deploy — each gating the next
#   ./ship.sh --dry    run the wall only; never build, never deploy
#   ./ship.sh --smoke  build and run the runtime smoke gate only; never deploy
#
# The runtime smoke gate needs a Chrome/Chromium/Edge on this machine (it drives it
# over the DevTools Protocol — no Playwright, no npm install). If it cannot find
# one it FAILS rather than skipping. Point it somewhere with CHROME_PATH, or
# override knowingly with SMOKE_SKIP=1.
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")"

DRY=0
SMOKE_ONLY=0
[ "${1:-}" = "--dry" ] && DRY=1
[ "${1:-}" = "--smoke" ] && SMOKE_ONLY=1

LOG=$(mktemp /tmp/sla-wall.XXXXXX)

echo "── wall ─────────────────────────────────────────────"
COUNT=0
CRASHED=""
CRASHES=0
for t in tests/*.test.js; do
  [ -e "$t" ] || continue
  echo "### $t" >> "$LOG"
  node "$t" >> "$LOG" 2>&1
  RC=$?
  COUNT=$((COUNT + 1))
  # 20 Aug 2026 — the exit code used to be DISCARDED. The gate grepped only for
  # "  FAIL  " lines, so a suite that threw on load printed a stack trace, emitted no
  # FAIL line, and was counted as run-and-clean. Two suites had been dead for a day
  # that way (regression_req_bucketing and regression_ccmr_pairtrace, both killed by a
  # helper added to assurance_modules) and four builds shipped behind a green wall that
  # was not running them. A suite that cannot start is not a suite that passed.
  if [ $RC -ne 0 ]; then
    if ! tail -n 200 "$LOG" | grep -qE '^  FAIL  '; then
      CRASHES=$((CRASHES + 1))
      CRASHED="$CRASHED $t"
      echo "  CRASHED  exit $RC — suite did not run to completion" >> "$LOG"
    fi
  fi
done

# House style: a real failure is a line beginning with exactly two spaces + FAIL.
# Bare "FAIL" also occurs inside PASS descriptions — never grep for it unanchored.
FAILS=$(grep -cE '^  FAIL  ' "$LOG" || true)

echo "suites run : $COUNT"
echo "real fails : $FAILS"
echo "crashed    : $CRASHES"

if [ "$CRASHES" != "0" ]; then
  echo
  echo "── suites that could not run ────────────────────────"
  for c in $CRASHED; do
    echo "  $c"
    awk -v s="$c" '$0=="### "s{f=1;next} /^### /{f=0} f' "$LOG" | grep -E 'Error|error:' | head -2 | sed 's/^/      /'
  done
  echo
  echo "NOT DEPLOYING — $CRASHES suite(s) failed to run. A suite that cannot start has not passed."
  echo "Full log: $LOG"
  exit 1
fi

if [ "$FAILS" != "0" ]; then
  echo
  echo "── failing checks ───────────────────────────────────"
  awk '/^### /{s=$2} /^  FAIL  /{print "  " s; print "    " $0}' "$LOG"
  echo
  echo "NOT DEPLOYING — $FAILS real failure(s)."
  echo "Full log: $LOG"
  exit 1
fi

echo "WALL GREEN"

if [ "$DRY" = "1" ]; then
  echo "(--dry: stopping before build)"
  rm -f "$LOG"
  exit 0
fi

echo
echo "── build ────────────────────────────────────────────"
if ! ./build.sh; then
  echo "BUILD FAILED — not deploying."
  exit 1
fi

if [ "$SMOKE_ONLY" = "1" ]; then
  echo
  node tools/smoke/smoke_gate.js
  RC=$?
  echo "(--smoke: stopping before deploy)"
  exit $RC
fi

echo
# Item 0 of the build list, and the reason is four defects in one night (19 Aug
# 2026), every one of them correct-looking source the browser could not use, and
# every one of them straight through a green wall of static assertions. This opens
# the BUILT page in a real browser before the deploy goes out. Red gate, no deploy.
#
# Deliberately gates ./dist and not the deployed URL: a check that loads production
# can only run once production already has the bad build.
if ! node tools/smoke/smoke_gate.js; then
  echo
  echo "NOT DEPLOYING — the runtime smoke gate is red."
  echo "The wall was green, so this is the class of defect the wall cannot see:"
  echo "source that reads correctly and that the browser cannot use."
  exit 1
fi

echo
echo "── deploy ───────────────────────────────────────────"
npx wrangler deploy -c wrangler.dist.jsonc
RC=$?

rm -f "$LOG"
if [ "$RC" = "0" ]; then
  echo
  echo "Deployed.  https://safetylabaero.com/app"
  echo "Verify with a byte-size control probe, not a bare 200 — the Cloudflare"
  echo "SPA fallback returns 200 + the app shell for any missing file."
fi
exit $RC
