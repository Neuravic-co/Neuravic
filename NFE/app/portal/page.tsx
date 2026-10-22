import { PortalApp } from "@/components/portal/portal-app";
import { PortalPreview } from "@/components/portal/portal-preview";
import { PORTAL_OPEN } from "@/lib/portal-gate";

export default function PortalPage() {
  return PORTAL_OPEN ? <PortalApp /> : <PortalPreview />;
}
