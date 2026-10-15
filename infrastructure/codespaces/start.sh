#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${CODESPACE_NAME:?Run this inside GitHub Codespaces}"
: "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:?Missing forwarding domain}"
export PUBLIC_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
compose=(docker compose -f docker-compose.yml -f compose.codespaces.yml)
# Sequential builds keep peak memory lower on the two-core machine.
for service in api web minio media-worker ai-service; do "${compose[@]}" build "$service"; done
"${compose[@]}" up -d
for attempt in {1..120}; do
 if curl --fail --silent http://127.0.0.1:8080/actuator/health/readiness >/dev/null; then break; fi
 sleep 2
done
curl --fail --silent http://127.0.0.1:8080/actuator/health/readiness >/dev/null
"${compose[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U vybe -d vybe < infrastructure/scripts/seed-demo.sql
printf '\nVYBE: %s\n' "$PUBLIC_URL"
printf 'Keep port 8025 PRIVATE: verification and reset emails are captured there for testing.\n'
printf 'No real SMTP delivery is configured. No administrator is created automatically.\n'
