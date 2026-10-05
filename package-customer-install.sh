#!/usr/bin/env bash
# =============================================================================
# package-customer-install.sh: build the customer install package (5 Oct 2026).
#
# The zip a customer downloads is built from a COMMIT, never from the working tree, so what is
# on updates.safetylabaero.com is always something that exists in git. Its name comes from the
# guide: SL-DG-0001 tells the customer the exact download address, so the guide is the one place
# the name is decided and this script reads it from there. A zip under any other name would be a
# file nobody is told about, and a guide pointing at a name that was never uploaded is a dead link.
#
# Only the CURRENT guide revision goes in the zip. Withdrawn and superseded revisions stay in git
# for the record and never reach a customer.
#
#   bash package-customer-install.sh          # writes customer-install-package/<name>.zip
#
# Uploading is a production step and is Waqas's: the script prints the command, it does not run it.
# =============================================================================
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
OUT_DIR="${SLAB_PACKAGE_OUT:-$HERE/customer-install-package}"
REF="${SLAB_PACKAGE_REF:-HEAD}"
stop() { echo "STOP: $*" >&2; exit 1; }

# 1. The package must be a commit. Uncommitted kit changes would be left out without a word.
if [ "${SLAB_PACKAGE_ALLOW_DIRTY:-0}" != "1" ] && [ -n "$(git status --porcelain -- customer-install)" ]; then
  git status --short -- customer-install >&2
  stop "customer-install has uncommitted changes. Commit them first: the package is built from a commit."
fi

# 2. The current guide is the highest revision committed in the kit.
GUIDE="$(git ls-tree --name-only "$REF" customer-install/ | sed -n 's|^customer-install/\(SL-DG-0001 .* v[0-9][0-9.]*\)\.docx$|\1|p' | sort -t v -k2 -V | tail -1)"
[ -n "$GUIDE" ] || stop "no SL-DG-0001 guide found in customer-install at $REF."
REV="${GUIDE##* v}"
git cat-file -e "$REF:customer-install/$GUIDE.pdf" 2>/dev/null || stop "the guide $GUIDE has no PDF beside it at $REF."

# 3. The zip name is the one the guide gives the customer. Exactly one address, or refuse.
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
git show "$REF:customer-install/$GUIDE.docx" > "$TMP/guide.docx"
URLS="$(unzip -p "$TMP/guide.docx" word/document.xml | grep -o 'https://updates\.safetylabaero\.com/customer-install/[A-Za-z0-9._-]*\.zip' | sort -u)"
[ "$(printf '%s\n' "$URLS" | grep -c .)" = "1" ] || stop "the guide must name exactly one package address; it names: ${URLS:-none}"
URL="$URLS"; NAME="${URL##*/}"
unzip -p "$TMP/guide.docx" word/header1.xml | grep -q "Rev $REV<" || stop "the guide's page header does not say Rev $REV."

# 4. Build from the commit, then drop every guide revision except the current one.
mkdir -p "$OUT_DIR"
ZIP="$OUT_DIR/$NAME"
rm -f "$ZIP"
git archive --format=zip -o "$ZIP" "$REF" customer-install
OLD="$(unzip -Z1 "$ZIP" | grep '^customer-install/SL-DG-0001 ' | grep -v "^customer-install/$GUIDE\.\(docx\|pdf\)$" || true)"
if [ -n "$OLD" ]; then printf '%s\n' "$OLD" | while IFS= read -r f; do zip -q -d "$ZIP" "$f"; done; fi

# 5. Nothing secret, nothing personal. These are the shapes a secret would arrive in.
BAD="$(unzip -Z1 "$ZIP" | grep -E '\.lic$|\.key$|\.p12$|\.pfx$|(^|/)\.env$|ai-proxy\.env$|\.safetylab-setup$' || true)"
[ -z "$BAD" ] || { rm -f "$ZIP"; stop "the package would contain: $BAD"; }
[ "$(unzip -Z1 "$ZIP" | grep -c '^customer-install/SL-DG-0001 ')" = "2" ] || { rm -f "$ZIP"; stop "the package must hold exactly the current guide, .docx and .pdf."; }

COMMIT="$(git rev-parse --short "$REF")"
FILES="$(unzip -Z1 "$ZIP" | grep -vc '/$')"
SIZE="$(du -k "$ZIP" | cut -f1)"
echo "Built $ZIP"
echo "  from commit $COMMIT, $FILES files, ${SIZE} KB, guide $GUIDE"
echo
echo "Upload (yours):"
echo "  cd \"$HERE\" && npx wrangler r2 object put \"safetylab-downloads/customer-install/$NAME\" --file=\"customer-install-package/$NAME\" --content-type=application/zip --cache-control=\"public, max-age=300\" --remote"
echo "Then check what is served:"
echo "  curl -sI \"$URL?nocache=\$(date +%s)\" | grep -iE '^(HTTP|content-length|content-type)'"
