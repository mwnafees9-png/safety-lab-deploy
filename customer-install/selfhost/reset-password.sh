#!/usr/bin/env bash
# ============================================================================
# reset-password.sh: give an existing Safety Lab Aero account a new temporary password.
#
#   ./reset-password.sh person@yourcompany.com
#
# For when someone has forgotten their password and this server has no mail server to send a
# reset link. Prints a new temporary password once. The old password stops working, and the
# account is signed out on every computer where it was signed in. Give the new password to the
# person yourself; they sign in with it and change it under Account, Change password. Their
# projects, analyses and sign-offs are not touched.
# ============================================================================
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
STACK="$HERE/stack"
# shellcheck disable=SC1091
. "$HERE/accounts.sh"
EMAIL="${1:-}"
[ -n "$EMAIL" ] || { echo "Usage: ./reset-password.sh person@yourcompany.com"; exit 1; }
slab_email_ok "$EMAIL" || { echo "That is not an email address: $EMAIL"; exit 1; }
[ -f "$STACK/.env" ] || { echo "No installation found next to this script (expected $STACK/.env). Run install.sh first."; exit 1; }
SLAB_SERVICE_KEY="$(grep '^SERVICE_ROLE_KEY=' "$STACK/.env" | cut -d= -f2-)"; export SLAB_SERVICE_KEY
set +e; PW="$(slab_reset_password "$STACK" "$EMAIL")"; rc=$?; set -e
if [ $rc -eq 2 ]; then echo "There is no account for $EMAIL on this server. Nothing changed. To make one: ./add-user.sh $EMAIL"; exit 1; fi
[ $rc -eq 0 ] || exit 1
cat <<MSG

New temporary password for $EMAIL
Temporary password:  $PW

The old password no longer works, and $EMAIL has been signed out everywhere.
Give this to them in person or over a channel you trust. They sign in with it in the app,
then change it under Account, Change password. This password is not stored anywhere else.
MSG
