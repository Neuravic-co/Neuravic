import { PREVIEW_ME } from "@/lib/portal";
import { Workspace } from "./workspace";

/** Shown at /portal until the portal opens: the staff workspace with sample details and no sign-in. */
export function PortalPreview() {
  return <Workspace me={PREVIEW_ME} preview />;
}
