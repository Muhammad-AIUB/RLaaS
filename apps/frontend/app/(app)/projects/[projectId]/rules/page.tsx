'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ErrorState, LoadingState } from '@/components/feedback';
import { PageHeader, ProjectTabs } from '@/components/layout';
import { Panel, PanelHeader } from '@/components/ui';
import { rulesApi } from '@/lib/api';
import {
  algorithmLabel,
  formatCount,
  formatDuration,
  scopeLabel,
} from '@/lib/format';
import { useAsyncResource } from '@/lib/hooks';
import type { CreateRuleInput, RuleRecord } from '@/lib/types';

function readFormString(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readFormNumber(form: FormData, key: string): number | undefined {
  const raw = form.get(key);
  if (raw === null || raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * The gateway evaluates scope classes in this fixed order and takes the first
 * candidate that matches, so a matching IP rule beats a global rule no matter
 * what priority number either carries. Mirrors `findMatchingRule` in
 * `apps/backend/src/rules/rules.service.ts`.
 */
const SCOPE_ORDER = ['IP', 'API_KEY', 'USER_TIER', 'ENDPOINT', 'GLOBAL'];

function scopeRank(scope: string): number {
  const index = SCOPE_ORDER.indexOf(scope);
  return index === -1 ? SCOPE_ORDER.length : index;
}

/**
 * Sorts rules the way the gateway actually walks them: scope class first, then
 * ascending priority (the backend orders `priority: 'asc'`, so the *lowest*
 * number wins). Inactive rules are excluded from evaluation entirely, so they
 * sink to the bottom and are never assigned an evaluation position.
 */
function inEvaluationOrder(rules: RuleRecord[]): RuleRecord[] {
  return [...rules].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    const scopeDelta = scopeRank(a.scope) - scopeRank(b.scope);
    if (scopeDelta !== 0) return scopeDelta;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.name.localeCompare(b.name);
  });
}

export default function RulesPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId as string;

  const rules = useAsyncResource<RuleRecord[]>(
    () => rulesApi.list(projectId),
    [projectId],
  );
  const [pending, setPending] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleRecord | null>(null);
  const [deletingRule, setDeletingRule] = useState<RuleRecord | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    rules.setError('');

    const form = event.currentTarget;
    const formData = new FormData(form);
    const input: CreateRuleInput = {
      name: String(formData.get('name') ?? ''),
      description: readFormString(formData, 'description'),
      priority: readFormNumber(formData, 'priority') ?? 100,
      scope: String(formData.get('scope') ?? 'GLOBAL'),
      targetValue: readFormString(formData, 'targetValue'),
      endpointPattern: readFormString(formData, 'endpointPattern'),
      method: readFormString(formData, 'method'),
      userTier: readFormString(formData, 'userTier'),
      algorithm: String(formData.get('algorithm') ?? 'FIXED_WINDOW'),
      limit: readFormNumber(formData, 'limit') ?? 100,
      windowSeconds: readFormNumber(formData, 'windowSeconds') ?? 60,
      burstCapacity: readFormNumber(formData, 'burstCapacity'),
    };

    try {
      await rulesApi.create(projectId, input);
      form.reset();
      setShowForm(false);
      await rules.reload();
    } catch (caughtError) {
      rules.setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to create rule',
      );
    } finally {
      setPending(false);
    }
  }

  async function handleToggle(rule: RuleRecord) {
    setTogglingId(rule.id);
    try {
      await rulesApi.update(projectId, rule.id, { isActive: !rule.isActive });
      await rules.reload();
    } catch {
      rules.setError('Failed to toggle rule');
    } finally {
      setTogglingId(null);
    }
  }

  async function handleEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingRule) return;
    setEditPending(true);
    setEditError('');
    const form = e.currentTarget;
    const formData = new FormData(form);
    try {
      await rulesApi.update(projectId, editingRule.id, {
        name: String(formData.get('name') ?? ''),
        description: readFormString(formData, 'description'),
        priority: readFormNumber(formData, 'priority') ?? editingRule.priority,
        limit: readFormNumber(formData, 'limit') ?? editingRule.limit,
        windowSeconds: readFormNumber(formData, 'windowSeconds') ?? editingRule.windowSeconds,
        burstCapacity: readFormNumber(formData, 'burstCapacity'),
      });
      setEditingRule(null);
      await rules.reload();
    } catch {
      setEditError('Failed to update rule. Please try again.');
    } finally {
      setEditPending(false);
    }
  }

  async function confirmDelete() {
    if (!deletingRule) return;
    setDeletePending(true);
    try {
      await rulesApi.remove(projectId, deletingRule.id);
      setDeletingRule(null);
      await rules.reload();
    } catch (caughtError) {
      rules.setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to delete rule',
      );
    } finally {
      setDeletePending(false);
    }
  }

  const list = rules.data ?? [];
  const ordered = useMemo(() => inEvaluationOrder(list), [list]);
  const activeCount = list.filter((rule) => rule.isActive).length;

  return (
    <>
      <PageHeader
        crumbs={[
          { href: '/projects', label: 'Projects' },
          { href: `/projects/${projectId}`, label: 'Project' },
          { label: 'Rules' },
        ]}
        eyebrow="Policy"
        title="Rate-limit rules"
        description="Listed in the order the gateway evaluates them. The first rule that matches a request wins."
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowForm((s) => !s)}
          >
            {showForm ? 'Close' : 'New rule'}
          </button>
        }
      />
      <ProjectTabs projectId={projectId} />

      {showForm ? (
        <Panel className="mb-6">
          <PanelHeader eyebrow="Create" title="New rule" />
          <form
            className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            onSubmit={handleCreate}
          >
            <div className="sm:col-span-2">
              <label className="label" htmlFor="new-name">Name</label>
              <input id="new-name" className="field" name="name" required placeholder="Throttle public endpoints" />
            </div>
            <div>
              <label className="label" htmlFor="new-priority">Priority</label>
              <input id="new-priority" className="field" name="priority" type="number" defaultValue="100" required />
              <p className="mt-1 text-2xs text-slate-500">Lower runs first</p>
            </div>
            <div>
              <label className="label" htmlFor="new-scope">Scope</label>
              <select id="new-scope" className="field" name="scope" defaultValue="GLOBAL">
                <option value="IP">IP address</option>
                <option value="API_KEY">API key</option>
                <option value="USER_TIER">User tier</option>
                <option value="ENDPOINT">Endpoint</option>
                <option value="GLOBAL">Global</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="new-algorithm">Algorithm</label>
              <select id="new-algorithm" className="field" name="algorithm" defaultValue="FIXED_WINDOW">
                <option value="FIXED_WINDOW">Fixed window</option>
                <option value="SLIDING_WINDOW_LOG">Sliding window log</option>
                <option value="SLIDING_WINDOW_COUNTER">Sliding window counter</option>
                <option value="TOKEN_BUCKET">Token bucket</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="new-target">Target value</label>
              <input id="new-target" className="field font-mono" name="targetValue" placeholder="e.g. 1.2.3.4" />
            </div>
            <div>
              <label className="label" htmlFor="new-endpoint">Endpoint pattern</label>
              <input id="new-endpoint" className="field font-mono" name="endpointPattern" placeholder="/api/products*" />
            </div>
            <div>
              <label className="label" htmlFor="new-method">Method</label>
              <select id="new-method" className="field" name="method" defaultValue="">
                <option value="">Any method</option>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="new-tier">User tier</label>
              <select id="new-tier" className="field" name="userTier" defaultValue="">
                <option value="">Any tier</option>
                <option value="FREE">Free</option>
                <option value="PRO">Pro</option>
                <option value="BUSINESS">Business</option>
                <option value="ENTERPRISE">Enterprise</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="new-limit">Limit</label>
              <input id="new-limit" className="field" name="limit" type="number" defaultValue="100" required />
              <p className="mt-1 text-2xs text-slate-500">Requests per window</p>
            </div>
            <div>
              <label className="label" htmlFor="new-window">Window</label>
              <input id="new-window" className="field" name="windowSeconds" type="number" defaultValue="60" required />
              <p className="mt-1 text-2xs text-slate-500">Seconds</p>
            </div>
            <div>
              <label className="label" htmlFor="new-burst">Burst capacity</label>
              <input id="new-burst" className="field" name="burstCapacity" type="number" placeholder="optional" />
              <p className="mt-1 text-2xs text-slate-500">Token bucket only</p>
            </div>
            <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4">
              <label className="label" htmlFor="new-description">Description</label>
              <input id="new-description" className="field" name="description" placeholder="What this rule protects, and why" />
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3 xl:col-span-4">
              <button type="submit" className="btn-primary" disabled={pending}>
                {pending ? 'Creating…' : 'Create rule'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      ) : null}

      {rules.error ? (
        <div className="mb-6"><ErrorState message={rules.error} /></div>
      ) : null}

      {rules.loading ? (
        <LoadingState label="Loading rules…" />
      ) : list.length === 0 ? (
        <Panel>
          <div className="py-10 text-center">
            <p className="text-sm font-medium text-slate-800">No rules yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
              Without a rule, every request through the gateway is allowed. Add
              one to start enforcing a limit.
            </p>
            <button type="button" className="btn-primary mt-4" onClick={() => setShowForm(true)}>
              Create the first rule
            </button>
          </div>
        </Panel>
      ) : (
        <Panel padding={false}>
          {/* Precedence is the whole job of this screen, so it is stated where
              the table is read, not buried in the page description. */}
          <div className="border-b border-slate-200 px-4 py-3 text-xs text-slate-500 sm:px-5">
            Scope decides first — IP, then API key, user tier, endpoint, global.
            Within one scope the lowest priority number runs first.{' '}
            <span className="text-slate-700">
              {activeCount} of {list.length} {list.length === 1 ? 'rule is' : 'rules are'} active.
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="tbl min-w-[54rem]">
              <thead>
                <tr>
                  <th scope="col" className="w-12 !text-right">#</th>
                  <th scope="col">Rule</th>
                  <th scope="col">Scope</th>
                  <th scope="col">Algorithm</th>
                  <th scope="col" className="!text-right">Limit</th>
                  <th scope="col" className="!text-right">Window</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((rule, index) => {
                  const position = rule.isActive ? index + 1 : null;
                  return (
                    <tr key={rule.id} className={rule.isActive ? undefined : 'opacity-60'}>
                      <td className="!text-right">
                        <span
                          className="num text-xs font-semibold text-slate-500"
                          title={
                            position
                              ? `Evaluated ${position} of ${activeCount}`
                              : 'Inactive rules are skipped entirely'
                          }
                        >
                          {position ?? '—'}
                        </span>
                      </td>
                      <td>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{rule.name}</p>
                          {rule.description ? (
                            <p className="mt-0.5 max-w-md truncate text-xs text-slate-500">
                              {rule.description}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <span className="text-slate-700">{scopeLabel(rule.scope)}</span>
                        {rule.targetValue || rule.endpointPattern ? (
                          <p className="mt-0.5 max-w-[14rem] truncate font-mono text-2xs text-slate-500">
                            {rule.targetValue ?? rule.endpointPattern}
                          </p>
                        ) : null}
                      </td>
                      <td className="text-slate-600">{algorithmLabel(rule.algorithm)}</td>
                      <td className="!text-right">
                        <span className="num font-mono text-slate-800">
                          {formatCount(rule.limit)}
                        </span>
                      </td>
                      <td className="!text-right">
                        <span
                          className="num font-mono text-slate-800"
                          title={`${rule.windowSeconds} seconds`}
                        >
                          {formatDuration(rule.windowSeconds)}
                        </span>
                      </td>
                      <td>
                        <span className={rule.isActive ? 'badge-success' : 'badge-warning'}>
                          {rule.isActive ? 'Active' : 'Paused'}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggle(rule)}
                            disabled={togglingId === rule.id}
                            className="btn-ghost btn-sm"
                          >
                            {togglingId === rule.id
                              ? '…'
                              : rule.isActive
                                ? 'Pause'
                                : 'Resume'}
                          </button>
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            onClick={() => { setEditingRule(rule); setEditError(''); }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn-ghost btn-sm !text-slate-500 hover:!text-red-700"
                            onClick={() => setDeletingRule(rule)}
                            aria-label={`Delete ${rule.name}`}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Edit */}
      {editingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 px-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-raised p-6 shadow-overlay">
            <h2 className="text-lg font-semibold text-slate-900">Edit rule</h2>
            <p className="mt-1 text-sm text-slate-500">{editingRule.name}</p>
            <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={handleEdit}>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="edit-rule-name">Name</label>
                <input id="edit-rule-name" className="field" name="name" defaultValue={editingRule.name} required />
              </div>
              <div>
                <label className="label" htmlFor="edit-rule-priority">Priority</label>
                <input id="edit-rule-priority" className="field" name="priority" type="number" defaultValue={editingRule.priority} required />
                <p className="mt-1 text-2xs text-slate-500">Lower runs first</p>
              </div>
              <div>
                <label className="label" htmlFor="edit-rule-limit">Limit</label>
                <input id="edit-rule-limit" className="field" name="limit" type="number" defaultValue={editingRule.limit} required />
              </div>
              <div>
                <label className="label" htmlFor="edit-rule-window">Window (seconds)</label>
                <input id="edit-rule-window" className="field" name="windowSeconds" type="number" defaultValue={editingRule.windowSeconds} required />
              </div>
              <div>
                <label className="label" htmlFor="edit-rule-burst">Burst capacity</label>
                <input id="edit-rule-burst" className="field" name="burstCapacity" type="number" defaultValue={editingRule.burstCapacity ?? ''} placeholder="optional" />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="edit-rule-description">Description</label>
                <input id="edit-rule-description" className="field" name="description" defaultValue={editingRule.description ?? ''} placeholder="What this rule protects, and why" />
              </div>
              {editError && <p className="text-sm text-red-700 sm:col-span-2">{editError}</p>}
              <div className="flex gap-2 sm:col-span-2">
                <button type="submit" className="btn-primary" disabled={editPending}>
                  {editPending ? 'Saving…' : 'Save changes'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setEditingRule(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete — a rule used to vanish on a single click with no way back. */}
      {deletingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 px-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-raised p-6 shadow-overlay">
            <h2 className="text-lg font-semibold text-slate-900">
              Delete “{deletingRule.name}”?
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Traffic matching {scopeLabel(deletingRule.scope).toLowerCase()} will
              fall through to the next rule that matches, or be allowed if none
              does. This cannot be undone.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="btn-danger-solid"
                onClick={confirmDelete}
                disabled={deletePending}
              >
                {deletePending ? 'Deleting…' : 'Delete rule'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeletingRule(null)}
                disabled={deletePending}
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
