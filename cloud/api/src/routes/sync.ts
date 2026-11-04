import { and, eq, isNull, lte, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { groups, profiles, proxies, sessionArchives, users } from '../db/schema.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Tombstone = { id: string; deletedAt: string }
export interface PushPayload {
  profiles?: any[]
  groups?: any[]
  proxies?: any[]
  /** Step B: deletions made on a device (soft tombstones, offline-queued client side). */
  deleted?: { profiles?: Tombstone[]; groups?: Tombstone[]; proxies?: Tombstone[] }
}

/**
 * Pull: live documents + tombstones so other devices can apply deletions.
 * Every document carries the SERVER-side updatedAt the client compares against.
 */
export async function pull(userId: string) {
  const [p, g, x] = await Promise.all([
    db.select().from(profiles).where(eq(profiles.userId, userId)),
    db.select().from(groups).where(eq(groups.userId, userId)),
    db.select().from(proxies).where(eq(proxies.userId, userId))
  ])
  const tomb = (rows: { id: string; deletedAt: Date | null }[]) =>
    rows.filter((r) => r.deletedAt).map((r) => ({ id: r.id, deletedAt: r.deletedAt!.toISOString() }))
  return {
    profiles: p.filter((r) => !r.deletedAt).map((r) => ({ ...JSON.parse(r.json), updatedAt: r.updatedAt.toISOString() })),
    groups: g
      .filter((r) => !r.deletedAt)
      .map((r) => ({ id: r.id, name: r.name, pinned: r.pinned, color: r.color, description: r.description, createdAt: r.createdAt, updatedAt: r.updatedAt.toISOString() })),
    proxies: x.filter((r) => !r.deletedAt).map((r) => ({ ...JSON.parse(r.json), updatedAt: r.updatedAt.toISOString() })),
    deleted: { profiles: tomb(p), groups: tomb(g), proxies: tomb(x) }
  }
}

/**
 * Newer-wins decision for one incoming document against the server row.
 *  - no row → insert
 *  - row tombstoned and the doc was NOT edited after the deletion → stays deleted
 *  - row live and newer than the doc → keep server copy
 */
function shouldApply(row: { updatedAt: Date; deletedAt: Date | null } | undefined, docT: Date): boolean {
  if (!row) return true
  if (row.deletedAt) return docT.getTime() > row.deletedAt.getTime()
  return docT.getTime() >= row.updatedAt.getTime()
}

function docTime(doc: any): Date {
  const t = new Date(doc?.updatedAt ?? Date.now())
  return Number.isNaN(t.getTime()) ? new Date() : t
}

function assertUuid(kind: string, id: unknown): void {
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    throw Object.assign(new Error(`Invalid ${kind} id: ${id}`), { statusCode: 400 })
  }
}

function dup(kind: string, id: string, e: any): never {
  if (String(e.message).includes('duplicate key')) {
    throw Object.assign(new Error(`${kind} id ${id} already exists for another account`), { statusCode: 409 })
  }
  throw e
}

/** Push: newer-wins upserts (ownership-aware) + tombstones. Enforces plan limits. */
export async function push(
  userId: string,
  payload: PushPayload,
  maxProfiles: number
): Promise<{ profiles: number; groups: number; proxies: number; deleted: number; skipped: number }> {
  const incoming = payload.profiles ?? []
  if (incoming.length > maxProfiles) {
    throw Object.assign(
      new Error(`Plan limit: ${maxProfiles} profiles max on the ${maxProfiles >= 100 ? 'team' : 'free'} plan (${incoming.length} received). Upgrade to sync more.`),
      { statusCode: 403 }
    )
  }
  let skipped = 0

  // ---- profiles ----
  let n = 0
  for (const doc of incoming) {
    assertUuid('profile', doc.id)
    const updatedAt = docTime(doc)
    // OWNERSHIP-AWARE: a profile id belonging to ANOTHER user is never updated.
    const [row] = await db
      .select({ updatedAt: profiles.updatedAt, deletedAt: profiles.deletedAt })
      .from(profiles)
      .where(and(eq(profiles.id, doc.id), eq(profiles.userId, userId)))
    if (!shouldApply(row, updatedAt)) {
      skipped++
      continue
    }
    const json = JSON.stringify(doc)
    if (row) {
      await db
        .update(profiles)
        .set({ name: doc.name ?? 'Unnamed', os: doc.os ?? 'macos', json, updatedAt, deletedAt: null })
        .where(and(eq(profiles.id, doc.id), eq(profiles.userId, userId)))
    } else {
      try {
        await db.insert(profiles).values({ id: doc.id, userId, name: doc.name ?? 'Unnamed', os: doc.os ?? 'macos', json, updatedAt })
      } catch (e: any) {
        dup('Profile', doc.id, e)
      }
    }
    n++
  }

  // ---- groups ----
  let ng = 0
  for (const doc of payload.groups ?? []) {
    assertUuid('group', doc.id)
    const updatedAt = docTime(doc)
    const [row] = await db
      .select({ updatedAt: groups.updatedAt, deletedAt: groups.deletedAt })
      .from(groups)
      .where(and(eq(groups.id, doc.id), eq(groups.userId, userId)))
    if (!shouldApply(row, updatedAt)) {
      skipped++
      continue
    }
    const values = { name: doc.name ?? 'Group', pinned: !!doc.pinned, color: doc.color ?? null, description: doc.description ?? null, updatedAt }
    if (row) {
      await db.update(groups).set({ ...values, deletedAt: null }).where(and(eq(groups.id, doc.id), eq(groups.userId, userId)))
    } else {
      try {
        await db.insert(groups).values({ id: doc.id, userId, ...values })
      } catch (e: any) {
        dup('Group', doc.id, e)
      }
    }
    ng++
  }

  // ---- proxies ----
  let nx = 0
  for (const doc of payload.proxies ?? []) {
    assertUuid('proxy', doc.id)
    const updatedAt = docTime(doc)
    const [row] = await db
      .select({ updatedAt: proxies.updatedAt, deletedAt: proxies.deletedAt })
      .from(proxies)
      .where(and(eq(proxies.id, doc.id), eq(proxies.userId, userId)))
    if (!shouldApply(row, updatedAt)) {
      skipped++
      continue
    }
    const json = JSON.stringify(doc)
    if (row) {
      await db.update(proxies).set({ json, updatedAt, deletedAt: null }).where(and(eq(proxies.id, doc.id), eq(proxies.userId, userId)))
    } else {
      try {
        await db.insert(proxies).values({ id: doc.id, userId, json, updatedAt })
      } catch (e: any) {
        dup('Proxy', doc.id, e)
      }
    }
    nx++
  }

  // ---- tombstones: applied only if the row was not edited AFTER the deletion ----
  let nd = 0
  const tables = { profiles, groups, proxies } as const
  for (const kind of ['profiles', 'groups', 'proxies'] as const) {
    const t = tables[kind]
    for (const tb of payload.deleted?.[kind] ?? []) {
      assertUuid(kind.slice(0, -1), tb.id)
      const at = docTime({ updatedAt: tb.deletedAt })
      const res = await db
        .update(t)
        .set({ deletedAt: at })
        .where(and(eq(t.id, tb.id), eq(t.userId, userId), isNull(t.deletedAt), lte(t.updatedAt, at)))
      nd += res?.rowCount ?? 0
    }
  }

  return { profiles: n, groups: ng, proxies: nx, deleted: nd, skipped }
}

/** Tombstone a profile (pull excludes it; sync push cannot resurrect it unless edited later). */
export async function deleteProfile(userId: string, profileId: string): Promise<boolean> {
  const res = await db
    .update(profiles)
    .set({ deletedAt: new Date() })
    .where(and(eq(profiles.id, profileId), eq(profiles.userId, userId)))
  return (res?.rowCount ?? 0) > 0
}

/** Session archive upsert (gzip-tar of vital files, ≤ 50 MB). Returns the SERVER timestamp. */
export async function putSessionState(userId: string, profileId: string, data: Buffer): Promise<{ size: number; updatedAt: string }> {
  if (data.length > 50 * 1024 * 1024) {
    throw Object.assign(new Error('Session archive exceeds 50 MB'), { statusCode: 413 })
  }
  const updatedAt = new Date()
  const existing = await db
    .select({ profileId: sessionArchives.profileId })
    .from(sessionArchives)
    .where(and(eq(sessionArchives.profileId, profileId), eq(sessionArchives.userId, userId)))
  if (existing.length) {
    await db
      .update(sessionArchives)
      .set({ data, size: data.length, updatedAt })
      .where(and(eq(sessionArchives.profileId, profileId), eq(sessionArchives.userId, userId)))
  } else {
    await db.insert(sessionArchives).values({ profileId, userId, data, size: data.length, updatedAt })
  }
  return { size: data.length, updatedAt: updatedAt.toISOString() }
}


export async function getSessionState(userId: string, profileId: string): Promise<Buffer | null> {
  const rows = await db
    .select()
    .from(sessionArchives)
    .where(and(eq(sessionArchives.profileId, profileId), eq(sessionArchives.userId, userId)))
  return rows.length ? rows[0].data : null
}

export async function userExists(userId: string): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.id, userId))
  return rows.length > 0
}

export async function countProfiles(userId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(profiles)
    .where(and(eq(profiles.userId, userId), isNull(profiles.deletedAt)))
  return rows[0]?.count ?? 0
}
