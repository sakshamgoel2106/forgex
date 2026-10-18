export interface AuthUser {
  id: string; // Unique external subject identifier from identity provider (e.g. Supabase sub or Keycloak UUID)
  email: string;
  emailVerified: boolean;
  fullName?: string;
  metadata?: Record<string, unknown>;
}

export interface IAuthAdapter {
  verifyToken(token: string): Promise<AuthUser>;
  getProviderName(): string;
}
