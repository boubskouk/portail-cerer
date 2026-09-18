import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { AgentProfil } from '../types';

// Remplace le RoleContext de démo : le rôle et l'identité viennent désormais
// de la session Supabase (email/mot de passe) + de la ligne `agents`
// correspondante (id = auth.users.id). `agent` reste `null` tant que le
// profil n'a pas encore été chargé, ou si le compte auth n'a pas (encore) de
// ligne `agents` associée (ex. compte créé mais pas encore approuvé/lié).
interface AuthContextValue {
  session: Session | null;
  agent: AgentProfil | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [agent, setAgent] = useState<AgentProfil | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoaded(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setAgent(null);
      return;
    }

    let active = true;
    setAgentLoading(true);

    supabase
      .from('agents')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error('Erreur de chargement du profil agent :', error);
        }
        setAgent((data as AgentProfil | null) ?? null);
        setAgentLoading(false);
      });

    return () => {
      active = false;
    };
  }, [session]);

  async function signOut() {
    await supabase.auth.signOut();
  }

  const loading = !sessionLoaded || (!!session && agentLoading && !agent);

  return (
    <AuthContext.Provider value={{ session, agent, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé sous AuthProvider');
  return ctx;
}
