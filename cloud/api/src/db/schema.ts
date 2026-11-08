import { pgTable, uuid, text, integer, boolean, timestamp, customType } from 'drizzle-orm/pg-core'

/** PostgreSQL bytea ↔ Node Buffer */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea'
})

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  username: text('username').unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  plan: text('plan').notNull().default('free'), // 'free' | 'pro' | 'team'
  maxProfiles: integer('max_profiles').notNull().default(3),
  totpSecret: text('totp_secret'),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  totpBackupCodes: text('totp_backup_codes'),
  activeTeamOwnerId: uuid('active_team_owner_id'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

/** Synced profile documents — the full Brandinbold Profile JSON. */
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(), // client-generated id (Brandinbold profile.id)
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
  os: text('os').notNull().default('macos'),
  json: text('json').notNull(), // full Profile document
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
  pinned: boolean('pinned').notNull().default(false),
  color: text('color'),
  description: text('description'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

export const proxies = pgTable('proxies', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  json: text('json').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

/** Roaming session archives: the vital profile files (cookies, sessionstore,
 *  places), gzip-tarred by the desktop app. One archive per profile. */
export const sessionArchives = pgTable('session_archives', {
  profileId: uuid('profile_id').primaryKey(),
  userId: uuid('user_id').notNull(),
  data: bytea('data').notNull(),
  size: integer('size').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})

/** STEP 5: Team members & invitations */
export const teamMembers = pgTable('team_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull(),
  memberUserId: uuid('member_user_id'),
  email: text('email').notNull(),
  role: text('role').notNull().default('member'), // 'admin' | 'member' | 'viewer'
  status: text('status').notNull().default('pending'), // 'pending' | 'active' | 'revoked' | 'expired'
  inviteToken: text('invite_token'),
  inviteExpiresAt: timestamp('invite_expires_at', { withTimezone: true }),
  invitedByUserId: uuid('invited_by_user_id'),
  joinedAt: timestamp('joined_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

/** STEP 5: Team activity & security audit log */
export const teamActivity = pgTable('team_activity', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull(),
  actorUserId: uuid('actor_user_id'),
  actorEmail: text('actor_email').notNull(),
  actorName: text('actor_name').notNull(),
  action: text('action').notNull(),
  target: text('target'),
  detail: text('detail'),
  ip: text('ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})
