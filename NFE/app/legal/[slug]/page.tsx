import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { notFound } from "next/navigation";
import { LEGAL_DOCUMENTS, getLegalDocument } from "@/lib/legal-content";

export const dynamicParams = false;

export function generateStaticParams() {
  return LEGAL_DOCUMENTS.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const doc = getLegalDocument((await params).slug);
  return doc
    ? { title: `${doc.title} — Neuravic`, description: doc.summary }
    : {};
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const doc = getLegalDocument((await params).slug);
  if (!doc) notFound();

  return (
    <main className="legal section-dark" id="main-content">
      <div className="page-shell legal__shell">
        <Link href="/" className="legal__brand" aria-label="Neuravic home">
          <Image src="/assets/neuravic-logo.png" alt="Neuravic" width={617} height={120} unoptimized />
        </Link>

        <div className="legal__layout">
          <aside className="legal__aside">
            <p className="eyebrow">Legal</p>
            <nav aria-label="Legal documents">
              {LEGAL_DOCUMENTS.map((item) => (
                <Link
                  key={item.slug}
                  href={`/legal/${item.slug}`}
                  aria-current={item.slug === doc.slug ? "page" : undefined}
                >
                  {item.title}
                </Link>
              ))}
            </nav>
            <BackLink fallback="/" className="legal__back">← Back to site</BackLink>
          </aside>

          <article className="legal__article">
            <h1>{doc.title}</h1>
            <p className="legal__meta">{doc.summary} Last updated {doc.updated}.</p>
            {doc.sections.map((section, index) => (
              <section key={section.heading}>
                <h2>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {section.heading}
                </h2>
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </section>
            ))}
          </article>
        </div>
      </div>
    </main>
  );
}
