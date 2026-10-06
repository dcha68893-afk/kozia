CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  google_subject TEXT UNIQUE,
  coins BIGINT NOT NULL DEFAULT 500 CHECK (coins >= 0),
  gems BIGINT NOT NULL DEFAULT 0 CHECK (gems >= 0),
  tickets INT NOT NULL DEFAULT 3 CHECK (tickets >= 0),
  xp BIGINT NOT NULL DEFAULT 0,
  reputation INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  games INT NOT NULL DEFAULT 0,
  streak INT NOT NULL DEFAULT 0,
  best_streak INT NOT NULL DEFAULT 0,
  appearance JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_daily TIMESTAMPTZ,
  role TEXT NOT NULL DEFAULT 'player',
  banned_until TIMESTAMPTZ,
  ban_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_xp_idx ON users (xp DESC);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price_coins INT NOT NULL DEFAULT 0,
  price_gems INT NOT NULL DEFAULT 0,
  min_level INT NOT NULL DEFAULT 1,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS inventory (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items(id),
  equipped BOOLEAN NOT NULL DEFAULT false,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS friendships (
  user_a UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);

CREATE TABLE IF NOT EXISTS blocks (
  blocker UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker, blocked)
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  sender UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_pair_idx ON messages (sender, recipient, id DESC);

CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  reporter UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  context TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_results (
  id BIGSERIAL PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round_no INT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'round',
  won BOOLEAN NOT NULL DEFAULT false,
  coins INT NOT NULL DEFAULT 0,
  xp INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS game_results_match_once ON game_results (room_id, user_id, round_no, kind);
CREATE INDEX IF NOT EXISTS game_results_user_time ON game_results (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tournaments (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  entry_tickets INT NOT NULL DEFAULT 1,
  prizes JSONB NOT NULL DEFAULT '[1000,500,250]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS tournament_entries (
  tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0,
  games INT NOT NULL DEFAULT 0,
  PRIMARY KEY (tournament_id, user_id)
);

CREATE TABLE IF NOT EXISTS achievements (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);


CREATE TABLE IF NOT EXISTS game_action_events (
  id BIGSERIAL PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  action TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  accepted BOOLEAN NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(room_id,user_id,seq)
);
CREATE INDEX IF NOT EXISTS game_action_events_room_time ON game_action_events(room_id,created_at DESC);

CREATE TABLE IF NOT EXISTS suspicious_game_actions (
  id BIGSERIAL PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  strikes INT NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS suspicious_game_actions_user_time ON suspicious_game_actions(user_id,created_at DESC);
