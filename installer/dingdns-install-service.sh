#!/usr/bin/env bash
# dingdns-install-service.sh — installs a known-safe service package via
# apt-get for the DingDns admin panel.
#
# Why this exists:
#   The dingdns service user can't run `sudo apt-get …` because sudoers
#   doesn't whitelist apt-get (and shouldn't — that would be effectively
#   root). This helper is installed root-owned at
#   /usr/local/sbin/dingdns-install-service.sh and a sudoers entry allows
#   the dingdns user to run ONLY this exact path with NOPASSWD. The
#   allowlist below is the only thing the panel can ever apt-get.
#
# Contract:
#   $1 = service shortname (one of the allowlisted values below)
#
# Output is written to /var/log/dingdns/install-<service>.log with
# START/END markers so the backend can show the user what happened.

set -u

SERVICE="${1:-}"
if [ -z "$SERVICE" ]; then
    echo "Usage: $0 <service-name>" >&2
    echo "Allowed: ufw, fail2ban, nginx, apache2, redis" >&2
    exit 64
fi

# Map panel shortname → (apt package, systemd unit). Keep this in sync
# with installableServices in backend/internal/modules/server/handlers.go.
case "$SERVICE" in
    ufw)      PKG="ufw";           SVC="ufw" ;;
    fail2ban) PKG="fail2ban";      SVC="fail2ban" ;;
    nginx)    PKG="nginx";         SVC="nginx" ;;
    apache2)  PKG="apache2";       SVC="apache2" ;;
    redis)    PKG="redis-server";  SVC="redis-server" ;;
    *)
        echo "Unknown or disallowed service: ${SERVICE}" >&2
        echo "Allowed: ufw, fail2ban, nginx, apache2, redis" >&2
        exit 65
        ;;
esac

LOG_DIR="/var/log/dingdns"
LOG_FILE="${LOG_DIR}/install-${SERVICE}.log"
mkdir -p "${LOG_DIR}"
: > "${LOG_FILE}"

{
    echo "=== START $(date -Iseconds) service=${SERVICE} pkg=${PKG} ==="

    export DEBIAN_FRONTEND=noninteractive

    echo "--- apt-get update ---"
    if ! apt-get update -y; then
        echo "=== END $(date -Iseconds) exit=10 ==="
        exit 10
    fi

    echo "--- apt-get install -y ${PKG} ---"
    if ! apt-get install -y --no-install-recommends "${PKG}"; then
        echo "=== END $(date -Iseconds) exit=11 ==="
        exit 11
    fi

    echo "--- systemctl enable --now ${SVC} ---"
    if ! systemctl enable --now "${SVC}"; then
        echo "=== END $(date -Iseconds) exit=12 ==="
        exit 12
    fi

    echo "=== END $(date -Iseconds) exit=0 ==="
} > >(tee -a "${LOG_FILE}") 2>&1
