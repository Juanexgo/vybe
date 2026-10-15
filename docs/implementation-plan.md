# V1 release scope

Web V1 includes phases 1–5: identity/catalog; media; discovery/recommendations; social rooms/group matching; events/analytics/observability. Profile editing, collaborative lists and content/user/artwork/collection administration are included. SwiftUI is reserved for a later release.

Release checks: Maven integration tests including real Kafka delivery/idempotency/DLT; web typecheck/build/unit tests; actual FFmpeg and film/episode upload pipeline; browser authentication/catalog/playback/audio/subtitles/rooms/lists/preferences/admin/collections. Current evidence is in verification.md.

Hosting validation is separate: Docker daemon, provider accounts/custom domains, HTTPS cookies and WSS, media upload/CDN limits, SMTP, monitoring ingestion and backup restoration must be validated before public launch.
