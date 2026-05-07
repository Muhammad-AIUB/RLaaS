import 'dotenv/config';
import express from 'express';
import { createRlaasMiddleware } from '@rlaas/express-sdk';

const app = express();

const port = Number(process.env.PORT ?? 4000);
const gatewayUrl =
  process.env.RLAAS_GATEWAY_URL ?? 'http://localhost:3000/api/v1/gateway/check';
const apiKey =
  process.env.RLAAS_API_KEY ?? 'rlaas_live_demo_seed_key_1234567890';

app.use(express.json());

app.get('/public', (_request, response) => {
  response.json({
    route: 'public',
    message: 'This route is intentionally left unprotected.',
  });
});

const rlaasMiddleware = createRlaasMiddleware({
  apiKey,
  gatewayUrl,
  userTierResolver: (request) => {
    const headerValue = request.header('x-user-tier');
    return headerValue && headerValue.length > 0 ? headerValue : 'free';
  },
});

app.use(['/products', '/orders'], rlaasMiddleware);

app.get('/products', (request, response) => {
  response.json({
    route: 'products',
    message: 'Products payload allowed by RLaaS.',
    userTier: request.header('x-user-tier') ?? 'free',
    items: [
      { id: 'prod_1', name: 'Starter Plan', price: 19 },
      { id: 'prod_2', name: 'Growth Plan', price: 49 },
      { id: 'prod_3', name: 'Enterprise Plan', price: 199 },
    ],
  });
});

app.get('/orders', (request, response) => {
  response.json({
    route: 'orders',
    message: 'Orders payload allowed by RLaaS.',
    userTier: request.header('x-user-tier') ?? 'free',
    items: [
      { id: 'ord_1001', status: 'processing', total: 120.5 },
      { id: 'ord_1002', status: 'shipped', total: 80.25 },
    ],
  });
});

app.listen(port, () => {
  console.log(`Express RLaaS demo listening on http://localhost:${port}`);
  console.log(`Gateway URL: ${gatewayUrl}`);
});
