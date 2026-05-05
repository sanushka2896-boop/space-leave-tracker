'use client'
import { useEffect, useState } from 'react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import Nav from '../components/Nav'

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
  balance: { sick_leaves: number; earned_leaves: number; wfh_days: number }
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
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [workingSaturdays, setWorkingSaturdays] = useState<WorkingSaturday[]>([])
  const [acting, setActing] = useState<string | null>(null)
  const [saveError, setSaveError] = useState('')

  const [hForm, setHForm] = useState({ name: '', date: '', type: 'national' })
  const [hSaving, setHSaving] = useState(false)

  const [rForm, setRForm] = useState({ user_id: '', date: '', type: 'annual', notes: '' })
  const [rSaving, setRSaving] = useState(false)
  const [rEditId, setREditId] = useState<string | null>(null)

  const [aForm, setAForm] = useState({ user_id: '', type: 'earned', date_from: '', date_to: '', value: '1' })
  const [aSaving, setASaving] = useState(false)
  const [aError, setAError] = useState('')

  const [wsDate, setWsDate] = useState('')
  const [wsSaving, setWsSaving] = useState(false)

  const router = useRouter()

  async function loadData() {
    const [
      { data: leavesRaw },
      { data: usersRaw },
      { data: holidaysRaw },
      { data: reviewsRaw },
      { data: wsRaw },
    ] = await Promise.all([
      supabaseAdmin.from('leaves').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
      supabaseAdmin.from('users').select('id, name, email, role, location, is_bd_associate, is_admin'),
      supabaseAdmin.from('holidays').select('*').order('date', { ascending: true }),
      supabaseAdmin.from('reviews').select('id, user_id, date, type, notes, created_at').order('date', { ascending: true }),
      supabaseAdmin.from('working_saturdays').select('*').is('user_id', null).order('date', { ascending: true }),
    ])

    const userMap: Record<string, { name: string; email: string }> = {}
    for (const u of usersRaw ?? []) userMap[u.id] = { name: u.name, email: u.email }

    const enrichedLeaves: Leave[] = (leavesRaw ?? []).map((l: any) => ({ ...l, users: userMap[l.user_id] ?? null }))
    const enrichedReviews: Review[] = (reviewsRaw ?? []).map((r: any) => ({ ...r, users: userMap[r.user_id] ?? null }))

    const userIds = (usersRaw ?? []).map((u: any) => u.id)
    let balances: any[] = []
    if (userIds.length > 0) {
      const { data: b } = await supabaseAdmin.from('leave_balance').select('*').in('user_id', userIds)
      balances = b ?? []
    }

    const enrichedTeam: TeamMember[] = (usersRaw ?? []).map((u: any) => ({
      ...u,
      balance: balances.find((b: any) => b.user_id === u.id) ?? { sick_leaves: 12, earned_leaves: 15, wfh_days: 24 },
    }))

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
        .from('users')
        .select('id, is_admin')
        .eq('email', session.user.email)
        .single()

      if (!dbUser?.is_admin) { router.push('/dashboard'); return }

      setAdminUserId(dbUser.id)
      await loadData()
      setLoading(false)
    })
  }, [])

  async function handleLeaveAction(id: string, action: 'approve' | 'reject') {
    setActing(id + action)
    setSaveError('')
    const newStatus = action === 'approve' ? 'approved' : 'rejected'

    const leave = pendingLeaves.find(l => l.id === id)
    if (!leave) { setActing(null); return }

    const { error: updateErr } = await supabaseAdmin.from('leaves').update({ status: newStatus }).eq('id', id)
    if (updateErr) { setSaveError(updateErr.message); setActing(null); return }

    if (action === 'approve') {
      const field = leave.type === 'sick' ? 'sick_leaves' : leave.type === 'earned' ? 'earned_leaves' : 'wfh_days'
      const { data: bal } = await supabaseAdmin.from('leave_balance').select(field).eq('user_id', leave.user_id).single()
      if (bal) {
        const current = (bal as any)[field] as number
        await supabaseAdmin.from('leave_balance').update({ [field]: Math.max(0, current - leave.value) }).eq('user_id', leave.user_id)
      }
    }

    await loadData()
    setActing(null)
  }

  async function addHoliday() {
    if (!hForm.name || !hForm.date) return
    setSaveError('')
    setHSaving(true)
    const { error } = await supabaseAdmin.from('holidays').insert({ name: hForm.name, date: hForm.date, type: hForm.type })
    if (error) { setSaveError(error.message); setHSaving(false); return }
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
    setSaveError('')
    setRSaving(true)

    let error: any
    if (rEditId) {
      const res = await supabaseAdmin
        .from('reviews')
        .update({ date: rForm.date, type: rForm.type, notes: rForm.notes || null })
        .eq('id', rEditId)
      error = res.error
    } else {
      const res = await supabaseAdmin
        .from('reviews')
        .insert({ user_id: rForm.user_id, date: rForm.date, type: rForm.type, notes: rForm.notes || null, created_by: adminUserId || null })
      error = res.error
    }

    if (error) { setSaveError(error.message); setRSaving(false); return }
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

    const field = aForm.type === 'sick' ? 'sick_leaves' : aForm.type === 'earned' ? 'earned_leaves' : 'wfh_days'
    const { data: bal } = await supabaseAdmin.from('leave_balance').select(field).eq('user_id', aForm.user_id).single()
    if (bal) {
      const current = (bal as any)[field] as number
      await supabaseAdmin.from('leave_balance').update({ [field]: Math.max(0, current - value) }).eq('user_id', aForm.user_id)
    }

    setAForm({ user_id: '', type: 'earned', date_from: '', date_to: '', value: '1' })
    await loadData()
    setASaving(false)
  }

  async function addWorkingSaturday() {
    if (!wsDate) return
    const d = new Date(wsDate + 'T00:00:00')
    if (d.getDay() !== 6) { setSaveError('Date must be a Saturday.'); return }
    setSaveError('')
    setWsSaving(true)
    const { error } = await supabaseAdmin.from('working_saturdays').insert({ date: wsDate, user_id: null })
    if (error) { setSaveError(error.message); setWsSaving(false); return }
    setWsDate('')
    await loadData()
    setWsSaving(false)
  }

  async function removeWorkingSaturday(id: string) {
    await supabaseAdmin.from('working_saturdays').delete().eq('id', id)
    await loadData()
  }

  function formatDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  if (loading) return null

  return (
    <main className="min-h-screen bg-[#F5F2EE]">
      <Nav isAdmin={true} />

      <div className="px-12 py-12 max-w-6xl mx-auto space-y-16">

        {/* Pending Leave Requests */}
        <section>
          <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-6">
            Pending Requests
            {pendingLeaves.length > 0 && <span className="ml-3 text-amber-600">({pendingLeaves.length})</span>}
          </h3>
          {saveError && <p className="text-xs text-red-400 tracking-wider mb-4">{saveError}</p>}
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
                  <div className="flex gap-3 shrink-0">
                    <button
                      onClick={() => handleLeaveAction(leave.id, 'approve')}
                      disabled={acting !== null}
                      className="px-5 py-2 border border-emerald-600 text-xs tracking-wider uppercase text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all cursor-pointer disabled:opacity-40"
                    >
                      {acting === leave.id + 'approve' ? '…' : 'Approve'}
                    </button>
                    <button
                      onClick={() => handleLeaveAction(leave.id, 'reject')}
                      disabled={acting !== null}
                      className="px-5 py-2 border border-red-400 text-xs tracking-wider uppercase text-red-400 hover:bg-red-400 hover:text-white transition-all cursor-pointer disabled:opacity-40"
                    >
                      {acting === leave.id + 'reject' ? '…' : 'Reject'}
                    </button>
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
                  {['Name', 'Role', 'Location', 'Sick', 'Earned', 'WFH'].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs tracking-[0.2em] uppercase text-[#aaa] font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f5f5f5]">
                {team.map(m => (
                  <tr key={m.id}>
                    <td className="px-6 py-4">
                      <p className="text-xs text-[#1a1a1a]">{m.name || m.email}</p>
                      {m.is_admin && <span className="text-[9px] tracking-wider uppercase text-[#aaa]">Admin</span>}
                    </td>
                    <td className="px-6 py-4 text-xs text-[#888]">{m.role || '—'}</td>
                    <td className="px-6 py-4 text-xs text-[#888]">{m.location || '—'}</td>
                    <td className="px-6 py-4 text-xs text-[#1a1a1a] font-light">{m.balance.sick_leaves}</td>
                    <td className="px-6 py-4 text-xs text-[#1a1a1a] font-light">{m.balance.earned_leaves}</td>
                    <td className="px-6 py-4 text-xs text-[#1a1a1a] font-light">{m.balance.wfh_days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                  <option value="sick">Sick</option>
                  <option value="earned">Earned</option>
                  <option value="wfh">WFH</option>
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
              {saveError && <p className="text-xs text-red-400">{saveError}</p>}
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
                    onClick={() => { setREditId(null); setRForm({ user_id: '', date: '', type: 'annual', notes: '' }) }}
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
