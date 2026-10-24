import { startService } from "@neuravic/core/bootstrap";
import { authRoutes, meRoutes } from "@neuravic/core/modules/auth/routes";
import { privacyAdminRoutes, privacyRoutes } from "@neuravic/core/modules/privacy/routes";
import { jwksRoutes, ssoRoutes } from "@neuravic/core/modules/sso/routes";

/** Accounts: sign-up, login, sessions, staff MFA, the profile, privacy requests and single sign-on tokens. */
startService({
  name: "auth",
  defaultPort: 8801,
  mount(api, root) {
    api.route("/auth", authRoutes);
    api.route("/me", meRoutes);
    api.route("/me/privacy", privacyRoutes);
    api.route("/admin/privacy-requests", privacyAdminRoutes);
    api.route("/token", ssoRoutes);
    root.route("/.well-known/jwks.json", jwksRoutes);
  },
});
