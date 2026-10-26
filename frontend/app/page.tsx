import { ChapterRail } from '@/components/layout/ChapterRail';
import SiteHeader from '@/components/layout/SiteHeader';
import { SmoothScroll } from '@/components/layout/SmoothScroll';
import { Deliver } from '@/components/sections/Deliver';
import { Detect } from '@/components/sections/Detect';
import { Dispatch } from '@/components/sections/Dispatch';
import { Drive } from '@/components/sections/Drive';
import { Network } from '@/components/sections/Network';
import { Optimize } from '@/components/sections/Optimize';
import { People } from '@/components/sections/People';
import { Results } from '@/components/sections/Results';

/** Story order; Deliver doubles as the page footer. Motion: config/scenes.ts. Copy: config/copy.ts. Media: scripts/process-media.sh. */
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
        <People />
      </main>
      <Deliver />
      <ChapterRail />
    </>
  );
}
