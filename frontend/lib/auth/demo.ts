import bcrypt from 'bcryptjs';
import { type SessionUser, toRoles } from './roles';

/** One AUTH_DEMO_USERS entry (SPEC-auth §5.5): written by `npm run setup` locally, Key Vault `auth-demo-users` in Azure. */
export interface DemoUser { email: string; name: string; roles: SessionUser['roles']; hash: string }

export function parseDemoUsers(json: string | undefined): DemoUser[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((u: Partial<Record<keyof DemoUser, unknown>>) =>
      typeof u.email === 'string' && typeof u.hash === 'string'
        ? [{ email: u.email.toLowerCase(), name: typeof u.name === 'string' ? u.name : u.email, roles: toRoles(u.roles), hash: u.hash }]
        : []);
  } catch {
    return [];
  }
}

/** SEC-AUTH-05: at most `max` failed demo sign-ins per IP in `windowMs`. In memory: one web instance (SPEC §10). */
export class RateLimiter {
  private fails = new Map<string, number[]>();
  constructor(private max = 5, private windowMs = 60_000, private now: () => number = Date.now) {}
  private recent(key: string): number[] {
    const t = this.now();
    const list = (this.fails.get(key) ?? []).filter((x) => t - x < this.windowMs);
    this.fails.set(key, list);
    return list;
  }
  blocked(key: string): boolean { return this.recent(key).length >= this.max; }
  fail(key: string): void { this.recent(key).push(this.now()); }
  /** Counts one request and says whether it is within the limit (E19 per-IP limit, SEC-LINK-04). */
  take(key: string): boolean {
    if (this.blocked(key)) return false;
    this.fail(key);
    return true;
  }
}

// Compared against when the email is unknown, so both failures take the same time and give the same answer.
let decoy: string | null = null;
const decoyHash = () => (decoy ??= bcrypt.hashSync(crypto.randomUUID(), 10));

export type DemoResult = { ok: true; user: SessionUser } | { ok: false; reason: 'invalid' | 'rate_limited' };

export async function checkDemo(users: DemoUser[], email: string, password: string, ip: string,
  limiter: RateLimiter): Promise<DemoResult> {
  if (limiter.blocked(ip)) return { ok: false, reason: 'rate_limited' }; // the password is not checked
  const u = users.find((x) => x.email === email.trim().toLowerCase());
  const match = await bcrypt.compare(password, u?.hash ?? decoyHash());
  if (!u || !match) {
    limiter.fail(ip);
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true, user: { id: `demo:${u.email}`, name: u.name, roles: u.roles, demo: true } };
}
