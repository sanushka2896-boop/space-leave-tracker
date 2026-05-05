'use client'
import { useEffect, useState } from 'react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import Nav from '../components/Nav'

type LeaveLog = {
  id: string
  user_id: string
  type: string
  date_from: string
  date_to: string
  value: number
  reason: string | null
  status: string
  rejection_reason: string | null
  users?: { name: string; email: string } | null
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'text-amber-600 bg-amber-50',
  approved: 'text-emerald-600 bg-emerald-50',
  rejected: 'text-red-500 bg-red-50',
  cancelled: 'text-[#bbb] bg-[#f5f5f5]',
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function LogsPage() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [logs, setLogs] = useState<LeaveLog[]>([])
  const [team, setTeam] = useState<{ id: string; name: string; email: string }[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState('')
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

      const uid: string = dbUser.id
      const adminFlag: boolean = dbUser.is_admin === true

      setIsAdmin(adminFlag)

      if (adminFlag) {
        const [{ data: users }, { data: allLeaves }] = await Promise.all([
          supabaseAdmin.from('users').select('id, name, email').order('name'),
          supabaseAdmin
            .from('leaves')
            .select('*, users(name, email)')
            .order('created_at', { ascending: false }),
        ])
        setTeam(users ?? [])
        setLogs(allLeaves ?? [])
      } else {
        const { data: myLeaves } = await supabaseAdmin
          .from('leaves')
          .select('id, user_id, type, date_from, date_to, value, reason, status, rejection_reason')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
        setLogs(myLeaves ?? [])
      }

      setLoading(false)
    })
  }, [])

  async function filterByEmployee(userId: string) {
    setSelectedEmployee(userId)
    const query = supabaseAdmin
      .from('leaves')
      .select('*, users(name, email)')
      .order('created_at', { ascending: false })
    const { data } = userId ? await query.eq('user_id', userId) : await query
    setLogs(data ?? [])
  }

  if (loading) return null

  return (
    <main className="min-h-screen bg-[#F5F2EE]">
      <Nav isAdmin={isAdmin} />

      <div className="px-12 py-12 max-w-6xl mx-auto">
        <h2 className="text-xs tracking-[0.3em] uppercase text-[#888] mb-2">Leave Logs</h2>
        <div className="flex items-end justify-between mb-10">
          <p className="text-2xl font-light tracking-wide text-[#1a1a1a]">
            {isAdmin ? 'All Leave Records' : 'Your Leave History'}
          </p>
          {isAdmin && (
            <select
              value={selectedEmployee}
              onChange={e => filterByEmployee(e.target.value)}
              className="border border-[#ddd] bg-white px-4 py-2 text-xs text-[#1a1a1a] focus:outline-none"
            >
              <option value="">All Employees</option>
              {team.map(m => (
                <option key={m.id} value={m.id}>{m.name || m.email}</option>
              ))}
            </select>
          )}
        </div>

        {logs.length === 0 ? (
          <p className="text-sm text-[#bbb] tracking-wider">No leave records found.</p>
        ) : (
          <div className="border border-[#ddd] bg-white overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#eee]">
                  {isAdmin && (
                    <th className="px-6 py-3 text-left text-xs tracking-[0.2em] uppercase text-[#aaa] font-normal">Employee</th>
                  )}
                  <th className="px-6 py-3 text-left text-xs tracking-[0.2em] uppercase text-[#aaa] font-normal">Type</th>
                  <th className="px-6 py-3 text-left text-xs tracking-[0.2em] uppercase text-[#aaa] font-normal">From</th>
                  <th className="px-6 py-3 text-left text-xs tracking-[0.2em] uppercase text-[#aaa] font-normal">To</th>
                  <th className="px-6 py-3 text-left text-xs tracking-[0.2em] uppercase text-[#aaa] font-normal">Duration</th>
                  <th className="px-6 py-3 text-left text-xs tracking-[0.2em] uppercase text-[#aaa] font-normal">Status</th>
                  <th className="px-6 py-3 text-left text-xs tracking-[0.2em] uppercase text-[#aaa] font-normal">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f5f5f5]">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-[#fafafa]">
                    {isAdmin && (
                      <td className="px-6 py-4 text-xs text-[#1a1a1a]">
                        {(log.users as any)?.name || (log.users as any)?.email || '—'}
                      </td>
                    )}
                    <td className="px-6 py-4 text-xs text-[#1a1a1a] uppercase tracking-wider">{log.type}</td>
                    <td className="px-6 py-4 text-xs text-[#888]">{formatDate(log.date_from)}</td>
                    <td className="px-6 py-4 text-xs text-[#888]">{formatDate(log.date_to)}</td>
                    <td className="px-6 py-4 text-xs text-[#888]">
                      {log.value === 0.5 ? 'Half day' : `${log.value} day${log.value !== 1 ? 's' : ''}`}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs tracking-widest uppercase px-2 py-0.5 ${STATUS_STYLES[log.status] ?? 'text-[#888] bg-[#f5f5f5]'}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs max-w-xs">
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
    </main>
  )
}
