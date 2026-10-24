import { CalendarDays, LayoutGrid, LifeBuoy, UserRound, type LucideIcon } from "lucide-react";
import type { WorkspaceSectionId } from "@/lib/workspace";

export const SECTION_ICONS: Record<WorkspaceSectionId, LucideIcon> = {
  pims: UserRound,
  calendar: CalendarDays,
  tools: LayoutGrid,
  support: LifeBuoy,
};
