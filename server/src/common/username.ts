/** Username rules from streamy.md FR-1.6/1.7: 3-30 chars [a-z0-9_.], lowercased. */
const RE = /^[a-z0-9_.]{3,30}$/;

export function normalizeUsername(raw: string): string {
  return (raw || '').trim().toLowerCase();
}

export function isValidUsername(raw: string): boolean {
  return RE.test(normalizeUsername(raw));
}

/** Derive a default username suggestion from an email local-part. */
export function usernameFromEmail(email: string): string {
  const base = normalizeUsername(email.split('@')[0]).replace(/[^a-z0-9_.]/g, '');
  const padded = (base + '_user').slice(0, 20);
  return padded.length >= 3 ? padded : 'user_' + Math.random().toString(36).slice(2, 6);
}
