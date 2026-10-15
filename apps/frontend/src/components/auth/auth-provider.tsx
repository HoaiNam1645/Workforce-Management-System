'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AUTH_TOKEN_KEY, getAccessToken } from '@/lib/api-client';
import { getCurrentUser, login as loginRequest, type AuthUser } from '@/lib/auth-api';

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    setUser(null);
    router.replace('/login');
  }, [router]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    getCurrentUser()
      .then(setUser)
      .catch(() => window.localStorage.removeItem(AUTH_TOKEN_KEY))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    window.addEventListener('workforce:unauthorized', logout);
    return () => window.removeEventListener('workforce:unauthorized', logout);
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginRequest(email, password);
    window.localStorage.setItem(AUTH_TOKEN_KEY, result.accessToken);
    setUser(result.user);
    return result.user;
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    login,
    logout,
    hasPermission: (permission) => Boolean(user?.permissions.includes(permission)),
    hasRole: (role) => Boolean(user?.roles.some((item) => item.code === role)),
  }), [isLoading, login, logout, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
