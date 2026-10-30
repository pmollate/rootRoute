/**
 * SEC-LINK-01 (SPEC §5.17): a confirm route's URL is logged as /confirm/[token]; the one-time token never reaches a log
 * line. Used by the request log serializer (server.ts) and the auth hook's route field for unmatched URLs (auth.ts).
 */
export const redactLink = (url: string): string => url.replace(/\/confirm\/[^/?#]+/, '/confirm/[token]');
