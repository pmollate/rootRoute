import { config } from './config.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

/** Read the inbox, add the synthetic fixtures (insert, never send), and later create drafts and send replies. */
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.insert',
  'https://www.googleapis.com/auth/gmail.compose',
];

export interface GmailCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface GmailPart {
  mimeType: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  internalDate: string; // ms since epoch, as a string
  labelIds?: string[];
  payload: GmailPart;
}

export class GmailError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'GmailError';
  }
}

/** Gmail REST API for one mailbox, authorised by a refresh token (see scripts/gmail-auth.ts). */
export class GmailClient {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly creds: GmailCredentials, private readonly fetchFn: typeof fetch = fetch) {}

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - 60_000) return this.token.value;
    const res = await this.fetchFn(TOKEN_URL, {
      method: 'POST',
      body: new URLSearchParams({ client_id: this.creds.clientId, client_secret: this.creds.clientSecret,
        refresh_token: this.creds.refreshToken, grant_type: 'refresh_token' }),
    });
    const body = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
    if (!res.ok || !body.access_token) {
      const hint = body.error === 'invalid_grant' ? ' (refresh token expired or revoked: run npm run gmail:auth again)' : '';
      throw new GmailError(`Gmail token refresh failed: ${body.error ?? res.status}${hint}`, res.status);
    }
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return this.token.value;
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchFn(`${API}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${await this.accessToken()}`, 'content-type': 'application/json' },
    });
    if (!res.ok) throw new GmailError(`Gmail ${init.method ?? 'GET'} ${path} returned ${res.status}: ${await res.text()}`, res.status);
    return (await res.json()) as T;
  }

  async profile(): Promise<{ emailAddress: string }> {
    return this.call('/profile');
  }

  /** Message ids matching a Gmail search query (same syntax as the Gmail search box), newest first. */
  async listMessageIds(query: string, max = 50): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ q: query, maxResults: String(Math.min(max - ids.length, 100)) });
      if (pageToken) params.set('pageToken', pageToken);
      const page = await this.call<{ messages?: { id: string }[]; nextPageToken?: string }>(`/messages?${params}`);
      ids.push(...(page.messages ?? []).map((m) => m.id));
      pageToken = page.nextPageToken;
    } while (pageToken && ids.length < max);
    return ids.slice(0, max);
  }

  async getMessage(id: string): Promise<GmailMessage> {
    return this.call(`/messages/${id}?format=full`);
  }

  /** Sends an RFC 822 message, in a thread when threadId is set. Call only through sendReply (allow-list, SEC-03). */
  async sendMessage(rfc822: string, threadId: string | null = null): Promise<string> {
    const raw = Buffer.from(rfc822.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64url');
    const msg = await this.call<{ id: string }>('/messages/send', {
      method: 'POST',
      body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
    });
    return msg.id;
  }

  /** Adds an RFC 822 message to the mailbox without sending it; its Date header becomes the arrival time. */
  async insertMessage(rfc822: string, labelIds = ['INBOX', 'UNREAD']): Promise<string> {
    const raw = Buffer.from(rfc822.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64url');
    const msg = await this.call<{ id: string }>('/messages?internalDateSource=dateHeader', {
      method: 'POST',
      body: JSON.stringify({ raw, labelIds }),
    });
    return msg.id;
  }
}

export function createGmailClient(): GmailClient {
  const { GMAIL_CLIENT_ID: clientId, GMAIL_CLIENT_SECRET: clientSecret, GMAIL_REFRESH_TOKEN: refreshToken } = config;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail needs GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN in .env (run npm run gmail:auth)');
  }
  return new GmailClient({ clientId, clientSecret, refreshToken });
}
