// ─────────────────────────────────────────────────────────────────────────────
// hooks/useCommentary.js
// Ported from old_gm-report-app's hook of the same name — same contract
// (commentary/updateSection/save/loadStatus/saveStatus/completedCount),
// pointed at this app's own backend API (in.c-APP_STORAGE) instead of the
// SharePoint GM_Commentary list.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { getAccessToken, getCommentary, saveCommentary } from "../services/api.js";

export function useCommentary(commentaryKey, periodId) {
  const { instance, accounts } = useMsal();
  const [commentary, setCommentary] = useState({});
  const [loadStatus, setLoadStatus] = useState("idle");
  const [saveStatus, setSaveStatus] = useState("idle");

  useEffect(() => {
    if (!commentaryKey || !periodId || !accounts[0]) return;

    setLoadStatus("loading");
    setCommentary({});

    (async () => {
      try {
        const token = await getAccessToken(instance, accounts[0]);
        if (!token) return; // redirecting for auth
        const data = await getCommentary(token, commentaryKey, periodId);
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
  }, [commentaryKey, periodId, accounts[0]?.username]);

  const updateSection = useCallback((sectionId, value) => {
    setSaveStatus("idle");
    setCommentary((prev) => ({ ...prev, [sectionId]: value }));
  }, []);

  const save = useCallback(async () => {
    if (!commentaryKey || !periodId || !accounts[0]) return;
    setSaveStatus("saving");
    try {
      const token = await getAccessToken(instance, accounts[0]);
      if (!token) return; // redirecting for auth
      await saveCommentary(token, commentaryKey, periodId, commentary);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err) {
      console.error("Failed to save commentary:", err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 4000);
    }
  }, [commentaryKey, periodId, commentary, accounts[0]?.username]);

  const completedCount = Object.values(commentary).filter((v) => v?.trim()).length;

  return { commentary, updateSection, save, loadStatus, saveStatus, completedCount };
}
