// App settings (design docs/superpowers/specs/2026-10-30-order-journey-auto-advance-design.md §4): the one writer of
// app_settings. Python never reads or writes it.
import type { AuthUser } from '../../core/contracts.js';
import { query } from '../../core/db/pool.js';

/** Off unless an admin switched it on (no row is off). */
export async function autoAdvanceOn(): Promise<boolean> {
  const rows = await query<{ value: unknown }>("SELECT value FROM app_settings WHERE key = 'auto_advance'");
  return rows[0]?.value === true;
}

/** SEC-SET-01: the change and its audit row are one statement, so neither is written without the other. */
export async function setAutoAdvance(enabled: boolean, actor: AuthUser): Promise<void> {
  await query(
    `WITH s AS (
       INSERT INTO app_settings (key, value, updated_by) VALUES ('auto_advance', $1::jsonb, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING key)
     INSERT INTO audit_log (actor, action, ref, payload)
     SELECT $2, 'set_auto_advance', 'setting:auto_advance', $3::jsonb FROM s`,
    [JSON.stringify(enabled), actor.id, JSON.stringify({ enabled, name: actor.name, roles: actor.roles })]);
}
