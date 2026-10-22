"use client";

import { Mail } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { SUPPORT_EMAIL, type Me } from "@/lib/portal";
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

export function SupportView({ me }: { me: Me }) {
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
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`[IT] ${subject.trim()}`)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <div className="ws-support">
      <section className="ws-card ws-support__form">
        <h2>Raise a ticket</h2>
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

      <div className="ws-support__side">
        <section className="ws-card">
          <h3>Contact IT directly</h3>
          <a className="ws-mail" href={`mailto:${SUPPORT_EMAIL}`}>
            <Mail aria-hidden="true" size={18} strokeWidth={1.5} />
            {SUPPORT_EMAIL}
          </a>
        </section>
        <section className="ws-card">
          <h3>Quick answers</h3>
          {ANSWERS.map((item) => (
            <details key={item.question} className="ws-answer">
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </section>
      </div>
    </div>
  );
}
