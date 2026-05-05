import { NextRequest } from 'next/server'
import { adminClient, getAuthUser, getDbUser } from '../../lib/admin'

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req)
  if (!authUser) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const dbUser = await getDbUser(authUser.email!)
  if (!dbUser) return Response.json({ error: 'user not found' }, { status: 404 })

  const { data } = await adminClient()
    .from('reviews')
    .select('id, date, type, created_at')
    .eq('user_id', dbUser.id)
    .order('date', { ascending: true })

  return Response.json(data ?? [])
}
