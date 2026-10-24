import { PortalPrivacyApp } from "@/components/portal/portal-app";
import { PortalPreview } from "@/components/portal/portal-preview";
import { PORTAL_OPEN } from "@/lib/portal-gate";

export default function PrivacyPage() { return PORTAL_OPEN ? <PortalPrivacyApp /> : <PortalPreview />; }
