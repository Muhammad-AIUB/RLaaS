'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { useEffect, useState, ReactNode } from 'react';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { ProjectTabs } from '@/components/project-tabs';
import { apiFetch } from '@/lib/api-client';
import { ProjectSummary } from '@/lib/types';

type IconComponent = (props: { className?: string }) => React.ReactElement;

type Tile = {
  href: string;
  eyebrow: string;
  title: ReactNode;
  description: string;
  icon: IconComponent;
};

const tileIcons = {
  Key: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="3.5" />
      <path d="M21 2 9 14M16 7l3 3" />
    </svg>
  ),
  Rules: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 12h10M4 18h7" />
      <circle cx="18" cy="12" r="2" />
      <circle cx="14" cy="18" r="2" />
    </svg>
  ),
  Analytics: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 4 4 5-6" />
    </svg>
  ),
  Members: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="3.5" />
      <path d="M2 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
      <circle cx="17" cy="8" r="3" />
      <path d="M22 18c-.7-2-2-3.2-4-3.7" />
    </svg>
  ),
  Webhooks: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M9 6h6M6 9v6" />
    </svg>
  ),
  Audit: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  ),
};

export default function ProjectDetailsPage() {
  const params = useParams<{ projectId: string }>();
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await apiFetch<ProjectSummary>(
          `/api/proxy/projects/${params.projectId}`,
        );
        setProject(data);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error ? caughtError.message : 'Failed to load project',
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [params.projectId]);

  if (loading) {
    return <LoadingState label="Loading project details…" />;
  }

  if (error || !project) {
    return <ErrorState message={error || 'Project not found'} />;
  }

  const tiles: Tile[] = [
    {
      href: `/projects/${project.id}/api-keys`,
      eyebrow: 'API Keys',
      title: project._count?.apiKeys ?? 0,
      description: 'Manage issuance and revoke leaked credentials.',
      icon: tileIcons.Key,
    },
    {
      href: `/projects/${project.id}/rules`,
      eyebrow: 'Rules',
      title: project._count?.rules ?? 0,
      description: 'Tune priorities, scope, and algorithms.',
      icon: tileIcons.Rules,
    },
    {
      href: `/projects/${project.id}/analytics`,
      eyebrow: 'Analytics',
      title: 'Live',
      description: 'Trends, top offenders, and snapshots.',
      icon: tileIcons.Analytics,
    },
    {
      href: `/projects/${project.id}/members`,
      eyebrow: 'Members',
      title: project.currentRole ?? 'VIEWER',
      description: 'Manage OWNER, ADMIN, and VIEWER access.',
      icon: tileIcons.Members,
    },
    {
      href: `/projects/${project.id}/webhooks`,
      eyebrow: 'Webhooks',
      title: 'Alerts',
      description: 'Route blocked-activity spikes to responders.',
      icon: tileIcons.Webhooks,
    },
    {
      href: `/projects/${project.id}/audit-logs`,
      eyebrow: 'Audit',
      title: 'Trace',
      description: 'Sensitive actions across keys, rules, and roles.',
      icon: tileIcons.Audit,
    },
  ];

  return (
    <>
      <PageHeader
        crumbs={[
          { href: '/projects', label: 'Projects' },
          { label: project.name },
        ]}
        eyebrow="Project"
        title={project.name}
        description={
          project.description || 'This project does not have a description yet.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge-brand">{project.currentRole ?? 'VIEWER'}</span>
            <span
              className={
                project.isActive ? 'badge-success' : 'badge-warning'
              }
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${project.isActive ? 'bg-emerald-500' : 'bg-amber-500'}`}
              />
              {project.isActive ? 'Active' : 'Paused'}
            </span>
            <span className="badge-neutral">{project.environment}</span>
          </div>
        }
      />

      <ProjectTabs projectId={project.id} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => {
          const I = tile.icon;
          return (
            <Link
              key={tile.href}
              href={tile.href}
              className="group card flex h-full flex-col p-5 transition hover:border-brand-300 hover:shadow-card-hover"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                <I className="h-5 w-5" />
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
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
