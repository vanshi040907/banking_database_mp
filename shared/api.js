import { useCallback, useEffect, useState } from 'react';

const KEY = 'inkwell.token';
export const tokenStore = {
  get() { try { return sessionStorage.getItem(KEY); } catch { return null; } },
  set(t) { try { sessionStorage.setItem(KEY, t); } catch { /* private mode */ } },
  clear() { try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } },
};

export class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

// Talks to the Express backend (proxied at /api). `token` overrides the stored one,
// used for the forced password change that happens before a session exists.
export async function api(path, { method = 'GET', body, token, signOutOnUnauthorized = true } = {}) {
  const bearer = token ?? tokenStore.get();
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is the backend running?');
  }
  // the rate limiter answers with plain text, so JSON parsing can fail
  const data = await res.json().catch(() => ({}));
  if (res.status === 429 && !data.error) throw new ApiError(429, 'Too many attempts. Please wait a few minutes and try again.');
  if (res.status === 401 && signOutOnUnauthorized && !token && tokenStore.get() && !path.startsWith('/auth/')) {
    tokenStore.clear();
    window.dispatchEvent(new Event('inkwell:signed-out'));
  }
  if (!res.ok) throw new ApiError(res.status, data.error || 'Something went wrong', data.code);
  return data;
}

// GET helper with loading / error state
export function useApi(path, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(() => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    api(path).then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => setState({ data: null, error: error.message, loading: false }));
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: load };
}
