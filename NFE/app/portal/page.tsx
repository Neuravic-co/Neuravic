import { PortalApp } from "@/components/portal/portal-app";
import { UnderConstruction } from "@/components/portal/under-construction";
import { PORTAL_OPEN } from "@/lib/portal-gate";

export default function PortalPage() {
  return PORTAL_OPEN ? <PortalApp /> : <UnderConstruction />;
}
