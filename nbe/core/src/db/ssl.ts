/**
 * TLS settings for managed Postgres services (Neon, Supabase and similar). Most of them sign with a public
 * certificate authority, so a connection string ending in `?sslmode=require` is enough and this stays unset.
 * Set DATABASE_CA_CERT only when your provider signs with its own authority (PEM; "\\n" is accepted for
 * line breaks, which is how single-line secret fields store it). Without it the connection string decides.
 */
export function databaseSsl(env: Record<string, string | undefined> = process.env): { ca: string; rejectUnauthorized: true } | undefined {
  const raw = env.DATABASE_CA_CERT?.trim();
  if (!raw) return undefined;
  const ca = raw.replace(/\\n/g, "\n");
  if (!ca.includes("BEGIN CERTIFICATE")) throw new Error("DATABASE_CA_CERT must be a PEM certificate");
  return { ca, rejectUnauthorized: true };
}
