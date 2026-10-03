#!/usr/bin/env bash
# ============================================================================
# add-user.sh: give someone a Safety Lab Aero account on this server.
#
#   ./add-user.sh person@yourcompany.com
#
# Prints a temporary password. Give it to that person yourself (not by email if you can avoid
# it); they sign in with it and change it under Account, Change password. Use this when the
# server has no mail server: open sign-up is then off, so nobody can create an account under
# someone else's address. With a mail server, people can also create their own account and
# confirm it by email.
# ============================================================================
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
STACK="$HERE/stack"
# shellcheck disable=SC1091
. "$HERE/accounts.sh"
EMAIL="${1:-}"
[ -n "$EMAIL" ] || { echo "Usage: ./add-user.sh person@yourcompany.com"; exit 1; }
slab_email_ok "$EMAIL" || { echo "That is not an email address: $EMAIL"; exit 1; }
[ -f "$STACK/.env" ] || { echo "No installation found next to this script (expected $STACK/.env). Run install.sh first."; exit 1; }
SLAB_SERVICE_KEY="$(grep '^SERVICE_ROLE_KEY=' "$STACK/.env" | cut -d= -f2-)"; export SLAB_SERVICE_KEY
set +e; PW="$(slab_create_account "$EMAIL")"; rc=$?; set -e
if [ $rc -eq 2 ]; then echo "An account for $EMAIL already exists. Nothing changed."; exit 0; fi
[ $rc -eq 0 ] || exit 1
cat <<MSG

Account created for $EMAIL
Temporary password:  $PW

Give this to them in person or over a channel you trust. They sign in with it in the app,
then change it under Account, Change password. This password is not stored anywhere else.
MSG
