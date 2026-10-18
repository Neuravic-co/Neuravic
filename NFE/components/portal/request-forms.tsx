"use client";

import { useId, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { REQUEST_TYPE_LABELS, type RequestType } from "@/lib/portal";
import { useAction } from "./use-query";
import { ErrorNote, Field } from "./ui";

export function NewRequestForm({ projectId, onCreated }: { projectId: string; onCreated: (requestId: string) => void }) {
  const id = useId();
  const { busy, error, run } = useAction();
  const [type, setType] = useState<RequestType>("access");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [approvals, setApprovals] = useState(1);

  async function submit(event: FormEvent) {
    event.preventDefault();
    let createdId = "";
    const ok = await run(async () => {
      const created = await api<{ id: string }>(`/projects/${projectId}/requests`, {
        method: "POST",
        body: { type, title: title.trim(), body: body.trim(), requiredApprovals: approvals },
      });
      createdId = created.id;
    });
    if (ok) onCreated(createdId);
  }

  return (
    <form className="portal-form" onSubmit={submit}>
      <div className="portal-form__row">
        <Field label="Type" htmlFor={`${id}-type`}>
          <select id={`${id}-type`} value={type} onChange={(e) => setType(e.target.value as RequestType)}>
            {(Object.keys(REQUEST_TYPE_LABELS) as RequestType[]).map((value) => (
              <option key={value} value={value}>
                {REQUEST_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Approvals needed" htmlFor={`${id}-approvals`}>
          <select id={`${id}-approvals`} value={approvals} onChange={(e) => setApprovals(Number(e.target.value))}>
            <option value={1}>1 approval</option>
            <option value={2}>2 approvals</option>
            <option value={3}>3 approvals</option>
          </select>
        </Field>
      </div>
      <Field label="Title" htmlFor={`${id}-title`}>
        <input id={`${id}-title`} value={title} onChange={(e) => setTitle(e.target.value)} minLength={3} maxLength={160} required />
      </Field>
      <Field label="Details" htmlFor={`${id}-body`}>
        <textarea id={`${id}-body`} rows={5} value={body} onChange={(e) => setBody(e.target.value)} maxLength={8000} required />
      </Field>
      {error ? <ErrorNote error={error} /> : null}
      <button type="submit" className="portal-button portal-button--primary" disabled={busy}>
        {busy ? "Submitting…" : "Submit request"}
      </button>
    </form>
  );
}
