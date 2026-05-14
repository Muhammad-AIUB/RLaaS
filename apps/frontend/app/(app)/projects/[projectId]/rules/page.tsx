'use client';

import { FormEvent, useState } from 'react';
import { useParams } from 'next/navigation';
import { ErrorState, LoadingState } from '@/components/feedback';
import { PageHeader, ProjectTabs } from '@/components/layout';
import { Panel, PanelHeader } from '@/components/ui';
import { rulesApi } from '@/lib/api';
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

  async function remove(ruleId: string) {
    try {
      await rulesApi.remove(projectId, ruleId);
      await rules.reload();
    } catch (caughtError) {
      rules.setError(
        caughtError instanceof Error ? caughtError.message : 'Failed to delete rule',
      );
    }
  }

  const list = rules.data ?? [];

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
        description="Translate policy into priorities. Rules are evaluated in priority order — highest first."
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
              <label className="label">Name</label>
              <input className="field" name="name" required placeholder="Throttle public endpoints" />
            </div>
            <div>
              <label className="label">Priority</label>
              <input className="field" name="priority" type="number" defaultValue="100" required />
            </div>
            <div>
              <label className="label">Scope</label>
              <select className="field" name="scope" defaultValue="GLOBAL">
                <option value="IP">IP</option>
                <option value="API_KEY">API Key</option>
                <option value="USER_TIER">User Tier</option>
                <option value="ENDPOINT">Endpoint</option>
                <option value="GLOBAL">Global</option>
              </select>
            </div>
            <div>
              <label className="label">Algorithm</label>
              <select className="field" name="algorithm" defaultValue="FIXED_WINDOW">
                <option value="FIXED_WINDOW">Fixed Window</option>
                <option value="SLIDING_WINDOW_LOG">Sliding Window Log</option>
                <option value="SLIDING_WINDOW_COUNTER">Sliding Window Counter</option>
                <option value="TOKEN_BUCKET">Token Bucket</option>
              </select>
            </div>
            <div>
              <label className="label">Target value</label>
              <input className="field" name="targetValue" placeholder="e.g. 1.2.3.4" />
            </div>
            <div>
              <label className="label">Endpoint pattern</label>
              <input className="field" name="endpointPattern" placeholder="/api/products*" />
            </div>
            <div>
              <label className="label">Method</label>
              <select className="field" name="method" defaultValue="">
                <option value="">Any method</option>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
            <div>
              <label className="label">User tier</label>
              <select className="field" name="userTier" defaultValue="">
                <option value="">Any tier</option>
                <option value="FREE">FREE</option>
                <option value="PRO">PRO</option>
                <option value="BUSINESS">BUSINESS</option>
                <option value="ENTERPRISE">ENTERPRISE</option>
              </select>
            </div>
            <div>
              <label className="label">Limit</label>
              <input className="field" name="limit" type="number" defaultValue="100" required />
            </div>
            <div>
              <label className="label">Window (s)</label>
              <input className="field" name="windowSeconds" type="number" defaultValue="60" required />
            </div>
            <div>
              <label className="label">Burst capacity</label>
              <input className="field" name="burstCapacity" type="number" placeholder="optional" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4">
              <label className="label">Description</label>
              <input className="field" name="description" placeholder="Optional description" />
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
          <p className="py-6 text-center text-sm text-slate-500">
            No rules yet. Create your first one above.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4">
          {list.map((rule) => (
            <Panel key={rule.id}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900">{rule.name}</h2>
                    <span className="badge-brand">{rule.scope}</span>
                    <span className="badge-neutral">{rule.algorithm}</span>
                    <span className={rule.isActive ? 'badge-success' : 'badge-warning'}>
                      <span className={`h-1.5 w-1.5 rounded-full ${rule.isActive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      {rule.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{rule.description || 'No description.'}</p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                    <div>
                      <dt className="text-slate-500">Priority</dt>
                      <dd className="font-medium text-slate-800">{rule.priority}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Limit</dt>
                      <dd className="font-medium text-slate-800">{rule.limit}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Window</dt>
                      <dd className="font-medium text-slate-800">{rule.windowSeconds}s</dd>
                    </div>
                  </dl>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {/* Toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggle(rule)}
                    disabled={togglingId === rule.id}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                      rule.isActive
                        ? 'border-amber-200 bg-white text-amber-600 hover:bg-amber-50'
                        : 'border-emerald-200 bg-white text-emerald-600 hover:bg-emerald-50'
                    }`}
                  >
                    {togglingId === rule.id ? '…' : rule.isActive ? 'Disable' : 'Enable'}
                  </button>
                  {/* Edit */}
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => { setEditingRule(rule); setEditError(''); }}
                  >
                    Edit
                  </button>
                  {/* Delete */}
                  <button
                    type="button"
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition"
                    onClick={() => remove(rule.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Edit Rule</h2>
            <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={handleEdit}>
              <div className="sm:col-span-2">
                <label className="label">Name</label>
                <input className="field" name="name" defaultValue={editingRule.name} required />
              </div>
              <div>
                <label className="label">Priority</label>
                <input className="field" name="priority" type="number" defaultValue={editingRule.priority} required />
              </div>
              <div>
                <label className="label">Limit</label>
                <input className="field" name="limit" type="number" defaultValue={editingRule.limit} required />
              </div>
              <div>
                <label className="label">Window (s)</label>
                <input className="field" name="windowSeconds" type="number" defaultValue={editingRule.windowSeconds} required />
              </div>
              <div>
                <label className="label">Burst capacity</label>
                <input className="field" name="burstCapacity" type="number" defaultValue={editingRule.burstCapacity ?? ''} placeholder="optional" />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Description</label>
                <input className="field" name="description" defaultValue={editingRule.description ?? ''} placeholder="Optional" />
              </div>
              {editError && <p className="sm:col-span-2 text-sm text-red-600">{editError}</p>}
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
    </>
  );
}
