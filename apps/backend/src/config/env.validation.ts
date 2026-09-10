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

/**
 * Values that were committed to this public repository and are therefore
 * permanently readable in git history. They are facts about the past, so this
 * list is closed: it never grows, and nothing here is a secret any more.
 *
 * `demo@rlaas.local` / `DemoPass123!` and the API key below were in
 * render.yaml and the README between 2026-05-07 and 2026-08-27 (removed in
 * 487449f). Anyone who clones the repo can read them with one `git show`.
 *
 * prisma/seed.js keeps its own copy of these two strings and REFUSES to run
 * with them, because that is the path that would put them back into a
 * database. Keep the two lists in step if this one ever changes.
 */
const BURNED_VALUES: ReadonlyArray<{ env: string; value: string }> = [
  { env: 'SEED_DEMO_PASSWORD', value: 'DemoPass123!' },
  { env: 'SEED_RAW_API_KEY', value: 'rlaas_live_demo_seed_key_1234567890' },
];

/**
 * Warns, rather than refusing to start.
 *
 * Refusing would be the consistent choice with the required-secret check
 * above, but these two variables are only read by the seed, and the seed no
 * longer runs at boot (see render.yaml). A value left in the environment is
 * inert, and taking a running deployment down over an inert variable is a
 * worse outcome than the one being prevented. The seed itself hard-fails.
 */
function warnAboutBurnedValues(config: Record<string, unknown>): void {
  const present = BURNED_VALUES.filter(
    ({ env, value }) => String(config[env] ?? '') === value,
  );

  if (present.length === 0) {
    return;
  }

  // eslint-disable-next-line no-console -- runs before the Nest logger exists
  console.warn(
    [
      '',
      '='.repeat(72),
      'SECURITY: this environment still holds credentials that are public.',
      '',
      ...present.map(
        ({ env }) => `  ${env} is set to a value committed to this repository.`,
      ),
      '',
      'They were in git history between 2026-05-07 and 2026-08-27 and remain',
      'readable there forever. Anyone who clones the repo has them.',
      '',
      'Rotate or unset them where they are configured (the Render dashboard,',
      'Environment tab). The seed skips the demo user without',
      'SEED_DEMO_PASSWORD and skips the demo API key without SEED_RAW_API_KEY,',
      'so unsetting is safe. If a demo account was already created with these,',
      'change its password or delete it — unsetting does not undo the past.',
      '='.repeat(72),
      '',
    ].join('\n'),
  );
}

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

  warnAboutBurnedValues(config);

  return config;
}
