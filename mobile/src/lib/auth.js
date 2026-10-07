import { createContext, createElement, useCallback, useContext, useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { api, getSession, loadSession, onSessionChange, setSession } from './api';
import { startAutoSync } from './offline';
import { registerForPush } from './push';
import { stopTracking } from './tracking';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

// Last user interaction (module-level so touch handlers don't touch React state).
let lastActive = Date.now();
const markActive = () => {
  lastActive = Date.now();
};

/**
 * Provides { session, user, ready, signIn, signOut, refreshUser }.
 * Also enforces auto-logout after inactivity (server sends idleTimeoutMinutes).
 */
export function AuthProvider({ children }) {
  const [session, setS] = useState(getSession());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadSession().then((s) => {
      setS(s);
      setReady(true);
    });
    return onSessionChange(setS);
  }, []);

  const signOut = useCallback(async () => {
    const s = getSession();
    await stopTracking().catch(() => {});
    api.post('/auth/logout', { refreshToken: s?.refreshToken }).catch(() => {});
    await setSession(null);
  }, []);

  const signIn = useCallback(async (s) => {
    markActive();
    await setSession(s);
    registerForPush();
    startAutoSync();
  }, []);

  const refreshUser = useCallback(async () => {
    const { user } = await api.get('/auth/me');
    await setSession({ ...getSession(), user });
    return user;
  }, []);

  // Start background services for a restored session.
  useEffect(() => {
    if (ready && session) {
      startAutoSync();
      registerForPush();
    }
  }, [ready, Boolean(session)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Inactivity timeout: check on resume and every 30 s while open.
  useEffect(() => {
    if (!session) return;
    const limit = (session.idleTimeoutMinutes || 30) * 60_000;
    const check = () => {
      if (Date.now() - lastActive > limit) signOut();
    };
    const t = setInterval(check, 30_000);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && check());
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [session, signOut]);

  const value = { session, user: session?.user, ready, signIn, signOut, refreshUser };
  // Any touch anywhere counts as activity.
  return createElement(
    AuthCtx.Provider,
    { value },
    createElement(View, { style: { flex: 1 }, onTouchStart: markActive }, children),
  );
}
