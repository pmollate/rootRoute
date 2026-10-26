import Image from 'next/image';
import { BrandMark } from '@/components/ui/BrandMark';
import { BRAND } from '@/config/copy';
import styles from './LostRoute.module.css';

type Link = { label: string; href: string };

type Props = {
  code: string;
  accent: string;
  title: string;
  body: string;
  home: Link;
  help: Link;
  /** the header button; "home page" is already in the body links */
  track: Link;
  /** a background-free render (e.g. /lost-courier.png); without one the drawn courier stands in */
  image?: string;
};

/** Full-page "lost" state: headline + courier, static. */
export default function LostRoute({ code, accent, title, body, home, help, track, image }: Props) {
  return (
    <main className={styles.page}>
      <header className={styles.bar}>
        <a className={styles.mark} href={home.href} aria-label={`${BRAND} home`}>
          <BrandMark className={styles.glyph} />
          {BRAND.toUpperCase()}
        </a>
        <a className={styles.pill} href={track.href}>
          {track.label} <span aria-hidden="true">→</span>
        </a>
      </header>

      {/* the route that never arrives: right half only, up behind his left side, over his head and out the right edge */}
      <svg className={styles.route} viewBox="0 0 600 800" preserveAspectRatio="none" aria-hidden="true">
        <path
         
          d="M40 820 C 30 600, 20 380, 110 230 S 380 30, 640 120"
          pathLength={1000}
          strokeDasharray="10 14"
        />
      </svg>

      <section className={styles.body}>
        <p className={styles.code}>
          Error {code}
        </p>
        <h1 className={styles.title}>
          <span className={styles.clip}>
            <span className={styles.accent}>
              {accent}
            </span>
          </span>
          {halves(title).map((line) => (
            <span key={line} className={styles.clip}>
              <span>{line}</span>
            </span>
          ))}
        </h1>
        <p className={styles.lead}>
          {body}
        </p>
        <p className={styles.links}>
          Go back to the{' '}
          <a href={home.href}>home page</a> or{' '}
          <a href={help.href}>{help.label.toLowerCase()}</a>.
        </p>
      </section>

      <div className={styles.figure}>
        <div>
          <div>
            {image ? (
              <Image src={image} alt="" width={760} height={874} priority className={styles.render} />
            ) : (
              <Courier />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/** Two lines of display type, so each can rise in on its own. */
function halves(text: string) {
  const words = text.split(' ');
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')].filter(Boolean);
}

/** Flat stand-in courier: cap, uniform, a map held up and turned the wrong way. */
function Courier() {
  return (
    <svg className={styles.courier} viewBox="0 0 320 420" aria-hidden="true">
      <ellipse cx="160" cy="404" rx="96" ry="12" className={styles.shadow} />
      {/* legs */}
      <rect x="118" y="290" width="34" height="108" rx="14" className={styles.uniformDark} />
      <rect x="168" y="290" width="34" height="108" rx="14" className={styles.uniformDark} />
      {/* body */}
      <rect x="96" y="168" width="128" height="148" rx="44" className={styles.uniform} />
      <path d="M128 172 L160 212 L192 172" className={styles.collar} />
      {/* left arm scratching head */}
      <path d="M110 196 C 70 190, 68 120, 104 96" className={styles.arm} />
      <circle cx="106" cy="94" r="14" className={styles.skin} />
      {/* head */}
      <circle cx="160" cy="118" r="50" className={styles.skin} />
      <circle cx="144" cy="116" r="5" className={styles.ink} />
      <circle cx="178" cy="116" r="5" className={styles.ink} />
      <path d="M136 100 l14 4 M172 104 l14 -6" className={styles.brow} />
      <path d="M148 146 q12 -8 26 2" className={styles.brow} />
      {/* cap */}
      <path d="M108 104 C 110 52, 210 52, 212 104 Z" className={styles.cap} />
      <rect x="196" y="96" width="44" height="12" rx="6" className={styles.cap} />
      <text x="160" y="94" textAnchor="middle" className={styles.capText}>?</text>
      {/* right arm holding the map */}
      <path d="M212 200 C 250 196, 262 160, 254 132" className={styles.arm} />
      <g>
        <rect x="216" y="56" width="92" height="74" rx="4" className={styles.map} />
        <path d="M246 56 v74 M278 56 v74" className={styles.mapFold} />
        <path d="M226 116 C 246 96, 262 112, 272 84 S 296 74, 300 66" className={styles.mapRoute} />
        <circle cx="300" cy="66" r="4" className={styles.mapPin} />
      </g>
      <circle cx="254" cy="132" r="14" className={styles.skin} />
    </svg>
  );
}
