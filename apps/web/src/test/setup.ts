import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { endSession } from '@/lib/session';

// findBy*/waitFor default to 1 s, which flakes on busy machines; real UI waits are well below this.
configure({ asyncUtilTimeout: 5000 });

// jsdom lacks matchMedia (used by the theme provider).
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

afterEach(() => {
  cleanup();
  endSession(false);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
