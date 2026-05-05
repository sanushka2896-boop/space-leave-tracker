'use client'
import { useEffect, useState } from 'react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import Nav from '../components/Nav'

type Holiday = { id: string; name: string; date: string; type: string }

const HOLIDAYS_2026 = [
  { name: 'Republic Day',      date: '2026-01-26', type: 'national' },
  { name: 'Holi',              date: '2026-03-04', type: 'national' },
  { name: 'Good Friday',       date: '2026-04-03', type: 'national' },
  { name: 'Ambedkar Jayanti',  date: '2026-04-14', type: 'national' },
  { name: 'May Day',           date: '2026-05-01', type: 'national' },
  { name: 'Bakri-Eid',         date: '2026-05-27', type: 'national' },
  { name: 'Independence Day',  date: '2026-08-15', type: 'national' },
  { name: 'Raksha Bandhan',    date: '2026-08-28', type: 'national' },
  { name: 'Janmashtami',       date: '2026-09-04', type: 'national' },
  { name: 'Gandhi Jayanti',    date: '2026-10-02', type: 'national' },
  { name: 'Dussehra',          date: '2026-10-20', type: 'national' },
  { name: 'Diwali',            date: '2026-11-08', type: 'national' },
  { name: 'Christmas',         date: '2026-12-25', type: 'national' },
]

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}
function dayOfWeek(d: string) {
  return DAYS[new Date(d + 'T00:00:00').getDay()]
}
function isPast(d: string) {
  return d < new Date().toISOString().split('T')[0]
}

export default function HolidaysPage() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)

  // Add form
  const [addForm, setAddForm] = useState({ name: '', date: '', type: 'national' })
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', date: '', type: 'national' })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const router = useRouter()

  async function loadHolidays() {
    const { data } = await supabaseAdmin.from('holidays').select('*').order('date', { ascending: true })
    setHolidays(data ?? [])
    return data ?? []
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/'); return }

      const { data: dbUser } = await supabaseAdmin
        .from('users').select('id, is_admin').eq('email', session.user.email).single()

      if (!dbUser) { setLoading(false); return }

      setIsAdmin(dbUser.is_admin === true)

      const existing = await loadHolidays()

      // Auto-populate 2026 holidays if table is empty
      if (existing.length === 0) {
        console.log('[Holidays] table empty — seeding 2026 Indian national holidays')
        const { error } = await supabaseAdmin.from('holidays').insert(HOLIDAYS_2026)
        if (error) console.error('[Holidays] seed error:', error)
        else await loadHolidays()
      }

      setLoading(false)
    })
  }, [])

  async function addHoliday() {
    if (!addForm.name || !addForm.date) return
    setAddError('')
    setAddSaving(true)
    console.log('[Holidays] addHoliday:', addForm)
    const { data, error } = await supabaseAdmin.from('holidays')
      .insert({ name: addForm.name, date: addForm.date, type: addForm.type })
      .select()
    console.log('[Holidays] addHoliday result:', { data, error })
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

  if (loading) return null

  return (
    <main className="min-h-screen bg-[#F5F2EE]">
      <Nav isAdmin={isAdmin} />

      <div className="px-12 py-12 max-w-4xl mx-auto">
        <h2 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-2">Holidays</h2>
        <p className="text-2xl font-light tracking-wide text-[#1a1a1a] mb-10">Holiday Calendar 2026</p>

        {/* Admin: Add form */}
        {isAdmin && (
          <div className="border border-[#ddd] bg-white p-6 mb-10">
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
        {holidays.length === 0 ? (
          <p className="text-sm text-[#bbb] tracking-wider">No holidays added yet.</p>
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
                {holidays.map(h => (
                  editId === h.id ? (
                    /* Inline edit row */
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
                    /* Normal row */
                    <tr key={h.id} className={`hover:bg-[#fafafa] ${isPast(h.date) ? 'opacity-50' : ''}`}>
                      <td className="px-6 py-4 text-xs text-[#1a1a1a]">{h.name}</td>
                      <td className="px-6 py-4 text-xs text-[#888]">{formatDate(h.date)}</td>
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
    </main>
  )
}
