'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/feedback';
import { PlusIcon, ProjectsIcon } from '@/components/icons';
import { PageHeader } from '@/components/layout';
import { Panel, PanelHeader } from '@/components/ui';
import { projectsApi } from '@/lib/api';
import { useAsyncResource } from '@/lib/hooks';
import type { CreateProjectInput, ProjectSummary } from '@/lib/types';

export default function ProjectsPage() {
  const projects = useAsyncResource<ProjectSummary[]>(() => projectsApi.list());
  const [pending, setPending] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    projects.setError('');

    const form = event.currentTarget;
    const formData = new FormData(form);
    const input: CreateProjectInput = {
      name: String(formData.get('name') ?? ''),
      description: (formData.get('description') as string) || undefined,
      environment:
        (formData.get('environment') as string) || undefined,
    };

    try {
      await projectsApi.create(input);
      form.reset();
      setShowForm(false);
      await projects.reload();
    } catch (caughtError) {
      projects.setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to create project',
      );
    } finally {
      setPending(false);
    }
  }

  const list = projects.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Projects"
        description="Each project isolates one API surface — its keys, rules, members, and analytics."
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowForm((s) => !s)}
          >
            <PlusIcon className="h-4 w-4" />
            {showForm ? 'Close' : 'New project'}
          </button>
        }
      />

      {showForm ? (
        <Panel className="mb-6">
          <PanelHeader
            eyebrow="Create"
            title="New project"
            description="Give it a name, environment, and a short description."
          />
          <form
            className="mt-5 grid gap-4 sm:grid-cols-2"
            onSubmit={handleCreate}
          >
            <div>
              <label className="label" htmlFor="project-name">
                Project name
              </label>
              <input
                id="project-name"
                name="name"
                required
                className="field"
                placeholder="Public API"
              />
            </div>
            <div>
              <label className="label" htmlFor="project-environment">
                Environment
              </label>
              <input
                id="project-environment"
                name="environment"
                defaultValue="production"
                className="field"
                placeholder="production"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="project-description">
                Description
              </label>
              <textarea
                id="project-description"
                name="description"
                rows={3}
                placeholder="What does this API protect?"
                className="field resize-y"
              />
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button type="submit" className="btn-primary" disabled={pending}>
                {pending ? 'Creating…' : 'Create project'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      ) : null}

      {projects.error ? (
        <div className="mb-6">
          <ErrorState message={projects.error} />
        </div>
      ) : null}

      {projects.loading ? (
        <LoadingState label="Loading projects…" />
      ) : list.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create your first project to start issuing API keys and configuring rate-limit rules."
          actionLabel="Create a project"
          href="#"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="group card flex h-full flex-col p-5 transition hover:border-brand-300 hover:shadow-card-hover"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                  <ProjectsIcon className="h-5 w-5" />
                </div>
                <span className="badge-neutral">{project.environment}</span>
              </div>
              <h2 className="mt-4 text-base font-semibold text-slate-900 group-hover:text-brand-700">
                {project.name}
              </h2>
              <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                {project.description || 'No description yet.'}
              </p>
              <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
                <div className="flex items-center gap-4">
                  <span>
                    <strong className="font-semibold text-slate-700">
                      {project._count?.apiKeys ?? 0}
                    </strong>{' '}
                    keys
                  </span>
                  <span>
                    <strong className="font-semibold text-slate-700">
                      {project._count?.rules ?? 0}
                    </strong>{' '}
                    rules
                  </span>
                </div>
                <span className="badge-brand !py-0">
                  {project.currentRole ?? 'VIEWER'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
