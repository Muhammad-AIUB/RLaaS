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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.get('email'),
          password: formData.get('password'),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.message ?? 'Login failed');
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
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[36px] bg-ink p-10 text-white shadow-panel">
          <p className="text-xs uppercase tracking-[0.38em] text-moss">RLaaS Platform</p>
          <h1 className="mt-6 text-5xl font-semibold leading-tight">
            Protect the APIs you already have.
          </h1>
          <p className="mt-6 max-w-xl text-base text-slate-300">
            Log in to inspect traffic, tune rules, and track how your rate limits perform under pressure.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl bg-white/10 p-4">
              <p className="text-2xl font-semibold">4</p>
              <p className="mt-2 text-sm text-slate-300">Algorithms ready</p>
            </div>
            <div className="rounded-3xl bg-white/10 p-4">
              <p className="text-2xl font-semibold">5</p>
              <p className="mt-2 text-sm text-slate-300">Rule scopes</p>
            </div>
            <div className="rounded-3xl bg-white/10 p-4">
              <p className="text-2xl font-semibold">1</p>
              <p className="mt-2 text-sm text-slate-300">Gateway to guard</p>
            </div>
          </div>
        </section>
        <section className="rounded-[36px] border border-white/80 bg-white/85 p-8 shadow-panel backdrop-blur">
          <p className="text-xs uppercase tracking-[0.34em] text-pine">Sign In</p>
          <h2 className="mt-4 text-3xl font-semibold text-ink">Welcome back</h2>
          <p className="mt-3 text-sm text-slate-600">
            Use the seeded demo account or your own operator credentials.
          </p>
          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm text-slate-700">Email</span>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-pine"
                name="email"
                type="email"
                defaultValue="demo@rlaas.local"
                required
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm text-slate-700">Password</span>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-pine"
                name="password"
                type="password"
                defaultValue="DemoPass123!"
                required
              />
            </label>
            {error ? <ErrorState message={error} /> : null}
            <button
              className="w-full rounded-full bg-pine px-5 py-3 text-sm font-medium text-white transition hover:bg-ink disabled:opacity-60"
              disabled={pending}
              type="submit"
            >
              {pending ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
          <p className="mt-6 text-sm text-slate-600">
            Need an account?{' '}
            <Link className="font-medium text-pine" href="/register">
              Create one
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
