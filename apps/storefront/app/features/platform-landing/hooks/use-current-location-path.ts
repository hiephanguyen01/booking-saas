import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';

/**
 * The current path, search and fragment — the value to hand back to a redirect so
 * the visitor returns to where they were.
 *
 * `useLocation()` alone is not enough here. The landing's section links are plain
 * `<a href="#pricing">` anchors rather than `<Link>`s, so the browser handles the
 * jump and the router never learns about it: its `hash` is whatever the page was
 * loaded with, which is usually empty. `hashchange` fires for exactly those jumps,
 * so the fragment is tracked from `window` while `useLocation()` supplies the rest
 * and the SSR-safe first render.
 */
export function useCurrentLocationPath(): string {
  const location = useLocation();
  const [hash, setHash] = useState(location.hash);

  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    // A router navigation may itself have changed the fragment, so re-read on
    // every one rather than only on `hashchange`.
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [location.key]);

  return `${location.pathname}${location.search}${hash}`;
}
