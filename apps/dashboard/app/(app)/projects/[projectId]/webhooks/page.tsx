'use client';

import { FormEvent, useState } from 'react';
import { useParams } from 'next/navigation';
import { ErrorState, LoadingState } from '@/components/feedback';
import { PageHeader, ProjectTabs } from '@/components/layout';
import { Panel, PanelHeader } from '@/components/ui';
import { webhooksApi } from '@/lib/api';
import { useAsyncResource } from '@/lib/hooks';
import type { CreateWebhookInput, WebhookEndpointRecord } from '@/lib/types';

function readNumber(form: FormData, key: string, fallback: number): number {
  const raw = form.get(key);
  if (raw === null || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export default function WebhooksPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId as string;

  const webhooks = useAsyncResource<WebhookEndpointRecord[]>(
    () => webhooksApi.list(projectId),
    [projectId],
  );
  const [pending, setPending] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    webhooks.setError('');

    const form = event.currentTarget;
    const formData = new FormData(form);
    const input: CreateWebhookInput = {
      name: String(formData.get('name') ?? ''),
      url: String(formData.get('url') ?? ''),
      blockedRequestsThreshold: readNumber(
        formData,
        'blockedRequestsThreshold',
        25,
      ),
      windowSeconds: readNumber(formData, 'windowSeconds', 300),
      cooldownSeconds: readNumber(formData, 'cooldownSeconds', 300),
    };

    try {
      await webhooksApi.create(projectId, input);
      form.reset();
      setShowForm(false);
      await webhooks.reload();
    } catch (caughtError) {
      webhooks.setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to create webhook',
      );
    } finally {
      setPending(false);
    }
  }

  async function remove(webhookId: string) {
    try {
      await webhooksApi.remove(projectId, webhookId);
      await webhooks.reload();
    } catch (caughtError) {
      webhooks.setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to delete webhook',
      );
    }
  }

  const list = webhooks.data ?? [];

  return (
    <>
      <PageHeader
        crumbs={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${projectId}`, label: 'Project' },
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
      <ProjectTabs projectId={projectId} />

      {showForm ? (
        <Panel className="mb-6">
          <PanelHeader eyebrow="Create" title="New webhook endpoint" />
          <form
            className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
            onSubmit={handleCreate}
          >
            <div>
              <label className="label">Name</label>
              <input
                className="field"
                name="name"
                required
                placeholder="Slack alerts"
              />
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
              <input
                className="field"
                name="blockedRequestsThreshold"
                type="number"
                defaultValue="25"
              />
            </div>
            <div>
              <label className="label">Window (s)</label>
              <input
                className="field"
                name="windowSeconds"
                type="number"
                defaultValue="300"
              />
            </div>
            <div>
              <label className="label">Cooldown (s)</label>
              <input
                className="field"
                name="cooldownSeconds"
                type="number"
                defaultValue="300"
              />
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-4">
              <button type="submit" className="btn-primary" disabled={pending}>
                {pending ? 'Creating…' : 'Create webhook'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      ) : null}

      {webhooks.error ? (
        <div className="mb-6">
          <ErrorState message={webhooks.error} />
        </div>
      ) : null}

      {webhooks.loading ? (
        <LoadingState label="Loading webhooks…" />
      ) : list.length === 0 ? (
        <Panel>
          <p className="py-6 text-center text-sm text-slate-500">
            No webhooks configured yet.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4">
          {list.map((webhook) => (
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
                    {webhook.blockedRequestsThreshold} blocked /{' '}
                    {webhook.windowSeconds}s · cooldown{' '}
                    {webhook.cooldownSeconds}s
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
