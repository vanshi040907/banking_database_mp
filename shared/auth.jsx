import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

// type: 'CUSTOMER' | 'EMPLOYEE'. The backend's /api/me only returns { type, id }.
export function AuthProvider({ type, children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!tokenStore.get());

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) { setUser(null); setLoading(false); return; }
    try {
      const me = await api('/me');
      if (me.type !== type) throw new Error('wrong portal');
      setUser(me);
    } catch { tokenStore.clear(); setUser(null); }
    setLoading(false);
  }, [type]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const out = () => setUser(null);
    window.addEventListener('inkwell:signed-out', out);
    return () => window.removeEventListener('inkwell:signed-out', out);
  }, []);

  const value = useMemo(() => ({
    user, loading, type,
    signIn: async (token) => { tokenStore.set(token); setLoading(true); await refresh(); },
    signOut: () => { tokenStore.clear(); setUser(null); },
  }), [user, loading, type, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
