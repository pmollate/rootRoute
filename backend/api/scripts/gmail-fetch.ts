// Print the recent order emails the intake pipeline would pick up. Usage (from backend/api): npm run gmail:fetch [-- "<query>"]
import { createGmailClient } from '../src/core/gmail.js';
import { DEFAULT_QUERY, fetchRecentEmails } from '../src/modules/intake/mailbox.js';

const query = process.argv[2] ?? DEFAULT_QUERY;
const emails = await fetchRecentEmails(createGmailClient(), query, 60);
for (const e of emails) console.log(`${e.receivedAt}  ${e.from.padEnd(32)}  ${e.subject}`);
console.log(`\n${emails.length} emails for query: ${query}`);
