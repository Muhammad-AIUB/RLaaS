'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ErrorState, LoadingState } from '@/components/feedback';
import { AlertIcon } from '@/components/icons';
import { PageHeader, ProjectTabs } from '@/components/layout';
import { Panel, PanelHeader } from '@/components/ui';
import { apiKeysApi, gatewayTesterApi } from '@/lib/api';
import { useAsyncResource } from '@/lib/hooks';
import type {
  ApiKeyRecord,
  GatewayTesterInput,
  GatewayTesterTimelineItem,
} from '@/lib/types';

const METHODS = ['GET', 'POST', 'PUT', 'DELETE'] as const;
const USER_TIERS = ['free', 'pro', 'enterprise'] as const;
const SIMULATION_REQUESTS = 20;

const DEFAULT_REQUEST: Omit<GatewayTesterInput, 'apiKeyId'> = {
  ip: '203.0.113.10',
  endpoint: '/api/orders',
  method: 'GET',
  userTier: 'free',
};

export default function GatewayTesterPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId as string;

  const apiKeys = useAsyncResource<ApiKeyRecord[]>(
    () => apiKeysApi.list(projectId),
    [projectId],
  );

  const activeKeys = useMemo(
    () => (apiKeys.data ?? []).filter((key) => key.status === 'ACTIVE'),
    [apiKeys.data],
  );
  const [form, setForm] = useState<GatewayTesterInput>({
    apiKeyId: '',
    ...DEFAULT_REQUEST,
  });
  const [pending, setPending] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState('');
  const [lastResult, setLastResult] =
    useState<GatewayTesterTimelineItem | null>(null);
  const [timeline, setTimeline] = useState<GatewayTesterTimelineItem[]>([]);

  const selectedApiKeyId =
    form.apiKeyId || activeKeys[0]?.id || apiKeys.data?.[0]?.id || '';
  const selectedKey = (apiKeys.data ?? []).find(
    (key) => key.id === selectedApiKeyId,
  );
  const requestReady = Boolean(selectedApiKeyId);
  const summary = buildSimulationSummary(timeline);

  function updateField<K extends keyof GatewayTesterInput>(
    key: K,
    value: GatewayTesterInput[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function buildInput(): GatewayTesterInput {
    return {
      ...form,
      apiKeyId: selectedApiKeyId,
      method: form.method.toUpperCase(),
      userTier: form.userTier.toLowerCase(),
    };
  }

  async function sendOne(index = 1) {
    const input = buildInput();
    const startedAt = performance.now();
    const result = await gatewayTesterApi.check(projectId, input);
    const latencyMs = performance.now() - startedAt;

    return {
      ...result,
      index,
      latencyMs,
      timestamp: new Date().toISOString(),
    };
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');

    try {
      const result = await sendOne();
      setLastResult(result);
      setTimeline([result]);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to send test request',
      );
    } finally {
      setPending(false);
    }
  }

  async function simulateTraffic() {
    setSimulating(true);
    setError('');
    setTimeline([]);

    const results: GatewayTesterTimelineItem[] = [];

    try {
      for (let index = 1; index <= SIMULATION_REQUESTS; index += 1) {
        const result = await sendOne(index);
        results.push(result);
        setLastResult(result);
        setTimeline([...results]);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to simulate traffic',
      );
    } finally {
      setSimulating(false);
    }
  }

  return (
    <>
      <PageHeader
        crumbs={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${projectId}`, label: 'Project' },
          { label: 'Gateway Tester' },
        ]}
        eyebrow="Traffic lab"
        title="Gateway Tester"
        description="Send real gateway checks through your API keys and watch rules, algorithms, request logs, and analytics respond."
      />
      <ProjectTabs projectId={projectId} />

      {apiKeys.error || error ? (
        <div className="mb-6">
          <ErrorState message={apiKeys.error || error} />
        </div>
      ) : null}

      {apiKeys.loading ? (
        <LoadingState label="Loading API keys..." />
      ) : activeKeys.length === 0 ? (
        <Panel>
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <AlertIcon className="h-6 w-6" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">
              Create an active API key first
            </h2>
            <p className="mt-1.5 max-w-md text-sm text-slate-500">
              Gateway Tester uses real project keys, so revoked keys and missing
              keys cannot be used for traffic simulation.
            </p>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <Panel>
            <PanelHeader
              eyebrow="Request builder"
              title="Shape a gateway request"
              description="Choose a live key, request identity, endpoint, method, and customer tier."
            />
            <form className="mt-5 grid gap-4" onSubmit={handleSend}>
              <div>
                <label className="label" htmlFor="tester-api-key">
                  API Key
                </label>
                <select
                  id="tester-api-key"
                  className="field"
                  value={selectedApiKeyId}
                  onChange={(event) => updateField('apiKeyId', event.target.value)}
                >
                  {activeKeys.map((key) => (
                    <option key={key.id} value={key.id}>
                      {key.name} - {key.keyPrefix}
                    </option>
                  ))}
                </select>
                {selectedKey ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Selected key is {selectedKey.status.toLowerCase()} and will
                    update analytics as real gateway traffic.
                  </p>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="tester-ip">
                    IP Address
                  </label>
                  <input
                    id="tester-ip"
                    className="field"
                    value={form.ip}
                    onChange={(event) => updateField('ip', event.target.value)}
                    placeholder="203.0.113.10"
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="tester-endpoint">
                    Endpoint Path
                  </label>
                  <input
                    id="tester-endpoint"
                    className="field"
                    value={form.endpoint}
                    onChange={(event) =>
                      updateField('endpoint', event.target.value)
                    }
                    placeholder="/api/orders"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="tester-method">
                    HTTP Method
                  </label>
                  <select
                    id="tester-method"
                    className="field"
                    value={form.method}
                    onChange={(event) => updateField('method', event.target.value)}
                  >
                    {METHODS.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="tester-tier">
                    User Tier
                  </label>
                  <select
                    id="tester-tier"
                    className="field"
                    value={form.userTier}
                    onChange={(event) =>
                      updateField('userTier', event.target.value)
                    }
                  >
                    {USER_TIERS.map((tier) => (
                      <option key={tier} value={tier}>
                        {tier}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={!requestReady || pending || simulating}
                >
                  {pending ? 'Sending...' : 'Send Test Request'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={simulateTraffic}
                  disabled={!requestReady || pending || simulating}
                >
                  {simulating ? 'Simulating...' : 'Simulate Traffic'}
                </button>
              </div>
            </form>
          </Panel>

          <LiveResultCard result={lastResult} />

          <Panel className="xl:col-span-2">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <PanelHeader
                eyebrow="Simulation summary"
                title="20-request traffic run"
                description="Sequential requests use the same key and request shape, making rate-limit thresholds easy to see."
              />
              {timeline.length > 0 ? (
                <span className="badge-brand">
                  {timeline.length}/{SIMULATION_REQUESTS} sent
                </span>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <SummaryTile label="Total" value={summary.total} />
              <SummaryTile label="Allowed" value={summary.allowed} tone="success" />
              <SummaryTile label="Blocked" value={summary.blocked} tone="danger" />
              <SummaryTile label="Block rate" value={`${summary.blockRate}%`} />
              <SummaryTile label="Avg latency" value={`${summary.avgLatency}ms`} />
            </div>

            <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
              {timeline.length === 0 ? (
                <div className="bg-slate-50/60 px-4 py-8 text-center text-sm text-slate-500">
                  Run a simulation to see each request transition from allowed
                  to blocked as the active rule is consumed.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {timeline.map((item) => (
                    <li
                      key={`${item.index}-${item.timestamp}`}
                      className="grid gap-3 px-4 py-3 sm:grid-cols-[80px_120px_minmax(0,1fr)_120px]"
                    >
                      <span className="text-sm font-semibold text-slate-900">
                        #{item.index}
                      </span>
                      <span
                        className={item.allowed ? 'badge-success' : 'badge-danger'}
                      >
                        {item.allowed ? 'ALLOWED' : 'BLOCKED'}
                      </span>
                      <span className="min-w-0 truncate text-sm text-slate-600">
                        {item.ruleName ?? 'Default global rule'} - remaining{' '}
                        {item.remaining}
                      </span>
                      <span className="text-sm text-slate-500 sm:text-right">
                        {item.latencyMs.toFixed(0)}ms
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}

function LiveResultCard({
  result,
}: {
  result: GatewayTesterTimelineItem | null;
}) {
  return (
    <Panel>
      <PanelHeader
        eyebrow="Live response"
        title="Gateway decision"
        description="The response below is returned by the same engine used for real customer traffic."
      />

      {result ? (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Status
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">
                {result.allowed ? 'Allowed' : 'Blocked'}
              </p>
            </div>
            <span className={result.allowed ? 'badge-success' : 'badge-danger'}>
              {result.allowed ? 'ALLOWED' : 'BLOCKED'}
            </span>
          </div>

          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <ResultMetric label="allowed" value={String(result.allowed)} />
            <ResultMetric label="limit" value={result.limit} />
            <ResultMetric label="remaining" value={result.remaining} />
            <ResultMetric label="retryAfter" value={`${result.retryAfter}s`} />
            <ResultMetric label="algorithm" value={result.algorithm} />
            <ResultMetric label="reason" value={result.reason ?? 'none'} />
            <ResultMetric
              label="evaluated rule"
              value={result.ruleName ?? 'Default global rule'}
            />
            <ResultMetric
              label="response latency"
              value={`${result.latencyMs.toFixed(0)}ms`}
            />
          </dl>

          <p className="mt-4 text-xs text-slate-500">
            Request timestamp: {new Date(result.timestamp).toLocaleString()}
          </p>
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">
            No gateway response yet
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Send a request or run a traffic simulation to see the live decision
            payload.
          </p>
        </div>
      )}
    </Panel>
  );
}

function ResultMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white px-3 py-2.5">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold text-slate-900">
        {value}
      </dd>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'success' | 'danger';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-emerald-700'
      : tone === 'danger'
        ? 'text-red-700'
        : 'text-slate-950';

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function buildSimulationSummary(timeline: GatewayTesterTimelineItem[]) {
  const total = timeline.length;
  const allowed = timeline.filter((item) => item.allowed).length;
  const blocked = total - allowed;
  const blockRate = total === 0 ? 0 : Math.round((blocked / total) * 100);
  const avgLatency =
    total === 0
      ? 0
      : Math.round(
          timeline.reduce((sum, item) => sum + item.latencyMs, 0) / total,
        );

  return {
    total,
    allowed,
    blocked,
    blockRate,
    avgLatency,
  };
}
