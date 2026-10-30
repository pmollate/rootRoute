'use client';

import { createContext, type ReactNode, useContext } from 'react';

const Ctx = createContext(false);

/**
 * D10: whether Ask LateLens is on (ASK_ASSISTANT=on, read on the server by app/dashboard/layout.tsx). DashboardShell
 * provides it so a screen (Overview's Router) can use the assistant without a NEXT_PUBLIC_ variable (REQ-ASK-08).
 */
export function AssistantFlag({ on, children }: { on: boolean; children: ReactNode }) {
  return <Ctx.Provider value={on}>{children}</Ctx.Provider>;
}

export const useAssistantOn = () => useContext(Ctx);
