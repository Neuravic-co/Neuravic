"use client";

import { Mail } from "lucide-react";
import { useCallback, useId, useMemo, useState, type FormEvent } from "react";
import { mailtoUrl, type Me } from "@/lib/portal";
import { COUNTRY_LABELS, FIXED_HOLIDAYS, LEAVE, type Country, type LeaveKind } from "@/lib/workspace";
import { MonthGrid } from "./month-grid";
import { Field } from "./ui";

const monthName = new Intl.DateTimeFormat("en-GB", { month: "long" });

export function HolidaysView() {
  const [country, setCountry] = useState<Country>("uae");
  const [year, setYear] = useState(() => new Date().getFullYear());
  const selectId = useId();

  const eventsFor = useCallback(
    (y: number, month: number) => FIXED_HOLIDAYS[country].filter((h) => h.month === month).map((h) => ({ day: h.day, title: h.title })),
    [country],
  );
  const list = useMemo(() => [...FIXED_HOLIDAYS[country]].sort((a, b) => a.month - b.month || a.day - b.day), [country]);

  return (
    <div className="ws-calendar">
      <div className="ws-stack">
        <div className="ws-toolbar">
          <label htmlFor={selectId}>Country</label>
          <select id={selectId} value={country} onChange={(e) => setCountry(e.target.value as Country)}>
            {(Object.keys(COUNTRY_LABELS) as Country[]).map((key) => (
              <option key={key} value={key}>
                {COUNTRY_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
        <MonthGrid eventsFor={eventsFor} onMonthChange={setYear} />
      </div>
      <section className="ws-card ws-calendar__upcoming">
        <h2 className="ws-card__title">Public holidays {year}</h2>
        <ul>
          {list.map((holiday) => (
            <li key={`${holiday.month}-${holiday.day}`}>
              <span className="ws-date" aria-hidden="true">
                {holiday.day}
              </span>
              <div>
                <strong>{holiday.title}</strong>
                <span>{monthName.format(new Date(year, holiday.month, 1))}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="ws-notice ws-notice--inline">
          Fixed-date holidays only. Holidays that follow the moon, such as Eid, are announced each year and added then.
        </p>
      </section>
    </div>
  );
}

export function LeaveView({ kind, me }: { kind: LeaveKind; me: Me }) {
  const config = LEAVE[kind];
  const id = useId();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string>();
  const remaining = config.entitlement !== undefined ? config.entitlement - (config.taken ?? 0) : null;
  const percent = config.entitlement ? Math.round(((config.taken ?? 0) / config.entitlement) * 100) : 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!from || !to || to < from) {
      setError("Choose a start date and an end date that is the same or later.");
      return;
    }
    setError(undefined);
    const body = [`Type: ${config.label}`, `From: ${from}`, `To: ${to}`, `Name: ${me.user.name ?? me.user.email} <${me.user.email}>`].join("\n");
    window.location.href = mailtoUrl(`[Leave] ${config.label} request`, body);
  }

  return (
    <div className="ws-grid">
      <section className="ws-card">
        <h2 className="ws-card__title">{config.label}</h2>
        <p className="ws-lede">{config.summary}</p>
        {remaining !== null && config.entitlement ? (
          <>
            <p className="ws-balance">
              <strong>{remaining}</strong> of {config.entitlement} days left
            </p>
            <div className="ws-meter" role="img" aria-label={`${config.taken ?? 0} of ${config.entitlement} days taken`}>
              <i style={{ width: `${percent}%` }} />
            </div>
          </>
        ) : null}
        {config.scheduled ? (
          <ul className="ws-papers">
            {config.scheduled.map((item) => (
              <li key={item.title}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.dates}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="ws-notice ws-notice--inline">{config.note} Balances shown are examples.</p>
      </section>

      {config.mode === "balance" ? (
        <>
          <section className="ws-card">
            <h2 className="ws-card__title">Request</h2>
            <form className="portal-form" onSubmit={submit} noValidate>
              <div className="portal-form__row">
                <Field label="From" htmlFor={`${id}-from`}>
                  <input id={`${id}-from`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </Field>
                <Field label="To" htmlFor={`${id}-to`} error={error}>
                  <input
                    id={`${id}-to`}
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${id}-to-error` : undefined}
                  />
                </Field>
              </div>
              <button type="submit" className="portal-button portal-button--primary">
                <Mail aria-hidden="true" size={16} strokeWidth={1.5} /> Request by email
              </button>
            </form>
          </section>
          <section className="ws-card">
            <h2 className="ws-card__title">History</h2>
            {config.history.length > 0 ? (
              <ul className="ws-papers">
                {config.history.map((entry) => (
                  <li key={entry.dates}>
                    <div>
                      <strong>{entry.dates}</strong>
                      <span>{entry.days} days</span>
                    </div>
                    <em className="ws-status ws-status--valid">{entry.status}</em>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ws-empty">Nothing taken yet.</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
