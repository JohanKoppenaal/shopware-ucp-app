# Claude Code Prompts: Shopware 6 UCP App

Dit document bevat gestructureerde prompts voor Claude Code om de Shopware 6 UCP App stap voor stap te implementeren.

---

## Belangrijke Instructies voor Claude Code

Voordat je begint, lees ALTIJD eerst de relevante documentatie:

```
Lees eerst de volgende documentatie voordat je code schrijft:
1. UCP Specification: https://ucp.dev/specification/overview
2. UCP Checkout Capability: https://ucp.dev/specification/checkout/
3. Shopware App Base Guide: https://developer.shopware.com/docs/guides/plugins/apps/app-base-guide.html
4. Shopware Store API: https://shopware.stoplight.io/docs/store-api/
```

---

## Prompt 0: Project Setup & Documentation Research

```markdown
# Context
Ik wil een Shopware 6 App bouwen die het Universal Commerce Protocol (UCP) implementeert. 
UCP is een open standaard van Google voor agentic commerce - het stelt AI agents in staat 
om namens gebruikers producten te ontdekken en aan te kopen.

# Taken
1. Lees de volgende documentatie en maak een samenvatting van de key concepts:
   - https://ucp.dev/specification/overview (UCP spec)
   - https://ucp.dev/specification/checkout/ (Checkout capability)
   - https://developer.shopware.com/docs/guides/plugins/apps/app-base-guide.html (Shopware Apps)
   - https://developer.shopware.com/docs/guides/plugins/apps/app-sdks/php/ (PHP SDK)

2. Identificeer de mapping tussen:
   - UCP Checkout Session ↔ Shopware Cart
   - UCP Line Items ↔ Shopware Line Items
   - UCP Fulfillment ↔ Shopware Shipping Methods
   - UCP Payment Handlers ↔ Shopware Payment Methods

3. Maak een high-level architectuur diagram (als mermaid) dat laat zien hoe de componenten 
   samenwerken.

# Output
- Markdown document met samenvatting van beide specs
- Mapping tabel
- Architectuur diagram
```

---

## Prompt 1: Shopware App Manifest & Registration

```markdown
# Context
We bouwen een Shopware 6 App voor UCP (Universal Commerce Protocol). De app moet:
- Communiceren met een externe server voor UCP endpoints
- Toegang hebben tot Shopware's Store API en Admin API
- Order events kunnen ontvangen via webhooks

# PRD Referentie
Zie: PRD-Shopware6-UCP-App.md sectie 4.1 en 5.1

# Taken
1. Lees de Shopware App documentatie:
   - https://developer.shopware.com/docs/guides/plugins/apps/app-base-guide.html
   - https://developer.shopware.com/docs/resources/references/app-reference/manifest-reference.html

2. Maak de volgende bestanden:
   
   a) `manifest.xml` met:
      - App naam: "UcpCommerce"
      - Beschrijving in NL en EN
      - Setup URL voor registration flow
      - Permissions: product:read, order:read, order:create, customer:read, 
        sales_channel:read, shipping_method:read, payment_method:read
      - Webhooks voor: order.placed, order.state_changed
      - Admin module voor configuratie

   b) `Resources/config/config.xml` met configuratie opties:
      - UCP App Server URL
      - API Key voor authenticatie
      - Enabled capabilities (checkboxes)
      - Payment handler configuratie (JSON field)
      - Debug mode toggle

3. Maak de folder structuur aan voor de complete app

# Constraints
- Gebruik Shopware 6.5+ manifest schema
- Volg Shopware naming conventions
- Include Nederlandse en Engelse labels

# Output
- Complete manifest.xml
- config.xml
- Folder structuur overzicht
```

---

## Prompt 2: App Server Setup (TypeScript/Node.js)

```markdown
# Context
De UCP App heeft een externe server nodig die:
- De Shopware App registration handshake afhandelt
- UCP endpoints exposed (/.well-known/ucp, /checkout-sessions, etc.)
- Communiceert met Shopware via de Admin/Store API

# PRD Referentie
Zie: PRD-Shopware6-UCP-App.md sectie 5.1 en 5.2

# Taken
1. Initialiseer een Node.js/TypeScript project met:
   - Express.js als framework
   - TypeScript configuratie
   - ESLint + Prettier
   - Jest voor testing

2. Implementeer de Shopware App registration flow:
   
   a) `GET /shopware/registration` - Ontvang registration request
      - Valideer shopware-app-signature header
      - Return proof, secret en confirmation_url
   
   b) `POST /shopware/registration/confirm` - Bevestig registration
      - Ontvang apiKey en secretKey
      - Sla shop credentials veilig op
      - Valideer shopware-shop-signature
   
   c) `POST /shopware/webhook` - Ontvang webhooks
      - Valideer signature
      - Route naar juiste handler

3. Maak een ShopwareApiClient service:
   - OAuth token management
   - Store API methods (getCart, addLineItem, updateCart, createOrder)
   - Admin API methods (getProducts, getShippingMethods)
   - Automatic token refresh

4. Configuratie via environment variables:
   - APP_SECRET (voor registration signing)
   - DATABASE_URL (PostgreSQL/SQLite)
   - SHOPWARE_DEFAULT_TIMEOUT

# Tech Stack
- Node.js 20+
- TypeScript 5+
- Express.js
- Prisma (database ORM)
- Zod (validation)

# Output
- package.json met dependencies
- tsconfig.json
- src/index.ts (entry point)
- src/routes/shopware.ts (registration routes)
- src/services/ShopwareApiClient.ts
- src/middleware/signatureValidation.ts
- Dockerfile voor deployment
```

---

## Prompt 3: UCP Profile Endpoint

```markdown
# Context
Het UCP Profile endpoint (/.well-known/ucp) is het startpunt voor AI agents. 
Het declareert welke capabilities en payment handlers de shop ondersteunt.

# PRD Referentie
Zie: PRD-Shopware6-UCP-App.md sectie 4.2

# UCP Spec Referentie
Lees: https://ucp.dev/specification/overview/#profile-structure

# Taken
1. Implementeer `GET /.well-known/ucp` endpoint dat retourneert:
   
   ```typescript
   interface UcpProfile {
     ucp: {
       version: "2026-01-11";
       services: {
         "dev.ucp.shopping": {
           version: string;
           spec: string;
           rest: {
             schema: string;
             endpoint: string;
           };
           mcp?: {
             schema: string;
             endpoint: string;
           };
         };
       };
       capabilities: Capability[];
     };
     payment: {
       handlers: PaymentHandler[];
     };
     signing_keys: JWK[];
   }
   ```

2. Maak de profile dynamisch op basis van:
   - Shop configuratie (uit Shopware app config)
   - Beschikbare payment methods in Shopware
   - Server URL configuratie

3. Implementeer signing key management:
   - Genereer EC P-256 key pair bij eerste request
   - Sla private key veilig op
   - Expose public key in JWK format

4. Cache de profile response (5 minuten TTL)

# Validation
- Profile moet voldoen aan UCP JSON Schema
- Test met: https://github.com/Universal-Commerce-Protocol/conformance

# Output
- src/routes/ucp-profile.ts
- src/services/ProfileBuilder.ts
- src/services/KeyManager.ts
- src/types/ucp.ts (TypeScript types voor UCP schema's)
```

---

## Prompt 4: Checkout Session - Create

```markdown
# Context
De Create Checkout Session endpoint is het hart van de UCP integratie. 
Een AI agent stuurt line_items en we moeten een Shopware cart aanmaken.

# PRD Referentie
Zie: PRD-Shopware6-UCP-App.md sectie 4.3.1

# UCP Spec Referentie
Lees: https://ucp.dev/specification/checkout/
Lees: https://ucp.dev/specification/checkout-rest/

# Shopware API Referentie
Lees: https://shopware.stoplight.io/docs/store-api/

# Taken
1. Implementeer `POST /checkout-sessions` endpoint:

   Request:
   ```typescript
   interface CreateCheckoutRequest {
     line_items: Array<{
       product_id: string;
       quantity: number;
       variant_id?: string;
     }>;
     buyer?: {
       email?: string;
       phone?: string;
     };
   }
   ```

2. Capability Negotiation:
   - Parse `UCP-Agent` header voor platform profile URL
   - Fetch platform profile
   - Bereken capability intersection
   - Bepaal actieve extensions

3. Shopware Cart Creation:
   - Maak nieuwe cart via Store API (`/store-api/checkout/cart`)
   - Map UCP product_ids naar Shopware product numbers
   - Voeg line items toe via `/store-api/checkout/cart/line-item`
   - Haal cart state op

4. Session Storage:
   - Genereer UCP session ID (UUIDv7)
   - Sla mapping op: ucp_session_id ↔ shopware_cart_token
   - Sla platform profile reference op

5. Response mapping:
   ```typescript
   interface CheckoutSession {
     ucp: {
       version: string;
       capabilities: Array<{name: string; version: string}>;
     };
     id: string;
     status: "incomplete" | "complete" | "requires_escalation";
     line_items: UcpLineItem[];
     totals: UcpTotals;
     fulfillment?: UcpFulfillment;  // Als extension actief
     payment: {
       handlers: PaymentHandler[];
     };
   }
   ```

# Edge Cases
- Product niet gevonden → return error met `product_unavailable` code
- Product out of stock → return `insufficient_inventory` 
- Variant niet gevonden → return `variant_unavailable`

# Output
- src/routes/checkout-sessions.ts
- src/services/CheckoutSessionService.ts
- src/services/CartMapper.ts (UCP ↔ Shopware mapping)
- src/repositories/SessionRepository.ts
- Database schema voor sessions (Prisma)
```

---

## Prompt 5: Checkout Session - Update

```markdown
# Context
Na het aanmaken van een checkout session kan de AI agent de session updaten 
met shipping address, billing address en shipping method.

# PRD Referentie
Zie: PRD-Shopware6-UCP-App.md sectie 4.3.2

# UCP Spec Referentie
Lees: https://ucp.dev/specification/checkout-rest/ - PATCH operation

# Taken
1. Implementeer `PATCH /checkout-sessions/{id}` endpoint:

   Request (partial update):
   ```typescript
   interface UpdateCheckoutRequest {
     shipping_address?: {
       first_name: string;
       last_name: string;
       street_address: string;
       extended_address?: string;
       address_locality: string;  // city
       address_region?: string;   // state/province
       postal_code: string;
       address_country: string;   // ISO 3166-1 alpha-2
     };
     billing_address?: Address;
     selected_fulfillment_option_id?: string;
     discounts?: {
       codes?: string[];  // Coupon codes
     };
   }
   ```

2. Shopware Updates:
   - Update cart customer address via Store API
   - Set shipping method als `selected_fulfillment_option_id` gegeven
   - Apply discount codes via `/store-api/checkout/cart/line-item` (promotion type)
   - Trigger tax recalculation

3. Address Mapping:
   - Map UCP address format naar Shopware address format
   - Lookup country ID from ISO code
   - Lookup/create salutation

4. Fulfillment Options:
   - Return beschikbare shipping methods als fulfillment options
   - Include delivery time estimates
   - Include shipping costs per option

5. Discount Handling:
   - Validate coupon codes via Shopware
   - Return discount breakdown in totals
   - Handle invalid codes gracefully

# Response
Return updated CheckoutSession met:
- Nieuwe totals (incl. shipping en tax)
- Applied discounts
- Selected fulfillment option

# Output
- Update src/routes/checkout-sessions.ts
- src/services/AddressMapper.ts
- src/services/FulfillmentService.ts
- src/services/DiscountService.ts
```

---

## Prompt 6: Checkout Session - Complete

```markdown
# Context
De Complete endpoint finaliseert de checkout: verwerk betaling en maak een order aan.

# PRD Referentie
Zie: PRD-Shopware6-UCP-App.md sectie 4.3.3

# UCP Spec Referentie
Lees: https://ucp.dev/specification/checkout-rest/ - complete operation
Lees: https://ucp.dev/specification/overview/#payment-architecture

# Taken
1. Implementeer `POST /checkout-sessions/{id}/complete` endpoint:

   Request:
   ```typescript
   interface CompleteCheckoutRequest {
     payment_data: {
       id: string;
       handler_id: string;
       type: "card" | "wallet" | "bank_transfer";
       brand?: string;
       last_digits?: string;
       billing_address?: Address;
       credential: {
         type: string;
         token: string;
       };
     };
     risk_signals?: {
       session_id?: string;
       score?: number;
     };
   }
   ```

2. Payment Handler Routing:
   - Lookup handler by handler_id
   - Validate credential format against handler schema
   - Route to appropriate payment processor

3. Payment Processing Patterns:
   
   a) Google Pay Handler:
      - Decrypt Google Pay token
      - Forward to merchant's PSP
      
   b) Business Tokenizer:
      - Send token to configured PSP endpoint
      - Handle authorization response
      
   c) SCA Challenge Flow:
      - If PSP returns challenge_required
      - Return `requires_escalation` status met `continue_url`

4. Order Creation (na succesvolle betaling):
   - Create Shopware order via Admin API
   - Set order state to "open"
   - Link payment transaction
   - Store UCP session reference in custom fields

5. Response:
   ```typescript
   // Success
   {
     status: "complete",
     order: {
       id: string;
       order_number: string;
       created_at: string;
     }
   }
   
   // Challenge Required
   {
     status: "requires_escalation",
     messages: [{
       type: "error",
       code: "requires_3ds",
       message: "Bank requires verification",
       severity: "requires_buyer_input"
     }],
     continue_url: "https://psp.com/challenge/123"
   }
   ```

# Security
- Validate handler_id exists in profile
- Never log raw credentials
- Use secure token exchange

# Output
- Update src/routes/checkout-sessions.ts
- src/services/PaymentProcessor.ts
- src/handlers/GooglePayHandler.ts
- src/handlers/TokenizerHandler.ts
- src/services/OrderService.ts
```

---

## Prompt 7: Payment Handlers Configuration

```markdown
# Context
Payment Handlers zijn specificaties voor hoe betalingen worden verwerkt. 
We moeten meerdere handlers ondersteunen en deze configureerbaar maken.

# PRD Referentie
Zie: PRD-Shopware6-UCP-App.md sectie 4.5

# UCP Spec Referentie
Lees: https://ucp.dev/specification/payment-handler-guide/
Lees: https://ucp.dev/specification/overview/#payment-handlers

# Taken
1. Definieer Payment Handler interface:
   ```typescript
   interface PaymentHandler {
     id: string;
     name: string;  // e.g., "com.google.pay"
     version: string;
     spec: string;
     config_schema: string;
     instrument_schemas: string[];
     config: Record<string, unknown>;
   }
   
   interface PaymentHandlerProcessor {
     canHandle(handlerId: string): boolean;
     processPayment(
       session: CheckoutSession,
       paymentData: PaymentData
     ): Promise<PaymentResult>;
   }
   ```

2. Implementeer handlers:

   a) Google Pay Handler (`com.google.pay`):
      - Config: merchant_id, merchant_name, allowed_card_networks
      - Decrypt encrypted payload
      - Extract network token
      - Forward to configured PSP
   
   b) Business Tokenizer (`dev.ucp.business_tokenizer`):
      - Config: token_url, public_key, psp_type
      - Receive pre-tokenized credential
      - Authorize via PSP API
   
   c) Mollie Integration:
      - Map to Shopware Mollie plugin if installed
      - Create Mollie payment
      - Handle redirect flows

3. Handler Registry:
   - Register handlers at startup
   - Allow runtime configuration via Admin UI
   - Validate handler config against schema

4. Admin UI Configuration:
   - List available handlers
   - Configure per handler (API keys, merchant IDs)
   - Enable/disable handlers
   - Test connection button

# Output
- src/services/PaymentHandlerRegistry.ts
- src/handlers/BasePaymentHandler.ts
- src/handlers/GooglePayHandler.ts
- src/handlers/BusinessTokenizerHandler.ts
- src/handlers/MollieHandler.ts
- Admin UI component (Vue.js) voor configuratie
```

---

## Prompt 8: MCP Transport Binding

```markdown
# Context
MCP (Model Context Protocol) is een alternatief transport naast REST. 
LLMs kunnen direct tools aanroepen via JSON-RPC.

# PRD Referentie
Zie: PRD-Shopware6-UCP-App.md sectie 3.2

# UCP Spec Referentie
Lees: https://ucp.dev/specification/checkout-mcp/
Lees: https://modelcontextprotocol.io/

# Taken
1. Implementeer MCP server endpoint op `/mcp`:
   - JSON-RPC 2.0 protocol
   - Streamable HTTP transport

2. Define UCP tools:
   ```typescript
   const tools = [
     {
       name: "create_checkout",
       description: "Create a new checkout session with line items",
       inputSchema: { /* JSON Schema */ }
     },
     {
       name: "update_checkout", 
       description: "Update checkout with address or shipping selection",
       inputSchema: { /* JSON Schema */ }
     },
     {
       name: "complete_checkout",
       description: "Complete checkout with payment",
       inputSchema: { /* JSON Schema */ }
     },
     {
       name: "get_checkout",
       description: "Get current checkout session state",
       inputSchema: { /* JSON Schema */ }
     }
   ];
   ```

3. Map tools naar bestaande services:
   - `create_checkout` → CheckoutSessionService.create()
   - `update_checkout` → CheckoutSessionService.update()
   - etc.

4. Handle MCP-specific headers:
   - `_meta.ucp.profile` voor platform profile

5. Update profile endpoint:
   - Add MCP binding in services

# Output
- src/routes/mcp.ts
- src/services/McpToolRegistry.ts
- src/types/mcp.ts
- OpenRPC schema file
```

---

## Prompt 9: Order Webhooks & Status Sync

```markdown
# Context
Na order creatie moeten we AI platforms informeren over status changes.

# PRD Referentie
Zie: PRD-Shopware6-UCP-App.md sectie 4.6

# UCP Spec Referentie
Lees: https://ucp.dev/specification/order/

# Taken
1. Ontvang Shopware webhooks:
   - `order.placed` - nieuwe order
   - `order.state_changed` - status update
   - `order.payment.state_changed` - payment status

2. Map Shopware order states naar UCP order states:
   ```typescript
   const stateMapping = {
     'open': 'confirmed',
     'in_progress': 'processing', 
     'completed': 'delivered',
     'cancelled': 'cancelled'
   };
   ```

3. Stuur UCP webhooks naar platforms:
   - Lookup platform webhook URL uit session
   - Sign webhook met business signing key
   - Include order details en tracking info

4. Tracking Information:
   - Extract tracking number uit Shopware delivery
   - Include carrier en tracking URL
   - Support multiple shipments

5. Implement retry logic:
   - Queue failed webhooks
   - Exponential backoff
   - Max 5 retries

# Webhook Payload
```typescript
interface OrderWebhook {
  event: "order.updated" | "order.shipped" | "order.delivered";
  order: {
    id: string;
    ucp_session_id: string;
    status: string;
    tracking?: {
      carrier: string;
      tracking_number: string;
      tracking_url: string;
    };
  };
  timestamp: string;
}
```

# Output
- src/routes/shopware-webhooks.ts
- src/services/OrderSyncService.ts
- src/services/WebhookDispatcher.ts
- src/jobs/WebhookRetryJob.ts
```

---

## Prompt 10: Testing & Deployment

```markdown
# Context
De app moet goed getest zijn en makkelijk te deployen.

# Taken
1. Unit Tests:
   - CartMapper tests
   - AddressMapper tests
   - PaymentHandler tests
   - Signature validation tests

2. Integration Tests:
   - Full checkout flow (mock Shopware API)
   - Payment processing flows
   - Webhook delivery

3. E2E Tests:
   - Complete flow tegen test Shopware instance
   - UCP conformance tests

4. Docker Setup:
   ```yaml
   services:
     app:
       build: .
       ports:
         - "3000:3000"
       environment:
         - DATABASE_URL
         - APP_SECRET
       depends_on:
         - db
         - redis
     
     db:
       image: postgres:15
       
     redis:
       image: redis:7
   ```

5. CI/CD Pipeline (GitHub Actions):
   - Lint & typecheck
   - Run tests
   - Build Docker image
   - Deploy to staging
   - Run conformance tests
   - Deploy to production

6. Monitoring:
   - Health check endpoint
   - Prometheus metrics
   - Error tracking (Sentry)
   - Request logging

# Conformance Testing
```bash
# Clone UCP conformance tests
git clone https://github.com/Universal-Commerce-Protocol/conformance

# Run against our server
npm run test:conformance -- --endpoint http://localhost:3000
```

# Output
- tests/ folder met alle tests
- docker-compose.yml
- docker-compose.dev.yml
- .github/workflows/ci.yml
- .github/workflows/deploy.yml
- src/routes/health.ts
- src/middleware/metrics.ts
```

---

## Prompt 11: Admin UI Module

```markdown
# Context
De Shopware Admin heeft een configuratie UI nodig voor de UCP App.

# Shopware Referentie
Lees: https://developer.shopware.com/docs/guides/plugins/apps/administration/add-custom-modules.html

# Taken
1. Voeg Admin module toe aan manifest.xml:
   ```xml
   <admin>
     <module name="ucp-config" 
             source="https://ucp-app.example.com/admin"
             parent="sw-settings">
       <label>UCP Commerce</label>
       <label lang="de-DE">UCP Commerce</label>
     </module>
   </admin>
   ```

2. Bouw Vue.js admin component:
   - Dashboard met:
     - Aantal UCP checkouts vandaag
     - Conversion rate
     - Actieve payment handlers
   
   - Configuratie pagina:
     - Payment handler setup
     - Capability toggles
     - Webhook URL display
     - Test connection button
   
   - Logs/Debug pagina:
     - Recent checkout sessions
     - Webhook delivery status
     - Error logs

3. Gebruik Meteor Admin SDK voor:
   - Notificaties
   - Data fetching
   - Navigation

# Output
- admin/ folder met Vue.js app
- admin/src/views/Dashboard.vue
- admin/src/views/Configuration.vue
- admin/src/views/Logs.vue
- Build setup (Vite)
```

---

## Volledige Implementatie Prompt

Als je alles in één keer wilt genereren:

```markdown
# Context
Bouw een complete Shopware 6 App die het Universal Commerce Protocol (UCP) implementeert.

# Referenties
- PRD: [Geef pad naar PRD-Shopware6-UCP-App.md]
- UCP Spec: https://ucp.dev/specification/overview
- Shopware Apps: https://developer.shopware.com/docs/guides/plugins/apps/

# Requirements
1. Lees EERST alle documentatie voordat je begint met coderen
2. Volg de PRD voor functionele requirements
3. Implementeer in deze volgorde:
   - Shopware App manifest en registration
   - App server met Shopware API client
   - UCP Profile endpoint
   - Checkout Sessions (create, update, complete)
   - Payment Handlers
   - Order webhooks
   - Testing

# Tech Stack
- Shopware App (manifest.xml)
- Node.js/TypeScript server
- PostgreSQL database
- Redis voor caching
- Docker deployment

# Output Structure
```
shopware-ucp-app/
├── manifest.xml
├── Resources/
│   └── config/
│       └── config.xml
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   ├── services/
│   │   ├── handlers/
│   │   └── types/
│   ├── tests/
│   └── Dockerfile
├── admin/
│   └── (Vue.js app)
└── docker-compose.yml
```

Genereer alle bestanden met volledige implementatie.
```

---

## Tips voor Claude Code

1. **Start altijd met documentatie lezen** - Gebruik web fetch om de UCP en Shopware docs te lezen
2. **Werk incrementeel** - Begin met de basis en voeg stap voor stap functionaliteit toe
3. **Test vroeg** - Schrijf tests voor elke component voordat je verder gaat
4. **Gebruik types** - TypeScript types helpen met correctheid
5. **Log alles** - Debugging is makkelijker met goede logs
6. **Handle errors gracefully** - UCP verwacht specifieke error responses
