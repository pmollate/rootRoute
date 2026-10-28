import type { CSSProperties, ReactNode } from 'react';
import s from './pageHero.module.css';

/** `icon` adds a small tile before the label; `tone: 'hot'` colours the tile and value as a warning. */
export interface HeroChip { label: string; value: ReactNode; note?: ReactNode; title?: string; icon?: ReactNode; tone?: 'hot' }

interface PageHeroProps {
  /** Background photo, shown on the right behind a dark fade (on top of the text on phones). */
  image: string;
  /** CSS background-position / background-size for the photo on wide screens. */
  imagePosition?: string;
  imageSize?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  /** 'page' sets the title as the page heading; 'metric' sets it as one large figure. */
  variant?: 'page' | 'metric';
  /** A small dashed pill beside the title. */
  badge?: ReactNode;
  text?: ReactNode;
  chips?: HeroChip[];
  /** Where the chips sit on wide screens: top or bottom right, or bottom left under the text. On phones they always follow the body. */
  chipsAt?: 'top' | 'bottom' | 'bottomLeft';
  /** Anything below the text: controls, a progress bar. */
  children?: ReactNode;
}

/** The dark photo header shared by the dashboard screens. */
export function PageHero({ image, imagePosition, imageSize, eyebrow, title, variant = 'page', badge, text, chips, chipsAt = 'bottom', children }: PageHeroProps) {
  const Title = variant === 'page' ? 'h1' : 'p';
  const style = { '--hero-img': `url('${image}')`, '--hero-pos': imagePosition, '--hero-size': imageSize } as CSSProperties;
  const chipRow = chips && chips.length > 0 && (
    <div className={`${s.chips} ${chipsAt === 'top' ? s.chipsTop : chipsAt === 'bottomLeft' ? s.chipsLeft : ''}`}>
      {chips.map((c) => (
        <div key={c.label} className={`${s.chip} ${c.icon ? s.chipIcon : ''} ${c.tone === 'hot' ? s.chipHot : ''}`} title={c.title}>
          {c.icon && <span className={s.chipMark} aria-hidden="true">{c.icon}</span>}
          <div>
            <p>{c.label}</p>
            <b>{c.value}</b>{c.note && <> <small>{c.note}</small></>}
          </div>
        </div>
      ))}
    </div>
  );
  return (
    <section className={s.hero} style={style}>
      <div className={s.body}>
        {eyebrow && <p className={s.eyebrow}><i />{eyebrow}</p>}
        <div className={s.titleRow}>
          <Title className={variant === 'page' ? s.title : s.metric}>{title}</Title>
          {badge && <span className={s.badge}><span className={s.glyph} aria-hidden="true" />{badge}</span>}
        </div>
        {text && <p className={s.text}>{text}</p>}
        {children}
        {chipsAt === 'bottomLeft' && chipRow}
      </div>
      {chipsAt !== 'bottomLeft' && chipRow}
    </section>
  );
}
