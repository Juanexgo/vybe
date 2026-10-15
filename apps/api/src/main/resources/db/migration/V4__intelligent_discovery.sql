CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE content ADD COLUMN search_document tsvector GENERATED ALWAYS AS (setweight(to_tsvector('english',title),'A') || setweight(to_tsvector('english',synopsis),'B')) STORED;
CREATE INDEX catalog_text_search ON content USING gin(search_document);
CREATE TABLE content_embeddings(content_id uuid PRIMARY KEY REFERENCES content ON DELETE CASCADE, embedding vector(384) NOT NULL, model varchar(150) NOT NULL, source_hash varchar(64) NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX content_vector_search ON content_embeddings USING hnsw(embedding vector_cosine_ops);
CREATE TABLE ratings(profile_id uuid REFERENCES profiles ON DELETE CASCADE, content_id uuid REFERENCES content ON DELETE CASCADE, score int NOT NULL CHECK(score BETWEEN 1 AND 5), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(profile_id,content_id));
CREATE TABLE recommendation_feedback(profile_id uuid REFERENCES profiles ON DELETE CASCADE,content_id uuid REFERENCES content ON DELETE CASCADE,hidden boolean NOT NULL DEFAULT true,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(profile_id,content_id));
CREATE TABLE profile_preferences(profile_id uuid REFERENCES profiles ON DELETE CASCADE,genre_id int REFERENCES genres ON DELETE CASCADE,weight int NOT NULL CHECK(weight BETWEEN -3 AND 3),PRIMARY KEY(profile_id,genre_id));
CREATE TABLE search_history(id uuid PRIMARY KEY,profile_id uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,query varchar(300) NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX search_history_recent ON search_history(profile_id,created_at DESC);

ALTER TABLE profiles ADD COLUMN recommendation_reset_at timestamptz NOT NULL DEFAULT '-infinity';
