'use client'
import { useEffect, useState } from 'react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import Nav from '../components/Nav'

type DayData = {
  myLeave?: { type: string; status: string }
  teamLeaves?: { name: string; type: string }[]
  holiday?: { name: string }
  companyWorkingSaturday?: boolean
  personalWorkingSaturdays?: { name: string }[]
}

type Holiday = { id: string; name: string; date: string; type: string }
type CalendarTab = 'calendar' | 'holidays'

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

function dateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function expandLeaveRange(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = []
  const start = new Date(dateFrom + 'T00:00:00')
  const end = new Date(dateTo + 'T00:00:00')
  const cur = new Date(start)
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0])
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function formatHDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}
function dayOfWeek(d: string) { return WEEKDAY_NAMES[new Date(d + 'T00:00:00').getDay()] }
function isHolidayPast(d: string) { return d < new Date().toISOString().split('T')[0] }

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const TYPE_LABELS: Record<string, string> = {
  casual: 'Earned',
  sick: 'Sick',
  earned: 'Earned',
  wfh: 'WFH',
}

export default function CalendarPage() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [calData, setCalData] = useState<{ myLeaves: any[]; teamLeaves: any[]; holidays: any[]; workingSaturdays: any[] } | null>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth())

  const [activeTab, setActiveTab] = useState<CalendarTab>('calendar')

  const [activeYear, setActiveYear] = useState<2026 | 2027>(2026)
  const [addForm, setAddForm] = useState({ name: '', date: '', type: 'national' })
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', date: '', type: 'national' })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const router = useRouter()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('tab') === 'holidays') setActiveTab('holidays')
  }, [])

  async function loadHolidays() {
    const { data } = await supabaseAdmin.from('holidays').select('*').order('date', { ascending: true })
    const h = data ?? []
    setCalData(prev => prev ? { ...prev, holidays: h } : null)
    return h
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/'); return }

      const { data: dbUser } = await supabaseAdmin
        .from('users')
        .select('id, is_admin')
        .eq('email', session.user.email)
        .single()

      if (!dbUser) return

      setIsAdmin(dbUser.is_admin ?? false)

      const [{ data: myLeaves }, { data: teamLeaves }, { data: holidays }, { data: workingSaturdays }] = await Promise.all([
        supabaseAdmin
          .from('leaves')
          .select('*')
          .eq('user_id', dbUser.id)
          .in('status', ['approved', 'pending']),
        supabaseAdmin
          .from('leaves')
          .select('*, users(name)')
          .neq('user_id', dbUser.id)
          .eq('status', 'approved'),
        supabaseAdmin
          .from('holidays')
          .select('*')
          .order('date', { ascending: true }),
        supabaseAdmin
          .from('working_saturdays')
          .select('id, date, user_id, users(name)')
          .order('date', { ascending: true }),
      ])

      setCalData({
        myLeaves: myLeaves ?? [],
        teamLeaves: teamLeaves ?? [],
        holidays: holidays ?? [],
        workingSaturdays: workingSaturdays ?? [],
      })
    })
  }, [])

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const dayMap = new Map<string, DayData>()

  if (calData) {
    for (const leave of calData.myLeaves) {
      for (const d of expandLeaveRange(leave.date_from, leave.date_to)) {
        const prev = dayMap.get(d) ?? {}
        dayMap.set(d, { ...prev, myLeave: { type: leave.type, status: leave.status } })
      }
    }
    for (const leave of calData.teamLeaves) {
      for (const d of expandLeaveRange(leave.date_from, leave.date_to)) {
        const prev = dayMap.get(d) ?? {}
        const tl = prev.teamLeaves ?? []
        dayMap.set(d, { ...prev, teamLeaves: [...tl, { name: leave.users?.name || 'Team', type: leave.type }] })
      }
    }
    for (const h of calData.holidays) {
      const prev = dayMap.get(h.date) ?? {}
      dayMap.set(h.date, { ...prev, holiday: { name: h.name } })
    }
    for (const ws of calData.workingSaturdays) {
      const prev = dayMap.get(ws.date) ?? {}
      if (ws.user_id === null) {
        dayMap.set(ws.date, { ...prev, companyWorkingSaturday: true })
      } else {
        const personal = prev.personalWorkingSaturdays ?? []
        dayMap.set(ws.date, { ...prev, personalWorkingSaturdays: [...personal, { name: (ws.users as any)?.name || 'Team' }] })
      }
    }
  }

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, i) => {
    if (i < firstDay) return null
    return i - firstDay + 1
  })

  const today = new Date()

  async function addHoliday() {
    if (!addForm.name || !addForm.date) return
    setAddError('')
    setAddSaving(true)
    const { error } = await supabaseAdmin.from('holidays')
      .insert({ name: addForm.name, date: addForm.date, type: addForm.type })
    if (error) { setAddError(error.message); setAddSaving(false); return }
    setAddForm({ name: '', date: '', type: 'national' })
    await loadHolidays()
    setAddSaving(false)
  }

  function startEdit(h: Holiday) {
    setEditId(h.id)
    setEditForm({ name: h.name, date: h.date, type: h.type })
    setEditError('')
  }

  async function saveEdit() {
    if (!editId || !editForm.name || !editForm.date) return
    setEditError('')
    setEditSaving(true)
    const { error } = await supabaseAdmin.from('holidays')
      .update({ name: editForm.name, date: editForm.date, type: editForm.type })
      .eq('id', editId)
    if (error) { setEditError(error.message); setEditSaving(false); return }
    setEditId(null)
    await loadHolidays()
    setEditSaving(false)
  }

  async function deleteHoliday(id: string) {
    await supabaseAdmin.from('holidays').delete().eq('id', id)
    await loadHolidays()
  }

  function switchYear(y: 2026 | 2027) {
    setActiveYear(y)
    setAddForm(f => ({ ...f, date: '' }))
    setEditId(null)
  }

  const yearHolidays = (calData?.holidays ?? []).filter((h: any) => h.date.startsWith(String(activeYear)))

  return (
    <main className="min-h-screen bg-[#F5F2EE]">
      <Nav isAdmin={isAdmin} />

      <div className="px-12 py-12 max-w-5xl mx-auto">
        <h2 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-6">Calendar</h2>

        {/* Sub-tabs */}
        <div className="flex gap-0 border-b border-[#ddd] mb-10">
          {(['calendar', 'holidays'] as CalendarTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-xs tracking-[0.2em] uppercase transition-colors cursor-pointer border-b-2 -mb-px ${
                activeTab === tab
                  ? 'border-[#1a1a1a] text-[#1a1a1a]'
                  : 'border-transparent text-[#aaa] hover:text-[#1a1a1a]'
              }`}
            >
              {tab === 'calendar' ? 'Calendar' : 'Holidays'}
            </button>
          ))}
        </div>

        {/* Calendar Tab */}
        {activeTab === 'calendar' && (
          <>
            <div className="flex items-center justify-between mb-10">
              <p className="text-2xl font-light tracking-wide text-[#1a1a1a]">{MONTHS[month]} {year}</p>
              <div className="flex items-center gap-4">
                <button onClick={prevMonth} className="w-8 h-8 border border-[#ddd] flex items-center justify-center text-[#888] hover:text-[#1a1a1a] hover:border-[#aaa] transition-colors cursor-pointer">
                  ‹
                </button>
                <button onClick={nextMonth} className="w-8 h-8 border border-[#ddd] flex items-center justify-center text-[#888] hover:text-[#1a1a1a] hover:border-[#aaa] transition-colors cursor-pointer">
                  ›
                </button>
              </div>
            </div>

            <div className="border border-[#ddd] bg-white">
              <div className="grid grid-cols-7 border-b border-[#eee]">
                {DAYS.map(d => (
                  <div key={d} className="py-3 text-center text-xs tracking-[0.15em] uppercase text-[#aaa]">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {cells.map((day, idx) => {
                  if (!day) return <div key={`empty-${idx}`} className="min-h-[88px] border-b border-r border-[#f0f0f0]" />
                  const ds = dateStr(year, month, day)
                  const data = dayMap.get(ds)
                  const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day

                  return (
                    <div
                      key={ds}
                      className={`min-h-[88px] p-2 border-b border-r border-[#f0f0f0] relative ${
                        data?.holiday ? 'bg-amber-50/60' :
                        data?.myLeave ? 'bg-[#f0f0ef]' : ''
                      }`}
                    >
                      <span className={`text-xs font-light block mb-1 ${
                        isToday ? 'w-5 h-5 rounded-full bg-[#1a1a1a] text-white flex items-center justify-center' :
                        'text-[#888]'
                      }`}>
                        {day}
                      </span>
                      <div className="space-y-0.5">
                        {data?.holiday && (
                          <div className="text-[9px] tracking-wider uppercase text-amber-600 truncate leading-tight">
                            {data.holiday.name}
                          </div>
                        )}
                        {data?.myLeave && (
                          <div className={`text-[9px] tracking-wider uppercase truncate leading-tight px-1 rounded-sm ${
                            data.myLeave.status === 'approved' ? 'text-emerald-700 bg-emerald-100' :
                            data.myLeave.status === 'pending' ? 'text-amber-600 bg-amber-100' :
                            'text-[#aaa] bg-[#eee]'
                          }`}>
                            {TYPE_LABELS[data.myLeave.type] || data.myLeave.type}
                          </div>
                        )}
                        {data?.teamLeaves?.slice(0, 2).map((tl, i) => (
                          <div key={i} className="text-[9px] tracking-wider uppercase truncate leading-tight text-blue-500 bg-blue-50 px-1 rounded-sm">
                            {tl.name.split(' ')[0]}
                          </div>
                        ))}
                        {(data?.teamLeaves?.length ?? 0) > 2 && (
                          <div className="text-[9px] text-[#aaa]">+{(data!.teamLeaves!.length) - 2} more</div>
                        )}
                        {data?.companyWorkingSaturday && (
                          <div className="text-[9px] tracking-wider uppercase truncate leading-tight text-[#7a6e5f] bg-[#e8e0d5] px-1 rounded-sm">
                            Working Sat
                          </div>
                        )}
                        {data?.personalWorkingSaturdays?.map((ps, i) => (
                          <div key={i} className="text-[9px] tracking-wider uppercase truncate leading-tight text-[#9a8e82] bg-[#f0ebe4] px-1 rounded-sm">
                            {ps.name.split(' ')[0]} Sat
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-x-8 gap-y-3 mt-6">
              {[
                { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Your leave (approved)' },
                { bg: 'bg-amber-100', text: 'text-amber-600', label: 'Your leave (pending)' },
                { bg: 'bg-blue-50', text: 'text-blue-500', label: 'Team leave' },
                { bg: 'bg-amber-50', text: 'text-amber-600', label: 'Holiday' },
                { bg: 'bg-[#e8e0d5]', text: 'text-[#7a6e5f]', label: 'Company working Saturday' },
                { bg: 'bg-[#f0ebe4]', text: 'text-[#9a8e82]', label: 'Personal working Saturday' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-sm ${item.bg}`} />
                  <span className={`text-xs tracking-wider ${item.text}`}>{item.label}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Holidays Tab */}
        {activeTab === 'holidays' && (
          <div>
            <div className="flex items-end justify-between mb-8">
              <p className="text-2xl font-light tracking-wide text-[#1a1a1a]">Holiday Calendar</p>
            </div>

            {/* Year tabs */}
            <div className="flex gap-0 mb-8 border-b border-[#ddd]">
              {([2026, 2027] as const).map(y => (
                <button
                  key={y}
                  onClick={() => switchYear(y)}
                  className={`px-6 py-2.5 text-xs tracking-[0.2em] uppercase transition-colors cursor-pointer border-b-2 -mb-px ${
                    activeYear === y
                      ? 'border-[#1a1a1a] text-[#1a1a1a]'
                      : 'border-transparent text-[#aaa] hover:text-[#1a1a1a]'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>

            {/* Admin: Add form */}
            {isAdmin && (
              <div className="border border-[#ddd] bg-white p-6 mb-6">
                <p className="text-xs tracking-[0.2em] uppercase text-[#888] mb-4">Add Holiday</p>
                <div className="flex gap-4 items-end flex-wrap">
                  <div className="flex-1 min-w-[180px]">
                    <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Name</label>
                    <input type="text" placeholder="Holiday name" value={addForm.name}
                      onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                      className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Date</label>
                    <input type="date" value={addForm.date}
                      min={`${activeYear}-01-01`} max={`${activeYear}-12-31`}
                      onChange={e => setAddForm({ ...addForm, date: e.target.value })}
                      className="border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Type</label>
                    <select value={addForm.type} onChange={e => setAddForm({ ...addForm, type: e.target.value })}
                      className="border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs uppercase text-[#1a1a1a] focus:outline-none">
                      <option value="national">National</option>
                      <option value="company">Company</option>
                    </select>
                  </div>
                  <button onClick={addHoliday} disabled={addSaving || !addForm.name || !addForm.date}
                    className="px-6 py-2 border border-[#1a1a1a] text-xs tracking-[0.2em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40 shrink-0">
                    {addSaving ? 'Adding…' : 'Add'}
                  </button>
                </div>
                {addError && <p className="text-xs text-red-400 mt-3">{addError}</p>}
              </div>
            )}

            {/* Holiday Table */}
            {yearHolidays.length === 0 ? (
              <p className="text-sm text-[#bbb] tracking-wider">
                {activeYear === 2027 ? 'No holidays added for 2027 yet.' : 'No holidays added yet.'}
              </p>
            ) : (
              <div className="border border-[#ddd] bg-white overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#eee]">
                      <th className="px-6 py-3 text-left text-xs tracking-[0.2em] uppercase text-[#aaa] font-normal">Holiday</th>
                      <th className="px-6 py-3 text-left text-xs tracking-[0.2em] uppercase text-[#aaa] font-normal">Date</th>
                      <th className="px-6 py-3 text-left text-xs tracking-[0.2em] uppercase text-[#aaa] font-normal">Day</th>
                      <th className="px-6 py-3 text-left text-xs tracking-[0.2em] uppercase text-[#aaa] font-normal">Type</th>
                      {isAdmin && <th className="px-6 py-3 text-left text-xs tracking-[0.2em] uppercase text-[#aaa] font-normal w-32"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f5f5f5]">
                    {yearHolidays.map((h: any) => (
                      editId === h.id ? (
                        <tr key={h.id} className="bg-[#fafafa]">
                          <td className="px-4 py-3" colSpan={isAdmin ? 5 : 4}>
                            <div className="flex gap-3 items-center flex-wrap">
                              <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                className="flex-1 min-w-[160px] border border-[#ddd] bg-white px-3 py-1.5 text-xs text-[#1a1a1a] focus:outline-none" />
                              <input type="date" value={editForm.date} onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                                className="border border-[#ddd] bg-white px-3 py-1.5 text-xs text-[#1a1a1a] focus:outline-none" />
                              <select value={editForm.type} onChange={e => setEditForm({ ...editForm, type: e.target.value })}
                                className="border border-[#ddd] bg-white px-3 py-1.5 text-xs uppercase text-[#1a1a1a] focus:outline-none">
                                <option value="national">National</option>
                                <option value="company">Company</option>
                              </select>
                              <button onClick={saveEdit} disabled={editSaving}
                                className="px-4 py-1.5 border border-[#1a1a1a] text-xs tracking-wider uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40">
                                {editSaving ? '…' : 'Save'}
                              </button>
                              <button onClick={() => setEditId(null)}
                                className="px-4 py-1.5 border border-[#ddd] text-xs uppercase text-[#888] hover:text-[#1a1a1a] cursor-pointer">
                                Cancel
                              </button>
                              {editError && <span className="text-xs text-red-400">{editError}</span>}
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={h.id} className={`hover:bg-[#fafafa] ${isHolidayPast(h.date) ? 'opacity-50' : ''}`}>
                          <td className="px-6 py-4 text-xs text-[#1a1a1a]">{h.name}</td>
                          <td className="px-6 py-4 text-xs text-[#888]">{formatHDate(h.date)}</td>
                          <td className="px-6 py-4 text-xs text-[#888]">{dayOfWeek(h.date)}</td>
                          <td className="px-6 py-4">
                            <span className={`text-[9px] tracking-[0.15em] uppercase px-2 py-0.5 ${
                              h.type === 'national' ? 'text-blue-600 bg-blue-50' : 'text-purple-600 bg-purple-50'
                            }`}>
                              {h.type}
                            </span>
                          </td>
                          {isAdmin && (
                            <td className="px-6 py-4">
                              <div className="flex gap-4">
                                <button onClick={() => startEdit(h)}
                                  className="text-xs text-[#aaa] hover:text-[#1a1a1a] transition-colors cursor-pointer">Edit</button>
                                <button onClick={() => deleteHoliday(h.id)}
                                  className="text-xs text-[#aaa] hover:text-red-500 transition-colors cursor-pointer">Remove</button>
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
