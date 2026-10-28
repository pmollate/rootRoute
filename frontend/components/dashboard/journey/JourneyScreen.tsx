'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Kpi, Pill, ScreenHead, Section, Status, SyntheticBadge, ui, type Tone } from '@/components/dashboard/ui';
import { useApi } from '@/hooks/useApi';
import s from './journey.module.css';

type StageStatus = 'done' | 'current' | 'waiting' | 'at_risk' | 'failed' | 'skipped' | 'not_reached';
interface Stage { n: number; key: string; label: string; status: StageStatus; at: string | null; actor: string;
  source: 'real' | 'synthetic' | 'rule'; detail: string; withLateLens?: string }
interface Journey { ref: string; kind: 'order' | 'delivery'; synthetic: boolean;
  summary: { clientId: string | null; tier: string | null; channel: string; commitment: string | null;
    destination: string | null; promisedDate: string | null; outcome: string };
  rounds: { id: number; receivedAt: string; decision: string | null }[]; stages: Stage[] }
interface Inbox { emails: { id: number; decision: string | null; status: string }[] }

const STATUS: Record<StageStatus, { tone: Tone; label: string }> = {
  done: { tone: 'good', label: 'Done' }, current: { tone: 'warn', label: 'In progress' }, waiting: { tone: 'warn', label: 'Waiting' },
  at_risk: { tone: 'warn', label: 'At risk' }, failed: { tone: 'bad', label: 'Went wrong here' },
  skipped: { tone: 'neutral', label: 'Not done today' }, not_reached: { tone: 'neutral', label: 'Not reached' },
};
/** The five phases on the tracker, by stage number. */
const PHASES: [string, number[]][] = [['Intake', [1, 2, 3]], ['Plan', [4, 5, 6]], ['Approve', [7, 8]], ['Ship', [9, 10, 11, 12]], ['Deliver', [13, 14]]];
/** Real late deliveries from the supplied data, one per kind of cause (SPEC §5.1). */
const EXAMPLES = [['delivery:D000213', 'Address + carrier lane'], ['delivery:D000559', 'Cut-off']] as const;
const COMMITMENT: Record<string, string> = { same_day: 'Same day', next_day: 'Next day', standard: 'Standard' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-04-05" -> "5 Apr 2026" (no Date parsing, so no time-zone shift). */
const shortDate = (d: string) => { const [y, m, day] = d.split('-'); return `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}`; };

function phaseTone(stages: Stage[]): string {
  if (stages.some((st) => st.status === 'failed')) return s.bad;
  if (stages.some((st) => st.status === 'at_risk' || st.status === 'current' || st.status === 'waiting')) return s.warn;
  if (stages.every((st) => st.status === 'done' || st.status === 'skipped')) return s.good;
  return s.idle;
}

export function JourneyScreen({ initialRef }: { initialRef: string }) {
  const [ref, setRef] = useState(initialRef);
  const [draft, setDraft] = useState(initialRef);
  const j = useApi<Journey>(`/api/journey/${ref}`);
  const inbox = useApi<Inbox>('/api/intake');
  const open = (r: string) => { setDraft(r); setRef(r.trim()); };
  const data = j.data;

  return (
    <div className={s.screen}>
      <ScreenHead title="Order journey">{data?.synthetic && <SyntheticBadge />}</ScreenHead>
      <p className={ui.lede}>
        One order from the client&apos;s email to the door. For a past delivery, the stages that made it late are marked,
        with what the LateLens rule gives on the same facts. For a new order, the stages it has reached so far.
      </p>

      <div className={s.picker}>
        <label className={s.field}>
          <span className={ui.muted}>Order or delivery</span>
          <input className={ui.input} value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && open(draft)} placeholder="delivery:D000213 or email:8" />
        </label>
        <button type="button" className={`${ui.button} ${ui.primary}`} onClick={() => open(draft)}>Open</button>
        <span className={s.chips}>
          {EXAMPLES.map(([r, label]) => (
            <button key={r} type="button" className={s.chip} onClick={() => open(r)} title={label}>{r}</button>
          ))}
          {inbox.data?.emails.slice(0, 4).map((e) => (
            <button key={e.id} type="button" className={s.chip} onClick={() => open(`email:${e.id}`)}>{`email:${e.id}`}</button>
          ))}
        </span>
      </div>

      {j.error ? <p className={ui.error} role="alert">No order or delivery found for {ref}.</p> : <Status loading={j.loading} />}

      {data && (
        <>
          <div className={ui.kpis}>
            <Kpi label="Outcome" value={data.summary.outcome} />
            <Kpi label="Promised" value={data.summary.promisedDate ? shortDate(data.summary.promisedDate) : '—'} note={COMMITMENT[data.summary.commitment ?? ''] ?? undefined} />
            <Kpi label="Client" value={data.summary.clientId ?? 'Unknown'} note={data.summary.tier ?? undefined} />
            <Kpi label="Destination" value={data.summary.destination ?? '—'} note={data.summary.channel} />
          </div>

          <div className={s.tracker} aria-label="Phases">
            {PHASES.map(([name, ns]) => (
              <div key={name} className={s.phase}>
                <div className={`${s.bar} ${phaseTone(data.stages.filter((st) => ns.includes(st.n)))}`} />
                {name}
              </div>
            ))}
          </div>

          <Section title={data.kind === 'delivery' ? `Past delivery ${data.ref.slice(9)}` : `Order email ${data.ref.slice(6)}`}
            badge={data.kind === 'order' ? <Link href="/dashboard/intake" className={s.link}>Open in Order emails →</Link> : undefined}>
            <ol className={s.timeline}>
              {data.stages.map((st) => (
                <li key={st.key} className={`${s.stage} ${st.status === 'not_reached' || st.status === 'skipped' ? s.dim : ''}`}>
                  <span className={`${s.dot} ${s[st.status]}`} aria-hidden="true">{st.n}</span>
                  <div className={s.body}>
                    <div className={s.line}>
                      <strong>{st.label}</strong>
                      <Pill tone={STATUS[st.status].tone}>{STATUS[st.status].label}</Pill>
                      {st.source === 'synthetic' && st.status !== 'not_reached' && <SyntheticBadge />}
                      <span className={s.meta}>{[st.at, st.actor !== '—' ? st.actor : null].filter(Boolean).join(' · ')}</span>
                    </div>
                    {st.detail && <p className={s.detail}>{st.detail}</p>}
                    {st.withLateLens && <p className={s.fix}><span>With LateLens</span> {st.withLateLens}</p>}
                  </div>
                </li>
              ))}
            </ol>
            {data.kind === 'order' && (
              <p className={ui.muted}>Stages 10–13 show once the simulated warehouse and carrier events are built (REQ-JRN-05).</p>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
