'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { LogoMark } from '@/components/icons';

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    await new Promise((r) => setTimeout(r, 600));
    setSubmitted(true);
    setPending(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10 sm:px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2">
          <LogoMark className="h-8 w-8" />
          <span className="text-base font-semibold text-slate-900">RLaaS</span>
        </div>

        <div className="card p-6 sm:p-8">
          {submitted ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold text-slate-900">Check your email</h1>
              <p className="mt-2 text-sm text-slate-500">
                If that address is registered, you will receive a password reset link shortly.
              </p>
              <Link href="/login" className="mt-6 inline-block text-sm font-medium text-brand-700 hover:text-brand-800">
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Reset your password
              </h1>
              <p className="mt-1.5 text-sm text-slate-500">
                Enter your email and we will send you a reset link.
              </p>

              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
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

                <button type="submit" className="btn-primary w-full" disabled={pending}>
                  {pending ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            </>
          )}
        </div>

        {!submitted && (
          <p className="mt-6 text-center text-sm text-slate-500">
            Remember your password?{' '}
            <Link className="font-medium text-brand-700 hover:text-brand-800" href="/login">
              Sign in
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
