# ADR 004 — Private S3 storage and leased FFmpeg jobs

Status: accepted for the first playable release.

Keep metadata, authorization, playback sessions and progress in the Java modular monolith. Run FFmpeg in a separate least-privileged Python worker because encoding has different CPU and lifecycle needs. PostgreSQL jobs use row locking, SKIP LOCKED, bounded lease recovery and attempt-specific object prefixes. Only the worker holding the lease can atomically publish READY output.

Originals and HLS objects are private. A session-authenticated Java streaming endpoint checks content publication and serves a strict relative-path allowlist. This is equivalent access control for the initial deployment, not DRM. It is less scalable than signed CDN delivery; move segment delivery to short-lived signed URLs before commercial traffic.

Explicit admin retry follows an observed failure. Worker crashes can be reclaimed after the lease expires, with at most three crash recovery attempts. Failed partial uploads are cleaned up; orphan cleanup after storage/DB outages remains operational work. Kafka is deferred to the event phase.
