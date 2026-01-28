/**
 * Key Manager Service
 * Manages EC P-256 signing keys for webhook signatures
 */

import { generateKeyPair, exportJWK, importJWK, SignJWT, jwtVerify, type JWK } from 'jose';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

const prisma = new PrismaClient();

export interface JWKPublic {
  kty: string;
  crv: string;
  x: string;
  y: string;
  kid: string;
  alg: string;
  use: string;
}

export class KeyManager {
  private activeKeyId: string | null = null;
  private privateKey: CryptoKey | null = null;
  private publicKey: CryptoKey | null = null;

  /**
   * Initialize key manager - load or create signing keys
   */
  async initialize(): Promise<void> {
    // Try to load existing active key
    const existingKey = await prisma.signingKey.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });

    if (existingKey) {
      await this.loadKey(existingKey);
      return;
    }

    // Generate new key pair
    await this.generateNewKeyPair();
  }

  /**
   * Generate a new EC P-256 key pair
   */
  async generateNewKeyPair(): Promise<string> {
    const keyId = uuidv4();

    const { publicKey, privateKey } = await generateKeyPair('ES256');

    const publicJwk = await exportJWK(publicKey);
    const privateJwk = await exportJWK(privateKey);

    // Store in database
    await prisma.signingKey.create({
      data: {
        keyId,
        publicKey: JSON.stringify({ ...publicJwk, kid: keyId, alg: 'ES256', use: 'sig' }),
        privateKey: JSON.stringify(privateJwk), // In production, encrypt this
        algorithm: 'ES256',
        active: true,
      },
    });

    this.activeKeyId = keyId;
    this.privateKey = privateKey as CryptoKey;
    this.publicKey = publicKey as CryptoKey;

    logger.info({ keyId }, 'Generated new signing key pair');
    return keyId;
  }

  /**
   * Load key from database
   */
  private async loadKey(key: {
    keyId: string;
    privateKey: string;
    publicKey: string;
  }): Promise<void> {
    const privateJwk = JSON.parse(key.privateKey) as JsonWebKey;
    const publicJwk = JSON.parse(key.publicKey) as JsonWebKey;

    this.privateKey = (await importJWK(privateJwk as unknown as JWK, 'ES256')) as CryptoKey;
    this.publicKey = (await importJWK(publicJwk as unknown as JWK, 'ES256')) as CryptoKey;
    this.activeKeyId = key.keyId;

    logger.info({ keyId: key.keyId }, 'Loaded signing key');
  }

  /**
   * Get public keys in JWK format for profile
   */
  async getPublicKeys(): Promise<JWKPublic[]> {
    const keys = await prisma.signingKey.findMany({
      where: { active: true },
      select: { publicKey: true },
    });

    return keys.map((k) => JSON.parse(k.publicKey) as JWKPublic);
  }

  /**
   * Sign a payload and return JWT
   */
  async signPayload(payload: Record<string, unknown>): Promise<string> {
    if (!this.privateKey || !this.activeKeyId) {
      await this.initialize();
    }

    if (!this.privateKey || !this.activeKeyId) {
      throw new Error('No signing key available');
    }

    const jwt = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'ES256', kid: this.activeKeyId })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(this.privateKey);

    return jwt;
  }

  /**
   * Verify a JWT signature
   */
  async verifySignature(token: string): Promise<Record<string, unknown> | null> {
    if (!this.publicKey) {
      await this.initialize();
    }

    if (!this.publicKey) {
      return null;
    }

    try {
      const { payload } = await jwtVerify(token, this.publicKey);
      return payload as Record<string, unknown>;
    } catch (error) {
      logger.warn({ error }, 'JWT verification failed');
      return null;
    }
  }

  /**
   * Rotate keys - generate new key and mark old as inactive
   */
  async rotateKeys(): Promise<string> {
    // Deactivate old keys
    await prisma.signingKey.updateMany({
      where: { active: true },
      data: { active: false },
    });

    // Generate new key
    return this.generateNewKeyPair();
  }

  /**
   * Get current active key ID
   */
  getActiveKeyId(): string | null {
    return this.activeKeyId;
  }
}

export const keyManager = new KeyManager();
