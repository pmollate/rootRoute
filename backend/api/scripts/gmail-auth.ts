// One-time consent for the demo Gmail account. Prints GMAIL_REFRESH_TOKEN for .env (never commit it).
// Usage (from backend/api): npm run gmail:auth, then open the printed URL signed in as the demo account.
import { createServer } from 'node:http';
import { config } from '../src/core/config.js';
import { GMAIL_SCOPES } from '../src/core/gmail.js';

const PORT = 53682;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const { GMAIL_CLIENT_ID: clientId, GMAIL_CLIENT_SECRET: clientSecret } = config;
if (!clientId || !clientSecret) throw new Error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env first');

const consent = new URL('https://accounts.google.com/o/oauth2/v2/auth');
consent.search = new URLSearchParams({ client_id: clientId, redirect_uri: REDIRECT, response_type: 'code',
  scope: GMAIL_SCOPES.join(' '), access_type: 'offline', prompt: 'consent' }).toString();
console.log(`Open this URL signed in as ${config.GMAIL_ACCOUNT ?? 'the demo account'}:\n\n${consent}\n`);

const server = createServer(async (req, res) => {
  const code = new URL(req.url ?? '/', REDIRECT).searchParams.get('code');
  if (!code) {
    res.end('No code in the callback.');
    return;
  }
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: REDIRECT,
      grant_type: 'authorization_code' }),
  });
  const body = (await tokenRes.json()) as { refresh_token?: string; error?: string };
  res.end(body.refresh_token ? 'Done. Go back to the terminal.' : `Failed: ${body.error}`);
  console.log(body.refresh_token ? `Add to .env:\nGMAIL_REFRESH_TOKEN=${body.refresh_token}` : `Token exchange failed: ${JSON.stringify(body)}`);
  server.close();
});
server.listen(PORT, '127.0.0.1');
