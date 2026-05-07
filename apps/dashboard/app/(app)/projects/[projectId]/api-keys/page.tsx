'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { Panel } from '@/components/panel';
import { apiFetch } from '@/lib/api-client';
import { ApiKeyRecord } from '@/lib/types';

export default function ApiKeysPage() {
  const params = useParams<{ projectId: string }>();
  const [records, setRecords] = useState<ApiKeyRecord[]>([]);
  const [revealedKey, setRevealedKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      setLoading(true);
      const data = await apiFetch<ApiKeyRecord[]>(
        `/api/proxy/projects/${params.projectId}/api-keys`,
      );
      setRecords(data);
      setError('');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [params.projectId]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const formData = new FormData(event.currentTarget);

    try {
      const data = await apiFetch<ApiKeyRecord>(
        `/api/proxy/projects/${params.projectId}/api-keys`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: formData.get('name'),
            expiresAt: formData.get('expiresAt') || undefined,
          }),
        },
      );
      setRevealedKey(data.key ?? '');
      event.currentTarget.reset();
      await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to create API key');
    } finally {
      setPending(false);
    }
  }

  async function revoke(apiKeyId: string) {
    try {
      await apiFetch<ApiKeyRecord>(
        `/api/proxy/projects/${params.projectId}/api-keys/${apiKeyId}/revoke`,
        {
          method: 'PATCH',
        },
      );
      await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to revoke API key');
    }
  }

  return (
    <div className="space-y-6">
      <Panel>
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-pine">API key management</p>
            <h1 className="mt-3 text-3xl font-semibold text-ink">Issue access with intention.</h1>
            <p className="mt-3 text-sm text-slate-600">
              Create credentials for gateway calls and revoke them as soon as you suspect leakage.
            </p>
          </div>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreate}>
            <input className="rounded-2xl border border-slate-200 px-4 py-3" name="name" placeholder="Primary production key" required />
            <input className="rounded-2xl border border-slate-200 px-4 py-3" name="expiresAt" type="datetime-local" />
            <div className="md:col-span-2">
              <button className="rounded-full bg-pine px-5 py-3 text-sm font-medium text-white disabled:opacity-60" disabled={pending} type="submit">
                {pending ? 'Generating key...' : 'Generate API key'}
              </button>
            </div>
          </form>
        </div>
        {revealedKey ? (
          <div className="mt-6 rounded-2xl border border-moss/50 bg-sand px-4 py-4 text-sm text-ink">
            Raw key shown once: <span className="font-mono">{revealedKey}</span>
          </div>
        ) : null}
      </Panel>
      {error ? <ErrorState message={error} /> : null}
      {loading ? (
        <LoadingState label="Loading API keys..." />
      ) : (
        <Panel>
          <div className="space-y-4">
            {records.map((item) => (
              <div key={item.id} className="flex flex-col gap-4 rounded-3xl border border-slate-100 bg-slate-50 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-lg font-semibold text-ink">{item.name}</p>
                  <p className="mt-1 font-mono text-xs text-slate-500">{item.keyPrefix}...</p>
                  <p className="mt-2 text-sm text-slate-600">
                    Status: {item.status} · Last used: {item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString() : 'Never'}
                  </p>
                </div>
                <button
                  className="rounded-full border border-ember/30 px-4 py-2 text-sm text-ember transition hover:bg-ember hover:text-white"
                  onClick={() => revoke(item.id)}
                  type="button"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
