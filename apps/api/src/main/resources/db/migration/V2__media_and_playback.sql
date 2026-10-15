CREATE TABLE media_assets (
 id uuid PRIMARY KEY, content_id uuid NOT NULL REFERENCES content ON DELETE CASCADE,
 original_key varchar(300) NOT NULL UNIQUE, content_type varchar(100) NOT NULL, source_bytes bigint NOT NULL CHECK(source_bytes>0),
 status varchar(16) NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','PROCESSING','READY','FAILED')),
 manifest_key varchar(300), source_width int, source_height int, duration_seconds double precision,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_content ON media_assets(content_id,status,created_at DESC);
CREATE TABLE media_renditions (id uuid PRIMARY KEY, asset_id uuid NOT NULL REFERENCES media_assets ON DELETE CASCADE, height int NOT NULL, width int NOT NULL, bitrate int NOT NULL, manifest_key varchar(300) NOT NULL, UNIQUE(asset_id,height));
CREATE TABLE processing_jobs (id uuid PRIMARY KEY, asset_id uuid NOT NULL UNIQUE REFERENCES media_assets ON DELETE CASCADE, status varchar(16) NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','PROCESSING','READY','FAILED')), attempts int NOT NULL DEFAULT 0, lease_owner uuid, lease_until timestamptz, error varchar(1000), started_at timestamptz, finished_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX jobs_claim ON processing_jobs(status,created_at);
CREATE TABLE subtitles (id uuid PRIMARY KEY, asset_id uuid NOT NULL REFERENCES media_assets ON DELETE CASCADE, language varchar(20) NOT NULL, label varchar(60) NOT NULL, storage_key varchar(300) NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE playback_sessions (id uuid PRIMARY KEY, profile_id uuid NOT NULL REFERENCES profiles ON DELETE CASCADE, asset_id uuid NOT NULL REFERENCES media_assets ON DELETE CASCADE, started_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz);
CREATE INDEX playback_profile ON playback_sessions(profile_id,started_at DESC);
CREATE TABLE watch_progress (profile_id uuid REFERENCES profiles ON DELETE CASCADE, content_id uuid REFERENCES content ON DELETE CASCADE, position_seconds double precision NOT NULL CHECK(position_seconds>=0), completed boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(profile_id,content_id));
