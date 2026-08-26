// ─────────────────────────────────────────────────────────────────────────────
// auth.js
// Verifies Entra ID (Azure AD) access tokens sent by the frontend's MSAL login.
// Security-critical: never trust a client-sent email/UPN without verifying the
// token's signature, audience, and issuer first — see PROJECT_BRIEF.md's Auth
// section for why (re-implements what Power BI's RLS engine used to do for us).
// ─────────────────────────────────────────────────────────────────────────────

import { createRemoteJWKSet, jwtVerify } from "jose";

const TENANT_ID = process.env.ENTRA_TENANT_ID;
const CLIENT_ID = process.env.ENTRA_CLIENT_ID;

if (!TENANT_ID || !CLIENT_ID) {
  // eslint-disable-next-line no-console
  console.warn("[auth] ENTRA_TENANT_ID / ENTRA_CLIENT_ID not set — token verification will fail until configured.");
}

const JWKS = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`));

// Express middleware — expects "Authorization: Bearer <token>".
// On success, attaches req.user = { email, name }. On failure, responds 401.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
      audience: CLIENT_ID,
    });

    const email = (payload.preferred_username || payload.upn || payload.email || "").toLowerCase();
    if (!email) return res.status(401).json({ error: "Token has no email/UPN claim" });

    req.user = { email, name: payload.name || email };
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token", detail: err.message });
  }
}
