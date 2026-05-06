'use client'
import { useEffect, useState } from 'react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import Nav from '../components/Nav'

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

export default function ApplyLeave() {
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [form, setForm] = useState({ type: 'sick', date_from: '', date_to: '', halfDay: false, reason: '' })
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/'); return }
      setUser(session.user)
      const { data: dbUser } = await supabaseAdmin
        .from('users').select('id, is_admin').eq('email', session.user.email).single()
      if (dbUser) { setUserId(dbUser.id); setIsAdmin(dbUser.is_admin ?? false) }
    })
  }, [])

  const isMultiDay = !!(form.date_from && form.date_to && form.date_from !== form.date_to)
  const effectiveValue: number = isMultiDay
    ? calcWorkingDays(form.date_from, form.date_to)
    : form.halfDay ? 0.5 : 1

  function handleDateChange(field: 'date_from' | 'date_to', val: string) {
    const updated = { ...form, [field]: val }
    const from = field === 'date_from' ? val : form.date_from
    const to = field === 'date_to' ? val : form.date_to
    if (from && to && from !== to) updated.halfDay = false
    setForm(updated)
  }

  async function handleSubmit() {
    if (!form.date_from) { setError('Please select a start date.'); return }
    if (!userId) { setError('Session expired. Please refresh.'); return }
    if (effectiveValue <= 0) { setError('Date range results in 0 working days.'); return }
    setError('')
    setSubmitting(true)

    const isSick = form.type === 'sick'
    const { error: insertErr } = await supabaseAdmin.from('leaves').insert({
      user_id: userId, type: form.type,
      date_from: form.date_from, date_to: form.date_to || form.date_from,
      value: effectiveValue, reason: form.reason || null,
      status: isSick ? 'approved' : 'pending',
    })

    if (insertErr) { setError(insertErr.message); setSubmitting(false); return }

    if (isSick) {
      const { data: bal } = await supabaseAdmin
        .from('leave_balance').select('sick_leaves').eq('user_id', userId).single()
      if (bal) await supabaseAdmin
        .from('leave_balance').update({ sick_leaves: Math.max(0, bal.sick_leaves - effectiveValue) })
        .eq('user_id', userId)
    }

    setSubmitting(false)
    setSubmitted(true)
  }

  if (!user) return null

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

            <div>
              <label className="text-xs tracking-[0.25em] uppercase text-[#888] block mb-3">Leave Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                className="w-full border border-[#ddd] bg-[#F5F2EE] px-4 py-3 text-xs tracking-wider uppercase text-[#1a1a1a] focus:outline-none">
                <option value="sick">Sick Leave</option>
                <option value="earned">Earned Leave</option>
                <option value="wfh">Work From Home</option>
              </select>
            </div>

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
                  onChange={e => handleDateChange('date_to', e.target.value)}
                  className="w-full border border-[#ddd] bg-[#F5F2EE] px-4 py-3 text-xs text-[#1a1a1a] focus:outline-none" />
              </div>
            </div>

            {/* Half-day only available for single-day leaves */}
            {!isMultiDay && form.date_from && (
              <div>
                <label className="text-xs tracking-[0.25em] uppercase text-[#888] block mb-3">Duration</label>
                <select value={form.halfDay ? '0.5' : '1'}
                  onChange={e => setForm({ ...form, halfDay: e.target.value === '0.5' })}
                  className="w-full border border-[#ddd] bg-[#F5F2EE] px-4 py-3 text-xs tracking-wider uppercase text-[#1a1a1a] focus:outline-none">
                  <option value="1">Full Day</option>
                  <option value="0.5">Half Day</option>
                </select>
              </div>
            )}

            {/* Deduction preview — shown as soon as a start date is picked */}
            {form.date_from && (
              <div className="border border-[#eee] bg-[#fafaf9] px-5 py-4">
                <p className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] mb-1">Leave Deduction</p>
                <p className="text-sm font-light text-[#1a1a1a]">
                  {effectiveValue === 0.5
                    ? 'Half day — 0.5 days'
                    : `${effectiveValue} working day${effectiveValue !== 1 ? 's' : ''}`}
                </p>
                {isMultiDay && (
                  <p className="text-[10px] text-[#bbb] mt-1">Sundays excluded from count</p>
                )}
              </div>
            )}

            <div>
              <label className="text-xs tracking-[0.25em] uppercase text-[#888] block mb-3">
                Reason <span className="text-[#bbb]">(optional)</span>
              </label>
              <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
                rows={3} className="w-full border border-[#ddd] bg-[#F5F2EE] px-4 py-3 text-xs text-[#1a1a1a] focus:outline-none resize-none" />
            </div>

            {error && <p className="text-xs text-red-400 tracking-wider">{error}</p>}

            <button onClick={handleSubmit}
              disabled={submitting || !form.date_from || effectiveValue <= 0}
              className="w-full py-3 border border-[#1a1a1a] text-xs tracking-[0.25em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#F5F2EE] transition-all duration-300 cursor-pointer disabled:opacity-40">
              {submitting ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
