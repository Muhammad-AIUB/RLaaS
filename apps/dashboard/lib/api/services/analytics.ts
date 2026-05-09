import type {
  AlgorithmPerformanceRecord,
  AnalyticsOverview,
  CreateSnapshotInput,
  RequestLogRecord,
  SnapshotRecord,
  TopEndpointRecord,
  TopIpRecord,
} from '@/lib/types';
import { apiFetch } from '../client';
import { endpoints } from '../endpoints';

export const analyticsApi = {
  overview: (projectId: string) =>
    apiFetch<AnalyticsOverview>(endpoints.projects.analytics.overview(projectId)),
  topIps: (projectId: string, limit = 10) =>
    apiFetch<TopIpRecord[]>(
      endpoints.projects.analytics.topIps(projectId, limit),
    ),
  topEndpoints: (projectId: string, limit = 10) =>
    apiFetch<TopEndpointRecord[]>(
      endpoints.projects.analytics.topEndpoints(projectId, limit),
    ),
  algorithms: (projectId: string) =>
    apiFetch<AlgorithmPerformanceRecord[]>(
      endpoints.projects.analytics.algorithms(projectId),
    ),
  logs: (projectId: string, limit = 15) =>
    apiFetch<RequestLogRecord[]>(
      endpoints.projects.analytics.logs(projectId, limit),
    ),
  snapshots: (projectId: string, limit = 10) =>
    apiFetch<SnapshotRecord[]>(
      endpoints.projects.analytics.snapshots(projectId, limit),
    ),
  createSnapshot: (projectId: string, input: CreateSnapshotInput) =>
    apiFetch<SnapshotRecord>(
      endpoints.projects.analytics.snapshots(projectId),
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),
};
