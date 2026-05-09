'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { Panel, PanelHeader } from '@/components/panel';
import { ProjectTabs } from '@/components/project-tabs';
import { apiFetch } from '@/lib/api-client';
import { RuleRecord } from '@/lib/types';

export default function RulesPage() {
  const params = useParams<{ projectId: string }>();
  const [rules, setRules] = useState<RuleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const data = await apiFetch<RuleRecord[]>(
        `/api/proxy/projects/${params.projectId}/rules`,
      );
      setRules(data);
      setError('');
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to load rules',
      );
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
    const form = event.currentTarget;
    const formData = new FormData(form);

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
      form.reset();
      setShowForm(false);
      await load();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to create rule',
      );
    } finally {
      setPending(false);
    }
  }

  async function remove(ruleId: string) {
    try {
      await apiFetch<{ success: boolean }>(
        `/api/proxy/projects/${params.projectId}/rules/${ruleId}`,
        { method: 'DELETE' },
      );
      await load();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to delete rule',
      );
    }
  }

  return (
    <>
      <PageHeader
        crumbs={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${params.projectId}`, label: 'Project' },
          { label: 'Rules' },
        ]}
        eyebrow="Policy"
        title="Rate-limit rules"
        description="Translate policy into priorities. Rules are evaluated in priority order — highest first."
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowForm((s) => !s)}
          >
            {showForm ? 'Close' : 'New rule'}
          </button>
        }
      />
      <ProjectTabs projectId={params.projectId as string} />

      {showForm ? (
        <Panel className="mb-6">
          <PanelHeader eyebrow="Create" title="New rule" />
          <form
            className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            onSubmit={handleCreate}
          >
            <div className="sm:col-span-2">
              <label className="label">Name</label>
              <input className="field" name="name" required placeholder="Throttle public endpoints" />
            </div>
            <div>
              <label className="label">Priority</label>
              <input className="field" name="priority" type="number" defaultValue="100" required />
            </div>
            <div>
              <label className="label">Scope</label>
              <select className="field" name="scope" defaultValue="GLOBAL">
                <option value="IP">IP</option>
                <option value="API_KEY">API Key</option>
                <option value="USER_TIER">User Tier</option>
                <option value="ENDPOINT">Endpoint</option>
                <option value="GLOBAL">Global</option>
              </select>
            </div>
            <div>
              <label className="label">Algorithm</label>
              <select className="field" name="algorithm" defaultValue="FIXED_WINDOW">
                <option value="FIXED_WINDOW">Fixed Window</option>
                <option value="SLIDING_WINDOW_LOG">Sliding Window Log</option>
                <option value="SLIDING_WINDOW_COUNTER">Sliding Window Counter</option>
                <option value="TOKEN_BUCKET">Token Bucket</option>
              </select>
            </div>
            <div>
              <label className="label">Target value</label>
              <input className="field" name="targetValue" placeholder="e.g. 1.2.3.4" />
            </div>
            <div>
              <label className="label">Endpoint pattern</label>
              <input className="field" name="endpointPattern" placeholder="/api/products*" />
            </div>
            <div>
              <label className="label">Method</label>
              <select className="field" name="method" defaultValue="">
                <option value="">Any method</option>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
            <div>
              <label className="label">User tier</label>
              <select className="field" name="userTier" defaultValue="">
                <option value="">Any tier</option>
                <option value="FREE">FREE</option>
                <option value="PRO">PRO</option>
                <option value="BUSINESS">BUSINESS</option>
                <option value="ENTERPRISE">ENTERPRISE</option>
              </select>
            </div>
            <div>
              <label className="label">Limit</label>
              <input className="field" name="limit" type="number" defaultValue="100" required />
            </div>
            <div>
              <label className="label">Window (s)</label>
              <input className="field" name="windowSeconds" type="number" defaultValue="60" required />
            </div>
            <div>
              <label className="label">Burst capacity</label>
              <input className="field" name="burstCapacity" type="number" placeholder="optional" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4">
              <label className="label">Description</label>
              <input className="field" name="description" placeholder="Optional description" />
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3 xl:col-span-4">
              <button type="submit" className="btn-primary" disabled={pending}>
                {pending ? 'Creating…' : 'Create rule'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      ) : null}

      {error ? (
        <div className="mb-6">
          <ErrorState message={error} />
        </div>
      ) : null}

      {loading ? (
        <LoadingState label="Loading rules…" />
      ) : rules.length === 0 ? (
        <Panel>
          <p className="py-6 text-center text-sm text-slate-500">
            No rules yet. Create your first one above.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4">
          {rules.map((rule) => (
            <Panel key={rule.id}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900">
                      {rule.name}
                    </h2>
                    <span className="badge-brand">{rule.scope}</span>
                    <span className="badge-neutral">{rule.algorithm}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {rule.description || 'No description.'}
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                    <div>
                      <dt className="text-slate-500">Priority</dt>
                      <dd className="font-medium text-slate-800">{rule.priority}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Limit</dt>
                      <dd className="font-medium text-slate-800">{rule.limit}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Window</dt>
                      <dd className="font-medium text-slate-800">{rule.windowSeconds}s</dd>
                    </div>
                  </dl>
                </div>
                <div>
                  <button
                    type="button"
                    className="btn-danger btn-sm"
                    onClick={() => remove(rule.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
