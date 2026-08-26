const { chromium } = require('playwright');
const path = require('path');

const BASE = 'http://localhost:3001';
const PROJECT_ID = '831788f7-feb8-465d-ab8d-469a1a4aab12';
const OUT = path.join(__dirname);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // Login via API to get session cookie
  await page.goto(`${BASE}/login`);
  await page.waitForTimeout(2000);

  // Intercept and trigger the login API call
  const loginResp = await page.evaluate(async () => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo@rlaas.local', password: 'DemoPass123!' }),
      credentials: 'include'
    });
    return { status: r.status, ok: r.ok };
  });
  console.log('Login API response:', loginResp);
  await page.waitForTimeout(1000);
  console.log('Current URL after login:', page.url());

  // SS1 — Rules
  await page.goto(`${BASE}/projects/${PROJECT_ID}/rules`);
  await page.waitForSelector('h2', { timeout: 10000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/ss1-rules.png`, fullPage: false });
  console.log('SS1 done');

  // SS2 — Analytics
  await page.goto(`${BASE}/projects/${PROJECT_ID}/analytics`);
  await page.waitForSelector('text=TOTAL REQUESTS', { timeout: 10000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/ss2-analytics.png`, fullPage: false });
  console.log('SS2 done');

  // SS3 — Audit logs
  await page.goto(`${BASE}/projects/${PROJECT_ID}/audit-logs`);
  await page.waitForSelector('text=Audit logs', { timeout: 10000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/ss3-audit.png`, fullPage: false });
  console.log('SS3 done');

  // SS4 — Gateway blocked response
  await page.setContent(`<!DOCTYPE html><html><head><style>*{margin:0;padding:0;box-sizing:border-box}</style></head>
  <body style="background:#0f172a;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:60px;font-family:'Courier New',monospace">
  <div style="width:100%;max-width:620px">
    <div style="color:#64748b;font-size:13px;margin-bottom:12px">▶ POST https://rlaas.onrender.com/api/v1/gateway/check</div>
    <div style="background:#1e293b;border-radius:12px;padding:28px;border:1px solid #334155;font-size:15px;line-height:2.2">
      <span style="color:#64748b">{</span><br>
      &nbsp;&nbsp;<span style="color:#7dd3fc">"allowed"</span><span style="color:#64748b">: </span><span style="color:#f87171">false</span><span style="color:#64748b">,</span><br>
      &nbsp;&nbsp;<span style="color:#7dd3fc">"limit"</span><span style="color:#64748b">: </span><span style="color:#fb923c">100</span><span style="color:#64748b">,</span><br>
      &nbsp;&nbsp;<span style="color:#7dd3fc">"remaining"</span><span style="color:#64748b">: </span><span style="color:#fb923c">0</span><span style="color:#64748b">,</span><br>
      &nbsp;&nbsp;<span style="color:#7dd3fc">"retryAfter"</span><span style="color:#64748b">: </span><span style="color:#fb923c">14</span><span style="color:#64748b">,</span><br>
      &nbsp;&nbsp;<span style="color:#7dd3fc">"algorithm"</span><span style="color:#64748b">: </span><span style="color:#86efac">"fixed_window"</span><span style="color:#64748b">,</span><br>
      &nbsp;&nbsp;<span style="color:#7dd3fc">"reason"</span><span style="color:#64748b">: </span><span style="color:#fbbf24">"RATE_LIMIT_EXCEEDED"</span><span style="color:#64748b">,</span><br>
      &nbsp;&nbsp;<span style="color:#7dd3fc">"ruleName"</span><span style="color:#64748b">: </span><span style="color:#86efac">"Default global rule"</span><span style="color:#64748b">,</span><br>
      &nbsp;&nbsp;<span style="color:#7dd3fc">"scope"</span><span style="color:#64748b">: </span><span style="color:#86efac">"GLOBAL"</span><br>
      <span style="color:#64748b">}</span>
    </div>
    <div style="margin-top:16px;background:#450a0a;border:1px solid #ef4444;border-radius:8px;padding:14px 18px;color:#fca5a5;font-size:13px;display:flex;align-items:center;gap:10px">
      <span style="font-size:16px">⛔</span> <strong>429 Too Many Requests</strong> — RATE_LIMIT_EXCEEDED · retry in 14s
    </div>
  </div></body></html>`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/ss4-blocked.png` });
  console.log('SS4 done');

  // SS5 — Webhook payload
  await page.setContent(`<!DOCTYPE html><html><head><style>*{margin:0;padding:0;box-sizing:border-box}</style></head>
  <body style="background:#0f172a;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:60px;font-family:'Courier New',monospace">
  <div style="width:100%;max-width:660px">
    <div style="color:#64748b;font-size:13px;margin-bottom:12px">📬 POST received at webhook.site — x-rlaas-event: HIGH_BLOCKED_ACTIVITY</div>
    <div style="background:#1e293b;border-radius:12px;padding:28px;border:1px solid #334155;font-size:14px;line-height:2.1">
      <span style="color:#64748b">{</span><br>
      &nbsp;&nbsp;<span style="color:#7dd3fc">"event"</span><span style="color:#64748b">: </span><span style="color:#fbbf24">"HIGH_BLOCKED_ACTIVITY"</span><span style="color:#64748b">,</span><br>
      &nbsp;&nbsp;<span style="color:#7dd3fc">"projectId"</span><span style="color:#64748b">: </span><span style="color:#86efac">"ac87222c-a073-41b7-af4b..."</span><span style="color:#64748b">,</span><br>
      &nbsp;&nbsp;<span style="color:#7dd3fc">"blockedRequests"</span><span style="color:#64748b">: </span><span style="color:#fb923c">14</span><span style="color:#64748b">,</span><br>
      &nbsp;&nbsp;<span style="color:#7dd3fc">"threshold"</span><span style="color:#64748b">: </span><span style="color:#fb923c">1</span><span style="color:#64748b">,</span><br>
      &nbsp;&nbsp;<span style="color:#7dd3fc">"windowSeconds"</span><span style="color:#64748b">: </span><span style="color:#fb923c">300</span><span style="color:#64748b">,</span><br>
      &nbsp;&nbsp;<span style="color:#7dd3fc">"triggeredAt"</span><span style="color:#64748b">: </span><span style="color:#86efac">"2026-05-14T12:38:52.804Z"</span><span style="color:#64748b">,</span><br>
      &nbsp;&nbsp;<span style="color:#7dd3fc">"sample"</span><span style="color:#64748b">: {</span><br>
      &nbsp;&nbsp;&nbsp;&nbsp;<span style="color:#7dd3fc">"endpoint"</span><span style="color:#64748b">: </span><span style="color:#86efac">"/api/products"</span><span style="color:#64748b">,</span><br>
      &nbsp;&nbsp;&nbsp;&nbsp;<span style="color:#7dd3fc">"ruleName"</span><span style="color:#64748b">: </span><span style="color:#86efac">"Default global rule"</span><span style="color:#64748b">,</span><br>
      &nbsp;&nbsp;&nbsp;&nbsp;<span style="color:#7dd3fc">"ipAddress"</span><span style="color:#64748b">: </span><span style="color:#86efac">"1.2.3.4"</span><br>
      &nbsp;&nbsp;<span style="color:#64748b">}</span><br>
      <span style="color:#64748b">}</span>
    </div>
    <div style="margin-top:16px;background:#052e16;border:1px solid #16a34a;border-radius:8px;padding:14px 18px;color:#86efac;font-size:13px;display:flex;align-items:center;gap:10px">
      <span style="font-size:16px">✅</span> Webhook fired automatically — no code change needed
    </div>
  </div></body></html>`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/ss5-webhook.png` });
  console.log('SS5 done');

  await browser.close();
  console.log('All screenshots saved to E:\\rlaas-platform\\screenshots\\');
})();
