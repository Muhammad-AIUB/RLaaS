'use client';

import { useParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { AlgorithmBarChart } from '@/components/charts';
import {
  ErrorState,
  LoadingState,
} from '@/components/feedback';
import { PageHeader, ProjectTabs } from '@/components/layout';
import { MetricCard, Panel, PanelHeader } from '@/components/ui';
import { analyticsApi } from '@/lib/api';
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

  if (analytics.loading) {
    return (
      <>
        <PageHeader eyebrow="Insights" title="Analytics" />
        <ProjectTabs projectId={projectId} />
        <LoadingState label="Loading analytics…" />
      </>
    );
  }

  if (analytics.error) {
    return (
      <>
        <PageHeader eyebrow="Insights" title="Analytics" />
        <ProjectTabs projectId={projectId} />
        <ErrorState message={analytics.error} />
      </>
    );
  }

  if (!analytics.data) {
    return <ErrorState message="Analytics data is unavailable." />;
  }

  const { overview, ips, endpoints, algorithms, logs, snapshots } =
    analytics.data;

  return (
    <>
      <PageHeader
        crumbs={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${projectId}`, label: 'Project' },
          { label: 'Analytics' },
        ]}
        eyebrow="Insights"
        title="Analytics"
        description="Inspect trends, top offenders, and algorithm performance."
      />
      <ProjectTabs projectId={projectId} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total requests"
          value={overview.totalRequests.toLocaleString()}
          tone="brand"
        />
        <MetricCard
          label="Allowed"
          value={overview.allowedRequests.toLocaleString()}
          tone="success"
        />
        <MetricCard
          label="Blocked"
          value={overview.blockedRequests.toLocaleString()}
          tone="danger"
        />
        <MetricCard
          label="Block rate"
          value={`${overview.blockRate}%`}
          tone="warning"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-3">
          <PanelHeader eyebrow="Performance" title="Algorithm comparison" />
          <div className="mt-4">
            <AlgorithmBarChart data={algorithms} />
          </div>
        </Panel>
        <Panel className="lg:col-span-2">
          <PanelHeader
            eyebrow="Snapshots"
            title="Generate a window"
            description="Freeze a reporting window for compliance or sharing."
          />
          <form
            className="mt-5 flex flex-wrap items-end gap-3"
            onSubmit={generateSnapshot}
          >
            <div className="min-w-[160px] flex-1">
              <label className="label" htmlFor="snapshot-window">
                Window
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
              {pending ? 'Generating…' : 'Generate'}
            </button>
          </form>
          <div className="mt-5 space-y-2">
            {snapshots.slice(0, 4).length === 0 ? (
              <p className="text-xs text-slate-500">No snapshots yet.</p>
            ) : (
              snapshots.slice(0, 4).map((snapshot) => (
                <div
                  key={snapshot.id}
                  className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-800">
                      {snapshot.window}
                    </p>
                    <span className="badge-neutral">snapshot</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(snapshot.periodStart).toLocaleString()} →{' '}
                    {new Date(snapshot.periodEnd).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader eyebrow="Top offenders" title="IP addresses" />
          <ul className="mt-4 divide-y divide-slate-100">
            {ips.length === 0 ? (
              <li className="py-3 text-sm text-slate-500">No data yet.</li>
            ) : (
              ips.map((item) => (
                <li
                  key={item.ip}
                  className="flex items-center justify-between py-2.5 text-sm"
                >
                  <span className="font-mono text-slate-700">{item.ip}</span>
                  <span className="badge-neutral">{item.requests}</span>
                </li>
              ))
            )}
          </ul>
        </Panel>
        <Panel>
          <PanelHeader eyebrow="Most used" title="Endpoints" />
          <ul className="mt-4 divide-y divide-slate-100">
            {endpoints.length === 0 ? (
              <li className="py-3 text-sm text-slate-500">No data yet.</li>
            ) : (
              endpoints.map((item) => (
                <li
                  key={`${item.method}-${item.endpoint}`}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate">
                      <span className="badge-info mr-2 !py-0 !text-2xs">
                        {item.method}
                      </span>
                      <span className="font-mono text-slate-800">
                        {item.endpoint}
                      </span>
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">
                    {item.requests}
                  </span>
                </li>
              ))
            )}
          </ul>
        </Panel>
      </div>

      <div className="mt-6">
        <Panel padding={false}>
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
                Activity
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">
                Recent request logs
              </h2>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>IP</th>
                  <th>Endpoint</th>
                  <th>Decision</th>
                  <th>Algorithm</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-slate-500">
                      No requests yet.
                    </td>
                  </tr>
                ) : (
                  logs.map((item) => (
                    <tr key={item.id}>
                      <td className="whitespace-nowrap text-xs text-slate-500">
                        {new Date(item.createdAt).toLocaleString()}
                      </td>
                      <td className="font-mono text-xs">{item.ipAddress}</td>
                      <td className="min-w-[200px]">
                        <span className="badge-info mr-2 !py-0 !text-2xs">
                          {item.method}
                        </span>
                        <span className="font-mono text-xs">
                          {item.endpoint}
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            item.decision === 'BLOCKED'
                              ? 'badge-danger'
                              : 'badge-success'
                          }
                        >
                          {item.decision}
                        </span>
                      </td>
                      <td className="text-xs text-slate-600">
                        {item.algorithm}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
