import { NextRequest } from 'next/server'
import { adminClient, requireAdmin } from '../../../lib/admin'

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return Response.json({ error: 'forbidden' }, { status: 403 })
  const { data } = await adminClient().from('holidays').select('*').order('date', { ascending: true })
  return Response.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return Response.json({ error: 'forbidden' }, { status: 403 })

  const { name, date, type } = await req.json()
  if (!name || !date) return Response.json({ error: 'name and date required' }, { status: 400 })

  const { data, error } = await adminClient()
    .from('holidays')
    .insert({ name, date, type: type ?? 'national' })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
