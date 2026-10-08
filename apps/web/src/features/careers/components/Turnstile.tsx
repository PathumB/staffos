import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback': () => void;
        },
      ) => string;
      remove: (id: string) => void;
    };
  }
}

export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
  if (existing) return new Promise((resolve) => existing.addEventListener('load', () => resolve()));
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Turnstile failed to load'));
    document.head.appendChild(s);
  });
}

/**
 * Cloudflare Turnstile (free, privacy-friendly CAPTCHA). Renders nothing when no site key is
 * configured (local dev); the API skips verification in that case too.
 */
export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !ref.current) return;
    let id: string | undefined;
    const el = ref.current;
    loadScript()
      .then(() => {
        id = window.turnstile?.render(el, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token) => onToken(token),
          'expired-callback': () => onToken(null),
        });
      })
      .catch(() => onToken(null));
    return () => {
      if (id) window.turnstile?.remove(id);
    };
  }, [onToken]);

  return TURNSTILE_SITE_KEY ? <div ref={ref} /> : null;
}
