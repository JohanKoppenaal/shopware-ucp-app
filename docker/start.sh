#!/bin/bash

# UCP App Development Environment Startup Script
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Starting UCP App Development Environment..."
echo ""

# Start containers
docker-compose up -d

echo ""
echo "⏳ Waiting for Shopware to start (this takes ~2 minutes on first run)..."
echo ""

# Wait for Shopware to be ready
MAX_ATTEMPTS=60
ATTEMPT=0
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost/admin 2>/dev/null | grep -q "200\|302"; then
        echo "✅ Shopware is ready!"
        break
    fi
    ATTEMPT=$((ATTEMPT + 1))
    echo "   Waiting... ($ATTEMPT/$MAX_ATTEMPTS)"
    sleep 5
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo "⚠️  Shopware took longer than expected. Check logs with: docker-compose logs shopware"
fi

echo ""
echo "📦 Installing UCP App in Shopware..."

# Copy app to Shopware and install
docker exec shopware-ucp bash -c "
    rm -rf /var/www/html/custom/apps/UcpApp
    mkdir -p /var/www/html/custom/apps/UcpApp
    cp -r /tmp/ucp-app/manifest.xml /var/www/html/custom/apps/UcpApp/
    cp -r /tmp/ucp-app/admin /var/www/html/custom/apps/UcpApp/ 2>/dev/null || true
    chown -R www-data:www-data /var/www/html/custom/apps/UcpApp
"

# Refresh and install the app
docker exec shopware-ucp bash -c "
    cd /var/www/html
    bin/console app:refresh
    bin/console app:install UcpApp --activate --force 2>/dev/null || bin/console app:activate UcpApp
"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ Development environment is ready!"
echo ""
echo "📍 Endpoints:"
echo "   Shopware Shop:    http://localhost"
echo "   Shopware Admin:   http://localhost/admin"
echo "                     Login: admin / shopware"
echo "   UCP Server:       http://localhost:3000"
echo "   UCP Profile:      http://localhost:3000/ucp/profile"
echo "   Database Admin:   http://localhost:8888"
echo ""
echo "📝 Useful commands:"
echo "   View logs:        docker-compose logs -f"
echo "   Stop:             docker-compose down"
echo "   Restart:          docker-compose restart"
echo "   Shell Shopware:   docker exec -it shopware-ucp bash"
echo "   Shell UCP:        docker exec -it ucp-server sh"
echo "════════════════════════════════════════════════════════════════"
