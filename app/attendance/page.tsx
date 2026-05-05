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
  departure_time: string | null
  minutes_late: number | null
  minutes_missed: number | null
  reason: string | null
  pto_deduction_status: string
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
  users?: { name: string; email: string } | null
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const PTO_OPTIONS = ['pending', 'made_up_time', 'pto_deducted']
const PTO_LABELS: Record<string, string> = { pending: 'Pending', made_up_time: 'Made Up Time', pto_deducted: 'PTO Deducted' }

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtTime(t: string | null) {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}
function dayOfWeek(d: string) { return DAYS[new Date(d + 'T00:00:00').getDay()] }
function minutesToHM(mins: number | null) {
  if (mins === null) return '—'
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}
function calcOvertimeMins(login: string, logout: string) {
  const [lh, lm] = login.split(':').map(Number)
  const [oh, om] = logout.split(':').map(Number)
  const total = (oh * 60 + om) - (lh * 60 + lm)
  const workday = 8 * 60
  return Math.max(0, total - workday)
}
function monthLabel(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: '2-digit' }).replace(' ', " '")
}

export default function AttendancePage() {
  const [tab, setTab] = useState<'late' | 'overtime'>('late')
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState('')
  const [userName, setUserName] = useState('')
  const [loading, setLoading] = useState(true)

  const [lateArrivals, setLateArrivals] = useState<LateArrival[]>([])
  const [editingLate, setEditingLate] = useState<string | null>(null)
  const [lateEdits, setLateEdits] = useState<Partial<LateArrival>>({})

  const [overtimeEntries, setOvertimeEntries] = useState<OvertimeEntry[]>([])
  const [otForm, setOtForm] = useState({
    date: '', login_time: '', logout_time: '', extra_hours_start: '', extra_hours_end: '', reason: '', compensated_by: ''
  })
  const [otSaving, setOtSaving] = useState(false)
  const [otError, setOtError] = useState('')

  const router = useRouter()

  async function loadLate() {
    const q = supabaseAdmin.from('late_arrivals').select('*, users(name, email)').order('date', { ascending: false })
    const { data } = await q
    setLateArrivals(data ?? [])
  }

  async function loadOvertime(uid: string, adminFlag: boolean) {
    if (adminFlag) {
      const { data } = await supabaseAdmin
        .from('overtime_entries').select('*, users(name, email)').order('date', { ascending: false })
      setOvertimeEntries(data ?? [])
    } else {
      const { data } = await supabaseAdmin
        .from('overtime_entries').select('*').eq('user_id', uid).order('date', { ascending: false })
      setOvertimeEntries(data ?? [])
    }
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
      setUserName(dbUser.name || dbUser.email)
      await Promise.all([loadLate(), loadOvertime(dbUser.id, adminFlag)])
      setLoading(false)
    })
  }, [])

  async function saveLateField(id: string) {
    await supabaseAdmin.from('late_arrivals').update(lateEdits).eq('id', id)
    setEditingLate(null)
    setLateEdits({})
    await loadLate()
  }

  async function updatePTO(id: string, val: string) {
    await supabaseAdmin.from('late_arrivals').update({ pto_deduction_status: val }).eq('id', id)
    await loadLate()
  }

  async function submitOvertime() {
    if (!otForm.date || !otForm.login_time || !otForm.logout_time) {
      setOtError('Date, login time, and logout time are required.')
      return
    }
    setOtError('')
    setOtSaving(true)
    const overtime_minutes = calcOvertimeMins(otForm.login_time, otForm.logout_time)
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
    if (error) { setOtError(error.message); setOtSaving(false); return }
    setOtForm({ date: '', login_time: '', logout_time: '', extra_hours_start: '', extra_hours_end: '', reason: '', compensated_by: '' })
    await loadOvertime(userId, isAdmin)
    setOtSaving(false)
  }

  // Group overtime entries by month for employee view
  function groupByMonth(entries: OvertimeEntry[]) {
    const groups: Record<string, OvertimeEntry[]> = {}
    for (const e of entries) {
      const key = e.date.slice(0, 7) // "YYYY-MM"
      if (!groups[key]) groups[key] = []
      groups[key].push(e)
    }
    return groups
  }

  if (loading) return null

  return (
    <main className="min-h-screen bg-[#F5F2EE]">
      <Nav isAdmin={isAdmin} />

      <div className="px-12 py-12 max-w-6xl mx-auto">
        <h2 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-2">Attendance</h2>
        <p className="text-2xl font-light tracking-wide text-[#1a1a1a] mb-8">Attendance Records</p>

        {/* Tabs */}
        <div className="flex gap-0 mb-10 border-b border-[#ddd]">
          {([['late', 'Late Arrivals'], ['overtime', 'Overtime']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-6 py-2.5 text-xs tracking-[0.2em] uppercase transition-colors cursor-pointer border-b-2 -mb-px ${
                tab === key ? 'border-[#1a1a1a] text-[#1a1a1a]' : 'border-transparent text-[#aaa] hover:text-[#1a1a1a]'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── LATE ARRIVALS ── */}
        {tab === 'late' && (
          <>
            {lateArrivals.length === 0 ? (
              <p className="text-sm text-[#bbb] tracking-wider">No late arrivals recorded.</p>
            ) : (
              <div className="border border-[#ddd] bg-white overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#eee]">
                      {['Date', 'Name', 'Arrival Time', 'Departure Time', 'Mins Late', 'Mins Missed', 'Reason', 'PTO Status'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[9px] tracking-[0.2em] uppercase text-[#aaa] font-normal whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f5f5f5]">
                    {lateArrivals.map(row => (
                      <tr key={row.id} className="hover:bg-[#fafafa]">
                        <td className="px-4 py-3 text-xs text-[#888] whitespace-nowrap">{fmtDate(row.date)}</td>
                        <td className="px-4 py-3 text-xs text-[#1a1a1a]">
                          {isAdmin ? ((row.users as any)?.name || '—') : userName}
                        </td>
                        <td className="px-4 py-3 text-xs text-amber-600">{fmtTime(row.arrival_time)}</td>
                        <td className="px-4 py-3 text-xs text-[#888]">
                          {isAdmin && editingLate === row.id ? (
                            <input type="time" value={lateEdits.departure_time ?? row.departure_time ?? ''}
                              onChange={e => setLateEdits({ ...lateEdits, departure_time: e.target.value })}
                              className="border border-[#ddd] px-2 py-1 text-xs focus:outline-none w-28" />
                          ) : fmtTime(row.departure_time)}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#888]">{row.minutes_late ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-[#888]">
                          {isAdmin && editingLate === row.id ? (
                            <input type="number" value={lateEdits.minutes_missed ?? row.minutes_missed ?? ''}
                              onChange={e => setLateEdits({ ...lateEdits, minutes_missed: parseInt(e.target.value) })}
                              className="border border-[#ddd] px-2 py-1 text-xs focus:outline-none w-20" />
                          ) : (row.minutes_missed ?? '—')}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#888] max-w-[150px]">
                          {isAdmin && editingLate === row.id ? (
                            <input type="text" value={lateEdits.reason ?? row.reason ?? ''}
                              onChange={e => setLateEdits({ ...lateEdits, reason: e.target.value })}
                              className="border border-[#ddd] px-2 py-1 text-xs focus:outline-none w-full" />
                          ) : (row.reason || '—')}
                        </td>
                        <td className="px-4 py-3">
                          {isAdmin ? (
                            <select
                              value={row.pto_deduction_status}
                              onChange={e => updatePTO(row.id, e.target.value)}
                              className={`text-[9px] uppercase tracking-wider px-2 py-1 border focus:outline-none cursor-pointer ${
                                row.pto_deduction_status === 'pto_deducted' ? 'border-red-200 text-red-500 bg-red-50' :
                                row.pto_deduction_status === 'made_up_time' ? 'border-emerald-200 text-emerald-600 bg-emerald-50' :
                                'border-amber-200 text-amber-600 bg-amber-50'
                              }`}>
                              {PTO_OPTIONS.map(o => <option key={o} value={o}>{PTO_LABELS[o]}</option>)}
                            </select>
                          ) : (
                            <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 ${
                              row.pto_deduction_status === 'pto_deducted' ? 'text-red-500 bg-red-50' :
                              row.pto_deduction_status === 'made_up_time' ? 'text-emerald-600 bg-emerald-50' :
                              'text-amber-600 bg-amber-50'
                            }`}>{PTO_LABELS[row.pto_deduction_status] ?? row.pto_deduction_status}</span>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3">
                            {editingLate === row.id ? (
                              <div className="flex gap-2">
                                <button onClick={() => saveLateField(row.id)}
                                  className="text-xs text-emerald-600 hover:text-emerald-700 cursor-pointer">Save</button>
                                <button onClick={() => { setEditingLate(null); setLateEdits({}) }}
                                  className="text-xs text-[#aaa] hover:text-[#1a1a1a] cursor-pointer">✕</button>
                              </div>
                            ) : (
                              <button onClick={() => { setEditingLate(row.id); setLateEdits({}) }}
                                className="text-xs text-[#aaa] hover:text-[#1a1a1a] cursor-pointer">Edit</button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── OVERTIME ── */}
        {tab === 'overtime' && (
          <>
            {/* Employee: add form */}
            {!isAdmin && (
              <div className="border border-[#ddd] bg-white p-6 mb-8">
                <p className="text-xs tracking-[0.2em] uppercase text-[#888] mb-4">Log Overtime</p>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Date</label>
                    <input type="date" value={otForm.date} onChange={e => setOtForm({ ...otForm, date: e.target.value })}
                      className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs focus:outline-none" />
                  </div>
                  <div />
                  <div>
                    <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Login Time</label>
                    <input type="time" value={otForm.login_time} onChange={e => setOtForm({ ...otForm, login_time: e.target.value })}
                      className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Logout Time</label>
                    <input type="time" value={otForm.logout_time} onChange={e => setOtForm({ ...otForm, logout_time: e.target.value })}
                      className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Extra Hours Start</label>
                    <input type="time" value={otForm.extra_hours_start} onChange={e => setOtForm({ ...otForm, extra_hours_start: e.target.value })}
                      className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Extra Hours End</label>
                    <input type="time" value={otForm.extra_hours_end} onChange={e => setOtForm({ ...otForm, extra_hours_end: e.target.value })}
                      className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs focus:outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Reason</label>
                    <input type="text" value={otForm.reason} onChange={e => setOtForm({ ...otForm, reason: e.target.value })}
                      placeholder="Why overtime?"
                      className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Compensated By (e.g. early leave tomorrow)</label>
                    <input type="text" value={otForm.compensated_by} onChange={e => setOtForm({ ...otForm, compensated_by: e.target.value })}
                      placeholder="Compensation details"
                      className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs focus:outline-none" />
                  </div>
                </div>
                {otForm.login_time && otForm.logout_time && (
                  <p className="text-[10px] text-[#aaa] tracking-wider mb-3">
                    Overtime: {minutesToHM(calcOvertimeMins(otForm.login_time, otForm.logout_time))}
                  </p>
                )}
                {otError && <p className="text-xs text-red-400 mb-3">{otError}</p>}
                <button onClick={submitOvertime} disabled={otSaving || !otForm.date || !otForm.login_time || !otForm.logout_time}
                  className="px-8 py-2 border border-[#1a1a1a] text-xs tracking-[0.2em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40">
                  {otSaving ? 'Submitting…' : 'Submit Overtime'}
                </button>
              </div>
            )}

            {/* Overtime table */}
            {overtimeEntries.length === 0 ? (
              <p className="text-sm text-[#bbb] tracking-wider">No overtime entries yet.</p>
            ) : isAdmin ? (
              /* Admin: flat table */
              <div className="border border-[#ddd] bg-white overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#eee]">
                      {['Employee', 'Date', 'Day', 'Login', 'Logout', 'OT Time', 'Extra Hours', 'Reason', 'Comp.', 'Status'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[9px] tracking-[0.2em] uppercase text-[#aaa] font-normal whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f5f5f5]">
                    {overtimeEntries.map(e => (
                      <tr key={e.id} className={`hover:bg-[#fafafa] ${e.approved ? 'bg-emerald-50/30' : ''}`}>
                        <td className="px-4 py-3 text-xs text-[#1a1a1a]">{(e.users as any)?.name || '—'}</td>
                        <td className="px-4 py-3 text-xs text-[#888] whitespace-nowrap">{fmtDate(e.date)}</td>
                        <td className="px-4 py-3 text-xs text-[#888]">{dayOfWeek(e.date)}</td>
                        <td className="px-4 py-3 text-xs text-[#888]">{fmtTime(e.login_time)}</td>
                        <td className="px-4 py-3 text-xs text-[#888]">{fmtTime(e.logout_time)}</td>
                        <td className="px-4 py-3 text-xs text-[#1a1a1a] font-medium">{minutesToHM(e.overtime_minutes)}</td>
                        <td className="px-4 py-3 text-xs text-[#888] whitespace-nowrap">
                          {e.extra_hours_start && e.extra_hours_end ? `${fmtTime(e.extra_hours_start)} – ${fmtTime(e.extra_hours_end)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#888] max-w-[120px] truncate">{e.reason || '—'}</td>
                        <td className="px-4 py-3 text-xs text-[#888] max-w-[120px] truncate">{e.compensated_by || '—'}</td>
                        <td className="px-4 py-3">
                          {e.approved ? (
                            <span className="text-[9px] uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5">Approved</span>
                          ) : (
                            <span className="text-[9px] uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-0.5">Pending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Employee: grouped by month */
              (() => {
                const groups = groupByMonth(overtimeEntries)
                return (
                  <div className="space-y-8">
                    {Object.keys(groups).sort().reverse().map(monthKey => (
                      <div key={monthKey}>
                        <p className="text-[10px] tracking-[0.3em] uppercase text-[#aaa] mb-3">
                          {new Date(monthKey + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long' })} &apos;{monthKey.slice(2, 4)}
                        </p>
                        <div className="border border-[#ddd] bg-white overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-[#eee]">
                                {['Date', 'Day', 'Login', 'Logout', 'OT Time', 'Extra Hours', 'Reason', 'Compensated By', 'Approved', 'Approved By'].map(h => (
                                  <th key={h} className="px-4 py-3 text-left text-[9px] tracking-[0.2em] uppercase text-[#aaa] font-normal whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#f5f5f5]">
                              {groups[monthKey].map(e => (
                                <tr key={e.id} className={e.approved ? 'bg-emerald-50/40' : ''}>
                                  <td className="px-4 py-3 text-xs text-[#888] whitespace-nowrap">{fmtDate(e.date)}</td>
                                  <td className="px-4 py-3 text-xs text-[#888]">{dayOfWeek(e.date)}</td>
                                  <td className="px-4 py-3 text-xs text-[#888]">{fmtTime(e.login_time)}</td>
                                  <td className="px-4 py-3 text-xs text-[#888]">{fmtTime(e.logout_time)}</td>
                                  <td className="px-4 py-3 text-xs text-[#1a1a1a] font-medium">{minutesToHM(e.overtime_minutes)}</td>
                                  <td className="px-4 py-3 text-xs text-[#888] whitespace-nowrap">
                                    {e.extra_hours_start && e.extra_hours_end
                                      ? `${fmtTime(e.extra_hours_start)} – ${fmtTime(e.extra_hours_end)}`
                                      : '—'}
                                  </td>
                                  <td className="px-4 py-3 text-xs text-[#888]">{e.reason || '—'}</td>
                                  <td className="px-4 py-3 text-xs text-[#888]">{e.compensated_by || '—'}</td>
                                  <td className="px-4 py-3">
                                    <div className={`w-4 h-4 border flex items-center justify-center ${e.approved ? 'bg-emerald-500 border-emerald-500' : 'border-[#ddd]'}`}>
                                      {e.approved && <span className="text-white text-[8px]">✓</span>}
                                    </div>
                                    {e.rejection_reason && (
                                      <p className="text-[9px] text-red-400 italic mt-1 max-w-[120px]">{e.rejection_reason}</p>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-xs text-[#888]">{e.approved_by || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()
            )}
          </>
        )}
      </div>
    </main>
  )
}
