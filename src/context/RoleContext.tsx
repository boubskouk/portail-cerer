import { useAuth } from './AuthContext';
import type { Role } from '../types';

// Le rôle vient désormais du profil agent authentifié (AuthContext), plus
// d'un sélecteur de démo. Ce hook est conservé tel quel pour ne pas modifier
// tous les composants qui lisaient `useRole()` (AppShell, Sidebar, DrhPage).
// À utiliser uniquement sous <RequireAuth> (garantit `agent` non nul —
// voir components/auth/RequireAuth.tsx).
export function useRole(): { role: Role } {
  const { agent } = useAuth();
  if (!agent) {
    throw new Error('useRole doit être utilisé une fois le profil agent chargé (sous RequireAuth)');
  }
  return { role: agent.role };
}
