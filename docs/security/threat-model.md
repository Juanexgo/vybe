# Security boundary and operational requirements

- BCrypt cost 12; minimum password 12 characters, maximum 64 characters / 72 UTF-8 bytes. Unicode passwords over the bcrypt byte limit are rejected explicitly.
- Verification required before login. Verification/reset tokens have 256 bits of randomness, are stored as hashes and expire in 30 minutes. Tokens travel in URL fragments, then POST bodies, avoiding HTTP access logs and referrers.
- HTTP-only, SameSite=Lax sessions with seven-day inactivity timeout. Enable COOKIE_SECURE=true behind HTTPS. Login rotates session ID and CSRF token; reset revokes every session for that email. No tokens in localStorage.
- Spring Security protects catalog administration. New accounts only receive USER; administrator bootstrap is an explicit operator action. Role changes require session revocation or re-login because roles are session snapshots.
- CSRF is required on mutations, including login and logout. Browser API access is same origin through Next.js. CSRF cookie is intentionally readable; it is not an authentication credential.
- Shared database-backed rate limits on credential, registration and token endpoints. Requests through the web proxy share an IP bucket unless a trusted ingress strategy is configured; account-specific limits supplement that bucket. Do not blindly trust X-Forwarded-For.
- Profile ownership is checked on every library operation. Profile creation locks the account row to enforce the five-profile limit under concurrency.
- SQL is parameterized. User descriptions render as text. Public catalog excludes drafts. Server secrets never use NEXT_PUBLIC variables.
- Logs have generated correlation IDs. Authentication, catalog creation, edits and visibility changes create audit records. Log no passwords, cookies or raw tokens. Access to mail storage must be restricted because pending mail contains one-time links.
- The local compose password and Mailpit inbox are development-only. Production needs real SMTP, managed secrets, backups, TLS, bounded ingress requests and administrative access controls.
- Baseline CSP permits inline Next.js bootstrap scripts and development eval; tighten to per-request nonces and remove unsafe-eval before a commercial launch. No third-party scripts are loaded.
- This is a portfolio foundation, not a completed security audit or commercial service. No DRM is implemented; commercial DRM requires licensed providers and a media entitlement design in phase 2.
