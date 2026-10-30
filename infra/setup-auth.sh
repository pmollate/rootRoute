#!/usr/bin/env bash
# C13 step 6 (SPEC-auth §10 step 2): sign-in settings for the live apps, demo accounts only (Entra comes later, Q-AUTH-01).
# Run once from the repo root: bash infra/setup-auth.sh   (custom domain: WEB_URL=https://rootroute.in bash infra/setup-auth.sh)
# Secrets are generated here and written straight to Key Vault; no value is printed. AUTH_REQUIRED stays off.
# Re-running keeps existing secrets (delete one in Key Vault to make a new value).
set -euo pipefail

RG=rg-unhandled-rejections
KV=rootroute01-kv
WEB=rootroute01-web
API=rootroute01-api
# The public address people open (the custom domain once bound, e.g. WEB_URL=https://rootroute.in): sign-in redirects,
# the /api proxy's Origin check and the address link (<WEB_URL>/confirm/<token>) all use it.
WEB_URL=${WEB_URL:-https://$WEB.azurewebsites.net}
API_URL=https://$API.azurewebsites.net
ref() { echo "@Microsoft.KeyVault(SecretUri=https://$KV.vault.azure.net/secrets/$1/)"; }

tmp=$(mktemp -d); chmod 700 "$tmp"; trap 'rm -rf "$tmp"' EXIT

# 1. Secrets: two signing keys, six demo accounts (one per role, shared password) and the password itself.
NODE_PATH=frontend/node_modules OUT=$tmp node -e "$(cat <<'EOF'
const fs = require("fs"), crypto = require("crypto"), bcrypt = require("bcryptjs");
const w = (n, v) => fs.writeFileSync(`${process.env.OUT}/${n}`, v, { mode: 0o600 });
const key = () => crypto.randomBytes(32).toString("base64url");
const password = crypto.randomBytes(12).toString("base64url");
const hash = bcrypt.hashSync(password, 10);
const roles = ["order_desk", "warehouse_supervisor", "carrier_manager", "customer_support", "leadership", "admin"];
w("auth-secret", key());
w("internal-auth-secret", key());
w("auth-demo-password", password);
w("auth-demo-users", JSON.stringify(roles.map((r) => ({ email: `demo-${r}@rootroute.test`,
  name: `Demo ${r.replace(/_/g, " ")}`, roles: [r], hash }))));
EOF
)"

existing=$(az keyvault secret list --vault-name "$KV" --query "[].name" -o tsv)
if grep -qx auth-demo-users <<<"$existing"; then
  echo "auth-demo-users already in Key Vault: keeping the existing accounts and password"
  rm -f "$tmp/auth-demo-users" "$tmp/auth-demo-password"
fi
for n in auth-secret internal-auth-secret auth-demo-users auth-demo-password; do
  [ -f "$tmp/$n" ] || continue
  if grep -qx "$n" <<<"$existing"; then echo "$n: kept"; continue; fi
  az keyvault secret set --vault-name "$KV" -n "$n" --file "$tmp/$n" -o none
  echo "$n: created"
done

# 2. The web app reads Key Vault with its own identity (the API already has one).
pid=$(az webapp identity assign -g "$RG" -n "$WEB" --query principalId -o tsv)
az keyvault set-policy -n "$KV" --object-id "$pid" --secret-permissions get list -o none
echo "web identity: can read $KV secrets"

# 3. App settings (merged with what is there). API_URL / API_KEY are server-only for the /api proxy.
az webapp config appsettings set -g "$RG" -n "$WEB" -o none --settings \
  "AUTH_SECRET=$(ref auth-secret)" \
  "INTERNAL_AUTH_SECRET=$(ref internal-auth-secret)" \
  "AUTH_DEMO_USERS=$(ref auth-demo-users)" \
  "AUTH_DEMO=on" \
  "AUTH_URL=$WEB_URL" \
  "AUTH_TRUST_HOST=true" \
  "API_URL=$API_URL" \
  "API_KEY=$(ref api-key)"
az webapp config appsettings set -g "$RG" -n "$API" -o none --settings \
  "INTERNAL_AUTH_SECRET=$(ref internal-auth-secret)" \
  "AUTH_URL=$WEB_URL"
echo "app settings: set on $WEB and $API (AUTH_REQUIRED left off)"

# 4. Restart so Key Vault references resolve.
az webapp restart -g "$RG" -n "$WEB"
az webapp restart -g "$RG" -n "$API"
echo "restarted. Demo password: az keyvault secret show --vault-name $KV -n auth-demo-password --query value -o tsv"
