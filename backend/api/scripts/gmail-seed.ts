// Load the SYNTHETIC fixture emails into the demo inbox (insert, never send). Safe to rerun: skips ones already there.
// Usage (from backend/api): npm run gmail:seed
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from '../src/core/config.js';
import { createGmailClient } from '../src/core/gmail.js';

const DIR = fileURLToPath(new URL('../../tests/fixtures/emails/', import.meta.url));
const gmail = createGmailClient();
const { emailAddress } = await gmail.profile();
if (!config.GMAIL_ACCOUNT || emailAddress.toLowerCase() !== config.GMAIL_ACCOUNT.toLowerCase()) {
  throw new Error(`Signed in as ${emailAddress} but GMAIL_ACCOUNT is ${config.GMAIL_ACCOUNT ?? 'unset'}: refusing to seed`);
}
let added = 0;
let skipped = 0;
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.eml')).sort()) {
  const eml = readFileSync(DIR + file, 'utf8');
  const messageId = /^Message-ID: <(.+)>$/m.exec(eml)?.[1];
  if (!messageId) throw new Error(`${file} has no Message-ID`);
  if ((await gmail.listMessageIds(`rfc822msgid:${messageId}`, 1)).length > 0) {
    skipped += 1;
    continue;
  }
  await gmail.insertMessage(eml);
  added += 1;
}
console.log(`${emailAddress}: added ${added}, already there ${skipped}`);
