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
# Keys must be desktop/<file>, docs/<file> or customer-install/<file>, flat. The
# Worker refuses anything else, because this bucket is served publicly at
# updates.safetylabaero.com.
#
# Big files (5 Oct 2026, for the 1.7 GB VMware appliance): each piece is read
# straight from the file (no full temporary copy), a piece that fails is retried
# up to 5 times instead of throwing the whole upload away, and the finished file
# is downloaded back and its SHA-256 fingerprint compared with the local one.
# =============================================================================
set -uo pipefail

ORIGIN=${ORIGIN:-https://safetylabaero.com}
PUBLIC=${PUBLIC:-https://updates.safetylabaero.com}
PART_MB=${PART_MB:-16}

SRC=${1:-}
KEY=${2:-}

if [ -z "$SRC" ] || [ -z "$KEY" ]; then
  echo "usage: UPLOAD_TOKEN=... $0 <local-file> <desktop/|docs/|customer-install/name>" >&2
  exit 2
fi
if [ -z "${UPLOAD_TOKEN:-}" ]; then
  echo "UPLOAD_TOKEN is not set. Run:  export UPLOAD_TOKEN='...'" >&2
  exit 2
fi
# Catch the copy-paste-the-placeholder case before burning a round trip on a 401. Matched by
# the words a placeholder is made of, not a fixed list: on 5 Oct 'paste-the-real-token' (from our
# own instructions) was not on the list and only the length check stood in the way, and
# 'YOUR-REAL-TOKEN' got through to the length check too. A real secret is random characters and
# contains none of these words. (tr, not ${x,,}: macOS ships bash 3.2.)
TOKEN_LC="$(printf '%s' "$UPLOAD_TOKEN" | tr '[:upper:]' '[:lower:]')"
case "$TOKEN_LC" in
  *paste*|*your*|*real*|*token*|*placeholder*|*changeme*|*example*|*secret*|*here*|*'...'*|*'<'*|*'>'*|*' '*)
    echo "UPLOAD_TOKEN looks like a placeholder ('$UPLOAD_TOKEN'), not the real secret." >&2
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
  desktop/*|docs/*|customer-install/*) ;;
  *) echo "key must start with desktop/, docs/ or customer-install/, got: $KEY" >&2; exit 2 ;;
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
[ "$SIZE" -gt 0 ] || { echo "the file is empty: $SRC" >&2; exit 2; }
hash256() { if command -v sha256sum >/dev/null; then sha256sum | cut -d' ' -f1; else shasum -a 256 | cut -d' ' -f1; fi; }
LOCAL_SHA=$(hash256 < "$SRC")
echo "file   : $SRC"
echo "size   : $SIZE bytes"
echo "key    : $KEY"
echo "type   : $CT"
echo "sha256 : $LOCAL_SHA"
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
# Each piece is cut from the file with dd as it is sent, so a 1.7 GB file does not
# need another 1.7 GB of temporary space. A piece that fails (dropped connection,
# a 5xx, no etag back) is sent again, up to 5 times with a growing wait; only then
# is the whole upload abandoned.
PART_BYTES=$((PART_MB * 1048576))
NPARTS=$(( (SIZE + PART_BYTES - 1) / PART_BYTES ))
TRIES=${TRIES:-5}
PARTS='['
N=0
while [ "$N" -lt "$NPARTS" ]; do
  N=$((N + 1))
  ETAG=''
  T=0
  while [ -z "$ETAG" ] && [ "$T" -lt "$TRIES" ]; do
    T=$((T + 1))
    R=$(dd if="$SRC" bs=1048576 skip=$(( (N - 1) * PART_MB )) count="$PART_MB" 2>/dev/null \
        | api --max-time 600 -X PUT --data-binary @- \
            "$ORIGIN/api/upload?action=part&key=$KEY&uploadId=$UPLOAD_ID&part=$N" 2>&1)
    ETAG=$(printf '%s' "$R" | sed -n 's/.*"etag":"\{0,1\}\([^",]*\)"\{0,1\}.*/\1/p')
    if [ -z "$ETAG" ] && [ "$T" -lt "$TRIES" ]; then
      echo "part   : $N/$NPARTS failed (try $T of $TRIES), sending it again: $R" >&2
      sleep $((T * T * 2))
    fi
  done
  if [ -z "$ETAG" ]; then
    echo "part $N failed $TRIES times, giving up: $R" >&2
    abort
    exit 1
  fi
  [ "$N" -gt 1 ] && PARTS="$PARTS,"
  PARTS="$PARTS{\"partNumber\":$N,\"etag\":\"$ETAG\"}"
  echo "part   : $N/$NPARTS ok"
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
FRESH="$URL?nocache=$(date +%s)"
LIVE=$(curl -sS -o /dev/null -D - "$FRESH" | tr -d '\r' | awk 'tolower($1)=="content-length:"{print $2}')
CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$FRESH")
echo "url    : $URL"
echo "status : $CODE"
echo "served : ${LIVE:-<none>} bytes"
echo "local  : $SIZE bytes"
# Same size is not the same file. Download it back and compare fingerprints.
echo "fetch  : downloading it back to compare fingerprints"
SERVED_SHA=$(curl -sS --fail "$FRESH" | hash256)
echo "served : sha256 $SERVED_SHA"
echo "local  : sha256 $LOCAL_SHA"
if [ "$CODE" = "200" ] && [ "${LIVE:-0}" = "$SIZE" ] && [ "$SERVED_SHA" = "$LOCAL_SHA" ]; then
  echo "MATCH: the published file is byte-identical to the local one."
  echo "Fingerprint to give the recipient (SHA-256): $LOCAL_SHA"
else
  echo "MISMATCH — do not link to this URL yet." >&2
  exit 1
fi
