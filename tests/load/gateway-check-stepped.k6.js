import http from 'k6/http';
import exec from 'k6/execution';
import { Counter, Trend } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

/**
 * Stepped load profile for POST /api/v1/gateway/check.
 *
 * Differences from gateway-check.k6.js, all deliberate:
 *  - accepts 201 (the API returns 201 for POST; the older script asserts 200,
 *    which is why its check pass-rate reads 16% while http_req_failed is 0%)
 *  - closed-loop, no sleep, so "N VUs" means N concurrent in-flight requests
 *  - one constant-vus scenario per step, so each load level gets its own
 *    percentile bucket instead of being averaged across the ramp
 *  - allow-path and block-path latencies are bucketed separately, because the
 *    active rule flips from allowing to blocking part-way through a run
 *  - reads the Server-Timing response header when present, to split server-side
 *    Redis / Postgres time out of the client-observed total
 */

const STEPS = [10, 25, 50, 100];
const STEP_SECONDS = Number(__ENV.K6_STEP_SECONDS || 60);
const GAP_SECONDS = 5;

const gatewayUrl =
  __ENV.K6_GATEWAY_URL || 'http://localhost:3000/api/v1/gateway/check';
const apiKey = __ENV.K6_API_KEY;
const ip = __ENV.K6_IP || '198.51.100.10';
const endpoint = __ENV.K6_ENDPOINT || '/api/orders';
const method = __ENV.K6_METHOD || 'GET';
const userTier = __ENV.K6_USER_TIER || 'pro';

if (!apiKey) {
  throw new Error('K6_API_KEY is required.');
}

const latByStep = {};
for (const vus of STEPS) {
  latByStep[`step_${vus}`] = new Trend(`lat_step_${vus}`, true);
}

const latAllowed = new Trend('lat_allowed', true);
const latBlocked = new Trend('lat_blocked', true);

const srvTotal = new Trend('srv_total_ms', true);
const srvRedis = new Trend('srv_redis_ms', true);
const srvRules = new Trend('srv_rules_ms', true);
const srvApiKey = new Trend('srv_apikey_ms', true);

const allowedCount = new Counter('verdict_allowed');
const blockedCount = new Counter('verdict_blocked');
const unexpectedCount = new Counter('unexpected_response');
const serverTimingSeen = new Counter('server_timing_seen');

const scenarios = {};
STEPS.forEach((vus, index) => {
  scenarios[`step_${vus}`] = {
    executor: 'constant-vus',
    exec: 'checkScenario',
    vus,
    duration: `${STEP_SECONDS}s`,
    startTime: `${index * (STEP_SECONDS + GAP_SECONDS)}s`,
    tags: { step: String(vus) },
  };
});

export const options = {
  scenarios,
  // No thresholds: this run measures, it does not gate.
  summaryTrendStats: ['min', 'avg', 'med', 'p(50)', 'p(95)', 'p(99)', 'max'],
};

function readServerTiming(response) {
  const headers = response.headers || {};
  const name = Object.keys(headers).find(
    (key) => key.toLowerCase() === 'server-timing',
  );

  if (!name) {
    return null;
  }

  const parsed = {};
  for (const part of headers[name].split(',')) {
    const match = part.trim().match(/^([a-zA-Z0-9_-]+);dur=([0-9.]+)/);
    if (match) {
      parsed[match[1]] = Number(match[2]);
    }
  }

  return parsed;
}

export function checkScenario() {
  const stepName = exec.scenario.name;

  const response = http.post(
    gatewayUrl,
    JSON.stringify({ apiKey, ip, endpoint, method, userTier }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { step: stepName },
    },
  );

  const duration = response.timings.duration;
  const trend = latByStep[stepName];
  if (trend) {
    trend.add(duration);
  }

  // 201 is the real success status for this endpoint. 200 accepted so the
  // script keeps working if that is ever corrected.
  const ok = response.status === 201 || response.status === 200;
  let verdict = null;

  if (ok) {
    try {
      verdict = response.json('allowed');
    } catch (error) {
      verdict = null;
    }
  }

  if (verdict === true) {
    allowedCount.add(1);
    latAllowed.add(duration);
  } else if (verdict === false) {
    blockedCount.add(1);
    latBlocked.add(duration);
  } else {
    unexpectedCount.add(1);
  }

  const timing = readServerTiming(response);
  if (timing) {
    serverTimingSeen.add(1);
    if (timing.total !== undefined) srvTotal.add(timing.total);
    if (timing.redis !== undefined) srvRedis.add(timing.redis);
    if (timing.rules !== undefined) srvRules.add(timing.rules);
    if (timing.apikey !== undefined) srvApiKey.add(timing.apikey);
  }
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    'tests/results/gateway-check-stepped-summary.json': JSON.stringify(
      data,
      null,
      2,
    ),
  };
}
