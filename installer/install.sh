#!/bin/bash
#
# DingDns Installer
# Usage:
#   curl -sSL https://raw.githubusercontent.com/mfattahi980/dingdns/main/installer/install.sh | sudo bash
#   sudo bash installer/install.sh             # interactive
#   sudo bash installer/install.sh --uninstall
#   sudo bash installer/install.sh --update
#
# Environment overrides (skip the interactive prompts):
#   DINGDNS_DOMAIN, DINGDNS_NS_PRIMARY, DINGDNS_NS_SECONDARY,
#   DINGDNS_ADMIN_EMAIL, DINGDNS_ADMIN_PASSWORD
#
# Supports: Debian 12/13, Ubuntu 22.04/24.04
#

set -e

# ============================================================
# Configuration
# ============================================================
DINGDNS_VERSION="1.0.0"
INSTALL_DIR="/opt/dingdns"
CONFIG_FILE="${INSTALL_DIR}/config.json"
DATA_DIR="${INSTALL_DIR}/data"
LOG_DIR="/var/log/dingdns"
SERVICE_NAME="dingdns"
REPO_URL="https://github.com/mfattahi980/dingdns"
GO_VERSION="1.22.5"
NODE_MAJOR="20"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[  OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

banner() {
    echo -e "${CYAN}"
    echo "  ____  _             ____"
    echo " |  _ \\(_)_ __   __ |  _ \\_ __  ___"
    echo " | | | | | '_ \\ / _\`| | | | '_ \\/ __|"
    echo " | |_| | | | | | (_| | |_| | | | \\__ \\"
    echo " |____/|_|_| |_|\\__, |____/|_| |_|___/"
    echo "                |___/"
    echo ""
    echo "  DNS Management Server - v${DINGDNS_VERSION}"
    echo -e "${NC}"
}

# ============================================================
# Checks
# ============================================================
check_root() {
    if [ "$(id -u)" -ne 0 ]; then
        error "This script must be run as root. Use: sudo bash install.sh"
    fi
}

detect_os() {
    info "Detecting operating system..."
    if [ ! -f /etc/os-release ]; then
        error "Cannot detect OS. /etc/os-release not found."
    fi
    . /etc/os-release
    OS_NAME="${ID}"
    OS_VERSION="${VERSION_ID}"
    OS_PRETTY="${PRETTY_NAME}"

    case "${OS_NAME}" in
        debian|ubuntu) ;;
        *) error "Unsupported OS: ${OS_PRETTY}. Only Debian and Ubuntu are supported." ;;
    esac
    success "Detected: ${OS_PRETTY}"
}

detect_arch() {
    info "Detecting architecture..."
    ARCH=$(uname -m)
    case "${ARCH}" in
        x86_64|amd64) ARCH="amd64" ;;
        aarch64|arm64) ARCH="arm64" ;;
        *) error "Unsupported architecture: ${ARCH}" ;;
    esac
    success "Architecture: ${ARCH}"
}

# ============================================================
# Interactive config (or env-var override)
# ============================================================
# Asks the user for the few values that MUST be customized per-install.
# If env vars are pre-set, they win. If stdin is not a TTY (e.g. curl|bash
# with no </dev/tty), we fall back to the env-var value or to the default.
#
# Variables produced (used later by configure() and ensure_admin_password()):
#   CFG_DOMAIN, CFG_NS_PRIMARY, CFG_NS_SECONDARY, CFG_ADMIN_EMAIL,
#   CFG_ADMIN_PASSWORD, CFG_ADMIN_PASSWORD_AUTO
# ============================================================

# Prompt helper. Reads from /dev/tty so it works even when the script
# itself is piped via `curl | bash`. Falls back to default if no TTY.
_ask() {
    local prompt="$1"
    local default="$2"
    local secret="${3:-no}"
    local reply=""

    # If not interactive at all, just use the default
    if [ ! -r /dev/tty ] || [ ! -w /dev/tty ]; then
        echo "${default}"
        return
    fi

    if [ "${secret}" = "yes" ]; then
        # Read password without echo
        printf "%s " "${prompt}" > /dev/tty
        read -rs reply < /dev/tty
        printf "\n" > /dev/tty
    else
        if [ -n "${default}" ]; then
            printf "%s [%s]: " "${prompt}" "${default}" > /dev/tty
        else
            printf "%s: " "${prompt}" > /dev/tty
        fi
        read -r reply < /dev/tty
    fi

    if [ -z "${reply}" ]; then
        echo "${default}"
    else
        echo "${reply}"
    fi
}

prompt_config() {
    info "Configuring DingDns (press Enter to accept the [default])"
    echo ""

    # 1) Primary domain — has no good default
    CFG_DOMAIN="${DINGDNS_DOMAIN:-$(_ask "  Primary domain (e.g. dns.yourdomain.com)" "dingdns.local")}"

    # 2) NS records — derive from domain if not provided
    local default_ns1="ns1.${CFG_DOMAIN}"
    local default_ns2="ns2.${CFG_DOMAIN}"
    CFG_NS_PRIMARY="${DINGDNS_NS_PRIMARY:-$(_ask "  Primary nameserver" "${default_ns1}")}"
    CFG_NS_SECONDARY="${DINGDNS_NS_SECONDARY:-$(_ask "  Secondary nameserver" "${default_ns2}")}"

    # 3) Admin email — derive from domain if not provided
    local default_email="admin@${CFG_DOMAIN}"
    CFG_ADMIN_EMAIL="${DINGDNS_ADMIN_EMAIL:-$(_ask "  Admin email (for Let's Encrypt + alerts)" "${default_email}")}"

    # 4) Admin password — generate a random default; let the user override
    local generated_pw
    generated_pw="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)"
    CFG_ADMIN_PASSWORD_AUTO="no"
    if [ -n "${DINGDNS_ADMIN_PASSWORD:-}" ]; then
        CFG_ADMIN_PASSWORD="${DINGDNS_ADMIN_PASSWORD}"
    else
        local entered
        entered="$(_ask "  Admin password (Enter = use random: ${generated_pw})" "${generated_pw}" no)"
        CFG_ADMIN_PASSWORD="${entered}"
        if [ "${entered}" = "${generated_pw}" ]; then
            CFG_ADMIN_PASSWORD_AUTO="yes"
        fi
    fi

    echo ""
    success "Domain:    ${CFG_DOMAIN}"
    success "NS:        ${CFG_NS_PRIMARY}, ${CFG_NS_SECONDARY}"
    success "Email:     ${CFG_ADMIN_EMAIL}"
    if [ "${CFG_ADMIN_PASSWORD_AUTO}" = "yes" ]; then
        success "Password:  (auto-generated — will be shown at the end)"
    else
        success "Password:  (user-supplied — keep it safe)"
    fi
    echo ""
}

# ============================================================
# Dependencies
# ============================================================
install_dependencies() {
    info "Updating package lists..."
    apt-get update -qq > /dev/null 2>&1

    info "Installing required packages..."
    apt-get install -y -qq \
        curl wget tar gzip \
        sqlite3 \
        gcc make git \
        libcap2-bin \
        certbot \
        iptables \
        sudo \
        openssl > /dev/null 2>&1

    # Install ufw as optional convenience layer
    apt-get install -y -qq ufw > /dev/null 2>&1 || true

    success "Dependencies installed (curl, gcc, sqlite3, certbot, iptables, openssl)"
}

install_go() {
    if command -v /usr/local/go/bin/go &>/dev/null; then
        success "Go already installed"
        export PATH=$PATH:/usr/local/go/bin
        return
    fi
    info "Installing Go ${GO_VERSION}..."
    curl -sSL "https://go.dev/dl/go${GO_VERSION}.linux-${ARCH}.tar.gz" | tar -C /usr/local -xzf -
    export PATH=$PATH:/usr/local/go/bin
    success "Go installed"
}

install_node() {
    # admin-ui uses Vite 8 + React 19 → needs Node >= 20.19.
    # Debian 12 / Ubuntu 22.04 default repos ship Node 18 which silently breaks the build.
    local need_install="yes"
    if command -v node &>/dev/null; then
        local current_major
        current_major="$(node -v | sed 's/^v\([0-9]*\).*/\1/')"
        if [ -n "${current_major}" ] && [ "${current_major}" -ge "${NODE_MAJOR}" ]; then
            success "Node.js $(node -v) already installed (>= ${NODE_MAJOR})"
            need_install="no"
        else
            warn "Found Node $(node -v) — too old for the admin UI build. Upgrading to Node ${NODE_MAJOR}.x..."
        fi
    fi

    if [ "${need_install}" = "yes" ]; then
        info "Installing Node.js ${NODE_MAJOR}.x from NodeSource..."
        # Remove any older nodejs/libnode from distro repos to avoid conflicts
        apt-get remove -y -qq nodejs libnode-dev libnode72 npm > /dev/null 2>&1 || true

        # NodeSource setup script — adds the apt repo + key for Node N.x
        curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
        apt-get install -y -qq nodejs
        success "Node.js $(node -v) installed"
    fi
}

# ============================================================
# Stop conflicts
# ============================================================
stop_conflicting_services() {
    info "Checking for conflicting services..."
    if systemctl is-active --quiet systemd-resolved 2>/dev/null; then
        mkdir -p /etc/systemd/resolved.conf.d
        cat > /etc/systemd/resolved.conf.d/dingdns.conf <<EOF
[Resolve]
DNSStubListener=no
EOF
        systemctl restart systemd-resolved
        success "systemd-resolved stub listener disabled"
    fi

    # Kill anything on port 53
    if ss -tlnp 2>/dev/null | grep -q ':53 '; then
        warn "Port 53 in use, attempting to free it..."
        fuser -k 53/tcp 2>/dev/null || true
        fuser -k 53/udp 2>/dev/null || true
        sleep 1
    fi
    success "Port 53 available"
}

# ============================================================
# Setup
# ============================================================
setup_directories() {
    info "Setting up directories..."
    if ! id -u dingdns &>/dev/null; then
        useradd --system --no-create-home --shell /usr/sbin/nologin dingdns
    fi
    mkdir -p "${INSTALL_DIR}" "${INSTALL_DIR}/frontend/dist" "${INSTALL_DIR}/backups" "${DATA_DIR}" "${INSTALL_DIR}/ssl" "${LOG_DIR}"
    chown -R dingdns:dingdns "${INSTALL_DIR}" "${LOG_DIR}"

    # Allow dingdns service to run certbot as root
    echo "dingdns ALL=(root) NOPASSWD: /usr/bin/certbot" > /etc/sudoers.d/dingdns-certbot
    chmod 440 /etc/sudoers.d/dingdns-certbot

    # Allow dingdns service to manage iptables
    IPTABLES_PATH=$(command -v iptables 2>/dev/null || echo "/usr/sbin/iptables")
    echo "dingdns ALL=(root) NOPASSWD: ${IPTABLES_PATH}" > /etc/sudoers.d/dingdns-firewall
    chmod 440 /etc/sudoers.d/dingdns-firewall

    # Allow dingdns service to manage systemd services and read journalctl
    SYSTEMCTL_PATH=$(command -v systemctl 2>/dev/null || echo "/usr/bin/systemctl")
    JOURNALCTL_PATH=$(command -v journalctl 2>/dev/null || echo "/usr/bin/journalctl")
    cat > /etc/sudoers.d/dingdns-services <<EOF
dingdns ALL=(root) NOPASSWD: ${SYSTEMCTL_PATH}
dingdns ALL=(root) NOPASSWD: ${JOURNALCTL_PATH}
EOF
    chmod 440 /etc/sudoers.d/dingdns-services

    success "Directories ready"
}

# ============================================================
# Build from source
# ============================================================

# Locates backend source and copies it to BUILD_DIR/backend
_get_source() {
    local BUILD_DIR="$1"
    if [ -d "/tmp/dingdns-source/backend" ]; then
        cp -r /tmp/dingdns-source/backend "${BUILD_DIR}/"
    elif [ -d "$(dirname "$0")/../backend" ]; then
        cp -r "$(dirname "$0")/../backend" "${BUILD_DIR}/"
    else
        info "Cloning source from repository..."
        git clone --depth 1 "${REPO_URL}.git" "${BUILD_DIR}/repo" 2>/dev/null \
            || error "Failed to clone repository. Place source at /tmp/dingdns-source/backend or run from repo directory."
        cp -r "${BUILD_DIR}/repo/backend" "${BUILD_DIR}/"
    fi
}

build_frontend() {
    info "Building admin UI (frontend)..."
    BUILD_DIR=$(mktemp -d)
    _get_source "${BUILD_DIR}"

    # admin-ui lives inside the backend tree; vite outputs to ../internal/adminui/dist
    cd "${BUILD_DIR}/backend/admin-ui"

    # NOTE: we intentionally DO NOT redirect errors to /dev/null here.
    # If npm install or vite build fails, we want a loud, visible failure
    # instead of a silent install that ships a stale embedded UI.
    info "  Installing npm dependencies..."
    npm install --no-audit --no-fund --loglevel=error \
        || error "npm install failed in backend/admin-ui"

    info "  Building admin UI with Vite..."
    npx vite build \
        || error "Frontend build failed (vite). The admin UI would be missing — aborting."

    # The embed.go inside Go uses dist/* from internal/adminui/dist — built in place above.
    if [ ! -d "${BUILD_DIR}/backend/internal/adminui/dist" ]; then
        error "Vite reported success but dist/ is missing at internal/adminui/dist — check the build above."
    fi
    success "Frontend built (embedded into Go source tree)"

    # Leave BUILD_DIR in place — build_backend will reuse it
    echo "${BUILD_DIR}" > /tmp/dingdns_build_dir
}

build_backend() {
    info "Building backend (Go binary)..."

    # Reuse the same BUILD_DIR that build_frontend prepared (frontend already compiled into it)
    if [ -f /tmp/dingdns_build_dir ]; then
        BUILD_DIR=$(cat /tmp/dingdns_build_dir)
        rm -f /tmp/dingdns_build_dir
    else
        BUILD_DIR=$(mktemp -d)
        _get_source "${BUILD_DIR}"
    fi

    cd "${BUILD_DIR}/backend"
    # Don't swallow errors here — if `go mod tidy` fails (missing dep,
    # network issue, sum mismatch) we want the install to fail loudly.
    /usr/local/go/bin/go mod tidy \
        || error "go mod tidy failed — check Go module configuration and network access"
    CGO_ENABLED=1 /usr/local/go/bin/go build -ldflags="-s -w" -o "${INSTALL_DIR}/dingdns" ./cmd/dingdns/ \
        || error "Go build failed — check the output above for compile errors"

    chmod +x "${INSTALL_DIR}/dingdns"
    setcap 'cap_net_bind_service=+ep' "${INSTALL_DIR}/dingdns"
    chown dingdns:dingdns "${INSTALL_DIR}/dingdns"

    cd /
    rm -rf "${BUILD_DIR}"
    success "Backend built and binary installed"
}

# ============================================================
# Configure
# ============================================================
configure() {
    if [ -f "${CONFIG_FILE}" ]; then
        warn "Config exists, keeping current configuration"
        return
    fi

    info "Creating configuration..."
    JWT_SECRET=$(openssl rand -hex 32)
    PUBLIC_IP=$(curl -s4 --connect-timeout 5 ifconfig.me 2>/dev/null || curl -s4 --connect-timeout 5 icanhazip.com 2>/dev/null || echo "0.0.0.0")

    # Use values gathered by prompt_config(); fall back to safe placeholders
    # if this function somehow ran without prompt_config (e.g. someone called
    # configure() directly from another script).
    local cfg_domain="${CFG_DOMAIN:-dingdns.local}"
    local cfg_ns1="${CFG_NS_PRIMARY:-ns1.${cfg_domain}}"
    local cfg_ns2="${CFG_NS_SECONDARY:-ns2.${cfg_domain}}"
    local cfg_email="${CFG_ADMIN_EMAIL:-admin@${cfg_domain}}"

    cat > "${CONFIG_FILE}" <<EOF
{
  "domain": "${cfg_domain}",
  "http_port": "8080",
  "https_port": "443",
  "dns_port": "53",
  "db_path": "${DATA_DIR}/dingdns.db",
  "jwt_secret": "${JWT_SECRET}",
  "jwt_expire_hours": 24,
  "ssl_enabled": false,
  "ssl_cert": "${INSTALL_DIR}/ssl/cert.pem",
  "ssl_key": "${INSTALL_DIR}/ssl/key.pem",
  "default_ttl": 300,
  "ns_primary": "${cfg_ns1}",
  "ns_secondary": "${cfg_ns2}",
  "admin_email": "${cfg_email}",
  "data_dir": "${DATA_DIR}"
}
EOF

    chown dingdns:dingdns "${CONFIG_FILE}"
    chmod 600 "${CONFIG_FILE}"
    success "Configuration created"
}

# Writes the initial admin password to a hand-off file that the backend
# reads on first boot. The backend deletes the file after creating the
# super admin, so the secret only lives on disk for a few seconds.
write_initial_admin_password() {
    if [ -z "${CFG_ADMIN_PASSWORD:-}" ]; then
        return
    fi

    local pw_file="${INSTALL_DIR}/.initial-admin-password"
    # Skip on re-installs that already have a running admin account
    if [ -f "${INSTALL_DIR}/data/dingdns.db" ]; then
        info "Existing database detected — not overriding admin password"
        return
    fi

    printf '%s' "${CFG_ADMIN_PASSWORD}" > "${pw_file}"
    chown dingdns:dingdns "${pw_file}"
    chmod 600 "${pw_file}"
}

# ============================================================
# Systemd
# ============================================================
setup_service() {
    info "Setting up systemd service..."
    cat > /etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=DingDns - DNS Management Server
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=dingdns
Group=dingdns
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/dingdns -config ${CONFIG_FILE}
Restart=always
RestartSec=5
LimitNOFILE=65536
AmbientCapabilities=CAP_NET_BIND_SERVICE
NoNewPrivileges=false
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${DATA_DIR} ${INSTALL_DIR}/backups ${INSTALL_DIR}/config.json ${LOG_DIR} ${INSTALL_DIR}/ssl
PrivateTmp=true
StandardOutput=journal
StandardError=journal
SyslogIdentifier=dingdns

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable ${SERVICE_NAME} > /dev/null 2>&1
    success "Service installed and enabled"
}

# ============================================================
# Firewall
# ============================================================
setup_firewall() {
    info "Configuring firewall..."

    if command -v ufw &>/dev/null; then
        ufw allow 22/tcp  > /dev/null 2>&1 || true
        ufw allow 53/tcp  > /dev/null 2>&1
        ufw allow 53/udp  > /dev/null 2>&1
        ufw allow 80/tcp  > /dev/null 2>&1
        ufw allow 443/tcp > /dev/null 2>&1
        ufw allow 8080/tcp > /dev/null 2>&1
        if ! ufw status 2>/dev/null | grep -q "Status: active"; then
            ufw --force enable > /dev/null 2>&1 || true
        fi
        success "Firewall rules added: SSH(22), DNS(53), HTTP(80), HTTPS(443), Panel(8080)"
    elif command -v iptables &>/dev/null; then
        iptables -I INPUT -p tcp --dport 22   -j ACCEPT 2>/dev/null || true
        iptables -I INPUT -p tcp --dport 53   -j ACCEPT 2>/dev/null || true
        iptables -I INPUT -p udp --dport 53   -j ACCEPT 2>/dev/null || true
        iptables -I INPUT -p tcp --dport 80   -j ACCEPT 2>/dev/null || true
        iptables -I INPUT -p tcp --dport 443  -j ACCEPT 2>/dev/null || true
        iptables -I INPUT -p tcp --dport 8080 -j ACCEPT 2>/dev/null || true
        success "iptables rules added"
    else
        warn "No firewall detected — make sure ports 22, 53, 80, 443, 8080 are open"
    fi
}

# ============================================================
# Start
# ============================================================
start_service() {
    info "Starting DingDns..."
    systemctl start ${SERVICE_NAME}
    sleep 3
    if systemctl is-active --quiet ${SERVICE_NAME}; then
        success "DingDns is running!"
    else
        echo ""
        journalctl -u ${SERVICE_NAME} -n 15 --no-pager
        error "DingDns failed to start. Check logs above."
    fi
}

# ============================================================
# Summary
# ============================================================
print_summary() {
    PUBLIC_IP=$(curl -s4 --connect-timeout 5 ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")
    echo ""
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}   DingDns Installation Complete!${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    echo -e "  ${CYAN}Admin Panel:${NC}  http://${PUBLIC_IP}:8080/admin"
    echo -e "  ${CYAN}DNS Server:${NC}   ${PUBLIC_IP}:53"
    echo -e "  ${CYAN}API:${NC}          http://${PUBLIC_IP}:8080/api"
    echo ""
    echo -e "  ${YELLOW}Admin Login:${NC}"
    echo -e "    Username:  admin"
    if [ -n "${CFG_ADMIN_PASSWORD:-}" ]; then
        echo -e "    Password:  ${CFG_ADMIN_PASSWORD}"
        if [ "${CFG_ADMIN_PASSWORD_AUTO:-no}" = "yes" ]; then
            echo -e "    ${YELLOW}(auto-generated — save it now, it won't be shown again)${NC}"
        fi
    else
        echo -e "    Password:  (check ${INSTALL_DIR}/.initial-admin-password)"
    fi
    echo ""
    echo -e "  ${CYAN}Firewall ports open:${NC}  22 (SSH), 53 (DNS), 80 (HTTP/SSL), 443 (HTTPS), 8080 (Panel)"
    echo ""
    echo -e "  ${CYAN}SSL Certificate (after pointing domain DNS to this server):${NC}"
    echo -e "    1. Go to Admin Panel → Settings → General"
    echo -e "       Set API Domain: api.yourdomain.com"
    echo -e "    2. Go to Server → SSL Certificate"
    echo -e "       Click 'Issue Certificate' — certbot is already installed!"
    echo ""
    echo -e "  ${CYAN}DDNS Update URL:${NC}"
    echo -e "    curl \"http://${PUBLIC_IP}:8080/api/ddns/update?token=YOUR_TOKEN\""
    echo ""
    echo -e "  ${CYAN}Commands:${NC}"
    echo -e "    systemctl status dingdns"
    echo -e "    systemctl restart dingdns"
    echo -e "    journalctl -u dingdns -f"
    echo ""
}

# ============================================================
# Uninstall
# ============================================================
uninstall() {
    banner
    warn "Uninstalling DingDns..."
    systemctl stop ${SERVICE_NAME} 2>/dev/null || true
    systemctl disable ${SERVICE_NAME} 2>/dev/null || true
    rm -f /etc/systemd/system/${SERVICE_NAME}.service
    systemctl daemon-reload

    read -rp "Remove all data and config? (y/N): " REMOVE_DATA
    if [[ "${REMOVE_DATA}" =~ ^[Yy]$ ]]; then
        rm -rf "${INSTALL_DIR}" "${LOG_DIR}"
        success "All data removed"
    else
        rm -f "${INSTALL_DIR}/dingdns"
        rm -rf "${INSTALL_DIR}/frontend"
        success "Binary removed. Data preserved at ${DATA_DIR}"
    fi
    userdel dingdns 2>/dev/null || true
    success "DingDns uninstalled"
}

# ============================================================
# Update
# ============================================================
update() {
    banner
    info "Updating DingDns..."
    check_root
    detect_os
    detect_arch
    install_dependencies
    install_go
    install_node
    systemctl stop ${SERVICE_NAME} 2>/dev/null || true
    build_frontend
    build_backend
    systemctl start ${SERVICE_NAME}
    sleep 2
    if systemctl is-active --quiet ${SERVICE_NAME}; then
        success "DingDns updated and running!"
    else
        error "Update failed. Check: journalctl -u dingdns -n 20"
    fi
}

# ============================================================
# Main
# ============================================================
main() {
    banner

    case "${1:-}" in
        --uninstall|uninstall) check_root; uninstall; exit 0 ;;
        --update|update) update; exit 0 ;;
    esac

    check_root
    detect_os
    detect_arch
    prompt_config
    stop_conflicting_services
    install_dependencies
    install_go
    install_node
    setup_directories
    build_frontend
    build_backend
    configure
    write_initial_admin_password
    setup_service
    setup_firewall
    start_service
    print_summary
}

main "$@"
