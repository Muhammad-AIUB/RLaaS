/**
 * Fail-fast environment validation, run by ConfigModule at boot.
 *
 * These two variables used to have the fallback `'change-me'` baked into three
 * call sites. A deployment that forgot to set them did not fail — it came up and
 * signed JWTs, and peppered API-key hashes, with a value published in this
 * repository. Anyone could then mint a token for any user id.
 *
 * Refusing to start is the only safe behaviour: there is no correct value this
 * process can pick on its own.
 */
const REQUIRED_SECRETS = ['JWT_SECRET', 'API_KEY_HASH_PEPPER'] as const;

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const missing = REQUIRED_SECRETS.filter(
    (name) => String(config[name] ?? '').trim() === '',
  );

  if (missing.length > 0) {
    throw new Error(
      [
        `Refusing to start: ${missing.join(', ')} ${
          missing.length === 1 ? 'is' : 'are'
        } not set.`,
        '',
        'There is no default. JWT_SECRET signs and verifies every access token;',
        'API_KEY_HASH_PEPPER is the HMAC pepper for stored API key hashes, so',
        'changing it invalidates every existing key.',
        '',
        'Set them in the environment (Render dashboard in production, .env',
        'locally — see .env.example).',
        '',
        'MIGRATION WARNING for API_KEY_HASH_PEPPER: until now an unset pepper',
        'silently fell back to JWT_SECRET, so existing API key hashes were',
        'peppered with JWT_SECRET. If that is your situation, set',
        'API_KEY_HASH_PEPPER to the SAME value as JWT_SECRET. Any other value',
        'changes the HMAC and every stored key stops matching.',
      ].join('\n'),
    );
  }

  return config;
}
