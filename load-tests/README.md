# Load Tests

This folder contains `k6` load tests for RLaaS gateway behavior.

Current script:

- `gateway-check.k6.js` for `POST /api/gateway/check`

It simulates:

- allowed traffic using a normal IP and `pro` tier
- blocked traffic using the seeded abusive IP rule
