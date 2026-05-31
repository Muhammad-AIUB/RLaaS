'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { LogoMark } from '@/components/icons';

type Algorithm = 'fixed_window' | 'sliding_window_counter' | 'sliding_window_log' | 'token_bucket';

interface LogEntry {
  id: number;
  time: string;
  allowed: boolean;
  remaining: number;
  retryAfterMs: number | null;
}

const ALGORITHMS: { value: Algorithm; label: string; tagline: string; detail: string }[] = [
  {
    value: 'fixed_window',
    label: 'Fixed Window',
    tagline: 'Simple & fast',
    detail: 'Divides time into fixed buckets. Easiest to implement, but can allow up to 2× burst at window edges.',
  },
  {
    value: 'sliding_window_counter',
    label: 'Sliding Window',
    tagline: 'Balanced accuracy',
    detail: 'Weighted blend of two consecutive windows. Near-perfect accuracy with minimal Redis memory overhead.',
  },
  {
    value: 'sliding_window_log',
    label: 'Window Log',
    tagline: 'Most precise',
    detail: 'Stores exact timestamps of each request. Zero burst at boundaries — perfect enforcement every time.',
  },
  {
    value: 'token_bucket',
    label: 'Token Bucket',
    tagline: 'Burst-tolerant',
    detail: 'Tokens refill steadily over time. Absorbs short bursts gracefully while maintaining average throughput.',
  },
];

const LIMIT = 5;

function makeSessionKey() {
  return (
    'demo_' +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  );
}

export default function GatewayTesterPage() {
  const [algo, setAlgo] = useState<Algorithm>('fixed_window');
  const [sessionKey, setSessionKey] = useState(makeSessionKey);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [remaining, setRemaining] = useState(LIMIT);
  const [countdown, setCountdown] = useState(0);
  const [pending, setPending] = useState(false);
  const [flashBlocked, setFlashBlocked] = useState(false);
  const idRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => () => clearInterval(timerRef.current), []);

  function startCountdown(seconds: number) {
    clearInterval(timerRef.current);
    setCountdown(seconds);
    timerRef.current = setInterval(() => {
      setCountdown((p) => {
        if (p <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return p - 1;
      });
    }, 1000);
  }

  async function fire() {
    const res = await fetch('/api/demo-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ algorithm: algo, identifier: sessionKey }),
    })
      .then((r) => r.json())
      .catch(() => null);

    if (!res) return;

    setRemaining(res.remaining);
    if (res.retryAfterMs > 0) {
      startCountdown(Math.ceil(res.retryAfterMs / 1000));
    }

    setLogs((prev) =>
      [
        {
          id: ++idRef.current,
          time: new Date().toLocaleTimeString('en-US', { hour12: false }),
          allowed: res.allowed,
          remaining: res.remaining,
          retryAfterMs: res.retryAfterMs,
        },
        ...prev,
      ].slice(0, 25),
    );

    if (!res.allowed) {
      setFlashBlocked(true);
      setTimeout(() => setFlashBlocked(false), 1500);
    }
  }

  async function handleSend() {
    if (pending) return;
    setPending(true);
    await fire();
    setPending(false);
  }

  async function handleBurst() {
    if (pending) return;
    setPending(true);
    for (let i = 0; i < 10; i++) {
      await fire();
      if (i < 9) await new Promise((r) => setTimeout(r, 200));
    }
    setPending(false);
  }

  function handleReset() {
    clearInterval(timerRef.current);
    setSessionKey(makeSessionKey());
    setLogs([]);
    setRemaining(LIMIT);
    setCountdown(0);
    setFlashBlocked(false);
  }

  function handleAlgoChange(a: Algorithm) {
    if (a === algo) return;
    setAlgo(a);
    setRemaining(LIMIT);
    setCountdown(0);
    clearInterval(timerRef.current);
  }

  const pct = Math.round((remaining / LIMIT) * 100);
  const selectedAlgo = ALGORITHMS.find((a) => a.value === algo)!;

  return (
    <main className="min-h-screen bg-canvas">
      {/* Top banner */}
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-sm">
        <span className="text-amber-800">🧪 Live Demo — no login required.</span>{' '}
        <Link
          href="/login"
          className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-700"
        >
          Sign in to use RLaaS for real →
        </Link>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        {/* Header */}
        <div className="mb-1 flex items-center gap-2">
          <LogoMark className="h-6 w-6 opacity-70" />
          <span className="text-sm text-slate-400">RLaaS Platform</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Gateway Tester
        </h1>
        <p className="mt-2 max-w-xl text-slate-500">
          Click <strong className="text-slate-700">Send Request</strong> and watch RLaaS
          enforce rate limits in real time. Each algorithm gets its own counter:{' '}
          <strong className="text-slate-700">5 requests per 10 seconds</strong>.
        </p>

        {/* Algorithm tabs */}
        <div className="mt-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
            Algorithm
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ALGORITHMS.map((a) => (
              <button
                key={a.value}
                onClick={() => handleAlgoChange(a.value)}
                className={`rounded-xl border px-3 py-3 text-left text-sm transition-all ${
                  algo === a.value
                    ? 'border-brand-400 bg-brand-50 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span
                  className={`block font-semibold ${algo === a.value ? 'text-brand-700' : 'text-slate-700'}`}
                >
                  {a.label}
                </span>
                <span
                  className={`mt-0.5 block text-xs ${algo === a.value ? 'text-brand-500' : 'text-slate-400'}`}
                >
                  {a.tagline}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">{selectedAlgo.detail}</p>
        </div>

        {/* Main grid: controls + log */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Controls */}
          <div
            className={`card p-6 transition-all duration-200 ${
              flashBlocked ? 'ring-2 ring-red-400 ring-offset-2' : ''
            }`}
          >
            {/* Progress */}
            <div className="mb-6">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-slate-600">
                  Remaining
                </span>
                <span
                  className={`text-3xl font-bold tabular-nums ${
                    remaining === 0
                      ? 'text-red-600'
                      : remaining <= 2
                        ? 'text-amber-500'
                        : 'text-emerald-600'
                  }`}
                >
                  {remaining}
                  <span className="ml-1 text-base font-normal text-slate-400">
                    / {LIMIT}
                  </span>
                </span>
              </div>
              <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-2.5 rounded-full transition-all duration-500 ${
                    pct > 60
                      ? 'bg-emerald-500'
                      : pct > 20
                        ? 'bg-amber-400'
                        : 'bg-red-500'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-1.5 text-xs text-slate-400">
                {countdown > 0 ? (
                  <span>
                    ⏱ Window resets in{' '}
                    <strong className="text-slate-600">{countdown}s</strong>
                  </span>
                ) : (
                  <span>Window: 10 seconds · Limit: {LIMIT} requests</span>
                )}
              </div>
            </div>

            {/* Flash */}
            {flashBlocked && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                ⛔ 429 Too Many Requests — rate limit hit!
              </div>
            )}

            {/* Buttons */}
            <div className="space-y-2.5">
              <button
                onClick={handleSend}
                disabled={pending}
                className="btn-primary w-full py-3 text-base disabled:opacity-60"
              >
                {pending ? 'Sending…' : '→ Send Request'}
              </button>
              <button
                onClick={handleBurst}
                disabled={pending}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                ⚡ Send 10 Rapid Requests
              </button>
              <button
                onClick={handleReset}
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              >
                ↺ Reset (new session)
              </button>
            </div>
          </div>

          {/* Log */}
          <div className="card flex flex-col p-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
              Request Log
            </p>
            {logs.length === 0 ? (
              <div className="flex flex-1 items-center justify-center py-12 text-center">
                <p className="text-sm text-slate-400">
                  No requests yet.
                  <br />
                  Hit <strong>Send Request</strong> to start.
                </p>
              </div>
            ) : (
              <div className="max-h-72 space-y-1.5 overflow-y-auto">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${
                      log.allowed
                        ? 'bg-emerald-50 text-emerald-900'
                        : 'bg-red-50 text-red-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold">
                        {log.allowed ? '✓ 200 ALLOWED' : '✗ 429 BLOCKED'}
                      </span>
                      <span className="text-slate-400">{log.time}</span>
                    </div>
                    <span className="text-right">
                      {log.allowed ? (
                        <span className="text-slate-500">{log.remaining} left</span>
                      ) : (
                        <span>
                          retry {log.retryAfterMs ? `in ${Math.ceil(log.retryAfterMs / 1000)}s` : 'later'}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Info section */}
        <div className="mt-12">
          <h2 className="mb-5 text-xl font-semibold text-slate-900">
            How rate limiting works
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card p-5">
              <p className="font-semibold text-slate-900">What is rate limiting?</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Rate limiting caps how many requests a client can make in a time
                window — protecting APIs from abuse, scraping, and traffic spikes.
              </p>
            </div>
            <div className="card p-5">
              <p className="font-semibold text-slate-900">Redis-backed counters</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Every click runs a real Lua script on Upstash Redis atomically.
                No race conditions, no false positives — production-grade enforcement.
              </p>
            </div>
            <div className="card p-5">
              <p className="font-semibold text-slate-900">Isolated per visitor</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Each browser session gets a unique ID prefixed <code className="text-xs bg-slate-100 px-1 rounded">demo:</code>.
                Your clicks never affect real project data.
              </p>
            </div>
          </div>
        </div>

        {/* Algorithm breakdown */}
        <div className="mt-6 card p-6">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400">
            The 4 algorithms
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {ALGORITHMS.map((a) => (
              <button
                key={a.value}
                onClick={() => handleAlgoChange(a.value)}
                className={`rounded-xl p-4 text-left transition-all ${
                  algo === a.value
                    ? 'bg-brand-50 ring-1 ring-brand-300'
                    : 'bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <p
                  className={`font-semibold ${algo === a.value ? 'text-brand-800' : 'text-slate-800'}`}
                >
                  {a.label}
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    {a.tagline}
                  </span>
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  {a.detail}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 text-sm text-slate-400">
          <div className="flex items-center gap-2">
            <LogoMark className="h-5 w-5 opacity-40" />
            <span>RLaaS Platform · Built by Muhammad Jubayer</span>
          </div>
          <div className="flex gap-5">
            <Link
              href="/login"
              className="font-medium text-brand-700 hover:text-brand-800"
            >
              Sign in
            </Link>
            <Link href="/docs" className="hover:text-slate-600">
              Docs
            </Link>
            <a
              href="https://github.com/Muhammad-AIUB/RLaaS"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-600"
            >
              GitHub →
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
