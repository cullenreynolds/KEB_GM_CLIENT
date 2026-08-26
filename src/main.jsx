// Auth is handled entirely by Keboola's OIDC gate (access mode = OIDC, Entra
// ID) — by the time this code runs in the browser, the user is already
// authenticated and every request to this app carries their identity via the
// X-Kbc-User-Email header Keboola's proxy sets. No MSAL/login flow needed here.
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
