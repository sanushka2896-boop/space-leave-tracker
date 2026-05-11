'use client'
import { Suspense, useEffect, useState } from 'react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import Nav from '../components/Nav'
import type { LeaveTypeDef } from '../lib/leaveTypes'
import { isWfhEligible } from '../lib/leaveTypes'

const FALLBACK_LEAVE_TYPES: LeaveTypeDef[] = [
  { key: 'earned',      label: 'Earned Leave',     default_days: 20,   requires_docs: false, is_active: true, sort_order: 1 },
  { key: 'sick',        label: 'Sick Leave',        default_days: 7,    requires_docs: false, is_active: true, sort_order: 2 },
  { key: 'wfh',         label: 'WFH',               default_days: null, requires_docs: false, is_active: true, sort_order: 3 },
  { key: 'maternity',   label: 'Maternity Leave',   default_days: 56,   requires_docs: true,  is_active: true, sort_order: 4 },
  { key: 'miscarriage', label: 'Miscarriage Leave', default_days: 42,   requires_docs: true,  is_active: true, sort_order: 5 },
  { key: 'sabbatical',  label: 'Sabbatical',        default_days: null, requires_docs: false, is_active: true, sort_order: 6 },
]

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

function ApplyContent() {
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeDef[]>([])
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [form, setForm] = useState({ type: '', date_from: '', date_to: '', halfDay: false, reason: '', sabbaticalValue: '', sabbaticalUnit: 'weeks' })
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [userDOJ, setUserDOJ] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/'); return }
      setUser(session.user)

      const { data: dbUser } = await supabaseAdmin
        .from('users').select('id, is_admin, role, date_of_joining').eq('email', session.user.email).single()
      if (!dbUser) return

      setUserId(dbUser.id)
      setIsAdmin(dbUser.is_admin ?? false)
      setUserRole(dbUser.role ?? null)
      setUserDOJ((dbUser as any).date_of_joining ?? null)

      const [{ data: types }, { data: balRows }] = await Promise.all([
        supabaseAdmin.from('leave_types').select('key, label, default_days, requires_docs, is_active, sort_order')
          .eq('is_active', true).order('sort_order'),
        supabaseAdmin.from('leave_balances').select('leave_type, balance').eq('user_id', dbUser.id),
      ])

      const source = (types && types.length > 0) ? types : FALLBACK_LEAVE_TYPES
      const filtered = source.filter((t: LeaveTypeDef) => {
        if (t.key === 'wfh') return isWfhEligible(dbUser.role)
        return true
      }) as LeaveTypeDef[]

      setLeaveTypes(filtered)
      const typeParam = searchParams.get('type')
      const initialType = (typeParam && filtered.some((t: LeaveTypeDef) => t.key === typeParam))
        ? typeParam
        : filtered[0]?.key ?? 'earned'
      setForm(f => ({ ...f, type: initialType }))

      const balMap: Record<string, number> = {}
      for (const r of balRows ?? []) balMap[(r as any).leave_type] = (r as any).balance
      setBalances(balMap)
    })
  }, [])

  const selectedType = leaveTypes.find(t => t.key === form.type)
  const isSabbatical = form.type === 'sabbatical'
  const isMultiDay = !!(form.date_from && form.date_to && form.date_from !== form.date_to)

  // For sabbatical: convert weeks/months to days
  const sabbaticalDays = (() => {
    if (!isSabbatical || !form.sabbaticalValue) return 0
    const v = parseFloat(form.sabbaticalValue)
    if (isNaN(v) || v <= 0) return 0
    return form.sabbaticalUnit === 'weeks' ? Math.round(v * 5) : Math.round(v * 21) // work days
  })()

  const effectiveValue: number = isSabbatical
    ? sabbaticalDays
    : isMultiDay
    ? calcWorkingDays(form.date_from, form.date_to) * (form.halfDay ? 0.5 : 1)
    : form.halfDay ? 0.5 : 1

  const isSabbaticalEligible = (() => {
    if (!userDOJ) return false
    const doj = new Date(userDOJ + 'T00:00:00')
    const now = new Date()
    const months = (now.getFullYear() - doj.getFullYear()) * 12 + (now.getMonth() - doj.getMonth())
    return months >= 18
  })()

  const matAutoDays = form.type === 'maternity' ? 56 : form.type === 'miscarriage' ? 42 : null
  const matMaxDate = (matAutoDays !== null && form.date_from)
    ? (() => { const d = new Date(form.date_from + 'T00:00:00'); d.setDate(d.getDate() + matAutoDays - 1); return d.toISOString().split('T')[0] })()
    : undefined

  function handleDateChange(field: 'date_from' | 'date_to', val: string) {
    const updated = { ...form, [field]: val }
    const autoDays = form.type === 'maternity' ? 56 : form.type === 'miscarriage' ? 42 : null
    if (field === 'date_from' && autoDays !== null && val) {
      const end = new Date(val + 'T00:00:00')
      end.setDate(end.getDate() + autoDays - 1)
      updated.date_to = end.toISOString().split('T')[0]
    }
    setForm(updated)
  }

  async function handleSubmit() {
    if (!userId) { setError('Session expired. Please refresh.'); return }
    if (!form.date_from) { setError('Please select a start date.'); return }
    if (effectiveValue <= 0) { setError('Invalid duration — 0 days calculated.'); return }
    setError('')
    setSubmitting(true)

    const isSick = form.type === 'sick'
    const dateTo = isSabbatical
      ? (() => {
          // calculate end date from start + sabbaticalDays calendar days
          const d = new Date(form.date_from + 'T00:00:00')
          d.setDate(d.getDate() + (form.sabbaticalUnit === 'weeks' ? Math.round(parseFloat(form.sabbaticalValue) * 7) : Math.round(parseFloat(form.sabbaticalValue) * 30)))
          return d.toISOString().split('T')[0]
        })()
      : form.date_to || form.date_from

    const { error: insertErr } = await supabaseAdmin.from('leaves').insert({
      user_id: userId,
      type: form.type,
      date_from: form.date_from,
      date_to: dateTo,
      value: effectiveValue,
      reason: form.reason || null,
      status: isSick ? 'approved' : 'pending',
    })

    if (insertErr) { setError(insertErr.message); setSubmitting(false); return }

    // Sick leave: deduct immediately; balance CAN go negative (unpaid leave)
    if (isSick) {
      const { data: bal } = await supabaseAdmin
        .from('leave_balances').select('balance, allocated')
        .eq('user_id', userId).eq('leave_type', 'sick').maybeSingle()
      await supabaseAdmin.from('leave_balances').upsert({
        user_id: userId,
        leave_type: 'sick',
        allocated: bal?.allocated ?? 0,
        balance: (bal?.balance ?? 0) - effectiveValue,
      })
    }

    setSubmitting(false)
    setSubmitted(true)
  }

  if (!user) return null

  const currentBalance = form.type ? (balances[form.type] ?? null) : null

  return (
    <main className="min-h-screen bg-[#F5F2EE]">
      <Nav isAdmin={isAdmin} />

      <div className="px-12 py-12 max-w-2xl mx-auto">
        <h2 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-10">Apply for Leave</h2>

        {submitted ? (
          <div className="border border-[#ddd] bg-white p-10 text-center space-y-4">
            <p className="text-xs tracking-[0.3em] uppercase text-[#888]">Request Submitted</p>
            <p className="text-sm text-[#bbb]">Your leave request is pending approval.</p>
            <button onClick={() => router.push('/dashboard')}
              className="mt-4 px-10 py-3 border border-[#1a1a1a] text-xs tracking-[0.25em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#F5F2EE] transition-all duration-300 cursor-pointer">
              Back to Dashboard
            </button>
          </div>
        ) : (
          <div className="border border-[#ddd] bg-white p-10 space-y-8">

            {/* Leave Type */}
            <div>
              <label className="text-xs tracking-[0.25em] uppercase text-[#888] block mb-3">Leave Type</label>
              {leaveTypes.length === 0 ? (
                <p className="text-xs text-[#bbb]">Loading leave types…</p>
              ) : (
                <select
                  value={form.type}
                  onChange={e => setForm({ ...form, type: e.target.value, date_from: '', date_to: '', halfDay: false, sabbaticalValue: '' })}
                  className="w-full border border-[#ddd] bg-[#F5F2EE] px-4 py-3 text-xs tracking-wider uppercase text-[#1a1a1a] focus:outline-none"
                >
                  {leaveTypes.map(t => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
              )}

              {/* Remaining balance */}
              {currentBalance !== null && (
                <p className={`text-[10px] mt-2 tracking-wider ${currentBalance < 0 ? 'text-red-400' : 'text-[#aaa]'}`}>
                  {currentBalance < 0
                    ? `${Math.abs(currentBalance)} days over quota (unpaid)`
                    : `${currentBalance} days remaining`}
                </p>
              )}

              {/* Documents required note */}
              {selectedType?.requires_docs && (
                <div className="mt-3 border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-[10px] tracking-[0.15em] uppercase text-amber-700">
                    Medical documents required — submit to HR within 3 days of return
                  </p>
                </div>
              )}

              {/* Sabbatical eligibility warning */}
              {isSabbatical && !isSabbaticalEligible && (
                <div className="mt-3 border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-[10px] tracking-[0.15em] uppercase text-red-500">
                    Sabbatical requires 1.5+ years of service — you are not yet eligible
                  </p>
                </div>
              )}
            </div>

            {/* Sabbatical: duration input */}
            {isSabbatical ? (
              <div>
                <label className="text-xs tracking-[0.25em] uppercase text-[#888] block mb-3">Duration</label>
                <div className="flex gap-3">
                  <input
                    type="number" min="1" step="1"
                    value={form.sabbaticalValue}
                    onChange={e => setForm({ ...form, sabbaticalValue: e.target.value })}
                    placeholder="e.g. 4"
                    className="flex-1 border border-[#ddd] bg-[#F5F2EE] px-4 py-3 text-xs text-[#1a1a1a] focus:outline-none"
                  />
                  <select
                    value={form.sabbaticalUnit}
                    onChange={e => setForm({ ...form, sabbaticalUnit: e.target.value })}
                    className="border border-[#ddd] bg-[#F5F2EE] px-4 py-3 text-xs tracking-wider uppercase text-[#1a1a1a] focus:outline-none"
                  >
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                  </select>
                </div>
                {sabbaticalDays > 0 && (
                  <p className="text-[10px] text-[#aaa] mt-2 tracking-wider">{sabbaticalDays} working days</p>
                )}
                <div className="mt-4">
                  <label className="text-xs tracking-[0.25em] uppercase text-[#888] block mb-3">Start Date</label>
                  <input type="date" value={form.date_from}
                    onChange={e => setForm({ ...form, date_from: e.target.value })}
                    className="w-full border border-[#ddd] bg-[#F5F2EE] px-4 py-3 text-xs text-[#1a1a1a] focus:outline-none" />
                </div>
              </div>
            ) : (
              <>
                {/* Duration toggle — always visible */}
                <div>
                  <label className="text-xs tracking-[0.25em] uppercase text-[#888] block mb-3">Duration</label>
                  <div className="flex">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, halfDay: false })}
                      className={`flex-1 py-3 text-xs tracking-[0.2em] uppercase border transition-all duration-200 cursor-pointer ${!form.halfDay ? 'bg-[#1a1a1a] text-[#F5F2EE] border-[#1a1a1a]' : 'bg-white text-[#888] border-[#ddd] hover:border-[#1a1a1a] hover:text-[#1a1a1a]'}`}
                    >
                      Full Day
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, halfDay: true })}
                      className={`flex-1 py-3 text-xs tracking-[0.2em] uppercase border-t border-b border-r transition-all duration-200 cursor-pointer ${form.halfDay ? 'bg-[#1a1a1a] text-[#F5F2EE] border-[#1a1a1a]' : 'bg-white text-[#888] border-[#ddd] hover:border-[#1a1a1a] hover:text-[#1a1a1a]'}`}
                    >
                      Half Day
                    </button>
                  </div>
                </div>

                {/* Date Range */}
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-xs tracking-[0.25em] uppercase text-[#888] block mb-3">From</label>
                    <input type="date" value={form.date_from}
                      onChange={e => handleDateChange('date_from', e.target.value)}
                      className="w-full border border-[#ddd] bg-[#F5F2EE] px-4 py-3 text-xs text-[#1a1a1a] focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs tracking-[0.25em] uppercase text-[#888] block mb-3">To</label>
                    <input type="date" value={form.date_to}
                      min={form.date_from || undefined}
                      max={matMaxDate}
                      onChange={e => handleDateChange('date_to', e.target.value)}
                      className="w-full border border-[#ddd] bg-[#F5F2EE] px-4 py-3 text-xs text-[#1a1a1a] focus:outline-none" />
                  </div>
                </div>

                {/* Maternity / miscarriage auto-date info */}
                {matAutoDays !== null && form.date_from && form.date_to && (
                  <div className="border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-[10px] tracking-[0.15em] uppercase text-amber-700">
                      End date auto-set to {matAutoDays} calendar days — you may reduce it but not extend
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Deduction preview — always visible */}
            <div className="border border-[#eee] bg-[#fafaf9] px-5 py-4">
              <p className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] mb-1">Leave Deduction</p>
              {!form.date_from ? (
                <p className="text-sm font-light text-[#bbb]">Select dates to calculate duration</p>
              ) : (
                <>
                  <p className="text-sm font-light text-[#1a1a1a]">
                    {effectiveValue === 0.5
                      ? 'Half day — 0.5 days'
                      : `${effectiveValue} working day${effectiveValue !== 1 ? 's' : ''}`}
                  </p>
                  {currentBalance !== null && (
                    <p className={`text-[10px] mt-1 ${(currentBalance - effectiveValue) < 0 ? 'text-red-400' : 'text-[#bbb]'}`}>
                      Balance after: {(currentBalance - effectiveValue)} days
                      {(currentBalance - effectiveValue) < 0 ? ' (unpaid)' : ''}
                    </p>
                  )}
                  {isMultiDay && (
                    <p className="text-[10px] text-[#bbb] mt-1">Sundays excluded from count</p>
                  )}
                </>
              )}
              {form.type === 'wfh' && (
                <p className="text-[10px] text-[#aaa] mt-2">(counts as 1 day or 0.5 for half day)</p>
              )}
            </div>

            {/* Reason */}
            <div>
              <label className="text-xs tracking-[0.25em] uppercase text-[#888] block mb-3">
                Reason <span className="text-[#bbb]">(optional)</span>
              </label>
              <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
                rows={3} className="w-full border border-[#ddd] bg-[#F5F2EE] px-4 py-3 text-xs text-[#1a1a1a] focus:outline-none resize-none" />
            </div>

            {error && <p className="text-xs text-red-400 tracking-wider">{error}</p>}

            <button onClick={handleSubmit}
              disabled={submitting || !form.date_from || effectiveValue <= 0 || (isSabbatical && !isSabbaticalEligible)}
              className="w-full py-3 border border-[#1a1a1a] text-xs tracking-[0.25em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#F5F2EE] transition-all duration-300 cursor-pointer disabled:opacity-40">
              {submitting ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}

export default function ApplyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F2EE]" />}>
      <ApplyContent />
    </Suspense>
  )
}
