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

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState('')
  const [form, setForm] = useState({ name: '', role: '', location: '', is_bd_associate: false })
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/'); return }
      setUser(session.user)

      console.log('[profile] fetching user for email:', session.user.email)
      const { data, error: dbErr } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('email', session.user.email)
        .single()
      console.log('[profile] user data:', data, 'error:', dbErr)

      if (data) {
        setUserId(data.id)
        setIsAdmin(data.is_admin || false)
        setForm({
          name: data.name || session.user.user_metadata?.full_name || '',
          role: data.role || '',
          location: data.location || '',
          is_bd_associate: data.is_bd_associate || false,
        })
      } else {
        // Fallback: use auth metadata for name
        setForm(f => ({ ...f, name: session.user.user_metadata?.full_name || '' }))
      }
    })
  }, [])

  async function handleSave() {
    if (!userId) { setError('User record not loaded yet — please wait and try again.'); return }
    setSaving(true)
    setError('')
    setSaved(false)

    console.log('[profile] saving for userId:', userId, 'data:', form)
    const { error: updateErr } = await supabaseAdmin
      .from('users')
      .update({
        name: form.name,
        role: form.role || null,
        location: form.location || null,
        is_bd_associate: form.is_bd_associate,
      })
      .eq('id', userId)
    console.log('[profile] update error:', updateErr)

    setSaving(false)
    if (updateErr) {
      setError(updateErr.message)
    } else {
      setSaved(true)
    }
  }

  if (!user) return null

  return (
    <main className="min-h-screen bg-[#F5F2EE]">
      <Nav isAdmin={isAdmin} />

      <div className="px-12 py-12 max-w-2xl mx-auto">
        <h2 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-10">Profile</h2>

        <div className="border border-[#ddd] bg-white p-10 space-y-8">
          <div>
            <label className="text-xs tracking-[0.25em] uppercase text-[#888] block mb-3">Full Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full border border-[#ddd] bg-[#F5F2EE] px-4 py-3 text-sm text-[#1a1a1a] focus:outline-none focus:border-[#aaa]"
              placeholder="Your name"
            />
          </div>

          <div>
            <label className="text-xs tracking-[0.25em] uppercase text-[#888] block mb-3">Role</label>
            <select
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value })}
              className="w-full border border-[#ddd] bg-[#F5F2EE] px-4 py-3 text-xs tracking-wider text-[#1a1a1a] focus:outline-none"
            >
              <option value="">Select role</option>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs tracking-[0.25em] uppercase text-[#888] block mb-3">Location</label>
            <select
              value={form.location}
              onChange={e => setForm({ ...form, location: e.target.value })}
              className="w-full border border-[#ddd] bg-[#F5F2EE] px-4 py-3 text-xs tracking-wider text-[#1a1a1a] focus:outline-none"
            >
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
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 cursor-pointer focus:outline-none ${
                form.is_bd_associate ? 'bg-[#1a1a1a]' : 'bg-[#ddd]'
              }`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-200 ${
                form.is_bd_associate ? 'left-7' : 'left-1'
              }`} />
            </button>
          </div>

          {error && <p className="text-xs text-red-400 tracking-wider">{error}</p>}
          {saved && <p className="text-xs text-emerald-600 tracking-wider">Profile saved.</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 border border-[#1a1a1a] text-xs tracking-[0.25em] uppercase text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#F5F2EE] transition-all duration-300 cursor-pointer disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </div>
    </main>
  )
}
