'use client';

import { FormEvent, useState } from 'react';
import { useParams } from 'next/navigation';
import { ErrorState, LoadingState } from '@/components/feedback';
import { PageHeader, ProjectTabs } from '@/components/layout';
import { Panel, PanelHeader } from '@/components/ui';
import { membersApi } from '@/lib/api';
import { useAsyncResource } from '@/lib/hooks';
import type { InviteMemberInput, ProjectMemberRecord } from '@/lib/types';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function ProjectMembersPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId as string;

  const members = useAsyncResource<ProjectMemberRecord[]>(
    () => membersApi.list(projectId),
    [projectId],
  );
  const [pending, setPending] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    members.setError('');
    const form = event.currentTarget;
    const formData = new FormData(form);
    const input: InviteMemberInput = {
      email: String(formData.get('email') ?? ''),
      role: String(formData.get('role') ?? 'VIEWER'),
    };
    try {
      await membersApi.invite(projectId, input);
      form.reset();
      await members.reload();
    } catch (caughtError) {
      members.setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to add member',
      );
    } finally {
      setPending(false);
    }
  }

  async function handleRoleChange(member: ProjectMemberRecord, newRole: string) {
    setUpdatingId(member.id);
    members.setError('');
    try {
      await membersApi.updateRole(projectId, member.id, newRole);
      await members.reload();
    } catch (caughtError) {
      members.setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to update role',
      );
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleRemove(memberId: string) {
    setRemovingId(memberId);
    members.setError('');
    try {
      await membersApi.remove(projectId, memberId);
      await members.reload();
    } catch (caughtError) {
      members.setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to remove member',
      );
    } finally {
      setRemovingId(null);
    }
  }

  const list = members.data ?? [];

  return (
    <>
      <PageHeader
        crumbs={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${projectId}`, label: 'Project' },
          { label: 'Members' },
        ]}
        eyebrow="Access"
        title="Team members"
        description="Manage tenant access with explicit roles."
      />
      <ProjectTabs projectId={projectId} />

      <Panel className="mb-6">
        <PanelHeader eyebrow="Invite" title="Add a teammate" />
        <form className="mt-5 grid gap-4 sm:grid-cols-3" onSubmit={handleInvite}>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="member-email">Email</label>
            <input
              id="member-email"
              className="field"
              name="email"
              type="email"
              placeholder="teammate@company.com"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="member-role">Role</label>
            <select id="member-role" className="field" name="role" defaultValue="VIEWER">
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

      {members.error ? (
        <div className="mb-6"><ErrorState message={members.error} /></div>
      ) : null}

      {members.loading ? (
        <LoadingState label="Loading members…" />
      ) : list.length === 0 ? (
        <Panel>
          <p className="py-6 text-center text-sm text-slate-500">No members yet.</p>
        </Panel>
      ) : (
        <Panel padding={false}>
          <ul className="divide-y divide-slate-100">
            {list.map((member) => {
              const isOwner = member.role === 'OWNER';
              return (
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

                    {isOwner ? (
                      <span className="badge-brand">OWNER</span>
                    ) : (
                      <select
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        value={member.role}
                        disabled={updatingId === member.id}
                        onChange={(e) => handleRoleChange(member, e.target.value)}
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="VIEWER">Viewer</option>
                      </select>
                    )}

                    {!isOwner && (
                      <button
                        type="button"
                        className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                        onClick={() => handleRemove(member.id)}
                        disabled={removingId === member.id}
                      >
                        {removingId === member.id ? '…' : 'Remove'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </>
  );
}
