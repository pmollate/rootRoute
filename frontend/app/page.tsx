import { ChapterRail } from '@/components/layout/ChapterRail';
import { SiteFooter } from '@/components/layout/SiteFooter';
import SiteHeader from '@/components/layout/SiteHeader';
import { SmoothScroll } from '@/components/layout/SmoothScroll';
import { Deliver } from '@/components/sections/Deliver';
import { Detect } from '@/components/sections/Detect';
import { Dispatch } from '@/components/sections/Dispatch';
import { Drive } from '@/components/sections/Drive';
import { Features } from '@/components/sections/Features';
import { Network } from '@/components/sections/Network';
import { Optimize } from '@/components/sections/Optimize';
import { People } from '@/components/sections/People';
import { Results } from '@/components/sections/Results';

/** Story order; SiteFooter follows the Deliver film. Motion: config/scenes.ts. Copy: config/copy.ts. Media: scripts/process-media.sh. */
export default function Home() {
  return (
    <>
      <SmoothScroll />
      <SiteHeader />
      <main>
        <Dispatch />
        <Detect />
        <Drive />
        <Network />
        <Optimize />
        <Results />
        <Features />
        <People />
      </main>
      <Deliver />
      <SiteFooter />
      <ChapterRail />
    </>
  );
}
