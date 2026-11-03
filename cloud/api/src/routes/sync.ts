import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { groups, profiles, proxies, sessionArchives, users } from '../db/schema.js'

/** Pull: everything non-deleted for the user. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function pull(userId: string) {
  const [p, g, x] = await Promise.all([
    db.select().from(profiles).where(and(eq(profiles.userId, userId), isNull(profiles.deletedAt))),
    db.select().from(groups).where(eq(groups.userId, userId)),
    db.select().from(proxies).where(eq(proxies.userId, userId))
  ])
  return {
    profiles: p.map((r) => JSON.parse(r.json)),
    groups: g.map((r) => ({ id: r.id, name: r.name, pinned: r.pinned, color: r.color, description: r.description, createdAt: r.createdAt })),
    proxies: x.map((r) => JSON.parse(r.json))
  }
}

/** Push: upsert documents (profiles/groups/proxies). Enforces plan limits. */
export async function push(
  userId: string,
  payload: { profiles?: any[]; groups?: any[]; proxies?: any[] },
  maxProfiles: number
): Promise<{ profiles: number; groups: number; proxies: number }> {
  const incoming = payload.profiles ?? []
  if (incoming.length > maxProfiles) {
    throw Object.assign(
      new Error(`Plan limit: ${maxProfiles} profiles max on the ${maxProfiles >= 100 ? 'team' : 'free'} plan (${incoming.length} received). Upgrade to sync more.`),
      { statusCode: 403 }
    )
  }

  let n = 0
  for (const doc of incoming) {
    if (!UUID_RE.test(doc.id ?? '')) {
      throw Object.assign(new Error(`Invalid profile id: ${doc.id}`), { statusCode: 400 })
    }
    const json = JSON.stringify(doc)
    const updatedAt = new Date(doc.updatedAt ?? Date.now())
    // OWNERSHIP-AWARE upsert: a profile id belonging to ANOTHER user is never
    // updated (that would let any user overwrite someone else's profile).
    const existing = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.id, doc.id), eq(profiles.userId, userId)))
    if (existing.length) {
      await db
        .update(profiles)
        .set({ name: doc.name ?? 'Unnamed', os: doc.os ?? 'macos', json, updatedAt, deletedAt: null })
        .where(and(eq(profiles.id, doc.id), eq(profiles.userId, userId)))
    } else {
      try {
        await db
          .insert(profiles)
          .values({ id: doc.id, userId, name: doc.name ?? 'Unnamed', os: doc.os ?? 'macos', json, updatedAt })
      } catch (e: any) {
        if (String(e.message).includes('duplicate key')) {
          throw Object.assign(new Error(`Profile id ${doc.id} already exists for another account`), { statusCode: 409 })
        }
        throw e
      }
    }
    n++
  }

  let ng = 0
  for (const doc of payload.groups ?? []) {
    if (!UUID_RE.test(doc.id ?? '')) {
      throw Object.assign(new Error(`Invalid group id: ${doc.id}`), { statusCode: 400 })
    }
    const existing = await db
      .select({ id: groups.id })
      .from(groups)
      .where(and(eq(groups.id, doc.id), eq(groups.userId, userId)))
    if (existing.length) {
      await db
        .update(groups)
        .set({ name: doc.name ?? 'Group', pinned: !!doc.pinned, color: doc.color ?? null, description: doc.description ?? null })
        .where(and(eq(groups.id, doc.id), eq(groups.userId, userId)))
    } else {
      try {
        await db
          .insert(groups)
          .values({ id: doc.id, userId, name: doc.name ?? 'Group', pinned: !!doc.pinned, color: doc.color ?? null, description: doc.description ?? null })
      } catch (e: any) {
        if (String(e.message).includes('duplicate key')) {
          throw Object.assign(new Error(`Group id ${doc.id} already exists for another account`), { statusCode: 409 })
        }
        throw e
      }
    }
    ng++
  }

  let nx = 0
  for (const doc of payload.proxies ?? []) {
    if (!UUID_RE.test(doc.id ?? '')) {
      throw Object.assign(new Error(`Invalid proxy id: ${doc.id}`), { statusCode: 400 })
    }
    const existing = await db
      .select({ id: proxies.id })
      .from(proxies)
      .where(and(eq(proxies.id, doc.id), eq(proxies.userId, userId)))
    if (existing.length) {
      await db
        .update(proxies)
        .set({ json: JSON.stringify(doc) })
        .where(and(eq(proxies.id, doc.id), eq(proxies.userId, userId)))
    } else {
      try {
        await db
          .insert(proxies)
          .values({ id: doc.id, userId, json: JSON.stringify(doc) })
      } catch (e: any) {
        if (String(e.message).includes('duplicate key')) {
          throw Object.assign(new Error(`Proxy id ${doc.id} already exists for another account`), { statusCode: 409 })
        }
        throw e
      }
    }
    nx++
  }

  return { profiles: n, groups: ng, proxies: nx }
}

/** Soft delete (tombstone) so pulls exclude the profile everywhere. */
export async function deleteProfile(userId: string, profileId: string): Promise<boolean> {
  const res = await db
    .update(profiles)
    .set({ deletedAt: new Date() })
    .where(and(eq(profiles.id, profileId), eq(profiles.userId, userId)))
  return (res?.rowCount ?? 0) > 0
}

/** Session archive upsert (gzip-tar of vital files, ≤ 50 MB). */
export async function putSessionState(userId: string, profileId: string, data: Buffer): Promise<{ size: number }> {
  if (data.length > 50 * 1024 * 1024) {
    throw Object.assign(new Error('Session archive exceeds 50 MB'), { statusCode: 413 })
  }
  const existing = await db
    .select({ profileId: sessionArchives.profileId })
    .from(sessionArchives)
    .where(and(eq(sessionArchives.profileId, profileId), eq(sessionArchives.userId, userId)))
  if (existing.length) {
    await db
      .update(sessionArchives)
      .set({ data, size: data.length, updatedAt: new Date() })
      .where(and(eq(sessionArchives.profileId, profileId), eq(sessionArchives.userId, userId)))
  } else {
    await db.insert(sessionArchives).values({ profileId, userId, data, size: data.length, updatedAt: new Date() })
  }
  return { size: data.length }
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
