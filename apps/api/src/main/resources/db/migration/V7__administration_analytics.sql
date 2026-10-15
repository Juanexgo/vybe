ALTER TABLE users ADD COLUMN disabled boolean NOT NULL DEFAULT false;
ALTER TABLE playback_sessions ADD COLUMN last_position double precision NOT NULL DEFAULT 0,ADD COLUMN watched_seconds double precision NOT NULL DEFAULT 0;
CREATE TABLE artwork_assets(id uuid PRIMARY KEY,content_id uuid NOT NULL REFERENCES content ON DELETE CASCADE,storage_key varchar(200) NOT NULL UNIQUE,bytes bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
