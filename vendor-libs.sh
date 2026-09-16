#!/usr/bin/env bash
# Fetch every runtime library the app loads and put a copy in site/vendor/, so a build has NO
# outside dependencies at run time.
#
# WHY (16 Sep 2026). The app used to pull nine libraries from four CDNs: d3js.org and
# cdn.jsdelivr.net as blocking <script> tags on every page load, and cdnjs.cloudflare.com and
# unpkg.com on demand when a user exported to Excel/PDF/Word or imported a .docx/.pdf. Three
# consequences, all bad:
#
#   1. A customer-hosted install contacted four addresses that appear nowhere on the egress list
#      SL-DG-0001 section 7.2 tells the customer is every address the app contacts. Same defect
#      class as the corpus-endpoint leak fixed earlier today, minus the customer data.
#   2. The DESKTOP app was already broken by it. Its egress allowlist admits only the configured
#      backend and AI endpoint, so every one of those six on-demand loads was refused by our own
#      shell: Excel export, PDF export, Word export, .docx import and .pdf import all failed.
#      patch-index.py rewrote the three <script> tags and nothing rewrote the other six.
#   3. An air-gapped or network-restricted install could not work at all.
#
# Fixing it in the WEB source fixes the desktop too, because pull-web.sh builds from here.
#
# Run this on a machine with internet when a version below changes. The copies are committed, so
# a normal build needs no network.
#
#   bash vendor-libs.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$HERE/site/vendor"
mkdir -p "$DEST"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
npm init -y >/dev/null 2>&1

# Versions are PINNED to what the CDN URLs used to request, so vendoring changes no behavior.
echo "Fetching libraries via npm (needs internet)…"
npm install --no-audit --no-fund --loglevel=error \
  d3@7 chart.js@4 '@supabase/supabase-js@2' \
  xlsx@0.18.5 jspdf@2.5.1 jszip@3.10.1 docx@8.5.0 mammoth@1.6.0 pdfjs-dist@3.11.174

copy() {
  if [ -f "$1" ]; then cp "$1" "$2"; echo "  OK  $(basename "$2")  ($(wc -c < "$2" | tr -d ' ') bytes)";
  else echo "  MISSING: $1" >&2; exit 1; fi
}

M="$TMP/node_modules"
echo "Copying dist files -> site/vendor/"
# Loaded on every page as <script> tags.
copy "$M/d3/dist/d3.min.js"                           "$DEST/d3.v7.min.js"
copy "$M/chart.js/dist/chart.umd.min.js"              "$DEST/chart.umd.min.js"
copy "$M/@supabase/supabase-js/dist/umd/supabase.js"  "$DEST/supabase.min.js"
# Loaded on demand, when a user exports or imports a file.
copy "$M/xlsx/dist/xlsx.full.min.js"                  "$DEST/xlsx.full.min.js"
copy "$M/jspdf/dist/jspdf.umd.min.js"                 "$DEST/jspdf.umd.min.js"
copy "$M/jszip/dist/jszip.min.js"                     "$DEST/jszip.min.js"
copy "$M/docx/build/index.umd.js"                     "$DEST/docx.umd.js"
copy "$M/mammoth/mammoth.browser.min.js"              "$DEST/mammoth.browser.min.js"
copy "$M/pdfjs-dist/build/pdf.min.js"                 "$DEST/pdf.min.js"
copy "$M/pdfjs-dist/build/pdf.worker.min.js"          "$DEST/pdf.worker.min.js"
# yjs.min.js is already vendored (collaborative sync) and is left alone.

echo "Done. site/vendor/ populated. build.sh copies it into dist/."
