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

const LEAVE_LABEL_FALLBACKS: Record<string, string> = {
  earned: 'Earned Leave',
  casual: 'Earned Leave',
  wfh: 'WFH',
  sick: 'Sick Leave',
  maternity: 'Maternity Leave',
  miscarriage: 'Miscarriage Leave',
  sabbatical: 'Sabbatical',
}
function labelForType(key: string): string {
  return LEAVE_LABEL_FALLBACKS[key] ?? key
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
  const [reviews2026, setReviews2026] = useState<{ date: string; type: string; notes?: string | null }[]>([])
  const router = useRouter()

  async function loadClockData(uid: string, adminFlag: boolean) {
    const { date: today } = getISTNow()
    const { data: myLogArr } = await supabaseAdmin
      .from('clock_logs').select('*').eq('user_id', uid).eq('date', today).limit(1)
    setTodayClock(myLogArr?.[0] ?? null)
    const { data: allLogs } = await supabaseAdmin
      .from('clock_logs').select('*, users(name)').eq('date', today).order('clock_in_time', { ascending: true })
    setAllClockLogs(allLogs ?? [])
  }

  async function deleteClockIn(uid: string, adminFlag: boolean) {
    if (!todayClock) return
    setClockAction(true); setClockError('')
    const { error } = await supabaseAdmin.from('clock_logs').delete().eq('id', todayClock.id)
    if (error) { setClockError(`Delete failed: ${error.message}`); setClockAction(false); return }
    await loadClockData(uid, adminFlag)
    setClockAction(false)
  }

  async function deleteAnyClockIn(id: string) {
    setClockAction(true)
    await supabaseAdmin.from('clock_logs').delete().eq('id', id)
    await loadClockData(userId, isAdmin)
    setClockAction(false)
  }

  async function clockIn(uid: string, adminFlag: boolean) {
    setClockAction(true); setClockError('')
    const { date: today, time: t } = getISTNow()
    const { data, error } = await supabaseAdmin.from('clock_logs')
      .insert({ user_id: uid, date: today, clock_in_time: t }).select().limit(1)
    if (error) { setClockError(`Clock-in failed: ${error.message}`); setClockAction(false); return }
    if (t > '10:15') {
      const dayOfWeek = new Date(today + 'T00:00:00').getDay() // 0=Sun
      const isWorkingDay = dayOfWeek >= 1 && dayOfWeek <= 6 // Mon–Sat
      if (isWorkingDay) {
        const { data: todayHoliday } = await supabaseAdmin
          .from('holidays').select('id').eq('date', today).maybeSingle()
        if (!todayHoliday) {
          const minLate = minutesDiff('10:00', t)
          const { data: existing } = await supabaseAdmin
            .from('late_arrivals').select('id').eq('user_id', uid).eq('date', today).maybeSingle()
          if (!existing) {
            await supabaseAdmin.from('late_arrivals').insert({
              user_id: uid, date: today, arrival_time: t,
              minutes_late: minLate,
              reason: 'Auto-logged from clock-in',
              pto_deduction_status: 'Pending', approved: false,
            })
          }
        }
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
      supabaseAdmin.from('reviews').select('date, type, notes').eq('user_id', uid).gte('date', '2026-01-01').lte('date', '2026-12-31').order('date', { ascending: true }),
    ])

    const typeLabelMap: Record<string, { label: string; sort: number }> = {}
    for (const lt of ltDefs ?? []) typeLabelMap[lt.key] = { label: lt.label, sort: lt.sort_order }

    const leaves = allMyLeaves ?? []
    const pastApproved = leaves.filter((l: any) => l.status === 'approved' && l.date_to < todayStr)
    const futureApproved = leaves.filter((l: any) => l.status === 'approved' && l.date_from >= todayStr)
    const sumByType = (arr: any[], ...types: string[]) => arr.filter(l => types.includes(l.type)).reduce((s: number, l: any) => s + l.value, 0)

    // Track which mat/mis types have an approved record
    const approvedMatOrMis = new Set(
      leaves.filter((l: any) => l.status === 'approved' && (l.type === 'maternity' || l.type === 'miscarriage'))
        .map((l: any) => l.type as string)
    )

    // Normalize casual→earned and deduplicate rows (keep highest allocated)
    const normalized: Record<string, { leave_type: string; allocated: number; balance: number }> = {}
    for (const r of balRows ?? []) {
      const key = r.leave_type === 'casual' ? 'earned' : r.leave_type
      if (!normalized[key] || r.allocated > normalized[key].allocated) {
        normalized[key] = { leave_type: key, allocated: r.allocated, balance: r.balance }
      }
    }

    const balanceItems: BalanceItem[] = Object.values(normalized)
      .filter((r) => {
        if (r.allocated <= 0 && Math.abs(r.balance) <= 0) return false
        if (r.leave_type === 'maternity' || r.leave_type === 'miscarriage') {
          return approvedMatOrMis.has(r.leave_type)
        }
        return true
      })
      .sort((a, b) => (typeLabelMap[a.leave_type]?.sort ?? 99) - (typeLabelMap[b.leave_type]?.sort ?? 99))
      .map((r) => ({
        key: r.leave_type,
        label: typeLabelMap[r.leave_type]?.label ?? LEAVE_LABEL_FALLBACKS[r.leave_type] ?? r.leave_type,
        allocated: r.allocated,
        balance: r.balance,
        taken: r.leave_type === 'earned' ? sumByType(pastApproved, 'earned', 'casual') : sumByType(pastApproved, r.leave_type),
        scheduled: r.leave_type === 'earned' ? sumByType(futureApproved, 'earned', 'casual') : sumByType(futureApproved, r.leave_type),
      }))

    setBalances(balanceItems)
    setMyLeaves(leaves.filter((l: any) => {
      const isMatOrMis = l.type === 'maternity' || l.type === 'miscarriage'
      if (isMatOrMis) return l.status === 'approved' && l.date_from >= todayStr
      return l.status === 'pending' || (l.status === 'approved' && l.date_from >= todayStr)
    }))

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
    setReviews2026(reviewRows ?? [])
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
      resyncUserBalance(resolvedUser.id).then(() => loadData(resolvedUser.id)).catch(() => {})
    })
  }, [])

  async function resyncUserBalance(uid: string) {
    const today = new Date().toISOString().split('T')[0]
    const [{ data: balRows }, { data: approvedLeaves }] = await Promise.all([
      supabaseAdmin.from('leave_balances').select('leave_type, allocated, year').eq('user_id', uid),
      supabaseAdmin.from('leaves').select('type, value').eq('user_id', uid).eq('status', 'approved').lte('date_to', today),
    ])
    if (!balRows || balRows.length === 0) return
    const sumMap: Record<string, number> = {}
    for (const l of approvedLeaves ?? []) {
      const key = l.type === 'casual' ? 'earned' : l.type
      sumMap[key] = (sumMap[key] ?? 0) + ((l as any).value ?? 0)
    }
    for (const b of balRows as any[]) {
      const newBal = b.allocated - (sumMap[b.leave_type] ?? 0)
      await supabaseAdmin.from('leave_balances').delete().eq('user_id', uid).eq('leave_type', b.leave_type)
      await supabaseAdmin.from('leave_balances').insert({
        user_id: uid, leave_type: b.leave_type,
        allocated: b.allocated, balance: newBal,
        year: b.year ?? new Date().getFullYear(),
      })
    }
  }

  async function cancelLeave(id: string) {
    setSaving(true)
    await supabaseAdmin.from('leaves').update({ status: 'cancelled' }).eq('id', id).eq('user_id', userId)
    await resyncUserBalance(userId)
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

  const nextReview = reviews2026.find(r => r.date >= getISTNow().date)
  const reviewDaysAway = nextReview
    ? Math.ceil((new Date(nextReview.date + 'T00:00:00').getTime() - new Date().getTime()) / 86400000)
    : null
  const showReviewStrip = reviewDaysAway !== null && reviewDaysAway >= 0 && reviewDaysAway <= 30

  return (
    <main className="min-h-screen bg-[#F5F2EE]">
      <Nav isAdmin={isAdmin} />

      <div className="px-12 py-12 max-w-5xl mx-auto">

        {/* Review strip — only within 30 days */}
        {showReviewStrip && nextReview && (
          <div className="mb-6 px-5 py-3 border border-[#e8e4de] bg-[#fafaf8] flex items-center justify-between">
            <p className="text-[9px] tracking-[0.3em] uppercase text-[#aaa]">
              {nextReview.notes || (nextReview.type === 'bi-annual' ? 'Bi-Annual Review' : 'Annual Review')}
              {' — '}
              {new Date(nextReview.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}
            </p>
            <span className="text-[9px] tracking-[0.2em] uppercase text-[#bbb]">{daysUntil(nextReview.date)}</span>
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <p className="text-[9px] tracking-[0.3em] uppercase text-[#aaa] mb-2">Welcome Back</p>
          <p className="text-[#1a1a1a] leading-tight" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '28px', fontWeight: 300 }}>
            {user.user_metadata?.full_name || user.email}
          </p>
        </div>

        {/* Quick Actions strip */}
        <div className="flex gap-3 mb-8">
          <button onClick={() => router.push('/apply')}
            className="flex-1 py-3 border border-[#1a1a1a] text-[11px] tracking-[0.25em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#F5F2EE] transition-all duration-300 cursor-pointer">
            Apply for Leave
          </button>
          <button onClick={() => router.push('/attendance?tab=overtime')}
            className="flex-1 py-3 border border-[#ddd] text-[11px] tracking-[0.25em] uppercase text-[#888] hover:border-[#1a1a1a] hover:text-[#1a1a1a] transition-all duration-300 cursor-pointer">
            Log Overtime
          </button>
          <button onClick={() => router.push('/apply?type=wfh')}
            className="flex-1 py-3 border border-[#ddd] text-[11px] tracking-[0.25em] uppercase text-[#888] hover:border-[#1a1a1a] hover:text-[#1a1a1a] transition-all duration-300 cursor-pointer">
            Apply for WFH
          </button>
        </div>

        {/* Leave Balance table */}
        <div className="border border-[#ddd] bg-white p-6 mb-6">
          <p className="text-[9px] tracking-[0.3em] uppercase text-[#aaa] mb-4">Leave Balance</p>
          {balances.length === 0 ? (
            <p className="text-xs text-[#bbb] tracking-wider">No balance data.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#eee]">
                  {['Leave Type', 'Allocated', 'Taken', 'Remaining'].map(h => (
                    <th key={h} className="pb-2 text-left text-[9px] tracking-[0.3em] uppercase text-[#888] font-normal pr-6">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f5f5f5]">
                {balances.map(b => (
                  <tr key={b.key}>
                    <td className="py-3 pr-6 text-[11px] text-[#1a1a1a]">{b.label}</td>
                    <td className="py-3 pr-6 text-[#888]" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '18px', fontWeight: 300 }}>{b.allocated}</td>
                    <td className="py-3 pr-6 text-[#888]" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '18px', fontWeight: 300 }}>{b.taken}</td>
                    <td className={`py-3 ${b.balance < 0 ? 'text-red-500' : 'text-[#1a1a1a]'}`}
                      style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '24px', fontWeight: (b.balance < 5 && b.balance >= 0) ? 500 : 300 }}>
                      {b.balance}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Today's Attendance — full width */}
        <div className="mb-6">
          <div className="border border-[#ddd] bg-white px-8 py-6 flex items-center justify-between">
            <div>
              <p className="text-[9px] tracking-[0.3em] uppercase text-[#aaa] mb-3">Today's Attendance</p>
              {todayClock?.clock_in_time ? (
                <div className="flex items-center gap-5">
                  <span className="text-[#1a1a1a]" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '20px', fontWeight: 300 }}>
                    {fmtTime(todayClock.clock_in_time)}
                  </span>
                  {todayClock.clock_in_time > '10:15' ? (
                    <span className="text-[9px] uppercase tracking-[0.25em] px-3 py-1 bg-amber-50 text-amber-600 border border-amber-200">
                      Late · +{minutesDiff('10:00', todayClock.clock_in_time)}m
                    </span>
                  ) : (
                    <span className="text-[9px] uppercase tracking-[0.25em] px-3 py-1 bg-emerald-50 text-emerald-600 border border-emerald-200">
                      On Time
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-sm font-light text-[#bbb]">Not clocked in yet</p>
              )}
              {clockError && <p className="text-xs text-red-400 mt-2">{clockError}</p>}
            </div>
            {todayClock?.clock_in_time ? (
              <button onClick={() => deleteClockIn(userId, isAdmin)} disabled={clockAction}
                className="px-6 py-2.5 border border-red-400 text-[11px] tracking-[0.2em] uppercase text-red-400 hover:bg-red-400 hover:text-white transition-all cursor-pointer disabled:opacity-30">
                {clockAction ? '…' : 'Delete'}
              </button>
            ) : (
              <button onClick={() => clockIn(userId, isAdmin)} disabled={clockAction}
                className="px-6 py-2.5 border border-emerald-600 text-[11px] tracking-[0.2em] uppercase text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all cursor-pointer disabled:opacity-30">
                {clockAction ? '…' : 'Clock In'}
              </button>
            )}
          </div>

          {allClockLogs.length > 0 && (
            <div className="border border-[#ddd] border-t-0 bg-white overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#eee]">
                    {['Employee', 'Clock In', 'Status', ...(isAdmin ? [''] : [])].map(h => (
                      <th key={h} className="px-6 py-2 text-left text-[9px] tracking-[0.3em] uppercase text-[#888] font-normal">{h}</th>
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
                        {isAdmin && (
                          <td className="px-6 py-3">
                            <button onClick={() => deleteAnyClockIn(log.id)} disabled={clockAction}
                              className="text-xs text-[#aaa] hover:text-red-500 transition-colors cursor-pointer disabled:opacity-30">
                              Delete
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Two columns: Upcoming Leaves | Team Availability */}
        <div className="grid grid-cols-2 gap-6 mb-14">

          {/* Upcoming Leaves */}
          <div className="border border-[#ddd] bg-white p-6">
            <p className="text-[9px] tracking-[0.3em] uppercase text-[#aaa] mb-4">Upcoming Leaves</p>
            {myLeaves.length === 0 ? (
              <p className="text-xs text-[#bbb] tracking-wider">No upcoming leaves.</p>
            ) : (
              <div className="space-y-0 divide-y divide-[#f5f5f5]">
                {myLeaves.slice(0, 3).map(leave => (
                  <div key={leave.id} className="py-3 first:pt-0">
                    {editingId === leave.id ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[9px] uppercase tracking-wider text-[#aaa] block mb-1">From</label>
                            <input type="date" value={editState.date_from}
                              onChange={e => setEditState({ ...editState, date_from: e.target.value })}
                              className="w-full border border-[#ddd] bg-[#F5F2EE] px-2 py-1.5 text-xs text-[#1a1a1a] focus:outline-none" />
                          </div>
                          <div>
                            <label className="text-[9px] uppercase tracking-wider text-[#aaa] block mb-1">To</label>
                            <input type="date" value={editState.date_to}
                              onChange={e => setEditState({ ...editState, date_to: e.target.value })}
                              className="w-full border border-[#ddd] bg-[#F5F2EE] px-2 py-1.5 text-xs text-[#1a1a1a] focus:outline-none" />
                          </div>
                        </div>
                        <input type="text" value={editState.reason}
                          onChange={e => setEditState({ ...editState, reason: e.target.value })}
                          placeholder="Reason"
                          className="w-full border border-[#ddd] bg-[#F5F2EE] px-2 py-1.5 text-xs text-[#1a1a1a] focus:outline-none" />
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(leave.id)} disabled={saving}
                            className="px-3 py-1.5 border border-[#1a1a1a] text-[9px] uppercase tracking-wider text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40">Save</button>
                          <button onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 border border-[#ddd] text-[9px] uppercase text-[#888] cursor-pointer">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs text-[#1a1a1a]">{labelForType(leave.type)}</p>
                          <p className="text-[10px] text-[#aaa] mt-0.5">
                            {fmt(leave.date_from)}{leave.date_to !== leave.date_from ? ` → ${fmt(leave.date_to)}` : ''}
                            {' · '}{leave.value === 0.5 ? 'Half day' : `${leave.value}d`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {leave.status === 'pending' && (
                            <button onClick={() => startEdit(leave)}
                              className="text-[10px] text-[#aaa] hover:text-[#1a1a1a] transition-colors cursor-pointer">Edit</button>
                          )}
                          <button onClick={() => cancelLeave(leave.id)} disabled={saving}
                            className="text-[10px] text-[#aaa] hover:text-red-500 transition-colors cursor-pointer disabled:opacity-40">Cancel</button>
                          <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 ${STATUS_STYLES[leave.status] ?? 'text-[#888] bg-[#f5f5f5]'}`}>
                            {leave.status}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {myLeaves.length > 3 && (
                  <p className="text-[10px] text-[#aaa] tracking-wider pt-3">+{myLeaves.length - 3} more</p>
                )}
              </div>
            )}
          </div>

          {/* Team Availability */}
          <div className="border border-[#ddd] bg-white p-6">
            <p className="text-[9px] tracking-[0.3em] uppercase text-[#aaa] mb-4">Team Availability</p>
            {([
              { label: 'Today',     people: teamAvail.today },
              { label: 'Tomorrow',  people: teamAvail.tomorrow },
              { label: 'Next Week', people: teamAvail.nextWeek },
            ] as const).map(({ label, people }) => (
              <div key={label} className="mb-4 last:mb-0">
                <p className="text-[9px] tracking-[0.2em] uppercase text-[#ccc] mb-2">{label}</p>
                {people.length === 0 ? (
                  <p className="text-xs text-emerald-600">Everyone in</p>
                ) : (
                  <div className="space-y-1.5">
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
          <div className="mb-8">
            <p className="text-[9px] tracking-[0.3em] uppercase text-[#aaa] mb-3">Upcoming Holidays</p>
            <div className="border border-[#ddd] bg-white divide-y divide-[#f5f5f5]">
              {holidays.map(h => (
                <div key={h.id} className="px-5 py-3 flex items-center justify-between">
                  <p className="text-xs text-[#1a1a1a]">{h.name}</p>
                  <div className="flex items-center gap-4">
                    <p className="text-[10px] text-[#aaa]">
                      {new Date(h.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </p>
                    <span className="text-[9px] text-amber-600 tracking-[0.2em] uppercase">{daysUntil(h.date)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Working Saturdays */}
        <div className="mb-6">
          <p className="text-[9px] tracking-[0.3em] uppercase text-[#aaa] mb-3">Working Saturdays</p>
          <div className="grid grid-cols-2 gap-6">
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
