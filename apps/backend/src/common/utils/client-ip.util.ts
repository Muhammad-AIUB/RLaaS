/**
 * Resolves the client IP from a request, without trusting the client.
 *
 * WHY THIS EXISTS
 *
 * The old code read `x-forwarded-for` and took `split(',')[0]` — the LEFTMOST
 * entry — before ever consulting the socket address. That entry is written by
 * whoever sent the request. Every common proxy (nginx
 * `$proxy_add_x_forwarded_for`, AWS ALB, Render) APPENDS its view of the peer,
 * so an attacker-supplied value stays at the head of the list and wins.
 *
 * That made two things caller-controlled that must not be:
 *
 *  - the IP a rate-limit rule matches on, so `scope: IP` limited nothing and an
 *    IP rule granting a partner address a high limit was claimable by anyone
 *    who typed that address into a header;
 *  - the `ipAddress` written to audit logs, so the record of who did what came
 *    from the person doing it.
 *
 * THE RULE
 *
 * Count from the RIGHT. The rightmost entry was written by the proxy nearest
 * this server and is the only one it can vouch for. With N trusted hops in
 * front, the client is the (N+1)-th entry from the right; everything further
 * left was supplied by someone upstream of our trust boundary.
 *
 * The default is 0 hops: trust nothing, use the socket address. A deployment
 * that is genuinely behind a proxy sets TRUSTED_PROXY_HOPS (Render is 1).
 * Getting it wrong in the safe direction collapses many clients onto the
 * proxy's address and over-limits them; getting it wrong in the other
 * direction hands every client a limit bypass. Over-limiting is the failure
 * we choose.
 */

export const TRUSTED_PROXY_HOPS_ENV = 'TRUSTED_PROXY_HOPS';

/** Reads the configured hop count. Anything unparseable or negative means 0. */
export function trustedProxyHops(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const parsed = Number(env[TRUSTED_PROXY_HOPS_ENV]);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.floor(parsed);
}

function forwardedChain(header: string | string[] | undefined): string[] {
  if (header === undefined) {
    return [];
  }

  // Node collapses repeated headers into an array; a single header may still
  // carry a comma-separated list. Both flatten to the same ordered chain.
  const raw = Array.isArray(header) ? header.join(',') : header;

  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * @param socketIp  the peer address of the TCP connection (never spoofable)
 * @param header    the raw `x-forwarded-for` header value
 * @param hops      how many proxies sit in front of this server
 */
export function resolveClientIp(
  socketIp: string | undefined,
  header: string | string[] | undefined,
  hops: number = trustedProxyHops(),
): string {
  const fallback = socketIp ?? 'unknown';

  if (hops <= 0) {
    return fallback;
  }

  const chain = forwardedChain(header);

  // Fewer entries than trusted hops means the header is shorter than the
  // deployment claims — a misconfiguration, or a request that did not come
  // through the expected path. Fall back rather than pick an attacker entry.
  if (chain.length < hops) {
    return fallback;
  }

  return chain[chain.length - hops] ?? fallback;
}
