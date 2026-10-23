"use client";

import { ArrowLeft, ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";

export interface SectionTab {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * A full page for one section: a header with a breadcrumb and a way back, then the tabs down the left.
 * The chosen tab lives in the address (#papers), so the browser's Back and Forward buttons move between tabs
 * and a tab can be bookmarked or shared.
 */
export function SectionShell({
  title,
  intro,
  icon: Icon,
  preview = false,
  tabs,
  single = false,
}: {
  title: string;
  intro: string;
  icon: LucideIcon;
  preview?: boolean;
  tabs: SectionTab[];
  single?: boolean;
}) {
  const [active, setActive] = useState(tabs[0].id);
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];
  const ids = tabs.map((tab) => tab.id).join(",");

  useEffect(() => {
    const known = ids.split(",");
    const sync = () => {
      const wanted = window.location.hash.slice(1);
      setActive(known.includes(wanted) ? wanted : known[0]);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [ids]);

  const select = useCallback((id: string) => {
    setActive(id);
    if (window.location.hash.slice(1) !== id) window.location.hash = id;
  }, []);

  function move(index: number, step: number) {
    const next = tabs[(index + step + tabs.length) % tabs.length].id;
    select(next);
    document.getElementById(`ws-side-${next}`)?.focus();
  }

  return (
    <div className="ws-section">
      <section className="ws-pagehead">
        <div className="ws-pagehead__inner">
          <nav className="ws-crumbs" aria-label="Breadcrumb">
            <Link href="/portal">Workspace</Link>
            <ChevronRight aria-hidden="true" size={14} strokeWidth={1.5} />
            <span aria-current="page">{title}</span>
          </nav>
          <div className="ws-pagehead__row">
            <span className="ws-pagehead__icon">
              <Icon aria-hidden="true" size={26} strokeWidth={1.4} />
            </span>
            <div className="ws-pagehead__text">
              <h1>{title}</h1>
              <p>{intro}</p>
              {preview ? <span className="ws-pagehead__preview">Preview with sample details</span> : null}
            </div>
            <Link className="ws-pagehead__back" href="/portal">
              <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.5} />
              Back to workspace
            </Link>
          </div>
        </div>
      </section>

      <div className={`ws-section__body${single ? " is-single" : ""}`}>
        {single ? null : (
          <div className="ws-side" role="tablist" aria-label={`${title} sections`} aria-orientation="vertical">
            {tabs.map((tab, index) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`ws-side-${tab.id}`}
                aria-selected={current.id === tab.id}
                aria-controls="ws-side-panel"
                tabIndex={current.id === tab.id ? 0 : -1}
                className="ws-side__tab"
                onClick={() => select(tab.id)}
                onKeyDown={(event) => {
                  const step =
                    event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
                  if (step === 0) return;
                  event.preventDefault();
                  move(index, step);
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
        <div
          className="ws-panel"
          {...(single ? {} : { role: "tabpanel", id: "ws-side-panel", "aria-labelledby": `ws-side-${current.id}`, tabIndex: 0 })}
        >
          {current.content}
        </div>
      </div>
    </div>
  );
}
