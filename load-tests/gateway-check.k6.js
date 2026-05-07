import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

const gatewayLatency = new Trend('gateway_check_latency_ms');
const allowedRate = new Rate('gateway_allowed_rate');
const blockedRate = new Rate('gateway_blocked_rate');
const allowedCount = new Counter('gateway_allowed_count');
const blockedCount = new Counter('gateway_blocked_count');

const gatewayUrl =
  __ENV.K6_GATEWAY_URL || 'http://localhost:3000/api/gateway/check';
const apiKey =
  __ENV.K6_API_KEY || 'rlaas_live_demo_seed_key_1234567890';

export const options = {
  scenarios: {
    allowed_requests: {
      executor: 'ramping-vus',
      exec: 'allowedScenario',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 15 },
        { duration: '30s', target: 40 },
        { duration: '15s', target: 0 },
      ],
      gracefulRampDown: '5s',
      tags: { scenario_type: 'allowed' },
    },
    blocked_requests: {
      executor: 'ramping-vus',
      exec: 'blockedScenario',
      startTime: '5s',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 10 },
        { duration: '30s', target: 25 },
        { duration: '15s', target: 0 },
      ],
      gracefulRampDown: '5s',
      tags: { scenario_type: 'blocked' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<250', 'p(99)<500'],
    gateway_check_latency_ms: ['p(95)<250'],
    gateway_allowed_rate: ['rate>0.95'],
    gateway_blocked_rate: ['rate>0.95'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

function gatewayCheck(payload) {
  const response = http.post(gatewayUrl, JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: {
      endpoint: payload.endpoint,
      method: payload.method,
    },
  });

  gatewayLatency.add(response.timings.duration);

  return response;
}

export function allowedScenario() {
  const response = gatewayCheck({
    apiKey,
    ip: `198.51.100.${(__VU % 50) + 10}`,
    endpoint: '/api/orders',
    method: 'GET',
    userTier: 'pro',
  });

  const isAllowed =
    check(response, {
      'allowed scenario returns 200': (res) => res.status === 200,
      'allowed scenario response.allowed=true': (res) =>
        res.json('allowed') === true,
    }) && response.json('allowed') === true;

  allowedRate.add(isAllowed);
  if (isAllowed) {
    allowedCount.add(1);
  }

  sleep(0.2);
}

export function blockedScenario() {
  const response = gatewayCheck({
    apiKey,
    ip: '203.0.113.10',
    endpoint: '/api/products',
    method: 'GET',
    userTier: 'free',
  });

  const isBlocked =
    check(response, {
      'blocked scenario returns 200': (res) => res.status === 200,
      'blocked scenario response.allowed=false': (res) =>
        res.json('allowed') === false,
      'blocked scenario reason matches': (res) =>
        res.json('reason') === 'RATE_LIMIT_EXCEEDED',
    }) && response.json('allowed') === false;

  blockedRate.add(isBlocked);
  if (isBlocked) {
    blockedCount.add(1);
  }

  sleep(0.25);
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, {
      indent: ' ',
      enableColors: true,
    }),
    'load-tests/results/gateway-check-summary.json': JSON.stringify(data, null, 2),
  };
}
