-- [ST0014] The cloud pig's tables (Cloudflare D1, i.e. SQLite).
-- Apply with: npx wrangler d1 execute piggy --remote --file server/schema.sql
-- Every statement is idempotent, so applying it twice is harmless.

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

-- One row per device key. A device signs every request; revoking it is the
-- only way to log it out.
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS devices_account ON devices (account_id);

-- The one live login code per address; only its hash is kept.
CREATE TABLE IF NOT EXISTS codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

-- Sends and failed checks, counted for rate limits and the IP freeze.
CREATE TABLE IF NOT EXISTS auth_events (
  ip_key TEXT NOT NULL,
  email TEXT,
  kind TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_events_ip ON auth_events (ip_key, kind, at);
CREATE INDEX IF NOT EXISTS auth_events_email ON auth_events (email, kind, at);

-- Nonces seen in the last few minutes, so a captured request cannot be replayed.
CREATE TABLE IF NOT EXISTS nonces (
  device_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (device_id, nonce)
);

-- The authoritative pig of each account, as the server last settled it.
CREATE TABLE IF NOT EXISTS pigs (
  account_id TEXT PRIMARY KEY,
  rev INTEGER NOT NULL,
  state TEXT,
  last_at INTEGER NOT NULL,
  last_feed_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  -- random per write: the op log rows of a write only land if the write did
  token TEXT NOT NULL
);

-- Every op a device sent and what became of it (kept 30 days, for debugging).
CREATE TABLE IF NOT EXISTS ops (
  account_id TEXT NOT NULL,
  id TEXT NOT NULL,
  rev INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  op TEXT NOT NULL,
  ok INTEGER NOT NULL,
  reason TEXT,
  PRIMARY KEY (account_id, id)
);
CREATE INDEX IF NOT EXISTS ops_age ON ops (at);
