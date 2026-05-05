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

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const TYPE_LABELS: Record<string, string> = {
  sick: 'Sick',
  earned: 'Earned',
  wfh: 'WFH',
}

export default function CalendarPage() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [calData, setCalData] = useState<{ myLeaves: any[]; teamLeaves: any[]; holidays: any[]; workingSaturdays: any[] } | null>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth())
  const router = useRouter()

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

  return (
    <main className="min-h-screen bg-[#F5F2EE]">
      <Nav isAdmin={isAdmin} />

      <div className="px-12 py-12 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h2 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-1">Calendar</h2>
            <p className="text-2xl font-light tracking-wide text-[#1a1a1a]">{MONTHS[month]} {year}</p>
          </div>
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
      </div>
    </main>
  )
}
