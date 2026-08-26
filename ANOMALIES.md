# Data anomalies log

Running record of data-quality/classification questions found in
`out.c-BDM.BI_PROPERTY_FINANCIALS_BVA` (and related tables) while building. Not blocking —
each item has a working default; revisit and confirm with the business before go-live.

**Standing rules confirmed by the user (2026-08-26), both about evaluating things at the
property level, not in aggregate across the whole table:**

1. `SIS_ROW_CODE` — and possibly `SIS_ROLLUP` itself — is **property-specific**. The same code
   means different things at different properties (e.g. code `90` is `"Green Fees"` at one
   property, `"Membership Dues"` at another). So GF/CF and F&B/Merch classification match on
   `SIS_ROW_DESCRIPTION` text, never on `SIS_ROW_CODE`.
2. **Below-the-line membership is decided per property**: a rollup that isn't Revenue/COGS/
   Payroll/OpEx is Below the line if its `SIS_ROW_CODE` exceeds *that property's own* EBITDA
   boundary (the max code among its own Revenue/COGS/Payroll/OpEx rows) — not a fixed list of
   rollup names. Implemented in `server/services/financials.js`
   (`classifyPropertyRollups`) and verified against real data (see Resolved below).

## Open

- **Entrypoint/branch cannot be set on the data app config via MCP.** Both
  `modify_python_js_data_app(branch="main")` and the `data-app-entrypoints` sync action fail
  with "could not determine whether it is an external-git app (the git-repo lookup failed...)".
  The config's `parameters.dataApp.git` block has a `"private": true` field that isn't a
  recognized option (valid ones per the sync action's own error: `#password`, `#sshKey`,
  `branch`, `entrypoint`, `repository`, `username`) — this is likely what's breaking the
  git-repo lookup, but removing it isn't reachable through the exposed MCP tools (they only
  let you set `branch`, which itself needs the lookup to succeed first — circular). **Needs
  fixing directly in the Keboola UI**: open the "GM Client Report" data app's git settings,
  confirm/re-save the repository connection (which should clear the stray `private` field),
  and set the entrypoint to `server/index.js`.

- **Rows whose `SIS_ROW_CODE` does NOT exceed their property's EBITDA boundary** — the one
  case the per-property rule above doesn't explicitly cover (every real example checked so far
  correctly exceeds the boundary). `financials.js` includes these in Below anyway (dollars
  aren't silently dropped) but logs a `console.warn` per occurrence — worth periodically
  checking server logs for these once real traffic runs, since they're evidence something
  doesn't fit the model.

## Resolved

- **Above/Below classification**: per-property `SIS_ROW_CODE`-vs-EBITDA-boundary rule (see
  Standing rules above). Verified against a real property (`44bea40aa97bd34da151e871518f88f9`):
  its boundary (max code among Revenue/COGS/Payroll/OpEx) is `1440`; `TOTAL OTHER EXPENSES`
  (codes 1760–1815), `TOTAL FINANCING ACTIVITY` (1920), and `TOTAL RESERVE FUNDS` (2498–2501)
  all correctly sit above it. `TOTAL RESERVE FUNDS`' "Operating Transfer" line (+2,002,000)
  exactly offsets `TOTAL OTHER EXPENSES`' "Transfer to Reserves" line (-2,002,000) at that
  property, confirming Reserve Funds needs to be included, not excluded, for the numbers to
  reconcile. This rule replaces two earlier, narrower approaches (a fixed `BELOW_ROLLUPS` name
  list, and a `SIS_ROW_DESCRIPTION`-keyed override map for blank-`SIS_ROLLUP` rows) — both
  superseded now that the general per-property rule covers them, including rollups not
  discovered until this rule was built (`TOTAL RESERVE FUNDS`, `S/T Wages`, `S/T Adders`).
- **`TOTAL HOURLY PAYROLL` vs `TOTAL PAYROLL`**: confirmed — rolls into Payroll together
  (`PAYROLL_ROLLUPS` in `src/config.js`). The double-count concern (both rollups share
  department names like "Course and Grounds") is evaluated at the property level per the
  standing rule, not by the aggregate label-overlap check that originally raised it.
- **Row sort order**: `SIS_ROW_CODE` ascending (numeric) determines display order — display
  only, never classification.
- **Period availability**: `BI_PROPERTY_FINANCIALS_BVA.FLAG_CLOSED`, trailing 12 months, and
  — since closed status is property-specific — a period is only shown as available for a
  multi-property selection if it's closed for **every** selected property (`periods.js`).
- **Budget selection**: exactly one `CODE_BUDGET` exists per (property, fiscal year, fiscal
  period, `SIS_ROW_CODE`) whenever a budget amount is present — verified, no version-picking
  logic needed.
- **Data access mechanism**: Keboola's **Storage Access / Query Service** (`@keboola/query-service`),
  not raw Snowflake credentials — confirmed against Keboola docs. Enabling Storage Access on
  this data app auto-provisions an ephemeral workspace and injects `WORKSPACE_ID`/
  `QUERY_SERVICE_URL`/`KBC_TOKEN`/`KBC_URL`, no manual credential setup. This also simplified
  `commentary.js`'s write path from a file-upload/import job down to a direct SQL
  DELETE+INSERT, since Storage Access grants INSERT/UPDATE/DELETE on tables added to it.
- **Auth mechanism**: Keboola's own **OIDC access mode** (Entra ID), not in-app MSAL — reversed
  from an earlier decision. Keboola's docs didn't confirm a mechanism for OIDC to forward the
  authenticated user's identity into the app, but the user confirmed directly: Keboola's OIDC
  proxy sets an **`X-Kbc-User-Email`** header on every request it forwards to the app container.
  Since the container is only reachable through that authenticating proxy, the header can be
  trusted without independent verification. This removed an entire subsystem: no separate
  Entra app registration, no in-app MSAL (`authConfig.js` deleted, `@azure/msal-browser`/
  `@azure/msal-react` dropped from `package.json`), no JWT verification in the backend (`jose`
  dropped too) — `server/services/auth.js` just reads the header. **Done**: the user configured
  the OIDC provider directly on the data app (`GM Client Report`, `01m0zqrcn3jhaa4dbrzb028xkv`)
  — confirmed via `get_data_apps`: `auth_providers` has an `oidc-1` entry against the correct
  Entra tenant issuer, with `auth_rules` requiring auth on every path. It also exposed a
  `logout_url` (`https://login.microsoftonline.com/.../oauth2/logout`) — worth revisiting for
  the "No in-app Sign out" item below; this may not be a dead end after all.
- **Storage Access / commentary table**: `storage.output.tables` added to the data app config
  (4 tables, `unload_strategy: "direct-grant"`) via `modify_python_js_data_app` —
  `out.c-BDM.BI_PROPERTY_FINANCIALS_BVA`, `out.c-BDM.DIM_MASTER_PROPERTY`,
  `out.c-Data-App-Access-Security.DATA_APP_ACCESS`, `in.c-APP_STORAGE.APP_GM_CLIENT_REPORT_COMMENTARY`.
  The commentary table itself was created via a one-off SQL transformation ("Create GM Client
  Report Commentary Table", config `01m0zs8jqcwds2ca0d5m358ryq`) — confirmed created and
  populated with the schema `commentary.js` expects (`PropertyCode`, `PeriodID`, 9 commentary
  columns, `UpdatedBy`, `UpdatedAt`), primary key `(PropertyCode, PeriodID)`.
- **No in-app "Sign out"** — removed along with MSAL. Keboola's OIDC gate owns the session; no
  confirmed app-triggerable Keboola logout URL to wire up a button to. If a sign-out affordance
  turns out to be wanted, it needs a Keboola-specific logout endpoint — not yet investigated.

## Matched-label lists, for review (per the user: "over-match and I'll review")

Full distinct `SIS_ROW_DESCRIPTION` values currently captured by each pattern in
`src/config.js`, queried directly against `TOTAL REVENUE`/`TOTAL COGS`. Anything on these
lists that shouldn't be there — tell me and I'll add an exclusion.

**GF/CF** (`GFCF_PATTERN`, feeds Rounds' ADR row) — matched under `TOTAL REVENUE`:
`Green Fees & Cart Fees` (+ `- Cantigny`, `- Youth Links` variants), `Green Fees`, `Cart Fees`.
**Not matched, borderline**: `Green/Membership Fees` (row code 60) — excluded because it mixes
membership dues into what should be pure green/cart fee revenue; flag if that's wrong.

**F&B Revenue** (`FB_PATTERN`) — matched under `TOTAL REVENUE`: `Food and Beverage` (+ several
per-outlet variants: `Red Oak`, `- Championship`, `Le Jardin`, `Park Programming`,
`Gratuity Income`, `Other Revneue`), `Food & Beverage`, `Unused F&B Discount`, and every
outlet-branded `*Food`/`*Beverage` line (`Fin & Feather`, `Sottoterra`, `Rooftop 360`, `Hemy's`,
`RedBlue Clubhouse`, `Black Clubhouse`, `Canyon Lake`, `Leaf`, `Chain`, `Banquet`, `The Loft`).

**Merch Revenue** (`MERCH_PATTERN`) — matched under `TOTAL REVENUE`: `Merchandise`,
`Pro Shop`, `Other Pro Shop`, `Retail Merchandise`, `Merchandise and ProShop`,
`Sport Shop/Merchandise`, `Academy Merchandise`, `Retail`.

**F&B COGS** (`FB_PATTERN`) — matched under `TOTAL COGS`: `Food & Beverage` (+
`- Total`), and every outlet-branded `*Food`/`*Beverage` COGS line (same outlet names as F&B
Revenue above, plus `Pegasus`, `Canyon` without "Lake"), `Cafeteria` (borderline — staff
cafeteria cost, not guest-facing F&B; flag if this should be excluded).

**Merch COGS** (`MERCH_PATTERN`) — matched under `TOTAL COGS`: `Merchandise` (+
`- Championship`), `Pro Shop`, `Retail Merchandise`, `Retail`.
