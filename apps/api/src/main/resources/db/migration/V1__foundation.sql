CREATE TABLE users (
 id uuid PRIMARY KEY, email varchar(254) NOT NULL UNIQUE, password_hash varchar(100) NOT NULL,
 verified boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE roles (name varchar(30) PRIMARY KEY);
INSERT INTO roles VALUES ('USER'),('CONTENT_MANAGER'),('ADMIN');
CREATE TABLE user_roles (user_id uuid REFERENCES users ON DELETE CASCADE, role varchar(30) REFERENCES roles, PRIMARY KEY(user_id,role));
CREATE TABLE profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, name varchar(40) NOT NULL, color varchar(7) NOT NULL DEFAULT '#b8e87c', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,name));
CREATE INDEX profiles_owner ON profiles(user_id);
CREATE TABLE auth_tokens (token_hash varchar(64) PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, purpose varchar(12) NOT NULL CHECK(purpose IN ('VERIFY','RESET')), expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE mail_outbox (id uuid PRIMARY KEY, recipient varchar(254) NOT NULL, subject text NOT NULL, body text NOT NULL, attempts int NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX mail_pending ON mail_outbox(available_at) WHERE sent_at IS NULL;
CREATE TABLE rate_limits (bucket varchar(128) PRIMARY KEY, hits int NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE audit_logs (id bigserial PRIMARY KEY, actor varchar(254), action varchar(80) NOT NULL, target varchar(254), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE content (
 id uuid PRIMARY KEY, slug varchar(120) NOT NULL UNIQUE, title varchar(160) NOT NULL,
 kind varchar(10) NOT NULL CHECK(kind IN ('MOVIE','SERIES')), synopsis varchar(3000) NOT NULL,
 release_year int NOT NULL CHECK(release_year BETWEEN 1888 AND 2200), duration_minutes int CHECK(duration_minutes > 0),
 language varchar(40) NOT NULL, rating varchar(20) NOT NULL, artwork varchar(200) NOT NULL,
 accent varchar(7) NOT NULL, published boolean NOT NULL DEFAULT false, featured boolean NOT NULL DEFAULT false,
 attribution text NOT NULL, source_url varchar(500) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX catalog_published ON content(published,release_year DESC,id);
CREATE TABLE movies (content_id uuid PRIMARY KEY REFERENCES content ON DELETE CASCADE);
CREATE TABLE series (content_id uuid PRIMARY KEY REFERENCES content ON DELETE CASCADE);
CREATE TABLE seasons (id uuid PRIMARY KEY, series_id uuid NOT NULL REFERENCES series(content_id) ON DELETE CASCADE, number int NOT NULL CHECK(number>0), UNIQUE(series_id,number));
CREATE TABLE episodes (id uuid PRIMARY KEY, season_id uuid NOT NULL REFERENCES seasons ON DELETE CASCADE, number int NOT NULL CHECK(number>0), title varchar(160) NOT NULL, synopsis text NOT NULL, duration_minutes int NOT NULL CHECK(duration_minutes>0), UNIQUE(season_id,number));
CREATE TABLE genres (id serial PRIMARY KEY, name varchar(60) NOT NULL UNIQUE);
CREATE TABLE content_genres (content_id uuid REFERENCES content ON DELETE CASCADE, genre_id int REFERENCES genres, PRIMARY KEY(content_id,genre_id));
CREATE INDEX genre_content ON content_genres(genre_id,content_id);
CREATE TABLE people (id uuid PRIMARY KEY, name varchar(160) NOT NULL);
CREATE TABLE credits (content_id uuid REFERENCES content ON DELETE CASCADE, person_id uuid REFERENCES people, job varchar(60) NOT NULL, PRIMARY KEY(content_id,person_id,job));
CREATE TABLE collections (id uuid PRIMARY KEY, name varchar(100) NOT NULL UNIQUE, description text NOT NULL);
CREATE TABLE collection_items (collection_id uuid REFERENCES collections ON DELETE CASCADE, content_id uuid REFERENCES content ON DELETE CASCADE, position int NOT NULL, PRIMARY KEY(collection_id,content_id));
CREATE TABLE watchlists (id uuid PRIMARY KEY, profile_id uuid NOT NULL REFERENCES profiles ON DELETE CASCADE, name varchar(80) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(profile_id,name));
CREATE TABLE watchlist_items (watchlist_id uuid REFERENCES watchlists ON DELETE CASCADE, content_id uuid REFERENCES content ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(watchlist_id,content_id));
CREATE TABLE spring_session (primary_id char(36) PRIMARY KEY, session_id char(36) NOT NULL, creation_time bigint NOT NULL, last_access_time bigint NOT NULL, max_inactive_interval int NOT NULL, expiry_time bigint NOT NULL, principal_name varchar(100));
CREATE UNIQUE INDEX spring_session_ix1 ON spring_session(session_id);
CREATE INDEX spring_session_ix2 ON spring_session(expiry_time);
CREATE INDEX spring_session_ix3 ON spring_session(principal_name);
CREATE TABLE spring_session_attributes (session_primary_id char(36) REFERENCES spring_session(primary_id) ON DELETE CASCADE, attribute_name varchar(200), attribute_bytes bytea NOT NULL, PRIMARY KEY(session_primary_id,attribute_name));
