"use client";

import { CalendarDays, LayoutGrid, LifeBuoy, UserRound, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { ClientTab, Me } from "@/lib/portal";
import { CalendarView } from "./calendar-view";
import { PimsView } from "./pims-view";
import { useSession } from "./session";
import { SupportView } from "./support-view";
import { ToolsView } from "./tools-view";

type WorkspaceTab = "pims" | "calendar" | "tools" | "support";

const TABS: { id: WorkspaceTab; label: string; caption: string; icon: LucideIcon }[] = [
  { id: "pims", label: "PIMS", caption: "Your details", icon: UserRound },
  { id: "calendar", label: "Calendar", caption: "Your schedule", icon: CalendarDays },
  { id: "tools", label: "Tools", caption: "Apps and systems", icon: LayoutGrid },
  { id: "support", label: "IT & Support", caption: "Help when you need it", icon: LifeBuoy },
];

/** The staff home: four tabs, each a card with two cut corners that echo the Neuravic mark. */
export function Workspace({ me, onOpenClientPortal }: { me: Me; onOpenClientPortal: (tab: ClientTab) => void }) {
  const { signOut } = useSession();
  const [active, setActive] = useState<WorkspaceTab>("pims");

  return (
    <div className="portal-shell ws">
      <header className="portal-topbar">
        <Link className="portal-topbar__brand" href="/" aria-label="Neuravic home">
          <Image src="/assets/neuravic-logo.png" alt="Neuravic" width={617} height={120} unoptimized priority />
        </Link>
        <span className="portal-topbar__label">Workspace</span>
        <div className="portal-topbar__spacer" />
        <span className="portal-topbar__user" title={me.user.email}>
          {me.user.name ?? me.user.email}
        </span>
        <button type="button" className="portal-link" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>

      <main className="ws-main" id="portal-content">
        <h1 className="sr-only">Neuravic workspace</h1>

        <div className="ws-tabs" role="tablist" aria-label="Workspace sections">
          {TABS.map(({ id, label, caption, icon: Icon }, index) => (
            <div key={id} className="ws-tab-wrap" role="presentation" data-active={active === id}>
              <button
                type="button"
                role="tab"
                id={`ws-tab-${id}`}
                aria-selected={active === id}
                aria-controls={`ws-panel-${id}`}
                tabIndex={active === id ? 0 : -1}
                className="ws-tab"
                onClick={() => setActive(id)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                  event.preventDefault();
                  const step = event.key === "ArrowRight" ? 1 : TABS.length - 1;
                  const next = TABS[(index + step) % TABS.length].id;
                  setActive(next);
                  document.getElementById(`ws-tab-${next}`)?.focus();
                }}
              >
                <span className="ws-tab__number">{String(index + 1).padStart(2, "0")}</span>
                <Icon className="ws-tab__icon" aria-hidden="true" size={26} strokeWidth={1.25} />
                <strong>{label}</strong>
                <span className="ws-tab__caption">{caption}</span>
              </button>
            </div>
          ))}
        </div>

        <div className="ws-panel" role="tabpanel" id={`ws-panel-${active}`} aria-labelledby={`ws-tab-${active}`} tabIndex={0}>
          {active === "pims" ? <PimsView me={me} /> : null}
          {active === "calendar" ? <CalendarView /> : null}
          {active === "tools" ? <ToolsView staffRole={me.user.staffRole} onOpen={onOpenClientPortal} /> : null}
          {active === "support" ? <SupportView me={me} /> : null}
        </div>
      </main>
    </div>
  );
}
