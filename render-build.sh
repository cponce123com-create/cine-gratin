#!/usr/bin/env bash
set -e

echo "=== Installing dependencies ==="
pnpm install --frozen-lockfile

echo "=== Building frontend ==="
cd frontend
pnpm build
cd ..

echo "=== Copying frontend dist to API server public/ ==="
mkdir -p artifacts/api-server/public
cp -r frontend/dist/. artifacts/api-server/public/

echo "=== Building API server ==="
cd artifacts/api-server
pnpm build
cd ../..

echo "=== Build complete ==="
