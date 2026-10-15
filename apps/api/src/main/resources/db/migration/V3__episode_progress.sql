ALTER TABLE media_assets ADD COLUMN episode_id uuid REFERENCES episodes ON DELETE CASCADE;
CREATE INDEX media_episode ON media_assets(episode_id,status,created_at DESC);
CREATE TABLE asset_progress (profile_id uuid REFERENCES profiles ON DELETE CASCADE, asset_id uuid REFERENCES media_assets ON DELETE CASCADE, position_seconds double precision NOT NULL CHECK(position_seconds>=0), completed boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(profile_id,asset_id));
CREATE INDEX asset_progress_recent ON asset_progress(profile_id,updated_at DESC);
INSERT INTO asset_progress(profile_id,asset_id,position_seconds,completed,updated_at) SELECT p.profile_id,m.id,p.position_seconds,p.completed,p.updated_at FROM watch_progress p JOIN LATERAL (SELECT id FROM media_assets WHERE content_id=p.content_id AND status='READY' ORDER BY created_at DESC LIMIT 1) m ON true;
