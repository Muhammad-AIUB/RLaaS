'use client';

import { FormEvent, useState } from 'react';
import { useParams } from 'next/navigation';
import { ErrorState, LoadingState } from '@/components/feedback';
import { AlertIcon } from '@/components/icons';
import { PageHeader, ProjectTabs } from '@/components/layout';
import { Panel, PanelHeader } from '@/components/ui';
import { apiKeysApi } from '@/lib/api';
import { useAsyncResource } from '@/lib/hooks';
import type { ApiKeyRecord, CreateApiKeyInput } from '@/lib/types';

export default function ApiKeysPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId as string;

  const keys = useAsyncResource<ApiKeyRecord[]>(
    () => apiKeysApi.list(projectId),
    [projectId],
  );

  const [revealedKey, setRevealedKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    keys.setError('');

    const form = event.currentTarget;
    const formData = new FormData(form);
    const input: CreateApiKeyInput = {
      name: String(formData.get('name') ?? ''),
      expiresAt: (formData.get('expiresAt') as string) || undefined,
    };

    try {
      const created = await apiKeysApi.create(projectId, input);
      setRevealedKey(created.key ?? '');
      form.reset();
      await keys.reload();
    } catch (caughtError) {
      keys.setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to create API key',
      );
    } finally {
      setPending(false);
    }
  }

  async function revoke(apiKeyId: string) {
    try {
      await apiKeysApi.revoke(projectId, apiKeyId);
      await keys.reload();
    } catch (caughtError) {
      keys.setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to revoke API key',
      );
    }
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(revealedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard not available — silently ignore */
    }
  }

  const records = keys.data ?? [];

  return (
    <>
      <PageHeader
        crumbs={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${projectId}`, label: 'Project' },
          { label: 'API Keys' },
        ]}
        eyebrow="Credentials"
        title="API keys"
        description="Issue keys for gateway calls and revoke them as soon as you suspect leakage."
      />
      <ProjectTabs projectId={projectId} />

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
            <label className="label" htmlFor="api-key-name">
              Name
            </label>
            <input
              id="api-key-name"
              name="name"
              required
              className="field"
              placeholder="Primary production key"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="label" htmlFor="api-key-expires">
              Expires (optional)
            </label>
            <input
              id="api-key-expires"
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
              <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-amber-900">
                  Copy this key now — it won't be shown again.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-md border border-amber-200 bg-white px-3 py-2 font-mono text-xs text-slate-800">
                    {revealedKey}
                  </code>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={copyKey}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Panel>

      {keys.error ? (
        <div className="mb-6">
          <ErrorState message={keys.error} />
        </div>
      ) : null}

      {keys.loading ? (
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
                      {item.status !== 'REVOKED' ? (
                        <button
                          type="button"
                          className="btn-danger btn-sm"
                          onClick={() => revoke(item.id)}
                        >
                          Revoke
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
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
