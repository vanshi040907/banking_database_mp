import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

// kind: 'customer' | 'staff'
export function AuthProvider({ kind, children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!tokenStore.get());
  const mePath = kind === 'customer' ? '/customer/me' : '/staff/me';

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) { setUser(null); setLoading(false); return; }
    try { setUser(await api(mePath)); } catch { tokenStore.clear(); setUser(null); }
    setLoading(false);
  }, [mePath]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const out = () => setUser(null);
    window.addEventListener('inkwell:signed-out', out);
    return () => window.removeEventListener('inkwell:signed-out', out);
  }, []);

  const value = useMemo(() => ({
    user, loading, refresh,
    can: (perm) => !!user?.permissions?.includes(perm),
    signIn: async (token) => { tokenStore.set(token); setLoading(true); await refresh(); },
    signOut: () => { tokenStore.clear(); setUser(null); },
  }), [user, loading, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
