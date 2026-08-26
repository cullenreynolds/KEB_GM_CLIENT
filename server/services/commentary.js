// ─────────────────────────────────────────────────────────────────────────────
// commentary.js
// Reads/writes GM commentary to in.c-APP_STORAGE.APP_GM_CLIENT_REPORT_COMMENTARY (replaces the
// old app's SharePoint GM_Commentary list). Both reads and writes go through
// the same Query Service path as everything else (see db.js) — Storage Access
// grants the workspace user INSERT/UPDATE/DELETE on tables added to this app's
// Advanced Settings > Storage Access, so a direct SQL write works, no separate
// file-upload/import job needed.
// ─────────────────────────────────────────────────────────────────────────────

import { KEBOOLA } from "../../src/config.js";

const COMMENTARY_FIELDS = [
  "FinancialPerformance", "Rounds", "Revenue", "CostOfGoods",
  "Payroll", "OpEx", "Personnel", "GrowingRevenue", "Miscellaneous",
];

const TABLE_FQN = `"SAPI_10540"."${KEBOOLA.commentaryBucket}"."${KEBOOLA.commentaryTable}"`;

function esc(s) {
  return String(s ?? "").replace(/'/g, "''");
}

// commentaryKey: sorted, "+"-joined property codes for multi-property selections
// (mirrors the old app's combined-key behavior — see PROJECT_BRIEF.md decision).
export async function getCommentary(runQuery, commentaryKey, periodId) {
  const sql = `
    SELECT ${COMMENTARY_FIELDS.map((f) => `"${f}"`).join(", ")}
    FROM ${TABLE_FQN}
    WHERE "PropertyCode" = '${esc(commentaryKey)}' AND "PeriodID" = '${esc(periodId)}'
    LIMIT 1
  `;
  const rows = await runQuery(sql);
  if (!rows.length) return {};

  const row = rows[0];
  const commentary = {};
  for (const field of COMMENTARY_FIELDS) {
    const key = field.charAt(0).toLowerCase() + field.slice(1);
    commentary[key] = row[field] || "";
  }
  return commentary;
}

// Upsert via DELETE + INSERT (two statements, not one atomic transaction —
// acceptable here: single GM editing their own draft, same low-concurrency
// tradeoff the old app already accepted with its SharePoint read-then-write).
export async function saveCommentary(runQuery, commentaryKey, periodId, commentary, updatedBy) {
  const fields = ["PropertyCode", "PeriodID", ...COMMENTARY_FIELDS, "UpdatedBy", "UpdatedAt"];
  const values = [
    commentaryKey,
    periodId,
    ...COMMENTARY_FIELDS.map((f) => commentary[f.charAt(0).toLowerCase() + f.slice(1)] || ""),
    updatedBy,
    new Date().toISOString(),
  ];

  await runQuery(`DELETE FROM ${TABLE_FQN} WHERE "PropertyCode" = '${esc(commentaryKey)}' AND "PeriodID" = '${esc(periodId)}'`);
  await runQuery(`
    INSERT INTO ${TABLE_FQN} (${fields.map((f) => `"${f}"`).join(", ")})
    VALUES (${values.map((v) => `'${esc(v)}'`).join(", ")})
  `);
}
