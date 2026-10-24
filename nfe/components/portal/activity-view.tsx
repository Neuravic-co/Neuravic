"use client";

import { describeActivity, displayName, formatDateTime, type ActivityItem } from "@/lib/portal";
import { usePaged } from "./use-query";
import { Empty, ErrorNote, Loading, SectionHeader } from "./ui";

export function ActivityView({ orgId }: { orgId: string }) {
  const feed = usePaged<ActivityItem>(`/orgs/${orgId}/activity`, {}, 30);

  return (
    <section>
      <SectionHeader title="Activity" />
      {feed.loading ? <Loading label="Loading activity" /> : null}
      {feed.error ? <ErrorNote error={feed.error} onRetry={feed.reload} /> : null}
      {!feed.loading && !feed.error && feed.items.length === 0 ? <Empty title="No activity yet" /> : null}
      <ul className="portal-timeline">
        {feed.items.map((item) => (
          <li key={item.id}>
            <p>
              <strong>{displayName(item.actorName, item.actorEmail)}</strong> {describeActivity(item.action)}
            </p>
            <time>{formatDateTime(item.createdAt)}</time>
          </li>
        ))}
      </ul>
      {feed.hasMore ? (
        <button type="button" className="portal-button portal-button--quiet" onClick={() => void feed.loadMore()} disabled={feed.loadingMore}>
          {feed.loadingMore ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </section>
  );
}
