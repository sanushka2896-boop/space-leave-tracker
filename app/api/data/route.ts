import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifySlack, leaveSubmittedMessage } from '../../lib/slack'

// Use the NEXT_PUBLIC service key so it works in both edge and node runtimes
function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return Response.json({ error: 'no token' }, { status: 401 })

  const admin = getAdmin()

  const { data: { user: authUser }, error: authErr } = await admin.auth.getUser(token)
  console.log('[data GET] authUser:', authUser?.email, 'authErr:', authErr?.message)
  if (!authUser) return Response.json({ error: 'unauthorized' }, { status: 401 })

  let { data: dbUser, error: userFetchErr } = await admin
    .from('users')
    .select('*')
    .eq('email', authUser.email)
    .single()
  console.log('[data GET] dbUser:', dbUser?.id, 'err:', userFetchErr?.message)

  if (!dbUser) {
    const { data: newUser, error: insertErr } = await admin
      .from('users')
      .insert({
        email: authUser.email,
        name: authUser.user_metadata?.full_name ?? authUser.email,
      })
      .select()
      .single()
    console.log('[data GET] created user:', newUser?.id, 'err:', insertErr?.message)
    if (newUser) {
      dbUser = newUser
      const { error: balErr } = await admin
        .from('leave_balance')
        .insert({ user_id: newUser.id, sick_leaves: 12, earned_leaves: 15, wfh_days: 24 })
      console.log('[data GET] balance insert err:', balErr?.message)
    }
  }

  if (!dbUser) return Response.json({ error: 'could not resolve user' }, { status: 500 })

  const [{ data: balance, error: balFetchErr }, { data: leaves, error: leavesFetchErr }] = await Promise.all([
    admin.from('leave_balance').select('*').eq('user_id', dbUser.id).single(),
    admin.from('leaves').select('*').eq('user_id', dbUser.id).order('created_at', { ascending: false }),
  ])
  console.log('[data GET] balance:', balance, 'err:', balFetchErr?.message)
  console.log('[data GET] leaves count:', leaves?.length, 'err:', leavesFetchErr?.message)

  return Response.json({
    userId: dbUser.id,
    isAdmin: dbUser.is_admin ?? false,
    balance: balance ?? { sick_leaves: 12, earned_leaves: 15, wfh_days: 24 },
    leaves: leaves ?? [],
  })
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return Response.json({ error: 'no token' }, { status: 401 })

  const admin = getAdmin()

  const { data: { user: authUser }, error: authErr } = await admin.auth.getUser(token)
  console.log('[data POST] authUser:', authUser?.email, 'authErr:', authErr?.message)
  if (!authUser) return Response.json({ error: 'unauthorized' }, { status: 401 })

  let body: Record<string, string>
  try { body = await req.json() }
  catch { return Response.json({ error: 'invalid body' }, { status: 400 }) }

  const { userId, type, date_from, date_to, value, reason } = body
  console.log('[data POST] payload:', { userId, type, date_from, date_to, value })
  if (!userId || !date_from) return Response.json({ error: 'missing fields' }, { status: 400 })

  // Sick leave is auto-approved and balance is immediately deducted
  const isSick = type === 'sick'
  const status = isSick ? 'approved' : 'pending'

  const { error: insertErr } = await admin.from('leaves').insert({
    user_id: userId,
    type,
    date_from,
    date_to: date_to || date_from,
    value: parseFloat(value),
    reason: reason || null,
    status,
  })
  console.log('[data POST] leave insert err:', insertErr?.message)
  if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 })

  if (isSick) {
    const { data: bal, error: balErr } = await admin
      .from('leave_balance')
      .select('sick_leaves')
      .eq('user_id', userId)
      .single()
    console.log('[data POST] current sick_leaves:', bal?.sick_leaves, 'err:', balErr?.message)
    if (bal) {
      const { error: deductErr } = await admin
        .from('leave_balance')
        .update({ sick_leaves: Math.max(0, bal.sick_leaves - parseFloat(value)) })
        .eq('user_id', userId)
      console.log('[data POST] balance deduct err:', deductErr?.message)
    }
  }

  const { data: dbUser } = await admin.from('users').select('name').eq('id', userId).single()
  const name = dbUser?.name || authUser.email || 'Someone'
  await notifySlack(
    process.env.SLACK_WEBHOOK_URL,
    leaveSubmittedMessage(name, type, date_from, date_to || date_from, value)
  )

  return Response.json({ success: true, status })
}
