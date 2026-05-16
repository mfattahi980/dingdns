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
# ─── Why we re-exec into systemd-run ───────────────────────────────────────
# When the admin panel calls us, the chain is:
#     dingdns.service (cgroup) → sudo → bash (this script) → install.sh
# install.sh runs `systemctl stop dingdns` before rebuilding. systemd's
# default KillMode=control-group then kills the ENTIRE dingdns.service
# cgroup — including this script and install.sh — so the update silently
# dies mid-flight and the service stays stopped. Re-execing inside a
# transient unit attached to system.slice puts us outside dingdns's cgroup,
# so we survive the restart and can finish the update + start dingdns back
# up.
#
# When invoked manually from SSH (not from the panel), the parent cgroup is
# already system.slice / user.slice, so the re-exec is harmless. We still
# do it for consistency.

set -u

REPO_OWNER="${DINGDNS_UPDATE_OWNER:-mfattahi980}"
REPO_NAME="${DINGDNS_UPDATE_REPO:-dingdns}"
REPO_BRANCH="${DINGDNS_UPDATE_BRANCH:-main}"

JOB_ID="${1:-unknown}"
LOG_FILE="${2:-/var/log/dingdns/update-current.log}"

mkdir -p "$(dirname "$LOG_FILE")"

# ─── Detach into a transient systemd unit on first invocation ──────────────
# DINGDNS_UPDATE_DETACHED=1 is set by us before re-exec so the second
# invocation inside the unit skips this branch and runs the real work.
if [ -z "${DINGDNS_UPDATE_DETACHED:-}" ] && command -v systemd-run >/dev/null 2>&1; then
    export DINGDNS_UPDATE_DETACHED=1
    # --no-block: return immediately after dispatch (so dingdns can clean
    #             up the original cmd.Wait() promptly).
    # --collect:  GC the unit automatically after it finishes.
    # --slice=system.slice + --unit=… : run in system.slice, not
    #             dingdns.service's cgroup, so we survive the restart.
    exec systemd-run \
        --quiet \
        --no-block \
        --collect \
        --slice=system.slice \
        --unit="dingdns-update-${JOB_ID}.service" \
        --setenv=DINGDNS_UPDATE_DETACHED=1 \
        "$0" "$JOB_ID" "$LOG_FILE"
fi

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
