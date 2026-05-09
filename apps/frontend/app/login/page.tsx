'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ErrorState } from '@/components/feedback';
import { LogoMark } from '@/components/icons';

const PRODUCT_CAPABILITIES = [
  { value: '4', label: 'Algorithms' },
  { value: '5', label: 'Rule scopes' },
  { value: 'RBAC', label: 'Per project' },
];

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
      setError(
        caughtError instanceof Error ? caughtError.message : 'Login failed',
      );
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
            <LogoMark className="h-9 w-9" />
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
            Inspect traffic, tune rules, and track how your rate limits perform
            under pressure — all in one console.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3">
            {PRODUCT_CAPABILITIES.map((stat) => (
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
            <LogoMark className="h-8 w-8" />
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
                placeholder="you@company.com"
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
                placeholder="••••••••"
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
            <Link
              className="font-medium text-brand-700 hover:text-brand-800"
              href="/register"
            >
              Create an account
            </Link>
          </p>

          <p className="mt-6 text-xs text-slate-500">
            Developed by{' '}
            <a
              href="https://www.mjubayer.dev/"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand-700 hover:text-brand-800"
            >
              Muhammad Jubayer
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
