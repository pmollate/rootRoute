'use client';

import { useRef } from 'react';
import { BRAND, copy } from '@/config/copy';
import { useIsoLayoutEffect } from '@/hooks/useIsoLayoutEffect';
import { gsap, ScrollTrigger } from '@/lib/gsap';
import { lerp } from '@/lib/math';

/**
 * The photo rig (public/media/truck-side.webp, from scripts/cut-truck.py), in % of the 512×202 image.
 * Each wheel is a separate 54px crop laid exactly over its own tyre and turned by the distance travelled.
 */
const REAR = 8 / 512; // rear bumper
const BOX = { left: 8 / 512, top: 6 / 202, width: 393 / 512, height: 134 / 202 }; // cargo box, for the livery
const WHEEL_R = 27 / 512; // wheel radius as a share of the truck width
const WHEELS = [
  { src: '/media/truck-wheel-rear.webp', left: 111 / 512, top: 143 / 202 },
  { src: '/media/truck-wheel-front.webp', left: 409 / 512, top: 143 / 202 },
];

/**
 * S2 · Drive: the truck crosses the screen over one viewport of scroll. Its wheels turn by the
 * distance travelled (so they reverse when you scroll back) and a dark panel follows its rear in.
 * The "Next stop" lead is erased along that same edge as the truck drives off.
 */
export function Drive() {
  const ref = useRef<HTMLElement>(null);
  const truck = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const lead = useRef<HTMLDivElement>(null);

  useIsoLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const wheels = gsap.utils.toArray<HTMLElement>('[data-wheel]', root);
      const st = ScrollTrigger.create({
        trigger: root,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: ({ progress: p }) => {
          const t = truck.current;
          const pn = panel.current;
          const ld = lead.current;
          if (!t || !pn || !ld) return;
          const vw = root.clientWidth;
          const tw = t.offsetWidth;
          const x = lerp(-tw * 1.2, vw + tw * 0.2, p);
          t.style.transform = `translate3d(${x}px,0,0)`;
          // the panel's right edge rides on the truck's rear bumper, and the lead is erased up to it
          const rear = x + tw * REAR;
          pn.style.clipPath = `inset(0 ${Math.max(0, vw - rear)}px 0 0)`;
          const box = ld.getBoundingClientRect();
          const cut = Math.min(box.width, Math.max(0, rear - (box.left - root.getBoundingClientRect().left)));
          ld.style.clipPath = `inset(-12px -12px -12px ${cut}px)`;
          const deg = (x / (tw * WHEEL_R)) * (180 / Math.PI);
          wheels.forEach((w) => (w.style.transform = `rotate(${deg}deg)`));
        },
      });
      st.update();
    });
    return () => mm.revert();
  }, []);

  return (
    <section ref={ref} id="drive" className="drive" aria-label="The truck heads out">
      <div className="drive-stage">
        <Lead ref={lead} />
        <div ref={panel} className="drive-panel" aria-hidden="true">
          <p className="drive-line">{copy.drive.line}</p>
        </div>
        <div className="drive-road" aria-hidden="true" />
        <div ref={truck} className="drive-truck" aria-hidden="true">
          <TruckRig />
        </div>
      </div>
    </section>
  );
}

/** "Next stop" lead, centred above the truck's roof line; the truck drives underneath it. */
function Lead({ ref }: { ref: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} className="drive-lead">
      <span className="drive-arrows">
        {[0, 1, 2].map((i) => (
          <svg key={i} viewBox="0 0 12 20" style={{ animationDelay: `${i * 0.18}s` }}>
            <path d="M2 2l8 8-8 8" />
          </svg>
        ))}
      </span>
      <p>
        <span>{copy.drive.lead.kicker}</span>
        {copy.drive.lead.line}
      </p>
    </div>
  );
}

function TruckRig() {
  return (
    <>
      <img className="drive-body" src="/media/truck-side.webp" alt="" width={512} height={202} />
      <span
        className="drive-livery"
        style={{ left: `${BOX.left * 100}%`, top: `${BOX.top * 100}%`, width: `${BOX.width * 100}%`, height: `${BOX.height * 100}%` }}
      >
        {BRAND.toUpperCase()}
      </span>
      {WHEELS.map((w) => (
        <img
          key={w.src}
          data-wheel
          className="drive-wheel"
          src={w.src}
          alt=""
          style={{ left: `${w.left * 100}%`, top: `${w.top * 100}%`, width: `${(54 / 512) * 100}%` }}
        />
      ))}
    </>
  );
}
