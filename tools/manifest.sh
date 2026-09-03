#!/usr/bin/env bash
# Prints md5 + path for every source file in the repo, sorted. Run in the repo root.
find site tests tools supabase -type f \( -name '*.js' -o -name '*.html' -o -name '*.css' -o -name '*.sql' \) 2>/dev/null \
  | sort | xargs md5sum
md5sum ship.sh build.sh worker.js 2>/dev/null
