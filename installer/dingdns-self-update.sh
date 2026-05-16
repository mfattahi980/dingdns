#!/usr/bin/env bash
# dingdns-self-update.sh — runs the curl|bash installer-update flow.
#
# Why this exists:
#   The `dingdns` service user cannot run `sudo bash …` because /etc/sudoers.d
#   only whitelists specific binaries (certbot, iptables, systemctl, journalctl).
#   This script is installed root-owned at /usr/local/sbin/dingdns-self-update.sh
#   with a matching sudoers entry that allows ONLY this exact path to run with
#   NOPASSWD. That keeps the privilege escalation surface to a single audited
#   script instead of "any bash command".
#
# Contract:
#   $1 = job_id (e.g. upd-1234567890) — written into START/END markers so the
#        Go panel can match logs to its meta record.
#   $2 = log file path (default /var/log/dingdns/update-current.log) — the
#        installer's full stdout+stderr is appended here.
#
# Run via:
#   sudo -n /usr/local/sbin/dingdns-self-update.sh <job_id> [<log_path>]
#
# This script intentionally does NOT exec the installer directly; it wraps it
# with START/END markers so the parser in version_handler.go can detect job
# completion (the exit code is recorded inside the END marker — that's how the
# parser knows the update is done even after the systemd restart that the
# installer triggers mid-flight).

set -u

REPO_OWNER="${DINGDNS_UPDATE_OWNER:-mfattahi980}"
REPO_NAME="${DINGDNS_UPDATE_REPO:-dingdns}"
REPO_BRANCH="${DINGDNS_UPDATE_BRANCH:-main}"

JOB_ID="${1:-unknown}"
LOG_FILE="${2:-/var/log/dingdns/update-current.log}"

# Make sure the log dir exists with sane perms (the service user appends to
# the file as it polls). The installer itself is invoked as root so we don't
# need to worry about ownership for the actual write.
mkdir -p "$(dirname "$LOG_FILE")"

# Truncate the log so each run starts clean — the Go side writes a fresh
# meta file before invoking us, so any pre-existing content would be from
# a stale run and would confuse the parser.
: > "$LOG_FILE"

INSTALL_URL="https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/installer/install.sh"

{
  echo "=== START $(date -Iseconds) id=${JOB_ID} ==="
  # `set +e` so curl/bash errors don't terminate before we print the END
  # marker — the panel needs that marker to know we're done.
  set +e
  curl -fsSL "$INSTALL_URL" | bash -s -- --update
  RC=$?
  echo "=== END $(date -Iseconds) exit=${RC} ==="
  exit "$RC"
} >> "$LOG_FILE" 2>&1
