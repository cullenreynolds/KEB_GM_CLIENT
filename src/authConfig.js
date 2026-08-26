// ─────────────────────────────────────────────────────────────────────────────
// authConfig.js
// Ported from old_gm-report-app/src/authConfig.js. Same tenant, NEW app
// registration (decision #1) — CLIENT_ID below is a placeholder until that
// registration exists; TENANT_ID is unchanged since it's the same Entra tenant.
//
// Scopes are simpler than the old app: no Power BI or SharePoint scopes needed
// since this app talks to its own backend (server/), which verifies the Entra
// ID token itself rather than calling Power BI/Graph on the user's behalf.
// ─────────────────────────────────────────────────────────────────────────────

export const TENANT_ID = "d1a2d391-51a4-4c9f-9437-bfa2c5a32bed";
export const CLIENT_ID = "REPLACE_WITH_NEW_APP_REGISTRATION_CLIENT_ID";

export const msalConfig = {
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    redirectUri: window.location.origin,
  },
  cache: { cacheLocation: "sessionStorage", storeAuthStateInCookie: false },
};

// This app's own backend is the token audience — request a token scoped to the
// app registration itself (api://<CLIENT_ID>/access_as_user), not Graph/Power BI.
export const loginRequest = { scopes: ["User.Read", `api://${CLIENT_ID}/access_as_user`] };
export const apiScopes = { scopes: [`api://${CLIENT_ID}/access_as_user`] };
