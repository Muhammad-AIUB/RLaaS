'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { Panel } from '@/components/panel';
import { ProjectTabs } from '@/components/project-tabs';
import { apiFetch } from '@/lib/api-client';
import { AuditLogRecord } from '@/lib/types';

export default function AuditLogsPage() {
  const params = useParams<{ projectId: string }>();
  const [entries, setEntries] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await apiFetch<AuditLogRecord[]>(
          `/api/proxy/projects/${params.projectId}/audit-logs`,
        );
        setEntries(data);
        setError('');
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Failed to load audit logs',
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [params.projectId]);

  return (
    <>
      <PageHeader
        crumbs={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${params.projectId}`, label: 'Project' },
          { label: 'Audit' },
        ]}
        eyebrow="History"
        title="Audit logs"
        description="Follow changes to auth, membership, API keys, rules, and webhook configuration."
      />
      <ProjectTabs projectId={params.projectId as string} />

      {error ? (
        <div className="mb-6">
          <ErrorState message={error} />
        </div>
      ) : null}

      {loading ? (
        <LoadingState label="Loading audit logs…" />
      ) : entries.length === 0 ? (
        <Panel>
          <p className="py-6 text-center text-sm text-slate-500">
            No audit entries yet.
          </p>
        </Panel>
      ) : (
        <Panel padding={false}>
          <ol className="relative divide-y divide-slate-100">
            {entries.map((entry) => (
              <li key={entry.id} className="flex gap-4 px-5 py-4 sm:px-6">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
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
