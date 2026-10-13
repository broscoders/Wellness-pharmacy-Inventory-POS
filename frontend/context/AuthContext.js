'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, refreshSession, setAccessToken } from '@/lib/api';
import { clearCache } from '@/lib/catalogDb';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On first load, try to restore the session from the refresh cookie.
  useEffect(() => {
    let alive = true;
    refreshSession().then((data) => {
      if (!alive) return;
      setUser(data?.user || null);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    setAccessToken(null);
    clearCache(); // the saved medicine list must not stay on a shared counter computer
    setUser(null);
  }, []);

  // re-read the signed-in user (e.g. after the forced password change clears the flag)
  const refreshUser = useCallback(async () => { try { const d = await api('/auth/me'); setUser(d.user); } catch { /* the next request will sign out if the session is gone */ } }, []);

  const can = useCallback((perm) => !!user?.permissions?.includes(perm), [user]);

  const value = useMemo(() => ({ user, loading, login, logout, can, refreshUser }), [user, loading, login, logout, can, refreshUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
