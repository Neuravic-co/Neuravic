"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { effectiveRole, type ClientTab, type Me, type Org } from "@/lib/portal";
import { CLIENTS_SECTION, type WorkspaceSectionId } from "@/lib/workspace";
import { ActivityView } from "./activity-view";
import { MembersView } from "./members-view";
import { ProjectsView } from "./projects-view";
import { RequestDetail } from "./request-detail";
import { RequestsView } from "./requests-view";
import { useMe, useSession } from "./session";
import { SignIn } from "./sign-in";
import { StaffMfa } from "./staff-mfa";
import { LeadsView, OrganisationsView } from "./staff-views";
import { Workspace } from "./workspace";
import { WorkspaceSection } from "./workspace-section";
import { usePaged } from "./use-query";
import { Empty, ErrorNote, Loading } from "./ui";

/** The staff home at /portal. Clients have no workspace, so they go straight to the client portal. */
export function PortalApp() {
  return (
    <Gate>
      <Home />
    </Gate>
  );
}

/** A full workspace page, or the client portal at /portal/clients. Staff only. */
export function PortalSectionApp({ section }: { section: WorkspaceSectionId | typeof CLIENTS_SECTION }) {
  return (
    <Gate>
      <SectionPage section={section} />
    </Gate>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { state, refresh } = useSession();

  if (state.status === "loading") {
    return (
      <main className="portal-auth">
        <Loading label="Loading your portal" />
      </main>
    );
  }
  if (state.status === "unavailable") {
    return (
      <main className="portal-auth">
        <div className="portal-auth__card">
          <p className="portal-eyebrow">Portal</p>
          <h1>The portal is not reachable.</h1>
          <ErrorNote error="We could not reach the Neuravic servers. Check your connection and try again." onRetry={() => void refresh()} />
        </div>
      </main>
    );
  }
  if (state.status === "anonymous") {
    return <SignIn notice={state.expired ? "Your session ended. Sign in again to continue." : undefined} />;
  }
  if (state.status === "mfa") return <StaffMfa />;
  return children;
}

/** Staff land on the workspace; clients get the client portal. */
function Home() {
  const me = useMe();
  if (me.user.staffRole === null) return <Shell initialTab={null} />;
  return <Workspace me={me} />;
}

function SectionPage({ section }: { section: WorkspaceSectionId | typeof CLIENTS_SECTION }) {
  const me = useMe();
  const router = useRouter();
  const isStaff = me.user.staffRole !== null;

  useEffect(() => {
    if (!isStaff) router.replace("/portal");
  }, [isStaff, router]);

  if (!isStaff) return null;
  if (section === CLIENTS_SECTION) return <Shell initialTab={readHashTab()} backHref="/portal/tools" />;
  return <WorkspaceSection section={section} me={me} />;
}

const CLIENT_TABS: ClientTab[] = ["projects", "requests", "activity", "members", "organisations", "leads"];

function readHashTab(): ClientTab | null {
  const hash = window.location.hash.slice(1);
  return (CLIENT_TABS as string[]).includes(hash) ? (hash as ClientTab) : null;
}

type Tab = ClientTab;
const ORG_TABS: { id: Tab; label: string }[] = [
  { id: "projects", label: "Projects" },
  { id: "requests", label: "Requests" },
  { id: "activity", label: "Activity" },
  { id: "members", label: "Members" },
];
const STORAGE_KEY = "neuravic.portal.org";

function readStoredOrg(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeOrg(orgId: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, orgId);
  } catch {
    /* storage can be unavailable (private mode); the choice just will not persist */
  }
}

function useOrgs(me: Me) {
  const staffSeesAll = me.user.staffRole === "admin" || me.user.staffRole === "delivery";
  const all = usePaged<Org>(staffSeesAll ? "/orgs" : null, {}, 100);
  const orgs = useMemo<Org[]>(
    () =>
      staffSeesAll
        ? all.items
        : me.memberships.map((m) => ({ id: m.orgId, name: m.name, slug: m.slug, createdAt: 0 })),
    [staffSeesAll, all.items, me.memberships],
  );
  return { orgs, loading: staffSeesAll && all.loading, error: all.error, reload: all.reload };
}

function Shell({ initialTab, backHref }: { initialTab: Tab | null; backHref?: string }) {
  const me = useMe();
  const { signOut } = useSession();
  const { orgs, loading: orgsLoading, error: orgsError, reload: reloadOrgs } = useOrgs(me);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(readStoredOrg);
  const [tab, setTab] = useState<Tab | null>(initialTab);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const staffRole = me.user.staffRole;
  const staffTabs = useMemo<{ id: Tab; label: string }[]>(() => {
    const tabs: { id: Tab; label: string }[] = [];
    if (staffRole === "admin") tabs.push({ id: "organisations", label: "Organisations" });
    if (staffRole === "admin" || staffRole === "sales") tabs.push({ id: "leads", label: "Enquiries" });
    return tabs;
  }, [staffRole]);

  // The chosen organisation, falling back to the first one if the choice is stale.
  const orgId = orgs.find((o) => o.id === selectedOrgId)?.id ?? orgs[0]?.id ?? null;

  const role = orgId ? effectiveRole(me, orgId) : null;
  const orgTabs = role ? ORG_TABS : [];
  const availableTabs = [...orgTabs, ...staffTabs];
  const activeTab: Tab | null =
    tab && availableTabs.some((t) => t.id === tab) ? tab : (availableTabs[0]?.id ?? null);

  const go = useCallback((next: Tab) => {
    setTab(next);
    setProjectId(null);
    setRequestId(null);
  }, []);

  const selectOrg = useCallback((next: string) => {
    storeOrg(next);
    setSelectedOrgId(next);
    setProjectId(null);
    setRequestId(null);
    setTab((current) => (current === "organisations" || current === "leads" ? current : "projects"));
  }, []);

  return (
    <div className="portal-shell">
      <header className="portal-topbar">
        <Link className="portal-topbar__brand" href="/" aria-label="Neuravic home">
          <Image src="/assets/neuravic-logo.png" alt="Neuravic" width={617} height={120} unoptimized priority />
        </Link>
        <span className="portal-topbar__label">Portal</span>
        {backHref ? (
          <Link className="portal-link" href={backHref}>
            ← Tools
          </Link>
        ) : null}
        <div className="portal-topbar__spacer" />
        {orgs.length > 0 ? (
          <label className="portal-topbar__org">
            <span className="sr-only">Organisation</span>
            <select value={orgId ?? ""} onChange={(e) => selectOrg(e.target.value)}>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <span className="portal-topbar__user" title={me.user.email}>
          {me.user.name ?? me.user.email}
        </span>
        <button type="button" className="portal-link" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>

      <nav className="portal-tabs" aria-label="Portal sections">
        {availableTabs.map((item, index) => (
          <span key={item.id} className="portal-tabs__item">
            {index === orgTabs.length && orgTabs.length > 0 ? <i aria-hidden="true" /> : null}
            <button
              type="button"
              aria-current={activeTab === item.id ? "page" : undefined}
              className={activeTab === item.id ? "is-active" : ""}
              onClick={() => go(item.id)}
            >
              {item.label}
            </button>
          </span>
        ))}
      </nav>

      <main className="portal-main" id="portal-content">
        <h1 className="sr-only">Neuravic client portal</h1>
        {orgsLoading ? <Loading label="Loading organisations" /> : null}
        {orgsError ? <ErrorNote error={orgsError} onRetry={reloadOrgs} /> : null}
        {!orgsLoading && !orgsError && availableTabs.length === 0 ? (
          <Empty title="You are not part of an organisation yet">
            Ask your Neuravic contact to invite you. You will see your projects here as soon as they do.
          </Empty>
        ) : null}

        {orgId && role && requestId && activeTab && activeTab !== "organisations" && activeTab !== "leads" ? (
          <RequestDetail
            key={requestId}
            requestId={requestId}
            roleFor={(requestOrgId) => effectiveRole(me, requestOrgId)}
            onBack={() => setRequestId(null)}
            backLabel={activeTab === "projects" ? "Back to project" : "All requests"}
          />
        ) : null}

        {orgId && role && !requestId ? (
          <>
            {activeTab === "projects" ? (
              <ProjectsView
                key={orgId}
                orgId={orgId}
                role={role}
                projectId={projectId}
                onSelectProject={setProjectId}
                onOpenRequest={setRequestId}
              />
            ) : null}
            {activeTab === "requests" ? <RequestsView key={orgId} orgId={orgId} onOpenRequest={setRequestId} /> : null}
            {activeTab === "activity" ? <ActivityView key={orgId} orgId={orgId} /> : null}
            {activeTab === "members" ? <MembersView key={orgId} orgId={orgId} role={role} /> : null}
          </>
        ) : null}

        {activeTab === "organisations" ? (
          <OrganisationsView
            onCreated={reloadOrgs}
            onOpen={(id) => {
              selectOrg(id);
              go("projects");
            }}
          />
        ) : null}
        {activeTab === "leads" ? <LeadsView /> : null}
      </main>
    </div>
  );
}
