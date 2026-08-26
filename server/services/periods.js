// ─────────────────────────────────────────────────────────────────────────────
// periods.js
// Period availability = FLAG_CLOSED on BI_PROPERTY_FINANCIALS_BVA, restricted to
// the trailing 12 months — confirmed with the user (2026-08-26).
//
// Closed status is property-specific (confirmed with the user) — one property
// can have a period closed while another doesn't. For a multi-property
// selection, a period is only "available" if it's closed for EVERY selected
// property — showing a combined exhibit where one property's numbers aren't
// final yet would be misleading.
// ─────────────────────────────────────────────────────────────────────────────

import { KEBOOLA } from "../../src/config.js";

function esc(s) {
  return s.replace(/'/g, "''");
}

// Returns closed-for-all-selected-properties periods, most recent first,
// capped to the trailing 12 (by fiscal year/period — matches what the
// exhibit queries key off of, not calendar month).
export async function getAvailablePeriods(runQuery, propertyKeys) {
  const propList = propertyKeys.map((k) => `'${esc(k)}'`).join(",");
  const sql = `
    SELECT "NUM_FISCAL_YEAR" AS "FY", "NUM_FISCAL_PERIOD" AS "FP",
      MAX("CALENDAR_YEAR") AS "CY", MAX("CALENDAR_MONTH") AS "CM"
    FROM ${KEBOOLA.financialsTable}
    WHERE "PK_MASTER_PROPERTY" IN (${propList})
    GROUP BY "NUM_FISCAL_YEAR", "NUM_FISCAL_PERIOD"
    HAVING COUNT(DISTINCT "PK_MASTER_PROPERTY") = COUNT(DISTINCT CASE WHEN "FLAG_CLOSED" = 1 THEN "PK_MASTER_PROPERTY" END)
       AND COUNT(DISTINCT "PK_MASTER_PROPERTY") = ${propertyKeys.length}
    ORDER BY "FY" DESC, "FP" DESC
    LIMIT 12
  `;
  const rows = await runQuery(sql);
  // calendarYear/calendarMonth are a representative label only (MAX across
  // whatever properties are selected) — for display, not for querying.
  return rows.map((r) => ({
    fiscalYear: Number(r.FY),
    fiscalPeriod: Number(r.FP),
    calendarYear: Number(r.CY),
    calendarMonth: Number(r.CM),
  }));
}
