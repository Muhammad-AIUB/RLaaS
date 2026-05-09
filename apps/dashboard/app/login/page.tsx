'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ErrorState } from '@/components/error-state';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);

    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.get('email'),
          password: formData.get('password'),
        }),
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
      setError(caughtError instanceof Error ? caughtError.message : 'Login failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Left brand panel — desktop only */}
      <section className="relative hidden overflow-hidden bg-slate-900 text-white lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              'radial-gradient(60% 50% at 30% 30%, rgba(99,102,241,0.55) 0%, transparent 70%), radial-gradient(40% 40% at 80% 80%, rgba(16,185,129,0.35) 0%, transparent 70%)',
          }}
          aria-hidden
        />
        <div className="relative z-10">
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none">
              <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#g)" />
              <path d="M7 12h10M7 8h10M7 16h6" stroke="white" strokeWidth="1.75" strokeLinecap="round" />
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="24" y2="24">
                  <stop stopColor="#818cf8" />
                  <stop offset="1" stopColor="#4338ca" />
                </linearGradient>
              </defs>
            </svg>
            <span className="text-base font-semibold">RLaaS Platform</span>
          </div>
        </div>
        <div className="relative z-10 max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-300">
            Operator console
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight">
            Protect the APIs you already have.
          </h1>
          <p className="mt-4 text-base text-slate-300">
            Inspect traffic, tune rules, and track how your rate limits perform under
            pressure — all in one console.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3">
            {[
              { value: '4', label: 'Algorithms' },
              { value: '5', label: 'Rule scopes' },
              { value: '∞', label: 'Projects' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur"
              >
                <p className="text-2xl font-semibold">{stat.value}</p>
                <p className="mt-1 text-xs text-slate-400">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 text-xs text-slate-400">
          © {new Date().getFullYear()} RLaaS · All rights reserved
        </div>
      </section>

      {/* Right form panel */}
      <section className="flex items-center justify-center px-4 py-10 sm:px-6 lg:px-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none">
              <rect x="2" y="2" width="20" height="20" rx="6" fill="#4f46e5" />
              <path d="M7 12h10M7 8h10M7 16h6" stroke="white" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
            <span className="text-base font-semibold text-slate-900">RLaaS</span>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Welcome back
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Sign in with your operator credentials.
          </p>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
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
                defaultValue="demo@rlaas.local"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="label !mb-0">
                  Password
                </label>
                <a
                  href="#"
                  className="text-xs font-medium text-brand-700 hover:text-brand-800"
                >
                  Forgot?
                </a>
              </div>
              <input
                id="password"
                className="field mt-1.5"
                name="password"
                type="password"
                autoComplete="current-password"
                defaultValue="DemoPass123!"
                required
              />
            </div>

            {error ? <ErrorState message={error} /> : null}

            <button type="submit" className="btn-primary w-full" disabled={pending}>
              {pending ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-500">
            New here?{' '}
            <Link className="font-medium text-brand-700 hover:text-brand-800" href="/register">
              Create an account
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
