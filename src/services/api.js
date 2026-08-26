// ─────────────────────────────────────────────────────────────────────────────
// services/api.js
// Frontend client for this app's own backend (server/routes/api.js). Replaces
// the old app's powerBiService.js + sharePointService.js — those talked
// directly to Power BI/Graph from the browser; this app's browser code only
// ever talks to its own backend, which does the Snowflake/Storage work and
// verifies the Entra ID token (see server/services/auth.js).
// ─────────────────────────────────────────────────────────────────────────────

import { apiScopes } from "../authConfig.js";

// Acquires an access token for this app's own API, silent first, falling back
// to a redirect if silent acquisition fails (expired session, consent needed).
export async function getAccessToken(instance, account) {
  try {
    const result = await instance.acquireTokenSilent({ ...apiScopes, account });
    return result.accessToken;
  } catch {
    await instance.acquireTokenRedirect(apiScopes);
    return null; // page is navigating away for the redirect
  }
}

async function apiFetch(token, path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request to ${path} failed (${res.status})`);
  }
  return res.json();
}

export async function getProperties(token) {
  const { properties } = await apiFetch(token, "/api/properties");
  return properties;
}

export async function getPeriods(token, propertyKeys) {
  const { periods } = await apiFetch(token, `/api/periods?propertyKeys=${encodeURIComponent(propertyKeys.join(","))}`);
  return periods;
}

export async function getExhibitRows(token, section, propertyKeys, fiscalYear, fiscalPeriod) {
  const params = new URLSearchParams({
    section,
    propertyKeys: propertyKeys.join(","),
    fiscalYear: String(fiscalYear),
    fiscalPeriod: String(fiscalPeriod),
  });
  const { rows } = await apiFetch(token, `/api/exhibit?${params}`);
  return rows;
}

export async function getCommentary(token, commentaryKey, periodId) {
  const params = new URLSearchParams({ commentaryKey, periodId });
  const { commentary } = await apiFetch(token, `/api/commentary?${params}`);
  return commentary;
}

export async function saveCommentary(token, commentaryKey, periodId, commentary) {
  return apiFetch(token, "/api/commentary", {
    method: "POST",
    body: JSON.stringify({ commentaryKey, periodId, commentary }),
  });
}
