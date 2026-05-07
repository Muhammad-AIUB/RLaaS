'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { Panel } from '@/components/panel';
import { apiFetch } from '@/lib/api-client';
import { RuleRecord } from '@/lib/types';

export default function RulesPage() {
  const params = useParams<{ projectId: string }>();
  const [rules, setRules] = useState<RuleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      setLoading(true);
      const data = await apiFetch<RuleRecord[]>(
        `/api/proxy/projects/${params.projectId}/rules`,
      );
      setRules(data);
      setError('');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to load rules');
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
      await apiFetch<RuleRecord>(`/api/proxy/projects/${params.projectId}/rules`, {
        method: 'POST',
        body: JSON.stringify({
          name: formData.get('name'),
          description: formData.get('description'),
          priority: Number(formData.get('priority')),
          scope: formData.get('scope'),
          targetValue: formData.get('targetValue') || undefined,
          endpointPattern: formData.get('endpointPattern') || undefined,
          method: formData.get('method') || undefined,
          userTier: formData.get('userTier') || undefined,
          algorithm: formData.get('algorithm'),
          limit: Number(formData.get('limit')),
          windowSeconds: Number(formData.get('windowSeconds')),
          burstCapacity: formData.get('burstCapacity')
            ? Number(formData.get('burstCapacity'))
            : undefined,
        }),
      });
      event.currentTarget.reset();
      await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to create rule');
    } finally {
      setPending(false);
    }
  }

  async function remove(ruleId: string) {
    try {
      await apiFetch<{ success: boolean }>(
        `/api/proxy/projects/${params.projectId}/rules/${ruleId}`,
        {
          method: 'DELETE',
        },
      );
      await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to delete rule');
    }
  }

  return (
    <div className="space-y-6">
      <Panel>
        <p className="text-xs uppercase tracking-[0.32em] text-pine">Rules</p>
        <h1 className="mt-3 text-3xl font-semibold text-ink">Translate policy into priority.</h1>
        <form className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={handleCreate}>
          <input className="rounded-2xl border border-slate-200 px-4 py-3" name="name" placeholder="Rule name" required />
          <input className="rounded-2xl border border-slate-200 px-4 py-3" name="priority" type="number" placeholder="Priority" defaultValue="100" required />
          <select className="rounded-2xl border border-slate-200 px-4 py-3" name="scope" defaultValue="GLOBAL">
            <option value="IP">IP</option>
            <option value="API_KEY">API Key</option>
            <option value="USER_TIER">User Tier</option>
            <option value="ENDPOINT">Endpoint</option>
            <option value="GLOBAL">Global</option>
          </select>
          <select className="rounded-2xl border border-slate-200 px-4 py-3" name="algorithm" defaultValue="FIXED_WINDOW">
            <option value="FIXED_WINDOW">Fixed Window</option>
            <option value="SLIDING_WINDOW_LOG">Sliding Window Log</option>
            <option value="SLIDING_WINDOW_COUNTER">Sliding Window Counter</option>
            <option value="TOKEN_BUCKET">Token Bucket</option>
          </select>
          <input className="rounded-2xl border border-slate-200 px-4 py-3 xl:col-span-2" name="description" placeholder="Description" />
          <input className="rounded-2xl border border-slate-200 px-4 py-3" name="targetValue" placeholder="Target value" />
          <input className="rounded-2xl border border-slate-200 px-4 py-3" name="endpointPattern" placeholder="/api/products*" />
          <select className="rounded-2xl border border-slate-200 px-4 py-3" name="method" defaultValue="">
            <option value="">Any method</option>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>
          <select className="rounded-2xl border border-slate-200 px-4 py-3" name="userTier" defaultValue="">
            <option value="">Any tier</option>
            <option value="FREE">FREE</option>
            <option value="PRO">PRO</option>
            <option value="BUSINESS">BUSINESS</option>
            <option value="ENTERPRISE">ENTERPRISE</option>
          </select>
          <input className="rounded-2xl border border-slate-200 px-4 py-3" name="limit" type="number" placeholder="Limit" defaultValue="100" required />
          <input className="rounded-2xl border border-slate-200 px-4 py-3" name="windowSeconds" type="number" placeholder="Window seconds" defaultValue="60" required />
          <input className="rounded-2xl border border-slate-200 px-4 py-3" name="burstCapacity" type="number" placeholder="Burst capacity" />
          <div className="xl:col-span-4">
            <button className="rounded-full bg-pine px-5 py-3 text-sm font-medium text-white disabled:opacity-60" disabled={pending} type="submit">
              {pending ? 'Creating rule...' : 'Create rule'}
            </button>
          </div>
        </form>
      </Panel>
      {error ? <ErrorState message={error} /> : null}
      {loading ? (
        <LoadingState label="Loading rules..." />
      ) : (
        <div className="space-y-4">
          {rules.map((rule) => (
            <Panel key={rule.id}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold text-ink">{rule.name}</h2>
                    <span className="rounded-full bg-sand px-3 py-1 text-xs uppercase tracking-[0.24em] text-pine">
                      {rule.scope}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{rule.description || 'No description.'}</p>
                  <p className="mt-3 text-sm text-slate-500">
                    Priority {rule.priority} · {rule.algorithm} · limit {rule.limit}/{rule.windowSeconds}s
                  </p>
                </div>
                <button
                  className="rounded-full border border-ember/30 px-4 py-2 text-sm text-ember transition hover:bg-ember hover:text-white"
                  onClick={() => remove(rule.id)}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
