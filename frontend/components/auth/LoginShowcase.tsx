import s from './auth.module.css';

/** The two photos and the caption that belongs to each. Captions fade in step with the strip (auth.module.css). */
const SLIDES = [
  {
    src: '/media/login-warehouse.jpg',
    eyebrow: 'Root cause',
    title: 'Every late delivery starts somewhere.',
    body: 'Trace each delay back through the warehouse, the carrier and the route, and fix the cause instead of the symptom.',
  },
  {
    src: '/media/login-highway.jpg',
    eyebrow: 'On the road',
    title: 'See the risk while there is still time to act.',
    body: 'Deliveries likely to slip are flagged early, with the reason, so dispatch can step in before the customer notices.',
  },
];

/**
 * Right half of /login: each photo holds, then slides out for the next, in an endless loop (the pair twice, so the
 * restart never shows), with a frosted caption over them. Decorative only; the form beside it carries all the meaning.
 */
export function LoginShowcase() {
  return (
    <aside className={s.showcase} aria-hidden="true">
      <div className={s.strip}>
        {[...SLIDES, ...SLIDES].map((sl, i) => (
          <img key={i} className={s.slide} src={sl.src} alt="" draggable={false} />
        ))}
      </div>
      <div className={s.glass}>
        {SLIDES.map((sl, i) => (
          <div key={sl.src} className={`${s.caption} ${i ? s.captionB : s.captionA}`}>
            <p className={s.eyebrow}>{sl.eyebrow}</p>
            <h2 className={s.glassTitle}>{sl.title}</h2>
            <p className={s.glassBody}>{sl.body}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}
