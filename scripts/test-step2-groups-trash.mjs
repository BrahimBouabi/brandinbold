/* Step 2 acceptance test — Groups CRUD, dangling groupId cleanup, Soft-Delete Trash, Restore, 30-day Auto-Purge & Cloud Tombstone safety */
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'

const tmp = mkdtempSync(join(tmpdir(), 'bb-step2-test-'))
const dbPath = join(tmp, 'test.db')

let pass = 0
const failures = []
const check = (name, ok, detail = '') => {
  if (ok) pass++
  else failures.push(name + (detail ? ` — ${detail}` : ''))
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.exec(`
  CREATE TABLE profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ready',
    group_id TEXT,
    deleted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    json TEXT NOT NULL
  );
  CREATE TABLE groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    color TEXT,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT
  );
`)

const now = new Date().toISOString()
const g1 = randomUUID()
const g2 = randomUUID()
db.prepare('INSERT INTO groups (id, name, pinned, color, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(g1, 'Marketing', 1, '#3b82f6', 'Ads', now, now)
db.prepare('INSERT INTO groups (id, name, pinned, color, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(g2, 'E-Commerce', 0, '#ec4899', 'Shops', now, now)

const p1 = randomUUID()
const p2 = randomUUID()
const p3 = randomUUID()

const insertProfile = (id, name, groupId) => {
  const doc = { id, name, groupId, createdAt: now, updatedAt: now }
  db.prepare('INSERT INTO profiles (id, name, status, group_id, deleted_at, created_at, updated_at, json) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)').run(
    id,
    name,
    'ready',
    groupId,
    now,
    now,
    JSON.stringify(doc)
  )
}

insertProfile(p1, 'Profile 1', g1)
insertProfile(p2, 'Profile 2', g2)
insertProfile(p3, 'Profile 3', null)

// 1. Verify initial counts (All=3, Unassigned=1, g1=1, g2=1)
const listActive = () =>
  db.prepare('SELECT json FROM profiles WHERE deleted_at IS NULL').all().map((r) => JSON.parse(r.json))

let active = listActive()
check('initial counts (All=3, Unassigned=1, g1=1, g2=1)',
  active.length === 3 &&
  active.filter((p) => !p.groupId).length === 1 &&
  active.filter((p) => p.groupId === g1).length === 1 &&
  active.filter((p) => p.groupId === g2).length === 1
)

// 2. Delete group g1 (must clear BOTH SQL group_id AND JSON $.groupId)
const delNow = new Date().toISOString()
db.prepare(
  "UPDATE profiles SET group_id = NULL, updated_at = ?, json = json_set(json, '$.groupId', null, '$.updatedAt', ?) WHERE group_id = ? OR json_extract(json, '$.groupId') = ?"
).run(delNow, delNow, g1, g1)
db.prepare('DELETE FROM groups WHERE id = ?').run(g1)

active = listActive()
const p1AfterGroupDel = active.find((p) => p.id === p1)
check(
  'deleteGroup clears $.groupId in JSON so profile moves to Unassigned',
  p1AfterGroupDel.groupId === null && active.filter((p) => !p.groupId).length === 2,
  JSON.stringify(p1AfterGroupDel)
)

// 3. Soft delete (trash) p2 → sets deleted_at and $.deletedAt
const trashTime = new Date(Date.now() + 1000).toISOString()
db.prepare(
  "UPDATE profiles SET deleted_at = ?, updated_at = ?, json = json_set(json, '$.deletedAt', ?, '$.updatedAt', ?) WHERE id = ? AND deleted_at IS NULL"
).run(trashTime, trashTime, trashTime, trashTime, p2)

active = listActive()
const deletedRows = db
  .prepare('SELECT json, deleted_at FROM profiles WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')
  .all()
  .map((r) => ({ ...JSON.parse(r.json), deletedAt: r.deleted_at }))

check(
  'soft-delete removes profile from active list and exposes it in Trash with deletedAt',
  active.length === 2 && deletedRows.length === 1 && deletedRows[0].id === p2 && deletedRows[0].deletedAt === trashTime
)

// 4. Restore p2 from Trash → clears deleted_at and $.deletedAt, bumps updatedAt > trashTime
const restoreTime = new Date(Date.now() + 5000).toISOString()
db.prepare(
  "UPDATE profiles SET deleted_at = NULL, updated_at = ?, json = json_set(json, '$.deletedAt', null, '$.updatedAt', ?) WHERE id = ? AND deleted_at IS NOT NULL"
).run(restoreTime, restoreTime, p2)

active = listActive()
const p2Restored = active.find((p) => p.id === p2)
const deletedAfterRestore = db.prepare('SELECT id FROM profiles WHERE deleted_at IS NOT NULL').all()
check(
  'restore returns profile to active list, clears deletedAt, and bumps updatedAt above tombstone',
  active.length === 3 &&
    deletedAfterRestore.length === 0 &&
    p2Restored.deletedAt === null &&
    new Date(p2Restored.updatedAt).getTime() > new Date(trashTime).getTime()
)

// 5. 30-day auto-purge removes only profiles deleted > 30 days ago and keeps recently trashed ones
const oldTrashTime = new Date(Date.now() - 31 * 86_400_000).toISOString()
const recentTrashTime = new Date(Date.now() - 2 * 86_400_000).toISOString()
db.prepare("UPDATE profiles SET deleted_at = ? WHERE id = ?").run(oldTrashTime, p1)
db.prepare("UPDATE profiles SET deleted_at = ? WHERE id = ?").run(recentTrashTime, p2)

const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString()
const expired = db.prepare('SELECT id FROM profiles WHERE deleted_at IS NOT NULL AND deleted_at < ?').all(cutoff)
for (const r of expired) {
  db.prepare('DELETE FROM profiles WHERE id = ?').run(r.id)
}
const remainingTrash = db.prepare('SELECT id FROM profiles WHERE deleted_at IS NOT NULL').all()
check(
  '30-day auto-purge deletes 31-day-old trash (p1) and preserves 2-day-old trash (p2)',
  expired.length === 1 && expired[0].id === p1 && remainingTrash.length === 1 && remainingTrash[0].id === p2
)

db.close()
rmSync(tmp, { recursive: true, force: true })

console.log(`\n=== STEP 2 GROUPS & TRASH: ${pass} pass / ${failures.length} fail ===`)
if (failures.length) {
  failures.forEach((f) => console.log('FAIL: ' + f))
  process.exit(1)
}
console.log('ALL PASS')

