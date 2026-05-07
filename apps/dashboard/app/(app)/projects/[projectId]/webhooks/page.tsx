'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { Panel } from '@/components/panel';
import { apiFetch } from '@/lib/api-client';
import { WebhookEndpointRecord } from '@/lib/types';

export default function WebhooksPage() {
  const params = useParams<{ projectId: string }>();
  const [webhooks, setWebhooks] = useState<WebhookEndpointRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function loadWebhooks() {
    try {
      setLoading(true);
      const data = await apiFetch<WebhookEndpointRecord[]>(
        `/api/proxy/projects/${params.projectId}/webhooks`,
      );
      setWebhooks(data);
      setError('');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to load webhooks');
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
    const formData = new FormData(event.currentTarget);

    try {
      await apiFetch<WebhookEndpointRecord>(`/api/proxy/projects/${params.projectId}/webhooks`, {
        method: 'POST',
        body: JSON.stringify({
          name: formData.get('name'),
          url: formData.get('url'),
          blockedRequestsThreshold: Number(formData.get('blockedRequestsThreshold')),
          windowSeconds: Number(formData.get('windowSeconds')),
          cooldownSeconds: Number(formData.get('cooldownSeconds')),
        }),
      });
      event.currentTarget.reset();
      await loadWebhooks();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to create webhook');
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
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to delete webhook');
    }
  }

  return (
    <div className="space-y-6">
      <Panel>
        <p className="text-xs uppercase tracking-[0.32em] text-pine">Webhooks</p>
        <h1 className="mt-3 text-3xl font-semibold text-ink">External alerts for blocked spikes.</h1>
        <form className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={handleCreate}>
          <input className="rounded-2xl border border-slate-200 px-4 py-3" name="name" placeholder="Webhook name" required />
          <input className="rounded-2xl border border-slate-200 px-4 py-3 xl:col-span-2" name="url" placeholder="https://hooks.example.com/rlaas" required />
          <input className="rounded-2xl border border-slate-200 px-4 py-3" name="blockedRequestsThreshold" type="number" defaultValue="25" />
          <input className="rounded-2xl border border-slate-200 px-4 py-3" name="windowSeconds" type="number" defaultValue="300" />
          <input className="rounded-2xl border border-slate-200 px-4 py-3" name="cooldownSeconds" type="number" defaultValue="300" />
          <div className="xl:col-span-4">
            <button className="rounded-full bg-pine px-5 py-3 text-sm font-medium text-white disabled:opacity-60" disabled={pending} type="submit">
              {pending ? 'Creating webhook...' : 'Create webhook'}
            </button>
          </div>
        </form>
      </Panel>
      {error ? <ErrorState message={error} /> : null}
      {loading ? (
        <LoadingState label="Loading webhooks..." />
      ) : (
        <div className="space-y-4">
          {webhooks.map((webhook) => (
            <Panel key={webhook.id}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold text-ink">{webhook.name}</h2>
                    <span className="rounded-full bg-sand px-3 py-1 text-xs uppercase tracking-[0.24em] text-pine">
                      {webhook.eventType}
                    </span>
                  </div>
                  <p className="mt-2 break-all text-sm text-slate-600">{webhook.url}</p>
                  <p className="mt-3 text-sm text-slate-500">
                    {webhook.blockedRequestsThreshold} blocked requests / {webhook.windowSeconds}s, cooldown {webhook.cooldownSeconds}s
                  </p>
                </div>
                <button
                  className="rounded-full border border-ember/30 px-4 py-2 text-sm text-ember transition hover:bg-ember hover:text-white"
                  onClick={() => remove(webhook.id)}
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
