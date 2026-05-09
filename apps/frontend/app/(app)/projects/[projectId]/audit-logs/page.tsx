'use client';

import { useParams } from 'next/navigation';
import { ErrorState, LoadingState } from '@/components/feedback';
import { ClockIcon } from '@/components/icons';
import { PageHeader, ProjectTabs } from '@/components/layout';
import { Panel } from '@/components/ui';
import { auditLogsApi } from '@/lib/api';
import { useAsyncResource } from '@/lib/hooks';
import type { AuditLogRecord } from '@/lib/types';

export default function AuditLogsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId as string;

  const entries = useAsyncResource<AuditLogRecord[]>(
    () => auditLogsApi.list(projectId),
    [projectId],
  );

  const list = entries.data ?? [];

  return (
    <>
      <PageHeader
        crumbs={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${projectId}`, label: 'Project' },
          { label: 'Audit' },
        ]}
        eyebrow="History"
        title="Audit logs"
        description="Follow changes to auth, membership, API keys, rules, and webhook configuration."
      />
      <ProjectTabs projectId={projectId} />

      {entries.error ? (
        <div className="mb-6">
          <ErrorState message={entries.error} />
        </div>
      ) : null}

      {entries.loading ? (
        <LoadingState label="Loading audit logs…" />
      ) : list.length === 0 ? (
        <Panel>
          <p className="py-6 text-center text-sm text-slate-500">
            No audit entries yet.
          </p>
        </Panel>
      ) : (
        <Panel padding={false}>
          <ol className="relative divide-y divide-slate-100">
            {list.map((entry) => (
              <li key={entry.id} className="flex gap-4 px-5 py-4 sm:px-6">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <ClockIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {entry.action}
                    </p>
                    <span className="badge-neutral">{entry.resourceType}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    by{' '}
                    <span className="font-medium text-slate-700">
                      {entry.actor?.fullName || 'System'}
                    </span>
                    {entry.actor?.email ? ` · ${entry.actor.email}` : ''} ·{' '}
                    {new Date(entry.createdAt).toLocaleString()}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      )}
    </>
  );
}
