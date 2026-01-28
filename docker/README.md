# UCP App Docker Development Environment

Local development setup with Shopware 6.7 (Dockware) and the UCP App server.

## Quick Start

```bash
cd docker
./start.sh
```

Wait ~2 minutes for first startup. The script will:
1. Start Shopware 6.7 and UCP server containers
2. Install and activate the UCP App in Shopware
3. Show you all the URLs when ready

## Endpoints

| Service | URL | Credentials |
|---------|-----|-------------|
| Shopware Shop | http://localhost | - |
| Shopware Admin | http://localhost/admin | admin / shopware |
| UCP Server | http://localhost:3000 | - |
| UCP Profile | http://localhost:3000/ucp/profile | - |
| Database Admin | http://localhost:8888 | root / root |

## Commands

```bash
# Start environment
./start.sh

# Stop environment
./stop.sh

# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f shopware
docker-compose logs -f ucp-server

# Fresh start (removes all data)
docker-compose down -v
./start.sh

# Shell access
docker exec -it shopware-ucp bash
docker exec -it ucp-server sh

# Reinstall UCP App
docker exec shopware-ucp bin/console app:refresh
docker exec shopware-ucp bin/console app:install UcpApp --activate --force
```

## Development

The UCP server runs with hot-reload enabled. Changes to files in `shopware-ucp-app/server/src/` will automatically restart the server.

For Admin UI changes, you need to rebuild the Shopware storefront:
```bash
docker exec shopware-ucp bin/console theme:compile
```
