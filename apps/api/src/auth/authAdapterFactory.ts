import type { IAuthAdapter } from './authAdapter.interface.js';
import { SupabaseAuthAdapter } from './supabaseAuthAdapter.js';
import { KeycloakAuthAdapter } from './keycloakAuthAdapter.js';
import { LocalDevAuthAdapter } from './localDevAuthAdapter.js';
import type { EnvConfig } from '../config/env.js';

export function createAuthAdapter(config: EnvConfig): IAuthAdapter {
  switch (config.AUTH_PROVIDER) {
    case 'supabase':
      return new SupabaseAuthAdapter({
        jwtSecret: config.SUPABASE_JWT_SECRET || config.JWT_SECRET,
        projectUrl: config.SUPABASE_PROJECT_URL,
      });

    case 'keycloak':
      return new KeycloakAuthAdapter({
        realmUrl: config.KEYCLOAK_REALM_URL || 'http://localhost:8080/realms/forgex',
        clientId: config.KEYCLOAK_CLIENT_ID || 'forgex-api',
        jwtSecret: config.JWT_SECRET,
      });

    case 'local_dev':
    default:
      return new LocalDevAuthAdapter(config.JWT_SECRET);
  }
}
