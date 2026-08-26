// ─────────────────────────────────────────────────────────────────────────────
// hooks/useCommentary.js
// Ported from old_gm-report-app's hook of the same name — same contract
// (commentary/updateSection/save/loadStatus/saveStatus/completedCount),
// pointed at this app's own backend API (in.c-APP_STORAGE) instead of the
// SharePoint GM_Commentary list. No auth token handling — see
// src/services/api.js.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { getCommentary, saveCommentary } from "../services/api.js";

export function useCommentary(commentaryKey, periodId) {
  const [commentary, setCommentary] = useState({});
  const [loadStatus, setLoadStatus] = useState("idle");
  const [saveStatus, setSaveStatus] = useState("idle");

  useEffect(() => {
    if (!commentaryKey || !periodId) return;

    setLoadStatus("loading");
    setCommentary({});

    (async () => {
      try {
        const data = await getCommentary(commentaryKey, periodId);
        setCommentary({
          financialPerformance: data.financialPerformance ?? "",
          rounds: data.rounds ?? "",
          revenue: data.revenue ?? "",
          costOfGoods: data.costOfGoods ?? "",
          payroll: data.payroll ?? "",
          opex: data.opex ?? "",
          personnel: data.personnel ?? "",
          growingRevenue: data.growingRevenue ?? "",
          miscellaneous: data.miscellaneous ?? "",
        });
        setLoadStatus("loaded");
      } catch (err) {
        console.error("Failed to load commentary:", err);
        setLoadStatus("error");
      }
    })();
  }, [commentaryKey, periodId]);

  const updateSection = useCallback((sectionId, value) => {
    setSaveStatus("idle");
    setCommentary((prev) => ({ ...prev, [sectionId]: value }));
  }, []);

  const save = useCallback(async () => {
    if (!commentaryKey || !periodId) return;
    setSaveStatus("saving");
    try {
      await saveCommentary(commentaryKey, periodId, commentary);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err) {
      console.error("Failed to save commentary:", err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 4000);
    }
  }, [commentaryKey, periodId, commentary]);

  const completedCount = Object.values(commentary).filter((v) => v?.trim()).length;

  return { commentary, updateSection, save, loadStatus, saveStatus, completedCount };
}
