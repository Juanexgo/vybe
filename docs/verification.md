# V1 web — verification, 2026-10-15

The web V1 scope (phases 1–5) is implemented and tested locally. SwiftUI is outside this release. Public cloud deployment is not yet completed.

## Passing checks
- Java 21 Maven package: 23 tests, zero failures/errors/skips (21 integration + 2 Kafka delivery/idempotency/dead-letter tests).
- Vitest: 5 tests passing.
- FFmpeg worker: 3 real encoding tests passing, including separate language tracks.
- Final Next.js production build and TypeScript checks passed.
- Cold startup through launch-vybe.command: PostgreSQL/Redis readiness, API, frontend, local storage, mail capture, Kafka, AI model and continuous media worker started successfully.
- Final Chrome Playwright run: 11 passed in 37.9 seconds. Covers verified registration, profiles, library/logout, catalog filters/detail, empty search, validation, mobile overflow, real decoded HLS with saved progress/audio/subtitles, episode playback, two-session synchronized parties/chat/reconnection/host permissions, collaborative lists, preferences/analytics and published curated collections.
- AI health ready with sentence-transformers/all-MiniLM-L6-v2; actual hybrid search exercised.
- Local catalog smoke benchmark: 100 requests, concurrency 5, nine titles; p50 4.39 ms, p95 13.63 ms. Not a capacity benchmark.

The player screenshot shows an original generated test pattern, not footage from catalog films. Catalog seed artwork and metadata do not imply licensed film media have been uploaded.

## Remaining deployment verification
Docker daemon was unavailable on this workstation; full Compose images/monitoring, remote CI, ARM builds, HTTPS/WSS on a public host, real SMTP delivery, backups/restoration and production capacity remain unverified. Local email tests use Mailpit. No public deployment or production readiness is claimed. Vercel project inspection succeeded but team access returned 403; no Vercel deployment was created. User requires full functionality and zero hosting spend, and will create an Oracle Cloud account before provisioning an eligible free server.
