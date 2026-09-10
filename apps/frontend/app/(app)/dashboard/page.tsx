'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { PageHeader } from '@/components/layout';
import { MetricCard, Panel, SplitBar } from '@/components/ui';
import { analyticsApi, projectsApi } from '@/lib/api';
import { formatCount, formatPercent } from '@/lib/format';
import type { AnalyticsOverview, ProjectSummary } from '@/lib/types';

interface ProjectRow {
  project: ProjectSummary;
  overview: AnalyticsOverview | null;
}

const EMPTY_TOTALS = { total: 0, allowed: 0, blocked: 0 };

export default function DashboardOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<ProjectRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const projects = await projectsApi.list();
        if (cancelled) return;

        // The page used to show `projects[0]` under the title "Operator
        // dashboard", so an operator with three projects saw one of them and no
        // indication which others existed. It now covers all of them.
        const overviews = await Promise.all(
          projects.map((project) =>
            analyticsApi.overview(project.id).catch(() => null),
          ),
        );
        if (cancelled) return;

        setRows(
          projects.map((project, index) => ({
            project,
            overview: overviews[index],
          })),
        );
      } catch (caughtError) {
        if (cancelled) return;
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Failed to load the overview',
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

  const header = (
    <PageHeader
      eyebrow="Overview"
      title="Every project you operate"
      description="Traffic and enforcement across the projects you can see."
      actions={
        <Link href="/projects" className="btn-secondary">
          Manage projects
        </Link>
      }
    />
  );

  if (loading) {
    return (
      <>
        {header}
        <LoadingState label="Loading your projects…" />
      </>
    );
  }

  if (error) {
    return (
      <>
        {header}
        <ErrorState message={error} />
      </>
    );
  }

  if (rows.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No projects yet"
          description="A project is one API surface — its own keys, its own rules, its own traffic. Create one to start enforcing limits."
          href="/projects"
          actionLabel="Create a project"
        />
      </>
    );
  }

  const totals = rows.reduce((sum, row) => {
    if (!row.overview) return sum;
    return {
      total: sum.total + row.overview.totalRequests,
      allowed: sum.allowed + row.overview.allowedRequests,
      blocked: sum.blocked + row.overview.blockedRequests,
    };
  }, EMPTY_TOTALS);

  const blockRate = totals.total > 0 ? (totals.blocked / totals.total) * 100 : 0;
  const busiest = Math.max(
    ...rows.map((row) => row.overview?.totalRequests ?? 0),
    0,
  );

  return (
    <>
      {header}

      {/* Two-up on phones rather than four full-width cards, which used to take
          the entire first screen before any content appeared. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <MetricCard
          label="Projects"
          value={formatCount(rows.length)}
          hint={`${rows.filter((r) => r.project.isActive).length} active`}
        />
        <MetricCard
          label="Requests"
          value={formatCount(totals.total)}
          hint="Across all projects"
        />
        <MetricCard
          label="Blocked"
          value={formatCount(totals.blocked)}
          tone="danger"
          hint={`${formatPercent(blockRate)} of all requests`}
        />
        <MetricCard
          label="Allowed"
          value={formatCount(totals.allowed)}
          tone="success"
          hint={`${formatPercent(100 - blockRate)} of all requests`}
        />
      </div>

      <Panel className="mt-4">
        <SplitBar allowed={totals.allowed} blocked={totals.blocked} />
      </Panel>

      <Panel className="mt-4" padding={false}>
        <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
          <p className="eyebrow">Projects</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">
            Traffic by project
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="tbl min-w-[44rem]">
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">Environment</th>
                <th scope="col" className="w-48">Allowed vs blocked</th>
                <th scope="col" className="!text-right">Requests</th>
                <th scope="col" className="!text-right">Block rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ project, overview }) => {
                const requests = overview?.totalRequests ?? 0;
                return (
                  <tr key={project.id}>
                    <td>
                      <Link
                        href={`/projects/${project.id}`}
                        className="font-medium text-slate-900 underline decoration-transparent underline-offset-[3px] transition-colors duration-state hover:decoration-slate-400"
                      >
                        {project.name}
                      </Link>
                      <p className="mt-0.5 text-2xs text-slate-500">
                        {formatCount(project._count?.rules ?? 0)} rules ·{' '}
                        {formatCount(project._count?.apiKeys ?? 0)} keys
                      </p>
                    </td>
                    <td>
                      <span className="badge-neutral">{project.environment}</span>
                    </td>
                    <td>
                      {requests > 0 ? (
                        <SplitBar
                          allowed={overview?.allowedRequests ?? 0}
                          blocked={overview?.blockedRequests ?? 0}
                          showLegend={false}
                        />
                      ) : (
                        <span className="text-xs text-slate-500">No traffic</span>
                      )}
                    </td>
                    <td className="!text-right">
                      <span
                        className="num font-mono text-slate-800"
                        title={
                          busiest > 0 && requests === busiest
                            ? 'Busiest project'
                            : undefined
                        }
                      >
                        {formatCount(requests)}
                      </span>
                    </td>
                    <td className="!text-right">
                      <span className="num font-mono text-slate-800">
                        {requests > 0 ? formatPercent(overview?.blockRate ?? 0) : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
