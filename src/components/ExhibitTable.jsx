// ─────────────────────────────────────────────────────────────────────────────
// ExhibitTable.jsx
// MTD + YTD double-header financial table with ratio variance format.
// isExpense: true  → <=100% is favorable (green) — for COGS, Payroll, OpEx
// isExpense: false → >=100% is favorable (green) — for Revenue sections
//
// Ported from old_gm-report-app/src/components/ExhibitTable.jsx. One change:
// the EBITDA row uses the same plain per-row toggle as every other row with
// children (hasKids + expanded[row.id]) instead of the old app's separate
// isEBITDA/showBelow special-case path. That path was unreachable in the old
// app anyway (powerBiService.js never set isEBITDA on the row) — the real,
// confirmed target behavior (one level: expanding EBITDA reveals Other
// (Inc)/Exp and Net Income together) is exactly what the normal toggle
// already produces, so this is simpler with no behavior change.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { BRAND } from "../config.js";

const { green: NAVY, orange: ORANGE, charcoal: CHAR, rule: RULE, white: WHITE, positive: POS, negative: NEG } = BRAND;

const fmtUSD = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n ?? 0);
const fmtNum = (n) => (n ?? 0).toLocaleString();

// Ratio variance: actual / budget * 100 → "95%" or "105%"
const ratioVar = (a, b) => {
  if (!b || b === 0) return "—";
  return `${Math.round((a / b) * 100)}%`;
};

// Color based on ratio and whether this is an expense section
const ratioColor = (a, b, isExpense) => {
  if (!b || b === 0) return CHAR;
  const ratio = a / b;
  const favorable = isExpense ? ratio <= 1 : ratio >= 1;
  return favorable ? POS : NEG;
};

// Grid column template: description + 5 MTD cols + divider + 5 YTD cols
// minmax(200px,1.4fr) guarantees the description is always at least 200px wide
const COL = "minmax(200px, 1.4fr) 72px 72px 52px 72px 54px 4px 72px 72px 52px 72px 54px";

function GroupHeaderRow() {
  const grp = (borderLeft = false) => ({
    gridColumn: "span 5",
    textAlign: "center", fontSize: "9px", fontWeight: 700, color: WHITE,
    textTransform: "uppercase", letterSpacing: "0.1em", padding: "4px 0",
    borderLeft: borderLeft ? "1px solid rgba(255,255,255,0.2)" : "none",
  });
  return (
    <div style={{ display: "grid", gridTemplateColumns: COL, background: NAVY }}>
      <span />
      <span style={grp()}>Month to Date</span>
      <span style={{ background: "rgba(255,255,255,0.1)" }} />
      <span style={grp(true)}>Year to Date</span>
    </div>
  );
}

function ColHeaderRow() {
  const th = (txt, right = true) => (
    <span style={{
      textAlign: right ? "right" : "left",
      fontSize: "9.5px", fontWeight: 700,
      color: "rgba(255,255,255,0.85)",
      textTransform: "uppercase", letterSpacing: "0.05em",
      padding: "4px 5px", paddingLeft: right ? "5px" : "10px",
    }}>{txt}</span>
  );
  return (
    <div style={{
      display: "grid", gridTemplateColumns: COL,
      background: "#1E3228", borderBottom: `2px solid ${ORANGE}`,
    }}>
      {th("Description", false)}
      {th("Actual")} {th("Budget")} {th("% Bud")} {th("Prior Yr")} {th("% PY")}
      <span style={{ background: "rgba(255,255,255,0.08)" }} />
      {th("Actual")} {th("Budget")} {th("% Bud")} {th("Prior Yr")} {th("% PY")}
    </div>
  );
}

function DataRow({ row, fmt, rowBg, isTotal, indent, isExpense, hasKids, isOpen, onToggle }) {
  const isMargin = !!row.isMargin;
  const isChildTotal = !!row.isChildTotal;
  const isADR = !!row.isADR;
  const isGFCF = !!row.isGFCF;
  const isCogsPct = !!row.isCogsPct;
  const effectiveTotal = isTotal || isChildTotal;

  // Margin/CogsPct → percentage; ADR → $/round (2 dp); GF/CF → USD; else → section fmt
  const mFmt = isMargin || isCogsPct ? (n) => `${((n ?? 0) * 100).toFixed(1)}%`
    : isADR ? (n) => `$${(n ?? 0).toFixed(2)}`
    : isGFCF ? fmtUSD
    : fmt;

  const sep = <span style={{ background: "#f0f2f8", borderLeft: `1px solid ${RULE}` }} />;

  const cell = (val, color = CHAR, bold = false) => (
    <span style={{ display: "block", textAlign: "right", padding: "6px 5px", color, fontSize: "11.5px", fontWeight: bold ? 700 : 400 }}>
      {val}
    </span>
  );

  // Margin % and COGS% rows: show pp difference (actual% − budget%) instead of ratio variance
  const varCell = (a, b, bold = false) => {
    if (isCogsPct || isMargin) {
      if (!b) return cell("—");
      const diff = (a - b) * 100;
      const clr = isExpense ? (diff <= 0 ? POS : NEG) : (diff >= 0 ? POS : NEG);
      return cell(`${diff > 0 ? "+" : ""}${diff.toFixed(1)} pp`, clr, bold);
    }
    return cell(ratioVar(a, b), ratioColor(a, b, isExpense), bold);
  };

  const topBorder = effectiveTotal ? `2px solid ${NAVY}` : "none";
  const botBorder = effectiveTotal ? `2px solid ${NAVY}` : `1px solid ${RULE}`;
  const labelColor = (isMargin || isADR || isCogsPct) ? "#2a5a3a" : CHAR;
  const fontStyle = (isMargin || isADR || isCogsPct) ? "italic" : "normal";

  return (
    <div style={{
      display: "grid", gridTemplateColumns: COL, background: rowBg,
      borderBottom: botBorder, borderTop: topBorder,
    }}>
      <span style={{
        display: "flex", alignItems: "center", gap: "5px",
        padding: `6px 8px 6px ${indent ? "22px" : "10px"}`,
        color: labelColor, fontSize: "11.5px",
        fontWeight: effectiveTotal ? 700 : 600, fontStyle,
        overflow: "hidden", minWidth: 0,
      }}>
        {hasKids && (
          <span onClick={onToggle} style={{
            fontSize: "8px", color: ORANGE, cursor: "pointer", display: "inline-block",
            flexShrink: 0,
            transition: "transform 0.18s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
          }}>▶</span>
        )}
        {!hasKids && <span style={{ width: "11px", display: "inline-block", flexShrink: 0 }} />}
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
          {row.label}
        </span>
      </span>

      {cell(mFmt(row.actual), labelColor, effectiveTotal)}
      {cell(mFmt(row.budget), "#6a7a8a")}
      {varCell(row.actual, row.budget, true)}
      {cell(mFmt(row.priorYear), "#8a9aaa")}
      {varCell(row.actual, row.priorYear)}

      {sep}

      {cell(mFmt(row.ytdActual ?? 0), labelColor, effectiveTotal)}
      {cell(mFmt(row.ytdBudget ?? 0), "#6a7a8a")}
      {varCell(row.ytdActual ?? 0, row.ytdBudget ?? 0, true)}
      {cell(mFmt(row.ytdPriorYear ?? 0), "#8a9aaa")}
      {varCell(row.ytdActual ?? 0, row.ytdPriorYear ?? 0)}
    </div>
  );
}

export default function ExhibitTable({ rows: rowsProp = [], isCounts = false, isExpense = false, isLoading, error, expandedState, onToggleExpanded }) {
  const rows = rowsProp ?? [];
  const fmt = isCounts ? fmtNum : fmtUSD;

  // Internal state used when no external state is provided (standalone use)
  const [internalExpanded, setInternalExpanded] = useState({});
  const expanded = expandedState ?? internalExpanded;
  const toggle = (id) => {
    if (onToggleExpanded) onToggleExpanded(id);
    else setInternalExpanded((p) => ({ ...p, [id]: !p[id] }));
  };

  if (isLoading) return (
    <div style={{ padding: "24px", color: "#8a9aaa", fontSize: "13px", textAlign: "center", border: `1px solid ${RULE}`, borderRadius: "4px" }}>
      Loading exhibit…
    </div>
  );

  if (error) return (
    <div style={{ padding: "16px", color: NEG, fontSize: "12px", border: `1px solid ${RULE}`, borderRadius: "4px" }}>
      Failed to load exhibit data. Check console for details.
    </div>
  );

  if (!rows.length) return (
    <div style={{ padding: "24px", color: "#8a9aaa", fontSize: "13px", textAlign: "center", border: `1px solid ${RULE}`, borderRadius: "4px" }}>
      No data for this period.
    </div>
  );

  return (
    <div style={{ border: `1px solid ${RULE}`, borderRadius: "4px", overflow: "hidden", fontFamily: BRAND.bodyFont }}>
      <GroupHeaderRow />
      <ColHeaderRow />

      {rows.map((row, i) => {
        // Margin % is rendered inline pinned to EBITDA — skip it here in the main loop
        if (row.isMargin) return null;

        const rowBg = row.isTotal ? "#EBF0F8" : i % 2 === 0 ? WHITE : "#F7F9FC";
        const isOpen = expanded[row.id ?? row.label];
        const hasKids = row.children?.length > 0;
        // Locate the margin row so we can pin it right after the EBITDA summary
        const marginRow = row.id === "ebitda" ? rows.find((r) => r.isMargin) : null;

        return (
          <div key={row.id ?? row.label ?? i}>
            <DataRow
              row={row} fmt={fmt} rowBg={rowBg}
              isTotal={!!row.isTotal} isExpense={row.isExpense ?? isExpense}
              indent={false} hasKids={hasKids} isOpen={isOpen}
              onToggle={() => toggle(row.id ?? row.label)}
            />
            {marginRow && (
              <DataRow
                row={marginRow} fmt={fmt} rowBg={WHITE}
                isTotal={false} isExpense={false}
                indent={false} hasKids={false} isOpen={false}
                onToggle={() => {}}
              />
            )}
            {hasKids && isOpen && row.children.map((child, j) => (
              <DataRow
                key={j} row={child} fmt={fmt}
                rowBg={child.isChildTotal ? "#EBF0F8" : j % 2 === 0 ? "#fafbfd" : "#f3f5fa"}
                isTotal={false} isExpense={child.isExpense ?? isExpense}
                indent={!child.isChildTotal} hasKids={false} isOpen={false}
                onToggle={() => {}}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
