#!/usr/bin/env bash
# ============================================================================
# Safety Lab Aero — everything on your own server, one script.
#
# Puts the database, the sign-in service, the API, the live-update channel AND the AI
# service on this machine, inside Docker. Nothing here contacts Safety Lab. The only
# outside address the finished install talks to is the AI provider, for drafting only.
#
# Needs: Docker (Docker Desktop on Windows or Mac, Docker Engine on Linux). Nothing else.
#
# Run it with no arguments and answer the questions:
#   ./install.sh
# Your answers are kept in answers.env next to this script (the AI key is NOT kept there;
# it goes only into stack/ai-proxy.env). Run the script again any time: it reuses the
# answers, updates the stack in place, and never rebuilds a database that already exists.
# ============================================================================
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
KIT_DB="$HERE/../db"
STACK="$HERE/stack"
ANSWERS="$HERE/answers.env"
bold(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
die(){ printf '\nSTOP: %s\n' "$*"; exit 1; }

# ---------------------------------------------------------------- 0. checks
bold "Checking this machine"
command -v docker >/dev/null 2>&1 || die "Docker is not installed. Install Docker Desktop (docker.com), open it once, then run this again."
docker info >/dev/null 2>&1 || die "Docker is installed but not running. Open Docker Desktop, wait for it to say it is running, then run this again."
docker compose version >/dev/null 2>&1 || die "Docker Compose is missing. Docker Desktop includes it; on Linux install the docker-compose-plugin package."
[ -d "$KIT_DB" ] || die "The database files are missing (expected $KIT_DB). Unzip the whole package, not just this folder."
command -v openssl >/dev/null 2>&1 || die "openssl is missing. On Windows run this script from the Ubuntu terminal; on Linux install the openssl package."
echo "   Docker is running."

# ---------------------------------------------------------------- 1. answers
if [ -f "$ANSWERS" ]; then
  # shellcheck disable=SC1090
  . "$ANSWERS"
  bold "Using your earlier answers from answers.env (server: $SERVER_NAME)"
else
  bold "Four questions. Type the answer and press Enter."
  echo
  echo "1) The name your users will reach this computer on. Example: safetylab.yourcompany.local"
  read -r -p "   Server name: " SERVER_NAME
  [ -n "$SERVER_NAME" ] || die "The server name cannot be empty."
  echo
  echo "2) Optional. A certificate for that name from your IT certificate authority (two files)."
  echo "   Most installs just press Enter twice: the script makes its own certificate and the"
  echo "   desktop app trusts it for this server automatically through the setup file."
  read -r -p "   Certificate file (.crt or .pem), full path: " CERT_FILE
  read -r -p "   Private key file (.key or .pem), full path:  " KEY_FILE
  if [ -n "$CERT_FILE" ]; then
    [ -f "$CERT_FILE" ] || die "Certificate file not found: $CERT_FILE"
    [ -f "$KEY_FILE" ]  || die "Private key file not found: $KEY_FILE"
  fi
  echo
  echo "3) Your Anthropic API key, created INSIDE a Workspace at console.anthropic.com."
  echo "   It is not shown while you type. It is stored only in stack/ai-proxy.env on this machine."
  read -r -s -p "   Anthropic API key: " ANTHROPIC_API_KEY; echo
  [ -n "$ANTHROPIC_API_KEY" ] || die "The API key cannot be empty. (Leave AI for later? Press Ctrl+C now and ask Safety Lab.)"
  echo
  echo "4) Optional. The Workspace id for that key (starts with wrkspc_), shown on the workspace page at"
  echo "   console.anthropic.com. Needed only for an organization-level key; press Enter to skip."
  read -r -p "   Workspace id: " ANTHROPIC_WORKSPACE_ID
  printf 'SERVER_NAME=%q\nCERT_FILE=%q\nKEY_FILE=%q\n' "$SERVER_NAME" "${CERT_FILE:-}" "${KEY_FILE:-}" > "$ANSWERS"
  chmod 600 "$ANSWERS"
fi

# Questions 5 and 6 (3 Oct 2026). Asked once; an install made before they existed is asked them on
# its next run. Without a mail server the sign-in service cannot check that a person owns the
# address they type, and the app trusts that address (invitations, the administrator role,
# sign-off records). So: with a mail server every new account confirms its address by email;
# without one, open sign-up is off and accounts are made by the administrator (add-user.sh).
if [ -z "${ADMIN_EMAIL:-}" ]; then
  echo
  echo "5) The administrator's email address (yours, if you run this server). This script creates"
  echo "   that account itself and makes it the administrator, so nobody can claim it first."
  read -r -p "   Administrator email: " ADMIN_EMAIL
  [[ "$ADMIN_EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "That is not an email address: $ADMIN_EMAIL"
  echo
  echo "6) Optional. Your company's mail server, so new users can confirm their own email address."
  echo "   Press Enter to skip: then only the administrator creates accounts (./add-user.sh)."
  read -r -p "   Mail server name (e.g. smtp.yourcompany.com): " SMTP_HOST_ANS
  SMTP_PORT_ANS=""; SMTP_USER_ANS=""; SMTP_FROM_ANS=""
  if [ -n "$SMTP_HOST_ANS" ]; then
    read -r -p "   Port [587]: " SMTP_PORT_ANS; SMTP_PORT_ANS="${SMTP_PORT_ANS:-587}"
    read -r -p "   User name for the mail server: " SMTP_USER_ANS
    read -r -s -p "   Password for the mail server (not shown, kept only in stack/.env): " SMTP_PASS_NEW; echo
    case "$SMTP_PASS_NEW" in *"'"*) die "The mail password contains a single quote ('), which this script cannot store safely. Use a different password or app password.";; esac
    read -r -p "   Send emails from (e.g. safetylab@yourcompany.com): " SMTP_FROM_ANS
    [[ "$SMTP_FROM_ANS" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "That is not an email address: $SMTP_FROM_ANS"
  fi
  printf 'ADMIN_EMAIL=%q\nSMTP_HOST_ANS=%q\nSMTP_PORT_ANS=%q\nSMTP_USER_ANS=%q\nSMTP_FROM_ANS=%q\n' \
    "$ADMIN_EMAIL" "$SMTP_HOST_ANS" "$SMTP_PORT_ANS" "$SMTP_USER_ANS" "$SMTP_FROM_ANS" >> "$ANSWERS"
  chmod 600 "$ANSWERS"
fi

# ---------------------------------------------------------------- 2. stack files
if [ ! -f "$STACK/docker-compose.yml" ]; then
  bold "Copying the stack files into $STACK"
  mkdir -p "$STACK" && cp -r "$HERE/stack-src/." "$STACK/"
fi
cp -r "$HERE/ai-proxy" "$STACK/"
cp "$HERE/docker-compose.safetylab.yml" "$STACK/docker-compose.safetylab.yml"

# ---------------------------------------------------------------- 3. secrets and settings
cd "$STACK"
if [ ! -f .env ]; then
  bold "Generating this installation's secrets (stack/.env, keep it private: it is the keys to your database)"
  cp .env.example .env
  sh utils/generate-keys.sh --update-env >/dev/null
  sh utils/add-new-auth-keys.sh --update-env >/dev/null
fi
setenv(){ if grep -q "^$1=" .env; then sed -i.bak "s|^$1=.*|$1=$2|" .env && rm -f .env.bak; else echo "$1=$2" >> .env; fi; }
setenv SUPABASE_PUBLIC_URL "https://$SERVER_NAME"
setenv API_EXTERNAL_URL   "https://$SERVER_NAME/auth/v1"
setenv SITE_URL           "https://$SERVER_NAME"
setenv PROXY_DOMAIN       "$SERVER_NAME"
# Sign-up (3 Oct 2026, see questions 5 and 6). An address is never trusted unconfirmed.
setenv ENABLE_EMAIL_AUTOCONFIRM false
if [ -n "${SMTP_HOST_ANS:-}" ]; then
  setenv DISABLE_SIGNUP false
  setenv SMTP_HOST "$SMTP_HOST_ANS"
  setenv SMTP_PORT "$SMTP_PORT_ANS"
  setenv SMTP_USER "$SMTP_USER_ANS"
  setenv SMTP_ADMIN_EMAIL "$SMTP_FROM_ANS"
  setenv SMTP_SENDER_NAME "Safety Lab Aero"
  # The password goes in single quotes so Docker reads it literally (a $ in it is not a variable).
  if [ -n "${SMTP_PASS_NEW:-}" ]; then
    grep -v '^SMTP_PASS=' .env > .env.tmp && printf "SMTP_PASS='%s'\n" "$SMTP_PASS_NEW" >> .env.tmp && mv .env.tmp .env
  fi
  SIGNUP_MODE=mail
else
  setenv DISABLE_SIGNUP true
  SIGNUP_MODE=admin
fi
unset SMTP_PASS_NEW
setenv ENABLE_PHONE_SIGNUP false
setenv ENABLE_PHONE_AUTOCONFIRM false
setenv COMPOSE_FILE "docker-compose.yml:docker-compose.caddy.yml:docker-compose.safetylab.yml"
setenv STUDIO_DEFAULT_ORGANIZATION "Safety Lab Aero on-premises"
setenv STUDIO_DEFAULT_PROJECT "Safety Lab Aero"
# 3 Oct 2026 (security review, batch 3): stack/.env holds the database password, the JWT secret
# and the service key. It was left readable by every user of this machine. Owner-only, every run.
chmod 600 .env

if [ ! -f ai-proxy.env ] || [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  bold "Writing the AI service settings (stack/ai-proxy.env, keep it private: it holds your AI key)"
  sed -e "s|__ANTHROPIC_API_KEY__|${ANTHROPIC_API_KEY:-}|" \
      -e "s|__ANTHROPIC_WORKSPACE_ID__|${ANTHROPIC_WORKSPACE_ID:-}|" \
      -e "s|__SERVER__|$SERVER_NAME|" "$HERE/ai-proxy.env.template" > ai-proxy.env
  chmod 600 ai-proxy.env
fi
unset ANTHROPIC_API_KEY
# The AI service checks that a license is for THIS server (3 Oct 2026). Its own name is written on
# every run, so an install made before this line, or a changed server name, is brought up to date
# without asking for the AI key again.
if grep -q '^LICENSE_BACKEND_HOST=' ai-proxy.env; then
  sed -i.bak "s|^LICENSE_BACKEND_HOST=.*|LICENSE_BACKEND_HOST=$SERVER_NAME|" ai-proxy.env && rm -f ai-proxy.env.bak
else
  echo "LICENSE_BACKEND_HOST=$SERVER_NAME" >> ai-proxy.env
fi
chmod 600 ai-proxy.env

# ---------------------------------------------------------------- 4. https
bold "Setting up https for $SERVER_NAME"
mkdir -p volumes/proxy/certs; chmod 700 volumes/proxy/certs
if [ -n "${CERT_FILE:-}" ]; then
  cp "$CERT_FILE" volumes/proxy/certs/server.crt; cp "$KEY_FILE" volumes/proxy/certs/server.key
  SELF_SIGNED=0
else
  # No IT certificate: make our own, once. A root (10 years) and a server certificate for this
  # name signed by it (5 years). Caddy's built-in authority was not used on purpose: it rotates
  # its intermediate weekly and does not present its root, so nothing about it can be pinned.
  # The desktop app trusts this exact root and this exact server certificate for this server
  # name only, through the fingerprints the setup file carries. Users install nothing.
  SELF_SIGNED=1
  C=volumes/proxy/certs
  if [ ! -f "$C/root.crt" ] || [ ! -f "$C/server.crt" ]; then
    openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout "$C/root.key" -out "$C/root.crt" -days 3650 \
      -subj "/CN=Safety Lab Aero local root for $SERVER_NAME" -addext "basicConstraints=critical,CA:TRUE,pathlen:0" -addext "keyUsage=critical,keyCertSign,cRLSign" \
      -addext "nameConstraints=critical,permitted;DNS:$SERVER_NAME" >/dev/null 2>&1
    # 3 Oct 2026: the root may only ever vouch for this one server name (nameConstraints) and may not
    # create further authorities (pathlen:0). Some administrators still trust it by hand for the
    # dashboard; if its key ever leaked, it could not be used to impersonate any other site.
    openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout "$C/server.key" -out "$C/server.csr" -subj "/CN=$SERVER_NAME" >/dev/null 2>&1
    printf 'subjectAltName=DNS:%s\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\n' "$SERVER_NAME" > "$C/server.ext"
    openssl x509 -req -in "$C/server.csr" -CA "$C/root.crt" -CAkey "$C/root.key" -CAcreateserial -out "$C/server.leaf.crt" -days 1825 -extfile "$C/server.ext" >/dev/null 2>&1
    cat "$C/server.leaf.crt" "$C/root.crt" > "$C/server.crt"     # Caddy presents leaf + root
    rm -f "$C/server.csr" "$C/server.ext"; chmod 600 "$C"/*.key
  fi
  cp "$C/root.crt" "$HERE/trust-this-on-every-user-computer.crt"; chmod 644 "$HERE/trust-this-on-every-user-computer.crt"
fi
TLS_LINE="tls /etc/caddy/certs/server.crt /etc/caddy/certs/server.key"
sed "s|__TLS_LINE__|$TLS_LINE|" "$HERE/Caddyfile.template" > volumes/proxy/caddy/Caddyfile

# ---------------------------------------------------------------- 5. start
bold "Starting the services (the first time downloads about 9 GB; this can take 10 to 20 minutes)"
docker compose pull -q --ignore-pull-failures 2>/dev/null || echo "   (download was interrupted or rate-limited; using what is already here, the rest is fetched on start)"
docker compose up -d --wait --wait-timeout 600 || {
  echo; echo "A service did not come up. This is what Docker reports:"; docker compose ps
  die "Send the output above to Safety Lab, or run 'docker compose logs <service>' in $STACK to see why."; }

# Caddy reads its configuration and certificate at start. A re-run that changed either (new
# certificate, new server name) must restart it, or it keeps serving the old one.
docker compose restart caddy >/dev/null 2>&1 || true
sleep 2

# ---------------------------------------------------------------- 6. the Safety Lab database
PGX(){ docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
if [ "$(PGX -Atc "select count(*) from pg_tables where schemaname='public' and tablename='projects'")" = "1" ]; then
  bold "Safety Lab database already present; leaving it alone"
else
  bold "Building the Safety Lab database"
  for f in $(ls "$KIT_DB"/[0-9]*.sql | sort); do
    echo "   $(basename "$f")"
    PGX < "$f" 2>&1 | grep -v "^NOTICE\|already exists, skipping\|^ run_chain\|^---\|^ *$\|^(1 row)" || true
  done
fi

# ---------------------------------------------------------------- 6b. the administrator's account
# Made here, by the script, before anyone is told the server exists, so nobody can register the
# administrator's address first (3 Oct 2026). Then made administrator by that exact address.
# shellcheck disable=SC1091
. "$HERE/accounts.sh"
SLAB_SERVICE_KEY="$(grep '^SERVICE_ROLE_KEY=' .env | cut -d= -f2-)"; export SLAB_SERVICE_KEY
ADMIN_PW=""
ADMIN_SQL_EMAIL="$(printf '%s' "$ADMIN_EMAIL" | tr 'A-Z' 'a-z')"
if [ "$(PGX -Atc "select count(*) from private.platform_admins where lower(email) = '$ADMIN_SQL_EMAIL'")" = "1" ]; then
  bold "Administrator account already set up ($ADMIN_EMAIL)"
else
  bold "Creating the administrator account ($ADMIN_EMAIL)"
  sleep 2
  set +e; ADMIN_PW="$(slab_create_account "$ADMIN_EMAIL")"; rc=$?; set -e
  if [ $rc -eq 2 ]; then
    die "An account for $ADMIN_EMAIL already exists on this server but is not the administrator: someone created it before this script did. Do not make it administrator. Tell Safety Lab."
  fi
  [ $rc -eq 0 ] || die "Could not create the administrator account. Run this script again; if it fails again, send the output above to Safety Lab."
  PGX -c "insert into private.platform_admins(email) values ('$ADMIN_SQL_EMAIL') on conflict do nothing" >/dev/null
  echo "   Created and made administrator."
fi

# ---------------------------------------------------------------- 7. check the front door
sleep 3
PUB=$(grep '^SUPABASE_PUBLISHABLE_KEY=' .env | cut -d= -f2-)
CA_ARGS=()
if [ "$SELF_SIGNED" = 1 ]; then
  CA_ARGS=(--cacert "$HERE/trust-this-on-every-user-computer.crt")
fi
probe(){ docker run --rm --network supabase_default -v "$HERE:/pkg:ro" curlimages/curl:8.10.1 -s -o /dev/null -w '%{http_code}' --resolve "$SERVER_NAME:443:$(docker inspect supabase-caddy --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')" ${CA_ARGS:+--cacert /pkg/trust-this-on-every-user-computer.crt} "$@" 2>/dev/null || true; }
bold "Checking the front door from inside Docker"
SIGNIN=$(probe "https://$SERVER_NAME/auth/v1/health" -H "apikey: $PUB")
AI=$(probe "https://$SERVER_NAME/v1/ai/health")
echo "   sign-in service over https: $SIGNIN (want 200)"
echo "   AI service over https:      $AI (want 200)"
[ "$SIGNIN" = 200 ] && [ "$AI" = 200 ] || echo "   One of these is not 200. The install may still be fine if your certificate is for a different name; tell Safety Lab the two numbers."

# ---------------------------------------------------------------- 8. the setup file and the sheet for users
# The setup file is what every user opens in the desktop app: one click, nothing to type. It carries
# ONLY what a browser bundle already carries in the open (the server address, the PUBLISHABLE key,
# the AI endpoint) plus the signed license if Safety Lab's .lic file sits next to this script.
# Never the AI key, never a password: the app refuses a setup file that carries a secret.
LIC_FILE=$(ls "$HERE"/*.lic 2>/dev/null | head -1 || true)
SETUP="$HERE/$SERVER_NAME.safetylab-setup"
# In self-signed mode the setup file also carries the SHA-256 fingerprint of the server certificate
# this install made. The desktop app then trusts that one certificate for this one server name, so
# no user installs anything by hand. With an IT-issued certificate the users' machines already
# trust the CA and no pin is written. If the server certificate is ever re-made, run this script
# again and hand out the new setup file.
fp(){ openssl x509 -in "$1" -outform DER 2>/dev/null | openssl dgst -sha256 -hex 2>/dev/null | sed 's/^.*= *//' | tr -d ' \n'; }
PIN=""
if [ "$SELF_SIGNED" = 1 ]; then
  # Only the server certificate itself is pinned: it is the one the server proves it holds the
  # key for. The root is deliberately NOT in the list; a pin list containing the root would let
  # a fake server that appends our public root pass (review finding, 3 Oct 2026).
  LP=$(fp volumes/proxy/certs/server.leaf.crt)
  if [ ${#LP} -eq 64 ]; then PIN="$LP"; fi
fi
{
  echo '{'
  echo '  "format": "safetylab-setup/1",'
  echo '  "note": "Safety Lab Aero setup file for '"$SERVER_NAME"'. Open it in the desktop app (Choose setup file). It carries no secrets.",'
  echo '  "backend": "own",'
  echo '  "backendUrl": "https://'"$SERVER_NAME"'",'
  echo '  "backendKey": "'"$PUB"'",'
  echo '  "ai": "own",'
  echo '  "aiEndpoint": "https://'"$SERVER_NAME"'/v1/ai",'
  if [ -n "$PIN" ]; then echo '  "backendPin": "'"$PIN"'",'; fi
  if [ -n "$LIC_FILE" ]; then
    printf '  "license": "%s",\n' "$(tr -d '\r\n' < "$LIC_FILE" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  fi
  echo '  "webAppUrl": ""'
  echo '}'
} > "$SETUP"
chmod 644 "$SETUP"
DASH_U=$(grep '^DASHBOARD_USERNAME=' .env | cut -d= -f2-)
cat > "$HERE/WHAT-TO-TYPE-IN-THE-APP.txt" <<EOF
Safety Lab Aero on your own server: getting every user started
==============================================================
Give every user the file:   $SETUP
$( [ -n "$LIC_FILE" ] && echo "It carries your license, so it is the only file they need." || echo "It carries no license yet. Put the .lic file Safety Lab sends you next to install.sh, run
bash install.sh again, and the setup file is rewritten with the license inside. Until then,
users load the .lic file separately in the app." )

The user: install the Safety Lab Aero desktop app from https://safetylabaero.com, open it, click
"Choose setup file..." and pick that file (or drop the file on the window). Done. Then accept the
agreement and sign in.
$( [ "$SIGNUP_MODE" = mail ] && echo "New users choose Create account, use their work email, and click the link in the email they get." || echo "Accounts: this server has no mail server, so users cannot create their own account. The administrator
creates each one:   cd \"$HERE\" && ./add-user.sh person@yourcompany.com
and gives the person the temporary password it prints. They change it under Account, Change password." )

If you would rather type the values by hand, they are:

  Choose:            My organization's server
  Server address:    https://$SERVER_NAME
  Server key:        $PUB

Under "AI":

  Choose:            My organization's AI endpoint
  AI endpoint:       https://$SERVER_NAME/v1/ai

Then load the license file Safety Lab sent you, and sign in.
$( [ "$SELF_SIGNED" = 1 ] && [ -n "$PIN" ] && echo "
This install made its own certificate. The setup file carries its fingerprint, so the desktop app
trusts this server automatically; users install nothing. Only a web browser opening
https://$SERVER_NAME (the admin dashboard, say) will warn; for that one case the root is here:
  $HERE/trust-this-on-every-user-computer.crt" )
$( [ "$SELF_SIGNED" = 1 ] && [ -z "$PIN" ] && echo "
WARNING: this install made its own certificate but its fingerprint could not be read, so every
user's computer must trust $HERE/trust-this-on-every-user-computer.crt by hand
(Windows: double-click, Install Certificate, Local Machine, Trusted Root Certification Authorities;
 Mac: double-click, Keychain Access, set Trust to Always Trust). Tell Safety Lab." )

For the administrator only
--------------------------
Admin dashboard:   https://$SERVER_NAME/project/   user: $DASH_U   password: DASHBOARD_PASSWORD in $STACK/.env
Administrator:     $ADMIN_EMAIL (made by this script; it is already the platform administrator)
Add a user:        cd "$HERE" && ./add-user.sh person@yourcompany.com
Is it running?     cd "$STACK" && docker compose ps
Stop / start:      cd "$STACK" && docker compose stop      /     docker compose start
Back up:           copy $STACK/volumes/db/data (the database) and $STACK/.env and $STACK/ai-proxy.env (the keys) somewhere safe
EOF
bold "Done."
cat "$HERE/WHAT-TO-TYPE-IN-THE-APP.txt"
if [ -n "$ADMIN_PW" ]; then
  # Shown once, here only; never written to a file.
  printf '\n\033[1mYour administrator sign-in\033[0m\n  email:     %s\n  password:  %s\nSign in with it in the app, then change it under Account, Change password.\n' "$ADMIN_EMAIL" "$ADMIN_PW"
fi
