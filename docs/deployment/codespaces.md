# Full V1 in GitHub Codespaces (test environment)

This uses the full app, not a static export. Two CPU cores are the initial target. The devcontainer installs Docker and builds services sequentially. PostgreSQL, private S3-compatible development storage, Kafka and model files use Docker volumes. Deleting/rebuilding environments can lose test data: preserve needed backups first.

The free quota is shared with other Codespaces and includes both compute and storage. Confirm remaining quota and a zero paid-spending budget before creation. Set a 15-minute idle timeout and stop the environment after testing. A stopped environment still uses storage; deleting it frees that storage but deletes its local data.

Only forward 3000 publicly for app testing. Port 8025 must stay private: Mailpit holds verification/reset links. Email capture validates account flows but is not real email delivery. Do not expose PostgreSQL, Redis, Kafka, storage, API admin metrics or Grafana. Use the 3000 HTTPS URL, not the embedded IDE origin.

Startup: bash infrastructure/codespaces/start.sh. Resume: bash infrastructure/codespaces/resume.sh. The first script seeds only catalog metadata and original artwork; upload your own short video to test playback. Register, open the private Mailpit URL to verify, then run infrastructure/scripts/grant-admin.sh with your verified email when explicitly granting administrator access.

Deployment status: prepared locally; not yet remotely built or tested. After startup verify login/CSRF, HLS/audio/subtitles, profiles/lists, AI readiness, rooms across two browser sessions, permissions and events. Do not claim cloud functionality until those checks pass. GitHub Codespaces is a temporary development environment, not permanent production hosting.
