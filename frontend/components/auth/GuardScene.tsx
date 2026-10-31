/**
 * /no-access art: a guard holding up an ID card between two rope barriers, in front of a pale dome on the horizon.
 * Navy fills follow the theme; outlines use --hero-ink (navy in both themes), so the shapes stay defined in dark mode. Decorative: the page's heading carries the message.
 */
const POSTS = [40, 200, 400, 560];

function Post({ x }: { x: number }) {
  return (
    <g>
      <rect x={x - 20} y={366} width={40} height={8} rx={4} />
      <rect x={x - 5} y={276} width={10} height={92} rx={3} />
      <circle cx={x} cy={272} r={8} />
    </g>
  );
}

export function GuardScene({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 600 400" aria-hidden="true" focusable="false"
      stroke="var(--hero-ink)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round">
      <path d="M70 230 A230 230 0 0 1 530 230 Z" fill="var(--navy-soft)" stroke="none" />
      <line x1={0} y1={230} x2={600} y2={230} stroke="var(--navy)" />

      {/* the barriers: a bar between each pair of posts */}
      <g fill="var(--navy-2)">
        <rect x={40} y={284} width={160} height={8} rx={4} />
        <rect x={400} y={284} width={160} height={8} rx={4} />
        {POSTS.map((x) => <Post key={x} x={x} />)}
      </g>

      {/* the guard */}
      <g transform="translate(240 186)">
        <ellipse cx={60} cy={186} rx={50} ry={6} fill="var(--navy-soft)" stroke="none" />
        <g fill="var(--navy-2)">
          <rect x={40} y={128} width={16} height={52} rx={6} />
          <rect x={64} y={128} width={16} height={52} rx={6} />
          <rect x={34} y={174} width={24} height={10} rx={5} fill="var(--navy)" />
          <rect x={62} y={174} width={24} height={10} rx={5} fill="var(--navy)" />
          <rect x={28} y={70} width={64} height={66} rx={18} />
        </g>
        <line x1={30} y1={124} x2={90} y2={124} />
        <path d="M50 71 L60 83 L70 71" fill="none" />
        <circle cx={60} cy={48} r={22} fill="var(--cream)" />
        <circle cx={52} cy={50} r={2.2} fill="var(--hero-ink)" stroke="none" />
        <circle cx={68} cy={50} r={2.2} fill="var(--hero-ink)" stroke="none" />
        <path d="M37 34 C37 12 83 12 83 34 Z" fill="var(--navy-2)" />
        <path d="M33 34 H87 Q89 41 82 41 H38 Q31 41 33 34 Z" fill="var(--navy)" />
        <circle cx={60} cy={25} r={4} fill="var(--cream)" />
        {/* arms: a navy outline under a lighter sleeve */}
        <path d="M36 82 Q18 100 28 114 M84 82 Q102 100 74 114" fill="none" strokeWidth={14} />
        <path d="M36 82 Q18 100 28 114 M84 82 Q102 100 74 114" fill="none" stroke="var(--navy-2)" strokeWidth={9} />
        <rect x={20} y={96} width={58} height={38} rx={5} fill="var(--cream)" />
        <circle cx={36} cy={110} r={5} fill="var(--navy-2)" />
        <path d="M27 126 Q36 115 45 126 Z" fill="var(--navy-2)" />
        <path d="M52 108 H70 M52 115 H70 M52 122 H64" strokeWidth={2} />
        <circle cx={26} cy={116} r={6} fill="var(--cream)" />
        <circle cx={74} cy={116} r={6} fill="var(--cream)" />
      </g>
    </svg>
  );
}
