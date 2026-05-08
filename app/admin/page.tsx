'use client'
import { useEffect, useState } from 'react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import Nav from '../components/Nav'
import type { LeaveTypeDef } from '../lib/leaveTypes'
import { getWfhAllocation } from '../lib/leaveTypes'

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
  date_of_joining?: string | null
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

  const [aForm, setAForm] = useState({ user_id: '', type: 'earned', date_from: '', date_to: '', note: '' })
  const [aSaving, setASaving] = useState(false)
  const [aError, setAError] = useState('')

  // Leave quota — 3 fixed types only
  const [qUserId, setQUserId] = useState('')
  const [qCasual, setQCasual] = useState('20')
  const [qSick, setQSick] = useState('7')
  const [qWfh, setQWfh] = useState('0')
  const [qSaving, setQSaving] = useState(false)
  const [qError, setQError] = useState('')
  const [qSuccess, setQSuccess] = useState('')

  const [wsDate, setWsDate] = useState('')
  const [wsSaving, setWsSaving] = useState(false)
  const [wsError, setWsError] = useState('')

  const [overtimeEntries, setOvertimeEntries] = useState<OvertimeEntry[]>([])
  const [otActingId, setOtActingId] = useState<string | null>(null)
  const [otRejectingId, setOtRejectingId] = useState<string | null>(null)
  const [otRejectReason, setOtRejectReason] = useState('')
  const [deletingLeaveId, setDeletingLeaveId] = useState<string | null>(null)
  const [confirmDeleteLeaveId, setConfirmDeleteLeaveId] = useState<string | null>(null)
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null)
  const [teamEditForm, setTeamEditForm] = useState({ name: '', role: '', location: '', is_admin: false })
  const [teamEditSaving, setTeamEditSaving] = useState(false)
  const [deletingOTAdminId, setDeletingOTAdminId] = useState<string | null>(null)

  // Reset All Leaves
  const [resetLeavesOpen, setResetLeavesOpen] = useState(false)
  const [resetLeavesInput, setResetLeavesInput] = useState('')
  const [resetLeavesRunning, setResetLeavesRunning] = useState(false)

  // Employee Records
  const [editingJoiningId, setEditingJoiningId] = useState<string | null>(null)
  const [joiningEditDate, setJoiningEditDate] = useState('')
  const [joiningEditSaving, setJoiningEditSaving] = useState(false)
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvErr, setCsvErr] = useState('')
  const [csvSuccess, setCsvSuccess] = useState('')

  // Holiday Manager extras
  const [hYear, setHYear] = useState(new Date().getFullYear())
  const [nhPreview, setNhPreview] = useState<{ date: string; name: string; selected: boolean }[]>([])
  const [nhSaving, setNhSaving] = useState(false)

  // Flags + deductions
  const [allLateData, setAllLateData] = useState<{ user_id: string; date: string; minutes_late: number | null; users?: { name: string } | null }[]>([])
  const [allOtData, setAllOtData] = useState<{ user_id: string; date: string; overtime_duration: string | null; users?: { name: string } | null }[]>([])
  const [attendanceDeductions, setAttendanceDeductions] = useState<{ user_id: string; month: string; flag_type: string }[]>([])
  const [flagModal, setFlagModal] = useState<{ userId: string; name: string; month: string; flagType: string; amount: number; deductDays: number } | null>(null)
  const [flagDeducting, setFlagDeducting] = useState(false)
  const [retroRunning, setRetroRunning] = useState(false)
  const [retroResult, setRetroResult] = useState('')

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
      supabaseAdmin.from('users').select('id, name, email, role, location, is_bd_associate, is_admin, date_of_joining'),
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
      await Promise.all([loadData(), loadOvertimeEntries(), loadFlagData()])
      setLoading(false)
    })
  }, [])

  async function saveQuota() {
    if (!qUserId) return
    setQError('')
    setQSuccess('')
    setQSaving(true)
    const year = new Date().getFullYear()
    const member = team.find(m => m.id === qUserId)

    const makeRow = (lt: string, newAlloc: number) => {
      const ex = member?.balances.find(b => b.leave_type === lt)
      const oldAlloc = ex?.allocated ?? newAlloc
      const newBal = (ex?.balance ?? newAlloc) + (newAlloc - oldAlloc)
      return { user_id: qUserId, leave_type: lt, allocated: newAlloc, balance: Math.max(newBal, 0), year }
    }

    const rows = [makeRow('earned', parseFloat(qCasual) || 0), makeRow('sick', parseFloat(qSick) || 0)]
    const wfhVal = parseFloat(qWfh) || 0
    if (wfhVal > 0) rows.push(makeRow('wfh', wfhVal))

    await supabaseAdmin.from('leave_balances').delete().eq('user_id', qUserId).in('leave_type', ['earned', 'sick', 'wfh'])
    const { error } = await supabaseAdmin.from('leave_balances').insert(rows)
    if (error) { setQError(error.message); setQSaving(false); return }
    setQSuccess('Saved.')
    await loadData()
    setQSaving(false)
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
      if (leave.type === 'sabbatical') {
        const fromDate = new Date(leave.date_from + 'T00:00:00')
        const toDate = new Date(leave.date_to + 'T00:00:00')
        const sabbDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86400000))
        const sabbMonths = Math.round(sabbDays / 30)
        const workedMonths = Math.max(0, 12 - sabbMonths)
        const newEarned = Math.round(20 * workedMonths / 12)
        const newSick = Math.round(7 * workedMonths / 12)
        await supabaseAdmin.from('leave_balances').delete()
          .eq('user_id', leave.user_id).in('leave_type', ['earned', 'sick'])
        await supabaseAdmin.from('leave_balances').insert([
          { user_id: leave.user_id, leave_type: 'earned', allocated: newEarned, balance: newEarned, year: new Date().getFullYear() },
          { user_id: leave.user_id, leave_type: 'sick', allocated: newSick, balance: newSick, year: new Date().getFullYear() },
        ])
      } else {
        const { data: balRows } = await supabaseAdmin
          .from('leave_balances').select('balance, allocated')
          .eq('user_id', leave.user_id).eq('leave_type', leave.type)
        const bal = (balRows ?? [])[0] ?? null
        await supabaseAdmin.from('leave_balances').delete()
          .eq('user_id', leave.user_id).eq('leave_type', leave.type)
        await supabaseAdmin.from('leave_balances').insert({
          user_id: leave.user_id,
          leave_type: leave.type,
          allocated: bal?.allocated ?? 0,
          balance: (bal?.balance ?? 0) - leave.value,
          year: new Date().getFullYear(),
        })
      }
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

  function calcWorkingDays(from: string, to: string): number {
    const start = new Date(from + 'T00:00:00')
    const end = new Date(to + 'T00:00:00')
    if (start > end) return 0
    let count = 0
    const cur = new Date(start)
    while (cur <= end) {
      if (cur.getDay() !== 0) count++ // Sundays excluded; Saturdays count
      cur.setDate(cur.getDate() + 1)
    }
    return count
  }

  async function assignLeave() {
    if (!aForm.user_id || !aForm.date_from) return
    setAError('')
    setASaving(true)
    const dateTo = aForm.date_to || aForm.date_from
    const value = calcWorkingDays(aForm.date_from, dateTo)

    const { error: insertErr } = await supabaseAdmin.from('leaves').insert({
      user_id: aForm.user_id,
      type: aForm.type,
      date_from: aForm.date_from,
      date_to: dateTo,
      value,
      status: 'approved',
      reason: aForm.note || 'Assigned by admin',
    })
    if (insertErr) { setAError(insertErr.message); setASaving(false); return }

    const { data: balRows } = await supabaseAdmin
      .from('leave_balances').select('balance, allocated')
      .eq('user_id', aForm.user_id).eq('leave_type', aForm.type)
    const bal = (balRows ?? [])[0] ?? null
    await supabaseAdmin.from('leave_balances').delete()
      .eq('user_id', aForm.user_id).eq('leave_type', aForm.type)
    await supabaseAdmin.from('leave_balances').insert({
      user_id: aForm.user_id,
      leave_type: aForm.type,
      allocated: bal?.allocated ?? 0,
      balance: (bal?.balance ?? 0) - value,
      year: new Date().getFullYear(),
    })

    setAForm({ user_id: '', type: 'earned', date_from: '', date_to: '', note: '' })
    await loadData()
    setASaving(false)
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
    setConfirmDeleteLeaveId(null)
    const leave = pendingLeaves.find(l => l.id === id)
    if (leave?.status === 'approved') {
      const { data: balRows } = await supabaseAdmin
        .from('leave_balances').select('balance, allocated')
        .eq('user_id', leave.user_id).eq('leave_type', leave.type)
      const bal = (balRows ?? [])[0] ?? null
      if (bal) {
        await supabaseAdmin.from('leave_balances').delete()
          .eq('user_id', leave.user_id).eq('leave_type', leave.type)
        await supabaseAdmin.from('leave_balances').insert({
          user_id: leave.user_id,
          leave_type: leave.type,
          allocated: bal.allocated,
          balance: bal.balance + leave.value,
          year: new Date().getFullYear(),
        })
      }
    }
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

  function calcTenure(joining: string | null | undefined): string {
    if (!joining) return '—'
    const j = new Date(joining + 'T00:00:00')
    const now = new Date()
    const totalMonths = (now.getFullYear() - j.getFullYear()) * 12 + (now.getMonth() - j.getMonth())
    if (totalMonths < 0) return '—'
    const years = Math.floor(totalMonths / 12)
    const months = totalMonths % 12
    if (years === 0 && months === 0) return '< 1 month'
    if (years === 0) return `${months}m`
    if (months === 0) return `${years}y`
    return `${years}y ${months}m`
  }

  function parseOTDurationLocal(s: string | null) {
    if (!s) return 0
    const h = parseInt(s.match(/(\d+)\s*hr/)?.[1] ?? '0')
    const m = parseInt(s.match(/(\d+)\s*min/)?.[1] ?? '0')
    return h * 60 + m
  }

  async function loadFlagData() {
    const [{ data: late }, { data: ot }, { data: deds }] = await Promise.all([
      supabaseAdmin.from('late_arrivals').select('user_id, date, minutes_late, users(name)'),
      supabaseAdmin.from('overtime_entries').select('user_id, date, overtime_duration, users(name)'),
      supabaseAdmin.from('attendance_deductions').select('user_id, month, flag_type'),
    ])
    setAllLateData((late ?? []) as unknown as typeof allLateData)
    setAllOtData((ot ?? []) as unknown as typeof allOtData)
    setAttendanceDeductions((deds ?? []) as typeof attendanceDeductions)
  }

  function computeFlags() {
    const todayStr = new Date().toISOString().split('T')[0]
    const todayYM = todayStr.slice(0, 7)
    const todayDay = parseInt(todayStr.split('-')[2])

    const lateByMonth: Record<string, { name: string; mins: number }> = {}
    for (const row of allLateData) {
      const k = `${row.user_id}|${row.date.slice(0, 7)}`
      if (!lateByMonth[k]) lateByMonth[k] = { name: (row.users as any)?.name || '—', mins: 0 }
      lateByMonth[k].mins += row.minutes_late ?? 0
    }
    const otByMonth: Record<string, number> = {}
    for (const e of allOtData) {
      const k = `${e.user_id}|${e.date.slice(0, 7)}`
      otByMonth[k] = (otByMonth[k] ?? 0) + parseOTDurationLocal(e.overtime_duration)
    }

    const flags: { userId: string; name: string; month: string; flagType: string; amount: number; deductDays: number }[] = []
    for (const [k, d] of Object.entries(lateByMonth)) {
      const [userId, month] = k.split('|')
      const canFlag = month < todayYM || (month === todayYM && todayDay >= 25)
      if (!canFlag) continue
      const resolved = attendanceDeductions.some(x => x.user_id === userId && x.month === month && (x.flag_type === 'full_day' || x.flag_type === 'half_day'))
      if (resolved) continue
      const netLate = d.mins - (otByMonth[k] ?? 0)
      if (netLate >= 480) flags.push({ userId, name: d.name, month, flagType: 'full_day', amount: netLate, deductDays: 1 })
      else if (netLate >= 240) flags.push({ userId, name: d.name, month, flagType: 'half_day', amount: netLate, deductDays: 0.5 })
    }
    return flags
  }

  async function deductLeaveForFlag(flag: { userId: string; name: string; month: string; flagType: string; deductDays: number }) {
    setFlagDeducting(true)
    if (flag.deductDays > 0) {
      const { data: bal } = await supabaseAdmin.from('leave_balances').select('balance, allocated')
        .eq('user_id', flag.userId).eq('leave_type', 'earned').maybeSingle()
      await supabaseAdmin.from('leave_balances').delete()
        .eq('user_id', flag.userId).eq('leave_type', 'earned')
      await supabaseAdmin.from('leave_balances').insert({
        user_id: flag.userId, leave_type: 'earned',
        allocated: bal?.allocated ?? 0, balance: (bal?.balance ?? 0) - flag.deductDays,
        year: new Date().getFullYear(),
      })
      await supabaseAdmin.from('leaves').insert({
        user_id: flag.userId, type: 'earned',
        date_from: flag.month + '-01', date_to: flag.month + '-01',
        value: flag.deductDays,
        reason: `Attendance deduction — ${flag.flagType === 'half_day' ? 'half day' : 'full day'} (${flag.month})`,
        status: 'approved',
      })
    }
    await supabaseAdmin.from('attendance_deductions').insert({
      user_id: flag.userId, month: flag.month, flag_type: flag.flagType,
      leave_deducted: flag.deductDays,
      note: `Flag cleared by admin — ${flag.month}`,
    })
    await loadFlagData()
    setFlagModal(null)
    setFlagDeducting(false)
  }

  function ordSuffix(n: number): string {
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return n + (s[(v - 20) % 10] || s[v] || s[0])
  }

  async function generate2026Reviews(userId: string, doj: string, clearFirst = false) {
    const TARGET = 2026
    const d = new Date(doj + 'T00:00:00')
    const dojYear = d.getFullYear()
    const fmtDt = (dt: Date) => dt.toISOString().split('T')[0]

    if (clearFirst) {
      await supabaseAdmin.from('reviews').delete()
        .eq('user_id', userId).gte('date', `${TARGET}-01-01`).lte('date', `${TARGET}-12-31`)
    }

    const toInsert: { date: string; type: string; notes: string }[] = []

    // Annual: same month+day as DOJ but in 2026
    const annualDt = new Date(TARGET, d.getMonth(), d.getDate())
    if (annualDt.getFullYear() === TARGET) {
      const yearsDiff = TARGET - dojYear
      if (yearsDiff > 0) {
        toInsert.push({ date: fmtDt(annualDt), type: 'annual', notes: `${ordSuffix(yearsDiff)} Year Review` })
      }
    }

    // Bi-annual: DOJ + 6, 18, 30, ... months — only those that land in 2026
    for (let bi = 1; bi <= 30; bi++) {
      const baDt = new Date(d)
      baDt.setMonth(baDt.getMonth() + 6 + (bi - 1) * 12)
      const baYear = baDt.getFullYear()
      if (baYear === TARGET) {
        toInsert.push({ date: fmtDt(baDt), type: 'bi-annual', notes: `${ordSuffix(bi)} Bi-Annual Review` })
      }
      if (baYear > TARGET) break
    }

    for (const row of toInsert) {
      const { data: existing } = await supabaseAdmin
        .from('reviews').select('id').eq('user_id', userId).eq('date', row.date).maybeSingle()
      if (!existing) {
        await supabaseAdmin.from('reviews').insert({ user_id: userId, ...row })
      }
    }
  }

  async function runGenerate2026Reviews() {
    setRetroRunning(true)
    let count = 0
    for (const m of team) {
      if (!m.date_of_joining) continue
      await generate2026Reviews(m.id, m.date_of_joining)
      count++
    }
    setRetroResult(`Generated 2026 reviews for ${count} employee${count !== 1 ? 's' : ''}`)
    setRetroRunning(false)
    await loadData()
  }

  async function applyProratedLeave(userId: string, doj: string) {
    const d = new Date(doj + 'T00:00:00')
    const currentYear = new Date().getFullYear()
    if (d.getFullYear() !== currentYear) return
    const monthsRemaining = 12 - d.getMonth()
    const earnedAlloc = Math.round(20 * monthsRemaining / 12)
    const sickAlloc = Math.round(7 * monthsRemaining / 12)
    await supabaseAdmin.from('leave_balances').delete()
      .eq('user_id', userId).in('leave_type', ['earned', 'sick'])
    await supabaseAdmin.from('leave_balances').insert([
      { user_id: userId, leave_type: 'earned', allocated: earnedAlloc, balance: earnedAlloc, year: currentYear },
      { user_id: userId, leave_type: 'sick', allocated: sickAlloc, balance: sickAlloc, year: currentYear },
    ])
  }

  async function saveJoiningDate(id: string) {
    setJoiningEditSaving(true)
    await supabaseAdmin.from('users').update({ date_of_joining: joiningEditDate || null }).eq('id', id)
    if (joiningEditDate) {
      await generate2026Reviews(id, joiningEditDate, true)
      await applyProratedLeave(id, joiningEditDate)
    }
    setEditingJoiningId(null)
    await loadData()
    setJoiningEditSaving(false)
  }

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvErr('')
    setCsvSuccess('')
    const text = await file.text()
    const lines = text.trim().split('\n').filter(l => l.trim())
    if (lines.length < 2) { setCsvErr('CSV is empty or has no data rows.'); e.target.value = ''; return }
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
    const nameIdx = headers.indexOf('name')
    const dateIdx = headers.indexOf('date_of_joining')
    if (nameIdx === -1 || dateIdx === -1) {
      setCsvErr('CSV must have "name" and "date_of_joining" columns.')
      e.target.value = ''
      return
    }
    setCsvImporting(true)
    let updated = 0
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''))
      const name = cols[nameIdx]
      const date = cols[dateIdx]
      if (!name || !date) continue
      const member = team.find(m => m.name?.toLowerCase() === name.toLowerCase())
      if (!member) continue
      await supabaseAdmin.from('users').update({ date_of_joining: date }).eq('id', member.id)
      updated++
    }
    e.target.value = ''
    await loadData()
    setCsvImporting(false)
    setCsvSuccess(`Updated ${updated} employee${updated !== 1 ? 's' : ''}.`)
  }

  function getNationalHolidays(year: number): { date: string; name: string }[] {
    const y = year
    return [
      { date: `${y}-01-26`, name: 'Republic Day' },
      { date: `${y}-03-17`, name: 'Holi' },
      { date: `${y}-04-14`, name: 'Dr. Ambedkar Jayanti' },
      { date: `${y}-04-18`, name: 'Good Friday' },
      { date: `${y}-05-01`, name: 'Maharashtra Day' },
      { date: `${y}-08-15`, name: 'Independence Day' },
      { date: `${y}-10-02`, name: 'Gandhi Jayanti' },
      { date: `${y}-10-24`, name: 'Dussehra' },
      { date: `${y}-11-01`, name: 'Diwali (Laxmi Puja)' },
      { date: `${y}-11-02`, name: 'Diwali (Bhai Dooj)' },
      { date: `${y}-12-25`, name: 'Christmas' },
    ]
  }

  async function handleHolidayCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setHError('')
    const text = await file.text()
    const lines = text.trim().split('\n').filter(l => l.trim())
    if (lines.length < 2) { setHError('CSV empty or missing data rows.'); e.target.value = ''; return }
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
    const dateIdx = headers.indexOf('date')
    const nameIdx = headers.indexOf('name')
    if (dateIdx === -1 || nameIdx === -1) { setHError('CSV must have "date" and "name" columns.'); e.target.value = ''; return }
    setHSaving(true)
    let added = 0
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''))
      const date = cols[dateIdx]
      const name = cols[nameIdx]
      if (!date || !name) continue
      await supabaseAdmin.from('holidays').upsert({ date, name, type: 'national' }, { onConflict: 'date' })
      added++
    }
    e.target.value = ''
    await loadData()
    setHSaving(false)
    if (added === 0) setHError('No valid rows found.')
  }

  async function saveNationalHolidays() {
    const toSave = nhPreview.filter(h => h.selected)
    if (toSave.length === 0) return
    setNhSaving(true)
    for (const h of toSave) {
      await supabaseAdmin.from('holidays').upsert({ date: h.date, name: h.name, type: 'national' }, { onConflict: 'date' })
    }
    await loadData()
    setNhPreview([])
    setNhSaving(false)
  }

  async function resetAllLeaves() {
    setResetLeavesRunning(true)
    await supabaseAdmin.from('leaves').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await loadData()
    setResetLeavesRunning(false)
    setResetLeavesOpen(false)
    setResetLeavesInput('')
  }

  if (loading) return null

  return (
    <>
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

        {/* Attendance Flags */}
        {(() => {
          const flags = computeFlags()
          if (flags.length === 0) return null
          const flagLabel = (t: string) =>
            t === 'full_day' ? 'Full Day Deduction' : 'Half Day Deduction'
          const flagCls = (t: string) =>
            t === 'full_day' ? 'text-red-600 bg-red-50 border-red-200' : 'text-amber-600 bg-amber-50 border-amber-200'
          return (
            <section>
              <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-6">
                Attendance Flags <span className="text-red-500 ml-2">({flags.length})</span>
              </h3>
              <div className="border border-[#ddd] bg-white overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#eee] bg-[#fafafa]">
                      {['Name', 'Type', 'Amount', 'Month', ''].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-[9px] tracking-[0.2em] uppercase text-[#aaa] font-normal">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f5f5f5]">
                    {flags.map((f, i) => (
                      <tr key={i} className="hover:bg-[#fafafa]">
                        <td className="px-5 py-3 text-xs text-[#1a1a1a]">{f.name}</td>
                        <td className="px-5 py-3">
                          <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 border ${flagCls(f.flagType)}`}>{flagLabel(f.flagType)}</span>
                        </td>
                        <td className="px-5 py-3 text-xs text-[#888]">{Math.round(f.amount)} mins net late</td>
                        <td className="px-5 py-3 text-xs text-[#888]">{f.month}</td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => setFlagModal({ userId: f.userId, name: f.name, month: f.month, flagType: f.flagType, amount: f.amount, deductDays: f.deductDays })}
                            className="text-xs text-[#aaa] hover:text-[#1a1a1a] transition-colors cursor-pointer">
                            {f.deductDays > 0 ? 'Deduct Leave' : 'Clear Flag'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )
        })()}

        {/* Pending Leave Requests */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs tracking-[0.3em] uppercase text-[#888]">
              Pending Requests
              {pendingLeaves.length > 0 && <span className="ml-3 text-amber-600">({pendingLeaves.length})</span>}
            </h3>
            <button
              onClick={() => { setResetLeavesOpen(true); setResetLeavesInput('') }}
              className="text-[9px] tracking-[0.2em] uppercase text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 px-3 py-1.5 transition-colors cursor-pointer">
              Reset All
            </button>
          </div>
          {resetLeavesOpen && (
            <div className="border border-red-200 bg-red-50 px-6 py-5 mb-6">
              <p className="text-xs text-red-700 mb-3 tracking-wider">
                This will permanently delete <strong>all leave records</strong> for all employees. This cannot be undone.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  type="text"
                  placeholder="Type RESET to confirm"
                  value={resetLeavesInput}
                  onChange={e => setResetLeavesInput(e.target.value)}
                  className="border border-red-300 bg-white px-3 py-1.5 text-xs text-[#1a1a1a] focus:outline-none w-48"
                />
                <button
                  onClick={resetAllLeaves}
                  disabled={resetLeavesInput !== 'RESET' || resetLeavesRunning}
                  className="px-4 py-1.5 border border-red-500 text-[9px] tracking-wider uppercase text-red-500 hover:bg-red-500 hover:text-white transition-all cursor-pointer disabled:opacity-40">
                  {resetLeavesRunning ? '…' : 'Confirm Reset'}
                </button>
                <button
                  onClick={() => { setResetLeavesOpen(false); setResetLeavesInput('') }}
                  className="text-xs text-[#aaa] hover:text-[#1a1a1a] cursor-pointer">
                  Cancel
                </button>
              </div>
            </div>
          )}
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
                    {confirmDeleteLeaveId === leave.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#888] tracking-wider">Are you sure?</span>
                        <button
                          onClick={() => deleteLeave(leave.id)}
                          disabled={deletingLeaveId === leave.id}
                          className="text-xs text-red-500 hover:text-red-700 cursor-pointer disabled:opacity-40 tracking-wider">
                          {deletingLeaveId === leave.id ? '…' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteLeaveId(null)}
                          className="text-xs text-[#aaa] hover:text-[#1a1a1a] cursor-pointer px-0.5">
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteLeaveId(leave.id)}
                        disabled={acting !== null || deletingLeaveId === leave.id}
                        className="text-xs text-[#aaa] hover:text-red-500 transition-colors cursor-pointer disabled:opacity-40"
                      >
                        Delete
                      </button>
                    )}
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
                  {['Name', 'Role', 'Location', 'Earned', 'Sick', 'WFH', ''].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs tracking-[0.2em] uppercase text-[#aaa] font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f5f5f5]">
                {team.map(m => {
                  const getBalance = (type: string) => {
                    const b = m.balances.find(b => b.leave_type === type)
                    if (!b) return <span className="text-[#bbb]">—</span>
                    return <span className={b.balance < 0 ? 'text-red-500' : 'text-[#1a1a1a]'}>{b.balance}</span>
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
                      <td className="px-6 py-4 text-xs font-light">{getBalance('earned')}</td>
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

        {/* Leave Quota Assignment + Assign Leave */}
        <section>
          <div className="grid grid-cols-2 gap-8 items-start">
          <div>
          <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-2">Leave Quota Assignment</h3>
          <p className="text-xs text-[#bbb] tracking-wider mb-6">Set annual allocation per employee. Remaining adjusts proportionally to any change in allocated.</p>
          <div className="border border-[#ddd] bg-white p-6 space-y-5">
            <div>
              <label className="text-xs tracking-[0.2em] uppercase text-[#888] block mb-1">Employee</label>
              <select
                value={qUserId}
                onChange={e => {
                  const uid = e.target.value
                  setQUserId(uid)
                  setQError('')
                  setQSuccess('')
                  if (uid) {
                    const m = team.find(x => x.id === uid)
                    const wfh = getWfhAllocation(m?.role)
                    setQCasual(String(m?.balances.find(b => b.leave_type === 'earned')?.allocated ?? 20))
                    setQSick(String(m?.balances.find(b => b.leave_type === 'sick')?.allocated ?? 7))
                    setQWfh(String(m?.balances.find(b => b.leave_type === 'wfh')?.allocated ?? wfh))
                  }
                }}
                className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none"
              >
                <option value="">Select employee</option>
                {team.map(m => <option key={m.id} value={m.id}>{m.name || m.email}{m.role ? ` — ${m.role}` : ''}</option>)}
              </select>
            </div>

            {qUserId && (() => {
              const member = team.find(m => m.id === qUserId)
              const isJunior = member?.role?.toLowerCase().includes('junior') ?? false
              const rows: { key: string; label: string; val: string; set: (v: string) => void; disabled?: boolean }[] = [
                { key: 'earned', label: 'Earned Leave', val: qCasual, set: setQCasual },
                { key: 'sick', label: 'Sick Leave', val: qSick, set: setQSick },
                { key: 'wfh', label: 'WFH Days', val: qWfh, set: setQWfh, disabled: isJunior },
              ]
              return (
                <div className="border border-[#eee]">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#eee] bg-[#fafafa]">
                        {['Leave Type', 'Allocated', 'Remaining'].map(h => (
                          <th key={h} className="px-4 py-2 text-left text-[9px] tracking-[0.2em] uppercase text-[#aaa] font-normal">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f5f5f5]">
                      {rows.map(({ key, label, val, set, disabled }) => {
                        const ex = member?.balances.find(b => b.leave_type === key)
                        const remaining = disabled ? null
                          : ex ? ex.balance + ((parseFloat(val) || 0) - ex.allocated)
                          : (parseFloat(val) || 0)
                        return (
                          <tr key={key}>
                            <td className="px-4 py-2 text-xs text-[#1a1a1a]">{label}</td>
                            <td className="px-4 py-2">
                              <input
                                type="number" min="0" step="1"
                                value={disabled ? '0' : val}
                                disabled={disabled}
                                onChange={e => set(e.target.value)}
                                className="w-20 border border-[#ddd] bg-[#F5F2EE] px-2 py-1 text-xs text-[#1a1a1a] focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed"
                              />
                            </td>
                            <td className="px-4 py-2 text-xs text-[#888]">
                              {disabled ? <span className="text-[#ccc]">—</span> : remaining}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })()}

            {qError && <p className="text-xs text-red-400">{qError}</p>}
            {qSuccess && <p className="text-xs text-emerald-600">{qSuccess}</p>}
            <button
              onClick={saveQuota}
              disabled={qSaving || !qUserId}
              className="w-full py-2 border border-[#1a1a1a] text-xs tracking-[0.25em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40"
            >
              {qSaving ? 'Saving…' : 'Save Quotas'}
            </button>
          </div>
          </div>

          {/* Assign Leave */}
          <div>
          <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-6">Assign Leave</h3>
          <div className="border border-[#ddd] bg-white p-6 space-y-4">
            <p className="text-xs text-[#bbb] tracking-wider">Saved as approved immediately. Balance deducted. Appears on employee dashboard and calendar.</p>
            <div>
              <label className="text-xs tracking-[0.2em] uppercase text-[#888] block mb-1">Employee</label>
              <select
                value={aForm.user_id}
                onChange={e => setAForm({ ...aForm, user_id: e.target.value })}
                className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none"
              >
                <option value="">Select employee</option>
                {team.map(m => <option key={m.id} value={m.id}>{m.name || m.email}{m.role ? ` — ${m.role}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs tracking-[0.2em] uppercase text-[#888] block mb-1">Leave Type</label>
              <select
                value={aForm.type}
                onChange={e => setAForm({ ...aForm, type: e.target.value })}
                className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none"
              >
                <option value="earned">Earned Leave</option>
                <option value="sick">Sick Leave</option>
                <option value="wfh">WFH</option>
                <option value="maternity">Maternity Leave</option>
                <option value="miscarriage">Miscarriage Leave</option>
                <option value="sabbatical">Sabbatical</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs tracking-[0.2em] uppercase text-[#888] block mb-1">Date From</label>
                <input
                  type="date"
                  value={aForm.date_from}
                  onChange={e => setAForm({ ...aForm, date_from: e.target.value })}
                  className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs tracking-[0.2em] uppercase text-[#888] block mb-1">Date To</label>
                <input
                  type="date"
                  value={aForm.date_to}
                  onChange={e => setAForm({ ...aForm, date_to: e.target.value })}
                  className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none"
                />
              </div>
            </div>
            {aForm.date_from && (
              <p className="text-[10px] text-[#aaa] tracking-wider">
                Duration: {calcWorkingDays(aForm.date_from, aForm.date_to || aForm.date_from)} working day{calcWorkingDays(aForm.date_from, aForm.date_to || aForm.date_from) !== 1 ? 's' : ''} (Sundays excluded)
              </p>
            )}
            <div>
              <label className="text-xs tracking-[0.2em] uppercase text-[#888] block mb-1">Note</label>
              <input
                type="text"
                placeholder="Optional note"
                value={aForm.note}
                onChange={e => setAForm({ ...aForm, note: e.target.value })}
                className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none"
              />
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
          </div>
          </div>
        </section>

        {/* Holiday Manager */}
        <section>
          <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-6">Holiday Manager</h3>

          {/* Toolbar: year selector, CSV upload, national holidays */}
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <div className="flex items-center gap-2">
              <label className="text-[10px] tracking-[0.2em] uppercase text-[#888]">Year</label>
              <select
                value={hYear}
                onChange={e => { setHYear(Number(e.target.value)); setNhPreview([]) }}
                className="border border-[#ddd] bg-[#F5F2EE] px-3 py-1.5 text-xs text-[#1a1a1a] focus:outline-none"
              >
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <label className="cursor-pointer border border-[#ddd] bg-white px-4 py-1.5 text-[10px] tracking-[0.2em] uppercase text-[#888] hover:border-[#aaa] transition-colors">
              {hSaving ? 'Uploading…' : 'CSV Upload'}
              <input type="file" accept=".csv" className="hidden" onChange={handleHolidayCsvImport} disabled={hSaving} />
            </label>
            <button
              onClick={() => {
                const list = getNationalHolidays(hYear)
                setNhPreview(list.map(h => ({ ...h, selected: true })))
              }}
              className="border border-[#ddd] bg-white px-4 py-1.5 text-[10px] tracking-[0.2em] uppercase text-[#888] hover:border-[#aaa] transition-colors cursor-pointer"
            >
              Load National Holidays
            </button>
            {hError && <p className="text-xs text-red-400">{hError}</p>}
          </div>

          {/* National holidays preview */}
          {nhPreview.length > 0 && (
            <div className="border border-[#ddd] bg-white p-6 mb-6 space-y-3">
              <p className="text-[10px] tracking-[0.2em] uppercase text-[#888] mb-3">Select holidays to import for {hYear}</p>
              <div className="grid grid-cols-2 gap-2">
                {nhPreview.map((h, i) => (
                  <label key={h.date} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={h.selected}
                      onChange={e => setNhPreview(prev => prev.map((x, j) => j === i ? { ...x, selected: e.target.checked } : x))}
                      className="accent-[#1a1a1a]"
                    />
                    <span className="text-xs text-[#1a1a1a]">{h.name}</span>
                    <span className="text-[10px] text-[#aaa]">{h.date}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={saveNationalHolidays}
                  disabled={nhSaving || nhPreview.every(h => !h.selected)}
                  className="px-6 py-2 border border-[#1a1a1a] text-xs tracking-[0.25em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40"
                >
                  {nhSaving ? 'Saving…' : `Confirm — Add ${nhPreview.filter(h => h.selected).length} Holidays`}
                </button>
                <button
                  onClick={() => setNhPreview([])}
                  className="px-4 py-2 text-xs text-[#aaa] hover:text-[#1a1a1a] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

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

        {/* Employee Records */}
        <section>
          <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-2">Employee Records</h3>
          <p className="text-xs text-[#bbb] tracking-wider mb-6">Date of joining and tenure. Import via CSV or edit inline.</p>

          <div className="flex items-center gap-4 mb-6 flex-wrap">
            <label className={`px-5 py-2 border border-[#1a1a1a] text-xs tracking-[0.2em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer ${csvImporting ? 'opacity-40 pointer-events-none' : ''}`}>
              {csvImporting ? 'Importing…' : 'Import CSV'}
              <input type="file" accept=".csv" className="hidden" onChange={handleCSVImport} disabled={csvImporting} />
            </label>
            <span className="text-[10px] text-[#aaa] tracking-wider">Columns: name, date_of_joining (YYYY-MM-DD)</span>
            {csvErr && <p className="text-xs text-red-400">{csvErr}</p>}
            {csvSuccess && <p className="text-xs text-emerald-600">{csvSuccess}</p>}
            <button
              onClick={runGenerate2026Reviews}
              disabled={retroRunning}
              className="px-5 py-2 border border-[#1a1a1a] text-xs tracking-[0.2em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40"
            >
              {retroRunning ? 'Running…' : 'Generate 2026 Reviews'}
            </button>
            {retroResult && <p className="text-xs text-emerald-600">{retroResult}</p>}
          </div>

          <div className="border border-[#ddd] bg-white overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#eee]">
                  {['Name', 'Role', 'Date of Joining', 'Time at Company', ''].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs tracking-[0.2em] uppercase text-[#aaa] font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f5f5f5]">
                {team.map(m => (
                  editingJoiningId === m.id ? (
                    <tr key={m.id} className="bg-[#fafafa]">
                      <td className="px-6 py-4 text-xs text-[#1a1a1a]">{m.name || m.email}</td>
                      <td className="px-6 py-4 text-xs text-[#888]">{m.role || '—'}</td>
                      <td className="px-6 py-4" colSpan={2}>
                        <input
                          type="date"
                          value={joiningEditDate}
                          onChange={e => setJoiningEditDate(e.target.value)}
                          className="border border-[#ddd] bg-white px-3 py-1.5 text-xs text-[#1a1a1a] focus:outline-none"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-3">
                          <button onClick={() => saveJoiningDate(m.id)} disabled={joiningEditSaving}
                            className="text-xs text-[#1a1a1a] hover:text-emerald-600 cursor-pointer disabled:opacity-40">
                            {joiningEditSaving ? '…' : 'Save'}
                          </button>
                          <button onClick={() => setEditingJoiningId(null)}
                            className="text-xs text-[#aaa] hover:text-[#1a1a1a] cursor-pointer">
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={m.id} className="hover:bg-[#fafafa]">
                      <td className="px-6 py-4 text-xs text-[#1a1a1a]">{m.name || m.email}</td>
                      <td className="px-6 py-4 text-xs text-[#888]">{m.role || '—'}</td>
                      <td className="px-6 py-4 text-xs text-[#888]">{m.date_of_joining ? formatDate(m.date_of_joining) : '—'}</td>
                      <td className="px-6 py-4 text-xs text-[#888]">{calcTenure(m.date_of_joining)}</td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => { setEditingJoiningId(m.id); setJoiningEditDate(m.date_of_joining ?? '') }}
                          className="text-xs text-[#aaa] hover:text-[#1a1a1a] transition-colors cursor-pointer">
                          Edit
                        </button>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
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

            <div className="border border-[#ddd] bg-white overflow-x-auto max-h-96 overflow-y-auto">
              {reviews.length === 0 ? (
                <p className="p-6 text-xs text-[#bbb] tracking-wider">No reviews scheduled.</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#eee]">
                      {['Name', 'Review Type', 'Label', 'Date', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[9px] tracking-[0.2em] uppercase text-[#aaa] font-normal whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f5f5f5]">
                    {reviews.map(r => (
                      <tr key={r.id} className="hover:bg-[#fafafa]">
                        <td className="px-4 py-3 text-xs text-[#1a1a1a]">{r.users?.name || r.users?.email || 'Unknown'}</td>
                        <td className="px-4 py-3 text-xs text-[#888] capitalize">{r.type}</td>
                        <td className="px-4 py-3 text-xs text-[#888]">{r.notes || '—'}</td>
                        <td className="px-4 py-3 text-xs text-[#888] whitespace-nowrap">{formatDate(r.date)}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-3">
                            <button onClick={() => startEditReview(r)}
                              className="text-xs text-[#aaa] hover:text-[#1a1a1a] transition-colors cursor-pointer">
                              Edit
                            </button>
                            <button onClick={() => deleteReview(r.id)}
                              className="text-xs text-[#aaa] hover:text-red-500 transition-colors cursor-pointer">
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>

      </div>
    </main>

    {/* Flag deduction confirm modal */}
    {flagModal && (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white border border-[#ddd] p-8 max-w-sm w-full mx-4">
          <p className="text-xs tracking-[0.25em] uppercase text-[#888] mb-4">Confirm Action</p>
          <p className="text-sm text-[#1a1a1a] mb-1">{flagModal.name}</p>
          <p className="text-xs text-[#888] mb-1">
            Flag: <span className="uppercase">{flagModal.flagType.replace('_', ' ')}</span> — {flagModal.month}
          </p>
          <p className="text-xs text-[#888] mb-6">
            {flagModal.deductDays > 0
              ? `This will deduct ${flagModal.deductDays} day${flagModal.deductDays !== 1 ? 's' : ''} from their Earned Leave balance.`
              : 'No leave deduction. This will clear the OT flag for this month.'}
          </p>
          <div className="flex gap-3">
            <button onClick={() => deductLeaveForFlag(flagModal)} disabled={flagDeducting}
              className="flex-1 py-2 border border-[#1a1a1a] text-xs tracking-[0.2em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40">
              {flagDeducting ? '…' : flagModal.deductDays > 0 ? 'Deduct & Clear' : 'Clear Flag'}
            </button>
            <button onClick={() => setFlagModal(null)} disabled={flagDeducting}
              className="px-5 py-2 border border-[#ddd] text-xs uppercase text-[#888] hover:text-[#1a1a1a] cursor-pointer disabled:opacity-40">
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
