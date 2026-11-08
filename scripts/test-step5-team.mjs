#!/usr/bin/env node
/**
 * Step 5 Verification Suite — Team Management (Members, Roles, Activity, Invites, Quotas, RBAC)
 * Tests end-to-end against http://localhost:8787
 */

import { randomUUID } from 'node:crypto'

const API_URL = process.env.API_URL || 'http://localhost:8787'

let passed = 0
let failed = 0

function assert(cond, label, detail = '') {
  if (cond) {
    passed++
    console.log(`  ✓ ${label}${detail ? ` (${detail})` : ''}`)
  } else {
    failed++
    console.error(`  ✗ FAIL: ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

async function req(method, path, body = undefined, token = undefined) {
  const headers = {}
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined && !(body instanceof Buffer)) headers['content-type'] = 'application/json'
  if (body instanceof Buffer) headers['content-type'] = 'application/octet-stream'

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : body instanceof Buffer ? body : JSON.stringify(body)
  })
  const ct = res.headers.get('content-type') || ''
  const data = ct.includes('json') ? await res.json() : await res.text()
  return { status: res.status, data }
}

async function main() {
  console.log('=== Step 5 Verification: Team Management (Members / Roles / Activity / RBAC) ===\n')

  const runId = Date.now()
  const ownerEmail = `owner_${runId}@brandinbold.test`
  const member1Email = `member1_${runId}@brandinbold.test`
  const member2Email = `member2_${runId}@brandinbold.test`
  const member3Email = `member3_${runId}@brandinbold.test`
  const pw = 'StrongPass123'

  // ---------------------------------------------------------------------------
  // 1. Register Owner + initial GET /api/team overview
  // ---------------------------------------------------------------------------
  console.log('1. Register Owner & verify initial Team overview (Owner, Roles, Login Activity)')
  const regOwner = await req('POST', '/api/auth/register', {
    email: ownerEmail,
    name: 'Alice Owner',
    password: pw
  })
  assert(regOwner.status === 200, 'Owner registered', ownerEmail)
  assert(!!regOwner.data.user?.lastLoginAt, 'Owner lastLoginAt populated on register', regOwner.data.user?.lastLoginAt)
  const ownerToken = regOwner.data.token
  const ownerId = regOwner.data.user.id

  // Seed 1 profile in Owner's workspace
  const ownerProfileId = randomUUID()
  const seedPush = await req(
    'PUT',
    '/api/sync/push',
    {
      profiles: [{ id: ownerProfileId, name: 'Team Shared Profile 1', os: 'macos', updatedAt: new Date().toISOString() }]
    },
    ownerToken
  )
  assert(seedPush.status === 200 && seedPush.data.profiles === 1, 'Owner seeded 1 profile in workspace')

  const initTeam = await req('GET', '/api/team', undefined, ownerToken)
  assert(initTeam.status === 200, 'GET /api/team returns 200')
  assert(initTeam.data.workspace?.myRole === 'owner', 'Workspace role is owner')
  assert(initTeam.data.workspace?.maxSeats === 3, 'Free plan maxSeats is 3', `got ${initTeam.data.workspace?.maxSeats}`)
  assert(initTeam.data.members?.length === 1 && initTeam.data.members[0].isOwner === true, 'Owner listed as first active member')
  assert(initTeam.data.roles?.length === 4, 'All 4 roles returned (Owner, Admin, Member, Viewer)')
  assert(
    initTeam.data.activity?.some((a) => a.action === 'auth.register') &&
      initTeam.data.activity?.some((a) => a.action === 'profile.synced'),
    'Activity log recorded auth.register and profile.synced'
  )

  // ---------------------------------------------------------------------------
  // 2. Invite Member 1 + Copyable Invite Link + Search + Plan Seat Quota
  // ---------------------------------------------------------------------------
  console.log('\n2. Invite Members, Copyable Invite Link Fallback, Search & Plan Seat Quota (Max 3 Seats)')
  const inv1 = await req(
    'POST',
    '/api/team/invite',
    { email: member1Email, role: 'member', expiresInDays: 7 },
    ownerToken
  )
  assert(inv1.status === 200, 'Invited member1 as member')
  assert(
    typeof inv1.data.inviteToken === 'string' && inv1.data.inviteToken.length >= 32,
    'Returned cryptographic inviteToken'
  )
  assert(
    typeof inv1.data.inviteUrl === 'string' && inv1.data.inviteUrl.includes(inv1.data.inviteToken),
    'Returned copyable inviteUrl fallback',
    inv1.data.inviteUrl
  )
  const member1RowId = inv1.data.member.id

  // Invite Member 2 with ALREADY EXPIRED token (expiresInDays: -1) to test expiry + resend
  const inv2 = await req(
    'POST',
    '/api/team/invite',
    { email: member2Email, role: 'viewer', expiresInDays: -1 },
    ownerToken
  )
  assert(inv2.status === 200, 'Invited member2 (3rd seat on free plan)')
  const expiredToken2 = inv2.data.inviteToken
  const member2RowId = inv2.data.member.id

  // Attempt 3rd invite (4th seat total on free plan with maxSeats = 3) -> must be rejected with 403 team_quota_exceeded
  const inv3OverQuota = await req(
    'POST',
    '/api/team/invite',
    { email: member3Email, role: 'viewer' },
    ownerToken
  )
  assert(
    inv3OverQuota.status === 403 && inv3OverQuota.data.code === 'team_quota_exceeded',
    '4th team seat rejected by Free plan limit (3 seats)',
    inv3OverQuota.data.error
  )

  // Test member search
  const searchRes = await req('GET', `/api/team?search=${encodeURIComponent('member1_')}`, undefined, ownerToken)
  assert(
    searchRes.status === 200 && searchRes.data.members.length === 1 && searchRes.data.members[0].email === member1Email,
    'GET /api/team?search=... filters members accurately'
  )

  // ---------------------------------------------------------------------------
  // 3. Expiring Invite Token Rejection & Resend Invite Rotation
  // ---------------------------------------------------------------------------
  console.log('\n3. Expiring Invite Token Rejection & Resend Invite Rotation')
  const regMember2 = await req('POST', '/api/auth/register', {
    email: member2Email,
    name: 'Bob Viewer',
    password: pw
  })
  const member2Token = regMember2.data.token

  const acceptExpired = await req('POST', '/api/team/accept', { token: expiredToken2 }, member2Token)
  assert(
    acceptExpired.status === 410 && String(acceptExpired.data.error).toLowerCase().includes('expired'),
    'Expired invite token rejected with 410 Gone',
    acceptExpired.data.error
  )

  // Owner resends invite for member2 -> rotates token and sets 7-day expiry
  const resend2 = await req('POST', `/api/team/members/${member2RowId}/resend`, {}, ownerToken)
  assert(
    resend2.status === 200 && resend2.data.inviteToken !== expiredToken2,
    'POST /api/team/members/:id/resend rotates token and extends expiration'
  )

  // Now member2 accepts the renewed token
  const acceptValid2 = await req('POST', '/api/team/accept', { token: resend2.data.inviteToken }, member2Token)
  assert(
    acceptValid2.status === 200 && acceptValid2.data.accepted === true && acceptValid2.data.role === 'viewer',
    'Member2 accepted renewed invite token and joined team as Viewer'
  )

  // ---------------------------------------------------------------------------
  // 4. Role Permission Enforcement on API (Viewer -> Member -> Admin)
  // ---------------------------------------------------------------------------
  console.log('\n4. Role Permission Enforcement on API (Viewer vs Member vs Admin)')

  // 4a. Member2 is currently VIEWER:
  // - Can pull Owner's shared profiles
  const viewerPull = await req('GET', '/api/sync/pull', undefined, member2Token)
  assert(
    viewerPull.status === 200 && viewerPull.data.profiles.some((p) => p.id === ownerProfileId),
    'Viewer can GET /api/sync/pull shared workspace profiles'
  )

  // - Cannot push new/modified profiles
  const viewerPush = await req(
    'PUT',
    '/api/sync/push',
    {
      profiles: [{ id: randomUUID(), name: 'Illegal Viewer Profile', os: 'macos', updatedAt: new Date().toISOString() }]
    },
    member2Token
  )
  assert(viewerPush.status === 403, 'Viewer blocked from PUT /api/sync/push (403 Forbidden)', viewerPush.data.error)

  // - Cannot delete profiles
  const viewerDel = await req('DELETE', `/api/profiles/${ownerProfileId}`, undefined, member2Token)
  assert(viewerDel.status === 403, 'Viewer blocked from DELETE /api/profiles/:id (403 Forbidden)', viewerDel.data.error)

  // - Cannot upload browser session archives
  const viewerSession = await req(
    'PUT',
    `/api/profiles/${ownerProfileId}/session-state`,
    Buffer.from('test-archive'),
    member2Token
  )
  assert(viewerSession.status === 403, 'Viewer blocked from PUT /api/profiles/:id/session-state (403 Forbidden)')

  // 4b. Promote Member2 to MEMBER role:
  const toMember = await req('PATCH', `/api/team/members/${member2RowId}`, { role: 'member' }, ownerToken)
  assert(toMember.status === 200 && toMember.data.role === 'member', 'Owner changed Member2 role to member')

  const memberCreatedProfileId = randomUUID()
  const memberPushCreate = await req(
    'PUT',
    '/api/sync/push',
    {
      profiles: [{ id: memberCreatedProfileId, name: 'Member Created Profile', os: 'macos', updatedAt: new Date().toISOString() }]
    },
    member2Token
  )
  assert(
    memberPushCreate.status === 200 && memberPushCreate.data.profiles === 1,
    'Member role CAN create/edit profiles via PUT /api/sync/push'
  )

  // Member cannot delete profiles via push tombstones or DELETE /api/profiles/:id
  const memberPushDelete = await req(
    'PUT',
    '/api/sync/push',
    {
      deleted: { profiles: [{ id: memberCreatedProfileId, deletedAt: new Date().toISOString() }] }
    },
    member2Token
  )
  assert(
    memberPushDelete.status === 403,
    'Member role blocked from deleting profiles via sync tombstones (403 Forbidden)',
    memberPushDelete.data.error
  )

  const memberDirectDelete = await req('DELETE', `/api/profiles/${memberCreatedProfileId}`, undefined, member2Token)
  assert(
    memberDirectDelete.status === 403,
    'Member role blocked from DELETE /api/profiles/:id (403 Forbidden)'
  )

  // Member cannot invite team members
  const memberInviteAttempt = await req(
    'POST',
    '/api/team/invite',
    { email: 'unauth@brandinbold.test', role: 'viewer' },
    member2Token
  )
  assert(
    memberInviteAttempt.status === 403,
    'Member role blocked from POST /api/team/invite (403 Forbidden)'
  )

  // 4c. Promote Member2 to ADMIN role:
  const toAdmin = await req('PATCH', `/api/team/members/${member2RowId}`, { role: 'admin' }, ownerToken)
  assert(toAdmin.status === 200 && toAdmin.data.role === 'admin', 'Owner promoted Member2 role to admin')

  // Admin CAN delete profiles
  const adminDelete = await req('DELETE', `/api/profiles/${memberCreatedProfileId}`, undefined, member2Token)
  assert(
    adminDelete.status === 200 && adminDelete.data.deleted === true,
    'Admin role CAN delete workspace profiles'
  )

  // ---------------------------------------------------------------------------
  // 5. Workspace Switcher, Revoke Invite, Remove Member & Audit Activity Log
  // ---------------------------------------------------------------------------
  console.log('\n5. Workspace Switcher, Revoke Pending Invite, Remove Member & Audit Activity Log')

  // Member2 switches back to personal workspace and then back to Owner's team workspace
  const member2Id = regMember2.data.user.id
  const swPersonal = await req('POST', '/api/team/switch-workspace', { ownerId: member2Id }, member2Token)
  assert(
    swPersonal.status === 200 && swPersonal.data.activeTeamOwnerId === null,
    'Member2 switched to personal workspace'
  )
  const swTeam = await req('POST', '/api/team/switch-workspace', { ownerId }, member2Token)
  assert(
    swTeam.status === 200 && swTeam.data.activeTeamOwnerId === ownerId,
    'Member2 switched back to shared team workspace'
  )

  // Admin (or Owner) revokes Member1's pending invite
  const revoke1 = await req('POST', `/api/team/members/${member1RowId}/revoke`, {}, member2Token)
  assert(
    revoke1.status === 200 && revoke1.data.revoked === true,
    'Admin revoked Member1 pending invite (freeing seat)'
  )

  // Owner removes Member2 from team
  const remove2 = await req('DELETE', `/api/team/members/${member2RowId}`, undefined, ownerToken)
  assert(
    remove2.status === 200 && remove2.data.removed === true,
    'Owner removed Member2 from team'
  )

  // Verify Member2 was automatically reverted to their personal workspace and no longer sees Owner's profiles
  const afterRemovePull = await req('GET', '/api/sync/pull', undefined, member2Token)
  assert(
    afterRemovePull.status === 200 && afterRemovePull.data.profiles.length === 0,
    'Removed member immediately loses access to Owner workspace profiles'
  )

  // Final check of Owner's Activity Log
  const finalTeam = await req('GET', '/api/team', undefined, ownerToken)
  const actions = new Set((finalTeam.data.activity || []).map((a) => a.action))
  const expectedActions = [
    'auth.register',
    'profile.synced',
    'member.invited',
    'member.resent',
    'member.accepted',
    'member.role_changed',
    'profile.deleted',
    'member.revoked',
    'member.removed'
  ]
  const missingActions = expectedActions.filter((a) => !actions.has(a))
  assert(
    missingActions.length === 0,
    'Audit activity log recorded all profile, member, and auth lifecycle events',
    `recorded: ${[...actions].join(', ')}`
  )

  console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error('Fatal error in test-step5-team:', e)
  process.exit(1)
})
