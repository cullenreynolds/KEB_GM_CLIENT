// ─────────────────────────────────────────────────────────────────────────────
// hooks/useExhibitData.js
// Ported from old_gm-report-app's hook of the same name — same contract
// (getRows/isLoading/getError, per-section cache keyed by section+period+
// property set, dedup via activeRequests), pointed at this app's own backend
// API instead of Power BI. `period` is now { fiscalYear, fiscalPeriod }
// instead of a single "0426"-style string — see PROJECT_BRIEF.md decision #7.
// No auth token handling — see src/services/api.js.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from "react";
import { getExhibitRows } from "../services/api.js";
import { SECTIONS } from "../config.js";

export function useExhibitData(period, propertyKeys) {
  const [exhibitCache, setExhibitCache] = useState({});
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const activeRequests = useRef(new Set());

  const codeKey = (propertyKeys ?? []).slice().sort().join(",");
  const periodKey = period ? `${period.fiscalYear}-${period.fiscalPeriod}` : "";

  useEffect(() => {
    if (!period || !codeKey) return;

    const exhibitSections = SECTIONS.filter((s) => s.hasExhibit);

    exhibitSections.forEach(async (section) => {
      const key = `${section.id}__${periodKey}__${codeKey}`;
      if (exhibitCache[key] || activeRequests.current.has(key)) return;

      activeRequests.current.add(key);
      setLoading((p) => ({ ...p, [section.id]: true }));

      try {
        const rows = await getExhibitRows(section.id, propertyKeys, period.fiscalYear, period.fiscalPeriod);
        setExhibitCache((p) => ({ ...p, [key]: rows }));
      } catch (err) {
        console.error(`Exhibit load failed [${section.id}]:`, err);
        setErrors((p) => ({ ...p, [section.id]: err.message }));
      } finally {
        setLoading((p) => ({ ...p, [section.id]: false }));
        activeRequests.current.delete(key);
      }
    });
  }, [periodKey, codeKey]);

  return {
    getRows: (sectionId) => exhibitCache[`${sectionId}__${periodKey}__${codeKey}`] ?? null,
    isLoading: (sectionId) => !!loading[sectionId],
    getError: (sectionId) => errors[sectionId] ?? null,
  };
}
