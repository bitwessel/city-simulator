import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query and re-render when it flips. Used to branch
 * the HUD into its compact mobile form (panels become popups) on small / touch
 * screens without duplicating the desktop layout.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && 'matchMedia' in window
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** The shared breakpoint below which the HUD collapses into its mobile form. */
export const MOBILE_QUERY = '(max-width: 768px)';
