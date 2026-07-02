#!/bin/bash
set -e

SERVICE_NAME="google-maps-mcp"
APP_DIR="/opt/google-maps-mcp"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
ENV_FILE="/etc/default/${SERVICE_NAME}"

if [ -z "$GOOGLE_MAPS_API_KEY" ]; then
  echo "Export GOOGLE_MAPS_API_KEY before running this script."
  exit 1
fi

echo "==> Installing system packages"
sudo apt-get update
sudo apt-get install -y python3 python3-venv python3-pip git

USE_HTTPS=false
if [ -n "$DOMAIN" ]; then
  USE_HTTPS=true
  sudo apt-get install -y caddy
fi

echo "==> Copying app to ${APP_DIR}"
sudo mkdir -p "$APP_DIR"
sudo rsync -a \
  --exclude='.env' --exclude='.git' --exclude='__pycache__' --exclude='.claude' \
  "$(pwd)/" "$APP_DIR/"

echo "==> Installing Python dependencies"
sudo python3 -m venv "$APP_DIR/venv"
sudo "$APP_DIR/venv/bin/pip" install --upgrade pip
sudo "$APP_DIR/venv/bin/pip" install -r "$APP_DIR/requirements.txt"

echo "==> Writing environment file"
echo "GOOGLE_MAPS_API_KEY=${GOOGLE_MAPS_API_KEY}" | sudo tee "$ENV_FILE" >/dev/null
echo "MCP_TRANSPORT=sse" | sudo tee -a "$ENV_FILE" >/dev/null

if [ "$USE_HTTPS" = true ]; then
  echo "MCP_HOST=127.0.0.1" | sudo tee -a "$ENV_FILE" >/dev/null
else
  echo "MCP_HOST=0.0.0.0" | sudo tee -a "$ENV_FILE" >/dev/null
fi

echo "MCP_PORT=3000" | sudo tee -a "$ENV_FILE" >/dev/null

echo "==> Writing systemd service"
sudo tee "$SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=Google Maps MCP Server
After=network.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=${APP_DIR}/venv/bin/python ${APP_DIR}/server.py
Restart=always

[Install]
WantedBy=multi-user.target
EOF

echo "==> Starting MCP server"
sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE_NAME"

if [ "$USE_HTTPS" = true ]; then
  echo "==> Writing Caddyfile"
  sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
${DOMAIN} {
    reverse_proxy 127.0.0.1:3000
}
EOF
  sudo systemctl restart caddy
  echo "==> Done. MCP server is running at https://${DOMAIN}/sse"
else
  PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 || hostname -I | awk '{print $1}')
  echo "==> Done. MCP server is running at http://${PUBLIC_IP}:3000/sse"
fi
