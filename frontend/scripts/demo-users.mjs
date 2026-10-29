// P7 local sign-in (SPEC-auth §5.5, NFR-AUTH-03): run by `npm run setup`. Writes one demo account per role to the
// gitignored repo-root .env with one random password, printed once, plus the local auth settings it needs.
// Leaves values that are already set alone. Does nothing in CI (CD gets its settings from Key Vault, SEC-AUTH-02).
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FILE = process.env.DEMO_ENV_FILE ?? `${ROOT}.env`;
const ROLES = ['order_desk', 'warehouse_supervisor', 'carrier_manager', 'customer_support', 'leadership', 'admin'];

if (process.env.CI) {
  console.log('demo-users: skipped in CI');
  process.exit(0);
}
if (!existsSync(FILE)) {
  copyFileSync(`${ROOT}.env.example`, FILE);
  console.log('demo-users: created .env from .env.example');
}

let env = readFileSync(FILE, 'utf8');
const current = (key) => new RegExp(`^${key}=(.*)$`, 'm').exec(env)?.[1]?.trim() ?? '';
function set(key, value) {
  const line = `${key}=${value}`;
  env = new RegExp(`^${key}=.*$`, 'm').test(env) ? env.replace(new RegExp(`^${key}=.*$`, 'm'), () => line) : `${env.replace(/\n?$/, '\n')}${line}\n`;
}
const secret = () => randomBytes(32).toString('base64url');

if (!current('AUTH_DEMO')) set('AUTH_DEMO', 'on');
if (!current('AUTH_URL')) set('AUTH_URL', 'http://localhost:3000');
if (!current('AUTH_SECRET')) set('AUTH_SECRET', secret());
if (!current('INTERNAL_AUTH_SECRET')) set('INTERNAL_AUTH_SECRET', secret());

let password = null;
if (!current('AUTH_DEMO_USERS')) {
  password = randomBytes(12).toString('base64url');
  const hash = bcrypt.hashSync(password, 10);
  const users = ROLES.map((r) => ({ email: `demo-${r}@latelens.test`, name: `Demo ${r.replace(/_/g, ' ')}`, roles: [r], hash }));
  // Single quotes keep the JSON whole; \$ stops @next/env expanding the bcrypt hash's $ signs.
  set('AUTH_DEMO_USERS', `'${JSON.stringify(users).replace(/\$/g, '\\$')}'`);
}
writeFileSync(FILE, env, { mode: 0o600 });

if (password) {
  console.log(`demo-users: ${ROLES.length} demo accounts written to .env (demo-<role>@latelens.test). Password, shown once:`);
  console.log(`  ${password}`);
} else {
  console.log('demo-users: AUTH_DEMO_USERS already set in .env; nothing changed (delete the line to make new accounts)');
}
