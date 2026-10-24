import { startService } from "@neuravic/core/bootstrap";
import { orgsRoutes } from "@neuravic/core/modules/orgs/routes";
import { portalRoutes } from "@neuravic/core/modules/portal/routes";

/** The client portal: organisations, members, projects, requests, approvals, comments and activity. */
startService({
  name: "portal",
  defaultPort: 8802,
  mount(api) {
    api.route("/orgs", orgsRoutes);
    api.route("/", portalRoutes);
  },
});
