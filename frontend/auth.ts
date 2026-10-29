import NextAuth, { CredentialsSignin, type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import { RateLimiter, checkDemo, parseDemoUsers } from '@/lib/auth/demo';
import { authLog } from '@/lib/auth/log';
import { type Role, type SessionUser, toRoles } from '@/lib/auth/roles';

/** P7 sign-in (SPEC-auth §5): Microsoft Entra ID for real users, demo accounts only when AUTH_DEMO=on. */

declare module 'next-auth' {
  interface Session { user: SessionUser }
  interface User { roles?: Role[]; demo?: boolean }
}

/** NFR-AUTH-02: a session ends 8 hours after sign-in, whatever the activity. */
export const SESSION_HOURS = 8;
const SESSION_SECONDS = SESSION_HOURS * 3600;

export const entraConfigured = () => Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET
  && process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER);
export const demoOn = () => process.env.AUTH_DEMO === 'on';

class RateLimited extends CredentialsSignin { code = 'rate_limited'; }
const limiter = new RateLimiter();

/** The last X-Forwarded-For entry is the one App Service's front end added ("ip:port"); earlier ones the client wrote. */
function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? '';
  return fwd.replace(/:\d+$/, '') || 'unknown';
}

function providers(): NextAuthConfig['providers'] {
  const list: NextAuthConfig['providers'] = [];
  if (entraConfigured()) {
    list.push(MicrosoftEntraID({ clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID, clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER }));
  }
  // SEC-AUTH-05: absent unless AUTH_DEMO=on, so the callback endpoint refuses demo sign-in.
  if (demoOn()) {
    list.push(Credentials({
      id: 'demo', name: 'Demo account', credentials: { email: {}, password: {} },
      async authorize(credentials, request) {
        const email = String(credentials?.email ?? '');
        const r = await checkDemo(parseDemoUsers(process.env.AUTH_DEMO_USERS), email, String(credentials?.password ?? ''),
          clientIp(request), limiter);
        if (r.ok) return { id: r.user.id, name: r.user.name, roles: r.user.roles, demo: true };
        authLog(r.reason === 'rate_limited' ? 'auth_rate_limited' : 'auth_signin_failed', { email, route: '/api/auth/callback/demo' });
        if (r.reason === 'rate_limited') throw new RateLimited();
        return null; // the same answer for an unknown email and a wrong password
      },
    }));
  }
  return list;
}

// Read when the server loads this module (Node runtime everywhere, middleware included), so settings are run-time.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: providers(),
  trustHost: true, // App Service terminates TLS in front of Next; AUTH_URL, when set, names the public URL
  pages: { signIn: '/login', error: '/login' },
  // HttpOnly, SameSite=Lax, and Secure on https (Auth.js defaults; SEC-AUTH-04). Absolute limit in the jwt callback.
  session: { strategy: 'jwt', maxAge: SESSION_SECONDS },
  callbacks: {
    jwt({ token, user, account, profile }) {
      const now = Math.floor(Date.now() / 1000);
      if (account && account.provider === 'microsoft-entra-id' && profile) {
        // Roles only from the ID token's `roles` claim (REQ-AUTH-03); the id is the Entra object id.
        token.sub = typeof profile.oid === 'string' ? profile.oid : token.sub;
        token.name = typeof profile.name === 'string' ? profile.name : token.name;
        token.roles = toRoles(profile.roles);
        token.demo = false;
        token.signedInAt = now;
      } else if (account && user) {
        token.sub = user.id;
        token.name = user.name;
        token.roles = toRoles(user.roles);
        token.demo = user.demo === true;
        token.signedInAt = now;
      }
      if (typeof token.signedInAt !== 'number' || now - token.signedInAt > SESSION_SECONDS) return null;
      return token;
    },
    session({ session, token }) {
      session.user = { id: String(token.sub ?? ''), name: String(token.name ?? ''), roles: toRoles(token.roles),
        demo: token.demo === true } as typeof session.user;
      return session;
    },
  },
  events: {
    signIn({ user }) { authLog('auth_signin', { user: user.id ?? null, route: '/api/auth/signin' }); },
    signOut(message) {
      const sub = 'token' in message ? message.token?.sub : undefined;
      authLog('auth_signout', { user: sub ?? null, route: '/api/auth/signout' });
    },
  },
  logger: {
    // REQ-AUTH-12: Entra errors are logged by name only; the page shows a plain message. Demo failures are logged above.
    error(error) {
      if (error instanceof CredentialsSignin) return;
      authLog('auth_provider_error', { route: error.name });
    },
    warn() {},
    debug() {},
  },
});
