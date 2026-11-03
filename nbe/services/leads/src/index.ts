import { startService } from "@neuravic/core/bootstrap";
import { mountLeads } from "@neuravic/core/services";

/** The public side of the company: website enquiries (leads) and the editable site content. */
startService({ name: "leads", defaultPort: 8803, mount: mountLeads });
