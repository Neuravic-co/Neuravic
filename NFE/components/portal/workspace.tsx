import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { STAFF_ROLE_LABELS, type Me } from "@/lib/portal";
import { CATALOG, LEAVE, SECTION_HIGHLIGHTS, SECTION_META, WORKSPACE_SECTION_IDS } from "@/lib/workspace";
import { BrandMark } from "../brand-mark";
import { NextHoliday } from "./next-holiday";
import { SECTION_ICONS } from "./section-icons";
import { WorkspaceFrame } from "./workspace-frame";

const QUICK_ACTIONS: { label: string; href: string }[] = [
  { label: "Request leave", href: "/portal/calendar" },
  { label: "Raise a ticket", href: "/portal/support" },
  { label: "Find a tool", href: "/portal/tools" },
  { label: "Check your details", href: "/portal/pims" },
];

function firstName(me: Me) {
  const source = (me.user.name ?? me.user.email.split("@")[0] ?? "").trim();
  return source.split(/[\s._-]+/)[0] || "there";
}

/** The staff home: a welcome band, then four cards that open full pages. */
export function Workspace({ me, preview = false }: { me: Me; preview?: boolean }) {
  return (
    <WorkspaceFrame me={me} preview={preview} home>
      <section className="ws-hero">
        <BrandMark className="ws-hero__art" id="ws-hero-glass" />
        <div className="ws-hero__inner">
          <p className="ws-hero__eyebrow">Workspace</p>
          <h1>Welcome back, {firstName(me)}.</h1>
          <p className="ws-hero__lede">Your details, schedule, tools and support, all in one place.</p>
          <ul className="ws-hero__chips">
            <li>{me.user.staffRole ? STAFF_ROLE_LABELS[me.user.staffRole] : "Client"}</li>
            <li>{me.user.email}</li>
            {preview ? <li className="is-preview">Preview with sample details</li> : null}
          </ul>
        </div>
      </section>

      <div className="ws-home__body">
        <nav aria-label="Workspace sections">
          <ul className="ws-cards">
            {WORKSPACE_SECTION_IDS.map((id, index) => {
              const Icon = SECTION_ICONS[id];
              const { label, caption } = SECTION_META[id];
              return (
                <li key={id}>
                  <Link className="ws-card-link" href={`/portal/${id}`}>
                    <span className="ws-card-link__top">
                      <span className="ws-card-link__icon">
                        <Icon aria-hidden="true" size={22} strokeWidth={1.5} />
                      </span>
                      <span className="ws-card-link__number" aria-hidden="true">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </span>
                    <strong>{label}</strong>
                    <span className="ws-card-link__caption">{caption}</span>
                    <span className="ws-card-link__tags">
                      {SECTION_HIGHLIGHTS[id].map((tag) => (
                        <em key={tag}>{tag}</em>
                      ))}
                    </span>
                    <span className="ws-card-link__open">
                      Open <ArrowUpRight aria-hidden="true" size={16} strokeWidth={1.5} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <section className="ws-glance" aria-labelledby="ws-glance-title">
          <h2 id="ws-glance-title">At a glance</h2>
          <dl>
            <div>
              <dt>Annual leave left</dt>
              <dd>{(LEAVE.annual.entitlement ?? 0) - (LEAVE.annual.taken ?? 0)} days</dd>
            </div>
            <div>
              <dt>Next public holiday</dt>
              <dd>
                <NextHoliday />
              </dd>
            </div>
            <div>
              <dt>Open tickets</dt>
              <dd>0</dd>
            </div>
            <div>
              <dt>Tools available</dt>
              <dd>{CATALOG.length}</dd>
            </div>
          </dl>
          <p>Example figures. Your own will appear here once your records are connected.</p>
        </section>

        <section className="ws-quick" aria-labelledby="ws-quick-title">
          <h2 id="ws-quick-title">Quick actions</h2>
          <ul>
            {QUICK_ACTIONS.map((action) => (
              <li key={action.label}>
                <Link href={action.href}>{action.label}</Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </WorkspaceFrame>
  );
}
