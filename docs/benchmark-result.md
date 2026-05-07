# Benchmark Result

## Purpose

This document captures benchmark guidance and a sample comparison for RLaaS rate-limiting algorithms.

## Measured dimensions

- average latency
- p95 latency
- p99 latency
- approximate memory behavior
- allowed requests
- blocked requests

## Benchmark command

```bash
pnpm benchmark:algorithms
```

The benchmark script is:

- `benchmarks/algorithm-benchmark.ts`

It uses Redis-backed algorithm services directly and prints a console table for quick comparison.

## Benchmark result

Latest verified local benchmark run date:

- `2026-05-07`

| Algorithm | Avg Latency (ms) | p95 (ms) | p99 (ms) | Memory Delta (KB) | Allowed | Blocked |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Fixed Window Counter | 0.338 | 0.469 | 0.784 | 3359.33 | 160 | 340 |
| Sliding Window Log | 0.347 | 0.399 | 0.553 | 3439.64 | 160 | 340 |
| Sliding Window Counter | 0.263 | 0.335 | 0.513 | -3878.68 | 160 | 340 |
| Token Bucket | 0.280 | 0.342 | 0.478 | 2841.50 | 192 | 308 |

Notes:

- these numbers were produced by the current local benchmark runner in this repository
- memory delta is a rough process-heap signal, not a precise Redis memory measurement
- exact values will vary by machine, Redis state, and background load

## Interpretation

- Fixed Window Counter is typically the simplest and lowest-overhead approach.
- Sliding Window Log offers tighter fairness but often uses more Redis memory because it stores request events.
- Sliding Window Counter is a strong compromise between fairness and cost.
- Token Bucket is often the most intuitive choice for burst-friendly APIs.

## Interview explanation

Use this benchmark to explain trade-offs rather than claiming a single universal winner:

- fairness versus implementation cost
- burst tolerance versus strictness
- memory footprint versus accuracy
- latency profile under load
