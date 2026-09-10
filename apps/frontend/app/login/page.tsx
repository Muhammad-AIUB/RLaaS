'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { ErrorState } from '@/components/feedback';
import { EyeIcon, EyeOffIcon, LogoMark } from '@/components/icons';

const DEMO_EMAIL = 'demo@rlaas.local';
const DEMO_PASSWORD = 'DemoPass123!';

/**
 * A static trace of one request through the rule chain.
 *
 * The panel used to hold three tiles reading "4 Algorithms", "5 Rule scopes",
 * "RBAC / Per project" — the big-number template, where one of the numbers was
 * an acronym. This shows the product's actual mechanism instead: a request
 * arrives, the gateway walks the chain in order, the first matching rule
 * decides. Everything below is a fixed illustration, not live data.
 */
const TRACE_STEPS = [
  { scope: 'IP address', budget: '200 / 10s', matched: false },
  { scope: 'User tier', budget: '100 / 1h', matched: false },
  { scope: 'Endpoint', budget: '10 / 1m', matched: true },
];

function DecisionTrace() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] font-mono text-xs">
      <div className="flex items-baseline justify-between gap-3 border-b border-white/10 px-4 py-3">
        <span className="text-slate-200">GET /api/orders</span>
        <span className="text-slate-500">198.51.100.10</span>
      </div>

      <ol className="px-4 py-1">
        {TRACE_STEPS.map((step, index) => (
          <li
            key={step.scope}
            className="flex items-center gap-3 py-1.5 text-[0.6875rem]"
          >
            <span className="w-3 shrink-0 text-slate-600">{index + 1}</span>
            <span
              className={step.matched ? 'flex-1 text-slate-200' : 'flex-1 text-slate-500'}
            >
              {step.scope}
            </span>
            <span
              className={step.matched ? 'shrink-0 text-slate-300' : 'shrink-0 text-slate-600'}
            >
              {step.budget}
            </span>
            <span className="w-10 shrink-0 text-right text-slate-500">
              {step.matched ? 'match' : 'skip'}
            </span>
          </li>
        ))}
      </ol>

      <div className="flex items-baseline justify-between gap-3 border-t border-white/10 px-4 py-3">
        <span className="font-semibold uppercase tracking-wide text-red-400">
          Blocked
        </span>
        <span className="text-slate-500">retry after 41s</span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  // Which sign-in is running, not merely that one is. Both buttons share this
  // state, so a plain boolean made them both read "Signing in…" and the person
  // who pressed one could not tell which had been accepted.
  const [pending, setPending] = useState<'credentials' | 'demo' | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [slowWarning, setSlowWarning] = useState(false);

  useEffect(() => {
    // Pre-warm the backend so it's ready when the user submits.
    fetch('/api/ping').catch(() => {});
  }, []);

  async function submitCredentials(
    email: string,
    password: string,
    action: 'credentials' | 'demo',
  ) {
    setError('');
    setPending(action);
    setSlowWarning(false);
    const slowTimer = setTimeout(() => setSlowWarning(true), 5000);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.message ?? payload?.error?.message ?? 'Login failed',
        );
      }

      router.push('/dashboard');
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Login failed',
      );
    } finally {
      clearTimeout(slowTimer);
      setPending(null);
      setSlowWarning(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await submitCredentials(
      formData.get('email') as string,
      formData.get('password') as string,
      'credentials',
    );
  }

  async function handleGuestLogin() {
    await submitCredentials(DEMO_EMAIL, DEMO_PASSWORD, 'demo');
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel — desktop only. Flat ink, no halo: a radial glow behind a
          headline is decoration pretending to be depth. */}
      <section className="relative hidden flex-col justify-between bg-ink p-10 text-white lg:flex xl:p-14">
        <div className="flex items-center gap-2.5">
          <LogoMark className="h-8 w-8" />
          <span className="text-sm font-semibold tracking-tight">
            RLaaS Platform
          </span>
        </div>

        <div className="max-w-md">
          <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Operator console
          </p>
          <h1 className="mt-4 text-[2.5rem] font-semibold leading-[1.08] tracking-tight text-white">
            Protect the APIs you already have.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            Every request gets one answer. The gateway walks your rules in
            order and stops at the first one that matches.
          </p>
          <div className="mt-8">
            <DecisionTrace />
          </div>
        </div>

        <p className="text-2xs text-slate-600">
          © {new Date().getFullYear()} RLaaS
        </p>
      </section>

      {/* Form panel */}
      <section className="flex items-center justify-center px-4 py-12 sm:px-6 lg:px-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <LogoMark className="h-7 w-7" />
            <span className="text-sm font-semibold text-slate-900">RLaaS</span>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            Sign in
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Operator credentials for the RLaaS control plane.
          </p>

          <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <input
                id="email"
                className="field"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                defaultValue={DEMO_EMAIL}
                required
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <label htmlFor="password" className="label !mb-0">
                  Password
                </label>
                <Link href="/forgot-password" className="text-xs text-slate-500 hover:text-slate-800">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  className="field pr-10"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  defaultValue={DEMO_PASSWORD}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center rounded-r-lg px-3 text-slate-400 transition-colors duration-state hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOffIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {error ? <ErrorState message={error} /> : null}

            {slowWarning && (
              <div
                role="status"
                className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800"
              >
                The demo backend sleeps when idle and takes 10–20 seconds to
                wake. Still working.
              </div>
            )}

            <button
              type="submit"
              className="btn-primary w-full"
              disabled={pending !== null}
            >
              {pending === 'credentials' ? 'Signing in…' : 'Sign in'}
            </button>

            <button
              type="button"
              className="btn-secondary w-full"
              onClick={handleGuestLogin}
              disabled={pending !== null}
            >
              {pending === 'demo' ? 'Signing in…' : 'Sign in to the demo account'}
            </button>

            <p className="text-center text-2xs text-slate-500">
              Shared demo account ·{' '}
              <span className="font-mono">{DEMO_EMAIL}</span>
            </p>
          </form>

          {/* Named outcome rather than "Try it" with a test-tube emoji. */}
          <div className="mt-7 border-t border-slate-200 pt-5">
            <Link
              href="/gateway-tester"
              className="group flex items-baseline justify-between gap-3"
            >
              <span>
                <span className="text-sm font-medium text-slate-900 underline decoration-slate-300 underline-offset-[3px] transition-colors duration-state group-hover:decoration-slate-600">
                  Watch a rate limit trigger
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Fire requests at a live gateway. No account needed.
                </span>
              </span>
              <span aria-hidden className="shrink-0 text-slate-400 transition-colors duration-state group-hover:text-slate-700">
                →
              </span>
            </Link>
          </div>

          <div className="mt-6 flex items-baseline justify-between gap-3 text-xs text-slate-500">
            <span>
              New here?{' '}
              <Link className="link" href="/register">
                Create an account
              </Link>
            </span>
            <a
              href="https://www.mjubayer.dev/"
              target="_blank"
              rel="noreferrer"
              className="link !text-slate-500"
            >
              Muhammad Jubayer
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
