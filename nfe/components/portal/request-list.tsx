"use client";

import { displayName, formatDate, REQUEST_TYPE_LABELS, type PortalRequest, type RequestState } from "@/lib/portal";
import { Badge, Empty, ErrorNote, Loading } from "./ui";
import type { usePaged } from "./use-query";

export const STATE_TONE: Record<RequestState, "active" | "done" | "muted" | "neutral"> = {
  open: "active",
  approved: "done",
  completed: "done",
  rejected: "muted",
  cancelled: "muted",
};

export function RequestList({
  list,
  onOpen,
  emptyTitle,
  emptyHint,
}: {
  list: ReturnType<typeof usePaged<PortalRequest>>;
  onOpen: (id: string) => void;
  emptyTitle: string;
  emptyHint?: string;
}) {
  return (
    <>
      {list.loading ? <Loading label="Loading requests" /> : null}
      {list.error ? <ErrorNote error={list.error} onRetry={list.reload} /> : null}
      {!list.loading && !list.error && list.items.length === 0 ? <Empty title={emptyTitle}>{emptyHint}</Empty> : null}
      <ul className="portal-list">
        {list.items.map((request) => (
          <li key={request.id}>
            <button type="button" className="portal-row" onClick={() => onOpen(request.id)}>
              <span className="portal-row__main">
                <strong>{request.title}</strong>
                <span className="portal-row__sub">
                  {REQUEST_TYPE_LABELS[request.type]} · {displayName(request.requesterName, request.requesterEmail)}
                </span>
              </span>
              <Badge tone={STATE_TONE[request.state]}>{request.state}</Badge>
              <span className="portal-row__meta">{formatDate(request.createdAt)}</span>
            </button>
          </li>
        ))}
      </ul>
      {list.hasMore ? (
        <button type="button" className="portal-button portal-button--quiet" onClick={() => void list.loadMore()} disabled={list.loadingMore}>
          {list.loadingMore ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </>
  );
}
