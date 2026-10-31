'use client';

import { useState } from 'react';
import { useCan } from '@/components/auth/UserContext';
import { useApi } from '@/hooks/useApi';
import { postJSON } from '@/lib/api';
import s from './settings.module.css';

interface Settings { autoAdvance: boolean }

/**
 * Design 2026-10-30-order-journey-auto-advance §9: the switch that moves approved orders through the simulated WMS and
 * carriers. Every role sees its state; only an admin changes it (SEC-SET-01; the API refuses anyone else anyway).
 */
export function AutoAdvanceCard() {
  const settings = useApi<Settings>('/api/settings');
  const canChange = useCan('settings');
  const [shown, setShown] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const on = shown ?? settings.data?.autoAdvance ?? false;

  const change = async (enabled: boolean) => {
    setShown(enabled);
    setSaving(true);
    setError(null);
    try {
      await postJSON<Settings>('/api/settings/auto-advance', { enabled });
    } catch (e) {
      setShown(!enabled);
      setError(e instanceof Error ? e.message : 'the change was not saved');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={s.card} aria-labelledby="set-journey">
      <div className={s.body}>
        <h2 className={s.title} id="set-journey">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
          </svg>
          Order journey
        </h2>
        <p className={s.text}>
          Synthetic: the API stands in for the WMS and carriers. Approval and the reply to the client stay manual.
        </p>
      </div>
      <div className={s.full}>
        <label className={s.check}>
          <input type="checkbox" role="switch" checked={on} disabled={!canChange || saving || settings.loading || !!settings.error}
            onChange={(e) => change(e.target.checked)} />
          <span>Auto-advance approved orders through the WMS and carriers</span>
        </label>
      </div>
      {settings.error && <p className={`${s.note} ${s.full}`} role="alert">Could not load the setting: {settings.error}</p>}
      {!canChange && <p className={`${s.note} ${s.full}`}>Only an admin can change this.</p>}
      {error && <p className={`${s.note} ${s.full}`} role="alert">Not saved: {error}</p>}
    </section>
  );
}
