// ─────────────────────────────────────────────────────────────────────────────
// access.js
// Resolves which properties a signed-in GM can see, and the property list
// itself. DATA_APP_ACCESS is a person×property junction table (one row per
// person+property; ROLE='ALL' rows are unrestricted) — see PROJECT_BRIEF.md's
// "Verified schema" section for how this was confirmed.
// ─────────────────────────────────────────────────────────────────────────────

import { KEBOOLA } from "../../src/config.js";

function esc(s) {
  return s.replace(/'/g, "''");
}

// Returns { unrestricted: boolean, propertyKeys: string[] }
// unrestricted=true means the user has a ROLE='ALL' row — every property is visible.
export async function getUserAccess(runQuery, email) {
  const sql = `
    SELECT "ROLE", "PROPERTY_KEY"
    FROM ${KEBOOLA.accessTable}
    WHERE LOWER("EMAIL_NORM") = '${esc(email.toLowerCase())}'
  `;
  const rows = await runQuery(sql);

  const unrestricted = rows.some((r) => r.ROLE === "ALL");
  const propertyKeys = rows.map((r) => r.PROPERTY_KEY).filter(Boolean);

  return { unrestricted, propertyKeys };
}

// Returns the full property list a user can pick from: [{ id, code, name }]
// id = PK_MASTER_PROPERTY (used as the query key everywhere downstream).
export async function getAccessibleProperties(runQuery, email) {
  const { unrestricted, propertyKeys } = await getUserAccess(runQuery, email);

  const whereClause = unrestricted
    ? ""
    : propertyKeys.length
      ? `WHERE "PK_MASTER_PROPERTY" IN (${propertyKeys.map((k) => `'${esc(k)}'`).join(",")})`
      : "WHERE 1=0"; // no access rows at all → no properties

  const sql = `
    SELECT "PK_MASTER_PROPERTY" AS "ID", "PROPERTY_CODE" AS "CODE", "PROPERTY_NAME" AS "NAME"
    FROM ${KEBOOLA.masterPropertyTable}
    ${whereClause}
    ORDER BY "PROPERTY_NAME"
  `;
  const rows = await runQuery(sql);
  return rows.map((r) => ({ id: r.ID, code: r.CODE, name: r.NAME }));
}
