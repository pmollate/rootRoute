'use client';

import { usePathname } from 'next/navigation';
import { createContext, createElement, type ReactNode, useContext, useState } from 'react';
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
export const MAX_HISTORY = 12;   // SEC-ASK-01 (v0.17): the API accepts at most 12 earlier turns
/** One earlier turn as the API takes it. */
export interface Turn { role: 'user' | 'assistant'; text: string }

/**
 * REQ-ASK-14: the turns sent with a question, oldest first: the answered exchanges (a question still being asked or
 * with no answer is left out, so turns alternate), the last MAX_HISTORY of them. A primer (Overview's opening
 * question and plan) always goes first and takes its share of the limit.
 */
export function historyFor(exchanges: Exchange[], primer: Turn[] = []): Turn[] {
  const turns = exchanges.flatMap((x) => (x.answer
    ? [{ role: 'user' as const, text: x.question }, { role: 'assistant' as const, text: x.answer.answer }] : []));
  const room = Math.max(0, MAX_HISTORY - primer.length);
  return [...primer, ...(room ? turns.slice(-room) : [])];
}
/** REQ-AUTH-11 for the assistant: signing in reloads the page and SEC-ASK-03 forbids storing the conversation. */
export const ASK_SESSION_ENDED = 'Your session has ended. Sign in again, then ask again; this conversation is not kept.';

/** The API's error codes (routes.ts) as the operator reads them; no server text reaches the screen. */
function message(err: unknown, path: string): AskError {
  if (err instanceof SessionExpired) return { text: ASK_SESSION_ENDED, link: signInAgain(path) };
  if (err instanceof Error && err.message === 'rate_limited') return { text: 'Too many questions in a minute. Try again shortly.' };
  if (err instanceof Error && err.message === 'too_long') return { text: `Questions can be at most ${MAX_QUESTION} characters.` };
  return { text: 'Router is not available right now.' };
}

type Conversation = { exchanges: Exchange[]; busy: boolean; error: AskError | null; ask: (question: string, primer?: Turn[]) => Promise<boolean> };
const AskContext = createContext<Conversation | null>(null);

/**
 * D10 (SPEC §5.16, owner C): one conversation with POST /api/assistant. It lives only in memory (component state):
 * nothing in localStorage or sessionStorage, gone on reload (SEC-ASK-03). Only answered exchanges go in the history.
 * `ask` resolves to false when there was no answer: the caller puts the question back in its box.
 */
function useConversation(): Conversation {
  const path = usePathname() ?? '/dashboard';
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AskError | null>(null);

  async function ask(question: string, primer: Turn[] = []): Promise<boolean> {
    const q = question.trim();
    if (!q || q.length > MAX_QUESTION || busy) return false;
    const history = historyFor(exchanges, primer);
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

/** REQ-ASK-14: one conversation for the browser window, shared by the dock and Overview's Router across screens. */
export function AskProvider({ children }: { children: ReactNode }) {
  return createElement(AskContext.Provider, { value: useConversation() }, children);
}

/** The window's conversation inside AskProvider (the dashboard shell); a conversation of its own outside it. */
export function useAsk(): Conversation {
  const own = useConversation();
  return useContext(AskContext) ?? own;
}
