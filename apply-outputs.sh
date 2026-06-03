#!/bin/bash
# =============================================================================
# apply-outputs.sh
# Chạy từ thư mục gốc repo: bash apply-outputs.sh <path-to-outputs>
# Mặc định outputs nằm cùng cấp với script
# =============================================================================

set -e

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
OUTPUTS_DIR="${1:-$REPO_ROOT}"

echo "📂 Repo root: $REPO_ROOT"
echo "📦 Outputs dir: $OUTPUTS_DIR"
echo ""

copy_if_exists() {
  local src="$OUTPUTS_DIR/$1"
  local dst="$REPO_ROOT/$2"

  if [ -f "$src" ]; then
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    echo "✅ $2"
  else
    echo "⏭  skip (không tìm thấy): $1"
  fi
}

# ── Frontend ──────────────────────────────────────────────────────────────────
copy_if_exists "src/App.css"                          "src/App.css"
copy_if_exists "src/hooks/useGameState.js"            "src/hooks/useGameState.js"
copy_if_exists "src/hooks/useMultiplayer.js"          "src/hooks/useMultiplayer.js"
copy_if_exists "src/hooks/useWebSocket.js"            "src/hooks/useWebSocket.js"
copy_if_exists "src/hooks/useAuth.js"                 "src/hooks/useAuth.js"
copy_if_exists "src/pages/GameBoard.jsx"              "src/pages/GameBoard.jsx"
copy_if_exists "src/pages/MainMenu.jsx"               "src/pages/MainMenu.jsx"
copy_if_exists "src/components/ChessBoard.jsx"        "src/components/ChessBoard.jsx"
copy_if_exists "src/components/PlayerPanel.jsx"       "src/components/PlayerPanel.jsx"
copy_if_exists "src/components/ResultOverlay.jsx"     "src/components/ResultOverlay.jsx"
copy_if_exists "src/components/DrawBanner.jsx"        "src/components/DrawBanner.jsx"
copy_if_exists "src/components/LobbyList.jsx"         "src/components/LobbyList.jsx"
copy_if_exists "src/components/Leaderboard.jsx"       "src/components/Leaderboard.jsx"
copy_if_exists "src/core/chessLogic.js"               "src/core/chessLogic.js"

# ── Cloudflare Worker ────────────────────────────────────────────────────────
copy_if_exists "cloudflare-worker/src/game-room.js"   "cloudflare-worker/src/game-room.js"
copy_if_exists "cloudflare-worker/wrangler.toml"      "cloudflare-worker/wrangler.toml"

echo ""
echo "🔍 Git status:"
git -C "$REPO_ROOT" status --short

echo ""
echo "✨ Xong. Chạy tiếp:"
echo "   git add -A && git commit -m 'apply Claude outputs' && git push"