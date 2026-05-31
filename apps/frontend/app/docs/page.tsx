import Link from 'next/link';
import { LogoMark } from '@/components/icons';

export const metadata = { title: 'Quick Start — RLaaS' };

const steps = [
  {
    number: '01',
    title: 'Sign in',
    description: 'Use the demo credentials below — no sign-up needed.',
    action: { label: 'Go to login →', href: '/login' },
  },
  {
    number: '02',
    title: 'Open "Demo API Project"',
    description: 'A pre-seeded project is ready. Click it from the Projects page.',
    action: { label: 'Go to projects →', href: '/projects' },
  },
  {
    number: '03',
    title: 'Explore Rate Limit Rules',
    description: 'See 4 active rules — Global, Auth endpoint, Free-tier cap, and IP shield. Toggle, edit, or create new ones.',
    action: null,
  },
  {
    number: '04',
    title: 'Check Analytics',
    description: 'Live charts show allowed vs blocked requests, top IPs, top endpoints, and algorithm throughput.',
    action: null,
  },
  {
    number: '05',
    title: 'Issue an API Key',
    description: 'Go to API Keys → Generate key. Copy and use it to authenticate gateway requests.',
    action: null,
  },
];

const features = [
  { label: 'Fixed Window', tag: 'Algorithm' },
  { label: 'Sliding Window Counter', tag: 'Algorithm' },
  { label: 'Token Bucket', tag: 'Algorithm' },
  { label: 'Leaky Bucket', tag: 'Algorithm' },
  { label: 'Global scope', tag: 'Rule' },
  { label: 'Endpoint scope', tag: 'Rule' },
  { label: 'IP scope', tag: 'Rule' },
  { label: 'User-tier scope', tag: 'Rule' },
  { label: 'Per-project RBAC', tag: 'Access' },
  { label: 'Audit log trail', tag: 'Access' },
  { label: 'Redis-backed counters', tag: 'Infra' },
  { label: 'Webhook events', tag: 'Infra' },
];

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-canvas px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl">

        {/* Header */}
        <div className="mb-10 flex items-center gap-3">
          <LogoMark className="h-9 w-9" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">RLaaS — Quick Start</h1>
            <p className="text-sm text-slate-500">Rate Limiting as a Service · 2-minute tour</p>
          </div>
        </div>

        {/* Gateway Tester callout */}
        <Link
          href="/gateway-tester"
          className="mb-6 flex items-center justify-between rounded-xl border-2 border-brand-200 bg-brand-50 px-5 py-4 transition-colors hover:border-brand-300 hover:bg-brand-100"
        >
          <div>
            <p className="font-semibold text-brand-800">🧪 Live Gateway Tester — no login required</p>
            <p className="mt-0.5 text-sm text-brand-600">
              Click &ldquo;Send Request&rdquo; and watch rate limiting enforce in real time. Try all 4 algorithms.
            </p>
          </div>
          <span className="ml-4 shrink-0 font-medium text-brand-700">Try it →</span>
        </Link>

        {/* What is this */}
        <div className="card mb-6 p-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">What is RLaaS?</p>
          <p className="mt-2 text-slate-700 leading-relaxed">
            A full-stack <strong>rate-limiting control plane</strong> — like AWS API Gateway or Kong's rate limiter,
            but built from scratch. Operators configure rules, issue API keys, and monitor live traffic through
            this console. Client services integrate via a lightweight SDK.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="badge-brand">NestJS</span>
            <span className="badge-brand">Next.js 15</span>
            <span className="badge-brand">PostgreSQL (Neon)</span>
            <span className="badge-brand">Redis (Upstash)</span>
            <span className="badge-brand">Prisma ORM</span>
            <span className="badge-brand">JWT Auth</span>
          </div>
        </div>

        {/* Demo credentials */}
        <div className="mb-6 rounded-xl border-2 border-brand-300 bg-brand-50 p-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">Demo Credentials</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-slate-500 mb-1">Email</p>
              <code className="block rounded-md bg-white px-3 py-2 text-sm font-mono text-slate-800 shadow-sm border border-slate-200">
                demo@rlaas.local
              </code>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Password</p>
              <code className="block rounded-md bg-white px-3 py-2 text-sm font-mono text-slate-800 shadow-sm border border-slate-200">
                DemoPass123!
              </code>
            </div>
          </div>
          <div className="mt-4">
            <Link href="/login" className="btn-primary inline-flex">
              Sign in now →
            </Link>
          </div>
        </div>

        {/* Steps */}
        <div className="card mb-6 p-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-600 mb-5">5-Step Tour</p>
          <ol className="space-y-5">
            {steps.map((step) => (
              <li key={step.number} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                  {step.number}
                </span>
                <div>
                  <p className="font-semibold text-slate-900">{step.title}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{step.description}</p>
                  {step.action && (
                    <Link href={step.action.href} className="mt-1 inline-block text-sm font-medium text-brand-700 hover:text-brand-800">
                      {step.action.label}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Features grid */}
        <div className="card mb-6 p-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-600 mb-4">What's Built</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {features.map((f) => (
              <div key={f.label} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-xs text-slate-400 w-14 shrink-0">{f.tag}</span>
                <span className="text-sm font-medium text-slate-700">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer links */}
        <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-slate-500">
          <a
            href="https://www.mjubayer.dev/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-slate-700 hover:text-brand-700"
          >
            Built by Muhammad Jubayer ↗
          </a>
          <div className="flex gap-4">
            <Link href="/login" className="font-medium text-brand-700 hover:text-brand-800">Sign in</Link>
            <a
              href="https://github.com/Muhammad-AIUB/RLaaS"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand-700 hover:text-brand-800"
            >
              GitHub →
            </a>
          </div>
        </div>

      </div>
    </main>
  );
}
