#!/usr/bin/env bash
# =============================================================================
# upload-doc.sh — push a file into the DOWNLOADS R2 bucket through the Worker's
# /api/upload route, then PROVE it landed.
#
# The route is multipart-only (create → part → complete); there is no single-PUT
# path, so this script exists rather than a one-line curl.
#
# The upload token is read from the environment and never written to disk, never
# echoed, and never passed as a command-line argument (argv is world-readable in
# `ps` on a shared machine).
#
# Usage:
#   export UPLOAD_TOKEN='...'                     # paste it here, not into a file
#   ./upload-doc.sh ~/Desktop/Welcome-to-Safety-Lab-Aero.pdf docs/Welcome-to-Safety-Lab-Aero.pdf
#
# Keys must be desktop/<file> or docs/<file>, flat — the Worker refuses anything
# else, because this bucket is served publicly at updates.safetylabaero.com.
# =============================================================================
set -uo pipefail

ORIGIN=${ORIGIN:-https://safetylabaero.com}
PUBLIC=${PUBLIC:-https://updates.safetylabaero.com}
PART_MB=${PART_MB:-16}

SRC=${1:-}
KEY=${2:-}

if [ -z "$SRC" ] || [ -z "$KEY" ]; then
  echo "usage: UPLOAD_TOKEN=... $0 <local-file> <docs/name-or-desktop/name>" >&2
  exit 2
fi
if [ -z "${UPLOAD_TOKEN:-}" ]; then
  echo "UPLOAD_TOKEN is not set. Run:  export UPLOAD_TOKEN='...'" >&2
  exit 2
fi
# Catch the copy-paste-the-placeholder case before burning a round trip on a 401.
case "$UPLOAD_TOKEN" in
  paste-it-here|'...'|your-token|TOKEN|changeme)
    echo "UPLOAD_TOKEN is still the placeholder literal ('$UPLOAD_TOKEN')." >&2
    echo "Set the real Worker secret value. If you do not have it, rotate it:" >&2
    echo "  export UPLOAD_TOKEN=\$(openssl rand -hex 32)" >&2
    echo "  printf %s \"\$UPLOAD_TOKEN\" | npx wrangler secret put UPLOAD_TOKEN -c wrangler.dist.jsonc" >&2
    exit 2 ;;
esac
if [ ${#UPLOAD_TOKEN} -lt 16 ]; then
  echo "UPLOAD_TOKEN looks too short (${#UPLOAD_TOKEN} chars) to be the real secret." >&2
  exit 2
fi
if [ ! -f "$SRC" ]; then
  echo "no such file: $SRC" >&2
  exit 2
fi
case "$KEY" in
  desktop/*|docs/*) ;;
  *) echo "key must start with desktop/ or docs/ — got: $KEY" >&2; exit 2 ;;
esac

# Content type matters: R2 stores it and serves it back, and a .pdf delivered as
# application/octet-stream downloads instead of opening in the browser.
case "$KEY" in
  *.pdf)  CT='application/pdf' ;;
  *.pptx) CT='application/vnd.openxmlformats-officedocument.presentationml.presentation' ;;
  *.zip)  CT='application/zip' ;;
  *.dmg)  CT='application/x-apple-diskimage' ;;
  *)      CT='application/octet-stream' ;;
esac

SIZE=$(wc -c < "$SRC" | tr -d ' ')
echo "file   : $SRC"
echo "size   : $SIZE bytes"
echo "key    : $KEY"
echo "type   : $CT"
echo

api() { curl -sS -H "x-upload-token: $UPLOAD_TOKEN" "$@"; }

# ---- create ----------------------------------------------------------------
CREATE=$(api -X POST "$ORIGIN/api/upload?action=create&key=$KEY&ct=$CT")
UPLOAD_ID=$(printf '%s' "$CREATE" | sed -n 's/.*"uploadId":"\([^"]*\)".*/\1/p')
if [ -z "$UPLOAD_ID" ]; then
  echo "create failed: $CREATE" >&2
  exit 1
fi
echo "upload : $UPLOAD_ID"

abort() { api -X POST "$ORIGIN/api/upload?action=abort&key=$KEY&uploadId=$UPLOAD_ID" >/dev/null; }
trap 'echo; echo "aborting multipart upload"; abort' INT TERM

# ---- parts -----------------------------------------------------------------
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
split -b "${PART_MB}m" "$SRC" "$TMP/part."

PARTS='['
N=0
for f in "$TMP"/part.*; do
  N=$((N + 1))
  R=$(api -X PUT --data-binary "@$f" \
        "$ORIGIN/api/upload?action=part&key=$KEY&uploadId=$UPLOAD_ID&part=$N")
  ETAG=$(printf '%s' "$R" | sed -n 's/.*"etag":"\{0,1\}\([^",]*\)"\{0,1\}.*/\1/p')
  if [ -z "$ETAG" ]; then
    echo "part $N failed: $R" >&2
    abort
    exit 1
  fi
  [ "$N" -gt 1 ] && PARTS="$PARTS,"
  PARTS="$PARTS{\"partNumber\":$N,\"etag\":\"$ETAG\"}"
  echo "part   : $N/$(ls "$TMP"/part.* | wc -l | tr -d ' ') ok"
done
PARTS="$PARTS]"

# ---- complete --------------------------------------------------------------
DONE=$(api -X POST -H 'content-type: application/json' --data "$PARTS" \
         "$ORIGIN/api/upload?action=complete&key=$KEY&uploadId=$UPLOAD_ID")
trap - INT TERM
echo "commit : $DONE"
case "$DONE" in *'"ok":true'*) ;; *) echo "complete failed" >&2; exit 1 ;; esac

# ---- prove it ---------------------------------------------------------------
# A bare 200 proves nothing on this estate — the SPA fallback returns 200 plus
# the app shell for anything missing. Compare bytes, not status codes.
echo
echo "── verify ───────────────────────────────────────────"
URL="$PUBLIC/$KEY"
LIVE=$(curl -sS -o /dev/null -D - "$URL" | tr -d '\r' | awk 'tolower($1)=="content-length:"{print $2}')
CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$URL")
echo "url    : $URL"
echo "status : $CODE"
echo "served : ${LIVE:-<none>} bytes"
echo "local  : $SIZE bytes"
if [ "$CODE" = "200" ] && [ "${LIVE:-0}" = "$SIZE" ]; then
  echo "MATCH — the published file is byte-identical to the local one."
else
  echo "MISMATCH — do not link to this URL yet." >&2
  exit 1
fi
