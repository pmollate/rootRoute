/** Small uppercase label with the orange route dot, above a section heading. */
export function Kicker({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <p className={light ? 'kicker kicker-light' : 'kicker'}>
      <span className="kicker-dot" aria-hidden="true" />
      {children}
    </p>
  );
}
