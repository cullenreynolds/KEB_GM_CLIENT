// ─────────────────────────────────────────────────────────────────────────────
// auth.js
// Identity comes from Keboola's own OIDC gate (access mode = OIDC, Entra ID),
// not in-app MSAL. Keboola's proxy authenticates the user against Entra ID
// before any request reaches this container, and forwards the signed-in
// user's email as the X-Kbc-User-Email header — confirmed by the user
// (2026-08-26). This container is only reachable through that proxy, so the
// header can be trusted without independent verification here.
//
// This replaced an earlier in-app-MSAL design built on the assumption that
// Keboola's OIDC gate couldn't forward identity to the app — Keboola's docs
// didn't confirm a mechanism for this, but it turns out one exists. See
// ANOMALIES.md for the full history.
// ─────────────────────────────────────────────────────────────────────────────

const HEADER = "x-kbc-user-email";

// Express middleware — attaches req.user = { email } from X-Kbc-User-Email.
// Responds 401 if the header is missing (shouldn't happen once the data app's
// access mode is set to OIDC, since Keboola's gate wouldn't let the request
// through without it).
export function requireAuth(req, res, next) {
  const email = (req.headers[HEADER] || "").toLowerCase().trim();
  if (!email) return res.status(401).json({ error: "Missing X-Kbc-User-Email — is this app's access mode set to OIDC?" });

  req.user = { email };
  next();
}
