#!/bin/sh
set -e

echo "==> Running Prisma db push"
cd packages/db
npx prisma db push --accept-data-loss

cd /app

echo "==> Starting API"
exec node apps/api/dist/index.js
