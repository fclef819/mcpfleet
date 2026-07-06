#!/usr/bin/env bash
set -euo pipefail

if [[ -f "mise.toml" || -f ".mise.toml" || -f ".tool-versions" ]]; then
  mise trust --yes || true
  mise install
fi

corepack enable
corepack prepare pnpm@latest --activate
yes Y | pnpm -v > /dev/null || true

echo "-------------------------"
echo "RUNTIME"
echo "-------------------------"
echo "node:   $(command -v node >/dev/null 2>&1 && node -v || echo 'not installed')"
echo "python: $(command -v python >/dev/null 2>&1 && python --version || command -v python3 >/dev/null 2>&1 && python3 --version || echo 'not installed')"
echo "-------------------------"
echo "npm:    $(command -v npm >/dev/null 2>&1 && npm -v || echo 'not installed')"
echo "pnpm:   $(command -v pnpm >/dev/null 2>&1 && pnpm -v || echo 'not installed')"
echo "uv:     $(command -v uv >/dev/null 2>&1 && uv --version || echo 'not installed')"
echo "just:   $(command -v just >/dev/null 2>&1 && just --version || echo 'not installed')"
echo "codex:  $(command -v codex >/dev/null 2>&1 && codex --version || echo 'not installed')"

