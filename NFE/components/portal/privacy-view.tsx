"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAction, usePaged } from "./use-query";
import { ErrorNote, Loading } from "./ui";
import { useMe } from "./session";

interface PrivacyRequest { id: string; kind: "export" | "erasure"; state: string; createdAt: number }
export function PrivacyView() {
  const me = useMe();
  const requests = usePaged<PrivacyRequest>("/me/privacy/requests", {});
  const action = useAction();
  const [notice, setNotice] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  async function request(kind: "export" | "erasure") {
    if (await action.run(() => api("/me/privacy/requests", { method: "POST", body: { kind } }))) {
      setNotice("Your request is awaiting identity and retention review. No records have been deleted.");
      requests.reload();
    }
  }
  async function download() {
    await action.run(async () => {
      const copy = await api("/me/privacy/export");
      const url = URL.createObjectURL(new Blob([JSON.stringify(copy, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = "neuravic-account.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    });
  }
  return <main className="portal-auth"><div className="portal-auth__card">
    <Link href="/portal" className="portal-link">Back to portal</Link>
    <p className="portal-eyebrow">Portal / Privacy</p>
    <h1>Your privacy requests</h1>
    <p>You can download a limited account copy or request a reviewed export or erasure. Sign in again if your authentication is older than 15 minutes. Full requests require identity, tenant confidentiality and retention review.</p>
    <button className="portal-button" disabled={action.busy} onClick={() => void download()}>Download account copy</button>
    <div className="portal-actions">
      <button className="portal-button" disabled={action.busy} onClick={() => void request("export")}>Request reviewed export</button>
      <button className="portal-button" disabled={action.busy} onClick={() => void request("erasure")}>Request erasure review</button>
    </div>
    {notice ? <p role="status">{notice}</p> : null}
    {action.error ? <ErrorNote error={action.error} /> : null}
    {requests.loading ? <Loading label="Loading privacy requests" /> : null}
    {requests.error ? <ErrorNote error={requests.error} onRetry={requests.reload} /> : null}
    <ul>{requests.items.map((item) => <li key={item.id}>{item.kind === "export" ? "Export" : "Erasure"} — {item.state.replaceAll("_", " ")}</li>)}</ul>
    {requests.hasMore ? <button className="portal-button" disabled={requests.loadingMore} onClick={() => void requests.loadMore()}>Load more requests</button> : null}
    {me.user.staffRole ? <section>
      <h2>Staff recovery codes</h2>
      <p>A fresh authenticator code can replace all saved recovery codes. Existing recovery codes will stop working. A recovery code cannot authorize this replacement.</p>
      {recoveryCodes.length ? <><p>Save these codes privately. Each works once and they will not be shown again.</p><ul>{recoveryCodes.map((value) => <li key={value}><code>{value}</code></li>)}</ul><button className="portal-button" onClick={() => setRecoveryCodes([])}>I have saved my codes</button></> :
        <form className="portal-form" onSubmit={(event) => { event.preventDefault(); void action.run(async () => { const result = await api<{ recoveryCodes: string[] }>("/auth/mfa/recovery-codes", { method: "POST", body: { code } }); setCode(""); setRecoveryCodes(result.recoveryCodes); }); }}>
          <label htmlFor="replace-recovery-code">Fresh authenticator code</label>
          <input id="replace-recovery-code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" value={code} onChange={(event) => setCode(event.target.value)} maxLength={6} required />
          <button className="portal-button" disabled={action.busy}>Replace recovery codes</button>
        </form>}
    </section> : null}
  </div></main>;
}
