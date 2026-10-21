# shellcheck shell=bash
# ============================================================================
# accounts.sh: create Safety Lab Aero accounts on THIS server. Sourced by install.sh (the
# administrator's own account) and by add-user.sh (everyone else, when there is no mail server).
#
# Why accounts are made here (3 Oct 2026, security review batch 3): without a mail server the
# sign-in service cannot check that a person owns the address they type. The app trusts that
# address for invitations, the administrator role, sign-off records and licence domains. So on a
# server with no mail server, open sign-up is OFF and the administrator creates each account
# here; with a mail server, every new account must confirm its address by email.
#
# Every call goes straight to the sign-in service inside Docker. The service key and the
# temporary password travel in the container's environment, never on a command line (ps).
# ============================================================================

slab_email_ok(){ [[ "$1" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; }

# 16 random characters plus one of each kind the app's sign-up rule asks for.
slab_temp_password(){ printf '%s' "$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | cut -c1-16)Aa7"; }

# slab_auth_api METHOD PATH [JSON]  -> prints the body, then the HTTP status on the last line.
# Needs SLAB_SERVICE_KEY in the environment.
slab_auth_api(){
  SLAB_BODY="${3:-}" docker run --rm --network supabase_default -e SLAB_SERVICE_KEY -e SLAB_BODY \
    --entrypoint sh curlimages/curl:8.10.1 -c '
      if [ -n "$SLAB_BODY" ]; then
        curl -s -w "\n%{http_code}" -X "'"$1"'" -H "Authorization: Bearer $SLAB_SERVICE_KEY" -H "Content-Type: application/json" --data "$SLAB_BODY" "http://supabase-auth:9999'"$2"'"
      else
        curl -s -w "\n%{http_code}" -X "'"$1"'" -H "Authorization: Bearer $SLAB_SERVICE_KEY" "http://supabase-auth:9999'"$2"'"
      fi'
}

# slab_create_account EMAIL  -> on success prints the temporary password and returns 0.
# Returns 2 if an account with that address already exists, 1 on any other failure.
slab_create_account(){
  local email="$1" pw out code
  slab_email_ok "$email" || { echo "Not an email address: $email" >&2; return 1; }
  [ -n "${SLAB_SERVICE_KEY:-}" ] || { echo "The service key is missing (stack/.env SERVICE_ROLE_KEY)." >&2; return 1; }
  pw="$(slab_temp_password)"
  out="$(slab_auth_api POST /admin/users "{\"email\":\"$email\",\"password\":\"$pw\",\"email_confirm\":true}")" || { echo "Could not reach the sign-in service." >&2; return 1; }
  code="$(printf '%s' "$out" | tail -n1)"
  case "$code" in
    200|201) printf '%s' "$pw"; return 0 ;;
    422) if printf '%s' "$out" | grep -qi 'already\|exists\|registered'; then return 2; fi ;;
  esac
  echo "The sign-in service refused the new account (HTTP $code): $(printf '%s' "$out" | head -n1 | cut -c1-200)" >&2
  return 1
}

# ---------------------------------------------------------------------------- password reset
# 21 Oct 2026 (Waqas: "create the reset kit for ubuntu"). A forgotten password on a server with no
# mail server had no way back: the sign-in service cannot email a reset link, and the temporary
# password install.sh and add-user.sh print is shown once. reset-password.sh gives the account a
# new temporary password the same way add-user.sh makes one, and signs that account out everywhere
# it is still signed in, so a password that was lost (or seen by someone else) stops working on
# every computer at once.

# slab_sql STACK SQL  -> runs one statement as the database owner, prints rows unaligned.
# Only ever called with values this file has already checked (an email that passed slab_email_ok,
# an id that is a UUID), so nothing a person types reaches the SQL unchecked.
slab_sql(){ (cd "$1" && docker compose exec -T db psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 -q -c "$2"); }

# slab_user_id STACK EMAIL  -> prints the account's id, or nothing when there is no such account.
slab_user_id(){
  slab_email_ok "$2" || return 1
  slab_sql "$1" "select id from auth.users where lower(email) = lower('$2') and deleted_at is null limit 1" | tr -d '[:space:]'
}

# slab_reset_password STACK EMAIL  -> on success prints the new temporary password and returns 0.
# Returns 2 when there is no account with that address, 1 on any other failure. Signing the
# account out everywhere is reported on stderr and does not undo the new password if it fails.
slab_reset_password(){
  local stack="$1" email="$2" id pw out code
  slab_email_ok "$email" || { echo "Not an email address: $email" >&2; return 1; }
  [ -n "${SLAB_SERVICE_KEY:-}" ] || { echo "The service key is missing (stack/.env SERVICE_ROLE_KEY)." >&2; return 1; }
  id="$(slab_user_id "$stack" "$email")" || { echo "Could not reach the database. Is the server running? (docker compose ps)" >&2; return 1; }
  [ -n "$id" ] || return 2
  [[ "$id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || { echo "The database answered with something that is not an account id." >&2; return 1; }
  pw="$(slab_temp_password)"
  out="$(slab_auth_api PUT "/admin/users/$id" "{\"password\":\"$pw\"}")" || { echo "Could not reach the sign-in service." >&2; return 1; }
  code="$(printf '%s' "$out" | tail -n1)"
  case "$code" in 200|201) ;; *) echo "The sign-in service refused the new password (HTTP $code): $(printf '%s' "$out" | head -n1 | cut -c1-200)" >&2; return 1 ;; esac
  if ! slab_sql "$stack" "delete from auth.refresh_tokens where user_id = '$id'; delete from auth.sessions where user_id = '$id';" >/dev/null; then
    echo "The password was changed, but signing $email out of other computers failed. Restart the server (docker compose restart) to be sure." >&2
  fi
  printf '%s' "$pw"; return 0
}
