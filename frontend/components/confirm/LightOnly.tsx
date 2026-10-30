'use client';

import { useLayoutEffect } from 'react';

/**
 * E19: the client's address page is light only. The pre-paint script in app/layout.tsx does this for the page itself;
 * this covers pages where it does not run (the not-found shell in dev streams the layout's head in, so its script never
 * executes, and the system's dark setting would win). It never saves anything: a staff member's choice is kept.
 */
export function LightOnly() {
  useLayoutEffect(() => { document.documentElement.dataset.theme = 'light'; }, []);
  return null;
}
