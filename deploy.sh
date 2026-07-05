#!/usr/bin/env bash
set -euo pipefail

# Production deployment script for Travel Planner Chat
# Usage: ./deploy.sh

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$PROJECT_DIR/.env"
REQUIRED_VARS=("OLLAMA_API_KEY" "MAPS_API_KEY")

if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: $ENV_FILE not found."
    echo "Copy .env.example and fill in your API keys:"
    echo "  cp .env.example .env"
    exit 1
fi

# Validate required variables
missing=0
for var in "${REQUIRED_VARS[@]}"; do
    if ! grep -qE "^${var}=[^[:space:]]+" "$ENV_FILE"; then
        echo "ERROR: $var is missing or empty in $ENV_FILE"
        missing=1
    fi
done

if [ "$missing" -ne 0 ]; then
    exit 1
fi

echo "Building and deploying Travel Planner Chat..."
cd "$PROJECT_DIR"

docker compose down 2>/dev/null || true
docker compose up --build -d

echo ""
echo "Waiting for backend health check..."
for i in {1..30}; do
    if curl -fsS http://localhost/api/health >/dev/null 2>&1; then
        echo "Backend is healthy."
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "WARNING: Backend health check timed out. Check logs with: docker compose logs backend"
        exit 1
    fi
    sleep 2
done

echo ""
echo "Deployment complete."
echo "  App:       http://localhost"
echo "  API:       http://localhost/api/health"
echo ""
echo "View logs:  docker compose logs -f"
echo "Stop:       docker compose down"
