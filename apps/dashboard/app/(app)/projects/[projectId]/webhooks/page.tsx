'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { Panel, PanelHeader } from '@/components/panel';
import { ProjectTabs } from '@/components/project-tabs';
import { apiFetch } from '@/lib/api-client';
import { WebhookEndpointRecord } from '@/lib/types';

export default function WebhooksPage() {
  const params = useParams<{ projectId: string }>();
  const [webhooks, setWebhooks] = useState<WebhookEndpointRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  async function loadWebhooks() {
    try {
      setLoading(true);
      const data = await apiFetch<WebhookEndpointRecord[]>(
        `/api/proxy/projects/${params.projectId}/webhooks`,
      );
      setWebhooks(data);
      setError('');
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to load webhooks',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWebhooks();
  }, [params.projectId]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      await apiFetch<WebhookEndpointRecord>(
        `/api/proxy/projects/${params.projectId}/webhooks`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: formData.get('name'),
            url: formData.get('url'),
            blockedRequestsThreshold: Number(formData.get('blockedRequestsThreshold')),
            windowSeconds: Number(formData.get('windowSeconds')),
            cooldownSeconds: Number(formData.get('cooldownSeconds')),
          }),
        },
      );
      form.reset();
      setShowForm(false);
      await loadWebhooks();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to create webhook',
      );
    } finally {
      setPending(false);
    }
  }

  async function remove(webhookId: string) {
    try {
      await apiFetch<{ success: boolean }>(
        `/api/proxy/projects/${params.projectId}/webhooks/${webhookId}`,
        { method: 'DELETE' },
      );
      await loadWebhooks();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to delete webhook',
      );
    }
  }

  return (
    <>
      <PageHeader
        crumbs={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${params.projectId}`, label: 'Project' },
          { label: 'Webhooks' },
        ]}
        eyebrow="Alerts"
        title="Webhooks"
        description="Route blocked-activity spikes to external responders."
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowForm((s) => !s)}
          >
            {showForm ? 'Close' : 'New webhook'}
          </button>
        }
      />
      <ProjectTabs projectId={params.projectId as string} />

      {showForm ? (
        <Panel className="mb-6">
          <PanelHeader eyebrow="Create" title="New webhook endpoint" />
          <form
            className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
            onSubmit={handleCreate}
          >
            <div>
              <label className="label">Name</label>
              <input className="field" name="name" required placeholder="Slack alerts" />
            </div>
            <div className="sm:col-span-2 xl:col-span-3">
              <label className="label">URL</label>
              <input
                className="field"
                name="url"
                required
                placeholder="https://hooks.example.com/rlaas"
              />
            </div>
            <div>
              <label className="label">Blocked threshold</label>
              <input className="field" name="blockedRequestsThreshold" type="number" defaultValue="25" />
            </div>
            <div>
              <label className="label">Window (s)</label>
              <input className="field" name="windowSeconds" type="number" defaultValue="300" />
            </div>
            <div>
              <label className="label">Cooldown (s)</label>
              <input className="field" name="cooldownSeconds" type="number" defaultValue="300" />
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-4">
              <button type="submit" className="btn-primary" disabled={pending}>
                {pending ? 'Creating…' : 'Create webhook'}
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
        <LoadingState label="Loading webhooks…" />
      ) : webhooks.length === 0 ? (
        <Panel>
          <p className="py-6 text-center text-sm text-slate-500">
            No webhooks configured yet.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4">
          {webhooks.map((webhook) => (
            <Panel key={webhook.id}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900">
                      {webhook.name}
                    </h2>
                    <span className="badge-brand">{webhook.eventType}</span>
                  </div>
                  <p className="mt-2 break-all font-mono text-xs text-slate-600">
                    {webhook.url}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {webhook.blockedRequestsThreshold} blocked / {webhook.windowSeconds}s · cooldown {webhook.cooldownSeconds}s
                  </p>
                </div>
                <div>
                  <button
                    type="button"
                    className="btn-danger btn-sm"
                    onClick={() => remove(webhook.id)}
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
