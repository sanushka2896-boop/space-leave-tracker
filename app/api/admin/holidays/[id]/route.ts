import { NextRequest } from 'next/server'
import { adminClient, requireAdmin } from '../../../../lib/admin'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req)
  if (!admin) return Response.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  const { error } = await adminClient().from('holidays').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true })
}
