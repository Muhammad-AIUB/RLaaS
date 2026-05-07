'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { Panel } from '@/components/panel';
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
        setError(caughtError instanceof Error ? caughtError.message : 'Failed to load audit logs');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [params.projectId]);

  return (
    <div className="space-y-6">
      <Panel>
        <p className="text-xs uppercase tracking-[0.32em] text-pine">Audit logs</p>
        <h1 className="mt-3 text-3xl font-semibold text-ink">Sensitive action trail.</h1>
        <p className="mt-3 text-sm text-slate-600">
          Follow changes to auth, membership, API keys, rules, and webhook configuration.
        </p>
      </Panel>
      {error ? <ErrorState message={error} /> : null}
      {loading ? (
        <LoadingState label="Loading audit logs..." />
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => (
            <Panel key={entry.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-ink">{entry.action}</h2>
                    <span className="rounded-full bg-sand px-3 py-1 text-xs uppercase tracking-[0.24em] text-pine">
                      {entry.resourceType}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {entry.actor?.fullName || 'System'} {entry.actor?.email ? `(${entry.actor.email})` : ''}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    {new Date(entry.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
