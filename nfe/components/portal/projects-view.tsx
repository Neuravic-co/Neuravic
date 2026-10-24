"use client";

import { useId, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { atLeast, formatDate, type OrgRole, type Project, type ProjectStatus, type PortalRequest } from "@/lib/portal";
import { RequestList } from "./request-list";
import { NewRequestForm } from "./request-forms";
import { useAction, usePaged, useQuery } from "./use-query";
import { Badge, Empty, ErrorNote, Field, Loading, SectionHeader } from "./ui";

const STATUS_TONE: Record<ProjectStatus, "active" | "muted" | "done"> = { active: "active", paused: "muted", completed: "done" };

export function ProjectsView({
  orgId,
  role,
  projectId,
  onSelectProject,
  onOpenRequest,
}: {
  orgId: string;
  role: OrgRole;
  projectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  onOpenRequest: (requestId: string) => void;
}) {
  if (projectId) {
    return <ProjectPage projectId={projectId} role={role} onBack={() => onSelectProject(null)} onOpenRequest={onOpenRequest} />;
  }
  return <ProjectList orgId={orgId} role={role} onSelectProject={onSelectProject} />;
}

function ProjectList({ orgId, role, onSelectProject }: { orgId: string; role: OrgRole; onSelectProject: (id: string) => void }) {
  const list = usePaged<Project>(`/orgs/${orgId}/projects`, {});
  const [creating, setCreating] = useState(false);

  return (
    <section>
      <SectionHeader
        title="Projects"
        action={
          atLeast(role, "admin") ? (
            <button type="button" className="portal-button" onClick={() => setCreating((open) => !open)} aria-expanded={creating}>
              {creating ? "Close" : "New project"}
            </button>
          ) : null
        }
      />
      {creating ? (
        <NewProjectForm
          orgId={orgId}
          onCreated={() => {
            setCreating(false);
            list.reload();
          }}
        />
      ) : null}

      {list.loading ? <Loading label="Loading projects" /> : null}
      {list.error ? <ErrorNote error={list.error} onRetry={list.reload} /> : null}
      {!list.loading && !list.error && list.items.length === 0 ? (
        <Empty title="No projects yet">
          {atLeast(role, "admin") ? "Create the first project to start collecting requests." : "Your Neuravic team will add projects here."}
        </Empty>
      ) : null}

      <ul className="portal-list">
        {list.items.map((project) => (
          <li key={project.id}>
            <button type="button" className="portal-row" onClick={() => onSelectProject(project.id)}>
              <span className="portal-row__main">
                <strong>{project.name}</strong>
                {project.description ? <span className="portal-row__sub">{project.description}</span> : null}
              </span>
              <Badge tone={STATUS_TONE[project.status]}>{project.status}</Badge>
              <span className="portal-row__meta">{formatDate(project.createdAt)}</span>
            </button>
          </li>
        ))}
      </ul>
      {list.hasMore ? (
        <button type="button" className="portal-button portal-button--quiet" onClick={() => void list.loadMore()} disabled={list.loadingMore}>
          {list.loadingMore ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </section>
  );
}

function NewProjectForm({ orgId, onCreated }: { orgId: string; onCreated: () => void }) {
  const id = useId();
  const { busy, error, run } = useAction();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await run(() =>
      api(`/orgs/${orgId}/projects`, { method: "POST", body: { name: name.trim(), description: description.trim() || undefined } }),
    );
    if (ok) onCreated();
  }

  return (
    <form className="portal-form" onSubmit={submit}>
      <Field label="Project name" htmlFor={`${id}-name`}>
        <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={120} required />
      </Field>
      <Field label="Description" hint="optional" htmlFor={`${id}-desc`}>
        <textarea id={`${id}-desc`} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
      </Field>
      {error ? <ErrorNote error={error} /> : null}
      <button type="submit" className="portal-button portal-button--primary" disabled={busy}>
        {busy ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}

const STATE_FILTERS = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export function StateFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="portal-chips" role="group" aria-label="Filter by status">
      {STATE_FILTERS.map((filter) => (
        <button
          type="button"
          key={filter.value}
          className={value === filter.value ? "is-selected" : ""}
          aria-pressed={value === filter.value}
          onClick={() => onChange(filter.value)}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}

function ProjectPage({
  projectId,
  role,
  onBack,
  onOpenRequest,
}: {
  projectId: string;
  role: OrgRole;
  onBack: () => void;
  onOpenRequest: (id: string) => void;
}) {
  const project = useQuery(() => api<Project>(`/projects/${projectId}`), [projectId]);
  const [state, setState] = useState("");
  const requests = usePaged<PortalRequest>(`/projects/${projectId}/requests`, { state: state || undefined });
  const [composing, setComposing] = useState(false);
  const status = useAction();

  async function changeStatus(next: ProjectStatus) {
    const ok = await status.run(() => api(`/projects/${projectId}`, { method: "PATCH", body: { status: next } }));
    if (ok) project.reload();
  }

  if (project.loading && !project.data) return <Loading label="Loading project" />;
  if (project.error) return <ErrorNote error={project.error} onRetry={project.reload} />;
  const data = project.data;
  if (!data) return null;

  return (
    <section>
      <button type="button" className="portal-link portal-back" onClick={onBack}>
        ← All projects
      </button>
      <SectionHeader
        title={data.name}
        action={
          atLeast(role, "member") && data.status === "active" ? (
            <button type="button" className="portal-button portal-button--primary" onClick={() => setComposing((open) => !open)} aria-expanded={composing}>
              {composing ? "Close" : "New request"}
            </button>
          ) : null
        }
      />
      <div className="portal-meta">
        <Badge tone={STATUS_TONE[data.status]}>{data.status}</Badge>
        <span>Created {formatDate(data.createdAt)}</span>
        {atLeast(role, "admin") ? (
          <label className="portal-inline-select">
            <span>Status</span>
            <select value={data.status} disabled={status.busy} onChange={(e) => void changeStatus(e.target.value as ProjectStatus)}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
          </label>
        ) : null}
      </div>
      {data.description ? <p className="portal-lede">{data.description}</p> : null}
      {status.error ? <ErrorNote error={status.error} /> : null}

      {composing ? (
        <NewRequestForm
          projectId={projectId}
          onCreated={(id) => {
            setComposing(false);
            onOpenRequest(id);
          }}
        />
      ) : null}

      <h3 className="portal-subhead">Requests</h3>
      <StateFilter value={state} onChange={setState} />
      <RequestList list={requests} emptyTitle="No requests here" emptyHint="Submit a request to start an approval." onOpen={onOpenRequest} />
    </section>
  );
}

