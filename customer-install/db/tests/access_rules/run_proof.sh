#!/usr/bin/env bash
# Access-rule proof (3 Oct 2026): builds a fresh database from the customer kit (every
# NN_*.sql in order), adds the Supabase pieces a plain Postgres lacks (proof_stubs.sql),
# loads five test people (proof_fixture.sql), then runs each check as that person.
# Needs psql and an empty Postgres you can create databases on (no Supabase account).
#   PGHOST=/tmp PGPORT=5433 PGUSER=postgres bash run_proof.sh checks_access.txt
#   PGHOST=/tmp PGPORT=5433 PGUSER=postgres bash run_proof.sh checks_realtime.txt
# usage: run_proof.sh <checks-file>    (each line: NAME|USER|AAL|TOPIC|KIND|EXPECT|SQL)
#   KIND recv  -> SQL ignored; counts visible realtime.messages for TOPIC
#   KIND send  -> SQL ignored; inserts a realtime message on TOPIC
#   KIND sql   -> runs SQL as USER; EXPECT ok | deny | =<value>
set -u
PG="psql -v ON_ERROR_STOP=1 -q"
DB=${DB:-proof}
W="$(cd "$(dirname "$0")" && pwd)"
KIT=${KIT:-$W/../..}
$PG -c "drop database if exists $DB" >/dev/null && $PG -c "create database $DB" >/dev/null
$PG -d $DB -f $KIT/local_stubs.sql >/dev/null 2>&1
$PG -d $DB -f $W/proof_stubs.sql >/dev/null 2>&1
for f in $(ls $KIT/[0-9][0-9]_*.sql | sort); do
  $PG -d $DB -f $f >/dev/null 2>/tmp/slab_proof_apply.err || { echo "APPLY FAILED: $f"; cat /tmp/slab_proof_apply.err; exit 2; }
done
$PG -d $DB -f $W/proof_fixture.sql >/dev/null || { echo "FIXTURE FAILED"; exit 2; }
declare -A U=( [O]=00000000-0000-0000-0000-0000000000a1 [E]=00000000-0000-0000-0000-0000000000a2 \
               [R]=00000000-0000-0000-0000-0000000000a3 [V]=00000000-0000-0000-0000-0000000000a4 \
               [X]=00000000-0000-0000-0000-0000000000a5 )
declare -A EM=( [O]=owner@co.test [E]=editor@co.test [R]=reviewer@co.test [V]=viewer@co.test [X]=outsider@else.test )
pass=0; fail=0
while IFS='|' read -r name who aal topic kind expect sql; do
  [ -z "${name// }" ] && continue; case "$name" in \#*) continue;; esac
  uid=${U[$who]}
  amr=""; base=${aal%%+*}
  case "$aal" in *+pwold) amr=",\"amr\":[{\"method\":\"password\",\"timestamp\":$(( $(date +%s) - 3600 ))}]";;
                 *+pw)    amr=",\"amr\":[{\"method\":\"password\",\"timestamp\":$(date +%s)}]";; esac
  aal=$base
  pre="begin; set local request.jwt.claim.sub = '$uid'; set local request.jwt.claims = '{\"sub\":\"$uid\",\"aal\":\"$aal\",\"role\":\"authenticated\",\"email\":\"${EM[$who]}\"$amr}'; set local realtime.topic = '$topic'; set local role authenticated;"
  case "$kind" in
    recv) q="select count(*) from realtime.messages where topic = '$topic';";;
    send) q="insert into realtime.messages(topic, extension) values ('$topic', 'broadcast'); select 'ok';";;
    sql)  q="$sql";;
  esac
  out=$(psql -d $DB -At -v ON_ERROR_STOP=1 -c "$pre $q rollback;" 2>&1)
  rc=$?
  got=""
  if [ $rc -ne 0 ]; then got=deny; else got=$(echo "$out" | grep -v '^$' | grep -v '^\(BEGIN\|SET\|ROLLBACK\|INSERT.*\)$' | tail -1); fi
  case "$expect" in
    deny) ok=$([ "$got" = deny ] && echo 1 || echo 0);;
    ok)   ok=$([ "$got" != deny ] && echo 1 || echo 0);;
    =*)   ok=$([ "$got" = "${expect#=}" ] && echo 1 || echo 0);;
  esac
  if [ "$ok" = 1 ]; then pass=$((pass+1)); echo "  PASS  $name"; else fail=$((fail+1)); echo "  FAIL  $name (expected $expect, got: $(echo "$out" | tail -2 | tr '\n' ' '))"; fi
done < "$W/$(basename "$1")"
echo "== $pass passed, $fail failed"
[ $fail -eq 0 ]
