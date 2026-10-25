#!/usr/bin/env bash
# Is the desktop app's bundle the web build that just went live?  (25 Oct 2026)
#
# Waqas: "why does it say desktop is current with this build?" It said so after shipping 94 changed files
# that were not committed: the old check compared commit ids only, and the desktop's recorded web commit
# was still HEAD, so uncommitted (shipped) work was invisible to it. The desktop ships only what git
# holds (pull-web.sh refuses a dirty tree), so the question is about CONTENT: do the site files that went
# live differ from the site files at the commit the desktop last pulled? Tracked changes since that commit
# (committed or not) and new untracked site files all count; a commit that touches nothing under site/
# (notes, tests, tools) does not make the desktop stale.
#
# Usage: tools/desktop_drift.sh [web repo dir] [desktop repo dir]   (defaults: this repo, ../safety-lab-desktop)
# Prints one verdict. Never fails (exit 0): ship.sh runs it after the deploy is already out.
WEB="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
DESK="${2:-$(cd "$WEB/../safety-lab-desktop" 2>/dev/null && pwd || true)}"
BI="$DESK/app/BUILD_INFO.json"
if [ -z "$DESK" ] || [ ! -f "$BI" ]; then echo "NOTE: no desktop repo beside this one; skipping the desktop drift check."; exit 0; fi
DESK_WEB="$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).webCommit||"")}catch(e){}' "$BI")"
DESK_AT="$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).pulledAt||"")}catch(e){}' "$BI")"
if [ -z "$DESK_WEB" ]; then echo "NOTE: desktop BUILD_INFO.json records no webCommit; cannot tell how old the desktop build is."; exit 0; fi
if ! git -C "$WEB" cat-file -e "${DESK_WEB}^{commit}" 2>/dev/null; then echo "NOTE: the desktop pulled web ${DESK_WEB:0:7}, which is not in this repo's history."; exit 0; fi
# the site files that differ from the desktop's commit: tracked (committed since, or not committed) + new untracked
CHANGED="$( { git -C "$WEB" diff --name-only "$DESK_WEB" -- site/; git -C "$WEB" ls-files --others --exclude-standard -- site/; } | sort -u )"
N="$(printf '%s\n' "$CHANGED" | grep -c . || true)"
if [ "${N:-0}" = "0" ]; then
  echo "Desktop app is current with this build (its bundle holds the same site files)."
  exit 0
fi
COMMITS="$(git -C "$WEB" rev-list --count "$DESK_WEB"..HEAD 2>/dev/null || echo 0)"
DIRTY="$( { git -C "$WEB" status --porcelain -- site/; } | grep -c . || true)"
echo "DESKTOP IS BEHIND: $N site file(s) went live that the desktop app does not have."
echo "  Last desktop release pulled web ${DESK_WEB:0:7} on ${DESK_AT:-an unknown date}; $COMMITS commit(s) since."
[ "${DIRTY:-0}" != "0" ] && echo "  $DIRTY of them are not committed: the desktop takes only committed work, so commit them first."
printf '%s\n' "$CHANGED" | head -8 | sed 's/^/    /'
[ "$N" -gt 8 ] && echo "    ...and $((N - 8)) more"
echo "  Customers on the Mac and Windows app are NOT running what just went live."
echo "  Cut a current desktop build:  cd ../safety-lab-desktop && ./release.sh && ./release.sh --win"
exit 0
