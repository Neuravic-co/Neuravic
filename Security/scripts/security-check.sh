#!/usr/bin/env bash
# Security check for the repository.
#   1. No secret-looking files are tracked.
#   2. No secret-looking values appear in tracked files.
#   3. The backend has no high or critical vulnerabilities in production dependencies.
#   4. Frontend vulnerabilities are reported (they do not fail the check; see Security/README.md).
# Usage: ./Security/scripts/security-check.sh        (run from anywhere)
set -u
cd "$(git rev-parse --show-toplevel)"

failures=0
fail() { echo "  FAIL: $1"; failures=$((failures + 1)); }
ok() { echo "  ok:   $1"; }

echo "1. Tracked files that should never be committed"
bad_files=$(git ls-files | grep -E '(^|/)(\.env(\..+)?|\.dev\.vars|.*\.pem|.*\.p12|.*\.pfx|id_rsa|id_ed25519)$' | grep -vE '\.(example|sample)$' || true)
if [ -n "$bad_files" ]; then fail "secret-like files are tracked:"; echo "$bad_files" | sed 's/^/        /'; else ok "none"; fi

echo "2. Secret-looking values in tracked files"
patterns=(
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  'AKIA[0-9A-Z]{16}'
  'xox[baprs]-[0-9A-Za-z-]{10,}'
  'gh[pousr]_[0-9A-Za-z]{30,}'
  'sk_live_[0-9A-Za-z]{16,}'
  're_[0-9A-Za-z]{20,}_[0-9A-Za-z]{10,}'
  '"d"[[:space:]]*:[[:space:]]*"[A-Za-z0-9_-]{40,}"'
)
found=0
for pattern in "${patterns[@]}"; do
  hits=$(git grep -I -n -E -e "$pattern" -- . ':(exclude)Security/scripts/security-check.sh' ':(exclude)*package-lock.json' 2>/dev/null || true)
  if [ -n "$hits" ]; then found=1; fail "matches /$pattern/:"; echo "$hits" | cut -c1-140 | sed 's/^/        /'; fi
done
[ "$found" -eq 0 ] && ok "none"

audit() { # $1 = folder, $2 = "gate" or "report"
  local folder=$1 mode=$2
  if [ ! -f "$folder/package-lock.json" ]; then echo "  skip: $folder has no package-lock.json"; return; fi
  local out
  out=$(cd "$folder" && npm audit --package-lock-only --omit=dev --audit-level=high 2>&1)
  local status=$?
  if [ $status -eq 0 ]; then ok "$folder: no high or critical vulnerabilities in production dependencies"
  elif [ "$mode" = "gate" ]; then fail "$folder has vulnerable production dependencies:"; echo "$out" | grep -E '^[a-z@].*  |Severity' | sed 's/^/        /'
  else echo "  note: $folder has advisories (reported only):"; echo "$out" | grep -E '^[a-z@].*  |Severity' | sed 's/^/        /'; fi
}

echo "3. Backend dependencies (gate)"
audit NBE gate
echo "4. Frontend dependencies (report only)"
audit NFE report

echo
if [ "$failures" -gt 0 ]; then echo "Security check FAILED ($failures problem(s))"; exit 1; fi
echo "Security check passed"
