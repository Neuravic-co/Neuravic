import { startService } from "@neuravic/core/bootstrap";
import { contentRoutes } from "@neuravic/core/modules/content/routes";
import { leadsRoutes } from "@neuravic/core/modules/leads/routes";

/** The public side of the company: website enquiries (leads) and the editable site content. */
startService({
  name: "leads",
  defaultPort: 8803,
  mount(api) {
    api.route("/leads", leadsRoutes);
    api.route("/content", contentRoutes);
  },
});
