import { type LoginInput, loginResponseSchema, type Me, type Permission } from '@staffos/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { endSession, onSessionChange, refreshSession, startSession } from '@/lib/session';

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: Me }
  | { status: 'anonymous'; user: null };

type AuthContextValue = AuthState & {
  login: (input: LoginInput) => Promise<Me>;
  logout: () => Promise<void>;
  can: (...permissions: Permission[]) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  useEffect(() => {
    let hadUser = false;
    const off = onSessionChange((user) => {
      setState(user ? { status: 'authenticated', user } : { status: 'anonymous', user: null });
      // Never show one user's cached data to the next. Only when someone was signed in: an
      // anonymous first load has nothing private cached, and clearing would orphan in-flight
      // public queries (careers site). Public data itself is never cleared.
      if (!user && hadUser) {
        queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'careers' });
      }
      hadUser = Boolean(user);
    });
    // Restore the session from the refresh cookie on page load.
    void refreshSession();
    return () => {
      off();
    };
  }, [queryClient]);

  const login = useCallback(
    async (input: LoginInput) => {
      const session = await apiFetch('/auth/login', loginResponseSchema, {
        method: 'POST',
        body: input,
        auth: false,
      });
      queryClient.clear();
      startSession(session);
      return session.user;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    await apiFetch('/auth/logout', null, { method: 'POST', auth: false }).catch(() => undefined);
    endSession();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      logout,
      can: (...permissions) =>
        Boolean(state.user && permissions.every((p) => state.user.permissions.includes(p))),
    }),
    [state, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
