// ─────────────────────────────────────────────────────────────────────────────
// App.jsx
// Ported from old_gm-report-app/src/App.jsx. Structural changes from the port:
//   - Auth/access resolution collapses to one call (getProperties) against this
//     app's own backend, which already applied DATA_APP_ACCESS RLS server-side
//     — no more separate Power BI/SharePoint token dance or PBI-401-retry logic.
//   - Properties are keyed by PK_MASTER_PROPERTY (`id`), not a DatabaseCodes
//     string join — much simpler, no parseDatabaseCodes/mergedDbCodes concept.
//   - Property logo dropped for v1 (decision confirmed with the user).
//   - Period is now { fiscalYear, fiscalPeriod, calendarYear, calendarMonth }
//     instead of an "0426"-style string.
// Everything else (layout, PDF export flow, multi-property selection, section
// nav, progress bar, Save Draft state machine) is unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";

import { loginRequest } from "./authConfig.js";
import { SECTIONS, BRAND } from "./config.js";
import { getAccessToken, getProperties, getPeriods } from "./services/api.js";
import { captureElement, buildPDF } from "./services/pdfExport.js";
import { useExhibitData } from "./hooks/useExhibitData.js";
import { useCommentary } from "./hooks/useCommentary.js";
import ExhibitTable from "./components/ExhibitTable.jsx";

const { navy: NAVY, green: GREEN, orange: ORANGE, charcoal: CHARCOAL, rule: RULE, white: WHITE, bg: BG } = BRAND;

// ── Period formatter ──────────────────────────────────────────────────────────
function formatPeriod(period) {
  if (!period?.calendarYear || !period?.calendarMonth) return "";
  return new Date(period.calendarYear, period.calendarMonth - 1, 1)
    .toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
function periodKey(period) {
  return period ? `${period.fiscalYear}-${period.fiscalPeriod}` : "";
}

// ── Title page ─────────────────────────────────────────────────────────────────
function TitlePage({ propertyName, period, onNameChange, hideHint = false }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", flex: 1, height: "100%", minHeight: "500px",
      padding: "60px 80px", background: WHITE, textAlign: "center" }}>

      <input
        value={propertyName}
        onChange={(e) => onNameChange(e.target.value)}
        style={{
          fontSize: "26px", fontWeight: 600, color: GREEN, textAlign: "center",
          border: "none", borderBottom: "2px solid transparent", outline: "none",
          fontFamily: BRAND.headingFont,
          width: "100%", maxWidth: "600px", background: "transparent",
          padding: "4px 8px", transition: "border-color 0.2s",
        }}
        onFocus={(e) => (e.target.style.borderBottomColor = ORANGE)}
        onBlur={(e) => (e.target.style.borderBottomColor = "rgba(0,0,0,0.15)")}
      />

      <div style={{ fontSize: "18px", color: CHARCOAL, marginTop: "14px", fontFamily: BRAND.headingFont }}>
        {formatPeriod(period)}
      </div>

      <div style={{ fontSize: "13px", color: "#8a9aaa", marginTop: "8px",
        letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: BRAND.bodyFont }}>
        Client Report
      </div>

      {!hideHint && (
        <div style={{ marginTop: "48px", fontSize: "11px", color: "#b0bac4",
          fontStyle: "italic", fontFamily: BRAND.bodyFont }}>
          Click the property name above to edit
        </div>
      )}
    </div>
  );
}

// ── Help / walkthrough page ───────────────────────────────────────────────────
function HelpPage() {
  const steps = [
    ["Select a property", "Use the property dropdown in the top header to choose the golf property you're reporting on. Multiple properties can be selected to combine their data."],
    ["Select a reporting period", "Choose the month and year from the period dropdown. Only closed periods for the selected properties are available, up to the trailing 12 months."],
    ["Review the cover page", "Confirm the property name on the cover page is correct. You can edit it by clicking the title directly."],
    ["Add commentary for each section", "Use the sidebar to navigate between sections — Financial Performance, Rounds, Revenue, and more. For sections with financial exhibits, the data table is automatically populated. Enter your GM commentary in the text area provided."],
    ["Save your work", "Click \"Save Draft\" at any time to save your commentary. A green checkmark confirms the save was successful."],
    ["Export to PDF", "When ready, click \"Export PDF\" to generate and download the report."],
  ];
  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ background: NAVY, padding: "8px 14px", borderRadius: "3px",
        marginBottom: "24px", display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: ORANGE, flexShrink: 0 }} />
        <span style={{ fontFamily: BRAND.headingFont, fontSize: "15px", color: WHITE, letterSpacing: "0.01em" }}>
          How to Use
        </span>
      </div>
      <div style={{ maxWidth: "680px" }}>
        <p style={{ fontFamily: BRAND.headingFont, fontSize: "16px", color: NAVY, fontWeight: 400, margin: "0 0 18px" }}>
          Getting Started
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "28px" }}>
          {steps.map(([title, body], i) => (
            <div key={i} style={{ display: "flex", gap: "14px", alignItems: "flex-start",
              background: BG, border: `1px solid ${RULE}`, borderRadius: "4px", padding: "14px 18px" }}>
              <div style={{ flexShrink: 0, width: "24px", height: "24px", borderRadius: "50%",
                background: NAVY, color: WHITE, fontSize: "11px", fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", marginTop: "1px" }}>
                {i + 1}
              </div>
              <div style={{ fontFamily: BRAND.bodyFont, fontSize: "14px", color: CHARCOAL, lineHeight: 1.65 }}>
                <strong>{title}</strong> — {body}
              </div>
            </div>
          ))}
        </div>
        <div style={{ background: "#fff8ee", border: `1px solid ${ORANGE}`,
          borderLeft: `4px solid ${ORANGE}`, borderRadius: "4px",
          padding: "16px 20px", fontFamily: BRAND.bodyFont, fontSize: "14px", color: CHARCOAL, lineHeight: 1.7 }}>
          <strong style={{ color: NAVY }}>PDF Page Inclusion</strong><br />
          Only sections with commentary entered will be included in the exported PDF.
          If a section's commentary is left blank, that page will be automatically excluded from the report.
          The Cover Page is always included.
        </div>
      </div>
    </div>
  );
}

// ── Section view ──────────────────────────────────────────────────────────────
function SectionView({ section, commentary, onChange, exhibitRows, exhibitLoading, exhibitError,
  coverTitle, period, onCoverTitleChange, isPdfExporting = false, expandedState = {}, onToggleExpanded }) {
  if (section.isHelp) return <HelpPage />;
  if (section.isTitlePage) {
    return <TitlePage propertyName={coverTitle} period={period} onNameChange={onCoverTitleChange} hideHint={isPdfExporting} />;
  }
  const SUBLABEL = {
    fontFamily: BRAND.bodyFont, fontSize: "10px", fontWeight: 700,
    color: "#6a7a8a", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "6px",
  };
  const TA = {
    width: "100%", boxSizing: "border-box",
    border: `1px solid ${RULE}`, borderRadius: "3px",
    fontFamily: BRAND.bodyFont, fontSize: "15px",
    lineHeight: 1.6, color: CHARCOAL, padding: "12px 14px",
    resize: "vertical", outline: "none", background: WHITE,
    transition: "border-color 0.2s",
  };

  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ background: NAVY, padding: "8px 14px", borderRadius: "3px",
        marginBottom: "22px", display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: ORANGE, flexShrink: 0 }} />
        <span style={{ fontFamily: BRAND.headingFont, fontSize: "15px", color: WHITE, letterSpacing: "0.01em" }}>
          {section.label}
        </span>
      </div>

      {section.hasExhibit ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <p style={SUBLABEL}>Financial Exhibit</p>
            <ExhibitTable
              rows={exhibitRows}
              isLoading={exhibitLoading}
              error={exhibitError}
              isCounts={section.id === "rounds"}
              isExpense={["costOfGoods", "payroll", "opex"].includes(section.id)}
              expandedState={expandedState}
              onToggleExpanded={onToggleExpanded}
            />
          </div>
          <div>
            <p style={SUBLABEL}>GM Commentary</p>
            <textarea
              value={commentary}
              onChange={(e) => onChange(e.target.value)}
              placeholder={`Discuss key drivers for ${section.label}…`}
              style={{ ...TA, minHeight: "130px" }}
              onFocus={(e) => (e.target.style.borderColor = NAVY)}
              onBlur={(e) => (e.target.style.borderColor = RULE)}
            />
          </div>
        </div>
      ) : (
        <div>
          <p style={SUBLABEL}>GM Commentary</p>
          <textarea
            value={commentary}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`Add commentary for ${section.label}…`}
            style={{ ...TA, height: "200px" }}
            onFocus={(e) => (e.target.style.borderColor = NAVY)}
            onBlur={(e) => (e.target.style.borderColor = RULE)}
          />
        </div>
      )}
    </div>
  );
}

// ── Property dropdown (multi-select) ─────────────────────────────────────────
function PropertyDropdown({ properties, selectedIds, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [staged, setStaged] = useState(selectedIds);
  const ref = useRef(null);

  useEffect(() => { setStaged(selectedIds); }, [selectedIds.join(",")]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = properties.filter((p) =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.code?.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id) => setStaged((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const apply = () => { onChange(staged); setOpen(false); };

  const selectedProps = properties.filter((p) => selectedIds.includes(p.id));
  const label = selectedProps.length === 0 ? "Select property…"
    : selectedProps.length === 1 ? selectedProps[0].name
    : `${selectedProps.length} properties selected`;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((p) => !p)} style={{
        display: "flex", alignItems: "center", gap: "8px",
        background: "#1E3228", border: "1px solid #243D2C",
        color: WHITE, borderRadius: "3px", padding: "4px 12px",
        fontSize: "12px", cursor: "pointer", maxWidth: "240px",
      }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ fontSize: "9px", opacity: 0.7, flexShrink: 0 }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, zIndex: 999,
          background: WHITE, border: `1px solid ${RULE}`,
          borderRadius: "4px", boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          width: "280px", marginTop: "4px",
        }}>
          <div style={{ padding: "8px" }}>
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search properties…"
              style={{ width: "100%", boxSizing: "border-box", padding: "6px 10px",
                border: `1px solid ${RULE}`, borderRadius: "3px", fontSize: "12px",
                outline: "none", fontFamily: BRAND.bodyFont }}
              autoFocus
            />
          </div>

          <div style={{ maxHeight: "260px", overflowY: "auto", borderTop: `1px solid ${RULE}` }}>
            {filtered.map((prop) => (
              <label key={prop.id} style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "8px 12px", cursor: "pointer",
                borderBottom: "1px solid #f0f2f4",
                background: staged.includes(prop.id) ? "#f0f4f0" : WHITE,
              }}>
                <input type="checkbox" checked={staged.includes(prop.id)} onChange={() => toggle(prop.id)}
                  style={{ accentColor: NAVY, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: CHARCOAL }}>{prop.name}</div>
                  <div style={{ fontSize: "10px", color: "#8a9aaa" }}>{prop.code}</div>
                </div>
              </label>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: "16px 12px", fontSize: "12px", color: "#8a9aaa", textAlign: "center" }}>
                No properties found
              </div>
            )}
          </div>

          <div style={{ padding: "8px", borderTop: `1px solid ${RULE}`,
            display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "#8a9aaa" }}>{staged.length} selected</span>
            <button onClick={apply} style={{
              background: NAVY, color: WHITE, border: "none",
              borderRadius: "3px", padding: "5px 16px", fontSize: "12px",
              cursor: "pointer", fontWeight: 600,
            }}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Login screen ──────────────────────────────────────────────────────────────
function LoginScreen() {
  const { instance } = useMsal();
  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: GREEN }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontFamily: BRAND.headingFont, fontSize: "24px", color: WHITE, fontWeight: 300, marginBottom: "8px" }}>
          KemperSports GM Client Report
        </h1>
        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "14px", marginBottom: "32px" }}>
          Sign in with your Microsoft account to continue
        </p>
        <button
          onClick={async () => { try { await instance.loginRedirect(loginRequest); } catch (err) { console.error("Sign in error:", err); } }}
          style={{ background: ORANGE, color: WHITE, border: "none",
            borderRadius: "4px", padding: "12px 32px", fontSize: "14px",
            cursor: "pointer", fontWeight: 700 }}>
          Sign In
        </button>
      </div>
    </div>
  );
}

// ── Main authenticated app ────────────────────────────────────────────────────
function AuthenticatedApp() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];

  const [accessibleProperties, setAccessibleProperties] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [period, setPeriod] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [coverTitle, setCoverTitle] = useState("");

  const selectedProperties = (accessibleProperties ?? []).filter((p) => selectedIds.includes(p.id));
  const propertyLabel = selectedProperties.length === 0 ? ""
    : selectedProperties.length === 1 ? selectedProperties[0].name
    : `${selectedProperties.length} Properties Combined`;
  const commentaryKey = selectedProperties.map((p) => p.code).sort().join("+");

  const [activeId, setActiveId] = useState("financialPerformance");
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [exhibitExpandedStates, setExhibitExpandedStates] = useState({});
  const sectionWrapRef = useRef(null);
  const activeIdx = SECTIONS.findIndex((s) => s.id === activeId);
  const current = SECTIONS[activeIdx];

  // Reload periods whenever the selected properties change
  useEffect(() => {
    if (!selectedIds.length || !account) { setPeriods([]); setPeriod(null); return; }
    (async () => {
      try {
        const token = await getAccessToken(instance, account);
        if (!token) return;
        const perList = await getPeriods(token, selectedIds);
        setPeriods(perList);
        setPeriod(perList.length ? perList[0] : null);
      } catch (err) {
        console.error("Period load error:", err);
      }
    })();
  }, [selectedIds.join(",")]);

  // Data hooks
  const exhibit = useExhibitData(period, selectedIds);
  const { commentary, updateSection, save, saveStatus, completedCount } = useCommentary(commentaryKey, periodKey(period));

  // On mount: resolve which properties this user can access
  useEffect(() => {
    if (!account) return;
    (async () => {
      try {
        const token = await getAccessToken(instance, account);
        if (!token) return;
        const properties = await getProperties(token);

        if (!properties.length) {
          setProfileError("No properties found for your account. Contact your regional controller.");
          return;
        }

        setAccessibleProperties(properties);
        if (properties.length === 1) setSelectedIds([properties[0].id]);
      } catch (err) {
        console.error("Profile load error:", err);
        setProfileError("Failed to load your property data. See console for details.");
      }
    })();
  }, [account?.username]);

  const handlePropertyChange = useCallback((ids) => {
    setSelectedIds(ids);
    setCoverTitle("");
    if (!ids.length) { setPeriods([]); setPeriod(null); }
  }, []);

  // Default cover title to property name when first resolved
  useEffect(() => {
    if (propertyLabel && !coverTitle) setCoverTitle(propertyLabel);
  }, [propertyLabel]);

  const goNext = () => { if (activeIdx < SECTIONS.length - 1) setActiveId(SECTIONS[activeIdx + 1].id); };
  const goPrev = () => { if (activeIdx > 0) setActiveId(SECTIONS[activeIdx - 1].id); };

  const handleExportPDF = async () => {
    if (isPdfExporting || !sectionWrapRef.current) return;
    setIsPdfExporting(true);
    const prevActiveId = activeId;

    // Capture every section at a fixed width so the PDF looks the same regardless
    // of browser window size. 960px gives ~8pt body text when scaled to Letter.
    const CAPTURE_W = 960;
    const COVER_H = Math.round(CAPTURE_W * (11 / 8.5)); // ≈ 1243 px, fills the portrait area

    try {
      const canvases = [];
      for (const section of SECTIONS) {
        if (section.isHelp || (!section.isTitlePage && !commentary[section.id]?.trim())) continue;
        flushSync(() => setActiveId(section.id));
        const el = sectionWrapRef.current;
        const prevMinH = el.style.minHeight;
        if (section.isTitlePage) el.style.minHeight = `${COVER_H}px`;
        canvases.push(await captureElement(el, CAPTURE_W));
        if (section.isTitlePage) el.style.minHeight = prevMinH;
      }
      const safeName = (coverTitle || propertyLabel || "Report").replace(/[^a-z0-9]/gi, "-");
      await buildPDF(canvases, `${safeName}-${periodKey(period)}-GM-Report.pdf`);
    } catch (err) {
      console.error("PDF export error:", err);
    } finally {
      flushSync(() => setActiveId(prevActiveId));
      setIsPdfExporting(false);
    }
  };

  const contentSectionCount = SECTIONS.filter((s) => !s.isTitlePage && !s.isHelp).length;
  const pct = Math.round((completedCount / contentSectionCount) * 100);
  const SaveLabel = saveStatus === "saving" ? "Saving…"
    : saveStatus === "saved" ? "✓ Saved"
    : saveStatus === "error" ? "Error — retry"
    : "Save Draft";
  const SaveColor = saveStatus === "saved" ? "#4ade80" : saveStatus === "error" ? "#f87171" : WHITE;

  if (profileError) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: BG }}>
        <div style={{ background: WHITE, border: `1px solid ${RULE}`, borderRadius: "6px",
          padding: "32px 40px", maxWidth: "420px", textAlign: "center" }}>
          <p style={{ color: "#c0392b", fontSize: "14px", marginBottom: "16px" }}>{profileError}</p>
          <p style={{ color: "#8a9aaa", fontSize: "12px", marginBottom: "16px" }}>
            Signed in as <strong style={{ color: CHARCOAL }}>{account?.username ?? account?.name ?? "unknown"}</strong>
            <br />If this is not your KemperSports account, sign out and sign in with the correct email.
          </p>
          <button onClick={() => instance.logoutRedirect()} style={{ background: NAVY, color: WHITE, border: "none",
            borderRadius: "3px", padding: "7px 20px", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (accessibleProperties === null) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: BG }}>
        <p style={{ color: "#8a9aaa", fontSize: "14px" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh",
      background: BG, color: CHARCOAL, fontFamily: BRAND.bodyFont, overflow: "hidden" }}>

      {/* Top bar */}
      <div style={{ background: GREEN, padding: "0 24px", display: "flex",
        alignItems: "center", justifyContent: "space-between", height: "52px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "8px", height: "28px", background: ORANGE, borderRadius: "1px", flexShrink: 0 }} />
            <div style={{ fontSize: "11px", color: "#8aaa90" }}>{account?.name}</div>
          </div>
          <div style={{ width: 1, height: 28, background: "#243D2C" }} />

          <PropertyDropdown properties={accessibleProperties} selectedIds={selectedIds} onChange={handlePropertyChange} />
          <div style={{ width: 1, height: 28, background: "#243D2C" }} />

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "10px", color: "#8aaa90", textTransform: "uppercase",
              letterSpacing: "0.07em", fontWeight: 700 }}>Period</span>
            <select
              value={periodKey(period)}
              onChange={(e) => setPeriod(periods.find((p) => periodKey(p) === e.target.value) ?? null)}
              style={{ background: "#1E3228", border: "1px solid #243D2C", color: WHITE,
                borderRadius: "3px", padding: "4px 10px", fontSize: "13px", cursor: "pointer" }}>
              {periods.map((p) => (
                <option key={periodKey(p)} value={periodKey(p)}>{formatPeriod(p) || periodKey(p)}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: 72, height: 3, background: "#1a3a6a", borderRadius: 2 }}>
              <div style={{ width: `${pct}%`, height: "100%", background: ORANGE, borderRadius: 2, transition: "width 0.3s" }} />
            </div>
            <span style={{ fontSize: "11px", color: "#7a99cc" }}>
              <span style={{ color: ORANGE, fontWeight: 700 }}>{completedCount}</span>/{contentSectionCount}
            </span>
          </div>

          <button onClick={save} disabled={saveStatus === "saving"} style={{
            background: "transparent", color: SaveColor,
            border: `1px solid ${saveStatus === "error" ? "#f87171" : "#3a5a8a"}`,
            borderRadius: "3px", padding: "5px 16px", fontSize: "12px",
            cursor: "pointer", fontWeight: 600, minWidth: 88 }}>
            {SaveLabel}
          </button>

          <button onClick={handleExportPDF} disabled={isPdfExporting} style={{
            background: ORANGE, color: WHITE, border: "none",
            borderRadius: "3px", padding: "5px 16px", fontSize: "12px",
            cursor: isPdfExporting ? "not-allowed" : "pointer",
            fontWeight: 700, opacity: isPdfExporting ? 0.7 : 1, minWidth: 96 }}>
            {isPdfExporting ? "Exporting…" : "Export PDF"}
          </button>

          <button onClick={() => instance.logoutRedirect()} style={{
            background: "transparent", color: "#7a99cc", border: "none", fontSize: "11px", cursor: "pointer" }}>
            Sign out
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Sidebar */}
        <div style={{ width: 210, background: WHITE, padding: "16px 0",
          flexShrink: 0, overflowY: "auto", borderRight: `1px solid ${RULE}` }}>
          <div style={{ padding: "0 14px 10px", fontSize: "10px", color: "#8a9aaa",
            textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
            Sections
          </div>
          {SECTIONS.map((s) => {
            const isActive = s.id === activeId;
            const isDone = !!commentary[s.id]?.trim();
            return (
              <React.Fragment key={s.id}>
                {s.isHelp && <div style={{ margin: "8px 14px 4px", borderTop: `1px solid ${RULE}` }} />}
                <button onClick={() => setActiveId(s.id)} style={{
                  display: "flex", alignItems: "flex-start", gap: "10px",
                  width: "100%", padding: "9px 14px", textAlign: "left",
                  background: isActive ? "#003080" : "transparent",
                  borderLeft: `3px solid ${isActive ? ORANGE : "transparent"}`,
                  border: "none", cursor: "pointer",
                  color: isActive ? WHITE : s.isHelp ? "#8a9aaa" : "#7a99cc",
                  fontSize: "12px", lineHeight: 1.35,
                  fontStyle: s.isHelp ? "italic" : "normal" }}>
                  {s.isHelp ? (
                    <span style={{ marginTop: "2px", flexShrink: 0, color: isActive ? WHITE : "#8a9aaa",
                      display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                    </span>
                  ) : (
                    <span style={{ marginTop: "3px", width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                      background: isDone ? ORANGE : isActive ? WHITE : "transparent",
                      border: `1.5px solid ${isDone ? ORANGE : isActive ? WHITE : "#3a5a8a"}` }} />
                  )}
                  {s.label}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div ref={sectionWrapRef} style={{ flex: 1, background: WHITE }}>
            {current && (
              <SectionView
                key={current.id}
                section={current}
                commentary={commentary[current.id] ?? ""}
                onChange={(v) => updateSection(current.id, v)}
                exhibitRows={exhibit.getRows(current.id)}
                exhibitLoading={exhibit.isLoading(current.id)}
                exhibitError={exhibit.getError(current.id)}
                coverTitle={coverTitle}
                period={period}
                onCoverTitleChange={setCoverTitle}
                isPdfExporting={isPdfExporting}
                expandedState={exhibitExpandedStates[current.id] ?? {}}
                onToggleExpanded={(rowId) => setExhibitExpandedStates((prev) => ({
                  ...prev,
                  [current.id]: { ...(prev[current.id] ?? {}), [rowId]: !(prev[current.id]?.[rowId] ?? false) },
                }))}
              />
            )}
          </div>

          {/* Prev / Next */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 32px", borderTop: `1px solid ${RULE}`, background: WHITE, flexShrink: 0 }}>
            <button onClick={goPrev} disabled={activeIdx === 0} style={{
              background: "transparent", border: `1px solid ${RULE}`,
              color: activeIdx === 0 ? "#c0c8d0" : NAVY,
              borderRadius: "3px", padding: "6px 18px", fontSize: "12px",
              cursor: activeIdx === 0 ? "not-allowed" : "pointer", fontWeight: 600 }}>
              ← Previous
            </button>
            <span style={{ fontSize: "11px", color: "#8a9aaa" }}>{activeIdx + 1} / {SECTIONS.length}</span>
            <button onClick={goNext} disabled={activeIdx === SECTIONS.length - 1} style={{
              background: activeIdx === SECTIONS.length - 1 ? "transparent" : NAVY,
              color: activeIdx === SECTIONS.length - 1 ? "#c0c8d0" : WHITE,
              border: `1px solid ${activeIdx === SECTIONS.length - 1 ? RULE : NAVY}`,
              borderRadius: "3px", padding: "6px 18px", fontSize: "12px",
              cursor: activeIdx === SECTIONS.length - 1 ? "not-allowed" : "pointer", fontWeight: 600 }}>
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────
export default function App() {
  const isAuthenticated = useIsAuthenticated();
  return isAuthenticated ? <AuthenticatedApp /> : <LoginScreen />;
}
