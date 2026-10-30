import path from 'node:path';
import { ROLES, type Role } from '@/lib/auth/roles';

/**
 * P7 sign-in for the e2e suite (NFR-AUTH-04, SPEC-auth §5.5). The six demo accounts share one password, read only from
 * E2E_DEMO_PASSWORD: never a default, never written to a file, never logged or put in a title or attachment.
 * CD reads it from Key Vault `auth-demo-password`; locally, export it from your own `npm run setup` output.
 *
 * Without it nobody signs in: setup writes nothing and every test runs anonymously, as before P7. That is what an
 * AUTH_REQUIRED=off app (local default, REQ-AUTH-13) expects; the refusal tests skip.
 */
export const signedIn = Boolean(process.env.E2E_DEMO_PASSWORD);

export { ROLES };
export type { Role };

/** The screens and workflow tests run as admin: the only role whose page matrix (§4.4) opens every screen they visit. */
export const WORKFLOW_ROLE: Role = 'admin';

export const demoEmail = (role: Role) => `demo-${role}@rootroute.test`;

/** Saved session per role (cookies only). The folder is gitignored and never uploaded: CD uploads playwright-report only. */
export const authFile = (role: Role) => path.join(__dirname, '.auth', `${role}.json`);
