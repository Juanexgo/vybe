# API surface

All mutation endpoints require X-XSRF-TOKEN (get token from GET /api/auth/csrf) and the same-origin cookie session where authenticated. Errors use HTTP status codes and a problem detail message. UUIDs and DTO inputs are validated.

| Route | Method | Access | Purpose |
|---|---|---|---|
| /api/auth/csrf | GET | Public | Establish CSRF token |
| /api/auth/register | POST | Public, limited | Queue verification mail |
| /api/auth/verify | POST | Public, limited | Consume verification token |
| /api/auth/login | POST | Public, limited | Rotate session and authenticate |
| /api/auth/forgot | POST | Public, limited | Queue reset email |
| /api/auth/reset | POST | Public, limited | Consume token, revoke sessions |
| /api/auth/me | GET | User | Email and authorities |
| /api/auth/logout | POST | User | Invalidate session |
| /api/catalog | GET | Public | q, genre, kind, page filters |
| /api/catalog/genres | GET | Public | Genre names |
| /api/catalog/{slug} | GET | Public | Metadata, credits, episodes |
| /api/profiles | GET, POST | User | Own viewing identities |
| /api/profiles/{id}/library | GET | Owner | Saved titles |
| /api/profiles/{id}/library/{content} | PUT, DELETE | Owner | Idempotent save/remove |
| /api/admin/content | GET, POST | Admin / Content manager | List metadata, create draft |
| /api/admin/content/{id} | GET, PUT | Admin / Content manager | Read/edit metadata |
| /api/admin/content/{id}/visibility | PATCH | Admin / Content manager | Publish/unpublish |
| /v3/api-docs, /swagger-ui/index.html | GET | Admin | OpenAPI and interactive reference |
| /actuator/health/readiness | GET | Public | Readiness |
| /actuator/prometheus | GET | Admin | Real runtime measurements |

Search in phase 1 is literal substring matching with SQL LIKE metacharacters escaped, plus exact metadata filters. Hybrid semantic ranking is explicitly phase 3.
