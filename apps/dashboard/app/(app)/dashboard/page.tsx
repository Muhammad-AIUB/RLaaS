'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlgorithmBarChart } from '@/components/charts/algorithm-bar-chart';
import { RequestsDonut } from '@/components/charts/requests-donut';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { MetricCard } from '@/components/metric-card';
import { PageHeader } from '@/components/page-header';
import { Panel, PanelHeader } from '@/components/panel';
import { apiFetch } from '@/lib/api-client';
import {
  AlgorithmPerformanceRecord,
  AnalyticsOverview,
  ProjectSummary,
  RequestLogRecord,
  TopEndpointRecord,
  TopIpRecord,
} from '@/lib/types';

export default function DashboardOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [topIps, setTopIps] = useState<TopIpRecord[]>([]);
  const [topEndpoints, setTopEndpoints] = useState<TopEndpointRecord[]>([]);
  const [algorithms, setAlgorithms] = useState<AlgorithmPerformanceRecord[]>([]);
  const [logs, setLogs] = useState<RequestLogRecord[]>([]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const projects = await apiFetch<ProjectSummary[]>('/api/proxy/projects');
        const firstProject = projects[0] ?? null;
        setProject(firstProject);

        if (!firstProject) {
          return;
        }

        const [overviewData, ipData, endpointData, algorithmData, logData] =
          await Promise.all([
            apiFetch<AnalyticsOverview>(
              `/api/proxy/projects/${firstProject.id}/analytics/overview`,
            ),
            apiFetch<TopIpRecord[]>(
              `/api/proxy/projects/${firstProject.id}/analytics/top-ips?limit=5`,
            ),
            apiFetch<TopEndpointRecord[]>(
              `/api/proxy/projects/${firstProject.id}/analytics/top-endpoints?limit=5`,
            ),
            apiFetch<AlgorithmPerformanceRecord[]>(
              `/api/proxy/projects/${firstProject.id}/analytics/algorithms`,
            ),
            apiFetch<RequestLogRecord[]>(
              `/api/proxy/projects/${firstProject.id}/analytics/logs?limit=8`,
            ),
          ]);

        setOverview(overviewData);
        setTopIps(ipData);
        setTopEndpoints(endpointData);
        setAlgorithms(algorithmData);
        setLogs(logData);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error ? caughtError.message : 'Failed to load dashboard',
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
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

  if (!project || !overview) {
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

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Operator dashboard"
        description={
          <>
            Showing data for{' '}
            <span className="font-medium text-slate-700">{project.name}</span> ·{' '}
            <span className="badge-neutral !ml-1 !py-0">{project.environment}</span>
          </>
        }
        actions={
          <Link
            href={`/projects/${project.id}/analytics`}
            className="btn-secondary"
          >
            Full analytics
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </Link>
        }
      />

      {/* Metrics */}
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

      {/* Charts */}
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

      {/* Lists */}
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
