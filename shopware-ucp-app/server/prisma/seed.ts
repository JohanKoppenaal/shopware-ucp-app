/**
 * Prisma Seed Script
 * Creates test data for development
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create a test shop for development
  const shop = await prisma.shop.upsert({
    where: { shopId: 'dev-shop' },
    update: {},
    create: {
      shopId: 'dev-shop',
      shopUrl: 'http://localhost:8000', // Local Shopware instance or mock
      apiKey: 'dev-api-key',
      secretKey: 'dev-secret-key',
      appName: 'UcpCommerce',
      salesChannelId: 'dev-sales-channel',
      currencyId: 'eur-currency-id',
      languageId: 'en-language-id',
      active: true,
    },
  });

  console.log('Created test shop:', shop.shopId);

  // Create payment handler configs
  const googlePayConfig = await prisma.paymentHandlerConfig.upsert({
    where: {
      shopId_handlerId: {
        shopId: 'dev-shop',
        handlerId: 'google-pay',
      },
    },
    update: {},
    create: {
      shopId: 'dev-shop',
      handlerId: 'google-pay',
      handlerName: 'com.google.pay',
      enabled: true,
      priority: 1,
      config: {
        environment: 'TEST',
        merchantId: 'dev-merchant',
        merchantName: 'Dev Store',
      },
    },
  });

  const tokenizerConfig = await prisma.paymentHandlerConfig.upsert({
    where: {
      shopId_handlerId: {
        shopId: 'dev-shop',
        handlerId: 'business-tokenizer',
      },
    },
    update: {},
    create: {
      shopId: 'dev-shop',
      handlerId: 'business-tokenizer',
      handlerName: 'dev.ucp.business_tokenizer',
      enabled: true,
      priority: 2,
      config: {
        pspType: 'mollie',
        publicKey: 'test_public_key',
        supportedBrands: ['visa', 'mastercard', 'amex'],
      },
    },
  });

  console.log('Created payment handler configs:', [googlePayConfig.handlerId, tokenizerConfig.handlerId]);

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
