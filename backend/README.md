# Backend guide

This file is a map for studying the LeadFlow backend. The main application path is:

```text
src/server.ts
  → src/http/routes/index.ts
  → src/http/routes/leadflowRoutes.ts
  → src/modules/*
  → src/db/prisma.ts
  → PostgreSQL (schema in prisma/schema.prisma)
```

Some work is sent to the database-backed queue and handled by a polling worker in the same API process. Gemini and SMTP are optional integrations for AI work and email delivery.

## Folder map

| Path | What it contains |
| --- | --- |
| `src/server.ts` | Express app setup, middleware registration, startup, queue startup, health endpoint, and graceful shutdown. |
| `src/http/routes/` | HTTP endpoints. Routes parse request data, call services, and return JSON responses. |
| `src/modules/` | Business logic grouped by domain: companies, ICP, leads, outreach, replies, research, analytics, jobs, and workspaces. |
| `src/integrations/` | Browser automation and optional external storage adapters. |
| `src/modules/companies/` | Company discovery, enrichment, and market signals. |
| `src/modules/leads/` | Qualification, scoring, and lead memory. |
| `src/modules/outreach/` | Draft generation, review, and email delivery. |
| `src/modules/research/` | Gemini client configuration and research synthesis. |
| `src/modules/jobs/` | Persistent queue and pipeline worker. |
| `src/modules/` (other domains) | ICP, replies, analytics, and workspace setup. |
| `src/db/` | Prisma client creation and database connect/disconnect helpers. |
| `src/config/` | Environment loading and Zod validation. |
| `src/http/middleware/` | Request logging and centralized error response handling. |
| `src/shared/` | Shared logger and application error classes. |
| `src/integrations/browser/` | Playwright browser utilities and visual element grounding. These are supporting utilities, not the main lead pipeline. |
| `prisma/schema.prisma` | PostgreSQL models, enums, relations, indexes, and generated Prisma client configuration. |
| `evals/` | Deterministic ICP regression evaluation and model-assisted outreach evaluation. |
| `scripts/` | Manual diagnostics for AI and browser integrations. |
| `scripts/testPipeline.ts` | End-to-end pipeline smoke script; needs a configured backend environment. |

## Startup and shared infrastructure

- **`server.ts` — `bootstrap()`** connects to PostgreSQL, creates or finds the default organization/user/ICP context, starts the queue worker, then listens on `PORT`. **`gracefulShutdown()`** stops the worker and disconnects Prisma when the process exits.
- **`config/env.ts` — `parseEnv()`** loads `.env`, validates settings with Zod, and exits at startup when required configuration such as `DATABASE_URL` is invalid. The parsed values are exported as `env`.
- **`db/prisma.ts` — `prisma`, `connectDatabase()`, `disconnectDatabase()`** expose and manage the shared Prisma client.
- **`middleware/requestLogger.ts` — `requestLogger()`** logs HTTP requests. **`middleware/errorHandler.ts` — `errorHandler()`** maps thrown errors to HTTP responses.
- **`utils/errors.ts` — `AppError` and subclasses** provide errors with HTTP status codes, such as bad request, not found, and conflict.
- **`utils/logger.ts` — `logger`** configures Winston logging, including console and file transports.
- **`services/seedService.ts` — `getOrCreateDefaultContext()`** ensures a default organization, user, and active ICP exist. It does not implement login or API authentication.

## Routes

`routes/index.ts` mounts the main router under both `/api` and `/api/leadflow` for compatibility. The important endpoints are:

| Endpoint family | Main operation |
| --- | --- |
| `/import/csv`, `/import/json` | Parse and store candidate companies and contacts; optionally enqueue processing. |
| `/icp` | Get the active profile and list profiles; create or update an Ideal Customer Profile. |
| `/leads`, `/leads/:id/360` | Search/list leads and load a detailed lead view. |
| `/leads/:id/qualify`, `/enrich`, `/score`, `/research`, `/outreach` | Run one pipeline stage directly. |
| `/leads/:id/pipeline` | Enqueue the full pipeline asynchronously. |
| `/outreach/pending`, `/outreach/:id/approve`, `/reject`, `/dispatch` | Review, approve/reject, and dispatch drafts. Dispatch requires approval. |
| `/leads/:id/response`, `/leads/:id/timeline` | Classify an inbound reply and retrieve lead history. |
| `/analytics/manager`, `/analytics/queue` | Return funnel, outreach, and worker metrics. |
| `/config/status`, `/config/smtp/verify` | Report integration readiness and check SMTP configuration. |

Most responses use a JSON envelope such as `{ success: true, data: ... }`. Route handlers should stay focused on HTTP input/output; service modules hold reusable domain rules.

## Core services and functions

### Import and targeting

- **`DiscoveryService.parseCsv(csvContent)`** converts CSV text to normalized input records.
- **`DiscoveryService.cleanDomain(raw)`** normalizes a company domain.
- **`DiscoveryService.ingestCompanies(items, source)`** upserts company/contact records and reports newly created IDs.
- **`IcpService.getActiveIcp()` / `listIcps()` / `createIcp()` / `updateIcp()`** manage targeting profiles.
- **`QualificationService.qualify(company, lead, icp)`** is the pure, deterministic pass/fail function. It checks industry, company size, country, and role and returns per-check reasons.
- **`QualificationService.evaluateLead(leadId)`** loads database records, calls the pure qualifier, and persists the result/status.

### Intelligence and scoring

- **`EnrichmentService.enrichCompany(companyId)`** fills missing company data where possible and records source/confidence/provenance.
- **`SignalEngine.detectSignalsWithProvenance(companyId)`** detects buying signals and reports model/fallback provenance. **`getSignalsForCompany()`** retrieves stored signals.
- **`ScoringService.scoreLead(leadId)`** calculates and persists the versioned, factor-level score and records score changes in lead memory.
- **`ResearchAgentService.runResearch(companyId)`** gathers stored company context and signals, requests a bounded structured synthesis, validates the output with Zod, and records model/fallback provenance.
- **`PersonalizationService.generateOutreach(leadId)`** generates a signal-grounded draft and stores its generation details. Generated claims still need human verification.

The model assists with flexible text and research tasks. Qualification and scoring use application code so those decisions remain repeatable and explainable.

### Queue and pipeline

- **`QueueService.enqueueJob(options)`** persists a job and applies an idempotency key to reduce duplicate work.
- **`startWorker()` / `stopWorker()`** start or stop the in-process polling loop.
- **`processNextJob()`** finds a due waiting job, marks it active, runs it, and records completion or schedules a retry; exhausted jobs move to `DLQ`.
- **`executeJobLogic(job)`** dispatches a job to its service. For `PROCESS_LEAD_PIPELINE`, the order is qualification → enrichment → signals → scoring → research → outreach. A disqualified lead stops after qualification.
- **`getQueueMetrics()`** returns queue and worker statistics.

Each pipeline stage writes best-effort trace events to lead memory. The queue is stored in PostgreSQL, but the worker itself runs inside the API process; this is a single-node design.

### Review, email, and replies

- **`ReviewService.submitForReview()` / `approveMessage()` / `rejectMessage()`** manage the draft review states.
- **`ReviewService.dispatchMessage(messageId)`** rejects non-approved drafts, sends email first, then sets the message to `SENT` after SMTP acceptance. SMTP acceptance is not proof of inbox delivery, and the SMTP operation plus database update is not one atomic transaction.
- **`emailService.verify()` / `send()`** check SMTP readiness and send through Nodemailer. Without SMTP configuration, send fails rather than recording a message as sent.
- **`ResponseAnalysisService.processInboundResponse()`** classifies reply text with keyword heuristics, stores the response, updates the lead/conversation status, records memory, and rescales the lead. It is deterministic but can misread context.
- **`LeadMemoryService.getLeadTimeline(leadId)`** assembles timeline events for the UI.

### Analytics and optional integrations

- **`AnalyticsService.getManagerDashboard()`** builds manager funnel/outreach/queue metrics.
- **`AnalyticsService.getSalespersonLead360(leadId)`** assembles one lead’s profile, score, signals, research, outreach, history, and trace.
- **`supabaseStorage`** can store screenshots/log artifacts remotely when configured; local screenshot storage is the fallback.
- **`browserService`**, `pageSetup.ts`, and `somGrounding.ts` provide Playwright setup, browser search/scraping helpers, and Set-of-Mark visual grounding. They are not a continuously running browser agent and are not the primary import-to-outreach path.

## Evaluation and useful commands

From `backend/`:

```bash
npm run dev             # Start the API in watch mode
npm run build           # Compile TypeScript
npm run typecheck        # Type-check without emitting files
npm run evals            # Run qualification evaluation; outreach tier may skip without DB/Gemini
npm run smoke            # Run the DB-backed smoke pipeline
npx prisma studio        # Inspect local database records
```

The Tier 1 qualification evaluation needs no database, network, or model key. Tier 2 outreach evaluation requires PostgreSQL data and `GEMINI_API_KEY`. The authored qualification dataset is regression coverage, not a production-wide accuracy guarantee.

## Suggested code-reading order

1. `src/server.ts` — understand startup.
2. `src/http/routes/leadflowRoutes.ts` — see how HTTP requests enter domain modules.
3. `src/modules/companies/discoveryService.ts` and `src/modules/leads/qualificationService.ts` — understand ingestion and ICP rules.
4. `src/modules/jobs/queueService.ts` — follow the asynchronous pipeline and trace.
5. `src/modules/leads/scoringService.ts`, `src/modules/research/researchAgentService.ts`, and `src/modules/outreach/personalizationService.ts` — see scoring and model-assisted stages.
6. `src/modules/outreach/reviewService.ts`, `src/modules/outreach/emailService.ts`, and `src/modules/replies/responseAnalysisService.ts` — follow approval, delivery, and reply handling.
7. `prisma/schema.prisma` — connect service records to database tables.

## Important boundaries to remember

- The API currently has no authentication or authorization middleware; schema organization fields do not by themselves provide tenant isolation.
- The queue worker runs inside the API process and is intended for a single-node setup.
- AI provenance says whether an output used a model or a fallback; it does not prove that research claims are true.
- Reply classification uses keyword rules. SMTP acceptance confirms server handoff, not final inbox delivery.
