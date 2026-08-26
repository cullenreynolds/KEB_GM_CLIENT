// ─────────────────────────────────────────────────────────────────────────────
// api.js — all backend routes, mounted under /api in server/index.js.
// Every route runs behind requireAuth (see auth.js); req.user.email is trusted
// only because auth.js already verified the Entra ID token's signature.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import { runQuery } from "../services/db.js";
import { getAccessibleProperties } from "../services/access.js";
import { getAvailablePeriods } from "../services/periods.js";
import { getExhibitRows } from "../services/financials.js";
import { getCommentary, saveCommentary } from "../services/commentary.js";
import { SECTIONS } from "../../src/config.js";

const router = Router();

const EXHIBIT_SECTION_IDS = new Set(SECTIONS.filter((s) => s.hasExhibit).map((s) => s.id));

function parsePropertyKeys(req) {
  const raw = req.query.propertyKeys;
  if (!raw) return [];
  return String(raw).split(",").filter(Boolean);
}

router.get("/properties", async (req, res, next) => {
  try {
    const properties = await getAccessibleProperties(runQuery, req.user.email);
    res.json({ properties });
  } catch (err) { next(err); }
});

router.get("/periods", async (req, res, next) => {
  try {
    const propertyKeys = parsePropertyKeys(req);
    if (!propertyKeys.length) return res.status(400).json({ error: "propertyKeys required" });
    const periods = await getAvailablePeriods(runQuery, propertyKeys);
    res.json({ periods });
  } catch (err) { next(err); }
});

router.get("/exhibit", async (req, res, next) => {
  try {
    const { section, fiscalYear, fiscalPeriod } = req.query;
    const propertyKeys = parsePropertyKeys(req);

    if (!EXHIBIT_SECTION_IDS.has(section)) return res.status(400).json({ error: `Unknown or non-exhibit section "${section}"` });
    if (!propertyKeys.length) return res.status(400).json({ error: "propertyKeys required" });
    if (!fiscalYear || !fiscalPeriod) return res.status(400).json({ error: "fiscalYear and fiscalPeriod required" });

    const rows = await getExhibitRows(runQuery, section, {
      propertyKeys,
      fiscalYear: Number(fiscalYear),
      fiscalPeriod: Number(fiscalPeriod),
    });
    res.json({ rows });
  } catch (err) { next(err); }
});

router.get("/commentary", async (req, res, next) => {
  try {
    const { commentaryKey, periodId } = req.query;
    if (!commentaryKey || !periodId) return res.status(400).json({ error: "commentaryKey and periodId required" });
    const commentary = await getCommentary(runQuery, commentaryKey, periodId);
    res.json({ commentary });
  } catch (err) { next(err); }
});

router.post("/commentary", async (req, res, next) => {
  try {
    const { commentaryKey, periodId, commentary } = req.body || {};
    if (!commentaryKey || !periodId || !commentary) {
      return res.status(400).json({ error: "commentaryKey, periodId, and commentary required" });
    }
    await saveCommentary(runQuery, commentaryKey, periodId, commentary, req.user.email);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
