#!/bin/bash
set -e

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║        GenFrenzy v2 — Local Start        ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Check Redis
if command -v redis-cli &>/dev/null; then
  if redis-cli ping 2>/dev/null | grep -q PONG; then
    echo "✅ Redis is running"
  else
    echo "⚠️  Redis not responding — starting with Docker..."
    docker run -d -p 6379:6379 --name genfrenzy-redis redis:alpine 2>/dev/null || true
    sleep 1
    echo "✅ Redis started"
  fi
else
  echo "⚠️  redis-cli not found. Make sure Redis is running:"
  echo "   docker run -d -p 6379:6379 redis:alpine"
fi

echo ""
echo "▶ Starting backend on :4000..."
cd backend && npm install --silent && npm run dev &
BACK=$!

echo "▶ Starting frontend on :3000..."
cd ../frontend && npm install --silent && npm run dev &
FRONT=$!

echo ""
echo "┌─────────────────────────────────────────┐"
echo "│  Players  →  http://localhost:3000      │"
echo "│  Admin    →  http://localhost:3000/admin│"
echo "│  Backend  →  http://localhost:4000      │"
echo "└─────────────────────────────────────────┘"
echo ""
echo "  Admin password: genfrenzy2024"
echo ""
echo "  Press Ctrl+C to stop all services"
echo ""

trap "echo ''; echo 'Stopping...'; kill $BACK $FRONT 2>/dev/null; exit 0" INT TERM
wait
