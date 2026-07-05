# CollectBase — AR CRM

An internal Accounts Receivable CRM for tracking invoice collections, managing analyst portfolios, and coordinating customer follow-up emails.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at `/api`)
- `pnpm --filter @workspace/ar-crm run dev` — run the frontend (port 25141, proxied at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + Tailwind CSS + wouter

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `lib/api-client-react/src/generated/` — generated React Query hooks (from codegen)
- `lib/api-zod/src/generated/` — generated Zod schemas for server-side validation
- `lib/db/src/schema/` — Drizzle ORM table definitions (analysts, invoices, comments, email_threads, email_messages)
- `artifacts/api-server/src/routes/` — Express route handlers (invoices, analysts, comments, dashboard, emails)
- `artifacts/ar-crm/src/pages/` — Frontend pages (dashboard, analysts, analyst-dashboard, mailbox)
- `artifacts/ar-crm/src/components/` — Shared components (layout, invoice-drawer, invoice-status-badge)

## Product

**AR Dashboard** — Global invoice overview. Shows all 25 invoices segmented across aging buckets: Not Due, Current, 1–30 days, 31–60 days, 61–90 days, 90+ days. Each bucket shows count and dollar amount. Filterable by status and analyst.

**Analyst Dashboard** — Per-analyst portfolio view. Shows assigned invoices with aging breakdown summary cards. Clicking any invoice opens a slide-over with full details, overdue days, and a comment timeline where analysts log collection activity.

**Team Overview** — Lists all AR analysts with portfolio size and total outstanding amounts.

**Team Mailbox** — Threaded collections email management. Two-panel layout (thread list + conversation view). Outbound emails appear right-aligned, inbound left-aligned. Threads have Open / Awaiting Reply / Closed states. Compose new follow-ups per invoice; reply and close/resolve threads.

## Architecture decisions

- OpenAPI-first: all contracts defined in `openapi.yaml`, hooks and Zod schemas auto-generated via Orval. Never hand-write API types.
- Invoice aging is computed at query time (not stored) based on `due_date` vs current date — always accurate without scheduled jobs.
- Email threading is manual (stored in DB) — subject line contains invoice number. Real groupmail integration is a future enhancement.
- NetSuite and Salesforce connectors are registered on the Replit platform (OAuth ready) but not yet wired to live data — `netsuite_id` and `salesforce_id` fields are on every invoice record for future sync.
- Status badges are color-coded by urgency: neutral (not due) → green (current) → yellow (1–30) → orange (31–60) → red (61–90) → dark red (90+).

## User preferences

- NetSuite and Salesforce integrations are parked — do not wire them up until the user has access.
- This is a fully internal company tool — no public-facing auth needed for now.

## Gotchas

- After editing any route file in `api-server`, restart the API Server workflow to trigger a rebuild (the dev script runs `build` then `start`).
- Run `pnpm --filter @workspace/api-spec run codegen` after any change to `openapi.yaml` before touching frontend code.
- Do not add leaf workspace packages to root `tsconfig.json` references.
- Always use `@workspace/api-client-react` hooks in the frontend — never hand-write fetch calls.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
