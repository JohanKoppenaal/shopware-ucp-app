# Shopware 6 UCP App - Project Bestanden

Dit zijn de startbestanden voor het bouwen van een Shopware 6 App die het **Universal Commerce Protocol (UCP)** implementeert.

## Bestanden

| Bestand | Beschrijving |
|---------|--------------|
| `PRD-Shopware6-UCP-App.md` | Product Requirements Document met alle functionele en technische requirements |
| `Claude-Code-Prompts-UCP-App.md` | Gestructureerde prompts voor Claude Code om de app stap voor stap te implementeren |

## Hoe te gebruiken met Claude Code

### Optie 1: Stap voor stap (aanbevolen)

1. Open Claude Code in je project directory
2. Kopieer **Prompt 0** uit `Claude-Code-Prompts-UCP-App.md`
3. Laat Claude Code de documentatie lezen en samenvatten
4. Ga verder met **Prompt 1** voor de app manifest
5. Werk je weg door alle prompts

### Optie 2: Volledige generatie

1. Geef Claude Code toegang tot beide bestanden
2. Gebruik de "Volledige Implementatie Prompt" uit het prompts bestand
3. Claude Code genereert de complete app structuur

## Belangrijke Links

### UCP Protocol
- Specificatie: https://ucp.dev/specification/overview
- GitHub: https://github.com/Universal-Commerce-Protocol/ucp
- Conformance Tests: https://github.com/Universal-Commerce-Protocol/conformance

### Shopware
- App Base Guide: https://developer.shopware.com/docs/guides/plugins/apps/app-base-guide.html
- Store API: https://shopware.stoplight.io/docs/store-api/
- Admin API: https://shopware.stoplight.io/docs/admin-api/
- PHP SDK: https://developer.shopware.com/docs/guides/plugins/apps/app-sdks/php/

## Waarom een Shopware App (geen Plugin)?

UCP vereist:
- **Externe endpoints** die onafhankelijk van Shopware draaien
- **Eigen database** voor session management
- **Webhook endpoints** voor AI platform callbacks

Een Shopware App is hiervoor beter geschikt dan een plugin omdat:
1. De business logic draait op een eigen server
2. Het werkt ook met Shopware Cloud
3. Updates zijn onafhankelijk van Shopware deployments
4. Betere schaalbaarheid voor high-traffic scenarios

## Architectuur Overzicht

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

## Geschatte Tijdlijn

| Fase | Onderdeel | Tijd |
|------|-----------|------|
| 1 | Core Infrastructure | 4 weken |
| 2 | Checkout Flow | 4 weken |
| 3 | Payments | 3 weken |
| 4 | MCP & Polish | 3 weken |
| **Totaal** | | **14 weken** |

## Vragen?

Het UCP protocol is nog vrij nieuw (januari 2026). Voor de laatste updates:
- Volg https://ucp.dev
- Check de GitHub discussions: https://github.com/Universal-Commerce-Protocol/ucp/discussions
