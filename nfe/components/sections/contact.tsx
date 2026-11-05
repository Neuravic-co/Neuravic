import { ContactForm } from "@/components/contact-form";

export function Contact({ email }: { email: string }) {
  return (
    <section className="contact section-dark" id="contact" data-nav-section>
      <div className="page-shell contact__inner">
        <div data-reveal>
          <p className="eyebrow">Contact / Start a project</p>
          <h2>Bring us the difficult part.</h2>
        </div>
        <div className="contact__copy" data-reveal>
          <p>
            Tell us where the operation breaks down. We’ll help define the right system—and take it through design, engineering,
            deployment and support.
          </p>
          <ContactForm fallbackEmail={email} />
        </div>
      </div>
    </section>
  );
}
