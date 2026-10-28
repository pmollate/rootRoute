#!/usr/bin/env bash
# Local checks before pushing: the same lint, typecheck and tests CI runs, plus the Playwright smoke test when the app
# is running locally. The pre-push hook (.githooks/pre-push) runs it for the areas a push changes.
#   npm run check                         every area
#   npm run check -- --changed <base>     only the areas changed since <base> (what the hook does)
# Environment: RUN_E2E=1 fails when the local app is not running instead of skipping the smoke test; SKIP_E2E=1 skips
# it. WEB_URL / API_URL point the smoke test elsewhere (default: the local app). Skip the hook once: git push --no-verify
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

changed=ALL
if [ "${1:-}" = "--changed" ]; then
  changed=$(git diff --name-only "${2:?--changed needs a base commit}...${3:-HEAD}")
  if [ -z "$changed" ]; then echo "check: nothing changed"; exit 0; fi
fi
touches() { [ "$changed" = ALL ] || grep -qE "$1" <<<"$changed"; }

# The venv from the README when there is one, so ruff and pytest resolve without activating it.
PY=$(command -v .venv/bin/python || command -v python3 || command -v python)
RUFF=$(command -v .venv/bin/ruff || command -v ruff || true)

failed=()
# npm ci records what it installed in node_modules/.package-lock.json; a newer lockfile means the install is out of
# date (someone added a package), and the checks below would fail with confusing errors. Only the installs the
# selected checks use are checked.
needs=()
touches '^frontend/|^backend/api/' && needs+=(frontend)   # frontend checks and the e2e smoke test
touches '^backend/api/|^backend/db/' && needs+=(backend/api)
for dir in "${needs[@]+"${needs[@]}"}"; do
  if [ ! -f "$dir/node_modules/.package-lock.json" ] || [ "$dir/package-lock.json" -nt "$dir/node_modules/.package-lock.json" ]; then
    echo "✗ $dir dependencies are missing or out of date: run npm run setup"
    failed+=("$dir dependencies")
  fi
done
if [ ${#failed[@]} -gt 0 ]; then echo "check failed: ${failed[*]}"; exit 1; fi

run() {
  local name=$1; shift
  echo "▶ $name"
  if "$@"; then echo "✓ $name"; else echo "✗ $name"; failed+=("$name"); fi
}
skip() { echo "– $1 skipped: $2"; }

if touches '^frontend/'; then
  run "frontend typecheck" npm --prefix frontend run --silent typecheck
  run "frontend unit tests" npm --prefix frontend test --silent
fi

if touches '^backend/api/|^backend/db/'; then
  run "API typecheck" npm --prefix backend/api run --silent lint
  run "API tests (database tests run only when the test database is up)" npm --prefix backend/api test --silent
fi

if touches '^backend/(analytics|synthetic-data)/|^requirements|^pytest\.ini$|^ruff\.toml$'; then
  if [ -n "$RUFF" ]; then
    run "Python lint" "$RUFF" check backend/analytics backend/synthetic-data/generators
  else
    skip "Python lint" "ruff not installed (pip install -r requirements.txt)"
  fi
  if "$PY" -c 'import pytest' 2>/dev/null; then
    run "Python tests" "$PY" -m pytest -q
  else
    skip "Python tests" "pytest not installed (pip install -r requirements.txt)"
  fi
fi

# Smoke test of every screen against the running app (npm run dev:all). It needs the app, so it is skipped when the
# app is not up, unless RUN_E2E=1.
if [ "${SKIP_E2E:-}" != 1 ] && touches '^frontend/|^backend/api/'; then
  web=${WEB_URL:-http://localhost:3000}
  api=${API_URL:-http://localhost:3001}
  if curl -fsS -o /dev/null --max-time 5 "$api/api/health" && curl -fsS -o /dev/null --max-time 30 "$web/"; then
    run "e2e smoke test against $web" env WEB_URL="$web" API_URL="$api" npm --prefix frontend run --silent e2e
  elif [ "${RUN_E2E:-}" = 1 ]; then
    echo "✗ e2e smoke test: the app is not running at $web and $api (start it with npm run dev:all)"
    failed+=("e2e smoke test")
  else
    skip "e2e smoke test" "the app is not running at $web (npm run dev:all, or RUN_E2E=1 to require it)"
  fi
fi

if [ ${#failed[@]} -gt 0 ]; then
  echo
  echo "check failed: ${failed[*]}"
  echo "Fix them, or push anyway with: git push --no-verify"
  exit 1
fi
echo
echo "check passed"
