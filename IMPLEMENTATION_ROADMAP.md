# Implementation Roadmap

Updated: 2025-10-18

This roadmap captures the planned evolution of the MockInterview backend based on recent work and near-term goals. It’s designed to be pragmatic: concrete deliverables, acceptance criteria, and low-risk sequencing.

## Scope and guiding principles

- Keep the core interview/chat loop reliable and fast.
- Favor small, reversible changes and strong observability.
- Maintain a stable data model for resumes, chunks, and conversations with explicit migrations and backfills.
- Build toward future HR/Agent integrations without blocking current UX.

## Current state (baseline)

- Vector search: PostgreSQL + pgvector with cosine ops; embeddings are 768-dim.
- Embeddings: Custom Google GenAI SDK wrapper using `gemini-embedding-001` with `outputDimensionality=768`.
- Resume ingestion: Per-chunk embedding; filters empty chunks; trigger auto-populates `resume_id` and `chunk_index` from metadata on insert.
- Schema: Consolidated migration creates `user_profiles`, `resumes` (UNIQUE per user, file_name), `resume_chunks` (vector(768)), indexes, and triggers.
- Duplicate protection: Reject duplicate filename per user (409) in upload route.
- ID hygiene: Services consistently use internal numeric user IDs; Firebase UID is resolved to internal ID where needed.
- Chat stability: Avoids empty embedding requests in similarity search.

References: [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) · [MIGRATIONS_GUIDE.md](./MIGRATIONS_GUIDE.md) · [RESUME_UPLOAD_API.md](./RESUME_UPLOAD_API.md) · [RESUME_CHUNK_API.md](./RESUME_CHUNK_API.md) · [RESUME_CHUNKS_SCHEMA.md](./RESUME_CHUNKS_SCHEMA.md) · [USER_PROFILE_README.md](./USER_PROFILE_README.md) · [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) · [API_TESTING_EXAMPLES.md](./API_TESTING_EXAMPLES.md) · [PDF_STORAGE_GUIDE.md](./PDF_STORAGE_GUIDE.md) · [ARCHITECTURE_DIAGRAMS.md](./ARCHITECTURE_DIAGRAMS.md)

## Near term (Sprint 1–2)

1. Start chat: prefer explicit resume

   - Goal: In the `/start` chat flow, use `resume_id` if provided; otherwise fall back to the user's primary resume.
   - Acceptance criteria:
     - With `resume_id` param: conversation context uses that resume’s chunks.
     - Without param: primary resume is resolved via internal user ID; context loads.
     - 200 responses include which resume was selected in metadata/logs.
   - Notes: Validate route/controller parsing and ensure `ResumeContextService` is used for fallback.

1. E2E smoke tests for core loop

   - Goal: Cover upload → embed → start chat → context injection.
   - Acceptance criteria:
     - Test creates a user, uploads a small PDF, verifies 768-dim embeddings stored, and runs a similarity search.
     - Test asserts duplicate filename returns 409.
     - Test asserts empty chat query does not call embeddings and returns gracefully.

1. Operational hardening and observability

   - Goal: Add structured logs and minimal metrics.
   - Acceptance criteria:
     - Log chunk counts and embedding durations per upload.
     - Log selected resume id on chat start.
     - Basic counters: uploads by status, embeddings by status, similarity search calls and durations.

## Mid term (1–2 months)

1. JD-resume matching service

   - Goal: Add service and endpoints to score a resume vs. a job description.
   - Deliverables:
     - `JobDescriptionService` enhancements for normalized JD parsing.
     - Matching API: accepts JD text/url and resume_id; returns top strengths/gaps and overall fit score.
     - Caching layer keyed by (user_id, resume_id, jd_hash).
   - Acceptance criteria: Deterministic results for the same inputs; latency under ~1s for cached; under ~3s uncached.

1. Conversation memory improvements

   - Goal: Persist a concise conversation summary per thread to reduce token usage.
   - Deliverables:
     - Summarization step at thread close or every N messages.
     - Retrieval merges summary + top-k chunk context.

1. Admin and diagnostics

   - Goal: Add admin endpoints/dashboards for debugging.
   - Deliverables: List resumes and chunk counts per user, last embed time, duplicate detections, and recent errors.

## Longer term (foundation for agents/HR)

1. HR/Agent integrations (phased)

   - Email agent (outreach templates, follow-ups)
   - Calendar agent (scheduling links, timezone handling)
   - Slack/notifications agent (interview reminders, status updates)
   - Doc generation agent (tailored cover letters, interview prep docs)
   - Architecture: Prefer MCP-style adapters per system; isolate credentials and scopes.

1. Multi-source context

   - Aggregate context from resume + JD + interviewer guidelines + user preferences.
   - Implement context ranking and freshness policies.

## Data model and migrations

- Keep `resume_chunks.embedding` at `vector(768)` unless a strong reason demands change; enforce via SDK configuration.
- Use triggers to bridge vector store insert patterns to relational needs (e.g., metadata → `resume_id`, `chunk_index`).
- For future schema changes, add new migrations and avoid destructive edits to the consolidated file.

## Testing strategy

- Unit: chunk filtering, embedding wrapper dimension checks, duplicate detection queries.
- Integration: vector insert/read path, similarity search with known fixtures.
- E2E: user -> upload -> chat -> context; failure paths (duplicate, empty query).
- Performance: baseline embedding throughput and search latency; track regressions.

## Rollout and ops

- Dev: docker-compose, ephemeral DB, `npm run migrate`.
- Stage: dedicated DB with pgvector; seed minimal test users; feature flags for new flows.
- Prod: canary uploads; error budget and alerting for embedding failures and migration drift.
- Cache hygiene: Flush Redis on destructive schema resets; add TTLs where safe.

## Risks and mitigations

- Embedding model/SDK changes dimension: enforce `outputDimensionality=768`, add runtime asserts.
- Empty/low-signal chunks: continue filtering; add minimum token thresholds.
- Duplicate uploads by user: maintained 409 policy; consider “replace” flow later behind a flag.
- Schema drift in long-lived environments: run migrations in CI; detect pending/failed migrations at startup.

## Open decisions

- Replacement strategy for duplicate filenames (reject vs. overwrite vs. versioning).
- Standard K for similarity search by route (chat vs. JD matching).
- Cache TTLs for resumes and chunks.

## Ownership and cadence

- Release train: bi-weekly sprints targeting one user-facing improvement plus reliability tasks.
- Owners: Backend team (services, DB), AI/ML (embeddings/tuning), Platform (ops/observability).

## Quick links

- Resume upload API: [RESUME_UPLOAD_API.md](./RESUME_UPLOAD_API.md)
- Chunk schema: [RESUME_CHUNKS_SCHEMA.md](./RESUME_CHUNKS_SCHEMA.md)
- Migrations guide: [MIGRATIONS_GUIDE.md](./MIGRATIONS_GUIDE.md)
- Implementation summary: [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
