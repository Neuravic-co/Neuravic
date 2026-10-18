"use client";

import { useId, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { atLeast, displayName, type Member, type OrgRole } from "@/lib/portal";
import { useMe } from "./session";
import { useAction, useQuery } from "./use-query";
import { Badge, Empty, ErrorNote, Field, Loading, SectionHeader } from "./ui";

const ROLES: OrgRole[] = ["viewer", "member", "admin", "owner"];
const ROLE_RANK: Record<OrgRole, number> = { viewer: 1, member: 2, admin: 3, owner: 4 };

export function MembersView({ orgId, role }: { orgId: string; role: OrgRole }) {
  const me = useMe();
  const members = useQuery(() => api<{ items: Member[] }>(`/orgs/${orgId}/members`), [orgId]);
  const action = useAction();
  const canManage = atLeast(role, "admin");

  async function changeRole(member: Member, next: OrgRole) {
    const ok = await action.run(() => api(`/orgs/${orgId}/members/${member.userId}`, { method: "PATCH", body: { role: next } }));
    members.reload();
    return ok;
  }

  async function remove(member: Member) {
    const leaving = member.userId === me.user.id;
    if (!window.confirm(leaving ? "Leave this organisation?" : `Remove ${displayName(member.name, member.email)}?`)) return;
    const ok = await action.run(() => api(`/orgs/${orgId}/members/${member.userId}`, { method: "DELETE" }));
    if (ok) {
      if (leaving) window.location.reload();
      else members.reload();
    }
  }

  return (
    <section>
      <SectionHeader title="Members" />
      {canManage ? <InviteForm orgId={orgId} role={role} onInvited={members.reload} /> : null}
      {members.loading && !members.data ? <Loading label="Loading members" /> : null}
      {members.error ? <ErrorNote error={members.error} onRetry={members.reload} /> : null}
      {action.error ? <ErrorNote error={action.error} /> : null}
      {members.data && members.data.items.length === 0 ? <Empty title="No members yet" /> : null}
      <ul className="portal-list">
        {members.data?.items.map((member) => {
          const outranks = ROLE_RANK[member.role] > ROLE_RANK[role];
          return (
            <li key={member.userId} className="portal-row portal-row--static">
              <span className="portal-row__main">
                <strong>{displayName(member.name, member.email)}</strong>
                <span className="portal-row__sub">
                  {member.name ? `${member.email} · ` : ""}
                  {member.status === "invited" ? "Invitation sent" : "Active"}
                </span>
              </span>
              {canManage && !outranks ? (
                <select
                  aria-label={`Role for ${displayName(member.name, member.email)}`}
                  value={member.role}
                  disabled={action.busy}
                  onChange={(e) => void changeRole(member, e.target.value as OrgRole)}
                >
                  {ROLES.filter((r) => ROLE_RANK[r] <= ROLE_RANK[role]).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              ) : (
                <Badge>{member.role}</Badge>
              )}
              {(canManage && !outranks) || member.userId === me.user.id ? (
                <button type="button" className="portal-link" disabled={action.busy} onClick={() => void remove(member)}>
                  {member.userId === me.user.id ? "Leave" : "Remove"}
                </button>
              ) : (
                <span />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function InviteForm({ orgId, role, onInvited }: { orgId: string; role: OrgRole; onInvited: () => void }) {
  const id = useId();
  const { busy, error, run } = useAction();
  const [email, setEmail] = useState("");
  const [memberRole, setMemberRole] = useState<OrgRole>("member");
  const [sent, setSent] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSent("");
    const ok = await run(() => api(`/orgs/${orgId}/members`, { method: "POST", body: { email: email.trim(), role: memberRole } }));
    if (ok) {
      setSent(email.trim());
      setEmail("");
      onInvited();
    }
  }

  return (
    <form className="portal-form portal-form--inline" onSubmit={submit}>
      <Field label="Invite by email" htmlFor={`${id}-email`}>
        <input id={`${id}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
      </Field>
      <Field label="Role" htmlFor={`${id}-role`}>
        <select id={`${id}-role`} value={memberRole} onChange={(e) => setMemberRole(e.target.value as OrgRole)}>
          {ROLES.filter((r) => ROLE_RANK[r] <= ROLE_RANK[role]).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </Field>
      <button type="submit" className="portal-button portal-button--primary" disabled={busy}>
        {busy ? "Inviting…" : "Send invitation"}
      </button>
      {error ? <ErrorNote error={error} /> : null}
      {sent ? (
        <p className="portal-hint" role="status">
          Invitation sent to {sent}.
        </p>
      ) : null}
    </form>
  );
}
