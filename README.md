# DingDns

Self-hosted DNS Management Server with admin panel, DDNS support, and API.

## Features

- Full DNS zone & record management
- Dynamic DNS (DDNS) with token-based updates
- Admin panel (React + Ant Design)
- API key management with usage logging
- Backup & restore (SQLite)
- Service management (start/stop/restart/logs)
- Audit logs, IP bans, firewall management
- SSL certificate via Let's Encrypt (certbot)

## Install

```bash
# On a fresh Debian/Ubuntu VPS (as root):
curl -sSL https://raw.githubusercontent.com/mfattahi980/dingdns/main/installer/install.sh | bash
```

Or manually:
```bash
git clone https://github.com/mfattahi980/dingdns.git
cd dingdns
sudo bash installer/install.sh
```

## Default Login

After install, open `http://YOUR_SERVER_IP:8080/admin`

- Username: `admin`
- Password: `admin123`

> **Change immediately after first login!**

## Update

```bash
sudo bash installer/install.sh update
```

## Uninstall

```bash
sudo bash installer/install.sh uninstall
```

## Stack

- **Backend:** Go (Gin, GORM, SQLite)
- **Frontend:** React + TypeScript + Ant Design + Vite
- **Database:** SQLite (MySQL/PostgreSQL migration supported)
