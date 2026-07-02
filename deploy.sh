#!/bin/bash
set -e

APP_DIR="/opt/maps-agent"

if [ ! -f ".env" ]; then
  echo "Create a .env file in the project root with GOOGLE_MAPS_API_KEY, OLLAMA_BASE_URL, OLLAMA_API_KEY, OLLAMA_MODEL."
  exit 1
fi

echo "==> Installing Docker"
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git rsync
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "==> Copying app to ${APP_DIR}"
sudo mkdir -p "$APP_DIR"
sudo rsync -a \
  --exclude='.env' --exclude='.git' --exclude='node_modules' --exclude='.next' --exclude='dist' --exclude='.claude' \
  "$(pwd)/" "$APP_DIR/"
sudo cp .env "$APP_DIR/.env"

echo "==> Building and starting containers"
cd "$APP_DIR"
sudo docker compose down || true
sudo docker compose --env-file .env up -d --build

PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 || hostname -I | awk '{print $1}')
echo ""
echo "==> Done."
echo "    API:  http://${PUBLIC_IP}:3000/health"
echo "    Web:  http://${PUBLIC_IP}:3001"
echo ""
echo "If you need HTTPS, run a Cloudflare tunnel:"
echo "    nohup sudo cloudflared tunnel --url http://127.0.0.1:3001 > /tmp/tunnel.log 2>&1 &"
echo "Then get the URL:"
echo "    grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' /tmp/tunnel.log | head -1"
