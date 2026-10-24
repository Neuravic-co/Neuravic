import { startService } from "@neuravic/core/bootstrap";
import { adminRoutes } from "@neuravic/core/modules/admin/routes";

/** Staff tools: overview, users, staff accounts, audit log, security status and site content editing. */
startService({
  name: "admin",
  defaultPort: 8804,
  mount(api) {
    api.route("/admin", adminRoutes);
  },
});
