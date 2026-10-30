import { useCallback, useEffect, useRef, useState } from 'react';
import { getJSON } from '@/lib/api';

/**
 * Loads `path` from the API; `null` skips loading. `reload()` fetches again. `refresh()` does too but keeps what is shown:
 * no loading state, and an error keeps the last answer (for polling). A new `path` always loads normally.
 */
export function useApi<T>(path: string | null): { data?: T; error?: string; loading: boolean; reload: () => void; refresh: () => void } {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: path != null });
  const [tick, setTick] = useState({ n: 0, quiet: false });
  const lastPath = useRef(path);
  useEffect(() => {
    if (!path) return;
    const quiet = tick.quiet && lastPath.current === path;
    lastPath.current = path;
    let live = true;
    if (!quiet) setState((s) => ({ ...s, loading: true }));
    getJSON<T>(path)
      .then((data) => live && setState({ data, loading: false }))
      .catch((e: Error) => live && setState((s) => (quiet ? s : { error: e.message, loading: false })));
    return () => {
      live = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => ({ n: t.n + 1, quiet: false })), []);
  const refresh = useCallback(() => setTick((t) => ({ n: t.n + 1, quiet: true })), []);
  return { ...state, reload, refresh };
}
