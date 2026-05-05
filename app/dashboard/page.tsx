'use client'
import { useEffect, useState } from 'react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import Nav from '../components/Nav'

type Leave = {
  id: string
  type: string
  date_from: string
  date_to: string
  value: number
  reason: string
  status: string
}

type EditState = {
  type: string
  date_from: string
  date_to: string
  value: string
  reason: string
}

type UpcomingData = {
  nextReview: { date: string; type: string } | null
  holidays: { id: string; name: string; date: string }[]
  teamOnLeave: { name: string; type: string; date_from: string; date_to: string }[]
  workingSaturdays: { id: string; date: string }[]
  myWorkingSaturdays: { id: string; date: string }[]
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'text-amber-600 bg-amber-50',
  approved: 'text-emerald-600 bg-emerald-50',
  rejected: 'text-red-500 bg-red-50',
  cancelled: 'text-[#bbb] bg-[#f5f5f5]',
}

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0]
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState('')
  const [balance, setBalance] = useState({ sick_leaves: 12, earned_leaves: 15, wfh_days: 24 })
  const [leaves, setLeaves] = useState<Leave[]>([])
  const [upcoming, setUpcoming] = useState<UpcomingData>({
    nextReview: null,
    holidays: [],
    teamOnLeave: [],
    workingSaturdays: [],
    myWorkingSaturdays: [],
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>({ type: '', date_from: '', date_to: '', value: '1', reason: '' })
  const [saving, setSaving] = useState(false)
  const [wsDate, setWsDate] = useState('')
  const [wsAdding, setWsAdding] = useState(false)
  const router = useRouter()

  async function loadData(uid: string) {
    const today = new Date()
    const todayStr = toDateStr(today)
    const in30 = new Date(today)
    in30.setDate(today.getDate() + 30)
    const in30Str = toDateStr(in30)

    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - today.getDay())
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    const weekStartStr = toDateStr(weekStart)
    const weekEndStr = toDateStr(weekEnd)

    const [
      { data: bal },
      { data: allLeaves },
      { data: reviewRows },
      { data: holidayRows },
      { data: teamLeaveRows },
      { data: wsRows },
      { data: myWsRows },
    ] = await Promise.all([
      supabaseAdmin.from('leave_balance').select('*').eq('user_id', uid).single(),
      supabaseAdmin.from('leaves').select('*').eq('user_id', uid).in('status', ['approved', 'pending']).order('date_from', { ascending: true }),
      supabaseAdmin.from('reviews').select('date, type').eq('user_id', uid).gte('date', todayStr).order('date', { ascending: true }).limit(1),
      supabaseAdmin.from('holidays').select('id, name, date').gte('date', todayStr).lte('date', in30Str).order('date', { ascending: true }),
      supabaseAdmin.from('leaves').select('date_from, date_to, type, users(name)').neq('user_id', uid).eq('status', 'approved').lte('date_from', weekEndStr).gte('date_to', weekStartStr),
      supabaseAdmin.from('working_saturdays').select('id, date').is('user_id', null).gte('date', todayStr).order('date', { ascending: true }),
      supabaseAdmin.from('working_saturdays').select('id, date').eq('user_id', uid).order('date', { ascending: false }).limit(10),
    ])

    if (bal) setBalance(bal)
    // Show upcoming approved leaves (date_from >= today) and all pending leaves
    const lvs = (allLeaves ?? []).filter((l: any) =>
      l.status === 'pending' || (l.status === 'approved' && l.date_from >= todayStr)
    )
    setLeaves(lvs)

    const teamOnLeave = (teamLeaveRows ?? []).map((l: any) => ({
      name: l.users?.name || 'Team',
      type: l.type,
      date_from: l.date_from,
      date_to: l.date_to,
    }))

    setUpcoming({
      nextReview: reviewRows?.[0] ?? null,
      holidays: holidayRows ?? [],
      teamOnLeave,
      workingSaturdays: wsRows ?? [],
      myWorkingSaturdays: myWsRows ?? [],
    })
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/'); return }
      setUser(session.user)

      const { data: dbUser } = await supabaseAdmin
        .from('users')
        .select('id, is_admin')
        .eq('email', session.user.email)
        .single()

      if (!dbUser) { router.push('/'); return }

      setUserId(dbUser.id)
      setIsAdmin(dbUser.is_admin ?? false)
      await loadData(dbUser.id)
    })
  }, [])

  async function cancelLeave(id: string) {
    setSaving(true)
    const leave = leaves.find(l => l.id === id)
    await supabaseAdmin.from('leaves').update({ status: 'cancelled' }).eq('id', id).eq('user_id', userId)

    // Restore balance if was approved
    if (leave && leave.status === 'approved') {
      const field = leave.type === 'sick' ? 'sick_leaves' : leave.type === 'earned' ? 'earned_leaves' : 'wfh_days'
      const { data: bal } = await supabaseAdmin.from('leave_balance').select(field).eq('user_id', userId).single()
      if (bal) {
        const current = (bal as any)[field] as number
        await supabaseAdmin.from('leave_balance').update({ [field]: current + leave.value }).eq('user_id', userId)
      }
    }

    await loadData(userId)
    setSaving(false)
  }

  function startEdit(leave: Leave) {
    setEditingId(leave.id)
    setEditState({
      type: leave.type,
      date_from: leave.date_from,
      date_to: leave.date_to,
      value: String(leave.value),
      reason: leave.reason || '',
    })
  }

  async function saveEdit(id: string) {
    setSaving(true)
    await supabaseAdmin.from('leaves').update({
      type: editState.type,
      date_from: editState.date_from,
      date_to: editState.date_to,
      reason: editState.reason,
      value: parseFloat(editState.value),
    }).eq('id', id).eq('user_id', userId)
    setEditingId(null)
    await loadData(userId)
    setSaving(false)
  }

  async function logWorkingSaturday() {
    if (!wsDate || !userId) return
    const d = new Date(wsDate + 'T00:00:00')
    if (d.getDay() !== 6) return
    setWsAdding(true)
    await supabaseAdmin.from('working_saturdays').insert({ date: wsDate, user_id: userId })
    setWsDate('')
    await loadData(userId)
    setWsAdding(false)
  }

  async function removeMyWorkingSaturday(id: string) {
    await supabaseAdmin.from('working_saturdays').delete().eq('id', id).eq('user_id', userId)
    await loadData(userId)
  }

  if (!user) return null

  const hasUpcoming = upcoming.nextReview || upcoming.holidays.length > 0 || upcoming.teamOnLeave.length > 0

  return (
    <main className="min-h-screen bg-[#F5F2EE]">
      <Nav isAdmin={isAdmin} />

      <div className="px-12 py-12 max-w-5xl mx-auto">
        <h2 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-2">Welcome</h2>
        <p className="text-2xl font-light tracking-wide text-[#1a1a1a] mb-12">
          {user.user_metadata?.full_name || user.email}
        </p>

        {/* Balance Cards */}
        <div className="grid grid-cols-3 gap-6 mb-16">
          {[
            { label: 'Sick Leaves', value: balance.sick_leaves },
            { label: 'Earned Leaves', value: balance.earned_leaves },
            { label: 'WFH Days', value: balance.wfh_days },
          ].map(item => (
            <div key={item.label} className="border border-[#ddd] p-8 bg-white">
              <p className="text-xs tracking-[0.25em] uppercase text-[#888] mb-4">{item.label}</p>
              <p className="text-4xl font-light text-[#1a1a1a]">{item.value}</p>
              <p className="text-xs text-[#bbb] mt-1 tracking-wider">remaining</p>
            </div>
          ))}
        </div>

        {/* Upcoming Section */}
        {hasUpcoming && (
          <div className="mb-16">
            <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-6">Upcoming</h3>
            <div className="grid grid-cols-3 gap-6">

              {upcoming.nextReview && (
                <div className="border border-[#ddd] bg-white p-6">
                  <p className="text-[9px] tracking-[0.25em] uppercase text-[#aaa] mb-3">Your Next Review</p>
                  <p className="text-sm font-light text-[#1a1a1a]">{formatDate(upcoming.nextReview.date)}</p>
                  <p className="text-[10px] tracking-wider uppercase text-[#888] mt-1">{upcoming.nextReview.type}</p>
                </div>
              )}

              {upcoming.holidays.length > 0 && (
                <div className="border border-[#ddd] bg-white p-6">
                  <p className="text-[9px] tracking-[0.25em] uppercase text-[#aaa] mb-3">Upcoming Holidays</p>
                  <div className="space-y-2">
                    {upcoming.holidays.slice(0, 3).map(h => (
                      <div key={h.id} className="flex items-center justify-between">
                        <p className="text-xs text-[#1a1a1a] truncate pr-2">{h.name}</p>
                        <p className="text-[10px] text-[#aaa] shrink-0">{formatDate(h.date)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {upcoming.teamOnLeave.length > 0 && (
                <div className="border border-[#ddd] bg-white p-6">
                  <p className="text-[9px] tracking-[0.25em] uppercase text-[#aaa] mb-3">Team on Leave This Week</p>
                  <div className="space-y-2">
                    {upcoming.teamOnLeave.slice(0, 4).map((t, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <p className="text-xs text-[#1a1a1a] truncate pr-2">{t.name}</p>
                        <p className="text-[10px] text-[#aaa] shrink-0 uppercase tracking-wider">{t.type}</p>
                      </div>
                    ))}
                    {upcoming.teamOnLeave.length > 4 && (
                      <p className="text-[10px] text-[#bbb]">+{upcoming.teamOnLeave.length - 4} more</p>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* Working Saturdays */}
        {(upcoming.workingSaturdays.length > 0 || true) && (
          <div className="mb-16">
            <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-6">Working Saturdays</h3>
            <div className="grid grid-cols-2 gap-8">

              <div className="border border-[#ddd] bg-white p-6 space-y-4">
                <p className="text-[9px] tracking-[0.25em] uppercase text-[#aaa] mb-1">Company-Wide</p>
                {upcoming.workingSaturdays.length === 0 ? (
                  <p className="text-xs text-[#bbb] tracking-wider">No upcoming working Saturdays.</p>
                ) : (
                  <div className="space-y-2">
                    {upcoming.workingSaturdays.map(ws => (
                      <p key={ws.id} className="text-xs text-[#1a1a1a]">{formatDate(ws.date)}</p>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-[#ddd] bg-white p-6 space-y-4">
                <p className="text-[9px] tracking-[0.25em] uppercase text-[#aaa] mb-1">Log Personal Working Saturday</p>
                <div className="flex gap-3">
                  <input
                    type="date"
                    value={wsDate}
                    onChange={e => setWsDate(e.target.value)}
                    className="flex-1 border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none"
                  />
                  <button
                    onClick={logWorkingSaturday}
                    disabled={wsAdding || !wsDate}
                    className="px-4 py-2 border border-[#1a1a1a] text-xs tracking-wider uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40 shrink-0"
                  >
                    {wsAdding ? '…' : 'Log'}
                  </button>
                </div>
                {upcoming.myWorkingSaturdays.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {upcoming.myWorkingSaturdays.map(ws => (
                      <div key={ws.id} className="flex items-center justify-between">
                        <p className="text-xs text-[#888]">{formatDate(ws.date)}</p>
                        <button
                          onClick={() => removeMyWorkingSaturday(ws.id)}
                          className="text-[10px] text-[#bbb] hover:text-red-400 transition-colors cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* My Leaves */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xs tracking-[0.3em] uppercase text-[#888]">My Leaves</h3>
          <button
            onClick={() => router.push('/apply')}
            className="px-8 py-2.5 border border-[#1a1a1a] text-xs tracking-[0.25em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#F5F2EE] transition-all duration-300 cursor-pointer"
          >
            Apply for Leave
          </button>
        </div>

        {leaves.length === 0 ? (
          <p className="text-sm text-[#bbb] tracking-wider">No upcoming or pending leaves.</p>
        ) : (
          <div className="border border-[#ddd] bg-white divide-y divide-[#eee]">
            {leaves.map(leave => (
              <div key={leave.id}>
                {editingId === leave.id ? (
                  <div className="px-8 py-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs tracking-[0.2em] uppercase text-[#888] block mb-1">Type</label>
                        <select
                          value={editState.type}
                          onChange={e => setEditState({ ...editState, type: e.target.value })}
                          className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs uppercase text-[#1a1a1a] focus:outline-none"
                        >
                          <option value="sick">Sick Leave</option>
                          <option value="earned">Earned Leave</option>
                          <option value="wfh">WFH</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs tracking-[0.2em] uppercase text-[#888] block mb-1">Duration</label>
                        <select
                          value={editState.value}
                          onChange={e => setEditState({ ...editState, value: e.target.value })}
                          className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs uppercase text-[#1a1a1a] focus:outline-none"
                        >
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
                        className="px-6 py-2 border border-[#1a1a1a] text-xs tracking-wider uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40">
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)}
                        className="px-6 py-2 border border-[#ddd] text-xs tracking-wider uppercase text-[#888] hover:text-[#1a1a1a] transition-colors cursor-pointer">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="px-8 py-5 flex items-center justify-between">
                    <div>
                      <p className="text-xs tracking-[0.2em] uppercase text-[#1a1a1a]">{leave.type} leave</p>
                      <p className="text-xs text-[#888] mt-1">
                        {leave.date_from}{leave.date_to && leave.date_to !== leave.date_from ? ` → ${leave.date_to}` : ''}
                        {' · '}{leave.value === 0.5 ? 'Half day' : `${leave.value} day${leave.value !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      {leave.status === 'pending' && (
                        <button onClick={() => startEdit(leave)}
                          className="text-xs tracking-wider uppercase text-[#888] hover:text-[#1a1a1a] transition-colors cursor-pointer">
                          Modify
                        </button>
                      )}
                      <button onClick={() => cancelLeave(leave.id)} disabled={saving}
                        className="text-xs tracking-wider uppercase text-[#888] hover:text-red-500 transition-colors cursor-pointer disabled:opacity-40">
                        Cancel
                      </button>
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
    </main>
  )
}
