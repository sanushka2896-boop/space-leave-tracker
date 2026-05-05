import { NextRequest } from 'next/server'
import { adminClient, getAuthUser, getDbUser } from '../../../lib/admin'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthUser(req)
  if (!authUser) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const supabase = adminClient()
  const dbUser = await getDbUser(authUser.email!)
  if (!dbUser) return Response.json({ error: 'user not found' }, { status: 404 })

  const { data: leave } = await supabase
    .from('leaves')
    .select('*')
    .eq('id', id)
    .eq('user_id', dbUser.id)
    .single()

  if (!leave) return Response.json({ error: 'leave not found' }, { status: 404 })
  if (leave.status !== 'pending') return Response.json({ error: 'only pending leaves can be modified' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (body.action === 'cancel') {
    updates.status = 'cancelled'
  } else {
    if (body.date_from) updates.date_from = body.date_from
    if (body.date_to) updates.date_to = body.date_to
    if (body.reason !== undefined) updates.reason = body.reason
    if (body.type) updates.type = body.type
    if (body.value) updates.value = parseFloat(body.value)
  }

  const { error } = await supabase.from('leaves').update(updates).eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true })
}
