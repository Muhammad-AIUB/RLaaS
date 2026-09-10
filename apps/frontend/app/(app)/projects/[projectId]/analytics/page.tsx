'use client';

import { useParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { AlgorithmComparison } from '@/components/charts';
import { ErrorState, LoadingState } from '@/components/feedback';
import { PageHeader, ProjectTabs } from '@/components/layout';
import { MetricCard, Panel, PanelHeader, RankRow, SplitBar } from '@/components/ui';
import { analyticsApi } from '@/lib/api';
import {
  algorithmLabel,
  formatAbsolute,
  formatCount,
  formatDate,
  formatPercent,
  formatRelativeTime,
  humanizeEnum,
} from '@/lib/format';
import { useAsyncResource } from '@/lib/hooks';
import type {
  AlgorithmPerformanceRecord,
  AnalyticsOverview,
  CreateSnapshotInput,
  RequestLogRecord,
  SnapshotRecord,
  TopEndpointRecord,
  TopIpRecord,
} from '@/lib/types';

interface AnalyticsPayload {
  overview: AnalyticsOverview;
  ips: TopIpRecord[];
  endpoints: TopEndpointRecord[];
  algorithms: AlgorithmPerformanceRecord[];
  logs: RequestLogRecord[];
  snapshots: SnapshotRecord[];
}

async function loadAnalytics(projectId: string): Promise<AnalyticsPayload> {
  const [overview, ips, endpoints, algorithms, logs, snapshots] =
    await Promise.all([
      analyticsApi.overview(projectId),
      analyticsApi.topIps(projectId, 10),
      analyticsApi.topEndpoints(projectId, 10),
      analyticsApi.algorithms(projectId),
      analyticsApi.logs(projectId, 15),
      analyticsApi.snapshots(projectId, 10),
    ]);
  return { overview, ips, endpoints, algorithms, logs, snapshots };
}

export default function ProjectAnalyticsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId as string;

  const analytics = useAsyncResource<AnalyticsPayload>(
    () => loadAnalytics(projectId),
    [projectId],
  );
  const [pending, setPending] = useState(false);

  async function generateSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    analytics.setError('');

    const formData = new FormData(event.currentTarget);
    const input: CreateSnapshotInput = {
      window: String(formData.get('window') ?? 'DAILY'),
    };

    try {
      await analyticsApi.createSnapshot(projectId, input);
      await analytics.reload();
    } catch (caughtError) {
      analytics.setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to generate snapshot',
      );
    } finally {
      setPending(false);
    }
  }

  const header = (
    <>
      <PageHeader
        crumbs={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${projectId}`, label: 'Project' },
          { label: 'Analytics' },
        ]}
        eyebrow="Insights"
        title="Analytics"
        description="Who is calling, what they are calling, and which rule decided."
      />
      <ProjectTabs projectId={projectId} />
    </>
  );

  if (analytics.loading) {
    return (
      <>
        {header}
        <LoadingState label="Loading analytics…" />
      </>
    );
  }

  if (analytics.error) {
    return (
      <>
        {header}
        <ErrorState message={analytics.error} />
      </>
    );
  }

  if (!analytics.data) {
    return (
      <>
        {header}
        <ErrorState message="Analytics data is unavailable." />
      </>
    );
  }

  const { overview, ips, endpoints, algorithms, logs, snapshots } =
    analytics.data;

  const maxIp = ips[0]?.requests ?? 0;
  const maxEndpoint = endpoints.reduce(
    (max, item) => Math.max(max, item.requests),
    0,
  );

  return (
    <>
      {header}

      {/* Two counts and a rate. `Total` is the sum of the other two, so it sits
          apart from them rather than being a fourth peer tile. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Requests"
          value={formatCount(overview.totalRequests)}
          hint="Decisions made by the gateway"
        />
        <MetricCard
          label="Blocked"
          value={formatCount(overview.blockedRequests)}
          tone="danger"
          hint={`${formatPercent(overview.blockRate)} of all requests`}
        />
        <MetricCard
          label="Allowed"
          value={formatCount(overview.allowedRequests)}
          tone="success"
          hint={`${formatPercent(100 - overview.blockRate)} of all requests`}
        />
      </div>

      <Panel className="mt-4">
        <SplitBar
          allowed={overview.allowedRequests}
          blocked={overview.blockedRequests}
        />
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-3">
          <PanelHeader
            eyebrow="Performance"
            title="Algorithm comparison"
            description="Share of traffic and decision latency, per strategy in use."
          />
          <div className="mt-5">
            <AlgorithmComparison data={algorithms} />
          </div>
        </Panel>

        <Panel className="lg:col-span-2">
          <PanelHeader
            eyebrow="Snapshots"
            title="Freeze a window"
            description="Captures the current totals for a period so they can be shared or audited later."
          />
          <form
            className="mt-5 flex flex-wrap items-end gap-3"
            onSubmit={generateSnapshot}
          >
            <div className="min-w-[150px] flex-1">
              <label className="label" htmlFor="snapshot-window">
                Period
              </label>
              <select
                id="snapshot-window"
                className="field"
                name="window"
                defaultValue="DAILY"
              >
                <option value="HOURLY">Hourly</option>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </div>
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? 'Capturing…' : 'Capture'}
            </button>
          </form>

          <div className="mt-5 space-y-1.5">
            {snapshots.length === 0 ? (
              <p className="text-xs text-slate-500">
                None captured yet. A snapshot records the totals at the moment
                you take it.
              </p>
            ) : (
              snapshots.slice(0, 4).map((snapshot) => (
                <div
                  key={snapshot.id}
                  className="flex items-baseline justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {humanizeEnum(snapshot.window)}
                    </p>
                    <p
                      className="truncate text-2xs text-slate-500"
                      title={`${formatAbsolute(snapshot.periodStart)} → ${formatAbsolute(snapshot.periodEnd)}`}
                    >
                      {formatDate(snapshot.periodStart)} → {formatDate(snapshot.periodEnd)}
                    </p>
                  </div>
                  <span className="num shrink-0 font-mono text-xs text-slate-600">
                    {formatCount(snapshot.totalRequests)}
                  </span>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel padding={false}>
          <div className="p-5 pb-3 sm:p-6 sm:pb-3">
            <PanelHeader
              eyebrow="Callers"
              title="Source addresses"
              description="Ranked by volume. The bar is each address's share of the busiest."
            />
          </div>
          {ips.length === 0 ? (
            <p className="px-5 pb-6 text-sm text-slate-500 sm:px-6">
              No requests recorded yet.
            </p>
          ) : (
            <ul className="px-2 pb-4">
              {ips.map((item) => (
                <RankRow
                  key={item.ip}
                  label={item.ip}
                  value={item.requests}
                  max={maxIp}
                  mono
                />
              ))}
            </ul>
          )}
        </Panel>

        <Panel padding={false}>
          <div className="p-5 pb-3 sm:p-6 sm:pb-3">
            <PanelHeader
              eyebrow="Traffic"
              title="Endpoints"
              description="Which paths the gateway is being asked about most."
            />
          </div>
          {endpoints.length === 0 ? (
            <p className="px-5 pb-6 text-sm text-slate-500 sm:px-6">
              No requests recorded yet.
            </p>
          ) : (
            <ul className="px-2 pb-4">
              {endpoints.map((item) => (
                <RankRow
                  key={`${item.method}-${item.endpoint}`}
                  label={`${item.method} ${item.endpoint}`}
                  value={item.requests}
                  max={maxEndpoint}
                  mono
                />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel className="mt-4" padding={false}>
        <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
          <p className="eyebrow">Activity</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">
            Latest decisions
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            The {logs.length} most recent requests the gateway ruled on.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl min-w-[46rem]">
            <thead>
              <tr>
                <th scope="col" className="w-24">When</th>
                <th scope="col">Decision</th>
                <th scope="col">Source</th>
                <th scope="col">Request</th>
                <th scope="col">Matched by</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    Nothing has hit the gateway yet.
                  </td>
                </tr>
              ) : (
                logs.map((item) => (
                  <tr key={item.id}>
                    <td
                      className="num whitespace-nowrap text-xs text-slate-500"
                      title={formatAbsolute(item.createdAt)}
                    >
                      {formatRelativeTime(item.createdAt)}
                    </td>
                    <td>
                      <span
                        className={
                          item.decision === 'BLOCKED'
                            ? 'badge-danger'
                            : 'badge-success'
                        }
                      >
                        {item.decision === 'BLOCKED' ? 'Blocked' : 'Allowed'}
                      </span>
                    </td>
                    <td className="font-mono text-xs text-slate-700">
                      {item.ipAddress}
                    </td>
                    <td className="font-mono text-xs text-slate-700">
                      <span className="text-slate-500">{item.method}</span>{' '}
                      {item.endpoint}
                    </td>
                    <td className="text-xs">
                      {/* The rule is the answer to "why was this blocked?", and
                          the log carries it — the old table showed only the
                          algorithm, which is the rule's implementation detail. */}
                      <span className="text-slate-700">
                        {item.rule?.name ?? 'No rule matched'}
                      </span>
                      <span className="block text-2xs text-slate-500">
                        {algorithmLabel(item.algorithm)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
