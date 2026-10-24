import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

const PLANNED = [
  { title: "Requests", text: "Send a request and follow it from first reply to delivery." },
  { title: "Projects", text: "See where each project stands, in plain language." },
  { title: "Files", text: "Share and receive documents in one safe place." },
];

export default function PortalPage() {
  return (
    <main className="portal-soon">
      <div className="portal-soon__glow" aria-hidden="true" />
      <div className="portal-soon__inner">
        <BrandMark className="portal-soon__mark" id="portal-soon-mark" />
        <p className="portal-soon__eyebrow">Client portal</p>
        <h1 className="portal-soon__title">
          Under <span>construction</span>
        </h1>
        <p className="portal-soon__lead">
          We are building a private place for our clients to send requests, follow projects and share files. It is not open
          yet.
        </p>

        <ul className="portal-soon__list">
          {PLANNED.map((item) => (
            <li key={item.title}>
              <strong>{item.title}</strong>
              <span>{item.text}</span>
            </li>
          ))}
        </ul>

        <div className="portal-soon__actions">
          <Link className="portal-soon__button" href="/">
            Back to the website
          </Link>
          <Link className="portal-soon__link" href="/#contact">
            Talk to us in the meantime
          </Link>
        </div>
      </div>
    </main>
  );
}
