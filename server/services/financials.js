// ─────────────────────────────────────────────────────────────────────────────
// financials.js
// Builds exhibit accordion data from out.c-BDM.BI_PROPERTY_FINANCIALS_BVA.
// Ported logic from old_gm-report-app/src/services/powerBiService.js, re-pointed
// at the new table shape. See ../../ANOMALIES.md for classification judgment calls.
//
// IMPORTANT: SIS_ROW_CODE (and possibly SIS_ROLLUP mapping itself) is
// property-specific — the same code can mean different things at different
// properties. Two consequences, both confirmed with the user (2026-08-26):
//   1. GF/CF, F&B/Merch, and any other label-based sub-classification match on
//      SIS_ROW_DESCRIPTION text, never on SIS_ROW_CODE.
//   2. Whether a rollup belongs "below the line" is decided PER PROPERTY, by
//      comparing its SIS_ROW_CODE against that same property's own EBITDA
//      boundary (the max code among ITS OWN Revenue/COGS/Payroll/OpEx rows) —
//      not by a fixed global rollup name list. Verified against real data:
//      for one property, TOTAL OTHER EXPENSES/TOTAL FINANCING ACTIVITY/
//      TOTAL RESERVE FUNDS all sit above that property's own boundary (1440),
//      and TOTAL RESERVE FUNDS' "Operating Transfer" line exactly offsets
//      TOTAL OTHER EXPENSES' "Transfer to Reserves" line — confirming this
//      classification is both correct and necessary to include.
// SIS_ROW_CODE otherwise is display sort order only, never classification.
// ─────────────────────────────────────────────────────────────────────────────

import {
  KEBOOLA,
  SECTION_SIS_ROLLUP,
  SECTION_VALUE_TYPE,
  DEFAULT_VALUE_TYPE,
  SIGN_FLIP_ROLLUPS,
  REVENUE_ROLLUPS,
  PAYROLL_ROLLUPS,
  BELOW_LABEL,
  GFCF_PATTERN,
  FB_PATTERN,
  MERCH_PATTERN,
} from "../../src/config.js";

const CORE_ROLLUP_BUCKET = new Map([
  ...REVENUE_ROLLUPS.map((r) => [r, "revenue"]),
  ["TOTAL COGS", "cogs"],
  ...PAYROLL_ROLLUPS.map((r) => [r, "payroll"]),
  ["TOTAL OPERATING EXPENSES", "opex"],
]);

function zero() {
  return { actual: 0, budget: 0, priorYear: 0, ytdActual: 0, ytdBudget: 0, ytdPriorYear: 0 };
}

function add(a, b, sign = 1) {
  return {
    actual:       a.actual       + sign * b.actual,
    budget:       a.budget       + sign * b.budget,
    priorYear:    a.priorYear    + sign * b.priorYear,
    ytdActual:    a.ytdActual    + sign * b.ytdActual,
    ytdBudget:    a.ytdBudget    + sign * b.ytdBudget,
    ytdPriorYear: a.ytdPriorYear + sign * b.ytdPriorYear,
  };
}

function divide(a, b) {
  const safe = (n, d) => (d ? n / d : 0);
  return {
    actual:       safe(a.actual, b.actual),
    budget:       safe(a.budget, b.budget),
    priorYear:    safe(a.priorYear, b.priorYear),
    ytdActual:    safe(a.ytdActual, b.ytdActual),
    ytdBudget:    safe(a.ytdBudget, b.ytdBudget),
    ytdPriorYear: safe(a.ytdPriorYear, b.ytdPriorYear),
  };
}

function mergeRowMaps(maps) {
  const merged = new Map();
  for (const m of maps) {
    if (!m) continue;
    for (const [key, bucket] of m) {
      if (!merged.has(key)) merged.set(key, { ...bucket });
      else merged.set(key, add(merged.get(key), bucket));
    }
  }
  return merged;
}

// Raw row fetch ─────────────────────────────────────────────────────────────
// One query per call pulls everything needed for MTD + YTD + Prior Year in a
// single pass: current fiscal year periods 1..N, and prior fiscal year
// periods 1..N, grouped so JS just has to bucket by period range.
// includeBlank=true also pulls rows with a blank/null SIS_ROLLUP (used only
// for the financialPerformance query, which needs to classify them itself).
async function fetchRows(runQuery, { propertyKeys, fiscalYear, fiscalPeriod, valueType, typeStatement, sisRollups, includeBlank = false }) {
  const propList = propertyKeys.map((k) => `'${k.replace(/'/g, "''")}'`).join(",");
  const rollupList = sisRollups ? sisRollups.map((r) => `'${r.replace(/'/g, "''")}'`) : [];
  const rollupClause = includeBlank
    ? rollupList.length
      ? `AND ("SIS_ROLLUP" IN (${rollupList.join(",")}) OR "SIS_ROLLUP" IS NULL OR "SIS_ROLLUP" = '')`
      : ""
    : rollupList.length
      ? `AND "SIS_ROLLUP" IN (${rollupList.join(",")})`
      : `AND "SIS_ROLLUP" IS NOT NULL AND "SIS_ROLLUP" <> ''`;

  const sql = `
    SELECT
      "PK_MASTER_PROPERTY" AS "PROP",
      "SIS_ROLLUP" AS "ROLLUP",
      "SIS_ROW_CODE" AS "ROW_CODE",
      "SIS_ROW_DESCRIPTION" AS "ROW_LABEL",
      "NUM_FISCAL_YEAR" AS "FY",
      "NUM_FISCAL_PERIOD" AS "FP",
      SUM(COALESCE("AMOUNT_ACTUAL", 0)) AS "ACTUAL",
      SUM(COALESCE("AMOUNT_BUDGET", 0)) AS "BUDGET"
    FROM ${KEBOOLA.financialsTable}
    WHERE "PK_MASTER_PROPERTY" IN (${propList})
      AND "VALUE_TYPE" = '${valueType}'
      AND "TYPE_STATEMENT" = '${typeStatement}'
      ${includeBlank ? "AND \"SIS_ROW_CODE\" IS NOT NULL AND \"SIS_ROW_CODE\" <> ''" : ""}
      ${rollupClause}
      AND "NUM_FISCAL_YEAR" IN (${fiscalYear}, ${fiscalYear - 1})
      AND "NUM_FISCAL_PERIOD" <= ${fiscalPeriod}
    GROUP BY "PK_MASTER_PROPERTY", "SIS_ROLLUP", "SIS_ROW_CODE", "SIS_ROW_DESCRIPTION", "NUM_FISCAL_YEAR", "NUM_FISCAL_PERIOD"
  `;

  return runQuery(sql);
}

// Same accumulation as bucketRows, but keeps properties separate — needed for
// buildFinancialPerformance's per-property EBITDA-boundary classification.
// Returns Map<property, Map<rollup, Map<"code::label", bucket>>>.
function bucketRowsByProperty(rows, fiscalYear, fiscalPeriod) {
  const byProperty = new Map();
  for (const r of rows) {
    if (!byProperty.has(r.PROP)) byProperty.set(r.PROP, []);
    byProperty.get(r.PROP).push(r);
  }
  const result = new Map();
  for (const [prop, propRows] of byProperty) result.set(prop, bucketRows(propRows, fiscalYear, fiscalPeriod));
  return result;
}

// For one property's byRollup map, splits every row into the 5 exhibit
// buckets. Core rollups (Revenue/COGS/Payroll/OpEx) map directly; everything
// else is classified Below if its SIS_ROW_CODE exceeds this property's own
// EBITDA boundary (max code among ITS core rows) — see file header. Rows
// that don't exceed the boundary are unexpected (violates the confirmed
// rule) — still included in Below so dollars aren't silently dropped, but
// logged for operational visibility.
function classifyPropertyRollups(byRollup) {
  const out = { revenue: new Map(), cogs: new Map(), payroll: new Map(), opex: new Map(), below: new Map() };

  let boundary = -Infinity;
  for (const [rollup, rowMap] of byRollup) {
    if (!CORE_ROLLUP_BUCKET.has(rollup)) continue;
    for (const bucket of rowMap.values()) boundary = Math.max(boundary, Number(bucket.rowCode) || -Infinity);
  }

  for (const [rollup, rowMap] of byRollup) {
    const coreBucket = CORE_ROLLUP_BUCKET.get(rollup);
    if (coreBucket) {
      for (const [key, bucket] of rowMap) out[coreBucket].set(key, bucket);
      continue;
    }
    for (const [key, bucket] of rowMap) {
      const code = Number(bucket.rowCode);
      if (!(code > boundary)) {
        // eslint-disable-next-line no-console
        console.warn(`[financials] row code ${bucket.rowCode} ("${bucket.rowLabel}", rollup "${rollup}") does not exceed the EBITDA boundary (${boundary}) — included in Below anyway, but this violates the expected per-property rule and is worth investigating.`);
      }
      out.below.set(key, bucket);
    }
  }

  return out;
}

// Buckets raw (rollup, rowCode, rowLabel, fy, fp, actual, budget) rows into
// { rollup -> { "code::label" -> { rowCode, rowLabel, actual, budget, priorYear, ytdActual, ytdBudget, ytdPriorYear } } }
function bucketRows(rows, fiscalYear, fiscalPeriod) {
  const byRollup = new Map();

  for (const r of rows) {
    const rollup = r.ROLLUP || ""; // "" groups all blank-SIS_ROLLUP rows together
    const rowCode = r.ROW_CODE ?? "";
    const rowLabel = r.ROW_LABEL ?? "";
    const key = `${rowCode}::${rowLabel}`;

    if (!byRollup.has(rollup)) byRollup.set(rollup, new Map());
    const rowMap = byRollup.get(rollup);
    if (!rowMap.has(key)) rowMap.set(key, { rowCode, rowLabel, ...zero() });
    const bucket = rowMap.get(key);

    const isCurrentYear = Number(r.FY) === fiscalYear;
    const isMtd = Number(r.FP) === fiscalPeriod;
    const actual = Number(r.ACTUAL) || 0;
    const budget = Number(r.BUDGET) || 0;

    if (isCurrentYear) {
      bucket.ytdActual += actual;
      bucket.ytdBudget += budget;
      if (isMtd) {
        bucket.actual += actual;
        bucket.budget += budget;
      }
    } else {
      // prior fiscal year — only AMOUNT_ACTUAL is meaningful as "Prior Yr"
      bucket.ytdPriorYear += actual;
      if (isMtd) bucket.priorYear += actual;
    }
  }

  return byRollup;
}

function applySignFlip(byRollup) {
  for (const rollup of SIGN_FLIP_ROLLUPS) {
    const rowMap = byRollup.get(rollup);
    if (!rowMap) continue;
    for (const bucket of rowMap.values()) {
      bucket.actual *= -1;
      bucket.budget *= -1;
      bucket.priorYear *= -1;
      bucket.ytdActual *= -1;
      bucket.ytdBudget *= -1;
      bucket.ytdPriorYear *= -1;
    }
  }
}

function rollupTotal(rowMap) {
  let total = zero();
  if (!rowMap) return total;
  for (const bucket of rowMap.values()) total = add(total, bucket);
  return total;
}

// Sort children by SIS_ROW_CODE ascending (numeric) — confirmed with the
// user. Display-only; never used for classification (see file header).
function sortedChildren(rowMap, isExpenseRollup) {
  if (!rowMap) return [];
  return [...rowMap.values()]
    .sort((a, b) => (Number(a.rowCode) || 0) - (Number(b.rowCode) || 0))
    .map((r) => ({
      id: `${r.rowCode}-${r.rowLabel}`,
      label: r.rowLabel,
      sortCode: Number(r.rowCode) || 0,
      isExpense: isExpenseRollup,
      ...r,
    }));
}

function mergeMultiRollup(byRollup, rollups) {
  return mergeRowMaps(rollups.map((r) => byRollup.get(r)));
}

// Section builders ────────────────────────────────────────────────────────────

async function buildPlainSection(runQuery, ctx, rollups, isExpense) {
  const rollupList = Array.isArray(rollups) ? rollups : [rollups];
  const rows = await fetchRows(runQuery, { ...ctx, ...DEFAULT_VALUE_TYPE, sisRollups: rollupList });
  const byRollup = bucketRows(rows, ctx.fiscalYear, ctx.fiscalPeriod);
  applySignFlip(byRollup);

  // Single-category sections (Revenue/COGS/OpEx/Payroll) render their rollup's
  // children directly as top-level accordion rows — no extra category wrapper,
  // matching the old app's transformToAccordion() output.
  const rowMap = mergeMultiRollup(byRollup, rollupList);
  return sortedChildren(rowMap, isExpense);
}

async function buildFinancialPerformance(runQuery, ctx) {
  // No sisRollups filter — pull every rollup (including ones not in any
  // hardcoded list, e.g. TOTAL RESERVE FUNDS/S-T Wages/S-T Adders) so the
  // per-property boundary classification below can see all of them.
  const rows = await fetchRows(runQuery, { ...ctx, ...DEFAULT_VALUE_TYPE, sisRollups: null, includeBlank: true });
  const byProperty = bucketRowsByProperty(rows, ctx.fiscalYear, ctx.fiscalPeriod);

  const perPropertyClassified = [...byProperty.values()].map(classifyPropertyRollups);
  const revenueRowMap = mergeRowMaps(perPropertyClassified.map((p) => p.revenue));
  const cogsRowMap = mergeRowMaps(perPropertyClassified.map((p) => p.cogs));
  const payrollRowMap = mergeRowMaps(perPropertyClassified.map((p) => p.payroll));
  const opexRowMap = mergeRowMaps(perPropertyClassified.map((p) => p.opex));
  const belowRowMap = mergeRowMaps(perPropertyClassified.map((p) => p.below));

  applySignFlip(new Map([["TOTAL REVENUE", revenueRowMap]])); // sign-flip commutes with the sum above

  const revenue = { id: "revenue", label: "Revenue", isTotal: true, isExpense: false, ...rollupTotal(revenueRowMap), children: sortedChildren(revenueRowMap, false) };
  const cogs = { id: "cogs", label: "COGS", isTotal: true, isExpense: true, ...rollupTotal(cogsRowMap), children: sortedChildren(cogsRowMap, true) };
  const payroll = { id: "payroll", label: "Payroll", isTotal: true, isExpense: true, ...rollupTotal(payrollRowMap), children: sortedChildren(payrollRowMap, true) };
  const opex = { id: "opex", label: "OpEx", isTotal: true, isExpense: true, ...rollupTotal(opexRowMap), children: sortedChildren(opexRowMap, true) };
  const below = { id: "below_line", label: BELOW_LABEL, isTotal: true, isExpense: false, ...rollupTotal(belowRowMap), children: sortedChildren(belowRowMap, false) };

  const ebitdaVals = add(add(add(revenue, cogs, -1), payroll, -1), opex, -1);
  const netIncomeVals = add(ebitdaVals, below, -1); // mirrors old app's real (hardcoded) behavior — no change per user
  const marginVals = divide(ebitdaVals, revenue);

  const ebitdaRow = {
    id: "ebitda", label: "EBITDA", isTotal: true, isExpense: false,
    ...ebitdaVals,
    children: [
      { ...below, id: "below_line", label: BELOW_LABEL },
      { ...netIncomeVals, id: "net_income", label: "Net Income", isChildTotal: true },
    ],
  };
  const marginRow = { id: "margin", label: "Margin %", isMargin: true, sortCode: 100, ...marginVals };

  return [revenue, cogs, payroll, opex, ebitdaRow, marginRow];
}

async function buildRounds(runQuery, ctx) {
  const [statRows, revenueRows] = await Promise.all([
    fetchRows(runQuery, { ...ctx, ...SECTION_VALUE_TYPE.rounds, sisRollups: null }),
    fetchRows(runQuery, { ...ctx, ...DEFAULT_VALUE_TYPE, sisRollups: REVENUE_ROLLUPS }),
  ]);

  const statByRollup = bucketRows(statRows, ctx.fiscalYear, ctx.fiscalPeriod);
  const revenueByRollup = bucketRows(revenueRows, ctx.fiscalYear, ctx.fiscalPeriod);
  applySignFlip(revenueByRollup);

  // GF/CF revenue — matched on SIS_ROW_DESCRIPTION (broad, over-matching on
  // purpose — see config.js GFCF_PATTERN and ANOMALIES.md for the full list
  // of what this currently matches, for review).
  const revenueRowMap = mergeMultiRollup(revenueByRollup, REVENUE_ROLLUPS);
  let gfcf = zero();
  if (revenueRowMap) {
    for (const bucket of revenueRowMap.values()) {
      if (GFCF_PATTERN.test(bucket.rowLabel)) gfcf = add(gfcf, bucket);
    }
  }

  // "Rounds" stat rows — every STAT/STATISTICAL row for this property/period.
  // There's no single SIS_ROLLUP value equivalent to the old "STAT" AcctCat
  // filter here since VALUE_TYPE already scopes to stats; take everything.
  const allStatRows = mergeRowMaps([...statByRollup.values()]);
  const totalRoundsRow = { id: "total_rounds", label: "Total Rounds", isTotal: true, ...rollupTotal(allStatRows) };
  const statChildren = sortedChildren(allStatRows, false);

  const gfcfRow = { id: "gfcf", label: "GF/CF", isGFCF: true, sortCode: -1, ...gfcf };
  const adrRow = { id: "adr", label: "ADR", isADR: true, sortCode: 200, ...divide(gfcf, totalRoundsRow) };

  return [gfcfRow, totalRoundsRow, ...statChildren, adrRow];
}

async function buildCostOfGoods(runQuery, ctx) {
  const [cogsRows, revenueRows] = await Promise.all([
    fetchRows(runQuery, { ...ctx, ...DEFAULT_VALUE_TYPE, sisRollups: ["TOTAL COGS"] }),
    fetchRows(runQuery, { ...ctx, ...DEFAULT_VALUE_TYPE, sisRollups: REVENUE_ROLLUPS }),
  ]);

  const cogsByRollup = bucketRows(cogsRows, ctx.fiscalYear, ctx.fiscalPeriod);
  const revenueByRollup = bucketRows(revenueRows, ctx.fiscalYear, ctx.fiscalPeriod);
  applySignFlip(revenueByRollup);

  const cogsRowMap = cogsByRollup.get("TOTAL COGS");
  const revenueRowMap = mergeMultiRollup(revenueByRollup, REVENUE_ROLLUPS);
  const children = sortedChildren(cogsRowMap, true);

  // F&B COGS % and Merch COGS % — matched on SIS_ROW_DESCRIPTION (broad, over-
  // matching on purpose — see config.js FB_PATTERN/MERCH_PATTERN and
  // ANOMALIES.md for the full list of what this currently matches, for review).
  const sumWhere = (rowMap, pattern) => {
    let total = zero();
    if (!rowMap) return total;
    for (const bucket of rowMap.values()) if (pattern.test(bucket.rowLabel)) total = add(total, bucket);
    return total;
  };

  const fbCogs = sumWhere(cogsRowMap, FB_PATTERN);
  const fbRevenue = sumWhere(revenueRowMap, FB_PATTERN);
  const merchCogs = sumWhere(cogsRowMap, MERCH_PATTERN);
  const merchRevenue = sumWhere(revenueRowMap, MERCH_PATTERN);

  const fbPctRow = { id: "fb_cogs_pct", label: "F&B COGS %", isCogsPct: true, sortCode: 500, ...divide(fbCogs, fbRevenue) };
  const merchPctRow = { id: "merch_cogs_pct", label: "Merch COGS %", isCogsPct: true, sortCode: 600, ...divide(merchCogs, merchRevenue) };

  return [...children, fbPctRow, merchPctRow];
}

// Public entry point ────────────────────────────────────────────────────────
// ctx: { propertyKeys: string[], fiscalYear: number, fiscalPeriod: number }
export async function getExhibitRows(runQuery, sectionId, ctx) {
  switch (sectionId) {
    case "financialPerformance":
      return buildFinancialPerformance(runQuery, ctx);
    case "rounds":
      return buildRounds(runQuery, ctx);
    case "costOfGoods":
      return buildCostOfGoods(runQuery, ctx);
    case "revenue":
      return buildPlainSection(runQuery, ctx, SECTION_SIS_ROLLUP.revenue, false);
    case "payroll":
      return buildPlainSection(runQuery, ctx, SECTION_SIS_ROLLUP.payroll, true);
    case "opex":
      return buildPlainSection(runQuery, ctx, SECTION_SIS_ROLLUP.opex, true);
    default:
      throw new Error(`getExhibitRows: unknown section "${sectionId}"`);
  }
}
