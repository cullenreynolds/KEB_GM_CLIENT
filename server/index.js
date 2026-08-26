// ─────────────────────────────────────────────────────────────────────────────
// server/index.js — Express entrypoint for the python-js data app.
// Serves the API under /api (behind Entra ID auth) and the built frontend
// (dist/) for everything else, so this single process is the app's entrypoint
// both locally (behind Vite's dev proxy) and once deployed.
// ─────────────────────────────────────────────────────────────────────────────

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { requireAuth } from "./services/auth.js";
import apiRouter from "./routes/api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use("/api", requireAuth, apiRouter);

// Error handler — keep responses uniform JSON, don't leak stack traces.
app.use((err, req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const distDir = path.join(__dirname, "..", "dist");
app.use(express.static(distDir));
app.get("*", (req, res) => res.sendFile(path.join(distDir, "index.html")));

const port = process.env.PORT || 8080;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`gm-report-app server listening on :${port}`);
});
