import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, copyFileSync, statSync } from 'fs'
import { randomUUID } from 'crypto'
import type { AppSettings, Group, Profile, ProxyEntry } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'

export const PROFILE_COLORS = ['#8952ef', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16']

/**
 * Local persistence: profiles (JSON doc + columns), groups, the proxy
 * library, and a typed settings KV. Deleted profiles go to trash
 * (soft delete) until purged.
 */
export class ProfileStore {
  private db: Database.Database

  constructor(dbPath?: string) {
    const dir = dbPath ?? join(app.getPath('userData'), 'rea.db')
    // one-time migration from the pre-rebrand database location
    try {
      const legacy = join(app.getPath('userData'), '..', 'Electron', 'rea.db')
      const legacySize = existsSync(legacy) ? statSync(legacy).size : 0
      const currentSize = existsSync(dir) ? statSync(dir).size : 0
      if (legacySize > 8192 && currentSize < 8192) {
        copyFileSync(legacy, dir)
        for (const ext of ['-wal', '-shm']) {
          if (existsSync(legacy + ext)) copyFileSync(legacy + ext, dir + ext)
        }
      }
    } catch {
      /* fresh start */
    }
    this.db = new Database(dir)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ready',
        group_id TEXT,
        deleted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        color TEXT,
        description TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS proxies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)
    // migrate older tables
    const cols = this.db.prepare('PRAGMA table_info(profiles)').all() as any[]
    if (!cols.some((c) => c.name === 'deleted_at')) {
      this.db.exec('ALTER TABLE profiles ADD COLUMN deleted_at TEXT')
    }
    if (!cols.some((c) => c.name === 'group_id')) {
      this.db.exec('ALTER TABLE profiles ADD COLUMN group_id TEXT')
    }
    const gcols = this.db.prepare('PRAGMA table_info(groups)').all() as any[]
    if (gcols.length && !gcols.some((c) => c.name === 'color')) {
      this.db.exec('ALTER TABLE groups ADD COLUMN color TEXT')
    }
    if (gcols.length && !gcols.some((c) => c.name === 'description')) {
      this.db.exec('ALTER TABLE groups ADD COLUMN description TEXT')
    }
  }

  // ---------- profiles ----------
  list(includeDeleted = false): Profile[] {
    const rows = this.db
      .prepare(
        `SELECT json FROM profiles ${includeDeleted ? '' : 'WHERE deleted_at IS NULL'} ORDER BY updated_at DESC`
      )
      .all() as { json: string }[]
    return rows.map((r) => JSON.parse(r.json) as Profile)
  }

  listDeleted(): Profile[] {
    const rows = this.db
      .prepare('SELECT json FROM profiles WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')
      .all() as { json: string }[]
    return rows.map((r) => JSON.parse(r.json) as Profile)
  }

  get(id: string): Profile | null {
    const row = this.db.prepare('SELECT json FROM profiles WHERE id = ?').get(id) as
      | { json: string }
      | undefined
    return row ? (JSON.parse(row.json) as Profile) : null
  }

  save(profile: Profile): Profile {
    const now = new Date().toISOString()
    const p = { ...profile, updatedAt: now }
    this.db
      .prepare(
        `INSERT INTO profiles (id, name, status, group_id, deleted_at, created_at, updated_at, json)
         VALUES (@id, @name, 'ready', @groupId, NULL, @createdAt, @updatedAt, @json)
         ON CONFLICT(id) DO UPDATE SET
           name = @name, group_id = @groupId, updated_at = @updatedAt, json = @json`
      )
      .run({
        id: p.id,
        name: p.name,
        groupId: p.groupId ?? null,
        createdAt: p.createdAt ?? now,
        updatedAt: p.updatedAt,
        json: JSON.stringify(p)
      })
    return p
  }

  trash(id: string): boolean {
    const res = this.db
      .prepare("UPDATE profiles SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
      .run(new Date().toISOString(), id)
    return res.changes > 0
  }

  restore(id: string): boolean {
    const res = this.db
      .prepare('UPDATE profiles SET deleted_at = NULL WHERE id = ?')
      .run(id)
    return res.changes > 0
  }

  purge(id: string): boolean {
    const res = this.db.prepare('DELETE FROM profiles WHERE id = ?').run(id)
    return res.changes > 0
  }

  create(name: string): Profile {
    const now = new Date().toISOString()
    return this.save({
      id: randomUUID(),
      name,
      notes: '',
      tags: [],
      os: 'macos',
      color: PROFILE_COLORS[Math.floor(Math.random() * PROFILE_COLORS.length)],
      groupId: null,
      proxyLastCheck: null,
      pinned: false,
      disabled: false,
      proxyId: null,
      proxy: { type: 'none', host: '', port: 0, username: '', password: '' },
      navigator: {
        userAgent: '',
        platform: 'MacIntel',
        languages: ['en-US', 'en'],
        hardwareConcurrency: 8,
        deviceMemory: 8
      },
      screen: { width: 1920, height: 1080 },
      webgl: { vendor: '', renderer: '', unmaskedVendor: '', unmaskedRenderer: '' },
      canvas: 'noise',
      audio: 'noise',
      timezone: { mode: 'off', name: '' },
      geolocation: { mode: 'off', latitude: 0, longitude: 0, accuracy: 100 },
      webrtc: 'altered',
      geoPolicy: 'prompt',
      webglMeta: 'mask',
      canvasBlock: false,
      proxyRotating: false,
      proxySource: 'custom',
      media: { videoInputs: 1, audioInputs: 1, audioOutputs: 1 },
      mediaMask: true,
      fonts: { mode: 'default', list: [] },
      unicode: false,
      userAgentMode: 'latest',
      userAgentVersion: '',
      dnsEnabled: false,
      dnsServer: '',
      doNotTrack: false,
      hardwareConcurrencyOverride: null,
      deviceMemory: 8,
      sessionLock: true,
      showNameInBrowser: true,
      uiFollowNavigatorLanguage: false,
      customArgsEnabled: false,
      customArgs: '',
      startupUrls: [],
      startupUrlsEnabled: false,
      iphey: false,
      hideBrowserSettings: false,
      webcam: false,
      fillLanguageFromIp: true,
      freeProxy: false,
      extensions: [],
      pendingCookies: null,
      startup: { homepage: '', restoreSession: undefined, clearSession: false },
      fingerprint: null,
      lastLaunchedAt: null,
      browserVersion: null,
      createdAt: now,
      updatedAt: now
    })
  }

  // ---------- groups ----------
  listGroups(): Group[] {
    const rows = this.db.prepare('SELECT * FROM groups ORDER BY created_at').all() as any[]
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      pinned: !!r.pinned,
      color: r.color ?? PROFILE_COLORS[0],
      description: r.description ?? '',
      createdAt: r.created_at
    }))
  }

  createGroup(name: string, pinned = false, color = PROFILE_COLORS[0], description = ''): Group {
    const g: Group = { id: randomUUID(), name, pinned, color, description, createdAt: new Date().toISOString() }
    this.db
      .prepare('INSERT INTO groups (id, name, pinned, created_at) VALUES (?, ?, ?, ?)')
      .run(g.id, g.name, g.pinned ? 1 : 0, g.createdAt)
    return g
  }

  upsertGroup(g: Group): void {
    this.db
      .prepare(
        'INSERT INTO groups (id, name, pinned, color, description, created_at) VALUES (?, ?, ?, ?, ?, ?) ' +
          'ON CONFLICT(id) DO UPDATE SET name = excluded.name, pinned = excluded.pinned, color = excluded.color, description = excluded.description'
      )
      .run(g.id, g.name, g.pinned ? 1 : 0, g.color ?? null, g.description ?? null, g.createdAt)
  }

  renameGroup(id: string, name: string): void {
    this.db.prepare('UPDATE groups SET name = ? WHERE id = ?').run(name, id)
  }

  setGroupPinned(id: string, pinned: boolean): void {
    this.db.prepare('UPDATE groups SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id)
  }

  deleteGroup(id: string): void {
    this.db.prepare('UPDATE profiles SET group_id = NULL WHERE group_id = ?').run(id)
    this.db.prepare('DELETE FROM groups WHERE id = ?').run(id)
  }

  // ---------- proxies ----------
  listProxies(): ProxyEntry[] {
    const rows = this.db.prepare('SELECT json FROM proxies ORDER BY created_at').all() as {
      json: string
    }[]
    return rows.map((r) => JSON.parse(r.json) as ProxyEntry)
  }

  getProxy(id: string): ProxyEntry | null {
    const row = this.db.prepare('SELECT json FROM proxies WHERE id = ?').get(id) as
      | { json: string }
      | undefined
    return row ? (JSON.parse(row.json) as ProxyEntry) : null
  }

  saveProxy(entry: ProxyEntry): ProxyEntry {
    this.db
      .prepare(
        `INSERT INTO proxies (id, name, created_at, json) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, json = excluded.json`
      )
      .run(entry.id, entry.name, entry.createdAt, JSON.stringify(entry))
    return entry
  }

  createProxy(data: Omit<ProxyEntry, 'id' | 'createdAt' | 'lastStatus' | 'lastCheckedAt' | 'lastIpInfo'>): ProxyEntry {
    return this.saveProxy({
      ...data,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      lastStatus: 'unknown',
      lastCheckedAt: null,
      lastIpInfo: null
    })
  }

  deleteProxy(id: string): void {
    this.db.prepare('DELETE FROM proxies WHERE id = ?').run(id)
    this.db
      .prepare("UPDATE profiles SET json = json_set(json, '$.proxyId', NULL) WHERE json_extract(json, '$.proxyId') = ?")
      .run(id)
  }

  // ---------- settings ----------
  getSettings(): AppSettings {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get('app') as
      | { value: string }
      | undefined
    if (!row) return { ...DEFAULT_SETTINGS }
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  saveSettings(patch: Partial<AppSettings>): AppSettings {
    const merged = { ...this.getSettings(), ...patch }
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run('app', JSON.stringify(merged))
    return merged
  }

  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row ? row.value : null
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, value)
  }

  close(): void {
    this.db.close()
  }
}
