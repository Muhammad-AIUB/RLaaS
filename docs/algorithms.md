# Algorithms

## Why multiple algorithms exist

There is no single best rate-limiting strategy for every workload.

Real systems trade off:

- fairness
- burst tolerance
- memory usage
- implementation complexity
- operational cost

RLaaS supports four baseline algorithms so teams can pick the behavior that matches their API.

## Comparison table

| Algorithm | Core idea | Strengths | Weaknesses | Best fit |
| --- | --- | --- | --- | --- |
| Fixed Window Counter | Count requests in a time bucket | simplest, low overhead, fast | boundary bursts near window edges | internal tools, simple quotas |
| Sliding Window Log | store request timestamps | most accurate fairness | higher memory usage | strict fairness requirements |
| Sliding Window Counter | estimate from current and previous windows | good balance of fairness and cost | approximate near boundaries | general production APIs |
| Token Bucket | refill tokens over time | supports bursts naturally | slightly more state logic | public APIs with bursty clients |

## 1. Fixed Window Counter

### How it works

- each request increments a Redis key
- the key expires after `windowSeconds`
- if count exceeds `limit`, the request is blocked

### Redis behavior

- `INCR`
- `EXPIRE`
- wrapped in a Lua script for atomicity

### Trade-offs

Pros:

- very cheap
- easy to reason about
- good default for coarse limits

Cons:

- edge burst problem at window boundaries

### Example

Limit:

- 100 requests per minute

Client can send:

- 100 requests at `12:00:59`
- 100 more at `12:01:00`

This is correct for the algorithm but may feel unfair in real traffic.

## 2. Sliding Window Log

### How it works

- store each request as a timestamp in a Redis sorted set
- remove timestamps older than the active window
- count remaining members

### Redis behavior

- `ZADD`
- `ZCARD`
- `ZREMRANGEBYSCORE`
- `PEXPIRE`

### Trade-offs

Pros:

- best fairness
- true rolling-window enforcement

Cons:

- more memory intensive
- more work per request than a simple counter

### Best fit

- sensitive anti-abuse flows
- endpoints where fairness matters more than raw throughput

## 3. Sliding Window Counter

### How it works

- keep current window count
- keep previous window count
- estimate rolling usage with weighted overlap

### Redis behavior

- current window counter
- previous window counter
- weighted estimate in Lua

### Trade-offs

Pros:

- cheaper than a full request log
- fairer than fixed window
- strong general-purpose compromise

Cons:

- approximation, not exact history

### Best fit

- public APIs where cost and fairness both matter

## 4. Token Bucket

### How it works

- bucket starts with `capacity` tokens
- tokens refill continuously over time
- each request consumes one token
- if no token is available, block and return retry estimate

### Redis behavior

- hash for token count and last update time
- Lua for atomic refill plus consume

### Trade-offs

Pros:

- natural burst handling
- intuitive for traffic shaping

Cons:

- slightly more complex state model

### Best fit

- user-facing APIs with bursty client traffic
- mobile or browser workloads

## How RLaaS selects algorithms

Algorithms are chosen per rule.

Each `RateLimitRule` includes:

- `algorithm`
- `limit`
- `windowSeconds`
- optional `burstCapacity`

The gateway resolves the highest-priority matching rule, then dispatches to the corresponding algorithm service.

## Benchmark interpretation

Use the benchmark to discuss tendencies, not absolutes.

Typical patterns:

- Fixed Window is often fastest to explain and cheapest to run
- Sliding Window Log is often the most precise but the most memory-expensive
- Sliding Window Counter is often the best general compromise
- Token Bucket is often the most product-friendly for bursty usage

## Interview explanation

Good senior-level framing:

"I intentionally supported multiple algorithms because rate limiting is a policy problem, not just a counting problem. Different endpoints need different trade-offs. The architecture keeps that decision behind a stable gateway contract so clients don't care which algorithm is active."
