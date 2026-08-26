// Ported from old_gm-report-app/src/main.jsx — no logic changes. The ordering
// here matters: initialize() → handleRedirectPromise() → set active account →
// only then render, so nothing shows a flash of the login screen after a
// successful redirect.
import React from "react";
import ReactDOM from "react-dom/client";
import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { msalConfig } from "./authConfig.js";
import App from "./App.jsx";

const msalInstance = new PublicClientApplication(msalConfig);

msalInstance.initialize().then(async () => {
  // Process the redirect response from Microsoft login.
  // Without this call the auth code is never redeemed and no account is stored.
  const redirectResult = await msalInstance.handleRedirectPromise();

  if (redirectResult?.account) {
    // Fresh login — set the account returned by the redirect
    msalInstance.setActiveAccount(redirectResult.account);
  } else {
    // Returning visit — restore the first cached account if present
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      msalInstance.setActiveAccount(accounts[0]);
    }
  }

  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </React.StrictMode>
  );
});
