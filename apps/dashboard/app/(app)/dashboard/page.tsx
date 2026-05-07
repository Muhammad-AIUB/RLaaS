'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlgorithmBarChart } from '@/components/charts/algorithm-bar-chart';
import { RequestsDonut } from '@/components/charts/requests-donut';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { MetricCard } from '@/components/metric-card';
import { Panel } from '@/components/panel';
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
        setError(caughtError instanceof Error ? caughtError.message : 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  if (loading) {
    return <LoadingState label="Loading the operator overview..." />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!project || !overview) {
    return (
      <EmptyState
        title="No projects yet"
        description="Create your first protected API project to start generating keys, rules, and analytics."
        href="/projects"
        actionLabel="Open projects"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total requests" value={overview.totalRequests.toLocaleString()} />
        <MetricCard label="Allowed requests" value={overview.allowedRequests.toLocaleString()} accent="#235347" />
        <MetricCard label="Blocked requests" value={overview.blockedRequests.toLocaleString()} accent="#d95d39" />
        <MetricCard label="Block rate" value={`${overview.blockRate}%`} accent="#9dc08b" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-pine">Algorithm comparison</p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">Throughput by strategy</h2>
            </div>
            <Link className="text-sm font-medium text-pine" href={`/projects/${project.id}/analytics`}>
              Full analytics
            </Link>
          </div>
          <div className="mt-6">
            <AlgorithmBarChart data={algorithms} />
          </div>
        </Panel>
        <Panel>
          <p className="text-xs uppercase tracking-[0.32em] text-pine">Request outcomes</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">Allowed vs blocked</h2>
          <RequestsDonut allowed={overview.allowedRequests} blocked={overview.blockedRequests} />
        </Panel>
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Panel>
          <p className="text-xs uppercase tracking-[0.32em] text-pine">Top offending IPs</p>
          <div className="mt-4 space-y-3">
            {topIps.map((item) => (
              <div key={item.ip} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                <span className="text-sm text-slate-700">{item.ip}</span>
                <span className="text-sm font-medium text-ink">{item.requests}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <p className="text-xs uppercase tracking-[0.32em] text-pine">Most used endpoints</p>
          <div className="mt-4 space-y-3">
            {topEndpoints.map((item) => (
              <div key={`${item.method}-${item.endpoint}`} className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-sm font-medium text-ink">
                  {item.method} {item.endpoint}
                </p>
                <p className="mt-1 text-sm text-slate-600">{item.requests} requests</p>
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <p className="text-xs uppercase tracking-[0.32em] text-pine">Recent request logs</p>
          <div className="mt-4 space-y-3">
            {logs.slice(0, 5).map((item) => (
              <div key={item.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink">{item.endpoint}</p>
                  <span className={item.decision === 'BLOCKED' ? 'text-ember' : 'text-pine'}>
                    {item.decision}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {item.method} · {item.ipAddress} · {item.algorithm}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
