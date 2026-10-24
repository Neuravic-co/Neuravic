"use client";

import { ArrowUpRight, Search } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import type { Me } from "@/lib/portal";
import { CATALOG, TOOL_CATEGORIES, type CatalogTool, type ToolLicence } from "@/lib/workspace";

type Filter = "all" | ToolLicence;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open source" },
  { id: "closed", label: "Closed source" },
];

const LICENCE_LABELS: Record<ToolLicence, string> = { open: "Open source", closed: "Closed source" };

/** Search plus an open or closed source filter over the tools staff use. Neuravic's own tools open the client portal. */
export function ToolsCatalog({ staffRole, signedIn }: { staffRole: Me["user"]["staffRole"]; signedIn: boolean }) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const tools = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return CATALOG.filter((tool) => !tool.roles || (staffRole !== null && tool.roles.includes(staffRole)))
      .filter((tool) => filter === "all" || tool.licence === filter)
      .filter((tool) => !needle || `${tool.name} ${tool.description} ${tool.category}`.toLowerCase().includes(needle));
  }, [query, filter, staffRole]);

  const groups = TOOL_CATEGORIES.map((category) => ({ category, items: tools.filter((tool) => tool.category === category) })).filter(
    (group) => group.items.length > 0,
  );

  return (
    <div className="ws-stack">
      <div className="ws-search">
        <label htmlFor={searchId} className="sr-only">
          Search tools
        </label>
        <Search aria-hidden="true" size={18} strokeWidth={1.5} />
        <input id={searchId} type="search" placeholder="Search tools" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="ws-filter" role="group" aria-label="Licence">
          {FILTERS.map((item) => (
            <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <p className="ws-count" role="status">
        {tools.length === 1 ? "1 tool" : `${tools.length} tools`}
      </p>

      {groups.length === 0 ? <p className="ws-empty">No tools match. Try a different search or filter.</p> : null}

      {groups.map(({ category, items }) => (
        <section key={category}>
          <h2 className="ws-subtitle">{category}</h2>
          <ul className="ws-tool-grid">
            {items.map((tool) => (
              <li key={tool.name}>
                <ToolCard tool={tool} signedIn={signedIn} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="ws-notice">Listed tools other than Neuravic&apos;s own are examples of what the team uses. Links to each one are added as they are connected.</p>
    </div>
  );
}

function ToolCard({ tool, signedIn }: { tool: CatalogTool; signedIn: boolean }) {
  const body = (
    <>
      <strong>{tool.name}</strong>
      <span>{tool.description}</span>
      <em className={`ws-licence ws-licence--${tool.licence}`}>{LICENCE_LABELS[tool.licence]}</em>
    </>
  );
  if (!tool.tab) return <div className="ws-tool is-soon">{body}</div>;
  if (!signedIn) {
    return (
      <div className="ws-tool is-soon">
        {body}
        <small>Needs sign-in</small>
      </div>
    );
  }
  return (
    <Link className="ws-tool" href={`/portal/clients#${tool.tab}`}>
      {body}
      <ArrowUpRight className="ws-tool__go" aria-hidden="true" size={18} strokeWidth={1.5} />
    </Link>
  );
}
