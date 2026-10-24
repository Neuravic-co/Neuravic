import { startService } from "@neuravic/core/bootstrap";
import { filesRoutes } from "@neuravic/core/modules/files/routes";
import { scanPendingFiles } from "@neuravic/core/modules/files/scanner";

/**
 * The file server: the only service that stores and reads uploaded files (UPLOAD_DIR).
 * It checks the caller's session and role like every other service, keeps new files quarantined,
 * and scans them in the background before they can be downloaded.
 */
startService({
  name: "files",
  defaultPort: 8805,
  hostsFiles: true,
  mount(api) {
    api.route("/", filesRoutes);
  },
  timers: [{ everyMs: 30_000, run: (deps) => scanPendingFiles(deps) }],
});
