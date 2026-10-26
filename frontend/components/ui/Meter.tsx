/** A labelled number with a bar. useScene writes [data-val] and scales [data-bar] from config/scenes.ts. */
export function Meter({ id, label, start, size = 'md' }: { id: string; label: string; start: string; size?: 'md' | 'lg' }) {
  return (
    <div className={`meter meter-${size}`} data-meter={id}>
      <div className="meter-head">
        <span className="meter-label">{label}</span>
        <b className="meter-val" data-val>
          {start}
        </b>
      </div>
      <span className="meter-track" aria-hidden="true">
        <span data-bar />
      </span>
    </div>
  );
}
