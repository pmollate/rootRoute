import type { Ref } from 'react';
import { MOBILE_QUERY, type Media } from '@/config/scenes';

type Scrub = Extract<Media, { kind: 'scrub' }>;

/**
 * A scroll-scrubbed clip (useScene seeks it), with the 9:16 cut on phones. Under reduced motion
 * it is a still instead: `still`, or the poster.
 */
export function ScrubVideo({ media, videoRef, reduced, still }: { media: Scrub; videoRef: Ref<HTMLVideoElement>; reduced: boolean; still?: string }) {
  if (reduced) return <img className="cover" src={still ?? media.poster} alt="" />;
  return (
    <video ref={videoRef} className="cover" poster={media.poster} muted playsInline preload="none" aria-hidden="true">
      {media.mobileSrc && <source src={media.mobileSrc} media={MOBILE_QUERY} type="video/mp4" />}
      <source src={media.src} type="video/mp4" />
    </video>
  );
}
