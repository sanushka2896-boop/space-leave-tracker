import { NextRequest } from 'next/server'
import { adminClient, requireAdmin } from '../../../lib/admin'

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return Response.json({ error: 'forbidden' }, { status: 403 })

  const supabase = adminClient()
  const { data: reviews } = await supabase
    .from('reviews')
    .select('id, user_id, date, type, notes, created_at')
    .order('date', { ascending: true })

  const userIds = [...new Set((reviews ?? []).map((r: any) => r.user_id))]
  const { data: users } = userIds.length > 0
    ? await supabase.from('users').select('id, name, email').in('id', userIds)
    : { data: [] }

  const userMap: Record<string, any> = {}
  for (const u of users ?? []) userMap[u.id] = u

  return Response.json(
    (reviews ?? []).map((r: any) => ({ ...r, users: userMap[r.user_id] ?? null }))
  )
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return Response.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  const { user_id, date, type, notes } = body
  if (!user_id || !date || !type) return Response.json({ error: 'user_id, date, type required' }, { status: 400 })

  const { data, error } = await adminClient()
    .from('reviews')
    .insert({ user_id, date, type, notes: notes ?? null, created_by: admin.id })
    .select('id, user_id, date, type, notes, created_at')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
