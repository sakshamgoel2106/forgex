import jwt from 'jsonwebtoken';
import type { IAuthAdapter, AuthUser } from './authAdapter.interface.js';

export class LocalDevAuthAdapter implements IAuthAdapter {
  constructor(private jwtSecret: string) {}

  public getProviderName(): string {
    return 'local_dev';
  }

  public async verifyToken(token: string): Promise<AuthUser> {
    if (token === 'local_dev_token' || token === 'local_dev_token_engineer') {
      return {
        id: 'user-dev-eng-1',
        email: 'engineer@forgex.industrial',
        emailVerified: true,
        fullName: 'Lead Plant Engineer',
        metadata: { role: 'ORGANIZATION_OWNER' },
      };
    }
    if (token === 'local_dev_token_admin') {
      return {
        id: 'user-dev-admin-1',
        email: 'admin@forgex.industrial',
        emailVerified: true,
        fullName: 'Industrial Operations Admin',
        metadata: { role: 'ORGANIZATION_ADMIN' },
      };
    }
    if (token === 'local_dev_token_tech') {
      return {
        id: 'user-dev-tech-1',
        email: 'tech@forgex.industrial',
        emailVerified: true,
        fullName: 'Field Maintenance Specialist',
        metadata: { role: 'TECHNICIAN' },
      };
    }
    if (token === 'local_dev_token_worker') {
      return {
        id: 'user-dev-worker-1',
        email: 'worker@forgex.industrial',
        emailVerified: true,
        fullName: 'Shop Floor Operator',
        metadata: { role: 'WORKER' },
      };
    }

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
