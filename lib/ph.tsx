import { Fragment } from 'react';

/** Render copy, marking every [bracketed] placeholder figure with the .ph style. */
export function ph(text: string): React.ReactNode {
  return text.split(/(\[[^\]]+\])/).map((part, i) =>
    part.startsWith('[') && part.endsWith(']') ? (
      <span key={i} className="ph" title="Placeholder figure">
        {part.slice(1, -1)}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
