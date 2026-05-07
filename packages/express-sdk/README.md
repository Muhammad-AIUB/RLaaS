# @rlaas/express-sdk

Express middleware for forwarding request metadata to the RLaaS gateway.

```ts
import express from 'express';
import { createRlaasMiddleware } from '@rlaas/express-sdk';

const app = express();

app.use(
  createRlaasMiddleware({
    apiKey: 'project_api_key',
    gatewayUrl: 'http://localhost:3000/api/v1/gateway/check',
    userTierResolver: (req) => req.user?.tier ?? 'free',
  }),
);
```
