'use client';

import { useState } from 'react';
import { useCan } from '@/components/auth/UserContext';
import { Pill, ScreenHead, Section, Status, Table, ui } from '@/components/dashboard/ui';
import { useApi } from '@/hooks/useApi';
import { SESSION_ENDED, SessionExpired, postJSON, signInAgain } from '@/lib/api';

export interface Triage { stages: string[]; prePickup: boolean; escalate: boolean; draft: string; source: 'model' | 'template'; at?: string }
export interface Complaint {
  complaintId: string; clientId: string; deliveryId: string; category: string; date: string; text: string;
  atRisk: boolean; tier: string; escalate: boolean; triage: Triage | null;
}

/**
 * E12 + E14 (SPEC §5.10, §5.15): the 34 complaints from complaints.csv, Tier 1 and at-risk clients first and marked
 * Escalate. Triage links each to its delivery's causes and drafts a response from those facts only. The Triage button
 * shows for customer_support and admin (SPEC-auth §4.2); the API refuses anyone else.
 */
export function ComplaintsScreen() {
  const list = useApi<{ complaints: Complaint[] }>('/api/complaints');
  const canTriage = useCan('triage');
  const [selected, setSelected] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Record<string, Triage>>({});
  const [note, setNote] = useState<{ text: string; link?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = list.data?.complaints ?? [];
  const c = rows.find((x) => x.complaintId === selected) ?? null;
  const t = c ? fresh[c.complaintId] ?? c.triage : null;
  const escalating = rows.filter((x) => x.escalate).length;

  async function runTriage(id: string) {
    setBusy(true);
    try {
      const r = await postJSON<Triage>(`/api/complaints/${id}/triage`, {});
      setFresh({ ...fresh, [id]: r });
      setNote({ text: `Complaint ${id} triaged${r.escalate ? ' and flagged to escalate' : ''}.` });
      list.reload();
    } catch (e) {
      if (e instanceof SessionExpired) setNote({ text: SESSION_ENDED, link: signInAgain('/dashboard/complaints') });
      else setNote({ text: e instanceof Error && e.message === 'forbidden' ? 'Your role cannot do this.' : 'Could not triage. Refresh and try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ScreenHead title="Complaints" />
      <div className={ui.grid2}>
        <Section title="Complaints" badge={list.data && <Pill>{escalating} of {rows.length} escalate</Pill>}>
          <p className={ui.lede}>From complaints.csv. Tier 1 and at-risk clients first, marked Escalate.</p>
          <Status loading={list.loading} error={list.error} skeleton="rows" />
          {list.data && (
            <Table rows={rows} columns={[
              { key: 'id', label: 'Complaint', render: (x) => (
                <button type="button" className={ui.button} aria-pressed={x.complaintId === selected} onClick={() => setSelected(x.complaintId)}>{x.complaintId}</button>) },
              { key: 'client', label: 'Client', render: (x) => (
                <>{x.clientId} · {x.tier} {x.escalate && <Pill tone="bad" title="Tier 1 or at-risk client: the account owner follows up">Escalate</Pill>}</>) },
              { key: 'cat', label: 'Category', render: (x) => x.category },
              { key: 'del', label: 'Delivery', render: (x) => x.deliveryId },
              { key: 'tri', label: 'Triage', render: (x) => ((fresh[x.complaintId] ?? x.triage) ? 'Done' : '—') },
            ]} />
          )}
        </Section>
        <Section title={c ? `Complaint ${c.complaintId}` : 'Select a complaint'}>
          {c && (
            <>
              <p>{c.date} · {c.category} · delivery <a href={`/dashboard/journey?ref=delivery:${c.deliveryId}`}>{c.deliveryId}</a></p>
              <pre className={ui.pre}>{c.text}</pre>
              {c.escalate && <p>{c.tier}{c.atRisk ? ', threatening to leave' : ''}: escalate to the account owner.</p>}
              {t ? (
                <>
                  <h3>Cause found</h3>
                  <p>Stages: {t.stages.join(', ') || 'none found'} · {t.prePickup ? 'cause before pickup' : 'no cause before pickup'}</p>
                  <h3>Draft response <span className={ui.lede}>({t.source === 'model' ? 'AI draft' : 'template'})</span></h3>
                  <pre className={ui.pre}>{t.draft}</pre>
                </>
              ) : <p className={ui.lede}>Not triaged yet.</p>}
              {canTriage && (
                <button type="button" className={`${ui.button} ${ui.primary}`} disabled={busy} onClick={() => runTriage(c.complaintId)}>
                  {t ? 'Triage again' : 'Triage'}
                </button>
              )}
            </>
          )}
          {note && <p role="status" className={ui.lede}>{note.text}{note.link && <> <a href={note.link}>Sign in again</a></>}</p>}
        </Section>
      </div>
    </>
  );
}
