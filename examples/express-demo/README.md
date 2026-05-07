# Express Demo

This example shows a real Express API protected by `@rlaas/express-sdk`.

## Routes

- `GET /public`
- `GET /products`
- `GET /orders`

`/products` and `/orders` are protected by RLaaS middleware. If the gateway blocks a request, the demo returns HTTP `429`.

## Setup

1. Start the RLaaS backend and make sure the seeded API key exists.
2. Copy the env file:

```bash
copy .env.example .env
```

3. Start the demo:

```bash
pnpm --filter @rlaas/express-demo dev
```

## Test

Public route:

```bash
curl http://localhost:4000/public
```

Protected route:

```bash
curl http://localhost:4000/products -H "x-user-tier: free"
```

Orders route:

```bash
curl http://localhost:4000/orders -H "x-user-tier: pro"
```

If RLaaS blocks the request, you will receive a `429` response with rate-limit metadata.
