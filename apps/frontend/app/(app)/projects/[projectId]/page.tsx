'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { ErrorState, LoadingState } from '@/components/feedback';
import { ArrowRightIcon } from '@/components/icons';
import { PageHeader, ProjectTabs } from '@/components/layout';
import { Panel, PanelHeader, RankRow, SplitBar } from '@/components/ui';
import { analyticsApi, apiKeysApi, projectsApi, rulesApi } from '@/lib/api';
import {
  algorithmLabel,
  formatCount,
  formatDuration,
  formatPercent,
  formatRelativeTime,
  scopeLabel,
} from '@/lib/format';
import { useAsyncResource } from '@/lib/hooks';
import type {
  AnalyticsOverview,
  ApiKeyRecord,
  ProjectSummary,
  RequestLogRecord,
  RuleRecord,
  TopIpRecord,
} from '@/lib/types';

/** Mirrors the gateway's scope precedence — see the Rules page for the detail. */
const SCOPE_ORDER = ['IP', 'API_KEY', 'USER_TIER', 'ENDPOINT', 'GLOBAL'];

function inEvaluationOrder(rules: RuleRecord[]): RuleRecord[] {
  return [...rules]
    .filter((rule) => rule.isActive)
    .sort((a, b) => {
      const scopeDelta =
        SCOPE_ORDER.indexOf(a.scope) - SCOPE_ORDER.indexOf(b.scope);
      if (scopeDelta !== 0) return scopeDelta;
      return a.priority - b.priority;
    });
}

interface ProjectState {
  overview: AnalyticsOverview | null;
  rules: RuleRecord[];
  keys: ApiKeyRecord[];
  topIps: TopIpRecord[];
  logs: RequestLogRecord[];
}

export default function ProjectDetailsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId as string;
  const router = useRouter();

  const project = useAsyncResource<ProjectSummary>(
    () => projectsApi.get(projectId),
    [projectId],
  );

  // The tabs above already say where every sub-page lives, so this page spends
  // its space on the project's actual state instead of repeating the nav.
  const [state, setState] = useState<ProjectState>({
    overview: null,
    rules: [],
    keys: [],
    topIps: [],
    logs: [],
  });
  const [stateLoading, setStateLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStateLoading(true);
      // Each panel degrades on its own: a project with no analytics should
      // still show its rules and keys.
      const [overview, rules, keys, topIps, logs] = await Promise.all([
        analyticsApi.overview(projectId).catch(() => null),
        rulesApi.list(projectId).catch(() => [] as RuleRecord[]),
        apiKeysApi.list(projectId).catch(() => [] as ApiKeyRecord[]),
        analyticsApi.topIps(projectId, 5).catch(() => [] as TopIpRecord[]),
        analyticsApi.logs(projectId, 6).catch(() => [] as RequestLogRecord[]),
      ]);
      if (cancelled) return;
      setState({ overview, rules, keys, topIps, logs });
      setStateLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

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
  const canManage = data.currentRole === 'OWNER' || data.currentRole === 'ADMIN';
  const chain = inEvaluationOrder(state.rules);
  const activeKeys = state.keys.filter((key) => key.status === 'ACTIVE');
  const overview = state.overview;
  const maxIp = state.topIps[0]?.requests ?? 0;

  return (
    <>
      <PageHeader
        crumbs={[
          { href: '/projects', label: 'Projects' },
          { label: data.name },
        ]}
        eyebrow="Project"
        title={data.name}
        description={data.description || undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge-neutral">{data.currentRole ?? 'VIEWER'}</span>
            <span className={data.isActive ? 'badge-success' : 'badge-warning'}>
              {data.isActive ? 'Active' : 'Paused'}
            </span>
            <span className="badge-neutral">{data.environment}</span>
            {canManage && (
              <>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => { setShowEdit(true); setActionError(''); }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm !text-slate-500 hover:!text-red-700"
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

      {/* Traffic — the one question an operator opens this page to answer. */}
      <Panel>
        <PanelHeader
          eyebrow="Traffic"
          title={
            overview && overview.totalRequests > 0
              ? `${formatPercent(overview.blockRate)} of requests blocked`
              : 'No traffic yet'
          }
          description={
            overview && overview.totalRequests > 0
              ? `${formatCount(overview.totalRequests)} requests have passed through the gateway for this project.`
              : 'Point a client at the gateway with one of this project’s API keys and decisions will start appearing here.'
          }
          action={
            <Link href={`/projects/${projectId}/analytics`} className="btn-secondary btn-sm">
              Analytics
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          }
        />
        <div className="mt-5">
          <SplitBar
            allowed={overview?.allowedRequests ?? 0}
            blocked={overview?.blockedRequests ?? 0}
          />
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* Enforcement chain */}
        <Panel className="lg:col-span-2" padding={false}>
          <div className="p-5 sm:p-6 sm:pb-4">
            <PanelHeader
              eyebrow="Enforcement"
              title={
                chain.length > 0
                  ? `${chain.length} ${chain.length === 1 ? 'rule is' : 'rules are'} enforcing`
                  : 'Nothing is enforcing'
              }
              description={
                chain.length > 0
                  ? 'The gateway stops at the first rule that matches a request.'
                  : 'Every request through this project is currently allowed.'
              }
              action={
                <Link href={`/projects/${projectId}/rules`} className="btn-secondary btn-sm">
                  {chain.length > 0 ? 'Manage' : 'Add a rule'}
                </Link>
              }
            />
          </div>

          {stateLoading ? (
            <div className="space-y-2 px-5 pb-6 sm:px-6">
              <div className="skeleton h-9 w-full" />
              <div className="skeleton h-9 w-full" />
              <div className="skeleton h-9 w-2/3" />
            </div>
          ) : chain.length === 0 ? (
            <p className="px-5 pb-6 text-sm text-slate-500 sm:px-6">
              Without a rule the gateway has nothing to enforce, so it allows
              everything it sees.
            </p>
          ) : (
            <ol className="border-t border-slate-200">
              {chain.slice(0, 5).map((rule, index) => (
                <li
                  key={rule.id}
                  className="flex items-center gap-3 border-b border-slate-100 px-5 py-2.5 last:border-b-0 sm:px-6"
                >
                  <span className="num w-4 shrink-0 text-xs font-semibold text-slate-400">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {rule.name}
                    </p>
                    <p className="truncate text-2xs text-slate-500">
                      {scopeLabel(rule.scope)} · {algorithmLabel(rule.algorithm)}
                    </p>
                  </div>
                  <span className="num shrink-0 font-mono text-xs text-slate-600">
                    {formatCount(rule.limit)}
                    <span className="text-slate-400"> / {formatDuration(rule.windowSeconds)}</span>
                  </span>
                </li>
              ))}
              {chain.length > 5 ? (
                <li className="px-5 py-2.5 text-xs text-slate-500 sm:px-6">
                  {chain.length - 5} more further down the chain
                </li>
              ) : null}
            </ol>
          )}
        </Panel>

        {/* Access */}
        <Panel padding={false}>
          <div className="p-5 sm:p-6 sm:pb-4">
            <PanelHeader
              eyebrow="Access"
              title={
                activeKeys.length > 0
                  ? `${activeKeys.length} active ${activeKeys.length === 1 ? 'key' : 'keys'}`
                  : 'No active keys'
              }
              action={
                <Link href={`/projects/${projectId}/api-keys`} className="btn-secondary btn-sm">
                  {activeKeys.length > 0 ? 'Manage' : 'Issue'}
                </Link>
              }
            />
          </div>

          {stateLoading ? (
            <div className="space-y-2 px-5 pb-6 sm:px-6">
              <div className="skeleton h-9 w-full" />
              <div className="skeleton h-9 w-3/4" />
            </div>
          ) : state.keys.length === 0 ? (
            <p className="px-5 pb-6 text-sm text-slate-500 sm:px-6">
              A client needs a key before the gateway will evaluate its requests.
            </p>
          ) : (
            <ul className="border-t border-slate-200">
              {state.keys.slice(0, 4).map((key) => (
                <li
                  key={key.id}
                  className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-2.5 last:border-b-0 sm:px-6"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-800">{key.name}</p>
                    <p className="truncate font-mono text-2xs text-slate-500">
                      {key.keyPrefix}…
                    </p>
                  </div>
                  <span
                    className={key.status === 'ACTIVE' ? 'badge-success' : 'badge-neutral'}
                    title={
                      key.lastUsedAt
                        ? `Last used ${formatRelativeTime(key.lastUsedAt)}`
                        : 'Never used'
                    }
                  >
                    {key.status === 'ACTIVE' ? 'Active' : 'Revoked'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Heaviest callers */}
        <Panel padding={false}>
          <div className="p-5 sm:p-6 sm:pb-3">
            <PanelHeader eyebrow="Callers" title="Heaviest source addresses" />
          </div>
          {stateLoading ? (
            <div className="space-y-2 px-5 pb-6 sm:px-6">
              <div className="skeleton h-8 w-full" />
              <div className="skeleton h-8 w-full" />
            </div>
          ) : state.topIps.length === 0 ? (
            <p className="px-5 pb-6 text-sm text-slate-500 sm:px-6">
              No requests recorded yet.
            </p>
          ) : (
            <ul className="px-2 pb-4">
              {state.topIps.map((item) => (
                <RankRow
                  key={item.ip}
                  label={item.ip}
                  value={item.requests}
                  max={maxIp}
                  mono
                />
              ))}
            </ul>
          )}
        </Panel>

        {/* Recent decisions */}
        <Panel padding={false}>
          <div className="p-5 sm:p-6 sm:pb-3">
            <PanelHeader eyebrow="Activity" title="Latest decisions" />
          </div>
          {stateLoading ? (
            <div className="space-y-2 px-5 pb-6 sm:px-6">
              <div className="skeleton h-8 w-full" />
              <div className="skeleton h-8 w-full" />
            </div>
          ) : state.logs.length === 0 ? (
            <p className="px-5 pb-6 text-sm text-slate-500 sm:px-6">
              Nothing has hit the gateway yet.
            </p>
          ) : (
            <ul className="border-t border-slate-200">
              {state.logs.map((log) => (
                <li
                  key={log.id}
                  className="flex items-center gap-3 border-b border-slate-100 px-5 py-2 last:border-b-0 sm:px-6"
                >
                  <span
                    className={
                      log.decision === 'BLOCKED' ? 'badge-danger' : 'badge-success'
                    }
                  >
                    {log.decision === 'BLOCKED' ? 'Blocked' : 'Allowed'}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700">
                    {log.method} {log.endpoint}
                  </span>
                  <span className="num shrink-0 text-2xs text-slate-500">
                    {formatRelativeTime(log.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Edit */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 px-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-raised p-6 shadow-overlay">
            <h2 className="text-lg font-semibold text-slate-900">Edit project</h2>
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
              {actionError && <p className="text-sm text-red-700">{actionError}</p>}
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

      {/* Delete */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 px-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-raised p-6 shadow-overlay">
            <h2 className="text-lg font-semibold text-slate-900">
              Delete “{data.name}”?
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              This permanently removes {state.rules.length} {state.rules.length === 1 ? 'rule' : 'rules'},{' '}
              {state.keys.length} {state.keys.length === 1 ? 'API key' : 'API keys'}, and all request
              logs. Any client still using those keys will start failing. This
              cannot be undone.
            </p>
            {actionError && <p className="mt-3 text-sm text-red-700">{actionError}</p>}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="btn-danger-solid"
                onClick={handleDelete}
                disabled={actionPending}
              >
                {actionPending ? 'Deleting…' : 'Delete project'}
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
    </>
  );
}
