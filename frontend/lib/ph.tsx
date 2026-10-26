import { Fragment } from 'react';

/** Tooltip on every .ph figure */
export const PH_TITLE = 'Placeholder figure';

/** Render copy, marking every [bracketed] placeholder figure with the .ph style. */
export function ph(text: string): React.ReactNode {
  return text.split(/(\[[^\]]+\])/).map((part, i) =>
    part.startsWith('[') && part.endsWith(']') ? (
      <span key={i} className="ph" title={PH_TITLE}>
        {part.slice(1, -1)}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
