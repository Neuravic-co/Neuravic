"use client";

import { Mail } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { mailtoUrl, SUPPORT_EMAIL, type Me } from "@/lib/portal";
import { Field } from "./ui";

const CATEGORIES = ["Access and sign-in", "Hardware", "Software", "Network", "Security concern", "Something else"];
const PRIORITIES = ["Low", "Normal", "Urgent"];

const ANSWERS = [
  {
    question: "I cannot sign in",
    answer:
      "Sign-in uses a one-time link sent to your email, and each link expires after a short time. Go to the sign-in page and ask for a new link. If it still does not arrive, raise a ticket under Access and sign-in.",
  },
  {
    question: "I need access to something",
    answer: "Raise a ticket with the category Access and sign-in, and say what you need and why.",
  },
  {
    question: "I think something is not secure",
    answer: "Raise an Urgent ticket with the category Security concern straight away, and do not share the details elsewhere.",
  },
];

export function TicketForm({ me }: { me: Me }) {
  const id = useId();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [priority, setPriority] = useState(PRIORITIES[1]);
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [errors, setErrors] = useState<{ subject?: string; details?: string }>({});

  function submit(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (subject.trim().length < 3) next.subject = "Add a short subject.";
    if (details.trim().length < 10) next.details = "Tell us a little more so we can help.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const body = [`Category: ${category}`, `Priority: ${priority}`, `From: ${me.user.name ?? me.user.email} <${me.user.email}>`, "", details.trim()].join("\n");
    window.location.href = mailtoUrl(`[IT] ${subject.trim()}`, body);
  }

  return (
    <section className="ws-card">
        <h2 className="ws-card__title">Raise a ticket</h2>
        <p className="ws-lede">Describe the problem and we will pick it up. This opens an email to the IT team with the details filled in.</p>
        <form className="portal-form" onSubmit={submit} noValidate>
          <div className="portal-form__row">
            <Field label="Category" htmlFor={`${id}-category`}>
              <select id={`${id}-category`} value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
            <Field label="Priority" htmlFor={`${id}-priority`}>
              <select id={`${id}-priority`} value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITIES.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Subject" htmlFor={`${id}-subject`} error={errors.subject}>
            <input
              id={`${id}-subject`}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={120}
              aria-invalid={errors.subject ? true : undefined}
              aria-describedby={errors.subject ? `${id}-subject-error` : undefined}
            />
          </Field>
          <Field label="Details" htmlFor={`${id}-details`} error={errors.details}>
            <textarea
              id={`${id}-details`}
              rows={5}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={4000}
              aria-invalid={errors.details ? true : undefined}
              aria-describedby={errors.details ? `${id}-details-error` : undefined}
            />
          </Field>
          <button type="submit" className="portal-button portal-button--primary">
            Create ticket by email
          </button>
        </form>
    </section>
  );
}

const REQUEST_KINDS = [
  { id: "equipment", label: "Equipment", hint: "Laptop, screen, phone, headset" },
  { id: "access", label: "Access", hint: "A system, folder or tool" },
  { id: "software", label: "Software", hint: "A licence or install" },
  { id: "account", label: "New starter account", hint: "Email, chat and tools for someone joining" },
];

export function RequestsView({ me }: { me: Me }) {
  const id = useId();
  const [kind, setKind] = useState(REQUEST_KINDS[0].id);
  const [what, setWhat] = useState("");
  const [error, setError] = useState<string>();
  const current = REQUEST_KINDS.find((item) => item.id === kind) ?? REQUEST_KINDS[0];

  function submit(event: FormEvent) {
    event.preventDefault();
    if (what.trim().length < 5) {
      setError("Say what you need.");
      return;
    }
    setError(undefined);
    const body = [`Type: ${current.label}`, `From: ${me.user.name ?? me.user.email} <${me.user.email}>`, "", what.trim()].join("\n");
    window.location.href = mailtoUrl(`[Request] ${current.label}`, body);
  }

  return (
    <section className="ws-card">
      <h2 className="ws-card__title">Make a request</h2>
      <p className="ws-lede">Ask for equipment, access or software. This opens an email to the IT team with the details filled in.</p>
      <form className="portal-form" onSubmit={submit} noValidate>
        <Field label="What kind of request" htmlFor={`${id}-kind`} hint={current.hint}>
          <select id={`${id}-kind`} value={kind} onChange={(e) => setKind(e.target.value)}>
            {REQUEST_KINDS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="What you need" htmlFor={`${id}-what`} error={error}>
          <textarea
            id={`${id}-what`}
            rows={4}
            value={what}
            onChange={(e) => setWhat(e.target.value)}
            maxLength={2000}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-what-error` : undefined}
          />
        </Field>
        <button type="submit" className="portal-button portal-button--primary">
          Send request by email
        </button>
      </form>
    </section>
  );
}

export function MyTicketsView() {
  return (
    <section className="ws-card">
      <h2 className="ws-card__title">My tickets</h2>
      <p className="ws-empty">No tickets to show.</p>
      <p className="ws-notice ws-notice--inline">
        Tickets are sent by email for now, so replies arrive in your inbox. A list of your open and closed tickets will appear here once tickets are stored in the portal.
      </p>
    </section>
  );
}

const SECURITY_TIPS = [
  "Use a password manager and a different password for every account.",
  "Never share a sign-in link. It works for whoever opens it.",
  "Lock your screen when you step away.",
  "Be careful with unexpected attachments and links, even from people you know.",
  "Report a lost or stolen device straight away.",
];

export function SecurityView({ me }: { me: Me }) {
  const report = mailtoUrl("[Security] Concern", `From: ${me.user.name ?? me.user.email} <${me.user.email}>\n\n`);
  return (
    <div className="ws-grid">
      <section className="ws-card">
        <h2 className="ws-card__title">Report a concern</h2>
        <p className="ws-lede">If you think an account, device or message is not safe, tell us now. Do not share the details anywhere else.</p>
        <a className="portal-button portal-button--primary" href={report}>
          Report by email
        </a>
      </section>
      <section className="ws-card">
        <h2 className="ws-card__title">Stay safe</h2>
        <ul className="ws-bullets">
          {SECURITY_TIPS.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function HelpView() {
  return (
    <div className="ws-grid">
      <section className="ws-card">
        <h2 className="ws-card__title">Contact IT directly</h2>
        <a className="ws-mail" href={`mailto:${SUPPORT_EMAIL}`}>
          <Mail aria-hidden="true" size={18} strokeWidth={1.5} />
          {SUPPORT_EMAIL}
        </a>
      </section>
      <section className="ws-card">
        <h2 className="ws-card__title">Quick answers</h2>
        {ANSWERS.map((item) => (
          <details key={item.question} className="ws-answer">
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
