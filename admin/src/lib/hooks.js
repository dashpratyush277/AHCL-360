import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api, getSession, onSessionChange } from './api';

export const useSession = () => useSyncExternalStore(onSessionChange, getSession);

/** Fetch `path` whenever it changes. Returns { data, error, loading, reload, setData }. */
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    api
      .get(path)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState({ data: null, error, loading: false }));
    return () => {
      alive = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((data) => setState((s) => ({ ...s, data })), []);
  return { ...state, reload, setData };
}

/** Logs the admin out after `minutes` without mouse/keyboard activity. */
export function useIdleLogout(minutes, onIdle) {
  const timer = useRef();
  useEffect(() => {
    if (!minutes) return;
    const reset = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(onIdle, minutes * 60_000);
    };
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes, onIdle]);
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
