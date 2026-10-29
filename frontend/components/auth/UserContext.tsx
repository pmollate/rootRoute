'use client';

import { createContext, type ReactNode, useContext } from 'react';
import { can, canOpen, type SessionUser, type UiAction } from '@/lib/auth/roles';

const Ctx = createContext<SessionUser | null>(null);

/** The signed-in user for every dashboard screen; set once by DashboardShell from the server session. */
export function UserProvider({ user, children }: { user: SessionUser | null; children: ReactNode }) {
  return <Ctx.Provider value={user}>{children}</Ctx.Provider>;
}

export const useUser = () => useContext(Ctx);

/** REQ-AUTH-10: whether to show a control. With nobody signed in (AUTH_REQUIRED=off) everything shows, as before. */
export function useCan(action: UiAction): boolean {
  return can(useUser()?.roles ?? null, action);
}

/** REQ-AUTH-15: whether to link to a screen; a role's links to screens it cannot open show as plain text. */
export function useCanOpen(href: string): boolean {
  return canOpen(useUser()?.roles ?? null, href);
}
