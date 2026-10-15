#!/usr/bin/env sh
set -eu
if [ "$#" -ne 1 ]; then echo "Usage: $0 verified-email" >&2; exit 1; fi
cd "$(dirname "$0")/../.."
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U vybe -d vybe --set=email="$1" <<'SQL'
INSERT INTO user_roles(user_id,role) SELECT id,'ADMIN' FROM users WHERE email=lower(:'email') AND verified ON CONFLICT DO NOTHING;
SQL
