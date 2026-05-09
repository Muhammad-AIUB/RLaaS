'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { Panel, PanelHeader } from '@/components/panel';
import { apiFetch } from '@/lib/api-client';
import { ProjectSummary } from '@/lib/types';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function loadProjects() {
    try {
      setLoading(true);
      const data = await apiFetch<ProjectSummary[]>('/api/proxy/projects');
      setProjects(data);
      setError('');
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to load projects',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      await apiFetch<ProjectSummary>('/api/proxy/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: formData.get('name'),
          description: formData.get('description'),
          environment: formData.get('environment'),
        }),
      });
      form.reset();
      setShowForm(false);
      await loadProjects();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to create project',
      );
    } finally {
      setPending(false);
    }
  }

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
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
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
              <label className="label" htmlFor="name">
                Project name
              </label>
              <input id="name" name="name" required className="field" placeholder="Public API" />
            </div>
            <div>
              <label className="label" htmlFor="environment">
                Environment
              </label>
              <input
                id="environment"
                name="environment"
                defaultValue="production"
                className="field"
                placeholder="production"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="description">
                Description
              </label>
              <textarea
                id="description"
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

      {error ? (
        <div className="mb-6">
          <ErrorState message={error} />
        </div>
      ) : null}

      {loading ? (
        <LoadingState label="Loading projects…" />
      ) : projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create your first project to start issuing API keys and configuring rate-limit rules."
          actionLabel="Create a project"
          href="#"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="group card flex h-full flex-col p-5 transition hover:border-brand-300 hover:shadow-card-hover"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  </svg>
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
