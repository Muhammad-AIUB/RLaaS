import { createHash } from 'crypto';

/**
 * Opaque, base64url-encoded cursor for keyset pagination over composite keys.
 *
 * Format: `<base64url(JSON payload)>.<signature>`. The payload is a
 * `{ v, key }` tuple where `key` is a JSON object whose fields match the
 * `orderBy` columns. The cursor is signed with `JWT_SECRET` so a client
 * cannot fabricate one pointing outside its project — the secret is already
 * required to be set at boot, and forging a cursor with the right signature
 * is not a privilege escalation.
 */

const ALGORITHM = 'sha256';

export type CursorPayload = {
  v: '1';
  key: Record<string, string | number>;
};

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64').toString('utf8');
}

function sign(value: string, secret: string): string {
  return createHash(ALGORITHM).update(`${secret}|${value}`).digest('hex').slice(0, 32);
}

export function encodeCursor(
  key: Record<string, string | number>,
  secret: string,
): string {
  const payload: CursorPayload = { v: '1', key };
  const body = toBase64Url(JSON.stringify(payload));
  const sig = sign(body, secret);
  return `${body}.${sig}`;
}

export function decodeCursor(
  cursor: string,
  secret: string,
): Record<string, string | number> | null {
  const [body, sig] = cursor.split('.');

  if (!body || !sig) {
    return null;
  }

  if (sign(body, secret) !== sig) {
    return null;
  }

  let payload: CursorPayload;

  try {
    payload = JSON.parse(fromBase64Url(body));
  } catch {
    return null;
  }

  if (
    payload.v !== '1' ||
    !payload.key ||
    typeof payload.key !== 'object' ||
    Array.isArray(payload.key)
  ) {
    return null;
  }

  return payload.key;
}

/**
 * Helper that emits the Prisma `where` fragment for a 2-column keyset.
 *
 * `(sortValue, id)` is the natural keyset for `(column DESC, id DESC)`. To
 * get the strictly-after page, the row is either strictly less than the
 * sortValue, or equal on sortValue and strictly less on id.
 */
export function twoColumnKeyset(
  column: string,
  direction: 'asc' | 'desc',
  cursor: Record<string, string | number>,
): Record<string, unknown> {
  const sortValue = cursor[column];
  const id = cursor.id;

  if (sortValue === undefined || id === undefined) {
    return {};
  }

  const op = direction === 'desc' ? 'lt' : 'gt';
  const normalised =
    typeof sortValue === 'string' && !Number.isFinite(Number(sortValue))
      ? new Date(sortValue)
      : sortValue;

  return {
    OR: [
      { [column]: { [op]: normalised } },
      {
        AND: [{ [column]: normalised }, { id: { [op]: String(id) } }],
      },
    ],
  };
}
