import { useEffect, useLayoutEffect } from 'react';

/** useLayoutEffect in the browser (pins must exist before paint), useEffect on the server. */
export const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
