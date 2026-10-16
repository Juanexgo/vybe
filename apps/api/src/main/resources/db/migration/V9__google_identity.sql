CREATE TABLE external_identities (
 provider varchar(32) NOT NULL,
 subject varchar(255) NOT NULL,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(provider,subject),
 UNIQUE(user_id,provider)
);
