#!/usr/bin/env bash
# ==============================================================================
# Luxury Motors — Automated Production Deployment Script for Ubuntu
# Usage: sudo bash scripts/deploy-ubuntu.sh
# ==============================================================================

set -euo pipefail

echo '=================================================='
echo '  Luxury Motors — Automated Production Setup'
echo '=================================================='

# 1. System Updates & Build Essentials for sqlite3
echo '[1/6] Installing build tools and web server packages...'
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git build-essential python3 make g++ ufw nginx certbot python3-certbot-nginx

# 2. Install Node.js 20 LTS
echo '[2/6] Setting up Node.js 20 LTS...'
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo 'Node version: ' v24.16.0
echo 'NPM version:  ' 11.13.0

# 3. Install PM2 Globally
echo '[3/6] Installing PM2 process manager...'
npm install -g pm2

# 4. Project Dependencies & Permissions
echo '[4/6] Installing production dependencies...'
npm ci --omit=dev

mkdir -p public/uploads
chmod 755 public/uploads
if [ -f 'showroom.db' ]; then
  chmod 664 showroom.db
fi

if [ ! -f '.env' ]; then
  echo 'Creating .env from .env.example...'
  cp .env.example .env
fi

# 5. Start Application with PM2
echo '[5/6] Starting application with PM2...'
pm2 delete luxury-motors 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root || true

# 6. Firewall Configuration (UFW)
echo '[6/6] Configuring firewall rules...'
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo '=================================================='
echo '  SUCCESS! App is running locally on port 3000'
echo '  Now link your domain in Nginx and run Certbot!'
echo '=================================================='
