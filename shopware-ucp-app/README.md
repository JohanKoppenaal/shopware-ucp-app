# Shopware 6 UCP App

A Shopware 6 App that implements the **Universal Commerce Protocol (UCP)** for agentic commerce. This app enables AI agents like Google Gemini, ChatGPT, and Microsoft Copilot to discover products and complete purchases on behalf of customers.

## Features

- **UCP Profile Endpoint** (`/.well-known/ucp`) - Declares supported capabilities and payment handlers
- **Checkout Sessions** - Full checkout lifecycle: create, update, complete, cancel
- **Payment Handlers** - Google Pay, Business Tokenizer (Mollie, Stripe, Adyen)
- **MCP Transport** - Model Context Protocol binding for direct LLM integration
- **Order Webhooks** - Real-time order status updates to AI platforms
- **Shopware Integration** - Full Store API and Admin API integration

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   AI Agent      │────▶│   UCP App       │────▶│    Shopware     │
│   (Platform)    │     │   Server        │     │    Store        │
│                 │     │                 │     │                 │
│ - Google Gemini │     │ - Profile       │     │ - Store API     │
│ - ChatGPT       │     │ - Checkout      │     │ - Admin API     │
│ - Copilot       │     │ - Payments      │     │ - Webhooks      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 15+
- A Shopware 6.5+ installation

### Development Setup

1. **Clone and install dependencies:**

```bash
cd shopware-ucp-app/server
npm install
```

2. **Set up environment:**

```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start services with Docker:**

```bash
docker-compose -f docker-compose.dev.yml up -d
```

4. **Run database migrations:**

```bash
npm run db:migrate
```

5. **Start development server:**

```bash
npm run dev
```

The server will be available at `http://localhost:3000`.

### Install in Shopware

1. Place the `manifest.xml` and `Resources/` folder in your Shopware app directory
2. Update URLs in `manifest.xml` to point to your UCP App Server
3. Install the app:

```bash
bin/console app:install --activate UcpCommerce
```

## API Endpoints

### UCP Profile

```
GET /.well-known/ucp
```

Returns the UCP profile with supported services, capabilities, and payment handlers.

### Checkout Sessions

```
POST   /api/v1/checkout-sessions          # Create session
GET    /api/v1/checkout-sessions/{id}     # Get session
PATCH  /api/v1/checkout-sessions/{id}     # Update session
POST   /api/v1/checkout-sessions/{id}/complete  # Complete checkout
DELETE /api/v1/checkout-sessions/{id}     # Cancel session
```

### MCP Transport

```
POST /mcp
```

JSON-RPC 2.0 endpoint for Model Context Protocol.

### Health

```
GET /health         # Basic health check
GET /health/ready   # Readiness check with dependencies
GET /health/live    # Liveness probe
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `REDIS_URL` | Redis connection string | - |
| `APP_SECRET` | Shopware app secret (min 32 chars) | - |
| `UCP_SERVER_URL` | Public URL of this server | - |
| `GOOGLE_PAY_MERCHANT_ID` | Google Pay merchant ID | - |
| `PSP_TYPE` | Payment processor (mollie/stripe/adyen) | `mollie` |

### Shopware App Configuration

Configure the app in Shopware Admin under Settings > UCP Commerce:

- **UCP App Server URL** - Your server's public URL
- **API Key** - Authentication key
- **Capabilities** - Enable/disable checkout, order, MCP features
- **Payment Handlers** - Configure Google Pay, tokenizer settings

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- CartMapper.test.ts
```

### UCP Conformance Testing

```bash
# Clone conformance tests
git clone https://github.com/Universal-Commerce-Protocol/conformance

# Run against your server
cd conformance
npm install
npm run test -- --endpoint http://localhost:3000
```

## Deployment

### Docker

```bash
# Build image
docker build -t shopware-ucp-app ./server

# Run with docker-compose
docker-compose up -d
```

### Production Checklist

- [ ] Set strong `APP_SECRET` (min 32 characters)
- [ ] Configure HTTPS with valid SSL certificate
- [ ] Set up PostgreSQL with proper credentials
- [ ] Configure Redis for session caching
- [ ] Set up monitoring (Prometheus, Sentry)
- [ ] Enable rate limiting
- [ ] Configure CORS for your domains
- [ ] Run security audit

## Project Structure

```
shopware-ucp-app/
├── manifest.xml                # Shopware App manifest
├── Resources/
│   └── config/
│       └── config.xml         # App configuration schema
├── server/                     # Node.js/TypeScript server
│   ├── src/
│   │   ├── routes/            # Express routes
│   │   ├── services/          # Business logic
│   │   ├── handlers/          # Payment handlers
│   │   ├── repositories/      # Data access
│   │   ├── middleware/        # Express middleware
│   │   ├── types/             # TypeScript types
│   │   └── utils/             # Utilities
│   ├── tests/                 # Unit & integration tests
│   ├── prisma/                # Database schema
│   └── Dockerfile
├── docker-compose.yml         # Production compose
└── docker-compose.dev.yml     # Development compose
```

## UCP Protocol Version

This implementation targets **UCP version 2026-01-11**.

## Resources

- [UCP Specification](https://ucp.dev/specification/overview)
- [UCP GitHub](https://github.com/Universal-Commerce-Protocol/ucp)
- [Shopware App Guide](https://developer.shopware.com/docs/guides/plugins/apps/app-base-guide.html)
- [Shopware Store API](https://shopware.stoplight.io/docs/store-api/)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## License

MIT
