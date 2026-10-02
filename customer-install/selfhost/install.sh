#!/usr/bin/env bash
# ============================================================================
# Safety Lab Aero — fully on-premises backend install (2 Oct 2026)
#
# Puts the whole talking layer (sign-in, API, live updates) AND the database on
# YOUR machine, using the open-source Supabase stack in Docker. Nothing in this
# script contacts Safety Lab. When it finishes you have:
#
#   https://<your-server-name>/          the backend the Safety Lab app talks to
#   https://<your-server-name>/project/   an admin dashboard (username/password printed at the end)
#
# and the three values the app's install.env needs are printed on screen.
#
# Usage:
#   ./install.sh <server-name> [--cert certs/server.crt --key certs/server.key] [--self-signed]
#
#   <server-name>  the DNS name your users will reach this box on, e.g. safetylab.radia.local
#   --cert/--key   a certificate for that name from your own CA (recommended; your users'
#                  machines already trust it). PEM files.
#   --self-signed  no certificate to hand: Caddy makes one. Every user machine must then
#                  trust the file printed at the end, or the desktop app will refuse to connect.
#
# Re-running is safe: the stack is updated in place and the database files are NOT re-applied
# once the schema exists (apply only new numbered files by hand, see ../db/README.md).
# ============================================================================
set -euo pipefail

SUPABASE_REF="self-hosted/v0.8.2"      # the release this package was proven against (2 Oct 2026)
HERE="$(cd "$(dirname "$0")" && pwd)"
KIT_DB="$HERE/../db"
STACK="$HERE/stack"

SERVER="${1:-}"; shift || true
CERT=""; KEY=""; SELF_SIGNED=0
while [ $# -gt 0 ]; do
  case "$1" in
    --cert) CERT="$2"; shift 2 ;;
    --key) KEY="$2"; shift 2 ;;
    --self-signed) SELF_SIGNED=1; shift ;;
    *) echo "unknown option: $1"; exit 1 ;;
  esac
done
if [ -z "$SERVER" ]; then echo "Usage: ./install.sh <server-name> [--cert file --key file | --self-signed]"; exit 1; fi
if [ -z "$CERT" ] && [ "$SELF_SIGNED" != 1 ]; then echo "Give --cert and --key (a certificate for $SERVER from your CA), or --self-signed."; exit 1; fi
if [ -n "$CERT" ] && { [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; }; then echo "Certificate or key file not found."; exit 1; fi

say(){ printf '\n==> %s\n' "$*"; }
need(){ command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1. Install it and re-run."; exit 1; }; }

say "Checking prerequisites"
need docker; need git; need openssl
docker compose version >/dev/null 2>&1 || { echo "Docker Compose plugin missing (docker compose version failed)."; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker is installed but not running, or you cannot talk to it. Start Docker (or add yourself to the docker group) and re-run."; exit 1; }
[ -d "$KIT_DB" ] || { echo "Database kit not found at $KIT_DB"; exit 1; }

# ---------------------------------------------------------------- 1. the stack files
if [ ! -f "$STACK/docker-compose.yml" ]; then
  say "Fetching the Supabase self-hosting files ($SUPABASE_REF)"
  rm -rf "$HERE/.ref"
  git -c advice.detachedHead=false clone -q --depth 1 --filter=blob:none --sparse --branch "$SUPABASE_REF" https://github.com/supabase/supabase.git "$HERE/.ref"
  ( cd "$HERE/.ref" && git sparse-checkout set docker -q )
  mkdir -p "$STACK" && cp -r "$HERE/.ref/docker/." "$STACK/" && rm -rf "$HERE/.ref"
  echo "$SUPABASE_REF" > "$STACK/.supabase-version"
else
  say "Stack files already present in $STACK (keeping them; see update.sh there to upgrade)"
fi

# ---------------------------------------------------------------- 2. secrets and settings
cd "$STACK"
if [ ! -f .env ]; then
  say "Generating secrets (written only to $STACK/.env, keep that file private)"
  cp .env.example .env
  sh utils/generate-keys.sh --update-env >/dev/null
  sh utils/add-new-auth-keys.sh --update-env >/dev/null
fi
setenv(){ # key value
  if grep -q "^$1=" .env; then sed -i.bak "s|^$1=.*|$1=$2|" .env && rm -f .env.bak; else echo "$1=$2" >> .env; fi
}
say "Writing settings for $SERVER"
setenv SUPABASE_PUBLIC_URL "https://$SERVER"
setenv API_EXTERNAL_URL   "https://$SERVER/auth/v1"
setenv SITE_URL           "https://$SERVER"
setenv PROXY_DOMAIN       "$SERVER"
# No mail server is wired up by default, so sign-ups confirm themselves. Your row security
# and the licence gate still decide what anyone can see. To require email confirmation,
# fill in the SMTP_* lines in .env, set ENABLE_EMAIL_AUTOCONFIRM=false and run ./install.sh again.
setenv ENABLE_EMAIL_AUTOCONFIRM true
setenv ENABLE_PHONE_SIGNUP false
setenv ENABLE_PHONE_AUTOCONFIRM false
setenv COMPOSE_FILE "docker-compose.yml:docker-compose.caddy.yml:docker-compose.slab-tls.yml"
setenv STUDIO_DEFAULT_ORGANIZATION "Safety Lab Aero on-premises"
setenv STUDIO_DEFAULT_PROJECT "Safety Lab Aero"

# ---------------------------------------------------------------- 3. TLS
say "Configuring https"
mkdir -p "$STACK/volumes/proxy/certs"
cp "$HERE/docker-compose.slab-tls.yml" "$STACK/docker-compose.slab-tls.yml"
if [ -n "$CERT" ]; then
  cp "$CERT" "$STACK/volumes/proxy/certs/server.crt"; cp "$KEY" "$STACK/volumes/proxy/certs/server.key"
  TLS_LINE="tls /etc/caddy/certs/server.crt /etc/caddy/certs/server.key"
else
  TLS_LINE="tls internal"
fi
sed "s|__TLS_LINE__|$TLS_LINE|" "$HERE/Caddyfile.template" > "$STACK/volumes/proxy/caddy/Caddyfile"

# ---------------------------------------------------------------- 4. start
say "Starting the stack (first time pulls about 9 GB of images; be patient)"
docker compose pull -q --ignore-pull-failures || echo "    (pull was rate-limited or interrupted; continuing with the images already present, missing ones are fetched on start)"
docker compose up -d --wait --wait-timeout 300 || {
  echo "Some service did not come up healthy. 'docker compose ps' and 'docker compose logs <service>' in $STACK show why."
  docker compose ps; exit 1; }

# ---------------------------------------------------------------- 5. the Safety Lab database
PGX(){ docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
if [ "$(PGX -Atc "select count(*) from pg_tables where schemaname='public' and tablename='projects'")" = "1" ]; then
  say "Safety Lab database already present; not re-applying (apply new numbered files by hand if upgrading)"
else
  say "Building the Safety Lab database"
  for f in $(ls "$KIT_DB"/[0-9]*.sql | sort); do
    echo "    applying $(basename "$f")"
    PGX < "$f" 2>&1 | grep -v "^NOTICE\|already exists, skipping" || true
  done
fi

# ---------------------------------------------------------------- 6. tell the operator
PUB=$(grep '^SUPABASE_PUBLISHABLE_KEY=' .env | cut -d= -f2-)
DASH_U=$(grep '^DASHBOARD_USERNAME=' .env | cut -d= -f2-)
cat <<EOF

============================================================================
Done. Your Safety Lab Aero backend is running on this machine.

Put these three lines in the app's install.env (customer-install/install.env):

  MODE=self-hosted
  DB_URL=https://$SERVER
  DB_KEY=$PUB

Then run  node configure.js  there, as the setup guide says. Users point the desktop app
at https://$SERVER.

Admin dashboard:  https://$SERVER/project/   (user: $DASH_U, password: DASHBOARD_PASSWORD in $STACK/.env)
Make yourself a platform administrator (once, replace the address):
  cd $STACK && docker compose exec -T db psql -U postgres -d postgres -c "insert into private.platform_admins(email) values ('you@yourcompany.com')"

Day to day:  cd $STACK && sh run.sh status | stop | start | logs
Back up:     the database lives in the Docker volume under $STACK/volumes/db/data; back that directory up.
EOF
if [ "$SELF_SIGNED" = 1 ]; then
  docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt "$HERE/trust-this-on-every-user-machine.crt" 2>/dev/null || true
  cat <<EOF

SELF-SIGNED MODE: every machine that runs the Safety Lab app must trust
  $HERE/trust-this-on-every-user-machine.crt
(install it as a trusted root certificate). Until it does, the desktop app will refuse https://$SERVER.
EOF
fi
