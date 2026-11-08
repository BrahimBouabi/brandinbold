import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message
} from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloudOutlined,
  CopyOutlined,
  DeleteOutlined,
  KeyOutlined,
  LinkOutlined,
  MailOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  StopOutlined,
  SwapOutlined,
  TeamOutlined,
  UserSwitchOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

const { Text } = Typography
const rea = (window as any).rea

interface RolePermissions {
  readProfiles: boolean
  launchProfiles: boolean
  writeProfiles: boolean
  deleteProfiles: boolean
  manageTeam: boolean
  manageBilling: boolean
}

interface RoleDefinition {
  id: 'owner' | 'admin' | 'member' | 'viewer'
  name: string
  color: string
  description: string
  permissions: RolePermissions
}

interface TeamMemberRow {
  id: string
  email: string
  name: string
  username: string | null
  role: 'owner' | 'admin' | 'member' | 'viewer'
  status: 'active' | 'pending' | 'revoked' | 'expired'
  invitedAt: string
  joinedAt: string | null
  lastLoginAt: string | null
  inviteExpiresAt: string | null
  inviteToken?: string | null
  inviteUrl?: string | null
  isOwner: boolean
}

interface TeamActivityRow {
  id: string
  actorUserId: string | null
  actorEmail: string
  actorName: string
  action: string
  target: string
  detail: string
  ip: string | null
  createdAt: string
}

interface TeamOverview {
  workspace: {
    ownerId: string
    ownerEmail: string
    ownerName: string
    plan: string
    maxSeats: number
    activeSeats: number
    myRole: 'owner' | 'admin' | 'member' | 'viewer'
    permissions: RolePermissions
    isPersonalWorkspace: boolean
  }
  availableWorkspaces: Array<{
    ownerId: string
    ownerName: string
    ownerEmail: string
    role: string
    active: boolean
  }>
  pendingInvitesForMe: Array<{
    id: string
    ownerId: string
    ownerName: string
    ownerEmail: string
    role: string
    inviteToken: string
    invitedAt: string
    inviteExpiresAt: string | null
  }>
  members: TeamMemberRow[]
  roles: RoleDefinition[]
  activity: TeamActivityRow[]
}

const ROLE_COLORS: Record<string, string> = {
  owner: 'purple',
  admin: 'blue',
  member: 'green',
  viewer: 'default'
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

function actionBadgeColor(action: string): string {
  if (action.startsWith('auth.')) return 'cyan'
  if (action.includes('delete') || action.includes('remove') || action.includes('revoke')) return 'red'
  if (action.includes('invite') || action.includes('accept')) return 'purple'
  if (action.includes('role')) return 'gold'
  if (action.includes('profile') || action.includes('session')) return 'green'
  return 'blue'
}

export function TeamPage() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [overview, setOverview] = useState<TeamOverview | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [activitySearch, setActivitySearch] = useState('')

  // Invite modal state
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member')
  const [inviteExpiresDays, setInviteExpiresDays] = useState<number>(7)
  const [lastInviteResult, setLastInviteResult] = useState<{
    email: string
    role: string
    inviteUrl: string
    inviteToken: string
    emailSent: boolean
    emailProvider: string
    emailError?: string
  } | null>(null)

  // Accept invite modal state
  const [acceptOpen, setAcceptOpen] = useState(false)
  const [acceptToken, setAcceptToken] = useState('')
  const [accepting, setAccepting] = useState(false)

  const loadTeam = useCallback(async (searchQuery?: string) => {
    setLoading(true)
    try {
      const st = await rea.cloud.status()
      setAuthed(st.authed)
      if (!st.authed) {
        setOverview(null)
        return
      }
      const data = await rea.team.get(searchQuery)
      setOverview(data)
    } catch (e: any) {
      message.error(e.message || 'Failed to load team data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTeam()
  }, [loadTeam])

  const canManage = !!overview?.workspace.permissions.manageTeam

  const filteredMembers = useMemo(() => {
    const list = overview?.members ?? []
    return list.filter((m) => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false
      if (!search.trim()) return true
      const q = search.trim().toLowerCase()
      return (
        m.email.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        (m.username ?? '').toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q) ||
        m.status.toLowerCase().includes(q)
      )
    })
  }, [overview, search, statusFilter])

  const filteredActivity = useMemo(() => {
    const list = overview?.activity ?? []
    if (!activitySearch.trim()) return list
    const q = activitySearch.trim().toLowerCase()
    return list.filter(
      (a) =>
        a.actorEmail.toLowerCase().includes(q) ||
        a.actorName.toLowerCase().includes(q) ||
        a.action.toLowerCase().includes(q) ||
        a.target.toLowerCase().includes(q) ||
        a.detail.toLowerCase().includes(q)
    )
  }, [overview, activitySearch])

  const copyText = (text: string, label = 'Copied to clipboard') => {
    navigator.clipboard.writeText(text)
    message.success(label)
  }

  const handleInviteSubmit = async () => {
    const cleanEmail = inviteEmail.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      message.error('Please enter a valid email address')
      return
    }
    setInviting(true)
    try {
      const res = await rea.team.invite({
        email: cleanEmail,
        role: inviteRole,
        expiresInDays: inviteExpiresDays
      })
      setLastInviteResult({
        email: cleanEmail,
        role: inviteRole,
        inviteUrl: res.inviteUrl,
        inviteToken: res.inviteToken,
        emailSent: res.emailSent,
        emailProvider: res.emailProvider,
        emailError: res.emailError
      })
      setInviteEmail('')
      message.success(
        res.emailSent
          ? `Invitation email sent to ${cleanEmail} via ${res.emailProvider.toUpperCase()}`
          : `Invitation created for ${cleanEmail} — share the invite link below`
      )
      await loadTeam()
    } catch (e: any) {
      message.error(e.message || 'Failed to invite member')
    } finally {
      setInviting(false)
    }
  }

  const handleResend = async (member: TeamMemberRow) => {
    try {
      const res = await rea.team.resend(member.id)
      setLastInviteResult({
        email: member.email,
        role: member.role,
        inviteUrl: res.inviteUrl,
        inviteToken: res.inviteToken,
        emailSent: res.emailSent,
        emailProvider: res.emailProvider,
        emailError: res.emailError
      })
      setInviteOpen(true)
      message.success('Invitation renewed and ready to share')
      await loadTeam()
    } catch (e: any) {
      message.error(e.message || 'Failed to resend invite')
    }
  }

  const handleRevoke = async (memberId: string) => {
    try {
      await rea.team.revoke(memberId)
      message.success('Invitation revoked')
      await loadTeam()
    } catch (e: any) {
      message.error(e.message || 'Failed to revoke invite')
    }
  }

  const handleRoleChange = async (memberId: string, role: string) => {
    try {
      await rea.team.updateRole(memberId, role)
      message.success(`Role updated to ${role.toUpperCase()}`)
      await loadTeam()
    } catch (e: any) {
      message.error(e.message || 'Failed to update role')
    }
  }

  const handleRemove = async (memberId: string) => {
    try {
      await rea.team.remove(memberId)
      message.success('Team member removed')
      await loadTeam()
    } catch (e: any) {
      message.error(e.message || 'Failed to remove member')
    }
  }

  const handleAcceptInvite = async (tokenToUse?: string) => {
    const raw = (tokenToUse ?? acceptToken).trim()
    if (!raw) {
      message.error('Enter an invitation token or invite link')
      return
    }
    // Extract token if user pasted full URL (#/invite?token=...)
    let cleanToken = raw
    const match = raw.match(/[?&]token=([a-f0-9]+)/i)
    if (match) cleanToken = match[1]

    setAccepting(true)
    try {
      await rea.team.acceptInvite(cleanToken)
      message.success('Invitation accepted! Switched to team workspace.')
      setAcceptOpen(false)
      setAcceptToken('')
      await loadTeam()
    } catch (e: any) {
      message.error(e.message || 'Failed to accept invitation')
    } finally {
      setAccepting(false)
    }
  }

  const handleSwitchWorkspace = async (ownerId: string) => {
    setLoading(true)
    try {
      await rea.team.switchWorkspace(ownerId)
      message.success('Switched active workspace & synced profiles')
      await loadTeam()
    } catch (e: any) {
      message.error(e.message || 'Failed to switch workspace')
      setLoading(false)
    }
  }

  if (authed === false) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ margin: 0 }}>{t('team.title')}</h2>
        </div>
        <Card style={{ maxWidth: 680 }}>
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <Space>
              <CloudOutlined style={{ fontSize: 24, color: '#7c5cff' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>Sign in to Brandinbold Cloud to manage your Team</div>
                <Text type="secondary">
                  Team members, role-based access control (Owner, Admin, Member, Viewer), shared workspaces, and audit activity logs require an active cloud session.
                </Text>
              </div>
            </Space>
            <div>
              <Button
                type="primary"
                icon={<CloudOutlined />}
                onClick={async () => {
                  await rea.cloud.setOfflineMode(false)
                  window.location.reload()
                }}
              >
                Sign In to Cloud
              </Button>
            </div>
          </Space>
        </Card>
      </div>
    )
  }

  const ws = overview?.workspace

  return (
    <div>
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 18
        }}
      >
        <Space size={12} wrap>
          <h2 style={{ margin: 0 }}>{t('team.title')}</h2>
          {ws && (
            <>
              <Tag color={ROLE_COLORS[ws.myRole] ?? 'default'} style={{ fontWeight: 600 }}>
                Role: {ws.myRole.toUpperCase()}
              </Tag>
              <Tag color={ws.activeSeats >= ws.maxSeats ? 'warning' : 'purple'}>
                Seats: {ws.activeSeats} / {ws.maxSeats} ({ws.plan.toUpperCase()} Plan)
              </Tag>
            </>
          )}
        </Space>

        <Space wrap>
          {overview && overview.availableWorkspaces.length > 1 && (
            <Select
              value={ws?.ownerId}
              onChange={handleSwitchWorkspace}
              style={{ minWidth: 240 }}
              suffixIcon={<SwapOutlined />}
              options={overview.availableWorkspaces.map((w) => ({
                value: w.ownerId,
                label: `${w.ownerName} (${w.role.toUpperCase()})`
              }))}
            />
          )}
          <Button icon={<KeyOutlined />} onClick={() => setAcceptOpen(true)}>
            Accept Invite Token
          </Button>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => loadTeam()} />
          {canManage && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setLastInviteResult(null)
                setInviteOpen(true)
              }}
            >
              Invite member
            </Button>
          )}
        </Space>
      </div>

      {/* Pending invitations addressed to current user */}
      {overview?.pendingInvitesForMe && overview.pendingInvitesForMe.length > 0 && (
        <Alert
          type="info"
          showIcon
          icon={<MailOutlined />}
          style={{ marginBottom: 16 }}
          message="You have pending team invitations"
          description={
            <Space direction="vertical" style={{ width: '100%', marginTop: 6 }}>
              {overview.pendingInvitesForMe.map((inv) => (
                <div
                  key={inv.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    padding: '6px 10px',
                    background: 'rgba(124,92,255,0.1)',
                    borderRadius: 6
                  }}
                >
                  <span>
                    <strong>{inv.ownerName}</strong> ({inv.ownerEmail}) invited you as{' '}
                    <Tag color={ROLE_COLORS[inv.role] ?? 'blue'}>{inv.role.toUpperCase()}</Tag>
                  </span>
                  <Button
                    type="primary"
                    size="small"
                    loading={accepting}
                    onClick={() => handleAcceptInvite(inv.inviteToken)}
                  >
                    Accept & Join Team
                  </Button>
                </div>
              ))}
            </Space>
          }
        />
      )}

      {/* Active shared workspace banner */}
      {ws && !ws.isPersonalWorkspace && (
        <Alert
          type="success"
          showIcon
          icon={<UserSwitchOutlined />}
          style={{ marginBottom: 16 }}
          message={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                Viewing shared team workspace owned by <strong>{ws.ownerName}</strong> ({ws.ownerEmail}) — your role is{' '}
                <strong>{ws.myRole.toUpperCase()}</strong>.
              </span>
              <Button
                size="small"
                onClick={() => {
                  const personal = overview?.availableWorkspaces.find((w) => w.role === 'owner')
                  if (personal) void handleSwitchWorkspace(personal.ownerId)
                }}
              >
                Return to Personal Workspace
              </Button>
            </div>
          }
        />
      )}

      <Tabs
        items={[
          {
            key: 'members',
            label: (
              <Space size={6}>
                <TeamOutlined />
                <span>{t('team.members')}</span>
                <Badge
                  count={overview?.members.length ?? 0}
                  style={{ backgroundColor: '#7c5cff' }}
                   showZero
                />
              </Space>
            ),
            children: (
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 14,
                    flexWrap: 'wrap'
                  }}
                >
                  <Space wrap>
                    <Input.Search
                      allowClear
                      placeholder="Search by email, name, or role..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      style={{ width: 300 }}
                    />
                    <Select
                      value={statusFilter}
                      onChange={setStatusFilter}
                      style={{ width: 150 }}
                      options={[
                        { value: 'all', label: 'All statuses' },
                        { value: 'active', label: 'Active' },
                        { value: 'pending', label: 'Pending invite' },
                        { value: 'expired', label: 'Expired' },
                        { value: 'revoked', label: 'Revoked' }
                      ]}
                    />
                  </Space>
                  <Text type="secondary">
                    Showing {filteredMembers.length} of {overview?.members.length ?? 0} member(s)
                  </Text>
                </div>

                <Table<TeamMemberRow>
                  rowKey="id"
                  loading={loading}
                  dataSource={filteredMembers}
                  pagination={{ pageSize: 10, hideOnSinglePage: true }}
                  locale={{ emptyText: <Empty description={t('team.empty')} /> }}
                  columns={[
                    {
                      title: 'Member',
                      key: 'member',
                      render: (_, r) => (
                        <Space>
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              background: r.isOwner ? '#7c5cff' : '#2b2d3c',
                              color: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: 13
                            }}
                          >
                            {(r.name || r.email).slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600 }}>
                              {r.name}{' '}
                              {r.username && (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  @{r.username}
                                </Text>
                              )}
                            </div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {r.email}
                            </Text>
                          </div>
                        </Space>
                      )
                    },
                    {
                      title: 'Role',
                      key: 'role',
                      width: 160,
                      render: (_, r) =>
                        canManage && !r.isOwner ? (
                          <Select
                            size="small"
                            value={r.role}
                            onChange={(val) => handleRoleChange(r.id, val)}
                            style={{ width: 125 }}
                            options={[
                              { value: 'admin', label: 'Admin' },
                              { value: 'member', label: 'Member' },
                              { value: 'viewer', label: 'Viewer' }
                            ]}
                          />
                        ) : (
                          <Tag color={ROLE_COLORS[r.role] ?? 'default'} style={{ fontWeight: 600 }}>
                            {r.role.toUpperCase()}
                          </Tag>
                        )
                    },
                    {
                      title: 'Status',
                      key: 'status',
                      width: 170,
                      render: (_, r) => {
                        if (r.status === 'active') {
                          return (
                            <Tag icon={<CheckCircleOutlined />} color="success">
                              Active
                            </Tag>
                          )
                        }
                        if (r.status === 'pending') {
                          return (
                            <Tooltip
                              title={
                                r.inviteExpiresAt
                                  ? `Expires ${formatDateTime(r.inviteExpiresAt)}`
                                  : 'Pending acceptance'
                              }
                            >
                              <Tag icon={<ClockCircleOutlined />} color="gold">
                                Pending Invite
                              </Tag>
                            </Tooltip>
                          )
                        }
                        if (r.status === 'expired') {
                          return (
                            <Tag icon={<ClockCircleOutlined />} color="warning">
                              Expired
                            </Tag>
                          )
                        }
                        return (
                          <Tag icon={<StopOutlined />} color="error">
                            Revoked
                          </Tag>
                        )
                      }
                    },
                    {
                      title: 'Last Login',
                      key: 'lastLoginAt',
                      width: 185,
                      render: (_, r) => (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {r.lastLoginAt ? formatDateTime(r.lastLoginAt) : 'Never'}
                        </Text>
                      )
                    },
                    {
                      title: 'Joined / Invited',
                      key: 'joinedAt',
                      width: 185,
                      render: (_, r) => (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {formatDateTime(r.joinedAt || r.invitedAt)}
                        </Text>
                      )
                    },
                    {
                      title: 'Actions',
                      key: 'actions',
                      width: 240,
                      render: (_, r) => {
                        if (r.isOwner || !canManage) return <Text type="secondary">—</Text>
                        return (
                          <Space size={6} wrap>
                            {r.inviteUrl && (r.status === 'pending' || r.status === 'expired') && (
                              <Tooltip title="Copy Invite Link">
                                <Button
                                  size="small"
                                  icon={<LinkOutlined />}
                                  onClick={() => copyText(r.inviteUrl!, 'Invite link copied')}
                                >
                                  Copy Link
                                </Button>
                              </Tooltip>
                            )}
                            {r.status !== 'active' && (
                              <Tooltip title="Generate new token & resend invite">
                                <Button
                                  size="small"
                                  icon={<SendOutlined />}
                                  onClick={() => handleResend(r)}
                                >
                                  Resend
                                </Button>
                              </Tooltip>
                            )}
                            {r.status === 'pending' && (
                              <Tooltip title="Revoke pending invite">
                                <Button
                                  size="small"
                                  danger
                                  icon={<StopOutlined />}
                                  onClick={() => handleRevoke(r.id)}
                                />
                              </Tooltip>
                            )}
                            <Popconfirm
                              title={`Remove ${r.email} from team?`}
                              description="They will immediately lose access to shared workspace profiles."
                              okText="Remove"
                              okButtonProps={{ danger: true }}
                              onConfirm={() => handleRemove(r.id)}
                            >
                              <Button size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
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
            label: (
              <Space size={6}>
                <SafetyCertificateOutlined />
                <span>{t('team.roles')}</span>
              </Space>
            ),
            children: (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 16 }}>
                {(overview?.roles ?? []).map((role) => (
                  <Card
                    key={role.id}
                    size="small"
                    title={
                      <Space>
                        <Tag color={ROLE_COLORS[role.id] ?? 'default'} style={{ fontWeight: 700 }}>
                          {role.name.toUpperCase()}
                        </Tag>
                        {ws?.myRole === role.id && <Tag color="purple">Your Role</Tag>}
                      </Space>
                    }
                  >
                    <p style={{ minHeight: 44, color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>
                      {role.description}
                    </p>
                    <Descriptions column={1} size="small" bordered>
                      <Descriptions.Item label="View Profiles, Groups & Proxies">
                        {role.permissions.readProfiles ? <Tag color="success">Allowed</Tag> : <Tag>Denied</Tag>}
                      </Descriptions.Item>
                      <Descriptions.Item label="Launch Browser & Sync Sessions">
                        {role.permissions.launchProfiles ? <Tag color="success">Allowed</Tag> : <Tag>Denied</Tag>}
                      </Descriptions.Item>
                      <Descriptions.Item label="Create & Edit Profiles / Proxies">
                        {role.permissions.writeProfiles ? <Tag color="success">Allowed</Tag> : <Tag>Denied</Tag>}
                      </Descriptions.Item>
                      <Descriptions.Item label="Delete / Trash Profiles">
                        {role.permissions.deleteProfiles ? <Tag color="success">Allowed</Tag> : <Tag>Denied</Tag>}
                      </Descriptions.Item>
                      <Descriptions.Item label="Invite & Manage Team Members">
                        {role.permissions.manageTeam ? <Tag color="success">Allowed</Tag> : <Tag>Denied</Tag>}
                      </Descriptions.Item>
                      <Descriptions.Item label="Workspace Billing & Plan Quota">
                        {role.permissions.manageBilling ? <Tag color="success">Allowed</Tag> : <Tag>Denied</Tag>}
                      </Descriptions.Item>
                    </Descriptions>
                  </Card>
                ))}
              </div>
            )
          },
          {
            key: 'activity',
            label: (
              <Space size={6}>
                <ClockCircleOutlined />
                <span>{t('team.activity')}</span>
                <Badge
                  count={overview?.activity.length ?? 0}
                  overflowCount={999}
                  style={{ backgroundColor: '#3b3e52' }}
                />
              </Space>
            ),
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                  <Input.Search
                    allowClear
                    placeholder="Filter activity by actor, event, or target..."
                    value={activitySearch}
                    onChange={(e) => setActivitySearch(e.target.value)}
                    style={{ width: 340 }}
                  />
                  <Text type="secondary">{filteredActivity.length} event(s)</Text>
                </div>
                <Table<TeamActivityRow>
                  rowKey="id"
                  loading={loading}
                  dataSource={filteredActivity}
                  pagination={{ pageSize: 15, hideOnSinglePage: true }}
                  locale={{ emptyText: <Empty description="No activity recorded yet" /> }}
                  columns={[
                    {
                      title: 'Time',
                      dataIndex: 'createdAt',
                      width: 190,
                      render: (v: string) => (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {formatDateTime(v)}
                        </Text>
                      )
                    },
                    {
                      title: 'Actor',
                      key: 'actor',
                      width: 220,
                      render: (_, r) => (
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{r.actorName || r.actorEmail}</div>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {r.actorEmail}
                          </Text>
                        </div>
                      )
                    },
                    {
                      title: 'Event',
                      dataIndex: 'action',
                      width: 165,
                      render: (action: string) => (
                        <Tag color={actionBadgeColor(action)} style={{ fontFamily: 'monospace' }}>
                          {action}
                        </Tag>
                      )
                    },
                    {
                      title: 'Target',
                      dataIndex: 'target',
                      width: 190,
                      render: (tVal: string) => <Text code>{tVal || '—'}</Text>
                    },
                    {
                      title: 'Details',
                      dataIndex: 'detail',
                      render: (d: string) => <Text style={{ fontSize: 13 }}>{d}</Text>
                    },
                    {
                      title: 'IP',
                      dataIndex: 'ip',
                      width: 130,
                      render: (ip: string | null) => (
                        <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>
                          {ip || '—'}
                        </Text>
                      )
                    }
                  ]}
                />
              </div>
            )
          }
        ]}
      />

      {/* Invite Member Modal */}
      <Modal
        title="Invite Team Member"
        open={inviteOpen}
        onCancel={() => setInviteOpen(false)}
        onOk={handleInviteSubmit}
        okText="Send Invitation"
        confirmLoading={inviting}
        width={540}
      >
        <Form layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="Email Address" required>
            <Input
              placeholder="colleague@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onPressEnter={handleInviteSubmit}
            />
          </Form.Item>
          <Form.Item label="Role">
            <Select
              value={inviteRole}
              onChange={(v) => setInviteRole(v)}
              options={[
                {
                  value: 'admin',
                  label: 'Admin — Full profile & team management'
                },
                {
                  value: 'member',
                  label: 'Member — Create, edit & launch profiles (cannot delete or manage team)'
                },
                {
                  value: 'viewer',
                  label: 'Viewer — Read-only access to view profiles'
                }
              ]}
            />
          </Form.Item>
          <Form.Item label="Invite Expiration">
            <Select
              value={inviteExpiresDays}
              onChange={(v) => setInviteExpiresDays(v)}
              options={[
                { value: 1, label: '24 hours (1 day)' },
                { value: 7, label: '7 days (default)' },
                { value: 14, label: '14 days' },
                { value: 30, label: '30 days' }
              ]}
            />
          </Form.Item>
        </Form>

        {lastInviteResult && (
          <Alert
            type={lastInviteResult.emailSent ? 'success' : 'info'}
            showIcon
            style={{ marginTop: 12 }}
            message={
              lastInviteResult.emailSent
                ? `Email sent to ${lastInviteResult.email} via ${lastInviteResult.emailProvider.toUpperCase()}`
                : `Copyable Invite Link for ${lastInviteResult.email}`
            }
            description={
              <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 6 }}>
                <div style={{ fontSize: 12 }}>
                  Share this invite link or token with <strong>{lastInviteResult.email}</strong>. They can open the link in their browser or paste the token into <strong>Team → Accept Invite Token</strong>:
                </div>
                <Input.Group compact style={{ display: 'flex' }}>
                  <Input readOnly value={lastInviteResult.inviteUrl} style={{ fontFamily: 'monospace', fontSize: 12 }} />
                  <Button
                    type="primary"
                    icon={<CopyOutlined />}
                    onClick={() => copyText(lastInviteResult.inviteUrl, 'Invite link copied!')}
                  >
                    Copy Link
                  </Button>
                </Input.Group>
                <Input.Group compact style={{ display: 'flex' }}>
                  <Input
                    readOnly
                    addonBefore="Token"
                    value={lastInviteResult.inviteToken}
                    style={{ fontFamily: 'monospace', fontSize: 12 }}
                  />
                  <Button
                    icon={<CopyOutlined />}
                    onClick={() => copyText(lastInviteResult.inviteToken, 'Invite token copied!')}
                  >
                    Copy Token
                  </Button>
                </Input.Group>
              </Space>
            }
          />
        )}
      </Modal>

      {/* Accept Invite Modal */}
      <Modal
        title="Accept Team Invitation"
        open={acceptOpen}
        onCancel={() => setAcceptOpen(false)}
        onOk={() => handleAcceptInvite()}
        okText="Accept Invitation"
        confirmLoading={accepting}
      >
        <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>
          Paste the invitation link or token shared by your team owner/admin. Your account email must match the invited address.
        </p>
        <Input
          placeholder="Paste invite link (https://.../#/invite?token=...) or token"
          value={acceptToken}
          onChange={(e) => setAcceptToken(e.target.value)}
          onPressEnter={() => handleAcceptInvite()}
          style={{ fontFamily: 'monospace' }}
        />
      </Modal>
    </div>
  )
}
