'use client'
import { useEffect, useState } from 'react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import Nav from '../components/Nav'
import type { LeaveTypeDef } from '../lib/leaveTypes'

type Leave = {
  id: string
  user_id: string
  type: string
  date_from: string
  date_to: string
  value: number
  reason: string
  status: string
  users: { name: string; email: string } | null
}

type TeamMember = {
  id: string
  name: string
  email: string
  role: string
  location: string
  is_bd_associate: boolean
  is_admin: boolean
  balances: { leave_type: string; allocated: number; balance: number }[]
}

type Holiday = { id: string; name: string; date: string; type: string }

type Review = {
  id: string
  user_id: string
  date: string
  type: string
  notes: string
  users: { name: string; email: string } | null
}

type WorkingSaturday = { id: string; date: string; user_id: string | null }

type OvertimeEntry = {
  id: string
  user_id: string
  date: string
  login_time: string | null
  logout_time: string | null
  overtime_duration: string | null
  extra_hours_start: string | null
  extra_hours_end: string | null
  reason: string | null
  compensated_by: string | null
  approved: boolean
  approved_by: string | null
  rejection_reason: string | null
  users?: { name: string; email: string } | null
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'text-amber-600 bg-amber-50',
  approved: 'text-emerald-600 bg-emerald-50',
  rejected: 'text-red-500 bg-red-50',
  cancelled: 'text-[#bbb] bg-[#f5f5f5]',
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true)
  const [adminUserId, setAdminUserId] = useState('')
  const [pendingLeaves, setPendingLeaves] = useState<Leave[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeDef[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [workingSaturdays, setWorkingSaturdays] = useState<WorkingSaturday[]>([])
  const [acting, setActing] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const [hForm, setHForm] = useState({ name: '', date: '', type: 'national' })
  const [hSaving, setHSaving] = useState(false)
  const [hError, setHError] = useState('')

  const [rForm, setRForm] = useState({ user_id: '', date: '', type: 'annual', notes: '' })
  const [rSaving, setRSaving] = useState(false)
  const [rError, setRError] = useState('')
  const [rEditId, setREditId] = useState<string | null>(null)

  const [aForm, setAForm] = useState({ user_id: '', type: 'casual', date_from: '', date_to: '', value: '1' })
  const [aSaving, setASaving] = useState(false)
  const [aError, setAError] = useState('')

  // Dynamic quota — employee selector + per-type editable rows
  const [qUserId, setQUserId] = useState('')
  const [qBalancesEdit, setQBalancesEdit] = useState<Record<string, { allocated: string; balance: string }>>({})
  const [qSaving, setQSaving] = useState(false)
  const [qError, setQError] = useState('')
  const [qSuccess, setQSuccess] = useState('')

  // Leave Type Management
  const [ltForm, setLtForm] = useState({ key: '', label: '', default_days: '', requires_docs: false, sort_order: '99' })
  const [ltSaving, setLtSaving] = useState(false)
  const [ltError, setLtError] = useState('')
  const [ltEditKey, setLtEditKey] = useState<string | null>(null)
  const [ltEditForm, setLtEditForm] = useState({ label: '', default_days: '', requires_docs: false, sort_order: '0' })
  const [ltEditSaving, setLtEditSaving] = useState(false)

  const [wsDate, setWsDate] = useState('')
  const [wsSaving, setWsSaving] = useState(false)
  const [wsError, setWsError] = useState('')

  const [overtimeEntries, setOvertimeEntries] = useState<OvertimeEntry[]>([])
  const [otActingId, setOtActingId] = useState<string | null>(null)
  const [otRejectingId, setOtRejectingId] = useState<string | null>(null)
  const [otRejectReason, setOtRejectReason] = useState('')
  const [deletingLeaveId, setDeletingLeaveId] = useState<string | null>(null)
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null)
  const [teamEditForm, setTeamEditForm] = useState({ name: '', role: '', location: '', is_admin: false })
  const [teamEditSaving, setTeamEditSaving] = useState(false)
  const [deletingOTAdminId, setDeletingOTAdminId] = useState<string | null>(null)

  const router = useRouter()

  async function loadOvertimeEntries() {
    const { data } = await supabaseAdmin
      .from('overtime_entries').select('*, users(name, email)')
      .eq('approved', false).is('rejection_reason', null)
      .order('date', { ascending: false })
    setOvertimeEntries(data ?? [])
  }

  async function loadData() {
    const [
      { data: leavesRaw, error: leavesErr },
      { data: usersRaw, error: usersErr },
      { data: holidaysRaw },
      { data: reviewsRaw },
      { data: wsRaw },
      { data: ltData },
    ] = await Promise.all([
      supabaseAdmin.from('leaves').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
      supabaseAdmin.from('users').select('id, name, email, role, location, is_bd_associate, is_admin'),
      supabaseAdmin.from('holidays').select('*').order('date', { ascending: true }),
      supabaseAdmin.from('reviews').select('id, user_id, date, type, notes, created_at').order('date', { ascending: true }),
      supabaseAdmin.from('working_saturdays').select('*').is('user_id', null).order('date', { ascending: true }),
      supabaseAdmin.from('leave_types').select('*').order('sort_order'),
    ])

    if (leavesErr) console.error('[Admin] loadData leaves error:', leavesErr)
    if (usersErr) console.error('[Admin] loadData users error:', usersErr)

    const userMap: Record<string, { name: string; email: string }> = {}
    for (const u of usersRaw ?? []) userMap[u.id] = { name: u.name, email: u.email }

    const enrichedLeaves: Leave[] = (leavesRaw ?? []).map((l: any) => ({ ...l, users: userMap[l.user_id] ?? null }))
    const enrichedReviews: Review[] = (reviewsRaw ?? []).map((r: any) => ({ ...r, users: userMap[r.user_id] ?? null }))

    const userIds = (usersRaw ?? []).map((u: any) => u.id)
    let balanceRows: any[] = []
    if (userIds.length > 0) {
      const { data: b } = await supabaseAdmin.from('leave_balances').select('*').in('user_id', userIds)
      balanceRows = b ?? []
    }

    const lts = (ltData ?? []) as LeaveTypeDef[]
    const enrichedTeam: TeamMember[] = (usersRaw ?? []).map((u: any) => ({
      ...u,
      balances: balanceRows
        .filter((b: any) => b.user_id === u.id)
        .map((b: any) => ({ leave_type: b.leave_type, allocated: b.allocated, balance: b.balance })),
    }))

    setLeaveTypes(lts)
    setPendingLeaves(enrichedLeaves)
    setTeam(enrichedTeam)
    setHolidays(holidaysRaw ?? [])
    setReviews(enrichedReviews)
    setWorkingSaturdays(wsRaw ?? [])
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/'); return }
      const { data: dbUser } = await supabaseAdmin
        .from('users').select('id, is_admin').eq('email', session.user.email).single()
      if (!dbUser?.is_admin) { router.push('/dashboard'); return }
      setAdminUserId(dbUser.id)
      await Promise.all([loadData(), loadOvertimeEntries()])
      setLoading(false)
    })
  }, [])

  function buildQuotaEdit(uid: string, members: TeamMember[], lts: LeaveTypeDef[]) {
    const member = members.find(m => m.id === uid)
    const balMap: Record<string, { allocated: string; balance: string }> = {}
    for (const lt of lts.filter(t => t.is_active)) {
      const existing = member?.balances.find(b => b.leave_type === lt.key)
      balMap[lt.key] = {
        allocated: String(existing?.allocated ?? lt.default_days ?? 0),
        balance: String(existing?.balance ?? lt.default_days ?? 0),
      }
    }
    return balMap
  }

  async function handleLeaveAction(id: string, action: 'approve' | 'reject', rejectionReason?: string) {
    setActing(id + action)
    setActionError('')
    const newStatus = action === 'approve' ? 'approved' : 'rejected'
    const leave = pendingLeaves.find(l => l.id === id)
    if (!leave) { setActing(null); return }

    const updatePayload: Record<string, any> = { status: newStatus }
    if (action === 'reject' && rejectionReason) updatePayload.rejection_reason = rejectionReason

    const { error: updateErr } = await supabaseAdmin.from('leaves').update(updatePayload).eq('id', id)
    if (updateErr) {
      setActionError(`Failed to ${action}: ${updateErr.message}`)
      setActing(null)
      return
    }

    if (action === 'approve') {
      const { data: bal } = await supabaseAdmin
        .from('leave_balances').select('balance, allocated')
        .eq('user_id', leave.user_id).eq('leave_type', leave.type).maybeSingle()
      await supabaseAdmin.from('leave_balances').upsert({
        user_id: leave.user_id,
        leave_type: leave.type,
        allocated: bal?.allocated ?? 0,
        balance: (bal?.balance ?? 0) - leave.value,
      })
    }

    await loadData()
    setActing(null)
  }

  async function addHoliday() {
    if (!hForm.name || !hForm.date) return
    setHError('')
    setHSaving(true)
    const { error } = await supabaseAdmin.from('holidays').insert({ name: hForm.name, date: hForm.date, type: hForm.type })
    if (error) { setHError(error.message); setHSaving(false); return }
    setHForm({ name: '', date: '', type: 'national' })
    await loadData()
    setHSaving(false)
  }

  async function deleteHoliday(id: string) {
    await supabaseAdmin.from('holidays').delete().eq('id', id)
    await loadData()
  }

  async function saveReview() {
    if (!rForm.user_id || !rForm.date) return
    setRError('')
    setRSaving(true)
    let error: any
    if (rEditId) {
      const res = await supabaseAdmin.from('reviews')
        .update({ date: rForm.date, type: rForm.type, notes: rForm.notes || null }).eq('id', rEditId)
      error = res.error
    } else {
      const res = await supabaseAdmin.from('reviews')
        .insert({ user_id: rForm.user_id, date: rForm.date, type: rForm.type, notes: rForm.notes || null, created_by: adminUserId || null })
      error = res.error
    }
    if (error) { setRError(error.message); setRSaving(false); return }
    setREditId(null)
    setRForm({ user_id: '', date: '', type: 'annual', notes: '' })
    await loadData()
    setRSaving(false)
  }

  async function deleteReview(id: string) {
    await supabaseAdmin.from('reviews').delete().eq('id', id)
    await loadData()
  }

  function startEditReview(r: Review) {
    setREditId(r.id)
    setRForm({ user_id: r.user_id, date: r.date, type: r.type, notes: r.notes || '' })
    setRError('')
  }

  async function assignLeave() {
    if (!aForm.user_id || !aForm.date_from) return
    setAError('')
    setASaving(true)
    const value = parseFloat(aForm.value)
    const { error: insertErr } = await supabaseAdmin.from('leaves').insert({
      user_id: aForm.user_id,
      type: aForm.type,
      date_from: aForm.date_from,
      date_to: aForm.date_to || aForm.date_from,
      value,
      status: 'approved',
      reason: 'Assigned by admin',
    })
    if (insertErr) { setAError(insertErr.message); setASaving(false); return }

    const { data: bal } = await supabaseAdmin
      .from('leave_balances').select('balance, allocated')
      .eq('user_id', aForm.user_id).eq('leave_type', aForm.type).maybeSingle()
    await supabaseAdmin.from('leave_balances').upsert({
      user_id: aForm.user_id,
      leave_type: aForm.type,
      allocated: bal?.allocated ?? 0,
      balance: (bal?.balance ?? 0) - value,
    })

    setAForm({ user_id: '', type: 'casual', date_from: '', date_to: '', value: '1' })
    await loadData()
    setASaving(false)
  }

  async function saveAllQuota() {
    if (!qUserId) return
    setQError('')
    setQSuccess('')
    setQSaving(true)
    const rows = Object.entries(qBalancesEdit).map(([lt, vals]) => ({
      user_id: qUserId,
      leave_type: lt,
      allocated: parseFloat(vals.allocated) || 0,
      balance: parseFloat(vals.balance) || 0,
    }))
    const { error } = await supabaseAdmin.from('leave_balances').upsert(rows)
    if (error) { setQError(error.message); setQSaving(false); return }
    setQSuccess('Quotas updated.')
    await loadData()
    setQSaving(false)
  }

  async function addWorkingSaturday() {
    if (!wsDate) return
    const d = new Date(wsDate + 'T00:00:00')
    if (d.getDay() !== 6) { setWsError('Date must be a Saturday.'); return }
    setWsError('')
    setWsSaving(true)
    const { error } = await supabaseAdmin.from('working_saturdays').insert({ date: wsDate, user_id: null })
    if (error) { setWsError(error.message); setWsSaving(false); return }
    setWsDate('')
    await loadData()
    setWsSaving(false)
  }

  async function removeWorkingSaturday(id: string) {
    await supabaseAdmin.from('working_saturdays').delete().eq('id', id)
    await loadData()
  }

  async function addLeaveType() {
    if (!ltForm.key || !ltForm.label) return
    setLtError('')
    setLtSaving(true)
    const { error } = await supabaseAdmin.from('leave_types').insert({
      key: ltForm.key.toLowerCase().replace(/\s+/g, '_'),
      label: ltForm.label,
      default_days: ltForm.default_days ? parseFloat(ltForm.default_days) : null,
      requires_docs: ltForm.requires_docs,
      is_active: true,
      sort_order: parseInt(ltForm.sort_order) || 99,
    })
    if (error) { setLtError(error.message); setLtSaving(false); return }
    setLtForm({ key: '', label: '', default_days: '', requires_docs: false, sort_order: '99' })
    await loadData()
    setLtSaving(false)
  }

  async function toggleLeaveType(key: string, is_active: boolean) {
    await supabaseAdmin.from('leave_types').update({ is_active }).eq('key', key)
    await loadData()
  }

  function startEditLeaveType(lt: LeaveTypeDef) {
    setLtEditKey(lt.key)
    setLtEditForm({
      label: lt.label,
      default_days: lt.default_days != null ? String(lt.default_days) : '',
      requires_docs: lt.requires_docs,
      sort_order: String(lt.sort_order),
    })
  }

  async function saveLeaveTypeEdit(key: string) {
    setLtEditSaving(true)
    await supabaseAdmin.from('leave_types').update({
      label: ltEditForm.label,
      default_days: ltEditForm.default_days ? parseFloat(ltEditForm.default_days) : null,
      requires_docs: ltEditForm.requires_docs,
      sort_order: parseInt(ltEditForm.sort_order) || 0,
    }).eq('key', key)
    setLtEditKey(null)
    await loadData()
    setLtEditSaving(false)
  }

  function formatDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  function fmtTime(t: string | null) {
    if (!t) return '—'
    const [h, m] = t.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
  }

  async function approveOvertime(entry: OvertimeEntry) {
    setOtActingId(entry.id)
    const adminUser = team.find(m => m.id === adminUserId)
    const adminName = adminUser?.name || adminUser?.email || 'Admin'
    await supabaseAdmin.from('overtime_entries')
      .update({ approved: true, approved_by: adminName, rejection_reason: null })
      .eq('id', entry.id)
    await loadOvertimeEntries()
    setOtActingId(null)
  }

  async function rejectOvertime(entry: OvertimeEntry, reason: string) {
    setOtActingId(entry.id)
    await supabaseAdmin.from('overtime_entries')
      .update({ approved: false, rejection_reason: reason || 'Rejected' })
      .eq('id', entry.id)
    setOtRejectingId(null)
    setOtRejectReason('')
    await loadOvertimeEntries()
    setOtActingId(null)
  }

  async function deleteLeave(id: string) {
    setDeletingLeaveId(id)
    await supabaseAdmin.from('leaves').delete().eq('id', id)
    setDeletingLeaveId(null)
    await loadData()
  }

  function startEditTeamMember(m: TeamMember) {
    setEditingTeamId(m.id)
    setTeamEditForm({ name: m.name || '', role: m.role || '', location: m.location || '', is_admin: m.is_admin })
  }

  async function saveTeamMember(id: string) {
    setTeamEditSaving(true)
    await supabaseAdmin.from('users').update({
      name: teamEditForm.name || null,
      role: teamEditForm.role || null,
      location: teamEditForm.location || null,
      is_admin: teamEditForm.is_admin,
    }).eq('id', id)
    setEditingTeamId(null)
    await loadData()
    setTeamEditSaving(false)
  }

  async function deleteOTEntry(id: string) {
    setDeletingOTAdminId(id)
    await supabaseAdmin.from('overtime_entries').delete().eq('id', id)
    setDeletingOTAdminId(null)
    await loadOvertimeEntries()
  }

  if (loading) return null

  return (
    <main className="min-h-screen bg-[#F5F2EE]">
      <Nav isAdmin={true} />

      <div className="px-12 py-12 max-w-6xl mx-auto space-y-16">

        {/* Overtime Approvals */}
        <section>
          <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-6">
            Overtime Approvals
            {overtimeEntries.length > 0 && <span className="ml-3 text-amber-600">({overtimeEntries.length})</span>}
          </h3>
          {overtimeEntries.length === 0 ? (
            <p className="text-sm text-[#bbb] tracking-wider">No overtime entries pending approval.</p>
          ) : (
            <div className="border border-[#ddd] bg-white overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#eee]">
                    {['Date', 'Day', 'Name', 'Login', 'Logout', 'Overtime', 'Extra Hours', 'Reason', 'Notes', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[9px] tracking-[0.2em] uppercase text-[#aaa] font-normal whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f5f5f5]">
                  {overtimeEntries.map(e => {
                    const dow = e.date ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(e.date+'T00:00:00').getDay()] : '—'
                    return (
                      <tr key={e.id} className="hover:bg-[#fafafa]">
                        <td className="px-4 py-3 text-xs text-[#888] whitespace-nowrap">{formatDate(e.date)}</td>
                        <td className="px-4 py-3 text-xs text-[#888]">{dow}</td>
                        <td className="px-4 py-3 text-xs text-[#1a1a1a]">{(e.users as any)?.name || '—'}</td>
                        <td className="px-4 py-3 text-xs text-[#888]">{fmtTime(e.login_time)}</td>
                        <td className="px-4 py-3 text-xs text-[#888]">{fmtTime(e.logout_time)}</td>
                        <td className="px-4 py-3 text-xs font-medium text-[#1a1a1a]">{e.overtime_duration || '—'}</td>
                        <td className="px-4 py-3 text-xs text-[#888] whitespace-nowrap">
                          {e.extra_hours_start && e.extra_hours_end
                            ? `${fmtTime(e.extra_hours_start)} – ${fmtTime(e.extra_hours_end)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#888] max-w-[120px]">{e.reason || '—'}</td>
                        <td className="px-4 py-3 text-xs text-[#888] max-w-[120px]">{e.compensated_by || '—'}</td>
                        <td className="px-4 py-3">
                          {otRejectingId === e.id ? (
                            <div className="flex gap-2 items-center">
                              <input type="text" placeholder="Rejection reason (required)" value={otRejectReason}
                                onChange={ev => setOtRejectReason(ev.target.value)}
                                onKeyDown={ev => {
                                  if (ev.key === 'Enter' && otRejectReason.trim()) rejectOvertime(e, otRejectReason)
                                  if (ev.key === 'Escape') { setOtRejectingId(null); setOtRejectReason('') }
                                }}
                                autoFocus
                                className="border border-[#ddd] bg-[#F5F2EE] px-2 py-1 text-xs text-[#1a1a1a] focus:outline-none w-40" />
                              <button
                                onClick={() => rejectOvertime(e, otRejectReason)}
                                disabled={!!otActingId || !otRejectReason.trim()}
                                className="text-xs text-red-400 hover:text-red-600 cursor-pointer disabled:opacity-40">Confirm</button>
                              <button onClick={() => { setOtRejectingId(null); setOtRejectReason('') }}
                                className="text-xs text-[#aaa] cursor-pointer">✕</button>
                            </div>
                          ) : (
                            <div className="flex gap-3">
                              <button onClick={() => approveOvertime(e)} disabled={!!otActingId}
                                className="px-3 py-1 border border-emerald-600 text-[9px] tracking-wider uppercase text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all cursor-pointer disabled:opacity-40">
                                {otActingId === e.id ? '…' : 'Approve'}
                              </button>
                              <button onClick={() => { setOtRejectingId(e.id); setOtRejectReason('') }} disabled={!!otActingId}
                                className="px-3 py-1 border border-red-400 text-[9px] tracking-wider uppercase text-red-400 hover:bg-red-400 hover:text-white transition-all cursor-pointer disabled:opacity-40">
                                Reject
                              </button>
                              <button onClick={() => deleteOTEntry(e.id)} disabled={!!otActingId || deletingOTAdminId === e.id}
                                className="text-xs text-[#aaa] hover:text-red-500 transition-colors cursor-pointer disabled:opacity-40">
                                {deletingOTAdminId === e.id ? '…' : 'Delete'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Pending Leave Requests */}
        <section>
          <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-6">
            Pending Requests
            {pendingLeaves.length > 0 && <span className="ml-3 text-amber-600">({pendingLeaves.length})</span>}
          </h3>
          {actionError && <p className="text-xs text-red-400 tracking-wider mb-4">{actionError}</p>}
          {pendingLeaves.length === 0 ? (
            <p className="text-sm text-[#bbb] tracking-wider">No pending requests.</p>
          ) : (
            <div className="border border-[#ddd] bg-white divide-y divide-[#eee]">
              {pendingLeaves.map(leave => (
                <div key={leave.id} className="px-8 py-5 flex items-start justify-between gap-6">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <p className="text-xs tracking-[0.2em] uppercase text-[#1a1a1a] font-medium">
                        {leave.users?.name || leave.users?.email || 'Unknown'}
                      </p>
                      <span className={`text-xs tracking-widest uppercase px-2 py-0.5 ${STATUS_STYLES[leave.status]}`}>
                        {leave.status}
                      </span>
                    </div>
                    <p className="text-xs text-[#888]">
                      {leave.type} leave · {leave.date_from}{leave.date_to !== leave.date_from ? ` → ${leave.date_to}` : ''} · {leave.value === 0.5 ? 'Half day' : `${leave.value} day${leave.value !== 1 ? 's' : ''}`}
                    </p>
                    {leave.reason && <p className="text-xs text-[#bbb] mt-1 italic">{leave.reason}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => handleLeaveAction(leave.id, 'approve')}
                      disabled={acting !== null || rejectingId === leave.id}
                      className="px-5 py-2 border border-emerald-600 text-xs tracking-wider uppercase text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all cursor-pointer disabled:opacity-40"
                    >
                      {acting === leave.id + 'approve' ? '…' : 'Approve'}
                    </button>
                    <button
                      onClick={() => deleteLeave(leave.id)}
                      disabled={acting !== null || deletingLeaveId === leave.id}
                      className="text-xs text-[#aaa] hover:text-red-500 transition-colors cursor-pointer disabled:opacity-40"
                    >
                      {deletingLeaveId === leave.id ? '…' : 'Delete'}
                    </button>
                    {rejectingId === leave.id ? (
                      <>
                        <input
                          type="text"
                          placeholder="Reason (optional)"
                          value={rejectReason}
                          onChange={e => setRejectReason(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { handleLeaveAction(leave.id, 'reject', rejectReason); setRejectingId(null); setRejectReason('') }
                            if (e.key === 'Escape') { setRejectingId(null); setRejectReason('') }
                          }}
                          autoFocus
                          className="border border-[#ddd] bg-[#F5F2EE] px-3 py-1.5 text-xs text-[#1a1a1a] focus:outline-none w-44"
                        />
                        <button
                          onClick={() => { handleLeaveAction(leave.id, 'reject', rejectReason); setRejectingId(null); setRejectReason('') }}
                          disabled={acting !== null}
                          className="px-4 py-2 border border-red-400 text-xs tracking-wider uppercase text-red-400 hover:bg-red-400 hover:text-white transition-all cursor-pointer disabled:opacity-40"
                        >
                          {acting === leave.id + 'reject' ? '…' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => { setRejectingId(null); setRejectReason('') }}
                          className="text-xs text-[#aaa] hover:text-[#1a1a1a] transition-colors cursor-pointer px-1"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => { setRejectingId(leave.id); setRejectReason('') }}
                        disabled={acting !== null}
                        className="px-5 py-2 border border-red-400 text-xs tracking-wider uppercase text-red-400 hover:bg-red-400 hover:text-white transition-all cursor-pointer disabled:opacity-40"
                      >
                        Reject
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Team Overview */}
        <section>
          <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-6">Team Overview</h3>
          <div className="border border-[#ddd] bg-white overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#eee]">
                  {['Name', 'Role', 'Location', 'Casual', 'Sick', 'WFH', ''].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs tracking-[0.2em] uppercase text-[#aaa] font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f5f5f5]">
                {team.map(m => {
                  const getBalance = (type: string) => {
                    const b = m.balances.find(b => b.leave_type === type)
                    if (!b) return <span className="text-[#ccc]">—</span>
                    return <span className={b.balance < 0 ? 'text-red-500' : ''}>{b.balance}</span>
                  }
                  return editingTeamId === m.id ? (
                    <tr key={m.id} className="bg-[#fafafa]">
                      <td colSpan={7} className="px-6 py-4">
                        <div className="flex gap-3 flex-wrap items-end">
                          <div>
                            <label className="text-[9px] uppercase tracking-wider text-[#aaa] block mb-1">Name</label>
                            <input type="text" value={teamEditForm.name}
                              onChange={e => setTeamEditForm({ ...teamEditForm, name: e.target.value })}
                              className="border border-[#ddd] bg-white px-3 py-1.5 text-xs text-[#1a1a1a] focus:outline-none w-36" />
                          </div>
                          <div>
                            <label className="text-[9px] uppercase tracking-wider text-[#aaa] block mb-1">Role</label>
                            <input type="text" value={teamEditForm.role}
                              onChange={e => setTeamEditForm({ ...teamEditForm, role: e.target.value })}
                              className="border border-[#ddd] bg-white px-3 py-1.5 text-xs text-[#1a1a1a] focus:outline-none w-32" />
                          </div>
                          <div>
                            <label className="text-[9px] uppercase tracking-wider text-[#aaa] block mb-1">Location</label>
                            <input type="text" value={teamEditForm.location}
                              onChange={e => setTeamEditForm({ ...teamEditForm, location: e.target.value })}
                              className="border border-[#ddd] bg-white px-3 py-1.5 text-xs text-[#1a1a1a] focus:outline-none w-32" />
                          </div>
                          <div className="flex items-end gap-2 pb-0.5">
                            <label className="text-[9px] uppercase tracking-wider text-[#aaa]">Admin</label>
                            <input type="checkbox" checked={teamEditForm.is_admin}
                              onChange={e => setTeamEditForm({ ...teamEditForm, is_admin: e.target.checked })}
                              className="w-4 h-4 accent-[#1a1a1a] cursor-pointer" />
                          </div>
                          <button onClick={() => saveTeamMember(m.id)} disabled={teamEditSaving}
                            className="px-4 py-1.5 border border-[#1a1a1a] text-xs tracking-wider uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40">
                            {teamEditSaving ? '…' : 'Save'}
                          </button>
                          <button onClick={() => setEditingTeamId(null)}
                            className="px-4 py-1.5 border border-[#ddd] text-xs uppercase text-[#888] hover:text-[#1a1a1a] cursor-pointer">
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={m.id} className="hover:bg-[#fafafa]">
                      <td className="px-6 py-4">
                        <p className="text-xs text-[#1a1a1a]">{m.name || m.email}</p>
                        {m.is_admin && <span className="text-[9px] tracking-wider uppercase text-[#aaa]">Admin</span>}
                      </td>
                      <td className="px-6 py-4 text-xs text-[#888]">{m.role || '—'}</td>
                      <td className="px-6 py-4 text-xs text-[#888]">{m.location || '—'}</td>
                      <td className="px-6 py-4 text-xs font-light">{getBalance('casual')}</td>
                      <td className="px-6 py-4 text-xs font-light">{getBalance('sick')}</td>
                      <td className="px-6 py-4 text-xs font-light">{getBalance('wfh')}</td>
                      <td className="px-6 py-4">
                        <button onClick={() => startEditTeamMember(m)}
                          className="text-xs text-[#aaa] hover:text-[#1a1a1a] transition-colors cursor-pointer">
                          Edit
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Leave Quota Assignment */}
        <section>
          <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-2">Leave Quota Assignment</h3>
          <p className="text-xs text-[#bbb] tracking-wider mb-6">Set allocated and remaining balances per leave type for each employee.</p>
          <div className="border border-[#ddd] bg-white p-6 max-w-2xl space-y-5">
            <div>
              <label className="text-xs tracking-[0.2em] uppercase text-[#888] block mb-1">Employee</label>
              <select
                value={qUserId}
                onChange={e => {
                  const uid = e.target.value
                  setQUserId(uid)
                  setQError('')
                  setQSuccess('')
                  if (uid) setQBalancesEdit(buildQuotaEdit(uid, team, leaveTypes))
                  else setQBalancesEdit({})
                }}
                className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none"
              >
                <option value="">Select employee</option>
                {team.map(m => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
              </select>
            </div>

            {qUserId && leaveTypes.filter(lt => lt.is_active).length > 0 && (
              <div className="border border-[#eee]">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#eee] bg-[#fafafa]">
                      <th className="px-4 py-2 text-left text-[9px] tracking-[0.2em] uppercase text-[#aaa] font-normal">Leave Type</th>
                      <th className="px-4 py-2 text-left text-[9px] tracking-[0.2em] uppercase text-[#aaa] font-normal">Allocated</th>
                      <th className="px-4 py-2 text-left text-[9px] tracking-[0.2em] uppercase text-[#aaa] font-normal">Remaining</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f5f5f5]">
                    {leaveTypes.filter(lt => lt.is_active).map(lt => (
                      <tr key={lt.key}>
                        <td className="px-4 py-2 text-xs text-[#1a1a1a]">{lt.label}</td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            step="0.5"
                            value={qBalancesEdit[lt.key]?.allocated ?? ''}
                            onChange={e => setQBalancesEdit(prev => ({
                              ...prev,
                              [lt.key]: { ...prev[lt.key], allocated: e.target.value },
                            }))}
                            className="w-20 border border-[#ddd] bg-[#F5F2EE] px-2 py-1 text-xs text-[#1a1a1a] focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            step="0.5"
                            value={qBalancesEdit[lt.key]?.balance ?? ''}
                            onChange={e => setQBalancesEdit(prev => ({
                              ...prev,
                              [lt.key]: { ...prev[lt.key], balance: e.target.value },
                            }))}
                            className="w-20 border border-[#ddd] bg-[#F5F2EE] px-2 py-1 text-xs text-[#1a1a1a] focus:outline-none"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {qError && <p className="text-xs text-red-400">{qError}</p>}
            {qSuccess && <p className="text-xs text-emerald-600">{qSuccess}</p>}
            <button
              onClick={saveAllQuota}
              disabled={qSaving || !qUserId}
              className="w-full py-2 border border-[#1a1a1a] text-xs tracking-[0.25em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40"
            >
              {qSaving ? 'Saving…' : 'Save Quotas'}
            </button>
          </div>
        </section>

        {/* Assign Leave */}
        <section>
          <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-6">Assign Leave</h3>
          <div className="border border-[#ddd] bg-white p-6 max-w-xl space-y-4">
            <p className="text-xs text-[#bbb] tracking-wider">Leave is saved as approved and balance is deducted immediately.</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs tracking-[0.2em] uppercase text-[#888] block mb-1">Employee</label>
                <select
                  value={aForm.user_id}
                  onChange={e => setAForm({ ...aForm, user_id: e.target.value })}
                  className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none"
                >
                  <option value="">Select employee</option>
                  {team.map(m => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs tracking-[0.2em] uppercase text-[#888] block mb-1">Leave Type</label>
                <select
                  value={aForm.type}
                  onChange={e => setAForm({ ...aForm, type: e.target.value })}
                  className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs uppercase text-[#1a1a1a] focus:outline-none"
                >
                  {leaveTypes.filter(lt => lt.is_active).map(lt => (
                    <option key={lt.key} value={lt.key}>{lt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs tracking-[0.2em] uppercase text-[#888] block mb-1">From</label>
                <input
                  type="date"
                  value={aForm.date_from}
                  onChange={e => setAForm({ ...aForm, date_from: e.target.value })}
                  className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs tracking-[0.2em] uppercase text-[#888] block mb-1">To</label>
                <input
                  type="date"
                  value={aForm.date_to}
                  onChange={e => setAForm({ ...aForm, date_to: e.target.value })}
                  className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] uppercase text-[#888] block mb-1">Duration</label>
              <select
                value={aForm.value}
                onChange={e => setAForm({ ...aForm, value: e.target.value })}
                className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs uppercase text-[#1a1a1a] focus:outline-none"
              >
                <option value="1">Full Day</option>
                <option value="0.5">Half Day</option>
              </select>
            </div>
            {aError && <p className="text-xs text-red-400">{aError}</p>}
            <button
              onClick={assignLeave}
              disabled={aSaving || !aForm.user_id || !aForm.date_from}
              className="w-full py-2 border border-[#1a1a1a] text-xs tracking-[0.25em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40"
            >
              {aSaving ? 'Assigning…' : 'Assign Leave'}
            </button>
          </div>
        </section>

        {/* Leave Type Definitions */}
        <section>
          <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-2">Leave Type Definitions</h3>
          <p className="text-xs text-[#bbb] tracking-wider mb-6">Add or edit leave types. New types appear automatically in the apply form and quota editor.</p>
          <div className="grid grid-cols-2 gap-8">
            {/* Add form */}
            <div className="border border-[#ddd] bg-white p-6 space-y-3">
              <p className="text-xs tracking-[0.2em] uppercase text-[#888]">Add Leave Type</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] uppercase tracking-wider text-[#aaa] block mb-1">Key (unique ID)</label>
                  <input type="text" placeholder="e.g. paternity" value={ltForm.key}
                    onChange={e => setLtForm({ ...ltForm, key: e.target.value })}
                    className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none" />
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-wider text-[#aaa] block mb-1">Label</label>
                  <input type="text" placeholder="e.g. Paternity Leave" value={ltForm.label}
                    onChange={e => setLtForm({ ...ltForm, label: e.target.value })}
                    className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none" />
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-wider text-[#aaa] block mb-1">Default Days (blank = custom)</label>
                  <input type="number" min="0" step="1" placeholder="e.g. 10" value={ltForm.default_days}
                    onChange={e => setLtForm({ ...ltForm, default_days: e.target.value })}
                    className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none" />
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-wider text-[#aaa] block mb-1">Sort Order</label>
                  <input type="number" min="0" value={ltForm.sort_order}
                    onChange={e => setLtForm({ ...ltForm, sort_order: e.target.value })}
                    className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none" />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={ltForm.requires_docs}
                  onChange={e => setLtForm({ ...ltForm, requires_docs: e.target.checked })}
                  className="w-4 h-4 accent-[#1a1a1a]" />
                <span className="text-xs text-[#888]">Requires medical documents</span>
              </label>
              {ltError && <p className="text-xs text-red-400">{ltError}</p>}
              <button
                onClick={addLeaveType}
                disabled={ltSaving || !ltForm.key || !ltForm.label}
                className="w-full py-2 border border-[#1a1a1a] text-xs tracking-[0.25em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40"
              >
                {ltSaving ? 'Adding…' : 'Add Type'}
              </button>
            </div>

            {/* Leave types table */}
            <div className="border border-[#ddd] bg-white overflow-y-auto max-h-[420px]">
              {leaveTypes.length === 0 ? (
                <p className="p-6 text-xs text-[#bbb] tracking-wider">No leave types defined.</p>
              ) : leaveTypes.map(lt => (
                <div key={lt.key} className="border-b border-[#eee] last:border-0">
                  {ltEditKey === lt.key ? (
                    <div className="px-5 py-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] uppercase tracking-wider text-[#aaa] block mb-1">Label</label>
                          <input type="text" value={ltEditForm.label}
                            onChange={e => setLtEditForm({ ...ltEditForm, label: e.target.value })}
                            className="w-full border border-[#ddd] bg-[#F5F2EE] px-2 py-1 text-xs text-[#1a1a1a] focus:outline-none" />
                        </div>
                        <div>
                          <label className="text-[9px] uppercase tracking-wider text-[#aaa] block mb-1">Default Days</label>
                          <input type="number" min="0" step="1" value={ltEditForm.default_days}
                            onChange={e => setLtEditForm({ ...ltEditForm, default_days: e.target.value })}
                            placeholder="blank = custom"
                            className="w-full border border-[#ddd] bg-[#F5F2EE] px-2 py-1 text-xs text-[#1a1a1a] focus:outline-none" />
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={ltEditForm.requires_docs}
                            onChange={e => setLtEditForm({ ...ltEditForm, requires_docs: e.target.checked })}
                            className="w-3.5 h-3.5 accent-[#1a1a1a]" />
                          <span className="text-[10px] text-[#888]">Requires docs</span>
                        </label>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-[#aaa]">Order:</span>
                          <input type="number" min="0" value={ltEditForm.sort_order}
                            onChange={e => setLtEditForm({ ...ltEditForm, sort_order: e.target.value })}
                            className="w-14 border border-[#ddd] bg-[#F5F2EE] px-2 py-1 text-xs text-[#1a1a1a] focus:outline-none" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => saveLeaveTypeEdit(lt.key)} disabled={ltEditSaving}
                          className="px-4 py-1 border border-[#1a1a1a] text-[10px] tracking-wider uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40">
                          {ltEditSaving ? '…' : 'Save'}
                        </button>
                        <button onClick={() => setLtEditKey(null)}
                          className="px-4 py-1 border border-[#ddd] text-[10px] uppercase text-[#888] cursor-pointer">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-5 py-3 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className={`text-xs ${lt.is_active ? 'text-[#1a1a1a]' : 'text-[#bbb] line-through'}`}>{lt.label}</p>
                          {lt.requires_docs && (
                            <span className="text-[9px] bg-amber-50 text-amber-600 px-1.5 py-0.5 tracking-wider uppercase">Docs</span>
                          )}
                        </div>
                        <p className="text-[10px] text-[#aaa] mt-0.5">
                          {lt.key} · {lt.default_days != null ? `${lt.default_days}d` : 'custom'} · order {lt.sort_order}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        <button onClick={() => startEditLeaveType(lt)}
                          className="text-[10px] text-[#aaa] hover:text-[#1a1a1a] transition-colors cursor-pointer">
                          Edit
                        </button>
                        <button
                          onClick={() => toggleLeaveType(lt.key, !lt.is_active)}
                          className={`text-[10px] transition-colors cursor-pointer ${lt.is_active ? 'text-[#aaa] hover:text-red-500' : 'text-emerald-500 hover:text-emerald-700'}`}
                        >
                          {lt.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Holiday Manager */}
        <section>
          <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-6">Holiday Manager</h3>
          <div className="grid grid-cols-2 gap-8">
            <div className="border border-[#ddd] bg-white p-6 space-y-4">
              <p className="text-xs tracking-[0.2em] uppercase text-[#888]">Add Holiday</p>
              <input
                type="text"
                placeholder="Holiday name"
                value={hForm.name}
                onChange={e => setHForm({ ...hForm, name: e.target.value })}
                className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none"
              />
              <input
                type="date"
                value={hForm.date}
                onChange={e => setHForm({ ...hForm, date: e.target.value })}
                className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none"
              />
              <select
                value={hForm.type}
                onChange={e => setHForm({ ...hForm, type: e.target.value })}
                className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs uppercase text-[#1a1a1a] focus:outline-none"
              >
                <option value="national">National</option>
                <option value="company">Company</option>
              </select>
              {hError && <p className="text-xs text-red-400">{hError}</p>}
              <button
                onClick={addHoliday}
                disabled={hSaving || !hForm.name || !hForm.date}
                className="w-full py-2 border border-[#1a1a1a] text-xs tracking-[0.25em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40"
              >
                {hSaving ? 'Adding…' : 'Add Holiday'}
              </button>
            </div>

            <div className="border border-[#ddd] bg-white divide-y divide-[#eee] max-h-72 overflow-y-auto">
              {holidays.length === 0 ? (
                <p className="p-6 text-xs text-[#bbb] tracking-wider">No holidays added.</p>
              ) : holidays.map(h => (
                <div key={h.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-[#1a1a1a]">{h.name}</p>
                    <p className="text-[10px] text-[#aaa] mt-0.5">{formatDate(h.date)} · {h.type}</p>
                  </div>
                  <button
                    onClick={() => deleteHoliday(h.id)}
                    className="text-xs text-[#aaa] hover:text-red-500 transition-colors cursor-pointer ml-4"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Working Saturday Manager */}
        <section>
          <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-2">Working Saturdays</h3>
          <p className="text-xs text-[#bbb] tracking-wider mb-6">Mark Saturdays as company-wide working days. Employees can log their own separately.</p>
          <div className="grid grid-cols-2 gap-8">
            <div className="border border-[#ddd] bg-white p-6 space-y-4">
              <p className="text-xs tracking-[0.2em] uppercase text-[#888]">Add Working Saturday</p>
              <input
                type="date"
                value={wsDate}
                onChange={e => setWsDate(e.target.value)}
                className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none"
              />
              <p className="text-[10px] text-[#bbb] tracking-wider">Must be a Saturday</p>
              {wsError && <p className="text-xs text-red-400">{wsError}</p>}
              <button
                onClick={addWorkingSaturday}
                disabled={wsSaving || !wsDate}
                className="w-full py-2 border border-[#1a1a1a] text-xs tracking-[0.25em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40"
              >
                {wsSaving ? 'Adding…' : 'Add Saturday'}
              </button>
            </div>

            <div className="border border-[#ddd] bg-white divide-y divide-[#eee] max-h-72 overflow-y-auto">
              {workingSaturdays.length === 0 ? (
                <p className="p-6 text-xs text-[#bbb] tracking-wider">No working Saturdays set.</p>
              ) : workingSaturdays.map(ws => (
                <div key={ws.id} className="px-5 py-3 flex items-center justify-between">
                  <p className="text-xs text-[#1a1a1a]">{formatDate(ws.date)}</p>
                  <button
                    onClick={() => removeWorkingSaturday(ws.id)}
                    className="text-xs text-[#aaa] hover:text-red-500 transition-colors cursor-pointer ml-4"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Review Manager */}
        <section>
          <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-6">Review Manager</h3>
          <div className="grid grid-cols-2 gap-8">
            <div className="border border-[#ddd] bg-white p-6 space-y-4">
              <p className="text-xs tracking-[0.2em] uppercase text-[#888]">
                {rEditId ? 'Edit Review' : 'Add Review'}
              </p>
              <select
                value={rForm.user_id}
                onChange={e => setRForm({ ...rForm, user_id: e.target.value })}
                disabled={!!rEditId}
                className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none disabled:opacity-50"
              >
                <option value="">Select employee</option>
                {team.map(m => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
              </select>
              <input
                type="date"
                value={rForm.date}
                onChange={e => setRForm({ ...rForm, date: e.target.value })}
                className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none"
              />
              <select
                value={rForm.type}
                onChange={e => setRForm({ ...rForm, type: e.target.value })}
                className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs uppercase text-[#1a1a1a] focus:outline-none"
              >
                <option value="annual">Annual</option>
                <option value="bi-annual">Bi-Annual</option>
              </select>
              <textarea
                placeholder="Private notes (not visible to employee)"
                value={rForm.notes}
                onChange={e => setRForm({ ...rForm, notes: e.target.value })}
                rows={3}
                className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none resize-none"
              />
              {rError && <p className="text-xs text-red-400">{rError}</p>}
              <div className="flex gap-3">
                <button
                  onClick={saveReview}
                  disabled={rSaving || !rForm.user_id || !rForm.date}
                  className="flex-1 py-2 border border-[#1a1a1a] text-xs tracking-[0.25em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40"
                >
                  {rSaving ? 'Saving…' : rEditId ? 'Update' : 'Add Review'}
                </button>
                {rEditId && (
                  <button
                    onClick={() => { setREditId(null); setRForm({ user_id: '', date: '', type: 'annual', notes: '' }); setRError('') }}
                    className="px-4 py-2 border border-[#ddd] text-xs tracking-wider uppercase text-[#888] hover:text-[#1a1a1a] transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            <div className="border border-[#ddd] bg-white divide-y divide-[#eee] max-h-96 overflow-y-auto">
              {reviews.length === 0 ? (
                <p className="p-6 text-xs text-[#bbb] tracking-wider">No reviews scheduled.</p>
              ) : reviews.map(r => (
                <div key={r.id} className="px-5 py-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[#1a1a1a]">{r.users?.name || r.users?.email || 'Unknown'}</p>
                      <p className="text-[10px] text-[#aaa] mt-0.5">{formatDate(r.date)} · {r.type}</p>
                      {r.notes && <p className="text-[10px] text-[#888] mt-1 italic">{r.notes}</p>}
                    </div>
                    <div className="flex gap-3 ml-3 shrink-0">
                      <button onClick={() => startEditReview(r)}
                        className="text-xs text-[#aaa] hover:text-[#1a1a1a] transition-colors cursor-pointer">
                        Edit
                      </button>
                      <button onClick={() => deleteReview(r.id)}
                        className="text-xs text-[#aaa] hover:text-red-500 transition-colors cursor-pointer">
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

      </div>
    </main>
  )
}
