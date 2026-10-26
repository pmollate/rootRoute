import { useCallback, useEffect, useState } from 'react';
import { getJSON } from '@/lib/api';

/** Loads `path` from the API; `null` skips loading. `reload()` fetches again. */
export function useApi<T>(path: string | null): { data?: T; error?: string; loading: boolean; reload: () => void } {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: path != null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    getJSON<T>(path)
      .then((data) => live && setState({ data, loading: false }))
      .catch((e: Error) => live && setState({ error: e.message, loading: false }));
    return () => {
      live = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
