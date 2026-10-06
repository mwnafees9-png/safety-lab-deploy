#!/usr/bin/env bash
# Build and sign a server update from a commit (6 Oct 2026). Runs on Waqas's Mac, where the private
# update key lives. Output: customer-install-package/SafetyLabAero-server-update-<date>-<commit>.slupdate
#
#   tools/server-update/make-server-update.sh            (from HEAD)
#
# The update carries the install kit exactly as committed (never the working tree), the appliance's
# own programs, Safety Lab's public update key, and a signature over all of it.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"; cd "$REPO"
REF="${SLAB_UPDATE_REF:-HEAD}"
PRIV="${SLAB_UPDATE_KEY:-$HOME/.safetylab/server_update_signing_key.pem}"
stop(){ echo "STOP: $*" >&2; exit 1; }
[ -s "$PRIV" ] || stop "no server-update key at $PRIV. Make it once with tools/server-update/keygen.sh."
[ -z "$(git status --porcelain -- customer-install)" ] || stop "customer-install has uncommitted changes. Commit first: an update is built from a commit."
PUB=customer-install/appliance/files/update-key.pub.pem
git cat-file -e "$REF:$PUB" 2>/dev/null || stop "the public update key is not committed ($PUB)."
# The key that signs must be the key the servers trust.
[ "$(openssl ec -in "$PRIV" -pubout 2>/dev/null)" = "$(git show "$REF:$PUB")" ] || stop "the private key at $PRIV does not match the committed public key."
C=$(git rev-parse --short "$REF"); NAME="SafetyLabAero-server-update-$(date +%Y-%m-%d)-$C.slupdate"
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
git archive "$REF" customer-install | tar -x -C "$W"
rm -f "$W"/customer-install/SL-DG-0001*
echo "$C $(git log -1 --format=%cs "$REF")" > "$W/customer-install/VERSION"
tar -czf "$W/payload.tar.gz" -C "$W" customer-install
openssl dgst -sha256 -sign "$PRIV" -out "$W/payload.sig" "$W/payload.tar.gz"
openssl dgst -sha256 -verify <(git show "$REF:$PUB") -signature "$W/payload.sig" "$W/payload.tar.gz" >/dev/null || stop "the signature did not verify."
cp "$W/customer-install/appliance/files/safetylab-update" "$W/safetylab-update"
git show "$REF:$PUB" > "$W/update-key.pub.pem"
mkdir -p customer-install-package
tar -cf "customer-install-package/$NAME" -C "$W" safetylab-update payload.tar.gz payload.sig update-key.pub.pem
SHA=$(shasum -a 256 "customer-install-package/$NAME" | cut -d' ' -f1)
echo "Built customer-install-package/$NAME  ($(du -h "customer-install-package/$NAME" | cut -f1), commit $C)"
echo "SHA-256: $SHA"
echo "Upload:  ./upload-doc.sh customer-install-package/$NAME customer-install/$NAME"
