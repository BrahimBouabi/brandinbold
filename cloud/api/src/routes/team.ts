import { randomBytes } from 'node:crypto'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { teamActivity, teamMembers, users } from '../db/schema.js'
import { buildInviteUrl, sendInviteEmail } from '../lib/mailer.js'

export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer'
export type MemberStatus = 'active' | 'pending' | 'revoked' | 'expired'

export interface RolePermissions {
  readProfiles: boolean
  launchProfiles: boolean
  writeProfiles: boolean
  deleteProfiles: boolean
  manageTeam: boolean
  manageBilling: boolean
}

export interface RoleDefinition {
  id: TeamRole
  name: string
  color: string
  description: string
  permissions: RolePermissions
}

export const TEAM_ROLES: Record<TeamRole, RoleDefinition> = {
  owner: {
    id: 'owner',
    name: 'Owner',
    color: 'purple',
    description: 'Full access to workspace profiles, proxies, sessions, team members, roles, and billing.',
    permissions: {
      readProfiles: true,
      launchProfiles: true,
      writeProfiles: true,
      deleteProfiles: true,
      manageTeam: true,
      manageBilling: true
    }
  },
  admin: {
    id: 'admin',
    name: 'Admin',
    color: 'blue',
    description: 'Can invite and manage team members, and create, edit, launch, or delete profiles, groups, and proxies.',
    permissions: {
      readProfiles: true,
      launchProfiles: true,
      writeProfiles: true,
      deleteProfiles: true,
      manageTeam: true,
      manageBilling: false
    }
  },
  member: {
    id: 'member',
    name: 'Member',
    color: 'green',
    description: 'Can create, edit, launch, and sync browser profiles, groups, proxies, and session states. Cannot delete profiles or manage team.',
    permissions: {
      readProfiles: true,
      launchProfiles: true,
      writeProfiles: true,
      deleteProfiles: false,
      manageTeam: false,
      manageBilling: false
    }
  },
  viewer: {
    id: 'viewer',
    name: 'Viewer',
    color: 'default',
    description: 'Read-only access to view workspace profiles, groups, proxies, and team members. Cannot modify or delete data.',
    permissions: {
      readProfiles: true,
      launchProfiles: false,
      writeProfiles: false,
      deleteProfiles: false,
      manageTeam: false,
      manageBilling: false
    }
  }
}

export function maxTeamSeatsForPlan(plan: string): number {
  const envOverride = Number(process.env.MAX_TEAM_SEATS || 0)
  if (envOverride > 0) return envOverride
  if (plan === 'team') return 50
  if (plan === 'pro') return 10
  return 3 // Free plan: Owner + up to 2 invited members (3 total seats)
}

export interface EffectiveWorkspace {
  ownerId: string
  ownerUser: typeof users.$inferSelect
  actorUser: typeof users.$inferSelect
  role: TeamRole
  permissions: RolePermissions
}

export async function resolveEffectiveWorkspace(userId: string): Promise<EffectiveWorkspace> {
  const actorRows = await db.select().from(users).where(eq(users.id, userId))
  if (!actorRows.length) {
    throw Object.assign(new Error('User not found'), { statusCode: 401 })
  }
  const actorUser = actorRows[0]

  if (actorUser.activeTeamOwnerId && actorUser.activeTeamOwnerId !== actorUser.id) {
    const [ownerRows, membershipRows] = await Promise.all([
      db.select().from(users).where(eq(users.id, actorUser.activeTeamOwnerId)),
      db
        .select()
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.ownerId, actorUser.activeTeamOwnerId),
            eq(teamMembers.memberUserId, actorUser.id),
            eq(teamMembers.status, 'active')
          )
        )
    ])
    if (ownerRows.length && membershipRows.length) {
      const role = (['admin', 'member', 'viewer'].includes(membershipRows[0].role)
        ? membershipRows[0].role
        : 'member') as TeamRole
      return {
        ownerId: ownerRows[0].id,
        ownerUser: ownerRows[0],
        actorUser,
        role,
        permissions: TEAM_ROLES[role].permissions
      }
    }
    // Membership no longer active — reset to personal workspace
    await db.update(users).set({ activeTeamOwnerId: null }).where(eq(users.id, actorUser.id))
  }

  return {
    ownerId: actorUser.id,
    ownerUser: actorUser,
    actorUser,
    role: 'owner',
    permissions: TEAM_ROLES.owner.permissions
  }
}

export async function logTeamActivity(params: {
  ownerId: string
  actorUserId?: string | null
  actorEmail: string
  actorName: string
  action: string
  target?: string | null
  detail?: string | null
  ip?: string | null
}): Promise<void> {
  try {
    await db.insert(teamActivity).values({
      ownerId: params.ownerId,
      actorUserId: params.actorUserId ?? null,
      actorEmail: params.actorEmail,
      actorName: params.actorName || params.actorEmail.split('@')[0],
      action: params.action,
      target: params.target ?? null,
      detail: params.detail ?? null,
      ip: params.ip ?? null
    })
  } catch {
    /* non-fatal audit write */
  }
}

function computeEffectiveStatus(row: typeof teamMembers.$inferSelect): MemberStatus {
  if (row.status === 'pending' && row.inviteExpiresAt && row.inviteExpiresAt.getTime() < Date.now()) {
    return 'expired'
  }
  return (row.status as MemberStatus) || 'pending'
}

export async function getTeamOverview(userId: string, search?: string) {
  const ws = await resolveEffectiveWorkspace(userId)
  const memberRows = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.ownerId, ws.ownerId))
    .orderBy(desc(teamMembers.createdAt))

  // Fetch linked user records for memberRows
  const linkedUserIds = memberRows.map((m) => m.memberUserId).filter((id): id is string => !!id)
  const linkedUsers = linkedUserIds.length
    ? await db.select().from(users).where(inArray(users.id, linkedUserIds))
    : []
  const userById = new Map(linkedUsers.map((u) => [u.id, u]))

  // Auto-mark expired invites in DB if needed
  const now = Date.now()
  for (const m of memberRows) {
    if (m.status === 'pending' && m.inviteExpiresAt && m.inviteExpiresAt.getTime() < now) {
      await db
        .update(teamMembers)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(teamMembers.id, m.id))
      m.status = 'expired'
    }
  }

  const ownerEntry = {
    id: `owner-${ws.ownerUser.id}`,
    ownerId: ws.ownerId,
    memberUserId: ws.ownerUser.id,
    email: ws.ownerUser.email,
    name: ws.ownerUser.name,
    username: ws.ownerUser.username || ws.ownerUser.email.split('@')[0],
    role: 'owner' as TeamRole,
    status: 'active' as MemberStatus,
    inviteToken: null as string | null,
    inviteUrl: null as string | null,
    inviteExpiresAt: null as string | null,
    lastLoginAt: ws.ownerUser.lastLoginAt ? ws.ownerUser.lastLoginAt.toISOString() : null,
    joinedAt: ws.ownerUser.createdAt.toISOString(),
    createdAt: ws.ownerUser.createdAt.toISOString(),
    isOwner: true
  }

  const mappedMembers = [
    ownerEntry,
    ...memberRows.map((m) => {
      const u = m.memberUserId ? userById.get(m.memberUserId) : undefined
      const effStatus = computeEffectiveStatus(m)
      return {
        id: m.id,
        ownerId: m.ownerId,
        memberUserId: m.memberUserId,
        email: m.email,
        name: u?.name || m.email.split('@')[0],
        username: u?.username || null,
        role: m.role as TeamRole,
        status: effStatus,
        inviteToken: ws.permissions.manageTeam && effStatus === 'pending' ? m.inviteToken : null,
        inviteUrl:
          ws.permissions.manageTeam && effStatus === 'pending' && m.inviteToken
            ? buildInviteUrl(m.inviteToken)
            : null,
        inviteExpiresAt: m.inviteExpiresAt ? m.inviteExpiresAt.toISOString() : null,
        lastLoginAt: u?.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        joinedAt: m.joinedAt ? m.joinedAt.toISOString() : null,
        createdAt: m.createdAt.toISOString(),
        isOwner: false
      }
    })
  ]

  const q = (search ?? '').trim().toLowerCase()
  const filteredMembers = q
    ? mappedMembers.filter(
        (m) =>
          m.email.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          (m.username && m.username.toLowerCase().includes(q)) ||
          m.role.toLowerCase().includes(q) ||
          m.status.toLowerCase().includes(q)
      )
    : mappedMembers

  const activeOrPendingCount =
    1 + memberRows.filter((m) => m.status === 'active' || m.status === 'pending').length
  const maxMembers = maxTeamSeatsForPlan(ws.ownerUser.plan)

  // Activity log
  const activityRows = await db
    .select()
    .from(teamActivity)
    .where(eq(teamActivity.ownerId, ws.ownerId))
    .orderBy(desc(teamActivity.createdAt))
    .limit(100)

  // Pending invites addressed to this actorUser's email
  const myPendingRows = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.email, ws.actorUser.email.toLowerCase()), eq(teamMembers.status, 'pending')))

  const inviterOwnerIds = [...new Set(myPendingRows.map((r) => r.ownerId))]
  const inviterOwners = inviterOwnerIds.length
    ? await db.select().from(users).where(inArray(users.id, inviterOwnerIds))
    : []
  const ownerMap = new Map(inviterOwners.map((o) => [o.id, o]))

  const myPendingInvites = myPendingRows
    .filter((r) => !r.inviteExpiresAt || r.inviteExpiresAt.getTime() > Date.now())
    .map((r) => {
      const o = ownerMap.get(r.ownerId)
      return {
        id: r.id,
        ownerId: r.ownerId,
        ownerName: o?.name ?? 'Team Owner',
        ownerEmail: o?.email ?? '',
        role: r.role,
        inviteToken: r.inviteToken,
        inviteExpiresAt: r.inviteExpiresAt ? r.inviteExpiresAt.toISOString() : null,
        createdAt: r.createdAt.toISOString()
      }
    })

  // Joined workspaces so the user can switch between their own workspace and joined teams
  const myActiveMemberships = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.memberUserId, ws.actorUser.id), eq(teamMembers.status, 'active')))
  const joinedOwnerIds = [...new Set(myActiveMemberships.map((m) => m.ownerId))]
  const joinedOwners = joinedOwnerIds.length
    ? await db.select().from(users).where(inArray(users.id, joinedOwnerIds))
    : []
  const joinedOwnerMap = new Map(joinedOwners.map((o) => [o.id, o]))

  const joinedWorkspaces = [
    {
      ownerId: ws.actorUser.id,
      name: `${ws.actorUser.name} (Personal)`,
      ownerName: `${ws.actorUser.name} (Personal)`,
      email: ws.actorUser.email,
      ownerEmail: ws.actorUser.email,
      role: 'owner' as TeamRole,
      active: ws.ownerId === ws.actorUser.id
    },
    ...myActiveMemberships
      .map((m) => {
        const o = joinedOwnerMap.get(m.ownerId)
        if (!o) return null
        return {
          ownerId: o.id,
          name: `${o.name}'s Team`,
          ownerName: `${o.name}'s Team`,
          email: o.email,
          ownerEmail: o.email,
          role: m.role as TeamRole,
          active: ws.ownerId === o.id
        }
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
  ]

  return {
    workspace: {
      ownerId: ws.ownerId,
      ownerName: ws.ownerUser.name,
      ownerEmail: ws.ownerUser.email,
      plan: ws.ownerUser.plan,
      maxMembers,
      usedMembers: activeOrPendingCount,
      maxSeats: maxMembers,
      activeSeats: activeOrPendingCount,
      myRole: ws.role,
      permissions: ws.permissions,
      isPersonalWorkspace: ws.ownerId === ws.actorUser.id
    },
    members: filteredMembers,
    roles: Object.values(TEAM_ROLES),
    activity: activityRows.map((a) => ({
      id: a.id,
      ownerId: a.ownerId,
      actorUserId: a.actorUserId,
      actorEmail: a.actorEmail,
      actorName: a.actorName,
      action: a.action,
      target: a.target,
      detail: a.detail,
      ip: a.ip,
      createdAt: a.createdAt.toISOString()
    })),
    myPendingInvites,
    pendingInvitesForMe: myPendingInvites,
    joinedWorkspaces,
    availableWorkspaces: joinedWorkspaces
  }
}

export async function inviteTeamMember(
  userId: string,
  payload: { email?: string; role?: string; expiresInDays?: number },
  ip?: string
) {
  const ws = await resolveEffectiveWorkspace(userId)
  if (!ws.permissions.manageTeam) {
    throw Object.assign(new Error('Forbidden: Only Owner or Admin can invite team members'), { statusCode: 403 })
  }

  const email = (payload.email ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw Object.assign(new Error('Valid email address required'), { statusCode: 400 })
  }
  if (email === ws.ownerUser.email.toLowerCase()) {
    throw Object.assign(new Error('This email is already the team Owner'), { statusCode: 400 })
  }

  const role = (payload.role ?? 'member').toLowerCase()
  if (!['admin', 'member', 'viewer'].includes(role)) {
    throw Object.assign(new Error('Role must be admin, member, or viewer'), { statusCode: 400 })
  }

  const existing = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.ownerId, ws.ownerId))

  const dup = existing.find(
    (m) => m.email.toLowerCase() === email && (m.status === 'active' || m.status === 'pending')
  )
  if (dup) {
    throw Object.assign(new Error(`${email} is already an active or pending member of this team`), { statusCode: 409 })
  }

  const usedSeats = 1 + existing.filter((m) => m.status === 'active' || m.status === 'pending').length
  const maxSeats = maxTeamSeatsForPlan(ws.ownerUser.plan)
  if (usedSeats >= maxSeats) {
    throw Object.assign(
      new Error(
        `Team member limit reached (${usedSeats}/${maxSeats} seats on ${ws.ownerUser.plan.toUpperCase()} plan). Upgrade your plan to invite more members.`
      ),
      { statusCode: 403, code: 'team_quota_exceeded', reason: 'team_quota_exceeded', maxSeats, maxMembers: maxSeats }
    )
  }

  const days = payload.expiresInDays !== undefined ? Number(payload.expiresInDays) : 7
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  const inviteToken = randomBytes(24).toString('hex')

  // Check if invited email already corresponds to a registered user
  const existingUsers = await db.select().from(users).where(eq(users.email, email))
  const linkedUserId = existingUsers[0]?.id ?? null

  // If there was a previously revoked/expired row for this email, reuse/update it
  const prevRow = existing.find((m) => m.email.toLowerCase() === email)
  let savedRow: typeof teamMembers.$inferSelect
  if (prevRow) {
    const [updated] = await db
      .update(teamMembers)
      .set({
        memberUserId: linkedUserId,
        role,
        status: 'pending',
        inviteToken,
        inviteExpiresAt: expiresAt,
        invitedByUserId: ws.actorUser.id,
        updatedAt: new Date()
      })
      .where(eq(teamMembers.id, prevRow.id))
      .returning()
    savedRow = updated
  } else {
    const [inserted] = await db
      .insert(teamMembers)
      .values({
        ownerId: ws.ownerId,
        memberUserId: linkedUserId,
        email,
        role,
        status: 'pending',
        inviteToken,
        inviteExpiresAt: expiresAt,
        invitedByUserId: ws.actorUser.id
      })
      .returning()
    savedRow = inserted
  }

  const mailRes = await sendInviteEmail({
    to: email,
    inviterName: ws.actorUser.name,
    inviterEmail: ws.actorUser.email,
    role,
    inviteToken,
    expiresAt: expiresAt.toISOString()
  })

  await logTeamActivity({
    ownerId: ws.ownerId,
    actorUserId: ws.actorUser.id,
    actorEmail: ws.actorUser.email,
    actorName: ws.actorUser.name,
    action: 'member.invited',
    target: email,
    detail: `Invited as ${role.toUpperCase()} (delivery: ${mailRes.provider})`,
    ip
  })

  return {
    member: {
      id: savedRow.id,
      email: savedRow.email,
      role: savedRow.role,
      status: computeEffectiveStatus(savedRow),
      inviteToken,
      inviteUrl: mailRes.inviteUrl,
      inviteExpiresAt: expiresAt.toISOString(),
      createdAt: savedRow.createdAt.toISOString()
    },
    inviteToken,
    inviteUrl: mailRes.inviteUrl,
    emailSent: mailRes.sent,
    emailProvider: mailRes.provider
  }
}

export async function resendTeamInvite(userId: string, memberId: string, ip?: string) {
  const ws = await resolveEffectiveWorkspace(userId)
  if (!ws.permissions.manageTeam) {
    throw Object.assign(new Error('Forbidden: Only Owner or Admin can resend invitations'), { statusCode: 403 })
  }

  const rows = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.id, memberId), eq(teamMembers.ownerId, ws.ownerId)))
  if (!rows.length) throw Object.assign(new Error('Team member not found'), { statusCode: 404 })
  const row = rows[0]
  if (row.status === 'active') {
    throw Object.assign(new Error('Member has already accepted the invitation'), { statusCode: 400 })
  }

  const inviteToken = randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const [updated] = await db
    .update(teamMembers)
    .set({
      status: 'pending',
      inviteToken,
      inviteExpiresAt: expiresAt,
      updatedAt: new Date()
    })
    .where(eq(teamMembers.id, row.id))
    .returning()

  const mailRes = await sendInviteEmail({
    to: row.email,
    inviterName: ws.actorUser.name,
    inviterEmail: ws.actorUser.email,
    role: row.role,
    inviteToken,
    expiresAt: expiresAt.toISOString()
  })

  await logTeamActivity({
    ownerId: ws.ownerId,
    actorUserId: ws.actorUser.id,
    actorEmail: ws.actorUser.email,
    actorName: ws.actorUser.name,
    action: 'member.resent',
    target: row.email,
    detail: `Resent ${row.role.toUpperCase()} invitation (new 7-day token)`,
    ip
  })

  return {
    member: {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      status: 'pending' as MemberStatus,
      inviteToken,
      inviteUrl: mailRes.inviteUrl,
      inviteExpiresAt: expiresAt.toISOString()
    },
    inviteToken,
    inviteUrl: mailRes.inviteUrl,
    emailSent: mailRes.sent,
    emailProvider: mailRes.provider
  }
}

export async function revokeTeamInvite(userId: string, memberId: string, ip?: string) {
  const ws = await resolveEffectiveWorkspace(userId)
  if (!ws.permissions.manageTeam) {
    throw Object.assign(new Error('Forbidden: Only Owner or Admin can revoke invitations'), { statusCode: 403 })
  }

  const rows = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.id, memberId), eq(teamMembers.ownerId, ws.ownerId)))
  if (!rows.length) throw Object.assign(new Error('Team member not found'), { statusCode: 404 })
  const row = rows[0]

  await db
    .update(teamMembers)
    .set({
      status: 'revoked',
      inviteToken: null,
      updatedAt: new Date()
    })
    .where(eq(teamMembers.id, row.id))

  if (row.memberUserId) {
    await db
      .update(users)
      .set({ activeTeamOwnerId: null })
      .where(and(eq(users.id, row.memberUserId), eq(users.activeTeamOwnerId, ws.ownerId)))
  }

  await logTeamActivity({
    ownerId: ws.ownerId,
    actorUserId: ws.actorUser.id,
    actorEmail: ws.actorUser.email,
    actorName: ws.actorUser.name,
    action: 'member.revoked',
    target: row.email,
    detail: `Revoked ${row.role.toUpperCase()} invitation/access`,
    ip
  })

  return { ok: true, revoked: true }
}

export async function updateTeamMemberRole(userId: string, memberId: string, roleInput: string, ip?: string) {
  const ws = await resolveEffectiveWorkspace(userId)
  if (!ws.permissions.manageTeam) {
    throw Object.assign(new Error('Forbidden: Only Owner or Admin can change member roles'), { statusCode: 403 })
  }

  const role = (roleInput ?? '').trim().toLowerCase()
  if (!['admin', 'member', 'viewer'].includes(role)) {
    throw Object.assign(new Error('Role must be admin, member, or viewer'), { statusCode: 400 })
  }

  const rows = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.id, memberId), eq(teamMembers.ownerId, ws.ownerId)))
  if (!rows.length) throw Object.assign(new Error('Team member not found'), { statusCode: 404 })
  const row = rows[0]

  const prevRole = row.role
  await db
    .update(teamMembers)
    .set({ role, updatedAt: new Date() })
    .where(eq(teamMembers.id, row.id))

  await logTeamActivity({
    ownerId: ws.ownerId,
    actorUserId: ws.actorUser.id,
    actorEmail: ws.actorUser.email,
    actorName: ws.actorUser.name,
    action: 'member.role_changed',
    target: row.email,
    detail: `Changed role from ${prevRole.toUpperCase()} to ${role.toUpperCase()}`,
    ip
  })

  return { ok: true, role }
}

export async function removeTeamMember(userId: string, memberId: string, ip?: string) {
  const ws = await resolveEffectiveWorkspace(userId)
  const rows = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.id, memberId), eq(teamMembers.ownerId, ws.ownerId)))
  if (!rows.length) throw Object.assign(new Error('Team member not found'), { statusCode: 404 })
  const row = rows[0]

  const isSelf = row.memberUserId === ws.actorUser.id
  if (!ws.permissions.manageTeam && !isSelf) {
    throw Object.assign(new Error('Forbidden: Only Owner or Admin can remove team members'), { statusCode: 403 })
  }

  await db.delete(teamMembers).where(eq(teamMembers.id, row.id))

  if (row.memberUserId) {
    await db
      .update(users)
      .set({ activeTeamOwnerId: null })
      .where(and(eq(users.id, row.memberUserId), eq(users.activeTeamOwnerId, ws.ownerId)))
  }

  await logTeamActivity({
    ownerId: ws.ownerId,
    actorUserId: ws.actorUser.id,
    actorEmail: ws.actorUser.email,
    actorName: ws.actorUser.name,
    action: 'member.removed',
    target: row.email,
    detail: isSelf ? `${row.email} left the team` : `Removed ${row.email} (${row.role.toUpperCase()}) from team`,
    ip
  })

  return { ok: true, removed: true }
}

export async function acceptTeamInvite(userId: string, rawToken: string, ip?: string) {
  const token = (rawToken ?? '').trim()
  if (!token) throw Object.assign(new Error('Invite token required'), { statusCode: 400 })

  const actorRows = await db.select().from(users).where(eq(users.id, userId))
  if (!actorRows.length) throw Object.assign(new Error('User not found'), { statusCode: 401 })
  const actor = actorRows[0]

  const rows = await db.select().from(teamMembers).where(eq(teamMembers.inviteToken, token))
  if (!rows.length) {
    throw Object.assign(new Error('Invalid or revoked invitation token'), { statusCode: 404 })
  }
  const invite = rows[0]

  if (invite.status === 'revoked') {
    throw Object.assign(new Error('This invitation has been revoked'), { statusCode: 410 })
  }
  if (invite.inviteExpiresAt && invite.inviteExpiresAt.getTime() < Date.now()) {
    await db
      .update(teamMembers)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(eq(teamMembers.id, invite.id))
    throw Object.assign(new Error('This invitation token has expired'), { statusCode: 410 })
  }

  // Ensure the accepting user matches the invited email (or allow if they authenticated with that email)
  if (invite.email.toLowerCase() !== actor.email.toLowerCase()) {
    throw Object.assign(
      new Error(`This invitation was sent to ${invite.email} (currently signed in as ${actor.email})`),
      { statusCode: 403 }
    )
  }

  await db
    .update(teamMembers)
    .set({
      memberUserId: actor.id,
      status: 'active',
      inviteToken: null,
      joinedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(teamMembers.id, invite.id))

  await db.update(users).set({ activeTeamOwnerId: invite.ownerId }).where(eq(users.id, actor.id))

  await logTeamActivity({
    ownerId: invite.ownerId,
    actorUserId: actor.id,
    actorEmail: actor.email,
    actorName: actor.name,
    action: 'member.accepted',
    target: actor.email,
    detail: `Accepted invitation and joined as ${invite.role.toUpperCase()}`,
    ip
  })

  return {
    ok: true,
    accepted: true,
    ownerId: invite.ownerId,
    role: invite.role
  }
}

export async function switchTeamWorkspace(userId: string, targetOwnerId: string | null, ip?: string) {
  const actorRows = await db.select().from(users).where(eq(users.id, userId))
  if (!actorRows.length) throw Object.assign(new Error('User not found'), { statusCode: 401 })
  const actor = actorRows[0]

  if (!targetOwnerId || targetOwnerId === actor.id) {
    await db.update(users).set({ activeTeamOwnerId: null }).where(eq(users.id, actor.id))
    return { ok: true, activeTeamOwnerId: null, effectiveOwnerId: actor.id, role: 'owner' }
  }

  const membership = await db
    .select()
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.ownerId, targetOwnerId),
        eq(teamMembers.memberUserId, actor.id),
        eq(teamMembers.status, 'active')
      )
    )
  if (!membership.length) {
    throw Object.assign(new Error('You are not an active member of that team workspace'), { statusCode: 403 })
  }

  await db.update(users).set({ activeTeamOwnerId: targetOwnerId }).where(eq(users.id, actor.id))
  void ip
  return { ok: true, activeTeamOwnerId: targetOwnerId, role: membership[0].role }
}
