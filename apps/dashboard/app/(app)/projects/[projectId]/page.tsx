'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ReactNode } from 'react';
import { ErrorState, LoadingState } from '@/components/feedback';
import {
  AnalyticsIcon,
  ArrowRightIcon,
  AuditIcon,
  type IconComponent,
  KeyIcon,
  MembersIcon,
  RulesIcon,
  WebhooksIcon,
} from '@/components/icons';
import { PageHeader, ProjectTabs } from '@/components/layout';
import { projectsApi } from '@/lib/api';
import { useAsyncResource } from '@/lib/hooks';
import type { ProjectSummary } from '@/lib/types';

interface Tile {
  href: string;
  eyebrow: string;
  title: ReactNode;
  description: string;
  icon: IconComponent;
}

function buildTiles(project: ProjectSummary): Tile[] {
  return [
    {
      href: `/projects/${project.id}/api-keys`,
      eyebrow: 'API Keys',
      title: project._count?.apiKeys ?? 0,
      description: 'Manage issuance and revoke leaked credentials.',
      icon: KeyIcon,
    },
    {
      href: `/projects/${project.id}/rules`,
      eyebrow: 'Rules',
      title: project._count?.rules ?? 0,
      description: 'Tune priorities, scope, and algorithms.',
      icon: RulesIcon,
    },
    {
      href: `/projects/${project.id}/analytics`,
      eyebrow: 'Analytics',
      title: 'Live',
      description: 'Trends, top offenders, and snapshots.',
      icon: AnalyticsIcon,
    },
    {
      href: `/projects/${project.id}/members`,
      eyebrow: 'Members',
      title: project.currentRole ?? 'VIEWER',
      description: 'Manage OWNER, ADMIN, and VIEWER access.',
      icon: MembersIcon,
    },
    {
      href: `/projects/${project.id}/webhooks`,
      eyebrow: 'Webhooks',
      title: 'Alerts',
      description: 'Route blocked-activity spikes to responders.',
      icon: WebhooksIcon,
    },
    {
      href: `/projects/${project.id}/audit-logs`,
      eyebrow: 'Audit',
      title: 'Trace',
      description: 'Sensitive actions across keys, rules, and roles.',
      icon: AuditIcon,
    },
  ];
}

export default function ProjectDetailsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId as string;

  const project = useAsyncResource<ProjectSummary>(
    () => projectsApi.get(projectId),
    [projectId],
  );

  if (project.loading) {
    return <LoadingState label="Loading project details…" />;
  }

  if (project.error || !project.data) {
    return <ErrorState message={project.error || 'Project not found'} />;
  }

  const data = project.data;
  const tiles = buildTiles(data);

  return (
    <>
      <PageHeader
        crumbs={[
          { href: '/projects', label: 'Projects' },
          { label: data.name },
        ]}
        eyebrow="Project"
        title={data.name}
        description={
          data.description || 'This project does not have a description yet.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge-brand">{data.currentRole ?? 'VIEWER'}</span>
            <span
              className={data.isActive ? 'badge-success' : 'badge-warning'}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  data.isActive ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              {data.isActive ? 'Active' : 'Paused'}
            </span>
            <span className="badge-neutral">{data.environment}</span>
          </div>
        }
      />

      <ProjectTabs projectId={projectId} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link
              key={tile.href}
              href={tile.href}
              className="group card flex h-full flex-col p-5 transition hover:border-brand-300 hover:shadow-card-hover"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {tile.eyebrow}
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900 group-hover:text-brand-700">
                {tile.title}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{tile.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-brand-700">
                Open
                <ArrowRightIcon className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
