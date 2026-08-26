// ─────────────────────────────────────────────────────────────────────────────
// services/api.js
// Frontend client for this app's own backend (server/routes/api.js). No token
// acquisition here — Keboola's OIDC gate (access mode = OIDC, Entra ID)
// authenticates the browser before any request reaches this app at all, and
// forwards identity to the backend via the X-Kbc-User-Email header (see
// server/services/auth.js). The frontend just calls its own API directly.
// ─────────────────────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
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

export async function getMe() {
  const { email } = await apiFetch("/api/me");
  return email;
}

export async function getProperties() {
  const { properties } = await apiFetch("/api/properties");
  return properties;
}

export async function getPeriods(propertyKeys) {
  const { periods } = await apiFetch(`/api/periods?propertyKeys=${encodeURIComponent(propertyKeys.join(","))}`);
  return periods;
}

export async function getExhibitRows(section, propertyKeys, fiscalYear, fiscalPeriod) {
  const params = new URLSearchParams({
    section,
    propertyKeys: propertyKeys.join(","),
    fiscalYear: String(fiscalYear),
    fiscalPeriod: String(fiscalPeriod),
  });
  const { rows } = await apiFetch(`/api/exhibit?${params}`);
  return rows;
}

export async function getCommentary(commentaryKey, periodId) {
  const params = new URLSearchParams({ commentaryKey, periodId });
  const { commentary } = await apiFetch(`/api/commentary?${params}`);
  return commentary;
}

export async function saveCommentary(commentaryKey, periodId, commentary) {
  return apiFetch("/api/commentary", {
    method: "POST",
    body: JSON.stringify({ commentaryKey, periodId, commentary }),
  });
}
