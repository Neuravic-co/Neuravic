"use client";

import { STAFF_ROLE_LABELS, type Me } from "@/lib/portal";

const NOT_ADDED = "Not added yet";

function initials(name: string | null, email: string) {
  const source = (name ?? email.split("@")[0] ?? "").trim();
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

function Details({ title, rows }: { title: string; rows: { label: string; value: string | null }[] }) {
  return (
    <section className="ws-card">
      <h3>{title}</h3>
      <dl className="ws-details">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd className={row.value ? undefined : "is-empty"}>{row.value ?? NOT_ADDED}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Personal information. Name, email, role and organisations come from the account; the rest is not stored yet. */
export function PimsView({ me, details = {} }: { me: Me; details?: Record<string, string> }) {
  const { user, memberships } = me;
  const detail = (label: string) => details[label] ?? null;
  return (
    <div className="ws-pims">
      <section className="ws-profile">
        <span className="ws-avatar" aria-hidden="true">
          {initials(user.name, user.email)}
        </span>
        <div>
          <h2>{user.name ?? user.email}</h2>
          <p>{user.staffRole ? STAFF_ROLE_LABELS[user.staffRole] : "Client"} · Neuravic</p>
          <p className="ws-profile__email">{user.email}</p>
        </div>
      </section>

      <p className="ws-notice">
        Your name, email, role and organisations come from your account. The other details are shown as they will
        appear, and can be added once personal details are stored.
      </p>

      <div className="ws-grid">
        <Details
          title="Personal"
          rows={[
            { label: "Full name", value: user.name },
            { label: "Email", value: user.email },
            { label: "Phone", value: detail("Phone") },
            { label: "Date of birth", value: detail("Date of birth") },
            { label: "Nationality", value: detail("Nationality") },
            { label: "Home address", value: detail("Home address") },
          ]}
        />
        <Details
          title="Employment"
          rows={[
            { label: "Staff role", value: user.staffRole ? STAFF_ROLE_LABELS[user.staffRole] : null },
            { label: "Job title", value: detail("Job title") },
            { label: "Department", value: detail("Department") },
            { label: "Employee ID", value: detail("Employee ID") },
            { label: "Start date", value: detail("Start date") },
            { label: "Office", value: detail("Office") },
          ]}
        />
        <Details
          title="Emergency contact"
          rows={[
            { label: "Name", value: detail("Name") },
            { label: "Relationship", value: detail("Relationship") },
            { label: "Phone", value: detail("Phone") },
          ]}
        />
        <section className="ws-card">
          <h3>Organisations</h3>
          {memberships.length > 0 ? (
            <ul className="ws-chips">
              {memberships.map((membership) => (
                <li key={membership.orgId}>
                  {membership.name}
                  <span>{membership.role}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ws-empty">You are not a member of a client organisation.</p>
          )}
        </section>
      </div>
    </div>
  );
}
