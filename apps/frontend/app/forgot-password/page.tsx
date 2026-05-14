'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { LogoMark } from '@/components/icons';

type Step = 'email' | 'reset' | 'done';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const emailValue = (event.currentTarget.elements.namedItem('email') as HTMLInputElement).value;

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailValue }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.message ?? 'Something went wrong');
        return;
      }

      setEmail(emailValue);
      setResetCode(data.resetCode);
      setStep('reset');
    } catch {
      setError('Unable to reach the server. Please try again.');
    } finally {
      setPending(false);
    }
  }

  async function handleResetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = event.currentTarget;
    const code = (form.elements.namedItem('code') as HTMLInputElement).value;
    const newPassword = (form.elements.namedItem('newPassword') as HTMLInputElement).value;
    const confirmPassword = (form.elements.namedItem('confirmPassword') as HTMLInputElement).value;

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      setPending(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.message ?? 'Invalid or expired code');
        return;
      }

      setStep('done');
    } catch {
      setError('Unable to reach the server. Please try again.');
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

          {/* Step 1 — Enter email */}
          {step === 'email' && (
            <>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Reset your password</h1>
              <p className="mt-1.5 text-sm text-slate-500">
                Enter your email and a reset code will be generated for you.
              </p>
              <form className="mt-6 space-y-4" onSubmit={handleEmailSubmit}>
                <div>
                  <label htmlFor="email" className="label">Email</label>
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
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button type="submit" className="btn-primary w-full" disabled={pending}>
                  {pending ? 'Generating…' : 'Get reset code'}
                </button>
              </form>
            </>
          )}

          {/* Step 2 — Show code & enter new password */}
          {step === 'reset' && (
            <>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Enter reset code</h1>
              <p className="mt-1.5 text-sm text-slate-500">
                Your reset code is shown below. It expires in 10 minutes.
              </p>

              {/* Code display */}
              <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-4 text-center">
                <p className="text-xs font-medium uppercase tracking-widest text-brand-600">Your Reset Code</p>
                <p className="mt-1 text-3xl font-bold tracking-[0.3em] text-brand-700">{resetCode}</p>
              </div>

              <form className="mt-6 space-y-4" onSubmit={handleResetSubmit}>
                <div>
                  <label htmlFor="code" className="label">Reset Code</label>
                  <input
                    id="code"
                    className="field"
                    name="code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6-digit code"
                    defaultValue={resetCode}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="newPassword" className="label">New Password</label>
                  <input
                    id="newPassword"
                    className="field"
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Minimum 8 characters"
                    minLength={8}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="confirmPassword" className="label">Confirm Password</label>
                  <input
                    id="confirmPassword"
                    className="field"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repeat new password"
                    minLength={8}
                    required
                  />
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button type="submit" className="btn-primary w-full" disabled={pending}>
                  {pending ? 'Resetting…' : 'Reset password'}
                </button>
              </form>
            </>
          )}

          {/* Step 3 — Done */}
          {step === 'done' && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold text-slate-900">Password reset!</h1>
              <p className="mt-2 text-sm text-slate-500">
                Your password has been updated. You can now sign in with your new password.
              </p>
              <Link href="/login" className="mt-6 inline-block text-sm font-medium text-brand-700 hover:text-brand-800">
                Back to sign in →
              </Link>
            </div>
          )}

        </div>

        {step === 'email' && (
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
