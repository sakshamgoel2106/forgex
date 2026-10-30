import React from 'react';
import { useAuth } from '../../lib/AuthContext';
import { LoginView } from '../views/LoginView';
import { getDefaultModuleForRole } from '../../App';
import type { NavModule } from '../layout/Sidebar';

export interface ProtectedRouteProps {
  children: React.ReactNode;
  onNavigate?: (module: NavModule) => void;
}

/**
 * Enterprise Protected Route Guard
 * Enforces authenticated session boundaries, eliminates state hydration race conditions,
 * checks immediate localStorage fallback before redirecting, and protects registration handoffs.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, onNavigate }) => {
  const { user, token, membership, isLoading, isRegistering } = useAuth();

  // Immediate localStorage fallback check
  const hasLocalSession = Boolean(
    typeof window !== 'undefined' &&
    localStorage.getItem('forgex_token') &&
    (localStorage.getItem('forgex_user') || localStorage.getItem('forgex_active_org_id') || localStorage.getItem('forgex_organization'))
  );

  // Never redirect to /login while authenticating or completing company registration
  if (isLoading || isRegistering) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0B0F17] text-[#E2E8F0]">
        <div className="flex flex-col items-center gap-3">
          <img src="/forgex_icon.png" alt="ForgeX AI" className="w-10 h-10 animate-bounce" />
          <span className="text-xs font-mono font-bold tracking-wider text-gray-400">
            {isRegistering ? 'INITIALIZING COMPANY WORKSPACE...' : 'AUTHENTICATING FORGEX SESSION...'}
          </span>
        </div>
      </div>
    );
  }

  // Never bounce to /login if token and user are in React state OR cached in localStorage
  if ((!token || !user) && !hasLocalSession) {
    return (
      <LoginView
        onSuccess={(loggedRole) => {
          const target = getDefaultModuleForRole(loggedRole || membership?.role);
          onNavigate?.(target);
        }}
      />
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;

