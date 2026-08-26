/**
 * Jest `globalSetup`: refuses to run the suite unless a real Redis is
 * reachable AND the target database index is empty.
 *
 * The suite flushes its Redis database between tests. That is only safe on an
 * index we know we own, so this check is deliberately strict: if there is
 * anything at all in the target index, we stop and explain instead of
 * deleting a stranger's keys.
 */

import Redis from 'ioredis';

const RUN = 'npx jest --config ./test/jest-characterization.json';

export default async function globalSetup(): Promise<void> {
  const url =
    process.env.CHARACTERIZATION_REDIS_URL ?? 'redis://127.0.0.1:6379/15';

  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
  });

  try {
    await client.connect();
  } catch (error) {
    await client.quit().catch(() => undefined);
    throw new Error(
      [
        '',
        `Cannot reach Redis at ${url}.`,
        '',
        'This suite deliberately does NOT mock Redis — TTL and atomicity are',
        'the behaviours being characterized, and a mock cannot record them.',
        '',
        'Start a Redis (either works):',
        '  docker run --rm -p 6379:6379 redis:7-alpine',
        '  redis-server',
        '',
        'Or point the suite at another database (an Upstash test instance, say):',
        `  CHARACTERIZATION_REDIS_URL=rediss://<user>:<pass>@<host>:<port> ${RUN}`,
        '',
        `Underlying error: ${(error as Error).message}`,
      ].join('\n'),
    );
  }

  const size = await client.dbsize();

  if (size > 0 && process.env.CHARACTERIZATION_ALLOW_DIRTY !== '1') {
    await client.quit().catch(() => undefined);
    throw new Error(
      [
        '',
        `Redis database at ${url} is not empty (${size} keys).`,
        '',
        'The suite flushes this database between tests, so it only runs',
        'against an index it knows is disposable.',
        '',
        'Either point it at an empty database:',
        `  CHARACTERIZATION_REDIS_URL=redis://127.0.0.1:6379/14 ${RUN}`,
        '',
        'or, if these keys really are disposable, opt in explicitly:',
        `  CHARACTERIZATION_ALLOW_DIRTY=1 ${RUN}`,
      ].join('\n'),
    );
  }

  await client.quit();
}
