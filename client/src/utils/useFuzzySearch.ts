import { useMemo } from 'react';
import Fuse from 'fuse.js';

export default function useFuzzySearch<T = any>(items: T[] = [], query: string, opts: Partial<Fuse.IFuseOptions<T>> = {}, limit = 500) {
  const fuse = useMemo(() => {
    if (!items || items.length === 0) return null;
    try {
      return new Fuse(items, {
        keys: ['name', 'description'],
        threshold: 0.3,
        distance: 32,
        minMatchCharLength: 1,
        ignoreLocation: true,
        ...opts,
      } as Fuse.IFuseOptions<T>);
    } catch (e) {
      return null;
    }
  }, [items, JSON.stringify(opts)]);

  return useMemo(() => {
    if (!query || !fuse) return [] as Fuse.FuseResult<T>[];
    try {
      return fuse.search(query, { limit });
    } catch (e) {
      return [] as Fuse.FuseResult<T>[];
    }
  }, [query, fuse, limit]);
}
