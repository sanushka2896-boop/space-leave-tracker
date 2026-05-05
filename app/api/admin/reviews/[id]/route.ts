import { NextRequest } from 'next/server'
import { adminClient, requireAdmin } from '../../../../lib/admin'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req)
  if (!admin) return Response.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  const body = await req.json()
  const allowed = ['date', 'type', 'notes']
  const updates: Record<string, unknown> = {}
  for (const k of allowed) if (body[k] !== undefined) updates[k] = body[k]
  const { error } = await adminClient().from('reviews').update(updates).eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req)
  if (!admin) return Response.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  const { error } = await adminClient().from('reviews').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true })
}
