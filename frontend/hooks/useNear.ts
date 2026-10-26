import { useEffect, type RefObject } from 'react';
import { whenNear } from '@/lib/dom';

/** Calls `onNear` once `ref` is within one viewport of the screen; used to defer heavy media. */
export function useNear(ref: RefObject<HTMLElement | null>, onNear: () => void) {
  useEffect(() => {
    const el = ref.current;
    return el ? whenNear(el, onNear) : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
