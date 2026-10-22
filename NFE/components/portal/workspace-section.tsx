"use client";

import type { Me } from "@/lib/portal";
import { SECTION_META, type LeaveKind, type WorkspaceSectionId } from "@/lib/workspace";
import { LeaveView, HolidaysView } from "./calendar-view";
import { ContractView, HrView, PapersView, PersonalInfo, TeamView } from "./pims-view";
import { SectionShell, type SectionTab } from "./section-shell";
import { HelpView, MyTicketsView, RequestsView, SecurityView, TicketForm } from "./support-view";
import { ToolsCatalog } from "./tools-catalog";
import { WorkspaceFrame } from "./workspace-frame";

const LEAVE_TABS: { id: LeaveKind; label: string }[] = [
  { id: "annual", label: "Annual leave" },
  { id: "sick", label: "Sick leave" },
  { id: "maternity", label: "Maternity leave" },
  { id: "forced", label: "Forced leave" },
];

function tabsFor(section: WorkspaceSectionId, me: Me, details: Record<string, string> | undefined, signedIn: boolean): SectionTab[] {
  switch (section) {
    case "pims":
      return [
        { id: "personal", label: "Personal info", content: <PersonalInfo me={me} details={details} /> },
        { id: "team", label: "Team", content: <TeamView me={me} /> },
        { id: "papers", label: "Papers", content: <PapersView /> },
        { id: "hr", label: "HR", content: <HrView /> },
        { id: "contract", label: "Contract", content: <ContractView /> },
      ];
    case "calendar":
      return [
        { id: "holidays", label: "Public holidays", content: <HolidaysView /> },
        ...LEAVE_TABS.map((tab) => ({ ...tab, content: <LeaveView kind={tab.id} me={me} /> })),
      ];
    case "support":
      return [
        { id: "ticket", label: "Raise a ticket", content: <TicketForm me={me} /> },
        { id: "mine", label: "My tickets", content: <MyTicketsView /> },
        { id: "requests", label: "Requests", content: <RequestsView me={me} /> },
        { id: "security", label: "Security", content: <SecurityView me={me} /> },
        { id: "help", label: "Help and contacts", content: <HelpView /> },
      ];
    case "tools":
      return [{ id: "catalog", label: "All tools", content: <ToolsCatalog staffRole={me.user.staffRole} signedIn={signedIn} /> }];
  }
}

/** One full page of the staff workspace. Tools has no side tabs: it is a single searchable catalog. */
export function WorkspaceSection({
  section,
  me,
  details,
  preview = false,
}: {
  section: WorkspaceSectionId;
  me: Me;
  details?: Record<string, string>;
  preview?: boolean;
}) {
  const { label, intro } = SECTION_META[section];
  return (
    <WorkspaceFrame me={me} preview={preview}>
      <SectionShell title={label} intro={intro} tabs={tabsFor(section, me, details, !preview)} single={section === "tools"} />
    </WorkspaceFrame>
  );
}
