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
