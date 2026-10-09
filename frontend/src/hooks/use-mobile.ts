import { useSyncExternalStore } from 'react';

/** Tailwind's `md` breakpoint (48rem at the default 16px root). */
const MOBILE_QUERY = '(max-width: 47.9375rem)';

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener('change', onChange);
  return () => {
    mql.removeEventListener('change', onChange);
  };
}

function getSnapshot(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

/** True below the `md` breakpoint; subscribes to the media query instead of syncing in an effect. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
