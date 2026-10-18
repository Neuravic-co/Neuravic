import { UnderConstruction } from "@/components/portal/under-construction";
import { VerifyLogin } from "@/components/portal/verify-login";
import { PORTAL_OPEN } from "@/lib/portal-gate";

export default function VerifyPage() {
  return PORTAL_OPEN ? <VerifyLogin /> : <UnderConstruction />;
}
