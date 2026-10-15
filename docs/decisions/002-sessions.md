# ADR 002: Same-origin cookie sessions

Accepted. Revocable Spring Session JDBC sessions remove browser token storage and refresh-token complexity. Cookies are HTTP-only and SameSite=Lax, Secure in production. Mutations require CSRF tokens. PostgreSQL rate buckets provide shared enforcement across instances without adding Redis to phase 1. Rate keys hash the untrusted login identifier; source-IP limits supplement account limits. Trust proxy address headers only after defining and testing the ingress boundary. Redis is reserved for later cache/presence workloads.
