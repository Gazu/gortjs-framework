import { createPublicKey, createVerify, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { createTimestamp, type RestAuthConfig, type RestAuthHealth } from '@gortjs/contracts';

type AuthResult = {
  ok: boolean;
  statusCode?: number;
  error?: string;
  scopes: string[];
  claims?: Record<string, unknown>;
};

function base64UrlDecode(value: string): string {
  const padded = value.padEnd(Math.ceil(value.length / 4) * 4, '=').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function getBearerTokenFromHeader(header?: string): string | undefined {
  if (!header || !header.startsWith('Bearer ')) {
    return undefined;
  }

  return header.slice('Bearer '.length).trim();
}

function normalizeScopes(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((entry) => String(entry)).filter(Boolean);
  }

  if (typeof raw === 'string') {
    return raw.split(/\s+/).filter(Boolean);
  }

  return [];
}

function ensureScopes(required: string[], available: string[]): boolean {
  return required.every((scope) => available.includes(scope));
}

export class AuthService {
  private publicKey?: string;
  private publicKeyMtimeMs?: number;
  private lastLoadedAt?: string;
  private lastReloadAt?: string;
  private lastReloadError?: string;

  constructor(private readonly config?: RestAuthConfig) {}

  async initialize(): Promise<void> {
    if (!this.config || this.config.enabled === false || this.config.mode !== 'jwt') {
      return;
    }

    if (this.config.publicKey) {
      this.publicKey = this.config.publicKey;
      this.lastLoadedAt = createTimestamp();
      return;
    }

    if (this.config.publicKeyFile) {
      await this.reloadPublicKeyIfNeeded(true);
    }
  }

  isEnabled(): boolean {
    return Boolean(this.config && this.config.enabled !== false);
  }

  async authorizeHttp(
    authorizationHeader: string | undefined,
    scopeKey: string,
  ): Promise<AuthResult> {
    return this.authorizeToken(getBearerTokenFromHeader(authorizationHeader), scopeKey);
  }

  async authorizeWebSocket(request: IncomingMessage, scopeKey: string): Promise<AuthResult> {
    const headerToken = getBearerTokenFromHeader(
      Array.isArray(request.headers.authorization)
        ? request.headers.authorization[0]
        : request.headers.authorization,
    );

    const queryToken = new URL(request.url ?? '/', 'http://localhost').searchParams.get('token') ?? undefined;
    return this.authorizeToken(headerToken ?? queryToken, scopeKey);
  }

  private async authorizeToken(token: string | undefined, scopeKey: string): Promise<AuthResult> {
    if (!this.isEnabled()) {
      return { ok: true, scopes: [] };
    }

    await this.reloadPublicKeyIfNeeded();

    if (!token) {
      return { ok: false, statusCode: 401, error: 'Missing bearer token', scopes: [] };
    }

    const result = this.config?.mode === 'jwt'
      ? this.verifyJwt(token)
      : this.verifyStaticToken(token);

    if (!result.ok) {
      return result;
    }

    const requiredScopes = this.config?.scopes?.[scopeKey] ?? [];
    if (requiredScopes.length > 0 && !ensureScopes(requiredScopes, result.scopes)) {
      return {
        ok: false,
        statusCode: 403,
        error: `Missing required scopes for '${scopeKey}'`,
        scopes: result.scopes,
        claims: result.claims,
      };
    }

    return result;
  }

  getHealth(): RestAuthHealth {
    return {
      enabled: this.isEnabled(),
      mode: this.config?.mode,
      source: this.config?.publicKeyFile ? 'file' : this.config?.publicKey ? 'inline' : undefined,
      algorithms: this.config?.algorithms,
      issuer: this.config?.issuer,
      audience: this.config?.audience,
      scopeClaim: this.config?.scopeClaim,
      configuredScopes: Object.keys(this.config?.scopes ?? {}),
      lastLoadedAt: this.lastLoadedAt,
      lastReloadAt: this.lastReloadAt,
      lastReloadError: this.lastReloadError,
    };
  }

  private verifyStaticToken(token: string): AuthResult {
    if (!this.config?.token || !constantTimeEquals(token, this.config.token)) {
      return { ok: false, statusCode: 401, error: 'Invalid bearer token', scopes: [] };
    }

    return {
      ok: true,
      scopes: this.config.tokenScopes ?? [],
      claims: {
        sub: 'static-token',
        scope: this.config.tokenScopes ?? [],
      },
    };
  }

  private verifyJwt(token: string): AuthResult {
    try {
      const [headerSegment, payloadSegment, signatureSegment] = token.split('.');
      if (!headerSegment || !payloadSegment || !signatureSegment) {
        return { ok: false, statusCode: 401, error: 'Invalid JWT format', scopes: [] };
      }

      const header = JSON.parse(base64UrlDecode(headerSegment)) as Record<string, unknown>;
      const payload = JSON.parse(base64UrlDecode(payloadSegment)) as Record<string, unknown>;
      const algorithm = String(header.alg ?? '');

      if (!(this.config?.algorithms ?? ['RS256']).includes(algorithm as 'RS256')) {
        return { ok: false, statusCode: 401, error: `Unsupported JWT algorithm '${algorithm}'`, scopes: [] };
      }

      if (!this.publicKey) {
        return { ok: false, statusCode: 401, error: 'JWT public key is not configured', scopes: [] };
      }

      const verifier = createVerify('RSA-SHA256');
      verifier.update(`${headerSegment}.${payloadSegment}`);
      verifier.end();

      const validSignature = verifier.verify(
        createPublicKey(this.publicKey),
        Buffer.from(signatureSegment.replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
      );

      if (!validSignature) {
        return { ok: false, statusCode: 401, error: 'Invalid JWT signature', scopes: [] };
      }

      const now = Math.floor(Date.now() / 1000);
      if (typeof payload.exp === 'number' && payload.exp < now) {
        return { ok: false, statusCode: 401, error: 'JWT expired', scopes: [] };
      }

      if (typeof payload.nbf === 'number' && payload.nbf > now) {
        return { ok: false, statusCode: 401, error: 'JWT not yet valid', scopes: [] };
      }

      if (this.config?.issuer && payload.iss !== this.config.issuer) {
        return { ok: false, statusCode: 401, error: 'Invalid JWT issuer', scopes: [] };
      }

      if (this.config?.audience) {
        const allowedAudiences = Array.isArray(this.config.audience)
          ? this.config.audience
          : [this.config.audience];
        const tokenAudiences = Array.isArray(payload.aud) ? payload.aud.map(String) : [String(payload.aud ?? '')];
        if (!allowedAudiences.some((audience) => tokenAudiences.includes(audience))) {
          return { ok: false, statusCode: 401, error: 'Invalid JWT audience', scopes: [] };
        }
      }

      const scopeClaim = this.config?.scopeClaim ?? 'scope';
      return {
        ok: true,
        scopes: normalizeScopes(payload[scopeClaim]),
        claims: payload,
      };
    } catch (error) {
      return {
        ok: false,
        statusCode: 401,
        error: error instanceof Error ? error.message : 'Invalid JWT',
        scopes: [],
      };
    }
  }

  private async reloadPublicKeyIfNeeded(force = false): Promise<void> {
    if (this.config?.mode !== 'jwt' || !this.config.publicKeyFile) {
      return;
    }

    try {
      const fileStats = await stat(this.config.publicKeyFile);
      if (!force && typeof this.publicKeyMtimeMs !== 'undefined' && this.publicKeyMtimeMs === fileStats.mtimeMs) {
        return;
      }

      this.publicKey = await readFile(this.config.publicKeyFile, 'utf8');
      this.publicKeyMtimeMs = fileStats.mtimeMs;
      this.lastReloadAt = createTimestamp();
      if (!this.lastLoadedAt) {
        this.lastLoadedAt = this.lastReloadAt;
      }
      this.lastReloadError = undefined;
    } catch (error) {
      this.lastReloadError = error instanceof Error ? error.message : String(error);
      if (!this.publicKey) {
        throw error;
      }
    }
  }
}
