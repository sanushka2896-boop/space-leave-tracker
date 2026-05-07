'use client'
import { useEffect, useState } from 'react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import Nav from '../components/Nav'

const ROLES = [
  'Strategist Sr', 'Strategist Mid', 'Strategist Junior',
  'Designer Sr', 'Designer Mid', 'Designer Junior',
  'Design Strategist Sr', 'Design Strategist Mid', 'Design Strategist Junior',
  'Creative Director', 'General Manager', 'Design & Processes Manager', 'Founder',
]
const LOCATIONS = ['Mumbai', 'Kolkata', 'Bangalore', 'Other']

type Tab = 'profile' | 'leaves' | 'logs' | 'reviews'

type Leave = {
  id: string; type: string; date_from: string; date_to: string
  value: number; reason: string | null; status: string; rejection_reason: string | null
}
type EditState = { type: string; date_from: string; date_to: string; value: string; reason: string }

type Review = {
  id: string
  date: string
  type: string
  created_at: string
  employee_notes: string | null
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'text-amber-600 bg-amber-50',
  approved: 'text-emerald-600 bg-emerald-50',
  rejected: 'text-red-500 bg-red-50',
  cancelled: 'text-[#bbb] bg-[#f5f5f5]',
}

function fmt(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtShort(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
function formatReviewDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}
function daysUntil(d: string) {
  const diff = Math.ceil((new Date(d + 'T00:00:00').getTime() - new Date().getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff < 0) return `${Math.abs(diff)} days ago`
  return `In ${diff} days`
}

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('profile')

  // Profile tab
  const [form, setForm] = useState({ name: '', role: '', location: '', is_bd_associate: false })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Leaves tab
  const [upcomingLeaves, setUpcomingLeaves] = useState<Leave[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>({ type: '', date_from: '', date_to: '', value: '1', reason: '' })
  const [leaveSaving, setLeaveSaving] = useState(false)

  // Logs tab
  const [allLeaves, setAllLeaves] = useState<Leave[]>([])

  // Reviews tab
  const [reviews, setReviews] = useState<Review[]>([])
  const [noteEdits, setNoteEdits] = useState<Record<string, string>>({})
  const [noteSaving, setNoteSaving] = useState<Record<string, boolean>>({})
  const [noteSaved, setNoteSaved] = useState<Record<string, boolean>>({})

  const router = useRouter()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get('tab') as Tab | null
    if (tab && ['profile', 'leaves', 'logs', 'reviews'].includes(tab)) setActiveTab(tab)
  }, [])

  async function loadLeaves(uid: string) {
    const today = new Date().toISOString().split('T')[0]
    const [{ data: upcoming }, { data: all }] = await Promise.all([
      supabaseAdmin.from('leaves').select('id, type, date_from, date_to, value, reason, status, rejection_reason')
        .eq('user_id', uid).in('status', ['approved', 'pending'])
        .order('date_from', { ascending: true }),
      supabaseAdmin.from('leaves').select('id, type, date_from, date_to, value, reason, status, rejection_reason')
        .eq('user_id', uid).order('created_at', { ascending: false }),
    ])
    const filtered = (upcoming ?? []).filter((l: any) =>
      l.status === 'pending' || (l.status === 'approved' && l.date_from >= today)
    )
    setUpcomingLeaves(filtered as Leave[])
    setAllLeaves((all ?? []) as Leave[])
  }

  async function loadReviews(uid: string) {
    const { data } = await supabaseAdmin
      .from('reviews')
      .select('id, date, type, created_at, employee_notes')
      .eq('user_id', uid)
      .order('date', { ascending: true })
    const rows = (data ?? []) as Review[]
    setReviews(rows)
    const edits: Record<string, string> = {}
    for (const r of rows) edits[r.id] = r.employee_notes || ''
    setNoteEdits(edits)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/'); return }
      setUser(session.user)

      const { data } = await supabaseAdmin
        .from('users').select('*').eq('email', session.user.email).single()

      if (data) {
        setUserId(data.id)
        setIsAdmin(data.is_admin || false)
        setForm({
          name: data.name || session.user.user_metadata?.full_name || '',
          role: data.role || '',
          location: data.location || '',
          is_bd_associate: data.is_bd_associate || false,
        })
        await Promise.all([loadLeaves(data.id), loadReviews(data.id)])
      }
    })
  }, [])

  async function handleSave() {
    if (!userId) { setSaveError('User record not loaded yet.'); return }
    setSaving(true); setSaveError(''); setSaved(false)
    const { error } = await supabaseAdmin.from('users').update({
      name: form.name, role: form.role || null,
      location: form.location || null, is_bd_associate: form.is_bd_associate,
    }).eq('id', userId)
    setSaving(false)
    if (error) setSaveError(error.message)
    else setSaved(true)
  }

  async function cancelLeave(id: string) {
    setLeaveSaving(true)
    const leave = upcomingLeaves.find(l => l.id === id)
    await supabaseAdmin.from('leaves').update({ status: 'cancelled' }).eq('id', id).eq('user_id', userId)
    if (leave?.status === 'approved') {
      const { data: bal } = await supabaseAdmin
        .from('leave_balances').select('balance, allocated')
        .eq('user_id', userId).eq('leave_type', leave.type).maybeSingle()
      await supabaseAdmin.from('leave_balances').upsert({
        user_id: userId,
        leave_type: leave.type,
        allocated: bal?.allocated ?? 0,
        balance: (bal?.balance ?? 0) + leave.value,
      })
    }
    await loadLeaves(userId)
    setLeaveSaving(false)
  }

  function startEdit(leave: Leave) {
    setEditingId(leave.id)
    setEditState({ type: leave.type, date_from: leave.date_from, date_to: leave.date_to, value: String(leave.value), reason: leave.reason || '' })
  }

  async function saveEdit(id: string) {
    setLeaveSaving(true)
    await supabaseAdmin.from('leaves').update({
      type: editState.type, date_from: editState.date_from, date_to: editState.date_to,
      reason: editState.reason, value: parseFloat(editState.value),
    }).eq('id', id).eq('user_id', userId)
    setEditingId(null)
    await loadLeaves(userId)
    setLeaveSaving(false)
  }

  async function saveNote(reviewId: string) {
    setNoteSaving(prev => ({ ...prev, [reviewId]: true }))
    await supabaseAdmin
      .from('reviews')
      .update({ employee_notes: noteEdits[reviewId] || null })
      .eq('id', reviewId)
      .eq('user_id', userId)
    setNoteSaving(prev => ({ ...prev, [reviewId]: false }))
    setNoteSaved(prev => ({ ...prev, [reviewId]: true }))
    setTimeout(() => setNoteSaved(prev => ({ ...prev, [reviewId]: false })), 2000)
  }

  if (!user) return null

  const todayStr = new Date().toISOString().split('T')[0]
  const reviewsUpcoming = reviews.filter(r => r.date >= todayStr)
  const reviewsPast = [...reviews.filter(r => r.date < todayStr)].reverse()

  const TAB_LABELS: { key: Tab; label: string }[] = [
    { key: 'profile', label: 'Profile' },
    { key: 'leaves',  label: 'Leaves' },
    { key: 'logs',    label: 'Logs' },
    { key: 'reviews', label: 'Reviews' },
  ]

  return (
    <main className="min-h-screen bg-[#F5F2EE]">
      <Nav isAdmin={isAdmin} />

      <div className="px-12 py-12 max-w-3xl mx-auto">
        <h2 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-2">
          {user.user_metadata?.full_name || user.email}
        </h2>
        <p className="text-2xl font-light tracking-wide text-[#1a1a1a] mb-8">My Account</p>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-[#ddd] mb-8">
          {TAB_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-6 py-3 text-xs tracking-[0.2em] uppercase transition-colors cursor-pointer border-b-2 -mb-px ${
                activeTab === key
                  ? 'border-[#1a1a1a] text-[#1a1a1a]'
                  : 'border-transparent text-[#aaa] hover:text-[#1a1a1a]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="border border-[#ddd] bg-white p-10 space-y-8">
            <div>
              <label className="text-xs tracking-[0.25em] uppercase text-[#888] block mb-3">Full Name</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full border border-[#ddd] bg-[#F5F2EE] px-4 py-3 text-sm text-[#1a1a1a] focus:outline-none focus:border-[#aaa]"
                placeholder="Your name" />
            </div>
            <div>
              <label className="text-xs tracking-[0.25em] uppercase text-[#888] block mb-3">Role</label>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
                className="w-full border border-[#ddd] bg-[#F5F2EE] px-4 py-3 text-xs tracking-wider text-[#1a1a1a] focus:outline-none">
                <option value="">Select role</option>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs tracking-[0.25em] uppercase text-[#888] block mb-3">Location</label>
              <select value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                className="w-full border border-[#ddd] bg-[#F5F2EE] px-4 py-3 text-xs tracking-wider text-[#1a1a1a] focus:outline-none">
                <option value="">Select location</option>
                {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between py-4 border-t border-[#eee]">
              <div>
                <p className="text-xs tracking-[0.25em] uppercase text-[#888]">BD Associate</p>
                <p className="text-xs text-[#bbb] mt-1">Business development role</p>
              </div>
              <button
                onClick={() => setForm({ ...form, is_bd_associate: !form.is_bd_associate })}
                className={`relative w-12 h-6 rounded-full transition-colors duration-200 cursor-pointer focus:outline-none ${form.is_bd_associate ? 'bg-[#1a1a1a]' : 'bg-[#ddd]'}`}
              >
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-200 ${form.is_bd_associate ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
            {saveError && <p className="text-xs text-red-400 tracking-wider">{saveError}</p>}
            {saved && <p className="text-xs text-emerald-600 tracking-wider">Profile saved.</p>}
            <button onClick={handleSave} disabled={saving}
              className="w-full py-3 border border-[#1a1a1a] text-xs tracking-[0.25em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#F5F2EE] transition-all cursor-pointer disabled:opacity-40">
              {saving ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        )}

        {/* Leaves Tab */}
        {activeTab === 'leaves' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <p className="text-xs text-[#888] tracking-wider">Upcoming and pending leaves</p>
              <button onClick={() => router.push('/apply')}
                className="px-6 py-2 border border-[#1a1a1a] text-xs tracking-[0.25em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#F5F2EE] transition-all cursor-pointer">
                Apply for Leave
              </button>
            </div>
            {upcomingLeaves.length === 0 ? (
              <p className="text-sm text-[#bbb] tracking-wider">No upcoming or pending leaves.</p>
            ) : (
              <div className="border border-[#ddd] bg-white divide-y divide-[#eee]">
                {upcomingLeaves.map(leave => (
                  <div key={leave.id}>
                    {editingId === leave.id ? (
                      <div className="px-8 py-6 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs tracking-[0.2em] uppercase text-[#888] block mb-1">Type</label>
                            <select value={editState.type} onChange={e => setEditState({ ...editState, type: e.target.value })}
                              className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs uppercase text-[#1a1a1a] focus:outline-none">
                              <option value="sick">Sick Leave</option>
                              <option value="earned">Earned Leave</option>
                              <option value="wfh">WFH</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs tracking-[0.2em] uppercase text-[#888] block mb-1">Duration</label>
                            <select value={editState.value} onChange={e => setEditState({ ...editState, value: e.target.value })}
                              className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs uppercase text-[#1a1a1a] focus:outline-none">
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
                          <button onClick={() => saveEdit(leave.id)} disabled={leaveSaving}
                            className="px-6 py-2 border border-[#1a1a1a] text-xs tracking-wider uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-40">Save</button>
                          <button onClick={() => setEditingId(null)}
                            className="px-6 py-2 border border-[#ddd] text-xs tracking-wider uppercase text-[#888] hover:text-[#1a1a1a] cursor-pointer">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="px-8 py-5 flex items-center justify-between">
                        <div>
                          <p className="text-xs tracking-[0.2em] uppercase text-[#1a1a1a]">{leave.type} leave</p>
                          <p className="text-xs text-[#888] mt-1">
                            {fmtShort(leave.date_from)}{leave.date_to !== leave.date_from ? ` → ${fmtShort(leave.date_to)}` : ''}
                            {' · '}{leave.value === 0.5 ? 'Half day' : `${leave.value} day${leave.value !== 1 ? 's' : ''}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          {leave.status === 'pending' && (
                            <button onClick={() => startEdit(leave)}
                              className="text-xs tracking-wider uppercase text-[#888] hover:text-[#1a1a1a] cursor-pointer">Modify</button>
                          )}
                          <button onClick={() => cancelLeave(leave.id)} disabled={leaveSaving}
                            className="text-xs tracking-wider uppercase text-[#888] hover:text-red-500 cursor-pointer disabled:opacity-40">Cancel</button>
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
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <div>
            <p className="text-xs text-[#888] tracking-wider mb-5">Full leave history — all statuses</p>
            {allLeaves.length === 0 ? (
              <p className="text-sm text-[#bbb] tracking-wider">No leave records yet.</p>
            ) : (
              <div className="border border-[#ddd] bg-white overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#eee]">
                      {['Type', 'From', 'To', 'Duration', 'Status', 'Reason'].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-xs tracking-[0.2em] uppercase text-[#aaa] font-normal">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f5f5f5]">
                    {allLeaves.map(log => (
                      <tr key={log.id} className="hover:bg-[#fafafa]">
                        <td className="px-5 py-4 text-xs text-[#1a1a1a] uppercase tracking-wider">{log.type}</td>
                        <td className="px-5 py-4 text-xs text-[#888]">{fmt(log.date_from)}</td>
                        <td className="px-5 py-4 text-xs text-[#888]">{fmt(log.date_to)}</td>
                        <td className="px-5 py-4 text-xs text-[#888]">
                          {log.value === 0.5 ? 'Half day' : `${log.value}d`}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`text-xs tracking-widest uppercase px-2 py-0.5 ${STATUS_STYLES[log.status] ?? 'text-[#888] bg-[#f5f5f5]'}`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs max-w-[180px]">
                          {log.status === 'rejected' && log.rejection_reason ? (
                            <span className="text-red-400 italic">{log.rejection_reason}</span>
                          ) : log.reason ? (
                            <span className="text-[#888]">{log.reason}</span>
                          ) : (
                            <span className="text-[#ccc]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Reviews Tab */}
        {activeTab === 'reviews' && (
          <div>
            {reviews.length === 0 ? (
              <p className="text-sm text-[#bbb] tracking-wider">No reviews scheduled.</p>
            ) : (
              <div className="space-y-10">
                {reviewsUpcoming.length > 0 && (
                  <div>
                    <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-4">Upcoming</h3>
                    <div className="border border-[#ddd] bg-white divide-y divide-[#eee]">
                      {reviewsUpcoming.map(r => {
                        const isDirty = noteEdits[r.id] !== (r.employee_notes || '')
                        return (
                          <div key={r.id} className="px-8 py-5">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <p className="text-xs tracking-[0.2em] uppercase text-[#1a1a1a]">{r.type} review</p>
                                <p className="text-xs text-[#888] mt-1">{formatReviewDate(r.date)}</p>
                              </div>
                              <span className="text-xs tracking-wider uppercase px-3 py-1 text-amber-600 bg-amber-50">
                                {daysUntil(r.date)}
                              </span>
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block">Your Notes</label>
                              <textarea
                                value={noteEdits[r.id] ?? ''}
                                onChange={e => setNoteEdits(prev => ({ ...prev, [r.id]: e.target.value }))}
                                placeholder="Add your notes from this review discussion…"
                                rows={3}
                                className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none focus:border-[#aaa] resize-none"
                              />
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => saveNote(r.id)}
                                  disabled={noteSaving[r.id] || (!isDirty && !noteSaved[r.id])}
                                  className="px-4 py-1.5 border border-[#1a1a1a] text-xs tracking-[0.2em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-30"
                                >
                                  {noteSaving[r.id] ? 'Saving…' : 'Save'}
                                </button>
                                {noteSaved[r.id] && (
                                  <span className="text-xs text-emerald-600 tracking-wider">Saved ✓</span>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                {reviewsPast.length > 0 && (
                  <div>
                    <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-4">Past</h3>
                    <div className="border border-[#ddd] bg-white divide-y divide-[#eee]">
                      {reviewsPast.map(r => {
                        const isDirty = noteEdits[r.id] !== (r.employee_notes || '')
                        return (
                          <div key={r.id} className="px-8 py-5">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <p className="text-xs tracking-[0.2em] uppercase text-[#888]">{r.type} review</p>
                                <p className="text-xs text-[#bbb] mt-1">{formatReviewDate(r.date)}</p>
                              </div>
                              <span className="text-xs tracking-wider uppercase px-3 py-1 text-[#bbb] bg-[#f5f5f5]">
                                Completed
                              </span>
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block">Your Notes</label>
                              <textarea
                                value={noteEdits[r.id] ?? ''}
                                onChange={e => setNoteEdits(prev => ({ ...prev, [r.id]: e.target.value }))}
                                placeholder="Add your notes from this review discussion…"
                                rows={3}
                                className="w-full border border-[#ddd] bg-[#F5F2EE] px-3 py-2 text-xs text-[#1a1a1a] focus:outline-none focus:border-[#aaa] resize-none"
                              />
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => saveNote(r.id)}
                                  disabled={noteSaving[r.id] || (!isDirty && !noteSaved[r.id])}
                                  className="px-4 py-1.5 border border-[#1a1a1a] text-xs tracking-[0.2em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-all cursor-pointer disabled:opacity-30"
                                >
                                  {noteSaving[r.id] ? 'Saving…' : 'Save'}
                                </button>
                                {noteSaved[r.id] && (
                                  <span className="text-xs text-emerald-600 tracking-wider">Saved ✓</span>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
