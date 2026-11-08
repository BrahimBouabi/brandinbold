import { useEffect, useState } from 'react'
import { Alert, Button, Card, QRCode, Select, Space, Statistic, Table, Tabs, Tag, Typography, message } from 'antd'
import { BrandLogo } from '../components/Logo'
import { api, logout, storedUser, type CloudUser } from '../api'

export function Dashboard({ onNav }: { onNav: (r: string) => void }) {
  const [user, setUser] = useState<CloudUser | null>(storedUser())
  const [counts, setCounts] = useState<{ profiles: number; groups: number; proxies: number } | null>(null)
  const [name, setName] = useState(user?.name ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [pw, setPw] = useState({ current: '', next: '' })
  const [busy, setBusy] = useState(false)

  // 2FA state
  const [totpSetup, setTotpSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
  const [disablePw, setDisablePw] = useState('')
  const [showDisable2fa, setShowDisable2fa] = useState(false)

  // Team state
  const [team, setTeam] = useState<any | null>(null)
  const [teamSearch, setTeamSearch] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member')
  const [inviteResult, setInviteResult] = useState<any | null>(null)
  const [inviteTokenInput, setInviteTokenInput] = useState(() => sessionStorage.getItem('bb_pending_invite_token') ?? '')

  const loadDashboard = async () => {
    const me = await api.me()
    setUser(me.user)
    setName(me.user.name ?? '')
    setUsername(me.user.username ?? '')
    localStorage.setItem('bb_user', JSON.stringify(me.user))
    const [pull, teamRes] = await Promise.all([api.pull(), api.team.get()])
    setCounts({ profiles: pull.profiles.length, groups: pull.groups.length, proxies: pull.proxies.length })
    setTeam(teamRes)
  }

  useEffect(() => {
    void (async () => {
      try {
        await loadDashboard()
      } catch (e: any) {
        if (e.statusCode === 401) {
          logout()
          onNav('login')
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveName = async () => {
    setBusy(true)
    try {
      const res = await api.updateProfile({ name })
      setUser(res.user)
      localStorage.setItem('bb_user', JSON.stringify(res.user))
      message.success('Name updated')
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const saveUsername = async () => {
    setBusy(true)
    try {
      const res = await api.updateProfile({ username })
      setUser(res.user)
      setUsername(res.user.username ?? username)
      localStorage.setItem('bb_user', JSON.stringify(res.user))
      message.success('Username updated')
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const savePassword = async () => {
    setBusy(true)
    try {
      await api.changePassword(pw.current, pw.next)
      setPw({ current: '', next: '' })
      message.success('Password changed')
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const start2faSetup = async () => {
    setBusy(true)
    try {
      const res = await api.setup2fa()
      setTotpSetup(res)
      setBackupCodes(null)
      setTotpCode('')
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const confirmEnable2fa = async () => {
    setBusy(true)
    try {
      const res = await api.enable2fa(totpCode)
      setBackupCodes(res.backupCodes)
      setTotpSetup(null)
      setTotpCode('')
      const me = await api.me()
      setUser(me.user)
      localStorage.setItem('bb_user', JSON.stringify(me.user))
      message.success('Two-factor authentication enabled')
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const confirmDisable2fa = async () => {
    setBusy(true)
    try {
      await api.disable2fa({ password: disablePw, code: disablePw })
      setDisablePw('')
      setShowDisable2fa(false)
      setBackupCodes(null)
      const me = await api.me()
      setUser(me.user)
      localStorage.setItem('bb_user', JSON.stringify(me.user))
      message.success('Two-factor authentication disabled')
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!user) return null
  const quotaPct = Math.min(100, Math.round(((counts?.profiles ?? 0) / user.maxProfiles) * 100))

  const inputStyle: React.CSSProperties = {
    flex: 1,
    background: '#0d0f13',
    border: '1px solid rgba(255,255,255,0.12)',
    color: '#d7dbe2',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 13
  }

  return (
    <div style={{ background: '#0d0f13', minHeight: '100vh', color: '#d7dbe2', fontFamily: '-apple-system, system-ui' }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 36px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <BrandLogo size={22} color="#8952ef" />
        <span style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>Brandinbold</span>
        <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>Dashboard</span>
        <div style={{ marginLeft: 'auto' }}>
          <Button size="small" onClick={() => { logout(); onNav('landing') }}>Sign Out</Button>
        </div>
      </nav>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '36px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 26 }}>
          <div style={{ width: 46, height: 46, borderRadius: 23, background: '#8952ef', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 18 }}>
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {user.name}{' '}
              {user.username && (
                <span style={{ fontSize: 13, fontWeight: 500, color: '#8952ef' }}>@{user.username}</span>
              )}
            </div>
            <div style={{ fontSize: 13, color: '#9aa3af' }}>{user.email}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ background: 'rgba(137,82,239,0.15)', color: '#8952ef', borderRadius: 12, padding: '4px 12px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
              {user.plan} plan
            </span>
            <a
              href="https://github.com/BrahimBouabi/brandinbold/releases"
              target="_blank"
              rel="noreferrer"
              style={{ background: '#8952ef', color: '#fff', borderRadius: 8, padding: '8px 16px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}
            >
              ⬇ Download Desktop App
            </a>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 26 }}>
          <Card style={{ background: '#15171d', border: '1px solid rgba(255,255,255,0.07)' }}>
            <Statistic title="Profiles" value={counts?.profiles ?? '…'} />
          </Card>
          <Card style={{ background: '#15171d', border: '1px solid rgba(255,255,255,0.07)' }}>
            <Statistic title="Groups" value={counts?.groups ?? '…'} />
          </Card>
          <Card style={{ background: '#15171d', border: '1px solid rgba(255,255,255,0.07)' }}>
            <Statistic title="Proxies" value={counts?.proxies ?? '…'} />
          </Card>
        </div>

        <Card style={{ background: '#15171d', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 18 }}>
          <Typography.Title level={5} style={{ color: '#fff' }}>Plan & quota</Typography.Title>
          <div style={{ fontSize: 13, color: '#9aa3af', marginBottom: 8 }}>
            {counts?.profiles ?? 0} of {user.maxProfiles} profiles used on the {user.plan} plan
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
            <div style={{ width: `${quotaPct}%`, height: 6, borderRadius: 3, background: '#8952ef' }} />
          </div>
        </Card>

        <Card style={{ background: '#15171d', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 18 }}>
          <Typography.Title level={5} style={{ color: '#fff' }}>Account settings</Typography.Title>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10, maxWidth: 480 }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Display name"
              style={inputStyle}
            />
            <Button size="small" loading={busy} onClick={() => void saveName()}>Save name</Button>
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, maxWidth: 480 }}>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username (3-30 chars, letters/digits/_.-)"
              style={inputStyle}
            />
            <Button size="small" loading={busy} onClick={() => void saveUsername()}>Save username</Button>
          </div>
          <div style={{ display: 'flex', gap: 10, maxWidth: 560 }}>
            <input
              type="password"
              value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
              placeholder="Current password"
              style={inputStyle}
            />
            <input
              type="password"
              value={pw.next}
              onChange={(e) => setPw({ ...pw, next: e.target.value })}
              placeholder="New password (8+, A-Z, a-z, 0-9)"
              style={inputStyle}
            />
            <Button size="small" loading={busy} onClick={() => void savePassword()}>Change password</Button>
          </div>
          <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 6 }}>
            Password policy: minimum 8 characters with at least one uppercase letter, one lowercase letter, and one digit.
          </div>
        </Card>

        <Card style={{ background: '#15171d', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Typography.Title level={5} style={{ color: '#fff', margin: 0 }}>
              Two-Factor Authentication (TOTP Authenticator)
            </Typography.Title>
            <Tag color={user.totpEnabled ? 'success' : 'default'}>
              {user.totpEnabled ? 'ENABLED' : 'DISABLED'}
            </Tag>
          </div>
          <div style={{ fontSize: 13, color: '#9aa3af', marginBottom: 14 }}>
            Protect your account with an authenticator app (Google Authenticator, 1Password, Authy) when signing in on the web or desktop app.
          </div>

          {!user.totpEnabled && !totpSetup && (
            <Button type="primary" loading={busy} onClick={() => void start2faSetup()}>
              Enable Authenticator (2FA)
            </Button>
          )}

          {totpSetup && (
            <div style={{ background: '#0d0f13', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 18, marginTop: 10 }}>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ background: '#fff', padding: 10, borderRadius: 10 }}>
                  <QRCode value={totpSetup.otpauthUrl} size={150} color="#000000" bgColor="#ffffff" />
                </div>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#fff' }}>
                    1. Scan this QR code with your Authenticator app
                  </div>
                  <div style={{ fontSize: 12, color: '#9aa3af', marginBottom: 10 }}>
                    Or enter this setup key manually:{' '}
                    <code style={{ background: 'rgba(137,82,239,0.15)', color: '#c4b5fd', padding: '2px 6px', borderRadius: 4 }}>
                      {totpSetup.secret}
                    </code>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#fff' }}>
                    2. Enter the 6-digit code from your app
                  </div>
                  <div style={{ display: 'flex', gap: 10, maxWidth: 320 }}>
                    <input
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                      placeholder="6-digit code"
                      maxLength={6}
                      style={inputStyle}
                    />
                    <Button type="primary" loading={busy} onClick={() => void confirmEnable2fa()}>
                      Verify & Enable
                    </Button>
                    <Button onClick={() => setTotpSetup(null)}>Cancel</Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {backupCodes && backupCodes.length > 0 && (
            <div style={{ background: 'rgba(63,185,106,0.08)', border: '1px solid rgba(63,185,106,0.35)', borderRadius: 12, padding: 16, marginTop: 14 }}>
              <div style={{ fontWeight: 700, color: '#3fb96a', marginBottom: 6 }}>
                Save your single-use recovery backup codes
              </div>
              <div style={{ fontSize: 12, color: '#9aa3af', marginBottom: 10 }}>
                Each code can be used once to sign in if you lose access to your authenticator device.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
                {backupCodes.map((c) => (
                  <code key={c} style={{ background: '#0d0f13', padding: '6px 10px', borderRadius: 6, textAlign: 'center', fontWeight: 600, color: '#fff' }}>
                    {c}
                  </code>
                ))}
              </div>
              <Button
                size="small"
                onClick={() => {
                  void navigator.clipboard.writeText(backupCodes.join('\n'))
                  message.success('Backup codes copied to clipboard')
                }}
              >
                Copy backup codes
              </Button>
            </div>
          )}

          {user.totpEnabled && (
            <div style={{ marginTop: 12 }}>
              {!showDisable2fa ? (
                <Button danger size="small" onClick={() => setShowDisable2fa(true)}>
                  Disable 2FA
                </Button>
              ) : (
                <div style={{ display: 'flex', gap: 10, maxWidth: 420, alignItems: 'center' }}>
                  <input
                    type="password"
                    value={disablePw}
                    onChange={(e) => setDisablePw(e.target.value)}
                    placeholder="Current password or 6-digit 2FA code"
                    style={inputStyle}
                  />
                  <Button danger size="small" loading={busy} onClick={() => void confirmDisable2fa()}>
                    Confirm Disable
                  </Button>
                  <Button size="small" onClick={() => { setShowDisable2fa(false); setDisablePw('') }}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Team Management Card (Members / Roles / Activity) */}
        <Card style={{ background: '#15171d', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
            <Space>
              <Typography.Title level={5} style={{ color: '#fff', margin: 0 }}>
                Team Management
              </Typography.Title>
              {team?.workspace && (
                <>
                  <Tag color="purple">{team.workspace.myRole.toUpperCase()}</Tag>
                  <Tag>
                    Seats: {team.workspace.activeSeats} / {team.workspace.maxSeats}
                  </Tag>
                </>
              )}
            </Space>
            {team?.availableWorkspaces?.length > 1 && (
              <Select
                size="small"
                value={team.workspace.ownerId}
                style={{ minWidth: 220 }}
                onChange={async (ownerId: string) => {
                  try {
                    await api.team.switchWorkspace(ownerId)
                    message.success('Switched workspace')
                    await loadDashboard()
                  } catch (e: any) {
                    message.error(e.message)
                  }
                }}
                options={team.availableWorkspaces.map((w: any) => ({
                  value: w.ownerId,
                  label: `${w.ownerName} (${w.role.toUpperCase()})`
                }))}
              />
            )}
          </div>

          {/* Pending invitation banner or token input */}
          {(inviteTokenInput || (team?.pendingInvitesForMe?.length ?? 0) > 0) && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 14 }}
              message="Accept Team Invitation"
              description={
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                  <input
                    value={inviteTokenInput || team?.pendingInvitesForMe?.[0]?.inviteToken || ''}
                    onChange={(e) => setInviteTokenInput(e.target.value)}
                    placeholder="Paste invite token"
                    style={{ ...inputStyle, maxWidth: 360, fontFamily: 'monospace' }}
                  />
                  <Button
                    type="primary"
                    size="small"
                    loading={busy}
                    onClick={async () => {
                      const tok = (inviteTokenInput || team?.pendingInvitesForMe?.[0]?.inviteToken || '').trim()
                      if (!tok) return
                      setBusy(true)
                      try {
                        await api.team.acceptInvite(tok)
                        sessionStorage.removeItem('bb_pending_invite_token')
                        setInviteTokenInput('')
                        message.success('Joined team workspace!')
                        await loadDashboard()
                      } catch (e: any) {
                        message.error(e.message)
                      } finally {
                        setBusy(false)
                      }
                    }}
                  >
                    Accept & Join Team
                  </Button>
                </div>
              }
            />
          )}

          {team?.workspace?.permissions?.manageTeam && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Invite member by email (e.g. teammate@domain.com)"
                style={{ ...inputStyle, maxWidth: 320 }}
              />
              <Select
                value={inviteRole}
                onChange={(v) => setInviteRole(v)}
                style={{ width: 140 }}
                options={[
                  { value: 'admin', label: 'Admin' },
                  { value: 'member', label: 'Member' },
                  { value: 'viewer', label: 'Viewer' }
                ]}
              />
              <Button
                type="primary"
                loading={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    const res = await api.team.invite({ email: inviteEmail, role: inviteRole })
                    setInviteResult(res)
                    setInviteEmail('')
                    message.success('Invitation created')
                    await loadDashboard()
                  } catch (e: any) {
                    message.error(e.message)
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                + Invite member
              </Button>
            </div>
          )}

          {inviteResult?.inviteUrl && (
            <Alert
              type="success"
              closable
              onClose={() => setInviteResult(null)}
              style={{ marginBottom: 14 }}
              message={
                inviteResult.emailSent
                  ? `Email sent via ${String(inviteResult.emailProvider).toUpperCase()}`
                  : 'Copyable Invite Link Ready'
              }
              description={
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                  <code style={{ background: '#0d0f13', padding: '6px 10px', borderRadius: 6, fontSize: 12 }}>
                    {inviteResult.inviteUrl}
                  </code>
                  <Button
                    size="small"
                    onClick={() => {
                      void navigator.clipboard.writeText(inviteResult.inviteUrl)
                      message.success('Invite link copied')
                    }}
                  >
                    Copy Link
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      void navigator.clipboard.writeText(inviteResult.inviteToken)
                      message.success('Invite token copied')
                    }}
                  >
                    Copy Token
                  </Button>
                </div>
              }
            />
          )}

          <Tabs
            items={[
              {
                key: 'members',
                label: `Members (${team?.members?.length ?? 0})`,
                children: (
                  <div>
                    <div style={{ marginBottom: 10, maxWidth: 280 }}>
                      <input
                        value={teamSearch}
                        onChange={(e) => setTeamSearch(e.target.value)}
                        placeholder="Search members..."
                        style={{ ...inputStyle, width: '100%' }}
                      />
                    </div>
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={{ pageSize: 8, hideOnSinglePage: true }}
                      dataSource={(team?.members ?? []).filter((m: any) => {
                        if (!teamSearch.trim()) return true
                        const q = teamSearch.toLowerCase()
                        return m.email.toLowerCase().includes(q) || (m.name || '').toLowerCase().includes(q) || m.role.toLowerCase().includes(q)
                      })}
                      columns={[
                        {
                          title: 'Member',
                          key: 'member',
                          render: (_: any, r: any) => (
                            <div>
                              <div style={{ fontWeight: 600 }}>{r.name}</div>
                              <div style={{ fontSize: 12, color: '#9aa3af' }}>{r.email}</div>
                            </div>
                          )
                        },
                        {
                          title: 'Role',
                          key: 'role',
                          render: (_: any, r: any) =>
                            team?.workspace?.permissions?.manageTeam && !r.isOwner ? (
                              <Select
                                size="small"
                                value={r.role}
                                style={{ width: 110 }}
                                onChange={async (role: string) => {
                                  try {
                                    await api.team.updateRole(r.id, role)
                                    message.success('Role updated')
                                    await loadDashboard()
                                  } catch (e: any) {
                                    message.error(e.message)
                                  }
                                }}
                                options={[
                                  { value: 'admin', label: 'Admin' },
                                  { value: 'member', label: 'Member' },
                                  { value: 'viewer', label: 'Viewer' }
                                ]}
                              />
                            ) : (
                              <Tag color="purple">{String(r.role).toUpperCase()}</Tag>
                            )
                        },
                        {
                          title: 'Status',
                          dataIndex: 'status',
                          render: (s: string) => (
                            <Tag color={s === 'active' ? 'success' : s === 'pending' ? 'gold' : 'default'}>
                              {String(s).toUpperCase()}
                            </Tag>
                          )
                        },
                        {
                          title: 'Last Login',
                          dataIndex: 'lastLoginAt',
                          render: (v: string | null) => (
                            <span style={{ fontSize: 12, color: '#9aa3af' }}>
                              {v ? new Date(v).toLocaleString() : 'Never'}
                            </span>
                          )
                        },
                        {
                          title: 'Actions',
                          key: 'actions',
                          render: (_: any, r: any) => {
                            if (r.isOwner || !team?.workspace?.permissions?.manageTeam) return '—'
                            return (
                              <Space size={6}>
                                {r.inviteUrl && r.status === 'pending' && (
                                  <Button
                                    size="small"
                                    onClick={() => {
                                      void navigator.clipboard.writeText(r.inviteUrl)
                                      message.success('Invite link copied')
                                    }}
                                  >
                                    Copy Link
                                  </Button>
                                )}
                                {r.status !== 'active' && (
                                  <Button
                                    size="small"
                                    onClick={async () => {
                                      const res = await api.team.resend(r.id)
                                      setInviteResult(res)
                                      message.success('Invite renewed')
                                      await loadDashboard()
                                    }}
                                  >
                                    Resend
                                  </Button>
                                )}
                                {r.status === 'pending' && (
                                  <Button
                                    size="small"
                                    danger
                                    onClick={async () => {
                                      await api.team.revoke(r.id)
                                      message.success('Invite revoked')
                                      await loadDashboard()
                                    }}
                                  >
                                    Revoke
                                  </Button>
                                )}
                                <Button
                                  size="small"
                                  danger
                                  onClick={async () => {
                                    await api.team.remove(r.id)
                                    message.success('Member removed')
                                    await loadDashboard()
                                  }}
                                >
                                  Remove
                                </Button>
                              </Space>
                            )
                          }
                        }
                      ]}
                    />
                  </div>
                )
              },
              {
                key: 'roles',
                label: 'Roles',
                children: (
                  <Table
                    size="small"
                    rowKey="id"
                    pagination={false}
                    dataSource={team?.roles ?? []}
                    columns={[
                      { title: 'Role', dataIndex: 'name', render: (v: string) => <strong>{v}</strong> },
                      { title: 'Description', dataIndex: 'description' },
                      {
                        title: 'Write Profiles',
                        key: 'w',
                        render: (_: any, r: any) => (r.permissions.writeProfiles ? <Tag color="success">Yes</Tag> : <Tag>No</Tag>)
                      },
                      {
                        title: 'Delete Profiles',
                        key: 'd',
                        render: (_: any, r: any) => (r.permissions.deleteProfiles ? <Tag color="success">Yes</Tag> : <Tag>No</Tag>)
                      },
                      {
                        title: 'Manage Team',
                        key: 'm',
                        render: (_: any, r: any) => (r.permissions.manageTeam ? <Tag color="success">Yes</Tag> : <Tag>No</Tag>)
                      }
                    ]}
                  />
                )
              },
              {
                key: 'activity',
                label: `Activity (${team?.activity?.length ?? 0})`,
                children: (
                  <Table
                    size="small"
                    rowKey="id"
                    pagination={{ pageSize: 10, hideOnSinglePage: true }}
                    dataSource={team?.activity ?? []}
                    columns={[
                      {
                        title: 'Time',
                        dataIndex: 'createdAt',
                        render: (v: string) => <span style={{ fontSize: 12, color: '#9aa3af' }}>{new Date(v).toLocaleString()}</span>
                      },
                      { title: 'Actor', dataIndex: 'actorEmail' },
                      { title: 'Event', dataIndex: 'action', render: (v: string) => <Tag color="purple">{v}</Tag> },
                      { title: 'Target', dataIndex: 'target' },
                      { title: 'Detail', dataIndex: 'detail' }
                    ]}
                  />
                )
              }
            ]}
          />
        </Card>
      </div>
    </div>
  )
}
