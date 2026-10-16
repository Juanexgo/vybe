#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${CODESPACE_NAME:?Open the Codespaces terminal to configure Google}"
export PUBLIC_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
if [[ -z "${GOOGLE_CLIENT_ID:-}" ]]; then read -r -p 'Google client ID: ' GOOGLE_CLIENT_ID; fi
if [[ -z "${GOOGLE_CLIENT_SECRET:-}" ]]; then read -r -s -p 'Google client secret (hidden): ' GOOGLE_CLIENT_SECRET; printf '\n'; fi
[[ "$GOOGLE_CLIENT_ID" =~ ^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$ ]] || { printf 'Invalid Google client ID.\n' >&2; exit 1; }
[[ "$GOOGLE_CLIENT_SECRET" =~ ^[A-Za-z0-9_-]+$ ]] || { printf 'Invalid Google client secret.\n' >&2; exit 1; }
umask 077
if [[ -L .env.oauth ]]; then printf 'Refusing a symlink for the secret file.\n' >&2; exit 1; fi
printf 'GOOGLE_CLIENT_ID=%s\nGOOGLE_CLIENT_SECRET=%s\n' "$GOOGLE_CLIENT_ID" "$GOOGLE_CLIENT_SECRET" > .env.oauth
chmod 600 .env.oauth
unset GOOGLE_CLIENT_SECRET
docker compose -f docker-compose.yml -f compose.codespaces.yml up -d --no-deps api
printf 'Google configured. Wait for API startup, then reload /login.\n'
