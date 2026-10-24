"use client";

import { STAFF_ROLE_LABELS, type Me } from "@/lib/portal";
import { PAPER_LABELS, SAMPLE_CONTRACT, SAMPLE_HR, SAMPLE_PAPERS, SAMPLE_TEAM } from "@/lib/workspace";

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
      <h2 className="ws-card__title">{title}</h2>
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
export function PersonalInfo({ me, details = {} }: { me: Me; details?: Record<string, string> }) {
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
          <h2 className="ws-card__title">Organisations</h2>
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

export function TeamView({ me }: { me: Me }) {
  return (
    <div className="ws-stack">
      <section className="ws-card">
        <h2 className="ws-card__title">Your team</h2>
        <ul className="ws-people">
          {SAMPLE_TEAM.map((person) => (
            <li key={person.name}>
              <span className="ws-avatar ws-avatar--small" aria-hidden="true">
                {initials(person.name, "")}
              </span>
              <div>
                <strong>{person.name}</strong>
                <span>
                  {person.role} · {person.city}
                </span>
              </div>
              <em>{person.relation}</em>
            </li>
          ))}
        </ul>
        <p className="ws-notice ws-notice--inline">
          Example people. Your real team appears here once it is set up{me.user.staffRole ? "" : " for your account"}.
        </p>
      </section>
    </div>
  );
}

export function PapersView() {
  return (
    <section className="ws-card">
      <h2 className="ws-card__title">Papers</h2>
      <ul className="ws-papers">
        {SAMPLE_PAPERS.map((paper) => (
          <li key={paper.name}>
            <div>
              <strong>{paper.name}</strong>
              <span>{paper.detail}</span>
            </div>
            <em className={`ws-status ws-status--${paper.status}`}>{PAPER_LABELS[paper.status]}</em>
          </li>
        ))}
      </ul>
      <p className="ws-notice ws-notice--inline">Examples. Uploading and checking papers opens once documents are stored securely.</p>
    </section>
  );
}

function Rows({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="ws-details">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function HrView() {
  return (
    <div className="ws-grid">
      <section className="ws-card">
        <h2 className="ws-card__title">Employment</h2>
        <Rows rows={SAMPLE_HR.employment} />
      </section>
      <section className="ws-card">
        <h2 className="ws-card__title">Pay</h2>
        <Rows rows={SAMPLE_HR.payroll} />
      </section>
      <section className="ws-card">
        <h2 className="ws-card__title">Benefits</h2>
        <ul className="ws-chips">
          {SAMPLE_HR.benefits.map((benefit) => (
            <li key={benefit}>{benefit}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function ContractView() {
  return (
    <div className="ws-grid">
      <section className="ws-card">
        <h2 className="ws-card__title">Contract terms</h2>
        <Rows rows={SAMPLE_CONTRACT.terms} />
      </section>
      <section className="ws-card">
        <h2 className="ws-card__title">Documents</h2>
        <ul className="ws-papers">
          {SAMPLE_CONTRACT.documents.map((name) => (
            <li key={name}>
              <div>
                <strong>{name}</strong>
                <span>Copy available from HR</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
