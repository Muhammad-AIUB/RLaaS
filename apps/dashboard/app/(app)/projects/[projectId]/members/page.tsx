'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { Panel, PanelHeader } from '@/components/panel';
import { ProjectTabs } from '@/components/project-tabs';
import { apiFetch } from '@/lib/api-client';
import { ProjectMemberRecord } from '@/lib/types';

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function ProjectMembersPage() {
  const params = useParams<{ projectId: string }>();
  const [members, setMembers] = useState<ProjectMemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function loadMembers() {
    try {
      setLoading(true);
      const data = await apiFetch<ProjectMemberRecord[]>(
        `/api/proxy/projects/${params.projectId}/members`,
      );
      setMembers(data);
      setError('');
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to load members',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMembers();
  }, [params.projectId]);

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      await apiFetch<ProjectMemberRecord>(
        `/api/proxy/projects/${params.projectId}/members`,
        {
          method: 'POST',
          body: JSON.stringify({
            email: formData.get('email'),
            role: formData.get('role'),
          }),
        },
      );
      form.reset();
      await loadMembers();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to add member',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageHeader
        crumbs={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${params.projectId}`, label: 'Project' },
          { label: 'Members' },
        ]}
        eyebrow="Access"
        title="Team members"
        description="Manage tenant access with explicit roles."
      />
      <ProjectTabs projectId={params.projectId as string} />

      <Panel className="mb-6">
        <PanelHeader eyebrow="Invite" title="Add a teammate" />
        <form
          className="mt-5 grid gap-4 sm:grid-cols-3"
          onSubmit={handleInvite}
        >
          <div className="sm:col-span-2">
            <label className="label">Email</label>
            <input
              className="field"
              name="email"
              type="email"
              placeholder="teammate@company.com"
              required
            />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="field" name="role" defaultValue="VIEWER">
              <option value="OWNER">Owner</option>
              <option value="ADMIN">Admin</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </div>
          <div className="sm:col-span-3">
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? 'Adding…' : 'Add member'}
            </button>
          </div>
        </form>
      </Panel>

      {error ? (
        <div className="mb-6">
          <ErrorState message={error} />
        </div>
      ) : null}

      {loading ? (
        <LoadingState label="Loading members…" />
      ) : members.length === 0 ? (
        <Panel>
          <p className="py-6 text-center text-sm text-slate-500">
            No members yet.
          </p>
        </Panel>
      ) : (
        <Panel padding={false}>
          <ul className="divide-y divide-slate-100">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 ring-1 ring-brand-100">
                    {initials(member.user.fullName || member.user.email)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {member.user.fullName}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {member.user.email}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge-neutral">Tier {member.user.tier}</span>
                  <span className="badge-brand">{member.role}</span>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
