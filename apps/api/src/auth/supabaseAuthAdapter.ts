import jwt from 'jsonwebtoken';
import type { IAuthAdapter, AuthUser } from './authAdapter.interface.js';

export interface SupabaseConfig {
  jwtSecret: string;
  projectUrl?: string;
}

export class SupabaseAuthAdapter implements IAuthAdapter {
  constructor(private config: SupabaseConfig) {
    if (!config.jwtSecret) {
      throw new Error('SupabaseAuthAdapter requires a valid jwtSecret');
    }
  }

  public getProviderName(): string {
    return 'supabase';
  }

  public async verifyToken(token: string): Promise<AuthUser> {
    try {
      const decoded = jwt.verify(token, this.config.jwtSecret, {
        algorithms: ['HS256'],
      }) as jwt.JwtPayload;

      if (!decoded.sub || !decoded.email) {
        throw new Error('Supabase token missing mandatory sub or email claim');
      }

      return {
        id: decoded.sub,
        email: decoded.email as string,
        emailVerified: Boolean(decoded.email_confirmed_at || decoded.email_verified),
        fullName:
          (decoded.user_metadata?.full_name as string) ||
          (decoded.user_metadata?.name as string) ||
          (decoded.email as string).split('@')[0],
        metadata: decoded.user_metadata as Record<string, unknown> | undefined,
      };
    } catch (err) {
      throw new Error(`Supabase token verification failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
