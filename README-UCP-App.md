# Shopware 6 UCP App

Een Shopware 6 App die het **Universal Commerce Protocol (UCP)** implementeert, waarmee AI agents zoals Google Gemini, ChatGPT en Microsoft Copilot producten kunnen ontdekken en aankopen namens klanten.

## Status: ✅ Volledig Geïmplementeerd

Alle 12 prompts (0-11) zijn geïmplementeerd:

| Prompt | Beschrijving | Status |
|--------|--------------|--------|
| 0 | Project Setup & Context | ✅ |
| 1 | Shopware App Manifest | ✅ |
| 2 | App Registration & Lifecycle | ✅ |
| 3 | UCP Profile Endpoint | ✅ |
| 4 | Checkout Sessions CRUD | ✅ |
| 5 | Cart & Fulfillment | ✅ |
| 6 | Address & Discounts | ✅ |
| 7 | Payment Handlers | ✅ |
| 8 | MCP Transport | ✅ |
| 9 | Order Webhooks & Status Sync | ✅ |
| 10 | Testing & Deployment | ✅ |
| 11 | Admin UI Module | ✅ |

## Quick Start (Docker)

De snelste manier om te starten:

```bash
cd docker
./start.sh
```

Dit start:
- **Shopware 6.6** op http://localhost (admin: `admin` / `shopware`)
- **UCP Server** op http://localhost:3000
- **PostgreSQL** database

Na ~2 minuten is alles klaar en de UCP App automatisch geïnstalleerd.

### Endpoints

| Endpoint | URL |
|----------|-----|
| Shopware Shop | http://localhost |
| Shopware Admin | http://localhost/admin |
| UCP Profile | http://localhost:3000/.well-known/ucp |
| MCP Endpoint | http://localhost:3000/mcp |
| MCP SSE Streaming | http://localhost:3000/mcp/sse |
| Health Check | http://localhost:3000/health |

### Docker Commands

```bash
# Start
cd docker && ./start.sh

# Stop
./stop.sh

# Logs bekijken
docker-compose logs -f

# Fresh start (verwijdert alle data)
docker-compose down -v && ./start.sh
```

## Handmatige Installatie

### Vereisten

- Node.js 20+
- PostgreSQL 15+
- Shopware 6.5+ of 6.6+

### Server Setup

```bash
cd shopware-ucp-app/server

# Dependencies
npm install

# Environment
cp .env.example .env
# Pas DATABASE_URL en andere variabelen aan

# Database
npx prisma generate
npx prisma db push

# Start (development)
npm run dev

# Of production
npm run build && npm start
```

### Tests

```bash
cd shopware-ucp-app/server
npm test
```

106 tests over 7 test suites.

## Features

### UCP Protocol Support

- **UCP Profile** (`/.well-known/ucp`) - Service discovery
- **Checkout Sessions** - Create, update, complete checkout flows
- **Fulfillment Options** - Shipping methods met real-time pricing
- **Discounts** - Coupon/promo code validatie
- **Order Management** - Order creation & status tracking

### Payment Handlers

- **Google Pay** - Directe Google Pay integratie
- **Mollie** - iDEAL, Bancontact, creditcard, etc.
- **Business Tokenizer** - PCI-compliant card tokenization

### MCP Transport

- JSON-RPC 2.0 over HTTP POST
- Server-Sent Events (SSE) voor streaming
- 7 tools: create_checkout, get_checkout, update_checkout, complete_checkout, cancel_checkout, list_shipping_options, list_payment_methods

### Admin UI

- **Dashboard** - Statistics, conversion rates, revenue
- **Payment Handlers** - Configuratie per handler
- **Logs** - Checkout sessions en webhook deliveries

## Project Structuur

```
shopware-ucp-app/
├── manifest.xml              # Shopware App manifest
├── admin/                    # Admin UI modules
│   └── src/module/
│       ├── ucp-dashboard/    # Dashboard statistieken
│       ├── ucp-logs/         # Sessions & webhooks logs
│       └── ucp-payment-handlers/  # Handler configuratie
└── server/                   # Node.js/Express server
    ├── src/
    │   ├── handlers/         # Payment handlers
    │   ├── repositories/     # Data access
    │   ├── routes/           # API endpoints
    │   └── services/         # Business logic
    └── tests/                # Jest tests
```

## Architectuur

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   AI Agent      │────▶│   UCP App       │────▶│    Shopware     │
│   (Platform)    │     │   Server        │     │    Store        │
│                 │     │                 │     │                 │
│ - Google Gemini │     │ - Profile       │     │ - Store API     │
│ - ChatGPT       │     │ - Checkout      │     │ - Admin API     │
│ - Copilot       │     │ - Payments      │     │ - Webhooks      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                      │                       │
         │   UCP Protocol       │   OAuth/REST          │
         │   (REST/MCP)         │                       │
         └──────────────────────┴───────────────────────┘
```

## Documentatie

| Bestand | Beschrijving |
|---------|--------------|
| `PRD-Shopware6-UCP-App.md` | Product Requirements Document |
| `Claude-Code-Prompts-UCP-App.md` | Implementation prompts |
| `docker/README.md` | Docker setup documentatie |

## Links

### UCP Protocol
- Specificatie: https://ucp.dev/specification/overview
- GitHub: https://github.com/Universal-Commerce-Protocol/ucp

### Shopware
- App Base Guide: https://developer.shopware.com/docs/guides/plugins/apps/app-base-guide.html
- Store API: https://shopware.stoplight.io/docs/store-api/
- Admin API: https://shopware.stoplight.io/docs/admin-api/
