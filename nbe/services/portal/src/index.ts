import { startService } from "@neuravic/core/bootstrap";
import { mountPortal } from "@neuravic/core/services";

/** The client portal: organisations, members, projects, requests, approvals, comments and activity. */
startService({ name: "portal", defaultPort: 8802, mount: mountPortal });
