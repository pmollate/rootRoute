'use client';

import { Pill } from '@/components/dashboard/ui';
import type { AskError, AssistantAnswer } from './useAsk';
import s from './ask.module.css';

/**
 * One assistant answer as plain React text, never HTML or Markdown, so an answer cannot load a URL (SEC-ASK-06).
 * Sources are the tools the API ran, as the API lists them (REQ-ASK-05); they start open when the figures could not be
 * checked, since the fixed text then points at them (REQ-ASK-04).
 */
export function AskAnswer({ a }: { a: AssistantAnswer }) {
  const unchecked = !a.refused && !a.checked;
  return (
    <>
      <p className={s.text}>{a.answer}</p>
      {unchecked && <Pill tone="warn">Figures not checked</Pill>}
      {a.sources.length > 0 && (
        <details className={s.sources} open={unchecked}>
          <summary>Sources ({a.sources.length})</summary>
          <ul>
            {a.sources.map((src, j) => (
              <li key={j}>
                <code>{src.tool}({JSON.stringify(src.args)})</code>
                <pre className={s.result}>{JSON.stringify(src.result, null, 2)}</pre>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/** The fixed error line; the only link is our own sign-in page. */
export function AskErrorNote({ error }: { error: AskError }) {
  return (
    <p className={s.error} role="alert">
      {error.text}{error.link && <> <a href={error.link}>Sign in again</a></>}
    </p>
  );
}
