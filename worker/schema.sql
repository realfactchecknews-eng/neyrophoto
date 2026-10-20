CREATE TABLE IF NOT EXISTS users (
  uid        TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  credits    INTEGER NOT NULL DEFAULT 0,
  pro_until  INTEGER NOT NULL DEFAULT 0,
  pro_month  TEXT,
  pro_used   INTEGER NOT NULL DEFAULT 0
);

-- Счётчики по суткам: ключ вида "u:<uid>", "ip:<hash>", "det:<uid>", "up:<uid>"
CREATE TABLE IF NOT EXISTS usage (
  k   TEXT NOT NULL,
  day TEXT NOT NULL,
  n   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (k, day)
);

-- Идемпотентность платежей: один charge_id начисляется один раз
CREATE TABLE IF NOT EXISTS payments (
  id         TEXT PRIMARY KEY,
  uid        TEXT,
  plan       TEXT,
  provider   TEXT NOT NULL,
  amount     INTEGER,
  raw        TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bank_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uid        TEXT NOT NULL,
  r2_key     TEXT NOT NULL,
  title      TEXT,
  mime       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bank_status ON bank_items(status, id);
