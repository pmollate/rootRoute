'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { SessionExpired, postJSON, signInAgain } from '@/lib/api';

/** The API's reply (backend/api/src/modules/assistant/answer.ts, `AssistantAnswer`). */
export interface AssistantSource { tool: string; args: Record<string, unknown>; result: unknown }
export interface AssistantAnswer {
  questionId: string; answer: string; refused: boolean; checked: boolean; sources: AssistantSource[]; toolCalls: number; skipped: string[];
}
/** One question and, once it came back, its answer. A question without an answer is the one being asked. */
export interface Exchange { question: string; answer?: AssistantAnswer }
/** A fixed message for the operator, and a sign-in link when the session ended. */
export interface AskError { text: string; link?: string }

export const MAX_QUESTION = 500; // SEC-ASK-01 (the API refuses longer with 400 too_long)
const MAX_HISTORY = 6;           // the API accepts at most 6 earlier turns
/** REQ-AUTH-11 for the assistant: signing in reloads the page and SEC-ASK-03 forbids storing the conversation. */
export const ASK_SESSION_ENDED = 'Your session has ended. Sign in again, then ask again; this conversation is not kept.';

/** The API's error codes (routes.ts) as the operator reads them; no server text reaches the screen. */
function message(err: unknown, path: string): AskError {
  if (err instanceof SessionExpired) return { text: ASK_SESSION_ENDED, link: signInAgain(path) };
  if (err instanceof Error && err.message === 'rate_limited') return { text: 'Too many questions in a minute. Try again shortly.' };
  if (err instanceof Error && err.message === 'too_long') return { text: `Questions can be at most ${MAX_QUESTION} characters.` };
  return { text: 'Ask LateLens is not available right now.' };
}

/**
 * D10 (SPEC §5.16, owner C): one conversation with POST /api/assistant, used by the Ask LateLens panel and Overview's
 * Router. It lives only in component state: nothing in localStorage or sessionStorage, gone on reload (SEC-ASK-03).
 * Only answered exchanges stay, so the history alternates user/assistant; the last 6 turns go with each question.
 * `ask` resolves to false when there was no answer: the caller puts the question back in its box.
 */
export function useAsk() {
  const path = usePathname() ?? '/dashboard';
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AskError | null>(null);

  async function ask(question: string): Promise<boolean> {
    const q = question.trim();
    if (!q || q.length > MAX_QUESTION || busy) return false;
    const history = exchanges.flatMap((x) => (x.answer
      ? [{ role: 'user' as const, text: x.question }, { role: 'assistant' as const, text: x.answer.answer }] : [])).slice(-MAX_HISTORY);
    setBusy(true);
    setError(null);
    setExchanges((xs) => [...xs, { question: q }]);
    try {
      const answer = await postJSON<AssistantAnswer>('/api/assistant', { question: q, history });
      setExchanges((xs) => [...xs.slice(0, -1), { question: q, answer }]);
      return true;
    } catch (err) {
      setExchanges((xs) => xs.slice(0, -1));
      setError(message(err, path));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { exchanges, busy, error, ask };
}
