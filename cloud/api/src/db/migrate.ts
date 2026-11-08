/** Idempotent DDL executed at boot — keeps Railway deployments self-migrating
 *  without a separate drizzle-kit step. */
export const MIGRATION_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  plan text NOT NULL DEFAULT 'free',
  max_profiles integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  os text NOT NULL DEFAULT 'macos',
  json text NOT NULL,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profiles_user_idx ON profiles(user_id);

CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  color text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS groups_user_idx ON groups(user_id);

CREATE TABLE IF NOT EXISTS proxies (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  json text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proxies_user_idx ON proxies(user_id);

CREATE TABLE IF NOT EXISTS session_archives (
  profile_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data bytea NOT NULL,
  size integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Step B: newer-wins + tombstones for groups/proxies (idempotent)
ALTER TABLE groups ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE groups ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE proxies ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE proxies ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Step 1: username + TOTP 2FA on users (idempotent)
ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON users(username) WHERE username IS NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_backup_codes text;

-- Step 5: Team management (members, expiring invites, roles, activity audit log)
ALTER TABLE users ADD COLUMN IF NOT EXISTS active_team_owner_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'pending',
  invite_token text,
  invite_expires_at timestamptz,
  invited_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  joined_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_members_owner_idx ON team_members(owner_id);
CREATE INDEX IF NOT EXISTS team_members_user_idx ON team_members(member_user_id);
CREATE INDEX IF NOT EXISTS team_members_email_idx ON team_members(email);
CREATE UNIQUE INDEX IF NOT EXISTS team_members_token_idx ON team_members(invite_token) WHERE invite_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS team_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_email text NOT NULL,
  actor_name text NOT NULL,
  action text NOT NULL,
  target text,
  detail text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_activity_owner_idx ON team_activity(owner_id, created_at DESC);
`
