#!/bin/bash
# Safety Lab — one-shot deploy script
# ============================================================================
# Finds the most-recently-modified Claude outputs folder, copies the latest
# site files into ~/Desktop/safety-lab-deploy/site/ and the Worker config
# files into ~/Desktop/safety-lab-deploy/, then runs `wrangler deploy`.
#
# Layout after this script runs:
#   ~/Desktop/safety-lab-deploy/
#     ├─ wrangler.jsonc        ← Worker config (points to worker.js + site/)
#     ├─ worker.js             ← Worker entry point: path-based routing
#     ├─ deploy.sh             ← this script
#     └─ site/
#         ├─ landing.html      ← marketing front door (served at /)
#         ├─ index.html        ← the application (served at /app/)
#         ├─ safety_lab.js
#         ├─ safety_lab.css
#         ├─ auth_gate.js
#         ├─ favicon.svg
#         ├─ robots.txt
#         └─ sitemap.xml
#
# Usage (from inside ~/Desktop/safety-lab-deploy/):
#   ./deploy.sh
# ============================================================================

set -e  # bail on first error

DEST_DIR="$HOME/Desktop/safety-lab-deploy"

# Find the most-recently-modified Claude outputs folder. The glob handles the
# three session-UUID directory levels under local-agent-mode-sessions, so it
# survives across sessions automatically.
SRC_DIR="$(ls -td "$HOME/Library/Application Support/Claude/local-agent-mode-sessions"/*/*/*/outputs 2>/dev/null | head -1)"

if [ -z "$SRC_DIR" ] || [ ! -d "$SRC_DIR" ]; then
  echo "ERROR: Could not find a Claude outputs folder under"
  echo "  ~/Library/Application Support/Claude/local-agent-mode-sessions/"
  echo "Is a Claude session active and have we generated any files yet?"
  exit 1
fi

echo "Source : $SRC_DIR"
echo "Deploy : $DEST_DIR"
echo ""

# Sanity checks
if [ ! -d "$DEST_DIR/site" ]; then
  echo "ERROR: $DEST_DIR/site does not exist. Is this the right deploy folder?"
  exit 1
fi

# -----------------------------------------------------------------
# Worker config + entry point — copied to the deploy root
# -----------------------------------------------------------------
for f in wrangler.jsonc worker.js; do
  if [ -f "$SRC_DIR/$f" ]; then
    cp "$SRC_DIR/$f" "$DEST_DIR/$f"
    echo "  ✓ copied $f → deploy root"
  fi
done

# -----------------------------------------------------------------
# Required site files
# -----------------------------------------------------------------
for f in auth_gate.js index.html landing.html; do
  if [ -f "$SRC_DIR/$f" ]; then
    cp "$SRC_DIR/$f" "$DEST_DIR/site/$f"
    echo "  ✓ copied $f → site/"
  else
    echo "  ✗ missing $f in source folder"
    exit 1
  fi
done

# -----------------------------------------------------------------
# Optional site files — copy if present, skip if not
# -----------------------------------------------------------------
for f in favicon.svg safety_lab.js safety_lab.css og.png copyright.js feedback_client_module.js robots.txt sitemap.xml; do
  if [ -f "$SRC_DIR/$f" ]; then
    cp "$SRC_DIR/$f" "$DEST_DIR/site/$f"
    echo "  ✓ copied $f → site/"
  fi
done

echo ""
echo "Deploying with wrangler..."
echo ""

cd "$DEST_DIR"
wrangler deploy
