'use client'
import { useEffect, useState } from 'react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import Nav from '../components/Nav'

type LateArrival = {
  id: string
  user_id: string
  date: string
  arrival_time: string | null
  minutes_late: number | null
  reason: string | null
  pto_deduction_status: string
  approved: boolean
  approved_by: string | null
  users?: { name: string; email: string } | null
}

type OvertimeEntry = {
  id: string
  user_id: string
  date: string
  login_time: string | null
  logout_time: string | null
  overtime_minutes: number | null
  extra_hours_start: string | null
  extra_hours_end: string | null
  reason: string | null
  compensated_by: string | null
  approved: boolean
  approved_by: string | null
  rejection_reason: string | null
  created_at: string
}

type TeamMember = { id: string; name: string; email: string }

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtTime(t: string | null) {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}
function dayAbbr(d: string) { return d ? DAY_ABBR[new Date(d + 'T00:00:00').getDay()] : '' }
function dayFull(d: string) { return d ? DAY_FULL[new Date(d + 'T00:00:00').getDay()] : '' }

function calcOvertimeMins(logout: string): number {
  const [h, m] = logout.split(':').map(Number)
  return Math.max(0, h * 60 + m - 18 * 60)
}

function minsToLabel(mins: number | null): string {
  if (!mins || mins <= 0) return '—'
  const h = Math.floor(mins / 60), m = mins % 60
  if (h === 0) return `${m} min${m !== 1 ? 's' : ''}`
  if (m === 0) return `${h} hr${h !== 1 ? 's' : ''}`
  return `${h} hr ${m} min${m !== 1 ? 's' : ''}`
}

function minsLateFrom10(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return Math.max(0, h * 60 + m - 10 * 60)
}

const PTO_OPTIONS = ['Pending', 'Made Up Time', 'PTO Deducted'] as const

function ptoBadgeCls(v: string) {
  if (v === 'Pending') return 'text-red-600 bg-red-50 border-red-200'
  if (v === 'Made Up Time') return 'text-emerald-600 bg-emerald-50 border-emerald-200'
  if (v === 'PTO Deducted') return 'text-amber-600 bg-amber-50 border-amber-200'
  return 'text-[#888] bg-[#f5f5f5] border-[#ddd]'
}

export default function AttendancePage() {
  const [tab, setTab] = useState<'late' | 'overtime'>('late')
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState('')
  const [adminName, setAdminName] = useState('')
  const [team, setTeam] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)

  const [lateArrivals, setLateArrivals] = useState<LateArrival[]>([])
  const [addLate, setAddLate] = useState({ user_id: '', date: '', arrival_time: '', reason: '' })
  const [addLateSaving, setAddLateSaving] = useState(false)
  const [addLateErr, setAddLateErr] = useState('')

  const [overtimeEntries, setOvertimeEntries] = useState<OvertimeEntry[]>([])
  const [otForm, setOtForm] = useState({
    date: '', login_time: '', logout_time: '',
    extra_hours_start: '', extra_hours_end: '', reason: '', compensated_by: ''
  })
  const [otSaving, setOtSaving] = useState(false)
  const [otErr, setOtErr] = useState('')

  const router = useRouter()

  async function loadLate() {
    const { data, error } = await supabaseAdmin
      .from('late_arrivals')
      .select('*, users(name, email)')
      .order('date', { ascending: true })
    if (error) console.error('[Attendance] loadLate error:', error)
    setLateArrivals(data ?? [])
  }

  async function loadOvertime(uid: string) {
    const { data, error } = await supabaseAdmin
      .from('overtime_entries')
      .select('*')
      .eq('user_id', uid)
      .order('date', { ascending: false })
    if (error) console.error('[Attendance] loadOvertime error:', error)
    setOvertimeEntries(data ?? [])
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/'); return }
      const { data: dbUser } = await supabaseAdmin
        .from('users').select('id, name, email, is_admin').eq('email', session.user.email).single()
      if (!dbUser) { setLoading(false); return }
      const adminFlag = dbUser.is_admin === true
      setIsAdmin(adminFlag)
      setUserId(dbUser.id)
      setAdminName(dbUser.name || dbUser.email)
      if (adminFlag) {
        const { data: usersData } = await supabaseAdmin.from('users').select('id, name, email').order('name')
        setTeam(usersData ?? [])
      }
      await Promise.all([loadLate(), loadOvertime(dbUser.id)])
      setLoading(false)
    })
  }, [])

  async function addLateRow() {
    if (!addLate.user_id || !addLate.date || !addLate.arrival_time) {
      setAddLateErr('Employee, date, and arrival time are required.')
      return
    }
    setAddLateErr('')
    setAddLateSaving(true)
    const minLate = minsLateFrom10(addLate.arrival_time)
    const { error } = await supabaseAdmin.from('late_arrivals').upsert(
      {
        user_id: addLate.user_id,
        date: addLate.date,
        arrival_time: addLate.arrival_time,
        minutes_late: minLate,
        reason: addLate.reason || null,
        pto_deduction_status: 'Pending',
        approved: false,
      },
      { onConflict: 'user_id,date' }
    )
    if (error) { setAddLateErr(error.message); setAddLateSaving(false); return }
    setAddLate({ user_id: '', date: '', arrival_time: '', reason: '' })
    await loadLate()
    setAddLateSaving(false)
  }

  async function updatePTO(id: string, val: string) {
    await supabaseAdmin.from('late_arrivals').update({ pto_deduction_status: val }).eq('id', id)
    await loadLate()
  }

  async function toggleLateApproved(row: LateArrival) {
    const newVal = !row.approved
    await supabaseAdmin.from('late_arrivals').update({
      approved: newVal,
      approved_by: newVal ? adminName : null,
    }).eq('id', row.id)
    await loadLate()
  }

  async function submitOvertime() {
    if (!otForm.date || !otForm.login_time || !otForm.logout_time) {
      setOtErr('Date, login time, and logout time are required.')
      return
    }
    setOtErr('')
    setOtSaving(true)
    const overtime_minutes = calcOvertimeMins(otForm.logout_time)
    const { error } = await supabaseAdmin.from('overtime_entries').insert({
      user_id: userId,
      date: otForm.date,
      login_time: otForm.login_time,
      logout_time: otForm.logout_time,
      overtime_minutes,
      extra_hours_start: otForm.extra_hours_start || null,
      extra_hours_end: otForm.extra_hours_end || null,
      reason: otForm.reason || null,
      compensated_by: otForm.compensated_by || null,
      approved: false,
    })
    if (error) { setOtErr(error.message); setOtSaving(false); return }
    setOtForm({ date: '', login_time: '', logout_time: '', extra_hours_start: '', extra_hours_end: '', reason: '', compensated_by: '' })
    await loadOvertime(userId)
    setOtSaving(false)
  }

  function groupByMonth(entries: OvertimeEntry[]) {
    const groups: Record<string, OvertimeEntry[]> = {}
    for (const e of entries) {
      const key = e.date.slice(0, 7)
      if (!groups[key]) groups[key] = []
      groups[key].push(e)
    }
    return groups
  }

  const previewOT = otForm.logout_time ? calcOvertimeMins(otForm.logout_time) : null

  if (loading) return null

  const Th = ({ label }: { label: string }) => (
    <th className="px-4 py-3 text-left text-[9px] tracking-[0.2em] uppercase text-[#aaa] font-normal whitespace-nowrap">
      {label}
    </th>
  )

  return (
    <main className="min-h-screen bg-[#F5F2EE]">
      <Nav isAdmin={isAdmin} />

      <div className="px-12 py-12 max-w-7xl mx-auto">
        <h2 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-2">Attendance</h2>
        <p className="text-2xl font-light tracking-wide text-[#1a1a1a] mb-8">Attendance Records</p>

        {/* Tabs */}
        <div className="flex border-b border-[#ddd] mb-10">
          {([['late', 'Late Arrivals'], ['overtime', 'Overtime']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-6 py-2.5 text-xs tracking-[0.2em] uppercase transition-colors cursor-pointer border-b-2 -mb-px ${
                tab === key ? 'border-[#1a1a1a] text-[#1a1a1a]' : 'border-transparent text-[#aaa] hover:text-[#1a1a1a]'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* ══ LATE ARRIVALS ══ */}
        {tab === 'late' && (
          <>
            {isAdmin && (
              <div className="border border-[#ddd] bg-white p-6 mb-6">
                <p className="text-xs tracking-[0.2em] uppercase text-[#888] mb-4">Add Late Arrival</p>
                <div className="flex gap-3 flex-wrap items-end">
                  <div className="min-w-[150px]">
                    <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Employee</label>
                    <select value={addLate.user_id}
                      onChange={e => setAddLate({ ...addLate, user_id: e.target.value })}
                      className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs focus:outline-none">
                      <option value="">Select…</option>
                      {team.map(m => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Date</label>
                    <input type="date" value={addLate.date}
                      onChange={e => setAddLate({ ...addLate, date: e.target.value })}
                      className="border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">
                      Arrival Time
                      {addLate.arrival_time && (
                        <span className="ml-2 text-amber-600 normal-case tracking-normal">
                          ({minsLateFrom10(addLate.arrival_time)} mins late)
                        </span>
                      )}
                    </label>
                    <input type="time" value={addLate.arrival_time}
                      onChange={e => setAddLate({ ...addLate, arrival_time: e.target.value })}
                      className="border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs focus:outline-none" />
                  </div>
                  <div className="min-w-[120px] flex-1">
                    <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Reason</label>
                    <input type="text" value={addLate.reason}
                      onChange={e => setAddLate({ ...addLate, reason: e.target.value })}
                      placeholder="Optional"
                      className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs focus:outline-none" />
                  </div>
                  <button onClick={addLateRow} disabled={addLateSaving}
                    className="px-5 py-2 border border-[#1a1a1a] text-xs tracking-[0.2em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40 shrink-0">
                    {addLateSaving ? 'Adding…' : 'Add'}
                  </button>
                </div>
                {addLateErr && <p className="text-xs text-red-400 mt-3">{addLateErr}</p>}
              </div>
            )}

            {lateArrivals.length === 0 ? (
              <p className="text-sm text-[#bbb] tracking-wider">No late arrivals recorded.</p>
            ) : (
              <div className="border border-[#ddd] bg-white overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#eee]">
                      <Th label="Date" />
                      <Th label="Day" />
                      <Th label="Name" />
                      <Th label="Arrival Time" />
                      <Th label="Minutes Late" />
                      <Th label="Reason" />
                      <Th label="PTO Deduction Status" />
                      <Th label="Approved" />
                      <Th label="Approved By" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f5f5f5]">
                    {lateArrivals.map(row => (
                      <tr key={row.id} className={`hover:bg-[#fafafa] ${row.approved ? 'bg-emerald-50/20' : ''}`}>
                        <td className="px-4 py-3 text-xs text-[#888] whitespace-nowrap">{fmtDate(row.date)}</td>
                        <td className="px-4 py-3 text-xs text-[#888]">{dayAbbr(row.date)}</td>
                        <td className="px-4 py-3 text-xs text-[#1a1a1a] font-medium">
                          {(row.users as any)?.name || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-amber-600 font-medium whitespace-nowrap">
                          {fmtTime(row.arrival_time)}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#888]">{row.minutes_late ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-[#888]">{row.reason || '—'}</td>
                        <td className="px-4 py-3">
                          {isAdmin ? (
                            <select
                              value={row.pto_deduction_status}
                              onChange={e => updatePTO(row.id, e.target.value)}
                              className={`text-[9px] uppercase tracking-wider px-2 py-1 border focus:outline-none cursor-pointer ${ptoBadgeCls(row.pto_deduction_status)}`}>
                              {PTO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 border ${ptoBadgeCls(row.pto_deduction_status)}`}>
                              {row.pto_deduction_status || 'Pending'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isAdmin ? (
                            <input type="checkbox" checked={!!row.approved}
                              onChange={() => toggleLateApproved(row)}
                              className="w-4 h-4 accent-emerald-600 cursor-pointer" />
                          ) : (
                            <div className={`w-4 h-4 border flex items-center justify-center ${row.approved ? 'bg-emerald-500 border-emerald-500' : 'border-[#ddd]'}`}>
                              {row.approved && <span className="text-white text-[8px] leading-none">✓</span>}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#888] whitespace-nowrap">{row.approved_by || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ══ OVERTIME ══ */}
        {tab === 'overtime' && (
          <>
            {/* Submit form — all users */}
            <div className="border border-[#ddd] bg-white p-6 mb-8">
              <p className="text-xs tracking-[0.2em] uppercase text-[#888] mb-5">Log Overtime</p>

              {/* Row 1: Date + Day */}
              <div className="grid grid-cols-6 gap-4 mb-4">
                <div className="col-span-2">
                  <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Date</label>
                  <input type="date" value={otForm.date}
                    onChange={e => setOtForm({ ...otForm, date: e.target.value })}
                    className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Day</label>
                  <div className="border border-[#eee] bg-[#f8f6f3] px-3 py-2 text-xs text-[#888] h-[33px]">
                    {otForm.date ? dayFull(otForm.date) : '—'}
                  </div>
                </div>
              </div>

              {/* Row 2: Login / Logout / OT auto */}
              <div className="grid grid-cols-6 gap-4 mb-4">
                <div className="col-span-2">
                  <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Logging-in Time</label>
                  <input type="time" value={otForm.login_time}
                    onChange={e => setOtForm({ ...otForm, login_time: e.target.value })}
                    className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs focus:outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Logging-out Time</label>
                  <input type="time" value={otForm.logout_time}
                    onChange={e => setOtForm({ ...otForm, logout_time: e.target.value })}
                    className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs focus:outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Overtime Time (auto)</label>
                  <div className="border border-[#eee] bg-[#f8f6f3] px-3 py-2 text-xs text-[#1a1a1a] font-medium h-[33px]">
                    {previewOT !== null && previewOT > 0 ? minsToLabel(previewOT) : '—'}
                  </div>
                </div>
              </div>

              {/* Row 3: Extra hours range */}
              <div className="grid grid-cols-6 gap-4 mb-4">
                <div className="col-span-2">
                  <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Extra Hours — Start</label>
                  <input type="time" value={otForm.extra_hours_start}
                    onChange={e => setOtForm({ ...otForm, extra_hours_start: e.target.value })}
                    className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs focus:outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Extra Hours — End</label>
                  <input type="time" value={otForm.extra_hours_end}
                    onChange={e => setOtForm({ ...otForm, extra_hours_end: e.target.value })}
                    className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs focus:outline-none" />
                </div>
                {otForm.extra_hours_start && otForm.extra_hours_end && (
                  <div className="col-span-2 flex items-end pb-2">
                    <span className="text-[10px] text-[#888]">
                      {fmtTime(otForm.extra_hours_start)} – {fmtTime(otForm.extra_hours_end)}
                    </span>
                  </div>
                )}
              </div>

              {/* Row 4: Reason + Compensation */}
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Reason for Extra Hours</label>
                  <input type="text" value={otForm.reason}
                    onChange={e => setOtForm({ ...otForm, reason: e.target.value })}
                    placeholder="Why overtime?"
                    className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Compensated by Equal Time-Off Next Day</label>
                  <input type="text" value={otForm.compensated_by}
                    onChange={e => setOtForm({ ...otForm, compensated_by: e.target.value })}
                    placeholder="e.g. Early leave on 7 May"
                    className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs focus:outline-none" />
                </div>
              </div>

              {otErr && <p className="text-xs text-red-400 mb-3">{otErr}</p>}
              <button onClick={submitOvertime}
                disabled={otSaving || !otForm.date || !otForm.login_time || !otForm.logout_time}
                className="px-8 py-2 border border-[#1a1a1a] text-xs tracking-[0.2em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40">
                {otSaving ? 'Submitting…' : 'Submit Overtime'}
              </button>
            </div>

            {/* Overtime table — user's own rows, grouped by month */}
            {overtimeEntries.length === 0 ? (
              <p className="text-sm text-[#bbb] tracking-wider">No overtime entries yet.</p>
            ) : (
              <div className="space-y-8">
                {Object.entries(groupByMonth(overtimeEntries))
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([monthKey, entries]) => (
                    <div key={monthKey}>
                      <p className="text-xs font-bold tracking-[0.25em] uppercase text-[#1a1a1a] mb-3">
                        {new Date(monthKey + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long' })}{' '}
                        &apos;{monthKey.slice(2, 4)}
                      </p>

                      <div className="border border-[#ddd] bg-white overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-[#eee]">
                              <Th label="Date" />
                              <Th label="Day" />
                              <Th label="Logging-in Time" />
                              <Th label="Logging-out Time" />
                              <Th label="Overtime Time" />
                              <Th label="Extra Hours Logged-in" />
                              <Th label="Reason for Extra Hours" />
                              <Th label="Compensated by Time-Off" />
                              <Th label="Approved" />
                              <Th label="Approved By" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#f5f5f5]">
                            {entries.map(e => (
                              <tr key={e.id} className={e.approved ? 'bg-emerald-50/40' : ''}>
                                <td className="px-4 py-3 text-xs text-[#888] whitespace-nowrap">{fmtDate(e.date)}</td>
                                <td className="px-4 py-3 text-xs text-[#888]">{dayAbbr(e.date)}</td>
                                <td className="px-4 py-3 text-xs text-[#888] whitespace-nowrap">{fmtTime(e.login_time)}</td>
                                <td className="px-4 py-3 text-xs text-[#888] whitespace-nowrap">{fmtTime(e.logout_time)}</td>
                                <td className="px-4 py-3 text-xs text-[#1a1a1a] font-medium whitespace-nowrap">
                                  {minsToLabel(e.overtime_minutes)}
                                </td>
                                <td className="px-4 py-3 text-xs text-[#888] whitespace-nowrap">
                                  {e.extra_hours_start && e.extra_hours_end
                                    ? `${fmtTime(e.extra_hours_start)} – ${fmtTime(e.extra_hours_end)}` : '—'}
                                </td>
                                <td className="px-4 py-3 text-xs text-[#888] max-w-[140px]">{e.reason || '—'}</td>
                                <td className="px-4 py-3 text-xs text-[#888] max-w-[140px]">{e.compensated_by || '—'}</td>
                                <td className="px-4 py-3">
                                  <div className={`w-4 h-4 border flex items-center justify-center ${e.approved ? 'bg-emerald-500 border-emerald-500' : 'border-[#ddd]'}`}>
                                    {e.approved && <span className="text-white text-[8px] leading-none">✓</span>}
                                  </div>
                                  {e.rejection_reason && (
                                    <p className="text-[9px] text-red-400 italic mt-1 max-w-[120px]">{e.rejection_reason}</p>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-xs text-[#888] whitespace-nowrap">{e.approved_by || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
