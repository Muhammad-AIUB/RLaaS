'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ErrorState } from '@/components/error-state';

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);
    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName: formData.get('fullName'),
          email: formData.get('email'),
          password: formData.get('password'),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.message ?? 'Registration failed');
      }

      router.push('/dashboard');
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Registration failed',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl rounded-[36px] border border-white/80 bg-white/85 p-8 shadow-panel backdrop-blur">
        <p className="text-xs uppercase tracking-[0.34em] text-pine">Create Account</p>
        <h1 className="mt-4 text-3xl font-semibold text-ink">Start managing traffic</h1>
        <p className="mt-3 text-sm text-slate-600">
          Register an operator account for the RLaaS control plane.
        </p>
        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm text-slate-700">Full name</span>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-pine"
              name="fullName"
              required
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm text-slate-700">Email</span>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-pine"
              name="email"
              type="email"
              required
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm text-slate-700">Password</span>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-pine"
              name="password"
              type="password"
              minLength={8}
              required
            />
          </label>
          {error ? <ErrorState message={error} /> : null}
          <button
            className="w-full rounded-full bg-pine px-5 py-3 text-sm font-medium text-white transition hover:bg-ink disabled:opacity-60"
            disabled={pending}
            type="submit"
          >
            {pending ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <p className="mt-6 text-sm text-slate-600">
          Already registered?{' '}
          <Link className="font-medium text-pine" href="/login">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
