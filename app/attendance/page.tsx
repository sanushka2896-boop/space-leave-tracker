'use client'
import { useEffect, useState } from 'react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import Nav from '../components/Nav'

type ClockLogEntry = { id: string; user_id: string; date: string; clock_in_time: string | null; users?: { name: string } | null }
type LateArrival = {
  id: string; user_id: string; date: string; arrival_time: string | null
  minutes_late: number | null; reason: string | null; notes: string | null
  pto_deduction_status: string; approved: boolean; approved_by: string | null
  users?: { name: string; email: string } | null
}
type OvertimeEntry = {
  id: string; user_id: string; date: string; login_time: string | null
  logout_time: string | null; overtime_duration: string | null
  extra_hours_start: string | null; extra_hours_end: string | null
  reason: string | null; compensated_by: string | null
  approved: boolean; approved_by: string | null; rejection_reason: string | null
  created_at: string; users?: { name: string } | null
}
type BalanceLog = {
  id: string; user_id: string; log_date: string
  ot_minutes_used: number; late_minutes_cancelled: number; net_minutes: number
  note: string | null; created_at: string
  users?: { name: string } | null
}
type TeamMember = { id: string; name: string; email: string }
type OTForm = { date: string; login_time: string; logout_time: string; extra_hours_start: string; extra_hours_end: string; reason: string; compensated_by: string }

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
function getISTDate(): string {
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, '0')}-${String(ist.getDate()).padStart(2, '0')}`
}
function calcOvertimeDuration(logout: string): string | null {
  const [h, m] = logout.split(':').map(Number)
  const mins = Math.max(0, h * 60 + m - 19 * 60)
  if (mins <= 0) return null
  const hr = Math.floor(mins / 60), mn = mins % 60
  if (hr === 0) return `${mn} min${mn !== 1 ? 's' : ''}`
  if (mn === 0) return `${hr} hr${hr !== 1 ? 's' : ''}`
  return `${hr} hr ${mn} min${mn !== 1 ? 's' : ''}`
}
function calcOvertimeFromExtraHours(start: string, end: string): string | null {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const startMins = sh * 60 + sm
  const endMins = eh * 60 + em
  const threshold = 19 * 60
  if (endMins <= threshold) return null
  const otStart = Math.max(startMins, threshold)
  const mins = endMins - otStart
  if (mins <= 0) return null
  const hr = Math.floor(mins / 60), mn = mins % 60
  if (hr === 0) return `${mn} min${mn !== 1 ? 's' : ''}`
  if (mn === 0) return `${hr} hr${hr !== 1 ? 's' : ''}`
  return `${hr} hr ${mn} min${mn !== 1 ? 's' : ''}`
}
function calcOT(logout: string, extraStart: string, extraEnd: string): string | null {
  if (extraStart && extraEnd) return calcOvertimeFromExtraHours(extraStart, extraEnd)
  return calcOvertimeDuration(logout)
}
function minsLateFrom10(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return Math.max(0, h * 60 + m - 10 * 60)
}
function parseOTDuration(s: string | null): number {
  if (!s) return 0
  let mins = 0
  const hrMatch = s.match(/(\d+)\s*hr/)
  const minMatch = s.match(/(\d+)\s*min/)
  if (hrMatch) mins += parseInt(hrMatch[1]) * 60
  if (minMatch) mins += parseInt(minMatch[1])
  return mins
}
function parseDDMMYYYY(s: string): string {
  const parts = s.trim().split('/')
  if (parts.length !== 3) return s.trim()
  const [d, m, y] = parts
  return `${y.trim()}-${m.trim().padStart(2, '0')}-${d.trim().padStart(2, '0')}`
}
function fmtMins(m: number): string {
  if (m === 0) return '0m'
  const h = Math.floor(Math.abs(m) / 60)
  const mn = Math.abs(m) % 60
  if (h === 0) return `${mn}m`
  if (mn === 0) return `${h}h`
  return `${h}h ${mn}m`
}

const PTO_OPTIONS = ['Pending', 'Made Up Time', 'PTO Deducted'] as const
function ptoBadgeCls(v: string) {
  if (v === 'Pending') return 'text-red-600 bg-red-50 border-red-200'
  if (v === 'Made Up Time') return 'text-emerald-600 bg-emerald-50 border-emerald-200'
  if (v === 'PTO Deducted') return 'text-amber-600 bg-amber-50 border-amber-200'
  return 'text-[#888] bg-[#f5f5f5] border-[#ddd]'
}

const BLANK_OT_FORM: OTForm = { date: '', login_time: '10:00', logout_time: '18:00', extra_hours_start: '', extra_hours_end: '', reason: '', compensated_by: '' }

export default function AttendancePage() {
  const [tab, setTab] = useState<'clock' | 'late' | 'overtime'>('clock')
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState('')
  const [team, setTeam] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  // Clock log
  const [clockLogs, setClockLogs] = useState<ClockLogEntry[]>([])
  const [deletingClockId, setDeletingClockId] = useState<string | null>(null)

  // Late arrivals
  const [lateArrivals, setLateArrivals] = useState<LateArrival[]>([])
  const [lateNotesEdit, setLateNotesEdit] = useState<Record<string, string>>({})
  const [addLate, setAddLate] = useState({ user_id: '', date: '', arrival_time: '', reason: '' })
  const [addLateSaving, setAddLateSaving] = useState(false)
  const [addLateErr, setAddLateErr] = useState('')
  const [deletingLateId, setDeletingLateId] = useState<string | null>(null)
  const [lateImporting, setLateImporting] = useState(false)
  const [lateImportErrs, setLateImportErrs] = useState<string[]>([])

  // Overtime
  const [overtimeEntries, setOvertimeEntries] = useState<OvertimeEntry[]>([])
  const [otNotesEdit, setOtNotesEdit] = useState<Record<string, string>>({})
  const [otForm, setOtForm] = useState<OTForm>(BLANK_OT_FORM)
  const [otSaving, setOtSaving] = useState(false)
  const [otErr, setOtErr] = useState('')
  const [editingOT, setEditingOT] = useState<(OTForm & { id: string }) | null>(null)
  const [editOTSaving, setEditOTSaving] = useState(false)
  const [editOTErr, setEditOTErr] = useState('')
  const [deletingOTId, setDeletingOTId] = useState<string | null>(null)
  const [otImporting, setOtImporting] = useState(false)
  const [otImportErrs, setOtImportErrs] = useState<string[]>([])

  // Balance logs
  const [balanceLogs, setBalanceLogs] = useState<BalanceLog[]>([])
  const [showBalanceLogs, setShowBalanceLogs] = useState(false)
  const [generatingLogs, setGeneratingLogs] = useState(false)

  // Admin notes on summary rows
  const [adminNotes, setAdminNotes] = useState<Record<string, { lateNote: string; otNote: string }>>({})
  const [adminNoteSaving, setAdminNoteSaving] = useState<string | null>(null)

  async function loadClockLogs(uid: string, adminFlag: boolean) {
    const today = getISTDate()
    if (adminFlag) {
      const { data } = await supabaseAdmin.from('clock_logs')
        .select('*, users(name)').lt('date', today).order('date', { ascending: false })
      setClockLogs((data ?? []) as ClockLogEntry[])
    } else {
      const { data } = await supabaseAdmin.from('clock_logs')
        .select('*').eq('user_id', uid).lt('date', today).order('date', { ascending: false })
      setClockLogs((data ?? []) as ClockLogEntry[])
    }
  }

  async function loadLate() {
    const { data } = await supabaseAdmin
      .from('late_arrivals').select('*, users(name, email)').order('date', { ascending: false })
    setLateArrivals(data ?? [])
    const map: Record<string, string> = {}
    for (const row of (data ?? [])) map[row.id] = row.notes ?? ''
    setLateNotesEdit(map)
  }

  async function loadOvertime(uid: string, adminFlag: boolean) {
    if (adminFlag) {
      const { data } = await supabaseAdmin.from('overtime_entries')
        .select('*, users(name)').order('date', { ascending: false })
      const entries = (data ?? []) as OvertimeEntry[]
      setOvertimeEntries(entries)
      const map: Record<string, string> = {}
      for (const e of entries) map[e.id] = e.compensated_by ?? ''
      setOtNotesEdit(map)
    } else {
      const { data } = await supabaseAdmin.from('overtime_entries')
        .select('*').eq('user_id', uid).order('date', { ascending: false })
      const entries = (data ?? []) as OvertimeEntry[]
      setOvertimeEntries(entries)
      const map: Record<string, string> = {}
      for (const e of entries) map[e.id] = e.compensated_by ?? ''
      setOtNotesEdit(map)
    }
  }

  async function loadBalanceLogs() {
    const { data } = await supabaseAdmin.from('attendance_balance_logs')
      .select('*, users(name)').order('created_at', { ascending: false })
    setBalanceLogs((data ?? []) as BalanceLog[])
  }

  async function loadAdminNotes() {
    const { data } = await supabaseAdmin.from('attendance_admin_notes').select('*')
    const map: Record<string, { lateNote: string; otNote: string }> = {}
    for (const row of data ?? []) map[row.user_id] = { lateNote: row.late_note ?? '', otNote: row.ot_note ?? '' }
    setAdminNotes(map)
  }

  async function saveAdminNote(userId: string, field: 'late_note' | 'ot_note', value: string) {
    setAdminNoteSaving(userId + field)
    const cur = adminNotes[userId] ?? { lateNote: '', otNote: '' }
    await supabaseAdmin.from('attendance_admin_notes').upsert({
      user_id: userId,
      late_note: field === 'late_note' ? (value || null) : (cur.lateNote || null),
      ot_note: field === 'ot_note' ? (value || null) : (cur.otNote || null),
    }, { onConflict: 'user_id' })
    setAdminNotes(prev => ({
      ...prev,
      [userId]: field === 'late_note' ? { ...cur, lateNote: value } : { ...cur, otNote: value },
    }))
    setAdminNoteSaving(null)
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
      if (adminFlag) {
        const { data: usersData } = await supabaseAdmin.from('users').select('id, name, email').order('name')
        setTeam(usersData ?? [])
      }
      await Promise.all([
        loadClockLogs(dbUser.id, adminFlag),
        loadLate(),
        loadOvertime(dbUser.id, adminFlag),
        loadBalanceLogs(),
        loadAdminNotes(),
      ])
      setLoading(false)
    })
  }, [])

  async function deleteClockLog(id: string) {
    setDeletingClockId(id)
    await supabaseAdmin.from('clock_logs').delete().eq('id', id)
    setDeletingClockId(null)
    await loadClockLogs(userId, isAdmin)
  }

  async function addLateRow() {
    if (!addLate.user_id || !addLate.date || !addLate.arrival_time) {
      setAddLateErr('Employee, date, and arrival time are required.')
      return
    }
    setAddLateErr('')
    setAddLateSaving(true)
    const { data: existing } = await supabaseAdmin
      .from('late_arrivals').select('id').eq('user_id', addLate.user_id).eq('date', addLate.date).maybeSingle()
    if (existing) {
      setAddLateErr('Late arrival already logged for this date.')
      setAddLateSaving(false)
      return
    }
    const { error } = await supabaseAdmin.from('late_arrivals').insert({
      user_id: addLate.user_id, date: addLate.date, arrival_time: addLate.arrival_time,
      minutes_late: minsLateFrom10(addLate.arrival_time), reason: addLate.reason || null,
      pto_deduction_status: 'Pending', approved: false,
    })
    if (error) { setAddLateErr(error.message); setAddLateSaving(false); return }
    setAddLate({ user_id: '', date: '', arrival_time: '', reason: '' })
    await loadLate()
    setAddLateSaving(false)
  }

  async function deleteLateRow(id: string) {
    setDeletingLateId(id)
    await supabaseAdmin.from('late_arrivals').delete().eq('id', id)
    setDeletingLateId(null)
    await loadLate()
  }

  async function updatePTO(id: string, val: string) {
    await supabaseAdmin.from('late_arrivals').update({ pto_deduction_status: val }).eq('id', id)
    setLateArrivals(prev => prev.map(r => r.id === id ? { ...r, pto_deduction_status: val } : r))
  }

  async function saveLateNotes(id: string) {
    const notes = lateNotesEdit[id] ?? ''
    const row = lateArrivals.find(r => r.id === id)
    if ((row?.notes ?? '') === notes) return
    await supabaseAdmin.from('late_arrivals').update({ notes: notes || null }).eq('id', id)
    setLateArrivals(prev => prev.map(r => r.id === id ? { ...r, notes: notes || null } : r))
  }

  async function submitOvertime() {
    if (!otForm.date || !otForm.login_time || !otForm.logout_time) {
      setOtErr('Date, login time, and logout time are required.')
      return
    }
    setOtErr('')
    setOtSaving(true)
    const { error } = await supabaseAdmin.from('overtime_entries').insert({
      user_id: userId, date: otForm.date, login_time: otForm.login_time,
      logout_time: otForm.logout_time, overtime_duration: calcOT(otForm.logout_time, otForm.extra_hours_start, otForm.extra_hours_end),
      extra_hours_start: otForm.extra_hours_start || null, extra_hours_end: otForm.extra_hours_end || null,
      reason: otForm.reason || null, compensated_by: otForm.compensated_by || null, approved: false,
    })
    if (error) { setOtErr(error.message); setOtSaving(false); return }
    setOtForm(BLANK_OT_FORM)
    await loadOvertime(userId, isAdmin)
    setOtSaving(false)
  }

  async function saveModifyOT() {
    if (!editingOT) return
    if (!editingOT.date || !editingOT.login_time || !editingOT.logout_time) {
      setEditOTErr('Date, login, and logout are required.')
      return
    }
    setEditOTErr('')
    setEditOTSaving(true)
    const { error } = await supabaseAdmin.from('overtime_entries').update({
      date: editingOT.date, login_time: editingOT.login_time, logout_time: editingOT.logout_time,
      overtime_duration: calcOT(editingOT.logout_time, editingOT.extra_hours_start ?? '', editingOT.extra_hours_end ?? ''),
      extra_hours_start: editingOT.extra_hours_start || null, extra_hours_end: editingOT.extra_hours_end || null,
      reason: editingOT.reason || null, compensated_by: editingOT.compensated_by || null,
    }).eq('id', editingOT.id)
    if (error) { setEditOTErr(error.message); setEditOTSaving(false); return }
    setEditingOT(null)
    await loadOvertime(userId, isAdmin)
    setEditOTSaving(false)
  }

  async function deleteOT(id: string) {
    setDeletingOTId(id)
    await supabaseAdmin.from('overtime_entries').delete().eq('id', id)
    setDeletingOTId(null)
    await loadOvertime(userId, isAdmin)
  }

  async function saveOTNotes(id: string) {
    const notes = otNotesEdit[id] ?? ''
    const entry = overtimeEntries.find(e => e.id === id)
    if ((entry?.compensated_by ?? '') === notes) return
    await supabaseAdmin.from('overtime_entries').update({ compensated_by: notes || null }).eq('id', id)
    setOvertimeEntries(prev => prev.map(e => e.id === id ? { ...e, compensated_by: notes || null } : e))
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

  // Compute per-employee late + OT stats from current loaded data
  function computeBalance() {
    const lateMap: Record<string, { name: string; count: number; totalMins: number }> = {}
    for (const row of lateArrivals) {
      if (!lateMap[row.user_id]) lateMap[row.user_id] = { name: (row.users as any)?.name || '—', count: 0, totalMins: 0 }
      lateMap[row.user_id].count++
      lateMap[row.user_id].totalMins += row.minutes_late ?? 0
    }
    const otMap: Record<string, { name: string; count: number; totalMins: number }> = {}
    for (const e of overtimeEntries) {
      if (!otMap[e.user_id]) otMap[e.user_id] = { name: (e.users as any)?.name || '—', count: 0, totalMins: 0 }
      otMap[e.user_id].count++
      otMap[e.user_id].totalMins += parseOTDuration(e.overtime_duration)
    }
    return { lateMap, otMap }
  }

  async function generateBalanceLogs() {
    setGeneratingLogs(true)
    const today = getISTDate()
    const { lateMap, otMap } = computeBalance()
    const allUids = new Set([...Object.keys(lateMap), ...Object.keys(otMap)])
    for (const uid of allUids) {
      const lateMins = lateMap[uid]?.totalMins ?? 0
      const otMins = otMap[uid]?.totalMins ?? 0
      if (lateMins === 0 && otMins === 0) continue
      const otUsed = Math.min(otMins, lateMins)
      const lateCancelled = Math.min(lateMins, otMins)
      const net = otMins - lateMins
      const note = `${today} — OT offset applied: ${fmtMins(otUsed)} OT cancelled ${fmtMins(lateCancelled)} late. Remaining: ${net < 0 ? fmtMins(Math.abs(net)) + ' late' : '0 late'} / ${net > 0 ? fmtMins(net) + ' OT' : '0 OT'}`
      await supabaseAdmin.from('attendance_balance_logs').insert({
        user_id: uid, log_date: today,
        ot_minutes_used: otUsed, late_minutes_cancelled: lateCancelled, net_minutes: net, note,
      })
    }
    await loadBalanceLogs()
    setGeneratingLogs(false)
  }

  async function handleLateCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLateImportErrs([])
    const text = await file.text()
    const lines = text.trim().split('\n').filter(l => l.trim())
    if (lines.length < 2) { setLateImportErrs(['CSV empty or missing data rows.']); e.target.value = ''; return }
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
    const nameIdx = headers.indexOf('employee_name')
    const dateIdx = headers.indexOf('date')
    const timeIdx = headers.indexOf('arrival_time')
    const reasonIdx = headers.indexOf('reason')
    if (nameIdx === -1 || dateIdx === -1 || timeIdx === -1) {
      setLateImportErrs(['CSV must have columns: employee_name, date, arrival_time, reason'])
      e.target.value = ''
      return
    }
    setLateImporting(true)
    const errs: string[] = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''))
      const name = cols[nameIdx]; const dateRaw = cols[dateIdx]; const arrivalTime = cols[timeIdx]
      const reason = reasonIdx !== -1 ? cols[reasonIdx] : ''
      if (!name || !dateRaw || !arrivalTime) { errs.push(`Row ${i + 1}: missing required fields`); continue }
      const member = team.find(m => m.name?.toLowerCase() === name.toLowerCase())
      if (!member) { errs.push(`Row ${i + 1}: employee "${name}" not found`); continue }
      const date = parseDDMMYYYY(dateRaw)
      const { error } = await supabaseAdmin.from('late_arrivals').insert({
        user_id: member.id, date, arrival_time: arrivalTime,
        minutes_late: minsLateFrom10(arrivalTime), reason: reason || null,
        pto_deduction_status: 'Pending', approved: false,
      })
      if (error) errs.push(`Row ${i + 1}: ${error.message}`)
    }
    e.target.value = ''
    await loadLate()
    setLateImporting(false)
    setLateImportErrs(errs)
  }

  async function handleOtCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setOtImportErrs([])
    const text = await file.text()
    const lines = text.trim().split('\n').filter(l => l.trim())
    if (lines.length < 2) { setOtImportErrs(['CSV empty or missing data rows.']); e.target.value = ''; return }
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
    const nameIdx = headers.indexOf('employee_name')
    const dateIdx = headers.indexOf('date')
    const startIdx = headers.indexOf('extra_hours_start')
    const endIdx = headers.indexOf('extra_hours_end')
    const reasonIdx = headers.indexOf('reason')
    if (nameIdx === -1 || dateIdx === -1 || startIdx === -1 || endIdx === -1) {
      setOtImportErrs(['CSV must have columns: employee_name, date, extra_hours_start, extra_hours_end, reason'])
      e.target.value = ''
      return
    }
    setOtImporting(true)
    const errs: string[] = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''))
      const name = cols[nameIdx]; const dateRaw = cols[dateIdx]
      const extraStart = cols[startIdx]; const extraEnd = cols[endIdx]
      const reason = reasonIdx !== -1 ? cols[reasonIdx] : ''
      if (!name || !dateRaw || !extraStart || !extraEnd) { errs.push(`Row ${i + 1}: missing required fields`); continue }
      const member = team.find(m => m.name?.toLowerCase() === name.toLowerCase())
      if (!member) { errs.push(`Row ${i + 1}: employee "${name}" not found`); continue }
      const date = parseDDMMYYYY(dateRaw)
      const overtime_duration = calcOvertimeFromExtraHours(extraStart, extraEnd)
      const { error } = await supabaseAdmin.from('overtime_entries').insert({
        user_id: member.id, date, login_time: null, logout_time: null,
        extra_hours_start: extraStart, extra_hours_end: extraEnd,
        overtime_duration, reason: reason || null, approved: false,
      })
      if (error) errs.push(`Row ${i + 1}: ${error.message}`)
    }
    e.target.value = ''
    await loadOvertime(userId, isAdmin)
    setOtImporting(false)
    setOtImportErrs(errs)
  }

  const previewOT = otForm.logout_time
    ? calcOT(otForm.logout_time, otForm.extra_hours_start, otForm.extra_hours_end)
    : null
  const previewEditOT = editingOT?.logout_time
    ? calcOT(editingOT.logout_time, editingOT.extra_hours_start ?? '', editingOT.extra_hours_end ?? '')
    : null

  if (loading) return null

  // ── Compute per-employee summaries for display ──
  const { lateMap, otMap } = computeBalance()
  const getNet = (uid: string) => (otMap[uid]?.totalMins ?? 0) - (lateMap[uid]?.totalMins ?? 0)

  const lateSummaryRows = Object.entries(lateMap)
    .map(([uid, s]) => ({ uid, ...s, net: getNet(uid) }))
    .sort((a, b) => b.totalMins - a.totalMins)

  const otSummaryRows = Object.entries(otMap)
    .map(([uid, s]) => ({ uid, ...s, net: getNet(uid) }))
    .sort((a, b) => b.totalMins - a.totalMins)

  // Per-employee per-month net late flags (fires only on/after 25th of each month)
  const todayStr2 = getISTDate()
  const todayYM = todayStr2.slice(0, 7)
  const todayDay = parseInt(todayStr2.split('-')[2])
  const lateByMonthUser: Record<string, number> = {}
  for (const row of lateArrivals) {
    const k = `${row.user_id}|${row.date.slice(0, 7)}`
    lateByMonthUser[k] = (lateByMonthUser[k] ?? 0) + (row.minutes_late ?? 0)
  }
  const otByMonthUser: Record<string, number> = {}
  for (const e of overtimeEntries) {
    const k = `${e.user_id}|${e.date.slice(0, 7)}`
    otByMonthUser[k] = (otByMonthUser[k] ?? 0) + parseOTDuration(e.overtime_duration)
  }
  const lateFlagsByUid: Record<string, 'half_day' | 'full_day'> = {}
  for (const k of Object.keys(lateByMonthUser)) {
    const [uid, month] = k.split('|')
    const canFlag = month < todayYM || (month === todayYM && todayDay >= 25)
    if (!canFlag) continue
    const netLate = (lateByMonthUser[k] ?? 0) - (otByMonthUser[k] ?? 0)
    if (netLate >= 480) lateFlagsByUid[uid] = 'full_day'
    else if (netLate >= 240 && lateFlagsByUid[uid] !== 'full_day') lateFlagsByUid[uid] = 'half_day'
  }

  const Th = ({ label }: { label: string }) => (
    <th className="px-4 py-3 text-left text-[9px] tracking-[0.2em] uppercase text-[#aaa] font-normal whitespace-nowrap">{label}</th>
  )

  const otColSpan = 10

  return (
    <main className="min-h-screen bg-[#F5F2EE]">
      <Nav isAdmin={isAdmin} />

      <div className="px-12 py-12 max-w-7xl mx-auto">
        <h2 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-2">Attendance</h2>
        <p className="text-2xl font-light tracking-wide text-[#1a1a1a] mb-8">Attendance Records</p>

        {/* Tabs */}
        <div className="flex border-b border-[#ddd] mb-10">
          {([['clock', 'Clock Log'], ['late', 'Late Arrivals'], ['overtime', 'Overtime']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-6 py-2.5 text-xs tracking-[0.2em] uppercase transition-colors cursor-pointer border-b-2 -mb-px ${
                tab === key ? 'border-[#1a1a1a] text-[#1a1a1a]' : 'border-transparent text-[#aaa] hover:text-[#1a1a1a]'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* ══ TAB 1: CLOCK LOG ══ */}
        {tab === 'clock' && (
          clockLogs.length === 0 ? (
            <p className="text-sm text-[#bbb] tracking-wider">No past clock-in entries.</p>
          ) : (
            <div className="border border-[#ddd] bg-white overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#eee]">
                    <Th label="Date" />
                    <Th label="Day" />
                    {isAdmin && <Th label="Name" />}
                    <Th label="Clock In Time" />
                    <Th label="Status" />
                    {!isAdmin && <th className="px-4 py-3 w-16" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f5f5f5]">
                  {clockLogs.map(log => (
                    <tr key={log.id} className="hover:bg-[#fafafa]">
                      <td className="px-4 py-3 text-xs text-[#888] whitespace-nowrap">{fmtDate(log.date)}</td>
                      <td className="px-4 py-3 text-xs text-[#888]">{dayAbbr(log.date)}</td>
                      {isAdmin && <td className="px-4 py-3 text-xs text-[#1a1a1a]">{(log.users as any)?.name || '—'}</td>}
                      <td className={`px-4 py-3 text-xs ${log.clock_in_time && log.clock_in_time > '10:15' ? 'text-amber-600' : 'text-[#888]'}`}>
                        {fmtTime(log.clock_in_time)}
                      </td>
                      <td className="px-4 py-3">
                        {log.clock_in_time && log.clock_in_time > '10:15' ? (
                          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 bg-amber-50 text-amber-600 border border-amber-200">Late</span>
                        ) : log.clock_in_time ? (
                          <span className="text-[9px] uppercase tracking-wider text-emerald-600">On time</span>
                        ) : null}
                      </td>
                      {!isAdmin && (
                        <td className="px-4 py-3">
                          <button
                            onClick={() => deleteClockLog(log.id)}
                            disabled={deletingClockId === log.id}
                            className="text-xs text-[#aaa] hover:text-red-500 transition-colors cursor-pointer disabled:opacity-40">
                            {deletingClockId === log.id ? '…' : 'Delete'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* ══ TAB 2: LATE ARRIVALS ══ */}
        {tab === 'late' && (
          <>
            {/* Summary bar */}
            {lateSummaryRows.length > 0 && (
              <div className="mb-6">
                <p className="text-[10px] tracking-[0.25em] uppercase text-[#888] mb-3">Late Arrivals Summary</p>
                <div className="border border-[#ddd] bg-white overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#eee] bg-[#fafafa]">
                        <Th label="Name" />
                        <Th label="Total Late Occurrences" />
                        <Th label="Total Minutes Late" />
                        <Th label="Net Late (after OT offset)" />
                        <Th label="Flag" />
                        {isAdmin && <Th label="Admin Note" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f5f5f5]">
                      {lateSummaryRows.map(row => {
                        const net = row.net
                        const flag = lateFlagsByUid[row.uid]
                        return (
                          <tr key={row.uid} className="hover:bg-[#fafafa]">
                            <td className="px-4 py-2.5 text-xs text-[#1a1a1a]">{row.name}</td>
                            <td className="px-4 py-2.5 text-xs text-[#888]">{row.count}</td>
                            <td className="px-4 py-2.5 text-xs text-amber-600">{fmtMins(row.totalMins)}</td>
                            <td className="px-4 py-2.5 text-xs">
                              {net >= 0
                                ? <span className="text-emerald-600">Clear — {fmtMins(net)} OT surplus</span>
                                : <span className="text-amber-600">{fmtMins(Math.abs(net))} remaining</span>}
                            </td>
                            <td className="px-4 py-2.5">
                              {flag === 'full_day' && <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 bg-red-50 text-red-600 border border-red-200">Full Day Deduction</span>}
                              {flag === 'half_day' && <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 bg-amber-50 text-amber-600 border border-amber-200">Half Day Deduction</span>}
                            </td>
                            {isAdmin && (
                              <td className="px-4 py-2.5">
                                <input
                                  type="text"
                                  value={adminNotes[row.uid]?.lateNote ?? ''}
                                  onChange={e => setAdminNotes(prev => ({ ...prev, [row.uid]: { ...(prev[row.uid] ?? { lateNote: '', otNote: '' }), lateNote: e.target.value } }))}
                                  onBlur={e => saveAdminNote(row.uid, 'late_note', e.target.value)}
                                  disabled={adminNoteSaving === row.uid + 'late_note'}
                                  placeholder="Admin note…"
                                  className="border border-[#ddd] bg-white px-2 py-1 text-xs text-[#1a1a1a] focus:outline-none w-36"
                                />
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Balance logs collapsible */}
                <div className="mt-4">
                  <button
                    onClick={() => setShowBalanceLogs(!showBalanceLogs)}
                    className="flex items-center gap-2 text-[10px] tracking-[0.2em] uppercase text-[#aaa] hover:text-[#1a1a1a] transition-colors cursor-pointer"
                  >
                    <span>{showBalanceLogs ? '▲' : '▼'}</span>
                    <span>Balance Logs</span>
                    {balanceLogs.length > 0 && <span className="text-[#bbb]">({balanceLogs.length})</span>}
                  </button>

                  {showBalanceLogs && (
                    <div className="mt-3 border border-[#ddd] bg-white">
                      <div className="px-5 py-3 border-b border-[#eee] flex items-center justify-between">
                        <p className="text-[10px] tracking-[0.2em] uppercase text-[#888]">OT ↔ Late offset history</p>
                        {isAdmin && (
                          <button
                            onClick={generateBalanceLogs}
                            disabled={generatingLogs}
                            className="px-4 py-1.5 border border-[#1a1a1a] text-[10px] tracking-[0.2em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40"
                          >
                            {generatingLogs ? 'Generating…' : 'Generate Balance Log'}
                          </button>
                        )}
                      </div>
                      {balanceLogs.length === 0 ? (
                        <p className="px-5 py-4 text-xs text-[#bbb] tracking-wider">No balance logs yet. Click "Generate Balance Log" to create a snapshot.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-[#eee] bg-[#fafafa]">
                                <Th label="Employee" />
                                <Th label="Date" />
                                <Th label="OT Used" />
                                <Th label="Late Cancelled" />
                                <Th label="Net" />
                                <Th label="Note" />
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#f5f5f5]">
                              {balanceLogs.map(log => (
                                <tr key={log.id} className="hover:bg-[#fafafa]">
                                  <td className="px-4 py-2.5 text-xs text-[#1a1a1a]">{(log.users as any)?.name || '—'}</td>
                                  <td className="px-4 py-2.5 text-xs text-[#888] whitespace-nowrap">{fmtDate(log.log_date)}</td>
                                  <td className="px-4 py-2.5 text-xs text-emerald-600">{fmtMins(log.ot_minutes_used)}</td>
                                  <td className="px-4 py-2.5 text-xs text-amber-600">{fmtMins(log.late_minutes_cancelled)}</td>
                                  <td className="px-4 py-2.5 text-xs">
                                    {log.net_minutes > 0
                                      ? <span className="text-emerald-600">+{fmtMins(log.net_minutes)} OT</span>
                                      : log.net_minutes < 0
                                      ? <span className="text-amber-600">{fmtMins(Math.abs(log.net_minutes))} late</span>
                                      : <span className="text-[#aaa]">Balanced</span>}
                                  </td>
                                  <td className="px-4 py-2.5 text-[10px] text-[#aaa] max-w-[280px] leading-relaxed">{log.note || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Add late + CSV import (admin only) */}
            {isAdmin && (
              <div className="border border-[#ddd] bg-white p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs tracking-[0.2em] uppercase text-[#888]">Add Late Arrival</p>
                  <label className={`cursor-pointer border border-[#ddd] px-4 py-1.5 text-[10px] tracking-[0.2em] uppercase text-[#888] hover:border-[#aaa] transition-colors ${lateImporting ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {lateImporting ? 'Importing…' : 'Import CSV'}
                    <input type="file" accept=".csv" className="hidden" onChange={handleLateCsvImport} disabled={lateImporting} />
                  </label>
                </div>
                <p className="text-[10px] text-[#bbb] tracking-wider mb-4">CSV format: employee_name, date (dd/mm/yyyy), arrival_time (HH:MM), reason</p>
                <div className="flex gap-3 flex-wrap items-end">
                  <div className="min-w-[150px]">
                    <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Employee</label>
                    <select value={addLate.user_id}
                      onChange={e => setAddLate({ ...addLate, user_id: e.target.value })}
                      className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none">
                      <option value="">Select…</option>
                      {team.map(m => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Date</label>
                    <input type="date" value={addLate.date}
                      onChange={e => setAddLate({ ...addLate, date: e.target.value })}
                      className="border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none" />
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
                      className="border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none" />
                  </div>
                  <div className="min-w-[120px] flex-1">
                    <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Reason</label>
                    <input type="text" value={addLate.reason}
                      onChange={e => setAddLate({ ...addLate, reason: e.target.value })}
                      placeholder="Optional"
                      className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none" />
                  </div>
                  <button onClick={addLateRow} disabled={addLateSaving}
                    className="px-5 py-2 border border-[#1a1a1a] text-xs tracking-[0.2em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40 shrink-0">
                    {addLateSaving ? 'Adding…' : 'Add'}
                  </button>
                </div>
                {addLateErr && <p className="text-xs text-red-400 mt-3">{addLateErr}</p>}
                {lateImportErrs.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {lateImportErrs.map((e, i) => <p key={i} className="text-xs text-red-400">{e}</p>)}
                  </div>
                )}
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
                      <Th label="Notes" />
                      <Th label="PTO Deduction Status" />
                      <th className="px-4 py-3 w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f5f5f5]">
                    {lateArrivals.map(row => (
                      <tr key={row.id} className="hover:bg-[#fafafa]">
                        <td className="px-4 py-3 text-xs text-[#888] whitespace-nowrap">{fmtDate(row.date)}</td>
                        <td className="px-4 py-3 text-xs text-[#888]">{dayAbbr(row.date)}</td>
                        <td className="px-4 py-3 text-xs text-[#1a1a1a]">{(row.users as any)?.name || '—'}</td>
                        <td className="px-4 py-3 text-xs text-amber-600 font-medium whitespace-nowrap">{fmtTime(row.arrival_time)}</td>
                        <td className="px-4 py-3 text-xs text-[#888]">{row.minutes_late ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-[#888]">{row.reason || '—'}</td>
                        <td className="px-4 py-3">
                          {isAdmin ? (
                            <input
                              type="text"
                              value={lateNotesEdit[row.id] ?? ''}
                              onChange={e => setLateNotesEdit(prev => ({ ...prev, [row.id]: e.target.value }))}
                              onBlur={() => saveLateNotes(row.id)}
                              placeholder="Add note…"
                              className="border border-[#ddd] bg-white px-2 py-1 text-xs text-[#1a1a1a] focus:outline-none w-36"
                            />
                          ) : (
                            <span className="text-xs text-[#888]">{row.notes || '—'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isAdmin ? (
                            <select value={row.pto_deduction_status}
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
                          {(isAdmin || row.user_id === userId) && (
                            <button
                              onClick={() => deleteLateRow(row.id)}
                              disabled={deletingLateId === row.id}
                              className="text-xs text-[#aaa] hover:text-red-500 transition-colors cursor-pointer disabled:opacity-40">
                              {deletingLateId === row.id ? '…' : 'Delete'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ══ TAB 3: OVERTIME ══ */}
        {tab === 'overtime' && (
          <>
            {/* Summary bar */}
            {otSummaryRows.length > 0 && (
              <div className="mb-6">
                <p className="text-[10px] tracking-[0.25em] uppercase text-[#888] mb-3">Overtime Summary</p>
                <div className="border border-[#ddd] bg-white overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#eee] bg-[#fafafa]">
                        <Th label="Name" />
                        <Th label="Total OT Occurrences" />
                        <Th label="Total OT Hours" />
                        <Th label="Net OT (after late offset)" />
                        {isAdmin && <Th label="Admin Note" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f5f5f5]">
                      {otSummaryRows.map(row => {
                        const net = row.net
                        return (
                          <tr key={row.uid} className="hover:bg-[#fafafa]">
                            <td className="px-4 py-2.5 text-xs text-[#1a1a1a]">{row.name}</td>
                            <td className="px-4 py-2.5 text-xs text-[#888]">{row.count}</td>
                            <td className="px-4 py-2.5 text-xs text-emerald-600">{fmtMins(row.totalMins)}</td>
                            <td className="px-4 py-2.5 text-xs">
                              {net > 0
                                ? <span className="text-emerald-600">{fmtMins(net)} surplus</span>
                                : net < 0
                                ? <span className="text-amber-600">Used — {fmtMins(Math.abs(net))} late outstanding</span>
                                : <span className="text-[#aaa]">Balanced</span>}
                            </td>
                            {isAdmin && (
                              <td className="px-4 py-2.5">
                                <input
                                  type="text"
                                  value={adminNotes[row.uid]?.otNote ?? ''}
                                  onChange={e => setAdminNotes(prev => ({ ...prev, [row.uid]: { ...(prev[row.uid] ?? { lateNote: '', otNote: '' }), otNote: e.target.value } }))}
                                  onBlur={e => saveAdminNote(row.uid, 'ot_note', e.target.value)}
                                  disabled={adminNoteSaving === row.uid + 'ot_note'}
                                  placeholder="Admin note…"
                                  className="border border-[#ddd] bg-white px-2 py-1 text-xs text-[#1a1a1a] focus:outline-none w-36"
                                />
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Submit form */}
            <div className="border border-[#ddd] bg-white p-6 mb-8">
              <div className="flex items-center justify-between mb-5">
                <p className="text-xs tracking-[0.2em] uppercase text-[#888]">Log Overtime</p>
                {isAdmin && (
                  <label className={`cursor-pointer border border-[#ddd] px-4 py-1.5 text-[10px] tracking-[0.2em] uppercase text-[#888] hover:border-[#aaa] transition-colors ${otImporting ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {otImporting ? 'Importing…' : 'Import CSV'}
                    <input type="file" accept=".csv" className="hidden" onChange={handleOtCsvImport} disabled={otImporting} />
                  </label>
                )}
              </div>
              {isAdmin && (
                <p className="text-[10px] text-[#bbb] tracking-wider mb-4">CSV format: employee_name, date (dd/mm/yyyy), extra_hours_start (HH:MM), extra_hours_end (HH:MM), reason</p>
              )}
              {otImportErrs.length > 0 && (
                <div className="mb-4 space-y-1">
                  {otImportErrs.map((e, i) => <p key={i} className="text-xs text-red-400">{e}</p>)}
                </div>
              )}

              <div className="grid grid-cols-6 gap-4 mb-4">
                <div className="col-span-2">
                  <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Date</label>
                  <input type="date" value={otForm.date}
                    onChange={e => setOtForm({ ...otForm, date: e.target.value })}
                    className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Day</label>
                  <div className="border border-[#eee] bg-[#f8f6f3] px-3 py-2 text-xs text-[#888] h-[33px]">
                    {otForm.date ? dayFull(otForm.date) : '—'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-6 gap-4 mb-4">
                <div className="col-span-2">
                  <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Login Time</label>
                  <input type="time" value={otForm.login_time}
                    onChange={e => setOtForm({ ...otForm, login_time: e.target.value })}
                    className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Logout Time</label>
                  <input type="time" value={otForm.logout_time}
                    onChange={e => setOtForm({ ...otForm, logout_time: e.target.value })}
                    className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Overtime (auto)</label>
                  <div className="border border-[#eee] bg-[#f8f6f3] px-3 py-2 text-xs text-[#1a1a1a] font-medium h-[33px]">
                    {previewOT ?? '—'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-6 gap-4 mb-4">
                <div className="col-span-2">
                  <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Extra Hours — Start</label>
                  <input type="time" value={otForm.extra_hours_start}
                    onChange={e => setOtForm({ ...otForm, extra_hours_start: e.target.value })}
                    className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Extra Hours — End</label>
                  <input type="time" value={otForm.extra_hours_end}
                    onChange={e => setOtForm({ ...otForm, extra_hours_end: e.target.value })}
                    className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none" />
                </div>
                {otForm.extra_hours_start && otForm.extra_hours_end && (
                  <div className="col-span-2 flex items-end pb-2">
                    <span className="text-[10px] text-[#888]">{fmtTime(otForm.extra_hours_start)} – {fmtTime(otForm.extra_hours_end)}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Reason</label>
                  <input type="text" value={otForm.reason}
                    onChange={e => setOtForm({ ...otForm, reason: e.target.value })}
                    placeholder="Why overtime?"
                    className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block mb-1">Notes / Compensation</label>
                  <input type="text" value={otForm.compensated_by}
                    onChange={e => setOtForm({ ...otForm, compensated_by: e.target.value })}
                    placeholder="e.g. Early leave on 7 May"
                    className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none" />
                </div>
              </div>

              {otErr && <p className="text-xs text-red-400 mb-3">{otErr}</p>}
              <button onClick={submitOvertime}
                disabled={otSaving || !otForm.date || !otForm.login_time || !otForm.logout_time}
                className="px-8 py-2 border border-[#1a1a1a] text-xs tracking-[0.2em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40">
                {otSaving ? 'Submitting…' : 'Submit Overtime'}
              </button>
            </div>

            {/* Overtime table grouped by month */}
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
                              {isAdmin && <Th label="Name" />}
                              <Th label="Login" />
                              <Th label="Logout" />
                              <Th label="Overtime" />
                              <Th label="Extra Hours" />
                              <Th label="Reason" />
                              <Th label="Notes" />
                              <Th label="Status" />
                              <th className="px-4 py-3 w-28" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#f5f5f5]">
                            {entries.map(e => (
                              editingOT?.id === e.id ? (
                                <tr key={e.id} className="bg-[#fafafa]">
                                  <td colSpan={otColSpan} className="px-4 py-4">
                                    <div className="grid grid-cols-4 gap-3 mb-3">
                                      <div>
                                        <label className="text-[9px] uppercase tracking-wider text-[#aaa] block mb-1">Date</label>
                                        <input type="date" value={editingOT.date}
                                          onChange={ev => setEditingOT({ ...editingOT, date: ev.target.value })}
                                          className="w-full border border-[#ddd] bg-white px-2 py-1.5 text-xs text-[#1a1a1a] focus:outline-none" />
                                      </div>
                                      <div>
                                        <label className="text-[9px] uppercase tracking-wider text-[#aaa] block mb-1">Login</label>
                                        <input type="time" value={editingOT.login_time}
                                          onChange={ev => setEditingOT({ ...editingOT, login_time: ev.target.value })}
                                          className="w-full border border-[#ddd] bg-white px-2 py-1.5 text-xs text-[#1a1a1a] focus:outline-none" />
                                      </div>
                                      <div>
                                        <label className="text-[9px] uppercase tracking-wider text-[#aaa] block mb-1">Logout</label>
                                        <input type="time" value={editingOT.logout_time}
                                          onChange={ev => setEditingOT({ ...editingOT, logout_time: ev.target.value })}
                                          className="w-full border border-[#ddd] bg-white px-2 py-1.5 text-xs text-[#1a1a1a] focus:outline-none" />
                                      </div>
                                      <div>
                                        <label className="text-[9px] uppercase tracking-wider text-[#aaa] block mb-1">Overtime (auto)</label>
                                        <div className="border border-[#eee] bg-[#f8f6f3] px-2 py-1.5 text-xs text-[#1a1a1a] h-[29px]">
                                          {previewEditOT ?? '—'}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-4 gap-3 mb-3">
                                      <div>
                                        <label className="text-[9px] uppercase tracking-wider text-[#aaa] block mb-1">Extra Hours Start</label>
                                        <input type="time" value={editingOT.extra_hours_start}
                                          onChange={ev => setEditingOT({ ...editingOT, extra_hours_start: ev.target.value })}
                                          className="w-full border border-[#ddd] bg-white px-2 py-1.5 text-xs text-[#1a1a1a] focus:outline-none" />
                                      </div>
                                      <div>
                                        <label className="text-[9px] uppercase tracking-wider text-[#aaa] block mb-1">Extra Hours End</label>
                                        <input type="time" value={editingOT.extra_hours_end}
                                          onChange={ev => setEditingOT({ ...editingOT, extra_hours_end: ev.target.value })}
                                          className="w-full border border-[#ddd] bg-white px-2 py-1.5 text-xs text-[#1a1a1a] focus:outline-none" />
                                      </div>
                                      <div>
                                        <label className="text-[9px] uppercase tracking-wider text-[#aaa] block mb-1">Reason</label>
                                        <input type="text" value={editingOT.reason}
                                          onChange={ev => setEditingOT({ ...editingOT, reason: ev.target.value })}
                                          className="w-full border border-[#ddd] bg-white px-2 py-1.5 text-xs text-[#1a1a1a] focus:outline-none" />
                                      </div>
                                      <div>
                                        <label className="text-[9px] uppercase tracking-wider text-[#aaa] block mb-1">Notes</label>
                                        <input type="text" value={editingOT.compensated_by}
                                          onChange={ev => setEditingOT({ ...editingOT, compensated_by: ev.target.value })}
                                          className="w-full border border-[#ddd] bg-white px-2 py-1.5 text-xs text-[#1a1a1a] focus:outline-none" />
                                      </div>
                                    </div>
                                    {editOTErr && <p className="text-xs text-red-400 mb-2">{editOTErr}</p>}
                                    <div className="flex gap-2">
                                      <button onClick={saveModifyOT} disabled={editOTSaving}
                                        className="px-4 py-1.5 border border-[#1a1a1a] text-xs tracking-wider uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40">
                                        {editOTSaving ? '…' : 'Save'}
                                      </button>
                                      <button onClick={() => { setEditingOT(null); setEditOTErr('') }}
                                        className="px-4 py-1.5 border border-[#ddd] text-xs uppercase text-[#888] hover:text-[#1a1a1a] cursor-pointer">
                                        Cancel
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ) : (
                                <tr key={e.id} className={`hover:bg-[#fafafa] ${e.approved ? 'bg-emerald-50/40' : ''}`}>
                                  <td className="px-4 py-3 text-xs text-[#888] whitespace-nowrap">{fmtDate(e.date)}</td>
                                  <td className="px-4 py-3 text-xs text-[#888]">{dayAbbr(e.date)}</td>
                                  {isAdmin && <td className="px-4 py-3 text-xs text-[#1a1a1a]">{(e.users as any)?.name || '—'}</td>}
                                  <td className="px-4 py-3 text-xs text-[#888] whitespace-nowrap">{fmtTime(e.login_time)}</td>
                                  <td className="px-4 py-3 text-xs text-[#888] whitespace-nowrap">{fmtTime(e.logout_time)}</td>
                                  <td className="px-4 py-3 text-xs text-[#1a1a1a] font-medium whitespace-nowrap">{e.overtime_duration || '—'}</td>
                                  <td className="px-4 py-3 text-xs text-[#888] whitespace-nowrap">
                                    {e.extra_hours_start && e.extra_hours_end
                                      ? `${fmtTime(e.extra_hours_start)} – ${fmtTime(e.extra_hours_end)}` : '—'}
                                  </td>
                                  <td className="px-4 py-3 text-xs text-[#888] max-w-[120px]">{e.reason || '—'}</td>
                                  <td className="px-4 py-3">
                                    <input
                                      type="text"
                                      value={otNotesEdit[e.id] ?? ''}
                                      onChange={ev => setOtNotesEdit(prev => ({ ...prev, [e.id]: ev.target.value }))}
                                      onBlur={() => saveOTNotes(e.id)}
                                      placeholder="Add note…"
                                      className="border border-[#ddd] bg-white px-2 py-1 text-xs text-[#1a1a1a] focus:outline-none w-32"
                                    />
                                  </td>
                                  <td className="px-4 py-3">
                                    {e.approved ? (
                                      <div>
                                        <span className="text-[9px] uppercase tracking-wider text-emerald-600">Approved</span>
                                        {e.approved_by && <p className="text-[9px] text-[#aaa] mt-0.5">by {e.approved_by}</p>}
                                      </div>
                                    ) : e.rejection_reason ? (
                                      <div>
                                        <span className="text-[9px] uppercase tracking-wider text-red-400">Rejected</span>
                                        <p className="text-[9px] text-red-400 italic mt-0.5 max-w-[120px]">{e.rejection_reason}</p>
                                      </div>
                                    ) : (
                                      <span className="text-[9px] uppercase tracking-wider text-amber-600">Pending</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3">
                                    {isAdmin ? (
                                      <button
                                        onClick={() => deleteOT(e.id)}
                                        disabled={deletingOTId === e.id}
                                        className="text-xs text-[#aaa] hover:text-red-500 transition-colors cursor-pointer disabled:opacity-40">
                                        {deletingOTId === e.id ? '…' : 'Delete'}
                                      </button>
                                    ) : !e.approved && !e.rejection_reason ? (
                                      <div className="flex gap-3">
                                        <button
                                          onClick={() => setEditingOT({
                                            id: e.id, date: e.date,
                                            login_time: e.login_time ?? '10:00',
                                            logout_time: e.logout_time ?? '18:00',
                                            extra_hours_start: e.extra_hours_start ?? '',
                                            extra_hours_end: e.extra_hours_end ?? '',
                                            reason: e.reason ?? '',
                                            compensated_by: e.compensated_by ?? '',
                                          })}
                                          className="text-xs text-[#aaa] hover:text-[#1a1a1a] transition-colors cursor-pointer">
                                          Modify
                                        </button>
                                        <button
                                          onClick={() => deleteOT(e.id)}
                                          disabled={deletingOTId === e.id}
                                          className="text-xs text-[#aaa] hover:text-red-500 transition-colors cursor-pointer disabled:opacity-40">
                                          {deletingOTId === e.id ? '…' : 'Delete'}
                                        </button>
                                      </div>
                                    ) : null}
                                  </td>
                                </tr>
                              )
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
