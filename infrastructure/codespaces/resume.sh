#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
export PUBLIC_URL="https://${CODESPACE_NAME:?}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:?}"
# First creation builds through postCreateCommand; resume only existing containers.
if [ -n "$(docker compose -f docker-compose.yml -f compose.codespaces.yml ps -aq)" ]; then
 docker compose -f docker-compose.yml -f compose.codespaces.yml up -d
fi
