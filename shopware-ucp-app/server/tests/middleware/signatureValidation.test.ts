/**
 * Signature Validation Middleware Tests
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { createHmac } from 'crypto';
import { generateProof, signWebhookPayload } from '../../src/middleware/signatureValidation.js';

describe('Signature Validation', () => {
  const APP_SECRET = 'test-app-secret-for-unit-testing-only';

  beforeEach(() => {
    process.env['APP_SECRET'] = APP_SECRET;
  });

  describe('generateProof', () => {
    it('should generate correct proof hash', () => {
      const shopId = 'test-shop-123';
      const shopUrl = 'https://myshop.example.com';
      const appName = 'UcpCommerce';

      const proof = generateProof(shopId, shopUrl, appName);

      // Verify it's a valid hex string
      expect(proof).toMatch(/^[a-f0-9]{64}$/);

      // Verify it matches expected HMAC
      const expectedData = `${shopId}${shopUrl}${appName}`;
      const expectedProof = createHmac('sha256', APP_SECRET).update(expectedData).digest('hex');

      expect(proof).toBe(expectedProof);
    });

    it('should generate different proofs for different inputs', () => {
      const proof1 = generateProof('shop-1', 'https://shop1.com', 'UcpCommerce');
      const proof2 = generateProof('shop-2', 'https://shop2.com', 'UcpCommerce');

      expect(proof1).not.toBe(proof2);
    });
  });

  describe('signWebhookPayload', () => {
    it('should sign payload correctly', () => {
      const payload = JSON.stringify({ event: 'order.updated', orderId: '123' });
      const signingKey = 'webhook-signing-key';

      const signature = signWebhookPayload(payload, signingKey);

      // Verify it's a valid hex string
      expect(signature).toMatch(/^[a-f0-9]{64}$/);

      // Verify signature matches
      const expectedSignature = createHmac('sha256', signingKey).update(payload).digest('hex');

      expect(signature).toBe(expectedSignature);
    });

    it('should produce consistent signatures', () => {
      const payload = JSON.stringify({ test: 'data' });
      const signingKey = 'test-key';

      const sig1 = signWebhookPayload(payload, signingKey);
      const sig2 = signWebhookPayload(payload, signingKey);

      expect(sig1).toBe(sig2);
    });

    it('should produce different signatures for different payloads', () => {
      const signingKey = 'test-key';

      const sig1 = signWebhookPayload('payload1', signingKey);
      const sig2 = signWebhookPayload('payload2', signingKey);

      expect(sig1).not.toBe(sig2);
    });
  });
});
