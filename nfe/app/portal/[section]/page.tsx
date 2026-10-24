import { notFound, redirect } from "next/navigation";
import { PortalPreview } from "@/components/portal/portal-preview";
import { PortalSectionApp } from "@/components/portal/portal-app";
import { PORTAL_OPEN } from "@/lib/portal-gate";
import { CLIENTS_SECTION, WORKSPACE_SECTION_IDS, isWorkspaceSection } from "@/lib/workspace";

export const dynamicParams = false;

export function generateStaticParams() {
  return [...WORKSPACE_SECTION_IDS, CLIENTS_SECTION].map((section) => ({ section }));
}

export default async function PortalSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section === CLIENTS_SECTION) {
    // The client portal needs the server, so there is nothing to preview.
    if (!PORTAL_OPEN) redirect("/portal");
    return <PortalSectionApp section={CLIENTS_SECTION} />;
  }
  if (!isWorkspaceSection(section)) notFound();
  return PORTAL_OPEN ? <PortalSectionApp section={section} /> : <PortalPreview section={section} />;
}
