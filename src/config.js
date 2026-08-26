// ─────────────────────────────────────────────────────────────────────────────
// config.js
// Ported from old_gm-report-app/src/config.js + App.jsx (brand tokens), re-pointed
// at out.c-BDM.BI_PROPERTY_FINANCIALS_BVA instead of the old Power BI model.
// See PROJECT_BRIEF.md / ANOMALIES.md for the classification decisions behind this.
// ─────────────────────────────────────────────────────────────────────────────

// Keboola ─────────────────────────────────────────────────────────────────────
export const KEBOOLA = {
  project: "SAPI_10540",
  financialsTable: '"SAPI_10540"."out.c-BDM"."BI_PROPERTY_FINANCIALS_BVA"',
  masterPropertyTable: '"SAPI_10540"."out.c-BDM"."DIM_MASTER_PROPERTY"',
  accessTable: '"SAPI_10540"."out.c-Data-App-Access-Security"."DATA_APP_ACCESS"',
  commentaryBucket: "in.c-APP_STORAGE",
  commentaryTable: "GM_COMMENTARY",
};

// Section definitions ─────────────────────────────────────────────────────────
export const SECTIONS = [
  { id: "titlePage",            label: "Cover Page",                                 hasExhibit: false, isTitlePage: true },
  { id: "financialPerformance", label: "Financial Performance",                      hasExhibit: true  },
  { id: "rounds",               label: "Rounds",                                     hasExhibit: true  },
  { id: "revenue",              label: "Revenue",                                    hasExhibit: true  },
  { id: "costOfGoods",          label: "Cost of Goods",                              hasExhibit: true  },
  { id: "payroll",              label: "Payroll",                                    hasExhibit: true  },
  { id: "opex",                 label: "OpEx",                                       hasExhibit: true  },
  { id: "personnel",            label: "Personnel",                                  hasExhibit: false },
  { id: "growingRevenue",       label: "Growing Revenue / Current Month Projection", hasExhibit: false },
  { id: "miscellaneous",        label: "Miscellaneous & Course Related Issues",      hasExhibit: false },
  { id: "help",                 label: "How to Use",                                 hasExhibit: false, isHelp: true },
];

// SIS_ROLLUP filter per section (replaces the old AcctCat filter) ─────────────
// string  → exact match:      "SIS_ROLLUP" = 'TOTAL REVENUE'
// array   → IN filter:        "SIS_ROLLUP" IN ('TOTAL PAYROLL', 'TOTAL HOURLY PAYROLL')
//
// Rounds is NOT SIS_ROLLUP-filtered — it comes from VALUE_TYPE='STAT' rows instead
// (see SECTION_VALUE_TYPE below), which is why it's absent here.
//
// "Total Revenues" (note the casing/pluralization) is folded into revenue — a
// naming inconsistency found in the data, treated as an alias of "TOTAL REVENUE".
//
// TOTAL HOURLY PAYROLL rolls into Payroll alongside TOTAL PAYROLL — confirmed
// with the user (evaluated per-property, not by aggregate label overlap).
export const REVENUE_ROLLUPS = ["TOTAL REVENUE", "Total Revenues"];
export const PAYROLL_ROLLUPS = ["TOTAL PAYROLL", "TOTAL HOURLY PAYROLL"];

// The Financial Performance section (below-the-line classification) does NOT
// use a fixed rollup list — see server/services/financials.js. Below-the-line
// membership is decided PER PROPERTY: any rollup that isn't Revenue/COGS/
// Payroll/OpEx is Below if its SIS_ROW_CODE exceeds that property's own
// EBITDA boundary (confirmed with the user; verified against real data —
// see ANOMALIES.md). This naturally handles TOTAL OTHER INCOME (EXPENSE),
// TOTAL FINANCING ACTIVITY, TOTAL OTHER EXPENSES, TOTAL RESERVE FUNDS,
// S/T Wages, S/T Adders, blank-SIS_ROLLUP rows, and any other rollup not yet
// seen, without needing a hardcoded list per rollup name.
export const SECTION_SIS_ROLLUP = {
  revenue:     REVENUE_ROLLUPS,
  costOfGoods: "TOTAL COGS",
  payroll:     PAYROLL_ROLLUPS,
  opex:        "TOTAL OPERATING EXPENSES",
};

// Sections whose data comes from the STAT/STATISTICAL slice instead of FIN/P&L ─
export const SECTION_VALUE_TYPE = {
  rounds: { valueType: "STAT", typeStatement: "STATISTICAL" },
};
// All other exhibit sections default to:
export const DEFAULT_VALUE_TYPE = { valueType: "FIN", typeStatement: "P&L" };

// Revenue sign convention ──────────────────────────────────────────────────────
// Revenue is stored as a credit (negative) in the source GL — flip sign on display.
// Ported from powerBiService.js's local SIGN_FLIP_CATS constant.
export const SIGN_FLIP_ROLLUPS = new Set(["TOTAL REVENUE"]);

// SIS_ROLLUP display label overrides ───────────────────────────────────────────
export const BELOW_LABEL = "Other (Inc)/Exp";

// Label-substring patterns for GF/CF (Rounds' ADR row) and F&B/Merch COGS %
// rows — matched against SIS_ROW_DESCRIPTION, not SIS_ROW_CODE (codes are
// reused across properties for different line items — see ANOMALIES.md).
// Deliberately broad ("over-match") per the user — the exact matched rows for
// a given build are logged to ANOMALIES.md for review.
export const GFCF_PATTERN = /green fee|cart fee|gf\/cf/i;
export const FB_PATTERN = /food|beverage|f\s*&\s*b|cafeteria/i;
export const MERCH_PATTERN = /merch|retail|pro shop/i;

// Column name aliases (match get_tables' quotedName exactly) ──────────────────
export const COL = {
  masterProperty: "PK_MASTER_PROPERTY",
  valueType:      "VALUE_TYPE",
  typeStatement:  "TYPE_STATEMENT",
  sisRollup:      "SIS_ROLLUP",
  sisRowCode:     "SIS_ROW_CODE",
  sisRowLabel:    "SIS_ROW_DESCRIPTION",
  fiscalYear:     "NUM_FISCAL_YEAR",
  fiscalPeriod:   "NUM_FISCAL_PERIOD",
  codeBudget:     "CODE_BUDGET",
  amountActual:   "AMOUNT_ACTUAL",
  amountBudget:   "AMOUNT_BUDGET",
  flagClosed:     "FLAG_CLOSED",
};

// Brand ─────────────────────────────────────────────────────────────────────────
// Consolidated from old_gm-report-app's App.jsx (NAVY/ORANGE/CHARCOAL/RULE/WHITE/BG)
// and ExhibitTable.jsx's local duplicate palette (which used GREEN as its "navy").
export const BRAND = {
  navy:     "#002060",
  green:    "#2C4832",
  orange:   "#E18126",
  charcoal: "#343433",
  rule:     "#D0D8E8",
  white:    "#FFFFFF",
  bg:       "#F4F6FA",
  positive: "#1a7a42",
  negative: "#c0392b",
  headingFont: "Calibri Light, Calibri, Arial, sans-serif",
  bodyFont:    "Calibri, Arial, sans-serif",
};
