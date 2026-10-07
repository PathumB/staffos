import { useSearchParams } from 'react-router';

/**
 * List state (page, sort, search, filters) kept in the URL so filtered views can be shared,
 * bookmarked and survive reloads. Changing anything but `page` resets to page 1.
 */
export function useListParams() {
  const [params, setParams] = useSearchParams();
  const update = (changes: Record<string, string | undefined>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      if (!('page' in changes)) next.delete('page');
      return next;
    });
  const get = (key: string) => params.get(key) ?? undefined;
  return { params, get, update };
}

/** "AED 45.00" → 4500 fils; empty → undefined. Used by money inputs. */
export const aedToFils = (value: unknown): number | undefined => {
  if (value === '' || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
};

/** Empty number input → undefined (instead of NaN), so optional fields validate cleanly. */
export const optionalNumber = (value: unknown): number | undefined => {
  if (value === '' || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};
