'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { Panel, PanelHeader } from '@/components/panel';
import { ProjectTabs } from '@/components/project-tabs';
import { apiFetch } from '@/lib/api-client';
import { ApiKeyRecord } from '@/lib/types';

export default function ApiKeysPage() {
  const params = useParams<{ projectId: string }>();
  const [records, setRecords] = useState<ApiKeyRecord[]>([]);
  const [revealedKey, setRevealedKey] = useState('');
  const [copied, setCopied] = useState(false);
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
      setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to load API keys',
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
      form.reset();
      await load();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to create API key',
      );
    } finally {
      setPending(false);
    }
  }

  async function revoke(apiKeyId: string) {
    try {
      await apiFetch<ApiKeyRecord>(
        `/api/proxy/projects/${params.projectId}/api-keys/${apiKeyId}/revoke`,
        { method: 'PATCH' },
      );
      await load();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to revoke API key',
      );
    }
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(revealedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  }

  return (
    <>
      <PageHeader
        crumbs={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${params.projectId}`, label: 'Project' },
          { label: 'API Keys' },
        ]}
        eyebrow="Credentials"
        title="API keys"
        description="Issue keys for gateway calls and revoke them as soon as you suspect leakage."
      />
      <ProjectTabs projectId={params.projectId as string} />

      <Panel className="mb-6">
        <PanelHeader
          eyebrow="Create"
          title="Generate a new API key"
          description="The raw key is shown once — store it somewhere safe."
        />
        <form
          className="mt-5 grid gap-4 sm:grid-cols-2"
          onSubmit={handleCreate}
        >
          <div className="sm:col-span-1">
            <label className="label" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              name="name"
              required
              className="field"
              placeholder="Primary production key"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="label" htmlFor="expiresAt">
              Expires (optional)
            </label>
            <input
              id="expiresAt"
              name="expiresAt"
              type="datetime-local"
              className="field"
            />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? 'Generating…' : 'Generate API key'}
            </button>
          </div>
        </form>

        {revealedKey ? (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4M12 17h.01" />
                <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-900">
                  Copy this key now — it won't be shown again.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-md border border-amber-200 bg-white px-3 py-2 font-mono text-xs text-slate-800">
                    {revealedKey}
                  </code>
                  <button type="button" className="btn-secondary btn-sm" onClick={copyKey}>
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Panel>

      {error ? (
        <div className="mb-6">
          <ErrorState message={error} />
        </div>
      ) : null}

      {loading ? (
        <LoadingState label="Loading API keys…" />
      ) : records.length === 0 ? (
        <Panel>
          <p className="py-6 text-center text-sm text-slate-500">
            No API keys yet. Generate one above to get started.
          </p>
        </Panel>
      ) : (
        <Panel padding={false}>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Prefix</th>
                  <th>Status</th>
                  <th>Last used</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((item) => (
                  <tr key={item.id}>
                    <td className="font-medium text-slate-900">{item.name}</td>
                    <td>
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
                        {item.keyPrefix}…
                      </code>
                    </td>
                    <td>
                      <span
                        className={
                          item.status === 'ACTIVE'
                            ? 'badge-success'
                            : 'badge-neutral'
                        }
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="text-slate-500">
                      {item.lastUsedAt
                        ? new Date(item.lastUsedAt).toLocaleString()
                        : 'Never'}
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn-danger btn-sm"
                        onClick={() => revoke(item.id)}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}
