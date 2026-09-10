import { isIP } from 'net';
import {
  ValidationOptions,
  registerDecorator,
  type ValidationArguments,
} from 'class-validator';

/**
 * Rejects webhook destinations the server must never be aimed at.
 *
 * WHY THIS EXISTS
 *
 * WebhooksService#notifyHighBlockedActivity POSTs to a URL the customer
 * supplies, from inside the platform's own network. The field was validated
 * with `IsUrl({ require_tld: false })`, which accepts a great deal more than a
 * webhook endpoint. Measured against the running API, all of these were
 * accepted with 201:
 *
 *   http://169.254.169.254/latest/meta-data/   (AWS instance credentials)
 *   http://metadata.google.internal/...        (GCP metadata)
 *   http://127.0.0.1:6379/                     (the platform's own Redis)
 *   http://10.0.0.5/internal                   (anything on the private net)
 *   not-a-url                                  (no scheme at all)
 *
 * That is server-side request forgery with the project admin as the trigger.
 *
 * WHAT THIS DOES AND DOES NOT COVER
 *
 * This blocks the literal forms. It does NOT resolve DNS, so a hostname that
 * resolves to a private address still passes — defeating that needs the check
 * at connect time (a custom agent that inspects the resolved socket) and is
 * the right follow-up. This closes the direct path, which is the one that
 * takes no effort to exploit.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/** Hostnames that name the local machine or a cloud metadata service. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
  'instance-data',
]);

function isPrivateIpv4(host: string): boolean {
  const octets = host.split('.').map(Number);

  if (octets.length !== 4 || octets.some((part) => Number.isNaN(part))) {
    return false;
  }

  const [a, b] = octets;

  return (
    a === 0 || // this network
    a === 10 || // RFC1918
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // RFC6598 carrier-grade NAT
    (a === 169 && b === 254) || // link-local, incl. the cloud metadata address
    (a === 172 && b >= 16 && b <= 31) || // RFC1918
    (a === 192 && b === 168) || // RFC1918
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast and reserved
  );
}

function isPrivateIpv6(host: string): boolean {
  const address = host.replace(/^\[|\]$/g, '').toLowerCase();

  return (
    address === '::' ||
    address === '::1' || // loopback
    address.startsWith('fe80') || // link-local
    address.startsWith('fc') || // unique local
    address.startsWith('fd') ||
    address.startsWith('::ffff:') // IPv4-mapped, e.g. ::ffff:127.0.0.1
  );
}

export function isSafeWebhookUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.trim() === '') {
    return false;
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    // No scheme, or otherwise unparseable. `not-a-url` lands here.
    return false;
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return false;
  }

  const hostname = url.hostname.toLowerCase();

  if (hostname === '' || BLOCKED_HOSTNAMES.has(hostname)) {
    return false;
  }

  // `.localhost` is reserved for the local machine (RFC 6761).
  if (hostname.endsWith('.localhost')) {
    return false;
  }

  const version = isIP(hostname.replace(/^\[|\]$/g, ''));

  if (version === 4) {
    return !isPrivateIpv4(hostname);
  }

  if (version === 6) {
    return !isPrivateIpv6(hostname);
  }

  // A name, not a literal address. Require a dot so single-label internal
  // names (`redis`, `api`, a Docker service alias) cannot be targeted.
  return hostname.includes('.');
}

export function IsSafeWebhookUrl(options?: ValidationOptions) {
  return function decorate(object: object, propertyName: string): void {
    registerDecorator({
      name: 'isSafeWebhookUrl',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => isSafeWebhookUrl(value),
        defaultMessage: (args?: ValidationArguments) =>
          `${args?.property ?? 'url'} must be an http(s) URL on a public host ` +
          '(loopback, link-local, private and cloud-metadata addresses are not allowed)',
      },
    });
  };
}
