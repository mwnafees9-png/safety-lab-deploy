#!/usr/bin/env bash
# Bundle Yjs into a single browser global (window.Y) for offline-capable loading via <script src>.
# Yjs is ESM-only with lib0 sub-imports and has no usable UMD CDN, so we bundle it once with esbuild.
# Run on a dev machine with npm (the build sandbox's registry blocks the install).
#
#   bash build-yjs.sh            # bundles yjs@13
#
# Output: site/vendor/yjs.min.js  — served same-origin on the web AND copied into the desktop
# bundle by `npm run sync` (site/. → app/), so it works deployed and offline with no CDN.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SITE_VENDOR="$HERE/site/vendor"
VER="${1:-13}"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
npm init -y >/dev/null 2>&1
echo "Installing yjs@$VER + y-indexeddb + esbuild…"
npm i "yjs@$VER" y-indexeddb esbuild >/dev/null 2>&1
# Phase 2: bundle y-indexeddb too so window.Y.IndexeddbPersistence is available for offline persistence.
printf "export * from 'yjs';\nexport { IndexeddbPersistence } from 'y-indexeddb';\n" > entry.js
./node_modules/.bin/esbuild entry.js \
  --bundle --format=iife --global-name=Y --minify --legal-comments=none \
  --outfile=yjs.min.js
echo "Built yjs.min.js ($(wc -c < yjs.min.js) bytes), yjs $(node -p "require('yjs/package.json').version")"

mkdir -p "$SITE_VENDOR"
cp yjs.min.js "$SITE_VENDOR/yjs.min.js"
echo "→ $SITE_VENDOR/yjs.min.js"
echo
echo "Next:"
echo "  • Web:     cd \"$HERE\" && wrangler deploy"
echo "  • Desktop: cd \"$HERE/../safety-lab-desktop\" && npm run sync   (copies it into app/vendor/)"
