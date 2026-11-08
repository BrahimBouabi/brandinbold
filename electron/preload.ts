import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, Profile } from '@shared/types'

const api = {
  profiles: {
    list: (): Promise<Profile[]> => ipcRenderer.invoke('profiles:list'),
    listDeleted: (): Promise<Profile[]> => ipcRenderer.invoke('profiles:listDeleted'),
    create: (name: string): Promise<Profile> => ipcRenderer.invoke('profiles:create', name),
    save: (profile: Profile): Promise<Profile> => ipcRenderer.invoke('profiles:save', profile),
    trash: (id: string): Promise<boolean> => ipcRenderer.invoke('profiles:trash', id),
    restore: (id: string): Promise<boolean> => ipcRenderer.invoke('profiles:restore', id),
    purge: (id: string): Promise<boolean> => ipcRenderer.invoke('profiles:purge', id),
    emptyTrash: (): Promise<number> => ipcRenderer.invoke('profiles:emptyTrash'),
    generate: (profile: Profile): Promise<Profile> => ipcRenderer.invoke('profiles:generate', profile),
    bulkCreate: (opts: {
      count: number
      prefix?: string
      startIndex?: number
      os?: 'macos' | 'windows' | 'linux'
      groupId?: string | null
      proxyId?: string | null
      tags?: string[]
    }): Promise<{ created: Profile[]; skippedQuota: number }> =>
      ipcRenderer.invoke('profiles:bulkCreate', opts),
    importPreview: (text: string, fixAutomatically = true): Promise<any> =>
      ipcRenderer.invoke('profiles:importPreview', text, fixAutomatically),
    storageInfo: (): Promise<any> => ipcRenderer.invoke('profiles:storageInfo'),
    purgeCache: (id?: string): Promise<any> => ipcRenderer.invoke('profiles:purgeCache', id),
    importRun: (payload: { text: string; fixAutomatically: boolean; duplicateMode: 'skip' | 'rename'; targetGroupId: string | null }): Promise<any> =>
      ipcRenderer.invoke('profiles:importRun', payload),
    export: (
      ids: string[],
      options: { format: 'incogniton' | 'brandinbold'; includeNotes: boolean; includeCredentials: boolean }
    ): Promise<string | null> => ipcRenderer.invoke('profiles:export', ids, options)
  },
  launch: (
    id: string,
    opts?: { extraArgs?: string; openUrlAfter?: string; maximized?: boolean; privateWindow?: boolean }
  ): Promise<any> => ipcRenderer.invoke('launch', id, opts),
  stop: (id: string): Promise<boolean> => ipcRenderer.invoke('stop', id),
  running: (): Promise<any[]> => ipcRenderer.invoke('running:list'),
  status: (id: string): Promise<{ status: string; detail?: string }> => ipcRenderer.invoke('status:get', id),
  sync: {
    status: (): Promise<{ active: boolean; mainId: string | null; followerIds: string[] }> =>
      ipcRenderer.invoke('sync:status'),
    start: (payload: { mainId: string; followerIds: string[]; initialUrl?: string }): Promise<any> =>
      ipcRenderer.invoke('sync:start', payload),
    navigate: (url: string): Promise<boolean> => ipcRenderer.invoke('sync:navigate', url),
    stop: (): Promise<any> => ipcRenderer.invoke('sync:stop')
  },
  groups: {
    list: (): Promise<any[]> => ipcRenderer.invoke('groups:list'),
    create: (name: string, pinned?: boolean, color?: string, description?: string): Promise<any> =>
      ipcRenderer.invoke('groups:create', name, pinned, color, description),
    rename: (id: string, name: string): Promise<void> => ipcRenderer.invoke('groups:rename', id, name),
    pin: (id: string, pinned: boolean): Promise<void> => ipcRenderer.invoke('groups:pin', id, pinned),
    updateMeta: (id: string, color: string, description: string): Promise<void> =>
      ipcRenderer.invoke('groups:updateMeta', id, color, description),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('groups:delete', id)
  },
  proxies: {
    list: (): Promise<any[]> => ipcRenderer.invoke('proxies:list'),
    create: (data: any): Promise<any> => ipcRenderer.invoke('proxies:create', data),
    save: (entry: any): Promise<any> => ipcRenderer.invoke('proxies:save', entry),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('proxies:delete', id),
    test: (proxy: any): Promise<any> => ipcRenderer.invoke('proxies:test', proxy)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    save: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke('settings:save', patch)
  },
  engine: {
    status: (): Promise<{ engine: string; camoufox: string | null; chrome: string | null }> =>
      ipcRenderer.invoke('engine:status'),
    install: (): Promise<string[]> => ipcRenderer.invoke('engine:install')
  },
  cookies: {
    importPreview: (text: string): Promise<any> => ipcRenderer.invoke('profiles:importPreview', text),
    storageInfo: (): Promise<any> => ipcRenderer.invoke('profiles:storageInfo'),
    purgeCache: (id?: string): Promise<any> => ipcRenderer.invoke('profiles:purgeCache', id),
    importRun: (payload: { text: string; fixAutomatically: boolean; duplicateMode: 'skip' | 'rename'; targetGroupId: string | null }): Promise<any> =>
      ipcRenderer.invoke('profiles:importRun', payload),
    export: (id: string, format: 'json' | 'netscape'): Promise<string | null> =>
      ipcRenderer.invoke('cookies:export', id, format),
    import: (id: string): Promise<number | null> => ipcRenderer.invoke('cookies:import', id),
    collect: (id: string): Promise<boolean> => ipcRenderer.invoke('cookies:collect', id),
    clear: (id: string): Promise<boolean> => ipcRenderer.invoke('cookies:clear', id)
  },
  bookmarks: {
    add: (id: string, urls: string[]): Promise<number> => ipcRenderer.invoke('bookmarks:add', id, urls),
    clear: (id: string): Promise<boolean> => ipcRenderer.invoke('bookmarks:clear', id)
  },
  backup: {
    now: (id: string): Promise<string | null> => ipcRenderer.invoke('backup:now', id),
    restore: (id: string): Promise<string | null> => ipcRenderer.invoke('backup:restore', id),
    exportData: (id: string): Promise<string | null> => ipcRenderer.invoke('backup:export', id),
    importData: (id: string): Promise<boolean | null> => ipcRenderer.invoke('backup:import', id),
    openFolder: (id: string): Promise<string | null> => ipcRenderer.invoke('backup:openFolder', id)
  },
  extensions: {
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke('extensions:pickFolder')
  },
  system: {
    info: (): Promise<{ apiPort: number | null; version: string }> =>
      ipcRenderer.invoke('system:info'),
    openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('system:openExternal', url)
  },
  cloud: {
    status: (): Promise<{
      enabled: boolean
      authed: boolean
      user: any
      offlineMode: boolean
      apiUrl: string
      webUrl: string
      apiUrlFromEnv: boolean
      unsyncedProfileIds: string[]
    }> => ipcRenderer.invoke('cloud:status'),
    login: (email: string, password: string, totpCode?: string): Promise<any> =>
      ipcRenderer.invoke('cloud:login', email, password, totpCode),
    register: (email: string, name: string, password: string, username?: string): Promise<any> =>
      ipcRenderer.invoke('cloud:register', email, name, password, username),
    logout: (): Promise<boolean> => ipcRenderer.invoke('cloud:logout'),
    setOfflineMode: (v: boolean): Promise<boolean> => ipcRenderer.invoke('cloud:offlineMode', v),
    syncNow: (): Promise<any> => ipcRenderer.invoke('cloud:syncNow'),
    pushNow: (): Promise<boolean> => ipcRenderer.invoke('profiles:pushNow'),
    testUrl: (url: string): Promise<{ ok: boolean; app?: string; version?: string; error?: string }> =>
      ipcRenderer.invoke('cloud:testUrl', url),
    setApiUrl: (url: string): Promise<{ apiUrl: string; webUrl: string; signedOut: boolean }> =>
      ipcRenderer.invoke('cloud:setApiUrl', url)
  },
  onProfileEvent: (cb: (event: any) => void) => {
    const listener = (_e: unknown, event: any) => cb(event)
    ipcRenderer.on('profile-event', listener)
    return () => ipcRenderer.removeListener('profile-event', listener)
  }
}

contextBridge.exposeInMainWorld('rea', api)
export type ReaApi = typeof api
