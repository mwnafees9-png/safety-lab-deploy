#!/usr/bin/env bash
# A15 — upload the built corpus (corpus_pipeline.py --out DIR) to the R2 bucket.
#   bash upload_corpus.sh ./corpus_out safetylab-corpus
# Creates the bucket if it doesn't exist. Retries are CAPPED (3) and a
# non-transient error aborts — the 4 Aug lesson: an infinite `until` loop
# hammered a missing bucket forever.
set -euo pipefail
DIR="${1:-./corpus_out}"
BUCKET="${2:-safetylab-corpus}"
[ -f "$DIR/manifest.json" ] || { echo "no manifest in $DIR — run corpus_pipeline.py first" >&2; exit 1; }

# create-if-missing (idempotent: 'already exists' is fine)
if ! wrangler r2 bucket create "$BUCKET" --location wnam 2>&1 | grep -qiE "created|already exists"; then
  echo "NOTE: bucket create returned an unexpected result — continuing; the first put will tell the truth."
fi

for f in "$DIR"/*.json; do
  n=0
  until wrangler r2 object put "$BUCKET/$(basename "$f")" --file="$f" --content-type="application/json" --remote; do
    n=$((n+1))
    if [ "$n" -ge 3 ]; then echo "FAILED after 3 tries: $(basename "$f") — fix the cause (bucket? auth?) and re-run." >&2; exit 1; fi
    echo "  retry $n/3 for $(basename "$f")…"; sleep 2
  done
  echo "  ok: $(basename "$f")"
done
echo "Corpus uploaded to r2://$BUCKET. Next: deploy corpus_worker.js with [[r2_buckets]] binding = \"CORPUS\", bucket_name = \"$BUCKET\"."
