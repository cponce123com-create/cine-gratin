#!/usr/bin/env bash
set -euo pipefail

echo "=== Installing workspace dependencies ==="
pnpm install --frozen-lockfile

echo "=== Building frontend ==="
pushd frontend > /dev/null
pnpm run build
popd > /dev/null

echo "=== Copying frontend dist to API server public/ ==="
mkdir -p artifacts/api-server/public
cp -r frontend/dist/. artifacts/api-server/public/

echo "=== Building API server ==="
pushd artifacts/api-server > /dev/null
pnpm build
popd > /dev/null

echo "=== Build complete ==="
