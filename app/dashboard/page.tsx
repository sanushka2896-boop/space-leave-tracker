'use client'
import { useEffect, useState } from 'react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import Nav from '../components/Nav'
import { buildInitialBalances } from '../lib/leaveTypes'
import type { LeaveTypeDef } from '../lib/leaveTypes'

type Leave = {
  id: string; type: string; date_from: string; date_to: string
  value: number; reason: string; status: string
}
type EditState = { type: string; date_from: string; date_to: string; value: string; reason: string }
type BalanceItem = { key: string; label: string; allocated: number; balance: number; taken: number; scheduled: number }
type TeamPerson = { name: string; type: string; date_from: string; date_to: string }
type ClockLog = { id: string; user_id: string; date: string; clock_in_time: string | null; users?: { name: string } | null }

function getISTNow(): { date: string; time: string } {
  const now = new Date()
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  const y = ist.getFullYear()
  const mo = String(ist.getMonth() + 1).padStart(2, '0')
  const d = String(ist.getDate()).padStart(2, '0')
  const h = String(ist.getHours()).padStart(2, '0')
  const mi = String(ist.getMinutes()).padStart(2, '0')
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` }
}
function fmtTime(t: string | null) {
  if (!t) return '—'
  const parts = t.split(':').map(Number)
  const h = parts[0], m = parts[1]
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function minutesDiff(a: string, b: string) {
  const [ah, am] = a.split(':').map(Number)
  const [bh, bm] = b.split(':').map(Number)
  return (bh * 60 + bm) - (ah * 60 + am)
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'text-amber-600 bg-amber-50',
  approved: 'text-emerald-600 bg-emerald-50',
  rejected: 'text-red-500 bg-red-50',
  cancelled: 'text-[#bbb] bg-[#f5f5f5]',
}

function toDateStr(d: Date) { return d.toISOString().split('T')[0] }
function fmt(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
function daysUntil(d: string) {
  const diff = Math.ceil(
    (new Date(d + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime()) / 86400000
  )
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff < 0) return `${Math.abs(diff)}d ago`
  return `In ${diff}d`
}

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState('')
  const [balances, setBalances] = useState<BalanceItem[]>([])
  const [myLeaves, setMyLeaves] = useState<Leave[]>([])
  const [teamAvail, setTeamAvail] = useState<{ today: TeamPerson[]; tomorrow: TeamPerson[]; nextWeek: TeamPerson[] }>({ today: [], tomorrow: [], nextWeek: [] })
  const [holidays, setHolidays] = useState<{ id: string; name: string; date: string }[]>([])
  const [workingSats, setWorkingSats] = useState<{ company: { id: string; date: string }[]; personal: { id: string; date: string }[] }>({ company: [], personal: [] })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>({ type: '', date_from: '', date_to: '', value: '1', reason: '' })
  const [saving, setSaving] = useState(false)
  const [wsDate, setWsDate] = useState('')
  const [wsAdding, setWsAdding] = useState(false)
  const [todayClock, setTodayClock] = useState<ClockLog | null>(null)
  const [clockAction, setClockAction] = useState(false)
  const [clockError, setClockError] = useState('')
  const [allClockLogs, setAllClockLogs] = useState<ClockLog[]>([])
  const [nextReview, setNextReview] = useState<{ date: string; type: string } | null>(null)
  const router = useRouter()

  async function loadClockData(uid: string, adminFlag: boolean) {
    const { date: today } = getISTNow()
    const { data: myLogArr } = await supabaseAdmin
      .from('clock_logs').select('*').eq('user_id', uid).eq('date', today).limit(1)
    setTodayClock(myLogArr?.[0] ?? null)
    if (adminFlag) {
      const { data: allLogs } = await supabaseAdmin
        .from('clock_logs').select('*, users(name)').eq('date', today).order('clock_in_time', { ascending: true })
      setAllClockLogs(allLogs ?? [])
    }
  }

  async function deleteClockIn(uid: string, adminFlag: boolean) {
    if (!todayClock) return
    setClockAction(true); setClockError('')
    const { error } = await supabaseAdmin.from('clock_logs').delete().eq('id', todayClock.id)
    if (error) { setClockError(`Delete failed: ${error.message}`); setClockAction(false); return }
    await loadClockData(uid, adminFlag)
    setClockAction(false)
  }

  async function clockIn(uid: string, adminFlag: boolean) {
    setClockAction(true); setClockError('')
    const { date: today, time: t } = getISTNow()
    const { data, error } = await supabaseAdmin.from('clock_logs')
      .insert({ user_id: uid, date: today, clock_in_time: t }).select().limit(1)
    if (error) { setClockError(`Clock-in failed: ${error.message}`); setClockAction(false); return }
    if (t > '10:15') {
      const minLate = minutesDiff('10:00', t)
      const { data: existing } = await supabaseAdmin
        .from('late_arrivals').select('id').eq('user_id', uid).eq('date', today).maybeSingle()
      if (!existing) {
        await supabaseAdmin.from('late_arrivals').insert(
          { user_id: uid, date: today, arrival_time: t, minutes_late: minLate, pto_deduction_status: 'Pending', approved: false }
        )
      }
    }
    await loadClockData(uid, adminFlag)
    setClockAction(false)
  }

  async function loadData(uid: string) {
    const todayStr = getISTNow().date
    const today = new Date()
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
    const nwStart = new Date(today); nwStart.setDate(today.getDate() + 7)
    const nwEnd = new Date(today); nwEnd.setDate(today.getDate() + 13)
    const tomorrowStr = toDateStr(tomorrow)
    const nwStartStr = toDateStr(nwStart)
    const nwEndStr = toDateStr(nwEnd)

    const [
      { data: balRows },
      { data: ltDefs },
      { data: allMyLeaves },
      { data: teamLeavesRaw },
      { data: holidayRows },
      { data: wsRows },
      { data: myWsRows },
      { data: reviewRows },
    ] = await Promise.all([
      supabaseAdmin.from('leave_balances').select('leave_type, allocated, balance').eq('user_id', uid),
      supabaseAdmin.from('leave_types').select('key, label, sort_order').eq('is_active', true).order('sort_order'),
      supabaseAdmin.from('leaves').select('*').eq('user_id', uid).in('status', ['approved', 'pending']).order('date_from', { ascending: true }),
      supabaseAdmin.from('leaves').select('date_from, date_to, type, users(name)').neq('user_id', uid).eq('status', 'approved').lte('date_from', nwEndStr).gte('date_to', todayStr),
      supabaseAdmin.from('holidays').select('id, name, date').gte('date', todayStr).order('date', { ascending: true }).limit(3),
      supabaseAdmin.from('working_saturdays').select('id, date').is('user_id', null).gte('date', todayStr).order('date', { ascending: true }),
      supabaseAdmin.from('working_saturdays').select('id, date').eq('user_id', uid).order('date', { ascending: false }).limit(10),
      supabaseAdmin.from('reviews').select('date, type').eq('user_id', uid).gte('date', todayStr).order('date', { ascending: true }).limit(1),
    ])

    const typeLabelMap: Record<string, { label: string; sort: number }> = {}
    for (const lt of ltDefs ?? []) typeLabelMap[lt.key] = { label: lt.label, sort: lt.sort_order }

    const leaves = allMyLeaves ?? []
    const pastApproved = leaves.filter((l: any) => l.status === 'approved' && l.date_to < todayStr)
    const futureApproved = leaves.filter((l: any) => l.status === 'approved' && l.date_from >= todayStr)
    const sumByType = (arr: any[], ...types: string[]) => arr.filter(l => types.includes(l.type)).reduce((s: number, l: any) => s + l.value, 0)

    // Normalize casual→earned and deduplicate rows (keep highest allocated)
    const normalized: Record<string, { leave_type: string; allocated: number; balance: number }> = {}
    for (const r of balRows ?? []) {
      const key = r.leave_type === 'casual' ? 'earned' : r.leave_type
      if (!normalized[key] || r.allocated > normalized[key].allocated) {
        normalized[key] = { leave_type: key, allocated: r.allocated, balance: r.balance }
      }
    }

    const balanceItems: BalanceItem[] = Object.values(normalized)
      .filter((r) => r.allocated > 0 || Math.abs(r.balance) > 0)
      .sort((a, b) => (typeLabelMap[a.leave_type]?.sort ?? 99) - (typeLabelMap[b.leave_type]?.sort ?? 99))
      .map((r) => ({
        key: r.leave_type,
        label: typeLabelMap[r.leave_type]?.label ?? r.leave_type,
        allocated: r.allocated,
        balance: r.balance,
        taken: r.leave_type === 'earned' ? sumByType(pastApproved, 'earned', 'casual') : sumByType(pastApproved, r.leave_type),
        scheduled: r.leave_type === 'earned' ? sumByType(futureApproved, 'earned', 'casual') : sumByType(futureApproved, r.leave_type),
      }))

    setBalances(balanceItems)
    setMyLeaves(leaves.filter((l: any) =>
      l.status === 'pending' || (l.status === 'approved' && l.date_from >= todayStr)
    ))

    const allTeam = (teamLeavesRaw ?? []).map((l: any) => ({
      name: (l.users as any)?.name || 'Team', type: l.type, date_from: l.date_from, date_to: l.date_to,
    }))
    setTeamAvail({
      today:    allTeam.filter(l => l.date_from <= todayStr    && l.date_to >= todayStr),
      tomorrow: allTeam.filter(l => l.date_from <= tomorrowStr && l.date_to >= tomorrowStr),
      nextWeek: allTeam.filter(l => l.date_from <= nwEndStr    && l.date_to >= nwStartStr),
    })
    setHolidays(holidayRows ?? [])
    setWorkingSats({ company: wsRows ?? [], personal: myWsRows ?? [] })
    setNextReview(reviewRows?.[0] ?? null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/'); return }
      setUser(session.user)

      const { data: dbUser } = await supabaseAdmin
        .from('users').select('id, is_admin, role').eq('email', session.user.email).maybeSingle()

      let resolvedUser = dbUser

      if (!dbUser) {
        const newName = session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'New User'
        const { data: created, error: createErr } = await supabaseAdmin
          .from('users')
          .insert({ email: session.user.email, name: newName, is_admin: false })
          .select('id, is_admin, role')
          .single()

        if (createErr || !created) return
        resolvedUser = created

        // Seed leave balances from leave_types defaults + role-based WFH
        const { data: ltDefs } = await supabaseAdmin
          .from('leave_types').select('key, label, default_days, requires_docs, is_active, sort_order')
          .eq('is_active', true)
        const seedRows = buildInitialBalances(created.id, created.role, (ltDefs ?? []) as LeaveTypeDef[])
        if (seedRows.length > 0) {
          await supabaseAdmin.from('leave_balances').insert(seedRows)
        }
      }

      if (!resolvedUser) return
      setUserId(resolvedUser.id)
      const adminFlag = resolvedUser.is_admin === true
      setIsAdmin(adminFlag)
      await Promise.all([loadData(resolvedUser.id), loadClockData(resolvedUser.id, adminFlag)])
    })
  }, [])

  async function cancelLeave(id: string) {
    setSaving(true)
    const leave = myLeaves.find(l => l.id === id)
    await supabaseAdmin.from('leaves').update({ status: 'cancelled' }).eq('id', id).eq('user_id', userId)
    if (leave?.status === 'approved') {
      const { data: bal } = await supabaseAdmin
        .from('leave_balances').select('balance, allocated')
        .eq('user_id', userId).eq('leave_type', leave.type).maybeSingle()
      await supabaseAdmin.from('leave_balances').upsert({
        user_id: userId,
        leave_type: leave.type,
        allocated: bal?.allocated ?? 0,
        balance: (bal?.balance ?? 0) + leave.value,
      })
    }
    await loadData(userId)
    setSaving(false)
  }

  function startEdit(leave: Leave) {
    setEditingId(leave.id)
    setEditState({ type: leave.type, date_from: leave.date_from, date_to: leave.date_to, value: String(leave.value), reason: leave.reason || '' })
  }

  async function saveEdit(id: string) {
    setSaving(true)
    await supabaseAdmin.from('leaves').update({
      type: editState.type, date_from: editState.date_from, date_to: editState.date_to,
      reason: editState.reason, value: parseFloat(editState.value),
    }).eq('id', id).eq('user_id', userId)
    setEditingId(null)
    await loadData(userId)
    setSaving(false)
  }

  async function logWorkingSaturday() {
    if (!wsDate || !userId) return
    if (new Date(wsDate + 'T00:00:00').getDay() !== 6) return
    setWsAdding(true)
    await supabaseAdmin.from('working_saturdays').insert({ date: wsDate, user_id: userId })
    setWsDate('')
    await loadData(userId)
    setWsAdding(false)
  }

  async function removeMyWS(id: string) {
    await supabaseAdmin.from('working_saturdays').delete().eq('id', id).eq('user_id', userId)
    await loadData(userId)
  }

  if (!user) return null

  return (
    <main className="min-h-screen bg-[#F5F2EE]">
      <Nav isAdmin={isAdmin} />

      <div className="px-12 py-12 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-end justify-between mb-12">
          <div>
            <p className="text-xs tracking-[0.3em] uppercase text-[#888] mb-2">Welcome back</p>
            <p className="text-2xl font-light tracking-wide text-[#1a1a1a]">
              {user.user_metadata?.full_name || user.email}
            </p>
          </div>
          <button
            onClick={() => router.push('/apply')}
            className="px-8 py-3 border border-[#1a1a1a] text-xs tracking-[0.25em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#F5F2EE] transition-all duration-300 cursor-pointer"
          >
            Apply for Leave
          </button>
        </div>

        {/* Next Review */}
        {nextReview && (
          <div className="mb-8 border border-[#ddd] bg-white px-8 py-4 flex items-center justify-between">
            <div>
              <p className="text-[9px] tracking-[0.3em] uppercase text-[#aaa] mb-1">Your Next Review</p>
              <p className="text-sm font-light text-[#1a1a1a]">{fmt(nextReview.date)}</p>
            </div>
            <span className="text-[9px] tracking-[0.2em] uppercase text-[#888] border border-[#ddd] px-3 py-1">
              {nextReview.type === 'bi-annual' ? 'Mid-Year' : nextReview.type === 'annual' ? 'Annual' : nextReview.type}
            </span>
          </div>
        )}

        {/* Clock In */}
        <div className="mb-12">
          <div className="border border-[#ddd] bg-white px-8 py-5 flex items-center justify-between">
            <div>
              <p className="text-[9px] tracking-[0.3em] uppercase text-[#aaa] mb-2">Today's Attendance</p>
              {todayClock?.clock_in_time ? (
                <div className="flex items-center gap-8">
                  <div>
                    <span className="text-[9px] text-[#ccc] uppercase tracking-wider">Clock In</span>
                    <p className="text-sm font-light text-[#1a1a1a] mt-0.5">{fmtTime(todayClock.clock_in_time)}</p>
                  </div>
                  {todayClock.clock_in_time > '10:15' && (
                    <div>
                      <span className="text-[9px] text-amber-600 uppercase tracking-wider">Late</span>
                      <p className="text-sm font-light text-amber-600 mt-0.5">
                        +{minutesDiff('10:00', todayClock.clock_in_time)}m
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm font-light text-[#bbb] mt-0.5">Not clocked in yet</p>
              )}
              {clockError && <p className="text-xs text-red-400 mt-2">{clockError}</p>}
            </div>
            {todayClock?.clock_in_time ? (
              <button onClick={() => deleteClockIn(userId, isAdmin)} disabled={clockAction}
                className="px-6 py-2.5 border border-red-400 text-xs tracking-[0.2em] uppercase text-red-400 hover:bg-red-400 hover:text-white transition-all cursor-pointer disabled:opacity-30">
                {clockAction ? '…' : 'Delete'}
              </button>
            ) : (
              <button onClick={() => clockIn(userId, isAdmin)} disabled={clockAction}
                className="px-6 py-2.5 border border-emerald-600 text-xs tracking-[0.2em] uppercase text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all cursor-pointer disabled:opacity-30">
                {clockAction ? '…' : 'Clock In'}
              </button>
            )}
          </div>

          {isAdmin && allClockLogs.length > 0 && (
            <div className="border border-[#ddd] border-t-0 bg-white overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#eee]">
                    {['Employee', 'Clock In', 'Status'].map(h => (
                      <th key={h} className="px-6 py-2 text-left text-[9px] tracking-[0.2em] uppercase text-[#aaa] font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f5f5f5]">
                  {allClockLogs.map(log => {
                    const late = log.clock_in_time && log.clock_in_time > '10:15'
                    return (
                      <tr key={log.id} className="hover:bg-[#fafafa]">
                        <td className="px-6 py-3 text-xs text-[#1a1a1a]">{(log.users as any)?.name || '—'}</td>
                        <td className={`px-6 py-3 text-xs ${late ? 'text-amber-600' : 'text-[#888]'}`}>{fmtTime(log.clock_in_time)}</td>
                        <td className="px-6 py-3">
                          {!log.clock_in_time ? (
                            <span className="text-[9px] uppercase tracking-wider text-[#ccc]">Not clocked in</span>
                          ) : late ? (
                            <span className="text-[9px] uppercase tracking-wider text-amber-600">Late {minutesDiff('10:00', log.clock_in_time!)}m</span>
                          ) : (
                            <span className="text-[9px] uppercase tracking-wider text-emerald-600">On time</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Balance Cards — dynamic, one per leave type with a balance */}
        {balances.length > 0 && (
          <div className="grid grid-cols-3 gap-6 mb-14">
            {balances.map(b => (
              <div key={b.key} className="border border-[#ddd] p-6 bg-white">
                <p className="text-[9px] tracking-[0.3em] uppercase text-[#aaa] mb-3">{b.label}</p>
                <p className={`text-4xl font-light ${b.balance < 0 ? 'text-red-500' : 'text-[#1a1a1a]'}`}>
                  {b.balance}
                </p>
                <p className={`text-[10px] tracking-wider mt-1 mb-4 ${b.balance < 0 ? 'text-red-400' : 'text-[#bbb]'}`}>
                  {b.balance < 0 ? 'over quota (unpaid)' : 'remaining'}
                </p>
                <div className="border-t border-[#f0f0f0] pt-3 flex gap-6">
                  <div>
                    <p className="text-[9px] text-[#ccc] uppercase tracking-wider">Allocated</p>
                    <p className="text-xs text-[#888] mt-0.5 font-light">{b.allocated}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-[#ccc] uppercase tracking-wider">Taken</p>
                    <p className="text-xs text-[#888] mt-0.5 font-light">{b.taken}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-[#ccc] uppercase tracking-wider">Scheduled</p>
                    <p className="text-xs text-[#888] mt-0.5 font-light">{b.scheduled}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upcoming Leaves */}
        <div className="mb-14">
          <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-5">Upcoming Leaves</h3>
          {myLeaves.length === 0 ? (
            <p className="text-sm text-[#bbb] tracking-wider">No upcoming or pending leaves.</p>
          ) : (
            <div className="border border-[#ddd] bg-white divide-y divide-[#eee]">
              {myLeaves.map(leave => (
                <div key={leave.id}>
                  {editingId === leave.id ? (
                    <div className="px-8 py-6 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs tracking-[0.2em] uppercase text-[#888] block mb-1">Type</label>
                          <select value={editState.type} onChange={e => setEditState({ ...editState, type: e.target.value })}
                            className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs uppercase text-[#1a1a1a] focus:outline-none">
                            {balances.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs tracking-[0.2em] uppercase text-[#888] block mb-1">Duration</label>
                          <select value={editState.value} onChange={e => setEditState({ ...editState, value: e.target.value })}
                            className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs uppercase text-[#1a1a1a] focus:outline-none">
                            <option value="1">Full Day</option>
                            <option value="0.5">Half Day</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs tracking-[0.2em] uppercase text-[#888] block mb-1">From</label>
                          <input type="date" value={editState.date_from} onChange={e => setEditState({ ...editState, date_from: e.target.value })}
                            className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none" />
                        </div>
                        <div>
                          <label className="text-xs tracking-[0.2em] uppercase text-[#888] block mb-1">To</label>
                          <input type="date" value={editState.date_to} onChange={e => setEditState({ ...editState, date_to: e.target.value })}
                            className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs tracking-[0.2em] uppercase text-[#888] block mb-1">Reason</label>
                        <input type="text" value={editState.reason} onChange={e => setEditState({ ...editState, reason: e.target.value })}
                          className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none" />
                      </div>
                      <div className="flex gap-3">
                        <button onClick={() => saveEdit(leave.id)} disabled={saving}
                          className="px-6 py-2 border border-[#1a1a1a] text-xs tracking-wider uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40">Save</button>
                        <button onClick={() => setEditingId(null)}
                          className="px-6 py-2 border border-[#ddd] text-xs tracking-wider uppercase text-[#888] hover:text-[#1a1a1a] cursor-pointer">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-8 py-5 flex items-center justify-between">
                      <div>
                        <p className="text-xs tracking-[0.2em] uppercase text-[#1a1a1a]">{leave.type} leave</p>
                        <p className="text-xs text-[#888] mt-1">
                          {fmt(leave.date_from)}{leave.date_to !== leave.date_from ? ` → ${fmt(leave.date_to)}` : ''}
                          {' · '}{leave.value === 0.5 ? 'Half day' : `${leave.value} day${leave.value !== 1 ? 's' : ''}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        {leave.status === 'pending' && (
                          <button onClick={() => startEdit(leave)}
                            className="text-xs tracking-wider uppercase text-[#888] hover:text-[#1a1a1a] transition-colors cursor-pointer">Modify</button>
                        )}
                        <button onClick={() => cancelLeave(leave.id)} disabled={saving}
                          className="text-xs tracking-wider uppercase text-[#888] hover:text-red-500 transition-colors cursor-pointer disabled:opacity-40">Cancel</button>
                        <span className={`text-xs tracking-widest uppercase px-3 py-1 ${STATUS_STYLES[leave.status] ?? 'text-[#888] bg-[#f5f5f5]'}`}>
                          {leave.status}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Team Availability */}
        <div className="mb-14">
          <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-5">Team Availability</h3>
          <div className="grid grid-cols-3 gap-6">
            {([
              { label: 'Today',     people: teamAvail.today },
              { label: 'Tomorrow',  people: teamAvail.tomorrow },
              { label: 'Next Week', people: teamAvail.nextWeek },
            ] as const).map(({ label, people }) => (
              <div key={label} className="border border-[#ddd] bg-white p-5">
                <p className="text-[9px] tracking-[0.3em] uppercase text-[#aaa] mb-3">{label}</p>
                {people.length === 0 ? (
                  <p className="text-xs text-emerald-600 tracking-wider">Everyone in</p>
                ) : (
                  <div className="space-y-2">
                    {people.map((p, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <p className="text-xs text-[#1a1a1a] truncate pr-2">{p.name}</p>
                        <span className="text-[9px] text-[#aaa] uppercase tracking-wider shrink-0">{p.type}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Holidays */}
        {holidays.length > 0 && (
          <div className="mb-14">
            <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-5">Upcoming Holidays</h3>
            <div className="grid grid-cols-3 gap-6">
              {holidays.map(h => (
                <div key={h.id} className="border border-[#ddd] bg-white p-5">
                  <p className="text-xs tracking-[0.1em] text-[#1a1a1a] mb-1">{h.name}</p>
                  <p className="text-[10px] text-[#aaa]">
                    {new Date(h.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </p>
                  <p className="text-[9px] text-amber-600 tracking-[0.2em] uppercase mt-3">{daysUntil(h.date)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Working Saturdays */}
        <div className="mb-6">
          <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-5">Working Saturdays</h3>
          <div className="grid grid-cols-2 gap-8">
            <div className="border border-[#ddd] bg-white p-5 space-y-3">
              <p className="text-[9px] tracking-[0.25em] uppercase text-[#aaa]">Company-Wide</p>
              {workingSats.company.length === 0 ? (
                <p className="text-xs text-[#bbb] tracking-wider">None upcoming.</p>
              ) : workingSats.company.map(ws => (
                <p key={ws.id} className="text-xs text-[#1a1a1a]">{fmt(ws.date)}</p>
              ))}
            </div>
            <div className="border border-[#ddd] bg-white p-5 space-y-3">
              <p className="text-[9px] tracking-[0.25em] uppercase text-[#aaa]">Log Personal</p>
              <div className="flex gap-3">
                <input type="date" value={wsDate} onChange={e => setWsDate(e.target.value)}
                  className="flex-1 border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none" />
                <button onClick={logWorkingSaturday} disabled={wsAdding || !wsDate}
                  className="px-4 py-2 border border-[#1a1a1a] text-xs tracking-wider uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40 shrink-0">
                  {wsAdding ? '…' : 'Log'}
                </button>
              </div>
              {workingSats.personal.map(ws => (
                <div key={ws.id} className="flex items-center justify-between">
                  <p className="text-xs text-[#888]">{fmt(ws.date)}</p>
                  <button onClick={() => removeMyWS(ws.id)} className="text-[10px] text-[#bbb] hover:text-red-400 cursor-pointer">Remove</button>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </main>
  )
}
