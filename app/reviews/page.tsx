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
}

export default function ReviewsPage() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
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

      const { data } = await supabaseAdmin
        .from('reviews')
        .select('id, date, type, created_at')
        .eq('user_id', dbUser.id)
        .order('date', { ascending: true })

      setReviews(data ?? [])
      setLoading(false)
    })
  }, [])

  const today = new Date().toISOString().split('T')[0]
  const upcoming = reviews.filter(r => r.date >= today)
  const past = reviews.filter(r => r.date < today)

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
                  {upcoming.map(r => (
                    <div key={r.id} className="px-8 py-5 flex items-center justify-between">
                      <div>
                        <p className="text-xs tracking-[0.2em] uppercase text-[#1a1a1a]">{r.type} review</p>
                        <p className="text-xs text-[#888] mt-1">{formatDate(r.date)}</p>
                      </div>
                      <span className="text-xs tracking-wider uppercase text-amber-600 bg-amber-50 px-3 py-1">
                        {daysUntil(r.date)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {past.length > 0 && (
              <div>
                <h3 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-4">Past</h3>
                <div className="border border-[#ddd] bg-white divide-y divide-[#eee]">
                  {past.reverse().map(r => (
                    <div key={r.id} className="px-8 py-5 flex items-center justify-between">
                      <div>
                        <p className="text-xs tracking-[0.2em] uppercase text-[#888]">{r.type} review</p>
                        <p className="text-xs text-[#bbb] mt-1">{formatDate(r.date)}</p>
                      </div>
                      <span className="text-xs tracking-wider uppercase text-[#bbb] bg-[#f5f5f5] px-3 py-1">
                        Completed
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
