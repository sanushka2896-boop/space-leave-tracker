import { NextRequest } from 'next/server'
import { adminClient, getAuthUser, getDbUser } from '../../lib/admin'

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req)
  if (!authUser) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const dbUser = await getDbUser(authUser.email!)
  if (!dbUser) return Response.json({ error: 'user not found' }, { status: 404 })
  return Response.json(dbUser)
}

export async function PATCH(req: NextRequest) {
  const authUser = await getAuthUser(req)
  if (!authUser) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const dbUser = await getDbUser(authUser.email!)
  if (!dbUser) return Response.json({ error: 'user not found' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid request body' }, { status: 400 })
  }

  const allowed = ['name', 'role', 'location', 'is_bd_associate']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ success: true })
  }

  const { error } = await adminClient()
    .from('users')
    .update(updates)
    .eq('id', dbUser.id)

  if (error) {
    // Return the full Supabase error message so it's visible during debugging
    return Response.json({ error: error.message, details: error.details, hint: error.hint }, { status: 500 })
  }

  return Response.json({ success: true })
}
