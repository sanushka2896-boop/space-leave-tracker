import { NextRequest } from 'next/server'
import { adminClient, requireAdmin } from '../../lib/admin'

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return Response.json({ error: 'forbidden' }, { status: 403 })

  const supabase = adminClient()

  // Fetch each resource independently — no embedded joins so FK constraints aren't required
  const [
    { data: pendingLeavesRaw },
    { data: allUsers },
    { data: holidays },
    { data: reviewsRaw },
  ] = await Promise.all([
    supabase.from('leaves').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
    supabase.from('users').select('id, name, email, role, location, is_bd_associate, is_admin'),
    supabase.from('holidays').select('*').order('date', { ascending: true }),
    supabase.from('reviews').select('id, user_id, date, type, notes, created_at').order('date', { ascending: true }),
  ])

  // Build a lookup map: userId → { name, email }
  const userMap: Record<string, { name: string; email: string }> = {}
  for (const u of allUsers ?? []) userMap[u.id] = { name: u.name, email: u.email }

  // Attach user info to leaves (no FK join needed)
  const pendingLeaves = (pendingLeavesRaw ?? []).map((l: any) => ({
    ...l,
    users: userMap[l.user_id] ?? null,
  }))

  // Attach user info to reviews
  const reviews = (reviewsRaw ?? []).map((r: any) => ({
    ...r,
    users: userMap[r.user_id] ?? null,
  }))

  // Fetch leave balances for all users
  const userIds = (allUsers ?? []).map((u: any) => u.id)
  const { data: balanceRows } = userIds.length > 0
    ? await supabase.from('leave_balances').select('user_id, leave_type, allocated, balance').in('user_id', userIds)
    : { data: [] }

  const team = (allUsers ?? []).map((u: any) => ({
    ...u,
    balances: (balanceRows ?? []).filter((b: any) => b.user_id === u.id),
  }))

  return Response.json({ pendingLeaves, team, holidays: holidays ?? [], reviews })
}
