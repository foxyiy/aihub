#!/bin/bash

# AIHub Server 一键部署
set -e

echo "🚀 Installing AIHub Server..."

npm install --production 2>/dev/null
npm run build 2>/dev/null

echo "✅ Build complete."
echo ""
echo "Starting server on port ${1:-8642}..."
echo "Logs: ~/aihub/aihub.log"
echo "Stop: kill \$(cat ~/.aihub-server.pid)"
echo ""

PORT=${1:-8642}
nohup node dist/src/server/run.js $PORT > aihub.log 2>&1 &
echo $! > ~/.aihub-server.pid

sleep 1
if curl -s "http://127.0.0.1:$PORT/health" > /dev/null 2>&1; then
  echo "✅ AIHub Server running on http://0.0.0.0:$PORT (PID: $(cat ~/.aihub-server.pid))"
  echo ""
  echo "Client config (run on your local machine):"
  echo "  echo 'serverUrl: \"http://YOUR_SERVER_IP:$PORT\"' > ~/.aihub-client.yaml"
else
  echo "❌ Server failed to start. Check aihub.log"
fi
