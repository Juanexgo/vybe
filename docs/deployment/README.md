# Deployment runbook

No cloud deployment is claimed. Account credentials, chosen plans, custom domains and production budgets remain operator decisions. Validate costs; services are not assumed free.

## Frontend and real-time routing

Vercel: use apps/web as the Next.js project, Node 24, workspace installation and API_INTERNAL_URL at build/runtime. For direct WebSockets use NEXT_PUBLIC_PARTY_WS_URL=wss://api.example.com/api/party-socket at build time. Use trusted sibling custom subdomains, COOKIE_DOMAIN=.example.com, COOKIE_SECURE=true, and PUBLIC_URL equal to the exact HTTPS frontend origin. Do not use unrelated default provider domains for shared cookies. Node-hosted Next.js supports the local same-origin upgrade proxy. Test actual HTTPS login, CSRF, media and WSS before opening public traffic.

## Backend, data and workers

Render/Railway: build apps/api/Dockerfile with apps/api context, Java 21, PORT and readiness /actuator/health/readiness. Provide JDBC DATABASE_URL with TLS, user/password, SMTP credentials, PUBLIC_URL and cookie settings. Use nearby regions and an appropriate memory/connection budget. Neon requires the vector extension for migration V4 and the pinned 384-dimensional embedding model. Back up/branch before Flyway migrations; never edit applied migrations or run Flyway clean on production.

Redis must support TCP Pub/Sub, not only REST. Configure REDIS_HOST/PORT/PASSWORD/TLS; Upstash plan capabilities must match this requirement. Keep FastAPI private, configure AI_INTERNAL_KEY on both services and persistent writable model storage. R2/S3 buckets stay private with least-privilege worker/API credentials. Public media uploads and CDN delivery require validation against host body/time limits; local proxy evidence does not prove hosted capacity.

Kafka requires a reachable broker, KAFKA_ENABLED=true and KAFKA_BOOTSTRAP_SERVERS. Supply broker authentication through Spring Kafka properties when hosted. Normal API operations continue to write durable outbox events during broker outages. Choose production replication/retention explicitly.

## Monitoring and release

Replace the local METRICS_TOKEN in both API and Prometheus, configure TRACING_ENABLED and the authenticated OTel collector, and set a private Grafana password. Bundled trace export is diagnostic logging; select retained tracing storage if required.

Run CI, validate backup restoration, SMTP delivery, cookie/CSRF/revocation behavior, WebSocket origin rejection, media transfer and monitoring ingestion on the deployment domain. Deploy additive backend/schema changes before frontend updates. Roll back application images to a compatible version; do not automatically reverse schema migrations or restore production data.
