"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { useSession } from "./session";

/** Only first-factor sessions can reach setup. Secrets remain in component memory, never URLs/storage. */
export function StaffMfa() {
  const { refresh, signOut } = useSession();
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ enrolled: boolean }>("/auth/mfa").then((result) => setEnrolled(result.enrolled)).catch(() => setError("Sign in again to start verification."));
  }, []);

  async function setup() {
    setBusy(true); setError("");
    try { setSecret((await api<{ secret: string }>("/auth/mfa/setup", { method: "POST" })).secret); }
    catch { setError("Setup could not start. Sign in again or contact your administrator."); }
    finally { setBusy(false); }
  }

  async function verify(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await api<{ recoveryCodes: string[] }>(`/auth/mfa/${enrolled ? "verify" : "confirm"}`, { method: "POST", body: { code } });
      setCode(""); setSecret("");
      if (result.recoveryCodes.length) setRecovery(result.recoveryCodes);
      else await refresh();
    } catch { setError("Verification failed. Use a new authenticator code or an unused recovery code. Too many attempts require a short wait."); }
    finally { setBusy(false); }
  }

  return <main className="portal-auth"><div className="portal-auth__card">
    <p className="portal-eyebrow">Portal / Staff verification</p>
    <h1>{recovery.length ? "Save your recovery codes" : "Verify your sign-in"}</h1>
    {error ? <p role="alert">{error}</p> : null}
    {recovery.length ? <>
      <p>Save these codes in a private password manager. Each works once after email sign-in. They will not be shown again.</p>
      <ul>{recovery.map((item) => <li key={item}><code>{item}</code></li>)}</ul>
      <button className="portal-button" onClick={() => { setRecovery([]); void refresh(); }}>I have saved my codes</button>
    </> : <>
      {enrolled === false && !secret ? <>
        <p>Staff accounts require an authenticator app. Add the setup key to your app, then confirm its six-digit code.</p>
        <button className="portal-button" disabled={busy} onClick={() => void setup()}>Set up authenticator</button>
      </> : null}
      {secret ? <p>Setup key: <code>{secret}</code></p> : null}
      {enrolled || secret ? <form onSubmit={(event) => void verify(event)}>
        <label htmlFor="staff-code">{enrolled ? "Authenticator or recovery code" : "Authenticator code"}</label>
        <input id="staff-code" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} maxLength={32} required />
        <button className="portal-button" disabled={busy} type="submit">Verify</button>
      </form> : null}
    </>}
    <button className="portal-button" onClick={() => void signOut()}>Sign out</button>
  </div></main>;
}
