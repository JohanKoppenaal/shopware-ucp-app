#!/bin/bash

# UCP App Development Environment Stop Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🛑 Stopping UCP App Development Environment..."

docker-compose down

echo "✅ Environment stopped."
echo ""
echo "💡 To remove all data (fresh start): docker-compose down -v"
