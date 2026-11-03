import { startService } from "@neuravic/core/bootstrap";
import { mountAdmin } from "@neuravic/core/services";

/** Staff tools: overview, users, staff accounts, audit log, security status and site content editing. */
startService({ name: "admin", defaultPort: 8804, mount: mountAdmin });
