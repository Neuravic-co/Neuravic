export function databaseSsl(caCert: string | null | undefined): { ca: string; rejectUnauthorized: true } | undefined {
  const raw = caCert?.trim();
  if (!raw) return undefined;
  const ca = raw.replace(/\\n/g, "\n");
  if (!ca.includes("BEGIN CERTIFICATE")) throw new Error("DATABASE_CA_CERT must be a PEM certificate");
  return { ca, rejectUnauthorized: true };
}
