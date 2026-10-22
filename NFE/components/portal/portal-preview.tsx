import { PREVIEW_DETAILS, PREVIEW_ME } from "@/lib/portal";
import type { WorkspaceSectionId } from "@/lib/workspace";
import { Workspace } from "./workspace";
import { WorkspaceSection } from "./workspace-section";

/** Shown at /portal until the portal opens: the staff workspace with sample details and no sign-in. */
export function PortalPreview({ section }: { section?: WorkspaceSectionId }) {
  if (!section) return <Workspace me={PREVIEW_ME} preview />;
  return <WorkspaceSection section={section} me={PREVIEW_ME} details={PREVIEW_DETAILS} preview />;
}
