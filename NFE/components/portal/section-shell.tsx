"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

export interface SectionTab {
  id: string;
  label: string;
  content: ReactNode;
}

/** A full page for one section: the tabs run down the left and the chosen one fills the rest. */
export function SectionShell({
  title,
  intro,
  tabs,
  single = false,
}: {
  title: string;
  intro: string;
  tabs: SectionTab[];
  single?: boolean;
}) {
  const [active, setActive] = useState(tabs[0].id);
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];

  function move(index: number, step: number) {
    const next = tabs[(index + step + tabs.length) % tabs.length].id;
    setActive(next);
    document.getElementById(`ws-side-${next}`)?.focus();
  }

  return (
    <div className="ws-section">
      <Link className="ws-back" href="/portal">
        <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.5} />
        Workspace
      </Link>
      <header className="ws-section__head">
        <h1>{title}</h1>
        <p>{intro}</p>
      </header>

      <div className={`ws-section__body${single ? " is-single" : ""}`}>
        {single ? null : (
          <div
            className="ws-side"
            role="tablist"
            aria-label={`${title} sections`}
            aria-orientation="vertical"
          >
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
                onClick={() => setActive(tab.id)}
                onKeyDown={(event) => {
                  const step =
                    event.key === "ArrowDown" || event.key === "ArrowRight"
                      ? 1
                      : event.key === "ArrowUp" || event.key === "ArrowLeft"
                        ? -1
                        : 0;
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
          {...(single
            ? {}
            : {
                role: "tabpanel",
                id: "ws-side-panel",
                "aria-labelledby": `ws-side-${current.id}`,
                tabIndex: 0,
              })}
        >
          {current.content}
        </div>
      </div>
    </div>
  );
}
