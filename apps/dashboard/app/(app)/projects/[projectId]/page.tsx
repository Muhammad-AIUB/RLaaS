'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { Panel } from '@/components/panel';
import { apiFetch } from '@/lib/api-client';
import { ProjectSummary } from '@/lib/types';

export default function ProjectDetailsPage() {
  const params = useParams<{ projectId: string }>();
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await apiFetch<ProjectSummary>(`/api/proxy/projects/${params.projectId}`);
        setProject(data);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'Failed to load project');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [params.projectId]);

  if (loading) {
    return <LoadingState label="Loading project details..." />;
  }

  if (error || !project) {
    return <ErrorState message={error || 'Project not found'} />;
  }

  return (
    <div className="space-y-6">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-pine">Project details</p>
            <h1 className="mt-3 text-3xl font-semibold text-ink">{project.name}</h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-600">
              {project.description || 'This project does not have a description yet.'}
            </p>
          </div>
          <div className="rounded-3xl bg-slate-50 px-5 py-4 text-sm text-slate-600">
            <p>Environment: <span className="font-medium text-ink">{project.environment}</span></p>
            <p className="mt-2">Status: <span className="font-medium text-ink">{project.isActive ? 'Active' : 'Paused'}</span></p>
            <p className="mt-2">Access: <span className="font-medium text-ink">{project.currentRole ?? 'VIEWER'}</span></p>
          </div>
        </div>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Link href={`/projects/${project.id}/api-keys`}>
          <Panel className="transition hover:-translate-y-1">
            <p className="text-xs uppercase tracking-[0.32em] text-pine">API Keys</p>
            <h2 className="mt-3 text-2xl font-semibold text-ink">{project._count?.apiKeys ?? 0}</h2>
            <p className="mt-2 text-sm text-slate-600">Manage issuance and revoke leaked credentials.</p>
          </Panel>
        </Link>
        <Link href={`/projects/${project.id}/rules`}>
          <Panel className="transition hover:-translate-y-1">
            <p className="text-xs uppercase tracking-[0.32em] text-pine">Rules</p>
            <h2 className="mt-3 text-2xl font-semibold text-ink">{project._count?.rules ?? 0}</h2>
            <p className="mt-2 text-sm text-slate-600">Tune priorities, scope, and algorithms.</p>
          </Panel>
        </Link>
        <Link href={`/projects/${project.id}/analytics`}>
          <Panel className="transition hover:-translate-y-1">
            <p className="text-xs uppercase tracking-[0.32em] text-pine">Analytics</p>
            <h2 className="mt-3 text-2xl font-semibold text-ink">Live</h2>
            <p className="mt-2 text-sm text-slate-600">Inspect trends, top offenders, and snapshots.</p>
          </Panel>
        </Link>
        <Link href={`/projects/${project.id}/members`}>
          <Panel className="transition hover:-translate-y-1">
            <p className="text-xs uppercase tracking-[0.32em] text-pine">Members</p>
            <h2 className="mt-3 text-2xl font-semibold text-ink">{project.currentRole ?? 'VIEWER'}</h2>
            <p className="mt-2 text-sm text-slate-600">Manage OWNER, ADMIN, and VIEWER access for this tenant.</p>
          </Panel>
        </Link>
        <Link href={`/projects/${project.id}/webhooks`}>
          <Panel className="transition hover:-translate-y-1">
            <p className="text-xs uppercase tracking-[0.32em] text-pine">Webhooks</p>
            <h2 className="mt-3 text-2xl font-semibold text-ink">Alerts</h2>
            <p className="mt-2 text-sm text-slate-600">Route blocked-activity spikes to external responders.</p>
          </Panel>
        </Link>
        <Link href={`/projects/${project.id}/audit-logs`}>
          <Panel className="transition hover:-translate-y-1">
            <p className="text-xs uppercase tracking-[0.32em] text-pine">Audit</p>
            <h2 className="mt-3 text-2xl font-semibold text-ink">Trace</h2>
            <p className="mt-2 text-sm text-slate-600">Review sensitive actions across keys, rules, and membership.</p>
          </Panel>
        </Link>
      </div>
    </div>
  );
}
