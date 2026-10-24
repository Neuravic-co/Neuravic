"use client";

import { useId, useState, type FormEvent } from "react";
import { API_BASE, api } from "@/lib/api";
import { formatDate, formatDateTime, type Lead, type LeadNote, type LeadStatus, type Org } from "@/lib/portal";
import { useAction, usePaged, useQuery } from "./use-query";
import { Badge, Empty, ErrorNote, Field, Loading, SectionHeader } from "./ui";

/** Staff admin: all client organisations and a form to create one. */
export function OrganisationsView({ onCreated, onOpen }: { onCreated: () => void; onOpen: (orgId: string) => void }) {
  const orgs = usePaged<Org>("/orgs", {}, 50);
  const [creating, setCreating] = useState(false);

  return (
    <section>
      <SectionHeader
        title="Organisations"
        action={
          <button type="button" className="portal-button portal-button--primary" onClick={() => setCreating((open) => !open)} aria-expanded={creating}>
            {creating ? "Close" : "New organisation"}
          </button>
        }
      />
      {creating ? (
        <NewOrgForm
          onCreated={() => {
            setCreating(false);
            orgs.reload();
            onCreated();
          }}
        />
      ) : null}
      {orgs.loading ? <Loading label="Loading organisations" /> : null}
      {orgs.error ? <ErrorNote error={orgs.error} onRetry={orgs.reload} /> : null}
      {!orgs.loading && !orgs.error && orgs.items.length === 0 ? (
        <Empty title="No organisations yet">Create one and invite its first owner.</Empty>
      ) : null}
      <ul className="portal-list">
        {orgs.items.map((org) => (
          <li key={org.id}>
            <button type="button" className="portal-row" onClick={() => onOpen(org.id)}>
              <span className="portal-row__main">
                <strong>{org.name}</strong>
                <span className="portal-row__sub">{org.slug}</span>
              </span>
              <span />
              <span className="portal-row__meta">{formatDate(org.createdAt)}</span>
            </button>
          </li>
        ))}
      </ul>
      {orgs.hasMore ? (
        <button type="button" className="portal-button portal-button--quiet" onClick={() => void orgs.loadMore()} disabled={orgs.loadingMore}>
          {orgs.loadingMore ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </section>
  );
}

function NewOrgForm({ onCreated }: { onCreated: () => void }) {
  const id = useId();
  const { busy, error, run } = useAction();
  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await run(() =>
      api("/orgs", { method: "POST", body: { name: name.trim(), ownerEmail: ownerEmail.trim() || undefined } }),
    );
    if (ok) onCreated();
  }

  return (
    <form className="portal-form" onSubmit={submit}>
      <Field label="Organisation name" htmlFor={`${id}-name`}>
        <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={120} required />
      </Field>
      <Field label="First owner's email" hint="optional, they receive an invitation" htmlFor={`${id}-owner`}>
        <input id={`${id}-owner`} type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} autoComplete="off" />
      </Field>
      {error ? <ErrorNote error={error} /> : null}
      <button type="submit" className="portal-button portal-button--primary" disabled={busy}>
        {busy ? "Creating…" : "Create organisation"}
      </button>
    </form>
  );
}

const LEAD_STATUSES: LeadStatus[] = ["new", "qualified", "won", "lost", "spam"];
const LEAD_TONE: Record<LeadStatus, "active" | "done" | "muted" | "neutral"> = {
  new: "active",
  qualified: "active",
  won: "done",
  lost: "muted",
  spam: "muted",
};

/** Staff (admin, sales): enquiries from the website contact form. */
export function LeadsView() {
  const [status, setStatus] = useState("");
  const leads = usePaged<Lead>("/leads", { status: status || undefined });
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section>
      <SectionHeader
        title="Enquiries"
        action={
          <a className="portal-button" href={`${API_BASE}/leads/export.csv`} download>
            Export CSV
          </a>
        }
      />
      <div className="portal-chips" role="group" aria-label="Filter by status">
        {["", ...LEAD_STATUSES].map((value) => (
          <button
            type="button"
            key={value || "all"}
            className={status === value ? "is-selected" : ""}
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
          >
            {value || "All"}
          </button>
        ))}
      </div>
      {leads.loading ? <Loading label="Loading enquiries" /> : null}
      {leads.error ? <ErrorNote error={leads.error} onRetry={leads.reload} /> : null}
      {!leads.loading && !leads.error && leads.items.length === 0 ? <Empty title="No enquiries" /> : null}
      <ul className="portal-list">
        {leads.items.map((lead) => (
          <li key={lead.id}>
            <button type="button" className="portal-row" aria-expanded={openId === lead.id} onClick={() => setOpenId(openId === lead.id ? null : lead.id)}>
              <span className="portal-row__main">
                <strong>{lead.name}</strong>
                <span className="portal-row__sub">
                  {lead.email}
                  {lead.company ? ` · ${lead.company}` : ""}
                </span>
              </span>
              <Badge tone={LEAD_TONE[lead.status]}>{lead.status}</Badge>
              <span className="portal-row__meta">{formatDate(lead.createdAt)}</span>
            </button>
            {openId === lead.id ? <LeadDetail leadId={lead.id} onChanged={leads.reload} /> : null}
          </li>
        ))}
      </ul>
      {leads.hasMore ? (
        <button type="button" className="portal-button portal-button--quiet" onClick={() => void leads.loadMore()} disabled={leads.loadingMore}>
          {leads.loadingMore ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </section>
  );
}

function LeadDetail({ leadId, onChanged }: { leadId: string; onChanged: () => void }) {
  const id = useId();
  const detail = useQuery(() => api<Lead & { notes: LeadNote[] }>(`/leads/${leadId}`), [leadId]);
  const action = useAction();
  const [note, setNote] = useState("");

  if (detail.loading && !detail.data) return <Loading label="Loading enquiry" />;
  if (detail.error) return <ErrorNote error={detail.error} onRetry={detail.reload} />;
  const lead = detail.data;
  if (!lead) return null;

  async function setStatus(next: LeadStatus) {
    const ok = await action.run(() => api(`/leads/${leadId}`, { method: "PATCH", body: { status: next } }));
    if (ok) {
      detail.reload();
      onChanged();
    }
  }

  async function addNote(event: FormEvent) {
    event.preventDefault();
    if (!note.trim()) return;
    const ok = await action.run(() => api(`/leads/${leadId}/notes`, { method: "POST", body: { body: note.trim() } }));
    if (ok) {
      setNote("");
      detail.reload();
    }
  }

  return (
    <div className="portal-lead">
      <p className="portal-request__body">{lead.message}</p>
      <dl className="portal-facts">
        <div>
          <dt>Received</dt>
          <dd>{formatDateTime(lead.createdAt)}</dd>
        </div>
        <div>
          <dt>Services</dt>
          <dd>{lead.serviceInterest.length ? lead.serviceInterest.join(", ") : "Not specified"}</dd>
        </div>
        <div>
          <dt>Reply to</dt>
          <dd>
            <a href={`mailto:${lead.email}`}>{lead.email}</a>
          </dd>
        </div>
      </dl>
      <label className="portal-inline-select">
        <span>Status</span>
        <select value={lead.status} disabled={action.busy} onChange={(e) => void setStatus(e.target.value as LeadStatus)}>
          {LEAD_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <ul className="portal-thread">
        {lead.notes.map((n) => (
          <li key={n.id}>
            <p>{n.body}</p>
            <time>{formatDateTime(n.createdAt)}</time>
          </li>
        ))}
      </ul>
      <form className="portal-form" onSubmit={addNote}>
        <Field label="Internal note" htmlFor={`${id}-note`}>
          <textarea id={`${id}-note`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} />
        </Field>
        {action.error ? <ErrorNote error={action.error} /> : null}
        <button type="submit" className="portal-button" disabled={action.busy || !note.trim()}>
          Add note
        </button>
      </form>
    </div>
  );
}
