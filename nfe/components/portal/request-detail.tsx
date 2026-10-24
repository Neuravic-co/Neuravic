"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { API_BASE, api } from "@/lib/api";
import {
  atLeast,
  displayName,
  formatBytes,
  formatDateTime,
  REQUEST_TYPE_LABELS,
  type OrgRole,
  type RequestDetail as RequestDetailData,
} from "@/lib/portal";
import { STATE_TONE } from "./request-list";
import { useMe } from "./session";
import { useAction, usePaged, useQuery } from "./use-query";
import { Badge, ErrorNote, Field, Loading } from "./ui";

const ALLOWED_FILE_TYPES =
  "application/pdf,image/png,image/jpeg,image/webp,text/plain,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function RequestDetail({
  requestId,
  roleFor,
  onBack,
  backLabel,
}: {
  requestId: string;
  /** Resolves the caller's role in the request's organisation. */
  roleFor: (orgId: string) => OrgRole | null;
  onBack: () => void;
  backLabel: string;
}) {
  const me = useMe();
  const query = useQuery(() => api<RequestDetailData>(`/requests/${requestId}`), [requestId]);

  if (query.loading && !query.data) return <Loading label="Loading request" />;
  if (query.error) return <ErrorNote error={query.error} onRetry={query.reload} />;
  const request = query.data;
  if (!request) return null;

  const role = roleFor(request.orgId);
  const isRequester = request.requestedBy === me.user.id;
  const isApprover = atLeast(role, "admin") && !isRequester;
  const alreadyDecided = request.approvals.some((a) => a.approverId === me.user.id);
  const approvedCount = request.approvals.filter((a) => a.decision === "approved").length;

  return (
    <article>
      <button type="button" className="portal-link portal-back" onClick={onBack}>
        ← {backLabel}
      </button>
      <header className="portal-request__head">
        <h2>{request.title}</h2>
        <div className="portal-meta">
          <Badge tone={STATE_TONE[request.state]}>{request.state}</Badge>
          <span>{REQUEST_TYPE_LABELS[request.type]}</span>
          <span>
            {displayName(request.requesterName, request.requesterEmail)} · {formatDateTime(request.createdAt)}
          </span>
          {request.state === "open" ? (
            <span>
              {approvedCount} of {request.requiredApprovals} approvals
            </span>
          ) : null}
        </div>
      </header>
      <p className="portal-request__body">{request.body}</p>

      <RequestActions request={request} role={role} isRequester={isRequester} onChanged={query.reload} />

      {request.state === "open" && isApprover && !alreadyDecided ? (
        <DecisionForm requestId={request.id} onDecided={query.reload} />
      ) : null}
      {request.state === "open" && isRequester && atLeast(role, "admin") ? (
        <p className="portal-hint">You submitted this request, so someone else needs to approve it.</p>
      ) : null}

      <h3 className="portal-subhead">Approvals</h3>
      {request.approvals.length === 0 ? (
        <p className="portal-hint">No decisions yet.</p>
      ) : (
        <ul className="portal-thread">
          {request.approvals.map((approval) => (
            <li key={approval.id}>
              <div>
                <strong>{displayName(approval.approverName, approval.approverEmail)}</strong>{" "}
                <Badge tone={approval.decision === "approved" ? "done" : "muted"}>{approval.decision}</Badge>
              </div>
              {approval.comment ? <p>{approval.comment}</p> : null}
              <time>{formatDateTime(approval.decidedAt)}</time>
            </li>
          ))}
        </ul>
      )}

      <Files request={request} canUpload={atLeast(role, "member") && request.state !== "cancelled"} canManage={atLeast(role, "admin")} onChanged={query.reload} />
      <Comments request={request} canComment={atLeast(role, "member")} onChanged={query.reload} />
    </article>
  );
}

function RequestActions({
  request,
  role,
  isRequester,
  onChanged,
}: {
  request: RequestDetailData;
  role: OrgRole | null;
  isRequester: boolean;
  onChanged: () => void;
}) {
  const { busy, error, run } = useAction();
  const canCancel = request.state === "open" && (isRequester || atLeast(role, "admin"));
  const canComplete = request.state === "approved" && atLeast(role, "admin");
  if (!canCancel && !canComplete) return null;

  async function change(state: "cancelled" | "completed") {
    if (state === "cancelled" && !window.confirm("Cancel this request?")) return;
    const ok = await run(() => api(`/requests/${request.id}`, { method: "PATCH", body: { state } }));
    if (ok) onChanged();
  }

  return (
    <div className="portal-actions">
      {canComplete ? (
        <button type="button" className="portal-button portal-button--primary" disabled={busy} onClick={() => void change("completed")}>
          Mark as completed
        </button>
      ) : null}
      {canCancel ? (
        <button type="button" className="portal-button" disabled={busy} onClick={() => void change("cancelled")}>
          Cancel request
        </button>
      ) : null}
      {error ? <ErrorNote error={error} /> : null}
    </div>
  );
}

function DecisionForm({ requestId, onDecided }: { requestId: string; onDecided: () => void }) {
  const id = useId();
  const { busy, error, run } = useAction();
  const [comment, setComment] = useState("");

  async function decide(decision: "approved" | "rejected") {
    const ok = await run(() =>
      api(`/requests/${requestId}/approvals`, { method: "POST", body: { decision, comment: comment.trim() || undefined } }),
    );
    if (ok) onDecided();
  }

  return (
    <div className="portal-form portal-decision">
      <Field label="Your decision" hint="comment is optional" htmlFor={`${id}-comment`}>
        <textarea id={`${id}-comment`} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} />
      </Field>
      {error ? <ErrorNote error={error} /> : null}
      <div className="portal-actions">
        <button type="button" className="portal-button portal-button--primary" disabled={busy} onClick={() => void decide("approved")}>
          Approve
        </button>
        <button type="button" className="portal-button" disabled={busy} onClick={() => void decide("rejected")}>
          Reject
        </button>
      </div>
    </div>
  );
}

function Files({
  request,
  canUpload,
  canManage,
  onChanged,
}: {
  request: RequestDetailData;
  canUpload: boolean;
  canManage: boolean;
  onChanged: () => void;
}) {
  const me = useMe();
  const input = useRef<HTMLInputElement>(null);
  const { busy, error, run } = useAction();
  const [localError, setLocalError] = useState("");

  async function upload(file: File | undefined) {
    if (!file) return;
    setLocalError("");
    if (file.size > MAX_FILE_BYTES) {
      setLocalError("That file is larger than 10 MB.");
      return;
    }
    const ok = await run(() =>
      api(`/requests/${request.id}/files`, {
        method: "PUT",
        query: { name: file.name },
        rawBody: file,
        headers: { "content-type": file.type || "application/octet-stream" },
      }),
    );
    if (input.current) input.current.value = "";
    if (ok) onChanged();
  }

  async function remove(fileId: string) {
    if (!window.confirm("Remove this file?")) return;
    const ok = await run(() => api(`/files/${fileId}`, { method: "DELETE" }));
    if (ok) onChanged();
  }

  return (
    <>
      <h3 className="portal-subhead">Files</h3>
      {request.files.length === 0 ? <p className="portal-hint">No files attached.</p> : null}
      <ul className="portal-files">
        {request.files.map((file) => (
          <li key={file.id}>
            {file.scanState === "clean" ? <a href={`${API_BASE}/files/${file.id}/content`} download={file.name}>{file.name}</a> :
              <span>{file.name} — {file.scanState === "infected" ? "Blocked by security scan" : "Awaiting security scan"}</span>}
            <span>{formatBytes(file.size)}</span>
            {file.uploadedBy === me.user.id || canManage ? (
              <button type="button" className="portal-link" onClick={() => void remove(file.id)} disabled={busy}>
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {canUpload ? (
        <div className="portal-upload">
          <label className="portal-button">
            {busy ? "Uploading…" : "Attach a file"}
            <input ref={input} type="file" accept={ALLOWED_FILE_TYPES} disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} hidden />
          </label>
          <span className="portal-hint">PDF, images, text, CSV, Word or Excel. Up to 10 MB.</span>
        </div>
      ) : null}
      {localError ? <ErrorNote error={localError} /> : null}
      {error ? <ErrorNote error={error} /> : null}
    </>
  );
}

function Comments({
  request,
  canComment,
  onChanged,
}: {
  request: RequestDetailData;
  canComment: boolean;
  onChanged: () => void;
}) {
  const id = useId();
  const { busy, error, run } = useAction();
  const [body, setBody] = useState("");
  const comments = usePaged<RequestDetailData["comments"][number]>(`/requests/${request.id}/comments`, {});

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    const ok = await run(() => api(`/requests/${request.id}/comments`, { method: "POST", body: { body: body.trim() } }));
    if (ok) {
      setBody("");
      comments.reload();
      onChanged();
    }
  }

  return (
    <>
      <h3 className="portal-subhead">Comments</h3>
      {comments.loading ? <Loading label="Loading comments" /> : null}
      {comments.error ? <ErrorNote error={comments.error} onRetry={comments.reload} /> : null}
      {!comments.loading && comments.items.length === 0 ? <p className="portal-hint">No comments yet.</p> : null}
      <ul className="portal-thread">
        {[...comments.items].reverse().map((comment) => (
          <li key={comment.id}>
            <div>
              <strong>{displayName(comment.authorName, comment.authorEmail)}</strong>
            </div>
            <p>{comment.body}</p>
            <time>{formatDateTime(comment.createdAt)}</time>
          </li>
        ))}
      </ul>
      {comments.hasMore ? <button type="button" className="portal-button" onClick={() => void comments.loadMore()} disabled={comments.loadingMore}>Load older comments</button> : null}
      {canComment ? (
        <form className="portal-form" onSubmit={submit}>
          <Field label="Add a comment" htmlFor={`${id}-comment`}>
            <textarea id={`${id}-comment`} rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
          </Field>
          {error ? <ErrorNote error={error} /> : null}
          <button type="submit" className="portal-button" disabled={busy || !body.trim()}>
            {busy ? "Posting…" : "Post comment"}
          </button>
        </form>
      ) : null}
    </>
  );
}
