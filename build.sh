#!/bin/bash
# =============================================================================
# Safety Lab — minify build.  Produces ./dist as a minified mirror of ./site.
#
# Behaviour-preserving by design: this runs esbuild with
#   --minify-whitespace --minify-syntax   (NO --minify-identifiers)
# so it only strips comments/whitespace and does safe syntax compaction. It
# NEVER renames identifiers, which means:
#   • cross-file globals (getSafetyTarget, allocateDAL, DAL_TARGETS, …) keep
#     their names, so the 100+ separate <script> files still resolve each other
#   • class/error names are preserved (e.g. err.name === 'CutsetExplosionError')
#   • the checklist ".eval()" METHOD calls (i.eval(), o.eval()) are untouched
#     — note these are object methods, NOT the global eval(), of which there is
#     none in this codebase.
# Source in ./site stays fully readable; this only affects what ships in ./dist.
#
# Usage:
#   ./build.sh                              # build ./dist from ./site
#   wrangler deploy -c wrangler.dist.jsonc  # deploy the minified ./dist
#   wrangler deploy -c wrangler.dist.jsonc --dry-run   # verify without shipping
#
# Requires Node (already present, since wrangler runs on it). esbuild is fetched
# on first run via `npx --yes esbuild` — no global install needed.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="$ROOT/site"
OUT="$ROOT/dist"

[ -d "$SRC" ] || { echo "ERROR: $SRC not found"; exit 1; }

echo "Minifying $SRC/*.js -> $OUT ..."
rm -rf "$OUT"
mkdir -p "$OUT"

# 1) Minify every top-level .js in one esbuild pass (whitespace + syntax only).
#    --charset=utf8 keeps unicode/emoji literal instead of \u-escaping them.
npx --yes esbuild "$SRC"/*.js \
    --minify-whitespace \
    --minify-syntax \
    --charset=utf8 \
    --log-level=warning \
    --outdir="$OUT"

# 2) Copy shipping assets verbatim — EXPLICIT ALLOWLIST. Anything not listed
#    here is not published.
#
#    Changed 5 Sep 2026. The previous filter was `! -name '*.js'`, i.e. copy
#    every non-JS file. That published two hidden leftovers that had been
#    sitting in site/: `.fuse_hidden0000001500000001` (919 KB — a complete copy
#    of ai_assistant.js, every prompt and every skill body, with the
#    "Confidential / Patent pending" comments intact, and because it is not
#    .html it also bypassed the comment strip in step 3b) and
#    `.fuse_hidden0000003900000001` (355 KB — a copy of index.html). Also
#    MS_SSO_SETUP.md and gt_thread.js.v2bak. A denylist would have to predict
#    the next kind of junk; an allowlist does not.
find "$SRC" -maxdepth 1 -type f ! -name '.*' \( \
      -name '*.html' -o -name '*.css'   -o -name '*.png'  -o -name '*.jpg'   \
   -o -name '*.jpeg' -o -name '*.webp'  -o -name '*.gif'  -o -name '*.svg'   \
   -o -name '*.ico'  -o -name '*.xml'   -o -name '*.txt'  -o -name '*.json'  \
   -o -name '*.woff' -o -name '*.woff2' -o -name '*.map'                     \
   \) -exec cp {} "$OUT"/ \;

# 2a) 13 Sep 2026 — the shipped sitemap carries REAL last-modified dates: regenerate it into
#     dist/ from the page list, lastmod = last git commit per page (today if uncommitted).
#     The committed site/sitemap.xml keeps the same URL list (the wall holds them equal).
node tools/seo/sitemap.mjs --out "$OUT/sitemap.xml"

# 2b) Say out loud what did NOT get published. A new asset type must be added
#     to the allowlist above rather than silently vanishing, and new junk must
#     be visible rather than shipped. Read this list on every build.
echo "  Top-level files in site/ NOT published:"
_unpublished=0
while IFS= read -r _f; do
    case "$_f" in *.js) continue;; esac
    if [ ! -e "$OUT/$_f" ]; then echo "      $_f"; _unpublished=1; fi
done < <(find "$SRC" -maxdepth 1 -type f -printf '%f\n' | sort)
[ "$_unpublished" = 0 ] && echo "      (none)"

# 3) Copy any subdirectories verbatim.
find "$SRC" -maxdepth 1 -mindepth 1 -type d -exec cp -R {} "$OUT"/ \;

# 3b) Strip HTML comments from top-level pages (IP-1). The authored comments
#     in index.html/landing.html carry design rationale that should not ship.
#     Verified: no IE conditional comments, no '<!--' inside script strings.
node -e '
const fs = require("fs"), path = require("path");
let stripped = 0, bytes = 0;
for (const f of fs.readdirSync(process.argv[1])) {
    if (!f.endsWith(".html")) continue;
    const fp = path.join(process.argv[1], f);
    const src = fs.readFileSync(fp, "utf8");
    const out = src.replace(/<!--[\s\S]*?-->/g, "");
    if (out !== src) { fs.writeFileSync(fp, out); stripped++; bytes += src.length - out.length; }
}
console.log("  ✓ HTML comments stripped from " + stripped + " page(s) (" + (bytes/1024).toFixed(1) + " KB of commentary removed)");
' "$OUT"

# 4) Sanity: every emitted .js must parse.
FAIL=0
for f in "$OUT"/*.js; do
    node --check "$f" 2>/dev/null || { echo "  ✗ INVALID JS: $(basename "$f")"; FAIL=1; }
done
[ "$FAIL" = 0 ] && echo "  ✓ all minified JS parses"

SRC_KB=$(du -ck "$SRC"/*.js | tail -1 | cut -f1)
OUT_KB=$(du -ck "$OUT"/*.js | tail -1 | cut -f1)
echo "Done.  JS:  site=${SRC_KB}KB  ->  dist=${OUT_KB}KB"
echo "Deploy the minified build with:  wrangler deploy -c wrangler.dist.jsonc"
