import jwt from 'jsonwebtoken';
import type { IAuthAdapter, AuthUser } from './authAdapter.interface.js';

export interface KeycloakConfig {
  realmUrl: string;
  clientId: string;
  publicKey?: string;
  jwtSecret?: string; // For HMAC testing/fallback
}

export class KeycloakAuthAdapter implements IAuthAdapter {
  constructor(private config: KeycloakConfig) {}

  public getProviderName(): string {
    return 'keycloak';
  }

  public async verifyToken(token: string): Promise<AuthUser> {
    try {
      const secretOrKey = this.config.publicKey || this.config.jwtSecret;
      if (!secretOrKey) {
        throw new Error('KeycloakAuthAdapter requires publicKey or jwtSecret configured');
      }

      const decoded = jwt.verify(token, secretOrKey, {
        issuer: this.config.realmUrl ? [this.config.realmUrl] : undefined,
      }) as jwt.JwtPayload;

      if (!decoded.sub) {
        throw new Error('Keycloak token missing sub claim');
      }

      const email = (decoded.email as string) || `${decoded.sub}@internal.plant`;

      return {
        id: decoded.sub,
        email,
        emailVerified: Boolean(decoded.email_verified),
        fullName:
          (decoded.name as string) ||
          (decoded.preferred_username as string) ||
          email.split('@')[0],
        metadata: {
          realm_access: decoded.realm_access,
          resource_access: decoded.resource_access,
          preferred_username: decoded.preferred_username,
        },
      };
    } catch (err) {
      throw new Error(`Keycloak token verification failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
