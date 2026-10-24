import type { ReactNode } from "react";
import type { ApiError } from "@/lib/api";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="portal-field">
      <label htmlFor={htmlFor}>
        {label}
        {hint ? <em>{hint}</em> : null}
      </label>
      {children}
      {error ? (
        <span className="portal-field__error" id={`${htmlFor}-error`}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "active" | "done" | "muted"; children: ReactNode }) {
  return <span className={`portal-badge portal-badge--${tone}`}>{children}</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="portal-empty">
      <p className="portal-empty__title">{title}</p>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <p className="portal-loading" role="status">
      {label}…
    </p>
  );
}

export function ErrorNote({ error, onRetry }: { error: ApiError | string; onRetry?: () => void }) {
  const message = typeof error === "string" ? error : error.message;
  return (
    <div className="portal-note" role="alert">
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="portal-link" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="portal-section-header">
      <h2>{title}</h2>
      {action}
    </div>
  );
}
