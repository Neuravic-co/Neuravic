import { startService } from "@neuravic/core/bootstrap";
import { mountAuth } from "@neuravic/core/services";

/** Accounts: sign-up, login, sessions, staff MFA, the profile, privacy requests and single sign-on tokens. */
startService({ name: "auth", defaultPort: 8801, mount: mountAuth });
