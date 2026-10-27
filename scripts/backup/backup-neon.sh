#!/bin/bash
# Nightly backup of the Checkmate database (SPEC.md §16, phase B).
#
# Dumps Neon over its direct (non-pooled) connection, checks the dump is
# readable, keeps the newest 30 on this Mac, and copies each one into a private
# iCloud Drive folder so losing the Mac doesn't lose the only copy. A dump holds
# every family's data and the GitHub repo is public, so dumps live only under
# ~/checkmate-secrets and in iCloud Drive, never in the repository.
#
# Run by launchd (see install.sh); safe to run by hand too.
set -eEuo pipefail
umask 077

export PATH="/opt/homebrew/opt/libpq/bin:/usr/local/opt/libpq/bin:/usr/bin:/bin"
# A suspended Neon database takes a moment to wake.
export PGCONNECT_TIMEOUT=30

SECRETS="$HOME/checkmate-secrets"
LOCAL="$SECRETS/backups/nightly"
ICLOUD="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Checkmate backups"
KEEP=30

# Nobody watches a background job, so a failure has to show up on screen.
fail() {
  echo "$(date "+%F %T") FAILED" >&2
  osascript -e 'display notification "The backup did not finish. See ~/checkmate-secrets/backups/backup.log" with title "Checkmate backup failed"' || true
}
trap fail ERR

# shellcheck disable=SC1091
. "$SECRETS/neon.env"
mkdir -p "$LOCAL"

stamp=$(date +%Y%m%d-%H%M%S)
dump="$LOCAL/checkmate-$stamp.dump"
partial="$dump.partial"

# Same flags the cutover rehearsal used. --no-owner/--no-acl keep the dump
# restorable into a database owned by a different role.
pg_dump "$DIRECT_URL" --format=custom --no-owner --no-acl --file "$partial"

# A dump that "succeeded" but is missing the tables that matter is worse than
# no dump, so look inside before keeping it.
contents=$(pg_restore --list "$partial")
for table in Family AssignmentInstance TimeEntry _prisma_migrations; do
  grep -q "TABLE DATA public $table " <<<"$contents" || {
    echo "dump is missing table $table" >&2
    exit 1
  }
done
mv "$partial" "$dump"

# Keeps the newest $KEEP dumps in a directory. Names carry their timestamp, so
# the glob's alphabetical order is oldest first. A glob rather than `ls`:
# iCloud Drive can briefly show a folder as empty while a copy syncs in, and
# that must not count as a failure.
prune() {
  local files
  shopt -s nullglob
  files=("$1"/checkmate-*.dump)
  shopt -u nullglob
  local i
  for ((i = 0; i < ${#files[@]} - KEEP; i++)); do
    rm -f -- "${files[i]}"
  done
}
prune "$LOCAL"

echo "$(date "+%F %T") saved $(basename "$dump") ($(wc -c <"$dump" | tr -d ' ') bytes)"
date -u +%FT%TZ >"$SECRETS/backups/last-success.txt"

# The off-Mac copy comes last and doesn't undo the local one if it fails: the
# log and notification say so, and the local dump is still there.
if mkdir -p "$ICLOUD" && cp "$dump" "$ICLOUD/" && prune "$ICLOUD"; then
  echo "$(date "+%F %T") copied to iCloud Drive"
else
  echo "$(date "+%F %T") saved locally but could NOT copy to iCloud Drive" >&2
  osascript -e 'display notification "Saved on this Mac, but the iCloud Drive copy failed. See ~/checkmate-secrets/backups/backup.log" with title "Checkmate backup"' || true
  exit 1
fi
