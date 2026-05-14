'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, ReactNode, useState } from 'react';
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
  const router = useRouter();

  const project = useAsyncResource<ProjectSummary>(
    () => projectsApi.get(projectId),
    [projectId],
  );

  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState('');

  async function handleEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setActionPending(true);
    setActionError('');
    const form = e.currentTarget;
    const name = (form.elements.namedItem('name') as HTMLInputElement).value;
    const description = (form.elements.namedItem('description') as HTMLTextAreaElement).value;
    const environment = (form.elements.namedItem('environment') as HTMLInputElement).value;

    try {
      await projectsApi.update(projectId, { name, description, environment });
      setShowEdit(false);
      await project.reload();
    } catch {
      setActionError('Failed to update project. Please try again.');
    } finally {
      setActionPending(false);
    }
  }

  async function handleDelete() {
    setActionPending(true);
    setActionError('');
    try {
      await projectsApi.delete(projectId);
      router.push('/projects');
    } catch {
      setActionError('Failed to delete project. Please try again.');
      setActionPending(false);
    }
  }

  if (project.loading) {
    return <LoadingState label="Loading project details…" />;
  }

  if (project.error || !project.data) {
    return <ErrorState message={project.error || 'Project not found'} />;
  }

  const data = project.data;
  const tiles = buildTiles(data);
  const isOwner = data.currentRole === 'OWNER' || data.currentRole === 'ADMIN';

  return (
    <>
      <PageHeader
        crumbs={[
          { href: '/projects', label: 'Projects' },
          { label: data.name },
        ]}
        eyebrow="Project"
        title={data.name}
        description={data.description || 'This project does not have a description yet.'}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge-brand">{data.currentRole ?? 'VIEWER'}</span>
            <span className={data.isActive ? 'badge-success' : 'badge-warning'}>
              <span className={`h-1.5 w-1.5 rounded-full ${data.isActive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {data.isActive ? 'Active' : 'Paused'}
            </span>
            <span className="badge-neutral">{data.environment}</span>
            {isOwner && (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => { setShowEdit(true); setActionError(''); }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition"
                  onClick={() => { setShowDelete(true); setActionError(''); }}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        }
      />

      <ProjectTabs projectId={projectId} />

      {/* Edit Modal */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Edit Project</h2>
            <form className="mt-4 space-y-4" onSubmit={handleEdit}>
              <div>
                <label className="label" htmlFor="edit-name">Project name</label>
                <input
                  id="edit-name"
                  name="name"
                  className="field"
                  defaultValue={data.name}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="edit-env">Environment</label>
                <input
                  id="edit-env"
                  name="environment"
                  className="field"
                  defaultValue={data.environment}
                />
              </div>
              <div>
                <label className="label" htmlFor="edit-desc">Description</label>
                <textarea
                  id="edit-desc"
                  name="description"
                  className="field resize-y"
                  rows={3}
                  defaultValue={data.description ?? ''}
                />
              </div>
              {actionError && <p className="text-sm text-red-600">{actionError}</p>}
              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={actionPending}>
                  {actionPending ? 'Saving…' : 'Save changes'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setShowEdit(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Delete project?</h2>
            <p className="mt-2 text-sm text-slate-500">
              This will permanently delete <strong>{data.name}</strong> and all its rules, API keys, and logs. This action cannot be undone.
            </p>
            {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition disabled:opacity-50"
                onClick={handleDelete}
                disabled={actionPending}
              >
                {actionPending ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowDelete(false)}
                disabled={actionPending}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
