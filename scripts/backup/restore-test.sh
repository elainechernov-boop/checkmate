#!/bin/bash
# Proves a backup actually restores (SPEC.md §16, phase B).
#
# Loads a dump into a scratch database beside the live one in Neon, compares
# every table's row count with the live database, then drops the scratch
# database. Never writes to the live database. With no argument it tests the
# newest nightly dump.
#
#   ~/checkmate-secrets/restore-test.sh [path/to/checkmate-....dump]
set -euo pipefail
umask 077

export PATH="/opt/homebrew/opt/libpq/bin:/usr/local/opt/libpq/bin:/usr/bin:/bin"
export PGCONNECT_TIMEOUT=30

SECRETS="$HOME/checkmate-secrets"
SCRATCH=checkmate_restore_test

# shellcheck disable=SC1091
. "$SECRETS/neon.env"

dump=${1:-$(ls -1t "$SECRETS"/backups/nightly/checkmate-*.dump | head -1)}
[ -f "$dump" ] || { echo "no dump to test: $dump" >&2; exit 1; }

live_db=$(psql "$DIRECT_URL" -Atc 'select current_database()')
scratch_url=${DIRECT_URL/\/$live_db\?/\/$SCRATCH?}
[ "$scratch_url" != "$DIRECT_URL" ] || { echo "can't derive the scratch database URL" >&2; exit 1; }

work=$(mktemp -d)
drop_scratch() {
  psql "$DIRECT_URL" -qc "drop database if exists $SCRATCH" || true
  rm -rf "$work"
}
trap drop_scratch EXIT

# Every public table and its exact row count, one "name | n" line each.
row_counts() {
  psql "$1" -At -F ' | ' -c "
    select table_name,
           (xpath('/row/c/text()', query_to_xml(
             format('select count(*) as c from %I.%I', table_schema, table_name),
             false, true, '')))[1]::text
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by 1"
}

echo "Restoring $(basename "$dump") into scratch database $SCRATCH"
psql "$DIRECT_URL" -qc "drop database if exists $SCRATCH" -c "create database $SCRATCH"
pg_restore --no-owner --no-acl --single-transaction --exit-on-error -d "$scratch_url" "$dump"

row_counts "$DIRECT_URL" >"$work/live.txt"
row_counts "$scratch_url" >"$work/restored.txt"

if diff "$work/live.txt" "$work/restored.txt"; then
  echo "PASS: all $(wc -l <"$work/live.txt" | tr -d ' ') tables restored with the same row counts as the live database"
else
  echo "FAIL: restored row counts differ from the live database (lines above; < live, > restored)." >&2
  echo "If the app was in use since the dump was taken, a small difference is expected; re-run on a fresh dump." >&2
  exit 1
fi
