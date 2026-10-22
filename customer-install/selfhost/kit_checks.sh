# ============================================================================
# kit_checks.sh: the checks install.sh makes on every run so an update always reaches the install
# that is running (22 Oct 2026). Sourced by install.sh, not run on its own.
#
# Found on a customer server. The update package was unpacked in a new folder and install.sh run
# there, while Safety Lab on that server ran from the folder it was first installed in. And the AI
# service, a plain Node program reading its code from stack/ai-proxy, is never restarted by
# "docker compose up" when only that code changed (nothing in its container settings did), so even
# in the right folder it kept running the old code from memory. Both looked like a finished update.
# Worse, the stack's Docker project name and container names are fixed ("supabase",
# "safetylab-ai-proxy"), so starting the stack from a second folder would take the running
# containers over and point them at that folder's empty database.
#
#   slab_kit_check_early     before any question is asked: if Safety Lab exists on this machine
#                            (running or stopped) and this folder has no stack yet, it is another
#                            folder's install. Stop, name it, say how to update it.
#   slab_kit_check_running   after the new files are copied in: the install on this machine must
#                            be THIS folder's. Proven by a token when it is running (it reads
#                            stack/ai-proxy as /app, so it sees this run's token only if it reads
#                            this folder), by Docker's own record of the folder when it is stopped.
#   slab_ai_proxy_refresh    after the services are up: recreate the AI service so it loads the
#                            new code, wait until it is healthy, prove the running code is this
#                            folder's (token and code hash). Anything else is a STOP, not "done".
# ============================================================================

SLAB_AI_CONTAINER="${SLAB_AI_CONTAINER:-safetylab-ai-proxy}"
SLAB_DB_CONTAINER="${SLAB_DB_CONTAINER:-supabase-db}"

_slab_running() { [ -n "$(docker ps -q -f "name=^$1\$" 2>/dev/null || true)" ]; }
_slab_exists()  { [ -n "$(docker ps -aq -f "name=^$1\$" 2>/dev/null || true)" ]; }
# the folder Docker Compose started a container from (its own label), else the AI service's /app mount
_slab_stack_of() {
  local d
  d="$(docker inspect "$1" --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' 2>/dev/null || true)"
  if [ -z "$d" ] || [ "$d" = "<no value>" ]; then
    d="$(docker inspect "$1" --format '{{range .Mounts}}{{if eq .Destination "/app"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || true)"
    d="${d%/ai-proxy}"
  fi
  printf '%s' "$d"
}
# the existing install's stack folder (AI service first, then the database), or ''
_slab_existing_stack() {
  local c
  for c in "$SLAB_AI_CONTAINER" "$SLAB_DB_CONTAINER"; do
    if _slab_exists "$c"; then _slab_stack_of "$c"; return 0; fi
  done
  return 1
}
# compare folders the way Docker Desktop and WSL may spell them (/run/desktop/mnt/host/c, /mnt/c, C:\)
_slab_norm() {
  printf '%s' "$1" | tr '\\' '/' | sed -e 's#^/run/desktop/mnt/host/#/#' -e 's#^/host_mnt/#/#' -e 's#^/mnt/\([a-zA-Z]\)/#/\1/#' -e 's#^\([a-zA-Z]\):/#/\1/#' -e 's#/*$##' | tr 'A-Z' 'a-z'
}
_slab_sha() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

# $1 = the other install's stack folder (may be ''), $2 = this kit root
_slab_stop_other() {
  local stack="$1" kit="$2" other
  other="${stack%/selfhost/stack}"
  [ -n "$other" ] || other="(Docker did not say which folder)"
  printf '\nSTOP: Safety Lab is already installed on this server, from another folder:\n   %s\n' "$other"
  printf 'This package was unpacked in:\n   %s\n' "$kit"
  printf 'Nothing was changed. Update the install that is already there instead:\n'
  case "$other" in
    /opt/safetylab/*)
      printf '   This server is the Safety Lab appliance. Copy this package over it and run its installer:\n'
      printf '     sudo cp -r "%s/." "%s/" && cd "%s/selfhost" && sudo -u safetylab env SLAB_OFFLINE=1 bash install.sh\n' "$kit" "$other" "$other" ;;
    *)
      printf '     cp -r "%s/." "%s/" && cd "%s/selfhost" && bash install.sh\n' "$kit" "$other" "$other" ;;
  esac
  printf '   (Your database, keys, answers and license are in that folder'"'"'s selfhost/stack and answers.env; an update never replaces them.)\n'
  exit 1
}

# $1 = this kit's stack folder, $2 = this kit root
slab_kit_check_early() {
  local stack="$1" kit="$2" there
  [ -f "$stack/docker-compose.yml" ] && return 0      # this folder has a stack: checked after the copy
  there="$(_slab_existing_stack)" || return 0          # nothing installed on this machine: a first install
  _slab_stop_other "$there" "$kit"
}

# $1 = this kit's stack folder, $2 = this kit root
slab_kit_check_running() {
  local stack="$1" kit="$2" token seen there
  token="$(date +%s)-$$-${RANDOM:-0}${RANDOM:-0}"
  printf '%s\n' "$token" > "$stack/ai-proxy/.kit-id"
  SLAB_KIT_TOKEN="$token"
  if _slab_running "$SLAB_AI_CONTAINER"; then
    # Docker Desktop shares a Windows or Mac folder into the container with a short delay: ask a few times
    local i
    for i in 1 2 3 4 5; do
      seen="$(docker exec "$SLAB_AI_CONTAINER" cat /app/.kit-id 2>/dev/null | tr -d '\r\n' || true)"
      [ "$seen" = "$token" ] && return 0               # the running service reads this folder
      sleep "${SLAB_KIT_WAIT:-1}"
    done
    _slab_stop_other "$(_slab_stack_of "$SLAB_AI_CONTAINER")" "$kit"
  fi
  there="$(_slab_existing_stack)" || return 0          # nothing installed: a first install here
  [ -z "$there" ] && return 0                          # Docker keeps no record of the folder: nothing to compare
  [ "$(_slab_norm "$there")" = "$(_slab_norm "$stack")" ] && return 0
  _slab_stop_other "$there" "$kit"
}

# $1 = this kit's stack folder (install.sh is in it when it calls this)
slab_ai_proxy_refresh() {
  local stack="$1" seen want have
  docker compose up -d --no-deps --force-recreate --wait --wait-timeout 180 ai-proxy >/dev/null 2>&1 || {
    echo; docker compose ps ai-proxy 2>/dev/null || true
    printf '\nSTOP: the AI service did not come back after loading the new version. Run "docker compose logs ai-proxy" in %s and send it to Safety Lab.\n' "$stack"
    exit 1; }
  want="$(_slab_sha "$stack/ai-proxy/worker.js")"
  local i
  for i in 1 2 3 4 5; do
    seen="$(docker exec "$SLAB_AI_CONTAINER" cat /app/.kit-id 2>/dev/null | tr -d '\r\n' || true)"
    have="$(docker exec "$SLAB_AI_CONTAINER" sha256sum /app/worker.js 2>/dev/null | cut -d' ' -f1 || true)"
    [ "$want" = "$have" ] && { [ -z "${SLAB_KIT_TOKEN:-}" ] || [ "$seen" = "$SLAB_KIT_TOKEN" ]; } && break
    sleep "${SLAB_KIT_WAIT:-1}"
  done
  if { [ -n "${SLAB_KIT_TOKEN:-}" ] && [ "$seen" != "$SLAB_KIT_TOKEN" ]; } || [ -z "$have" ] || [ "$want" != "$have" ]; then
    printf '\nSTOP: the AI service is still not running the version in %s/ai-proxy (it reads %s). Send this to Safety Lab.\n' "$stack" "$(_slab_stack_of "$SLAB_AI_CONTAINER")"
    exit 1
  fi
  echo "   The AI service is running this version (checked)."
}
