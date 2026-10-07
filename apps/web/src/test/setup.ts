import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { endSession } from '@/lib/session';

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
