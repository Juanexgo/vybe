ALTER TABLE watchlists ADD COLUMN invite_hash varchar(64),ADD COLUMN invite_expires_at timestamptz;
CREATE TABLE watchlist_members (watchlist_id uuid REFERENCES watchlists ON DELETE CASCADE,profile_id uuid REFERENCES profiles ON DELETE CASCADE,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(watchlist_id,profile_id));
CREATE INDEX watchlist_members_profile ON watchlist_members(profile_id,watchlist_id);
