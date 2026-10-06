#!/usr/bin/env bash
# One time, on Waqas's Mac (6 Oct 2026): make the key that signs server updates.
# The PRIVATE key goes to ~/.safetylab/server_update_signing_key.pem (owner-only) and never leaves
# this machine. The PUBLIC key is written into the repo, where every appliance and update carries it.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
PRIV="$HOME/.safetylab/server_update_signing_key.pem"
PUB="$REPO/customer-install/appliance/files/update-key.pub.pem"
[ -e "$PRIV" ] && { echo "A server-update key already exists at $PRIV. Refusing to replace it (every server trusts the old one)."; exit 1; }
mkdir -p "$HOME/.safetylab" && chmod 700 "$HOME/.safetylab"
( umask 077; openssl ecparam -name prime256v1 -genkey -noout -out "$PRIV" )
openssl ec -in "$PRIV" -pubout -out "$PUB" 2>/dev/null
echo "Private key: $PRIV  (keep it; back it up somewhere safe; never share it)"
echo "Public key:  $PUB  (goes in the repo; tell Claude it is there)"
