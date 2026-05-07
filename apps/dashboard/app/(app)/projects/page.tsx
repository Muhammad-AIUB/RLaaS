'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { Panel } from '@/components/panel';
import { apiFetch } from '@/lib/api-client';
import { ProjectSummary } from '@/lib/types';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function loadProjects() {
    try {
      setLoading(true);
      const data = await apiFetch<ProjectSummary[]>('/api/proxy/projects');
      setProjects(data);
      setError('');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to load projects');
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
    const formData = new FormData(event.currentTarget);

    try {
      await apiFetch<ProjectSummary>('/api/proxy/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: formData.get('name'),
          description: formData.get('description'),
          environment: formData.get('environment'),
        }),
      });
      event.currentTarget.reset();
      await loadProjects();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to create project');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <Panel>
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-pine">Projects</p>
            <h1 className="mt-3 text-3xl font-semibold text-ink">Protect each API as its own surface.</h1>
            <p className="mt-3 text-sm text-slate-600">
              Projects isolate tenants by membership, environment, and policy scope.
            </p>
          </div>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreate}>
            <input className="rounded-2xl border border-slate-200 px-4 py-3" name="name" placeholder="Project name" required />
            <input className="rounded-2xl border border-slate-200 px-4 py-3" name="environment" placeholder="production" defaultValue="production" />
            <textarea className="rounded-2xl border border-slate-200 px-4 py-3 md:col-span-2" name="description" placeholder="What does this API protect?" rows={3} />
            <div className="md:col-span-2">
              <button className="rounded-full bg-pine px-5 py-3 text-sm font-medium text-white disabled:opacity-60" disabled={pending} type="submit">
                {pending ? 'Creating project...' : 'Create project'}
              </button>
            </div>
          </form>
        </div>
      </Panel>
      {error ? <ErrorState message={error} /> : null}
      {loading ? (
        <LoadingState label="Loading projects..." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`} className="block">
              <Panel className="h-full transition hover:-translate-y-1 hover:shadow-2xl">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-ink">{project.name}</h2>
                    <p className="mt-2 text-sm text-slate-600">{project.description || 'No description yet.'}</p>
                  </div>
                  <span className="rounded-full bg-sand px-3 py-1 text-xs uppercase tracking-[0.24em] text-pine">
                    {project.environment}
                  </span>
                </div>
                <div className="mt-6 flex gap-3 text-sm text-slate-500">
                  <span>{project._count?.apiKeys ?? 0} keys</span>
                  <span>{project._count?.rules ?? 0} rules</span>
                  <span>{project.currentRole ?? 'VIEWER'} access</span>
                </div>
              </Panel>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
