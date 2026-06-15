#!/usr/bin/env bash
set -euo pipefail

echo "=== Installing yt-dlp for video downloads ==="
curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp

echo "=== Installing workspace dependencies ==="
# Ensure devDependencies (vite) are installed for the build
NODE_ENV=development pnpm install --frozen-lockfile

echo "=== Building frontend ==="
pushd frontend > /dev/null
NODE_ENV=production pnpm run build
popd > /dev/null

echo "=== Copying frontend dist to API server public/ ==="
mkdir -p artifacts/api-server/public
cp -r frontend/dist/. artifacts/api-server/public/

echo "=== Building API server ==="
pushd artifacts/api-server > /dev/null
pnpm build
popd > /dev/null

echo "=== Build complete ==="
