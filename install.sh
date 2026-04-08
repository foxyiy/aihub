#!/bin/bash
set -e

echo "📦 Installing AIHub..."
echo ""

# Check node version
NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 20 ]; then
  echo "❌ Node.js >= 20 required. Current: $(node -v 2>/dev/null || echo 'not installed')"
  exit 1
fi

# Install dependencies
echo "→ Installing dependencies..."
npm install --production 2>&1 | tail -1

# Build
echo "→ Building..."
npm run build 2>&1 | tail -1

# Link globally
echo "→ Registering global command..."
npm link 2>&1 | tail -1

echo ""
echo "✅ AIHub installed successfully!"
echo ""
echo "Usage:"
echo "  aihub server start       Start the data server"
echo "  aihub server status      Check server status"
echo "  aihub server stop        Stop the server"
echo "  aihub init               Register a project"
echo "  aihub chat --agent xxx   Start an agent session"
echo "  aihub --help             See all commands"
