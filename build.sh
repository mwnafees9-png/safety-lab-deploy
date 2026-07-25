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

# 2) Copy every non-JS asset verbatim (html, css, svg, png, txt, xml, json, …).
find "$SRC" -maxdepth 1 -type f ! -name '*.js' -exec cp {} "$OUT"/ \;

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
