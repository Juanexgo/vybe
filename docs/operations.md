# Events and observability

V8 captures media/job/playback/rating/watchlist changes into event_outbox in the same database transaction. Triggers include Python worker changes without a second event producer. Payloads omit emails, passwords, invitations and chat text. Envelopes contain id, version=1, type, aggregateId, correlationId, occurredAt and payload. Event correlation IDs are distinct from HTTP request IDs.

The publisher leases bounded batches with SKIP LOCKED, acknowledges only after Kafka confirms delivery, retries failures after 30 seconds and recovers leases after three minutes. Delivery is at least once. Consumer inbox UUIDs and counters update transactionally to prevent duplicate counting. Invalid messages retry three times and go to vybe.events.v1.DLT; failed DLT publication is not silently acknowledged. Local topics have three partitions/one replica. Configure production replication, retention and authentication separately.

Inspect event_outbox, event_inbox and event_counts to diagnose delivery. Repair the broker to drain queued events; never clear a backlog to hide failures. Inspect DLT exception headers, fix the cause and republish corrected approved messages with their original event IDs. Retain inbox IDs at least as long as corresponding Kafka events can be replayed. Archive published events only under an explicit retention policy.

Prometheus uses a dedicated bearer token on /actuator/prometheus. The bundled Grafana dashboard covers HTTP rates/errors, JVM memory, DB connections and vybe_events_pending/retrying. Readiness includes DB and Redis. Enable TRACING_ENABLED and configure the OTLP HTTP collector endpoint for distributed traces. The local collector logs diagnostic batches; no retained trace database is claimed.

Personal time is estimated from positive position movement bounded by elapsed server time, rejecting large jumps. Clearing history removes that profile's playback data. Admin storage counts original-upload bytes. Monitor disk space, failed jobs, queue age, delivery backlog, readiness and HTTP 5xx. Back up PostgreSQL and private objects and test restoration before public operation.
