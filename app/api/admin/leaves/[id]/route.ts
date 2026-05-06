import { NextRequest } from 'next/server'
import { adminClient, requireAdmin } from '../../../../lib/admin'
import { notifySlack, leaveStatusMessage } from '../../../../lib/slack'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req)
  if (!admin) return Response.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  const { action } = await req.json()
  if (action !== 'approve' && action !== 'reject') {
    return Response.json({ error: 'action must be approve or reject' }, { status: 400 })
  }

  const supabase = adminClient()

  // Fetch leave without embedded join
  const { data: leave, error: leaveErr } = await supabase
    .from('leaves')
    .select('*')
    .eq('id', id)
    .single()

  if (leaveErr || !leave) return Response.json({ error: 'leave not found' }, { status: 404 })
  if (leave.status !== 'pending') return Response.json({ error: 'leave is not pending' }, { status: 400 })

  const newStatus = action === 'approve' ? 'approved' : 'rejected'
  const { error: updateError } = await supabase.from('leaves').update({ status: newStatus }).eq('id', id)
  if (updateError) return Response.json({ error: updateError.message }, { status: 500 })

  if (action === 'approve') {
    const { data: bal } = await supabase
      .from('leave_balances')
      .select('balance, allocated')
      .eq('user_id', leave.user_id)
      .eq('leave_type', leave.type)
      .maybeSingle()

    await supabase.from('leave_balances').upsert({
      user_id: leave.user_id,
      leave_type: leave.type,
      allocated: (bal as any)?.allocated ?? 0,
      balance: ((bal as any)?.balance ?? 0) - leave.value,
    })
  }

  // Fetch user name separately (no FK join)
  const { data: leaveUser } = await supabase.from('users').select('name, email').eq('id', leave.user_id).single()
  const userName = leaveUser?.name || leaveUser?.email || 'Team member'

  await notifySlack(
    process.env.SLACK_APPROVAL_WEBHOOK_URL,
    leaveStatusMessage(userName, leave.type, leave.date_from, newStatus as 'approved' | 'rejected')
  )

  return Response.json({ success: true })
}
