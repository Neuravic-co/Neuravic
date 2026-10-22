import { CalendarDays, LayoutGrid, LifeBuoy, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { Me } from "@/lib/portal";
import { SECTION_META, WORKSPACE_SECTION_IDS, type WorkspaceSectionId } from "@/lib/workspace";
import { WorkspaceFrame } from "./workspace-frame";

const ICONS: Record<WorkspaceSectionId, LucideIcon> = {
  pims: UserRound,
  calendar: CalendarDays,
  tools: LayoutGrid,
  support: LifeBuoy,
};

/** The staff home: four cards with two cut corners that echo the Neuravic mark. Each one opens a full page. */
export function Workspace({ me, preview = false }: { me: Me; preview?: boolean }) {
  return (
    <WorkspaceFrame me={me} preview={preview}>
      <h1 className="sr-only">Neuravic workspace</h1>
      <nav className="ws-home" aria-label="Workspace sections">
        <ul className="ws-tabs">
          {WORKSPACE_SECTION_IDS.map((id, index) => {
            const Icon = ICONS[id];
            const { label, caption } = SECTION_META[id];
            return (
              <li key={id} className="ws-tab-wrap">
                <Link className="ws-tab" href={`/portal/${id}`}>
                  <span className="ws-tab__number">{String(index + 1).padStart(2, "0")}</span>
                  <Icon className="ws-tab__icon" aria-hidden="true" size={26} strokeWidth={1.25} />
                  <strong>{label}</strong>
                  <span className="ws-tab__caption">{caption}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </WorkspaceFrame>
  );
}
