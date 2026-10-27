#!/bin/bash
# Installs the nightly backup job on this Mac (SPEC.md §16, phase B). Safe to
# re-run: it replaces the installed scripts and reloads the job.
#
# The scripts are copied into ~/checkmate-secrets so the job keeps working
# whichever branch this checkout is on. It reads the Neon URLs from
# ~/checkmate-secrets/neon.env and runs every evening at 20:00, or when the Mac
# wakes if it was asleep then.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
secrets="$HOME/checkmate-secrets"
label=com.checkmate.backup
plist="$HOME/Library/LaunchAgents/$label.plist"

[ -f "$secrets/neon.env" ] || { echo "missing $secrets/neon.env (DIRECT_URL)" >&2; exit 1; }

mkdir -p "$secrets/backups/nightly"
chmod 700 "$secrets" "$secrets/backups" "$secrets/backups/nightly"
install -m 700 "$here/backup-neon.sh" "$secrets/backup-neon.sh"
install -m 700 "$here/restore-test.sh" "$secrets/restore-test.sh"

mkdir -p "$HOME/Library/LaunchAgents"
cat >"$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$secrets/backup-neon.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>20</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>$secrets/backups/backup.log</string>
  <key>StandardErrorPath</key>
  <string>$secrets/backups/backup.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$plist"
echo "Installed $label. Run it now with: launchctl kickstart gui/$(id -u)/$label"
