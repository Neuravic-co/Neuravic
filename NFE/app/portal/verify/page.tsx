import { redirect } from "next/navigation";
import { VerifyLogin } from "@/components/portal/verify-login";
import { PORTAL_OPEN } from "@/lib/portal-gate";

export default function VerifyPage() {
  // Sign-in links only work once the portal is open; until then the preview is the portal.
  if (!PORTAL_OPEN) redirect("/portal");
  return <VerifyLogin />;
}
