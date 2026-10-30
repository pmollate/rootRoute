#!/usr/bin/env bash
# Create the LateLens demo environment (owner C). Safe to re-run: each step skips what already exists.
# Requires: az login with Owner on the resource group, and permission to create app registrations.
# Usage: NAME=rootroute01 GITHUB_REPO=Evoke-Hackathon-2026/UnhandledRejections ./infra/setup.sh
# Optional: GITHUB_OIDC_SUBJECT='repo:Evoke-Hackathon-2026@<org-id>/UnhandledRejections@<repo-id>:environment:copilot' (see the OIDC step).
# Optional: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT (stored in Key Vault; without them the
# API replays recorded AI answers, LLM_PROVIDER=recorded).
set -euo pipefail
: "${RG:=rg-unhandled-rejections}" "${LOC:=centralindia}" "${NAME:?set NAME, e.g. rootroute01}" "${GITHUB_REPO:?set GITHUB_REPO owner/name}"
export PYTHONWARNINGS=ignore   # az CLI prints SyntaxWarnings on Python 3.14
KV="$NAME-kv"; API="$NAME-api"; WEB="$NAME-web"; DB="$NAME-db"
exists() { "$@" -o none 2>/dev/null; }
secret() { az keyvault secret show --vault-name "$KV" -n "$1" --query value -o tsv 2>/dev/null || true; }

# The organisers' group is Terraform-managed with tags: never re-save it.
az group show -n "$RG" -o none

# Key Vault holds every secret; nobody types or sees the database password.
exists az keyvault show -g "$RG" -n "$KV" || az keyvault create -g "$RG" -n "$KV" -l "$LOC" --enable-rbac-authorization false -o none
ME=$(az ad signed-in-user show --query id -o tsv)
az keyvault set-policy -n "$KV" --object-id "$ME" --secret-permissions get list set -o none
PG_PASSWORD=$(secret pg-password)
if [ -z "$PG_PASSWORD" ]; then
  PG_PASSWORD="$(openssl rand -hex 24)"
  az keyvault secret set --vault-name "$KV" -n pg-password --value "$PG_PASSWORD" -o none
fi
[ -n "$(secret api-key)" ] || az keyvault secret set --vault-name "$KV" -n api-key --value "$(openssl rand -hex 16)" -o none
# Bearer token for the Ask LateLens MCP endpoint (D7); separate from api-key, which the dashboard ships to browsers.
[ -n "$(secret mcp-token)" ] || az keyvault secret set --vault-name "$KV" -n mcp-token --value "$(openssl rand -hex 24)" -o none
for s in AZURE_OPENAI_ENDPOINT AZURE_OPENAI_API_KEY AZURE_OPENAI_DEPLOYMENT; do
  name=$(echo "$s" | tr '[:upper:]_' '[:lower:]-')
  if [ -n "${!s:-}" ]; then az keyvault secret set --vault-name "$KV" -n "$name" --value "${!s}" -o none; fi
done

# PostgreSQL Flexible Server (Burstable B1ms); the firewall admits Azure services only.
exists az postgres flexible-server show -g "$RG" -n "$DB" || az postgres flexible-server create -g "$RG" -n "$DB" -l "$LOC" \
  --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 16 --admin-user latelens \
  --admin-password "$PG_PASSWORD" --public-access 0.0.0.0 --yes -o none
exists az postgres flexible-server db show -g "$RG" -s "$DB" -n latelens || az postgres flexible-server db create -g "$RG" -s "$DB" -n latelens -o none
az keyvault secret set --vault-name "$KV" -n database-url -o none \
  --value "postgres://latelens:${PG_PASSWORD}@${DB}.postgres.database.azure.com:5432/latelens?sslmode=require"

# Application Insights on a Log Analytics workspace (core CLI only: extension downloads can be blocked by proxies)
exists az monitor log-analytics workspace show -g "$RG" -n "$NAME-logs" \
  || az monitor log-analytics workspace create -g "$RG" -n "$NAME-logs" -l "$LOC" -o none
WS_ID=$(az monitor log-analytics workspace show -g "$RG" -n "$NAME-logs" --query id -o tsv)
exists az resource show -g "$RG" -n "$NAME-ai" --resource-type Microsoft.Insights/components \
  || az resource create -g "$RG" -n "$NAME-ai" --resource-type Microsoft.Insights/components --api-version 2020-02-02 \
       --is-full-object -o none --properties \
       "{\"location\":\"$LOC\",\"kind\":\"web\",\"properties\":{\"Application_Type\":\"web\",\"WorkspaceResourceId\":\"$WS_ID\"}}"
AI_CONN=$(az resource show -g "$RG" -n "$NAME-ai" --resource-type Microsoft.Insights/components --query properties.ConnectionString -o tsv)
# App Insights collects requests only; the API's log lines (pino on stdout, with emailId) reach the same workspace
# through a diagnostic setting, in AppServiceConsoleLogs (NFR-03). Created after the API app below.

# One Linux plan runs both apps: the API and the Next.js app (landing page + dashboard; its middleware needs a server).
exists az appservice plan show -g "$RG" -n "$NAME-plan" || az appservice plan create -g "$RG" -n "$NAME-plan" --is-linux --sku B1 -o none
for app in "$API" "$WEB"; do
  exists az webapp show -g "$RG" -n "$app" || az webapp create -g "$RG" -p "$NAME-plan" -n "$app" --runtime "NODE:24-lts" -o none
  az webapp update -g "$RG" -n "$app" --https-only true -o none
done
az webapp config set -g "$RG" -n "$API" --startup-file "node backend/api/dist/index.js" --always-on true -o none
API_ID=$(az webapp show -g "$RG" -n "$API" --query id -o tsv)
exists az monitor diagnostic-settings show -n app-logs --resource "$API_ID" \
  || az monitor diagnostic-settings create -n app-logs --resource "$API_ID" --workspace "$WS_ID" -o none \
       --logs '[{"category":"AppServiceConsoleLogs","enabled":true},{"category":"AppServiceAppLogs","enabled":true}]'
az webapp config set -g "$RG" -n "$WEB" --startup-file "node node_modules/next/dist/bin/next start -p \$PORT" --always-on true -o none

# The API reads its secrets through Key Vault references with its managed identity.
PRINCIPAL=$(az webapp identity assign -g "$RG" -n "$API" --query principalId -o tsv)
az keyvault set-policy -n "$KV" --object-id "$PRINCIPAL" --secret-permissions get list -o none
REF="https://$KV.vault.azure.net/secrets"
LLM_SETTINGS=("LLM_PROVIDER=recorded" "PII_PROVIDER=recorded")
if [ -n "$(secret azure-openai-api-key)" ]; then
  LLM_SETTINGS=("LLM_PROVIDER=azure-openai" "PII_PROVIDER=recorded"
    "AZURE_OPENAI_ENDPOINT=@Microsoft.KeyVault(SecretUri=$REF/azure-openai-endpoint/)"
    "AZURE_OPENAI_API_KEY=@Microsoft.KeyVault(SecretUri=$REF/azure-openai-api-key/)"
    "AZURE_OPENAI_DEPLOYMENT=@Microsoft.KeyVault(SecretUri=$REF/azure-openai-deployment/)")
fi
az webapp config appsettings set -g "$RG" -n "$API" -o none --settings \
  "DATABASE_URL=@Microsoft.KeyVault(SecretUri=$REF/database-url/)" \
  "API_KEY=@Microsoft.KeyVault(SecretUri=$REF/api-key/)" \
  "MCP_TOKEN=@Microsoft.KeyVault(SecretUri=$REF/mcp-token/)" \
  "${LLM_SETTINGS[@]}" "ALLOW_LIST=ops-test@latelens.example,orders@client190.example" \
  "APPLICATIONINSIGHTS_CONNECTION_STRING=$AI_CONN" "ApplicationInsightsAgent_EXTENSION_VERSION=~3" \
  "NODE_ENV=production" "SCM_DO_BUILD_DURING_DEPLOYMENT=false"
az webapp config appsettings set -g "$RG" -n "$WEB" -o none --settings \
  "NODE_ENV=production" "MAINTENANCE_MODE=false" "NEXT_TELEMETRY_DISABLED=1" "SCM_DO_BUILD_DURING_DEPLOYMENT=false"

# GitHub Actions signs in with OIDC (no stored Azure password) and reads its secrets from Key Vault.
APP_ID=$(az ad app list --display-name "$NAME-github" --query "[0].appId" -o tsv)
if [ -z "$APP_ID" ]; then
  APP_ID=$(az ad app create --display-name "$NAME-github" --query appId -o tsv)
  az ad sp create --id "$APP_ID" -o none
fi
# GitHub sends either repo:owner/name:environment:copilot or, on repos using immutable ids,
# repo:owner@<id>/name@<id>:environment:copilot. Register the first always and the second when given:
# copy it from the "subject claim" line of a failed azure/login step into GITHUB_OIDC_SUBJECT.
fed() {
  az ad app federated-credential show --id "$APP_ID" --federated-credential-id "$1" -o none 2>/dev/null \
    || az ad app federated-credential create --id "$APP_ID" -o none --parameters \
      "{\"name\":\"$1\",\"issuer\":\"https://token.actions.githubusercontent.com\",\"subject\":\"$2\",\"audiences\":[\"api://AzureADTokenExchange\"]}"
}
# Credential names include the repo, so a moved repo (30 Oct: saiprasad-37/root-route to
# Evoke-Hackathon-2026/UnhandledRejections) gets its own credentials instead of skipping the old "demo" ones.
FED="demo-${GITHUB_REPO//\//-}"
fed "$FED" "repo:${GITHUB_REPO}:environment:copilot"
if [ -n "${GITHUB_OIDC_SUBJECT:-}" ]; then fed "$FED-ids" "$GITHUB_OIDC_SUBJECT"; fi
SP=$(az ad sp show --id "$APP_ID" --query id -o tsv)
az role assignment create --assignee-object-id "$SP" --assignee-principal-type ServicePrincipal --role Contributor \
  --scope "$(az group show -n "$RG" --query id -o tsv)" -o none
az keyvault set-policy -n "$KV" --object-id "$SP" --secret-permissions get list -o none

cat <<OUT

Done. API https://$API.azurewebsites.net   Web https://$WEB.azurewebsites.net
A repo admin adds these under GitHub Settings > Environments > demo (none of them is a password):
  secrets:   AZURE_CLIENT_ID=$APP_ID
             AZURE_TENANT_ID=$(az account show --query tenantId -o tsv)
             AZURE_SUBSCRIPTION_ID=$(az account show --query id -o tsv)
  variables: AZURE_RG=$RG  NAME=$NAME
OUT
