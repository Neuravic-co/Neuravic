import type { MalwareScanner } from "./scanner";

/**
 * Development only: marks every upload clean after the signature check the upload route already did.
 * It scans nothing. Production must set MALWARE_SCANNER_URL to a real scanning service,
 * otherwise uploads stay quarantined.
 */
export class DevMalwareScanner implements MalwareScanner {
  async scan(): Promise<"clean"> {
    return "clean";
  }
}
