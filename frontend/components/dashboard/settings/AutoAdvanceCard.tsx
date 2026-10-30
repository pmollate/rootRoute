'use client';

import { useState } from 'react';
import { useCan } from '@/components/auth/UserContext';
import ui from '@/components/dashboard/ui.module.css';
import { useApi } from '@/hooks/useApi';
import { postJSON } from '@/lib/api';

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
    <section className={ui.card}>
      <h2 className={ui.cardTitle}>Order journey</h2>
      <p className={ui.lede}>
        Synthetic: the API stands in for the WMS and carriers. Approval and the reply to the client stay manual.
      </p>
      <label className={ui.row}>
        <input type="checkbox" role="switch" checked={on} disabled={!canChange || saving || settings.loading || !!settings.error}
          onChange={(e) => change(e.target.checked)} />
        Auto-advance approved orders through the WMS and carriers
      </label>
      {settings.error && <p className={ui.lede} role="alert">Could not load the setting: {settings.error}</p>}
      {!canChange && <p className={ui.lede}>Only an admin can change this.</p>}
      {error && <p className={ui.lede} role="alert">Not saved: {error}</p>}
    </section>
  );
}
