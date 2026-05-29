#!/bin/bash
set -euo pipefail

apt-get update
apt-get install -y curl ca-certificates gnupg jq unzip

# Node 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
npm install -g pm2

# Redis
apt-get install -y redis-server
sed -i 's/^# maxmemory <bytes>/maxmemory 512mb/' /etc/redis/redis.conf
sed -i 's/^# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf
sed -i 's/^appendonly no/appendonly yes/' /etc/redis/redis.conf
systemctl enable --now redis-server

# Caddy — auto-TLS reverse proxy
apt-get install -y debian-keyring debian-keyring-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

# AWS CLI for fetching secrets at boot
apt-get install -y awscli

# App user
useradd -m -s /bin/bash app || true
mkdir -p /opt/assistant
chown app:app /opt/assistant

# Bootstrap script for the app to fetch secrets
cat <<'EOF' > /usr/local/bin/assistant-env
#!/bin/bash
set -euo pipefail
aws secretsmanager get-secret-value \
  --secret-id "${secret_id}" \
  --region "${region}" \
  --query SecretString \
  --output text | jq -r 'to_entries | map("\(.key)=\(.value)") | .[]'
EOF
chmod +x /usr/local/bin/assistant-env

# Caddyfile — proxies to Node app on :4000
cat <<'EOF' > /etc/caddy/Caddyfile
:443 {
  # CloudFront will terminate TLS; this is just internal HTTPS
  tls internal
  reverse_proxy 127.0.0.1:4000
}
:80 {
  redir https://{host}{uri}
}
EOF
systemctl reload caddy

echo "user-data complete — deploy app via SSM or git pull"
