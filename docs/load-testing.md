# Load Testing

## Goal

Validate that the RLaaS gateway can handle concurrent protection checks with predictable latency while returning the correct allow/block behavior.

## Script

The main script is:

`tests/load/gateway-check.k6.js`

It targets:

- `POST /api/v1/gateway/check`

It includes two scenarios:

1. `allowed_requests`
   Uses a non-blocked IP and `pro` tier against `/api/orders`.

2. `blocked_requests`
   Uses the seeded abusive IP `203.0.113.10` and `free` tier against `/api/products`.

## Prerequisites

1. Start the platform:

```bash
docker compose up --build
```

2. Ensure seed data exists:

```bash
pnpm --filter @rlaas/api db:seed
```

3. Install `k6`:

Windows with Chocolatey:

```bash
choco install k6
```

macOS with Homebrew:

```bash
brew install k6
```

Linux:

Follow the official installation guide:
https://grafana.com/docs/k6/latest/set-up/install-k6/

## Run

Default run:

```bash
pnpm loadtest:gateway
```

Override the gateway URL or API key:

```bash
$env:K6_GATEWAY_URL="http://localhost:3000/api/v1/gateway/check"
$env:K6_API_KEY="rlaas_live_demo_seed_key_1234567890"
k6 run tests/load/gateway-check.k6.js
```

## Output

The script writes:

- a readable console summary
- a JSON summary file at `tests/results/gateway-check-summary.json`

## What to watch

- `http_req_duration`
- `gateway_check_latency_ms`
- `http_req_failed`
- `gateway_allowed_rate`
- `gateway_blocked_rate`

## Expected behavior

- Allowed traffic should mostly return `allowed: true`
- Blocked traffic should mostly return `allowed: false` with `RATE_LIMIT_EXCEEDED`
- p95 should remain stable under moderate concurrent load
