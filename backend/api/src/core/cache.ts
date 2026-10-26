const store = new Map<string, Promise<unknown>>();

/** Memoise a read of data that never changes while the server runs (Python-computed tables). */
export function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!store.has(key)) {
    store.set(
      key,
      load().catch((err: unknown) => {
        store.delete(key);
        throw err;
      }),
    );
  }
  return store.get(key) as Promise<T>;
}

export function clearCache(): void {
  store.clear();
}
