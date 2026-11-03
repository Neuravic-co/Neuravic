/**
 * TLS settings for managed MySQL services (Aiven and similar), which refuse unencrypted connections and sign
 * with their own certificate authority. Set DATABASE_CA_CERT to that CA certificate (PEM; "\\n" is accepted for
 * line breaks, which is how single-line secret fields store it). Without it the connection string decides.
 */
export function databaseSsl(env: Record<string, string | undefined> = process.env): { ca: string; rejectUnauthorized: true } | undefined {
  const raw = env.DATABASE_CA_CERT?.trim();
  if (!raw) return undefined;
  const ca = raw.replace(/\\n/g, "\n");
  if (!ca.includes("BEGIN CERTIFICATE")) throw new Error("DATABASE_CA_CERT must be a PEM certificate");
  return { ca, rejectUnauthorized: true };
}
