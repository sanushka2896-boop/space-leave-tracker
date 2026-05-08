'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/attendance', label: 'Attendance' },
  { href: '/profile', label: 'Profile' },
]

export default function Nav({ isAdmin = false }: { isAdmin?: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark') setDark(true)
  }, [])

  function toggleDark() {
    const next = !dark
    setDark(next)
    if (next) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }

  const links = isAdmin ? [...LINKS, { href: '/admin', label: 'Admin' }] : LINKS

  return (
    <header className="border-b border-[#ddd] px-12 py-5 flex items-center justify-between bg-white sticky top-0 z-10">
      <img src={dark ? '/logo-dark.svg' : '/logo-light.svg'} alt="The Space At 9/2" className="h-20 cursor-pointer" onClick={() => router.push('/dashboard')} />
      <nav className="flex items-center gap-10">
        {links.map(link => (
          <button
            key={link.href}
            onClick={() => router.push(link.href)}
            className={`text-xs tracking-[0.2em] uppercase transition-colors cursor-pointer ${
              pathname === link.href ? 'text-[#1a1a1a]' : 'text-[#aaa] hover:text-[#1a1a1a]'
            }`}
          >
            {link.label}
          </button>
        ))}
      </nav>
      <div className="flex items-center gap-6">
        <button
          onClick={toggleDark}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="text-[#aaa] hover:text-[#1a1a1a] transition-colors cursor-pointer"
          aria-label="Toggle dark mode"
        >
          {dark ? (
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="7.5" cy="7.5" r="2.5" fill="currentColor"/>
              <line x1="7.5" y1="0.5" x2="7.5" y2="2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <line x1="7.5" y1="12.5" x2="7.5" y2="14.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <line x1="0.5" y1="7.5" x2="2.5" y2="7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <line x1="12.5" y1="7.5" x2="14.5" y2="7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <line x1="2.7" y1="2.7" x2="4.1" y2="4.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <line x1="10.9" y1="10.9" x2="12.3" y2="12.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <line x1="12.3" y1="2.7" x2="10.9" y2="4.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <line x1="4.1" y1="10.9" x2="2.7" y2="12.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 7.5A5.5 5.5 0 0 1 4.5 2 5.5 5.5 0 1 0 12 7.5z" fill="currentColor"/>
            </svg>
          )}
        </button>
        <button
          onClick={async () => { await supabase.auth.signOut(); router.push('/') }}
          className="text-xs tracking-widest uppercase text-[#aaa] hover:text-[#1a1a1a] transition-colors cursor-pointer"
        >
          Sign Out
        </button>
      </div>
    </header>
  )
}
