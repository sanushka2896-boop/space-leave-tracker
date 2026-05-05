'use client'
import { useEffect, useState } from 'react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import Nav from '../components/Nav'

type Review = {
  id: string
  date: string
  type: string
  created_at: string
  employee_notes: string | null
}

export default function ReviewsPage() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState('')
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [noteEdits, setNoteEdits] = useState<Record<string, string>>({})
  const [noteSaving, setNoteSaving] = useState<Record<string, boolean>>({})
  const [noteSaved, setNoteSaved] = useState<Record<string, boolean>>({})
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/'); return }

      const { data: dbUser } = await supabaseAdmin
        .from('users')
        .select('id, is_admin')
        .eq('email', session.user.email)
        .single()

      if (!dbUser) { setLoading(false); return }

      setIsAdmin(dbUser.is_admin ?? false)
      setUserId(dbUser.id)

      const { data } = await supabaseAdmin
        .from('reviews')
        .select('id, date, type, created_at, employee_notes')
        .eq('user_id', dbUser.id)
        .order('date', { ascending: true })

      const rows = data ?? []
      setReviews(rows)

      const edits: Record<string, string> = {}
      for (const r of rows) edits[r.id] = r.employee_notes || ''
      setNoteEdits(edits)

      setLoading(false)
    })
  }, [])

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

  const today = new Date().toISOString().split('T')[0]
  const upcoming = reviews.filter(r => r.date >= today)
  const past = [...reviews.filter(r => r.date < today)].reverse()

  function formatDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  function daysUntil(d: string) {
    const diff = Math.ceil((new Date(d + 'T00:00:00').getTime() - new Date().getTime()) / 86400000)
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Tomorrow'
    if (diff < 0) return `${Math.abs(diff)} days ago`
    return `In ${diff} days`
  }

  function ReviewCard({ r, isPast }: { r: Review; isPast: boolean }) {
    const isDirty = noteEdits[r.id] !== (r.employee_notes || '')
    return (
      <div key={r.id} className="px-8 py-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className={`text-xs tracking-[0.2em] uppercase ${isPast ? 'text-[#888]' : 'text-[#1a1a1a]'}`}>
              {r.type} review
            </p>
            <p className={`text-xs mt-1 ${isPast ? 'text-[#bbb]' : 'text-[#888]'}`}>{formatDate(r.date)}</p>
          </div>
          <span className={`text-xs tracking-wider uppercase px-3 py-1 ${
            isPast ? 'text-[#bbb] bg-[#f5f5f5]' : 'text-amber-600 bg-amber-50'
          }`}>
            {isPast ? 'Completed' : daysUntil(r.date)}
          </span>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] tracking-[0.2em] uppercase text-[#aaa] block">
            Your Notes
          </label>
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
  }

  if (loading) return null

  return (
    <main className="min-h-screen bg-[#F5F2EE]">
      <Nav isAdmin={isAdmin} />

      <div className="px-12 py-12 max-w-3xl mx-auto">
        <h2 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-2">Reviews</h2>
        <p className="text-2xl font-light tracking-wide text-[#1a1a1a] mb-12">Your Review Schedule</p>

        {reviews.length === 0 ? (
          <p className="text-sm text-[#bbb] tracking-wider">No reviews scheduled.</p>
        ) : (
          <div className="space-y-10">
            {upcoming.length > 0 && (
              <div>
                <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-4">Upcoming</h3>
                <div className="border border-[#ddd] bg-white divide-y divide-[#eee]">
                  {upcoming.map(r => <ReviewCard key={r.id} r={r} isPast={false} />)}
                </div>
              </div>
            )}

            {past.length > 0 && (
              <div>
                <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-4">Past</h3>
                <div className="border border-[#ddd] bg-white divide-y divide-[#eee]">
                  {past.map(r => <ReviewCard key={r.id} r={r} isPast={true} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
