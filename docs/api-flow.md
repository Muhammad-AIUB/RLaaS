# API Flow

## High-level request flow

The core RLaaS runtime path is:

```text
Incoming API request
        |
        v
Application middleware / SDK
        |
        v
POST /api/v1/gateway/check
        |
        v
Resolve API key -> project
        |
        v
Find matching rule by precedence + priority
        |
        v
Execute selected algorithm against Redis
        |
        |-- allowed -> return allow response
        `-- blocked -> return block response
        |
        v
Persist request log in PostgreSQL
```

## Detailed gateway sequence

### 1. Client app calls RLaaS

The SDK or integrating app sends:

```json
{
  "apiKey": "project_api_key",
  "ip": "203.0.113.10",
  "endpoint": "/api/products",
  "method": "GET",
  "userTier": "free"
}
```

### 2. API key is resolved

The backend:

- hashes the incoming raw key
- looks up the matching `ApiKey`
- loads the owning `Project`
- rejects invalid, revoked, or expired keys early

### 3. Matching rule is selected

The backend loads active `RateLimitRule` records for the project and resolves them using:

1. IP
2. API key
3. User tier
4. Endpoint
5. Global

Then it picks the lowest numeric priority inside the matched scope.

### 4. Redis-backed algorithm runs

The selected algorithm evaluates the request in Redis and returns:

- `allowed`
- `limit`
- `remaining`
- `retryAfter`
- `algorithm`

### 5. Response is returned

Allowed example:

```json
{
  "allowed": true,
  "limit": 100,
  "remaining": 88,
  "retryAfter": 0,
  "algorithm": "fixed_window"
}
```

Blocked example:

```json
{
  "allowed": false,
  "reason": "RATE_LIMIT_EXCEEDED",
  "limit": 100,
  "remaining": 0,
  "retryAfter": 32,
  "algorithm": "fixed_window"
}
```

### 6. Request log is persisted

Each gateway decision is written to `RequestLog` so the system can answer:

- who is being blocked
- which endpoints are hottest
- which algorithm was used
- what retry windows users saw

## Control-plane flow

The operator flow is different from the runtime path:

```text
Dashboard
   |
   v
Auth / Projects / Keys / Rules / Analytics endpoints
   |
   v
PostgreSQL via Prisma
```

The dashboard does not call Redis directly. It reads durable state and analytics views from the backend.

## Database role in the flow

PostgreSQL stores:

- users
- projects
- API keys
- rules
- request logs
- analytics snapshots

Redis stores:

- transient counters
- sorted set events
- token bucket state

This is a deliberate split:

- PostgreSQL for truth and reporting
- Redis for speed and atomic enforcement

## SDK flow

For the Express demo or any Express app:

```text
Incoming Express request
   |
   v
createRlaasMiddleware
   |
   |-- extracts ip
   |-- extracts endpoint
   |-- extracts method
   `-- resolves user tier
   |
   v
POST /api/v1/gateway/check
   |
   |-- allowed -> next()
   `-- blocked -> 429 JSON
```

## Failure behavior

If the gateway itself is unavailable:

- the SDK returns `503`
- the response error is `RLAAS_UNAVAILABLE`

In a production discussion, this is a good place to talk about:

- fail-open versus fail-closed
- cache fallback policies
- circuit breakers
- degraded-mode operation

## Interview explanation

A concise way to explain the flow:

"The runtime path is intentionally short: key lookup, rule resolution, Redis check, log persistence, response. The slower, richer management tasks stay in the control-plane path so the gateway stays focused on fast decisions."
