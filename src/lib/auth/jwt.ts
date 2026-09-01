// Decodes a JWT's own claims without verifying the signature - only ever used
// on tokens this app already trusts (its own IdToken, just received from the
// backend), purely to read `exp` and schedule a refresh before it hits.
export function decodeExp(token: string | undefined | null): number | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=');
    const json = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as { exp?: number };
    return typeof claims.exp === 'number' ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}
