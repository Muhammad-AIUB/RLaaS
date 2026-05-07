'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { Panel } from '@/components/panel';
import { apiFetch } from '@/lib/api-client';
import { ProjectMemberRecord } from '@/lib/types';

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
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to load members');
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
    const formData = new FormData(event.currentTarget);

    try {
      await apiFetch<ProjectMemberRecord>(`/api/proxy/projects/${params.projectId}/members`, {
        method: 'POST',
        body: JSON.stringify({
          email: formData.get('email'),
          role: formData.get('role'),
        }),
      });
      event.currentTarget.reset();
      await loadMembers();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Failed to add member');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <Panel>
        <p className="text-xs uppercase tracking-[0.32em] text-pine">Members</p>
        <h1 className="mt-3 text-3xl font-semibold text-ink">Tenant access with explicit roles.</h1>
        <form className="mt-6 grid gap-3 md:grid-cols-3" onSubmit={handleInvite}>
          <input className="rounded-2xl border border-slate-200 px-4 py-3 md:col-span-2" name="email" type="email" placeholder="teammate@company.com" required />
          <select className="rounded-2xl border border-slate-200 px-4 py-3" name="role" defaultValue="VIEWER">
            <option value="OWNER">OWNER</option>
            <option value="ADMIN">ADMIN</option>
            <option value="VIEWER">VIEWER</option>
          </select>
          <div className="md:col-span-3">
            <button className="rounded-full bg-pine px-5 py-3 text-sm font-medium text-white disabled:opacity-60" disabled={pending} type="submit">
              {pending ? 'Adding member...' : 'Add member'}
            </button>
          </div>
        </form>
      </Panel>
      {error ? <ErrorState message={error} /> : null}
      {loading ? (
        <LoadingState label="Loading members..." />
      ) : (
        <div className="space-y-4">
          {members.map((member) => (
            <Panel key={member.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-ink">{member.user.fullName}</h2>
                  <p className="mt-2 text-sm text-slate-600">{member.user.email}</p>
                  <p className="mt-2 text-sm text-slate-500">Tier {member.user.tier}</p>
                </div>
                <span className="rounded-full bg-sand px-3 py-1 text-xs uppercase tracking-[0.24em] text-pine">
                  {member.role}
                </span>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
