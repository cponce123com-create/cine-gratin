#!/usr/bin/env bash
set -euo pipefail

echo "=== Installing yt-dlp for video downloads (non-fatal) ==="
# Install yt-dlp binary
mkdir -p ~/.local/bin
curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ~/.local/bin/yt-dlp-bin && chmod a+rx ~/.local/bin/yt-dlp-bin
# Create wrapper that adds nix python3 to PATH before calling the binary
cat > ~/.local/bin/yt-dlp << 'WRAPPER'
#!/usr/bin/env bash
PYTHON3=$(command -v python3 || echo "/nix/store/gr0kqw545gzc5p7d6rxigg68arvf7qj5-python3-3.12.8-env/bin/python3")
export PATH="$(dirname "$PYTHON3"):$PATH"
exec ~/.local/bin/yt-dlp-bin "$@"
WRAPPER
chmod a+rx ~/.local/bin/yt-dlp
echo "yt-dlp installed at ~/.local/bin/yt-dlp"

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
