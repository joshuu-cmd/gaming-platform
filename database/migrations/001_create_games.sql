CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY,
  game_type TEXT NOT NULL CHECK (game_type = 'connect4'),
  status TEXT NOT NULL CHECK (status IN ('waiting', 'in_progress', 'finished')),
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  state JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS games_updated_at_idx ON games (updated_at DESC);
