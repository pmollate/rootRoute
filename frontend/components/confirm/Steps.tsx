import s from './confirm.module.css';

const STEPS = ['Verification check', 'Address check'];

/** The address link's two steps (E19): the emailed code, then the address. Each page ticks its own step (✓), and
 *  steps before `current` stay ticked as done. */
export function Steps({ current }: { current: 0 | 1 }) {
  return (
    <ol className={s.stepper} aria-label="Steps">
      {STEPS.map((label, i) => (
        <li key={label} className={i < current ? s.stepDone : i === current ? s.stepNow : s.step}
          aria-current={i === current ? 'step' : undefined}>
          <span className={s.stepDot} aria-hidden="true">{i <= current ? '✓' : i + 1}</span>
          <span>{label}{i < current && <span className={s.srOnly}> (done)</span>}</span>
        </li>
      ))}
    </ol>
  );
}
