# Product Requirements Document
## Shopware 6 Universal Commerce Protocol (UCP) App

| **Versie** | 1.0 Draft |
|------------|-----------|
| **Datum** | 26 januari 2026 |
| **Status** | Concept |
| **Protocol Versie** | UCP 2026-01-11 |

---

## 1. Executive Summary

Dit document beschrijft de requirements voor het bouwen van een **Shopware 6 App** die het Universal Commerce Protocol (UCP) implementeert. UCP is een open standaard, gelanceerd door Google in samenwerking met Shopify, Walmart, Target, Etsy en andere grote retailers, die agentic commerce mogelijk maakt.

Met UCP kunnen AI-agents (zoals Google Gemini, ChatGPT Shopping, of Microsoft Copilot) namens consumenten producten ontdekken, winkelwagens samenstellen en aankopen voltooien. Door UCP te implementeren voor Shopware 6 kunnen merchants hun producten direct beschikbaar maken voor de volgende generatie AI-gedreven shopping experiences.

**Waarom een Shopware App (geen Plugin)?**
- UCP vereist externe API endpoints die onafhankelijk van Shopware draaien
- Beter schaalbaar en cloud-ready (werkt ook met Shopware Cloud)
- Duidelijke scheiding tussen Shopware en UCP business logic
- Eenvoudiger te updaten zonder Shopware deployment

---

## 2. Probleem & Opportuniteit

### 2.1 Het Probleem

De huidige e-commerce landschap is gefragmenteerd. AI-agents moeten voor elke webshop unieke integraties bouwen, wat leidt tot:

- Hoge implementatiekosten voor merchants die AI-shopping willen ondersteunen
- Inconsistente gebruikerservaringen tussen verschillende platforms
- Beperkte toegang tot AI-gedreven discovery voor kleinere webshops
- Complexe betalingsintegraties die handmatig per agent moeten worden opgezet

### 2.2 De Opportuniteit

UCP lost dit op door een gestandaardiseerde taal te bieden voor commerce-interacties. Shopware 6 merchants die UCP implementeren krijgen:

- Directe zichtbaarheid in Google AI Mode, Gemini en andere UCP-compatible platforms
- Lagere checkout friction door native AI-gestuurde koopervaringen
- Behoud van volledige controle als Merchant of Record
- Compatibiliteit met bestaande betaalproviders via Payment Handlers

---

## 3. UCP Protocol Overzicht

### 3.1 Architectuur

UCP definieert een modulaire architectuur met drie kernconcepten: **Services**, **Capabilities** en **Extensions**. Businesses publiceren een **Profile** op `/.well-known/ucp` dat hun ondersteunde functionaliteit declareert.

| Component | Beschrijving |
|-----------|--------------|
| **Profile** | JSON document op `/.well-known/ucp` met services, capabilities en payment handlers |
| **Service** | API surface voor een verticaal (`dev.ucp.shopping`) met REST, MCP of A2A bindings |
| **Capability** | Specifieke functionaliteit zoals Checkout, Order of Identity Linking |
| **Extension** | Optionele uitbreiding van een capability (Fulfillment, Discounts, AP2 Mandates) |
| **Payment Handler** | Specificatie voor hoe betalingen worden verwerkt (tokenization, wallets, etc.) |

### 3.2 Transport Protocols

UCP ondersteunt meerdere transport protocols. Voor Shopware 6 implementeren we:

- **REST API (Core)** - Primaire transport via HTTP/JSON, OpenAPI 3.x specificatie
- **MCP Binding** - Model Context Protocol voor directe LLM-integratie via JSON-RPC

### 3.3 Core Capabilities

| Capability | ID | Functie |
|------------|----|---------| 
| **Checkout** | `dev.ucp.shopping.checkout` | Checkout sessions, cart management, tax calculation |
| **Order** | `dev.ucp.shopping.order` | Webhook updates voor order lifecycle events |
| **Identity Linking** | `dev.ucp.common.identity_linking` | OAuth 2.0 autorisatie voor user actions |

### 3.4 Checkout Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  AI Agent   │────▶│  UCP App    │────▶│  Shopware   │
│  (Platform) │     │  Server     │     │  Store API  │
└─────────────┘     └─────────────┘     └─────────────┘
      │                    │                   │
      │  1. Create         │                   │
      │     Checkout       │                   │
      │───────────────────▶│                   │
      │                    │  2. Create Cart   │
      │                    │──────────────────▶│
      │                    │◀──────────────────│
      │  3. Return         │                   │
      │     Session        │                   │
      │◀───────────────────│                   │
      │                    │                   │
      │  4. Update         │                   │
      │     Address        │                   │
      │───────────────────▶│                   │
      │                    │  5. Update Cart   │
      │                    │──────────────────▶│
      │                    │◀──────────────────│
      │  6. Return         │                   │
      │     Totals         │                   │
      │◀───────────────────│                   │
      │                    │                   │
      │  7. Complete       │                   │
      │     + Payment      │                   │
      │───────────────────▶│                   │
      │                    │  8. Create Order  │
      │                    │──────────────────▶│
      │                    │◀──────────────────│
      │  9. Confirmation   │                   │
      │◀───────────────────│                   │
      │                    │                   │
```

---

## 4. Functionele Requirements

### 4.1 Shopware App (manifest.xml)

De app moet voldoen aan Shopware App System requirements:

- `manifest.xml` met app metadata en permissions
- Registration endpoint voor app installatie handshake
- Webhook subscriptions voor order events
- Admin UI module voor configuratie
- Permissions voor: `product:read`, `order:read`, `order:create`, `customer:read`, `cart:read`, `cart:write`

### 4.2 Profile Endpoint

De app server moet een `/.well-known/ucp` endpoint exposeren met:

- Protocol versie en ondersteunde services
- Lijst van capabilities met versie, spec URL en schema URL
- Geconfigureerde payment handlers
- Public signing keys voor webhook verificatie

**Voorbeeld Response:**
```json
{
  "ucp": {
    "version": "2026-01-11",
    "services": {
      "dev.ucp.shopping": {
        "version": "2026-01-11",
        "spec": "https://ucp.dev/specification/overview",
        "rest": {
          "schema": "https://ucp.dev/services/shopping/rest.openapi.json",
          "endpoint": "https://ucp-app.example.com/api/v1"
        }
      }
    },
    "capabilities": [
      {
        "name": "dev.ucp.shopping.checkout",
        "version": "2026-01-11",
        "spec": "https://ucp.dev/specification/checkout",
        "schema": "https://ucp.dev/schemas/shopping/checkout.json"
      }
    ]
  },
  "payment": {
    "handlers": [...]
  }
}
```

### 4.3 Checkout Capability

#### 4.3.1 Create Checkout Session
- `POST /checkout-sessions` endpoint
- Accepteert `line_items` met product IDs, quantities en variant informatie
- Vertaalt naar Shopware Store API cart creation
- Retourneert volledige checkout state inclusief pricing, shipping options en payment handlers
- Capability negotiation via `UCP-Agent` header

#### 4.3.2 Update Checkout Session
- `PATCH /checkout-sessions/{id}` endpoint
- Wijzigen van shipping address, billing address, shipping method
- Herberekening van taxes en shipping costs via Shopware
- Discount/coupon applicatie

#### 4.3.3 Complete Checkout
- `POST /checkout-sessions/{id}/complete` endpoint
- Verwerken van `payment_data` met `handler_id` en `credential`
- SCA/3DS challenge flow ondersteuning via `requires_escalation` status
- Order creatie in Shopware na succesvolle betaling

### 4.4 Extensions

#### 4.4.1 Fulfillment Extension
- Shipping options met carrier, delivery windows en pricing
- Mapping naar Shopware shipping methods
- Pickup locaties indien beschikbaar

#### 4.4.2 Discounts Extension
- Coupon code validatie via Shopware promotions
- Automatische promoties
- Discount breakdown in totals

### 4.5 Payment Handler Integration

De app moet flexibele payment handler configuratie ondersteunen:

| Handler | Beschrijving |
|---------|--------------|
| **Google Pay** (`com.google.pay`) | Native Google Pay integratie |
| **Business Tokenizer** | PSP tokenization via Mollie, Adyen, Stripe |
| **AP2 Mandate** | Cryptografische autorisatie voor autonomous agents |

### 4.6 Order Capability

- Webhooks naar platforms bij order status changes
- Tracking information propagation
- Return/refund status updates

---

## 5. Technische Architectuur

### 5.1 App Structuur

```
shopware-ucp-app/
├── manifest.xml                 # Shopware App manifest
├── Resources/
│   └── config/
│       └── config.xml          # App configuratie schema
├── src/
│   ├── Controller/
│   │   ├── ProfileController.php
│   │   ├── CheckoutController.php
│   │   └── WebhookController.php
│   ├── Service/
│   │   ├── CheckoutSessionService.php
│   │   ├── CapabilityNegotiator.php
│   │   ├── ShopwareApiClient.php
│   │   └── PaymentHandlerRegistry.php
│   ├── Entity/
│   │   └── CheckoutSession.php
│   └── EventSubscriber/
│       └── OrderEventSubscriber.php
├── server/                      # Externe app server (Node.js/PHP)
│   ├── routes/
│   │   ├── ucp-profile.ts
│   │   ├── checkout-sessions.ts
│   │   └── webhooks.ts
│   ├── services/
│   │   ├── shopware-client.ts
│   │   ├── session-store.ts
│   │   └── payment-processor.ts
│   └── index.ts
└── docker-compose.yml
```

### 5.2 Data Flow

```
┌────────────────────────────────────────────────────────────────┐
│                        UCP App Server                          │
├────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │   Profile    │  │   Checkout   │  │    Payment Handler   │ │
│  │   Endpoint   │  │   Sessions   │  │      Registry        │ │
│  └──────────────┘  └──────────────┘  └──────────────────────┘ │
│          │                │                     │              │
│          └────────────────┼─────────────────────┘              │
│                           │                                    │
│                    ┌──────▼──────┐                            │
│                    │  Shopware   │                            │
│                    │ API Client  │                            │
│                    └──────┬──────┘                            │
└───────────────────────────┼────────────────────────────────────┘
                            │
                    ┌───────▼───────┐
                    │   Shopware    │
                    │   Store API   │
                    └───────────────┘
```

### 5.3 Session Storage

Checkout sessions worden opgeslagen met:
- Unique session ID (UUIDv7)
- Shopware cart token mapping
- Shop credentials reference
- Status en timestamps
- Platform profile cache

### 5.4 Shopware API Integration

De app communiceert met Shopware via:

| API | Gebruik |
|-----|---------|
| **Store API** | Cart management, checkout, customer data |
| **Admin API** | Order creation, product lookups, configuration |

---

## 6. Implementatie Fases

### Fase 1: Core Infrastructure (4 weken)
- [ ] App scaffolding met manifest.xml
- [ ] App registration flow implementatie
- [ ] Shopware API client met OAuth
- [ ] Profile endpoint met statische configuratie
- [ ] UCP-Agent header parsing en capability negotiation
- [ ] Basic checkout session CRUD via REST

### Fase 2: Checkout Flow (4 weken)
- [ ] Complete checkout lifecycle (create, update, complete)
- [ ] Shopware Store API cart integratie
- [ ] Address validation en tax calculation
- [ ] Fulfillment extension met shipping options
- [ ] Discounts extension met coupon support

### Fase 3: Payments (3 weken)
- [ ] Payment handler registry en configuratie
- [ ] Google Pay handler implementatie
- [ ] Business tokenizer voor bestaande PSP integraties
- [ ] SCA/3DS challenge flow
- [ ] Order creation na succesvolle betaling

### Fase 4: MCP & Polish (3 weken)
- [ ] MCP transport binding (JSON-RPC)
- [ ] Order capability met webhooks
- [ ] Admin UI voor configuratie
- [ ] Documentatie en test coverage
- [ ] UCP conformance testing

---

## 7. Success Metrics

| Metric | Target |
|--------|--------|
| **UCP Conformance** | Plugin passeert Google UCP conformance test suite |
| **Checkout Completion Rate** | >80% voor AI-geïnitieerde checkouts |
| **Latency** | P95 response time <500ms voor checkout operations |
| **Payment Success Rate** | >95% voor ondersteunde payment handlers |

---

## 8. Risico's & Mitigatie

| Risico | Impact | Mitigatie |
|--------|--------|-----------|
| UCP spec wijzigingen | Hoog - breaking changes | Modulaire architectuur, versie pinning |
| PSP compatibiliteit | Medium - beperkte coverage | Start met top 3 PSPs, extensible handler pattern |
| Shopware updates | Medium - API changes | Gebruik alleen stable APIs, automated testing |
| Security vulnerabilities | Hoog - data exposure | Security audit, PCI-DSS compliance review |

---

## 9. Referenties

- UCP Specification: https://ucp.dev/specification/overview
- UCP GitHub: https://github.com/Universal-Commerce-Protocol/ucp
- Google Merchant UCP Guide: https://developers.google.com/merchant/ucp
- MCP Protocol: https://modelcontextprotocol.io
- AP2 Protocol: https://ap2-protocol.org
- Shopware App System: https://developer.shopware.com/docs/guides/plugins/apps/app-base-guide.html
- Shopware Store API: https://shopware.stoplight.io/docs/store-api/
- Shopware Admin API: https://shopware.stoplight.io/docs/admin-api/
