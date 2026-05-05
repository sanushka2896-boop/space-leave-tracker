import { NextRequest } from 'next/server'
import { adminClient, getAuthUser, getDbUser } from '../../lib/admin'

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req)
  if (!authUser) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const dbUser = await getDbUser(authUser.email!)
  if (!dbUser) return Response.json({ error: 'user not found' }, { status: 404 })

  const supabase = adminClient()

  const [{ data: myLeaves }, { data: teamLeaves }, { data: holidays }] = await Promise.all([
    supabase
      .from('leaves')
      .select('*')
      .eq('user_id', dbUser.id)
      .neq('status', 'cancelled'),
    supabase
      .from('leaves')
      .select('*, users(name)')
      .neq('user_id', dbUser.id)
      .eq('status', 'approved'),
    supabase
      .from('holidays')
      .select('*')
      .order('date', { ascending: true }),
  ])

  return Response.json({
    myLeaves: myLeaves ?? [],
    teamLeaves: teamLeaves ?? [],
    holidays: holidays ?? [],
  })
}
