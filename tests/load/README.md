# Load Tests

This folder contains `k6` load tests for RLaaS gateway behavior.

Current script:

- `gateway-check.k6.js` for `POST /api/v1/gateway/check`

It simulates:

- allowed traffic using a normal IP and `pro` tier
- blocked traffic using a separately configured rule that matches the blocked payload
