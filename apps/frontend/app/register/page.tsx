'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ErrorState } from '@/components/feedback';
import { LogoMark } from '@/components/icons';

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
        headers: { 'Content-Type': 'application/json' },
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
        caughtError instanceof Error
          ? caughtError.message
          : 'Registration failed',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10 sm:px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2">
          <LogoMark className="h-8 w-8" />
          <span className="text-base font-semibold text-slate-900">RLaaS</span>
        </div>

        <div className="card p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Create your account
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Register an operator account for the RLaaS control plane.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="fullName" className="label">
                Full name
              </label>
              <input
                id="fullName"
                className="field"
                name="fullName"
                autoComplete="name"
                required
              />
            </div>
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
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <input
                id="password"
                className="field"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Must be at least 8 characters.
              </p>
            </div>

            {error ? <ErrorState message={error} /> : null}

            <button type="submit" className="btn-primary w-full" disabled={pending}>
              {pending ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link
            className="font-medium text-brand-700 hover:text-brand-800"
            href="/login"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
