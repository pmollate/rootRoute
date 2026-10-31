/**
 * /dashboard/forbidden art: a guard with a raised hand behind a striped barricade, a padlock and a cone on a pale
 * blob, with "Error 403 Forbidden" beside him. Fills use the theme tokens; outlines use --hero-ink (navy in both
 * themes) and light parts --cream (light in both), so the figure stays defined in dark mode.
 */
const ARM = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function Arm({ d }: { d: string }) {
  return (
    <>
      <path d={d} {...ARM} strokeWidth={26} />
      <path d={d} {...ARM} stroke="var(--navy-2)" strokeWidth={20} />
    </>
  );
}

export function ForbiddenScene({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 600 520" role="img" aria-label="Error 403: Forbidden"
      stroke="var(--hero-ink)" strokeWidth={2.5} strokeLinejoin="round">
      <defs>
        <pattern id="forbidden-stripes" width={44} height={44} patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width={22} height={44} fill="var(--hero-ink)" stroke="none" />
          <rect x={22} width={22} height={44} fill="var(--accent)" stroke="none" />
        </pattern>
      </defs>
      <path d="M300 56 C430 34 548 110 566 232 C584 356 520 470 380 482 C250 494 112 452 84 330 C56 206 170 76 300 56 Z"
        fill="var(--navy-soft)" stroke="none" />

      {/* padlock */}
      <path d="M86 214 V156 A54 54 0 0 1 194 156 V214" fill="none" stroke="var(--navy)" strokeWidth={14} />
      <rect x={60} y={208} width={160} height={146} rx={10} fill="var(--cream)" />
      <circle cx={140} cy={262} r={15} fill="var(--navy-soft)" />
      <path d="M133 272 L128 312 H152 L147 272 Z" fill="var(--navy-soft)" />

      {/* Error 403 Forbidden */}
      <g fill="var(--ink)" stroke="none" textAnchor="middle" fontFamily="var(--font-display)" fontWeight={800}>
        <text x={500} y={150} fontSize={32} letterSpacing={2}>ERROR</text>
        <text x={500} y={240} fontSize={88} letterSpacing={-2}>403</text>
        <text x={500} y={286} fontSize={26} letterSpacing={2}>FORBIDDEN</text>
      </g>

      {/* the guard */}
      <path d="M262 330 L250 480 H282 L300 342 Z M300 342 L318 480 H350 L338 330 Z" fill="var(--hero-ink)" stroke="var(--navy)" strokeWidth={1.5} />
      <rect x={240} y={474} width={46} height={14} rx={6} fill="var(--navy-2)" />
      <rect x={314} y={474} width={46} height={14} rx={6} fill="var(--navy-2)" />
      <rect x={290} y={182} width={20} height={22} fill="var(--cream)" />
      <path d="M254 212 Q300 196 346 212 L354 336 H246 Z" fill="var(--navy-2)" />
      <path d="M282 206 L300 224 L318 206" fill="none" />
      <path d="M296 220 H304 L309 292 L300 304 L291 292 Z" fill="var(--hero-ink)" />
      <circle cx={326} cy={240} r={6} fill="var(--accent)" />
      <rect x={246} y={322} width={108} height={14} fill="var(--hero-ink)" />
      <rect x={293} y={324} width={14} height={10} fill="var(--cream)" stroke="none" />
      <Arm d="M260 220 L228 280 L252 316" />
      <circle cx={252} cy={318} r={10} fill="var(--cream)" />
      <Arm d="M340 220 L380 254 L374 186" />
      {/* the raised hand: palm, four fingers, thumb */}
      <g fill="var(--cream)">
        <rect x={357} y={140} width={34} height={40} rx={11} />
        <rect x={358} y={114} width={8} height={34} rx={4} />
        <rect x={366.5} y={108} width={8} height={38} rx={4} />
        <rect x={375} y={110} width={8} height={36} rx={4} />
        <rect x={383.5} y={118} width={8} height={30} rx={4} />
        <rect x={344} y={150} width={8} height={26} rx={4} transform="rotate(-35 348 163)" />
      </g>
      <ellipse cx={300} cy={158} rx={26} ry={30} fill="var(--cream)" />
      <circle cx={291} cy={160} r={2.6} fill="var(--hero-ink)" stroke="none" />
      <circle cx={309} cy={160} r={2.6} fill="var(--hero-ink)" stroke="none" />
      <path d="M292 177 Q300 173 308 177" fill="none" />
      <path d="M270 140 C268 108 332 108 330 140 Z" fill="var(--hero-ink)" />
      <path d="M264 140 H336 Q332 151 300 151 Q268 151 264 140 Z" fill="var(--navy-2)" />
      <circle cx={300} cy={126} r={5} fill="var(--accent)" />

      {/* the barricade in front of him */}
      <path d="M196 392 L170 488 H192 L218 392 Z M404 392 L430 488 H408 L382 392 Z" fill="var(--hero-ink)" stroke="var(--navy)" strokeWidth={1.5} />
      <path d="M220 392 L244 488 H262 L238 392 Z M380 392 L356 488 H338 L362 392 Z" fill="var(--cream)" />
      <rect x={146} y={352} width={308} height={40} rx={3} fill="url(#forbidden-stripes)" />

      {/* cone */}
      <path d="M478 486 L500 396 H516 L538 486 Z" fill="var(--accent)" />
      <path d="M492 430 H524 L528 450 H488 Z" fill="var(--cream)" />
      <rect x={464} y={484} width={88} height={8} rx={2} fill="var(--hero-ink)" />

      <line x1={40} y1={492} x2={580} y2={492} stroke="var(--ink-2)" strokeWidth={2} />
    </svg>
  );
}
