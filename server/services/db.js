// ─────────────────────────────────────────────────────────────────────────────
// db.js
// Runs SQL against the project's Storage tables via Keboola's Query Service —
// confirmed against Keboola docs (not the earlier raw-Snowflake-credentials
// approach, which was the wrong path). Enabling "Storage Access" on this data
// app provisions an ephemeral workspace automatically and injects
// WORKSPACE_ID/QUERY_SERVICE_URL/KBC_TOKEN/KBC_URL — no manual credential
// setup. Requires:
//   1. Storage Access enabled at the project level (Project Settings > Features).
//   2. This app's Advanced Settings > Storage Access has the required tables
//      added — out.c-BDM.BI_PROPERTY_FINANCIALS_BVA, out.c-BDM.DIM_MASTER_PROPERTY,
//      out.c-Data-App-Access-Security.DATA_APP_ACCESS (read), and
//      in.c-APP_STORAGE.GM_COMMENTARY (read+write, for commentary.js).
// ─────────────────────────────────────────────────────────────────────────────

import { QueryServiceClient } from "@keboola/query-service";

let client = null;

function getClient() {
  if (client) return client;

  const required = ["QUERY_SERVICE_URL", "KBC_TOKEN", "WORKSPACE_ID"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`db.js: missing env vars: ${missing.join(", ")} — is Storage Access enabled for this data app?`);
  }

  client = new QueryServiceClient({
    baseUrl: process.env.QUERY_SERVICE_URL,
    token: process.env.KBC_TOKEN,
    workspaceId: process.env.WORKSPACE_ID,
  });
  return client;
}

// runQuery(sql) → Promise<Array<Record<string, any>>>
// SQL passes through to Snowflake unchanged (Query Service doesn't translate
// dialects) — use the same quoted-identifier FQN style as everywhere else.
export async function runQuery(sql) {
  const result = await getClient().query({ sql });
  return result.rows;
}
