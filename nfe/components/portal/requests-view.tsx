"use client";

import { useState } from "react";
import type { PortalRequest } from "@/lib/portal";
import { StateFilter } from "./projects-view";
import { RequestList } from "./request-list";
import { usePaged } from "./use-query";
import { SectionHeader } from "./ui";

/** Organisation-wide request queue. Defaults to the requests waiting for a decision. */
export function RequestsView({ orgId, onOpenRequest }: { orgId: string; onOpenRequest: (id: string) => void }) {
  const [state, setState] = useState("open");
  const requests = usePaged<PortalRequest>(`/orgs/${orgId}/requests`, { state: state || undefined });

  return (
    <section>
      <SectionHeader title="Requests" />
      <StateFilter value={state} onChange={setState} />
      <RequestList
        list={requests}
        onOpen={onOpenRequest}
        emptyTitle={state === "open" ? "Nothing is waiting" : "No requests found"}
        emptyHint="Requests appear here when someone submits them from a project."
      />
    </section>
  );
}
