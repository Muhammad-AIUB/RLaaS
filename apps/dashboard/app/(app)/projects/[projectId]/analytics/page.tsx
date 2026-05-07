'use client';

import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { AlgorithmBarChart } from '@/components/charts/algorithm-bar-chart';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { MetricCard } from '@/components/metric-card';
import { Panel } from '@/components/panel';
import { apiFetch } from '@/lib/api-client';
import {
  AlgorithmPerformanceRecord,
  AnalyticsOverview,
  RequestLogRecord,
  SnapshotRecord,
  TopEndpointRecord,
  TopIpRecord,
} from '@/lib/types';

export default function ProjectAnalyticsPage() {
  const params = useParams<{ projectId: string }>();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [ips, setIps] = useState<TopIpRecord[]>([]);
  const [endpoints, setEndpoints] = useState<TopEndpointRecord[]>([]);
  const [algorithms, setAlgorithms] = useState<AlgorithmPerformanceRecord[]>([]);
  const [logs, setLogs] = useState<RequestLogRecord[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      setLoading(true);
      const [overviewData, ipData, endpointData, algorithmData, logData, snapshotData] =
        await Promise.all([
          apiFetch<AnalyticsOverview>(
            `/api/proxy/projects/${params.projectId}/analytics/overview`,
          ),
          apiFetch<TopIpRecord[]>(
            `/api/proxy/projects/${params.projectId}/analytics/top-ips?limit=10`,
          ),
          apiFetch<TopEndpointRecord[]>(
            `/api/proxy/projects/${params.projectId}/analytics/top-endpoints?limit=10`,
          ),
          apiFetch<AlgorithmPerformanceRecord[]>(
            `/api/proxy/projects/${params.projectId}/analytics/algorithms`,
          ),
          apiFetch<RequestLogRecord[]>(
            `/api/proxy/projects/${params.projectId}/analytics/logs?limit=15`,
          ),
          apiFetch<SnapshotRecord[]>(
            `/api/proxy/projects/${params.projectId}/analytics/snapshots?limit=10`,
          ),
        ]);

      setOverview(overviewData);
      setIps(ipData);
      setEndpoints(endpointData);
      setAlgorithms(algorithmData);
      setLogs(logData);
      setSnapshots(snapshotData);
      setError('');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [params.projectId]);

  async function generateSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const formData = new FormData(event.currentTarget);

    try {
      await apiFetch<SnapshotRecord>(
        `/api/proxy/projects/${params.projectId}/analytics/snapshots`,
        {
          method: 'POST',
          body: JSON.stringify({
            window: formData.get('window'),
          }),
        },
      );
      await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to generate snapshot');
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return <LoadingState label="Loading analytics..." />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!overview) {
    return <ErrorState message="Analytics data is unavailable." />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total requests" value={overview.totalRequests.toLocaleString()} />
        <MetricCard label="Allowed" value={overview.allowedRequests.toLocaleString()} accent="#235347" />
        <MetricCard label="Blocked" value={overview.blockedRequests.toLocaleString()} accent="#d95d39" />
        <MetricCard label="Block rate" value={`${overview.blockRate}%`} accent="#9dc08b" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <p className="text-xs uppercase tracking-[0.32em] text-pine">Algorithm performance</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">Compare strategy load</h2>
          <div className="mt-6">
            <AlgorithmBarChart data={algorithms} />
          </div>
        </Panel>
        <Panel>
          <p className="text-xs uppercase tracking-[0.32em] text-pine">Snapshot generation</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">Freeze a reporting window</h2>
          <form className="mt-6 flex flex-wrap gap-3" onSubmit={generateSnapshot}>
            <select className="rounded-2xl border border-slate-200 px-4 py-3" name="window" defaultValue="DAILY">
              <option value="HOURLY">Hourly</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
            <button className="rounded-full bg-pine px-5 py-3 text-sm font-medium text-white disabled:opacity-60" disabled={pending} type="submit">
              {pending ? 'Generating...' : 'Generate snapshot'}
            </button>
          </form>
          <div className="mt-6 space-y-3">
            {snapshots.slice(0, 4).map((snapshot) => (
              <div key={snapshot.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-sm font-medium text-ink">{snapshot.window}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(snapshot.periodStart).toLocaleString()} to{' '}
                  {new Date(snapshot.periodEnd).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <p className="text-xs uppercase tracking-[0.32em] text-pine">Top offending IPs</p>
          <div className="mt-4 space-y-3">
            {ips.map((item) => (
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
            {endpoints.map((item) => (
              <div key={`${item.method}-${item.endpoint}`} className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-sm font-medium text-ink">
                  {item.method} {item.endpoint}
                </p>
                <p className="mt-1 text-xs text-slate-500">{item.requests} requests</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <Panel>
        <p className="text-xs uppercase tracking-[0.32em] text-pine">Recent request logs</p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="pb-3">Time</th>
                <th className="pb-3">IP</th>
                <th className="pb-3">Endpoint</th>
                <th className="pb-3">Decision</th>
                <th className="pb-3">Algorithm</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="py-3 text-slate-600">{new Date(item.createdAt).toLocaleString()}</td>
                  <td className="py-3 text-slate-600">{item.ipAddress}</td>
                  <td className="py-3 text-slate-600">
                    {item.method} {item.endpoint}
                  </td>
                  <td className="py-3">
                    <span className={item.decision === 'BLOCKED' ? 'text-ember' : 'text-pine'}>
                      {item.decision}
                    </span>
                  </td>
                  <td className="py-3 text-slate-600">{item.algorithm}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
