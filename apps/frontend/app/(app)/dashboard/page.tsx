'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlgorithmBarChart, RequestsDonut } from '@/components/charts';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/feedback';
import { ArrowRightIcon } from '@/components/icons';
import { PageHeader } from '@/components/layout';
import { MetricCard, Panel, PanelHeader } from '@/components/ui';
import { analyticsApi, projectsApi } from '@/lib/api';
import {
  AlgorithmPerformanceRecord,
  AnalyticsOverview,
  ProjectSummary,
  RequestLogRecord,
  TopEndpointRecord,
  TopIpRecord,
} from '@/lib/types';

interface DashboardData {
  project: ProjectSummary;
  overview: AnalyticsOverview;
  topIps: TopIpRecord[];
  topEndpoints: TopEndpointRecord[];
  algorithms: AlgorithmPerformanceRecord[];
  logs: RequestLogRecord[];
}

export default function DashboardOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasProjects, setHasProjects] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const projects = await projectsApi.list();
        const project = projects[0] ?? null;

        if (cancelled) return;

        if (!project) {
          setHasProjects(false);
          setData(null);
          return;
        }

        const [overview, topIps, topEndpoints, algorithms, logs] =
          await Promise.all([
            analyticsApi.overview(project.id),
            analyticsApi.topIps(project.id, 5),
            analyticsApi.topEndpoints(project.id, 5),
            analyticsApi.algorithms(project.id),
            analyticsApi.logs(project.id, 8),
          ]);

        if (cancelled) return;

        setHasProjects(true);
        setData({ project, overview, topIps, topEndpoints, algorithms, logs });
      } catch (caughtError) {
        if (cancelled) return;
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Failed to load dashboard',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <>
        <PageHeader
          eyebrow="Overview"
          title="Operator dashboard"
          description="Real-time view of how your APIs are being protected."
        />
        <LoadingState label="Loading the operator overview…" />
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader eyebrow="Overview" title="Operator dashboard" />
        <ErrorState message={error} />
      </>
    );
  }

  if (!hasProjects || !data) {
    return (
      <>
        <PageHeader eyebrow="Overview" title="Operator dashboard" />
        <EmptyState
          title="No projects yet"
          description="Create your first protected API project to start generating keys, rules, and analytics."
          href="/projects"
          actionLabel="Create a project"
        />
      </>
    );
  }

  const { project, overview, topIps, topEndpoints, algorithms, logs } = data;

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Operator dashboard"
        description={
          <>
            Showing data for{' '}
            <span className="font-medium text-slate-700">{project.name}</span> ·{' '}
            <span className="badge-neutral !ml-1 !py-0">
              {project.environment}
            </span>
          </>
        }
        actions={
          <Link
            href={`/projects/${project.id}/analytics`}
            className="btn-secondary"
          >
            Full analytics
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        }
      />

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
          <PanelHeader
            eyebrow="Algorithm comparison"
            title="Throughput by strategy"
            description="How requests are distributed across active rate-limit algorithms."
          />
          <div className="mt-4">
            <AlgorithmBarChart data={algorithms} />
          </div>
        </Panel>
        <Panel className="lg:col-span-2">
          <PanelHeader
            eyebrow="Request outcomes"
            title="Allowed vs blocked"
          />
          <div className="mt-4">
            <RequestsDonut
              allowed={overview.allowedRequests}
              blocked={overview.blockedRequests}
            />
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel>
          <PanelHeader eyebrow="Top offenders" title="IP addresses" />
          <ul className="mt-4 divide-y divide-slate-100">
            {topIps.length === 0 ? (
              <li className="py-3 text-sm text-slate-500">No data yet.</li>
            ) : (
              topIps.map((item) => (
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
            {topEndpoints.length === 0 ? (
              <li className="py-3 text-sm text-slate-500">No data yet.</li>
            ) : (
              topEndpoints.map((item) => (
                <li
                  key={`${item.method}-${item.endpoint}`}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">
                      <span className="badge-info mr-2 !py-0 !text-2xs">
                        {item.method}
                      </span>
                      <span className="font-mono">{item.endpoint}</span>
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
        <Panel>
          <PanelHeader eyebrow="Activity" title="Recent requests" />
          <ul className="mt-4 space-y-2.5">
            {logs.length === 0 ? (
              <li className="text-sm text-slate-500">No activity yet.</li>
            ) : (
              logs.slice(0, 5).map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-mono text-xs text-slate-800">
                      {item.endpoint}
                    </p>
                    <span
                      className={
                        item.decision === 'BLOCKED'
                          ? 'badge-danger !py-0'
                          : 'badge-success !py-0'
                      }
                    >
                      {item.decision}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {item.method} · {item.ipAddress} · {item.algorithm}
                  </p>
                </li>
              ))
            )}
          </ul>
        </Panel>
      </div>
    </>
  );
}
