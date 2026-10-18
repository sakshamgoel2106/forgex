import jwt from 'jsonwebtoken';
import type { IAuthAdapter, AuthUser } from './authAdapter.interface.js';

export class LocalDevAuthAdapter implements IAuthAdapter {
  constructor(private jwtSecret: string) {}

  public getProviderName(): string {
    return 'local_dev';
  }

  public async verifyToken(token: string): Promise<AuthUser> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as jwt.JwtPayload;

      if (!decoded.sub || !decoded.email) {
        throw new Error('Token missing mandatory sub or email claim');
      }

      return {
        id: decoded.sub,
        email: decoded.email as string,
        emailVerified: true,
        fullName: (decoded.name as string) || (decoded.email as string).split('@')[0],
        metadata: decoded.metadata as Record<string, unknown> | undefined,
      };
    } catch (err) {
      throw new Error(`Authentication token verification failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  public static generateDevToken(
    user: AuthUser,
    secret: string,
    expiresIn = '1h'
  ): string {
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.fullName,
        email_verified: user.emailVerified,
        metadata: user.metadata,
      },
      secret,
      { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] }
    );
  }
}
