CREATE TABLE IF NOT EXISTS qualified_listens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,
  day TEXT NOT NULL,
  time_bucket INTEGER NOT NULL CHECK (time_bucket BETWEEN 0 AND 3),
  track_id TEXT NOT NULL,
  listener_hash TEXT NOT NULL,
  network_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (day, time_bucket, track_id, listener_hash)
);

CREATE INDEX IF NOT EXISTS qualified_listens_month_track
  ON qualified_listens (month, track_id);

CREATE INDEX IF NOT EXISTS qualified_listens_network_day
  ON qualified_listens (network_hash, day);
